import Config from "./Config.js"

/** 当前消息是否来自 QQBot 协议且支持按钮 */
export function supportButton(e) {
  return Config.config.button !== false &&
    e?.bot?.adapter?.id === "QQBot" &&
    typeof global.segment?.button === "function"
}

/**
 * 给消息附加按钮；非 QQBot 协议原样返回，不发送按钮
 * @param rows 每个参数是一行按钮，如 [{text,callback}], [{text,input}]
 */
export function withButtons(e, msg, ...rows) {
  rows = rows.filter(r => Array.isArray(r) ? r.length : r)
  if (!rows.length || !supportButton(e)) return msg
  return [msg, segment.button(...rows)].flat()
}

/** 常用按钮 */
export const B = {
  cast: { text: "🎣 再来一竿", callback: "#钓鱼" },
  start: { text: "🎣 开始钓鱼", callback: "#钓鱼" },
  multi: { text: "🔟 十连钓鱼", callback: "#十连钓鱼" },
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
  info: { text: "👤 个人信息", callback: "#个人信息" },
  repo: { text: "⭐ 项目地址", link: "https://github.com/Tomato-0914/Fishing-Plugin" },
}
