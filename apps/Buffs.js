import { plugin } from "../components/yunzai.js"
import UserData from "../components/UserData.js"
import { groupAllowed } from "../components/common.js"
import { effectText } from "../components/Titles.js"
import { BUFFS, activeBuffs, purchaseBuff, durationText } from "../components/Buffs.js"

export class FishingBuffs extends plugin {
  constructor() {
    super({
      name: "钓鱼-限时增益",
      dsc: "查看、购买限时钓鱼状态",
      event: "message",
      priority: 500,
      rule: [
        { reg: /^#?(状态商店|鱼符商店)$/, fnc: "shop" },
        { reg: /^#?(我的状态|钓鱼状态)$/, fnc: "status" },
        { reg: /^#?使用鱼符\s*(.+)$/, fnc: "buy" },
      ],
    })
  }
  async shop(e) {
    if (!groupAllowed(e)) return false
    return e.reply([
      "✨ 限时鱼符商店",
      ...BUFFS.map(b => `${b.emoji} ${b.name}｜${b.price} 金币｜${durationText(b.duration)}｜${effectText(b.effects)}`),
      "发送 #使用鱼符 名称 购买并立即生效",
      "同类鱼符延长时间，不叠加效果；不同鱼符可以同时生效。",
    ].join("\n"))
  }
  async status(e) {
    if (!groupAllowed(e)) return false
    const active = activeBuffs(UserData.get(e.user_id))
    return e.reply(["✨ 当前限时状态", ...(active.length ? active.map(b =>
      `${b.emoji} ${b.name}｜剩余 ${durationText(b.remaining)}｜${effectText(b.effects)}`) : ["暂无生效的鱼符"]),
      "💡 #状态商店 查看可购买的鱼符",
    ].join("\n"))
  }
  async buy(e) {
    if (!groupAllowed(e)) return false
    const id = String(e.user_id)
    const user = UserData.get(id)
    const name = e.msg.replace(/^#?使用鱼符\s*/, "").trim()
    const result = purchaseBuff(user, name)
    if (!result.ok) return e.reply(result.reason === "gold"
      ? `❌ 金币不足，需要 ${result.cost} 金币，当前 ${user.gold} 金币。`
      : "❌ 未找到鱼符，请发送 #状态商店 查看。")
    await UserData.save(id)
    return e.reply(`✅ ${result.buff.emoji} ${result.buff.name} 生效！\n✨ ${effectText(result.buff.effects)}\n⏳ 到期：${new Date(result.expiresAt).toLocaleString("zh-CN", { hour12: false })}\n👛 剩余金币：${user.gold}`)
  }
}
