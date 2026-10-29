const test = require('node:test');
const assert = require('node:assert/strict');
const { KantoGame, catalog, Dex } = require('../engine.cjs');

const speciesId = (id) => typeof id === 'number' ? id : Dex.species.get(id).num;
const makeTeam = (ids, moves) => ids.map((id) => moves ? { id: speciesId(id), moves } : { id: speciesId(id) });
const start = (options = {}) => {
  const game = new KantoGame();
  const snapshot = game.start({
    team: makeTeam(['pikachu']),
    mode: 'practice',
    seed: [1, 2, 3, 4],
    opponent: [{ id: 129, moves: ['tackle'] }],
    ...options,
    ...(options.opponent ? { opponent: options.opponent.map((pokemon) => ({ ...pokemon, id: speciesId(pokemon.id) })) } : {}),
  });
  return { game, snapshot };
};

const act = (game, snapshot, choice) => game.act({ battleId: snapshot.id, choice });
const firstPokemon = (snapshot, side = 0) => snapshot.sides[side].team[0];
const byId = (items, id) => items.find((item) => item.id === id);
const moveChoice = (snapshot, id) => {
  const index = snapshot.request.moves.findIndex((move) => move.id === id);
  assert.notEqual(index, -1, `move ${id} is available`);
  return `move ${index + 1}`;
};

test('catalog has exactly the original 151 species and no Fairy types or moves', () => {
  const species = Array.isArray(catalog) ? catalog : catalog.species;
  const moves = Object.values(catalog.moves || catalog.moveList || {});
  assert.ok(Array.isArray(species), 'catalog exposes a species array');
  assert.equal(species.length, 151);
  assert.ok(species.every((pokemon) => !pokemon.types?.includes('Fairy')));
  assert.ok(moves.every((move) => move.type !== 'Fairy'));
  assert.equal(species.some((pokemon) => pokemon.key === 'mew'), true);
  assert.equal(species.some((pokemon) => pokemon.key === 'chikorita'), false);
  assert.ok(species.every((pokemon) => pokemon.defaultMoves.length <= 4 &&
    new Set(pokemon.defaultMoves).size === pokemon.defaultMoves.length));
});

test('catalog exposes 354 actual Gen III moves while Kanto learnsets still reject non-learnable moves', () => {
  const actual = new Set(Dex.moves.all()
    .filter(move => move.exists && move.gen <= 3 && move.num >= 1 && move.num <= 354)
    .map(move => move.id));
  assert.equal(actual.size, 354);
  for (const id of actual) assert.ok(catalog.moves[id], `${id} is available for event display and called moves`);
  assert.equal(Boolean(catalog.moves.sacredfire.flags.metronome), true);
  assert.ok(catalog.species.every(mon => !mon.moves.includes('aeroblast')));
  assert.throws(() => new KantoGame().start({
    team: [{ id: 25, moves: ['aeroblast'] }], mode: 'practice', seed: [1, 2, 3, 4],
    opponent: [{ id: 129, moves: ['splash'] }],
  }), /不能在第三世代学会/);
});

test('Gen III Metronome can call a real non-Kanto move and emits that move event', () => {
  const game = new KantoGame();
  const snapshot = game.start({
    team: [{ id: 151, moves: ['metronome'] }], mode: 'practice', seed: [141, 2, 3, 4],
    opponent: [{ id: 129, moves: ['splash'] }],
  });
  const result = game.act({ battleId: snapshot.id, choice: 'move 1' });
  assert.ok(result.events.some(event => event.startsWith('|move|p1a:') && event.includes('|Metronome|')));
  assert.ok(result.events.some(event => event.includes('|move|p1a:') && event.includes('|Sacred Fire|') && event.includes('[from] Metronome')));
  assert.equal(catalog.moves.sacredfire.number, 221);
  assert.ok(catalog.species.every(mon => !mon.moves.includes('sacredfire')));
});

