'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, 'public', 'data');
const read = name => JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8').replace(/^\uFEFF/, ''));
const EVENTS = read('kanto-story-events.json');
const LOCALE = read('locales.json');
const LOCATIONS = new Map(read('map.json').map(node => [node.id, node]));
const ITEMS = new Map([...read('items.json'), ...read('field-items.json'), ...read('tmhm.json')].map(item => [item.id, item]));
const BY_ID = new Map(EVENTS.map(event => [event.id, event]));
const MAX_RECORDS = 40;
const clone = value => structuredClone(value);
const plainObject = value => value && typeof value === 'object' && !Array.isArray(value);

function ensure(world) {
  if (!world || typeof world !== 'object') throw new TypeError('需要关都世界状态。');
  if (!plainObject(world.剧情)) world.剧情 = {};
  const existing = world.剧情.关都事件;
  if (!plainObject(existing)) world.剧情.关都事件 = {版本: 1, 进度: {}, 标记: {}, 记录: []};
  const state = world.剧情.关都事件;
  if (state.版本 !== 1) state.版本 = 1;
  if (!plainObject(state.进度)) state.进度 = {};
  if (!plainObject(state.标记)) state.标记 = {};
  if (!Array.isArray(state.记录)) state.记录 = [];
  state.记录 = state.记录.filter(row => plainObject(row) && typeof row.id === 'string' && Number.isSafeInteger(row.故事轮次)).slice(-MAX_RECORDS);
  for (const [id, progress] of Object.entries(state.进度)) {
    if (!BY_ID.has(id) || !plainObject(progress)) { delete state.进度[id]; continue; }
    const def = BY_ID.get(id);
    if (progress.阶段 !== undefined && !def.stages.some(stage => stage.id === progress.阶段)) delete progress.阶段;
    progress.完成 = progress.完成 === true;
    if (progress.结果 !== undefined && typeof progress.结果 !== 'string') delete progress.结果;
    if (progress.rewardClaimed !== undefined && typeof progress.rewardClaimed !== 'boolean') delete progress.rewardClaimed;
    if (progress.eventBaseline !== undefined && (!Number.isSafeInteger(progress.eventBaseline) || progress.eventBaseline < 0)) delete progress.eventBaseline;
  }
  for (const [key, value] of Object.entries(state.标记)) if (!/^[a-z][a-zA-Z0-9]{0,63}$/.test(key) || typeof value !== 'boolean') delete state.标记[key];
  return world;
}

function requirements(world, event, stage = phaseFor(world, event)) {
  const state = world?.剧情?.关都事件 || {};
  const required = event.requires || {};
  const unmet = [];
  for (const [key, value] of Object.entries(required.flags || {})) {
    if (state.标记?.[key] !== value) unmet.push(value ? `先完成“${key}”相关的前置事件。` : `前置状态${key}不满足。`);
  }
  if (Number.isInteger(required.badges) && (world?.训练家?.徽章?.length || 0) < required.badges) {
    unmet.push(`至少需要${required.badges}枚徽章。`);
  }
  for (const [itemId, count] of Object.entries(required.items || {})) {
    const item = ITEMS.get(itemId);
    const label = item?.kind === 'hm'
      ? `HM${String(item.number).padStart(2, '0')}${LOCALE.moves?.[item.move] || item.moveName || item.name}`
      : item?.name || itemId;
    if ((world?.背包?.物品?.[itemId] || 0) < count) unmet.push(`需要先取得${label}。`);
  }
  for (const [action, count] of Object.entries(stage?.requiresEvents || {})) {
    const baseline = state.进度?.[event.id]?.eventBaseline || 0;
    const actual = (world?.委托?.事件 || []).filter(row => row.serial > baseline && row.action === action).length;
    if (!Number.isSafeInteger(count) || count < 1 || actual < count) {
      const label = action === 'camp' ? '伙伴露营/休整' : action === 'care' ? '伙伴照护' : action;
      unmet.push(`需要先完成${label}记录（${Math.max(0, count - actual)}/${count}）。`);
    }
  }
  return unmet;
}

