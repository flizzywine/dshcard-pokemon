'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mvu = require('../mvu.cjs');
const npcQuests = require('../npc-quests.cjs');
const gadgets = require('../quest-gadgets.cjs');
const gadgetActions = require('../gadget-actions.cjs');
const encounters = require('../frlg-encounters.cjs');
const { catalog, KantoGame } = require('../engine.cjs');
const quests = gadgets.definitions;
const map = require('../public/data/map.json');
const mapById = new Map(map.map(node => [node.id, node]));
const BADGES = ['岩石徽章', '蓝色徽章', '橙色徽章', '彩虹徽章', '粉红徽章', '金色徽章', '深红徽章', '绿色徽章'];
const root = variables => variables.stat_data.宝可梦;

function worldFor(quest) {
  const variables = mvu.chooseStarter(mvu.createInitialMvu(), 1);
  const world = root(variables);
  world.地图.节点 = quest.location;
  world.地图.地点 = mapById.get(quest.location).name;
  world.战斗 = { ...world.战斗, 状态: 'finished', 结果: '', 摘要: '' };
  world.剧情.初始御三家已选 = true;
  world.训练家.徽章 = BADGES.slice(0, quest.requiredBadges);
  world.训练家.金钱 = 999999;
  if (quest.requiresGadget) gadgets.unlock(world, quest.requiresGadget);
  npcQuests.refresh(world, { storyTurn: 1 });
  return variables;
}

function encounterSpecies() {
  const found = new Set();
  for (const node of map) for (const version of ['firered', 'leafgreen']) {
    for (const method of ['auto', 'oldrod', 'goodrod', 'superrod']) {
      for (const id of encounters.pool(node.id, { version, method })?.species || []) found.add(id);
    }
  }
  return found;
}

function appendWildCatch(world, speciesId, uid) {
  assert.ok(encounterSpecies().has(speciesId), `species ${speciesId} must be in a real FRLG encounter pool`);
  const mon = mvu.makeMon(speciesId, 5, uid, { wild: true });
  mon.收服来源 = 'wild';
  mon.收服图鉴编号 = speciesId;
  world.电脑.push(mon);
}

function options(variables) { return mvu.theaterView(variables).theater.options; }
function act(variables, action, payload, storyTurn) {
  return mvu.theaterAction(variables, action, { ...payload, storyTurn });
}

function speciesFor(objective, exclude = new Set()) {
  const seen = encounterSpecies();
  if (objective.kind === 'catch-species') return seen.has(objective.species) && !exclude.has(objective.species) ? objective.species : null;
  if (objective.kind === 'catch-type') return catalog.species.find(species => seen.has(species.id) && !exclude.has(species.id) && species.types.includes(objective.type))?.id || null;
  return [...seen].find(id => !exclude.has(id));
}

function satisfy(world, variables, quest, objective, turn) {
  switch (objective.kind) {
    case 'visit':
      npcQuests.recordVisit(world, objective.node);
      break;
    case 'caught':
      for (let i = 0; i < objective.target; i++) appendWildCatch(world, speciesFor({ kind: 'caught' }), `audit-${quest.id}-${turn}-${i}`);
      break;
    case 'catch-species':
    case 'catch-type':
      for (let i = 0; i < objective.target; i++) appendWildCatch(world, speciesFor(objective), `audit-${quest.id}-${turn}-${i}`);
      break;
    case 'dex': {
      const used = new Set([...world.队伍, ...world.电脑].map(mon => mon.收服图鉴编号 || mon.图鉴编号));
      for (let i = 0; i < objective.target; i++) {
        const id = speciesFor({ kind: 'caught' }, used);
        assert.ok(id, 'a new pool species must exist for dex objectives');
        appendWildCatch(world, id, `audit-${quest.id}-${turn}-${i}`);
        used.add(id);
      }
      break;
    }
    case 'badges':
      world.训练家.徽章 = BADGES.slice(0, Math.min(8, world.训练家.徽章.length + objective.target));
      break;
    case 'bond':
      // A real camp action raises trust for the whole party and is exposed in the theater.
      // One camp grants +5, enough for the currently authored bond thresholds (2–3).
      variables = act(variables, 'camp', { mode: 'rest' }, turn);
      return variables;
    case 'care':
      // Camp rest is the exposed theater action; it records a care event for care objectives.
      for (let i = 0; i < objective.target; i++) variables = act(variables, 'camp', { mode: 'rest' }, turn + i);
      return variables;
    case 'camp':
      for (let i = 0; i < objective.target; i++) variables = act(variables, 'camp', {}, turn + i);
      return variables;
    case 'league':
      world.剧情.联盟进度 = Math.min(5, (world.剧情.联盟进度 || 0) + objective.target);
      break;
    default:
      assert.fail(`unsupported objective kind: ${objective.kind}`);
  }
  npcQuests.refresh(world, { storyTurn: turn });
  return variables;
}

