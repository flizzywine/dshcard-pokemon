'use strict';

const fs = require('node:fs');
const path = require('node:path');
const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data/map.json'), 'utf8').replace(/^\uFEFF/, ''));
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data/deep-quests.json'), 'utf8').replace(/^\uFEFF/, ''));
const itemCatalog = [
  ...JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data/items.json'), 'utf8').replace(/^\uFEFF/, '')),
  ...JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data/field-items.json'), 'utf8').replace(/^\uFEFF/, '')),
  ...JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data/tmhm.json'), 'utf8').replace(/^\uFEFF/, '')),
];
const itemById = new Map(itemCatalog.map(item => [item.id, item]));
const mapById = new Map(map.map(node => [node.id, node]));
const trainers = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data/trainers.json'), 'utf8').replace(/^\uFEFF/, ''));
const trainerById = new Map(trainers.map(trainer => [trainer.id, trainer]));
const byId = new Map(catalog.map(quest => [quest.id, quest]));
const PARTY_MODES = Object.freeze({ off: '关闭全队共享', split: '全队均分', journey: '旅程模式：参战份额外每位存活伙伴再获全额' });
const MAX_ACTIVE_DEEP_AND_NPC = 4;
const MAIN_TASK_IDS = new Set(['choose-starter','defeat-rival','catch-pokemon','first-badge',...Array.from({length:7},(_,index)=>`badge-${index+2}`),'catch-5','catch-10','league-four','league-champion']);
const GADGETS = Object.freeze({
  partyExpShare: { name: '全队经验共享装置', description: '可在原版分配、全队均分与旅程辅助之间切换；关闭时完全采用原版参战者与持有学习装置规则。', effect: 'party-exp-share', questSource: 'oak-open-field' },
  fieldRadar: { name: '野外生态雷达', description: '把已探访地点与已记录栖息地汇总为可核对的野外观察索引。', effect: 'field-radar', questSource: 'ash-path-notes' },
  trainingTerminal: { name: '招式研修终端', description: '按图鉴合法性检索升级招式与背包中可用的TM，不提供不兼容招式。', effect: 'legal-move-tutor', questSource: 'brock-stone-practice' },
  terminalArchive: { name: '招式研修档案', description: '扩充终端的旧记录检索，可查看伙伴等级成长时错过的升级招式。', effect: 'level-move-recall', questSource: 'misty-water-memory' },
  researchTerminalFreeTM: { name: '机器无耗研修许可', description: '在已解锁的招式研修终端使用已拥有且物种兼容的TM进行研修时，不消耗TM；背包中直接使用TM仍会消耗。', effect: 'terminal-free-compatible-tm', questSource: 'rocket-lavender-transparency' },
  fieldRadarPlus: { name: '生态雷达属性筛查', description: '在生态雷达上按已验证的属性和栖息地筛选观察记录。', effect: 'radar-type-filter', questSource: 'rocket-cargo-ledger' },
  campKit: { name: '野外营地工具', description: '解锁露营后的基础休整与工具管理选项。', effect: 'camp-kit', questSource: 'erika-garden-rest' },
  campKitPlus: { name: '营地耐候组件', description: '扩展营地工具，可选择更充分的休整方式。', effect: 'camp-kit-plus', questSource: 'koga-safari-watch' },
  bondLens: { name: '羁绊观察档案', description: '查看有记录依据的伙伴信赖变化与共同经历。', effect: 'bond-history', questSource: 'sabrina-focus-ledger' },
  moveMemory: { name: '招式记忆检索', description: '检索伙伴在历次等级成长中排队或错过的升级招式，并仍受物种合法招式表约束。', effect: 'move-memory', questSource: 'blaine-move-records' },
  leagueNotes: { name: '联盟复盘档案', description: '查看已完成联盟挑战的战绩与队伍成长摘要。', effect: 'league-history', questSource: 'blue-league-ledger' },
});
const clone = value => structuredClone(value);

