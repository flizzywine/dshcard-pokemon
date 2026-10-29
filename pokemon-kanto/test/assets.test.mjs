import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTrainerCastEntries, trainerCastEntriesForGame } from '../index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const trainers = JSON.parse(readFileSync(path.join(root, 'public/data/trainers.json'), 'utf8'));

test('trainer source maps packaged PNGs and aliases, scoped to the bundled Kanto card', async () => {
  const cast = buildTrainerCastEntries(trainers);
  assert.equal(cast.length, 18);
  assert.ok(cast.some(item => item.name === '大木博士' && item.aliases.includes('大木')));
  assert.ok(!cast.some(item => item.name === '捕虫少年'));
  for (const item of cast) {
    assert.match(item.avatarUrl, /^\/api\/dsh-tavern\/plugin-assets\/dsh-card-pokemon-frlg-stage\/web\/assets\/trainers\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.png$/);
    const assetPath = item.avatarUrl.replace('/api/dsh-tavern/plugin-assets/dsh-card-pokemon-frlg-stage/web/', 'public/');
    const bytes = readFileSync(path.join(root, assetPath));
    assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }

  const currentCard = { getCard: async ({ gameId }) => gameId === 'kanto' ? { name: '宝可梦·火红叶绿：关都旅程 · 舞台版' } : { name: '其他人物卡' } };
  assert.equal((await trainerCastEntriesForGame(currentCard, 'kanto')).length, 18);
  assert.deepEqual(await trainerCastEntriesForGame(currentCard, 'other'), []);
  assert.deepEqual(await trainerCastEntriesForGame(currentCard, ''), []);
});

test('native cast includes current and recently mentioned Kanto Pokémon with local official artwork, capped at 50', async () => {
  const party = [{ 图鉴编号: 4, 昵称: '火尾' }];
  const encounter = [{ 图鉴编号: 25, 昵称: '皮卡丘' }];
  const host = {
    getCard: async () => ({ name: '宝可梦·火红叶绿：关都旅程 · 舞台版' }),
    getTurnState: async () => ({ turn: 12 }),
    getTurn: async () => ({ variables: { stat_data: { 宝可梦: { 队伍: party, 遭遇: { 队伍: encounter } } } } }),
    getHistory: async () => [{ input: '请让喷火龙出场。', text: '森林里有一只喷火龙。' }],
  };
  const cast = await trainerCastEntriesForGame(host, 'kanto');
  assert.ok(cast.length <= 50);
  const charmander = cast.find(item => item.name === '小火龙');
  assert.ok(charmander.aliases.includes('Charmander'));
  assert.ok(charmander.aliases.includes('火尾'));
  assert.equal(charmander.sprites.neutral, charmander.avatarUrl);
  assert.match(charmander.avatarUrl, /\/web\/assets\/pokemon\/artwork\/4\.png$/);
  assert.ok(cast.some(item => item.name === '皮卡丘'));
  assert.ok(cast.some(item => item.name === '喷火龙'));
  const spritePath = charmander.avatarUrl.replace('/api/dsh-tavern/plugin-assets/dsh-card-pokemon-frlg-stage/web/', 'public/');
  assert.deepEqual(readFileSync(path.join(root, spritePath)).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  host.getTurn = async () => ({ variables: { stat_data: { 宝可梦: { 队伍: Array.from({ length: 151 }, (_, i) => ({ 图鉴编号: i + 1 })) } } } });
  host.getHistory = undefined;
  const allSpecies = await trainerCastEntriesForGame(host, 'kanto');
  assert.ok(allSpecies.length <= 50);
  assert.ok(allSpecies.some(item => item.name === '小火龙'));
});

test('dynamic cast selects the matching trainer-class portrait without evicting active opponent Pokémon', async () => {
  const host = {
    getCard: async () => ({ name: '宝可梦·火红叶绿：关都旅程 · 舞台版' }),
    getTurnState: async () => ({ turn: 9 }),
    getTurn: async () => ({ variables: { stat_data: { 宝可梦: {
      队伍: [{ 图鉴编号: 4, 昵称: '小火龙' }],
      遭遇: { 类型: 'trainer', 训练家: '捕虫小子', 队伍: [{ 图鉴编号: 25, 昵称: '皮卡丘' }] },
    } } } }),
    getHistory: async () => [],
  };
  const cast = await trainerCastEntriesForGame(host, 'kanto');
  const bugCatcher = cast.find(item => item.name === '捕虫少年');
  assert.ok(bugCatcher);
  assert.ok(bugCatcher.aliases.includes('捕虫小子'));
  assert.match(bugCatcher.avatarUrl, /\/web\/assets\/trainers\/project-original\/bug-catcher-v1\.png$/);
  assert.ok(cast.some(item => item.name === '皮卡丘' && item.sprites?.neutral));
  assert.ok(cast.some(item => item.name === '小火龙' && item.sprites?.neutral));
  assert.ok(cast.length <= 50);
});

test('opening cast keeps Oak, the rival, and all three starter species available', async () => {
  const host = {
    getCard: async () => ({ name: '宝可梦·火红叶绿：关都旅程 · 舞台版' }),
    getTurnState: async () => ({ turn: 2 }),
    getTurn: async () => ({ variables: { stat_data: { 宝可梦: { 地图: { 节点: 'pallet' }, 队伍: [], 遭遇: null } } } }),
  };
  const cast = await trainerCastEntriesForGame(host, 'kanto');
  assert.ok(cast.some(item => item.name === '大木博士'));
  assert.ok(cast.some(item => item.name === '小茂'));
  for (const name of ['妙蛙种子', '小火龙', '杰尼龟']) assert.ok(cast.some(item => item.name === name), `${name} should be available`);
});
