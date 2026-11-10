/** 渔具与鱼饵（纯函数，便于测试） */
import { mergeEffects } from "./Titles.js"

export const SLOTS = ["rod", "line", "float", "net"]
export const UPGRADE_NAMES = { 鱼竿: "rod", 鱼线: "line", 浮漂: "float", 鱼护: "net" }
/** 渔具等级颜色（Lv1 ~ Lv10），超出时沿用最后一个 */
export const LEVEL_COLORS = [
  "#9aa5b1", "#3bb273", "#3a8dde", "#a259ff", "#f2a900",
  "#fa8c16", "#f5222d", "#eb2f96", "#13c2c2",
  "linear-gradient(90deg, #ff4d4f, #faad14, #52c41a, #1890ff, #722ed1)",
]
export const LEVEL_LABELS = ["普通", "优良", "稀有", "史诗", "传说", "神话", "至尊", "圣品", "天品", "永恒"]
export const levelColor = lv => LEVEL_COLORS[Math.min(lv, LEVEL_COLORS.length) - 1]
export const levelLabel = lv => LEVEL_LABELS[Math.min(lv, LEVEL_LABELS.length) - 1]

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

/** 四件渔具里最高的等级（决定能用哪些鱼饵） */
export const maxGearLevel = user => Math.max(...SLOTS.map(s => gearLevel(user, s)))

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

/**
 * 鱼饵单价
 * @param bait config.yaml 的 bait 配置 { price, prices }（也可直接传普通饵单价数字）
 *   普通饵取 bait.price；其他鱼饵优先取 bait.prices[id]，没有再取 shop.yaml 中的 price
 */
export function baitPrice(shop, id, bait = 2) {
  const cfg = typeof bait === "object" && bait ? bait : { price: bait }
  if (id === "basic") return Math.max(0, Number(cfg.price ?? 2) || 0)
  const override = cfg.prices?.[id]
  if (override != null && override !== "" && !Number.isNaN(Number(override))) return Math.max(0, Number(override))
  return Math.max(0, Number(baitDef(shop, id)?.price) || 0)
}

/** 鱼饵等级：未填写时视为 1 级 */
export const baitLevel = bait => Math.max(1, Number(bait?.level) || 1)

/** 能否使用 / 购买：至少有一件渔具达到鱼饵等级 */
export const canUseBait = (user, bait) => baitLevel(bait) <= maxGearLevel(user)

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
 * 抛竿消耗 1 个鱼饵
 * - 当前鱼饵等级超过渔具（reason: "locked"）：换成能用、有库存的最高级鱼饵
 * - 当前鱼饵用完（reason: "empty"）：换成能用、有库存的鱼饵，普通饵优先，其次按商店顺序
 * 能用的鱼饵都没有库存时返回 null（高级鱼饵仍保留在库存里，渔具升级后可用）
 * @returns {{ bait, switched:boolean, from, reason? } | null}
 */
export function consumeBait(user, shop) {
  const cur = currentBait(user, shop)
  let bait = cur
  let reason
  const usable = baitList(shop).filter(b => canUseBait(user, b) && baitCount(user, b.id) > 0)
  if (!canUseBait(user, cur)) {
    reason = "locked"
    bait = [...usable].sort((a, b) => baitLevel(b) - baitLevel(a))[0]
  } else if (baitCount(user, cur.id) < 1) {
    reason = "empty"
    bait = usable.find(b => b.id === "basic") || usable[0]
  }
  if (!bait) return null
  if (bait.id !== cur.id) user.baitUse = bait.id
  user.baits[bait.id]--
  return { bait, switched: bait.id !== cur.id, from: cur, reason }
}

/** 能用的鱼饵总数（等级够、有库存） */
export const usableBait = (user, shop) =>
  baitList(shop).filter(b => canUseBait(user, b)).reduce((s, b) => s + baitCount(user, b.id), 0)

/** 切换鱼饵（必须有库存） */
export function useBait(user, shop, id) {
  const b = baitDef(shop, id)
  if (!b) return { ok: false, reason: "unknown" }
  if (!canUseBait(user, b)) return { ok: false, reason: "locked", bait: b, need: baitLevel(b) }
  if (baitCount(user, id) < 1) return { ok: false, reason: "empty", bait: b }
  user.baitUse = id
  return { ok: true, bait: b }
}

/** 购买鱼饵 */
export function buyBait(user, shop, id, count, baitCfg = 2) {
  count = Math.floor(Number(count) || 0)
  const bait = baitDef(shop, id)
  if (!bait) return { ok: false, reason: "unknown" }
  if (!canUseBait(user, bait)) return { ok: false, reason: "locked", bait, need: baitLevel(bait) }
  if (count < 1) return { ok: false, reason: "count" }
  const price = baitPrice(shop, id, baitCfg)
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
