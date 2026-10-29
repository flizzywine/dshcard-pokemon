'use strict';

// Optional project-original field tools. These conveniences do not change the
// FRLG battle rules; their availability is controlled by quest-gadgets.cjs.
const fs = require('node:fs');
const path = require('node:path');
const {catalog} = require('./engine.cjs');
const growth = require('./growth-mechanics.cjs');
const wildEncounters=require('./wild-encounter-adapter.cjs');
const questGadgets = require('./quest-gadgets.cjs');
const npcQuests = require('./npc-quests.cjs');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data', name), 'utf8').replace(/^\uFEFF/, ''));
const locations = read('map.json');
const machines = read('tmhm.json').filter(item => item.kind === 'tm');
const nodeById = new Map(locations.map(node => [node.id, node]));
const speciesById = new Map(catalog.species.map(species => [species.id, species]));
const machineById = new Map(machines.map(machine => [machine.id, machine]));
const moveName = id => catalog.moves[id]?.name || catalog.moves[id]?.english || id;
const clone = value => structuredClone(value);

function ensureWorld(world) {
  if (!world || typeof world !== 'object' || Array.isArray(world)) throw new TypeError('需要关都世界状态。');
  questGadgets.ensure(world);
  const state = world.机制奖励;
  if (!state.操作记录 || typeof state.操作记录 !== 'object' || Array.isArray(state.操作记录)) state.操作记录 = {};
  for (const key of ['营地轮次', '回忆轮次']) {
    if (state.操作记录[key] !== undefined && (!Number.isSafeInteger(state.操作记录[key]) || state.操作记录[key] < 0)) delete state.操作记录[key];
  }
  return world;
}

function currentLevelMoves(mon) {
  const current = speciesById.get(mon.图鉴编号);
  if (!current || !Number.isInteger(mon.等级)) return [];
  const byMove = new Map();
  for (let species = growth.Dex.species.get(current.key); species?.exists; species = species.prevo ? growth.Dex.species.get(species.prevo) : null) {
    const data = growth.Dex.species.getLearnsetData(species.id)?.learnset || {};
    for (const [move, sources] of Object.entries(data)) {
      for (const source of sources) {
        const match = /^3L(\d+)$/.exec(source);
        if (!match) continue;
        const level = Number(match[1]);
        if (level <= mon.等级 && growth.canLearnLevelMove(mon.图鉴编号, move)) byMove.set(move, Math.min(byMove.get(move) ?? 101, level));
      }
    }
  }
  return [...byMove].filter(([move]) => !mon.招式?.some(known => known.id === move))
    .map(([id, level]) => ({ id, name: moveName(id), level, queued: (mon.待学招式 || []).includes(id) }))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'zh-CN'));
}

function machineView(world) {
  const bag = world.背包?.物品 || {};
  return machines.filter(machine => (bag[machine.id] || 0) > 0)
    .map(machine => ({
      id: machine.id, name: machine.name, nameZh: `${machine.kind === 'hm' ? 'HM' : 'TM'}${String(machine.number).padStart(2, '0')} ${moveName(machine.move)}`, kind: machine.kind, moveId: machine.move,
      moveName: moveName(machine.move), count: bag[machine.id], consumable: machine.consumable,
      learners: world.队伍.filter(mon => machine.learners.includes(mon.图鉴编号)).map(mon => ({ uid: mon.uid, name: mon.昵称, knowsMove: mon.招式.some(move => move.id === machine.move) })),
    }))
    .filter(machine => machine.learners.length > 0);
}

