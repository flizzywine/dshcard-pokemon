const test = require('node:test');
const assert = require('node:assert/strict');
const { KantoGame } = require('../engine.cjs');
const { createInitialMvu, validateMvu, recalculateDerived, ensureMvuDefaults, startFromMvu, applyBattleResult, buyItem, useItem, makeMon, stats, expAt, theaterView, theaterAction, worldView } = require('../mvu.cjs');

const root = variables => variables.stat_data['宝可梦'];

test('the unchosen starter placeholder never counts as a captured species',()=>{
 const mvu=require('../mvu.cjs'),machines=require('../machine-acquisitions.cjs');
 for(const id of [1,4,7]){
  const before=mvu.createInitialMvu();assert.deepEqual(root(before).统计.捕获图鉴,[]);
  assert.equal(machines.caughtSpeciesCount(root(before)),0);
  const chosen=mvu.chooseStarter(before,id);
  assert.deepEqual(root(chosen).统计.捕获图鉴,[id]);assert.equal(machines.caughtSpeciesCount(root(chosen)),1);
 }
 const legacy=mvu.createInitialMvu();root(legacy).统计.捕获图鉴=[1];
 assert.deepEqual(root(mvu.chooseStarter(legacy,7)).统计.捕获图鉴,[7]);
});

test('mail uses the simulator mail item and survives battle and item-removal attempts intact',()=>{
 const mvu=require('../mvu.cjs'),variables=mvu.createInitialMvu(4),world=root(variables);
 const letter={kind:'fab-mail',itemId:'fabmail',message:'BE KIND TO IT.'};
 const mon=mvu.makeMon(124,20,'mail-jynx');mon.携带道具='fabmail';mon.持有邮件=letter;
 world.队伍=[mon];world.设置.道馆等级上限=false;
 world.遭遇={类型:'wild',训练家:'野生宝可梦',队伍:[mvu.makeMon(16,5,'mail-foe')]};world.战斗.状态='pending';
 const game=new KantoGame(),opened=mvu.startFromMvu(game,variables),record=game.battles.get(opened.id);
 assert.equal(record.battle.p1.pokemon[0].item,'mail');
 assert.equal(record.battle.p1.pokemon[0].takeItem(record.battle.p2.pokemon[0]),false,'mail cannot be stolen');
 game.act({battleId:opened.id,choice:'move 1'});
 const after=mvu.applyBattleResult(variables,record),saved=root(after).队伍[0];
 assert.equal(saved.携带道具,'fabmail');assert.deepEqual(saved.持有邮件,letter);
 assert.equal(mvu.validateMvu(after),true);
});

test('NPC-traded Pokémon receive the Gen 3 traded experience bonus once', () => {
  function reward(traded) {
    const variables=createInitialMvu(1),world=root(variables),mon=world.队伍[0];
    if(traded) mon.交换来源='FRLG-NPC';
    world.遭遇={类型:'wild',训练家:'野生宝可梦',队伍:[makeMon(16,5,'exp-foe')]};
    const game=new KantoGame(),snapshot=startFromMvu(game,variables),record=game.battles.get(snapshot.id);
    const foe=record.battle.p2.pokemon[0];
    foe.fainted=true; foe.hp=0;
    record.battle.win('p1');
    const result=applyBattleResult(variables,record);
    return {amount:root(result).战斗.奖励.经验.find(entry=>entry.uid===mon.uid).获得,result,record};
  }
  const normal=reward(false),traded=reward(true);
  assert.ok(normal.amount>0);
  assert.equal(traded.amount,Math.floor(normal.amount*1.5));
  assert.equal(root(applyBattleResult(traded.result,traded.record)).队伍[0].经验,root(traded.result).队伍[0].经验);
});

test('new saves keep quest gadgets locked and provide Chinese machine and item descriptions', () => {
  const variables=createInitialMvu(1),world=root(variables),view=worldView(variables);
  assert.deepEqual(world.机制奖励.已解锁,[]);
  const returnMachine=view.tmhm.find(item=>item.id==='tm27');
  assert.equal(returnMachine.moveNameZh,'报恩');
  assert.equal(returnMachine.nameZh,'TM27 报恩');
  assert.match(view.items.find(item=>item.id==='potion').description,/恢复20点HP/);
});

