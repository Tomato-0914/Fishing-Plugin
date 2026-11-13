/** 存档上的游戏结算逻辑（纯函数，便于测试） */
import { PERIODS, periodKey } from "./Period.js"
import { isDexFish } from "./ItemPool.js"
import { addBait, totalBait } from "./Gear.js"

/** 过期周期惰性清零 */
export function touchPeriods(user, now = new Date()) {
  user.period ||= {}
  for (const type of Object.keys(PERIODS)) {
    const key = periodKey(type, now)
    if (user.period[type]?.key !== key) user.period[type] = { key, value: 0, count: 0 }
  }
  return user.period
}

/** 读取某周期数据（过期返回 0，不修改存档） */
export function periodStat(user, type, now = new Date()) {
  const p = user.period?.[type]
  return p && p.key === periodKey(type, now) ? p : { value: 0, count: 0 }
}

export function addGroup(user, groupId) {
  if (!groupId) return
  groupId = String(groupId)
  user.groups ||= []
  if (!user.groups.includes(groupId)) user.groups.push(groupId)
}

/**
 * 记录一次收杆结果
 * @returns {{ value:number, reward:number, stored:boolean }}
 */
export function recordResult(user, result, { now = new Date(), policeReward = 0, protectedPenalty = {}, paimonGift = 0 } = {}) {
  touchPeriods(user, now)
  const s = user.stats
  if (result.type === "empty") {
    s.empty++
    return { value: 0, reward: 0, stored: false }
  }
  const { item } = result
  user.dex[item.id] = (user.dex[item.id] || 0) + 1
  // 图鉴个人记录：首次钓到时间、最重、最值钱
  user.records ||= {}
  const rec = (user.records[item.id] ||= { first: now.getTime() })
  if (result.weight != null && result.weight > (rec.maxW || 0)) { rec.maxW = result.weight; rec.maxS = result.size }
  if ((result.price || 0) > (rec.maxP || 0)) rec.maxP = result.price

  let value = result.price || 0
  let reward = 0
  let stored = true

  // 保护动物：自动放生，禁渔并罚款（金币不足时扣到 0 为止），不计入排行
  if (item.special === "protected") {
    s.protected = (s.protected || 0) + 1
    const fine = Math.min(Math.max(0, user.gold), Math.max(0, Number(protectedPenalty.gold) || 0))
    user.gold -= fine
    const minutes = Math.max(0, Number(protectedPenalty.banMinutes) || 0)
    if (minutes) user.banUntil = Math.max(Number(user.banUntil) || 0, now.getTime() + minutes * 60000)
    return { value: 0, reward: 0, stored: false, penalty: { fine, minutes, banUntil: user.banUntil } }
  }

  // 派蒙：不进鱼护；第一次钓到由称号「最好的伙伴」奖励，之后每次送一份谢礼
  if (item.special === "paimon") {
    s.paimon = (s.paimon || 0) + 1
    const gift = s.paimon > 1 ? Math.max(0, Number(paimonGift) || 0) : 0
    user.gold += gift
    return { value: 0, reward: gift, stored: false, paimon: { first: s.paimon === 1, gift } }
  }

  if (item.special === "police") {
    // 人民碎片：报警领取奖励，不进鱼护
    s.police++
    reward = Number(policeReward) || 0
    value = reward
    user.gold += reward
    stored = false
  } else {
    if (item.rarity === "junk") s.junk++
    else s.catches++
    if (item.id === "ocean_heart") s.heart++
    // 传说猎人按传说及以上计数；史诗、神话另外单独记录
    if (["UR", "EP", "MR"].includes(item.rarity)) s.ur++
    if (item.rarity === "EP") s.ep = (s.ep || 0) + 1
    if (item.rarity === "MR") s.mr = (s.mr || 0) + 1
    const entry = { id: item.id, p: result.price || 0, t: now.getTime() }
    if (result.size) entry.s = result.size
    if (result.weight != null) entry.w = result.weight
    user.bag.push(entry)
    if (isDexFish(item) && result.weight != null && (!user.maxFish || result.weight > user.maxFish.w) && item.rarity !== "junk")
      user.maxFish = { id: item.id, w: result.weight, s: result.size }
  }

  s.earned += value
  for (const type of Object.keys(PERIODS)) {
    user.period[type].value += value
    user.period[type].count++
  }
  return { value, reward, stored }
}

/** 出售：entries 为要卖出的鱼护条目，返回实际获得金币 */
export function sellEntries(user, entries, sellBonus = 0) {
  const set = new Set(entries)
  const base = entries.reduce((sum, e) => sum + (e.p || 0), 0)
  const gold = Math.round(base * (1 + (Number(sellBonus) || 0) / 100))
  user.bag = user.bag.filter(e => !set.has(e))
  user.gold += gold
  user.stats.sold += gold
  return { count: entries.length, base, gold }
}

/** 集中清理垃圾 */
export function discardJunk(user, itemMap) {
  const junk = user.bag.filter(e => itemMap.get(e.id)?.rarity === "junk")
  if (!junk.length) return 0
  const set = new Set(junk)
  user.bag = user.bag.filter(e => !set.has(e))
  user.stats.junkCleaned += junk.length
  return junk.length
}

/** 鱼护按物品聚合：[{ item, count, total, sizes:{small,medium,large} }] */
export function groupBag(user, itemMap) {
  const map = new Map()
  for (const e of user.bag) {
    const item = itemMap.get(e.id) || { id: e.id, name: e.id, emoji: "❔", rarity: "N" }
    let g = map.get(e.id)
    if (!g) map.set(e.id, (g = { item, count: 0, total: 0, sizes: {} }))
    g.count++
    g.total += e.p || 0
    if (e.s) g.sizes[e.s] = (g.sizes[e.s] || 0) + 1
  }
  return [...map.values()]
}

