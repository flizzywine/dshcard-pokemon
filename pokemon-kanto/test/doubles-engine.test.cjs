const test = require('node:test');
const assert = require('node:assert/strict');
const { KantoGame } = require('../engine.cjs');

function startDouble(options = {}) {
  const game = new KantoGame();
  const snapshot = game.start({
    mode: 'doubles',
    team: [{ id: 25, uid: 'p1a' }, { id: 1, uid: 'p1b' }, { id: 4, uid: 'p1c' }, { id: 7, uid: 'p1d' }],
    opponent: [{ id: 6, uid: 'p2a' }, { id: 9, uid: 'p2b' }, { id: 3, uid: 'p2c' }],
    difficulty: 'easy',
    seed: [1, 2, 3, 4],
    ...options,
  });
  return { game, snapshot };
}

test('double choices are joint and invalid second actions leave both active actors untouched', () => {
  const { game, snapshot } = startDouble({
    team: [
      { id: 25, uid: 'p1a' },
      { id: 1, uid: 'p1b', state: { moves: [{ id: 'solarbeam', pp: 0, maxpp: 10 }] } },
      { id: 4, uid: 'p1c' }, { id: 7, uid: 'p1d' },
    ],
  });
  assert.equal(snapshot.doubleBattle, true);
  assert.equal(snapshot.request.activeCommands.length, 2);
  assert.deepEqual(snapshot.sides[0].activeUIDs, ['p1a', 'p1b']);
  const before = snapshot.sides[0].team.slice(0, 2).map(mon => mon.moves.map(move => move.pp));
  assert.equal(snapshot.request.activeCommands[1].moves[0].disabled, true);
  assert.throws(() => game.act({ battleId: snapshot.id, choice: 'move 1 +1, move 1 +2' }), /当前无法执行/);
  const record = game.battles.get(snapshot.id);
  assert.equal(record.battle.turn, 1);
  assert.equal(record.battle.p1.choice.actions.length, 0);
  assert.deepEqual(record.battle.p1.active.map(mon => mon.baseMoveSlots.map(move => move.pp)), before);
});

test('Gen III doubles use spread targeting and damage both foes and the adjacent ally', () => {
  const { game, snapshot } = startDouble({
    team: [{ id: 6, moves: ['earthquake'], uid: 'charizard' }, { id: 9, uid: 'blastoise' }, { id: 4 }, { id: 7 }],
  });
  const result = game.act({ battleId: snapshot.id, choice: 'move 1, move 1' });
  assert.ok(result.events.some(event => event.includes('|Earthquake|') && event.includes('[spread]')));
  assert.ok(result.events.some(event => event.startsWith('|-damage|p2a:')));
  assert.ok(result.events.some(event => event.startsWith('|-damage|p2b:')));
  assert.ok(result.events.some(event => event.startsWith('|-damage|p1b:')));
});

test('double switch commands cannot select one reserve twice; valid joint swaps resolve together', () => {
  const { game, snapshot } = startDouble();
  assert.throws(() => game.act({ battleId: snapshot.id, choice: 'switch 3, switch 3' }), /当前无法执行/);
  assert.equal(game.battles.get(snapshot.id).battle.p1.choice.actions.length, 0);
  const result = game.act({ battleId: snapshot.id, choice: 'switch 3, switch 4' });
  assert.equal(result.turn, 2);
  assert.equal(result.sides[0].team.filter(mon => mon.active).length, 2);
  assert.ok(result.events.some(event => event.startsWith('|switch|')));
});

test('one double actor can use a healing item while the other still takes its action',()=>{
 const {game,snapshot}=startDouble({bag:{potion:1},opponent:[{id:129,moves:['splash']},{id:129,moves:['splash']}] }),record=game.battles.get(snapshot.id),target=record.battle.p1.pokemon[0];
 target.hp=Math.max(1,target.maxhp-15);
 const result=game.act({battleId:snapshot.id,choice:'item potion 1, move 1 +1'});
 assert.equal(result.turn,2);
 assert.equal(result.bag.potion,0);
 assert.ok(result.events.some(event=>event.includes('对皮卡丘使用了伤药')));
 assert.ok(result.events.some(event=>event.startsWith('|move|p1b:')),'the non-item actor still moves');
 assert.ok(result.events.some(event=>event.startsWith('|move|p2a:')||event.startsWith('|move|p2b:')),'the opponent still receives its turn');
});

