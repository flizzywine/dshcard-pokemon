'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const manifest = require('../public/data/backgrounds.json');
const sourceCommit = 'ba912f25a69c5aa99fe813b6e7a7338eb239b4de';
const expectedIds = [
  'masters-downtown-night', 'masters-downtown-alt-1', 'masters-downtown-cloudy',
  'masters-village-alt', 'masters-village-night',
  'masters-highway', 'masters-highway-night', 'masters-highway-cloudy',
  'masters-forest-alt', 'masters-forest-evening',
  'masters-cave-alt', 'masters-cave-large', 'masters-cave-night',
  'masters-coast-night', 'masters-arena-night', 'masters-sub-arena', 'masters-rocket-backyard',
];

function decodePng(bytes) {
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  let width; let height; let bitDepth; let colorType; let interlace;
  const idat = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  assert.equal(bitDepth, 8, 'PNG uses 8-bit channels');
  assert.equal(colorType, 6, 'PNG has RGBA channels');
  assert.equal(interlace, 0, 'PNG uses non-interlaced scanlines');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const previous = Buffer.alloc(stride);
  let transparent = 0;
  let partialAlpha = 0;
  let cursor = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[cursor++];
    const row = Buffer.from(raw.subarray(cursor, cursor + stride));
    cursor += stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? row[x - 4] : 0;
      const up = previous[x];
      const upperLeft = x >= 4 ? previous[x - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upperLeft;
        const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - upperLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft;
      }
      assert.ok(filter >= 0 && filter <= 4, 'PNG row filter is supported');
      row[x] = (row[x] + predictor) & 0xff;
    }
    for (let x = 3; x < stride; x += 4) {
      if (row[x] === 0) transparent++;
      else if (row[x] !== 255) partialAlpha++;
    }
    row.copy(previous);
  }
  return { width, height, colorType, transparent, partialAlpha };
}

test('the additional Masters EX environments are pinned, full-sized and fully opaque source PNGs', () => {
  const assets = manifest.filter(item => expectedIds.includes(item.id));
  assert.equal(assets.length, expectedIds.length);
  for (const id of expectedIds) {
    const item = assets.find(asset => asset.id === id);
    assert.ok(item, id);
    assert.equal(item.sourceCommit, sourceCommit, id);
    assert.equal(item.sourceRepository, 'MaNeRz/Pokemon-Masters-EX-Asset-Library', id);
    assert.match(item.source, new RegExp(sourceCommit), id);
    assert.ok(item.source.endsWith(item.sourcePath), id);
    assert.equal(item.width, 512, id);
    assert.equal(item.height, 512, id);
    assert.ok(item.note.includes('visual analogue'), id);
    const imagePath = path.resolve(root, 'public', item.image);
    assert.ok(imagePath.startsWith(path.resolve(root, 'public') + path.sep), id);
    const bytes = fs.readFileSync(imagePath);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), item.sha256, id);
    const decoded = decodePng(bytes);
    assert.deepEqual(decoded, { width: 512, height: 512, colorType: 6, transparent: 0, partialAlpha: 0 }, id);
  }
});

test('illustrated scene tags stay broad and preserve room-specific original backdrops', () => {
  const rocket = manifest.find(item => item.id === 'masters-rocket-backyard');
  assert.deepEqual(rocket.sceneTags, ['rocket-base']);
  assert.match(rocket.note, /not the FRLG hideout/i);
  const tournament = manifest.filter(item => item.sceneTags?.includes('tournament'));
  assert.deepEqual(tournament.map(item => item.id), ['masters-arena-night', 'masters-sub-arena']);
  for (const tag of ['gym:pewter', 'gym:cerulean', 'gym:vermilion', 'gym:celadon', 'gym:fuchsia', 'gym:saffron', 'gym:cinnabar', 'gym:viridian']) {
    assert.ok(manifest.some(item => item.sceneTags?.includes(tag)), tag);
  }
});
