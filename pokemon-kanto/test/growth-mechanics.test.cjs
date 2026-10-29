'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mvu = require('../mvu.cjs');
const growth = require('../growth-mechanics.cjs');
const party = require('../party.cjs');
const {KantoGame, catalog} = require('../engine.cjs');

const root = variables => variables.stat_data.宝可梦;
const item = (variables, id) => mvu.useItem(variables, id, 'starter');

test('FRLG machine list and species compatibility come from the exact game rules', () => {
  const machines = mvu.worldView(mvu.createInitialMvu()).tmhm;
  assert.equal(machines.length, 57);
  assert.equal(machines.filter(entry => entry.kind === 'tm').length, 50);
  assert.equal(machines.filter(entry => entry.kind === 'hm').length, 7);
  assert.ok(!machines.some(entry => entry.id === 'hm08'));
  assert.ok(machines.find(entry => entry.id === 'tm02').learners.includes(6));
  assert.ok(!machines.find(entry => entry.id === 'tm02').learners.includes(1));
  assert.deepEqual(growth.levelMovesAt(1, 7), ['leechseed']);
});

test('simultaneous level moves follow the FRLG cartridge order', () => {
  assert.deepEqual(growth.levelMovesAt(23, 37), ['stockpile', 'swallow', 'spitup']);
  assert.deepEqual(growth.levelMovesAt(24, 46), ['stockpile', 'swallow', 'spitup']);
  assert.deepEqual(growth.levelMovesAt(107, 26), ['thunderpunch', 'icepunch', 'firepunch']);
  const mon=mvu.makeMon(23,36,'ordered-growth');
  mon.招式=['wrap','leer','poisonsting','bite'].map(id=>({id,PP:catalog.moves[id].pp,PP上限:catalog.moves[id].pp}));
  mvu.grantLevel(mon,100);
  assert.deepEqual(mon.待学招式,['stockpile','swallow','spitup']);
});

test('cached level learnsets cannot be mutated through returned data', () => {
  const first=growth.levelMoves(4);
  assert.ok(first.length>0);
  const original=first[0].move;
  first[0].move='corrupted';
  first.pop();
  assert.equal(growth.levelMoves(4)[0].move,original);
  assert.ok(!growth.levelMoves(4).some(move=>move.move==='corrupted'));
});

test('HM05 uses the 10-caught gate and Exp. Share the 50-caught gate at their FRLG aides', () => {
  const variables = mvu.createInitialMvu(), world = root(variables);
  world.地图.节点 = 'route2'; world.地图.地点 = '2号道路';
  assert.throws(() => mvu.theaterAction(variables, 'claim-machine', {item:'hm05'}), /不允许/);
  world.统计.见过图鉴 = Array.from({length:10},(_,i)=>i+1);
  assert.throws(() => mvu.theaterAction(variables, 'claim-machine', {item:'hm05'}), /不允许/,
    'seeing ten species without registering them as caught is insufficient');
  world.统计.捕获图鉴 = Array.from({length:10},(_,i)=>i+1);
  const gotFlash = mvu.theaterAction(variables, 'claim-machine', {item:'hm05'});
  assert.equal(root(gotFlash).背包.物品.hm05, 1);
  assert.throws(() => mvu.theaterAction(gotFlash, 'claim-machine', {item:'hm05'}), /不允许/);

  world.地图.节点 = 'route15'; world.地图.地点 = '15号道路';
  assert.throws(() => mvu.theaterAction(variables, 'claim-machine', {item:'expshare'}), /不允许/);
  for (let id = 1; id <= 50; id++) {
    const caught = mvu.makeMon(id, 5, `caught-${id}`); caught.收服来源 = 'wild';
    world.电脑.push(caught);
  }
  const gotShare = mvu.theaterAction(variables, 'claim-machine', {item:'expshare'});
  assert.equal(root(gotShare).背包.物品.expshare, 1);
  assert.equal(mvu.theaterView(gotShare).theater.options.some(entry => entry.id === 'claim-machine' && entry.payload.item === 'expshare'), false);
});

