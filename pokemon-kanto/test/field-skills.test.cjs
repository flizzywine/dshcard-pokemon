'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../field-skills.cjs');

function world(node = 'fuchsia', extra = {}) {
  return {
    地图: {节点: node}, 训练家: {徽章: []},
    队伍: [], 背包: {关键物品: [], 物品: {hm03: 1}},
    委托: {探访地点: [node], 探访次数: {[node]: 1}},
    剧情: {关都事件: {标记: {}}},
    ...extra,
  };
}
function mon(uid, move) { return {uid, 昵称: uid, 招式: [{id: move}]}; }

test('HM use requires the move on a current party member and the original badge tier', () => {
  const w = world('fuchsia', {训练家: {徽章: ['粉红徽章']}, 背包: {关键物品: [], 物品: {hm03: 1}}});
  assert.equal(rules.validateTravel(w, 'route19').allowed, false, 'a Surf HM item in the bag does not count as a user');
  w.队伍.push(mon('lapras', 'surf'));
  assert.equal(rules.validateTravel(w, 'route19').allowed, true);
  assert.equal(rules.validateTravel(w, 'route19').requires.badge, '粉红徽章');
  w.训练家.徽章 = ['岩石徽章'];
  const blocked = rules.validateTravel(w, 'route19');
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /粉红徽章/);
});

test('water corridor needs Surf for first entry but allows recorded legacy return edges and an island exit', () => {
  let w = world('fuchsia');
  assert.equal(rules.validateTravel(w, 'route19').allowed, false);
  w = world('route19', {训练家: {徽章: []}, 委托: {探访地点: ['fuchsia', 'route19'], 探访次数: {fuchsia: 1, 'route19': 1}}});
  assert.equal(rules.validateTravel(w, 'fuchsia').allowed, true);
  assert.equal(rules.validateTravel(w, 'route20').allowed, false);
  w = world('cinnabar');
  assert.equal(rules.validateTravel(w, 'route20').allowed, true, 'a legacy save at Cinnabar must retain a landward route out');
  w = world('cinnabar', {委托: {探访地点: ['cinnabar', 'fuchsia'], 探访次数: {cinnabar: 1, fuchsia: 1}}});
  assert.equal(rules.validateTravel(w, 'route20').legacyReturn, true, 'follow an existing map path toward a previously visited mainland town');
  w.地图.节点 = 'route20';
  assert.equal(rules.validateTravel(w, 'route19').legacyReturn, true);
});

test('cycling road entry needs the Bicycle, while existing riders can traverse and leave', () => {
  const noBike = world('celadon');
  assert.equal(rules.validateTravel(noBike, 'route16').allowed, false);
  assert.deepEqual(rules.validateTravel(noBike, 'route16').requires, {keyItem: 'bicycle'});
  noBike.剧情.关都事件.标记.bicycle = true;
  assert.equal(rules.validateTravel(noBike, 'route16').allowed, true);
  const legacy = world('route17');
  assert.equal(rules.validateTravel(legacy, 'route16').allowed, true);
  assert.equal(rules.validateTravel(legacy, 'route18').allowed, true);
});

test('Fly is separate from adjacent travel and only targets visited towns with the right move and badge', () => {
  const w = world('celadon', {训练家: {徽章: ['橙色徽章']}, 队伍: [mon('pidgeot', 'fly')], 委托: {探访地点: ['celadon', 'pewter'], 探访次数: {celadon: 1, pewter: 2}}});
  assert.equal(rules.validateFly(w, 'pewter').allowed, true);
  assert.equal(rules.validateFly(w, 'cerulean').allowed, false);
  assert.equal(rules.validateTravel(w, 'pewter').method, '');
  assert.equal(rules.validateTravel(w, 'route16').allowed, false, 'Fly cannot bypass adjacency or the Bicycle gate');
  assert.equal(rules.validateFly(w, 'route1').allowed, false);
  const noFlyer = world('celadon', {训练家: {徽章: ['橙色徽章']}, 委托: {探访地点: ['celadon', 'pewter'], 探访次数: {celadon: 1, pewter: 2}}});
  assert.equal(rules.validateFly(noFlyer, 'pewter').allowed, false);
});

test('field action list exposes optional Flash and does not gate dark cave travel', () => {
  const w = world('rock-tunnel', {训练家: {徽章: ['岩石徽章']}, 队伍: [mon('clefairy', 'flash')]});
  const flash = rules.fieldActions(w).find(action => action.id === 'flash');
  assert.equal(flash.enabled, true);
  assert.equal(flash.optional, true);
  assert.equal(flash.lighting, true);
  assert.equal(rules.validateTravel(w, 'route9').allowed, true);
  const noFlash = world('rock-tunnel');
  assert.equal(rules.validateTravel(noFlash, 'route9').allowed, true);
});

test('travelInfo keeps stable identifiers and describes the destination gate', () => {
  const result = rules.travelInfo(world('celadon'), 'route16');
  assert.deepEqual(result.from, {id: 'celadon', name: '玉虹市'});
  assert.deepEqual(result.to, {id: 'route16', name: '16号道路'});
  assert.equal(result.allowed, false);
  assert.equal(result.method, 'bike');
});
