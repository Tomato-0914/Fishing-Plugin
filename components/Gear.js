/** 第二版渔具：20 阶、独立购买/穿戴、强化 +15、锻造 +8。 */
import { mergeEffects } from "./Titles.js"
import { characterProgress } from "./Progression.js"
export const SLOTS = ["rod", "line", "hook", "float", "net"]
export const UPGRADE_NAMES = { 鱼竿:"rod", 鱼线:"line", 鱼钩:"hook", 浮漂:"float", 鱼护:"net" }
export const SLOT_NAMES = { rod:"鱼竿", line:"鱼线", hook:"鱼钩", float:"浮漂", net:"鱼护" }
export const TIER_NAMES = ["新手","青竹","精铁","玄木","寒玉","流云","沧浪","星砂","月影","玄冰","烈阳","深渊","龙鳞","凤羽","天罡","星辰","太虚","混元","鸿蒙","创世"]
export const LEVEL_COLORS = ["#9aa5b1","#3bb273","#3a8dde","#a259ff","#f2a900","#fa8c16","#f5222d","#eb2f96","#13c2c2","#722ed1"]
export const LEVEL_LABELS = TIER_NAMES
export const levelColor = lv => LEVEL_COLORS[Math.min(LEVEL_COLORS.length,Math.max(1,lv))-1]
export const levelLabel = lv => TIER_NAMES[Math.min(20,Math.max(1,lv))-1]
export const unlockedTier = user => Math.min(20,Math.max(1,Math.floor((Math.min(100,characterProgress(user).level)-1)/5)+1))
export const tierPrice = (shop,tier) => Math.max(0,Number(shop?.gearV2?.prices?.[tier-1] ?? (200+100*(tier-1)+50*(tier-1)**2)))
export const gearKey = (slot,tier) => `${slot}:${tier}`
export const ownedGear = (user,slot,tier) => user.gearV2?.items?.[gearKey(slot,tier)] || null
export const gearLevel = (user,slot) => Number(user.gearV2?.equipped?.[slot]) || 1
export const maxLevel = () => 20
export const maxGearLevel = user => Math.max(...SLOTS.map(s=>gearLevel(user,s)))
export const gearItem = (shop,slot,tier) => {
  if (!SLOTS.includes(slot)||tier<1||tier>20) return null
  return {slot,slotName:SLOT_NAMES[slot],level:tier,name:`${TIER_NAMES[tier-1]}${SLOT_NAMES[slot]}`,price:tierPrice(shop,tier),emoji:{rod:"🎣",line:"🧵",hook:"🪝",float:"🎈",net:"🧺"}[slot]}
}
export function ensureGear(user) {
  user.gearV2 ||= {items:{},equipped:{}}
  user.gearV2.items ||= {}
  user.gearV2.equipped ||= {}
  for (const slot of SLOTS) {
    const key=gearKey(slot,1)
    user.gearV2.items[key] ||= {enhance:0,forge:0,enhanceFails:0,forgeFails:0}
    user.gearV2.equipped[slot] ||= 1
  }
  return user.gearV2
}
export function buyGear(user,shop,slot,tier) {
  if (!SLOTS.includes(slot)||!Number.isInteger(tier)||tier<1||tier>20) return {ok:false,reason:"invalid"}
  ensureGear(user)
  if (tier>unlockedTier(user)) return {ok:false,reason:"locked",need:(tier-1)*5+1}
  if (ownedGear(user,slot,tier)) return {ok:false,reason:"owned"}
  const cost=tierPrice(shop,tier)
  if (user.gold<cost) return {ok:false,reason:"gold",cost}
  user.gold-=cost
  user.gearV2.items[gearKey(slot,tier)]={enhance:0,forge:0,enhanceFails:0,forgeFails:0}
  user.stats ||= {}
  user.stats.gearSpent=(user.stats.gearSpent||0)+cost
  return {ok:true,cost,item:gearItem(shop,slot,tier)}
}
/** 一次购买同阶五件；已拥有的部位跳过且不重复扣费。校验通过后统一扣款。 */
export function buyGearSet(user, shop, tier) {
  if (!Number.isInteger(tier) || tier < 1 || tier > TIER_NAMES.length)
    return {ok:false,reason:"invalid"}
  ensureGear(user)
  if (tier > unlockedTier(user))
    return {ok:false,reason:"locked",need:(tier-1)*5+1}
  const missing = SLOTS.filter(slot => !ownedGear(user,slot,tier))
  if (!missing.length) return {ok:false,reason:"owned"}
  const cost = tierPrice(shop,tier) * missing.length
  if (user.gold < cost) return {ok:false,reason:"gold",cost,have:user.gold,missing:missing.length}
  user.gold -= cost
  for (const slot of missing)
    user.gearV2.items[gearKey(slot,tier)] = {enhance:0,forge:0,enhanceFails:0,forgeFails:0}
  user.stats ||= {}
  user.stats.gearSpent = (user.stats.gearSpent || 0) + cost
  return {ok:true,cost,slots:missing,skipped:SLOTS.length-missing.length}
}
export function equipGear(user,slot,tier) {
  ensureGear(user)
  if (!SLOTS.includes(slot)||!ownedGear(user,slot,tier)) return {ok:false,reason:"not_owned"}
  if (tier>unlockedTier(user)) return {ok:false,reason:"locked"}
  user.gearV2.equipped[slot]=tier
  return {ok:true}
}
/** 一键穿戴完整套装。先校验五个部位，避免部分切换。 */
export function equipGearSet(user, tier) {
  if (!Number.isInteger(tier) || tier < 1 || tier > TIER_NAMES.length)
    return {ok:false,reason:"invalid"}
  ensureGear(user)
  if (tier > unlockedTier(user))
    return {ok:false,reason:"locked",need:(tier-1)*5+1}
  const missing = SLOTS.filter(slot => !ownedGear(user,slot,tier))
  if (missing.length) return {ok:false,reason:"incomplete",missing}
  const already = SLOTS.every(slot => gearLevel(user,slot) === tier)
  if (already) return {ok:false,reason:"equipped"}
  for (const slot of SLOTS) user.gearV2.equipped[slot] = tier
  return {ok:true,slots:[...SLOTS]}
}
export const enhanceCost = (shop,tier,target) => Math.ceil((Number(shop?.gearV2?.enhanceCostFactor)||50)*tier*target)
export const forgeCost = (shop,tier,target) => Math.ceil((Number(shop?.gearV2?.forgeCostFactor)||100)*tier*target)
export const successRate = (shop,type,target,fails=0) => {
  const defaults=type==="enhance" ? [[3,95,2],[6,85,3],[9,70,5],[12,50,7],[14,30,10],[15,15,10]] : [[2,90,3],[4,75,5],[6,55,7],[7,35,10],[8,20,10]]
  const rows=shop?.gearV2?.rates?.[type]||defaults
  const row=rows.find(r=>target<=Number(r[0]))||rows.at(-1)
  return Math.min(100,Number(row[1])+Math.min(50,Math.max(0,fails)*Number(row[2])))
}
export function cultivateGear(user,shop,slot,tier,type,rng=Math.random) {
  ensureGear(user)
  if (!["enhance","forge"].includes(type)||!SLOTS.includes(slot)||!Number.isInteger(tier)) return {ok:false,reason:"invalid"}
  const item=ownedGear(user,slot,tier)
  if (!item) return {ok:false,reason:"not_owned"}
  const max=type==="enhance"?15:8
  const current=Number(item[type])||0
  if (current>=max) return {ok:false,reason:"max"}
  const target=current+1, cost=type==="enhance"?enhanceCost(shop,tier,target):forgeCost(shop,tier,target)
  if (user.gold<cost) return {ok:false,reason:"gold",cost}
  const failKey=type==="enhance"?"enhanceFails":"forgeFails"
  const chance=successRate(shop,type,target,Number(item[failKey])||0)
  user.gold-=cost
  user.stats ||= {}
  user.stats.gearSpent=(user.stats.gearSpent||0)+cost
  const success=rng()*100<chance
  if (success) { item[type]=target;item[failKey]=0 } else item[failKey]=(Number(item[failKey])||0)+1
  return {ok:true,success,chance,cost,target,failures:item[failKey]}
}
export function upgradeGear(user,shop,slot) { return {ok:false,reason:"obsolete"} }
export function gearEffects(user,shop) {
  ensureGear(user)
  const out=[]
  for (const slot of SLOTS) {
    const tier=gearLevel(user,slot),item=ownedGear(user,slot,tier)
    if (!item) continue
    const e=Number(item.enhance)||0,f=Number(item.forge)||0,t=tier-1
    if(slot==="rod") out.push({boostR:0.25*t+0.15*e,boostSR:0.08*t,boostSSR:0.10*f})
    if(slot==="line") out.push({lineGuard:Math.min(85,2*t+e+1.5*f)})
    if(slot==="hook") out.push({holdChance:Math.min(85,2*t+0.3*e),multiTicket:Math.min(15,0.2*t+0.25*f)})
    if(slot==="float") out.push({biteReduce:Math.min(8,0.10*t+0.03*e),reelWindow:Math.min(10,0.2*t+0.075*f)})
    if(slot==="net") out.push({sellBonus:Math.min(30,0.25*t+0.5*f)})
  }
  return mergeEffects(...out)
}
export function bagCapacity(user,shop,baseLimit=200) {
  ensureGear(user)
  const tier=gearLevel(user,"net")
  const enhance=Number(ownedGear(user,"net",tier)?.enhance)||0
  return Math.max(1,(Number(baseLimit)||200)+50*(tier-1)+5*enhance)
}

