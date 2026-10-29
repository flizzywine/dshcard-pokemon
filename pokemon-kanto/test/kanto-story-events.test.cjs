const test = require('node:test');
const assert = require('node:assert/strict');
const events = require('../kanto-story-events.cjs');
const mvu = require('../mvu.cjs');
const map = require('../public/data/map.json');
const trainers = require('../public/data/trainers.json');

function world(node, badges = [], extra = {}) {
  return {
    地图: {节点: node, 轮次: 3},
    剧情: {初始御三家已选: true, 关都事件: {版本: 1, 进度: {}, 标记: {}, 记录: []}},
    战斗: {状态: 'finished'}, 训练家: {徽章: badges},
    背包: {物品: Object.fromEntries(['hm01', 'hm02', 'hm03', 'hm04', 'greatball', 'maxpotion'].map(id => [id, 0]))},
    ...extra,
  };
}

function choose(input, eventId, choiceId, storyTurn = 1) {
  return events.apply(input, 'kanto-story-event', {eventId, choiceId}, {storyTurn});
}

test('event locations and portraits resolve to existing Kanto data, with no added nodes', () => {
  const nodeIds = new Set(map.map(node => node.id));
  const trainerIds = new Set(trainers.map(trainer => trainer.id));
  assert.equal(events.EVENTS.length, 23);
  for (const event of events.EVENTS) {
    assert.ok(nodeIds.has(event.node), `${event.id} uses existing map node ${event.node}`);
    assert.ok(trainerIds.has(event.portraitId), `${event.id} uses existing character portrait ${event.portraitId}`);
    assert.ok(event.stages.length > 0);
    for (const stage of event.stages) {
      assert.ok(stage.choices.length >= 1 && stage.choices.length <= 3);
      if (stage.node) assert.ok(nodeIds.has(stage.node), `${event.id}/${stage.id} uses existing map node ${stage.node}`);
      for (const choice of stage.choices) if (choice.nextStage) assert.ok(event.stages.some(row => row.id === choice.nextStage), `${event.id}/${choice.id} has a valid next stage`);
      if (stage.portraitId) assert.ok(trainerIds.has(stage.portraitId), `${event.id}/${stage.id} portrait ${stage.portraitId} exists`);
    }
  }
});

test('S.S. Anne has explicit ticket/badge gates, a retryable failure, and one-time HM01 reward', () => {
  let state = world('vermilion', ['岩石徽章']);
  const locked = events.options(state).find(option => option.payload.eventId === 'ss-anne-captain');
  assert.equal(locked.enabled, false);
  state.剧情.关都事件.标记.ssTicket = true;
  let option = events.options(state).find(row => row.payload.eventId === 'ss-anne-captain');
  assert.equal(option.enabled, true);
  const original = structuredClone(state);
  state = choose(state, 'ss-anne-captain', 'rush-deck', 5);
  assert.deepEqual(original.剧情.关都事件.进度, {}, 'apply works on a clone');
  assert.equal(state.背包.物品.hm01, 0);
  assert.equal(state.剧情.剧场.最近动作, 'kanto-story-event');
  assert.match(state.剧情.剧场.对白, /船员拦住/);
  state = choose(state, 'ss-anne-captain', 'ask-crew', 6);
  assert.equal(state.剧情.关都事件.进度['ss-anne-captain'].阶段, 'captain');
  state = choose(state, 'ss-anne-captain', 'care-captain', 7);
  assert.equal(state.背包.物品.hm01, 1);
  assert.equal(state.剧情.关都事件.进度['ss-anne-captain'].完成, true);
  assert.throws(() => choose(state, 'ss-anne-captain', 'care-captain', 8), /已经完成/);
  assert.equal(state.背包.物品.hm01, 1);
});