test('Full Restore in doubles restores HP and status exactly once, including at full HP', () => {
  for (const missingHp of [0, 20]) {
    const {game, snapshot} = startDouble({
      bag: {fullrestore: 1},
      opponent: [{id: 129, moves: ['splash']}, {id: 129, moves: ['splash']}],
    });
    const record = game.battles.get(snapshot.id), mon = record.battle.p1.pokemon[0];
    mon.hp -= missingHp;
    mon.setStatus('par');
    // Avoid paralysis affecting the other actor and isolate the actual item turn.
    const result = game.act({battleId: snapshot.id, choice: 'item fullrestore 1, move 1 +1'});
    assert.equal(mon.hp, mon.maxhp);
    assert.equal(mon.status, '', 'Full Restore must cure the major status as well as HP');
    assert.equal(result.bag.fullrestore, 0);
    assert.equal(result.events.filter(event => event.startsWith('|-curestatus|p1a:')).length, 1,
      'the cure should be announced only once');
  }
});

test('universal medicine in doubles also cures confusion when that is the only problem', () => {
  for (const item of ['fullheal', 'fullrestore', 'healpowder']) {
    const {game, snapshot} = startDouble({
      bag: {[item]: 1},
      opponent: [{id: 129, moves: ['splash']}, {id: 129, moves: ['splash']}],
    });
    const actor = game.battles.get(snapshot.id).battle.p1.active[0];
    actor.addVolatile('confusion');
    const result = game.act({battleId: snapshot.id, choice: `item ${item} 1, move 1 +1`});
    assert.equal(Boolean(actor.volatiles.confusion), false, item);
    assert.equal(result.bag[item], 0);
    assert.ok(result.events.some(event => event.startsWith('|-end|p1a:') && event.toLowerCase().includes('|confusion')));
  }
});

test('invalid double item targets, full HP items, PP selections and revive targets do not spend inventory or advance',()=>{
 const {game,snapshot}=startDouble({bag:{potion:2,ether:1,revive:1},team:[
  {id:25,uid:'p1a'},{id:1,uid:'p1b'},{id:4,uid:'p1c'},{id:7,uid:'p1d'}
 ],opponent:[{id:129,moves:['splash']},{id:129,moves:['splash']}]});
 const record=game.battles.get(snapshot.id),mon=record.battle.p1.pokemon[0];
 const beforeTurn=record.battle.turn;
 assert.throws(()=>game.act({battleId:snapshot.id,choice:'item potion 9, move 1 +1'}),/目标/);
 assert.equal(record.bag.potion,2);assert.equal(record.battle.turn,beforeTurn);
 assert.throws(()=>game.act({battleId:snapshot.id,choice:'item potion 1, item ether 1 1'}),/最多由一位/);
 assert.equal(record.bag.potion,2);assert.equal(record.bag.ether,1);assert.equal(record.battle.turn,beforeTurn);
 const second=record.battle.p1.pokemon[1];second.baseMoveSlots[0].pp=0;second.moveSlots[0].pp=0;mon.hp-=20;
 assert.throws(()=>game.act({battleId:snapshot.id,choice:'item potion 1, move 1 +1'}),/当前无法执行/);
 assert.equal(record.bag.potion,2);assert.equal(record.battle.turn,beforeTurn);
 mon.hp=mon.maxhp;
 assert.throws(()=>game.act({battleId:snapshot.id,choice:'item potion 1, move 1 +1'}),/HP已满/);
 assert.equal(record.bag.potion,2);assert.equal(record.battle.turn,beforeTurn);
 assert.throws(()=>game.act({battleId:snapshot.id,choice:'item ether 1 4, move 1 +1'}),/PP已满/);
 assert.equal(record.bag.ether,1);assert.equal(record.battle.turn,beforeTurn);
 assert.throws(()=>game.act({battleId:snapshot.id,choice:'item revive 3, move 1 +1'}),/倒下/);
 assert.equal(record.bag.revive,1);assert.equal(record.battle.turn,beforeTurn);
});

