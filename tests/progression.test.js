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
  const p = characterProgress({ stats: { casts: 257006 } })
  assert.equal(p.level, 100)
  assert.equal(p.max, true)
  assert.deepEqual([p.currentXp, p.requiredXp, p.remainingXp, p.percent], [0, 0, 0, 100])
  assert.equal(characterProgress({ stats: { casts: levelThreshold(100) } }).max, true)
  const below = characterProgress({ stats: { casts: levelThreshold(100) - 1 } })
  assert.deepEqual([below.level, below.max, below.remainingXp], [99, false, 1])
})
