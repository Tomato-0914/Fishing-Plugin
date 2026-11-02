import path from "node:path"
import { fileURLToPath } from "node:url"

/** 插件根目录（不依赖 process.cwd，便于单元测试） */
export const Plugin_Path = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..").replace(/\\/g, "/")
export const Plugin_Name = path.basename(Plugin_Path)
export const Data_Path = `${Plugin_Path}/data`
export const Res_Path = `${Plugin_Path}/resources`
