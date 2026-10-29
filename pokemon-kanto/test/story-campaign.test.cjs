'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mvu = require('../mvu.cjs');
const campaign = require('../story-campaign.cjs');

const BADGES = ['岩石徽章', '蓝色徽章', '橙色徽章', '彩虹徽章', '粉红徽章', '金色徽章', '深红徽章', '绿色徽章'];
const root = variables => variables.stat_data['宝可梦'];
function worldAt({ node = 'indigo', badges = 8, initialized = true } = {}) {
  let variables = mvu.createInitialMvu();
  if (initialized) variables = mvu.chooseStarter(variables, 1);
  const world = root(variables);
  world.训练家.徽章 = BADGES.slice(0, badges);
  world.地图.节点 = node;
  world.地图.地点 = node === 'indigo' ? '石英高原' : node === 'pewter' ? '尼比市' : '真新镇';
  world.地图.轮次 = 10;
  world.战斗 = { 轮次: 10, 状态: 'finished', 结果: '', 摘要: '', 操作序号: 0, 奖励: { 经验: [], 金币: 0, 物品: [], 徽章: [] } };
  world.遭遇 = null;
  return world;
}

test('ensure is idempotent, preserves unrelated world state, and prologue/chapters offer optional branch echoes', () => {
  const world = worldAt({ node: 'pewter', badges: 1 });
  world.customMarker = { keep: true };
  assert.equal(campaign.ensure(world), world);
  const first = structuredClone(world.剧情.关都主线);
  campaign.ensure(world);
  assert.deepEqual(world.剧情.关都主线, first);
  assert.deepEqual(world.customMarker, { keep: true });
  assert.ok(campaign.options(world).some(option => option.id === 'campaign-prologue'));
  const afterPrologue = campaign.apply(world, 'campaign-prologue');
  assert.equal(afterPrologue.剧情.关都主线.prologueSeen, true);
  assert.equal(world.剧情.关都主线.prologueSeen, false, 'apply returns an isolated updated world');
  const chapterOption = campaign.options(afterPrologue).find(option => option.id === 'campaign-choice');
  assert.equal(chapterOption.payload.chapterId, 'pewter-afterglow');
  const chosen = campaign.apply(afterPrologue, 'campaign-choice', { chapterId: 'pewter-afterglow', choiceId: 'listen-first' });
  assert.equal(chosen.剧情.关都主线.choices['pewter-afterglow'], 'listen-first');
  assert.equal(chosen.剧情.关都主线.bonds.brock, 1);
  assert.deepEqual(chosen.剧情.关都主线.flags, ['pewter-public-range']);
  assert.match(campaign.prompt(chosen), /尼比公开页列出三处可复核的岩层特征/);
  assert.throws(() => campaign.apply(chosen, 'campaign-choice', { chapterId: 'pewter-afterglow', choiceId: 'keep-moving' }), /已经选择/);
  assert.equal(campaign.validate(chosen), true);
});

test('eight badges at Indigo unlock tournament registration even when optional story branches are unfinished', () => {
  const seven = worldAt({ badges: 7 });
  assert.equal(campaign.canEnterElite(seven), false);
  assert.equal(campaign.options(seven).some(option => option.id === 'campaign-register-tournament'), false);

  const world = worldAt();
  const registration = campaign.options(world).find(option => option.id === 'campaign-register-tournament');
  assert.ok(registration?.enabled);
  const enrolled = campaign.apply(world, registration.id, registration.payload);
  assert.equal(enrolled.剧情.关都主线.tournament.status, 'active');
  assert.equal(enrolled.剧情.关都主线.tournament.attempt, 1);
  assert.equal(enrolled.剧情.关都主线.tournament.round, 1);
  assert.equal(enrolled.遭遇, null, 'registration does not begin a battle automatically');
  assert.equal(enrolled.战斗.状态, 'finished');
  assert.equal(campaign.canEnterElite(enrolled), false, 'a tournament entry is not Elite Four qualification');
  assert.equal(campaign.validate(enrolled), true);
});

