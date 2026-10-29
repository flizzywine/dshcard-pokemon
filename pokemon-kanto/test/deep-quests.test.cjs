'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const gadgets = require('../quest-gadgets.cjs');
const quests = require('../npc-quests.cjs');
const mvu = require('../mvu.cjs');
const companionship = require('../companionship.cjs');
const worldOf = variables => variables.stat_data.宝可梦;

test('deep commission catalog covers every town twice and six wild commission locations', () => {
  assert.equal(gadgets.definitions.length,33);
  const map = require('../public/data/map.json');
  const townCounts = new Map(map.filter(node => node.kind === 'town').map(node => [node.id, 0]));
  const wildLocations = new Set();
  const newQuestIds = new Set(['viridian-crossing-log','cerulean-waterline-test','vermilion-harbor-triage','lavender-tower-lanterns','route3-moonstone-ledger','mtmoon-fossil-witness','route19-tide-rescue','powerplant-grid-witness','tower-rocket-receipts','victoryroad-safety-rope']);
  for (const quest of gadgets.definitions) {
    const node = map.find(entry => entry.id === quest.location);
    assert.ok(node, `${quest.id} must name an existing map location`);
    if (node.kind === 'town') townCounts.set(node.id, townCounts.get(node.id) + 1);
    else wildLocations.add(node.id);
  }
  assert.ok([...townCounts].every(([, count]) => count >= 2), `town coverage: ${JSON.stringify([...townCounts])}`);
  assert.equal(wildLocations.size, 6, `wild coverage: ${[...wildLocations].join(', ')}`);
  const ids = new Set();
  for (const quest of gadgets.definitions) {
    assert.ok(!ids.has(quest.id)); ids.add(quest.id);
    assert.ok(quest.stages.length >= 3);
    assert.ok(new Set(quest.stages.map(stage => stage.objective.kind)).size >= 3, `${quest.id} should combine distinct, verifiable activity`);
    assert.ok(quest.reward.gadget || quest.reward.items);
    if (quest.reward.gadget) assert.ok(gadgets.gadgets[quest.reward.gadget]);
    if (quest.requiresGadget) assert.ok(gadgets.gadgets[quest.requiresGadget]);
    for (const [itemId, amount] of Object.entries(quest.reward.items || {})) {
      assert.ok(Number.isInteger(amount) && amount > 0);
      assert.ok(worldOf(mvu.createInitialMvu()).背包.物品.hasOwnProperty(itemId), `reward item ${itemId} must exist in the saved bag catalog`);
    }
    assert.ok(quest.choices.length >= 2);
    if (newQuestIds.has(quest.id)) {
      assert.ok(quest.description.length >= 40, `${quest.id} should state the commissioner's motivation and difficulty`);
      assert.ok(quest.choices.every(choice => choice.echo.length >= 20), `${quest.id} should describe branch consequences`);
    }
    assert.ok(quest.rewardPreview.length >= 4);
  }
});

test('wild commissions are available only at the named location after starter selection and outside battle', () => {
  const world = worldOf(mvu.createInitialMvu());
  world.地图.节点 = 'route3';
  world.战斗.状态 = 'finished';
  assert.equal(gadgets.options(world).length, 0, 'starter selection remains required');
  world.剧情.初始御三家已选 = true;
  assert.ok(quests.options(world).some(option => option.payload?.deepQuestId === 'route3-moonstone-ledger'));
  world.地图.节点 = 'route4';
  assert.equal(gadgets.options(world).some(option => option.payload?.deepQuestId === 'route3-moonstone-ledger'), false, 'an NPC is not offered from a neighboring node');
  world.地图.节点 = 'route3';
  world.战斗.状态 = 'active';
  assert.deepEqual(gadgets.options(world), []);
});

