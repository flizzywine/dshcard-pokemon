'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {Dex}=require('../vendor/showdown/sim/dex.js');
const {catalog,KantoGame}=require('../engine.cjs');
const mvu=require('../mvu.cjs');
const party=require('../party.cjs');
const data=require('../public/data/items.json');
const root=v=>v.stat_data.宝可梦;
const byId=new Map(data.map(item=>[item.id,item]));

test('held-item catalog covers every Generation III berry and supported combat item with explicit ruleset metadata',()=>{
 const dex=Dex.mod('gen3');
 const berries=dex.items.all().filter(item=>item.exists&&item.gen===3&&item.isBerry).map(item=>item.id);
 for(const id of berries){assert.equal(byId.get(id)?.category,'held',`${id} is held/equippable`);assert.equal(byId.get(id)?.generation,3);assert.equal(byId.get(id)?.ruleset,'pokemon-frlg');}
 const combatItems=dex.items.all().filter(item=>item.exists&&item.gen<=3&&item.isNonstandard!=='Past'&&item.effectType==='Item'&&!item.isPokeball&&!['mail','firestone','leafstone','moonstone','sunstone','thunderstone','waterstone','oldamber','clawfossil','domefossil','helixfossil','rootfossil','dragonscale','upgrade'].includes(item.id)).map(item=>item.id);
 for(const id of combatItems)assert.ok(byId.has(id),`${id} is represented in the catalog`);
 assert.equal(new Set(data.map(item=>item.id)).size,data.length,'item ids are unique');
 assert.equal(catalog.generation,3);
 for(const id of ['berry','goldberry','pinkbow','polkadotbow','berserkgene'])assert.ok(!byId.has(id),`${id} was removed before Gen III`);
});

test('new Gen III held items can be equipped, serialized into battle, and taken back safely',()=>{
 let variables=mvu.createInitialMvu(7),world=root(variables),mon=world.队伍[0];
 for(const id of ['lightball','machobrace','liechiberry','figyberry'])assert.ok(Object.hasOwn(world.背包.物品,id),`${id} gets an inventory slot`);
 world.背包.物品.lightball=1;
 variables=party.holdItem(variables,mon.uid,'lightball');
 assert.equal(root(variables).队伍[0].携带道具,'lightball');assert.equal(root(variables).背包.物品.lightball,0);
 const game=new KantoGame(),snapshot=mvu.startFromMvu(game,variables),record=game.battles.get(snapshot.id);
 assert.equal(record.battle.p1.pokemon[0].item,'lightball');
 variables=party.takeHeldItem(variables,mon.uid);
 assert.equal(root(variables).队伍[0].携带道具,'');assert.equal(root(variables).背包.物品.lightball,1);
});

test('Intimidate, Levitate, Volt Absorb, and Flash Fire run through the Gen III simulator',()=>{
 let game=new KantoGame(),s=game.start({team:[{id:130,ability:'Intimidate',level:50,moves:['tackle']}],opponent:[{id:16,level:40,moves:['tackle']}],seed:[1,2,3,4]});
 assert.ok(s.events.some(line=>line.includes('|-ability|p1a:')&&line.includes('Intimidate')));
 assert.ok(s.events.some(line=>line.includes('|-unboost|p2a:')&&line.includes('atk|1')));
 game=new KantoGame();s=game.start({team:[{id:94,ability:'Levitate',level:50,moves:['nightshade']}],opponent:[{id:130,level:40,moves:['earthquake']}],seed:[1,2,3,4]});
 let turn=game.act({battleId:s.id,choice:'move 1',enemyChoice:'move 1'});
 assert.ok(turn.events.some(line=>line.includes('|-immune|p1a:')));
 game=new KantoGame();s=game.start({team:[{id:135,ability:'Volt Absorb',level:50,moves:['quickattack']}],opponent:[{id:25,level:40,moves:['thunderbolt']}],seed:[1,2,3,4]});
 turn=game.act({battleId:s.id,choice:'move 1',enemyChoice:'move 1'});
 assert.ok(turn.events.some(line=>line.includes('|-immune|p1a:')&&line.includes('ability: Volt Absorb')));
 game=new KantoGame();s=game.start({team:[{id:59,ability:'Flash Fire',level:50,moves:['flamethrower']}],opponent:[{id:6,level:40,moves:['flamethrower']}],seed:[1,2,3,4]});
 turn=game.act({battleId:s.id,choice:'move 1',enemyChoice:'move 1'});
 assert.ok(turn.events.some(line=>line.includes('|-start|p1a:')&&line.includes('ability: Flash Fire')));
});



