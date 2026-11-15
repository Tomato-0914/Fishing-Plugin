/** 渔具决定鱼类品级：条件概率总和 100%，隐藏款与保护鱼类独立。 */
export const FISH_RARITIES = ["N","R","SR","SSR","UR","EP","MR"]
export const ROD_ODDS = [
  [90,10,0,0,0,0,0],
  [82,17,1,0,0,0,0],
  [74,23,3,0,0,0,0],
  [66,29,5,0,0,0,0],
  [58,34,7,1,0,0,0],
  [51,38,9,2,0,0,0],
  [45,40,12,3,0,0,0],
  [40,40,15,4.8,0.2,0,0],
  [35,40,18,6.5,0.5,0,0],
  [30,39,22,8,1,0,0],
  [26,38,25,9.5,1.4,0.1,0],
  [22,36,28,11,2.7,0.3,0],
  [19,33,31,13,3.4,0.6,0],
  [16,30,33,15,5,1,0],
  [14,27,34,17,6.5,1.4,0.1],
  [12,24,35,19,8,1.8,0.2],
  [10,21,35,21,10,2.6,0.4],
  [8,18,34,23,13,3.3,0.7],
  [6,16,32,25,16,4,1],
  [5,13,30,27,19,4.5,1.5],
]
/** 第 20 阶之上的虚拟一行：只用于 20 阶鱼竿“向下一阶靠拢”，不能直接装备 */
export const TOP_ODDS = [4,10,26,29,23,5.5,2.5]
/** 概率表最多向下一阶靠拢 90%，保证买新一阶始终更好 */
export const MAX_SHIFT = 0.9
const clamp = (n,min,max) => Math.min(max,Math.max(min,Number(n)||0))
const rowOf = (rows, i) => rows[i] || TOP_ODDS

/**
 * 高品级点数加到哪些品级：当前鱼竿阶位已解锁的稀有及以上品级中最高的三档，
 * 权重 低:中:高 = 3:2:1（越稀有分得越少）；还没有稀有以上时加到高级。
 * @returns [[品级下标, 权重占比], ...]
 */
export function rareTargets(tier, rows = ROD_ODDS) {
  const row = rowOf(rows, Math.floor(clamp(tier,1,20)) - 1)
  const unlocked = [2,3,4,5,6].filter(i => Number(row[i]) > 0)
  const targets = (unlocked.length ? unlocked : [1]).slice(-3)
  const sum = targets.reduce((a,_,j) => a + targets.length - j, 0)
  return targets.map((i,j) => [i, (targets.length - j) / sum])
}

/**
 * 渔具决定的鱼获品级分布（条件概率，合计 100%）
 * - rarityTier：鱼竿阶位，决定基础概率表
 * - rarityShift：概率表向下一阶靠拢的比例（0~0.9），来自鱼竿高级强化、5 件套、称号
 * - rarePoints：高品级点数，加到 rareTargets 的品级，从更低的品级按比例扣除；
 *   没解锁的品级加不上去（以整数阶位为准，靠拢不会提前解锁）
 */
export function gearRarityOdds(effects = {}, rows = ROD_ODDS) {
  const tier = Math.floor(clamp(effects.rarityTier || 1,1,20))
  const shift = clamp(effects.rarityShift,0,MAX_SHIFT)
  const lo = rowOf(rows, tier-1), hi = rowOf(rows, tier)
  const base = FISH_RARITIES.map((_,i) => {
    const a = Math.max(0,Number(lo[i])||0), b = Math.max(0,Number(hi[i])||0)
    return a + (b - a) * shift
  })
  const targets = rareTargets(tier, rows)
  const lowest = targets[0][0]
  const sources = FISH_RARITIES.map((_,i) => i).filter(i => i < lowest)
  const available = sources.reduce((a,i) => a + base[i], 0)
  // 低品级最多扣掉 90%，避免普通鱼被扣光
  const points = Math.min(clamp(effects.rarePoints,0,100), available * 0.9)
  if (points > 0 && available > 0) {
    for (const i of sources) base[i] -= points * base[i] / available
    for (const [i, share] of targets) base[i] += points * share
  }
  const sum = base.reduce((a,b) => a+b, 0)
  return Object.fromEntries(FISH_RARITIES.map((key,i) => [key, sum>0 ? base[i]*100/sum : 0]))
}
