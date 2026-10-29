'use strict';

const fs = require('node:fs');
const path = require('node:path');
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data/kanto-field-services.json'), 'utf8'));
const clone = value => structuredClone(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);
const badges = ['岩石徽章', '蓝色徽章', '橙色徽章', '彩虹徽章', '粉红徽章', '金色徽章', '深红徽章', '绿色徽章'];
const fossilItems = new Set(['helixfossil', 'domefossil', 'oldamber']);
const revived = {
  helixfossil: {speciesId: 138, level: 5, name: '菊石兽'},
  domefossil: {speciesId: 140, level: 5, name: '化石盔'},
  oldamber: {speciesId: 142, level: 5, name: '化石翼龙'}
};
const cloneWorld = world => clone(world);
const worldOf = value => value?.stat_data?.宝可梦 || value;

function ensure(world) {
  if (!isRecord(world)) throw new TypeError('需要关都世界状态。');
  if (!isRecord(world.剧情)) world.剧情 = {};
  let state = world.剧情.场地服务;
  if (!isRecord(state)) state = world.剧情.场地服务 = {};
  for (const key of ['claimed', 'cleared', 'fossils']) if (!isRecord(state[key])) state[key] = {};
  if (state.giftChosen !== null && ![106, 107].includes(state.giftChosen)) state.giftChosen = null;
  return world;
}

function validate(value) {
  const world = worldOf(value), state = world?.剧情?.场地服务;
  if (!isRecord(state) || !isRecord(state.claimed) || !isRecord(state.cleared) || !isRecord(state.fossils)) throw new Error('场地服务存档结构无效。');
  if (state.giftChosen !== null && ![106, 107].includes(state.giftChosen)) throw new Error('格斗道场礼物选择无效。');
  for (const record of [state.claimed, state.cleared, state.fossils]) {
    for (const val of Object.values(record)) if (typeof val !== 'boolean' && !isRecord(val) && val !== null && typeof val !== 'string') throw new Error('场地服务记录值无效。');
  }
  if (state.fossils.chosen !== undefined && ![null, 'helixfossil', 'domefossil'].includes(state.fossils.chosen)) throw new Error('化石选择记录无效。');
  for (const [id, pending] of Object.entries(state.fossils.pending || {})) {
    if (!fossilItems.has(id) || !isRecord(pending) || !Number.isSafeInteger(pending.readyAt) || pending.readyAt < 0 || pending.speciesId !== revived[id]?.speciesId) throw new Error('待领取化石复活记录无效。');
  }
  for (const [id, value] of Object.entries(state.fossils.revived || {})) if (!fossilItems.has(id) || typeof value !== 'boolean') throw new Error('化石复活记录无效。');
  return true;
}

function hasKeyItem(world, id) {
  const keys = world?.背包?.关键物品;
  if (Array.isArray(keys)) return keys.some(item => String(typeof item === 'string' ? item : item?.id || item?.item || '').toLowerCase() === id.toLowerCase());
  return isRecord(keys) && (keys[id] === true || (Number.isInteger(keys[id]) && keys[id] > 0));
}

function addKeyItem(world, id, name) {
  const bag = world.背包 || (world.背包 = {});
  if (!Array.isArray(bag.关键物品) && !isRecord(bag.关键物品)) bag.关键物品 = [];
  if (hasKeyItem(world, id)) throw new Error(`${name}已经在背包中。`);
  if (Array.isArray(bag.关键物品)) bag.关键物品.push(id);
  else bag.关键物品[id] = true;
}

function removeKeyItem(world, id) {
  const keys = world?.背包?.关键物品;
  if (Array.isArray(keys)) {
    const index = keys.findIndex(item => String(typeof item === 'string' ? item : item?.id || item?.item || '').toLowerCase() === id.toLowerCase());
    if (index < 0) return false;
    keys.splice(index, 1); return true;
  }
  if (isRecord(keys) && hasKeyItem(world, id)) { delete keys[id]; return true; }
  return false;
}

