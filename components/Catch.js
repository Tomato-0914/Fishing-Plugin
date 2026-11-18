/** 一竿的结算：抽取结果 → 断线判定 → 记入存档（纯函数，#收杆 与十连钓鱼共用） */
import { roll, rollOfRarity, rollFish, NEXT_RARITY, FISH_TIERS, autoSellable } from "./ItemPool.js"
import { recordResult } from "./Game.js"
import { breakChance } from "./Gear.js"

/**
 * @param ctx.items 物品池  ctx.cfg config.yaml  ctx.shop shop.yaml  ctx.effects 本竿全部效果
 * @param ctx.group 本群今日保护鱼类计数 { max, count(), add() }；达到 max 后本群今天不会再钓到保护鱼类
 * @returns {{ result, snapped:boolean, chance:number, reward:number, value:number }}
 *   snapped 为 true 时鱼已断线跑掉，不入鱼护、不计价值
 */
export function resolveCast(user, { items, cfg, shop, effects = {}, rng = Math.random, now = new Date(), group = null }) {
  // 禁渔中（连钓途中钓到保护鱼类、被警察带走）后面的竿不再结算
  if (Number(user.banUntil) > now.getTime()) return { result: { type: "banned" }, snapped: false, chance: 0, reward: 0, value: 0, banned: true }
  // 每个群每天最多钓到 groupDailyMax 条保护鱼类：达到后本群今天不会再出现（概率归还给其他结果）
  if (group?.max && group.count() >= group.max) effects = { ...effects, protectedScale: 0 }
  const ctx = { items, probability: cfg.probability, size: cfg.size, limits: cfg.limits }
  let result = roll(ctx, effects, rng)
  // 宠物技能：品级 +1、鱼价 ×3 / ×2（只对鱼生效；没有对应效果时不额外消耗随机数）
  const pet = {}
  if (result.type === "item" && FISH.has(result.rarity)) {
    const up = Number(effects.rarityUp) || 0
    if (up > 0 && result.rarity !== "MR" && rng() * 100 < up) {
      const better = rollOfRarity(ctx, NEXT_RARITY[result.rarity], effects, rng)
      if (better) { pet.up = result.rarity; result = better }
    }
    const x3 = Number(effects.triplePrice) || 0, x2 = Number(effects.doublePrice) || 0
    const mult = x3 > 0 && rng() * 100 < x3 ? 3 : x2 > 0 && rng() * 100 < x2 ? 2 : 1
    if (mult > 1) pet.mult = mult
    applyPriceMult(result, mult * priceBonusMult(effects))
  }
  const chance = breakChance(result, shop?.lineBreak, effects)
  if (chance > 0 && rng() * 100 < chance) {
    user.stats.escaped++
    user.stats.lineBreak = (user.stats.lineBreak || 0) + 1
    return { result, snapped: true, chance, reward: 0, value: 0, pet }
  }
  const opts = { policeReward: cfg.policeReward, protectedPenalty: cfg.protectedPenalty, paimonGift: cfg.paimonGift, now, size: cfg.size }
  const { reward, value, penalty, paimon } = recordResult(user, result, opts)
  if (penalty && group) Object.assign(penalty, { group: group.add(), groupMax: group.max || 0 })
  // 宠物技能：钓到鱼时有概率多钓一条 / 两条（同样按当前品级分布，直接入鱼护，不会断线）
  const extras = []
  if (result.type === "item" && FISH.has(result.rarity)) {
    const two = Number(effects.extraFish2) || 0, one = Number(effects.extraFish) || 0
    const n = two > 0 && rng() * 100 < two ? 2 : one > 0 && rng() * 100 < one ? 1 : 0
    for (let i = 0; i < n; i++) {
      const r = rollFish(ctx, effects, rng)
      if (!r) continue
      applyPriceMult(r, priceBonusMult(effects))
      const rec = recordResult(user, r, opts)
      extras.push({ result: r, snapped: false, chance: 0, reward: 0, value: rec.value, extra: true })
    }
  }
  return { result, snapped: false, chance, reward, value, penalty, paimon, pet, extras }
}