test('Transform snapshots carry the transformed appearance and the stage renderer honors it', () => {
  const app = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/app.js'), 'utf8');
  const game = new KantoGame();
  const snapshot = game.start({
    team: [{ id: 151, moves: ['transform'] }], mode: 'practice', seed: [5, 6, 7, 8],
    opponent: [{ id: 129, moves: ['splash'] }],
  });
  const result = game.act({ battleId: snapshot.id, choice: 'move 1' });
  assert.ok(result.events.some(event => event.includes('|move|p1a:') && event.includes('|Transform|')));
  assert.equal(result.sides[0].team[0].id, 151);
  assert.equal(result.sides[0].team[0].appearanceId, 129);
  assert.match(app, /const id = mon\.appearanceId \|\| mon\.id/);
});

test('generation 3 uses physical Shadow Ball, special Fire Punch, and Ground immunity', () => {
  const gen3 = Dex;
  assert.equal(gen3.moves.get('shadowball').category, 'Physical');
  assert.equal(gen3.moves.get('firepunch').category, 'Special');
  assert.equal(gen3.getImmunity('Electric', ['Ground']), false);
});

test('medicine and capture-ball catalog exposes Kanto item prices and effects', () => {
  const defs = Object.fromEntries(catalog.items.map(item => [item.id, item]));
  assert.equal(defs.potion.price, 300);
  assert.equal(defs.superpotion.price, 700);
  assert.equal(defs.revive.price, 1500);
  assert.equal(defs.awakening.price, 250);
  assert.equal(defs.greatball.price, 600);
  assert.equal(defs.ultraball.battle.capture, 2);
  assert.equal(defs.antidote.outside.status.includes('psn'), true);
});

test('start presents available moves and reserves in a stable snapshot', () => {
  const { snapshot } = start({ team: makeTeam(['pikachu', 'bulbasaur']) });
  assert.equal(snapshot.ended, false);
  assert.equal(snapshot.request.wait, false);
  assert.ok(snapshot.request.moves.length > 0);
  assert.ok(snapshot.request.switches.some((slot) => slot.id === 1));
  assert.equal(snapshot.sides[0].team.filter((pokemon) => pokemon.active).length, 1);
});

test('every Kanto species starts with its generated default moveset', () => {
  const game = new KantoGame();
  for (const pokemon of catalog.species) {
    const snapshot = game.start({
      team: [{ id: pokemon.id }],
      mode: 'practice',
      seed: [1, 2, 3, 4],
      opponent: [{ id: 129, moves: ['splash'] }],
    });
    assert.ok(snapshot.request.moves.length > 0, `${pokemon.key} has an available moveset`);
    assert.equal(snapshot.sides[0].team[0].id, pokemon.id);
  }
});

test('six team members with four moves each are accepted; oversized teams and move sets are rejected', () => {
  const { snapshot } = start({
    team: makeTeam(['pikachu', 'bulbasaur', 'charmander', 'squirtle', 'geodude', 'oddish']),
  });
  assert.equal(snapshot.sides[0].team.length, 6);
  assert.ok(snapshot.request.moves.length <= 4);
  const fourMoves = start({ team: makeTeam(['pikachu'], ['thunderbolt', 'quickattack', 'thunderwave', 'irontail']) }).snapshot;
  assert.equal(fourMoves.request.moves.length, 4);
  assert.throws(() => new KantoGame().start({
    team: makeTeam(['pikachu', 'bulbasaur', 'charmander', 'squirtle', 'geodude', 'oddish', 'pidgey']),
    mode: 'practice',
  }));
  assert.throws(() => new KantoGame().start({
    team: makeTeam(['pikachu'], ['thunderbolt', 'quickattack', 'thunderwave', 'irontail', 'growl']),
    mode: 'practice',
  }));
});

