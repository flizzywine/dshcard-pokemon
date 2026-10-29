'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mvu = require('../mvu.cjs');
const facilities = require('../city-facilities.cjs');
const encounters = require('../frlg-encounters.cjs');
const itemCatalog = [...require('../public/data/items.json'), ...require('../public/data/field-items.json')];
const tmhmCatalog = require('../public/data/tmhm.json');
const root = variables => variables.stat_data['宝可梦'];

function at(node) {
  const variables = mvu.createInitialMvu();
  mvu.chooseStarter(variables, 1);
  const world = root(variables);
  world.地图.节点 = node;
  world.地图.地点 = ({celadon:'玉虹市', fuchsia:'浅红市', safari:'狩猎地带'})[node] || node;
  world.战斗 = {轮次:0,状态:'finished',结果:'',摘要:'',操作序号:0};
  world.遭遇 = null;
  return world;
}
const action = (world, id, payload = {}, storyTurn = 10) => facilities.apply(world, id,
  {...payload, revision:payload.revision ?? facilities.view(world).revision}, {storyTurn});

test('city data lists one real, non-shop facility for every Kanto town', () => {
  assert.deepEqual(Object.keys(facilities.data.towns).sort(), ['celadon','cerulean','cinnabar','fuchsia','indigo','lavender','pallet','pewter','saffron','vermilion','viridian']);
  for (const town of Object.values(facilities.data.towns)) {
    assert.ok(town.summary);
    assert.ok(town.facilities.length > 0);
    for (const venue of town.facilities) assert.ok(venue.primaryAction);
  }
  for (const version of ['firered','leafgreen']) {
    for (const method of ['land','water','oldrod','goodrod','superrod']) {
      for (const id of encounters.pool('safari', {version, method})?.species || []) assert.ok(facilities.data.safari.speciesMechanics[id], `missing Safari species mechanics for ${version}/${method}/${id}`);
    }
  }
  for (const node of Object.keys(facilities.data.towns)) {
    assert.ok(facilities.options(at(node)).some(option => option.id === 'facility-info'), `${node} should expose its venue`);
  }
  const venue = facilities.options(at('pewter')).find(option => option.id === 'facility-info');
  const visited = action(at('pewter'), venue.id, venue.payload, 8);
  assert.equal(visited.城市设施.lastVisit.id, venue.payload.facilityId);
  assert.equal(visited.训练家.金钱, at('pewter').训练家.金钱, 'venue visits must not grant money');
});

test('Celadon issues the Coin Case once and supports multiple revisioned purchases per story turn', () => {
  const world = at('celadon');
  const before = structuredClone(world);
  const received = action(world, 'facility-coin-case', {}, 1);
  assert.deepEqual(world, before, 'apply must not mutate its input');
  assert.equal(received.城市设施.gameCorner.coinCase, true);
  assert.ok(received.背包.关键物品.some(item => item.id === 'coin-case'));
  const oldBuy = facilities.options(received).find(option => option.id === 'facility-buy-coins' && option.payload.coins === 50);
  const purchased = action(received, 'facility-buy-coins', oldBuy.payload, 2);
  assert.equal(purchased.城市设施.gameCorner.coins, 50);
  assert.equal(purchased.训练家.金钱, received.训练家.金钱 - 1000);
  assert.equal(facilities.apply(purchased, 'facility-buy-coins', oldBuy.payload, {storyTurn:2}).城市设施.gameCorner.coins, 50, 'replaying the same revision must be a no-op');
  assert.throws(() => facilities.apply(purchased, 'facility-claim-prize', {revision:oldBuy.payload.revision,itemId:'smokeball'}, {storyTurn:2}), error => error.code === 'STALE_FACILITY_REVISION');
  const secondBuy = facilities.options(purchased).find(option => option.id === 'facility-buy-coins' && option.payload.coins === 50);
  const second = action(purchased, 'facility-buy-coins', secondBuy.payload, 2);
  assert.equal(second.城市设施.gameCorner.coins, 100, 'new revisions allow more than one operation in the same story turn');
  purchased.城市设施.gameCorner.coins = 9800;
  purchased.训练家.金钱 = 999999;
  assert.throws(() => action(purchased, 'facility-buy-coins', {coins:500}, 2), /代币盒最多/);
  assert.throws(() => action(received, 'facility-claim-prize', {itemId:'smokeball'}, 4), /代币不足/);
});

