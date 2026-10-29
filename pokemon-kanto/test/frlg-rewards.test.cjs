'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const rewards = require('../frlg-rewards.cjs');
const mvu = require('../mvu.cjs');
const { KantoGame } = require('../engine.cjs');
const root = variables => variables.stat_data.宝可梦;

test('the complete pret trainer class table and pinned source hashes are exposed', () => {
  assert.equal(Object.keys(rewards.CLASS_VALUES).length, 104);
  assert.equal(rewards.source.commit, 'ce6406d8c2eaf46d543c8a2606de0c3cb1951982');
  assert.equal(rewards.source.tableSha256, 'c290d325761d68c059f02dc21cc6178d4bbefa0d06ffddc8879341c090d37928');
  assert.equal(rewards.source.formulaSha256, '3b7341db8cd58c54fb0b54b47e6eef89c5c05e8a60ab4e9b45bdc907845c19b3');
  assert.deepEqual(
    [rewards.CLASS_VALUES.LEADER, rewards.CLASS_VALUES.ELITE_FOUR, rewards.CLASS_VALUES.PKMN_PROF, rewards.CLASS_VALUES.RIVAL_EARLY, rewards.CLASS_VALUES.RIVAL_LATE, rewards.CLASS_VALUES.CHAMPION],
    [25, 25, 25, 4, 9, 25],
  );
});

test('FRLG prize formula uses the final party member level and exact class value', () => {
  assert.equal(rewards.trainerPrize({ 类型:'trainer', 训练家:'小茂', 队伍:[{等级:5}] }).amount, 80);
  assert.equal(rewards.trainerPrize({ 类型:'gym', 队伍:[{等级:12},{等级:14}] }).amount, 1400);
  assert.equal(rewards.trainerPrize({ 类型:'trainer', 联盟:0, 队伍:[{等级:50}] }).amount, 5000);
  assert.equal(rewards.trainerPrize({ 类型:'trainer', 联盟:4, 队伍:[{等级:60}] }).amount, 6000);
  assert.equal(rewards.trainerPrize({ 类型:'trainer', 训练家:'短裤小子', 队伍:[{等级:5}] }).classId, 'YOUNGSTER');
});

test('special and original-content encounters use explicit exact or approximate class mappings', () => {
  assert.deepEqual(rewards.resolveClass({ 类型:'trainer', specialId:'rocket-bridge' }), { classId:'TEAM_ROCKET', approximate:false });
  assert.deepEqual(rewards.resolveClass({ 类型:'trainer', specialId:'rocket-celadon' }), { classId:'TEAM_ROCKET', approximate:true });
  assert.deepEqual(rewards.resolveClass({ 类型:'trainer', specialId:'rival-route22' }), { classId:'RIVAL_LATE', approximate:true });
  assert.deepEqual(rewards.resolveClass({ 类型:'trainer', campaignId:'indigo-tournament' }), { classId:'PKMN_TRAINER', approximate:true });
  assert.equal(rewards.resolveClass({ 类型:'wild', 训练家:'野生宝可梦' }), null);
  assert.equal(rewards.trainerPrize({ 类型:'trainer', 训练家:'未知训练家', 队伍:[{等级:30}] }), null);
});

test('money multiplier and double-battle factors have exact injectable interfaces', () => {
  const encounter = { 类型:'trainer', 训练家:'小茂', 队伍:[{等级:5}] };
  assert.equal(rewards.trainerPrize(encounter, { moneyMultiplier:2 }).amount, 160);
  assert.equal(rewards.trainerPrize(encounter, { moneyMultiplier:1, doubleBattle:true }).amount, 160);
  assert.throws(() => rewards.trainerPrize(encounter, { moneyMultiplier:-1 }), /非负有限数/);
  assert.equal(rewards.trainerPrize({ 类型:'wild', 队伍:[{等级:99}] }), null);
});