test('Amulet Coin is a one-time Route 16 aide reward after 40 caught species',()=>{
  const variables=mvu.createInitialMvu(),world=root(variables);
  world.地图.节点='route16';world.地图.地点='16号道路';
  world.统计.捕获图鉴=Array.from({length:39},(_,i)=>i+1);
  assert.throws(()=>mvu.theaterAction(variables,'claim-machine',{item:'amuletcoin'}),/不允许/);
  assert.equal(mvu.theaterView(variables).theater.options.some(option=>option.id==='claim-machine'&&option.payload.item==='amuletcoin'),false);
  world.统计.捕获图鉴=Array.from({length:40},(_,i)=>i+1);
  assert.equal(mvu.theaterView(variables).theater.options.some(option=>option.id==='claim-machine'&&option.payload.item==='amuletcoin'),true);
  const claimed=mvu.theaterAction(variables,'claim-machine',{item:'amuletcoin'});
  assert.equal(root(claimed).背包.物品.amuletcoin,1);
  assert.equal(root(claimed).剧情.已领取机器.amuletcoin,true);
  assert.throws(()=>mvu.theaterAction(claimed,'claim-machine',{item:'amuletcoin'}),/不允许/);
});

test('caught count includes owned starters and evolutions and survives removal from storage', () => {
  const acquisitions = require('../machine-acquisitions.cjs');
  const world = {
    队伍: [{图鉴编号: 2}], 电脑: [{图鉴编号: 3}],
    统计: {捕获图鉴: []},
  };
  assert.equal(acquisitions.caughtSpeciesCount(world), 2,
    'the fallback recognizes owned Pokémon even without wild-catch markers');
  world.统计.捕获图鉴 = [2, 3];
  world.队伍 = []; world.电脑 = [];
  assert.equal(acquisitions.caughtSpeciesCount(world), 2,
    'historical registrations remain after the Pokémon leave party and PC');

  const variables = mvu.chooseStarter(mvu.createInitialMvu(),1), starterWorld = root(variables);
  const starterSpecies = starterWorld.队伍[0].图鉴编号;
  assert.ok(starterWorld.统计.捕获图鉴.includes(starterSpecies), 'initial owned starter is registered');
  starterWorld.队伍 = []; starterWorld.电脑 = [];
  const normalized = mvu.ensureMvuDefaults(variables);
  assert.ok(root(normalized).统计.捕获图鉴.includes(starterSpecies),
    'normalization keeps the starter registration after removal');
});

test('a Gym victory grants its original one-time TM with the badge', () => {
  const variables = mvu.createInitialMvu(), world = root(variables);
  world.地图.节点 = 'pewter'; world.地图.地点 = '尼比市'; world.战斗.状态 = 'finished'; world.遭遇 = null;
  const challenged = mvu.theaterAction(variables, 'challenge-gym', {gym:0});
  const game = new KantoGame(), snapshot = mvu.startFromMvu(game, challenged), record = game.battles.get(snapshot.id);
  for (const foe of record.battle.p2.pokemon) foe.fainted = true;
  record.battle.win('p1');
  const moneyBefore = root(challenged).训练家.金钱;
  const result = mvu.applyBattleResult(challenged, record);
  assert.equal(root(result).训练家.金钱 - moneyBefore, 1400, 'Brock’s last Pokémon is level 14: 4 × 14 × Leader 25');
  assert.equal(root(result).背包.物品.tm39, 1);
  assert.ok(root(result).训练家.徽章.includes('岩石徽章'));
  assert.ok(root(result).战斗.奖励.物品.some(reward => reward.id === 'tm39' && reward.来源 === '道馆馆主奖励'));
});

test('TM teaching consumes only after a legal move is committed and preserves the input MVU', () => {
  const variables = mvu.createInitialMvu();
  const world = root(variables);
  world.背包.物品.tm06 = 1;
  const next = item(variables, 'tm06');
  assert.equal(root(next).队伍[0].招式.at(-1).id, 'toxic');
  assert.equal(root(next).背包.物品.tm06, 0);
  assert.equal(world.背包.物品.tm06, 1);

  world.背包.物品.tm02 = 1;
  const before = structuredClone(world);
  assert.throws(() => item(variables, 'tm02'), /无法使用/);
  assert.deepEqual(root(variables), before, 'an incompatible TM does not mutate MVU or spend the machine');
});

