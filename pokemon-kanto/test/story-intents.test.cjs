'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const locations = require('../public/data/map.json');
const {catalog} = require('../engine.cjs');
const {parseStoryIntent} = require('../story-intents.cjs');

function worldAt(id, {status = 'finished', starter = true, badges = []} = {}) {
  const node = locations.find(location => location.id === id);
  return {
    地图: {节点: id},
    战斗: {状态: status},
    剧情: {初始御三家已选: starter},
    训练家: {徽章: badges},
  };
}
const parse = (input, world) => parseStoryIntent(input, world, {locations, catalog});

test('ordinary grass exploration phrases prepare an encounter without requiring a button phrase',()=>{
 for(const text of ['我走进草丛。','我在草丛里找宝可梦。','钻进长草转转。','去草丛看看。'])assert.equal(parse(text,worldAt('route1'))?.action,'explore',text);
 assert.equal(parse('我不去草丛。',worldAt('route1')),null);
 assert.equal(parse('听说有人在草丛找宝可梦。',worldAt('route1')),null);
 assert.equal(parse('去草丛看看。',worldAt('pallet')),null);
 assert.equal(parse('去草丛看看。',worldAt('route1',{status:'active'})),null);
});

test('explicit field action starts a requested legal wild encounter using longest canonical species match', () => {
  const forest = worldAt('viridian-forest');
  const caterpie = parse('在常青森林遇到一只绿毛虫', forest);
  assert.equal(caterpie.action, 'wild');
  assert.deepEqual(caterpie.payload, {speciesId: 10, scripted: true, start: true});
  assert.equal(caterpie.requestedSpecies, 10);

  const pika = parse('我走进草丛遇到 Pikachu，开始战斗', worldAt('viridian-forest'));
  assert.equal(pika.action, 'wild');
  assert.equal(pika.payload.speciesId, 25);
  assert.equal(parse('在常青森林遇到 #0025，开始对战', worldAt('viridian-forest')).payload.speciesId, 25);
});

test('encounter targets exclude the trainer’s own named partner', () => {
  const world = worldAt('viridian-forest');
  assert.equal(parse('我带着妙蛙种子在草丛遇到皮卡丘，开始战斗', world).payload.speciesId, 25);
  assert.equal(parse('我带着妙蛙种子在草丛遇到野生精灵，开始战斗', world).payload.speciesId, undefined);
});

test('species mentions alone do not create encounters; named ordinary species are scripted without habitat substitution', () => {
  assert.equal(parse('皮卡丘很可爱', worldAt('route2')), null);
  assert.equal(parse('我在草地看见漂亮的皮卡丘', worldAt('route2')), null, 'a scene cue without an encounter or battle verb is not an action');
  const mismatch = parse('在常青森林遇到小火龙并开始战斗', worldAt('viridian-forest'));
  assert.equal(mismatch.action, 'wild');
  assert.equal(mismatch.payload.scripted, true);
  assert.equal(mismatch.requestedSpecies, 4);
  const legendary = parse('在洞窟遇到 #150，开始战斗', worldAt('cerulean-cave'));
  assert.equal(legendary.action, null);
  assert.equal(legendary.requestedSpecies, 150);
  assert.match(legendary.reason, /传说宝可梦/);
});

test('quoted, negated, hypothetical, remembered and reported actions never trigger', () => {
  const world = worldAt('route2');
  for (const input of [
    '“前往常青市”',
    '不要去常青市',
    '如果遇到皮卡丘，就开始战斗',
    '希望以后挑战小刚',
    '听说有人在常青森林遇到了绿毛虫',
    '我刚才说过前往常青市',
  ]) assert.equal(parse(input, world), null, input);
});

test('ordinary RP quotes do not block an explicit first-person commitment',()=>{
 const world=worldAt('route1');
 assert.equal(parse('我说“去常青市吧”然后出发',world).payload.node,'viridian');
 assert.equal(parse('小刚说“去常青市吧”',world),null);
});

test('a route plus explicit species in one sentence produces ordered travel and scripted encounter actions',()=>{
 const plan=parse('我带着伙伴去常青森林遇到皮卡丘',worldAt('route1'));
 assert.equal(plan.action,'sequence');
 assert.deepEqual(plan.payload.actions,[
  {action:'travel',payload:{node:'viridian-forest'}},
  {action:'wild',payload:{speciesId:25,scripted:true,start:true},requestedSpecies:25},
 ]);
});