function phaseFor(world, event) {
  const progress = world?.剧情?.关都事件?.进度?.[event.id];
  if (progress?.完成) return null;
  return event.stages.find(stage => stage.id === progress?.阶段) || event.stages[0];
}
function nodeFor(world,event){return (phaseFor(world,event)||event.stages.at(-1))?.node||event.node;}

function optionRows(world, event) {
  const progress = world?.剧情?.关都事件?.进度?.[event.id];
  if (progress?.完成) return [{id: 'kanto-story-event', label: `${event.title}（已完成）`, enabled: false,
    reason: '这段事件已经记录完成，奖励不会重复领取。', payload: {eventId: event.id}}];
  const stage = phaseFor(world, event);
  const unmet = requirements(world, event, stage);
  if (unmet.length) return [{id: 'kanto-story-event', label: event.title, enabled: false,
    reason: unmet.join(' '), payload: {eventId: event.id}}];
  return stage.choices.map(choice => ({id: 'kanto-story-event', label: `${event.title}：${choice.label}`,
    enabled: true, rewardPreview: rewardDetails(choice, world), payload: {eventId: event.id, choiceId: choice.id}}));
}

function options(world) {
  ensure(world);
  const node = world?.地图?.节点;
  if (world?.剧情?.初始御三家已选 !== true || world?.战斗?.状态 !== 'finished') return [];
  return EVENTS.filter(event => nodeFor(world,event) === node).flatMap(event => optionRows(world, event));
}

function validate(world) {
  const state = world?.剧情?.关都事件;
  if (!plainObject(state) || state.版本 !== 1 || !plainObject(state.进度) || !plainObject(state.标记) || !Array.isArray(state.记录) || state.记录.length > MAX_RECORDS) {
    throw new Error('关都剧情事件资料无效。');
  }
  for (const [id, progress] of Object.entries(state.进度)) {
    const event = BY_ID.get(id);
    if (!event || !plainObject(progress) || typeof progress.完成 !== 'boolean' ||
      (progress.完成 && !event.stages.some(stage => stage.id === progress.阶段)) ||
      (progress.阶段 !== undefined && !event.stages.some(stage => stage.id === progress.阶段)) ||
      (progress.rewardClaimed !== undefined && typeof progress.rewardClaimed !== 'boolean') || (progress.rewardClaimed && !progress.完成) ||
      (progress.newlyGranted !== undefined && (!plainObject(progress.newlyGranted) || !Array.isArray(progress.newlyGranted.gadgetIds) || !plainObject(progress.newlyGranted.items)))) throw new Error('关都剧情事件进度无效。');
    if (progress.newlyGranted) {
      const gadgetDefs = require('./quest-gadgets.cjs').gadgets;
      if (progress.newlyGranted.gadgetIds.some(gadgetId => typeof gadgetId !== 'string' || !Object.hasOwn(gadgetDefs,gadgetId))) throw new Error('关都事件机制奖励记录无效。');
      for (const [itemId,count] of Object.entries(progress.newlyGranted.items)) if (!ITEMS.has(itemId) || !Number.isSafeInteger(count) || count < 1) throw new Error('关都事件物品奖励记录无效。');
    }
  }
  for (const [key, value] of Object.entries(state.标记)) if (!/^[a-z][a-zA-Z0-9]{0,63}$/.test(key) || typeof value !== 'boolean') throw new Error('关都剧情标记无效。');
  for (const progress of Object.values(state.进度)) if (progress.eventBaseline !== undefined && (!Number.isSafeInteger(progress.eventBaseline) || progress.eventBaseline < 0)) throw new Error('关都剧情事件基线无效。');
  for (const row of state.记录) if (!plainObject(row) || !BY_ID.has(row.id) || !Number.isSafeInteger(row.故事轮次) || row.故事轮次 < 1 || typeof row.结果 !== 'string') throw new Error('关都剧情事件记录无效。');
  return true;
}

