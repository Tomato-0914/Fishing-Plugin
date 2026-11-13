import fs from "node:fs"
import path from "node:path"
import { plugin } from "../components/yunzai.js"
import { Plugin_Path } from "../components/Paths.js"
import Config from "../components/Config.js"
import UserData from "../components/UserData.js"
import { triangular, formatWeight, RARITY_INFO } from "../components/ItemPool.js"
import { multiLeft, useMulti, grantMultiTicket, addGroup, welcome, isNewPlayer, reliefBait, todayLuck, luckTier, luckEffects } from "../components/Game.js"
import { consumeBait, totalBait, usableBait, baitLevel, baitCount, baitDef, gearEffects, gearItem, gearLevel, bagCapacity, allEffects, holdsOnTimeout, maxLevel, multiTicketChance } from "../components/Gear.js"
import { resolveCast, summarize, formatMulti } from "../components/Catch.js"
import { checkTitles, getEffects, effectText, titleUpText } from "../components/Titles.js"
import { withButtons, B } from "../components/Button.js"
import { equipmentEffects } from "../components/Equipment.js"
import { groupAllowed, displayName, updateNickname, pick, itemMap } from "../components/common.js"

/** 进行中的钓鱼：user_id → { stage: "waiting" | "bite" | "multi", timer, castAt, biteAt } */
const sessions = new Map()
/** 挂鱼饵冷却：user_id → 结束时间戳 */
const cooldowns = new Map()

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

/** 抛竿配图：按路径缓存为 Buffer（各协议都支持），文件变化时重新读取 */
const castImageCache = new Map()
function castImage(file) {
  if (!file || typeof segment?.image !== "function") return null
  const abs = path.isAbsolute(file) ? file : path.join(Plugin_Path, file)
  let stat
  try { stat = fs.statSync(abs) } catch { return null }
  const hit = castImageCache.get(abs)
  if (!hit || hit.mtime !== stat.mtimeMs) {
    try {
      castImageCache.set(abs, { mtime: stat.mtimeMs, buf: fs.readFileSync(abs) })
    } catch (err) {
      logger.warn(`[Fishing-Plugin] 抛竿配图读取失败：${err.message}`)
      return null
    }
  }
  return segment.image(castImageCache.get(abs).buf)
}

