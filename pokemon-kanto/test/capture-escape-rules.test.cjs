const test = require('node:test');
const assert = require('node:assert/strict');
const {KantoGame, Dex} = require('../engine.cjs');
const {integerSqrt, catchOdds, captureThreshold, resolveCapture, resolveRun} = require('../capture-escape-rules.cjs');

test('capture odds preserve Gen 3 integer division order and status/ball modifiers', () => {
  assert.equal(catchOdds({catchRate: 255, maxHp: 300, hp: 300, ballId: 'pokeball'}), 85);
  assert.equal(catchOdds({catchRate: 255, maxHp: 300, hp: 300, ballId: 'greatball'}), 127);
  assert.equal(catchOdds({catchRate: 45, maxHp: 100, hp: 1, status: 'slp', ballId: 'ultraball'}), 178);
  assert.equal(catchOdds({catchRate: 45, maxHp: 100, hp: 1, status: 'par', ballId: 'ultraball'}), 133);
  assert.throws(() => catchOdds({catchRate: 45, maxHp: 100, hp: 101, ballId: 'pokeball'}), /参数/);
  assert.throws(() => catchOdds({catchRate: 45, maxHp: 100, hp: 1, ballId: 'masterball'}), /精灵球/);
});

test('capture odds truncate after every C integer division and at status boundaries', () => {
  // 7 * 15 / 10 truncates to 10 (not 10.5); 10 * 298 / 300 then truncates to 9.
  assert.equal(catchOdds({catchRate: 7, maxHp: 100, hp: 1, ballId: 'greatball'}), 9);
  // Sleep doubles after the HP division: 128 * 15 / 10 = 192 becomes 384.
  assert.equal(catchOdds({catchRate: 128, maxHp: 1, hp: 0, status: 'slp', ballId: 'greatball'}), 384);
  // A 1.5x major status truncates instead of rounding: 1 * 15 / 10 stays 1.
  assert.equal(catchOdds({catchRate: 1, maxHp: 1, hp: 0, status: 'par', ballId: 'pokeball'}), 1);
  assert.equal(catchOdds({catchRate: 1, maxHp: 1, hp: 0, status: 'slp', ballId: 'pokeball'}), 2);
  // catchRate 0 and hp 0 are valid boundaries; negative or fractional values are not.
  assert.equal(catchOdds({catchRate: 0, maxHp: 1, hp: 0, ballId: 'pokeball'}), 0);
  assert.throws(() => catchOdds({catchRate: -1, maxHp: 1, hp: 0, ballId: 'pokeball'}), /参数/);
  assert.throws(() => catchOdds({catchRate: 0, maxHp: 0, hp: 0, ballId: 'pokeball'}), /参数/);
  assert.throws(() => catchOdds({catchRate: 0, maxHp: 1, hp: -1, ballId: 'pokeball'}), /参数/);
  assert.throws(() => catchOdds({catchRate: 0, maxHp: 1, hp: 0.5, ballId: 'pokeball'}), /参数/);
});

test('capture shake threshold uses integer square roots and four cartridge checks', () => {
  assert.equal(integerSqrt(0), 0);
  assert.equal(integerSqrt(15), 3);
  assert.equal(integerSqrt(16), 4);
  assert.equal(captureThreshold(0), 0);
  assert.equal(captureThreshold(255), 65536);
  let rolls = 0;
  assert.deepEqual(resolveCapture({catchRate: 255, maxHp: 1, hp: 0, ballId: 'ultraball'}, () => { rolls++; return 0; }),
    {odds: 510, threshold: 65536, checks: 4, shakes: 3, success: true});
  assert.equal(rolls, 0, 'guaranteed catches do not consume shake-check RNG');
  rolls = 0;
  const failed = resolveCapture({catchRate: 3, maxHp: 500, hp: 500, ballId: 'pokeball'}, () => { rolls++; return 65535; });
  assert.equal(failed.shakes, 0);
  assert.equal(failed.success, false);
  assert.equal(rolls, 1, 'a failed first check stops further shakes');
  rolls = 0;
  const caught = resolveCapture({catchRate: 3, maxHp: 500, hp: 500, ballId: 'pokeball'}, () => { rolls++; return 0; });
  assert.equal(caught.checks, 4);
  assert.equal(caught.shakes, 3);
  assert.equal(caught.success, true);
  assert.equal(rolls, 4);
  rolls = 0;
  const brokeFreeOnFourthCheck = resolveCapture({catchRate: 3, maxHp: 500, hp: 500, ballId: 'pokeball'}, () => {
    rolls++;
    return rolls === 4 ? 65535 : 0;
  });
  assert.equal(brokeFreeOnFourthCheck.checks, 3);
  assert.equal(brokeFreeOnFourthCheck.shakes, 3, 'failure after three shakes still reports 3');
  assert.equal(brokeFreeOnFourthCheck.success, false);
  assert.equal(rolls, 4);
});

