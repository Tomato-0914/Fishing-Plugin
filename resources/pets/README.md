# 宠物图片

把图片放进对应宠物的文件夹，按**形态 id** 命名，图片会自动替换 #我的宠物、#宠物商店 里的 emoji，**不需要改代码，也不用重启**（下次出图时生效）。
支持 `.png`、`.webp`、`.jpg`，建议 512×512 透明背景 PNG。

## koi/ 鲤鱼

| 文件名 | 形态 | 阶段 |
| --- | --- | --- |
| `koi_fry.png` | 小鲤鱼 | 一阶 |
| `koi.png` | 锦鲤 | 二阶 |
| `golden_koi.png` | 金鳞鲤 | 三阶 |
| `yuhualong.png` | 鱼化龙（龙头鱼身） | 四阶 · 化龙 |
| `dragon.png` | 龙 | 五阶 · 化龙 |
| `kun.png` | 鲲 | 四阶 · 化鲲 |
| `peng.png` | 鹏 | 五阶 · 化鲲 |

## bird/ 雀鸟

| 文件名 | 形态 | 阶段 |
| --- | --- | --- |
| `sparrow.png` | 雏雀 | 一阶 |
| `pheasant.png` | 锦鸡 | 二阶 |
| `luan.png` | 青鸾 | 三阶 |
| `fire_phoenix.png` | 火凤 | 四阶 · 化凤 |
| `phoenix.png` | 凤凰 | 五阶 · 化凤 |
| `red_crow.png` | 赤乌 | 四阶 · 化乌 |
| `golden_crow.png` | 金乌 | 五阶 · 化乌 |

## deer/ 鹿

| 文件名 | 形态 | 阶段 |
| --- | --- | --- |
| `fawn.png` | 小鹿 | 一阶 |
| `white_deer.png` | 白鹿 | 二阶 |
| `spirit_deer.png` | 灵鹿 | 三阶 |
| `jiaoduan.png` | 角端 | 四阶 · 化麟 |
| `qilin.png` | 麒麟 | 五阶 · 化麟 |
| `fuzhu.png` | 夫诸 | 四阶 · 化泽 |
| `baize.png` | 白泽 | 五阶 · 化泽 |

## turtle/ 乌龟

| 文件名 | 形态 | 阶段 |
| --- | --- | --- |
| `baby_turtle.png` | 小乌龟 | 一阶 |
| `spirit_turtle.png` | 灵龟 | 二阶 |
| `dark_turtle.png` | 玄龟 | 三阶 |
| `nether_turtle.png` | 冥龟 | 四阶 · 化武 |
| `xuanwu.png` | 玄武 | 五阶 · 化武 |
| `giant_turtle.png` | 巨鼋 | 四阶 · 化鳌 |
| `divine_ao.png` | 神鳌 | 五阶 · 化鳌 |

## fox/ 狐狸

| 文件名 | 形态 | 阶段 |
| --- | --- | --- |
| `fox_kit.png` | 小狐 | 一阶 |
| `spirit_fox.png` | 灵狐 | 二阶 |
| `three_tail.png` | 三尾狐 | 三阶 |
| `seven_tail.png` | 七尾狐 | 四阶 · 化天狐 |
| `celestial_fox.png` | 九尾天狐 | 五阶 · 化天狐 |
| `dark_fox.png` | 玄狐 | 四阶 · 化玄狐 |
| `chenghuang.png` | 乘黄 | 五阶 · 化玄狐 |

新增宠物时，在 `config/default_config/pets.yaml` 里写好 id，再建同名文件夹即可。
