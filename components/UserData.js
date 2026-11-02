/** 用户存档：data/Fishing_<user_id>.yaml，所有群共享 */
import fs from "node:fs"
import path from "node:path"
import YAML from "yaml"
import { Data_Path } from "./Paths.js"

const PREFIX = "Fishing_"

/** 非数字 ID（如 QQBot 未绑定用户的 openid）清洗为安全文件名 */
export const safeId = id => String(id).replace(/[^A-Za-z0-9_-]/g, "_")

export function newUser(id) {
  return {
    user_id: String(id),
    nickname: "",
    gold: 0,
    bait: 0,
    welcomed: false,
    reliefDay: "",
    groups: [],
    bag: [],
    stats: {
      casts: 0, catches: 0, junk: 0, empty: 0, escaped: 0, early: 0,
      junkCleaned: 0, police: 0, heart: 0, ur: 0, earned: 0, sold: 0,
      baitBought: 0, baitSpent: 0,
    },
    maxFish: null,
    period: {},
    dex: {},
    titles: [],
    created: Date.now(),
  }
}

/** 补齐旧存档缺失的字段 */
function normalize(data, id) {
  const base = newUser(id)
  const user = { ...base, ...data }
  user.stats = { ...base.stats, ...(data?.stats || {}) }
  for (const k of ["groups", "bag", "titles"]) if (!Array.isArray(user[k])) user[k] = []
  for (const k of ["period", "dex"]) if (!user[k] || typeof user[k] !== "object") user[k] = {}
  user.user_id = String(user.user_id || id)
  return user
}

class UserData {
  constructor(dir = Data_Path) {
    this.dir = dir
    this.cache = new Map()
    this.queues = new Map()
  }

  file(id) {
    return path.join(this.dir, `${PREFIX}${safeId(id)}.yaml`)
  }

  /** 启动时读入全部存档，返回数量 */
  loadAll() {
    fs.mkdirSync(this.dir, { recursive: true })
    let n = 0
    for (const f of fs.readdirSync(this.dir)) {
      if (!f.startsWith(PREFIX) || !f.endsWith(".yaml")) continue
      try {
        const data = YAML.parse(fs.readFileSync(path.join(this.dir, f), "utf8")) || {}
        const id = String(data.user_id || f.slice(PREFIX.length, -5))
        this.cache.set(id, normalize(data, id))
        n++
      } catch (err) {
        globalThis.logger?.error?.(`[Fishing-Plugin] 存档 ${f} 读取失败：${err.message}`)
      }
    }
    return n
  }

  /** 获取存档（不存在时返回新存档，但不写盘） */
  get(id) {
    id = String(id)
    let user = this.cache.get(id)
    if (user) return user
    const file = this.file(id)
    if (fs.existsSync(file)) {
      try {
        user = normalize(YAML.parse(fs.readFileSync(file, "utf8")) || {}, id)
      } catch (err) {
        // 存档损坏时备份原文件，避免被新存档覆盖
        fs.copyFileSync(file, `${file}.broken-${Date.now()}`)
        globalThis.logger?.error?.(`[Fishing-Plugin] 存档 ${file} 损坏，已备份：${err.message}`)
      }
    }
    user ||= newUser(id)
    this.cache.set(id, user)
    return user
  }

  has(id) {
    return this.cache.has(String(id)) || fs.existsSync(this.file(id))
  }

  all() {
    return [...this.cache.values()]
  }

  /** 保存：同一用户串行写入，先写临时文件再重命名，防止写一半损坏 */
  save(id) {
    id = String(id)
    const prev = this.queues.get(id) || Promise.resolve()
    const next = prev.then(async () => {
      const user = this.cache.get(id)
      if (!user) return
      await fs.promises.mkdir(this.dir, { recursive: true })
      const file = this.file(id)
      const tmp = `${file}.${process.pid}.tmp`
      await fs.promises.writeFile(tmp, YAML.stringify(user), "utf8")
      await fs.promises.rename(tmp, file)
    }).catch(err => {
      globalThis.logger?.error?.(`[Fishing-Plugin] 存档 ${id} 保存失败：${err.message}`)
    })
    this.queues.set(id, next)
    next.finally(() => { if (this.queues.get(id) === next) this.queues.delete(id) })
    return next
  }
}

export { UserData }
export default new UserData()
