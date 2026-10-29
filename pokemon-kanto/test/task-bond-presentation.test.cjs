'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const mvu = require('../mvu.cjs');
const npcQuests = require('../npc-quests.cjs');

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

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
  constructor(tagName) { this.tagName = tagName; this.children = []; this.listeners = {}; this.attributes = {}; this.textContent = ''; this.className = ''; this.value = 0;this.classList={add:value=>{this.className+=' '+value;}};this.style={setProperty(){}}; }
  appendChild(node) { this.children.push(node); return node; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  click() { if (!this.disabled) return this.listeners.click?.({ target: this }); }
  all() { return [this, ...this.children.flatMap(child => child.all())]; }
}

function harness(extra = {}) {
  const sent = [], toasts = [], root = new Element('div');
  const context = {
    state: { world: null, gadgets: null, taskFilter: 'all', busy: false },
    els: { tasksList: root },
    nativeMode: true, embedded: true,
    document: { createElement: tag => new Element(tag) },
    first(object, keys, fallback) {
      for (const key of keys) if (object && object[key] !== undefined && object[key] !== null) return object[key];
      return fallback;
    },
    currentLocation: () => ({ id: 'pewter', name: '尼比市', kind: 'town' }),
    sendBridgeMessage: message => sent.push(message),
    toast: text => toasts.push(text),
    api: async () => { throw new Error('test API is not configured'); },
    battleStatus: () => 'finished', showPersistentError: () => {}, mvuRoot: world => world,
    Object,
    ...extra,
  };
  const sources = ['applyWorld', 'companionBondFor', 'renderCompanionBond', 'sendStageStoryIntent', 'questActionFor', 'deepQuestViewFor', 'taskStatusValue', 'taskMatchesLocation', 'performQuestAction', 'renderTasks'].map(functionSource).join('\n');
  vm.runInNewContext(`${sources}\nglobalThis.runTasks=renderTasks;globalThis.bondFor=companionBondFor;globalThis.renderBond=renderCompanionBond;globalThis.intent=sendStageStoryIntent;globalThis.questAction=questActionFor;`, context);
  context.renderWorld = () => context.runTasks();
  return { context, root, sent, toasts };
}

function variablesAt(nodeId) {
  let variables = mvu.ensureEncounter(mvu.createInitialMvu(1), 1);
  variables = mvu.chooseStarter(variables, 1);
  const world = variables.stat_data['宝可梦'];
  world.战斗.状态 = 'finished'; world.遭遇 = null;
  world.地图.节点 = nodeId;
  world.地图.地点 = mvu.worldView(variables).locations.find(node => node.id === nodeId).name;
  return mvu.ensureMvuDefaults(variables);
}

function mvuHarness(initialVariables) {
  let variables = initialVariables, turn = variables.stat_data['宝可梦'].地图.轮次 || 1;
  const calls = [], initial = mvu.worldView(variables);
  const view = harness({
    currentLocation: () => mvu.worldView(variables).locations.find(node => node.id === variables.stat_data['宝可梦'].地图.节点),
    api: async (route, options) => {
      const body = JSON.parse(options.body); calls.push({ route, body });
      variables = mvu.theaterAction(variables, body.action, { ...body.payload, storyTurn: ++turn });
      return mvu.worldView(variables);
    },
  });
  view.context.state.world = initial.world; view.context.state.gadgets = initial.gadgets;
  view.context.state.locations = initial.locations;
  view.variables = () => variables; view.calls = calls;
  return view;
}

test('NPC委托卡展示实时信息并直接经MVU API接取，不创建故事草稿', async () => {
  const view = mvuHarness(variablesAt('pewter'));
  view.context.runTasks();
  const text = view.root.all().map(node => node.textContent).join(' ');
  assert.match(text, /委托人：小刚/);
  assert.match(text, /交付地点：尼比市/);
  assert.match(text, /奖励预告：1600元与好伤药×1/);
  const accept = view.root.all().find(node => node.className === 'task-quest-action');
  assert.ok(accept);
  assert.equal(accept.textContent, '接取委托');
  await accept.click();
  assert.equal(view.calls.length, 1);
  assert.equal(view.calls[0].route, '/api/scene');
  assert.equal(view.calls[0].body.action, 'quest-accept');
  assert.equal(view.calls[0].body.payload.questId, 'pewter-rock-specimen');
  assert.equal(view.variables().stat_data['宝可梦'].委托.记录['pewter-rock-specimen'].status, 'active');
  assert.deepEqual(view.sent, []);
});

