/**
 * 宠物图标：优先使用 resources/pets/<宠物 id>/<形态 id>.png（也支持 webp、jpg），没有时显示形态的 emoji
 * 模板通过 {{@icon}} 输出，尺寸由 .pet-art / .pet-emoji 控制
 */
import fs from "node:fs"
import { Res_Path, Res_Url } from "./Paths.js"

export const PET_IMG_DIR = `${Res_Path}/pets`
const EXTS = ["png", "webp", "jpg"]

export function petImage(petId, formId, dir = PET_IMG_DIR) {
  for (const ext of EXTS) if (fs.existsSync(`${dir}/${petId}/${formId}.${ext}`)) return `${petId}/${formId}.${ext}`
  return null
}

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])

export function petIcon(petId, form, { dir = PET_IMG_DIR, base = Res_Url } = {}) {
  const img = form?.id && petImage(petId, form.id, dir)
  if (img) return `<img class="pet-art" src="${base}/pets/${img}" alt="">`
  return `<span class="pet-emoji">${esc(form?.emoji || "🐾")}</span>`
}