test('MVU IV, EV, current HP, status and move PP are injected into Showdown', () => {
  const variables = createInitialMvu(1);
  const world = root(variables), mon = world.队伍[0];
  mon.个体值 = { hp: 31, atk: 7, def: 13, spa: 29, spd: 11, spe: 23 };
  mon.努力值 = { hp: 100, atk: 150, def: 0, spa: 0, spd: 0, spe: 0 };
  mon.能力值 = stats(mon);
  mon.当前HP = mon.能力值.hp - 3;
  mon.招式[0].PP = Math.max(1, mon.招式[0].PP - 1);
  mon.状态 = 'par';
  validateMvu(variables);

  const game = new KantoGame();
  const snapshot = startFromMvu(game, variables);
  const record = game.battles.get(snapshot.id);
  const actor = record.battle.p1.pokemon.find(p => p.set.slotId === mon.uid);
  assert.ok(actor);
  assert.equal(actor.hp, mon.当前HP);
  assert.equal(actor.status, 'par');
  assert.equal(actor.storedStats.atk, mon.能力值.atk);
  assert.equal(actor.maxhp, mon.能力值.hp);
  const move = mon.招式[0];
  assert.equal(actor.moveSlots.find(slot => slot.id === move.id).pp, move.PP);
  assert.equal(actor.moveSlots.find(slot => slot.id === move.id).maxpp, move.PP上限);
});

test('Showdown faint marker is stored as zero HP with no major status', () => {
  const variables=createInitialMvu(1),world=root(variables),mon=world.队伍[0];
  const game=new KantoGame(),snapshot=startFromMvu(game,variables),record=game.battles.get(snapshot.id);
  const actor=record.battle.p1.pokemon.find(p=>p.set.slotId===mon.uid);
  actor.status='fnt';
  actor.hp=0;
  const saved=applyBattleResult(variables,record);
  assert.equal(root(saved).队伍[0].当前HP,0);
  assert.equal(root(saved).队伍[0].状态,'');
  assert.equal(validateMvu(saved),true);
});

test('Gen 3 Oran Berry activates at half HP and its consumed state returns to the MVU without duplicating the berry', () => {
  const variables = createInitialMvu(1), world = root(variables), mon = world.队伍[0];
  mon.携带道具 = 'oranberry';
  mon.当前HP = 13;
  world.背包.物品.oranberry = 0;
  validateMvu(variables);

  const game = new KantoGame();
  const snapshot = startFromMvu(game, variables), record = game.battles.get(snapshot.id);
  assert.equal(record.battle.p1.active[0].item, 'oranberry');
  assert.ok(record.battle.p1.active[0].hp > record.battle.p1.active[0].maxhp / 2);
  // Force the rival's legal Scratch so damage crosses the berry threshold.
  record.difficulty = 'ai';
  const afterTurn = game.act({battleId: snapshot.id, choice: 'move 1', enemyChoice: 'move 2'});
  assert.ok(afterTurn.events.some(event => event.includes('|-damage|p1a:')));
  assert.ok(afterTurn.events.some(event => event.includes('|-enditem|p1a:') && event.includes('Oran Berry')));
  assert.equal(record.battle.p1.active[0].item, '');

  const saved = root(applyBattleResult(variables, record));
  assert.equal(saved.队伍[0].携带道具, '');
  assert.equal(saved.队伍[0].当前HP, record.battle.p1.active[0].hp);
  assert.equal(saved.背包.物品.oranberry, 0, 'the consumed held berry is not returned to the bag');
  assert.equal(world.队伍[0].携带道具, 'oranberry', 'battle resolution does not mutate the input MVU');
});

