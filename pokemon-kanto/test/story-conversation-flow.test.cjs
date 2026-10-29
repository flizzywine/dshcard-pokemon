'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const events = require('../kanto-story-events.cjs');
const campaign = require('../story-campaign.cjs');
const director = require('../story-director.cjs');
const eventData = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/kanto-story-events.json'), 'utf8'));
const campaignData = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/kanto-campaign.json'), 'utf8'));
const deepQuestData = require('../public/data/deep-quests.json');

const itemRows = ['../public/data/items.json','../public/data/field-items.json','../public/data/tmhm.json'].flatMap(rel => require(rel));

function worldAt(node) {
  return {
    地图: {节点: node, 轮次: 4},
    剧情: {初始御三家已选: true, 关都事件: {版本: 1, 进度: {}, 标记: {}, 记录: []}, 关都主线: {version: 1, prologueSeen: true, choices: {}, bonds: {}, echoes: [], flags: []}},
    战斗: {状态: 'finished'}, 训练家: {徽章: []},
    背包: {物品: Object.fromEntries(itemRows.map(item => [item.id, 0]))},
  };
}

function verifyConversation(entry, label) {
  assert.equal(typeof entry.focus, 'string', `${label} explains the personal tension`);
  assert.ok(entry.focus.length >= 50, `${label} has character-specific motivation and vulnerability`);
  assert.ok(Array.isArray(entry.beats) && entry.beats.length >= 3, `${label} supports several turns`);
  assert.ok(entry.beats.every(beat => typeof beat === 'string' && beat.length >= 12), `${label} has concrete scene beats`);
  assert.ok(Array.isArray(entry.questions) && entry.questions.length >= 2, `${label} leaves multiple open questions`);
  assert.ok(entry.questions.every(question => /[？?]$/.test(question)), `${label} questions remain open`);
  assert.equal(typeof entry.revisit, 'string');
  assert.ok(entry.revisit.length >= 20, `${label} contains a future echo`);
}

test('all existing events and campaign scenes carry distinct multi-turn conversation design', () => {
  assert.equal(eventData.length, 23);
  assert.deepEqual(campaignData.chapters.map(row => row.id), [
    'pewter-afterglow', 'cerulean-crossing', 'vermilion-current', 'celadon-greenhouse',
    'fuchsia-traces', 'saffron-reflection', 'cinnabar-records', 'viridian-cedar',
  ]);
  const all = eventData.map(row => [row.id, row.conversation]).concat([campaignData.prologue, ...campaignData.chapters].map(row => [row.id, row.conversation]));
  const fingerprints = new Set();
  for (const [id, conversation] of all) {
    assert.ok(conversation, `${id} conversation exists`);
    verifyConversation(conversation, id);
    const fingerprint = JSON.stringify([conversation.focus, conversation.beats, conversation.questions]);
    assert.ok(!fingerprints.has(fingerprint), `${id} is authored specifically, not copied from a shared template`);
    fingerprints.add(fingerprint);
  }
});

test('event view and director expose only the active event and preserve it across free conversation turns', () => {
  let world = worldAt('route25');
  const before = structuredClone(world.剧情.关都事件);
  let scene = events.view(world).scene;
  assert.equal(scene.eventId, 'bill-cottage-ticket');
  assert.equal(scene.stageId, 'find-bill');
  assert.equal(scene.conversation.beats.length, 3);
  const firstPrompt = director.prompt(world, null, '我先问比尔舱里有没有宝可梦受伤。', 10);
  assert.match(firstPrompt, /岬角小屋的求救信号/);
  assert.match(firstPrompt, /错误接线图/);
  assert.doesNotMatch(firstPrompt, /游戏厅的暗门/);
  assert.match(firstPrompt, /不替玩家回答/);
  assert.match(firstPrompt, /允许同一场互动持续多轮/);
  assert.deepEqual(world.剧情.关都事件, before, 'asking a follow-up question does not invoke an event action');

  world = events.apply(world, 'kanto-story-event', {eventId: 'bill-cottage-ticket', choiceId: 'check-console'}, {storyTurn: 11});
  scene = events.view(world).scene;
  assert.equal(scene.stageId, 'help-bill');
  assert.equal(world.剧情.关都事件.进度['bill-cottage-ticket'].完成, false);
  const secondPrompt = director.prompt(world, null, '我想听听船票为什么重要。', 11);
  assert.match(secondPrompt, /比尔把枯叶港的船票放在桌上/);
  assert.doesNotMatch(secondPrompt, /游戏厅的暗门/);
  assert.equal(world.剧情.关都事件.进度['bill-cottage-ticket'].完成, false, 'a free dialogue turn cannot finish an event');

  const completed = events.apply(world, 'kanto-story-event', {eventId: 'bill-cottage-ticket', choiceId: 'accept-ticket'}, {storyTurn: 12});
  assert.equal(completed.剧情.关都事件.进度['bill-cottage-ticket'].完成, true, 'only the explicit validated choice completes the event');
});

