'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, '../public/battle-theme.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const battleFxMap = fs.readFileSync(path.join(__dirname, '../public/battle-fx-map.js'), 'utf8');

function extractFunction(name) {
  const marker = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(app);
  assert.ok(marker, `missing ${name}`);
  const start = marker.index, brace = app.indexOf('{', start);
  let depth = 0, quote = '', escaped = false, lineComment = false, blockComment = false;
  for (let i = brace; i < app.length; i++) {
    const ch = app[i], next = app[i + 1];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i++; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return app.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function fakeSprite(rect, id) {
  const classes = new Set();
  return {
    hidden: false, dataset: { speciesId: String(id) }, offsetWidth: 100,
    getBoundingClientRect: () => rect,
    classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)) },
    style: { values: {}, setProperty(key, value) { this.values[key] = value; }, removeProperty(key) { delete this.values[key]; } },
  };
}

function effectHarness() {
  const arenaRect = { left: 10, top: 20, width: 800, height: 500 };
  const player = fakeSprite({ left: 90, top: 365, width: 110, height: 85 }, 1);
  const foe = fakeSprite({ left: 610, top: 130, width: 90, height: 75 }, 16);
  const emitted = [], changedSprites = [];
  const context = {
    Math, setTimeout: () => 0,
    state: { reducedEffects: false, animationSpeed: 1 },
    els: { stage: { clientWidth: arenaRect.width, clientHeight: arenaRect.height, getBoundingClientRect: () => arenaRect }, playerSprite: player, foeSprite: foe },
    safeNum: value => Number(value) || 0,
    actorSide: token => /^p1/i.test(token || '') ? 'player' : /^p2/i.test(token || '') ? 'foe' : null,
    wait: async () => {},
    scheduleFxCleanup: () => 0,
    emitFx: (...args) => emitted.push(args),
    canonicalMove: raw => ({
      flamethrower: { id: 'flamethrower', type: 'Fire', category: 'Special', power: 90 },
      fireblast: { id: 'fireblast', type: 'Fire', category: 'Special', power: 110 },
      firespin: { id: 'firespin', type: 'Fire', category: 'Special', power: 35 },
      hydropump: { id: 'hydropump', type: 'Water', category: 'Special', power: 120 },
      icebeam: { id: 'icebeam', type: 'Ice', category: 'Special', power: 90 },
      aurorabeam: { id: 'aurorabeam', type: 'Ice', category: 'Special', power: 65 },
      psychic: { id: 'psychic', type: 'Psychic', category: 'Special', power: 90 },
      confusion: { id: 'confusion', type: 'Psychic', category: 'Special', power: 50 },
      shadowball: { id: 'shadowball', type: 'Ghost', category: 'Special', power: 80 },
      lick: { id: 'lick', type: 'Ghost', category: 'Physical', power: 20 },
      vinewhip: { id: 'vinewhip', type: 'Grass', category: 'Physical', power: 45 },
      tackle: { id: 'tackle', type: 'Normal', category: 'Physical', power: 35 },
      scratch: { id: 'scratch', type: 'Normal', category: 'Physical', power: 40 },
      leechseed: { id: 'leechseed', type: 'Grass', category: 'Status', power: 0 },
      hypnosis: { id: 'hypnosis', type: 'Psychic', category: 'Status', power: 0 },
      dreameater: { id: 'dreameater', type: 'Psychic', category: 'Special', power: 100 },
      doubleteam: { id: 'doubleteam', type: 'Normal', category: 'Status', power: 0, target: 'self' },
      substitute: { id: 'substitute', type: 'Normal', category: 'Status', power: 0, target: 'self' },
      protect: { id: 'protect', type: 'Normal', category: 'Status', power: 0, target: 'self' },
      teleport: { id: 'teleport', type: 'Psychic', category: 'Status', power: 0, target: 'self' },
      transform: { id: 'transform', type: 'Normal', category: 'Status', power: 0 },
      hyperbeam: { id: 'hyperbeam', type: 'Normal', category: 'Special', power: 150 },
      metronome: { id: 'metronome', type: 'Normal', category: 'Status', power: 0, target: 'self' },
      earthquake: { id: 'earthquake', type: 'Ground', category: 'Physical', power: 100 },
      dig: { id: 'dig', type: 'Ground', category: 'Physical', power: 80 },
      growl: { id: 'growl', type: 'Normal', category: 'Status', power: 0, target: 'normal' },
      swordsdance: { id: 'swordsdance', type: 'Normal', category: 'Status', power: 0, target: 'self' },
      sleeppowder: { id: 'sleeppowder', type: 'Grass', category: 'Status', power: 0, target: 'normal' },
      surf: { id: 'surf', type: 'Water', category: 'Special', power: 95 },
      watergun: { id: 'watergun', type: 'Water', category: 'Special', power: 40 },
      blizzard: { id: 'blizzard', type: 'Ice', category: 'Special', power: 120 },
      icywind: { id: 'icywind', type: 'Ice', category: 'Special', power: 55 },
      powdersnow: { id: 'powdersnow', type: 'Ice', category: 'Special', power: 40 },
      aurorabeam: { id: 'aurorabeam', type: 'Ice', category: 'Special', power: 65 },
      thunderbolt: { id: 'thunderbolt', type: 'Electric', category: 'Special', power: 95 },
      thunder: { id: 'thunder', type: 'Electric', category: 'Special', power: 120 },
      thundershock: { id: 'thundershock', type: 'Electric', category: 'Special', power: 40 },
      zapcannon: { id: 'zapcannon', type: 'Electric', category: 'Special', power: 100 },
      razorleaf: { id: 'razorleaf', type: 'Grass', category: 'Physical', power: 55 },
      magicalleaf: { id: 'magicalleaf', type: 'Grass', category: 'Special', power: 60 },
      leafblade: { id: 'leafblade', type: 'Grass', category: 'Physical', power: 70 },
      extrasensory: { id: 'extrasensory', type: 'Psychic', category: 'Special', power: 80 },
      rockslide: { id: 'rockslide', type: 'Rock', category: 'Physical', power: 75 },
      rockthrow: { id: 'rockthrow', type: 'Rock', category: 'Physical', power: 50 },
      rocktomb: { id: 'rocktomb', type: 'Rock', category: 'Physical', power: 50 },
      mudshot: { id: 'mudshot', type: 'Ground', category: 'Special', power: 55 },
      mudslap: { id: 'mudslap', type: 'Ground', category: 'Special', power: 20 },
      solarbeam: { id: 'solarbeam', type: 'Grass', category: 'Special', power: 120 },
    })[String(raw).toLowerCase().replace(/[^a-z0-9]/g, '')] || null,
    burst: (...args) => emitted.push(['fallback', ...args]),
    spriteFor(side) { return side === 'player' ? player : foe; },
    setSprite(sprite, mon, back) { changedSprites.push({ sprite, mon, back }); sprite.hidden = false; sprite.dataset.speciesId = String(mon.id); },
  };
  vm.runInNewContext(battleFxMap, context);
  const names = ['arenaPoint', 'spritePoint', 'arenaVector', 'pointAlong', 'emitMoveChoreography', 'animateMove', 'animateSwitch', 'damageHitFx'];
  vm.runInNewContext(`${names.map(extractFunction).join('\n')}\nglobalThis.api={arenaPoint,spritePoint,arenaVector,pointAlong,emitMoveChoreography,animateMove,animateSwitch,damageHitFx};`, context);
  return { api: context.api, context, emitted, changedSprites, player, foe, arenaRect };
}

