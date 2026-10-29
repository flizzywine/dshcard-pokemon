(() => {
  'use strict';
  // All sources are bundled media; no synthesized sound is labelled as game audio.
  let manifest = window.__KANTO_AUDIO_MANIFEST__ || null;
  let musicEnabled = true, musicManaged = window.__KANTO_EMBED__?.musicManaged === true, effectsEnabled = true, track = '', currentBattle = null, currentWorld = null;
  let blocked = false, finishedId = '', enabled = false, effectiveness = 'hit';
  const bgm = new Audio();
  bgm.preload = 'auto'; bgm.volume = .36;
  const activeEffects = new Set();
  const stateListeners = new Set();
  const status = () => ({ blocked, playing: !bgm.paused, musicEnabled, enabled, track, needsGesture: !musicManaged && blocked && bgm.paused && musicEnabled && enabled && Boolean(track) });
  const label = () => {
    const button = document.getElementById('musicToggle');
    if (!button) return;
    button.setAttribute('aria-pressed', String(!musicEnabled));
    const span = button.querySelector('span:last-child');
    if (span) span.textContent = !musicEnabled ? '音乐 关' : blocked ? '点击播放音乐' : '音乐 开';
    button.title = track && !bgm.paused ? '正在播放：' + (manifest?.bgm?.[track]?.track || track) : '原版火红叶绿音乐';
    button.dataset.playing = String(!bgm.paused);
    const current = status(); stateListeners.forEach(listener => { try { listener(current); } catch { /* UI observers are isolated from audio playback. */ } });
  };
  bgm.addEventListener('pause', label);
  bgm.addEventListener('playing', label);
  function url(entry) {
    const file = typeof entry === 'string' ? entry : entry?.file;
    if (typeof file !== 'string' || !/^assets\/audio\/[a-z0-9_./-]+$/i.test(file) || file.includes('..')) return '';
    return window.KantoAssets ? window.KantoAssets.href(file) : new URL('./' + file, document.baseURI).toString();
  }
  function playMusic(key, loop = true) {
    const source = url(manifest?.bgm?.[key]);
    if (!source || !enabled || !musicEnabled || musicManaged) return;
    if (track !== key) { track = key; bgm.src = source; bgm.loop = loop; }
    if (!bgm.paused) return;
    bgm.play().then(() => { blocked = false; label(); }).catch(() => { blocked = true; label(); });
  }
  function sound(entry, volume = .7) {
    const source = url(entry);
    if (!source || !effectsEnabled) return;
    const audio = new Audio(source); audio.volume = volume; activeEffects.add(audio);
    const clear = () => activeEffects.delete(audio);
    audio.addEventListener('ended', clear, {once:true}); audio.addEventListener('error', clear, {once:true});
    audio.play().catch(clear);
  }
  function sync() {
    if (!currentBattle || !enabled) return;
    const mode = currentWorld?.遭遇?.类型 || currentBattle.mode;
    const champion = /冠军/.test(currentWorld?.遭遇?.训练家 || '');
    if (!currentBattle.ended) {
      finishedId = '';
      playMusic(champion ? 'rival' : mode === 'gym' ? 'gym' : mode === 'wild' ? 'wild' : 'trainer');
    } else if (finishedId !== currentBattle.id) {
      finishedId = currentBattle.id;
      if (currentBattle.caught || currentWorld?.战斗?.结果 === 'caught') {
        bgm.pause(); track = ''; sound(manifest?.sfx?.capture);
      } else if (['player', '训练家'].includes(currentBattle.winner) || currentBattle.winner === currentWorld?.训练家?.姓名 || currentBattle.winner === currentBattle.sides?.[0]?.name || currentWorld?.战斗?.结果 === 'win') {
        playMusic(mode === 'gym' ? 'gymVictory' : mode === 'wild' ? 'wildVictory' : 'trainerVictory', false);
      } else { bgm.pause(); track = ''; }
    }
  }
  async function init() {
    if (!manifest) {
      try { const response = await fetch(new URL('./data/audio.json', document.baseURI)); if (response.ok) manifest = await response.json(); } catch { /* Text hint stays available if optional media is missing. */ }
    }
    label(); sync();
    return manifest;
  }
  function unlock() { blocked = false; label(); sync(); }
  async function resumeMusic() {
    if (!musicEnabled || !enabled || musicManaged) return false;
    if (!track) sync();
    if (!track) return false;
    try { blocked = false; await bgm.play(); label(); return true; }
    catch { blocked = true; label(); return false; }
  }
  document.addEventListener('pointerdown', unlock, {passive:true});
  document.addEventListener('keydown', unlock);
  window.addEventListener('pagehide', () => { bgm.pause(); activeEffects.forEach(audio => audio.pause()); activeEffects.clear(); });
  window.KantoAudio = {
    init,
    battle(snapshot, world, active = true) { currentBattle = snapshot; currentWorld = world; enabled = active; if (!active) { bgm.pause(); return; } sync(); },
    music(on) { musicEnabled = Boolean(on); if (!musicEnabled || musicManaged) bgm.pause(); else sync(); label(); return musicEnabled; },
    managed(on) { musicManaged = on === true; if (musicManaged) { bgm.pause(); track = ''; } else sync(); label(); },
    toggleMusic() { return this.music(!musicEnabled); },
    resumeMusic,
    status,
    watchState(listener) { if (typeof listener !== 'function') return () => {}; stateListeners.add(listener); listener(status()); return () => stateListeners.delete(listener); },
    effects(on) { effectsEnabled = Boolean(on); if (!effectsEnabled) activeEffects.forEach(audio => audio.pause()); },
    heal() { sound(manifest?.sfx?.heal); },
    event(line, index, events) {
      const parts = String(line).split('|'), kind = parts[1];
      if (kind === 'move') {
        effectiveness = 'hit';
        const move = String(parts[3] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        // A manifest entry can exist with file:null. Select a playable clip,
        // rather than letting that placeholder suppress the shared fallback.
        // The bundled hit clip is a generic cue, not a claimed move-specific SFX.
        const clip=[manifest?.moves?.[move],manifest?.sfx?.move,manifest?.sfx?.hit].find(entry=>url(entry));
        sound(clip,.45);
      } else if (kind === '-supereffective') effectiveness = 'superEffective';
      else if (kind === '-resisted') effectiveness = 'notVeryEffective';
      else if (kind === '-damage' && !parts.some(part => /\[from\]/.test(part))) {
        sound(manifest?.sfx?.[effectiveness] || manifest?.sfx?.hit);
      } else if (['-fail', '-immune', '-miss'].includes(kind)) sound([manifest?.sfx?.fail,manifest?.sfx?.menu,manifest?.sfx?.notVeryEffective].find(entry=>url(entry)),.35);
      else if (kind === '-heal') sound(manifest?.sfx?.healItem, .5);
    },
    stop() { bgm.pause(); track = ''; currentBattle = null; enabled = false; },
  };
})();