function appendRecord(state, row) {
  state.记录.push(row);
  if (state.记录.length > MAX_RECORDS) state.记录.splice(0, state.记录.length - MAX_RECORDS);
}

function rewardDetails(choice, world) {
  const reward = plainObject(choice?.reward) ? choice.reward : {};
  const gadgetIds = Array.isArray(reward.gadgetIds) ? reward.gadgetIds : [];
  const allItems = {...(plainObject(choice?.items) ? choice.items : {}), ...(plainObject(reward.items) ? reward.items : {})};
  const already = new Set(Array.isArray(world?.机制奖励?.已解锁) ? world.机制奖励.已解锁 : []);
  const gadgets = gadgetIds.map(id => ({id, ...(require('./quest-gadgets.cjs').gadgets[id] || {}), alreadyUnlocked: already.has(id)}));
  const items = Object.entries(allItems).map(([id, count]) => ({id, name: ITEMS.get(id)?.name || id, count}));
  const alternatives = gadgetIds.filter(id => already.has(id)).flatMap(id => Object.entries(reward.fallbackItemsByGadget?.[id] || {}).map(([itemId, count]) => ({gadgetId:id,id:itemId,name:ITEMS.get(itemId)?.name||itemId,count,alternative:true})));
  const egg = reward.lighthouseEgg === true ? {name:'灯塔救护的迷你龙蛋', description:'较大的蛋壳带海浪般蓝色纹路；孵化为巨型迷你龙，体型仅影响外观；与雾中来客无已证实关联。'} : null;
  return gadgets.length || items.length || alternatives.length || egg ? {gadgets, items, alternatives, ...(egg ? {egg} : {})} : null;
}

function grantReward(world, choice) {
  const reward = choice.reward === undefined ? {} : choice.reward;
  if (!plainObject(reward)) throw new Error('剧情机制奖励资料无效。');
  const gadgetIds = reward.gadgetIds === undefined ? [] : reward.gadgetIds;
  if (!Array.isArray(gadgetIds) || gadgetIds.some(id => typeof id !== 'string') || new Set(gadgetIds).size !== gadgetIds.length) throw new Error('剧情机制奖励清单无效。');
  const questGadgets = gadgetIds.length ? require('./quest-gadgets.cjs') : null;
  const definitions = questGadgets?.gadgets || {};
  for (const id of gadgetIds) if (!Object.hasOwn(definitions, id)) throw new Error('剧情机制奖励含有未登记的能力。');
  const fallback = reward.fallbackItemsByGadget === undefined ? {} : reward.fallbackItemsByGadget;
  if (!plainObject(fallback) || Object.keys(fallback).some(id => !gadgetIds.includes(id) || !plainObject(fallback[id]))) throw new Error('机制奖励替代物品定义无效。');
  for (const rows of Object.values(fallback)) for (const [id,count] of Object.entries(rows)) if (!ITEMS.has(id) || !Number.isSafeInteger(count) || count < 1) throw new Error('机制奖励替代必须是已登记物品和正整数数量。');
  const itemCounts = {};
  for (const source of [choice.items || {}, reward.items || {}]) {
    if (!plainObject(source)) throw new Error('剧情物品奖励资料无效。');
    for (const [id,count] of Object.entries(source)) itemCounts[id]=(itemCounts[id]||0)+count;
  }
  const prior = new Set(Array.isArray(world?.机制奖励?.已解锁) ? world.机制奖励.已解锁 : []), newlyGranted = [];
  for (const id of gadgetIds) {
    if (prior.has(id)) {
      for (const [itemId,count] of Object.entries(fallback[id] || {})) itemCounts[itemId]=(itemCounts[itemId]||0)+count;
    } else newlyGranted.push(id);
  }
  for (const [id,count] of Object.entries(itemCounts)) {
    if (!ITEMS.has(id) || !Number.isSafeInteger(count) || count < 1) throw new Error('剧情奖励必须是已登记物品和正整数数量。');
    if (!Number.isInteger(world.背包?.物品?.[id])) throw new Error('背包未配置'+id+'。');
    if (world.背包.物品[id] + count > 999) throw new Error('背包中的剧情奖励已达到数量上限。');
  }
  if (reward.lighthouseEgg === true) require('./classic-services.cjs').grantLighthouseEgg(world);
  for (const id of newlyGranted) questGadgets.unlock(world, id);
  for (const [id,count] of Object.entries(itemCounts)) world.背包.物品[id]+=count;
  return {gadgets:newlyGranted,items:itemCounts};
}