function makeReadyEvidence(world, quest, objective) {
  if (objective.kind === 'visit') {
    world.委托.探访次数[objective.node] = objective.target;
    world.委托.探访地点 = [...new Set([...world.委托.探访地点, objective.node])];
  } else if (objective.kind === 'caught') {
    for (let i = 0; i < objective.target; i++) appendWildCatch(world, speciesFor({ kind: 'caught' }), `cap-${quest.id}-${i}`);
  } else if (objective.kind === 'catch-species' || objective.kind === 'catch-type') {
    for (let i = 0; i < objective.target; i++) appendWildCatch(world, speciesFor(objective), `cap-${quest.id}-${i}`);
  } else if (objective.kind === 'dex') {
    const used = new Set([...world.队伍, ...world.电脑].map(mon => mon.收服图鉴编号 || mon.图鉴编号));
    for (let i = 0; i < objective.target; i++) {
      const id = speciesFor({ kind: 'caught' }, used);
      appendWildCatch(world, id, `cap-${quest.id}-${i}`);
      used.add(id);
    }
  } else if (objective.kind === 'badges') {
    world.训练家.徽章 = BADGES.slice(0, Math.min(8, quest.requiredBadges + objective.target));
  } else if (objective.kind === 'league') world.剧情.联盟进度 = objective.target;
  else if (objective.kind === 'bond') {
    const uid = world.队伍[0].uid;
    world.羁绊.伙伴[uid].信赖 = objective.target;
  } else if (objective.kind === 'care' || objective.kind === 'camp') {
    world.委托.事件 = Array.from({ length: objective.target }, (_, index) => ({ serial: index + 1, action: objective.kind }));
    world.委托.事件序号 = objective.target;
  }
}

test('all 33 objectives use supported schemas and every capture target exists in the FRLG weighted pools', () => {
  assert.equal(quests.length, 33);
  const supported = new Set(['visit', 'caught', 'catch-species', 'catch-type', 'dex', 'badges', 'league', 'bond', 'care', 'camp']);
  const poolSpecies = encounterSpecies();
  const poolTypes = new Set(catalog.species.filter(species => poolSpecies.has(species.id)).flatMap(species => species.types));
  for (const quest of quests) {
    assert.ok(mapById.has(quest.location), `${quest.id}: valid commission node`);
    assert.ok(Number.isInteger(quest.requiredBadges) && quest.requiredBadges >= 0 && quest.requiredBadges <= 8, `${quest.id}: badge requirement`);
    assert.ok(quest.stages.length >= 1, `${quest.id}: at least one stage`);
    for (const { objective } of quest.stages) {
      assert.ok(supported.has(objective.kind), `${quest.id}: unsupported target ${objective.kind}`);
      assert.ok(Number.isInteger(objective.target) && objective.target > 0, `${quest.id}: positive target count`);
      if (objective.kind === 'visit') assert.ok(mapById.has(objective.node), `${quest.id}: visit node exists`);
      if (objective.kind === 'catch-species') assert.ok(poolSpecies.has(objective.species), `${quest.id}: species ${objective.species} appears in an FRLG pool`);
      if (objective.kind === 'catch-type') assert.ok(poolTypes.has(objective.type), `${quest.id}: type ${objective.type} appears in an FRLG pool`);
    }
  }
});

