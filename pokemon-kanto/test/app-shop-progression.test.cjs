'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/battle-theme.css'), 'utf8');
const tmhm = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/tmhm.json'), 'utf8').replace(/^﻿/, ''));

function functionSource(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(app);
  assert.ok(match, `app.js defines ${name}`);
  const start = match.index, paren = app.indexOf('(', start); let depth = 0, quote = '', escaped = false, close = -1;
  for (let i = paren; i < app.length; i++) {
    const ch = app[i];
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')' && --depth === 0) { close = i; break; }
  }
  const open = app.indexOf('{', close); depth = 0; quote = ''; escaped = false;
  for (let i = open; i < app.length; i++) {
    const ch = app[i];
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return app.slice(start, i + 1);
  }
  throw Error(`unterminated ${name}`);
}

class Element {
  constructor(tagName) { this.tagName = tagName; this.children = []; this.hidden = false; this.disabled = false; this.dataset = {}; this.listeners = {}; this.style = { setProperty(name, value) { this[name] = value; } }; }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  setAttribute(name, value) { this[name] = value; }
  get textContent() { return this._text ?? this.children.map(child => child.textContent || '').join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
}

function shopView({ town, available, items, reason = '' }) {
  const els = { shopItems: new Element('div'), shopReturn: new Element('button') };
  const state = { shop: { available, title: '当前城镇库存', items, reason }, busy: false };
  const definitions = {
    potion: { name: '伤药', price: 300 },
    pokeball: { name: '精灵球', price: 200 },
    greatball: { name: '超级球', price: 600 },
  };
  const context = {
    els, state, document: { createElement: tag => new Element(tag) },
    isTown: () => town, battleStatus: () => 'pending', itemDefinition: id => definitions[id] || {},
    itemName: id => definitions[id]?.name || id, itemDescription: (_id, def) => def.description || '', itemCount: () => 0, first: (object, keys, fallback) => {
      for (const key of keys) if (object?.[key] !== undefined && object[key] !== null) return object[key];
      return fallback;
    }, buyItem() {},
  };
  vm.runInNewContext(`${functionSource('renderShop')}\nglobalThis.render=renderShop;`, context);
  context.render();
  return { els, state };
}

test('applyWorld retains the progression and town shop view returned beside MVU world data', () => {
  const state = { items: {}, locations: [] }, calls = { render: 0 };
  const context = { state, els: {mvuJson:{parentElement:{open:false}}}, mvuRoot: value => value, renderWorld: () => calls.render++ };
  vm.runInNewContext(`${functionSource('renderMvuJson')}\n${functionSource('applyWorld')}\nglobalThis.apply=applyWorld;`, context);
  const shop = { available: true, title: '玉虹百货', items: ['greatball'] };
  const progression = { levelCap: 41, nextGym: 6, badges: 6, leagueProgress: 2 };
  context.apply({ worldView: { world: { 队伍: [], 训练家: { 徽章: [] } }, items: {}, locations: [], shop, progression } });
  assert.deepEqual(JSON.parse(JSON.stringify(state.shop)), shop);
  assert.deepEqual(JSON.parse(JSON.stringify(state.progression)), progression);
  assert.equal(calls.render, 1);
});

test('town shop renders only the server-listed item IDs and never invents fallback stock', () => {
  const town = shopView({ town: true, available: true, items: ['greatball'] });
  const rows = town.els.shopItems.children.filter(child => child.className === 'shop-item-row');
  assert.equal(rows.length, 1);
  assert.match(rows[0].textContent, /超级球/);
  assert.equal(town.els.shopReturn.hidden, true);

  const empty = shopView({ town: true, available: true, items: [] });
  assert.equal(empty.els.shopItems.children.filter(child => child.className === 'shop-item-row').length, 0);
  assert.match(empty.els.shopItems.textContent, /没有可购买/);
});

test('outside town the shop shows the service reason, no stock rows, and a return-to-story action', () => {
  const view = shopView({ town: false, available: false, items: [], reason: '离开城镇后无法购买。' });
  assert.equal(view.els.shopReturn.hidden, false);
  assert.match(view.els.shopItems.textContent, /离开城镇后无法购买/);
  assert.equal(view.els.shopItems.children.filter(child => child.className === 'shop-item-row').length, 0);
  assert.match(app, /if \(embedded && \(stageMode \|\| rosterMode\)\) \{ sendBridgeMessage\(\{ type: 'stage-return' \}\); return; \}/);
});

test('battle action speed control mirrors the existing select and persists the 1x/2x/4x value', () => {
  const els = { speed: { value: '1' }, speedAction: { value: '1' } }, state = { animationSpeed: 1 };
  const body = { style: { setProperty(name, value) { this[name] = value; } } };
  const bridge = [];
  const context = { els, state, document: { body }, safeNum: value => Number(value), nativeMode: true, embedded: true, sendBridgeMessage: message => bridge.push(message) };
  vm.runInNewContext(`${functionSource('setAnimationSpeed')}\nglobalThis.set=setAnimationSpeed;`, context);
  for (const speed of [1, 2, 4]) {
    context.set(speed);
    assert.equal(state.animationSpeed, speed);
    assert.equal(els.speed.value, String(speed));
    assert.equal(els.speedAction.value, String(speed));
    assert.equal(body.style['--battle-speed'], String(speed));
  }
  assert.deepEqual(JSON.parse(JSON.stringify(bridge)), [1, 2, 4].map(speed => ({ type: 'presentation-change', speed })));
  assert.match(html, /id="animationSpeedAction"/);
  assert.match(css, /body\.native-mode\.battle-focus \.battle-speed-action \{ display:inline-flex/);
});

test('battle sound and reduced-motion controls send presentation changes to the stage owner', () => {
  const messages = [], handlers = {};
  const els = {
    sound: { addEventListener: (type, fn) => { handlers.sound = fn; }, setAttribute() {} },
    soundLabel: { textContent: '' },
    reduceEffects: { checked: true, addEventListener: (type, fn) => { handlers.reduce = fn; } },
  };
  const state = { muted: false, reducedEffects: false };
  const context = {
    els, state, nativeMode: true, embedded: true, sendBridgeMessage: message => messages.push(message),
    clearCosmeticEffects() {}, clearShinyEntries() {},window: { KantoAudio: { effects() {} } }, document: { body: { classList: { toggle() {} } } },
  };
  const soundBinding = app.split('\n').find(line => line.includes("els.sound.addEventListener('click'"));
  const reducedBinding = app.split('\n').find(line => line.includes("els.reduceEffects.addEventListener('change'"));
  assert.ok(soundBinding && reducedBinding, 'settings handlers remain on the real battle controls');
  vm.runInNewContext(`${soundBinding}\n${reducedBinding}`, context);
  handlers.sound();
  handlers.reduce();
  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [
    { type: 'presentation-change', effects: false },
    { type: 'presentation-change', reducedEffects: true },
  ]);
  assert.equal(state.muted, true);
  assert.equal(state.reducedEffects, true);
});

test('battle report writing and automatic finish posts remain removed while result rewards stay visible', () => {
  assert.doesNotMatch(app, /battle-finished|requestBattleReport|战果写入输入框/);
  assert.match(app, /function renderBattleResult\(snapshot\)/);
  assert.match(app, /const money=document\.createElement\('p'\)/);
  assert.doesNotMatch(html, /战果写入输入框|AI战果总结/);
});

function firstOf(object, keys, fallback) {
  for (const key of keys) if (object?.[key] !== undefined && object[key] !== null) return object[key];
  return fallback;
}

function catalogContext(state) {
  const start = app.indexOf('  let itemCatalogCache = null;');
  const end = app.indexOf('  function renderHudTabs()', start);
  assert.ok(start >= 0 && end > start, 'app.js keeps the item catalog helpers together');
  const context = {
    state, itemLabels: { potion: '伤药', pokeball: '精灵球' }, first: firstOf,
    moveById: id => state.moves?.[String(id || '').toLowerCase()],
  };
  vm.runInNewContext(`${app.slice(start, end)}
globalThis.itemName=itemName;globalThis.itemDescription=itemDescription;globalThis.rewardItemLabel=rewardItemLabel;`, context);
  return context;
}

function inventoryView({ items, machines, moves }) {
  const els = { inventory: new Element('div'), keyItems: new Element('div'), potionCount: { textContent: '' }, ballCount: { textContent: '' } };
  const state = { world: { 背包: { 物品: items } }, items: [], machines, moves, bagDisclosure: {}, busy: false };
  const context = {
    els, state, document: { createElement: tag => new Element(tag) }, first: firstOf, safeNum: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    getBagItems: () => state.world.背包.物品, itemCount: () => 0, getParty: () => [], battleStatus: () => 'pending',
    moveById: id => state.moves?.[String(id || '').toLowerCase()], itemLabels: {}, assetHref: value => value,
    dexId: () => 0, nameOfMon: () => '伙伴', renderQuestDeliveries() {},
  };
  const source = [
    functionSource('normalizeItemList'),
    app.slice(app.indexOf('  let itemCatalogCache = null;'), app.indexOf('  function renderHudTabs()')),
    functionSource('machineControls'), functionSource('renderInventoryRow'), functionSource('renderStoredMail'), functionSource('renderInventory'),
  ].join('\n');
  vm.runInNewContext(`${source}\nglobalThis.renderInventory=renderInventory;`, context);
  context.renderInventory();
  return els;
}

test('bag machine rows show the Chinese TM name and move description when the catalog only names it in English', () => {
  const machine = tmhm.find(entry => entry.id === 'tm27');
  assert.equal(machine.name, 'TM 27 Return');
  const moves = { return: { id: 'return', name: '报恩', description: '威力随亲密度提高，最高为102。' } };
  const els = inventoryView({
    items: { tm27: 1 },
    machines: [{ ...machine, nameZh: 'TM27 报恩', moveNameZh: '报恩' }],
    moves,
  });
  assert.match(els.inventory.textContent, /TM27 报恩/);
  assert.match(els.inventory.textContent, /威力随亲密度提高，最高为102。/);
  assert.doesNotMatch(els.inventory.textContent, /TM 27 Return/);
});

test('item names and descriptions prefer Chinese fields and safely fall back to the original text', () => {
  const context = catalogContext({
    items: [
      { id: 'potion', name: 'Potion', 名称: '伤药', description: 'Restores 20 HP.', descriptionZh: '恢复20点HP。' },
      { id: 'tm99', kind: 'tm', number: 99, name: 'TM 99 Unknown', move: 'mystery', moveNameZh: '神秘招式' },
      { id: 'englishonly', name: 'English Only', description: 'No localisation.' },
      { id: 'pokeball', name: 'Poké Ball' },
    ],
    machines: [], moves: {},
  });
  assert.equal(context.itemName('potion'), '伤药');
  assert.equal(context.itemName('pokeball'), '精灵球');
  assert.equal(context.itemDescription('potion'), '恢复20点HP。');
  assert.equal(context.itemName('tm99'), 'TM99 神秘招式');
  assert.equal(context.itemDescription('tm99'), '');
  assert.equal(context.itemName('englishonly'), 'English Only');
  assert.equal(context.itemDescription('englishonly'), 'No localisation.');
  assert.equal(context.itemName('missing'), 'missing');
  assert.equal(context.itemDescription('missing'), '');
});

test('battle rewards use the Chinese machine name instead of the server-side English label', () => {
  const context = catalogContext({
    items: [], moves: {},
    machines: [{ id: 'tm39', kind: 'tm', number: 39, name: 'TM 39 Rock Tomb', move: 'rocktomb', moveNameZh: '岩石封锁', nameZh: 'TM39 岩石封锁' }],
  });
  assert.equal(context.rewardItemLabel({ id: 'tm39', 名称: 'TM 39 Rock Tomb', 数量: 1 }), 'TM39 岩石封锁');
  assert.equal(context.rewardItemLabel({ id: 'potion', 名称: '伤药（困难首胜：恢复20HP）', 数量: 1 }), '伤药（困难首胜：恢复20HP）');
  assert.equal(context.rewardItemLabel({ 名称: '神秘礼物', 数量: 1 }), '神秘礼物');
  assert.equal(context.rewardItemLabel({ id: 'unknownitem', 名称: 'Unknown Item', 数量: 1 }), 'Unknown Item');
});

test('inventory, shop, battle bag and battle rewards all route item text through the Chinese-first helpers', () => {
  assert.match(app, /const effect = document\.createElement\('small'\); effect\.className='item-effect'; effect\.textContent=itemDescription\(id, def\);/);
  assert.match(app, /effect\.textContent=itemDescription\(id, definition\)/);
  assert.match(app, /action\.textContent = actionKey \? itemDescription\(id, def\) \|\| '使用会消耗本回合'/);
  assert.match(app, /\(reward\.物品\|\|\[\]\)\.map\(item=>`\$\{rewardItemLabel\(item\)\} ×\$\{item\.数量\}`\)/);
});
