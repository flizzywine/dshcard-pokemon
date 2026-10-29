'use strict';

const fs = require('node:fs');
const path = require('node:path');
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data/kanto-campaign.json'), 'utf8'));
const ITEM_CATALOG = [...require('./public/data/items.json'), ...require('./public/data/field-items.json'), ...require('./public/data/tmhm.json')];
const ITEM_BY_ID = new Map(ITEM_CATALOG.map(item => [item.id, item]));
const clone = value => structuredClone(value);
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const int = (value, low = 0) => Number.isSafeInteger(value) && value >= low;
const chapterById = new Map(DATA.chapters.map(chapter => [chapter.id, chapter]));
const roundByNumber = new Map(DATA.tournament.rounds.map(round => [round.number, round]));
const WIN_RESULTS = new Set(['win']);
const END_RESULTS = new Set(['win', 'lose', 'draw', 'caught', 'escaped']);

function ensure(world) {
  if (!isObject(world)) throw new TypeError('需要关都 world 状态。');
  if (!isObject(world.剧情)) world.剧情 = {};
  const state = isObject(world.剧情.关都主线) ? world.剧情.关都主线 : (world.剧情.关都主线 = {});
  state.version = 1;
  if (typeof state.prologueSeen !== 'boolean') state.prologueSeen = false;
  if (typeof state.prologueRewardClaimed !== 'boolean') state.prologueRewardClaimed = false;
  if (!isObject(state.choices)) state.choices = {};
  if (!isObject(state.rewardClaims)) state.rewardClaims = {};
  for (const [id, choiceId] of Object.entries(state.choices)) {
    if (!chapterById.has(id) || !chapterById.get(id).choices.some(choice => choice.id === choiceId)) delete state.choices[id];
  }
  for (const [id, claim] of Object.entries(state.rewardClaims)) if (!chapterById.has(id) || !state.choices[id] || !isObject(claim) || !Array.isArray(claim.gadgetIds) || !isObject(claim.items)) delete state.rewardClaims[id];
  if (!isObject(state.bonds)) state.bonds = {};
  for (const [id, value] of Object.entries(state.bonds)) {
    if (!int(value) || value > 20) delete state.bonds[id];
  }
  if (!Array.isArray(state.echoes)) state.echoes = [];
  state.echoes = state.echoes.filter(entry => isObject(entry) && chapterById.has(entry.chapterId) && typeof entry.text === 'string').map(entry => {
    const clean = { chapterId: entry.chapterId, choiceId: String(entry.choiceId || ''), text: entry.text };
    if (isObject(entry.followup) && (chapterById.has(entry.followup.chapterId) || entry.followup.chapterId === 'tournament') && typeof entry.followup.text === 'string') {
      clean.followup = { chapterId: entry.followup.chapterId, text: entry.followup.text };
    }
    return clean;
  }).slice(-8);
  if (!Array.isArray(state.flags)) state.flags = [];
  state.flags = [...new Set(state.flags.filter(flag => typeof flag === 'string' && /^[a-z0-9-]{1,48}$/.test(flag)))].slice(-32);

  if (!isObject(state.tournament)) state.tournament = {};
  const tour = state.tournament;
  if (!int(tour.attempts)) tour.attempts = 0;
  if (!int(tour.attempt)) tour.attempt = 0;
  if (!int(tour.round)) tour.round = 0;
  if (!['unentered', 'active', 'eliminated', 'champion'].includes(tour.status)) tour.status = 'unentered';
  if (typeof tour.champion !== 'boolean') tour.champion = false;
  if (typeof tour.rewardClaimed !== 'boolean') tour.rewardClaimed = false;
  if (!Array.isArray(tour.history)) tour.history = [];
  tour.history = tour.history.filter(entry => isObject(entry) && int(entry.attempt, 1) && ['eliminated', 'champion'].includes(entry.result)).slice(-20);
  if (tour.champion) tour.status = 'champion';
  if (tour.status === 'active' && (!int(tour.attempt, 1) || tour.round < 1 || tour.round > 6)) {
    tour.status = 'unentered'; tour.attempt = 0; tour.round = 0;
  }
  return world;
}

