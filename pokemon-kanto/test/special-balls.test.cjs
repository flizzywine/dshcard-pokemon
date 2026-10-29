'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const balls = require('../public/data/special-balls.json');
const {catchOdds, resolveCapture, SPECIAL_BALL_IDS} = require('../capture-escape-rules.cjs');

// Prices: pret/pokefirered ce6406d8c2eaf46d543c8a2606de0c3cb1951982, src/data/items.json L1-L208.
const base = {catchRate: 30, maxHp: 3, hp: 3};
const odds = (ballId, context = {}) => catchOdds({...base, ballId, context});

test('special ball data uses the existing ball action schema, FRLG prices, and zero starting counts', () => {
  assert.deepEqual(balls.map(item => item.id), SPECIAL_BALL_IDS);
  assert.equal(new Set(balls.map(item => item.id)).size, 8);
  for (const item of balls) {
    assert.equal(item.category, 'ball');
    assert.equal(item.actionKey, `capture ${item.id}`);
    assert.equal(item.target, true);
    assert.equal(item.battle.capture, 1);
    assert.equal(item.startingCount, 0);
    assert.equal(item.outside, null);
  }
  assert.deepEqual(Object.fromEntries(balls.map(item => [item.id, item.price])), {
    netball: 1000, diveball: 1000, nestball: 1000, repeatball: 1000,
    timerball: 1000, luxuryball: 1000, premierball: 200, masterball: 0,
  });
  assert.equal(balls.find(item => item.id === 'masterball').forSale, false);
});

test('Net Ball is 3x for either Water or Bug type and 1x otherwise', () => {
  assert.equal(odds('netball', {types: ['Water']}), 30);
  assert.equal(odds('netball', {types: ['Bug']}), 30);
  assert.equal(odds('netball', {types: ['Water', 'Bug']}), 30, 'qualifying types do not stack');
  assert.equal(odds('netball', {types: ['Fire']}), 10);
  assert.equal(odds('netball', {types: []}), 10);
});

test('Dive Ball uses 3.5x only underwater; Nest Ball follows the FRLG level threshold and floor', () => {
  assert.equal(odds('diveball', {underwater: true}), 35);
  assert.equal(odds('diveball', {underwater: false}), 10);
  assert.equal(odds('diveball', {}), 10, 'ordinary FRLG encounters have no underwater context');

  assert.equal(odds('nestball', {level: 10}), 30);
  assert.equal(odds('nestball', {level: 1}), 39);
  assert.equal(odds('nestball', {level: 30}), 10);
  assert.equal(odds('nestball', {level: 39}), 10, 'multiplier is floored at 1x');
  assert.equal(odds('nestball', {level: 40}), 10, 'level 40 takes the normal branch');
});

test('Repeat Ball checks prior capture, and Timer Ball grows once per completed turn up to 4x', () => {
  assert.equal(odds('repeatball', {alreadyCaught: true}), 30);
  assert.equal(odds('repeatball', {alreadyCaught: false}), 10);
  assert.equal(odds('repeatball', {}), 10);

  assert.equal(odds('timerball', {turns: 0}), 10);
  assert.equal(odds('timerball', {turns: 1}), 11);
  assert.equal(odds('timerball', {turns: 29}), 39);
  assert.equal(odds('timerball', {turns: 30}), 40);
  assert.equal(odds('timerball', {turns: 100}), 40);
});

test('Luxury and Premier Balls remain ordinary-rate balls; Master Ball guarantees success without modeling throwaway RNG', () => {
  assert.equal(odds('luxuryball'), 10);
  assert.equal(odds('premierball'), 10);
  assert.equal(odds('masterball'), 10);
  let rolls = 0;
  const result = resolveCapture({catchRate: 1, maxHp: 100, hp: 100, ballId: 'masterball', context: {}}, () => { rolls++; return 65535; });
  assert.equal(result.success, true);
  assert.equal(result.shakes, 3);
  assert.equal(result.checks, 4);
  assert.equal(rolls, 0);
  assert.equal(resolveCapture({catchRate: 1, maxHp: 100, hp: 100, ballId: 'masterball', context: {}}).success, true);
});

test('special balls require the appended context object and reject malformed context values', () => {
  assert.throws(() => catchOdds({...base, ballId: 'masterball'}), /上下文/);
  assert.throws(() => odds('netball', {types: 'Water'}), /属性/);
  assert.throws(() => odds('nestball', {level: 0}), /等级/);
  assert.throws(() => odds('repeatball', {alreadyCaught: 1}), /收服标记/);
  assert.throws(() => odds('timerball', {turns: -1}), /回合数/);
  assert.throws(() => odds('diveball', {underwater: 1}), /水下/);
});

test('legacy Poké, Great, and Ultra Ball calls keep their existing flat API and rates', () => {
  assert.equal(catchOdds({...base, ballId: 'pokeball'}), 10);
  assert.equal(catchOdds({...base, ballId: 'greatball'}), 15);
  assert.equal(catchOdds({...base, ballId: 'ultraball'}), 20);
});
