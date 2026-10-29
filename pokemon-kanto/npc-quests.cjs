'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { catalog } = require('./engine.cjs');
const { shopFor } = require('./progression-rules.cjs');
const { validateTravel } = require('./field-skills.cjs');
const locations = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data/map.json'), 'utf8').replace(/^\uFEFF/, ''));
const trainers = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data/trainers.json'), 'utf8').replace(/^\uFEFF/, ''));
const itemCatalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data/items.json'), 'utf8').replace(/^\uFEFF/, ''));
const quests = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data/npc-quests.json'), 'utf8').replace(/^\uFEFF/, ''));
const questGadgets = require('./quest-gadgets.cjs');
const nodes = new Map(locations.map(node => [node.id, node]));
const species = new Map(catalog.species.map(mon => [mon.id, mon]));
const trainerById = new Map(trainers.map(trainer => [trainer.id, trainer]));
const byId = new Map(quests.map(quest => [quest.id, quest]));
const MAX_ACTIVE = 4;
const MAX_PURCHASE_BATCHES = 200;
const MAX_EVENTS = 300;
const MAX_GENERATED_PER_CALL = 2;
const MAX_GENERATED_PER_LOCATION = 4;
const MAX_GENERATED_TOTAL = 12;
const MAIN_TASK_IDS = new Set(['choose-starter', 'defeat-rival', 'catch-pokemon', 'first-badge', ...Array.from({ length: 7 }, (_, index) => `badge-${index + 2}`), 'catch-5', 'catch-10', 'league-four', 'league-champion']);
const clone = value => structuredClone(value);

function ensure(world) {
  if (!world || typeof world !== 'object') throw new TypeError('需要关都世界状态。');
  if (!world.委托 || typeof world.委托 !== 'object' || Array.isArray(world.委托)) world.委托 = {};
  const data = world.委托;
  questGadgets.ensure(world);
  if (!data.记录 || typeof data.记录 !== 'object' || Array.isArray(data.记录)) data.记录 = {};
  if (!Array.isArray(data.探访地点)) data.探访地点 = [];
  if (typeof world.地图?.节点 === 'string' && nodes.has(world.地图.节点) && !data.探访地点.includes(world.地图.节点)) data.探访地点.push(world.地图.节点);
  data.探访地点 = [...new Set(data.探访地点.filter(id => nodes.has(id)))];
  if (!data.探访次数 || typeof data.探访次数 !== 'object' || Array.isArray(data.探访次数)) {
    data.探访次数 = Object.fromEntries(data.探访地点.map(id => [id, 1]));
  } else {
    for (const [id, count] of Object.entries(data.探访次数)) {
      if (!nodes.has(id) || !Number.isSafeInteger(count) || count < 0 || count > 1000000) delete data.探访次数[id];
    }
    for (const id of data.探访地点) if (!Number.isSafeInteger(data.探访次数[id])) data.探访次数[id] = 1;
  }
  for (const [id, count] of Object.entries(data.探访次数)) if (count > 0 && !data.探访地点.includes(id)) data.探访地点.push(id);
  if (typeof world.地图?.节点 === 'string' && nodes.has(world.地图.节点) && !Number.isSafeInteger(data.探访次数[world.地图.节点])) {
    data.探访次数[world.地图.节点] = 1;
    if (!data.探访地点.includes(world.地图.节点)) data.探访地点.push(world.地图.节点);
  }
  for (const record of Object.values(data.记录)) {
    if (!record?.baseline || typeof record.baseline !== 'object') continue;
    if (!record.baseline.visitCounts || typeof record.baseline.visitCounts !== 'object' || Array.isArray(record.baseline.visitCounts)) {
      record.baseline.visitCounts = Object.fromEntries((Array.isArray(record.baseline.visited) ? record.baseline.visited : []).filter(id => nodes.has(id)).map(id => [id, 1]));
    }
  }
  if (!data.购买次数 || typeof data.购买次数 !== 'object' || Array.isArray(data.购买次数)) data.购买次数 = {};
  for (const [key, value] of Object.entries(data.购买次数)) if (!Number.isSafeInteger(value) || value < 0) delete data.购买次数[key];
  if (!Array.isArray(data.采购批次)) data.采购批次 = [];
  data.采购批次 = data.采购批次.filter(batch => batch && typeof batch.item === 'string' && Number.isSafeInteger(batch.serial) && batch.serial > 0 && Number.isInteger(batch.remaining) && batch.remaining >= 0 && Number.isSafeInteger(batch.storyTurn));
  if (!Number.isSafeInteger(data.采购序号) || data.采购序号 < 0) data.采购序号 = data.采购批次.reduce((max, batch) => Math.max(max, batch.serial), 0);
  for(const record of Object.values(data.记录)){
    if(record?.baseline && !Number.isSafeInteger(record.baseline.purchaseSerial)) record.baseline.purchaseSerial=data.采购批次.filter(batch=>batch.storyTurn<=record.acceptedTurn).reduce((max,batch)=>Math.max(max,batch.serial),0);
  }
  prunePurchases(world);
  if (!Array.isArray(data.事件)) data.事件 = [];
  data.事件 = data.事件.filter(event => event && Number.isSafeInteger(event.serial) && event.serial > 0 && ['camp', 'care'].includes(event.action) && Number.isSafeInteger(event.storyTurn) && event.storyTurn > 0).slice(-MAX_EVENTS);
  if (!Number.isSafeInteger(data.事件序号) || data.事件序号 < 0) data.事件序号 = data.事件.reduce((max, event) => Math.max(max, event.serial), 0);
  if (!Array.isArray(data.纪念品)) data.纪念品 = [];
  data.纪念品 = data.纪念品.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string');
  if (!Array.isArray(data.随机委托)) data.随机委托 = [];
  return world;
}