test('new species-specific items boost real damage and low-HP berries consume after their real trigger',()=>{
 const damage=item=>{const game=new KantoGame(),start=game.start({team:[{id:25,...(item?{item}:{}),level:30,moves:['thunderbolt']}],opponent:[{id:143,level:20,moves:['rest']}],seed:[41,42,43,44]});const result=game.act({battleId:start.id,choice:'move 1',enemyChoice:'move 1'});const event=result.events.find(line=>line.startsWith('|-damage|p2a:'));return Number(event.match(/\|(\d+)\/\d+/)?.[1]);};
 assert.ok(damage('lightball')<damage(''),"Light Ball boosts Pikachu's special attack in battle");
 const game=new KantoGame(),start=game.start({team:[{id:25,item:'liechiberry',level:50,moves:['thunderwave']}],opponent:[{id:16,level:5,moves:['tackle']}],seed:[1,2,3,4]}),record=game.battles.get(start.id),holder=record.battle.p1.active[0];
 holder.hp=Math.ceil(holder.maxhp*.27);
 const result=game.act({battleId:start.id,choice:'move 1',enemyChoice:'move 1'});
 assert.ok(result.events.some(line=>line.includes('|-enditem|p1a:')&&line.includes('Liechi Berry')&&line.includes('[eat]')));
 assert.ok(result.events.some(line=>line.includes('|-boost|p1a:')&&line.includes('atk|1')&&line.includes('Liechi Berry')));
 assert.equal(result.sides[0].team[0].heldItem,'','the consumed berry is absent from the returned battle snapshot');
});


test('Pressure, Guts, Serene Grace, and Natural Cure use live Gen III battle behavior',()=>{
 let game=new KantoGame(),start=game.start({team:[{id:25,level:50,moves:['thunderbolt']}],opponent:[{id:150,ability:'Pressure',level:40,moves:['psychic']}],seed:[1,2,3,4]});
 const ppBefore=start.sides[0].team[0].moves[0].pp;let turn=game.act({battleId:start.id,choice:'move 1',enemyChoice:'move 1'});
 assert.equal(turn.sides[0].team[0].moves[0].pp,ppBefore-2,'Pressure spends one extra PP when targeted');
 const machampDamage=burned=>{const battle=new KantoGame(),state=battle.start({team:[{id:68,ability:'Guts',level:30,moves:['bodyslam']}],opponent:[{id:143,level:100,moves:['rest']}],seed:[17,18,19,20]}),record=battle.battles.get(state.id);if(burned)record.battle.p1.active[0].setStatus('brn');const result=battle.act({battleId:state.id,choice:'move 1',enemyChoice:'move 1'}),event=result.events.find(line=>line.startsWith('|-damage|p2a:'));const hp=event.match(/\|(\d+)\/(\d+)/);return{damage:Number(hp[2])-Number(hp[1]),events:result.events};};
 const clearHit=machampDamage(false),burnHit=machampDamage(true);
 assert.ok(burnHit.events.some(line=>line.includes('|-status|p1a:')&&line.includes('|brn')));
 assert.ok(burnHit.damage>clearHit.damage,'Guts raises physical damage while statused, without the Gen III burn attack penalty');
 const chance=(ability,seed)=>{const battle=new KantoGame(),state=battle.start({team:[{id:113,ability,level:50,moves:['thunderbolt']}],opponent:[{id:16,level:40,moves:['tackle']}],seed});return battle.act({battleId:state.id,choice:'move 1',enemyChoice:'move 1'});};
 const ordinary=chance('Natural Cure',[77,78,79,80]),grace=chance('Serene Grace',[77,78,79,80]);
 assert.notEqual(ordinary.sides[1].team[0].status,'par');assert.equal(grace.sides[1].team[0].status,'par',"Serene Grace enables Thunderbolt's otherwise missed secondary chance for this fixed Gen III seed");
 game=new KantoGame();start=game.start({team:[{id:113,ability:'Natural Cure',level:30,moves:['thunderbolt']},{id:25,level:30,moves:['thunderbolt']}],opponent:[{id:143,level:20,moves:['rest']}],seed:[1,2,3,4]});
 const record=game.battles.get(start.id);record.battle.p1.active[0].setStatus('brn');turn=game.act({battleId:start.id,choice:'switch 2',enemyChoice:'move 1'});
 assert.ok(turn.events.some(line=>line.includes('|-curestatus|p1a:')&&line.includes('ability: Natural Cure')));
 assert.equal(turn.sides[0].team.find(mon=>mon.id===113).status,'','switching out clears Natural Cure status');
});
