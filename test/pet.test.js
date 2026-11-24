import test from "node:test"
import assert from "node:assert/strict"
import Config from "../components/Config.js"
import { newUser } from "../components/UserData.js"
import * as P from "../components/Pet.js"
import { resolveCast, withExtras, petProcLine } from "../components/Catch.js"
import { petGain, incomePerCast, referenceEffects } from "./income-model.js"

const c = P.petCfg()
const H = 3600000
const T0 = Date.UTC(2026, 10, 16, 2)
const rich = id => { const u = newUser(id); u.gold = 1e8; u.stats.casts = 1e6; return u }
const seeded = (seed = 1) => () => (seed = (seed * 16807) % 2147483647) / 2147483647

test("宠物：购买只卖一阶，10 万一只，角色 Lv10 开放，同种只能养一只，第一只自动出战", () => {
  const poor = newUser("p1"); poor.gold = 1e6
  assert.equal(P.buyPet(poor, "koi", T0).reason, "level")
  const u = rich("p2")
  const r = P.buyPet(u, "koi", T0)
  assert.ok(r.ok && r.active)
  assert.equal(u.gold, 1e8 - 100000)
  assert.equal(P.buyPet(u, "koi", T0).reason, "owned")
  assert.equal(P.buyPet(u, "bird", T0).active, false)
  assert.equal(u.pets.active, "koi")
  assert.equal(P.currentForm(P.petDef("koi"), u.pets.owned.koi, c).name, "小鲤鱼")
  assert.deepEqual(P.findPetDef("雏雀")?.id, "bird")
})

test("宠物：Lv20 / Lv40 自动进化，Lv60 必须选方向（经验照常累积、等级暂停），选定后不能改，满级不再获得经验", () => {
  const u = rich("p3"); P.buyPet(u, "koi", T0)
  const d = u.pets.owned.koi
  let r = P.addPetXp(u, P.petThreshold(20, c), T0)
  assert.equal(r.after, 20)
  assert.deepEqual(r.evolved.map(f => f.name), ["锦鲤"])
  r = P.addPetXp(u, P.petThreshold(70, c) - d.xp, T0)
  assert.equal(P.petLevel(d, c), 60)
  assert.equal(P.rawPetLevel(d.xp, c), 70)
  assert.equal(P.petStage(d, c), 3)
  assert.ok(r.branchReady)
  assert.ok(P.petGainLines(r, c).some(l => l.includes("#宠物进化 化龙")))
  assert.equal(P.evolvePet(u, "koi", "化凤", T0).reason, "unknown")
  const ev = P.evolvePet(u, "koi", "化龙", T0)
  assert.ok(ev.ok)
  assert.equal(ev.after, 70)
  assert.equal(P.currentForm(P.petDef("koi"), d, c).name, "鱼化龙")
  assert.equal(P.evolvePet(u, "koi", "化鲲", T0).reason, "chosen")
  r = P.addPetXp(u, P.petThreshold(80, c) - d.xp, T0)
  assert.deepEqual(r.evolved.map(f => f.name), ["龙"])
  r = P.addPetXp(u, 1e9, T0)
  assert.equal(r.after, 100)
  assert.ok(r.max)
  assert.equal(P.addPetXp(u, 100, T0), null)
  assert.deepEqual(P.petGainLines(null), [])
})

test("宠物技能：每阶解锁一个，解锁后每升一级提升基础值的 2%；天赋「护线」每级断线 -0.3%；饥饿时全部失效", () => {
  const u = rich("p4"); P.buyPet(u, "bird", T0)
  const d = u.pets.owned.bird
  const def = P.petDef("bird")
  const base = k => (k <= 3 ? def.forms[k - 1] : def.branches.find(b => b.id === "crow").forms[k - 4]).skill.value
  d.xp = P.petThreshold(85, c); d.branch = "crow"
  const skills = P.petSkills(def, d, c)
  assert.deepEqual(skills.map(s => s.name), ["衔鱼", "报晓", "青羽", "逐日", "烈日"])
  const at = (k, lv) => Number((base(k) * (1 + 0.02 * (lv - c.stageLevels[k - 1]))).toFixed(3))
  assert.equal(skills[0].value, at(1, 85))   // Lv1 解锁，成长 84 级
  assert.equal(skills[3].value, at(4, 85))   // Lv60 解锁，成长 25 级
  assert.equal(skills[4].value, at(5, 85))   // Lv80 解锁，成长 5 级
  // 每升一级都会变强，并提示变化
  const r = P.addPetXp(u, P.petThreshold(86, c) - d.xp, T0)
  assert.equal(r.after, 86)
  assert.ok(P.petSkills(def, d, c)[0].value > skills[0].value)
  const lines = P.petGainLines(r, c)
  assert.ok(lines.some(l => l.startsWith("📈 能力提升：") && l.includes("「护线」-25.5% → -25.8%") && l.includes("「衔鱼」")), lines.join("\n"))
  const eff = P.petEffects(u, T0)
  assert.equal(eff.lineGuard, 25.8)
  assert.equal(eff.extraFish, at(1, 86))
  d.sat = c.satiety.hungry
  assert.deepEqual(P.petEffects(u, T0), {})
})

