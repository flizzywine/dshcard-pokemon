'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mvu = require('../mvu.cjs');
const { KantoGame } = require('../engine.cjs');
const root = variables => variables.stat_data.宝可梦;

function lostTo(encounter) {
  const variables = mvu.createInitialMvu(), world = root(variables);
  world.剧情.初始御三家已选 = true;
  world.遭遇 = encounter;
  world.战斗.状态 = 'pending'; world.战斗.轮次 = 1;
  const game = new KantoGame(), snapshot = mvu.startFromMvu(game, variables), record = game.battles.get(snapshot.id);
  for (const mon of record.battle.p1.pokemon) { mon.fainted = true; mon.hp = 0; }
  record.battle.win('p2');
  return mvu.applyBattleResult(variables, record);
}

test('a lost battle can be retried from the start against the same opponent', () => {
  const lost = lostTo({ 类型:'trainer', 训练家:'小茂', 队伍:[mvu.makeMon(7, 5, 'rival-1')] }), before = root(lost);
  assert.equal(before.战斗.结果, 'lose');
  before.遭遇.队伍[0].当前HP = 3;
  const next = mvu.retryLostBattle(lost, before.战斗.最近战斗ID), world = root(next);
  assert.equal(world.战斗.状态, 'pending');
  assert.equal(world.战斗.结果, '');
  assert.equal(world.战斗.轮次, before.地图.轮次 + 1, 'a new round, so the ended battle record is not resumed');
  assert.equal(world.遭遇.训练家, '小茂');
  assert.equal(world.遭遇.队伍[0].当前HP, world.遭遇.队伍[0].能力值.hp);
  assert.ok(world.队伍.every(mon => mon.当前HP === mon.能力值.hp && mon.状态 === ''));
  assert.equal(world.训练家.金钱, before.训练家.金钱, 'nothing is charged');
  const game = new KantoGame();
  assert.ok(mvu.startFromMvu(game, next), 'the retried battle starts');
});

test('only a just-lost battle with an ordinary encounter can be retried', () => {
  const lost = lostTo({ 类型:'trainer', 训练家:'小茂', 队伍:[mvu.makeMon(7, 5, 'rival-1')] });
  assert.throws(() => mvu.retryLostBattle(lost, 'another-battle'), /战斗状态已变化/);
  const won = structuredClone(lost); root(won).战斗.结果 = 'win';
  assert.throws(() => mvu.retryLostBattle(won), /刚输掉/);
  for (const key of ['specialId', 'storyEventId', 'campaignId', 'hellRematchKey']) {
    const own = structuredClone(lost); root(own).遭遇[key] = 'x';
    assert.equal(mvu.lostBattleRetryable(root(own).遭遇), false);
    assert.throws(() => mvu.retryLostBattle(own), /原来的入口/);
  }
  assert.equal(mvu.lostBattleRetryable({ ...root(lost).遭遇, 联盟:0 }), false);
});