test('maximum-trust entry particles require the actual MVU UID and respect reduced effects',()=>{
 const h=effectHarness(),moments=[];
 h.context.state.world={羁绊:{伙伴:{'lead-uid':{信赖:100},'low-uid':{信赖:99}}}};
 h.context.showBattleMoment=(...args)=>moments.push(args);
 vm.runInNewContext(extractFunction('companionBondFx')+'\nglobalThis.bondFx=companionBondFx;',h.context);
 h.context.bondFx({uid:'low-uid',name:'小火龙'});assert.equal(h.emitted.length,0);
 h.context.bondFx({id:4,name:'小火龙'});assert.equal(h.emitted.length,0,'species IDs never stand in for companion UIDs');
 h.context.bondFx({uid:'lead-uid',name:'小火龙'});assert.equal(h.emitted.filter(fx=>fx[0]==='bond-particle').length,8);assert.equal(moments.length,1);
 h.emitted.length=0;h.context.state.reducedEffects=true;h.context.bondFx({uid:'lead-uid'});assert.equal(h.emitted.length,0);
 h.context.state.reducedEffects=false;h.context.state.fastForward=true;h.context.bondFx({uid:'lead-uid'});assert.equal(h.emitted.length,0);
});

test('move effects originate at the current sprite rectangles and include Gen III status-move actions', async () => {
  const h = effectHarness();
  const player = h.api.arenaPoint(h.player, .52, .48), foe = h.api.spritePoint('foe');
  assert.ok(Math.abs(player.x - .1715) < .001);
  assert.ok(Math.abs(player.y - .7716) < .001);
  assert.ok(Math.abs(foe.x - .80625) < .001);

  await h.api.animateMove(['', 'move', 'p1a: Bulbasaur', 'Flamethrower', 'p2a: Pidgey']);
  const flame = h.emitted.find(entry => entry[0] === 'fire-stream');
  assert.ok(flame);
  assert.ok(Math.abs(flame[1] - player.x) < .001, 'fire stream starts at the player sprite');
  assert.ok(flame[3] > 0, 'fire stream travels toward the opposing sprite using measured distance');

  h.emitted.length = 0;
  await h.api.animateMove(['', 'move', 'p1a: Bulbasaur', 'Fire Blast', 'p2a: Pidgey'], false);
  assert.ok(h.emitted.some(entry => entry[0] === 'fire-stream'));
  assert.equal(h.emitted.some(entry => entry[0] === 'fire-ring'), false, 'a miss has no target impact burst');

  h.emitted.length = 0;
  await h.api.animateMove(['', 'move', 'p1a: Bulbasaur', 'Growl', 'p2a: Pidgey']);
  assert.ok(h.emitted.some(entry => entry[0] === 'sound-wave'));
  h.emitted.length = 0;
  await h.api.animateMove(['', 'move', 'p1a: Bulbasaur', 'Swords Dance', 'p1a: Bulbasaur']);
  assert.equal(h.emitted.filter(entry => entry[0] === 'sword-glint').length, 3);
  h.emitted.length = 0;
  await h.api.animateMove(['', 'move', 'p1a: Bulbasaur', 'Sleep Powder', 'p2a: Pidgey']);
  assert.equal(h.emitted.filter(entry => entry[0] === 'sleep-spore').length, 12);
  h.emitted.length = 0;
  h.api.damageHitFx('foe', 0); h.api.damageHitFx('foe', 1); h.api.damageHitFx('foe', 2);
  assert.equal(h.emitted.filter(entry => entry[0] === 'impact-ring').length, 3);
  assert.equal(h.emitted.filter(entry => entry[0] === 'hit-star').length, 3);
});