test('gadget prerequisites have a finite source-quest chain with no cycle or self-lock', () => {
  const sourceFor = new Map();
  for (const quest of quests) if (quest.reward.gadget) sourceFor.set(quest.reward.gadget, quest);
  for (const quest of quests) if (quest.requiresGadget) assert.ok(sourceFor.has(quest.requiresGadget), `${quest.id}: required gadget has a commission source`);
  for (const start of quests) {
    const seen = new Set();
    let current = start;
    while (current?.requiresGadget) {
      assert.ok(!seen.has(current.id), `gadget quest chain cycles through ${current.id}`);
      seen.add(current.id);
      current = sourceFor.get(current.requiresGadget);
      assert.ok(current, `${start.id}: gadget dependency resolves to a source quest`);
    }
  }
});

test('deep quest view returns all 33 read-only details and mirrors native accept, advance, and claim availability', () => {
  const quest = quests.find(entry => entry.id === 'route3-moonstone-ledger');
  let variables = worldFor(quest), world = root(variables);
  world.羁绊.伙伴[world.队伍[0].uid].信赖 = 0;
  world.训练家.金钱 = 0;
  const before = structuredClone(world);
  let view = gadgets.view(world);
  assert.equal(view.quests.length, 33);
  assert.deepEqual(world, before, 'view only normalizes a clone');
  let row = view.quests.find(entry => entry.id === quest.id);
  assert.equal(row.status, 'unaccepted');
  assert.deepEqual(Object.keys(row.currentStage).sort(), ['description', 'objective', 'progress', 'target', 'title'].sort());
  assert.ok(row.reason.includes('前往') === false, 'local commission has no location blocker');
  const paid = row.choices.find(choice => choice.id === 'publish');
  assert.equal(paid.enabled, false);
  assert.equal(paid.reason, '需要250元才能完成这项选择。');
  const nativePaid = gadgets.options(world).find(option => option.payload.deepQuestId === quest.id && option.payload.choiceId === paid.id);
  assert.equal(nativePaid.enabled, paid.enabled);
  assert.equal(nativePaid.reason, paid.reason);
  assert.equal(row.choices.find(choice => choice.id === 'keep').enabled, true);

  world.委托.深度记录[quest.id] = {
    status: 'ready', stage: 0, progress: 1, acceptedTurn: 1, choiceId: 'keep',
    baseline: { visitCounts: { 'mt-moon': 0 } },
  };
  world.委托.探访次数['mt-moon'] = 1;
  npcQuests.refresh(world, { storyTurn: 2 });
  view = gadgets.view(world); row = view.quests.find(entry => entry.id === quest.id);
  const advance = gadgets.options(world).find(option => option.id === 'deep-quest-advance' && option.payload.deepQuestId === quest.id);
  assert.equal(row.status, 'ready');
  assert.deepEqual(row.action, { id: advance.id, enabled: advance.enabled, reason: advance.reason || '', payload: advance.payload });

  world.委托.深度记录[quest.id] = {
    status: 'ready', stage: 2, progress: 1, acceptedTurn: 1, choiceId: 'keep',
    baseline: { eventSerial: 0 },
  };
  world.委托.事件 = [{ serial: 1, action: 'care', storyTurn: 3 }];
  world.委托.事件序号 = 1;
  npcQuests.refresh(world, { storyTurn: 3 });
  view = gadgets.view(world); row = view.quests.find(entry => entry.id === quest.id);
  const claim = gadgets.options(world).find(option => option.id === 'deep-quest-claim' && option.payload.deepQuestId === quest.id);
  assert.equal(row.action.id, 'deep-quest-claim');
  assert.equal(row.action.enabled, true);
  assert.deepEqual(row.action.payload, claim.payload);

  world.训练家.金钱 = 999999;
  world.战斗.状态 = 'active';
  row = gadgets.view(world).quests.find(entry => entry.id === quest.id);
  assert.equal(row.status, 'ready');
  assert.equal(row.action.enabled, false);
  assert.match(row.action.reason, /当前场景不允许/);
});

