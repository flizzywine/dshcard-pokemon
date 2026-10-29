import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { apply, __hostInternals } from '../index.mjs';

const require = createRequire(import.meta.url);
const { KantoGame } = require('../engine.cjs');
const { presentation } = require('../presentation.cjs');
const mvu = require('../mvu.cjs');
const clone = value => structuredClone(value);

test('pending evolution is confirmed through the public party route and duplicate confirmation is rejected',async()=>{
 const variables=mvu.createInitialMvu(4),world=variables.stat_data.宝可梦;
 world.队伍=[mvu.makeMon(4,15,'route-evolve')];world.遭遇=null;world.战斗.状态='finished';
 mvu.grantLevel(world.队伍[0],40);
 const decision=world.队伍[0].待进化[0];
 const host=makeHost({variables});
 await host.call('party',{operation:'evolutionConfirm',uid:'route-evolve',decisionId:decision.id});
 assert.equal(host.variables.stat_data.宝可梦.队伍[0].图鉴编号,5);
 await assert.rejects(host.call('party',{operation:'evolutionConfirm',uid:'route-evolve',decisionId:decision.id}),/事项已变化/);
});

function makeHost({ variables = {}, turn = 1, textVersion = 'text-v1' } = {}) {
  const routes = new Map();
  const sections = new Map();
  const storage = new Map();
  const callbacks = {};
  const history = new Map();
  const host = {
    apiVersion: 3,
    head: { gameId: 'host-test', turn, textVersion, settled: true, busy: false },
    variables: clone(variables),
    writes: 0,
    saves: 0,
    rejectNextWrite: false,
    rejectAfterWrite: false,
    rejectNextSave: false,
    T: null,
    async call(route, body = {}) {
      const handler = routes.get(`dsh-card-pokemon-frlg-stage/${route}`);
      assert.ok(handler, `registered route ${route}`);
      return handler({ ...body, gameId: 'host-test' });
    },
    async settle(variables = this.variables) {
      return callbacks.settled({ ...this.head, variables: clone(variables), text: 'test story' });
    },
    restart() { apply({ tavern: this.T }); },
  };
  host.T = {
    apiVersion: host.apiVersion,
    handle(name, fn) { routes.set(name, fn); },
    async getTurnState({ gameId }) { assert.equal(gameId, 'host-test'); return { ...host.head }; },
    async getTurn({ gameId, turn: requestedTurn }) {
      assert.equal(gameId, 'host-test');
      return requestedTurn === host.head.turn ? { turn: requestedTurn, textVersion: host.head.textVersion, variables: clone(host.variables) } : null;
    },
    async getHistory({ gameId, from, to }) {
      assert.equal(gameId, 'host-test');
      return history.has(from) && from === to ? [{ turn: from, input: history.get(from), text: 'test story', rawText: 'test story' }] : [];
    },
    async setVariables(input) {
      if (input.turn !== host.head.turn || input.textVersion !== host.head.textVersion) throw Object.assign(new Error('stale write'), { code: 'STALE_TURN' });
      if (host.rejectNextWrite) { host.rejectNextWrite = false; throw Object.assign(new Error('write rejected'), { code: 'WRITE_REJECTED' }); }
      host.variables = clone(input.variables); host.writes++;
      if(host.rejectAfterWrite){host.rejectAfterWrite=false;throw Error('connection lost after commit');}
      return { turn: input.turn, textVersion: input.textVersion };
    },
    async saveTurnData(input) {
      if (input.turn !== host.head.turn || input.textVersion !== host.head.textVersion) throw Object.assign(new Error('stale save'), { code: 'STALE_TURN' });
      if (host.rejectNextSave && --host.rejectNextSave === 0) throw Object.assign(new Error('save rejected'), { code: 'SAVE_REJECTED' });
      storage.set(input.turn, { turn: input.turn, textVersion: input.textVersion, data: clone(input.data) }); host.saves++;
      return { turn: input.turn, textVersion: input.textVersion };
    },
    async readTurnData({ turn: requestedTurn }) {
      const latest = [...storage.values()].filter(entry => entry.turn <= requestedTurn).sort((a, b) => b.turn - a.turn)[0];
      return clone(latest || null);
    },
    onTurnSettled(fn) { callbacks.settled = fn; },
    onTimelineChanged(fn) { callbacks.timeline = fn; },
    onGameRemoved(fn) { callbacks.removed = fn; },
    turnSection(config) { sections.set(config.name, config); },
    promptSection(config) { sections.set(config.name, config); },
    settlementSection(config) { sections.set(config.name, config); },
  };
  host.routes = routes; host.storage = storage; host.callbacks = callbacks; host.sections = sections; host.history = history;
  apply({ tavern: host.T });
  return host;
}

test('settlement initializes and creates one encounter once for an exact turn/version', async () => {
  const host = makeHost();
  await host.settle();
  const writes = host.writes;
  const encounter = host.variables.stat_data['宝可梦'].遭遇;
  await host.settle();
  assert.deepEqual(host.variables.stat_data['宝可梦'].遭遇, encounter);
  assert.equal(host.writes, writes);
  assert.ok(encounter && typeof encounter === 'object');
});

test('clicking the Leaf invitation validates the current story and does not reset an active battle',async()=>{
 const variables=mvu.createInitialMvu(1),w=variables.stat_data.宝可梦;
 w.剧情.初始御三家已选=true;w.遭遇=null;w.战斗={轮次:0,状态:'finished',结果:'',摘要:'',操作序号:0};
 const host=makeHost({variables,turn:2,textVersion:'v2'}),getTurn=host.T.getTurn;
 host.T.getTurn=async args=>({...await getTurn(args),text:'叶子脚边的妙蛙种子抬头。\n@bubble:leaf|叶子|期待|[来吧。真打一个，点到为止。]'});
 host.history.set(2,'我和叶子聊聊');
 await assert.rejects(host.call('enter-battle',{natural:true,turn:1}),error=>error.code==='STALE_TURN');
 await assert.rejects(host.call('enter-battle',{natural:true,naturalQuote:'来吧。真打一个',turn:2}),error=>error.code==='NO_PENDING_ENCOUNTER');
 const opened=await host.call('enter-battle',{natural:true,naturalQuote:'来吧。真打一个，点到为止。',turn:2});
 assert.equal(host.variables.stat_data.宝可梦.遭遇.训练家,'叶子');
 assert.equal(host.variables.stat_data.宝可梦.遭遇.队伍[0].图鉴编号,1);
 const before=clone(host.variables);
 await assert.rejects(host.call('enter-battle',{natural:true,turn:2}),error=>error.code==='BATTLE_ACTIVE');
 assert.deepEqual(host.variables,before);assert.ok(opened.battle);
});

test('prepared trainer narration starts a battle through the host',async()=>{
 const variables=mvu.createInitialMvu(1),w=variables.stat_data.宝可梦;
 w.剧情.初始御三家已选=true;w.遭遇=null;w.战斗={轮次:0,状态:'finished',结果:'',摘要:'',操作序号:0};
 const host=makeHost({variables,turn:2,textVersion:'v2'}),getTurn=host.T.getTurn;
 const text='叶子握住精灵球，准备与你对战。';
 host.T.getTurn=async args=>({...await getTurn(args),text});host.history.set(2,'我继续旅行');
 const opened=await host.call('enter-battle',{natural:true,naturalQuote:text,turn:2});
 assert.equal(host.variables.stat_data.宝可梦.遭遇.训练家,'叶子');assert.ok(opened.battle);
});

test('complete native bubble scene accepts the earlier invitation from the message action',async()=>{
 const variables=mvu.createInitialMvu(1),w=variables.stat_data.宝可梦;
 w.剧情.初始御三家已选=true;w.遭遇=null;w.战斗={轮次:0,状态:'finished',结果:'',摘要:'',操作序号:0};
 const host=makeHost({variables,turn:2,textVersion:'v2'}),getTurn=host.T.getTurn;
 const scene='@bubble:leaf|叶子|期待|[来吧。真打一场，点到为止。]\n妙蛙种子在叶子的脚边爬出来，在对面站住，把身子压低。叶子往后退了几步，站到平地的另一边。\n@bubble:leaf|叶子|期待|[你先。]\n小火龙抬眼看了看对面那个还矮着身子的对手，好像在等一个信号。';
 host.T.getTurn=async args=>({...await getTurn(args),text:scene});host.history.set(2,'我继续旅行');
 const opened=await host.call('enter-battle',{natural:true,turn:2});
 assert.equal(host.variables.stat_data.宝可梦.遭遇.训练家,'叶子');assert.ok(opened.battle);
});

