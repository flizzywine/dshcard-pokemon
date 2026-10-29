'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const services = require('../classic-services.cjs');
const mvu = require('../mvu.cjs');
const make = mvu.makeMon;
const tradeNodes={'mr-mime':'route2',jynx:'cerulean',nidoran:'route5',farfetchd:'vermilion',nidorino:'route11',lickitung:'route18',electrode:'cinnabar',tangela:'cinnabar',seel:'cinnabar'};
function world(team, extra={}) { return {队伍:team,电脑:[],训练家:{徽章:[],金钱:5000},地图:{轮次:12,节点:'route5'},背包:{物品:{}},...extra}; }

test('all nine FR NPC trades check the required species and award source details exactly', () => {
  assert.equal(services.trades.length,9);
  for (const trade of services.trades) {
    const w=world([make(trade.requested,12,`offer-${trade.id}`)]);
    w.地图.节点=tradeNodes[trade.id];
    const next=services.apply(w,`classic-trade-${trade.id}`,{tradeId:trade.id},{storyTurn:12});
    const received=next.队伍[0];
    assert.equal(received.图鉴编号,trade.species);
    assert.equal(received.昵称,trade.nickname);
    assert.deepEqual(received.个体值,{hp:trade.ivs[0],atk:trade.ivs[1],def:trade.ivs[2],spe:trade.ivs[3],spa:trade.ivs[4],spd:trade.ivs[5]});
    assert.equal(received.原训练家,trade.ot);
    assert.equal(received.原训练家编号,trade.otId);
    assert.deepEqual(next.经典设施.tradesUsed,[trade.id]);
    assert.equal(w.经典设施,undefined,'transaction must leave input world untouched');
    assert.throws(()=>services.apply(next,`classic-trade-${trade.id}`,{tradeId:trade.id}),/已经完成过交换/);
  }
});

test('LeafGreen uses the native version specific trade requests and received Pokémon', () => {
  const base={队伍:[],电脑:[],设置:{版本:'leafgreen'}};
  const views=Object.values(tradeNodes).filter((x,i,a)=>a.indexOf(x)===i).flatMap(node=>services.view({...base,地图:{节点:node}}).trades);
  assert.equal(views.find(x=>x.id==='nidoran').requestedName,'尼多兰');
  assert.equal(views.find(x=>x.id==='nidoran').speciesName,'尼多朗');
  assert.match(views.find(x=>x.id==='nidoran').label,/收尼多朗，交尼多兰/);
  assert.deepEqual(views.filter(x=>['nidoran','nidorino','lickitung'].includes(x.id)).map(x=>[x.id,x.requested,x.species,x.nickname]),[
    ['nidoran',29,32,'MR. NIDO'],['nidorino',30,33,'NINO'],['lickitung',80,108,'MARC'],
  ]);
  for(const [tradeId,requested,species,nickname] of [['nidoran',29,32,'MR. NIDO'],['nidorino',30,33,'NINO'],['lickitung',80,108,'MARC']]){
    const offered=make(requested,27,`lg-${tradeId}`),world=services.ensure({...base,队伍:[offered]});
    world.地图={节点:tradeNodes[tradeId]};
    const next=services.apply(world,`classic-trade-${tradeId}`,{tradeId});
    assert.equal(next.队伍[0].图鉴编号,species);assert.equal(next.队伍[0].昵称,nickname);assert.equal(next.队伍[0].等级,27);
    assert.equal(next.队伍[0].闪光,false);
  }
});

test('slot machine accepts 1–3 coin bets and stops one deterministic reel per action', () => {
  let w=world([make(25,10,'pika')],{城市设施:{gameCorner:{coinCase:true,coins:50}}});
  w.地图.节点='celadon';
  w=services.apply(w,'classic-slot-start-3',{bet:3},{storyTurn:15});
  assert.equal(w.城市设施.gameCorner.coins,47);
  for(let i=0;i<3;i++) w=services.apply(w,'classic-slot-stop',{},{});
  const receipt=w.经典设施.receipts.at(-1).detail;
  assert.equal(receipt.reels.length,3);
  assert.equal(w.城市设施.gameCorner.coins,47+receipt.payout);
  assert.equal(w.经典设施.slot.active,null);
});

