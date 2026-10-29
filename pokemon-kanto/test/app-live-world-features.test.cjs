'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'../public');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const theme=fs.readFileSync(path.join(root,'battle-theme.css'),'utf8');
const tileUi=fs.readFileSync(path.join(root,'tile-world-ui.js'),'utf8');

test('native and embedded pages load live-world, cosmetics and doubles modules with their styles',()=>{
  for(const asset of ['cosmetic-fx.css','doubles-ui.css','classic-services.css','map-panzoom.css'])assert.match(html,new RegExp(`href="\\./${asset}"`));
  for(const asset of ['cosmetic-fx.js','doubles-ui.js','classic-services-ui.js'])assert.match(html,new RegExp(`src="\\./${asset}"`));
  for(const id of ['cosmeticsPanel','classicServicesPanel','rocketEventsPanel','doubleActives','bossTier','battleMode'])assert.match(html,new RegExp(`id="${id}"`));
  assert.doesNotMatch(html,/tileWorldPanel|tile-world-ui/);
  assert.match(theme,/\.arena\.is-doubles \.status-card/);assert.match(theme,/\.double-active-grid/);
});

test('app consumes active specialized views and leaves the legacy tile map out of the interface',()=>{
  for(const field of ['classicServices','cosmetics','rocketEvents'])assert.match(app,new RegExp(`view\\.${field}`));
  assert.doesNotMatch(app,/view\.tileWorld|KantoTileWorld|sceneAction\('tile-world'/);
  assert.match(app,/api\('\/api\/scene',[\s\S]{0,140}JSON\.stringify\(\{action,payload\}\)/);
  assert.match(app,/zoomMap\(event\.deltaY < 0 \? 1 : -1/);
  assert.match(app,/map-panzoom-layer/);
  assert.match(app,/state\.mapX=Math\.max\(w\*\(1-z\)/);
  assert.match(fs.readFileSync(path.join(root,'map-panzoom.css'),'utf8'),/touch-action:\s*none/);
  assert.match(app,/choice\.requiresBattle\?'rocket-battle':'rocket-story-choice'/);
  assert.match(app,/window\.KantoClassicServices\.render/);assert.match(app,/window\.globalKantoCosmetics\.render/);
});

test('cosmetic effects are keyed by the real active UID and actual entry, move, and outcome protocol events',()=>{
  assert.match(app,/Object\.hasOwn\(own,slot\)\?own\[slot\]/);
  assert.match(app,/activeUIDs\?\.\[actorSlot\(token\)\]/);
  assert.match(app,/kind === 'switch' \|\| kind === 'drag'\) && actorSide\(p\[2\]\)==='player'\) playCosmeticEntry/);
  assert.match(app,/if\(side==='player'\)playCosmeticMove\(p\[2\],nextSnapshot\)/);
  assert.match(app,/playCosmeticOutcome\(nextSnapshot\)/);
  assert.match(app,/if\(state\.reducedEffects\)\{clearCosmeticEffects\(\);clearShinyEntries\(\);\}/);
});

test('doubles controls use the engine two-actor request, pass joined native commands, and show active UIDs',()=>{
  assert.match(app,/snapshot\.doubleBattle && window\.KantoDoubles\?\.render/);
  assert.match(app,/forceSwitchSlots:request\.forceSwitch/);
  assert.match(app,/onSubmit:takeAction/);
  assert.match(app,/activeUIDs\?\.\[slot\]/);
  assert.match(app,/KantoDoubles\.render/);
  const doubles=fs.readFileSync(path.join(root,'doubles-ui.js'),'utf8');
  assert.match(doubles,/parts\.join\(', '\)/);
  assert.match(doubles,/commands\.length!==2/);
  assert.match(doubles,/battleItems\.map/);assert.match(doubles,/data-item-target/);assert.match(doubles,/item \$\{card\.querySelector\('\[data-item\]'\)\.value\}/);
});

test('battle result reporting controls and automatic finish posts are absent while MVU rewards remain',()=>{
  assert.doesNotMatch(app,/battle-finished|战果写入输入框|requestBattleReport/);
  assert.doesNotMatch(app,/战斗\?\.摘要|\['摘要', 'summary', '结果'\]/);
  assert.doesNotMatch(html,/战果写入输入框|AI战果总结/);
  assert.match(app,/function renderBattleResult\(snapshot\)/);
  assert.match(app,/金币 \$\{reward\.金币/);
});
