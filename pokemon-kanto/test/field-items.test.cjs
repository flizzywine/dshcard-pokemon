const test=require('node:test'),assert=require('node:assert/strict');
const mvu=require('../mvu.cjs'),{KantoGame}=require('../engine.cjs');
const root=v=>v.stat_data.宝可梦;
test('PP items target a move, PP Up preserves spent PP and cannot exceed three boosts',()=>{
 let v=mvu.createInitialMvu(),w=root(v),mon=w.队伍[0];w.背包.物品.ppup=4;w.背包.物品.ether=1;mon.招式[0].PP=1;
 const base=mon.招式[0].PP上限;
 assert.throws(()=>mvu.useItem(v,'ether',mon.uid),/招式/);assert.equal(w.背包.物品.ether,1);
 for(let i=0;i<3;i++)v=mvu.useItem(v,'ppup','starter',{slot:1});
 assert.equal(root(v).队伍[0].招式[0].PP上限,Math.floor(base*1.6));
 assert.equal(root(v).队伍[0].招式[0].PP,1+Math.floor(base*.6));
 assert.throws(()=>mvu.useItem(v,'ppup','starter',{slot:1}),/上限/);assert.equal(root(v).背包.物品.ppup,1);
});
test('Gen III vitamins stop at 100 per stat and 510 total without spending failed doses',()=>{
 let v=mvu.createInitialMvu();root(v).背包.物品.protein=20;
 for(let i=0;i<10;i++)v=mvu.useItem(v,'protein','starter');
 assert.equal(root(v).队伍[0].努力值.atk,100);assert.equal(root(v).背包.物品.protein,10);
 assert.throws(()=>mvu.useItem(v,'protein','starter'),/100/);
});
test('Rare Candy reuses level-up learning and evolution and respects the optional gym cap',()=>{
 let v=mvu.createInitialMvu(),w=root(v);w.设置.道馆等级上限=false;w.队伍[0]=mvu.makeMon(1,15,'starter');w.背包.物品.rarecandy=1;
 const result=root(mvu.useItem(v,'rarecandy','starter'));assert.equal(result.队伍[0].等级,16);assert.equal(result.队伍[0].图鉴编号,1);assert.equal(result.队伍[0].待进化[0].to,2);assert.equal(result.背包.物品.rarecandy,0);
 w.设置.道馆等级上限=true;assert.throws(()=>mvu.useItem(v,'rarecandy','starter'),/上限/);assert.equal(w.背包.物品.rarecandy,1);
});
test('Full Restore works at full HP with status and heals and cures together during battle',()=>{
 const v=mvu.createInitialMvu(),w=root(v);w.背包.物品.fullrestore=1;w.队伍[0].状态='par';const cured=root(mvu.useItem(v,'fullrestore','starter'));assert.equal(cured.队伍[0].状态,'');assert.equal(cured.背包.物品.fullrestore,0);
 const game=new KantoGame(),snap=game.start({team:[{id:25}],opponent:[{id:129,moves:['splash']}],bag:{fullrestore:1},seed:[1,2,3,4]});const mon=game.battles.get(snap.id).battle.p1.active[0];mon.hp-=10;mon.setStatus('par');game.act({battleId:snap.id,choice:'item fullrestore',enemyChoice:'move 1'});assert.equal(mon.hp,mon.maxhp);assert.equal(mon.status,'');
});