test('campaign conversation follows the active chapter and free dialogue does not consume its branch', () => {
  const world = worldAt('pewter');
  world.训练家.徽章 = ['岩石徽章'];
  const scene = campaign.view(world).scene;
  assert.equal(scene.id, 'pewter-afterglow');
  assert.equal(scene.conversation.beats.length, 3);
  const prompt = director.prompt(world, null, '我问小刚能不能先检查伙伴的脚印。', 22);
  assert.match(prompt, /石阶下的编号/);
  assert.match(prompt, /小刚要求记下足迹/);
  assert.doesNotMatch(prompt, /桥下的水位线/);
  assert.deepEqual(world.剧情.关都主线.choices, {}, 'narration cannot commit a campaign branch');
  assert.equal(campaign.view(world).scene.id, 'pewter-afterglow');

  const chosen = campaign.apply(world, 'campaign-choice', {chapterId: 'pewter-afterglow', choiceId: 'keep-moving'});
  assert.equal(chosen.剧情.关都主线.choices['pewter-afterglow'], 'keep-moving');
  assert.equal(chosen.剧情.关都主线.echoes.length, 1, 'branch consequences enter continuity only after a real action');
});


test('story reward data uses registered abilities/items and is surfaced with actor and open questions', () => {
  const itemIds = new Set(itemRows.map(item => item.id));
  const gadgetIds = new Set(Object.keys(require('../quest-gadgets.cjs').gadgets));
  function check(reward, label) {
    if (!reward) return;
    for (const id of reward.gadgetIds || []) assert.ok(gadgetIds.has(id), label + ' gadget ' + id);
    for (const [id,count] of Object.entries(reward.items || {})) { assert.ok(itemIds.has(id), label + ' item ' + id); assert.ok(Number.isSafeInteger(count) && count > 0); }
    for (const [gadget, items] of Object.entries(reward.fallbackItemsByGadget || {})) {
      assert.ok((reward.gadgetIds || []).includes(gadget), label + ' fallback is explicitly tied to its gadget');
      for (const [id,count] of Object.entries(items)) { assert.ok(itemIds.has(id), label + ' fallback item ' + id); assert.ok(Number.isSafeInteger(count) && count > 0); }
    }
  }
  for (const event of eventData) for (const stage of event.stages) for (const choice of stage.choices) check(choice.reward, event.id + '/' + choice.id);
  check(campaignData.prologue.reward, 'prologue');
  for (const chapter of campaignData.chapters) for (const choice of chapter.choices) check(choice.reward, chapter.id + '/' + choice.id);

  const forestWorld = worldAt('viridian-forest'); forestWorld.剧情.关都事件.进度['yellow-forest-listening'] = {阶段:'promise',完成:false};
  const forest = events.view(forestWorld).events.find(row => row.id === 'yellow-forest-listening');
  assert.equal(forest.actor, '小黄（特别篇）');
  assert.deepEqual(forest.openQuestions, forest.conversation.questions);
  assert.ok(forest.choices[0].rewardPreview.gadgets.some(row => row.id === 'bondLens'));
  const prologueWorld = worldAt('pallet'); prologueWorld.剧情.关都主线.prologueSeen = false;
  const prologue = campaign.view(prologueWorld).scene;
  assert.equal(prologue.actor.name, '大木博士');
  assert.deepEqual(prologue.rewardPreview.gadgets, [], 'the introductory scene does not unlock task tools');
  assert.ok(prologue.rewardPreview.items.some(row => row.id === 'potion' && row.count === 2));
  const radarQuest = deepQuestData.find(row => row.id === 'ash-path-notes');
  assert.equal(radarQuest.reward.gadget, 'fieldRadar', 'the real field-notes task remains the radar reward source');
});