test('a valid move spends PP and advances the battle', () => {
  const { game, snapshot } = start();
  const wave = byId(snapshot.request.moves, 'thunderwave');
  assert.ok(wave);
  const next = act(game, snapshot, moveChoice(snapshot, 'thunderwave'));
  const nextWave = byId(next.request.moves, 'thunderwave');
  assert.equal(next.turn, snapshot.turn + 1);
  assert.equal(nextWave.pp, wave.pp - 1);
  assert.ok(next.events.some((event) => event.includes('|move|p2a:')));
});

test('invalid choices are rejected without advancing or mutating the current battle', () => {
  const { game, snapshot } = start();
  const battle = game.battles.get(snapshot.id).battle;
  const beforeTurn = battle.turn;
  const beforeLog = battle.log.length;
  assert.throws(() => act(game, snapshot, 'move 99'));
  assert.equal(battle.turn, beforeTurn);
  assert.equal(battle.log.length, beforeLog);
  assert.equal(snapshot.turn, beforeTurn);
});

test('switching consumes a turn and changes the active Pokémon', () => {
  const { game, snapshot } = start({ team: makeTeam(['pikachu', 'bulbasaur']) });
  const next = act(game, snapshot, 'switch 2');
  assert.equal(next.turn, snapshot.turn + 1);
  assert.ok(next.events.some((event) => event.includes('|switch|')));
  assert.equal(next.sides[0].team.find((pokemon) => pokemon.id === 1).active, true);
  assert.equal(next.sides[0].team.find((pokemon) => pokemon.id === 25).active, false);
});

test('a fainted lead opens a forced-switch request and cannot be selected to act', () => {
  const { game, snapshot } = start({
    team: makeTeam(['pikachu', 'bulbasaur']),
    opponent: [{ id: 129, moves: ['tackle'] }],
  });
  game.battles.get(snapshot.id).battle.sides[0].pokemon[0].hp = 1;
  const forced = act(game, snapshot, moveChoice(snapshot, 'thunderwave'));
  assert.equal(forced.request.forceSwitch, true);
  assert.throws(() => act(game, forced, 'move 1'));
  const switched = act(game, forced, 'switch 2');
  assert.equal(switched.sides[0].team.find((pokemon) => pokemon.id === 1).active, true);
});

test('trainer battles reject capture actions without changing their turn', () => {
  const { game, snapshot } = start({ mode: 'gym', gym: 0 });
  assert.throws(() => act(game, snapshot, 'capture'));
  assert.equal(snapshot.turn, game.battles.get(snapshot.id).battle.turn);
});

test('wild battles expose capture and a weakened wild Pokémon can be caught', () => {
  const { game, snapshot } = start({ mode: 'wild', opponent: [{ id: 129, moves: ['splash'] }] });
  assert.ok(snapshot.request.capture || snapshot.bag.ball > 0);
  game.battles.get(snapshot.id).battle.sides[1].pokemon[0].hp = 1;
  let current = act(game, snapshot, 'capture');
  for (let i = 0; i < 8 && !current.ended; i++) current = act(game, current, 'capture');
  assert.equal(current.ended, true);
  assert.equal(current.winner, '训练家');
  assert.equal(current.caught.id, 129);
});

test('potion use consumes the item and gives the opponent its turn', () => {
  const { game, snapshot } = start({ team: makeTeam(['pikachu', 'bulbasaur']) });
  const battle = game.battles.get(snapshot.id).battle;
  battle.sides[0].pokemon[0].hp = battle.sides[0].pokemon[0].maxhp - 30;
  const wounded = game.snapshot(game.battles.get(snapshot.id));
  const beforeHp = firstPokemon(wounded).hp;
  const beforeBag = wounded.bag.potion;
  const healed = act(game, wounded, 'item potion');
  assert.equal(healed.bag.potion, beforeBag - 1);
  assert.ok(firstPokemon(healed).hp > beforeHp);
  assert.ok(healed.events.some((event) => event.includes('|move|p2a:')));
});

