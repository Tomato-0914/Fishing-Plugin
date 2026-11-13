/** 锅巴支持（参考柴郡插件 guoba 结构） */
import Config from "../components/Config.js"
import schemas from "./schemas.js"

const isObj = v => v && typeof v === "object" && !Array.isArray(v)

function setPath(obj, key, value) {
  const keys = key.split(".")
  let cur = obj
  keys.slice(0, -1).forEach(k => { cur = isObj(cur[k]) ? cur[k] : (cur[k] = {}) })
  cur[keys[keys.length - 1]] = value
}

export function supportGuoba() {
  return {
    pluginInfo: {
      name: "Fishing-Plugin",
      title: "钓鱼插件",
      author: "@Tomato-0914",
      authorLink: "https://github.com/Tomato-0914",
      link: "https://github.com/Tomato-0914/Fishing-Plugin",
      isV3: true,
      isV2: false,
      description: "QQ 群钓鱼小游戏：钓鱼、鱼护、排行榜、称号、渔具工坊与商店",
      icon: "mdi:fish",
      iconColor: "#1d8fe1",
    },
    configInfo: {
      schemas,
      getConfigData() {
        const cfg = structuredClone(Config.config)
        // 其他鱼饵单价：没在 config.yaml 里改过的，显示 shop.yaml 中的价格
        cfg.bait ||= {}
        cfg.bait.prices = { ...(cfg.bait.prices || {}) }
        for (const b of Config.shop?.baits || []) {
          if (b.id !== "basic" && cfg.bait.prices[b.id] == null) cfg.bait.prices[b.id] = b.price
        }
        return cfg
      },
      setConfigData(data, { Result }) {
        try {
          const cfg = structuredClone(Config.config)
          for (const [key, value] of Object.entries(data)) setPath(cfg, key, value)
          const f = cfg.fishing
          if (Number(f.biteMin) > Number(f.biteMax)) return Result.error({}, "咬钩时间最小值不能大于最大值")
          // 和 shop.yaml 一样的鱼饵价格不写入 config.yaml，以后改 shop.yaml 仍然生效
          const prices = cfg.bait?.prices || {}
          for (const b of Config.shop?.baits || []) {
            if (prices[b.id] != null && Number(prices[b.id]) === Number(b.price)) delete prices[b.id]
          }
          // 已取消的旧配置项，保存时一并清掉
          if (cfg.checkin) delete cfg.checkin.baitReward
          Config.set("config", cfg)
          const p = cfg.probability
          const sum = ["empty", "junk", "N", "R", "SR", "SSR", "UR", "EP", "MR"].reduce((s, k) => s + Number(p[k] || 0), 0) +
            Object.values({ ...(p.hidden || {}), ...(p.protected || {}) }).reduce((s, v) => s + Number(v || 0), 0)
          const tip = Math.abs(sum - 100) > 0.001 ? `（概率总和为 ${Number(sum.toFixed(4))}%，将按比例换算）` : ""
          return Result.ok({}, `保存成功 🎣${tip}`)
        } catch (err) {
          return Result.error({}, `保存失败：${err.message}`)
        }
      },
    },
  }
}
