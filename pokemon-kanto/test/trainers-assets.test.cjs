const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/data/trainers.json'), 'utf8'));
const legacyIds = [
  'oak', 'red', 'leaf', 'rival_early', 'rival_late', 'brock', 'misty', 'lt_surge', 'erika', 'koga', 'sabrina', 'blaine', 'giovanni', 'lorelei', 'bruno', 'agatha', 'lance',
  'nurse_joy', 'bug_catcher', 'youngster', 'lass', 'hiker', 'sailor', 'camper', 'picnicker', 'super_nerd', 'pokemaniac', 'swimmer_m', 'swimmer_f', 'beauty', 'biker', 'scientist', 'rocket_grunt_m', 'rocket_grunt_f', 'gentleman', 'channeler', 'cool_trainer_m', 'cool_trainer_f', 'psychic_m', 'psychic_f', 'black_belt', 'burglar', 'bird_keeper', 'cue_ball', 'engineer', 'juggler', 'fisherman',
];
const byId = new Map(manifest.map(entry => [entry.id, entry]));
const npcPortraits = JSON.parse(fs.readFileSync(path.join(root, 'public/data/npc-portraits.json'), 'utf8'));
const pokemonArtwork = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pokemon-artwork.json'), 'utf8'));

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function alphaBounds(png, threshold=0) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const bitDepth = png[24];
  const colorType = png[25];
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 })[colorType];
  assert.ok(channels, `unsupported PNG color type ${colorType}`);
  assert.ok([8, 16].includes(bitDepth), `unsupported PNG bit depth ${bitDepth}`);
  const sampleBytes = bitDepth / 8;
  const bytesPerPixel = channels * sampleBytes;
  const stride = width * bytesPerPixel;
  const chunks = [];
  let palette = null;
  let transparency = null;
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
    else if (type === 'PLTE') palette = png.subarray(offset + 8, offset + 8 + length);
    else if (type === 'tRNS') transparency = png.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === 'IEND') break;
  }

  const raw = zlib.inflateSync(Buffer.concat(chunks));
  let previous = Buffer.alloc(stride);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor++];
    const row = Buffer.from(raw.subarray(cursor, cursor + stride));
    cursor += stride;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
      const up = previous[i];
      const upperLeft = i >= bytesPerPixel ? previous[i - bytesPerPixel] : 0;
      if (filter === 1) row[i] = (row[i] + left) & 255;
      else if (filter === 2) row[i] = (row[i] + up) & 255;
      else if (filter === 3) row[i] = (row[i] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[i] = (row[i] + paeth(left, up, upperLeft)) & 255;
      else assert.equal(filter, 0, `unsupported PNG filter ${filter}`);
    }
    for (let x = 0; x < width; x += 1) {
      let alpha = 255;
      if (colorType === 6) alpha = bitDepth === 16 ? (row[x * 8 + 6] || row[x * 8 + 7]) : row[x * 4 + 3];
      else if (colorType === 4) alpha = bitDepth === 16 ? (row[x * 4 + 2] || row[x * 4 + 3]) : row[x * 2 + 1];
      else if (colorType === 3) {
        assert.ok(palette && palette.length % 3 === 0, 'indexed PNG must have a valid palette');
        const index = row[x];
        assert.ok(index < palette.length / 3, `palette index ${index} is out of range`);
        if (transparency && index < transparency.length) alpha = transparency[index];
      }
      if (alpha <= threshold) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    previous = row;
  }
  assert.ok(maxX >= minX && maxY >= minY, 'RGBA artwork must contain visible pixels');
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    canvasWidth: width,
    canvasHeight: height,
  };
}