function ensure(world) {
  if (!world || typeof world !== 'object') throw new TypeError('需要关都世界状态。');
  if (!world.机制奖励 || typeof world.机制奖励 !== 'object' || Array.isArray(world.机制奖励)) world.机制奖励 = {};
  const state = world.机制奖励;
  if (!Array.isArray(state.已解锁)) state.已解锁 = [];
  state.已解锁 = [...new Set(state.已解锁.filter(id => Object.hasOwn(GADGETS, id)))];
  if (!Object.hasOwn(PARTY_MODES, state.partyExpShareMode) || state.partyExpShareMode !== 'off' && !state.已解锁.includes('partyExpShare')) state.partyExpShareMode = 'off';
  if (!world.委托 || typeof world.委托 !== 'object' || Array.isArray(world.委托)) world.委托 = {};
  if (!world.委托.深度记录 || typeof world.委托.深度记录 !== 'object' || Array.isArray(world.委托.深度记录)) world.委托.深度记录 = {};
  for (const [id, record] of Object.entries(world.委托.深度记录)) {
    if (!byId.has(id) || !record || typeof record !== 'object' || !['active','ready','completed'].includes(record.status)) delete world.委托.深度记录[id];
  }
  return world;
}

function unlock(world, id) {
  ensure(world);
  if (!Object.hasOwn(GADGETS, id)) throw new Error('未知的永久机制奖励。');
  const unlocked = world.机制奖励.已解锁;
  const already = unlocked.includes(id);
  if (!already) unlocked.push(id);
  return { world, id, already, gadget: clone(GADGETS[id]) };
}

function view(world) {
  const safe = ensure(clone(world));
  refresh(safe);
  const unlocked = new Set(safe.机制奖励.已解锁);
  const gadgets = [...unlocked].map(id => ({ id, ...clone(GADGETS[id]), unlocked: true }));
  const ordinaryActive = Object.values(safe.委托.记录 || {}).filter(record => record?.status === 'active' || record?.status === 'ready').length;
  const available = options(safe, Math.max(0, MAX_ACTIVE_DEEP_AND_NPC - ordinaryActive));
  const quests = catalog.map(quest => {
    const record = safe.委托.深度记录[quest.id];
    const stageIndex = record ? record.stage : 0;
    const stage = quest.stages[stageIndex];
    const stageProgress = record
      ? record.status === 'completed' ? stage.objective.target : progress(safe, quest, record)
      : 0;
    const derivedStatus = record
      ? record.status === 'completed' ? 'completed' : stageProgress >= stage.objective.target ? 'ready' : 'active'
      : 'unaccepted';
    let blockReason = '';
    if (!record) {
      if (safe.剧情?.初始御三家已选 !== true) blockReason = '请先选择最初的伙伴。';
      else if (safe.战斗?.状态 !== 'finished') blockReason = '战斗中不能处理深度委托。';
      else if (safe.地图?.节点 !== quest.location) blockReason = `请前往${mapById.get(quest.location)?.name || quest.location}委托人所在地点。`;
      else if ((safe.训练家?.徽章?.length || 0) < quest.requiredBadges) blockReason = `需要至少${quest.requiredBadges}枚徽章。`;
      else if (quest.requiresGadget && !unlocked.has(quest.requiresGadget)) blockReason = `需要先解锁${GADGETS[quest.requiresGadget]?.name || quest.requiresGadget}。`;
      else if (activeCount(safe) + ordinaryActive >= MAX_ACTIVE_DEEP_AND_NPC) blockReason = '最多同时进行四项委托，请先推进或完成一项。';
    }
    const choices = quest.choices.map(choice => {
      const payload = { deepQuestId: quest.id, choiceId: choice.id };
      const native = available.find(option => option.id === 'deep-quest-accept' && option.payload.deepQuestId === quest.id && option.payload.choiceId === choice.id);
      let reason = '';
      if (record) reason = record.status === 'completed' ? '这项委托已经完成。' : '接取时已锁定调查方案。';
      else if (blockReason) reason = blockReason;
      else if (!Number.isSafeInteger(choice.cost?.coins || 0) || (choice.cost?.coins || 0) < 0) reason = '委托费用定义无效。';
      else if ((safe.训练家?.金钱 || 0) < (choice.cost?.coins || 0)) reason = `需要${choice.cost.coins}元才能完成这项选择。`;
      else if (native && !native.enabled) reason = native.reason || '当前不能接取这项委托。';
      else if (!native) reason = '当前场景不允许接取这项委托。';
      return {
        id: choice.id, label: choice.label, cost: clone(choice.cost || {}), echo: choice.echo,
        enabled: !reason, reason,
        payload,
      };
    });
    let action = { id: null, enabled: false, reason: '', payload: { deepQuestId: quest.id } };
    let reason = blockReason;
    if (derivedStatus === 'unaccepted') {
      action.reason = reason || '请先选择一项调查方案。';
      if (!reason) reason = action.reason;
    }
    else if (derivedStatus === 'active') {
      reason = safe.战斗?.状态 !== 'finished' ? '战斗中不能处理深度委托。' : `当前阶段尚未达到目标（${stageProgress}/${stage.objective.target}）。`;
      action.reason = reason;
    } else if (derivedStatus === 'completed') action.reason = reason = '这项委托已经完成。';
    else {
      const actionId = stageIndex === quest.stages.length - 1 ? 'deep-quest-claim' : 'deep-quest-advance';
      const native = available.find(option => option.id === actionId && option.payload.deepQuestId === quest.id);
      action = native
        ? { id: native.id, enabled: native.enabled, reason: native.reason || '', payload: clone(native.payload) }
        : { id: actionId, enabled: false, reason: '当前场景不允许报告或领取这项委托。', payload: actionId === 'deep-quest-claim' ? { deepQuestId: quest.id, choiceId: record.choiceId } : { deepQuestId: quest.id } };
      if (!native) reason = action.reason;
    }
    return {
      id: quest.id, title: quest.title, location: quest.location,
      locationName: mapById.get(quest.location)?.name || quest.location,
      npcId: quest.npcId, npcName: quest.npcName, npcPortrait: trainerById.get(quest.npcId)?.image || null,
      description: quest.description, rewardPreview: quest.rewardPreview,
      status: derivedStatus, stageIndex, stageCount: quest.stages.length,
      currentStage: {
        title: stage.title, description: stage.description, objective: clone(stage.objective),
        progress: Math.min(stage.objective.target, Math.max(0, stageProgress)), target: stage.objective.target,
      },
      reason, choices, action,
    };
  });
  return {
    gadgets,
    quests,
    partyExpShareMode: safe.机制奖励.partyExpShareMode,
    partyExpShareOptions: Object.entries(PARTY_MODES).map(([id,label]) => ({ id, label, enabled: id === 'off' || unlocked.has('partyExpShare') })),
    availableGadgets: Object.entries(GADGETS).map(([id,gadget]) => ({ id, ...clone(gadget), unlocked: unlocked.has(id) })),
  };
}

