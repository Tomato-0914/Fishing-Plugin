/** 物品池与抽取算法（纯函数，不依赖 Yunzai，便于测试） */
import { gearRarityOdds } from "./GearOdds.js"

/**
 * 稀有度（统一顺序：普通 → 高级 → 稀有 → 神器 → 传说 → 史诗 → 神话）
 * 内部 id 沿用旧值以兼容存档：N 普通、R 高级、SR 稀有、SSR 神器、UR 传说、EP 史诗、MR 神话
 * hidden 隐藏款、protected 保护鱼类（误钓会受罚）、junk 垃圾
 */
export const RARITIES = ["junk", "N", "R", "SR", "SSR", "UR", "EP", "MR", "hidden", "protected"]
export const RARITY_INFO = {
  junk: { label: "垃圾", color: "#8d8d8d", icon: "🗑️" },
  N: { label: "普通", color: "#9aa5b1", icon: "⚪" },
  R: { label: "高级", color: "#3bb273", icon: "🟢" },
  SR: { label: "稀有", color: "#3a8dde", icon: "🔵" },
  SSR: { label: "神器", color: "#a259ff", icon: "🟣" },
  UR: { label: "传说", color: "#f2a900", icon: "🟡" },
  EP: { label: "史诗", color: "#fa6e1e", icon: "🟠" },
  MR: { label: "神话", color: "#e5242b", icon: "🔴" },
  hidden: { label: "隐藏", color: "linear-gradient(90deg, #ff4d4f, #faad14, #52c41a, #1890ff, #722ed1)", icon: "🌈" },
  protected: { label: "保护鱼类", color: "#0e9f6e", icon: "🚫" },
}
/** 稀有及以上（rareBoost 作用的档位） */
const RARE = new Set(["SR", "SSR", "UR", "EP", "MR"])
/** 分档加成的稀有度（effects 写作 boostN / boostR / boostSR / boostSSR / boostUR / boostEP / boostMR） */
export const TIER_BOOST_ORDER = ["N", "R", "SR", "SSR", "UR", "EP", "MR"]
/** 鱼类稀有度从低到高（图鉴、鱼护排序用） */
export const FISH_TIERS = ["N", "R", "SR", "SSR", "UR", "EP", "MR"]
/** 分档加成按这个顺序扣除（只扣比目标低的档位） */
const BOOST_SOURCES = ["empty", "junk", "N", "R", "SR"]

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
  if (prob?.mode === "gear") {
    // 先独立判定空军、垃圾、隐藏款和保护鱼类；剩余权重按渔具决定的品级分布分配。
    // 品级只认 rarityTier / rarityShift / rarePoints（渔具、套装、称号），旧版 boost* / rareBoost 不生效。
    const specialEntries = specialOdds(prob, effects)
    const specialTotal=specialEntries.reduce((sum,[,v])=>sum+v,0)
    let empty=Math.max(0,(Number(prob.empty)||0)-(Number(effects.emptyReduce)||0))
    let junk=Math.max(0,(Number(prob.junk)||0)-(Number(effects.junkReduce)||0))
    const available=Math.max(0,100-specialTotal)
    if (empty+junk>available) {
      const ratio=available/(empty+junk)
      empty*=ratio
      junk*=ratio
    }
    const fishTotal=Math.max(0,available-empty-junk)
    const fish=gearRarityOdds(effects)
    return {empty,junk,...Object.fromEntries(FISH_TIERS.map(k=>[k,fish[k]*fishTotal/100])),...Object.fromEntries(specialEntries)}
  }
  const odds = {
    empty: Number(prob.empty) || 0,
    junk: Number(prob.junk) || 0,
    N: Number(prob.N) || 0,
    R: Number(prob.R) || 0,
    SR: Number(prob.SR) || 0,
    SSR: Number(prob.SSR) || 0,
    UR: Number(prob.UR) || 0,
    EP: Number(prob.EP) || 0,
    MR: Number(prob.MR) || 0,
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
  // 分档加成（渔具 / 鱼饵）：直接给某个稀有度加 N 个百分点，从比它低的档位里按 空军 → 垃圾 → 普通 → 高级 → 稀有
  // 的顺序扣除，每档不低于 limits 下限；史诗、传说不会被扣。渔具越好，先没了空军和垃圾，再越来越难钓到低级鱼
  const floors = { empty: floor("empty"), junk: floor("junk"), N: floorN, R: floor("R"), SR: floor("SR") }
  for (const tier of TIER_BOOST_ORDER) {
    let want = Math.max(0, Number(effects[`boost${tier}`]) || 0)
    for (const from of BOOST_SOURCES) {
      if (want <= 0 || from === tier) break
      const take = Math.min(Math.max(0, odds[from] - floors[from]), want)
      odds[from] -= take
      odds[tier] += take
      want -= take
    }
  }
  // 稀有加成：SR 以上概率按倍率提高，多出来的部分和分档加成一样按 空军 → 垃圾 → 普通 → 高级 扣除（不低于下限）
  const boost = Math.max(-100, Number(effects.rareBoost) || 0)
  if (boost > 0) {
    // 倍率加成本身也提高稀有，所以只从 高级 及以下扣
    const rareSources = BOOST_SOURCES.filter(k => k !== "SR")
    const room = rareSources.reduce((a, k) => a + Math.max(0, odds[k] - floors[k]), 0)
    const want = [...RARE].reduce((s, r) => s + odds[r] * boost / 100, 0)
    const scale = want > room ? room / want : 1
    for (const r of RARE) odds[r] += odds[r] * boost / 100 * scale
    let left = want * scale
    for (const from of rareSources) {
      const take = Math.min(Math.max(0, odds[from] - floors[from]), left)
      odds[from] -= take
      left -= take
    }
  } else if (boost < 0) {
    // 稀有下调：减少的部分转给普通鱼
    for (const r of RARE) {
      const cut = odds[r] * -boost / 100
      odds[r] -= cut
      odds.N += cut
    }
  }
  // 隐藏款、保护鱼类：单独设置的固定概率，不受渔具和称号影响
  for (const [k, v] of specialOdds(prob, effects)) odds[k] = v
  return odds
}

