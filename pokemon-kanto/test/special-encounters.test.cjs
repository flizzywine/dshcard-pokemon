'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mvu = require('../mvu.cjs');
const specials = require('../special-encounters.cjs');

const BADGES = ['岩石徽章', '蓝色徽章', '橙色徽章', '彩虹徽章', '粉红徽章', '金色徽章', '深红徽章', '绿色徽章'];
const root = variables => variables.stat_data['宝可梦'];

function at(node, badgeCount, starterId = 1, firstRival = true) {
  let variables = mvu.createInitialMvu();
  variables = mvu.chooseStarter(variables, starterId);
  const world = root(variables);
  world.剧情.首次击败小茂 = firstRival;
  if (firstRival) world.剧情.已击败训练家 = ['小茂'];
  world.训练家.徽章 = BADGES.slice(0, badgeCount);
  world.地图.节点 = node;
  world.地图.地点 = ({route22: '22号道路', route24: '24号道路', celadon: '玉虹市', saffron: '金黄市'})[node];
  world.地图.轮次 = 10;
  world.战斗 = {轮次: 10, 状态: 'finished', 结果: '', 摘要: '', 操作序号: 0, 奖励: {经验: [], 金币: 0, 物品: [], 徽章: []}};
  world.遭遇 = null;
  return mvu.ensureMvuDefaults(variables);
}

function resultRecord(variables, won) {
  const world = root(variables), party = world.队伍[0], encounter = world.遭遇;
  const moves = party.招式.map(move => ({id: move.id, pp: move.PP}));
  return {
    battle: {
      ended: true, winner: won ? '训练家' : 'opponent', turn: 4,
      p1: {name: '训练家', pokemon: [{set: {slotId: party.uid}, hp: party.当前HP, status: party.状态, item: '', baseMoveSlots: moves, moveSlots: moves, transformed: false}]},
      p2: {pokemon: encounter.队伍.map(mon => { const slots = mon.招式.map(move => ({id: move.id, pp: move.PP})); return {set: {slotId: mon.uid}, baseSpecies: {num: mon.图鉴编号}, level: mon.等级, fainted: won, hp: won ? 0 : mon.当前HP, status: '', item: '', baseMoveSlots: slots, moveSlots: slots, transformed: false}; })},
    },
    encounterRound: world.战斗.轮次, bag: mvu.inventoryFromRecord(world.背包.物品), actionSeq: 1,
    rewarded: false, caught: null, escaped: false,
  };
}

test('special encounter gates and party lineups match their Kanto route and badge requirements', () => {
  const specifications = [
    ['route22', 0, 'rival-route22', [16, 4], [9, 9]],
    ['route24', 1, 'rocket-bridge', [41, 23], [15, 17]],
    ['celadon', 3, 'rocket-celadon', [109, 111], [25, 27]],
    ['saffron', 4, 'silph-showdown', [18, 65, 6], [35, 36, 37]],
  ];
  for (const [node, badges, id, species, levels] of specifications) {
    const variables = at(node, badges);
    const option = mvu.worldView(variables).theater.options.find(item => item.id === 'special-battle');
    assert.ok(option?.enabled, `${node} should offer its unlocked side battle`);
    assert.equal(option.payload.encounterId, id);
    const pending = mvu.theaterAction(variables, 'special-battle', {...option.payload, storyTurn: 11});
    const world = root(pending), encounter = world.遭遇;
    assert.equal(encounter.specialId, id);
    assert.equal(encounter.npc, encounter.训练家);
    assert.equal(encounter.title, specials.definitions().find(item => item.id === id).title);
    assert.equal(encounter.theme, ['route22', 'saffron'].includes(node) ? 'rival' : 'rocket');
    assert.deepEqual(encounter.队伍.map(mon => mon.图鉴编号), species);
    assert.deepEqual(encounter.队伍.map(mon => mon.等级), levels);
    assert.equal(world.战斗.状态, 'pending');
  }
  const noBadge = at('route24', 0);
  const locked = mvu.worldView(noBadge).theater.options.find(item => item.id === 'special-battle');
  assert.equal(locked.enabled, false);
  assert.match(locked.reason, /至少1枚徽章/);
  assert.throws(() => mvu.theaterAction(noBadge, 'special-battle', {encounterId: 'rocket-bridge', storyTurn: 11}), /至少1枚徽章/);
  const firstRivalNotWon = at('route22', 0, 1, false);
  assert.equal(mvu.worldView(firstRivalNotWon).theater.options.find(item => item.id === 'special-battle').enabled, false);
  const battleActive = at('route24', 1);
  root(battleActive).战斗.状态 = 'active';
  assert.equal(mvu.worldView(battleActive).theater.options.find(item => item.id === 'special-battle').enabled, false);
  const partyDown = at('route24', 1);
  root(partyDown).队伍.forEach(mon => { mon.当前HP = 0; });
  assert.equal(mvu.worldView(partyDown).theater.options.find(item => item.id === 'special-battle').enabled, false);
});

