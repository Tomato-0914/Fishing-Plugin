/* 把页面里的 emoji 换成本地 Twemoji 图片，避免服务器缺少 emoji 字体时显示成方框；本地没有的图标保留原字符 */
(function () {
  var base = document.currentScript.src.replace(/common\/emoji\.js.*$/, "")
  twemoji.parse(document.body, { base: base, folder: "emoji", ext: ".svg" })
})()
