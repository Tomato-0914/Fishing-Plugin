import { plugin } from "../components/yunzai.js"
import Config from "../components/Config.js"
import UserData from "../components/UserData.js"
import { effectText, progressText } from "../components/Titles.js"
import { withButtons, B } from "../components/Button.js"
import { groupAllowed, displayName } from "../components/common.js"

export class FishingTitle extends plugin {
  constructor() {
    super({
      name: "钓鱼-称号",
      dsc: "称号列表与进度",
      event: "message",
      priority: 500,
      rule: [{ reg: /^#?(我的称号|钓鱼称号|称号列表)$/, fnc: "titles" }],
    })
  }

  async titles(e) {
    if (!groupAllowed(e)) return false
    const user = UserData.get(e.user_id)
    const titles = Config.titles || []
    const owned = titles.filter(t => user.titles.includes(t.id))
    const lines = [`🏅 ${displayName(user)} 的称号（${owned.length}/${titles.length}）`, "━━━━━━━━━━━━"]
    for (const t of titles) {
      const has = user.titles.includes(t.id)
      lines.push(`${has ? "✅" : "🔒"} ${t.emoji}【${t.name}】${has ? "" : ` ${progressText(user, t, Config.items)}`}`)
      lines.push(`　条件：${t.desc}`)
      lines.push(`　效果：${effectText(t.effects)}`)
    }
    lines.push("━━━━━━━━━━━━", "称号只能获得一次，拥有即永久生效~")
    return e.reply(withButtons(e, lines.join("\n"), [B.cast, B.info]))
  }
}
