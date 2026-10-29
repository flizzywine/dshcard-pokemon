'use strict';

// Pure field-move and Kanto travel gates. This module deliberately does not
// mutate or repair MVU state; callers remain responsible for committing travel.
const map = require('./public/data/map.json');
const BY_ID = new Map(map.map(node => [node.id, node]));
const BADGE_FOR_MOVE = Object.freeze({
  flash: '岩石徽章',
  cut: '蓝色徽章',
  fly: '橙色徽章',
  strength: '彩虹徽章',
  surf: '粉红徽章',
});
const FIELD_MOVES = Object.freeze([
  {id: 'cut', name: '居合斩', optional: false, contextual: true},
  {id: 'fly', name: '飞翔', optional: false, contextual: true},
  {id: 'surf', name: '冲浪', optional: false, contextual: true},
  {id: 'strength', name: '怪力', optional: false, contextual: true},
  {id: 'flash', name: '闪光', optional: true, contextual: true},
]);
const WATER_NODES = new Set(['route19', 'route20', 'route21', 'seafoam', 'cinnabar']);
const BIKE_NODES = new Set(['route16', 'route17', 'route18']);
const FLASH_NODES = new Set(['rock-tunnel', 'seafoam']);

function asWorld(value) { return value?.stat_data?.宝可梦 || value; }
function visitedNodes(world) {
  const result = new Set(Array.isArray(world?.委托?.探访地点) ? world.委托.探访地点.filter(id => BY_ID.has(id)) : []);
  for (const [id, visits] of Object.entries(world?.委托?.探访次数 || {})) {
    if (BY_ID.has(id) && Number.isFinite(visits) && visits > 0) result.add(id);
  }
  const current = world?.地图?.节点;
  if (BY_ID.has(current)) result.add(current);
  return result;
}
function partyMoveOwners(world, moveId) {
  return (Array.isArray(world?.队伍) ? world.队伍 : []).filter(mon =>
    Array.isArray(mon?.招式) && mon.招式.some(move => (typeof move === 'string' ? move : move?.id) === moveId));
}
function hasBadge(world, moveId) { return (world?.训练家?.徽章 || []).includes(BADGE_FOR_MOVE[moveId]); }
function hasBicycle(world) {
  return world?.剧情?.关都事件?.标记?.bicycle === true ||
    (Array.isArray(world?.背包?.关键物品) && world.背包.关键物品.some(id => ['bicycle', 'bike'].includes(String(id).toLowerCase()))) ||
    world?.背包?.关键物品?.bicycle === true || world?.背包?.关键物品?.bike === true;
}
function baseResult(allowed, method, reason, requires = {}) { return {allowed, method, reason, requires}; }
function isRecordedLandwardReturn(from, to, visited) {
  const landGoals = new Set([...visited].filter(id => id !== from && BY_ID.get(id)?.kind === 'town'));
  if (!landGoals.size) return false;
  const queue = [[from, null]], seen = new Set([from]);
  while (queue.length) {
    const [at, firstStep] = queue.shift();
    if (landGoals.has(at)) {
      if (firstStep === to) return true;
      continue;
    }
    for (const next of BY_ID.get(at)?.links || []) {
      if (seen.has(next)) continue;
      if (!WATER_NODES.has(next) && !landGoals.has(next)) continue;
      seen.add(next);
      queue.push([next, firstStep || next]);
    }
  }
  return false;
}
function validateTravel(input, toNode) {
  const world = asWorld(input), from = world?.地图?.节点;
  const target = BY_ID.get(toNode), source = BY_ID.get(from);
  if (!source) return baseResult(false, '', '当前地点不在关都地图中。');
  if (!target) return baseResult(false, '', '目标地点不在关都地图中。');
  if (!source.links?.includes(target.id)) return baseResult(false, '', '只能前往地图上相邻的地点。');
  if(target.id==='safari')return baseResult(false,'safari','请从浅红市的狩猎地带入口支付500元入园。',{facility:'safari-zone'});
  if ((target.requiresBadges || 0) > (world?.训练家?.徽章?.length || 0)) {
    return baseResult(false, 'walk', `前往${target.name}至少需要${target.requiresBadges}枚徽章。`, {badges: target.requiresBadges});
  }

  const visited = visitedNodes(world);
  if(target.id==='saffron'&&!visited.has('saffron')&&world?.剧情?.关都事件?.标记?.saffronGateOpen!==true){
    const keys=world?.背包?.关键物品,tea=Array.isArray(keys)?keys.some(item=>String(typeof item==='string'?item:item?.id||'').toLowerCase()==='tea'):keys?.tea;
    if(!tea)return baseResult(false,'walk','金黄市守卫尚未放行；可以先从地下通路前往玉虹公馆，取得热茶。',{keyItem:'tea'});
  }
  // A persisted adjacent destination is a safe legacy return edge. A traveler
  // already placed on a water route can also always leave it for a town.
  const enteringWaterCorridor = WATER_NODES.has(target.id) || WATER_NODES.has(from);
  if (enteringWaterCorridor) {
    const legacyReturn = visited.has(target.id) || (WATER_NODES.has(from) && target.kind === 'town') ||
      (from === 'cinnabar' && visited.has('cinnabar')) || ((WATER_NODES.has(from)||from==='cinnabar')&&isRecordedLandwardReturn(from, target.id, visited));
    if (!legacyReturn) {
      const missing = [];
      if (!partyMoveOwners(world, 'surf').length) missing.push('同行宝可梦需要学会冲浪');
      if (!hasBadge(world, 'surf')) missing.push(`需要${BADGE_FOR_MOVE.surf}`);
      if (missing.length) return {...baseResult(false, 'surf', `${missing.join('，')}。`, {move: 'surf', badge: BADGE_FOR_MOVE.surf}), legacyReturn: false};
    }
    return {...baseResult(true, 'surf', legacyReturn ? '沿已记录的水路返回。' : '可以沿水路前进。', legacyReturn ? {} : {move: 'surf', badge: BADGE_FOR_MOVE.surf}), legacyReturn};
  }

  const sourceOnBikeRoad = BIKE_NODES.has(from), targetOnBikeRoad = BIKE_NODES.has(target.id);
  if (targetOnBikeRoad && !sourceOnBikeRoad && !hasBicycle(world)) {
    return baseResult(false, 'bike', '进入16—18号自行车道需要先取得自行车。', {keyItem: 'bicycle'});
  }
  if (targetOnBikeRoad || sourceOnBikeRoad) return baseResult(true, 'bike', '自行车道可以通行。', hasBicycle(world) ? {} : {keyItem: 'bicycle'});
  return baseResult(true, 'walk', '道路相连，可以前往。');
}

