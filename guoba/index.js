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
      description: "QQ 群钓鱼小游戏：钓鱼、鱼获、排行榜、称号",
      icon: "mdi:fish",
      iconColor: "#1d8fe1",
    },
    configInfo: {
      schemas,
      getConfigData() {
        return structuredClone(Config.config)
      },
      setConfigData(data, { Result }) {
        try {
          const cfg = structuredClone(Config.config)
          for (const [key, value] of Object.entries(data)) setPath(cfg, key, value)
          const f = cfg.fishing
          if (Number(f.biteMin) > Number(f.biteMax)) return Result.error({}, "咬钩时间最小值不能大于最大值")
          Config.set("config", cfg)
          const p = cfg.probability
          const sum = ["empty", "junk", "N", "R", "SR", "SSR", "UR"].reduce((s, k) => s + Number(p[k] || 0), 0) +
            Object.values(p.hidden || {}).reduce((s, v) => s + Number(v || 0), 0)
          const tip = Math.abs(sum - 100) > 0.001 ? `（概率总和为 ${Number(sum.toFixed(4))}%，将按比例换算）` : ""
          return Result.ok({}, `保存成功 🎣${tip}`)
        } catch (err) {
          return Result.error({}, `保存失败：${err.message}`)
        }
      },
    },
  }
}
