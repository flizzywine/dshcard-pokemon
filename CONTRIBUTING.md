# 参与开发

先按 README 准备固定版本资源。无需安装或修改 DSH 本体，测试会使用合成状态与隔离存档。开发资源、dist、个人 save 都不进入 Git；请勿用私人诊断快照补测试 fixture。

## 提交一个可复查的 PR

1. Fork 仓库并从 main 建分支。
2. 把改动控制在一个问题或功能；解释具体触发条件、修改后的行为与兼容影响。
3. 运行 `npm test` 和 `python scripts/check_repository.py`。涉及规则或状态写入时补能复现原问题的测试；纯文档小改无需补镜像式测试。
4. UI 改动附桌面／窄屏实际截图；资源改动保留作者、来源、许可、文件名与使用位置。
5. 提交 PR，写明执行了哪些检查，哪些宿主场景还没实测。不要写无法验证的「零 Bug」「所有设备流畅」。

## 重点边界

- 唯一权威状态为原生 MVU `stat_data.宝可梦`。不要再造独立的队伍、背包或战果缓存。
- 写入必须遵守宿主正文版本与忙碌状态；幂等回执、恢复日志和重复领奖保护不可用「提速」名义删除。
- 战斗事件驱动演出，演出失败不应改变数值与结算。异常 AI 回复只能回退合法行动。
- 旧 UID、外观 ID 和资源别名可能来自存档；先查动态使用及迁移，再删代码或图片。
- 本体对白气泡由本体控制；不要加另一个冲突开关。
- 第三世代原规则与同人扩展必须分清。修改原规则请给上游源码或原始规则依据。

## 常用位置

入口及宿主接口：`pokemon-kanto/index.mjs`、`client.js`；结算：`settlement-provider.cjs`、`mvu.cjs`；引擎：`engine.cjs` 与固定 `vendor/showdown`；剧情：`story-*.cjs`；成长：`growth-mechanics.cjs`、`party.cjs`；前端：`public/app.js`、`public/style.css`、`public/cosmetic-fx.js`；回归：`test/`。

## 大文件和发布

媒体通过固定 Release 下载。新媒体先在 Issue 中说明授权与体积，再以资源包／发行附件更新，不把几百 MiB 二进制塞进 Git 历史。角色卡用 `python scripts/build_card.py` 构建；正式发布前需要本体导入、旧局迁移和舞台交互验收。

只有本地存在旧版引擎基线并设置 `KANTO_ENGINE_BASELINE` 时，旧版本性能对比才运行；其他环境明确跳过。不要为消除 skip 写假基线。
