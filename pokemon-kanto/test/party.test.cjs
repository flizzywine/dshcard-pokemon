'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mvu = require('../mvu.cjs');
const {catalog} = require('../engine.cjs');
const party = require('../party.cjs');

function starter() { return mvu.chooseStarter(mvu.createInitialMvu(), 1); }
function worldOf(variables) { return variables.stat_data.宝可梦; }
function addMon(variables, id, uid, level = 20) {
  const next = structuredClone(variables);
  const world = worldOf(next);
  world.队伍 = [mvu.makeMon(id, level, uid)];
  return next;
}

test('forgetMove uses the visible 1-based slot, returns a clone, and keeps one usable move', () => {
  const original = starter();
  const uid = worldOf(original).队伍[0].uid;
  const originalMoves = structuredClone(worldOf(original).队伍[0].招式);
  const next = party.forgetMove(original, uid, 1);
  assert.notEqual(next, original);
  assert.equal(worldOf(next).队伍[0].招式.length, originalMoves.length - 1);
  assert.deepEqual(worldOf(original).队伍[0].招式, originalMoves);
  assert.throws(() => party.forgetMove(next, uid, 0), /1-based/);

  const single = structuredClone(next);
  worldOf(single).队伍[0].招式 = [worldOf(single).队伍[0].招式[0]];
  assert.throws(() => party.forgetMove(single, uid, 1), /至少要保留一个招式/);
});

test('party configuration changes are blocked during a live battle', () => {
  const active = starter();
  const world = worldOf(active);
  world.战斗.状态 = 'active';
  const uid = world.队伍[0].uid;
  assert.throws(() => party.forgetMove(active, uid, 1), /战斗中/);
  assert.throws(() => party.holdItem(active, uid, 'oranberry'), /战斗中/);
  assert.throws(() => party.evolvePokemon(active, uid, 'firestone'), /战斗中/);
  assert.equal(world.队伍[0].招式.length, 2);
  assert.equal(world.背包.物品.oranberry, 0);
});

test('holding, replacing, and taking an item keep inventory counts exact', () => {
  const original = starter();
  const uid = worldOf(original).队伍[0].uid;
  worldOf(original).背包.物品.oranberry = 1;
  worldOf(original).背包.物品.sitrusberry = 1;
  const held = party.holdItem(original, uid, 'oranberry');
  assert.equal(worldOf(held).队伍[0].携带道具, 'oranberry');
  assert.equal(worldOf(held).背包.物品.oranberry, 0);
  assert.equal(worldOf(original).背包.物品.oranberry, 1, 'input snapshot is not changed');

  const replaced = party.holdItem(held, uid, 'sitrusberry');
  assert.equal(worldOf(replaced).队伍[0].携带道具, 'sitrusberry');
  assert.equal(worldOf(replaced).背包.物品.oranberry, 1, 'replaced held item returns to the bag');
  assert.equal(worldOf(replaced).背包.物品.sitrusberry, 0);

  const removed = party.takeHeldItem(replaced, uid);
  assert.equal(worldOf(removed).队伍[0].携带道具, '');
  assert.equal(worldOf(removed).背包.物品.sitrusberry, 1);
  assert.equal(worldOf(replaced).背包.物品.sitrusberry, 0);
});

test('invalid, exhausted, and capped held-item operations do not consume anything', () => {
  const variables = starter();
  const world = worldOf(variables);
  const uid = world.队伍[0].uid;
  assert.throws(() => party.holdItem(variables, uid, 'potion'), /不能作为/);
  assert.throws(() => party.holdItem(variables, uid, 'oranberry'), /没有可携带/);
  world.队伍[0].携带道具 = 'oranberry';
  world.背包.物品.oranberry = 999;
  assert.throws(() => party.takeHeldItem(variables, uid), /数量上限/);
  assert.equal(world.背包.物品.oranberry, 999);
  assert.equal(world.队伍[0].携带道具, 'oranberry');
});