const townNpc = Object.freeze({ pallet: 'scientist', viridian: 'gentleman', pewter: 'hiker', cerulean: 'lass', vermilion: 'sailor', lavender: 'nurse_joy', celadon: 'nurse_joy', fuchsia: 'nurse_joy', saffron: 'nurse_joy', cinnabar: 'nurse_joy', indigo: 'cool_trainer_m' });
const localNpcIds = Object.freeze({ pallet: ['oak', 'scientist'], viridian: ['gentleman', 'nurse_joy'], pewter: ['hiker', 'brock'], cerulean: ['lass', 'misty'], vermilion: ['sailor', 'hiker'], lavender: ['nurse_joy', 'scientist'], celadon: ['nurse_joy', 'erika', 'gentleman'], fuchsia: ['nurse_joy', 'koga', 'swimmer_f'], saffron: ['nurse_joy', 'sabrina', 'scientist'], cinnabar: ['nurse_joy', 'blaine'], indigo: ['cool_trainer_m', 'lorelei'] });
const typeNames = Object.freeze({ Normal:'一般', Fire:'火', Water:'水', Electric:'电', Grass:'草', Ice:'冰', Fighting:'格斗', Poison:'毒', Ground:'地面', Flying:'飞行', Psychic:'超能力', Bug:'虫', Rock:'岩石', Ghost:'幽灵', Dragon:'龙', Dark:'恶', Steel:'钢' });
const typeByName = Object.fromEntries(Object.entries(typeNames).map(([key, value]) => [value, key]));
const rewardTiers = Object.freeze({
  modest: { label: '基础旅费', multiplier: 0.75, reward: { coins: 0 } },
  standard: { label: '标准旅费', multiplier: 1, reward: { coins: 0 } },
  generous: { label: '额外旅费', multiplier: 1.25, reward: { coins: 0 } },
  supplies: { label: '旅费与伤药', multiplier: 0.85, reward: { coins: 0, items: { potion: 1 } } },
  keepsake: { label: '旅费与纪念品', multiplier: 0.85, reward: { coins: 0, souvenir: true } },
});
const townRewardBase = Object.freeze({ pallet: 1000, viridian: 1200, pewter: 1500, cerulean: 1800, vermilion: 2200, lavender: 2600, celadon: 2800, fuchsia: 3200, saffron: 3400, cinnabar: 3900, indigo: 4500 });

function baseReward(location, objective) {
  let amount = townRewardBase[location] || 1000;
  if (['caught', 'dex', 'deliver'].includes(objective?.kind)) amount *= objective.kind === 'deliver' ? 1.15 : 1.1;
  if (objective?.kind === 'badges' || objective?.kind === 'league') amount *= 1.45;
  if (objective?.target > 1) amount *= Math.min(1.6, 1 + (objective.target - 1) * 0.12);
  return Math.round(amount / 50) * 50;
}

function generatedRewardPreview(id, location, objective, reward) {
  const tier = rewardTiers[id];
  if (!tier || !reward) return '';
  const items = Object.entries(reward.items || {}).map(([item, count]) => {
    const info = itemCatalog.find(entry => entry.id === item);
    return `${info?.name || item}×${count}`;
  });
  if (reward.souvenir) items.push('委托纪念品（收藏）');
  return `${reward.coins}元${items.length ? `与${items.join('、')}` : ''}（${tier.label}）`;
}

function allQuests(world) { return [...quests, ...(world?.委托?.随机委托 || [])]; }
function questById(world, id) { return allQuests(world).find(quest => quest.id === id); }

