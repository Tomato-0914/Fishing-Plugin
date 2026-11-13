/** 第二阶段：角色等级、角色总览与装备详情入口。 */
import { plugin } from "../components/yunzai.js"
import UserData from "../components/UserData.js"
import Config from "../components/Config.js"
import { characterProgress } from "../components/Progression.js"
import { SLOTS, gearLevel, gearItem, gearEffects, currentBait, bagCapacity } from "../components/Gear.js"
import { effectText } from "../components/Titles.js"
import { SLOT_NAMES, equipmentDef, equipmentEffects } from "../components/Equipment.js"
import { groupAllowed, updateNickname, displayName } from "../components/common.js"

export class FishingCharacter extends plugin {
  constructor() {
    super({
      name: "钓鱼-角色档案",
      dsc: "等级经验和完整角色面板",
      event: "message",
      priority: 500,
      rule: [
        { reg: /^#?(钓鱼等级|我的等级)$/, fnc: "level" },
        { reg: /^#?钓鱼角色$/, fnc: "character" },
      ],
    })
  }

  load(e) {
    const user = UserData.get(e.user_id)
    updateNickname(user, e)
    return user
  }

  async level(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const p = characterProgress(user)
    return e.reply([
      `⭐ ${displayName(user)} 的钓鱼等级`,
      `等级：Lv${p.level}`,
      `总经验：${p.xp}`,
      `当前进度：${p.currentXp}/${p.requiredXp}（${p.percent}%）`,
      `距 Lv${p.level + 1} 还需 ${p.remainingXp} 经验`,
      "💡 每次抛竿 +1 经验，成功钓获额外 +4 经验。",
    ].join("\n"))
  }

  async character(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const p = characterProgress(user)
    const shop = Config.shop
    const slots = SLOTS.map(slot => {
      const lv = gearLevel(user, slot)
      const item = gearItem(shop, slot, lv)
      return item ? `${item.emoji} ${item.slotName}：Lv${lv} ${item.name}` : null
    }).filter(Boolean)
    const bait = currentBait(user, shop)
    const stats = user.stats || {}
    const titles = Array.isArray(user.titles) ? user.titles.length : 0
    return e.reply([
      `🎣 ${displayName(user)} 的钓鱼角色`,
      "━━━━━━━━━━━━",
      `⭐ 等级：Lv${p.level}（${p.currentXp}/${p.requiredXp} XP）`,
      `👛 金币：${Number(user.gold) || 0}`,
      `🎣 抛竿：${Number(stats.casts) || 0} 次 · 钓获：${Number(stats.catches) || 0} 次`,
      `🎒 鱼护：${user.bag?.length || 0}/${bagCapacity(user, shop, Config.config.fishing?.bagLimit)}`,
      `🏅 已获称号：${titles} 个`,
      "━━━━━━━━━━━━",
      "🧰 当前渔具",
      ...slots,
      `✨ 渔具效果：${effectText(gearEffects(user, shop))}`,
      `🪱 当前鱼饵：${bait.emoji || ""}${bait.name}`,
      "━━━━━━━━━━━━",
      "📌 #钓鱼等级 查看升级进度",
      "📌 #我的渔具 查看完整装备和概率",
      "📌 #渔具工坊 升级装备",
      "🛡️ 角色装备",
      ...Object.entries(SLOT_NAMES).map(([slot, name]) => `${name}：${equipmentDef(user.equipment?.worn?.[slot])?.name || "未穿戴"}`),
      `✨ 角色装备加成：${effectText(equipmentEffects(user))}`,
      "📌 #装备背包 / #装备商店",
      "🐾 宠物与限时状态：后续版本开放",
    ].join("\n"))
  }
}
