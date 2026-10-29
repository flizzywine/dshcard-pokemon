# 捕获与逃跑规则来源

本说明固定使用 pret/pokefirered commit [`ce6406d8c2eaf46d543c8a2606de0c3cb1951982`](https://github.com/pret/pokefirered/commit/ce6406d8c2eaf46d543c8a2606de0c3cb1951982)，避免 `master` 后续变动改变算法依据。

## 捕获

原始实现位于 [`src/battle_script_commands.c` 第 9463–9612 行](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/battle_script_commands.c#L9463-L9612)，显示枚举位于 [`include/battle_controllers.h` 第 85–90 行](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/include/battle_controllers.h#L85-L90)：

- 第 9493–9551 行选择物种捕获率与球种倍率，并按 C 的整数运算顺序计算 `odds`。本项目火红/叶绿可用的三种球沿用同文件[第 808–814 行倍率表](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/battle_script_commands.c#L808-L814)：精灵球 10、超级球 15、高级球 20（倍率均以十分之一为单位）。每次除法都向下取整。
- 第 9553–9557 行应用异常状态：睡眠/冰冻乘 2；中毒、剧毒、灼伤、麻痹乘 15 后除 10，向下取整。
- 枚举值是 `BALL_NO_SHAKES=0`、`BALL_1_SHAKE=1`、`BALL_2_SHAKES=2`、`BALL_3_SHAKES_FAIL=3`、`BALL_3_SHAKES_SUCCESS=4`。因此循环 `shakes < BALL_3_SHAKES_SUCCESS` 最多做四次随机检查。前三次通过而第四次失败时仍报告 3 次摇晃但捕捉失败；四次都通过才成功。`odds > 254` 直接成功并用值 4 播放成功动画。客户端协议为方便表现，仍报告可见摇晃数 0–3；成功必须由 `caught` 与 `ended` 快照确证，不能只靠 3 次摇晃推断。
- 第 9558–9569 行记录捕获球消耗/使用计数。游戏侧在失败后消耗所选球、继续同一战斗回合；成功时捕获快照包含球种和投球成功时的宝可梦状态。

物种捕获率依据同一 commit 的 [`src/data/pokemon/species_info.h` 第 38–4397 行](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/data/pokemon/species_info.h#L38-L4397) 各物种 `.catchRate` 字段；例如妙蛙种子第 47 行、皮卡丘第 743 行、凯西第 1845 行、超梦第 4368 行、梦幻第 4397 行。将本项目 `public/data/locales.json` 的关都 001–151 数值与 C 表逐项比对，151 项全部一致。规则不再用缺项的 45 作为静默默认值。

实现位于 [`capture-escape-rules.cjs`](../../capture-escape-rules.cjs)，由 [`engine.cjs`](../../engine.cjs) 调用。`captureThreshold` 使用整数除法和向下取整平方根；摇晃检查由战斗 RNG 提供 0–65535 的值，没有用浮点概率近似。`resolveCapture` 的 Master Ball 分支直接返回保证成功，不模拟卡带在 `odds <= 254` 时先做、随后再覆盖掉的无用 RNG 消耗；真实捕捉成功/失败结果仍按卡带结算。

## 逃跑

原始实现位于 [`src/battle_main.c` 第 4229–4280 行](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/battle_main.c#L4229-L4280)：

- [`src/battle_main.c` 第 3002–3051 行](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/battle_main.c#L3002-L3051) 在确认无法逃跑前先检查 Smoke Ball 与 Run Away，并检查对手的 Shadow Tag、Arena Trap、Magnet Pull 和 Wrap 等限制。本项目实现 Run Away 和 Smoke Ball；两者均可绕过陷阱与速度判定。
- 第 4240–4257 行处理可保证逃跑的携带道具、逃脱特性和野外幽灵战斗。
- 第 4259–4273 行规定单打野外逃跑：速度相同或更快直接成功；速度较慢时以 `u8 speedVar` 保存 `floor(playerSpeed * 128 / targetSpeed) + runTries * 30`，因此先按 8 位无符号值回绕，再与 `Random() & 0xFF` 比较，只有严格大于随机字节才成功。失败尝试之后才递增 `runTries`，故第一次慢速尝试没有额外的 30。卡带直接比较 `gBattleMons[].speed` 原始战斗属性；本地规则接收宿主提供的速度值，不在此处重算速度阶级或麻痹惩罚。
- [`src/battle_main.c` 第 4305–4330 行](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/battle_main.c#L4305-L4330) 规定玩家逃跑失败会继续战斗；野生对手逃跑或成功逃跑才结束本场。

引擎在 `|run|success|<attempt>` 或 `|run|failed|<attempt>` 事件中给出演出结果，`attempt` 从 1 开始。失败事件之后仍结算野生对手行动；成功结果在返回快照中同时标记 `escaped: true` 和 `ended: true`。

## 范围

当前 UI/背包包含精灵球、超级球、高级球及 `special-balls.json` 中的特别球规则。Safari 球与 Safari Zone 专有状态仍不支持。逃跑覆盖当前野外单打、8 位速度概率回绕、失败计数、Run Away 和 Smoke Ball；多打、联机、野外幽灵剧情上下文、对手逃跑与其他未实现的场景也不由本战斗界面模拟。此范围只说明规则实现，不代表完整复刻所有卡带外围条件。

## 战斗道具、状态与回合

来源仍固定为上述 pret commit：

- [`src/party_menu.c` 第 4464–4525 行](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/party_menu.c#L4464-L4525) 执行普通回复/治疗道具；[`src/party_menu.c` 第 4359–4367 行](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/party_menu.c#L4359-L4367) 将混乱治疗与“治愈所有异常状态”列为不同效果。因而 FRLG 万灵药治愈灼伤、中毒/剧毒、麻痹、睡眠、冰冻等主要异常，不会清除混乱；引擎保留这个区别。
- [`src/item_use.c` 第 802–819 行](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/item_use.c#L802-L819) 将复活类药物分派为回复HP的药物效果；[`src/pokemon.c` 第 4255–4345 行](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/pokemon.c#L4255-L4345) 处理复活与HP，不会触碰招式PP。引擎复活至最大HP的一半，PP保持倒下时数值。
- [`src/battle_util.c` 第 2557–2638 行](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/battle_util.c#L2557-L2638) 定义回合中的持有道具效果，包括半血触发回复果、PP果实和每回合残渣回复。当前战斗由 Gen 3 Showdown 数据实现已列入队伍道具目录的效果；Smoke Ball 因 Showdown 物品表不含该 FRLG 道具，由本地逃跑规则直接处理。
- FRLG 背包药品、捕获失败和失败逃跑都会消耗一次玩家行动并让对手行动。引擎对这三类行动使用同一个回合推进流程；捕获或逃跑成功结束战斗，不再推进下一回合。测试核验回合数恰好增加一次。

[`src/pokemon.c` 第 4088–4160 行](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/pokemon.c#L4088-L4160) 按顺序定义 Dire Hit 的 Focus Energy、X Attack/Defend/Speed/Accuracy/Special 的能力等级提升，以及 Guard Spec 的五回合 Mist。对应物品定义见 [`src/data/items.json` 第 1173–1301 行](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/data/items.json#L1173-L1301)，本包在有效时消耗物品并使用同一回合推进流程；无效的重复/封顶使用会在消耗前拒绝。

[`src/item_use.c` 第 821–831 行](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/item_use.c#L821-L831) 规定 Poké Doll 仅能用于野外战斗，成功后消耗道具并立即离场；FRLG 同类 Fluffy Tail 采用同一作用。本包两个道具都发出 `|run|success|0`，其中 0 表示这不是一次速度逃跑尝试，因此不增加真实 `runTries`，也不结算对手行动。训练家对战拒用。

Ether、Max Ether、Elixir、Max Elixir 的回复规则取自固定版本 `src/data/items.json` 对应项。本引擎合并 `public/data/field-items.json` 后按 `item ether <partySlot> <moveSlot>` 或 `item elixir <partySlot>` 接收战斗指令。有效使用把回复量限制在招式最大PP内、同步活动与基础招式槽，并完整推进一回合；PP已满、参数缺失或多余时不耗道具也不推进。PP Up、PP Max、营养剂与神奇糖果的 `battle: null` 保持战斗外使用。

常见携带树果与属性增强道具交由 vendored Showdown Gen 3 held-item 效果执行，并保留 MVU 的持有道具消耗回写；Smoke Ball 因原模拟器缺省由本地逃跑逻辑处理。野生持有物来源表和当前关都生态生成已在frlg-held-items.cjs实现；捕获、偷取与消耗后保留真实持有物，不重复发往背包。详见frlg-held-items-sources.md。完整 Gen 3 招式脚本与特性由 Showdown 战斗内核处理，但不代表所有 FRLG 外围机制或剧情规则均已模拟。

## 招式覆盖与边界

目录覆盖全部354个第三世代编号招式，合并同编号的觉醒力量属性别名，用于真实战斗事件与挥指等调用招式的显示；扩充目录不会让151只关都精灵随意学习全部招式。`engine.cjs` 的 `learnset()` 遍历进化前形态，只接纳来源标记以 `3` 开头且招式世代不高于 3 的条目；队伍校验会拒绝不在该物种招式列表中的选择。战斗执行交给随包 vendored Showdown Gen 3 battle simulator，因此伤害、命中、异常、强化/下降和招式效果按模拟器实现结算。战外升级与终端研修另用FRLG专属成长表；完整演出映射依据见 `public/battle-fx-map.sources.md`。

引擎的通用队伍合法列表采用 Gen 3 来源筛选，尚未逐物种证明其所有来源只属于 FRLG；升级/机器培养的FRLG专属检查与该通用列表分开。本包也没有逐项证明模拟器每个招式效果与该 pret commit 的脚本完全相同。卡带的独立招式来源表在 pret [`level_up_learnsets.h`](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/data/pokemon/level_up_learnsets.h#L4-L16)、[`tmhm_learnsets.h`](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/data/pokemon/tmhm_learnsets.h#L11-L35)、[`egg_moves.h`](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/data/pokemon/egg_moves.h#L6-L11) 和 [`tutor_learnsets.h`](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/data/pokemon/tutor_learnsets.h#L26-L29) 中分别定义。HM01–04与若干关键物品已由地点事件开放，42个简化节点已有版本化加权遭遇资料；这些是独立模块覆盖范围，不是招式目录本身提供的功能。完整解谜、每项道具来源、全部外围条件和逐帧动画仍未实现。