test('travel parses natural destinations, spelling aliases, and valid non-adjacent journeys', () => {
  const onOne = worldAt('route1');
  assert.deepEqual(parse('前往常青市', onOne), {
    action: 'travel', payload: {node: 'viridian'}, playerText: '前往常青市',
  });
  assert.equal(parse('我想抵达长青市', onOne).payload.node,'viridian');
  assert.equal(parse('我想前往长青森林', onOne).payload.node,'viridian-forest');
  assert.equal(parse('来到常青市', onOne).payload.node,'viridian');
  assert.equal(parse('前往尼比市', onOne).payload.node,'pewter','non-adjacent destinations are delegated to legal route settlement');
  const locked = parse('前往石英高原', worldAt('victory-road', {badges: ['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章','深红徽章']}));
  assert.equal(locked.action, null);
  assert.match(locked.reason, /需要更多徽章/);
});

test('reported NPC directions and negated or remembered travel are not player movement',()=>{
 const world=worldAt('route1');
 for(const input of ['小刚说去常青市','NPC说我们应该前往尼比市','不要去常青市','我回忆起抵达长青市的那天'])assert.equal(parse(input,world),null,input);
});

test('clause-local negation, past narration and present wishes keep the committed movement',()=>{
 const world=worldAt('route1');
 for(const input of [
  '不要去真新镇，去尼比市',
  '去尼比市，不要去真新镇',
  '去尼比市看看，不打道馆',
  '昨天在常青市休息，今天去尼比市',
  '我希望现在去尼比市',
 ]){
  const plan=parse(input,world);
  assert.equal(plan?.action,'travel',input);
  assert.equal(plan.payload.node,'pewter',input);
 }
 // A negated gym clause must not turn the same turn into a badge challenge.
 assert.equal(parse('去尼比市看看，不打道馆',worldAt('pewter')),null);
 assert.equal(parse('去尼比市看看，不挑战小刚',worldAt('pewter')),null);
});

test('clause-local parsing still suppresses hypotheses, past-only, quotes and negation',()=>{
 const world=worldAt('route1');
 for(const input of [
  '如果去尼比市',
  '希望以后挑战小刚',
  '昨天在常青市休息',
  '“去尼比市”',
  '不要去尼比市',
  '小刚说去尼比市',
 ]) assert.equal(parse(input,world),null,input);
});

test('natural friendly trainer invitations resolve without a battle keyword',()=>{
 assert.equal(parse('来一场',worldAt('viridian-forest')).action,'trainer-battle');
 assert.equal(parse('我想和捕虫少年切磋',worldAt('viridian-forest')).action,'trainer-battle');
 assert.deepEqual(parse('我和捕虫少年打一场',worldAt('pallet')).payload,{trainerName:'捕虫少年'});
 assert.deepEqual(parse('接受捕虫少年挑战',worldAt('pallet')).payload,{trainerName:'捕虫少年'});
 assert.equal(parse('我想和捕虫少年切磋',worldAt('viridian-forest',{starter:false})),null);
 assert.equal(parse('不要来一场',worldAt('viridian-forest')),null);
});

test('travel resolves the destination after the verb instead of the longer origin name', () => {
  assert.equal(parse('我从常青森林出发，前往2号道路', worldAt('viridian-forest')).payload.node, 'route2');
});

test('gym, healing, shop and pending battle intents respect current scene and state', () => {
  const gym = parse('我向小刚挑战道馆', worldAt('pewter'));
  assert.deepEqual(gym, {action:'challenge-gym', payload:{gym:0}, playerText:'我向小刚挑战道馆'});
  assert.equal(parse('我向小霞挑战道馆', worldAt('pewter')), null);
  assert.equal(parse('去宝可梦中心治疗', worldAt('route1')), null);
  assert.equal(parse('进入商店', worldAt('route1')), null);
  assert.equal(parse('去宝可梦中心治疗', worldAt('pallet', {starter:false})), null);
  assert.equal(parse('去宝可梦中心治疗', worldAt('pallet')).action, 'heal');
  assert.equal(parse('进入商店', worldAt('celadon')).action, 'visit-shop');
  assert.equal(parse('应战', worldAt('route1', {status:'pending'})).action, 'start-battle');
  assert.equal(parse('去常青市', worldAt('route1', {status:'active'})), null);
  assert.equal(parse('开始战斗', worldAt('route1', {status:'active'})), null);
});
