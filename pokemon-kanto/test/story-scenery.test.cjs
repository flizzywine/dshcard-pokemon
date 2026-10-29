'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const catalog = require('../public/data/story-scenery.json');
const publicRoot = path.join(__dirname, '../public');
const presentationModule = require('../presentation.cjs');

test('illustrated scenery catalog has ten pinned Masters EX environments with verified source bytes', () => {
  assert.equal(catalog.schemaVersion, 1);
  assert.match(catalog.sourceCommit, /^[a-f0-9]{40}$/);
  assert.equal(catalog.sourceRepository, 'MaNeRz/Pokemon-Masters-EX-Asset-Library');
  assert.equal(catalog.items.filter(item=>!item.generated).length, 10);
  assert.equal(new Set(catalog.items.map(item => item.id)).size, catalog.items.length);
  for (const item of catalog.items) {
    const file = path.join(publicRoot, item.image.replace(/^assets\//, 'assets/'));
    const bytes = fs.readFileSync(file);
    assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137,80,78,71,13,10,26,10]), item.id);
    assert.equal(bytes.readUInt32BE(16), item.width, item.id);
    assert.equal(bytes.readUInt32BE(20), item.height, item.id);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), item.sha256, item.id);
    if(item.generated){assert.ok(item.width>=1600&&item.height>=900);assert.match(item.source,/generated/);continue;}
    assert.match(item.sourceUrl, new RegExp(catalog.sourceCommit));
    assert.ok(item.sourceUrl.endsWith(item.sourcePath), item.id);
    assert.ok(item.note.length > 25, item.id);
    assert.match(item.note, /not|not a|only/i);
  }
});

test('presentation selects an illustrative mood from the actual map node and encounter while retaining legacy map backgrounds', () => {
  const world = {
    地图: { 地点: '尼比市', 节点: 'pewter', 轮次: 1 },
    遭遇: { 类型: 'gym', 训练家: '小刚', 道馆: 0 },
    战斗: { 状态: 'pending' },
    剧情: { 初始御三家已选: true },
  };
  const gym = presentationModule.presentation(world);
  assert.equal(gym.scene.sceneryType, 'stadium');
  assert.equal(gym.scene.sceneryImage, 'assets/backgrounds/original/rock-gym-v1.png');
  assert.equal(gym.scene.backgroundImage, 'assets/backgrounds/pewter-city.png');
  assert.ok(gym.scenery.some(item => item.sceneType === 'indoor'));
  assert.equal(presentationModule.sceneryFor({ 地图: { 节点: 'route19' } }).sceneType, 'coast');
  assert.equal(presentationModule.sceneryFor({ 地图: { 节点: 'viridian-forest' } }).sceneType, 'forest');
  assert.equal(presentationModule.sceneryFor({ 地图: { 节点: 'cerulean-cave' } }).sceneType, 'cave');
  assert.equal(presentationModule.sceneryFor({ 地图: { 节点: 'pallet' } }).sceneType, 'village');
});

test('battle scenery toggle keeps the exact pixel terrain available and uses the illustrated backdrop only in high-resolution mode', () => {
  const app = fs.readFileSync(path.join(publicRoot, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(publicRoot, 'battle-theme.css'), 'utf8');
  const html = fs.readFileSync(path.join(publicRoot, 'index.html'), 'utf8');
  assert.match(app, /scene\.sceneryImage \|\| backgrounds\?\.image \|\| scene\.backgroundImage/);
  assert.match(app, /setBattleSceneryStyle\(state\.battleSceneryStyle === 'illustrated' \? 'pixel' : 'illustrated'\)/);
  assert.match(html, /id="battleSceneryToggle"/);
  assert.match(css, /\.arena\.illustrated-ready \.battle-terrain\{display:none!important\}/);
  assert.match(css, /\.arena\.illustrated-ready \.arena-backdrop\{display:block!important/);
  assert.match(css, /\.battle-terrain \{ position:absolute; inset:0; z-index:0; display:block/);
});
