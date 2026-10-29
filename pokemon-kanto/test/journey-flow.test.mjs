import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { apply, name as pluginName } from '../index.mjs';

const require = createRequire(import.meta.url);
const mvu = require('../mvu.cjs');
const clone = value => structuredClone(value);

function mockTavern({ turn = 2, textVersion = 'story-2' } = {}) {
  const routes = new Map(), storage = new Map(), callbacks = {};
  const host = {
    head: { gameId: 'journey-test', turn, textVersion, settled: true, busy: false },
    variables: {}, writes: 0, saves: 0,
    async call(route, body = {}) {
      const fn = routes.get(`${pluginName}/${route}`);
      assert.ok(fn, `route registered: ${route}`);
      return fn({ ...body, gameId: 'journey-test' });
    },
    async settle(input = '', text = '开场完成。') {
      this.input = input; this.storyText = text;
      return callbacks.settled({ ...this.head, variables: clone(this.variables), text });
    },
    restart() { apply({ tavern: this.T }); },
  };
  host.T = {
    apiVersion: 3,
    handle(route, fn) { routes.set(route, fn); },
    async getTurnState({ gameId }) { assert.equal(gameId, host.head.gameId); return { ...host.head }; },
    async getTurn({ gameId, turn: requestedTurn }) {
      assert.equal(gameId, host.head.gameId);
      return requestedTurn === host.head.turn
        ? { turn: requestedTurn, textVersion: host.head.textVersion, variables: clone(host.variables) }
        : null;
    },
    async getHistory({ gameId, from, to }) {
      assert.equal(gameId, host.head.gameId);
      return from === to ? [{ turn: from, input: host.input || '', text: host.storyText || '开场完成。' }] : [];
    },
    async setVariables({ gameId, turn: writeTurn, textVersion: writeVersion, variables }) {
      assert.equal(gameId, host.head.gameId);
      if (writeTurn !== host.head.turn || writeVersion !== host.head.textVersion) throw Object.assign(Error('stale'), { code: 'STALE_TURN' });
      host.variables = clone(variables); host.writes++;
      return { turn: writeTurn, textVersion: writeVersion };
    },
    async saveTurnData({ gameId, turn: saveTurn, textVersion: saveVersion, data }) {
      assert.equal(gameId, host.head.gameId);
      if (saveTurn !== host.head.turn || saveVersion !== host.head.textVersion) throw Object.assign(Error('stale'), { code: 'STALE_TURN' });
      storage.set(saveTurn, { turn: saveTurn, textVersion: saveVersion, data: clone(data) }); host.saves++;
      return { turn: saveTurn, textVersion: saveVersion };
    },
    async readTurnData({ turn: requestedTurn }) {
      const entry = [...storage.values()].filter(item => item.turn <= requestedTurn).sort((a, b) => b.turn - a.turn)[0];
      return clone(entry || null);
    },
    onTurnSettled(fn) { callbacks.settled = fn; },
    onTimelineChanged(fn) { callbacks.timeline = fn; },
    onGameRemoved(fn) { callbacks.removed = fn; },
  };
  host.storage = storage;
  host.callbacks = callbacks;
  apply({ tavern: host.T });
  return host;
}

function headArgs(host) { return { turn: host.head.turn, textVersion: host.head.textVersion }; }
function world(host) { return host.variables.stat_data['宝可梦']; }

