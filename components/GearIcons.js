/**
 * 渔具图标（与 #钓鱼信息 同一套，内联 SVG）。所有图片模板通过 {{@i.icon}} 输出，
 * 之后换成 PNG 时只需修改这里，例如返回 <img src="${_res}/gear/rod.png">
 */
const PATHS = {
  "rod": "<path d=\"M14 77 Q22 22 77 11\" stroke=\"#f8bf58\" stroke-width=\"7\"/><path d=\"M14 77 Q22 22 77 11\" stroke=\"#6acaff\" stroke-width=\"3\"/><path d=\"M19 68 l-7 16 10 3 8-16\" fill=\"#a56a30\" stroke=\"#f9d583\" stroke-width=\"2\"/><circle cx=\"32\" cy=\"58\" r=\"8\" fill=\"#175d94\" stroke=\"#ffc65a\" stroke-width=\"3\"/><path d=\"M39 46 l-7-7 M52 30 l-5-7 M67 18 l-5-7\" stroke=\"#f7d987\" stroke-width=\"3\"/><path d=\"M77 11 Q89 32 78 55\" fill=\"none\" stroke=\"#c3e9ff\" stroke-width=\"1.6\"/><path d=\"M78 55 l-5 8 5 7 5-7z\" fill=\"#5cdbff\" stroke=\"#fff1a6\" stroke-width=\"1.5\"/>",
  "line": "<ellipse cx=\"48\" cy=\"18\" rx=\"30\" ry=\"10\" fill=\"#d8a34e\" stroke=\"#ffe7a0\" stroke-width=\"3\"/><path d=\"M18 18v51 Q48 83 78 69V18\" fill=\"#197ec7\" stroke=\"#f8c55f\" stroke-width=\"4\"/><path d=\"M20 28 Q48 38 76 28 M20 39 Q48 49 76 39 M20 50 Q48 60 76 50 M20 61 Q48 71 76 61\" fill=\"none\" stroke=\"#92edff\" stroke-width=\"3\"/><ellipse cx=\"48\" cy=\"69\" rx=\"30\" ry=\"9\" fill=\"#c78b37\" stroke=\"#ffe4a0\" stroke-width=\"3\"/><ellipse cx=\"48\" cy=\"18\" rx=\"18\" ry=\"5\" fill=\"#082c51\" stroke=\"#a2e8ff\" stroke-width=\"2\"/>",
  "hook": "<path d=\"M49 11v45 Q49 80 30 80 Q12 80 12 62 Q12 48 25 45\" fill=\"none\" stroke=\"#e1f7ff\" stroke-width=\"10\" stroke-linecap=\"round\"/><path d=\"M49 11v45 Q49 80 30 80 Q12 80 12 62 Q12 48 25 45\" fill=\"none\" stroke=\"#43a8e6\" stroke-width=\"5\" stroke-linecap=\"round\"/><path d=\"M25 45l-12-1 8 12z\" fill=\"#d9f9ff\"/><circle cx=\"49\" cy=\"10\" r=\"7\" fill=\"#163f72\" stroke=\"#ffe3a0\" stroke-width=\"3\"/><path d=\"M54 24l13 9-8 9-13-9z\" fill=\"#ffcd60\" stroke=\"#fff0b0\" stroke-width=\"2\"/>",
  "float": "<path d=\"M49 7l11 30\" stroke=\"#f9bb54\" stroke-width=\"6\" stroke-linecap=\"round\"/><path d=\"M49 7l11 30\" stroke=\"#fff1b0\" stroke-width=\"2\"/><path d=\"M60 33 Q89 49 72 69 Q60 82 46 72 Q26 56 46 36Z\" fill=\"#0b8acb\" stroke=\"#d6f4ff\" stroke-width=\"3\"/><path d=\"M46 36Q64 39 79 52L75 60Q57 51 39 52Z\" fill=\"#ffcb55\"/><path d=\"M43 64Q58 68 76 61\" stroke=\"#a2efff\" stroke-width=\"3\" fill=\"none\"/><path d=\"M60 77v9\" stroke=\"#ffd16a\" stroke-width=\"4\"/>",
  "net": "<path d=\"M19 28 Q48 13 77 28L70 78Q48 91 26 78Z\" fill=\"#07538c\" stroke=\"#f6bd57\" stroke-width=\"5\"/><path d=\"M23 32l49 46 M36 25l39 40 M54 24l20 22 M74 32L25 77 M61 25L22 63 M43 26L22 44\" stroke=\"#69d8ff\" stroke-width=\"2.6\" fill=\"none\"/><ellipse cx=\"48\" cy=\"27\" rx=\"30\" ry=\"12\" fill=\"#0e64a3\" stroke=\"#ffd17a\" stroke-width=\"5\"/><ellipse cx=\"48\" cy=\"27\" rx=\"22\" ry=\"6\" fill=\"#062b53\" stroke=\"#80dbff\" stroke-width=\"2\"/><path d=\"M25 18l-7-8 M71 18l7-8\" stroke=\"#e8c079\" stroke-width=\"4\"/>"
}

/** 某个部位的图标 HTML（viewBox 96×96，尺寸由模板的 .gear-art 控制） */
export function gearIcon(slot) {
  const body = PATHS[slot] || PATHS.rod
  return `<svg class="gear-art" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true">${body}</svg>`
}
