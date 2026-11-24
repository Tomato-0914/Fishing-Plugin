/** 群开关：#开启钓鱼 / #关闭钓鱼（主人、群主、管理员可用），没开启的群不能钓鱼 */
import { plugin } from "../components/yunzai.js"
import Config from "../components/Config.js"
import GroupSwitch from "../components/GroupSwitch.js"
import { groupState } from "../components/common.js"
import { withButtons, B } from "../components/Button.js"

/** 主人，或群主 / 管理员（QQBot 协议拿不到群身份时只有主人可以） */
export const canToggle = e => !!(e.isMaster || ["owner", "admin"].includes(e.sender?.role) || e.member?.is_owner || e.member?.is_admin)

export class FishingSwitch extends plugin {
  constructor() {
    super({
      name: "钓鱼-群开关",
      dsc: "开启 / 关闭本群钓鱼",
      event: "message",
      priority: 500,
      rule: [
        { reg: /^#?(开启|打开|关闭)钓鱼$/, fnc: "toggle" },
        { reg: /^#?钓鱼(开启|关闭)$/, fnc: "toggle" },
      ],
    })
  }

  async toggle(e) {
    if (!e.isGroup) return e.reply("🎣 请在群里发送，私聊一直可以钓鱼")
    if (Config.config.enable === false) return false
    const on = !/关闭/.test(e.msg)
    if (!canToggle(e)) return e.reply(`❌ 只有主人、群主或管理员才能${on ? "开启" : "关闭"}本群钓鱼哦~`)
    const before = groupState(e)
    if (before === "blocked") return e.reply("🚫 本群在钓鱼插件的黑名单中（或不在白名单中），请在配置里修改")
    if ((before === "ok") === on) return e.reply(on ? "🎣 本群已经开启钓鱼啦" : "🔒 本群本来就没有开启钓鱼")
    GroupSwitch.set(e.group_id, on)
    if (!on) return e.reply("🔒 已关闭本群钓鱼，存档都会保留，发送 #开启钓鱼 可以重新开启")
    return e.reply(withButtons(e, "🎉 已开启本群钓鱼！发送 #钓鱼 开始吧，#钓鱼帮助 查看全部玩法", [B.start, { text: "📖 钓鱼帮助", callback: "#钓鱼帮助" }]))
  }
}
