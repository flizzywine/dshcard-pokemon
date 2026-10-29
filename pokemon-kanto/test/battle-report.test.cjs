'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createBattleReport, formatBattleReport} = require('../battle-report.cjs');

function mon(uid, id, name, exp, level, hp, ev, pp, extra = {}) {
  return {uid, '图鉴编号': id, '昵称': name, '经验': exp, '等级': level, '当前HP': hp, '状态': '',
    '努力值': {hp: 0, atk: ev, def: 0, spa: 0, spd: 0, spe: 0},
    '招式': [{id: 'tackle', PP: pp, 'PP上限': 35}], ...extra};
}

function world({money = 3000, badges = [], party = [], pc = [], bag = {}, reward} = {}) {
  return {stat_data: {'宝可梦': {训练家: {金钱: money, 徽章: badges}, 队伍: party, 电脑: pc,
    背包: {物品: bag}, 战斗: {结果: 'win', ...(reward ? {奖励: reward} : {})}}}};
}

test('战报显示实发毛奖励和独立资源变化，并只拼接已选的真实战斗片段', () => {
  const before = world({party: [mon('starter-1', 4, '小火龙', 100, 5, 19, 0, 35)], bag: {potion: 3}});
  const after = world({money: 3500, badges: ['岩石徽章'],
    party: [mon('starter-1', 4, '小火龙', 280, 6, 13, 1, 34, {状态: 'brn'})], bag: {potion: 2},
    reward: {经验: [{uid: 'starter-1', 昵称: '小火龙', 获得: 180, 升级: [6]}], 金币: 500,
      物品: [{id: 'potion', 名称: '伤药', 数量: 1}], 徽章: ['岩石徽章']}});
  const record = {id: 'battle-abc', battle: {turn: 4, ended: true, winner: '训练家',
    p1: {name: '训练家'}, p2: {name: '小刚'}, log: [
      '|move|p1a: Charmander|Ember|p2a: Geodude', '|-crit|p1a: Charmander',
      '|-supereffective|p2a: Geodude', '|-status|p2a: Geodude|brn', '|faint|p2a: Geodude', '|win|训练家']}};
  const report = createBattleReport(before, after, record);
  assert.equal(report.battleId, 'battle-abc');
  assert.equal(report.result, 'win');
  assert.equal(report.headline, '战胜小刚');
  assert.ok(report.facts.includes('实际战斗回合：4。'));
  assert.ok(report.facts.includes('经验奖励：小火龙 +180；升至6级。'));
  assert.ok(report.facts.includes('金币奖励：500。'));
  assert.ok(report.facts.includes('道具奖励：伤药 ×1。'));
  assert.ok(report.facts.includes('消耗道具：伤药 ×1。'));
  assert.ok(report.facts.includes('新获徽章：岩石徽章。'));
  assert.ok(report.facts.some(text => text.includes('攻击 +1')));
  assert.ok(report.facts.some(text => text.includes('HP变化：-6')));
  assert.ok(report.facts.some(text => text.includes('PP变化：-1')));
  assert.ok(report.highlights.some(item => item.text.includes('撞击') === false && item.text.includes('火花')));
  const selected = report.highlights.find(item => item.text.includes('效果绝佳'));
  assert.ok(selected);
  const formatted = formatBattleReport(report, [selected.id, 'invented-id']);
  assert.ok(formatted.includes(selected.text));
  assert.ok(!formatted.includes('invented-id'));
  assert.ok(!formatted.includes('战斗片段：\n' + report.highlights[0].text));
});

test('没有战前基线时只展示实际结果、奖励和当前队伍，不伪造资源差值', () => {
  const after = world({party: [mon('starter-1', 1, '妙蛙种子', 100, 5, 20, 0, 35)],
    pc: [mon('caught-b1', 25, '皮卡丘', 0, 3, 12, 0, 35, {收服来源: 'wild'})],
    reward: {经验: [], 金币: 0, 物品: [], 徽章: []}});
  const report = createBattleReport(null, after, {id: 'b1', caught: {id: 25, name: '皮卡丘'},
    battle: {turn: 2, ended: true, winner: '训练家', p1: {name: '训练家'}, p2: {name: '野生宝可梦'}, log: []}});
  assert.equal(report.result, 'caught');
  assert.ok(report.facts.includes('金币奖励：0。'));
  assert.ok(report.facts.includes('道具奖励：无。'));
  assert.ok(report.facts.includes('本次收服：皮卡丘，加入电脑。'));
  assert.ok(report.facts.some(text => text.startsWith('当前队伍：妙蛙种子 Lv.5')));
  assert.ok(!report.facts.some(text => text.includes('金钱变化') || text.includes('HP变化') || text.includes('PP变化')));
});

test('new reward schema treats 升级 as a delta and reports the matching Pokémon target level', () => {
  const before = world({party: [mon('starter-1', 4, '小火龙', 100, 5, 19, 0, 35)]});
  const after = world({party: [mon('starter-1', 4, '小火龙', 280, 6, 19, 0, 35)],
    reward: {经验: [{uid: 'starter-1', 昵称: '小火龙', 获得: 180, 升级: 1}], 金币: 0, 物品: [], 徽章: []}});
  const report = createBattleReport(before, after, {id: 'delta-level', battle: {turn: 1, ended: true, winner: '训练家', p1: {name: '训练家'}, p2: {name: '野生宝可梦'}, log: []}});
  assert.ok(report.facts.includes('经验奖励：小火龙 +180；升至6级。'));
  assert.ok(!report.facts.some(fact => fact.includes('升至1级')), 'integer 升级 is a count, never a target level');
  assert.ok(report.facts.includes('小火龙升至6级。'));
});

test('legacy array reward schema continues to report its final target level', () => {
  const after = world({party: [mon('starter-1', 4, '小火龙', 280, 6, 19, 0, 35)],
    reward: {经验: [{uid: 'starter-1', 昵称: '小火龙', 获得: 180, 升级: [5, 6]}], 金币: 0, 物品: [], 徽章: []}});
  const report = createBattleReport(null, after, {id: 'legacy-level', battle: {turn: 1, ended: true, winner: '训练家', p1: {name: '训练家'}, p2: {name: '野生宝可梦'}, log: []}});
  assert.ok(report.facts.includes('经验奖励：小火龙 +180；升至6级。'));
});