/* ---------------- 鱼饵 ---------------- */

export const baitList = shop => shop?.baits || []

export function baitDef(shop, id) {
  return baitList(shop).find(b => b.id === id) || null
}

/** 按名称或 id 查找鱼饵；“鱼饵/普通”等指普通饵 */
export function findBait(shop, keyword) {
  keyword = String(keyword || "").trim()
  if (!keyword || /^(鱼饵|普通|普通鱼饵)$/.test(keyword)) return baitDef(shop, "basic")
  return baitList(shop).find(b => b.name === keyword || b.id === keyword) ||
    baitList(shop).find(b => b.name.includes(keyword)) || null
}

/**
 * 鱼饵单价
 * @param bait config.yaml 的 bait 配置 { price, prices }（也可直接传普通饵单价数字）
 *   普通饵取 bait.price；其他鱼饵优先取 bait.prices[id]，没有再取 shop.yaml 中的 price
 */
export function baitPrice(shop, id, bait = 2) {
  const cfg = typeof bait === "object" && bait ? bait : { price: bait }
  if (id === "basic") return Math.max(0, Number(cfg.price ?? 2) || 0)
  const override = cfg.prices?.[id]
  if (override != null && override !== "" && !Number.isNaN(Number(override))) return Math.max(0, Number(override))
  return Math.max(0, Number(baitDef(shop, id)?.price) || 0)
}