test('a first settlement in a later story turn creates that turn’s encounter without a phantom round', async () => {
  const host = makeHost({ turn: 9, textVersion: 'text-v9' });
  await host.settle();
  const world = host.variables.stat_data['宝可梦'];
  assert.equal(world.战斗.轮次, 9);
  assert.equal(world.地图.轮次, 9);
  assert.equal(world.战斗.状态, 'pending');
  assert.equal(world.遭遇 !== null, true);
});

test('first initialization on the first player turn preserves the opening rival encounter', async () => {
  const host = makeHost({ turn: 2, textVersion: 'text-v2' });
  await host.settle();
  const world = host.variables.stat_data['宝可梦'];
  assert.equal(world.战斗.轮次, 2);
  assert.equal(world.地图.轮次, 2);
  assert.equal(world.遭遇.类型, 'trainer');
  assert.equal(world.遭遇.训练家, '小茂');
});

test('a native card initialvar root advances its pending greeting encounter onto the first player turn', async () => {
  const variables = require('../mvu.cjs').createInitialMvu();
  const host = makeHost({ variables, turn: 2, textVersion: 'text-v2' });
  await host.settle();
  const world = host.variables.stat_data['宝可梦'];
  assert.equal(world.战斗.轮次, 2);
  assert.equal(world.地图.轮次, 2);
  assert.equal(world.遭遇.类型, 'trainer');
  assert.equal(world.遭遇.训练家, '小茂');
});

test('natural language starter selection uses only the player input and updates the rival team', async () => {
  const host = makeHost({ turn: 2, textVersion: 'text-v2' });
  const section = host.sections.get('pokemon-kanto-mvu-context');
  await section.text({ gameId: 'host-test', turn: 2, input: '我想选小火龙作为伙伴' });
  await host.settle();
  const world = host.variables.stat_data['宝可梦'];
  assert.equal(world.队伍[0].图鉴编号, 4);
  assert.equal(world.剧情.初始御三家已选, true);
  assert.equal(world.遭遇.队伍[0].图鉴编号, 7);
  assert.equal(world.遭遇.训练家, '小茂');
});

test('the first settled state can initialize MVU before any settlement callback ran', async () => {
  const host = makeHost();
  const state = await host.call('mvu');
  assert.equal(state.world.战斗.状态, 'pending');
  assert.ok(state.world.遭遇);
  assert.ok(host.writes > 0);
});

test('lazy MVU initialization on turn two does not turn the opening fight into a wild encounter', async () => {
  const host = makeHost({ turn: 2, textVersion: 'text-v2' });
  const state = await host.call('mvu');
  assert.equal(state.world.战斗.状态, 'pending');
  assert.equal(state.world.遭遇.类型, 'trainer');
  assert.equal(state.world.遭遇.训练家, '小茂');
});

test('late state initialization recovers a starter choice from the public turn history', async () => {
  const host = makeHost({ turn: 2, textVersion: 'text-v2' });
  host.history.set(2, '我选择杰尼龟');
  const state = await host.call('mvu');
  assert.equal(state.world.队伍[0].图鉴编号, 7);
  assert.equal(state.world.遭遇.训练家, '小茂');
  assert.equal(state.world.遭遇.队伍[0].图鉴编号, 1);
});

test('DSH turn zero returns a read-only opening scene until the first greeting exists', async () => {
  const host = makeHost({ turn: 0, textVersion: null });
  host.head = { ...host.head, settled: false };
  const state = await host.call('mvu');
  assert.equal(state.turn, 0);
  assert.equal(state.textVersion, null);
  assert.equal(state.world.战斗.状态, 'pending');
  assert.equal(state.writable, false);
  assert.equal(state.presentation.scene.npcId, 'oak');
  assert.equal(host.writes, 0);
  await assert.rejects(host.call('starter', { id: 4 }), error => error.code === 'NO_CURRENT_TURN');
  await assert.rejects(host.call('next'), error => error.code === 'NO_CURRENT_TURN');
});

test('world state includes presentation manifests and picks gym leader over the rival', async () => {
  const host = makeHost();
  await host.settle();
  const stored = clone(host.variables);
  const world = stored.stat_data['宝可梦'];
  world.剧情.初始御三家已选 = true;
  world.遭遇 = { 类型: 'gym', 训练家: '小霞', 道馆: 1, 队伍: world.遭遇.队伍 };
  world.战斗.状态 = 'pending';
  await host.T.setVariables({ gameId: 'host-test', turn: 1, textVersion: 'text-v1', variables: stored });
  const view = await host.call('mvu');
  assert.deepEqual(view.presentation, await host.call('presentation'));
  assert.equal(view.presentation.scene.location, '真新镇');
  assert.equal(view.presentation.scene.node, 'pallet');
  assert.equal(view.presentation.scene.npcId, 'misty');
  assert.equal(view.presentation.scene.npcName, '小霞');
  world.地图.节点 = 'viridian-forest';
  world.地图.地点 = '常青森林';
  world.遭遇 = { 类型: 'trainer', 训练家: '小茂', 队伍: world.遭遇.队伍 };
  const scene = presentation(world).scene;
  assert.equal(scene.backgroundId, 'viridian-forest');
  assert.equal(scene.npcId, 'rival_early');
});

test('the trusted srcDoc payload is fixed project UI and never accepts a filesystem path', async () => {
  const host = makeHost({ turn: 0, textVersion: null });
  const payload = await host.call('view');
  assert.match(payload.html, /<html lang="zh-CN">/);
  assert.match(payload.css, /:root/);
  assert.match(payload.js, /kanto-mvu/);
  for (const file of ['terrain.js','audio.js','battle-fx-map.js','tools-panel.js','cosmetic-fx.js','doubles-ui.js','classic-services-ui.js','app.js']) {
    const source=fs.readFileSync(new URL(`../public/${file}`,import.meta.url),'utf8');
    assert.ok(payload.js.includes(source),`${file} source is present in the served iframe bundle`);
  }
  for (const file of ['tools-panel.css','cosmetic-fx.css','doubles-ui.css','classic-services.css','map-panzoom.css']) {
    const source=fs.readFileSync(new URL(`../public/${file}`,import.meta.url),'utf8').trim();
    assert.ok(payload.css.includes(source.slice(0,80)),`${file} styles are present in the served iframe bundle`);
  }
  // Fixed UI including the native/roster skins and terrain renderer; the host allows 4 MB.
  assert.ok(Buffer.byteLength(JSON.stringify(payload), 'utf8') < 1_000_000);
  const embedded=JSON.parse(payload.js.match(/window\.__KANTO_ANIMATED_SPRITES__=([^\n]+);/)[1]);
  const full=JSON.parse(fs.readFileSync(new URL('../public/data/battle-animated.json',import.meta.url),'utf8'));
  assert.equal(embedded.pokemon.length,151);
  embedded.pokemon.forEach((row,index)=>{
    assert.deepEqual(row.hd,full.pokemon[index].hd);
    assert.deepEqual(row.animated,full.pokemon[index].animated);
    assert.deepEqual(row.shiny,full.pokemon[index].shiny);
    assert.equal(Object.hasOwn(row,'hdMetrics'),false);
  });
  assert.equal(Object.hasOwn(payload, 'path'), false);
  assert.equal(host.writes, 0);
});

test('starting twice in one settled turn does not create or reset a second battle', async () => {
  const host = makeHost();
  await host.settle();
  await host.call('starter', { id: 1 });
  const opened = await host.call('battle');
  const firstId = opened.id;
  const firstMove = opened.request.moves.find(move => move.pp > 0);
  assert.ok(firstMove);
  const afterAction = await host.call('action', { battleId: firstId, choice: `move ${opened.request.moves.indexOf(firstMove) + 1}`, seq: 0,
    turn: host.head.turn, textVersion: host.head.textVersion });
  const duplicate = await host.call('next', { turn: host.head.turn, textVersion: host.head.textVersion });
  assert.equal(duplicate.battle.id, firstId);
  assert.equal(duplicate.seq, afterAction.seq);
  assert.equal(duplicate.battle.turn, afterAction.turn);
});

