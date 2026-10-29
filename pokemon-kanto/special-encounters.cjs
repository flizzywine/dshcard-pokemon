'use strict';

const clone = value => structuredClone(value);
const STARTER_FAMILY = new Map([[1, 1], [2, 1], [3, 1], [4, 4], [5, 4], [6, 4], [7, 7], [8, 7], [9, 7]]);
const COUNTER_STARTER = Object.freeze({ 1: 4, 4: 7, 7: 1 });
const ENCOUNTERS = Object.freeze([
  { id: 'rival-route22', location: 'route22', requiresBadges: 0, requiresFirstRival: true, trainer: '小茂', title: '22号道路：小茂的再战', theme: 'rival', souvenir: 'route22-rival', clue: '小茂记住了这次在22号道路的较量，约好以后还要认真交手。', fixed: [{ speciesId: 16, level: 9 }, { counterStarter: true, level: 9 }] },
  { id: 'rocket-bridge', location: 'route24', requiresBadges: 1, trainer: '火箭队员', title: '金珠桥：火箭队员的拦路战', theme: 'rocket', souvenir: 'rocket-bridge', clue: '你在金珠桥挫败了火箭队员的拦路行动。', fixed: [{ speciesId: 41, level: 15 }, { speciesId: 23, level: 17 }] },
  { id: 'rocket-celadon', location: 'celadon', requiresBadges: 3, trainer: '火箭队干部', title: '玉虹市：火箭队干部的挑战', theme: 'rocket', souvenir: 'rocket-celadon', clue: '玉虹市的火箭队干部记下了这次交手，火箭队的行动暂时受挫。', fixed: [{ speciesId: 109, level: 25 }, { speciesId: 111, level: 27 }] },
  { id: 'silph-showdown', location: 'saffron', requiresBadges: 4, trainer: '小茂', title: '西尔佛公司：小茂的试炼', theme: 'rival', souvenir: 'silph-showdown', clue: '小茂在西尔佛公司的大厅与你认真较量了一场，约好下次再分高下。', fixed: [{ speciesId: 18, level: 35 }, { speciesId: 65, level: 36 }, { counterStarter: true, level: 37 }] },
]);
const byId = new Map(ENCOUNTERS.map(item => [item.id, item]));
const souvenirIds = new Set(ENCOUNTERS.map(item => item.souvenir));
const integer = value => Number.isSafeInteger(value) && value >= 1;

function ensure(world) {
  if (!world || typeof world !== 'object') throw new TypeError('需要关都世界状态。');
  if (!world.剧情 || typeof world.剧情 !== 'object' || Array.isArray(world.剧情)) world.剧情 = {};
  const story = world.剧情;
  if (!integer(story.初始御三家编号)) {
    const starter = [...(world.队伍 || []), ...(world.电脑 || [])].find(mon => mon?.uid === 'starter');
    const family = STARTER_FAMILY.get(starter?.图鉴编号);
    if (family) story.初始御三家编号 = family;
  }
  if (!Array.isArray(story.已完成支线对战)) story.已完成支线对战 = [];
  story.已完成支线对战 = [...new Set(story.已完成支线对战.filter(id => byId.has(id)))];
  if (!Array.isArray(story.支线对战纪念品)) story.支线对战纪念品 = [];
  story.支线对战纪念品 = story.支线对战纪念品.filter(item => item && souvenirIds.has(item.id) && typeof item.name === 'string' && typeof item.description === 'string');
  if (!Array.isArray(story.支线剧情线索)) story.支线剧情线索 = [];
  story.支线剧情线索 = story.支线剧情线索.filter(item => item && byId.has(item.id) && typeof item.text === 'string' && integer(item.storyTurn));
  return world;
}

function readyReason(world, encounter) {
  const badges = Array.isArray(world?.训练家?.徽章) ? world.训练家.徽章.length : 0;
  if (world?.剧情?.初始御三家已选 !== true) return '请先选择最初的伙伴。';
  if (encounter.requiresFirstRival && world?.剧情?.首次击败小茂 !== true && !(world?.剧情?.已击败训练家 || []).includes('小茂')) return '先在真新镇战胜小茂，才能约他在22号道路再战。';
  if (badges < encounter.requiresBadges) return `需要至少${encounter.requiresBadges}枚徽章。`;
  if (world?.战斗?.状态 !== 'finished') return '请先完成当前遭遇。';
  if (!(world?.队伍 || []).some(mon => Number.isInteger(mon?.当前HP) && mon.当前HP > 0)) return '队伍全员倒下，请先前往宝可梦中心恢复。';
  return '';
}

function options(world) {
  const node = world?.地图?.节点;
  const completed = Array.isArray(world?.剧情?.已完成支线对战) ? world.剧情.已完成支线对战 : [];
  return ENCOUNTERS.filter(item => item.location === node).map(item => {
    const done = completed.includes(item.id);
    const reason = done ? '这场支线对战已经获胜并留下纪念。' : readyReason(world, item);
    return { id: 'special-battle', label: done ? item.title + '（已完成）' : item.title, enabled: !reason, ...(reason ? { reason } : {}), payload: { encounterId: item.id } };
  });
}

function definition(id) {
  const item = byId.get(id);
  if (!item) return null;
  const { fixed, ...publicData } = item;
  return clone(publicData);
}

