'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildBattleCinematic, GYMS } = require('../battle-cinematics.cjs');
const { presentation } = require('../presentation.cjs');
const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

function functionSource(name) {
  const start = app.indexOf(`function ${name}(`); assert.notEqual(start, -1, `missing ${name}`);
  const open = app.indexOf('{', start); let depth = 0, quote = '', escaped = false;
  for (let i = open; i < app.length; i++) {
    const ch = app[i];
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return app.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

const trainers = Object.entries(GYMS).map(([id]) => ({ id, name:id, role:'馆主', art:`assets/trainers/official/${id}.png` }))
  .concat([
    {id:'rival_late', name:'小茂', role:'冠军', art:'assets/trainers/official/blue.png'},
    {id:'lorelei', name:'科拿', role:'四天王', art:'assets/trainers/official/lorelei.png'},
    {id:'rocket_grunt', name:'火箭队员', role:'火箭队', art:'assets/trainers/rocket_grunt_m.png'}
  ]);

test('each of the eight real gym identities receives its own badge, theme and trainer art', () => {
  const descriptors = Object.entries(GYMS).map(([id], index) => buildBattleCinematic({
    encounter:{类型:'gym',训练家:id,道馆:index}, npcId:id, npcName:id, trainers
  }));
  assert.equal(new Set(descriptors.map(item => item.key)).size, 8);
  assert.equal(new Set(descriptors.map(item => item.duration)).size, 8, 'each gym has its own entrance timing');
  assert.equal(new Set(descriptors.map(item => item.badge)).size, 8);
  descriptors.forEach(item => { assert.equal(item.important, true); assert.match(item.portrait, /^assets\/trainers\/official\//); assert.ok(item.line); });
});

test('champion, elite four, rocket and fixed legendary encounters use distinct factual descriptors', () => {
  const champion = buildBattleCinematic({ encounter:{类型:'trainer',训练家:'小茂'}, npcId:'rival_late', npcName:'小茂', trainers });
  const elite = buildBattleCinematic({ encounter:{类型:'trainer',训练家:'科拿'}, npcId:'lorelei', npcName:'科拿', trainers });
  const rocket = buildBattleCinematic({ encounter:{类型:'trainer',训练家:'火箭队员'}, npcId:'rocket_grunt', npcName:'火箭队员', trainers });
  const legendary = buildBattleCinematic({ encounter:{类型:'wild',固定遭遇:'power-plant-zapdos',队伍:[{图鉴编号:145}]}, npcName:'传说宝可梦', trainers });
  assert.equal(champion.kind, 'champion'); assert.match(champion.portrait, /blue\.png$/);
  assert.equal(elite.kind, 'elite'); assert.match(elite.portrait, /lorelei\.png$/);
  assert.equal(rocket.kind, 'rocket'); assert.match(rocket.portrait, /rocket_grunt_m\.png$/);
  assert.equal(legendary.kind, 'legendary'); assert.equal(legendary.opponentSpeciesId, 145); assert.equal(legendary.title, '闪电鸟');
  assert.equal(new Set([champion.key, elite.key, rocket.key, legendary.key]).size, 4);
});

test('presentation returns the current opponent descriptor without altering battle data', () => {
  const world = {地图:{地点:'尼比市',节点:'pewter-city',轮次:2},遭遇:{类型:'gym',训练家:'小刚',道馆:0,队伍:[{图鉴编号:74}]},战斗:{状态:'pending'}};
  const result = presentation(world, {trainers:[{id:'brock',name:'小刚',role:'道馆馆主',art:'assets/trainers/official/brock.png'}], backgrounds:[]});
  assert.equal(result.battle.kind, 'gym'); assert.equal(result.battle.badge, '岩石徽章');
  assert.equal(result.battle.opponentSpeciesId, 74); assert.deepEqual(world.遭遇.队伍, [{图鉴编号:74}]);
});

test('battle opening is one-shot, skippable and motion-aware; important beats read real events', () => {
  const css = fs.readFileSync(path.join(__dirname, '../public/battle-theme.css'), 'utf8');
  assert.match(app, /kanto-battle-intro:\$\{battleId\}/);
  assert.match(app, /textContent = '跳过'/);
  assert.match(app, /duration:state\.reducedEffects \? 620 : 1880/);
  assert.match(app, /showBattleEntrance\(snapshot\)/);
  assert.match(app, /kind === 'faint' \|\| kind === 'switch' \|\| kind === 'drag'\) markLastPokemonMoment/);
  assert.match(app, /markBattleOutcome\(line, nextSnapshot\)/);
  assert.match(css, /\.battle-cinematic-skip\s*\{/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  for (const motif of ['theme-rock', 'theme-water', 'theme-electric', 'theme-grass', 'theme-poison', 'theme-psychic', 'theme-fire', 'theme-earth', 'theme-champion', 'theme-dragon', 'theme-rocket']) assert.match(css, new RegExp(`\\.${motif}:after`));
});

test('last-mon, low-HP and result cues use actual battle snapshots and events', () => {
  const shown = [], context = {
    state:{cinematicMoments:new Set(),battle:{sides:[{team:[{name:'A',hp:20},{name:'B',hp:10}]}, {team:[]}] }},
    safeNum:value => Number(value) || 0,
    activeMon:team => team.find(mon => !mon.fainted && mon.hp > 0) || team[0],
    showBattleMoment:(...args) => shown.push(args),
    els:{playerHpText:{textContent:'40 / 100'},foeHpText:{textContent:'90 / 100'},playerName:{textContent:'实际伙伴'},foeName:{textContent:'实际对手'}},
    protocol:line => String(line).split('|')
  };
  vm.runInNewContext(`${['winnerSideIndex','markLastPokemonMoment','markLowHpMoment','markBattleOutcome'].map(functionSource).join('\n')}\nglobalThis.run={markLastPokemonMoment,markLowHpMoment,markBattleOutcome};`, context);
  const finalTeam = {sides:[{team:[{name:'B',hp:10}]},{team:[]}]};
  context.run.markLastPokemonMoment('player', finalTeam);
  context.run.markLowHpMoment('player', '18/100');
  context.run.markBattleOutcome('|win|训练家', {ended:true,winner:'p1'});
  assert.deepEqual(shown.map(row => row[1]), ['最后一只伙伴','实际伙伴体力告急','本场胜利']);
  assert.equal(shown[1][2], 'HP 18 / 100');
  assert.equal(shown[2][2], '对手已无力继续战斗。');
});

test('battle sprites offer pixel and rendered animation modes without static artwork', () => {
  const classes = new Set();
  const img = { style:{}, classList:{ toggle:(name, yes)=>yes?classes.add(name):classes.delete(name), remove:(...names)=>names.forEach(name=>classes.delete(name)) }, dataset:{}, setAttribute(){} };
  const context = { getParty:()=>[], state:{ battleSpriteStyle:'animated' }, window:{},animatedSpriteData:{pokemon:[{dex:25,animated:{front:'animated/front.gif',back:'animated/back.gif'}}]},assetHref:p=>p, isShiny:mon=>mon?.闪光===true||mon?.shiny===true, assetUrl:(id,back)=>`${back?'back/':'front/'}${id}.png` };
  vm.runInNewContext(`${functionSource('setSprite')}\nglobalThis.run=setSprite;`, context);
  context.run(img, { id:25, name:'皮卡丘' }, true);
  assert.equal(img.src,'animated/back.gif');assert.equal(classes.has('animated-sprite'),true);assert.equal(classes.has('artwork-player-facing'),false);
  img.onerror();
  assert.equal(img.src, 'back/25.png'); assert.equal(classes.has('artwork-sprite'), false);
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../public/battle-theme.css'), 'utf8');
  assert.match(html, /id="battleSpriteToggle"[^>]*aria-pressed="true">显示像素精灵/);
  assert.match(app, /setBattleSpriteStyle\(state\.battleSpriteStyle\);/);assert.doesNotMatch(functionSource('setSprite'),/artworkUrl\(/);
  assert.match(css, /\.pokemon-sprite\.artwork-sprite\s*\{[^}]*image-rendering:auto/);
  assert.match(css, /\.pokemon-sprite\.artwork-player-facing\s*\{\s*scale:-1 1/);
});

test('high-resolution trainer portraits override pixel rendering, and all battle cues can be dismissed', () => {
  const css = fs.readFileSync(path.join(__dirname, '../public/battle-theme.css'), 'utf8');
  const baseCss = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
  assert.match(baseCss, /\.npc-portrait-wrap img\{image-rendering:pixelated\}/);
  assert.match(app, /npcSprite\.classList\.toggle\('portrait-artwork', Boolean\(trainerMatch && trainerMatch\.spriteType !== 'overworld-frame'\)\)/);
  assert.match(css, /\.npc-portrait-wrap img\.portrait-artwork\s*\{\s*image-rendering:auto/);
  assert.match(css, /\.battle-cinematic-portrait\s*\{[^}]*image-rendering:auto/);
  assert.match(app, /kind:'moment',[^}]*skippable:true/);
  assert.match(app, /skip\.addEventListener\('click', clearBattleCinematic\)/);
  assert.match(css, /\.battle-cinematic\s*\{[^}]*pointer-events:none/);
  assert.match(css, /\.battle-cinematic-skip\s*\{[^}]*pointer-events:auto/);
});
