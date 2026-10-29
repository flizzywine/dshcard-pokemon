'use strict';

const fs = require('node:fs');
const path = require('node:path');
const companionship = require('./companionship.cjs');
const npcQuests = require('./npc-quests.cjs');
const specialEncounters = require('./special-encounters.cjs');
const hellChallenges = require('./hell-challenges.cjs');
const campaign=require('./story-campaign.cjs');
const storyEvents=require('./kanto-story-events.cjs');
const fieldSkills=require('./field-skills.cjs');
const wildEncounters=require('./wild-encounter-adapter.cjs');
const machineAcquisitions = require('./machine-acquisitions.cjs');
const cityFacilities=require('./city-facilities.cjs');
const fieldServices=require('./kanto-field-services.cjs');
const DATA = path.join(__dirname, 'public', 'data');
const read = file => JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8').replace(/^\uFEFF/, ''));
const locations = read('map.json');
const trainers = read('trainers.json');
const backgrounds = read('backgrounds.json');
const locationById = new Map(locations.map(item => [item.id, item]));
const backgroundFor = node => backgrounds.find(item => item.locations?.includes(node));
const trainerById = new Map(trainers.map(item => [item.id, item]));
const GYMS = [
  { id: 'brock', name: '小刚', badge: '岩石徽章' }, { id: 'misty', name: '小霞', badge: '蓝色徽章' },
  { id: 'lt_surge', name: '马志士', badge: '橙色徽章' }, { id: 'erika', name: '莉佳', badge: '彩虹徽章' },
  { id: 'koga', name: '阿桔', badge: '粉红徽章' }, { id: 'sabrina', name: '娜姿', badge: '金色徽章' },
  { id: 'blaine', name: '夏伯', badge: '深红徽章' }, { id: 'giovanni', name: '坂木', badge: '绿色徽章' },
];
const LEGENDARY_TRACKS = Object.freeze({
  seafoam: { key: 'articuno', speciesId: 144, name: '急冻鸟', level: 50, requiresLeague: 0 },
  'power-plant': { key: 'zapdos', speciesId: 145, name: '闪电鸟', level: 50, requiresLeague: 0 },
  'cerulean-cave': { key: 'mewtwo', speciesId: 150, name: '超梦', level: 70, requiresLeague: 5 },
});
// Short, location-specific lines use only portraits shipped in trainers.json.
// The linked places and badge hints below match the local Kanto map data.
const TOWN_DIALOGUES = {
  pallet: { person: 'scientist', lines: [
    '大木博士的研究室就在镇上。沿1号道路向北可以抵达常青市。',
    '想去枯叶市的话，可以从南边的21号水道出发；先确认伙伴状态。',
    '关都图鉴还等着新的记录呢。常青森林在尼比市附近，不要走错方向。',
  ] },
  viridian: { person: 'gentleman', lines: [
    '向北经过2号道路和常青森林就是尼比市，小刚在那里守着第一枚徽章。',
    '西边22号道路通往石英高原，不过要先集齐八枚徽章。',
    '常青市道馆排在最后。先从尼比、华蓝一路挑战上来吧。',
  ] },
  pewter: { person: 'hiker', lines: [
    '小刚的岩石道馆就在尼比市。往东走3号道路可以前往月见山。',
    '穿过北边的常青森林就能回到常青市，记得检查队伍和道具。',
    '月见山出口接着4号道路，往东便是华蓝市和小霞的道馆。',
  ] },
  cerulean: { person: 'lass', lines: [
    '小霞的道馆就在城里。向北沿24号道路还能遇见更多训练家。',
    '西边4号道路连着月见山，南边5号道路通往金黄市。',
    '从华蓝往东走9号道路会通向岩山隧道一带，准备好照明和补给。',
  ] },
  vermilion: { person: 'sailor', lines: [
    '枯叶港的水道连向19号水道。马志士的道馆就在城里。',
    '北边6号道路通往金黄市，东边11号道路还有不少训练家。',
    '地鼠洞连接枯叶市与2号道路附近，是返回常青森林一带的近路。',
  ] },
  lavender: { person: 'channeler', lines: [
    '宝可梦塔就在紫苑镇。向西经8号道路可以到玉虹市。',
    '沿12号道路向南可抵达浅红市，沿10号道路则通向岩山隧道。',
    '要去金黄市可以走西边8号道路；那里有娜姿的超能力道馆。',
  ] },
  celadon: { person: 'beauty', lines: [
    '莉佳的草系道馆就在玉虹市。向东走7号道路可到金黄市。',
    '西北的16号道路通向自行车道，之后可以接上浅红市方向。',
    '玉虹百货有旅行用品。金黄市在东边，华蓝与紫苑也能沿道路相连。',
  ] },
  fuchsia: { person: 'swimmer_f', lines: [
    '浅红市南侧连接19号水道，向西的18号道路接着自行车道。',
    '狩猎地带就在城边；阿桔的毒系道馆也在浅红市。',
    '沿15号道路向东可回到玉虹与紫苑方向，旅途中注意伙伴状态。',
  ] },
  saffron: { person: 'psychic_f', lines: [
    '金黄市连接5、6、7、8号道路，是关都交通的中心。',
    '娜姿的道馆就在城里。挑战前要先取得前面的徽章。',
    '向东经6号道路可到枯叶市，向西经7号道路可到玉虹市。',
  ] },
  cinnabar: { person: 'scientist', lines: [
    '红莲岛由20号水道和21号水道连接，海上路程不短。',
    '夏伯的道馆就在岛上。先从浅红一侧的19号水道出发，再沿海到双子岛。',
    '21号水道通往真新镇附近；回到关都大陆后记得整理队伍。',
  ] },
  indigo: { person: 'cool_trainer_m', lines: [
    '冠军之路从石英高原向东延伸，集齐八枚徽章后再进入。',
    '联盟会连续进行四天王与冠军挑战，建议先在宝可梦中心整备。',
    '从这里回到常青市要沿22号道路前进，尚未集齐徽章时入口会关闭。',
  ] },
};
const clone = value => structuredClone(value);
const option = (id, label, enabled = true, reason = '', payload = {}) => ({ id, label, enabled, ...(reason ? { reason } : {}), ...(Object.keys(payload).length ? { payload } : {}) });

