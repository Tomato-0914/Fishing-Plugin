/** 渔具决定鱼类品级：条件概率总和 100%，隐藏款与保护动物独立。 */
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
const clamp = (n,min,max) => Math.min(max,Math.max(min,Number(n)||0))
/** 所有部位的概率增量已由 gearEffects 汇总到 rarityUR/EP/MR。 */
export function gearRarityOdds(effects = {}, rows = ROD_ODDS) {
  const tier = Math.floor(clamp(effects.rarityTier || 1,1,20))
  const base = [...(rows[tier-1] || ROD_ODDS[tier-1])].map(n=>Math.max(0,Number(n)||0))
  const desired = [clamp(effects.rarityUR,0,100),clamp(effects.rarityEP,0,100),clamp(effects.rarityMR,0,100)]
  const targets = [4,5,6]
  const source = [0,1,2]
  // 只有当前鱼竿已经解锁的品级才允许获得培养加成。
  const increments = desired.map((v,i)=>base[targets[i]]>0?v:0)
  let remaining = increments.reduce((a,b)=>a+b,0)
  // 按 4:5:8 扣除低级鱼；某一品级不足时从其他低级品级补扣。
  const available = source.reduce((a,i)=>a+base[i],0)
  const scale = remaining>available ? available/remaining : 1
  remaining *= scale
  const shares = [4/17,5/17,8/17]
  for (const i of source) {
    const take=Math.min(base[i],remaining*shares[i])
    base[i]-=take
  }
  let left=100-base.reduce((a,b)=>a+b,0)
  // 分摊后的余量继续扣除，保证总概率严格守恒。
  for (const i of source) {
    const take=Math.min(base[i],Math.max(0,left))
    base[i]-=take
    left-=take
  }
  for (let i=0;i<targets.length;i++) base[targets[i]]+=increments[i]*scale
  // 归一化消除浮点误差；零权重品级仍为零。
  const sum=base.reduce((a,b)=>a+b,0)
  return Object.fromEntries(FISH_RARITIES.map((key,i)=>[key,sum>0?base[i]*100/sum:0]))
}