test('deep quest view explains starter, battle, location, badge, tool, and combined active-cap blockers', () => {
  const quest = quests.find(entry => entry.id === 'misty-water-memory');
  let variables = worldFor(quest), world = root(variables);
  world.训练家.徽章 = [];
  world.机制奖励.已解锁 = world.机制奖励.已解锁.filter(id => id !== 'trainingTerminal');
  let row = gadgets.view(world).quests.find(entry => entry.id === quest.id);
  assert.match(row.reason, /至少1枚徽章/);
  world.训练家.徽章 = ['岩石徽章'];
  row = gadgets.view(world).quests.find(entry => entry.id === quest.id);
  assert.match(row.reason, /招式研修终端/);
  world.机制奖励.已解锁.push('trainingTerminal');
  world.地图.节点 = 'pewter';
  row = gadgets.view(world).quests.find(entry => entry.id === quest.id);
  assert.match(row.reason, /前往华蓝市/);
  world.地图.节点 = 'cerulean';
  world.战斗.状态 = 'active';
  row = gadgets.view(world).quests.find(entry => entry.id === quest.id);
  assert.match(row.reason, /战斗中/);

  world.战斗.状态 = 'finished';
  world.委托.记录 = Object.fromEntries(npcQuests.quests.slice(0, 4).map(definition => [definition.id, { status: 'active' }]));
  const blocked = gadgets.view(world).quests.find(entry => entry.id === quest.id);
  const native = npcQuests.options(world).find(option => option.payload.deepQuestId === quest.id && option.payload.choiceId === 'keep');
  assert.equal(native.enabled, false);
  assert.equal(blocked.choices.find(choice => choice.id === 'keep').enabled, false);
  assert.match(blocked.choices.find(choice => choice.id === 'keep').reason, /最多同时进行四项委托/);

  variables = mvu.createInitialMvu();
  world = root(variables); world.地图.节点 = quest.location; world.战斗.状态 = 'finished'; world.训练家.徽章 = ['岩石徽章'];
  row = gadgets.view(world).quests.find(entry => entry.id === quest.id);
  assert.match(row.reason, /先选择最初的伙伴/);
});

test('all seven field commissions including the relocated Koga commission are accepted, advanced, and claimed through native MVU theater actions', () => {
  const wild = quests.filter(quest => mapById.get(quest.location).kind !== 'town' || quest.id === 'koga-no-trace-camp');
  assert.equal(wild.length, 7);
  for (const quest of wild) {
    let variables = worldFor(quest), world = root(variables);
    const free = quest.choices.find(choice => !choice.cost?.coins || choice.cost.coins === 0);
    assert.ok(free, `${quest.id}: a no-cost route is available`);
    const accept = options(variables).find(option => option.id === 'deep-quest-accept' && option.payload.deepQuestId === quest.id && option.payload.choiceId === free.id);
    assert.ok(accept?.enabled, `${quest.id}: native theater offers the local contact`);
    variables = act(variables, accept.id, accept.payload, 1);
    assert.equal(root(variables).委托.深度记录[quest.id].status, 'active');

    for (let stageIndex = 0; stageIndex < quest.stages.length; stageIndex++) {
      const stage = quest.stages[stageIndex];
      variables = satisfy(root(variables), variables, quest, stage.objective, 10 + stageIndex * 10);
      world = root(variables);
      assert.equal(world.委托.深度记录[quest.id].status, 'ready', `${quest.id} stage ${stageIndex + 1} is reachable`);
      if (stageIndex < quest.stages.length - 1) {
        const advance = options(variables).find(option => option.id === 'deep-quest-advance' && option.payload.deepQuestId === quest.id);
        assert.ok(advance?.enabled, `${quest.id} stage ${stageIndex + 1}: native progress action is offered`);
        variables = act(variables, advance.id, advance.payload, 15 + stageIndex * 10);
      } else {
        const claim = options(variables).find(option => option.id === 'deep-quest-claim' && option.payload.deepQuestId === quest.id);
        assert.ok(claim?.enabled, `${quest.id}: native reward action is offered`);
        variables = act(variables, claim.id, claim.payload, 50);
        assert.equal(root(variables).委托.深度记录[quest.id].status, 'completed');
        assert.throws(() => act(variables, claim.id, claim.payload, 51), /已经完成|尚未完成|当前场景不允许/);
      }
    }
  }
});

