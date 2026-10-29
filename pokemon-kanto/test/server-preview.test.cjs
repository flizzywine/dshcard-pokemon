'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('preview routes persist isolated state and synchronize battle sequence', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanto-server-'));
  process.env.KANTO_SAVE_PATH = path.join(dir, 'save.json');
  let server = require('../server.cjs');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, {recursive:true, force:true}); delete process.env.KANTO_SAVE_PATH; });
  let base = `http://127.0.0.1:${server.address().port}`;
  async function call(route, body) { const response = await fetch(base + route, body === undefined ? {} : {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)}); return {status:response.status, data:await response.json()}; }
  assert.equal((await call('/api/health')).data.version, require('../package.json').version);
  let result = await call('/api/settings', {bossTier:'enhanced', battleMode:'singles'});
  assert.equal(result.status, 200); assert.equal(result.data.world.设置.bossTier, 'enhanced');
  result = await call('/api/party', {operation:'lead', uid:'missing'}); assert.equal(result.status,400);
  result = await call('/api/gadget', {action:'invalid', payload:{}}); assert.equal(result.status,400);
  result = await call('/api/scene', {action:'invalid', payload:{}}); assert.equal(result.status,400);
  result = await call('/api/starter', {id:1}); assert.equal(result.status,200);
  result = await call('/api/battle', {}); assert.equal(result.status,200);
  let battle = result.data;
  result = await call('/api/action', {battleId:battle.id, seq:0, choice:'move 1'}); assert.equal(result.status,200);
  assert.equal(result.data.seq,1);
  const saved = JSON.parse(fs.readFileSync(process.env.KANTO_SAVE_PATH));
  assert.equal(saved.record.actionSeq,1); assert.equal(saved.variables.stat_data.宝可梦.战斗.操作序号,1);
  result = await call('/api/action', {battleId:battle.id, seq:0, choice:'move 1'}); assert.equal(result.status,400);
  let state = await call('/api/mvu');
  while (state.data.world.战斗.状态 === 'active') {
    battle = state.data.battle;
    result = await call('/api/action', {battleId:battle.id, seq:battle.seq, choice:'move 1'});
    assert.equal(result.status, 200, JSON.stringify(result.data));
    state = await call('/api/mvu');
  }
  const oldId = state.data.battle.id;
  result = await call('/api/battle', {}); assert.equal(result.status,400);
  result = await call('/api/travel', {node:'route1'}); assert.equal(result.status,200);
  assert.equal(result.data.battle,null);
  await new Promise(resolve => server.close(resolve));
  delete require.cache[require.resolve('../server.cjs')];
  server = require('../server.cjs');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  state = await call('/api/mvu'); assert.equal(state.data.battle,null); assert.equal(state.data.world.地图.节点,'route1');
  result = await call('/api/travel', {node:'pallet'}); assert.equal(result.status,200);
  result = await call('/api/heal', {}); assert.equal(result.status,200);
  // Use a healthy high-level fixture for the later wild encounter, so its
  // outcome cannot randomly leave the only party member unable to battle.
  await new Promise(resolve => server.close(resolve));
  const fixture = JSON.parse(fs.readFileSync(process.env.KANTO_SAVE_PATH));
  fixture.variables.stat_data.宝可梦.队伍[0] = require('../mvu.cjs').makeMon(1, 50, 'starter');
  fixture.variables.stat_data.宝可梦.队伍[0].招式 = [{id:'tackle', PP:35, PP上限:35}];
  fs.writeFileSync(process.env.KANTO_SAVE_PATH, JSON.stringify(fixture));
  delete require.cache[require.resolve('../server.cjs')]; server = require('../server.cjs');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  result = await call('/api/travel', {node:'route1'}); assert.equal(result.status,200);
  result = await call('/api/next', {}); assert.equal(result.status,200);
  result = await call('/api/battle', {}); assert.equal(result.status,200); assert.notEqual(result.data.id,oldId);
  state = await call('/api/mvu');
  while (state.data.world.战斗.状态 === 'active') {
    battle = state.data.battle;
    result = await call('/api/action', {battleId:battle.id, seq:battle.seq, choice:'move 1'});
    assert.equal(result.status,200, JSON.stringify(result.data));
    state = await call('/api/mvu');
  }
  result = await call('/api/scene', {action:'wild', payload:{}});
  assert.equal(result.status,200, JSON.stringify(result.data));
  assert.equal(result.data.battle,null);
  assert.equal(JSON.parse(fs.readFileSync(process.env.KANTO_SAVE_PATH)).record,null);
  result = await call('/api/battle', {}); assert.equal(result.status,200, JSON.stringify(result.data)); assert.notEqual(result.data.id,oldId);

});