test('capturing a wild Pokémon sends it to the PC when the party is full and rewards only once', () => {
  const variables = createInitialMvu(1);
  const world = root(variables);
  world.遭遇 = { 类型: 'wild', 训练家: '野生宝可梦', 队伍: [makeMon(16, 3, 'wild-test')] };
  for (let i = 0; i < 5; i++) world.队伍.push(makeMon(4, 5, `party-${i}`));
  validateMvu(variables);

  const game = new KantoGame();
  const snapshot = startFromMvu(game, variables);
  const record = game.battles.get(snapshot.id);
  record.caught = { id: 16, name: '波波' };
  record.caughtUid = 'caught-test';
  record.battle.win('p1');

  const rewarded = applyBattleResult(variables, record);
  const rewardedWorld = root(rewarded);
  assert.equal(rewardedWorld.队伍.length, 6);
  assert.equal(rewardedWorld.电脑.length, 1);
  assert.equal(rewardedWorld.电脑[0].图鉴编号, 16);
  assert.equal(rewardedWorld.电脑[0].uid, 'caught-' + record.id);
  assert.equal(rewardedWorld.剧情.捕获次数, 1);
  assert.equal(rewardedWorld.任务.find(task => task.id === 'catch-pokemon').状态, '已完成');
  const once = applyBattleResult(rewarded, record);
  assert.equal(root(once).电脑.length, 1);
  assert.equal(root(once).战斗.状态, 'finished');
});

test('legacy MVU fills missing inventory and task fields without replacing existing item counts', () => {
  const variables = createInitialMvu(1), world = root(variables);
  world.背包.物品 = { potion: 2, pokeball: 4 };
  delete world.任务;
  delete world.剧情.捕获次数;
  delete world.剧情.首次击败小茂;
  const upgraded = root(ensureMvuDefaults(variables));
  assert.equal(upgraded.背包.物品.potion, 2);
  assert.equal(upgraded.背包.物品.pokeball, 4);
  assert.equal(upgraded.背包.物品.ultraball, 0);
  assert.ok(upgraded.任务.some(task => task.id === 'first-badge' && task.状态 === '进行中'));
  assert.equal(upgraded.剧情.捕获次数, 0);
  validateMvu(ensureMvuDefaults(variables));
});

test('journey tasks track badges, League rounds and catch goals while keeping custom tasks idempotently', () => {
  const variables = createInitialMvu(1), world = root(variables);
  const custom = { id: 'my-story-task', title: '我的旅程目标', status: '自定义', progress: 3, note: 'keep this unchanged' };
  world.剧情.初始御三家已选 = true;
  world.统计.捕获次数 = 7;
  world.剧情.捕获次数 = 7;
  world.任务.push(custom);
  world.训练家.徽章 = ['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章'];

  let upgraded = root(ensureMvuDefaults(variables));
  const byId = id => upgraded.任务.find(task => task.id === id);
  for (const id of ['choose-starter','defeat-rival','catch-pokemon','first-badge']) assert.ok(byId(id), `legacy task id remains: ${id}`);
  assert.equal(byId('choose-starter').状态, '已完成');
  assert.equal(byId('first-badge').状态, '已完成');
  assert.equal(byId('badge-4').状态, '已完成');
  assert.equal(byId('badge-5').状态, '进行中');
  assert.equal(byId('badge-6').状态, '未解锁');
  assert.equal(byId('catch-pokemon').状态, '已完成');
  assert.equal(byId('catch-5').进度, 5);
  assert.equal(byId('catch-5').状态, '已完成');
  assert.equal(byId('catch-10').进度, 7);
  assert.equal(byId('catch-10').目标, 10);
  assert.equal(byId('catch-10').状态, '进行中');
  assert.equal(byId('league-four').状态, '未解锁');
  assert.deepEqual(upgraded.任务.at(-1), custom, 'user task data stays untouched');
  assert.ok(upgraded.任务.every(task => !Object.hasOwn(task, '奖励')), 'journey goals do not grant rewards');

  upgraded.训练家.徽章 = ['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章','深红徽章','绿色徽章'];
  upgraded.剧情.联盟进度 = 0;
  upgraded = root(ensureMvuDefaults({ stat_data: { 宝可梦: upgraded } }));
  assert.equal(upgraded.任务.find(task => task.id === 'badge-8').状态, '已完成');
  assert.equal(upgraded.任务.find(task => task.id === 'league-four').状态, '进行中');
  assert.equal(upgraded.任务.find(task => task.id === 'league-champion').状态, '未解锁');

  upgraded.剧情.联盟进度 = 4;
  upgraded = root(ensureMvuDefaults({ stat_data: { 宝可梦: upgraded } }));
  assert.equal(upgraded.任务.find(task => task.id === 'league-four').状态, '已完成');
  assert.equal(upgraded.任务.find(task => task.id === 'league-champion').状态, '进行中');
  upgraded.剧情.联盟进度 = 5;
  upgraded = root(ensureMvuDefaults({ stat_data: { 宝可梦: upgraded } }));
  assert.equal(upgraded.任务.find(task => task.id === 'league-champion').状态, '已完成');
  const once = structuredClone(upgraded.任务);
  assert.deepEqual(root(ensureMvuDefaults({ stat_data: { 宝可梦: upgraded } })).任务, once, 'reloading the same save does not duplicate or change task progress');
});

