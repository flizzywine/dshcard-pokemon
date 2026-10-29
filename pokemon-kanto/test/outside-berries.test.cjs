'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const mvu=require('../mvu.cjs');
const items=[...require('../public/data/items.json'),...require('../public/data/field-items.json')];
const root=variables=>variables.stat_data.宝可梦;
const addItem=(variables,id,count=1)=>{root(variables).背包.物品[id]=count;return variables;};
const party=variables=>root(variables).队伍[0];

test('FRLG berries available from the bag expose only native field effects',()=>{
 const byId=new Map(items.map(item=>[item.id,item]));
 const expected={cheriberry:['par'],chestoberry:['slp'],pechaberry:['psn','tox'],rawstberry:['brn'],aspearberry:['frz'],lumberry:['brn','psn','tox','par','slp','frz']};
 for(const [id,status] of Object.entries(expected))assert.deepEqual(byId.get(id).outside,{status});
 assert.deepEqual(byId.get('oranberry').outside,{heal:10});assert.deepEqual(byId.get('sitrusberry').outside,{heal:30});assert.deepEqual(byId.get('leppaberry').outside,{pp:10});
 assert.equal(byId.get('persimberry').outside,null,'FRLG has no persistent field confusion for Persim Berry to cure');
 for(const id of ['pomegberry','kelpsyberry','qualotberry','hondewberry','grepaberry'])assert.equal(byId.get(id).outside,null,`${id} does not get a later-game EV reduction effect`);
});

test('status berries cure only the matching field status and do not consume on a no-op',()=>{
 for(const [item,status] of [['cheriberry','par'],['chestoberry','slp'],['pechaberry','tox'],['rawstberry','brn'],['aspearberry','frz'],['lumberry','psn']]){
  let variables=addItem(mvu.createInitialMvu(),item),mon=party(variables);mon.状态=status;
  const next=mvu.useItem(variables,item,mon.uid);
  assert.equal(party(next).状态,'',item+' cures its FRLG field status');assert.equal(root(next).背包.物品[item],0);
 }
 let variables=addItem(mvu.createInitialMvu(),'cheriberry'),mon=party(variables);mon.状态='brn';
 assert.throws(()=>mvu.useItem(variables,'cheriberry',mon.uid),/没有效果/);assert.equal(root(variables).背包.物品.cheriberry,1);
 variables=addItem(mvu.createInitialMvu(),'persimberry');mon=party(variables);mon.状态='';
 assert.throws(()=>mvu.useItem(variables,'persimberry',mon.uid),/不能在战斗外使用/);assert.equal(root(variables).背包.物品.persimberry,1);
});

test('Oran and Sitrus restore exact cartridge HP amounts, while max medicines fill HP',()=>{
 for(const [item,amount] of [['oranberry',10],['sitrusberry',30]]){
  const variables=addItem(mvu.createInitialMvu(),item),mon=party(variables);mon.等级=50;mon.能力值=mvu.stats(mon);const before=mon.能力值.hp-50;mon.当前HP=before;
  const next=mvu.useItem(variables,item,mon.uid);assert.equal(party(next).当前HP,before+amount,`${item} restores the native fixed amount without relying on HP capping`);assert.equal(root(next).背包.物品[item],0);
 }
 let variables=addItem(mvu.createInitialMvu(),'maxpotion'),mon=party(variables);mon.当前HP=1;
 let next=mvu.useItem(variables,'maxpotion',mon.uid);assert.equal(party(next).当前HP,party(next).能力值.hp);
 variables=addItem(mvu.createInitialMvu(),'fullrestore');mon=party(variables);mon.当前HP=1;mon.状态='brn';
 next=mvu.useItem(variables,'fullrestore',mon.uid);assert.equal(party(next).当前HP,party(next).能力值.hp);assert.equal(party(next).状态,'');
 assert.ok(items.find(item=>item.id==='maxpotion').price===2500);assert.ok(items.find(item=>item.id==='fullrestore').price===3000);
});

test('Leppa Berry restores only the selected Transform slot and leaves PP capped slots/items intact',()=>{
 let variables=addItem(mvu.createInitialMvu(),'leppaberry'),mon=party(variables);
 mon.图鉴编号=151;mon.昵称='梦幻';mon.特性='Synchronize';mon.招式=[{id:'pound',PP:8,PP上限:35},{id:'transform',PP:0,PP上限:10},{id:'megapunch',PP:19,PP上限:20}];mon.能力值=mvu.stats(mon);mon.当前HP=mon.能力值.hp;
 const next=mvu.useItem(variables,'leppaberry',mon.uid,{slot:2});
 assert.deepEqual(party(next).招式.map(move=>move.PP),[8,10,19]);assert.equal(root(next).背包.物品.leppaberry,0);
 variables=addItem(mvu.createInitialMvu(),'leppaberry');mon=party(variables);mon.招式[0].PP=mon.招式[0].PP上限;
 assert.throws(()=>mvu.useItem(variables,'leppaberry',mon.uid,{slot:1}),/达到该道具可恢复的上限/);assert.equal(root(variables).背包.物品.leppaberry,1);
});
