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
  // 不放国家重点保护野生动物（以及容易引起争议的近似名称）
  const PROTECTED = ["鲟", "江豚", "白鱀豚", "海豚", "鲥", "松江鲈", "四鳃鲈", "胭脂鱼", "海马", "鲎", "苏眉", "老鼠斑",
    "黄唇鱼", "大鲵", "娃娃鱼", "海龟", "玳瑁", "砗磲", "鹦鹉螺", "珊瑚", "鲸", "海豹", "哲罗鲑", "细鳞鲑", "唐鱼", "金线鲃", "河蚌", "锦绣龙虾"]
  for (const banned of PROTECTED) assert.ok(!items.some(i => i.name.includes(banned)), banned)
  // 每件物品都有介绍、栖息地；名称不重复
  assert.equal(new Set(items.map(i => i.name)).size, items.length)
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

test("出售与清理垃圾，海洋卫士称号", () => {
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
    db.get("10002").baits.worm = 5
    await db.save("10001"); await db.save("10002")
    await db.close()
    const db2 = new UserData(dir)
    assert.equal((await db2.init({ storage: "db", driver })).count, 3)
    assert.equal(db2.get("10001").gold, 99)
    assert.equal(db2.get("10002").baits.worm, 5)

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
    assert.deepEqual(ref.gear, { rod: 1, line: 1, float: 1, net: 1 }) // 字段补齐

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
  const { welcome, reliefBait } = await import("../components/Game.js")
  const { consumeBait, buyBait, totalBait, baitCount } = await import("../components/Gear.js")
  const shop = Config.shop
  const u = newUser("10003")
  assert.equal(totalBait(u), 0)
  assert.equal(welcome(u, cfg.bait.initial), 10)
  assert.equal(welcome(u, cfg.bait.initial), 0) // 只送一次
  assert.equal(baitCount(u, "basic"), 10)
  for (let i = 0; i < 10; i++) assert.equal(consumeBait(u, shop).bait.id, "basic")
  assert.equal(consumeBait(u, shop), null)
  assert.equal(buyBait(u, shop, "basic", 5, 2).reason, "gold")
  const now = new Date(2026, 10, 2)
  assert.equal(reliefBait(u, { amount: 5, price: 2, hasSellable: true, now }), 0)
  assert.equal(reliefBait(u, { amount: 5, price: 2, now }), 5)
  u.baits.basic = 0
  assert.equal(reliefBait(u, { amount: 5, price: 2, now }), 0) // 每天一次
  assert.equal(reliefBait(u, { amount: 5, price: 2, now: new Date(2026, 10, 3) }), 5)
  u.gold = 25
  assert.deepEqual(buyBait(u, shop, "basic", 10, 2).cost, 20)
  assert.equal(u.gold, 5)
  assert.equal(baitCount(u, "basic"), 15)
  assert.equal(cfg.bait.price, 2)
})

