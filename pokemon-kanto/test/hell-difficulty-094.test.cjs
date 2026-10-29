'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {KantoGame}=require('../engine.cjs'),mvu=require('../mvu.cjs'),balance=require('../encounter-balance.cjs'),overcap=require('../npc-overcap.cjs');
const {chooseEnemyChoice}=require('../opponent-ai.cjs');
function world(difficulty){const v=mvu.createInitialMvu(),w=v.stat_data.宝可梦;w.剧情.初始御三家已选=true;w.设置.对手难度=difficulty;w.遭遇={类型:'trainer',训练家:'测试训练家',队伍:[mvu.makeMon(130,12,'hell-foe')]};w.战斗.状态='pending';return {...v,stat_data:{...v.stat_data,宝可梦:balance.applyEncounterDifficulty(w)}};}
test('expert replaces the former hell training and may exceed the player cap; hell has explicit NPC-only raw values',()=>{
 const expert=world('expert'),hell=world('hell'),e=expert.stat_data.宝可梦.遭遇.队伍[0],h=hell.stat_data.宝可梦.遭遇.队伍[0];
 assert.ok(e.等级>=18);assert.ok(Object.values(e.个体值).every(n=>n===31));assert.ok(Object.values(e.努力值).reduce((a,b)=>a+b)>=504);
 assert.equal(h.等级,hell.stat_data.宝可梦.队伍[0].等级);assert.deepEqual(h.突破,overcap.profile);assert.ok(h.能力值.hp>mvu.stats(h).hp);
 assert.doesNotThrow(()=>mvu.validateMvu(hell));const recalculated=mvu.recalculateDerived(hell);assert.deepEqual(recalculated.stat_data.宝可梦.遭遇.队伍[0].能力值,h.能力值);
 const game=new KantoGame(),snapshot=mvu.startFromMvu(game,hell),foe=snapshot.sides[1].team[0];assert.deepEqual(foe.overcap,overcap.profile);assert.equal(foe.maxhp,h.能力值.hp);assert.equal(foe.hp,foe.maxhp);
 assert.equal(snapshot.sides[0].team[0].overcap,undefined);assert.equal(hell.stat_data.宝可梦.遭遇.itemInventory.fullrestore,3);
 const {Battle}=require('../engine.cjs'),record=game.battles.get(snapshot.id),restored=Battle.fromJSON(record.battle.toJSON());assert.equal(game.snapshot({...record,battle:restored}).sides[1].team[0].maxhp,foe.maxhp);restored.destroy();
 const invalid=structuredClone(hell);invalid.stat_data.宝可梦.队伍[0].突破={...overcap.profile};assert.throws(()=>mvu.validateMvu(invalid),/仅限/);
 const finished=structuredClone(hell);finished.stat_data.宝可梦.战斗.状态='finished';finished.stat_data.宝可梦.设置.对手难度='normal';assert.doesNotThrow(()=>mvu.validateMvu(mvu.recalculateDerived(finished)),'historical hell opponents remain valid after selecting a different next-battle difficulty');
});
test('wild hell encounters retain capturable legal growth rather than the NPC breakthrough',()=>{
 const v=world('hell'),w=v.stat_data.宝可梦;w.遭遇={类型:'wild',训练家:'野生宝可梦',队伍:[mvu.makeMon(25,5,'wild-hell')]};
 const next=balance.applyEncounterDifficulty(w),mon=next.遭遇.队伍[0];assert.equal(mon.突破,undefined);assert.ok(Object.values(mon.个体值).every(iv=>iv<=31));
 const g=new KantoGame(),s=g.start({difficulty:'hell',mode:'wild',team:[{id:1}],opponent:[{id:25}]});assert.equal(s.sides[1].team[0].overcap,undefined);
});
test('hell reads the actual queued move and simulates replies without consuming live randomness',()=>{
 function run(slot){const game=new KantoGame(),s=game.start({difficulty:'hell',seed:[1,2,3,4],team:[{id:151,moves:['thunderbolt','surf']}],opponent:[{id:130,moves:['earthquake']},{id:51,moves:['earthquake']}]});const b=game.battles.get(s.id).battle;assert.equal(b.choose('p1','move '+slot),true);const before=JSON.stringify(b.toJSON());const selected=chooseEnemyChoice(b,{difficulty:'hell'});assert.equal(JSON.stringify(b.toJSON()),before,'lookahead cannot mutate the live battle, PP, HP, choices, or RNG');assert.equal(selected.source,'hell-oracle');return selected.choice;}
 assert.equal(run(1),'switch 2','Dugtrio can absorb the already submitted electric attack');assert.equal(run(2),'move 1','the same team stays in against resisted Surf');
});

