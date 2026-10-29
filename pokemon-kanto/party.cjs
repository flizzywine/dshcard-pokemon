'use strict';

// Reversible party operations over the authoritative MVU. Battle state is
// deliberately read-only here: the battle engine owns active HP and PP.
const {Dex, catalog} = require('./engine.cjs');
const mvu = require('./mvu.cjs');
const growth = require('./growth-mechanics.cjs');

const HOLDABLE_SET = new Set(require('./public/data/items.json').filter(item => item.category === 'held').map(item => item.id));
const EVOLUTION_STONES = new Map([
  ['firestone', 'Fire Stone'],
  ['waterstone', 'Water Stone'],
  ['thunderstone', 'Thunder Stone'],
  ['leafstone', 'Leaf Stone'],
  ['moonstone', 'Moon Stone'],
]);
const clone = value => structuredClone(value);

function worldOf(variables) {
  const world = variables?.stat_data?.宝可梦;
  if (!world || typeof world !== 'object') throw Error('MVU缺少 stat_data.宝可梦。');
  return world;
}
function assertOutsideBattle(world) {
  if (world.战斗?.状态 === 'active') throw Error('战斗中不能改变队伍配置。');
}
function findMon(world, uid) {
  const mon = [...(Array.isArray(world.队伍) ? world.队伍 : []), ...(Array.isArray(world.电脑) ? world.电脑 : [])]
    .find(entry => entry.uid === uid);
  if (!mon) throw Error('队伍和电脑中都没有这只宝可梦。');
  return mon;
}
function inventory(world, itemId) {
  const items = world.背包?.物品;
  if (!items || !Object.hasOwn(items, itemId)) throw Error(`背包目录中没有${itemId}。`);
  return items;
}
function assertItemExists(itemId) {
  if (['expshare','smokeball','luckyegg','amuletcoin','nugget','tinymushroom','bigmushroom','soothebell','everstone'].includes(itemId)) return;
  const item = Dex.items.get(itemId);
  if (!item.exists || item.gen > 3) throw Error('只支持第三世代及之前存在的物品。');
}
function checked(variables) {
  mvu.validateMvu(variables);
  return variables;
}
function monAndWorld(variables, uid) {
  const next = clone(variables);
  const world = worldOf(next);
  assertOutsideBattle(world);
  return {next, world, mon: findMon(world, uid)};
}

// Slot is the visible 1-based position in the move list.
function forgetMove(variables, uid, slot, allowHm = false) {
  const {next, world, mon} = monAndWorld(variables, uid);
  if (!Number.isInteger(slot) || slot < 1 || slot > mon.招式.length) throw Error('招式位置须为队伍界面显示的1-based编号。');
  if (mon.招式.length <= 1) throw Error('宝可梦至少要保留一个招式。');
  if (growth.isHmMove(mon.招式[slot - 1].id) && !allowHm) throw Error('秘传招式需要在浅红市找遗忘爷爷删除。');
  mon.招式.splice(slot - 1, 1);
  return checked(next);
}

function forgetHmMove(variables, uid, slot) {
  const world = worldOf(variables);
  if (world.地图?.节点 !== 'fuchsia') throw Error('只能在浅红市找遗忘爷爷删除秘传招式。');
  return forgetMove(variables, uid, slot, true);
}

function holdItem(variables, uid, itemId) {
  const {next, world, mon} = monAndWorld(variables, uid);
  if (!HOLDABLE_SET.has(itemId)) throw Error('这件物品不能作为宝可梦的携带道具。');
  assertItemExists(itemId);
  const bag = inventory(world, itemId);
  const previous = mon.携带道具 || '';
  if (previous === itemId) return next;
  if (bag[itemId] < 1) throw Error('背包中没有可携带的这件物品。');
  if (previous) {
    if (!HOLDABLE_SET.has(previous) || !Object.hasOwn(bag, previous)) throw Error('当前携带道具无法安全放回背包。');
    if (bag[previous] >= 999) throw Error('背包中的旧携带道具已达到数量上限。');
  }
  bag[itemId] -= 1;
  if (previous) bag[previous] += 1;
  mon.携带道具 = itemId;
  return checked(next);
}

