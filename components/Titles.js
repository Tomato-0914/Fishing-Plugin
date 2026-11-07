/** 称号：获取判定与效果汇总（纯函数） */
import { isDexFish } from "./ItemPool.js"

/** 统计值：fails 为空军 + 跑鱼 + 收杆过早之和 */
export function statValue(user, stat) {
  const s = user.stats || {}
  if (stat === "fails") return (s.empty || 0) + (s.escaped || 0) + (s.early || 0)
  return s[stat] || 0
}

export function meetCondition(user, cond = {}, items = []) {
  if (cond.dex) {
    const fish = items.filter(isDexFish)
    return fish.length > 0 && fish.every(i => user.dex?.[i.id])
  }
  if (cond.stat) return statValue(user, cond.stat) >= (cond.gte ?? 1)
  return false
}

/** 检查并发放新称号，返回本次新获得的称号列表 */
export function checkTitles(user, titles = [], items = []) {
  user.titles ||= []
  const got = []
  for (const t of titles) {
    if (user.titles.includes(t.id)) continue
    if (meetCondition(user, t.condition, items)) {
      user.titles.push(t.id)
      got.push(t)
    }
  }
  return got
}

/** 汇总已拥有称号的效果：rareBoost 等均为加法叠加（不同称号之间） */
export function getEffects(user, titles = []) {
  const eff = {}
  for (const t of titles) {
    if (!user.titles?.includes(t.id)) continue
    for (const [k, v] of Object.entries(t.effects || {})) eff[k] = (eff[k] || 0) + Number(v)
  }
  return eff
}

/** 效果文字：[名称, 单位, 正数是否表示“减少”] */
const EFFECT_TEXT = {
  biteReduce: ["咬钩等待", "s", true],
  reelWindow: ["收杆时间", "s", false],
  cooldown: ["挂鱼饵时间", "s", true],
  emptyReduce: ["空军概率", "%", true],
  junkReduce: ["垃圾概率", "%", true],
  rareBoost: ["稀有以上概率", "%", false],
  largeBoost: ["大体型概率", "%", false],
  sellBonus: ["出售金币", "%", false],
  lineGuard: ["断线概率", "%", true],
}

export function effectText(effects = {}) {
  const parts = Object.entries(effects).filter(([, v]) => Number(v)).map(([k, v]) => {
    const [name, unit, inverse] = EFFECT_TEXT[k] || [k, "", false]
    const up = inverse ? v < 0 : v > 0
    if (k === "lineGuard" && v >= 100) return `${name} -100%（不再断线）`
    return `${name} ${up ? "+" : "-"}${Math.abs(v)}${unit}`
  })
  return parts.length ? parts.join("，") : "无"
}

/** 合并多组效果（数值相加） */
export function mergeEffects(...list) {
  const out = {}
  for (const eff of list) for (const [k, v] of Object.entries(eff || {})) out[k] = (out[k] || 0) + Number(v)
  return out
}

/** 称号进度文字，例如 “32/50” */
export function progressText(user, t, items = []) {
  const c = t.condition || {}
  if (c.dex) {
    const fish = items.filter(isDexFish)
    return `${fish.filter(i => user.dex?.[i.id]).length}/${fish.length}`
  }
  if (c.stat) return `${Math.min(statValue(user, c.stat), c.gte ?? 1)}/${c.gte ?? 1}`
  return ""
}
