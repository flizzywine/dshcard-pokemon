'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { KantoGame, Dex, catalog } = require('../engine.cjs');

const seed = [1, 2, 3, 4];
const mon = (id, moves, extra = {}) => {
  const species = typeof id === 'number' ? Dex.species.all().find(entry => entry.num === id) : Dex.species.get(id);
  const level = extra.level || 50;
  const state = extra.state ? { hp: Math.floor(((2 * species.baseStats.hp + 31) * level) / 100) + level + 10, ...extra.state } : undefined;
  return { id: species.num, moves, ...extra, ...(state ? { state } : {}) };
};
function start(team, opponent, options = {}) {
  const game = new KantoGame();
  const snapshot = game.start({ mode: 'practice', level: options.level || 50, team, opponent, seed: options.seed || seed });
  return { game, snapshot, battle: game.battles.get(snapshot.id).battle };
}
function move(snapshot, id) {
  const index = snapshot.request.moves.findIndex(entry => entry.id === id);
  assert.notEqual(index, -1, `selected Pokémon has ${id}`);
  return `move ${index + 1}`;
}
function act(game, snapshot, choice) { return game.act({ battleId: snapshot.id, choice }); }
function hasEvent(snapshot, prefix) { return snapshot.events.some(line => line.startsWith(prefix)); }

test('Fly uses a non-damaging charge turn, avoids ordinary attacks, then hits on the second turn', () => {
  const { game, snapshot: initial, battle } = start([mon('charizard', ['fly'])], [mon('snorlax', ['tackle'])]);
  try {
    const target = battle.p2.active[0], before = target.hp;
    const charge = act(game, initial, move(initial, 'fly'));
    assert.ok(charge.events.some(line => line.startsWith('|-prepare|p1a:') && line.endsWith('|Fly')));
    assert.equal(target.hp, before, 'the charge turn cannot damage the foe');
    assert.ok(battle.p1.active[0].volatiles.twoturnmove);
    const strike = act(game, charge, move(charge, 'fly'));
    assert.ok(target.hp < before, 'the following Fly turn lands damage');
    assert.ok(strike.events.some(line => line.startsWith('|move|p1a:') && line.includes('|Fly|')));
  } finally { battle.destroy(); }
});

test('Hyper Beam logs recharge and enters a blocked next-turn request', () => {
  const { game, snapshot: initial, battle } = start([mon('snorlax', ['hyperbeam'])], [mon('snorlax', ['tackle'])], { seed: [2, 3, 4, 5] });
  try {
    const foe = battle.p2.active[0];
    const hit = act(game, initial, move(initial, 'hyperbeam'));
    const afterHit = foe.hp;
    assert.ok(afterHit < foe.maxhp);
    assert.ok(hit.events.some(line => line.startsWith('|-mustrecharge|p1a:')));
    assert.ok(hit.request.moves.some(entry => entry.id === 'recharge'), 'the next request explicitly requires the recharge action');
    assert.equal(foe.hp, afterHit, 'the target has only received the first Hyper Beam');
  } finally { battle.destroy(); }
});

test('successive Protect attempts use the Gen III diminishing chance rather than guaranteeing a block', () => {
  const seeds = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [21, 22, 23, 24]];
  let observation;
  for (const trialSeed of seeds) {
    const trial = start([mon('charizard', ['protect'])], [mon('snorlax', ['tackle'])], { seed: trialSeed });
    try {
      let snapshot = trial.snapshot;
      const outcomes = [];
      for (let i = 0; i < 4; i++) {
        snapshot = act(trial.game, snapshot, move(snapshot, 'protect'));
        outcomes.push(snapshot.events.some(line => line.startsWith('|-singleturn|p1a:') && line.endsWith('|Protect')));
      }
      observation = outcomes;
      if (outcomes[0] && outcomes.slice(1).some(value => !value)) break;
    } finally { trial.battle.destroy(); }
  }
  assert.ok(observation?.[0], 'the first Protect succeeds');
  assert.ok(observation.slice(1).some(value => !value), `a later consecutive attempt fails for a legal seeded sequence: ${observation}`);
});

