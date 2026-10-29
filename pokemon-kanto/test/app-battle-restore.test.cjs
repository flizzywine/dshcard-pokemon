'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
function extractFunction(name) {
  const start = app.indexOf(`function ${name}(`);
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

function restore(snapshot) {
  const calls = [], state = { battle: snapshot };
  const context = {
    state,
    setBattleFocus: active => calls.push(['focus', active]),
    renderBattle: value => calls.push(['render', value]),
    showBattleEntrance: value => calls.push(['entrance', value]),
    setMessage: value => calls.push(['message', value]),
  };
  vm.runInNewContext(`${extractFunction('restoreActiveBattle')}\nglobalThis.restore = restoreActiveBattle;`, context);
  return { result: context.restore(), calls };
}

test('restoring an active battle renders its snapshot before showing the recovery message', () => {
  assert.match(app, /else if \(battleStatus\(\) === 'active'\) restoreActiveBattle\(\)/, 'battle overlay initialization uses the restore renderer');
  const snapshot = { id: 'saved-battle', sides: [{ team: [{ name: '妙蛙种子' }] }, { team: [{ name: '小拉达' }] }] };
  const { result, calls } = restore(snapshot);
  assert.equal(result, true);
  assert.deepEqual(calls.map(([kind]) => kind), ['focus', 'render', 'entrance', 'message']);
  assert.equal(calls[1][1], snapshot);
  assert.equal(calls[2][1], snapshot);
  assert.match(calls[3][1], /战斗已恢复/);
});

test('an active battle without a snapshot does not claim that restoration succeeded', () => {
  const { result, calls } = restore({ id: 'broken', sides: null });
  assert.equal(result, false);
  assert.deepEqual(calls.map(([kind]) => kind), ['focus', 'message']);
  assert.match(calls[1][1], /没有返回可恢复的战斗状态/);
});
