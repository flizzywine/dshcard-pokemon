const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(root, 'public/data', name), 'utf8'));
const pngInfo = (file) => {
  const bytes = fs.readFileSync(file);
  assert.ok(bytes.length >= 24, `${file} is too short to be a PNG`);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${file} has a PNG signature`);
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', `${file} has an IHDR chunk`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

test('story background manifest points to valid local PNGs and known map nodes', () => {
  const backgrounds = readJson('backgrounds.json');
  const map = readJson('map.json');
  const mapIds = new Set(map.map((node) => node.id));
  const ids = new Set();

  for (const scene of backgrounds) {
    assert.ok(scene.id && !ids.has(scene.id), `background id is unique: ${scene.id}`);
    ids.add(scene.id);
    if (scene.generated === true) {
      assert.match(scene.source, /^Project-original illustration generated with OpenAI image generation, \d{4}-\d{2}-\d{2}$/, `${scene.id} declares generated project artwork as its source`);
      assert.match(scene.sha256, /^[a-f0-9]{64}$/i, `${scene.id} records its local asset hash`);
    } else {
      assert.match(scene.source, /https?:\/\//, `${scene.id} source has a traceable URL`);
    }
    const locations = Array.isArray(scene.locations) ? scene.locations : [];
    assert.ok(locations.length > 0 || scene.sceneTags?.length > 0, `${scene.id} maps to a location or an explicit scene tag`);
    for (const location of locations) {
      assert.ok(mapIds.has(location), `${scene.id} location exists in map.json: ${location}`);
    }
    const file = path.resolve(root, 'public', scene.image);
    assert.ok(file.startsWith(path.resolve(root, 'public') + path.sep), `${scene.id} image stays under public/`);
    assert.ok(fs.existsSync(file), `${scene.id} image exists: ${scene.image}`);
    const { width, height } = pngInfo(file);
    assert.ok(width > 0 && height > 0, `${scene.id} PNG dimensions are positive`);
  }

  for (const town of ['pewter', 'cerulean', 'vermilion', 'lavender', 'celadon', 'saffron', 'fuchsia', 'cinnabar', 'viridian']) {
    assert.ok(backgrounds.some((scene) => scene.locations?.includes(town)), `town background maps to ${town}`);
  }
});

test('story music locations resolve to map nodes and local tracks', () => {
  const audio = readJson('story-audio.json');
  const mapIds = new Set(readJson('map.json').map((node) => node.id));
  for (const [id, track] of Object.entries(audio.tracks)) {
    assert.match(track.source, /https?:\/\//, `${id} source has a traceable URL`);
    const file = path.resolve(root, 'public', track.file);
    assert.ok(file.startsWith(path.resolve(root, 'public') + path.sep), `${id} audio stays under public/`);
    assert.ok(fs.existsSync(file), `${id} audio exists: ${track.file}`);
  }
  for (const [location, trackId] of Object.entries(audio.locations)) {
    assert.ok(mapIds.has(location), `music location exists in map.json: ${location}`);
    assert.ok(audio.tracks[trackId], `${location} points to known track: ${trackId}`);
  }
  for (const [event, trackId] of Object.entries(audio.events)) {
    assert.ok(audio.tracks[trackId], `${event} points to known track: ${trackId}`);
  }
  assert.equal(audio.locations.viridian, 'pewter');
  assert.equal(audio.locations.pewter, 'pewter');
  assert.equal(audio.locations.saffron, 'pewter');
  assert.equal(audio.locations.cerulean, 'fuchsia');
  assert.equal(audio.locations.fuchsia, 'fuchsia');
  assert.equal(audio.locations['diglett-cave'], 'mt-moon');
  assert.equal(audio.locations.seafoam, 'mt-moon');
  assert.equal(audio.locations['power-plant'], 'pokemon-mansion');
  assert.equal(audio.locations['cerulean-cave'], 'rocket-hideout');
  assert.equal(audio.locations['victory-road'], 'mt-moon');
  assert.equal(audio.events.rocketBase, 'rocket-hideout');
  assert.equal(audio.events.tournament, 'last-road');
  assert.equal(audio.events.quietReflection, 'camp-epilogue');
  assert.match(audio.eventNotes.tournament, /mood fallback only/i);
  assert.match(audio.eventNotes.quietReflection, /project mood assignment/i);
  assert.match(audio.locationNotes.indigo, /MUS_INDIGO_PLATEAU/);
  assert.match(audio.locationNotes.safari, /MUS_EVOLUTION/);
});