function generationCandidates(world) {
  const node = nodes.get(world?.地图?.节点);
  const objectives = new Map();
  if (!node || node.kind !== 'town' || world?.剧情?.初始御三家已选 !== true || world?.战斗?.状态 !== 'finished') return objectives;
  for (const [id, count, label] of [['caught-1', 1, '接取后收服1只野生宝可梦'], ['caught-2', 2, '接取后收服2只野生宝可梦'], ['dex-1', 1, '接取后收服1种新的野生宝可梦'], ['dex-2', 2, '接取后收服2种新的野生宝可梦'], ['bond-2', 2, '和伙伴增加2点信赖'], ['care-1', 1, '照料伙伴1次']]) {
    const kind = id.startsWith('caught-') ? 'caught' : id.startsWith('dex-') ? 'dex' : id.startsWith('bond-') ? 'bond' : 'care';
    objectives.set(id, { label, objective: { kind, target: count } });
  }
  if (world.队伍?.some(mon => mon.当前HP > 0)) objectives.set('camp-1', { label: '在野外露营1次', objective: { kind: 'camp', target: 1 } });
  let reachable = [];
  for (const id of node.links || []) {
    const destination = nodes.get(id);
    if (destination && validateTravel(world, destination.id).allowed) {
      reachable.push(destination);
      if (destination.kind === 'town') for (const neighbor of destination.links || []) {
        const second = nodes.get(neighbor);
        // Evaluate the next edge from the intermediate town, preserving the
        // player's real inventory, badges and Pokémon without mutating MVU.
        const fromTown = { ...world, 地图: { ...world.地图, 节点: destination.id } };
        if (second && second.kind !== 'town' && validateTravel(fromTown, second.id).allowed) reachable.push(second);
      }
    }
  }
  reachable = [...new Map(reachable.map(item => [item.id, item])).values()];
  for (const target of reachable) {
    if (target.id !== node.id) objectives.set(`visit-${target.id}`, { label: `接取后探访${target.name}`, objective: { kind: 'visit', node: target.id, target: 1 } });
  }
  const candidateSpecies = new Set([...(node.encounters || []), ...reachable.flatMap(item => item.encounters || [])]);
  const possibleTypes = new Set([...candidateSpecies].filter(id => ![144, 145, 146, 150, 151].includes(id)).flatMap(id => species.get(id)?.types || []));
  for (const type of possibleTypes) objectives.set(`type-${type.toLowerCase()}`, { label: `接取后收服1只${typeNames[type]}属性野生宝可梦`, objective: { kind: 'catch-type', type, target: 1 } });
  if (node.gym !== undefined && Number.isInteger(node.gym) && (world.训练家?.徽章?.length || 0) === node.gym) objectives.set('badge-1', { label: '接取后取得下一枚道馆徽章', objective: { kind: 'badges', target: 1 } });
  if (node.id === 'indigo' && (world.训练家?.徽章?.length || 0) === 8) objectives.set('league-1', { label: '接取后战胜一位联盟对手', objective: { kind: 'league', target: 1 } });
  const shop = shopFor(world);
  if (shop.available) {
    const itemById = new Map(itemCatalog.map(item => [item.id, item]));
    for (const item of shop.items) {
      const itemInfo = itemById.get(item);
      if (itemInfo && itemInfo.price <= 1200 && itemInfo.category !== 'evolution') objectives.set(`deliver-${item}`, { label: `购买并交付1个${itemInfo.name}`, objective: { kind: 'deliver', item, target: 1 } });
    }
  }
  return objectives;
}

function localNpc(world, node) {
  const saved = world?.剧情?.剧场;
  const id = saved?.地点 === node.id && saved?.轮次 === world.地图?.轮次 && localNpcIds[node.id]?.includes(saved?.角色) ? saved.角色 : townNpc[node.id];
  const trainer = trainerById.get(id);
  return trainer ? { id: trainer.id, name: trainer.name } : { id: 'nurse_joy', name: '乔伊小姐' };
}

function generationContext(world) {
  const safe = ensure(clone(world)), node = nodes.get(safe.地图?.节点);
  const eligible = !!node && node.kind === 'town' && safe.剧情?.初始御三家已选 === true && safe.战斗?.状态 === 'finished';
  if (!eligible) return { eligible: false, reason: !node || node.kind !== 'town' ? '仅可在城镇向NPC询问委托。' : safe.剧情?.初始御三家已选 !== true ? '请先选择初始伙伴。' : '请在当前遭遇结束后询问委托。', location: node ? { id: node.id, name: node.name } : null, npc: null, objectiveOptions: [], rewardOptions: [] };
  const localRemaining = Math.max(0, MAX_GENERATED_PER_LOCATION - safe.委托.随机委托.filter(offer => offer.location === node.id).length);
  const totalRemaining = Math.max(0, MAX_GENERATED_TOTAL - safe.委托.随机委托.length);
  if (!localRemaining || !totalRemaining) return { eligible: false, reason: '当前城镇的随机委托数量已达上限。', location: { id: node.id, name: node.name }, npc: null, objectiveOptions: [], rewardOptions: [], limits: { offersPerCall: MAX_GENERATED_PER_CALL, maxPerLocation: MAX_GENERATED_PER_LOCATION, maxTotal: MAX_GENERATED_TOTAL, remainingLocal: localRemaining, remainingTotal: totalRemaining } };
  const npc = localNpc(safe, node);
  return {
    eligible: true,
    location: { id: node.id, name: node.name }, npc,
    objectiveOptions: [...generationCandidates(safe)].map(([id, value]) => ({ id, label: value.label })),
    rewardOptions: Object.entries(rewardTiers).map(([id, value]) => ({ id, label: `${value.label}（随城镇与目标递进）` })),
    limits: { offersPerCall: MAX_GENERATED_PER_CALL, maxPerLocation: MAX_GENERATED_PER_LOCATION, maxTotal: MAX_GENERATED_TOTAL, remainingLocal: localRemaining, remainingTotal: totalRemaining },
  };
}

// Numeric objectives and rewards do not need a second language-model request.
// The normal story model can describe these offers; their playable definition
// is selected locally, with stable variation and no blocking network wait.
function localGeneratedCandidates(world,{storyTurn}={}) {
  const context=generationContext(world);if(!context.eligible)throw Error(context.reason);
  const used=new Set((world.委托?.随机委托||[]).filter(q=>q.location===context.location.id).map(q=>JSON.stringify(q.objective)));
  const entries=[...generationCandidates(world)].map(([id,row])=>({id,...row}));
  const seed=`${context.location.id}|${storyTurn}|${world.委托?.随机委托?.length||0}`;
  const rank=id=>createHash('sha256').update(seed+'|'+id).digest().readUInt32LE(0);
  entries.sort((a,b)=>Number(used.has(JSON.stringify(a.objective)))-Number(used.has(JSON.stringify(b.objective)))||rank(a.id)-rank(b.id));
  const intros=['请帮我留下能复核的观察记录，别冒险勉强伙伴。','这件事关系到附近即将出发的训练家，我希望有人认真照看。','如果途中发现异常，先照顾伙伴的安全，再把情况告诉我。'];
  const titleByKind={caught:'同行伙伴的生态记录',dex:'第一次见面的观察手册',bond:'学会听懂伙伴的回应',care:'照料之后的一点变化',camp:'安全营地与守夜记录',visit:'沿路确认安全路线','catch-type':'属性生态的实地观察',badges:'道馆训练的实地见证',league:'联盟备战的观察笔记',deliver:'出发前的补给交接'};
  const limit=Math.min(2,context.limits.remainingLocal,context.limits.remainingTotal);
  return entries.slice(0,limit).map((entry,index)=>({title:`${context.location.name}·${titleByKind[entry.objective.kind]||'旅途委托'}`,description:`${context.npc.name}：${entry.label}。${intros[rank(entry.id)%intros.length]}`,objectiveId:entry.id,rewardId:index?'supplies':'generous'}));
}