test('move choreography consumes all four profile phases and gates impact on logged outcomes', async () => {
  const h = effectHarness();
  await h.api.animateMove(['', 'move', 'p1a: Bulbasaur', 'Flamethrower', 'p2a: Pidgey']);
  const phases = h.emitted.filter(([name]) => name === 'move-phase').map(([, , , , , , , options]) => options.phase);
  assert.ok(phases.includes('prepare') && phases.includes('travel') && phases.includes('impact') && phases.includes('settle'));
  h.emitted.length = 0;
  await h.api.animateMove(['', 'move', 'p1a: Bulbasaur', 'Fire Blast', 'p2a: Pidgey'], false);
  assert.equal(h.emitted.some(([name, , , , , , , options]) => name === 'move-phase' && options.phase === 'impact'), false,
    'misses keep preparation/travel but never emit the impact phase');
  h.emitted.length = 0;
  await h.api.animateMove(['', 'move', 'p1a: Bulbasaur', 'Flamethrower', 'p2a: Pidgey'], true, { critical:true });
  assert.ok(h.emitted.some(([name, , , , , , , options]) => name === 'move-phase' && options.phase === 'impact' && options.critical),
    'a protocol-confirmed critical hit intensifies the impact phase');
  h.emitted.length = 0;
  await h.api.animateMove(['', 'move', 'p1a: Bulbasaur', 'Hypnosis', 'p2a: Pidgey'], false);
  assert.equal(h.emitted.some(([name, , , , , , , options]) => name === 'move-phase' && options.phase === 'impact'), false,
    'an unconfirmed status move does not animate a target effect');
  h.context.state.reducedEffects = true; h.emitted.length = 0;
  await h.api.animateMove(['', 'move', 'p1a: Bulbasaur', 'Flamethrower', 'p2a: Pidgey'], true, { critical:true });
  const reduced = h.emitted.filter(([name]) => name === 'move-phase');
  assert.equal(reduced.length, 1, 'reduced motion uses one bounded still cue');
  assert.equal(reduced[0][7].reduced, true);
  assert.equal(reduced[0][7].critical, true);
  assert.match(app, /FX_NODE_LIMIT = 48, FX_RATE_LIMIT = 96/);
  assert.match(app, /function clearFxEffects\(\)/);
  assert.match(css, /\.fx-move-phase\[data-phase="impact"\]\.critical/);
});

test('effect node, spawn-rate, and cleanup timers stay bounded', () => {
  const nodes = [], timers = new Set(); let cancelled = 0;
  const layer = { appendChild(node) { nodes.push(node); }, querySelectorAll() { return []; } };
  const context = {
    els:{ effectLayer:layer, stage:{ classList:{ remove(){} }, style:{ removeProperty(){} } } },
    state:{ fastForward:false, animationSpeed:1 }, fxLiveNodes:new Set(), fxCleanupTimers:timers, fxSpawnTimes:[],
    FX_NODE_LIMIT:48, FX_RATE_LIMIT:96, Date, safeNum:value=>Number(value)||0,
    document:{ createElement(){ return {style:{setProperty(){}},dataset:{},classList:{add(){}},remove(){this.removed=true;}}; } },
    attachOriginalSprite(){}, scheduleFxCleanup(callback){ const timer=timers.size+1; timers.add(timer); return timer; },
    clearTimeout(){cancelled++;}
  };
  vm.runInNewContext(`${extractFunction('emitFx')}\n${extractFunction('clearFxEffects')}\nglobalThis.api={emitFx,clearFxEffects};`, context);
  for(let index=0;index<120;index++)context.api.emitFx('move-phase',.5,.5,0,0,200,0,{phase:'travel'});
  assert.equal(context.fxSpawnTimes.length,96,'at most 96 particles may be emitted per second');
  assert.equal(context.fxLiveNodes.size,48,'at most 48 effects may remain active');
  context.api.clearFxEffects();
  assert.equal(context.fxLiveNodes.size,0);
  assert.equal(timers.size,0);
  assert.equal(cancelled,96,'cleanup cancels outstanding removal timers');
  assert.ok(nodes.filter(node=>node.removed).length>=48,'all live effect nodes are removed during cleanup');
});

