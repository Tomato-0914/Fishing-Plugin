import test from "node:test"
import assert from "node:assert/strict"
import { experience, levelThreshold, characterProgress } from "../components/Progression.js"

test("旧存档没有 stats 也能计算", () => {
  assert.equal(characterProgress({}).level, 1)
  assert.equal(characterProgress({}).remainingXp, 50)
})

test("经验来源及等级边界", () => {
  assert.equal(experience({ stats: { casts: 10, catches: 10 } }), 50)
  assert.equal(characterProgress({ stats: { casts: 10, catches: 10 } }).level, 2)
  assert.equal(levelThreshold(3), 150)
  assert.equal(characterProgress({ stats: { casts: 150 } }).level, 3)
})

test("非法统计不会产生负经验", () => {
  assert.equal(experience({ stats: { casts: -3, catches: "bad" } }), 0)
})

test("满级：不再显示到 Lv101 的进度", () => {
  const p = characterProgress({ stats: { casts: levelThreshold(100) + 9506 } })
  assert.equal(p.level, 100)
  assert.equal(p.max, true)
  assert.deepEqual([p.currentXp, p.requiredXp, p.remainingXp, p.percent], [0, 0, 0, 100])
  assert.equal(characterProgress({ stats: { casts: levelThreshold(100) } }).max, true)
  const below = characterProgress({ stats: { casts: levelThreshold(100) - 1 } })
  assert.deepEqual([below.level, below.max, below.remainingXp], [99, false, 1])
})

import { limitXp, levelCfg, oldThreshold, levelAtXp, xpGainText } from "../components/Progression.js"
import { petThreshold } from "../components/Pet.js"
import { normalize } from "../components/UserData.js"

const day1 = new Date("2026-11-19T12:00:00+08:00")
const day2 = new Date("2026-11-20T12:00:00+08:00")
/** 模拟一次行动：stats.casts 增加 raw，再按每日规则结算 */
function act(user, raw, now = day1) {
  const before = experience(user)
  user.stats.casts = (user.stats.casts || 0) + raw
  return limitXp(user, before, now)
}

test("每日经验：6000 以内全额，超出按 20%，每天最多 15000，跨天重置", () => {
  const u = { stats: {} }
  assert.equal(act(u, 5000).gain, 5000)
  let r = act(u, 2000) // 1000 全额 + 1000×20%
  assert.deepEqual([r.gain, r.cut, r.got], [1200, 800, 6200])
  assert.equal(experience(u), 6200)
  r = act(u, 100000)
  assert.equal(r.got, 15000)
  assert.equal(experience(u), 15000)
  assert.equal(act(u, 500).gain, 0)
  assert.equal(experience(u), 15000)
  assert.equal(act(u, 500, day2).gain, 500)
  assert.equal(experience(u), 15500)
})

test("经验提示：达到全额线后显示今日进度和上限", () => {
  const u = { stats: {} }
  act(u, 5000)
  const before = experience(u)
  u.stats.casts += 60000
  const lim = limitXp(u, before, day1)
  assert.match(xpGainText(u, before, lim), /今日 15,000\/15,000 已达上限/)
  const v = { stats: {} }
  assert.doesNotMatch(xpGainText(v, 0, act(v, 10)), /今日/)
})

test("dailyMax 为 0 时不限制上限", () => {
  const c = { ...levelCfg(), dailySoft: 0, softRate: 100, dailyMax: 0 }
  const u = { stats: { casts: 50000 } }
  assert.equal(limitXp(u, 0, day1, c).gain, 50000)
})

test("升级曲线：Lv60 及以前与旧版相同，之后逐级变陡", () => {
  for (const n of [1, 2, 10, 30, 60]) assert.equal(levelThreshold(n), oldThreshold(n))
  const step = n => levelThreshold(n) - levelThreshold(n - 1)
  const old = n => oldThreshold(n) - oldThreshold(n - 1)
  assert.equal(step(61), Math.round(old(61) * 1.08))
  assert.equal(step(100), Math.round(old(100) * (1 + 0.08 * 40)))
  for (let n = 3; n <= 100; n++) assert.ok(step(n) > step(n - 1))
  assert.equal(levelAtXp(levelThreshold(77)), 77)
  assert.equal(levelAtXp(levelThreshold(77) - 1), 76)
})

test("宠物曲线保持为角色的 1.6 倍", () => {
  for (const n of [2, 30, 60, 61, 100]) assert.equal(petThreshold(n), Math.ceil(levelThreshold(n) * 40 / 25))
})

test("旧存档迁移：曲线变陡不会掉级（角色与宠物）", () => {
  const xp = oldThreshold(90) // 旧版 Lv90
  const user = normalize({ stats: { casts: xp }, pets: { owned: { koi: { xp: oldThreshold(80, 40) } } } })
  assert.equal(user.levelV, 2)
  assert.equal(user.levelFloor, 90)
  assert.equal(characterProgress(user).level, 90)
  assert.ok(levelAtXp(xp) < 90)
  assert.equal(user.pets.owned.koi.levelFloor, 80)
  // 已迁移的存档不会再改保底
  user.stats.casts = 0
  assert.equal(normalize(user).levelFloor, 90)
})
