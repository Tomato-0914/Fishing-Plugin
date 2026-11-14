import test from "node:test"
import assert from "node:assert/strict"
import { gearRarityOdds, ROD_ODDS } from "../components/GearOdds.js"
import { buildOdds } from "../components/ItemPool.js"
const full={rarityTier:20,rarityUR:8,rarityEP:6.5,rarityMR:2.5}
test("all 20 rod tiers total exactly 100% and keep locked tiers at zero",()=>{
  for(let tier=1;tier<=20;tier++){
    const odds=gearRarityOdds({rarityTier:tier,rarityUR:8,rarityEP:6.5,rarityMR:2.5})
    assert.ok(Math.abs(Object.values(odds).reduce((a,b)=>a+b,0)-100)<1e-8)
    assert.ok(Object.values(odds).every(v=>v>=0))
    for(let i=0;i<7;i++) if(ROD_ODDS[tier-1][i]===0) assert.equal(odds[["N","R","SR","SSR","UR","EP","MR"][i]],0)
  }
})
test("fully cultivated creation gear reaches exact 4% mythic conditional probability",()=>{
  const odds=gearRarityOdds(full)
  for(const [k,v] of Object.entries({N:1,R:8,SR:22,SSR:27,UR:27,EP:11,MR:4}))
    assert.ok(Math.abs(odds[k]-v)<1e-8,`${k}: ${odds[k]}`)
})
test("new player cannot catch legendary or mythic even with old title/bait rarity boosts",()=>{
  const p={mode:"gear",empty:15,junk:20,hidden:{rare_event:0.1},protected:{protected_fish:0.2}}
  const odds=buildOdds(p,{rarityTier:1,rarityUR:100,rarityEP:100,rarityMR:100,boostMR:999,rareBoost:999})
  assert.equal(odds.MR,0)
  assert.equal(odds.UR,0)
  assert.equal(odds["hidden:rare_event"],0.1)
  assert.equal(odds["hidden:protected_fish"],0.2)
  assert.ok(Math.abs(Object.values(odds).reduce((a,b)=>a+b,0)-100)<1e-8)
})
test("bait and title rarity modifiers cannot alter the full set's mythic probability",()=>{
  const p={mode:"gear",empty:15,junk:20,hidden:{},protected:{}}
  const a=buildOdds(p,full)
  const b=buildOdds(p,{...full,boostMR:999,boostUR:999,rareBoost:999})
  assert.deepEqual(a,b)
  assert.ok(Math.abs(a.MR/(100-a.empty-a.junk)*100-4)<1e-8)
})
