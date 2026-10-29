import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'public/data/battle-terrain.json'), 'utf8'));
const hash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function sourceBytes(cells) {
  const bytes = Buffer.alloc(cells.length * 2);
  cells.forEach((word, index) => bytes.writeUInt16LE(word, index * 2));
  return bytes;
}

function pngSize(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function mapIndex(x, y) {
  return (x >= 32 ? 1024 : 0) + y * 32 + (x & 31);
}

test('contains complete, source-verifiable GBA terrain maps and atlas indices', () => {
  assert.deepEqual(Object.keys(data.terrains).sort(), ['cave', 'grass', 'indoor', 'water']);
  assert.deepEqual(data.screen, { width: 240, height: 112, tileSize: 8 });
  assert.equal(data.fallback, 'grass');

  for (const [id, terrain] of Object.entries(data.terrains)) {
    assert.equal(terrain.width, 64);
    assert.equal(terrain.height, 32);
    assert.equal(terrain.layout, 'gba-screenblocks-64x32');
    assert.equal(terrain.cells.length, 64 * 32);
    assert.equal(hash(sourceBytes(terrain.cells)), terrain.sourceBinSha256, `${id} differs from its fixed-commit terrain.bin`);
    assert.equal(terrain.source.includes(data.source.commit), true);

    const atlasPath = path.join(root, 'public', terrain.atlas);
    const size = pngSize(atlasPath);
    assert.deepEqual(size, { width: terrain.tileColumns * 8, height: terrain.tileRows * 8 });
    assert.ok(terrain.tileColumns * terrain.tileRows <= 1024);
    const tileIndices = Buffer.from(terrain.tileIndices, 'base64');
    assert.equal(tileIndices.length, size.width * size.height);
    assert.equal(hash(tileIndices), terrain.tileIndicesSha256);
    assert.ok(tileIndices.every((pixel) => pixel < 16));
    assert.equal(terrain.palette.length, 48);
    assert.ok(terrain.palette.every((rgb) => rgb.length === 3 && rgb.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)));

    let flips = 0;
    for (let y = 0; y < terrain.visible.height; y++) {
      for (let x = 0; x < terrain.visible.width; x++) {
        const entry = terrain.cells[mapIndex(terrain.visible.x + x, terrain.visible.y + y)];
        assert.ok((entry & 0x03ff) < terrain.tileColumns * terrain.tileRows, `${id} tile index out of bounds`);
        const bank = entry >>> 12;
        assert.ok(bank >= 2 && bank <= 4, `${id} visible tile has unsupported palette bank ${bank}`);
        if (entry & 0x0c00) flips++;
      }
    }
    assert.ok(flips > 0, `${id} should exercise source tile flips`);
  }

  // The right half is held in a second GBA screenblock, not adjacent in the raw word array.
  const grass = data.terrains.grass;
  assert.equal(mapIndex(31, 5), 191);
  assert.equal(mapIndex(32, 5), 1024 + 160);
  assert.equal(grass.cells[mapIndex(32, 5)], grass.cells[1184]);
});

test('browser IIFE renders a 240x112 scene synchronously after async init', async () => {
  const script = fs.readFileSync(path.join(root, 'public/terrain.js'), 'utf8');
  const sandbox = { atob, URL, module: { exports: {} } };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(script, sandbox, { filename: 'terrain.js' });
  const api = sandbox.KantoTerrain;
  assert.ok(api && typeof api.init === 'function' && typeof api.render === 'function');

  const drawCalls = [];
  const scales = [];
  const fakeContext = {
    drawImage: (...args) => drawCalls.push(args),
    getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData() {}, clearRect() {}, save() {}, restore() {}, translate() {},
    scale: (x, y) => scales.push([x, y]),
  };
  const createCanvas = (width, height) => ({
    width, height,
    getContext: () => fakeContext,
  });
  await api.init(data, {
    createCanvas,
    loadImage: async (assetPath) => {
      const entry = Object.values(data.terrains).find((terrain) => terrain.atlas === assetPath);
      return { width: entry.tileColumns * 8, height: entry.tileRows * 8 };
    },
  });

  const atlasPreparationDraws = drawCalls.length;
  const scene = { getContext: () => fakeContext };
  assert.equal(api.render(scene, 'grass'), scene);
  assert.equal(scene.width, 240);
  assert.equal(scene.height, 112);
  assert.equal(drawCalls.length - atlasPreparationDraws, 30 * 14);
  assert.ok(scales.some(([x, y]) => x === -1 || y === -1), 'renderer must apply GBA tile flips');
  assert.equal(api.render(scene, 'unknown'), scene, 'unknown terrain uses the explicit grass fallback');
});