test('HM02 depends on bike events and the current node; false outcomes do not unlock the next step', () => {
  let state = world('vermilion');
  state = choose(state, 'vermilion-bike-voucher', 'listen-politely', 1);
  state = choose(state, 'vermilion-bike-voucher', 'take-voucher', 2);
  assert.equal(state.剧情.关都事件.标记.bikeVoucher, true);
  state.地图.节点 = 'cerulean';
  state = choose(state, 'celadon-bike-exchange', 'rush-out', 3);
  assert.equal(state.剧情.关都事件.标记.bicycle, undefined);
  state = choose(state, 'celadon-bike-exchange', 'safety-check', 4);
  assert.equal(state.剧情.关都事件.标记.bicycle, true);
  state.地图.节点 = 'route16';
  state = choose(state, 'route16-fly-house', 'quiet-knock', 5);
  state = choose(state, 'route16-fly-house', 'accept-fly', 6);
  assert.equal(state.背包.物品.hm02, 1);
});

test('Safari events require explicit route choices and return gold teeth before HM04', () => {
  let state = world('safari');
  state = choose(state, 'safari-secret-house-surf', 'follow-map', 1);
  state = choose(state, 'safari-secret-house-surf', 'promise-care', 2);
  assert.equal(state.背包.物品.hm03, 1);
  state = choose(state, 'safari-gold-teeth-strength', 'yank-post', 3);
  assert.equal(state.背包.物品.hm04, 0);
  assert.equal(state.剧情.关都事件.标记.safariGoldTeeth, undefined);
  state = choose(state, 'safari-gold-teeth-strength', 'lift-post', 4);
  assert.equal(state.剧情.关都事件.进度['safari-gold-teeth-strength'].阶段, 'return-teeth');
  assert.throws(()=>choose(state, 'safari-gold-teeth-strength', 'return-to-keeper', 5),/当前地点/);
  state.地图.节点='fuchsia';
  state = choose(state, 'safari-gold-teeth-strength', 'return-to-keeper', 5);
  assert.equal(state.背包.物品.hm04, 1);
  assert.equal(state.剧情.关都事件.标记.safariGoldTeeth, true);
});

test('Rocket events advance through explicit discovery/rescue and expose persistent plot tools', () => {
  let state = world('celadon');
  state = choose(state, 'celadon-rocket-hideout', 'inspect-poster', 1);
  state = choose(state, 'celadon-rocket-hideout', 'rescue-researcher', 2);
  assert.equal(state.剧情.关都事件.标记.rocketHideoutCleared, true);
  assert.equal(state.剧情.关都事件.标记.silphScope, true);
  const prompt = events.prompt(state);
  assert.match(prompt, /游戏厅的暗门/);
  state.地图.节点 = 'lavender';
  const storyView = events.view(state);
  assert.equal(storyView.scene.portraitId, 'channeler');
  assert.match(storyView.scene.text, /检视镜/);
});

test('missing reward slots and wrong map/actions fail atomically', () => {
  let state = world('safari');
  state = choose(state, 'safari-secret-house-surf', 'follow-map', 1);
  delete state.背包.物品.hm03;
  const before = structuredClone(state);
  assert.throws(() => choose(state, 'safari-secret-house-surf', 'promise-care', 2), /背包未配置hm03/);
  assert.deepEqual(state, before);
  assert.throws(() => choose(state, 'safari-secret-house-surf', 'promise-care', 2), /背包未配置hm03/);
  assert.throws(() => events.apply(state, 'kanto-story-event', {eventId: 'ss-anne-captain', choiceId: 'ask-crew'}, {storyTurn: 2}), /当前地点/);
  const activeBattle = {...state, 战斗: {状态: 'active'}};
  assert.throws(() => choose(activeBattle, 'safari-secret-house-surf', 'promise-care', 2), /完成当前遭遇/);
});

test('ensure migrates old saves and validate rejects forged event progress', () => {
  const old = world('viridian-forest');
  delete old.剧情.关都事件;
  events.ensure(old);
  assert.deepEqual(old.剧情.关都事件, {版本: 1, 进度: {}, 标记: {}, 记录: []});
  assert.equal(events.validate(old), true);
  old.剧情.关都事件.进度.unknown = {阶段: 'boss', 完成: false};
  assert.throws(() => events.validate(old), /进度无效/);
});

