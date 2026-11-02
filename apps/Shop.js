/** 渔具工坊（升级渔具）与渔具商店（购买 / 切换鱼饵），以及装备查看 */
import { plugin, puppeteer } from "../components/yunzai.js"
import Config from "../components/Config.js"
import UserData from "../components/UserData.js"
import { effectText } from "../components/Titles.js"
import {
  SLOTS, UPGRADE_NAMES, LEVEL_COLORS, LEVEL_LABELS, gearLevel, gearItem, maxLevel, gearEffects, bagCapacity,
  upgradeGear, baitList, findBait, baitPrice, baitCount, totalBait, currentBait, buyBait, useBait,
} from "../components/Gear.js"
import { withButtons, B } from "../components/Button.js"
import { renderOrText } from "../components/Render.js"
import { groupAllowed, updateNickname, displayName } from "../components/common.js"

const UPGRADE_BUTTONS = [
  [{ text: "🎣 升级鱼竿", callback: "#升级鱼竿" }, { text: "🧵 升级鱼线", callback: "#升级鱼线" }],
  [{ text: "🎈 升级浮漂", callback: "#升级浮漂" }, { text: "🧺 升级鱼护", callback: "#升级鱼护" }],
]

export class FishingShop extends plugin {
  constructor() {
    super({
      name: "钓鱼-渔具工坊与商店",
      dsc: "渔具工坊升级渔具，渔具商店购买鱼饵",
      event: "message",
      priority: 500,
      rule: [
        { reg: /^#?(渔具工坊|钓鱼工坊|工坊)$/, fnc: "workshop" },
        { reg: /^#?(渔具商店|渔具店|钓鱼商店|鱼饵商店)$/, fnc: "shop" },
        { reg: /^#?升级(鱼竿|鱼线|浮漂|鱼护)$/, fnc: "upgrade" },
        { reg: /^#?(购买|买)鱼饵\s*(.*)$/, fnc: "buy" },
        { reg: /^#?(使用|切换|换)鱼饵\s*(.+)$/, fnc: "use" },
        { reg: /^#?(我的)?鱼饵$/, fnc: "bait" },
        { reg: /^#?我的(渔具|装备)$/, fnc: "gear" },
      ],
    })
  }

  get shopCfg() {
    return Config.shop || {}
  }

  get basicPrice() {
    return Number(Config.config.bait?.price ?? 2)
  }

  load(e) {
    const user = UserData.get(e.user_id)
    updateNickname(user, e)
    return user
  }

  /** 渔具的效果文字（鱼护附带容量） */
  gearText(item, user) {
    if (!item) return ""
    const parts = []
    if (item.slot === "net") parts.push(`容量 ${item.level === 1 ? bagCapacity({ gear: { net: 1 } }, this.shopCfg, Config.config.fishing?.bagLimit) : item.capacity}`)
    const eff = effectText(item.effects)
    if (eff !== "无") parts.push(eff)
    return parts.join("，") || "无"
  }

  /** 渔具工坊：四类渔具的等级与升级 */
  async workshop(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const shop = this.shopCfg
    const slots = SLOTS.filter(s => shop.gear?.[s]).map(slot => {
      const lv = gearLevel(user, slot)
      const cur = gearItem(shop, slot, lv)
      const next = gearItem(shop, slot, lv + 1)
      return {
        slot, emoji: cur.emoji, slotName: cur.slotName, max: maxLevel(shop, slot),
        pips: Array.from({ length: maxLevel(shop, slot) }, (_, i) => i < lv),
        cur: { ...cur, label: LEVEL_LABELS[lv - 1], color: LEVEL_COLORS[lv - 1], text: this.gearText(cur, user) },
        next: next && { ...next, label: LEVEL_LABELS[lv], color: LEVEL_COLORS[lv], text: this.gearText(next, user), afford: user.gold >= next.price },
      }
    })
    const msg = await renderOrText(puppeteer, "workshop", { name: displayName(user), gold: user.gold, slots }, () => [
      `🔧 渔具工坊 · 👛 ${user.gold} 金币`,
      "━━━━━━━━━━━━",
      ...slots.map(s => `${s.emoji} ${s.slotName} Lv${s.cur.level} ${s.cur.name}（${s.cur.text}）\n　${s.next ? `→ Lv${s.next.level} ${s.next.name} ${s.next.price} 金币：${s.next.text}` : "已满级"}`),
      "━━━━━━━━━━━━",
      "#升级鱼竿 / 鱼线 / 浮漂 / 鱼护",
    ].join("\n"))
    if (!msg) return true
    return e.reply(withButtons(e, msg, ...UPGRADE_BUTTONS, [B.myGear, B.shop]))
  }

  /** 渔具商店：只卖鱼饵 */
  async shop(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const shop = this.shopCfg
    const cur = currentBait(user, shop)
    const baits = baitList(shop).map(b => ({
      ...b, price: baitPrice(shop, b.id, this.basicPrice), count: baitCount(user, b.id), current: b.id === cur.id, text: effectText(b.effects),
    }))
    const msg = await renderOrText(puppeteer, "shop", { name: displayName(user), gold: user.gold, baits }, () => [
      `🏪 渔具商店 · 👛 ${user.gold} 金币`,
      "━━━━━━━━━━━━",
      "🪱 鱼饵（每竿消耗 1 个，同时只用一种）",
      ...baits.map(b => `${b.current ? "▶" : "　"}${b.emoji}${b.name} ${b.price} 金币 · 库存 ${b.count} · ${b.text === "无" ? b.desc : b.text}`),
      "━━━━━━━━━━━━",
      "#购买鱼饵 种类 数量 · #使用鱼饵 种类",
    ].join("\n"))
    if (!msg) return true
    // 每种鱼饵一个“买 10 个”按钮，QQBot 每行最多 5 个
    const buy = baits.map(b => ({ text: `${b.name}×10`, callback: `#购买鱼饵 ${b.name} 10` }))
    const rows = []
    for (let i = 0; i < buy.length; i += 3) rows.push(buy.slice(i, i + 3))
    return e.reply(withButtons(e, msg, ...rows, [B.buyBaitInput, { text: "🧺 我的鱼饵", callback: "#我的鱼饵" }, B.workshop]))
  }

  async upgrade(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const slot = UPGRADE_NAMES[e.msg.match(/升级(鱼竿|鱼线|浮漂|鱼护)/)[1]]
    const ret = upgradeGear(user, this.shopCfg, slot)
    if (!ret.ok && ret.reason === "max")
      return e.reply(withButtons(e, `✨ 你的${ret.current?.slotName}已经是最高级的【${ret.current?.name}】啦！`, [B.myGear, B.cast]))
    if (!ret.ok)
      return e.reply(withButtons(e, [
        `👛 金币不足：【${ret.next.name}】需要 ${ret.cost} 金币，你只有 ${user.gold} 金币`,
        `还差 ${ret.cost - user.gold} 金币，继续努力钓鱼吧~`,
      ].join("\n"), [B.cast, B.sellAll]))
    UserData.save(user.user_id)
    const item = ret.item
    return e.reply(withButtons(e, [
      `🎉 升级成功！${item.emoji} ${item.slotName} → Lv${item.level}【${item.name}】`,
      `💬 ${item.desc}`,
      `✨ 效果：${this.gearText(item, user)}`,
      `👛 花费 ${ret.cost} 金币，剩余 ${user.gold} 金币`,
    ].join("\n"), [B.cast, B.workshop, B.myGear]))
  }

  async buy(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const shop = this.shopCfg
    let rest = e.msg.replace(/^#?(购买|买)鱼饵/, "").trim()
    const m = rest.match(/[×*xX]?\s*(\d+)\s*个?$/)
    const num = m ? Number(m[1]) : 10
    if (m) rest = rest.slice(0, m.index).trim()
    const bait = findBait(shop, rest)
    if (!bait) return e.reply(withButtons(e, `❓ 没有「${rest}」这种鱼饵\n可选：${baitList(shop).map(b => b.name).join("、")}`, [B.shop]))
    const maxBuy = Number(Config.config.bait?.maxBuy) || 999
    if (num < 1) return e.reply("🤔 至少要买 1 个鱼饵哦~")
    if (num > maxBuy) return e.reply(`🪱 一次最多购买 ${maxBuy} 个鱼饵~`)

    const ret = buyBait(user, shop, bait.id, num, this.basicPrice)
    if (!ret.ok) {
      const lines = [`👛 金币不足：${num} 个${bait.name}需要 ${ret.cost} 金币，你只有 ${user.gold} 金币`]
      lines.push(ret.afford > 0 ? `💡 最多可以买 ${ret.afford} 个` : "💡 先 #一键出售 卖掉鱼护里的鱼换点金币吧")
      return e.reply(withButtons(e, lines.join("\n"),
        ret.afford > 0 ? [{ text: `买 ${ret.afford} 个`, callback: `#购买鱼饵 ${bait.name} ${ret.afford}` }, B.sellAll] : [B.sellAll, B.bag]))
    }
    UserData.save(user.user_id)
    const cur = currentBait(user, shop)
    const lines = [
      `${bait.emoji} 成功购买${bait.name} ×${ret.count}，花费 ${ret.cost} 金币`,
      `🪱 ${bait.name}库存：${baitCount(user, bait.id)} · 👛 剩余金币：${user.gold}`,
    ]
    const buttons = [B.start]
    if (cur.id !== bait.id) {
      lines.push(`💡 当前使用的是${cur.name}，发送 #使用鱼饵 ${bait.name} 切换`)
      buttons.unshift({ text: `使用${bait.name}`, callback: `#使用鱼饵 ${bait.name}` })
    }
    return e.reply(withButtons(e, lines.join("\n"), buttons))
  }

  async use(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const shop = this.shopCfg
    const keyword = e.msg.replace(/^#?(使用|切换|换)鱼饵/, "").trim()
    const bait = findBait(shop, keyword)
    if (!bait) return e.reply(`❓ 没有「${keyword}」这种鱼饵\n可选：${baitList(shop).map(b => b.name).join("、")}`)
    const ret = useBait(user, shop, bait.id)
    if (!ret.ok)
      return e.reply(withButtons(e, `🪱 你还没有${bait.name}，先买一些吧（${baitPrice(shop, bait.id, this.basicPrice)} 金币/个）`,
        [{ text: `买 10 个${bait.name}`, callback: `#购买鱼饵 ${bait.name} 10` }]))
    UserData.save(user.user_id)
    return e.reply(withButtons(e, `${bait.emoji} 已换上${bait.name}（库存 ${baitCount(user, bait.id)}）\n✨ 效果：${effectText(bait.effects)}`, [B.start]))
  }

  async bait(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const shop = this.shopCfg
    const cur = currentBait(user, shop)
    const owned = baitList(shop).filter(b => baitCount(user, b.id) > 0 || b.id === cur.id)
    return e.reply(withButtons(e, [
      `🪱 ${displayName(user)} 的鱼饵（共 ${totalBait(user)} 个）`,
      ...owned.map(b => `${b.id === cur.id ? "▶ " : "　"}${b.emoji}${b.name} ×${baitCount(user, b.id)} · ${effectText(b.effects).replace(/^无$/, "无特殊效果")}`),
      `👛 金币：${user.gold}`,
    ].join("\n"),
      owned.filter(b => b.id !== cur.id && baitCount(user, b.id) > 0).slice(0, 5).map(b => ({ text: `使用${b.name}`, callback: `#使用鱼饵 ${b.name}` })),
      [B.buyBait, B.buyBaitInput, B.shop]))
  }

  async gear(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const shop = this.shopCfg
    const cur = currentBait(user, shop)
    const lines = [`🧰 ${displayName(user)} 的渔具`, "━━━━━━━━━━━━"]
    for (const slot of SLOTS) {
      const lv = gearLevel(user, slot)
      const item = gearItem(shop, slot, lv)
      if (!item) continue
      lines.push(`${item.emoji} ${item.slotName}：Lv${lv}【${item.name}】${lv >= maxLevel(shop, slot) ? " · 满级" : ""}`)
      lines.push(`　${this.gearText(item, user)}`)
    }
    lines.push(`🪱 鱼饵：${cur.emoji}${cur.name} ×${baitCount(user, cur.id)} · ${effectText(cur.effects).replace(/^无$/, "无特殊效果")}`)
    lines.push("━━━━━━━━━━━━", `✨ 渔具总加成：${effectText(gearEffects(user, shop))}`)
    return e.reply(withButtons(e, lines.join("\n"), [B.workshop, B.shop, B.start]))
  }
}
