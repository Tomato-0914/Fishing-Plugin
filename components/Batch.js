/** 连钓玩法（十连 / 百连 / 千连）的参数与次数，钓鱼指令和按钮共用；新增玩法只需在 BATCH 里加一项 */
import Config from "./Config.js"
import { multiLeft, useMulti, dailyLeft, useDaily, cooldownLeft } from "./Game.js"

/**
 * 每项：[config.yaml fishing 中的字段, 默认值]
 * protected：一次连钓（整次）碰到保护鱼类的概率（%），默认 0.35 与单钓一竿相同；每竿概率按竿数自动换算
 */
export const BATCH = {
  multi:    { label: "十连", emoji: "🔟", cmd: "#十连钓鱼", delay: [3, 8],  count: ["multiCount", 10],      daily: ["multiDaily", 100],   cooldown: ["multiCooldown", 30],      level: [null, 0],               protected: ["multiProtected", 0.35] },
  hundred:  { label: "百连", emoji: "💯", cmd: "#百连钓鱼", delay: [5, 10], count: ["hundredCount", 100],   daily: ["hundredDaily", 10],  cooldown: ["hundredCooldown", 60],    level: ["hundredLevel", 25],    protected: ["hundredProtected", 0.35] },
  thousand: { label: "千连", emoji: "🌊", cmd: "#千连钓鱼", delay: [8, 15], count: ["thousandCount", 1000], daily: ["thousandDaily", 3], cooldown: ["thousandCooldown", 3600], level: ["thousandLevel", 60], protected: ["thousandProtected", 0.35] },
}
/** 按钮优先级：千连 > 百连 > 十连 */
export const BATCH_ORDER = ["thousand", "hundred", "multi"]

/** 读取某个玩法的参数（config.yaml 的 fishing 中可覆盖） */
export function batchCfg(kind, fishing = Config.config.fishing || {}) {
  const def = BATCH[kind] || BATCH.multi
  const get = ([key, d]) => key && fishing[key] != null && fishing[key] !== "" ? Number(fishing[key]) : d
  const int = v => Math.max(0, Math.floor(Number(v) || 0))
  return {
    kind: BATCH[kind] ? kind : "multi", label: def.label, emoji: def.emoji, cmd: def.cmd, delay: def.delay,
    count: Math.max(1, int(get(def.count))), daily: int(get(def.daily)), cooldown: int(get(def.cooldown)),
    level: int(get(def.level)), protectedPull: Math.min(100, Math.max(0, Number(get(def.protected)) || 0)),
    get protectedRate() { return perCastRate(this.protectedPull, this.count) },
  }
}

/** 一次 n 竿里至少碰到一次的概率为 pull% 时，每竿的概率（%）：1 - (1 - pull)^(1/n) */
export function perCastRate(pull, n) {
  const p = Math.min(1, Math.max(0, Number(pull) / 100))
  return p >= 1 ? 100 : (1 - (1 - p) ** (1 / Math.max(1, n))) * 100
}

/** 今日剩余次数（十连包含旧版攒下的额外机会） */
export function batchRemaining(user, c) {
  if (c.kind === "multi") { const m = multiLeft(user, c.daily); return m.free + m.bonus }
  return dailyLeft(user, c.kind, c.daily)
}

/** 消耗一次，没有次数返回 false */
export const useBatch = (user, c) => c.kind === "multi" ? !!useMulti(user, c.daily) : useDaily(user, c.kind, c.daily)

/** “3 次”或“95 次（另有旧版额外机会 2 次）” */
export function batchLeftText(user, c) {
  if (c.kind !== "multi") return `${dailyLeft(user, c.kind, c.daily)} 次`
  const m = multiLeft(user, c.daily)
  return `${m.free} 次${m.bonus ? `（另有旧版额外机会 ${m.bonus} 次）` : ""}`
}

/**
 * 保护鱼类概率倍率：把该玩法设定的“每竿总概率”换算成 probability.protected 的倍率
 * @returns 倍率；配置里没有保护鱼类时为 1
 */
export function protectedScaleFor(c, probability = Config.config.probability) {
  const base = Object.values(probability?.protected || {}).reduce((a, v) => a + (Number(v) || 0), 0)
  return base > 0 ? c.protectedRate / base : 1
}

/** 是否可用（等级够、今天还有次数、剩余冷却小于 hideCd 秒） */
export function batchAvailable(user, c, level, hideCd = Infinity) {
  return level >= c.level && batchRemaining(user, c) > 0 && cooldownLeft(user, c.kind) < hideCd
}
