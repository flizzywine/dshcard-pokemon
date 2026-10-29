'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const mvu=require('../mvu.cjs');
const classicServices=require('../classic-services.cjs');
const tileWorld=require('../tile-world.cjs');
const cosmetics=require('../cosmetics.cjs');
const rocketEvents=require('../rocket-boss-events.cjs');

test('MVU migration and live views preserve classic services, tile world, cosmetics and Rocket event state',()=>{
 const variables=mvu.createInitialMvu(7),world=variables.stat_data.宝可梦;
 world.战斗={轮次:world.地图.轮次,状态:'finished',结果:'',摘要:'',操作序号:0,奖励:{经验:[],金币:0,物品:[],徽章:[]}};
 variables.stat_data.other={keep:true};
 world.训练家.徽章=['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章'];
 world.地图.节点='route5';
 const services=classicServices.apply(world,'classic-daycare-unlock-double',{}, {storyTurn:2});
 assert.equal(services.经典设施.daycare.mode,'double');
 assert.equal(services.经典设施.revision,1);
 Object.assign(world,services);
 world.地图.节点='pallet';
 const moved=tileWorld.apply(world,'move',{direction:'up'},{storyTurn:3});
 assert.equal(moved.result.ok,true);
 Object.assign(world,moved.world);
 world.地图.节点=rocketEvents.EVENTS[0].node;
 const cosmetic=cosmetics.apply(world,'cosmetic-acquire',{id:'kfx-002'},{storyTurn:4});
 assert.ok(cosmetic.外观.已拥有.includes('kfx-002'));
 Object.assign(world,cosmetic);
 world.剧情.火箭队剧情.flags.auditFlag=true;

 const normalized=mvu.ensureMvuDefaults(JSON.parse(JSON.stringify(variables)));
 mvu.recalculateDerived(normalized);
 assert.equal(mvu.validateMvu(normalized),true);
 assert.equal(normalized.stat_data.other.keep,true);
 const view=mvu.worldView(normalized,{storyTurn:4,includeTileWorld:true});
 assert.equal(view.classicServices.daycare.mode,'double');
 assert.ok(view.tileWorld.position);
 assert.ok(view.cosmetics.inventory.some(item=>item.id==='kfx-002'));
 assert.ok(view.rocketEvents.some(event=>event.id));
 assert.equal(view.world.剧情.火箭队剧情.flags.auditFlag,true);
 assert.equal(classicServices.validate(normalized.stat_data.宝可梦),true);
 assert.equal(tileWorld.validate(normalized.stat_data.宝可梦).ok,true);
 assert.equal(cosmetics.validate(normalized.stat_data.宝可梦),true);
 assert.equal(rocketEvents.validate(normalized.stat_data.宝可梦),true);
});

test('double-battle session serialization restores remaining trainer inventory and NPC item policy',()=>{
 const {KantoGame}=require('../engine.cjs');
 const {serializeSession,restoreSession}=require('../index.mjs').__hostInternals;
 const game=new KantoGame();
 const snapshot=game.start({
  team:[{id:1},{id:4}],opponent:[{id:129,moves:['splash']},{id:129,moves:['splash']}],
  mode:'practice',doubleBattle:true,seed:[1,2,3,4],bag:{potion:2},trainerItems:{potion:2,superpotion:1},
  itemPolicy:{maxUses:3,allowed:['potion','superpotion']},
 });
 const record=game.battles.get(snapshot.id);
 record.battle.p1.active[0].hp-=20;
 game.act({battleId:snapshot.id,choice:'item potion 1, move 1 +1'});
 assert.equal(record.bag.potion,1,'the double item action spends the shared battle inventory');
 record.opponentBag.potion--;
 record.trainerItemUses=1;
 const saved=serializeSession({game,record,seq:5},{turn:12,textVersion:'double-turn-v1'},mvu.createInitialMvu(1));
 assert.equal(saved.doubleBattle,true);
 assert.equal(saved.bag.potion,1);
 assert.deepEqual(saved.opponentBag,{potion:1,superpotion:1});
 const restored=restoreSession(JSON.parse(JSON.stringify(saved)));
 assert.equal(restored.record.doubleBattle,true);
 assert.equal(restored.record.bag.potion,1,'the post-item player inventory survives the battle save roundtrip');
 assert.deepEqual(restored.record.opponentBag,{potion:1,superpotion:1});
 assert.deepEqual(restored.record.itemPolicy,{maxUses:3,allowed:['potion','superpotion']});
 assert.equal(restored.record.trainerItemUses,1);
 assert.equal(restored.seq,5);
});
