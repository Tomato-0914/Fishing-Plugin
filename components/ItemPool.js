/** 物品池与抽取算法（纯函数，不依赖 Yunzai，便于测试） */

export const RARITIES = ["junk", "N", "R", "SR", "SSR", "UR", "hidden"]
export const RARITY_INFO = {
  junk: { label: "垃圾", color: "#8d8d8d", icon: "🗑️" },
  N: { label: "普通", color: "#9aa5b1", icon: "⚪" },
  R: { label: "优良", color: "#3bb273", icon: "🟢" },
  SR: { label: "稀有", color: "#3a8dde", icon: "🔵" },
  SSR: { label: "史诗", color: "#a259ff", icon: "🟣" },
  UR: { label: "传说", color: "#f2a900", icon: "🟡" },
  hidden: { label: "隐藏", color: "#ff4d6d", icon: "❓" },
}
const RARE = new Set(["SR", "SSR", "UR"])

/** 按权重随机选取 entries: [[key, weight], ...] */
export function weightedPick(entries, rng = Math.random) {
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0)
  if (total <= 0) return entries[0]?.[0]
  let r = rng() * total
  for (const [key, w] of entries) {
    if (w <= 0) continue
    if ((r -= w) < 0) return key
  }
  return entries[entries.length - 1][0]
}

/** 三角分布随机数：两次均匀随机取平均，中间值更常见 */
export function triangular(min, max, rng = Math.random) {
  return min + ((rng() + rng()) / 2) * (max - min)
}

/** 计算本次钓鱼的结果概率表（已叠加称号效果） */
export function buildOdds(prob, effects = {}) {
  const odds = {
    empty: Number(prob.empty) || 0,
    junk: Number(prob.junk) || 0,
    N: Number(prob.N) || 0,
    R: Number(prob.R) || 0,
    SR: Number(prob.SR) || 0,
    SSR: Number(prob.SSR) || 0,
    UR: Number(prob.UR) || 0,
  }
  // 海洋卫士类效果：空军 / 垃圾概率下调，转为普通鱼
  for (const [key, eff] of [["empty", "emptyReduce"], ["junk", "junkReduce"]]) {
    const cut = Math.min(odds[key], Number(effects[eff]) || 0)
    odds[key] -= cut
    odds.N += cut
  }
  // 稀有加成：SR 以上概率按倍率提高，多出来的从普通鱼扣除
  const boost = Number(effects.rareBoost) || 0
  if (boost > 0) {
    let extra = 0
    for (const r of RARE) {
      const add = odds[r] * boost / 100
      odds[r] += add
      extra += add
    }
    const fromN = Math.min(odds.N, extra)
    odds.N -= fromN
  }
  for (const [id, chance] of Object.entries(prob.hidden || {}))
    odds[`hidden:${id}`] = Number(chance) || 0
  return odds
}

/** 体型概率（已叠加 largeBoost） */
export function buildSizeOdds(size, effects = {}) {
  const odds = Object.fromEntries(Object.entries(size).map(([k, v]) => [k, Number(v.chance) || 0]))
  const boost = Math.min(odds.small ?? 0, Number(effects.largeBoost) || 0)
  if (boost > 0 && "large" in odds) {
    odds.small -= boost
    odds.large += boost
  }
  return odds
}

const SIZE_RANGE = { small: [0, 0.4], medium: [0.4, 0.75], large: [0.75, 1] }

const round2 = n => Math.round(n * 1000) / 1000

/**
 * 钓一次
 * @returns {{type:"empty"}|{type:"item", item, rarity, size?, weight?, price}}
 */
export function roll({ items, probability, size }, effects = {}, rng = Math.random) {
  const outcome = weightedPick(Object.entries(buildOdds(probability, effects)), rng)
  if (outcome === "empty") return { type: "empty" }

  let item
  if (outcome.startsWith("hidden:")) {
    item = items.find(i => i.id === outcome.slice(7))
  } else {
    const pool = items.filter(i => i.rarity === outcome)
    item = pool.length ? weightedPick(pool.map(i => [i, i.chance ?? 1]), rng) : undefined
  }
  if (!item) return { type: "empty" }

  const result = { type: "item", item, rarity: item.rarity, price: Number(item.price) || 0 }
  if (item.rarity === "junk") result.price = 0

  if (Array.isArray(item.weight) && size) {
    const sizeKey = weightedPick(Object.entries(buildSizeOdds(size, effects)), rng)
    const [lo, hi] = SIZE_RANGE[sizeKey] || [0, 1]
    const t = rng()
    const [wMin, wMax] = item.weight
    const pos = lo + (hi - lo) * t
    result.size = sizeKey
    result.weight = round2(wMin + (wMax - wMin) * pos)
    // 同体型内越重越值钱：±5%
    const mult = Number(size[sizeKey]?.price) || 1
    result.price = Math.max(1, Math.round(result.price * mult * (0.95 + 0.1 * t)))
  }
  return result
}

/** 鱼类图鉴范围：除垃圾和隐藏款外的所有物品 */
export const isDexFish = item => item && item.rarity !== "junk" && item.rarity !== "hidden"

export function formatWeight(kg) {
  if (kg == null) return ""
  return kg < 1 ? `${Math.round(kg * 1000)}g` : `${Number(kg.toFixed(2))}kg`
}