test('deep quest view supplies commissioner portrait and action results follow the committed stage', () => {
  const world = worldOf(mvu.createInitialMvu());
  world.剧情.初始御三家已选 = true; world.战斗.状态 = 'finished'; world.地图.节点 = 'pallet';
  quests.ensure(world); quests.refresh(world, { storyTurn: 1 });
  const entry = gadgets.view(world).quests.find(item => item.id === 'oak-open-field');
  assert.equal(entry.description, gadgets.definitions.find(item => item.id === entry.id).description);
  assert.ok(entry.currentStage.title && entry.currentStage.description);
  assert.ok(entry.npcId && entry.npcName && entry.npcPortrait);
  assert.ok(Array.isArray(entry.choices) && entry.choices.length >= 2);
  const accepted = quests.apply(world, 'deep-quest-accept', { deepQuestId: entry.id, choiceId: 'private' }, { storyTurn: 2 });
  const result = quests.actionResult(accepted, 'deep-quest-accept', { deepQuestId: entry.id });
  assert.equal(result.type, 'accepted');
  assert.match(result.result, /当前阶段：走出研究室/);
  assert.equal(result.summary, undefined);
});

test('a wild commission completes through recorded visits, a new catch, care, and one hand-in', () => {
  let world = worldOf(mvu.createInitialMvu());
  world.剧情.初始御三家已选 = true; world.战斗.状态 = 'finished'; world.地图.节点 = 'route3';
  quests.ensure(world); quests.refresh(world, { storyTurn: 1 });
  const accept = quests.options(world).find(option => option.id === 'deep-quest-accept' && option.payload.deepQuestId === 'route3-moonstone-ledger' && option.payload.choiceId === 'keep');
  assert.ok(accept);
  world = quests.apply(world, accept.id, accept.payload, { storyTurn: 1 });
  world.地图.节点 = 'mt-moon'; quests.recordVisit(world, 'mt-moon'); quests.refresh(world, { storyTurn: 2 });
  world.地图.节点 = 'route3';
  world = quests.apply(world, 'deep-quest-advance', { deepQuestId: 'route3-moonstone-ledger' }, { storyTurn: 3 });
  const geodude = mvu.makeMon(74, 7, 'caught-moonstone-geodude'); geodude.收服来源 = 'wild'; geodude.收服图鉴编号 = 74; world.电脑.push(geodude);
  quests.refresh(world, { storyTurn: 4 });
  world = quests.apply(world, 'deep-quest-advance', { deepQuestId: 'route3-moonstone-ledger' }, { storyTurn: 5 });
  quests.recordEvent(world, 'care', world.队伍[0].uid, 6); quests.refresh(world, { storyTurn: 6 });
  const claim = quests.options(world).find(option => option.id === 'deep-quest-claim' && option.payload.deepQuestId === 'route3-moonstone-ledger');
  assert.ok(claim);
  const before = world.背包.物品.tm28;
  world = quests.apply(world, claim.id, claim.payload, { storyTurn: 7 });
  assert.equal(world.委托.深度记录['route3-moonstone-ledger'].status, 'completed');
  assert.equal(world.背包.物品.tm28, before + 1);
  assert.throws(() => quests.apply(world, claim.id, claim.payload, { storyTurn: 8 }), /已经完成|尚未完成/);
});

test('bundle rewards are delivered atomically at explicit claim and cannot be claimed twice', () => {
  function readyBundleWorld() {
    const world = worldOf(mvu.createInitialMvu());
    world.剧情.初始御三家已选 = true;
    world.战斗.状态 = 'finished';
    world.地图.节点 = 'vermilion';
    world.训练家.徽章 = ['boulder'];
    world.委托.探访次数 = { 'diglett-cave': 1 };
    world.委托.深度记录['joy-triage-ledger'] = {
      status: 'ready', stage: 2, progress: 1, choiceId: 'private', acceptedTurn: 1,
      baseline: { visitCounts: { 'diglett-cave': 0 } },
    };
    return world;
  }
  const world = readyBundleWorld();
  const claimed = gadgets.apply(world, 'deep-quest-claim', { deepQuestId: 'joy-triage-ledger', choiceId: 'private' }, { storyTurn: 2 });
  assert.equal(claimed.背包.物品.maxpotion, world.背包.物品.maxpotion + 2);
  assert.equal(claimed.背包.物品.ppup, world.背包.物品.ppup + 1);
  assert.equal(claimed.委托.深度记录['joy-triage-ledger'].status, 'completed');
  assert.throws(() => gadgets.apply(claimed, 'deep-quest-claim', { deepQuestId: 'joy-triage-ledger', choiceId: 'private' }, { storyTurn: 3 }), /已经完成|尚未完成/);

  const fullBag = readyBundleWorld();
  fullBag.背包.物品.maxpotion = 998;
  assert.throws(() => gadgets.apply(fullBag, 'deep-quest-claim', { deepQuestId: 'joy-triage-ledger', choiceId: 'private' }, { storyTurn: 2 }), /携带上限/);
  assert.equal(fullBag.背包.物品.maxpotion, 998, 'failed capacity checks leave the original MVU world untouched');
  assert.equal(fullBag.委托.深度记录['joy-triage-ledger'].status, 'ready');
});