function bondHistoryView(world, unlocked) {
  if (!unlocked) return null;
  const members = new Map([...(world.队伍 || []), ...(world.电脑 || [])].map(mon => [mon.uid, mon]));
  const entries = Object.entries(world.羁绊?.伙伴 || {}).map(([uid, record]) => ({
    uid,
    name: members.get(uid)?.昵称 || `伙伴 ${uid}`,
    speciesId: members.get(uid)?.图鉴编号 ?? null,
    trust: Number.isInteger(record?.信赖) ? record.信赖 : 0,
    mood: typeof record?.心情 === 'string' ? record.心情 : '平静',
    memories: (Array.isArray(record?.共同记忆) ? record.共同记忆 : []).slice(-12).reverse().map(memory => ({
      storyTurn: Number.isSafeInteger(memory?.故事轮次) ? memory.故事轮次 : null,
      text: typeof memory?.事件 === 'string' ? memory.事件 : '',
    })).filter(memory => memory.text),
  })).filter(entry => entry.trust > 0 || entry.memories.length > 0)
    .sort((a, b) => b.trust - a.trust || a.name.localeCompare(b.name, 'zh-CN'));
  return { unlocked: true, entries };
}

function leagueHistoryView(world, unlocked) {
  if (!unlocked) return null;
  const campaign = world.剧情?.关都主线 || {}, tournament = campaign.tournament || {};
  const history = (Array.isArray(tournament.history) ? tournament.history : []).slice(-20).reverse().map(entry => ({
    attempt: Number.isSafeInteger(entry?.attempt) ? entry.attempt : null,
    result: entry?.result === 'champion' ? 'champion' : entry?.result === 'eliminated' ? 'eliminated' : null,
    roundsWon: Number.isSafeInteger(entry?.roundsWon) ? Math.max(0, Math.min(6, entry.roundsWon)) : null,
  })).filter(entry => entry.attempt !== null && entry.result);
  const battle = world.战斗 || {};
  const lastSettlement = battle.状态 === 'finished' && ['win', 'lose', 'draw', 'caught', 'escaped', 'avoided'].includes(battle.结果)
    ? { round: Number.isSafeInteger(battle.轮次) ? battle.轮次 : null, result: battle.结果, summary: typeof battle.摘要 === 'string' ? battle.摘要 : '' }
    : null;
  return {
    unlocked: true,
    leagueProgress: Number.isInteger(world.剧情?.联盟进度) ? Math.max(0, Math.min(5, world.剧情.联盟进度)) : 0,
    tournamentAttempts: Number.isSafeInteger(tournament.attempts) ? Math.max(0, tournament.attempts) : 0,
    champion: tournament.champion === true || tournament.status === 'champion',
    tournamentHistory: history,
    lastSettlement,
  };
}

function campStatus(world, storyTurn, unlocked) {
  const node = nodeById.get(world.地图?.节点), wild = !!node && node.kind !== 'town' && node.encounters?.length > 0;
  const activeBattle = world.战斗?.状态 !== 'finished';
  const usedThisTurn = Number.isSafeInteger(storyTurn) && (world.机制奖励.操作记录.营地轮次 === storyTurn || world.羁绊?.上次露营故事轮次 === storyTurn);
  let reason = '';
  if (!unlocked) reason = '尚未解锁野外营地工具。';
  else if (activeBattle) reason = '战斗结束后才能使用营地。';
  else if (!wild) reason = '请在有野生生态的野外地点使用营地。';
  else if (usedThisTurn) reason = '本故事轮次已经使用过营地。';
  const needed = world.队伍.some(mon => mon.当前HP > 0 && (mon.当前HP < mon.能力值.hp || mon.招式.some(move => move.PP < move.PP上限) || world.机制奖励.已解锁.includes('campKitPlus') && mon.状态));
  if (!reason && !needed) reason = '同行伙伴目前不需要休整。';
  const plus = world.机制奖励.已解锁.includes('campKitPlus');
  return {
    enabled: !reason, plus, usedThisTurn, location: node?.name || '', reason,
    description: plus
      ? '每故事轮次一次：恢复所有存活伙伴的全部HP、招式PP和主要异常状态；不会复活倒下伙伴。'
      : '每故事轮次一次：每只存活伙伴恢复最多一半最大HP、每招恢复5点PP；不复活也不治疗异常状态。',
  };
}

