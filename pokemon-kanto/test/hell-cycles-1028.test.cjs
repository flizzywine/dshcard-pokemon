'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const cosmetics=require('../cosmetics.cjs');
test('every hell challenger except the approved dragon has a dedicated twelve-pose profile',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/cosmetic-fx.js'),'utf8'),match=source.match(/const HELL_CYCLES=Object\.freeze\(([^;]+)\);/),profiles=JSON.parse(match[1]),hell=cosmetics.definitions().filter(item=>item.id.startsWith('hell-'));
 assert.equal(hell.length,23);assert.equal(Object.keys(profiles).length,22);assert.equal(new Set(Object.values(profiles).map(row=>row.file)).size,22);
 for(const item of hell){if(item.id==='hell-lance')continue;const p=profiles[item.id];assert.ok(p,item.id);assert.equal(p.cols*p.rows,12);assert.equal(p.frames,12);assert.match(p.file,new RegExp('^'+item.id+'\\.png$'));assert.match(p.poster,/-poster\.png$/);}
 assert.match(source,/atlases\.length>=6/);assert.match(source,/thumbnail\?'thumbnail':style/);
});
test('thematic normal rewards require the matching quest or story, not an unrelated completion count',()=>{
 let world={训练家:{金钱:50000,徽章:[]},队伍:[{uid:'partner',图鉴编号:4}],剧情:{},委托:{深度记录:{'oak-open-field':{status:'completed'},'ash-path-notes':{status:'completed'},'brock-stone-practice':{status:'completed'}}}};
 const lantern=cosmetics.definitions().find(item=>item.effect.particleId==='paper-lantern'),whale=cosmetics.definitions().find(item=>item.id==='original-starsea');
 assert.equal(lantern.unlock.id,'lavender-tower-lanterns');assert.equal(lantern.unlock.exact,true);assert.equal(lantern.cost.money,0);assert.throws(()=>cosmetics.apply(world,'acquire',{id:lantern.id}),/指定深度委托/);
 world.委托.深度记录[lantern.unlock.id]={status:'completed'};world=cosmetics.apply(world,'acquire',{id:lantern.id});assert.ok(world.外观.已拥有.includes(lantern.id));assert.match(cosmetics.view(world).catalog.find(row=>row.id===lantern.id).acquisition,/塔外的归途灯/);
 assert.throws(()=>cosmetics.apply(world,'acquire',{id:whale.id}),/雾灯之后的回声/);world.剧情.关都事件={进度:{'bill-lighthouse-unknown':{完成:true}}};world=cosmetics.apply(world,'acquire',{id:whale.id});assert.ok(world.外观.已拥有.includes(whale.id));
});
test('refining acquisition routes does not remove an already-owned normal effect',()=>{
 const item=cosmetics.definitions().find(row=>row.effect.particleId==='paper-lantern'),world={队伍:[{uid:'old',图鉴编号:4}],外观:{版本:1,已拥有:[item.id],已装备:{全局:{},伙伴:{old:{entry:item.id}}},首领胜利:[]}};
 cosmetics.ensure(world);assert.ok(world.外观.已拥有.includes(item.id));assert.equal(world.外观.已装备.伙伴.old.entry,item.id);assert.equal(cosmetics.validate(world),true);
});