test('event rewards grant once at completion, and already-owned gadgets receive the authored item alternative', () => {
  function reachYellow() {
    let world = worldAt('viridian-forest');
    world = events.apply(world, 'kanto-story-event', {eventId:'forest-pikachu-grove',choiceId:'give-space'}, {storyTurn:1});
    assert.equal(world.背包.物品.magnet, 1);
    assert.equal(world.剧情.关都事件.进度['forest-pikachu-grove'].rewardClaimed, true);
    world = events.apply(world, 'kanto-story-event', {eventId:'yellow-forest-listening',choiceId:'quiet-space'}, {storyTurn:2});
    return world;
  }
  let world = reachYellow();
  assert.equal(world.剧情.关都事件.进度['yellow-forest-listening'].完成, false);
  world = events.apply(world, 'kanto-story-event', {eventId:'yellow-forest-listening',choiceId:'stay-and-care'}, {storyTurn:3});
  assert.ok(world.机制奖励.已解锁.includes('bondLens'));
  assert.equal(world.背包.物品.soothebell, 1);
  assert.deepEqual(world.剧情.关都事件.进度['yellow-forest-listening'].newlyGranted.gadgetIds, ['bondLens']);
  assert.equal(world.剧情.关都事件.进度['yellow-forest-listening'].rewardClaimed, true);
  assert.throws(() => events.apply(world, 'kanto-story-event', {eventId:'yellow-forest-listening',choiceId:'leave-a-sign'}, {storyTurn:4}), /已经完成/);
  assert.equal(world.背包.物品.soothebell, 1);

  let owned = reachYellow();
  owned.机制奖励 = {已解锁:['bondLens']};
  owned = events.apply(owned, 'kanto-story-event', {eventId:'yellow-forest-listening',choiceId:'stay-and-care'}, {storyTurn:3});
  assert.equal(owned.背包.物品.luckyegg, 1);
  assert.deepEqual(owned.剧情.关都事件.进度['yellow-forest-listening'].newlyGranted.gadgetIds, []);
  assert.ok(owned.剧情.关都事件.进度['yellow-forest-listening'].newlyGranted.items.luckyegg);
});