test('legacy MVU ball alias migrates without restoring consumed Poké Balls', () => {
  const variables = createInitialMvu(1), world = root(variables);
  world.背包.物品 = { potion: 1, ball: 0 };
  const upgraded = root(ensureMvuDefaults(variables));
  assert.equal(upgraded.背包.物品.potion, 1);
  assert.equal(upgraded.背包.物品.pokeball, 0);
  assert.equal(Object.hasOwn(upgraded.背包.物品, 'ball'), false);
  validateMvu({ stat_data: { 宝可梦: upgraded } });

  world.背包.物品 = { potion: 1, pokeball: 0, ball: 5 };
  const canonicalWins = root(ensureMvuDefaults(variables));
  assert.equal(canonicalWins.背包.物品.pokeball, 0);
  assert.equal(Object.hasOwn(canonicalWins.背包.物品, 'ball'), false);
});

test('shop charges catalog price and outside medicine consumes only on a valid target', () => {
  const variables = createInitialMvu(1), world = root(variables), uid = world.队伍[0].uid;
  const bought = buyItem(variables, 'antidote', 2), boughtWorld = root(bought);
  assert.equal(boughtWorld.背包.物品.antidote, 2);
  assert.equal(boughtWorld.训练家.金钱, 2800);
  assert.throws(() => useItem(bought, 'antidote', uid), /异常状态/);
  assert.equal(root(bought).背包.物品.antidote, 2);
  boughtWorld.队伍[0].状态 = 'psn';
  const cured = useItem(bought, 'antidote', uid), curedWorld = root(cured);
  assert.equal(curedWorld.队伍[0].状态, '');
  assert.equal(curedWorld.背包.物品.antidote, 1);
});

test('shop rejects insufficient funds and nonbattle revive restores a fainted party member', () => {
  const variables = createInitialMvu(1), world = root(variables), mon = world.队伍[0];
  world.地图.节点 = 'celadon'; world.地图.地点 = '玉虹市';
  world.训练家.徽章 = ['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章','深红徽章','绿色徽章'];
  assert.throws(() => buyItem(variables, 'ultraball', 99), /金钱不足/);
  const second = makeMon(16, 5, 'revive-test'); second.当前HP = 0; world.队伍.push(second);
  world.背包.物品.revive = 1;
  const revived = useItem(variables, 'revive', second.uid), result = root(revived);
  assert.equal(result.队伍[1].当前HP, Math.floor(result.队伍[1].能力值.hp / 2));
  assert.equal(result.背包.物品.revive, 0);
  assert.ok(mon.当前HP > 0);
});

test('town shops have distinct badge-gated stock and reject purchases outside towns', () => {
  const variables = createInitialMvu(1), world = root(variables);
  let view = require('../mvu.cjs').worldView(variables);
  assert.equal(view.shop.available, true);
  assert.deepEqual(view.shop.items, ['potion','pokeball','antidote']);
  assert.throws(() => buyItem(variables, 'greatball'), /没有出售/);
  world.地图.节点 = 'cerulean'; world.地图.地点 = '华蓝市';
  view = require('../mvu.cjs').worldView(variables);
  assert.equal(view.shop.items.includes('superpotion'), false);
  world.训练家.徽章.push('岩石徽章');
  view = require('../mvu.cjs').worldView(variables);
  assert.equal(view.shop.items.includes('superpotion'), true);
  world.地图.节点 = 'route1'; world.地图.地点 = '1号道路';
  view = require('../mvu.cjs').worldView(variables);
  assert.equal(view.shop.available, false);
  assert.throws(() => buyItem(variables, 'potion'), /城镇/);
});