test('real move protocol events reach the named choreography and only confirmed hits get contact impacts', async () => {
  const h = effectHarness();
  const source = fs.readFileSync(path.join(__dirname, '../public/battle-fx-map.js'), 'utf8');
  vm.runInNewContext(source, h.context);
  const context = h.context;
  Object.assign(context, {
    window: { KantoAudio: { event() {} } },
    presentationWaiters: new Set(),
    protocol: line => String(line).split('|'),
    formatEvent: () => '', setMessage() {}, recordEvent() {}, showMoveBanner() {},
    confirmedMoveCue: () => null, emitConfirmedMoveCue() {}, heldItemCue: () => null, markLowHpMoment() {}, playCosmeticMove() {}, clearFxEffects() {},
    isDirectMoveDamage: () => false,
    markLastPokemonMoment() {}, markBattleOutcome() {}, animateCapture: async () => {},
    animateRun: async () => {}, setWeather() {}, applyBoostEvent() {},
    setCondition() {}, statusFx() {}, showVolatile() {}, choiceBandLockMessage: () => null,
    applyHpEvent() {},
    $: () => null,
    state: { reducedEffects: false, animationSpeed: 1, presenting: false, fastForward: false,
      presentationSerial: 0, eventBattleId: 'test-battle', eventLog: [], battleChoiceLocks: {},
      boosts: { player: {}, foe: {} } },
  });
  context.els.counter = { textContent: '' };
  context.animateMove = h.api.animateMove;
  vm.runInNewContext(`${extractFunction('inspectMoveResult')}\nglobalThis.inspectMoveResult=inspectMoveResult;`, context);
  vm.runInNewContext(`${extractFunction('processEvents')}\nglobalThis.processEvents=processEvents;`, context);
  const play = async (name, resolution = '|-damage|p2a: Pidgey|20/100') => {
    h.emitted.length = 0;
    await context.processEvents([`|move|p1a: Bulbasaur|${name}|p2a: Pidgey`, ...(Array.isArray(resolution) ? resolution : [resolution])], { id: 'test-battle' });
    return h.emitted.map(entry => entry[0]);
  };
  assert.ok((await play('Flamethrower')).includes('fire-stream'), 'move event selects the flame choreography');
  assert.ok((await play('Water Gun')).includes('water-jet'), 'move event selects the water trajectory');
  assert.ok((await play('Thunderbolt')).includes('lightning-bolt'), 'move event selects the electric strike');
  assert.ok((await play('Razor Leaf')).includes('razor-leaf'), 'move event selects the leaf volley');
  assert.ok((await play('Vine Whip')).includes('vine-whip'), 'move event selects the vine lash');
  assert.equal((await play('Tackle', '|-miss|p1a: Bulbasaur|p2a: Pidgey')).includes('impact-ring'), false,
    'a protocol-confirmed miss gets a whiff trajectory without impact');
  assert.ok((await play('Tackle')).includes('impact-ring'), 'confirmed contact receives its impact');
  await play('Protect','|-activate|p2a: Pidgey|move: Protect');
  const protectedFx = h.emitted.filter(([name, , , , , , , options]) => name === 'move-phase' && options?.phase === 'impact');
  assert.equal(protectedFx.length, 0, 'a protected action has no impact phase');
  await play('Tackle',['|-crit|p2a: Pidgey','|-damage|p2a: Pidgey|20/100']);
  assert.ok(h.emitted.some(([name, , , , , , , options]) => name === 'move-phase' && options?.phase === 'impact' && options.critical),
    'the engine critical event intensifies the move impact');
  await play('Hypnosis','|-miss|p1a: Bulbasaur|p2a: Pidgey');
  assert.equal(h.emitted.some(([name, , , , , , , options]) => name === 'move-phase' && options?.phase === 'impact'), false,
    'missed status moves do not affect their target');
  await play('Hypnosis','|-status|p2a: Pidgey|slp');
  assert.equal(h.emitted.some(([name, , , , , , , options]) => name === 'move-phase' && options?.phase === 'impact'), true,
    'status effects show impact only after the engine logs the effect');
  context.state.world={队伍:[{uid:'bond-lead',昵称:'妙蛙种子'}]};
  const moments=[];context.showBattleMoment=(...args)=>moments.push(args);
  h.emitted.length=0;
  await context.processEvents(['|move|p2a: Pidgey|Tackle|p1a: Bulbasaur','|-miss|p2a: Pidgey|p1a: Bulbasaur'],{id:'test-battle',seq:3,bondEffect:{type:'dodge',uid:'bond-lead',trust:60}});
  assert.ok(h.emitted.some(entry=>entry[0]==='bond-dodge'));assert.equal(moments.length,1);
  h.emitted.length=0;moments.length=0;
  await context.processEvents(['|move|p2a: Pidgey|Tackle|p1a: Bulbasaur','|-miss|p2a: Pidgey|p1a: Bulbasaur'],{id:'test-battle',seq:4,bondEffect:null});
  assert.equal(h.emitted.some(entry=>entry[0]==='bond-dodge'),false,'ordinary missed attacks do not pretend to be bond activations');assert.equal(moments.length,0);
});

test('reduced effects keep a brief hit cue while suppressing the move particle sequence', async () => {
  const h = effectHarness();
  h.context.state.reducedEffects = true;
  await h.api.animateMove(['', 'move', 'p1a: Bulbasaur', 'Flamethrower', 'p2a: Pidgey']);
  assert.deepEqual(h.emitted.map(entry => entry[0]), ['move-phase']);
});

