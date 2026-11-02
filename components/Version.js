import fs from "node:fs"
import { Plugin_Path } from "./Paths.js"

let ver = "0.0.0"
try {
  ver = JSON.parse(fs.readFileSync(`${Plugin_Path}/package.json`, "utf8")).version
} catch {}

export default { ver }
