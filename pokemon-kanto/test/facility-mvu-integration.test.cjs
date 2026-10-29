'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const mvu=require('../mvu.cjs');
const party=require('../party.cjs');
const {KantoGame}=require('../engine.cjs');
const runtime=require('../story-runtime.cjs');
const root=v=>v.stat_data.宝可梦;
function ready(node){const v=mvu.chooseStarter(mvu.createInitialMvu(),1),w=root(v);w.地图.节点=node;w.地图.地点=node;w.遭遇=null;w.战斗={轮次:2,状态:'finished',结果:'',摘要:'',操作序号:0};w.地图.轮次=2;return v;}
function use(v,id,payload={},storyTurn=10){return mvu.theaterAction(v,id,{...payload,storyTurn});}
function facility(v,id,payload={}){const view=mvu.worldView(v,{storyTurn:10}),option=view.facilities.options.find(o=>o.id===id&&Object.entries(payload).every(([k,val])=>o.payload[k]===val));assert.ok(option,id);return use(v,id,option.payload);}
function win(v){const game=new KantoGame(),s=mvu.startFromMvu(game,v),record=game.battles.get(s.id);for(const foe of record.battle.p2.pokemon){foe.hp=0;foe.fainted=true;}record.battle.win('p1');return mvu.applyBattleResult(v,record);}

test('native scene coin purchases, repeat receipts and held-item management use one MVU inventory',()=>{
 let v=ready('celadon');root(v).训练家.金钱=25000;
 v=facility(v,'facility-coin-case');const purchase=mvu.worldView(v).facilities.options.find(o=>o.id==='facility-buy-coins'&&o.payload.coins===500);
 v=use(v,purchase.id,purchase.payload);const once=structuredClone(root(v).城市设施);
 v=use(v,purchase.id,purchase.payload);assert.deepEqual(root(v).城市设施,once,'retry is not a second purchase');assert.equal(root(v).训练家.金钱,15000);
 v=facility(v,'facility-buy-coins',{coins:500});assert.equal(root(v).城市设施.gameCorner.coins,1000);
 v=facility(v,'facility-claim-prize',{itemId:'charcoal'});assert.equal(root(v).背包.物品.charcoal,1);assert.equal(root(v).城市设施.gameCorner.coins,0);
 v=party.holdItem(v,'starter','charcoal');assert.equal(root(v).队伍[0].携带道具,'charcoal');assert.equal(root(v).背包.物品.charcoal,0);
 assert.equal(mvu.validateMvu(v),true);
});

test('Safari scene owns its encounter and cannot be replaced by ordinary exploration, narrative or travel',()=>{
 let v=facility(ready('fuchsia'),'facility-safari-enter');assert.equal(root(v).地图.节点,'safari');
 assert.equal(root(v).训练家.金钱,2500);assert.equal(root(v).城市设施.safari.balls,30);
 assert.ok(mvu.worldView(v).theater.options.every(o=>o.id.startsWith('facility-safari-')||o.id==='kanto-story-event'));
 assert.throws(()=>use(v,'wild'),/本次狩猎/);assert.throws(()=>mvu.travel(v,'fuchsia'),/本次狩猎/);
 assert.throws(()=>mvu.ensureEncounter(v,9),/狩猎地带/);
 assert.equal(runtime.narrativeEncounter(v,'走进草丛','一只蛋蛋走到眼前。\n【进入本轮战斗】'),null);
 for(let i=0;i<100&&!root(v).城市设施.safari.encounter;i++)v=facility(v,'facility-safari-step');
 const target=root(v).城市设施.safari.encounter;assert.ok(target,'revisioned walking eventually encounters a local species');
 assert.ok(mvu.worldView(v).theater.pokemon.some(mon=>mon.id===target.speciesId));
 const before=root(v).城市设施.safari.balls;v=facility(v,'facility-safari-throw');assert.equal(root(v).城市设施.safari.balls,before-1);
 v=facility(v,'facility-safari-exit');assert.equal(root(v).地图.节点,'fuchsia');assert.equal(root(v).城市设施.safari.status,'finished');
});

test('a real Snorlax battle settlement unlocks one route-specific Leftovers reward',()=>{
 let v=ready('route12'),w=root(v);w.剧情.关都事件.标记.pokeFlute=true;w.背包.关键物品.push('itemfinder');
 v=use(v,'field-awaken-snorlax',{id:'route12'});assert.equal(root(v).遭遇.队伍[0].图鉴编号,143);
 v=win(v);assert.equal(root(v).剧情.场地服务.cleared['snorlax:route12'],true);
 v=use(v,'field-search-itemfinder',{item:'leftovers',id:'route12'});assert.equal(root(v).背包.物品.leftovers,1);
 assert.throws(()=>use(v,'field-search-itemfinder',{item:'leftovers',id:'route12'}),/当前场景|只能/);
});

test('fossils use native story turns rather than the independent battle counter',()=>{
 let v=ready('mt-moon');root(v).剧情.场地服务.cleared['fossil-researcher']=true;
 v=use(v,'field-choose-fossil',{item:'helixfossil'},79);root(v).地图.节点='cinnabar';root(v).地图.地点='红莲岛';
 v=use(v,'field-revive-fossil',{item:'helixfossil'},80);
 assert.equal(root(v).地图.轮次,2);
 assert.ok(!mvu.worldView(v,{storyTurn:80}).theater.options.some(o=>o.id==='field-claim-revived-fossil'));
 const option=mvu.worldView(v,{storyTurn:81}).theater.options.find(o=>o.id==='field-claim-revived-fossil');assert.ok(option);
 v=use(v,option.id,option.payload,81);assert.ok(root(v).队伍.some(mon=>mon.图鉴编号===138&&mon.等级===5));
 assert.throws(()=>use(v,option.id,option.payload,82),/当前场景|只能|没有/);
});

test('actual battle entry applies the chosen difficulty once and leaves the player unchanged',()=>{
 for(const difficulty of ['easy','normal','hell','ai']){
  let v=ready('pewter'),w=root(v);w.设置.对手难度=difficulty;w.队伍=[mvu.makeMon(1,20,'player')];
  if(difficulty==='hell')w.训练家.徽章=['岩石徽章'];
  v=difficulty==='hell'?use(v,'hell-rematch',{key:'brock'}):use(v,'challenge-gym',{gym:0});w=root(v);const player=structuredClone(w.队伍),original=w.遭遇.队伍[0].能力值;
  const game=new KantoGame(),s=mvu.startFromMvu(game,v),record=game.battles.get(s.id);
  assert.equal(w.遭遇.难度应用.level,difficulty);assert.deepEqual(w.队伍,player);assert.equal(record.battle.p2.pokemon.length,difficulty==='hell'?6:2);
  if(difficulty==='normal')assert.deepEqual(w.遭遇.队伍[0].能力值,original);
  if(difficulty==='hell'){assert.equal(w.遭遇.bossTier,'extreme');assert.equal(w.遭遇.队伍[0].个体值.atk,31);assert.ok(w.遭遇.队伍[0].能力值.atk>=original.atk);}
  if(difficulty==='ai')assert.ok(w.遭遇.队伍.every(mon=>Math.abs(mon.等级-20)<=1));
 }
});
