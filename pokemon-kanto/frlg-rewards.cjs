'use strict';

// Trainer class reward factors transcribed from pret/pokefirered at source.commit.
const CLASS_VALUES = Object.freeze({
  LEADER:25, ELITE_FOUR:25, PKMN_PROF:25, RIVAL_EARLY:4, RIVAL_LATE:9, CHAMPION:25,
  YOUNGSTER:4, BUG_CATCHER:3, HIKER:9, BIRD_KEEPER:6, PICNICKER:5, SUPER_NERD:6,
  FISHERMAN:9, TEAM_ROCKET:8, LASS:4, BEAUTY:18, BLACK_BELT:6, CUE_BALL:6,
  CHANNELER:8, ROCKER:6, GENTLEMAN:18, BURGLAR:22, SWIMMER_M:1, ENGINEER:12,
  JUGGLER:10, SAILOR:8, COOLTRAINER:9, POKEMANIAC:12, TAMER:10, CAMPER:5,
  PSYCHIC:5, BIKER:5, GAMER:18, SCIENTIST:12, CRUSH_GIRL:6, TUBER:1,
  PKMN_BREEDER:7, PKMN_RANGER:9, AROMA_LADY:7, RUIN_MANIAC:12, LADY:50,
  PAINTER:4, TWINS:3, YOUNG_COUPLE:7, SIS_AND_BRO:1, COOL_COUPLE:6, CRUSH_KIN:6,
  SWIMMER_F:1, PLAYER:1, RS_LEADER:25, RS_ELITE_FOUR:25, RS_LASS:4,
  RS_YOUNGSTER:4, PKMN_TRAINER:15, RS_HIKER:10, RS_BEAUTY:20, RS_FISHERMAN:10,
  RS_LADY:50, TRIATHLETE:10, TEAM_AQUA:5, RS_TWINS:3, RS_SWIMMER_F:2,
  RS_BUG_CATCHER:4, SCHOOL_KID:5, RICH_BOY:50, SR_AND_JR:4, RS_BLACK_BELT:8,
  RS_TUBER_F:1, HEX_MANIAC:6, RS_PKMN_BREEDER:10, TEAM_MAGMA:5, INTERVIEWER:12,
  RS_TUBER_M:1, RS_YOUNG_COUPLE:8, GUITARIST:8, RS_GENTLEMAN:20, RS_CHAMPION:50,
  MAGMA_LEADER:20, BATTLE_GIRL:6, RS_SWIMMER_M:2, POKEFAN:20, EXPERT:10,
  DRAGON_TAMER:12, RS_BIRD_KEEPER:8, NINJA_BOY:3, PARASOL_LADY:10, BUG_MANIAC:15,
  RS_SAILOR:8, COLLECTOR:15, RS_PKMN_RANGER:12, MAGMA_ADMIN:10, RS_AROMA_LADY:10,
  RS_RUIN_MANIAC:15, RS_COOLTRAINER:12, RS_POKEMANIAC:15, KINDLER:8,
  RS_CAMPER:4, RS_PICNICKER:4, RS_PSYCHIC:6, RS_SIS_AND_BRO:3, OLD_COUPLE:10,
  AQUA_ADMIN:10, AQUA_LEADER:20, BOSS:25,
});

const LABEL_CLASSES = new Map([
  ['捕虫少年','BUG_CATCHER'], ['登山男','HIKER'], ['短裤小子','YOUNGSTER'], ['迷你裙','LASS'],
  ['小茂','RIVAL_EARLY'], ['火箭队员','TEAM_ROCKET'], ['火箭队干部','TEAM_ROCKET'],
]);
const SPECIAL_CLASSES = Object.freeze({
  'rival-route22': { classId:'RIVAL_LATE', approximate:true },
  'rocket-bridge': { classId:'TEAM_ROCKET', approximate:false },
  'rocket-celadon': { classId:'TEAM_ROCKET', approximate:true },
  'silph-showdown': { classId:'RIVAL_LATE', approximate:true },
});
const source = Object.freeze({
  repository:'pret/pokefirered',
  commit:'ce6406d8c2eaf46d543c8a2606de0c3cb1951982',
  tablePath:'src/battle_main.c',
  formulaPath:'src/battle_script_commands.c',
  tableLines:'439-547',
  formulaLines:'5030-5088',
  tableSha256:'c290d325761d68c059f02dc21cc6178d4bbefa0d06ffddc8879341c090d37928',
  formulaSha256:'3b7341db8cd58c54fb0b54b47e6eef89c5c05e8a60ab4e9b45bdc907845c19b3',
});

function resolveClass(encounter) {
  if (!encounter || typeof encounter !== 'object') return null;
  if (encounter.类型 === 'wild') return null;
  if (encounter.类型 === 'gym') return { classId:'LEADER', approximate:false };
  if (encounter.specialId && SPECIAL_CLASSES[encounter.specialId]) return { ...SPECIAL_CLASSES[encounter.specialId] };
  if (encounter.campaignId === 'indigo-tournament') return { classId:'PKMN_TRAINER', approximate:true };
  if (Number.isInteger(encounter.联盟)) return { classId:encounter.联盟 >= 4 ? 'CHAMPION' : 'ELITE_FOUR', approximate:false };
  if (encounter.训练家 === '小茂') return { classId:'RIVAL_EARLY', approximate:false };
  const classId = LABEL_CLASSES.get(encounter.训练家);
  return classId ? { classId, approximate:false } : null;
}

function trainerPrize(encounter, { moneyMultiplier = 1, doubleBattle = false } = {}) {
  if (!Number.isFinite(moneyMultiplier) || moneyMultiplier < 0) throw new RangeError('moneyMultiplier必须是非负有限数。');
  if (!encounter || encounter.类型 === 'wild') return null;
  const resolved = resolveClass(encounter);
  if (!resolved) return null;
  const party = encounter.队伍;
  if (!Array.isArray(party) || !party.length) return null;
  const last = party[party.length - 1];
  if (!Number.isInteger(last?.等级) || last.等级 < 1 || last.等级 > 100) return null;
  const classValue = CLASS_VALUES[resolved.classId];
  if (!Number.isInteger(classValue)) return null;
  const amount = Math.floor(4 * last.等级 * moneyMultiplier * (doubleBattle ? 2 : 1) * classValue);
  return { classId:resolved.classId, classValue, lastLevel:last.等级, moneyMultiplier, doubleBattle, approximate:resolved.approximate, amount };
}

// Challenge bonuses are an original game rule, not part of the cartridge prize formula.
function challengeBonus(difficulty) {
  const bonuses = {
    hard:[{id:'ppmax',use:'将一个招式的PP上限提升至最大'}],
    expert:[{id:'ppmax',use:'将一个招式的PP上限提升至最大'},{id:'luckyegg',use:'携带者获得的经验提升50%'}],
    hell:[{id:'ppmax',use:'将一个招式的PP上限提升至最大'},{id:'leftovers',use:'携带者每回合恢复HP'},{id:'masterball',use:'必定捕获可捕获的野生宝可梦'}],
  };
  return bonuses[difficulty] || [];
}

module.exports = { CLASS_VALUES, LABEL_CLASSES, resolveClass, trainerPrize, challengeBonus, source };