test('paid choice failures are atomic and every advertised fee is a runtime-valid integer', () => {
  const quest = quests.find(entry => entry.id === 'ash-path-notes');
  const choice = quest.choices.find(entry => entry.id === 'field-kit');
  const variables = worldFor(quest), world = root(variables);
  world.训练家.金钱 = 0;
  const before = structuredClone(world);
  assert.throws(() => act(variables, 'deep-quest-accept', { deepQuestId: quest.id, choiceId: choice.id }, 1), /需要250元/);
  assert.deepEqual(root(variables), before, 'a rejected paid acceptance leaves the source save unchanged');

  const malformed = quests.flatMap(entry => entry.choices.filter(option => option.cost?.coins !== undefined && !Number.isSafeInteger(option.cost.coins)).map(option => `${entry.id}/${option.id}=${JSON.stringify(option.cost.coins)}`));
  assert.deepEqual(malformed, [], `paid choice amounts must be integers accepted by quest-gadgets.charge: ${malformed.join(', ')}`);
});

test('all bundled special rewards exist in the MVU bag and claim checks the full bundle atomically against cap 999', () => {
  const initial = root(mvu.createInitialMvu());
  for (const quest of quests) for (const [item, amount] of Object.entries(quest.reward.items || {})) {
    assert.ok(Object.hasOwn(initial.背包.物品, item), `${quest.id}: ${item} has an MVU inventory slot`);
    assert.ok(Number.isSafeInteger(amount) && amount > 0 && amount <= 999, `${quest.id}: ${item} amount fits the bag cap`);
  }
  for (const quest of quests.filter(entry => Object.keys(entry.reward.items || {}).length)) {
    const variables = worldFor(quest), world = root(variables), reward = quest.reward.items;
    const choice = quest.choices.find(entry => !entry.cost?.coins || entry.cost.coins === 0);
    const last = quest.stages.length - 1;
    makeReadyEvidence(world, quest, quest.stages[last].objective);
    world.委托.深度记录[quest.id] = { status: 'ready', stage: last, progress: quest.stages[last].objective.target, acceptedTurn: 1, choiceId: choice.id, baseline: { badges: quest.requiredBadges } };
    for (const [item, amount] of Object.entries(reward)) world.背包.物品[item] = 1000 - amount;
    const before = structuredClone(world);
    assert.throws(() => gadgets.apply(world, 'deep-quest-claim', { deepQuestId: quest.id, choiceId: choice.id }, { storyTurn: 2 }), /携带上限/);
    assert.deepEqual(world, before, `${quest.id}: a full-bundle cap failure is atomic`);
  }
});

