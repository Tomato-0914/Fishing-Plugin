/** 插件更新与自动重启（参考柴郡插件 CheshireUpdate） */
import fs from "node:fs"
import path from "node:path"
import { exec } from "node:child_process"
import { plugin } from "../components/yunzai.js"
import { Plugin_Path } from "../components/Paths.js"
import { withButtons } from "../components/Button.js"

const RESTART_FILE = path.join(Plugin_Path, "data", "restart.json")

const run = (cmd, options = {}) => new Promise(resolve => {
  exec(cmd, { cwd: Plugin_Path, ...options }, (error, stdout, stderr) =>
    resolve({ error, stdout: String(stdout).trim(), stderr: String(stderr).trim() }))
})

let updating = false

export class FishingUpdate extends plugin {
  constructor() {
    super({
      name: "钓鱼-更新",
      dsc: "钓鱼插件更新",
      event: "message",
      priority: -Infinity,
      rule: [{ reg: /^#?钓鱼(强制)?更新$/, fnc: "update" }],
    })
    if (!FishingUpdate.checked) {
      FishingUpdate.checked = true
      this.checkRestart()
    }
  }

  static checked = false

  /** 重启后发送成功通知 */
  async checkRestart() {
    try {
      if (!fs.existsSync(RESTART_FILE)) return
      const info = JSON.parse(await fs.promises.readFile(RESTART_FILE, "utf8"))
      await fs.promises.unlink(RESTART_FILE)
      setTimeout(async () => {
        const msg = "✅ 钓鱼插件重启成功，已是最新版本~ 🎣"
        try {
          const bot = Bot[info.self_id] || Bot
          if (info.isGroup) await bot.pickGroup(info.id).sendMsg(msg)
          else await bot.pickUser(info.id).sendMsg(msg)
        } catch (err) {
          logger.error(`[Fishing-Plugin] 重启通知发送失败：${err.message}`)
        }
      }, 6000)
    } catch {}
  }

  async update(e) {
    if (!e.isMaster) return e.reply("❌ 只有主人才能更新钓鱼插件哦~")
    if (updating) return e.reply("⏳ 正在更新中，请稍候...")
    const force = e.msg.includes("强制")
    updating = true
    const msgs = []
    try {
      await e.reply(force ? "⏳ 开始强制更新（将放弃本地修改）..." : "⏳ 开始拉取更新...")
      const oldCommit = (await run("git rev-parse --short HEAD")).stdout

      let ret
      if (force) {
        ret = await run("git fetch --all")
        if (!ret.error) ret = await run("git reset --hard @{u}")
      } else {
        ret = await run("git pull")
      }
      if (ret.error) {
        msgs.push(`❌ 更新失败：\n${ret.stderr || ret.error.message}`)
        if (!force) msgs.push("可尝试 #钓鱼强制更新")
        return this.sendAll(e, msgs, force ? [] : [{ text: "⚠️ 强制更新", callback: "#钓鱼强制更新", permission: "master" }])
      }

      const newCommit = (await run("git rev-parse --short HEAD")).stdout
      const time = (await run('git log -1 --pretty=%cd --date=format:"%F %T"')).stdout || "未知"
      if (oldCommit === newCommit) {
        msgs.push(`☁️ 钓鱼插件已是最新版本\n最后更新：${time}`)
        return this.sendAll(e, msgs)
      }

      const log = (await run(`git log ${oldCommit}..${newCommit} --pretty=format:"%h: %s"`)).stdout
      msgs.push("✅ 代码拉取完成", `🕒 提交时间：${time}`)
      if (log) msgs.push(`📝 更新日志：\n${log}`)

      const changed = (await run(`git diff --name-only ${oldCommit} ${newCommit}`)).stdout
      if (/package\.json/.test(changed)) {
        await e.reply("📦 检测到依赖变更，正在执行 pnpm install...")
        const install = await run("pnpm install", { timeout: 120000 })
        msgs.push(install.error ? `⚠️ 依赖安装失败，请手动执行 pnpm install：\n${install.stderr}` : "✅ 依赖更新完成")
      }

      if (process.env.pm_id === undefined) {
        msgs.push("⚠️ 当前不是 PM2 守护运行，请手动重启 Bot 以加载新代码")
        return this.sendAll(e, msgs)
      }

      await fs.promises.mkdir(path.dirname(RESTART_FILE), { recursive: true })
      await fs.promises.writeFile(RESTART_FILE, JSON.stringify({
        isGroup: !!e.isGroup, id: e.isGroup ? e.group_id : e.user_id, self_id: e.self_id, time: Date.now(),
      }))
      await this.sendAll(e, msgs)
      await e.reply("🔁 更新就绪，正在重启以加载新代码...")
      setTimeout(() => process.exit(0), 3000)
    } catch (err) {
      logger.error(`[Fishing-Plugin] 更新异常：${err.stack}`)
      await e.reply(`❌ 更新出错：${err.message}`)
    } finally {
      updating = false
    }
    return true
  }

  async sendAll(e, msgs, buttons = []) {
    const text = msgs.join("\n\n")
    if (e.isGroup && typeof e.group?.makeForwardMsg === "function" && msgs.length > 2) {
      try {
        const nickname = e.bot?.nickname || "钓鱼插件"
        const user_id = e.bot?.uin || e.self_id
        return e.reply(await e.group.makeForwardMsg(msgs.map(message => ({ user_id, nickname, message }))))
      } catch (err) {
        logger.error("[Fishing-Plugin] 合并转发失败，改为文字发送")
      }
    }
    return e.reply(withButtons(e, text, buttons))
  }
}
