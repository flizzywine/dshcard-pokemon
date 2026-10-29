'use strict';

const GYMS = Object.freeze({
  brock: { key:'rock', title:'尼比道馆', badge:'岩石徽章', accent:'#b97949', line:'沉住气，石头会记住每一次冲击。' },
  misty: { key:'water', title:'华蓝道馆', badge:'蓝色徽章', accent:'#438fcb', line:'水流不会停，攻势也不会。' },
  lt_surge: { key:'electric', title:'枯叶道馆', badge:'橙色徽章', accent:'#c4a238', line:'别眨眼，电光只留一瞬。' },
  erika: { key:'grass', title:'玉虹道馆', badge:'彩虹徽章', accent:'#5f9b62', line:'静下心来，才能看见生长的方向。' },
  koga: { key:'poison', title:'浅红道馆', badge:'粉红徽章', accent:'#a35a9e', line:'真正的较量，往往始于看不见的地方。' },
  sabrina: { key:'psychic', title:'金黄道馆', badge:'金色徽章', accent:'#aa5a84', line:'你的下一步，已经写在眼神里。' },
  blaine: { key:'fire', title:'红莲道馆', badge:'深红徽章', accent:'#dc6541', line:'让热度升起来，答案自会显现。' },
  giovanni: { key:'earth', title:'常青道馆', badge:'绿色徽章', accent:'#687c54', line:'实力，决定谁掌握局面。' }
});
const bossProfiles = require('./boss-profiles.cjs');
const ROCKET_BOSS_SCENES = Object.freeze({
  apollo: { key:'rocket-apollo', accent:'#9d5260', line:'阿波罗不会把火箭队的计划交给偶然。' },
  athena: { key:'rocket-athena', accent:'#bb6484', line:'雅典娜已经看清了你的来意。' },
  lance_rocket: { key:'rocket-lance', accent:'#7b738f', line:'兰斯拦住去路，等待你先出招。' },
  lambda: { key:'rocket-lambda', accent:'#7562a0', line:'拉姆达带着新的算计迎上前来。' },
  rocket_viridian: { key:'rocket-viridian', accent:'#79834c', line:'坂木站在常青道馆深处，亲自迎战。' }
});
const ROCKET_BOSSES = Object.freeze(Object.fromEntries(bossProfiles.definitions()
  .filter(profile => profile.role.startsWith('rocket-') && ROCKET_BOSS_SCENES[profile.id])
  .map(profile => [profile.id, Object.freeze({ kind:'rocket', ...ROCKET_BOSS_SCENES[profile.id], title:`${profile.role === 'rocket-boss' ? '火箭队首领' : '火箭队干部'} · ${profile.name}`, opponent:profile.name })])));
const SPECIAL = Object.freeze({
  rival_early: { kind:'rival', key:'rival', title:'劲敌对决', accent:'#4f85b8', line:'先到一步的人，可不会等你。' },
  rival_late: { kind:'champion', key:'champion', title:'冠军之战', accent:'#c38d38', line:'把一路走来的答案，拿出来吧。' },
  lorelei: { kind:'elite', key:'ice', title:'四天王 · 科拿', accent:'#559fb8', line:'冷静下来，再看清每一步。' },
  bruno: { kind:'elite', key:'fighting', title:'四天王 · 希巴', accent:'#bc6747', line:'站稳脚步，正面迎战。' },
  agatha: { kind:'elite', key:'ghost', title:'四天王 · 菊子', accent:'#7861a6', line:'老练的对手，不会给你空隙。' },
  lance: { kind:'elite', key:'dragon', title:'四天王 · 渡', accent:'#5674b4', line:'飞向更高处之前，先接下这一击。' }
});
const LEGENDARIES = Object.freeze({
  144: { name:'急冻鸟', key:'ice', accent:'#75b8d0', line:'寒风停下了。有什么正在注视着你。' },
  145: { name:'闪电鸟', key:'electric', accent:'#d1ad39', line:'云层亮起，雷声先一步抵达。' },
  146: { name:'火焰鸟', key:'fire', accent:'#e56b39', line:'火光划过天际，热浪席卷而来。' },
  150: { name:'超梦', key:'psychic', accent:'#a464bd', line:'沉重的念力压住了四周的空气。' },
  151: { name:'梦幻', key:'psychic', accent:'#cf7eaa', line:'一抹身影掠过，战斗悄然开始。' }
});
const NORMAL = Object.freeze({ kind:'trainer', key:'standard', title:'训练家对战', accent:'#6b8a71', line:'准备好了吗？' });
const ENTRANCE_MS = Object.freeze({
  rock: 1010, water: 1070, electric: 1130, grass: 1190, poison: 1250, psychic: 1310, fire: 1370, earth: 1500,
  rival: 1280, champion: 1500, ice: 1340, fighting: 1160, ghost: 1400, dragon: 1460,
  rocket: 1080, 'rocket-apollo':1160, 'rocket-athena':1240, 'rocket-lance':1320, 'rocket-lambda':1400, 'rocket-viridian':1480,
  'legendary-144': 1280, 'legendary-145': 1160, 'legendary-146': 1220, 'legendary-150': 1500, 'legendary-151': 1100,
  league: 1440, 'quest-guardian': 1380
});
const IMPORTANT_BEATS = Object.freeze(['entrance', 'ace-reveal', 'pressure-turn', 'outcome']);

