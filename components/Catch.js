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
