/** 第二阶段：角色成长。由累计统计推导，旧存档无需迁移。 */
const integer = value => Math.max(0, Math.floor(Number(value) || 0))

/** 经验来源：每次抛竿 1 点，成功钓获额外 4 点；累计统计不会因出售鱼获而丢失。 */
export function experience(user) {
  const stats = user?.stats || {}
  return integer(stats.casts) + integer(stats.catches) * 4 + integer(stats.bonusXp)
}

/** 到达指定等级所需的总经验；Lv1 为 0，升级曲线逐级递增。 */
export function levelThreshold(level) {
  const n = Math.max(1, integer(level))
  return 25 * (n - 1) * n
}

/** 等级上限 */
export const MAX_LEVEL = 100

/**
 * 等级进度；满级时 max 为 true，本级进度显示为已满（不再计算到 Lv101 的差值）
 */
export function characterProgress(user) {
  const xp = experience(user)
  // 25 * (level - 1) * level <= xp
  const level = Math.min(MAX_LEVEL, Math.max(1, Math.floor((1 + Math.sqrt(1 + 4 * xp / 25)) / 2)))
  const current = levelThreshold(level)
  if (level >= MAX_LEVEL) return { level, xp, currentXp: 0, requiredXp: 0, remainingXp: 0, percent: 100, max: true }
  const next = levelThreshold(level + 1)
  return {
    level, xp, currentXp: xp - current, requiredXp: next - current,
    remainingXp: next - xp, percent: Math.min(100, Math.floor((xp - current) / (next - current) * 100)), max: false,
  }
}

/** 指定经验对应的等级（1~100） */
export function levelAtXp(xp) {
  return characterProgress({ stats: { casts: xp } }).level
}

/**
 * 收杆后的经验提示：获得经验 + 距离下一级还需多少；升级时再加一行
 * 例：“✨ 获得经验：+34（距离 Lv23 还需 1,234）”
 */
export function xpGainText(user, beforeXp) {
  const p = characterProgress(user)
  const oldLevel = levelAtXp(Math.max(0, beforeXp))
  // 本来就已满级：不再显示经验
  if (oldLevel >= MAX_LEVEL) return ""
  const gain = Math.max(0, p.xp - beforeXp)
  const next = p.max ? "已满级" : `距离 Lv${p.level + 1} 还需 ${p.remainingXp.toLocaleString("en-US")}`
  return [
    `✨ 获得经验：+${gain}（${next}）`,
    ...(p.level > oldLevel ? [`🎉 等级提升：Lv${oldLevel} → Lv${p.level}${p.max ? " 🏆 已满级" : ""}`] : []),
  ].join("\n")
}
