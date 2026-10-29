'use strict';

// FRLG-only move and evolution rules. The battle simulator remains Gen 3, but
// party progression must use the FRLG learnset rather than the union of Gen 3.
const {Dex: BaseDex} = require('./vendor/showdown/sim/dex.js');
const Dex = BaseDex.mod('gen3frlg');
const {catalog} = require('./engine.cjs');
const {species: speciesList} = catalog;
const byId = new Map(speciesList.map(species => [species.id, species]));
const eggMoves = require('./public/data/classic-egg-moves.json');
const machines = require('./public/data/tmhm.json').filter(entry => entry.id !== 'hm08');
const hmMoves = new Set(machines.filter(entry => entry.kind === 'hm').map(entry => entry.move));
const levelMoveCache = new Map();
// Entries learned together must follow the FRLG level-up table, not the
// alphabetic order of Showdown's object keys.  These are the Kanto species
// with multiple level-up moves above level 1 in the cartridge tables.
const simultaneousMoves = {
  23: {37: ['stockpile', 'swallow', 'spitup']},
  24: {46: ['stockpile', 'swallow', 'spitup']},
  107: {26: ['thunderpunch', 'icepunch', 'firepunch']},
};
const learnset = id => {
  const info = byId.get(id);
  if (!info) return {};
  return Dex.species.getLearnsetData(info.key).learnset || {};
};

function ancestry(id) {
  const result = [];
  for (let species = byId.get(id) && Dex.species.get(byId.get(id).key); species?.exists; ) {
    result.push(species);
    species = species.prevo ? Dex.species.get(species.prevo) : null;
  }
  return result;
}

function cachedLevelMoves(id) {
  if (levelMoveCache.has(id)) return levelMoveCache.get(id);
  const moves = [];
  for (const [move, sources] of Object.entries(learnset(id))) {
    for (const source of sources) {
      const match = /^3L(\d+)$/.exec(source);
      if (match) moves.push({move, level: Number(match[1])});
    }
  }
  moves.sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    const order = simultaneousMoves[id]?.[a.level];
    if (order) {
      const rank = move => { const index = order.indexOf(move); return index < 0 ? order.length : index; };
      const delta = rank(a.move) - rank(b.move);
      if (delta) return delta;
    }
    return a.move.localeCompare(b.move);
  });
  levelMoveCache.set(id, moves);
  return moves;
}

// Callers receive their own entries and cannot corrupt future learnsets.
function levelMoves(id) { return cachedLevelMoves(id).map(entry => ({...entry})); }

function canLearnMachine(id, move) {
  return Object.entries(learnset(id)).some(([key, sources]) => key === move && sources.includes('3M'));
}

function canLearnLevelMove(id, move) {
  return ancestry(id).some(species => {
    const sources = Dex.species.getLearnsetData(species.id).learnset?.[move] || [];
    return sources.some(source => /^3L\d+$/.test(source));
  });
}

function canKnowMove(id, move) {
  return ancestry(id).some(species => {
    const sources = Dex.species.getLearnsetData(species.id).learnset?.[move] || [];
    return sources.some(source => /^3(?:L\d+|M|T|E|S|D)$/.test(source));
  }) || ancestry(id).some(species => (eggMoves[species.num] || []).includes(move));
}

function levelMovesAt(id, level) {
  return cachedLevelMoves(id).filter(entry => entry.level === level).map(entry => entry.move);
}

function isHmMove(move) { return hmMoves.has(move); }

function evolutionAtLevel(id, level, friendship) {
  const species = byId.get(id) && Dex.species.get(byId.get(id).key);
  if (!species?.exists) return null;
  return (species.evos || []).map(key => Dex.species.get(key)).find(evo => {
    if (!evo.exists || evo.num < 1 || evo.num > 151) return false;
    if (evo.evoLevel && !evo.evoType && level >= evo.evoLevel) return true;
    return evo.evoType === 'levelFriendship' && friendship >= 220;
  }) || null;
}

module.exports = {Dex, levelMoves, levelMovesAt, canLearnLevelMove, canLearnMachine, canKnowMove, evolutionAtLevel, isHmMove};
