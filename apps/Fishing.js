import fs from "node:fs"
import path from "node:path"
import { plugin } from "../components/yunzai.js"
import { Plugin_Path } from "../components/Paths.js"
import Config from "../components/Config.js"
import UserData from "../components/UserData.js"
import { roll, triangular, formatWeight, RARITY_INFO } from "../components/ItemPool.js"
import { recordResult, addGroup, welcome, isNewPlayer, reliefBait, todayLuck, luckTier, luckEffects } from "../components/Game.js"
import { consumeBait, totalBait, baitCount, baitDef, gearEffects, gearItem, gearLevel, bagCapacity, breakChance, allEffects } from "../components/Gear.js"
import { checkTitles, getEffects, effectText } from "../components/Titles.js"
import { withButtons, B } from "../components/Button.js"
import { groupAllowed, displayName, updateNickname, pick, itemMap } from "../components/common.js"

/** 进行中的钓鱼：user_id → { stage: "waiting" | "bite", timer, castAt, biteAt, deadline } */
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

/** 抛竿配图：读一次缓存为 Buffer（各协议都支持），配置的路径或文件变化时重新读取 */
const castImageCache = { key: "", buf: null }
function castImage(file) {
  if (!file || typeof segment?.image !== "function") return null
  const abs = path.isAbsolute(file) ? file : path.join(Plugin_Path, file)
  let stat
  try { stat = fs.statSync(abs) } catch { return null }
  const key = `${abs}|${stat.mtimeMs}`
  if (castImageCache.key !== key) {
    try {
      castImageCache.buf = fs.readFileSync(abs)
      castImageCache.key = key
    } catch (err) {
      logger.warn(`[Fishing-Plugin] 抛竿配图读取失败：${err.message}`)
      return null
    }
  }
  return segment.image(castImageCache.buf)
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
      ],
    })
  }

  get cfg() {
    return Config.config
  }

  /** 本竿的全部效果：称号 + 今日幸运 + 渔具 + 本竿鱼饵 */
  effectsFor(user, bait) {
    return allEffects({
      titles: getEffects(user, Config.titles),
      luck: luckEffects(user, this.cfg.checkin?.tiers),
      gear: gearEffects(user, Config.shop),
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
    // @ 放在第一段文字前（前面有图片时排在图片之后）
    const idx = list.findIndex(m => typeof m === "string")
    if (idx < 0) list.unshift(segment.at(e.user_id))
    else list.splice(idx, 1, segment.at(e.user_id), `\n${list[idx]}`)
    return e.reply(list)
  }

  async cast(e) {
    if (!groupAllowed(e)) return false
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
        "🏪 鱼饵在 #渔具商店 购买，攒了金币可以去 #渔具工坊 升级渔具",
      ].join("\n"))
    }

    const session = sessions.get(id)
    if (session) {
      if (session.stage === "bite")
        return this.send(e, withButtons(e, "🐟 浮漂正在剧烈抖动！快发送 #收杆！", [B.reel(e)]))
      return this.send(e, pick(WAITING_TEXT))
    }

    const left = (cooldowns.get(id) || 0) - Date.now()
    if (left > 0) return this.send(e, `${pick(BAIT_TEXT)}请等待 ${Math.ceil(left / 1000)}s...`)

    const shop = Config.shop
    const limit = bagCapacity(user, shop, fcfg.bagLimit)
    if (user.bag.length >= limit)
      return this.send(e, withButtons(e, `🎒 鱼护已经装满啦（${user.bag.length}/${limit}）~\n先出售鱼护里的鱼或清理垃圾再来吧！也可以去 #渔具工坊 升级鱼护`, [B.sellAll, B.discard], [B.bag, B.workshop]))

    if (totalBait(user) < 1) {
      const items = itemMap()
      const hasSellable = user.bag.some(x => items.get(x.id)?.rarity !== "junk")
      const relief = reliefBait(user, { amount: bcfg.relief, price, hasSellable })
      if (relief) {
        UserData.save(id)
        await this.send(e, `🎁 看你两手空空，钓鱼协会送了你 ${relief} 个鱼饵，继续加油吧！（每天限领一次）`)
      } else {
        const tips = [`🪱 鱼饵用完啦~`, `普通饵 ${price} 金币/个，发送 #购买鱼饵 [种类] [数量] 补充`, `👛 当前金币：${user.gold}`]
        if (user.gold < price && hasSellable) tips.push("💡 金币不够？先 #一键出售 卖掉鱼护里的鱼吧")
        return this.send(e, withButtons(e, tips.join("\n"),
          user.gold < price && hasSellable ? [B.sellAll, B.bag] : [B.buyBait, B.buyBaitInput, B.shop]))
      }
    }

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

    const tier = luckTier(todayLuck(user), Config.config.checkin?.tiers)
    const luckLine = tier ? `\n${tier.emoji} 今日运势：${tier.name}（幸运值 ${todayLuck(user)}）` : ""
    const remain = baitCount(user, bait.id)
    const total = totalBait(user)
    const warn = total === 0 ? "（鱼饵已用完，记得 #购买鱼饵）" : remain === 0 ? "（这种用完了，下一竿自动换）" : total <= 2 ? "（快用完了，记得 #购买鱼饵）" : ""
    const gearLine = ["rod", "line", "float"].map(k => gearItem(shop, k, gearLevel(user, k))?.name).filter(Boolean).join(" · ")
    const text = [
      used.switched ? `🔄 ${used.from.name}用完了，已自动换成${bait.name}` : "",
      `🎣 ${name} ${pick(CAST_TEXT)}`,
      gearLine ? `🧰 ${gearLine}` : "",
      `🪱 ${bait.name}（剩 ${remain}）${warn}`,
    ].filter(Boolean).join("\n") + luckLine
    // 配图放在文字上面。QQBot 的图文消息由 QQ 客户端排版，文字总在图片上方，所以单独先发图片
    const img = castImage(fcfg.castImage)
    if (img && e.bot?.adapter?.id === "QQBot") {
      await e.reply(img)
      await this.send(e, text)
    } else {
      await this.send(e, img ? [img, text] : text)
    }
    // 新称号（例如初出茅庐）
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
    user.stats.escaped++
    this.startCooldown(id, user)
    UserData.save(id)
    await this.send(e, withButtons(e, pick([
      "💨 鱼儿挣脱鱼钩跑掉了~ 下次要眼疾手快哦！",
      "💨 浮漂浮了上来……鱼已经溜走了~",
      "💨 太慢啦！鱼儿叼着鱼饵扬长而去~",
    ]), [B.cast, B.help]))
    await this.announceTitles(e, user)
  }

  startCooldown(id, user) {
    const effects = getEffects(user, Config.titles)
    const cd = Math.max(0, Number(this.cfg.fishing?.cooldown ?? 10) - (effects.cooldown || 0))
    if (cd > 0) cooldowns.set(id, Date.now() + cd * 1000)
    else cooldowns.delete(id)
  }

  async reel(e) {
    if (!groupAllowed(e)) return false
    const id = String(e.user_id)
    const s = sessions.get(id)
    if (!s) return this.send(e, withButtons(e, "🤔 你还没有抛竿哦~ 发送 #钓鱼 开始吧！", [B.start]))

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
      ]), [B.cast]))
      return this.announceTitles(e, user)
    }

    const cfg = this.cfg
    const shop = Config.shop
    const effects = this.effectsFor(user, baitDef(shop, s.bait))
    const result = roll({ items: Config.items, probability: cfg.probability, size: cfg.size, limits: cfg.limits }, effects)

    // 断线：大鱼可能挣断鱼线跑掉
    const snap = breakChance(result, shop?.lineBreak, effects)
    if (snap > 0 && Math.random() * 100 < snap) {
      user.stats.escaped++
      user.stats.lineBreak = (user.stats.lineBreak || 0) + 1
      this.startCooldown(id, user)
      UserData.save(id)
      const r = RARITY_INFO[result.rarity] || {}
      const sizeLabel = result.size ? cfg.size?.[result.size]?.label : ""
      const line = gearItem(shop, "line", gearLevel(user, "line"))
      await this.send(e, withButtons(e, [
        "💥 啪！鱼线断了！",
        `${result.item.emoji} 一条【${r.label}】${result.item.name}${sizeLabel ? `（${sizeLabel}）` : ""}拖着鱼钩消失在水里……`,
        `🧵 当前鱼线：${line?.name || "—"}（本次断线概率 ${Number(snap.toFixed(1))}%）`,
        "💡 去 #渔具工坊 升级鱼线可以降低断线概率",
      ].join("\n"), [B.cast, B.workshop]))
      return this.announceTitles(e, user)
    }

    const { reward } = recordResult(user, result, { policeReward: cfg.policeReward })
    this.startCooldown(id, user)
    UserData.save(id)

    await this.send(e, this.resultMsg(e, user, result, reward))
    return this.announceTitles(e, user)
  }

  resultMsg(e, user, result, reward) {
    if (result.type === "empty") {
      return withButtons(e, pick([
        "🎣 收杆……什么都没钓到~ 🌊",
        "🎣 收杆……鱼钩上只挂着一根水草~ 🌿",
        "🎣 收杆……鱼饵被偷吃了，什么都没钓到~",
      ]), [B.cast, B.bag])
    }
    const { item } = result
    const r = RARITY_INFO[item.rarity] || {}

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
      ].join("\n"), [B.cast, B.titles])
    }

    if (item.rarity === "junk") {
      return withButtons(e, [
        "🎣 收杆！",
        `${item.emoji} 【垃圾】${item.name}`,
        `💬 ${item.desc || "海洋垃圾"}`,
        "💰 价值：0 金币（已收进鱼护，可发送 #清理垃圾 统一回收）",
      ].join("\n"), [B.discard, B.cast])
    }

    const sizeLabel = result.size ? (Config.config.size?.[result.size]?.label || "") : ""
    const lines = [
      item.rarity === "hidden" ? "✨✨ 海面泛起了奇异的蓝光…… ✨✨" : item.rarity === "UR" ? "🌟 鱼竿弯成了满月！传说级的大家伙！" : "🎣 收杆！",
      "━━━━━━━━━━━━",
      `${item.emoji} 【${r.label}】${item.name}${sizeLabel ? `（${sizeLabel}）` : ""}${result.weight != null ? `  ${formatWeight(result.weight)}` : ""}`,
      `💰 价值：${result.price} 金币`,
      item.desc ? `💬 ${item.desc}` : "",
      "━━━━━━━━━━━━",
      "已放入鱼护，发送 #我的鱼护 查看",
    ].filter(Boolean)
    return withButtons(e, lines.join("\n"), [B.cast, B.bag, B.sellAll])
  }

  async announceTitles(e, user) {
    const got = checkTitles(user, Config.titles, Config.items)
    if (!got.length) return true
    UserData.save(user.user_id)
    const text = got.map(t => `🏅 恭喜 ${displayName(user)} 获得称号【${t.emoji} ${t.name}】\n✨ 效果：${effectText(t.effects)}`).join("\n\n")
    await e.reply(withButtons(e, text, [B.titles]))
    return true
  }
}