function takeHeldItem(variables, uid) {
  const {next, world, mon} = monAndWorld(variables, uid);
  const itemId = mon.携带道具 || '';
  if (mon.持有邮件) {
    if (!itemId || mon.持有邮件.itemId !== itemId) throw Error('邮件与携带道具不匹配，无法安全取下。');
    if (world.邮件收纳 !== undefined && !Array.isArray(world.邮件收纳)) throw Error('邮件收纳格式无效，无法安全取下。');
    (world.邮件收纳 ||= []).push(clone(mon.持有邮件));
    delete mon.持有邮件;
    mon.携带道具 = '';
    return checked(next);
  }
  if (!itemId) throw Error('这只宝可梦没有携带道具。');
  if (!HOLDABLE_SET.has(itemId)) throw Error('当前携带道具无法安全放回背包。');
  const bag = inventory(world, itemId);
  if (bag[itemId] >= 999) throw Error('背包中的物品已达到数量上限。');
  bag[itemId] += 1;
  mon.携带道具 = '';
  return checked(next);
}

function setLead(variables, uid) {
  const {next, world, mon} = monAndWorld(variables, uid);
  const index = world.队伍.findIndex(entry => entry.uid === uid);
  if (index < 0) throw Error('请先把这只宝可梦从电脑取回队伍。');
  if (mon.当前HP <= 0) throw Error('首发伙伴需要先恢复体力。');
  world.队伍.unshift(world.队伍.splice(index, 1)[0]);
  return checked(next);
}

function releasePokemon(variables, uid, confirmed) {
  if (confirmed !== true) throw Error('放生不可撤销，请先明确确认。');
  const {next, world, mon} = monAndWorld(variables, uid);
  if (mon.isEgg || mon.是蛋 || mon.蛋 === true) throw Error('宝可梦蛋不能放生。');
  if (mon.携带道具 || mon.持有邮件) throw Error('请先取下携带道具或邮件，再放生。');
  if (world.经典设施?.daycare?.parents?.includes(uid)) throw Error('请先从培育屋领回这只宝可梦。');
  const index = world.队伍.findIndex(entry => entry.uid === uid);
  if (index >= 0) {
    if (!world.队伍.some(entry => entry.uid !== uid && !entry.isEgg && !entry.是蛋 && entry.蛋 !== true && entry.当前HP > 0)) {
      throw Error('队伍必须保留至少一只能够战斗的宝可梦。');
    }
    world.队伍.splice(index, 1);
  } else {
    world.电脑.splice(world.电脑.findIndex(entry => entry.uid === uid), 1);
  }
  if (world.羁绊?.伙伴) delete world.羁绊.伙伴[uid];
  if (Array.isArray(world.羁绊?.短期线索)) world.羁绊.短期线索 = world.羁绊.短期线索.filter(clue => clue.UID !== uid);
  if (world.外观?.已装备?.伙伴) delete world.外观.已装备.伙伴[uid];
  if (world.外观?.参数) delete world.外观.参数[uid];
  return checked(next);
}

function resolveEvolution(variables, uid, decisionId, accept) {
  const {next,world,mon}=monAndWorld(variables,uid),pending=mon.待进化?.[0];
  if(!pending||pending.id!==decisionId)throw Error('进化事项已变化，请重新读取。');
  if(accept){
    if(mon.携带道具==='everstone')throw Error('携带不变之石时不会进化，请先取下。');
    const target=growth.evolutionAtLevel(mon.图鉴编号,mon.等级,mon.亲密度||0);
    if(pending.from!==mon.图鉴编号||target?.num!==pending.to)throw Error('当前不满足这次进化条件。');
    const source=catalog.species.find(s=>s.id===mon.图鉴编号),info=catalog.species.find(s=>s.id===pending.to);
    if(!source||!info)throw Error('进化结果不属于关都图鉴。');
    mvu.updateDexStats(world);
    const oldHp=mon.当前HP,oldMax=mon.能力值.hp,slot=Math.max(0,source.abilities.indexOf(mon.特性));
    mon.图鉴编号=info.id;if(mon.昵称===source.name)mon.昵称=info.name;
    mon.特性=info.abilities[Math.min(slot,info.abilities.length-1)];
    mon.能力值=mvu.stats(mon);mon.当前HP=oldHp===0?0:Math.max(0,Math.min(mon.能力值.hp,oldHp+mon.能力值.hp-oldMax));
    mvu.updateDexStats(world);
  }
  mon.待进化=[];
  return checked(next);
}
function confirmEvolution(variables,uid,decisionId){return resolveEvolution(variables,uid,decisionId,true);}
function cancelEvolution(variables,uid,decisionId){return resolveEvolution(variables,uid,decisionId,false);}

