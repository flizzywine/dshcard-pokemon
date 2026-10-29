'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/battle-theme.css'), 'utf8');
function functionSource(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `app.js defines ${name}`);
  const start = match.index, paren = source.indexOf('(', start); let parenDepth = 0, quote = '', escaped = false, close = -1;
  for (let i = paren; i < source.length; i++) {
    const ch = source[i];
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '(') parenDepth++;
    if (ch === ')' && --parenDepth === 0) { close = i; break; }
  }
  const open = source.indexOf('{', close); let depth = 0; quote = ''; escaped = false;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw Error(`unterminated ${name}`);
}

class Element {
  constructor(tagName) { this.tagName = tagName; this.children = []; this.attributes = {}; this.listeners = {}; this.hidden = false; this.disabled = false; this.dataset = {}; this.classes = new Set(); this.classList = { add: (...values) => values.forEach(value => this.classes.add(value)), remove: (...values) => values.forEach(value => this.classes.delete(value)), contains: value => this.classes.has(value) }; this.style = { setProperty(name, value) { this[name] = value; } }; }
  setAttribute(name, value) { this.attributes[name] = value; }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  click() { if (!this.disabled) return this.listeners.click?.({ stopPropagation() {} }); }
  get textContent() { return this._textContent ?? this.children.map(child => child.textContent || '').join(''); }
  set textContent(value) { this._textContent = String(value); this.children = []; }
}

function fixture(session = new Map()) {
  const elements = { battleResult: new Element('section'), battleActionBody: new Element('div') };
  const state = { world: { 战斗: { 状态: 'pending', 结果: '', 奖励: null }, 队伍: [], 电脑: [] }, battleBaseline: [], growthSeenBattleId: '', animationSpeed: 1, reducedEffects: false };
  const calls = { returnToStage: 0 };
  const timers = [];
  const context = {
    document: { createElement: tagName => new Element(tagName) },
    state, nativeMode: true, Math, window: { sessionStorage: { getItem: key => session.get(key) || null, setItem: (key, value) => session.set(key, value) } }, safeNum: value => Number(value) || 0, setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
    $(id) { return elements[id]; },
    getParty() { return state.world.队伍; }, isShiny:mon=>mon?.闪光===true||mon?.shiny===true, assetUrl: id => `sprite:${id}`,
    rewardItemLabel(item) { return item.名称 || item.name || item.id || '道具'; },
    returnToStage() { calls.returnToStage++; },
  };
  vm.runInNewContext(`${functionSource('renderGrowthRecap')}\n${functionSource('renderBattleResult')}\nglobalThis.renderBattleResult=renderBattleResult;`, context);
  return { panel: elements.battleResult, actions: elements.battleActionBody, render: context.renderBattleResult, state, calls, timers, session };
}
const lines = panel => panel.children.map(child => child.textContent);

test('ended battles hide actions and render only the MVU reward facts', () => {
  const view = fixture();
  view.state.world.战斗.结果 = 'win';
  const snapshot = { ended: true, rewards: {
    金币: 80,
    经验: [{ 昵称: '小火龙', 获得: 125, 升级: 1 }],
    物品: [{ 名称: '伤药', 数量: 1 }],
    徽章: ['岩石徽章'],
  } };
  view.render(snapshot);
  assert.equal(view.panel.hidden, false);
  assert.equal(view.actions.hidden, true, 'the action area is hidden after battle end');
  assert.match(lines(view.panel)[0], /赢得了这场对战/);
  assert.ok(lines(view.panel).includes('金币 +80'));
  assert.ok(lines(view.panel).some(line => /小火龙 · 经验 \+125 · 提升 1 级/.test(line)));
  assert.ok(lines(view.panel).includes('伤药 ×1 · 岩石徽章'));
});

test('zero rewards do not fabricate items or badges and a caught result uses the capture message', () => {
  const view = fixture();
  view.state.world.战斗.结果 = 'win';
  view.render({ ended: true, rewards: { 金币: 0, 经验: [], 物品: [], 徽章: [] } });
  const rewardLines = view.panel.children.filter(child => child.tagName === 'p').map(child => child.textContent);
  assert.deepEqual(rewardLines, ['金币 +0'], 'empty reward arrays produce no invented items, experience, or badges');

  view.state.world.战斗.结果 = 'caught';
  view.render({ ended: true, caught: { id: 25 }, rewards: { 金币: 0, 经验: [], 物品: [], 徽章: [] } });
  assert.match(lines(view.panel)[0], /收服成功/);
  const back = view.panel.children.find(child => child.className === 'return-story-result');
  assert.ok(back);
  back.click();
  assert.equal(view.calls.returnToStage, 1, 'the result view returns through the existing stage callback');
});

test('pending and active snapshots never expose the battle result panel or hide actions', () => {
  const view = fixture();
  for (const status of ['pending', 'active']) {
    view.state.world.战斗.状态 = status;
    view.state.world.战斗.结果 = '';
    view.render({ ended: false, rewards: null });
    assert.equal(view.panel.hidden, true, `${status} has no result panel`);
    assert.equal(view.actions.hidden, false, `${status} keeps the action area available`);
  }
});

