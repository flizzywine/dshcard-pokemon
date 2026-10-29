(function (root) {
  'use strict';

  // Presentation families keyed by the English move id in the Gen III Pokédex.
  // These are readable stage interpretations, not frame-for-frame GBA copies.
  const signatures = {
    absorb: 'drain', acid: 'projectile', acidarmor: 'buff', agility: 'buff', aircutter: 'field', aurorabeam: 'beam', attract: 'debuff', barrage: 'multi', barrier: 'buff', bellydrum: 'buff', bind: 'multi', bite: 'contact', blizzard: 'weather', boneclub: 'projectile', bonemerang: 'multi', bonerush: 'multi', bubble: 'projectile', bubblebeam: 'beam', bulletseed: 'multi', calmmind: 'buff', charge: 'buff', charm: 'debuff', clamp: 'multi', cometpunch: 'multi', confusion: 'beam', constrict: 'contact', conversion: 'buff', cottonspore: 'debuff', crabhammer: 'slash', crunch: 'contact', curse: 'debuff', defensecurl: 'buff', dive: 'contact', disable: 'debuff', doubleedge: 'contact', doublekick: 'multi', doubleslap: 'multi', dragonbreath: 'beam', dragonclaw: 'slash', earthquake: 'field', eggbomb: 'projectile', encore: 'debuff', endure: 'buff', explosion: 'field', extremespeed: 'contact', fireblast: 'projectile', firepunch: 'contact', flamewheel: 'contact', firespin: 'field', flamethrower: 'beam', fissure: 'field', flash: 'debuff', focusenergy: 'buff', futuresight: 'projectile', furyattack: 'multi', furyswipes: 'multi', gust: 'field', hail: 'weather', haze: 'field', headbutt: 'contact', healbell: 'healing', heatwave: 'field', highjumpkick: 'contact', hyperbeam: 'beam', hypervoice: 'field', hypnosis: 'debuff', iceball: 'multi', icebeam: 'beam', icepunch: 'contact', iciclespear: 'multi', icywind: 'projectile', leechseed: 'debuff', lightscreen: 'buff', lovelykiss: 'debuff', magnitude: 'field', meditate: 'buff', megadrain: 'drain', mudshot: 'projectile', mudslap: 'projectile', moonlight: 'healing', nightmare: 'debuff', outrage: 'multi', overheat: 'contact', payday: 'projectile', petaldance: 'slash', pinmissile: 'multi', poisonsting: 'projectile', protect: 'buff', pursuit: 'contact', psychic: 'beam', psybeam: 'beam', psychup: 'buff', quickattack: 'contact', rage: 'contact', raindance: 'weather', razorleaf: 'slash', razorwind: 'field', reflect: 'buff', rest: 'healing', roar: 'debuff', rockblast: 'multi', rockslide: 'field', rockthrow: 'projectile', rocktomb: 'projectile', rollout: 'multi', sandattack: 'debuff', sandstorm: 'weather', sandtomb: 'field', scratch: 'slash', screech: 'debuff', selfdestruct: 'field', shadowball: 'projectile', signalbeam: 'beam', silverwind: 'projectile', sing: 'debuff', sleeppowder: 'debuff', sludgebomb: 'projectile', sludge: 'projectile', smog: 'projectile', snore: 'beam', solarbeam: 'beam', sonicboom: 'projectile', spitup: 'projectile', spikes: 'field', spikecannon: 'multi', spark: 'contact', splash: 'buff', spore: 'debuff', strength: 'contact', substitute: 'buff', sunnyday: 'weather', surf: 'field', swift: 'projectile', swordsdance: 'buff', synthesis: 'healing', tailwhip: 'debuff', teeterdance: 'debuff', thief: 'contact', thunder: 'weather', thunderbolt: 'beam', thunderpunch: 'contact', thunderwave: 'debuff', toxic: 'debuff', triattack: 'beam', twineedle: 'multi', twister: 'field', uproar: 'field', vinewhip: 'contact', volttackle: 'contact', waterfall: 'contact', watergun: 'projectile', whirlpool: 'field', withdraw: 'buff', wrap: 'multi', knockoff: 'contact'
  };

  // Gen III non-contact physical exceptions from the move data. The stock
  // catalogue intentionally omits flags, so retain this reviewed subset here.
  const rangedPhysical = new Set(['hiddenpower', 'mudslap', 'secretpower', 'sludgebomb', 'snore', 'earthquake', 'hyperbeam', 'rockslide', 'swift', 'gust', 'shadowball', 'silverwind', 'poisonsting', 'pinmissile', 'twineedle', 'aircutter', 'skyattack', 'uproar', 'triattack', 'acid', 'spitup', 'present', 'rocktomb', 'sandtomb', 'hypervoice', 'signalbeam', 'fissure', 'magnitude', 'explosion', 'rockblast', 'rockthrow', 'selfdestruct', 'sonicboom', 'sludge', 'spikecannon', 'nightshade', 'mudshot', 'barrage', 'eggbomb', 'boneclub', 'bonemerang', 'bonerush', 'smog', 'razorwind']);

  const supplementalSignatures = Object.freeze({
    ancientpower:'contact', assist:'buff', astonish:'contact', beatup:'multi', bide:'field', brickbreak:'contact',
    conversion2:'buff', counter:'contact', covet:'contact', doomdesire:'projectile', dreameater:'drain',
    extrasensory:'beam', fakeout:'contact', feintattack:'contact', flail:'contact', fly:'contact', followme:'buff',
    foresight:'debuff', furycutter:'multi', gigadrain:'drain', glare:'debuff', hiddenpower:'projectile', jumpkick:'contact',
    leafblade:'slash', lockon:'buff', memento:'debuff', mindreader:'buff', mimic:'buff', mirrorcoat:'projectile',
    mirrormove:'projectile', naturepower:'field', needlearm:'contact', odorsleuth:'debuff', recover:'healing',
    reversal:'contact', rocksmash:'contact', sketch:'buff', sleeptalk:'buff', spite:'debuff', stockpile:'buff',
    struggle:'contact', taunt:'debuff', tickle:'debuff', weatherball:'projectile', zapcannon:'projectile',
    aromatherapy:'healing', camouflage:'buff', detect:'buff', endeavor:'projectile', focuspunch:'contact', growth:'buff',
    imprison:'debuff', ingrain:'buff', magiccoat:'buff', metronome:'buff', minimize:'buff', mist:'buff',
    morningsun:'healing', mudsport:'field', perishsong:'field', poisongas:'debuff', rapidspin:'contact', recycle:'buff',
    safeguard:'buff', scaryface:'debuff', secretpower:'projectile', snatch:'buff', swallow:'healing', tackle:'contact',
    tailglow:'buff', thrash:'multi', torment:'debuff', transform:'buff', watersport:'field', whirlwind:'field',
    wish:'healing', yawn:'debuff', bodyslam:'contact', bounce:'contact', grasswhistle:'debuff', growl:'debuff',
    hydropump:'projectile', leechlife:'drain', lick:'contact', meanlook:'debuff', metalsound:'debuff', meteormash:'contact',
    muddywater:'field', poisonfang:'contact', poisonpowder:'debuff', psywave:'projectile', skullbash:'contact',
    smellingsalts:'contact', stringshot:'debuff', stunspore:'debuff', submission:'contact', supersonic:'debuff',
    sweetkiss:'debuff', sweetscent:'debuff', willowisp:'debuff', destinybond:'field', sheercold:'field', swagger:'debuff',
    dizzypunch:'contact', dragonrage:'projectile', frustration:'contact', howl:'buff', hyperfang:'contact',
    karatechop:'contact', lowkick:'contact', psychoboost:'beam', refresh:'healing', return:'contact', rollingkick:'contact',
    sharpen:'buff', skyuppercut:'contact', spiderweb:'debuff', teleport:'field', cut:'slash', grudge:'debuff',
    kinesis:'debuff', lusterpurge:'beam', milkdrink:'healing', mistball:'beam', octazooka:'projectile', revenge:'contact',
    slackoff:'healing', softboiled:'healing', vitalthrow:'contact', aerialace:'slash', aeroblast:'beam', amnesia:'buff',
    armthrust:'multi', batonpass:'buff', blastburn:'beam', blazekick:'contact', bulkup:'buff', confuseray:'debuff',
    cosmicpower:'buff', crosschop:'slash', crushclaw:'contact', doubleteam:'buff', dragondance:'buff', drillpeck:'contact',
    dynamicpunch:'contact', eruption:'field', facade:'contact', faketears:'debuff', falseswipe:'contact', featherdance:'debuff',
    flatter:'debuff', frenzyplant:'beam', guillotine:'contact', harden:'buff', helpinghand:'buff', hornattack:'contact',
    horndrill:'contact', hydrocannon:'beam', irondefense:'buff', irontail:'contact', leer:'debuff', machpunch:'contact',
    magicalleaf:'projectile', megahorn:'contact', megakick:'contact', megapunch:'contact', metalclaw:'contact',
    nightshade:'projectile', painsplit:'drain', peck:'contact', poisontail:'contact', pound:'contact', powdersnow:'projectile',
    present:'projectile', roleplay:'buff', sacredfire:'projectile', seismictoss:'contact', shadowpunch:'contact',
    shockwave:'beam', skillswap:'buff', skyattack:'projectile', slam:'contact', smokescreen:'debuff', steelwing:'contact',
    stomp:'contact', superfang:'contact', superpower:'contact', takedown:'contact', thundershock:'projectile', trick:'debuff',
    triplekick:'multi', visegrip:'contact', waterpulse:'projectile', waterspout:'field', wingattack:'contact'
  });

  // Named stage cues give signature moves their own readable choreography.
  const stageCues = Object.freeze({
    firespin: 'fire-vortex', flamethrower: 'fire-stream', fireblast: 'fire-sigil', ember: 'ember-burst',
    hydropump: 'water-cannon', watergun: 'water-jet', surf: 'surf-surge', whirlpool: 'water-vortex',
    thunderbolt: 'thunder-strike', thunder: 'storm-strike', icebeam: 'frost-beam', blizzard: 'whiteout',
    razorleaf: 'leaf-volley', solarbeam: 'solar-charge', psychic: 'psychic-crush', shadowball: 'shadow-orb',
    earthquake: 'fault-line', rockslide: 'falling-rock', hyperbeam: 'hyperbeam-charge', outrage: 'dragon-rush',
    dragonrage: 'dragon-flare', leechseed: 'seed-vine',
    aeroblast: 'aeroblast-gale', sacredfire: 'sacredfire-flame', doomdesire: 'delayed-star',
    hypnosis: 'hypnosis-rings', dreameater: 'dream-drain', doubleteam: 'afterimage',
    substitute: 'substitute-pop', teleport: 'phase-blink', transform: 'morph-shift',
    metronome: 'metronome-orbit', mimic: 'copy-spark',
    mirrorcoat: 'reflect-return', counter: 'counter-return', bide: 'stored-energy',
    fakeout: 'quick-feint', brickbreak: 'barrier-break', recover: 'recovery-glow',
    taunt: 'taunt-wave', assist: 'ally-call', wish: 'wish-star', rapidspin: 'spin-sweep',
    weatherball: 'weather-orb', destinybond: 'bond-shadow', mindreader: 'lock-on',
    conversion2: 'type-shift', odorsleuth: 'scent-mark', camouflage: 'terrain-shift',
    roleplay: 'ability-echo', endeavor: 'last-stand', stockpile: 'stored-guard',
    swallow: 'stockpile-heal', refresh: 'refresh-pulse', aromatherapy: 'healing-bell',
    painsplit: 'hp-balance', perishsong: 'perish-chime', yawn: 'sleep-cloud',
    helpinghand: 'ally-boost', feintattack: 'shadow-strike', extrasensory: 'sense-wave',
    leafblade: 'leaf-cut', zapcannon: 'charged-bolt', hydrocannon: 'water-cannon-charge',
    blastburn: 'fire-cannon-charge', frenzyplant: 'root-cannon-charge', eruption: 'lava-burst',
    crosschop: 'cross-slash', meteormash: 'meteor-fist', steelwing: 'steel-feather',
    rocksmash: 'stone-crack', furycutter: 'crescent-combo', armthrust: 'arm-thrust',
    dive: 'deep-dive', fly: 'sky-dive', bounce: 'sky-bounce',
    aurorabeam: 'aurora-ribbon', icywind: 'ice-flurry', powdersnow: 'powder-squall',
    thundershock: 'electric-arc', magicalleaf: 'homing-leaves', rockthrow: 'stone-shot',
    rocktomb: 'stone-tomb', mudshot: 'mud-sling', mudslap: 'mud-sling', extrasensory: 'sense-flare',
  });

  // Renderer-ready choreography. Each move gets four bounded phases; the
  // selected signature moves below override the general shape with distinctive
  // trajectories. Values describe presentation only and never alter battle data.
  const palettes = Object.freeze({
    fire: ['#ffb14a', '#ff5c35', '#ffe08a'], water: ['#a7edff', '#45b9ef', '#efffff'],
    electric: ['#fff49a', '#ffd83d', '#fffde1'], ice: ['#dcfbff', '#77d9ff', '#ffffff'],
    grass: ['#c9f27a', '#61c96a', '#f4ffd2'], psychic: ['#ffc4ee', '#c878ed', '#fff0ff'],
    ghost: ['#c9b0ff', '#7450bd', '#eee2ff'], ground: ['#f2c27e', '#b97843', '#fff0c8'],
    rock: ['#e6c69a', '#a9825b', '#fff0d1'], dragon: ['#f8a6cf', '#9a6be8', '#fff0ff'],
    normal: ['#f4f1dc', '#c9c3a9', '#ffffff'], fighting: ['#ffd0a8', '#e77952', '#fff1d8'],
    poison: ['#e6a9ed', '#a552b8', '#fff0ff'], bug: ['#d8ed79', '#89aa43', '#f7ffd6'],
    flying: ['#d4ddff', '#91a9e8', '#ffffff'], steel: ['#d8e7f2', '#8ca9bd', '#ffffff'],
    dark: ['#c6bdde', '#5c526f', '#eeeaff'], fairy: ['#ffd0e5', '#f28bad', '#fff1f7']
  });
  const specialMotion = Object.freeze({
    flamethrower: ['fire-lance', 'spiral-stream', 8], firespin: ['orbiting-vortex', 'encircle', 10], fireblast: ['five-point-sigil', 'radial-burst', 9],
    watergun: ['narrow-water-jet', 'straight', 4], hydropump: ['pressurized-cannon', 'straight-heavy', 8], surf: ['advancing-tidal-wall', 'horizontal-surge', 12],
    thunderbolt: ['forked-lightning', 'zigzag', 6], thunder: ['sky-to-ground-bolt', 'vertical-strike', 8], icebeam: ['crystalline-ray', 'straight-prismatic', 7], blizzard: ['whiteout-spiral', 'storm-field', 13],
    solarbeam: ['sun-charged-ray', 'charge-then-line', 9], razorleaf: ['crossing-leaf-fan', 'fan-volley', 8], psychic: ['telekinetic-crush', 'inward-collapse', 6], hypnosis: ['sleeping-eye-rings', 'expanding-rings', 5],
    leechseed: ['seed-then-root-tether', 'seed-arc-root-return', 5], shadowball: ['dark-orb-with-wake', 'orb-arc', 5], earthquake: ['ground-fault-wave', 'horizontal-fault', 9], rockslide: ['staggered-falling-boulders', 'overhead-fall', 4],
    hyperbeam: ['charged-prismatic-cannon', 'charge-then-line', 10], selfdestruct: ['self-centered-flash-burst', 'radial-self-burst', 12], explosion: ['wide-pressure-detonation', 'radial-wide-burst', 16],
    dragonrage: ['dragonfire-orb', 'curved-orb', 5], dragonclaw: ['three-dragon-claw-arcs', 'triple-rake', 3], fly: ['rise-disappear-dive', 'vertical-loop-dive', 2], dig: ['burrow-and-ground-burst', 'subterranean-approach', 5],
    substitute: ['decoy-pop-and-settle', 'self-decoy', 4], protect: ['faceted-guard-dome', 'self-inward-shield', 7]
  });
  const hueFor = type => String(type || 'Normal').toLowerCase();
  const idSeed = id => [...id].reduce((sum, letter) => (sum * 31 + letter.charCodeAt(0)) >>> 0, 7);
  function makeChoreography(id, type, mode, category) {
    const palette = palettes[hueFor(type)] || palettes.normal;
    const seed = idSeed(id), motion = specialMotion[id];
    const familyMotion = ({beam:'focused-ray', projectile:'traveling-projectile', contact:'body-lunge', slash:'sweeping-cut', multi:'repeated-volley', buff:'self-aura', debuff:'target-mark', field:'ground-field', weather:'arena-weather', healing:'restorative-pulse', drain:'tethered-drain', status:'status-wave'})[mode] || 'single-impact';
    const trajectoryBase = motion?.[1] || familyMotion;
    const routeStyle = ['arc','spiral','zigzag','fan','orbit','line'][seed % 6];
    const trajectory = `${trajectoryBase}-${id}-${routeStyle}`;
    const baseParticles = motion?.[2] || ({beam:3, projectile:3, contact:2, slash:2, multi:3, buff:3, debuff:2, field:4, weather:4, healing:3, drain:3, status:2})[mode] || 2;
    const time = mode === 'weather' || mode === 'field' ? 560 : 430;
    const muted = category === 'Status';
    const phaseColors = [palette[seed % 3], palette[(seed + 1) % 3], palette[(seed + 2) % 3]];
    return Object.freeze({
      name: motion?.[0] || `${id}-motion`, trajectory,
      phases: Object.freeze([
        Object.freeze({ phase:'prepare', fx: mode === 'weather' || mode === 'field' ? 'field-gather' : 'focus', color:phaseColors[0], duration: muted ? 170 : 220 + (seed % 5) * 18, particles:Math.min(5, Math.max(1, Math.ceil(baseParticles / 3))) }),
        Object.freeze({ phase:'travel', fx:mode === 'buff' || mode === 'healing' ? 'aura' : mode === 'contact' || mode === 'slash' ? 'lunge' : 'trail', color:phaseColors[1], duration:time, particles:baseParticles, path:trajectory }),
        Object.freeze({ phase:'impact', fx:mode === 'buff' || mode === 'healing' ? 'pulse' : 'impact', color:phaseColors[2], duration:210 + (seed % 4) * 24, particles:Math.min(6, baseParticles + 1), path:trajectory }),
        Object.freeze({ phase:'settle', fx:mode === 'weather' || mode === 'field' ? 'field-fade' : 'spark-fade', color:phaseColors[0], duration:180 + (seed % 3) * 20, particles:Math.min(5, Math.ceil(baseParticles / 2)) })
      ])
    });
  }

  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  function resolve(move, selfTarget = false) {
    if (!move) return null;
    const id = normalize(move.id || move.english || move.name);
    const category = String(move.category || '');
    const normalizedCategory = category.toLowerCase();
    const type = String(move.type || 'Normal');
    let mode = signatures[id] || supplementalSignatures[id] || '';
    if (!mode && move.multihit) mode = 'multi';
    if (!mode && normalizedCategory === 'status') mode = selfTarget ? 'buff' : 'debuff';
    if (!mode && normalizedCategory === 'physical') {
      const hasContactFlag = typeof move.contact === 'boolean' || move.flags?.contact !== undefined;
      const contact = hasContactFlag ? Boolean(move.contact ?? move.flags?.contact) : !rangedPhysical.has(id);
      mode = contact ? 'contact' : 'projectile';
    }
    if (!mode && normalizedCategory === 'special') mode = 'projectile';
    if (!mode) mode = 'status';
    return { id, type, category, mode, cue: stageCues[id] || null,
      choreography: makeChoreography(id, type, mode, category),
      number: move.number ?? move.num ?? null, generation: move.generation ?? move.gen ?? null,
      target: move.target || null, multihit: move.multihit ?? null,
      flags: {...(move.flags || {})}, contact: Boolean(move.contact ?? move.flags?.contact) };
  }

  root.KantoBattleFx = Object.freeze({ resolve, signatures: Object.freeze(signatures), stageCues });
})(typeof globalThis !== 'undefined' ? globalThis : window);