test('gadget upgrade quests stay unavailable until their prior tool is unlocked', () => {
  const world = worldOf(mvu.createInitialMvu());
  world.剧情.初始御三家已选 = true; world.战斗.状态 = 'finished'; world.地图.节点 = 'lavender'; world.训练家.徽章 = ['boulder','cascade'];
  assert.equal(gadgets.options(world).some(option => option.payload?.deepQuestId === 'rocket-lavender-transparency'), false);
  gadgets.unlock(world, 'trainingTerminal');
  assert.equal(gadgets.options(world).some(option => option.payload?.deepQuestId === 'rocket-lavender-transparency'), true);
  assert.equal(gadgets.modifiers({ ...world, 机制奖励: { 已解锁:['trainingTerminal','researchTerminalFreeTM'], partyExpShareMode:'off' } }).trainingTerminal.freeCompatibleTM, true);
});

test('gadget mode is locked until unlocked and view describes mechanisms and settings', () => {
  const world = worldOf(mvu.createInitialMvu());
  assert.equal(gadgets.modifiers(world).partyExpShareMode,'off');
  assert.throws(() => gadgets.applyConfig(world,'partyExpShareMode','split'),/尚未解锁/);
  gadgets.unlock(world,'partyExpShare');
  gadgets.applyConfig(world,'partyExpShareMode','split');
  assert.equal(gadgets.modifiers(world).partyExpShareMode,'split');
  const view = gadgets.view(world);
  assert.ok(view.gadgets.some(gadget => gadget.id === 'partyExpShare' && gadget.effect === 'party-exp-share' && gadget.questSource === 'oak-open-field'));
  assert.ok(view.partyExpShareOptions.find(option => option.id === 'journey').enabled);
  assert.throws(() => gadgets.applyConfig(world,'partyExpShareMode','free-every-move'),/请选择/);
  assert.throws(() => gadgets.applyConfig(world,'other','journey'),/不是可配置/);
});

test('Oak deep commission advances only from saved visit, catch, and bond events and unlocks once', () => {
  let world = worldOf(mvu.createInitialMvu());
  world.剧情.初始御三家已选 = true; world.战斗.状态 = 'finished'; world.地图.节点 = 'pallet'; world.训练家.金钱 = 1000;
  quests.ensure(world); quests.refresh(world,{storyTurn:1});
  const accept = quests.options(world).find(option => option.id === 'deep-quest-accept' && option.payload.deepQuestId === 'oak-open-field' && option.payload.choiceId === 'publish');
  assert.ok(accept);
  world = quests.apply(world,'deep-quest-accept',accept.payload,{storyTurn:1});
  assert.equal(world.训练家.金钱,700, 'the selected public research route charges once at acceptance');
  assert.equal(world.委托.深度记录['oak-open-field'].status,'active');
  assert.equal(world.委托.深度记录['oak-open-field'].progress,0, 'narrative claims do not change objective progress');

  world.地图.节点 = 'viridian-forest'; quests.recordVisit(world,'viridian-forest');
  quests.refresh(world,{storyTurn:2});
  assert.equal(world.委托.深度记录['oak-open-field'].status,'ready');
  world.地图.节点 = 'pallet';
  world = quests.apply(world,'deep-quest-advance',{deepQuestId:'oak-open-field'},{storyTurn:3});
  for (const id of [16,19]) { const mon=mvu.makeMon(id,5,`field-${id}`); mon.收服来源='wild'; mon.收服图鉴编号=id; world.电脑.push(mon); }
  quests.refresh(world,{storyTurn:4});
  assert.equal(world.委托.深度记录['oak-open-field'].status,'ready');
  world = quests.apply(world,'deep-quest-advance',{deepQuestId:'oak-open-field'},{storyTurn:5});
  const starter = world.队伍[0]; world = companionship.apply(world,'bond',{uid:starter.uid,mode:'talk',storyTurn:6});
  quests.refresh(world,{storyTurn:6});
  const claim = quests.options(world).find(option => option.id === 'deep-quest-claim' && option.payload.deepQuestId === 'oak-open-field');
  assert.ok(claim);
  world = quests.apply(world,claim.id,claim.payload,{storyTurn:7});
  assert.equal(world.委托.深度记录['oak-open-field'].status,'completed');
  assert.ok(world.机制奖励.已解锁.includes('partyExpShare'));
  assert.equal(gadgets.modifiers(world).partyExpShareMode,'off', 'unlocking the device leaves the player in the original mode until configured');
  assert.throws(() => quests.apply(world,claim.id,claim.payload,{storyTurn:8}),/已经完成|尚未完成/);
  assert.equal(world.训练家.金钱,700, 'a completed reward cannot charge or unlock twice');
  quests.validate(world); mvu.validateMvu({stat_data:{宝可梦:world}});
});