function applyConfig(world, key, value) {
  ensure(world);
  if (key !== 'partyExpShareMode') throw new Error('该设置不是可配置的机制奖励。');
  if (!world.机制奖励.已解锁.includes('partyExpShare')) throw new Error('尚未解锁全队经验共享装置。');
  if (!Object.hasOwn(PARTY_MODES, value)) throw new Error('请选择关闭、全队均分或旅程模式。');
  world.机制奖励.partyExpShareMode = value;
  return world;
}

function modifiers(world) {
  const state = ensure(clone(world)).机制奖励, has = id => state.已解锁.includes(id);
  return {
    partyExpShareMode: has('partyExpShare') ? state.partyExpShareMode : 'off',
    partyExpShareUnlocked: has('partyExpShare'),
    trainingTerminal: { unlocked: has('trainingTerminal'), levelMovesOnly: true, tmCompatibilityOnly: true, archive: has('terminalArchive'), memoryRecall: has('moveMemory'), freeCompatibleTM: has('researchTerminalFreeTM') },
    fieldRadar: { unlocked: has('fieldRadar'), typeFilter: has('fieldRadarPlus') },
    campKit: { unlocked: has('campKit'), enhancedRest: has('campKitPlus') },
    bondLens: has('bondLens'),
    leagueNotes: has('leagueNotes'),
  };
}

