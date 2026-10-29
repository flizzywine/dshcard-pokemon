# 关都地点事件的资料与改编边界

本事件包是原创支线与对话，不重写、不逐句复述动画或漫画情节。官方动画和漫画用来校准角色关系、地点氛围和合作主题；FRLG 作为地图、徽章与秘传学习器顺序的游戏框架。每个事件只能在项目现有 `public/data/map.json` 节点触发，不创建新城镇或路线，也不要求去七之岛。

## 官方资料

- Pokémon 官方的 [FireRed Version / LeafGreen Version 游戏介绍](https://www.pokemon.com/us/pokemon-video-games/pokemon-firered-version-and-pokemon-leafgreen-version) 说明作品回到关都，并把七之岛作为额外探索地点。本项目的主线事件留在当前关都地图，因此不把七之岛设为完成关都故事的前置条件。
- Pokémon 官方动画简介：[《The Water Flowers of Cerulean City》](https://www.pokemon.com/uk/animation/seasons/1/episode-7-the-water-flowers-of-cerulean-city) 展示小霞与华蓝市的联系；[《Bulbasaur and the Hidden Village》](https://www.pokemon.com/uk/animation/seasons/1/episode-10-bulbasaur-and-the-hidden-village) 描写小智、小霞、小刚共同救助受伤宝可梦并处理捕猎者威胁；[《Pikachu’s Goodbye》](https://www.pokemon.com/uk/animation/seasons/1/episode-36-pikachus-goodbye) 将森林中的野生皮卡丘群与小智的皮卡丘联系起来；[《Here Comes the Squirtle Squad》](https://www.pokemon.com/us/animation/seasons/1/episode-12-here-comes-the-squirtle-squad) 展示团队在危急时照顾受伤的皮卡丘。事件中的树丛守护、避免惊扰和先照顾伤者是新写的互动，不是这些分集的复刻。
- VIZ 官方发行说明 [Pokémon Adventures 数字漫画篇章](https://www.viz.com/blog/posts/pokemon-digital-manga-release-guide) 将 Red 与 Blue 在关都对抗火箭队列为游戏漫画篇章，并介绍《FireRed & LeafGreen》篇中 Red 与 Blue 合作营救大木博士。玉虹火箭队与金黄西尔佛公司事件仅借鉴“训练家共同阻止火箭队并保护受困者”的主题，场景、选择与结果均为原创。
- 巨大快龙的校准来源是 Pokémon 官方频道的 [第13集《Mystery at the Lighthouse》](https://www.youtube.com/watch?v=3l1lSNQxJA0)：它支持正辉灯塔与等待未知来客的设定。本项目灯塔事件只记录雾中轮廓、声呐回声和仪器量程，不把角色目击感受写成真实体长、图鉴身份或捕获事实。
- 火箭三人组身份以东京电视台官方[人物介绍](https://www.tv-tokyo.co.jp/anime/pocketmonster/chara/)核对；特别篇火箭队背景以小学馆[《宝可梦特别篇》第1卷简介](https://e-comi.shogakukan.co.jp/books/091493310000d0000000)与 VIZ 的[Red and Blue 篇章简介](https://www.viz.com/blog/posts/pokemon-digital-manga-release-guide)校准。组织命令与三人的利益冲突、赤红/青绿/小蓝在常青分担的救援和审计工作均为原创桥段；特别篇人物仍使用各自 `manga-*` 角色 ID。
- 本轮新增三段多阶段原创互动，主题依据采用 Pokémon 官方的[《I Choose You!》简介](https://www.pokemon.com/us/animation/movies/pokemon-the-movie-i-choose-you)（提及小智帮助遭遗弃的火恐龙）与Pokémon 官方动画频道[《Bye Bye Butterfree》](https://www.youtube.com/watch?v=T23nJU-KwZo)（描述巴大蝶加入迁徙队列），不复刻具体对白或情节。Rocket 主线的组织获利动机参考官方[火箭队介绍](https://www.pokemon.co.jp/ex/pika_vee/story/180809_02.html)；特别篇式团队救援与证据整理仍是原创。火恐龙照护需要一次真实的营地休整记录；港口迁徙事件只写事件旗标、奖励和回响，不修改玩家队伍或自动收放宝可梦。三段新事件分别覆盖24—25号道路、枯叶港，以及玉虹—西尔佛—常青的阶段式火箭队证据链；特别篇账本事件需此前三人组与特别篇证据支线的完成旗标。

## 游戏规则边界与落地

- 地点与连接只从 [`map.json`](map.json) 读取；模块启动时校验事件节点均存在。场景不修改地点邻接，也不让事件完成自动旅行。
- HM01–04 的编号、名称和教学招式来自 [`tmhm.json`](tmhm.json)。HM 在最后一个成功互动中发放并写入进度；其他新剧情奖励只允许来自现有物品目录且必须有 MVU 背包槽位。事件先整组核验物品、背包容量后再结算，失败选择、重复点击、重复事件都不能重复发放。路线前置只使用有叙事理由的徽章数量或此前明确完成的剧情标记，不宣称项目尚未实现的地图门禁已被模拟。
- 既有多阶段原创支线包括3号道路搭档露营、枯叶港武藏/小次郎非战斗和解、金黄西尔佛证据处置及双子岛自主救援。后续新增的正辉灯塔、火箭队三人组、特别篇双线、西尔佛最终证据链等事件也以既有阶段、地点和布尔旗标推进；本轮扩展后事件总数为23。新内容包括24—25号道路的自愿照护（营地休整后才能完成）、枯叶港迁徙队列护送/让路两个有代价结局、坂木货运证据与人质撤退链。涉及新物品奖励时只发放已登记的全满药或超级球，且最后阶段一次性结算。场景元数据只引用已有 road/coast/rocket-base/village 标签和 quietReflection/rocketAppears/silphCo 配乐事件。
- S.S. Anne 要先完成比尔船票互动并至少取得一枚徽章；16号道路的飞翔小屋要求完成自行车相关互动；狩猎地带冲浪与金牙均要求显式互动；火箭队地下室须先调查游戏厅海报，宝可梦塔须先取得西尔佛检视镜；红莲旧研究所的调查以背包拥有 HM03 为前提。各互动的失败结果会保留当前阶段并写入叙事记录，不发奖励。
- 立绘 `portraitId` 复用 [`trainers.json`](trainers.json) 的人物 ID/资产；小智用已有的 `trainer_ash`，特别篇三位图鉴持有人分别使用 `manga-red`、`manga-green`、`manga-blue` 的明确改编参考。立绘只是剧场显示资源，不暗示赤红与小智、青绿与小茂、特别篇小蓝与游戏叶子是同一角色。

模块通过场景选项派发明确的 `kanto-story-event` 操作。每次成功、失败或阶段推进都会写入 `剧情.剧场` 的当前地点与对白；阶段可覆写说话者、肖像、sceneTag 与 musicEvent，这些受控元数据也进入导演可读的当前事件视图。提示文本只负责叙述已存档内容，不授予奖励也不推进任务状态。
