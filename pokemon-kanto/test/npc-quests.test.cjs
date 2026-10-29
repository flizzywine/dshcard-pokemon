'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const quests = require('../npc-quests.cjs');
const mvu = require('../mvu.cjs');

function worldAt(node = 'pallet') {
  const variables = mvu.createInitialMvu(1);
  const world = variables.stat_data.宝可梦;
  world.剧情.初始御三家已选 = true;
  world.战斗.状态 = 'finished';
  world.遭遇 = null;
  world.地图.轮次 = 7;
  world.地图.节点 = node;
  world.地图.地点 = mvu.worldView(variables).locations.find(item => item.id === node).name;
  return mvu.ensureMvuDefaults(variables);
}
const root = variables => variables.stat_data.宝可梦;
const questOption = (variables, id, action = 'quest-accept') => mvu.worldView(variables).theater.options.find(option => option.id === action && option.payload?.questId === id);
const act = (variables, id, action, turn = 10) => mvu.theaterAction(variables, action, { questId: id, storyTurn: turn });
const applyQuestDirect = (variables, id, action, turn = 10) => {
  const next = structuredClone(variables);
  next.stat_data.宝可梦 = quests.apply(next.stat_data.宝可梦, action, { questId: id }, { storyTurn: turn });
  return next;
};

test('the catalog has at least 20 stable Kanto NPC commissions with valid locations, portraits and rewards', () => {
  assert.ok(quests.quests.length >= 20);
  assert.equal(new Set(quests.quests.map(item => item.id)).size, quests.quests.length);
  const map = new Set(mvu.worldView(worldAt()).locations.map(item => item.id));
  const trainers = require('../public/data/trainers.json');
  const ids = new Set(trainers.map(item => item.id));
  const items = new Set(require('../public/data/items.json').map(item => item.id));
  for (const quest of quests.quests) {
    assert.ok(map.has(quest.location), quest.id);
    assert.ok(ids.has(quest.npcId), quest.id);
    assert.ok(quest.npcName && quest.description && quest.rewardPreview, quest.id);
    assert.ok(quest.reward.coins >= 1000, `${quest.id} should offer meaningful travel pay`);
    for (const item of Object.keys(quest.reward.items || {})) assert.ok(items.has(item), `${quest.id} reward item ${item}`);
    if (quest.objective.kind === 'deliver') assert.ok(items.has(quest.objective.item), quest.id);
  }
});

test('quests stay separate from main and user-created tasks and reveal only at their Kanto town', () => {
  const variables = worldAt('pallet');
  root(variables).任务.push({ id: 'user-note', 标题: '自定义目标' });
  const upgraded = mvu.ensureMvuDefaults(variables);
  const tasks = root(upgraded).任务;
  assert.ok(tasks.some(item => item.id === 'choose-starter'));
  assert.ok(tasks.some(item => item.id === 'user-note'));
  assert.ok(tasks.some(item => item.id === 'npc-quest:oak-field-notes' && item.状态 === '未接取'));
  assert.ok(questOption(upgraded, 'oak-field-notes'));
  assert.equal(questOption(upgraded, 'cerulean-water-study'), undefined);
});

test('theater action accepts the selected second local quest, not the first option', () => {
  let variables = worldAt('pallet');
  const options = mvu.worldView(variables).theater.options.filter(option => option.id === 'quest-accept');
  assert.deepEqual(options.map(option => option.payload.questId), ['oak-field-notes', 'oak-route1-survey']);
  variables = mvu.theaterAction(variables, 'quest-accept', { questId: 'oak-route1-survey', storyTurn: 10 });
  const records = root(variables).委托.记录;
  assert.equal(records['oak-route1-survey'].status, 'active');
  assert.equal(records['oak-field-notes'], undefined);
  assert.equal(root(variables).任务.find(task => task.questId === 'oak-route1-survey').状态, '进行中');
  assert.equal(root(variables).任务.find(task => task.questId === 'oak-field-notes').状态, '未接取');
});

test('acceptance baselines prevent pre-existing catches or visits from completing tasks', () => {
  let variables = worldAt('pallet'), world = root(variables);
  const older = mvu.makeMon(10, 4, 'caught-old-caterpie'); older.收服来源 = 'wild';
  world.队伍.push(older);
  variables = mvu.ensureMvuDefaults(variables);
  variables = act(variables, 'oak-field-notes', 'quest-accept');
  assert.equal(root(variables).任务.find(item => item.questId === 'oak-field-notes').状态, '进行中');
  const fresh = mvu.makeMon(13, 4, 'caught-fresh-weedle'); fresh.收服来源 = 'wild';
  root(variables).队伍.push(fresh);
  variables = mvu.ensureMvuDefaults(variables);
  assert.equal(root(variables).任务.find(item => item.questId === 'oak-field-notes').进度, 1);
  assert.throws(() => applyQuestDirect(variables, 'oak-field-notes', 'quest-turn-in', 11), /尚未满足/);
});