test('travel delegates a valid adjacent node ID to the MVU map rules', async () => {
  const host = makeHost();
  await host.settle();
  const variables = clone(host.variables);
  variables.stat_data['宝可梦'].战斗.状态 = 'finished';
  await host.T.setVariables({ gameId: 'host-test', turn: 1, textVersion: 'text-v1', variables });
  const moved = await host.call('travel', { node: 'route1', turn: 1, textVersion: 'text-v1' });
  assert.equal(moved.world.地图.节点, 'route1');
});

test('item route commits outside medicine to MVU and state exposes the item catalog', async () => {
  const host = makeHost();
  await host.settle();
  const variables = clone(host.variables), world = variables.stat_data['宝可梦'], mon = world.队伍[0];
  mon.当前HP = mon.能力值.hp - 10;
  await host.T.setVariables({ gameId: 'host-test', turn: 1, textVersion: 'text-v1', variables });
  const used = await host.call('item', { item: 'potion', uid: mon.uid, turn: 1, textVersion: 'text-v1' });
  assert.equal(used.world.背包.物品.potion, 2);
  assert.ok(used.world.队伍[0].当前HP > mon.当前HP);
  assert.ok(used.items.some(item => item.id === 'ultraball' && item.price === 1200));
  assert.equal(used.world.任务[0].状态, '进行中');
});

test('the host shop buys from the catalog and lazy upgrade preserves legacy inventory', async () => {
  const host = makeHost();
  await host.settle();
  const legacy = clone(host.variables), world = legacy.stat_data['宝可梦'];
  world.地图.节点 = 'cerulean'; world.地图.地点 = '华蓝市';
  world.训练家.徽章 = ['岩石徽章','蓝色徽章'];
  world.背包.物品 = { potion: 2, pokeball: 4 };
  delete world.任务;
  host.variables = legacy;
  const upgraded = await host.call('mvu');
  assert.equal(upgraded.world.背包.物品.potion, 2);
  assert.equal(upgraded.world.背包.物品.pokeball, 4);
  assert.equal(upgraded.world.背包.物品.greatball, 0);
  assert.ok(upgraded.world.任务.length >= 4);
  const bought = await host.call('shop', { item: 'greatball', count: 2, turn: 1, textVersion: 'text-v1' });
  assert.equal(bought.world.背包.物品.greatball, 2);
  assert.equal(bought.world.训练家.金钱, 1800);
});

test('old turn versions and replayed action sequence are rejected', async () => {
  const host = makeHost();
  await host.settle();
  await host.call('starter', { id: 1 });
  const opened = await host.call('battle', { turn: host.head.turn, textVersion: host.head.textVersion });
  const index = opened.request.moves.findIndex(move => move.pp > 0);
  const actionArgs = { battleId: opened.id, choice: `move ${index + 1}`, seq: 0, turn: host.head.turn, textVersion: host.head.textVersion };
  const changed = await host.call('action', actionArgs);
  await assert.rejects(host.call('action', actionArgs), error => error.code === 'STALE_ACTION');
  host.head = { ...host.head, textVersion: 'regenerated-version' };
  await assert.rejects(host.call('action', { ...actionArgs, seq: changed.seq }), error => error.code === 'STALE_TURN');
});

test('a failed authoritative MVU write leaves the previous battle and sequence intact', async () => {
  const host = makeHost();
  await host.settle();
  await host.call('starter', { id: 1 });
  const opened = await host.call('battle', { turn: 1, textVersion: 'text-v1' });
  const variablesBefore = clone(host.variables);
  const requestMove = `move ${opened.request.moves.findIndex(move => move.pp > 0) + 1}`;
  host.rejectNextWrite = true;
  await assert.rejects(host.call('action', { battleId: opened.id, choice: requestMove, seq: 0, turn: 1, textVersion: 'text-v1' }),
    error => error.code === 'WRITE_REJECTED');
  assert.deepEqual(host.variables, variablesBefore);
  const stillCurrent = await host.call('mvu');
  assert.equal(stillCurrent.seq, 0);
  assert.equal(stillCurrent.battle.id, opened.id);
  assert.equal(stillCurrent.battle.turn, opened.turn);
});

test('a fresh plugin instance restores the saved Showdown battle and action sequence', async () => {
  const host = makeHost();
  await host.settle();
  await host.call('starter', { id: 1 });
  const opened = await host.call('battle');
  const moveIndex = opened.request.moves.findIndex(move => move.pp > 0);
  const current = await host.call('action', { battleId: opened.id, choice: `move ${moveIndex + 1}`, seq: 0,
    turn: host.head.turn, textVersion: host.head.textVersion });
  const saved = host.storage.get(host.head.turn);
  assert.ok(saved?.data?.simulator);

  host.restart();
  const restored = await host.call('mvu');
  assert.equal(restored.battle.id, opened.id);
  assert.equal(restored.battle.turn, current.turn);
  assert.equal(restored.seq, current.seq);
  const nextMove = restored.battle.request.moves.findIndex(move => move.pp > 0);
  const afterRestore = await host.call('action', { battleId: opened.id, choice: `move ${nextMove + 1}`, seq: restored.seq,
    turn: host.head.turn, textVersion: host.head.textVersion });
  assert.equal(afterRestore.seq, restored.seq + 1);
});

test('battle trust settlement uses the host story turn after restoring a battle session', async () => {
  const { createInitialMvu, makeMon } = require('../mvu.cjs');
  const variables = createInitialMvu(), world = variables.stat_data['宝可梦'];
  world.剧情.初始御三家已选 = true;
  world.地图.节点 = 'route1'; world.地图.地点 = '1号道路'; world.地图.轮次 = 7;
  const partner = makeMon(6, 50, 'trusted-charizard');
  partner.招式 = [{ id: 'flamethrower', PP: 15, PP上限: 15 }];
  world.队伍 = [partner];
  world.羁绊.伙伴[partner.uid] = { 信赖: 0, 心情: '平静', 共同记忆: [] };
  world.遭遇 = { 类型: 'trainer', 训练家: '测试训练家', 队伍: [makeMon(16, 5, 'tiny-foe')] };
  world.战斗 = { 轮次: 7, 状态: 'pending', 结果: '', 摘要: '', 操作序号: 0 };
  const host = makeHost({ variables, turn: 900 });
  await host.settle();
  const opened = await host.call('battle');
  let current = opened;
  let moveIndex = current.request.moves.findIndex(move => move.id === 'flamethrower');
  current = await host.call('action', { battleId: opened.id, choice: `move ${moveIndex + 1}`, seq: current.seq,
    turn: host.head.turn, textVersion: host.head.textVersion });
  for (let guard = 0; guard < 4 && !current.ended; guard++) {
    host.restart();
    const restored = await host.call('mvu');
    assert.equal(restored.battle.id, opened.id);
    current = restored.battle;
    moveIndex = current.request.moves.findIndex(move => move.pp > 0 && !move.disabled);
    current = await host.call('action', { battleId: opened.id, choice: `move ${moveIndex + 1}`, seq: restored.seq,
      turn: host.head.turn, textVersion: host.head.textVersion });
  }
  assert.equal(current.ended, true);
  let savedWorld = host.variables.stat_data['宝可梦'];
  assert.equal(savedWorld.羁绊.伙伴[partner.uid].信赖, 2);
  assert.equal(savedWorld.羁绊.上次羁绊增长故事轮次, 900);
  host.restart();
  await host.call('mvu');
  savedWorld = host.variables.stat_data['宝可梦'];
  assert.equal(savedWorld.羁绊.伙伴[partner.uid].信赖, 2, 'restoring a rewarded session cannot award trust again');
  const camped = require('../mvu.cjs').theaterAction(host.variables, 'camp', { storyTurn: 900 });
  assert.equal(camped.stat_data['宝可梦'].羁绊.伙伴[partner.uid].信赖, 2, 'camp shares the exact native host turn lock');
});

