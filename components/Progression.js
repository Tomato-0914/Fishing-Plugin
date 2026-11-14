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

export function characterProgress(user) {
  const xp = experience(user)
  // 25 * (level - 1) * level <= xp
  const level = Math.min(100, Math.max(1, Math.floor((1 + Math.sqrt(1 + 4 * xp / 25)) / 2)))
  const current = levelThreshold(level)
  const next = levelThreshold(level + 1)
  return {
    level, xp, currentXp: xp - current, requiredXp: next - current,
    remainingXp: next - xp, percent: Math.min(100, Math.floor((xp - current) / (next - current) * 100)),
  }
}