test('battle growth uses the exact reward and after-world level, evolves only on a real species change, and can be skipped once', () => {
  const view = fixture();
  const reward = { 金币: 0, 经验: [{ uid: 'starter', 昵称: '火恐龙', 获得: 960, 升级: 1 }], 物品: [], 徽章: [] };
  view.state.world = { 战斗: { 状态: 'finished', 结果: 'win', 奖励: reward }, 队伍: [{ uid: 'starter', 图鉴编号: 6, 昵称: '喷火龙', 等级: 16, 经验: 4096 }], 电脑: [] };
  view.state.battleBaseline = [{ uid: 'starter', 图鉴编号: 5, 昵称: '火恐龙', 等级: 15 }];
  const snapshot = { id: 'battle-growth', ended: true, rewards: reward };
  view.render(snapshot);
  let recap = view.panel.children.find(child => child.className === 'growth-recap');
  assert.ok(recap);
  assert.match(recap.textContent, /经验 \+960/);
  assert.match(recap.textContent, /升至 Lv\. 16/);
  assert.match(recap.textContent, /火恐龙进化为喷火龙/);
  const showcase = recap.children.find(child => child.className === 'growth-row').children.find(child => child.className === 'evolution-showcase');
  assert.deepEqual(showcase.children.filter(child => child.tagName === 'img').map(child => child.src), ['sprite:5', 'sprite:6']);
  const skip = recap.children.find(child => child.className === 'growth-continue');
  assert.ok(skip && !skip.hidden, 'the continue action is available without blocking the recorded reward');
  assert.equal(view.timers.length, 1);
  skip.click();
  assert.ok(recap.classList.contains('is-complete'));
  assert.equal(skip.hidden, true);
  view.render(snapshot);
  recap = view.panel.children.find(child => child.className === 'growth-recap');
  assert.ok(recap.classList.contains('is-complete'));
  assert.equal(recap.children.some(child => child.className === 'growth-continue'), false, 'rerendering the same battle does not replay the reveal');
  assert.equal(view.timers.length, 1);
  assert.equal(view.session.get('kanto-growth:battle-growth'), 'shown');
  const reopened = fixture(view.session);
  reopened.state.world = view.state.world;
  reopened.state.battleBaseline = view.state.battleBaseline;
  reopened.render(snapshot);
  const reopenedRecap = reopened.panel.children.find(child => child.className === 'growth-recap');
  assert.ok(reopenedRecap.classList.contains('is-complete'), 'a reload of the same result does not replay the reveal');
  assert.equal(reopened.timers.length, 0);
});

test('reduced effects show final growth immediately without scheduling an animation', () => {
  const view = fixture(); view.state.reducedEffects = true;
  const reward = { 金币: 0, 经验: [{ uid: 'pika', 昵称: '皮卡丘', 获得: 24, 升级: 0 }], 物品: [], 徽章: [] };
  view.state.world = { 战斗: { 状态: 'finished', 结果: 'win', 奖励: reward }, 队伍: [{ uid: 'pika', 图鉴编号: 25, 昵称: '皮卡丘', 等级: 5 }], 电脑: [] };
  view.render({ id: 'battle-reduced', ended: true, rewards: reward });
  const recap = view.panel.children.find(child => child.className === 'growth-recap');
  assert.ok(recap.classList.contains('is-complete'));
  assert.equal(recap.children.some(child => child.className === 'growth-continue'), false);
  assert.equal(view.timers.length, 0);
});

test('the battle-head music retry appears only for a focused live battle with blocked enabled music', () => {
  const button = { hidden: true }, state = { battleFocus: true, battle: { ended: false } };
  const context = { els: { musicResume: button }, state, window: { KantoAudio: { status: () => ({ needsGesture: true }) } } };
  vm.runInNewContext(`${functionSource('syncBattleMusicButton')}\nglobalThis.sync=syncBattleMusicButton;`, context);
  context.sync(); assert.equal(button.hidden, false);
  context.window.KantoAudio.status = () => ({ needsGesture: false });
  context.sync(); assert.equal(button.hidden, true);
  context.window.KantoAudio.status = () => ({ needsGesture: true });
  state.battle.ended = true; context.sync(); assert.equal(button.hidden, true);
  state.battle.ended = false; state.battleFocus = false; context.sync(); assert.equal(button.hidden, true);
  assert.match(html, /<button id="battleMusicResume"[^>]*>播放战斗音乐<\/button>/);
  assert.match(css, /\.battle-music-resume\[hidden\]\s*\{ display:none !important; \}/);
  assert.match(css, /growth-recap\.is-revealing \.growth-row \{ animation:growth-rise calc\(440ms \/ var\(--battle-speed,1\)\)/);
  assert.match(css, /body\.reduce-effects \.growth-recap\.is-revealing \.growth-row \{ animation:none; \}/);
});