test('level caps follow gym badges, can be disabled, and do not add EXP to over-cap saves', () => {
  const variables = createInitialMvu(1), world = root(variables), mon = world.队伍[0];
  const {levelCap} = require('../progression-rules.cjs');
  assert.equal(levelCap(world), 14);
  world.训练家.徽章 = ['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章','深红徽章','绿色徽章'];
  assert.equal(levelCap(world), 63);
  world.剧情.联盟进度 = 5;
  assert.equal(levelCap(world), 100);
  world.剧情.联盟进度 = 0; world.设置.道馆等级上限 = false;
  assert.equal(levelCap(world), null);

  world.设置.道馆等级上限 = true;
  world.训练家.徽章 = [];
  mon.等级 = 50; mon.经验 = expAt(50, mon.图鉴编号);
  mon.能力值 = stats(mon); mon.当前HP = mon.能力值.hp;
  world.遭遇 = {类型:'trainer',训练家:'测试训练家',队伍:[makeMon(16, 5, 'cap-test-foe')]};
  world.遭遇.队伍[0].当前HP = 0;
  world.战斗.状态 = 'pending';
  world.战斗.轮次 = 1;
  const {KantoGame} = require('../engine.cjs');
  const game = new KantoGame(), snapshot = startFromMvu(game, variables), record = game.battles.get(snapshot.id);
  record.battle.p2.pokemon[0].fainted = true;
  record.battle.win('p1');
  const awarded = root(applyBattleResult(variables, record));
  assert.equal(awarded.队伍[0].等级, 50, 'a legacy over-cap level is not lowered or advanced');
  assert.equal(awarded.队伍[0].经验, expAt(50, mon.图鉴编号), 'over-cap legacy saves do not bank EXP');
  assert.equal(awarded.战斗.已奖励, true);
});

test('battle EXP stops one point below the next level and resumes only after another badge', () => {
  const variables = createInitialMvu(1), world = root(variables), mon = world.队伍[0];
  mon.等级 = 13; mon.经验 = expAt(13, mon.图鉴编号);
  mon.能力值 = stats(mon); mon.当前HP = mon.能力值.hp;
  const awardWin = input => {
    const game = new KantoGame(), snapshot = startFromMvu(game, input), record = game.battles.get(snapshot.id);
    for (const foe of record.battle.p2.pokemon) { foe.level = 100; foe.fainted = true; }
    record.battle.win('p1');
    return applyBattleResult(input, record);
  };
  const capped = awardWin(variables), cappedMon = root(capped).队伍[0];
  assert.equal(cappedMon.等级, 14);
  assert.equal(cappedMon.经验, expAt(15, cappedMon.图鉴编号) - 1);
  assert.equal(root(capped).战斗.奖励.经验.find(item => item.uid === mon.uid).获得, cappedMon.经验 - expAt(13, mon.图鉴编号));

  const unlocked = structuredClone(capped), unlockedWorld = root(unlocked);
  unlockedWorld.训练家.徽章.push('岩石徽章');
  unlockedWorld.遭遇 = {类型:'trainer',训练家:'测试训练家',队伍:[makeMon(16, 5, 'cap-unlock-foe')]};
  unlockedWorld.地图.轮次 = 2; unlockedWorld.战斗.轮次 = 2; unlockedWorld.战斗.状态 = 'pending';
  delete unlockedWorld.战斗.已奖励;
  const advanced = root(awardWin(unlocked)).队伍[0];
  assert.ok(advanced.经验 > cappedMon.经验, 'new badge raises the cap, allowing earned EXP to resume');
  assert.ok(advanced.等级 <= 21);
});

test('the first rival win sets root statistics and synchronizes the quest state', () => {
  const variables = createInitialMvu(1), game = new KantoGame();
  const snapshot = startFromMvu(game, variables), record = game.battles.get(snapshot.id);
  record.battle.win('p1');
  const won = root(applyBattleResult(variables, record));
  assert.equal(won.统计.首次击败小茂, true);
  assert.equal(won.统计.捕获次数, 0);
  assert.equal(won.任务.find(task => task.id === 'defeat-rival').状态, '已完成');
  assert.equal(won.任务.find(task => task.id === 'first-badge').状态, '进行中');
});

test('MVU rejects forged stats and move PP before a battle can be constructed', () => {
  const variables = createInitialMvu(4);
  root(variables).队伍[0].能力值.atk++;
  assert.throws(() => validateMvu(variables), /能力值/);
});

