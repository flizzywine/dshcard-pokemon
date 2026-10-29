'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const mvu=require('../mvu.cjs');
const held=require('../frlg-held-items.cjs');
const {KantoGame}=require('../engine.cjs');
const root=variables=>variables.stat_data.宝可梦;

test('held-item species data is pinned to FRLG species_info and covers Kanto 1–151',()=>{
 assert.equal(held.source.source.commit,'ce6406d8c2eaf46d543c8a2606de0c3cb1951982');
 assert.equal(Object.keys(held.table).length,151);
 assert.equal(held.table['25'].species,'PIKACHU');
 assert.deepEqual([held.table['113'].species,held.table['113'].rare],['CHANSEY','LUCKY_EGG']);
 assert.deepEqual([held.table['52'].species,held.table['52'].rare],['MEOWTH','NUGGET']);
});

test('wild held-item distribution is deterministic and honors the source common/rare slot rates',()=>{
 assert.equal(held.generate(1,'bulbasaur'),'', 'species with no held-item fields never receive an item');
 const rareOnly=Array.from({length:10000},(_,i)=>held.generate(52,`meowth-${i}`));
 const rare=rareOnly.filter(item=>item==='nugget').length;
 assert.ok(rare>350&&rare<650,`rare-only item rate should be about five percent; got ${rare}/10000`);
 assert.deepEqual(rareOnly,Array.from({length:10000},(_,i)=>held.generate(52,`meowth-${i}`)));
 const split=Array.from({length:10000},(_,i)=>held.generate(20,`raticate-${i}`));
 assert.ok(split.filter(item=>item==='oranberry').length>4700&&split.filter(item=>item==='oranberry').length<5300);
 assert.ok(split.filter(item=>item==='sitrusberry').length>350&&split.filter(item=>item==='sitrusberry').length<650);
 assert.ok(split.filter(item=>item==='').length>4200&&split.filter(item=>item==='').length<4800);
});

test('wild encounter items persist on capture once, while the bag receives no duplicate',()=>{
 const variables=mvu.createInitialMvu(),world=root(variables);
 const uid='wild-meowth-nugget';
 const foe=mvu.makeMon(52,8,uid,{wild:true});
 assert.ok(['','nugget'].includes(foe.携带道具));
 world.遭遇={类型:'wild',训练家:'野生宝可梦',队伍:[foe]};world.战斗.状态='pending';world.战斗.轮次=1;
 const game=new KantoGame(),snapshot=mvu.startFromMvu(game,variables),record=game.battles.get(snapshot.id);
 record.caught={id:52,name:'喵喵',ball:'pokeball'};
 record.battle.win('p1');
 const after=mvu.applyBattleResult(variables,record),captured=root(after).队伍.find(mon=>mon.uid===`caught-${record.id}`);
 assert.equal(captured.携带道具,foe.携带道具);
 assert.equal(root(after).背包.物品.nugget,0);
 const replay=mvu.applyBattleResult(after,record);
 assert.equal(root(replay).队伍.filter(mon=>mon.uid===captured.uid).length,1);
 assert.equal(root(replay).背包.物品.nugget,0);
});

test('Lucky Egg boosts only earned EXP and uses sequential integer floors',()=>{
 const variables=mvu.createInitialMvu(),world=root(variables),lead=world.队伍[0];
 world.设置.道馆等级上限=false;lead.携带道具='luckyegg';
 world.遭遇={类型:'trainer',训练家:'捕虫少年',队伍:[mvu.makeMon(16,30,'luckyegg-foe')]};
 world.战斗.状态='pending';world.战斗.轮次=1;
 const game=new KantoGame(),snapshot=mvu.startFromMvu(game,variables),record=game.battles.get(snapshot.id);
 const foe=record.battle.p2.pokemon[0];foe.fainted=true;foe.hp=0;
 const base=Math.floor((require('../public/data/progression.json')['16'].baseExperience||64)*30/7);
 const expected=Math.floor(Math.floor(base*150/100)*150/100);
 record.battle.win('p1');
 const after=root(mvu.applyBattleResult(variables,record));
 assert.equal(after.队伍[0].经验-lead.经验,expected);
});

