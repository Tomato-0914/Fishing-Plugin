import test from "node:test"
import assert from "node:assert/strict"
import Config from "../components/Config.js"
import { newUser } from "../components/UserData.js"
import * as P from "../components/Pet.js"
import { resolveCast, withExtras, petProcLine } from "../components/Catch.js"
import { petGain } from "./income-model.js"

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
  assert.equal(P.currentForm(P.petDef("koi"), d, c).name, "蛟")
  assert.equal(P.evolvePet(u, "koi", "化鲲", T0).reason, "chosen")
  r = P.addPetXp(u, P.petThreshold(80, c) - d.xp, T0)
  assert.deepEqual(r.evolved.map(f => f.name), ["龙"])
  r = P.addPetXp(u, 1e9, T0)
  assert.equal(r.after, 100)
  assert.ok(r.max)
  assert.equal(P.addPetXp(u, 100, T0), null)
  assert.deepEqual(P.petGainLines(null), [])
})

test("宠物技能：每阶解锁一个，之前的技能每进一阶提升 25%；饥饿时全部失效", () => {
  const u = rich("p4"); P.buyPet(u, "bird", T0)
  const d = u.pets.owned.bird
  d.xp = P.petThreshold(85, c); d.branch = "crow"
  const skills = P.petSkills(P.petDef("bird"), d, c)
  assert.deepEqual(skills.map(s => s.name), ["衔鱼", "报晓", "青羽", "逐日", "烈日"])
  assert.equal(skills[0].value, 1.5 * 2)
  assert.equal(skills[3].value, 1.8 * 1.25)
  assert.equal(skills[4].value, 6)
  const eff = P.petEffects(u, T0)
  assert.equal(eff.baitSave, 6)
  assert.equal(eff.extraFish, 3)
  d.sat = c.satiety.hungry
  assert.deepEqual(P.petEffects(u, T0), {})
})

test("饱食度：出战每小时 -1、休息 -0.2；口粮 +5，最多喂到 100，多余的不扣费", () => {
  const u = rich("p5"); P.buyPet(u, "koi", T0); P.buyPet(u, "bird", T0)
  P.refreshPets(u, T0 + 10 * H)
  assert.equal(u.pets.owned.koi.sat, 90)
  assert.equal(u.pets.owned.bird.sat, 98)
  const gold = u.gold
  const f = P.feedPet(u, "koi", 50, T0 + 10 * H)
  assert.deepEqual([f.units, f.cost, f.sat, f.capped], [2, 20000, 100, true])
  assert.equal(u.gold, gold - 20000)
  assert.equal(P.feedPet(u, "koi", 1, T0 + 10 * H).reason, "full")
  P.refreshPets(u, T0 + 13 * H)
  assert.equal(P.feedPet(u, "koi", 1, T0 + 13 * H).sat, 100)   // 97 + 5 封顶 100
})

test("离家出走：饱食度到 0 失去宠物，7 天内 100 万寻回（保留等级），超过 7 天不能寻回", () => {
  const u = rich("p6"); P.buyPet(u, "koi", T0)
  u.pets.owned.koi.xp = P.petThreshold(30, c)
  const gone = P.refreshPets(u, T0 + 101 * H)
  assert.deepEqual(gone, ["koi"])
  assert.equal(u.pets.active, null)
  assert.equal(u.pets.lost.koi.lostAt, T0 + 100 * H)
  assert.ok(P.petNotices(u, T0 + 101 * H)[0].includes("离家出走"))
  assert.equal(P.petNotices(u, T0 + 102 * H).length, 0)   // 只提醒一次
  const gold = u.gold
  const r = P.recallPet(u, "koi", T0 + 120 * H)
  assert.ok(r.ok)
  assert.equal(u.gold, gold - 1000000)
  assert.equal(P.petLevel(u.pets.owned.koi, c), 30)
  assert.equal(u.pets.owned.koi.sat, 100)
  assert.equal(u.pets.active, "koi")
  // 再饿跑一次，超过 7 天
  P.refreshPets(u, T0 + 300 * H)
  assert.equal(P.recallPet(u, "koi", T0 + 300 * H + 8 * 24 * H).reason, "expired")
  assert.equal(P.lostPets(u, T0 + 300 * H + 8 * 24 * H).length, 0)
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

test("宠物配平：同等级的各条路线每竿收益相差不超过 ±5%", () => {
  const defs = Config.pets
  // 宠物经验与角色同步，宠物等级越高，角色等级（渔具阶位）至少越高：按各阶对应的合理渔具阶位检查
  const tiers = { 1: [3, 20], 2: [6, 20], 3: [11, 20], 4: [16, 20], 5: [18, 20] }
  const paths = defs.flatMap(def => def.branches.map(b => ({ def, branch: b.id })))
  for (let stage = 1; stage <= 5; stage++) {
    const level = c.stageLevels[stage - 1]
    for (let tier = tiers[stage][0]; tier <= tiers[stage][1]; tier++) {
      const gains = paths.map(({ def, branch }) => {
        const data = { xp: P.petThreshold(level, c), branch: stage >= 4 ? branch : null }
        const eff = {}
        for (const s of P.petSkills(def, data, c)) eff[s.effect] = (eff[s.effect] || 0) + s.value
        return { name: `${def.name}/${branch}`, gain: petGain(eff, tier) }
      })
      const avg = gains.reduce((s, g) => s + g.gain, 0) / gains.length
      for (const g of gains)
        assert.ok(Math.abs(g.gain / avg - 1) <= 0.05, `${stage} 阶 · 渔具 ${tier} 阶：${g.name} ${g.gain.toFixed(2)}% vs 平均 ${avg.toFixed(2)}%`)
    }
  }
})
