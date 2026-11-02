/** 每日打卡（玩法参考 Gi-plugin 每日打卡），幸运等级会轻微影响当天的钓鱼概率 */
import { plugin } from "../components/yunzai.js"
import Config from "../components/Config.js"
import UserData from "../components/UserData.js"
import { doCheckin, todayLuck, luckTier, randomLuck, addGroup } from "../components/Game.js"
import { effectText } from "../components/Titles.js"
import { periodKey } from "../components/Period.js"
import { withButtons, B } from "../components/Button.js"
import { groupAllowed, displayName, updateNickname } from "../components/common.js"

/** 低幸运值待确认：user_id → { day, luck } */
const pending = new Map()

/** 幸运值进度条 */
const bar = luck => {
  const n = Math.round(luck / 10)
  return "🟩".repeat(n) + "⬜".repeat(10 - n)
}

export class FishingCheckin extends plugin {
  constructor() {
    super({
      name: "钓鱼-打卡",
      dsc: "每日打卡与幸运值",
      event: "message",
      priority: 500,
      rule: [
        { reg: /^#?(每日)?(打卡|签到)$/, fnc: "checkin" },
        { reg: /^#?今日(欧皇|非酋)$/, fnc: "king" },
        { reg: /^#?历史幸运值$/, fnc: "history" },
        { reg: /^#?幸运值?排行榜?(欧皇|非酋)?榜?$/, fnc: "rank" },
        { reg: /^#?让我看看你的卡/, fnc: "look" },
      ],
    })
  }

  get ccfg() {
    return Config.config.checkin || {}
  }

  tierLine(luck) {
    const t = luckTier(luck, this.ccfg.tiers)
    if (!t) return ""
    return `${t.emoji} 今日运势：${t.name}\n🎣 钓鱼影响：${effectText(t.effects)}`
  }

  async checkin(e) {
    if (!groupAllowed(e)) return false
    const id = String(e.user_id)
    const user = UserData.get(id)
    updateNickname(user, e)
    const today = periodKey("day")
    const cfg = this.ccfg

    const had = todayLuck(user)
    if (had != null)
      return e.reply(withButtons(e, `📅 你今天已经打过卡啦~\n🍀 今天的幸运值是 ${had}，可别再忘了哦\n${this.tierLine(had)}`, [B.start, B.luckRank]))

    // 低幸运值先劝退一次（参考 Gi-plugin），再发一遍才揭晓
    let luck
    const p = pending.get(id)
    if (p && p.day === today) {
      luck = p.luck
      pending.delete(id)
    } else {
      luck = randomLuck()
      const low = Number(cfg.confirmLow ?? 10)
      if (low > 0 && luck <= low) {
        pending.set(id, { day: today, luck })
        return e.reply(withButtons(e, "😰 你真的要看吗？先说好不许做出任何过激行为！（如砸电脑、摔手机或者禁言我）\n真的要看的话，再发一遍 #打卡 确认一下~", [B.checkin]))
      }
    }

    const ret = doCheckin(user, luck)
    addGroup(user, e.group_id)
    const reward = Math.max(0, Number(cfg.baitReward) || 0)
    user.bait += reward

    const lines = [
      `📅 ${displayName(user)} 打卡成功！`,
      `🍀 今天的幸运值是…… ${luck}`,
      bar(luck),
      this.tierLine(luck),
      reward ? `🪱 打卡奖励：鱼饵 ×${reward}（当前 ${user.bait}）` : "",
      `🔥 连续打卡 ${ret.streak} 天 · 累计 ${ret.total} 天`,
    ]
    // 今日欧皇 / 非酋：当天第一个达到阈值的人
    const others = UserData.all().filter(u => u !== user && todayLuck(u) != null)
    if (luck >= Number(cfg.luckyKing ?? 95) && !others.some(u => todayLuck(u) >= Number(cfg.luckyKing ?? 95)))
      lines.push(`👑 恭喜成为今天首个 ${cfg.luckyKing ?? 95} 幸运值以上的欧皇！`)
    else if (luck <= Number(cfg.unluckyKing ?? 5) && !others.some(u => todayLuck(u) <= Number(cfg.unluckyKing ?? 5)))
      lines.push(`🌚 恭喜成为今天首个 ${cfg.unluckyKing ?? 5} 幸运值以下的非酋……`)
    else if (luck <= 10) lines.push("💪 幸运值有点低，不过不要丧失对生活的希望哦~")

    UserData.save(id)
    return e.reply(withButtons(e, lines.filter(Boolean).join("\n"), [B.start, B.luckRank]))
  }

  async king(e) {
    if (!groupAllowed(e)) return false
    const lucky = e.msg.includes("欧皇")
    const cfg = this.ccfg
    const limit = Number(lucky ? cfg.luckyKing ?? 95 : cfg.unluckyKing ?? 5)
    const first = UserData.all()
      .filter(u => { const l = todayLuck(u); return l != null && (lucky ? l >= limit : l <= limit) })
      .sort((a, b) => a.checkin.time - b.checkin.time)[0]
    if (!first) return e.reply(withButtons(e, `今天的${lucky ? "欧皇" : "非酋"}还没诞生~`, [B.checkin]))
    return e.reply(lucky
      ? `👑 今天的首位欧皇是【${displayName(first)}】\nta 的幸运值有 ${first.checkin.luck} 那么多！`
      : `🌚 今天的首位非酋是【${displayName(first)}】\nta 的幸运值只有 ${first.checkin.luck}……`)
  }

  async history(e) {
    if (!groupAllowed(e)) return false
    const user = UserData.get(e.user_id)
    const h = user.checkin.history || []
    if (!h.length) return e.reply(withButtons(e, "你似乎还没有打过卡呢~", [B.checkin]))
    const avg = Math.round(h.reduce((s, x) => s + x.l, 0) / h.length)
    return e.reply([
      `📜 ${displayName(user)} 的历史幸运值（近 ${h.length} 次，平均 ${avg}）`,
      ...h.map(x => `${x.d}  ${String(x.l).padStart(3, " ")}  ${luckTier(x.l, this.ccfg.tiers)?.emoji || ""}`),
    ].join("\n"))
  }

  async rank(e) {
    if (!groupAllowed(e)) return false
    const unlucky = e.msg.includes("非酋")
    let users = UserData.all().filter(u => todayLuck(u) != null)
    if (e.isGroup) users = users.filter(u => u.groups?.includes(String(e.group_id)))
    if (!users.length) return e.reply(withButtons(e, "今天还没有人打卡呢~", [B.checkin]))
    users.sort((a, b) => unlucky ? a.checkin.luck - b.checkin.luck : b.checkin.luck - a.checkin.luck)
    const size = Number(Config.config.rank?.groupSize) || 10
    const myIdx = users.findIndex(u => String(u.user_id) === String(e.user_id))
    const lines = [`${unlucky ? "🌚 今日非酋榜" : "👑 今日欧皇榜"}${e.isGroup ? "（本群）" : ""}`, "━━━━━━━━━━━━"]
    users.slice(0, size).forEach((u, i) => {
      lines.push(`${["🥇", "🥈", "🥉"][i] || `${i + 1}.`} ${displayName(u)}  ${u.checkin.luck} ${luckTier(u.checkin.luck, this.ccfg.tiers)?.emoji || ""}`)
    })
    lines.push("━━━━━━━━━━━━", myIdx >= 0 ? `📍 你排第 ${myIdx + 1} 名，幸运值 ${users[myIdx].checkin.luck}` : "📍 你今天还没打卡")
    return e.reply(withButtons(e, lines.join("\n"),
      [{ text: "👑 欧皇榜", callback: "#幸运值排行榜" }, { text: "🌚 非酋榜", callback: "#幸运值排行榜非酋" }], [B.checkin]))
  }

  async look(e) {
    if (!groupAllowed(e)) return false
    const target = e.at || e.message?.find(m => m.type === "at")?.qq
    if (!target) return e.reply("要看谁的卡？请在指令后面 @ 一下 ta~")
    if (String(target) === String(e.user_id)) return e.reply("你为什么不直接用 #打卡 看自己的幸运值，而是要 @ 一遍自己？？？")
    const u = UserData.has(target) ? UserData.get(target) : null
    const luck = u && todayLuck(u)
    if (luck == null) return e.reply("ta 今天还没打卡~")
    return e.reply(`🔍 铛铛铛，ta 今天的幸运值是 ${luck}\n${this.tierLine(luck)}`)
  }
}