test('integer square roots and capture thresholds hold at perfect-square and 254/255 boundaries', () => {
  assert.equal(integerSqrt(1), 1);
  assert.equal(integerSqrt(2), 1);
  assert.equal(integerSqrt(3), 1);
  assert.equal(integerSqrt(4), 2);
  assert.equal(integerSqrt(65535), 255);
  assert.equal(integerSqrt(65536), 256);
  assert.equal(integerSqrt(Number.MAX_SAFE_INTEGER), 94906265,
    'the BigInt-backed root stays exact at the largest safe input');
  assert.throws(() => integerSqrt(-1), /安全整数/);
  assert.throws(() => integerSqrt(4.5), /安全整数/);
  assert.throws(() => integerSqrt(Number.MAX_SAFE_INTEGER + 1), /安全整数/);

  assert.equal(captureThreshold(1), 16643);
  assert.equal(captureThreshold(2), 19784);
  assert.equal(captureThreshold(254), 65535);
  assert.equal(captureThreshold(255), 65536, 'odds above 254 use the guaranteed threshold');
  assert.equal(captureThreshold(256), 65536);
  assert.throws(() => captureThreshold(-1), /非负/);
  assert.throws(() => captureThreshold(2.5), /整数/);
});

test('capture resolves the zero, 254, and 255 odds boundaries without skipping the first check', () => {
  let zeroRolls = 0;
  const zero = resolveCapture({catchRate: 0, maxHp: 1, hp: 0, ballId: 'pokeball'}, () => {
    zeroRolls++;
    return 0;
  });
  assert.deepEqual(zero, {odds: 0, threshold: 0, checks: 0, shakes: 0, success: false});
  assert.equal(zeroRolls, 1, 'zero odds still perform and fail the first cartridge check');

  const odds254 = {catchRate: 127, maxHp: 1, hp: 0, ballId: 'ultraball'};
  assert.equal(catchOdds(odds254), 254);
  assert.deepEqual(resolveCapture(odds254, () => 65534),
    {odds: 254, threshold: 65535, checks: 4, shakes: 3, success: true});
  assert.deepEqual(resolveCapture(odds254, () => 65535),
    {odds: 254, threshold: 65535, checks: 0, shakes: 0, success: false},
    'the comparison is strict: a roll equal to the threshold fails');

  const odds255 = {catchRate: 170, maxHp: 1, hp: 0, ballId: 'greatball'};
  assert.equal(catchOdds(odds255), 255);
  assert.deepEqual(resolveCapture(odds255, () => { throw Error('odds above 254 must be guaranteed without RNG'); }),
    {odds: 255, threshold: 65536, checks: 4, shakes: 3, success: true});
});

test('capture maps one through four successful checks to the reported shake count', () => {
  const input = {catchRate: 127, maxHp: 1, hp: 0, ballId: 'ultraball'};
  const cases = [
    {rolls: [65535], checks: 0, shakes: 0, success: false},
    {rolls: [0, 65535], checks: 1, shakes: 1, success: false},
    {rolls: [0, 0, 65535], checks: 2, shakes: 2, success: false},
    {rolls: [0, 0, 0, 65535], checks: 3, shakes: 3, success: false},
    {rolls: [0, 0, 0, 0], checks: 4, shakes: 3, success: true}
  ];
  for (const expected of cases) {
    let index = 0;
    const result = resolveCapture(input, () => expected.rolls[index++]);
    assert.equal(result.checks, expected.checks);
    assert.equal(result.shakes, expected.shakes);
    assert.equal(result.success, expected.success);
    assert.equal(index, expected.rolls.length);
  }
});

