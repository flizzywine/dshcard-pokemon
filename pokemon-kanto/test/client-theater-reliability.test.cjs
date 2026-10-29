'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeHarness({ mvu, stageAssets, viewBundle, hostOverride, shinyFx, dialogue, turnState } = {}) {
  const hooks = new Map(); let activeKey = '', cursor = 0, plugin;
  const listeners = [], hostCalls = [], hostRequests = [], channels = [], windowHandlers = new Map();
  const h = (type, props, ...children) => ({ type, props: { ...(props || {}), ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) } });
  const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const slot = () => { const list = hooks.get(activeKey) || []; hooks.set(activeKey, list); return [list, cursor++]; };
  const React = {
    createElement: h,
    cloneElement: (node, props, ...children) => h(node.type, { ...node.props, ...props }, ...(children.length ? children : [node.props.children])),
    useState(initial) { const [list, i] = slot(); if (!(i in list)) list[i] = { value: typeof initial === 'function' ? initial() : initial }; return [list[i].value, next => { list[i].value = typeof next === 'function' ? next(list[i].value) : next; }]; },
    useRef(initial) { const [list, i] = slot(); if (!(i in list)) list[i] = { current: initial }; return list[i]; },
    useMemo(factory, deps) { const [list, i] = slot(); if (!list[i] || !same(list[i].deps, deps)) list[i] = { value: factory(), deps }; return list[i].value; },
    useEffect(effect, deps) { const [list, i] = slot(), old = list[i]; if (!old || !same(old.deps, deps)) { old?.cleanup?.(); const entry = { deps, cleanup: null }; list[i] = entry; queueMicrotask(() => { entry.cleanup = effect() || null; }); } }
  };
  const render = (component, props, key) => { activeKey = key; cursor = 0; return component(props); };
  const ui = {
    registerStageView(view) { ui.stageView = view; },
    registerTextMarker(marker) { ui.marker ||= marker; (ui.markers ||= []).push(marker); }, registerComposerAction() {},
    registerMessageAction(action) { ui.messageAction = action; },
    showStage() {}, assetUrl: value => 'https://assets.example/' + value,
    getMusicState: () => ({ enabled: false }), watchMusic: () => () => {},
    stopMusic() {}, playMusic() {},
    watchTurnState(_gameId, listener) { listeners.push(listener); return () => {}; },
    getTurnState: async () => turnState || { turn: 1, textVersion: 'dialogue-version-1', settled: true, busy: false },
    callHost: async (route, data) => { hostCalls.push(route); hostRequests.push({ route, data }); const custom = hostOverride?.(route, data); if (custom !== undefined) return custom; if (route.endsWith('/dialogue')) return dialogue || { enabled: true, annotated: true, nativeCastPresent: false, turn: data.turn, textVersion: data.textVersion, lines: [{ n: 1, quote: '你好。', speaker: '大木博士', emotion: 'neutral', avatarUrl: '/api/dsh-tavern/plugin-assets/oak.png' }] }; if (route.endsWith('/mvu')) return mvu || { writable: true, turn: 1, world: { 训练家: {}, 地图: {}, 队伍: [], 战斗: { 状态: 'finished' } }, theater: {} }; if (route.endsWith('/stage-assets')) return stageAssets || { css: '', trainers: [], npcPortraits: { entries: [] }, scenery: [], species: [] }; if (route.endsWith('/models')) return { available: false, groups: [] }; if (route.endsWith('/view')) return viewBundle || { html: '<html><head></head><body></body></html>', css: '', js: '', assetRoot: '' }; return {}; }
  };
  class FakePort { constructor() { this.messages = []; this.onmessage = null; } start() {} close() {} postMessage(data) { this.messages.push(data); } deliver(data) { return this.onmessage?.({ data }); } }
  class FakeMessageChannel { constructor() { this.port1 = new FakePort(); this.port2 = new FakePort(); channels.push(this); } }
  const storage = new Map();
  const sandbox = { window: { __ModuleLoader__: { load: entry => { plugin = entry.factory(name => { assert.equal(name, 'react'); return React; }); } }, localStorage: { getItem: key => storage.has(key) ? storage.get(key) : null, setItem: (key,value) => storage.set(key,String(value)) }, KantoShinyFx: shinyFx, addEventListener(type, fn) { windowHandlers.set(type, fn); }, removeEventListener(type) { windowHandlers.delete(type); } }, crypto: { randomUUID: () => 'reliability-bridge' }, MessageChannel: FakeMessageChannel, queueMicrotask, Promise, Map, Set, URL, globalThis: null };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../client.js'), 'utf8'), sandbox);
  plugin.apply({ tavernUi: ui });
  return { ui, render, listeners, hostCalls, hostRequests, channels, windowHandlers, MessageChannel: FakeMessageChannel, window: sandbox.window };
}

