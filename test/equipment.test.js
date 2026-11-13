import test from "node:test"
import assert from "node:assert/strict"
import { forgeEquipment, wearEquipment, removeEquipment, sellEquipment, equipmentEffects, ensureEquipment } from "../components/Equipment.js"

test("旧存档可初始化独立装备，不影响渔具", () => {
  const user = { gold: 2000, gear: { rod: 8 } }
  ensureEquipment(user)
  assert.deepEqual(user.gear, { rod: 8 })
  assert.equal(user.equipment.inventory.length, 0)
})
test("锻造、穿戴、换装、卸下、出售及金币结算", () => {
  const user = { gold: 3000 }
  assert.equal(forgeEquipment(user, "贝壳护符").ok, true)
  assert.equal(forgeEquipment(user, "珍珠护符").ok, true)
  assert.equal(user.gold, 1200)
  assert.equal(wearEquipment(user, "贝壳护符").ok, true)
  assert.equal(equipmentEffects(user).rareBoost, 0.3)
  assert.equal(wearEquipment(user, "珍珠护符").ok, true)
  assert.equal(equipmentEffects(user).rareBoost, 1)
  assert.equal(sellEquipment(user, "珍珠护符").reason, "missing")
  assert.equal(removeEquipment(user, "护符").ok, true)
  assert.equal(sellEquipment(user, "珍珠护符").ok, true)
  assert.equal(user.gold, 1950)
  assert.deepEqual(equipmentEffects(user), {})
})
test("非法操作不扣钱、不凭空产生装备", () => {
  const user = { gold: 0 }
  assert.equal(forgeEquipment(user, "贝壳护符").reason, "gold")
  assert.equal(wearEquipment(user, "贝壳护符").reason, "missing")
  assert.equal(removeEquipment(user, "徽章").reason, "empty")
  assert.equal(sellEquipment(user, "贝壳护符").reason, "missing")
  assert.equal(user.gold, 0)
})
