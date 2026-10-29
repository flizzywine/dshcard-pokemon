import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { apply } from '../index.mjs';

const require = createRequire(import.meta.url);
const { createInitialMvu } = require('../mvu.cjs');
const appSource = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

function loadApplyWorld() {
  const start = appSource.indexOf('function applyWorld(data, preferredBattle = undefined)');
  const end = appSource.indexOf('\n  function getMap(', start);
  assert.notEqual(start, -1, 'actual app.js contains applyWorld');
  assert.notEqual(end, -1, 'actual app.js contains the next state helper');
  const state = { items: {}, locations: [] };
  let rendered = 0;
  const jsonStart = appSource.indexOf('function renderMvuJson()');
  const jsonEnd = appSource.indexOf('\n  function hasStarterChoice(', jsonStart);
  const applyWorld = vm.runInNewContext(appSource.slice(jsonStart, jsonEnd) + '\n' + appSource.slice(start, end) + '\n; applyWorld', {
    els: {mvuJson:{parentElement:{open:false}}}, state, mvuRoot: value => value, renderWorld: () => { rendered++; }
  });
  return { state, applyWorld, rendered: () => rendered };
}

function makeHost() {
  const routes = new Map();
  const stored = new Map();
  const head = { gameId: 'seq-bridge-test', turn: 1, textVersion: 'story-v1', settled: true, busy: false };
  const variables = createInitialMvu(1);
  variables.stat_data.宝可梦.剧情.初始御三家已选 = true;
  let failSave = 0;
  const T = {
    apiVersion: 3,
    handle(name, fn) { routes.set(name, fn); },
    async getTurnState() { return { ...head }; },
    async getTurn() { return { turn: head.turn, textVersion: head.textVersion, variables: structuredClone(variables) }; },
    async setVariables(input) {
      assert.equal(input.turn, head.turn);
      assert.equal(input.textVersion, head.textVersion);
      for (const key of Object.keys(variables)) delete variables[key];
      Object.assign(variables, structuredClone(input.variables));
      return { turn: input.turn, textVersion: input.textVersion };
    },
    async saveTurnData(input) {
      if (failSave && --failSave === 0) throw Error('injected save failure');
      stored.set(input.turn, { turn: input.turn, textVersion: input.textVersion, data: structuredClone(input.data) });
      return { turn: input.turn, textVersion: input.textVersion };
    },
    async readTurnData({ turn }) { return structuredClone(stored.get(turn) || null); },
    onTurnSettled() {}, onTimelineChanged() {}, onGameRemoved() {},
    turnSection() {}, promptSection() {}, settlementSection() {}
  };
  apply({ tavern: T });
  return {
    failNextSave() { failSave = 2; },
    async call(route, body = {}) {
      const handler = routes.get(`dsh-card-pokemon-frlg-stage/${route}`);
      assert.ok(handler, `plugin registered ${route}`);
      return handler({ ...body, gameId: head.gameId });
    }
  };
}

test('a failed battle snapshot write is repaired from the committed in-memory session before another action', async () => {
  const host = makeHost();
  const opened = await host.call('battle');
  host.failNextSave();
  await assert.rejects(host.call('action', {battleId: opened.id, seq: 0, choice: 'move 1', turn: 1, textVersion: 'story-v1'}), {code:'BATTLE_SAVE_PENDING'});
  const refreshed = await host.call('mvu');
  assert.equal(refreshed.seq, 1, 'the committed action is not replayed');
  const next = await host.call('action', {battleId: opened.id, seq: 1, choice: 'move 1', turn: 1, textVersion: 'story-v1'});
  assert.equal(next.seq, 2);
});

test('a failed opening snapshot is repaired without creating another encounter', async () => {
  const host = makeHost();
  host.failNextSave();
  await assert.rejects(host.call('battle'), {code:'BATTLE_SAVE_PENDING'});
  const refreshed=await host.call('mvu');
  assert.equal(refreshed.status,'active');
  assert.equal(refreshed.seq,0);
  const again=await host.call('battle');
  assert.equal(again.id,refreshed.battle.id);
});

test('battle -> MVU refresh -> action -> MVU refresh preserves seq 0 then 1 across two legal moves', async () => {
  const host = makeHost();
  const app = loadApplyWorld();

  // Mirrors beginBattle(): keep the direct battle response, then apply the
  // authoritative /api/mvu refresh with that response as preferredBattle.
  const opened = await host.call('battle');
  assert.equal(opened.seq, 0);
  app.state.battle = opened;
  const firstRefresh = await host.call('mvu');
  assert.equal(firstRefresh.seq, 0);
  app.applyWorld(firstRefresh, opened);
  assert.equal(app.state.battle.seq, 0, 'initial MVU refresh must retain the active action sequence');

  const firstAction = await host.call('action', {
    battleId: app.state.battle.id, choice: 'move 1', seq: app.state.battle.seq,
    turn: firstRefresh.turn, textVersion: firstRefresh.textVersion
  });
  assert.equal(firstAction.seq, 1);
  app.state.battle = firstAction;
  const secondRefresh = await host.call('mvu');
  assert.equal(secondRefresh.seq, 1);
  app.applyWorld(secondRefresh, firstAction);
  assert.equal(app.state.battle.seq, 1, 'post-action MVU refresh must not erase the incremented sequence');

  const secondAction = await host.call('action', {
    battleId: app.state.battle.id, choice: 'move 1', seq: app.state.battle.seq,
    turn: secondRefresh.turn, textVersion: secondRefresh.textVersion
  });
  assert.equal(secondAction.seq, 2);
  assert.ok(app.rendered() >= 2);
});