test('Ice, Psychic, Ghost, Grass, and Ground moves use distinct event-driven effects', async () => {
  const h = effectHarness();
  const run = async move => { h.emitted.length = 0; await h.api.animateMove(['', 'move', 'p1a: Bulbasaur', move, 'p2a: Pidgey']); return h.emitted.map(entry => entry[0]); };
  assert.ok((await run('Ice Beam')).includes('frost-beam'));
  assert.ok((await run('Aurora Beam')).includes('ice-crystal'));
  assert.ok((await run('Psychic')).includes('mind-ripple'));
  assert.ok((await run('Confusion')).includes('mind-orbit'));
  assert.ok((await run('Shadow Ball')).includes('shadow-orb'));
  assert.ok((await run('Lick')).includes('ghost-claw'));
  assert.ok((await run('Vine Whip')).includes('vine-whip'));
  assert.ok((await run('Leech Seed')).includes('seed-vine'));
  assert.ok((await run('Earthquake')).includes('quake-crack'));
  assert.ok((await run('Dig')).includes('ground-bore'));
  assert.ok((await run('Fire Spin')).includes('fire-vortex'));
  assert.ok((await run('Hydro Pump')).includes('water-charge'));
  assert.ok((await run('Fire Blast')).includes('fire-sigil'));
  h.emitted.length = 0;
  const missed = await h.api.animateMove(['', 'move', 'p1a: Bulbasaur', 'Dig', 'p2a: Pidgey'], false);
  assert.equal(h.emitted.some(entry => entry[0] === 'ground-burst'), false, 'a miss must not create impact debris');
});

test('special move windups stay on the actor until the matching outcome event confirms an effect', async () => {
  const h = effectHarness();
  const preparatory = {
    Hypnosis: 'hypnosis-windup', 'Dream Eater': 'dream-eater-windup', 'Double Team': 'double-team-windup',
    Substitute: 'substitute-windup', Teleport: 'teleport-windup', Transform: 'transform-windup',
    Metronome: 'metronome-orbit', 'Leech Seed': 'seed-vine',
  };
  for (const [move, cue] of Object.entries(preparatory)) {
    h.emitted.length = 0;
    await h.api.animateMove(['', 'move', 'p1a: Mew', move, 'p2a: Gyarados'], false);
    assert.ok(h.emitted.some(entry => entry[0] === cue), `${move} keeps its actor windup on a miss/protection`);
    assert.ok(h.emitted.every(entry => entry[1] < .5), `${move} does not place an effect at the foe`);
    assert.ok(!h.emitted.some(entry => /(?:hit|confirm|afterimage|drain)$/.test(entry[0])), `${move} has no unconfirmed target/state effect`);
  }
  h.emitted.length = 0;
  await h.api.animateMove(['', 'move', 'p1a: Mew', 'Hyper Beam', 'p2a: Gyarados'], false);
  assert.ok(h.emitted.some(entry => entry[0] === 'hyperbeam-charge'));
  assert.equal(h.emitted.some(entry => entry[0] === 'hyperbeam-impact'), false);
  h.context.state.reducedEffects = true; h.emitted.length = 0;
  await h.api.animateMove(['', 'move', 'p1a: Mew', 'Hypnosis', 'p2a: Gyarados'], false);
  assert.deepEqual(h.emitted.map(entry => entry[0]), ['move-phase'], 'reduced effects retain only a brief actor cue');
});

test('signature attack families have distinct trajectories and keep confirmed impact gated', async () => {
  const h = effectHarness();
  const signatures = {
    Surf: 'surf-wave', 'Water Gun': 'water-jet', 'Hydro Pump': 'water-charge',
    'Ice Beam': 'frost-beam', Blizzard: 'ice-blizzard', 'Icy Wind': 'ice-flurry',
    'Aurora Beam': 'aurora-beam', Thunderbolt: 'lightning-bolt', Thunder: 'storm-bolt',
    'Thunder Shock': 'electric-arc', 'Zap Cannon': 'electric-charge', 'Razor Leaf': 'razor-leaf',
    'Magical Leaf': 'homing-leaf', 'Leaf Blade': 'leaf-blade', Psychic: 'mind-crush',
    'Extrasensory': 'sense-flare', 'Shadow Ball': 'shadow-orb', Earthquake: 'quake-crack',
    'Rock Slide': 'falling-rock', 'Rock Throw': 'stone-projectile', 'Rock Tomb': 'stone-projectile',
    'Mud Shot': 'mud-sling', 'Mud-Slap': 'mud-sling', 'Solar Beam': 'solar-charge', 'Hyper Beam': 'hyperbeam-charge',
  };
  for (const [move, expected] of Object.entries(signatures)) {
    h.emitted.length = 0;
    await h.api.animateMove(['', 'move', 'p1a: Mew', move, 'p2a: Gyarados'], true);
    assert.ok(h.emitted.some(entry => entry[0] === expected), `${move} uses ${expected}`);
  }
  for (const move of ['Blizzard','Aurora Beam','Leaf Blade','Rock Throw','Mud Shot','Zap Cannon','Solar Beam','Hyper Beam']) {
    h.emitted.length = 0;
    await h.api.animateMove(['', 'move', 'p1a: Mew', move, 'p2a: Gyarados'], false);
    assert.ok(!h.emitted.some(entry => /(?:ice-impact|leaf-impact|rock-impact|mud-splatter|electric-ring|solar-impact|hyperbeam-impact)$/.test(entry[0])), `${move} has no unconfirmed impact`);
  }
  h.emitted.length = 0;
  await h.api.animateMove(['', 'move', 'p1a: Mew', 'Thunder', 'p2a: Gyarados'], true);
  assert.equal(h.emitted.filter(entry => entry[0] === 'storm-bolt').length, 1, 'Thunder presents one strike rather than inventing a multihit');
  assert.ok(h.emitted.some(entry => entry[0] === 'storm-flash'), 'the storm cue is ambient and distinct from Thunderbolt');
  h.emitted.length = 0;
  await h.api.animateMove(['', 'move', 'p1a: Mew', 'Growl', 'p2a: Gyarados'], false);
  assert.ok(!h.emitted.some(entry => entry[0] === 'status-pulse'), 'a protected/missed status move does not pulse at the target');
});

