'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mvu = require('../mvu.cjs');
const actions = require('../gadget-actions.cjs');
const worldOf = variables => variables.stat_data.宝可梦;
const makeWorld = () => worldOf(mvu.createInitialMvu());

test('field view only lists locally encountered species and owned compatible TMs', () => {
  const world = makeWorld();
  world.地图.节点 = 'route1';
  world.机制奖励.已解锁.push('fieldRadar','fieldRadarPlus','trainingTerminal');
  world.背包.物品.tm06 = 1;
  const view = actions.view(world, {type:'Normal'});
  assert.deepEqual(view.ecology.species.map(species => species.id), [16,19]);
  assert.deepEqual(view.ecology.species[0].types, ['Normal','Flying']);
  assert.deepEqual(view.terminal.machines.map(machine => machine.id), ['tm06']);
  assert.ok(view.terminal.machines[0].learners.some(learner => learner.uid === world.队伍[0].uid));
  assert.equal(world.机制奖励.操作记录, undefined, 'view does not mutate the input world');
});

test('basic camp rest adds half max HP and five PP without reviving or curing status', () => {
  const world = makeWorld();
  world.地图.节点 = 'route1'; world.战斗.状态 = 'finished'; world.地图.轮次 = 12;
  world.机制奖励.已解锁.push('campKit');
  const mon = world.队伍[0], move = mon.招式[0];
  mon.当前HP = mon.能力值.hp - 10; mon.状态 = 'psn'; move.PP = Math.max(0, move.PP上限 - 8);
  const fainted = mvu.makeMon(16, 5, 'fainted-camp'); fainted.当前HP = 0; world.队伍.push(fainted);
  const rested = actions.apply(world, 'gadget-camp-rest', {}, {storyTurn:12});
  const recovered = rested.队伍.find(entry => entry.uid === mon.uid);
  assert.equal(recovered.当前HP, Math.min(recovered.能力值.hp, mon.能力值.hp - 10 + Math.floor(mon.能力值.hp / 2)));
  assert.equal(recovered.招式[0].PP, Math.min(recovered.招式[0].PP上限, move.PP上限 - 8 + 5));
  assert.equal(recovered.状态, 'psn');
  assert.equal(rested.队伍.find(entry => entry.uid === fainted.uid).当前HP, 0);
  assert.equal(rested.委托.事件.at(-1).action, 'camp');
  assert.throws(() => actions.apply(rested, 'gadget-camp-rest', {}, {storyTurn:12}), /本故事轮次/);
  assert.equal(world.机制奖励.操作记录?.营地轮次, undefined, 'rejected or successful calls never mutate the caller input');
});

test('camp upgrade fully restores survivors and major status but still never revives', () => {
  const world = makeWorld();
  world.地图.节点 = 'route1'; world.战斗.状态 = 'finished'; world.机制奖励.已解锁.push('campKit','campKitPlus');
  const mon = world.队伍[0]; mon.当前HP = 1; mon.状态 = 'par'; mon.招式[0].PP = 0;
  const down = mvu.makeMon(16, 5, 'down-camp'); down.当前HP = 0; world.队伍.push(down);
  const rested = actions.apply(world, 'gadget-camp-rest', {}, {storyTurn:20});
  const survivor = rested.队伍.find(entry => entry.uid === mon.uid);
  assert.equal(survivor.当前HP, survivor.能力值.hp);
  assert.equal(survivor.状态, '');
  assert.ok(survivor.招式.every(move => move.PP === move.PP上限));
  assert.equal(rested.队伍.find(entry => entry.uid === down.uid).当前HP, 0);
});

test('move recall uses current-level FRLG level-up moves, protects HMs, and limits successful recall to once per turn', () => {
  const world = makeWorld(); world.战斗.状态 = 'finished';
  world.机制奖励.已解锁.push('trainingTerminal','terminalArchive');
  const mon = world.队伍[0]; mon.等级 = 10; mon.经验 = Math.max(mon.经验, mvu.expAt(10, mon.图鉴编号));
  mon.能力值 = mvu.stats(mon); mon.当前HP = mon.能力值.hp;
  const candidate = actions.currentLevelMoves(mon).find(move => move.id === 'vinewhip');
  assert.ok(candidate && candidate.level <= mon.等级);
  const invalid = structuredClone(world);
  assert.throws(() => actions.apply(invalid, 'gadget-recall', {uid:mon.uid,move:'earthquake'}, {storyTurn:30}), /不能通过FRLG升级招式表/);
  const hm = require('../engine.cjs').catalog.moves.cut;
  mon.招式[0] = {id:'cut',PP:hm.pp,PP上限:hm.pp,秘传:true};
  assert.throws(() => actions.apply(world, 'gadget-recall', {uid:mon.uid,move:candidate.id,slot:1}, {storyTurn:30}), /秘传招式不能/);
  mon.招式[0] = {id:'tackle',PP:catalogPP('tackle'),PP上限:catalogPP('tackle')};
  const recalled = actions.apply(world, 'gadget-recall', {uid:mon.uid,move:candidate.id}, {storyTurn:30});
  assert.equal(recalled.队伍[0].招式.at(-1).id, candidate.id, 'underfull movesets append when no slot is specified');
  assert.equal(recalled.机制奖励.操作记录.回忆轮次, 30);
  assert.throws(() => actions.apply(recalled, 'gadget-recall', {uid:mon.uid,move:'leechseed'}, {storyTurn:30}), /已经使用过/);
  mvu.validateMvu({stat_data:{宝可梦:recalled}});
});

test('machine research requires an unlocked terminal and compatible owned TM; free permit refunds only terminal use', () => {
  const world = makeWorld(); world.战斗.状态 = 'finished';
  world.机制奖励.已解锁.push('trainingTerminal'); world.背包.物品.tm06 = 1;
  const mon = world.队伍[0], itemBefore = world.背包.物品.tm06;
  assert.equal(actions.view(world).terminal.machines[0].nameZh,'TM06 剧毒');
  const learned = actions.apply(world, 'gadget-machine', {uid:mon.uid,item:'tm06'}, {storyTurn:40});
  assert.ok(learned.队伍[0].招式.some(move => move.id === 'toxic'));
  assert.equal(learned.背包.物品.tm06, itemBefore - 1);
  assert.equal(world.背包.物品.tm06, itemBefore, 'failed or successful actions leave the caller input untouched');

  world.机制奖励.已解锁.push('researchTerminalFreeTM');
  world.队伍[0].招式 = world.队伍[0].招式.filter(move => move.id !== 'toxic');
  world.背包.物品.tm06 = 1;
  const free = actions.apply(world, 'gadget-machine', {uid:mon.uid,item:'tm06'}, {storyTurn:41});
  assert.equal(free.背包.物品.tm06, 1);
  assert.ok(free.队伍[0].招式.some(move => move.id === 'toxic'));
  assert.throws(() => actions.apply(world, 'gadget-machine', {uid:mon.uid,item:'hm01'}, {storyTurn:42}), /只支持FRLG兼容TM/);
  const incompatible = mvu.makeMon(7,5,'water-only'); world.队伍.push(incompatible); world.背包.物品.tm02 = 1;
  assert.throws(() => actions.apply(world, 'gadget-machine', {uid:incompatible.uid,item:'tm02'}, {storyTurn:43}), /不兼容/);
  assert.equal(world.背包.物品.tm02, 1, 'rejected machine actions spend nothing');
});

function catalogPP(id) { return require('../engine.cjs').catalog.moves[id].pp; }