function walk(node, test, found = []) {
  if (node == null || typeof node === 'boolean') return found;
  if (Array.isArray(node)) { node.forEach(child => walk(child, test, found)); return found; }
  if (typeof node !== 'object') return found;
  if (test(node)) found.push(node);
  walk(node.props?.children, test, found);
  return found;
}

const tick = () => new Promise(resolve => setImmediate(resolve));

test('native stage exposes the same story-battle action and enters the embedded battlefield',async()=>{
 const app=makeHarness({mvu:{writable:true,turn:8,textVersion:'leaf-exchange',world:{训练家:{姓名:'玩家'},地图:{},队伍:[],剧情:{初始御三家已选:true},战斗:{状态:'finished'}},theater:{options:[]}}});
 let stage=mountStage(app,'leaf-stage-action','leaf-stage');await tick();await tick();
 stage=mountStage(app,'leaf-stage-action','leaf-stage');
 const action=walk(stage.tree,node=>node.type==='button'&&node.props.children==='接受剧情对战')[0];assert.ok(action);
 await action.props.onClick({stopPropagation(){}});await tick();
 const request=app.hostRequests.find(row=>row.route.endsWith('/enter-battle'));
 assert.equal(request.data.natural,true);assert.equal(request.data.turn,8);assert.equal(request.data.textVersion,'leaf-exchange');
 stage=mountStage(app,'leaf-stage-action','leaf-stage');assert.ok(walk(stage.tree,node=>node.type?.name==='BattleFrame').length);
});

test('an unlocked Hell rematch starts immediately in the stage without creating a message draft',async()=>{
 const app=makeHarness({mvu:{writable:true,turn:8,textVersion:'hell-v8',world:{训练家:{},地图:{},队伍:[],剧情:{初始御三家已选:true},战斗:{状态:'finished'}},theater:{options:[{id:'hell-rematch',label:'地狱重赛：小刚',enabled:true,payload:{key:'brock'}}]}}});
 let stage=mountStage(app,'hell-repeat-action','hell-repeat');await tick();await tick();stage=mountStage(app,'hell-repeat-action','hell-repeat');const action=walk(stage.tree,node=>node.type==='button'&&node.props.children==='地狱重赛：小刚')[0];assert.ok(action);await action.props.onClick({stopPropagation(){}});await tick();
 const routes=app.hostRequests.filter(row=>row.route.endsWith('/scene')||row.route.endsWith('/enter-battle'));assert.equal(routes.length,2);assert.equal(routes[0].data.action,'hell-rematch');assert.equal(routes[0].data.payload.key,'brock');assert.ok(routes[1].route.endsWith('/enter-battle'));stage=mountStage(app,'hell-repeat-action','hell-repeat');assert.ok(walk(stage.tree,node=>node.type?.name==='BattleFrame').length);
});

async function startBattle(app, gameId) {
  const markerElement = app.ui.marker.render({ gameId, streaming: false, match: '【进入本轮战斗】' });
  const entry = walk(app.render(markerElement.type, markerElement.props, 'entry-' + gameId), node => node.type === 'button')[0];
  await entry.props.onClick({ stopPropagation() {} });
}

