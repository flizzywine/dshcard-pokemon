'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const services = require('../kanto-field-services.cjs');
const mvu = require('../mvu.cjs');

function fresh(nodeId = 'route11') {
  const variables = mvu.createInitialMvu(1), world = variables.stat_data.宝可梦;
  world.剧情.初始御三家已选 = true;
  world.地图.节点 = nodeId; world.地图.地点 = nodeId;
  world.战斗 = {轮次: world.地图.轮次, 状态: 'finished', 结果: '', 摘要: '', 操作序号: 0};
  services.ensure(world);
  return world;
}
function vars(world) { return {stat_data: {宝可梦: world}}; }
function at(world, id) { world.地图.节点 = id; world.地图.地点 = id; }
function setFlag(world, id) { world.剧情.关都事件 ||= {}; world.剧情.关都事件.标记 ||= {}; world.剧情.关都事件.标记[id] = true; }
function setTurn(world, turn, result) { world.战斗 = {...world.战斗, 状态: 'finished', 结果: result, 轮次: turn}; }

test('ensure repairs the field-service record and validate accepts wrapped or raw worlds', () => {
  const world = fresh(); delete world.剧情.场地服务;
  assert.equal(services.ensure(world), world);
  assert.deepEqual(world.剧情.场地服务, {claimed: {}, cleared: {}, fossils: {}, giftChosen: null});
  assert.equal(services.validate(world), true);
  assert.equal(services.validate(vars(world)), true);
  world.剧情.场地服务.giftChosen = 999;
  assert.throws(() => services.validate(world), /礼物选择/);
});

test('Route 11 Itemfinder requires 30 caught species, grants once, and leaves source untouched', () => {
  const world = fresh();
  assert.ok(services.options(world).some(entry => entry.id === 'field-claim-itemfinder' && !entry.enabled));
  world.统计.捕获图鉴 = Array.from({length: 30}, (_, i) => i + 1);
  const next = services.apply(world, 'field-claim-itemfinder', {item: 'itemfinder'});
  assert.ok(next.背包.关键物品.includes('itemfinder'));
  assert.equal(next.剧情.场地服务.claimed.itemfinder, true);
  assert.equal(world.背包.关键物品.includes('itemfinder'), false);
  assert.ok(!services.options(next).some(entry => entry.id === 'field-claim-itemfinder'));
  assert.throws(() => services.apply(next, 'field-claim-itemfinder', {id: 'itemfinder'}), /只能领取一次/);
});

test('Snorlax clears only after a won or caught battle; each route has separate leftovers', () => {
  for (const nodeId of ['route12', 'route16']) {
    let world = fresh(nodeId); world.背包.关键物品.push('itemfinder'); setFlag(world, 'pokeflute');
    const started = services.apply(world, 'field-awaken-snorlax', {id: nodeId});
    assert.equal(mvu.validateMvu(vars(started)), true);
    assert.equal(started.遭遇.类型, 'wild'); assert.equal(started.遭遇.队伍[0].图鉴编号, 143); assert.equal(started.遭遇.队伍[0].等级, 30);
    assert.equal(started.遭遇.fieldEvent, `snorlax:${nodeId}`); assert.equal(started.地图.轮次, world.地图.轮次 + 1);
    setTurn(started, started.战斗.轮次, 'lose'); services.onBattleEnd(started);
    assert.equal(started.剧情.场地服务.cleared[`snorlax:${nodeId}`], undefined);
    setTurn(started, started.战斗.轮次, 'caught'); services.onBattleEnd(started);
    assert.equal(started.剧情.场地服务.cleared[`snorlax:${nodeId}`], true);
    assert.ok(services.options(started).some(entry => entry.id === 'field-search-itemfinder' && entry.payload.item === 'leftovers'));
    const found = services.apply(started, 'field-search-itemfinder', {item: 'leftovers'});
    assert.equal(found.背包.物品.leftovers, 1);
    assert.equal(found.剧情.场地服务.claimed[`leftovers:${nodeId}`], true);
    assert.throws(() => services.apply(found, 'field-search-itemfinder', {item: 'leftovers'}), /只能领取一次/);
  }
});

test('hidden-service finds require Itemfinder and protect inventory caps atomically', () => {
  let world = fresh('pokemon-tower'); world.背包.关键物品.push('itemfinder'); setFlag(world, 'fujiRescued');
  world.背包.物品.soothebell = 999;
  assert.throws(() => services.apply(world, 'field-search-itemfinder', {item: 'soothebell'}), /数量上限/);
  assert.equal(world.剧情.场地服务.claimed.soothebell, undefined);
  world.背包.物品.soothebell = 0;
  world = services.apply(world, 'field-search-itemfinder', {item: 'soothebell'});
  assert.equal(world.背包.物品.soothebell, 1);
  at(world, 'viridian'); world.训练家.徽章 = ['岩石徽章', '蓝色徽章', '橙色徽章', '彩虹徽章', '粉红徽章', '金色徽章', '深红徽章', '绿色徽章'];
  assert.equal(services.apply(world, 'field-search-itemfinder', {id: 'machobrace'}).背包.物品.machobrace, 1);
});