function ownedWild(world) {
  return [...(world.队伍 || []), ...(world.电脑 || [])].filter(mon => mon && (mon.收服来源 === 'wild' || String(mon.uid || '').startsWith('caught-')));
}
function snapshot(world) {
  const catches = ownedWild(world), data = world.委托 || {};
  return {
    caught: catches.length, caughtUids: catches.map(mon => mon.uid), caughtSpecies: catches.map(mon => mon.收服图鉴编号 || mon.图鉴编号),
    badges: Array.isArray(world.训练家?.徽章) ? world.训练家.徽章.length : 0,
    visitCounts: { ...(data.探访次数 || {}) }, eventSerial: data.事件序号 || 0,
    purchaseSerial: data.采购序号 || 0, trust: Object.fromEntries(Object.entries(world.羁绊?.伙伴 || {}).map(([uid, rec]) => [uid, rec?.信赖 || 0])),
    league: Number.isInteger(world.剧情?.联盟进度) ? world.剧情.联盟进度 : 0,
  };
}
function progress(world, quest, record) {
  const stage = quest.stages[record.stage], obj = stage.objective, base = record.baseline || {}, target = obj.target || 1, catches = ownedWild(world);
  if (obj.kind === 'caught') return Math.min(target, Math.max(0, catches.length - (base.caught || 0)));
  if (obj.kind === 'catch-species') { const before = new Set(base.caughtUids || []); return Math.min(target, catches.filter(mon => !before.has(mon.uid) && (mon.收服图鉴编号 || mon.图鉴编号) === obj.species).length); }
  if (obj.kind === 'catch-type') { const before = new Set(base.caughtUids || []); return Math.min(target, catches.filter(mon => !before.has(mon.uid) && require('./engine.cjs').catalog.species.find(s => s.id === (mon.收服图鉴编号 || mon.图鉴编号))?.types?.includes(obj.type)).length); }
  if (obj.kind === 'dex') { const before = new Set(base.caughtSpecies || []), after = new Set(catches.map(mon => mon.收服图鉴编号 || mon.图鉴编号)); for (const id of before) after.delete(id); return Math.min(target, after.size); }
  if (obj.kind === 'visit') { const before = base.visitCounts?.[obj.node] || 0, after = world.委托?.探访次数?.[obj.node] || 0; return Math.min(target, Math.max(0, after - before)); }
  if (obj.kind === 'badges') return Math.min(target, Math.max(0, (world.训练家?.徽章?.length || 0) - (base.badges || 0)));
  if (obj.kind === 'league') return Math.min(target, Math.max(0, (world.剧情?.联盟进度 || 0) - (base.league || 0)));
  if (obj.kind === 'bond') return Math.min(target, Math.max(0, ...Object.entries(world.羁绊?.伙伴 || {}).map(([uid, rec]) => (rec?.信赖 || 0) - (base.trust?.[uid] || 0))));
  if (obj.kind === 'care' || obj.kind === 'camp') return Math.min(target, (world.委托?.事件 || []).filter(event => event.serial > (base.eventSerial || 0) && event.action === obj.kind).length);
  return 0;
}
function statusLabel(record) { return record?.status === 'active' ? '进行中' : record?.status === 'ready' ? '可推进' : record?.status === 'completed' ? '已完成' : '未接取'; }
function task(quest, record) {
  const index = record?.stage || 0, stage = quest.stages[index];
  const currentProgress = record && record.status !== 'completed' ? record.progress || 0 : record ? stage.objective.target : 0;
  return { id:`deep-quest:${quest.id}`, questId:quest.id, category:'deep-quest', 标题:quest.title, name:quest.title,
    描述:stage ? `${quest.description} ${stage.description}` : quest.description, description:stage ? `${quest.description} ${stage.description}` : quest.description,
    委托人:quest.npcName, 委托地点:mapById.get(quest.location)?.name || quest.location, 奖励预告:quest.rewardPreview,
    状态:statusLabel(record), 进度:currentProgress, 目标:stage?.objective.target || 1, 阶段:`${Math.min(index+1,quest.stages.length)}/${quest.stages.length}`,
    stageTitle:stage?.title || '已完成', objective:stage ? clone(stage.objective) : null, ending:record?.ending || null };
}
function activeCount(world) { return Object.values(world.委托?.深度记录 || {}).filter(record => record.status === 'active' || record.status === 'ready').length; }
function refresh(world, { storyTurn } = {}) {
  ensure(world);
  for (const quest of catalog) {
    const record = world.委托.深度记录[quest.id];
    if (!record || record.status === 'completed') continue;
    record.progress = progress(world, quest, record);
    record.status = record.progress >= quest.stages[record.stage].objective.target ? 'ready' : 'active';
    if (record.status === 'ready' && Number.isSafeInteger(storyTurn)) record.readyTurn = storyTurn;
  }
  const oldTasks = (world.任务 || []).filter(item => item && !(typeof item.id === 'string' && item.id.startsWith('deep-quest:')));
  const tasks = catalog.map(quest => task(quest, world.委托.深度记录[quest.id]));
  const order = {'进行中':0,'可推进':1,'未接取':2,'已完成':3};
  tasks.sort((a,b) => order[a.状态]-order[b.状态] || a.标题.localeCompare(b.标题,'zh-CN'));
  const insertAt = oldTasks.findIndex(item => !String(item.id || '').startsWith('npc-quest:') && !MAIN_TASK_IDS.has(item.id));
  if (insertAt < 0) oldTasks.push(...tasks); else oldTasks.splice(insertAt,0,...tasks);
  world.任务 = oldTasks;
  return world;
}
function options(world, maxActive = 4) {
  ensure(world);
  const node = mapById.get(world.地图?.节点);
  if (!node || world.战斗?.状态 !== 'finished' || world.剧情?.初始御三家已选 !== true) return [];
  const out = [];
  for (const quest of catalog.filter(item => item.location === node.id && (world.训练家?.徽章?.length || 0) >= item.requiredBadges && (!item.requiresGadget || world.机制奖励.已解锁.includes(item.requiresGadget)))) {
    const record = world.委托.深度记录[quest.id];
    if (!record) {
      const capacityReason = activeCount(world) < maxActive ? '' : '最多同时进行四项委托，请先推进或完成一项。';
      for (const choice of quest.choices) {
        const coins = choice.cost?.coins || 0;
        const feeReason = !Number.isSafeInteger(coins) || coins < 0 ? '委托费用定义无效。' : (world.训练家?.金钱 || 0) < coins ? `需要${coins}元才能完成这项选择。` : '';
        const reason = capacityReason || feeReason;
        out.push({ id:'deep-quest-accept', label:`接取：${quest.title} · ${choice.label}`, enabled:!reason, ...(reason ? {reason} : {}), payload:{deepQuestId:quest.id, choiceId:choice.id} });
      }
    } else if (record.status === 'ready') {
      const isFinal = record.stage === quest.stages.length - 1;
      if (isFinal) out.push({id:'deep-quest-claim',label:`完成：${quest.title}`,enabled:true,payload:{deepQuestId:quest.id,choiceId:record.choiceId}});
      else out.push({id:'deep-quest-advance',label:`报告阶段：${quest.title} · ${quest.stages[record.stage].title}`,enabled:true,payload:{deepQuestId:quest.id}});
    }
  }
  return out;
}
function charge(world, cost) {
  const coins = cost?.coins || 0;
  if (!Number.isSafeInteger(coins) || coins < 0) throw new Error('委托费用定义无效。');
  if ((world.训练家?.金钱 || 0) < coins) throw new Error(`需要${coins}元才能完成这项选择。`);
  world.训练家.金钱 -= coins;
}
function apply(world, action, payload, { storyTurn }) {
  const next = ensure(clone(world));
  if (!Number.isSafeInteger(storyTurn) || storyTurn < 1) throw new Error('需要由宿主提供有效的故事回合。');
  if (next.剧情?.初始御三家已选 !== true) throw new Error('请先选择最初的伙伴。');
  if (next.战斗?.状态 !== 'finished') throw new Error('战斗中不能处理深度委托。');
  const quest = byId.get(payload?.deepQuestId);
  if (!quest) throw new Error('没有这项深度委托。');
  if (quest.location !== next.地图?.节点 || (next.训练家?.徽章?.length || 0) < quest.requiredBadges || quest.requiresGadget && !next.机制奖励.已解锁.includes(quest.requiresGadget)) throw new Error('需要到达委托人所在地点并满足徽章与前置机制条件。');
  const record = next.委托.深度记录[quest.id];
  if (action === 'deep-quest-accept') {
    if (record) throw new Error('这项深度委托已经接取或完成。');
    const ordinaryActive = Object.values(next.委托.记录 || {}).filter(item => item?.status === 'active' || item?.status === 'ready').length;
    if (ordinaryActive + activeCount(next) >= MAX_ACTIVE_DEEP_AND_NPC) throw new Error('最多同时进行四项委托，请先推进或完成一项。');
    const choice = quest.choices.find(item => item.id === payload.choiceId);
    if (!choice) throw new Error('请选择一项调查方案。');
    charge(next, choice.cost);
    next.委托.深度记录[quest.id] = { status:'active', stage:0, progress:0, acceptedTurn:storyTurn, choiceId:choice.id, choiceEcho:choice.echo, baseline:snapshot(next) };
  } else if (action === 'deep-quest-advance') {
    if (!record || record.status !== 'ready' || record.stage >= quest.stages.length-1 || progress(next,quest,record) < quest.stages[record.stage].objective.target) throw new Error('当前阶段尚未达到推进条件。');
    record.stage += 1; record.progress = 0; record.status = 'active'; record.stageTurn = storyTurn; record.baseline = snapshot(next);
  } else if (action === 'deep-quest-claim') {
    if (!record || record.status !== 'ready' || record.stage !== quest.stages.length-1 || progress(next,quest,record) < quest.stages[record.stage].objective.target) throw new Error('最终阶段尚未完成。');
    const choice = quest.choices.find(item => item.id === record.choiceId);
    if (!choice || payload.choiceId !== record.choiceId) throw new Error('深度委托结尾与已选方案不一致。');
    const bundle = quest.reward.items || {};
    const bag = next.背包?.物品;
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) throw new Error('无法发放委托奖励：背包资料无效。');
    for (const [id, amount] of Object.entries(bundle)) {
      if (!itemById.has(id) || !Number.isSafeInteger(amount) || amount <= 0) throw new Error('深度委托奖励物品资料无效。');
      const current = Number.isSafeInteger(bag[id]) && bag[id] >= 0 ? bag[id] : 0;
      if (current + amount > 999) throw new Error(`${itemById.get(id).name}已达到携带上限，无法领取整份委托奖励。`);
    }
    for (const [id, amount] of Object.entries(bundle)) bag[id] = (bag[id] || 0) + amount;
    if (quest.reward.gadget) unlock(next, quest.reward.gadget);
    record.status = 'completed'; record.completedTurn = storyTurn; record.progress = quest.stages[record.stage].objective.target; record.ending = choice.echo;
  } else throw new Error('未知深度委托操作。');
  refresh(next,{storyTurn});
  return next;
}

