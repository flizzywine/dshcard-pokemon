'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DATA = path.join(__dirname, 'public', 'data');
const DATA_CACHE=new Map();
const { buildBattleCinematic } = require('./battle-cinematics.cjs');
const {sceneContext}=require('./scene-context.cjs');
const STORY_SCENERY = readJson('story-scenery.json');
const MAP_NODES = readJson('map.json');
const GYM_TRAINERS = new Map([
  ['小刚', ['brock', '小刚']],
  ['小霞', ['misty', '小霞']],
  ['马志士', ['lt_surge', '马志士']],
  ['莉佳', ['erika', '莉佳']],
  ['阿桔', ['koga', '阿桔']],
  ['娜姿', ['sabrina', '娜姿']],
  ['夏伯', ['blaine', '夏伯']],
  ['坂木', ['giovanni', '坂木']],
]);
const GYM_IDS = ['brock', 'misty', 'lt_surge', 'erika', 'koga', 'sabrina', 'blaine', 'giovanni'];

function trainerForName(trainers, name) {
  const wanted = String(name || '').trim();
  if (!wanted) return null;
  const labels=item=>[item?.id,item?.name,...(Array.isArray(item?.aliases)?item.aliases:[])].filter(Boolean).map(String);
  return trainers.find(item=>labels(item).includes(wanted))||trainers.find(item=>labels(item).some(label=>label.length>=2&&(label.includes(wanted)||wanted.includes(label))));
}

function readManifest(file) {
  const value=readJson(file);return Array.isArray(value)?value:[];
}

function readJson(file) {
  if(DATA_CACHE.has(file))return DATA_CACHE.get(file);
  try { const value=JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8').replace(/^\uFEFF/, ''));DATA_CACHE.set(file,value);return value; }
  catch { return null; }
}

function sceneryFor(world, catalog = STORY_SCENERY, mapNodes = MAP_NODES) {
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  const nodeId = String(world?.地图?.节点 || 'pallet');
  const node = (Array.isArray(mapNodes) ? mapNodes : []).find(item => item?.id === nodeId);
  const encounter = world?.遭遇 || {};
  const context=sceneContext(world),backgrounds=readManifest('backgrounds.json');
  if(context.sceneTag){const tagged=[...items,...backgrounds].filter(item=>item.sceneTags?.includes(context.sceneTag));const selected=tagged.sort((a,b)=>(b.scenePriority||0)-(a.scenePriority||0)||Number(!!b.generated)-Number(!!a.generated))[0];if(selected)return selected;if(context.sceneTag==='camp'){const camp=backgrounds.find(item=>item.id==='masters-forest-evening');if(camp)return camp;}}
  // Authored atmosphere references vary by town while exact map images remain
  // available separately. These are not presented as literal Kanto buildings.
  const townMood={viridian:'masters-village-alt',cerulean:'masters-downtown-alt-1',vermilion:'illustrated-coast',lavender:'masters-downtown-cloudy',fuchsia:'masters-village-alt',cinnabar:'illustrated-volcano'};
  const liveBoss=world.战斗?.状态!=='finished'&&['gym','elite-four','league'].includes(encounter.类型);
  if(!liveBoss&&townMood[nodeId]){const choice=[...items,...backgrounds].find(item=>item.id===townMood[nodeId]);if(choice)return choice;}
  let type;
  if (world.战斗?.状态!=='finished'&&['gym','elite-four','league'].includes(encounter.类型) || nodeId === 'indigo') type = 'stadium';
  else if (node?.kind === 'cave') type = nodeId === 'viridian-forest' ? 'forest' : 'cave';
  else if (/^route(?:19|20|21)$/.test(nodeId)) type = 'coast';
  else if (/^route(?:3|4|9|10|23)$/.test(nodeId)) type = 'rocky-route';
  else if (node?.kind === 'route') type = 'forest';
  else if (nodeId === 'pallet') type = 'village';
  else if (nodeId === 'cinnabar') type = 'coast';
  else type = 'city';
  return items.find(item => item.sceneType === type) || items.find(item => item.sceneType === 'village') || null;
}

function presentation(world, { trainers = readManifest('trainers.json'), backgrounds = readManifest('backgrounds.json') } = {}) {
  if (!world || typeof world !== 'object') throw new TypeError('需要关都世界状态。');
  const location = world.地图?.地点 || '未知地点';
  const node = world.地图?.节点 || 'pallet';
  const encounter = world.遭遇;
  const status = world.战斗?.状态 || 'pending';
  const starterPending = node === 'pallet' && world.剧情?.初始御三家已选 !== true;
  let npcId = starterPending ? 'oak' : 'rival-blue';
  let npcName = starterPending ? '大木博士' : '小茂';
  if (!starterPending && encounter?.类型 === 'gym') {
    const gymTrainer = GYM_TRAINERS.get(String(encounter.训练家 || ''));
    if (gymTrainer) [npcId, npcName] = gymTrainer;
    else if (Number.isInteger(encounter.道馆)) {
      npcId = GYM_IDS[encounter.道馆] || npcId;
      npcName = encounter.训练家 || npcName;
    }
  } else if (!starterPending && encounter?.训练家) {
    npcName = encounter.训练家;
    const catalogTrainer = trainerForName(trainers, npcName);
    npcId = catalogTrainer?.id || (npcName === '小茂' ? (world.剧情?.联盟进度 > 0 ? 'rival_late' : 'rival_early') : 'trainer');
  }

  const saved=world.剧情?.剧场;
  const insideGym=encounter?.类型==='gym'&&saved?.地点===node&&saved?.轮次===world.地图?.轮次&&saved?.最近动作==='challenge-gym';
  const openingLab=node==='pallet'&&(starterPending||world.剧情?.初始御三家已选===true&&world.战斗?.轮次===1&&status!=='finished');
  const background = (insideGym?backgrounds.find(item=>item.sceneTags?.includes(`gym:${node}`)):null)||(node==='pallet'?backgrounds.find(item=>item.id===(openingLab?'oaks-lab':'pallet-town')):null)||backgrounds.find(item => (Array.isArray(item?.locations) && item.locations.includes(node)) || item?.node === node || item?.location === node);
  const backgroundId = background?.id || null;
  const scenery = sceneryFor(world);
  let text;
  if (starterPending) text = '请选择初始伙伴，与大木博士开始关都冒险。';
  else if (status === 'pending') text = encounter?.训练家 ? `${encounter.训练家}正在等待对战。` : '准备探索关都。';
  else if (status === 'active') text = `正在与${encounter?.训练家 || '对手'}战斗。`;
  else text = world.战斗?.摘要 || '战斗已经结束。';

  return {
    trainers,
    backgrounds,
    battle: buildBattleCinematic({ encounter: encounter || {}, npcId, npcName, trainers }),
    scenery: [...(Array.isArray(STORY_SCENERY?.items) ? STORY_SCENERY.items : []),...backgrounds.filter(item=>item.sceneTags?.length)].map(({ id, sceneType, name, image, note,sceneTags }) => ({ id, sceneType, name, image, note,sceneTags })),
    scene: { location, node, backgroundId,...sceneContext(world), ...(background?.image ? { backgroundImage: background.image } : {}), ...(scenery ? { sceneryId: scenery.id, sceneryType: scenery.sceneType, sceneryName: scenery.name, sceneryImage: scenery.image, sceneryNote: scenery.note } : {}), npcId, npcName, text },
  };
}

module.exports = { presentation, readManifest, sceneryFor };