test('special move hit/state cues only resolve from the matching Gen III protocol event', () => {
  const context = {
    protocol: line => line.split('|'),
    actorSide: token => /^p1/i.test(token || '') ? 'player' : /^p2/i.test(token || '') ? 'foe' : null,
  };
  vm.runInNewContext(`${extractFunction('isDirectMoveDamage')}\n${extractFunction('confirmedMoveCue')}\nglobalThis.cue=confirmedMoveCue;`, context);
  const cueNames = { hypnosis:'hypnosis-rings', dreameater:'dream-drain', doubleteam:'afterimage', substitute:'substitute-pop', teleport:'phase-blink', transform:'morph-shift', hyperbeam:'hyperbeam-charge', metronome:'metronome-orbit' };
  const cue = (line, id, attacker = 'player') => context.cue(line, { id, cue:cueNames[id], attacker });
  assert.equal(cue('|-miss|p1a: Mew|p2a: Gyarados', 'hypnosis'), null);
  assert.equal(cue('|-immune|p2a: Gyarados', 'hypnosis'), null);
  assert.equal(cue('|-activate|p2a: Gyarados|move: Protect', 'hypnosis'), null);
  assert.deepEqual({ ...cue('|-status|p2a: Gyarados|slp|[from] move: Hypnosis', 'hypnosis') }, { cue:'hypnosis-rings', side:'foe' });
  assert.deepEqual({ ...cue('|-damage|p2a: Gyarados|45/100', 'dreameater') }, { cue:'dream-drain', side:'foe' });
  assert.equal(cue('|-damage|p2a: Gyarados|45/100|[from] weather', 'dreameater'), null);
  assert.deepEqual({ ...cue('|-heal|p1a: Mew|90/100|[from] drain|[of] p2a: Gyarados', 'dreameater') }, { cue:'dream-return', side:'player' });
  assert.deepEqual({ ...cue('|-boost|p1a: Mew|evasion|1', 'doubleteam') }, { cue:'afterimage', side:'player' });
  assert.deepEqual({ ...cue('|-start|p1a: Mew|Substitute', 'substitute') }, { cue:'substitute-pop', side:'player' });
  assert.equal(cue('|run|failed|0', 'teleport'), null);
  assert.deepEqual({ ...cue('|run|success|0', 'teleport') }, { cue:'phase-blink', side:'player' });
  assert.deepEqual({ ...cue('|-transform|p1a: Mew|p2a: Gyarados', 'transform') }, { cue:'morph-shift', side:'player' });
  assert.deepEqual({ ...cue('|-mustrecharge|p1a: Mew', 'hyperbeam') }, { cue:'hyperbeam-recharge', side:'player' });
  assert.deepEqual({ ...cue('|move|p1a: Mew|Sacred Fire|p2a: Gyarados|[from] Metronome', 'metronome') }, { cue:'metronome-release', side:'player' });
  for (const kind of ['hypnosis-rings','dream-drain','dream-return','afterimage','substitute-pop','phase-blink','morph-shift','hyperbeam-charge','hyperbeam-recharge','metronome-release']) {
    assert.match(css, new RegExp(`\\.fx-${kind.replace(/-/g, '\\-')}\\s*\\{`), `${kind} has a CSS treatment`);
  }
  assert.match(app, /emitConfirmedMoveCue\(confirmedMoveCue\(line, currentMove\)\)/, 'the per-event cue dispatcher is connected to processEvents');
});

