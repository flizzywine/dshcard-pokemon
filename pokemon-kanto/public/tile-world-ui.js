(() => {
  const api = {};
  const atlasCache = new Map();
  const focusByContainer = new WeakMap();
  const CACHE_LIMIT = 16;
  const mapNames = Object.freeze({
    PALLET_TOWN: '真新镇', VIRIDIAN_CITY: '常青市', PEWTER_CITY: '尼比市', CERULEAN_CITY: '华蓝市',
    VERMILION_CITY: '枯叶市', LAVENDER_TOWN: '紫苑镇', CELADON_CITY: '玉虹市', FUCHSIA_CITY: '浅红市',
    SAFFRON_CITY: '金黄市', CINNABAR_ISLAND: '红莲岛', INDIGO_PLATEAU: '石英高原', VIRIDIAN_FOREST: '常青森林',
    SEAFOAM_ISLANDS: '双子岛', VICTORY_ROAD: '冠军之路', ROCKET_HIDEOUT: '火箭队基地', SILPH_CO: '西尔佛公司',
    POKEMON_TOWER: '宝可梦塔', POKEMON_MANSION: '宝可梦屋', SAFARI_ZONE: '狩猎地带',
  });

  function mapTitle(view) {
    if (/[^\u0000-\u007f]/u.test(String(view.name || ''))) return view.name;
    const id = String(view.mapId || '').replace(/^MAP_/, '');
    const route = /(?:^|_)ROUTE_?(\d+)/u.exec(id);
    if (route) return `${route[1]}号道路`;
    for (const [key, value] of Object.entries(mapNames)) if (id.includes(key)) {
      const suffix = id.includes('_GYM') ? '道馆' : id.includes('POKEMON_CENTER') ? '宝可梦中心' : id.includes('MART') ? '商店' : '';
      return value + suffix;
    }
    return '原版地图';
  }

  function cacheSet(key, value) {
    atlasCache.delete(key);
    atlasCache.set(key, value);
    while (atlasCache.size > CACHE_LIMIT) atlasCache.delete(atlasCache.keys().next().value);
  }

  async function loadAtlas(spec, opts) {
    if (!spec) return null;
    const source = typeof opts.asset === 'function' ? opts.asset('/' + spec.asset) : '/' + spec.asset;
    let decoded = atlasCache.get(source);
    if (decoded) {
      atlasCache.delete(source);
      atlasCache.set(source, decoded);
    } else {
      decoded = (async () => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const temp = document.createElement('canvas');
        temp.width = image.width;
        temp.height = image.height;
        const context = temp.getContext('2d', {willReadFrequently: true});
        context.drawImage(image, 0, 0);
        return {width: temp.width, height: temp.height, pixels: context.getImageData(0, 0, temp.width, temp.height)};
      })();
      cacheSet(source, decoded);
      decoded.catch(() => { if (atlasCache.get(source) === decoded) atlasCache.delete(source); });
    }
    return {...await decoded, spec};
  }

  function render(container, view, opts = {}) {
    if (!container || !view) return null;
    const doc = container.ownerDocument || document;
    const previousFocus = focusByContainer.get(container) || null;
    container.replaceChildren();

    const root = doc.createElement('section');
    root.className = 'kanto-tile-world';
    root.tabIndex = 0;
    const header = doc.createElement('header');
    header.className = 'ktw-head';
    const title = doc.createElement('strong');
    title.textContent = mapTitle(view);
    const coord = doc.createElement('span');
    coord.textContent = `${view.position.x}, ${view.position.y}`;

    const fire = (action, payload = {}) => opts.onAction?.(action, {...payload, expectedRevision: view.revision});
    const button = (label, focusKey, onClick, disabled = false) => {
      const element = doc.createElement('button');
      element.type = 'button';
      element.textContent = label;
      element.disabled = disabled;
      element.dataset.ktwFocus = focusKey;
      element.addEventListener('focus', () => focusByContainer.set(container, focusKey));
      element.addEventListener('click', () => { focusByContainer.set(container, focusKey); onClick(); });
      element.style.minWidth = '42px';
      element.style.minHeight = '38px';
      return element;
    };

    const back = button('返回区域地图', 'return-area', () => {
      const disclosure = container.closest?.('details');
      if (disclosure) disclosure.open = false;
      else fire('returnArea');
    });
    header.append(title, coord, back);

    const stage = doc.createElement('div');
    stage.className = 'ktw-stage';
    const canvas = doc.createElement('canvas');
    canvas.className = 'ktw-canvas';
    canvas.width = view.width * 32;
    canvas.height = view.height * 32;
    canvas.style.width = `${canvas.width}px`;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;

    const drawOverlay = () => {
      for (const event of view.interactables || []) {
        if (!Number.isInteger(event.x) || !Number.isInteger(event.y)) continue;
        const x = event.x * 32 + 16, y = event.y * 32 + 16;
        context.fillStyle = event.kind === 'hiddenItem' ? '#ffd166' : event.kind === 'warp' ? '#7bdff2' : '#fff';
        context.beginPath(); context.arc(x, y, 5, 0, Math.PI * 2); context.fill();
      }
      const position = view.position;
      context.fillStyle = '#ff5f6d'; context.beginPath(); context.arc(position.x * 32 + 16, position.y * 32 + 16, 10, 0, Math.PI * 2); context.fill();
      context.strokeStyle = '#fff'; context.lineWidth = 2; context.stroke();
    };

    const drawTile = (atlas, word, destination, x, y) => {
      const index = word & 0x3ff, paletteIndex = (word >>> 12) & 15, flipX = (word & 0x400) !== 0, flipY = (word & 0x800) !== 0;
      const sx = (index % 16) * 8, sy = Math.floor(index / 16) * 8;
      const palette = atlas.spec.palettes?.[paletteIndex] || atlas.spec.palettes?.[0] || [];
      const output = destination.createImageData(8, 8), source = atlas.pixels.data;
      for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) {
        const sourceIndex = ((sy + py) * atlas.width + sx + px) * 4;
        const targetIndex = ((flipY ? 7 - py : py) * 8 + (flipX ? 7 - px : px)) * 4;
        const colorIndex = Math.max(0, Math.min(15, Math.round(source[sourceIndex] / 17)));
        const rgb = palette[colorIndex] || [source[sourceIndex], source[sourceIndex + 1], source[sourceIndex + 2]];
        output.data[targetIndex] = rgb[0]; output.data[targetIndex + 1] = rgb[1]; output.data[targetIndex + 2] = rgb[2];
        output.data[targetIndex + 3] = colorIndex === 0 || source[sourceIndex + 3] === 0 ? 0 : 255;
      }
      const tile = doc.createElement('canvas'); tile.width = 8; tile.height = 8; tile.getContext('2d').putImageData(output, 0, 0);
      return tile;
    };

    let destroyed = false;
    async function drawMap() {
      const primary = await loadAtlas(view.tilesets?.primary, opts), secondary = await loadAtlas(view.tilesets?.secondary, opts);
      if (destroyed) return;
      if (!primary || !secondary) {
        context.fillStyle = '#151e2b'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#fff'; context.fillText('地图图块素材暂不可用', 12, 24); drawOverlay(); return;
      }
      const scratch = doc.createElement('canvas'); scratch.width = 8; scratch.height = 8;
      const scratchContext = scratch.getContext('2d'), metaCache = new Map();
      const meta = (which, id) => {
        const key = `${which}:${id}`;
        if (metaCache.has(key)) return metaCache.get(key);
        const atlas = which === 'primary' ? primary : secondary, entries = atlas.spec.metatiles[id] || [];
        const tileMap = doc.createElement('canvas'); tileMap.width = 16; tileMap.height = 16;
        const tileContext = tileMap.getContext('2d');
        for (let index = 0; index < 8; index++) {
          const tile = drawTile(atlas, entries[index] || 0, scratchContext);
          tileContext.drawImage(tile, (index % 2) * 8, (Math.floor(index / 2) % 2) * 8);
        }
        metaCache.set(key, tileMap); return tileMap;
      };
      for (let y = 0; y < view.height; y++) for (let x = 0; x < view.width; x++) {
        const tileId = view.tiles[y * view.width + x];
        context.drawImage(meta(tileId < 640 ? 'primary' : 'secondary', tileId < 640 ? tileId : tileId - 640), x * 32, y * 32, 32, 32);
      }
      drawOverlay();
    }
    drawMap().catch(() => {
      if (destroyed) return;
      context.fillStyle = '#111827'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#fff'; context.fillText('地图绘制失败', 12, 24); drawOverlay();
    });

    canvas.addEventListener('click', event => {
      const bounds = canvas.getBoundingClientRect();
      const x = Math.floor((event.clientX - bounds.left) * view.width / bounds.width);
      const y = Math.floor((event.clientY - bounds.top) * view.height / bounds.height);
      const dx = x - view.position.x, dy = y - view.position.y;
      fire('move', {direction: Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'), target: {x, y}});
    });
    stage.append(canvas);

    const minimap = doc.createElement('aside');
    minimap.className = 'ktw-minimap'; minimap.setAttribute('aria-label', '附近地图');
    const miniCanvas = doc.createElement('canvas'); miniCanvas.width = view.width; miniCanvas.height = view.height;
    const miniContext = miniCanvas.getContext('2d');
    for (let y = 0; y < view.height; y++) for (let x = 0; x < view.width; x++) {
      const index = y * view.width + x; miniContext.fillStyle = view.collision?.[index] ? '#202b3b' : '#718096'; miniContext.fillRect(x, y, 1, 1);
    }
    miniContext.fillStyle = '#fc6471'; miniContext.fillRect(view.position.x, view.position.y, 1, 1); minimap.append(miniCanvas); stage.append(minimap);

    const controls = doc.createElement('nav'); controls.className = 'ktw-controls'; controls.setAttribute('aria-label', '逐格地图操作');
    controls.style.display = 'grid'; controls.style.gridTemplateColumns = 'repeat(3, minmax(42px, auto))'; controls.style.gap = '5px';
    controls.style.justifyContent = 'start'; controls.style.marginTop = '8px';
    const blank = doc.createElement('span');
    controls.append(blank, button('↑', 'move-up', () => fire('move', {direction: 'up'})), doc.createElement('span'));
    controls.append(button('←', 'move-left', () => fire('move', {direction: 'left'})), button('互动', 'interact', () => fire('interact')),
      button('→', 'move-right', () => fire('move', {direction: 'right'})));
    controls.append(button('推巨石', 'push-boulder', () => fire('pushBoulder', {}), !(view.availableActions || []).includes('pushBoulder')),
      button('↓', 'move-down', () => fire('move', {direction: 'down'})),
      button('使用门', 'use-door', () => fire('useDoor', {})));

    const hint = doc.createElement('small'); hint.className = 'ktw-hint';
    hint.textContent = '可点方向按钮或地图移动；互动与使用门按钮无需键盘。';
    root.addEventListener('keydown', event => {
      const directions = {ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right'};
      if (directions[event.key]) { event.preventDefault(); fire('move', {direction: directions[event.key]}); }
      else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fire('interact'); }
      else if (event.key === 'e' || event.key === 'E') { event.preventDefault(); fire('useDoor'); }
      else if (event.key === 'Escape') {
        const disclosure = container.closest?.('details');
        if (disclosure) disclosure.open = false;
      }
    });

    root.append(header, stage, controls, hint); container.append(root);
    const focusable = [...root.querySelectorAll('button')].find(item => item.dataset.ktwFocus === previousFocus);
    if (focusable) focusable.focus({preventScroll: true});
    else if (!previousFocus) root.focus({preventScroll: true});
    stage.scrollLeft = Math.max(0, view.position.x * 32 - stage.clientWidth / 2);
    stage.scrollTop = Math.max(0, view.position.y * 32 - stage.clientHeight / 2);
    return {destroy() { destroyed = true; root.remove(); }};
  }

  api.render = render;
  globalThis.KantoTileWorld = api;
})();
