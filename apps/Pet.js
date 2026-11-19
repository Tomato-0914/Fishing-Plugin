/** 宠物：商店、我的宠物、出战、进化、喂食、改名、寻回 */
import { plugin, puppeteer } from "../components/yunzai.js"
import Config from "../components/Config.js"
import UserData from "../components/UserData.js"
import {
  petCfg, petDefs, petDef, ensurePets, refreshPets, petLevel, effectivePetLevel, petStage, needsBranch, branchLevel, branchDef,
  formAt, currentForm, petName, satPerDay, petAbilities, petSkills, skillText, petThreshold, isHungry, satText, satHours, findOwnedPet, findPetDef,
  buyPet, setActivePet, feedPet, evolvePet, renamePet, recallPet, lostPets, petNotices,
} from "../components/Pet.js"
import { petIcon } from "../components/PetIcons.js"
import { characterProgress } from "../components/Progression.js"
import { withButtons, B, fishRow } from "../components/Button.js"
import { renderOrText } from "../components/Render.js"
import { groupAllowed, displayName, updateNickname } from "../components/common.js"

const LINE = "━━━━━━━━━━━━"
const STAGE_CN = ["", "一阶", "二阶", "三阶", "四阶", "五阶"]
const money = n => Number(n || 0).toLocaleString("en-US")
const wan = n => n >= 10000 && n % 10000 === 0 ? `${n / 10000} 万` : money(n)
const hoursText = h => !Number.isFinite(h) ? "—" : h >= 48 ? `约 ${Math.floor(h / 24)} 天` : h >= 1 ? `约 ${Math.floor(h)} 小时` : `不到 1 小时`
const dayLeft = ms => { const h = ms / 3600000; return h >= 24 ? `${Math.floor(h / 24)} 天 ${Math.floor(h % 24)} 小时` : `${Math.max(1, Math.floor(h))} 小时` }

