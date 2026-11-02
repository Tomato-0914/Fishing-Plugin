import fs from "node:fs"
import path from "node:path"
import YAML from "yaml"
import { Plugin_Path } from "./Paths.js"

const DEF_DIR = path.join(Plugin_Path, "config", "default_config")
const USER_DIR = path.join(Plugin_Path, "config", "config")


const isObj = v => v && typeof v === "object" && !Array.isArray(v)

function merge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over
  const out = { ...base }
  for (const k of Object.keys(over)) out[k] = merge(base[k], over[k])
  return out
}

function readYaml(file) {
  if (!fs.existsSync(file)) return undefined
  return YAML.parse(fs.readFileSync(file, "utf8"))
}

class Config {
  constructor() {
    this.cache = new Map()
  }

  mtime(file) {
    try { return fs.statSync(file).mtimeMs } catch { return 0 }
  }

  /** 读取配置：default_config 为默认值，config/config 下的同名文件为用户修改 */
  get(name) {
    const defFile = path.join(DEF_DIR, `${name}.yaml`)
    const userFile = path.join(USER_DIR, `${name}.yaml`)
    const stamp = `${this.mtime(defFile)}|${this.mtime(userFile)}`
    const hit = this.cache.get(name)
    if (hit && hit.stamp === stamp) return hit.data

    const def = readYaml(defFile)
    let user
    try {
      user = readYaml(userFile)
    } catch (err) {
      globalThis.logger?.error?.(`[Fishing-Plugin] 配置 ${userFile} 解析失败，已使用默认配置：${err.message}`)
    }
    // 列表结构（物品池、称号、帮助）的用户副本整份替换默认值；对象结构按字段深合并
    const data = Array.isArray(def) || Array.isArray(user) ? (user ?? def) : merge(def ?? {}, user ?? {})
    this.cache.set(name, { stamp, data })
    return data
  }

  /** 写入用户配置（锅巴保存时调用） */
  set(name, data) {
    fs.mkdirSync(USER_DIR, { recursive: true })
    fs.writeFileSync(path.join(USER_DIR, `${name}.yaml`), YAML.stringify(data), "utf8")
    this.cache.delete(name)
  }

  get config() { return this.get("config") }
  get items() { return this.get("items") }
  get titles() { return this.get("titles") }
}

export default new Config()