test("鱼饵：抛过竿的老用户不赠送", async () => {
  const { welcome, isNewPlayer } = await import("../components/Game.js")
  const old = newUser("10004")
  old.stats.casts = 5
  assert.equal(isNewPlayer(old), false)
  assert.equal(welcome(old, 10), 0)
  assert.equal(Object.keys(old.baits).length, 0)
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

test("图鉴详情：概率、体型区间、搜索、个人记录", async () => {
  const { itemChance, formatChance, sizeTable, findItems, dexNo } = await import("../components/Dex.js")
  // 每件物品的概率加起来 + 空军 = 100%
  const sum = items.reduce((s, i) => s + itemChance(i, items, cfg.probability), 0)
  assert.ok(Math.abs(sum + cfg.probability.empty - 100) < 1e-9)
  const tuna = itemMap.get("tuna")
  const ssrCount = items.filter(i => i.rarity === "SSR").length
  assert.ok(Math.abs(itemChance(tuna, items, cfg.probability) - 5 / ssrCount) < 1e-9)
  assert.ok(Math.abs(itemChance(itemMap.get("ocean_heart"), items, cfg.probability) - 0.01) < 1e-9)
  assert.equal(formatChance(5 / 6), "0.83%")
  assert.equal(formatChance(12.345), "12.35%")

  // 体型区间与 roll 实际结果一致
  const table = sizeTable(tuna, cfg.size)
  assert.deepEqual(table.map(s => s.label), ["小", "中", "大"])
  const rng = seeded(11)
  for (let i = 0; i < 3000; i++) {
    const r = roll({ items: [tuna], probability: { SSR: 100 }, size: cfg.size }, {}, rng)
    const s = table.find(t => t.key === r.size)
    assert.ok(r.price >= s.pMin && r.price <= s.pMax, `${r.size} ${r.price}`)
    assert.ok(r.weight >= s.wMin - 0.001 && r.weight <= s.wMax + 0.001)
  }
  assert.deepEqual(sizeTable(itemMap.get("can"), cfg.size), [])

  assert.deepEqual(findItems("金枪鱼", items).map(i => i.id), ["tuna"])
  assert.ok(findItems("蟹", items).length > 3)
  assert.deepEqual(findItems("不存在", items), [])
  assert.equal(dexNo(itemMap.get("crucian"), items), "001")
  assert.ok(items.every(i => i.intro && i.habitat), "每件物品都有介绍和栖息地")

  const u = newUser("10008")
  const t1 = new Date(2026, 10, 2), t2 = new Date(2026, 10, 3)
  recordResult(u, { type: "item", item: tuna, rarity: "SSR", price: 100, size: "small", weight: 12 }, { now: t1 })
  recordResult(u, { type: "item", item: tuna, rarity: "SSR", price: 180, size: "large", weight: 70 }, { now: t2 })
  recordResult(u, { type: "item", item: tuna, rarity: "SSR", price: 120, size: "medium", weight: 40 }, { now: t2 })
  assert.deepEqual(u.records.tuna, { first: t1.getTime(), maxW: 70, maxS: "large", maxP: 180 })
})

test("渔具：逐级升级、效果、容量、出售加成", async () => {
  const { upgradeGear, gearEffects, bagCapacity, gearLevel, gearItem } = await import("../components/Gear.js")
  const shop = Config.shop
  const u = newUser("10010")
  assert.deepEqual(u.gear, { rod: 1, line: 1, float: 1, net: 1 })
  assert.deepEqual(gearEffects(u, shop), {})
  assert.equal(bagCapacity(u, shop, cfg.fishing.bagLimit), 200)
  // 金币不够
  assert.equal(upgradeGear(u, shop, "rod").reason, "gold")
  u.gold = 100000
  const r = upgradeGear(u, shop, "rod")
  assert.equal(r.ok, true)
  assert.equal(r.item.name, "玻纤竿")
  assert.equal(u.gold, 100000 - 500)
  for (const slot of ["rod", "line", "float", "net"]) while (upgradeGear(u, shop, slot).ok);
  assert.equal(upgradeGear(u, shop, "rod").reason, "max")
  assert.equal(gearLevel(u, "net"), 5)
  assert.equal(u.gold, 100000 - 68500) // 全部满级共 68500
  assert.deepEqual(gearEffects(u, shop), { rareBoost: 28, largeBoost: 12, lineGuard: 90, emptyReduce: 4, reelWindow: 6, sellBonus: 6 })
  assert.equal(bagCapacity(u, shop, 200), 1200)
  assert.equal(gearItem(shop, "float", 4).name, "芦苇漂")
})

test("鱼饵：多种鱼饵、切换、用完自动换", async () => {
  const { buyBait, useBait, consumeBait, currentBait, findBait, baitCount } = await import("../components/Gear.js")
  const shop = Config.shop
  const u = newUser("10011")
  u.gold = 1000
  assert.equal(findBait(shop, "").id, "basic")
  assert.equal(findBait(shop, "蚯蚓").id, "worm")
  assert.equal(findBait(shop, "秘饵").id, "golden")
  assert.equal(findBait(shop, "不存在"), null)
  assert.equal(buyBait(u, shop, "worm", 2).cost, 8)
  assert.equal(buyBait(u, shop, "basic", 1, 2).cost, 2)
  assert.equal(useBait(u, shop, "golden").reason, "empty")
  assert.equal(useBait(u, shop, "worm").ok, true)
  assert.equal(currentBait(u, shop).id, "worm")
  assert.equal(consumeBait(u, shop).switched, false)
  assert.equal(consumeBait(u, shop).bait.id, "worm")
  const c = consumeBait(u, shop) // 蚯蚓用完 → 自动换普通饵
  assert.deepEqual([c.bait.id, c.switched, c.from.id], ["basic", true, "worm"])
  assert.equal(u.baitUse, "basic")
  assert.equal(baitCount(u, "basic"), 0)
  assert.equal(consumeBait(u, shop), null)
})

test("断线：只影响大鱼，鱼线按比例降低", async () => {
  const { breakChance } = await import("../components/Gear.js")
  const lb = Config.shop.lineBreak
  const fish = (rarity, size) => ({ type: "item", rarity, size, item: {} })
  assert.equal(breakChance(fish("N", "small"), lb), 0)
  assert.equal(breakChance(fish("SR", "medium"), lb), 0)
  assert.equal(breakChance(fish("R", "large"), lb), 4)
  assert.equal(breakChance(fish("SSR", "medium"), lb), 6)
  assert.equal(breakChance(fish("UR", "large"), lb), 16)
  assert.ok(Math.abs(breakChance(fish("UR", "large"), lb, { lineGuard: 90 }) - 1.6) < 1e-9)
  assert.equal(breakChance(fish("junk"), lb), 0)
  assert.equal(breakChance(fish("hidden"), lb), 0)
  assert.equal(breakChance({ type: "empty" }, lb), 0)
})

test("概率下限：效果叠满也不低于下限", async () => {
  const limits = cfg.limits
  const huge = { emptyReduce: 50, junkReduce: 50, rareBoost: 1000 }
  const o = buildOdds(cfg.probability, huge, limits)
  assert.ok(Math.abs(o.empty - 3) < 1e-9)
  assert.ok(Math.abs(o.junk - 5) < 1e-9)
  assert.ok(Math.abs(o.N - 5) < 1e-9)
  const total = x => Object.values(x).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(total(o) - total(buildOdds(cfg.probability))) < 1e-9)
  // 文档中的“全部叠满”例子：Lv5 鱼竿 + 深海之子 + 大吉 + 金丝秘饵 → 稀有 +73%
  const full = buildOdds(cfg.probability, { rareBoost: 28 + 20 + 10 + 15, emptyReduce: 2 }, limits)
  assert.ok(Math.abs(full.UR - 1.94 * 1.73) < 1e-9)
})

test("存档迁移：旧版 bait 数量转为普通饵", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fishing-mig-"))
  fs.writeFileSync(path.join(dir, "Fishing_123.yaml"), "user_id: '123'\nbait: 7\ngold: 1\n")
  const store = new UserData(dir)
  await store.init({ storage: "yaml" })
  const u = store.get("123")
  assert.equal(u.baits.basic, 7)
  assert.equal(u.bait, undefined)
  assert.deepEqual(u.gear, { rod: 1, line: 1, float: 1, net: 1 })
  fs.rmSync(dir, { recursive: true, force: true })
})

