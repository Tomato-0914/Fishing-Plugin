import Config from "./Config.js"
import Version from "./Version.js"
import { Plugin_Name, Res_Path } from "./Paths.js"

/** 白版：6:00 ~ 17:59；黑版：其余时间（时间写死） */
export function theme(date = new Date()) {
  const h = date.getHours()
  return h >= 6 && h < 18 ? "light" : "dark"
}

/**
 * 渲染 resources/<name>/<name>.html，失败返回 null
 */
export async function render(puppeteer, name, data = {}) {
  if (!puppeteer) return null
  try {
    return await puppeteer.screenshot(`Fishing-Plugin/${name}`, {
      tplFile: `${Res_Path}/${name}/${name}.html`,
      saveId: name,
      imgType: "jpeg",
      quality: 90,
      // 模板被复制到 {data|temp}/html/Fishing-Plugin/<name>/ 下渲染，用相对路径兼容 Windows
      _res: `../../../../plugins/${Plugin_Name}/resources`,
      theme: theme(),
      version: Version.ver,
      ...data,
    })
  } catch (err) {
    logger.error(`[Fishing-Plugin] 渲染 ${name} 失败：${err.message}`)
    return null
  }
}

/** 渲染图片，失败时按配置退回文字 */
export async function renderOrText(puppeteer, name, data, textFn) {
  const img = await render(puppeteer, name, data)
  if (img) return img
  return Config.config.textFallback === false ? null : textFn()
}