test('a failed final save recovers the committed battle after restart without duplicating inventory', async () => {
  const host = makeHost();
  await host.settle();
  await host.call('starter', { id: 1 });
  const hurt = clone(host.variables), lead = hurt.stat_data['宝可梦'].队伍[0];
  lead.当前HP -= 10;
  await host.T.setVariables({ gameId: 'host-test', turn: 1, textVersion: 'text-v1', variables: hurt });
  const opened = await host.call('battle');
  const before = host.variables.stat_data['宝可梦'].背包.物品.potion;
  host.rejectNextSave = 2;
  await assert.rejects(host.call('action', { battleId: opened.id, choice: 'item potion', seq: 0,
    turn: host.head.turn, textVersion: host.head.textVersion }), error => error.code === 'BATTLE_SAVE_PENDING' && error.cause?.code === 'SAVE_REJECTED');
  assert.equal(host.variables.stat_data['宝可梦'].背包.物品.potion, before - 1);
  assert.equal(host.variables.stat_data['宝可梦'].战斗.操作序号, 1);
  assert.equal(host.storage.get(host.head.turn).data.schema,2);

  host.restart();
  const restored=await host.call('mvu');
  assert.equal(restored.seq,1);
  assert.equal(restored.battle.id,opened.id);
  assert.equal(host.variables.stat_data['宝可梦'].背包.物品.potion, before - 1);
  assert.equal(host.variables.stat_data['宝可梦'].战斗.操作序号, 1);
});

test('write-ahead failure does not consume a move or change MVU', async () => {
  const host=makeHost();await host.settle();await host.call('starter',{id:1});
  const opened=await host.call('battle'),before=clone(host.variables),saved=clone(host.storage.get(1).data);
  host.rejectNextSave=1;
  await assert.rejects(host.call('action',{battleId:opened.id,choice:'move 1',seq:0,turn:1,textVersion:'text-v1'}),{code:'SAVE_REJECTED'});
  assert.deepEqual(host.variables,before);assert.deepEqual(host.storage.get(1).data,saved);
  host.restart();const restored=await host.call('mvu');assert.equal(restored.seq,0);
});

test('ambiguous committed MVU write is recovered via journal without replay', async () => {
  const host=makeHost();await host.settle();await host.call('starter',{id:1});
  const opened=await host.call('battle');host.rejectAfterWrite=true;
  await assert.rejects(host.call('action',{battleId:opened.id,choice:'move 1',seq:0,turn:1,textVersion:'text-v1'}),/connection lost/);
  assert.equal(host.variables.stat_data.宝可梦.战斗.操作序号,1);
  host.restart();const restored=await host.call('mvu');assert.equal(restored.seq,1);assert.equal(restored.battle.id,opened.id);
});

test('rejected MVU write restores the previous simulator after restart', async () => {
  const host=makeHost();await host.settle();await host.call('starter',{id:1});
  const opened=await host.call('battle'),before=clone(host.variables);host.rejectNextWrite=true;
  await assert.rejects(host.call('action',{battleId:opened.id,choice:'move 1',seq:0,turn:1,textVersion:'text-v1'}),{code:'WRITE_REJECTED'});
  assert.deepEqual(host.variables,before);
  host.restart();const restored=await host.call('mvu');assert.equal(restored.seq,0);assert.equal(restored.battle.id,opened.id);
});

test('corrupted or mismatched journals are rejected rather than restoring a different battle', async () => {
  const host=makeHost();await host.settle();await host.call('starter',{id:1});
  const opened=await host.call('battle');host.rejectNextSave=2;
  await assert.rejects(host.call('action',{battleId:opened.id,choice:'move 1',seq:0,turn:1,textVersion:'text-v1'}),{code:'BATTLE_SAVE_PENDING'});
  const journal=host.storage.get(1).data;const savedArchive=journal.archive;
  journal.archive='not gzip';host.restart();await assert.rejects(host.call('mvu'),{code:'RECOVERY_MISMATCH'});
  journal.archive=savedArchive;host.variables.stat_data.宝可梦.背包.物品.potion++;
  host.restart();await assert.rejects(host.call('mvu'),{code:'RECOVERY_MISMATCH'});
});

test('a legacy active battle accepts only newly introduced zero-count inventory fields',async()=>{
 const host=makeHost();await host.settle();await host.call('starter',{id:1});const opened=await host.call('battle');
 const saved=host.storage.get(host.head.turn).data,keys=['potion','pokeball'];
 saved.initialWorld=null;saved.bag=Object.fromEntries(keys.map(key=>[key,saved.bag[key]]));
 saved.mvuFingerprint=__hostInternals.battleFingerprint(host.variables,keys);
 const before=clone(host.variables.stat_data.宝可梦.队伍);
 // A genuine legacy inventory can be expanded with empty new catalog entries.
 for(const key of Object.keys(host.variables.stat_data.宝可梦.背包.物品))if(!keys.includes(key))host.variables.stat_data.宝可梦.背包.物品[key]=0;
 host.restart();const restored=await host.call('mvu');assert.equal(restored.battle.id,opened.id);assert.deepEqual(restored.world.队伍,before);
 // A new nonempty item is a state edit, not a catalog migration.
 host.variables.stat_data.宝可梦.背包.物品.ether=1;host.restart();await assert.rejects(host.call('mvu'),e=>e.code==='RECOVERY_MISMATCH');
});

test('finished battle snapshots are discarded after shop changes and never restore over MVU', async () => {
  const host = makeHost();
  await host.settle();
  await host.call('starter', { id: 1 });
  const opened = await host.call('battle');
  let current = opened;
  for (let guard = 0; guard < 60 && !current.ended; guard++) {
    const request = current.request;
    const legalMove = request.moves.findIndex(move => move.pp > 0 && !move.disabled);
    const choice = legalMove >= 0 ? `move ${legalMove + 1}` : `switch ${request.switches.find(slot => slot.hp > 0 && !slot.active)?.slot}`;
    current = await host.call('action', { battleId: opened.id, choice, seq: current.seq,
      turn: host.head.turn, textVersion: host.head.textVersion });
  }
  assert.equal(current.ended, true, 'the battle should reach a terminal result using legal actions');
  const potionBefore = host.variables.stat_data['宝可梦'].背包.物品.potion;
  const injured = clone(host.variables), lead = injured.stat_data['宝可梦'].队伍[0];
  injured.stat_data['宝可梦'].地图.节点 = 'viridian'; injured.stat_data['宝可梦'].地图.地点 = '常青市';
  lead.当前HP = Math.max(1, lead.能力值.hp - 10);
  await host.T.setVariables({ gameId: 'host-test', turn: host.head.turn, textVersion: host.head.textVersion, variables: injured });
  const treated = await host.call('item', { item: 'potion', uid: lead.uid, turn: host.head.turn, textVersion: host.head.textVersion });
  assert.equal(treated.world.背包.物品.potion, potionBefore - 1);
  assert.ok(treated.world.队伍[0].当前HP > lead.当前HP);
  const beforeMoney = host.variables.stat_data['宝可梦'].训练家.金钱;
  const bought = await host.call('shop', { item: 'awakening', count: 1, turn: host.head.turn, textVersion: host.head.textVersion });
  assert.equal(bought.world.背包.物品.awakening, 1);
  assert.equal(bought.world.训练家.金钱, beforeMoney - 250);
  assert.equal(bought.world.战斗.状态, 'finished');
  const afterShop = await host.call('mvu');
  assert.equal(afterShop.world.背包.物品.awakening, 1);
  assert.equal(afterShop.world.背包.物品.potion, potionBefore - 1);

  host.restart();
  const afterRestart = await host.call('mvu');
  assert.equal(afterRestart.world.背包.物品.awakening, 1);
  assert.equal(afterRestart.world.背包.物品.potion, potionBefore - 1);
  assert.equal(afterRestart.world.训练家.金钱, beforeMoney - 250);
  assert.equal(afterRestart.world.战斗.状态, 'finished');
});

test('a new story turn preserves an unfinished battle and does not spawn an encounter over it', async () => {
  const host = makeHost();
  await host.settle();
  await host.call('starter', { id: 1 });
  const opened = await host.call('battle', { turn: 1, textVersion: 'text-v1' });
  assert.equal(__hostInternals.battleFingerprint(host.variables), host.storage.get(host.head.turn).data.mvuFingerprint);
  host.head = { ...host.head, turn: 2, textVersion: 'text-v2' };
  host.restart();
  await host.settle();
  assert.equal(__hostInternals.battleFingerprint(host.variables), host.storage.get(2).data.mvuFingerprint);
  const current = await host.call('mvu');
  assert.equal(current.battle.id, opened.id);
  assert.equal(current.battle.ended, false);
  assert.equal(current.world.遭遇.队伍[0].uid, host.variables.stat_data['宝可梦'].遭遇.队伍[0].uid);
  assert.equal(host.storage.get(2).data.battleId, opened.id);
  const moveIndex = current.battle.request.moves.findIndex(move => move.pp > 0);
  const next = await host.call('action', { battleId: opened.id, choice: `move ${moveIndex + 1}`, seq: current.seq,
    turn: 2, textVersion: 'text-v2' });
  assert.equal(next.storyTurn, 2);
  assert.equal(next.id, opened.id);
});

