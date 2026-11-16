/**
 * 宠物：购买、经验与进化、饱食度、出战、寻回（纯逻辑，便于测试）
 * 存档 user.pets = {
 *   owned: { <宠物 id>: { xp, branch, name, sat, t, at } },  // sat 饱食度，t 上次结算饱食度的时间
 *   active: <宠物 id> | null, switchDay, switchCount,
 *   lost: { <宠物 id>: { ...宠物数据, lostAt, notified } },   // 离家出走，pet.recall.days 天内可寻回
 *   seen: [<形态 id>],                                         // 见过的形态（宠物图鉴）
 * }
 */
import Config from "./Config.js"
import { periodKey } from "./Period.js"
import { characterProgress } from "./Progression.js"

const HOUR = 3600000
const n0 = v => Math.max(0, Number(v) || 0)

/** 宠物设置（config.yaml pet），补齐默认值 */
export function petCfg(cfg = Config.config?.pet) {
  const c = cfg || {}
  const sat = c.satiety || {}, food = c.food || {}, recall = c.recall || {}
  return {
    unlockLevel: n0(c.unlockLevel ?? 10),
    price: n0(c.price ?? 100000),
    maxLevel: Math.max(1, Math.floor(Number(c.maxLevel) || 100)),
    xpFactor: Math.max(1, Number(c.xpFactor) || 40),
    stageLevels: Array.isArray(c.stageLevels) && c.stageLevels.length === 5 ? c.stageLevels.map(Number) : [1, 20, 40, 60, 80],
    skillGrowth: n0(c.skillGrowth ?? 25),
    switchPerDay: Math.max(1, Math.floor(Number(c.switchPerDay) || 1)),
    satiety: {
      max: Math.max(1, Number(sat.max) || 100), hungry: n0(sat.hungry ?? 30), warn: n0(sat.warn ?? 50), active: n0(sat.active ?? 1), rest: n0(sat.rest ?? 0.2),
      stageRate: Array.isArray(sat.stageRate) && sat.stageRate.length === 5 ? sat.stageRate.map(n0) : [0.2, 1, 5, 25, 50],
    },
    food: { price: n0(food.price ?? 10000), value: Math.max(0.1, Number(food.value) || 5) },
    recall: { price: n0(recall.price ?? 1000000), days: n0(recall.days ?? 7) },
  }
}

export const petDefs = () => Config.pets || []
export const petDef = (id, defs = petDefs()) => defs.find(d => d.id === id) || null
/** 四阶开始需要选择方向的等级 */
export const branchLevel = c => c.stageLevels[3]

export function ensurePets(user) {
  user.pets ||= {}
  const p = user.pets
  p.owned ||= {}
  p.lost ||= {}
  p.seen ||= []
  if (p.active === undefined) p.active = null
  return p
}

/* ---------------- 等级与形态 ---------------- */

export const petThreshold = (level, c = petCfg()) => c.xpFactor * Math.max(0, level - 1) * Math.max(1, level)
/** 经验对应的等级（不考虑进化方向） */
export function rawPetLevel(xp, c = petCfg()) {
  const lv = Math.floor((1 + Math.sqrt(1 + 4 * n0(xp) / c.xpFactor)) / 2)
  return Math.min(c.maxLevel, Math.max(1, lv))
}
/** 实际等级：没选进化方向时停在选择等级 */
export function petLevel(data, c = petCfg()) {
  const raw = rawPetLevel(data?.xp, c)
  return data?.branch ? raw : Math.min(raw, branchLevel(c))
}
/** 阶段 1~5；没选方向时最多三阶 */
export function petStage(data, c = petCfg()) {
  const lv = petLevel(data, c)
  const byLevel = c.stageLevels.filter(l => lv >= l).length
  return Math.max(1, Math.min(byLevel, data?.branch ? 5 : 3))
}
/** 是否等待选择进化方向 */
export const needsBranch = (data, c = petCfg()) => !data?.branch && rawPetLevel(data?.xp, c) >= branchLevel(c)

export const branchDef = (def, branchId) => def?.branches?.find(b => b.id === branchId) || null