/** 鱼饵等级：未填写时视为 1 级 */
export const baitLevel = bait => Math.max(1, Number(bait?.level) || 1)

/** 能否使用 / 购买：至少有一件渔具达到鱼饵等级 */
export const canUseBait = (user, bait) => baitLevel(bait) <= Math.ceil(maxGearLevel(user)/2)

export const baitCount = (user, id) => Math.max(0, Number(user.baits?.[id]) || 0)

export const totalBait = user => Object.values(user.baits || {}).reduce((s, n) => s + Math.max(0, Number(n) || 0), 0)

export function addBait(user, id, n) {
  user.baits ||= {}
  user.baits[id] = baitCount(user, id) + Math.max(0, Math.floor(Number(n) || 0))
  return user.baits[id]
}

/** 当前使用的鱼饵（不存在时为普通饵） */
export function currentBait(user, shop) {
  return baitDef(shop, user.baitUse) || baitDef(shop, "basic") || { id: "basic", name: "普通饵", emoji: "🥣", effects: {} }
}

/**
 * 抛竿消耗 1 个鱼饵
 * - 当前鱼饵等级超过渔具（reason: "locked"）：换成能用、有库存的最高级鱼饵
 * - 当前鱼饵用完（reason: "empty"）：换成能用、有库存的鱼饵，普通饵优先，其次按商店顺序
 * 能用的鱼饵都没有库存时返回 null（高级鱼饵仍保留在库存里，渔具升级后可用）
 * @returns {{ bait, switched:boolean, from, reason? } | null}
 */