test('a real-host journey wins the opening battle once, resumes by seq, then heals, shops, catches, and evolves', async () => {
  const host = mockTavern();
  await host.settle();
  assert.equal(world(host).遭遇.训练家, '小茂');
  assert.equal(world(host).战斗.状态, 'pending');

  const chosen = await host.call('starter', { id: 4, ...headArgs(host) });
  assert.equal(chosen.world.队伍[0].图鉴编号, 4);
  assert.equal(chosen.world.剧情.初始御三家已选, true);

  // Keep the true routed flow, while reducing battle duration so this test can
  // exercise persistence and rewards deterministically rather than looping AI.
  let setup = clone(host.variables), w = setup.stat_data['宝可梦'];
  w.训练家.徽章 = ['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章','深红徽章','绿色徽章'];
  w.训练家.金钱 = 5000; // Keep the shop/restart flow funded independently of the prize formula.
  const player = w.队伍[0], rival = w.遭遇.队伍[0];
  player.等级 = 50; player.经验 = mvu.expAt(50, player.图鉴编号);
  player.招式 = [
    { id: 'growl', PP: 40, PP上限: 40 },
    { id: 'flamethrower', PP: 15, PP上限: 15 },
  ];
  rival.等级 = 20; rival.经验 = mvu.expAt(20, rival.图鉴编号);
  rival.招式 = [{ id: 'tackle', PP: 35, PP上限: 35 }];
  setup = mvu.recalculateDerived(setup); w = setup.stat_data['宝可梦'];
  w.队伍[0].当前HP = w.队伍[0].能力值.hp - 10;
  mvu.validateMvu(setup);
  await host.T.setVariables({ gameId: host.head.gameId, ...headArgs(host), variables: setup });

  const opened = await host.call('battle', headArgs(host));
  assert.equal(opened.mode, 'practice');
  assert.equal(world(host).战斗.状态, 'active');
  const initialSeq = opened.seq;
  assert.equal(initialSeq, 0);
  const during = await host.call('mvu');
  assert.equal(during.battle.id, opened.id);
  assert.equal(during.battle.seq, initialSeq);

  // Potion is a player action: the opponent gets to act and the battle advances.
  const healedAction = await host.call('action', {
    battleId: opened.id, choice: 'item potion', seq: initialSeq, ...headArgs(host),
  });
  assert.equal(healedAction.seq, 1);
  assert.ok(healedAction.turn > opened.turn);
  assert.equal(world(host).背包.物品.potion, 2);

  // Simulate a process restart between turns. A stale duplicate must fail, while
  // the persisted snapshot and current sequence resume the same battle.
  host.restart();
  const resumed = await host.call('state');
  assert.equal(resumed.battle.id, opened.id);
  assert.equal(resumed.seq, 1);
  await assert.rejects(host.call('action', {
    battleId: opened.id, choice: 'move 1', seq: 0, ...headArgs(host),
  }), error => error.code === 'STALE_ACTION');
  const secondBattleOpen = await host.call('battle', headArgs(host));
  assert.equal(secondBattleOpen.id, opened.id);
  assert.equal(secondBattleOpen.seq, 1, 're-entering the active battle neither restarts it nor resets sequence');

  const middleRound = await host.call('action', {
    battleId: opened.id, choice: 'move 1', seq: resumed.seq, ...headArgs(host),
  });
  assert.equal(middleRound.ended, false, 'the first legal move leaves the encounter active');
  assert.equal(middleRound.seq, 2);
  host.restart();
  const resumedAgain = await host.call('state');
  assert.equal(resumedAgain.battle.id, opened.id);
  assert.equal(resumedAgain.seq, 2);
  await assert.rejects(host.call('action', {
    battleId: opened.id, choice: 'move 2', seq: 1, ...headArgs(host),
  }), error => error.code === 'STALE_ACTION');

  const beforeBattle = clone(world(host));
  const finished = await host.call('action', {
    battleId: opened.id, choice: 'move 2', seq: resumedAgain.seq, ...headArgs(host),
  });
  assert.equal(finished.ended, true);
  assert.ok(finished.turn >= opened.turn + 2, 'at least two battle rounds have elapsed');
  assert.equal(world(host).战斗.结果, 'win', 'the authoritative MVU keeps the actual battle outcome');
  assert.equal(world(host).战斗.状态, 'finished');
  assert.equal(world(host).战斗.已奖励, true);
  assert.equal(world(host).训练家.金钱, beforeBattle.训练家.金钱 + 320, 'this fixture raises the final rival to level 20: 4 × 20 × Rival Early 4');
  assert.ok(world(host).队伍[0].经验 > beforeBattle.队伍[0].经验);
  assert.equal(world(host).背包.物品.potion, 3, 'the action consumed one potion and the trainer win supplied exactly one');

  const moneyAfterWin = world(host).训练家.金钱;
  const expAfterWin = world(host).队伍[0].经验;
  const rewardsAfterWin = clone(world(host).战斗.奖励);
  const repeatedBattle = await host.call('battle', headArgs(host));
  assert.equal(repeatedBattle.id, opened.id);
  assert.equal(repeatedBattle.ended, true);
  assert.equal(world(host).训练家.金钱, moneyAfterWin);
  assert.equal(world(host).队伍[0].经验, expAfterWin);
  assert.deepEqual(world(host).战斗.奖励, rewardsAfterWin, 'battle rewards are persisted in MVU and are not recomputed by reopening the simulator');
  await assert.rejects(host.call('report', { battleId: opened.id }), /report/);

  // A finished simulator may no longer overwrite post-battle MVU edits.
  await host.call('heal', headArgs(host));
  assert.ok(world(host).队伍.every(mon => mon.当前HP === mon.能力值.hp));
  const shopState = clone(host.variables), shopWorld = shopState.stat_data['宝可梦'];
  shopWorld.地图.节点 = 'celadon'; shopWorld.地图.地点 = '玉虹市';
  await host.T.setVariables({ gameId: host.head.gameId, ...headArgs(host), variables: shopState });
  const boughtBall = await host.call('shop', { item: 'ultraball', count: 1, ...headArgs(host) });
  assert.equal(boughtBall.world.背包.物品.ultraball, 1);
  await host.call('shop', { item: 'oranberry', count: 1, ...headArgs(host) });
  await host.call('shop', { item: 'thunderstone', count: 1, ...headArgs(host) });
  assert.equal(world(host).战斗.状态, 'finished');
  host.restart();
  const afterRestart = await host.call('mvu');
  assert.equal(afterRestart.world.背包.物品.ultraball, 1);
  assert.equal(afterRestart.world.背包.物品.oranberry, 1);
  assert.equal(afterRestart.world.背包.物品.thunderstone, 1);
  assert.equal(afterRestart.world.训练家.金钱, moneyAfterWin - 1200 - 200 - 2100);
  assert.equal(afterRestart.world.战斗.状态, 'finished');

  const travelState = clone(host.variables), travelWorld = travelState.stat_data['宝可梦'];
  travelWorld.地图.节点 = 'viridian'; travelWorld.地图.地点 = '常青市';
  await host.T.setVariables({ gameId: host.head.gameId, ...headArgs(host), variables: travelState });
  await host.call('travel', { node: 'route1', ...headArgs(host) });
  const explored = await host.call('scene', { action: 'explore', ...headArgs(host) });
  assert.equal(explored.world.遭遇.类型, 'wild');
  assert.equal(explored.world.战斗.状态, 'pending');
  // Fix the species/condition, not the battle outcome: this makes the Gen III
  // catch-rate and the later Thunder Stone evolution both deterministic facts.
  let wild = clone(host.variables); w = wild.stat_data['宝可梦'];
  w.遭遇.队伍 = [mvu.makeMon(25, 5, 'journey-pikachu')];
  w.遭遇.队伍[0].当前HP = 1;
  w.遭遇.队伍[0].状态 = 'slp';
  mvu.validateMvu(wild);
  await host.T.setVariables({ gameId: host.head.gameId, ...headArgs(host), variables: wild });
  const wildBattle = await host.call('battle', headArgs(host));
  assert.equal(wildBattle.mode, 'wild');
  assert.equal(wildBattle.bag.ultraball, 1);
  const caught = await host.call('action', {
    battleId: wildBattle.id, choice: 'capture ultraball', seq: wildBattle.seq, ...headArgs(host),
  });
  assert.equal(caught.ended, true);
  assert.equal(caught.caught.id, 25);
  const captured = world(host).队伍.find(mon => mon.uid === `caught-${wildBattle.id}`);
  assert.ok(captured);
  assert.equal(captured.收服来源, 'wild');
  assert.equal(world(host).统计.捕获次数, 1);
  assert.equal(world(host).背包.物品.ultraball, 0);
  assert.equal(world(host).背包.物品.pokeball, 5, 'capturing with an ultraball does not mint extra balls');

  const forgotten = await host.call('party', { operation: 'forget', uid: captured.uid, slot: 1, ...headArgs(host) });
  assert.equal(forgotten.world.队伍.find(mon => mon.uid === captured.uid).招式.length, 1);
  const held = await host.call('party', { operation: 'hold', uid: captured.uid, itemId: 'oranberry', ...headArgs(host) });
  assert.equal(held.world.队伍.find(mon => mon.uid === captured.uid).携带道具, 'oranberry');
  assert.equal(held.world.背包.物品.oranberry, 0);
  const evolved = await host.call('party', { operation: 'evolve', uid: captured.uid, itemId: 'thunderstone', ...headArgs(host) });
  const raichu = evolved.world.队伍.find(mon => mon.uid === captured.uid);
  assert.equal(raichu.图鉴编号, 26);
  assert.equal(raichu.携带道具, 'oranberry');
  assert.equal(evolved.world.背包.物品.thunderstone, 0);
  assert.equal(evolved.world.统计.捕获次数, 1);
  assert.equal(evolved.world.任务.find(task => task.id === 'catch-pokemon').状态, '已完成');
});

