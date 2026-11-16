/** 按群统计的每日计数（目前用于“每个群每天最多钓到几条保护鱼类”），跨天自动清零 */
import fs from "node:fs"
import path from "node:path"
import { Data_Path } from "./Paths.js"
import { periodKey } from "./Period.js"

/** 计数的归属：群聊按群号，私聊按 QQ 号单独计算 */
export const groupKey = e => e?.group_id ? `g${e.group_id}` : `p${e?.user_id ?? ""}`

export class GroupDaily {
  /** @param file 持久化文件；不传则只存在内存里（测试用） */
  constructor(file = null) {
    this.file = file
    this.state = null
  }

  load(now = new Date()) {
    if (!this.state) {
      this.state = {}
      if (this.file) {
        try { this.state = JSON.parse(fs.readFileSync(this.file, "utf8")) || {} } catch { this.state = {} }
      }
    }
    const day = periodKey("day", now)
    if (this.state.day !== day) this.state = { day, counts: {} }
    this.state.counts ||= {}
    return this.state
  }

  count(key, field = "protected", now = new Date()) {
    return Number(this.load(now).counts[field]?.[key]) || 0
  }

  /** 计数 +1，返回加完后的次数 */
  add(key, field = "protected", now = new Date()) {
    const c = this.load(now).counts
    c[field] ||= {}
    c[field][key] = (Number(c[field][key]) || 0) + 1
    this.save()
    return c[field][key]
  }

  save() {
    if (!this.file) return
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(this.file, JSON.stringify(this.state))
    } catch (err) {
      globalThis.logger?.warn?.(`[钓鱼] 群每日计数保存失败：${err.message}`)
    }
  }
}

export default new GroupDaily(path.join(Data_Path, "group_daily.json"))
