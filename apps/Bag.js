import { plugin, puppeteer } from "../components/yunzai.js"
import Config from "../components/Config.js"
import UserData from "../components/UserData.js"
import { RARITY_INFO, isDexFish, formatWeight, SIZE_ORDER, castBreakdown, buildSizeOdds, autoSellable } from "../components/ItemPool.js"
import { groupBag, sellEntries, discardJunk, todayLuck, luckTier, repriceBag, protectedFine, groupProtectedMax } from "../components/Game.js"
import { checkTitles, getEffects, effectText, progressText, mergeEffects, ownedTier, ownedTitles, titleName, titleUpText } from "../components/Titles.js"
import { gearEffects, bagCapacity, totalBait, gearItem, gearLevel, SLOTS, ownedGear, tierBadge, currentBait, breakChance, MAX_ENHANCE, MAX_FORGE } from "../components/Gear.js"
import { gearIcon } from "../components/GearIcons.js"
import { withButtons, B, fishRow } from "../components/Button.js"
import { renderOrText } from "../components/Render.js"
import GroupDaily, { groupKey } from "../components/GroupDaily.js"
import { petEffects, petCfg, petDef, ensurePets, refreshPets, petLevel, petStage, petName, currentForm, branchDef, petAbilities, skillText, isHungry, satText } from "../components/Pet.js"
import { petIcon } from "../components/PetIcons.js"
import { itemChance, formatChance, sizeTable, findItems, dexNo } from "../components/Dex.js"
import { dayKey } from "../components/Period.js"
import { characterProgress } from "../components/Progression.js"
import { groupAllowed, itemMap, displayName, updateNickname, avatar, playerEffects, sellBonusOf } from "../components/common.js"

/** 鱼护展示顺序：隐藏 → 传说 → … → 普通 → 垃圾 */
/** 鱼护 / 图鉴展示顺序：隐藏 → 神话 → 史诗 → 传说 → … → 普通 → 垃圾 → 保护鱼类 */
const ORDER = ["hidden", "MR", "EP", "UR", "SSR", "SR", "R", "N", "junk", "protected"]

