'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const mvu = require('../mvu.cjs');

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
  constructor(tagName) { this.tagName = tagName; this.children = []; this.listeners = {}; this.className = ''; this.textContent = ''; this.disabled = false; this.title = ''; }
  appendChild(node) { this.children.push(node); return node; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute() {}
  addEventListener(name, callback) { this.listeners[name] = callback; }
  click() { if (!this.disabled) return this.listeners.click?.({ target: this }); }
  all() { return [this, ...this.children.flatMap(child => child.all())]; }
}

function variablesAtViridian() {
  let variables = mvu.ensureEncounter(mvu.createInitialMvu(1), 1);
  variables = mvu.chooseStarter(variables, 1);
  const world = variables.stat_data['宝可梦'];
  world.战斗.状态 = 'finished'; world.遭遇 = null;
  world.地图.节点 = 'viridian';
  world.地图.地点 = '常青市';
  return mvu.ensureMvuDefaults(variables);
}

test('bag delivery control settles a real post-accept purchase through the MVU scene endpoint', async () => {
  let variables = variablesAtViridian(), turn = 10;
  variables = mvu.theaterAction(variables, 'quest-accept', { questId: 'viridian-ball-delivery', storyTurn: turn++ });
  variables = mvu.buyItem(variables, 'pokeball', 2);
  const viewData = mvu.worldView(variables), bag = new Element('div'), calls = [], errorMessages = [];
  const context = {
    state: { world: viewData.world, gadgets: viewData.gadgets, busy: false, items: viewData.items },
    els: { inventory: bag, errorText: new Element('p'), errorPanel: new Element('div'), retry: new Element('button') },
    document: { createElement: tag => new Element(tag) },
    nativeMode: true, embedded: true,
    currentLocation: () => mvu.worldView(variables).locations.find(node => node.id === variables.stat_data['宝可梦'].地图.节点),
    first(object, keys, fallback) { for (const key of keys) if (object && object[key] !== undefined && object[key] !== null) return object[key]; return fallback; },
    mvuRoot: world => world,
    battleStatus: () => 'finished',
    toast() {},
    showPersistentError(message) { errorMessages.push(message); },
    renderTasks() {},
    api: async (route, options) => {
      const body = JSON.parse(options.body); calls.push({ route, body });
      variables = mvu.theaterAction(variables, body.action, { ...body.payload, storyTurn: turn++ });
      return mvu.worldView(variables);
    },
  };
  context.els = {mvuJson:{parentElement:{open:false}}};
  const names = ['renderMvuJson', 'applyWorld', 'questActionFor', 'deepQuestViewFor', 'performQuestAction', 'renderQuestDeliveries'];
  vm.runInNewContext(`${names.map(functionSource).join('\n')}\nglobalThis.deliver=renderQuestDeliveries;`, context);
  context.renderWorld = () => {};
  context.deliver(bag);
  const button = bag.all().find(node => node.tagName === 'button');
  assert.ok(button, 'bag shows a ready commission hand-in');
  assert.equal(button.textContent, '交付委托：补给精灵球');
  const worldBefore = variables.stat_data['宝可梦'];
  const moneyBefore = worldBefore.训练家.金钱;
  const ballsBefore = worldBefore.背包.物品.pokeball;
  assert.equal(worldBefore.委托.记录['viridian-ball-delivery'].status, 'ready');
  await button.click();
  const after = variables.stat_data['宝可梦'];
  assert.equal(calls.length, 1);
  assert.equal(calls[0].route, '/api/scene');
  assert.equal(calls[0].body.action, 'quest-turn-in');
  assert.deepEqual(calls[0].body.payload, { questId: 'viridian-ball-delivery' });
  assert.equal(after.背包.物品.pokeball, ballsBefore - 2);
  assert.equal(after.训练家.金钱, moneyBefore + 1600);
  assert.equal(after.委托.记录['viridian-ball-delivery'].status, 'completed');
  assert.equal(after.委托.纪念品.some(item => item.id === 'viridian-supply-tag'), true);
  assert.deepEqual(errorMessages, []);
});
