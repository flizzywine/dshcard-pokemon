/* Finite presentation-only camera. Battle state, input and HP panels stay fixed. */
(function (global) {
  'use strict';
  const mounted = new WeakMap();
  function attach(stage, options = {}) {
    if (!stage) return null;
    const existing = mounted.get(stage);
    if (existing) { existing.configure(options); return existing; }
    const document = stage.ownerDocument || global.document;
    const pan = document.createElement('div'), world = document.createElement('div');
    pan.className = 'battle-camera-pan'; world.className = 'battle-camera-world';
    const nodes = [...stage.children].filter(node => node.matches?.('.battle-terrain,.arena-backdrop,.arena-sun,.arena-cloud,.arena-hills,.platform,.pokemon-sprite,#doubleActives,#effectLayer'));
    const positions = nodes.map(node => ({node, next: node.nextSibling}));
    for (const node of nodes) world.appendChild(node);
    pan.appendChild(world); stage.prepend(pan); stage.classList.add('camera-ready');
    let speed = 1, reduced = false, stopped = false, panAnimation = null, shakeAnimation = null;
    const neutral = 'translate(0%,0%) scale(1)';
    function reset() { panAnimation?.cancel(); shakeAnimation?.cancel(); panAnimation = shakeAnimation = null; }
    function configure(next = {}) {
      speed = Math.max(1, Math.min(4, Number(next.speed) || 1));
      reduced = Boolean(next.reduced) || Boolean(global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); reset();
    }
    function animate(node, frames, duration, channel) {
      if (stopped || reduced || document.hidden || typeof node.animate !== 'function') return;
      if (channel === 'pan') panAnimation?.cancel(); else shakeAnimation?.cancel();
      let animation;
      try { animation = node.animate(frames, {duration: Math.max(60, duration / speed), easing: 'cubic-bezier(.2,.65,.3,1)', fill: 'none'}); } catch (_) { return; }
      if (channel === 'pan') panAnimation = animation; else shakeAnimation = animation;
      animation.onfinish = () => { if (channel === 'pan' && panAnimation === animation) panAnimation = null; if (channel === 'shake' && shakeAnimation === animation) shakeAnimation = null; };
    }
    function focus(side, scale) { return `translate(${side === 'player' ? 2.4 : -2.4}%,${side === 'player' ? -1.5 : 1.5}%) scale(${scale})`; }
    function entry() { animate(pan, [{transform:'translate(0%,1%) scale(1.09)'},{transform:neutral}], 700, 'pan'); }
    function attack(attacker, target, details = {}) {
      const strength = Number(details.power) >= 90 ? 1.09 : 1.055;
      animate(pan, [{transform:neutral,offset:0},{transform:focus(attacker,1.035),offset:.2},{transform:focus(target,strength),offset:.62},{transform:neutral,offset:1}], details.self ? 480 : 680, 'pan');
    }
    function impact(side, details = {}) {
      const amount = details.critical ? 6 : 3;
      animate(world, [{transform:'translate(0px,0px)'},{transform:`translate(${-amount}px,${amount/3}px)`},{transform:`translate(${amount}px,${-amount/3}px)`},{transform:'translate(0px,0px)'}], details.critical ? 220 : 150, 'shake');
    }
    function finish() { animate(pan, [{transform:'translate(0%,0%) scale(1.04)'},{transform:neutral}], 650, 'pan'); }
    function onHidden() { if (document.hidden) reset(); }
    function stop() {
      if (stopped) return; stopped = true; reset();
      document.removeEventListener?.('visibilitychange', onHidden); global.removeEventListener?.('pagehide', stop);
      for (const {node, next} of positions.reverse()) stage.insertBefore(node, next?.parentNode === stage ? next : null);
      pan.remove(); stage.classList.remove('camera-ready'); mounted.delete(stage);
    }
    const controller = {world, configure, entry, attack, impact, finish, reset, stop};
    configure(options); mounted.set(stage, controller);
    document.addEventListener?.('visibilitychange', onHidden); global.addEventListener?.('pagehide', stop);
    return controller;
  }
  global.KantoBattleCamera = {attach};
})(typeof window === 'undefined' ? globalThis : window);