test('Route 3 partner training and camp reflection retain actor, location, director flags, and ending choice', () => {
  let state = world('route3');
  let view = events.view(state), event = view.events.find(row => row.id === 'route3-partner-camp');
  assert.equal(event.speaker, '小智'); assert.equal(event.portraitId, 'trainer_ash');
  assert.equal(event.sceneTag, 'camp'); assert.equal(event.musicEvent, 'quietReflection');
  state = choose(state, event.id, 'safe-route', 10);
  assert.equal(state.剧情.关都事件.标记.route3TrainingProtected, true);
  assert.equal(state.剧情.剧场.sceneTag, 'camp');
  assert.equal(state.剧情.剧场.musicEvent, 'quietReflection');
  assert.deepEqual(require('../scene-context.cjs').sceneContext(state), {sceneTag:'camp',musicEvent:'quietReflection'});
  assert.match(state.剧情.剧场.对白, /^小智：/);
  view = events.view(state); event = view.events.find(row => row.id === 'route3-partner-camp');
  assert.equal(event.speaker, '小刚'); assert.equal(event.portraitId, 'brock');
  assert.equal(view.scene.speaker, '小刚'); assert.equal(view.scene.portraitId, 'brock');
  assert.equal(view.scene.sceneTag, 'camp'); assert.equal(view.scene.musicEvent, 'quietReflection');
  assert.throws(() => choose({...state,地图:{...state.地图,节点:'route4'}}, event.id, 'share-record', 11), /当前地点/);
  state = choose(state, event.id, 'share-record', 11);
  assert.equal(state.剧情.关都事件.标记.route3CampShared, true);
  assert.equal(events.prompt(state).includes('搭档练习'), true, 'the director receives the recorded event');
  assert.throws(() => choose(state, event.id, 'keep-record', 12), /已经完成/);
  assert.equal(state.剧情.关都事件.记录.length, 2);
});

test('Vermilion Jessie and James story is optional, non-combat, and offers distinct costs', () => {
  let state = world('vermilion');
  let event = events.view(state).events.find(row => row.id === 'vermilion-rocket-promise');
  assert.equal(event.speaker, '武藏'); assert.equal(event.portraitId, 'trainer_jessie');
  assert.equal(event.status, 'available');
  state = choose(state, event.id, 'set-boundary', 20);
  assert.equal(state.剧情.关都事件.进度[event.id].阶段, 'promise-choice');
  event = events.view(state).events.find(row => row.id === 'vermilion-rocket-promise');
  assert.equal(event.speaker, '小次郎'); assert.equal(event.portraitId, 'trainer_james');
  assert.equal(state.战斗.状态, 'finished', 'no battle is required or launched');
  state = choose(state, event.id, 'make-amends-public', 21);
  assert.equal(state.剧情.关都事件.标记.rocketPartnerBoundary, true);
  assert.equal(state.剧情.关都事件.标记.rocketPartnerRestitution, true);
  assert.deepEqual(state.背包.物品, world('vermilion').背包.物品, 'the story grants no invented inventory reward');
  assert.throws(() => choose(state, event.id, 'leave-choice-open', 22), /已经完成/);
});

test('Saffron manga trio follows the existing Silph rescue flag and records evidence disposition', () => {
  let state = world('celadon');
  state = choose(state, 'celadon-rocket-hideout', 'inspect-poster', 30);
  state = choose(state, 'celadon-rocket-hideout', 'rescue-researcher', 31);
  state.地图.节点 = 'saffron';
  state = choose(state, 'saffron-silph-rescue', 'map-route', 32);
  state = choose(state, 'saffron-silph-rescue', 'free-everyone', 33);
  assert.equal(state.剧情.关都事件.标记.silphCoSafe, true);
  let event = events.view(state).events.find(row => row.id === 'saffron-manga-evidence');
  assert.equal(event.status, 'available');
  assert.equal(event.speaker, '赤红（特别篇）'); assert.equal(event.portraitId, 'manga-red');
  assert.equal(event.sceneTag, 'rocket-base'); assert.equal(event.musicEvent, 'silphCo');
  state = choose(state, event.id, 'record-chain', 34);
  event = events.view(state).events.find(row => row.id === 'saffron-manga-evidence');
  assert.equal(event.speaker, '青绿（特别篇）'); assert.equal(event.portraitId, 'manga-green');
  assert.equal(events.view(state).scene.portraitId, 'manga-green');
  state = choose(state, event.id, 'preserve-original', 35);
  event = events.view(state).events.find(row => row.id === 'saffron-manga-evidence');
  assert.equal(event.speaker, '小蓝（特别篇）'); assert.equal(event.portraitId, 'manga-blue');
  assert.equal(events.view(state).scene.portraitId, 'manga-blue');
  state = choose(state, event.id, 'seal-with-review-date', 36);
  assert.equal(state.剧情.关都事件.标记.saffronEvidenceChainLogged, true);
  assert.equal(state.剧情.关都事件.标记.saffronEvidenceSealed, true);
  assert.equal(state.剧情.关都事件.标记.saffronEvidenceReviewScheduled, true);
  assert.equal(state.剧情.关都事件.记录.filter(row => row.id === event.id).length, 3);
});

