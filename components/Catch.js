/** 一竿的结算：抽取结果 → 断线判定 → 记入存档（纯函数，#收杆 与十连钓鱼共用） */
import { roll } from "./ItemPool.js"
import { recordResult } from "./Game.js"
import { breakChance } from "./Gear.js"

/**
 * @param ctx.items 物品池  ctx.cfg config.yaml  ctx.shop shop.yaml  ctx.effects 本竿全部效果
 * @returns {{ result, snapped:boolean, chance:number, reward:number, value:number }}
 *   snapped 为 true 时鱼已断线跑掉，不入鱼护、不计价值
 */
export function resolveCast(user, { items, cfg, shop, effects = {}, rng = Math.random, now = new Date() }) {
  // 禁渔中（十连途中钓到保护动物）后面的竿不再结算
  if (Number(user.banUntil) > now.getTime()) return { result: { type: "banned" }, snapped: false, chance: 0, reward: 0, value: 0, banned: true }
  const result = roll({ items, probability: cfg.probability, size: cfg.size, limits: cfg.limits }, effects, rng)
  const chance = breakChance(result, shop?.lineBreak, effects)
  if (chance > 0 && rng() * 100 < chance) {
    user.stats.escaped++
    user.stats.lineBreak = (user.stats.lineBreak || 0) + 1
    return { result, snapped: true, chance, reward: 0, value: 0 }
  }
  const { reward, value, penalty, paimon } = recordResult(user, result, {
    policeReward: cfg.policeReward, protectedPenalty: cfg.protectedPenalty, paimonGift: cfg.paimonGift, now,
  })
  return { result, snapped: false, chance, reward, value, penalty, paimon }
}

/** 十连汇总 */
export function summarize(rounds) {
  const s = { fish: 0, junk: 0, empty: 0, snapped: 0, banned: 0, protected: 0, value: 0, best: null }
  for (const r of rounds) {
    if (r.banned) { s.banned++; continue }
    if (r.snapped) { s.snapped++; continue }
    if (r.result.type === "empty") { s.empty++; continue }
    if (r.result.item.special === "protected") { s.protected++; continue }
    if (r.result.rarity === "junk") s.junk++
    else s.fish++
    s.value += r.value
    if (r.result.rarity !== "junk" && (!s.best || r.value > s.best.value)) s.best = r
  }
  return s
}

const RARITY_DOT = { N: "⚪", R: "🟢", SR: "🔵", SSR: "🟣", UR: "🟡", EP: "🟠", MR: "🔴", hidden: "🌈", protected: "🚫" }
const TIER_RANK = { hidden: 9, MR: 8, EP: 7, UR: 6, SSR: 5, SR: 4, R: 3, N: 2 }
const FLASH = new Set(["UR", "EP", "MR", "hidden"])

/** 一竿的短格式：🟡🐠 石斑鱼王·中 341 */
export function roundLine(r, sizeLabels = {}) {
  if (r.banned) return "🚫 禁渔中，未钓"
  if (r.result.type === "empty") return "🌊 空军"
  const { item, size } = r.result
  const name = `${item.name}${size && sizeLabels[size] ? `·${sizeLabels[size]}` : ""}`
  const dot = RARITY_DOT[item.rarity] || ""
  if (r.snapped) return `💥 ${dot}${item.emoji} ${name} 断线跑了`
  if (item.special === "police") return `🚨 ${item.emoji} ${item.name} 已报警 +${r.reward}`
  if (item.special === "protected") return `🚫 ${item.emoji} ${item.name}（保护动物）已放生 · 罚款 ${r.penalty?.fine ?? 0} · 禁渔 ${r.penalty?.minutes ?? 0} 分钟`
  if (item.special === "paimon") return `🧚 ${item.name}：才不是应急食品！${r.paimon?.gift ? ` +${r.paimon.gift}` : ""}`
  if (item.rarity === "junk") return `🗑️ ${item.emoji} ${item.name}`
  return `${dot}${item.emoji} ${name} ${r.value}${FLASH.has(item.rarity) ? " ✨" : ""}`
}

/**
 * 十连结果文字（简洁版）
 * - 稀有及以上、特殊事件逐条列出，同一种鱼合并为 “×N”
 * - 普通、高级只给数量和总价；垃圾、空军、断线只给数量
 * @param markdown true 时（QQBot）使用 Markdown 加粗标题与分区；否则为纯文本
 */
export function formatMulti(rounds, { sizeLabels = {}, markdown = false } = {}) {
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
  // 特殊事件在最前：保护动物 → 报警 → 派蒙 → 断线
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
    markdown ? `💰 **收获金币：${sum.value}**` : `💰 收获金币：${sum.value}`,
    `🐟 鱼获 ${sum.fish}｜垃圾 ${sum.junk}｜空军 ${sum.empty}`,
  ]
  const tail = [
    sum.snapped ? `💥 断线 ${sum.snapped}` : "",
    sum.protected ? `🚫 保护动物 ${sum.protected}` : "",
    sum.banned ? `⛔ 禁渔作废 ${sum.banned}` : "",
    sum.snapped ? "💡 升级鱼线可减少断线" : "",
  ].filter(Boolean)
  if (!lines.length) return [...head, ...tail].join("\n")
  const detail = lines[0]?.startsWith("📦") ? lines : [markdown ? "**✨ 稀有鱼获 / 特殊事件**" : "✨ 稀有鱼获 / 特殊事件", ...lines]
  if (markdown) {
    const formatted = detail.map(line => line === "📦 其他鱼获" ? "**📦 其他鱼获**" : line)
    return [...head, "", ...formatted, ...tail].join("\n")
  }
  return [...head, "", ...detail, ...tail].join("\n")
}
