/** 渔具工坊 V2：按阶位购买、穿戴、强化和锻造；保留鱼饵商店。 */
import { plugin, puppeteer } from "../components/yunzai.js"
import Config from "../components/Config.js"
import UserData from "../components/UserData.js"
import { effectText, getEffects, mergeEffects } from "../components/Titles.js"
import { oddsPercent } from "../components/ItemPool.js"
import { luckEffects } from "../components/Game.js"
import { SLOTS, UPGRADE_NAMES, SLOT_NAMES, TIER_NAMES, levelColor, gearLevel, gearItem, maxLevel, gearEffects, bagCapacity, baitList, findBait, baitPrice, baitCount, totalBait, currentBait, buyBait, useBait, baitLevel, canUseBait, maxGearLevel, unlockedTier, tierPrice, ownedGear, ensureGear, buyGear, equipGear, cultivateGear, enhanceCost, forgeCost, successRate } from "../components/Gear.js"
import { withButtons, B } from "../components/Button.js"
import { renderOrText } from "../components/Render.js"
import { groupAllowed, updateNickname, displayName } from "../components/common.js"

export class FishingShop extends plugin {
  constructor() {
    super({name:"钓鱼-渔具工坊与商店",dsc:"渔具购买、穿戴、强化、锻造和鱼饵商店",event:"message",priority:500,rule:[
      {reg:/^#?购买渔具$/,fnc:"workshop"},
      {reg:/^#?购买渔具\\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护)\\s*(\\d{1,2})$/,fnc:"purchase"},
      {reg:/^#?装备渔具\\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护)\\s*(\\d{1,2})$/,fnc:"equip"},
      {reg:/^#?渔具升级\\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护)$/,fnc:"upgrade"},
      {reg:/^#?渔具强化\\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护)(?:\\s*(\\d{1,2}))?$/,fnc:"enhance"},
      {reg:/^#?渔具锻造\\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护)(?:\\s*(\\d{1,2}))?$/,fnc:"forge"},
      {reg:/^#?鱼饵商店$/,fnc:"shop"},
      {reg:/^#?购买鱼饵\\s*(.*)$/,fnc:"buy"},
      {reg:/^#?使用鱼饵\\s*(.+)$/,fnc:"use"},
      {reg:/^#?我的鱼饵$/,fnc:"bait"},
      {reg:/^#?我的渔具$/,fnc:"gear"}
    ]})
  }
  get shopCfg(){return Config.shop||{}}
  get baitCfg(){return Config.config.bait||{}}
  load(e){const user=UserData.get(e.user_id);updateNickname(user,e);ensureGear(user);return user}
  gearText(item,user){if(!item)return "";const tier=item.level;const data=ownedGear(user,item.slot,tier);return `强化 +${data?.enhance||0}/15 · 锻造 +${data?.forge||0}/8`}
  async workshop(e) {
    if(!groupAllowed(e))return false
    const user=this.load(e),top=unlockedTier(user),shop=this.shopCfg
    const lines=[`🔧 渔具工坊 · 角色可购买最高第 ${top} 阶（${TIER_NAMES[top-1]}）`,`👛 金币：${user.gold}`,"━━━━━━━━━━━━"]
    for(const slot of SLOTS) {
      const tier=gearLevel(user,slot),item=gearItem(shop,slot,tier)
      lines.push(`${item.emoji} ${item.name}（已装备）· ${this.gearText(item,user)}`)
      const next=Array.from({length:top},(_,i)=>i+1).find(t=>!ownedGear(user,slot,t))
      if(next)lines.push(`  可购买：${TIER_NAMES[next-1]}${SLOT_NAMES[slot]} ${tierPrice(shop,next)} 金币 · #购买渔具 ${SLOT_NAMES[slot]} ${next}`)
    }
    lines.push("━━━━━━━━━━━━","#我的渔具 查看持有装备","#购买渔具 鱼竿 9 · #装备渔具 鱼竿 9","#渔具强化 鱼竿 9 · #渔具锻造 鱼竿 9","省略阶位时，强化/锻造当前穿戴的装备")
    return e.reply(withButtons(e,lines.join("\\n"),[B.myGear,B.shop]))
  }
  parseSlotTier(e,verb) {
    const m=e.msg.match(new RegExp(verb+"\\\\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护)\\\\s*(\\\\d{1,2})?"))
    if(!m)return null
    return {slot:UPGRADE_NAMES[m[1]],tier:m[2]?Number(m[2]):null}
  }
  async purchase(e) {
    if(!groupAllowed(e))return false
    const user=this.load(e),p=this.parseSlotTier(e,"购买渔具")
    if(!p?.tier)return e.reply("请指定装备阶位，例如 #购买渔具 鱼竿 9")
    const ret=buyGear(user,this.shopCfg,p.slot,p.tier)
    if(!ret.ok)return e.reply({locked:`角色等级不足，需 Lv${ret.need} 才能购买`,owned:"已拥有该渔具",gold:`金币不足，需要 ${ret.cost} 金币`,invalid:"无效的装备阶位"}[ret.reason]||"购买失败")
    await UserData.save(user.user_id)
    return e.reply(`购买成功：${ret.item.name}，花费 ${ret.cost} 金币。发送 #装备渔具 ${SLOT_NAMES[p.slot]} ${p.tier} 穿戴`)
  }
  async equip(e) {
    if(!groupAllowed(e))return false
    const user=this.load(e),p=this.parseSlotTier(e,"装备渔具")
    if(!p?.tier)return e.reply("请指定装备阶位")
    const ret=equipGear(user,p.slot,p.tier)
    if(!ret.ok)return e.reply(ret.reason==="locked"?"角色等级不足，不能穿戴":"尚未购买该装备")
    await UserData.save(user.user_id)
    return e.reply(`已装备：${gearItem(this.shopCfg,p.slot,p.tier).name}，属性已生效`)
  }
  async upgrade(e){return e.reply("旧版渔具升级已停用，请使用 #购买渔具、#渔具强化 或 #渔具锻造")}
  async enhance(e){return this.cultivate(e,"enhance")}
  async forge(e){return this.cultivate(e,"forge")}
  async cultivate(e,type){
    if(!groupAllowed(e))return false
    const user=this.load(e),p=this.parseSlotTier(e,type==="enhance"?"渔具强化":"渔具锻造")
    if(!p)return false
    const tier=p.tier||gearLevel(user,p.slot),item=gearItem(this.shopCfg,p.slot,tier)
    const ret=cultivateGear(user,this.shopCfg,p.slot,tier,type)
    if(!ret.ok)return e.reply({not_owned:"未拥有该阶位渔具",max:"已达到最高等级",gold:`金币不足，需要 ${ret.cost} 金币`,invalid:"参数无效"}[ret.reason]||"操作失败")
    await UserData.save(user.user_id)
    const name=type==="enhance"?"强化":"锻造",data=ownedGear(user,p.slot,tier),level=type==="enhance"?data.enhance:data.forge
    const next=level+1,max=type==="enhance"?15:8
    const chance=next<=max?successRate(this.shopCfg,type,next,type==="enhance"?data.enhanceFails:data.forgeFails):null
    return e.reply(`${ret.success?"🎉":"💢"} ${item.name} ${name}${ret.success?"成功":"失败"}！\\n当前${name} +${level}/${max}\\n本次成功率 ${ret.chance}% · 消耗 ${ret.cost} 金币\\n${chance===null?"已满级":`下次成功率 ${chance}%`} · 剩余金币 ${user.gold}`)
  }
  async shop(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const shop = this.shopCfg
    const cur = currentBait(user, shop)
    const gearLv = maxGearLevel(user)
    const baits = baitList(shop).map(b => ({
      ...b, level: baitLevel(b), color: lvColor(baitLevel(b)), locked: !canUseBait(user, b),
      price: baitPrice(shop, b.id, this.baitCfg), count: baitCount(user, b.id), current: b.id === cur.id, text: effectText(b.effects),
    }))
    const msg = await renderOrText(puppeteer, "shop", { name: displayName(user), gold: user.gold, gearLv, baits }, () => [
      `🏪 鱼饵商店 · 👛 ${user.gold} 金币 · 渔具最高 Lv${gearLv}`,
      "━━━━━━━━━━━━",
      "🪱 鱼饵（每竿消耗 1 个；第 N 级鱼饵需要至少一件 Lv N 渔具）",
      ...baits.map(b => `${b.current ? "▶" : "　"}Lv${b.level} ${b.emoji}${b.name} ${b.price} 金币 · ${b.locked ? `🔒 需 Lv${b.level} 渔具` : `库存 ${b.count}`} · ${b.text === "无" ? b.desc : b.text}`),
      "━━━━━━━━━━━━",
      "#购买鱼饵 种类 数量 · #使用鱼饵 种类",
    ].join("\n"))
    if (!msg) return true
    // 能买的鱼饵各一个“买 10 个”按钮（高级的排前面），QQBot 每行最多 5 个、最多 5 行
    const buy = baits.filter(b => !b.locked).reverse().slice(0, 12).map(b => ({ text: `${b.name}×10`, callback: `#购买鱼饵 ${b.name} 10` }))
    const rows = []
    for (let i = 0; i < buy.length; i += 3) rows.push(buy.slice(i, i + 3))
    return e.reply(withButtons(e, msg, ...rows, [B.buyBaitInput, B.myBait, B.workshop]))
  }

  async buy(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const shop = this.shopCfg
    let rest = e.msg.replace(/^#?购买鱼饵/, "").trim()
    const m = rest.match(/[×*xX]?\s*(\d+)\s*个?$/)
    const num = m ? Number(m[1]) : 10
    if (m) rest = rest.slice(0, m.index).trim()
    const bait = findBait(shop, rest)
    if (!bait) return e.reply(withButtons(e, `❓ 没有「${rest}」这种鱼饵\n可选：${baitList(shop).map(b => b.name).join("、")}`, [B.shop]))
    const maxBuy = Number(Config.config.bait?.maxBuy) || 999
    if (num < 1) return e.reply("🤔 至少要买 1 个鱼饵哦~")
    if (num > maxBuy) return e.reply(`🪱 一次最多购买 ${maxBuy} 个鱼饵~`)

    const ret = buyBait(user, shop, bait.id, num, this.baitCfg)
    if (!ret.ok && ret.reason === "locked")
      return e.reply(withButtons(e, [
        `🔒 ${bait.emoji}${bait.name}是 Lv${ret.need} 鱼饵，需要至少一件渔具达到 Lv${ret.need} 才能购买`,
        `🧰 你的渔具最高 Lv${maxGearLevel(user)}，先去 #购买渔具 升级吧`,
      ].join("\n"), [B.workshop, B.shop]))
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
    const buttons = [B.start, B.multi]
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
    const keyword = e.msg.replace(/^#?使用鱼饵/, "").trim()
    const bait = findBait(shop, keyword)
    if (!bait) return e.reply(`❓ 没有「${keyword}」这种鱼饵\n可选：${baitList(shop).map(b => b.name).join("、")}`)
    const ret = useBait(user, shop, bait.id)
    if (!ret.ok && ret.reason === "locked")
      return e.reply(withButtons(e, [
        `🔒 ${bait.emoji}${bait.name}是 Lv${ret.need} 鱼饵，需要至少一件渔具达到 Lv${ret.need} 才能使用`,
        `🧰 你的渔具最高 Lv${maxGearLevel(user)}${baitCount(user, bait.id) ? `，库存的 ${baitCount(user, bait.id)} 个会一直保留` : ""}`,
      ].join("\n"), [B.workshop, B.myBait]))
    if (!ret.ok)
      return e.reply(withButtons(e, `🪱 你还没有${bait.name}，先买一些吧（${baitPrice(shop, bait.id, this.baitCfg)} 金币/个）`,
        [{ text: `买 10 个${bait.name}`, callback: `#购买鱼饵 ${bait.name} 10` }]))
    UserData.save(user.user_id)
    return e.reply(withButtons(e, `${bait.emoji} 已换上${bait.name}（库存 ${baitCount(user, bait.id)}）\n✨ 效果：${effectText(bait.effects)}`, [B.start, B.multi]))
  }

  async bait(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const shop = this.shopCfg
    const cur = currentBait(user, shop)
    const owned = baitList(shop).filter(b => baitCount(user, b.id) > 0 || b.id === cur.id)
    return e.reply(withButtons(e, [
      `🪱 ${displayName(user)} 的鱼饵（共 ${totalBait(user)} 个）`,
      ...owned.map(b => `${b.id === cur.id ? "▶ " : "　"}Lv${baitLevel(b)} ${b.emoji}${b.name} ×${baitCount(user, b.id)} · ${canUseBait(user, b) ? effectText(b.effects).replace(/^无$/, "无特殊效果") : `🔒 需 Lv${baitLevel(b)} 渔具`}`),
      `👛 金币：${user.gold} · 🧰 渔具最高 Lv${maxGearLevel(user)}`,
    ].join("\n"),
      owned.filter(b => b.id !== cur.id && baitCount(user, b.id) > 0 && canUseBait(user, b)).slice(-5).reverse().map(b => ({ text: `使用${b.name}`, callback: `#使用鱼饵 ${b.name}` })),
      [B.buyBait, B.buyBaitInput, B.shop]))
  }

  async gear(e){
    if(!groupAllowed(e))return false
    const user=this.load(e),shop=this.shopCfg
    const lines=[`🧰 ${displayName(user)} 的渔具 · 金币 ${user.gold}`,"━━━━━━━━━━━━"]
    for(const slot of SLOTS){
      const equipped=gearLevel(user,slot)
      lines.push(`${SLOT_NAMES[slot]}（已装备：${TIER_NAMES[equipped-1]}）`)
      for(let tier=1;tier<=20;tier++){
        const item=ownedGear(user,slot,tier)
        if(!item)continue
        lines.push(` ${tier===equipped?"▶":" "} ${TIER_NAMES[tier-1]} · 强化+${item.enhance||0} 锻造+${item.forge||0} · 失败补偿 强化+${Math.min(50,(successRate(shop,"enhance",Math.min(15,(item.enhance||0)+1),item.enhanceFails||0)-successRate(shop,"enhance",Math.min(15,(item.enhance||0)+1),0))).toFixed(1)}% / 锻造+${Math.min(50,(successRate(shop,"forge",Math.min(8,(item.forge||0)+1),item.forgeFails||0)-successRate(shop,"forge",Math.min(8,(item.forge||0)+1),0))).toFixed(1)}%`)
      }
    }
    lines.push("━━━━━━━━━━━━",`鱼护容量：${bagCapacity(user,shop,Config.config.fishing?.bagLimit)}`,`装备属性：${effectText(gearEffects(user,shop))}`)
    return e.reply(withButtons(e,lines.join("\\n"),[B.workshop,B.shop,B.start]))
  }
}
