import { plugin } from "../components/yunzai.js"
import Config from "../components/Config.js"
import UserData from "../components/UserData.js"
import { triangular, formatWeight, RARITY_INFO } from "../components/ItemPool.js"
import { groupProtectedMax, cooldownLeft, setCooldown, cooldownText, COOLDOWN_LABELS, addGroup, welcome, isNewPlayer, reliefBait, todayLuck, luckTier } from "../components/Game.js"
import { addBait, consumeBait, totalBait, usableBait, baitLevel, baitCount, baitDef, gearEffects, gearItem, gearLevel, bagCapacity, holdsOnTimeout, maxLevel, gearSummary } from "../components/Gear.js"
import { resolveCast, summarize, formatMulti, formatHundred, withExtras, petProcLine } from "../components/Catch.js"
import { addPetXp, petGainLines, petNotices, skillFor, needsBranch, petDef } from "../components/Pet.js"
import GroupDaily, { groupKey } from "../components/GroupDaily.js"
import { experience, characterProgress, xpGainText, limitXp } from "../components/Progression.js"
import { checkTitles, getEffects, effectText, titleUpText } from "../components/Titles.js"
import { withButtons, B, fishRow } from "../components/Button.js"
const withButtonsBase = withButtons
import { batchCfg, batchLeftText, useBatch, protectedScaleFor } from "../components/Batch.js"
import { groupAllowed, displayName, updateNickname, pick, itemMap, playerEffects, sellBonusOf } from "../components/common.js"

/** 进行中的钓鱼：user_id → { stage: "waiting" | "bite" | "multi", timer, castAt, biteAt } */
const sessions = new Map()

const CAST_TEXT = [
  "甩出了鱼竿~ 浮漂稳稳落在水面，静待鱼儿上钩……",
  "轻轻一甩，鱼钩划出一道漂亮的弧线，耐心等待吧……",
  "挂好鱼饵抛进了水里，盯紧浮漂哦……",
]
const BAIT_TEXT = ["🪱 正在挂鱼饵~", "🧵 正在整理鱼线~", "🪝 正在换新鱼钩~", "🪣 正在给鱼护换水~"]
const WAITING_TEXT = [
  "🎣 鱼竿还在水里呢，浮漂一动就叫你~",
  "🤫 嘘……鱼儿快来了，别吓跑它们~",
  "🌊 水面很平静，再耐心等等~",
]

const sec = n => Math.max(0, Math.round(n))
/**
 * 角色经验由累计抛竿与钓获统计推导（这里只展示）；出战宠物获得同样多的经验
 * 返回：角色经验 + 宠物经验 / 进化 + 饥饿、离家出走提醒（满级时对应行不显示）
 */
function xpParts(user, before) {
  // 每日经验规则：超出部分按比例计、每天有上限；宠物获得的经验与角色实际获得的相同
  const lim = limitXp(user, before)
  const pet = addPetXp(user, lim.gain)
  return { xp: xpGainText(user, before, lim), pet: [...petGainLines(pet), ...petNotices(user)].filter(Boolean) }
}
function xpSettlement(user, before) {
  const { xp, pet } = xpParts(user, before)
  return [xp, ...pet].filter(Boolean).join("\n")
}

/** 宠物技能“不消耗鱼饵”：按概率退回刚用掉的鱼饵 */
function saveBait(user, bait, effects, rng = Math.random) {
  const chance = Number(effects.baitSave) || 0
  if (!bait || chance <= 0 || rng() * 100 >= chance) return false
  addBait(user, bait.id, 1)
  return true
}

