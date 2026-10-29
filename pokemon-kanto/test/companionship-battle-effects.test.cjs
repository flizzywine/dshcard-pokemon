'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { KantoGame } = require('../engine.cjs');
const mvu = require('../mvu.cjs');

function play({ seed = [13, 0, 0, 0], trust = 0, enabled = true, playerMoves = ['tackle'], foe = { id: 16, moves: ['tackle'] } } = {}) {
  const game = new KantoGame();
  const started = game.start({
    team: [{ id: 16, moves: playerMoves, uid: 'bond-ally', bondTrust: trust }],
    opponent: [foe], mode: 'practice', seed, bondBattleEffects: enabled,
  });
  const turn = game.act({ battleId: started.id, choice: 'move 1', enemyChoice: 'move 1' });
  return { game, started, turn };
}

test('Gen 3 ordinary accuracy uses custom trust evasion tiers only when enabled', () => {
  const base = play({ trust: 0 });
  const tier60 = play({ trust: 60 });
  const tier100 = play({ trust: 100 });
  assert.equal(base.turn.events.some(event => event.startsWith('|-miss|')), false);
  assert.ok(tier60.turn.events.some(event => event.startsWith('|-miss|p2a: 波波|p1a: 波波')));
  assert.ok(tier100.turn.events.some(event => event.startsWith('|-miss|p2a: 波波|p1a: 波波')));
  assert.deepEqual(tier60.turn.bondEffect, { type: 'dodge', uid: 'bond-ally', trust: 60, baseAccuracy: 95, adjustedAccuracy: 92, multiplier: 0.97 });
  assert.deepEqual(tier100.turn.bondEffect, { type: 'dodge', uid: 'bond-ally', trust: 100, baseAccuracy: 95, adjustedAccuracy: 90, multiplier: 0.95 });

  const ordinaryMiss = play({ seed: [12, 0, 0, 0], trust: 60 });
  assert.ok(ordinaryMiss.turn.events.some(event => event.startsWith('|-miss|p2a: 波波|p1a: 波波')));
  assert.equal(ordinaryMiss.turn.bondEffect, null, 'a roll that already missed at base accuracy is not attributed to trust');

  const disabled = play({ trust: 100, enabled: false });
  assert.deepEqual(disabled.turn.events, base.turn.events, 'the off switch restores the same Gen 3 roll');
  assert.equal(disabled.turn.bondEffect, null);
  assert.equal(disabled.started.bondBattleEffects, false);
  assert.equal(disabled.started.sides[0].team[0].bondTrust, 100);
  assert.equal(disabled.started.sides[0].team[0].bondBattleEffects, false);
  assert.equal(disabled.started.sides[1].team[0].bondBattleEffects, false, 'opponents never receive MVU bond effects');
});

test('Gen 3 trust at 80 adds one actual critical stage while armor still prevents critical hits', () => {
  const ordinary = play({ seed: [36, 0, 0, 0], trust: 0 });
  const bonded = play({ seed: [36, 0, 0, 0], trust: 80 });
  assert.equal(ordinary.turn.events.some(event => event.startsWith('|-crit|')), false);
  assert.ok(bonded.turn.events.some(event => event.startsWith('|-crit|p2a: 波波')));
  assert.deepEqual(bonded.turn.bondEffect, { type: 'critical', uid: 'bond-ally', trust: 80, critStageBonus: 1 });

  const armored = play({ seed: [36, 0, 0, 0], trust: 80, foe: { id: 141, moves: ['slash'], ability: 'Battle Armor' } });
  assert.equal(armored.turn.events.some(event => event.startsWith('|-crit|')), false);
  assert.equal(armored.turn.bondEffect, null);
  const shellArmored = play({ seed: [36, 0, 0, 0], trust: 80, foe: { id: 91, moves: ['icebeam'], ability: 'Shell Armor' } });
  assert.equal(shellArmored.turn.events.some(event => event.startsWith('|-crit|')), false);
  assert.equal(shellArmored.turn.bondEffect, null);
});

test('bond accuracy adjustment skips guaranteed-hit and OHKO moves', () => {
  const guaranteed = play({ trust: 100, foe: { id: 25, moves: ['swift'] } });
  assert.ok(guaranteed.turn.events.some(event => event.startsWith('|move|p2a: 皮卡丘|Swift|p1a: 波波')));
  assert.equal(guaranteed.turn.events.some(event => event.startsWith('|-miss|p2a: 皮卡丘|p1a: 波波')), false);
  assert.equal(guaranteed.turn.bondEffect, null);

  const ohko = play({ trust: 100, foe: { id: 127, moves: ['guillotine'] } });
  assert.equal(ohko.turn.bondEffect, null, 'an OHKO check never receives the custom accuracy reduction');
});

test('MVU migration defaults custom battle effects on and exposes the effective setting', () => {
  const legacy = mvu.createInitialMvu();
  const world = legacy.stat_data['宝可梦'];
  delete world.设置.bondBattleEffects;
  const migrated = mvu.ensureMvuDefaults(legacy);
  assert.equal(migrated.stat_data['宝可梦'].设置.bondBattleEffects, true);
  assert.equal(mvu.validateMvu(migrated), true);
  assert.equal(mvu.worldView(migrated).battleEffects.bondBattleEffects, true);
  world.设置.bondBattleEffects = 'off';
  assert.throws(() => mvu.validateMvu(legacy), /布尔值/);
});

test('MVU starts pass UID trust only to the friendly simulator team and honor the global toggle', () => {
  const variables = mvu.createInitialMvu();
  const world = variables.stat_data['宝可梦'];
  world.剧情.初始御三家已选 = true;
  world.队伍 = [mvu.makeMon(16, 12, 'trusted-pidgey')];
  world.队伍[0].招式 = [{ id: 'tackle', PP: 35, PP上限: 35 }];
  world.羁绊.伙伴['trusted-pidgey'] = { 信赖: 80, 心情: '安心', 共同记忆: [] };
  world.遭遇 = { 类型: 'trainer', 训练家: '测试训练家', 队伍: [mvu.makeMon(16, 12, 'foe-pidgey')] };
  world.战斗 = { 轮次: 1, 状态: 'pending', 结果: '', 摘要: '', 操作序号: 0 };
  const enabledGame = new KantoGame();
  const enabled = mvu.startFromMvu(enabledGame, variables);
  assert.equal(enabled.bondBattleEffects, true);
  assert.deepEqual(enabled.sides[0].team.map(mon => [mon.uid, mon.bondTrust, mon.bondBattleEffects]), [['trusted-pidgey', 80, true]]);
  assert.equal(enabled.sides[1].team[0].bondBattleEffects, false);

  world.设置.bondBattleEffects = false;
  world.战斗.状态 = 'pending';
  const disabled = mvu.startFromMvu(new KantoGame(), variables);
  assert.equal(disabled.bondBattleEffects, false);
  assert.equal(disabled.sides[0].team[0].bondTrust, 80);
  assert.equal(disabled.sides[0].team[0].bondBattleEffects, false);
});