function team(world, id) {
  const item = byId.get(id);
  if (!item) throw new Error('没有这场关都支线对战。');
  const rival = COUNTER_STARTER[world?.剧情?.初始御三家编号] || 4;
  return item.fixed.map(mon => ({ speciesId: mon.counterStarter ? rival + (mon.level >= 36 ? 2 : mon.level >= 16 ? 1 : 0) : mon.speciesId, level: mon.level }));
}

function apply(world, encounterId, { storyTurn } = {}) {
  const next = ensure(clone(world)), item = byId.get(encounterId);
  if (!item) throw new Error('没有这场关都支线对战。');
  if (next.地图?.节点 !== item.location) throw new Error('当前位置没有这场支线对战。');
  if (next.剧情.已完成支线对战.includes(item.id)) throw new Error('这场支线对战已经完成。');
  const reason = readyReason(next, item);
  if (reason) throw new Error(reason);
  if (!integer(storyTurn)) throw new Error('需要由宿主提供有效的故事回合。');
  const turn = next.地图.轮次 + 1;
  const party = team(next, item.id);
  next.地图.轮次 = turn;
  next.遭遇 = {
    类型: 'trainer', 训练家: item.trainer, npc: item.trainer, specialId: item.id, theme: item.theme, title: item.title,
    source: 'kanto-side-story', storyTurn,
    队伍: party.map((mon, index) => ({ speciesId: mon.speciesId, level: mon.level, uid: `special-${item.id}-${turn}-${index}` })),
  };
  return next;
}

function onBattleResult(world, { encounterId, result, storyTurn, location, encounter } = {}) {
  ensure(world);
  const item = byId.get(encounterId);
  if (!item || result !== 'win' || world.剧情.已完成支线对战.includes(encounterId)) return world;
  const expected = team(world, encounterId);
  const actual = Array.isArray(encounter?.队伍) ? encounter.队伍 : [];
  if (location !== item.location || encounter?.specialId !== item.id || encounter?.类型 !== 'trainer' || encounter?.训练家 !== item.trainer || encounter?.npc !== item.trainer || encounter?.theme !== item.theme || encounter?.title !== item.title || actual.length !== expected.length || actual.some((mon, index) => mon?.图鉴编号 !== expected[index].speciesId || mon?.等级 !== expected[index].level)) return world;
  if (!integer(storyTurn)) storyTurn = Math.max(1, world.地图?.轮次 || 1);
  world.剧情.已完成支线对战.push(encounterId);
  world.剧情.支线对战纪念品.push({ id: item.souvenir, name: item.title, description: '支线对战纪念品；仅作旅程收藏，不提供战斗效果。' });
  if (!world.背包 || typeof world.背包 !== 'object') world.背包 = {};
  if (!Array.isArray(world.背包.关键物品)) world.背包.关键物品 = [];
  const keepsakeId = 'special-' + item.souvenir;
  if (!world.背包.关键物品.some(keepsake => keepsake?.id === keepsakeId)) world.背包.关键物品.push({ id: keepsakeId, 名称: item.title + '纪念', 说明: item.clue + ' 仅作旅程收藏，不提供战斗效果。', 类型: '纪念品' });
  world.剧情.支线剧情线索.push({ id: encounterId, text: item.clue, storyTurn });
  world.剧情.支线剧情线索 = world.剧情.支线剧情线索.slice(-12);
  return world;
}

function validate(world) {
  const story = world?.剧情;
  if (!story || story.初始御三家编号 !== undefined && ![1, 4, 7].includes(story.初始御三家编号) || !Array.isArray(story.已完成支线对战) || !Array.isArray(story.支线对战纪念品) || !Array.isArray(story.支线剧情线索)) throw new Error('支线对战进度无效。');
  if (new Set(story.已完成支线对战).size !== story.已完成支线对战.length || story.已完成支线对战.some(id => !byId.has(id))) throw new Error('支线对战完成记录无效。');
  if (story.支线对战纪念品.length > ENCOUNTERS.length || story.支线剧情线索.length > 12) throw new Error('支线对战收藏超过上限。');
  for (const id of story.已完成支线对战) {
    if (!story.支线对战纪念品.some(item => item.id === byId.get(id).souvenir) || !story.支线剧情线索.some(item => item.id === id)) throw new Error('已完成支线对战缺少对应纪念记录。');
  }
  const encounter = world.遭遇;
  if (encounter?.specialId !== undefined&&!encounter.storyEventId) {
    const item = byId.get(encounter.specialId), expected = item && team(world, item.id), actual = encounter.队伍 || [];
    const adjusted=['easy','hard','expert','hell','ai'].includes(encounter.难度应用?.level);
    if (!item || world.地图?.节点 !== item.location || encounter.类型 !== 'trainer' || encounter.训练家 !== item.trainer || encounter.npc !== item.trainer || encounter.theme !== item.theme || encounter.title !== item.title || actual.length !== expected.length || actual.some((mon, index) => mon?.图鉴编号 !== expected[index].speciesId || !adjusted&&mon?.等级 !== expected[index].level)) throw new Error('支线对战遭遇资料无效。');
  }
  return true;
}

module.exports = { ensure, options, apply, onBattleResult, definitions: () => ENCOUNTERS.map(item => definition(item.id)), team, validate };