export class Fishing extends plugin {
  constructor() {
    super({
      name: "钓鱼",
      dsc: "钓鱼小游戏：抛竿 / 收杆 / 十连 / 百连",
      event: "message",
      priority: 500,
      rule: [
        { reg: /^#?钓鱼$/, fnc: "cast" },
        { reg: /^#?收杆$/, fnc: "reel" },
        { reg: /^#?十连钓鱼$/, fnc: "multi" },
        { reg: /^#?百连钓鱼$/, fnc: "hundred" },
        { reg: /^#?千连钓鱼$/, fnc: "thousand" },
      ],
    })
  }

  get cfg() {
    return Config.config
  }

  /** 本竿的全部效果：称号 + 今日幸运 + 渔具 + 本竿鱼饵 */
  /**
   * 出战宠物等待选择进化方向（Lv60）时的按钮行：每个方向一个按钮，只有宠物主人能点
   */
  branchRow(e, user) {
    const id = user?.pets?.active
    const d = id && user.pets.owned?.[id]
    if (!d || !needsBranch(d)) return []
    return (petDef(id)?.branches || []).map(b => ({ text: `🔀 ${b.name}`, callback: `#宠物进化 ${b.name}`, permission: e.user_id }))
  }

  /** 宠物技能触发的一行：“🐉 龙「龙吟」：鱼价 ×3！” */
  skillLine(user, effect, text) {
    const s = skillFor(user, effect)
    return s ? `${s.emoji} ${s.pet}「${s.name}」：${text}` : `🐾 宠物技能：${text}`
  }

  /** 本群今日保护鱼类计数（私聊按个人单独计算） */
  protectedGroup(e) {
    const key = groupKey(e)
    return {
      max: groupProtectedMax(this.cfg.protectedPenalty),
      count: () => GroupDaily.count(key),
      add: () => GroupDaily.add(key),
    }
  }

  effectsFor(user, bait) {
    return playerEffects(user, bait ?? null)
  }

  /**
   * 统一回复：群聊里 @ 钓鱼的人，多人同时钓鱼时分得清是谁
   * QQBot 下延迟的咬钩提醒也是引用原 #钓鱼 消息的被动回复（5 分钟内有效），适配器会把 at 转成 openid 提及
   */
  async send(e, msg) {
    if (!e.isGroup || typeof segment?.at !== "function") return e.reply(msg)
    const list = [...(Array.isArray(msg) ? msg : [msg])]
    // @ 放在第一段文字前（前面有图片、换行时排在它们之后）
    const idx = list.findIndex(m => typeof m === "string" && m.trim())
    if (idx < 0) list.unshift(segment.at(e.user_id))
    else list.splice(idx, 1, segment.at(e.user_id), `\n${list[idx]}`)
    return e.reply(list)
  }

  /**
   * 抛竿前的公共检查（#钓鱼 与 #十连钓鱼 共用）：新手礼包、进行中、冷却、鱼护、鱼饵
   * @returns 可以抛竿时返回上下文；已回复用户并结束时返回 null
   */
  async precheck(e, kind = "cast") {
    const id = String(e.user_id)
    const user = UserData.get(id)
    updateNickname(user, e)
    const name = displayName(user)
    const fcfg = this.cfg.fishing || {}
    const bcfg = this.cfg.bait || {}
    const price = Number(bcfg.price ?? 2)

    // 第一次钓鱼：欢迎 + 新手鱼饵，再继续抛竿
    const isNew = isNewPlayer(user)
    const gift = welcome(user, bcfg.initial ?? 10)
    if (isNew) {
      addGroup(user, e.group_id)
      UserData.save(id)
      await this.send(e, [
        `🎉 欢迎 ${name} 加入钓鱼佬行列！`,
        `🎁 新手礼包：普通饵 ×${gift}`,
        `🪱 每次抛竿消耗 1 个鱼饵，用完可发送 #购买鱼饵 补充（${price} 金币/个）`,
        "🏪 鱼饵在 #鱼饵商店 购买，攒了金币可以去 #渔具商店 买更高阶的渔具",
      ].join("\n"))
    }

    const session = sessions.get(id)
    if (session) {
      if (session.stage === "multi") { await this.send(e, `🎣 ${session.label || "十连"}的鱼竿还在水里，正在收网，稍等一下~`); return null }
      if (session.stage === "bite") { await this.send(e, withButtons(e, "🐟 浮漂正在剧烈抖动！快发送 #收杆！", [B.reel(e)])); return null }
      await this.send(e, pick(WAITING_TEXT))
      return null
    }

    // 误钓保护鱼类后被警察带走，禁渔
    const ban = (Number(user.banUntil) || 0) - Date.now()
    if (ban > 0) {
      const until = new Date(user.banUntil)
      const hm = `${String(until.getHours()).padStart(2, "0")}:${String(until.getMinutes()).padStart(2, "0")}`
      await this.send(e, [
        "🚔 你因为误钓保护鱼类被警察带走了，正在派出所接受教育~",
        `⏳ 禁渔还剩 ${Math.ceil(ban / 60000)} 分钟（${hm} 解禁）`,
      ].join("\n"))
      return null
    }

    // 各玩法冷却独立：十连 / 百连冷却中不影响单钓，反之亦然
    const left = cooldownLeft(user, kind)
    if (left > 0) {
      await this.send(e, kind === "cast"
        ? `${pick(BAIT_TEXT)}请等待 ${left}s...`
        : withButtons(e, `⏳ ${COOLDOWN_LABELS[kind] || kind}冷却中，还需 ${cooldownText(left)}`, fishRow(user)))
      return null
    }

    const shop = Config.shop
    const limit = bagCapacity(user, shop, fcfg.bagLimit)
    if (user.bag.length >= limit) {
      await this.send(e, withButtons(e, `🎒 鱼护已经装满啦（${user.bag.length}/${limit}）~\n先出售鱼护里的鱼或回收垃圾再来吧！也可以去 #渔具商店 换更高阶的鱼护，或在 #渔具工坊 强化鱼护扩容`, [B.sellAll, B.discard], [B.bag, B.workshop]))
      return null
    }

    // 只算能用的鱼饵：等级超过渔具的高级鱼饵留在库存里，暂时用不了
    if (usableBait(user, shop) < 1) {
      const items = itemMap()
      const hasSellable = user.bag.some(x => items.get(x.id)?.rarity !== "junk")
      const relief = reliefBait(user, { amount: bcfg.relief, price, hasSellable, usable: 0 })
      if (relief) {
        UserData.save(id)
        await this.send(e, `🎁 看你两手空空，钓鱼协会送了你 ${relief} 个鱼饵，继续加油吧！（每天限领一次）`)
      } else {
        const locked = totalBait(user) > 0
        const tips = [
          locked ? "🔒 库存里的鱼饵等级太高，你的渔具还用不了~" : "🪱 鱼饵用完啦~",
          `普通饵 ${price} 金币/个，发送 #购买鱼饵 [种类] [数量] 补充`,
          locked ? "💡 穿戴任意一件达到鱼饵等级的渔具就能用了（#渔具商店）" : "",
          `👛 当前金币：${user.gold}`,
        ].filter(Boolean)
        if (user.gold < price && hasSellable) tips.push("💡 金币不够？先 #一键出售 卖掉鱼护里的鱼吧")
        await this.send(e, withButtons(e, tips.join("\n"),
          user.gold < price && hasSellable ? [B.sellAll, B.bag] : [B.buyBait, B.buyBaitInput, B.shop]))
        return null
      }
    }
    return { id, user, name, fcfg, shop, limit }
  }

  /** 自动换鱼饵的提示 */
  switchText(used) {
    if (!used?.switched) return ""
    if (used.reason === "locked")
      return `🔒 ${used.from.name}需要至少一件 Lv${baitLevel(used.from)} 渔具，已自动换成${used.bait.name}`
    return `🔄 ${used.from.name}用完了，已自动换成${used.bait.name}`
  }

  /** 装备、运势两行 */
  gearLine(user, shop) {
    const line = gearSummary(user, shop)
    return line ? `🧰 ${line}` : ""
  }

  luckLine(user) {
    const tier = luckTier(todayLuck(user), this.cfg.checkin?.tiers)
    return tier ? `${tier.emoji} 今日运势：${tier.name}（幸运值 ${todayLuck(user)}）` : ""
  }

  /** 抛竿与十连统一发送纯文字，不再附带场景图片。 */
  async sendCast(e, text) {
    return this.send(e, text)
  }

  async cast(e) {
    if (!groupAllowed(e)) return false
    const ctx = await this.precheck(e)
    if (!ctx) return true
    const { id, user, name, fcfg, shop } = ctx

    const used = consumeBait(user, shop)
    const bait = used.bait
    const effects = this.effectsFor(user, bait)
    const saved = saveBait(user, bait, effects)
    const biteMin = Math.max(1, Number(fcfg.biteMin) || 3)
    const biteMax = Math.min(30, Math.max(biteMin, Number(fcfg.biteMax) || 18))
    const delay = Math.max(2, triangular(biteMin, biteMax) - (effects.biteReduce || 0)) * 1000

    user.stats.casts++
    addGroup(user, e.group_id)
    UserData.save(id)

    const s = { stage: "waiting", castAt: Date.now(), bait: bait.id, xpBefore: experience(user) - 1 }
    s.timer = setTimeout(() => this.bite(e, id, effects).catch(err => logger.error(err)), delay)
    sessions.set(id, s)

    const remain = baitCount(user, bait.id)
    const total = usableBait(user, shop)
    const warn = total === 0 ? "（鱼饵已用完，记得 #购买鱼饵）" : remain === 0 ? "（这种用完了，下一竿自动换）" : total <= 2 ? "（快用完了，记得 #购买鱼饵）" : ""
    await this.sendCast(e, [
      this.switchText(used),
      `🎣 ${name} ${pick(CAST_TEXT)}`,
      this.gearLine(user, shop),
      `🪱 ${bait.name}（剩 ${remain}）${warn}`,
      saved ? this.skillLine(user, "baitSave", "这竿没有消耗鱼饵") : "",
      this.luckLine(user),
    ].filter(Boolean).join("\n"))
    // 新称号 / 称号升级（例如钓鱼佬Ⅰ）
    await this.announceTitles(e, user)
    return true
  }

  /** 咬钩：提醒收杆，并开始“鱼跑了”计时 */
  async bite(e, id, effects) {
    const s = sessions.get(id)
    if (!s || s.stage !== "waiting") return
    const window = sec((Number(this.cfg.fishing?.reelWindow) || 15) + (effects.reelWindow || 0))
    s.stage = "bite"
    s.biteAt = Date.now()
    s.timer = setTimeout(() => this.escape(e, id).catch(err => logger.error(err)), window * 1000)
    await this.send(e, withButtons(e, `🐟 浮漂猛地一沉！有鱼上钩了！\n⏱️ ${window} 秒内发送 #收杆！`, [B.reel(e)]))
  }

  /** 超时未收杆 */
  async escape(e, id) {
    const s = sessions.get(id)
    if (!s || s.stage !== "bite") return
    sessions.delete(id)
    const user = UserData.get(id)
    const shop = Config.shop
    // 鱼钩防跑鱼：没及时收杆时，按 holdChance 概率鱼仍被钩住，照常结算
    if (holdsOnTimeout(this.effectsFor(user, baitDef(shop, s.bait)))) {
      user.stats.hookSaved = (user.stats.hookSaved || 0) + 1
      const hook = gearItem(shop, "hook", gearLevel(user, "hook"))
      return this.settle(e, id, user, s, `🪝 你没来得及收杆，但${hook?.name || "鱼钩"}牢牢钩住了它！`)
    }
    user.stats.escaped++
    // 抛竿的经验也按每日规则结算（这里不显示）
    xpParts(user, s.xpBefore ?? experience(user) - 1)
    this.startCooldown(id, user)
    UserData.save(id)
    const canUpgrade = gearLevel(user, "hook") < maxLevel(shop, "hook")
    await this.send(e, withButtons(e, [pick([
      "💨 鱼儿挣脱鱼钩跑掉了~ 下次要眼疾手快哦！",
      "💨 浮漂浮了上来……鱼已经溜走了~",
      "💨 太慢啦！鱼儿叼着鱼饵扬长而去~",
    ]), canUpgrade ? "💡 更高阶的鱼钩（#渔具商店）或强化鱼钩（#渔具工坊），没及时收杆也不容易跑鱼" : ""].filter(Boolean).join("\n"), [...fishRow(user), B.help]))
    await this.announceTitles(e, user)
  }

  /** 挂鱼饵冷却；seconds 不传时取 fishing.cooldown，称号的冷却缩减同样生效 */
  /**
   * 开始冷却；kind 为 cast（单钓，默认取 fishing.cooldown，称号的“挂鱼饵 -N 秒”生效）/ multi / hundred
   */
  startCooldown(id, user, seconds, kind = "cast") {
    const reduce = kind === "cast" ? getEffects(user, Config.titles, Config.items).cooldown || 0 : 0
    const base = seconds ?? Number(this.cfg.fishing?.cooldown ?? 10)
    const cd = Math.max(0, base - reduce)
    setCooldown(user, kind, cd)
    return cd
  }

  async reel(e) {
    if (!groupAllowed(e)) return false
    const id = String(e.user_id)
    const s = sessions.get(id)
    if (!s) return this.send(e, withButtons(e, "🤔 你还没有抛竿哦~ 发送 #钓鱼 开始吧！", fishRow(UserData.get(id))))
    if (s.stage === "multi") return this.send(e, `🎣 ${s.label || "十连"}会自动收网，稍等一下就好~`)

    clearTimeout(s.timer)
    sessions.delete(id)
    const user = UserData.get(id)
    updateNickname(user, e)

    if (s.stage === "waiting") {
      user.stats.early++
      const xpLine = xpSettlement(user, s.xpBefore ?? experience(user) - 1)
      this.startCooldown(id, user)
      UserData.save(id)
      await this.send(e, withButtons(e, pick([
        "😅 收杆太早啦，鱼饵被白白浪费……什么都没钓到~",
        "😅 太心急了！水面一片平静，鱼钩上空空如也~",
      ]) + (xpLine ? "\n" + xpLine : ""), this.branchRow(e, user), fishRow(user)))
      return this.announceTitles(e, user)
    }

    return this.settle(e, id, user, s)
  }

  /**
   * 结算一竿（#收杆，或没及时收杆但鱼钩钩住了鱼）
   * @param prefix 结果前面附加的一行提示
   */
  async settle(e, id, user, s, prefix = "") {
    const cfg = this.cfg
    const shop = Config.shop
    const effects = this.effectsFor(user, baitDef(shop, s.bait))
    const round = resolveCast(user, { items: Config.items, cfg, shop, effects, group: this.protectedGroup(e) })
    const { result, snapped, chance: snap, reward } = round
    const xpLine = xpSettlement(user, s.xpBefore ?? experience(user) - 1)
    const withPrefix = msg => {
      const wrap = t => [prefix, t, xpLine].filter(Boolean).join("\n")
      if (Array.isArray(msg)) return [wrap(msg[0]), ...msg.slice(1)]
      return wrap(msg)
    }

    // 断线：大鱼挣断鱼线跑掉
    if (snapped) {
      this.startCooldown(id, user)
      UserData.save(id)
      const r = RARITY_INFO[result.rarity] || {}
      const sizeLabel = result.size ? cfg.size?.[result.size]?.label : ""
      const line = gearItem(shop, "line", gearLevel(user, "line"))
      await this.send(e, withPrefix(withButtons(e, [
        "💥 啪！鱼线断了！",
        `${result.item.emoji} 一条【${r.label}】${result.item.name}${sizeLabel ? `（${sizeLabel}）` : ""}拖着鱼钩消失在水里……`,
        `🧵 当前鱼线：${line?.name || "—"}（本次断线概率 ${Number(snap.toFixed(1))}%）`,
        "💡 更高阶的鱼线（#渔具商店）或强化、锻造鱼线（#渔具工坊）可以降低断线概率",
      ].join("\n"), this.branchRow(e, user), fishRow(user), [B.workshop])))
      return this.announceTitles(e, user)
    }

    this.startCooldown(id, user)
    UserData.save(id)

    await this.send(e, withPrefix(this.resultMsg(e, user, result, reward, round)))
    return this.announceTitles(e, user)
  }

  /** 连钓参数（components/Batch.js，可在 config.yaml 的 fishing 中修改） */
  batchCfg(kind) {
    return batchCfg(kind, this.cfg.fishing || {})
  }

  /** 十连钓鱼：一次抛出 10 根竿，稍等片刻后自动收网统一结算 */
  async multi(e) {
    return this.batch(e, "multi")
  }

  /** 百连钓鱼：角色 25 级解锁，一次抛出 100 根竿；鱼饵、鱼护空间不够时有多少钓多少 */
  async hundred(e) {
    return this.batch(e, "hundred")
  }

  /** 千连钓鱼：角色 60 级解锁，每天 3 次，每次间隔 1 小时，一次抛出 1000 根竿 */
  async thousand(e) {
    return this.batch(e, "thousand")
  }

  async batch(e, kind) {
    if (!groupAllowed(e)) return false
    const c = this.batchCfg(kind)
    if (c.level > 1) {
      const lv = characterProgress(UserData.get(String(e.user_id))).level
      if (lv < c.level)
        return this.send(e, withButtons(e, `🔒 ${c.label}钓鱼需要角色 Lv${c.level}（当前 Lv${lv}），先用 #十连钓鱼 或 #钓鱼 升级吧~`, [B.multi, B.cast]))
    }
    const ctx = await this.precheck(e, kind)
    if (!ctx) return true
    const { id, user, name, shop, limit } = ctx

    // 每天的次数：十连先用今日次数，再用旧版攒下的额外机会；百连只有今日次数
    const used = useBatch(user, c)
    if (!used)
      return this.send(e, withButtons(e, [
        `🎟️ 今天的 ${c.daily} 次${c.label}已经用完啦~ 明天 0 点重置`,
        "🎣 #钓鱼 单次抛竿不限次数，有鱼饵就能钓",
      ].join("\n"), [B.cast]))

    const n = Math.min(c.count, usableBait(user, shop), limit - user.bag.length)
    const baits = []
    let lockNote = ""
    let baitSaved = 0
    for (let i = 0; i < n; i++) {
      const used = consumeBait(user, shop)
      if (!used) break
      if (used.reason === "locked" && !lockNote) lockNote = this.switchText(used)
      baits.push(used.bait)
      if (saveBait(user, used.bait, this.effectsFor(user, used.bait))) baitSaved++
    }
    user.stats.casts += baits.length
    addGroup(user, e.group_id)
    UserData.save(id)

    const s = { stage: "multi", kind, label: c.label, castAt: Date.now(), xpBefore: experience(user) - baits.length, baitSaved }
    const delay = triangular(...c.delay) * 1000
    s.timer = setTimeout(() => this.batchSettle(e, id, baits, c).catch(err => logger.error(err)), delay)
    sessions.set(id, s)

    // 用到的鱼饵：金丝秘饵 ×8、普通饵 ×2
    const usedCount = new Map()
    for (const b of baits) usedCount.set(b.name, (usedCount.get(b.name) || 0) + 1)
    const short = baits.length < c.count
      ? `⚠️ ${usableBait(user, shop) === 0 ? "鱼饵" : "鱼护空间"}只够钓 ${baits.length} 竿`
      : ""
    await this.sendCast(e, [
      lockNote,
      `🎣 ${name} 一字排开 ${baits.length} 根鱼竿，齐刷刷抛进了水里……`,
      short,
      this.gearLine(user, shop),
      `🪱 ${[...usedCount].map(([k, v]) => `${k} ×${v}`).join("、")}（剩余可用鱼饵 ${usableBait(user, shop)}）`,
      this.luckLine(user),
      `🎟️ 今日${c.label}剩余 ${batchLeftText(user, c)}`,
      "⏳ 稍等片刻，收网后统一结算",
    ].filter(Boolean).join("\n"))
    await this.announceTitles(e, user)
    return true
  }

  async batchSettle(e, id, baits, c = this.batchCfg("multi")) {
    const s = sessions.get(id)
    if (!s || s.stage !== "multi") return
    sessions.delete(id)
    const user = UserData.get(id)
    const cfg = this.cfg
    const shop = Config.shop
    // 百连降低保护鱼类出现概率；误钓后禁渔，后面的竿作废（鱼饵不退）
    const extra = { protectedScale: protectedScaleFor(c, cfg.probability) }
    const group = this.protectedGroup(e)
    const rounds = withExtras(baits.map(bait => resolveCast(user, { items: Config.items, cfg, shop, effects: { ...this.effectsFor(user, bait), ...extra }, group })))
    // 两次之间的最短间隔（防刷屏）
    const cd = this.startCooldown(id, user, c.cooldown, c.kind)
    UserData.save(id)

    const sum = summarize(rounds)
    const parts = xpParts(user, s.xpBefore ?? experience(user) - baits.length)
    const xpLine = parts.xp
    const petLines = [...parts.pet, petProcLine(rounds, s.baitSaved)].filter(Boolean)
    const markdown = e.bot?.adapter?.id === "QQBot"
    const sizeLabels = Object.fromEntries(Object.entries(cfg.size || {}).map(([k, v]) => [k, v.label]))
    const body = c.kind !== "multi"
      ? formatHundred(rounds, { markdown, xpLine, petLines, title: `${c.emoji} ${c.label}收网`, sellBonus: sellBonusOf(user) })
      : formatMulti(rounds, { sizeLabels, markdown, xpLine, petLines, sellBonus: sellBonusOf(user) })
    const msg = body + `\n🎟️ 剩余${c.label}：${batchLeftText(user, c)}` + (cd ? `\n⏳ 冷却：${cooldownText(cd)}` : "")
    await this.send(e, withButtons(e, msg,
      this.branchRow(e, user),
      fishRow(user, { short: true }),
      [{ ...B.bag, text: "🎒 鱼护" }, { ...B.sellAll, text: "💰 出售" }, ...(sum.junk ? [{ ...B.discard, text: "♻️ 清理" }] : [])]))
    await this.announceTitles(e, user)
  }

  resultMsg(e, user, result, reward, round = {}) {
    // 宠物等待选择进化方向时，在按钮最上面加一行方向按钮
    const branch = this.branchRow(e, user)
    const withButtons = (e, msg, ...rows) => withButtonsBase(e, msg, branch, ...rows)
    if (result.type === "empty") {
      return withButtons(e, pick([
        "🎣 收杆……什么都没钓到~ 🌊",
        "🎣 收杆……鱼钩上只挂着一根水草~ 🌿",
        "🎣 收杆……鱼饵被偷吃了，什么都没钓到~",
      ]), fishRow(user), [B.bag])
    }
    const { item } = result
    const r = RARITY_INFO[item.rarity] || {}

    // 保护鱼类：放生，钓鱼人被警察带走（禁渔 + 罚款）
    if (item.special === "protected") {
      const p = round.penalty || {}
      const until = p.banUntil ? new Date(p.banUntil) : null
      const hm = until ? `${String(until.getHours()).padStart(2, "0")}:${String(until.getMinutes()).padStart(2, "0")}` : ""
      return withButtons(e, [
        `🚫 糟糕！钓上来的是国家保护鱼类——${item.emoji}【${r.label}】${item.name}`,
        "━━━━━━━━━━━━",
        `💬 ${item.intro || item.desc}`,
        `🕊️ ${item.name}已经被放生回水里了`,
        `🚔 闻讯赶来的警察把你带走了，禁渔 ${p.minutes ?? 0} 分钟${hm ? `（${hm} 解禁）` : ""}`,
        ...(p.fine ? [`⚖️ 罚款 ${p.fine} 金币`] : []),
        ...(p.group ? [`📅 本群今日已钓到保护鱼类 ${p.group}${p.groupMax ? `/${p.groupMax}` : ""} 条${p.groupMax && p.group >= p.groupMax ? "，今天本群不会再钓到了" : ""}`] : []),
        `👛 当前金币：${user.gold}`,
      ].join("\n"), [{ text: `📖 了解${item.name}`, callback: `#钓鱼图鉴 ${item.name}` }, B.bag])
    }

    // 派蒙：第一次送称号，之后送谢礼
    if (item.special === "paimon") {
      return withButtons(e, round.paimon?.first ? [
        `🧚 水面漂上来一个小家伙……${item.emoji}【${r.label}】${item.name}`,
        "💬 “才不是应急食品！”",
        "✨ 派蒙决定以后跟着你一起钓鱼冒险！",
      ].join("\n") : [
        `🧚 又是派蒙！它从水里冒出来跟你打了个招呼`,
        `🎁 派蒙送了你 ${round.paimon?.gift ?? 0} 金币作为谢礼`,
        `👛 当前金币：${user.gold}`,
      ].join("\n"), fishRow(user), [B.titles])
    }

    if (item.special === "police") {
      return withButtons(e, [
        "🚨 你钓上来一个……不对劲的东西",
        "━━━━━━━━━━━━",
        `${item.emoji} 【${r.label}】${item.name}`,
        "你颤抖着拨打了 110……",
        "👮 警方已到场处理，感谢你的配合！",
        `🏅 获得「见义勇为」奖励：${reward} 金币`,
        "━━━━━━━━━━━━",
        `💰 当前金币：${user.gold}`,
      ].join("\n"), fishRow(user), [B.titles])
    }

    if (item.rarity === "junk") {
      return withButtons(e, [
        "🎣 收杆！",
        `${item.emoji} 【垃圾】${item.name}`,
        `💬 ${item.desc || "海洋垃圾"}`,
        "💰 价值：0 金币（已收进鱼护，可发送 #回收垃圾 统一回收）",
      ].join("\n"), fishRow(user), [B.discard])
    }

    const sizeLabel = result.size ? (Config.config.size?.[result.size]?.label || "") : ""
    const lines = [
      item.rarity === "MR" ? "🌌 天地变色！神话中的存在被你钓了上来！" :
        item.rarity === "EP" ? "🔥 水面翻起巨浪！史诗级的生物上钩了！" :
          item.rarity === "hidden" ? "✨✨ 海面泛起了奇异的蓝光…… ✨✨" :
            item.rarity === "UR" ? "🌟 鱼竿弯成了满月！传说级的大家伙！" : "🎣 收杆！",
      "━━━━━━━━━━━━",
      `${item.emoji} 【${r.label}】${item.name}${sizeLabel ? `（${sizeLabel}）` : ""}${result.weight != null ? `  ${formatWeight(result.weight)}` : ""}`,
      `💰 价值：${result.price} 金币`,
      round.pet?.up ? this.skillLine(user, "rarityUp", `品级从【${RARITY_INFO[round.pet.up]?.label || round.pet.up}】提升到了【${r.label}】！`) : "",
      round.pet?.mult ? this.skillLine(user, round.pet.mult === 3 ? "triplePrice" : "doublePrice", `鱼价 ×${round.pet.mult}！`) : "",
      ...(round.extras || []).map(x => this.skillLine(user, round.extras.length > 1 ? "extraFish2" : "extraFish",
        `多钓了一条 ${x.result.item.emoji}【${RARITY_INFO[x.result.rarity]?.label || ""}】${x.result.item.name}${x.result.size ? `（${Config.config.size?.[x.result.size]?.label || ""}）` : ""} ${x.value} 金币`)),
      item.desc ? `💬 ${item.desc}` : "",
      "━━━━━━━━━━━━",
      "已放入鱼护，发送 #我的鱼护 查看",
    ].filter(Boolean)
    return withButtons(e, lines.join("\n"), fishRow(user), [B.bag, B.sellAll])
  }

  async announceTitles(e, user) {
    const got = checkTitles(user, Config.titles, Config.items)
    if (!got.length) return true
    UserData.save(user.user_id)
    await e.reply(withButtons(e, titleUpText(got, displayName(user)), [B.titles]))
    return true
  }
}
