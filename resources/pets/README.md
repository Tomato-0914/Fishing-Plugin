# 宠物图片

把图片放进对应宠物的文件夹，按**形态 id** 命名，图片会自动替换 #我的宠物、#宠物商店 里的 emoji，**不需要改代码，也不用重启**（下次出图时生效）。
支持 `.png`、`.webp`、`.jpg`，建议 512×512 透明背景 PNG。

## koi/ 鲤鱼

| 文件名 | 形态 | 阶段 |
| --- | --- | --- |
| `koi_fry.png` | 小鲤鱼 | 一阶 |
| `koi.png` | 锦鲤 | 二阶 |
| `golden_koi.png` | 金鳞鲤 | 三阶 |
| `jiao.png` | 蛟 | 四阶 · 化龙 |
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

新增宠物时，在 `config/default_config/pets.yaml` 里写好 id，再建同名文件夹即可。