function badgeCount(world) {
  return Math.min(8, Array.isArray(world?.训练家?.徽章) ? world.训练家.徽章.length : 0);
}

function teamReady(world) {
  return Array.isArray(world?.队伍) && world.队伍.some(mon => Number.isInteger(mon?.当前HP) && mon.当前HP > 0);
}

function nextChapter(world) {
  const count = badgeCount(world), state = world?.剧情?.关都主线;
  return DATA.chapters.find(chapter => chapter.badgeCount <= count && chapter.location === world?.地图?.节点 && !state?.choices?.[chapter.id]) || null;
}

function entryReason(world) {
  if (world?.地图?.节点 !== DATA.tournament.entryNode) return '请先前往石英高原。';
  if (badgeCount(world) < DATA.tournament.requiredBadges) return '需要先取得八枚关都徽章。';
  if (world?.战斗?.状态 !== 'finished') return '请先完成当前战斗。';
  if (!teamReady(world)) return '队伍中没有能够参赛的伙伴，请先恢复体力。';
  const tour = world?.剧情?.关都主线?.tournament;
  if (tour?.champion || tour?.status === 'champion') return '你已经赢得石英大会；可以直接挑战四天王。';
  if (tour?.status === 'active') return '你仍在本届大会赛程中。';
  return '';
}

function roundEntryReason(world) {
  const tour = world?.剧情?.关都主线?.tournament;
  if (world?.地图?.节点 !== DATA.tournament.entryNode) return '请先回到石英高原。';
  if (world?.战斗?.状态 !== 'finished') return '请先完成当前战斗。';
  if (!teamReady(world)) return '队伍中没有能够继续参赛的伙伴，请先恢复体力。';
  if (tour?.status !== 'active' || !int(tour.round, 1) || tour.round > DATA.tournament.winsToChampion) return '当前没有待进行的大会轮次。';
  return '';
}

function options(world) {
  if (!isObject(world)) return [];
  const current = ensure(clone(world)), state = current.剧情.关都主线, result = [];
  if (current.剧情.初始御三家已选 === true && !state.prologueSeen) {
    result.push({ id: 'campaign-prologue', label: DATA.prologue.title, enabled: true, rewardPreview: rewardDetails(DATA.prologue.reward,current), payload: { prologueId: DATA.prologue.id } });
  }
  const chapter = nextChapter(current);
  if (chapter) {
    result.push({ id: 'campaign-choice', label: `剧情：${chapter.title}`, enabled: true,
      payload: { chapterId: chapter.id, choices: chapter.choices.map(choice => ({ id:choice.id, label:choice.label, rewardPreview:rewardDetails(choice.reward,current) })) } });
  }
  const tour = state.tournament;
  if (tour.status === 'active') {
    const reason = roundEntryReason(current), round = roundByNumber.get(tour.round);
    result.push({ id: 'campaign-enter-round', label: `进入大会${round?.label || '下一轮'}`, enabled: !reason, ...(reason ? { reason } : {}), payload: { tournamentId: DATA.tournament.id, attempt: tour.attempt, round: tour.round } });
  } else if (badgeCount(current) >= 8 && current.地图?.节点 === DATA.tournament.entryNode && !tour.champion) {
    const reason = entryReason(current);
    result.push({ id: 'campaign-register-tournament', label: tour.status === 'eliminated' ? '重新报名石英大会' : '报名石英大会', enabled: !reason, ...(reason ? { reason } : {}), payload: { tournamentId: DATA.tournament.id } });
  }
  return result;
}

function publicEncounter(round, attempt) {
  return {
    类型: 'trainer', 训练家: round.trainer, npc: round.portraitId, title: `石英大会 · ${round.label}`,
    theme: 'league-tournament', campaignId: DATA.tournament.id, tournamentRound: round.number, tournamentAttempt: attempt,
    source: 'kanto-campaign', 队伍: round.species.map((speciesId, index) => ({
      speciesId, level: round.levels[index], uid: `campaign-${DATA.tournament.id}-${attempt}-${round.number}-${index}`,
    })),
  };
}