export class FishingPet extends plugin {
  constructor() {
    super({
      name: "钓鱼-宠物",
      dsc: "宠物商店、出战、进化、喂食",
      event: "message",
      priority: 500,
      rule: [
        { reg: /^#?宠物商店$/, fnc: "shop" },
        { reg: /^#?购买宠物\s*(.+)$/, fnc: "buy" },
        { reg: /^#?(?:我的)?宠物$/, fnc: "mine" },
        { reg: /^#?宠物出战\s*(.+)$/, fnc: "active" },
        { reg: /^#?宠物进化\s*(.*)$/, fnc: "evolve" },
        { reg: /^#?(?:喂食宠物|宠物喂食|喂宠物)\s*(.*)$/, fnc: "feed" },
        { reg: /^#?宠物改名\s*(.+)$/, fnc: "rename" },
        { reg: /^#?寻回宠物\s*(.*)$/, fnc: "recall" },
      ],
    })
  }

  get c() { return petCfg() }

  load(e) {
    const user = UserData.get(e.user_id)
    updateNickname(user, e)
    ensurePets(user)
    refreshPets(user)
    return user
  }

  save(user) { UserData.save(user.user_id) }

  /** 操作自己宠物的按钮：只有本人能点，避免误替别人花钱 */
  own(e, text, callback) { return { text, callback, permission: e.user_id } }

  petButtons(e, user) {
    const p = user.pets, c = this.c
    const id = p.active, d = id && p.owned[id]
    const row = []
    if (d && needsBranch(d, c)) for (const b of petDef(id)?.branches || []) row.push(this.own(e, `🔀 ${b.name}`, `#宠物进化 ${b.name}`))
    if (d && d.sat < c.satiety.max) {
      const fill = Math.ceil((c.satiety.max - d.sat) / c.food.value - 1e-9)
      row.push(this.own(e, "🍖 喂 1 份", "#喂食宠物 1"))
      if (fill > 1) row.push(this.own(e, `🍖 喂饱（${fill} 份）`, `#喂食宠物 ${fill}`))
    }
    const nav = [{ text: "🐾 我的宠物", callback: "#我的宠物" }]
    // 有两只以上宠物才显示：点按后在输入框填好 “#宠物出战 ”，补上名字即可
    if (Object.keys(p.owned || {}).length > 1) nav.push({ text: "🔄 切换宠物…", input: "#宠物出战 ", permission: e.user_id })
    nav.push({ text: "🛒 宠物商店", callback: "#宠物商店" }, B.fish)
    return [row.slice(0, 4), nav].filter(r => r.length)
  }

  /* ---------------- 宠物商店 ---------------- */

  /** 只展示可以领养的一阶宠物；进化路线在 #我的宠物 里逐阶预览 */
  shopData(user) {
    const c = this.c, level = characterProgress(user).level
    const lines = petDefs().map(def => {
      const owned = user.pets.owned[def.id], lost = user.pets.lost[def.id], f = def.forms[0]
      return {
        id: def.id, name: def.name, title: def.title, desc: def.desc,
        icon: petIcon(def.id, f), first: f.name, emoji: f.emoji,
        skill: `「${f.skill?.name}」${skillText(f.skill?.effect, f.skill?.value)}`,
        status: owned ? `已拥有 · Lv${petLevel(owned, c)}` : lost ? "离家出走中（可寻回）" : level < c.unlockLevel ? `🔒 角色 Lv${c.unlockLevel} 解锁` : `💰 ${wan(c.price)}金币`,
        owned: !!owned, canBuy: !owned && level >= c.unlockLevel,
      }
    })
    return { name: displayName(user), gold: money(user.gold), lines, price: wan(c.price), unlock: c.unlockLevel, branchLv: branchLevel(c), stageLevels: c.stageLevels }
  }

  async shop(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e), data = this.shopData(user)
    const msg = await renderOrText(puppeteer, "petshop", data, () => [
      `🛒 宠物商店 · ${data.price}金币/只（角色 Lv${data.unlock} 开放）`,
      LINE,
      ...data.lines.map(l => [`${l.emoji} ${l.first} · ${l.title}（${l.status}）`, `　${l.desc}`, `　初始技能${l.skill}`].join("\n")),
      LINE,
      `Lv${data.stageLevels[1]}、Lv${data.stageLevels[2]} 自动进化，Lv${data.branchLv} 选择进化方向 · #购买宠物 名称`,
    ].join("\n"))
    if (!msg) return true
    const buy = data.lines.filter(l => l.canBuy).map(l => ({ text: `🛒 购买${l.first}`, callback: `#购买宠物 ${l.first}` }))
    const rows = []
    for (let i = 0; i < buy.length; i += 3) rows.push(buy.slice(i, i + 3))
    return e.reply(withButtons(e, msg, ...rows, [{ text: "🐾 我的宠物", callback: "#我的宠物" }, B.fish]))
  }

  async buy(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e), c = this.c
    const kw = e.msg.replace(/^#?购买宠物\s*/, "").trim()
    const def = findPetDef(kw)
    if (!def) return e.reply(withButtons(e, `❓ 宠物商店里没有「${kw}」\n可以买的：${petDefs().map(d => d.forms[0].name).join("、")}`, [{ text: "🛒 宠物商店", callback: "#宠物商店" }]))
    const ret = buyPet(user, def.id, Date.now(), c)
    if (!ret.ok) {
      const why = {
        level: `🔒 角色等级不足：宠物商店 Lv${ret.need} 开放（当前 Lv${ret.level}）`,
        owned: `✅ 你已经有一只${def.name}了，同一种宠物只能养一只`,
        gold: `👛 金币不足：需要 ${money(ret.cost)} 金币（当前 ${money(user.gold)}）`,
      }[ret.reason] || "购买失败"
      return e.reply(withButtons(e, why, [{ text: "🐾 我的宠物", callback: "#我的宠物" }]))
    }
    this.save(user)
    const f = def.forms[0]
    return e.reply(withButtons(e, [
      `🎉 ${f.emoji} ${f.name} 来到了你身边！`,
      LINE,
      `💰 花费 ${money(ret.cost)} 金币（剩余 ${money(user.gold)}）`,
      `✨ 初始技能「${f.skill?.name}」：${skillText(f.skill?.effect, f.skill?.value)}`,
      ret.active ? "🎣 已自动出战：钓鱼时一起获得经验，Lv20 / Lv40 自动进化" : "💤 正在休息，可发送 #宠物出战 " + f.name + " 让它出战（每天限换 1 次）",
      `🍖 饱食度 ${c.satiety.max}/${c.satiety.max}，现在出战每天约 -${satPerDay(user.pets.owned[def.id], true, c)}（阶段越高消耗越多），记得 #喂食宠物`,
      ret.replaced ? `⚠️ 之前离家出走的${def.name}已无法再寻回` : "",
    ].filter(Boolean).join("\n"), [{ text: "🐾 我的宠物", callback: "#我的宠物" }, B.fish]))
  }

  /* ---------------- 我的宠物 ---------------- */

  petCard(user, id, d) {
    const c = this.c, def = petDef(id), form = currentForm(def, d, c)
    const level = petLevel(d, c), stage = petStage(d, c), max = effectivePetLevel(d, c) >= c.maxLevel && !!d.branch
    const cur = petThreshold(level, c), next = petThreshold(level + 1, c)
    const waiting = needsBranch(d, c)
    const hours = satHours(user, id, c)
    return {
      id, def, data: d, defName: def?.name || id, name: petName(def, d, c), form: form?.name, emoji: form?.emoji || "🐾",
      icon: petIcon(id, form), level, stage, stageCn: STAGE_CN[stage], active: user.pets.active === id,
      branch: branchDef(def, d.branch)?.name || "", waiting, rawLevel: effectivePetLevel(d, c), max,
      xpText: max ? "已满级" : waiting ? `经验已够 Lv${effectivePetLevel(d, c)}，选择方向后升级` : `${money(Math.max(0, d.xp - cur))} / ${money(next - cur)}`,
      xpPct: max || waiting ? 100 : Math.max(0, Math.min(100, Math.floor((d.xp - cur) / (next - cur) * 100))),
      sat: satText(d, c), satPct: Math.max(0, Math.min(100, d.sat / c.satiety.max * 100)), hungry: isHungry(d, c), warn: d.sat < c.satiety.warn,
      hungryIn: hoursText(hours.hungry), goneIn: hoursText(hours.gone), perDay: satPerDay(d, user.pets.active === id, c),
    }
  }

  mineData(user) {
    const c = this.c, p = user.pets
    const cards = Object.entries(p.owned).map(([id, d]) => this.petCard(user, id, d))
    const main = cards.find(x => x.active) || null
    const rest = cards.filter(x => !x.active)
    let detail = null
    if (main) {
      const { def, data } = main
      const skills = petAbilities(def, data, c).map(s => ({ ...s, stageCn: s.talent ? "天赋" : STAGE_CN[s.stage], text: skillText(s.effect, s.value) }))
      // 下一阶预告：没选方向时列出两个方向
      const next = []
      if (main.stage < 5) {
        if (main.stage < 3 || data.branch) {
          const f = formAt(def, main.stage + 1, data.branch)
          if (f) next.push({ title: `Lv${c.stageLevels[main.stage]} 进化为 ${f.name}`, icon: petIcon(main.id, f), skill: `「${f.skill?.name}」${skillText(f.skill?.effect, f.skill?.value)}` })
        } else {
          for (const b of def.branches || []) {
            const f = b.forms[0]
            next.push({ title: `Lv${c.stageLevels[3]} ${b.name}：进化为 ${f.name}`, icon: petIcon(main.id, f), skill: `「${f.skill?.name}」${skillText(f.skill?.effect, f.skill?.value)}`, desc: b.desc })
          }
        }
      }
      // 进化路线：只显示走过的形态和下一阶（没选方向时下一阶为“选择方向”）
      const path = []
      for (let k = 1; k <= main.stage; k++) {
        const f = formAt(def, k, data.branch)
        path.push({ name: f?.name, icon: petIcon(main.id, f), on: true, now: k === main.stage, lv: c.stageLevels[k - 1] })
      }
      if (main.stage < 5) {
        const f = main.stage < 3 || data.branch ? formAt(def, main.stage + 1, data.branch) : null
        path.push(f ? { name: f.name, icon: petIcon(main.id, f), on: false, lv: c.stageLevels[main.stage] }
          : { name: "选择方向", icon: `<span class="pet-emoji">🔀</span>`, on: false, lv: c.stageLevels[main.stage] })
      }
      detail = { skills, next, path, waitingBranch: needsBranch(data, c) }
    }
    const lost = lostPets(user, Date.now(), c).map(({ id, data, left }) => ({ id, name: petName(petDef(id), data, c), defName: petDef(id)?.name || id, level: petLevel(data, c), left: dayLeft(left) }))
    return {
      name: displayName(user), gold: money(user.gold), main, rest, detail, lost, empty: !cards.length && !lost.length,
      foodPrice: money(c.food.price), foodValue: c.food.value, hungry: c.satiety.hungry, satMax: c.satiety.max,
      recallPrice: wan(c.recall.price), recallDays: c.recall.days, notices: petNotices(user),
      branchLv: branchLevel(c),
    }
  }

  async mine(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e), c = this.c
    const data = this.mineData(user)
    this.save(user)
    if (data.empty) {
      const lv = characterProgress(user).level
      return e.reply(withButtons(e, [
        "🐾 你还没有宠物~",
        lv >= c.unlockLevel ? `🛒 去 #宠物商店 领养一只吧（${wan(c.price)}金币）` : `🔒 角色 Lv${c.unlockLevel} 开放宠物商店（当前 Lv${lv}）`,
      ].join("\n"), [{ text: "🛒 宠物商店", callback: "#宠物商店" }, B.fish]))
    }
    const msg = await renderOrText(puppeteer, "pet", data, () => this.mineText(data))
    if (!msg) return true
    return e.reply(withButtons(e, msg, ...this.petButtons(e, user)))
  }

  mineText(data) {
    const m = data.main
    const lines = [`🐾 ${data.name} 的宠物`, LINE]
    if (m) {
      lines.push(`${m.emoji} ${m.name}（${m.form} · ${m.stageCn}${m.branch ? ` · ${m.branch}` : ""}）Lv${m.level} · 出战中`,
        `📈 经验：${m.xpText}`, `🍖 饱食度：${m.sat}${m.hungry ? "（饥饿，技能失效）" : ""}`,
        "✨ 技能：", ...data.detail.skills.map(s => `　「${s.name}」${s.text}`),
        ...data.detail.next.map(n => `🔮 ${n.title}：${n.skill}`))
    } else lines.push("💤 当前没有出战的宠物，发送 #宠物出战 名称")
    for (const r of data.rest) lines.push(`💤 ${r.emoji} ${r.name} Lv${r.level} · 饱食度 ${r.sat}`)
    for (const l of data.lost) lines.push(`😢 ${l.name} 离家出走中，还剩 ${l.left} 可 #寻回宠物 ${l.defName}（${data.recallPrice} 金币）`)
    lines.push(...data.notices)
    return lines.join("\n")
  }

  /* ---------------- 出战 / 进化 / 喂食 / 改名 / 寻回 ---------------- */

  async active(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e), c = this.c
    const kw = e.msg.replace(/^#?宠物出战\s*/, "").trim()
    const id = findOwnedPet(user, kw, c)
    if (!id) return e.reply(withButtons(e, `❓ 你没有叫「${kw}」的宠物`, [{ text: "🐾 我的宠物", callback: "#我的宠物" }]))
    const ret = setActivePet(user, id, Date.now(), c)
    const name = petName(petDef(id), user.pets.owned[id], c)
    if (!ret.ok) {
      const why = { already: `🎣 ${name} 已经在出战了`, limit: `⏳ 今天已经换过出战宠物了（每天 ${ret.max} 次），明天再来吧~` }[ret.reason] || "出战失败"
      return e.reply(withButtons(e, why, [{ text: "🐾 我的宠物", callback: "#我的宠物" }]))
    }
    this.save(user)
    return e.reply(withButtons(e, [
      `🎣 ${name} 出战！钓鱼时一起获得经验，技能开始生效`,
      ret.free ? "" : `🔁 今天还能更换 ${ret.left} 次`,
      `🍖 饱食度 ${satText(user.pets.owned[id], c)}（出战每天约 -${satPerDay(user.pets.owned[id], true, c)}）`,
    ].filter(Boolean).join("\n"), [{ text: "🐾 我的宠物", callback: "#我的宠物" }, B.fish]))
  }

  async evolve(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e), c = this.c
    const kw = e.msg.replace(/^#?宠物进化\s*/, "").trim()
    // 优先出战宠物；出战的不需要选时找其他等待选择的
    const ids = [user.pets.active, ...Object.keys(user.pets.owned)].filter(Boolean)
    const id = ids.find(i => needsBranch(user.pets.owned[i], c)) || user.pets.active
    if (!id) return e.reply(withButtons(e, "🐾 你还没有出战的宠物", [{ text: "🛒 宠物商店", callback: "#宠物商店" }]))
    const def = petDef(id), d = user.pets.owned[id], name = petName(def, d, c)
    if (!kw) return e.reply(withButtons(e, this.branchIntro(def, d, name), (def.branches || []).map(b => this.own(e, `🔀 ${b.name}`, `#宠物进化 ${b.name}`))))
    const ret = evolvePet(user, id, kw, Date.now(), c)
    if (!ret.ok) {
      const why = {
        chosen: `✅ ${name} 已经选择了「${ret.branch?.name}」，进化方向不能更改`,
        level: `⏳ ${name} 需要达到 Lv${ret.need} 才能选择进化方向（当前 Lv${ret.level}）`,
        unknown: `❓ 没有「${kw}」这个方向，可选：${(ret.branches || []).map(b => b.name).join(" / ")}`,
      }[ret.reason] || "进化失败"
      return e.reply(withButtons(e, why, [{ text: "🐾 我的宠物", callback: "#我的宠物" }]))
    }
    this.save(user)
    const f = ret.form
    const skills = petSkills(def, d, c)
    return e.reply(withButtons(e, [
      `🌟 ${name} 选择了「${ret.branch.name}」，进化成了 ${f.emoji} ${f.name}！`,
      LINE,
      ...skills.filter(s => s.stage >= 4).map(s => `✨ 解锁技能「${s.name}」：${skillText(s.effect, s.value)}`),
      ret.after > ret.before ? `🎉 累积的经验生效：Lv${ret.before} → Lv${ret.after}` : "",
      ret.stage < 5 ? `🔮 Lv${c.stageLevels[4]} 将进化为 ${formAt(def, 5, d.branch)?.name}` : "",
    ].filter(Boolean).join("\n"), [{ text: "🐾 我的宠物", callback: "#我的宠物" }, B.fish]))
  }

  branchIntro(def, d, name) {
    const c = this.c
    const head = needsBranch(d, c)
      ? `🔀 ${name} 已达到 Lv${branchLevel(c)}，请选择进化方向（选定后不能更改）：`
      : `🔮 ${name} 到 Lv${branchLevel(c)} 时可以选择进化方向（当前 Lv${petLevel(d, c)}）：`
    return [head, LINE, ...(def.branches || []).flatMap(b => [
      `【${b.name}】${b.desc || ""}`,
      ...b.forms.slice(0, 1).map(f => `　${STAGE_CN[4]} ${f.emoji} ${f.name}「${f.skill?.name}」${skillText(f.skill?.effect, f.skill?.value)}`),
    ]), LINE, `发送 ${(def.branches || []).map(b => `#宠物进化 ${b.name}`).join(" 或 ")}`].join("\n")
  }

  async feed(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e), c = this.c
    const args = e.msg.replace(/^#?(?:喂食宠物|宠物喂食|喂宠物)\s*/, "").trim()
    const m = args.match(/^(.*?)\s*(\d+)?\s*(?:份)?$/)
    const kw = (m?.[1] || "").trim(), count = Number(m?.[2]) || 1
    const id = kw ? findOwnedPet(user, kw, c) : user.pets.active
    if (!id) return e.reply(withButtons(e, kw ? `❓ 你没有叫「${kw}」的宠物` : "🐾 你还没有出战的宠物，可以 #喂食宠物 名称 份数", [{ text: "🐾 我的宠物", callback: "#我的宠物" }]))
    const d = user.pets.owned[id], name = petName(petDef(id), d, c)
    const ret = feedPet(user, id, count, Date.now(), c)
    if (!ret.ok) {
      const why = {
        full: `😋 ${name} 已经吃饱了（饱食度 ${satText(d, c)}）`,
        gold: `👛 金币不足：${ret.cost / c.food.price} 份口粮需要 ${money(ret.cost)} 金币${ret.afford ? `，最多买得起 ${ret.afford} 份` : ""}`,
      }[ret.reason] || "喂食失败"
      return e.reply(withButtons(e, why, [{ text: "🐾 我的宠物", callback: "#我的宠物" }]))
    }
    this.save(user)
    return e.reply(withButtons(e, [
      `🍖 ${name} 吃了 ${ret.units} 份口粮，饱食度 ${satText(d, c)}`,
      `💰 花费 ${money(ret.cost)} 金币（剩余 ${money(user.gold)}）`,
      ret.capped ? `💡 已经喂饱了，多出来的 ${count - ret.units} 份没有扣钱` : "",
      `⏳ 还能撑${hoursText(satHours(user, id, c).hungry)}才会饿`,
    ].filter(Boolean).join("\n"), [{ text: "🐾 我的宠物", callback: "#我的宠物" }, B.fish]))
  }

  async rename(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e), c = this.c
    const id = user.pets.active
    if (!id) return e.reply("🐾 你还没有出战的宠物，先 #宠物出战 名称")
    const old = petName(petDef(id), user.pets.owned[id], c)
    const ret = renamePet(user, id, e.msg.replace(/^#?宠物改名\s*/, ""), c)
    if (!ret.ok) return e.reply("❓ 名字不能为空（最多 8 个字）")
    this.save(user)
    return e.reply(`✏️ ${old} 改名为「${ret.name}」`)
  }

  async recall(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e), c = this.c
    const kw = e.msg.replace(/^#?寻回宠物\s*/, "").trim()
    const lost = lostPets(user, Date.now(), c)
    if (!lost.length) return e.reply(withButtons(e, "🐾 没有可以寻回的宠物（离家出走超过 " + c.recall.days + " 天就找不回来了）", [{ text: "🐾 我的宠物", callback: "#我的宠物" }]))
    const pick = kw ? lost.find(l => findOwnedPet(user, kw, c, petDefs(), { [l.id]: l.data })) : lost.length === 1 ? lost[0] : null
    if (!pick) return e.reply(withButtons(e, [`😢 离家出走中的宠物：`, ...lost.map(l => `· ${petName(petDef(l.id), l.data, c)}（${petDef(l.id)?.name}）还剩 ${dayLeft(l.left)}`), `发送 #寻回宠物 名称（${wan(c.recall.price)}金币）`].join("\n"),
      lost.map(l => this.own(e, `🔍 寻回${petDef(l.id)?.name}`, `#寻回宠物 ${petDef(l.id)?.name}`))))
    const name = petName(petDef(pick.id), pick.data, c)
    const ret = recallPet(user, pick.id, Date.now(), c)
    if (!ret.ok) {
      const why = { expired: `😢 ${name} 已经走远了，找不回来了`, owned: `🐾 你已经有一只${petDef(pick.id)?.name}了，不能再寻回`, gold: `👛 金币不足：寻回需要 ${money(ret.cost)} 金币` }[ret.reason] || "寻回失败"
      return e.reply(why)
    }
    this.save(user)
    return e.reply(withButtons(e, [`🎉 找到 ${name} 了！它饿坏了，已经喂饱`, `💰 花费 ${money(ret.cost)} 金币（剩余 ${money(user.gold)}）`, `📈 等级、经验、进化方向都保留着（Lv${petLevel(user.pets.owned[pick.id], c)}）`].join("\n"),
      [{ text: "🐾 我的宠物", callback: "#我的宠物" }, B.fish]))
  }
}