test("饱食度：阶段越高消耗越多（出战 × 阶段比例，休息为出战的 1/5）；口粮 +5，最多喂到 100，多余的不扣费", () => {
  const u = rich("p5"); P.buyPet(u, "koi", T0); P.buyPet(u, "bird", T0)
  // 一阶：出战每小时 1 × 0.2%
  P.refreshPets(u, T0 + 100 * H)
  assert.equal(u.pets.owned.koi.sat, 99.8)
  assert.equal(u.pets.owned.bird.sat, 99.96)
  // 五阶：出战每小时 0.5，休息 0.1
  for (const id of ["koi", "bird"]) Object.assign(u.pets.owned[id], { xp: P.petThreshold(85, c), branch: id === "koi" ? "dragon" : "phoenix", sat: 100, t: T0 })
  assert.equal(P.satPerDay(u.pets.owned.koi, true, c), 12)
  P.refreshPets(u, T0 + 20 * H)
  assert.equal(u.pets.owned.koi.sat, 90)
  assert.equal(u.pets.owned.bird.sat, 98)
  const gold = u.gold
  const f = P.feedPet(u, "koi", 50, T0 + 20 * H)
  assert.deepEqual([f.units, f.cost, f.sat, f.capped], [2, 20000, 100, true])
  assert.equal(u.gold, gold - 20000)
  assert.equal(P.feedPet(u, "koi", 1, T0 + 20 * H).reason, "full")
  P.refreshPets(u, T0 + 26 * H)
  assert.equal(P.feedPet(u, "koi", 1, T0 + 26 * H).sat, 100)   // 97 + 5 封顶 100
})

test("养宠物不亏：每天钓 1000 竿、穿刚解锁的渔具时，每个阶段的口粮开销都低于宠物多赚的金币", () => {
  const minTier = [3, 6, 11, 16, 18]
  const perSat = c.food.price / c.food.value
  for (let stage = 1; stage <= 5; stage++) {
    const level = c.stageLevels[stage - 1], tier = minTier[stage - 1]
    for (const def of Config.pets) for (const b of def.branches) {
      const data = { xp: P.petThreshold(level, c), branch: stage >= 4 ? b.id : null }
      const eff = {}
      for (const s of P.petSkills(def, data, c)) eff[s.effect] = (eff[s.effect] || 0) + s.value
      const earn = incomePerCast(referenceEffects(tier)) * 1000 * petGain(eff, tier) / 100
      const food = P.satPerDay(data, true, c) * perSat
      assert.ok(food < earn * 0.8, `${stage} 阶 ${def.name}/${b.id}：口粮 ${Math.round(food)} vs 多赚 ${Math.round(earn)}`)
    }
  }
})

test("离家出走：饱食度到 0 失去宠物，7 天内 100 万寻回（保留等级），超过 7 天不能寻回", () => {
  const u = rich("p6"); P.buyPet(u, "koi", T0)
  Object.assign(u.pets.owned.koi, { xp: P.petThreshold(85, c), branch: "dragon" })   // 五阶：出战每小时 -0.5
  const gone = P.refreshPets(u, T0 + 201 * H)
  assert.deepEqual(gone, ["koi"])
  assert.equal(u.pets.active, null)
  assert.equal(u.pets.lost.koi.lostAt, T0 + 200 * H)
  assert.ok(P.petNotices(u, T0 + 201 * H)[0].includes("离家出走"))
  assert.equal(P.petNotices(u, T0 + 202 * H).length, 0)   // 只提醒一次
  const gold = u.gold
  const r = P.recallPet(u, "koi", T0 + 220 * H)
  assert.ok(r.ok)
  assert.equal(u.gold, gold - 1000000)
  assert.equal(P.petLevel(u.pets.owned.koi, c), 85)
  assert.equal(u.pets.owned.koi.sat, 100)
  assert.equal(u.pets.active, "koi")
  // 再饿跑一次，超过 7 天
  P.refreshPets(u, T0 + 500 * H)
  assert.equal(P.recallPet(u, "koi", T0 + 500 * H + 8 * 24 * H).reason, "expired")
  assert.equal(P.lostPets(u, T0 + 500 * H + 8 * 24 * H).length, 0)
})

test("更换出战：每天 1 次，没有出战宠物时不计次数，第二天恢复", () => {
  const u = rich("p7"); P.buyPet(u, "koi", T0); P.buyPet(u, "bird", T0)
  assert.equal(P.setActivePet(u, "koi", T0).reason, "already")
  assert.ok(P.setActivePet(u, "bird", T0).ok)
  assert.equal(P.setActivePet(u, "koi", T0 + H).reason, "limit")
  assert.ok(P.setActivePet(u, "koi", T0 + 24 * H).ok)
  u.pets.active = null
  assert.ok(P.setActivePet(u, "bird", T0 + 24 * H).free)
})