function view(inputWorld, {storyTurn = inputWorld?.地图?.轮次, type} = {}) {
  const world = ensureWorld(clone(inputWorld));
  const modifiers = questGadgets.modifiers(world), unlocked = new Set(world.机制奖励.已解锁);
  const local = nodeById.get(world.地图?.节点), availableSpecies = [...new Set(wildEncounters.habitat(world)?.species || [])]
    .map(id => speciesById.get(id)).filter(Boolean)
    .map(species => ({ id: species.id, name: species.name, types: [...species.types] }))
    .filter(species => !type || !modifiers.fieldRadar.typeFilter || species.types.includes(type));
  const terminalUnlocked = modifiers.trainingTerminal.unlocked;
  const recallUnlocked = terminalUnlocked && (modifiers.trainingTerminal.archive || modifiers.trainingTerminal.memoryRecall);
  const terminalMoves = terminalUnlocked ? world.队伍.map(mon => ({
    uid: mon.uid, speciesId: mon.图鉴编号, name: mon.昵称, level: mon.等级,
    canRecall: recallUnlocked, moves: currentLevelMoves(mon),
  })) : [];
  const camp = campStatus(world, storyTurn, modifiers.campKit.unlocked);
  const ecology = {
    location: local?.id || null, locationName: local?.name || '',
    unlocked: modifiers.fieldRadar.unlocked, typeFilter: modifiers.fieldRadar.typeFilter,
    filterType: modifiers.fieldRadar.typeFilter ? (typeof type === 'string' ? type : null) : null,
    species: modifiers.fieldRadar.unlocked ? availableSpecies : [],
  };
  const actions = [];
  if (camp.enabled) actions.push({ id: 'gadget-camp-rest', label: camp.plus ? '营地充分休整' : '营地基础休整', enabled: true, payload: {} });
  if (recallUnlocked) for (const mon of terminalMoves) for (const move of mon.moves) actions.push({ id: 'gadget-recall', label: `回忆${move.name}（${mon.name}）`, enabled: true, payload: { uid: mon.uid, move: move.id } });
  if (terminalUnlocked) for (const machine of machineView(world)) for (const learner of machine.learners.filter(item => !item.knowsMove)) actions.push({ id: 'gadget-machine', label: `研修${machine.moveName}（${learner.name}）`, enabled: true, payload: { uid: learner.uid, item: machine.id } });
  return {
    unlocked: [...unlocked], gadgets: questGadgets.view(world).gadgets,
    bondHistory: bondHistoryView(world, modifiers.bondLens),
    leagueHistory: leagueHistoryView(world, modifiers.leagueNotes),
    terminal: { unlocked: terminalUnlocked, recallUnlocked, freeCompatibleTM: modifiers.trainingTerminal.freeCompatibleTM, levelMoves: terminalMoves, machines: terminalUnlocked ? machineView(world) : [], description: '只列FRLG合法的本等级前升级招式与背包中已持有、兼容的TM；机器无耗许可只对终端研修生效。' },
    camp, ecology: { ...ecology, description: modifiers.fieldRadar.unlocked ? '只显示当前位置地图资料标记的野生宝可梦与属性；属性筛选需解锁雷达升级。' : '尚未解锁生态雷达。' }, actions,
  };
}

function assertStoryTurn(storyTurn) {
  if (!Number.isSafeInteger(storyTurn) || storyTurn < 1) throw new Error('需要有效的故事轮次。');
}
function assertTerminal(world) {
  const unlocked = new Set(world.机制奖励.已解锁);
  if (!unlocked.has('trainingTerminal')) throw new Error('尚未解锁招式研修终端。');
  return unlocked;
}
function fullVariables(world) { return { stat_data: { 宝可梦: world } }; }
function validateResult(world) {
  const mvu = require('./mvu.cjs');
  mvu.validateMvu(fullVariables(world));
}

