'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const mvu=require('../mvu.cjs');
const cosmetics=require('../cosmetics.cjs');

const rewards=[
 {id:'original-windchime',story:'vermilion-butterfree-migration'},
 {id:'original-ferntrail',story:'yellow-forest-listening'},
 {id:'original-clockwork',quest:'ash-silph-rescue'}
];

test('new ordinary story effects require their own evidence and preserve party and money',()=>{
 for(const reward of rewards){
  const world=mvu.createInitialMvu(4).stat_data.宝可梦;
  world.战斗.状态='finished';world.遭遇=null;
  const before=structuredClone(world.队伍),money=world.训练家.金钱;
  const item=cosmetics.view(world).catalog.find(row=>row.id===reward.id);
  assert.ok(item);
  assert.ok(item.unlockReason);
  assert.equal(item.owned,false);
  assert.throws(()=>cosmetics.apply(world,'acquire',{id:reward.id}),/需要完成/);
  world.剧情.关都事件={进度:{'bill-lighthouse-unknown':{完成:true}}};
  world.委托.深度记录={'oak-open-field':{status:'completed'}};
  assert.throws(()=>cosmetics.apply(world,'acquire',{id:reward.id}),/需要完成/,'unrelated achievements cannot unlock it');
  if(reward.story)world.剧情.关都事件.进度[reward.story]={完成:true};
  if(reward.quest)world.委托.深度记录[reward.quest]={status:'completed'};
  const after=cosmetics.apply(world,'acquire',{id:reward.id});
  assert.ok(after.外观.已拥有.includes(reward.id));
  assert.equal(after.训练家.金钱,money);
  assert.deepEqual(after.队伍,before);
  assert.throws(()=>cosmetics.apply(after,'acquire',{id:reward.id}),/已经拥有/);
  for(const slot of ['entry','move','aura','outcome']){
   const equipped=cosmetics.apply(after,'equip',{id:reward.id,slot,uid:'starter'});
   assert.equal(equipped.外观.已装备.伙伴.starter[slot],reward.id);
  }
 }
});

test('the three ordinary rewards have distinct identities, motion forms and acquisition text',()=>{
 const world=mvu.createInitialMvu(4).stat_data.宝可梦;
 const entries=cosmetics.view(world).catalog.filter(row=>rewards.some(reward=>reward.id===row.id));
 assert.equal(entries.length,3);
 assert.equal(new Set(entries.map(row=>row.effect.particleId)).size,3);
 assert.equal(new Set(entries.map(row=>row.effect.form)).size,3);
 assert.ok(entries.every(row=>row.cost.money===0&&row.acquisition.includes('完成')));
 assert.ok(entries.every(row=>!row.effect.prestige));
});
