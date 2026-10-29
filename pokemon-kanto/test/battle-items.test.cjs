const test = require('node:test');
const assert = require('node:assert/strict');
const {KantoGame, Dex} = require('../engine.cjs');

function start({mode = 'wild', team = [{id: 25}], opponent = [{id: 129, moves: ['splash']}], bag = {}, seed = [41, 42, 43, 44]} = {}) {
  const game = new KantoGame();
  const snapshot = game.start({mode, team, opponent, bag, seed});
  return {game, snapshot, record: game.battles.get(snapshot.id)};
}

test('X items boost the current battler by one stage and consume exactly one turn', () => {
  for (const [item, stat] of [['xattack', 'atk'], ['xdefend', 'def'], ['xspeed', 'spe'], ['xspecial', 'spa'], ['xaccuracy', 'accuracy']]) {
    const {game, snapshot, record} = start({bag: {[item]: 1}});
    const actor = record.battle.p1.active[0], beforeTurn = snapshot.turn;
    const after = game.act({battleId: snapshot.id, choice: `item ${item}`});
    assert.equal(actor.boosts[stat], 1, `${item} raises ${stat}`);
    assert.equal(after.turn, beforeTurn + 1, `${item} uses one turn`);
    assert.equal(after.bag[item], 0, `${item} is consumed`);
    assert.ok(after.events.some(event => event.includes(`|-boost|p1a:`) && event.endsWith(`|${stat}|1`)));
  }
});

test('a capped X item fails atomically without spending inventory or advancing the battle', () => {
  const {game, snapshot, record} = start({bag: {xattack: 1}});
  const actor = record.battle.p1.active[0], beforeTurn = record.battle.turn;
  actor.boosts.atk = 6;
  assert.throws(() => game.act({battleId: snapshot.id, choice: 'item xattack'}), /上限/);
  assert.equal(record.bag.xattack, 1);
  assert.equal(record.battle.turn, beforeTurn);
});

test('Dire Hit adds Focus Energy and Guard Spec applies five-turn Mist to the player side', () => {
  const {game, snapshot, record} = start({bag: {direhit: 2, guardspec: 2},
    opponent: [{id: 16, moves: ['sandattack']}]});
  let current = game.act({battleId: snapshot.id, choice: 'item direhit', enemyChoice: 'move 1'});
  assert.ok(record.battle.p1.active[0].volatiles.focusenergy);
  assert.equal(current.bag.direhit, 1);
  assert.equal(current.turn, snapshot.turn + 1);
  assert.throws(() => game.act({battleId: current.id, choice: 'item direhit'}), /状态已存在/);
  assert.equal(record.bag.direhit, 1, 'rejected reuse does not create or consume inventory');

  record.battle.p1.active[0].boosts.accuracy = 0;
  const beforeTurn = record.battle.turn;
  current = game.act({battleId: current.id, choice: 'item guardspec', enemyChoice: 'move 1'});
  assert.equal(current.turn, beforeTurn + 1);
  assert.equal(current.bag.guardspec, 1);
  assert.ok(record.battle.p1.sideConditions.mist);
  assert.ok(record.battle.p1.sideConditions.mist.duration <= 5);
  assert.equal(record.battle.p1.active[0].boosts.accuracy, 0, 'Mist blocks the opponent Sand Attack on the item turn');
  const afterMist = record.battle.turn;
  assert.throws(() => game.act({battleId: current.id, choice: 'item guardspec'}), /保护效果仍在持续/);
  assert.equal(record.battle.turn, afterMist);
  assert.equal(record.bag.guardspec, 1);
});

test('NPC status medicine has finite inventory and emits a single cure event', () => {
  const game = new KantoGame();
  const initial = game.start({
    mode: 'practice', seed: [1, 2, 3, 4],
    team: [{id: 129, moves: ['splash']}],
    opponent: [{id: 4, moves: ['scratch']}],
    trainerItems: {fullheal: 1}, itemPolicy: {maxUses: 1, allowed: ['fullheal']},
  });
  const record = game.battles.get(initial.id);
  const enemy = record.battle.p2.active[0];
  enemy.setStatus('par');
  const result = game.act({battleId: initial.id, choice: 'move 1'});
  assert.equal(enemy.status, '');
  assert.equal(result.opponentBag.fullheal, 0);
  assert.equal(result.trainerItemUses, 1);
  assert.equal(result.plannedTrainerItem, null);
  assert.equal(result.events.filter(event => event.startsWith('|-curestatus|p2a:')).length, 1);
});

test('NPC cannot exceed the configured per-battle item cap even with items left', () => {
  const game = new KantoGame();
  const initial = game.start({
    mode: 'practice', seed: [1, 2, 3, 4],
    team: [{id: 129, moves: ['splash']}],
    opponent: [{id: 4, moves: ['growl']}],
    trainerItems: {fullheal: 3}, itemPolicy: {maxUses: 2, allowed: ['fullheal']},
  });
  const record = game.battles.get(initial.id), enemy = record.battle.p2.active[0];
  for (let i = 0; i < 3; i++) {
    enemy.setStatus('par');
    const current = game.act({battleId: initial.id, choice: 'move 1'});
    assert.equal(current.trainerItemUses, Math.min(i + 1, 2));
    assert.equal(current.opponentBag.fullheal, 3 - Math.min(i + 1, 2));
  }
  assert.equal(record.battle.p2.active[0].status, 'par', 'the NPC is out of allowed uses, not secretly healed');
});

