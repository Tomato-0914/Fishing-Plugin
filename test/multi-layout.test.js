import test from "node:test"
import assert from "node:assert/strict"
import { formatMulti, summarize } from "../components/Catch.js"

const fish = (id, rarity, value) => ({
  result: { type: "item", rarity, item: { id, name: id, emoji: "🐟", rarity } },
  value, reward: 0, snapped: false,
})
test("QQBot Markdown 使用真正换行与引用块明细", () => {
  const rounds = [fish("鲟鱼", "SSR", 149), fish("普通鱼", "N", 20), fish("高级鱼", "R", 36)]
  const msg = formatMulti(rounds, { markdown: true })
  assert.ok(msg.startsWith("**🎣 十连收网**" + String.fromCharCode(10)))
  assert.ok(msg.includes("💰 **售出预计获得金币：205**"))
  assert.ok(msg.includes("> **✨ 本次最高：神器**"))
  assert.ok(msg.includes("> 📦 其他：🟢 高级 ×1 · ⚪ 普通 ×1 · 合计 56 金币"))
  assert.ok(!msg.includes(String.fromCharCode(92, 110)))
  assert.ok(msg.split(String.fromCharCode(10)).some(line => line.startsWith("> ")))
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
test("QQBot：出售加成、宠物各行放进引用块，并与下一行空行隔开", () => {
  const rounds = [fish("鲟鱼", "SSR", 100), fish("普通鱼", "N", 20)]
  const pet = ["🐲 李云龙 经验 +227（Lv70 · 距离 Lv71 还需 4,873）", "🐾 宠物技能：鱼价翻倍 2 次"]
  const lines = formatMulti(rounds, { markdown: true, sellBonus: 214.55, petLines: pet }).split(String.fromCharCode(10))
  assert.deepEqual(lines.slice(0, 9), [
    "**🎣 十连收网**",
    "💰 **售出预计获得金币：377**",
    "> 含出售加成 +214.55%",
    "",
    "🐟 鱼获 2｜垃圾 0｜空军 0",
    "",
    "> 🐲 李云龙 经验 +227（Lv70 · 距离 Lv71 还需 4,873）",
    "> 🐾 宠物技能：鱼价翻倍 2 次",
    "",
  ])
  assert.equal(lines[9], "> **✨ 本次最高：神器**")
  // 没有断线等结尾行时，引用块后也留空行，后面接“剩余十连”不会被并进引用
  assert.equal(lines.at(-1), "")
  assert.ok(lines.at(-2).startsWith("> "))
  // 纯文本：出售加成仍写在括号里，宠物行不加引用
  const plain = formatMulti(rounds, { sellBonus: 214.55, petLines: pet })
  assert.ok(plain.includes("💰 售出预计获得金币：377（含出售加成 +214.55%）"))
  assert.ok(plain.includes(pet[0]) && !plain.includes("> "))
})
