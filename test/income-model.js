/**
 * 每竿平均收益模型（测试用）：按当前概率、鱼价、体型、断线、鱼饵价格计算期望金币，
 * 用来检查宠物各条路线在同等级时收益是否接近
 */
import Config from "../components/Config.js"
import { buildOdds, buildSizeOdds, FISH_TIERS, NEXT_RARITY } from "../components/ItemPool.js"
import { SLOTS, gearEffects, breakChance, baitPrice } from "../components/Gear.js"
import { mergeEffects } from "../components/Titles.js"

const cfg = Config.config, shop = Config.shop, items = Config.items
const cache = new Map()

/** 某个品级的平均售价（扣掉断线）与断线损失 */
function poolStats(r, eff) {
  const pool = items.filter(i => i.rarity === r)
  if (!pool.length) return { price: 0 }
  const tw = pool.reduce((s, i) => s + (i.chance ?? 1), 0)
  const sz = buildSizeOdds(cfg.size, eff), st = Object.values(sz).reduce((a, b) => a + b, 0)
  let price = 0
  for (const i of pool) {
    const w = (i.chance ?? 1) / tw
    if (!Array.isArray(i.weight)) { price += w * (i.price || 0); continue }
    for (const [k, c] of Object.entries(sz)) {
      const bc = breakChance({ type: "item", rarity: r, size: k }, shop.lineBreak, eff) / 100
      price += w * c / st * (i.price || 0) * (cfg.size[k].price || 1) * (1 - bc)
    }
  }
  return { price }
}

/** 每竿期望收益（金币，已扣鱼饵成本） */
export function incomePerCast(eff) {
  const odds = buildOdds(cfg.probability, eff, cfg.limits)
  const tot = Object.values(odds).reduce((a, b) => a + b, 0)
  let fishEV = 0, upEV = 0
  for (const r of FISH_TIERS) {
    const p = (odds[r] || 0) / tot, s = poolStats(r, eff)
    fishEV += p * s.price
    upEV += p * (poolStats(NEXT_RARITY[r], eff).price - s.price)
  }
  const sell = 1 + (eff.sellBonus || 0) / 100
  const pct = k => (eff[k] || 0) / 100
  return fishEV * sell * (1 + pct("doublePrice") + 2 * pct("triplePrice") + pct("extraFish") + 2 * pct("extraFish2"))
    + upEV * sell * pct("rarityUp")
    - (eff._baitCost || 0) * (1 - pct("baitSave"))
}

/** 参考玩家：五件同阶渔具（未强化），用同等级鱼饵，不算称号和运势 */
export function referenceEffects(tier) {
  if (cache.has(tier)) return cache.get(tier)
  const u = { gearV2: { items: {}, equipped: {} }, stats: {} }
  for (const s of SLOTS) { u.gearV2.items[`${s}:${tier}`] = { enhance: 0, forge: 0 }; u.gearV2.items[`${s}:1`] ||= { enhance: 0, forge: 0 }; u.gearV2.equipped[s] = tier }
  const bait = shop.baits.find(b => (b.level || 1) === tier) || shop.baits[0]
  const eff = { ...mergeEffects(gearEffects(u, shop), bait.effects || {}), _baitCost: baitPrice(shop, bait.id, cfg.bait) }
  cache.set(tier, eff)
  return eff
}

/** 宠物效果带来的收益提升（%） */
export function petGain(petEffects, tier) {
  const base = referenceEffects(tier)
  const with_ = { ...base }
  for (const [k, v] of Object.entries(petEffects)) with_[k] = (with_[k] || 0) + v
  return (incomePerCast(with_) / incomePerCast(base) - 1) * 100
}