test('each gadget reward changes an actual tool or battle outcome; bond and league archives expose real data', () => {
  const world = root(mvu.chooseStarter(mvu.createInitialMvu(), 1));
  world.地图.节点 = 'viridian-forest';
  world.战斗 = { ...world.战斗, 状态: 'finished' };
  const companion = world.队伍[0], bondRecord = world.羁绊.伙伴[companion.uid];
  bondRecord.信赖 = 17; bondRecord.心情 = '安心'; bondRecord.共同记忆 = [{ 故事轮次: 12, 事件: '在森林边休息后一起观察到波波归巢。' }];
  world.剧情.联盟进度 = 2;
  world.剧情.关都主线.tournament = { attempts: 2, attempt: 2, round: 0, champion: false, status: 'eliminated', rewardClaimed: false, history: [{ attempt: 1, result: 'eliminated', roundsWon: 3 }, { attempt: 2, result: 'eliminated', roundsWon: 1 }] };
  world.战斗 = { ...world.战斗, 轮次: 22, 结果: 'win', 摘要: '战胜野外训练家。' };
  const baseline = gadgetActions.view(world, { storyTurn: 100 });
  const semantic = value => { const copy = structuredClone(value); delete copy.gadgets; return copy; };
  const noEffect = [];
  for (const [id, questSource] of Object.entries(gadgets.gadgets)) {
    assert.ok(quests.some(quest => quest.id === questSource.questSource && quest.reward.gadget === id), `${id}: declared source quest actually grants it`);
    const upgraded = structuredClone(world);
    gadgets.unlock(upgraded, id);
    if (['terminalArchive', 'researchTerminalFreeTM', 'moveMemory'].includes(id)) gadgets.unlock(upgraded, 'trainingTerminal');
    const view = gadgetActions.view(upgraded, { storyTurn: 100 });
    if (id === 'fieldRadar') assert.equal(view.ecology.unlocked, true);
    if (id === 'fieldRadarPlus') assert.equal(view.ecology.typeFilter, true);
    if (id === 'trainingTerminal') assert.equal(view.terminal.unlocked, true);
    if (id === 'terminalArchive' || id === 'moveMemory') assert.equal(view.terminal.recallUnlocked, true);
    if (id === 'researchTerminalFreeTM') assert.equal(view.terminal.freeCompatibleTM, true);
    if (id === 'campKit') assert.equal(view.camp.plus, false);
    if (id === 'campKitPlus') assert.equal(view.camp.plus, true);
    if (id === 'bondLens' && !view.bondHistory?.entries.some(entry => entry.uid === companion.uid && entry.trust === 17 && entry.memories[0]?.text === '在森林边休息后一起观察到波波归巢。')) noEffect.push(`${id}: no saved bond history in gadget-actions.view`);
    if (id === 'leagueNotes' && (view.leagueHistory?.leagueProgress !== 2 || view.leagueHistory.tournamentAttempts !== 2 || view.leagueHistory.tournamentHistory?.[0]?.roundsWon !== 1 || view.leagueHistory.lastSettlement?.summary !== '战胜野外训练家。')) noEffect.push(`${id}: saved league/tournament/battle records are missing from gadget-actions.view`);
  }
  const radar = structuredClone(world); gadgets.unlock(radar, 'fieldRadar');
  assert.notDeepEqual(semantic(gadgetActions.view(radar)), semantic(baseline), 'field radar must add local ecology data');
  const radarUpgrade = structuredClone(world); gadgets.unlock(radarUpgrade, 'fieldRadar'); gadgets.unlock(radarUpgrade, 'fieldRadarPlus');
  const typeView = gadgetActions.view(radarUpgrade, { type: 'Bug' });
  assert.equal(typeView.ecology.typeFilter, true);
  assert.ok(typeView.ecology.species.every(species => species.types.includes('Bug')), 'radar upgrade filters the actual local pool');
  const basicCamp = structuredClone(world), enhancedCamp = structuredClone(world);
  for (const sample of [basicCamp, enhancedCamp]) {
    sample.地图.节点 = 'route1';
    sample.队伍[0].当前HP = 1;
    sample.队伍[0].招式[0].PP = 0;
    gadgets.unlock(sample, 'campKit');
  }
  gadgets.unlock(enhancedCamp, 'campKitPlus');
  const basicRest = gadgetActions.apply(basicCamp, 'gadget-camp-rest', {}, { storyTurn: 100 });
  const enhancedRest = gadgetActions.apply(enhancedCamp, 'gadget-camp-rest', {}, { storyTurn: 100 });
  assert.equal(basicRest.队伍[0].当前HP, Math.min(basicRest.队伍[0].能力值.hp, 1 + Math.floor(basicRest.队伍[0].能力值.hp / 2)));
  assert.equal(enhancedRest.队伍[0].当前HP, enhancedRest.队伍[0].能力值.hp, 'campKitPlus changes actual recovery to full HP');
  const recallWorld = structuredClone(world), learner = recallWorld.队伍[0];
  learner.等级 = 10; learner.经验 = mvu.expAt(10, learner.图鉴编号); learner.能力值 = mvu.stats(learner); learner.当前HP = learner.能力值.hp;
  gadgets.unlock(recallWorld, 'trainingTerminal'); gadgets.unlock(recallWorld, 'terminalArchive');
  const recallView = gadgetActions.view(recallWorld, { storyTurn: 101 });
  assert.ok(recallView.terminal.levelMoves.some(entry => entry.canRecall && entry.moves.length), 'terminal archive exposes real missed FRLG level moves');
  const recallMove = recallView.terminal.levelMoves.find(entry => entry.moves.length).moves[0];
  const recalled = gadgetActions.apply(recallWorld, 'gadget-recall', { uid: learner.uid, move: recallMove.id, slot: 1 }, { storyTurn: 101 });
  assert.ok(recalled.队伍[0].招式.some(move => move.id === recallMove.id));
  const machineWorld = structuredClone(world), machineLearner = machineWorld.队伍[0];
  gadgets.unlock(machineWorld, 'trainingTerminal'); machineWorld.背包.物品.tm06 = 1;
  const consumed = gadgetActions.apply(machineWorld, 'gadget-machine', { uid: machineLearner.uid, item: 'tm06' }, { storyTurn: 102 });
  const freeWorld = structuredClone(machineWorld); gadgets.unlock(freeWorld, 'researchTerminalFreeTM');
  freeWorld.队伍[0].招式 = freeWorld.队伍[0].招式.filter(move => move.id !== 'toxic'); freeWorld.背包.物品.tm06 = 1;
  const freeUse = gadgetActions.apply(freeWorld, 'gadget-machine', { uid: machineLearner.uid, item: 'tm06' }, { storyTurn: 103 });
  assert.equal(consumed.背包.物品.tm06, 0);
  assert.equal(freeUse.背包.物品.tm06, 1, 'research permit only changes TM consumption inside the terminal');
  assert.deepEqual(noEffect, [], `reward names must be backed by implemented tool views: ${noEffect.join('; ')}`);
});

