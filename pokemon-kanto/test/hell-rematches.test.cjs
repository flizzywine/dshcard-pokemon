'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const mvu=require('../mvu.cjs'),hell=require('../hell-challenges.cjs'),{KantoGame}=require('../engine.cjs');
function ready(node='pewter'){
 const v=mvu.createInitialMvu(4),w=v.stat_data.宝可梦;w.剧情.初始御三家已选=true;w.地图.节点=node;w.地图.地点=node;w.遭遇=null;w.战斗={轮次:1,状态:'finished',结果:'',摘要:'',操作序号:0};w.设置.战后补给=false;return v;
}
function win(v){const g=new KantoGame(),s=mvu.startFromMvu(g,v),r=g.battles.get(s.id);for(const mon of r.battle.p2.pokemon){mon.hp=0;mon.fainted=true;}r.battle.win('p1');return mvu.applyBattleResult(v,r);}
test('a special Hell battle requires an earlier clear and cannot bypass the gate through the battle route',()=>{
 const v=ready(),w=v.stat_data.宝可梦;w.设置.对手难度='hell';const before=structuredClone(v);
 assert.throws(()=>mvu.theaterAction(v,'challenge-gym',{gym:0}),/先在其他难度/);assert.deepEqual(v,before);
 assert.throws(()=>mvu.theaterAction(v,'hell-rematch',{key:'brock'}),/先在其他难度|当前场景/);
 w.遭遇={类型:'gym',训练家:'小刚',道馆:0,队伍:[mvu.makeMon(74,12,'gate')]};w.战斗.状态='pending';const game=new KantoGame();
 assert.throws(()=>mvu.startFromMvu(game,v),/先在其他难度/);assert.equal(game.battles.size,0);
});
test('a normal clear unlocks repeatable adaptive Hell rematches while the unique reward is granted once',()=>{
 let v=win(mvu.theaterAction(ready(),'challenge-gym',{gym:0})),w=v.stat_data.宝可梦;assert.ok(w.训练家.徽章.includes('岩石徽章'));w.设置.对手难度='hell';
 assert.ok(mvu.theaterView(v).theater.options.some(o=>o.id==='hell-rematch'&&o.enabled&&o.payload.key==='brock'));
 const firstLevel=w.队伍[0].等级;v=win(mvu.theaterAction(v,'hell-rematch',{key:'brock'}));w=v.stat_data.宝可梦;
 assert.equal(w.外观.已拥有.filter(id=>id==='hell-brock').length,1);assert.equal(w.背包.物品.masterball,1);assert.equal(w.训练家.徽章.length,1);
 assert.equal(w.遭遇.队伍.length,6);assert.ok(w.遭遇.队伍.every(mon=>mon.等级===firstLevel));
 w.队伍[0]=mvu.makeMon(4,23,'starter');v=mvu.theaterAction(v,'hell-rematch',{key:'brock'});const g=new KantoGame(),s=mvu.startFromMvu(g,v),r=g.battles.get(s.id);
 assert.ok(v.stat_data.宝可梦.遭遇.队伍.every(mon=>mon.等级===23&&mon.突破.iv===63));r.battle.win('p1');v=mvu.applyBattleResult(v,r);w=v.stat_data.宝可梦;
 assert.equal(w.外观.已拥有.filter(id=>id==='hell-brock').length,1);assert.equal(w.背包.物品.masterball,1);assert.equal(w.战斗.奖励.外观,undefined);assert.equal(w.训练家.徽章.length,1);
 assert.ok(mvu.theaterView(v).theater.options.some(o=>o.id==='hell-rematch'&&o.enabled));
});
test('all 23 existing special first-win rewards have a local rematch and retain old earned unlocks',()=>{
 const definitions=hell.definitions();assert.equal(definitions.length,23);assert.equal(new Set(definitions.map(row=>row.key)).size,23);
 for(const row of definitions){let v=ready(row.location),w=v.stat_data.宝可梦;w.设置.对手难度='hell';w.外观.已拥有.push('hell-'+row.key.replaceAll('_','-'));assert.ok(hell.options(w).some(o=>o.payload.key===row.key&&o.enabled),row.key);
  v=mvu.theaterAction(v,'hell-rematch',{key:row.key});const g=new KantoGame(),s=mvu.startFromMvu(g,v);assert.ok(s.id,row.key);assert.ok(v.stat_data.宝可梦.遭遇.队伍.every(mon=>mon.等级===5),row.key);g.battles.get(s.id).battle.destroy();
 }
 const v=ready('pallet');v.stat_data.宝可梦.设置.对手难度='hell';assert.throws(()=>mvu.theaterAction(v,'hell-rematch',{key:'brock'}),/所在地|当前场景/);
});
test('league rematches preserve completed league progress',()=>{
 let v=ready('indigo'),w=v.stat_data.宝可梦;w.剧情.联盟进度=5;w.设置.对手难度='hell';v=win(mvu.theaterAction(v,'hell-rematch',{key:'lorelei'}));assert.equal(v.stat_data.宝可梦.剧情.联盟进度,5);
});