test('tournament rounds are explicit trainer encounters with increasing field strength and no gym identity', () => {
  let world = campaign.apply(worldAt(), 'campaign-register-tournament', { tournamentId: 'indigo-tournament' });
  for (let round = 1; round <= 6; round++) {
    const option = campaign.options(world).find(entry => entry.id === 'campaign-enter-round');
    assert.ok(option?.enabled, `round ${round} can be entered`);
    world = campaign.apply(world, option.id, option.payload);
    const encounter = world.遭遇;
    assert.equal(encounter.campaignId, 'indigo-tournament');
    assert.equal(encounter.tournamentRound, round);
    assert.equal(encounter.tournamentAttempt, 1);
    assert.equal(encounter.类型, 'trainer');
    assert.equal(Object.hasOwn(encounter, '道馆'), false);
    assert.equal(world.战斗.状态, 'pending');
    assert.ok(encounter.队伍.length >= 1 && encounter.队伍.length <= 6);
    const specs = encounter.队伍.map(mon => mvu.makeMon(mon.speciesId, mon.level, mon.uid));
    const valid = structuredClone(world);
    valid.遭遇.队伍 = specs;
    assert.doesNotThrow(() => mvu.validateMvu({ stat_data: { 宝可梦: valid } }), 'host can hydrate raw team specs using makeMon');
    world.战斗.状态 = 'finished';
    world.战斗.结果 = 'win';
    if (round < 6) {
      world = campaign.onBattleResult(world, encounter, 'win');
      assert.equal(world.遭遇, encounter, 'result callback keeps the just-completed encounter for battle report');
      assert.equal(world.战斗.状态, 'finished', 'result callback leaves the completed battle untouched');
      assert.equal(world.剧情.关都主线.tournament.round, round + 1);
    } else {
      world = campaign.onBattleResult(world, encounter, 'win');
    }
  }
  assert.equal(campaign.canEnterElite(world), true);
  assert.equal(world.剧情.关都主线.tournament.status, 'champion');
  assert.equal(world.背包.关键物品.filter(item => item.id === 'indigo-champion-banner').length, 1);
  const stale = structuredClone(world.遭遇);
  campaign.onBattleResult(world, stale, 'win');
  assert.equal(world.背包.关键物品.filter(item => item.id === 'indigo-champion-banner').length, 1, 'duplicate result callbacks cannot duplicate the champion reward');

  const rounds = campaign.data().tournament.rounds;
  assert.equal(campaign.data().tournament.bracketSize, 64);
  assert.equal(campaign.data().tournament.winsToChampion, 6);
  for (let index = 1; index < rounds.length; index++) {
    assert.ok(rounds[index].species.length >= rounds[index - 1].species.length, 'teams do not shrink as the bracket advances');
    assert.ok(rounds[index].levels.reduce((sum, level) => sum + level, 0) / rounds[index].levels.length >= rounds[index - 1].levels.reduce((sum, level) => sum + level, 0) / rounds[index - 1].levels.length, 'average opponent level progresses');
  }
});

test('loss ends the attempt, permits a new entry, and stale or unrelated results cannot advance it', () => {
  let world = campaign.apply(worldAt(), 'campaign-register-tournament', { tournamentId: 'indigo-tournament' });
  let entry = campaign.options(world).find(option => option.id === 'campaign-enter-round');
  world = campaign.apply(world, entry.id, entry.payload);
  const firstEncounter = structuredClone(world.遭遇);
  world.战斗.状态 = 'finished';
  world.战斗.结果 = 'lose';
  world = campaign.onBattleResult(world, firstEncounter, 'lose');
  assert.equal(world.剧情.关都主线.tournament.status, 'eliminated');
  assert.equal(world.剧情.关都主线.tournament.history[0].roundsWon, 0);
  assert.equal(world.遭遇.campaignId, 'indigo-tournament');
  assert.equal(campaign.options(world).find(option => option.id === 'campaign-register-tournament').enabled, true);
  world = campaign.apply(world, 'campaign-register-tournament', { tournamentId: 'indigo-tournament' });
  assert.equal(world.剧情.关都主线.tournament.attempts, 2);
  assert.equal(world.剧情.关都主线.tournament.round, 1);
  campaign.onBattleResult(world, firstEncounter, 'win');
  assert.equal(world.剧情.关都主线.tournament.round, 1, 'previous attempt result cannot advance the current attempt');
  assert.equal(campaign.canEnterElite(world), false);
});

test('campaign portrait IDs resolve against the existing trainer manifest', () => {
  const data = campaign.data();
  const trainers = require('../public/data/trainers.json');
  const ids = new Set(trainers.map(trainer => trainer.id));
  const portraits = [
    ...data.prologue.speakers.map(person => person.portraitId),
    ...data.chapters.flatMap(chapter => chapter.speakers.map(person => person.portraitId)),
    ...data.tournament.rounds.map(round => round.portraitId),
  ];
  assert.ok(portraits.every(id => ids.has(id)), `missing portrait IDs: ${portraits.filter(id => !ids.has(id)).join(', ')}`);
});

