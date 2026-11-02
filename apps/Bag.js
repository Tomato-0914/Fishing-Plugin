import { plugin, puppeteer } from "../components/yunzai.js"
import Config from "../components/Config.js"
import UserData from "../components/UserData.js"
import { RARITY_INFO, isDexFish, formatWeight } from "../components/ItemPool.js"
import { groupBag, sellEntries, discardJunk, todayLuck, luckTier } from "../components/Game.js"
import { checkTitles, getEffects, effectText, progressText, mergeEffects } from "../components/Titles.js"
import { gearEffects, bagCapacity, totalBait, gearItem, gearLevel } from "../components/Gear.js"
import { withButtons, B } from "../components/Button.js"
import { renderOrText } from "../components/Render.js"
import { itemChance, formatChance, sizeTable, findItems, dexNo } from "../components/Dex.js"
import { dayKey } from "../components/Period.js"
import { groupAllowed, itemMap, displayName, updateNickname, avatar } from "../components/common.js"

/** 鱼护展示顺序：隐藏 → 传说 → … → 普通 → 垃圾 */
const ORDER = ["hidden", "UR", "SSR", "SR", "R", "N", "junk"]
const SIZE_ORDER = ["large", "medium", "small"]

export class FishingBag extends plugin {
  constructor() {
    super({
      name: "钓鱼-鱼获",
      dsc: "鱼获 / 出售 / 丢弃垃圾 / 图鉴",
      event: "message",
      priority: 500,
      rule: [
        { reg: /^#?(我的(鱼获|鱼护)|钓鱼背包)$/, fnc: "bag" },
        { reg: /^#?一键出售(鱼获)?$/, fnc: "sellAll" },
        { reg: /^#?(出售)\s*(\S+?)\s*(\d+)?$/, fnc: "sell" },
        { reg: /^#?(丢弃|清理)(全部)?垃圾$/, fnc: "discard" },
        { reg: /^#?(我的金币|钓鱼信息|我的钓鱼)$/, fnc: "info" },
        { reg: /^#?钓鱼图鉴\s*(.*)$/, fnc: "dex" },
      ],
    })
  }

  /** 出售加成：称号 + 鱼护 */
  sellBonus(user) {
    return mergeEffects(getEffects(user, Config.titles), gearEffects(user, Config.shop)).sellBonus || 0
  }

  load(e) {
    const user = UserData.get(e.user_id)
    updateNickname(user, e)
    return user
  }

  async bag(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const items = itemMap()
    const bonus = this.sellBonus(user)
    const groups = groupBag(user, items).sort((a, b) =>
      ORDER.indexOf(a.item.rarity) - ORDER.indexOf(b.item.rarity) || b.total - a.total)

    const sizeCfg = Config.config.size || {}
    const list = groups.map(g => ({
      emoji: g.item.emoji,
      name: g.item.name,
      rarity: g.item.rarity,
      label: RARITY_INFO[g.item.rarity]?.label,
      color: RARITY_INFO[g.item.rarity]?.color,
      count: g.count,
      total: g.total,
      sizes: SIZE_ORDER.filter(s => g.sizes[s]).map(s => `${sizeCfg[s]?.label || s}×${g.sizes[s]}`).join(" "),
    }))
    const value = groups.reduce((s, g) => s + g.total, 0)
    const sellValue = Math.round(value * (1 + bonus / 100))
    const junk = groups.filter(g => g.item.rarity === "junk").reduce((s, g) => s + g.count, 0)
    const limit = bagCapacity(user, Config.shop, Config.config.fishing?.bagLimit)

    if (!list.length)
      return e.reply(withButtons(e, `🎒 ${displayName(user)} 的鱼护空空如也~\n💰 金币：${user.gold}\n发送 #钓鱼 去钓几条吧！`, [B.start]))

    const msg = await renderOrText(puppeteer, "bag", {
      name: displayName(user), avatar: avatar(user.user_id), gold: user.gold,
      list, value, sellValue, bonus, junk, count: user.bag.length, limit,
    }, () => [
      `🎒 ${displayName(user)} 的鱼获（${user.bag.length}/${limit}）`,
      "━━━━━━━━━━━━",
      ...list.map(i => `${i.emoji}【${i.label}】${i.name} ×${i.count}${i.sizes ? `（${i.sizes}）` : ""}  ${i.rarity === "junk" ? "0" : i.total} 金币`),
      "━━━━━━━━━━━━",
      `💰 全部出售可得：${sellValue} 金币${bonus ? `（加成 +${bonus}%）` : ""}`,
      junk ? `🗑️ 垃圾 ${junk} 件，可发送 #丢弃垃圾 集中清理` : "",
      `👛 当前金币：${user.gold}`,
    ].filter(Boolean).join("\n"))
    if (!msg) return true
    return e.reply(withButtons(e, msg,
      [B.sellAll, B.sell, ...(junk ? [B.discard] : [])],
      [B.dayRank, B.weekRank, B.monthRank]))
  }

  async sellAll(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const items = itemMap()
    const entries = user.bag.filter(x => items.get(x.id)?.rarity !== "junk")
    const junk = user.bag.length - entries.length
    if (!entries.length)
      return e.reply(withButtons(e, junk ? `🗑️ 鱼护里只剩 ${junk} 件垃圾，卖不了钱哦~ 发送 #丢弃垃圾 集中清理吧` : "🎒 鱼护里没有可以出售的鱼获~", junk ? [B.discard, B.cast] : [B.start]))
    return this.doSell(e, user, entries, junk)
  }

  async sell(e) {
    if (!groupAllowed(e)) return false
    const [, , name, num] = e.msg.match(/^#?(出售)\s*(\S+?)\s*(\d+)?$/)
    if (/^(鱼获|全部|所有)$/.test(name)) return this.sellAll(e)
    const user = this.load(e)
    const items = itemMap()
    const item = [...items.values()].find(i => i.name === name) || [...items.values()].find(i => i.name.includes(name))
    if (!item) return e.reply(`❓ 没有找到「${name}」，发送 #我的鱼获 看看鱼护里有什么吧`)
    if (item.rarity === "junk")
      return e.reply(withButtons(e, `🗑️ ${item.name}是海洋垃圾，卖不了钱哦~ 发送 #丢弃垃圾 集中清理吧`, [B.discard]))
    // 先卖便宜的，大鱼留给用户自己决定
    let entries = user.bag.filter(x => x.id === item.id).sort((a, b) => a.p - b.p)
    if (!entries.length) return e.reply(`🎒 鱼护里没有「${item.name}」哦~`)
    if (num) entries = entries.slice(0, Math.max(1, Number(num)))
    return this.doSell(e, user, entries)
  }

  async doSell(e, user, entries, junkLeft = 0) {
    const bonus = this.sellBonus(user)
    const { count, base, gold } = sellEntries(user, entries, bonus)
    UserData.save(user.user_id)
    const lines = [
      `💰 成功出售 ${count} 件鱼获`,
      `获得 ${gold} 金币${bonus ? `（${base} + 加成 ${bonus}%）` : ""}`,
      `👛 当前金币：${user.gold}`,
    ]
    if (junkLeft) lines.push(`🗑️ 鱼护里还有 ${junkLeft} 件垃圾，可发送 #丢弃垃圾 集中清理`)
    return e.reply(withButtons(e, lines.join("\n"), [B.cast, B.bag, ...(junkLeft ? [B.discard] : [])]))
  }

  async discard(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const n = discardJunk(user, itemMap())
    if (!n) return e.reply(withButtons(e, "✨ 鱼护里没有垃圾，干干净净~", [B.cast]))
    const guardian = (Config.titles || []).find(t => t.id === "guardian")
    const lines = [
      `♻️ 已将 ${n} 件海洋垃圾集中清理，海洋又干净了一点~`,
      `🌊 累计清理：${user.stats.junkCleaned} 件`,
    ]
    if (guardian && !user.titles.includes(guardian.id))
      lines.push(`🏅 距离称号【${guardian.emoji} ${guardian.name}】：${progressText(user, guardian)}`)
    const got = checkTitles(user, Config.titles, Config.items)
    UserData.save(user.user_id)
    for (const t of got) lines.push("", `🏅 恭喜获得称号【${t.emoji} ${t.name}】\n✨ 效果：${effectText(t.effects)}`)
    return e.reply(withButtons(e, lines.join("\n"), [B.cast, B.bag]))
  }

  async info(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const s = user.stats
    const titles = (Config.titles || []).filter(t => user.titles.includes(t.id))
    const max = user.maxFish && itemMap().get(user.maxFish.id)
    const msg = [
      `👤 ${displayName(user)} 的钓鱼信息`,
      "━━━━━━━━━━━━",
      `👛 金币：${user.gold} · 🪱 鱼饵：${totalBait(user)}`,
      `🧰 ${["rod", "line", "float", "net"].map(k => gearItem(Config.shop, k, gearLevel(user, k))?.name).filter(Boolean).join(" · ")}`,
      `🎣 抛竿 ${s.casts} 次 · 钓到鱼 ${s.catches} 条`,
      `🗑️ 钓到垃圾 ${s.junk} 件 · 已清理 ${s.junkCleaned} 件`,
      `🌊 空军 ${s.empty} · 跑鱼 ${s.escaped} · 收杆过早 ${s.early}`,
      `💎 累计钓获价值 ${s.earned} · 累计出售 ${s.sold}`,
      max ? `🏆 最大一条：${max.emoji}${max.name} ${formatWeight(user.maxFish.w)}` : "",
      (() => { const l = todayLuck(user); const t = luckTier(l, Config.config.checkin?.tiers); return t ? `${t.emoji} 今日运势：${t.name}（幸运值 ${l}）` : "📅 今天还没打卡" })(),
      `🔥 连续打卡 ${user.checkin.streak} 天 · 累计 ${user.checkin.total} 天`,
      `🏅 称号：${titles.length ? titles.map(t => `${t.emoji}${t.name}`).join(" ") : "暂无"}`,
    ].filter(Boolean).join("\n")
    return e.reply(withButtons(e, msg, [B.bag, B.titles, B.dex], [B.checkin]))
  }

  async dex(e) {
    if (!groupAllowed(e)) return false
    const keyword = e.msg.replace(/^#?钓鱼图鉴/, "").trim()
    if (keyword) return this.dexDetail(e, keyword)
    const user = this.load(e)
    const all = Config.items || []
    const groups = ORDER.map(r => ({
      rarity: r,
      label: RARITY_INFO[r]?.label,
      color: RARITY_INFO[r]?.color,
      list: all.filter(i => i.rarity === r).map(i => {
        const n = user.dex[i.id] || 0
        // 隐藏款未解锁时连名字都不显示
        return { emoji: n ? i.emoji : "❔", name: n || i.rarity !== "hidden" ? i.name : "？？？", count: n, got: n > 0, desc: n ? i.desc : "" }
      }),
    })).filter(g => g.list.length)
    const fish = all.filter(isDexFish)
    const got = fish.filter(i => user.dex[i.id]).length
    const msg = await renderOrText(puppeteer, "dex", {
      name: displayName(user), groups, got, total: fish.length,
    }, () => [
      `📚 ${displayName(user)} 的钓鱼图鉴（鱼类 ${got}/${fish.length}）`,
      ...groups.map(g => `【${g.label}】${g.list.map(i => i.got ? `${i.emoji}${i.name}` : `❔${i.name}`).join(" ")}`),
    ].join("\n"))
    if (!msg) return true
    return e.reply(withButtons(e, msg, [B.dexSearch, B.cast, B.titles]))
  }

  /** 图鉴详情：#钓鱼图鉴 金枪鱼 */
  async dexDetail(e, keyword) {
    const user = this.load(e)
    const all = Config.items || []
    // 未解锁的隐藏款不参与模糊搜索，避免剧透
    const visible = all.filter(i => i.rarity !== "hidden" || user.dex[i.id] || i.name === keyword)
    const found = findItems(keyword, visible)
    if (!found.length) return e.reply(withButtons(e, `❓ 图鉴里没有找到「${keyword}」\n发送 #钓鱼图鉴 查看全部物品`, [B.dex]))
    if (found.length > 1) {
      const list = found.slice(0, 20)
      return e.reply(withButtons(e, [
        `🔍 找到 ${found.length} 个包含「${keyword}」的物品：`,
        list.map(i => `${user.dex[i.id] ? i.emoji : "❔"} ${i.name}`).join("  "),
        found.length > list.length ? "……" : "",
        "发送 #钓鱼图鉴 完整名称 查看详情",
      ].filter(Boolean).join("\n"), list.slice(0, 5).map(i => ({ text: i.name, callback: `#钓鱼图鉴 ${i.name}` }))))
    }

    const item = found[0]
    const count = user.dex[item.id] || 0
    if (item.rarity === "hidden" && !count)
      return e.reply(withButtons(e, "❓ 这是一件隐藏物品……\n钓到之后才能解锁它的图鉴哦~", [B.cast]))

    const cfg = Config.config
    const r = RARITY_INFO[item.rarity] || {}
    const rec = user.records?.[item.id] || {}
    const sizes = sizeTable(item, cfg.size).map(s => ({
      ...s, weight: `${formatWeight(s.wMin)} ~ ${formatWeight(s.wMax)}`, price: s.pMin === s.pMax ? `${s.pMin}` : `${s.pMin} ~ ${s.pMax}`,
    }))
    const price = item.special === "police" ? `警局奖励 ${cfg.policeReward} 金币`
      : item.rarity === "junk" ? "0 金币（可 #丢弃垃圾 集中清理）"
        : sizes.length ? `${sizes[0].pMin} ~ ${sizes[sizes.length - 1].pMax} 金币` : `${item.price || 0} 金币`
    const data = {
      no: dexNo(item, all), emoji: item.emoji, name: item.name, desc: item.desc || "",
      rarity: item.rarity, label: r.label, color: r.color,
      habitat: item.habitat || "未知", intro: item.intro || item.desc || "",
      chance: formatChance(itemChance(item, all, cfg.probability)), price, sizes,
      unlocked: count > 0, count,
      first: rec.first ? dayKey(new Date(rec.first)) : "",
      maxW: rec.maxW != null ? `${formatWeight(rec.maxW)}${rec.maxS ? `（${cfg.size?.[rec.maxS]?.label || ""}）` : ""}` : "",
      maxP: rec.maxP || 0,
      user: displayName(user),
    }
    const msg = await renderOrText(puppeteer, "detail", data, () => [
      `📖 No.${data.no} ${item.emoji} ${item.name}【${r.label}】`,
      item.desc ? `💬 ${item.desc}` : "",
      "━━━━━━━━━━━━",
      `🏞️ 栖息地：${data.habitat}`,
      `🎲 出现概率：约 ${data.chance}`,
      ...(count ? [
        `💰 售价：${price}`,
        ...sizes.map(s => `   ${s.label}：${s.weight}，${s.price} 金币`),
        "━━━━━━━━━━━━",
        `📝 ${data.intro}`,
        "━━━━━━━━━━━━",
        `🎣 已钓到 ${count} 次${data.first ? ` · 首次 ${data.first}` : ""}`,
        data.maxW ? `🏆 最大一条：${data.maxW}` : "",
        data.maxP && item.rarity !== "junk" ? `💎 最高售价：${data.maxP} 金币` : "",
      ] : ["🔒 还没有钓到过，钓到后解锁详细介绍"]),
    ].filter(Boolean).join("\n"))
    if (!msg) return true
    return e.reply(withButtons(e, msg, [B.dex, B.dexSearch, B.cast]))
  }
}
