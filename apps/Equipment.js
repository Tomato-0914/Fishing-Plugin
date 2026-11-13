import { plugin } from "../components/yunzai.js"
import UserData from "../components/UserData.js"
import { groupAllowed } from "../components/common.js"
import { EQUIPMENT, SLOT_NAMES, equipmentDef, ensureEquipment, equipmentEffects, forgeEquipment, wearEquipment, removeEquipment, sellEquipment } from "../components/Equipment.js"
import { effectText } from "../components/Titles.js"

export class FishingEquipment extends plugin {
  constructor() {
    super({
      name: "钓鱼-独立装备",
      dsc: "锻造、穿戴、卸下、出售角色装备",
      event: "message", priority: 500,
      rule: [
        { reg: /^#?(装备商店|装备图鉴)$/, fnc: "catalog" },
        { reg: /^#?(装备背包|我的角色装备)$/, fnc: "inventory" },
        { reg: /^#?锻造装备\s*(.+)$/, fnc: "forge" },
        { reg: /^#?穿戴装备\s*(.+)$/, fnc: "wear" },
        { reg: /^#?卸下装备\s*(.+)$/, fnc: "remove" },
        { reg: /^#?出售装备\s*(.+)$/, fnc: "sell" },
      ],
    })
  }
  async catalog(e) {
    if (!groupAllowed(e)) return false
    return e.reply(["🔨 角色装备工坊（与渔具工坊独立）",
      ...EQUIPMENT.map(x => `【${SLOT_NAMES[x.slot]}】${x.name} · 锻造 ${x.price} 金币 · 回收 ${x.sell} 金币 · ${effectText(x.effects)}`),
      "发送 #锻造装备 装备名称 获取装备",
    ].join("\n"))
  }
  async inventory(e) {
    if (!groupAllowed(e)) return false
    const user = UserData.get(e.user_id)
    const eq = ensureEquipment(user)
    const worn = Object.entries(SLOT_NAMES).map(([slot, name]) => `${name}：${equipmentDef(eq.worn[slot])?.name || "未穿戴"}`)
    const counts = new Map()
    for (const id of eq.inventory) counts.set(id, (counts.get(id) || 0) + 1)
    return e.reply(["🎒 独立装备背包", ...worn, `✨ 穿戴加成：${effectText(equipmentEffects(user))}`,
      `背包 ${eq.inventory.length}/100：`,
      ...([...counts].map(([id, count]) => `${equipmentDef(id).name} ×${count}`).length
        ? [...counts].map(([id, count]) => `${equipmentDef(id).name} ×${count}`) : ["暂无装备"]),
      "指令：#穿戴装备 名称 / #卸下装备 护符或徽章 / #出售装备 名称",
    ].join("\n"))
  }
  async action(e, fn, verb) {
    if (!groupAllowed(e)) return false
    const user = UserData.get(e.user_id)
    const keyword = e.msg.replace(/^#?(锻造装备|穿戴装备|卸下装备|出售装备)/, "").trim()
    const ret = fn(user, keyword)
    if (!ret.ok) {
      const messages = {
        unknown: "找不到该装备或部位，请发送 #装备商店 查看。",
        full: "装备背包已满（100 件）。",
        gold: `金币不足，需要 ${ret.cost} 金币，当前 ${user.gold} 金币。`,
        missing: "背包里没有这件装备；已穿戴的装备需先卸下。",
        empty: "这个部位目前没有穿戴装备。",
      }
      return e.reply(`❌ ${messages[ret.reason] || "操作失败"}`)
    }
    await UserData.save(e.user_id)
    return e.reply(`✅ ${verb}成功：${ret.item.name}${ret.old ? `（已替换 ${ret.old.name}）` : ""}\n👛 金币：${user.gold}`)
  }
  async forge(e) { return this.action(e, forgeEquipment, "锻造") }
  async wear(e) { return this.action(e, wearEquipment, "穿戴") }
  async remove(e) { return this.action(e, removeEquipment, "卸下") }
  async sell(e) { return this.action(e, sellEquipment, "出售") }
}
