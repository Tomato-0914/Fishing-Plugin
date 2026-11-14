/** 第二阶段：角色等级、角色总览与装备详情入口。 */
import { plugin } from "../components/yunzai.js"
import UserData from "../components/UserData.js"
import { characterProgress } from "../components/Progression.js"
import { groupAllowed, updateNickname, displayName } from "../components/common.js"

export class FishingCharacter extends plugin {
  constructor() {
    super({
      name: "钓鱼-角色档案",
      dsc: "等级经验和完整角色面板",
      event: "message",
      priority: 500,
      rule: [
        { reg: /^#?我的等级$/, fnc: "level" },
      ],
    })
  }

  load(e) {
    const user = UserData.get(e.user_id)
    updateNickname(user, e)
    return user
  }

  async level(e) {
    if (!groupAllowed(e)) return false
    const user = this.load(e)
    const p = characterProgress(user)
    return e.reply([
      `⭐ ${displayName(user)} 的钓鱼等级`,
      `等级：Lv${p.level}`,
      `总经验：${p.xp}`,
      `当前进度：${p.currentXp}/${p.requiredXp}（${p.percent}%）`,
      `距 Lv${p.level + 1} 还需 ${p.remainingXp} 经验`,
      "💡 每次抛竿 +1 经验，成功钓获额外 +4 经验。",
    ].join("\n"))
  }

}
