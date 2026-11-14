/** 每日打卡（玩法参考 Gi-plugin 每日打卡），幸运等级会轻微影响当天的钓鱼概率 */
import { plugin } from "../components/yunzai.js"
import Config from "../components/Config.js"
import UserData from "../components/UserData.js"
import { doCheckin, todayLuck, luckTier, randomLuck, addGroup, checkinReward } from "../components/Game.js"
import { effectText } from "../components/Titles.js"
import { periodKey } from "../components/Period.js"
import { withButtons, B } from "../components/Button.js"
import { groupAllowed, displayName, updateNickname } from "../components/common.js"
import { addBait, baitCount, baitLevel, canUseBait } from "../components/Gear.js"

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
        { reg: /^#?打卡$/, fnc: "checkin" },
        { reg: /^#?今日(欧皇|非酋)$/, fnc: "king" },
        { reg: /^#?幸运值排行$/, fnc: "rank" },
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
    // 打卡奖励按幸运值决定：每 10 点一档，等级越高送的鱼饵越好
    const reward = checkinReward(luck, Config.shop?.baits)
    if (reward) addBait(user, reward.bait.id, reward.count)

    const lines = [
      `📅 ${displayName(user)} 打卡成功！`,
      `🍀 今天的幸运值是…… ${luck}`,
      bar(luck),
      this.tierLine(luck),
      reward
        ? `🎁 打卡奖励：Lv${baitLevel(reward.bait)} ${reward.bait.emoji}${reward.bait.name} ×${reward.count}（当前 ${baitCount(user, reward.bait.id)}）` +
          (canUseBait(user, reward.bait) ? "" : `\n🔒 需要至少一件 Lv${baitLevel(reward.bait)} 渔具才能使用，先存着吧`)
        : "🎁 幸运值为 0，今天没有打卡奖励……",
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
    return e.reply(withButtons(e, lines.filter(Boolean).join("\n"), [B.start, B.multi, B.luckRank]))
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

  async rank(e) {
    if (!groupAllowed(e)) return false
    const unlucky = false
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
    return e.reply(withButtons(e, lines.join("\n"), [B.checkin]))
  }

}
