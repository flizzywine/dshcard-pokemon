'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {KantoGame, Dex} = require('../engine.cjs');
const mvu = require('../mvu.cjs');

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

function functionSource(name) {
  let start = app.indexOf(`async function ${name}(`);
  if (start < 0) start = app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `app.js defines ${name}`);
  const open = app.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = open; i < app.length; i++) {
    const ch = app[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return app.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

class Element {
  constructor() { this.children = []; this.hidden = false; this.disabled = false; this.dataset = {}; this.attributes = {}; this.style = {setProperty() {}}; }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, callback) { this[`on${name}`] = callback; }
}

function renderSnapshot(snapshot) {
  const els = Object.fromEntries(['moves','switch','switchTray','potion','capture','run','battleCommandBar',
    'battleBagPanel','battlePokemonPanel','battleRunPanel'].map(name => [name, new Element()]));
  els.battleCommandBar.querySelectorAll = () => [];
  const context = {
    els,
    state: {busy:false, battleActionTab:'moves'},
    document: {createElement: () => new Element()},
    assetUrl: () => '', isShiny: () => false,
    activeMon: side => side?.team?.find(mon => mon.active) || null,
    statusNames: {},
    moveBattleHint: () => '', moveById: () => null, typeName: value => value || '',
    itemCount: () => 5,
    renderBattleCommandTabs: () => {}, renderBattleBag: () => {},
  };
  vm.runInNewContext(`${functionSource('renderActions')}\nglobalThis.run=renderActions;`, context);
  context.run(snapshot);
  return {els, context};
}

function trappedWild({species, item = ''}) {
  const game = new KantoGame();
  const snapshot = game.start({mode:'wild', seed:[11,12,13,14],
    team:[{id:Dex.species.get(species).num, ...(item ? {item} : {})}],
    opponent:[{id:Dex.species.get('snorlax').num}]});
  const record = game.battles.get(snapshot.id);
  record.battle.p1.activeRequest.active[0].trapped = true;
  return {game, record, snapshot:game.snapshot(record)};
}

test('native Run stays selectable when Run Away or Smoke Ball bypasses a trapped request', () => {
  const disabled = [];
  for (const options of [{species:'rattata'}, {species:'pikachu', item:'smokeball'}]) {
    const {snapshot} = trappedWild(options);
    assert.equal(snapshot.request.trapped, true, 'exercise the same trapped request sent to the native view');
    const {els} = renderSnapshot(snapshot);
    disabled.push(els.run.disabled);
  }
  assert.deepEqual(disabled, [false, false], 'Run Away and Smoke Ball must both keep the native Run action enabled when trapped');
});

test('forced-switch UI exposes only a living reserve and keeps escape/item controls unavailable', () => {
  const game = new KantoGame();
  const first = game.start({mode:'wild', seed:[21,22,23,24],
    team:[{id:25},{id:1}], opponent:[{id:143,moves:['tackle']}]});
  const record = game.battles.get(first.id);
  record.battle.p1.pokemon[0].hp = 1;
  const moveIndex = first.request.moves.findIndex(move => move.id === 'quickattack');
  assert.notEqual(moveIndex, -1);
  const forced = game.act({battleId:first.id, choice:`move ${moveIndex + 1}`});
  assert.equal(forced.request.forceSwitch, true, 'engine requires an immediate replacement');
  const {els} = renderSnapshot(forced);
  assert.equal(els.switch.disabled, false);
  assert.equal(els.switchTray.hidden, false);
  assert.equal(els.switchTray.children.length, 2);
  assert.equal(els.switchTray.children[0].disabled, true, 'the active/fainted slot is not selectable');
  assert.equal(els.switchTray.children[1].disabled, false, 'living reserve is selectable');
  assert.equal(els.capture.disabled, true);
  assert.equal(els.run.disabled, true);
  assert.equal(els.moves.children[0].textContent, '当前宝可梦无法继续战斗，请选择同行替补。');
});

test('successful Smoke Ball escape persists the terminal outcome and party state through MVU', () => {
  const variables = mvu.createInitialMvu(1);
  const world = variables.stat_data['宝可梦'];
  world.队伍[0].携带道具 = 'smokeball';
  world.遭遇 = {类型:'wild',训练家:'野生卡比兽',队伍:[mvu.makeMon(143,5,'audit-wild-snorlax')]};
  world.战斗.状态 = 'pending'; world.战斗.结果 = ''; world.战斗.已奖励 = false;
  mvu.validateMvu(variables);
  const game = new KantoGame();
  const initial = mvu.startFromMvu(game, variables), record = game.battles.get(initial.id);
  record.battle.p1.activeRequest.active[0].trapped = true;
  const escaped = game.act({battleId:initial.id,choice:'run'});
  assert.equal(escaped.ended, true);
  assert.equal(escaped.escaped, true);
  const saved = mvu.applyBattleResult(variables, record).stat_data['宝可梦'];
  assert.equal(saved.战斗.状态, 'finished');
  assert.equal(saved.战斗.结果, 'escaped');
  assert.equal(saved.队伍[0].携带道具, 'smokeball');
  assert.equal(saved.队伍[0].当前HP, world.队伍[0].当前HP,
    'a bypass escape ends without granting the trapped wild opponent an action');
});

test('capture keeps reduced-effects timing alongside the shared presentation skip control', () => {
  const source = functionSource('animateCapture');
  assert.match(source, /if \(reduced\) \{/,
    'the existing accessibility setting shortens capture presentation');
  assert.match(app,/skipBattleEffects'\)\?\.addEventListener\('click', skipBattlePresentation\)/);
  assert.match(app,/if\(state.fastForward\)\{const text=formatEvent\(line\)/,'shared event runner retains the log while fast-forwarding');
});
