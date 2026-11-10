import { plugin, puppeteer } from "../components/yunzai.js"
import Config from "../components/Config.js"
import UserData from "../components/UserData.js"
import { periodStat } from "../components/Game.js"
import { PERIODS } from "../components/Period.js"
import { withButtons, B } from "../components/Button.js"
import { ownedTitles } from "../components/Titles.js"
import { renderOrText } from "../components/Render.js"
import { groupAllowed, displayName, avatar, updateNickname } from "../components/common.js"

const TYPE = { "今日": "day", "日": "day", "周": "week", "月": "month" }
const MEDAL = ["🥇", "🥈", "🥉"]

export class FishingRank extends plugin {
  constructor() {
    super({
      name: "钓鱼-排行榜",
      dsc: "本群日/周/月排行与全服总榜",
      event: "message",
      priority: 500,
      rule: [
        { reg: /^#?钓鱼(今日|日|周|月)?排行榜?$/, fnc: "groupRank" },
        { reg: /^#?钓鱼总(日|周|月)?(排行)?榜$/, fnc: "totalRank" },
      ],
    })
  }

  async groupRank(e) {
    if (!groupAllowed(e)) return false
    if (!e.isGroup) return e.reply(withButtons(e, "🏆 群排行榜请在群里查看哦~ 私聊可以发送 #钓鱼总榜", [B.totalRank]))
    const type = TYPE[e.msg.match(/钓鱼(今日|日|周|月)?/)[1]] || "day"
    const gid = String(e.group_id)
    const users = UserData.all().filter(u => u.groups?.includes(gid))
    const size = Number(Config.config.rank?.groupSize) || 10
    return this.reply(e, users, type, size, `本群${PERIODS[type].label}钓鱼排行榜`)
  }

  async totalRank(e) {
    if (!groupAllowed(e)) return false
    const t = e.msg.match(/钓鱼总(日|周|月)?/)[1]
    const type = t ? TYPE[t] : "all"
    const size = Number(Config.config.rank?.totalSize) || 30
    const title = type === "all" ? "钓鱼总榜（累计）" : `钓鱼总榜（${PERIODS[type].label}）`
    return this.reply(e, UserData.all(), type, size, title)
  }

  async reply(e, users, type, size, title) {
    const me = UserData.get(e.user_id)
    updateNickname(me, e)
    // 称号徽章：每个称号的 emoji，Ⅲ 级加 ✦
    const rows = users
      .map(u => {
        const stat = type === "all" ? { value: u.stats.earned, count: u.stats.catches + u.stats.junk + u.stats.police } : periodStat(u, type)
        return { u, value: stat.value || 0, count: stat.count || 0 }
      })
      .filter(r => r.count > 0)
      .sort((a, b) => b.value - a.value || b.count - a.count)
      .map((r, i) => ({
        rank: i + 1,
        medal: MEDAL[i] || "",
        id: r.u.user_id,
        name: displayName(r.u),
        avatar: avatar(r.u.user_id),
        badges: ownedTitles(r.u, Config.titles, Config.items).map(({ title, tier }) => title.emoji + (tier >= 3 ? "✦" : "")).join(""),
        value: r.value,
        count: r.count,
        isMe: String(r.u.user_id) === String(e.user_id),
      }))

    const buttons = [[B.dayRank, B.weekRank, B.monthRank], [B.totalRank, B.start]]
    if (!rows.length) return e.reply(withButtons(e, `🏆 ${title}\n还没有人上榜，快来当第一名吧！`, ...buttons))

    const list = rows.slice(0, size)
    const mine = rows.find(r => r.isMe)
    const msg = await renderOrText(puppeteer, "rank", {
      title, list, mine: mine && mine.rank > size ? mine : null, total: rows.length,
    }, () => [
      `🏆 ${title}`,
      "━━━━━━━━━━━━",
      ...list.map(r => `${r.medal || `${r.rank}.`} ${r.name}${r.badges} ${r.value} 金币（${r.count} 次）`),
      "━━━━━━━━━━━━",
      mine ? `📍 你的排名：第 ${mine.rank} 名，${mine.value} 金币` : "📍 你还没有上榜，快去钓鱼吧！",
    ].join("\n"))
    if (!msg) return true
    return e.reply(withButtons(e, msg, ...buttons))
  }
}