function trainerForEncounter(world) {
  const encounter = world?.遭遇;
  if (world?.地图?.节点 === 'pallet' && !world?.剧情?.初始御三家已选) return trainerById.get('oak');
  if (encounter?.类型 === 'gym' && Number.isInteger(encounter.道馆)) return trainerById.get(GYMS[encounter.道馆]?.id) || null;
  if (encounter?.训练家 === '小茂') return trainerById.get(world?.剧情?.联盟进度 ? 'rival_late' : 'rival_early');
  if (encounter?.训练家) {
    const name = String(encounter.训练家);
    return trainers.find(entry => [entry.name, entry.role, ...(entry.aliases || [])].some(alias => alias && (name.includes(alias) || alias.includes(name)))) || null;
  }
  if (locationById.get(world?.地图?.节点)?.kind === 'town') return trainerById.get('nurse_joy');
  return null;
}

function canTravel(world) {
  return world?.战斗?.状态 === 'finished';
}
function gymOption(world, node) {
  if (!Number.isInteger(node?.gym)) return null;
  const gym = GYMS[node.gym];
  if (!gym) return null;
  if (world?.训练家?.徽章?.includes(gym.badge)) return option('challenge-gym', `已获得${gym.badge}`, false, '这座道馆的徽章已取得。');
  if ((world?.训练家?.徽章?.length || 0) !== node.gym) {
    const missing = GYMS[(world?.训练家?.徽章?.length || 0)]?.badge || '前置徽章';
    return option('challenge-gym', `挑战${gym.name}`, false, `按关都道馆顺序，需要先取得${missing}。`);
  }
  const battleReady = world?.战斗?.状态 === 'finished';
  const teamReady = (world?.队伍 || []).some(mon => mon.当前HP > 0);
  const ready = battleReady && teamReady;
  const reason = !battleReady ? '请先完成当前遭遇。' : !teamReady ? '队伍全员倒下，请先在宝可梦中心恢复。' : '';
  if(world.设置?.对手难度==='hell'&&!hellChallenges.cleared(world,['brock','misty','lt_surge','erika','koga','sabrina','blaine','giovanni'][node.gym]))return option('challenge-gym',`挑战${gym.name}`,false,'先在其他难度战胜一次，再解锁地狱挑战。',{gym:node.gym});
  return option('challenge-gym', `挑战${gym.name}`, ready, reason, { gym: node.gym });
}
function legendaryOption(world, node) {
  const special = LEGENDARY_TRACKS[node?.id];
  if (!special) return null;
  const badges = world?.训练家?.徽章?.length || 0;
  const triggered = Array.isArray(world?.剧情?.特殊遭遇已触发) && world.剧情.特殊遭遇已触发.includes(special.key);
  const battleReady = world?.战斗?.状态 === 'finished';
  const teamReady = (world?.队伍 || []).some(mon => mon.当前HP > 0);
  let reason = '';
  if (triggered) reason = '这次特殊遭遇已经触发过。';
  else if (badges < 8) reason = '取得八枚徽章后，才能调查传说宝可梦的踪迹。';
  else if ((world?.剧情?.联盟进度 || 0) < special.requiresLeague) reason = '战胜关都冠军后，华蓝洞窟才会开放这条线索。';
  else if (!battleReady) reason = '请先完成当前遭遇。';
  else if (!teamReady) reason = '队伍全员倒下，请先前往宝可梦中心恢复。';
  return option('legendary', triggered ? `已调查${special.name}踪迹` : `调查${special.name}的踪迹`, !reason, reason,
    { id: special.speciesId, key: special.key });
}

