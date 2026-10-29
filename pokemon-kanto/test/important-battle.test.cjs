'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildBattleCinematic } = require('../battle-cinematics.cjs');

const source = fs.readFileSync(path.join(__dirname, '../public/important-battle.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/important-battle.css'), 'utf8');

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) { const on = force === undefined ? !this.values.has(name) : Boolean(force); if (on) this.values.add(name); else this.values.delete(name); return on; }
}
class FakeStyle { setProperty(key, value) { this[key] = value; } }
class FakeNode {
  constructor(tag, document) { this.tagName = tag; this.ownerDocument = document; this.classList = new FakeClassList(); this.style = new FakeStyle(); this.dataset = {}; this.children = []; this.listeners = new Map(); this.attributes = {}; this.isConnected = true; this.textContent = ''; this.hidden = false; }
  set className(value) { this._className = value; for (const name of String(value).split(/\s+/).filter(Boolean)) this.classList.add(name); }
  get className() { return this._className || ''; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  appendChild(node) { this.children.push(node); node.parentNode = this; return node; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  dispatch(name) { this.listeners.get(name)?.({ target: this }); }
  remove() { this.isConnected = false; this.parentNode?.children.splice(this.parentNode.children.indexOf(this), 1); }
  get offsetWidth() { return 1; }
}
function harness() {
  const timers = new Map(), windowListeners = new Map(); let timerId = 0;
  const view = { addEventListener(name, fn) { windowListeners.set(name, fn); }, removeEventListener(name) { windowListeners.delete(name); }, matchMedia: () => ({ matches: false }) };
  const document = { defaultView: view, createElement(tag) { return new FakeNode(tag, document); } };
  const arena = new FakeNode('div', document);
  const context = {
    document, window: view,
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  vm.runInNewContext(source, context, { filename: 'important-battle.js' });
  function count(node) { return 1 + (node.children || []).reduce((sum, child) => sum + count(child), 0); }
  return { api: context.KantoImportantBattle, arena, view, windowListeners, timers, count };
}
function mon(uid, id, hp = 100, active = false) { return { uid, id, name: `宝可梦${id}`, hp, maxhp: 100, active, fainted: hp <= 0 }; }
function snapshot({ ended = false, winner = '', p1Active = ['player-1'], p2Active = ['foe-1'], p1hp = 100, p2hp = 100 } = {}) {
  return { ended, winner, sides: [
    { activeUIDs: p1Active, team: [mon('player-1', 25, p1hp, p1Active.includes('player-1')), mon('player-2', 6, 100, p1Active.includes('player-2'))] },
    { activeUIDs: p2Active, team: [mon('foe-1', 6, 100, p2Active.includes('foe-1')), mon('foe-2', 150, p2hp, p2Active.includes('foe-2'))] },
  ] };
}

test('important battle descriptors keep compatible fields and add scene, beats, and last roster ace', () => {
  const gym = buildBattleCinematic({ encounter:{ 类型:'gym', 队伍:[{图鉴编号:74},{图鉴编号:95}] }, npcId:'brock', npcName:'小刚' });
  assert.equal(gym.important, true); assert.equal(gym.kind, 'gym'); assert.equal(gym.importantKind, 'gym');
  assert.equal(gym.scene, 'gym-rock'); assert.equal(gym.aceSpeciesId, 95); assert.equal(gym.opponentSpeciesId, 74);
  assert.deepEqual(gym.beats, ['entrance', 'ace-reveal', 'pressure-turn', 'outcome']); assert.ok(gym.duration <= 1500);
  const rival = buildBattleCinematic({ encounter:{ specialId:'rival-route22', theme:'rival', title:'小茂的再战', 队伍:[{id:16},{id:6}] }, npcId:'rival_early', npcName:'小茂' });
  assert.equal(rival.importantKind, 'rival'); assert.equal(rival.scene, 'rival-diagonal'); assert.equal(rival.aceSpeciesId, 6);
  const rocket = buildBattleCinematic({ encounter:{ specialId:'rocket-story-ledger', bossProfileId:'apollo', theme:'rocket', title:'火箭队剧情', 队伍:[{id:109},{id:94}] }, npcName:'阿波罗' });
  assert.equal(rocket.importantKind, 'rocket'); assert.equal(rocket.scene, 'rocket-alert'); assert.match(rocket.title, /阿波罗/);
  const quest = buildBattleCinematic({ encounter:{ 类型:'trainer', questId:'route-guard', title:'守护观察委托', 队伍:[{id:16}] }, npcName:'调查员' });
  assert.equal(quest.importantKind, 'quest'); assert.equal(quest.scene, 'quest-guardian');
  const normal = buildBattleCinematic({ encounter:{ 类型:'trainer' } });
  assert.equal(normal.important, false); assert.equal(normal.importantKind, ''); assert.deepEqual(normal.beats, []);
});

test('enter uses the exact opponent portrait, caps DOM nodes, and ignores ordinary battles', () => {
  const { api, arena, count } = harness();
  assert.equal(api.enter(arena, { battle:{ important:false } }), null);
  const descriptor = buildBattleCinematic({ encounter:{ specialId:'rival-route22', theme:'rival', 队伍:[{id:16},{id:6}] }, npcId:'rival_early', npcName:'小茂', trainers:[{id:'rival_early', name:'小茂', art:'assets/trainers/project-original/gary-v3.png'}] });
  const entered = api.enter(arena, { battle:descriptor, scene:{npcId:'rival_early'}, trainers:[{id:'rival_early', name:'小茂', art:'assets/trainers/project-original/gary-v3.png'}] }, {
    assetHref: href => `/plugin/${href}`, playerSide:{art:'assets/trainers/official/red.png'}, snapshot:snapshot(), speed:.5,
  });
  assert.ok(entered); assert.ok(count(entered.node) <= 12); assert.equal(entered.node.dataset.scene, 'rival-diagonal');
  const imgs = entered.node.children[0].children.filter(node => node.tagName === 'img');
  assert.equal(imgs[0].src, '/plugin/assets/trainers/project-original/gary-v3.png');
  assert.equal(imgs[1].src, '/plugin/assets/trainers/official/red.png');
  assert.equal(entered.node.style['--important-duration'], '1500ms', 'slow speed stays within the 1.5 second entrance cap');
  api.stopAll(arena); assert.equal(arena.children.length, 0);
});

test('snapshot update gates ace reveal, pressure, and results on actual changed battle state', () => {
  const { api, arena } = harness();
  const descriptor = { important:true, importantKind:'rocket', scene:'rocket-alert', key:'rocket-apollo', title:'干部 · 阿波罗', opponent:'阿波罗', accent:'#9d5260', duration:1200, aceSpeciesId:150 };
  const entered = api.enter(arena, { battle:descriptor }, { snapshot:snapshot() });
  assert.equal(api.update(arena, snapshot()), false, 'unchanged snapshots do not create a cue');
  assert.equal(api.update(arena, snapshot({ p1hp:20 })), 'pressure-turn');
  assert.equal(entered.node.dataset.beat, 'pressure-turn'); assert.equal(entered.node.children[1].children[2].textContent, '当前体力 20 / 100。');
  assert.equal(api.update(arena, snapshot({ p1hp:20, p2Active:['foe-2'] })), 'ace-reveal');
  assert.equal(entered.node.dataset.beat, 'ace-reveal'); assert.equal(entered.node.children[1].children[1].textContent, '宝可梦150');
  assert.equal(api.update(arena, snapshot({ p1hp:20, p2Active:['foe-2'], winner:'p1' })), false, 'a claimed winner without ended state cannot produce an outcome');
  assert.equal(api.update(arena, snapshot({ p1hp:20, p2Active:['foe-2'], ended:true, winner:'p1' })), 'victory');
  assert.equal(entered.node.dataset.beat, 'victory'); assert.equal(entered.node.children[1].children[1].textContent, '本场胜利');
  assert.equal(api.update(arena, snapshot({ p1hp:20, p2Active:['foe-2'], ended:true, winner:'p1' })), false, 'repeated snapshots do not replay the result');
  api.stopAll();
});

test('a terminal snapshot wins over low-HP pressure so the real result is never hidden', () => {
  const { api, arena } = harness();
  const descriptor = { important:true, importantKind:'gym', scene:'gym-rock', title:'尼比道馆', opponent:'小刚' };
  const initial = snapshot();
  const entered = api.enter(arena, { battle:descriptor }, { snapshot:initial });
  assert.equal(api.update(arena, snapshot({ p1hp:20, ended:true, winner:'p2' })), 'defeat');
  assert.equal(entered.node.dataset.beat, 'defeat');
  assert.equal(entered.node.children[1].children[1].textContent, '本场失利');
  api.stopAll();
});

test('reduced motion, skip, per-arena stop, global stop, and pagehide clean timers and nodes', () => {
  const first = harness(), second = harness();
  const descriptor = { important:true, importantKind:'gym', scene:'gym-rock', key:'rock', title:'尼比道馆', opponent:'小刚', duration:1500 };
  const a = first.api.enter(first.arena, { battle:descriptor }, { reduced:true, speed:.25 });
  const b = second.api.enter(second.arena, { battle:descriptor });
  assert.equal(a.node.style['--important-duration'], '300ms'); assert.equal(a.node.classList.contains('is-reduced'), true);
  a.node.children[3].dispatch('click'); assert.equal(a.node.classList.contains('is-idle'), true);
  first.api.stopAll(first.arena); assert.equal(first.arena.children.length, 0); assert.equal(first.timers.size, 0);
  second.windowListeners.get('pagehide')(); assert.equal(second.arena.children.length, 0); assert.equal(second.timers.size, 0);
  assert.ok(b); assert.match(css, /prefers-reduced-motion:\s*reduce/); assert.match(css, /data-scene="rocket-alert"/); assert.match(css, /data-scene="quest-guardian"/);
});