/** 第一次钓鱼：赠送新手鱼饵（普通饵），返回赠送数量（已领取过或老用户返回 0） */
export function welcome(user, initial = 10) {
  if (user.welcomed) return 0
  user.welcomed = true
  if (user.stats?.casts > 0) return 0
  const n = Math.max(0, Number(initial) || 0)
  addBait(user, "basic", n)
  return n
}

/** 是否新玩家：没领过新手礼包，且从未抛过竿（老用户按抛竿次数判断，不再赠送） */
export function isNewPlayer(user) {
  return !user.welcomed && !(user.stats?.casts > 0)
}

/**
 * 救济鱼饵：一个鱼饵都没有、买不起普通饵、鱼护里也没有能卖的鱼时，每天发放一次普通饵
 * @returns 发放数量，不满足条件返回 0
 */
export function reliefBait(user, { amount = 0, price = 0, hasSellable = false, usable, now = new Date() } = {}) {
  amount = Math.floor(Number(amount) || 0)
  // usable：能用的鱼饵数（等级不够的高级鱼饵不算），不传时按全部库存
  if (amount < 1 || (usable ?? totalBait(user)) > 0 || user.gold >= price || hasSellable) return 0
  const today = periodKey("day", now)
  if (user.reliefDay === today) return 0
  user.reliefDay = today
  addBait(user, "basic", amount)
  return amount
}

/* ==================== 每日打卡 ==================== */

/** 今天的幸运值，未打卡返回 null */
export function todayLuck(user, now = new Date()) {
  const c = user.checkin
  return c && c.day === periodKey("day", now) ? c.luck : null
}

/** 幸运值对应的等级（tiers 按 min 从高到低匹配） */
export function luckTier(luck, tiers = []) {
  if (luck == null) return null
  return [...tiers].sort((a, b) => b.min - a.min).find(t => luck >= t.min) || null
}

/** 今日幸运带来的钓鱼效果，未打卡为空 */
export function luckEffects(user, tiers = [], now = new Date()) {
  return luckTier(todayLuck(user, now), tiers)?.effects || {}
}

/**
 * 打卡
 * @returns {{ already:boolean, luck:number, streak:number, total:number }}
 */
export function doCheckin(user, luck, now = new Date()) {
  const c = user.checkin
  const today = periodKey("day", now)
  if (c.day === today) return { already: true, luck: c.luck, streak: c.streak, total: c.total }
  const yesterday = periodKey("day", new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  c.streak = c.day === yesterday ? (c.streak || 0) + 1 : 1
  c.total = (c.total || 0) + 1
  c.day = today
  c.luck = luck
  c.time = now.getTime()
  c.history = [{ d: today, l: luck }, ...(c.history || [])].slice(0, 30)
  return { already: false, luck, streak: c.streak, total: c.total }
}

/** 0~100 的随机幸运值 */
export const randomLuck = (rng = Math.random) => Math.floor(rng() * 101)

/**
 * 打卡奖励：按幸运值决定送什么鱼饵、送几个
 * 每 10 点一档：1~10 送 1 级鱼饵，11~20 送 2 级 … 91~100 送 10 级；数量为在本档的位置（1~10 个）；幸运值 0 不送
 * 例：7 → 1 级 ×7，10 → 1 级 ×10，54 → 6 级 ×4，100 → 10 级 ×10
 * @returns {{ level, count, bait } | null}
 */
export function checkinReward(luck, baits = []) {
  luck = Math.floor(Number(luck) || 0)
  if (luck < 1) return null
  const level = Math.min(10, Math.ceil(luck / 10))
  const count = luck - (level - 1) * 10
  // 找对应等级的鱼饵；自定义鱼饵表缺这一级时，退到不超过它的最高级
  const lv = b => Math.max(1, Number(b?.level) || 1)
  const bait = baits.find(b => lv(b) === level) ||
    [...baits].filter(b => lv(b) <= level).sort((a, b) => lv(b) - lv(a))[0]
  return bait ? { level, count, bait } : null
}

/* ==================== 十连次数 ==================== */

/** 今天的十连状态 { day, used, bonus }：跨天时重置 used，额外机会 bonus 保留 */
export function multiState(user, now = new Date()) {
  const today = periodKey("day", now)
  user.multi ||= { day: today, used: 0, bonus: 0 }
  if (user.multi.day !== today) { user.multi.day = today; user.multi.used = 0 }
  user.multi.bonus = Math.max(0, Number(user.multi.bonus) || 0)
  return user.multi
}

/** 剩余次数：free 今日免费次数，bonus 额外机会 */
export function multiLeft(user, daily = 10, now = new Date()) {
  const m = multiState(user, now)
  return { free: Math.max(0, Number(daily) - m.used), bonus: m.bonus }
}

/** 消耗一次十连：先用今日次数，再用额外机会；没有次数返回 null */
export function useMulti(user, daily = 10, now = new Date()) {
  const m = multiState(user, now)
  if (m.used < Number(daily)) { m.used++; return "free" }
  if (m.bonus > 0) { m.bonus--; return "bonus" }
  return null
}

/** 获得一次额外十连机会（不超过上限），返回是否获得 */
export function grantMultiTicket(user, max = 50, now = new Date()) {
  const m = multiState(user, now)
  if (m.bonus >= Number(max)) return false
  m.bonus++
  return true
}
