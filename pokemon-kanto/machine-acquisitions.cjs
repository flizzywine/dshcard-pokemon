'use strict';

const fs = require('node:fs');
const path = require('node:path');
const DATA = path.join(__dirname, 'public', 'data');
const machines = JSON.parse(fs.readFileSync(path.join(DATA, 'tmhm.json'), 'utf8'));
const items = JSON.parse(fs.readFileSync(path.join(DATA, 'items.json'), 'utf8'));
const machineById = new Map([...machines, ...items].map(item => [item.id, item]));
const {catalog: gameCatalog} = require('./engine.cjs');
const moveById = new Map(Object.values(gameCatalog.moves).map(move => [move.id, move]));

function machineNames(item) {
  if (!item?.move) return {};
  const moveNameZh = moveById.get(item.move)?.name || item.moveName || item.move;
  return {moveNameZh, nameZh: `${item.kind === 'hm' ? 'HM' : 'TM'}${String(item.number).padStart(2,'0')} ${moveNameZh}`};
}

// Only the Oak aide rewards whose locations and Pokédex gates are represented
// by existing map nodes are claimable. Other HM recipients need story/key items.
const ACQUISITIONS = Object.freeze([
  {id:'everstone',node:'route10',source:'Route 10 Pokémon Center Oak aide',label:'领取不变之石',caughtSpecies:20},
  {id: 'hm05', node: 'route2', source: 'Route 2 Oak aide', label: '领取HM05（闪光）', caughtSpecies: 10},
  {id: 'amuletcoin', node: 'route16', source: 'Route 16 North Entrance 2F Oak aide', label: '领取护符金币', caughtSpecies: 40},
  {id: 'expshare', node: 'route15', source: 'Route 15 Oak aide', label: '领取学习装置', caughtSpecies: 50},
]);

function caughtSpeciesCount(world) {
  const dex = new Set(world?.统计?.捕获图鉴 || []);
  for (const mon of [...(world?.队伍 || []), ...(world?.电脑 || [])]) {
    if(mon.uid==='starter'&&world?.剧情?.初始御三家已选===false)continue;
    // Any currently owned Pokémon is registered as caught in FRLG, including
    // the starter and evolved species. The persisted dex above also preserves
    // registrations after a Pokémon is released or otherwise leaves the party.
    for (const id of [Number(mon.收服图鉴编号), Number(mon.图鉴编号)])
      if (Number.isInteger(id) && id >= 1 && id <= 151) dex.add(id);
  }
  return dex.size;
}
function seenSpeciesCount(world) {
  const dex = new Set([...(world?.统计?.见过图鉴 || []), ...(world?.遭遇?.队伍 || []).map(mon => mon.图鉴编号)]);
  return dex.size;
}

function available(world) {
  const node = world?.地图?.节点;
  const claimed = world?.剧情?.已领取机器 || {};
  const caught = caughtSpeciesCount(world), seen = seenSpeciesCount(world);
  return ACQUISITIONS.filter(entry => entry.node === node && !claimed[entry.id] &&
    (entry.caughtSpecies === undefined || caught >= entry.caughtSpecies) &&
    (entry.seenSpecies === undefined || seen >= entry.seenSpecies))
    .map(entry => {
      const item = machineById.get(entry.id);
      return {...entry, ...machineNames(item), name: item?.name || item?.moveName || entry.id};
    });
}

function claim(world, itemId) {
  const entry = ACQUISITIONS.find(candidate => candidate.id === itemId);
  if (!entry || !available(world).some(candidate => candidate.id === itemId)) {
    throw new Error('当前位置或图鉴进度不满足领取条件，或该物品已经领取。');
  }
  const item = machineById.get(itemId);
  if (!item || !Number.isInteger(world?.背包?.物品?.[itemId])) throw new Error('背包未配置该道具。');
  if (world.背包.物品[itemId] >= 999) throw new Error('背包中的物品已达到数量上限。');
  world.背包.物品[itemId] += 1;
  world.剧情.已领取机器[itemId] = true;
  return {id: itemId, ...machineNames(item), name: item.name || item.moveName || itemId, source: entry.source};
}

module.exports = {ACQUISITIONS, caughtSpeciesCount, seenSpeciesCount, available, claim};