test('adjacent exploration progresses a visit task, but it must be turned in at the assigning NPC', () => {
  let variables = worldAt('pallet');
  variables = act(variables, 'oak-route1-survey', 'quest-accept');
  variables = mvu.travel(variables, 'route1');
  assert.equal(root(variables).任务.find(item => item.questId === 'oak-route1-survey').状态, '可交付');
  assert.equal(questOption(variables, 'oak-route1-survey', 'quest-turn-in'), undefined);
  variables = mvu.travel(variables, 'pallet');
  assert.ok(questOption(variables, 'oak-route1-survey', 'quest-turn-in'));
  variables = act(variables, 'oak-route1-survey', 'quest-turn-in', 12);
  assert.equal(root(variables).任务.find(item => item.questId === 'oak-route1-survey').状态, '已完成');
  assert.equal(root(variables).背包.物品.potion, 4);
});

test('legacy visit history becomes counts and revisiting after acceptance completes an exploration quest', () => {
  let variables = worldAt('pallet'), world = root(variables);
  world.委托.探访地点.push('route1');
  delete world.委托.探访次数;
  variables = mvu.ensureMvuDefaults(variables);
  assert.equal(root(variables).委托.探访次数.route1, 1, 'legacy set history migrates to one recorded visit');
  variables = act(variables, 'oak-route1-survey', 'quest-accept');
  assert.equal(root(variables).委托.记录['oak-route1-survey'].baseline.visitCounts.route1, 1);
  assert.equal(root(variables).任务.find(item => item.questId === 'oak-route1-survey').状态, '进行中');
  variables = mvu.travel(variables, 'route1');
  assert.equal(root(variables).委托.探访次数.route1, 2);
  assert.equal(root(variables).任务.find(item => item.questId === 'oak-route1-survey').状态, '可交付');
});

test('post-accept purchase delivery consumes stock and grants its reward only once', () => {
  let variables = worldAt('celadon');
  root(variables).训练家.徽章 = ['岩石徽章', '蓝色徽章', '橙色徽章'];
  variables = mvu.ensureMvuDefaults(variables);
  variables = act(variables, 'celadon-stone-delivery', 'quest-accept');
  assert.throws(() => applyQuestDirect(variables, 'celadon-stone-delivery', 'quest-turn-in', 11), /尚未满足/);
  variables = mvu.buyItem(variables, 'firestone', 1);
  assert.equal(root(variables).任务.find(item => item.questId === 'celadon-stone-delivery').状态, '可交付');
  const money = root(variables).训练家.金钱;
  variables = act(variables, 'celadon-stone-delivery', 'quest-turn-in', 12);
  assert.equal(root(variables).背包.物品.firestone, 0);
  assert.equal(root(variables).训练家.金钱, money + 3400);
  assert.equal(root(variables).委托.纪念品.length, 1);
  assert.match(root(variables).背包.关键物品.at(-1).说明, /不提供战斗效果/);
  assert.throws(() => applyQuestDirect(variables, 'celadon-stone-delivery', 'quest-turn-in', 13), /已经完成/);
});

test('inventory owned before acceptance cannot be used as a purchased delivery', () => {
  let variables = worldAt('viridian');
  root(variables).背包.物品.pokeball += 2;
  variables = mvu.ensureMvuDefaults(variables);
  variables = act(variables, 'viridian-ball-delivery', 'quest-accept');
  assert.throws(() => applyQuestDirect(variables, 'viridian-ball-delivery', 'quest-turn-in', 11), /尚未满足/);
  assert.equal(root(variables).背包.物品.pokeball, 7);
});