function rewardDetails(reward, world) {
  if (!isObject(reward)) return null;
  const definitions = require('./quest-gadgets.cjs').gadgets;
  const owned = new Set(Array.isArray(world?.机制奖励?.已解锁) ? world.机制奖励.已解锁 : []);
  const gadgetIds = Array.isArray(reward.gadgetIds) ? reward.gadgetIds : [];
  const gadgets = gadgetIds.map(id => ({id, ...(definitions[id] || {}), alreadyUnlocked: owned.has(id)}));
  const itemById = ITEM_BY_ID;
  const items = Object.entries(reward.items || {}).map(([id,count]) => ({id,name:itemById.get(id)?.name||id,count}));
  const alternatives = gadgetIds.filter(id => owned.has(id)).flatMap(id => Object.entries(reward.fallbackItemsByGadget?.[id] || {}).map(([itemId,count]) => ({gadgetId:id,id:itemId,name:itemById.get(itemId)?.name||itemId,count,alternative:true})));
  return gadgets.length || items.length || alternatives.length ? {gadgets,items,alternatives} : null;
}

function grantReward(world, reward) {
  if (reward === undefined) return {gadgetIds:[],items:{}};
  if (!isObject(reward)) throw new Error('主线机制奖励资料无效。');
  const gadgetIds = reward.gadgetIds === undefined ? [] : reward.gadgetIds;
  if (!Array.isArray(gadgetIds) || gadgetIds.some(id => typeof id !== 'string') || new Set(gadgetIds).size !== gadgetIds.length) throw new Error('主线机制奖励清单无效。');
  const gadgets = gadgetIds.length ? require('./quest-gadgets.cjs') : null, definitions = gadgets?.gadgets || {};
  for (const id of gadgetIds) if (!Object.hasOwn(definitions,id)) throw new Error('主线机制奖励含有未登记的能力。');
  const fallback = reward.fallbackItemsByGadget === undefined ? {} : reward.fallbackItemsByGadget;
  if (!isObject(fallback) || Object.keys(fallback).some(id => !gadgetIds.includes(id) || !isObject(fallback[id]))) throw new Error('主线机制奖励替代定义无效。');
  const itemCatalog = new Set(ITEM_BY_ID.keys());
  for (const rows of Object.values(fallback)) for (const [id,count] of Object.entries(rows)) if (!itemCatalog.has(id) || !Number.isSafeInteger(count) || count < 1) throw new Error('主线替代奖励必须是已登记物品和正整数数量。');
  const itemCounts = {...(reward.items || {})}, prior = new Set(Array.isArray(world?.机制奖励?.已解锁) ? world.机制奖励.已解锁 : []), newlyGranted = [];
  for (const id of gadgetIds) {
    if (prior.has(id)) for (const [itemId,count] of Object.entries(fallback[id] || {})) itemCounts[itemId]=(itemCounts[itemId]||0)+count;
    else newlyGranted.push(id);
  }
  for (const [id,count] of Object.entries(itemCounts)) {
    if (!itemCatalog.has(id) || !Number.isSafeInteger(count) || count < 1) throw new Error('主线奖励必须是已登记物品和正整数数量。');
    if (!Number.isInteger(world.背包?.物品?.[id])) throw new Error('背包未配置'+id+'。');
    if (world.背包.物品[id]+count>999) throw new Error('背包中的主线奖励已达到数量上限。');
  }
  for (const id of newlyGranted) gadgets.unlock(world,id);
  for (const [id,count] of Object.entries(itemCounts)) world.背包.物品[id]+=count;
  return {gadgetIds:newlyGranted,items:itemCounts};
}

function chapterChoice(world, payload) {
  const state = world.剧情.关都主线, chapter = chapterById.get(payload?.chapterId);
  if (!chapter || chapter.badgeCount > badgeCount(world) || chapter.location !== world?.地图?.节点) throw new Error('当前位置或徽章进度还没有解锁这一章。');
  if (state.choices[chapter.id]) throw new Error('这一章已经选择过分支。');
  const choice = chapter.choices.find(entry => entry.id === payload?.choiceId);
  if (!choice) throw new Error('请选择本章提供的剧情分支。');
  const newlyGranted = grantReward(world, choice.reward);
  state.choices[chapter.id] = choice.id;
  state.rewardClaims[chapter.id] = newlyGranted;
  for (const [person, delta] of Object.entries(choice.bonds || {})) state.bonds[person] = Math.max(0, Math.min(20, (state.bonds[person] || 0) + delta));
  state.flags = [...new Set([...state.flags, ...(choice.flags || [])])].slice(-32);
  state.echoes.push({ chapterId: chapter.id, choiceId: choice.id, text: choice.echo, followup: clone(choice.followup) });
  state.echoes = state.echoes.slice(-8);
}