test('targeted medicine heals the selected bench Pokémon and invalid use is atomic', () => {
  const { game, snapshot } = start({ team: makeTeam(['pikachu', 'bulbasaur']), bag: { superpotion: 1 } });
  const record = game.battles.get(snapshot.id), target = record.battle.p1.pokemon[1];
  target.hp -= 20;
  const beforeTurn = record.battle.turn;
  const beforeHp = target.hp;
  assert.throws(() => act(game, snapshot, 'item superpotion 6'), /目标/);
  assert.equal(record.battle.turn, beforeTurn);
  assert.equal(record.bag.superpotion, 1);
  const healed = act(game, snapshot, 'item superpotion 2');
  assert.equal(healed.bag.superpotion, 0);
  assert.ok(healed.sides[0].team[1].hp > beforeHp);
  assert.ok(healed.events.some(event => event.includes('|move|p2a:')));
});

test('an unusable medicine preserves both inventory and battle turn', () => {
  const { game, snapshot } = start({ bag: { antidote: 1 } });
  const record = game.battles.get(snapshot.id), beforeTurn = record.battle.turn;
  assert.throws(() => act(game, snapshot, 'item antidote 1'), /异常状态/);
  assert.equal(record.battle.turn, beforeTurn);
  assert.equal(record.bag.antidote, 1);
});

test('battle status medicine cures a matching condition and revive restores a fainted teammate', () => {
  const { game, snapshot } = start({ team: makeTeam(['pikachu', 'mewtwo']), bag: { antidote: 1, revive: 1 } });
  const record = game.battles.get(snapshot.id), second = record.battle.p1.pokemon[1];
  second.setStatus('psn');
  let current = act(game, snapshot, 'item antidote 2');
  assert.equal(current.sides[0].team[1].status, '');
  assert.equal(current.bag.antidote, 0);

  const revivedRecord = game.battles.get(current.id), teammate = revivedRecord.battle.p1.pokemon[1];
  teammate.fainted = true; teammate.hp = 0; revivedRecord.battle.p1.pokemonLeft--;
  current = game.snapshot(revivedRecord);
  current = act(game, current, 'item revive 2');
  assert.equal(current.sides[0].team[1].fainted, false);
  assert.equal(current.sides[0].team[1].hp, Math.floor(current.sides[0].team[1].maxhp / 2));
  assert.equal(current.bag.revive, 0);
});

test('capture command consumes the chosen ball and applies its catch multiplier', () => {
  const encounter = ball => {
    const game = new KantoGame();
    let snapshot = game.start({ mode: 'wild', seed: [2, 3, 4, 5], team: [{ id: 25, moves: ['quickattack'] }],
      opponent: [{ id: 63, moves: ['teleport'] }], bag: { [ball]: 1 } });
    const record = game.battles.get(snapshot.id);
    record.battle.p2.pokemon[0].hp = 1;
    snapshot = game.snapshot(record);
    return game.act({ battleId: snapshot.id, choice: `capture ${ball}` });
  };
  const pokeball = encounter('pokeball'), ultraball = encounter('ultraball');
  assert.equal(pokeball.ended, false);
  assert.equal(pokeball.bag.pokeball, 0);
  assert.equal(ultraball.ended, true);
  assert.equal(ultraball.caught.id, 63);
  assert.equal(ultraball.bag.ultraball, 0);
});

test('AI battles can reach a terminal result through legal player actions', () => {
  const game = new KantoGame();
  let current = game.start({
    team: makeTeam(['mewtwo']),
    mode: 'practice',
    seed: [7, 8, 9, 10],
    opponent: [{ id: 129, moves: ['splash'] }],
  });
  for (let i = 0; i < 80 && !current.ended; i++) {
    const move = current.request.moves.find((choice) => choice.pp > 0);
    if (!move) break;
    current = act(game, current, moveChoice(current, move.id));
  }
  assert.equal(current.ended, true);
  assert.equal(current.winner, current.sides[0].name);
});
