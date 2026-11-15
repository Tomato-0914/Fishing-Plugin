import test from "node:test"
import assert from "node:assert/strict"
import { gearRarityOdds, ROD_ODDS, TOP_ODDS, rareTargets, MAX_SHIFT } from "../components/GearOdds.js"
import { buildOdds } from "../components/ItemPool.js"
const K = ["N","R","SR","SSR","UR","EP","MR"]
const total = o => Object.values(o).reduce((a,b) => a+b, 0)
const full = { rarityTier: 20, rarityShift: 0.75, rarePoints: 14.65 }

test("all 20 rod tiers total exactly 100% and keep locked tiers at zero",()=>{
  for(let tier=1;tier<=20;tier++){
    const odds=gearRarityOdds({rarityTier:tier,rarePoints:30})
    assert.ok(Math.abs(total(odds)-100)<1e-8)
    assert.ok(Object.values(odds).every(v=>v>=0))
    for(let i=0;i<7;i++) if(ROD_ODDS[tier-1][i]===0) assert.equal(odds[K[i]],0)
  }
  assert.ok(Math.abs(TOP_ODDS.reduce((a,b)=>a+b,0)-100)<1e-9)
})

test("rarity shift interpolates toward the next tier and never reaches it",()=>{
  const half=gearRarityOdds({rarityTier:5,rarityShift:0.5})
  for(let i=0;i<7;i++) assert.ok(Math.abs(half[K[i]]-(ROD_ODDS[4][i]+ROD_ODDS[5][i])/2)<1e-9,K[i])
  const capped=gearRarityOdds({rarityTier:5,rarityShift:5})
  for(let i=0;i<7;i++) assert.ok(Math.abs(capped[K[i]]-(ROD_ODDS[4][i]+(ROD_ODDS[5][i]-ROD_ODDS[4][i])*MAX_SHIFT))<1e-9,K[i])
  // 20 阶向虚拟的第 21 行靠拢
  assert.ok(gearRarityOdds({rarityTier:20,rarityShift:0.5}).MR>ROD_ODDS[19][6])
})

test("rare points go to the top three unlocked SR+ rarities, rarer ones get less",()=>{
  assert.deepEqual(rareTargets(20).map(([i,s])=>[K[i],Number(s.toFixed(4))]),[["UR",0.5],["EP",0.3333],["MR",0.1667]])
  assert.deepEqual(rareTargets(5).map(([i,s])=>[K[i],Number(s.toFixed(4))]),[["SR",0.6667],["SSR",0.3333]])
  assert.deepEqual(rareTargets(1).map(([i])=>K[i]),["R"])
  const base=gearRarityOdds({rarityTier:5}), up=gearRarityOdds({rarityTier:5,rarePoints:3})
  assert.ok(Math.abs(up.SR-base.SR-2)<1e-9 && Math.abs(up.SSR-base.SSR-1)<1e-9)
  assert.ok(up.N<base.N && up.R<base.R)
  assert.ok(Math.abs(total(up)-100)<1e-9)
  // 低品级最多扣掉 90%
  const huge=gearRarityOdds({rarityTier:20,rarePoints:1000})
  assert.ok(huge.N>0 && huge.R>0 && huge.SR>0)
})

test("no mythic cap: gear, set and titles stack beyond 4%",()=>{
  const odds=gearRarityOdds(full)
  assert.ok(odds.MR>4.5,`MR ${odds.MR}`)
  assert.ok(odds.MR>gearRarityOdds({rarityTier:20}).MR*3)
})

test("new player cannot catch legendary or mythic even with old title/bait rarity boosts",()=>{
  const p={mode:"gear",empty:15,junk:20,hidden:{rare_event:0.1},protected:{protected_fish:0.2}}
  const odds=buildOdds(p,{rarityTier:1,rarePoints:100,boostMR:999,rareBoost:999})
  assert.equal(odds.MR,0)
  assert.equal(odds.UR,0)
  assert.equal(odds["hidden:rare_event"],0.1)
  assert.equal(odds["hidden:protected_fish"],0.2)
  assert.ok(Math.abs(total(odds)-100)<1e-8)
})

test("legacy boost/rareBoost fields do not change gear-mode odds",()=>{
  const p={mode:"gear",empty:15,junk:20,hidden:{},protected:{}}
  assert.deepEqual(buildOdds(p,full),buildOdds(p,{...full,boostMR:999,boostUR:999,rareBoost:999}))
})
