'use strict';

const fs = require('node:fs');
const path = require('node:path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data/frlg-encounters.json'), 'utf8').replace(/^\uFEFF/, ''));
const versions = new Set(['firered', 'leafgreen']);
const methods = new Set(['auto', 'land', 'water', 'oldrod', 'goodrod', 'superrod']);
const rodGroups = data.weights.rods;

function selectPool(nodeId, version, method) {
  const location = data.nodes[nodeId]?.[version];
  if (!location) return null;
  let actualMethod = method;
  let table;
  if (method === 'auto') {
    if (location.pools.land?.slots.length) actualMethod = 'land';
    else if (location.pools.water?.slots.length) actualMethod = 'water';
    else return null;
  }
  if (['oldrod', 'goodrod', 'superrod'].includes(actualMethod)) {
    table = location.pools.fishing;
    if (!table) return null;
    const indexes = new Set(rodGroups[`${actualMethod.replace('rod', '')}_rod`]);
    table = { rate: table.rate, slots: table.slots.filter(slot => indexes.has(slot.sourceIndex)) };
  } else {
    table = location.pools[actualMethod];
  }
  if (!table?.slots.length) return null;
  const slots = table.slots.map(({ id, minLevel, maxLevel, weight }) => ({ id, minLevel, maxLevel, weight }));
  return {
    sourceMap: location.sourceMap,
    method: actualMethod,
    rate: table.rate,
    slots,
    species: [...new Set(slots.map(slot => slot.id))],
  };
}

function pool(node, { version = 'firered', method = 'auto' } = {}) {
  if (typeof node !== 'string') throw new TypeError('地图节点必须是字符串。');
  if (!versions.has(version)) throw new RangeError('版本只能是firered或leafgreen。');
  if (!methods.has(method)) throw new RangeError('方法只能是auto、land、water、oldrod、goodrod或superrod。');
  return selectPool(node, version, method);
}

function seedRandom(seed, context) {
  const input = `${typeof seed}:${String(seed)}|${context}`;
  let state = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    state ^= input.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function roll(node, { version = 'firered', method = 'auto', speciesId, seed = 0 } = {}) {
  if (typeof seed !== 'string' && (!Number.isSafeInteger(seed))) throw new TypeError('seed必须是字符串或安全整数。');
  if (speciesId !== undefined && (!Number.isInteger(speciesId) || speciesId < 1 || speciesId > 151)) throw new RangeError('speciesId必须是1到151之间的整数。');
  const selected = pool(node, { version, method });
  if (!selected) return null;
  const slots = speciesId === undefined ? selected.slots : selected.slots.filter(slot => slot.id === speciesId);
  if (!slots.length) throw new RangeError('指定宝可梦不在该版本与方法的遭遇池中。');
  const totalWeight = slots.reduce((sum, slot) => sum + slot.weight, 0);
  if (!Number.isSafeInteger(totalWeight) || totalWeight <= 0) throw new Error('遭遇权重数据无效。');
  const random = seedRandom(seed, `${node}|${version}|${selected.method}|${speciesId ?? 'any'}`);
  let point = random() * totalWeight;
  let chosen = slots[slots.length - 1];
  for (const slot of slots) {
    point -= slot.weight;
    if (point < 0) { chosen = slot; break; }
  }
  const level = chosen.minLevel + Math.floor(random() * (chosen.maxLevel - chosen.minLevel + 1));
  return { speciesId: chosen.id, level };
}

module.exports = { pool, roll, source: data.source };