function requireBagRoom(world, id) {
  const count = world?.背包?.物品?.[id];
  if (!Number.isInteger(count)) throw new Error('背包未配置该道具。');
  if (count >= 999) throw new Error('背包中的物品已达到数量上限。');
}
function giveBagItem(world, id) { requireBagRoom(world, id); world.背包.物品[id]++; }
function node(world) { return world?.地图?.节点; }
function caughtSpeciesCount(world) {
  const seen = new Set(world?.统计?.捕获图鉴 || []);
  for (const mon of [...(world?.队伍 || []), ...(world?.电脑 || [])]) {
    const id = Number(mon?.收服图鉴编号 || mon?.图鉴编号);
    if (Number.isInteger(id) && id >= 1 && id <= 151) seen.add(id);
  }
  return seen.size;
}

function hasFlag(world, names) {
  const wanted = new Set(names.map(name => name.toLowerCase().replace(/[^a-z]/g, '')));
  const roots = [world?.剧情?.关都事件?.标记, world?.剧情?.关都事件, world?.剧情?.标记, world?.剧情];
  for (const root of roots) if (isRecord(root)) for (const [key, value] of Object.entries(root)) {
    if (wanted.has(key.toLowerCase().replace(/[^a-z]/g, '')) && (value === true || value === 1)) return true;
  }
  return false;
}
function hasMove(world, id) {
  return (world?.队伍 || []).some(mon => (mon?.招式 || []).some(move => String(typeof move === 'string' ? move : move?.id || '').toLowerCase() === id));
}
function hasBadges(world, count) { return (world?.训练家?.徽章 || []).length >= count; }
function option(id, label, payload = {}, enabled = true, reason = '') {
  return {id, label, enabled, ...(reason ? {reason} : {}), ...(Object.keys(payload).length ? {payload} : {})};
}
function serviceOptions(world, {storyTurn} = {}) {
  const saved = world?.剧情?.场地服务 || {};
  const state = {claimed: {}, cleared: {}, fossils: {}, giftChosen: null, ...saved,
    claimed: isRecord(saved.claimed) ? saved.claimed : {}, cleared: isRecord(saved.cleared) ? saved.cleared : {},
    fossils: isRecord(saved.fossils) ? saved.fossils : {}};
  const at = node(world), out = [];
  const busy = world?.战斗?.状态 !== 'finished';
  const add = entry => out.push(entry);
  if(at==='celadon'&&!state.claimed.tea&&!hasKeyItem(world,'tea'))add(option('field-claim-tea','从玉虹公馆领取热茶',{item:'tea'},!busy,busy?'请先结束当前遭遇。':''));
  if (at === 'route11' && !state.claimed.itemfinder && !hasKeyItem(world, 'itemfinder')) {
    const enough = caughtSpeciesCount(world) >= 30;
    add(option('field-claim-itemfinder', '领取探宝器', {item: 'itemfinder'}, enough && !busy,
      busy ? '请先结束当前遭遇。' : enough ? '' : `已收服图鉴达到30种后可领取（当前${caughtSpeciesCount(world)}种）。`));
  }
  if (['route12', 'route16'].includes(at)) {
    const event = `snorlax:${at}`, cleared = state.cleared[event] === true;
    if (!cleared) add(option('field-awaken-snorlax', '用宝可梦笛子唤醒卡比兽', {id: at}, hasFlag(world, ['pokeflute', 'pokemonFlute']) && !busy,
      busy ? '请先结束当前遭遇。' : hasFlag(world, ['pokeflute', 'pokemonFlute']) ? '' : '需要持有宝可梦笛子。'));
    const itemKey = `leftovers:${at}`;
    if (cleared && hasKeyItem(world, 'itemfinder') && !state.claimed[itemKey]) add(option('field-search-itemfinder', '用探宝器找到隐藏的剩饭', {item: 'leftovers', id: at}, !busy, busy ? '请先结束当前遭遇。' : ''));
  }
  if (at === 'pokemon-tower' && hasFlag(world, ['FujiRescued', 'MrFujiRescued']) && hasKeyItem(world, 'itemfinder') && !state.claimed.soothebell) {
    add(option('field-search-itemfinder', '用探宝器找到安抚之铃', {item: 'soothebell'}, !busy, busy ? '请先结束当前遭遇。' : ''));
  }
  if (at === 'viridian' && hasBadges(world, 8) && hasKeyItem(world, 'itemfinder') && !state.claimed.machobrace) {
    add(option('field-search-itemfinder', '用探宝器找到强制锻炼器', {item: 'machobrace'}, !busy, busy ? '请先结束当前遭遇。' : ''));
  }
  if (at === 'pewter' && hasMove(world, 'cut') && (world?.训练家?.徽章 || []).includes('蓝色徽章') && !state.claimed.oldamber && !hasKeyItem(world, 'oldamber')) {
    add(option('field-claim-oldamber', '从博物馆后门领取秘密琥珀', {item: 'oldamber'}, !busy, busy ? '请先结束当前遭遇。' : ''));
  }
  if (at === 'mt-moon' && !state.cleared['fossil-researcher']) add(option('field-challenge-fossil-researcher', '挑战化石研究员', {}, !busy, busy ? '请先结束当前遭遇。' : ''));
  if (at === 'mt-moon' && state.cleared['fossil-researcher'] && !state.fossils.chosen) {
    add(option('field-choose-fossil', '选择贝壳化石', {item: 'helixfossil'}, !busy, busy ? '请先结束当前遭遇。' : ''));
    add(option('field-choose-fossil', '选择甲壳化石', {item: 'domefossil'}, !busy, busy ? '请先结束当前遭遇。' : ''));
  }
  if (at === 'cinnabar') {
    for (const id of ['helixfossil', 'domefossil', 'oldamber']) {
      if (hasKeyItem(world, id) && !state.fossils.pending?.[id] && !state.fossils.revived?.[id]) add(option('field-revive-fossil', `交出${DATA.items[id === 'oldamber' ? 'oldamber-fossil' : id].name}复活宝可梦`, {item: id}, !busy, busy ? '请先结束当前遭遇。' : ''));
      const pending = state.fossils.pending?.[id];
      if (pending && storyNumber(world, storyTurn) >= pending.readyAt) add(option('field-claim-revived-fossil', `领取复活的${revived[id].name}`, {item: id}, !busy, busy ? '请先结束当前遭遇。' : ''));
    }
  }
  if (at === 'saffron' && !state.cleared.dojo) add(option('field-challenge-dojo', '挑战格斗道场', {}, !busy && (world?.队伍 || []).some(mon => Number(mon?.当前HP) > 0), busy ? '请先结束当前遭遇。' : '队伍中至少需要一只未倒下的宝可梦。'));
  if (at === 'saffron' && state.cleared.dojo && state.giftChosen === null) {
    add(option('field-choose-dojo-gift', '领取飞腿郎', {id: 106}, !busy, busy ? '请先结束当前遭遇。' : ''));
    add(option('field-choose-dojo-gift', '领取快拳郎', {id: 107}, !busy, busy ? '请先结束当前遭遇。' : ''));
  }
  return out;
}

