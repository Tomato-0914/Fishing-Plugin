/** 图鉴：物品详情计算（纯函数） */
import { buildOdds, buildSizeOdds, SIZE_RANGE, isDexFish } from "./ItemPool.js"

/**
 * 物品单次出现概率（%），已按总和归一化
 * @param effects 玩家效果（渔具决定品级时必须传入，否则按 1 阶渔具计算）
 */
export function itemChance(item, items, probability, effects = {}, limits = {}) {
  const odds = buildOdds(probability, effects, limits)
  const total = Object.values(odds).reduce((s, v) => s + v, 0) || 1
  if (item.rarity === "hidden" || item.rarity === "protected") return (odds[`hidden:${item.id}`] || 0) / total * 100
  const pool = items.filter(i => i.rarity === item.rarity)
  const weightSum = pool.reduce((s, i) => s + (i.chance ?? 1), 0) || 1
  return (odds[item.rarity] || 0) / total * 100 * (item.chance ?? 1) / weightSum
}

/** 概率显示：保留两位有效数字 */
export function formatChance(pct) {
  if (!pct) return "0%"
  if (pct >= 1) return `${Number(pct.toFixed(2))}%`
  return `${Number(pct.toPrecision(2))}%`
}

/**
 * 各体型的概率、重量与售价区间（与 roll 的算法一致）
 * @param effects 玩家效果：概率按大体型 / 超大体型加成计算；不传时为基础概率
 */
export function sizeTable(item, size = {}, effects = {}) {
  if (!Array.isArray(item.weight)) return []
  const [wMin, wMax] = item.weight
  const odds = buildSizeOdds(size, effects)
  const total = Object.values(odds).reduce((a, b) => a + b, 0) || 1
  return ["small", "medium", "large", "xlarge"].filter(k => size[k]).map(k => {
    const [lo, hi] = SIZE_RANGE[k]
    const mult = Number(size[k].price) || 1
    const base = Number(item.price) || 0
    return {
      key: k,
      label: size[k].label || k,
      chance: Number(((odds[k] || 0) / total * 100).toFixed(2)),
      wMin: wMin + (wMax - wMin) * lo,
      wMax: wMin + (wMax - wMin) * hi,
      pMin: Math.max(1, Math.round(base * mult * 0.95)),
      pMax: Math.max(1, Math.round(base * mult * 1.05)),
    }
  })
}

/** 按名称查找：完全匹配优先，否则返回所有包含关键字的物品 */
export function findItems(keyword, items) {
  keyword = String(keyword || "").trim()
  if (!keyword) return []
  const exact = items.filter(i => i.name === keyword || i.id === keyword)
  return exact.length ? exact : items.filter(i => i.name.includes(keyword))
}

/** 图鉴编号：按物品池顺序，鱼类在前、垃圾其次、隐藏最后 */
export function dexNo(item, items) {
  const order = [...items.filter(isDexFish), ...items.filter(i => i.rarity === "junk"), ...items.filter(i => i.rarity === "hidden"), ...items.filter(i => i.rarity === "protected")]
  return String(order.indexOf(item) + 1).padStart(3, "0")
}
