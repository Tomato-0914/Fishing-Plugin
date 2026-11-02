import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import Config from "../components/Config.js"
import { roll, buildOdds, buildSizeOdds, weightedPick, triangular } from "../components/ItemPool.js"
import { dayKey, weekKey, monthKey } from "../components/Period.js"
import { recordResult, sellEntries, discardJunk, periodStat, groupBag } from "../components/Game.js"
import { checkTitles, getEffects } from "../components/Titles.js"
import { UserData, newUser, safeId } from "../components/UserData.js"

const cfg = Config.config
const items = Config.items
const itemMap = new Map(items.map(i => [i.id, i]))

/** 可复现的伪随机数 */
function seeded(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
}

test("默认配置与物品池完整", () => {
  const ids = new Set()
  for (const i of items) {
    assert.ok(!ids.has(i.id), `重复 id ${i.id}`)
    ids.add(i.id)
    if (!["junk", "hidden"].includes(i.rarity)) assert.ok(i.price > 0 && Array.isArray(i.weight), i.id)
  }
  for (const r of ["junk", "N", "R", "SR", "SSR", "UR"]) assert.ok(items.some(i => i.rarity === r), r)
  for (const id of Object.keys(cfg.probability.hidden)) assert.ok(itemMap.has(id), id)
  for (const banned of ["中华鲟", "江豚"]) assert.ok(!items.some(i => i.name.includes(banned)))
  assert.equal(cfg.policeReward, 5000)
})

test("概率分布接近配置", () => {
  const rng = seeded(42)
  const N = 200000
  const count = {}
  for (let i = 0; i < N; i++) {
    const r = roll({ items, probability: cfg.probability, size: cfg.size }, {}, rng)
    const k = r.type === "empty" ? "empty" : r.rarity === "hidden" ? r.item.id : r.rarity
    count[k] = (count[k] || 0) + 1
  }
  const pct = k => (count[k] || 0) / N * 100
  for (const k of ["empty", "junk", "N", "R", "SR", "SSR", "UR"])
    assert.ok(Math.abs(pct(k) - cfg.probability[k]) < 0.5, `${k}: ${pct(k)}`)
  assert.ok(pct("people_fragment") < 0.15)
  assert.ok(pct("ocean_heart") < pct("people_fragment") + 0.02)
})

test("垃圾售价为 0，鱼有体型与重量", () => {
  const rng = seeded(7)
  let junk = 0, fish = 0
  for (let i = 0; i < 5000; i++) {
    const r = roll({ items, probability: cfg.probability, size: cfg.size }, {}, rng)
    if (r.type !== "item") continue
    if (r.rarity === "junk") { junk++; assert.equal(r.price, 0); assert.equal(r.size, undefined) }
    else if (r.item.weight) {
      fish++
      assert.ok(["small", "medium", "large"].includes(r.size))
      const [lo, hi] = r.item.weight
      assert.ok(r.weight >= lo - 0.001 && r.weight <= hi + 0.001)
      assert.ok(r.price >= 1)
    }
  }
  assert.ok(junk > 0 && fish > 0)
})

test("大体型比小体型值钱", () => {
  const tuna = itemMap.get("tuna")
  const only = { items: [tuna], probability: { SSR: 100 }, size: cfg.size }
  const prices = { small: [], large: [] }
  const rng = seeded(3)
  for (let i = 0; i < 2000; i++) {
    const r = roll(only, {}, rng)
    if (prices[r.size]) prices[r.size].push(r.price)
  }
  assert.ok(Math.max(...prices.small) < Math.min(...prices.large))
})

test("称号效果调整概率", () => {
  const base = buildOdds(cfg.probability)
  const g = buildOdds(cfg.probability, { emptyReduce: 5, junkReduce: 3 })
  assert.equal(g.empty, base.empty - 5)
  assert.equal(g.junk, base.junk - 3)
  assert.equal(g.N, base.N + 8)
  const r = buildOdds(cfg.probability, { rareBoost: 20 })
  assert.ok(Math.abs(r.SR - base.SR * 1.2) < 1e-9)
  const total = o => Object.values(o).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(total(r) - total(base)) < 1e-9)
  const s = buildSizeOdds(cfg.size, { largeBoost: 10 })
  assert.equal(s.large, cfg.size.large.chance + 10)
})

test("三角分布在区间内", () => {
  const rng = seeded(9)
  for (let i = 0; i < 1000; i++) {
    const v = triangular(3, 18, rng)
    assert.ok(v >= 3 && v <= 18)
  }
  assert.equal(weightedPick([["a", 0], ["b", 1]], () => 0), "b")
})

test("周期 key", () => {
  assert.equal(dayKey(new Date(2026, 10, 2)), "2026-11-02")
  assert.equal(monthKey(new Date(2026, 10, 2)), "2026-11")
  assert.equal(weekKey(new Date(2026, 10, 2)), "2026-W45")
  assert.equal(weekKey(new Date(2027, 0, 1)), "2026-W53")
  assert.equal(weekKey(new Date(2024, 11, 30)), "2025-W01")
})

