'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const mvu=require('../mvu.cjs');
const companionship=require('../companionship.cjs');

const root=variables=>variables.stat_data['宝可梦'];
function ready(node='route1'){
  const variables=mvu.createInitialMvu(),world=root(variables);
  world.剧情.初始御三家已选=true;
  world.地图.节点=node;world.地图.地点=({route1:'1号道路',pallet:'真新镇',viridian:'常青市'})[node]||node;
  world.地图.轮次=1;world.遭遇=null;
  world.战斗={轮次:1,状态:'finished',结果:'',摘要:'',操作序号:0};
  mvu.ensureMvuDefaults(variables);
  return variables;
}

test('legacy state gains UID companion records without replacing unrelated progress',()=>{
  const variables=ready(),world=root(variables),uid=world.队伍[0].uid;
  world.任务=[{id:'player-custom',标题:'我自己的旅程'}];
  delete world.羁绊;
  const upgraded=mvu.ensureMvuDefaults(variables),after=root(upgraded);
  assert.deepEqual(after.羁绊.伙伴[uid],{信赖:10,心情:'平静',共同记忆:[]});
  assert.ok(after.任务.some(task=>task.id==='player-custom'));
  assert.equal(mvu.validateMvu(upgraded),true);
});

test('bond gain is capped at once per trusted story turn, across actions and companions',()=>{
  const variables=ready(),world=root(variables),first=world.队伍[0];
  world.队伍.push(mvu.makeMon(4,5,'companion-second'));
  mvu.ensureMvuDefaults(variables);
  const bonded=mvu.theaterAction(variables,'bond',{uid:first.uid,mode:'talk',storyTurn:10});
  assert.equal(root(bonded).羁绊.伙伴[first.uid].信赖,12);
  assert.throws(()=>mvu.theaterAction(bonded,'care',{uid:'companion-second',mode:'comfort',storyTurn:10}),/本故事回合/);
  const nextTurn=mvu.theaterAction(bonded,'care',{uid:'companion-second',mode:'comfort',storyTurn:11});
  assert.equal(root(nextTurn).羁绊.伙伴['companion-second'].信赖,1);
  assert.equal(root(nextTurn).羁绊.上次羁绊增长故事轮次,11);
});

test('theater action targets the selected second companion UID',()=>{
  const variables=ready(),world=root(variables),first=world.队伍[0];
  const second=mvu.makeMon(4,5,'companion-second');world.队伍.push(second);
  mvu.ensureMvuDefaults(variables);
  const updated=mvu.theaterAction(variables,'bond',{uid:second.uid,mode:'talk',storyTurn:12});
  const after=root(updated);
  assert.equal(after.羁绊.伙伴[first.uid].信赖,10);
  assert.equal(after.羁绊.伙伴[second.uid].信赖,2);
});

test('training creates memories but awards no XP, EV, money, PP, or combat stats',()=>{
  const variables=ready(),world=root(variables),mon=world.队伍[0];
  mon.经验+=321;mon.能力值=mvu.stats(mon);mon.当前HP=mon.能力值.hp-3;
  const before={exp:mon.经验,ev:structuredClone(mon.努力值),money:world.训练家.金钱,hp:mon.当前HP,stats:structuredClone(mon.能力值),moves:structuredClone(mon.招式)};
  const after=mvu.theaterAction(variables,'train',{uid:mon.uid,mode:'practice',storyTurn:20});
  const trained=root(after),afterMon=trained.队伍[0];
  assert.equal(afterMon.经验,before.exp);assert.deepEqual(afterMon.努力值,before.ev);
  assert.equal(trained.训练家.金钱,before.money);assert.equal(afterMon.当前HP,before.hp);
  assert.deepEqual(afterMon.能力值,before.stats);assert.deepEqual(afterMon.招式,before.moves);
  assert.equal(trained.羁绊.伙伴[mon.uid].心情,'勇敢');
  assert.match(companionship.prompt(trained,21),/练习基础配合/);
});

test('camp is available in town or field, trust-scaled, repeat-safe, and never revives or heals status',()=>{
  const variables=ready(),world=root(variables),awake=world.队伍[0];
  awake.当前HP=1;awake.状态='psn';awake.招式[0].PP=Math.max(0,awake.招式[0].PP-2);
  const fainted=mvu.makeMon(4,5,'camp-fainted');fainted.当前HP=0;fainted.状态='brn';
  world.队伍.push(fainted);mvu.ensureMvuDefaults(variables);
  const maxRecovery=Math.ceil(awake.能力值.hp*0.1);
  const camped=mvu.theaterAction(variables,'camp',{storyTurn:30});
  const after=root(camped);
  assert.equal(after.队伍[0].当前HP,Math.min(awake.能力值.hp,1+maxRecovery));
  assert.equal(after.队伍[0].状态,'psn');assert.equal(after.队伍[0].招式[0].PP,awake.招式[0].PP);
  assert.equal(after.队伍[1].当前HP,0);assert.equal(after.队伍[1].状态,'brn');
  assert.throws(()=>mvu.theaterAction(camped,'camp',{storyTurn:30}),/本故事回合/);
  const town=mvu.theaterAction(ready('pallet'),'camp',{storyTurn:31});
  assert.equal(root(town).羁绊.上次露营故事轮次,31);
  const active=structuredClone(camped);root(active).战斗.状态='active';
  assert.throws(()=>mvu.theaterAction(active,'camp',{storyTurn:31}),/当前场景/);
});

test('scene options require a selected starter, safe state, and legal living targets',()=>{
  let variables=ready(),world=root(variables),uid=world.队伍[0].uid;
  let options=mvu.theaterView(variables).theater.options;
  assert.deepEqual(options.filter(item=>item.id==='camp').map(item=>({label:item.label,payload:item.payload})),[{label:'与伙伴露营',payload:{mode:'rest'}}]);
  const beforeStarter=ready();root(beforeStarter).剧情.初始御三家已选=false;
  assert.equal(mvu.theaterView(beforeStarter).theater.options.some(item=>['camp','bond','care','train'].includes(item.id)),false);
  world.战斗.状态='pending';
  assert.equal(mvu.theaterView(variables).theater.options.some(item=>['camp','bond','care','train'].includes(item.id)),false);
  variables=ready('pallet');world=root(variables);
  assert.equal(mvu.theaterView(variables).theater.options.some(item=>item.id==='camp'),true);
  assert.equal(mvu.theaterView(variables).theater.options.some(item=>['bond','care','train'].includes(item.id)),false);
});

test('care and shared memories remain bounded and short-lived cues expire',()=>{
  const variables=ready(),uid=root(variables).队伍[0].uid;
  let current=variables;
  for(let storyTurn=1;storyTurn<=14;storyTurn++)current=mvu.theaterAction(current,'care',{uid,mode:'comfort',storyTurn});
  const world=root(current),record=world.羁绊.伙伴[uid];
  assert.equal(record.共同记忆.length,12);
  assert.equal(record.共同记忆[0].故事轮次,3);
  assert.ok(world.羁绊.短期线索.every(clue=>clue.到期故事轮次>=14));
  assert.match(companionship.prompt(world,100),/温柔地陪在身边/);
  assert.doesNotMatch(companionship.prompt(world,100),/感到不安时更需要熟悉的陪伴/);
});