export class FishingBag extends plugin {
  constructor() {
    super({
      name: "钓鱼-鱼护",
      dsc: "鱼护 / 出售 / 清理垃圾 / 图鉴",
      event: "message",
      priority: 500,
      rule: [
        { reg: /^#?我的鱼护$/, fnc: "bag" },
        { reg: /^#?一键出售$/, fnc: "sellAll" },
        { reg: /^#?(出售)\s*(\S+?)\s*(\d+)?$/, fnc: "sell" },
        { reg: /^#?清理垃圾$/, fnc: "discard" },
        { reg: /^#?钓鱼信息$/, fnc: "info" },
        { reg: /^#?我的金币$/, fnc: "gold" },
        { reg: /^#?钓鱼图鉴\s*(.*)$/, fnc: "dex" },
      ],
    })
  }

  /** 出售加成：称号 + 渔具 + 出战宠物（饥饿时不算） */
  sellBonus(user) {
    return sellBonusOf(user)
  }

  load(e) {
    const user = UserData.get(e.user_id)
    updateNickname(user, e)
    // 鱼价调整后，鱼护里的旧鱼获按当前价格展示和出售
    if (repriceBag(user, itemMap(), Config.config.size)) UserData.save(user.user_id)
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
    const value = groups.filter(g => autoSellable(g.item)).reduce((s, g) => s + g.total, 0)
    const sellValue = Math.round(value * (1 + bonus / 100))
    const kept = this.keptText(user, items)
    const junk = groups.filter(g => g.item.rarity === "junk").reduce((s, g) => s + g.count, 0)
    const limit = bagCapacity(user, Config.shop, Config.config.fishing?.bagLimit)

    if (!list.length)
      return e.reply(withButtons(e, `🎒 ${displayName(user)} 的鱼护空空如也~\n💰 金币：${user.gold}\n发送 #钓鱼 去钓几条吧！`, fishRow(user)))

    const msg = await renderOrText(puppeteer, "bag", {
      name: displayName(user), avatar: avatar(user.user_id), gold: user.gold,
      list, value, sellValue, bonus, junk, kept, count: user.bag.length, limit,
    }, () => [
      `🎒 ${displayName(user)} 的鱼护（${user.bag.length}/${limit}）`,
      "━━━━━━━━━━━━",
      ...list.map(i => `${i.emoji}【${i.label}】${i.name} ×${i.count}${i.sizes ? `（${i.sizes}）` : ""}  ${i.rarity === "junk" ? "0" : i.total} 金币`),
      "━━━━━━━━━━━━",
      `💰 一键出售可得：${sellValue} 金币${bonus ? `（加成 +${bonus}%）` : ""}`,
      kept,
      junk ? `🗑️ 垃圾 ${junk} 件，可发送 #清理垃圾 统一回收` : "",
      `👛 当前金币：${user.gold}`,
    ].filter(Boolean).join("\n"))
    if (!msg) return true
    return e.reply(withButtons(e, msg,
      [B.sellAll, B.sell, ...(junk ? [B.discard] : [])],
      fishRow(user),
      [B.dayRank, B.weekRank, B.monthRank]))
  }

  async sellAll(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const items = itemMap()
    const entries = user.bag.filter(x => autoSellable(items.get(x.id)))
    const junk = user.bag.filter(x => items.get(x.id)?.rarity === "junk").length
    const kept = this.keptText(user, items)
    if (!entries.length)
      return e.reply(withButtons(e, [junk ? `🗑️ 鱼护里只剩 ${junk} 件垃圾，卖不了钱哦~ 发送 #清理垃圾 统一回收吧` : "🎒 鱼护里没有可以一键出售的鱼~", kept].filter(Boolean).join("\n"), junk ? [B.discard, B.cast] : [B.start]))
    return this.doSell(e, user, entries, junk, kept)
  }

  async sell(e) {
    if (!groupAllowed(e)) return false
    const [, , name, num] = e.msg.match(/^#?(出售)\s*(\S+?)\s*(\d+)?$/)
    if (/^(鱼获|鱼护|全部|所有)$/.test(name)) return this.sellAll(e)
    const user = this.load(e)
    const items = itemMap()
    const item = [...items.values()].find(i => i.name === name) || [...items.values()].find(i => i.name.includes(name))
    if (!item) return e.reply(`❓ 没有找到「${name}」，发送 #我的鱼护 看看里面有什么吧`)
    if (item.rarity === "junk")
      return e.reply(withButtons(e, `🗑️ ${item.name}是海洋垃圾，卖不了钱哦~ 发送 #清理垃圾 统一回收吧`, [B.discard]))
    // 先卖便宜的，大鱼留给用户自己决定
    let entries = user.bag.filter(x => x.id === item.id).sort((a, b) => a.p - b.p)
    if (!entries.length) return e.reply(`🎒 鱼护里没有「${item.name}」哦~`)
    if (num) entries = entries.slice(0, Math.max(1, Number(num)))
    return this.doSell(e, user, entries)
  }

  /** 一键出售保留的物品：💎 海洋之心 ×2 留在鱼护，需手动 #出售 海洋之心 */
  keptText(user, items = itemMap()) {
    const kept = new Map()
    for (const x of user.bag) { const it = items.get(x.id); if (it && it.rarity !== "junk" && it.autoSell === false) kept.set(it, (kept.get(it) || 0) + 1) }
    return [...kept].map(([it, n]) => `${it.emoji} ${it.name} ×${n} 留在鱼护，需要手动 #出售 ${it.name}`).join("\n")
  }

  async doSell(e, user, entries, junkLeft = 0, kept = "") {
    const bonus = this.sellBonus(user)
    const { count, base, gold } = sellEntries(user, entries, bonus)
    UserData.save(user.user_id)
    const lines = [
      `💰 从鱼护里卖出 ${count} 件`,
      `获得 ${gold} 金币${bonus ? `（${base} + 加成 ${bonus}%）` : ""}`,
      `👛 当前金币：${user.gold}`,
    ]
    if (kept) lines.push(kept)
    if (junkLeft) lines.push(`🗑️ 鱼护里还有 ${junkLeft} 件垃圾，可发送 #清理垃圾 统一回收`)
    return e.reply(withButtons(e, lines.join("\n"), fishRow(user), [B.bag, B.shop, ...(junkLeft ? [B.discard] : [])]))
  }

  async discard(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const n = discardJunk(user, itemMap())
    if (!n) return e.reply(withButtons(e, "✨ 鱼护里没有垃圾，干干净净~", fishRow(user)))
    const guardian = (Config.titles || []).find(t => t.id === "guardian")
    const lines = [
      `♻️ 已将 ${n} 件海洋垃圾送去回收站，海洋又干净了一点~`,
      `🌊 累计清理：${user.stats.junkCleaned} 件`,
    ]
    const got = checkTitles(user, Config.titles, Config.items)
    UserData.save(user.user_id)
    if (guardian) {
      const tier = ownedTier(user, guardian, Config.items)
      if (tier < guardian.tiers.length)
        lines.push(`🏅 距离【${guardian.emoji} ${titleName(guardian, tier + 1)}】：${progressText(user, guardian, Config.items)}`)
    }
    if (got.length) lines.push("", titleUpText(got))
    return e.reply(withButtons(e, lines.join("\n"), [...fishRow(user), B.bag]))
  }

  async gold(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    return e.reply(`💰 ${displayName(user)} 当前金币：${user.gold}`)
  }

  /** #钓鱼信息：角色等级与经验进度 */
  levelInfo(user) {
    const p = characterProgress(user)
    const fmt = n => Number(n || 0).toLocaleString("en-US")
    return {
      level: p.level, max: p.max, xp: fmt(p.xp), pct: p.max ? 100 : p.percent,
      cur: fmt(p.currentXp), req: fmt(p.requiredXp), remaining: fmt(p.remainingXp), next: p.level + 1,
    }
  }

  /** #钓鱼信息：出战宠物（形象、等级、饱食度、天赋与技能） */
  petInfo(user) {
    ensurePets(user); refreshPets(user)
    const c = petCfg(), id = user.pets.active, d = id && user.pets.owned[id]
    if (!d) return { none: true, count: Object.keys(user.pets.owned).length }
    const def = petDef(id), form = currentForm(def, d, c), stage = petStage(d, c)
    return {
      icon: petIcon(id, form), name: petName(def, d, c), form: form?.name, level: petLevel(d, c),
      stage: ["", "一阶", "二阶", "三阶", "四阶", "五阶"][stage], branch: branchDef(def, d.branch)?.name || "",
      sat: satText(d, c), satPct: Math.max(0, Math.min(100, d.sat / c.satiety.max * 100)), hungry: isHungry(d, c), low: d.sat < c.satiety.warn,
      skills: petAbilities(def, d, c).map(s => ({ name: s.name, text: skillText(s.effect, s.value), talent: !!s.talent })),
    }
  }

  /** #钓鱼信息：综合属性（称号 + 渔具 + 宠物 + 今日运势 + 当前鱼饵） */
  attrInfo(user) {
    const shop = Config.shop, eff = playerEffects(user), bait = currentBait(user, shop)
    const num = v => Number(Number(v || 0).toFixed(2))
    const brk = r => num(breakChance({ type: "item", rarity: r, size: "medium" }, shop.lineBreak, eff))
    const big = num(breakChance({ type: "item", rarity: "MR", size: "xlarge" }, shop.lineBreak, eff))
    const sizes = buildSizeOdds(Config.config.size || {}, eff), sizeTotal = Object.values(sizes).reduce((x, y) => x + y, 0) || 1
    return [
      { label: "出售金币加成", value: `+${num(this.sellBonus(user))}%`, sub: "称号 + 渔具 + 宠物" },
      { label: "鱼价加成", value: `+${num(eff.priceBonus)}%`, sub: `当前鱼饵：${bait?.name || "普通饵"}` },
      { label: "断线降低", value: `-${num(Math.min(100, eff.lineGuard || 0))}%`, sub: "鱼线 + 宠物天赋「护线」" },
      { label: "没及时收杆不跑鱼", value: `${num(Math.min(100, eff.holdChance || 0))}%`, sub: "鱼钩" },
      { label: "实际断线概率", value: `神器 ${brk("SSR")}% · 传说 ${brk("UR")}% · 史诗 ${brk("EP")}% · 神话 ${brk("MR")}%`, sub: `大体型更高，超大神话 ${big}%`, wide: true },
      { label: "大鱼 / 超大鱼", value: `${num(sizes.large / sizeTotal * 100)}% / ${num(sizes.xlarge / sizeTotal * 100)}%`, sub: `大体型 +${num(eff.largeBoost)}% · 超大体型 +${num(eff.xlBoost)}%` },
      { label: "咬钩 / 收杆", value: `-${num(eff.biteReduce)}s / +${num(eff.reelWindow)}s`, sub: "等待咬钩更快 / 收杆时间更长" },
      { label: "鱼护容量", value: `${user.bag.length} / ${bagCapacity(user, shop, Config.config.fishing?.bagLimit)}`, sub: "已用 / 总容量", wide: true },
    ]
  }

  async info(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const s = user.stats
    const titles = ownedTitles(user, Config.titles, Config.items)
    const max = user.maxFish && itemMap().get(user.maxFish.id)
    const luck = todayLuck(user)
    const fortune = luckTier(luck, Config.config.checkin?.tiers)
    const equipment = SLOTS.map(slot => {
      const tier = gearLevel(user, slot)
      const item = ownedGear(user, slot, tier)
      return {slot, name:gearItem(Config.shop, slot, tier)?.name || slot,
        tier, ...tierBadge(tier), icon:gearIcon(slot, tier), enhance:item?.enhance || 0, forge:item?.forge || 0,
        // 强化、锻造都满级：名字显示金色
        maxed:(item?.enhance || 0) >= MAX_ENHANCE && (item?.forge || 0) >= MAX_FORGE}
    })
    const stats = [
      {label:"抛竿次数",value:s.casts,unit:"次"},
      {label:"钓到鱼",value:s.catches,unit:"条"},
      {label:"钓到垃圾",value:s.junk,unit:"件"},
      {label:"已清理垃圾",value:s.junkCleaned,unit:"件"},
      {label:"空军次数",value:s.empty,unit:"次"},
      {label:"跑鱼次数",value:s.escaped,unit:"次"},
      {label:"累计钓获价值",value:s.earned,unit:"金币"},
      {label:"累计出售",value:s.sold,unit:"金币"},
      {label:"收杆过早",value:s.early,unit:"次"},
      {label:"最大一条",value:max ? `${max.name} ${formatWeight(user.maxFish.w)}` : "暂无",unit:""},
    ]
    // 抛一竿的完整概率：渔具、套装、称号、今日运势（不含鱼饵）；本群今天保护鱼类已达上限时不再出现
    const cfg = Config.config
    const groupMax = groupProtectedMax(cfg.protectedPenalty)
    const capped = groupMax && GroupDaily.count(groupKey(e)) >= groupMax
    const pctText = pct => `${Number(pct.toFixed(pct < 1 ? 2 : 1))}%`
    const noBait = castBreakdown(cfg.probability, { ...playerEffects(user, null), ...(capped ? { protectedScale: 0 } : {}) }, cfg.limits)
    const odds = noBait.filter(o => o.pct > 0).map(o => ({ ...o, text: pctText(o.pct) }))
    // 当前鱼饵会改变的结果（如垃圾降低），单独列一行实际概率
    const bait = currentBait(user, Config.shop)
    const withBait = castBreakdown(cfg.probability, { ...playerEffects(user), ...(capped ? { protectedScale: 0 } : {}) }, cfg.limits)
    // 鱼饵直接影响的是空军和垃圾，鱼获各品级按比例跟着变化
    const changed = withBait.filter((o, i) => ["empty", "junk"].includes(o.key) && Math.abs(o.pct - noBait[i].pct) >= 0.05)
    const oddsBait = changed.length ? `用当前鱼饵（${bait?.name || "普通饵"}）时：${changed.map(o => `${o.label} ${pctText(o.pct)}`).join(" · ")}，鱼获相应增加` : ""
    const data = {
      odds, oddsBait, protectedCapped: !!capped, pet: this.petInfo(user), attrs: this.attrInfo(user), level: this.levelInfo(user),
      name:displayName(user), avatar:avatar(user.user_id) || (typeof e.sender?.avatar === "string" && /^https:\/\//.test(e.sender.avatar) ? e.sender.avatar : ""),
      gold:user.gold, bait:totalBait(user), equipment, stats,
      goldText:Number(user.gold || 0).toLocaleString("en-US"), baitText:Number(totalBait(user)).toLocaleString("en-US"),
      luck:fortune?.name || "尚未打卡", luckValue:luck,
      checkedIn:!!fortune,
      streak:user.checkin.streak, checkinTotal:user.checkin.total,
      titles:titles.map(({title,tier})=>({name:titleName(title,tier)})),
    }
    const msg = await renderOrText(puppeteer, "profile", data, () => [
      `👤 ${data.name} 的钓鱼信息`,
      "━━━━━━━━━━━━",
      data.level.max ? `⭐ Lv${data.level.level} 🏆 已满级 · 总经验 ${data.level.xp}` : `⭐ Lv${data.level.level} · 经验 ${data.level.cur}/${data.level.req}（${data.level.pct}%）· 距 Lv${data.level.next} 还需 ${data.level.remaining}`,
      `👛 金币：${data.gold} · 🪱 鱼饵：${data.bait}`,
      `今日运势：${data.luck}（幸运值 ${luck}）· 连续打卡 ${data.streak} 天（累计 ${data.checkinTotal} 天）`,
      `🧰 ${equipment.map(i=>i.name).join(" · ")}`,
      data.pet.none ? "🐾 出战宠物：无" : `🐾 ${data.pet.name} Lv${data.pet.level}（${data.pet.stage}）· 饱食度 ${data.pet.sat}${data.pet.hungry ? "（饥饿，技能失效）" : ""}`,
      ...(data.pet.none ? [] : data.pet.skills.map(k => `　「${k.name}」${k.text}`)),
      ...data.attrs.map(a => `${a.label}：${a.value}`),
      ...stats.map(i=>`${i.label}：${i.value}${i.unit}`),
      `称号：${data.titles.map(i=>i.name).join("、") || "暂无"}`,
    ].join("\n"))
    if (!msg) return true
    return e.reply(withButtons(e, msg, [B.bag, B.titles, B.dex], [B.checkin, B.myGear, B.myBait]))
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
    // 各体型概率按玩家当前的大体型、超大体型加成计算
    const sizes = sizeTable(item, cfg.size, playerEffects(user)).map(s => ({
      ...s, weight: `${formatWeight(s.wMin)} ~ ${formatWeight(s.wMax)}`, price: s.pMin === s.pMax ? `${s.pMin}` : `${s.pMin} ~ ${s.pMax}`,
    }))
    const pen = cfg.protectedPenalty || {}
    const fineText = Number(pen.goldRate) > 0 ? `当前金币的 ${pen.goldRate}%（最多 ${pen.gold ?? 0}，你现在会被罚 ${protectedFine(user.gold, pen)}）` : `${pen.gold ?? 0} 金币`
    const price = item.special === "protected" ? `🚫 禁止捕捞（误钓会被警察带走，禁渔 ${pen.banMinutes ?? 0} 分钟，罚款 ${fineText}）`
      : item.special === "paimon" ? "不能卖！派蒙是伙伴"
      : item.special === "police" ? `警局奖励 ${cfg.policeReward} 金币`
      : item.rarity === "junk" ? "0 金币（可 #清理垃圾 统一回收）"
        : sizes.length ? `${sizes[0].pMin} ~ ${sizes[sizes.length - 1].pMax} 金币` : `${item.price || 0} 金币`
    const data = {
      no: dexNo(item, all), emoji: item.emoji, name: item.name, desc: item.desc || "",
      rarity: item.rarity, label: r.label, color: r.color,
      habitat: item.habitat || "未知", intro: item.intro || item.desc || "",
      // 按玩家当前渔具、称号、运势和鱼饵计算，与实际抛竿一致
      chance: formatChance(itemChance(item, all, cfg.probability, playerEffects(user), cfg.limits)), price, sizes,
      // 保护鱼类用于科普，不用钓到也能看介绍
      unlocked: count > 0 || item.rarity === "protected", count,
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
      `🎲 出现概率：约 ${data.chance}（按你当前的渔具）`,
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