function cleanGeneratedText(value, field, min, max) {
  if (typeof value !== 'string') throw new Error(`${field}必须是文字。`);
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length < min || text.length > max || /[<>\u0000-\u001f]/.test(text)) throw new Error(`${field}长度或字符不符合要求。`);
  return text;
}

function canonicalGeneratedObjective(id) {
  if (id === 'caught-1' || id === 'caught-2') return { kind: 'caught', target: Number(id.at(-1)) };
  if (id === 'dex-1' || id === 'dex-2') return { kind: 'dex', target: Number(id.at(-1)) };
  if (id === 'bond-2') return { kind: 'bond', target: 2 };
  if (id === 'care-1') return { kind: 'care', target: 1 };
  if (id === 'camp-1') return { kind: 'camp', target: 1 };
  if (id === 'badge-1') return { kind: 'badges', target: 1 };
  if (id === 'league-1') return { kind: 'league', target: 1 };
  if (id.startsWith('visit-') && nodes.has(id.slice(6))) return { kind: 'visit', node: id.slice(6), target: 1 };
  if (id.startsWith('type-')) {
    const type = Object.keys(typeNames).find(key => key.toLowerCase() === id.slice(5));
    if (type) return { kind: 'catch-type', type, target: 1 };
  }
  if (id.startsWith('deliver-')) {
    const item = itemCatalog.find(entry => entry.id === id.slice(8));
    if (item && item.price <= 1200 && item.category !== 'evolution') return { kind: 'deliver', item: item.id, target: 1 };
  }
  return null;
}

function generatedReward(id, hash, npcName, location, objective) {
  const tier = rewardTiers[id];
  if (!tier) return null;
  const reward = clone(tier.reward);
  reward.coins = Math.max(500, Math.round(baseReward(location, objective) * tier.multiplier / 50) * 50);
  if (reward.souvenir === true) reward.souvenir = { id: `souvenir-${hash}`, name: `${npcName}的委托纪念品` };
  return reward;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function addGeneratedOffers(world, candidates, { storyTurn } = {}) {
  if (!Number.isSafeInteger(storyTurn) || storyTurn < 1) throw new Error('需要由宿主提供有效的故事回合。');
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > MAX_GENERATED_PER_CALL) throw new Error('每次最多提交两项委托。');
  const next = ensure(clone(world)), context = generationContext(next);
  if (!context.eligible) throw new Error(context.reason);
  const objectiveMap = generationCandidates(next), objectiveIds = new Set(objectiveMap.keys());
  const rewardIds = new Set(Object.keys(rewardTiers));
  const offers = candidates.map(candidate => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || Object.keys(candidate).sort().join(',') !== 'description,objectiveId,rewardId,title') throw new Error('委托候选只能包含title、description、objectiveId和rewardId。');
    const title = cleanGeneratedText(candidate.title, '委托标题', 4, 32);
    const description = cleanGeneratedText(candidate.description, '委托描述', 12, 160);
    if (typeof candidate.objectiveId !== 'string' || !objectiveIds.has(candidate.objectiveId)) throw new Error('委托目标不在当前城镇允许的目标列表中。');
    if (typeof candidate.rewardId !== 'string' || !rewardIds.has(candidate.rewardId)) throw new Error('委托奖励不在安全奖励档位中。');
    const objective = objectiveMap.get(candidate.objectiveId);
    const hashInput = [context.location.id, context.npc.id, title, description, candidate.objectiveId, candidate.rewardId].join('\u001f');
    const hash = createHash('sha256').update(hashInput).digest('hex').slice(0, 12);
    const id = `gen-${context.location.id}-${hash}`;
    if (byId.has(id) || next.委托.随机委托.some(item => item.id === id) || Object.hasOwn(next.委托.记录, id)) throw new Error('生成委托ID已存在，不能覆盖已有任务。');
    const reward = generatedReward(candidate.rewardId, hash, context.npc.name, context.location.id, objective.objective);
    return { id, location: context.location.id, npcId: context.npc.id, npcName: context.npc.name, title, description, objective: clone(objective.objective), reward, rewardPreview: generatedRewardPreview(candidate.rewardId, context.location.id, objective.objective, reward), generated: true, createdTurn: storyTurn, objectiveId: candidate.objectiveId, rewardId: candidate.rewardId };
  });
  if (new Set(offers.map(offer => offer.id)).size !== offers.length) throw new Error('同一批委托不能包含重复内容。');
  const localCount = next.委托.随机委托.filter(offer => offer.location === context.location.id).length;
  if (localCount + offers.length > MAX_GENERATED_PER_LOCATION || next.委托.随机委托.length + offers.length > MAX_GENERATED_TOTAL) throw new Error('当前城镇的随机委托数量已达上限。');
  next.委托.随机委托.push(...offers);
  refresh(next, { storyTurn });
  validate(next);
  return next;
}

