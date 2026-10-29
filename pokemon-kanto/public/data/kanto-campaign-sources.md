# 关都原创主线：来源与规则边界

## 创作依据

本主线把玩家角色放在故事中心，以关都地图、八枚徽章、石英大会和四天王为舞台。它是一条原创的“无印篇旅行氛围 + 特别篇角色改编”融合故事，不声称是两作共享的官方时间线。图鉴生态记录逐步发现重复采样编号，继而追到火箭队的野外实验、玉虹货单与西尔佛权限日志，再由红莲旧档案解释研究用途如何被篡改，最终让玩家在大会前选择公开范围、隐私保护和复核责任。每章的触发、证据、人物立场、选择代价与下一章回响都写在数据中；未选择的支线不会伪装成既成事实。

- [宝可梦官方动画介绍](https://www.pokemon.co.jp/tv_movie/anime/pokemon.html)把无印篇的起点放在关都真新镇：小智从大木博士处启程，以成为宝可梦大师为目标，在尼比、枯叶等道馆经历对战和旅行。章节采用旅行伙伴、道馆挑战、途中相遇的冒险感，但具体冲突和对白均为本项目新写。
- [东京电视台动画人物介绍](https://www.tv-tokyo.co.jp/anime/pocketmonster/chara/)记载小智与皮卡丘的旅伴关系、小霞的华蓝道馆身份、小刚曾与小智和小霞同行、小茂是大木博士的孙子且与小智是长久的劲敌，以及火箭队对稀有和强力宝可梦的执念。剧情数据据此使用小智、小霞、小刚、小茂、武藏和小次郎等人物；角色在新章节中的动机、选择和互动是原创情境，不宣称对应某一集的原剧情。
- [小学馆《宝可梦特别篇》第1卷简介](https://e-comi.shogakukan.co.jp/books/091493310000d0000000)描述赤红与绿为完成图鉴而旅行、与小霞相遇并逐渐成长，以及火箭队作为贯穿故事的对手。这里借用“图鉴观察与训练家成长可以并行”“劲敌也有自己的目标”“组织线索逐步浮现”等宽泛主题；本主线没有搬用特别篇的具体桥段、场景或对白，也不将赤红替换成动画小智。
- [FRLG 官方舞台介绍](https://www.pokemon.co.jp/game/gba/fl/stage.html)确认《火红／叶绿》的舞台为关都，并介绍七岛及四天王科拿等游戏人物。章节地点与角色只使用项目已有的关都地图和训练家资源。
- 宝可梦官方对[宝可梦联盟的介绍](https://www.pokemon.co.jp/ex/sun_moon/story/161027_01.html)说明系列中的联盟由四天王和冠军等强敌构成。当前模块额外设置“石英大会64人单败赛，连续胜六场成为优胜者后才解锁四天王”作为本项目专属的原创进度门槛；此赛制和该门槛不是对任何动画集、漫画篇章或 FRLG 原作规则的引用。

特别篇人物与无印篇人物以资源 ID 分开：赤红使用 `manga-red`，特别篇青绿使用 `manga-green`，特别篇小蓝使用 `manga-blue`；动画/游戏线的小智、小霞、小刚、小茂使用各自现有角色资源。尤其 `manga-green` 不等于小茂（`rival_early` / `rival_late`），文本也不把小智与赤红合并。若资产目录没有特别篇人物对应肖像，章节不得临时复用其他角色或虚构肖像。

上述页面用于核对人物身份、作品版本和舞台背景。程序中的短对白摘要为原创，不复制页面文字或原作脚本。人物肖像优先引用既有 `public/data/trainers.json` 的 `portraitId`，避免另造重复人物资源。

## 内容和系统范围

章节数据在 [`kanto-campaign.json`](kanto-campaign.json)，纯 world 状态模块在 [`story-campaign.cjs`](../../story-campaign.cjs)。序章后按已取得的徽章开放八个地点章节，保留原徽章数量、节点、可选进度和大会门槛。`continuity` 根对象声明主线证据链、人物身份规则和字段合同；章节通过 `sceneTag`、`musicEvent`、`speakers` 描述镜头、音乐与出场人物，通过 `trigger`、`conflict`、`continuity.evidence` 及 `continuity.next` 提供叙事上下文。每个选择都有 `tradeoff`、`consequence`、本章 `echo`，以及目标为下一章或 `tournament` 的 `followup`。分支只存于已有的 `campaign-choice` 校验接口，并记录少量羁绊值和旗标；不会更改徽章、战斗结果、队伍或物品。

宿主提示上下文接口：`campaign.view(world)` 返回可序列化快照 `{ campaignId, continuity, phase, scene, branchEchoes, history, tournament }`。`scene` 提供 `{ id, title, location, sceneTag, musicEvent, speakers, summary, trigger, conflict, continuity, choices }`；其中 `continuity` 是 `{ threadId, evidence, next }`，而 `trigger` 与 `conflict` 是场景字段。每个 `choices[]` 含 `tradeoff` 与 `consequence`，明确承担的代价和分支后果。`branchEchoes` 只包含已选分支中明确指向当前章节或大会的后续回响。`campaign.prompt(world)` 使用相同字段构造叙事提示，要求表现立场冲突与选择代价。序章和章节外的大会/旅程也可返回对应阶段上下文。`view` 不写入 world，选择仍必须由 `campaign-choice` 行动验证，不能依提示文本推断或直接写状态。

石英大会的八强路线按报名后的64强、32强、16强、8强、半决赛、决赛六轮表示，其他选手的比赛作为幕后赛程略过。每轮是与一个训练家的独立 encounter，使用 `campaignId: "indigo-tournament"`、1起算 `tournamentRound` 和报名序号 `tournamentAttempt` 区分普通训练家或道馆遭遇。击败对手只增加待进行轮次；宿主需通过单独的“进入下一轮”操作生成 encounter，保留刚完成的战报与奖励。任何非胜利的已结束结果都会淘汰本次报名，之后可重新报名。石英大会优胜旗记录为一次性纪念物；冠军资格只在最终一轮胜利后成立，随后由宿主以 `canEnterElite(world)` 门禁开放四天王。

对战队伍规格由模块提供 `speciesId`、等级和稳定 UID；宿主以现有 `makeMon` 生成完整 MVU 队伍成员。模块不创建战斗模拟器对象，不会替换正在结算的 encounter，不调用场景、MVU、索引、客户端或导演模块。当前 module 不自行修改四天王进度；与既有联盟战斗入口的实际阻断需要宿主接入 `canEnterElite`。
\n\n## 本轮改编记录\n八章摘要补入角色各自的行动方式与立场反馈（例如小霞先给居民写通行时段、马志士划出带电隔离线、夏伯署名承担旧流程问题）。这些是原创场景细节，现有分支目标、choice ID 与回响结算未改。\n