test('Seafoam rescue requires HM03 and the Soul Badge threshold, then honors Pokémon signals', () => {
  let state = world('seafoam');
  let event = events.view(state).events.find(row => row.id === 'seafoam-autonomous-rescue');
  assert.equal(event.status, 'locked');
  assert.match(event.reason, /HM03冲浪/);
  state.背包.物品.hm03 = 1;
  assert.equal(events.view(state).events.find(row => row.id === event.id).status, 'locked');
  state.训练家.徽章 = ['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章'];
  assert.match(events.view(state).events.find(row => row.id === event.id).reason, /5枚徽章/);
  state.训练家.徽章.push('粉红徽章');
  event = events.view(state).events.find(row => row.id === event.id);
  assert.equal(event.status, 'available');
  assert.equal(event.portraitId, 'misty'); assert.equal(event.sceneTag, 'coast');
  assert.equal(event.musicEvent, 'surfing');
  state = choose(state, event.id, 'wait-for-signal', 40);
  event = events.view(state).events.find(row => row.id === 'seafoam-autonomous-rescue');
  assert.equal(event.speaker, '小刚'); assert.equal(event.portraitId, 'brock');
  state = choose(state, event.id, 'hold-and-observe', 41);
  assert.equal(state.剧情.关都事件.标记.seafoamSignalRespected, true);
  assert.equal(state.剧情.关都事件.标记.seafoamCrewRescued, true);
  assert.equal(state.剧情.关都事件.标记.seafoamNestProtected, true);
  assert.deepEqual(state.背包.物品, {...world('seafoam').背包.物品, hm03:1}, 'no fabricated reward is issued');
});

test('Bill lighthouse event tracks an unknown signal without assigning the silhouette a species or measured size', () => {
  let state = world('route25');
  let option = events.options(state).find(row => row.payload.eventId === 'bill-lighthouse-unknown');
  assert.equal(option.enabled, false, 'Bill must be helped before the lighthouse record appears');
  state = choose(state, 'bill-cottage-ticket', 'check-console', 50);
  state = choose(state, 'bill-cottage-ticket', 'accept-ticket', 51);
  assert.equal(state.剧情.关都事件.标记.billHelped, true);
  let event = events.view(state).events.find(row => row.id === 'bill-lighthouse-unknown');
  assert.equal(event.status, 'available');
  state = choose(state, event.id, 'low-power-listen', 52);
  event = events.view(state).events.find(row => row.id === 'bill-lighthouse-unknown');
  assert.equal(event.speaker, '小智'); assert.equal(event.portraitId, 'trainer_ash');
  assert.match(event.text, /量程|尺寸/);
  state = choose(state, event.id, 'log-as-unknown', 53);
  assert.equal(state.剧情.关都事件.标记.billGiantEchoLogged, true);
  assert.equal(state.剧情.关都事件.标记.billGiantIdentityUnconfirmed, true);
  assert.equal(state.背包.物品.greatball, 0, 'an unverified encounter does not grant or imply a capture');
  assert.equal(state.剧情.关都事件.进度[event.id].完成, true);
});

