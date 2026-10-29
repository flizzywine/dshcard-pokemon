'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { KantoGame, catalog } = require('../engine.cjs');

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/battle-theme.css'), 'utf8');
function extract(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(app);
  assert.ok(match, `missing ${name}`);
  const start = match.index, brace = app.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = brace; i < app.length; i++) {
    const ch = app[i];
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return app.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

const itemNames = {
  leftovers:'吃剩的东西', shellbell:'贝壳之铃', oranberry:'橙橙果', sitrusberry:'文柚果',
  whiteherb:'白色香草', mentalherb:'心灵香草', choiceband:'专爱头带', charcoal:'木炭',
};
function appVM() {
  const context = {
    protocol: line => String(line).split('|'),
    actorSide: token => /^p1/i.test(token || '') ? 'player' : /^p2/i.test(token || '') ? 'foe' : null,
    normalizeLookup: value => String(value || '').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]/g, ''),
    itemName: id => itemNames[id] || id,
    canonicalMove: raw => catalog.moves[String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '')] || null,
    speciesByEnglish: () => null, weatherName: value => value, safeNum: value => Number(value) || 0,
    statusNames: { par:'麻痹', slp:'睡眠', brn:'灼伤', psn:'中毒', frz:'冰冻' },
    state: { dex:{ abilityNames:{} } },
  };
  vm.runInNewContext(`${extract('formatEvent')}\n${extract('heldItemCue')}\n${extract('choiceBandLockMessage')}\nglobalThis.api={formatEvent,heldItemCue,choiceBandLockMessage};`, context);
  return context.api;
}

function start({ team, opponent, seed = [91, 92, 93, 94] }) {
  const game = new KantoGame();
  const snapshot = game.start({ team, opponent, seed });
  return { game, snapshot, record:game.battles.get(snapshot.id) };
}

test('real Gen III held-item events render in Chinese with item-specific healing and consumption cues', () => {
  const view = appVM();
  let x = start({ team:[{ id:25, item:'leftovers', level:30, moves:['thunderwave'] }], opponent:[{ id:143, level:10, moves:['rest'] }] });
  x.record.battle.p1.active[0].hp = Math.floor(x.record.battle.p1.active[0].maxhp * .6);
  let snapshot = x.game.act({ battleId:x.snapshot.id, choice:'move 1', enemyChoice:'move 1' });
  const leftovers = snapshot.events.find(line => line.startsWith('|-heal|p1a:') && line.includes('item: Leftovers'));
  assert.ok(leftovers, 'Leftovers creates a real residual healing event');
  assert.match(view.formatEvent(leftovers), /吃剩的东西/);
  assert.deepEqual({ ...view.heldItemCue(leftovers) }, { cue:'leftovers-glow', side:'player' });
  assert.equal(snapshot.sides[0].team[0].heldItem, 'leftovers', 'passive recovery does not consume the held item');

  x = start({ team:[{ id:25, item:'shellbell', level:30, moves:['thunderbolt'] }], opponent:[{ id:143, level:10, moves:['rest'] }] });
  x.record.battle.p1.active[0].hp = Math.floor(x.record.battle.p1.active[0].maxhp * .6);
  snapshot = x.game.act({ battleId:x.snapshot.id, choice:'move 1', enemyChoice:'move 1' });
  const bell = snapshot.events.find(line => line.startsWith('|-heal|p1a:') && line.includes('item: Shell Bell'));
  assert.ok(bell, 'Shell Bell recovery is tied to damage dealt');
  assert.match(view.formatEvent(bell), /贝壳之铃/);
  assert.deepEqual({ ...view.heldItemCue(bell) }, { cue:'shell-bell-drain', side:'player', sourceSide:'foe' });
  assert.equal(snapshot.sides[0].team[0].heldItem, 'shellbell', 'Shell Bell is not consumed');

  for (const [id, label] of [['oranberry','Oran Berry'], ['sitrusberry','Sitrus Berry']]) {
    x = start({ team:[{ id:143, item:id, level:50, moves:['curse','rest'] }], opponent:[{ id:16, level:50, moves:['tackle'] }] });
    const mon = x.record.battle.p1.active[0]; mon.hp = Math.ceil(mon.maxhp * .55);
    snapshot = x.game.act({ battleId:x.snapshot.id, choice:'move 1', enemyChoice:'move 1' });
    const consumed = snapshot.events.find(line => line.includes(`|-enditem|p1a:`) && line.includes(label) && line.includes('[eat]'));
    const heal = snapshot.events.find(line => line.startsWith('|-heal|p1a:') && line.includes(`item: ${label}`));
    assert.ok(consumed && heal, `${id} really consumes then restores HP`);
    assert.match(view.formatEvent(consumed), /吃掉了/);
    assert.deepEqual({ ...view.heldItemCue(consumed) }, { cue:'berry-spark', side:'player' });
    assert.deepEqual({ ...view.heldItemCue(heal) }, { cue:'berry-heal-glow', side:'player' });
    assert.equal(snapshot.sides[0].team[0].heldItem, '', `${id} is gone in the authoritative snapshot`);
  }

  x = start({ team:[{ id:25, item:'whiteherb', level:30, moves:['thunderbolt'] }], opponent:[{ id:16, level:10, moves:['tackle'] }] });
  x.record.battle.p1.active[0].boosts.accuracy = -1;
  snapshot = x.game.act({ battleId:x.snapshot.id, choice:'move 1', enemyChoice:'move 1' });
  const herbIndex = snapshot.events.findIndex(line => line.includes('|-enditem|p1a:') && line.includes('White Herb'));
  const clear = snapshot.events[herbIndex + 1];
  assert.ok(herbIndex >= 0 && clear.includes('|-clearnegativeboost|p1a:'));
  assert.match(view.formatEvent(snapshot.events[herbIndex]), /消耗了白色香草/);
  assert.match(view.formatEvent(clear), /能力下降被全部消除/);
  assert.deepEqual({ ...view.heldItemCue(snapshot.events[herbIndex]) }, { cue:'herb-consume-glow', side:'player' });
  assert.deepEqual({ ...view.heldItemCue(clear, snapshot.events[herbIndex]) }, { cue:'herb-cleanse', side:'player' });
  assert.equal(snapshot.sides[0].team[0].heldItem, '');
});

