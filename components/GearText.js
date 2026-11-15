/** 渔具效果的展示文字（工坊、结果图、#我的渔具 共用；纯函数，便于测试） */
import { rareTargets, FISH_RARITIES } from "./GearOdds.js"
import { RARITY_INFO } from "./ItemPool.js"

const label = i => RARITY_INFO[FISH_RARITIES[i]].label

/** 高品级加成加到的品级，例如“稀有/神器”（由鱼竿阶位决定） */
export const rareTargetNames = rodTier => rareTargets(rodTier).map(([i]) => label(i)).join("/")

/** 高品级加成的分配比例，例如“稀有 67% · 神器 33%” */
export const rareTargetText = rodTier =>
  rareTargets(rodTier).map(([i, share]) => `${label(i)} ${Math.round(share * 100)}%`).join(" · ")

/** 概率表靠拢的说法：“品级向第 6 阶提升”；20 阶没有下一阶 */
export const shiftName = rodTier => rodTier >= 20 ? "品级继续提升" : `品级向第 ${rodTier + 1} 阶提升`

/**
 * 效果差值 b - a 的展示文字：[键, 名称, 单位, 倍率, 是否显示为减少]
 * 名称可以是函数，按鱼竿阶位给出具体品级
 */
const LINES = [
  ["rarePoints", t => rareTargetNames(t), "%", 1, false],
  ["rarityShift", t => shiftName(t), "%", 100, false],
  ["emptyReduce", "空军", "%", 1, true],
  ["junkReduce", "垃圾", "%", 1, true],
  ["largeBoost", "大体型", "%", 1, false],
  ["lineGuard", "断线", "%", 1, true],
  ["holdChance", "没及时收杆不跑鱼", "%", 1, false],
  ["biteReduce", "咬钩等待", "s", 1, true],
  ["reelWindow", "收杆时间", "s", 1, false],
  ["capacity", "鱼护容量", "格", 1, false],
  ["sellBonus", "出售金币", "%", 1, false],
]

/**
 * @param a 之前的效果  @param b 之后的效果（只看 a 时传 {} 与效果）
 * @param rodTier 穿戴中鱼竿的阶位，决定“高品级”“品级提升”的具体说法
 */
export function effectLines(a = {}, b = {}, rodTier = 1) {
  return LINES.map(([k, name, unit, mul, down]) => {
    const d = ((Number(b[k]) || 0) - (Number(a[k]) || 0)) * mul
    if (Math.abs(d) < 1e-9) return null
    const n = typeof name === "function" ? name(rodTier) : name
    return `${n} ${(d > 0) !== down ? "+" : "-"}${Number(Math.abs(d).toFixed(3))}${unit}`
  }).filter(Boolean)
}