test('battle cues are bound to real events, brief at normal speed, and reduced motion stays nonblocking', () => {
  assert.match(app, /if \(kind === 'move'\) \{\s*if\(side==='player'\)playCosmeticMove\(p\[2\],nextSnapshot\);\s*showMoveBanner\(p\);/);
  assert.match(app, /if \(kind === '-crit' && side\) pendingImpact\[side\]/);
  assert.match(app, /pendingImpact\[side\]\?\.critical/);
  assert.match(app, /inspectMoveResult\(lines, i, side, targetSide, resolvedMove\?\.category\)/);
  assert.match(app, /isDirectMoveDamage\(p, currentMove\)/);
  assert.match(app, /renderBattle\(snapshot\); showBattleEntrance\(snapshot\);/);
  assert.match(css, /\.battle-move-banner\s*\{[^}]*pointer-events:none/);
  assert.match(css, /\.fx-battle-intro\s*\{[^}]*pointer-events:none/);
  assert.match(css, /body\.reduce-effects \.fx-battle-intro \{ display:none; \}/);
  assert.match(css, /@keyframes camera-critical/);
});

test('move event inspection distinguishes charge, miss, immunity, failure, and direct damage', () => {
  const context = {
    protocol: line => line.split('|'),
    actorSide: token => /^p1/i.test(token || '') ? 'player' : /^p2/i.test(token || '') ? 'foe' : null,
  };
  vm.runInNewContext(`${extractFunction('inspectMoveResult')}\n${extractFunction('isDirectMoveDamage')}\nglobalThis.api={inspectMoveResult,isDirectMoveDamage};`, context);
  const result = suffix => context.api.inspectMoveResult([
    '|move|p1a: Pikachu|Thunderbolt|p2a: Onix', ...suffix,
  ], 0, 'player', 'foe');
  assert.deepEqual({ ...result(['|-prepare|p1a: Pikachu|SolarBeam']) }, { charging: true, outcome: 'hit', critical: false, confirmedEffect: false });
  assert.equal(result(['|-miss|p1a: Pikachu|p2a: Onix']).outcome, 'miss');
  assert.equal(result(['|-crit|p1a: Pikachu','|-damage|p2a: Onix|12/100']).critical, true);
  assert.equal(result(['|-immune|p2a: Onix']).outcome, 'immune');
  assert.equal(result(['|-activate|p2a: Onix|move: Protect']).outcome, 'protected');
  assert.equal(result(['|-fail|p1a: Pikachu']).outcome, 'fail');
  assert.equal(result(['|move|p2a: Onix|Tackle|p1a: Pikachu', '|-miss|p2a: Onix|p1a: Pikachu']).outcome, 'hit', 'later move results do not leak backward');
  assert.equal(context.api.inspectMoveResult(['|move|p1a: Gengar|Hypnosis|p2a: Onix'], 0, 'player', 'foe', 'Status').outcome, 'unconfirmed');
  assert.equal(context.api.inspectMoveResult(['|move|p1a: Gengar|Hypnosis|p2a: Onix','|-status|p2a: Onix|slp'], 0, 'player', 'foe', 'Status').outcome, 'hit');
  assert.equal(context.api.isDirectMoveDamage(['', '-damage', 'p2a: Onix', '12/100'], { attacker: 'player' }), true);
  assert.equal(context.api.isDirectMoveDamage(['', '-damage', 'p2a: Onix', '12/100', '[from] weather'], { attacker: 'player' }), false);
  assert.equal(context.api.isDirectMoveDamage(['', '-damage', 'p1a: Pikachu', '88/100', '[from] recoil'], { attacker: 'player' }), false);
  assert.equal(context.api.isDirectMoveDamage(['', '-damage', 'p2a: Onix', '12/100'], null), false);
  assert.match(app, /连续命中 \$\{Math\.max\(1, safeNum\(p\[3\], 1\)\)\} 次/);
});

test('weather and temporary battle states stay readable without replaying effects on every render', () => {
  const classes = new Set(), timers = [];
  const context = {
    tacticalStates: { player: new Set(['charged', 'substitute']), foe: new Set() },
    state: { animationSpeed: 2, reducedEffects: false, boosts: { player: { atk: 1 }, foe: {} } },
    boostNames: { atk: '攻' },
    weatherNames: { rain: '下雨', sunnyday: '晴天', hail: '冰雹', none: '无' },
    safeNum: value => Number(value) || 0,
    els: {
      playerBoosts: { textContent: '', classList: { toggle() {} } },
      foeBoosts: { textContent: '', classList: { toggle() {} } },
      weather: { textContent: '' },
      stage: { offsetWidth: 1, classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)) } },
    },
    currentWeatherKey: null,
    setTimeout: (fn, ms) => { timers.push(ms); return timers.length; },
  };
  const boostStart = app.indexOf('  function renderBoosts('), weatherStart = app.indexOf('  function setWeather(');
  const actionsStart = app.indexOf('  function renderActions(', weatherStart);
  vm.runInNewContext(`${app.slice(boostStart, weatherStart)}\nglobalThis.renderBoosts=renderBoosts;`, context);
  vm.runInNewContext(`${app.slice(weatherStart, actionsStart)}\nglobalThis.setWeather=setWeather;`, context);
  context.api = { renderBoosts: context.renderBoosts, setWeather: context.setWeather };
  context.api.renderBoosts('player', context.state.boosts.player);
  assert.match(context.els.playerBoosts.textContent, /能力阶数 攻↑1　战术状态 蓄力中 · 替身/);
  context.api.setWeather('rain');
  assert.equal(classes.has('weather-change'), false, 'initial field display is quiet');
  context.api.setWeather('sunnyday');
  assert.equal(classes.has('weather-change'), true, 'a real field change gets one arrival cue');
  assert.equal(timers.at(-1), 310, 'weather cue respects the selected 2x speed');
  context.api.setWeather('sunnyday');
  assert.equal(timers.length, 1, 'a repeated snapshot does not replay the cue');
  context.state.reducedEffects = true;
  context.api.setWeather('hail');
  assert.equal(timers.length, 1, 'reduced effects suppress the field transition');
});