/** 某一阶的形态（四、五阶取所选方向） */
export function formAt(def, stage, branchId) {
  if (!def) return null
  if (stage <= 3) return def.forms?.[stage - 1] || null
  return branchDef(def, branchId)?.forms?.[stage - 4] || null
}
export const currentForm = (def, data, c = petCfg()) => formAt(def, petStage(data, c), data?.branch)
/** 显示名：自定义名字，没有时用形态名 */
export const petName = (def, data, c = petCfg()) => data?.name || currentForm(def, data, c)?.name || def?.name || "宠物"

/* ---------------- 技能 ---------------- */

/** 已解锁的技能及当前数值：[{ stage, form, name, effect, value, base }] */
export function petSkills(def, data, c = petCfg(), stage = petStage(data, c)) {
  const out = []
  for (let k = 1; k <= stage; k++) {
    const form = formAt(def, k, data?.branch)
    const s = form?.skill
    if (!s?.effect) continue
    const value = Number((Number(s.value) * (1 + c.skillGrowth / 100 * (stage - k))).toFixed(3))
    out.push({ stage: k, form: form.name, name: s.name, effect: s.effect, base: Number(s.value), value })
  }
  return out
}

const SKILL_TEXT = {
  doublePrice: v => `${v}% 概率鱼价翻倍`,
  triplePrice: v => `${v}% 概率鱼价 ×3`,
  extraFish: v => `${v}% 概率多钓一条`,
  extraFish2: v => `${v}% 概率多钓两条`,
  rarityUp: v => `${v}% 概率鱼的品级 +1`,
  baitSave: v => `${v}% 概率不消耗鱼饵`,
  sellBonus: v => `出售金币 +${v}%`,
}
const fmt = v => Number(Number(v).toFixed(2))
export const skillText = (effect, value) => (SKILL_TEXT[effect] || (v => `${effect} ${v}`))(fmt(value))

/* ---------------- 饱食度 ---------------- */

/** 每小时消耗的饱食度：出战 / 休息的基础消耗 × 当前阶段的消耗比例（阶段越低消耗越少） */
export function satRate(data, active, c = petCfg()) {
  const base = active ? c.satiety.active : c.satiety.rest
  return base * (c.satiety.stageRate[petStage(data, c) - 1] ?? 100) / 100
}
/** 每天消耗多少饱食度（展示用） */
export const satPerDay = (data, active, c = petCfg()) => Number((satRate(data, active, c) * 24).toFixed(2))

/**
 * 按经过的时间扣饱食度（出战 / 休息消耗不同）；降到 0 的宠物离家出走，移入 lost
 * 改变出战宠物前要先调用，保证之前的时间按原来的状态结算
 * @returns 本次离家出走的宠物 id
 */
export function refreshPets(user, now = Date.now(), c = petCfg()) {
  const p = ensurePets(user)
  const gone = []
  for (const [id, d] of Object.entries(p.owned)) {
    const t = Number(d.t) || now
    const rate = satRate(d, id === p.active, c)
    const sat = Math.min(c.satiety.max, n0(d.sat))
    const left = sat - Math.max(0, now - t) / HOUR * rate
    if (rate > 0 && left <= 0) {
      const lostAt = Math.round(t + sat / rate * HOUR)
      p.lost[id] = { ...d, sat: 0, t: lostAt, lostAt, notified: false }
      delete p.owned[id]
      if (p.active === id) p.active = null
      gone.push(id)
    } else {
      d.sat = Number(left.toFixed(3))
      d.t = now
    }
  }
  return gone
}

export const isHungry = (data, c = petCfg()) => n0(data?.sat) <= c.satiety.hungry
export const satText = (data, c = petCfg()) => `${Math.ceil(n0(data?.sat))}/${c.satiety.max}`
/** 饱食度还能撑多少小时（降到饥饿 / 降到 0） */
export function satHours(user, id, c = petCfg()) {
  const d = user.pets?.owned?.[id]
  const rate = d ? satRate(d, id === user.pets?.active, c) : 0
  if (!d || !rate) return { hungry: Infinity, gone: Infinity }
  return { hungry: Math.max(0, (n0(d.sat) - c.satiety.hungry) / rate), gone: n0(d.sat) / rate }
}

/* ---------------- 效果 ---------------- */