test('HMs are reusable, cannot be overwritten or ordinarily forgotten, and can be deleted in Fuchsia', () => {
  const variables = mvu.createInitialMvu();
  const world = root(variables);
  world.背包.物品.hm01 = 1;
  world.背包.物品.tm06 = 1;
  const taught = item(variables, 'hm01');
  const move = root(taught).队伍[0].招式.findIndex(entry => entry.id === 'cut') + 1;
  assert.ok(move > 0);
  assert.equal(root(taught).背包.物品.hm01, 1);
  assert.throws(() => party.forgetMove(taught, 'starter', move), /遗忘爷爷/);
  assert.throws(() => mvu.useItem(taught, 'tm06', 'starter', {slot: move}), /秘传招式不能/);
  root(taught).地图.节点 = 'fuchsia';
  const forgotten = party.forgetHmMove(taught, 'starter', move);
  assert.ok(!root(forgotten).队伍[0].招式.some(entry => entry.id === 'cut'));
  root(taught).队伍[0].待学招式 = ['poisonpowder'];
  assert.throws(() => mvu.learnMove(taught, 'starter', 'poisonpowder', move), /秘传招式不能/);
});

test('level-up processes intervening levels, queues missed moves, and supports accept or decline', () => {
  const variables = mvu.createInitialMvu(), world = root(variables), mon = world.队伍[0];
  mon.招式 = ['tackle', 'growl', 'leechseed', 'vinewhip'].map(id => ({id, PP: catalog.moves[id].pp, PP上限: catalog.moves[id].pp}));
  mon.等级 = 5; mon.经验 = mvu.expAt(5, 1); mon.能力值 = mvu.stats(mon); mon.当前HP = mon.能力值.hp;
  world.设置.道馆等级上限 = false;
  world.遭遇 = {类型:'trainer',训练家:'测试队伍',队伍:Array.from({length:6},(_,i)=>mvu.makeMon(150,100,`growth-foe-${i}`))};
  world.战斗.状态 = 'pending'; world.战斗.轮次 = 1;
  const game = new KantoGame(), snapshot = mvu.startFromMvu(game, variables), record = game.battles.get(snapshot.id);
  record.participationByFoe = Object.fromEntries(record.battle.p2.pokemon.map(foe => [foe.set.slotId,['starter']]));
  record.livingByFoeAtDefeat = Object.fromEntries(record.battle.p2.pokemon.map(foe => [foe.set.slotId,['starter']]));
  for (const foe of record.battle.p2.pokemon) foe.fainted = true;
  record.battle.win('p1');
  const next = mvu.applyBattleResult(variables, record), gained = root(next).队伍[0];
  assert.ok(gained.等级 >= 16, `expected a multi-level gain, got ${gained.等级}`);
  assert.equal(gained.图鉴编号, 1, 'evolution waits for a player decision after battle');
  assert.equal(gained.待进化[0].to,2);
  assert.ok(gained.待学招式.includes('poisonpowder'));
  assert.ok(gained.待学招式.includes('sleeppowder'));
  assert.throws(() => mvu.learnMove(next, 'starter', 'sleeppowder', 1), /第一个待学招式/);
  const declined = mvu.learnMove(next, 'starter', gained.待学招式[0], 0);
  assert.ok(!root(declined).队伍[0].待学招式.includes(gained.待学招式[0]));
  const accepted = mvu.learnMove(next, 'starter', gained.待学招式[0], 1);
  assert.equal(root(accepted).队伍[0].招式[0].id, gained.待学招式[0]);
});

