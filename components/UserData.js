/** 用户存档：默认存入 data/fishing.db（SQLite），也可配置为 data/Fishing_<user_id>.yaml；所有群共享 */
import { Data_Path } from "./Paths.js"
import { YamlBackend, SqliteBackend, migrateYamlToDb, exportDbToYaml, readYamlDir, safeId } from "./Storage.js"

export { safeId }

const log = (level, msg) => globalThis.logger?.[level]?.(`[Fishing-Plugin] ${msg}`)

export function newUser(id) {
  return {
    user_id: String(id),
    nickname: "",
    gold: 0,
    baits: {},
    baitUse: "basic",
    gear: { rod: 1, line: 1, float: 1, net: 1 },
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
    records: {},
    checkin: { day: "", luck: 0, time: 0, streak: 0, total: 0, history: [] },
    created: Date.now(),
  }
}

/** 补齐旧存档缺失的字段 */
function normalize(data, id) {
  const base = newUser(id)
  const user = { ...base, ...data }
  user.stats = { ...base.stats, ...(data?.stats || {}) }
  for (const k of ["groups", "bag", "titles"]) if (!Array.isArray(user[k])) user[k] = []
  for (const k of ["period", "dex", "records"]) if (!user[k] || typeof user[k] !== "object") user[k] = {}
  // 旧版单一鱼饵数量 → 普通饵
  if (!user.baits || typeof user.baits !== "object") user.baits = {}
  if (data?.bait != null) {
    user.baits.basic = (Number(user.baits.basic) || 0) + (Number(data.bait) || 0)
    delete user.bait
  }
  user.gear = { ...base.gear, ...(data?.gear || {}) }
  user.checkin = { ...base.checkin, ...(data?.checkin || {}) }
  if (!Array.isArray(user.checkin.history)) user.checkin.history = []
  user.user_id = String(user.user_id || id)
  return user
}

class UserData {
  constructor(dir = Data_Path) {
    this.dir = dir
    this.cache = new Map()
    this.queues = new Map()
    this.backend = null
  }

  get isDb() {
    return this.backend instanceof SqliteBackend
  }

  /**
   * 启动时调用：打开存储并读入全部存档
   * @param storage "db" | "yaml"；db 不可用时自动退回 yaml
   * @param driver  "auto" | "sqlite3" | "node:sqlite"
   * @returns {{ count:number, backend:string, migration?:object, fallback?:string }}
   */
  async init({ storage = "db", driver = "auto", autoMigrate = true } = {}) {
    const info = {}
    if (storage === "db") {
      const db = new SqliteBackend(this.dir, driver)
      try {
        await db.init()
        this.backend = db
      } catch (err) {
        info.fallback = err.message
        log("warn", `${err.message}，改用 YAML 文件存档`)
      }
    }
    if (!this.backend) {
      this.backend = new YamlBackend(this.dir)
      await this.backend.init()
    }
    // 从 YAML 切换到数据库：自动导入旧存档
    if (this.isDb && autoMigrate && readYamlDir(this.dir).length) {
      info.migration = await migrateYamlToDb(this.dir, this.backend)
      const m = info.migration
      log("mark", `已将 ${m.migrated.length} 份 YAML 存档导入数据库（跳过 ${m.skipped.length}，失败 ${m.failed.length}），原文件备份在 ${m.backupDir}`)
    }
    this.cache.clear()
    for (const { id, data } of await this.backend.loadAll()) this.cache.set(id, normalize(data, id))
    return { ...info, count: this.cache.size, backend: this.backend.name }
  }

  /** 获取存档（不存在时返回新存档，保存后才写入） */
  get(id) {
    id = String(id)
    let user = this.cache.get(id)
    if (!user) this.cache.set(id, (user = newUser(id)))
    return user
  }

  has(id) {
    return this.cache.has(String(id))
  }

  all() {
    return [...this.cache.values()]
  }

  /** 保存：同一用户串行写入 */
  save(id) {
    id = String(id)
    const prev = this.queues.get(id) || Promise.resolve()
    const next = prev.then(async () => {
      const user = this.cache.get(id)
      if (user) await this.backend.write(id, user)
    }).catch(err => log("error", `存档 ${id} 保存失败：${err.message}`))
    this.queues.set(id, next)
    next.finally(() => { if (this.queues.get(id) === next) this.queues.delete(id) })
    return next
  }

  /** 等待所有未完成的写入 */
  async flush() {
    await Promise.all([...this.queues.values()])
  }

  /** 手动迁移：把 data/ 下的 YAML 存档导入数据库，并刷新内存中的对应存档 */
  async migrate({ overwrite = false } = {}) {
    if (!this.isDb) throw new Error("当前未使用数据库存储（config.yaml 中 storage 不是 db，或 SQLite 驱动不可用）")
    await this.flush()
    const result = await migrateYamlToDb(this.dir, this.backend, { overwrite })
    if (result.migrated.length) {
      const changed = new Set(result.migrated)
      for (const { id, data } of await this.backend.loadAll()) {
        if (!changed.has(id)) continue
        const fresh = normalize(data, id)
        const cur = this.cache.get(id)
        // 原地更新，避免进行中的钓鱼拿着旧对象
        if (cur) { for (const k of Object.keys(cur)) delete cur[k]; Object.assign(cur, fresh) } else this.cache.set(id, fresh)
      }
    }
    return result
  }

  /** 把数据库导出为 YAML 文件（备份 / 切回 YAML 存储时使用） */
  async export() {
    if (!this.isDb) throw new Error("当前未使用数据库存储")
    await this.flush()
    return exportDbToYaml(this.dir, this.backend)
  }

  async count() {
    return this.isDb ? this.backend.count() : this.cache.size
  }

  async close() {
    await this.flush()
    await this.backend?.close()
  }
}

export { UserData }
export default new UserData()