test('Lucky Egg on a healthy reserve does not grant EXP without participation or Exp. Share',()=>{
 const variables=mvu.createInitialMvu(),world=root(variables),reserve=mvu.makeMon(4,5,'reserve-luckyegg');
 world.设置.道馆等级上限=false;reserve.携带道具='luckyegg';world.队伍.push(reserve);
 world.遭遇={类型:'trainer',训练家:'捕虫少年',队伍:[mvu.makeMon(16,12,'reserve-luckyegg-foe')]};
 world.战斗.状态='pending';world.战斗.轮次=1;
 const game=new KantoGame(),snapshot=mvu.startFromMvu(game,variables),record=game.battles.get(snapshot.id);
 const foe=record.battle.p2.pokemon[0];foe.fainted=true;foe.hp=0;
 record.battle.win('p1');
 const after=root(mvu.applyBattleResult(variables,record));
 assert.equal(after.队伍[1].经验,reserve.经验);
});

function settleTwoFoes(firstItem,secondItem){
 const variables=mvu.createInitialMvu(),world=root(variables),player=mvu.makeMon(4,12,'two-foe-player');
 player.携带道具=firstItem;player.招式=[{id:'ember',PP:25,PP上限:25}];world.队伍=[player];
 world.遭遇={类型:'trainer',训练家:'捕虫少年',队伍:[mvu.makeMon(16,1,'two-foe-a'),mvu.makeMon(16,1,'two-foe-b')]};
 world.战斗.状态='pending';world.战斗.轮次=1;
 const game=new KantoGame(),snapshot=mvu.startFromMvu(game,variables),record=game.battles.get(snapshot.id);
 game.act({battleId:snapshot.id,choice:'move 1'});
 const first=record.battle.p2.pokemon.find(mon=>mon.fainted);
 assert.ok(first,'the first opposing Pokémon was defeated');
 const firstUid=first.set.slotId;
 assert.equal(record.heldItemsByFoeAtDefeat[firstUid]?.[player.uid],firstItem||'');
 record.battle.p1.pokemon[0].item=secondItem;
 game.act({battleId:snapshot.id,choice:'move 1'});
 return {variables,record,player,firstUid,after:root(mvu.applyBattleResult(variables,record))};
}

test('Lucky Egg state is captured per foe at its first KO and never retroactively changes',()=>{
 const base=Math.floor(require('../public/data/progression.json')['16'].baseExperience/7);
 const lostAfterFirst=settleTwoFoes('luckyegg','');
 const beforeExperience=lostAfterFirst.player.经验;
 const first=lostAfterFirst.record.heldItemsByFoeAtDefeat[lostAfterFirst.firstUid];
 assert.equal(first[lostAfterFirst.player.uid],'luckyegg');
 assert.equal(lostAfterFirst.after.队伍[0].携带道具,'');
 assert.equal(lostAfterFirst.after.队伍[0].经验-beforeExperience,Math.floor(Math.floor(base*150/100)*150/100)+Math.floor(base*150/100));

 const gainedAfterFirst=settleTwoFoes('','luckyegg');
 const firstSnapshot=gainedAfterFirst.record.heldItemsByFoeAtDefeat[gainedAfterFirst.firstUid];
 assert.equal(firstSnapshot[gainedAfterFirst.player.uid],'', 'first foe keeps the empty held-item snapshot');
 const foeIds=Object.keys(gainedAfterFirst.record.heldItemsByFoeAtDefeat);
 const secondSnapshot=gainedAfterFirst.record.heldItemsByFoeAtDefeat[foeIds.find(uid=>uid!==gainedAfterFirst.firstUid)];
 assert.equal(secondSnapshot[gainedAfterFirst.player.uid],'luckyegg');
 assert.equal(gainedAfterFirst.after.队伍[0].经验-gainedAfterFirst.player.经验,Math.floor(base*150/100)+Math.floor(Math.floor(base*150/100)*150/100));
});

