/** 渔具工坊 V2：按阶位购买、穿戴、强化和锻造；保留鱼饵商店。 */
import { plugin, puppeteer } from "../components/yunzai.js"
import Config from "../components/Config.js"
import UserData from "../components/UserData.js"
import { effectText, getEffects, mergeEffects } from "../components/Titles.js"
import { luckEffects } from "../components/Game.js"
import { SLOTS, UPGRADE_NAMES, SLOT_NAMES, TIER_NAMES, levelColor, tierColor, textOn, gearLevel, gearItem, maxLevel, gearEffects, bagCapacity, baitList, findBait, baitPrice, baitCount, totalBait, currentBait, buyBait, useBait, baitLevel, canUseBait, maxGearLevel, unlockedTier, tierPrice, ownedGear, ensureGear, buyGear, buyGearSet, equipGear, equipGearSet, cultivateGear, tierNeedLevel, tierBadge, gearShopSuggest, enhanceCost, forgeCost, successRate, slotEffects, gearSet, setEffects, MAX_ENHANCE, MAX_FORGE } from "../components/Gear.js"
import { effectLines, rareTargetText, wearTitle, cnNumber } from "../components/GearText.js"
import { gearIcon } from "../components/GearIcons.js"
import { characterProgress } from "../components/Progression.js"
import { withButtons, B, fishRow } from "../components/Button.js"
import { renderOrText } from "../components/Render.js"
import { groupAllowed, updateNickname, displayName } from "../components/common.js"