test("结算：人民碎片报警不入鱼护，计入排行；周期过期清零", () => {
  const u = newUser("10001")
  const now = new Date(2026, 10, 2, 12)
  const police = itemMap.get("people_fragment")
  const res = recordResult(u, { type: "item", item: police, rarity: "hidden", price: 0 }, { now, policeReward: 5000 })
  assert.deepEqual(res, { value: 5000, reward: 5000, stored: false })
  assert.equal(u.gold, 5000)
  assert.equal(u.bag.length, 0)
  assert.equal(periodStat(u, "day", now).value, 5000)
  // 重复获得：只给金币，称号只有一个
  recordResult(u, { type: "item", item: police, rarity: "hidden", price: 0 }, { now, policeReward: 5000 })
  checkTitles(u, Config.titles, items)
  checkTitles(u, Config.titles, items)
  assert.equal(u.gold, 10000)
  assert.equal(u.titles.filter(t => t === "citizen").length, 1)
  assert.equal(getEffects(u, Config.titles).sellBonus, 5)
  // 第二天日榜清零，月榜保留
  const tomorrow = new Date(2026, 10, 3, 12)
  assert.equal(periodStat(u, "day", tomorrow).value, 0)
  assert.equal(periodStat(u, "month", tomorrow).value, 10000)
})

test("出售与丢弃垃圾，海洋卫士称号", () => {
  const u = newUser("10002")
  const tuna = itemMap.get("tuna"), can = itemMap.get("can")
  recordResult(u, { type: "item", item: tuna, rarity: "SSR", price: 100, size: "medium", weight: 30 })
  for (let i = 0; i < 50; i++) recordResult(u, { type: "item", item: can, rarity: "junk", price: 0 })
  assert.equal(u.bag.length, 51)
  assert.equal(groupBag(u, itemMap).length, 2)
  const fish = u.bag.filter(e => e.id === "tuna")
  const sold = sellEntries(u, fish, 10)
  assert.equal(sold.gold, 110)
  assert.equal(u.gold, 110)
  assert.equal(discardJunk(u, itemMap), 50)
  assert.equal(u.bag.length, 0)
  const got = checkTitles(u, Config.titles, items).map(t => t.id)
  assert.ok(got.includes("guardian"))
  assert.equal(getEffects(u, Config.titles).emptyReduce, 5)
})

test("存档 YAML 读写、openid 文件名清洗", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fishing-"))
  const store = new UserData(dir)
  const u = store.get("85273416")
  u.gold = 123
  await store.save("85273416")
  assert.ok(fs.existsSync(path.join(dir, "Fishing_85273416.yaml")))
  assert.equal(safeId("102:ABC/../x"), "102_ABC____x")
  const other = new UserData(dir)
  assert.equal(other.loadAll(), 1)
  assert.equal(other.get("85273416").gold, 123)
  fs.rmSync(dir, { recursive: true, force: true })
})

test("鱼饵：新手赠送、消耗、购买、救济", async () => {
  const { welcome, consumeBait, buyBait, reliefBait } = await import("../components/Game.js")
  const u = newUser("10003")
  assert.equal(u.bait, 0)
  assert.equal(welcome(u, cfg.bait.initial), 10)
  assert.equal(welcome(u, cfg.bait.initial), 0) // 只送一次
  assert.equal(u.bait, 10)
  for (let i = 0; i < 10; i++) assert.ok(consumeBait(u))
  assert.equal(consumeBait(u), false)
  assert.deepEqual(buyBait(u, 5, 2), { ok: false, reason: "gold", cost: 10, afford: 0 })
  const now = new Date(2026, 10, 2)
  assert.equal(reliefBait(u, { amount: 5, price: 2, hasSellable: true, now }), 0)
  assert.equal(reliefBait(u, { amount: 5, price: 2, now }), 5)
  u.bait = 0
  assert.equal(reliefBait(u, { amount: 5, price: 2, now }), 0) // 每天一次
  assert.equal(reliefBait(u, { amount: 5, price: 2, now: new Date(2026, 10, 3) }), 5)
  u.gold = 25
  assert.deepEqual(buyBait(u, 10, 2), { ok: true, count: 10, cost: 20 })
  assert.equal(u.gold, 5)
  assert.equal(u.bait, 15)
  assert.equal(cfg.bait.price, 2)
})

test("鱼饵：抛过竿的老用户不赠送", async () => {
  const { welcome, isNewPlayer } = await import("../components/Game.js")
  const old = newUser("10004")
  old.stats.casts = 5
  assert.equal(isNewPlayer(old), false)
  assert.equal(welcome(old, 10), 0)
  assert.equal(old.bait, 0)
  assert.equal(old.welcomed, true)
  const fresh = newUser("10005")
  assert.equal(isNewPlayer(fresh), true)
  assert.equal(welcome(fresh, 10), 10)
  assert.equal(isNewPlayer(fresh), false)
})