test('move banners scale to speed and reduced effects; entrance curtain is omitted in reduced mode', () => {
  const timers = [], added = [];
  const layer = { appendChild(node) { added.push(node); } };
  const stage = { classList: { add: (...classes) => added.push(classes.join(' ')), remove() {} }, style: { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } }, offsetWidth: 1 };
  const context = {
    els: { effectLayer: layer, stage }, state: { reducedEffects: false, animationSpeed: 2 },
    document: { createElement: () => ({ style: { setProperty(name, value) { this[name] = value; } }, className: '', dataset: {}, children: [], setAttribute() {}, append(...nodes) { this.children.push(...nodes); } }) },
    canonicalMove: () => ({ name: '冰冻光束', type: 'Ice' }), typeName: type => type === 'Ice' ? '冰' : type,
    safeNum: value => Number(value) || 0,
    setTimeout: (fn, ms) => { timers.push(ms); return timers.length; },
    scheduleFxCleanup: (fn, ms) => { timers.push(ms); return timers.length; },
  };
  vm.runInNewContext(`${extractFunction('showMoveBanner')}\n${extractFunction('showBattleEntrance')}\n${extractFunction('impactCamera')}\nglobalThis.api={showMoveBanner,showBattleEntrance,impactCamera};`, context);
  context.api.showMoveBanner(['', 'move', 'p1a: Bulbasaur', 'Ice Beam']);
  assert.match(added[0].className, /battle-move-banner type-ice/);
  assert.equal(added[0].style['--banner-duration'], '310ms');
  context.api.impactCamera('critical', 'foe');
  assert.equal(added.at(-1), 'impact-critical');
  assert.equal(context.els.stage.style['--impact-origin'], '72% 34%');
  assert.equal(timers.at(-1), 215);
  context.state.reducedEffects = true;
  const count = added.length;
  context.api.showBattleEntrance(); context.api.impactCamera('super', 'player');
  assert.equal(added.length, count, 'reduced effects skip the curtain and camera movement');
  context.api.showMoveBanner(['', 'move', 'p1a: Bulbasaur', 'Ice Beam']);
  assert.equal(added.at(-1).style['--banner-duration'], '150ms', 'the move name remains briefly visible at reduced motion');
});

test('switching recalls the old sprite, throws a ball, and reuses the fixed side position', async () => {
  const h = effectHarness();
  await h.api.animateSwitch('player', { id: 4, name: '小火龙', level: 5 }, 'switch');
  assert.equal(h.emitted.filter(entry => entry[0] === 'switch-capsule').length, 2);
  assert.equal(h.changedSprites.length, 1);
  assert.equal(h.changedSprites[0].back, true);
  assert.equal(h.player.dataset.speciesId, '4');
  assert.ok(Math.abs(h.emitted[0][1] - .16875) < .001, 'recall capsule starts at the old player sprite');
});

test('native stage battle layout fills its parent and avoids viewport-fixed positioning', () => {
  assert.match(app, /params\.get\('native'\) === '1'/);
  assert.match(css, /body\.native-mode\.battle-focus \.main-column\{position:relative/);
  assert.match(css, /body\.native-mode \.app-shell\{[^}]*height:100%/);
  assert.doesNotMatch(app, /requestFullscreen\s*\(/);
  assert.match(html, /href="\.\/battle-theme\.css"/);
  assert.match(css, /\.arena-backdrop\s*\{\s*display:\s*none\s*!important/);
  assert.match(css, /body\.native-mode\.battle-focus \.main-column\s*\{\s*position:\s*relative/);
  assert.doesNotMatch(css, /body\.native-mode\.battle-focus \.main-column\s*\{[^}]*position:\s*fixed/);
});

test('pinned FireRed effect PNGs are valid indexed sprites and attached to real move hooks', () => {
  const effects = path.join(__dirname, '../public/assets/effects');
  const sprites = {
    'fire_plume.png': [32, 160], 'electricity.png': [32, 128], 'claw_slash.png': [32, 160],
    'impact.png': [32, 32], 'pokeball.png': [16, 16], 'water_impact.png': [32, 32],
  };
  for (const [file, [width, height]] of Object.entries(sprites)) {
    const bytes = fs.readFileSync(path.join(effects, file));
    assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a', `${file} has a PNG signature`);
    assert.equal(bytes.readUInt32BE(16), width, `${file} width`);
    assert.equal(bytes.readUInt32BE(20), height, `${file} height`);
    assert.equal(bytes[25], 3, `${file} retains its source indexed palette`);
    let offset = 8, transparency = null;
    while (offset < bytes.length) {
      const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
      if (type === 'tRNS') transparency = bytes.subarray(offset + 8, offset + 8 + length);
      offset += 12 + length;
    }
    assert.equal(transparency?.[0], 0, `${file} marks the game's first palette entry transparent for browsers`);
  }
  for (const hook of ['fire-stream', 'lightning-bolt', 'claw-mark', 'impact-ring', 'switch-capsule', 'water-impact']) {
    assert.match(app, new RegExp(`['"]${hook}['"]\\s*:\\s*\\{`), `${hook} maps to a source sprite`);
    assert.match(css, new RegExp(`\\.fx-original-${hook}\\{`), `${hook} is animated with its original sprite`);
  }
});