test('bond, care, and camp progress comes from persisted companion records and authorized actions', () => {
  let variables = worldAt('saffron');
  variables = act(variables, 'saffron-bond', 'quest-accept');
  assert.equal(root(variables).任务.find(item => item.questId === 'saffron-bond').进度, 0);
  const uid = root(variables).队伍[0].uid;
  variables = mvu.theaterAction(variables, 'bond', { uid, mode: 'talk', storyTurn: 11 });
  variables = mvu.ensureMvuDefaults(variables);
  assert.equal(root(variables).任务.find(item => item.questId === 'saffron-bond').进度, 2);
  assert.equal(root(variables).委托.事件.length, 0, 'bond cannot masquerade as camp/care event');

  variables = worldAt('lavender');
  variables = act(variables, 'lavender-care', 'quest-accept');
  variables = mvu.theaterAction(variables, 'care', { uid: root(variables).队伍[0].uid, mode: 'comfort', storyTurn: 11 });
  variables = mvu.ensureMvuDefaults(variables);
  assert.equal(root(variables).任务.find(item => item.questId === 'lavender-care').状态, '可交付');

  variables = worldAt('vermilion');
  variables = act(variables, 'vermilion-camp', 'quest-accept');
  variables = mvu.travel(variables, 'route11');
  variables = mvu.theaterAction(variables, 'camp', { storyTurn: 11 });
  variables = mvu.ensureMvuDefaults(variables);
  assert.equal(root(variables).任务.find(item => item.questId === 'vermilion-camp').状态, '可交付');
});

test('catch-type, distinct dex, badge and League goals derive from actual post-accept state', () => {
  let variables = worldAt('cerulean');
  variables = act(variables, 'cerulean-water-study', 'quest-accept');
  const squirtle = mvu.makeMon(7, 5, 'caught-water-study'); squirtle.收服来源 = 'wild'; squirtle.收服图鉴编号 = 7;
  root(variables).队伍.push(squirtle);
  variables = mvu.ensureMvuDefaults(variables);
  assert.equal(root(variables).任务.find(item => item.questId === 'cerulean-water-study').状态, '可交付');

  variables = worldAt('lavender');
  variables = act(variables, 'lavender-dex', 'quest-accept');
  for (const [id, uid] of [[10, 'caught-dex10'], [13, 'caught-dex13']]) {
    const mon = mvu.makeMon(id, 4, uid); mon.收服来源 = 'wild'; mon.收服图鉴编号 = id; root(variables).队伍.push(mon);
  }
  variables = mvu.ensureMvuDefaults(variables);
  assert.equal(root(variables).任务.find(item => item.questId === 'lavender-dex').进度, 2);

  variables = worldAt('saffron');
  variables = act(variables, 'saffron-badge', 'quest-accept');
  root(variables).训练家.徽章.push('岩石徽章', '蓝色徽章');
  variables = mvu.ensureMvuDefaults(variables);
  assert.equal(root(variables).任务.find(item => item.questId === 'saffron-badge').状态, '可交付');

  variables = worldAt('indigo');
  root(variables).训练家.徽章 = ['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章','深红徽章','绿色徽章'];
  variables = mvu.ensureMvuDefaults(variables);
  variables = act(variables, 'indigo-champion', 'quest-accept');
  root(variables).剧情.联盟进度 = 5;
  variables = mvu.ensureMvuDefaults(variables);
  assert.equal(root(variables).任务.find(item => item.questId === 'indigo-champion').状态, '可交付');
});

test('active cap and battle state block accepting and delivering commissions', () => {
  let variables = worldAt('pallet');
  for (const [i, questId] of ['oak-field-notes', 'oak-route1-survey', 'viridian-poison-study', 'pewter-rock-specimen'].entries()) {
    const world = root(variables), definition = quests.quests.find(item => item.id === questId);
    world.地图.节点 = definition.location;
    variables = applyQuestDirect(variables, questId, 'quest-accept', 10 + i);
  }
  root(variables).地图.节点 = 'cerulean';
  assert.equal(questOption(variables, 'cerulean-water-study')?.enabled, false);
  root(variables).战斗.状态 = 'active';
  assert.throws(() => applyQuestDirect(variables, 'oak-field-notes', 'quest-turn-in', 14), /战斗中/);
});

test('acceptance is only possible after starter selection and with no pending battle', () => {
  let variables = worldAt('pallet');
  root(variables).剧情.初始御三家已选 = false;
  assert.equal(questOption(variables, 'oak-field-notes'), undefined);
  assert.throws(() => applyQuestDirect(variables, 'oak-field-notes', 'quest-accept'), /先选择/);
  root(variables).剧情.初始御三家已选 = true;
  root(variables).战斗.状态 = 'pending';
  assert.equal(questOption(variables, 'oak-field-notes'), undefined);
});

