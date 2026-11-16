import Config from "./Config.js"

/** 当前消息是否来自 QQBot 协议且支持按钮 */
export function supportButton(e) {
  return Config.config.button !== false &&
    e?.bot?.adapter?.id === "QQBot" &&
    typeof global.segment?.button === "function"
}

/**
 * 会花金币 / 鱼饵或改动存档的指令：按钮只给触发这条消息的人点，避免别人代点
 * 只是查看、跳转或填入输入框的按钮不限制
 */
const OWN_EXACT = new Set(["#钓鱼", "#十连钓鱼", "#百连钓鱼", "#收杆", "#一键出售", "#清理垃圾", "#打卡"])
const OWN_PREFIX = [/^#渔具(强化|锻造)\s/, /^#购买渔具\s*\S/, /^#装备渔具/, /^#使用.+套装$/, /^#购买鱼饵\s/, /^#使用鱼饵\s/, /^#出售\s/]
export const isOwnAction = cmd => {
  cmd = String(cmd || "").trim()
  return OWN_EXACT.has(cmd) || OWN_PREFIX.some(r => r.test(cmd))
}

/** 操作类回调按钮加上 permission（已指定 permission 的不改，如主人专用） */
export function limitToSender(e, button) {
  if (!button?.callback || button.permission || !e?.user_id || !isOwnAction(button.callback)) return button
  return { ...button, permission: e.user_id }
}

/**
 * 给消息附加按钮；非 QQBot 协议原样返回，不发送按钮
 * @param rows 每个参数是一行按钮，如 [{text,callback}], [{text,input}]
 */
export function withButtons(e, msg, ...rows) {
  rows = rows.filter(r => Array.isArray(r) ? r.length : r)
  if (!rows.length || !supportButton(e)) return msg
  rows = rows.map(r => Array.isArray(r) ? r.map(b => limitToSender(e, b)) : limitToSender(e, r))
  return [msg, segment.button(...rows)].flat()
}

/** 常用按钮 */
export const B = {
  cast: { text: "🎣 再来一竿", callback: "#钓鱼" },
  start: { text: "🎣 开始钓鱼", callback: "#钓鱼" },
  multi: { text: "🔟 十连钓鱼", callback: "#十连钓鱼" },
  hundred: { text: "💯 百连钓鱼", callback: "#百连钓鱼" },
  fish: { text: "🎣 钓鱼", callback: "#钓鱼" },
  reel: e => ({ text: "🪝 收杆！", callback: "#收杆", permission: e.user_id }),
  bag: { text: "🎒 我的鱼护", callback: "#我的鱼护" },
  sellAll: { text: "💰 一键出售", callback: "#一键出售" },
  sell: { text: "🏷️ 出售…", input: "#出售 " },
  discard: { text: "♻️ 清理垃圾", callback: "#清理垃圾" },
  help: { text: "📖 钓鱼帮助", callback: "#钓鱼帮助" },
  shop: { text: "🏪 鱼饵商店", callback: "#鱼饵商店" },
  workshop: { text: "🔧 购买渔具", callback: "#购买渔具" },
  myGear: { text: "🧰 我的渔具", callback: "#我的渔具" },
  checkin: { text: "📅 打卡", callback: "#打卡" },
  luckRank: { text: "🍀 幸运榜", callback: "#幸运值排行" },
  buyBait: { text: "🥣 普通饵×10", callback: "#购买鱼饵 普通饵 10" },
  myBait: { text: "🧺 我的鱼饵", callback: "#我的鱼饵" },
  buyBaitInput: { text: "🪱 购买鱼饵…", input: "#购买鱼饵 " },
  dayRank: { text: "今日榜", callback: "#钓鱼排行榜" },
  weekRank: { text: "周榜", callback: "#钓鱼周排行" },
  monthRank: { text: "月榜", callback: "#钓鱼月排行" },
  totalRank: { text: "🏆 总榜", callback: "#钓鱼总榜" },
  titles: { text: "🏅 我的称号", callback: "#我的称号" },
  dex: { text: "📚 图鉴", callback: "#钓鱼图鉴" },
  dexSearch: { text: "🔍 查图鉴…", input: "#钓鱼图鉴 " },
  info: { text: "👤 钓鱼信息", callback: "#钓鱼信息" },
  repo: { text: "⭐ 项目地址", link: "https://github.com/Tomato-0914/Fishing-Plugin" },
}
