import test from "node:test"
import assert from "node:assert/strict"
import { formatMulti, summarize } from "../components/Catch.js"

const fish = (id, rarity, value) => ({
  result: { type: "item", rarity, item: { id, name: id, emoji: "🐟", rarity } },
  value, reward: 0, snapped: false,
})
test("十连汇总将金币和数量分行，并区分合并鱼获", () => {
  const rounds = [fish("鲟鱼", "SSR", 149), fish("普通鱼", "N", 20), fish("高级鱼", "R", 36)]
  const text = formatMulti(rounds, { markdown: true })
  assert.match(text, /🎣 十连收网\n💰 收获金币：205\n🐟 鱼获 3｜垃圾 0｜空军 0/)
  assert.match(text, /✨ 稀有鱼获 \/ 特殊事件/)
  assert.match(text, /📦 其他鱼获/)
  assert.match(text, /合计 56 金币/)
  assert.doesNotMatch(text, /^> /m)
  assert.equal(summarize(rounds).value, 205)
})
test("全空军仍有完整汇总", () => {
  const rounds = [{ result: { type: "empty" }, value: 0 }]
  assert.match(formatMulti(rounds), /🐟 鱼获 0｜垃圾 0｜空军 1/)
})