test('same-turn scene exploration enters its pending battle, then a distinct trainer encounter rewards once', async () => {
  const host = mockTavern();
  let modelCalls = 0;
  host.T.backgroundModel = async () => { modelCalls++; return { id: 'summary-model' }; };
  host.T.runTask = async () => { modelCalls++; return { text: 'unrequested summary' }; };
  const initial = mvu.createInitialMvu(), initialWorld = initial.stat_data['宝可梦'];
  initialWorld.剧情.初始御三家已选 = true;
  initialWorld.地图.节点 = 'route1'; initialWorld.地图.地点 = '1号道路'; initialWorld.地图.轮次 = 1;
  initialWorld.队伍 = [mvu.makeMon(6, 30, 'serial-battle-charizard')];
  initialWorld.队伍[0].招式 = [{ id: 'flamethrower', PP: 15, PP上限: 15 }];
  initialWorld.战斗 = { 轮次: 1, 状态: 'finished', 结果: '', 操作序号: 0, 奖励: { 经验: [], 金币: 0, 物品: [], 徽章: [] } };
  initialWorld.遭遇 = null;
  mvu.recalculateDerived(initial); mvu.validateMvu(initial);
  await host.T.setVariables({ gameId: host.head.gameId, ...headArgs(host), variables: initial });

  const scene = await host.call('scene', { action: 'explore', ...headArgs(host) });
  assert.equal(scene.world.遭遇.类型, 'wild');
  assert.equal(scene.world.战斗.状态, 'pending');
  // Pin a weak foe after the real encounter was created so the outcome is
  // deterministic while still exercising the native battle engine and writes.
  let fixture = clone(host.variables), fixtureWorld = fixture.stat_data['宝可梦'];
  fixtureWorld.遭遇.队伍 = [mvu.makeMon(10, 20, 'serial-battle-caterpie')];
  mvu.recalculateDerived(fixture); mvu.validateMvu(fixture);
  await host.T.setVariables({ gameId: host.head.gameId, ...headArgs(host), variables: fixture });
  const first = await host.call('enter-battle', headArgs(host));
  assert.equal(first.world.战斗.状态, 'active');
  assert.equal(first.world.遭遇.队伍[0].uid, 'serial-battle-caterpie');
  const firstId = first.battleId;
  const firstResult = await host.call('action', {
    battleId: firstId, choice: 'move 1', seq: first.seq, ...headArgs(host),
  });
  assert.equal(firstResult.ended, true);
  assert.equal(world(host).战斗.结果, 'win');
  const firstMoney = world(host).训练家.金钱;
  const firstRewards = clone(world(host).战斗.奖励);

  await assert.rejects(host.call('enter-battle', headArgs(host)), error => error.code === 'NO_PENDING_ENCOUNTER',
    'the old story entry cannot revive a rewarded battle');
  assert.equal(world(host).训练家.金钱, firstMoney);

  const next = await host.call('scene', { action: 'trainer-battle', trainerName: '捕虫少年', ...headArgs(host) });
  assert.equal(next.world.遭遇.类型, 'trainer');
  assert.equal(next.world.遭遇.训练家, '捕虫少年');
  assert.equal(next.world.战斗.状态, 'pending');
  fixture = clone(host.variables); fixtureWorld = fixture.stat_data['宝可梦'];
  fixtureWorld.遭遇.队伍 = [mvu.makeMon(10, 20, 'serial-battle-caterpie-2')];
  mvu.recalculateDerived(fixture); mvu.validateMvu(fixture);
  await host.T.setVariables({ gameId: host.head.gameId, ...headArgs(host), variables: fixture });
  const second = await host.call('enter-battle', headArgs(host));
  const secondId = second.battleId;
  assert.notEqual(secondId, firstId);
  assert.equal(second.world.战斗.状态, 'active');
  let final;
  for (let guard = 0, seq = second.seq; guard < 4; guard++, seq++) {
    if(final?.ended)break;
    final = await host.call('action', {
      battleId: secondId, choice: 'move 1', seq, ...headArgs(host),
    });
  }
  assert.equal(final.ended, true);
  assert.equal(world(host).战斗.结果, 'win');
  assert.ok(world(host).训练家.金钱 > firstMoney, 'second victory adds its own prize money');
  assert.ok(world(host).队伍[0].招式[0].PP < 15, 'real battle actions consume party move PP');
  assert.notDeepEqual(world(host).战斗.奖励, firstRewards);

  await assert.rejects(host.call('report', { battleId: firstId }), /report/);
  await assert.rejects(host.call('report', { battleId: secondId }), /report/);
  assert.equal(modelCalls, 0, 'the complete two-battle flow makes no model or summary request');
  assert.equal(host.input || '', '', 'battle entry and actions do not submit a new player input');
});