const FISH = new Set(FISH_TIERS)

/** 鱼饵的“鱼价 +%” */
const priceBonusMult = effects => 1 + Math.max(0, Number(effects.priceBonus) || 0) / 100

/** 把售价倍率写进结果；倍率会随鱼获存进鱼护（entry.m），重新定价时保留 */
function applyPriceMult(result, m) {
  if (!(m > 0) || m === 1) return
  result.price = Math.max(1, Math.round(result.price * m))
  result.mult = Number(m.toFixed(4))
}

/** 把多钓到的鱼展开成独立的一竿，方便汇总 */
export const withExtras = rounds => rounds.flatMap(r => [r, ...(r.extras || [])])

/** 一次连钓里宠物技能触发的汇总：🐾 宠物技能：多钓 3 条 · 鱼价翻倍 2 次 … */
export function petProcLine(rounds, baitSaved = 0) {
  let extra = 0, up = 0, x2 = 0, x3 = 0
  for (const r of rounds) {
    if (r.extra) extra++
    if (r.snapped) continue
    if (r.pet?.up) up++
    if (r.pet?.mult === 2) x2++
    if (r.pet?.mult === 3) x3++
  }
  const parts = [
    extra ? `多钓 ${extra} 条` : "", up ? `品级提升 ${up} 次` : "",
    x3 ? `鱼价 ×3 ${x3} 次` : "", x2 ? `鱼价翻倍 ${x2} 次` : "", baitSaved ? `省下鱼饵 ${baitSaved} 个` : "",
  ].filter(Boolean)
  return parts.length ? `🐾 宠物技能：${parts.join(" · ")}` : ""
}

/** “售出预计获得金币”：按出售时的加成（称号 + 渔具 + 宠物）估算，与实际出售一致 */
export function saleLine(value, sellBonus = 0, markdown = false) {
  const b = Math.max(0, Number(sellBonus) || 0)
  const gold = Math.round(value * (1 + b / 100))
  const text = `售出预计获得金币：${gold}`
  return (markdown ? `💰 **${text}**` : `💰 ${text}`) + (b ? `（含出售加成 +${Number(b.toFixed(2))}%）` : "")
}

/** 十连汇总 */
export function summarize(rounds) {
  // value：本次鱼获总价值（含报警奖励）；sale：一键出售能卖到的部分（报警奖励当场已发、海洋之心要手动卖，都不算）
  const s = { fish: 0, junk: 0, empty: 0, snapped: 0, banned: 0, protected: 0, value: 0, sale: 0, best: null }
  for (const r of rounds) {
    if (r.banned) { s.banned++; continue }
    if (r.snapped) { s.snapped++; continue }
    if (r.result.type === "empty") { s.empty++; continue }
    if (r.result.item.special === "protected") { s.protected++; continue }
    if (r.result.rarity === "junk") s.junk++
    else s.fish++
    s.value += r.value
    if (!r.result.item.special && autoSellable(r.result.item)) s.sale += r.value
    if (r.result.rarity !== "junk" && (!s.best || r.value > s.best.value)) s.best = r
  }
  return s
}

const RARITY_DOT = { N: "⚪", R: "🟢", SR: "🔵", SSR: "🟣", UR: "🟡", EP: "🟠", MR: "🔴", hidden: "🌈", protected: "🚫" }
const TIER_RANK = { hidden: 9, MR: 8, EP: 7, UR: 6, SSR: 5, SR: 4, R: 3, N: 2 }
const FLASH = new Set(["UR", "EP", "MR", "hidden"])

/** 误钓保护鱼类的处罚摘要：被警察带走 · 禁渔 60 分钟 · 罚款 500 · 本群今日 2/5 条 */
export function protectedPenaltyText(p = {}) {
  return [
    `被警察带走 · 禁渔 ${p.minutes ?? 0} 分钟`,
    p.fine ? `罚款 ${p.fine}` : "",
    p.group ? `本群今日 ${p.group}${p.groupMax ? `/${p.groupMax}` : ""} 条` : "",
  ].filter(Boolean).join(" · ")
}

