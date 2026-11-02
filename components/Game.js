/** 存档上的游戏结算逻辑（纯函数，便于测试） */
import { PERIODS, periodKey } from "./Period.js"
import { isDexFish } from "./ItemPool.js"

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
export function recordResult(user, result, { now = new Date(), policeReward = 0 } = {}) {
  touchPeriods(user, now)
  const s = user.stats
  if (result.type === "empty") {
    s.empty++
    return { value: 0, reward: 0, stored: false }
  }
  const { item } = result
  user.dex[item.id] = (user.dex[item.id] || 0) + 1

  let value = result.price || 0
  let reward = 0
  let stored = true

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
    if (item.rarity === "UR") s.ur++
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
