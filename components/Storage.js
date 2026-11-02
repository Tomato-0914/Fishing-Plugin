/** 存档后端：SQLite（data/fishing.db）或 YAML 文件（data/Fishing_<id>.yaml） */
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import YAML from "yaml"

export const PREFIX = "Fishing_"
export const DB_FILE = "fishing.db"

/** 非数字 ID（如 QQBot 未绑定用户的 openid）清洗为安全文件名 */
export const safeId = id => String(id).replace(/[^A-Za-z0-9_-]/g, "_")

const log = (level, msg) => globalThis.logger?.[level]?.(`[Fishing-Plugin] ${msg}`)

/* ---------------- YAML ---------------- */

export class YamlBackend {
  constructor(dir) {
    this.dir = dir
    this.name = "YAML"
  }

  async init() {
    fs.mkdirSync(this.dir, { recursive: true })
  }

  file(id) {
    return path.join(this.dir, `${PREFIX}${safeId(id)}.yaml`)
  }

  /** 返回 [{ id, data }] */
  async loadAll() {
    return readYamlDir(this.dir).map(({ id, data }) => ({ id, data }))
  }

  async write(id, user) {
    const file = this.file(id)
    const tmp = `${file}.${process.pid}.tmp`
    await fs.promises.writeFile(tmp, YAML.stringify(user), "utf8")
    await fs.promises.rename(tmp, file)
  }

  async close() {}
}

/** 读取目录下所有 Fishing_*.yaml，损坏的文件记入 failed */
export function readYamlDir(dir, failed = []) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith(PREFIX) || !f.endsWith(".yaml")) continue
    const file = path.join(dir, f)
    try {
      const data = YAML.parse(fs.readFileSync(file, "utf8")) || {}
      out.push({ id: String(data.user_id || f.slice(PREFIX.length, -5)), data, file })
    } catch (err) {
      failed.push({ file, msg: err.message })
      log("error", `存档 ${f} 读取失败：${err.message}`)
    }
  }
  return out
}

/* ---------------- SQLite ---------------- */

const SCHEMA = `CREATE TABLE IF NOT EXISTS users (
  user_id    TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`

/** node:sqlite（Node ≥ 22.5 内置，同步 API） */
async function openNodeSqlite(file) {
  const { DatabaseSync } = await import("node:sqlite")
  const db = new DatabaseSync(file)
  db.exec("PRAGMA journal_mode = WAL")
  db.exec(SCHEMA)
  return {
    driver: "node:sqlite",
    all: (sql, ...p) => db.prepare(sql).all(...p),
    get: (sql, ...p) => db.prepare(sql).get(...p),
    run: (sql, ...p) => { db.prepare(sql).run(...p) },
    close: () => db.close(),
  }
}

/** sqlite3（Yunzai 通常自带） */
async function openSqlite3(file) {
  const require = createRequire(path.join(process.cwd(), "package.json"))
  let sqlite3
  try {
    sqlite3 = require("sqlite3")
  } catch {
    sqlite3 = (await import("sqlite3")).default
  }
  const db = await new Promise((resolve, reject) => {
    const d = new sqlite3.Database(file, err => err ? reject(err) : resolve(d))
  })
  const call = (method, sql, p) => new Promise((resolve, reject) =>
    db[method](sql, p, function (err, rows) { err ? reject(err) : resolve(rows) }))
  await call("run", "PRAGMA journal_mode = WAL", [])
  await call("run", SCHEMA, [])
  return {
    driver: "sqlite3",
    all: (sql, ...p) => call("all", sql, p),
    get: (sql, ...p) => call("get", sql, p),
    run: (sql, ...p) => call("run", sql, p).then(() => {}),
    close: () => new Promise(resolve => db.close(() => resolve())),
  }
}

const DRIVERS = { sqlite3: openSqlite3, "node:sqlite": openNodeSqlite }

export class SqliteBackend {
  /** @param driver "auto" | "sqlite3" | "node:sqlite" */
  constructor(dir, driver = "auto") {
    this.dir = dir
    this.file = path.join(dir, DB_FILE)
    this.driver = driver
    this.name = "SQLite"
  }

  async init() {
    fs.mkdirSync(this.dir, { recursive: true })
    const order = this.driver === "auto" ? ["sqlite3", "node:sqlite"] : [this.driver]
    const errors = []
    for (const name of order) {
      try {
        if (!DRIVERS[name]) throw new Error("未知驱动")
        this.db = await DRIVERS[name](this.file)
        this.name = `SQLite（${name}）`
        return
      } catch (err) {
        errors.push(`${name}: ${err.message}`)
      }
    }
    throw new Error(`没有可用的 SQLite 驱动（${errors.join("；")}）`)
  }

  async loadAll() {
    const rows = await this.db.all("SELECT user_id, data FROM users")
    const out = []
    for (const r of rows) {
      try {
        out.push({ id: String(r.user_id), data: JSON.parse(r.data) })
      } catch (err) {
        log("error", `数据库中用户 ${r.user_id} 的存档损坏：${err.message}`)
      }
    }
    return out
  }

  async has(id) {
    return !!(await this.db.get("SELECT 1 AS x FROM users WHERE user_id = ?", String(id)))
  }

  async count() {
    return (await this.db.get("SELECT COUNT(*) AS n FROM users")).n
  }

  async write(id, user) {
    await this.db.run(
      "INSERT INTO users (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
      String(id), JSON.stringify(user), Date.now())
  }

  async close() {
    await this.db?.close()
  }
}

/* ---------------- 迁移 ---------------- */

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15)

/**
 * YAML → 数据库：导入 data/ 下的 Fishing_*.yaml，导入后（含跳过的）移到 data/yaml_backup_<时间>/
 * @param overwrite 数据库已有该用户时是否覆盖（默认跳过，以数据库为准）
 */
export async function migrateYamlToDb(dir, db, { overwrite = false } = {}) {
  const failed = []
  const files = readYamlDir(dir, failed)
  const result = { migrated: [], skipped: [], failed, backupDir: "" }
  if (!files.length) return result
  for (const { id, data, file } of files) {
    try {
      if (!overwrite && await db.has(id)) result.skipped.push(id)
      else {
        await db.write(id, { ...data, user_id: id })
        result.migrated.push(id)
      }
    } catch (err) {
      failed.push({ file, msg: err.message })
      continue
    }
  }
  // 成功导入或跳过的文件移入备份目录，不删除
  const done = new Set([...result.migrated, ...result.skipped])
  const backupDir = path.join(dir, `yaml_backup_${stamp()}`)
  for (const { id, file } of files) {
    if (!done.has(id)) continue
    fs.mkdirSync(backupDir, { recursive: true })
    fs.renameSync(file, path.join(backupDir, path.basename(file)))
  }
  if (fs.existsSync(backupDir)) result.backupDir = backupDir
  return result
}

/** 数据库 → YAML：导出到 data/yaml_export_<时间>/，不影响数据库 */
export async function exportDbToYaml(dir, db) {
  const rows = await db.loadAll()
  const outDir = path.join(dir, `yaml_export_${stamp()}`)
  fs.mkdirSync(outDir, { recursive: true })
  for (const { id, data } of rows)
    fs.writeFileSync(path.join(outDir, `${PREFIX}${safeId(id)}.yaml`), YAML.stringify(data), "utf8")
  return { count: rows.length, outDir }
}