/** 出战宠物的效果；饥饿时全部失效 */
export function petEffects(user, now = Date.now(), c = petCfg(), defs = petDefs()) {
  if (!user?.pets) return {}
  refreshPets(user, now, c)
  const id = user.pets.active
  const data = id && user.pets.owned[id]
  if (!data || isHungry(data, c)) return {}
  const out = {}
  for (const s of petSkills(petDef(id, defs), data, c)) out[s.effect] = (out[s.effect] || 0) + s.value
  return out
}

/** 某个效果来自出战宠物的哪个技能（结果提示用） */
export function skillFor(user, effect, c = petCfg(), defs = petDefs()) {
  const id = user?.pets?.active
  const data = id && user.pets.owned[id]
  if (!data) return null
  const def = petDef(id, defs)
  const s = petSkills(def, data, c).filter(x => x.effect === effect).at(-1)
  return s ? { ...s, pet: petName(def, data, c), emoji: currentForm(def, data, c)?.emoji || "🐾" } : null
}

/* ---------------- 操作 ---------------- */

export const markSeen = (user, form) => {
  const p = ensurePets(user)
  if (form?.id && !p.seen.includes(form.id)) p.seen.push(form.id)
}

/** 按宠物种类名 / 形态名 / 自定义名 / id 查找自己的宠物 */
export function findOwnedPet(user, keyword, c = petCfg(), defs = petDefs(), pool = ensurePets(user).owned) {
  keyword = String(keyword || "").trim()
  if (!keyword) return null
  for (const [id, data] of Object.entries(pool)) {
    const def = petDef(id, defs)
    const names = [id, def?.name, data.name, currentForm(def, data, c)?.name, ...(def?.forms || []).map(f => f.name)]
    if (names.filter(Boolean).includes(keyword)) return id
  }
  return null
}

/** 按种类名 / 一阶形态名 / id 查找宠物定义（购买用） */
export function findPetDef(keyword, defs = petDefs()) {
  keyword = String(keyword || "").trim()
  return defs.find(d => d.id === keyword || d.name === keyword || d.forms?.[0]?.name === keyword || d.title === keyword) || null
}

export function buyPet(user, defId, now = Date.now(), c = petCfg(), defs = petDefs()) {
  const def = petDef(defId, defs)
  if (!def) return { ok: false, reason: "unknown" }
  const p = ensurePets(user)
  refreshPets(user, now, c)
  const level = characterProgress(user).level
  if (level < c.unlockLevel) return { ok: false, reason: "level", need: c.unlockLevel, level }
  if (p.owned[def.id]) return { ok: false, reason: "owned" }
  if (user.gold < c.price) return { ok: false, reason: "gold", cost: c.price }
  user.gold -= c.price
  p.owned[def.id] = { xp: 0, branch: null, name: null, sat: c.satiety.max, t: now, at: now }
  // 买了新的，之前离家出走的同种宠物就不能再寻回了
  const replaced = !!p.lost[def.id]
  delete p.lost[def.id]
  const first = !p.active
  if (first) p.active = def.id
  markSeen(user, def.forms?.[0])
  user.stats ||= {}
  user.stats.petSpent = (user.stats.petSpent || 0) + c.price
  return { ok: true, def, cost: c.price, active: first, replaced }
}

/** 更换出战宠物：每天 switchPerDay 次；当前没有出战宠物时不计次数 */
export function setActivePet(user, id, now = Date.now(), c = petCfg()) {
  const p = ensurePets(user)
  refreshPets(user, now, c)
  if (!p.owned[id]) return { ok: false, reason: "not_owned" }
  if (p.active === id) return { ok: false, reason: "already" }
  const day = periodKey("day", new Date(now))
  const used = p.switchDay === day ? n0(p.switchCount) : 0
  const free = !p.active
  if (!free && used >= c.switchPerDay) return { ok: false, reason: "limit", max: c.switchPerDay }
  p.active = id
  if (!free) { p.switchDay = day; p.switchCount = used + 1 }
  return { ok: true, free, left: free ? c.switchPerDay - used : c.switchPerDay - used - 1 }
}

