import Config from "./Config.js"
import { RARITY_INFO } from "./ItemPool.js"
import { getEffects, mergeEffects } from "./Titles.js"
import { luckEffects } from "./Game.js"
import { gearEffects, allEffects, currentBait } from "./Gear.js"
import { petEffects } from "./Pet.js"

/**
 * 玩家抛一竿时的全部效果：称号 + 今日幸运 + 渔具 + 出战宠物（饥饿时不算） + 鱼饵
 * 钓鱼结算与图鉴概率共用，保证图鉴显示的就是实际概率
 * @param bait 本竿鱼饵；不传时取当前使用的鱼饵，传 null 表示不算鱼饵
 */
export function playerEffects(user, bait = currentBait(user, Config.shop)) {
  return allEffects({
    titles: getEffects(user, Config.titles, Config.items),
    luck: luckEffects(user, Config.config.checkin?.tiers),
    gear: gearEffects(user, Config.shop),
    bait: mergeEffects(bait?.effects, petEffects(user)),
  })
}

/** 本群是否可用 */
export function groupAllowed(e) {
  const cfg = Config.config
  if (cfg.enable === false) return false
  if (!e.isGroup) return true
  const gid = String(e.group_id)
  if ((cfg.blackGroups || []).map(String).includes(gid)) return false
  const white = (cfg.whiteGroups || []).map(String)
  return !white.length || white.includes(gid)
}

/** 物品表 id → item */
export function itemMap() {
  return new Map((Config.items || []).map(i => [i.id, i]))
}

/** 显示用昵称：未知昵称的 openid 用户显示“钓友xxxx” */
export function displayName(user) {
  if (user.nickname) return user.nickname
  const id = String(user.user_id)
  return /^\d+$/.test(id) ? id : `钓友${id.slice(-4)}`
}

/** 记录发言者昵称（QQBot 协议通常拿不到） */
export function updateNickname(user, e) {
  const name = e.sender?.card || e.sender?.nickname || e.nickname
  if (name && String(name) !== String(e.user_id)) user.nickname = String(name).slice(0, 20)
}

export function avatar(id) {
  return /^\d{5,12}$/.test(String(id)) ? `https://q1.qlogo.cn/g?b=qq&s=100&nk=${id}` : ""
}

export const rarityLabel = r => RARITY_INFO[r]?.label ?? r

export const pick = arr => arr[Math.floor(Math.random() * arr.length)]