test('rival counter starter depends on the selected starter family', () => {
  for (const [starter, counter] of [[1, 4], [4, 7], [7, 1]]) {
    const variables = mvu.theaterAction(at('route22', 0, starter), 'special-battle', {encounterId: 'rival-route22', storyTurn: 11});
    assert.equal(root(variables).遭遇.队伍[1].图鉴编号, counter);
    const later = mvu.theaterAction(at('saffron', 4, starter), 'special-battle', {encounterId: 'silph-showdown', storyTurn: 20});
    assert.equal(root(later).遭遇.队伍[2].图鉴编号, counter + 2, 'the later rival brings the evolved starter');
  }
});

test('a defeat can be retried; a real victory records one noncombat souvenir and preserves other progress', () => {
  let variables = at('celadon', 3, 4);
  const world = root(variables), uid = world.队伍[0].uid;
  world.羁绊.伙伴[uid].信赖 = 14;
  world.任务.push({id: 'user-task', 标题: '用户自定义'});
  variables = mvu.theaterAction(variables, 'special-battle', {encounterId: 'rocket-celadon', storyTurn: 11});
  variables = mvu.applyBattleResult(variables, resultRecord(variables, false));
  assert.equal(root(variables).剧情.已完成支线对战.includes('rocket-celadon'), false);
  assert.equal(root(variables).剧情.支线对战纪念品.length, 0);
  root(variables).队伍[0].当前HP = root(variables).队伍[0].能力值.hp;
  variables = mvu.theaterAction(variables, 'special-battle', {encounterId: 'rocket-celadon', storyTurn: 12});
  const beforeMoney = root(variables).训练家.金钱;
  const beforeExp = root(variables).队伍[0].经验;
  const won = resultRecord(variables, true);
  variables = mvu.applyBattleResult(variables, won);
  let after = root(variables);
  assert.ok(after.剧情.已完成支线对战.includes('rocket-celadon'));
  assert.equal(after.剧情.支线对战纪念品.length, 1);
  assert.equal(after.背包.关键物品.filter(item => item.id === 'special-rocket-celadon').length, 1);
  assert.equal(after.剧情.支线剧情线索.filter(item => item.id === 'rocket-celadon').length, 1);
  assert.equal(after.训练家.金钱 - beforeMoney, 4 * after.遭遇.队伍.at(-1).等级 * 8, 'the authored Rocket officer uses Team Rocket class value 8');
  assert.ok(after.队伍[0].经验 > beforeExp, 'only ordinary battle EXP was awarded');
  assert.equal(after.羁绊.伙伴[uid].信赖, 14);
  assert.ok(after.任务.some(item => item.id === 'user-task'));
  assert.match(after.剧情.支线对战纪念品[0].description, /不提供战斗效果/);
  const replayed = mvu.applyBattleResult(variables, won);
  after = root(replayed);
  assert.equal(after.剧情.支线对战纪念品.length, 1);
  assert.equal(after.训练家.金钱, root(variables).训练家.金钱);
  assert.equal(after.背包.关键物品.filter(item => item.id === 'special-rocket-celadon').length, 1);
  assert.throws(() => mvu.theaterAction(replayed, 'special-battle', {encounterId: 'rocket-celadon', storyTurn: 13}), /已经获胜/);
  assert.equal(mvu.validateMvu(replayed), true);
});

test('the later Silph rematch does not masquerade as the player’s first rival victory', () => {
  let variables = at('saffron', 4, 7, false);
  variables = mvu.theaterAction(variables, 'special-battle', {encounterId: 'silph-showdown', storyTurn: 11});
  variables = mvu.applyBattleResult(variables, resultRecord(variables, true));
  assert.equal(root(variables).剧情.首次击败小茂, false);
  assert.equal(root(variables).统计.首次击败小茂, false);
  assert.equal(root(variables).剧情.已完成支线对战.includes('silph-showdown'), true);
});