/** 喂食：每份 +food.value，最多喂到上限，多出来的份数不扣费 */
export function feedPet(user, id, count, now = Date.now(), c = petCfg()) {
  const p = ensurePets(user)
  refreshPets(user, now, c)
  const d = p.owned[id]
  if (!d) return { ok: false, reason: "not_owned" }
  const room = c.satiety.max - n0(d.sat)
  const need = Math.ceil(room / c.food.value - 1e-9)
  if (need <= 0) return { ok: false, reason: "full" }
  const want = Math.max(1, Math.floor(Number(count) || 1))
  const units = Math.min(want, need)
  const cost = units * c.food.price
  if (user.gold < cost) {
    const afford = c.food.price ? Math.floor(user.gold / c.food.price) : units
    return { ok: false, reason: "gold", cost, afford }
  }
  user.gold -= cost
  d.sat = Math.min(c.satiety.max, n0(d.sat) + units * c.food.value)
  user.stats ||= {}
  user.stats.petSpent = (user.stats.petSpent || 0) + cost
  return { ok: true, units, cost, sat: d.sat, capped: units < want }
}

/** 选择进化方向（不能更改） */
export function evolvePet(user, id, branchKeyword, now = Date.now(), c = petCfg(), defs = petDefs()) {
  const p = ensurePets(user)
  refreshPets(user, now, c)
  const d = p.owned[id]
  if (!d) return { ok: false, reason: "not_owned" }
  const def = petDef(id, defs)
  if (d.branch) return { ok: false, reason: "chosen", branch: branchDef(def, d.branch) }
  if (!needsBranch(d, c)) return { ok: false, reason: "level", need: branchLevel(c), level: petLevel(d, c) }
  const kw = String(branchKeyword || "").trim()
  const b = (def.branches || []).find(x => x.id === kw || x.name === kw || x.forms?.some(f => f.name === kw))
  if (!b) return { ok: false, reason: "unknown", branches: def.branches || [] }
  const before = petLevel(d, c)
  d.branch = b.id
  const after = petLevel(d, c)
  const stage = petStage(d, c)
  for (let k = 4; k <= stage; k++) markSeen(user, formAt(def, k, b.id))
  return { ok: true, branch: b, before, after, stage, form: currentForm(def, d, c) }
}

