import test from "node:test"
import assert from "node:assert/strict"
import {buyGearSet,buyGear,equipGearSet,gearLevel,ownedGear,SLOTS} from "../components/Gear.js"
const player=(level=25)=>({gold:100000,stats:{casts:25*(level-1)*level,catches:0},gearV2:{items:{},equipped:{}}})
test("完整套装一次穿戴五件并保留强化锻造",()=>{
 const u=player()
 buyGearSet(u,{},5)
 ownedGear(u,"rod",5).enhance=7
 ownedGear(u,"hook",5).forge=3
 assert.equal(equipGearSet(u,5).ok,true)
 for(const slot of SLOTS)assert.equal(gearLevel(u,slot),5)
 assert.equal(ownedGear(u,"rod",5).enhance,7)
 assert.equal(ownedGear(u,"hook",5).forge,3)
 assert.equal(equipGearSet(u,5).reason,"equipped")
})
test("套装不完整时拒绝并不改变任何已穿戴部位",()=>{
 const u=player()
 buyGear(u,{},"rod",5)
 const ret=equipGearSet(u,5)
 assert.equal(ret.reason,"incomplete")
 assert.equal(ret.missing.length,4)
 for(const slot of SLOTS)assert.equal(gearLevel(u,slot),1)
})
test("等级不足时不能使用未解锁套装",()=>{
 const u=player(1)
 assert.equal(equipGearSet(u,5).reason,"locked")
})
