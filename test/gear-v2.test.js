import test from "node:test"
import assert from "node:assert/strict"
import { buyGear,equipGear,cultivateGear,ownedGear,gearLevel,successRate,unlockedTier,gearEffects,bagCapacity } from "../components/Gear.js"
const shop={gearV2:{prices:Array.from({length:20},(_,i)=>200+100*i+50*i*i)}}
const player=(level=43)=>({gold:1000000,stats:{casts:25*(level-1)*level,catches:0},gearV2:{items:{},equipped:{}}})
test("20阶按角色等级解锁购买，装备必须已拥有",()=>{
  const u=player(43)
  assert.equal(unlockedTier(u),9)
  assert.equal(buyGear(u,shop,"rod",10).reason,"locked")
  assert.equal(buyGear(u,shop,"rod",9).ok,true)
  assert.equal(equipGear(u,"rod",9).ok,true)
  assert.equal(gearLevel(u,"rod"),9)
  assert.equal(equipGear(u,"line",9).reason,"not_owned")
})
test("独立强化、锻造，失败扣费不掉级，成功清空各自补偿",()=>{
  const u=player()
  buyGear(u,shop,"rod",9)
  const before=u.gold
  const fail=cultivateGear(u,shop,"rod",9,"enhance",()=>0.999)
  assert.equal(fail.success,false)
  assert.equal(ownedGear(u,"rod",9).enhance,0)
  assert.equal(ownedGear(u,"rod",9).enhanceFails,1)
  assert.equal(u.gold,before-fail.cost)
  const win=cultivateGear(u,shop,"rod",9,"enhance",()=>0)
  assert.equal(win.success,true)
  assert.equal(ownedGear(u,"rod",9).enhance,1)
  assert.equal(ownedGear(u,"rod",9).enhanceFails,0)
  cultivateGear(u,shop,"rod",9,"forge",()=>0.999)
  assert.equal(ownedGear(u,"rod",9).forgeFails,1)
  cultivateGear(u,shop,"rod",9,"enhance",()=>0)
  assert.equal(ownedGear(u,"rod",9).forgeFails,1)
})
test("失败补偿最多50个百分点且只穿戴装备生效",()=>{
  assert.equal(successRate(shop,"enhance",15,999),65)
  const u=player()
  buyGear(u,shop,"rod",9)
  assert.equal(gearEffects(u,shop).boostR,0)
  equipGear(u,"rod",9)
  assert.ok(gearEffects(u,shop).boostR>0)
  assert.equal(bagCapacity(u,shop,200),200)
})
