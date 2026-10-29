'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mvu = require('../mvu.cjs');
const {KantoGame} = require('../engine.cjs');
const gadgets = require('../quest-gadgets.cjs');

const BADGES = ['岩石徽章', '蓝色徽章', '橙色徽章', '彩虹徽章', '粉红徽章', '金色徽章', '深红徽章', '绿色徽章'];
const root = variables => variables.stat_data.宝可梦;

function readyWorld(node = 'pallet', starter = 1) {
  let variables = mvu.createInitialMvu(starter);
  variables = mvu.chooseStarter(variables, starter);
  const world = root(variables);
  world.地图.节点 = node;
  world.地图.地点 = node;
  world.地图.轮次 = Math.max(2, world.地图.轮次);
  world.遭遇 = null;
  world.战斗 = {轮次: world.地图.轮次, 状态: 'finished', 结果: '', 摘要: '', 操作序号: 0, 奖励: {经验: [], 金币: 0, 物品: [], 徽章: []}};
  mvu.validateMvu(variables);
  return variables;
}

function option(variables, id, predicate = () => true) {
  const row = mvu.theaterView(variables).theater.options.find(item => item.id === id && predicate(item));
  assert.ok(row, `native MVU theater should expose ${id}`);
  assert.equal(row.enabled, true, row.reason || `${id} should be enabled`);
  return row;
}

function winCurrentEncounter(variables, {caughtId = null} = {}) {
  const game = new KantoGame();
  const snapshot = mvu.startFromMvu(game, variables);
  const record = game.battles.get(snapshot.id);
  const foes = record.battle.p2.pokemon;
  const players = record.battle.p1.pokemon;
  record.participationByFoe = Object.fromEntries(foes.map(foe => [foe.set.slotId, [players[0].set.slotId]]));
  record.livingByFoeAtDefeat = Object.fromEntries(foes.map(foe => [foe.set.slotId, players.map(player => player.set.slotId)]));
  if (caughtId !== null) {
    const source = root(variables).遭遇.队伍.find(mon => mon.图鉴编号 === caughtId);
    record.caught = {id: caughtId, name: source?.昵称 || `宝可梦${caughtId}`};
  } else {
    for (const foe of foes) { foe.hp = 0; foe.fainted = true; }
  }
  record.battle.win('p1');
  return {variables: mvu.applyBattleResult(variables, record), record};
}

test('native MVU campaign requires registration, six actual battle settlements, one banner, then opens Elite Four', () => {
  let variables = readyWorld('indigo');
  root(variables).训练家.徽章 = BADGES.slice(0, 7);
  mvu.validateMvu(variables);
  assert.equal(mvu.theaterView(variables).theater.options.some(row => row.id === 'campaign-register-tournament'), false);
  assert.throws(() => mvu.theaterAction(variables, 'challenge-elite'), /当前场景不允许/);

  root(variables).训练家.徽章 = BADGES.slice();
  mvu.validateMvu(variables);
  const lockedElite = mvu.theaterView(variables).theater.options.find(row => row.id === 'challenge-elite');
  assert.ok(lockedElite);
  assert.equal(lockedElite.enabled, false);
  assert.match(lockedElite.reason, /石英大会|优胜|资格/);
  const registration = option(variables, 'campaign-register-tournament');
  variables = mvu.theaterAction(variables, registration.id, registration.payload);
  assert.equal(root(variables).剧情.关都主线.tournament.round, 1);
  assert.equal(root(variables).剧情.关都主线.tournament.champion, false);
  assert.throws(() => mvu.theaterAction(variables, 'challenge-elite'), /石英大会|优胜|挑战资格/);

  let finalRecord;
  for (let round = 1; round <= 6; round++) {
    const entry = option(variables, 'campaign-enter-round');
    variables = mvu.theaterAction(variables, entry.id, entry.payload);
    assert.equal(root(variables).遭遇.campaignId, 'indigo-tournament');
    assert.equal(root(variables).遭遇.tournamentRound, round);
    assert.equal(root(variables).战斗.状态, 'pending');
    const result = winCurrentEncounter(variables);
    variables = result.variables;
    if (round === 6) finalRecord = result.record;
    assert.equal(root(variables).战斗.状态, 'finished');
    assert.equal(root(variables).战斗.结果, 'win');
    if (round < 6) {
      assert.equal(root(variables).剧情.关都主线.tournament.round, round + 1);
      assert.equal(root(variables).剧情.关都主线.tournament.champion, false);
      assert.throws(() => mvu.theaterAction(variables, 'challenge-elite'), /石英大会|优胜|挑战资格/);
    }
  }
  const champion = root(variables).剧情.关都主线.tournament;
  assert.equal(champion.status, 'champion');
  assert.equal(champion.rewardClaimed, true);
  assert.equal(root(variables).背包.关键物品.filter(item => item.id === 'indigo-champion-banner').length, 1);

  variables = mvu.applyBattleResult(variables, finalRecord);
  assert.equal(root(variables).背包.关键物品.filter(item => item.id === 'indigo-champion-banner').length, 1, 'a repeated final result cannot duplicate the champion banner');
  const eliteOption = option(variables, 'challenge-elite');
  variables = mvu.theaterAction(variables, eliteOption.id, eliteOption.payload);
  assert.equal(root(variables).遭遇.联盟, 0);
  assert.equal(root(variables).遭遇.训练家, '科拿');
  assert.equal(root(variables).战斗.状态, 'pending');
});