test('Gen III Choice Band lock and non-consuming type boost are visible from real battle state', () => {
  const view = appVM();
  let x = start({ team:[{ id:25, item:'choiceband', level:30, moves:['quickattack','thunderbolt'] }], opponent:[{ id:143, level:10, moves:['rest'] }], seed:[1,2,3,4] });
  let snapshot = x.game.act({ battleId:x.snapshot.id, choice:'move 1', enemyChoice:'move 1' });
  assert.ok(snapshot.sides[0].team[0].volatiles.includes('choicelock'), 'Gen III Choice Band creates a choice lock');
  const moveEvent = snapshot.events.find(line => line.startsWith('|move|p1a:'));
  const lock = view.choiceBandLockMessage(moveEvent, snapshot);
  assert.match(lock.text, /专爱头带影响，招式锁定为电光一闪/);
  assert.throws(() => x.game.act({ battleId:snapshot.id, choice:'move 2', enemyChoice:'move 1' }), /招式可能被禁用/);

  const damage = item => {
    const game = new KantoGame(), initial = game.start({ team:[{ id:4, ...(item ? { item } : {}), level:30, moves:['ember'] }], opponent:[{ id:143, level:10, moves:['rest'] }], seed:[44,45,46,47] });
    const result = game.act({ battleId:initial.id, choice:'move 1', enemyChoice:'move 1' });
    const event = result.events.find(line => line.startsWith('|-damage|p2a:'));
    return { damage:Number(event.match(/\|(\d+)\/\d+/)?.[1]), snapshot:result };
  };
  const plain = damage(''), boosted = damage('charcoal');
  assert.ok(boosted.damage < plain.damage, 'Charcoal leaves less HP, confirming its real Fire damage boost');
  assert.equal(boosted.snapshot.sides[0].team[0].heldItem, 'charcoal', 'Charcoal boosts without consumption');
  assert.ok(!boosted.snapshot.events.some(line => line.includes('|-enditem|p1a:') && line.includes('Charcoal')));
  assert.ok(catalog.items.some(item => item.id === 'charcoal'));
});

test('item cue styling stays click-through and has reduced-effects coverage', () => {
  for (const name of ['leftovers-glow','shell-bell-drain','item-heal-glow','berry-heal-glow','berry-spark','herb-cleanse','herb-consume-glow']) {
    assert.ok(new RegExp(`\\.fx-${name}(?:,|\\s*\\{)[^}]*pointer-events:none`).test(css), `${name} cannot block stage controls`);
    assert.ok(new RegExp(`body\\.reduce-effects[^\\n]*\\.fx-${name}`).test(css), `${name} is suppressed with reduced effects`);
  }
  assert.match(app, /heldItemCue\(line, previousItemEvent\)/);
  assert.match(app, /choiceBandLockMessage\(line, nextSnapshot\)/);
});
