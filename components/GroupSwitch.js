/** 每个群的钓鱼开关（#开启钓鱼 / #关闭钓鱼），存在 data/group_switch.json；没设置过的群按 config.yaml groupDefault */
import fs from "node:fs"
import path from "node:path"
import { Data_Path } from "./Paths.js"

export class GroupSwitch {
  /** @param file 持久化文件；不传则只存在内存里（测试用） */
  constructor(file = null) {
    this.file = file
    this.state = null
  }

  load() {
    if (!this.state) {
      this.state = {}
      if (this.file) {
        try { this.state = JSON.parse(fs.readFileSync(this.file, "utf8")) || {} } catch { this.state = {} }
      }
      this.state.groups ||= {}
    }
    return this.state
  }

  /** 本群的设置：true 开启 / false 关闭 / undefined 没设置过 */
  get(groupId) {
    const v = this.load().groups[String(groupId)]
    return typeof v === "boolean" ? v : undefined
  }

  set(groupId, on) {
    this.load().groups[String(groupId)] = !!on
    this.save()
  }

  save() {
    if (!this.file) return
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(this.file, JSON.stringify(this.state))
    } catch (err) {
      globalThis.logger?.warn?.(`[钓鱼] 群开关保存失败：${err.message}`)
    }
  }
}

export default new GroupSwitch(path.join(Data_Path, "group_switch.json"))