test('Game Corner rejects wrong-city actions, unaffordable purchases, and prize replay', () => {
  const world = at('fuchsia');
  assert.throws(() => action(world, 'facility-coin-case'), /玉虹游戏厅/);
  const celadon = at('celadon');
  celadon.训练家.金钱 = 10;
  const withCase = action(celadon, 'facility-coin-case', {}, 1);
  assert.throws(() => action(withCase, 'facility-buy-coins', {coins:50}, 2), /金钱不足/);
  withCase.城市设施.gameCorner.coins = 800;
  const redeem = facilities.options(withCase).find(option => option.id === 'facility-claim-prize' && option.payload.itemId === 'smokeball');
  const prize = action(withCase, 'facility-claim-prize', redeem.payload, 3);
  assert.equal(prize.背包.物品.smokeball, 1);
  assert.equal(prize.城市设施.gameCorner.coins, 0);
  assert.equal(facilities.apply(prize, 'facility-claim-prize', redeem.payload, {storyTurn:3}).背包.物品.smokeball, 1);
  prize.城市设施.gameCorner.coins = 800;
  prize.背包.物品.smokeball = 999;
  assert.throws(() => action(prize, 'facility-claim-prize', {itemId:'smokeball'}, 4), /达到数量上限/);
});

test('Game Corner offers original TM prizes and exchanges version-specific Pokemon without wild-catch rewards', () => {
  for (const [itemId, price] of [['tm13',4000],['tm23',3500],['tm24',4000],['tm30',4500],['tm35',4000]]) {
    const world = at('celadon');
    world.设置.版本 = 'firered';
    world.城市设施.gameCorner.coinCase = true;
    world.城市设施.gameCorner.coins = 9999;
    const option = facilities.options(world).find(value => value.id === 'facility-claim-prize' && value.payload.itemId === itemId);
    assert.ok(option?.enabled, `${itemId} prize should be available`);
    const before = world.城市设施.gameCorner.coins;
    const next = action(world, option.id, option.payload, 12);
    assert.equal(next.背包.物品[itemId], 1);
    assert.equal(next.城市设施.gameCorner.coins, before - price);
  }

  for (const version of ['firered','leafgreen']) {
    for (const prize of facilities.data.gameCorner.pokemonPrizes.filter(item => item.version === version)) {
      const save = at('celadon');
      save.设置.版本 = version;
      save.城市设施.gameCorner.coinCase = true;
      save.城市设施.gameCorner.coins = 9999;
      const beforeCount = save.统计.捕获次数;
      const option = facilities.options(save).find(value => value.id === 'facility-claim-pokemon' && value.payload.speciesId === prize.speciesId);
      assert.ok(option?.enabled, `${version} species ${prize.speciesId} should be offered`);
      assert.equal(option.payload.revision, save.城市设施.revision);
      const next = action(save, option.id, option.payload, 25);
      const mon = [...next.队伍,...next.电脑].find(value => value.uid === `game-corner-${save.城市设施.revision}-${prize.speciesId}`);
      assert.ok(mon);
      assert.equal(mon.图鉴编号, prize.speciesId);
      assert.equal(mon.等级, prize.level);
      assert.equal(mon.携带道具, undefined);
      assert.equal(mon.收服来源, undefined);
      assert.equal(next.城市设施.gameCorner.coins, 9999 - prize.coins);
      assert.equal(next.统计.捕获次数, beforeCount);
      assert.equal(next.剧情.捕获次数, save.剧情.捕获次数);
      assert.ok(next.统计.见过图鉴.includes(prize.speciesId));
      assert.ok(next.统计.捕获图鉴.includes(prize.speciesId));
      const replay = facilities.apply(next, option.id, option.payload, {storyTurn:25});
      assert.equal(replay.队伍.length + replay.电脑.length, next.队伍.length + next.电脑.length);
      assert.equal(replay.城市设施.gameCorner.coins, next.城市设施.gameCorner.coins);
    }
  }
  const leafgreen = at('celadon');
  leafgreen.设置.版本 = 'leafgreen';
  leafgreen.城市设施.gameCorner.coinCase = true;
  leafgreen.城市设施.gameCorner.coins = 9999;
  assert.equal(facilities.options(leafgreen).some(option => option.id === 'facility-claim-pokemon' && option.payload.speciesId === 123), false);
  assert.throws(() => action(leafgreen, 'facility-claim-pokemon', {speciesId:123}), /当前版本没有提供/);
});

