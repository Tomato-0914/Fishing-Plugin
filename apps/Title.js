/** 称号：分级称号一览（图片） */
import { plugin, puppeteer } from "../components/yunzai.js"
import Config from "../components/Config.js"
import UserData from "../components/UserData.js"
import {
  effectText, progressText, ownedTier, titleName, tierEffects, titleDesc, statValue, tierNeed, checkTitles, getEffects, ROMAN,
} from "../components/Titles.js"
import { withButtons, B } from "../components/Button.js"
import { renderOrText } from "../components/Render.js"
import { groupAllowed, displayName, updateNickname } from "../components/common.js"

/** 等级颜色：Ⅰ 铜、Ⅱ 银、Ⅲ 金 */
const TIER_COLORS = ["#9aa5b1", "#c8803e", "#8fa3b8", "#f2a900"]

export class FishingTitle extends plugin {
  constructor() {
    super({
      name: "钓鱼-称号",
      dsc: "分级称号一览",
      event: "message",
      priority: 500,
      rule: [{ reg: /^#?我的称号$/, fnc: "titles" }],
    })
  }

  async titles(e) {
    if (!groupAllowed(e)) return false
    const user = UserData.get(e.user_id)
    updateNickname(user, e)
    const titles = Config.titles || []
    const items = Config.items || []
    // 先补发已达成但还没记录的称号
    if (checkTitles(user, titles, items).length) UserData.save(user.user_id)

    const cards = titles.map(t => {
      const tier = ownedTier(user, t, items)
      const max = t.tiers?.length || 0
      const next = tier < max ? tier + 1 : 0
      const value = statValue(user, t.stat, items)
      const need = next ? tierNeed(t, next, items) : 0
      return {
        emoji: t.emoji,
        name: tier ? titleName(t, tier) : t.name,
        tier, max, roman: max > 1 ? ROMAN[tier] || "" : "★",
        color: TIER_COLORS[Math.min(tier, 3)],
        pips: Array.from({ length: max }, (_, i) => i < tier),
        effect: tier ? effectText(tierEffects(t, tier)) : "",
        next: next && {
          name: titleName(t, next),
          desc: titleDesc(t, next, items),
          effect: effectText(tierEffects(t, next)),
          progress: progressText(user, t, items),
          pct: Math.min(100, Math.round(value / need * 100)),
        },
      }
    })
    const owned = cards.filter(c => c.tier)
    const total = effectText(getEffects(user, titles, items))
    const data = {
      name: displayName(user), cards,
      owned: owned.length, total: titles.length,
      tiers: cards.reduce((s, c) => s + c.tier, 0), maxTiers: cards.reduce((s, c) => s + c.max, 0),
      sum: owned.length ? total : "",
    }
    const msg = await renderOrText(puppeteer, "title", data, () => [
      `🏅 ${data.name} 的称号（${data.owned}/${data.total} · 共 ${data.tiers}/${data.maxTiers} 级）`,
      "━━━━━━━━━━━━",
      ...cards.flatMap(c => [
        `${c.tier ? "✅" : "🔒"} ${c.emoji}【${c.name}】${c.tier ? `　${c.effect}` : ""}`,
        c.next ? `　下一级 ${c.next.name}：${c.next.desc}（${c.next.progress}）→ ${c.next.effect}` : "　✨ 已满级",
      ]),
      "━━━━━━━━━━━━",
      data.sum ? `✨ 称号总加成：${data.sum}` : "还没有称号，快去钓鱼吧~",
      "同一称号只按最高一级生效，不同称号效果叠加",
    ].join("\n"))
    if (!msg) return true
    return e.reply(withButtons(e, msg, [B.cast, B.multi, B.info]))
  }
}
