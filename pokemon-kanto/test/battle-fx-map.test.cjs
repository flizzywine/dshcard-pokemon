'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { catalog, Dex } = require('../engine.cjs');

const source = fs.readFileSync(path.join(__dirname, '../public/battle-fx-map.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const fx = vm.runInNewContext(`${source}\nglobalThis.KantoBattleFx;`, {});

test('every currently supported Kanto Gen III move has its real type and a readable motion family', () => {
  const modes = new Set(['beam', 'projectile', 'contact', 'slash', 'multi', 'buff', 'debuff', 'field', 'weather', 'healing', 'drain', 'status']);
  const moves = Object.values(catalog.moves);
  assert.ok(moves.length > 150);
  for (const move of moves) {
    const profile = fx.resolve(move, move.target === 'self');
    const source = Dex.moves.get(move.id);
    assert.equal(profile.type, move.type, `${move.id} retains its actual Gen III type`);
    assert.equal(profile.category, move.category, `${move.id} retains its physical/special/status category`);
    assert.ok(modes.has(profile.mode), `${move.id} maps to an understood visual family`);
    if (source.multihit) assert.equal(profile.mode, 'multi', `${move.id} reads as a repeated hit`);
    if (source.flags.contact) assert.equal(profile.contact, true, `${move.id} retains its contact flag`);
    if (move.category === 'Physical' && !source.flags.contact && !['fakeout', 'covet'].includes(move.id)) {
      assert.notEqual(profile.mode, 'contact', `${move.id} retains its non-contact projectile or field action`);
    }
  }
  assert.equal(fx.resolve(catalog.moves.thunderbolt).mode, 'beam');
  assert.equal(fx.resolve(catalog.moves.swordsdance, true).mode, 'buff');
  assert.equal(fx.resolve(catalog.moves.doublekick).mode, 'multi');
  assert.equal(fx.resolve(catalog.moves.rockslide).mode, 'field');
  const signatureMoves = ['firespin', 'flamethrower', 'fireblast', 'hydropump', 'surf', 'thunderbolt', 'thunder', 'icebeam', 'blizzard', 'razorleaf', 'solarbeam', 'psychic', 'shadowball', 'earthquake', 'rockslide', 'hyperbeam', 'dragonrage'];
  for (const id of signatureMoves) assert.ok(fx.resolve(catalog.moves[id]).cue, `${id} has a named stage cue`);
  assert.equal(fx.resolve(catalog.moves.firespin).cue, 'fire-vortex');
  assert.equal(fx.resolve(catalog.moves.fireblast).cue, 'fire-sigil');
  assert.equal(fx.resolve(catalog.moves.solarbeam).cue, 'solar-charge');
  for (const id of ['aurorabeam','icywind','powdersnow','thundershock','magicalleaf','rockthrow','rocktomb','mudshot','mudslap','extrasensory']) {
    assert.ok(fx.resolve(catalog.moves[id]).cue, `${id} has a choreography cue`);
  }
  assert.match(html, /battle-fx-map\.js/);
  assert.match(app, /KantoBattleFx\?\.resolve\(move, selfTarget \|\| actorSide\(parts\[4\]\) === attacker\)/);
});

test('all 354 numbered Gen III moves expose exact battle metadata and a usable FX profile', () => {
  const actual = new Map(Dex.moves.all()
    .filter(move => move.exists && move.gen <= 3 && move.num >= 1 && move.num <= 354)
    .map(move => [move.id, Dex.moves.get(move.id)]));
  assert.equal(actual.size, 354);
  assert.equal(Object.keys(catalog.moves).length, 354);
  assert.equal(Object.keys(catalog.moves).filter(id => actual.has(id)).length, 354);
  for (const [id, source] of actual) {
    const move = catalog.moves[id], profile = fx.resolve(move);
    assert.ok(move, `${id} is present for called moves`);
    assert.ok(profile.mode, `${id} resolves to a visual mode`);
    assert.equal(move.number, source.num, `${id} has its Gen III move number`);
    assert.equal(move.generation, source.gen, `${id} has its original generation`);
    assert.equal(move.type, source.type, `${id} retains its Gen III type`);
    assert.equal(move.category, source.category, `${id} retains its Gen III category`);
    assert.deepEqual(JSON.parse(JSON.stringify(move.multihit)), JSON.parse(JSON.stringify(source.multihit ?? null)), `${id} retains multihit data`);
    assert.equal(move.contact, Boolean(source.flags.contact), `${id} retains its contact flag`);
    assert.equal(Boolean(move.flags.metronome), Boolean(source.flags.metronome), `${id} follows the Gen III Metronome flag`);
    assert.equal(profile.contact, Boolean(source.flags.contact), `${id} FX profile has the correct contact behavior`);
    if (source.multihit || id === 'beatup') assert.equal(profile.mode, 'multi', `${id} reads as a repeated hit`);
  }
  const distinctCues = ['hypnosis','dreameater','leechseed','doubleteam','substitute','teleport','transform','hyperbeam','metronome','sacredfire','aeroblast','doomdesire','weatherball','rapidspin','wish','destinybond','recover','counter','mirrorcoat','bide','fakeout','brickbreak','taunt','assist','stockpile','swallow','refresh','aromatherapy','painsplit','perishsong'];
  for (const id of distinctCues) assert.ok(fx.resolve(catalog.moves[id]).cue, `${id} has a named stage cue`);
  assert.equal(catalog.species.length, 151);
  assert.ok(catalog.species.every(species => !species.moves.includes('aeroblast')), 'expanded effect data does not expand learnsets');
  assert.equal(Boolean(catalog.moves.iceball.flags.metronome), true, 'Metronome uses the same flag as Showdown Gen 3');
});

test('every move exposes a finite four-stage choreography with move-specific trajectory and typed colors', () => {
  const profiles = Object.values(catalog.moves).map(move => fx.resolve(move).choreography);
  assert.equal(profiles.length, 354);
  for (const [index, profile] of profiles.entries()) {
    assert.equal(profile.phases.length, 4);
    assert.deepEqual(Array.from(profile.phases, phase => phase.phase), ['prepare','travel','impact','settle']);
    for (const phase of profile.phases) {
      assert.match(phase.color, /^#[0-9a-f]{6}$/i);
      assert.ok(Number.isFinite(phase.duration) && phase.duration > 0 && phase.duration <= 700);
      assert.ok(Number.isInteger(phase.particles) && phase.particles >= 1 && phase.particles <= 16);
    }
    assert.ok(profile.name && profile.trajectory, `move ${index} has a named motion`);
  }
  assert.equal(new Set(profiles.map(profile => profile.name)).size, 354, 'each Gen III move receives its own named profile');
  assert.equal(new Set(profiles.map(profile => profile.trajectory)).size, 354, 'each Gen III move receives its own route key');
  const motion = id => fx.resolve(catalog.moves[id]).choreography;
  assert.deepEqual([motion('flamethrower').name, motion('flamethrower').trajectory], ['fire-lance','spiral-stream-flamethrower-line']);
  assert.deepEqual([motion('firespin').name, motion('firespin').trajectory], ['orbiting-vortex','encircle-firespin-fan']);
  assert.deepEqual([motion('fireblast').name, motion('fireblast').trajectory], ['five-point-sigil','radial-burst-fireblast-spiral']);
  assert.deepEqual([motion('watergun').name, motion('watergun').trajectory], ['narrow-water-jet','straight-watergun-orbit']);
  assert.deepEqual([motion('hydropump').name, motion('hydropump').trajectory], ['pressurized-cannon','straight-heavy-hydropump-spiral']);
  assert.deepEqual([motion('surf').name, motion('surf').trajectory], ['advancing-tidal-wall','horizontal-surge-surf-line']);
  for (const id of ['thunderbolt','thunder','icebeam','blizzard','solarbeam','razorleaf','psychic','hypnosis','leechseed','shadowball','earthquake','rockslide','hyperbeam','selfdestruct','explosion','dragonrage','dragonclaw','fly','dig','substitute','protect']) {
    assert.notEqual(motion(id).name, `${id}-motion`, `${id} keeps its bespoke presentation profile`);
  }
});
