# PokeMMO particle reference notes

Reference checked on 2026-10-26

- Public source checkout: [u123510/Pokemmo2Pro-Client](https://github.com/u123510/Pokemmo2Pro-Client), commit `5918dbd739f0aab16452cdaf85e86bdc6dc9bcad`.
- The checkout includes a root `LICENSE` stating GNU GPL version 3. This identifies the repository's declared code license; it does not establish licensing for game assets or third-party material bundled in the tree.
- The source includes a particle manager at [`ParticleManager.java`](https://github.com/u123510/Pokemmo2Pro-Client/blob/5918dbd739f0aab16452cdaf85e86bdc6dc9bcad/src/main/java/cn/pokemmo/particle/ParticleManager.java). It loads named `.vfx` files, registers effects for update/draw, removes completed effects, and disposes them.
- [`PumpkinParticleFollowerObject.java`](https://github.com/u123510/Pokemmo2Pro-Client/blob/5918dbd739f0aab16452cdaf85e86bdc6dc9bcad/src/main/java/cn/pokemmo/particle/follower/PumpkinParticleFollowerObject.java) attaches a persistent haze effect to a transform updated from its owner position.
- [`StatChangeParticleEffect.java`](https://github.com/u123510/Pokemmo2Pro-Client/blob/5918dbd739f0aab16452cdaf85e86bdc6dc9bcad/src/main/java/cn/pokemmo/particle/effect/StatChangeParticleEffect.java) uses distinct `status/up` and `status/down` effects for stat direction.
- The checkout does not contain the named `.vfx` configurations or their game particle textures. The resource tree only exposes generic LibGDX particle shaders; these are third-party engine resources, not the Pokémon effect artwork.

## What this implementation takes from the reference

Only broad presentation ideas: a small number of authored particles, color tied to an effect's theme, effects attached to their actor, and deterministic completion/disposal. The browser implementation is a clean-room Canvas 2D drawing: a narrow ground glow and at most 24 seed-stable motes. It does not copy Java code, shaders, `.vfx` data, textures, or Pokémon artwork. One shared animation-frame callback updates active effects, and hidden tabs pause it.

The catalog now has 160 entries. IDs `kfx-001` through `kfx-100` and their existing unlock records remain unchanged; 60 additional entries use the same cosmetic API and save format.

## Theme and choreography decisions

The visible theme is inferred in this order: explicit `family`/`theme`, semantic `id`, known cosmetic `geometry`, palette hue, then the stable catalog seed. This means existing catalog entries can use their current geometry and colors without changing or renumbering any of the 100 IDs. The renderer maps them into eight recognizable local motifs: flame tongues, droplets/ripples, leaves/petals, short electric zigzags, small ice crystals, drifting ghost wisps, star glints, and low dust/pebbles.

The reference's [`RegularEmitter.java`](https://github.com/u123510/Pokemmo2Pro-Client/blob/5918dbd739f0aab16452cdaf85e86bdc6dc9bcad/src/main/java/com/badlogic/gdx/graphics/g3d/particles/emitters/RegularEmitter.java) enforces `maxParticleCount` and bounds emitted counts to available capacity; the local renderer follows that bounded-emission idea with 4–24 small draws per frame. The [`ParticleManager.java`](https://github.com/u123510/Pokemmo2Pro-Client/blob/5918dbd739f0aab16452cdaf85e86bdc6dc9bcad/src/main/java/cn/pokemmo/particle/ParticleManager.java) updates active effects and removes/disposes completed ones; the browser runtime uses one shared RAF and caps all live overlays at eight, with at most four persistent loops. The [`PumpkinParticleFollowerObject.java`](https://github.com/u123510/Pokemmo2Pro-Client/blob/5918dbd739f0aab16452cdaf85e86bdc6dc9bcad/src/main/java/cn/pokemmo/particle/follower/PumpkinParticleFollowerObject.java) updates a follower effect's transform from its owner; the existing battle client anchors effects to the active Pokémon's UID, side and slot. The [`StatChangeParticleEffect.java`](https://github.com/u123510/Pokemmo2Pro-Client/blob/5918dbd739f0aab16452cdaf85e86bdc6dc9bcad/src/main/java/cn/pokemmo/particle/effect/StatChangeParticleEffect.java) chooses different up/down effect assets; here entry, move, aura and outcome get distinct local pacing and particle counts while retaining the selected theme.

All emitted shapes are drawn in original Canvas paths and remain in the lower stage band. Eight themes vary silhouette and motion: flame tongues, water drops, leaf petals, forked electric arcs, faceted ice, ghost wisps, star glints and dust grains. Explicit family, semantic ID, existing geometry, palette hue and the stable seed provide deterministic theme selection.

Common auras stay restrained. Rare entry and victory cues use a brief two-beat cycle: a compact rotating charge mark, followed by a directional burst with short trails and an expanding ring. Fire gains a warm inner highlight, electric arcs fork around a white core, ice shards carry a bright facet, and leaves curl outward. Each frame stays within 24 particles per effect, at most eight live overlays and four looping auras. The standalone [static Canvas preview](../../../work/cosmetic-fx-preview-0.9.4.html) compares a restrained aura with a rare entry cue, lets you select theme and action style, and presents twenty spatial forms.


## 0.9.4 motion-form study

The reference source is inspected at commit `5918dbd739f0aab16452cdaf85e86bdc6dc9bcad` (repository license is GPL-3.0; no code, textures, or effect assets are copied into this clean-room Canvas renderer). Concrete implementation observations:

- `RegularEmitter.java:53-54,116-144` clamps spawned particle count against `maxParticleCount - particles.size` on every update. This motivates the local fixed 24-particle cap rather than catalog-driven unbounded emission.
- `DynamicsInfluencerExt.java:40-158` integrates position from velocity and acceleration, preserves previous positions, and applies a damp factor. This motivates the local deterministic phase/trajectory functions and short directional trails rather than independent random placement each frame.
- `PumpkinParticleFollowerObject.java:88-99` rebuilds its transform from the owner position and calls `setTransform`; line 170 disposes the follower effect. This motivates resolving the active battle actor's UID/side/slot anchor in the caller and removing the one canvas when its owner/action lifecycle ends.
- `ParticleManager.java:168,256,310` has explicit remove, update, and dispose paths. This motivates a single shared RAF, centralized live-effect cleanup, hidden-tab pause, and the 8-active/4-loop cap.

The new renderer separates two axes: theme selects local silhouette/palette, while form selects the path scaffold and each particle's time-parametrized coordinates. Thirty named forms now have distinct drawing-command signatures: double orbit, comet tail, updraft, fountain fan, pulse rings, petal orbit, constellation, accretion, wing arcs, rainfall, snowfall, ember fall, radial shards, wavefront, ribbon loop, light column, hex shield, ground glyph, sand drift, afterimage, black hole, portal cat, bat swarm, spectral eye, lantern rise, scythe orbit, dragon coil, crystal crown, Kanto trio, and fireworks. All remain in the lower/side stage band. Ordinary aura uses a quiet cadence; rare entry/outcome keeps the existing compact charge followed by a directional burst.

The static [0.9.4 preview](../../../work/cosmetic-fx-preview-0.9.4.html) shows an aura/rare-entry comparison and all 30 forms.


## 0.9.4具象演出补充

论坛参考：[Particles guide, previews and release information (2.0)](https://forums.pokemmo.com/index.php?/topic/149548-particles-guide-previews-and-release-information-20/)，帖主 Lynet/Rache。任务提供的帖子要点列有 Black Hole、White Kitty、Bats、Ghosts、The Eye、Spinning Scythe、Paper Lantern、Fireworks、Red Dragon、Kanto Friends、Dark Crystal 等可辨识演出。自动网页读取对此站点返回 HTTP 403，因此此处仅记录用户提供的帖子目录与设计观察，没有复刻帖子图片、质子贴图或配置。

实现改为30个显式 `effect.form` 路由，额外加入黑洞吸积盘、猫从传送门跃出、蝙蝠群翼动、眼球追踪/眨眼、灯笼升起挂穗、旋转镰刀、盘绕龙形、暗晶王冠与分叉电链、御三家短现、上升后第二阶段爆开的烟花。前九类使用原创 Canvas path；御三家优先异步取用项目已存在的 `public/assets/pokemon/1.png`、`4.png`、`7.png`，图片加载期间立即画矢量剪影，读取失败继续走剪影。现有资源来源与版权注意见 [`assets/sources.md`](assets/sources.md)：PokeAPI/sprites 固定版本，图片内容的版权归属仍按该说明处理。

160个目录项都有稳定且显式的 `effect.form`（原有ID、解锁记录和装备接口不变），不再依赖仅导出但无人设置的形态列表。具象图案仍使用本地化 Canvas 命令，粒子数量与生命周期上限不变。