test('an explicit species in a one-line travel-and-wild input is preserved by the real host settlement', async () => {
  const host = mockTavern();
  const vars = mvu.createInitialMvu(), initialWorld = vars.stat_data['宝可梦'];
  initialWorld.剧情.初始御三家已选 = true;
  initialWorld.队伍 = [mvu.makeMon(4, 5, 'scripted-pikachu-starter')];
  initialWorld.地图.节点 = 'route1'; initialWorld.地图.地点 = '1号道路';
  initialWorld.战斗 = { 轮次: 1, 状态: 'finished', 结果: '', 操作序号: 0, 奖励: { 经验: [], 金币: 0, 物品: [], 徽章: [] } };
  initialWorld.遭遇 = null;
  mvu.recalculateDerived(vars); mvu.validateMvu(vars);
  await host.T.setVariables({ gameId: host.head.gameId, ...headArgs(host), variables: vars });
  await host.settle('我带着伙伴去常青森林遇到皮卡丘', '我带着伙伴去常青森林，草丛里出现皮卡丘。');
  const settled = world(host);
  assert.equal(settled.地图.节点, 'viridian-forest');
  assert.equal(settled.遭遇.类型, 'wild');
  assert.equal(settled.遭遇.队伍[0].图鉴编号, 25, 'a named species is not replaced by the location table');
  assert.equal(settled.战斗.状态, 'pending');
});