test('Game Corner Pokemon exchange falls back to PC and refuses a full party and PC without spending coins', () => {
  const world = at('celadon');
  world.设置.版本 = 'firered';
  world.城市设施.gameCorner.coinCase = true;
  world.城市设施.gameCorner.coins = 9999;
  while (world.队伍.length < 6) world.队伍.push(mvu.makeMon(1, 5, `test-team-${world.队伍.length}`));
  const option = facilities.options(world).find(value => value.id === 'facility-claim-pokemon' && value.payload.speciesId === 63);
  const next = action(world, option.id, option.payload, 30);
  assert.equal(next.队伍.length, 6);
  assert.equal(next.电脑.length, 1);
  assert.equal(next.电脑[0].图鉴编号, 63);
  assert.equal(next.电脑[0].携带道具, undefined);

  next.城市设施.gameCorner.coins = 9999;
  next.队伍.splice(0, next.队伍.length, ...Array.from({length:6}, (_,i)=>mvu.makeMon(1,5,`full-team-${i}`)));
  next.电脑 = Array.from({length:420}, (_,i)=>mvu.makeMon(1,5,`full-pc-${i}`));
  const fullOption = facilities.options(next).find(value => value.id === 'facility-claim-pokemon' && value.payload.speciesId === 63);
  assert.equal(fullOption.enabled, false);
  const coins = next.城市设施.gameCorner.coins;
  assert.throws(() => action(next, 'facility-claim-pokemon', fullOption.payload, 31), /队伍和电脑都已满/);
  assert.equal(next.城市设施.gameCorner.coins, coins);
});

test('Celadon Department Store scopes merchandise to the selected floor and applies catalog prices', () => {
  for (const goods of Object.values(facilities.data.departmentStore.goods).flat()) {
    const item = itemCatalog.find(row => row.id === goods.id);
    assert.ok(item, `${goods.id} should use a unified inventory catalog item`);
    assert.equal(goods.price, item.price, `${goods.id} floor price should match its inventory catalog price`);
  }
  for (const trade of facilities.data.departmentStore.rooftopTrades) assert.ok(tmhmCatalog.some(row => row.id === trade.rewardId));
  const world = at('celadon');
  world.训练家.金钱 = 9999;
  const before = structuredClone(world);
  const view = facilities.view(world);
  assert.equal(view.departmentStore.floor, '2F');
  assert.equal(view.facilities.some(venue => venue.id === 'department-store'), true);
  assert.deepEqual(view.departmentStore.goods.map(good => good.id), ['greatball','superpotion','revive','antidote','paralyzeheal','awakening','burnheal','iceheal']);
  const floors = facilities.options(world).filter(option => option.id === 'facility-department-floor');
  assert.equal(floors.length, 3);
  const go4f = floors.find(option => option.payload.floor === '4F');
  const fourF = action(world, go4f.id, go4f.payload, 50);
  assert.deepEqual(world, before, 'floor navigation must not mutate its input');
  assert.equal(fourF.地图.轮次, world.地图.轮次, 'choosing a floor does not advance the story');
  assert.equal(facilities.view(fourF).departmentStore.floor, '4F');
  assert.deepEqual(facilities.view(fourF).departmentStore.goods.map(good => good.id), ['pokedoll','firestone','thunderstone','waterstone','leafstone']);
  assert.equal(facilities.options(fourF).some(option => option.id === 'facility-department-buy' && option.payload.itemId === 'greatball'), false);
  const stock = fourF.背包.物品.leafstone;
  const money = fourF.训练家.金钱;
  const purchase = action(fourF, 'facility-department-buy', {itemId:'leafstone',count:2}, 50);
  assert.equal(purchase.背包.物品.leafstone, stock + 2);
  assert.equal(purchase.训练家.金钱, money - 4200);
  assert.equal(facilities.apply(purchase, 'facility-department-buy', {itemId:'leafstone',count:2,revision:fourF.城市设施.revision}, {storyTurn:50}).背包.物品.leafstone, stock + 2);
  const poor = at('celadon');
  poor.城市设施.departmentStore.floor = '4F';
  poor.训练家.金钱 = 100;
  const poorMoney = poor.训练家.金钱;
  assert.throws(() => action(poor, 'facility-department-buy', {itemId:'firestone',count:1}), /金钱不足/);
  assert.equal(poor.训练家.金钱, poorMoney);
  const fullBag = at('celadon');
  fullBag.城市设施.departmentStore.floor = '4F';
  fullBag.背包.物品.firestone = 999;
  const fullBagMoney = fullBag.训练家.金钱;
  assert.throws(() => action(fullBag, 'facility-department-buy', {itemId:'firestone',count:1}), /数量上限/);
  assert.equal(fullBag.训练家.金钱, fullBagMoney);
  assert.throws(() => action(at('fuchsia'), 'facility-department-buy', {itemId:'greatball'}), /玉虹百货大厦/);
});

