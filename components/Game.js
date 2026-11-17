/** 存档上的游戏结算逻辑（纯函数，便于测试） */
import { PERIODS, periodKey } from "./Period.js"
import { isDexFish, entryPrice } from "./ItemPool.js"
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

/** 每条成功入护鱼的经验（抛竿经验另计）；旧存档每条 4 经验保持不变。 */
export const FISH_XP = Object.freeze({ N: 4, R: 6, SR: 10, SSR: 16, UR: 25, EP: 40, MR: 60, hidden: 80 })

/** 记录一次收杆结果；经验差额与鱼获统计一起写入存档。 */
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

  // 保护鱼类：放生，钓鱼人被警察带走（禁渔）并罚款，不计入排行
  if (item.special === "protected") {
    s.protected = (s.protected || 0) + 1
    delete user.protectedDay
    const fine = protectedFine(user.gold, protectedPenalty)
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
    else {
      s.catches++
      // 历史钓获按每条 4 经验保留；新钓获只累计高于基准的差额。
      s.bonusXp = (s.bonusXp || 0) + Math.max(0, (FISH_XP[item.rarity] || 4) - 4)
    }
    if (item.id === "ocean_heart") s.heart++
    // 传说猎人按传说及以上计数；史诗、神话另外单独记录
    if (["UR", "EP", "MR"].includes(item.rarity)) s.ur++
    if (item.rarity === "EP") s.ep = (s.ep || 0) + 1
    if (item.rarity === "MR") s.mr = (s.mr || 0) + 1
    const entry = { id: item.id, p: result.price || 0, t: now.getTime() }
    if (result.size) entry.s = result.size
    if (result.weight != null) entry.w = result.weight
    if (result.mult && result.mult !== 1) entry.m = result.mult
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

/** 每个群每天最多钓到几条保护鱼类（protectedPenalty.groupDailyMax，默认 5；0 为不限制） */
export const groupProtectedMax = penalty => Math.max(0, Math.floor(Number(penalty?.groupDailyMax ?? 5) || 0))

/**
 * 误钓保护鱼类的罚款
 * - goldRate > 0：按当前金币的 goldRate% 罚款，gold 为上限
 * - 未设置 goldRate：固定罚 gold
 * 都不会超过当前金币（扣到 0 为止）
 */
export function protectedFine(gold, penalty = {}) {
  const have = Math.max(0, Number(gold) || 0)
  const cap = Math.max(0, Number(penalty.gold) || 0)
  const rate = Math.max(0, Number(penalty.goldRate) || 0)
  const fine = rate > 0 ? Math.min(cap, Math.floor(have * rate / 100)) : cap
  return Math.min(have, fine)
}

/** 鱼护里的鱼按当前鱼价重新定价（调整 items.yaml 后旧鱼获同步生效），返回改动条数 */
export function repriceBag(user, itemMap, size = {}) {
  let changed = 0
  for (const e of user.bag || []) {
    const p = entryPrice(e, itemMap.get(e.id), size)
    if (p != null && p !== e.p) { e.p = p; changed++ }
  }
  return changed
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

/** 打卡奖励档位（config.yaml 的 checkin.rewards 可覆盖）：幸运值 ≥ min 时送“渔具阶位 - drop”阶鱼饵 × count */
export const DEFAULT_CHECKIN_REWARDS = [
  { min: 90, drop: 0, count: 10 },
  { min: 70, drop: 0, count: 6 },
  { min: 30, drop: 0, count: 4 },
  { min: 10, drop: 1, count: 4 },
  { min: 0, drop: 2, count: 3 },
]

/**
 * 打卡奖励：鱼饵阶位跟着渔具走，数量按幸运值
 * @param tier 玩家穿戴渔具的最高阶位（= 能用的最高阶鱼饵），运气差时降一 / 两阶，最低 1 阶
 * @returns {{ level, count, bait, drop } | null}
 */
export function checkinReward(luck, baits = [], tier = 1, rewards = DEFAULT_CHECKIN_REWARDS) {
  luck = Math.max(0, Math.floor(Number(luck) || 0))
  const row = [...(rewards?.length ? rewards : DEFAULT_CHECKIN_REWARDS)].sort((a, b) => b.min - a.min).find(r => luck >= Number(r.min))
  if (!row || !(Number(row.count) > 0)) return null
  const drop = Math.max(0, Number(row.drop) || 0)
  const level = Math.max(1, Math.floor(Number(tier) || 1) - drop)
  // 找对应等级的鱼饵；自定义鱼饵表缺这一级时，退到不超过它的最高级
  const lv = b => Math.max(1, Number(b?.level) || 1)
  const bait = baits.find(b => lv(b) === level) ||
    [...baits].filter(b => lv(b) <= level).sort((a, b) => lv(b) - lv(a))[0]
  return bait ? { level: lv(bait), count: Math.floor(Number(row.count)), bait, drop } : null
}

/* ==================== 十连次数 ==================== */

/** 今天的十连状态 { day, used, bonus }：跨天时重置 used；bonus 为旧版攒下的额外机会（不再新增，用完为止） */
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

/* ==================== 百连 / 千连次数 ==================== */

/** 某个玩法今天的次数状态 user[key] = { day, used }：跨天重置（key 为 hundred / thousand …） */
export function dailyState(user, key, now = new Date()) {
  const today = periodKey("day", now)
  user[key] ||= { day: today, used: 0 }
  if (user[key].day !== today) { user[key].day = today; user[key].used = 0 }
  user[key].used = Math.max(0, Number(user[key].used) || 0)
  return user[key]
}

/** 今日剩余次数 */
export const dailyLeft = (user, key, daily, now = new Date()) => Math.max(0, Number(daily) - dailyState(user, key, now).used)

/** 消耗一次，没有次数返回 false */
export function useDaily(user, key, daily, now = new Date()) {
  const d = dailyState(user, key, now)
  if (d.used >= Number(daily)) return false
  d.used++
  return true
}

export const hundredState = (user, now = new Date()) => dailyState(user, "hundred", now)
export const hundredLeft = (user, daily = 10, now = new Date()) => dailyLeft(user, "hundred", daily, now)
export const useHundred = (user, daily = 10, now = new Date()) => useDaily(user, "hundred", daily, now)

/* ==================== 冷却 ==================== */

/** 各玩法独立冷却，存在存档里（重启不丢）：cast 单钓 / multi 十连 / hundred 百连，以后的新玩法加一个 kind 即可 */
export const COOLDOWN_LABELS = { cast: "钓鱼", multi: "十连", hundred: "百连", thousand: "千连" }

/** 剩余冷却（秒，向上取整），没有冷却为 0 */
export function cooldownLeft(user, kind, now = Date.now()) {
  return Math.max(0, Math.ceil(((Number(user?.cd?.[kind]) || 0) - now) / 1000))
}

/** 设置冷却（秒）；0 表示清除 */
export function setCooldown(user, kind, seconds, now = Date.now()) {
  user.cd ||= {}
  if (seconds > 0) user.cd[kind] = now + seconds * 1000
  else delete user.cd[kind]
}

/** 冷却时间文字：45 秒 / 12 分 30 秒 / 1 小时 5 分 */
export function cooldownText(sec) {
  sec = Math.max(0, Math.ceil(sec))
  if (sec < 60) return `${sec} 秒`
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60
  return h ? `${h} 小时${m ? ` ${m} 分` : ""}` : `${m} 分${s ? ` ${s} 秒` : ""}`
}