test('double-care breeding advances once per story turn and hatches eggs after a few turns', () => {
  let w=world([make(1,5,'mom'),make(1,5,'dad'),make(25,5,'reserve')],{训练家:{徽章:[1,2,3,4,5],金钱:0}});
  w.队伍[0].性别='female';w.队伍[1].性别='male';
  w.队伍[0].个体值={hp:31,atk:31,def:31,spa:31,spd:31,spe:31};
  w.队伍[1].个体值={hp:0,atk:0,def:0,spa:0,spd:0,spe:0};
  w.队伍[1].招式=[{id:'charm',PP:20,PP上限:20}];
  w=services.ensure(w);w.经典设施.daycare.mode='double';w.经典设施.daycare.unlocked=true;
  w=services.apply(w,'classic-daycare-deposit-mom',{uid:'mom'});
  w=services.apply(w,'classic-daycare-deposit-dad',{uid:'dad'});
  const untouched=services.advanceDaycareTurn(w,{storyTurn:18});
  assert.equal(untouched.经典设施.daycare.turns,1);
  w=services.advanceDaycareTurn(untouched,{storyTurn:18});
  assert.equal(w.经典设施.daycare.turns,1,'repeated finish/read notifications for the same turn are ignored');
  assert.equal(w.经典设施.daycare.eggSeq,untouched.经典设施.daycare.eggSeq,'a repeated turn cannot generate an extra egg');
  for(let turn=19;turn<80&&!w.经典设施.daycare.eggs.length;turn++)w=services.advanceDaycareTurn(w,{storyTurn:turn});
  const eggs=w.经典设施.daycare.eggs;
  assert.ok(eggs.length>0);
  assert.ok(eggs.some(e=>e.species===1));
  const inherited=eggs.find(e=>e.moves.includes('charm'));
  assert.ok(inherited,'father passes the original Bulbasaur egg move');
  assert.ok(Object.values(inherited.ivs).filter((v,i)=>v===31||v===0).length>=3,'three IVs inherit from the parents');
  assert.ok(eggs.every(e=>e.turnsLeft>=0 && ![...w.队伍,...w.电脑].some(m=>m.uid===e.id)));
  const incubation=eggs[0].turnsLeft;
  assert.ok(incubation>=3&&incubation<=8,'eggs have a short, visible story-turn incubation');
  const ready=[];
  for(let turn=(w.经典设施.daycare.lastStoryTurn||0)+1;turn<(w.经典设施.daycare.lastStoryTurn||0)+10&&!ready.length;turn++){
    w=services.advanceDaycareTurn(w,{storyTurn:turn});ready.push(...w.经典设施.daycare.eggs.filter(e=>e.turnsLeft===0));
  }
  assert.ok(ready.length>0);
  const eggsBeforeHatch=w.经典设施.daycare.eggs.length;
  w=services.apply(w,'classic-egg-hatch',{},{});
  assert.equal(w.经典设施.daycare.eggs.length,eggsBeforeHatch-ready.length);
  assert.ok([...w.队伍,...w.电脑].some(m=>m.孵化来源?.父母?.includes('mom')));
  assert.ok([...w.队伍,...w.电脑].some(m=>m.孵化来源?.父母?.includes('dad')&&m.招式.some(move=>move.id==='charm')));
});

test('legacy step-based daycare eggs migrate to remaining story turns', () => {
  const w=services.ensure({...world([make(25,5,'pika')]),经典设施:{schemaVersion:1,revision:0,tradesUsed:[],daycare:{unlocked:false,mode:'single',parents:[],deposited:{},steps:1234,eggs:[{id:'legacy-egg',species:1,stepsLeft:5120,parents:[],moves:[],personality:0}],eggSeq:0},slot:{spin:0,active:null},tutorUsed:false,receipts:[]}});
  assert.equal(w.经典设施.daycare.steps,1234,'legacy totals remain readable');
  assert.equal(w.经典设施.daycare.eggs[0].turnsLeft,5);
  assert.equal(services.view(w).daycare.eggs[0].turnsLeft,5);
});

