'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const encounters = require('../frlg-encounters.cjs');
const map = require('../public/data/map.json');

test('source pools preserve FireRed and LeafGreen data and cover mapped world nodes', () => {
  assert.equal(encounters.source.commit, 'ce6406d8c2eaf46d543c8a2606de0c3cb1951982');
  assert.match(encounters.source.sha256, /^[a-f0-9]{64}$/);
  for (const node of map) {
    const land = encounters.pool(node.id, { method: 'land' });
    const water = encounters.pool(node.id, { method: 'water' });
    const auto = encounters.pool(node.id);
    if (!land && !water) assert.equal(auto, null, `${node.id} has no source-matched land/water table`);
    if (auto) {
      assert.ok(['land', 'water'].includes(auto.method));
      assert.ok(auto.slots.length > 0);
      assert.ok(auto.slots.every(slot => slot.id >= 1 && slot.id <= 151 && slot.minLevel >= 1 && slot.maxLevel >= slot.minLevel && slot.weight > 0));
    }
  }
  assert.equal(encounters.pool('not-a-kanto-node'), null);
  assert.equal(encounters.pool('pewter'), null, 'towns without original encounter tables remain unsupported');
});

test('auto uses land first and falls back to water where the source map has no land', () => {
  assert.equal(encounters.pool('route1').method, 'land');
  assert.equal(encounters.pool('pallet').method, 'water');
  assert.equal(encounters.pool('pallet').sourceMap, 'MAP_PALLET_TOWN');
});

test('FRLG weighted slots include Viridian Forest Pikachu at the original five percent', () => {
  const table = encounters.pool('viridian-forest');
  const total = table.slots.reduce((sum, slot) => sum + slot.weight, 0);
  const pikachu = table.slots.filter(slot => slot.id === 25).reduce((sum, slot) => sum + slot.weight, 0);
  assert.equal(total, 100);
  assert.equal(pikachu, 5);
  assert.equal(table.rate, 14);
});

test('route 1 levels top out at five and Diglett Cave retains 95/5 species weights', () => {
  const route1 = encounters.pool('route1');
  assert.equal(Math.max(...route1.slots.map(slot => slot.maxLevel)), 5);
  const cave = encounters.pool('diglett-cave');
  const total = cave.slots.reduce((sum, slot) => sum + slot.weight, 0);
  const weightOf = id => cave.slots.filter(slot => slot.id === id).reduce((sum, slot) => sum + slot.weight, 0);
  assert.equal(total, 100);
  assert.equal(weightOf(50), 95);
  assert.equal(weightOf(51), 5);
});

test('version exclusives differ in the bundled Safari Zone Center tables', () => {
  const fire = encounters.pool('safari', { version: 'firered' });
  const leaf = encounters.pool('safari', { version: 'leafgreen' });
  assert.ok(fire.species.includes(123));
  assert.ok(!fire.species.includes(127));
  assert.ok(leaf.species.includes(127));
  assert.ok(!leaf.species.includes(123));
  assert.equal(fire.sourceMap, leaf.sourceMap);
});

test('fishing methods use their original slot groups and weights', () => {
  const oldRod = encounters.pool('route12', { method: 'oldrod' });
  const goodRod = encounters.pool('route12', { method: 'goodrod' });
  const superRod = encounters.pool('route12', { method: 'superrod' });
  assert.deepEqual(oldRod.slots.map(slot => slot.weight), [70, 30]);
  assert.deepEqual(goodRod.slots.map(slot => slot.weight), [60, 20, 20]);
  assert.deepEqual(superRod.slots.map(slot => slot.weight), [40, 40, 15, 4, 1]);
  assert.equal(oldRod.rate, 60);
});

test('seeded rolls are reproducible, sample authentic levels, and filter only legal pool species', () => {
  const first = encounters.roll('route1', { seed: 'replay-001' });
  assert.deepEqual(encounters.roll('route1', { seed: 'replay-001' }), first);
  const filtered = encounters.roll('route1', { speciesId: 16, seed: 10 });
  assert.equal(filtered.speciesId, 16);
  assert.ok(filtered.level >= 2 && filtered.level <= 5);
  assert.throws(() => encounters.roll('route1', { speciesId: 151, seed: 1 }), /不在该版本与方法的遭遇池/);
  assert.throws(() => encounters.roll('route1', { speciesId: 152, seed: 1 }), /1到151/);
  assert.throws(() => encounters.roll('route1', { seed: 1.5 }), /安全整数/);
  assert.throws(() => encounters.pool('route1', { version: 'emerald' }), /firered或leafgreen/);
  assert.throws(() => encounters.pool('route1', { method: 'rocksmash' }), /方法只能是/);
});
