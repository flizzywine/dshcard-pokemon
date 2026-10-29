'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const cosmetics=require('../cosmetics.cjs'),mvu=require('../mvu.cjs'),rewards=require('../public/data/ordinary-effects.json');
test('ordinary reward conditions, acquisition and all four saved timings survive an MVU round trip',()=>{
 assert.equal(rewards.length,13);
 for(const reward of rewards){
  let variables=mvu.createInitialMvu(4),world=structuredClone(variables.stat_data.宝可梦);world.遭遇=null;world.战斗.状态='finished';world.剧情.初始御三家已选=true;
  const item=cosmetics.definitions().find(row=>row.effect.particleId===reward.id),before=structuredClone(world.队伍),money=world.训练家.金钱;
  world.委托.深度记录={'oak-open-field':{status:'completed'}};
  assert.throws(()=>cosmetics.apply(world,'acquire',{id:item.id}));
  if(reward.quest)world.委托.深度记录[reward.quest]={status:'completed'};
  if(reward.story)world.剧情.关都事件={进度:{[reward.story]:{完成:true}}};
  if(reward.trust)world.羁绊.伙伴.starter={信赖:reward.trust};
  world=cosmetics.apply(world,'acquire',{id:item.id});assert.equal(world.训练家.金钱,money,'quest souvenirs are free');assert.deepEqual(world.队伍,before);
  for(const [n,slot]of ['entry','move','aura','outcome'].entries())world=cosmetics.apply(world,'configure',{id:item.id,uid:'starter',slot,parameters:{scale:1.4,speed:1.2,particleCount:24,seed:17,opacity:.35+n*.1,layer:n%2?'front':'back'}});
  // Validate the actual saved cosmetic fields, without persisting the abbreviated
  // quest-completion stubs used above solely to exercise reward eligibility.
  variables.stat_data.宝可梦.外观=world.外观;variables=mvu.ensureMvuDefaults(JSON.parse(JSON.stringify(variables)));assert.equal(mvu.validateMvu(variables),true);
  const view=cosmetics.view(variables.stat_data.宝可梦);for(const slot of ['entry','move','aura','outcome']){assert.equal(view.equipped.伙伴.starter[slot],item.id);assert.equal(view.parameters.starter[slot].scale,1.4);}
  world=cosmetics.apply(world,'clear',{uid:'starter'});assert.ok(Object.values(world.外观.已装备.伙伴.starter).every(id=>id===''));
 }
});
test('retired companion and sparkle decorations disappear without altering actual shiny Pokémon',()=>{
 const variables=mvu.createInitialMvu(4),world=variables.stat_data.宝可梦;world.队伍[0].闪光=true;world.战斗.状态='finished';
 const retired=cosmetics.definitions().filter(row=>row.retired);assert.equal(retired.length,27);world.外观.已拥有=retired.map(row=>row.id);world.外观.已装备.伙伴.starter={aura:retired[0].id};
 const view=cosmetics.view(world);assert.ok(view.catalog.every(row=>!row.retired));assert.ok(view.particleDirectory.every(row=>!row.retired));assert.equal(view.inventory.length,0);assert.equal(view.party[0].shiny,true);assert.equal(view.equipped.伙伴.starter.aura,undefined);
 assert.equal(world.外观.已装备.伙伴.starter.aura,retired[0].id,'view remains read only');assert.throws(()=>cosmetics.apply(world,'equip',{uid:'starter',id:retired[0].id}),/已下架/);
});
