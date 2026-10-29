'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyEncounterDifficulty, DIFFICULTY_INFO } = require('../encounter-balance.cjs');
const { catalog } = require('../engine.cjs');
const mvu = require('../mvu.cjs');

function world(difficulty, type = 'trainer', ids = [16, 19]) {
  return {
    设置: { 对手难度: difficulty },
    队伍: [mvu.makeMon(25, 22, 'player-a'), mvu.makeMon(4, 20, 'player-b'), mvu.makeMon(7, 18, 'player-c')],
    遭遇: { 类型: type, 训练家: type === 'gym' ? '小刚' : '训练家', 道馆: type === 'gym' ? 0 : undefined,
      队伍: ids.map((id, index) => mvu.makeMon(id, 15 + index, `foe-${id}-${index}`)) },
    战斗: { 状态: 'pending' }
  };
}

function totalStats(team) { return team.reduce((sum, mon) => sum + Object.values(mon.能力值).reduce((a, b) => a + b, 0), 0); }

test('normal preserves the authored enemy team exactly and adds an explanation stamp', () => {
  const source = world('normal'), before = structuredClone(source.遭遇.队伍);
  const result = applyEncounterDifficulty(source);
  assert.deepEqual(result.遭遇.队伍, before);
  assert.equal(result.遭遇.难度应用.level, 'normal');
  assert.match(result.遭遇.难度应用.explanation, /保留/);
  assert.equal(source.遭遇.难度应用, undefined);
});

test('easy weakens a trainer while hell builds a legal, player-level-adjacent roster', () => {
  const easy = applyEncounterDifficulty(world('easy'));
  const hell = applyEncounterDifficulty(world('hell'));
  const baseline = world('normal');
  assert.ok(totalStats(easy.遭遇.队伍) < totalStats(baseline.遭遇.队伍));
  assert.ok(totalStats(hell.遭遇.队伍) > totalStats(baseline.遭遇.队伍));
  assert.ok(hell.遭遇.队伍.length >= 3 && hell.遭遇.队伍.length <= 6);
  for (const mon of hell.遭遇.队伍) {
    const species = catalog.species.find(entry => entry.id === mon.图鉴编号);
    assert.ok(species);
    assert.ok(mon.等级 >= 1 && mon.等级 <= 100);
    assert.ok(Object.values(mon.个体值).every(value => value >= 0 && value <= 31));
    assert.ok(Object.values(mon.努力值).every(value => value >= 0 && value <= 255));
    assert.ok(Object.values(mon.努力值).reduce((sum, value) => sum + value, 0) <= 510);
    assert.ok(mon.招式.every(move => species.moves.includes(move.id)));
    assert.deepEqual(mon.能力值, mvu.stats(mon,{allowOvercap:true}));assert.equal(mon.突破.iv,63);assert.equal(mon.突破.evTotal,3060);
  }
  assert.ok(hell.遭遇.队伍.every(mon => Math.abs(mon.等级 - 22) <= 6));
});

test('gym species and authored team size are preserved at high difficulty', () => {
  const source = world('expert', 'gym', [74, 95]);
  const result = applyEncounterDifficulty(source);
  assert.deepEqual(result.遭遇.队伍.map(mon => mon.图鉴编号), [74, 95]);
  assert.equal(result.遭遇.队伍.length, source.遭遇.队伍.length);
});

test('hard and expert never lower an authored boss level', () => {
  for (const difficulty of ['hard', 'expert']) {
    const source = world(difficulty, 'gym', [74]);
    source.队伍 = [mvu.makeMon(25, 5, `player-${difficulty}`)];
    source.遭遇.队伍[0] = mvu.makeMon(74, 14, `boss-${difficulty}`);
    const originalLevel = source.遭遇.队伍[0].等级;
    const result = applyEncounterDifficulty(source);
    assert.ok(result.遭遇.队伍[0].等级>=originalLevel, `${difficulty} must not nerf a higher-level boss`);
    assert.ok(Object.values(result.遭遇.队伍[0].能力值).reduce((sum, value) => sum + value, 0) >
      Object.values(source.遭遇.队伍[0].能力值).reduce((sum, value) => sum + value, 0));
  }
});