test('Rooftop vending and one-time drink trades are revision-safe and fail atomically', () => {
  const world = at('celadon');
  world.城市设施.departmentStore.floor = 'rooftop';
  world.训练家.金钱 = 1000;
  const fresh = facilities.options(world).find(option => option.id === 'facility-department-buy' && option.payload.itemId === 'freshwater');
  const bought = action(world, fresh.id, fresh.payload, 60);
  assert.equal(bought.背包.物品.freshwater, 1);
  assert.equal(bought.训练家.金钱, 800);
  assert.equal(facilities.view(bought).departmentStore.drinks.freshwater, 1);
  assert.equal(facilities.apply(bought, fresh.id, fresh.payload, {storyTurn:60}).背包.物品.freshwater, 1);
  const trade = facilities.options(bought).find(option => option.id === 'facility-rooftop-trade' && option.payload.drinkId === 'freshwater');
  const tmCount = bought.背包.物品.tm16;
  const exchanged = action(bought, trade.id, trade.payload, 60);
  assert.equal(exchanged.背包.物品.freshwater, 0);
  assert.equal(exchanged.背包.物品.tm16, tmCount + 1);
  assert.equal(exchanged.城市设施.departmentStore.traded.freshwater, true);
  const replay = facilities.apply(exchanged, trade.id, trade.payload, {storyTurn:60});
  assert.equal(replay.背包.物品.tm16, tmCount + 1);
  assert.equal(replay.背包.物品.freshwater, 0);
  assert.equal(facilities.options(exchanged).find(option => option.id === 'facility-rooftop-trade' && option.payload.drinkId === 'freshwater').enabled, false);

  for (const row of facilities.data.departmentStore.rooftopTrades.filter(item => item.drinkId !== 'freshwater')) {
    const save = at('celadon');
    save.城市设施.departmentStore.floor = 'rooftop';
    save.背包.物品[row.drinkId] = 1;
    const before = save.背包.物品[row.rewardId];
    const option = facilities.options(save).find(value => value.id === 'facility-rooftop-trade' && value.payload.drinkId === row.drinkId);
    assert.ok(option.enabled);
    const result = action(save, option.id, option.payload, 60);
    assert.equal(result.背包.物品[row.rewardId], before + 1, `${row.drinkId} awards ${row.rewardId}`);
    assert.equal(result.背包.物品[row.drinkId], 0);
  }

  const tooPoor = at('celadon');
  tooPoor.城市设施.departmentStore.floor = 'rooftop';
  tooPoor.训练家.金钱 = 199;
  assert.throws(() => action(tooPoor, 'facility-department-buy', {itemId:'freshwater'}), /金钱不足/);
  assert.throws(() => action(at('fuchsia'), 'facility-rooftop-trade', {drinkId:'freshwater'}), /玉虹百货大厦/);
  const blocked = at('celadon');
  blocked.城市设施.departmentStore.floor = 'rooftop';
  blocked.背包.物品.sodapop = 1;
  blocked.背包.物品.tm20 = 999;
  assert.throws(() => action(blocked, 'facility-rooftop-trade', {drinkId:'sodapop'}), /达到数量上限/);
  assert.equal(blocked.背包.物品.sodapop, 1, 'full reward inventory does not consume the drink');
  assert.equal(facilities.apply(blocked, 'facility-department-floor', {floor:'2F',revision:0}, {storyTurn:61}).城市设施.departmentStore.floor, '2F');
  const legacy = at('celadon');
  legacy.城市设施.departmentStore.drinks = {freshwater:2,sodapop:1,lemonade:0};
  legacy.城市设施.departmentStore.drinksMigrated = false;
  const migrated = facilities.ensure(legacy);
  assert.equal(migrated.背包.物品.freshwater, 2);
  assert.equal(migrated.背包.物品.sodapop, 1);
  assert.equal(Object.hasOwn(migrated.城市设施.departmentStore, 'drinks'), false);
  assert.equal(facilities.ensure(migrated).背包.物品.freshwater, 2, 'migration marker prevents duplicate item grants');
  const oldNoDept = at('celadon');
  delete oldNoDept.城市设施.departmentStore;
  assert.equal(facilities.ensure(oldNoDept).城市设施.departmentStore.floor, '2F');
});