test('party experience sharing changes battle settlement instead of only toggling its label', () => {
  function finish(variables) {
    const game = new KantoGame();
    const snapshot = mvu.startFromMvu(game, variables);
    const record = game.battles.get(snapshot.id);
    const foes = record.battle.p2.pokemon, players = record.battle.p1.pokemon;
    record.participationByFoe = Object.fromEntries(foes.map(foe => [foe.set.slotId, [players[0].set.slotId]]));
    record.livingByFoeAtDefeat = Object.fromEntries(foes.map(foe => [foe.set.slotId, players.map(player => player.set.slotId)]));
    for (const foe of foes) { foe.hp = 0; foe.fainted = true; }
    record.battle.win('p1');
    return mvu.applyBattleResult(variables, record);
  }
  const base = mvu.chooseStarter(mvu.createInitialMvu(), 1);
  const baseWorld = root(base);
  baseWorld.地图.轮次 = Math.max(2, baseWorld.地图.轮次);
  baseWorld.战斗 = { ...baseWorld.战斗, 状态: 'finished', 结果: '', 摘要: '' };
  const bench = mvu.makeMon(4, 5, 'audit-exp-bench');
  baseWorld.队伍.push(bench);
  const shared = structuredClone(base);
  gadgets.unlock(root(shared), 'partyExpShare');
  gadgets.applyConfig(root(shared), 'partyExpShareMode', 'journey');
  function prepare(variables) {
    const world = root(variables);
    world.遭遇 = { 类型: 'trainer', 训练家: '审计训练家', 队伍: [mvu.makeMon(4, 20, `audit-exp-foe-${world.机制奖励.partyExpShareMode}`)] };
    world.战斗 = { 轮次: world.地图.轮次 + 1, 状态: 'pending', 结果: '', 摘要: '', 操作序号: 0 };
    return variables;
  }
  const controlResult = finish(prepare(base));
  const sharedResult = finish(prepare(shared));
  const controlBench = root(controlResult).队伍.find(mon => mon.uid === bench.uid);
  const sharedBench = root(sharedResult).队伍.find(mon => mon.uid === bench.uid);
  assert.equal(controlBench.经验, mvu.expAt(5, controlBench.图鉴编号));
  assert.ok(sharedBench.经验 > mvu.expAt(5, sharedBench.图鉴编号));
});