function buildTheater(world,{storyTurn}={}) {
  if (!world || typeof world !== 'object') throw new TypeError('需要关都世界状态。');
  const nodeId = String(world.地图?.节点 || 'pallet');
  const node = locationById.get(nodeId) || locationById.get('pallet');
  const story = world.剧情 || {};
  const status = world.战斗?.状态 || 'finished';
  const encounter = world.遭遇;
  const opening = nodeId === 'pallet' && story.初始御三家已选 !== true;
  const rivalIntro = nodeId === 'pallet' && story.初始御三家已选 === true && world.战斗?.轮次 === 1;
  const savedScene = story.剧场;
  const savedSceneCurrent = savedScene && savedScene.地点 === nodeId && savedScene.轮次 === world.地图?.轮次 && status !== 'active';
  const savedPerson = savedSceneCurrent && savedScene.对白 && typeof savedScene.角色 === 'string' ? trainerById.get(savedScene.角色) : null;
  const npc = savedPerson || trainerForEncounter(world);
  const insideGym=encounter?.类型==='gym'&&savedSceneCurrent&&savedScene.最近动作==='challenge-gym';
  const background = (insideGym?backgrounds.find(item=>item.sceneTags?.includes(`gym:${nodeId}`)):null) || (nodeId === 'pallet' ? backgrounds.find(item=>item.id===(opening || rivalIntro && status!=='finished' ? 'oaks-lab' : 'pallet-town')) : backgroundFor(nodeId)) || null;
  const party = Array.isArray(world.队伍) ? world.队伍 : [];
  const lead = party.find(mon => mon.当前HP > 0) || party[0];
  let dialogue;
  if (opening) dialogue = '大木博士：从妙蛙种子、小火龙和杰尼龟中选择一位伙伴吧。';
  else if (rivalIntro && status === 'pending') dialogue = '小茂：选好伙伴了？那就来一场对战吧！';
  else if (status === 'pending' && encounter?.训练家) dialogue = `${encounter.训练家}正在等待本轮对战。`;
  else if (status === 'active') dialogue = `正在与${encounter?.训练家 || '对手'}进行本轮战斗。`;
  else if (status === 'finished' && world.战斗?.摘要) dialogue = world.战斗.摘要;
  else dialogue = `${node.name}。可以查看城镇服务或前往相邻地点。`;
  if (savedSceneCurrent && savedScene.对白) dialogue = String(savedScene.对白);

  const options = [];
  if(status==='finished'&&!opening){options.push(...cityFacilities.options(world),...fieldServices.options(world,{storyTurn}));}
  if (status !== 'active') for (const acquisition of machineAcquisitions.available(world)) {
    options.push(option('claim-machine', acquisition.label, true, '', {item: acquisition.id}));
  }
  if(!opening)options.push(option('trainer-battle','挑战训练家 · 直接对战',status==='finished'&&party.some(mon=>mon.当前HP>0),'请先完成当前战斗并恢复队伍。'));
  if (opening) {
    for (const [id, name] of [[1, '妙蛙种子'], [4, '小火龙'], [7, '杰尼龟']]) options.push(option('starter', `选择${name}`, true, '', { id }));
  }
  if (status === 'pending') {
    const teamReady = party.some(mon => mon.当前HP > 0);
    options.push(option('start-battle', '进入本轮战斗', teamReady&&!opening, opening?'请先选择初始伙伴。':teamReady ? '' : '队伍全员倒下，请先前往宝可梦中心恢复。'));
    if(encounter?.类型==='wild')options.push(option('avoid-encounter','悄悄离开草丛',true));
  }
  if (node.kind === 'town') {
    const outsideBattle = status !== 'active';
    options.push(option('heal', '宝可梦中心恢复', outsideBattle, outsideBattle ? '' : '战斗中不能使用中心服务。'));
    options.push(option('buy', '商店购买伤药', outsideBattle, outsideBattle ? '' : '战斗中不能购物。', { item: 'potion', count: 1 }));
    options.push(option('buy', '商店购买精灵球', outsideBattle, outsideBattle ? '' : '战斗中不能购物。', { item: 'pokeball', count: 1 }));
    const gym = gymOption(world, node); if (gym) options.push(gym);
    const talkEnabled = status !== 'active';
    options.push(option('talk', '与市民交谈', talkEnabled, talkEnabled ? '' : '战斗中无法交谈。'));
  }
  if (node.kind === 'route' || node.kind === 'cave') {
    const battleReady = status === 'finished', teamReady = party.some(mon => mon.当前HP > 0), ready = battleReady && teamReady;
    const reason = !battleReady ? '请先完成当前遭遇，不能覆盖已有战斗。' : !teamReady ? '队伍全员倒下，请先前往宝可梦中心恢复。' : '';
    options.push(option('explore', '寻找野生宝可梦 · 直接对战', ready, reason));
    if(wildEncounters.habitat(world,node.id,'water'))options.push(option('explore','在水面寻找野生宝可梦',ready&&fieldSkills.fieldActions(world).some(action=>action.id==='surf'&&action.enabled),reason||'同行伙伴须学会冲浪并获得粉红徽章。',{method:'water'}));
    const special = legendaryOption(world, node); if (special) options.push(special);
  }
  for (const link of node.links || []) {
    const destination = locationById.get(link);
    if (!destination) continue;
    const badgeGate = (world.训练家?.徽章?.length || 0) >= (destination.requiresBadges || 0);
    const access=fieldSkills.validateTravel(world,destination.id);
    const enabled = canTravel(world) && badgeGate && access.allowed;
    const reason = !canTravel(world) ? '请先完成当前遭遇。' : !badgeGate ? `需要至少${destination.requiresBadges}枚徽章。` : !access.allowed?access.reason:'';
    options.push(option('travel', `前往${destination.name}`, enabled, reason, { node: destination.id }));
  }
  options.push(...companionship.options(world));
  options.push(...npcQuests.options(world));
  options.push(...specialEncounters.options(world));
  options.push(...hellChallenges.options(world));
  if(status==='finished'){
    options.push(...campaign.options(world),...storyEvents.options(world));
    if(nodeId==='indigo'&&(world.训练家?.徽章?.length||0)===8&&(world.剧情?.联盟进度||0)<5)options.push(option('challenge-elite','挑战'+(['科拿','希巴','菊子','阿渡','冠军小茂'][world.剧情.联盟进度||0]),campaign.canEnterElite(world),campaign.canEnterElite(world)?'':'先赢得石英大会优胜，才能取得四天王挑战资格。'));
  }
  const gym = Number.isInteger(encounter?.道馆) ? GYMS[encounter.道馆] : null;
  return {
    id: opening ? 'oak-lab' : rivalIntro ? 'rival-opening' : status === 'active' ? 'battle' : `location-${nodeId}`,
    location: nodeId, title: node.name, backgroundId: background?.id || null, backgroundImage: background?.image || null,
    person: npc ? { id: npc.id, name: npc.name, role: npc.role, image: npc.image } : null,
    pokemon: opening ? [{id:1,name:'妙蛙种子'},{id:4,name:'小火龙'},{id:7,name:'杰尼龟'}] : [...(lead?[lead]:[]),...(status==='pending'&&encounter?.类型==='wild'?encounter.队伍:[])].map(mon=>({uid:mon.uid,id:mon.图鉴编号,name:mon.昵称,level:mon.等级,shiny:mon.闪光===true})).concat(world.城市设施?.safari?.status==='active'&&world.城市设施.safari.encounter?[{id:world.城市设施.safari.encounter.speciesId,level:world.城市设施.safari.encounter.level}]:[]),
    dialogue, options:world.城市设施?.safari?.status==='active'?options.filter(option=>option.id.startsWith('facility-safari-')||option.id==='kanto-story-event'&&!world.城市设施.safari.encounter):options, encounter: encounter ? { type: encounter.类型, trainer: encounter.训练家 || '', npc: encounter.npc || encounter.训练家 || '', gym: encounter.道馆,
      specialId: encounter.specialId || null, theme: encounter.theme || null, title: encounter.title || null } : null,
    gym: gym ? { id: gym.name, badge: gym.badge } : null,
  };
}