function ownedWild(world) {
  return [...(world.队伍 || []), ...(world.电脑 || [])].filter(mon => mon && (mon.收服来源 === 'wild' || String(mon.uid || '').startsWith('caught-')));
}

function snapshot(world) {
  const caught = ownedWild(world);
  const bond = world.羁绊?.伙伴 || {};
  const data = world.委托;
  return {
    caught: caught.length,
    caughtUids: caught.map(mon => mon.uid),
    caughtSpecies: caught.map(mon => mon.收服图鉴编号 || mon.图鉴编号),
    dex: [...new Set(caught.map(mon => mon.收服图鉴编号 || mon.图鉴编号))],
    badges: Array.isArray(world.训练家?.徽章) ? world.训练家.徽章.length : 0,
    visitCounts: { ...(data.探访次数 || {}) },
    trust: Object.fromEntries(Object.entries(bond).map(([uid, record]) => [uid, Number.isInteger(record?.信赖) ? record.信赖 : 0])),
    purchaseSerial: data.采购序号,
    eventSerial: data.事件序号,
  };
}

function objectiveProgress(world, quest, record) {
  const obj = quest.objective, base = record.baseline || {}, target = obj.target || 1;
  const catches = ownedWild(world);
  if (obj.kind === 'caught') return Math.min(target, Math.max(0, catches.length - (base.caught || 0)));
  if (obj.kind === 'catch-species') {
    const before = new Set(base.caughtUids || []);
    return Math.min(target, catches.filter(mon => !before.has(mon.uid) && (mon.收服图鉴编号 || mon.图鉴编号) === obj.species).length);
  }
  if (obj.kind === 'catch-type') {
    const before = new Set(base.caughtUids || []);
    return Math.min(target, catches.filter(mon => !before.has(mon.uid) && species.get(mon.收服图鉴编号 || mon.图鉴编号)?.types?.includes(obj.type)).length);
  }
  if (obj.kind === 'dex') {
    const before = new Set(base.dex || []), after = new Set(catches.map(mon => mon.收服图鉴编号 || mon.图鉴编号));
    for (const id of before) after.delete(id);
    return Math.min(target, after.size);
  }
  if (obj.kind === 'visit') {
    const before = Number.isSafeInteger(record.baseline?.visitCounts?.[obj.node]) ? record.baseline.visitCounts[obj.node] : (record.baseline?.visited || []).includes(obj.node) ? 1 : 0;
    const after = Number.isSafeInteger(world.委托?.探访次数?.[obj.node]) ? world.委托.探访次数[obj.node] : 0;
    return Math.min(target, Math.max(0, after - before));
  }
  if (obj.kind === 'badges') return Math.min(target, Math.max(0, (world.训练家?.徽章?.length || 0) - (quest.id === 'saffron-badge' ? 0 : (base.badges || 0))));
  if (obj.kind === 'league') return Math.min(target, Math.max(0, (Number.isInteger(world.剧情?.联盟进度) ? world.剧情.联盟进度 : 0) - (quest.id === 'indigo-champion' ? 0 : (base.league || 0))));
  if (obj.kind === 'bond') {
    const bond = world.羁绊?.伙伴 || {};
    return Math.min(target, Math.max(0, ...Object.entries(bond).map(([uid, record]) => (record?.信赖 || 0) - (base.trust?.[uid] || 0))));
  }
  if (obj.kind === 'camp' || obj.kind === 'care') return Math.min(target, (world.委托.事件 || []).filter(event => event.serial > (base.eventSerial || 0) && event.action === obj.kind).length);
  if (obj.kind === 'deliver') {
    const eligible = (world.委托.采购批次 || []).filter(batch => batch.serial > (base.purchaseSerial || 0) && batch.item === obj.item).reduce((sum, batch) => sum + batch.remaining, 0);
    const stock = world.背包?.物品?.[obj.item] || 0;
    return Math.min(target, eligible, stock);
  }
  return 0;
}

function dataVisited(world) { return world.委托?.探访地点 || []; }

function taskFor(quest, record, progress) {
  const status = record?.status || 'available';
  const label = status === 'ready' || status === 'active' && progress >= quest.objective.target ? '可交付' : status === 'active' ? '进行中' : status === 'completed' ? '已完成' : '未接取';
  return {
    id: `npc-quest:${quest.id}`, questId: quest.id, category: 'npc-quest',
    标题: quest.title, name: quest.title, 描述: quest.description, description: quest.description,
    委托人: quest.npcName, 委托地点: nodes.get(quest.location)?.name || quest.location,
    奖励预告: quest.rewardPreview, 状态: label, 进度: record?.status === 'active' || record?.status === 'ready' ? progress : status === 'completed' ? quest.objective.target : 0,
    目标: quest.objective.target, objective: clone(quest.objective),
  };
}

