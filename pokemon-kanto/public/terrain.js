(function (root) {
  'use strict';

  const TILE_SIZE = 8;
  let manifest = null;
  let prepared = new Map();

  function makeCanvas(width, height, options) {
    const canvas = options.createCanvas
      ? options.createCanvas(width, height)
      : document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function decodeBase64(value) {
    const raw = atob(value);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function resolve(url) {
    return window.KantoAssets ? window.KantoAssets.href(url) : new URL(url, document.baseURI).href;
  }

  async function loadAtlas(path, options) {
    if (options.loadImage) return options.loadImage(path);
    const image = new Image();
    image.src = options.resolveAsset ? options.resolveAsset(path) : resolve(path);
    if (image.decode) await image.decode();
    else await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error(`无法读取地形图集：${path}`));
    });
    return image;
  }

  function mapCellIndex(map, x, y) {
    // GBA 64×32 text backgrounds are two 32×32 screenblocks, not one row-major 64×32 array.
    return (x >= 32 ? 1024 : 0) + y * 32 + (x & 31);
  }

  async function init(source, options) {
    options = options || {};
    let data = source;
    if (typeof source === 'string' || source == null) {
      const url = source || options.manifestUrl || new URL('data/battle-terrain.json', document.baseURI).href;
      const response = await (options.fetch || fetch)(url);
      if (!response.ok) throw new Error(`无法读取地形数据：HTTP ${response.status}`);
      data = await response.json();
    }
    if (!data || !data.terrains || !data.screen) throw new Error('无效的关都战斗地形数据');

    const next = new Map();
    for (const [id, terrain] of Object.entries(data.terrains)) {
      const image = await loadAtlas(terrain.atlas, options);
      const width = terrain.tileColumns * TILE_SIZE;
      const height = terrain.tileRows * TILE_SIZE;
      if (image.width !== width || image.height !== height) throw new Error(`${id} 图集尺寸与地形数据不符`);
      if (terrain.cells.length !== terrain.width * terrain.height) throw new Error(`${id} tilemap 长度错误`);

      const indexedPixels = decodeBase64(terrain.tileIndices);
      if (indexedPixels.length !== width * height) throw new Error(`${id} 图集索引长度错误`);
      const variants = new Map();
      const banksUsed = new Set();
      for (let y = terrain.visible.y; y < terrain.visible.y + terrain.visible.height; y++) {
        for (let x = terrain.visible.x; x < terrain.visible.x + terrain.visible.width; x++) {
          const cell = terrain.cells[mapCellIndex(terrain, x, y)];
          banksUsed.add((cell >>> 12) & 15);
        }
      }
      for (const paletteBank of banksUsed) {
        const paletteOffset = (paletteBank - 2) * 16;
        if (paletteOffset < 0 || paletteOffset + 15 >= terrain.palette.length) {
          throw new Error(`${id} 可见区域使用了未提供的 GBA 调色板 ${paletteBank}`);
        }
        const canvas = makeCanvas(width, height, options);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.imageSmoothingEnabled = false;
        // Keep the supplied PNG atlas as the source, then apply the exact palette indices and
        // GBA palette bank selected by each screen-entry. Color index 0 is transparent on BGs.
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, width, height);
        for (let i = 0; i < indexedPixels.length; i++) {
          const colorIndex = indexedPixels[i];
          const target = i * 4;
          if (colorIndex === 0) {
            pixels.data[target] = pixels.data[target + 1] = pixels.data[target + 2] = pixels.data[target + 3] = 0;
          } else {
            const color = terrain.palette[paletteOffset + colorIndex];
            pixels.data[target] = color[0];
            pixels.data[target + 1] = color[1];
            pixels.data[target + 2] = color[2];
            pixels.data[target + 3] = 255;
          }
        }
        context.putImageData(pixels, 0, 0);
        variants.set(paletteBank, canvas);
      }
      next.set(id, { ...terrain, variants });
    }
    if (!next.has(data.fallback)) throw new Error('fallback 地形不存在');
    manifest = data;
    prepared = next;
    return api;
  }

  function render(canvas, terrainId) {
    if (!manifest) throw new Error('请先等待 KantoTerrain.init() 完成');
    const terrain = prepared.get(terrainId) || prepared.get(manifest.fallback);
    const view = terrain.visible;
    canvas.width = view.width * TILE_SIZE;
    canvas.height = view.height * TILE_SIZE;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < view.height; y++) {
      for (let x = 0; x < view.width; x++) {
        const worldX = view.x + x;
        const worldY = view.y + y;
        const entry = terrain.cells[mapCellIndex(terrain, worldX, worldY)];
        const tile = entry & 0x03ff;
        const flipX = (entry & 0x0400) !== 0;
        const flipY = (entry & 0x0800) !== 0;
        const paletteBank = (entry >>> 12) & 15;
        const atlas = terrain.variants.get(paletteBank);
        if (!atlas) throw new Error(`地形 ${terrainId} 缺少调色板 ${paletteBank}`);

        const dx = x * TILE_SIZE;
        const dy = y * TILE_SIZE;
        context.save();
        context.translate(dx + (flipX ? TILE_SIZE : 0), dy + (flipY ? TILE_SIZE : 0));
        context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
        context.drawImage(
          atlas,
          (tile % terrain.tileColumns) * TILE_SIZE,
          Math.floor(tile / terrain.tileColumns) * TILE_SIZE,
          TILE_SIZE,
          TILE_SIZE,
          0,
          0,
          TILE_SIZE,
          TILE_SIZE,
        );
        context.restore();
      }
    }
    return canvas;
  }

  const api = Object.freeze({ init, render });
  root.KantoTerrain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