test('a real opening rival win settles exactly 80 trainer prize money', () => {
  const variables = mvu.createInitialMvu();
  const game = new KantoGame(), snapshot = mvu.startFromMvu(game, variables), record = game.battles.get(snapshot.id);
  for (const foe of record.battle.p2.pokemon) { foe.fainted = true; foe.hp = 0; }
  record.battle.win('p1');
  const before = root(variables).训练家.金钱;
  const after = root(mvu.applyBattleResult(variables, record));
  assert.equal(after.训练家.金钱 - before, 80);
  assert.equal(after.战斗.奖励.金币, 80);
});

test('defeated opponents award earlier participants EXP on a loss without reviving them', () => {
  const variables = mvu.createInitialMvu(), world = root(variables);
  world.设置.道馆等级上限 = false;
  const lead = world.队伍[0];
  lead.经验 = mvu.expAt(6, lead.图鉴编号) - 1;
  world.遭遇 = { 类型:'trainer', 训练家:'败北测试', 队伍:[mvu.makeMon(16, 30, 'loss-foe')] };
  world.战斗.状态 = 'pending'; world.战斗.轮次 = 1;
  const game = new KantoGame(), snapshot = mvu.startFromMvu(game, variables), record = game.battles.get(snapshot.id);
  const foe = record.battle.p2.pokemon[0], uid = lead.uid;
  record.participationByFoe = { [foe.set.slotId]:[uid] };
  record.livingByFoeAtDefeat = { [foe.set.slotId]:[uid] };
  record.battle.p1.pokemon[0].fainted = true;
  record.battle.p1.pokemon[0].hp = 0;
  foe.fainted = true; foe.hp = 0;
  record.battle.win('p2');
  const beforeMoney = world.训练家.金钱;
  const next = mvu.applyBattleResult(variables, record), after = root(next), gained = after.队伍[0];
  assert.equal(after.战斗.结果, 'lose');
  assert.ok(gained.经验 > lead.经验, 'the KO remains earned when the player later loses');
  assert.ok(gained.等级 >= 6, 'postbattle growth still resolves at battle end');
  assert.equal(gained.当前HP, 0, 'deferred HP stat growth cannot revive a fainted party member');
  assert.equal(after.训练家.金钱, beforeMoney, 'trainer prize money requires a win');
  assert.ok(after.战斗.奖励.经验.some(item => item.uid === uid));
  const replay = mvu.applyBattleResult(next, record);
  assert.equal(root(replay).队伍[0].经验, gained.经验, 'the same finished battle cannot award EXP twice');
});

test('restored legacy battle with an empty participant map retains earned EXP and EVs', () => {
  const settle = legacyMap => {
    const variables=mvu.createInitialMvu(),world=root(variables);
    world.设置.道馆等级上限=false;
    world.遭遇={类型:'trainer',训练家:'捕虫少年',队伍:[mvu.makeMon(16,12,'legacy-exp-foe')]};
    world.战斗.状态='pending';world.战斗.轮次=1;
    const game=new KantoGame(),snapshot=mvu.startFromMvu(game,variables),record=game.battles.get(snapshot.id);
    const foe=record.battle.p2.pokemon[0],player=record.battle.p1.pokemon[0];
    player.activeTurns=1;foe.hp=0;foe.fainted=true;
    if(legacyMap===undefined)delete record.participationByFoe;else record.participationByFoe=legacyMap;
    record.battle.win('p1');
    const previous=structuredClone(world.队伍[0]);
    const next=root(mvu.applyBattleResult(variables,record)).队伍[0];
    return {experience:next.经验-previous.经验,evs:next.努力值};
  };
  const absent=settle(undefined),empty=settle({}),otherFoe=settle({'newer-foe':[]});
  assert.ok(absent.experience>0);
  assert.ok(Object.values(absent.evs).some(value=>value>0));
  assert.deepEqual(empty,absent,'the host initializes legacy history to an empty object on restore');
  assert.deepEqual(otherFoe,absent,'a newer foe record does not erase an older foe without a participation entry');
});

