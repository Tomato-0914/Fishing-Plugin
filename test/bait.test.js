import test from "node:test"
import assert from "node:assert/strict"
import Config from "../components/Config.js"
import { SLOTS, gearEffects, baitPrice } from "../components/Gear.js"
import { mergeEffects } from "../components/Titles.js"
import { entryPrice } from "../components/ItemPool.js"
import { resolveCast } from "../components/Catch.js"
import { recordResult, repriceBag } from "../components/Game.js"
import { newUser } from "../components/UserData.js"
import { incomePerCast } from "./income-model.js"

const shop = Config.shop, cfg = Config.config, items = Config.items
const baits = [...shop.baits].sort((a, b) => (a.level || 1) - (b.level || 1))
const KEYS = ["priceBonus", "largeBoost", "xlBoost", "junkReduce", "biteReduce"]
function gear(T) {
  const u = { gearV2: { items: {}, equipped: {} }, stats: {} }
  for (const s of SLOTS) { u.gearV2.items[`${s}:${T}`] = { enhance: 0, forge: 0 }; u.gearV2.items[`${s}:1`] ||= { enhance: 0, forge: 0 }; u.gearV2.equipped[s] = T }
  return gearEffects(u, shop)
}
const TITLES = { emptyReduce: 13, rarePoints: 2.1, junkReduce: 6, sellBonus: 90, largeBoost: 40, rarityShift: 0.1 }

test("鱼饵：等级越高，每项属性都不低于低一级，价格不降", () => {
  for (let i = 1; i < baits.length; i++) {
    const lo = baits[i - 1], hi = baits[i]
    for (const k of KEYS) assert.ok((hi.effects?.[k] || 0) >= (lo.effects?.[k] || 0), `${hi.name} 的 ${k} 低于 ${lo.name}`)
    assert.ok(baitPrice(shop, hi.id, cfg.bait) >= baitPrice(shop, lo.id, cfg.bait), `${hi.name} 比 ${lo.name} 便宜`)
  }
})

test("鱼饵：任何渔具阶位下，能用的鱼饵等级越高越赚（扣掉鱼饵价格，有没有称号都一样）", () => {
  for (const extra of [{}, TITLES]) for (let T = 1; T <= 20; T++) {
    let prev = -Infinity
    for (const b of baits.filter(b => (b.level || 1) <= T)) {
      const net = incomePerCast({ ...mergeEffects(gear(T), extra, b.effects || {}), _baitCost: baitPrice(shop, b.id, cfg.bait) })
      assert.ok(net >= prev - 1e-9, `渔具 ${T} 阶${extra.sellBonus ? "（称号多）" : ""}：${b.name} 每竿 ${net.toFixed(2)} 低于低一级 ${prev.toFixed(2)}`)
      prev = net
    }
  }
})

test("鱼价 +% 计入售价，存进鱼护后重新定价也不会丢（宠物鱼价翻倍同理）", () => {
  const u = newUser("b1")
  const seeded = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(5)
  let round
  for (let i = 0; i < 200; i++) { round = resolveCast(u, { items, cfg, shop, effects: { priceBonus: 30, doublePrice: 100, rarityTier: 8 }, rng: seeded }); if (round.result.type === "item" && round.result.size && !round.snapped) break }
  assert.equal(round.result.mult, 2.6)
  const entry = u.bag.at(-1)
  assert.equal(entry.m, 2.6)
  const item = items.find(i => i.id === entry.id)
  const base = entryPrice({ ...entry, m: undefined }, item, cfg.size)
  assert.equal(entry.p, round.result.price)
  assert.equal(entryPrice(entry, item, cfg.size), Math.round(base * 2.6))
  assert.equal(repriceBag(u, new Map(items.map(i => [i.id, i])), cfg.size), 0)
  assert.equal(entry.p, round.result.price)
})