test('native story-event route advances a multi-stage scene, awards HM01 once, and retains the stage dialogue', () => {
  let variables = readyWorld('vermilion');
  const world = root(variables);
  world.训练家.徽章 = ['岩石徽章'];
  world.剧情.关都事件.标记.ssTicket = true;
  mvu.validateMvu(variables);

  let sceneOption = option(variables, 'kanto-story-event', row => row.payload.eventId === 'ss-anne-captain' && row.payload.choiceId === 'rush-deck');
  variables = mvu.theaterAction(variables, sceneOption.id, {...sceneOption.payload, storyTurn: 3});
  assert.equal(root(variables).剧情.关都事件.进度['ss-anne-captain'].阶段, 'search-ship', 'a failed choice does not skip the phase');
  assert.equal(root(variables).背包.物品.hm01, 0);

  sceneOption = option(variables, 'kanto-story-event', row => row.payload.eventId === 'ss-anne-captain' && row.payload.choiceId === 'ask-crew');
  variables = mvu.theaterAction(variables, sceneOption.id, {...sceneOption.payload, storyTurn: 4});
  assert.equal(root(variables).剧情.关都事件.进度['ss-anne-captain'].阶段, 'captain');
  assert.match(mvu.theaterView(variables).theater.dialogue, /水手指出|通道/);

  sceneOption = option(variables, 'kanto-story-event', row => row.payload.eventId === 'ss-anne-captain' && row.payload.choiceId === 'care-captain');
  variables = mvu.theaterAction(variables, sceneOption.id, {...sceneOption.payload, storyTurn: 5});
  assert.equal(root(variables).背包.物品.hm01, 1);
  assert.equal(root(variables).剧情.关都事件.进度['ss-anne-captain'].完成, true);
  assert.match(mvu.theaterView(variables).theater.dialogue, /船长终于缓过神来/);
  assert.equal(mvu.theaterView(variables).theater.options.filter(row => row.id === 'kanto-story-event' && row.payload.eventId === 'ss-anne-captain' && row.enabled).length, 0);
});