test('Amulet Coin doubles a trainer prize only after a living holder takes part',()=>{
 const settle=heldByLead=>{
  const variables=mvu.createInitialMvu(),world=root(variables);
  world.队伍[0].携带道具=heldByLead?'amuletcoin':'';
  if(!heldByLead){const reserve=mvu.makeMon(4,5,'amulet-reserve');reserve.携带道具='amuletcoin';world.队伍.push(reserve);}
  world.遭遇={类型:'trainer',训练家:'小茂',队伍:[mvu.makeMon(4,5,'amulet-foe')]};world.战斗.状态='pending';world.战斗.轮次=1;
  const game=new KantoGame(),snapshot=mvu.startFromMvu(game,variables),record=game.battles.get(snapshot.id);
  for(const foe of record.battle.p2.pokemon){foe.fainted=true;foe.hp=0;}
  record.battle.win('p1');
  return {record,world,after:root(mvu.applyBattleResult(variables,record))};
 };
 const activated=settle(true),reserve=settle(false);
 assert.equal(activated.record.moneyMultiplier,2);
 assert.equal(activated.after.训练家.金钱-activated.world.训练家.金钱,160);
 assert.equal(reserve.record.moneyMultiplier,undefined);
 assert.equal(reserve.after.训练家.金钱-reserve.world.训练家.金钱,80);
});

test('wild held items can be stolen by a native Gen III move and sync to the party without bag duplication',()=>{
 const variables=mvu.createInitialMvu(),world=root(variables);
 const meowth=mvu.makeMon(52,8,'thief-user');meowth.招式=[{id:'thief',PP:catalogMovePp('thief'),PP上限:catalogMovePp('thief')}];
 world.队伍=[meowth];const foe=mvu.makeMon(16,12,'thief-target');foe.携带道具='nugget';
 world.遭遇={类型:'wild',训练家:'野生宝可梦',队伍:[foe]};world.战斗.状态='pending';world.战斗.轮次=1;
 const game=new KantoGame(),snapshot=mvu.startFromMvu(game,variables),record=game.battles.get(snapshot.id);
 game.act({battleId:snapshot.id,choice:'move 1'});
 const player=record.battle.p1.pokemon[0],wild=record.battle.p2.pokemon[0];
 assert.equal(player.item,'nugget');
 assert.equal(wild.item,'');
 const after=root(mvu.applyBattleResult(variables,record));
 assert.equal(after.队伍[0].携带道具,'nugget');
 assert.equal(after.背包.物品.nugget,0);
});

function catalogMovePp(id){return require('../engine.cjs').catalog.moves[id].pp;}

test('battle snapshots expose only stable ability, volatile and side-condition IDs for resume UI',()=>{
 const game=new KantoGame(),snapshot=game.start({mode:'wild',team:[{id:25,uid:'snapshot-pikachu',level:10,moves:['thunderwave']}],opponent:[{id:16,uid:'snapshot-foe',level:10,moves:['tackle']}],seed:[3,4,5,6]});
 const record=game.battles.get(snapshot.id),player=record.battle.p1.pokemon[0];
 player.addVolatile('confusion');record.battle.p1.addSideCondition('reflect',player);
 const view=game.snapshot(record),actor=view.sides[0].team[0];
 assert.equal(actor.abilityId,player.ability);
 assert.ok(actor.volatiles.includes('confusion'));
 assert.deepEqual(view.sides[0].conditions,['reflect']);
 assert.ok(!Object.values(actor.volatiles).some(value=>value&&typeof value==='object'),'snapshot exposes volatile IDs only');
});