test('Fire Stone evolves a valid Kanto species, consumes one stone, and preserves damage and legal moves', () => {
  const variables = addMon(starter(), 37, 'vulpix-1', 24);
  const world = worldOf(variables);
  const mon = world.队伍[0];
  world.背包.物品.firestone = 1;
  mon.当前HP = Math.floor(mon.能力值.hp / 2);
  const oldMax = mon.能力值.hp;
  const oldHp = mon.当前HP;
  const oldMoves = structuredClone(mon.招式);

  const next = party.evolvePokemon(variables, mon.uid, 'firestone');
  const evolved = worldOf(next).队伍[0];
  assert.equal(evolved.图鉴编号, 38);
  assert.equal(evolved.昵称, mvu.makeMon(38, 1, 'name').昵称);
  assert.equal(worldOf(next).背包.物品.firestone, 0);
  assert.equal(evolved.当前HP, Math.max(0, Math.min(evolved.能力值.hp, oldHp + evolved.能力值.hp - oldMax)));
  assert.deepEqual(evolved.招式, oldMoves.filter(move => catalog.species.find(species => species.id === 38).moves.includes(move.id)));
  assert.ok(evolved.招式.length >= 1);
  assert.equal(worldOf(variables).队伍[0].图鉴编号, 37, 'the source MVU stays unchanged');
  assert.equal(mvu.validateMvu(next), true);
});

test('stone mismatch and unavailable evolution leave the inventory and Pokémon unchanged', () => {
  const variables = addMon(starter(), 37, 'vulpix-2');
  const world = worldOf(variables);
  world.背包.物品.waterstone = 1;
  const before = structuredClone(world);
  assert.throws(() => party.evolvePokemon(variables, 'vulpix-2', 'waterstone'), /不能使用Water Stone/);
  assert.deepEqual(worldOf(variables), before);
  assert.throws(() => party.evolvePokemon(variables, 'vulpix-2', 'firestone'), /没有Fire Stone/);
  assert.throws(() => party.evolvePokemon(variables, 'vulpix-2'), /没有可用的关都进化方式/);

  const machoke = addMon(starter(), 67, 'machoke-1');
  assert.throws(() => party.evolvePokemon(machoke, 'machoke-1'), /需要交换/);
  assert.equal(worldOf(machoke).队伍[0].图鉴编号, 67, 'trade evolution is never granted locally');
});

test('evolution preserves a fainted Pokémon at zero HP and maps the ability to the target species', () => {
  const variables = addMon(starter(), 25, 'pikachu-1');
  const world = worldOf(variables);
  const mon = world.队伍[0];
  world.背包.物品.thunderstone = 1;
  mon.当前HP = 0;
  const next = party.evolvePokemon(variables, mon.uid, 'thunderstone');
  const evolved = worldOf(next).队伍[0];
  assert.equal(evolved.图鉴编号, 26);
  assert.equal(evolved.当前HP, 0);
  assert.equal(evolved.特性, 'Static');
  assert.equal(worldOf(next).背包.物品.thunderstone, 0);
  assert.equal(mvu.validateMvu(next), true);
});

test('manageParty dispatches the public actions and rejects unknown operations', () => {
  const variables = starter();
  const uid = worldOf(variables).队伍[0].uid;
  worldOf(variables).背包.物品.oranberry = 1;
  assert.equal(worldOf(party.manageParty(variables, 'holdItem', {uid, itemId: 'oranberry'})).队伍[0].携带道具, 'oranberry');
  assert.throws(() => party.manageParty(variables, 'anything', {}), /未知队伍管理操作/);
});

function withTwoPartyMembers() {
  const variables = starter();
  const world = worldOf(variables);
  world.队伍.push(mvu.makeMon(25, 12, 'pikachu-lead-test'));
  world.背包.物品.oranberry = 3;
  world.背包.物品.potion = 2;
  return variables;
}

test('setLead reorders a cloned MVU by UID without changing the party snapshot or inventory', () => {
  const variables = withTwoPartyMembers();
  const before = structuredClone(worldOf(variables));
  const chosenUid = before.队伍[1].uid;

  const next = party.setLead(variables, chosenUid);
  const nextWorld = worldOf(next);
  assert.notEqual(next, variables);
  assert.equal(nextWorld.队伍[0].uid, chosenUid);
  assert.deepEqual(nextWorld.队伍.map(mon => mon.uid), [chosenUid, before.队伍[0].uid]);
  assert.deepEqual(nextWorld.背包.物品, before.背包.物品, 'lead selection does not move or spend items');
  assert.deepEqual(worldOf(variables), before, 'the input MVU snapshot remains unchanged');
  assert.equal(mvu.validateMvu(next), true);
});