test('a ready deep commission pays its gadget and item bundle exactly once', () => {
  function readyWorld() {
    const world = worldOf(mvu.createInitialMvu());
    world.剧情.初始御三家已选 = true;
    world.战斗.状态 = 'finished';
    world.地图.节点 = 'lavender';
    world.训练家.徽章 = ['boulder', 'cascade'];
    gadgets.unlock(world, 'trainingTerminal');
    quests.ensure(world);
    quests.recordEvent(world, 'care', world.队伍[0].uid, 4);
    world.委托.深度记录['rocket-lavender-transparency'] = {
      status: 'ready', stage: 2, progress: 1, choiceId: 'protect', acceptedTurn: 1,
      baseline: { eventSerial: 0, visitCounts: {} },
    };
    return world;
  }
  const world = readyWorld();
  const tm06 = world.背包.物品.tm06;
  const claim = { deepQuestId: 'rocket-lavender-transparency', choiceId: 'protect' };
  const claimed = quests.apply(world, 'deep-quest-claim', claim, { storyTurn: 5 });
  assert.equal(claimed.委托.深度记录['rocket-lavender-transparency'].status, 'completed');
  assert.equal(claimed.背包.物品.tm06, tm06 + 1);
  assert.equal(claimed.机制奖励.已解锁.filter(id => id === 'researchTerminalFreeTM').length, 1);
  for (const module of [quests, gadgets]) {
    assert.throws(() => module.apply(claimed, 'deep-quest-claim', claim, { storyTurn: 6 }), /最终阶段尚未完成/);
  }
  assert.equal(claimed.背包.物品.tm06, tm06 + 1, 'replaying the claim must not duplicate the item reward');
  assert.equal(claimed.机制奖励.已解锁.filter(id => id === 'researchTerminalFreeTM').length, 1);
});

test('a rejected deep commission settlement grants nothing and stays claimable', () => {
  const world = worldOf(mvu.createInitialMvu());
  world.剧情.初始御三家已选 = true;
  world.战斗.状态 = 'finished';
  world.地图.节点 = 'vermilion';
  world.训练家.徽章 = ['boulder'];
  world.委托.探访次数['diglett-cave'] = 1;
  world.委托.深度记录['joy-triage-ledger'] = {
    status: 'ready', stage: 2, progress: 1, choiceId: 'private', acceptedTurn: 1,
    baseline: { visitCounts: { 'diglett-cave': 0 } },
  };
  const claim = { deepQuestId: 'joy-triage-ledger', choiceId: 'private' };
  world.背包.物品.maxpotion = 998;
  world.背包.物品.ppup = 999;
  const untouched = structuredClone(world);
  assert.throws(() => gadgets.apply(world, 'deep-quest-claim', claim, { storyTurn: 2 }), /携带上限/);
  assert.deepEqual(world, untouched, 'a rejected claim must not partially grant or consume anything');
  world.背包.物品.maxpotion = 997;
  const stillBlocked = structuredClone(world);
  assert.throws(() => gadgets.apply(world, 'deep-quest-claim', claim, { storyTurn: 3 }), /携带上限/);
  assert.deepEqual(world, stillBlocked, 'every reward item is checked before any of them is granted');
  world.背包.物品.ppup = 998;
  const claimed = gadgets.apply(world, 'deep-quest-claim', claim, { storyTurn: 4 });
  assert.equal(claimed.背包.物品.maxpotion, 999);
  assert.equal(claimed.背包.物品.ppup, 999);
  assert.equal(claimed.委托.深度记录['joy-triage-ledger'].status, 'completed');
  assert.throws(() => gadgets.apply(claimed, 'deep-quest-claim', claim, { storyTurn: 5 }), /最终阶段尚未完成/);
});

