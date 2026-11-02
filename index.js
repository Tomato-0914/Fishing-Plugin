import fs from "node:fs/promises"
import path from "node:path"
import { Plugin_Name, Plugin_Path } from "./components/Paths.js"
import Version from "./components/Version.js"
import UserData from "./components/UserData.js"

const startTime = Date.now()
const apps = {}
let ok = 0
const errors = []

const appDir = path.join(Plugin_Path, "apps")
const files = (await fs.readdir(appDir)).filter(f => f.endsWith(".js"))

await Promise.all(files.map(async file => {
  try {
    const mod = await import(`file://${path.join(appDir, file)}?t=${Date.now()}`)
    for (const [key, value] of Object.entries(mod)) {
      if (typeof value !== "function" || !value.prototype) continue
      let name = key === "default" ? path.basename(file, ".js") : key
      while (Object.hasOwn(apps, name)) name += "_"
      apps[name] = value
      ok++
    }
  } catch (err) {
    errors.push({ file, msg: err.message })
    logger.error(`[${Plugin_Name}] 加载失败: ${file}\n${err.stack}`)
  }
}))

// 预加载所有用户存档，排行榜查询不再读盘
const users = UserData.loadAll()

logger.mark(logger.cyan("--------------🎣--------------"))
logger.mark(logger.cyan(`钓鱼插件 v${Version.ver} 初始化完成`))
logger.info(logger.green(`[${Plugin_Name}] 加载 ${ok} 个功能，读取 ${users} 份钓友存档，耗时 ${Date.now() - startTime}ms`))
for (const e of errors) logger.error(`[${Plugin_Name}] ❎ ${e.file}: ${e.msg}`)
logger.mark(logger.cyan("--------------🎣--------------"))

export { apps }