/**
 * 隐藏款与保护鱼类的概率：[["hidden:<id>", %], ...]
 * effects.protectedScale：保护鱼类概率倍率（百连钓鱼降低出现概率），默认 1
 */
function specialOdds(prob, effects = {}) {
  const scale = effects.protectedScale == null ? 1 : Math.max(0, Number(effects.protectedScale) || 0)
  return [
    ...Object.entries(prob.hidden || {}).map(([id, v]) => [`hidden:${id}`, Math.max(0, Number(v) || 0)]),
    ...Object.entries(prob.protected || {}).map(([id, v]) => [`hidden:${id}`, Math.max(0, Number(v) || 0) * scale]),
  ]
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
  // largeBoost：小 → 大（小体型扣完再扣中体型）
  // xlBoost：小 → 中 → 大 依次升为超大；大体型加成叠满后，超大加成照样有效（把大鱼升成超大）
  const SOURCES = { large: ["small", "medium"], xlarge: ["small", "medium", "large"] }
  for (const [key, target] of [["largeBoost", "large"], ["xlBoost", "xlarge"]]) {
    let want = Math.max(0, Number(effects[key]) || 0)
    if (!want || !(target in odds)) continue
    for (const from of SOURCES[target]) {
      const take = Math.min(odds[from] ?? 0, want)
      odds[from] -= take
      odds[target] += take
      want -= take
    }
  }
  return odds
}

export const SIZE_RANGE = { small: [0, 0.4], medium: [0.4, 0.75], large: [0.75, 0.93], xlarge: [0.93, 1] }
/** 体型从大到小（鱼护、图鉴展示用） */
export const SIZE_ORDER = ["xlarge", "large", "medium", "small"]

const round2 = n => Math.round(n * 1000) / 1000

/** 某体型下的售价：t 为体型区间内的位置（0~1），同体型内越重越值钱 ±5% */
export function sizedPrice(item, sizeKey, t, size = {}) {
  const mult = Number(size?.[sizeKey]?.price) || 1
  return Math.max(1, Math.round((Number(item.price) || 0) * mult * (0.95 + 0.1 * t)))
}

/**
 * 按当前物品配置重新计算鱼护条目的售价（由重量反推体型内位置）
 * 调整鱼价后，旧鱼获也按新价格出售；无法计算时返回 null（保留原价）
 */