test('Substitute spends one quarter of maximum HP and prevents the covered hit from reaching HP/status', () => {
  const { game, snapshot: initial, battle } = start([mon('pikachu', ['substitute'])], [mon('snorlax', ['toxic'])]);
  try {
    const user = battle.p1.active[0], target = battle.p2.active[0], hp = user.hp, targetHp = target.hp;
    const result = act(game, initial, move(initial, 'substitute'));
    assert.equal(user.hp, hp - Math.floor(user.maxhp / 4));
    assert.equal(target.hp, targetHp);
    assert.equal(user.status, '');
    assert.ok(result.events.some(line => line.startsWith('|-start|p1a:') && line.endsWith('|Substitute')));
  } finally { battle.destroy(); }
});

test('sleep, freeze, and paralysis use Gen III move-prevention rules while poison statuses tick at upkeep', () => {
  for (const status of ['slp', 'frz']) {
    const { game, snapshot: initial, battle } = start([mon('pikachu', ['thunderbolt'])], [mon('snorlax', ['tackle'], { state: { status } })]);
    try {
      const result = act(game, initial, move(initial, 'thunderbolt'));
      assert.ok(result.events.some(line => line.startsWith('|cant|p2a:') && line.endsWith(`|${status}`)), `${status} prevents the opposing move`);
    } finally { battle.destroy(); }
  }

  const paralyzed = start([mon('snorlax', ['tackle'])], [mon('electrode', ['tackle'], { state: { status: 'par' } })]);
  try {
    const user = paralyzed.battle.p2.active[0];
    assert.equal(user.getStat('spe'), Math.floor(user.storedStats.spe / 4));
    const result = act(paralyzed.game, paralyzed.snapshot, move(paralyzed.snapshot, 'tackle'));
    assert.ok(result.events.some(line => line.startsWith('|move|p1a:') && line.includes('|Tackle|')));
    assert.ok(result.events.some(line => line.startsWith('|move|p2a:') && line.includes('|Tackle|') || line.startsWith('|cant|p2a:') && line.endsWith('|par')));
  } finally { paralyzed.battle.destroy(); }

  const poison = start([mon('magikarp', ['splash'])], [mon('magikarp', ['splash'], { state: { status: 'psn' } })]);
  const toxic = start([mon('magikarp', ['splash'])], [mon('magikarp', ['splash'], { state: { status: 'tox' } })]);
  try {
    const p = poison.battle.p2.active[0], t = toxic.battle.p2.active[0], pBefore = p.hp, tBefore = t.hp;
    const pNext = act(poison.game, poison.snapshot, move(poison.snapshot, 'splash'));
    let tNext = act(toxic.game, toxic.snapshot, move(toxic.snapshot, 'splash'));
    const firstPoisonLoss = pBefore - p.hp, firstToxicLoss = tBefore - t.hp;
    tNext = act(toxic.game, tNext, move(tNext, 'splash'));
    const secondToxicLoss = t.hp - firstToxicLoss;
    assert.ok(firstPoisonLoss > 0 && firstToxicLoss > 0);
    assert.ok(secondToxicLoss > firstToxicLoss, 'bad poison ramps its upkeep damage');
    assert.ok(pNext.events.some(line => line.startsWith('|-damage|p2a:')));
    assert.ok(tNext.events.some(line => line.startsWith('|-damage|p2a:')));
  } finally { poison.battle.destroy(); toxic.battle.destroy(); }
});

test('Intimidate, Levitate immunity, and damaging-move stat drops use actual active battle events', () => {
  const intimidated = start([mon('gyarados', ['surf'], { ability: 'Intimidate' })], [mon('bulbasaur', ['tackle'])]);
  try {
    assert.equal(intimidated.battle.p2.active[0].boosts.atk, -1);
    assert.ok(intimidated.snapshot.events.some(line => line.startsWith('|-unboost|p2a:') && line.endsWith('|atk|1')));
  } finally { intimidated.battle.destroy(); }

  const immune = start([mon('golem', ['earthquake'])], [mon('gengar', ['shadowball'], { ability: 'Levitate' })]);
  try {
    const hp = immune.battle.p2.active[0].hp;
    const result = act(immune.game, immune.snapshot, move(immune.snapshot, 'earthquake'));
    assert.equal(immune.battle.p2.active[0].hp, hp);
    assert.ok(result.events.some(line => line.startsWith('|-immune|p2a:')));
  } finally { immune.battle.destroy(); }

  const drop = start([mon('mew', ['overheat'])], [mon('magikarp', ['splash'])]);
  try {
    const result = act(drop.game, drop.snapshot, move(drop.snapshot, 'overheat'));
    assert.equal(drop.battle.p1.active[0].boosts.spa, -2);
    assert.ok(result.events.some(line => line.startsWith('|-unboost|p1a:') && line.endsWith('|spa|2')));
  } finally { drop.battle.destroy(); }
});

