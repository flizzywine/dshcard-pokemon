'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const director = require('../story-director.cjs');

const card = JSON.parse(fs.readFileSync(path.join(__dirname, '../../card-source/card.json'), 'utf8'));

test('narrative director forbids activity menus, invented buttons and numeric state patches', () => {
  const prompt = director.prompt({ 地图: { 节点: 'pallet' }, 剧情: {} }, null, '我想和伙伴聊聊', 2);
  assert.match(prompt, /玩家的自然语言选择和行动由插件解析、校验并更新 MVU/);
  assert.match(prompt, /不输出或提交宝可梦数值补丁、JSON 或 operations/);
  assert.match(prompt, /不生成 <活动选择\.\.\./);
  assert.match(prompt, /活动选择列表、活动菜单或自创剧情按钮/);
  assert.match(prompt, /唯一可输出的剧情操作标记是【进入本轮战斗】/);
  assert.match(prompt, /日常轮次可以没有战斗/);
  assert.match(prompt, /不要生成战果摘要或要求玩家再次提交战果/);
});

test('card prompts delegate natural language actions to the plugin and keep only the battle marker', () => {
  const data = card.data;
  const mvu = data.character_book.entries.find(entry => entry.comment === '[mvu_update]状态更新规则');
  const roleplay = data.character_book.entries.find(entry => entry.comment === '关都角色扮演与原生剧场');
  assert.ok(data.system_prompt.includes('玩家用自然语言表达的选择与行动由插件解析、校验并更新 MVU'));
  assert.ok(data.system_prompt.includes('不得输出 <活动选择...>、活动选择列表、活动菜单或自行编造的剧情按钮'));
  assert.ok(data.system_prompt.includes('【进入本轮战斗】'));
  assert.ok(!data.system_prompt.includes('战后摘要写入原生输入框'));
  assert.ok(mvu.content.includes('模型读取当前快照和正文事实，只负责叙述'));
  assert.ok(mvu.content.includes('不得调用 mvu_submit_update'));
  assert.ok(roleplay.content.includes('只有合法待操作战斗时可写【进入本轮战斗】'));
  assert.ok(!roleplay.content.includes('【查看训练家状态】'));
});

test('card initvar remains valid with the original party and opening encounter', () => {
  const firstMes = card.data.first_mes;
  const initvar = firstMes.match(/<initvar>([\s\S]*?)<\/initvar>/);
  assert.ok(initvar, 'first message contains the initvar block');
  const initial = JSON.parse(initvar[1]);
  assert.equal(initial['宝可梦'].队伍[0].uid, 'starter');
  assert.equal(initial['宝可梦'].队伍[0].图鉴编号, 1);
  assert.equal(initial['宝可梦'].遭遇.训练家, '小茂');
  assert.equal(initial['宝可梦'].战斗.状态, 'pending');
});

test('narrative rhythm changes across turns yet repeats deterministically for the same turn and input',()=>{
 const world={地图:{节点:'pallet'},剧情:{}};
 const prompts=Array.from({length:30},(_,index)=>director.prompt(world,null,'我继续旅程。',index+1));
 assert.ok(new Set(prompts).size>=6,'the director has a varied choice of narrative beats');
 assert.equal(director.prompt(world,null,'我继续旅程。',4),director.prompt(world,null,'我继续旅程。',4),'retry does not reshuffle the same turn');
});

test('the director does not present an unchosen starter as a current companion',()=>{
 const world=require('../mvu.cjs').createInitialMvu().stat_data.宝可梦;
 assert.equal(world.剧情.初始御三家已选,false);
 const match=director.prompt(world,null,'我还在考虑。',1).match(/【旅程连续性】([^\n]+)/u);
 assert.deepEqual(JSON.parse(match[1]).伙伴,[]);
});

test('narrative preview never normalizes or modifies the supplied saved state',()=>{
 const world=require('../mvu.cjs').createInitialMvu().stat_data.宝可梦;
 world.剧情.关都事件.记录.push({id:'legacy-unknown',故事轮次:1});
 world.剧情.关都事件.进度['old-event']={阶段:'obsolete'};
 const before=structuredClone(world);
 director.prompt(world,null,'看看周围。',2);
 assert.deepEqual(world,before);
});
