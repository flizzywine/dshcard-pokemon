'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {KantoGame, catalog, Battle} = require('./engine.cjs');
const mvu = require('./mvu.cjs');
const {presentation} = require('./presentation.cjs');
const party = require('./party.cjs');
const gadgets = require('./quest-gadgets.cjs');
let game = new KantoGame();
let variables = mvu.createInitialMvu();
let current = null;
let seq = 0;
const savePath = process.env.KANTO_SAVE_PATH || path.join(__dirname, 'save', 'game.json');
function encode(record) {
  if (!record) return null;
  return {...record, battle: record.battle.toJSON()};
}
function decode(saved) { return saved ? {...saved, bag: mvu.inventoryFromRecord(saved.bag), battle: Battle.fromJSON(saved.battle)} : null; }
try {
  if (fs.existsSync(savePath)) {
    const saved = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    variables = mvu.ensureMvuDefaults(saved.variables);
    mvu.validateMvu(variables); seq = saved.seq || 0; current = decode(saved.record);
    if (current) { current.actionSeq = seq; game.battles.set(current.id, current); }
  }
} catch (error) { console.error('预览存档未读取，使用新游戏：' + error.message); }
function persist(nextVars = variables, nextRecord = current, nextSeq = seq) {
  fs.mkdirSync(path.dirname(savePath), {recursive: true});
  fs.writeFileSync(savePath + '.tmp', JSON.stringify({version: 1, variables: nextVars, record: encode(nextRecord), seq: nextSeq}), 'utf8');
  fs.renameSync(savePath + '.tmp', savePath);
  variables = nextVars; current = nextRecord; seq = nextSeq;
  game.battles.clear(); if (current) game.battles.set(current.id, current);
}
function snapshot() { return current ? {...game.snapshot({...current}), seq} : null; }
function view() {
  const worldView = mvu.worldView(variables);
  return {...worldView, turn: variables.stat_data.宝可梦.地图.轮次, battle: snapshot(), seq,
    presentation: presentation(worldView.world)};
}
function mutate(body, route) {
  if (route === '/api/battle') {
    if (current && variables.stat_data.宝可梦.战斗.状态 === 'active' && !current.battle.ended) return snapshot();
    const candidate = new KantoGame();
    const snap = mvu.startFromMvu(candidate, variables), record = candidate.battles.get(snap.id);
    const nextVars = mvu.applyBattleResult(variables, record);
    persist(nextVars, record, 0); return {...snap, seq: 0};
  }
  if (route === '/api/action') {
    if (!current || body.battleId !== current.id) throw Error('战斗已过期，请刷新。');
    if (body.seq !== undefined && body.seq !== seq) throw Error('指令已过期，请刷新后操作。');
    const candidate = new KantoGame(), record = decode(encode(current)); candidate.battles.set(record.id, record);
    const action=candidate.act(body); record.actionSeq = seq + 1; const nextVars = mvu.applyBattleResult(variables, record);
    const snap={...candidate.snapshot(record),events:action.events}; persist(nextVars, record, seq + 1); return {...snap, seq};
  }
  if (route === '/api/learn-battle') {
    if (!current || body.battleId !== current.id || body.seq !== seq) throw Error('指令已过期，请刷新后操作。');
    const record=decode(encode(current)); record.actionSeq = seq + 1; const nextVars=mvu.learnBattleMove(variables,record,body.uid,body.move,body.slot);
    persist(nextVars,record,seq+1);return view();
  }
  if (route === '/api/item') {
    const nextVars = mvu.useItem(variables, body.item, body.uid,{slot:body.slot});
    persist(nextVars); return view();
  }
  if (route === '/api/next') {
    if (variables.stat_data.宝可梦.战斗.状态 !== 'finished') throw Error('请先完成本轮战斗。');
    const nextVars = mvu.ensureEncounter(variables, variables.stat_data.宝可梦.地图.轮次 + 1);
    persist(nextVars, null, 0); return view();
  }
  if (route === '/api/scene') {
    if (body.action === 'start-battle') { mutate(body, '/api/battle'); return view(); }
    const nextVars = mvu.theaterAction(variables, body.action, {...(body.payload && typeof body.payload === 'object' ? body.payload : {}), storyTurn: variables.stat_data.宝可梦.地图.轮次});
    const finished = variables.stat_data.宝可梦.战斗.状态 === 'finished';
    persist(nextVars, finished ? null : current, finished ? 0 : seq); return view();
  }
  if (route === '/api/party') {
    const actions = {forget:'forgetMove', forgetHm:'forgetHmMove', hold:'holdItem', take:'takeHeldItem', evolve:'evolvePokemon', evolutionConfirm:'confirmEvolution', evolutionCancel:'cancelEvolution', lead:'setLead', release:'releasePokemon'};
    persist(party.manageParty(variables, actions[body.operation], body)); return view();
  }
  if (route === '/api/gadget') {
    persist(mvu.toolAction(variables, body.action, body.payload || {}, variables.stat_data.宝可梦.地图.轮次)); return view();
  }
  if (route === '/api/settings') {
    const nextVars = mvu.ensureMvuDefaults(variables), world = nextVars.stat_data.宝可梦;
    if (world.战斗.状态 === 'active') throw Error('请在战斗结束后修改难度。');
    for (const [key, field, allowed] of [['difficulty','对手难度',['easy','normal','hard','expert','hell','ai']], ['bossTier','bossTier',['auto','original','enhanced','extreme']], ['battleMode','battleMode',['singles','doubles']], ['version','版本',['firered','leafgreen']]]) {
      if (body[key] !== undefined) { if (!allowed.includes(body[key])) throw Error('设置值无效。'); world.设置[field] = body[key]; }
    }
    for (const [key, field] of [['supplies','战后补给'], ['bondBattleEffects','bondBattleEffects'], ['levelCap','道馆等级上限']]) {
      if (body[key] !== undefined) { if (typeof body[key] !== 'boolean') throw Error('设置开关必须为布尔值。'); world.设置[field] = body[key]; }
    }
    if (body.gadgetConfig !== undefined) gadgets.applyConfig(world, body.gadgetConfig.key, body.gadgetConfig.value);
    mvu.validateMvu(nextVars); persist(nextVars); return view();
  }
  const helpers = {'/api/travel': () => mvu.travel(variables, body.node),
    '/api/starter': () => mvu.chooseStarter(variables, body.id), '/api/heal': () => mvu.healAtCenter(variables),
    '/api/shop': () => mvu.buyItem(variables, body.item, body.count), '/api/box': () => mvu.moveBox(variables, body.uids??body.uid, body.direction),
    '/api/learn': () => mvu.learnMove(variables, body.uid, body.move, body.slot)};
  if (!helpers[route]) throw Error('未知操作。');
  const nextVars = helpers[route]();
  // A finished simulator is historical; the next encounter always reads fresh MVU.
  const finished = variables.stat_data.宝可梦.战斗.状态 === 'finished';
  persist(nextVars, finished ? null : current, finished ? 0 : seq); return view();
}
const root = path.join(__dirname, 'public');
const mediaRoot = path.resolve(__dirname, '../resources');
const mediaRoutes = [
  ['/assets/fx/', path.join(mediaRoot, 'kanto-fx-1027')],
  ['/assets/pokemon/animated/', path.join(mediaRoot, 'kanto-animated-096/assets/pokemon/animated')],
  ['/assets/pokemon/hd/', path.join(mediaRoot, 'kanto-animated-096/assets/pokemon/hd')],
];
const mime = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.gif':'image/gif', '.webp':'image/webp', '.svg':'image/svg+xml', '.ogg':'audio/ogg', '.mp3':'audio/mpeg', '.wav':'audio/wav'};
function json(res, status, body) { res.writeHead(status, {'Content-Type': mime['.json'], 'Cache-Control': 'no-store'}); res.end(JSON.stringify(body)); }
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/api/dex') return json(res, 200, catalog);
    if (req.method === 'GET' && url.pathname === '/api/mvu') return json(res, 200, view());
    if (req.method === 'GET' && url.pathname === '/api/presentation') return json(res, 200, presentation(variables.stat_data.宝可梦));
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, {ok: true, app: 'pokemon-kanto', version: require('./package.json').version});
    if (req.method === 'POST' && ['/api/battle', '/api/action', '/api/next', '/api/travel', '/api/starter', '/api/heal', '/api/shop', '/api/item', '/api/box', '/api/learn', '/api/learn-battle', '/api/scene', '/api/party', '/api/settings', '/api/gadget'].includes(url.pathname)) {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(res, 403, {error: '请在本地游戏页面操作。'});
      let body = '';
      for await (const part of req) { body += part; if (body.length > 65536) return json(res, 413, {error: '请求过大。'}); }
      const input = JSON.parse(body);
      return json(res, 200, mutate(input, url.pathname));
    }
    if (req.method !== 'GET') return json(res, 405, {error: '不支持的请求。'});
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const mounted = mediaRoutes.find(([prefix]) => pathname.startsWith(prefix));
    const staticRoot = mounted ? mounted[1] : root;
    const relative = mounted ? pathname.slice(mounted[0].length) : pathname.slice(1);
    const target = path.resolve(staticRoot, relative);
    if (!target.startsWith(staticRoot + path.sep)) return json(res, 403, {error: '无效路径。'});
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return json(res, 404, {error: '文件不存在。'});
    res.writeHead(200, {'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff'});
    // Only the standalone preview injects these roots. Native DSH views use
    // their own host-resolved asset URLs and never receive this response.
    if (target === path.join(root, 'index.html')) {
      const boot = '<script>window.__KANTO_FX_ASSET_ROOT__="/assets/fx/";window.__KANTO_ANIMATED_ROOT__="/";</script>';
      return res.end(fs.readFileSync(target, 'utf8').replace('</head>', boot + '</head>'));
    }
    fs.createReadStream(target).pipe(res);
  } catch (error) { json(res, 400, {error: error.message || '无法执行操作。'}); }
});
if (require.main === module) {
  const port = Number(process.env.KANTO_PORT || 4177);
  server.listen(port, '127.0.0.1', () => console.log(`关都对战初版：http://127.0.0.1:${port}`));
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? '端口已占用；请打开已运行的游戏，或设置 KANTO_PORT。' : error); process.exitCode = 1; });
}
module.exports = server;
