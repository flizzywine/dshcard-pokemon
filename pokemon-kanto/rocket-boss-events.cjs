'use strict';
const fs=require('node:fs');
const path=require('node:path');
const bossProfiles=require('./boss-profiles.cjs');
const DATA=JSON.parse(fs.readFileSync(path.join(__dirname,'public/data/rocket-boss-events.json'),'utf8'));
const EVENTS=DATA.events,byId=new Map(EVENTS.map(item=>[item.id,item]));
const clone=value=>structuredClone(value),plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
function ensure(world){
  if(!world||typeof world!=='object')throw new TypeError('需要关都世界状态。');
  if(!plain(world.剧情))world.剧情={};const existing=world.剧情.火箭队剧情;
  const state=plain(existing)?existing:{version:1,progress:{},flags:{},records:[]};state.version=1;if(!plain(state.progress))state.progress={};if(!plain(state.flags))state.flags={};if(!Array.isArray(state.records))state.records=[];
  for(const [id,progress]of Object.entries(state.progress))if(!byId.has(id)||!plain(progress)){delete state.progress[id];continue;}else{
    const event=byId.get(id),validStages=new Set(event.stages.map(stage=>stage.id));if(!validStages.has(progress.stage))delete state.progress[id];
    if(progress.won!==undefined&&typeof progress.won!=='boolean')delete progress.won;
    if(progress.complete!==undefined&&typeof progress.complete!=='boolean')delete progress.complete;
    if(progress.tier!==undefined&&!bossProfiles.tiers.includes(progress.tier))delete progress.tier;
    if(progress.pending!==undefined&&(!plain(progress.pending)||progress.pending.eventId!==id||!bossProfiles.tiers.includes(progress.pending.tier)))delete progress.pending;
  }
  for(const [key,value]of Object.entries(state.flags))if(!/^[a-z][a-zA-Z0-9]{0,63}$/.test(key)||typeof value!=='boolean')delete state.flags[key];
  state.records=state.records.filter(row=>plain(row)&&byId.has(row.eventId)&&Number.isSafeInteger(row.storyTurn)&&typeof row.result==='string').slice(-32);
  world.剧情.火箭队剧情=state;return world;
}
const phase=(world,event)=>world?.剧情?.火箭队剧情?.progress?.[event.id]?.stage||event.stages[0].id;
const stageFor=(event,id)=>event.stages.find(stage=>stage.id===id)||null;
function unmet(world,event){const result=[];if((world?.训练家?.徽章?.length||0)<event.requires.badges)result.push(`至少需要${event.requires.badges}枚徽章。`);for(const [key,value]of Object.entries(event.requires.flags||{}))if(world?.剧情?.火箭队剧情?.flags?.[key]!==value)result.push(`需要先完成${key}前置证据。`);return result;}
function eventView(world,event){const stage=stageFor(event,phase(world,event)),progress=world.剧情.火箭队剧情.progress[event.id],locked=unmet(world,event);if(progress?.complete)return {id:event.id,title:event.title,node:event.node,status:'complete',locked:false,stage:null,choices:[],result:progress.outcome||''};return {id:event.id,title:event.title,node:event.node,status:locked.length?'locked':progress?.stage||'available',locked:locked.length>0,reason:locked.join(' '),bossId:event.bossId,stage,choices:stage?.battle?[{id:'begin',label:`与${event.speaker}对战`,enabled:!locked.length&&!progress?.pending,requiresBattle:true,bossId:event.bossId}]:stage?.choices||[]};}
function view(world){const snapshot=ensure(clone(world));return EVENTS.map(event=>eventView(snapshot,event));}
function options(world){return view(world).filter(item=>item.node===world?.地图?.节点&&item.status!=='complete');}
function validTurn(storyTurn){if(!Number.isSafeInteger(storyTurn)||storyTurn<1)throw new Error('需要由宿主提供有效的故事回合。');}
function startBattle(world,eventId,{tier='original',partyLevel,starterId,storyTurn}={}){
  validTurn(storyTurn);const next=ensure(clone(world)),event=byId.get(eventId);if(!event||event.node!==next.地图?.节点)throw new Error('当前位置没有这场火箭队事件。');if(next.战斗?.状态!=='finished')throw new Error('请先结束当前对战。');const locked=unmet(next,event);if(locked.length)throw new Error(locked.join(' '));
  const current=next.剧情.火箭队剧情.progress[eventId]||{stage:event.stages[0].id};if(current.stage!=='battle')throw new Error('请先完成事件调查阶段。');if(current.pending)throw new Error('这场首领对战已经开始。');
  const profile=bossProfiles.build(event.bossId,tier,{partyLevel,starterId});current.tier=tier;current.pending={eventId,bossId:event.bossId,tier,storyTurn,...(Number.isFinite(partyLevel)?{partyLevel}:{}),...(Number.isInteger(starterId)?{starterId}:{})};next.剧情.火箭队剧情.progress[eventId]=current;
  const encounter={类型:'trainer',训练家:event.speaker,npc:event.speaker,title:event.title,specialId:`rocket-story-${eventId}`,storyEventId:eventId,bossProfileId:event.bossId,bossTier:tier,theme:'rocket',队伍:profile.team.map(mon=>({图鉴编号:mon.speciesId,等级:mon.level,uid:mon.uid,昵称:mon.name,招式:mon.moves,特性:mon.ability,携带道具:mon.heldItem,性格:mon.nature,个体值:mon.iv,努力值:mon.ev})),itemInventory:profile.itemInventory,itemPolicy:profile.itemPolicy,tactic:profile.tactic};
  return {world:next,encounter,profile};
}
function authenticEncounter(event,pending,encounter){
  if(!plain(encounter)||encounter.storyEventId!==event.id||encounter.bossProfileId!==event.bossId||encounter.bossTier!==pending.tier||encounter.specialId!==`rocket-story-${event.id}`||encounter.类型!=='trainer'||!Array.isArray(encounter.队伍))return false;
  const profile=bossProfiles.build(event.bossId,pending.tier,{partyLevel:pending.partyLevel,starterId:pending.starterId}),expected=profile.team,actual=encounter.队伍;
  return actual.length===expected.length&&actual.every((mon,index)=>{
    const row=expected[index];return mon?.图鉴编号===row.speciesId&&mon?.等级===row.level&&mon?.uid===row.uid&&mon?.招式?.length===row.moves.length&&mon.招式.every((move,i)=>move===row.moves[i])&&mon?.特性===row.ability&&mon?.携带道具===row.heldItem;
  })&&JSON.stringify(encounter.itemInventory||{})===JSON.stringify(profile.itemInventory)&&JSON.stringify(encounter.itemPolicy||{})===JSON.stringify(profile.itemPolicy);
}
function onBattleResult(world,{eventId,result,storyTurn,encounter}={}){
  const next=ensure(world),event=byId.get(eventId),state=next.剧情.火箭队剧情,progress=state.progress[eventId];if(!event||!progress?.pending)return next;
  const pending=progress.pending;progress.pending=null;validTurn(storyTurn??Math.max(1,next.地图?.轮次||1));
  if(result==='win'&&authenticEncounter(event,pending,encounter)){progress.won=true;progress.stage='resolution';append(state,{eventId,storyTurn:storyTurn||Math.max(1,next.地图?.轮次||1),result:'win',bossId:event.bossId,tier:pending.tier});}
  else append(state,{eventId,storyTurn:storyTurn||Math.max(1,next.地图?.轮次||1),result:result==='win'?'unverified':'loss',bossId:event.bossId,tier:pending.tier});
  return next;
}
function append(state,row){state.records.push(row);if(state.records.length>32)state.records.splice(0,state.records.length-32);}
function apply(world,action,payload={},options={}){
  if(action!=='rocket-story-choice')throw new Error('未知的火箭队剧情操作。');validTurn(options.storyTurn);const next=ensure(clone(world)),event=byId.get(payload.eventId);if(!event||event.node!==next.地图?.节点)throw new Error('当前位置没有这段火箭队剧情。');if(next.战斗?.状态!=='finished')throw new Error('请先结束当前对战。');const locked=unmet(next,event);if(locked.length)throw new Error(locked.join(' '));
  const progress=next.剧情.火箭队剧情.progress[event.id]||{stage:event.stages[0].id};if(progress.pending)throw new Error('首领对战尚未结算。');const stage=stageFor(event,progress.stage);if(!stage||stage.battle)throw new Error('当前阶段需要通过首领对战结算推进。');const choice=stage.choices.find(item=>item.id===payload.choiceId);if(!choice)throw new Error('当前阶段没有这个选择。');
  Object.assign(next.剧情.火箭队剧情.flags,Object.fromEntries(Object.entries(choice.flags||{}).map(([key,value])=>[key,value===true])));progress.outcome=choice.id;progress.stage=choice.next|| (choice.complete?'resolution':progress.stage);if(choice.complete){if(!progress.won)throw new Error('必须先真实战胜该首领，才能完成事件。');progress.stage=stage.id;progress.complete=true;progress.outcome=choice.id;}
  next.剧情.火箭队剧情.progress[event.id]=progress;append(next.剧情.火箭队剧情,{eventId:event.id,storyTurn:options.storyTurn,result:choice.id});next.剧情.剧场={...(plain(next.剧情.剧场)?next.剧情.剧场:{}),地点:next.地图?.节点,轮次:next.地图?.轮次||0,故事轮次:options.storyTurn,最近动作:'rocket-story-choice',角色:event.bossId,对白:choice.text||stage.text||event.title};return next;
}
function validate(world){const state=world?.剧情?.火箭队剧情;if(!plain(state)||state.version!==1||!plain(state.progress)||!plain(state.flags)||!Array.isArray(state.records)||state.records.length>32)throw new Error('火箭队剧情进度无效。');for(const [key,value]of Object.entries(state.flags))if(!/^[a-z][a-zA-Z0-9]{0,63}$/.test(key)||typeof value!=='boolean')throw new Error('火箭队剧情证据标记无效。');for(const [id,progress]of Object.entries(state.progress)){const event=byId.get(id);if(!event||!plain(progress)||!stageFor(event,progress.stage)||progress.complete===true&&progress.won!==true||progress.pending&&(!bossProfiles.tiers.includes(progress.pending.tier)||progress.pending.bossId!==event.bossId))throw new Error('火箭队剧情阶段无效。');}return true;}
module.exports={ensure,validate,view,options,apply,startBattle,onBattleResult,EVENTS:EVENTS.map(clone)};
