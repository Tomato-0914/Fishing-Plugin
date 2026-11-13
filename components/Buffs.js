/** 第二阶段限时状态：持久化到用户存档，重启后按绝对时间戳计算剩余时长。 */
export const BUFFS = Object.freeze([
  { id: "lucky", name: "幸运鱼符", emoji: "🍀", price: 200, duration: 30 * 60_000, effects: { rareBoost: 2 } },
  { id: "swift", name: "迅捷鱼符", emoji: "⚡", price: 150, duration: 30 * 60_000, effects: { biteReduce: 2 } },
  { id: "giant", name: "巨物鱼符", emoji: "🐋", price: 250, duration: 30 * 60_000, effects: { largeBoost: 3 } },
])
export const buffDef = value => BUFFS.find(b => b.id === String(value).trim() || b.name === String(value).trim())
export function activeBuffs(user, now = Date.now()) {
  const state = user?.buffs
  if (!state || typeof state !== "object" || Array.isArray(state)) return []
  return BUFFS.flatMap(b => {
    const expiresAt = Number(state[b.id])
    return Number.isFinite(expiresAt) && expiresAt > now ? [{ ...b, expiresAt, remaining: expiresAt - now }] : []
  })
}
export function buffEffects(user, now = Date.now()) {
  const effects = {}
  for (const b of activeBuffs(user, now)) for (const [key, value] of Object.entries(b.effects))
    effects[key] = (effects[key] || 0) + value
  return effects
}
export function purchaseBuff(user, name, now = Date.now()) {
  const buff = buffDef(name)
  if (!buff) return { ok: false, reason: "unknown" }
  if (!Number.isFinite(now)) return { ok: false, reason: "time" }
  const gold = Number(user.gold)
  if (!Number.isFinite(gold) || gold < buff.price) return { ok: false, reason: "gold", cost: buff.price }
  if (!user.buffs || typeof user.buffs !== "object" || Array.isArray(user.buffs)) user.buffs = {}
  // 同类 Buff 不叠加倍率，而是从当前到期时间延长；不同 Buff 效果可相加。
  const previous = Number(user.buffs[buff.id])
  const base = Number.isFinite(previous) ? Math.max(now, previous) : now
  user.buffs[buff.id] = base + buff.duration
  user.gold = gold - buff.price
  return { ok: true, buff, expiresAt: user.buffs[buff.id] }
}
export const durationText = ms => {
  const min = Math.ceil(Math.max(0, ms) / 60_000)
  return min >= 60 ? `${Math.floor(min / 60)}小时${min % 60}分钟` : `${min}分钟`
}
