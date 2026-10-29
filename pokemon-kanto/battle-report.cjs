'use strict';

const {catalog} = require('./engine.cjs');

const STAT_NAMES = Object.freeze({hp: 'HP', atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度'});
const STATUS_NAMES = Object.freeze({brn: '烧伤', psn: '中毒', tox: '剧毒', par: '麻痹', slp: '睡眠', frz: '冰冻'});
const speciesById = new Map(catalog.species.map(item => [item.id, item]));
const speciesByName = new Map(catalog.species.flatMap(item => [[norm(item.english), item], [norm(item.key), item], [norm(item.name), item]]));
const moveByName = new Map(Object.values(catalog.moves).flatMap(item => [[norm(item.english), item], [norm(item.name), item], [norm(item.id), item]]));
const itemById = new Map(catalog.items.map(item => [item.id, item]));
function norm(value) { return String(value || '').toLocaleLowerCase().replace(/[^a-z0-9\u3400-\u9fff]/g, ''); }
function plain(value, max = 80) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f|<>]/g, '').trim().slice(0, max) : ''; }
function numeric(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null; }
function worldOf(value) { return value?.stat_data?.['宝可梦'] || value?.['宝可梦'] || value || null; }
function monName(mon) { return plain(mon?.昵称, 60) || speciesById.get(Number(mon?.图鉴编号))?.name || '宝可梦'; }
function speciesName(id, fallback = '') { return speciesById.get(Number(id))?.name || plain(fallback, 60) || '宝可梦'; }
function signed(value) { return `${value >= 0 ? '+' : ''}${value}`; }
function collection(world) { return [...(Array.isArray(world?.队伍) ? world.队伍 : []), ...(Array.isArray(world?.电脑) ? world.电脑 : [])]; }
function byUid(world) { return new Map(collection(world).filter(mon => typeof mon?.uid === 'string' && mon.uid).map(mon => [mon.uid, mon])); }
function itemName(id, fallback) { return itemById.get(String(id))?.name || plain(fallback, 50) || String(id || '物品'); }
function battleOf(record) { return record?.battle || record?.simulator || null; }

function resultOf(record, battle, after) {
  if (record?.caught) return 'caught';
  if (record?.escaped) return 'escaped';
  if (battle?.winner && battle?.p1?.name && battle.winner === battle.p1.name) return 'win';
  if (battle?.winner) return 'lose';
  const result = worldOf(after)?.战斗?.结果;
  return ['win', 'lose', 'draw', 'caught', 'escaped'].includes(result) ? result : battle?.ended ? 'draw' : 'unfinished';
}

function resultHeadline(result, battle, record) {
  const opponent = plain(battle?.p2?.name, 50) || '对手';
  if (result === 'caught') return `收服成功：${speciesName(record?.caught?.id, record?.caught?.name)}`;
  if (result === 'escaped') return '成功逃离野生对战';
  if (result === 'win') return `战胜${opponent}`;
  if (result === 'lose') return `不敌${opponent}`;
  if (result === 'draw') return '本场战斗以平局结束';
  return '本场战斗尚未结束';
}

function visibleLog(log) {
  const result = [];
  for (let i = 0; i < log.length; i++) {
    const line = String(log[i] || '');
    if (line.startsWith('|split|')) {
      if (log[i + 1]) result.push({index: i + 1, line: String(log[i + 1])});
      i += 2;
    } else if (line && line !== '|' && !line.startsWith('|t:|') && !line.startsWith('|debug|')) result.push({index: i, line});
  }
  return result;
}

function showActor(value) {
  const raw = plain(String(value || '').replace(/^p[12][a-z]?:\s*/i, ''), 60);
  return speciesByName.get(norm(raw))?.name || raw || '宝可梦';
}

function highlightText(line) {
  const fields = line.split('|');
  const type = fields[1];
  const actor = showActor(fields[2]);
  if (type === 'move') {
    const move = moveByName.get(norm(fields[3]));
    return `${actor}使出了${move?.name || plain(fields[3], 50) || '招式'}。`;
  }
  if (type === '-supereffective') return `攻向${actor}的招式效果绝佳。`;
  if (type === '-resisted') return `攻向${actor}的招式效果不佳。`;
  if (type === '-immune') return `${actor}没有受到影响。`;
  if (type === '-crit') return `击中${actor}的要害。`;
  if (type === '-status') return `${actor}陷入${STATUS_NAMES[fields[3]] || '异常'}状态。`;
  if (type === '-curestatus') return `${actor}解除了${STATUS_NAMES[fields[3]] || '异常状态'}。`;
  if (type === 'faint') return `${actor}失去战斗能力。`;
  if (type === 'capture') {
    const shakes = Number(fields[3]);
    return Number.isInteger(shakes) ? `精灵球摇晃了${shakes}次。` : `对${actor}使用了精灵球。`;
  }
  if (type === '-heal') return `${actor}恢复了HP。`;
  if (type === '-fail') return `${actor}的行动没有成功。`;
  if (type === 'win') return `${showActor(fields[2])}赢得了本场战斗。`;
  if (type === 'tie') return '本场战斗以平局结束。';
  return '';
}

