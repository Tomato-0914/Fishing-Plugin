/** 日 / 周 / 月 周期 key（本地时区） */

const pad = n => String(n).padStart(2, "0")

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** ISO 周：周一为一周开始，以周四所在年份为准 */
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum) // 移到本周四
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${pad(week)}`
}

export function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export const PERIODS = {
  day: { key: dayKey, label: "今日" },
  week: { key: weekKey, label: "本周" },
  month: { key: monthKey, label: "本月" },
}

export function periodKey(type, d = new Date()) {
  return PERIODS[type].key(d)
}