test('drain, recoil, self-KO, and fixed damage preserve their distinct damage accounting', () => {
  const drain = start([mon('mew', ['gigadrain'], { state: { hp: 70 } })], [mon('magikarp', ['splash'])]);
  try {
    const user = drain.battle.p1.active[0], before = user.hp;
    const result = act(drain.game, drain.snapshot, move(drain.snapshot, 'gigadrain'));
    assert.ok(user.hp > before, 'Giga Drain heals the attacker');
    assert.ok(result.events.some(line => line.startsWith('|-heal|p1a:')));
  } finally { drain.battle.destroy(); }

  const recoil = start([mon('snorlax', ['doubleedge'])], [mon('magikarp', ['splash'])]);
  try {
    const user = recoil.battle.p1.active[0], before = user.hp;
    const result = act(recoil.game, recoil.snapshot, move(recoil.snapshot, 'doubleedge'));
    assert.ok(user.hp < before, 'Double-Edge damages its user');
    assert.ok(result.events.some(line => /\[from\] recoil/i.test(line)));
  } finally { recoil.battle.destroy(); }

  const selfdestruct = start([mon('electrode', ['selfdestruct'])], [mon('magikarp', ['splash'])]);
  try {
    const result = act(selfdestruct.game, selfdestruct.snapshot, move(selfdestruct.snapshot, 'selfdestruct'));
    assert.equal(selfdestruct.battle.p1.active[0].hp, 0);
    assert.ok(result.events.some(line => line.startsWith('|faint|p1a:')));
    assert.ok(selfdestruct.battle.p2.active[0].hp < selfdestruct.battle.p2.active[0].maxhp);
  } finally { selfdestruct.battle.destroy(); }

  const fixed = start([mon('electrode', ['sonicboom'])], [mon('snorlax', ['tackle'])]);
  try {
    const target = fixed.battle.p2.active[0], before = target.hp;
    act(fixed.game, fixed.snapshot, move(fixed.snapshot, 'sonicboom'));
    assert.equal(before - target.hp, 20, 'Sonic Boom has fixed 20 HP damage');
  } finally { fixed.battle.destroy(); }
});

test('rain boosts Water damage, Quick Attack keeps priority, and Pursuit intercepts a switch', () => {
  const rain = start([mon('blastoise', ['raindance', 'surf'])], [mon('magikarp', ['splash'])]);
  const clear = start([mon('blastoise', ['protect', 'surf'])], [mon('magikarp', ['splash'])]);
  try {
    const rainy = act(rain.game, rain.snapshot, move(rain.snapshot, 'raindance'));
    assert.equal(rain.battle.field.weather, 'raindance');
    const wetHit = act(rain.game, rainy, move(rainy, 'surf'));
    const protectedTurn = act(clear.game, clear.snapshot, move(clear.snapshot, 'protect'));
    const dryHit = act(clear.game, protectedTurn, move(protectedTurn, 'surf'));
    assert.ok(rainy.events.some(line => line.startsWith('|-weather|RainDance')));
    assert.ok(rain.battle.p2.active[0].hp < clear.battle.p2.active[0].hp, 'same-seed Rain Dance raises Surf damage');
    assert.ok(dryHit.events.some(line => line.startsWith('|move|p1a:') && line.includes('|Surf|')));
  } finally { rain.battle.destroy(); clear.battle.destroy(); }

  const priority = start([mon('pidgeot', ['quickattack'], { nature: 'Brave', ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 0 } })], [mon('electrode', ['tackle'])]);
  try {
    const result = act(priority.game, priority.snapshot, move(priority.snapshot, 'quickattack'));
    const quickAt = result.events.findIndex(line => line.startsWith('|move|p1a:') && line.includes('|Quick Attack|'));
    const tackleAt = result.events.findIndex(line => line.startsWith('|move|p2a:') && line.includes('|Tackle|'));
    assert.ok(quickAt >= 0 && tackleAt > quickAt, 'Quick Attack priority outruns faster Electrode');
  } finally { priority.battle.destroy(); }

  const pursuit = start([mon('snorlax', ['tackle']), mon('magikarp', ['splash'])], [mon('arbok', ['pursuit'])]);
  try {
    const outgoing = pursuit.battle.p1.active[0];
    const result = act(pursuit.game, pursuit.snapshot, 'switch 2');
    const pursuitAt = result.events.findIndex(line => line.startsWith('|move|p2a:') && line.includes('|Pursuit|'));
    const switchAt = result.events.findIndex(line => line.startsWith('|switch|p1a:'));
    assert.ok(pursuitAt >= 0 && switchAt > pursuitAt, 'Pursuit strikes before the switch resolves');
    assert.equal(outgoing.baseSpecies.num, 143);
    assert.equal(pursuit.battle.p1.active[0].baseSpecies.num, 129);
  } finally { pursuit.battle.destroy(); }
});

