import test from "node:test"
import assert from "node:assert/strict"
import { activeBuffs, buffEffects, purchaseBuff } from "../components/Buffs.js"

test("旧存档不需要迁移", () => {
  assert.deepEqual(activeBuffs({}), [])
  assert.deepEqual(buffEffects({}), {})
})
test("购买、延时、到期和重启后存档读取", () => {
  const now = 1_700_000_000_000
  const user = { gold: 1000 }
  assert.equal(purchaseBuff(user, "幸运鱼符", now).ok, true)
  assert.equal(purchaseBuff(user, "幸运鱼符", now + 60_000).ok, true)
  assert.equal(user.gold, 600)
  assert.equal(buffEffects(user, now + 40 * 60_000).rareBoost, 2)
  assert.deepEqual(buffEffects(JSON.parse(JSON.stringify(user)), now + 61 * 60_000), {})
})
test("不同鱼符可叠加，余额不足不扣款", () => {
  const user = { gold: 350 }
  assert.equal(purchaseBuff(user, "幸运鱼符", 1000).ok, true)
  assert.equal(purchaseBuff(user, "迅捷鱼符", 1000).ok, true)
  assert.deepEqual(buffEffects(user, 2000), { rareBoost: 2, biteReduce: 2 })
  assert.equal(purchaseBuff(user, "巨物鱼符", 2000).reason, "gold")
  assert.equal(user.gold, 0)
})
