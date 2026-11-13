/** 独立角色装备：不替代现有鱼竿/鱼线/鱼钩/浮漂/鱼护。 */
export const EQUIPMENT = Object.freeze([
  { id: "shell", name: "贝壳护符", slot: "charm", price: 300, sell: 150, effects: { rareBoost: 0.3 } },
  { id: "pearl", name: "珍珠护符", slot: "charm", price: 1500, sell: 750, effects: { rareBoost: 1 } },
  { id: "tide", name: "潮汐徽章", slot: "badge", price: 600, sell: 300, effects: { biteReduce: 0.5 } },
  { id: "ocean", name: "深海徽章", slot: "badge", price: 2400, sell: 1200, effects: { biteReduce: 1.5 } },
])
export const SLOT_NAMES = { charm: "护符", badge: "徽章" }
const safe = n => Math.max(0, Math.floor(Number(n) || 0))
export const equipmentDef = name => EQUIPMENT.find(x => x.id === String(name).trim() || x.name === String(name).trim())
export function ensureEquipment(user) {
  if (!user.equipment || typeof user.equipment !== "object" || Array.isArray(user.equipment)) user.equipment = {}
  if (!Array.isArray(user.equipment.inventory)) user.equipment.inventory = []
  if (!user.equipment.worn || typeof user.equipment.worn !== "object" || Array.isArray(user.equipment.worn)) user.equipment.worn = {}
  user.equipment.inventory = user.equipment.inventory.filter(x => equipmentDef(x))
  for (const slot of Object.keys(SLOT_NAMES)) {
    if (!equipmentDef(user.equipment.worn[slot]) || equipmentDef(user.equipment.worn[slot])?.slot !== slot) delete user.equipment.worn[slot]
  }
  return user.equipment
}
export function equipmentEffects(user) {
  const worn = user?.equipment?.worn || {}
  const effects = {}
  for (const slot of Object.keys(SLOT_NAMES)) {
    const item = equipmentDef(worn[slot])
    if (!item || item.slot !== slot) continue
    for (const [key, value] of Object.entries(item.effects)) effects[key] = (effects[key] || 0) + value
  }
  return effects
}
export function forgeEquipment(user, name) {
  const item = equipmentDef(name)
  if (!item) return { ok: false, reason: "unknown" }
  const eq = ensureEquipment(user)
  if (eq.inventory.length >= 100) return { ok: false, reason: "full" }
  if (safe(user.gold) < item.price) return { ok: false, reason: "gold", cost: item.price }
  user.gold -= item.price
  eq.inventory.push(item.id)
  return { ok: true, item }
}
export function wearEquipment(user, name) {
  const item = equipmentDef(name)
  if (!item) return { ok: false, reason: "unknown" }
  const eq = ensureEquipment(user)
  const idx = eq.inventory.indexOf(item.id)
  if (idx < 0) return { ok: false, reason: "missing" }
  const old = eq.worn[item.slot]
  eq.inventory.splice(idx, 1)
  if (old) eq.inventory.push(old)
  eq.worn[item.slot] = item.id
  return { ok: true, item, old: equipmentDef(old) }
}
export function removeEquipment(user, slotName) {
  const slot = Object.keys(SLOT_NAMES).find(x => x === slotName || SLOT_NAMES[x] === slotName)
  if (!slot) return { ok: false, reason: "unknown" }
  const eq = ensureEquipment(user)
  const id = eq.worn[slot]
  if (!id) return { ok: false, reason: "empty" }
  if (eq.inventory.length >= 100) return { ok: false, reason: "full" }
  eq.inventory.push(id)
  delete eq.worn[slot]
  return { ok: true, item: equipmentDef(id) }
}
export function sellEquipment(user, name) {
  const item = equipmentDef(name)
  if (!item) return { ok: false, reason: "unknown" }
  const eq = ensureEquipment(user)
  const idx = eq.inventory.indexOf(item.id)
  if (idx < 0) return { ok: false, reason: "missing" }
  eq.inventory.splice(idx, 1)
  user.gold = safe(user.gold) + item.sell
  return { ok: true, item }
}
