'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const mvu=require('../mvu.cjs');
const party=require('../party.cjs');
function fixture(){const v=mvu.createInitialMvu(4),w=v.stat_data.宝可梦;w.队伍=[mvu.makeMon(4,15,'evolve-one')];w.遭遇=null;w.战斗.状态='finished';return v;}
test('pending level evolution persists, cancels without losing growth and can be offered on a later level',()=>{
 let v=fixture(),mon=v.stat_data.宝可梦.队伍[0];
 mvu.grantLevel(mon,40);
 const pending=mon.待进化[0];
 assert.equal(mon.图鉴编号,4);assert.equal(mon.等级,16);
 v=JSON.parse(JSON.stringify(v));assert.equal(mvu.validateMvu(v),true);
 const before=structuredClone(v);
 v=party.cancelEvolution(v,mon.uid,pending.id);mon=v.stat_data.宝可梦.队伍[0];
 assert.equal(mon.图鉴编号,4);assert.equal(mon.等级,16);assert.equal(mon.待进化.length,0);
 assert.equal(before.stat_data.宝可梦.队伍[0].待进化.length,1);
 mvu.grantLevel(mon,40);assert.ok(mon.待进化.length);
 const nextId=mon.待进化[0].id;
 assert.throws(()=>party.confirmEvolution(v,mon.uid,pending.id),/事项已变化/);
 v=party.confirmEvolution(v,mon.uid,nextId);
 assert.equal(v.stat_data.宝可梦.队伍[0].图鉴编号,5);
 assert.throws(()=>party.confirmEvolution(v,mon.uid,nextId),/事项已变化/);
});
test('holding Everstone after an offer blocks confirmation atomically while cancellation remains available',()=>{
 let v=fixture(),mon=v.stat_data.宝可梦.队伍[0];mvu.grantLevel(mon,40);
 const id=mon.待进化[0].id;v.stat_data.宝可梦.背包.物品.everstone=1;
 v=party.holdItem(v,mon.uid,'everstone');const before=structuredClone(v);
 assert.throws(()=>party.confirmEvolution(v,mon.uid,id),/不变之石/);assert.deepEqual(v,before);
 assert.equal(party.cancelEvolution(v,mon.uid,id).stat_data.宝可梦.队伍[0].待进化.length,0);
});
