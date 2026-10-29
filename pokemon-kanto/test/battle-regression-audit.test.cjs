'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {KantoGame, Dex, Battle} = require('../engine.cjs');
const {createInitialMvu, makeMon, startFromMvu, applyBattleResult, validateMvu} = require('../mvu.cjs');
const root = variables => variables.stat_data['宝可梦'];

test('battle continues beyond turn 1000 after save/restore and ends naturally when PP runs out', () => {
  const game = new KantoGame();
  const initial = game.start({
    mode: 'wild', seed: [1, 2, 3, 4],
    team: [{id: 129, level: 100, moves: ['splash']}],
    opponent: [{id: 129, level: 100, moves: ['splash']}],
  });
  const record = game.battles.get(initial.id);
  const battle = record.battle;
  battle.turn = 999;
  for (const side of battle.sides) {
    side.active[0].moveSlots[0].pp = 1;
    side.active[0].baseMoveSlots[0].pp = 1;
  }
  battle.makeRequest('move');
  const turn1000 = game.act({battleId: initial.id, choice: 'move 1'});
  assert.equal(turn1000.turn, 1000);
  assert.equal(turn1000.ended, false);

  const serialized = JSON.parse(JSON.stringify(record.battle.toJSON()));
  record.battle = Battle.fromJSON(serialized);
  record.cursor = record.battle.log.length;
  let current = game.act({battleId: initial.id, choice: 'move 1'});
  assert.ok(current.turn > 1000, 'the simulator must not declare an artificial draw');
  assert.equal(current.ended, false);
  assert.ok(current.events.some(event => event.includes('|Struggle|')),
    'an exhausted Pokémon uses Struggle after restoring the battle');
  for (let i = 0; !current.ended && i < 40; i++) current = game.act({battleId: initial.id, choice: 'move 1'});
  assert.equal(current.ended, true, 'Struggle should resolve the battle naturally');
  assert.ok(!record.battle.log.some(event => /hit the turn limit|auto-tie/.test(event)));
});

test('unlimited Kanto battles preserve explicit endless-loop protection and other formats', () => {
  const game = new KantoGame();
  const snapshot = game.start({
    team: [{id: 129, moves: ['splash']}], opponent: [{id: 129, moves: ['splash']}],
  });
  const kanto = game.battles.get(snapshot.id).battle;
  kanto.turn = 1001;
  const priorClause = kanto.ruleTable.get('endlessbattleclause');
  const hadClause = kanto.ruleTable.has('endlessbattleclause');
  kanto.ruleTable.set('endlessbattleclause', '');
  try {
    assert.equal(kanto.maybeTriggerEndlessBattleClause([true, true], ['external', 'internal']), true);
    assert.equal(kanto.ended, true, 'an explicitly enabled endless-battle clause still resolves a deadlock');
  } finally {
    if (hadClause) kanto.ruleTable.set('endlessbattleclause', priorClause);
    else kanto.ruleTable.delete('endlessbattleclause');
  }

  const other = new Battle({formatid: 'gen4customgame', seed: [1, 2, 3, 4]});
  const team = [{species: 'Magikarp', moves: ['splash']}];
  other.setPlayer('p1', {name: 'A', team});
  other.setPlayer('p2', {name: 'B', team});
  other.turn = 1001;
  assert.equal(other.maybeTriggerEndlessBattleClause([false, false], ['', '']), true);
  assert.equal(other.ended, true, 'non-Kanto simulator formats retain their original turn cap');
});

test('Kanto double battles also remain playable beyond turn 1000', () => {
  const game = new KantoGame();
  const team = [{id: 129, moves: ['splash']}, {id: 129, moves: ['splash']}];
  const initial = game.start({mode: 'doubles', team, opponent: team, seed: [1, 2, 3, 4]});
  const record = game.battles.get(initial.id);
  record.battle.turn = 999;
  const before = game.act({battleId: initial.id, choice: 'move 1, move 1'});
  assert.equal(before.turn, 1000);
  assert.equal(before.ended, false);
  record.battle = Battle.fromJSON(JSON.parse(JSON.stringify(record.battle.toJSON())));
  record.cursor = record.battle.log.length;
  const after = game.act({battleId: initial.id, choice: 'move 1, move 1'});
  assert.ok(after.turn > 1000);
  assert.equal(after.ended, false);
  assert.ok(!record.battle.log.some(event => /hit the turn limit|auto-tie/.test(event)));
});