test('revision options keep receipts bounded and reject stale or missing revisions', () => {
  let world = at('pewter');
  const missing = facilities.options(world)[0];
  assert.equal(missing.payload.revision, facilities.view(world).revision);
  const {revision, ...legacyPayload} = missing.payload;
  assert.equal(Number.isInteger(revision), true);
  assert.throws(() => facilities.apply(world, missing.id, legacyPayload, {storyTurn:1}), error => error.code === 'FACILITY_REVISION_REQUIRED');
  for (let i = 0; i < 70; i += 1) {
    const option = facilities.options(world)[0];
    world = action(world, option.id, option.payload, 44);
  }
  assert.equal(world.城市设施.revision, 70);
  assert.equal(Object.keys(world.城市设施.receipts).length, 64);
});

test('Safari source factors reproduce catch and flee probability shifts by species', () => {
  const mechanics = facilities.safariMechanics;
  const chansey = mechanics.targetFor({speciesId:113,level:23});
  assert.equal(chansey.catchRate, 30);
  assert.equal(chansey.catchFactor, 2);
  assert.equal(chansey.escapeFactor, 9);
  assert.equal(mechanics.fleeChance(chansey), 45);
  assert.deepEqual(mechanics.catchDetails(chansey), {catchRate:25,odds:12,shakeThreshold:30840,guaranteed:false});

  const bait = {...chansey,baitTurns:2,catchFactor:Math.max(3,chansey.catchFactor >> 1)};
  assert.equal(bait.catchFactor, 3);
  assert.equal(mechanics.fleeChance(bait), 10);
  assert.equal(mechanics.catchDetails(bait).odds, 19);

  const rock = {...chansey,rockTurns:2,catchFactor:Math.min(20,chansey.catchFactor << 1)};
  assert.equal(rock.catchFactor, 4);
  assert.equal(mechanics.fleeChance(rock), 90);
  assert.equal(mechanics.catchDetails(rock).odds, 25);

  const magikarp = mechanics.targetFor({speciesId:129,level:5});
  assert.equal(magikarp.catchFactor, 20);
  assert.equal(magikarp.escapeFactor, 2);
  assert.equal(mechanics.catchDetails(magikarp).odds, 127);
  assert.equal(mechanics.fleeChance(magikarp), 10);
});

test('Safari capture uses four source RNG checks even though only three shakes are visible', () => {
  const mechanics = facilities.safariMechanics;
  const target = mechanics.targetFor({speciesId:113,level:23});
  const details = mechanics.catchDetails(target);
  assert.equal(details.shakeThreshold, 30840);
  assert.equal(mechanics.roll16('test-seed','shake-0'), mechanics.roll16('test-seed','shake-0'));
  assert.ok(mechanics.roll16('test-seed','shake-0') >= 0 && mechanics.roll16('test-seed','shake-0') <= 65535);
  const draws = [0, 1, 2, details.shakeThreshold];
  const failedFourth = mechanics.resolveCatch(target, () => draws.shift());
  assert.deepEqual(failedFourth, {odds:12,threshold:30840,checks:3,attempts:4,shakes:3,success:false});

  let count = 0;
  const succeededFourth = mechanics.resolveCatch(target, () => { count += 1; return details.shakeThreshold - 1; });
  assert.deepEqual(succeededFourth, {odds:12,threshold:30840,checks:4,attempts:4,shakes:3,success:true});
  assert.equal(count, 4);
});

