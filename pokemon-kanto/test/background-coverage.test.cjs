const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');

const root = path.resolve(__dirname, '..');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(root, 'public/data', name), 'utf8'));
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

test('every Kanto map node has a source-backed image or an explicit fallback', () => {
  const nodes = readJson('map.json');
  const backgrounds = readJson('backgrounds.json');
  const mapped = new Map();

  for (const background of backgrounds) {
    if(background.generated)assert.match(background.source || '', /Project-original.*generated.*2026-10-25/, `${background.id} records its project provenance`);
    else assert.match(background.source || '', /https?:\/\//, `${background.id} names a traceable source URL`);
    assert.ok((Array.isArray(background.locations) && background.locations.length) ||
      (Array.isArray(background.sceneTags) && background.sceneTags.length), `${background.id} maps to a location or scene tag`);
    const asset = path.resolve(root, 'public', background.image);
    assert.ok(asset.startsWith(path.resolve(root, 'public') + path.sep), `${background.id} stays under public/`);
    const bytes = fs.readFileSync(asset);
    assert.ok(bytes.length < 15 * 1024 * 1024, `${background.id} is under 15 MiB`);
    assert.ok(bytes.subarray(0, 8).equals(pngSignature), `${background.id} is a PNG`);
    assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', `${background.id} has PNG IHDR`);
    if(background.sha256)assert.equal(createHash('sha256').update(bytes).digest('hex'),background.sha256);
    for (const location of background.locations || []) {
      assert.ok(nodes.some((node) => node.id === location), `${background.id} location exists: ${location}`);
      mapped.set(location, [...(mapped.get(location) || []), background]);
    }
  }

  for (const node of nodes) {
    assert.ok(mapped.has(node.id), `${node.id} has a background`);
    const exactOrFallback = mapped.get(node.id).some((background) => !background.fallback || (
      typeof background.fallback.type === 'string' && background.fallback.type.length > 0 &&
      typeof background.fallback.reason === 'string' && background.fallback.reason.length > 0
    ));
    assert.ok(exactOrFallback, `${node.id} has an exact image or a documented fallback`);
  }

  const indigo = mapped.get('indigo').find((background) => background.fallback);
  assert.equal(indigo?.fallback?.type, 'regional-overview');
  assert.match(indigo?.fallback?.reason || '', /no standalone Indigo Plateau/i);
  assert.equal(indigo?.image, 'assets/backgrounds/kanto-overview.png');
});

test('gym interior maps are scene-tagged without replacing town backgrounds', () => {
  const backgrounds = readJson('backgrounds.json');
  const towns = ['pewter','cerulean','vermilion','celadon','fuchsia','saffron','cinnabar','viridian'];
  for (const town of towns) {
    const gym = backgrounds.find((background) => background.sceneTags?.includes(`gym:${town}`));
    assert.ok(gym, `${town} gym has a scene-specific background`);
    assert.deepEqual(gym.locations, [], `${town} gym must not be selected as the town's default background`);
    assert.equal(gym.image, `assets/backgrounds/gym-${town}.png`);
  }
});

test('all route nodes use their own FRLG route map image', () => {
  const backgrounds = readJson('backgrounds.json');
  for (let route = 1; route <= 25; route++) {
    const entry = backgrounds.find((background) => background.locations?.includes(`route${route}`));
    assert.ok(entry, `route${route} has a background`);
    assert.equal(entry.image, `assets/backgrounds/route${route}.png`);
    assert.match(entry.source, new RegExp(`Route ${String(route).padStart(2, '0')} map`));
  }
});

test('a gym challenge uses its interior and the next town interaction restores the city map',()=>{
  const mvu=require('../mvu.cjs'),{presentation}=require('../presentation.cjs');
  let variables=mvu.createInitialMvu(),world=variables.stat_data['宝可梦'];
  world.地图.节点='pewter';world.地图.地点='尼比市';world.剧情.初始御三家已选=true;world.战斗.状态='finished';
  variables=mvu.theaterAction(variables,'challenge-gym',{gym:0});world=variables.stat_data['宝可梦'];
  assert.equal(mvu.theaterView(variables).theater.backgroundImage,'assets/backgrounds/gym-pewter.png');
  assert.equal(presentation(world).scene.backgroundImage,'assets/backgrounds/gym-pewter.png');
  world.战斗.状态='finished';world.剧情.剧场.最近动作='talk';
  assert.equal(mvu.theaterView(variables).theater.backgroundImage,'assets/backgrounds/pewter-city.png');
  assert.equal(presentation(world).scene.backgroundImage,'assets/backgrounds/pewter-city.png');
});