test('trainer manifest preserves the original roster and adds named characters', () => {
  assert.ok(manifest.length >= 100);
  assert.equal(byId.size, manifest.length, 'trainer IDs must be unique');
  for (const id of legacyIds) assert.ok(byId.has(id), `missing original trainer ID ${id}`);
  const named = manifest.filter(entry => entry.spriteType === 'official-art');
  assert.ok(named.length >= 100, `expected at least 100 named trainer entries, found ${named.length}`);
  assert.equal(new Set(named.map(entry => entry.name)).size, named.length, 'named entries must identify different characters');
  assert.equal(new Set(named.map(entry => entry.image)).size, named.length, 'named entries must use distinct artwork files');
  for (const entry of named) {
    assert.ok(entry.aliases?.includes(entry.name), `${entry.id} must include its English name alias`);
    assert.ok(entry.source?.startsWith('https://media.githubusercontent.com/media/MaNeRz/Pokemon-Masters-EX-Asset-Library/'), `${entry.id} must record its direct source`);
  }
});

test('stage manifests label every tiny or sprite sheet image so the stage can never display it',()=>{
 for(const entry of manifest){
  const image=entry.stageArt||entry.art||entry.image,data=fs.readFileSync(path.join(root,'public',image));
  const width=data.readUInt32BE(16),height=data.readUInt32BE(20),sprite=/^(?:front|back|sprite)(?:[-_ ]|$)/i.test(entry.spriteType||'');
  const isPixel=width<=128||height<=128||sprite;
  assert.equal(entry.stagePixel===true,isPixel,`${entry.id} marks the actual chosen stage art (${width}×${height})`);
  if(isPixel){assert.equal(entry.stagePixelWidth,width,entry.id);assert.equal(entry.stagePixelHeight,height,entry.id);}
  else assert.ok(width>128&&height>128,`${entry.id} is rendered from real nonpixel artwork`);
 }
});

test('Bug Catcher stage identity uses the new transparent full-body professional illustration',()=>{
 const entry=byId.get('bug_catcher'),image='assets/trainers/project-original/bug-catcher-v1.png',data=fs.readFileSync(path.join(root,'public',image));
 assert.equal(entry.image,image);assert.equal(entry.art,image);assert.equal(entry.stageArt,image);assert.equal(entry.legacySprite,'assets/trainers/bug_catcher.png');
 assert.equal(entry.spriteType,'project-original-art');assert.equal(entry.sourceRepository,'Project-original');assert.equal(entry.gender,'male');assert.equal(entry.age,'child');assert.equal(entry.fullBody,true);assert.equal(entry.overrideStageArt,true);
 assert.deepEqual([entry.width,entry.height,data[25]],[1024,1536,6]);
 assert.equal(require('node:crypto').createHash('sha256').update(data).digest('hex'),entry.sha256);
 assert.deepEqual(entry.artBounds,alphaBounds(data,16));
 const npc=npcPortraits.entries.find(item=>item.id==='bug_catcher_v1');assert.ok(npc);assert.equal(npc.gender,'male');assert.equal(npc.age,'child');assert.ok(npc.roles.includes('bug-catcher'));assert.equal(npc.displayEligible,true);assert.equal(npc.fullBody,true);assert.deepEqual(npc.artBounds,alphaBounds(data,16));
});

