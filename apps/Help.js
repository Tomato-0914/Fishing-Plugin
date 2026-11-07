import { plugin, puppeteer } from "../components/yunzai.js"
import Config from "../components/Config.js"
import { withButtons, B } from "../components/Button.js"
import { renderOrText, theme } from "../components/Render.js"

export class FishingHelp extends plugin {
  constructor() {
    super({
      name: "钓鱼-帮助",
      dsc: "钓鱼帮助图（6~18 点白版，其余黑版）",
      event: "message",
      priority: 500,
      rule: [{ reg: /^#?钓鱼(帮助|菜单|说明)$/, fnc: "help" }],
    })
  }

  async help(e) {
    const helpData = Config.get("help") || []
    const msg = await renderOrText(puppeteer, "help", { helpData, theme: theme() }, () =>
      ["🎣 钓鱼帮助", ...helpData.map(g => `\n${g.group}\n${g.list.map(i => `${i.title}  ${i.desc}`).join("\n")}`)].join("\n"))
    if (!msg) return true
    // 只保留最常用的两个按钮，其余功能看帮助图
    return e.reply(withButtons(e, msg, [B.start, B.checkin]))
  }
}