test('host integration only needs the public MVU and per-turn persistence API', async () => {
  const host = makeHost();
  assert.equal(typeof host.T.getTurn, 'function');
  assert.equal(typeof host.T.setVariables, 'function');
  assert.equal(typeof host.T.saveTurnData, 'function');
  assert.equal(typeof host.T.readTurnData, 'function');
  assert.equal(host.T.readConfig, undefined);
  await host.settle();
  assert.ok(host.writes > 0);
});

test('the model receives a bounded authoritative MVU and battle summary each turn', async () => {
  const host = makeHost();
  await host.settle();
  const section = host.sections.get('pokemon-kanto-mvu-context');
  assert.ok(section);
  const text = await section.text({ gameId: 'host-test', turn: 1 });
  assert.ok(text.includes('【关都宝可梦权威状态】'));
  assert.ok(text.includes('不要再次扣除'));
  assert.ok(text.includes('【进入本轮战斗】'));
  assert.doesNotMatch(text, /enemies\.skills|"skills"\s*:/);
  assert.ok(text.length <= 8000);
  const prompt = host.sections.get('pokemon-kanto-rules').text;
  assert.ok(prompt.includes('【进入本轮战斗】'));
  assert.ok(prompt.includes('不要输出敌方队伍模板'));
  assert.doesNotMatch(prompt, /enemies\.skills/);
  assert.ok(host.sections.get('pokemon-kanto-settlement').text.includes('不要生成'));
});

test('an existing MVU root gets legal derived stats recalculated while HP damage is preserved', async () => {
  const host = makeHost();
  await host.settle();
  const variables = clone(host.variables), mon = variables.stat_data['宝可梦'].队伍[0];
  const oldMax = mon.能力值.hp;
  mon.当前HP = oldMax - 3;
  mon.等级 = 8;
  mon.能力值 = { hp: oldMax, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 };
  const fainted = require('../mvu.cjs').makeMon(16, 5, 'fainted-stat-test');
  fainted.等级 = 8;
  fainted.当前HP = 0;
  fainted.能力值 = { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 };
  variables.stat_data['宝可梦'].队伍.push(fainted);
  host.variables = variables;
  const beforeWrites = host.writes;
  const state = await host.call('mvu');
  const updated = host.variables.stat_data['宝可梦'].队伍[0];
  assert.ok(host.writes > beforeWrites);
  assert.equal(updated.能力值.hp, require('../mvu.cjs').stats(updated).hp);
  assert.equal(updated.当前HP, updated.能力值.hp - 3);
  assert.equal(host.variables.stat_data['宝可梦'].队伍[1].当前HP, 0);
  assert.equal(state.world.队伍[0].能力值.hp, updated.能力值.hp);
});

test('large six-versus-six simulator transcripts are compacted under the turn-data limit', () => {
  const game = new KantoGame();
  const snapshot = game.start({
    team: [25, 1, 4, 7, 133, 16].map(id => ({ id })),
    mode: 'practice', seed: [1, 2, 3, 4],
    opponent: Array.from({ length: 6 }, () => ({ id: 129, moves: ['splash'] })),
  });
  const record = game.battles.get(snapshot.id);
  record.rewarded = true; record.encounterRound = 1; record.caughtUid = 'saved-caught-uid';
  record.moneyMultiplier=2;record.heldItemsByFoeAtDefeat={'saved-foe':{'saved-player':'luckyegg'}};
  for (let i = 0; i < 220; i++) record.battle.add('message', `回合历史 ${i} ${'记录'.repeat(45)}`);
  record.cursor = record.battle.log.length;
  const saved = __hostInternals.serializeSession({ game, record, seq: 17 }, { turn: 1, textVersion: 'v1' });
  assert.ok(Buffer.byteLength(JSON.stringify(saved), 'utf8') < 63 * 1024);
  assert.ok(saved.simulator.log.length <= 80);
  assert.equal(saved.cursor, 0);
  const restored = __hostInternals.restoreSession(saved);
  assert.equal(restored.record.id, record.id);
  assert.equal(restored.record.caughtUid, 'saved-caught-uid');
  assert.equal(restored.record.rewarded, true);
  assert.equal(restored.record.encounterRound, 1);
  assert.equal(restored.record.moneyMultiplier,2);
  assert.deepEqual(restored.record.heldItemsByFoeAtDefeat,{'saved-foe':{'saved-player':'luckyegg'}});
  assert.equal(restored.seq, 17);
});

test('battle save and restore preserve the bond-rule switch including older saves carrying Pokémon set flags',()=>{
 const game=new KantoGame(),snapshot=game.start({team:[{id:4,bondTrust:100}],opponent:[{id:129,moves:['splash']}],mode:'practice',bondBattleEffects:true,seed:[1,2,3,4]}),record=game.battles.get(snapshot.id);
 const saved=__hostInternals.serializeSession({game,record,seq:0},{turn:8,textVersion:'v8'});
 assert.equal(saved.bondBattleEffects,true);assert.equal(__hostInternals.restoreSession(saved).record.bondBattleEffects,true);
 delete saved.bondBattleEffects;const legacy=__hostInternals.restoreSession(saved);assert.equal(legacy.record.bondBattleEffects,true);
 assert.equal(legacy.record.battle.p1.pokemon[0].set.bondBattleEffects,true);
});


test('native stage requires an explicit partner choice and keeps other native variables', async () => {
  const host=makeHost({variables:{stat_data:{other:{value:7}}}});
  await host.settle();
  await assert.rejects(host.call('battle'),e=>e.code==='STARTER_REQUIRED');
  const choice=await host.call('scene',{action:'starter',id:4});
  assert.equal(choice.world.队伍[0].图鉴编号,4);
  assert.equal(host.variables.stat_data.other.value,7);
  assert.ok((await host.call('battle')).id);
  await assert.rejects(host.call('settings',{difficulty:'hell'}),e=>e.code==='BATTLE_ACTIVE');
});

test('settings API persists the bond battle switch and rejects non-boolean values', async () => {
  const { createInitialMvu } = require('../mvu.cjs');
  const variables = createInitialMvu();
  delete variables.stat_data['宝可梦'].设置.bondBattleEffects;
  const host = makeHost({ variables });
  await host.settle();
  assert.equal(host.variables.stat_data['宝可梦'].设置.bondBattleEffects, true, 'legacy settings migrate to the enabled default');
  const state = await host.call('settings', { bondBattleEffects: false });
  assert.equal(host.variables.stat_data['宝可梦'].设置.bondBattleEffects, false);
  assert.equal(state.battleEffects.bondBattleEffects, false);
  await assert.rejects(host.call('settings', { bondBattleEffects: 'off' }), /布尔值/);
});