export class FishingShop extends plugin {
  constructor() {
    super({name:"钓鱼-渔具工坊与商店",dsc:"渔具购买、穿戴、强化、锻造和鱼饵商店",event:"message",priority:500,rule:[
      {reg:/^#?(?:购买渔具|渔具商店)$/,fnc:"workshop"},
      {reg:/^#?渔具工坊(?:\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护))?$/,fnc:"forgeWorkshop"},
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
        tier, name, ...tierBadge(tier), tierCn: cnNumber(tier), price: tierPrice(shop, tier),
        unlocked: tier <= unlocked,
        items: SLOTS.map(slot => {
          const item = gearItem(shop, slot, tier)
          const owned = ownedGear(user, slot, tier)
          return {
            slot, name: item.name, shortName: SLOT_NAMES[slot], emoji: item.emoji, icon: gearIcon(slot, tier),
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
    const { buyTier, equipTier } = gearShopSuggest(user)
    const quick = [
      ...(buyTier ? [{ text: `🛒 购买${TIER_NAMES[buyTier - 1]}套装`, callback: `#购买渔具${TIER_NAMES[buyTier - 1]}套装` }] : []),
      ...(equipTier ? [{ text: `✅ 使用${TIER_NAMES[equipTier - 1]}套装`, callback: `#使用${TIER_NAMES[equipTier - 1]}套装` }] : []),
      // 没有更高阶可买（例如满级穿着创世套装）时，换成去工坊强化锻造
      buyTier ? { text: "🛒 购买单件…", input: "#购买渔具 " } : { text: "🔨 渔具工坊", callback: "#渔具工坊" },
    ]
    return e.reply(withButtons(e, msg, quick, [B.myGear, B.shop]))
  }
  /**
   * 强化 / 锻造 / 切换方式按钮：只有触发者本人能点（别人点会提示无权限），按钮写明阶位，对准本人正在养成的那件
   */
  cultivateButton(e,user,text,typeName,slot,tier) {
    return {text,callback:`#渔具${typeName} ${SLOT_NAMES[slot]} ${tier}`,permission:e.user_id}
  }
  workshopButtons(e,user,slot="rod",tier=1) {
    return [
      [this.cultivateButton(e,user,"⬆️ 强化","强化",slot,tier),this.cultivateButton(e,user,"🔨 锻造","锻造",slot,tier)],
      SLOTS.map(s=>({text:SLOT_NAMES[s],callback:`#渔具工坊 ${SLOT_NAMES[s]}`})),
      [B.myGear,{text:"🏪 渔具商店",callback:"#渔具商店"},B.help]
    ]
  }
  workshopData(user,slot="rod",type="enhance",tier=gearLevel(user,slot)) {
    const shop=this.shopCfg,item=ownedGear(user,slot,tier)
    const max=type==="enhance"?MAX_ENHANCE:MAX_FORGE
    const level=Math.min(max,Number(item?.[type])||0),target=level+1
    const fails=Number(item?.[type==="enhance"?"enhanceFails":"forgeFails"])||0
    const base=level<max?successRate(shop,type,target,0):null
    const chance=level<max?successRate(shop,type,target,fails):null
    const cost=level<max?(type==="enhance"?enhanceCost(shop,tier,target):forgeCost(shop,tier,target)):0
    const equipment=SLOTS.map(s=>{
      const t=gearLevel(user,s),d=ownedGear(user,s,t)
      return {slot:s,name:TIER_NAMES[t-1]+SLOT_NAMES[s],emoji:gearItem(shop,s,t)?.emoji,
        tier:t,...tierBadge(t),icon:gearIcon(s,t),enhance:Number(d?.enhance)||0,forge:Number(d?.forge)||0,selected:s===slot}
    })
    // 本次养成类型的效果：另一种养成保持当前等级，按 slotEffects 实际计算差值
    const other=type==="enhance"?Number(item?.forge)||0:Number(item?.enhance)||0
    const at=lv=>type==="enhance"?slotEffects(slot,tier,lv,other):slotEffects(slot,tier,other,lv)
    // “高品级 / 品级提升”按鱼竿阶位说明：工坊看的是鱼竿时用这根鱼竿的阶位，其他部位用穿戴中的鱼竿
    const rodTier=slot==="rod"?tier:gearLevel(user,"rod")
    const lines=(a,b)=>effectLines(a,b,rodTier)
    const stepLines=level<max?lines(at(level),at(target)):[]
    const totalLines=lines(at(0),at(level))
    return {name:displayName(user),gold:user.gold,equipment,slot,tier,
      itemName:TIER_NAMES[tier-1]+SLOT_NAMES[slot],itemEmoji:gearItem(shop,slot,tier)?.emoji,item:tierBadge(tier),tierCn:cnNumber(tier),icon:gearIcon(slot,tier),
      enhance:Number(item?.enhance)||0,forge:Number(item?.forge)||0,
      type,typeName:type==="enhance"?"强化":"锻造",level,max,target,equipped:gearLevel(user,slot)===tier,
      stepLines,totalLines:totalLines.length?totalLines:["暂无"],
      // 上一级带来的提升（养成成功后展示）
      lastLines:level>0?lines(at(level-1),at(level)):[],
      rareTargetText:rareTargetText(rodTier),
      base,chance,bonus:chance===null?0:Number((chance-base).toFixed(2)),
      cost,full:level>=max}
  }
  async forgeWorkshop(e) {
    if(!groupAllowed(e))return false
    const user=this.load(e)
    const m=e.msg.match(/^#?渔具工坊(?:\s*(鱼竿|鱼线|鱼钩|浮漂|鱼护))?$/)
    const slot=UPGRADE_NAMES[m?.[1]]||"rod"
    const data=this.workshopData(user,slot)
    const msg=await renderOrText(puppeteer,"forgeworkshop",data,()=>[
      `🔧 渔具工坊 · ${data.itemName}`,
      `强化 +${data.enhance}/15 · 锻造 +${data.forge}/8`,
      `下次强化：${data.full?"已满级":`${data.chance}% · ${data.cost} 金币 · ${data.stepLines.join("、")}`}`,
      `高品级加成分配：${data.rareTargetText}`,
      "使用下方按钮选择装备或强化/锻造"
    ].join("\n"))
    if(!msg)return true
    return e.reply(withButtons(e,msg,...this.workshopButtons(e,user,slot,data.tier)))
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
    const name = TIER_NAMES[tier-1]
    const ret = buyGearSet(user,this.shopCfg,tier)
    if (!ret.ok) {
      if (ret.reason === "locked") return e.reply(`🔒 角色等级不足：${name}套装需要 Lv${ret.need}`)
      if (ret.reason === "gold") return e.reply([`👛 金币不足：${name}套装还差 ${ret.missing} 件，需要 ${ret.cost} 金币`, `当前 ${ret.have} 金币，还差 ${ret.cost-ret.have} 金币`].join("\n"))
      if (ret.reason === "owned") return e.reply(withButtons(e, `✅ 你已拥有完整的${name}套装，无需重复购买`, [{ text: `✅ 使用${name}套装`, callback: `#使用${name}套装` }]))
      return e.reply("❓ 没有这个套装，请查看 #渔具商店")
    }
    await UserData.save(user.user_id)
    // 继承相同的部位合并成一行：“全部 5 件 强化 +7、锻造 +4（来自第 5 阶）”
    const groups = new Map()
    for (const slot of ret.slots) {
      const t = inheritText(ret.inherited?.[slot], false)
      if (t) groups.set(t, [...(groups.get(t) || []), slot])
    }
    const inh = [...groups].map(([t, slots]) => `${slots.length === SLOTS.length ? "全部 5 件" : slots.map(x => SLOT_NAMES[x]).join("、")} ${t}`)
    const lines = [
      `🛒 购买成功：${name}套装`,
      `📦 获得 ${ret.slots.length} 件：${ret.slots.map(slot => SLOT_NAMES[slot]).join("、")}${ret.skipped ? `（已有 ${ret.skipped} 件，跳过不收费）` : ""}`,
      `💰 花费 ${ret.cost} 金币 · 剩余 ${user.gold}`,
      ...inh.map(t => `🔁 继承：${t}`),
      LINE,
      "✨ 5 件套属性（穿上后生效）",
      ...setLines(tier, 5),
    ]
    return e.reply(withButtons(e, lines.join("\n"), [{ text: `✅ 使用${name}套装`, callback: `#使用${name}套装` }, B.myGear]))
  }
  async purchase(e) {
    if(!groupAllowed(e))return false
    const user=this.load(e),p=this.parseSlotTier(e,"购买渔具")
    if(!p?.tier)return e.reply("请指定装备阶位，例如 #购买渔具 鱼竿 9")
    const ret=buyGear(user,this.shopCfg,p.slot,p.tier)
    if(!ret.ok)return e.reply({locked:`🔒 角色等级不足：需要 Lv${ret.need}`,owned:"✅ 你已拥有这件渔具",gold:`👛 金币不足：需要 ${ret.cost} 金币`,invalid:"❓ 没有这个阶位的渔具"}[ret.reason]||"购买失败")
    await UserData.save(user.user_id)
    const equipCmd=`#装备渔具 ${SLOT_NAMES[p.slot]} ${p.tier}`
    const lines=[
      `🛒 购买成功：Lv.${tierNeedLevel(p.tier)} ${ret.item.name}`,
      `💰 花费 ${ret.cost} 金币 · 剩余 ${user.gold}`,
      ...(inheritText(ret.inherited,false)?[`🔁 继承：${inheritText(ret.inherited,false)}`]:[]),
      `💡 发送 ${equipCmd} 穿戴`,
    ]
    return e.reply(withButtons(e,lines.join("\n"),[{text:`✅ 装备${ret.item.name}`,callback:equipCmd},B.myGear]))
  }
  async equipSet(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const match = e.msg.match(/^#?(?:使用|穿戴|装备)(?:渔具)?\s*(.+?)套装$/)
    const tier = TIER_NAMES.indexOf(match?.[1]) + 1
    const name = TIER_NAMES[tier-1]
    const ret = equipGearSet(user,tier)
    if (!ret.ok) {
      if (ret.reason === "locked") return e.reply(`🔒 角色等级不足：${name}套装需要 Lv${ret.need}`)
      if (ret.reason === "incomplete") return e.reply(withButtons(e, [`❌ ${name}套装还没买齐`, `缺少：${ret.missing.map(slot => name + SLOT_NAMES[slot]).join("、")}`].join("\n"), [{ text: `🛒 购买${name}套装`, callback: `#购买渔具${name}套装` }]))
      if (ret.reason === "equipped") return e.reply(`✅ 你已经穿着${name}套装（5）了`)
      return e.reply("❓ 没有这个套装，请查看 #渔具商店")
    }
    await UserData.save(user.user_id)
    const lines = [
      `✅ 已穿戴：${name}套装（5）`,
      "🎣 5 件渔具已全部换上，强化和锻造等级不变",
      LINE,
      "✨ 5 件套属性已生效",
      ...setLines(tier, 5),
    ]
    return e.reply(withButtons(e, lines.join("\n"), [B.myGear, { text: "🔨 渔具工坊", callback: "#渔具工坊" }]))
  }
  async equip(e) {
    if(!groupAllowed(e))return false
    const user=this.load(e),p=this.parseSlotTier(e,"装备渔具")
    if(!p?.tier)return e.reply("请指定装备阶位，例如 #装备渔具 鱼竿 9")
    const ret=equipGear(user,p.slot,p.tier)
    if(!ret.ok)return e.reply(ret.reason==="locked"?"🔒 角色等级不足，还不能穿戴":"❌ 还没有这件渔具，先去 #渔具商店 购买")
    await UserData.save(user.user_id)
    const set=gearSet(user)
    const lines=[
      `✅ 已装备：Lv.${tierNeedLevel(p.tier)} ${gearItem(this.shopCfg,p.slot,p.tier).name}`,
      set.pieces?`✨ 当前套装：${TIER_NAMES[set.tier-1]}套装（${set.count}）· ${set.pieces} 件套生效`:"✨ 当前未成套（同一阶穿 3 件触发套装）",
    ]
    return e.reply(withButtons(e,lines.join("\n"),[B.myGear]))
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
    const data=this.workshopData(user,p.slot,type,tier)
    const resultData={...data,success:ret.success,spent:ret.cost,
      attemptedChance:ret.chance,oldLevel:ret.success?data.level-1:data.level,
      gainedText:ret.success?data.lastLines.join("、"):""}
    const msg=await renderOrText(puppeteer,"forgeresult",resultData,()=>[
      `${ret.success?"🎉":"💢"} ${data.itemName} ${data.typeName}${ret.success?"成功":"失败"}！`,
      `等级：+${resultData.oldLevel} → +${data.level}`,
      `本次成功率 ${ret.chance}% · 消耗 ${ret.cost} 金币`,
      data.full?"已满级":`下次成功率 ${data.chance}%（失败补偿 +${data.bonus}%）`,
      `剩余金币 ${user.gold}`
    ].join("\n"))
    if(!msg)return true
    return e.reply(withButtons(e,msg,
      [this.cultivateButton(e,user,`🔨 ${data.typeName}`,data.typeName,p.slot,tier),
       {text:"🏠 返回工坊",callback:`#渔具工坊 ${SLOT_NAMES[p.slot]}`}],
      [B.myGear,this.cultivateButton(e,user,"🔄 切换方式",type==="enhance"?"锻造":"强化",p.slot,tier)]))
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
        `🧰 你穿戴的渔具最高 ${maxGearLevel(user)} 阶，先去 #渔具商店 买更高阶的渔具吧`,
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
    const buttons = fishRow(user)
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
    return e.reply(withButtons(e, `${bait.emoji} 已换上${bait.name}（库存 ${baitCount(user, bait.id)}）\n✨ 效果：${effectText(bait.effects)}`, fishRow(user)))
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

  /** #我的渔具 图片数据：每件装备的属性、套装、品级分布 */
  gearImageData(user) {
    const shop=this.shopCfg, set=gearSet(user), setName=TIER_NAMES[set.tier-1], rodTier=gearLevel(user,"rod")
    const lines=(a,b)=>effectLines(a,b,rodTier)
    const items=SLOTS.map(slot=>{
      const tier=gearLevel(user,slot), d=ownedGear(user,slot,tier)||{}
      const eff=slotEffects(slot,tier,d.enhance,d.forge)
      return {slot,slotName:SLOT_NAMES[slot],name:gearItem(shop,slot,tier).name,tier,tierName:TIER_NAMES[tier-1],needLevel:tierNeedLevel(tier),icon:gearIcon(slot,tier),
        enhance:Number(d.enhance)||0,forge:Number(d.forge)||0,maxE:MAX_ENHANCE,maxF:MAX_FORGE,color:tierColor(tier),textColor:textOn(tierColor(tier)),
        lines:[...(slot==="rod"?[`基础品级：第 ${tier} 阶`]:[]),...lines({},eff)]}
    })
    const s3=setEffects(set.tier,3), s5=setEffects(set.tier,5)
    const extra=Object.fromEntries(Object.entries(s5).filter(([k])=>!(k in s3)))
    const hint=set.pieces>=5?`${setName} 5 件套已全部生效`
      :set.pieces>=3?`再穿 ${5-set.count} 件${setName}渔具即可触发 5 件套`
      :`穿戴同一阶的 3 件渔具触发套装（当前同阶最多 ${set.count} 件：${setName}）`
    return {
      name:displayName(user),gold:user.gold,level:characterProgress(user).level,unlocked:unlockedTier(user),
      capacity:bagCapacity(user,shop,Config.config.fishing?.bagLimit),items,wearTitle:wearTitle(set,setName),
      suit:{name:setName,count:set.count,pieces:set.pieces,hint,rows:[
        {label:"3 件",on:set.pieces>=3,lines:lines({},s3)},
        {label:"5 件",on:set.pieces>=5,lines:["含 3 件效果",...lines({},extra)]},
      ]},
      rareTargetText:rareTargetText(rodTier),
      totals:lines({},gearEffects(user,shop)),
    }
  }

  async gear(e){
    if(!groupAllowed(e))return false
    const user=this.load(e),shop=this.shopCfg
    const msg=await renderOrText(puppeteer,"mygear",this.gearImageData(user),()=>this.gearText(user))
    if(!msg)return true
    return e.reply(withButtons(e,msg,[B.workshop,B.shop,B.start]))
  }

  /** #我的渔具 文字版（图片渲染失败时） */
  gearText(user){
    const shop=this.shopCfg
    const lines=[`🧰 ${displayName(user)} · 当前穿戴渔具`,`金币：${user.gold}`,"━━━━━━━━━━━━"]
    for(const slot of SLOTS){
      const tier=gearLevel(user,slot)
      const item=ownedGear(user,slot,tier)
      lines.push(`${gearItem(shop,slot,tier).name}（第${tier}阶）`)
      lines.push(`> 强化 +${item?.enhance||0}/15 · 锻造 +${item?.forge||0}/8`, "")
    }
    const effects = effectText(gearEffects(user,shop))
      .split(/，|\s+(?=[^\s，]+[+-]\d)/)
      .map(part => part.trim()).filter(Boolean)
    const set=gearSet(user)
    lines.push("━━━━━━━━━━━━",
      set.pieces?`✨ 套装：${TIER_NAMES[set.tier-1]}套装（${set.count}）· ${set.pieces} 件套生效`:`✨ 套装：未生效（穿戴同一阶 3 件 / 5 件触发）`,
      `高品级加成分配：${rareTargetText(gearLevel(user,"rod"))}`,
      `鱼护容量：${bagCapacity(user,shop,Config.config.fishing?.bagLimit)}`,"当前生效属性（含套装）：",...effects.map(part => `> ${part}`))
    return lines.join("\n")
  }}

const LINE = "━━━━━━━━━━━━"
/** 套装属性逐行：“· 空军 -1.2%”，按这一阶鱼竿写出具体品级 */
function setLines(tier, pieces) {
  return effectLines({}, setEffects(tier, pieces), tier).map(l => `· ${l}`)
}
/** 继承提示：“强化 +7、锻造 +3” */
function inheritText(inh, withPrefix = true) {
  if (!inh || (!inh.enhance && !inh.forge)) return ""
  const e = inh.enhance ? `强化 +${inh.enhance}` : "", f = inh.forge ? `锻造 +${inh.forge}` : ""
  // 两项来自同一阶时只写一次来源：“强化 +7、锻造 +4（来自第 5 阶）”
  const text = !e || !f || inh.from.enhance === inh.from.forge
    ? `${[e, f].filter(Boolean).join("、")}（来自第 ${inh.from.enhance || inh.from.forge} 阶）`
    : `${e}（来自第 ${inh.from.enhance} 阶）、${f}（来自第 ${inh.from.forge} 阶）`
  return withPrefix ? `\n🔁 继承旧装备：${text}` : text
}