test('special balls clamp at the level and turn integer boundaries', () => {
  const oddsFor = (ballId, context) => catchOdds({catchRate: 100, maxHp: 1, hp: 0, ballId, context});
  assert.equal(oddsFor('nestball', {level: 1}), 390);
  assert.equal(oddsFor('nestball', {level: 29}), 110);
  assert.equal(oddsFor('nestball', {level: 30}), 100, 'the Nest Ball bonus bottoms out at level 30');
  assert.equal(oddsFor('nestball', {level: 39}), 100);
  assert.equal(oddsFor('nestball', {level: 40}), 100, 'level 40 no longer receives the Nest Ball bonus');
  assert.equal(oddsFor('timerball', {turns: 0}), 100);
  assert.equal(oddsFor('timerball', {turns: 29}), 390);
  assert.equal(oddsFor('timerball', {turns: 30}), 400);
  assert.equal(oddsFor('timerball', {turns: 31}), 400, 'the Timer Ball multiplier caps at 4x');
  assert.equal(oddsFor('netball', {types: ['BUG']}), 300);
  assert.equal(oddsFor('diveball', {underwater: true}), 350);
  assert.throws(() => oddsFor('nestball', {level: 0}), /1—100/);
  assert.throws(() => oddsFor('nestball', {level: 101}), /1—100/);
  assert.throws(() => oddsFor('timerball', {turns: -1}), /非负/);
});

test('escape uses the pre-increment attempt count and the Gen 3 0..255 comparison', () => {
  let rolls = 0;
  const first = resolveRun({playerSpeed: 50, targetSpeed: 100, attempts: 0}, () => { rolls++; return 64; });
  assert.equal(first.chance, 64);
  assert.equal(first.success, false, 'chance must be greater than the random byte');
  assert.equal(first.attempts, 1);
  const second = resolveRun({playerSpeed: 50, targetSpeed: 100, attempts: first.attempts}, () => 93);
  assert.equal(second.chance, 94);
  assert.equal(second.success, true);
  assert.equal(rolls, 1);
  const wrapped = resolveRun({playerSpeed: 1, targetSpeed: 255, attempts: 9}, () => 255);
  assert.equal(wrapped.chance, 14, 'slow-escape chance wraps in an 8-bit temporary rather than exceeding 255');
  assert.equal(wrapped.success, false);
  assert.equal(resolveRun({playerSpeed: 100, targetSpeed: 100, attempts: 0}, () => { throw Error('no RNG for fast/equal escape'); }).success, true);
  assert.equal(resolveRun({playerSpeed: 1, targetSpeed: 200, attempts: 0, alwaysRun: true}, () => { throw Error('no RNG for Run Away/Smoke Ball'); }).success, true);
});

test('escape chance holds at zero and wraps from 255 to 0 in the 8-bit temporary', () => {
  const zero = resolveRun({playerSpeed: 1, targetSpeed: 255, attempts: 0}, () => 0);
  assert.equal(zero.chance, 0);
  assert.equal(zero.success, false, '0 > 0 is false, so the slowest escape can never pass');

  const at255 = resolveRun({playerSpeed: 45, targetSpeed: 128, attempts: 7}, () => 254);
  assert.equal(at255.chance, 255);
  assert.equal(at255.success, true);
  assert.equal(resolveRun({playerSpeed: 45, targetSpeed: 128, attempts: 7}, () => 255).success, false,
    '255 > 255 is false');

  const wrapped = resolveRun({playerSpeed: 45, targetSpeed: 128, attempts: 8}, () => 28);
  assert.equal(wrapped.chance, 29, '45 + 8 * 30 wraps modulo 256');
  assert.equal(wrapped.success, true);
  assert.equal(resolveRun({playerSpeed: 45, targetSpeed: 128, attempts: 8}, () => 29).success, false);

  assert.equal(resolveRun({playerSpeed: 127, targetSpeed: 128, attempts: 0}, () => 0).chance, 127);
  assert.equal(resolveRun({playerSpeed: 127, targetSpeed: 129, attempts: 0}, () => 0).chance, 126,
    'the speed fraction truncates rather than rounds');
});

test('escape attempt accounting uses attempts + 1 and alwaysRun leaves the counter unchanged', () => {
  const fast = resolveRun({playerSpeed: 100, targetSpeed: 99, attempts: 3},
    () => { throw Error('a faster actor must not roll RNG'); });
  assert.deepEqual(fast, {success: true, attempt: 4, attempts: 4});
  const equal = resolveRun({playerSpeed: 99, targetSpeed: 99, attempts: 0},
    () => { throw Error('equal speed must not roll RNG'); });
  assert.deepEqual(equal, {success: true, attempt: 1, attempts: 1});
  const alwaysRun = resolveRun({playerSpeed: 1, targetSpeed: 255, attempts: 3, alwaysRun: true},
    () => { throw Error('alwaysRun must not roll RNG'); });
  assert.deepEqual(alwaysRun, {success: true, attempt: 4, attempts: 3},
    'alwaysRun succeeds without consuming an escape attempt');

  assert.throws(() => resolveRun({playerSpeed: 0, targetSpeed: 1, attempts: 0}, () => 0), /参数/);
  assert.throws(() => resolveRun({playerSpeed: 1, targetSpeed: 0, attempts: 0}, () => 0), /参数/);
  assert.throws(() => resolveRun({playerSpeed: 1, targetSpeed: 2, attempts: -1}, () => 0), /参数/);
  assert.throws(() => resolveRun({playerSpeed: 1.5, targetSpeed: 2, attempts: 0}, () => 0), /参数/);
});

