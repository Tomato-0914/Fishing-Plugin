import { plugin } from "../components/yunzai.js"
import Config from "../components/Config.js"
import UserData from "../components/UserData.js"
import { buyBait } from "../components/Game.js"
import { withButtons, B } from "../components/Button.js"
import { groupAllowed, updateNickname } from "../components/common.js"

export class FishingShop extends plugin {
  constructor() {
    super({
      name: "钓鱼-鱼饵",
      dsc: "购买鱼饵 / 查看鱼饵",
      event: "message",
      priority: 500,
      rule: [
        { reg: /^#?(购买|买)鱼饵\s*[×*xX]?\s*(\d+)?\s*(个)?$/, fnc: "buy" },
        { reg: /^#?(我的)?鱼饵$/, fnc: "bait" },
      ],
    })
  }

  get bcfg() {
    return Config.config.bait || {}
  }

  async buy(e) {
    if (!groupAllowed(e)) return false
    const user = UserData.get(e.user_id)
    updateNickname(user, e)
    const price = Number(this.bcfg.price ?? 2)
    const maxBuy = Number(this.bcfg.maxBuy) || 999
    const num = Number(e.msg.match(/(\d+)/)?.[1] ?? 10)
    if (num < 1) return e.reply("🤔 至少要买 1 个鱼饵哦~")
    if (num > maxBuy) return e.reply(`🪱 一次最多购买 ${maxBuy} 个鱼饵~`)

    const ret = buyBait(user, num, price)
    if (!ret.ok) {
      const lines = [`👛 金币不足：${num} 个鱼饵需要 ${ret.cost} 金币，你只有 ${user.gold} 金币`]
      if (ret.afford > 0) lines.push(`💡 最多可以买 ${ret.afford} 个`)
      else lines.push("💡 先 #一键出售 卖掉鱼获换点金币吧")
      return e.reply(withButtons(e, lines.join("\n"),
        ret.afford > 0 ? [{ text: `🪱 买 ${ret.afford} 个`, callback: `#购买鱼饵${ret.afford}` }, B.sellAll] : [B.sellAll, B.bag]))
    }
    UserData.save(user.user_id)
    return e.reply(withButtons(e, [
      `🪱 成功购买鱼饵 ×${ret.count}，花费 ${ret.cost} 金币`,
      `🎣 当前鱼饵：${user.bait}`,
      `👛 剩余金币：${user.gold}`,
    ].join("\n"), [B.start, B.buyBait]))
  }

  async bait(e) {
    if (!groupAllowed(e)) return false
    const user = UserData.get(e.user_id)
    const price = Number(this.bcfg.price ?? 2)
    return e.reply(withButtons(e, [
      `🪱 当前鱼饵：${user.bait}`,
      `👛 当前金币：${user.gold}（鱼饵 ${price} 金币/个）`,
    ].join("\n"), [B.start, B.buyBait, B.buyBaitInput]))
  }
}
