# Battle visual coverage and source notes

`battle-fx-map.js` resolves a profile for every move exposed by the current Kanto catalogue (the Gen III learnsets of National Pokédex 001–151 plus Struggle). Profiles keep the catalogue's real type and damage category, then assign a readable motion family: contact, slash, projectile, beam, repeated impact, buff, debuff, field, weather, healing, or drain. Named signatures cover recognizable moves and broad semantics cover the rest. `test/battle-fx-map.test.cjs` checks the entire live catalogue, so its coverage count follows the supported move set.

The stage effects are original interpretations. They do not claim to reproduce the GBA animation frame for frame. The FireRed disassembly informed the distinction between a move's script and the effects it schedules:

- [pret/pokefirered `data/battle_anim_scripts.s`](https://github.com/pret/pokefirered/blob/master/data/battle_anim_scripts.s) contains the original per-move battle animation scripts.
- [pret/pokefirered `asm/macros/battle_anim_script.inc`](https://github.com/pret/pokefirered/blob/master/asm/macros/battle_anim_script.inc) defines the script instructions for loading graphics, creating sprites/tasks, waiting for effects, playing sounds, and changing backgrounds.
- [pret/pokefirered `src/battle_anim.c`](https://github.com/pret/pokefirered/blob/master/src/battle_anim.c) interprets those script instructions.

The client follows the actual battle event stream for move, damage, status, stat-change, capture, and escape cues. A capture event reports 0–3 visible shakes: three shakes can mean either a final failed check or a catch, so the client treats `caught` plus `ended` in the resulting snapshot as authoritative. Escape cues likewise require the explicit success event backed by `ended` and `escaped`.


The visual particle redesign also records a separate PokeMMO source review and the clean-room inspiration/license boundary in [BATTLE-FX-POKEMMO-REFERENCE.md](BATTLE-FX-POKEMMO-REFERENCE.md). It does not import PokeMMO VFX files or textures.

The PokeMMO particle review also informed eight semantic Canvas themes and separate entry/move/aura/outcome pacing. The theme mapping, emitter budgets, anchor strategy, original-art boundary and static preview are documented in [BATTLE-FX-POKEMMO-REFERENCE.md](BATTLE-FX-POKEMMO-REFERENCE.md).


### 0.9.4 motion system notes

- PokeMMO reference paths (read-only inspection at `5918dbd739f0aab16452cdaf85e86bdc6dc9bcad`): `src/main/java/com/badlogic/gdx/graphics/g3d/particles/emitters/RegularEmitter.java` (capacity-clamped emission), `.../influencers/DynamicsInfluencerExt.java` (velocity/acceleration/damping integration), `src/main/java/cn/pokemmo/particle/follower/PumpkinParticleFollowerObject.java` (owner-transform follower/dispose), and `src/main/java/cn/pokemmo/particle/ParticleManager.java` (update/remove/dispose lifecycle). The upstream repository is GPL-3.0. We reuse only high-level design observations; no upstream source, art, texture or `.vfx` configuration is embedded.
- Local implementation: `public/cosmetic-fx.js` holds 30 deterministic semantic forms in `FORM_ALIASES`, `scaffold`, and `positionFor`. Theme drawing remains independent. A shared RAF, 24 particle/effect maximum, 8 active canvases, 4 persistent aura loops, hidden-tab pause, and explicit stop cleanup remain in force.
- Drawing-level regression coverage: `test/cosmetic-fx.test.cjs` records Canvas command names and numeric path arguments, then verifies unique command streams for all 30 forms.
- Visual check artifact: `work/cosmetic-fx-preview-0.9.4.html` is a plain local HTML Canvas preview; no browser automation is required.


### 0.9.4具象主题参考

- PokeMMO论坛演出目录：[Lynet/Rache, “Particles guide, previews and release information (2.0)”](https://forums.pokemmo.com/index.php?/topic/149548-particles-guide-previews-and-release-information-20/)。父任务提供的参考案例包括 Black Hole、White Kitty、Bats、The Eye、Spinning Scythe、Paper Lantern、Fireworks、Red Dragon、Kanto Friends、Dark Crystal。站点拒绝了本次自动读取（HTTP 403）；不下载或复用其预览图、游戏贴图、VFX配置。只将具体生物/物件/事件结构转为全新 Canvas paths。
- `cosmetics.cjs` 为全部160条目录显式设置30个稳定形式之一；`cosmetic-fx.js` 以 `effect.form` 选择路径，主题只调颜色与粒子剪影。新增具象forms：`black-hole`, `portal-cat`, `bat-swarm`, `spectral-eye`, `lantern-rise`, `scythe-orbit`, `dragon-coil`, `crystal-crown`, `kanto-trio`, `fireworks`。
- `kanto-trio` 的可选快速登场素材来自项目已存在的 `public/assets/pokemon/{1,4,7}.png`；采用异步 Image 缓存，加载前/失败时绘制原创矢量剪影。上游固定快照、图片权利及限制已列在 [`assets/sources.md`](assets/sources.md)。未新增图片文件。
- `test/cosmetic-fx.test.cjs` 覆盖30种不同的绘图命令流、黑洞/猫/晶群/烟花等动画阶段变化、以及御三家图像尚未加载时的同步矢量回退。