test('challenge rewards use the starting difficulty and survive full bags without duplication', () => {
  const start = (difficulty, counts={}) => {
    const variables=mvu.createInitialMvu(),w=root(variables);
    w.设置.对手难度=difficulty;w.设置.战后补给=false;Object.assign(w.背包.物品,counts);
    if(difficulty==='hell')w.训练家.徽章=['岩石徽章'];
    w.遭遇={类型:'gym',道馆:0,训练家:'小刚',队伍:[mvu.makeMon(74,12,'challenge-foe')]};
    w.战斗.状态='pending';w.战斗.轮次=1;
    const game=new KantoGame(),snapshot=mvu.startFromMvu(game,variables),record=game.battles.get(snapshot.id);
    for(const foe of record.battle.p2.pokemon){foe.fainted=true;foe.hp=0;}
    record.battle.win('p1');return {variables,record};
  };
  for(const [difficulty,ids] of [['normal',[]],['hard',['ppmax']],['expert',['ppmax','luckyegg']],['hell',['ppmax','leftovers','masterball']]]){
    const {variables,record}=start(difficulty);root(variables).设置.对手难度='normal';
    const next=mvu.applyBattleResult(variables,record),w=root(next);
    for(const id of ['ppmax','luckyegg','leftovers','masterball'])assert.equal(w.背包.物品[id],ids.includes(id)?1:0,difficulty+id);
    for(const id of ids)assert.ok(w.战斗.奖励.物品.some(item=>item.id===id&&item.名称.includes('首胜')));
    const replay=root(mvu.applyBattleResult(next,record));for(const id of ids)assert.equal(replay.背包.物品[id],1);
  }
  const {variables,record}=start('hell',{ppmax:999,leftovers:999,masterball:999});
  let next=mvu.applyBattleResult(variables,record),w=root(next);
  assert.deepEqual(w.剧情.待领取挑战奖励,{ppmax:1,leftovers:1,masterball:1});
  assert.equal(w.战斗.奖励.物品.filter(item=>item.名称.includes('待下次')).length,3);
  for(const id of ['ppmax','leftovers','masterball'])w.背包.物品[id]=998;
  w.遭遇={类型:'trainer',训练家:'捕虫少年',队伍:[mvu.makeMon(16,5,'recovery-foe')]};
  w.战斗.状态='pending';w.战斗.已奖励=false;w.战斗.轮次++;
  const game=new KantoGame(),snapshot=mvu.startFromMvu(game,next),recovery=game.battles.get(snapshot.id);
  recovery.battle.win('p2');next=mvu.applyBattleResult(next,recovery);w=root(next);
  for(const id of ['ppmax','leftovers','masterball']){assert.equal(w.背包.物品[id],999);assert.equal(w.剧情.待领取挑战奖励[id],0);}
  assert.equal(w.战斗.奖励.物品.filter(item=>item.来源==='补领高难度挑战奖励').length,3);
  assert.equal(root(mvu.applyBattleResult(next,recovery)).背包.物品.ppmax,999);
});

test('losing a challenge never awards its first-win bonus', () => {
  const variables=mvu.createInitialMvu(),w=root(variables);
  w.设置.对手难度='hell';w.设置.战后补给=false;
  w.外观.首领胜利=['brock'];
  w.遭遇={类型:'gym',道馆:0,训练家:'小刚',队伍:[mvu.makeMon(74,12,'loss-challenge')]};
  w.战斗.状态='pending';w.战斗.轮次=1;
  const game=new KantoGame(),snapshot=mvu.startFromMvu(game,variables),record=game.battles.get(snapshot.id);
  record.battle.win('p2');const after=root(mvu.applyBattleResult(variables,record));
  assert.equal(after.背包.物品.ppmax,0);assert.equal(after.训练家.徽章.length,0);
});