test('quest refresh is idempotent across reloads and task text accurately distinguishes states', () => {
  let variables = worldAt('pallet');
  variables = act(variables, 'oak-route1-survey', 'quest-accept');
  const first = structuredClone(root(mvu.ensureMvuDefaults(variables)).任务);
  const second = structuredClone(root(mvu.ensureMvuDefaults(mvu.ensureMvuDefaults(variables))).任务);
  assert.deepEqual(second, first);
  assert.equal(first.find(item => item.questId === 'oak-route1-survey').状态, '进行中');
  assert.equal(first.find(item => item.questId === 'cerulean-water-study').状态, '未接取');
});

test('generationContext offers only local, grounded objectives and bounded reward tiers', () => {
  const context = quests.generationContext(root(worldAt('cerulean')));
  assert.equal(context.eligible, true);
  assert.deepEqual(context.location, { id: 'cerulean', name: '华蓝市' });
  assert.ok(context.npc.id && context.npc.name);
  assert.ok(context.objectiveOptions.some(item => item.id === 'visit-route24'));
  assert.ok(context.objectiveOptions.some(item => item.id === 'type-grass'));
  assert.ok(context.objectiveOptions.some(item => item.id === 'deliver-pokeball'));
  assert.ok(context.rewardOptions.every(item => ['modest','standard','generous','supplies','keepsake'].includes(item.id)));
  assert.ok(context.limits.offersPerCall <= 2);
  const field = quests.generationContext(root(worldAt('route1')));
  assert.equal(field.eligible, false);
  assert.equal(field.objectiveOptions.length, 0);
});

test('generated visit objectives honor actual water and cycling-road gates', () => {
  const water = root(worldAt('fuchsia'));
  const original = structuredClone(water);
  assert.ok(!quests.generationContext(water).objectiveOptions.some(item => item.id === 'visit-route19'));
  assert.deepEqual(water, original, 'previewing offers must not modify MVU');
  water.训练家.徽章.push('粉红徽章');
  water.队伍[0].招式.push({id:'surf',PP:15,PP上限:15});
  assert.ok(quests.generationContext(water).objectiveOptions.some(item => item.id === 'visit-route19'));
  const cyclist = root(worldAt('celadon'));
  assert.ok(!quests.generationContext(cyclist).objectiveOptions.some(item => item.id === 'visit-route16'));
  cyclist.背包.关键物品.push('bicycle');
  assert.ok(quests.generationContext(cyclist).objectiveOptions.some(item => item.id === 'visit-route16'));
});

test('generated offers use server-owned objectives and rewards, then complete from actual MVU progress', () => {
  let variables = worldAt('cerulean');
  const ctx = quests.generationContext(root(variables));
  variables.stat_data.宝可梦 = quests.addGeneratedOffers(root(variables), [
    { title: '北侧道路的见闻', description: '走访24号道路并记录沿途的环境变化。', objectiveId: 'visit-route24', rewardId: 'keepsake' },
  ], { storyTurn: 15 });
  const offer = root(variables).委托.随机委托[0];
  assert.match(offer.id, /^gen-cerulean-[a-f0-9]{12}$/);
  assert.equal(offer.npcId, ctx.npc.id);
  assert.deepEqual(offer.objective, { kind: 'visit', node: 'route24', target: 1 });
  assert.equal(offer.reward.coins, 1550);
  assert.match(offer.rewardPreview, /1550元/);
  assert.equal(offer.reward.souvenir.id.startsWith('souvenir-'), true);
  assert.ok(questOption(variables, offer.id));
  assert.ok(quests.definitions(root(variables)).some(item => item.id === offer.id));
  variables = mvu.theaterAction(variables, 'quest-accept', { questId: offer.id, storyTurn: 16 });
  variables = mvu.travel(variables, 'route24');
  assert.equal(root(variables).任务.find(item => item.questId === offer.id).状态, '可交付');
  variables = mvu.travel(variables, 'cerulean');
  variables = mvu.theaterAction(variables, 'quest-turn-in', { questId: offer.id, storyTurn: 17 });
  assert.equal(root(variables).任务.find(item => item.questId === offer.id).状态, '已完成');
  assert.equal(root(variables).委托.纪念品.length, 1);
});

test('quest action results reflect committed quest state instead of battle summaries', () => {
  let variables = worldAt('pallet');
  variables = mvu.theaterAction(variables, 'quest-accept', { questId: 'oak-route1-survey', storyTurn: 10 });
  const accepted = quests.actionResult(root(variables), 'quest-accept', { questId: 'oak-route1-survey' });
  assert.equal(accepted.type, 'accepted');
  assert.equal(accepted.questId, 'oak-route1-survey');
  assert.match(accepted.result, /记录1号道路/);
  assert.equal(accepted.summary, undefined);
});