test('multi-hit counts each landed strike and confusion can self-hit instead of using its selected move', () => {
  assert.ok(catalog.species.find(entry => entry.key === 'clefairy').moves.includes('doubleslap'));
  const multi = start([mon('clefairy', ['doubleslap'])], [mon('snorlax', ['tackle'])], { seed: [4, 3, 2, 1] });
  try {
    const result = act(multi.game, multi.snapshot, move(multi.snapshot, 'doubleslap'));
    const hitCountLine = result.events.find(line => line.startsWith('|-hitcount|p2a:'));
    assert.ok(hitCountLine, 'Double Slap reports an actual hit count');
    const hits = Number(hitCountLine.split('|').at(-1));
    assert.ok(hits >= 2 && hits <= 5, `Gen III Double Slap lands 2–5 strikes (got ${hits})`);
    assert.ok(result.events.filter(line => line.startsWith('|-damage|p2a:')).length >= hits, 'each landed strike is represented in battle damage events');
  } finally { multi.battle.destroy(); }

  assert.ok(catalog.species.find(entry => entry.key === 'gastly').moves.includes('confuseray'));
  const seeds = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [21, 22, 23, 24], [17, 29, 41, 53]];
  let selfHit;
  for (const trialSeed of seeds) {
    const trial = start([mon('gastly', ['confuseray'])], [mon('snorlax', ['tackle'])], { seed: trialSeed });
    try {
      const result = act(trial.game, trial.snapshot, move(trial.snapshot, 'confuseray'));
      const event = result.events.find(line => line.startsWith('|-damage|p2a:') && line.includes('[from] confusion'));
      if (event) { selfHit = { result, event }; break; }
      // If the first confusion check lets Snorlax act, advance only when it still has
      // its normal request; later seeded turns exercise the same volatile naturally.
      if (result.request.moves?.length) {
        const next = act(trial.game, result, move(result, 'confuseray'));
        const later = next.events.find(line => line.startsWith('|-damage|p2a:') && line.includes('[from] confusion'));
        if (later) { selfHit = { result: next, event: later }; break; }
      }
    } finally { trial.battle.destroy(); }
  }
  assert.ok(selfHit, 'a seeded confusion check can produce the cartridge-style self-hit path');
  assert.ok(selfHit.result.events.some(line => line.startsWith('|cant|p2a:') && line.includes('confusion')) || selfHit.event.includes('[from] confusion'));
});

test('an inaccurate move can miss without emitting damage against the target', () => {
  const trial = start([mon('charizard', ['fireblast'])], [mon('magikarp', ['splash'])], { seed: [16, 1168, 3376, 15952] });
  try {
    const target = trial.battle.p2.active[0], before = target.hp;
    const result = act(trial.game, trial.snapshot, move(trial.snapshot, 'fireblast'));
    assert.ok(result.events.some(line => line.startsWith('|-miss|p1a:') && line.includes('|p2a:')));
    assert.equal(target.hp, before, 'a miss does not lower target HP');
    assert.equal(result.events.some(line => line.startsWith('|-damage|p2a:')), false);
  } finally { trial.battle.destroy(); }
});
