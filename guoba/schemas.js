const num = (field, label, help, props = {}) => ({
  field, label, bottomHelpMessage: help, component: "InputNumber", required: true,
  componentProps: { min: 0, ...props },
})

export default [
  { label: "基础设置", component: "SOFT_GROUP_BEGIN" },
  { field: "enable", label: "启用钓鱼", component: "Switch" },
  { field: "button", label: "发送按钮", bottomHelpMessage: "仅 QQBot 协议生效，其他协议不会发送按钮", component: "Switch" },
  { field: "textFallback", label: "文字兜底", bottomHelpMessage: "图片渲染失败时改为发送文字", component: "Switch" },
  {
    field: "blackGroups", label: "群黑名单", component: "GTags",
    componentProps: { allowAdd: true, allowDel: true },
  },
  {
    field: "whiteGroups", label: "群白名单", bottomHelpMessage: "不为空时只在这些群可用", component: "GTags",
    componentProps: { allowAdd: true, allowDel: true },
  },

  { label: "钓鱼节奏", component: "SOFT_GROUP_BEGIN" },
  num("fishing.biteMin", "咬钩最短时间(秒)", "抛竿后最快多久咬钩", { max: 30 }),
  num("fishing.biteMax", "咬钩最长时间(秒)", "上限 30 秒，避免等太久", { max: 30 }),
  num("fishing.reelWindow", "收杆时间(秒)", "咬钩后多久内必须收杆，超时判定鱼跑了", { min: 3, max: 120 }),
  num("fishing.cooldown", "挂鱼饵时间(秒)", "每次钓完后的等待时间", { max: 600 }),
  num("fishing.bagLimit", "鱼护容量", "背包最多存放多少件物品", { min: 10, max: 2000 }),

  { label: "概率设置(%)", component: "SOFT_GROUP_BEGIN" },
  { component: "Divider", label: "总和建议为 100，不为 100 时按比例换算" },
  num("probability.empty", "空军", "什么都没钓到", { step: 0.01 }),
  num("probability.junk", "海洋垃圾", "售价为 0", { step: 0.01 }),
  num("probability.N", "普通 N", "", { step: 0.01 }),
  num("probability.R", "优良 R", "", { step: 0.01 }),
  num("probability.SR", "稀有 SR", "", { step: 0.01 }),
  num("probability.SSR", "史诗 SSR", "", { step: 0.01 }),
  num("probability.UR", "传说 UR", "", { step: 0.01 }),
  num("probability.hidden.people_fragment", "隐藏：人民碎片", "钓到后自动报警领奖", { step: 0.001 }),
  num("probability.hidden.ocean_heart", "隐藏：海洋之心", "可出售的宝石", { step: 0.001 }),

  { label: "体型与奖励", component: "SOFT_GROUP_BEGIN" },
  num("size.small.chance", "小体型概率(%)", ""),
  num("size.medium.chance", "中体型概率(%)", ""),
  num("size.large.chance", "大体型概率(%)", ""),
  num("size.small.price", "小体型售价倍率", "", { step: 0.1 }),
  num("size.medium.price", "中体型售价倍率", "", { step: 0.1 }),
  num("size.large.price", "大体型售价倍率", "", { step: 0.1 }),
  num("policeReward", "人民碎片警局奖励", "钓到人民碎片报警后获得的金币"),

  { label: "排行榜", component: "SOFT_GROUP_BEGIN" },
  num("rank.groupSize", "群排行展示人数", "", { min: 3, max: 50 }),
  num("rank.totalSize", "总榜展示人数", "", { min: 3, max: 100 }),
]
