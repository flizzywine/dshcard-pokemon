'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const mvu = require('../mvu.cjs');
const gadgets = require('../quest-gadgets.cjs');
const npcQuests = require('../npc-quests.cjs');
const companionship = require('../companionship.cjs');

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
const rootWorld = variables => variables.stat_data['宝可梦'];

function functionSource(name) {
  let start = app.indexOf(`async function ${name}(`);
  if (start < 0) start = app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `app.js defines ${name}`);
  const open = app.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = open; i < app.length; i++) {
    const ch = app[i];
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return app.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

class Element {
  constructor(tagName) { this.tagName = tagName; this.children = []; this.listeners = {}; this.attributes = {}; this.textContent = ''; this.className = ''; this.disabled = false; this.title = ''; }
  appendChild(node) { this.children.push(node); return node; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  click() { if (!this.disabled) return this.listeners.click?.({ target: this }); }
  all() { return [this, ...this.children.flatMap(child => child.all())]; }
}

function harness(view, extra = {}) {
  const sent = [], toasts = [], list = new Element('div');
  let errorMessage = '';
  const node = view.locations.find(location => location.id === view.world.地图.节点);
  const context = {
    state: { world: view.world, gadgets: view.gadgets, taskFilter: null, busy: false },
    els: { tasksList: list }, nativeMode: true, embedded: true,
    document: { createElement: tag => new Element(tag) },
    first(object, keys, fallback) { for (const key of keys) if (object && object[key] !== undefined && object[key] !== null) return object[key]; return fallback; },
    currentLocation: () => node,
    sendBridgeMessage: message => sent.push(message), toast: message => toasts.push(message),
    api: async () => { throw new Error('test API is not configured'); },
    battleStatus: () => 'finished',
    showPersistentError: message => { errorMessage = message; },
    mvuRoot: world => world,
    items: [], machines: [], shop: null,
    ...extra,
  };
  const names = ['applyWorld', 'sendStageStoryIntent', 'questActionFor', 'deepQuestViewFor', 'taskStatusValue', 'taskMatchesLocation', 'performQuestAction', 'renderDeepQuestControls', 'renderTasks'];
  vm.runInNewContext(`${names.map(functionSource).join('\n')}\nglobalThis.runTasks=renderTasks;`, context);
  context.renderWorld = () => context.runTasks();
  return { context, list, sent, toasts, error: () => errorMessage };
}

function questHarness(variables, { apiGate } = {}) {
  const calls = [], initialView = mvu.worldView(variables);
  let currentVariables = variables, turn = rootWorld(variables).地图.轮次 || 1;
  const location = () => mvu.worldView(currentVariables).locations.find(item => item.id === rootWorld(currentVariables).地图.节点);
  const view = harness(initialView, {
    currentLocation: location,
    api: async (route, options) => {
      const body = JSON.parse(options.body); calls.push({ route, body });
      if (apiGate) await apiGate;
      currentVariables = mvu.theaterAction(currentVariables, body.action, { ...body.payload, storyTurn: ++turn });
      const response = mvu.worldView(currentVariables);
      response.questActionResult = npcQuests.actionResult(rootWorld(currentVariables), body.action, body.payload);
      return response;
    },
  });
  view.context.applyWorld = data => {
    view.context.state.world = data.world; view.context.state.gadgets = data.gadgets;
    view.context.tools = data.tools; view.context.shop = data.shop; view.context.locations = data.locations;
    view.context.renderWorld();
  };
  return {
    ...view, calls, variables: () => currentVariables,
    refresh() { const fresh = mvu.worldView(currentVariables); view.context.state.world = fresh.world; view.context.state.gadgets = fresh.gadgets; view.context.renderWorld(); },
  };
}

function findButton(view, phrase) {
  return view.list.all().find(node => node.tagName === 'button' && node.textContent.includes(phrase));
}

function readyStoryVariables() {
  let variables = mvu.ensureEncounter(mvu.createInitialMvu(1), 1);
  variables = mvu.chooseStarter(variables, 1);
  const world = rootWorld(variables);
  world.战斗.状态 = 'finished';
  return variables;
}

test('task filters default to active work, show real counts, and do not create a story action', () => {
  const viewData = mvu.worldView(mvu.createInitialMvu(1));
  const view = harness(viewData);
  view.context.runTasks();
  const filters = view.list.all().filter(node => node.className === 'task-filter');
  assert.equal(filters.length, 4);
  const active = filters.find(button => button.textContent.startsWith('进行中 '));
  const expectedActive = viewData.world.任务.filter(task => task.状态 === '进行中').length;
  assert.equal(active.textContent, `进行中 ${expectedActive}`);
  assert.equal(active.attributes['aria-pressed'], 'true');
  assert.ok(view.list.all().some(node => node.className === 'task-row'));

  findButton(view, '全部 ').click();
  assert.equal(view.list.all().filter(node => node.className === 'task-row').length, viewData.world.任务.length);
  assert.equal(view.sent.length, 0, 'opening and filtering the journal never sends RP input');
  assert.match(css, /\.task-filter\[aria-pressed=true\]/);
});

test('when no task is active, the journal defaults to the current-location filter', () => {
  const viewData = mvu.worldView(mvu.createInitialMvu(1));
  viewData.gadgets.quests = [];
  viewData.world.任务 = [
    {id:'finished-local', 标题:'已结束的本地委托', 状态:'已完成', 委托地点ID:'pallet'},
    {id:'finished-away', 标题:'已结束的远方委托', 状态:'已完成', 委托地点ID:'viridian'},
  ];
  const view = harness(viewData);
  view.context.runTasks();
  const selected = view.list.all().find(node => node.className === 'task-filter' && node.attributes['aria-pressed'] === 'true');
  assert.equal(selected.textContent, '当前地点 1');
  assert.equal(view.list.all().filter(node => node.className === 'task-row').length, 1);
  assert.equal(view.sent.length, 0);
});

test('deep-quest choice directly accepts through the real MVU scene API and preserves choiceId', async () => {
  const variables = readyStoryVariables();
  const before = structuredClone(rootWorld(variables).委托.深度记录);
  const viewData = mvu.worldView(variables);
  const actualQuest = viewData.gadgets.quests.find(quest => quest.id === 'oak-open-field');
  assert.equal(actualQuest.status, 'unaccepted');
  assert.equal(actualQuest.choices.some(choice => choice.enabled), true);
  assert.equal(actualQuest.currentStage.title, '走出研究室');
  assert.equal(actualQuest.choices.some(choice => choice.id === 'private' && choice.enabled), true);

  const view = questHarness(variables);
  view.context.runTasks();
  findButton(view, '全部 ').click();
  const row = view.list.all().find(node => node.className === 'task-row' && node.children[0]?.textContent === actualQuest.title);
  assert.ok(row);
  const rowText = row.all().map(node => node.textContent).join(' ');
  assert.match(rowText, /阶段 1 \/ 3/);
  assert.match(rowText, /沿常青森林的道路实地观察一次/);
  assert.match(rowText, /真新镇/);
  assert.match(rowText, /解锁全队经验分享装置/);
  assert.match(rowText, /保留为研究室内部笔记/);
  const privateChoice = row.all().find(node => node.className === 'task-choice-list').all().find(node => node.textContent.includes('保留为研究室内部笔记'));
  assert.ok(privateChoice);
  await privateChoice.all().find(node => node.className === 'task-deep-action').click();
  assert.equal(view.calls.length, 1);
  assert.equal(view.calls[0].route, '/api/scene');
  assert.equal(view.calls[0].body.action, 'deep-quest-accept');
  assert.equal(view.calls[0].body.payload.deepQuestId, 'oak-open-field');
  assert.equal(view.calls[0].body.payload.choiceId, 'private');
  assert.deepEqual(view.sent, [], 'quest actions do not queue RP/story-intent text');
  assert.equal(rootWorld(view.variables()).委托.深度记录['oak-open-field'].choiceId, 'private');
  assert.equal(rootWorld(view.variables()).训练家.金钱, rootWorld(variables).训练家.金钱, 'the no-fee branch does not charge coins');
  assert.deepEqual(rootWorld(variables).委托.深度记录, before, 'the original saved state stays unchanged');
});

test('ready deep commissions advance directly from a button using the real MVU action', async () => {
  let variables = readyStoryVariables();
  let world = gadgets.apply(rootWorld(variables), 'deep-quest-accept', {
    deepQuestId: 'oak-open-field', choiceId: 'private',
  }, { storyTurn: 1 });
  variables.stat_data['宝可梦'] = world;
  for (const node of ['route1', 'viridian', 'route2', 'viridian-forest', 'route2', 'viridian', 'route1', 'pallet']) variables = mvu.travel(variables, node);

  const viewData = mvu.worldView(variables);
  const quest = viewData.gadgets.quests.find(entry => entry.id === 'oak-open-field');
  assert.equal(quest.status, 'ready');
  assert.equal(quest.action.id, 'deep-quest-advance');
  assert.equal(quest.action.enabled, true);
  const view = questHarness(variables);
  view.context.state.taskFilter = 'all';
  view.context.runTasks();
  const row = view.list.all().find(node => node.className === 'task-row' && node.children[0]?.textContent === quest.title);
  const action = row.all().find(node => node.className === 'task-deep-action');
  assert.ok(action);
  assert.equal(action.textContent, '报告并推进阶段');
  await action.click();
  assert.equal(view.calls[0].route, '/api/scene');
  assert.equal(view.calls[0].body.action, 'deep-quest-advance');
  assert.deepEqual(view.calls[0].body.payload, quest.action.payload);
  assert.equal(rootWorld(view.variables()).委托.深度记录['oak-open-field'].stage, 1);
  assert.deepEqual(view.sent, []);
});

test('claim button settles the actual deep reward once, keeps the chosen branch, and uses no RP route', async () => {
  let variables = readyStoryVariables();
  const questId = 'oak-open-field';
  let world = gadgets.apply(rootWorld(variables), 'deep-quest-accept', {
    deepQuestId: questId, choiceId: 'private',
  }, { storyTurn: 1 });
  variables.stat_data['宝可梦'] = world;
  for (const node of ['route1', 'viridian', 'route2', 'viridian-forest', 'route2', 'viridian', 'route1', 'pallet']) variables = mvu.travel(variables, node);
  world = rootWorld(variables);
  gadgets.refresh(world, { storyTurn: 2 });
  world = gadgets.apply(world, 'deep-quest-advance', { deepQuestId: questId }, { storyTurn: 3 });

  for (const id of [4, 7]) {
    const caught = mvu.makeMon(id, 6, `caught-task-journal-${id}`, { wild: true });
    caught.收服来源 = 'wild'; caught.收服图鉴编号 = id; world.电脑.push(caught);
  }
  gadgets.refresh(world, { storyTurn: 4 });
  world = gadgets.apply(world, 'deep-quest-advance', { deepQuestId: questId }, { storyTurn: 5 });
  world = companionship.apply(world, 'bond', { uid: world.队伍[0].uid, mode: 'talk', storyTurn: 6 });

  variables.stat_data['宝可梦'] = world;
  const viewData = mvu.worldView(variables);
  const quest = viewData.gadgets.quests.find(entry => entry.id === questId);
  assert.equal(quest.status, 'ready');
  assert.equal(quest.action.id, 'deep-quest-claim');
  assert.deepEqual(JSON.parse(JSON.stringify(quest.action.payload)), { deepQuestId: questId, choiceId: 'private' });
  const rewardBefore = structuredClone(rootWorld(variables).背包.物品);
  const view = questHarness(variables);
  view.context.state.taskFilter = 'all';
  view.context.runTasks();
  const row = view.list.all().find(node => node.className === 'task-row' && node.children[0]?.textContent === quest.title);
  assert.ok(row.all().some(node => node.className === 'task-stage-line' && node.textContent.includes('阶段 3 / 3')));
  await row.all().find(node => node.className === 'task-deep-action').click();
  assert.equal(view.calls[0].route, '/api/scene');
  assert.equal(view.calls[0].body.action, 'deep-quest-claim');
  assert.deepEqual(view.calls[0].body.payload, { deepQuestId: questId, choiceId: 'private' });
  const after = rootWorld(view.variables());
  assert.equal(after.委托.深度记录[questId].status, 'completed');
  assert.equal(after.委托.深度记录[questId].choiceId, 'private');
  assert.ok(after.机制奖励.已解锁.includes('partyExpShare'));
  assert.deepEqual(view.sent, [], 'claim does not go through plan, intent, or story input');
  assert.deepEqual(after.背包.物品, rewardBefore, 'this commission grants a permanent mechanism rather than duplicate consumables');
});

test('rejected quest actions leave the saved quest and inventory untouched', async () => {
  const variables = readyStoryVariables(), view = questHarness(variables);
  await view.context.performQuestAction('deep-quest-accept', { deepQuestId: 'oak-open-field', choiceId: 'private' });
  const before = structuredClone(rootWorld(view.variables()));
  await view.context.performQuestAction('deep-quest-claim', { deepQuestId: 'oak-open-field', choiceId: 'private' });
  assert.equal(rootWorld(view.variables()).委托.深度记录['oak-open-field'].status, 'active');
  assert.deepEqual(rootWorld(view.variables()).背包.物品, before.背包.物品);
  assert.deepEqual(rootWorld(view.variables()).机制奖励.已解锁, before.机制奖励.已解锁);
  assert.match(view.error(), /最终阶段尚未完成|当前场景不允许/);
});

test('busy state prevents duplicate requests while a quest action is pending', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const view = questHarness(readyStoryVariables(), { apiGate: gate });
  const first = view.context.performQuestAction('deep-quest-accept', { deepQuestId: 'oak-open-field', choiceId: 'private' });
  await Promise.resolve();
  assert.equal(view.context.state.busy, true);
  await view.context.performQuestAction('deep-quest-accept', { deepQuestId: 'oak-open-field', choiceId: 'private' });
  assert.equal(view.calls.length, 1);
  release(); await first;
  assert.equal(rootWorld(view.variables()).委托.深度记录['oak-open-field'].choiceId, 'private');
  assert.equal(view.context.state.busy, false);
});