test('Hell level follows the highest party level instead of the authored level or badge cap',()=>{
 for(const level of [5,34,100]){const source=world('hell','gym',[74]);source.队伍=[mvu.makeMon(25,5,'low'),mvu.makeMon(4,level,'highest')];source.队伍[1].当前HP=0;source.遭遇.队伍[0]=mvu.makeMon(74,60,'authored-high');const result=applyEncounterDifficulty(source);assert.equal(result.遭遇.队伍[0].等级,level);assert.ok(result.遭遇.队伍[0].突破);assert.equal(source.遭遇.队伍[0].等级,60,'matching does not modify the source state');}
});

test('AI matches the living party training and roster size with only a small margin', () => {
  const source = world('ai', 'trainer', [16]);
  source.队伍 = [mvu.makeMon(25, 30, 'ai-player-high'), mvu.makeMon(4, 20, 'ai-player-low'), mvu.makeMon(7, 2, 'ai-player-fainted')];
  for (const mon of source.队伍) {
    mon.个体值 = Object.fromEntries(['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map(key => [key, mon.uid.endsWith('high') ? 20 : mon.uid.endsWith('low') ? 16 : 31]));
    mon.努力值 = { hp: 0, atk: mon.uid.endsWith('high') ? 40 : mon.uid.endsWith('low') ? 20 : 255, def: 0, spa: 0, spd: 0, spe: 0 };
    mon.能力值 = mvu.stats(mon);
  }
  source.队伍[2].当前HP = 0;
  const players = source.队伍.slice(0, 2), result = applyEncounterDifficulty(source);
  assert.equal(result.遭遇.队伍.length, players.length);
  for (const mon of result.遭遇.队伍) {
    assert.ok(Math.abs(mon.等级 - 25) <= 2);
    assert.ok(Object.values(mon.个体值).every(value => value >= 17 && value <= 20));
    assert.ok(Math.abs(mon.努力值.atk - 30) <= 5);
    assert.ok(Object.values(mon.努力值).reduce((sum, value) => sum + value, 0) < 100);
  }
});

test('wild species and local encounter level are not rerolled or moved outside their source roll', () => {
  const source = world('easy', 'wild', [16]);
  source.遭遇.队伍[0].等级 = 7;
  source.遭遇.队伍[0].经验 = mvu.expAt(7, 16);
  source.遭遇.队伍[0].能力值 = mvu.stats(source.遭遇.队伍[0]);
  const result = applyEncounterDifficulty(source);
  assert.equal(result.遭遇.队伍[0].图鉴编号, 16);
  assert.equal(result.遭遇.队伍[0].等级, 7);
  assert.deepEqual(result.遭遇.队伍[0].努力值, source.遭遇.队伍[0].努力值);
  const hell = world('hell', 'wild', [16]);
  const wildResult = applyEncounterDifficulty(hell);
  assert.deepEqual(wildResult.遭遇.队伍[0].努力值, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  assert.equal(wildResult.遭遇.队伍[0].等级, hell.遭遇.队伍[0].等级);
});

test('AI does not resize special or campaign rosters', () => {
  for (const marker of ['specialId', 'campaignId']) {
    const source = world('ai', 'trainer', [16]); source.遭遇[marker] = 'authored-boss';
    const result = applyEncounterDifficulty(source);
    assert.equal(result.遭遇.队伍.length, source.遭遇.队伍.length);
  }
});

test('application is idempotent and leaves already activated encounters unchanged', () => {
  const source = world('hell'), once = applyEncounterDifficulty(source), twice = applyEncounterDifficulty(once);
  assert.deepEqual(twice, once);
  const active = world('hell'); active.战斗.状态 = 'active';
  assert.equal(applyEncounterDifficulty(active), active);
  assert.equal(active.遭遇.难度应用, undefined);
  const finished = world('hell'); finished.战斗.状态 = 'finished';
  assert.equal(applyEncounterDifficulty(finished), finished);
  assert.ok(Object.values(DIFFICULTY_INFO).every(text => typeof text === 'string' && text.length > 5));
});
