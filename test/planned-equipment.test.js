import test from "node:test"
import assert from "node:assert/strict"
import { ensureGearCollection, currentEquipment, equipmentBonus, purchaseEquipment, upgradeEquipment, forgeEquipment } from "../components/PlannedEquipment.js"

test("旧五件渔具映射为同等级普通装备，保留原始 gear 和效果", () => {
  const user = { gear: { rod: 8, line: 4, hook: 2, float: 3, net: 10 } }
  const items = ensureGearCollection(user)
  assert.equal(items.rod.level, 8)
  assert.equal(items.net.level, 10)
  assert.equal(items.rod.quality, 0)
  assert.equal(items.rod.forge, 0)
  assert.deepEqual(equipmentBonus(user), {})
  assert.equal(user.gear.rod, 8)
})
test("购买、升级和强化扣金币，品质与等级影响属性", () => {
  const user = { gold: 100000, gear: { rod: 1 } }
  const purchase = purchaseEquipment(user, "rod", "稀有", 3)
  assert.equal(purchase.ok, true)
  assert.equal(purchase.price, 2880)
  assert.equal(currentEquipment(user)[0].level, 3)
  assert.ok(equipmentBonus(user).rareBoost > 0)
  assert.equal(upgradeEquipment(user, "rod").ok, true)
  assert.equal(forgeEquipment(user, "rod", () => 0).ok, true)
  assert.equal(currentEquipment(user)[0].forge, 1)
})
test("强化失败不退金币，失败补偿累积 +5%，成功重置", () => {
  const user = { gold: 100000 }
  const first = forgeEquipment(user, "rod", () => 0)
  assert.equal(first.ok, true)
  const before = user.gold
  const failed = forgeEquipment(user, "rod", () => 0.9999)
  assert.equal(failed.reason, "failed")
  assert.equal(failed.item.pity, 5)
  assert.equal(user.gold, before - failed.price)
  const success = forgeEquipment(user, "rod", () => 0)
  assert.equal(success.ok, true)
  assert.equal(success.item.pity, 0)
})
test("异常参数和余额不足时不产生装备或扣金币", () => {
  const user = { gold: 0 }
  assert.equal(purchaseEquipment(user, "rod", "神话", 21).reason, "level")
  assert.equal(purchaseEquipment(user, "rod", "神话", 1).reason, "gold")
  assert.equal(forgeEquipment(user, "rod").reason, "gold")
  assert.equal(user.gold, 0)
})