function actionResult(world, action, payload = {}) {
  const quest = byId.get(payload?.deepQuestId);
  if (!quest || !['deep-quest-accept', 'deep-quest-advance', 'deep-quest-claim'].includes(action)) return null;
  const record = world?.委托?.深度记录?.[quest.id];
  if (!record) return null;
  if (action === 'deep-quest-accept') {
    if (!['active','ready'].includes(record.status) || record.stage !== 0) return null;
    return { type: 'accepted', questId: quest.id, title: quest.title, npcName: quest.npcName, result: `已接取「${quest.title}」，当前阶段：${quest.stages[0].title}。`, currentStage: { title: quest.stages[0].title, description: quest.stages[0].description, objective: clone(quest.stages[0].objective) } };
  }
  if (action === 'deep-quest-advance') {
    if (record.status !== 'active' || record.stage < 1) return null;
    const stage = quest.stages[record.stage];
    return { type: 'stage-advanced', questId: quest.id, title: quest.title, npcName: quest.npcName, result: `已向${quest.npcName}报告「${quest.stages[record.stage - 1].title}」；当前阶段：${stage.title}。`, currentStage: { title: stage.title, description: stage.description, objective: clone(stage.objective) } };
  }
  if (record.status !== 'completed' || !Number.isSafeInteger(record.completedTurn)) return null;
  const items = Object.entries(quest.reward.items || {}).map(([id, count]) => `${itemById.get(id)?.name || id}×${count}`);
  const gadget = quest.reward.gadget ? GADGETS[quest.reward.gadget]?.name : null;
  return { type: 'completed', questId: quest.id, title: quest.title, npcName: quest.npcName, result: `已完成「${quest.title}」${gadget ? `，解锁${gadget}` : ''}${items.length ? `，获得${items.join('、')}` : ''}。`, ending: record.ending || '', rewardPreview: quest.rewardPreview };
}
function validate(world) {
  const state = world?.机制奖励;
  if (!state || !Array.isArray(state.已解锁) || new Set(state.已解锁).size !== state.已解锁.length || state.已解锁.some(id => !Object.hasOwn(GADGETS,id))) throw new Error('永久机制奖励资料无效。');
  if (!Object.hasOwn(PARTY_MODES,state.partyExpShareMode) || state.partyExpShareMode !== 'off' && !state.已解锁.includes('partyExpShare')) throw new Error('全队经验共享模式无效。');
  const records = world?.委托?.深度记录;
  if (!records || typeof records !== 'object' || Array.isArray(records)) throw new Error('深度委托记录无效。');
  for (const [id, record] of Object.entries(records)) {
    const quest=byId.get(id);
    if (!quest || !record || !['active','ready','completed'].includes(record.status) || !Number.isInteger(record.stage) || record.stage<0 || record.stage>=quest.stages.length || !Number.isInteger(record.progress) || record.progress<0 || record.progress>quest.stages[record.stage].objective.target) throw new Error('深度委托进度无效。');
  }
  return true;
}

module.exports = { ensure, unlock, view, modifiers, applyConfig, options, refresh, apply, actionResult, validate, activeCount, definitions: clone(catalog), gadgets: clone(GADGETS), PARTY_MODES };
