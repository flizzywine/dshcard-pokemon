'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const map = require('../public/data/map.json');
const trainers = require('../public/data/trainers.json');
const scenes = require('../scenes.cjs');
const { createInitialMvu, makeMon, theaterAction, theaterView } = require('../mvu.cjs');

const root = variables => variables.stat_data.宝可梦;
function settledTown(id) {
  const variables = createInitialMvu(1), world = root(variables), node = map.find(item => item.id === id);
  world.地图.节点 = node.id;
  world.地图.地点 = node.name;
  world.地图.轮次 = 2;
  world.战斗.轮次 = 2;
  world.战斗.状态 = 'finished';
  world.遭遇 = null;
  world.剧情.初始御三家已选 = true;
  return variables;
}

test('all eleven Kanto towns have distinct 2–3 line dialogue tied to bundled NPC portraits', () => {
  const towns = map.filter(node => node.kind === 'town');
  assert.equal(towns.length, 11);
  assert.deepEqual(Object.keys(scenes.townDialogues).sort(), towns.map(node => node.id).sort());
  for (const node of towns) {
    const entry = scenes.townDialogues[node.id];
    assert.ok(entry.lines.length >= 2 && entry.lines.length <= 3, `${node.id} dialogue count`);
    assert.ok(trainers.some(trainer => trainer.id === entry.person), `${node.id} portrait exists`);
    assert.ok(entry.lines.every(line => typeof line === 'string' && line.length > 10));
  }
});

test('talk stores the town portrait, location-scoped counter and line without changing game resources', () => {
  const variables = settledTown('pewter'), before = structuredClone(root(variables));
  const talked = theaterAction(variables, 'talk'), after = root(talked), scene = after.剧情.剧场;
  assert.equal(scene.地点, 'pewter');
  assert.equal(scene.角色, 'hiker');
  assert.match(scene.对白, /尼比市|岩石道馆|月见山|常青森林/);
  assert.equal(scene.交谈次数, 1);
  assert.equal(scene.城镇交谈次数.pewter, 1);
  assert.equal(theaterView(talked).theater.person.id, 'hiker');
  assert.equal(theaterView(talked).theater.dialogue, scene.对白);
  assert.deepEqual(after.队伍, before.队伍);
  assert.deepEqual(after.背包, before.背包);
  assert.equal(after.训练家.金钱, before.训练家.金钱);

  const again = theaterAction(talked, 'talk'), againScene = root(again).剧情.剧场;
  assert.equal(againScene.城镇交谈次数.pewter, 2);
  assert.notEqual(againScene.对白, scene.对白);
});

test('the current saved town scene takes precedence over an old finished encounter portrait', () => {
  const variables = settledTown('viridian'), world = root(variables);
  world.遭遇 = { 类型: 'trainer', 训练家: '小茂', 队伍: [makeMon(4, 5, 'old-rival')] };
  world.剧情.剧场 = { 地点: 'viridian', 轮次: 2, 角色: 'gentleman', 对白: '绅士：22号道路通往石英高原。' };
  assert.equal(theaterView(variables).theater.person.id, 'gentleman');
  assert.equal(theaterView(variables).theater.dialogue, world.剧情.剧场.对白);
});

test('healing presents Nurse Joy and a short recovery line; forest trainers use the actual map node ID', () => {
  const variables = settledTown('cerulean');
  root(variables).队伍[0].当前HP = 1;
  const healed = theaterAction(variables, 'heal');
  assert.equal(root(healed).队伍[0].当前HP, root(healed).队伍[0].能力值.hp);
  assert.equal(theaterView(healed).theater.person.id, 'nurse_joy');
  assert.match(theaterView(healed).theater.dialogue, /恢复健康/);

  const forest = settledTown('viridian-forest');
  const challenged = theaterAction(forest, 'trainer-battle');
  assert.equal(root(challenged).遭遇.训练家, '捕虫少年');
});