export class Fishing extends plugin {
  constructor() {
    super({
      name: "钓鱼",
      dsc: "钓鱼小游戏：抛竿 / 收杆",
      event: "message",
      priority: 500,
      rule: [
        { reg: /^(#?(钓鱼|抛竿|甩竿)|🎣)$/, fnc: "cast" },
        { reg: /^#?(收杆|拉杆|起竿)$/, fnc: "reel" },
        { reg: /^#?十连钓鱼$/, fnc: "multi" },
      ],
    })
  }

  get cfg() {
    return Config.config
  }

  /** 本竿的全部效果：称号 + 今日幸运 + 渔具 + 本竿鱼饵 */
  effectsFor(user, bait) {
    return allEffects({
      titles: getEffects(user, Config.titles, Config.items),
      luck: luckEffects(user, this.cfg.checkin?.tiers),
      gear: { ...gearEffects(user, Config.shop), ...Object.fromEntries(Object.entries(equipmentEffects(user)).map(([k, v]) => [k, (gearEffects(user, Config.shop)[k] || 0) + v])) },
      bait: bait?.effects,
    })
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
  async precheck(e) {
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
        "🏪 鱼饵在 #鱼饵商店 购买，攒了金币可以去 #渔具工坊 升级渔具",
      ].join("\n"))
    }

    const session = sessions.get(id)
    if (session) {
      if (session.stage === "multi") { await this.send(e, "🎣 十连的鱼竿还在水里，正在收网，稍等一下~"); return null }
      if (session.stage === "bite") { await this.send(e, withButtons(e, "🐟 浮漂正在剧烈抖动！快发送 #收杆！", [B.reel(e)])); return null }
      await this.send(e, pick(WAITING_TEXT))
      return null
    }

    // 误钓保护动物后禁渔
    const ban = (Number(user.banUntil) || 0) - Date.now()
    if (ban > 0) {
      const until = new Date(user.banUntil)
      const hm = `${String(until.getHours()).padStart(2, "0")}:${String(until.getMinutes()).padStart(2, "0")}`
      await this.send(e, `🚫 你误钓了保护动物，正在禁渔中~\n⏳ 还剩 ${Math.ceil(ban / 60000)} 分钟（${hm} 解禁）`)
      return null
    }

    const left = (cooldowns.get(id) || 0) - Date.now()
    if (left > 0) { await this.send(e, `${pick(BAIT_TEXT)}请等待 ${Math.ceil(left / 1000)}s...`); return null }

    const shop = Config.shop
    const limit = bagCapacity(user, shop, fcfg.bagLimit)
    if (user.bag.length >= limit) {
      await this.send(e, withButtons(e, `🎒 鱼护已经装满啦（${user.bag.length}/${limit}）~\n先出售鱼护里的鱼或清理垃圾再来吧！也可以去 #渔具工坊 升级鱼护`, [B.sellAll, B.discard], [B.bag, B.workshop]))
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
          locked ? "💡 把任意一件渔具升到鱼饵的等级就能用了（#渔具工坊）" : "",
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
    const line = ["rod", "line", "hook", "float"].map(k => gearItem(shop, k, gearLevel(user, k))?.name).filter(Boolean).join(" · ")
    return line ? `🧰 ${line}` : ""
  }

  luckLine(user) {
    const tier = luckTier(todayLuck(user), this.cfg.checkin?.tiers)
    return tier ? `${tier.emoji} 今日运势：${tier.name}（幸运值 ${todayLuck(user)}）` : ""
  }

  /**
   * 发送抛竿消息：配图放在文字上面，和文字合成一条消息
   * QQBot 需开启适配器的 markdownImage：图片转为 Markdown 图片才能按顺序排版；
   * 未开启时 QQ 客户端会把文字排在图片上方，只能先单独发图片
   */
  async sendCast(e, text, file = this.cfg.fishing?.castImage) {
    const img = castImage(file)
    if (!img) return this.send(e, text)
    if (e.bot?.adapter?.id === "QQBot" && e.bot.adapter.config?.markdownImage !== true) {
      await e.reply(img)
      return this.send(e, text)
    }
    return this.send(e, [img, "\n", text])
  }

  async cast(e) {
    if (!groupAllowed(e)) return false
    const ctx = await this.precheck(e)
    if (!ctx) return true
    const { id, user, name, fcfg, shop } = ctx

    const used = consumeBait(user, shop)
    const bait = used.bait
    const effects = this.effectsFor(user, bait)
    const biteMin = Math.max(1, Number(fcfg.biteMin) || 3)
    const biteMax = Math.min(30, Math.max(biteMin, Number(fcfg.biteMax) || 18))
    const delay = Math.max(2, triangular(biteMin, biteMax) - (effects.biteReduce || 0)) * 1000

    user.stats.casts++
    addGroup(user, e.group_id)
    UserData.save(id)

    const s = { stage: "waiting", castAt: Date.now(), bait: bait.id }
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
    this.startCooldown(id, user)
    UserData.save(id)
    const canUpgrade = gearLevel(user, "hook") < maxLevel(shop, "hook")
    await this.send(e, withButtons(e, [pick([
      "💨 鱼儿挣脱鱼钩跑掉了~ 下次要眼疾手快哦！",
      "💨 浮漂浮了上来……鱼已经溜走了~",
      "💨 太慢啦！鱼儿叼着鱼饵扬长而去~",
    ]), canUpgrade ? "💡 去 #渔具工坊 升级鱼钩，没及时收杆也不容易跑鱼" : ""].filter(Boolean).join("\n"), [B.cast, B.multi, B.help]))
    await this.announceTitles(e, user)
  }

  /** 挂鱼饵冷却；seconds 不传时取 fishing.cooldown，称号的冷却缩减同样生效 */
  startCooldown(id, user, seconds) {
    const effects = getEffects(user, Config.titles, Config.items)
    const base = seconds ?? Number(this.cfg.fishing?.cooldown ?? 10)
    const cd = Math.max(0, base - (effects.cooldown || 0))
    if (cd > 0) cooldowns.set(id, Date.now() + cd * 1000)
    else cooldowns.delete(id)
    return cd
  }

  async reel(e) {
    if (!groupAllowed(e)) return false
    const id = String(e.user_id)
    const s = sessions.get(id)
    if (!s) return this.send(e, withButtons(e, "🤔 你还没有抛竿哦~ 发送 #钓鱼 开始吧！", [B.start, B.multi]))
    if (s.stage === "multi") return this.send(e, "🎣 十连会自动收网，稍等一下就好~")

    clearTimeout(s.timer)
    sessions.delete(id)
    const user = UserData.get(id)
    updateNickname(user, e)

    if (s.stage === "waiting") {
      user.stats.early++
      this.startCooldown(id, user)
      UserData.save(id)
      await this.send(e, withButtons(e, pick([
        "😅 收杆太早啦，鱼饵被白白浪费……什么都没钓到~",
        "😅 太心急了！水面一片平静，鱼钩上空空如也~",
      ]), [B.cast, B.multi]))
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
    const round = resolveCast(user, { items: Config.items, cfg, shop, effects })
    const { result, snapped, chance: snap, reward } = round
    // 单次钓鱼有概率额外获得 1 次十连机会（鱼钩提高概率）；误钓保护动物时没有
    let suffix = ""
    const ticketChance = multiTicketChance(cfg.fishing?.multiTicketChance ?? 2, effects)
    if (!round.penalty && ticketChance > 0 && Math.random() * 100 < ticketChance && grantMultiTicket(user, cfg.fishing?.multiBonusMax ?? 50))
      suffix = `🎟️ 运气不错！获得 1 次额外十连机会（现有 ${user.multi.bonus} 次）`
    const withPrefix = msg => {
      const wrap = t => [prefix, t, suffix].filter(Boolean).join("\n")
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
        "💡 去 #渔具工坊 升级鱼线可以降低断线概率",
      ].join("\n"), [B.cast, B.multi], [B.workshop])))
      return this.announceTitles(e, user)
    }

    this.startCooldown(id, user)
    UserData.save(id)

    await this.send(e, withPrefix(this.resultMsg(e, user, result, reward, round)))
    return this.announceTitles(e, user)
  }