function makeHighlights(record) {
  const battle = battleOf(record), log = Array.isArray(battle?.log) ? battle.log : [];
  const highlights = [];
  for (const entry of visibleLog(log)) {
    const text = highlightText(entry.line);
    if (!text) continue;
    highlights.push({id: `event-${entry.index}`, text});
    if (highlights.length >= 12) break;
  }
  return highlights;
}

function addRewardFacts(facts, after, before, record) {
  const world = worldOf(after), reward = world?.战斗?.奖励;
  if (reward && typeof reward === 'object') {
    const xp = Array.isArray(reward.经验) ? reward.经验 : [];
    for (const award of xp) {
      const gained = numeric(award?.获得);
      const uid = award?.uid;
      const mon = collection(world).find(item => item.uid === uid);
      const name = plain(award?.昵称, 60) || (mon && monName(mon)) || '宝可梦';
      let levelFact = '';
      if (Array.isArray(award?.升级)) {
        const targetLevel = award.升级.map(numeric).filter(level => level !== null).at(-1);
        if (targetLevel !== undefined) levelFact = `；升至${targetLevel}级`;
      } else {
        const levelsGained = numeric(award?.升级);
        if (Number.isInteger(levelsGained) && levelsGained > 0) {
          const currentLevel = numeric(mon?.等级);
          levelFact = currentLevel !== null ? `；升至${currentLevel}级` : `；提升${levelsGained}级`;
        }
      }
      if (gained !== null && gained >= 0) facts.push(`经验奖励：${name} +${gained}${levelFact}。`);
    }
    if (numeric(reward.金币) !== null) facts.push(`金币奖励：${numeric(reward.金币)}。`);
    const items = Array.isArray(reward.物品) ? reward.物品 : [];
    if (!items.length) facts.push('道具奖励：无。');
    for (const item of items) {
      const count = numeric(item?.数量);
      if (count !== null && count >= 0) facts.push(`道具奖励：${itemName(item?.id, item?.名称)} ×${count}。`);
    }
    const badges = Array.isArray(reward.徽章) ? reward.徽章 : [];
    facts.push(badges.length ? `徽章奖励：${badges.map(value => plain(value, 40)).filter(Boolean).join('、')}。` : '徽章奖励：无。');
  } else if (before) {
    const oldWorld = worldOf(before);
    const now = numeric(world?.训练家?.金钱), old = numeric(oldWorld?.训练家?.金钱);
    if (now !== null && old !== null) facts.push(`金钱变化：${signed(now - old)}。`);
  }
}

function addProgressFacts(facts, before, after) {
  if (!before) return;
  const oldWorld = worldOf(before), newWorld = worldOf(after), oldMons = byUid(oldWorld), newMons = new Map((newWorld.队伍||[]).map(mon=>[mon.uid,mon]));
  const oldTrainer = oldWorld?.训练家 || {}, newTrainer = newWorld?.训练家 || {};
  const newMoney = numeric(newTrainer.金钱), oldMoney = numeric(oldTrainer.金钱);
  if (newMoney !== null && oldMoney !== null) facts.push(`金钱变化：${signed(newMoney - oldMoney)}。`);
  const hasExperienceAward = Array.isArray(newWorld?.战斗?.奖励?.经验);
  for (const [uid, next] of newMons) {
    const prev = oldMons.get(uid);
    if (!prev) continue;
    const name = monName(next);
    const expNow = numeric(next.经验), expBefore = numeric(prev.经验);
    const expDelta = expNow !== null && expBefore !== null ? expNow - expBefore : null;
    const levelNow = numeric(next.等级), levelBefore = numeric(prev.等级);
    const levelDelta = levelNow !== null && levelBefore !== null ? levelNow - levelBefore : null;
    if (!hasExperienceAward && expDelta !== null && expDelta !== 0) facts.push(`${name}经验变化：${signed(expDelta)}。`);
    if (levelDelta !== null && levelDelta > 0) facts.push(`${name}升至${levelNow}级。`);
    const ev = Object.keys(STAT_NAMES).filter(key => key !== 'hp').concat('hp');
    const evChanges = ev.map(key => [key, Number(next.努力值?.[key] || 0) - Number(prev.努力值?.[key] || 0)])
      .filter(([, delta]) => Number.isFinite(delta) && delta !== 0)
      .map(([key, delta]) => `${STAT_NAMES[key]} ${signed(delta)}`);
    if (evChanges.length) facts.push(`${name}努力值变化：${evChanges.join('、')}。`);
    const hpNow = numeric(next.当前HP), hpBefore = numeric(prev.当前HP);
    const hpDelta = hpNow !== null && hpBefore !== null ? hpNow - hpBefore : null;
    if (hpDelta !== null && hpDelta !== 0) facts.push(`${name}HP变化：${signed(hpDelta)}（${hpBefore}→${hpNow}）。`);
    if (next.状态 !== prev.状态) facts.push(`${name}状态变化：${plain(prev.状态, 20) || '正常'}→${plain(next.状态, 20) || '正常'}。`);
    const prevMoves = new Map((prev.招式 || []).map(move => [move.id, move]));
    for (const move of next.招式 || []) {
      const oldMove = prevMoves.get(move.id);
      if (!oldMove || Number(move.PP) === Number(oldMove.PP)) continue;
      const label = catalog.moves[move.id]?.name || move.id;
      facts.push(`${name}${label}PP变化：${signed(Number(move.PP) - Number(oldMove.PP))}（${oldMove.PP}→${move.PP}）。`);
    }
  }
  const oldBadges = new Set(Array.isArray(oldTrainer.徽章) ? oldTrainer.徽章 : []);
  const newBadges = (Array.isArray(newTrainer.徽章) ? newTrainer.徽章 : []).filter(badge => !oldBadges.has(badge));
  if (newBadges.length) facts.push(`新获徽章：${newBadges.map(value => plain(value, 40)).join('、')}。`);
  const oldBag = oldWorld?.背包?.物品 || {}, newBag = newWorld?.背包?.物品 || {};
  for (const id of new Set([...Object.keys(oldBag), ...Object.keys(newBag)])) {
    const delta = (numeric(newBag[id]) ?? 0) - (numeric(oldBag[id]) ?? 0);
    if (delta < 0) facts.push(`消耗道具：${itemName(id)} ×${-delta}。`);
    else if (delta > 0) facts.push(`道具数量变化：${itemName(id)} +${delta}。`);
  }
}

