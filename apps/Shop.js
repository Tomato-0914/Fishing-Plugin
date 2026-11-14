/** 渔具工坊 V2：按阶位购买、穿戴、强化和锻造；保留鱼饵商店。 */
import { plugin, puppeteer } from "../components/yunzai.js"
import Config from "../components/Config.js"
import UserData from "../components/UserData.js"
import { effectText, getEffects, mergeEffects } from "../components/Titles.js"
import { oddsPercent } from "../components/ItemPool.js"
import { luckEffects } from "../components/Game.js"
import { SLOTS, UPGRADE_NAMES, SLOT_NAMES, TIER_NAMES, levelColor, gearLevel, gearItem, maxLevel, gearEffects, bagCapacity, baitList, findBait, baitPrice, baitCount, totalBait, currentBait, buyBait, useBait, baitLevel, canUseBait, maxGearLevel, unlockedTier, tierPrice, ownedGear, ensureGear, buyGear, buyGearSet, equipGear, equipGearSet, cultivateGear, enhanceCost, forgeCost, successRate } from "../components/Gear.js"
import { withButtons, B } from "../components/Button.js"
import { renderOrText } from "../components/Render.js"
import { groupAllowed, updateNickname, displayName } from "../components/common.js"

export class FishingShop extends plugin {
  constructor() {
    super({name:"钓鱼-渔具工坊与商店",dsc:"渔具购买、穿戴、强化、锻造和鱼饵商店",event:"message",priority:500,rule:[
      {reg:/^#?(?:购买渔具|渔具商店)$/,fnc:"workshop"},
      {reg:/^#?渔具工坊(?:\\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护))?$/,fnc:"forgeWorkshop"},
      {reg:/^#?购买渔具\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护)\s*(\d{1,2})$/,fnc:"purchase"},
      {reg:/^#?购买渔具\s*(新手|青竹|精铁|玄木|寒玉|流云|沧浪|星砂|月影|玄冰|烈阳|深渊|龙鳞|凤羽|天罡|星辰|太虚|混元|鸿蒙|创世)套装$/,fnc:"purchaseSet"},
      {reg:/^#?装备渔具\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护)\s*(\d{1,2})$/,fnc:"equip"},
      {reg:/^#?(?:使用|穿戴|装备)(?:渔具)?\s*(新手|青竹|精铁|玄木|寒玉|流云|沧浪|星砂|月影|玄冰|烈阳|深渊|龙鳞|凤羽|天罡|星辰|太虚|混元|鸿蒙|创世)套装$/,fnc:"equipSet"},
      {reg:/^#?渔具升级\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护)$/,fnc:"upgrade"},
      {reg:/^#?渔具强化\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护)(?:\s*(\d{1,2}))?$/,fnc:"enhance"},
      {reg:/^#?渔具锻造\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护)(?:\s*(\d{1,2}))?$/,fnc:"forge"},
      {reg:/^#?鱼饵商店$/,fnc:"shop"},
      {reg:/^#?购买鱼饵\s*(.*)$/,fnc:"buy"},
      {reg:/^#?使用鱼饵\s*(.+)$/,fnc:"use"},
      {reg:/^#?我的鱼饵$/,fnc:"bait"},
      {reg:/^#?我的渔具$/,fnc:"gear"}
    ]})
  }
  get shopCfg(){return Config.shop||{}}
  get baitCfg(){return Config.config.bait||{}}
  load(e){const user=UserData.get(e.user_id);updateNickname(user,e);ensureGear(user);return user}
  gearText(item,user){if(!item)return "";const tier=item.level;const data=ownedGear(user,item.slot,tier);return `强化 +${data?.enhance||0}/15 · 锻造 +${data?.forge||0}/8`}
  /** 图鉴式渔具商店：20阶×5部位，展示全部100件及玩家拥有/穿戴状态。 */
  async workshop(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const shop = this.shopCfg
    const unlocked = unlockedTier(user)
    const tiers = TIER_NAMES.map((name, index) => {
      const tier = index + 1
      return {
        tier, name, needLevel: index * 5 + 1, price: tierPrice(shop, tier),
        unlocked: tier <= unlocked,
        items: SLOTS.map(slot => {
          const item = gearItem(shop, slot, tier)
          const owned = ownedGear(user, slot, tier)
          return {
            slot, name: item.name, shortName: SLOT_NAMES[slot], emoji: item.emoji,
            owned: !!owned, equipped: gearLevel(user, slot) === tier,
            enhance: owned?.enhance || 0, forge: owned?.forge || 0,
            afford: user.gold >= item.price,
          }
        }),
      }
    })
    const msg = await renderOrText(puppeteer, "workshop", {
      name: displayName(user), gold: user.gold, unlocked, tiers,
    }, () => [
      `🔧 渔具商店 · ${displayName(user)} · 金币 ${user.gold}`,
      `当前最高解锁第 ${unlocked} 阶 · 全部20阶、100件装备`,
      ...tiers.map(t => [
        `【第${t.tier}阶 · ${t.name}】Lv${t.needLevel} · ${t.price}金币/件 ${t.unlocked ? "" : "🔒未解锁"}`,
        ...t.items.map(i => ` ${i.emoji}${i.shortName}：${i.equipped ? "已装备" : i.owned ? `已拥有 强化+${i.enhance} 锻造+${i.forge}` : t.unlocked ? "可购买" : "未解锁"}`),
      ].join("\n")),
      "购买：#购买渔具 鱼竿 9 · 装备：#装备渔具 鱼竿 9",
    ].join("\n"))
    if (!msg) return true
    return e.reply(withButtons(e, msg, [B.myGear, B.shop]))
  }
  workshopButtons(slot="rod",tier=1) {
    return [
      [{text:"⬆️ 强化",callback:`#渔具强化 ${SLOT_NAMES[slot]} ${tier}`},{text:"🔨 锻造",callback:`#渔具锻造 ${SLOT_NAMES[slot]} ${tier}`}],
      SLOTS.map(s=>({text:SLOT_NAMES[s],callback:`#渔具工坊 ${SLOT_NAMES[s]}`})),
      [B.myGear,{text:"🏪 渔具商店",callback:"#渔具商店"},B.help]
    ]
  }
  workshopData(user,slot="rod",type="enhance") {
    const shop=this.shopCfg,tier=gearLevel(user,slot),item=ownedGear(user,slot,tier)
    const level=Number(item?.[type])||0,max=type==="enhance"?15:8,target=level+1
    const fails=Number(item?.[type==="enhance"?"enhanceFails":"forgeFails"])||0
    const base=level<max?successRate(shop,type,target,0):null
    const chance=level<max?successRate(shop,type,target,fails):null
    const cost=level<max?(type==="enhance"?enhanceCost(shop,tier,target):forgeCost(shop,tier,target)):0
    const equipment=SLOTS.map(s=>{
      const t=gearLevel(user,s),d=ownedGear(user,s,t)
      return {slot:s,name:TIER_NAMES[t-1]+SLOT_NAMES[s],emoji:gearItem(shop,s,t)?.emoji,
        tier:t,enhance:Number(d?.enhance)||0,forge:Number(d?.forge)||0,selected:s===slot}
    })
    const descriptions={
      rod:{enhance:"高级鱼出现概率",forge:"特殊鱼获取概率",enhanceStep:0.15,forgeStep:0.10,unit:"%"},
      line:{enhance:"断线概率相对降低",forge:"大鱼断线概率相对降低",enhanceStep:1,forgeStep:1.5,unit:"%"},
      hook:{enhance:"收杆成功率",forge:"额外钓鱼机会",enhanceStep:0.3,forgeStep:0.25,unit:"%"},
      float:{enhance:"等待时间缩短",forge:"有效收杆时间延长",enhanceStep:0.3,forgeStep:0.5,unit:"%"},
      net:{enhance:"鱼护容量",forge:"出售金币收益",enhanceStep:5,forgeStep:0.5,unit:type==="enhance"?"格":"%"}
    }
    const d=descriptions[slot],step=type==="enhance"?d.enhanceStep:d.forgeStep
    return {name:displayName(user),gold:user.gold,equipment,slot,tier,
      itemName:TIER_NAMES[tier-1]+SLOT_NAMES[slot],itemEmoji:gearItem(shop,slot,tier)?.emoji,
      enhance:Number(item?.enhance)||0,forge:Number(item?.forge)||0,
      type,typeName:type==="enhance"?"强化":"锻造",level,max,target,
      effectName:d[type],effectStep:step,unit:slot==="net"&&type==="enhance"?"格":"%",
      effectTotal:Number((step*level).toFixed(2)),
      nextTotal:Number((step*(level+1)).toFixed(2)),
      base,chance,bonus:chance===null?0:Number((chance-base).toFixed(2)),
      cost,full:level>=max}
  }
  async forgeWorkshop(e) {
    if(!groupAllowed(e))return false
    const user=this.load(e)
    const m=e.msg.match(/^#?渔具工坊(?:\\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护))?$/)
    const slot=UPGRADE_NAMES[m?.[1]]||"rod"
    const data=this.workshopData(user,slot)
    const msg=await renderOrText(puppeteer,"forgeworkshop",data,()=>[
      `🔧 渔具工坊 · ${data.itemName}`,
      `强化 +${data.enhance}/15 · 锻造 +${data.forge}/8`,
      `下次强化：${data.full?"已满级":`${data.chance}% · ${data.cost} 金币`}`,
      "使用下方按钮选择装备或强化/锻造"
    ].join("\\n"))
    if(!msg)return true
    return e.reply(withButtons(e,msg,...this.workshopButtons(slot,data.tier)))
  }
  parseSlotTier(e,verb) {
    const m=e.msg.match(new RegExp(verb+"\\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护)\\s*(\\d{1,2})?"))
    if(!m)return null
    return {slot:UPGRADE_NAMES[m[1]],tier:m[2]?Number(m[2]):null}
  }
  async purchaseSet(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const match = e.msg.match(/^#?购买渔具\s*(.+?)套装$/)
    const tier = TIER_NAMES.indexOf(match?.[1]) + 1
    const ret = buyGearSet(user,this.shopCfg,tier)
    if (!ret.ok) {
      if (ret.reason === "locked") return e.reply(`角色等级不足，需要 Lv${ret.need} 才能购买${TIER_NAMES[tier-1]}套装`)
      if (ret.reason === "gold") return e.reply(`金币不足！购买${TIER_NAMES[tier-1]}套装剩余 ${ret.missing} 件需要 ${ret.cost} 金币，当前只有 ${ret.have} 金币，还差 ${ret.cost-ret.have} 金币。`)
      if (ret.reason === "owned") return e.reply(`你已拥有完整的${TIER_NAMES[tier-1]}套装，无需重复购买。`)
      return e.reply("无效的渔具套装名称，请查看 #渔具商店")
    }
    await UserData.save(user.user_id)
    return e.reply(`购买成功！获得${TIER_NAMES[tier-1]}套装中的 ${ret.slots.length} 件渔具：${ret.slots.map(slot=>SLOT_NAMES[slot]).join("、")}。\n花费 ${ret.cost} 金币，剩余 ${user.gold} 金币。${ret.skipped ? `\n已有 ${ret.skipped} 件已自动跳过，未重复收费。` : ""}\n装备不会自动切换，可使用 #装备渔具 鱼竿 ${tier} 等指令穿戴。`)
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
  async equipSet(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const match = e.msg.match(/^#?(?:使用|穿戴|装备)(?:渔具)?\s*(.+?)套装$/)
    const tier = TIER_NAMES.indexOf(match?.[1]) + 1
    const ret = equipGearSet(user,tier)
    if (!ret.ok) {
      if (ret.reason === "locked") return e.reply(`角色等级不足，需要 Lv${ret.need} 才能使用${TIER_NAMES[tier-1]}套装。`)
      if (ret.reason === "incomplete") return e.reply(`无法使用${TIER_NAMES[tier-1]}套装，缺少：${ret.missing.map(slot=>TIER_NAMES[tier-1]+SLOT_NAMES[slot]).join("、")}。\n请先购买缺少的装备：#购买渔具${TIER_NAMES[tier-1]}套装`)
      if (ret.reason === "equipped") return e.reply(`当前已穿戴完整的${TIER_NAMES[tier-1]}套装，无需重复切换。`)
      return e.reply("无效的渔具套装名称，请查看 #渔具商店")
    }
    await UserData.save(user.user_id)
    return e.reply(`已成功使用${TIER_NAMES[tier-1]}套装！\n鱼竿、鱼线、鱼钩、浮漂、鱼护已全部切换，原有强化和锻造等级保持不变，套装属性现已生效。`)
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
    const data=this.workshopData(user,p.slot,type)
    const resultData={...data,success:ret.success,spent:ret.cost,
      attemptedChance:ret.chance,oldLevel:ret.success?data.level-1:data.level,
      gained:ret.success?data.effectStep:0}
    const msg=await renderOrText(puppeteer,"forgeresult",resultData,()=>[
      `${ret.success?"🎉":"💢"} ${data.itemName} ${data.typeName}${ret.success?"成功":"失败"}！`,
      `等级：+${resultData.oldLevel} → +${data.level}`,
      `本次成功率 ${ret.chance}% · 消耗 ${ret.cost} 金币`,
      data.full?"已满级":`下次成功率 ${data.chance}%（失败补偿 +${data.bonus}%）`,
      `剩余金币 ${user.gold}`
    ].join("\\n"))
    if(!msg)return true
    return e.reply(withButtons(e,msg,
      [{text:`🔨 再次${data.typeName}`,callback:`#渔具${data.typeName} ${SLOT_NAMES[p.slot]} ${tier}`},
       {text:"🏠 返回工坊",callback:`#渔具工坊 ${SLOT_NAMES[p.slot]}`}],
      [B.myGear,{text:"🔄 切换方式",callback:`#渔具${type==="enhance"?"锻造":"强化"} ${SLOT_NAMES[p.slot]} ${tier}`}]))
  }
  async shop(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const shop = this.shopCfg
    const cur = currentBait(user, shop)
    const gearLv = maxGearLevel(user)
    const baits = baitList(shop).map(b => ({
      ...b, level: baitLevel(b), color: levelColor(baitLevel(b)), locked: !canUseBait(user, b),
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
    return e.reply(withButtons(e,lines.join("\n"),[B.workshop,B.shop,B.start]))
  }
}