test('hell first win grants one persistent equipable cosmetic based on battle difficulty',()=>{
 const cosmetics=require('../cosmetics.cjs'),id='hell-rival';
 function battle(difficulty,result,changeTo){const v=world(difficulty);v.stat_data.宝可梦.遭遇.训练家='小茂';v.stat_data.宝可梦.剧情.首次击败小茂=true;const g=new KantoGame(),s=mvu.startFromMvu(g,v),record=g.battles.get(s.id);v.stat_data.宝可梦.设置.对手难度=changeTo;record.battle.win(result==='win'?'p1':'p2');return {next:mvu.applyBattleResult(v,record),record};}
 const normal=battle('normal','win','hell');assert.ok(!normal.next.stat_data.宝可梦.外观.已拥有.includes(id));
 assert.throws(()=>cosmetics.apply(normal.next.stat_data.宝可梦,'acquire',{id}),/地狱难度/);
 const loss=battle('hell','lose','hell');assert.ok(!loss.next.stat_data.宝可梦.外观.已拥有.includes(id));
 const won=battle('hell','win','normal'),w=won.next.stat_data.宝可梦;assert.ok(w.外观.已拥有.includes(id));assert.equal(w.战斗.奖励.外观[0].id,id);
 assert.equal(cosmetics.view(w).catalog.find(x=>x.id===id).owned,true);
 const equipped=cosmetics.apply(w,'equip',{id,uid:w.队伍[0].uid});assert.equal(equipped.外观.已装备.伙伴[w.队伍[0].uid].aura,id);
 const replay=mvu.applyBattleResult(won.next,won.record).stat_data.宝可梦;assert.equal(replay.外观.已拥有.filter(x=>x===id).length,1);
 assert.equal(cosmetics.ensure(structuredClone(w)).外观.已拥有.filter(x=>x===id).length,1);
});

test('key encounters have independent hell first wins and ordinary opponents give none',()=>{
 const cosmetics=require('../cosmetics.cjs'),w=world('normal').stat_data.宝可梦;
 const encounters=[{类型:'gym',道馆:0},{类型:'gym',道馆:1},{类型:'trainer',联盟:0},{类型:'trainer',联盟:4},{类型:'trainer',训练家:'小茂'},{类型:'trainer',specialId:'rival-route22'},{类型:'trainer',specialId:'rocket-bridge'},{类型:'trainer',storyEventId:'rocket-celadon-ledger',bossProfileId:'apollo'}];
 const ids=encounters.map(e=>cosmetics.awardHellFirstWin(w,e).id);
 assert.deepEqual(ids,['hell-brock','hell-misty','hell-lorelei','hell-champion','hell-rival','hell-rival-route22','hell-rocket-bridge','hell-apollo']);
 assert.equal(cosmetics.awardHellFirstWin(w,encounters[0]),null);assert.equal(cosmetics.awardHellFirstWin(w,{类型:'trainer',训练家:'路人'}),null);
 const saved=cosmetics.ensure(JSON.parse(JSON.stringify(w)));cosmetics.validate(saved);assert.ok(ids.every(id=>saved.外观.已拥有.includes(id)));
});

test('legacy ordinary wins do not consume individual hell rewards and all palettes are distinct',()=>{
 const cosmetics=require('../cosmetics.cjs'),w=world('normal').stat_data.宝可梦;
 w.训练家.徽章.push('岩石徽章');w.外观.首领胜利.push('brock');
 const reward=cosmetics.awardHellFirstWin(w,{类型:'gym',道馆:0,bossProfileId:'brock'});
 assert.equal(reward.id,'hell-brock');
 const hell=cosmetics.definitions().filter(item=>item.unlock.kind==='hell-first-win');
 assert.equal(hell.length,23);assert.equal(new Set(hell.map(item=>item.effect.colors.join(','))).size,23);
});