function needAt(world, location) { if (node(world) !== location) throw new Error('当前位置无法进行这项场地服务。'); }
function needFinished(world) { if (world?.战斗?.状态 !== 'finished') throw new Error('请先结束当前遭遇。'); }
function storyNumber(world, storyTurn) { return Number.isSafeInteger(storyTurn) && storyTurn >= 0 ? storyTurn : Number(world?.地图?.轮次) || 0; }
function startBattle(world, {type = 'trainer', trainer, title, theme, fieldEvent, fixed = true, team}) {
  needFinished(world);
  const turn = (Number(world?.地图?.轮次) || 0) + 1, mvu = require('./mvu.cjs');
  const roster = team.map((entry, index) => mvu.makeMon(entry.speciesId, entry.level, `field-${fieldEvent}-${turn}-${index}`));
  world.地图.轮次 = turn;
  world.遭遇 = {类型: type, 训练家: trainer, 队伍: roster, fieldEvent, 固定遭遇: fixed, title, theme};
  world.战斗 = {轮次: turn, 状态: 'pending', 结果: '', 摘要: `${title}：${trainer}现身。`, 操作序号: 0};
  return world;
}

function apply(value, action, payload = {}, {storyTurn} = {}) {
  const source = worldOf(value);
  if (!isRecord(source)) throw new TypeError('需要关都世界状态。');
  const next = cloneWorld(source), world = ensure(next), state = world.剧情.场地服务;
  needFinished(world);
  const id = String(payload?.item || payload?.id || '');
  if (action==='field-claim-tea'){
    needAt(world,'celadon');if(state.claimed.tea||hasKeyItem(world,'tea'))throw Error('玉虹公馆的热茶只能领取一次。');
    addKeyItem(world,'tea','热茶');state.claimed.tea=true;
  } else if (action === 'field-claim-itemfinder') {
    needAt(world, 'route11');
    if (state.claimed.itemfinder || caughtSpeciesCount(world) < 30) throw new Error('需在11号道路且已收服至少30种宝可梦；探宝器只能领取一次。');
    addKeyItem(world, 'itemfinder', '探宝器'); state.claimed.itemfinder = true;
  } else if (action === 'field-awaken-snorlax') {
    const at = node(world);
    if (!['route12', 'route16'].includes(at)) throw new Error('这里没有挡路的卡比兽。');
    if (!hasFlag(world, ['pokeflute', 'pokemonFlute'])) throw new Error('需要宝可梦笛子才能唤醒卡比兽。');
    const fieldEvent = `snorlax:${at}`;
    if (state.cleared[fieldEvent]) throw new Error('这只卡比兽已经处理过。');
    const spec = DATA.encounters[`${at}-snorlax`];
    startBattle(world, {type: 'wild', trainer: spec.name, title: '沉睡的卡比兽', theme: 'snorlax', fieldEvent, team: [{speciesId: spec.speciesId, level: spec.level}]});
  } else if (action === 'field-search-itemfinder') {
    const at = node(world);
    if (!hasKeyItem(world, 'itemfinder')) throw new Error('需要先取得探宝器。');
    if (id === 'leftovers') {
      if (!['route12', 'route16'].includes(at)) throw new Error('这里没有可用探宝器发现的剩饭。');
      const event = `snorlax:${at}`, claim = `leftovers:${at}`;
      if (!state.cleared[event] || state.claimed[claim]) throw new Error('需要先处理这里的卡比兽；此处的剩饭只能领取一次。');
      giveBagItem(world, 'leftovers'); state.claimed[claim] = true;
    } else if (id === 'soothebell') {
      needAt(world, 'pokemon-tower');
      if (!hasFlag(world, ['FujiRescued', 'MrFujiRescued']) || state.claimed.soothebell) throw new Error('需要先救出富士老人；安抚之铃只能领取一次。');
      giveBagItem(world, 'soothebell'); state.claimed.soothebell = true;
    } else if (id === 'machobrace') {
      needAt(world, 'viridian');
      if (!hasBadges(world, 8) || state.claimed.machobrace) throw new Error('集齐八枚徽章后才能找到力量头带；此物只能领取一次。');
      giveBagItem(world, 'machobrace'); state.claimed.machobrace = true;
    } else throw new Error('探宝器在此处没有发现对应的隐藏物品。');
  } else if (action === 'field-claim-oldamber') {
    needAt(world, 'pewter');
    if (!hasMove(world, 'cut') || !(world?.训练家?.徽章 || []).includes('蓝色徽章') || state.claimed.oldamber) throw new Error('需要居合斩和蓝色徽章；秘密琥珀只能领取一次。');
    addKeyItem(world, 'oldamber', '秘密琥珀'); state.claimed.oldamber = true;
  } else if (action === 'field-challenge-fossil-researcher') {
    needAt(world, 'mt-moon');
    if (state.cleared['fossil-researcher']) throw new Error('化石研究员已经被击败。');
    const spec = DATA.encounters['mt-moon-researcher'];
    startBattle(world, {trainer: spec.trainer, title: '月见山化石争夺战', theme: 'fossil', fieldEvent: 'fossil-researcher', team: spec.team});
  } else if (action === 'field-choose-fossil') {
    needAt(world, 'mt-moon');
    if (!state.cleared['fossil-researcher'] || state.fossils.chosen || !['helixfossil', 'domefossil'].includes(id)) throw new Error('击败化石研究员后只能选择一种化石。');
    const item = DATA.items[id]; addKeyItem(world, id, item.name); state.fossils.chosen = id;
  } else if (action === 'field-revive-fossil') {
    needAt(world, 'cinnabar');
    if (!fossilItems.has(id) || !hasKeyItem(world, id) || state.fossils.pending?.[id] || state.fossils.revived?.[id]) throw new Error('缺少对应化石，或这块化石已经送去复活。');
    if (['helixfossil', 'domefossil'].includes(id) && state.fossils.chosen !== id) throw new Error('只能复活自己选择的化石。');
    if (!removeKeyItem(world, id)) throw new Error('化石未能从背包移除，本次操作未完成。');
    const species = revived[id]; state.fossils.pending ||= {};
    state.fossils.pending[id] = {speciesId: species.speciesId, readyAt: storyNumber(world, storyTurn) + 1};
  } else if (action === 'field-claim-revived-fossil') {
    needAt(world, 'cinnabar');
    const pending = state.fossils.pending?.[id];
    if (!pending || !revived[id] || storyNumber(world, storyTurn) < pending.readyAt) throw new Error('化石尚未复活，请到下一故事轮后再来领取。');
    const party = Array.isArray(world.队伍) ? world.队伍 : (world.队伍 = []);
    const box = Array.isArray(world.电脑) ? world.电脑 : (world.电脑 = []);
    if (party.length >= 6 && box.length >= 420) throw new Error('队伍已满且电脑容量已达420，本次无法领取。');
    const mvu = require('./mvu.cjs'), species = revived[id];
    const mon = mvu.makeMon(species.speciesId, 5, `fossil-${id}-${pending.readyAt}`);
    mon.收服来源 = 'fossil'; mon.收服图鉴编号 = species.speciesId;
    (party.length < 6 ? party : box).push(mon);
    delete state.fossils.pending[id]; state.fossils.revived ||= {}; state.fossils.revived[id] = true;
  } else if (action === 'field-challenge-dojo') {
    needAt(world, 'saffron');
    if (state.cleared.dojo) throw new Error('格斗道场挑战已经完成。');
    if (!(world.队伍 || []).some(mon => Number(mon?.当前HP) > 0)) throw new Error('至少需要一只未倒下的宝可梦才能挑战。');
    const spec = DATA.encounters['saffron-dojo'];
    startBattle(world, {trainer: spec.trainer, title: '金黄市格斗道场', theme: 'dojo', fieldEvent: 'dojo', team: spec.team});
  } else if (action === 'field-choose-dojo-gift') {
    needAt(world, 'saffron');
    const speciesId = Number(payload?.id ?? payload?.speciesId ?? payload?.item);
    if (!state.cleared.dojo || state.giftChosen !== null || ![106, 107].includes(speciesId)) throw new Error('击败道场馆主后只能选择一只格斗宝可梦。');
    const party = Array.isArray(world.队伍) ? world.队伍 : (world.队伍 = []), box = Array.isArray(world.电脑) ? world.电脑 : (world.电脑 = []);
    if (party.length >= 6 && box.length >= 420) throw new Error('队伍已满且电脑容量已达420，本次无法领取。');
    const mvu = require('./mvu.cjs'), mon = mvu.makeMon(speciesId, 25, `dojo-gift-${speciesId}-${world?.地图?.轮次 || 0}`);
    mon.收服来源 = 'dojo-gift'; mon.收服图鉴编号 = speciesId;
    (party.length < 6 ? party : box).push(mon); state.giftChosen = speciesId;
  } else throw new Error('未知场地服务操作。');
  return next;
}

function onBattleEnd(value) {
  const world = worldOf(value);
  if (!isRecord(world)) return world;
  ensure(world);
  const result = world?.战斗?.结果, fieldEvent = world?.遭遇?.fieldEvent;
  if (!['win', 'caught'].includes(result) || typeof fieldEvent !== 'string' || !fieldEvent) return world;
  world.剧情.场地服务.cleared[fieldEvent] = true;
  return world;
}

module.exports = {DATA, ensure, validate, options: serviceOptions, apply, onBattleEnd, caughtSpeciesCount};