function evolvePokemon(variables, uid, itemId) {
  const {next, world, mon} = monAndWorld(variables, uid);
  const sourceInfo = catalog.species.find(entry => entry.id === mon.图鉴编号);
  const source = sourceInfo && Dex.species.get(sourceInfo.key);
  if (!source?.exists) throw Error('无法读取这只宝可梦的进化资料。');
  const evolutions = (source.evos || []).map(id => Dex.species.get(id)).filter(species => species.exists && species.num >= 1 && species.num <= 151);
  const stoneCandidates = evolutions.filter(species => species.evoType === 'useItem' && species.evoItem);

  if (itemId === undefined || itemId === null || itemId === '') {
    if (evolutions.some(species => species.evoType === 'trade')) throw Error('这种进化需要交换；单人旅程不能凭空完成交换进化。');
    if (evolutions.some(species => species.evoLevel && !species.evoType)) throw Error('这种进化由战斗经验自动触发。');
    throw Error('这种宝可梦当前没有可用的关都进化方式。');
  }
  if(mon.携带道具==='everstone')throw Error('携带不变之石时不会进化，请先取下。');
  const stoneName = EVOLUTION_STONES.get(itemId);
  if (!stoneName) throw Error('这里只支持火之石、水之石、雷之石、叶之石和月之石进化。');
  const target = stoneCandidates.find(species => species.evoItem === stoneName);
  if (!target) throw Error(`${sourceInfo.name}不能使用${stoneName}进化。`);
  const bag = inventory(world, itemId);
  if (bag[itemId] < 1) throw Error(`背包中没有${stoneName}。`);

  const targetInfo = catalog.species.find(entry => entry.id === target.num);
  if (!targetInfo) throw Error('进化结果不属于初版关都图鉴。');
  const oldMaxHp = mon.能力值.hp;
  const oldHp = mon.当前HP;
  const oldSpeciesName = sourceInfo.name;
  const abilitySlot = Math.max(0, sourceInfo.abilities.indexOf(mon.特性));

  mvu.updateDexStats(world);
  bag[itemId] -= 1;
  mon.图鉴编号 = target.num;
  if(mon.待进化)mon.待进化=[];
  if (mon.昵称 === oldSpeciesName || mon.昵称 === source.name) mon.昵称 = targetInfo.name;
  mon.特性 = targetInfo.abilities[Math.min(abilitySlot, targetInfo.abilities.length - 1)];
  const retained = mon.招式.filter(move => growth.canKnowMove(target.num, move.id));
  if (!retained.length) {
    const first = growth.levelMoves(target.num).filter(entry => entry.level <= mon.等级).at(-1)?.move;
    if (!first) throw Error('进化结果没有可用招式，已取消进化。');
    retained.push({id: first, PP: catalog.moves[first].pp, PP上限: catalog.moves[first].pp});
  }
  mon.招式 = retained.slice(0, 4);
  mon.能力值 = mvu.stats(mon);
  mon.当前HP = oldHp === 0 ? 0 : Math.max(0, Math.min(mon.能力值.hp, oldHp + mon.能力值.hp - oldMaxHp));
  mvu.updateDexStats(world);
  return checked(next);
}

function manageParty(variables, action, args = {}) {
  switch (action) {
    case 'forgetMove': return forgetMove(variables, args.uid, args.slot);
    case 'forgetHmMove': return forgetHmMove(variables, args.uid, args.slot);
    case 'holdItem': return holdItem(variables, args.uid, args.itemId);
    case 'takeHeldItem': return takeHeldItem(variables, args.uid);
    case 'evolvePokemon': return evolvePokemon(variables, args.uid, args.itemId);
    case 'confirmEvolution': return confirmEvolution(variables,args.uid,args.decisionId);
    case 'cancelEvolution': return cancelEvolution(variables,args.uid,args.decisionId);
    case 'setLead': return setLead(variables, args.uid);
    case 'releasePokemon': return releasePokemon(variables, args.uid, args.confirmed);
    default: throw Error('未知队伍管理操作。');
  }
}

module.exports = {manageParty, forgetMove, forgetHmMove, holdItem, takeHeldItem, evolvePokemon, confirmEvolution, cancelEvolution, setLead, releasePokemon, HOLDABLE_SET};