function startWild(playerId, targetId, seed = [1, 2, 3, 4]) {
  const game = new KantoGame();
  const snapshot = game.start({mode: 'wild', seed,
    team: [{id: playerId}],
    opponent: [{id: targetId}]});
  return {game, snapshot, record: game.battles.get(snapshot.id)};
}

test('capture event reports cartridge shake count and returns a catch-time snapshot', () => {
  const {game, snapshot, record} = startWild(Dex.species.get('pikachu').num, Dex.species.get('abra').num);
  const target = record.battle.p2.pokemon[0];
  target.item = 'oranberry';
  target.hp = 1;
  record.bag.ultraball = 1;
  const caught = game.act({battleId: snapshot.id, choice: 'capture ultraball'});
  assert.equal(caught.ended, true);
  assert.equal(caught.caught.ball, 'ultraball');
  assert.equal(caught.caught.snapshot.hp, 1);
  assert.equal(caught.caught.snapshot.heldItem, 'oranberry');
  assert.equal(caught.caught.snapshot.id, target.baseSpecies.num);
  assert.equal(caught.caught.snapshot.moves.length, target.moveSlots.length);
  assert.ok(caught.events.includes(`|capture|${target.name}|3`));
});

test('failed capture consumes the selected ball and yields the turn to the wild opponent', () => {
  const {game, snapshot, record} = startWild(Dex.species.get('electrode').num, Dex.species.get('mewtwo').num);
  record.bag.pokeball = 1;
  const target = record.battle.p2.pokemon[0];
  const originalRandom = record.battle.random.bind(record.battle);
  let forceCaptureRoll = true;
  record.battle.random = (max, ...rest) => {
    if (forceCaptureRoll && max === 65536) { forceCaptureRoll = false; return 65535; }
    return originalRandom(max, ...rest);
  };
  const failed = game.act({battleId: snapshot.id, choice: 'capture pokeball'});
  assert.equal(failed.ended, false);
  assert.equal(failed.bag.pokeball, 0);
  assert.equal(failed.caught, null);
  assert.ok(failed.events.includes(`|capture|${target.name}|0`));
  assert.ok(failed.events.some(event => event.startsWith('|move|p2a:')));
});

test('three reported shakes can still be a failed capture after the fourth check', () => {
  const {game, snapshot, record} = startWild(Dex.species.get('electrode').num, Dex.species.get('mewtwo').num);
  record.bag.pokeball = 1;
  const target = record.battle.p2.pokemon[0];
  let captureRolls = 0;
  const originalRandom = record.battle.random.bind(record.battle);
  record.battle.random = (max, ...rest) => {
    if (max === 65536) {
      captureRolls++;
      return captureRolls === 4 ? 65535 : 0;
    }
    return originalRandom(max, ...rest);
  };
  const failed = game.act({battleId: snapshot.id, choice: 'capture pokeball'});
  assert.equal(captureRolls, 4);
  assert.ok(failed.events.includes(`|capture|${target.name}|3`));
  assert.equal(failed.caught, null);
  assert.equal(failed.ended, false);
});

test('failed escape emits an attempt result, increments only after the check, and consumes a turn', () => {
  const {game, snapshot, record} = startWild(Dex.species.get('slowpoke').num, Dex.species.get('snorlax').num);
  const originalRandom = record.battle.random.bind(record.battle);
  let forceEscapeRoll = true;
  record.battle.random = (max, ...rest) => {
    if (forceEscapeRoll && max === 256) { forceEscapeRoll = false; return 255; }
    return originalRandom(max, ...rest);
  };
  const failed = game.act({battleId: snapshot.id, choice: 'run'});
  assert.equal(failed.ended, false);
  assert.equal(failed.escaped, false);
  assert.equal(failed.attempts, 1);
  assert.ok(failed.events.includes('|run|failed|1'));
  assert.ok(failed.events.some(event => event.startsWith('|move|p2a:')));
});