test('capturing or fleeing a real wild encounter allows a distinct trainer battle in the same host turn', async t => {
  for (const outcome of ['capture', 'escape']) await t.test(outcome, async () => {
    const host = mockTavern();
    const vars = mvu.createInitialMvu(), initialWorld = vars.stat_data['宝可梦'];
    initialWorld.剧情.初始御三家已选 = true;
    initialWorld.地图.节点 = 'route1'; initialWorld.地图.地点 = '1号道路';
    initialWorld.队伍 = [mvu.makeMon(6, 30, `serial-${outcome}-charizard`)];
    initialWorld.队伍[0].招式 = [{ id: 'flamethrower', PP: 15, PP上限: 15 }];
    initialWorld.队伍[0].携带道具 = outcome === 'escape' ? 'smokeball' : '';
    initialWorld.背包.物品.ultraball = 1;
    initialWorld.战斗 = { 轮次: 1, 状态: 'finished', 结果: '', 操作序号: 0, 奖励: { 经验: [], 金币: 0, 物品: [], 徽章: [] } };
    initialWorld.遭遇 = null;
    mvu.recalculateDerived(vars); mvu.validateMvu(vars);
    await host.T.setVariables({ gameId: host.head.gameId, ...headArgs(host), variables: vars });
    await host.call('scene', { action: 'wild', payload: { speciesId: 25, scripted: true }, ...headArgs(host) });
    let fixture = clone(host.variables), worldState = fixture.stat_data['宝可梦'];
    worldState.遭遇.队伍 = [mvu.makeMon(25, 5, `serial-${outcome}-pikachu`)];
    worldState.遭遇.队伍[0].当前HP = 1; worldState.遭遇.队伍[0].状态 = 'slp';
    mvu.recalculateDerived(fixture); mvu.validateMvu(fixture);
    await host.T.setVariables({ gameId: host.head.gameId, ...headArgs(host), variables: fixture });
    const wild = await host.call('enter-battle', headArgs(host));
    const result = await host.call('action', {
      battleId: wild.battleId,
      choice: outcome === 'capture' ? 'capture ultraball' : 'run',
      seq: wild.seq, ...headArgs(host),
    });
    assert.equal(result.ended, true);
    assert.equal(world(host).战斗.结果, outcome === 'capture' ? 'caught' : 'escaped');
    if (outcome === 'capture') assert.equal(world(host).统计.捕获次数, 1);

    const next = await host.call('scene', { action: 'trainer-battle', trainerName: '训练家', ...headArgs(host) });
    assert.equal(next.world.战斗.状态, 'pending');
    const trainer = await host.call('enter-battle', headArgs(host));
    assert.notEqual(trainer.battleId, wild.battleId);
    assert.equal(trainer.world.战斗.状态, 'active');
  });
});

