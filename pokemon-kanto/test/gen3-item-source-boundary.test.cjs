'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const items=require('../public/data/items.json');
const audit=require('../public/data/gen3-item-audit.json');
const facilities=require('../city-facilities.cjs');
const mvu=require('../mvu.cjs');
const party=require('../party.cjs');

test('cartridge source boundary excludes removed historical items and all held rows have real Gen III source IDs',()=>{
 assert.equal(audit.sourceRows,375);assert.equal(audit.source.commit,'ce6406d8c2eaf46d543c8a2606de0c3cb1951982');
 const sourceIds=new Set(audit.items.map(row=>row.id));
 for(const item of items.filter(row=>row.category==='held'))assert.ok(sourceIds.has(item.id),`${item.id} is a real FRLG item`);
 assert.ok(audit.items.some(row=>row.coverage==='not-implemented'),'the audit does not claim the whole cartridge is done');
 for(const id of ['berry','goldberry','pinkbow','polkadotbow','berserkgene'])assert.ok(!items.some(row=>row.id===id));
});

test('source trade materials can be carried without promising unsupported non-Kanto evolution',()=>{
 for(const itemId of ['dragonscale','upgrade']){
  let v=mvu.createInitialMvu();v.stat_data.宝可梦.背包.物品[itemId]=1;
  v=party.holdItem(v,'starter',itemId);assert.equal(v.stat_data.宝可梦.队伍[0].携带道具,itemId);
  assert.match(items.find(row=>row.id===itemId).description,/不开放/);assert.equal(mvu.validateMvu(v),true);
 }
});

test('Game Corner Yellow Flute redemption creates one reusable confusion cure for the original 1600-coin cost',()=>{
 const variables=mvu.chooseStarter(mvu.createInitialMvu(),1),w=variables.stat_data.宝可梦;
 w.地图.节点='celadon';w.地图.地点='玉虹市';w.战斗={状态:'finished'};w.遭遇=null;
 w.城市设施.gameCorner={coinCase:true,coins:1600};const revision=facilities.view(w).revision;
 const next=facilities.apply(w,'facility-claim-prize',{itemId:'yellowflute',revision},{storyTurn:20});
 assert.equal(next.背包.物品.yellowflute,1);assert.equal(next.城市设施.gameCorner.coins,0);assert.equal(items.find(row=>row.id==='yellowflute').reusable,true);
});