test('campaign continuity uses valid map, scene, music, and portrait references with distinct character identities', () => {
  const data = campaign.data();
  const map = require('../public/data/map.json');
  const backgrounds = require('../public/data/backgrounds.json');
  const audio = require('../public/data/story-audio.json');
  const trainers = require('../public/data/trainers.json');
  const nodes = new Set(map.map(node => node.id));
  const sceneTags = new Set(backgrounds.flatMap(background => background.sceneTags || []));
  const portraits = new Set(trainers.map(trainer => trainer.id));
  assert.deepEqual(data.chapters.map(chapter => chapter.badgeCount), [1, 2, 3, 4, 5, 6, 7, 8]);
  for (let i = 0; i < data.chapters.length; i++) {
    const chapter = data.chapters[i];
    assert.ok(nodes.has(chapter.location), `${chapter.id} location exists`);
    assert.ok(sceneTags.has(chapter.sceneTag), `${chapter.id} sceneTag exists`);
    assert.ok(Object.hasOwn(audio.events, chapter.musicEvent), `${chapter.id} music event exists`);
    assert.ok(chapter.trigger && chapter.conflict && chapter.continuity.evidence && chapter.continuity.next);
    assert.equal(chapter.continuity.threadId, data.continuity.id);
    assert.equal(chapter.choices.length, 2);
    for (const speaker of chapter.speakers) assert.ok(portraits.has(speaker.portraitId), `${speaker.id} portrait exists`);
    for (const choice of chapter.choices) {
      assert.ok(choice.tradeoff && choice.consequence && choice.echo);
      assert.equal(choice.followup.chapterId, data.chapters[i + 1]?.id || 'tournament');
      assert.ok(choice.followup.text && choice.followup.text !== choice.echo);
    }
    assert.notEqual(chapter.choices[0].followup.text, chapter.choices[1].followup.text);
  }
  const identities = data.continuity.identityRules.join('\n');
  assert.match(identities, /青绿（特别篇）.*不等于小茂/);
  assert.match(identities, /赤红（特别篇）.*不替代小智/);
  assert.ok(portraits.has('manga-red') && portraits.has('manga-green') && portraits.has('manga-blue'));
  assert.ok(portraits.has('rival_late') && portraits.has('trainer_ash'));
  const gary = data.chapters.find(chapter => chapter.id === 'saffron-reflection').speakers.find(person => person.id === 'gary');
  const mangaGreen = data.chapters.find(chapter => chapter.id === 'saffron-reflection').speakers.find(person => person.id === 'manga-green');
  assert.equal(gary.portraitId, 'rival_late');
  assert.equal(mangaGreen.portraitId, 'manga-green');
});

test('view and prompt expose only branch echoes targeted at the current chapter or tournament', () => {
  const pewter = worldAt({ node: 'pewter', badges: 1 });
  pewter.剧情.初始御三家已选 = true;
  pewter.剧情.关都主线.prologueSeen = true;
  const selected = campaign.apply(pewter, 'campaign-choice', { chapterId: 'pewter-afterglow', choiceId: 'listen-first' });
  const cerulean = worldAt({ node: 'cerulean', badges: 2 });
  cerulean.剧情.关都主线 = structuredClone(selected.剧情.关都主线);
  const context = campaign.view(cerulean);
  assert.equal(context.phase, 'chapter');
  assert.equal(context.scene.id, 'cerulean-crossing');
  assert.equal(context.branchEchoes.length, 1);
  assert.match(context.branchEchoes[0].text, /小霞收到公开的三处岩层范围/);
  assert.doesNotMatch(campaign.prompt(cerulean), /尼比公开页列出三处可复核的岩层特征/);
  assert.match(campaign.prompt(cerulean), /立场冲突：/);
  assert.match(campaign.prompt(cerulean), /代价：/);

  const finalWorld = worldAt();
  finalWorld.剧情.关都主线.prologueSeen = true;
  finalWorld.剧情.关都主线.echoes = [{ chapterId: 'viridian-cedar', choiceId: 'refuse-the-spectacle', text: '摘要先行', followup: { chapterId: 'tournament', text: '复核期限已登记' } }];
  assert.deepEqual(campaign.view(finalWorld).branchEchoes.map(entry => entry.text), ['复核期限已登记']);
  assert.match(campaign.prompt(finalWorld), /复核期限已登记/);
});
