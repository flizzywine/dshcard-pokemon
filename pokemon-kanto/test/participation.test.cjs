const test = require('node:test');
const assert = require('node:assert/strict');
const {KantoGame} = require('../engine.cjs');

test('participation is tracked once per player UID for each opponent slot across switches and replacements', () => {
  const game = new KantoGame();
  const snapshot = game.start({mode: 'practice', seed: [4, 5, 6, 7],
    team: [
      {id: 25, uid: 'player-lead', moves: ['quickattack']},
      {id: 143, uid: 'player-reserve', moves: ['bodyslam']},
    ],
    opponent: [
      {id: 129, uid: 'foe-first', moves: ['splash']},
      {id: 129, uid: 'foe-second', moves: ['splash']},
    ]});
  const record = game.battles.get(snapshot.id);
  assert.deepEqual(record.participationByFoe, {'foe-first': ['player-lead']});

  let after = game.act({battleId: snapshot.id, choice: 'switch 2'});
  assert.deepEqual(record.participationByFoe['foe-first'], ['player-lead', 'player-reserve']);

  const activeFoe = record.battle.p2.active[0];
  activeFoe.hp = 1;
  after = game.act({battleId: after.id, choice: 'move 1'});
  assert.ok(record.participationByFoe['foe-second']);
  assert.deepEqual(record.participationByFoe['foe-second'], ['player-reserve']);
  assert.deepEqual(record.participationByFoe['foe-first'], ['player-lead', 'player-reserve']);
  assert.deepEqual(record.livingByFoeAtDefeat['foe-first'].slice().sort(), ['player-lead', 'player-reserve']);
});

test('participants without stable UIDs do not create reward keys', () => {
  const game = new KantoGame();
  const snapshot = game.start({mode: 'practice', seed: [8, 9, 10, 11],
    team: [{id: 25, moves: ['quickattack']}], opponent: [{id: 129, moves: ['splash']}]});
  const record = game.battles.get(snapshot.id);
  assert.deepEqual(record.participationByFoe, {});
});