test('Rocket trio can prioritize freeing a partner or trade a bounded clue; verified items settle once', () => {
  let state = world('celadon');
  assert.equal(events.view(state).events.find(row => row.id === 'celadon-rocket-trio-ledger').status, 'locked', 'unavailable until the Rocket hideout is cleared');
  state = choose(state, 'celadon-rocket-hideout', 'inspect-poster', 60);
  state = choose(state, 'celadon-rocket-hideout', 'rescue-researcher', 61);
  let event = events.view(state).events.find(row => row.id === 'celadon-rocket-trio-ledger');
  assert.equal(event.status, 'available'); assert.equal(event.portraitId, 'trainer_jessie');
  const afterOrder = choose(state, event.id, 'rescue-first', 62);
  const blockedPayout = structuredClone(afterOrder); delete blockedPayout.背包.物品.maxpotion;
  assert.throws(() => choose(blockedPayout, event.id, 'escort-partner', 63), /背包未配置maxpotion/);
  assert.equal(blockedPayout.剧情.关都事件.进度[event.id].完成, false);
  state = choose(afterOrder, event.id, 'escort-partner', 63);
  assert.equal(state.剧情.关都事件.标记.rocketTrioPartnerRescued, true);
  assert.equal(state.剧情.关都事件.标记.rocketTrioDefiedOrder, true);
  assert.equal(state.背包.物品.maxpotion, 1);

  let clueState = choose(choose(world('celadon'), 'celadon-rocket-hideout', 'inspect-poster', 64), 'celadon-rocket-hideout', 'rescue-researcher', 65);
  clueState = choose(clueState, 'celadon-rocket-trio-ledger', 'trade-for-route', 66);
  clueState = choose(clueState, 'celadon-rocket-trio-ledger', 'exchange-redacted-code', 67);
  assert.equal(clueState.剧情.关都事件.标记.rocketTrioClueShared, true);
  assert.equal(clueState.剧情.关都事件.标记.rocketTrioPartnerRescued, true);
  assert.equal(clueState.背包.物品.greatball, 2);
});

test('Special Chapter Rocket rescue/evidence branches carry Red, Green, and Blue from Silph to Viridian', () => {
  let state = world('celadon');
  state = choose(state, 'celadon-rocket-hideout', 'inspect-poster', 70);
  state = choose(state, 'celadon-rocket-hideout', 'rescue-researcher', 71);
  state.地图.节点 = 'saffron';
  state = choose(state, 'saffron-silph-rescue', 'map-route', 72);
  state = choose(state, 'saffron-silph-rescue', 'free-everyone', 73);
  const start = structuredClone(state);
  const eventDef = events.EVENTS.find(row => row.id === 'saffron-viridian-rocket-ledger');
  assert.deepEqual(eventDef.stages.slice(0, 3).map(stage => stage.portraitId), ['manga-red', 'manga-green', 'manga-blue']);
  let event = events.view(state).events.find(row => row.id === eventDef.id);
  assert.equal(event.status, 'available'); assert.equal(event.portraitId, 'manga-red');
  state = choose(state, event.id, 'follow-the-ledger', 74);
  assert.equal(events.view(state).events.some(row => row.id === event.id), false, 'follow-up waits at its authored next node');
  state.地图.节点 = 'viridian';
  event = events.view(state).events.find(row => row.id === eventDef.id);
  assert.equal(event.speaker, '小蓝（特别篇）'); assert.equal(event.portraitId, 'manga-blue');
  state = choose(state, event.id, 'publish-redacted-route', 75);
  assert.equal(state.剧情.关都事件.标记.mangaRocketEvidenceTrack, true);
  assert.equal(state.剧情.关都事件.标记.mangaRocketRoutePublished, true);
  assert.equal(state.背包.物品.greatball, 2);

  let rescueState = choose(start, eventDef.id, 'follow-the-witness', 76);
  rescueState.地图.节点 = 'viridian';
  event = events.view(rescueState).events.find(row => row.id === eventDef.id);
  assert.equal(event.speaker, '青绿（特别篇）'); assert.equal(event.portraitId, 'manga-green');
  rescueState = choose(rescueState, event.id, 'shelter-without-statement', 77);
  assert.equal(rescueState.剧情.关都事件.标记.mangaRocketWitnessSheltered, true);
  assert.equal(rescueState.剧情.关都事件.标记.mangaRocketNamesSealed, true);
  assert.equal(rescueState.背包.物品.maxpotion, 2);
});

