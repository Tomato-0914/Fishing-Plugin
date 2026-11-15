import test from "node:test"
import assert from "node:assert/strict"
import { buyGear,equipGear,cultivateGear,ownedGear,gearLevel,successRate,unlockedTier,tierNeedLevel,gearEffects,bagCapacity } from "../components/Gear.js"
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
  // 前 3 级必定成功，从 +4 开始才可能失败
  for(let i=0;i<3;i++) assert.equal(cultivateGear(u,shop,"rod",9,"enhance",()=>0.999).success,true)
  for(let i=0;i<3;i++) cultivateGear(u,shop,"rod",9,"forge",()=>0.999)
  const before=u.gold
  const fail=cultivateGear(u,shop,"rod",9,"enhance",()=>0.999)
  assert.equal(fail.success,false)
  assert.equal(ownedGear(u,"rod",9).enhance,3)
  assert.equal(ownedGear(u,"rod",9).enhanceFails,1)
  assert.equal(u.gold,before-fail.cost)
  const win=cultivateGear(u,shop,"rod",9,"enhance",()=>0)
  assert.equal(win.success,true)
  assert.equal(ownedGear(u,"rod",9).enhance,4)
  assert.equal(ownedGear(u,"rod",9).enhanceFails,0)
  cultivateGear(u,shop,"rod",9,"forge",()=>0.999)
  assert.equal(ownedGear(u,"rod",9).forgeFails,1)
  cultivateGear(u,shop,"rod",9,"enhance",()=>0)
  assert.equal(ownedGear(u,"rod",9).forgeFails,1)
})
test("失败补偿最多50个百分点且只穿戴装备生效",()=>{
  assert.equal(successRate(shop,"enhance",15,999),58) // 默认 8% + 补偿最多 50
  const u=player()
  buyGear(u,shop,"rod",9)
  assert.equal(gearEffects(u,shop).rarityTier,1) // 买了不穿戴不生效
  equipGear(u,"rod",9)
  assert.equal(gearEffects(u,shop).rarityTier,9)
  assert.equal(bagCapacity(u,shop,200),200)
})
test("阶位解锁：Lv1~4 为 1 阶，之后每 5 级一阶，Lv95 解锁 20 阶",()=>{
  for(const [lv,tier] of [[1,1],[4,1],[5,2],[9,2],[10,3],[14,3],[15,4],[19,4],[24,5],[25,6],[90,19],[94,19],[95,20],[100,20]])
    assert.equal(unlockedTier(player(lv)),tier,`Lv${lv}`)
  assert.deepEqual([1,2,3,4,6,20].map(tierNeedLevel),[1,5,10,15,25,95])
  // 每一阶的需求等级刚好解锁该阶
  for(let t=1;t<=20;t++){
    assert.equal(unlockedTier(player(tierNeedLevel(t))),t,`T${t}`)
    if(t>1) assert.equal(unlockedTier(player(tierNeedLevel(t)-1)),t-1,`T${t}-1`)
  }
  const u=player(9)
  assert.deepEqual(buyGear(u,shop,"rod",3),{ok:false,reason:"locked",need:10})
  assert.equal(buyGear(u,shop,"rod",2).ok,true)
})