test('Safari starts at Fuchsia, uses source species factors, bait/rock rules, escape rolls and Safari Balls', () => {
  const world = at('fuchsia');
  world.训练家.金钱 = 499;
  assert.throws(() => action(world, 'facility-safari-enter', {}, 1), /500元/);
  world.训练家.金钱 = 1000;
  const entered = action(world, 'facility-safari-enter', {}, 1);
  assert.equal(entered.地图.节点, 'safari');
  assert.equal(entered.训练家.金钱, 500);
  assert.equal(entered.城市设施.safari.balls, 30);
  assert.equal(entered.城市设施.safari.steps, 600);
  assert.throws(() => action(at('safari'), 'facility-safari-enter', {}, 2), /入口/);
  assert.throws(() => action(world, 'facility-safari-throw', {}, 2), /园内/);
  assert.throws(() => action(entered, 'facility-safari-throw', {}, 2), /没有可投球/);

  // Reusing the same story turn works with a newer revision, while the 600-step counter advances.
  let firstWalk;
  for (let i = 0; i < 100 && !firstWalk; i += 1) {
    const candidate = action(entered, 'facility-safari-step', {seed:`walk-${i}`}, 20);
    if (!candidate.城市设施.safari.encounter) firstWalk = candidate;
  }
  assert.ok(firstWalk);
  const secondWalk = action(firstWalk, 'facility-safari-step', {seed:'walk-again'}, 20);
  assert.equal(secondWalk.城市设施.safari.steps, 598);

  // Search a deterministic encounter seed so the test covers a genuine pool result.
  let encountered, seed;
  for (let i = 0; i < 10000 && !encountered; i += 1) {
    try {
      const candidate = action(entered, 'facility-safari-step', {seed:String(i)}, 2 + i);
      if (candidate.城市设施.safari.encounter) { encountered = candidate; seed = i; }
    } catch { /* turn must remain unique; each attempt is isolated from entered */ }
  }
  assert.ok(encountered, 'expected to find a seed that produces a Safari encounter');
  const speciesId = encountered.城市设施.safari.encounter.speciesId;
  const speciesRates = facilities.data.safari.speciesMechanics[speciesId];
  assert.equal(encountered.城市设施.safari.encounter.catchRate, speciesRates.catchRate);
  assert.equal(encountered.城市设施.safari.encounter.fleeRate, speciesRates.fleeRate);
  assert.equal(encountered.城市设施.safari.encounter.catchFactor, Math.floor(speciesRates.catchRate * 100 / 1275));
  assert.equal(facilities.view(encountered).safari.encounter.speciesId, speciesId);
  assert.equal(facilities.view(encountered).safari.steps, entered.城市设施.safari.steps - 1);
  assert.ok(facilities.options(encountered).some(option => option.id === 'facility-safari-throw' && option.enabled));

  // Use a guaranteed-to-find high-rate source species fixture to exercise effects deterministically.
  encountered.城市设施.safari.encounter = {speciesId:129,level:5,catchRate:255,fleeRate:25,catchFactor:20,escapeFactor:2,baitTurns:0,rockTurns:0};
  let baited;
  for (let i = 0; i < 100 && !baited; i += 1) {
    const candidate = action(encountered, 'facility-safari-bait', {seed:String(i)}, 30000 + i);
    if (candidate.城市设施.safari.encounter) baited = candidate;
  }
  assert.ok(baited);
  assert.equal(baited.城市设施.safari.encounter.catchFactor, 10);
  assert.ok(baited.城市设施.safari.encounter.baitTurns >= 0);
  let rocked;
  for (let i = 0; i < 100 && !rocked; i += 1) {
    const candidate = action(baited, 'facility-safari-rock', {seed:String(i)}, 40000 + i);
    if (candidate.城市设施.safari.encounter) rocked = candidate;
  }
  assert.ok(rocked);
  assert.equal(rocked.城市设施.safari.encounter.catchFactor, 20);
  assert.ok(rocked.城市设施.safari.encounter.rockTurns >= 0);

  let firstBall;
  for (let i = 0; i < 100 && !firstBall; i += 1) {
    const candidate = action(rocked, 'facility-safari-throw', {seed:`same-turn-${i}`}, 60000);
    if (candidate.城市设施.safari.encounter && candidate.城市设施.safari.balls === 29) firstBall = candidate;
  }
  assert.ok(firstBall, 'expected a failed throw that leaves a target for the same-turn follow-up');
  const secondBall = action(firstBall, 'facility-safari-throw', {seed:'same-turn-second'}, 60000);
  assert.equal(secondBall.城市设施.safari.balls, 28);

  // The source catch algorithm produces a reproducible three-shake capture at high factor.
  let caught, caughtTurn;
  for (let i = 0; i < 1000 && !caught; i += 1) {
    const storyTurn = 50000 + i;
    const candidate = action(rocked, 'facility-safari-throw', {seed:String(i)}, storyTurn);
    if (candidate.城市设施.safari.catches) { caught = candidate; caughtTurn = storyTurn; }
  }
  assert.ok(caught);
  assert.ok([...caught.队伍, ...caught.电脑].some(mon => mon.图鉴编号 === 129 && mon.捕获球 === 'safariball' && mon.收服来源 === 'wild' && mon.捕获地点 === 'safari' && mon.uid.startsWith('caught-safari-')));
  assert.equal(caught.统计.捕获次数, 1);
  assert.equal(caught.城市设施.safari.balls, 29);

  const exited = action(caught, 'facility-safari-exit', {}, caughtTurn);
  const secondVisit = action(exited, 'facility-safari-enter', {}, caughtTurn);
  assert.equal(secondVisit.城市设施.safari.visit, 2);
  secondVisit.城市设施.safari.encounter = {speciesId:129,level:5,catchRate:255,fleeRate:25,catchFactor:20,escapeFactor:2,baitTurns:0,rockTurns:0};
  let secondCapture;
  for (let i = 0; i < 1000 && !secondCapture; i += 1) {
    const candidate = action(secondVisit, 'facility-safari-throw', {seed:`revisit-${i}`}, caughtTurn);
    if (candidate.城市设施.safari.catches) secondCapture = candidate;
  }
  assert.ok(secondCapture);
  const safariUids = [...secondCapture.队伍, ...secondCapture.电脑].filter(mon => mon.捕获地点 === 'safari').map(mon => mon.uid);
  assert.equal(new Set(safariUids).size, 2, 're-entering in the same story turn must not reuse a caught UID');
});