test("鱼饵单价：普通饵取 bait.price，其他鱼饵可用 bait.prices 覆盖", async () => {
  const { baitPrice, buyBait } = await import("../components/Gear.js")
  const shop = Config.shop
  assert.equal(baitPrice(shop, "basic", 2), 2)          // 兼容直接传数字
  assert.equal(baitPrice(shop, "worm", 2), 4)           // 没覆盖 → shop.yaml
  const bait = { price: 3, prices: { worm: 7, golden: 0, scent: "" } }
  assert.equal(baitPrice(shop, "basic", bait), 3)
  assert.equal(baitPrice(shop, "worm", bait), 7)
  assert.equal(baitPrice(shop, "golden", bait), 0)      // 0 也是有效价格
  assert.equal(baitPrice(shop, "scent", bait), 6)       // 空值 → shop.yaml
  const u = newUser("10020"); u.gold = 100
  assert.equal(buyBait(u, shop, "worm", 10, bait).cost, 70)
})

test("一竿结算：断线不入鱼护，十连汇总", async () => {
  const { resolveCast, summarize } = await import("../components/Catch.js")
  const shop = Config.shop
  // 只出传说大体型，断线 100%
  const urOnly = { ...cfg, probability: { empty: 0, junk: 0, N: 0, R: 0, SR: 0, SSR: 0, UR: 100, hidden: {} } }
  const u = newUser("10021")
  const r = resolveCast(u, { items, cfg: urOnly, shop: { ...shop, lineBreak: { UR: 100 } }, rng: seeded(5) })
  assert.equal(r.snapped, true)
  assert.equal(u.bag.length, 0)
  assert.equal(u.stats.escaped, 1)
  assert.equal(u.stats.lineBreak, 1)
  // 鱼线满级 → 断线概率按比例降低
  const r2 = resolveCast(u, { items, cfg: urOnly, shop: { ...shop, lineBreak: { UR: 10 } }, effects: { lineGuard: 100 }, rng: seeded(6) })
  assert.equal(r2.snapped, false)
  assert.equal(u.bag.length, 1)
  assert.equal(r2.value, r2.result.price)

  // 十连：200 次模拟，汇总数字自洽
  const v = newUser("10022")
  const rng = seeded(9)
  const rounds = Array.from({ length: 200 }, () => resolveCast(v, { items, cfg, shop, rng }))
  const s = summarize(rounds)
  assert.equal(s.fish + s.junk + s.empty + s.snapped, 200)
  assert.equal(v.bag.length, s.fish + s.junk - rounds.filter(x => !x.snapped && x.result.item?.special === "police").length)
  assert.equal(s.value, rounds.reduce((a, x) => a + x.value, 0))
  assert.ok(s.best && s.best.value === Math.max(...rounds.filter(x => !x.snapped && x.result.type === "item" && x.result.rarity !== "junk").map(x => x.value)))
})