test('setLead rejects live battles, boxed Pokémon, and fainted Pokémon without mutating state', () => {
  const battle = withTwoPartyMembers();
  const battleWorld = worldOf(battle);
  const secondUid = battleWorld.队伍[1].uid;
  battleWorld.战斗.状态 = 'active';
  const beforeBattle = structuredClone(battleWorld);
  assert.throws(() => party.setLead(battle, secondUid), /战斗中/);
  assert.deepEqual(worldOf(battle), beforeBattle);

  const boxed = withTwoPartyMembers(), boxedWorld = worldOf(boxed);
  const boxedUid = boxedWorld.队伍[1].uid;
  boxedWorld.电脑.push(boxedWorld.队伍.pop());
  const beforeBox = structuredClone(boxedWorld);
  assert.throws(() => party.setLead(boxed, boxedUid), /取回队伍/);
  assert.deepEqual(worldOf(boxed), beforeBox);

  const fainted = withTwoPartyMembers(), faintedWorld = worldOf(fainted);
  const faintedUid = faintedWorld.队伍[1].uid;
  faintedWorld.队伍[1].当前HP = 0;
  const beforeFainted = structuredClone(faintedWorld);
  assert.throws(() => party.setLead(fainted, faintedUid), /先恢复体力/);
  assert.deepEqual(worldOf(fainted), beforeFainted);
});

test('the public party lead route uses the same UID reorder and preserves all inventory counts', async () => {
  const {apply, name} = await import('../index.mjs');
  const variables = withTwoPartyMembers();
  const secondUid = worldOf(variables).队伍[1].uid;
  const head = { gameId: 'party-lead-route', turn: 3, textVersion: 'lead-v3', settled: true, busy: false };
  const handlers = new Map();
  let stored = structuredClone(variables);
  const T = {
    apiVersion: 3,
    handle(route, fn) { handlers.set(route, fn); },
    async getTurnState() { return {...head}; },
    async getTurn() { return {turn: head.turn, textVersion: head.textVersion, variables: structuredClone(stored)}; },
    async setVariables(input) {
      assert.equal(input.turn, head.turn); assert.equal(input.textVersion, head.textVersion);
      stored = structuredClone(input.variables);
    },
    async readTurnData() { return null; },
    async saveTurnData() {},
    onTurnSettled() {}, onTimelineChanged() {}, onGameRemoved() {},
  };
  apply({tavern: T});
  const route = handlers.get(`${name}/party`);
  assert.equal(typeof route, 'function');
  const response = await route({gameId: head.gameId, operation: 'lead', uid: secondUid, turn: head.turn, textVersion: head.textVersion});
  assert.equal(response.world.队伍[0].uid, secondUid);
  assert.deepEqual(response.world.队伍.map(mon => mon.uid), [secondUid, 'starter']);
  assert.deepEqual(response.world.背包.物品, worldOf(variables).背包.物品);
  assert.deepEqual(worldOf(variables).队伍.map(mon => mon.uid), ['starter', secondUid], 'the route does not mutate the supplied source snapshot');
  assert.deepEqual(stored.stat_data.宝可梦.队伍.map(mon => mon.uid), [secondUid, 'starter']);
});

test('stone evolution records both species before an immediate release',()=>{
 let v=addMon(starter(),37,'fox',24),w=worldOf(v);w.队伍.push(mvu.makeMon(25,5,'reserve'));w.背包.物品.firestone=1;
 w.统计.捕获图鉴=[];w.统计.见过图鉴=[];v=party.evolvePokemon(v,'fox','firestone');
 v=party.releasePokemon(v,'fox',true);const stats=worldOf(v).统计;
 for(const id of [37,38]){assert.ok(stats.捕获图鉴.includes(id));assert.ok(stats.见过图鉴.includes(id));}
});

test('level evolution records both species before an immediate release',()=>{
 let v=starter(),w=worldOf(v),mon=w.队伍[0];mvu.grantLevel(mon,100);while(mon.等级<16)mvu.grantLevel(mon,100);
 w.队伍.push(mvu.makeMon(25,5,'reserve'));w.统计.捕获图鉴=[];w.统计.见过图鉴=[];
 v=party.confirmEvolution(v,mon.uid,mon.待进化[0].id);v=party.releasePokemon(v,mon.uid,true);
 for(const id of [1,2]){assert.ok(worldOf(v).统计.捕获图鉴.includes(id));assert.ok(worldOf(v).统计.见过图鉴.includes(id));}
});