export function renamePet(user, id, name, c = petCfg()) {
  const d = ensurePets(user).owned[id]
  if (!d) return { ok: false, reason: "not_owned" }
  name = String(name || "").replace(/[\s#@<>[\]{}]/g, "").slice(0, 8)
  if (!name) return { ok: false, reason: "empty" }
  d.name = name
  return { ok: true, name }
}

/** 寻回离家出走的宠物：recall.days 天内，花 recall.price；回来时饱食度回满 */
export function recallPet(user, id, now = Date.now(), c = petCfg()) {
  const p = ensurePets(user)
  refreshPets(user, now, c)
  const lost = p.lost[id]
  if (!lost) return { ok: false, reason: "not_lost" }
  if (now - n0(lost.lostAt) > c.recall.days * 24 * HOUR) {
    delete p.lost[id]
    return { ok: false, reason: "expired" }
  }
  if (p.owned[id]) return { ok: false, reason: "owned" }
  if (user.gold < c.recall.price) return { ok: false, reason: "gold", cost: c.recall.price }
  user.gold -= c.recall.price
  const { lostAt, notified, ...data } = lost
  p.owned[id] = { ...data, sat: c.satiety.max, t: now }
  delete p.lost[id]
  if (!p.active) p.active = id
  user.stats ||= {}
  user.stats.petSpent = (user.stats.petSpent || 0) + c.recall.price
  return { ok: true, cost: c.recall.price }
}

/** 还能寻回的离家出走宠物（过期的顺手清掉） */
export function lostPets(user, now = Date.now(), c = petCfg()) {
  const p = ensurePets(user)
  const out = []
  for (const [id, d] of Object.entries(p.lost)) {
    const left = n0(d.lostAt) + c.recall.days * 24 * HOUR - now
    if (left <= 0) { delete p.lost[id]; continue }
    out.push({ id, data: d, left })
  }
  return out
}

/* ---------------- 经验 ---------------- */

/**
 * 出战宠物获得经验（与角色同时获得的经验相同）
 * - 满级后不再获得；没选进化方向时经验照常累积，等级停在选择等级
 * @returns null（没有出战宠物 / 已满级）或 { id, gain, before, after, evolved: [form], branchReady }
 */
export function addPetXp(user, gain, now = Date.now(), c = petCfg(), defs = petDefs()) {
  if (!user?.pets) return null
  refreshPets(user, now, c)
  const id = user.pets.active
  const d = id && user.pets.owned[id]
  gain = Math.floor(n0(gain))
  if (!d || !gain) return null
  const cap = petThreshold(c.maxLevel, c)
  if (n0(d.xp) >= cap) return null
  const def = petDef(id, defs)
  const before = petLevel(d, c), stageBefore = petStage(d, c), waiting = needsBranch(d, c)
  const add = Math.min(gain, cap - n0(d.xp))
  d.xp = n0(d.xp) + add
  const after = petLevel(d, c), stageAfter = petStage(d, c)
  const evolved = []
  for (let k = stageBefore + 1; k <= stageAfter; k++) { const f = formAt(def, k, d.branch); if (f) { evolved.push(f); markSeen(user, f) } }
  return { id, def, data: d, gain: add, before, after, evolved, branchReady: !waiting && needsBranch(d, c), max: after >= c.maxLevel }
}

/** 宠物经验一行（满级时不显示）+ 升级 / 进化 / 待选方向 */
export function petGainLines(r, c = petCfg()) {
  if (!r) return []
  const { def, data } = r
  const form = currentForm(def, data, c)
  const name = petName(def, data, c)
  const emoji = form?.emoji || "🐾"
  const choose = (def.branches || []).map(b => `#宠物进化 ${b.name}`).join(" / ")
  // 已经在等待选择方向：只提醒一行（经验照常累积）
  if (needsBranch(data, c) && !r.branchReady)
    return [`${emoji} ${name} 经验 +${r.gain}（Lv${r.after} · 等待选择进化方向，经验已够 Lv${rawPetLevel(data.xp, c)}）· ${choose}`]
  const lines = []
  const next = r.max ? "已满级" : needsBranch(data, c)
    ? "等待选择进化方向"
    : `距离 Lv${r.after + 1} 还需 ${(petThreshold(r.after + 1, c) - data.xp).toLocaleString("en-US")}`
  lines.push(`${emoji} ${name} 经验 +${r.gain}（Lv${r.after} · ${next}）`)
  if (r.after > r.before) lines.push(`🎉 宠物升级：Lv${r.before} → Lv${r.after}${r.max ? " 🏆 已满级" : ""}`)
  let prev = formAt(def, petStage(data, c) - r.evolved.length, data.branch)
  for (const f of r.evolved) {
    lines.push(`✨ ${prev?.name || name} 进化成了 ${f.emoji} ${f.name}！解锁技能「${f.skill?.name}」：${skillText(f.skill?.effect, f.skill?.value)}`)
    prev = f
  }
  if (r.branchReady) lines.push(`🔀 ${name} 达到 Lv${branchLevel(c)}，可以选择进化方向了：${choose}（选择前经验继续累积，等级暂停）`)
  return lines
}

/** 饥饿 / 离家出走提醒（钓鱼结果、我的宠物等处显示；离家出走只提醒一次） */
export function petNotices(user, now = Date.now(), c = petCfg(), defs = petDefs()) {
  if (!user?.pets) return []
  refreshPets(user, now, c)
  const out = []
  for (const [id, d] of Object.entries(user.pets.lost)) {
    if (d.notified) continue
    d.notified = true
    const def = petDef(id, defs)
    out.push(`😢 ${petName(def, d, c)} 饿着肚子离家出走了……${c.recall.days} 天内可以花 ${c.recall.price.toLocaleString("en-US")} 金币 #寻回宠物 ${def?.name || id}`)
  }
  const id = user.pets.active
  const d = id && user.pets.owned[id]
  if (d) {
    const name = petName(petDef(id, defs), d, c)
    if (isHungry(d, c)) out.push(`🍖 ${name} 饿了（饱食度 ${satText(d, c)}），技能暂时失效，快 #喂食宠物`)
    else if (n0(d.sat) < c.satiety.warn) out.push(`🍖 ${name} 有点饿了（饱食度 ${satText(d, c)}），记得 #喂食宠物`)
  }
  return out
}