test('all trainer image paths resolve to PNG assets and Masters renders retain their source dimensions', () => {
  for (const entry of manifest) {
    for (const image of new Set([entry.image, entry.art].filter(Boolean))) {
      const file = path.join(root, 'public', image);
      assert.ok(fs.existsSync(file), `${entry.id} image is missing: ${image}`);
      const data = fs.readFileSync(file);
      assert.equal(data.toString('ascii', 1, 4), 'PNG', `${image} is not a PNG`);
      if (entry.sourceRepository === 'MaNeRz/Pokemon-Masters-EX-Asset-Library' && image.startsWith('assets/trainers/official/')) {
        assert.equal(data.readUInt32BE(16), 1024, `${image} width`);
        assert.equal(data.readUInt32BE(20), 1024, `${image} height`);
        assert.equal(data[25], 6, `${image} must retain RGBA transparency`);
      }
    }

    const imagePath = entry.image || entry.art;
    const data = fs.readFileSync(path.join(root, 'public', imagePath));
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    if (entry.artBounds) {
      assert.ok(entry.artBounds, `${entry.id} must include transparent art bounds`);
      assert.deepEqual(entry.artBounds, alphaBounds(data,entry.alphaThreshold||0), `${entry.id} alpha bounds must match the declared visible-pixel threshold`);
      assert.ok(entry.artBounds.width > 0 && entry.artBounds.height > 0, `${entry.id} bounds must include visible pixels`);
      assert.ok(entry.artBounds.x + entry.artBounds.width <= width, `${entry.id} bounds must fit canvas width`);
      assert.ok(entry.artBounds.y + entry.artBounds.height <= height, `${entry.id} bounds must fit canvas height`);
    }
  }
  const joy = byId.get('nurse_joy');
  assert.ok(joy.artBounds, 'Nurse Joy project art includes verified alpha bounds');
  assert.equal(joy.sourceRepository, 'Project-original');assert.equal(joy.generated,true);assert.equal(joy.fullBody,true);assert.equal(joy.overrideStageArt,true);
  assert.equal(joy.artBounds.canvasWidth, 1024);
  assert.equal(joy.artBounds.canvasHeight, 1536);
  const joyPng = fs.readFileSync(path.join(root, 'public', joy.image));
  assert.equal(joyPng[25], 6, 'the generated Nurse Joy image retains its original RGBA alpha channel');
  assert.ok(joy.artBounds.width<joy.width&&joy.artBounds.height<joy.height,'the figure has transparent margins');
});