test('finished battle rewards and restart never duplicate money or supplies, with no report route', async () => {
  const {createInitialMvu,makeMon}=require('../mvu.cjs');
  const vars=createInitialMvu(),w=vars.stat_data.宝可梦;
  w.训练家.徽章=['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章','深红徽章','绿色徽章'];
  w.剧情.初始御三家已选=true;
  w.队伍=[makeMon(6,35,'strong')];w.队伍[0].招式=[{id:'ember',PP:25,PP上限:25}];
  w.遭遇={类型:'trainer',训练家:'捕虫少年',队伍:[makeMon(10,3,'bug')]};
  const host=makeHost({variables:vars});
  await host.settle();
  await host.call('settings',{difficulty:'normal'});
  const before=clone(host.variables.stat_data.宝可梦);
  let battle=await host.call('battle');
  assert.equal(battle.difficulty,'normal');
  for(let i=0;i<15&&!battle.ended;i++)battle=await host.call('action',{battleId:battle.id,seq:battle.seq,choice:'move 1'});
  assert.ok(battle.ended);
  assert.equal(host.variables.stat_data.宝可梦.战斗.结果,'win','the MVU records the actual battle result');
  const finalFoeLevel=host.variables.stat_data.宝可梦.遭遇.队伍.at(-1).等级;
  assert.equal(finalFoeLevel,3,'the reward fixture preserves its authored opponent level');
  assert.equal(battle.rewards.金币,4*finalFoeLevel*3, 'Bug Catcher prize money uses the actual scaled last foe level');
  assert.ok(battle.rewards.经验.some(item=>item.获得>0));
  assert.equal(host.variables.stat_data.宝可梦.背包.物品.potion,before.背包.物品.potion+1);
  const money=host.variables.stat_data.宝可梦.训练家.金钱;
  const experience=host.variables.stat_data.宝可梦.队伍[0].经验,rewards=clone(host.variables.stat_data.宝可梦.战斗.奖励);
  let summaryCalls=0;host.T.backgroundModel=async()=>({id:'summary-model'});host.T.runTask=async()=>{summaryCalls++;return {text:'unrequested summary'}};
  await assert.rejects(host.call('report',{battleId:battle.id}),/report/);
  assert.equal(summaryCalls,0,'battle actions and reads do not start an AI summary task');
  host.restart();
  const reread=await host.call('mvu');
  assert.equal(reread.world.队伍[0].经验,experience);
  assert.deepEqual(reread.world.战斗.奖励,rewards);
  assert.equal(host.variables.stat_data.宝可梦.训练家.金钱,money);
  assert.equal(summaryCalls,0);
  await host.call('scene',{action:'travel',node:'route1'});
  const encounter=await host.call('scene',{action:'explore'});
  assert.equal(encounter.world.遭遇.类型,'wild');
  assert.ok((await host.call('battle')).id);
});

test('native conversation drafts preserve the selected actor after free editing and let explicit travel override the draft',async()=>{
 const mvu=require('../mvu.cjs'),variables=mvu.createInitialMvu(),w=variables.stat_data.宝可梦;
 w.剧情.初始御三家已选=true;w.地图.节点='viridian-forest';w.地图.地点='常青森林';w.战斗.状态='finished';w.遭遇=null;
 const host=makeHost({variables,turn:10});await host.settle();
 const plan=await host.call('plan',{action:'story-converse',payload:{eventId:'yellow-forest-listening'}});
 assert.match(plan.playerText,/小黄/);
 const accepted=await host.call('intent',{action:'story-converse',payload:plan.payload,playerText:'我想认真听听，那一天你为什么愿意停下来？'});
 assert.equal(accepted.queued,true);assert.equal(host.variables.stat_data.宝可梦.剧情.待执行行动.payload.eventId,'yellow-forest-listening');
 const changed=await host.call('intent',{action:'story-converse',payload:plan.payload,playerText:'我前往常青市。'});
 assert.equal(changed.queued,false);assert.equal(host.variables.stat_data.宝可梦.剧情.待执行行动,undefined);
});

test('native party route and held item effects share the same MVU', async () => {
  const host=makeHost();await host.settle();await host.call('scene',{action:'starter',id:1});
  const shopState=clone(host.variables),shopWorld=shopState.stat_data['宝可梦'];
  shopWorld.地图.节点='celadon';shopWorld.地图.地点='玉虹市';
  shopWorld.训练家.徽章=['岩石徽章','蓝色徽章','橙色徽章'];
  await host.T.setVariables({gameId:'host-test',turn:host.head.turn,textVersion:host.head.textVersion,variables:shopState});
  await host.call('shop',{item:'oranberry',count:1});
  const managed=await host.call('party',{operation:'hold',uid:'starter',itemId:'oranberry'});
  assert.equal(managed.world.队伍[0].携带道具,'oranberry');
  assert.equal(managed.world.背包.物品.oranberry,0);
  await host.call('party',{operation:'take',uid:'starter'});
  assert.equal(host.variables.stat_data.宝可梦.背包.物品.oranberry,1);
});

test('native facility route keeps its revision separate from the story turn and does not double-spend on retry',async()=>{
 const {createInitialMvu,chooseStarter}=require('../mvu.cjs');
 const variables=chooseStarter(createInitialMvu(),1),world=variables.stat_data.宝可梦;
 world.地图.节点='celadon';world.地图.地点='玉虹市';world.战斗={轮次:2,状态:'finished',结果:'',摘要:'',操作序号:0};world.遭遇=null;world.训练家.金钱=25000;
 const host=makeHost({variables,turn:50});
 let state=await host.call('mvu');
 const choose=(state,id,predicate=()=>true)=>{const opt=state.facilities.options.find(o=>o.id===id&&predicate(o));assert.ok(opt,id);return opt;};
 let opt=choose(state,'facility-coin-case');state=await host.call('scene',{action:opt.id,payload:opt.payload});
 opt=choose(state,'facility-buy-coins',o=>o.payload.coins===500);state=await host.call('scene',{action:opt.id,payload:opt.payload});
 assert.equal(state.world.训练家.金钱,15000);assert.equal(state.world.城市设施.gameCorner.coins,500);
 const retry=await host.call('scene',{action:opt.id,payload:opt.payload});assert.equal(retry.world.训练家.金钱,15000);
 opt=choose(retry,'facility-buy-coins',o=>o.payload.coins===500);state=await host.call('scene',{action:opt.id,payload:opt.payload});
 opt=choose(state,'facility-claim-prize',o=>o.payload.itemId==='charcoal');state=await host.call('scene',{action:opt.id,payload:opt.payload});
 assert.equal(state.world.背包.物品.charcoal,1);assert.equal(state.turn,50);assert.equal(state.world.城市设施.gameCorner.coins,0);
});

test('native fossil pickup becomes visible on the next story turn even when battle counter is unchanged',async()=>{
 const mvu=require('../mvu.cjs');let variables=mvu.chooseStarter(mvu.createInitialMvu(),1),world=variables.stat_data.宝可梦;
 world.地图.节点='mt-moon';world.地图.地点='月见山';world.遭遇=null;world.战斗={轮次:2,状态:'finished',结果:'',摘要:'',操作序号:0};world.地图.轮次=2;
 world.剧情.场地服务.cleared['fossil-researcher']=true;
 variables=mvu.theaterAction(variables,'field-choose-fossil',{item:'helixfossil',storyTurn:79});world=variables.stat_data.宝可梦;world.地图.节点='cinnabar';world.地图.地点='红莲岛';
 const host=makeHost({variables,turn:80});
 let state=await host.call('scene',{action:'field-revive-fossil',item:'helixfossil'});
 assert.ok(!state.theater.options.some(o=>o.id==='field-claim-revived-fossil'));
 host.head.turn=81;host.head.textVersion='text-v81';state=await host.call('mvu');
 const option=state.theater.options.find(o=>o.id==='field-claim-revived-fossil');assert.ok(option);
 state=await host.call('scene',{action:option.id,payload:option.payload});assert.ok(state.world.队伍.some(mon=>mon.图鉴编号===138&&mon.等级===5));
});

test('ongoing scene uses the trainer directing the opponent and ignores an observer',async()=>{
 const variables=mvu.createInitialMvu(4),w=variables.stat_data.宝可梦;
 w.剧情.初始御三家已选=true;w.遭遇=null;w.战斗={轮次:0,状态:'finished',结果:'',摘要:'',操作序号:0};
 const host=makeHost({variables,turn:5,textVersion:'v5'}),getTurn=host.T.getTurn;
 const scene='小刚站在一旁观战。叶子指挥妙蛙种子向小火龙发起攻击。小火龙迎上前，双方开始交手。';
 host.T.getTurn=async args=>({...await getTurn(args),text:scene});
 host.T.getHistory=async()=>[{turn:4,input:'我拒绝挑战',text:'旧剧情'},{turn:5,input:'我让小火龙迎战',text:scene}];
 const opened=await host.call('enter-battle',{natural:true,turn:5});
 assert.equal(host.variables.stat_data.宝可梦.遭遇.训练家,'叶子');
 assert.equal(host.variables.stat_data.宝可梦.遭遇.队伍[0].图鉴编号,1);assert.ok(opened.battle);
 const before=clone(host.variables);
 await assert.rejects(host.call('enter-battle',{natural:true,turn:5}),error=>error.code==='BATTLE_ACTIVE');
 assert.deepEqual(host.variables,before);
});