test('faster escape emits a success result without a random roll', () => {
  const {game, snapshot, record} = startWild(Dex.species.get('electrode').num, Dex.species.get('snorlax').num);
  const originalRandom = record.battle.random.bind(record.battle);
  record.battle.random = (max, ...rest) => {
    if (max === 256) throw Error('faster trainer escape must not roll RNG');
    return originalRandom(max, ...rest);
  };
  const escaped = game.act({battleId: snapshot.id, choice: 'run'});
  assert.equal(escaped.ended, true);
  assert.equal(escaped.escaped, true);
  assert.ok(escaped.events.includes('|run|success|1'));
});

test('Run Away bypasses the speed check in wild battles', () => {
  const game = new KantoGame();
  const snapshot = game.start({mode: 'wild', seed: [5, 6, 7, 8],
    team: [{id: Dex.species.get('rattata').num}],
    opponent: [{id: Dex.species.get('snorlax').num}]});
  const record = game.battles.get(snapshot.id);
  assert.equal(record.battle.p1.active[0].ability, 'runaway');
  record.battle.p1.activeRequest.active[0].trapped = true;
  const originalRandom = record.battle.random.bind(record.battle);
  record.battle.random = (max, ...rest) => {
    if (max === 256) throw Error('Run Away must not roll speed RNG');
    return originalRandom(max, ...rest);
  };
  const escaped = game.act({battleId: snapshot.id, choice: 'run'});
  assert.equal(escaped.ended, true);
  assert.equal(escaped.escaped, true);
});

test('Smoke Ball bypasses trapping and speed checks and is retained in the actor snapshot', () => {
  const game = new KantoGame();
  const snapshot = game.start({mode: 'wild', seed: [6, 7, 8, 9],
    team: [{id: Dex.species.get('pikachu').num, item: 'smokeball'}],
    opponent: [{id: Dex.species.get('snorlax').num}]});
  const record = game.battles.get(snapshot.id);
  const mon = record.battle.p1.active[0];
  assert.equal(mon.item, 'smokeball');
  assert.equal(snapshot.sides[0].team[0].heldItem, 'smokeball');
  record.battle.p1.activeRequest.active[0].trapped = true;
  record.battle.random = () => { throw Error('Smoke Ball must not consume escape RNG'); };
  const escaped = game.act({battleId: snapshot.id, choice: 'run'});
  assert.equal(escaped.ended, true);
  assert.equal(escaped.escaped, true);
  assert.ok(escaped.events.includes('|run|success|1'));
});

test('Full Heal clears a major status and confusion, and a Revive consumes one turn without restoring PP', () => {
  const game = new KantoGame();
  const snapshot = game.start({mode: 'wild', seed: [10, 11, 12, 13],
    team: [{id: Dex.species.get('pikachu').num}, {id: Dex.species.get('rattata').num}],
    opponent: [{id: Dex.species.get('snorlax').num}]});
  const record = game.battles.get(snapshot.id);
  const active = record.battle.p1.active[0];
  const enemy = record.battle.p2.active[0];
  enemy.status = 'slp';
  enemy.statusState.time = 5;
  active.item = 'leftovers';
  active.hp -= 20;
  const hpBeforeItemTurn = active.hp;
  active.setStatus('par');
  active.addVolatile('confusion');
  record.bag.fullheal = 1;
  const healed = game.act({battleId: snapshot.id, choice: 'item fullheal'});
  assert.equal(healed.sides[0].team[0].status, '');
  assert.equal(Boolean(record.battle.p1.pokemon[0].volatiles.confusion), false);
  assert.equal(healed.turn, snapshot.turn + 1);
  assert.ok(active.hp > hpBeforeItemTurn, 'the completed item turn resolves end-of-turn Leftovers');
  assert.equal(healed.events.filter(event => event.startsWith('|-curestatus|')).length, 1);

  const reserve = record.battle.p1.pokemon[1];
  reserve.hp = 0;
  reserve.fainted = true;
  reserve.moveSlots[0].pp = 1;
  record.battle.p1.pokemonLeft--;
  record.bag.revive = 1;
  const beforeTurn = record.battle.turn;
  const beforePp = reserve.moveSlots[0].pp;
  const revived = game.act({battleId: snapshot.id, choice: 'item revive 2'});
  assert.equal(revived.turn, beforeTurn + 1);
  assert.equal(reserve.hp, Math.max(1, Math.floor(reserve.maxhp / 2)));
  assert.equal(reserve.moveSlots[0].pp, beforePp);
});