export function consumeBait(user, shop) {
  const cur = currentBait(user, shop)
  let bait = cur
  let reason
  const usable = baitList(shop).filter(b => canUseBait(user, b) && baitCount(user, b.id) > 0)
  if (!canUseBait(user, cur)) {
    reason = "locked"
    bait = [...usable].sort((a, b) => baitLevel(b) - baitLevel(a))[0]
  } else if (baitCount(user, cur.id) < 1) {
    reason = "empty"
    bait = usable.find(b => b.id === "basic") || usable[0]
  }
  if (!bait) return null
  if (bait.id !== cur.id) user.baitUse = bait.id
  user.baits[bait.id]--
  return { bait, switched: bait.id !== cur.id, from: cur, reason }
}

/** 能用的鱼饵总数（等级够、有库存） */
export const usableBait = (user, shop) =>
  baitList(shop).filter(b => canUseBait(user, b)).reduce((s, b) => s + baitCount(user, b.id), 0)

/** 切换鱼饵（必须有库存） */
export function useBait(user, shop, id) {
  const b = baitDef(shop, id)
  if (!b) return { ok: false, reason: "unknown" }
  if (!canUseBait(user, b)) return { ok: false, reason: "locked", bait: b, need: baitLevel(b) }
  if (baitCount(user, id) < 1) return { ok: false, reason: "empty", bait: b }
  user.baitUse = id
  return { ok: true, bait: b }
}

/** 购买鱼饵 */
export function buyBait(user, shop, id, count, baitCfg = 2) {
  count = Math.floor(Number(count) || 0)
  const bait = baitDef(shop, id)
  if (!bait) return { ok: false, reason: "unknown" }
  if (!canUseBait(user, bait)) return { ok: false, reason: "locked", bait, need: baitLevel(bait) }
  if (count < 1) return { ok: false, reason: "count" }
  const price = baitPrice(shop, id, baitCfg)
  const cost = count * price
  if (user.gold < cost) return { ok: false, reason: "gold", bait, cost, afford: price ? Math.floor(user.gold / price) : count }
  user.gold -= cost
  addBait(user, id, count)
  user.stats.baitBought = (user.stats.baitBought || 0) + count
  user.stats.baitSpent = (user.stats.baitSpent || 0) + cost
  return { ok: true, bait, count, cost }
}

/* ---------------- 断线 ---------------- */

/** 单次钓鱼额外获得十连机会的概率（%）：基础概率 + 鱼钩等的 multiTicket */
export const multiTicketChance = (base, effects = {}) =>
  Math.min(100, Math.max(0, (Number(base) || 0) + (Number(effects.multiTicket) || 0)))

/** 鱼钩防跑鱼：咬钩后没及时收杆时，按 holdChance% 的概率鱼仍被钩住 */
export function holdsOnTimeout(effects = {}, rng = Math.random) {
  const chance = Math.min(100, Math.max(0, Number(effects.holdChance) || 0))
  return chance > 0 && rng() * 100 < chance
}

/** 本次收杆的断线概率（%） */
export function breakChance(result, lineBreak = {}, effects = {}) {
  if (result?.type !== "item") return 0
  const r = result.rarity
  if (["junk", "hidden", "protected"].includes(r)) return 0
  const sizeExtra = result.size === "large" || result.size === "xlarge" ? Number(lineBreak[result.size]) || 0 : 0
  let chance = (Number(lineBreak[r]) || 0) + sizeExtra
  chance *= 1 - Math.min(100, Math.max(0, Number(effects.lineGuard) || 0)) / 100
  return Math.max(0, Math.min(100, chance))
}

/* ---------------- 汇总 ---------------- */

/** 汇总一次钓鱼的全部效果：称号 + 打卡幸运 + 渔具 + 本竿鱼饵 */
export function allEffects({ titles = {}, luck = {}, gear = {}, bait = {} } = {}) {
  return mergeEffects(titles, luck, gear, bait)
}