test('generated candidates reject arbitrary targets, reward values, unsafe text, collisions and oversize batches atomically', () => {
  let variables = worldAt('pallet');
  const good = { title: '观察旅途伙伴', description: '走访1号道路，记录这段路上的环境和动静。', objectiveId: 'visit-route1', rewardId: 'standard' };
  for (const candidate of [
    { ...good, objectiveId: 'catch-151' },
    { ...good, reward: { coins: 999999 } },
    { ...good, rewardId: 'unlimited' },
    { ...good, title: '<img src=x>' },
    { ...good, title: '短' },
    { ...good, description: '太短' },
    { ...good, extra: 'unsafe field' },
  ]) assert.throws(() => quests.addGeneratedOffers(root(variables), [candidate], { storyTurn: 20 }));
  assert.equal(root(variables).委托.随机委托.length, 0, 'rejected generation never partially mutates world');
  assert.throws(() => quests.addGeneratedOffers(root(variables), [good, { ...good, title: '另一份道路观察' } , { ...good, title: '第三份道路观察' }], { storyTurn: 20 }), /最多/);
  variables.stat_data.宝可梦 = quests.addGeneratedOffers(root(variables), [good], { storyTurn: 20 });
  const existing = structuredClone(root(variables).委托.随机委托[0]);
  assert.throws(() => quests.addGeneratedOffers(root(variables), [good], { storyTurn: 21 }), /已存在/);
  assert.deepEqual(root(variables).委托.随机委托[0], existing, 'duplicates cannot overwrite an existing offer');
});

test('generated offers stay within the per-call and per-town lifetime caps', () => {
  let variables = worldAt('pallet');
  const make = (n, objectiveId) => ({ title: `旅途观察委托${n}`, description: `沿1号道路观察第${n}处环境，回来向大木博士报告发现。`, objectiveId, rewardId: 'modest' });
  variables.stat_data.宝可梦 = quests.addGeneratedOffers(root(variables), [make(1, 'visit-route1'), make(2, 'caught-1')], { storyTurn: 30 });
  variables.stat_data.宝可梦 = quests.addGeneratedOffers(root(variables), [make(3, 'dex-1'), make(4, 'bond-2')], { storyTurn: 31 });
  assert.equal(root(variables).委托.随机委托.length, 4);
  assert.equal(quests.generationContext(root(variables)).eligible, false);
  assert.throws(() => quests.addGeneratedOffers(root(variables), [make(5, 'care-1')], { storyTurn: 32 }), /上限/);
});

test('late one-time badge and league milestones remain claimable exactly once',()=>{
 for(const [node,id,field,value] of [['saffron','saffron-badge','badge',7],['indigo','indigo-champion','league',5]]){
  let v=worldAt(node),w=root(v);w.训练家.徽章=['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章','深红徽章','绿色徽章'].slice(0,field==='badge'?value:8);if(field==='league')w.剧情.联盟进度=value;
  v=act(v,id,'quest-accept');assert.equal(root(v).委托.记录[id].status,'ready');v=act(v,id,'quest-turn-in',11);assert.throws(()=>applyQuestDirect(v,id,'quest-turn-in',12),/已经完成/);
 }
});

test('eligible purchase receipts survive pruning and legacy baselines exclude earlier purchases',()=>{
 let v=worldAt('celadon'),w=root(v);w.训练家.徽章=['岩石徽章','蓝色徽章','橙色徽章'];quests.recordPurchase(w,'firestone',1,9);w.背包.物品.firestone=1;
 v=act(v,'celadon-stone-delivery','quest-accept',10);w=root(v);delete w.委托.记录['celadon-stone-delivery'].baseline.purchaseSerial;
 v=mvu.ensureMvuDefaults(v);w=root(v);assert.equal(w.委托.记录['celadon-stone-delivery'].status,'active');
 quests.recordPurchase(w,'firestone',1,11);w.背包.物品.firestone++;
 for(let i=0;i<205;i++)quests.recordPurchase(w,'potion',1,12+i);
 v=mvu.ensureMvuDefaults(v);assert.equal(root(v).委托.记录['celadon-stone-delivery'].status,'ready');
 v=act(v,'celadon-stone-delivery','quest-turn-in',300);assert.equal(root(v).背包.物品.firestone,1);assert.throws(()=>applyQuestDirect(v,'celadon-stone-delivery','quest-turn-in',301),/已经完成/);
});