function refresh(world, { storyTurn } = {}) {
  ensure(world);
  const data = world.委托;
  const oldTasks = Array.isArray(world.任务) ? world.任务 : [];
  const otherTasks = oldTasks.filter(task => task && typeof task.id === 'string' && !task.id.startsWith('npc-quest:'));
  const mainTasks = otherTasks.filter(task => MAIN_TASK_IDS.has(task.id));
  const customTasks = otherTasks.filter(task => !MAIN_TASK_IDS.has(task.id));
  const definitions = allQuests(world), questTasks = [];
  for (const quest of definitions) {
    const record = data.记录[quest.id];
    if (!record) { questTasks.push(taskFor(quest, null, 0)); continue; }
    if (record.status === 'active' || record.status === 'ready') {
      record.progress = objectiveProgress(world, quest, record);
      record.status = record.progress >= quest.objective.target ? 'ready' : 'active';
      if (record.status === 'ready') record.readyTurn = Number.isSafeInteger(storyTurn) ? storyTurn : record.readyTurn || 0;
    }
    if (record.status === 'ready') record.progress = objectiveProgress(world, quest, record);
    questTasks.push(taskFor(quest, record, record.progress || 0));
  }
  const order = { '进行中': 0, '可交付': 1, '未接取': 2, '已完成': 3 };
  questTasks.sort((a, b) => order[a.状态] - order[b.状态] || definitions.findIndex(q => q.id === a.questId) - definitions.findIndex(q => q.id === b.questId));
  world.任务 = [...mainTasks, ...questTasks, ...customTasks];
  questGadgets.refresh(world, { storyTurn });
  return world;
}

function activeCount(world) { return Object.values(world.委托?.记录 || {}).filter(record => record?.status === 'active' || record?.status === 'ready').length + questGadgets.activeCount(world); }

function options(world) {
  const node = nodes.get(world?.地图?.节点);
  if (!node || world?.战斗?.状态 !== 'finished' || world?.剧情?.初始御三家已选 !== true) return [];
  const out = [];
  for (const quest of (node.kind === 'town' ? allQuests(world).filter(item => item.location === node.id) : [])) {
    const record = world.委托?.记录?.[quest.id];
    if (!record) {
      const canAccept = activeCount(world) < MAX_ACTIVE;
      out.push({ id: 'quest-accept', label: `接取委托：${quest.title}`, enabled: canAccept, ...(canAccept ? {} : { reason: '最多同时进行四项委托，请先完成或交付一项。' }), payload: { questId: quest.id, npcId: quest.npcId, npcName: quest.npcName } });
    } else if (record.status === 'ready') {
      out.push({ id: 'quest-turn-in', label: `向${quest.npcName}交付：${quest.title}`, enabled: true, payload: { questId: quest.id, npcId: quest.npcId, npcName: quest.npcName } });
    }
  }
  out.push(...questGadgets.options(world, MAX_ACTIVE - Object.values(world.委托?.记录 || {}).filter(record => record?.status === 'active' || record?.status === 'ready').length));
  return out;
}

function consumeDelivery(world, quest, record) {
  const obj = quest.objective, target = obj.target;
  if ((world.背包?.物品?.[obj.item] || 0) < target) throw new Error('背包中没有足够的交付物品。');
  let remaining = target;
  for (const batch of world.委托.采购批次.filter(batch => batch.item === obj.item && batch.serial > (record.baseline.purchaseSerial || 0)).sort((a, b) => a.serial - b.serial)) {
    const used = Math.min(remaining, batch.remaining);
    batch.remaining -= used; remaining -= used;
    if (!remaining) break;
  }
  if (remaining) throw new Error('请先在接取委托后购买指定物品，再交付。');
  world.背包.物品[obj.item] -= target;
}

function apply(world, action, payload = {}, { storyTurn } = {}) {
  if (typeof action === 'string' && action.startsWith('deep-quest-')) return questGadgets.apply(world, action, payload, { storyTurn });
  const next = ensure(clone(world));
  if (!Number.isSafeInteger(storyTurn) || storyTurn < 1) throw new Error('需要由宿主提供有效的故事回合。');
  if (next.剧情?.初始御三家已选 !== true) throw new Error('请先选择最初的伙伴。');
  if (next.战斗?.状态 !== 'finished') throw new Error('战斗中不能接取或交付委托。');
  const quest = questById(next, payload.questId);
  if (!quest) throw new Error('没有这项关都委托。');
  if (quest.location !== next.地图?.节点) throw new Error('需要到委托人所在城镇办理。');
  const record = next.委托.记录[quest.id];
  if (action === 'quest-accept') {
    if (record) throw new Error(record.status === 'completed' ? '这项委托已经完成。' : '这项委托已经接取。');
    if (activeCount(next) >= MAX_ACTIVE) throw new Error('最多同时进行四项委托，请先完成或交付一项。');
    const base = snapshot(next); base.visited = [...next.委托.探访地点]; base.league = Number.isInteger(next.剧情?.联盟进度) ? next.剧情.联盟进度 : 0;
    next.委托.记录[quest.id] = { status: 'active', acceptedTurn: storyTurn, baseline: base, progress: 0 };
  } else if (action === 'quest-turn-in') {
    if (record?.status === 'completed') throw new Error('这项委托已经完成。');
    if (!record || record.status !== 'ready') throw new Error('这项委托尚未满足交付条件。');
    if (objectiveProgress(next, quest, record) < quest.objective.target) throw new Error('委托进度尚未达到目标。');
    if (quest.objective.kind === 'deliver') consumeDelivery(next, quest, record);
    const reward = quest.reward || {};
    if (Number.isInteger(reward.coins) && reward.coins > 0) {
      if (next.训练家.金钱 + reward.coins > 9999999) throw new Error('金钱上限已满，无法结算委托奖励。');
      next.训练家.金钱 += reward.coins;
    }
    for (const [item, count] of Object.entries(reward.items || {})) {
      if (!Number.isInteger(next.背包.物品[item]) || !Number.isInteger(count) || count < 1 || next.背包.物品[item] + count > 999) throw new Error('物品奖励无法放入背包。');
    }
    for (const [item, count] of Object.entries(reward.items || {})) next.背包.物品[item] += count;
    if (reward.souvenir && !next.委托.纪念品.some(item => item.id === reward.souvenir.id)) {
      const keepsake = { id: reward.souvenir.id, name: reward.souvenir.name, description: 'NPC委托纪念品；仅作旅程收藏，不提供战斗效果。' };
      next.委托.纪念品.push(keepsake);
      next.背包.关键物品.push({ id: keepsake.id, 名称: keepsake.name, 说明: keepsake.description, 类型: '纪念品' });
    }
    record.status = 'completed'; record.completedTurn = storyTurn; record.progress = quest.objective.target;
  } else throw new Error('未知委托操作。');
  refresh(next, { storyTurn });
  return next;
}