function stagePresentation(event, stage) {
  return {
    speaker: stage?.speaker || event.speaker,
    actor: stage?.speaker || event.speaker,
    portraitId: stage?.portraitId || event.portraitId,
    sceneTag: stage?.sceneTag || event.sceneTag,
    musicEvent: stage?.musicEvent || event.musicEvent,
    conversation: event.conversation,
    stageId: stage?.id || event.stages[0]?.id,
  };
}

function writeScene(world, event, stage, text, storyTurn) {
  const scene = stagePresentation(event, stage);
  world.剧情.剧场 = {
    ...(plainObject(world.剧情.剧场) ? world.剧情.剧场 : {}),
    地点: world.地图.节点,
    轮次: Number.isSafeInteger(world.地图?.轮次) ? world.地图.轮次 : 0,
    故事轮次: storyTurn,
    最近动作: 'kanto-story-event',
    角色: scene.portraitId,
    对白: `${scene.speaker}：${text}`,
    sceneTag: scene.sceneTag,
    musicEvent: scene.musicEvent,
  };
}

function apply(world, action, payload = {}, {storyTurn} = {}) {
  const next = ensure(clone(world));
  if (action !== 'kanto-story-event') throw new Error('未知的关都剧情事件操作。');
  if (!Number.isSafeInteger(storyTurn) || storyTurn < 1) throw new Error('需要由宿主提供有效的故事回合。');
  if (next.剧情.初始御三家已选 !== true) throw new Error('请先选择最初的伙伴。');
  if (next.战斗?.状态 !== 'finished') throw new Error('请先完成当前遭遇，再继续剧情互动。');
  const event = BY_ID.get(payload?.eventId);
  if (!event || nodeFor(next,event) !== next.地图?.节点) throw new Error('当前地点没有这段剧情事件。');
  const state = next.剧情.关都事件;
  const progress = state.进度[event.id] || {阶段: event.stages[0].id, 完成: false};
  if (progress.完成) throw new Error('这段事件已经完成，奖励不会重复领取。');
  const unmet = requirements(next, event);
  if (unmet.length) throw new Error(unmet.join(' '));
  const stage = event.stages.find(row => row.id === progress.阶段);
  const choice = stage?.choices.find(row => row.id === payload?.choiceId);
  if (!choice) throw new Error('当前剧情阶段没有这个选择。');

  if (!choice.success) {
    progress.尝试次数 = (progress.尝试次数 || 0) + 1;
    progress.上次结果 = '未成功';
    state.进度[event.id] = progress;
    appendRecord(state, {id: event.id, 阶段: stage.id, 选择: choice.id, 故事轮次: storyTurn, 结果: '未成功'});
    writeScene(next, event, stage, choice.text, storyTurn);
    return next;
  }

  for (const [key, value] of Object.entries(choice.flags || {})) {
    if (typeof value !== 'boolean') throw new Error('事件奖励标记必须为布尔值。');
    state.标记[key] = value;
  }
  if (choice.nextStage) {
    if (!event.stages.some(row => row.id === choice.nextStage)) throw new Error('事件数据中的后续阶段无效。');
    progress.阶段 = choice.nextStage;
    progress.eventBaseline = next.委托?.事件序号 || 0;
    progress.上次结果 = '继续';
    state.进度[event.id] = progress;
  } else {
    const granted = grantReward(next, choice);
    progress.完成 = true;
    progress.rewardClaimed = true;
    progress.结果 = choice.id;
    progress.完成故事轮次 = storyTurn;
    progress.奖励 = [...Object.keys(granted.items), ...granted.gadgets];
    progress.newlyGranted = {gadgetIds: granted.gadgets, items: granted.items};
    state.进度[event.id] = progress;
  }
  appendRecord(state, {id: event.id, 阶段: stage.id, 选择: choice.id, 故事轮次: storyTurn, 结果: choice.nextStage ? '继续' : '成功'});
  writeScene(next, event, stage, choice.text, storyTurn);
  return next;
}

