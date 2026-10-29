/* A small, standalone presentation layer for important Kanto battles. */
(function installImportantBattle(global, factory) {
  const api = factory(global);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (global) global.KantoImportantBattle = api;
})(typeof globalThis === 'object' ? globalThis : this, function createImportantBattle(global) {
  'use strict';

  const controllers = new Set();
  const byArena = new WeakMap();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const safeAccent = value => /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? String(value) : '#6b8a71';

  function unwrap(presentation) {
    return presentation?.battle && typeof presentation.battle === 'object' ? presentation.battle : presentation || {};
  }

  function trainerFor(presentation, id) {
    if (!id || !Array.isArray(presentation?.trainers)) return null;
    const key = String(id).toLocaleLowerCase();
    return presentation.trainers.find(trainer => String(trainer?.id || '').toLocaleLowerCase() === key) || null;
  }

  function assetUrl(value, resolver) {
    const path = typeof value === 'string' ? value : '';
    if (!path) return '';
    try {
      if (typeof resolver === 'function') return String(resolver(path) || '');
      if (typeof resolver === 'string' && resolver) return `${resolver.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
    } catch { /* Missing asset adapters must not break battle presentation. */ }
    return path;
  }

  function imageSource(value, trainers, resolver) {
    let path = '';
    if (typeof value === 'string') {
      path = /^(?:assets\/|\/|https?:\/\/)/i.test(value) ? value : trainerFor({ trainers }, value)?.art || trainerFor({ trainers }, value)?.image || '';
    } else if (value && typeof value === 'object') path = value.art || value.image || value.portrait || '';
    return assetUrl(path, resolver);
  }

  function resolveDuration(descriptor, options) {
    const reduced = options.reduced === true || global?.window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    const speed = clamp(Number(options.speed) || 1, .25, 4);
    const raw = Number(descriptor.duration) || 1260;
    return { reduced, speed, entrance: reduced ? 300 : clamp(raw / speed, 360, 1500) };
  }

  function createNode(document, tag, className) {
    const node = document.createElement(tag);
    node.className = className;
    return node;
  }

  function snapshotState(snapshot, options) {
    const playerSide = options.playerSide && typeof options.playerSide === 'object'
      ? options.playerSide.battleSide || options.playerSide.side || options.playerSide
      : options.playerSide;
    const playerIndex = ['p2', 'right', 1, 2].includes(playerSide) ? 1 : 0;
    const sides = Array.isArray(snapshot?.sides) ? snapshot.sides : [];
    const active = sides.map((side, index) => {
      const team = Array.isArray(side?.team) ? side.team : [];
      const activeUids = Array.isArray(side?.activeUIDs) ? side.activeUIDs.filter(Boolean).map(String)
        : team.filter(mon => mon?.active).map(mon => String(mon.uid || '')).filter(Boolean);
      const activeSet = new Set(activeUids);
      const mons = team.filter(mon => mon && ((mon.uid && activeSet.has(String(mon.uid))) || (!activeUids.length && mon.active)));
      return { index, activeUids, mons, team };
    });
    const hp = new Map();
    for (const [index, side] of sides.entries()) for (const mon of side?.team || []) {
      if (!mon?.uid) continue;
      const max = Number(mon.maxhp), current = Number(mon.hp);
      if (Number.isFinite(max) && max > 0 && Number.isFinite(current)) hp.set(`${index}:${mon.uid}`, { hp: current, max });
    }
    return { active, hp, playerIndex };
  }

  function enter(arena, presentation, options = {}) {
    const document = arena?.ownerDocument || global?.document;
    if (!arena?.appendChild || !document?.createElement) return null;
    byArena.get(arena)?.stop();

    const descriptor = unwrap(presentation);
    if (!descriptor.important && !descriptor.importantKind) return null;
    const timing = resolveDuration(descriptor, options);
    const scene = String(descriptor.scene || (descriptor.importantKind === 'gym' ? `gym-${descriptor.key}` : descriptor.importantKind) || 'rival-diagonal');
    const replay = options.replay !== false;
    const root = createNode(document, 'section', `kanto-important-battle ${replay ? 'is-entering' : 'is-idle'}`);
    root.dataset.kind = String(descriptor.kind || descriptor.importantKind || 'rival');
    root.dataset.scene = scene;
    root.dataset.beat = 'entrance';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    if (!replay) root.setAttribute('aria-hidden', 'true');
    root.style.setProperty('--important-accent', safeAccent(descriptor.accent));
    root.style.setProperty('--important-duration', `${timing.entrance}ms`);
    if (timing.reduced) root.classList.add('is-reduced');

    const visual = createNode(document, 'div', 'kanto-important-visual');
    visual.setAttribute('aria-hidden', 'true');
    const trainers = Array.isArray(presentation?.trainers) ? presentation.trainers : [];
    const opponentTrainer = trainerFor({ trainers }, options.opponentUid) ||
      trainerFor({ trainers }, presentation?.scene?.npcId || presentation?.opponentUid);
    const opponentImage = createNode(document, 'img', 'kanto-important-opponent');
    opponentImage.alt = '';
    opponentImage.draggable = false;
    const playerImage = createNode(document, 'img', 'kanto-important-player');
    playerImage.alt = '';
    playerImage.draggable = false;
    const opponentSrc = assetUrl(descriptor.portrait || opponentTrainer?.art || opponentTrainer?.image || '', options.assetHref);
    const playerPortrait = options.playerPortrait || options.playerSide?.portrait || options.playerSide?.art ||
      (typeof options.playerSide === 'object' ? options.playerSide : options.playerSide);
    const playerSrc = imageSource(playerPortrait, trainers, options.assetHref);
    for (const [img, src, side] of [[opponentImage, opponentSrc, 'opponent'], [playerImage, playerSrc, 'player']]) {
      if (!src) { img.hidden = true; continue; }
      img.onerror = () => { img.hidden = true; root.dataset[`${side}Portrait`] = 'missing'; };
      img.src = src;
    }
    const crest = createNode(document, 'span', 'kanto-important-crest');
    crest.textContent = descriptor.badge || (descriptor.importantKind === 'rocket' ? 'R' : descriptor.importantKind === 'quest' ? '守' : 'VS');
    visual.append(opponentImage, playerImage, crest);

    const copy = createNode(document, 'div', 'kanto-important-copy');
    const eyebrow = createNode(document, 'small', 'kanto-important-eyebrow');
    eyebrow.textContent = descriptor.title || descriptor.opponent || '重要对战';
    const title = createNode(document, 'strong', 'kanto-important-title');
    title.textContent = descriptor.opponent || opponentTrainer?.name || '对手';
    const detail = createNode(document, 'span', 'kanto-important-detail');
    detail.textContent = descriptor.line || '做好准备，迎接这场挑战。';
    copy.append(eyebrow, title, detail);

    const beatLine = createNode(document, 'i', 'kanto-important-beat-line');
    beatLine.setAttribute('aria-hidden', 'true');
    const skip = createNode(document, 'button', 'kanto-important-skip');
    skip.type = 'button';
    skip.textContent = '略过演出';
    root.append(visual, copy, beatLine, skip);
    arena.appendChild(root);

    const state = {
      arena, root, detail, title, eyebrow, descriptor, options, timing,
      timers: new Set(), previous: options.snapshot ? snapshotState(options.snapshot, options) : null,
      seen: new Set(), stopped: false, pageView: document.defaultView || global?.window || null, onPageHide: null,
      stop() {
        if (state.stopped) return;
        state.stopped = true;
        for (const timer of state.timers) clearTimeout(timer);
        state.timers.clear();
        if (state.onPageHide) state.pageView?.removeEventListener?.('pagehide', state.onPageHide);
        opponentImage.onerror = null;
        playerImage.onerror = null;
        root.remove();
        controllers.delete(state);
        if (byArena.get(arena) === state) byArena.delete(arena);
      }
    };
    state.onPageHide = () => state.stop();
    state.pageView?.addEventListener?.('pagehide', state.onPageHide, { once: true });
    skip.addEventListener('click', () => state.idle());
    state.idle = () => {
      if (state.stopped) return;
      root.classList.remove('is-entering', 'is-beat', 'is-paused');
      root.classList.add('is-idle');
      root.setAttribute('aria-hidden', 'true');
    };
    state.timer = fn => {
      const timer = setTimeout(() => { state.timers.delete(timer); if (!state.stopped) fn(); }, timing.reduced ? 330 : Math.min(920, 720 / timing.speed));
      state.timers.add(timer);
      return timer;
    };
    state.showBeat = (key, beat, label, heading, description) => {
      if (state.stopped || state.seen.has(key)) return false;
      state.seen.add(key);
      for (const timer of state.timers) clearTimeout(timer);
      state.timers.clear();
      root.dataset.beat = beat;
      eyebrow.textContent = label;
      title.textContent = heading;
      detail.textContent = description;
      root.removeAttribute('aria-hidden');
      root.classList.remove('is-idle', 'is-entering', 'is-paused', 'is-beat');
      void root.offsetWidth;
      root.classList.add('is-beat');
      if (key === 'ace-reveal' && !timing.reduced) {
        root.classList.add('is-paused');
        state.timer(() => root.classList.remove('is-paused'));
      }
      state.timer(state.idle);
      return true;
    };
    state.seed = snapshot => { state.previous = snapshotState(snapshot, state.options); };
    controllers.add(state);
    byArena.set(arena, state);
    if (replay) state.timer(state.idle);
    return { stop: state.stop, skip: state.idle, node: root, update: (snapshot, nextOptions) => update(arena, snapshot, nextOptions) };
  }

  function update(arena, snapshot, options = {}) {
    const state = arena && byArena.get(arena);
    if (!state || state.stopped || !snapshot || !Array.isArray(snapshot.sides)) return false;
    state.options = { ...state.options, ...options };
    state.timing = resolveDuration(state.descriptor, state.options);
    state.root.classList.toggle('is-reduced', state.timing.reduced);
    const current = snapshotState(snapshot, state.options);
    if (!state.previous) { state.previous = current; return false; }
    if (options.quiet === true) { state.previous = current; return false; }

    const playerIndex = current.playerIndex;
    const opponentIndex = playerIndex === 0 ? 1 : 0;
    if (snapshot.ended === true) {
      const rawWinner = String(snapshot.winner || '').trim();
      const compatWinner = rawWinner === 'p1' ? 0 : rawWinner === 'p2' ? 1 : -1;
      const namedWinner = compatWinner < 0 ? (snapshot.sides || []).findIndex(side => String(side?.name || '').trim().toLocaleLowerCase() === rawWinner.toLocaleLowerCase()) : compatWinner;
      const outcome = rawWinner === 'tie' ? 'draw' : namedWinner === playerIndex ? 'victory' : namedWinner === opponentIndex ? 'defeat' : 'ended';
      const heading = outcome === 'victory' ? '本场胜利' : outcome === 'defeat' ? '本场失利' : outcome === 'draw' ? '本场平局' : '战斗结束';
      if (state.showBeat(`outcome:${snapshot.winner || 'ended'}`, outcome, '战斗结果', heading, '结果以本场战斗记录为准。')) {
        state.previous = current;
        return outcome;
      }
    }

    const opponentActive = current.active[opponentIndex];
    const previousOpponent = state.previous.active[opponentIndex];
    const aceId = Number(state.descriptor.aceSpeciesId || 0);
    if (aceId && opponentActive && previousOpponent) {
      const newlyActive = opponentActive.mons.find(mon => mon?.uid && !previousOpponent.activeUids.includes(String(mon.uid)) && Number(mon.id || mon.appearanceId) === aceId && !mon.fainted && Number(mon.hp) > 0);
      if (newlyActive && state.showBeat(`ace:${newlyActive.uid}`, 'ace-reveal', '王牌登场', newlyActive.name || '对手的宝可梦', '新的对手已经上场。')) {
        state.previous = current;
        return 'ace-reveal';
      }
    }

    for (const [sideIndex, side] of snapshot.sides.entries()) {
      for (const mon of side?.team || []) {
        if (!mon?.uid) continue;
        const before = state.previous.hp.get(`${sideIndex}:${mon.uid}`), hp = Number(mon.hp), max = Number(mon.maxhp);
        if (!before || !Number.isFinite(hp) || !Number.isFinite(max) || max <= 0 || hp <= 0 || hp / max > .25 || before.hp / before.max <= .25) continue;
        if (state.showBeat(`pressure:${sideIndex}:${mon.uid}`, 'pressure-turn', '战局转折', mon.name || '宝可梦体力告急', `当前体力 ${hp} / ${max}。`)) {
          state.previous = current;
          return 'pressure-turn';
        }
      }
    }

    state.previous = current;
    return false;
  }

  function stopAll(arena) {
    if (arena) { byArena.get(arena)?.stop(); return; }
    for (const controller of [...controllers]) controller.stop();
  }

  return Object.freeze({ enter, update, stopAll });
});
