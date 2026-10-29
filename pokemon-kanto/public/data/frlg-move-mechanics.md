# 战斗机制回归覆盖与边界

本回归集用真实 `KantoGame.start()` / `KantoGame.act()` 战斗验证 Gen III Showdown 模拟器经本项目封装后的可观察行为。测试读取快照请求、事件协议和战斗状态，不直接调用效果实现；固定 PRNG 种子用于复现概率分支。对应自动化用例在 [`test/frlg-move-mechanics.test.cjs`](../../test/frlg-move-mechanics.test.cjs)。这是一组针对高风险机制的回归样本，不是 386 物种、全部招式及所有卡带边界的穷举证明。

## 覆盖矩阵

| 机制 | 用例核验的可观察结果 |
| --- | --- |
| 两回合蓄力（飞翔） | 第一回合发出准备事件且不造成伤害；普通攻击打不中蓄力中的目标；第二回合才结算伤害。 |
| 再充能（破坏光线） | 命中后记录 `|-mustrecharge|`，下一次请求强制出现 `recharge`，而非再次提供破坏光线。 |
| 连续守住 | 固定种子序列中首次守住成功，连续尝试存在失败结果，避免错误地保证连续成功。 |
| 替身 | 消耗最大 HP 的四分之一；挡住剧毒并保留替身使用者 HP 与异常状态。 |
| 睡眠、冰冻 | 对手行动被阻止，并产生对应 `cant` 事件。 |
| 麻痹 | 速度降为存储速度的四分之一；行动结果只能表现为行动或因麻痹完全不能行动。 |
| 中毒、剧毒 | 回合末均产生伤害；固定剧毒状态的后续伤害高于首次。 |
| 威吓 | 入场时对手攻击下降一级，并记录下降事件。 |
| 飘浮免疫 | 地震不扣除飘浮耿鬼的 HP，记录免疫事件。 |
| 过热副作用 | 招式伤害后使用者特攻下降两级。 |
| 吸取 | 亿万吸取造成伤害后恢复使用者 HP，并记录回复事件。 |
| 反伤 | 双刃头锤伤害使用者自身，事件标明反伤来源。 |
| 自爆 | 自爆使用者倒下，同时对目标结算伤害。 |
| 定额伤害 | Sonic Boom 精确造成 20 HP 伤害。 |
| 天气伤害修正 | 同种子晴雨条件下，求雨之后的冲浪伤害高于无天气冲浪。 |
| 先制 | 低速度比雕的电光一闪仍先于高速顽皮雷弹的撞击结算。 |
| 追打与换人 | 对手换人时追打先于换人事件结算，离场与入场对象正确。 |
| 连续攻击 | 乱抓报告 2–5 次命中，且每次已命中打击都有对应伤害事件。 |
| 混乱 | 固定种子序列覆盖混乱自伤事件路径，验证选中招式可被混乱阻止。 |
| 命中失败 | Fire Blast 出现真实 miss 协议事件且目标 HP 不变。 |

本矩阵覆盖蓄力、再充能、概率防御、替身屏障、主要异常状态、能力变化、免疫、天气、先制、换人插队、多段命中、混乱和 miss 等超过 20 个战斗行为点。事件字段使用当前 Showdown 战斗协议；测试关注实际结算，不从招式名称或日志文案推断命中。

## 参考实现

卡带行为参照固定的 pret/pokefirered [`ce6406d8c2eaf46d543c8a2606de0c3cb1951982`](https://github.com/pret/pokefirered/commit/ce6406d8c2eaf46d543c8a2606de0c3cb1951982)，避免使用会变化的主分支：

- [`src/battle_script_commands.c`](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/battle_script_commands.c) 包含招式效果脚本、命中与伤害相关命令、蓄力/再充能及异常流程。
- [`src/battle_util.c`](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/battle_util.c) 包含回合末状态、天气、场上效果和战斗工具逻辑。
- [`src/battle_main.c`](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/battle_main.c) 包含行动选择、速度/优先级顺序和回合推进。
- [`src/data/battle_moves.h`](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/data/battle_moves.h) 与 [`src/data/battle_scripts_1.s`](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/data/battle_scripts_1.s) 提供招式数据及脚本目标；[已有规则来源记录](battle-rules-sources.md)包含捕获、逃跑和队伍来源筛选的行级参考。

执行端是随包 vendored 的 Pokémon Showdown Gen 3 模拟器：[`vendor/showdown/data/mods/gen3/scripts.js`](../../vendor/showdown/data/mods/gen3/scripts.js)、[`moves.js`](../../vendor/showdown/data/mods/gen3/moves.js)、[`conditions.js`](../../vendor/showdown/data/mods/gen3/conditions.js) 和 [`abilities.js`](../../vendor/showdown/data/mods/gen3/abilities.js)。其中多段命中与追打在 Gen 3 专属脚本/招式数据中实现。FRLG 数据模组 [`gen3frlg/scripts.js`](../../vendor/showdown/data/mods/gen3frlg/scripts.js) 继承 Gen 3 战斗脚本；本项目引擎实际建立的是 `Dex.mod('gen3')` 与 `gen3customgame` 对战格式。因此这些测试确认的是项目当前 Gen 3 Showdown 兼容层的集成行为，不能单独证明对应 pret 汇编脚本逐行等价。

## 兼容范围与明确边界

- 招式执行、伤害、属性相性、状态、特性、优先级和天气由 vendored Gen 3 Showdown 引擎结算。本文件只报告列出用例真实验证的机制，不将未测机制暗示为已与 ROM 对齐。
- 可选招式从关都宝可梦的 Gen III Learnset 来源筛选并合并。来源标记不足以区分所有游戏，因此并非逐物种的 FRLG 卡带招式合法性清单；等级招式、TM/HM、蛋招式和教学招式的来源差异见 [`battle-rules-sources.md`](battle-rules-sources.md)。
- 不声称逐帧或逐效果复刻每个 FRLG 招式；此项目回归验证的是战斗结算和事件语义。FRLG 原版及 Gen III 的已知卡带 bug 没有在本测试集内逐项复核，也不对模拟器 bug 与实体卡带 bug 的差异作普遍保证。
- Gen III 没有后世的草地、电气、精神或薄雾“场地”效果。本项目 UI 中的战斗场景/视觉氛围不等于机制场地，也不能改变伤害或状态。
- 天气机制仅由战斗模拟器按 Gen III 规则处理；本矩阵验证了求雨提高冲浪伤害，不代表已穷举天气持续、天气免疫、阳光、沙暴和所有天气球行为。
- 联机、多打、完整故事脚本上下文、完整 FRLG 野生遭遇/持有物生成与全物品规则不在本套单打测试范围。
