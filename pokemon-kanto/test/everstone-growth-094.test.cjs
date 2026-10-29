const test=require('node:test'),assert=require('node:assert/strict');
const mvu=require('../mvu.cjs'),party=require('../party.cjs'),{KantoGame,Battle}=require('../engine.cjs');
const world=v=>v.stat_data.宝可梦;
test('Everstone prevents level evolution without suppressing level moves, then removal enables evolution',()=>{
 let v=mvu.chooseStarter(mvu.createInitialMvu(),4),w=world(v),mon=mvu.makeMon(4,15,'held-stone');w.队伍=[mon];w.背包.物品.everstone=1;
 v=party.holdItem(v,mon.uid,'everstone');mon=world(v).队伍[0];
 mvu.grantLevel(mon,40);assert.equal(mon.等级,16);assert.equal(mon.图鉴编号,4);mvu.validateMvu(v);
 v=party.takeHeldItem(v,mon.uid);mon=world(v).队伍[0];mvu.grantLevel(mon,40);assert.equal(mon.图鉴编号,4);v=party.confirmEvolution(v,mon.uid,mon.待进化[0].id);assert.equal(world(v).队伍[0].图鉴编号,5);assert.equal(world(v).背包.物品.everstone,1);
 const bulba=mvu.makeMon(1,12,'learn-with-stone');bulba.携带道具='everstone';mvu.grantLevel(bulba,40);assert.equal(bulba.图鉴编号,1);assert.ok(bulba.招式.some(x=>x.id==='vinewhip')||bulba.待学招式?.includes('vinewhip'));
});
test('Everstone blocks an evolution stone atomically and survives real battle serialization',()=>{
 let v=mvu.chooseStarter(mvu.createInitialMvu(),4),w=world(v),mon=mvu.makeMon(37,24,'stone-vulpix');w.队伍=[mon];w.背包.物品.everstone=1;w.背包.物品.firestone=1;
 v=party.holdItem(v,mon.uid,'everstone');const before=structuredClone(v);assert.throws(()=>party.evolvePokemon(v,mon.uid,'firestone'),/不变之石/);assert.deepEqual(v,before);
 w=world(v);w.遭遇={类型:'wild',训练家:'野生宝可梦',队伍:[mvu.makeMon(129,5,'stone-foe')]};w.战斗.状态='pending';
 const game=new KantoGame(),start=mvu.startFromMvu(game,v),record=game.battles.get(start.id);game.act({battleId:start.id,choice:'move 1',enemyChoice:'move 1'});
 v=mvu.applyBattleResult(v,record);assert.equal(world(v).队伍[0].携带道具,'everstone');assert.equal(mvu.validateMvu(v),true);
 const restored=Battle.fromJSON(JSON.parse(JSON.stringify(record.battle.toJSON())));assert.equal(restored.p1.pokemon[0].item,'everstone');restored.destroy();
});
test('Route 10 aide gives Everstone once at twenty caught species',()=>{
 const v=mvu.createInitialMvu(),w=world(v);w.地图.节点='route10';w.地图.地点='10号道路';w.战斗.状态='finished';w.遭遇=null;w.统计.捕获图鉴=Array.from({length:20},(_,i)=>i+1);
 const next=mvu.theaterAction(v,'claim-machine',{item:'everstone'});assert.equal(world(next).背包.物品.everstone,1);assert.throws(()=>mvu.theaterAction(next,'claim-machine',{item:'everstone'}),/不允许|已经领取/);
});