test('Pewter Old Amber requires Cut and Cascade Badge and is one time', () => {
  const world = fresh('pewter');
  world.训练家.徽章 = ['蓝色徽章'];
  world.队伍[0].招式.push({id: 'cut', PP: 30, PP上限: 30});
  const next = services.apply(world, 'field-claim-oldamber', {item: 'oldamber'});
  assert.equal(mvu.validateMvu(vars(next)), true);
  assert.ok(next.背包.关键物品.includes('oldamber'));
  assert.equal(next.剧情.场地服务.claimed.oldamber, true);
  assert.throws(() => services.apply(next, 'field-claim-oldamber', {item: 'oldamber'}), /只能领取一次/);
});

test('Mt Moon researcher win permits one fossil choice; Cinnabar consumes it and waits a story turn', () => {
  let world = fresh('mt-moon');
  const battle = services.apply(world, 'field-challenge-fossil-researcher');
  assert.deepEqual(battle.遭遇.队伍.map(mon => [mon.图鉴编号, mon.等级]), [[88, 12], [100, 12], [109, 12]]);
  assert.equal(battle.遭遇.fieldEvent, 'fossil-researcher');
  setTurn(battle, battle.战斗.轮次, 'win'); services.onBattleEnd(battle);
  assert.equal(battle.剧情.场地服务.cleared['fossil-researcher'], true);
  world = services.apply(battle, 'field-choose-fossil', {item: 'helixfossil'});
  assert.equal(mvu.validateMvu(vars(world)), true);
  assert.ok(world.背包.关键物品.includes('helixfossil'));
  assert.throws(() => services.apply(world, 'field-choose-fossil', {item: 'domefossil'}), /只能选择/);
  at(world, 'cinnabar');
  const revivedState = services.apply(world, 'field-revive-fossil', {item: 'helixfossil'}, {storyTurn: 20});
  assert.ok(!revivedState.背包.关键物品.includes('helixfossil'));
  assert.throws(() => services.apply(revivedState, 'field-claim-revived-fossil', {item: 'helixfossil'}, {storyTurn: 20}), /下一故事轮/);
  const claimed = services.apply(revivedState, 'field-claim-revived-fossil', {item: 'helixfossil'}, {storyTurn: 21});
  assert.equal(mvu.validateMvu(vars(claimed)), true);
  assert.equal(claimed.队伍.at(-1).图鉴编号, 138); assert.equal(claimed.队伍.at(-1).等级, 5);
  assert.equal(claimed.剧情.场地服务.fossils.revived.helixfossil, true);
});

test('fossil claim routes to PC and rejects a full PC without consuming the pending claim', () => {
  const world = fresh('cinnabar');
  world.队伍 = Array.from({length: 6}, (_, i) => mvu.makeMon(1, 5, `full-party-${i}`));
  world.电脑 = Array.from({length: 420}, (_, i) => mvu.makeMon(4, 5, `full-box-${i}`));
  world.剧情.场地服务.fossils.pending = {oldamber: {speciesId: 142, readyAt: 9}};
  assert.throws(() => services.apply(world, 'field-claim-revived-fossil', {item: 'oldamber'}, {storyTurn: 9}), /容量已达420/);
  assert.equal(world.剧情.场地服务.fossils.pending.oldamber.speciesId, 142);
  world.电脑.pop();
  const next = services.apply(world, 'field-claim-revived-fossil', {item: 'oldamber'}, {storyTurn: 9});
  assert.equal(mvu.validateMvu(vars(next)), true);
  assert.equal(next.电脑.length, 420); assert.equal(next.电脑.at(-1).图鉴编号, 142);
});

test('Saffron Dojo requires a conscious partner and offers one level-25 gift after victory', () => {
  let world = fresh('saffron');
  for (const mon of world.队伍) mon.当前HP = 0;
  assert.throws(() => services.apply(world, 'field-challenge-dojo'), /未倒下/);
  world.队伍[0].当前HP = 1;
  const battle = services.apply(world, 'field-challenge-dojo');
  assert.deepEqual(battle.遭遇.队伍.map(mon => [mon.图鉴编号, mon.等级]), [[106, 37], [107, 37]]);
  assert.equal(battle.遭遇.fieldEvent, 'dojo');
  setTurn(battle, battle.战斗.轮次, 'win'); services.onBattleEnd(battle);
  const next = services.apply(battle, 'field-choose-dojo-gift', {id: 107});
  assert.equal(mvu.validateMvu(vars(next)), true);
  assert.equal(next.剧情.场地服务.giftChosen, 107);
  assert.equal(next.队伍.at(-1).图鉴编号, 107); assert.equal(next.队伍.at(-1).等级, 25);
  assert.throws(() => services.apply(next, 'field-choose-dojo-gift', {id: 106}), /只能选择一只/);
});

test('all battle-start and reward actions are blocked while a battle is active', () => {
  const world = fresh('mt-moon'); world.战斗.状态 = 'active';
  assert.ok(services.options(world).every(entry => !entry.enabled));
  assert.throws(() => services.apply(world, 'field-challenge-fossil-researcher'), /先结束当前遭遇/);
});

