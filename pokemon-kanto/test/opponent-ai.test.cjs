'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {KantoGame} = require('../engine.cjs');
const {DIFFICULTIES, chooseEnemyChoice, getEnemyChoiceCandidates, getEnemyDecisionSummary} = require('../opponent-ai.cjs');

function gameAt(difficulty) {
  const game = new KantoGame();
  const current = game.start({difficulty, team: [{id: 1}], opponent: [{id: 4}], seed: [5, 6, 7, 8]});
  return {game, current, battle: game.battles.get(current.id).battle};
}

test('difficulty set is explicit; omitted difficulty retains normal and does not alter starting stats', () => {
  assert.deepEqual(DIFFICULTIES, ['easy', 'normal', 'hard', 'expert', 'hell', 'ai']);
  const regular = new KantoGame().start({team: [{id: 1}], opponent: [{id: 4}], seed: [5, 6, 7, 8]});
  const explicit = new KantoGame().start({difficulty: 'normal', team: [{id: 1}], opponent: [{id: 4}], seed: [5, 6, 7, 8]});
  const concise = state => state.sides.map(side => side.team.map(mon => [mon.id, mon.hp, mon.stats]));
  assert.equal(regular.difficulty, 'normal');
  assert.deepEqual(concise(regular), concise(explicit));
  assert.throws(() => new KantoGame().start({difficulty: 'impossible', team: [{id: 1}]}), /难度/);
});

test('model receives only legal move/switch candidates and may submit one validated enemy choice', () => {
  const {game, current, battle} = gameAt('ai');
  const candidates = game.enemyChoiceCandidates(current.id);
  assert.deepEqual(candidates.options, getEnemyChoiceCandidates(battle));
  assert.ok(candidates.options.includes('move 4'));
  assert.equal(candidates.summary.candidates.length, candidates.options.length);
  const next = game.act({battleId: current.id, choice: 'move 1', enemyChoice: 'move 4'});
  assert.equal(next.turn, current.turn + 1);
  assert.deepEqual(next.lastOpponentDecision, {choice: 'move 4', source: 'host-ai', fallbackReason: ''});
  assert.equal(next.aiFallbackCount, 0);
});

test('AI without a valid host choice clearly falls back to expert without adding a turn', () => {
  for (const enemyChoice of [undefined, 'move 99']) {
    const {game, current} = gameAt('ai');
    const legal = game.enemyChoiceCandidates(current.id).options;
    const next = game.act({battleId: current.id, choice: 'move 1', enemyChoice});
    assert.ok(next.turn >= current.turn && next.turn <= current.turn + 1);
    assert.equal(next.aiFallbackCount, 1);
    assert.equal(next.lastOpponentDecision.source, 'expert-fallback');
    assert.match(next.lastOpponentDecision.fallbackReason, /回退极难策略/);
    assert.ok(next.events.some(event => /AI对手模型决策不可用/.test(String(event))));
    assert.ok(legal.includes(next.lastOpponentDecision.choice));
  }
});

test('Hell summaries alone include bounded current player input; every local difficulty chooses a legal action', () => {
  const {battle} = gameAt('hell');
  const normalSummary = getEnemyDecisionSummary(battle, {difficulty: 'normal', playerInput: '秘密输入'});
  const hellSummary = getEnemyDecisionSummary(battle, {difficulty: 'hell', playerInput: '切换小火龙'.repeat(100)});
  assert.equal(Object.hasOwn(normalSummary, 'playerInput'), false);
  assert.equal(hellSummary.playerInput.length, 500);
  for (const difficulty of DIFFICULTIES.filter(level => level !== 'ai')) {
    const selected = chooseEnemyChoice(battle, {difficulty, playerInput: '切换小火龙', rng: () => 0.2});
    assert.ok(getEnemyChoiceCandidates(battle).includes(selected.choice), `${difficulty}: ${selected.choice}`);
    assert.equal(selected.fallbackReason, '');
  }
});
