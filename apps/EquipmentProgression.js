import { plugin } from "../components/yunzai.js"
import UserData from "../components/UserData.js"
import { groupAllowed } from "../components/common.js"
import { effectText } from "../components/Titles.js"
import { SLOTS } from "../components/Gear.js"
import { QUALITIES, SLOT_NAMES, MAX_LEVEL, MAX_FORGE, currentEquipment, itemName, equipmentBonus, purchaseEquipment, upgradeEquipment, forgeEquipment } from "../components/PlannedEquipment.js"

const slotOf = name => Object.keys(SLOT_NAMES).find(s => SLOT_NAMES[s] === name)
export class FishingEquipmentProgression extends plugin {
  constructor() {
    super({
      name: "钓鱼-正式装备养成",
      dsc: "七品质装备购买、升级和强化",
      event: "message", priority: 500,
      rule: [
        { reg: /^#?(装备工坊|装备商店|装备图鉴)$/, fnc: "catalog" },
        { reg: /^#?(我的装备|装备详情)$/, fnc: "inventory" },
        { reg: /^#?购买装备\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护)\s*(普通|高级|稀有|神器|传说|史诗|神话)\s*(?:Lv)?(\d{1,2})?$/, fnc: "purchase" },
        { reg: /^#?装备升级\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护)$/, fnc: "upgrade" },
        { reg: /^#?强化装备\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护)$/, fnc: "forge" },
      ],
    })
  }
  async catalog(e) {
    if (!groupAllowed(e)) return false
    return e.reply([
      "🛠️ 正式装备工坊｜五部位·七品质",
      `部位：${Object.values(SLOT_NAMES).join(" / ")}`,
      `品质：${QUALITIES.map(q => q.name).join(" / ")}`,
      `等级上限 Lv${MAX_LEVEL}｜强化上限 +${MAX_FORGE}`,
      "购买价：200 × 等级² × 品质系数（四舍五入）",
      "升级价：100 × 下一级² × 品质系数",
      "强化价：150 × 下一级强化数² × 品质系数",
      "⚠️ 购买会直接替换该部位旧装备，不返还金币。",
      "⚠️ 强化失败不退款，每次失败使下一次成功率 +5 个百分点，成功后重置。",
      "📌 #购买装备 鱼竿 稀有 3",
      "📌 #装备升级 鱼竿 / #强化装备 鱼竿",
      "📌 #我的装备 查看装备属性",
    ].join("\n"))
  }
  async inventory(e) {
    if (!groupAllowed(e)) return false
    const user = UserData.get(e.user_id)
    const items = currentEquipment(user)
    return e.reply([
      "🧰 我的正式装备",
      ...items.map(item => `${itemName(item)}${item.pity ? `｜失败补偿 +${item.pity}%` : ""}`),
      `✨ 额外属性：${effectText(equipmentBonus(user))}`,
      `👛 金币：${user.gold}`,
      "📌 #装备工坊 查看购买和强化规则",
    ].join("\n"))
  }
  async transact(e, operation) {
    if (!groupAllowed(e)) return false
    const user = UserData.get(e.user_id)
    const msg = e.msg.replace(/^#/, "")
    const m = operation === "purchase"
      ? msg.match(/^购买装备\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护)\s*(普通|高级|稀有|神器|传说|史诗|神话)\s*(?:Lv)?(\d{1,2})?$/)
      : msg.match(/^(?:装备升级|强化装备)\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护)$/)
    if (!m) return false
    const slot = slotOf(m[1])
    const result = operation === "purchase"
      ? purchaseEquipment(user, slot, m[2], m[3] === undefined ? 1 : Number(m[3]))
      : operation === "upgrade" ? upgradeEquipment(user, slot) : forgeEquipment(user, slot)
    if (result.reason === "gold") return e.reply(`❌ 金币不足：需要 ${result.price}，当前 ${user.gold}`)
    if (result.reason === "max") return e.reply("✨ 该装备已达到上限")
    if (result.reason === "level") return e.reply("❌ 装备等级须在 1~20 之间")
    if (result.reason && result.reason !== "failed") return e.reply("❌ 装备参数不正确")
    await UserData.save(e.user_id)
    if (result.reason === "failed") return e.reply(`💥 强化失败，消耗 ${result.price} 金币（成功率 ${result.chance}%）\n下次额外 +5%，当前累计补偿 +${result.item.pity}%\n👛 剩余 ${user.gold}`)
    return e.reply(`✅ ${operation === "purchase" ? "购买" : operation === "upgrade" ? "升级" : "强化"}成功：${itemName(result.item)}\n💰 花费 ${result.price} 金币，剩余 ${user.gold}`)
  }
  async purchase(e) { return this.transact(e, "purchase") }
  async upgrade(e) { return this.transact(e, "upgrade") }
  async forge(e) { return this.transact(e, "forge") }
}