test('a rejected NPC delivery settlement consumes no stock and still settles once later', () => {
  let world = worldOf(mvu.createInitialMvu());
  world.剧情.初始御三家已选 = true;
  world.战斗.状态 = 'finished';
  world.地图.节点 = 'viridian';
  quests.ensure(world); quests.refresh(world, { storyTurn: 1 });
  world = quests.apply(world, 'quest-accept', { questId: 'viridian-ball-delivery' }, { storyTurn: 2 });
  quests.recordPurchase(world, 'pokeball', 2, 3);
  world.背包.物品.pokeball += 2;
  quests.refresh(world, { storyTurn: 4 });
  const record = world.委托.记录['viridian-ball-delivery'];
  assert.equal(record.status, 'ready');
  const balls = world.背包.物品.pokeball;
  const money = world.训练家.金钱;
  const batches = structuredClone(world.委托.采购批次);
  world.训练家.金钱 = 9999999;
  assert.throws(() => quests.apply(world, 'quest-turn-in', { questId: 'viridian-ball-delivery' }, { storyTurn: 5 }), /金钱上限/);
  assert.equal(world.背包.物品.pokeball, balls, 'a failed settlement must not consume delivery stock');
  assert.deepEqual(world.委托.采购批次, batches, 'a failed settlement must not consume purchase batches');
  assert.equal(world.训练家.金钱, 9999999);
  assert.equal(world.委托.记录['viridian-ball-delivery'].status, 'ready');
  world.训练家.金钱 = money;
  const paid = quests.apply(world, 'quest-turn-in', { questId: 'viridian-ball-delivery' }, { storyTurn: 6 });
  assert.equal(paid.背包.物品.pokeball, balls - 2);
  assert.equal(paid.训练家.金钱, money + 1600);
  assert.equal(paid.委托.纪念品.length, 1);
  assert.equal(paid.委托.记录['viridian-ball-delivery'].status, 'completed');
  assert.throws(() => quests.apply(paid, 'quest-turn-in', { questId: 'viridian-ball-delivery' }, { storyTurn: 7 }), /已经完成/);
  assert.throws(() => quests.apply(paid, 'quest-accept', { questId: 'viridian-ball-delivery' }, { storyTurn: 8 }), /已经完成/);
  assert.equal(paid.背包.物品.pokeball, balls - 2);
  assert.equal(paid.训练家.金钱, money + 1600);
  assert.equal(paid.委托.纪念品.length, 1);
});

