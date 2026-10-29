'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),mvu=require('../mvu.cjs'),cosmetics=require('../cosmetics.cjs');
function fixture(){const v=mvu.createInitialMvu(4),w=v.stat_data.宝可梦;w.剧情.初始御三家已选=true;w.遭遇=null;w.战斗.状态='finished';w.队伍.push(mvu.makeMon(25,5,'pika'),mvu.makeMon(7,5,'squirtle'));w.电脑=[mvu.makeMon(16,5,'pc1'),mvu.makeMon(19,5,'pc2')];return v;}
test('workshop saves per-companion settings to MVU, exposes only the party and allows a complete opt out',()=>{
 const v=fixture(),w=v.stat_data.宝可梦,item=cosmetics.definitions().find(row=>!row.retired);w.外观.已拥有.push(item.id);w.外观.已装备.全局[item.slot]=item.id;
 const parameters={scale:1.6,speed:1.2,particleCount:38,seed:242,opacity:.35,layer:'front'};
 const saved=cosmetics.apply(w,'configure',{uid:'starter',id:item.id,parameters});assert.deepEqual(saved.外观.参数.starter[item.slot],{id:item.id,...parameters});assert.equal(w.外观.参数?.starter,undefined,'preview does not change authoritative state');
 assert.deepEqual(cosmetics.view(saved).party.map(mon=>mon.uid),['starter','pika','squirtle']);assert.equal(cosmetics.view(saved).parameters.starter[item.slot].opacity,.35);
 assert.throws(()=>cosmetics.apply(saved,'configure',{uid:'pc1',id:item.id,parameters}),/当前队伍/);assert.throws(()=>cosmetics.apply(saved,'equip',{uid:'pc1',id:item.id}),/当前队伍/);
 assert.throws(()=>cosmetics.apply(saved,'configure',{uid:'starter',id:item.id,parameters:{...parameters,opacity:2}}),/参数/);
 const empty=cosmetics.apply(saved,'clear',{uid:'starter'});assert.ok(Object.values(empty.外观.已装备.伙伴.starter).every(id=>id===''));assert.equal(empty.外观.参数.starter,undefined);assert.equal(empty.外观.已装备.全局[item.slot],item.id,'legacy global settings remain available to other companions');
 v.stat_data.宝可梦=empty;assert.equal(mvu.validateMvu(mvu.ensureMvuDefaults(v)),true);assert.equal(cosmetics.view(empty).equipped.伙伴.starter[item.slot],'');
});
test('bulk PC transfers are atomic, preserve identities and enforce both capacities',()=>{
 const v=fixture(),before=structuredClone(v);const deposited=mvu.moveBox(v,['pika','squirtle'],'deposit');assert.deepEqual(deposited.stat_data.宝可梦.队伍.map(mon=>mon.uid),['starter']);assert.equal(deposited.stat_data.宝可梦.电脑.length,4);assert.deepEqual(v,before);
 const withdrawn=mvu.moveBox(deposited,['pc1','pc2','pika'],'withdraw');assert.deepEqual(withdrawn.stat_data.宝可梦.队伍.map(mon=>mon.uid),['starter','pc1','pc2','pika']);
 assert.throws(()=>mvu.moveBox(v,['starter','pika','squirtle'],'deposit'),/至少保留/);assert.throws(()=>mvu.moveBox(v,['pc1','missing'],'withdraw'),/没有/);assert.throws(()=>mvu.moveBox(v,['pc1','pc1'],'withdraw'),/不同/);assert.deepEqual(v,before,'invalid batches never partially move a companion');
 const full=fixture();for(let n=0;n<3;n++)full.stat_data.宝可梦.队伍.push(mvu.makeMon(1,5,'party'+n));assert.throws(()=>mvu.moveBox(full,['pc1'],'withdraw'),/满员/);
 const crowded=fixture();crowded.stat_data.宝可梦.电脑=Array.from({length:420},(_,n)=>mvu.makeMon(16,5,'full'+n));assert.throws(()=>mvu.moveBox(crowded,['pika'],'deposit'),/420/);
});

test('one collected effect can be saved to entry or move independently and survives MVU validation',()=>{
 const v=fixture(),w=v.stat_data.宝可梦,item=cosmetics.definitions().find(row=>!row.retired);w.外观.已拥有.push(item.id);
 const parameters={scale:1,speed:1,particleCount:24,seed:12,opacity:.7,layer:'auto'};
 let saved=cosmetics.apply(w,'configure',{uid:'starter',id:item.id,slot:'entry',parameters});
 saved=cosmetics.apply(saved,'configure',{uid:'starter',id:item.id,slot:'move',parameters:{...parameters,opacity:.4}});
 assert.equal(saved.外观.已装备.伙伴.starter.entry,item.id);assert.equal(saved.外观.已装备.伙伴.starter.move,item.id);
 assert.equal(cosmetics.view(saved).parameters.starter.entry.opacity,.7);assert.equal(cosmetics.view(saved).parameters.starter.move.opacity,.4);
 v.stat_data.宝可梦=saved;assert.equal(mvu.validateMvu(mvu.ensureMvuDefaults(v)),true);
 assert.throws(()=>cosmetics.apply(saved,'equip',{uid:'starter',id:item.id,slot:'bad'}),/未知特效/);
 const off=cosmetics.apply(saved,'unequip',{uid:'starter',id:item.id,slot:'move'});assert.equal(off.外观.已装备.伙伴.starter.entry,item.id);assert.equal(off.外观.已装备.伙伴.starter.move,'');
});

test('full bond artwork is free but requires actual trust 100 and never modifies battle stats',()=>{
 const w=fixture().stat_data.宝可梦,item=cosmetics.definitions().find(item=>item.id==='kfx-160'),before=structuredClone(w.队伍);
 assert.equal(item.unlock.kind,'trust');assert.equal(item.unlock.count,100);assert.equal(item.cost.money,0);
 w.羁绊={伙伴:{starter:{信赖:99}}};assert.throws(()=>cosmetics.apply(w,'acquire',{id:item.id}),/信赖/);
 w.羁绊.伙伴.starter.信赖=100;const next=cosmetics.apply(w,'acquire',{id:item.id});assert.ok(next.外观.已拥有.includes(item.id));assert.deepEqual(next.队伍,before);
});