test('FRLG universal status medicines cure confusion even with full HP and no major status', () => {
  for (const item of ['fullheal', 'fullrestore', 'healpowder']) {
    const {game, snapshot, record} = start({bag: {[item]: 1}});
    const actor = record.battle.p1.active[0];
    actor.addVolatile('confusion');
    const result = game.act({battleId: snapshot.id, choice: `item ${item}`});
    assert.equal(Boolean(actor.volatiles.confusion), false, item);
    assert.equal(result.bag[item], 0);
    assert.equal(result.turn, snapshot.turn + 1);
    assert.ok(result.events.some(event => event.startsWith('|-end|p1a:') && event.toLowerCase().includes('|confusion')));
  }
});

test('NPC universal medicine can cure confusion, with a finite turn and inventory', () => {
  const game = new KantoGame();
  const initial = game.start({
    mode: 'practice', seed: [1, 2, 3, 4],
    team: [{id: 129, moves: ['splash']}], opponent: [{id: 4, moves: ['growl']}],
    trainerItems: {fullheal: 1}, itemPolicy: {maxUses: 1, allowed: ['fullheal']},
  });
  const record = game.battles.get(initial.id), enemy = record.battle.p2.active[0];
  enemy.addVolatile('confusion');
  const current = game.act({battleId: initial.id, choice: 'move 1'});
  assert.equal(Boolean(enemy.volatiles.confusion), false);
  assert.equal(current.opponentBag.fullheal, 0);
  assert.equal(current.trainerItemUses, 1);
  assert.ok(current.events.some(event => event.startsWith('|-end|p2a:') && event.toLowerCase().includes('|confusion')));
});

test('Poké Doll and Fluffy Tail flee from wild battles without a speed roll or opponent turn', () => {
  for (const item of ['pokedoll', 'fluffytail']) {
    const {game, snapshot, record} = start({bag: {[item]: 1},
      team: [{id: 19}], opponent: [{id: 143}]});
    const beforeTurn = record.battle.turn;
    record.battle.random = () => { throw Error('escape items do not roll speed RNG'); };
    const escaped = game.act({battleId: snapshot.id, choice: `item ${item}`});
    assert.equal(escaped.ended, true);
    assert.equal(escaped.escaped, true);
    assert.equal(escaped.turn, beforeTurn);
    assert.equal(escaped.bag[item], 0);
    assert.ok(escaped.events.includes('|run|success|0'));
    assert.ok(!escaped.events.some(event => event.startsWith('|move|p2a:')));
  }
});

test('field PP items merge into the catalog and restore selected or all move slots for one turn', () => {
  const {game, snapshot, record} = start({team: [{id: 25, moves: ['thunderbolt', 'quickattack']}], bag: {ether: 1, elixir: 1}});
  const mon = record.battle.p1.pokemon[0];
  mon.moveSlots[0].pp = 1;
  mon.baseMoveSlots[0].pp = 1;
  let state = game.act({battleId: snapshot.id, choice: 'item ether 1 1', enemyChoice: 'move 1'});
  assert.equal(mon.moveSlots[0].pp, 11);
  assert.equal(mon.baseMoveSlots[0].pp, 11);
  assert.equal(state.bag.ether, 0);
  assert.equal(state.turn, snapshot.turn + 1);
  mon.moveSlots[0].pp = 1;
  mon.baseMoveSlots[0].pp = 1;
  mon.moveSlots[1].pp = 1;
  mon.baseMoveSlots[1].pp = 1;
  state = game.act({battleId: snapshot.id, choice: 'item elixir 1', enemyChoice: 'move 1'});
  assert.equal(mon.moveSlots[0].pp, 11, 'Elixir restores ten PP to each move');
  assert.equal(mon.moveSlots[1].pp, 11, 'Elixir restores ten PP to each move');
  assert.equal(state.bag.elixir, 0);
  assert.equal(state.turn, snapshot.turn + 2);
});

test('invalid PP item uses do not consume inventory or a battle turn', () => {
  const {game, snapshot, record} = start({team: [{id: 25}], bag: {ether: 1, elixir: 1}});
  const beforeTurn = record.battle.turn;
  assert.throws(() => game.act({battleId: snapshot.id, choice: 'item ether 1 1'}), /PP已满/);
  assert.throws(() => game.act({battleId: snapshot.id, choice: 'item ether 1'}), /指定要恢复PP/);
  assert.throws(() => game.act({battleId: snapshot.id, choice: 'item elixir 1 1'}), /不需要指定招式位置/);
  assert.equal(record.bag.ether, 1);
  assert.equal(record.bag.elixir, 1);
  assert.equal(record.battle.turn, beforeTurn);
});

test('Poké Doll and X items cannot be used in trainer battles and do not consume the item', () => {
  const {game, snapshot, record} = start({mode: 'practice', bag: {pokedoll: 1, xattack: 1}});
  const beforeTurn = record.battle.turn;
  assert.throws(() => game.act({battleId: snapshot.id, choice: 'item pokedoll'}), /只能用于野生战斗/);
  assert.equal(record.bag.pokedoll, 1);
  assert.equal(record.battle.turn, beforeTurn);
  const afterBoost = game.act({battleId: snapshot.id, choice: 'item xattack'});
  assert.equal(afterBoost.bag.xattack, 0);
  assert.equal(afterBoost.sides[0].team[0].boosts.atk, 1);
});

test('all added type boosters exist in Gen 3 data and are attached as held items', () => {
  for (const id of ['silverpowder', 'hardstone', 'magnet', 'nevermeltice', 'blackbelt', 'poisonbarb', 'sharpbeak', 'twistedspoon', 'spelltag', 'dragonfang']) {
    assert.equal(Dex.items.get(id).exists, true, `${id} is a real Gen 3 simulator item`);
    const def = require('../engine.cjs').catalog.items.find(item => item.id === id);
    assert.equal(def?.category, 'held');
  }
});