test('double Ether restores PP and Revive restores a fainted reserve',()=>{
 const pp=startDouble({bag:{ether:1},opponent:[{id:129,moves:['splash']},{id:129,moves:['splash']}]});
 const mon=pp.game.battles.get(pp.snapshot.id).battle.p1.pokemon[0];mon.baseMoveSlots[0].pp=0;mon.moveSlots[0].pp=0;
 const ether=pp.game.act({battleId:pp.snapshot.id,choice:'item ether 1 1, move 1 +1'});
 assert.ok(ether.sides[0].team[0].moves[0].pp>0);assert.equal(ether.bag.ether,0);
 assert.ok(ether.events.some(event=>event.startsWith('|move|p1b:')));

 const revival=startDouble({bag:{revive:1},opponent:[{id:129,moves:['splash']},{id:129,moves:['splash']}]}),record=revival.game.battles.get(revival.snapshot.id),reserve=record.battle.p1.pokemon[2];
 reserve.hp=0;reserve.fainted=true;record.battle.p1.pokemonLeft--;
 const healed=revival.game.act({battleId:revival.snapshot.id,choice:'item revive 3, move 1 +1'});
 assert.ok(healed.sides[0].team[2].hp>0);assert.equal(healed.sides[0].team[2].fainted,false);assert.equal(healed.bag.revive,0);
 assert.ok(healed.events.some(event=>event.startsWith('|move|p1b:')));
});

test('double forced replacements expose two slots and accept distinct reserves in one request', () => {
  const { game, snapshot } = startDouble({
    team: [
      { id: 10, uid: 'lead1', state: { hp: 1 } }, { id: 13, uid: 'lead2', state: { hp: 1 } },
      { id: 25, uid: 'reserve1' }, { id: 1, uid: 'reserve2' },
    ],
    opponent: [{ id: 6, moves: ['earthquake'] }, { id: 9, moves: ['earthquake'] }, { id: 3 }],
  });
  const forced = game.act({ battleId: snapshot.id, choice: 'move 1 +1, move 1 +2', enemyChoice: 'move 1, move 1' });
  assert.deepEqual(forced.request.forceSwitch, [true, true]);
  assert.deepEqual(forced.request.activeCommands.map(actor => actor.forceSwitch), [true, true]);
  const replaced = game.act({ battleId: snapshot.id, choice: 'switch 3, switch 4' });
  assert.equal(replaced.turn, 2);
  assert.ok(replaced.events.some(event => event.startsWith('|switch|')));
});

test('finite NPC medicine spends its actor turn, leaves the second actor able to move, and is not infinite', () => {
  const { game, snapshot } = startDouble({
    trainerItems: { superpotion: 1 },
    itemPolicy: { kind: 'finite-per-battle', maxUses: 1, allowed: ['superpotion'] },
  });
  const record = game.battles.get(snapshot.id);
  record.battle.p2.active[0].hp = Math.floor(record.battle.p2.active[0].maxhp * 0.2);
  const result = game.act({ battleId: snapshot.id, choice: 'move 1 +1, move 1 +2' });
  assert.equal(result.trainerItemUses, 1);
  assert.equal(result.opponentBag.superpotion, 0);
  assert.ok(result.events.some(event => event.includes('|-heal|p2a:') && event.includes('item: 好伤药')));
  assert.equal(result.events.some(event => event.startsWith('|move|p2a:')), false);
  assert.ok(result.events.some(event => event.startsWith('|move|p2b:')));
  assert.equal(result.plannedTrainerItem, null);
});

test('wild battles never spend NPC trainer inventory; serialized doubles snapshot retains PP and held items', () => {
  const game = new KantoGame();
  const wild = game.start({ mode: 'wild', team: [{ id: 25 }], opponent: [{ id: 129 }], trainerItems: { potion: 2 } });
  const wildResult = game.act({ battleId: wild.id, choice: 'move 1' });
  assert.equal(wildResult.opponentBag.potion, 2);
  assert.equal(wildResult.trainerItemUses, 0);

  const doubles = game.start({
    mode: 'doubles',
    team: [
      { id: 25, uid: 'persist-a', item: 'lightball', moves: ['thunderbolt'], state: { hp: 1, moves: [{ id: 'thunderbolt', pp: 1, maxpp: 15 }] } },
      { id: 1, uid: 'persist-b' },
    ],
    opponent: [{ id: 4 }, { id: 7 }], seed: [1, 2, 3, 4],
  });
  assert.equal(doubles.sides[0].team[0].heldItem, 'lightball');
  assert.deepEqual(doubles.sides[0].team[0].moves[0], { id: 'thunderbolt', pp: 1, maxpp: 15 });
  const after = game.act({ battleId: doubles.id, choice: 'move 1 +1, move 1 +2' });
  assert.equal(after.sides[0].team[0].heldItem, 'lightball');
  assert.equal(after.sides[0].team[0].moves[0].pp, 0);
});