test('Route 24 abandoned partner becomes available only after a real camp rest, and never forces capture', () => {
  let state = world('route24');
  const eventId = 'route24-abandoned-partner';
  state = choose(state, eventId, 'leave-water-and-space', 80);
  assert.equal(state.剧情.关都事件.进度[eventId].阶段, 'camp-rest');
  state.地图.节点 = 'route25';
  assert.equal(events.view(state).events.find(row => row.id === eventId).status, 'locked');
  assert.match(events.view(state).events.find(row => row.id === eventId).reason, /露营\/休整/);

  const variables = mvu.createInitialMvu();
  const campWorld = variables.stat_data.宝可梦;
  campWorld.地图.节点 = 'route25'; campWorld.地图.轮次 = 81;
  campWorld.剧情.初始御三家已选 = true; campWorld.战斗.状态 = 'finished';
  const rested = mvu.theaterAction(variables, 'camp', {mode:'rest', storyTurn:81});
  state.委托 = rested.stat_data.宝可梦.委托;
  assert.equal(state.委托.事件.at(-2).action, 'camp');
  assert.equal(state.委托.事件.at(-1).action, 'care');
  state = choose(state, eventId, 'offer-voluntary-company', 82);
  assert.equal(state.剧情.关都事件.标记.route24PartnerChoiceHonored, true);
  assert.equal(state.剧情.关都事件.标记.route24PartnerCareLogged, true);
  assert.equal(state.剧情.关都事件.进度[eventId].完成, true);
  assert.equal(state.剧情.关都事件.标记.route24PartnerCaptured, undefined);
  assert.equal(state.队伍, undefined, 'story event does not add a Pokémon to the party');
  assert.equal(state.背包.物品.maxpotion, 1);
  assert.throws(() => choose(state, eventId, 'hand-over-care-map', 83), /已经完成/);
  assert.equal(state.背包.物品.maxpotion, 1, 'the reward cannot be claimed twice');
});

test('Vermilion migration branches leave owned Pokémon intact and record voluntary farewell', () => {
  const party = [{uid:'owned-butterfree',图鉴编号:12,昵称:'花粉'}];
  let state = {...world('vermilion'),队伍:structuredClone(party)};
  const eventId = 'vermilion-butterfree-migration';
  state = choose(state, eventId, 'clear-the-cable', 90);
  state = choose(state, eventId, 'escort-to-breakwater', 91);
  assert.equal(state.剧情.关都事件.标记.vermilionButterfreeEscorted, true);
  assert.equal(state.剧情.关都事件.标记.vermilionButterfreeFarewellOpen, true);
  assert.deepEqual(state.队伍, party, 'the migration scene does not release or remove an owned Pokémon');
  assert.equal(state.背包.物品.greatball, 1);
  assert.throws(() => choose(state, eventId, 'open-the-harbor-lane', 92), /已经完成/);
  assert.equal(state.背包.物品.greatball, 1, 'the story reward is one-time');

  let other = {...world('vermilion'),队伍:structuredClone(party)};
  other = choose(other, eventId, 'ask-for-tide-window', 93);
  other = choose(other, eventId, 'open-the-harbor-lane', 94);
  assert.equal(other.剧情.关都事件.标记.vermilionButterfreeRouteOpen, true);
  assert.deepEqual(other.队伍, party);
});

