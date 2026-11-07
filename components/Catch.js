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
  const result = roll({ items, probability: cfg.probability, size: cfg.size, limits: cfg.limits }, effects, rng)
  const chance = breakChance(result, shop?.lineBreak, effects)
  if (chance > 0 && rng() * 100 < chance) {
    user.stats.escaped++
    user.stats.lineBreak = (user.stats.lineBreak || 0) + 1
    return { result, snapped: true, chance, reward: 0, value: 0 }
  }
  const { reward, value } = recordResult(user, result, { policeReward: cfg.policeReward, now })
  return { result, snapped: false, chance, reward, value }
}

/** 十连汇总 */
export function summarize(rounds) {
  const s = { fish: 0, junk: 0, empty: 0, snapped: 0, value: 0, best: null }
  for (const r of rounds) {
    if (r.snapped) { s.snapped++; continue }
    if (r.result.type === "empty") { s.empty++; continue }
    if (r.result.rarity === "junk") s.junk++
    else s.fish++
    s.value += r.value
    if (r.result.rarity !== "junk" && (!s.best || r.value > s.best.value)) s.best = r
  }
  return s
}

const RARITY_DOT = { N: "⚪", R: "🟢", SR: "🔵", SSR: "🟣", UR: "🟡", hidden: "🌈" }
/** 排序：警局奖励 → 按价值从高到低 → 断线 → 垃圾 → 空军 */
const sortKey = r => {
  if (r.snapped) return [2, 0]
  if (r.result.type === "empty") return [4, 0]
  if (r.result.rarity === "junk") return [3, 0]
  return [r.result.item.special === "police" ? 0 : 1, -r.value]
}

/** 一竿的短格式：🟡🐠 石斑鱼王·中 341 */
export function roundLine(r, sizeLabels = {}) {
  if (r.result.type === "empty") return "🌊 空军"
  const { item, size } = r.result
  const name = `${item.name}${size && sizeLabels[size] ? `·${sizeLabels[size]}` : ""}`
  const dot = RARITY_DOT[item.rarity] || ""
  if (r.snapped) return `💥 ${dot}${item.emoji} ${name} 断线跑了`
  if (item.special === "police") return `🚨 ${item.emoji} ${item.name} 已报警 +${r.reward}`
  if (item.rarity === "junk") return `🗑️ ${item.emoji} ${item.name}`
  return `${dot}${item.emoji} ${name} ${r.value}${["UR", "hidden"].includes(item.rarity) ? " ✨" : ""}`
}

/**
 * 十连结果文字
 * @param markdown true 时（QQBot）钓获放进 Markdown 引用块；否则为纯文本
 */
export function formatMulti(rounds, { sizeLabels = {}, markdown = false } = {}) {
  const sum = summarize(rounds)
  const sorted = [...rounds].sort((a, b) => {
    const [x1, x2] = sortKey(a), [y1, y2] = sortKey(b)
    return x1 - y1 || x2 - y2
  })
  const lines = sorted.map(r => roundLine(r, sizeLabels))
  const head = `🎣 十连收网 · ${rounds.length} 竿 · 💰 ${sum.value} 金币`
  const tail = [
    [`🐟 ${sum.fish}`, `🗑️ ${sum.junk}`, `🌊 ${sum.empty}`, sum.snapped ? `💥 ${sum.snapped}` : ""].filter(Boolean).join(" · "),
    sum.snapped ? "💡 #渔具工坊 升级鱼线可以减少断线" : "",
  ].filter(Boolean)
  if (markdown) {
    // 引用块后空一行，否则下面的汇总会被并进引用块
    return `${head}\n${lines.map(l => `> ${l}`).join("\n")}\n\n${tail.join("\n")}`
  }
  return [head, ...lines.map(l => `  ${l}`), ...tail].join("\n")
}
