/** 渔具与鱼饵（纯函数，便于测试） */
import { mergeEffects } from "./Titles.js"

export const SLOTS = ["rod", "line", "float", "net"]
export const UPGRADE_NAMES = { 鱼竿: "rod", 鱼线: "line", 浮漂: "float", 鱼护: "net" }
export const LEVEL_COLORS = ["#9aa5b1", "#3bb273", "#3a8dde", "#a259ff", "#f2a900"]
export const LEVEL_LABELS = ["普通", "优良", "稀有", "史诗", "传说"]

/* ---------------- 渔具 ---------------- */

/** 当前等级（1 起） */
export function gearLevel(user, slot) {
  return Math.max(1, Number(user.gear?.[slot]) || 1)
}

/** 某个等级的渔具信息，附带 level / slot */
export function gearItem(shop, slot, level) {
  const def = shop?.gear?.[slot]
  const item = def?.levels?.[level - 1]
  return item ? { ...item, level, slot, slotName: def.name, emoji: def.emoji } : null
}

export const maxLevel = (shop, slot) => shop?.gear?.[slot]?.levels?.length || 1

/** 所有已装备渔具的效果之和 */
export function gearEffects(user, shop) {
  return mergeEffects(...SLOTS.map(s => gearItem(shop, s, gearLevel(user, s))?.effects))
}

/** 鱼护容量：Lv1 取 config 的 bagLimit，其余取 shop.yaml 的 capacity */
export function bagCapacity(user, shop, baseLimit = 200) {
  const lv = gearLevel(user, "net")
  if (lv <= 1) return Number(baseLimit) || 200
  return Number(gearItem(shop, "net", lv)?.capacity) || Number(baseLimit) || 200
}

/**
 * 升级到下一级
 * @returns {{ ok:true, item, cost } | { ok:false, reason:"max"|"gold", next?, cost? }}
 */
export function upgradeGear(user, shop, slot) {
  const lv = gearLevel(user, slot)
  const next = gearItem(shop, slot, lv + 1)
  if (!next) return { ok: false, reason: "max", current: gearItem(shop, slot, lv) }
  const cost = Math.max(0, Number(next.price) || 0)
  if (user.gold < cost) return { ok: false, reason: "gold", next, cost }
  user.gold -= cost
  user.gear = { ...(user.gear || {}), [slot]: lv + 1 }
  user.stats.gearSpent = (user.stats.gearSpent || 0) + cost
  return { ok: true, item: next, cost }
}

/* ---------------- 鱼饵 ---------------- */

export const baitList = shop => shop?.baits || []

export function baitDef(shop, id) {
  return baitList(shop).find(b => b.id === id) || null
}

/** 按名称或 id 查找鱼饵；“鱼饵/普通”等指普通饵 */
export function findBait(shop, keyword) {
  keyword = String(keyword || "").trim()
  if (!keyword || /^(鱼饵|普通|普通鱼饵)$/.test(keyword)) return baitDef(shop, "basic")
  return baitList(shop).find(b => b.name === keyword || b.id === keyword) ||
    baitList(shop).find(b => b.name.includes(keyword)) || null
}

/** 鱼饵单价：普通饵取 config 的 bait.price */
export function baitPrice(shop, id, basicPrice = 2) {
  if (id === "basic") return Math.max(0, Number(basicPrice) || 0)
  return Math.max(0, Number(baitDef(shop, id)?.price) || 0)
}

export const baitCount = (user, id) => Math.max(0, Number(user.baits?.[id]) || 0)

export const totalBait = user => Object.values(user.baits || {}).reduce((s, n) => s + Math.max(0, Number(n) || 0), 0)

export function addBait(user, id, n) {
  user.baits ||= {}
  user.baits[id] = baitCount(user, id) + Math.max(0, Math.floor(Number(n) || 0))
  return user.baits[id]
}

/** 当前使用的鱼饵（不存在时为普通饵） */
export function currentBait(user, shop) {
  return baitDef(shop, user.baitUse) || baitDef(shop, "basic") || { id: "basic", name: "普通饵", emoji: "🥣", effects: {} }
}

/**
 * 抛竿消耗 1 个鱼饵：当前鱼饵用完时自动换成有库存的鱼饵（普通饵优先，其次按商店顺序）
 * @returns {{ bait, switched:boolean, from? } | null} 没有任何鱼饵时返回 null
 */
export function consumeBait(user, shop) {
  const cur = currentBait(user, shop)
  let bait = cur
  if (baitCount(user, cur.id) < 1) {
    const order = ["basic", ...baitList(shop).map(b => b.id).filter(id => id !== "basic")]
    const id = order.find(i => baitCount(user, i) > 0)
    if (!id) return null
    bait = baitDef(shop, id) || { id, name: id, effects: {} }
    user.baitUse = id
  }
  user.baits[bait.id]--
  return { bait, switched: bait.id !== cur.id, from: cur }
}

/** 切换鱼饵（必须有库存） */
export function useBait(user, shop, id) {
  const b = baitDef(shop, id)
  if (!b) return { ok: false, reason: "unknown" }
  if (baitCount(user, id) < 1) return { ok: false, reason: "empty", bait: b }
  user.baitUse = id
  return { ok: true, bait: b }
}

/** 购买鱼饵 */
export function buyBait(user, shop, id, count, basicPrice = 2) {
  count = Math.floor(Number(count) || 0)
  const bait = baitDef(shop, id)
  if (!bait) return { ok: false, reason: "unknown" }
  if (count < 1) return { ok: false, reason: "count" }
  const price = baitPrice(shop, id, basicPrice)
  const cost = count * price
  if (user.gold < cost) return { ok: false, reason: "gold", bait, cost, afford: price ? Math.floor(user.gold / price) : count }
  user.gold -= cost
  addBait(user, id, count)
  user.stats.baitBought = (user.stats.baitBought || 0) + count
  user.stats.baitSpent = (user.stats.baitSpent || 0) + cost
  return { ok: true, bait, count, cost }
}

/* ---------------- 断线 ---------------- */

/** 本次收杆的断线概率（%） */
export function breakChance(result, lineBreak = {}, effects = {}) {
  if (result?.type !== "item") return 0
  const r = result.rarity
  if (r === "junk" || r === "hidden") return 0
  let chance = (Number(lineBreak[r]) || 0) + (result.size === "large" ? Number(lineBreak.large) || 0 : 0)
  chance *= 1 - Math.min(100, Math.max(0, Number(effects.lineGuard) || 0)) / 100
  return Math.max(0, Math.min(100, chance))
}

/* ---------------- 汇总 ---------------- */

/** 汇总一次钓鱼的全部效果：称号 + 打卡幸运 + 渔具 + 本竿鱼饵 */
export function allEffects({ titles = {}, luck = {}, gear = {}, bait = {} } = {}) {
  return mergeEffects(titles, luck, gear, bait)
}
