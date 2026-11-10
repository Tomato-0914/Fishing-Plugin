/** 称号：分级判定与效果汇总（纯函数） */
import { isDexFish } from "./ItemPool.js"

export const ROMAN = ["", "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ"]

/** 统计值：fails 为空军 + 跑鱼 + 收杆过早之和，dex 为已收集鱼类种数，checkinDays 为累计打卡天数 */
export function statValue(user, stat, items = []) {
  const s = user.stats || {}
  if (stat === "fails") return (s.empty || 0) + (s.escaped || 0) + (s.early || 0)
  if (stat === "dex") return items.filter(isDexFish).filter(i => user.dex?.[i.id]).length
  if (stat === "checkinDays") return user.checkin?.total || 0
  return s[stat] || 0
}

/** 第 i 级（从 1 开始）的门槛；need: all 表示集齐图鉴中的全部鱼类 */
export function tierNeed(t, i, items = []) {
  const need = t.tiers?.[i - 1]?.need
  if (need === "all") {
    const n = items.filter(isDexFish).length
    return n || Infinity
  }
  return Number(need) || Infinity
}

/** 按当前统计算出的等级（0 表示还没有） */
export function computeTier(user, t, items = []) {
  const v = statValue(user, t.stat, items)
  let tier = 0
  for (let i = 1; i <= (t.tiers?.length || 0); i++) if (v >= tierNeed(t, i, items)) tier = i
  return tier
}

/** 当前拥有的等级：存档记录与统计取较大值（称号获得后不会失去） */
export function ownedTier(user, t, items = []) {
  return Math.max(Number(user.titleLv?.[t.id]) || 0, computeTier(user, t, items))
}

export const titleName = (t, tier) => `${t.name}${ROMAN[tier] || ""}`

/** 检查称号升级，返回本次新获得 / 升级的称号 [{ title, tier, from }] */
export function checkTitles(user, titles = [], items = []) {
  user.titleLv ||= {}
  const got = []
  for (const t of titles) {
    const from = Number(user.titleLv[t.id]) || 0
    const tier = Math.max(from, computeTier(user, t, items))
    if (tier > from) {
      user.titleLv[t.id] = tier
      got.push({ title: t, tier, from })
    }
  }
  user.titles = titles.filter(t => user.titleLv[t.id]).map(t => t.id)
  return got
}

/** 已拥有的称号 [{ title, tier }] */
export function ownedTitles(user, titles = [], items = []) {
  return titles.map(t => ({ title: t, tier: ownedTier(user, t, items) })).filter(x => x.tier > 0)
}

/** 某个称号某一级的效果 */
export const tierEffects = (t, tier) => t.tiers?.[tier - 1]?.effects || {}

/** 汇总称号效果：同一称号只取最高一级，不同称号之间相加 */
export function getEffects(user, titles = [], items = []) {
  return mergeEffects(...ownedTitles(user, titles, items).map(({ title, tier }) => tierEffects(title, tier)))
}

/** 进度文字：距离下一级，例如 “1234/3000”；已满级返回 “已满级” */
export function progressText(user, t, items = []) {
  const tier = ownedTier(user, t, items)
  if (tier >= (t.tiers?.length || 0)) return "已满级"
  const need = tierNeed(t, tier + 1, items)
  const fmt = n => Number(n).toLocaleString("en-US")
  return `${fmt(Math.min(statValue(user, t.stat, items), need))}/${fmt(need)}`
}

/** 获得 / 升级称号的提示文字 */
export function titleUpText(got, who = "") {
  return got.map(({ title, tier, from }) => [
    `🏅 恭喜${who ? ` ${who} ` : ""}${from ? "称号升级" : "获得称号"}【${title.emoji} ${titleName(title, tier)}】`,
    `✨ 效果：${effectText(tierEffects(title, tier))}`,
  ].join("\n")).join("\n\n")
}

/** 称号条件文字：desc 中的 {n} 替换为门槛 */
export function titleDesc(t, tier, items = []) {
  const need = tierNeed(t, tier, items)
  return String(t.desc || "").replace("{n}", t.tiers?.[tier - 1]?.need === "all" ? `全部 ${need}` : need.toLocaleString("en-US"))
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
  holdChance: ["没及时收杆时不跑鱼", "%", false],
  multiCdReduce: ["十连间隔", "%", true],
  boostN: ["普通概率", "%", false],
  boostR: ["优良概率", "%", false],
  boostSR: ["稀有概率", "%", false],
  boostSSR: ["史诗概率", "%", false],
  boostUR: ["传说概率", "%", false],
}

const TIER_NAMES = { boostN: "普通", boostR: "优良", boostSR: "稀有", boostSSR: "史诗", boostUR: "传说" }

export function effectText(effects = {}) {
  // 分档加成合成一段：普通+4% 优良+7% 稀有+7%
  const tiers = Object.keys(TIER_NAMES).filter(k => Number(effects[k]))
    .map(k => `${TIER_NAMES[k]}+${Number(Number(effects[k]).toFixed(2))}%`).join(" ")
  const parts = Object.entries(effects).filter(([k, v]) => Number(v) && !TIER_NAMES[k]).map(([k, v]) => {
    const [name, unit, inverse] = EFFECT_TEXT[k] || [k, "", false]
    const up = inverse ? v < 0 : v > 0
    if (k === "lineGuard" && v >= 100) return `${name} -100%（不再断线）`
    if (k === "holdChance") return `${name} ${v}%`
    return `${name} ${up ? "+" : "-"}${Math.abs(v)}${unit}`
  })
  if (tiers) parts.unshift(tiers)
  return parts.length ? parts.join("，") : "无"
}

/** 合并多组效果（数值相加） */
export function mergeEffects(...list) {
  const out = {}
  for (const eff of list) for (const [k, v] of Object.entries(eff || {})) out[k] = (out[k] || 0) + Number(v)
  return out
}

