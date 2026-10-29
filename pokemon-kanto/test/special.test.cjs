const test = require('node:test');
const assert = require('node:assert/strict');
const { Battle, Dex } = require('../engine.cjs');

const seed = [1, 2, 3, 4];
const ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

function pokemon(id, moves, ability) {
  const species = Dex.species.all().find(entry => entry.num === id);
  assert.ok(species, `species ${id} exists in the Gen 3 Dex`);
  const learnset = Dex.species.getLearnsetData(species.id).learnset || {};
  for (const move of moves) assert.ok(learnset[move]?.some(source => source.startsWith('3')),
    `${species.name} learns ${move} in Gen 3`);
  const selectedAbility = ability || Object.values(species.abilities)[0];
  assert.ok(Object.values(species.abilities).includes(selectedAbility), `${species.name} has ${selectedAbility}`);
  return { species: species.name, moves, ability: selectedAbility, level: 50, nature: 'Serious', ivs, evs, happiness: 255 };
}

function createBattle(p1, p2, battleSeed = seed) {
  const battle = new Battle({ formatid: 'gen3customgame', seed: battleSeed });
  battle.setPlayer('p1', { name: '训练家', team: p1 });
  battle.setPlayer('p2', { name: '对手', team: p2 });
  return battle;
}

function turn(battle, p1, p2) {
  assert.equal(battle.choose('p1', p1), true, `p1 choice ${p1}`);
  assert.equal(battle.choose('p2', p2), true, `p2 choice ${p2}`);
}

test('Intimidate lowers the opposing active Pokémon’s Attack on entry', () => {
  const battle = createBattle([pokemon(130, ['surf'], 'Intimidate')], [pokemon(1, ['tackle'], 'Overgrow')]);
  try {
    assert.equal(battle.p2.active[0].boosts.atk, -1);
    assert.ok(battle.log.some(line => line.includes('|-unboost|p2a: Bulbasaur|atk|1')));
  } finally { battle.destroy(); }
});

test('Levitate makes Earthquake ineffective against Gengar', () => {
  const battle = createBattle([pokemon(105, ['earthquake'], 'Rock Head')], [pokemon(94, ['toxic'], 'Levitate')]);
  try {
    const target = battle.p2.active[0], before = target.hp;
    turn(battle, 'move 1', 'move 1');
    assert.equal(target.hp, before);
    assert.ok(battle.log.some(line => line.includes('|-immune|p2a: Gengar')));
  } finally { battle.destroy(); }
});

test('Protect blocks a damaging turn, while Substitute spends HP and absorbs the hit', () => {
  const protectedBattle = createBattle([pokemon(6, ['protect'], 'Blaze')], [pokemon(105, ['earthquake'], 'Rock Head')]);
  try {
    const player = protectedBattle.p1.active[0], before = player.hp;
    turn(protectedBattle, 'move 1', 'move 1');
    assert.equal(player.hp, before);
    assert.ok(protectedBattle.log.some(line => line.includes('|-activate|p1a: Charizard|Protect')));
  } finally { protectedBattle.destroy(); }

  const substituteBattle = createBattle([pokemon(25, ['substitute'], 'Static')], [pokemon(143, ['tackle'], 'Immunity')]);
  try {
    const player = substituteBattle.p1.active[0], before = player.hp, max = player.maxhp;
    turn(substituteBattle, 'move 1', 'move 1');
    assert.equal(player.hp, before - Math.floor(max / 4));
    assert.ok(substituteBattle.log.some(line => line.includes('|-start|p1a: Pikachu|Substitute')));
    assert.ok(substituteBattle.log.some(line => line.includes('|-end|p1a: Pikachu|Substitute')));
  } finally { substituteBattle.destroy(); }
});

test('Leech Seed causes residual damage at upkeep and records its source', () => {
  const battle = createBattle([pokemon(1, ['leechseed'], 'Overgrow')], [pokemon(143, ['tackle'], 'Immunity')]);
  try {
    const target = battle.p2.active[0], before = target.hp;
    turn(battle, 'move 1', 'move 1');
    assert.ok(target.volatiles.leechseed);
    assert.ok(target.hp < before);
    assert.ok(battle.log.some(line => line.startsWith('|-damage|p2a: Snorlax|') && line.includes('Leech Seed')));
  } finally { battle.destroy(); }
});

test('sleep prevents an action and the sleep status remains after switching out', () => {
  const battle = createBattle([pokemon(1, ['sleeppowder', 'protect'], 'Overgrow')], [
    pokemon(143, ['tackle'], 'Immunity'), pokemon(16, ['tackle'], 'Keen Eye'),
  ], [2, 3, 4, 5]);
  try {
    turn(battle, 'move 1', 'move 1');
    const snorlax = battle.p2.pokemon[0];
    assert.equal(snorlax.status, 'slp');
    assert.ok(battle.log.some(line => line.includes('|cant|p2a: Snorlax|slp')));
    turn(battle, 'move 2', 'switch 2');
    assert.notEqual(battle.p2.active[0], snorlax);
    assert.equal(snorlax.status, 'slp');
  } finally { battle.destroy(); }
});

test('Sandstorm damages an ordinary type but not Rock, Ground, or Steel Pokémon', () => {
  const battle = createBattle([pokemon(143, ['sandstorm', 'protect'], 'Immunity')], [
    pokemon(76, ['protect'], 'Rock Head'), pokemon(82, ['protect'], 'Magnet Pull'), pokemon(16, ['protect'], 'Keen Eye'),
  ]);
  try {
    const snorlax = battle.p1.active[0], golem = battle.p2.active[0];
    const playerBefore = snorlax.hp, golemBefore = golem.hp;
    turn(battle, 'move 1', 'move 1');
    assert.equal(battle.field.weather, 'sandstorm');
    assert.equal(golem.hp, golemBefore);
    assert.ok(snorlax.hp < playerBefore);

    const magneton = battle.p2.pokemon[1], magnetonBefore = magneton.hp;
    turn(battle, 'move 2', 'switch 2');
    assert.equal(magneton.hp, magnetonBefore);
    const pidgey = battle.p2.pokemon[2], pidgeyBefore = pidgey.hp;
    turn(battle, 'move 2', 'switch 3');
    assert.ok(pidgey.hp < pidgeyBefore);
  } finally { battle.destroy(); }
});

test('a multi-hit move records several separate hit events', () => {
  const battle = createBattle([pokemon(35, ['doubleslap'], 'Cute Charm')], [pokemon(143, ['tackle'], 'Immunity')]);
  try {
    turn(battle, 'move 1', 'move 1');
    const hitCount = Number(battle.log.find(line => line.startsWith('|-hitcount|p2a: Snorlax|'))?.split('|').at(-1));
    assert.ok(hitCount >= 2 && hitCount <= 5, `got ${hitCount} logged hits`);
    assert.ok(battle.log.some(line => line.includes('|move|p1a: Clefairy|Double Slap')));
  } finally { battle.destroy(); }
});

test('Fly charges for one turn, avoids the target, then attacks on the next turn', () => {
  const battle = createBattle([pokemon(6, ['fly'], 'Blaze')], [pokemon(143, ['tackle'], 'Immunity')]);
  try {
    const charizard = battle.p1.active[0], target = battle.p2.active[0], before = target.hp;
    turn(battle, 'move 1', 'move 1');
    assert.ok(charizard.volatiles.twoturnmove);
    assert.equal(target.hp, before);
    turn(battle, 'move 1', 'move 1');
    assert.ok(target.hp < before);
    assert.ok(battle.log.some(line => line.includes('|move|p1a: Charizard|Fly')));
  } finally { battle.destroy(); }
});
