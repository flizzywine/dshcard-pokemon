/* Short, bounded entry sparkles for shiny Pokémon. No animation frame loop is used. */
(function (host) {
  'use strict';

  if (!host || typeof host.document === 'undefined') return;

  const MAX_PARTICLES = 20;
  const PARTICLES_PER_ENTRY = 14;
  const MAX_ACTIVE_ENTRIES = 8;
  const active = new Set();
  const byRoot = new WeakMap();
  let activeParticles = 0;

  function seededRandom(seed) {
    let value = 2166136261;
    for (const char of String(seed || 'shiny')) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
    return function () {
      value += 0x6D2B79F5;
      let next = value;
      next = Math.imul(next ^ next >>> 15, next | 1);
      next ^= next + Math.imul(next ^ next >>> 7, next | 61);
      return ((next ^ next >>> 14) >>> 0) / 4294967296;
    };
  }

  function removeJob(job) {
    if (!job || job.stopped) return;
    job.stopped = true;
    host.clearTimeout(job.timer);
    job.layer.remove();
    active.delete(job);
    activeParticles = Math.max(0, activeParticles - job.particles);
    if (byRoot.get(job.root) === job) byRoot.delete(job.root);
  }

  function stopEntry(rootOrUid) {
    if (rootOrUid && typeof rootOrUid === 'object') {
      removeJob(byRoot.get(rootOrUid));
      return;
    }
    for (const job of [...active]) if (job.uid === String(rootOrUid)) removeJob(job);
  }

  function stopAll() {
    for (const job of [...active]) removeJob(job);
  }

  function playEntry(root, options = {}) {
    if (!root || typeof root.appendChild !== 'function' || !root.ownerDocument?.createElement) return null;
    stopEntry(root);
    if (options.reducedMotion === true) {
      root.classList?.add('kanto-shiny-reduced-motion');
      return () => root.classList?.remove('kanto-shiny-reduced-motion');
    }
    if (options.visible === false || host.document.hidden) return null;
    while (active.size >= MAX_ACTIVE_ENTRIES) removeJob(active.values().next().value);

    const particles = Math.min(PARTICLES_PER_ENTRY, MAX_PARTICLES - activeParticles);
    if (particles <= 0) return null;
    const doc = root.ownerDocument, layer = doc.createElement('span');
    layer.className = 'kanto-shiny-fx-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('data-shiny-fx', 'entry');
    const side = String(options.side || 'center').toLowerCase();
    layer.setAttribute('data-side', side);
    const uid = options.uid == null ? '' : String(options.uid);
    const random = seededRandom([options.seed, side, uid].join('|'));
    const speed = Math.max(0.5, Math.min(3, Number(options.speed) || 1));
    const duration = Math.round(900 / speed);
    const originX = /left|ally|p1|player/.test(side) ? 36 : /right|enemy|p2|opponent/.test(side) ? 64 : 50;
    const originY = 49;
    layer.style.setProperty('--fx-origin-x', originX + '%');
    layer.style.setProperty('--fx-origin-y', originY + '%');
    layer.style.setProperty('--fx-duration', duration + 'ms');

    const core = doc.createElement('span');
    core.className = 'kanto-shiny-fx-core';
    layer.appendChild(core);
    const halo = doc.createElement('span');
    halo.className = 'kanto-shiny-fx-halo';
    layer.appendChild(halo);

    for (let index = 0; index < particles; index++) {
      const angle = index * Math.PI * 2 / particles + (random() - 0.5) * 0.34;
      const radius = 18 + random() * 28;
      const x = originX + Math.cos(angle) * radius;
      const y = originY + Math.sin(angle) * radius * 0.78;
      const distance = 9 + random() * 20;
      const star = doc.createElement('i');
      star.className = 'kanto-shiny-fx-star' + (index % 4 === 0 ? ' is-gold' : index % 4 === 1 ? ' is-ice' : ' is-white');
      star.style.setProperty('--fx-x', x + '%');
      star.style.setProperty('--fx-y', y + '%');
      star.style.setProperty('--fx-dx', (Math.cos(angle) * distance).toFixed(2) + '%');
      star.style.setProperty('--fx-dy', (Math.sin(angle) * distance * 0.72).toFixed(2) + '%');
      star.style.setProperty('--fx-size', (5 + random() * 12).toFixed(1) + 'px');
      star.style.setProperty('--fx-delay', Math.round(random() * 100) + 'ms');
      layer.appendChild(star);
    }

    const job = { root, layer, uid, particles, timer: null, stopped: false };
    root.appendChild(layer);
    active.add(job);
    byRoot.set(root, job);
    activeParticles += particles;
    job.timer = host.setTimeout(() => removeJob(job), duration + 180);
    return () => removeJob(job);
  }

  host.document.addEventListener?.('visibilitychange', () => { if (host.document.hidden) stopAll(); });
  host.addEventListener?.('pagehide', stopAll);
  host.KantoShinyFx = Object.freeze({ playEntry, stopEntry, stopAll });
})(typeof window === 'object' ? window : globalThis);