  /** 十连钓鱼：一次抛出多根竿，稍等片刻后自动收网统一结算 */
  async multi(e) {
    if (!groupAllowed(e)) return false
    const ctx = await this.precheck(e)
    if (!ctx) return true
    const { id, user, name, fcfg, shop, limit } = ctx

    // 每天的十连次数：先用今日次数，再用单钓攒下的额外机会
    const daily = Number(fcfg.multiDaily ?? 10)
    const left = multiLeft(user, daily)
    if (left.free + left.bonus < 1) {
      const chance = multiTicketChance(fcfg.multiTicketChance ?? 2, gearEffects(user, shop))
      return this.send(e, withButtons(e, [
        `🎟️ 今天的 ${daily} 次十连已经用完啦~`,
        `🎣 单次钓鱼有 ${Number(chance.toFixed(2))}% 的概率额外获得 1 次十连机会`,
        "💡 升级鱼钩可以提高这个概率，明天 0 点十连次数会重置",
      ].join("\n"), [B.cast]))
    }
    useMulti(user, daily)
    const after = multiLeft(user, daily)

    const want = Math.max(1, Math.floor(Number(fcfg.multiCount) || 10))
    const n = Math.min(want, usableBait(user, shop), limit - user.bag.length)
    const baits = []
    let lockNote = ""
    for (let i = 0; i < n; i++) {
      const used = consumeBait(user, shop)
      if (!used) break
      if (used.reason === "locked" && !lockNote) lockNote = this.switchText(used)
      baits.push(used.bait)
    }
    user.stats.casts += baits.length
    addGroup(user, e.group_id)
    UserData.save(id)

    const s = { stage: "multi", castAt: Date.now() }
    const delay = triangular(3, 8) * 1000
    s.timer = setTimeout(() => this.multiSettle(e, id, baits).catch(err => logger.error(err)), delay)
    sessions.set(id, s)

    // 用到的鱼饵：金丝秘饵 ×8、普通饵 ×2
    const usedCount = new Map()
    for (const b of baits) usedCount.set(b.name, (usedCount.get(b.name) || 0) + 1)
    const short = baits.length < want
      ? `⚠️ ${usableBait(user, shop) === 0 ? "鱼饵" : "鱼护空间"}只够钓 ${baits.length} 竿`
      : ""
    await this.sendCast(e, [
      lockNote,
      `🎣 ${name} 一字排开 ${baits.length} 根鱼竿，齐刷刷抛进了水里……`,
      short,
      this.gearLine(user, shop),
      `🪱 ${[...usedCount].map(([k, v]) => `${k} ×${v}`).join("、")}（剩余可用鱼饵 ${usableBait(user, shop)}）`,
      this.luckLine(user),
      `🎟️ 今日十连剩余 ${after.free} 次${after.bonus ? `（另有额外机会 ${after.bonus} 次）` : ""}`,
      "⏳ 稍等片刻，收网后统一结算",
    ].filter(Boolean).join("\n"), fcfg.multiImage)
    await this.announceTitles(e, user)
    return true
  }