function apply(world, action, payload = {}) {
  const next = ensure(clone(world)), state = next.剧情.关都主线;
  if (action === 'campaign-prologue') {
    if (next.剧情.初始御三家已选 !== true) throw new Error('请先选择最初的伙伴。');
    if (!state.prologueSeen && !state.prologueRewardClaimed) {
      const reward = grantReward(next, DATA.prologue.reward);
      state.prologueRewardClaimed = true;
      state.prologueNewlyGranted = reward;
    }
    state.prologueSeen = true;
    return next;
  }
  if (action === 'campaign-choice') {
    chapterChoice(next, payload);
    return next;
  }
  if (action === 'campaign-register-tournament') {
    if (payload.tournamentId !== DATA.tournament.id) throw new Error('大会报名资料无效。');
    const reason = entryReason(next);
    if (reason) throw new Error(reason);
    const tour = state.tournament;
    tour.attempts += 1; tour.attempt = tour.attempts; tour.round = 1; tour.status = 'active';
    return next;
  }
  if (action === 'campaign-enter-round') {
    const tour = state.tournament, round = roundByNumber.get(tour.round);
    const reason = roundEntryReason(next);
    if (reason) throw new Error(reason);
    if (payload.tournamentId !== DATA.tournament.id || payload.attempt !== tour.attempt || payload.round !== tour.round || !round) throw new Error('大会轮次已变化，请刷新赛程。');
    const turn = (Number.isSafeInteger(next.地图?.轮次) ? next.地图.轮次 : 0) + 1;
    next.地图.轮次 = turn;
    next.遭遇 = publicEncounter(round, tour.attempt);
    next.战斗 = { 轮次: turn, 状态: 'pending', 结果: '', 摘要: `石英大会${round.label}：${round.trainer}等待对战。`, 操作序号: 0 };
    return next;
  }
  throw new Error('未知的关都主线行动。');
}

function onBattleResult(world, record, result) {
  ensure(world);
  const encounter = record?.encounter || record?.遭遇 || record;
  if (encounter?.campaignId !== DATA.tournament.id || !END_RESULTS.has(result)) return world;
  const tour = world.剧情.关都主线.tournament;
  if (tour.status !== 'active' || encounter.tournamentAttempt !== tour.attempt || encounter.tournamentRound !== tour.round) return world;
  if (!WIN_RESULTS.has(result)) {
    tour.status = 'eliminated';
    tour.history.push({ attempt: tour.attempt, result: 'eliminated', roundsWon: Math.max(0, tour.round - 1) });
    tour.history = tour.history.slice(-20);
    tour.round = 0;
    return world;
  }
  if (tour.round < DATA.tournament.winsToChampion) {
    tour.round += 1;
    return world;
  }
  tour.status = 'champion';
  tour.champion = true;
  tour.history.push({ attempt: tour.attempt, result: 'champion', roundsWon: DATA.tournament.winsToChampion });
  tour.history = tour.history.slice(-20);
  if (!tour.rewardClaimed) {
    tour.rewardClaimed = true;
    if (!isObject(world.背包)) world.背包 = {};
    if (!Array.isArray(world.背包.关键物品)) world.背包.关键物品 = [];
    if (!world.背包.关键物品.some(item => item?.id === DATA.tournament.reward.id)) {
      world.背包.关键物品.push({ id: DATA.tournament.reward.id, 名称: DATA.tournament.reward.name, 说明: DATA.tournament.reward.description, 类型: DATA.tournament.reward.type });
    }
  }
  return world;
}

