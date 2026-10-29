'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { KantoGame } = require('../engine.cjs');
require('../public/important-battle.js');
const importantBattle = globalThis.KantoImportantBattle;

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
function fn(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(app);
  assert.ok(match, `app.js defines ${name}`);
  const start = match.index, paren = app.indexOf('(', start); let parenDepth = 0, quote = '', escaped = false, close = -1;
  for (let i = paren; i < app.length; i++) {
    const ch = app[i];
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '(') parenDepth++;
    if (ch === ')' && --parenDepth === 0) { close = i; break; }
  }
  const open = app.indexOf('{', close); let depth = 0; quote = ''; escaped = false;
  for (let i = open; i < app.length; i++) {
    const ch = app[i];
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return app.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}
class Classes {
  constructor() { this.names = new Set(); }
  add(...names) { names.forEach(name => this.names.add(name)); }
  remove(...names) { names.forEach(name => this.names.delete(name)); }
  toggle(name, force) { const value = force === undefined ? !this.names.has(name) : Boolean(force); value ? this.names.add(name) : this.names.delete(name); return value; }
  contains(name) { return this.names.has(name); }
}
class Node {
  constructor(tag = 'div', rect = { left:0, top:0, width:0, height:0 }, ownerDocument = null) { this.tagName = tag; this.rect = rect; this.dataset = {}; this.style = {setProperty(key,value){this[key]=value;}}; this.classList = new Classes(); this.children = []; this.listeners = {}; this.hidden = false; this.removed = false; this.ownerDocument=ownerDocument; }
  append(...nodes) { nodes.forEach(node=>this.appendChild(node)); }
  appendChild(node) { node.parent = this; this.children.push(node); return node; }
  remove() { this.removed = true; if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
  getBoundingClientRect() { return this.rect; }
  setAttribute() {}
  removeAttribute() {}
  addEventListener(type, fn) { this.listeners[type] = fn; }
}
function realFinishedBattle() {
  const game = new KantoGame();
  const start = game.start({ mode:'practice', seed:[12,34,56,78], team:[{id:150,uid:'player-mewtwo',moves:['psychic']}], opponent:[{id:129,uid:'foe-magikarp',moves:['splash']}] });
  const result = game.act({ battleId:start.id, choice:'move 1' });
  assert.equal(result.ended, true);
  assert.equal(result.winner, result.sides[0].name, 'the real Showdown snapshot reports its winner by side name');
  return {start,result};
}

test('actual engine winner side names drive the victory moment and the winner cosmetic', () => {
  const {result:snapshot} = realFinishedBattle(), effects = [], moments = [];
  const context = {
    state:{cinematicMoments:new Set()},
    winnerSideIndex:null,
    clearCosmeticKey() {},
    activeMonAt:(side, slot) => side?.team?.filter(mon => mon.active)[slot] || null,
    playCosmetic:(...args) => effects.push(args),
    protocol:line => String(line).split('|'),
    showBattleMoment:(...args) => moments.push(args),
  };
  vm.runInNewContext(`${fn('winnerSideIndex')}\n${fn('playCosmeticOutcome')}\n${fn('markBattleOutcome')}\nglobalThis.run={winnerSideIndex,playCosmeticOutcome,markBattleOutcome};`, context);
  assert.equal(context.run.winnerSideIndex(snapshot), 0);
  context.run.playCosmeticOutcome(snapshot);
  context.run.markBattleOutcome(`|win|${snapshot.winner}`, snapshot);
  assert.equal(effects.length, 1); assert.equal(effects[0][1], 'player-mewtwo'); assert.equal(effects[0][2], 'outcome');
  assert.equal(moments[0][1], '本场胜利');
  assert.equal(context.run.winnerSideIndex({...snapshot, winner:'p1'}), 0, 'legacy p1 values remain supported');
  assert.equal(context.run.winnerSideIndex({...snapshot, winner:'p2'}), 1, 'legacy p2 values remain supported');
});

test('important battle result update accepts the engine side-name winner from a full battle', () => {
  const {start,result} = realFinishedBattle();
  let windowPagehide;
  const view={addEventListener:(name,fn)=>{if(name==='pagehide')windowPagehide=fn;},removeEventListener:name=>{if(name==='pagehide')windowPagehide=undefined;}};
  const document={defaultView:view,createElement:tag=>new Node(tag,{left:0,top:0,width:0,height:0},document)};
  const arena=new Node('arena',{left:0,top:0,width:800,height:400},document);
  const controller=importantBattle.enter(arena,{battle:{important:true,importantKind:'rival',kind:'rival',scene:'rival-diagonal',title:'劲敌对决',opponent:'小茂',duration:1200},trainers:[]},{snapshot:start,playerSide:'p1',replay:false});
  assert.ok(controller); assert.equal(importantBattle.update(arena,result,{playerSide:'p1'}),'victory');
  assert.equal(controller.node.dataset.beat,'victory'); assert.equal(controller.node.children[1].children[1].textContent,'本场胜利');
  controller.stop(); assert.equal(arena.children.length,0); assert.equal(windowPagehide,undefined,'controller removal also releases its pagehide listener');
});

test('restoring an intro already shown builds the controller without replaying it', () => {
  function runIntro(seen) {
    const session = new Map(seen ? [['kanto-battle-intro:resume-1','shown']] : []), entered = [], cards = [];
    const state = { cinematicBattleId:'', importantBattleId:'', presentation:{
      battle:{important:true,importantKind:'rival',opponent:'小茂',title:'劲敌对决',accent:'#4f85b8',duration:1280},
      trainers:[{id:'rival_early',name:'小茂',art:'assets/trainers/project-original/gary-v3.png'}],scene:{npcId:'rival_early'},
    } };
    const stage = new Node('arena');
    const context = {
      state, els:{stage},
      window:{sessionStorage:{getItem:key=>session.get(key)||null,setItem:(key,value)=>session.set(key,value)},KantoImportantBattle:{enter:(...args)=>{entered.push(args);return {skip(){},stop(){}};}}},
      localResourceUrl:value=>value,playerTrainerPresentation:()=>({side:'p1'}),stopImportantBattlePresentation(){state.importantBattleId='';},
      showCinematicCard:options=>cards.push(options),document:{},scheduleFxCleanup(){},
    };
    vm.runInNewContext(`${fn('showBattleEntrance')}\nglobalThis.run=showBattleEntrance;`, context);
    const snapshot = {id:'resume-1',sides:[],ended:false}; context.run(snapshot); context.run(snapshot);
    return {entered,cards,session,state};
  }
  const restored = runIntro(true);
  assert.equal(restored.entered.length,1); assert.equal(restored.entered[0][2].replay,false); assert.equal(restored.entered[0][2].snapshot.id,'resume-1');
  assert.equal(restored.cards.length,0); assert.equal(restored.state.importantBattleId,'resume-1');
  const fresh = runIntro(false);
  assert.equal(fresh.entered.length,1); assert.equal(fresh.entered[0][2].replay,true); assert.equal(fresh.session.get('kanto-battle-intro:resume-1'),'shown');
  assert.equal(fresh.cards.length,0);
});

test('only shiny Pokémon in real switch snapshots get particle containers, and entry cleanup is bounded', () => {
  const game = new KantoGame();
  const start = game.start({ mode:'practice', seed:[1,2,3,4], team:[
    {id:25,uid:'pika',moves:['thunderbolt']}, {id:150,uid:'shiny-mewtwo',moves:['psychic'],shiny:true},
  ], opponent:[{id:129,uid:'magikarp',moves:['splash']}] });
  const switched = game.act({ battleId:start.id, choice:'switch 2' });
  const stage = new Node('arena',{left:0,top:0,width:800,height:400}), player = new Node('img',{left:160,top:190,width:180,height:150}), foe = new Node('img',{left:520,top:90,width:160,height:150});
  const calls = [], timers = new Map(); let timerId = 0, stopped = 0;
  const state = {reducedEffects:false,fastForward:false,animationSpeed:1,battle:start,shinyEntryAnchors:new Map(),shinyEntrySeen:new Set(),species:[]};
  const context = {
    state,els:{stage,playerSprite:player,foeSprite:foe},
    document:{createElement:tag=>new Node(tag)},
    window:{KantoShinyFx:{playEntry:(root,options)=>{calls.push({root,options});root.appendChild(new Node('span'));return()=>{stopped++;};},stopEntry(){}}},
    setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
    actorSide:token=>/^p1/i.test(token)?'player':/^p2/i.test(token)?'foe':null,
    actorSlot:token=>{const match=String(token).match(/^p[12]([a-z])/i);return match?match[1].toLowerCase().charCodeAt(0)-97:0;},
    isShiny:mon=>mon?.shiny===true,safeNum:value=>Number(value)||0,
    activeMonAt:(side,slot)=>{const uid=side?.activeUIDs?.[slot];return (uid!==undefined?side?.team?.find(mon=>String(mon.uid)===String(uid)):null)||side?.team?.filter(mon=>mon.active)[slot]||null;},
    speciesByEnglish:name=>String(name).startsWith('Mewtwo')?{id:150}:String(name).startsWith('Pikachu')?{id:25}:null,
    cosmeticActorElement:(uid,side)=>side==='player'?player:foe,
  };
  vm.runInNewContext([fn('createShinyEntryAnchor'),fn('clearShinyEntry'),fn('playShinyEntry')].join('\n')+'\nglobalThis.run={playShinyEntry,clearShinyEntry};',context);
  assert.equal(context.run.playShinyEntry('p1a: Pikachu',start,'Pikachu, L50'),false,'non-shiny initial appearance has no burst');
  assert.equal(context.run.playShinyEntry('p1a: Mewtwo',switched,'Mewtwo, L50'),true,'the real switch to a shiny roster member creates the burst');
  assert.equal(calls.length,1); assert.equal(calls[0].root.tagName,'div'); assert.match(calls[0].root.className,/kanto-shiny-entry/);
  assert.equal(calls[0].options.uid,'shiny-mewtwo'); assert.equal(calls[0].options.side,'player');
  assert.equal(calls[0].root.children.some(node=>node.tagName==='img'),false,'stars are added below a positioned container, never an img void element');
  assert.equal(context.run.playShinyEntry('p1a: Mewtwo',switched,'Mewtwo, L50'),false,'re-reading one event snapshot does not replay the particles');
  const reduced = {...switched,seq:(switched.seq||0)+1}; state.reducedEffects=true;
  assert.equal(context.run.playShinyEntry('p1a: Mewtwo',reduced,'Mewtwo, L50'),false,'reduced effects suppress star particles');
  const anchor=calls[0].root;context.run.clearShinyEntry('player:0');assert.equal(anchor.removed,true);assert.equal(stopped,1);assert.equal(timers.size,0);
  assert.match(app,/playShinyEntry\(p\[2\],nextSnapshot,p\[3\]\)/,'sparkles are only requested in the protocol switch/drag branch');
});

test('setSprite avoids re-requesting a stable source and still walks through 404 fallbacks', () => {
  const classes = new Classes(); let src = '', writes = 0;
  const img = {hidden:false,style:{},dataset:{},classList:classes,alt:'',classList:classes,
    set src(value){src=value;writes++;},get src(){return src;}};
  const context={getParty:()=>[],state:{battleSpriteStyle:'animated'},window:{},animatedSpriteData:{pokemon:[{dex:25,animated:{front:'animated/front.gif',back:'animated/back.gif'}}]},assetHref:p=>p,assetUrl:(id,back)=>`${back?'back/':'front/'}${id}.png`,isShiny:mon=>mon?.shiny===true};
  vm.runInNewContext(`${fn('setSprite')}\nglobalThis.run=setSprite;`,context);
  const mon={id:25,name:'皮卡丘'};
  context.run(img,mon,true);assert.equal(img.src,'animated/back.gif');assert.equal(writes,1);
  context.run(img,mon,true);assert.equal(writes,1,'rerendering the same sprite leaves its source untouched');
  img.onerror();assert.equal(img.src,'back/25.png');assert.equal(writes,2);
  context.run(img,mon,true);assert.equal(img.src,'back/25.png');assert.equal(writes,2,'a successful back fallback is not reset to the broken artwork');
  img.onerror();assert.equal(img.src,'front/25.png');assert.equal(writes,3,'a missing back sprite falls back to the front sprite');
  img.onerror();assert.equal(img.hidden,true);context.run(img,mon,true);assert.equal(img.hidden,true,'the same failed source stays hidden without a repeat request');assert.equal(writes,3);
});

test('user-supplied animation falls back to built-in animation and then pixel art', () => {
  const classes = new Classes();
  const img = {hidden:false,style:{},dataset:{},classList:classes,alt:'',src:''};
  const context={getParty:()=>[],state:{battleSpriteStyle:'animated'},window:{KantoStadiumSprites:{resolve:()=> 'blob:user-sprite'}},animatedSpriteData:{pokemon:[{dex:25,animated:{back:'animated/back.gif'}}]},assetHref:p=>p,assetUrl:(id,back)=>`${back?'back/':'front/'}${id}.png`,isShiny:()=>false};
  vm.runInNewContext(`${fn('setSprite')}\nglobalThis.run=setSprite;`,context);
  context.run(img,{id:25,name:'皮卡丘'},true);
  assert.equal(img.src,'blob:user-sprite');
  img.onerror();assert.equal(img.src,'animated/back.gif');
  img.onerror();assert.equal(img.src,'back/25.png');
  assert.equal(img.hidden,false);
});

test('HD normal and shiny backs prefer native-resolution WebP, retain custom priority and fall back once per source',()=>{
 const classes=new Classes(),img={hidden:false,style:{},dataset:{},classList:classes,src:''};
 const context={getParty:()=>[],state:{battleSpriteStyle:'animated'},window:{},animatedSpriteData:{pokemon:[{dex:4,animated:{back:'old.gif'},shiny:{back:'old-shiny.gif'},hd:{animated:{back:'hd.webp'},shiny:{back:'hd-shiny.webp'}}}]},assetHref:p=>p,assetUrl:()=> 'pixel.png',isShiny:mon=>mon.shiny===true};
 vm.runInNewContext(`${fn('setSprite')}\nglobalThis.run=setSprite;`,context);
 context.run(img,{id:4,name:'小火龙'},true);assert.equal(img.src,'hd.webp');img.onerror();assert.equal(img.src,'old.gif');context.run(img,{id:4,name:'小火龙'},true);assert.equal(img.src,'old.gif');img.onerror();assert.equal(img.src,'pixel.png');
 context.run(img,{id:4,name:'小火龙',shiny:true},true);assert.equal(img.src,'hd-shiny.webp');
 context.window.KantoStadiumSprites={resolve:()=> 'blob:custom'};context.run(img,{id:4,name:'小火龙',shiny:true},true);assert.equal(img.src,'blob:custom');img.onerror();assert.equal(img.src,'hd-shiny.webp');
 context.state.battleSpriteStyle='pixel';context.run(img,{id:4,name:'小火龙'},true);assert.equal(img.src,'pixel.png');
});

test('important battle lifecycle and reduced/pagehide cleanup are wired at app entry points', () => {
  assert.match(app,/KantoImportantBattle\.enter\(els\.stage,state\.presentation/);
  assert.match(app,/window\.KantoImportantBattle\.update\(els\.stage,snapshot/);
  assert.match(app,/window\.addEventListener\('pagehide', stopImportantBattlePresentation/);
  assert.match(app,/window\.addEventListener\('pagehide', clearShinyEntries/);
  assert.match(app,/function returnToStage\(\)[\s\S]*?clearShinyEntries\(\);stopImportantBattlePresentation\(\)/);
  assert.match(app,/if\(state\.reducedEffects\)\{clearCosmeticEffects\(\);clearShinyEntries\(\);\}/);
});

test('busy transitions refresh battle actions while hidden roster panels stay untouched',()=>{
 const seen=[],context={state:{world:{},battle:{id:'battle'},battleFocus:true,busy:true},els:{retry:{}},battleOverlay:true,renderTrainer(){},renderStarterPicker(){},renderRoundControls(){},renderHudTabs(){},renderEncounterSettings(){},renderActions(){seen.push(context.state.busy);}};
 vm.runInNewContext(fn('renderWorld')+';globalThis.render=renderWorld;',context);context.render();context.state.busy=false;context.render();assert.deepEqual(seen,[true,false],'start/action finally must re-enable actual move buttons without rebuilding party/map/quests');
});