test('a rejected native scene write leaves no stale encounter that can be entered', async () => {
  const host = mockTavern(), vars = mvu.createInitialMvu(), worldState = vars.stat_data['宝可梦'];
  worldState.剧情.初始御三家已选 = true;
  worldState.地图.节点 = 'route1'; worldState.地图.地点 = '1号道路';
  worldState.队伍 = [mvu.makeMon(4, 5, 'scene-rollback-starter')];
  worldState.战斗 = { 轮次: 1, 状态: 'finished', 结果: '', 操作序号: 0, 奖励: { 经验: [], 金币: 0, 物品: [], 徽章: [] } };
  worldState.遭遇 = null;
  mvu.recalculateDerived(vars); mvu.validateMvu(vars);
  await host.T.setVariables({ gameId: host.head.gameId, ...headArgs(host), variables: vars });
  const before = clone(host.variables), setVariables = host.T.setVariables.bind(host.T);
  let reject = true;
  host.T.setVariables = async args => {
    if (reject) { reject = false; throw Object.assign(Error('simulated host write rejection'), { code: 'WRITE_REJECTED' }); }
    return setVariables(args);
  };
  await assert.rejects(host.call('scene', { action: 'explore', ...headArgs(host) }), error => error.code === 'WRITE_REJECTED');
  assert.deepEqual(host.variables, before, 'the failed scene transaction did not partially persist an encounter');
  await assert.rejects(host.call('enter-battle', headArgs(host)), error => error.code === 'NO_PENDING_ENCOUNTER');
  const committed = await host.call('scene', { action: 'explore', ...headArgs(host) });
  assert.equal(committed.world.战斗.状态, 'pending', 'a later successful write creates the encounter exactly once');
});