test('campaign prologue and chapter rewards are one-shot, have explicit alternatives, and never backfill old completed saves', () => {
  let world = worldAt('pallet'); world.剧情.关都主线.prologueSeen = false;
  const prologue = campaign.apply(world, 'campaign-prologue');
  assert.equal(prologue.机制奖励?.已解锁?.includes('fieldRadar') || false, false, 'the prologue does not unlock the ecology radar');
  assert.equal(prologue.背包.物品.potion, 2);
  assert.equal(prologue.背包.物品.tm27, 0, 'the prologue does not grant TM27');
  assert.equal(prologue.剧情.关都主线.prologueRewardClaimed, true);
  assert.deepEqual(prologue.剧情.关都主线.prologueNewlyGranted, {gadgetIds:[],items:{potion:2}});
  const replay = campaign.apply(prologue, 'campaign-prologue');
  assert.equal(replay.背包.物品.potion, 2, 'replaying does not duplicate the two introductory potions');
  assert.equal(replay.剧情.关都主线.prologueNewlyGranted.items.potion, 2);
  assert.equal(replay.背包.物品.tm27, 0);

  const old = worldAt('pallet'); old.剧情.关都主线.prologueSeen = true;
  const migrated = campaign.apply(old, 'campaign-prologue');
  assert.equal(migrated.机制奖励?.已解锁?.includes('fieldRadar') || false, false);
  assert.equal(migrated.背包.物品.potion, 0, 'legacy seen prologue is not automatically paid again');
  assert.equal(migrated.背包.物品.tm27, 0, 'legacy seen prologue is not automatically paid TM27');
  assert.equal(migrated.剧情.关都主线.prologueRewardClaimed, false);

  let chapterWorld = worldAt('pewter'); chapterWorld.训练家.徽章 = ['岩石徽章'];
  const view = campaign.view(chapterWorld).scene;
  assert.equal(view.actor.name, '小刚');
  assert.equal(view.openQuestions.length, 2);
  assert.ok(view.choices[0].rewardPreview.gadgets.some(row => row.id === 'trainingTerminal'));
  const chosen = campaign.apply(chapterWorld, 'campaign-choice', {chapterId:'pewter-afterglow',choiceId:'listen-first'});
  assert.ok(chosen.机制奖励.已解锁.includes('trainingTerminal'));
  assert.deepEqual(chosen.剧情.关都主线.rewardClaims['pewter-afterglow'].gadgetIds, ['trainingTerminal']);

  chapterWorld.机制奖励 = {已解锁:['trainingTerminal']};
  const alternate = campaign.apply(chapterWorld, 'campaign-choice', {chapterId:'pewter-afterglow',choiceId:'keep-moving'});
  assert.equal(alternate.背包.物品.softsand, 1);
  assert.deepEqual(alternate.剧情.关都主线.rewardClaims['pewter-afterglow'].gadgetIds, []);
});

test('full reward inventory rejects event and campaign completion without mutating the supplied world', () => {
  let eventWorld = worldAt('viridian-forest');
  eventWorld = events.apply(eventWorld, 'kanto-story-event', {eventId:'forest-pikachu-grove',choiceId:'give-space'}, {storyTurn:1});
  eventWorld = events.apply(eventWorld, 'kanto-story-event', {eventId:'yellow-forest-listening',choiceId:'quiet-space'}, {storyTurn:2});
  eventWorld.背包.物品.soothebell = 999;
  const beforeEvent = structuredClone(eventWorld);
  assert.throws(() => events.apply(eventWorld, 'kanto-story-event', {eventId:'yellow-forest-listening',choiceId:'stay-and-care'}, {storyTurn:3}), /数量上限/);
  assert.deepEqual(eventWorld, beforeEvent);

  let campaignWorld = worldAt('pallet'); campaignWorld.剧情.关都主线.prologueSeen = false; campaignWorld.背包.物品.potion = 998;
  const beforeCampaign = structuredClone(campaignWorld);
  assert.throws(() => campaign.apply(campaignWorld, 'campaign-prologue'), /数量上限/);
  assert.deepEqual(campaignWorld, beforeCampaign);
});


test('legacy completed events and chapters are marked complete without retroactive reward claims', () => {
  const oldEvent = worldAt('viridian-forest');
  oldEvent.剧情.关都事件.进度['yellow-forest-listening'] = {阶段:'promise',完成:true,结果:'leave-a-sign',完成故事轮次:5,奖励:['soothebell']};
  events.ensure(oldEvent);
  assert.equal(oldEvent.剧情.关都事件.进度['yellow-forest-listening'].rewardClaimed, undefined);
  assert.equal(oldEvent.背包.物品.soothebell, 0);
  assert.equal(oldEvent.机制奖励, undefined);
  assert.throws(() => events.apply(oldEvent, 'kanto-story-event', {eventId:'yellow-forest-listening',choiceId:'leave-a-sign'}, {storyTurn:6}), /已经完成/);

  const oldChapter = worldAt('pewter'); oldChapter.训练家.徽章 = ['岩石徽章'];
  oldChapter.剧情.关都主线.choices['pewter-afterglow'] = 'listen-first';
  campaign.ensure(oldChapter);
  assert.deepEqual(oldChapter.剧情.关都主线.rewardClaims, {});
  assert.equal(oldChapter.机制奖励, undefined);
  assert.throws(() => campaign.apply(oldChapter, 'campaign-choice', {chapterId:'pewter-afterglow',choiceId:'keep-moving'}), /已经选择/);
});