test('Counter tutor only teaches once and rejects incompatible species without a receipt', () => {
  let w=services.ensure(world([make(4,10,'char') ,make(1,10,'bulba')]));
  w.地图.节点='celadon';w.城市设施={departmentStore:{floor:'3F'}};
  assert.throws(()=>services.apply(w,'classic-tutor-counter-bulba',{uid:'bulba'}),/不能学习双倍奉还/);
  assert.equal(w.经典设施.tutorUsed,false);
  assert.equal(w.经典设施.receipts.length,0);
  w=services.apply(w,'classic-tutor-counter-char',{uid:'char'});
  assert.equal(w.经典设施.tutorUsed,true);
  assert.ok(w.队伍[0].招式.some(m=>m.id==='counter'));
  assert.throws(()=>services.apply(w,'classic-tutor-counter-char',{uid:'char'}),/只授课一次/);
});

test('Counter tutor can replace a user-selected move when the compatible Pokémon already knows four', () => {
  const mon=make(4,20,'full-char');
  const moveData=require('../engine.cjs').catalog.moves;
  mon.招式=['scratch','growl','ember','smokescreen'].map(id=>({id,PP:moveData[id].pp,PP上限:moveData[id].pp}));
  let w=services.ensure(world([mon]));
  w.地图.节点='celadon';w.城市设施={departmentStore:{floor:'3F'}};
  assert.deepEqual(services.options(w).find(a=>a.id==='classic-tutor-counter-full-char').payload.replaceMoves.map(m=>m.name),['抓','叫声','火花','烟幕']);
  assert.throws(()=>services.apply(w,'classic-tutor-counter-full-char',{uid:mon.uid}),/整数/);
  assert.equal(w.经典设施.tutorUsed,false);
  w=services.apply(w,'classic-tutor-counter-full-char',{uid:mon.uid,replaceIndex:2});
  assert.equal(w.队伍[0].招式.length,4);
  assert.equal(w.队伍[0].招式.at(-1).id,'counter');
});

test('classic facilities expose only local services and reject remote operations without consuming state',()=>{
 const w=services.ensure(world([make(63,12,'abra'),make(4,12,'char')]));
 w.地图.节点='pallet';
 const before=structuredClone(w),view=services.view(w);
 assert.deepEqual(view.trades,[]);
 assert.equal(view.actions.some(a=>/classic-(trade|daycare|slot|tutor)/.test(a.id)),false);
 for(const [action,payload] of [['classic-trade-mr-mime',{tradeId:'mr-mime'}],['classic-daycare-deposit-char',{uid:'char'}],['classic-slot-start',{bet:1}],['classic-tutor-counter-char',{uid:'char'}]])assert.throws(()=>services.apply(w,action,payload),/请前往/);
 assert.deepEqual(w,before);
 w.地图.节点='celadon';w.城市设施={departmentStore:{floor:'3F'}};
 assert.equal(services.view(w).availability.tutor,true);
 const tutor=services.options(w).find(a=>a.id==='classic-tutor-counter-char');
 assert.match(tutor.label,/双倍奉还/);
});

test('full party and full PC preserve ready eggs when a hatch cannot fit', () => {
  const team=Array.from({length:6},(_,i)=>make([1,4,7,10,13,16][i],5,`full-${i}`));
  const pc=Array.from({length:420},(_,i)=>make(25,5,`pc-${i}`));
  let w=services.ensure(world(team));w.电脑=pc;
  w.经典设施.daycare.eggs=[{id:'egg-one',species:1,stepsLeft:0,parents:['a','b'],ivs:{hp:1,atk:2,def:3,spa:4,spd:5,spe:6},moves:[],personality:2}];
  assert.throws(()=>services.apply(w,'classic-egg-hatch',{},{}),/没有足够空位/);
  assert.equal(w.经典设施.daycare.eggs.length,1);
});