test('Safari capture refuses a completely full party and PC without spending a Safari Ball', () => {
  let variables = mvu.createInitialMvu();
  variables = mvu.chooseStarter(variables, 1);
  const world = root(variables);
  world.地图.节点 = 'fuchsia'; world.地图.地点 = '浅红市';
  world.战斗 = {轮次:0,状态:'finished',结果:'',摘要:'',操作序号:0}; world.遭遇 = null;
  let safari = action(world, 'facility-safari-enter', {}, 1);
  for (let i = 1; i < 6; i += 1) safari.队伍.push(mvu.makeMon(1, 5, `party-full-${i}`));
  safari.电脑 = Array.from({length:420}, (_, i) => mvu.makeMon(1, 5, `pc-full-${i}`));
  safari.城市设施.safari.encounter = {speciesId:129,level:5,catchRate:255,fleeRate:25,catchFactor:20,escapeFactor:2,baitTurns:0,rockTurns:0};
  const beforeBalls = safari.城市设施.safari.balls;
  assert.throws(() => action(safari, 'facility-safari-throw', {}, 2), /队伍和电脑都已满/);
  assert.equal(safari.城市设施.safari.balls, beforeBalls);
});

test('Safari does not expose actions during battle or after visit completion', () => {
  const world = at('fuchsia');
  world.战斗.状态 = 'active';
  assert.deepEqual(facilities.options(world), []);
  assert.throws(() => action(world, 'facility-safari-enter', {}, 1), /完成当前对战/);
});