function mountStage(app, gameId, key) {
  const input = { gameId, stage: {}, beats: [], index: 0, beat: null };
  const element = app.ui.stageView.render(input);
  const tree = app.render(element.type, element.props, key);
  return { input, element, tree };
}

function mountBattleFrame(app, stage, key) {
  const frameElement = walk(stage.tree, node => node.type?.name === 'BattleFrame')[0];
  return { frameElement, tree: app.render(frameElement.type, frameElement.props, key) };
}

function connectFrame(app, frameTree) {
  const iframe = walk(frameTree, node => node.type === 'iframe')[0];
  assert.ok(iframe, 'the battle view iframe is mounted');
  const frame = { ownerDocument: { defaultView: { MessageChannel: app.MessageChannel, addEventListener() {}, removeEventListener() {} } }, contentWindow: { postMessage() {} } };
  iframe.props.ref.current = frame;
  iframe.props.onLoad();
  const port = app.channels.at(-1).port1;
  port.deliver({ channel: 'kanto-mvu', bridge: 'reliability-bridge', type: 'bridge-connected' });
  return { iframe, port };
}

test('stage retains named nonpixel avatars for clearly attributed dialogue without a host speaker', async () => {
  const app = makeHarness({
    stageAssets: { css: '', trainers: [], npcPortraits: { entries: [] }, scenery: [], species: [] },
    mvu: { writable: true, turn: 1, world: { 训练家: { 姓名: '小智' }, 地图: {}, 队伍: [], 战斗: { 状态: 'finished' } }, theater: { person: { name: '老店员' }, dialogue: '欢迎来到这里。', pokemon: [] } }
  });
  const beat = { kind: 'line', text: '老店员说：“欢迎来到这里。”' };
  const input = { gameId: 'reliable-stage', stage: { characters: [{ name: '老店员', gender: 'female', age: 'adult', width: 1024, height: 1536, avatars: { neutral: 'https://assets.example/named-clerk.png' } }], stage: { figures: [] } }, beat, beats: [beat], index: 0 };
  let element = app.ui.stageView.render(input); app.render(element.type, element.props, 'stage'); await tick(); await tick();
  element = app.ui.stageView.render(input);
  const shell = app.render(element.type, element.props, 'stage');
  const style = walk(shell, node => node.type === 'style')[0];
  assert.match(style.props.children, /\.kanto-stage-shell\{display:flex/, 'shell layout remains styled if the stage stylesheet request fails');
  const scene = walk(shell, node => node.type?.name === 'TheaterScene')[0];
  const theater = app.render(scene.type, scene.props, 'theater');
  const name = walk(theater, node => node.props?.className === 'kanto-theater-name')[0];
  assert.equal(name?.props.children, '老店员', 'the clearly attributed quote supplies the host beat speaker');
  const portraitNode = walk(theater, node => node.type?.name === 'Portrait' && !node.props.pokemon)[0];
  assert.ok(portraitNode, 'the named NPC remains in the cast');
  assert.notEqual(portraitNode.props.person.name, '小智', 'the player character is not inferred as an NPC');
  assert.equal(portraitNode.props.person.url, 'https://assets.example/named-clerk.png', 'the old avatars[emotion] portrait path is retained');
});

test('unchanged host turn notifications do not trigger another MVU read', async () => {
  const app = makeHarness();
  const input = { gameId: 'refresh-dedupe', stage: {}, beats: [], index: 0, beat: null };
  let element = app.ui.stageView.render(input); app.render(element.type, element.props, 'stage'); await tick(); await tick();
  const initialReads = app.hostCalls.filter(route => route.endsWith('/mvu')).length;
  const notify = app.listeners[0];
  notify({ turn: 2, textVersion: 9, busy: false, settled: true });
  element = app.ui.stageView.render(input); app.render(element.type, element.props, 'stage'); await tick();
  const changedReads = app.hostCalls.filter(route => route.endsWith('/mvu')).length;
  assert.equal(changedReads, initialReads + 1, 'a meaningful turn change refreshes the scene once');
  notify({ turn: 2, textVersion: 9, busy: false, settled: true });
  element = app.ui.stageView.render(input); app.render(element.type, element.props, 'stage'); await tick();
  assert.equal(app.hostCalls.filter(route => route.endsWith('/mvu')).length, changedReads, 'duplicate notifications are ignored');
});

test('embedded view bundle preserves replacement tokens in real concatenated scripts and styles', async () => {
  const publicDir = path.join(__dirname, '../public');
  const jsFiles = ['terrain.js', 'audio.js', 'battle-fx-map.js', 'tools-panel.js', 'cosmetic-fx.js', 'doubles-ui.js', 'classic-services-ui.js', 'app.js'];
  const cssFiles = ['style.css', 'battle-theme.css', 'tools-panel.css', 'cosmetic-fx.css', 'doubles-ui.css', 'classic-services.css', 'map-panzoom.css'];
  const marker = "/* replacement tokens $& | $' | $` */";
  const sourceJs = 'window.__KANTO_AUDIO_MANIFEST__=' + fs.readFileSync(path.join(publicDir, 'data/audio.json'), 'utf8') + ';\n' +
    'window.__KANTO_TERRAIN_MANIFEST__=' + fs.readFileSync(path.join(publicDir, 'data/battle-terrain.json'), 'utf8') + ';\n' +
    jsFiles.map(file => fs.readFileSync(path.join(publicDir, file), 'utf8')).join('\n') + '\n' + marker;
  const sourceCss = cssFiles.map(file => fs.readFileSync(path.join(publicDir, file), 'utf8')).join('\n') + '\n' + marker;
  const assetRoot = "https://assets.example/pack/$&/$'/$`/";
  const bundle = { html: fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8'), css: sourceCss, js: sourceJs, assetRoot };
  const app = makeHarness({ viewBundle: bundle });
  const markerElement = app.ui.marker.render({ gameId: 'srcdoc-replacement', streaming: false, match: '【进入本轮战斗】' });
  const entry = walk(app.render(markerElement.type, markerElement.props, 'entry'), node => node.type === 'button')[0];
  await entry.props.onClick({ stopPropagation() {} });
  const stageInput = { gameId: 'srcdoc-replacement', stage: {}, beats: [], index: 0, beat: null };
  let stageElement = app.ui.stageView.render(stageInput);
  let stageTree = app.render(stageElement.type, stageElement.props, 'stage');
  const frameElement = walk(stageTree, node => node.type?.name === 'BattleFrame')[0];
  let frameTree = app.render(frameElement.type, frameElement.props, 'frame');
  await tick(); await tick();
  frameTree = app.render(frameElement.type, frameElement.props, 'frame');
  const iframe = walk(frameTree, node => node.type === 'iframe')[0];
  assert.ok(iframe, 'the view bundle reaches the actual stage iframe');
  const srcDoc = iframe.props.srcDoc;
  const expectedJs = sourceJs.replace(/<\/script/gi, '<\\/script');
  const expectedCss = sourceCss.replace(/<\/style/gi, '<\\/style');
  assert.ok(srcDoc.includes(expectedJs), 'the full concatenated script survives document assembly byte-for-byte apart from closing-tag escaping');
  assert.match(srcDoc, /replacement tokens \$& \| \$' \| \$`/, 'replacement tokens remain literal');
  assert.equal((srcDoc.match(/<head>/gi) || []).length, 1, 'head injection does not duplicate the HTML prefix');
  assert.doesNotMatch(srcDoc, /<link\b[^>]*href=["']\.\/map-panzoom\.css/i, 'latest map-panzoom CSS is inlined');
  assert.doesNotMatch(srcDoc, /<script\b[^>]*src=["']\.\/(?:tile-world-ui|map-panzoom)\.js/i, 'stale standalone UI scripts are not loaded from the srcDoc base');
  const style = srcDoc.match(/<style>([\s\S]*?)<\/style>/i);
  assert.equal(style?.[1], expectedCss, 'CSS is inserted intact even when it contains replacement tokens');
  const bootScript = [...srcDoc.matchAll(/<script>([\s\S]*?)<\/script>/gi)][0]?.[1] || '';
  assert.ok(bootScript.includes(JSON.stringify(assetRoot)), 'asset-root boot data preserves replacement tokens');
});

test('view and stage-assets requests share in-flight promises for the same game', async () => {
  let resolveView, resolveAssets, viewCalls = 0, assetCalls = 0;
  const viewPromise = new Promise(resolve => { resolveView = resolve; });
  const assetsPromise = new Promise(resolve => { resolveAssets = resolve; });
  const bundle = { html: '<html><head></head><body></body></html>', css: '', js: '', assetRoot: '' };
  const assets = { css: '', trainers: [], npcPortraits: { entries: [] }, scenery: [], species: [] };
  const app = makeHarness({ hostOverride(route) { if (route.endsWith('/view')) { viewCalls++; return viewPromise; } if (route.endsWith('/stage-assets')) { assetCalls++; return assetsPromise; } } });
  await startBattle(app, 'shared-static');
  const stageA = mountStage(app, 'shared-static', 'stage-a');
  const stageB = mountStage(app, 'shared-static', 'stage-b');
  mountBattleFrame(app, stageA, 'frame-a'); mountBattleFrame(app, stageB, 'frame-b');
  await tick(); await tick();
  assert.equal(viewCalls, 1, 'both iframe instances share the same pending view request');
  assert.equal(assetCalls, 1, 'both stage instances share the same pending stage-assets request');
  resolveView(bundle); resolveAssets(assets); await tick(); await tick();
});

test('failed static requests are evicted so retry can load the view bundle', async () => {
  let viewCalls = 0;
  const bundle = { html: '<html><head></head><body></body></html>', css: '', js: '', assetRoot: '' };
  const app = makeHarness({ viewBundle: bundle, hostOverride(route) { if (route.endsWith('/view')) { viewCalls++; if (viewCalls === 1) return Promise.reject(new Error('temporary view failure')); return bundle; } } });
  await startBattle(app, 'retry-static');
  const stage = mountStage(app, 'retry-static', 'retry-stage');
  const frame = mountBattleFrame(app, stage, 'retry-frame'); await tick(); await tick();
  let tree = app.render(frame.frameElement.type, frame.frameElement.props, 'retry-frame');
  const retry = walk(tree, node => node.type === 'button')[0]; assert.ok(retry, 'the failed view shows its retry control');
  retry.props.onClick();
  tree = app.render(frame.frameElement.type, frame.frameElement.props, 'retry-frame'); await tick(); await tick();
  assert.equal(viewCalls, 2, 'the rejected promise was removed from cache before retry');
  tree = app.render(frame.frameElement.type, frame.frameElement.props, 'retry-frame');
  assert.ok(walk(tree, node => node.type === 'iframe')[0], 'retry recovers with the newly fetched bundle');
});

test('battle action replies wait until stage-return to refresh parent MVU state', async () => {
  const app = makeHarness({ viewBundle: { html: '<html><head></head><body></body></html>', css: '', js: '', assetRoot: '' } });
  await startBattle(app, 'battle-parent-refresh');
  let stage = mountStage(app, 'battle-parent-refresh', 'battle-stage');
  let frame = mountBattleFrame(app, stage, 'battle-frame'); await tick(); await tick();
  frame = mountBattleFrame(app, stage, 'battle-frame');
  const { port } = connectFrame(app, frame.tree);
  await tick();
  const initialReads = app.hostCalls.filter(route => route.endsWith('/mvu')).length;
  for (const route of ['action', 'battle']) {
    port.deliver({ channel: 'kanto-mvu', bridge: 'reliability-bridge', requestId: 'request-' + route, path: '/api/' + route, body: {} });
    await tick(); await tick();
    stage = mountStage(app, 'battle-parent-refresh', 'battle-stage');
    mountBattleFrame(app, stage, 'battle-frame'); await tick();
    assert.equal(app.hostCalls.filter(value => value.endsWith('/mvu')).length, initialReads, route + ' reply does not force a duplicate parent MVU read');
  }
  port.deliver({ channel: 'kanto-mvu', bridge: 'reliability-bridge', type: 'stage-return' });
  await tick();
  stage = mountStage(app, 'battle-parent-refresh', 'battle-stage'); await tick();
  assert.equal(app.hostCalls.filter(route => route.endsWith('/mvu')).length, initialReads + 1, 'returning to story refreshes the parent exactly once');
});

test('unannotated quoted dialogue identifies only clearly attributed non-player speakers', async () => {
  const publicDir = path.join(__dirname, '../public');
  const stageAssets = { css: '', trainers: JSON.parse(fs.readFileSync(path.join(publicDir, 'data/trainers.json'), 'utf8')), npcPortraits: JSON.parse(fs.readFileSync(path.join(publicDir, 'data/npc-portraits.json'), 'utf8')), scenery: [], species: [] };
  async function renderLine(text, playerName = '小智', speaker = '', previous = [], sceneContext = { person: { name: '固定场景人物' } }) {
    const app = makeHarness({ stageAssets, mvu: { writable: true, turn: 1, world: { 训练家: { 姓名: playerName }, 地图: {}, 队伍: [], 战斗: { 状态: 'finished' } }, theater: { ...sceneContext, dialogue: '场景旁白。', pokemon: [] } } });
    const beat = { kind: 'line', text, ...(speaker ? { speaker } : {}) }, beats = [...previous, beat];
    const input = { gameId: 'dialogue-' + text, stage: { characters: [], stage: { figures: [] } }, beats, beat, index: beats.length - 1 };
    let element = app.ui.stageView.render(input); app.render(element.type, element.props, 'stage'); await tick(); await tick();
    element = app.ui.stageView.render(input);
    const shell = app.render(element.type, element.props, 'stage'), scene = walk(shell, node => node.type?.name === 'TheaterScene')[0];
    const theater = app.render(scene.type, scene.props, 'theater');
    const name = walk(theater, node => node.props?.className === 'kanto-theater-name')[0];
    const line = walk(theater, node => node.props?.className === 'kanto-theater-line kanto-theater-text')[0];
    const actors = walk(theater, node => node.type?.name === 'Portrait' && !node.props.pokemon).map(node => node.props.person.name);
    const portraits = walk(theater, node => node.type?.name === 'Portrait' && !node.props.pokemon).map(node => node.props.person);
    return { name: name?.props.children || '', line: [].concat(line?.props.children || []).join(''), actors, portraits };
  }
  const bugCatcher = await renderLine('捕虫少年说：“看那边的草丛！”');
  assert.equal(bugCatcher.name, '捕虫少年'); assert.ok(bugCatcher.actors.includes('捕虫少年')); assert.equal(bugCatcher.line, '看那边的草丛！');
  const oldMan = await renderLine('“天色晚了。”老汉说道。');
  assert.equal(oldMan.name, '老汉'); assert.ok(oldMan.actors.includes('老汉'));
  const clerk = await renderLine('女店员笑着说：“请慢用。”');
  assert.equal(clerk.name, '女店员'); assert.ok(clerk.actors.includes('女店员'));
  const continuation = await renderLine('“我也这么觉得。”', '小智', '', [{ kind: 'line', text: '捕虫少年走到你身边。' }]);
  assert.equal(continuation.name, '捕虫少年', 'the immediately preceding identified role can own a quote-only continuation');
  const protectedPlayer = await renderLine('小智说：“我们走吧。”');
  assert.equal(protectedPlayer.name, '', 'the protagonist’s own name is not inferred as an NPC'); assert.deepEqual(protectedPlayer.actors, []);
  const explicitPlayer = await renderLine('“我们走吧。”', '小智', '小智');
  assert.equal(explicitPlayer.name, '小智', 'an explicit host speaker annotation remains authoritative'); assert.deepEqual(explicitPlayer.actors, [], 'the protagonist is not rendered as an NPC portrait');
  const unassignedQuote = await renderLine('“你说得对。”');
  assert.equal(unassignedQuote.name, '', 'an unattributed quote does not become a generic NPC'); assert.deepEqual(unassignedQuote.actors, []);
  const oakInNativeScene = await renderLine('请从这三只宝可梦中选择一位伙伴。', '小智', '博士', [], { id: 'oak-lab', person: { name: '大木博士' } });
  assert.equal(oakInNativeScene.name, '博士', 'the native scene keeps the dialogue’s generic speaker label');
  assert.match(oakInNativeScene.portraits[0]?.url || '', /assets\/trainers\/official\/professor_oak\.png/, 'the Oak lab context resolves the generic professor label to Oak’s named non-pixel artwork');
  const genericProfessorElsewhere = await renderLine('这里的博士有新的研究课题。', '小智', '博士');
  assert.notEqual(genericProfessorElsewhere.portraits[0]?.url, oakInNativeScene.portraits[0]?.url, 'a generic professor outside Oak context remains on the generic NPC matching path');
});

test('ordinary and historical quotations retain native text without plugin bubbles', () => {
  const app = makeHarness({ turnState: { turn: 5, textVersion: 'latest-v5', settled: false, busy: true } });
  const marker = app.ui.markers.find(item => item.pattern.source.includes('＂'));
  assert.ok(marker);
  for (const [turn, streaming] of [[4, false], [5, true]]) {
    const match = '“你好。”';
    const tree = marker.render({ match, groups: [match], gameId: 'pokemon-game', turn, streaming });
    assert.equal(tree.type, 'span');
    assert.equal(tree.props.children, match);
    assert.equal(walk(tree, node => node.props?.className === 'kanto-body-dialogue-bubble').length, 0);
  }
  assert.equal(app.hostCalls.some(route => route.endsWith('/dialogue')), false);
  assert.notEqual(app.ui.messageAction?.id, 'kanto-dialogue-bubbles-toggle');
});

test('the shiny effect API is deterministic, capped, reduced-motion aware, and lifecycle safe', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/shiny-fx.js'), 'utf8');
  const timers = new Map(), listeners = new Map(); let timerId = 0;
  const doc = { hidden: false, createElement: () => new FakeElement(doc), addEventListener(type, fn) { listeners.set(type, fn); } };
  const host = { document: doc, setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); }, addEventListener(type, fn) { listeners.set(type, fn); } };
  class FakeElement {
    constructor(ownerDocument) { this.ownerDocument = ownerDocument; this.children = []; this.attributes = {}; this.properties = {}; this.className = ''; this.classes = new Set(); this.classList = { add: value => this.classes.add(value), remove: value => this.classes.delete(value) }; this.style = { setProperty: (key, value) => { this.properties[key] = value; } }; this.parent = null; }
    setAttribute(key, value) { this.attributes[key] = value; }
    appendChild(node) { node.parent = this; this.children.push(node); return node; }
    remove() { if (!this.parent) return; this.parent.children = this.parent.children.filter(item => item !== this); this.parent = null; }
  }
  vm.runInNewContext(source, { window: host, Map, Set, WeakMap, Math, Object, String, Number, Array, Infinity });
  const fx = host.KantoShinyFx, first = new FakeElement(doc);
  const stop = fx.playEntry(first, { seed: 'seed-25', side: 'left', uid: 'mon-25', speed: 1 });
  assert.equal(typeof stop, 'function');
  const layer = first.children[0], stars = layer.children.filter(node => node.className.includes('kanto-shiny-fx-star'));
  assert.equal(layer.attributes['aria-hidden'], 'true'); assert.equal(layer.attributes['data-side'], 'left');
  assert.equal(stars.length, 14); assert.ok(stars.every(star => star.properties['--fx-size'] && star.properties['--fx-dx']), 'stars have different seeded sizes and trajectories');
  const positions = stars.map(star => [star.properties['--fx-x'], star.properties['--fx-y']]);
  stop(); assert.equal(first.children.length, 0);
  const repeat = new FakeElement(doc); fx.playEntry(repeat, { seed: 'seed-25', side: 'left', uid: 'mon-25', speed: 1 });
  assert.deepEqual(repeat.children[0].children.filter(node => node.className.includes('kanto-shiny-fx-star')).map(star => [star.properties['--fx-x'], star.properties['--fx-y']]), positions, 'the same seed produces the same star paths');
  const second = new FakeElement(doc); fx.playEntry(second, { seed: 'second', side: 'right', uid: 'mon-2' });
  const totalStars = [repeat, second].flatMap(root => root.children.flatMap(layer => layer.children.filter(node => node.className.includes('kanto-shiny-fx-star')))).length;
  assert.ok(totalStars <= 20, 'simultaneous entries never exceed the global particle cap');
  fx.stopEntry(repeat); assert.equal(repeat.children.length, 0);
  listeners.get('pagehide')(); assert.equal(second.children.length, 0, 'pagehide stops transient overlays'); assert.equal(timers.size, 0, 'cleanup cancels pending timers');
  const reduced = new FakeElement(doc), stopReduced = fx.playEntry(reduced, { seed: 'reduced', reducedMotion: true }); assert.equal(typeof stopReduced, 'function'); assert.equal(reduced.children.length, 0); assert.ok(reduced.classes.has('kanto-shiny-reduced-motion')); stopReduced(); assert.equal(reduced.classes.has('kanto-shiny-reduced-motion'), false);
  doc.hidden = true; const hidden = new FakeElement(doc); assert.equal(fx.playEntry(hidden, { seed: 'hidden' }), null);
  assert.doesNotMatch(source, /requestAnimationFrame/, 'the effect uses bounded CSS animation instead of a persistent frame loop');
  const css = fs.readFileSync(path.join(__dirname, '../public/shiny-fx.css'), 'utf8');
  assert.match(css, /\.kanto-shiny-pokemon::after/); assert.match(css, /\.kanto-shiny-fx-star\.is-ice/); assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /hue-rotate\s*\(/, 'shiny color variants remain in their source artwork');
});

test('theater portraits retain shiny artwork, accessibility labels, and call the FX API', async () => {
  const calls = [];
  const app = makeHarness({
    shinyFx: { playEntry(root, options) { calls.push({ root, options }); return () => {}; } },
    stageAssets: { css: '', trainers: [], npcPortraits: { entries: [] }, scenery: [], species: [{ id: 25, name: '皮卡丘', english: 'Pikachu' }] },
    mvu: { writable: true, turn: 1, world: { 训练家: { 姓名: '小智' }, 地图: {}, 队伍: [], 战斗: { 状态: 'finished' } }, theater: { pokemon: [{ id: 25, name: '皮卡丘', shiny: true, uid: 'pikachu-25' }], dialogue: '皮卡丘闪着金色光芒。' } }
  });
  const beat = { kind: 'line', speaker: '皮卡丘', text: '皮卡，皮卡！' }, input = { gameId: 'shiny-theater', stage: { stage: { figures: [{ speaker: '皮卡丘' }] } }, beat, beats: [beat], index: 0 };
  let element = app.ui.stageView.render(input); app.render(element.type, element.props, 'stage'); await tick(); await tick();
  element = app.ui.stageView.render(input);
  const shell = app.render(element.type, element.props, 'stage'), scene = walk(shell, node => node.type?.name === 'TheaterScene')[0];
  const theater = app.render(scene.type, scene.props, 'theater'), portrait = walk(theater, node => node.type?.name === 'Portrait' && node.props.pokemon)[0];
  const actor = app.render(portrait.type, portrait.props, 'portrait');
  actor.props.ref.current = { actor: 'pikachu' }; await tick();
  assert.match(actor.props.className, /kanto-shiny-pokemon/);
  assert.equal(actor.props['aria-label'], '闪光皮卡丘，宝可梦');
  assert.match(walk(actor, node => node.type === 'img')[0].props.src, /pokemon\/shiny\/artwork\/25\.png/);
  assert.equal(calls.length, 1); assert.equal(calls[0].options.uid, 'pikachu-25'); assert.equal(calls[0].options.seed, 'pikachu-25');
});
