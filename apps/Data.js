/** 存档管理：存储状态 / YAML → 数据库迁移 / 数据库导出（仅主人） */
import path from "node:path"
import { plugin } from "../components/yunzai.js"
import Config from "../components/Config.js"
import UserData from "../components/UserData.js"
import { readYamlDir } from "../components/Storage.js"
import { Data_Path } from "../components/Paths.js"
import { withButtons } from "../components/Button.js"

const rel = p => path.relative(path.dirname(Data_Path), p).replace(/\\/g, "/")

export class FishingData extends plugin {
  constructor() {
    super({
      name: "钓鱼-存档管理",
      dsc: "钓鱼存档迁移与导出",
      event: "message",
      priority: -Infinity,
      rule: [
        { reg: /^#?钓鱼数据迁移$/, fnc: "migrate" },
        { reg: /^#?钓鱼数据导出$/, fnc: "export" },
      ],
    })
  }

  async migrate(e) {
    if (!e.isMaster) return e.reply("❌ 只有主人才能迁移钓鱼存档哦~")
    if (!UserData.isDb) return e.reply("⚠️ 当前没有使用数据库存储，无需迁移。\n请把 config.yaml 中的 storage 设为 db 并重启（需要 sqlite3 或 Node ≥ 22.5）")
    const overwrite = e.msg.includes("覆盖")
    const r = await UserData.migrate({ overwrite })
    if (!r.migrated.length && !r.skipped.length && !r.failed.length)
      return e.reply(`✅ data/ 下没有待导入的 YAML 存档\n当前数据库共 ${await UserData.count()} 份存档`)
    const lines = [
      "🗄️ 钓鱼存档迁移完成",
      `✅ 导入：${r.migrated.length} 份`,
      `⏭️ 跳过：${r.skipped.length} 份（数据库已有${overwrite ? "" : "，以数据库为准"}）`,
      r.failed.length ? `❌ 失败：${r.failed.length} 份\n${r.failed.map(f => `  ${path.basename(f.file)}：${f.msg}`).join("\n")}` : "",
      r.backupDir ? `📦 原文件已移到 ${rel(r.backupDir)}` : "",
      `当前数据库共 ${await UserData.count()} 份存档`,
    ]
    if (r.skipped.length && !overwrite) lines.push("💡 如需用 YAML 覆盖数据库中的同名存档，把文件放回 data/ 后发送 #钓鱼数据迁移覆盖")
    return e.reply(lines.filter(Boolean).join("\n"))
  }

  async export(e) {
    if (!e.isMaster) return e.reply("❌ 只有主人才能导出钓鱼存档哦~")
    if (!UserData.isDb) return e.reply("⚠️ 当前就是 YAML 存储，存档已在 data/ 目录下")
    const { count, outDir } = await UserData.export()
    return e.reply(`📤 已导出 ${count} 份存档到 ${rel(outDir)}\n（切回 YAML 存储时，把这些文件移到 data/ 下即可）`)
  }
}