test('deep quest appears in native theater, advances from travel/catches/bond, unlocks a usable tool and changes battle EXP', () => {
  let variables = readyWorld('pallet');
  let accept = option(variables, 'deep-quest-accept', row => row.payload.deepQuestId === 'oak-open-field' && row.payload.choiceId === 'publish');
  variables = mvu.theaterAction(variables, accept.id, {...accept.payload, storyTurn: 10});
  assert.equal(root(variables).委托.深度记录['oak-open-field'].status, 'active');

  for (const node of ['route1', 'viridian', 'route2', 'viridian-forest']) variables = mvu.travel(variables, node);
  assert.equal(root(variables).委托.深度记录['oak-open-field'].status, 'ready', 'ordinary map travel updates objective progress');
  variables = mvu.travel(variables, 'route2');
  variables = mvu.travel(variables, 'viridian');
  variables = mvu.travel(variables, 'route1');
  variables = mvu.travel(variables, 'pallet');
  let advance = option(variables, 'deep-quest-advance', row => row.payload.deepQuestId === 'oak-open-field');
  variables = mvu.theaterAction(variables, advance.id, {...advance.payload, storyTurn: 11});

  variables=mvu.travel(variables,'route1');
  for (const speciesId of [16, 19]) {
    variables = mvu.theaterAction(variables, 'wild', {speciesId});
    variables = winCurrentEncounter(variables, {caughtId: speciesId}).variables;
  }
  assert.equal(root(variables).委托.深度记录['oak-open-field'].status, 'ready', 'actual capture settlements update the current objective');
  variables=mvu.travel(variables,'pallet');
  advance = option(variables, 'deep-quest-advance', row => row.payload.deepQuestId === 'oak-open-field');
  variables = mvu.theaterAction(variables, advance.id, {...advance.payload, storyTurn: 12});

  while (root(variables).委托.深度记录['oak-open-field'].status !== 'ready') {
    const bond = option(variables, 'camp', row => row.payload.mode === 'rest');
    variables = mvu.theaterAction(variables, bond.id, {...bond.payload, storyTurn: 13});
  }
  const claim = option(variables, 'deep-quest-claim', row => row.payload.deepQuestId === 'oak-open-field');
  variables = mvu.theaterAction(variables, claim.id, {...claim.payload, storyTurn: 14});
  assert.ok(root(variables).机制奖励.已解锁.includes('partyExpShare'));
  assert.ok(gadgets.view(root(variables)).gadgets.some(gadget => gadget.id === 'partyExpShare' && gadget.unlocked));
  assert.throws(() => gadgets.applyConfig(root(readyWorld()), 'partyExpShareMode', 'journey'), /尚未解锁/);

  const shareWorld = root(variables);
  shareWorld.队伍.push(mvu.makeMon(4, 5, 'journey-share-bench'));
  gadgets.applyConfig(shareWorld, 'partyExpShareMode', 'journey');
  mvu.validateMvu(variables);
  const controls = structuredClone(variables), controlWorld = root(controls);
  gadgets.applyConfig(controlWorld, 'partyExpShareMode', 'off');
  function trainerEncounter(input) {
    const w = root(input);
    w.遭遇 = {类型: 'trainer', 训练家: '经验规则测试', 队伍: [mvu.makeMon(4, 20, 'exp-rule-foe')]};
    w.战斗 = {轮次: w.地图.轮次 + 1, 状态: 'pending', 结果: '', 摘要: '', 操作序号: 0};
    return input;
  }
  const controlResult = winCurrentEncounter(trainerEncounter(controls)).variables;
  const shareResult = winCurrentEncounter(trainerEncounter(variables)).variables;
  const benchControl = root(controlResult).队伍.find(mon => mon.uid === 'journey-share-bench');
  const benchShared = root(shareResult).队伍.find(mon => mon.uid === 'journey-share-bench');
  assert.equal(benchControl.经验, mvu.expAt(5, benchControl.图鉴编号), 'without the unlocked tool, a nonparticipant gets no EXP');
  assert.ok(benchShared.经验 > mvu.expAt(5, benchShared.图鉴编号), 'journey mode affects actual engine-to-MVU EXP settlement');
});

test('MVU travel integrates HM/badge gates and recorded legacy return paths without awarding anything', () => {
  let variables = readyWorld('fuchsia');
  assert.throws(() => mvu.travel(variables, 'route19'), /冲浪|粉红徽章/);
  assert.equal(root(variables).背包.物品.hm03, 0);

  const surfOnly = structuredClone(variables);
  root(surfOnly).队伍[0]=mvu.makeMon(7,5,'surf-partner');
  const surfMon = root(surfOnly).队伍[0];
  const surfPP = require('../engine.cjs').catalog.moves.surf.pp;
  surfMon.招式[0] = {id: 'surf', PP: surfPP, PP上限: surfPP};
  mvu.validateMvu(surfOnly);
  assert.throws(() => mvu.travel(surfOnly, 'route19'), /粉红徽章/);
  root(surfOnly).训练家.徽章.push('粉红徽章');
  variables = mvu.travel(surfOnly, 'route19');
  assert.equal(root(variables).地图.节点, 'route19');

  const legacy = readyWorld('cinnabar');
  root(legacy).委托.探访地点 = ['cinnabar', 'fuchsia'];
  root(legacy).委托.探访次数 = {cinnabar: 1, fuchsia: 1};
  variables = mvu.travel(legacy, 'route20');
  variables = mvu.travel(variables, 'route19');
  variables = mvu.travel(variables, 'fuchsia');
  assert.equal(root(variables).地图.节点, 'fuchsia');
  assert.equal(root(variables).背包.物品.hm03, 0);
  assert.equal(root(variables).训练家.徽章.length, 0);
});