test('the reported Leaf coaching exchange opens from the actual message without a pending encounter',async()=>{
 const variables=mvu.createInitialMvu(4),w=variables.stat_data.宝可梦;w.剧情.初始御三家已选=true;w.遭遇=null;w.战斗={轮次:0,状态:'finished',结果:'',摘要:'',操作序号:0};
 const host=makeHost({variables,turn:7,textVersion:'v7'}),getTurn=host.T.getTurn;
 const scene='叶子没有说话，只把手往下一压。\n@bubble:leaf-one|叶子|期待|[别躲。]\n@bubble:leaf-two|叶子||[用它挡，或者用它自己快的地方。]\n小火龙听到了。藤蔓第三次过来的时候，它把身体迎过去，前爪迎上那根藤，爪尖一碰，藤蔓滑开了。\n妙蛙种子把藤鞭收回去，身子重新往下一沉。\n@bubble:brock|小刚|赞同|[好。]\n对面那个矮着身子的对手已经在蓄下一次了。';
 host.T.getTurn=async args=>({...await getTurn(args),text:scene});host.T.getHistory=async()=>[{turn:7,input:'我让小火龙继续迎战',text:scene}];
 const result=await host.call('enter-battle',{natural:true,turn:7,textVersion:'v7'});assert.ok(result.battle);assert.equal(host.variables.stat_data.宝可梦.遭遇.训练家,'叶子');assert.equal(host.variables.stat_data.宝可梦.遭遇.队伍[0].图鉴编号,1);
});

test('AI waits outside the queue, coalesces identical actions and rejects stale commits', async () => {
  const host = makeHost();
  await host.settle();
  await host.call('starter', { id: 1 });
  await host.call('settings', { difficulty: 'ai' });
  const opened = await host.call('battle', { turn: 1, textVersion: 'text-v1' });
  let release, started;
  const modelStarted = new Promise(resolve => { started = resolve; });
  let calls = 0;
  host.T.runTask = async () => { calls++; started(); return new Promise(resolve => { release = resolve; }); };
  const args = { battleId: opened.id, choice: `move ${opened.request.moves.findIndex(move => move.pp > 0) + 1}`, seq: 0, turn: 1, textVersion: 'text-v1' };
  const first = host.call('action', args);
  const duplicate = host.call('action', args);
  await modelStarted;
  const state = await Promise.race([host.call('state'), new Promise((_, reject) => setTimeout(() => reject(Error('state blocked by AI')), 1000))]);
  assert.equal(state.seq, 0);
  assert.equal(calls, 1);
  const waitingVariables=clone(host.variables);
  await assert.rejects(host.call('party',{operation:'lead',uid:'starter'}),e=>e.code==='BATTLE_ACTIVE');
  await assert.rejects(host.call('shop',{item:'potion',count:1}),e=>e.code==='BATTLE_ACTIVE');
  await assert.rejects(host.call('travel',{node:'route1'}),e=>e.code==='BATTLE_ACTIVE');
  assert.deepEqual(host.variables,waitingVariables,'configuration writes cannot poison an AI request in flight');
  release({ text: '{"choice":"move 1"}' });
  const [a, b] = await Promise.all([first, duplicate]);
  assert.equal(a.seq, 1);
  assert.deepEqual(a, b);
  assert.equal((await host.call('state')).seq, 1);

  const nextStarted = new Promise(resolve => { started = resolve; });
  const next = host.call('action', { ...args, seq: 1 });
  await nextStarted;
  host.head.textVersion = 'new-version';
  const writes = host.writes;
  release({ text: '{"choice":"move 1"}' });
  await assert.rejects(next, error => error.code === 'STALE_TURN');
  assert.equal(host.writes, writes);
});

test('battle learning pauses actions and journals confirmed or declined moves across restart', async () => {
  for (const slot of [1, 0]) {
    const host = makeHost();
    await host.settle();
    await host.call('starter', { id: 1 });
    const opened = await host.call('battle', { turn: 1, textVersion: 'text-v1' });
    const mon = host.variables.stat_data.宝可梦.队伍[0];
    const oldMoves = mon.招式.map(move => move.id);
    const move = 'razorleaf';
    mon.待学招式 = [move];
    const saved = host.storage.get(1).data;
    saved.pendingBattleLearning = [mon.uid];
    saved.mvuFingerprint = __hostInternals.battleFingerprint(host.variables);
    host.restart();
    const action = { battleId: opened.id, seq: 0, turn: 1, textVersion: 'text-v1', choice: 'move 1' };
    await assert.rejects(host.call('action', action), error => error.code === 'LEARNING_PENDING');
    const decision = { ...action, uid: mon.uid, move, slot };
    host.rejectNextSave = 2;
    await assert.rejects(host.call('learn-battle', decision), error => error.code === 'BATTLE_SAVE_PENDING');
    host.restart();
    const recovered = await host.call('state');
    assert.equal(recovered.seq, 1);
    assert.deepEqual(recovered.battle.pendingBattleLearning, []);
    const learned = recovered.world.队伍[0];
    assert.deepEqual(learned.待学招式, []);
    assert.equal(learned.招式[0].id, slot ? move : oldMoves[0]);
    assert.equal(recovered.battle.request.moves[0].id, slot ? move : oldMoves[0]);
    await assert.rejects(host.call('learn-battle', decision), error => error.code === 'STALE_ACTION');
  }
});

test('native persistent invitation survives restart, completes once, and allows a later invitation', async () => {
  const variables=mvu.createInitialMvu(4), world=variables.stat_data.宝可梦;
  world.剧情.初始御三家已选=true; world.队伍=[mvu.makeMon(6,80,'hero')];
  world.队伍[0].招式=[{id:'flamethrower',PP:15,PP上限:15}];
  world.遭遇=null; world.战斗={轮次:0,状态:'finished',结果:'',摘要:'',操作序号:0};
  const host=makeHost({variables,turn:10,textVersion:'v10'});
  let prose='@bubble:leaf|叶子|期待|[来吧。真打一场，点到为止。]\n叶子脚边的妙蛙种子走到对面。';
  const getTurn=host.T.getTurn; host.T.getTurn=async args=>({...await getTurn(args),text:prose});
  host.history.set(10,'我和叶子聊聊');
  await host.callbacks.settled({...host.head,variables:clone(host.variables),text:prose});
  const offer=clone(host.variables.stat_data.宝可梦.剧情.遭遇邀约);
  assert.equal(offer.状态,'pending'); assert.equal(offer.角色,'叶子');
  host.restart();
  assert.deepEqual((await host.call('mvu')).world.剧情.遭遇邀约,offer);
  let opened=await host.call('enter-battle',{natural:true,offerId:offer.id}); let battle={...opened.battle,seq:opened.seq};
  assert.equal(host.variables.stat_data.宝可梦.剧情.遭遇邀约.状态,'accepted');
  for(let i=0;i<30&&!battle.ended;i++) battle=await host.call('action',{battleId:battle.id,seq:battle.seq,choice:'move 1'});
  assert.ok(battle.ended); assert.equal(host.variables.stat_data.宝可梦.战斗.结果,'win');
  await assert.rejects(host.call('enter-battle',{natural:true,offerId:offer.id}),e=>e.code==='NO_PENDING_ENCOUNTER');
  host.head={...host.head,turn:11,textVersion:'v11'};
  prose='@bubble:leaf|叶子|期待|[来吧。真打一场，点到为止。]\n叶子脚边的妙蛙种子走到对面。';
  host.history.set(11,'我再次和叶子切磋');
  await host.callbacks.settled({...host.head,variables:clone(host.variables),text:prose});
  const next=host.variables.stat_data.宝可梦.剧情.遭遇邀约;
  assert.equal(next.状态,'pending'); assert.notEqual(next.id,offer.id);
  const again=await host.call('enter-battle',{natural:true,offerId:next.id}); assert.ok(again.battle || again.id);
});

