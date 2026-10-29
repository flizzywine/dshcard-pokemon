'use strict';

// Native world-state rules for town facilities. This module intentionally
// returns cloned world roots, leaving MVU and host integration to the caller.
const fs = require('node:fs');
const path = require('node:path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data/city-facilities.json'), 'utf8'));
const encounters = require('./frlg-encounters.cjs');
const {captureThreshold} = require('./capture-escape-rules.cjs');
const clone = value => structuredClone(value);
const GAME_CORNER_NODES = new Set(['celadon']);
const DEPARTMENT_NODES = new Set(['celadon']);
const SAFARI_GATE_NODES = new Set(['fuchsia']);
const SAFARI_PARK_NODES = new Set(['safari']);
const MAX_RECEIPTS = 64;

function root(world) {
  if (!world || typeof world !== 'object' || Array.isArray(world)) throw new TypeError('世界必须是对象。');
  return world;
}
function initialState() {
  return {
    schemaVersion: 1,
    revision: 0,
    gameCorner: {coinCase: false, coins: 0},
    departmentStore: {floor:'2F',traded:{freshwater:false,sodapop:false,lemonade:false},drinksMigrated:true},
    safari: {status: 'outside', visit: 0, balls: 0, steps: 0, encounter: null, encounters: 0, catches: 0},
    receipts: {}, lastVisit: null,
  };
}
function ensure(world) {
  const next = clone(root(world));
  if (!next.城市设施) next.城市设施 = initialState();
  const state = next.城市设施;
  if (!state.departmentStore || typeof state.departmentStore !== 'object' || Array.isArray(state.departmentStore)) state.departmentStore = initialState().departmentStore;
  if (!data.departmentStore.floors.some(floor => floor.id === state.departmentStore.floor)) state.departmentStore.floor = '2F';
  if (state.departmentStore.drinksMigrated !== true) {
    const legacyDrinks = state.departmentStore.drinks && typeof state.departmentStore.drinks === 'object' && !Array.isArray(state.departmentStore.drinks) ? state.departmentStore.drinks : {};
    const bag = next.背包?.物品;
    for (const trade of data.departmentStore.rooftopTrades) {
      const count = legacyDrinks[trade.drinkId] ?? 0;
      integer(count, 0, 999, `${trade.drinkName}旧库存`);
      if (!count) continue;
      if (!bag || !Object.hasOwn(bag, trade.drinkId)) throw Error(`背包目录中没有${trade.drinkId}，无法迁移百货饮料。`);
      integer(bag[trade.drinkId], 0, 999, '背包饮料数量');
      if (bag[trade.drinkId] + count > 999) throw Error(`${trade.drinkName}迁移后会超过背包上限。`);
      bag[trade.drinkId] += count;
    }
    delete state.departmentStore.drinks;
    state.departmentStore.drinksMigrated = true;
  } else if (Object.hasOwn(state.departmentStore, 'drinks')) delete state.departmentStore.drinks;
  if (!state.departmentStore.traded || typeof state.departmentStore.traded !== 'object' || Array.isArray(state.departmentStore.traded)) state.departmentStore.traded = {freshwater:false,sodapop:false,lemonade:false};
  for (const trade of data.departmentStore.rooftopTrades) if (typeof state.departmentStore.traded[trade.drinkId] !== 'boolean') state.departmentStore.traded[trade.drinkId] = false;
  if (!Number.isSafeInteger(state.revision) || state.revision < 0) state.revision = 0;
  if (!state.receipts || typeof state.receipts !== 'object' || Array.isArray(state.receipts) || Object.keys(state.receipts).some(id => !/^r\d+$/.test(id))) state.receipts = {};
  if (Object.keys(state.receipts).length > MAX_RECEIPTS) state.receipts = Object.fromEntries(Object.entries(state.receipts).slice(-MAX_RECEIPTS));
  if (state.safari && !Number.isSafeInteger(state.safari.visit)) state.safari.visit = state.safari.status === 'active' ? 1 : 0;
  if (state.safari?.encounter && state.safari.encounter.catchRate === undefined) state.safari.encounter = targetFor(state.safari.encounter);
  validate(next);
  return next;
}
function validate(world) {
  root(world);
  const state = world.城市设施;
  if (!state || typeof state !== 'object' || Array.isArray(state) || state.schemaVersion !== 1) throw Error('城市设施状态格式无效。');
  integer(state.revision, 0, Number.MAX_SAFE_INTEGER - 1, '设施版本');
  if (!state.gameCorner || typeof state.gameCorner.coinCase !== 'boolean') throw Error('游戏厅状态无效。');
  integer(state.gameCorner.coins, 0, data.gameCorner.coinLimit, '游戏厅代币');
  if (!state.departmentStore || !data.departmentStore.floors.some(floor => floor.id === state.departmentStore.floor)) throw Error('百货大厦楼层状态无效。');
  for (const trade of data.departmentStore.rooftopTrades) {
    if (typeof state.departmentStore.traded?.[trade.drinkId] !== 'boolean') throw Error(`${trade.drinkName}兑换记录无效。`);
  }
  if (!state.safari || !['outside','active','finished'].includes(state.safari.status)) throw Error('狩猎地带状态无效。');
  integer(state.safari.balls, 0, data.safari.balls, '狩猎球');
  integer(state.safari.steps, 0, data.safari.steps, '狩猎地带步数');
  integer(state.safari.encounters, 0, 1000000, '狩猎地带遭遇次数');
  integer(state.safari.catches, 0, 1000000, '狩猎地带捕获次数');
  integer(state.safari.visit, 0, 1000000, '狩猎访问次数');
  if (state.safari.encounter !== null) {
    const target = state.safari.encounter;
    if (!Number.isInteger(target.speciesId) || target.speciesId < 1 || target.speciesId > 151 || !Number.isInteger(target.level) || target.level < 1 || target.level > 100) throw Error('狩猎地带遭遇无效。');
    integer(target.catchRate, 1, 255, '目标捕获率'); integer(target.fleeRate, 0, 255, '目标逃走率');
    integer(target.catchFactor, 0, 20, '捕获系数'); integer(target.escapeFactor, 2, 20, '逃走系数');
    integer(target.baitTurns, 0, 6, '诱饵回合'); integer(target.rockTurns, 0, 6, '石头回合');
  }
  if (!state.receipts || typeof state.receipts !== 'object' || Array.isArray(state.receipts)) throw Error('设施收据状态无效。');
  if (Object.keys(state.receipts).length > MAX_RECEIPTS) throw Error('设施收据记录超过上限。');
  if (state.lastVisit !== null && (!state.lastVisit || typeof state.lastVisit.id !== 'string' || typeof state.lastVisit.name !== 'string' || typeof state.lastVisit.node !== 'string' || !Number.isSafeInteger(state.lastVisit.storyTurn) || state.lastVisit.storyTurn < 0)) throw Error('设施访问记录无效。');
  for (const [id, receipt] of Object.entries(state.receipts)) {
    if (!/^r[0-9]+$/.test(id) || !receipt || typeof receipt !== 'object' || typeof receipt.action !== 'string' || !receipt.payload || typeof receipt.payload !== 'object' || typeof receipt.result !== 'string' || !Number.isSafeInteger(receipt.nextRevision)) throw Error('设施收据无效。');
  }
  return world;
}
function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw Error(`${label}必须是${min}到${max}之间的整数。`);
  return value;
}
function at(world, nodes) { return nodes.has(world.地图?.节点); }
function assertLocation(world, nodes, label) {
  if (!at(world, nodes)) throw Error(`只能在${label}使用此设施。`);
}
function assertOutsideBattle(world) {
  if (world.战斗?.状态 === 'active' || world.战斗?.状态 === 'pending') throw Error('完成当前对战后才能使用城市设施。');
}
function turnOf(context) {
  const turn = context?.storyTurn;
  return integer(turn, 0, 1000000, '故事轮次');
}
function stripRevision(payload) { const {revision, ...rest} = payload || {}; return rest; }
function payloadFingerprint(payload) { const value = stripRevision(payload); return JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]))); }
function revisionError(message) { const error = Error(message); error.code = 'STALE_FACILITY_REVISION'; return error; }
function requestedRevision(payload) {
  if (!Object.hasOwn(payload || {}, 'revision')) { const error = Error('设施操作缺少最新revision，请从view/world选项重新获取。'); error.code = 'FACILITY_REVISION_REQUIRED'; throw error; }
  return integer(payload.revision, 0, Number.MAX_SAFE_INTEGER - 1, '设施版本');
}
function replayResult(world, action, payload, revision) {
  const state = world.城市设施;
  if (revision === state.revision) return null;
  const receipt = state.receipts[`r${revision}`];
  if (receipt?.action === action && payloadFingerprint(receipt.payload) === payloadFingerprint(payload)) return world;
  throw revisionError('设施状态已经更新，请读取最新选项后重试。');
}
function finish(next, action, payload, revision, result) {
  const state = next.城市设施;
  state.revision = revision + 1;
  state.receipts[`r${revision}`] = {action, payload:stripRevision(payload), result, nextRevision:state.revision};
  while (Object.keys(state.receipts).length > MAX_RECEIPTS) delete state.receipts[`r${Math.min(...Object.keys(state.receipts).map(key => Number(key.slice(1))))}`];
  validate(next);
  return next;
}
function coins(world) {
  const wallet = world.城市设施.gameCorner;
  if (!wallet.coinCase) throw Error('需要先在玉虹游戏厅领取代币盒。');
  return wallet;
}
function roll(seed, context) {
  const text = `${String(seed)}|${context}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  h = Math.imul(h ^ h >>> 16, 0x7feb352d); h = Math.imul(h ^ h >>> 15, 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function targetFor(encounter) {
  const rates = data.safari.speciesMechanics[encounter.speciesId];
  if (!rates) throw Error(`缺少${encounter.speciesId}号宝可梦的Safari捕获数据。`);
  return {...encounter, name:require('./engine.cjs').catalog.species.find(mon=>mon.id===encounter.speciesId)?.name, catchRate:rates.catchRate, fleeRate:rates.fleeRate,
    catchFactor:Math.floor(rates.catchRate * 100 / 1275),
    escapeFactor:Math.max(2, Math.floor(rates.fleeRate * 100 / 1275)), baitTurns:0, rockTurns:0};
}
function safariFleeChance(target) {
  if (target.rockTurns) return Math.min(20, target.escapeFactor * 2) * 5;
  if (target.baitTurns) return Math.max(1, Math.floor(target.escapeFactor / 4)) * 5;
  return target.escapeFactor * 5;
}
function afterTargetAction(safari, seed, context) {
  const target = safari.encounter;
  if (!target) return {fled:false, chance:0};
  const chance = safariFleeChance(target);
  const fled = Math.floor(roll(seed, `${context}|wild-flee`) * 100) < chance;
  if (fled) safari.encounter = null;
  else if (target.rockTurns > 0) {
    target.rockTurns -= 1;
    if (!target.rockTurns) target.catchFactor = Math.floor(target.catchRate * 100 / 1275);
  } else if (target.baitTurns > 0) target.baitTurns -= 1;
  return {fled, chance};
}
function safariCatchDetails(target) {
  const catchRate = Math.floor(target.catchFactor * 1275 / 100);
  // Safari Ball has the source game's 1.5x bonus. Safari targets begin at full HP.
  const odds = Math.floor(Math.floor(catchRate * 15 / 10) / 3);
  return {catchRate, odds, shakeThreshold:captureThreshold(odds), guaranteed:odds > 254};
}
function safariRoll16(seed, context) { return Math.floor(roll(seed, context) * 65536); }
function resolveSafariCatch(target, random16) {
  const details = safariCatchDetails(target);
  if (details.guaranteed) return {odds:details.odds, threshold:details.shakeThreshold, checks:4, attempts:0, shakes:3, success:true};
  if (typeof random16 !== 'function') throw new TypeError('Safari捕获需要一个16位随机数函数。');
  let checks = 0, attempts = 0;
  while (checks < 4) {
    attempts += 1;
    if (random16() >= details.shakeThreshold) break;
    checks += 1;
  }
  return {odds:details.odds, threshold:details.shakeThreshold, checks, attempts, shakes:Math.min(checks, 3), success:checks === 4};
}
function safariCatch(target, seed, context) {
  let checks = 0;
  return resolveSafariCatch(target, () => safariRoll16(seed, `${context}|shake-${checks++}`)).success;
}
function options(world) {
  const w = ensure(root(world)), node = w.地图?.节点, state = w.城市设施, out = [];
  if (w.战斗?.状态 === 'active' || w.战斗?.状态 === 'pending') return out;
  const add = (id, label, enabled = true, reason = '', payload = {}) => out.push({id, label, enabled, reason, payload:{...payload, revision:state.revision}});
  const townId = node === 'safari' ? 'fuchsia' : node;
  const town = data.towns[townId];
  for (const venue of town?.facilities || []) {
    // The safari entrance is actionable through the dedicated fee/steps actions.
    if ((node === 'safari' || node === 'fuchsia') && venue.id === 'safari-zone') continue;
    out.push({id:'facility-info', label:venue.name, enabled:true, payload:{facilityId:venue.id, revision:state.revision}, description:venue.description, primaryAction:venue.primaryAction});
  }
  if (GAME_CORNER_NODES.has(node)) {
    add('facility-coin-case', state.gameCorner.coinCase ? '已领取代币盒' : '领取代币盒', !state.gameCorner.coinCase, state.gameCorner.coinCase ? '已领取' : '');
    if (state.gameCorner.coinCase) {
      for (const pack of data.gameCorner.coinPurchases) add('facility-buy-coins', `购买${pack.coins}枚代币（${pack.yen}元）`, true, '', {coins:pack.coins});
      for (const prize of data.gameCorner.prizes) add('facility-claim-prize', `${prize.name}（${prize.coins}枚代币）`, state.gameCorner.coins >= prize.coins, state.gameCorner.coins >= prize.coins ? '' : '代币不足', {itemId:prize.id});
      const version = w.设置?.版本 === 'leafgreen' ? 'leafgreen' : 'firered';
      const boxFull = w.队伍.length >= 6 && w.电脑.length >= 420;
      for (const prize of data.gameCorner.pokemonPrizes.filter(item => item.version === version)) {
        const canAfford = state.gameCorner.coins >= prize.coins;
        add('facility-claim-pokemon', `兑换${prize.name} Lv.${prize.level}（${prize.coins}枚代币）`, canAfford && !boxFull,
          boxFull ? '队伍和电脑都已满' : canAfford ? '' : '代币不足', {speciesId:prize.speciesId});
      }
    }
  }
  if (DEPARTMENT_NODES.has(node)) {
    const department = state.departmentStore, bag = w.背包?.物品 || {};
    for (const floor of data.departmentStore.activeFloors) {
      if (department.floor === floor) continue;
      add('facility-department-floor', `前往${data.departmentStore.floors.find(row => row.id === floor).name}`, true, '', {floor});
    }
    for (const good of data.departmentStore.goods[department.floor] || []) {
      const quantity = bag[good.id];
      const canBuy = Number.isInteger(quantity) && quantity < 999;
      add('facility-department-buy', `购买${good.name}（${good.price}元）`, canBuy, canBuy ? '' : '库存已达上限', {itemId:good.id,count:1});
    }
    if (department.floor === 'rooftop') for (const trade of data.departmentStore.rooftopTrades) {
      const available = !department.traded[trade.drinkId] && Number.isInteger(bag[trade.drinkId]) && bag[trade.drinkId] > 0 && Number.isInteger(bag[trade.rewardId]) && bag[trade.rewardId] < 999;
      const reason = department.traded[trade.drinkId] ? '此兑换已领取' : !(bag[trade.drinkId] > 0) ? `需要${trade.drinkName}` : available ? '' : '奖励物品已达数量上限';
      add('facility-rooftop-trade', `交出${trade.drinkName}兑换${trade.rewardName}`, available, reason, {drinkId:trade.drinkId});
    }
  }
  if (SAFARI_GATE_NODES.has(node)) {
    add('facility-safari-enter', `进入狩猎地带（${data.safari.entryFee}元）`, w.训练家?.金钱 >= data.safari.entryFee, w.训练家?.金钱 < data.safari.entryFee ? '金钱不足' : '');
  }
  if (SAFARI_PARK_NODES.has(node) && state.safari.status === 'active') {
    const target = state.safari.encounter;
    if (target) {
      add('facility-safari-throw', `投掷狩猎球（剩余${state.safari.balls}球）`, state.safari.balls > 0, state.safari.balls > 0 ? '' : '狩猎球已用完');
      add('facility-safari-bait', '投掷诱饵');
      add('facility-safari-rock', '投掷石头');
      add('facility-safari-watch', '观察野生宝可梦');
      add('facility-safari-run', '从这场遭遇逃走');
    } else add('facility-safari-step', `在狩猎地带前进（剩余${state.safari.steps}步）`, state.safari.steps > 0, state.safari.steps > 0 ? '' : '步数已用完', {steps:1});
    add('facility-safari-exit', '结束狩猎并返回浅红市');
  }
  return out;
}
function view(world) {
  const w = ensure(root(world)), node = w.地图?.节点, town = data.towns[node === 'safari' ? 'fuchsia' : node] || null, state = w.城市设施;
  const currentFloor = state.departmentStore.floor;
  const currentGoods = (data.departmentStore.goods[currentFloor] || []).map(good => ({...good, quantity:w.背包?.物品?.[good.id] ?? 0}));
  const drinkInventory = Object.fromEntries(data.departmentStore.rooftopTrades.map(trade => [trade.drinkId,w.背包?.物品?.[trade.drinkId] ?? 0]));
  const trades = data.departmentStore.rooftopTrades.map(trade => ({...trade, drinks:drinkInventory[trade.drinkId], claimed:state.departmentStore.traded[trade.drinkId]}));
  return {node, context:town?.summary || '', facilities:clone(town?.facilities || []), revision:state.revision, gameCorner:clone(state.gameCorner),
    departmentStore:{floor:currentFloor,floors:clone(data.departmentStore.floors),goods:currentGoods,drinks:drinkInventory,exchange:trades},
    safari:clone(state.safari), options:options(w)};
}

function apply(world, action, payload = {}, context = {}) {
  const original = root(world);
  const next = ensure(clone(original)), w = next, state = w.城市设施;
  const turn = turnOf(context);
  const revision = requestedRevision(payload);
  const replay = replayResult(w, action, payload, revision);
  if (replay) return replay;
  assertOutsideBattle(w);
  switch (action) {
    case 'facility-info': {
      const townId = w.地图?.节点 === 'safari' ? 'fuchsia' : w.地图?.节点;
      const venue = data.towns[townId]?.facilities.find(item => item.id === payload.facilityId);
      if (!venue) throw Error('该设施不在当前城镇。');
      state.lastVisit = {id:venue.id,name:venue.name,node:w.地图?.节点 || '',storyTurn:turn};
      return finish(w, action, payload, revision, `visited-${venue.id}`);
    }
    case 'facility-coin-case': {
      assertLocation(w, GAME_CORNER_NODES, '玉虹游戏厅');
      if (state.gameCorner.coinCase) throw Error('已经领取过代币盒。');
      state.gameCorner.coinCase = true;
      if (!w.背包?.关键物品) throw Error('背包缺少关键物品栏。');
      if (!w.背包.关键物品.some(item => item?.id === 'coin-case')) w.背包.关键物品.push({id:'coin-case',名称:'代币盒',说明:'可存放玉虹游戏厅代币。',类型:'关键物品'});
      return finish(w, action, payload, revision, 'coin-case-received');
    }
    case 'facility-buy-coins': {
      assertLocation(w, GAME_CORNER_NODES, '玉虹游戏厅');
      const wallet = coins(w), pack = data.gameCorner.coinPurchases.find(item => item.coins === payload.coins);
      if (!pack) throw Error('请选择50枚或500枚代币。');
      integer(w.训练家?.金钱, 0, 9999999, '训练家金钱');
      if (w.训练家.金钱 < pack.yen) throw Error('金钱不足，无法购买代币。');
      if (wallet.coins + pack.coins > data.gameCorner.coinLimit) throw Error('代币盒最多只能存放9999枚代币。');
      w.训练家.金钱 -= pack.yen; wallet.coins += pack.coins;
      return finish(w, action, payload, revision, `bought-${pack.coins}-coins`);
    }
    case 'facility-claim-prize': {
      assertLocation(w, GAME_CORNER_NODES, '玉虹游戏厅');
      const wallet = coins(w), prize = data.gameCorner.prizes.find(item => item.id === payload.itemId);
      if (!prize) throw Error('未提供的奖品。');
      const bag = w.背包?.物品;
      if (!bag || !Object.hasOwn(bag, prize.id)) throw Error(`背包目录中没有${prize.id}。`);
      integer(bag[prize.id], 0, 999, '背包物品数量');
      if (wallet.coins < prize.coins) throw Error('代币不足，无法兑换该奖品。');
      if (bag[prize.id] >= 999) throw Error('背包中的该物品已达到数量上限。');
      wallet.coins -= prize.coins; bag[prize.id] += 1;
      return finish(w, action, payload, revision, `prize-${prize.id}`);
    }
    case 'facility-claim-pokemon': {
      assertLocation(w, GAME_CORNER_NODES, '玉虹游戏厅');
      const wallet = coins(w);
      const version = w.设置?.版本 === 'leafgreen' ? 'leafgreen' : 'firered';
      const prize = data.gameCorner.pokemonPrizes.find(item => item.speciesId === payload.speciesId && item.version === version);
      if (!prize) throw Error('当前版本没有提供这只奖品精灵。');
      if (wallet.coins < prize.coins) throw Error('代币不足，无法兑换该精灵。');
      if (!Array.isArray(w.队伍) || !Array.isArray(w.电脑)) throw Error('队伍或电脑数据无效。');
      if (w.队伍.length >= 6 && w.电脑.length >= 420) throw Error('队伍和电脑都已满，不能兑换该精灵。');
      const mvu = require('./mvu.cjs');
      const mon = mvu.makeMon(prize.speciesId, prize.level, `game-corner-${revision}-${prize.speciesId}`);
      (w.队伍.length < 6 ? w.队伍 : w.电脑).push(mon);
      if (wallet.coins > data.gameCorner.coinLimit) throw Error('代币盒状态无效。');
      wallet.coins -= prize.coins;
      if (!w.统计 || typeof w.统计 !== 'object') w.统计 = {};
      if (!Array.isArray(w.统计.见过图鉴)) w.统计.见过图鉴 = [];
      if (!Array.isArray(w.统计.捕获图鉴)) w.统计.捕获图鉴 = [];
      if (!w.统计.见过图鉴.includes(prize.speciesId)) w.统计.见过图鉴.push(prize.speciesId);
      if (!w.统计.捕获图鉴.includes(prize.speciesId)) w.统计.捕获图鉴.push(prize.speciesId);
      return finish(w, action, payload, revision, `pokemon-${prize.speciesId}`);
    }
    case 'facility-department-floor': {
      assertLocation(w, DEPARTMENT_NODES, '玉虹百货大厦');
      if (!data.departmentStore.activeFloors.includes(payload.floor)) throw Error('请选择可使用服务的百货楼层。');
      state.departmentStore.floor = payload.floor;
      return finish(w, action, payload, revision, `department-floor-${payload.floor}`);
    }
    case 'facility-department-buy': {
      assertLocation(w, DEPARTMENT_NODES, '玉虹百货大厦');
      const department = state.departmentStore;
      const good = (data.departmentStore.goods[department.floor] || []).find(item => item.id === payload.itemId);
      if (!good) throw Error('该商品不在当前楼层出售。');
      const count = payload.count === undefined ? 1 : integer(payload.count, 1, 99, '购买数量');
      integer(w.训练家?.金钱, 0, 9999999, '训练家金钱');
      if (w.训练家.金钱 < good.price * count) throw Error('金钱不足，无法购买。');
      const bag = w.背包?.物品;
      if (!bag || !Object.hasOwn(bag, good.id)) throw Error(`背包目录中没有${good.id}。`);
      integer(bag[good.id], 0, 999, '背包物品数量');
      if (bag[good.id] + count > 999) throw Error('背包中的该物品已达到数量上限。');
      bag[good.id] += count;
      w.训练家.金钱 -= good.price * count;
      return finish(w, action, payload, revision, `department-bought-${good.id}-${count}`);
    }
    case 'facility-rooftop-trade': {
      assertLocation(w, DEPARTMENT_NODES, '玉虹百货大厦');
      const department = state.departmentStore;
      if (department.floor !== 'rooftop') throw Error('请先前往百货大厦顶楼。');
      const trade = data.departmentStore.rooftopTrades.find(item => item.drinkId === payload.drinkId);
      if (!trade) throw Error('未提供此饮料兑换。');
      if (department.traded[trade.drinkId]) throw Error('这份饮料兑换已经领取过。');
      const bag = w.背包?.物品;
      if (!bag || !Object.hasOwn(bag, trade.drinkId)) throw Error(`背包目录中没有${trade.drinkId}。`);
      integer(bag[trade.drinkId], 0, 999, '背包饮料数量');
      if (bag[trade.drinkId] < 1) throw Error(`需要先购买${trade.drinkName}。`);
      if (!Object.hasOwn(bag, trade.rewardId)) throw Error(`背包目录中没有${trade.rewardId}。`);
      integer(bag[trade.rewardId], 0, 999, '背包物品数量');
      if (bag[trade.rewardId] >= 999) throw Error('背包中的奖励机器已达到数量上限。');
      bag[trade.drinkId] -= 1;
      department.traded[trade.drinkId] = true;
      bag[trade.rewardId] += 1;
      return finish(w, action, payload, revision, `rooftop-trade-${trade.rewardId}`);
    }
    case 'facility-safari-enter': {
      assertLocation(w, SAFARI_GATE_NODES, '浅红市狩猎地带入口');
      if (state.safari.status === 'active') throw Error('当前狩猎尚未结束。');
      integer(w.训练家?.金钱, 0, 9999999, '训练家金钱');
      if (w.训练家.金钱 < data.safari.entryFee) throw Error('狩猎地带入场费为500元。');
      const visit = state.safari.visit + 1;
      w.训练家.金钱 -= data.safari.entryFee;
      state.safari = {status:'active',visit,balls:data.safari.balls,steps:data.safari.steps,encounter:null,encounters:0,catches:0};
      w.地图.节点 = 'safari'; w.地图.地点 = '狩猎地带';
      return finish(w, action, payload, revision, 'safari-entered');
    }
    case 'facility-safari-step': {
      assertLocation(w, SAFARI_PARK_NODES, '狩猎地带园内');
      const safari = state.safari;
      if (safari.status !== 'active') throw Error('请先进入狩猎地带。');
      if (safari.encounter) throw Error('请先处理当前野生宝可梦。');
      if (!safari.steps) { safari.status = 'finished'; w.地图.节点 = 'fuchsia'; w.地图.地点 = '浅红市'; return finish(w, action, payload, revision, 'safari-steps-expired'); }
      const count = payload.steps === undefined ? 1 : integer(payload.steps, 1, 100, '前进步数');
      const used = Math.min(count, safari.steps);
      safari.steps -= used;
      if (safari.steps === 0) { safari.status = 'finished'; w.地图.节点 = 'fuchsia'; w.地图.地点 = '浅红市'; return finish(w, action, payload, revision, 'safari-steps-expired'); }
      const version = w.设置?.版本 === 'leafgreen' ? 'leafgreen' : 'firered';
      const pool = encounters.pool('safari', {version, method:'land'});
      let encounter = null;
      for (let step = 0; step < used; step += 1) {
        const attempt = safari.encounters + step;
        if (roll(`${turn}|r${revision}|${payload.seed ?? ''}`, `safari-step|${attempt}`) < pool.rate / 256) {
          encounter = encounters.roll('safari', {version, method:'land', seed:`${turn}|r${revision}|${payload.seed ?? ''}|${attempt}`});
          safari.encounters += step + 1;
          break;
        }
      }
      if (!encounter) safari.encounters += used;
      if (encounter) {
        safari.encounter = targetFor(encounter);
        if (!w.统计 || typeof w.统计 !== 'object') w.统计 = {};
        if (!Array.isArray(w.统计.见过图鉴)) w.统计.见过图鉴 = [];
        if (!w.统计.见过图鉴.includes(encounter.speciesId)) w.统计.见过图鉴.push(encounter.speciesId);
      }
      return finish(w, action, payload, revision, encounter ? `safari-encounter-${encounter.speciesId}` : 'safari-no-encounter');
    }
    case 'facility-safari-throw': {
      assertLocation(w, SAFARI_PARK_NODES, '狩猎地带园内');
      const safari = state.safari;
      if (safari.status !== 'active' || !safari.encounter) throw Error('当前没有可投球的狩猎地带遭遇。');
      if (safari.balls < 1) throw Error('狩猎球已用完。');
      if (w.队伍.length >= 6 && w.电脑.length >= 420) throw Error('队伍和电脑都已满，不能安全收服这只宝可梦。');
      safari.balls -= 1;
      const actionSeed = `${turn}|r${revision}|${payload.seed ?? ''}`;
      const caught = safariCatch(safari.encounter, actionSeed, `safari-catch|${safari.encounters}|${safari.balls}`);
      let fled = false;
      if (caught) {
        const mvu = require('./mvu.cjs');
        const wild = mvu.makeMon(safari.encounter.speciesId, safari.encounter.level, `caught-safari-${safari.visit}-${safari.encounters}-${turn}`, {wild:true});
        wild.收服来源 = 'wild'; wild.收服图鉴编号 = wild.图鉴编号; wild.捕获球 = 'safariball'; wild.捕获地点 = 'safari';
        (w.队伍.length < 6 ? w.队伍 : w.电脑).push(wild);
        if (!w.统计 || typeof w.统计 !== 'object') w.统计 = {};
        if (!w.剧情 || typeof w.剧情 !== 'object') w.剧情 = {};
        w.统计.捕获次数 = (w.统计.捕获次数 || 0) + 1; w.剧情.捕获次数 = w.统计.捕获次数;
        if (!Array.isArray(w.统计.捕获图鉴)) w.统计.捕获图鉴 = [];
        if (!Array.isArray(w.统计.见过图鉴)) w.统计.见过图鉴 = [];
        if (!w.统计.捕获图鉴.includes(wild.图鉴编号)) w.统计.捕获图鉴.push(wild.图鉴编号);
        if (!w.统计.见过图鉴.includes(wild.图鉴编号)) w.统计.见过图鉴.push(wild.图鉴编号);
        safari.catches += 1; safari.encounter = null;
      } else {
        fled = afterTargetAction(safari, actionSeed, `ball|${safari.encounters}`).fled;
      }
      if (safari.balls === 0 || safari.steps === 0) { safari.status = 'finished'; w.地图.节点 = 'fuchsia'; w.地图.地点 = '浅红市'; }
      return finish(w, action, payload, revision, caught ? 'safari-caught' : fled ? 'safari-target-fled' : 'safari-ball-failed');
    }
    case 'facility-safari-bait':
    case 'facility-safari-rock':
    case 'facility-safari-watch': {
      assertLocation(w, SAFARI_PARK_NODES, '狩猎地带园内');
      const safari = state.safari, target = safari.encounter;
      if (safari.status !== 'active' || !target) throw Error('当前没有狩猎地带遭遇。');
      const actionSeed = `${turn}|r${revision}|${payload.seed ?? ''}`, contextKey = `${action}|${safari.encounters}`;
      if (action === 'facility-safari-bait') {
        target.baitTurns = Math.min(6, target.baitTurns + 2 + Math.floor(roll(actionSeed, `${contextKey}|bait-duration`) * 5));
        target.rockTurns = 0;
        target.catchFactor = Math.max(3, target.catchFactor >> 1);
      } else if (action === 'facility-safari-rock') {
        target.rockTurns = Math.min(6, target.rockTurns + 2 + Math.floor(roll(actionSeed, `${contextKey}|rock-duration`) * 5));
        target.baitTurns = 0;
        target.catchFactor = Math.min(20, target.catchFactor << 1);
      }
      const outcome = afterTargetAction(safari, actionSeed, contextKey);
      return finish(w, action, payload, revision, outcome.fled ? 'safari-target-fled' : action.replace('facility-', ''));
    }
    case 'facility-safari-run': {
      assertLocation(w, SAFARI_PARK_NODES, '狩猎地带园内');
      if (state.safari.status !== 'active' || !state.safari.encounter) throw Error('当前没有可逃走的遭遇。');
      state.safari.encounter = null;
      return finish(w, action, payload, revision, 'safari-ran-from-target');
    }
    case 'facility-safari-exit': {
      assertLocation(w, SAFARI_PARK_NODES, '狩猎地带园内');
      if (state.safari.status !== 'active') throw Error('当前没有进行中的狩猎。');
      state.safari.status = 'finished'; state.safari.encounter = null;
      w.地图.节点 = 'fuchsia'; w.地图.地点 = '浅红市';
      return finish(w, action, payload, revision, 'safari-ended');
    }
    default: throw Error(`未知城市设施行动：${String(action)}。`);
  }
}

module.exports = {data, ensure, validate, view, options, apply,
  safariMechanics:{targetFor, fleeChance:safariFleeChance, catchDetails:safariCatchDetails,
    resolveCatch:resolveSafariCatch, roll16:safariRoll16}};