test("出售加成包含出战宠物的技能（饥饿时不算）", async () => {
  const { FishingBag } = await import("../apps/Bag.js").catch(() => ({}))
  const P = await import("../components/Pet.js")
  const u = newUser("b2"); u.gold = 1e8; u.stats.casts = 1e6
  P.buyPet(u, "koi")
  u.pets.owned.koi.xp = P.petThreshold(25)
  const petSell = P.petSkills(P.petDef("koi"), u.pets.owned.koi).find(s => s.effect === "sellBonus").value
  assert.ok(petSell > 0)
  assert.equal(P.petEffects(u).sellBonus, petSell)
  if (FishingBag) assert.equal(FishingBag.prototype.sellBonus.call({}, u), (mergeEffects(gearEffects(u, shop)).sellBonus || 0) + petSell)
})

test("超大体型：大体型叠满后，超大加成把大鱼升成超大；鱼钩、五件套、高级鱼饵提供超大体型", async () => {
  const { buildSizeOdds } = await import("../components/ItemPool.js")
  const { slotEffects, setEffects } = await import("../components/Gear.js")
  const size = cfg.size
  // 大体型 +100：小、中全部变成大
  const full = buildSizeOdds(size, { largeBoost: 100 })
  assert.equal(full.small + full.medium, 0)
  const xl = buildSizeOdds(size, { largeBoost: 100, xlBoost: 15 })
  assert.equal(xl.xlarge, full.xlarge + 15)
  assert.equal(xl.large, full.large - 15)
  // 没有大体型加成时，先从小体型升为超大
  const plain = buildSizeOdds(size, { xlBoost: 5 })
  assert.equal(plain.small, size.small.chance - 5)
  assert.equal(plain.large, size.large.chance)
  // 来源
  assert.equal(slotEffects("hook", 20, 0, 8).xlBoost, 0.2 * 19 + 0.5 * 8)
  assert.equal(setEffects(20, 5).xlBoost, 5)
  assert.equal(setEffects(20, 3).xlBoost, undefined)
  assert.equal(shop.baits.find(b => b.id === "creation").effects.xlBoost, 5)
})

test("图鉴的各体型概率按玩家的大体型 / 超大体型加成计算", async () => {
  const { sizeTable } = await import("../components/Dex.js")
  const tuna = Config.items.find(i => i.id === "tuna")
  const base = sizeTable(tuna, cfg.size)
  assert.deepEqual(base.map(s => s.chance), ["small", "medium", "large", "xlarge"].map(k => cfg.size[k].chance))
  const maxed = Object.fromEntries(sizeTable(tuna, cfg.size, { largeBoost: 86, xlBoost: 17.8 }).map(s => [s.key, s.chance]))
  assert.equal(maxed.small + maxed.medium, 0)
  assert.equal(maxed.xlarge, 20.8)
  assert.equal(maxed.large, 79.2)
})

test("连钓“售出预计获得金币”包含出售加成，与实际出售一致", async () => {
  const { saleLine, formatMulti, formatHundred } = await import("../components/Catch.js")
  const { sellEntries } = await import("../components/Game.js")
  assert.equal(saleLine(1000), "💰 售出预计获得金币：1000")
  assert.equal(saleLine(1000, 214.43, true), "💰 **售出预计获得金币：3144**（含出售加成 +214.43%）")
  const it = Config.items.find(i => i.id === "tuna")
  const rounds = [{ snapped: false, value: 600, reward: 0, result: { type: "item", item: it, rarity: it.rarity, size: "large", price: 600 } }]
  assert.ok(formatMulti(rounds, { sellBonus: 50 }).includes("售出预计获得金币：900（含出售加成 +50%）"))
  assert.ok(formatHundred(rounds, { sellBonus: 50 }).includes("售出预计获得金币：900"))
  // 和真正出售算出来的一样
  const u = { gold: 0, bag: [{ id: "tuna", p: 600 }], stats: { sold: 0 } }
  assert.equal(sellEntries(u, u.bag.slice(), 50).gold, 900)
})