test("锅巴：鱼饵单价读写", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fishing-guoba-"))
  const { supportGuoba } = await import("../guoba/index.js")
  const { configInfo } = supportGuoba()
  const fields = configInfo.schemas.map(s => s.field).filter(Boolean)
  for (const id of ["worm", "scent", "shrimp", "golden"]) assert.ok(fields.includes(`bait.prices.${id}`), id)
  assert.ok(fields.includes("fishing.multiCount") && fields.includes("fishing.multiCooldown"))
  const data = configInfo.getConfigData()
  assert.equal(data.bait.prices.worm, 4)
  assert.equal(data.bait.prices.golden, 25)
  // 保存：改了的写入，和 shop.yaml 相同的不写
  const saved = {}
  const origSet = Config.set.bind(Config)
  Config.set = (name, value) => { saved[name] = value }
  const Result = { ok: (_, msg) => ({ ok: true, msg }), error: (_, msg) => ({ ok: false, msg }) }
  const ret = configInfo.setConfigData({ "bait.prices.worm": 5, "bait.prices.golden": 25 }, { Result })
  Config.set = origSet
  assert.equal(ret.ok, true, ret.msg)
  assert.deepEqual(saved.config.bait.prices, { worm: 5 })
  fs.rmSync(dir, { recursive: true, force: true })
})

test("十连结果：短格式、按价值排序、Markdown 引用块", async () => {
  const { formatMulti, roundLine } = await import("../components/Catch.js")
  const it = id => itemMap.get(id)
  const fish = (id, value, size) => ({ snapped: false, value, reward: 0, result: { type: "item", item: it(id), rarity: it(id).rarity, size, price: value } })
  const rounds = [
    fish("swimcrab", 38, "medium"),
    { snapped: false, value: 0, reward: 0, result: { type: "empty" } },
    fish("grouperking", 341, "medium"),
    { snapped: true, value: 0, reward: 0, result: { type: "item", item: it("tuna"), rarity: "SSR", size: "large", price: 180 } },
    fish("can", 0),
    { snapped: false, value: 5000, reward: 5000, result: { type: "item", item: it("people_fragment"), rarity: "hidden", price: 0 } },
    fish("crucian", 4, "small"),
  ]
  const sizeLabels = { small: "小", medium: "中", large: "大" }
  assert.equal(roundLine(rounds[2], sizeLabels), "🟡🐠 石斑鱼王·中 341 ✨")
  assert.equal(roundLine(rounds[0], sizeLabels), "🔵🦀 梭子蟹·中 38")
  const md = formatMulti(rounds, { sizeLabels, markdown: true })
  const lines = md.split("\n")
  assert.equal(lines[0], "🎣 十连收网 · 7 竿 · 💰 5383 金币")
  // 报警 → 按价值 → 断线 → 垃圾 → 空军
  assert.deepEqual(lines.slice(1, 8), [
    "> 🚨 ❓ 人民碎片 已报警 +5000",
    "> 🟡🐠 石斑鱼王·中 341 ✨",
    "> 🔵🦀 梭子蟹·中 38",
    "> ⚪🐟 小鲫鱼·小 4",
    "> 💥 🟣🐟 金枪鱼·大 断线跑了",
    "> 🗑️ 🥫 易拉罐",
    "> 🌊 空军",
  ])
  assert.equal(lines[8], "") // 引用块后空行
  assert.ok(lines[9].startsWith("🐟 "))
  // 纯文本：没有 ">" 也没有空行
  const plain = formatMulti(rounds, { sizeLabels })
  assert.ok(!plain.includes(">") && !plain.includes("\n\n"))
  // 每行都很短，手机上不换行（不含 emoji 的文字 ≤ 14 个字）
  for (const l of md.split("\n").filter(l => l.startsWith(">"))) {
    const text = l.replace(/\p{Extended_Pictographic}|️|[> ]/gu, "")
    assert.ok(text.length <= 14, l)
  }
})