test('generic Masters trainer portraits resolve with tagged visual metadata and transparent bounds', () => {
  assert.ok(npcPortraits.entries.length >= 20, `expected at least 20 generic portraits and visual references, found ${npcPortraits.entries.length}`);
  const ids = new Set();
  for (const entry of npcPortraits.entries) {
    assert.ok(!ids.has(entry.id), `duplicate NPC portrait id ${entry.id}`); ids.add(entry.id);
    assert.ok(['male', 'female', 'unspecified'].includes(entry.gender));
    assert.ok(['boy', 'girl', 'child', 'teen', 'adult', 'middle-aged', 'elder', 'older-adult'].includes(entry.age));
    assert.ok(entry.roles.length && entry.tags.length);
    if (entry.displayEligible === false) assert.ok(entry.displayIneligibleReason, `${entry.id} must explain why it cannot display`);
    else assert.ok(Array.isArray(entry.appearanceTags) && entry.appearanceTags.length, `${entry.id} must have visually reviewed appearance tags`);
    if (entry.sourceRepository === 'MaNeRz/Pokemon-Masters-EX-Asset-Library') {
      assert.ok(entry.source?.startsWith('https://media.githubusercontent.com/media/MaNeRz/Pokemon-Masters-EX-Asset-Library/'), `${entry.id} must retain a direct source URL`);
      assert.ok(entry.sourcePath?.startsWith('UI/Actor/Trainer/'), `${entry.id} must retain a source asset path`);
    } else if(entry.sourceRepository==='Project original art'){
      assert.ok(entry.tags.includes('project-original'));assert.equal(entry.fullBody,true);assert.equal(entry.alphaChannel,true);assert.ok(entry.alphaThreshold>=16);
      assert.match(entry.image,/assets\/trainers\/project-original\//);
      if(entry.id==='bug_catcher_v1')assert.equal(entry.alphaThreshold,16);
      else if(!entry.id.endsWith('_project_v1')&&entry.id!=='ash_anime_v1')assert.match(entry.image,/assets\/trainers\/project-original\/npc\//);
    } else {
      assert.equal(entry.sourceRepository, 'PokéWiki (German)');
      assert.ok(entry.source?.startsWith('https://www.pokewiki.de/images/'), `${entry.id} must retain its original image URL`);
      assert.ok(entry.sourcePage?.startsWith('https://www.pokewiki.de/Datei:'), `${entry.id} must retain a source file page`);
      assert.ok(entry.sourceFile && entry.sourceGame, `${entry.id} must identify its source file and game`);
      assert.deepEqual(entry.transparent, true);
      assert.deepEqual(entry.alphaChannel, true);
    }
    const data = fs.readFileSync(path.join(root, 'public', entry.image));
    assert.equal(data.toString('ascii', 1, 4), 'PNG');
    assert.deepEqual([entry.width, entry.height], [data.readUInt32BE(16), data.readUInt32BE(20)]);
    if (entry.sourceRepository === 'MaNeRz/Pokemon-Masters-EX-Asset-Library') assert.deepEqual([entry.width, entry.height, data[25]], [1024, 1024, 6]);
    assert.deepEqual(entry.artBounds, alphaBounds(data,entry.alphaThreshold||0), `${entry.id} bounds must match the declared alpha threshold`);
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), entry.sha256);
    if (entry.visualReference) assert.ok(entry.tags.includes('visual-reference-only') || entry.tags.includes('visual-reference'), `${entry.id} must be clearly marked as a visual reference`);
  }
  for (const id of ['shop_clerk_female', 'shop_clerk_male', 'elder_couple_oras']) {
    const entry = npcPortraits.entries.find(item => item.id === id);
    assert.ok(entry, `missing reviewed composition ${id}`);
    assert.equal(entry.displayEligible, false, `${id} must not be used as a single-person stage portrait`);
    assert.ok(entry.displayIneligibleReason);
  }
  for (const id of ['office_clerk_female_somo', 'office_clerk_male_somo']) {
    const entry = npcPortraits.entries.find(item => item.id === id);
    assert.ok(entry && entry.displayEligible !== false, `missing eligible ${id}`);
    assert.ok(entry.roles.includes('office-clerk'), `${id} is an office employee, not a retail clerk`);
    assert.equal(entry.composition, 'half-body');
    assert.equal(entry.fullBody, false);
  }
  for (const [gender, age] of [['male', 'adult'], ['female', 'adult'], ['male', 'boy'], ['female', 'girl'], ['male', 'older-adult'], ['female', 'older-adult']]) {
    assert.ok(npcPortraits.entries.some(entry => entry.gender === gender && entry.age === age), `portrait catalogue must include ${gender} ${age}`);
  }
  const croppedElder = npcPortraits.entries.find(entry => entry.id === 'elder_woman_oras_crop');
  assert.ok(croppedElder && croppedElder.displayEligible && croppedElder.gender === 'female');
  assert.ok(croppedElder.displayCrop && croppedElder.displayCrop.x >= 0 && croppedElder.displayCrop.y >= 0);
  assert.ok(croppedElder.displayCrop.x + croppedElder.displayCrop.width <= croppedElder.width);
  assert.ok(croppedElder.displayCrop.y + croppedElder.displayCrop.height <= croppedElder.height);
  assert.ok(croppedElder.roles.includes('elder') && !croppedElder.tags.includes('visual-reference-only'));
  for (const [id, image] of [['rival_early','assets/trainers/official/blue.png'],['nurse_joy','assets/trainers/official/nurse_joy.png']]) {
    const trainer = byId.get(id);
    assert.ok(trainer.gender && trainer.age && Array.isArray(trainer.portraitFallbacks));
    assert.equal(trainer.portraitFallbacks[0].image, image, `${id} has a same-identity backup illustration`);
  }
  assert.match(npcPortraits.matchPolicy, /exact alias/);
  assert.match(npcPortraits.stableIdentitySelection, /SHA-256/);
  assert.ok(npcPortraits.motherPortraitNote.includes('visual references only'));
  assert.ok(!npcPortraits.unavailableRequestedRoles.some(role => role.startsWith('mother ')), 'anonymous mother appearances are available');
});

