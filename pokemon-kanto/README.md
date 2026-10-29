# 火红叶绿插件 1.0.0

面向 [DSH Tavern](https://github.com/flizzywine/dsh-tavern) 的关都角色卡插件。普通玩家请从[仓库首页](../README.md)下载 `.dshcard`，不能把这个目录单独当完整游戏安装。

宿主入口为 `index.mjs`，客户端为 `client.js`，原生清单在 `../card-source/dsh.json`。发行卡要求 Tavern API 4；`mvuSettlementProvider` 由能力探测注册，原生对白气泡由宿主控制，无需覆盖宿主文件。

`npm test` 运行 `test/*.test.*`；`npm start` 运行隔离预览 `server.cjs`，默认仅监听 `127.0.0.1:4177`。可用 `KANTO_PORT` 改端口、`KANTO_SAVE_PATH` 指定独立预览存档。默认预览存档在忽略的 `save/game.json`，不读取 DSH 玩家的安装目录。

本地媒体需要先在仓库根目录执行 `python scripts/fetch_assets.py`。引擎依赖已固定随源码提供，来源许可保留在 `vendor/`。规则代码、AI 叙事和前端表现的职责见 [架构说明](../docs/ARCHITECTURE.md)，验证边界见 [测试说明](../docs/TESTING.md)。

原逐格地图研究资料在 [TILE-WORLD.md](TILE-WORLD.md)，并不代表原作全部机关都已实现；玩家默认使用图片路线地图。图片、音乐和演出材质在独立资源包中，插件目录只打包代码与规则数据。
