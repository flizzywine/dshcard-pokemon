'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
function fn(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `app contains ${name}`);
  const start = match.index, paren = source.indexOf('(', start); let parenDepth = 0, quote = '', escaped = false, close = -1;
  for (let i = paren; i < source.length; i++) {
    const ch = source[i];
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '(') parenDepth++;
    if (ch === ')' && --parenDepth === 0) { close = i; break; }
  }
  const open = source.indexOf('{', close); let depth = 0; quote = ''; escaped = false;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw Error(`unterminated ${name}`);
}

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.listeners = {}; this.hidden = false; this.disabled = false; this.className = ''; this.textContent = ''; this.value = ''; }
  setAttribute(name, value) { this.attributes[name] = value; }
  appendChild(child) { if (this.tagName === 'select' && !this.children.length && !this.value) this.value = child.value; this.children.push(child); return child; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  click() { if (!this.disabled) return this.listeners.click?.({ stopPropagation() {} }); }
  get options() { return this.tagName === 'select' ? this.children : undefined; }
}
function all(root) { return [root, ...root.children.flatMap(all)]; }
function byText(root, tagName, text) { return all(root).find(element => element.tagName === tagName && element.textContent === text); }

function fixture({ active = false, moves = 2 } = {}) {
  const mon = { uid: 'vulpix-1', 图鉴编号: 37, 昵称: '六尾', 携带道具: '', 招式: Array.from({ length: moves }, (_, i) => ({ id: i ? 'ember' : 'tackle', PP: 20, PP上限: 20 })) };
  const bag = { charcoal: 1, mysticwater: 1, firestone: 1, moonstone: 1 };
  const requests = [], errors = [], toasts = [];
  const state = { busy: false, world: { 队伍: [mon], 战斗: { 状态: active ? 'active' : 'pending' } } };
  const inventoryCatalog = [
    ['charcoal', { id: 'charcoal', name: '木炭', category: 'held' }], ['mysticwater', { id: 'mysticwater', name: '神秘水滴', category: 'held' }],
    ['firestone', { id: 'firestone', name: '火之石', category: 'evolution' }], ['moonstone', { id: 'moonstone', name: '月之石', category: 'evolution' }]
  ];
  const context = {
    document: { createElement: tag => new Element(tag) }, state,
    first: (object, keys, fallback) => { for (const key of keys) if (object?.[key] !== undefined && object[key] !== null) return object[key]; return fallback; },
    safeNum: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    battleStatus: () => active ? 'active' : 'pending',
    isHmMove: () => false, currentNodeId: () => 'pallet',
    speciesById: id => Number(id) === 37 ? { name: '六尾' } : null,
    moveById: id => ({ name: id === 'tackle' ? '撞击' : '火花' }),
    itemName: id => ({ charcoal: '木炭', mysticwater: '神秘水滴', firestone: '火之石', moonstone: '月之石' })[id] || id,
    catalogEntries: () => inventoryCatalog,
    itemCount: ([id]) => bag[id] || 0,
    nameOfMon: () => '六尾',
    getParty: () => [mon],
    api: async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return { world: state.world }; },
    applyWorld() {}, renderWorld() {}, toast: message => toasts.push(message),
    showPersistentError: message => errors.push(message)
  };
  const code = `const evolutionStonesBySpecies={firestone:[37,58,133],waterstone:[61,90,120,133],thunderstone:[25,133],leafstone:[44,70,102],moonstone:[30,33,35,39]};\n` + [fn('renderReleaseControl'), fn('renderMonManagement'), fn('managePartyAction')].join('\n') + '\nglobalThis.renderMonManagement=renderMonManagement;';
  vm.runInNewContext(code, context);
  return { root: context.renderMonManagement(mon, mon.招式, 37), requests, errors, toasts, mon };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('release sends nothing until the named permanent confirmation is accepted',async()=>{
 const view=fixture(),begin=byText(view.root,'button','放生'),yes=byText(view.root,'button','确认永久放生');
 yes.click();await tick();assert.equal(view.requests.length,0);
 begin.click();all(view.root).filter(el=>el.tagName==='button'&&el.textContent==='取消').at(-1).click();yes.click();await tick();assert.equal(view.requests.length,0);
 begin.click();yes.click();await tick();
 assert.equal(view.requests.length,1);assert.deepEqual({...view.requests[0].body},{operation:'release',uid:'vulpix-1',confirmed:true});
});

test('party lead control passes the selected monster UID and lead operation in API order', () => {
  assert.match(fn('renderParty'), /managePartyAction\(entry\.uid,\s*'lead'\)/);
});

test('party management asks before forgetting and sends the visible 1-based move slot', async () => {
  const view = fixture(), forget = byText(view.root, 'button', '忘掉所选');
  forget.click();
  const confirm = all(view.root).find(element => element.className === 'management-confirm');
  assert.equal(confirm.hidden, false);
  byText(confirm, 'button', '取消').click();
  assert.equal(confirm.hidden, true);
  forget.click(); byText(confirm, 'button', '确认忘掉').click(); await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(view.requests[0])), { url: '/api/party', body: { operation: 'forget', uid: 'vulpix-1', slot: 1 } });
});

test('held-item controls and evolution show only stocked catalog items valid for this species', async () => {
  const view = fixture();
  const selects = all(view.root).filter(element => element.tagName === 'select');
  const held = selects.find(select => select.attributes['aria-label'] === '六尾选择持有物');
  assert.deepEqual(held.options.map(option => option.value), ['', 'charcoal', 'mysticwater']);
  held.value = 'charcoal'; byText(view.root, 'button', '装备').click(); await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(view.requests[0])), { url: '/api/party', body: { operation: 'hold', uid: 'vulpix-1', itemId: 'charcoal' } });

  const view2 = fixture();
  const stone = all(view2.root).find(select => select.attributes['aria-label'] === '六尾选择进化石');
  assert.deepEqual(stone.options.map(option => option.value), ['firestone'], 'Vulpix cannot select unrelated stocked Moon Stone');
  byText(view2.root, 'button', '使用进化石').click(); await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(view2.requests[0])), { url: '/api/party', body: { operation: 'evolve', uid: 'vulpix-1', itemId: 'firestone' } });
});

test('active battles disable management and the final move cannot be forgotten', () => {
  const active = fixture({ active: true });
  assert.ok(all(active.root).filter(element => element.tagName === 'button' && element.textContent !== '取消').every(button => button.disabled));
  const onlyMove = fixture({ moves: 1 });
  assert.equal(byText(onlyMove.root, 'button', '忘掉所选').disabled, true);
  assert.match(all(onlyMove.root).find(element => element.className === 'management-section')?.children.map(child => child.textContent).join(' '), /至少保留一招/);
});