test('Rocket Grunt stage portraits use unified art while original battle assets stay intact', () => {
  for (const id of ['rocket_grunt_m', 'rocket_grunt_f']) {
    const entry = byId.get(id);
    assert.ok(entry, `missing trainer class ${id}`);
    assert.equal(entry.sourceRepository, 'MaNeRz/Pokemon-Masters-EX-Asset-Library');
    assert.equal(entry.image, `assets/trainers/masters-npc/${id}.png`);
    assert.equal(entry.art, entry.image);
    assert.equal(entry.stageArt, `assets/trainers/project-original/npc/${id === 'rocket_grunt_m' ? 'rocket-grunt-male-v2' : 'rocket-grunt-female-v2'}.png`);
    const data = fs.readFileSync(path.join(root, 'public', entry.stageArt));
    assert.deepEqual([data.readUInt32BE(16), data.readUInt32BE(20), data[25]], [1024, 1536, 6]);
    assert.deepEqual(entry.displayCrop, alphaBounds(data, 16));
  }
});

test('Pokémon Adventures identities remain distinct from game Red, Leaf, and Gary/Blue', () => {
  const expected = [
    ['manga-red', 'red', 'Red (Pokémon Adventures)'],
    ['manga-green', 'game-blue-reference', 'Green (Pokémon Adventures)'],
    ['manga-blue', 'leaf', 'Blue (Pokémon Adventures)'],
  ];
  for (const [id, sourceId, character] of expected) {
    const entry = byId.get(id);
    assert.ok(entry, `missing adapted identity ${id}`);
    assert.equal(entry.spriteType, 'adapted-art');
    assert.equal(entry.adapted, true);
    assert.equal(entry.adaptedCharacter, character);
    assert.equal(entry.adaptedFromId, sourceId);
    assert.equal(entry.width, 1024);
    assert.equal(entry.height, 1024);
    assert.ok(entry.adaptationNote.length > 40);
    const data = fs.readFileSync(path.join(root, 'public', entry.image));
    assert.deepEqual([data.readUInt32BE(16), data.readUInt32BE(20), data[25]], [1024, 1024, 6]);
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), entry.sha256);
  }
  for (const id of ['rival_early', 'rival_late']) {
    const rival = byId.get(id);
    assert.ok(rival.aliases.includes('Gary'));
    assert.ok(rival.aliases.includes('Blue (game rival)'));
    assert.ok(!rival.aliases.includes('青绿'));
  }
  assert.ok(byId.get('manga-green').aliases.includes('青绿'));
  assert.ok(byId.get('manga-blue').aliases.includes('小蓝'));
  assert.ok(!byId.get('manga-blue').aliases.some(alias => alias.includes('Blue')));
  assert.ok(byId.get('trainer_ash').aliases.includes('小智'));
  assert.ok(byId.get('trainer_jessie').aliases.includes('武藏'));
  assert.ok(byId.get('trainer_james').aliases.includes('小次郎'));
});

test('Kanto official artwork manifest covers all 151 Pokémon with verified PNG references', () => {
  assert.equal(pokemonArtwork.entries.length, 151);
  const ids = new Set();
  for (const entry of pokemonArtwork.entries) {
    assert.ok(entry.id >= 1 && entry.id <= 151 && !ids.has(entry.id), `invalid/duplicate species id ${entry.id}`);
    ids.add(entry.id);
    assert.ok(entry.source.includes(`/official-artwork/${entry.id}.png`));
    const data = fs.readFileSync(path.join(root, 'public', entry.image));
    assert.equal(data.toString('ascii', 1, 4), 'PNG');
    assert.deepEqual([data.readUInt32BE(16), data.readUInt32BE(20), data[25]], [475, 475, 6]);
    assert.ok(entry.alphaChannel && entry.transparent, `${entry.id} should retain transparent RGBA art`);
    assert.deepEqual(entry.visibleBounds, alphaBounds(data), `${entry.id} visible bounds must match alpha pixels`);
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), entry.sha256);
  }
});