test("宠物技能在钓鱼里生效：品级 +1、鱼价翻倍、多钓的鱼入鱼护，连钓汇总一行", () => {
  const u = rich("p8")
  const cfg = Config.config, shop = Config.shop, items = Config.items
  const rng = seeded(11)
  const effects = { rarityUp: 100, doublePrice: 100, extraFish2: 100, rarityTier: 5 }
  let round
  for (let i = 0; i < 200; i++) { round = resolveCast(u, { items, cfg, shop, effects, rng }); if (!round.snapped && round.pet?.up) break }
  assert.ok(round.pet.up)
  assert.equal(round.pet.mult, 2)
  assert.equal(round.extras.length, 2)
  assert.ok(round.extras.every(x => x.extra && u.bag.some(e => e.id === x.result.item.id)))
  const rounds = withExtras([round])
  assert.equal(rounds.length, 3)
  assert.equal(petProcLine(rounds, 4), "🐾 宠物技能：多钓 2 条 · 品级提升 1 次 · 鱼价翻倍 1 次 · 省下鱼饵 4 个")
  // 没有宠物效果时不触发
  const plain = resolveCast(newUser("p9"), { items, cfg, shop, effects: { rarityTier: 5 }, rng })
  assert.deepEqual(plain.pet, {})
  assert.deepEqual(plain.extras || [], [])
})

test("宠物配平：同等级的各条路线每竿收益相差不超过 ±5%（Lv1~Lv100 各级）", () => {
  const defs = Config.pets
  // 宠物经验与角色同步，宠物等级越高，角色等级（渔具阶位）至少越高：按等级对应的合理渔具阶位检查
  const minTier = L => L < 20 ? 3 : L < 40 ? 6 : L < 60 ? 11 : L < 80 ? 16 : 18
  const paths = defs.flatMap(def => def.branches.map(b => ({ def, branch: b.id })))
  for (const level of [1, 10, 19, 20, 30, 39, 40, 50, 59, 60, 70, 79, 80, 90, 100]) {
    for (let tier = minTier(level); tier <= 20; tier++) {
      const gains = paths.map(({ def, branch }) => {
        const data = { xp: P.petThreshold(level, c), branch: level >= c.stageLevels[3] ? branch : null }
        const eff = {}
        for (const s of [...P.petTalents(data, c), ...P.petSkills(def, data, c)]) eff[s.effect] = (eff[s.effect] || 0) + s.value
        return { name: `${def.name}/${branch}`, gain: petGain(eff, tier) }
      })
      const avg = gains.reduce((s, g) => s + g.gain, 0) / gains.length
      for (const g of gains)
        assert.ok(Math.abs(g.gain / avg - 1) <= 0.05, `Lv${level} · 渔具 ${tier} 阶：${g.name} ${g.gain.toFixed(2)}% vs 平均 ${avg.toFixed(2)}%`)
    }
  }
})

import { oathPet, petMaxed, refreshPets as refreshForOath, feedPet as feedForOath, isHungry as hungryForOath, satRate as rateForOath, petThreshold as thForOath } from "../components/Pet.js"

test("永恒誓约：仅限满级宠物，确认后扣 1 亿，之后永远不饿", () => {
  const H = 3600000, t0 = 1_700_000_000_000
  const maxXp = thForOath(100)
  const user = { gold: 2e8, stats: {}, pets: { active: "koi", owned: {
    koi: { xp: maxXp, branch: null, sat: 40, t: t0 },
    bird: { xp: 0, branch: null, sat: 100, t: t0 },
  }, lost: {}, seen: [] } }
  // 没选方向不算满级
  assert.equal(oathPet(user, "koi", true, t0).reason, "level")
  user.pets.owned.koi.branch = "dragon"
  assert.equal(petMaxed(user.pets.owned.koi), true)
  assert.equal(oathPet(user, "bird", true, t0).reason, "level")
  // 预览不扣钱
  const pre = oathPet(user, "koi", false, t0)
  assert.deepEqual([pre.ok, pre.preview, user.gold, !!user.pets.owned.koi.oath], [true, true, 2e8, false])
  const ret = oathPet(user, "koi", true, t0)
  assert.equal(ret.ok, true)
  assert.equal(user.gold, 1e8)
  const koi = user.pets.owned.koi
  assert.deepEqual([koi.oath, koi.sat, rateForOath(koi, true)], [true, 100, 0])
  assert.equal(oathPet(user, "koi", true, t0).reason, "done")
  // 一年后依然是满的，也不会离家出走
  refreshForOath(user, t0 + 365 * 24 * H)
  assert.equal(user.pets.owned.koi.sat, 100)
  assert.equal(hungryForOath(user.pets.owned.koi), false)
  assert.equal(feedForOath(user, "koi", 1, t0 + H).reason, "oath")
  // 金币不足
  const poor = { gold: 5, stats: {}, pets: { active: "koi", owned: { koi: { xp: maxXp, branch: "dragon", sat: 100, t: t0 } }, lost: {}, seen: [] } }
  assert.equal(oathPet(poor, "koi", false, t0).reason, "gold")
})