function view(world) {
  if (!isObject(world)) return null;
  const current = ensure(clone(world)), state = current.剧情.关都主线, chapter = nextChapter(current);
  let scene = null, phase = 'journey';
  if (current.剧情.初始御三家已选 === true && !state.prologueSeen) {
    scene = DATA.prologue; phase = 'prologue';
  } else if (chapter) {
    scene = chapter; phase = 'chapter';
  } else if (badgeCount(current) >= 8) {
    scene = DATA.tournament; phase = 'tournament';
  }
  const target = phase === 'chapter' ? chapter.id : phase === 'tournament' ? 'tournament' : null;
  const branchEchoes = target ? state.echoes.filter(entry => entry.followup?.chapterId === target).map(entry => ({
    chapterId: entry.chapterId, choiceId: entry.choiceId, text: entry.followup.text,
  })) : [];
  return {
    campaignId: DATA.id,
    continuity: clone(DATA.continuity),
    phase,
    scene: scene ? {
      id: scene.id || DATA.tournament.id,
      title: scene.title || DATA.tournament.title,
      location: scene.location || DATA.tournament.entryNode,
      sceneTag: scene.sceneTag || 'tournament',
      musicEvent: scene.musicEvent || 'tournament',
      speakers: clone(scene.speakers || []),
      summary: scene.summary || '',
      trigger: scene.trigger || '',
      conflict: scene.conflict || '',
      continuity: clone(scene.continuity || {}),
      conversation: clone(scene.conversation || {}),
      actor: clone(scene.speakers?.[0] || null),
      rewardPreview: rewardDetails(scene.reward,current),
      openQuestions: clone(scene.conversation?.questions || []),
      choices: clone(scene.choices || []).map(choice => ({...choice,rewardPreview:rewardDetails(choice.reward,current)})),
    } : null,
    branchEchoes,
    history: {
      selectedBranches: state.echoes.map(entry => ({ chapterId: entry.chapterId, choiceId: entry.choiceId, text: entry.text })),
      bonds: clone(state.bonds), flags: [...state.flags],
    },
    tournament: clone(state.tournament),
  };
}

function prompt(world) {
  if (!isObject(world)) return '关都主线：请先载入训练家世界。';
  const context = view(world), current = ensure(clone(world)), state = current.剧情.关都主线;
  if (context.phase === 'prologue' || context.phase === 'chapter') {
    const scene = context.scene, choices = scene.choices.map(item => `${item.id}：${item.label}（代价：${item.tradeoff}；后果：${item.consequence}）`).join('；');
    const echoes = context.branchEchoes.map(item => item.text).join('；') || '本章尚无针对本场景的已选分支回响';
    return `原创关都主线${context.phase === 'prologue' ? '序章' : `第${scene.badgeCount}徽章章回`}「${scene.title}」\n场景：${scene.location} / ${scene.sceneTag}；音乐事件：${scene.musicEvent}\n出场人物：${scene.speakers.map(person => `${person.name} [${person.id}]`).join('、')}\n前因：${scene.trigger}\n立场冲突：${scene.conflict}\n本章摘要：${scene.summary}\n证据与连续性：${scene.continuity.evidence || ''}；后续：${scene.continuity.next || ''}\n人物对话设计：${JSON.stringify(scene.conversation || {})}\n本场景的分支回响：${echoes}\n选择：${choices || '由玩家继续旅行'}\n关系羁绊：${Object.entries(context.history.bonds).map(([id, value]) => `${id} ${value}`).join('、') || '尚未建立'}。请写原创叙述和短对白，体现人物各自立场、选择代价及后果，不复述动画或漫画原文。`;
  }
  const tour = state.tournament;
  const relationshipEcho = context.branchEchoes.map(item => item.text).join('；') || '尚无指向大会的分支回响';
  const bonds = Object.entries(state.bonds).map(([id, value]) => `${id} ${value}`).join('、') || '尚未建立';
  if (tour.status === 'active') {
    const round = roundByNumber.get(tour.round);
    return `石英大会第${tour.attempt}次报名，当前待入场轮次为${round?.label || '—'}。该赛事是原创的64人单败赛；每轮一场，赢满六轮成为优胜者。沿用此前关系写出自然回响：${relationshipEcho}；羁绊记录：${bonds}。`;
  }
  if (tour.champion) return `你已赢得石英大会，四天王挑战资格已经开启。请先呈现优胜后的队伍回响，再进入四天王。此前分支回响：${relationshipEcho}；羁绊记录：${bonds}。`;
  if (badgeCount(current) >= 8) return `八枚徽章已经集齐。石英大会采用64人单败赛，需连续赢下六场成为第一名；败北后可重新报名，优胜纪念只发一次。此前分支回响：${relationshipEcho}；羁绊记录：${bonds}。`;
  if (state.echoes.length) return `最近一章「${chapterById.get(state.echoes.at(-1).chapterId)?.title || '关都旅程'}」留下了这样的回响：${state.echoes.at(-1).text} 羁绊记录：${bonds}。这些选择会影响之后角色如何回应你。`;
  return '关都主线将随徽章进度展开。每章的选择可改变角色羁绊回响，但不影响徽章或战斗结算。';
}