export function entryPrice(entry, item, size = {}) {
  if (!entry || !item) return null
  if (item.rarity === "junk") return 0
  // 钓到后鱼价、体型倍率都没改过：保持钓到时的价格（重新反推会因重量取整差 1 金币）
  const sameBase = entry.bp != null && Number(entry.bp) === (Number(item.price) || 0)
  const sameSize = !entry.s || entry.sp == null || Number(entry.sp) === (Number(size?.[entry.s]?.price) || 1)
  if (sameBase && sameSize && entry.p != null) return entry.p
  // m：钓到时的售价倍率（鱼饵“鱼价 +%”、宠物“鱼价翻倍 / ×3”），重新定价时保留
  const m = Number(entry.m) > 0 ? Number(entry.m) : 1
  if (!Array.isArray(item.weight)) return Math.max(0, Math.round((Number(item.price) || 0) * m))
  const range = SIZE_RANGE[entry.s]
  if (!range || entry.w == null || !size?.[entry.s]) return null
  const [wMin, wMax] = item.weight
  const pos = wMax > wMin ? (Number(entry.w) - wMin) / (wMax - wMin) : range[0]
  const t = Math.min(1, Math.max(0, (pos - range[0]) / (range[1] - range[0])))
  const p = sizedPrice(item, entry.s, t, size)
  return m === 1 ? p : Math.max(1, Math.round(p * m))
}

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
  return itemResult(item, size, effects, rng)
}

/** 物品 → 结果：抽体型、重量、售价 */
function itemResult(item, size, effects, rng) {
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
    result.price = sizedPrice(item, sizeKey, t, size)
  }
  return result
}

/** 下一个品级（神话已是最高） */
export const NEXT_RARITY = { N: "R", R: "SR", SR: "SSR", SSR: "UR", UR: "EP", EP: "MR", MR: "MR" }

/** 指定品级钓一条（宠物技能“品级 +1”用）；该品级没有物品时返回 null */
export function rollOfRarity({ items, size }, rarity, effects = {}, rng = Math.random) {
  const pool = items.filter(i => i.rarity === rarity)
  if (!pool.length) return null
  return itemResult(weightedPick(pool.map(i => [i, i.chance ?? 1]), rng), size, effects, rng)
}

/** 只在鱼（普通~神话）里按当前品级分布钓一条（宠物技能“多钓一条”用） */
export function rollFish(ctx, effects = {}, rng = Math.random) {
  const odds = buildOdds(ctx.probability, effects, ctx.limits)
  const entries = FISH_TIERS.map(r => [r, odds[r] || 0]).filter(([r, v]) => v > 0 && ctx.items.some(i => i.rarity === r))
  if (!entries.length) return null
  return rollOfRarity(ctx, weightedPick(entries, rng), effects, rng)
}

/** 鱼类图鉴范围：除垃圾和隐藏款外的所有物品 */
export const isDexFish = item => item && !["junk", "hidden", "protected"].includes(item.rarity)

export function formatWeight(kg) {
  if (kg == null) return ""
  return kg < 1 ? `${Math.round(kg * 1000)}g` : `${Number(kg.toFixed(2))}kg`
}

/**
 * 抛一竿的完整结果概率（%），用于展示：空军、垃圾、普通 ~ 神话、隐藏款、保护鱼类
 * @returns [{ key, label, color, pct }]，按以上顺序，包含 0% 的项
 */
export function castBreakdown(prob, effects = {}, limits = {}) {
  const odds = buildOdds(prob, effects, limits)
  const total = Object.values(odds).reduce((a, v) => a + v, 0) || 1
  const pct = v => v / total * 100
  const protectedIds = new Set(Object.keys(prob?.protected || {}).map(id => `hidden:${id}`))
  let hidden = 0, prot = 0
  for (const [k, v] of Object.entries(odds)) if (k.startsWith("hidden:")) protectedIds.has(k) ? prot += v : hidden += v
  return [
    { key: "empty", label: "空军", color: "#6b7f93", pct: pct(odds.empty || 0) },
    { key: "junk", label: "垃圾", color: "#8d6e63", pct: pct(odds.junk || 0) },
    ...FISH_TIERS.map(k => ({ key: k, label: RARITY_INFO[k].label, color: RARITY_INFO[k].color, pct: pct(odds[k] || 0) })),
    { key: "hidden", label: "隐藏款", color: RARITY_INFO.hidden.color, pct: pct(hidden) },
    { key: "protected", label: "保护鱼类", color: RARITY_INFO.protected.color, pct: pct(prot) },
  ]
}