test('PP items restore Transform base PP without increasing temporary copied-move PP', () => {
  const game = new KantoGame();
  const initial = game.start({
    mode: 'wild', seed: [5, 6, 7, 8],
    team: [{id: 151, moves: ['transform']}],
    opponent: [{id: 143, moves: ['tackle', 'rest', 'icebeam', 'hyperbeam']}],
    bag: {ether: 1, pokeball: 1},
  });
  const record = game.battles.get(initial.id);
  const mew = record.battle.p1.active[0];

  let snapshot = game.act({battleId: initial.id, choice: 'move 1'});
  assert.equal(mew.transformed, true);
  assert.equal(mew.baseMoveSlots[0].id, 'transform');
  assert.equal(mew.baseMoveSlots[0].pp, 9);
  assert.equal(mew.moveSlots[0].id, 'tackle');

  snapshot = game.act({battleId: initial.id, choice: 'item ether 1 1'});
  assert.equal(snapshot.ended, false);
  assert.equal(mew.baseMoveSlots[0].pp, 10, 'the selected party move slot receives the Ether restoration');
  assert.equal(mew.moveSlots[0].pp, 5, 'a Transform-copied move keeps its copied five PP');
});

test('all catalogued FRLG special balls are accepted by the in-battle capture action', () => {
  for (const ball of ['netball', 'diveball', 'nestball', 'repeatball', 'timerball', 'luxuryball', 'premierball', 'masterball']) {
    const game = new KantoGame();
    const initial = game.start({
      mode: 'wild', seed: [1, 2, 3, 4],
      team: [{id: 25, moves: ['quickattack']}],
      opponent: [{id: 129, moves: ['splash']}],
      bag: {[ball]: 1},
    });

    game.battles.get(initial.id).battle.random=()=>0;
    const caught = game.act({battleId: initial.id, choice: `capture ${ball}`});
    assert.equal(caught.ended, true, `${ball} can complete a catch`);
    assert.equal(caught.caught.ball, ball);
    assert.equal(caught.bag[ball], 0);
  }
});

test('battle result snapshots preserve persistent HP, major status, and base move PP', () => {
  const variables = createInitialMvu(1);
  const world = root(variables);
  const mon = makeMon(25, 12, 'audit-snapshot-pikachu');
  mon.招式 = [{id: 'thunderbolt', PP: 9, PP上限: 15}];
  mon.状态 = 'par';
  mon.当前HP -= 3;
  world.队伍 = [mon];
  world.遭遇 = {类型: 'trainer', 训练家: '快照审计', 队伍: [makeMon(16, 8, 'audit-snapshot-foe')]};
  world.战斗 = {轮次: 1, 状态: 'pending', 结果: '', 摘要: '', 操作序号: 0};
  validateMvu(variables);

  const game = new KantoGame();
  const initial = startFromMvu(game, variables);
  const record = game.battles.get(initial.id);
  const player = record.battle.p1.pokemon[0];
  player.hp = mon.当前HP - 2;
  player.setStatus('par');
  player.baseMoveSlots[0].pp = 8;
  player.moveSlots[0].pp = 8;
  record.battle.win('p1');

  const saved = root(applyBattleResult(variables, record)).队伍[0];
  assert.equal(saved.当前HP, mon.当前HP - 2);
  assert.equal(saved.状态, 'par');
  assert.equal(saved.招式[0].PP, 8);
  assert.equal(root(variables).队伍[0].当前HP, mon.当前HP, 'applying a battle snapshot leaves the source MVU immutable');
});

