/** 第二阶段：角色等级和经验查询。 */
import { plugin } from "../components/yunzai.js"
import UserData from "../components/UserData.js"
import { characterProgress } from "../components/Progression.js"
import { groupAllowed, updateNickname, displayName } from "../components/common.js"

export class FishingCharacter extends plugin {
  constructor() {
    super({
      name: "钓鱼-角色等级",
      dsc: "查询角色等级和经验进度",
      event: "message",
      priority: 500,
      rule: [{ reg: /^#?(钓鱼等级|钓鱼角色|我的等级)$/, fnc: "character" }],
    })
  }

  async character(e) {
    if (!groupAllowed(e)) return false
    const user = UserData.get(e.user_id)
    updateNickname(user, e)
    const p = characterProgress(user)
    return e.reply([
      `🎣 ${displayName(user)} 的角色档案`,
      `⭐ 等级：Lv${p.level}`,
      `📖 总经验：${p.xp}`,
      `📈 当前等级进度：${p.currentXp}/${p.requiredXp}（${p.percent}%）`,
      `⏳ 距离 Lv${p.level + 1} 还需 ${p.remainingXp} 经验`,
      "💡 每次抛竿 +1 经验，成功钓获额外 +4 经验。",
    ].join("\n"))
  }
}