function apply(inputWorld, action, payload = {}, {storyTurn} = {}) {
  assertStoryTurn(storyTurn);
  const world = ensureWorld(clone(inputWorld));
  if (world.战斗?.状态 !== 'finished') throw new Error('战斗中或战斗尚未结算时不能使用永久机制工具。');
  if (action === 'gadget-camp-rest') {
    const state = questGadgets.modifiers(world), camp = campStatus(world, storyTurn, state.campKit.unlocked);
    if (!camp.enabled) throw new Error(camp.reason);
    const rested=require('./companionship.cjs').apply(world,'camp',{mode:'rest',source:'gadget',storyTurn});
    npcQuests.recordEvent(rested, 'camp', 'camp-kit', storyTurn);
    npcQuests.refresh(rested, { storyTurn });
    validateResult(rested);
    return rested;
  }

  if (action === 'gadget-recall') {
    const unlocked = assertTerminal(world);
    if (!unlocked.has('terminalArchive') && !unlocked.has('moveMemory')) throw new Error('需要招式研修档案或招式记忆检索能力。');
    if (world.机制奖励.操作记录.回忆轮次 === storyTurn) throw new Error('本故事轮次已经使用过一次招式回忆。');
    const mon = world.队伍.find(entry => entry.uid === payload.uid);
    if (!mon || typeof payload.move !== 'string' || !growth.canLearnLevelMove(mon.图鉴编号, payload.move)) throw new Error('该伙伴不能通过FRLG升级招式表学习这个招式。');
    const legalLevel = currentLevelMoves(mon).find(move => move.id === payload.move);
    if (!legalLevel) throw new Error('该招式不是这只伙伴当前等级可回忆的升级招式，或已经学会。');
    let slot = payload.slot;
    if (mon.招式.length < 4 && (slot === undefined || slot === null || slot === 0)) slot = mon.招式.length + 1;
    if (!Number.isInteger(slot) || slot < 1 || slot > 4 || slot > mon.招式.length + 1) throw new Error(mon.招式.length >= 4 ? '招式已满，请指定1至4号招式位置。' : '请选择追加位置或已有招式位置。');
    const existing = mon.招式[slot - 1];
    if (existing && (existing.秘传 || growth.isHmMove(existing.id))) throw new Error('秘传招式不能被回忆招式覆盖。');
    if (mon.招式.some(move => move.id === payload.move)) throw new Error('已经掌握这个招式。');
    const move = { id: payload.move, PP: catalog.moves[payload.move].pp, PP上限: catalog.moves[payload.move].pp };
    if (slot === mon.招式.length + 1) mon.招式.push(move); else mon.招式[slot - 1] = move;
    mon.待学招式 = (mon.待学招式 || []).filter(id => id !== payload.move);
    world.机制奖励.操作记录.回忆轮次 = storyTurn;
    validateResult(world);
    return world;
  }

  if (action === 'gadget-machine') {
    const unlocked = assertTerminal(world), machine = machineById.get(payload.item);
    if (!machine) throw new Error('研修终端只支持FRLG兼容TM。');
    if (payload.slot !== undefined && payload.slot !== null && (!Number.isInteger(payload.slot) || payload.slot < 1 || payload.slot > 4)) throw new Error('TM研修招式位置须为1至4号，未满四招时可省略以追加。');
    const mon = world.队伍.find(entry => entry.uid === payload.uid);
    if (!mon || !machine.learners.includes(mon.图鉴编号)) throw new Error('该宝可梦与所选TM不兼容。');
    const beforeCount = world.背包?.物品?.[machine.id] || 0;
    if (beforeCount < 1) throw new Error(`${machine.name}不在背包中。`);
    const mvu = require('./mvu.cjs');
    const vars = mvu.useItem(fullVariables(world), machine.id, mon.uid, { slot: payload.slot });
    const result = vars.stat_data.宝可梦;
    if (unlocked.has('researchTerminalFreeTM') && machine.consumable) result.背包.物品[machine.id] = beforeCount;
    validateResult(result);
    return result;
  }

  throw new Error('未知永久机制工具动作。');
}

module.exports = { view, apply, currentLevelMoves };