test('EXP, EVs and Exp. Share follow FRLG participants and per-recipient rounding', () => {
  const variables = mvu.createInitialMvu(), world = root(variables);
  const share = mvu.makeMon(7,5,'share'); share.携带道具 = 'expshare';
  const bench = mvu.makeMon(25,5,'bench');
  world.队伍.push(share,bench); world.设置.道馆等级上限 = false;
  world.遭遇 = {类型:'trainer',训练家:'测试训练家',队伍:[mvu.makeMon(16,30,'pidgey')]};
  world.战斗.状态 = 'pending'; world.战斗.轮次 = 1;
  const game = new KantoGame(), snapshot = mvu.startFromMvu(game, variables), record = game.battles.get(snapshot.id);
  record.battle.p1.pokemon.forEach((mon,index)=>{mon.activeTurns=index===0?1:0;});
  record.battle.p2.pokemon[0].fainted = true;
  record.battle.win('p1');
  const next = mvu.applyBattleResult(variables,record), team = root(next).队伍;
  assert.equal(team[0].经验-variables.stat_data.宝可梦.队伍[0].经验,175, 'trainer EXP bonus is applied after splitting the base reward');
  assert.equal(team[1].经验-share.经验,175, 'the held Exp. Share grants the other half');
  assert.equal(team[2].经验,bench.经验, 'a nonparticipant without Exp. Share gets no EXP');
  assert.equal(team[0].努力值.spe,1);
  assert.equal(team[1].努力值.spe,1);
  assert.equal(team[2].努力值.spe,0);
  assert.equal(team[1].携带道具,'expshare', 'the simulator adapter preserves the cartridge item');
});

test('EXP and EVs are awarded per defeated foe to its recorded living participants', () => {
  const variables = mvu.createInitialMvu(), world = root(variables);
  const reserve = mvu.makeMon(25,5,'reserve');
  world.队伍.push(reserve); world.设置.道馆等级上限 = false;
  world.遭遇 = {类型:'trainer',训练家:'逐敌奖励测试',队伍:[mvu.makeMon(16,30,'pidgey'),mvu.makeMon(14,30,'kakuna')]};
  world.战斗.状态 = 'pending'; world.战斗.轮次 = 1;
  const game = new KantoGame(), snapshot = mvu.startFromMvu(game, variables), record = game.battles.get(snapshot.id);
  const firstFoe = record.battle.p2.pokemon[0].set.slotId, secondFoe = record.battle.p2.pokemon[1].set.slotId;
  const leadUid = world.队伍[0].uid;
  record.participationByFoe = {[firstFoe]:[leadUid],[secondFoe]:['reserve']};
  record.livingByFoeAtDefeat = {[firstFoe]:[leadUid,'reserve'],[secondFoe]:['reserve']};
  record.battle.p1.pokemon[0].fainted = true;
  record.battle.p1.pokemon[0].hp = 0;
  record.battle.p2.pokemon.forEach(foe => {foe.fainted = true; foe.hp = 0;});
  record.battle.win('p1');
  const next = mvu.applyBattleResult(variables,record), [lead,bench] = root(next).队伍;
  assert.ok(lead.经验 > world.队伍[0].经验, 'a Pokémon fainted later still receives its earlier foe reward');
  assert.ok(bench.经验 > reserve.经验, 'the later switch-in receives the foe it participated against');
  assert.equal(lead.努力值.spe,1);
  assert.equal(lead.努力值.def,0, 'later foe EVs do not go to an earlier participant');
  assert.equal(bench.努力值.spe,0, 'earlier foe EVs do not go to a later switch-in');
  assert.equal(bench.努力值.def,2);
});

test('the exported direct-level helper reuses friendship, evolution, and stat growth', () => {
  const variables = mvu.createInitialMvu(), mon = root(variables).队伍[0];
  const oldHappiness = mon.亲密度;
  assert.equal(mvu.grantLevel(mon, 14), 1);
  assert.equal(mon.等级, 6);
  assert.equal(mon.经验, mvu.expAt(6, mon.图鉴编号));
  assert.equal(mon.亲密度, oldHappiness + 5);
  assert.throws(() => mvu.grantLevel(mon, 6), /上限/);
  const evolving = mvu.makeMon(1, 15, 'direct-evolution');
  for (let level = 15; level < 16; level++) mvu.grantLevel(evolving, 30);
  assert.equal(evolving.图鉴编号, 1, 'the helper queues an evolution instead of deciding for the player');
  assert.equal(evolving.待进化[0].to,2);
  for (const [friendship,delta] of [[90,5],[190,3],[220,2]]) {
    const friend = mvu.makeMon(25,5,`friend-${friendship}`); friend.亲密度=friendship;
    mvu.grantLevel(friend, 30);
    assert.equal(friend.亲密度, friendship+delta);
  }
  mvu.validateMvu(variables);
});


