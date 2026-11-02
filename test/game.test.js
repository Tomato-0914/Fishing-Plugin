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

test("存档：YAML 后端读写、openid 文件名清洗", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fishing-"))
  const store = new UserData(dir)
  await store.init({ storage: "yaml" })
  store.get("85273416").gold = 123
  await store.save("85273416")
  assert.ok(fs.existsSync(path.join(dir, "Fishing_85273416.yaml")))
  assert.equal(safeId("102:ABC/../x"), "102_ABC____x")
  const other = new UserData(dir)
  assert.equal((await other.init({ storage: "yaml" })).count, 1)
  assert.equal(other.get("85273416").gold, 123)
  fs.rmSync(dir, { recursive: true, force: true })
})

for (const driver of ["node:sqlite", "sqlite3"]) {
  test(`存档：SQLite（${driver}）读写、自动迁移、手动迁移、导出`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fishing-db-"))
    // 先用 YAML 存两个人
    const y = new UserData(dir)
    await y.init({ storage: "yaml" })
    y.get("10001").gold = 11
    y.get("o_openid:AB").gold = 22
    y.save("10001"); y.save("o_openid:AB")
    await y.flush()

    // 切到数据库：启动时自动导入并备份
    const db = new UserData(dir)
    const info = await db.init({ storage: "db", driver })
    assert.match(info.backend, new RegExp(driver.replace(":", ".")))
    assert.equal(info.count, 2)
    assert.equal(info.migration.migrated.length, 2)
    assert.ok(fs.existsSync(path.join(dir, "fishing.db")))
    assert.equal(fs.readdirSync(dir).filter(f => f.endsWith(".yaml")).length, 0)
    assert.equal(fs.readdirSync(info.migration.backupDir).length, 2)
    assert.equal(db.get("o_openid:AB").gold, 22)

    // 写入后重新打开仍在
    db.get("10001").gold = 99
    db.get("10002").bait = 5
    await db.save("10001"); await db.save("10002")
    await db.close()
    const db2 = new UserData(dir)
    assert.equal((await db2.init({ storage: "db", driver })).count, 3)
    assert.equal(db2.get("10001").gold, 99)
    assert.equal(db2.get("10002").bait, 5)

    // 手动迁移：已存在的默认跳过，“覆盖”时以 YAML 为准，并原地刷新内存对象
    const ref = db2.get("10001")
    fs.writeFileSync(path.join(dir, "Fishing_10001.yaml"), "user_id: '10001'\ngold: 7\n")
    fs.writeFileSync(path.join(dir, "Fishing_10003.yaml"), "user_id: '10003'\ngold: 3\n")
    fs.writeFileSync(path.join(dir, "Fishing_bad.yaml"), "gold: [unclosed\n")
    const r1 = await db2.migrate()
    assert.deepEqual([r1.migrated, r1.skipped, r1.failed.length], [["10003"], ["10001"], 1])
    assert.equal(db2.get("10001").gold, 99)
    assert.equal(db2.get("10003").gold, 3)
    assert.ok(fs.existsSync(path.join(dir, "Fishing_bad.yaml"))) // 失败的文件原地保留
    fs.writeFileSync(path.join(dir, "Fishing_10001.yaml"), "user_id: '10001'\ngold: 7\n")
    const r2 = await db2.migrate({ overwrite: true })
    assert.deepEqual(r2.migrated, ["10001"])
    assert.equal(ref.gold, 7)
    assert.equal(db2.get("10001"), ref)
    assert.equal(ref.bait, 0) // 字段补齐

    // 导出
    const ex = await db2.export()
    assert.equal(ex.count, 4)
    assert.equal(fs.readdirSync(ex.outDir).length, 4)
    await db2.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })
}

test("存档：SQLite 驱动不可用时退回 YAML", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fishing-fb-"))
  const store = new UserData(dir)
  const info = await store.init({ storage: "db", driver: "nope" })
  assert.equal(info.backend, "YAML")
  assert.ok(info.fallback)
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

test("打卡：每天一次、连续天数、历史记录", async () => {
  const { doCheckin, todayLuck } = await import("../components/Game.js")
  const u = newUser("10006")
  const d1 = new Date(2026, 10, 2, 9), d2 = new Date(2026, 10, 3, 9), d4 = new Date(2026, 10, 5, 9)
  assert.equal(todayLuck(u, d1), null)
  assert.deepEqual(doCheckin(u, 88, d1), { already: false, luck: 88, streak: 1, total: 1 })
  assert.equal(doCheckin(u, 3, d1).already, true)
  assert.equal(todayLuck(u, d1), 88)
  assert.equal(doCheckin(u, 50, d2).streak, 2)
  assert.equal(doCheckin(u, 60, d4).streak, 1) // 断签
  assert.equal(u.checkin.total, 3)
  assert.deepEqual(u.checkin.history.map(x => x.l), [60, 50, 88])
  assert.equal(todayLuck(u, d2), null) // 只认当天
})

test("打卡：幸运等级轻微影响概率", async () => {
  const { luckTier, luckEffects, doCheckin } = await import("../components/Game.js")
  const { effectText, mergeEffects } = await import("../components/Titles.js")
  const tiers = cfg.checkin.tiers
  assert.equal(luckTier(100, tiers).name, "大吉")
  assert.equal(luckTier(90, tiers).name, "大吉")
  assert.equal(luckTier(70, tiers).name, "吉")
  assert.equal(luckTier(50, tiers).name, "平")
  assert.equal(luckTier(10, tiers).name, "凶")
  assert.equal(luckTier(0, tiers).name, "大凶")

  const base = buildOdds(cfg.probability)
  const bad = buildOdds(cfg.probability, luckTier(0, tiers).effects)
  assert.equal(bad.empty, base.empty + 3)
  assert.equal(bad.junk, base.junk + 2)
  assert.equal(bad.N, base.N - 5)
  const good = buildOdds(cfg.probability, luckTier(95, tiers).effects)
  assert.ok(good.UR > base.UR && good.empty < base.empty)
  // 影响是“轻微”的：任意结果的变化都不超过 5 个百分点
  for (const t of tiers) {
    const o = buildOdds(cfg.probability, t.effects)
    for (const k of Object.keys(base)) assert.ok(Math.abs(o[k] - base[k]) <= 5, `${t.name} ${k}`)
  }
  // 负的稀有加成：概率转给普通鱼，总和不变
  const neg = buildOdds(cfg.probability, { rareBoost: -10 })
  assert.ok(Math.abs(neg.SR - base.SR * 0.9) < 1e-9)
  const total = o => Object.values(o).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(total(neg) - total(base)) < 1e-9)

  assert.equal(effectText({ emptyReduce: -3, junkReduce: -2 }), "空军概率 +3%，垃圾概率 +2%")
  assert.equal(effectText({ rareBoost: 10, emptyReduce: 2 }), "稀有以上概率 +10%，空军概率 -2%")
  assert.equal(effectText({}), "无")

  const u = newUser("10007")
  assert.deepEqual(luckEffects(u, tiers), {})
  doCheckin(u, 92)
  assert.deepEqual(mergeEffects({ emptyReduce: 5 }, luckEffects(u, tiers)), { emptyReduce: 7, rareBoost: 10 })
})