function travelInfo(input, toNode) {
  const world = asWorld(input), result = validateTravel(world, toNode);
  const from = BY_ID.get(world?.地图?.节点), to = BY_ID.get(toNode);
  return {...result, from: from ? {id: from.id, name: from.name} : null, to: to ? {id: to.id, name: to.name} : null};
}

function validateFly(input, toNode) {
  const world = asWorld(input), from = BY_ID.get(world?.地图?.节点), target = BY_ID.get(toNode);
  if (!from) return baseResult(false, 'fly', '当前地点不在关都地图中。');
  if (!target || target.kind !== 'town') return baseResult(false, 'fly', '飞翔只能前往曾经到访过的城镇。');
  if (target.id === from.id) return baseResult(false, 'fly', '已经在这个城镇。');
  if (from.kind === 'cave' || from.id === 'safari') return baseResult(false, 'fly', '当前地点无法使用飞翔。');
  if (!visitedNodes(world).has(target.id)) return baseResult(false, 'fly', `还没有到访过${target.name}。`);
  if (!partyMoveOwners(world, 'fly').length) return baseResult(false, 'fly', '同行宝可梦需要学会飞翔。', {move: 'fly'});
  if (!hasBadge(world, 'fly')) return baseResult(false, 'fly', `需要${BADGE_FOR_MOVE.fly}才能使用飞翔。`, {move: 'fly', badge: BADGE_FOR_MOVE.fly});
  return baseResult(true, 'fly', `可以飞往曾到访的${target.name}。`);
}

function fieldActions(input) {
  const world = asWorld(input), current = BY_ID.get(world?.地图?.节点), visited = visitedNodes(world);
  return FIELD_MOVES.map(def => {
    const owners = partyMoveOwners(world, def.id).map(mon => ({uid: mon.uid, name: mon.昵称 || mon.名字 || `图鉴${mon.图鉴编号}`}));
    const action = {id: def.id, name: def.name, optional: def.optional, contextual: def.contextual, partyMembers: owners, enabled: false, reason: '', requires: {move: def.id, badge: BADGE_FOR_MOVE[def.id]}};
    if (!owners.length) { action.reason = `队伍中没有学会${def.name}的宝可梦。`; return action; }
    if (!hasBadge(world, def.id)) { action.reason = `需要${BADGE_FOR_MOVE[def.id]}才能在野外使用${def.name}。`; return action; }
    if (def.id === 'fly') {
      action.destinations = map.filter(node => node.kind === 'town' && node.id !== current?.id && visited.has(node.id)).map(node => ({id: node.id, name: node.name}));
      action.enabled = Boolean(action.destinations.length) && current?.kind !== 'cave' && current?.id !== 'safari';
      action.reason = action.enabled ? '可飞往已到访城镇。' : '没有可用的已到访城镇，或当前地点不能使用飞翔。';
      return action;
    }
    action.enabled = true;
    action.reason = def.id === 'flash' ? (FLASH_NODES.has(current?.id) ? '可选照亮黑暗地点；探索不会因未使用闪光而受阻。' : '可选照明，不影响地图通行。') : `${def.name}需要地图上的对应障碍或互动点。`;
    if (def.id === 'flash') action.lighting = FLASH_NODES.has(current?.id);
    return action;
  });
}

module.exports = {validateTravel, travelInfo, fieldActions, validateFly, FIELD_MOVES, BADGE_FOR_MOVE, WATER_NODES, BIKE_NODES};