function applyTheaterChoice(world, action, args = {}) {
  const theater = buildTheater(world,{storyTurn:args.storyTurn});
  const matches = item => item.id === action &&
    (!args.node || item.payload?.node === args.node) && (!args.item || item.payload?.item === args.item) &&
    (!args.id || item.payload?.id === args.id) && (!args.uid || item.payload?.uid === args.uid) &&
    (!args.mode || item.payload?.mode === args.mode) && (!args.method || item.payload?.method === args.method) && (!args.questId || item.payload?.questId === args.questId) &&
    (!args.encounterId || item.payload?.encounterId === args.encounterId) &&
    (!args.facilityId || item.payload?.facilityId === args.facilityId) &&
    (!args.itemId || item.payload?.itemId === args.itemId) &&
    (!args.speciesId || item.payload?.speciesId === args.speciesId) &&
    (args.coins === undefined || item.payload?.coins === args.coins) &&
    (args.revision === undefined || item.payload?.revision === args.revision) &&
    (!args.deepQuestId || item.payload?.deepQuestId === args.deepQuestId) &&
    (!args.chapterId || item.payload?.chapterId === args.chapterId) &&
    (!args.eventId || item.payload?.eventId === args.eventId) &&
    (!args.choiceId || item.payload?.choiceId===args.choiceId || item.payload?.choices?.some(choice=>choice.id===args.choiceId));
  const selected = theater.options.find(item => item.enabled && matches(item));
  if (!selected) {
    const disabled = theater.options.find(item => !item.enabled && matches(item));
    throw new Error(disabled?.reason || '当前场景不允许这个操作。');
  }
  return selected;
}

function citizenDialogue(nodeId, count = 0) {
  const entry = TOWN_DIALOGUES[nodeId] || { person: 'nurse_joy', lines: ['旅行途中请照顾好同行的宝可梦。'] };
  const index = Number.isInteger(count) && count >= 0 ? count : 0;
  const npc = trainerById.get(entry.person);
  return { personId: entry.person, speaker: npc?.name || '市民', text: entry.lines[index % entry.lines.length] };
}

function locationsView() { return clone(locations); }

module.exports = { buildTheater, applyTheaterChoice, citizenDialogue, locationsView, townDialogues: clone(TOWN_DIALOGUES), gyms: clone(GYMS), legendaryForNode: nodeId => LEGENDARY_TRACKS[nodeId] ? {...LEGENDARY_TRACKS[nodeId]} : null };