function actionResult(world, action, payload = {}) {
  if (typeof action === 'string' && action.startsWith('deep-quest-')) return questGadgets.actionResult(world, action, payload);
  if (!['quest-accept', 'quest-turn-in'].includes(action)) return null;
  const quest = questById(world, payload?.questId), record = world?.委托?.记录?.[payload?.questId];
  if (!quest || !record) return null;
  if (action === 'quest-accept') {
    if (!['active', 'ready'].includes(record.status)) return null;
    return { type: 'accepted', questId: quest.id, title: quest.title, npcName: quest.npcName, result: `已向${quest.npcName}接取「${quest.title}」；目标：${quest.description}`, description: quest.description, rewardPreview: quest.rewardPreview };
  }
  if (record.status !== 'completed' || !Number.isSafeInteger(record.completedTurn)) return null;
  const items = Object.entries(quest.reward?.items || {}).map(([id, count]) => `${itemCatalog.find(item => item.id === id)?.name || id}×${count}`);
  const payout = Number.isSafeInteger(quest.reward?.coins) && quest.reward.coins > 0 ? `获得${quest.reward.coins}元` : '';
  return { type: 'completed', questId: quest.id, title: quest.title, npcName: quest.npcName, result: `已向${quest.npcName}交付「${quest.title}」${payout ? `，${payout}` : ''}${items.length ? `，获得${items.join('、')}` : ''}。`, rewardPreview: quest.rewardPreview };
}

function validate(world) {
  const data = world?.委托;
  if (!data || typeof data !== 'object' || !data.记录 || typeof data.记录 !== 'object' || !Array.isArray(data.探访地点) || !data.探访次数 || typeof data.探访次数 !== 'object' || Array.isArray(data.探访次数) || !Array.isArray(data.采购批次) || !Array.isArray(data.事件) || !Array.isArray(data.纪念品)) throw new Error('NPC委托资料无效。');
  if (!Array.isArray(data.随机委托) || data.随机委托.length > MAX_GENERATED_TOTAL) throw new Error('随机NPC委托资料无效。');
  if (activeCount(world) > MAX_ACTIVE) throw new Error('进行中的NPC委托超过上限。');
  questGadgets.validate(world);
  const generatedIds = new Set();
  const generatedPerLocation = new Map();
  for (const offer of data.随机委托) {
    const node = nodes.get(offer?.location), trainer = trainerById.get(offer?.npcId);
    if (!offer || offer.generated !== true || !node || node.kind !== 'town' || !trainer || trainer.name !== offer.npcName || typeof offer.objectiveId !== 'string' || typeof offer.rewardId !== 'string' || !Number.isSafeInteger(offer.createdTurn) || offer.createdTurn < 1) throw new Error('随机委托定义无效。');
    const title = cleanGeneratedText(offer.title, '委托标题', 4, 32), description = cleanGeneratedText(offer.description, '委托描述', 12, 160);
    const objective = canonicalGeneratedObjective(offer.objectiveId);
    const hash = createHash('sha256').update([offer.location, offer.npcId, title, description, offer.objectiveId, offer.rewardId].join('\u001f')).digest('hex').slice(0, 12);
    const expectedReward = generatedReward(offer.rewardId, hash, offer.npcName, offer.location, objective);
    if (!objective || stableJson(objective) !== stableJson(offer.objective) || offer.id !== `gen-${offer.location}-${hash}` || offer.rewardPreview !== generatedRewardPreview(offer.rewardId, offer.location, objective, expectedReward) || stableJson(expectedReward) !== stableJson(offer.reward) || generatedIds.has(offer.id) || byId.has(offer.id)) throw new Error('随机委托内容或奖励校验失败。');
    generatedIds.add(offer.id);
    generatedPerLocation.set(offer.location, (generatedPerLocation.get(offer.location) || 0) + 1);
  }
  if ([...generatedPerLocation.values()].some(count => count > MAX_GENERATED_PER_LOCATION)) throw new Error('单个城镇的随机委托数量超过上限。');
  for (const node of data.探访地点) if (!nodes.has(node)) throw new Error('NPC委托探访地点无效。');
  for (const [node, count] of Object.entries(data.探访次数)) if (!nodes.has(node) || !Number.isSafeInteger(count) || count < 0 || count > 1000000) throw new Error('NPC委托探访次数无效。');
  for (const [id, record] of Object.entries(data.记录)) {
    const definition = questById(world, id);
    if (!definition || !record || !['active', 'ready', 'completed'].includes(record.status) || !Number.isSafeInteger(record.acceptedTurn) || record.acceptedTurn < 1 || !record.baseline || !Number.isInteger(record.progress) || record.progress < 0 || record.progress > definition.objective.target) throw new Error('NPC委托记录无效。');
    if (record.baseline.visitCounts !== undefined && (!record.baseline.visitCounts || typeof record.baseline.visitCounts !== 'object' || Array.isArray(record.baseline.visitCounts) || Object.entries(record.baseline.visitCounts).some(([node, count]) => !nodes.has(node) || !Number.isSafeInteger(count) || count < 0 || count > 1000000))) throw new Error('NPC委托探访基准无效。');
    if (record.status === 'completed' && !Number.isSafeInteger(record.completedTurn)) throw new Error('NPC委托完成记录无效。');
  }
  return true;
}

