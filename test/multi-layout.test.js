import test from "node:test"
import assert from "node:assert/strict"
import { formatMulti, summarize } from "../components/Catch.js"

const fish = (id, rarity, value) => ({
  result: { type: "item", rarity, item: { id, name: id, emoji: "🐟", rarity } },
  value, reward: 0, snapped: false,
})
test("QQBot Markdown 使用加粗标题和真正换行，不使用引用块", () => {
  const rounds = [fish("鲟鱼", "SSR", 149), fish("普通鱼", "N", 20), fish("高级鱼", "R", 36)]
  const msg = formatMulti(rounds, { markdown: true })
  assert.ok(msg.startsWith("**🎣 十连收网**" + String.fromCharCode(10)))
  assert.ok(msg.includes("💰 **收获金币：205**"))
  assert.ok(msg.includes("**✨ 稀有鱼获 / 特殊事件**"))
  assert.ok(msg.includes("**📦 其他鱼获**"))
  assert.ok(msg.includes("合计 56 金币"))
  assert.ok(!msg.includes(String.fromCharCode(92, 110)))
  assert.ok(!msg.split(String.fromCharCode(10)).some(line => line.startsWith("> ")))
  assert.equal(summarize(rounds).value, 205)
})
test("非 QQBot 保持纯文本", () => {
  const msg = formatMulti([fish("鲟鱼", "SSR", 149)])
  assert.ok(msg.startsWith("🎣 十连收网" + String.fromCharCode(10)))
  assert.ok(!msg.includes("**"))
})
test("全空军仍有完整汇总", () => {
  const rounds = [{ result: { type: "empty" }, value: 0 }]
  assert.match(formatMulti(rounds), /🐟 鱼获 0｜垃圾 0｜空军 1/)
})