  async multiSettle(e, id, baits) {
    const s = sessions.get(id)
    if (!s || s.stage !== "multi") return
    sessions.delete(id)
    const user = UserData.get(id)
    const cfg = this.cfg
    const shop = Config.shop
    const rounds = baits.map(bait => resolveCast(user, { items: Config.items, cfg, shop, effects: this.effectsFor(user, bait) }))
    // 两次十连之间的最短间隔（防刷屏）
    const cd = this.startCooldown(id, user, Number(cfg.fishing?.multiCooldown ?? 30))
    UserData.save(id)

    const sum = summarize(rounds)
    const sizeLabels = Object.fromEntries(Object.entries(cfg.size || {}).map(([k, v]) => [k, v.label]))
    // QQBot 的文字按 Markdown 渲染：钓获放进引用块；其他协议用纯文本
    const left = multiLeft(user, Number(cfg.fishing?.multiDaily ?? 10))
    const msg = formatMulti(rounds, { sizeLabels, markdown: e.bot?.adapter?.id === "QQBot" }) +
      `\n🎟️ 今日十连剩余 ${left.free} 次${left.bonus ? ` · 额外 ${left.bonus} 次` : ""}${cd ? ` · ⏳ ${cd} 秒后可再钓` : ""}`
    await this.send(e, withButtons(e, msg,
      [B.multi, B.fish],
      [B.bag, B.sellAll, ...(sum.junk ? [B.discard] : [])]))
    await this.announceTitles(e, user)
  }

  resultMsg(e, user, result, reward, round = {}) {
    if (result.type === "empty") {
      return withButtons(e, pick([
        "🎣 收杆……什么都没钓到~ 🌊",
        "🎣 收杆……鱼钩上只挂着一根水草~ 🌿",
        "🎣 收杆……鱼饵被偷吃了，什么都没钓到~",
      ]), [B.cast, B.multi], [B.bag])
    }
    const { item } = result
    const r = RARITY_INFO[item.rarity] || {}

    // 保护动物：放生 + 处罚
    if (item.special === "protected") {
      const p = round.penalty || {}
      const until = p.banUntil ? new Date(p.banUntil) : null
      const hm = until ? `${String(until.getHours()).padStart(2, "0")}:${String(until.getMinutes()).padStart(2, "0")}` : ""
      return withButtons(e, [
        `🚫 糟糕！钓上来的是国家保护动物——${item.emoji}【${r.label}】${item.name}`,
        "━━━━━━━━━━━━",
        `💬 ${item.intro || item.desc}`,
        "🕊️ 已经小心地把它放回水里了",
        `⚖️ 处罚：罚款 ${p.fine ?? 0} 金币，禁渔 ${p.minutes ?? 0} 分钟${hm ? `（${hm} 解禁）` : ""}`,
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
      ].join("\n"), [B.cast, B.multi], [B.titles])
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
      ].join("\n"), [B.cast, B.multi], [B.titles])
    }

    if (item.rarity === "junk") {
      return withButtons(e, [
        "🎣 收杆！",
        `${item.emoji} 【垃圾】${item.name}`,
        `💬 ${item.desc || "海洋垃圾"}`,
        "💰 价值：0 金币（已收进鱼护，可发送 #清理垃圾 统一回收）",
      ].join("\n"), [B.cast, B.multi], [B.discard])
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
      item.desc ? `💬 ${item.desc}` : "",
      "━━━━━━━━━━━━",
      "已放入鱼护，发送 #我的鱼护 查看",
    ].filter(Boolean)
    return withButtons(e, lines.join("\n"), [B.cast, B.multi], [B.bag, B.sellAll])
  }

  async announceTitles(e, user) {
    const got = checkTitles(user, Config.titles, Config.items)
    if (!got.length) return true
    UserData.save(user.user_id)
    await e.reply(withButtons(e, titleUpText(got, displayName(user)), [B.titles]))
    return true
  }
}