function buildBattleCinematic({ encounter = {}, npcId = '', npcName = '', trainers = [] } = {}) {
  const trainerId = String(npcId || '').toLowerCase();
  const trainer = trainers.find(entry => String(entry?.id || '').toLowerCase() === trainerId) || null;
  const name = String(npcName || encounter?.训练家 || trainer?.name || '对手');
  const roster = Array.isArray(encounter?.队伍) ? encounter.队伍 : [];
  const mon = roster[0] || null;
  const ace = roster.at(-1) || null;
  const speciesId = Number(mon?.图鉴编号 || mon?.id || 0);
  const aceSpeciesId = Number(ace?.图鉴编号 || ace?.id || 0);
  let theme = ROCKET_BOSSES[encounter?.bossProfileId] || (encounter?.specialId ? (encounter.theme==='rival'?SPECIAL.rival_early:encounter.theme==='rocket'?{kind:'rocket',key:'rocket',title:encounter.title,accent:'#9c4d52',line:'这一次的交手，会留下各自的答案。'}:null) : null);
  if (String(encounter?.类型 || '') === 'gym') theme = GYMS[trainerId] || (Number.isInteger(encounter?.道馆) ? Object.values(GYMS)[encounter.道馆] : null);
  if (!theme && encounter?.固定遭遇 && LEGENDARIES[speciesId]) theme = { ...LEGENDARIES[speciesId], key:`legendary-${speciesId}`, kind:'legendary', title:LEGENDARIES[speciesId].name };
  if (!theme && /火箭队|rocket/i.test(name)) theme = { kind:'rocket', key:'rocket', title:'火箭队对决', accent:'#9c4d52', line:'我们看中的东西，不会轻易放手。' };
  if (!theme) theme = SPECIAL[trainerId] || null;
  if (!theme && /冠军/.test(String(trainer?.role || ''))) theme = SPECIAL.rival_late;
  if (!theme && /四天王/.test(String(trainer?.role || ''))) theme = SPECIAL[trainerId] || { kind:'elite', key:'league', title:`四天王 · ${name}`, accent:'#776b91', line:'联盟之路，到此接受检验。' };
  if (!theme && /火箭队/.test(String(trainer?.role || ''))) theme = { kind:'rocket', key:'rocket', title:'火箭队对决', accent:'#9c4d52', line:'我们看中的东西，不会轻易放手。' };
  if (!theme && (encounter?.importantKind === 'quest' || encounter?.questId || encounter?.委托ID || /委托/.test(String(encounter?.title || '')))) {
    theme = { kind:'quest', key:'quest-guardian', title:encounter?.title || `${name} · 守护委托`, accent:'#6d9b76', line:'这场交手关系到委托目标的安全。' };
  }
  theme ||= NORMAL;
  const badge = GYMS[trainerId]?.badge || '';
  const kind = theme.kind || (String(encounter?.类型 || '') === 'gym' ? 'gym' : 'trainer');
  const importantKind = theme === NORMAL ? '' : kind === 'champion' ? 'rival' : kind;
  const scene = kind === 'gym' ? `gym-${theme.key || 'standard'}`
    : kind === 'rival' || kind === 'champion' ? 'rival-diagonal'
      : kind === 'rocket' ? 'rocket-alert'
        : kind === 'quest' ? 'quest-guardian'
          : kind === 'elite' ? 'elite-trial'
            : kind === 'legendary' ? 'legendary-arrival' : '';
  return {
    kind, key: theme.key || 'standard', title: encounter?.bossProfileId && ROCKET_BOSSES[encounter.bossProfileId] ? theme.title : encounter?.specialId ? encounter.title : theme.title || name,
    opponent: theme.opponent || (theme.kind === 'legendary' ? theme.title : name), accent: theme.accent || NORMAL.accent, line: theme.line || NORMAL.line,
    badge, portrait: trainer?.art || trainer?.image || '', important: theme !== NORMAL,
    duration: ENTRANCE_MS[theme.key] || 1760,
    opponentSpeciesId: speciesId || null,
    importantKind,
    scene,
    beats: theme === NORMAL ? [] : [...IMPORTANT_BEATS],
    aceSpeciesId: aceSpeciesId || null
  };
}

module.exports = { GYMS, SPECIAL, LEGENDARIES, buildBattleCinematic };
