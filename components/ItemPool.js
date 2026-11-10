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
/** 分档加成的稀有度（effects 写作 boostN / boostR / boostSR / boostSSR / boostUR） */
export const TIER_BOOST_ORDER = ["N", "R", "SR", "SSR", "UR"]

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

/**
 * 计算本次钓鱼的结果概率表（已叠加称号 / 打卡 / 渔具效果）
 * @param limits 概率下限 { empty, junk, N }，效果叠加后不会低于这些值
 */
export function buildOdds(prob, effects = {}, limits = {}) {
  const odds = {
    empty: Number(prob.empty) || 0,
    junk: Number(prob.junk) || 0,
    N: Number(prob.N) || 0,
    R: Number(prob.R) || 0,
    SR: Number(prob.SR) || 0,
    SSR: Number(prob.SSR) || 0,
    UR: Number(prob.UR) || 0,
  }
  // 下限不能高于配置的原始概率
  const floor = k => Math.min(odds[k], Math.max(0, Number(limits[k]) || 0))
  const floorN = floor("N")
  // 空军 / 垃圾概率下调，转为普通鱼；负数（如打卡“凶”）则从普通鱼转为空军 / 垃圾
  for (const [key, eff] of [["empty", "emptyReduce"], ["junk", "junkReduce"]]) {
    const v = Number(effects[eff]) || 0
    const cut = v >= 0 ? Math.min(odds[key] - floor(key), v) : Math.max(v, -(odds.N - floorN))
    odds[key] -= cut
    odds.N += cut
  }
  // 分档加成（渔具）：直接给某个稀有度加 N 个百分点，从 空军 → 垃圾 → 普通 依次扣除（不低于下限），优良以上不会被扣
  for (const tier of TIER_BOOST_ORDER) {
    let want = Math.max(0, Number(effects[`boost${tier}`]) || 0)
    for (const from of ["empty", "junk", "N"]) {
      if (want <= 0 || from === tier) break
      const room = Math.max(0, odds[from] - (from === "N" ? floorN : floor(from)))
      const take = Math.min(room, want)
      odds[from] -= take
      odds[tier] += take
      want -= take
    }
  }
  // 稀有加成：SR 以上概率按倍率提高，多出来的从普通鱼扣除（普通鱼不低于下限）
  const boost = Math.max(-100, Number(effects.rareBoost) || 0)
  if (boost > 0) {
    const room = Math.max(0, odds.N - floorN)
    const want = [...RARE].reduce((s, r) => s + odds[r] * boost / 100, 0)
    const scale = want > room ? room / want : 1
    for (const r of RARE) odds[r] += odds[r] * boost / 100 * scale
    odds.N -= want * scale
  } else if (boost < 0) {
    // 稀有下调：减少的部分转给普通鱼
    for (const r of RARE) {
      const cut = odds[r] * -boost / 100
      odds[r] -= cut
      odds.N += cut
    }
  }
  for (const [id, chance] of Object.entries(prob.hidden || {}))
    odds[`hidden:${id}`] = Number(chance) || 0
  return odds
}

/** 实际出现概率（%，已归一化），用于展示：{ empty, junk, N, R, SR, SSR, UR, hidden } */
export function oddsPercent(prob, effects = {}, limits = {}) {
  const odds = buildOdds(prob, effects, limits)
  const total = Object.values(odds).reduce((s, v) => s + v, 0) || 1
  const out = { hidden: 0 }
  for (const [k, v] of Object.entries(odds)) {
    if (k.startsWith("hidden:")) out.hidden += v / total * 100
    else out[k] = v / total * 100
  }
  return out
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

export const SIZE_RANGE = { small: [0, 0.4], medium: [0.4, 0.75], large: [0.75, 1] }

const round2 = n => Math.round(n * 1000) / 1000

/**
 * 钓一次
 * @returns {{type:"empty"}|{type:"item", item, rarity, size?, weight?, price}}
 */
export function roll({ items, probability, size, limits }, effects = {}, rng = Math.random) {
  const outcome = weightedPick(Object.entries(buildOdds(probability, effects, limits)), rng)
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
