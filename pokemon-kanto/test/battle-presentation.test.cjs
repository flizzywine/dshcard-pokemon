'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cinematic = require('../battle-cinematics.cjs');
const bossProfiles = require('../boss-profiles.cjs');

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/battle-theme.css'), 'utf8');

function functionSource(name) {
  let start = app.indexOf(`async function ${name}(`);
  if (start < 0) start = app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `app.js defines ${name}`);
  const open = app.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = open; i < app.length; i++) {
    const ch = app[i];
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return app.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

class Classes {
  constructor() { this.values = new Set(); this.history = []; }
  add(...names) { names.forEach(name => { this.values.add(name); this.history.push(name); }); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
}
class Style {
  setProperty(name, value) { this[name] = value; }
  removeProperty(name) { delete this[name]; }
}
class Node {
  constructor() { this.classList = new Classes(); this.style = new Style(); this.hidden = false; this.children = []; this.isConnected = true; }
  appendChild(node) { this.children.push(node); return node; }
  remove() { this.isConnected = false; }
  get offsetWidth() { return 1; }
}

function captureHarness() {
  const target = new Node(), layer = new Node(), nodes = [], emitted = [];
  const context = {
    els: { foeSprite: target, effectLayer: layer },
    state: { reducedEffects: false, animationSpeed: 1 },
    document: { createElement() { const node = new Node(); nodes.push(node); return node; } },
    safeNum: value => Number.isFinite(Number(value)) ? Number(value) : 0,
    spritePoint: () => ({ x: .75, y: .43 }), arenaVector: () => ({ dx: 500, dy: -120 }),
    wait: async () => {}, emitFx: (...args) => emitted.push(args), setTimeout: fn => { fn(); return 1; },
  };
  vm.runInNewContext(`${functionSource('captureOutcome')}\n${functionSource('animateCapture')}\nglobalThis.run=animateCapture; globalThis.outcome=captureOutcome;`, context);
  return { context, target, nodes, emitted };
}

test('Gen III capture succeeds only after three protocol shakes and a caught, ended snapshot', () => {
  const { context } = captureHarness();
  assert.deepEqual(JSON.parse(JSON.stringify(context.outcome(['', 'capture', 'Pikachu', '2'], { ended: false }))), { shakes: 2, success: false });
  assert.deepEqual(JSON.parse(JSON.stringify(context.outcome(['', 'capture', 'Pikachu', '3'], { ended: false, caught: { id: 25 } }))), { shakes: 3, success: false });
  assert.deepEqual(JSON.parse(JSON.stringify(context.outcome(['', 'capture', 'Pikachu', '3'], { ended: true, caught: { id: 25 } }))), { shakes: 3, success: true });
  assert.deepEqual(JSON.parse(JSON.stringify(context.outcome(['', 'capture', 'Pikachu', '4'], { ended: true, caught: { id: 25 } }))), { shakes: 3, success: false });
});

test('failed captures release the target; only confirmed captures hide it and emit success stars', async () => {
  const failed = captureHarness();
  await failed.context.run(['', 'capture', 'Pikachu', '2'], { ended: false, caught: null });
  assert.equal(failed.target.hidden, false);
  assert.ok(failed.target.classList.history.includes('capture-release'));
  assert.equal(failed.emitted.filter(([name]) => name === 'capture-release').length, 1);
  assert.equal(failed.emitted.filter(([name]) => name === 'capture-star').length, 0);

  const caught = captureHarness();
  await caught.context.run(['', 'capture', 'Pikachu', '3'], { ended: true, caught: { id: 25 } });
  assert.equal(caught.target.hidden, true);
  assert.equal(caught.emitted.filter(([name]) => name === 'capture-star').length, 8);
  assert.equal(caught.emitted.filter(([name]) => name === 'capture-release').length, 0);
});

test('reduced effects keep a visible capture ball cue without toss motion or particles', async () => {
  const view = captureHarness();
  view.context.state.reducedEffects = true;
  await view.context.run(['', 'capture', 'Pikachu', '1'], { ended: false, caught: null });
  assert.equal(view.nodes[0].style.left, '75%');
  assert.equal(view.nodes[0].style.top, '43%');
  assert.equal(view.emitted.filter(([name]) => name === 'capture-star').length, 0);
  assert.match(css, /body\.reduce-effects \.fx-capture-ball \{ display:block!important; opacity:1; animation:none!important; \}/);
});

test('terrain failures remain visible and the actual GBA canvas stays in the arena behind stage effects', () => {
  assert.match(app, /if \(kind === 'capture'\) await animateCapture\(p, nextSnapshot\);/);
  assert.match(app, /initializeBattleTerrain\(\)\.catch\(error => showPersistentError\(`战斗背景加载失败/);
  assert.match(app, /catch \(error\) \{ els\.stage\.classList\.remove\('terrain-ready'\); showPersistentError\(`战斗背景无法显示/);
  assert.match(css, /\.battle-terrain \{ position:absolute; inset:0; z-index:0; display:block/);
  assert.match(css, /\.arena\.terrain-ready \{ background:#b5cfaa; \}/);
});

test('escape animation consumes only explicit success or failure protocol events', async () => {
  const context = {
    state: { reducedEffects: false }, els: { stage: { clientWidth: 400 } },
    spritePoint: () => ({ x: .3, y: .7 }), emitFx: (...args) => (context.emitted ||= []).push(args),
    wait: async () => {},
  };
  vm.runInNewContext(`${functionSource('animateRun')}\nglobalThis.run=animateRun;`, context);
  await context.run(['', 'run', 'success', '1'], { ended: true, escaped: true });
  assert.equal(context.emitted.filter(([name]) => name === 'run-streak').length, 3);
  context.emitted.length = 0;
  await context.run(['', 'run', 'success', '1'], { ended: false, escaped: false });
  assert.equal(context.emitted.length, 0, 'a success animation requires confirmation from the snapshot');
  await context.run(['', 'run', 'failed', '1'], { ended: false, escaped: false });
  assert.equal(context.emitted.filter(([name]) => name === 'run-stop').length, 1);
  context.state.reducedEffects = true; context.emitted.length = 0;
  await context.run(['', 'run', 'success', '1'], { ended: true, escaped: true });
  assert.deepEqual(context.emitted.map(([name]) => name), ['run-mark'], 'reduced motion keeps a still, brief cue');
  assert.match(app, /if \(kind === 'run'\) await animateRun\(p, nextSnapshot\);/);
  assert.match(css, /\.fx-run-streak[^}]*pointer-events:none|\.effect-layer\s*\{[^}]*pointer-events:none/s);
});

test('Rocket boss entrance scenes follow the exact boss profile identity', () => {
  const rocketBosses = bossProfiles.definitions().filter(boss => boss.role.startsWith('rocket-'));
  const scenes = rocketBosses.map(boss => cinematic.buildBattleCinematic({
    encounter:{ 类型:'trainer', specialId:`rocket-story-${boss.id}`, bossProfileId:boss.id, theme:'rocket', title:`火箭队剧情 · ${boss.name}`, 训练家:boss.name },
    npcId:'trainer', npcName:boss.name, trainers:[]
  }));
  assert.equal(scenes.length, 5);
  assert.equal(new Set(scenes.map(scene => scene.key)).size, scenes.length, 'each Rocket profile has its own entrance motif');
  assert.equal(new Set(scenes.map(scene => scene.accent)).size, scenes.length, 'each Rocket profile has a distinct accent');
  assert.equal(new Set(scenes.map(scene => scene.duration)).size, scenes.length, 'each Rocket profile has its own entrance duration');
  for (let index = 0; index < rocketBosses.length; index++) {
    assert.match(scenes[index].title, new RegExp(rocketBosses[index].name));
    assert.equal(scenes[index].opponent, rocketBosses[index].name);
    assert.equal(scenes[index].kind, 'rocket');
  }
  const ordinary = cinematic.buildBattleCinematic({ encounter:{ theme:'rocket', specialId:'rocket-generic' }, npcId:'rocket_grunt_m', npcName:'火箭队员', trainers:[] });
  assert.equal(ordinary.key, 'rocket');
  assert.equal(ordinary.important, true);
});
