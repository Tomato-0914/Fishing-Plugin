import Config from "../components/Config.js"

const num = (field, label, help, props = {}) => ({
  field, label, bottomHelpMessage: help, component: "InputNumber", required: true,
  componentProps: { min: 0, ...props },
})

export default [
  { label: "基础设置", component: "SOFT_GROUP_BEGIN" },
  { field: "enable", label: "启用钓鱼", component: "Switch" },
  {
    field: "storage", label: "存档方式", component: "Select", required: true,
    bottomHelpMessage: "修改后需重启。从 YAML 切到数据库时会自动导入旧存档",
    componentProps: { options: [{ label: "SQLite 数据库（data/fishing.db）", value: "db" }, { label: "YAML 文件（每人一个）", value: "yaml" }] },
  },
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
  num("fishing.multiCount", "十连竿数", "#十连钓鱼 一次抛出的竿数", { min: 2, max: 20 }),
  num("fishing.multiCooldown", "十连后挂鱼饵时间(秒)", "十连钓鱼结束后的等待时间", { max: 3600 }),
  num("fishing.bagLimit", "Lv1 鱼护容量", "初始鱼护最多存放多少件物品，升级鱼护后按渔具工坊的容量计算", { min: 10, max: 2000 }),
  {
    field: "fishing.castImage", label: "抛竿配图", component: "Input",
    bottomHelpMessage: "抛竿时附带的图片，填插件目录下的相对路径或绝对路径，留空则不发送",
    componentProps: { placeholder: "resources/img/cast.jpg" },
  },
  {
    field: "fishing.multiImage", label: "十连配图", component: "Input",
    bottomHelpMessage: "#十连钓鱼 时附带的图片，填插件目录下的相对路径或绝对路径，留空则不发送",
    componentProps: { placeholder: "resources/img/multi.jpg" },
  },

  { label: "鱼饵", component: "SOFT_GROUP_BEGIN" },
  num("bait.initial", "新手赠送鱼饵", "第一次钓鱼时赠送的鱼饵数量"),
  num("bait.price", "普通饵单价", "普通饵的金币价格（新手礼包、打卡、救济发的也是普通饵）"),
  // 其他鱼饵的单价：按 shop.yaml 中的鱼饵自动生成，自定义的鱼饵也会出现在这里
  ...(Config.shop?.baits || []).filter(b => b.id !== "basic").map(b =>
    num(`bait.prices.${b.id}`, `${b.emoji || ""}${b.name}单价`, b.desc || "")),
  num("bait.maxBuy", "单次最多购买", "", { min: 1, max: 99999 }),
  num("bait.relief", "每日救济鱼饵", "鱼饵用完、买不起、也没有鱼可卖时每天可领一次，0 为关闭"),

  { label: "每日打卡", component: "SOFT_GROUP_BEGIN" },
  num("checkin.baitReward", "打卡赠送鱼饵", "0 为不送"),
  num("checkin.luckyKing", "欧皇幸运值", "当天首个幸运值 ≥ 此值的人成为今日欧皇", { max: 100 }),
  num("checkin.unluckyKing", "非酋幸运值", "当天首个幸运值 ≤ 此值的人成为今日非酋", { max: 100 }),
  num("checkin.confirmLow", "低幸运值二次确认", "幸运值 ≤ 此值时需再发一遍 #打卡 才揭晓，0 为关闭", { max: 100 }),
  { component: "Divider", label: "幸运等级对钓鱼的影响请在 config.yaml 的 checkin.tiers 中修改" },

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