function addCaptureFacts(facts, before, after, record) {
  const oldIds = before ? new Set(collection(worldOf(before)).map(mon => mon?.uid).filter(Boolean)) : new Set();
  const current = collection(worldOf(after));
  const captured = current.filter(mon => (mon?.收服来源 === 'wild' || String(mon?.uid || '').startsWith('caught-')) && (!before || !oldIds.has(mon.uid)));
  if (record?.caught && !captured.some(mon => mon.图鉴编号 === record.caught.id)) {
    const name = speciesName(record.caught.id, record.caught.name);
    const mon = current.find(item => item?.图鉴编号 === record.caught.id && String(item.uid || '').startsWith('caught-'));
    facts.push(`本次收服：${name}${mon ? (worldOf(after)?.队伍?.includes(mon) ? '，加入队伍' : '，加入电脑') : ''}。`);
    return;
  }
  for (const mon of captured) {
    const inParty = (worldOf(after)?.队伍 || []).includes(mon);
    facts.push(`本次收服：${monName(mon)}，${inParty ? '加入队伍' : '加入电脑'}。`);
  }
}

function addCurrentPartyFact(facts, after) {
  const party = worldOf(after)?.队伍;
  if (!Array.isArray(party) || !party.length) { facts.push('当前队伍：暂无伙伴。'); return; }
  facts.push(`当前队伍：${party.map(mon => `${monName(mon)} Lv.${Number(mon.等级) || '?'}`).join('、')}。`);
}

function formatBattleReport(report, selectedIds = []) {
  if (!report || typeof report !== 'object') return '';
  const lines = [plain(report.headline, 140) || '战斗结果'];
  for (const fact of Array.isArray(report.facts) ? report.facts : []) {
    const text = plain(fact, 240);
    if (text) lines.push(text);
  }
  const selected = new Set((Array.isArray(selectedIds) ? selectedIds : []).filter(id => typeof id === 'string').slice(0, 12));
  const highlights = (Array.isArray(report.highlights) ? report.highlights : []).filter(item => selected.has(item?.id));
  if (highlights.length) {
    lines.push('战斗片段：');
    for (const item of highlights) {
      const text = plain(item.text, 180);
      if (text) lines.push(text);
    }
  }
  return lines.join('\n');
}

function createBattleReport(beforeWorld, afterWorld, record) {
  const before = beforeWorld ? worldOf(beforeWorld) : null, after = worldOf(afterWorld);
  const battle = battleOf(record), result = resultOf(record, battle, afterWorld);
  const headline = resultHeadline(result, battle, record);
  const facts = [];
  if (Number.isFinite(Number(battle?.turn))) facts.push(`实际战斗回合：${Number(battle.turn)}。`);
  addRewardFacts(facts, afterWorld, beforeWorld, record);
  addProgressFacts(facts, before, after);
  addCaptureFacts(facts, before, afterWorld, record);
  if (!before) addCurrentPartyFact(facts, afterWorld);
  const highlights = makeHighlights(record);
  const report = {battleId: String(record?.id || record?.battleId || ''), result, headline, facts, highlights, text: ''};
  report.text = formatBattleReport(report, highlights.slice(0, 4).map(item => item.id));
  return report;
}

module.exports = {createBattleReport, formatBattleReport};
