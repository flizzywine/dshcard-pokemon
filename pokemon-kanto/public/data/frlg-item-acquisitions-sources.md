# FRLG 关都持有道具来源审计

核对基准：`pret/pokefirered` 固定提交 [`ce6406d8c2eaf46d543c8a2606de0c3cb1951982`](https://github.com/pret/pokefirered/tree/ce6406d8c2eaf46d543c8a2606de0c3cb1951982)。下列结论来自该提交的 map JSON、地图脚本和物品常量；“可映射节点”仅作给场景/事件系统的建议，不代表当前已实现发放。

## 已核实的关都来源

| 道具 | 原作来源与条件 | 建议映射节点 | 一手源码 |
| --- | --- | --- | --- |
| 烟球（Smoke Ball） | 玉虹游戏厅奖品室，兑换价 800 枚代币。奖品柜台先检查已取得 Coin Case。 | `celadon-game-corner-prize-room` | [PrizeRoom/scripts.inc:330–371](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/maps/CeladonCity_GameCorner_PrizeRoom/scripts.inc#L330-L371) |
| 奇迹种子（Miracle Seed） | 同上，1000 枚代币；是奖品菜单的明确选项。 | `celadon-game-corner-prize-room` | [PrizeRoom/scripts.inc:330–377](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/maps/CeladonCity_GameCorner_PrizeRoom/scripts.inc#L330-L377) |
| 木炭（Charcoal） | 同上，1000 枚代币；原作确有玉虹游戏厅固定兑换来源，不必用野生携带概率补足。 | `celadon-game-corner-prize-room` | [PrizeRoom/scripts.inc:330–383](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/maps/CeladonCity_GameCorner_PrizeRoom/scripts.inc#L330-L383) |
| 神秘水滴（Mystic Water） | 同上，1000 枚代币；是奖品菜单的明确选项。 | `celadon-game-corner-prize-room` | [PrizeRoom/scripts.inc:330–389](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/maps/CeladonCity_GameCorner_PrizeRoom/scripts.inc#L330-L389) |
| 剩饭（Leftovers） | 12 号道路，隐藏物坐标 `(14,70)`，`underfoot:true`。位置正是卡比兽脚下；先用宝可梦笛子唤醒并处理 30 级卡比兽，再在原地附近用探宝器寻找。 | `route-12` / `snorlax-leftovers`；需记录卡比兽已移除及探宝器搜索条件。 | [Route12/map.json:288–300](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/maps/Route12/map.json#L288-L300)、[Route12/scripts.inc:13–32](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/maps/Route12/scripts.inc#L13-L32) |
| 剩饭（Leftovers） | 16 号道路，隐藏物坐标 `(31,13)`，`underfoot:true`，同样在卡比兽脚下；须先处理阻路卡比兽，再用探宝器搜索。 | `route-16` / `snorlax-leftovers`；与 12 号道路是两个独立地点。 | [Route16/map.json:225–237](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/maps/Route16/map.json#L225-L237)、[Route16/scripts.inc:34–53](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/maps/Route16/scripts.inc#L34-L53) |
| 安抚之铃（Soothe Bell） | 宝可梦塔 7F 隐藏物 `(11,4)`，`underfoot:true`；需要推进宝可梦塔剧情抵达七楼。 | `pokemon-tower-7f` | [PokemonTower_7F/map.json:88–98](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/maps/PokemonTower_7F/map.json#L88-L98) |
| 强制锻炼器（Macho Brace） | 常青道馆隐藏物 `(2,2)`，`underfoot:true`；道馆开放后才能取得。 | `viridian-city-gym` | [ViridianCity_Gym/map.json:200–210](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/maps/ViridianCity_Gym/map.json#L200-L210) |
| 护符金币（Amulet Coin） | 16 号道路北侧入口二楼的图鉴助手赠送；须捕获至少 40 种、背包有空位，且此前未领取。 | `route-16-north-entrance-2f` | [Route16_NorthEntrance_2F/scripts.inc:1–43](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/maps/Route16_NorthEntrance_2F/scripts.inc#L1-L43) |
| 学习装置（Exp. Share） | 15 号道路西侧入口二楼的图鉴助手赠送；须捕获至少 50 种、背包有空位，且此前未领取。 | `route-15-west-entrance-2f` | [Route15_WestEntrance_2F/scripts.inc:1–43](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/maps/Route15_WestEntrance_2F/scripts.inc#L1-L43) |

## 重点道具的缺口与版本边界

- 在该提交的关都 `data/maps/*/map.json` 和对应 `scripts.inc` 中，未找到焦点镜、先制之爪、王者之证、白色香草、贝壳之铃的固定关都拾取/赠送来源。因此本表不为它们指定关都地点。物品常量或战斗塔道具表只能证明游戏数据定义了物品，不能证明剧情中可在关都取得。
- 木炭并非缺失：玉虹游戏厅兑换脚本给出 1000 代币价格，见上表。场景若已有游戏厅入口，应在该奖品室映射，不能把它误标成关都无来源。
- `ITEM_MENTAL_HERB` 在 Gen 3 物品常量中存在（编号 185），但本次未核到关都固定拾取/赠送脚本；不应将其误说成非 Gen 3，也不应仅凭常量补一个剧情奖励。[items.h:192–201](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/include/constants/items.h#L192-L201)
- 本次固定提交的 `include/constants/items.h` 没有 `ITEM_POWER_HERB` 定义；第四世代引入的力量香草不纳入 FRLG 道具表。Gen 4 的 Iron Ball（黑色铁球）也不属于 FRLG。
- 上述结论仅覆盖固定脚本里的关都固定来源。野生宝可梦随机携带、战斗塔/训练家之塔清单、七之岛拾取、通信交换和版本外奖励均不算关都剧情固定来源；若未来要支持这些路径，应另列来源和前置条件。

## 向场景/剧情数据映射时的提示

隐藏物是一次性、带 flag 的地图事件，不应当作普通 NPC 奖励反复发放。两处剩饭应保持不同的地图来源，并以 Snorlax 已被处理作为可取得条件；`underfoot:true` 应作为探宝器可发现的隐藏点处理。游戏厅四件奖品则是玩家用代币交换，不是免费剧情奖励。图鉴助手条件是捕获数（`GetPokedexCount` 的 caught 计数），不是见过数。

## 0.9.0适配状态

游戏厅兑换、两处卡比兽后的剩饭、宝可梦塔安抚之铃和常青道馆强制锻炼器已接入同一原生MVU。探宝器在11号道路入口二楼以30种拥有图鉴领取；本项目用route11节点代表该入口。不是逐格地图拾取。