/** 一竿的短格式：🟡🐠 石斑鱼王·中 341 */
export function roundLine(r, sizeLabels = {}) {
  if (r.banned) return "🚔 被警察带走了，未钓"
  if (r.result.type === "empty") return "🌊 空军"
  const { item, size } = r.result
  const name = `${item.name}${size && sizeLabels[size] ? `·${sizeLabels[size]}` : ""}`
  const dot = RARITY_DOT[item.rarity] || ""
  if (r.snapped) return `💥 ${dot}${item.emoji} ${name} 断线跑了`
  if (item.special === "police") return `🚨 ${item.emoji} ${item.name} 已报警 +${r.reward}`
  if (item.special === "protected") return `🚫 ${item.emoji} ${item.name}（保护鱼类）已放生 · 🚔 ${protectedPenaltyText(r.penalty)}`
  if (item.special === "paimon") return `🧚 ${item.name}：才不是应急食品！${r.paimon?.gift ? ` +${r.paimon.gift}` : ""}`
  if (item.rarity === "junk") return `🗑️ ${item.emoji} ${item.name}`
  const tag = `${r.pet?.up ? " ⬆️" : ""}${r.pet?.mult ? ` 💰×${r.pet.mult}` : ""}${r.extra ? " 🐾" : ""}`
  return `${dot}${item.emoji} ${name} ${r.value}${FLASH.has(item.rarity) ? " ✨" : ""}${tag}`
}

/**
 * 十连结果文字（简洁版）
 * - 稀有及以上、特殊事件逐条列出，同一种鱼合并为 “×N”
 * - 普通、高级只给数量和总价；垃圾、空军、断线只给数量
 * @param markdown true 时（QQBot）使用 Markdown 加粗标题与分区；否则为纯文本
 */
export function formatMulti(rounds, { sizeLabels = {}, markdown = false, xpLine = "", sellBonus = 0 } = {}) {
  const sum = summarize(rounds)
  const special = [], notable = new Map(), low = { N: [0, 0], R: [0, 0] }
  for (const r of rounds) {
    if (r.banned || r.result.type === "empty") continue
    const { item } = r.result
    if (r.snapped || item.special) { special.push(r); continue }
    if (item.rarity === "junk") continue
    if (low[item.rarity]) { low[item.rarity][0]++; low[item.rarity][1] += r.value; continue }
    const g = notable.get(item.id) || { r, count: 0, value: 0 }
    g.count++; g.value += r.value
    notable.set(item.id, g)
  }
  const lines = []
  // 特殊事件在最前：保护鱼类 → 报警 → 派蒙 → 断线
  const order = r => r.snapped ? 3 : r.result.item.special === "protected" ? 0 : r.result.item.special === "police" ? 1 : 2
  for (const r of special.sort((a, b) => order(a) - order(b))) lines.push(roundLine(r, sizeLabels))
  // 高级鱼：稀有度高的在前，同稀有度按总价
  const groups = [...notable.values()].sort((a, b) =>
    (TIER_RANK[b.r.result.rarity] || 0) - (TIER_RANK[a.r.result.rarity] || 0) || b.value - a.value)
  for (const g of groups) {
    if (g.count === 1) { lines.push(roundLine(g.r, sizeLabels)); continue }
    const { item } = g.r.result
    lines.push(`${RARITY_DOT[item.rarity] || ""}${item.emoji} ${item.name} ×${g.count} ${g.value}${FLASH.has(item.rarity) ? " ✨" : ""}`)
  }
  const lowParts = [["N", "⚪ 普通"], ["R", "🟢 高级"]].filter(([k]) => low[k][0]).map(([k, label]) => `${label} ×${low[k][0]}`)
  const lowValue = low.N[1] + low.R[1]
  if (lowParts.length) lines.push("📦 其他鱼获", ...lowParts, `合计 ${lowValue} 金币`)

  // 保持两种协议相同的实际换行；QQBot 仅添加轻量 Markdown 样式。
  const head = [
    markdown ? "**🎣 十连收网**" : "🎣 十连收网",
    ...(xpLine ? [xpLine] : []),
    saleLine(sum.sale, sellBonus, markdown),
    `🐟 鱼获 ${sum.fish}｜垃圾 ${sum.junk}｜空军 ${sum.empty}`,
  ]
  const tail = [
    sum.snapped ? `💥 断线 ${sum.snapped}` : "",
    sum.protected ? `🚫 保护鱼类 ${sum.protected}` : "",
    sum.banned ? `⛔ 禁渔作废 ${sum.banned}` : "",
    sum.snapped ? "💡 更高阶或强化过的鱼线可减少断线" : "",
  ].filter(Boolean)
  if (!lines.length) return [...head, ...tail].join("\n")
  const detail = lines[0]?.startsWith("📦") ? lines : [markdown ? "**✨ 稀有鱼获 / 特殊事件**" : "✨ 稀有鱼获 / 特殊事件", ...lines]
  if (markdown) {
    // 恢复最初 QQBot 的 Markdown 引用列表；只对明细添加 >，保留顶部统计的完整宽度。
    const quoted = detail.map(line => `> ${line}`)
    return [...head, "", ...quoted, "", ...tail].join("\n")
  }
  return [...head, "", ...detail, ...tail].join("\n")
}