test('derived-stat repair updates only stats for valid IV/EV inputs and leaves invalid inputs visible', () => {
  const variables = createInitialMvu(1);
  const mon = root(variables).队伍[0];
  mon.等级 = 9;
  mon.当前HP = 0;
  mon.能力值 = { hp: 999, atk: 999, def: 999, spa: 999, spd: 999, spe: 999 };
  const repaired = recalculateDerived(variables), repairedMon = root(repaired).队伍[0];
  assert.deepEqual(repairedMon.能力值, stats(repairedMon));
  assert.equal(repairedMon.当前HP, 0);

  mon.努力值.hp = 256;
  mon.能力值 = { hp: 999, atk: 999, def: 999, spa: 999, spd: 999, spe: 999 };
  const invalid = recalculateDerived(variables), invalidMon = root(invalid).队伍[0];
  assert.equal(invalidMon.努力值.hp, 256);
  assert.equal(invalidMon.能力值.hp, 999);
  assert.throws(() => validateMvu(invalid), /努力值/);
});

test('theater view derives opening scene without writing a duplicate scene snapshot into the MVU root', () => {
  const variables = createInitialMvu(1), world = root(variables);
  delete world.剧情.剧场;
  const view = theaterView(variables);
  assert.equal(view.theater.id, 'oak-lab');
  assert.equal(view.theater.person.id, 'oak');
  assert.equal(view.theater.backgroundId, 'oaks-lab');
  assert.deepEqual(view.theater.options.filter(item => item.id === 'starter').map(item => item.payload.id), [1, 4, 7]);
  assert.equal(Object.hasOwn(world.剧情, '剧场'), false, 'pure view does not persist a theatrical copy');

  const selected = theaterAction(variables, 'starter', { id: 4 });
  const selectedWorld = root(selected), nextView = theaterView(selected);
  assert.equal(selectedWorld.队伍[0].图鉴编号, 4);
  assert.equal(selectedWorld.遭遇.训练家, '小茂');
  assert.equal(nextView.theater.person.id, 'rival_early');
  assert.equal(nextView.theater.options.some(item => item.id === 'start-battle' && item.enabled), true);
});

test('theater city services and travel reuse MVU guards, and route exploration starts one pending wild encounter', () => {
  let variables = createInitialMvu(7), world = root(variables);
  world.地图.节点 = 'pallet'; world.地图.地点 = '真新镇';
  world.战斗.状态 = 'finished'; world.战斗.轮次 = 1; world.地图.轮次 = 1;
  world.遭遇 = null;
  variables = theaterAction(variables, 'buy', { item: 'potion', count: 1 });
  assert.equal(root(variables).背包.物品.potion, 4);
  assert.equal(root(variables).训练家.金钱, 2700);
  variables = theaterAction(variables, 'travel', { node: 'route1' });
  assert.equal(root(variables).地图.节点, 'route1');
  variables = theaterAction(variables, 'explore');
  assert.equal(root(variables).战斗.轮次, 2);
  assert.equal(root(variables).战斗.状态, 'pending');
  assert.equal(root(variables).遭遇.类型, 'wild');
  assert.throws(() => theaterAction(variables, 'explore'), /完成当前遭遇|不允许/);
});

test('gym challenges are explicit, ordered, and never overwrite a pending or active encounter', () => {
  const variables = createInitialMvu(4), world = root(variables);
  world.地图.节点 = 'pewter'; world.地图.地点 = '尼比市'; world.地图.轮次 = 3;
  world.战斗.轮次 = 3; world.战斗.状态 = 'finished'; world.遭遇 = null;
  const challenged = theaterAction(variables, 'challenge-gym');
  assert.equal(root(challenged).战斗.轮次, 4);
  assert.equal(root(challenged).战斗.状态, 'pending');
  assert.equal(root(challenged).遭遇.类型, 'gym');
  assert.equal(root(challenged).遭遇.道馆, 0);
  assert.equal(root(challenged).遭遇.训练家, '小刚');
  assert.equal(theaterView(challenged).theater.person.id, 'brock');
  assert.throws(() => theaterAction(challenged, 'challenge-gym'), /完成当前遭遇/);

  const wrongOrder = structuredClone(variables);
  root(wrongOrder).训练家.徽章.push('蓝色徽章');
  assert.throws(() => theaterAction(wrongOrder, 'challenge-gym'), /顺序|前置徽章/);
});