function canEnterElite(world) {
  const state = world?.剧情?.关都主线?.tournament;
  return badgeCount(world) === 8 && state?.champion === true && state?.status === 'champion';
}

function validate(world) {
  const state = world?.剧情?.关都主线;
  if (!state || state.version !== 1 || !isObject(state.choices) || !isObject(state.bonds) || !Array.isArray(state.echoes) || !Array.isArray(state.flags) || (state.prologueRewardClaimed !== undefined && typeof state.prologueRewardClaimed !== 'boolean') || (state.rewardClaims !== undefined && !isObject(state.rewardClaims))) throw new Error('关都主线状态无效。');
  for (const [chapterId, choiceId] of Object.entries(state.choices)) {
    if (!chapterById.get(chapterId)?.choices.some(choice => choice.id === choiceId)) throw new Error('关都主线分支记录无效。');
  }
  if (state.rewardClaims) for (const [chapterId, claim] of Object.entries(state.rewardClaims)) {
    if (!state.choices[chapterId] || !isObject(claim) || !Array.isArray(claim.gadgetIds) || !isObject(claim.items)) throw new Error('关都主线奖励领取记录无效。');
    const definitions = require('./quest-gadgets.cjs').gadgets;
    if (claim.gadgetIds.some(id => typeof id !== 'string' || !Object.hasOwn(definitions,id))) throw new Error('关都主线机制奖励记录无效。');
    for (const [id,count] of Object.entries(claim.items)) if (!ITEM_BY_ID.has(id) || !Number.isSafeInteger(count) || count < 1) throw new Error('关都主线物品奖励记录无效。');
  }
  if (state.prologueNewlyGranted !== undefined && (!isObject(state.prologueNewlyGranted) || !Array.isArray(state.prologueNewlyGranted.gadgetIds) || !isObject(state.prologueNewlyGranted.items))) throw new Error('关都序章奖励领取记录无效。');
  for (const [chapterId, claim] of Object.entries(state.rewardClaims || {})) if (!state.choices[chapterId] || !isObject(claim) || !Array.isArray(claim.gadgetIds) || !isObject(claim.items)) throw new Error('关都主线奖励领取记录无效。');
  const tour = state.tournament;
  if (!tour || !int(tour.attempts) || !int(tour.attempt) || !int(tour.round) || !['unentered', 'active', 'eliminated', 'champion'].includes(tour.status) || typeof tour.champion !== 'boolean' || typeof tour.rewardClaimed !== 'boolean' || !Array.isArray(tour.history)) throw new Error('石英大会赛程状态无效。');
  if (tour.status === 'active' && (tour.attempt < 1 || tour.attempt > tour.attempts || tour.round < 1 || tour.round > 6)) throw new Error('石英大会进行中轮次无效。');
  if (tour.champion !== (tour.status === 'champion')) throw new Error('石英大会优胜标记不一致。');
  const encounter = world.遭遇;
  if (encounter?.campaignId === DATA.tournament.id) {
    if (encounter.类型 !== 'trainer' || !int(encounter.tournamentAttempt, 1) || !roundByNumber.has(encounter.tournamentRound) || !Array.isArray(encounter.队伍) || encounter.队伍.length < 1 || encounter.队伍.length > 6) throw new Error('石英大会遭遇资料无效。');
  }
  return true;
}

module.exports = { ensure, options, apply, onBattleResult, view, prompt, canEnterElite, validate, data: () => clone(DATA) };