const RARITY_LABEL = { MR: "神话", EP: "史诗", UR: "传说", SSR: "神器", SR: "稀有", R: "高级", N: "普通" }

/**
 * 百连结果文字：只给各品级数量；空军、垃圾、断线照常统计；
 * 特殊事件（报警、派蒙、保护鱼类、隐藏款）逐条列出
 */
export function formatHundred(rounds, { markdown = false, xpLine = "", title = "💯 百连收网", sellBonus = 0 } = {}) {
  const sum = summarize(rounds)
  const counts = {}, special = []
  for (const r of rounds) {
    if (r.banned || r.snapped || r.result.type === "empty") continue
    const { item } = r.result
    if (item.special || item.rarity === "hidden") { special.push(r); continue }
    if (RARITY_LABEL[item.rarity]) counts[item.rarity] = (counts[item.rarity] || 0) + 1
  }
  const order = r => r.result.item.special === "protected" ? 0 : r.result.item.special === "police" ? 1 : r.result.item.special === "paimon" ? 3 : 2
  const lines = [
    ...special.sort((a, b) => order(a) - order(b)).map(r => roundLine(r, {})),
    ...Object.keys(RARITY_LABEL).filter(k => counts[k]).map(k => `${RARITY_DOT[k]} ${RARITY_LABEL[k]} ×${counts[k]}${FLASH.has(k) ? " ✨" : ""}`),
  ]
  const head = [
    markdown ? `**${title}** · ${rounds.filter(r => !r.extra).length} 竿` : `${title} · ${rounds.filter(r => !r.extra).length} 竿`,
    ...(xpLine ? [xpLine] : []),
    saleLine(sum.sale, sellBonus, markdown),
    `🐟 鱼获 ${sum.fish}｜垃圾 ${sum.junk}｜空军 ${sum.empty}`,
  ]
  const tail = [
    sum.snapped ? `💥 断线 ${sum.snapped}` : "",
    sum.protected ? `🚫 保护鱼类 ${sum.protected}` : "",
    sum.banned ? `⛔ 禁渔作废 ${sum.banned} 竿（鱼饵不退）` : "",
  ].filter(Boolean)
  if (!lines.length) return [...head, ...tail].join("\n")
  const detail = markdown ? lines.map(l => `> ${l}`) : lines
  return [...head, "", ...detail, ...(tail.length ? ["", ...tail] : [])].join("\n")
}