test('trade protects held items and mail and reports the disabled reason',()=>{
 for(const field of ['携带道具','持有邮件']){
  const mon=make(63,12,'abra');mon[field]=field==='携带道具'?'everstone':{message:'hello'};
  const w=world([mon]);w.地图.节点='route2';const before=structuredClone(w);
  const trade=services.view(w).trades.find(t=>t.id==='mr-mime');
  assert.equal(trade.available,false);assert.match(trade.reason,/先取下/);
  const option=services.options(w).find(a=>a.id==='classic-trade-mr-mime');
  assert.equal(option.enabled,false);assert.match(option.reason,/先取下/);
  assert.throws(()=>services.apply(w,option.id),/先取下/);assert.deepEqual(w,before);
 }
});

test('Counter tutor is only available on the Celadon department store third floor',()=>{
 let w=services.ensure(world([make(4,10,'char')]));w.地图.节点='celadon';w.城市设施={departmentStore:{floor:'2F'}};
 assert.equal(services.view(w).availability.tutor,false);
 assert.equal(services.options(w).some(a=>a.id==='classic-tutor-counter-char'),false);
 assert.throws(()=>services.apply(w,'classic-tutor-counter-char',{uid:'char'}),/3F/);
 assert.equal(w.经典设施.tutorUsed,false);
 w.城市设施.departmentStore.floor='3F';assert.equal(services.view(w).availability.tutor,true);
 assert.equal(services.options(w).find(a=>a.id==='classic-tutor-counter-char').enabled,true);
 assert.equal(services.apply(w,'classic-tutor-counter-char',{uid:'char'}).经典设施.tutorUsed,true);
});

test('daycare deposit preserves a healthy usable party member',()=>{
 const healthy=make(25,5,'healthy'),fainted=make(4,5,'fainted');fainted.当前HP=0;
 let w=services.ensure(world([healthy,fainted]));
 const option=services.options(w).find(a=>a.id==='classic-daycare-deposit-healthy');
 assert.equal(option.enabled,false);assert.match(option.reason,/能够战斗/);
 const before=structuredClone(w);assert.throws(()=>services.apply(w,option.id,{uid:'healthy'}),/能够战斗/);assert.deepEqual(w,before);
 w=services.apply(w,'classic-daycare-deposit-fainted',{uid:'fainted'});
 assert.deepEqual(w.队伍.map(m=>m.uid),['healthy']);
});

test('NPC mail is stored intact when taken and survives subsequent release',()=>{
 const party=require('../party.cjs');let v=mvu.createInitialMvu(),w=v.stat_data.宝可梦;
 w.地图.节点='cerulean';w.队伍=[make(61,12,'poli'),make(25,5,'reserve')];
 v.stat_data.宝可梦=services.apply(w,'classic-trade-jynx');
 const received=v.stat_data.宝可梦.队伍[0],mail=structuredClone(received.持有邮件);
 v=party.takeHeldItem(v,received.uid);w=v.stat_data.宝可梦;
 assert.deepEqual(w.邮件收纳,[mail]);assert.equal(w.队伍[0].携带道具,'');assert.equal(w.队伍[0].持有邮件,undefined);
 v=party.releasePokemon(v,received.uid,true);mvu.validateMvu(v);
 assert.deepEqual(v.stat_data.宝可梦.邮件收纳,[mail]);
});

test('daycare withdrawal reads UID from action ID without payload',()=>{
 let w=services.ensure(world([make(25,5,'reserve'),make(4,5,'deposit-id')]));
 w=services.apply(w,'classic-daycare-deposit-deposit-id',{uid:'deposit-id'});
 w=services.apply(w,'classic-daycare-withdraw-deposit-id');
 assert.ok(w.队伍.some(m=>m.uid==='deposit-id'));assert.equal(w.经典设施.daycare.parents.length,0);
});
