'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {KantoGame}=require('../engine.cjs');
const mvu=require('../mvu.cjs');
const items=require('../public/data/items.json');
const root=v=>v.stat_data.宝可梦;
const player=v=>root(v).队伍[0];
function start(flute,{team,opponent,mode='practice'}={}){
 const game=new KantoGame(),snapshot=game.start({mode,team,opponent,bag:{[flute]:1},seed:[71,72,73,74]});
 return{game,snapshot,record:game.battles.get(snapshot.id)};
}

test('FRLG glass flutes are reusable battle items with only Blue Flute available outside battle',()=>{
 const byId=new Map(items.map(item=>[item.id,item]));
 for(const [id,price] of [['blueflute',100],['yellowflute',200],['redflute',300]]){
  const item=byId.get(id);assert.ok(item);assert.equal(item.reusable,true);assert.equal(item.category,'battle');assert.equal(item.price,price);assert.equal(item.image,undefined);
 }
 assert.deepEqual(byId.get('blueflute').outside,{status:['slp']});
 assert.equal(byId.get('yellowflute').outside,null);assert.equal(byId.get('redflute').outside,null);
});

test('Blue Flute repeatedly cures field and battle sleep without spending the item',()=>{
 let variables=mvu.createInitialMvu();root(variables).背包.物品.blueflute=1;player(variables).状态='slp';
 let next=mvu.useItem(variables,'blueflute',player(variables).uid);
 assert.equal(player(next).状态,'');assert.equal(root(next).背包.物品.blueflute,1);
 variables=mvu.createInitialMvu();root(variables).背包.物品.blueflute=1;
 assert.throws(()=>mvu.useItem(variables,'blueflute',player(variables).uid),/没有效果/);assert.equal(root(variables).背包.物品.blueflute,1);
 const x=start('blueflute',{team:[{id:94,level:30,moves:['nightshade']}],opponent:[{id:16,level:5,moves:['tackle']}]});
 const mon=x.record.battle.p1.active[0];mon.setStatus('slp');
 let result=x.game.act({battleId:x.snapshot.id,choice:'item blueflute',enemyChoice:'move 1'});
 assert.ok(result.events.some(line=>line.includes('|-curestatus|p1a:')&&line.includes('|slp')));
 assert.ok(result.events.some(line=>line.startsWith('|move|p2a:')),'using the flute spends an effective battle action');
 assert.equal(result.sides[0].team[0].status,'');assert.equal(x.record.bag.blueflute,1);assert.equal(result.turn,2);
 mon.setStatus('slp');result=x.game.act({battleId:x.snapshot.id,choice:'item blueflute',enemyChoice:'move 1'});
 assert.equal(result.sides[0].team[0].status,'');assert.equal(x.record.bag.blueflute,1,'the same flute can be used again');assert.equal(result.turn,3);
});

test('Yellow Flute cures real confusion in battle and only advances/spends nothing when effective',()=>{
 const x=start('yellowflute',{team:[{id:94,level:30,moves:['nightshade']}],opponent:[{id:16,level:5,moves:['tackle']}]});
 const mon=x.record.battle.p1.active[0];assert.equal(mon.addVolatile('confusion'),true);
 let result=x.game.act({battleId:x.snapshot.id,choice:'item yellowflute',enemyChoice:'move 1'});
 assert.ok(result.events.some(line=>line.includes('|-end|p1a:')&&line.includes('|Confusion|[from] item: 黄色玻璃哨')));
 assert.ok(!result.sides[0].team[0].volatiles.includes('confusion'));
 assert.ok(result.events.some(line=>line.startsWith('|move|p2a:')));assert.equal(result.turn,2);assert.equal(x.record.bag.yellowflute,1);
 const turn=x.record.battle.turn,logLength=x.record.battle.log.length;
 assert.throws(()=>x.game.act({battleId:x.snapshot.id,choice:'item yellowflute',enemyChoice:'move 1'}),/没有这种战斗状态/);
 assert.equal(x.record.battle.turn,turn);assert.equal(x.record.battle.log.length,logLength);assert.equal(x.record.bag.yellowflute,1);
});

test('Red Flute cures a compatible target’s actual Attract volatile and remains reusable',()=>{
 const x=start('redflute',{team:[{id:31,level:30,moves:['attract']}],opponent:[{id:34,level:30,moves:['doublekick']}]});
 const target=x.record.battle.p1.active[0],source=x.record.battle.p2.active[0];assert.equal(target.addVolatile('attract',source),true);
 const result=x.game.act({battleId:x.snapshot.id,choice:'item redflute',enemyChoice:'move 1'});
 assert.ok(result.events.some(line=>line.includes('|-end|p1a:')&&line.includes('|Attract|[from] item: 红色玻璃哨')));
 assert.ok(!result.sides[0].team[0].volatiles.includes('attract'));
 assert.ok(result.events.some(line=>line.startsWith('|move|p2a:')));assert.equal(result.turn,2);assert.equal(x.record.bag.redflute,1);
 assert.equal(target.addVolatile('attract',source),true);
 const repeated=x.game.act({battleId:x.snapshot.id,choice:'item redflute',enemyChoice:'move 1'});
 assert.ok(!repeated.sides[0].team[0].volatiles.includes('attract'));assert.equal(repeated.turn,3);assert.equal(x.record.bag.redflute,1);
});

test('Yellow and Red Flutes reject field use without spending their inventory slots',()=>{
 for(const id of ['yellowflute','redflute']){
  const variables=mvu.createInitialMvu();root(variables).背包.物品[id]=1;
  assert.throws(()=>mvu.useItem(variables,id,player(variables).uid),/不能在战斗外使用/);assert.equal(root(variables).背包.物品[id],1);
 }
});

