'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const profiles=require('../boss-profiles.cjs');
const itemCatalog=require('../public/data/items.json');

test('boss profiles expose original, enhanced and extreme selectable tiers for gyms, league and Rocket executives',()=>{
  assert.equal(profiles.validate(),true);assert.equal(profiles.definitions().length,18);
  for(const boss of profiles.definitions()){assert.deepEqual(boss.tiers,['original','enhanced','extreme']);for(const tier of boss.tiers){const profile=profiles.select(boss.id,{tier});assert.equal(profile.id,boss.id);assert.ok(profile.team.length<=6);assert.ok(profile.itemPolicy.maxUses<=3);assert.equal(profile.itemPolicy.canRevive,false);}}
  assert.equal(profiles.build('brock','original').team.length,2);assert.equal(profiles.build('brock','enhanced').team.length,3);assert.equal(profiles.build('brock','extreme').team.length,6);
  assert.ok(new Set(profiles.build('brock','extreme').team.map(mon=>mon.moves.join(','))).size>=3,'extreme team members use distinct move roles');
  assert.equal(profiles.build('misty','extreme').team.length,6);assert.equal(profiles.build('apollo','extreme').team.length,6);
});

test('each boss team uses legal Gen III moves, abilities, held items and bounded finite medicine',()=>{
  const battleItems=new Map(itemCatalog.filter(item=>item.battle&&!item.battle.capture&&!item.battle.escape).map(item=>[item.id,item]));
  for(const boss of profiles.definitions())for(const tier of boss.tiers){
    const profile=profiles.build(boss.id,tier);assert.ok(Object.values(profile.itemInventory).every(count=>Number.isInteger(count)&&count>=0&&count<=3));
    assert.ok(profile.itemPolicy.maxUses>=1&&profile.itemPolicy.maxUses<=3);assert.equal(profile.itemPolicy.canRevive,false);
    assert.deepEqual(Object.keys(profile.itemInventory).sort(),profile.itemPolicy.allowed.slice().sort(),'battle policy and finite inventory IDs match');
    for(const id of Object.keys(profile.itemInventory)){assert.ok(battleItems.has(id),`${id} is a battle-use item in the actual item catalog`);assert.ok(!['revive','maxrevive'].includes(id));}
    for(const mon of profile.team){assert.ok(mon.speciesId>=1&&mon.speciesId<=151);assert.equal(mon.iv.hp,31);assert.equal(Object.values(mon.iv).reduce((sum,value)=>sum+value,0),186);assert.equal(Object.values(mon.ev).reduce((sum,value)=>sum+value,0),510);assert.ok(mon.moves.length>=1&&mon.moves.length<=4);assert.ok(mon.heldItem);}
  }
  const extreme=profiles.build('lorelei','extreme');assert.ok(extreme.team.every(mon=>mon.speciesId<144),'the roster stays Kanto-only without leaning on legendaries');
});

test('profiles expose the exact encounter and trainer inventory fields consumed by the battle API',()=>{
  const profile=profiles.build('apollo','enhanced',{partyLevel:32});
  assert.deepEqual(Object.keys(profile.team[0]).sort(),['ability','ev','heldItem','iv','level','moves','name','nature','speciesId','uid'].sort());
  assert.deepEqual(profile.itemInventory,{potion:2});
  assert.equal(profile.itemPolicy.maxUses,2);
  assert.ok(profile.itemPolicy.allowed.includes('potion'));
  assert.deepEqual(profile.team[0].moves.length<=4,true);
  assert.equal(typeof profile.tactic,'string');
});

test('difficulty can respond to player strength and Champion counter-picks the selected starter family',()=>{
  const low=profiles.select('apollo',{tier:'original',partyLevel:18}),high=profiles.select('apollo',{tier:'extreme',partyLevel:70});
  assert.ok(Math.max(...high.team.map(mon=>mon.level))>Math.max(...low.team.map(mon=>mon.level)));
  assert.equal(profiles.select('champion',{tier:'original',starterId:1}).team.at(-1).speciesId,6);
  assert.equal(profiles.select('champion',{tier:'original',starterId:4}).team.at(-1).speciesId,9);
  assert.equal(profiles.select('champion',{tier:'original',starterId:7}).team.at(-1).speciesId,3);
});

test('boss tiers use bounded level offsets instead of a fixed high-level floor',()=>{
  const definitions=new Map(profiles.definitions().map(boss=>[boss.id,boss]));
  for(const boss of profiles.definitions()){
    const original=profiles.build(boss.id,'original').team;
    const enhanced=profiles.build(boss.id,'enhanced').team;
    const extreme=profiles.build(boss.id,'extreme').team;
    const authored=[...boss.original,...boss.reserve];
    for(let i=0;i<authored.length;i++){
      const base=authored[i][1];
      if(i<boss.original.length)assert.equal(original[i].level,base,`${boss.id} original stays at its source level`);
      if(i<enhanced.length)assert.equal(enhanced[i].level,base+2,`${boss.id} enhanced adds two levels`);
      if(i<extreme.length)assert.equal(extreme[i].level,base+6,`${boss.id} extreme adds six levels`);
    }
  }
  const lowPartyExtreme=profiles.build('brock','extreme',{partyLevel:14}).team;
  assert.deepEqual(lowPartyExtreme.slice(0,2).map(mon=>mon.level),[19,20],'original gym members use base+6 or party+5 without a fixed floor');
  assert.ok(lowPartyExtreme.every((mon,index)=>mon.level===Math.max([...definitions.get('brock').original,...definitions.get('brock').reserve][index][1]+6,19)));
  assert.equal(definitions.size,18);
});
