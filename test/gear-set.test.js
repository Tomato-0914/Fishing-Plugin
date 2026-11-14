import test from "node:test"
import assert from "node:assert/strict"
import { buyGearSet,buyGear,ownedGear,SLOTS,tierPrice } from "../components/Gear.js"
const shop={}
const player=(level=25,gold=100000)=>({gold,stats:{casts:25*(level-1)*level,catches:0},gearV2:{items:{},equipped:{}}})
test("购买寒玉套装一次获得五件并扣除总价",()=>{
  const u=player(),price=tierPrice(shop,5)
  const ret=buyGearSet(u,shop,5)
  assert.equal(ret.ok,true)
  assert.equal(ret.cost,price*5)
  assert.equal(u.gold,100000-price*5)
  for(const slot of SLOTS)assert.ok(ownedGear(u,slot,5))
})
test("已有部分装备仅购买缺失件且不重置强化",()=>{
  const u=player()
  buyGear(u,shop,"rod",5)
  ownedGear(u,"rod",5).enhance=3
  const ret=buyGearSet(u,shop,5)
  assert.equal(ret.cost,tierPrice(shop,5)*4)
  assert.equal(ret.skipped,1)
  assert.equal(ownedGear(u,"rod",5).enhance,3)
  assert.equal(buyGearSet(u,shop,5).reason,"owned")
})
test("金币不足和等级不足时不发生部分购买",()=>{
  const poor=player(25,1),before=poor.gold
  assert.equal(buyGearSet(poor,shop,5).reason,"gold")
  assert.equal(poor.gold,before)
  assert.equal(SLOTS.some(s=>ownedGear(poor,s,5)),false)
  const low=player(1)
  assert.equal(buyGearSet(low,shop,5).reason,"locked")
  assert.equal(SLOTS.some(s=>ownedGear(low,s,5)),false)
})