test('quoted and stage invitation buttons consume the same persistent encounter in either order', async () => {
  for (const quotedFirst of [true, false]) {
    const variables=mvu.createInitialMvu(4), world=variables.stat_data.宝可梦;
    world.剧情.初始御三家已选=true; world.队伍=[mvu.makeMon(6,80,'invite-hero')];
    world.队伍[0].招式=[{id:'flamethrower',PP:15,PP上限:15}];
    world.遭遇=null; world.战斗={轮次:0,状态:'finished',结果:'',摘要:'',操作序号:0};
    const host=makeHost({variables,turn:10,textVersion:'v10'});
    const quote='来吧。真打一场，点到为止。';
    const prose=`@bubble:leaf|叶子|期待|[${quote}]\n叶子脚边的妙蛙种子走到对面。`;
    const getTurn=host.T.getTurn;host.T.getTurn=async args=>({...await getTurn(args),text:prose});
    host.history.set(10,'我和叶子聊聊');
    await host.callbacks.settled({...host.head,variables:clone(host.variables),text:prose});
    const first={natural:true,...(quotedFirst?{naturalQuote:quote}:{})};
    const second={natural:true,...(!quotedFirst?{naturalQuote:quote}:{})};
    const opened=await host.call('enter-battle',first);
    assert.equal(host.variables.stat_data.宝可梦.剧情.遭遇邀约.状态,'accepted');
    let battle={...opened.battle,seq:opened.seq};
    for(let i=0;i<30&&!battle.ended;i++)battle=await host.call('action',{battleId:battle.id,seq:battle.seq,choice:'move 1'});
    assert.equal(battle.ended,true);
    const settled=clone(host.variables);
    host.restart();
    await assert.rejects(host.call('enter-battle',second),e=>e.code==='NO_PENDING_ENCOUNTER');
    assert.deepEqual(host.variables,settled,'a second entry cannot grant another fight or rewards');
  }
});

test('starting a balanced battle journals the pristine MVU fingerprint before roster changes',async()=>{
  const host=makeHost();await host.settle();await host.call('starter',{id:4});
  await host.call('settings',{difficulty:'expert',bossTier:'enhanced'});
  const before=__hostInternals.battleFingerprint(host.variables);
  host.rejectNextWrite=true;
  await assert.rejects(host.call('battle'),error=>error.code==='WRITE_REJECTED');
  const journal=host.storage.get(host.head.turn).data;
  assert.equal(journal.schema,2);
  assert.equal(journal.beforeFingerprint,before);
  assert.equal(__hostInternals.battleFingerprint(host.variables),before);
  host.restart();const opened=await host.call('battle');assert.ok(opened.id);
});

test('moving without a new story cannot relocate a pending narrative invitation',async()=>{
  const variables=mvu.chooseStarter(mvu.createInitialMvu(4),4),w=variables.stat_data.宝可梦;
  w.遭遇=null;w.战斗={轮次:0,状态:'finished',结果:'',摘要:'',操作序号:0};
  const host=makeHost({variables,turn:10,textVersion:'v10'});
  const prose='@bubble:leaf|叶子|期待|[来吧。真打一场，点到为止。]\n叶子脚边的妙蛙种子走到对面。';
  const getTurn=host.T.getTurn;host.T.getTurn=async args=>({...await getTurn(args),text:prose});host.history.set(10,'我和叶子聊聊');
  await host.callbacks.settled({...host.head,variables:clone(host.variables),text:prose});
  const offer=clone(host.variables.stat_data.宝可梦.剧情.遭遇邀约);
  await host.call('travel',{node:'route1'});
  await assert.rejects(host.call('enter-battle',{natural:true}),e=>e.code==='STALE_TURN');
  assert.equal(host.variables.stat_data.宝可梦.剧情.遭遇邀约.id,offer.id);
  assert.equal(host.variables.stat_data.宝可梦.剧情.遭遇邀约.地点,'pallet');
  assert.equal(host.variables.stat_data.宝可梦.地图.节点,'route1');
});

test('native quest acceptance, movement and reward persist across host restarts',async()=>{
  const variables=mvu.chooseStarter(mvu.createInitialMvu(),1),world=variables.stat_data.宝可梦;
  world.遭遇=null;world.战斗={轮次:0,状态:'finished',结果:'',摘要:'',操作序号:0};
  const host=makeHost({variables,turn:10,textVersion:'v10'});
  await host.call('scene',{action:'quest-accept',payload:{questId:'oak-route1-survey'}});
  assert.equal(host.variables.stat_data.宝可梦.委托.记录['oak-route1-survey'].status,'active');
  await host.call('travel',{node:'route1'});
  assert.equal(host.variables.stat_data.宝可梦.任务.find(q=>q.questId==='oak-route1-survey').状态,'可交付');
  host.restart(); await host.call('travel',{node:'pallet'});
  const before=host.variables.stat_data.宝可梦.背包.物品.potion;
  await host.call('scene',{action:'quest-turn-in',payload:{questId:'oak-route1-survey'}});
  assert.equal(host.variables.stat_data.宝可梦.任务.find(q=>q.questId==='oak-route1-survey').状态,'已完成');
  assert.equal(host.variables.stat_data.宝可梦.背包.物品.potion,before+1);
  host.restart(); await assert.rejects(host.call('scene',{action:'quest-turn-in',payload:{questId:'oak-route1-survey'}}),/已经完成/);
  assert.equal(host.variables.stat_data.宝可梦.背包.物品.potion,before+1);
});


test('long battle preserves PP, item use, sequence and rewards through repeated host restarts', async t => {
  const variables=mvu.createInitialMvu(4), world=variables.stat_data.宝可梦;
  world.剧情.初始御三家已选=true;
  world.训练家.徽章=['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章','深红徽章','绿色徽章'];
  const mon=mvu.makeMon(6,50,'long-battle-hero');
  mon.招式=[{id:'flamethrower',PP:15,PP上限:15}]; mon.当前HP=mon.能力值.hp-30;
  world.队伍=[mon]; world.遭遇={类型:'trainer',训练家:'捕虫少年',队伍:Array.from({length:6},(_,i)=>mvu.makeMon(129,5,`long-foe-${i}`))};
  world.战斗={轮次:1,状态:'pending',结果:'',摘要:'',操作序号:0};
  const host=makeHost({variables,turn:30,textVersion:'v30'});
  await host.call('settings',{difficulty:'normal'});
  const startingPotion=host.variables.stat_data.宝可梦.背包.物品.potion;
  const startingExp=host.variables.stat_data.宝可梦.队伍[0].经验;
  let current=await host.call('battle'), seq=0, moves=0, restarts=0;
  const battleId=current.id;
  current=await host.call('action',{battleId,seq,choice:'item potion'}); seq++;
  assert.equal(current.seq,seq);
  assert.equal(host.variables.stat_data.宝可梦.背包.物品.potion,startingPotion-1);
  while(!current.ended && seq<30){
    host.restart(); restarts++;
    const restored=await host.call('mvu');
    assert.equal(restored.seq,seq); assert.equal(restored.battle.id,battleId);
    assert.equal(restored.world.背包.物品.potion,startingPotion-1);
    const move=restored.battle.request.moves.findIndex(x=>x.id==='flamethrower');
    assert.ok(move>=0); assert.equal(restored.battle.request.moves[move].pp,15-moves);
    current=await host.call('action',{battleId,seq,choice:`move ${move+1}`});
    moves++; seq++; assert.equal(current.seq,seq);
    assert.equal(host.variables.stat_data.宝可梦.战斗.操作序号,seq);
  }
  assert.equal(current.ended,true); assert.equal(host.variables.stat_data.宝可梦.战斗.结果,'win');
  assert.ok(moves>=6); assert.ok(restarts>=6);
  const finished=clone(host.variables.stat_data.宝可梦);
  assert.equal(finished.队伍[0].招式[0].PP,15-moves);
  assert.ok(finished.队伍[0].经验>startingExp);
  assert.equal(finished.背包.物品.potion,startingPotion, "one potion consumed and one battle reward granted");
  for(let i=0;i<3;i++){
    host.restart(); const restored=await host.call('mvu');
    assert.equal(restored.world.队伍[0].经验,finished.队伍[0].经验);
    assert.equal(restored.world.队伍[0].招式[0].PP,15-moves);
    assert.equal(restored.world.背包.物品.potion,finished.背包.物品.potion);
    assert.deepEqual(restored.world.战斗.奖励,finished.战斗.奖励);
  }
  t.diagnostic(`Completed ${seq} actions (${moves} moves, one item), ${current.turn} battle rounds, ${restarts+3} restarts.`);
});



