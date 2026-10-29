'use strict';

const { catalog } = require('./engine.cjs');
const KEYS = Object.freeze(['hp', 'atk', 'def', 'spa', 'spd', 'spe']);
const LEVELS = Object.freeze(['easy', 'normal', 'hard', 'expert', 'hell', 'ai']);
const DIFFICULTY_INFO = Object.freeze({
  easy: '休闲：训练家等级降低10%，个体值不高于12；行动更宽松。首领使用原版阵容。',
  normal: '原版：保留遭遇原有队伍与强度，采用基础属性克制和有限随机性。',
  hard: '挑战：个体至少20，主攻与速度至少64努力值；首领强化阵容，偏好治疗、异常状态。',
  expert: '极难（原地狱）：训练家个体31、主攻与速度252努力值，首领极限阵容；敌人可超过道馆上限4级，主动换人、治疗、预判换人。',
  hell: '地狱突破：特殊对手先在其他难度获胜一次解锁，可反复重赛。敌方等级同步玩家队伍最高等级（最高100），个体63、每项努力值510（总3060）；读取本回合指令与完整配置，局部推演最多12个应对，药品有限量。野生精灵保留正常成长。',
  ai: 'AI：等级与训练水平贴近存活队伍，使用你选择的模型决策；失效即回退极难本地战术，无需等待整段剧情。'
});
const clone = value => structuredClone(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const speciesById = new Map(catalog.species.map(species => [species.id, species]));

function statTraining(difficulty, mon) {
  const profile = {
    easy: { iv: 12, ev: 0 }, normal: null, hard: { iv: 20, ev: 64 },
    expert: { iv: 31, ev: 252 }, hell: { iv: 31, ev: 252 }, ai: null
  }[difficulty];
  if (!profile) return false;
  for (const key of KEYS) mon.个体值[key] = difficulty === 'easy'
    ? Math.min(mon.个体值[key], profile.iv)
    : Math.max(mon.个体值[key], profile.iv);
  if (profile.ev) {
    const species = speciesById.get(mon.图鉴编号);
    const offense = species && species.stats.atk >= species.stats.spa ? 'atk' : 'spa';
    const allocation = ['expert','hell'].includes(difficulty) ? { [offense]: 252, spe: 252 } : { [offense]: profile.ev, spe: profile.ev };
    for (const key of KEYS) mon.努力值[key] = Math.max(mon.努力值[key] || 0, allocation[key] || 0);
    while (KEYS.reduce((sum, key) => sum + mon.努力值[key], 0) > 510) {
      const key = mon.努力值[offense] >= mon.努力值.spe ? offense : 'spe';
      mon.努力值[key] = Math.max(0, mon.努力值[key] - 1);
    }
  } else if (difficulty === 'easy') {
    for (const key of KEYS) mon.努力值[key] = Math.min(mon.努力值[key] || 0, 32);
  }
  return true;
}

function averages(team, field, key) {
  if (!team.length) return 0;
  return team.reduce((sum, mon) => sum + (Number(mon?.[field]?.[key]) || 0), 0) / team.length;
}

function matchPlayerTraining(mon, players, teamIndex) {
  const smallOffset = teamIndex % 3 - 1;
  for (const key of KEYS) {
    mon.个体值[key] = clamp(Math.round(averages(players, '个体值', key)) + smallOffset, 0, 31);
    mon.努力值[key] = clamp(Math.round(averages(players, '努力值', key)) + smallOffset * 4, 0, 255);
  }
  // Player EV averages stay legal, but rounding can add a point across six stats.
  while (KEYS.reduce((sum, key) => sum + mon.努力值[key], 0) > 510) {
    const key = KEYS.reduce((largest, current) => mon.努力值[current] > mon.努力值[largest] ? current : largest, 'hp');
    mon.努力值[key]--;
  }
}

function adjustWildIVs(mon, difficulty) {
  const delta = { easy: -3, hard: 3, expert: 5, hell: 7, ai: 3 }[difficulty] || 0;
  for (const key of KEYS) mon.个体值[key] = clamp((Number(mon.个体值?.[key]) || 0) + delta, 0, 31);
}

function applyEncounterDifficulty(world) {
  if (!world || typeof world !== 'object') return world;
  const encounter = world.遭遇;
  if (!encounter || typeof encounter !== 'object') return world;
  const battleState = String(world.战斗?.状态 || '').toLowerCase();
  if (battleState === 'active' || battleState === 'finished' || encounter.难度应用) return world;
  const difficulty = LEVELS.includes(world.设置?.对手难度) ? world.设置.对手难度 : 'normal';
  const next = clone(world), foe = next.遭遇;
  const team = Array.isArray(foe.队伍) ? foe.队伍 : [];
  const party = Array.isArray(next.队伍) ? next.队伍.filter(mon => Number.isFinite(mon?.等级)) : [];
  const livingPlayers = party.filter(mon => Number(mon.当前HP) > 0);
  const playerTeam = livingPlayers.length ? livingPlayers : party;
  const playerAverage = playerTeam.length ? playerTeam.reduce((sum, mon) => sum + mon.等级, 0) / playerTeam.length : 0;
  const playerHighest = party.length ? Math.max(...party.map(mon=>mon.等级)) : 0;
  const gym = foe.类型 === 'gym' || foe.类型 === 'elite' || foe.类型 === 'champion' || Boolean(foe.联盟 !== undefined);
  const wild = foe.类型 === 'wild';
  const authoredRoster = gym || Boolean(foe.specialId || foe.campaignId || foe.固定遭遇);
  const mvu = require('./mvu.cjs');
  const strength = { easy: -1, normal: 0, hard: 1, expert: 3, hell: 4, ai: 3 }[difficulty];

  if (difficulty === 'normal') {
    foe.难度应用 = { version: 1, level: difficulty, explanation: DIFFICULTY_INFO[difficulty] };
    return next;
  }

  // NPC trainers can field a roster closer to the player's available party.
  // Wild encounters, gyms, Elite Four and authored special teams retain their size.
  const originalTeam = team.slice();
  if(difficulty==='ai'&&authoredRoster&&team.length>Math.max(foe.基准队伍数量||1,playerTeam.length)){const count=Math.max(foe.基准队伍数量||1,playerTeam.length);const ace=team.at(-1);team.splice(0,team.length,...team.slice(0,Math.max(0,count-1)),ace);}
  if (!wild && !authoredRoster && difficulty === 'ai' && team.length && playerTeam.length) {
    const targetCount = Math.min(6, Math.max(1, playerTeam.length));
    team.length = Math.min(team.length, targetCount);
    for (let i = team.length; i < targetCount; i++) {
      const source = originalTeam[i % originalTeam.length];
      team.push(mvu.makeMon(source.图鉴编号, source.等级, `balance-${source.uid || foe.训练家 || 'trainer'}-${i}`));
    }
  } else if (!wild && !authoredRoster && strength >= 1 && team.length && playerTeam.length) {
    const targetCount = Math.min(6, Math.max(team.length, Math.min(playerTeam.length, team.length + 2)));
    for (let i = team.length; i < targetCount; i++) {
      const source = originalTeam[i % originalTeam.length];
      team.push(mvu.makeMon(source.图鉴编号, source.等级, `balance-${source.uid || foe.训练家 || 'trainer'}-${i}`));
    }
  }

  for (let index = 0; index < team.length; index++) {
    const mon = team[index];
    if (!mon || !Number.isInteger(mon.图鉴编号) || !Number.isInteger(mon.等级)) continue;
    const oldMaxHp = Number(mon.能力值?.hp) || 0;
    const oldHp = Number(mon.当前HP);
    if (difficulty === 'easy' && !wild) {
      mon.等级 = Math.max(1, Math.floor(mon.等级 * 0.9));
    } else if (difficulty === 'ai' && playerAverage && !wild) {
      mon.等级 = clamp(Math.round(playerAverage) + (index % 3 - 1), 1, 100);
    } else if(difficulty==='hell'&&playerHighest&&!wild){
      mon.等级=clamp(playerHighest,1,100);
    } else if (strength >= 1 && playerAverage && !wild) {
      // Keep authored levels and only raise low-level opponents toward the party.
      const floor = Math.max(1, Math.floor(playerAverage - (gym ? 6 : 3)));
      mon.等级 = Math.max(mon.等级, floor);
    }
    if(!wild&&difficulty==='expert'){
      const cap=require('./progression-rules.cjs').levelCap(next)??Math.round(playerAverage);
      mon.等级=clamp(Math.max(mon.等级,cap+4),1,100);
    }
    if (wild) adjustWildIVs(mon, difficulty);
    else if (difficulty === 'ai' && playerTeam.length) matchPlayerTraining(mon, playerTeam, index);
    else statTraining(difficulty, mon);
    mon.经验 = mvu.expAt(mon.等级, mon.图鉴编号);
    mon.能力值 = mvu.stats(mon);
    if(!wild&&difficulty==='hell'){
      const overcap=require('./npc-overcap.cjs');mon.突破={...overcap.profile};
      const {Dex}=require('./engine.cjs');mon.能力值=overcap.calculate(speciesById.get(mon.图鉴编号).stats,mon.等级,Dex.natures.get(mon.性格));
    }
    mon.当前HP = oldHp === 0 ? 0 : Math.max(1, Math.min(mon.能力值.hp, oldHp + mon.能力值.hp - oldMaxHp));
  }
  if(!wild&&difficulty==='hell'){foe.itemInventory={...(foe.itemInventory||{}),fullrestore:Math.max(3,foe.itemInventory?.fullrestore||0)};foe.itemPolicy={...(foe.itemPolicy||{}),maxUses:Math.max(3,foe.itemPolicy?.maxUses||0),allowed:[...new Set([...(foe.itemPolicy?.allowed||Object.keys(foe.itemInventory)),'fullrestore'])]};}
  foe.难度应用 = { version: 1, level: difficulty, explanation: DIFFICULTY_INFO[difficulty] };
  return next;
}

module.exports = { LEVELS, DIFFICULTY_INFO, applyEncounterDifficulty };