test('Macho Brace doubles EVs from each recorded KO while respecting both Gen III caps',()=>{
 const settle=(item,evs)=>{
  const variables=mvu.createInitialMvu(),world=root(variables),holder=mvu.makeMon(25,50,'macho-holder');
  holder.携带道具=item;holder.努力值={hp:evs.hp||0,atk:evs.atk||0,def:0,spa:0,spd:0,spe:evs.spe||0};holder.能力值=mvu.stats(holder);holder.当前HP=holder.能力值.hp;
  world.队伍=[holder];world.设置.道馆等级上限=false;world.遭遇={类型:'trainer',训练家:'努力值测试',队伍:[mvu.makeMon(16,5,'macho-foe')]};world.战斗.状态='pending';world.战斗.轮次=1;
  const game=new KantoGame(),snapshot=mvu.startFromMvu(game,variables),record=game.battles.get(snapshot.id),foe=record.battle.p2.pokemon[0];
  foe.hp=1;
  const result=game.act({battleId:snapshot.id,choice:'move 1',enemyChoice:'move 1'});
  assert.ok(result.events.some(line=>line.startsWith('|faint|p2a:')),'a real battle action KOs the EV-yielding opponent');
  assert.equal(record.heldItemsByFoeAtDefeat[foe.set.slotId][holder.uid],item||'','the KO captures the held-item snapshot');
  record.battle.p1.pokemon[0].item='leftovers';
  return {next:mvu.applyBattleResult(variables,record),holder};
 };
 const plain=settle('',{});assert.equal(root(plain.next).队伍[0].努力值.spe,1);
 const doubled=settle('machobrace',{});assert.equal(root(doubled.next).队伍[0].努力值.spe,2,"the KO-time held item doubles the foe's Speed EV");
 assert.equal(root(doubled.next).队伍[0].携带道具,'leftovers','the subsequent item change is kept in party state');
 const singleCap=settle('machobrace',{spe:254});assert.equal(root(singleCap.next).队伍[0].努力值.spe,255,'doubling never exceeds an individual 255 EV cap');
 const totalCap=settle('machobrace',{hp:255,atk:254});const evs=root(totalCap.next).队伍[0].努力值;assert.equal(Object.values(evs).reduce((sum,value)=>sum+value,0),510,'doubling never exceeds the combined 510 EV cap');
});
test('action-boundary growth is idempotent and battle learning synchronizes the simulator', () => {
  let variables=mvu.createInitialMvu(), world=root(variables);
  world.队伍=[mvu.makeMon(1,14,'lead')]; world.队伍[0].经验=mvu.expAt(15,1)-1;
  world.设置.道馆等级上限=false;
  world.遭遇={类型:'trainer',训练家:'成长',队伍:[mvu.makeMon(16,10,'foe1'),mvu.makeMon(16,10,'foe2')]};
  world.战斗.状态='pending';world.战斗.轮次=1;
  const game=new KantoGame(), start=mvu.startFromMvu(game,variables), record=game.battles.get(start.id);
  const foe=record.battle.p2.pokemon[0];foe.hp=0;foe.fainted=true;
  record.participationByFoe.foe1=['lead'];record.livingByFoeAtDefeat.foe1=['lead'];
  variables=mvu.applyBattleResult(variables,record);
  const mon=root(variables).队伍[0];assert.equal(mon.等级,15);assert.equal(record.battle.p1.pokemon[0].level,15);
  assert.equal(record.battle.p1.pokemon[0].maxhp,mon.能力值.hp);
  assert.deepEqual(record.pendingBattleLearning,['lead']);
  assert.throws(()=>game.act({battleId:start.id,choice:'move 1'}),/待学/);
  const exp=mon.经验;variables=mvu.applyBattleResult(variables,record);assert.equal(root(variables).队伍[0].经验,exp);
  const move=root(variables).队伍[0].待学招式[0];variables=mvu.learnBattleMove(variables,record,'lead',move,1);
  assert.equal(record.battle.p1.pokemon[0].baseMoveSlots[0].id,move);
  assert.equal(root(variables).队伍[0].招式[0].id,move);
  while(record.pendingBattleLearning.length){const next=root(variables).队伍[0].待学招式[0];variables=mvu.learnBattleMove(variables,record,'lead',next,0);}
  assert.equal(record.pendingBattleLearning.length,0);
  const actor=record.battle.p1.pokemon[0],slot=actor.moveSlots[0],beforePP=slot.pp;
  actor.deductPP(slot.id,1);
  assert.equal(actor.moveSlots[0].pp,beforePP-1);
  actor.clearVolatile();
  assert.equal(actor.moveSlots[0].pp,beforePP-1,'switch reset cannot restore the PP from before learning');
});