test('deep commissions honor starter, battle, badge, gadget and location prerequisites', () => {
  let world = worldOf(mvu.createInitialMvu());
  world.剧情.初始御三家已选 = false;
  world.战斗.状态 = 'finished';
  world.地图.节点 = 'cerulean';
  const accept = { deepQuestId: 'misty-water-memory', choiceId: 'keep' };
  assert.deepEqual(gadgets.options(world), []);
  assert.throws(() => quests.apply(world, 'deep-quest-accept', accept, { storyTurn: 2 }), /先选择最初的伙伴/);
  world.剧情.初始御三家已选 = true;
  quests.ensure(world); quests.refresh(world, { storyTurn: 2 });
  const offered = () => gadgets.options(world).some(option => option.id === 'deep-quest-accept' && option.payload.deepQuestId === 'misty-water-memory');
  assert.equal(offered(), false, 'the quest requires a badge');
  let entry = gadgets.view(world).quests.find(quest => quest.id === 'misty-water-memory');
  assert.equal(entry.status, 'unaccepted');
  assert.match(entry.reason, /徽章/);
  assert.ok(entry.choices.every(choice => !choice.enabled));
  assert.throws(() => quests.apply(world, 'deep-quest-accept', accept, { storyTurn: 3 }), /需要到达委托人所在地点并满足徽章与前置机制条件/);
  world.训练家.徽章 = ['boulder'];
  assert.equal(offered(), false, 'the quest requires its prior gadget');
  entry = gadgets.view(world).quests.find(quest => quest.id === 'misty-water-memory');
  assert.match(entry.reason, /招式研修终端/);
  assert.throws(() => quests.apply(world, 'deep-quest-accept', accept, { storyTurn: 4 }), /需要到达委托人所在地点并满足徽章与前置机制条件/);
  gadgets.unlock(world, 'trainingTerminal');
  assert.equal(offered(), true);
  assert.equal(gadgets.options(world).find(option => option.id === 'deep-quest-accept' && option.payload.deepQuestId === 'misty-water-memory' && option.payload.choiceId === 'keep').enabled, true);
  world.地图.节点 = 'pallet';
  assert.throws(() => quests.apply(world, 'deep-quest-accept', accept, { storyTurn: 5 }), /需要到达委托人所在地点并满足徽章与前置机制条件/);
  world.地图.节点 = 'cerulean';
  world.战斗.状态 = 'active';
  assert.deepEqual(gadgets.options(world), []);
  assert.throws(() => quests.apply(world, 'deep-quest-accept', accept, { storyTurn: 6 }), /战斗中/);
  world.战斗.状态 = 'finished';
  const accepted = quests.apply(world, 'deep-quest-accept', accept, { storyTurn: 7 });
  assert.equal(accepted.委托.深度记录['misty-water-memory'].status, 'active');
  assert.equal(accepted.委托.深度记录['misty-water-memory'].choiceId, 'keep');
});

test('deep commission acceptance shares the active cap and never charges an affordable plan', () => {
  const poor = worldOf(mvu.createInitialMvu());
  poor.剧情.初始御三家已选 = true;
  poor.战斗.状态 = 'finished';
  poor.地图.节点 = 'pallet';
  poor.训练家.金钱 = 299;
  quests.ensure(poor);
  const publish = quests.options(poor).find(option => option.id === 'deep-quest-accept' && option.payload.deepQuestId === 'oak-open-field' && option.payload.choiceId === 'publish');
  assert.ok(publish);
  assert.equal(publish.enabled, false);
  assert.match(publish.reason, /300元/);
  assert.throws(() => quests.apply(poor, 'deep-quest-accept', { deepQuestId: 'oak-open-field', choiceId: 'publish' }, { storyTurn: 2 }), /300元/);
  assert.equal(poor.训练家.金钱, 299, 'rejected acceptance must not charge the plan fee');
  assert.equal(poor.委托.深度记录['oak-open-field'], undefined);

  const capped = worldOf(mvu.createInitialMvu());
  capped.剧情.初始御三家已选 = true;
  capped.战斗.状态 = 'finished';
  capped.地图.节点 = 'pallet';
  quests.ensure(capped);
  for (const id of ['oak-field-notes', 'oak-route1-survey', 'viridian-poison-study', 'pewter-rock-specimen']) {
    capped.委托.记录[id] = { status: 'active', acceptedTurn: 1, progress: 0, baseline: {} };
  }
  const blocked = quests.options(capped).find(option => option.id === 'deep-quest-accept' && option.payload.deepQuestId === 'oak-open-field');
  assert.ok(blocked);
  assert.equal(blocked.enabled, false);
  assert.match(blocked.reason, /最多同时进行四项委托/);
  assert.throws(() => quests.apply(capped, 'deep-quest-accept', { deepQuestId: 'oak-open-field', choiceId: 'private' }, { storyTurn: 3 }), /最多同时进行四项委托/);
  assert.equal(capped.委托.深度记录['oak-open-field'], undefined);
});

test('Koga camp commission is accepted at Fuchsia and its visit is outside Safari',()=>{
 const world=worldOf(mvu.createInitialMvu());world.剧情.初始御三家已选=true;world.战斗.状态='finished';world.地图.节点='fuchsia';world.训练家.徽章=['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章'];
 world.机制奖励={已解锁:['campKit']};const q=gadgets.definitions.find(q=>q.id==='koga-no-trace-camp');assert.equal(q.location,'fuchsia');assert.equal(q.stages[1].objective.node,'route15');
 const next=gadgets.apply(world,'deep-quest-accept',{deepQuestId:q.id,choiceId:q.choices[0].id},{storyTurn:1});assert.equal(next.委托.深度记录[q.id].status,'active');
});