test('NPC委托可交付时展示直接结算按钮，且只能在委托城镇显示', async () => {
  const view = harness();
  const task = { questId: 'pewter-mt-moon-map', category: 'npc-quest', 标题: '月见山路线勘察', 委托人: '登山男', 委托地点: '尼比市', 状态: '可交付' };
  assert.equal(view.context.questAction(task, { id: 'pewter', name: '尼比市', kind: 'town' }), 'quest-turn-in');
  assert.equal(view.context.questAction({ ...task, 状态: '进行中' }, { id: 'pewter', name: '尼比市', kind: 'town' }), '');
  assert.equal(view.context.questAction(task, { id: 'route3', name: '3号道路', kind: 'route' }), '');
  const localView = harness();
  let variables = variablesAt('pewter');
  variables = mvu.theaterAction(variables, 'quest-accept', { questId: 'pewter-mt-moon-map', storyTurn: 2 });
  variables = mvu.travel(variables, 'route3');
  variables = mvu.travel(variables, 'mt-moon');
  variables = mvu.travel(variables, 'route3');
  variables = mvu.travel(variables, 'pewter');
  const actualView = mvuHarness(variables), money = variables.stat_data['宝可梦'].训练家.金钱;
  actualView.context.runTasks();
  const turnIn = actualView.root.all().find(node => node.className === 'task-quest-action');
  assert.ok(turnIn);
  assert.equal(turnIn.textContent, '交付并领取奖励');
  await turnIn.click();
  assert.equal(actualView.calls[0].route, '/api/scene');
  assert.equal(actualView.calls[0].body.action, 'quest-turn-in');
  assert.equal(actualView.variables().stat_data['宝可梦'].委托.记录['pewter-mt-moon-map'].status, 'completed');
  assert.equal(actualView.variables().stat_data['宝可梦'].训练家.金钱, money + 1500);
  assert.deepEqual(actualView.sent, []);
  task.状态 = '可交付';
  view.context.state.world = { 任务: [task] };
  view.context.currentLocation = () => ({ id: 'route3', name: '3号道路', kind: 'route' });
  view.context.runTasks();
  assert.equal(view.root.all().some(node => node.className === 'task-quest-action'), false);
});

test('party bond display uses the Pokémon UID and offers a single whole-team camp action', () => {
  const view = harness();
  view.context.state.world = { 羁绊: { 伙伴: {
    'party-uid-1': { 信赖: 22, 心情: '安心', 共同记忆: [{ 故事轮次: 1, 事件: '较早的同行记忆' }, { 故事轮次: 2, 事件: '最近的同行记忆' }] },
    '25': { 信赖: 99, 心情: '勇敢', 共同记忆: [] },
  } } };
  const entry = { uid: 'party-uid-1', id: 25 };
  assert.deepEqual(JSON.parse(JSON.stringify(view.context.bondFor(entry))), {
    trust: 22, mood: '安心', memories: ['最近的同行记忆', '较早的同行记忆'],
  });
  const panel = view.context.renderBond(entry, '皮卡丘');
  assert.match(panel.all().map(node => node.textContent).join(' '), /信赖 22\/100/);
  assert.match(panel.all().map(node => node.textContent).join(' '), /心情 安心/);
  const button = panel.all().find(node => node.className === 'companion-bond-button');
  assert.ok(button);
  button.click();
  assert.deepEqual(JSON.parse(JSON.stringify(view.sent[0])), {
    type: 'story-intent', action: 'camp', payload: { mode:'rest' }, label: '与伙伴露营 / 休憩',
  });
  assert.equal(view.context.bondFor({ id: 25 }), null);
});

test('the companion card shows actual tier benefits, next progress and a bounded maximum-trust particle burst',()=>{
 const view=harness();view.context.state.world={设置:{bondBattleEffects:true},羁绊:{伙伴:{'same-species-different-uid':{信赖:100,心情:'安心',共同记忆:[]}}}};
 view.context.state.companionship={benefits:[{uid:'same-species-different-uid',trust:100,currentTier:'默契',experienceBonusPercent:20,campHpPercent:30,campPp:4,nextThreshold:null,battleEffects:{inboundAccuracyMultiplier:.95,critStageBonus:1}}]};
 const panel=view.context.renderBond({uid:'same-species-different-uid',id:4,亲密度:155},'小火龙'),text=panel.all().map(node=>node.textContent).join(' ');
 assert.match(text,/经验 \+20%/);assert.match(text,/30% HP/);assert.match(text,/每招 4 PP/);assert.match(text,/要害等级 \+1/);assert.match(text,/亲密度 155\/255/);
 assert.equal(panel.all().filter(node=>node.className==='companion-bond-mote').length,7);assert.equal(panel.all().filter(node=>node.className==='companion-bond-button').length,1);
 assert.equal(panel.all().find(node=>node.tagName==='progress').value,100);
});
