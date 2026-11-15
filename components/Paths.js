import path from "node:path"
import { fileURLToPath } from "node:url"

/** 插件根目录（不依赖 process.cwd，便于单元测试） */
export const Plugin_Path = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..").replace(/\\/g, "/")
export const Plugin_Name = path.basename(Plugin_Path)
export const Data_Path = `${Plugin_Path}/data`
export const Res_Path = `${Plugin_Path}/resources`
/** 模板里引用资源的相对路径：模板被复制到 {data|temp}/html/Fishing-Plugin/<name>/ 下渲染，用相对路径兼容 Windows */
export const Res_Url = `../../../../plugins/${Plugin_Name}/resources`