function prunePurchases(world) {
  const data=world.委托, batches=data.采购批次, protectedBatches=new Set();
  const active=Object.entries(data.记录||{}).map(([id,record])=>({record,quest:questById(world,id)})).filter(({record,quest})=>['active','ready'].includes(record?.status)&&quest?.objective?.kind==='deliver');
  for(const {record,quest} of active){
    const item=quest.objective.item, needed=active.filter(x=>x.quest.objective.item===item).reduce((sum,x)=>sum+x.quest.objective.target,0);
    let total=0;
    for(const batch of batches){if(batch.item!==item||batch.serial<=(record.baseline?.purchaseSerial||0)||batch.remaining<=0)continue;protectedBatches.add(batch);total+=batch.remaining;if(total>=needed)break;}
  }
  const recent=new Set(batches.slice(-MAX_PURCHASE_BATCHES));data.采购批次=batches.filter(batch=>protectedBatches.has(batch)||recent.has(batch));
}

function recordPurchase(world, item, count, storyTurn) {
  ensure(world);
  const data = world.委托;
  if (typeof item !== 'string' || !Number.isInteger(count) || count < 1) return;
  if (!Number.isSafeInteger(storyTurn) || storyTurn < 1) storyTurn = Math.max(1, world.地图?.轮次 || 1);
  data.采购序号 += 1;
  data.购买次数[item] = (data.购买次数[item] || 0) + count;
  data.采购批次.push({ item, count, remaining: count, serial: data.采购序号, storyTurn });
  prunePurchases(world);
}

function recordEvent(world, action, uid, storyTurn) {
  if (!['camp', 'care'].includes(action) || !Number.isSafeInteger(storyTurn) || storyTurn < 1) return;
  ensure(world);
  const data = world.委托;
  data.事件序号 += 1;
  data.事件.push({ serial: data.事件序号, action, uid: String(uid || ''), storyTurn, location: world.地图?.节点 || '' });
  if (data.事件.length > MAX_EVENTS) data.事件.splice(0, data.事件.length - MAX_EVENTS);
}

function recordVisit(world, node) {
  const data = world?.委托;
  if (!data || !nodes.has(node)) return world;
  if (!data.探访次数 || typeof data.探访次数 !== 'object' || Array.isArray(data.探访次数)) data.探访次数 = {};
  const previous = Number.isSafeInteger(data.探访次数[node]) && data.探访次数[node] >= 0 ? data.探访次数[node] : 0;
  if (previous >= 1000000) throw new Error('该地点探访次数已达到上限。');
  data.探访次数[node] = previous + 1;
  if (!Array.isArray(data.探访地点)) data.探访地点 = [];
  if (!data.探访地点.includes(node)) data.探访地点.push(node);
  return world;
}

function prompt(world) {
  const definitions = allQuests(world);
  const local = definitions.filter(quest => quest.location === world?.地图?.节点).map(quest => ({ id: quest.id, npcId: quest.npcId, npcName: quest.npcName, location: quest.location, title: quest.title, description: quest.description, objective: quest.objective, rewardPreview: quest.rewardPreview, status: world.委托?.记录?.[quest.id]?.status || 'available' }));
  const active = definitions.filter(quest => ['active', 'ready'].includes(world.委托?.记录?.[quest.id]?.status)).map(quest => ({ id: quest.id, title: quest.title, npcName: quest.npcName, location: quest.location, objective: quest.objective, progress: world.委托.记录[quest.id].progress, status: world.委托.记录[quest.id].status, rewardPreview: quest.rewardPreview }));
  const deep = (world?.任务 || []).filter(task => task?.category === 'deep-quest').map(task => ({ questId: task.questId, title: task.标题, status: task.状态, stage: task.阶段, objective: task.objective, progress: task.进度, target: task.目标, ending: task.ending }));
  return '【NPC委托权威上下文】委托接取、进度、物品交付与奖励只由后台MVU记录；叙事不得自行宣布完成或发放奖励。玩家向当前地点列出的委托人明确接取后才开始累计。深度委托阶段、永久机制解锁与奖励结算都以后台记录为准。纪念品只是收藏，不产生战斗效果。\n' + JSON.stringify({ location: world?.地图?.节点, local, active, deep }).slice(0, 7000);
}

module.exports = { ensure, validate, refresh, options, apply, actionResult, prompt, generationContext, localGeneratedCandidates, addGeneratedOffers, definitions: world => clone(allQuests(ensure(clone(world)))), recordPurchase, recordEvent, recordVisit, quests: clone(quests), MAX_ACTIVE, MAX_GENERATED_PER_CALL };
