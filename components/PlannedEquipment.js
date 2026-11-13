/** 正式装备养成：五个渔具部位，七种品质，Lv1~20，强化 +0~+10。 */
import { SLOTS, gearLevel } from "./Gear.js"
import { mergeEffects } from "./Titles.js"

export const QUALITIES = [
  { name: "普通", multiplier: 1, weight: 500 },
  { name: "高级", multiplier: 1.25, weight: 260 },
  { name: "稀有", multiplier: 1.6, weight: 130 },
  { name: "神器", multiplier: 2.1, weight: 65 },
  { name: "传说", multiplier: 2.8, weight: 30 },
  { name: "史诗", multiplier: 3.7, weight: 12 },
  { name: "神话", multiplier: 5, weight: 3 },
]
export const SLOT_NAMES = { rod: "鱼竿", line: "鱼线", hook: "鱼钩", float: "浮漂", net: "鱼护" }
const bonusKey = { rod: "rareBoost", line: "lineGuard", hook: "holdChance", float: "reelWindow", net: "sellBonus" }
const baseBonus = { rod: 0.6, line: 1, hook: 0.8, float: 0.1, net: 0.4 }
const integer = (n, fallback = 0) => Number.isFinite(Number(n)) ? Math.floor(Number(n)) : fallback
export const MAX_LEVEL = 20
export const MAX_FORGE = 10

function normalizeItem(item, slot, fallbackLevel = 1) {
  const quality = Math.min(6, Math.max(0, integer(item?.quality)))
  const level = Math.min(MAX_LEVEL, Math.max(1, integer(item?.level, fallbackLevel)))
  const forge = Math.min(MAX_FORGE, Math.max(0, integer(item?.forge)))
  const pity = Math.min(100, Math.max(0, integer(item?.pity)))
  return { slot, quality, level, forge, pity }
}

/** 老存档：将原有五类渔具按原等级映射为普通品质，原 gear 字段继续保留。 */
export function ensureGearCollection(user) {
  if (!user.fishingEquipment || typeof user.fishingEquipment !== "object" || Array.isArray(user.fishingEquipment))
    user.fishingEquipment = {}
  for (const slot of SLOTS)
    user.fishingEquipment[slot] = normalizeItem(user.fishingEquipment[slot], slot, gearLevel(user, slot))
  return user.fishingEquipment
}
export function currentEquipment(user) {
  return SLOTS.map(slot => normalizeItem(user?.fishingEquipment?.[slot], slot, gearLevel(user, slot)))
}
export function itemName(item) {
  return `${QUALITIES[item.quality].name}${SLOT_NAMES[item.slot]} Lv${item.level} +${item.forge}`
}
export function equipmentBonus(user) {
  const bonuses = currentEquipment(user).map(item => {
    // 旧渔具保持原本加成；普通 +0 无额外属性，避免迁移时重复加成。
    if (item.quality === 0 && item.forge === 0) return {}
    const scale = (QUALITIES[item.quality].multiplier - 1) * item.level + item.forge * 0.5
    return { [bonusKey[item.slot]]: Number((baseBonus[item.slot] * scale).toFixed(2)) }
  })
  return mergeEffects(...bonuses)
}
export function purchaseEquipment(user, slot, qualityName, level = 1) {
  if (!SLOTS.includes(slot)) return { ok: false, reason: "slot" }
  const quality = QUALITIES.findIndex(q => q.name === qualityName)
  if (quality < 0) return { ok: false, reason: "quality" }
  level = integer(level, NaN)
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) return { ok: false, reason: "level" }
  const price = Math.round(200 * level * level * QUALITIES[quality].multiplier)
  if (!Number.isFinite(Number(user.gold)) || Number(user.gold) < price) return { ok: false, reason: "gold", price }
  const equipment = ensureGearCollection(user)
  // 新购装备直接替换该部位，购买前应确认；不返还旧装备的金币。
  user.gold -= price
  equipment[slot] = { slot, quality, level, forge: 0, pity: 0 }
  return { ok: true, item: equipment[slot], price }
}
export function upgradeEquipment(user, slot) {
  if (!SLOTS.includes(slot)) return { ok: false, reason: "slot" }
  const item = ensureGearCollection(user)[slot]
  if (item.level >= MAX_LEVEL) return { ok: false, reason: "max", item }
  const price = Math.round(100 * (item.level + 1) ** 2 * QUALITIES[item.quality].multiplier)
  if (!Number.isFinite(Number(user.gold)) || Number(user.gold) < price) return { ok: false, reason: "gold", price }
  user.gold -= price
  item.level++
  return { ok: true, item, price }
}
export function forgeEquipment(user, slot, rng = Math.random) {
  if (!SLOTS.includes(slot)) return { ok: false, reason: "slot" }
  const item = ensureGearCollection(user)[slot]
  if (item.forge >= MAX_FORGE) return { ok: false, reason: "max", item }
  const price = Math.round(150 * (item.forge + 1) ** 2 * QUALITIES[item.quality].multiplier)
  if (!Number.isFinite(Number(user.gold)) || Number(user.gold) < price) return { ok: false, reason: "gold", price }
  const baseChance = Math.max(10, 95 - item.forge * 9)
  const chance = Math.min(100, baseChance + item.pity)
  user.gold -= price
  if (rng() * 100 < chance) {
    item.forge++
    item.pity = 0
    return { ok: true, item, price, chance }
  }
  item.pity = Math.min(100, item.pity + 5)
  return { ok: false, reason: "failed", item, price, chance }
}
