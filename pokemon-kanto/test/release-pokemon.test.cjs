'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const mvu=require('../mvu.cjs'),party=require('../party.cjs');
test('release requires confirmation and preserves a usable party',()=>{
 const v=mvu.createInitialMvu(4),w=v.stat_data.宝可梦;
 assert.throws(()=>party.releasePokemon(v,w.队伍[0].uid,false),/确认/);
 assert.throws(()=>party.releasePokemon(v,w.队伍[0].uid,true),/保留/);
 w.电脑.push(mvu.makeMon(16,3,'box-release'));
 const next=party.releasePokemon(v,'box-release',true);
 assert.equal(next.stat_data.宝可梦.电脑.length,0);
 assert.equal(w.电脑.length,1,'the input remains unchanged');
 assert.throws(()=>party.releasePokemon(next,'box-release',true),/没有/);
});
test('release protects eggs, held items and daycare deposits',()=>{
 const v=mvu.createInitialMvu(4),w=v.stat_data.宝可梦;
 const mon=mvu.makeMon(16,3,'protected');w.电脑.push(mon);
 mon.isEgg=true;assert.throws(()=>party.releasePokemon(v,mon.uid,true),/蛋/);
 delete mon.isEgg;mon.携带道具='oranberry';assert.throws(()=>party.releasePokemon(v,mon.uid,true),/道具/);
 mon.携带道具='';w.经典设施.daycare.parents=[mon.uid];assert.throws(()=>party.releasePokemon(v,mon.uid,true),/培育屋/);
});