test('EV growth at the current experience cap synchronizes ongoing battle stats',()=>{
 let variables=mvu.createInitialMvu(),world=root(variables);
 const mon=mvu.makeMon(1,14,'cap');mon.努力值.spe=7;mon.能力值=mvu.stats(mon);mon.当前HP=mon.能力值.hp;mon.经验=mvu.expAt(15,1)-1;
 world.队伍=[mon];world.遭遇={类型:'trainer',训练家:'上限成长',队伍:[mvu.makeMon(16,10,'ev-one'),mvu.makeMon(16,10,'ev-two')]};world.战斗.状态='pending';
 const game=new KantoGame(),start=mvu.startFromMvu(game,variables),record=game.battles.get(start.id),foe=record.battle.p2.pokemon[0];foe.hp=0;foe.fainted=true;
 record.participationByFoe['ev-one']=['cap'];record.livingByFoeAtDefeat['ev-one']=['cap'];
 const oldSpeed=mon.能力值.spe;variables=mvu.applyBattleResult(variables,record);const grown=root(variables).队伍[0];
 assert.equal(grown.经验,mon.经验);assert.equal(grown.努力值.spe,8);assert.ok(grown.能力值.spe>oldSpeed);
 assert.equal(record.battle.p1.pokemon[0].storedStats.spe,grown.能力值.spe);
 assert.equal(record.battle.p1.pokemon[0].hp,grown.当前HP);
});

test('real battle KO awards a benched Exp. Share holder',()=>{
 const variables=mvu.createInitialMvu(),w=root(variables);const share=mvu.makeMon(7,5,'share-real');share.携带道具='expshare';w.队伍.push(share);w.设置.道馆等级上限=false;
 w.遭遇={类型:'trainer',训练家:'经验测试',队伍:[mvu.makeMon(16,5,'foe-real')]};w.战斗.状态='pending';w.战斗.轮次=1;
 const game=new KantoGame(),start=mvu.startFromMvu(game,variables),record=game.battles.get(start.id);record.battle.p2.pokemon[0].hp=1;
 for(let i=0;i<10&&!record.battle.ended;i++)game.act({battleId:start.id,choice:'move 1'});
 assert.ok(record.battle.ended);assert.equal(record.heldItemsByFoeAtDefeat['foe-real']['share-real'],'');
 const next=mvu.applyBattleResult(variables,record);assert.ok(root(next).队伍[1].经验>share.经验);assert.equal(root(next).队伍[1].携带道具,'expshare');
});

test('registered evolved species and capture species count independently',()=>{
 const acquisitions=require('../machine-acquisitions.cjs'),v=mvu.createInitialMvu(),w=root(v);w.队伍[0]=mvu.makeMon(2,16,'evolved');w.队伍[0].收服图鉴编号=1;w.统计.捕获图鉴=[];w.统计.见过图鉴=[];
 assert.equal(acquisitions.caughtSpeciesCount(w),2);
 const next=mvu.ensureMvuDefaults(v),stats=root(next).统计;
 assert.ok(stats.捕获图鉴.includes(1)&&stats.捕获图鉴.includes(2));assert.ok(stats.见过图鉴.includes(1)&&stats.见过图鉴.includes(2));
});

test('Rare Candy levels a fainted Pokémon without reviving it',()=>{
 const v=mvu.createInitialMvu(),w=root(v),mon=w.队伍[0],level=mon.等级;mon.当前HP=0;w.背包.物品.rarecandy=1;w.设置.道馆等级上限=false;
 const next=mvu.useItem(v,'rarecandy',mon.uid),after=root(next);
 assert.equal(after.队伍[0].等级,level+1);assert.equal(after.队伍[0].当前HP,0);assert.equal(after.背包.物品.rarecandy,0);
});