function view(world) {
  ensure(world);
  const node = world?.地图?.节点;
  const events = EVENTS.filter(event => nodeFor(world,event) === node).map(event => {
    const progress = world?.剧情?.关都事件?.进度?.[event.id];
    const stage = phaseFor(world, event) || event.stages.at(-1);
    const scene = stagePresentation(event, stage);
    const unmet = requirements(world, event);
    const choices = stage ? stage.choices.map(choice => ({id: choice.id, label: choice.label,
      enabled: !unmet.length && !progress?.完成, reason: unmet.join(' '), payload: {eventId: event.id, choiceId: choice.id}, rewardPreview: rewardDetails(choice, world)})) : [];
    const text = progress?.完成 ? '这段事件已记录完成。' : stage?.text || '';
    return {id: event.id, title: event.title, status: progress?.完成 ? 'completed' : unmet.length ? 'locked' : 'available',
      speaker: scene.speaker, actor: scene.actor, portraitId: scene.portraitId, text, choices, reason: unmet.join(' '), openQuestions: clone(scene.conversation?.questions || []),
      sceneTag: scene.sceneTag, musicEvent: scene.musicEvent, stageId: scene.stageId, conversation: clone(scene.conversation)};
  });
  const active = events.find(event => world?.剧情?.关都事件?.进度?.[event.id]?.阶段 && !world?.剧情?.关都事件?.进度?.[event.id]?.完成) || events.find(event => event.status === 'available') || events.find(event => event.status === 'locked') || events[0] || null;
  return {events, scene: active ? {eventId: active.id, title: active.title, status: active.status, speaker: active.speaker, portraitId: active.portraitId,
    stageId: active.stageId, text: active.text, choices: active.choices, reason: active.reason, actor: active.actor, conversation: clone(active.conversation), openQuestions: clone(active.openQuestions || []),
    sceneTag: active.sceneTag, musicEvent: active.musicEvent} : null,
    completed: Object.entries(world?.剧情?.关都事件?.进度 || {}).filter(([, progress]) => progress?.完成).map(([id]) => id),
    flags: {...(world?.剧情?.关都事件?.标记 || {})}};
}

function prompt(world) {
  const state = world?.剧情?.关都事件;
  if (!state) return '';
  const recent = (state.记录 || []).slice(-6).map(row => ({event: BY_ID.get(row.id)?.title || row.id,
    stage: row.阶段, choice: row.选择, result: row.结果}));
  const current = view(world).scene;
  if (!recent.length && !current) return '';
  const active = current ? {eventId: current.eventId, title: current.title, status: current.status,
    stageId: current.stageId, speaker: current.speaker, text: current.text,
    conversation: current.conversation, reason: current.reason} : null;
  return '【关都剧情事件记录】只呈现当前事件和当前阶段的对话设计；玩家自由交谈不会自动选择分支、推进状态或发奖，只有宿主确认的事件操作才会推进。一次只演当前场景的一个节拍，不替玩家作答，停在自然的回应空隙。已完成事件不重复呈现。当前对话：' +
    JSON.stringify({active, recent, flags: state.标记 || {}}).slice(0, 3800);
}

module.exports = {EVENTS: clone(EVENTS), ensure, validate, options, apply, prompt, view};
