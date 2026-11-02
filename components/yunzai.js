/** Yunzai 运行时依赖（仅 apps 引用，组件保持可单测） */
import path from "node:path"
import { pathToFileURL } from "node:url"

/** 以 Yunzai 根目录（process.cwd）定位，插件目录是软链接时也能找到 */
const yzImport = file => import(pathToFileURL(path.join(process.cwd(), file)).href)

export const plugin = global.plugin || (await yzImport("lib/plugins/plugin.js")).default

let pptr = null
try {
  pptr = (await yzImport("lib/puppeteer/puppeteer.js")).default
} catch (err) {
  logger.warn(`[Fishing-Plugin] 未找到 puppeteer，将使用文字消息：${err.message}`)
}
export const puppeteer = pptr
