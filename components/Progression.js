/**
 * 角色成长：经验由累计统计推导（旧存档无需迁移）
 * - 升级曲线：Lv60 以前每级所需经验与旧版相同，之后每级再逐级增加（level.curveGrowth）
 * - 每日经验：前 level.dailySoft 全额获得，超出部分按 level.softRate% 计，每天最多 level.dailyMax；
 *   没拿到的部分记入 stats.xpCut，从总经验里扣除
 * - 保底等级：调整曲线前已经达到的等级记在 levelFloor，不会因为曲线变陡而掉级
 */
import Config from "./Config.js"
import { periodKey } from "./Period.js"

const integer = value => Math.max(0, Math.floor(Number(value) || 0))

/** 等级上限 */
export const MAX_LEVEL = 100
/** 存档的成长规则版本：低于此版本的旧存档会记录保底等级 */
export const LEVEL_VERSION = 2

/** 成长设置（config.yaml level），补齐默认值 */
export function levelCfg(cfg = Config.config?.level) {
  const c = cfg || {}
  return {
    curveFrom: Math.max(1, integer(c.curveFrom ?? 60)),
    curveGrowth: Math.max(0, Number(c.curveGrowth ?? 0.08) || 0),
    dailySoft: integer(c.dailySoft ?? 6000),
    softRate: Math.min(100, Math.max(0, Number(c.softRate ?? 20) || 0)),
    dailyMax: integer(c.dailyMax ?? 15000),
  }
}

/** 经验来源：每次抛竿 1 点，成功钓获额外 4 点（另按品级加成）；减去因每日上限没拿到的部分 */
export function experience(user) {
  const stats = user?.stats || {}
  return Math.max(0, integer(stats.casts) + integer(stats.catches) * 4 + integer(stats.bonusXp) - integer(stats.xpCut))
}

/** 旧版曲线：25 × N × (N-1)（用于计算保底等级、宠物旧等级） */
export const oldThreshold = (level, factor = 25) => factor * Math.max(0, level - 1) * Math.max(1, level)
export function oldLevelAt(xp, factor = 25) {
  return Math.min(MAX_LEVEL, Math.max(1, Math.floor((1 + Math.sqrt(1 + 4 * integer(xp) / factor)) / 2)))
}

let curveCache = { key: "", list: [] }
function curve(c = levelCfg()) {
  const key = `${c.curveFrom}|${c.curveGrowth}`
  if (curveCache.key === key) return curveCache.list
  const list = [0, 0]
  for (let n = 2; n <= MAX_LEVEL; n++) {
    const step = oldThreshold(n) - oldThreshold(n - 1)
    list[n] = list[n - 1] + Math.round(step * (n > c.curveFrom ? 1 + c.curveGrowth * (n - c.curveFrom) : 1))
  }
  curveCache = { key, list }
  return list
}

/** 到达指定等级所需的总经验；Lv1 为 0 */
export function levelThreshold(level, c = levelCfg()) {
  const n = Math.min(MAX_LEVEL, Math.max(1, integer(level)))
  return curve(c)[n]
}

/** 指定经验对应的等级（1~100），不含保底 */
export function levelAtXp(xp, c = levelCfg()) {
  const list = curve(c), v = integer(xp)
  let lo = 1, hi = MAX_LEVEL
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); list[mid] <= v ? lo = mid : hi = mid - 1 }
  return lo
}

/** 等级进度；满级时 max 为 true，本级进度显示为已满（不再计算到 Lv101 的差值） */
export function characterProgress(user, c = levelCfg()) {
  const xp = experience(user)
  const level = Math.max(levelAtXp(xp, c), Math.min(MAX_LEVEL, integer(user?.levelFloor)))
  if (level >= MAX_LEVEL) return { level: MAX_LEVEL, xp, currentXp: 0, requiredXp: 0, remainingXp: 0, percent: 100, max: true }
  const current = levelThreshold(level, c), next = levelThreshold(level + 1, c)
  const currentXp = Math.max(0, xp - current)
  return {
    level, xp, currentXp, requiredXp: next - current,
    remainingXp: Math.max(0, next - xp), percent: Math.min(100, Math.floor(currentXp / (next - current) * 100)), max: false,
  }
}

/** 今日经验状态（跨天自动清零）：raw 本来应得，got 实际获得 */
export function xpToday(user, now = new Date()) {
  const day = periodKey("day", now)
  const d = user.xpDay
  return d && d.day === day ? d : { day, raw: 0, got: 0 }
}

/**
 * 按每日规则结算一次获得的经验：before 为这次行动前的经验
 * 超出 dailySoft 的部分按 softRate% 计，每天最多 dailyMax；没拿到的计入 stats.xpCut
 * @returns {{ gain, cut, got, max, soft }} gain 为实际获得
 */
export function limitXp(user, before, now = new Date(), c = levelCfg()) {
  const raw = Math.max(0, experience(user) - integer(before))
  const t = xpToday(user, now)
  const curveAt = r => Math.min(c.dailyMax || Infinity, Math.min(r, c.dailySoft) + c.softRate / 100 * Math.max(0, r - c.dailySoft))
  const gain = raw ? Math.max(0, Math.round(curveAt(t.raw + raw) - curveAt(t.raw))) : 0
  const cut = raw - gain
  if (raw) {
    user.stats ||= {}
    if (cut > 0) user.stats.xpCut = integer(user.stats.xpCut) + cut
    user.xpDay = { day: t.day, raw: t.raw + raw, got: t.got + gain }
  }
  return { gain, cut, got: user.xpDay?.day === t.day ? user.xpDay.got : t.got, max: c.dailyMax, soft: c.dailySoft }
}

/**
 * 收杆后的经验提示：获得经验 + 距离下一级还需多少；升级时再加一行；本来就已满级时不显示
 * 例：“✨ 获得经验：+34（距离 Lv23 还需 1,234 · 今日 6,800/15,000）”
 */
export function xpGainText(user, beforeXp, lim = null, c = levelCfg()) {
  const p = characterProgress(user, c)
  const oldLevel = Math.max(levelAtXp(Math.max(0, beforeXp), c), Math.min(MAX_LEVEL, integer(user?.levelFloor)))
  if (oldLevel >= MAX_LEVEL) return ""
  const gain = Math.max(0, p.xp - beforeXp)
  const next = p.max ? "已满级" : `距离 Lv${p.level + 1} 还需 ${p.remainingXp.toLocaleString("en-US")}`
  const today = lim && lim.max > 0 && (lim.cut > 0 || lim.got >= lim.soft)
    ? ` · 今日 ${lim.got.toLocaleString("en-US")}/${lim.max.toLocaleString("en-US")}${lim.got >= lim.max ? " 已达上限" : ""}`
    : ""
  return [
    `✨ 获得经验：+${gain}（${next}${today}）`,
    ...(p.level > oldLevel ? [`🎉 等级提升：Lv${oldLevel} → Lv${p.level}${p.max ? " 🏆 已满级" : ""}`] : []),
  ].join("\n")
}