test('Rocket evidence chain gates Giovanni finale, stages traverse Celadon-Saffron-Viridian, and choices preserve consequences', () => {
  let state = world('celadon');
  state = choose(state, 'celadon-rocket-hideout', 'inspect-poster', 100);
  state = choose(state, 'celadon-rocket-hideout', 'rescue-researcher', 101);
  state = choose(state, 'celadon-rocket-trio-ledger', 'rescue-first', 102);
  state = choose(state, 'celadon-rocket-trio-ledger', 'leave-choice-open', 103);
  assert.equal(state.剧情.关都事件.标记.rocketTrioThreadStarted, true);
  assert.equal(events.view(state).events.find(row => row.id === 'rocket-celadon-saffron-viridian').status, 'locked', 'the finale waits for the Special Chapter evidence chain');
  state.地图.节点 = 'saffron';
  state = choose(state, 'saffron-silph-rescue', 'map-route', 104);
  state = choose(state, 'saffron-silph-rescue', 'free-everyone', 105);
  state = choose(state, 'saffron-viridian-rocket-ledger', 'follow-the-witness', 106);
  state.地图.节点 = 'viridian';
  state = choose(state, 'saffron-viridian-rocket-ledger', 'voluntary-statement', 107);
  assert.equal(state.剧情.关都事件.标记.mangaRocketRecordReceived, true);
  state.地图.节点 = 'celadon';
  let event = events.view(state).events.find(row => row.id === 'rocket-celadon-saffron-viridian');
  assert.equal(event.status, 'available'); assert.equal(event.portraitId, 'giovanni');
  state = choose(state, event.id, 'copy-cargo-ledger', 109);
  assert.equal(state.剧情.关都事件.进度[event.id].阶段, 'saffron-cost');
  assert.equal(events.view(state).events.find(row => row.id === event.id), undefined);
  state.地图.节点 = 'saffron';
  state = choose(state, event.id, 'keep-copy-and-take-long-route', 110);
  assert.equal(state.剧情.关都事件.标记.rocketFinalCopyPreserved, true);
  state.地图.节点 = 'viridian';
  state = choose(state, event.id, 'withdraw-with-witnesses', 111);
  assert.equal(state.剧情.关都事件.标记.rocketFinalLedgerSealed, true);
  assert.equal(state.剧情.关都事件.标记.rocketFinalReviewDated, true);
  assert.equal(state.剧情.关都事件.进度[event.id].完成, true);
  assert.equal(state.背包.物品.maxpotion, 2);
  assert.throws(() => choose(state, event.id, 'publish-redacted-ledger', 112), /已经完成/);
  assert.equal(state.背包.物品.maxpotion, 2);
});


test('lighthouse egg is awarded once on each ending, survives saves and hatches after distinct story turns', () => {
  const services = require('../classic-services.cjs');
  for (const [first, last] of [['low-power-listen','log-as-unknown'],['low-power-listen','seal-the-bearing'],['silence-the-horn','wait-another-tide'],['silence-the-horn','warn-coastal-boats']]) {
    let w = world('route25');
    w = choose(choose(w,'bill-cottage-ticket','check-console',1),'bill-cottage-ticket','accept-ticket',2);
    w = choose(w,'bill-lighthouse-unknown',first,3);
    const full=services.ensure(w); full.经典设施.daycare.eggs=Array.from({length:99},(_,i)=>({id:`full-${i}`,species:1,turnsLeft:2}));
    assert.throws(()=>choose(full,'bill-lighthouse-unknown',last,4),/空间已满/);
    assert.equal(full.剧情.关都事件.进度['bill-lighthouse-unknown'].完成,false);
    w=choose(w,'bill-lighthouse-unknown',last,4);
    assert.equal(w.经典设施.daycare.eggs.length,1);
    assert.equal(w.经典设施.daycare.eggs[0].species,147);
    assert.match(services.view(w).daycare.eggs[0].description,/巨型迷你龙/);
    assert.throws(()=>choose(w,'bill-lighthouse-unknown',last,5),/已经完成/);
    w=JSON.parse(JSON.stringify(w));
    for(let t=5;t<=12;t++) { w=services.advanceDaycareTurn(w,{storyTurn:t}); w=services.advanceDaycareTurn(w,{storyTurn:t}); }
    assert.equal(w.经典设施.daycare.eggs[0].turnsLeft,0);
    w=services.apply(w,'classic-egg-hatch',{}, {storyTurn:13});
    const mon=[...w.队伍,...w.电脑].find(m=>m.图鉴编号===147);
    assert.ok(mon); assert.equal(mon.体型标记,'lighthouse-giant-dratini'); assert.match(mon.孵化来源.说明,/灯塔救护/); assert.equal(JSON.parse(JSON.stringify(w)).队伍.find(m=>m.uid===mon.uid)?.体型标记,'lighthouse-giant-dratini');
    assert.equal(w.经典设施.daycare.eggs.length,0);
  }
});
