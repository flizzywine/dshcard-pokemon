'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
const fxRuntime={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/cosmetic-fx.js'),'utf8'),{window:fxRuntime});
function fn(name){
  const match=new RegExp(`function\\s+${name}\\s*\\(`).exec(source);assert.ok(match,`app contains ${name}`);
  const start=match.index,paren=source.indexOf('(',start);let parenDepth=0,quote='',escaped=false,close=-1;
  for(let i=paren;i<source.length;i++){const ch=source[i];if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote='';continue;}if(ch==='\''||ch==='"'||ch==='`'){quote=ch;continue;}if(ch==='(')parenDepth++;if(ch===')'&&--parenDepth===0){close=i;break;}}
  const open=source.indexOf('{',close);let depth=0;quote='';escaped=false;
  for(let i=open;i<source.length;i++){const ch=source[i];if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote='';continue;}if(ch==='\''||ch==='"'||ch==='`'){quote=ch;continue;}if(ch==='{')depth++;if(ch==='}'&&--depth===0)return source.slice(start,i+1);}
  throw Error(`unterminated ${name}`);
}
class Element{
  constructor(tag,rect={left:0,top:0,width:0,height:0}){this.tagName=tag;this.rect=rect;this.dataset={};this.style={};this.children=[];this.removed=false;this.className='';this.classes=new Set();this.classList={contains:name=>this.classes.has(name),add:name=>this.classes.add(name)};}
  getBoundingClientRect(){return this.rect;}
  appendChild(node){node.parent=this;this.children.push(node);return node;}
  remove(){this.removed=true;if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
  querySelectorAll(selector){if(selector!=='.double-active-card')return[];return this.children.filter(child=>child.className==='double-active-card');}
  querySelector(selector){if(selector==='.double-active-sprite')return this.sprite||null;return null;}
}
function setup({double=false}={}){
  const stage=new Element('arena',{left:100,top:50,width:800,height:400});if(double)stage.classes.add('is-doubles');
  const player=new Element('img',{left:260,top:190,width:220,height:200}),foe=new Element('img',{left:590,top:80,width:160,height:180});
  const actives=new Element('div'),card=new Element('article');card.className='double-active-card';card.dataset.uid='double-pika';card.dataset.side='player';card.dataset.slot='1';card.sprite=new Element('img',{left:480,top:190,width:82,height:74});actives.children.push(card);
  const state={reducedEffects:false,battle:{doubleBattle:double},cosmeticAuras:new Map(),cosmeticAnchors:new Map()};let playedTarget=null,stopCount=0;
  const context={state,els:{stage,playerSprite:player,foeSprite:foe,doubleActives:actives},document:{createElement:tag=>new Element(tag)},window:{globalKantoCosmetics:{playMove:(target,_effect)=>{playedTarget=target;return()=>{stopCount++;};},playEntry:(target,_effect,options)=>{playedTarget=target;state.loopOption=options.loop;return()=>{stopCount++;};}}},cosmeticItem:()=>({effect:{geometry:'orbit'}}),spriteFor:side=>side==='player'?player:foe};
  context.window.globalKantoCosmetics.anchorBounds=fxRuntime.globalKantoCosmetics.anchorBounds;
  vm.runInNewContext([fn('cosmeticActorElement'),fn('createCosmeticAnchor'),fn('clearCosmeticKey'),fn('playCosmetic')].join('\n')+'\nglobalThis.run=playCosmetic;globalThis.anchor=createCosmeticAnchor;globalThis.clear=clearCosmeticKey;',context);
  return {context,state,stage,player,foe,card,get playedTarget(){return playedTarget;},get stopCount(){return stopCount;}};
}

test('single battle cosmetic canvas is centered on the matching UID sprite and cleaned on slot exit',()=>{
  const h=setup();h.context.run('playMove','pikachu-uid','move','move:player:0');
  const anchor=h.state.cosmeticAnchors.get('move:player:0');assert.ok(anchor);assert.equal(h.playedTarget,anchor);
  assert.equal(anchor.dataset.uid,'pikachu-uid');assert.equal(anchor.dataset.side,'player');assert.equal(anchor.dataset.slot,'0');
  assert.equal(anchor.style.left,'20.6875%');assert.equal(anchor.style.top,'46%');
  h.context.clear('move:player:0');assert.equal(anchor.removed,true);assert.equal(h.stopCount,1);assert.equal(h.state.cosmeticAnchors.size,0);
});

test('a companion can opt out of legacy global cosmetics and saved parameters reach the renderer',()=>{
 const item={id:'test-aura',slot:'aura',effect:{scale:1.1,speed:1}},context={window:fxRuntime,getParty:()=>[{uid:'starter'}],state:{cosmetics:{catalog:[item],equipped:{全局:{aura:item.id},伙伴:{starter:{aura:''}}},parameters:{}}}};
 vm.runInNewContext(fn('cosmeticItem')+'\nglobalThis.pick=cosmeticItem;',context);assert.equal(context.pick('starter','aura'),null);assert.equal(context.pick('pc','aura'),null);context.state.cosmetics.equipped.伙伴.starter.aura=item.id;context.state.cosmetics.parameters.starter={aura:{id:item.id,scale:1.5,speed:1.2,particleCount:40,seed:7,opacity:.3,layer:'front'}};const resolved=context.pick('starter','aura');assert.equal(resolved.effect.opacity,.3);assert.equal(resolved.effect.layer,'front');assert.equal(resolved.effect.scale,1.5);assert.equal(item.effect.scale,1.1);
});

test('double battle resolves each actor by UID, side and active slot to its own sprite rect',()=>{
  const h=setup({double:true});h.context.run('playEntry','double-pika','aura','player:1:aura');
  const anchor=h.state.cosmeticAnchors.get('player:1:aura');assert.ok(anchor);assert.equal(h.playedTarget,anchor);
  assert.equal(anchor.dataset.uid,'double-pika');assert.equal(anchor.dataset.side,'player');assert.equal(anchor.dataset.slot,'1');
  assert.ok(parseFloat(anchor.style.left)>40&&parseFloat(anchor.style.left)<60);assert.ok(parseFloat(anchor.style.top)>30&&parseFloat(anchor.style.top)<45);
  assert.equal(h.state.loopOption,true,'aura requests a persistent renderer loop');
  h.card.dataset.uid='outgoing-pika';h.context.run('playEntry','arriving-pika','entry','player:1');
  const arriving=h.state.cosmeticAnchors.get('player:1');assert.equal(arriving.dataset.uid,'arriving-pika');assert.equal(arriving.style.left,anchor.style.left,'a switch event can use the known slot location before the HUD UID rerenders');
});

test('anchor positions are distinct and winner cue code targets the winner side only',()=>{
  const h=setup({double:true});h.context.run('playMove','double-pika','move','move:player:1');const first=h.state.cosmeticAnchors.get('move:player:1');
  const other=new Element('article');other.className='double-active-card';other.dataset.uid='foe-uid';other.dataset.side='foe';other.dataset.slot='0';other.sprite=new Element('img',{left:650,top:70,width:76,height:68});h.context.els.doubleActives.children.push(other);
  h.context.run('playMove','foe-uid','move','move:foe:0');const second=h.state.cosmeticAnchors.get('move:foe:0');
  assert.notEqual(first.style.left,second.style.left);assert.equal(second.dataset.uid,'foe-uid');
  const calls=[],cleared=[],context={clearCosmeticKey:key=>cleared.push(key),activeMonAt:(side,slot)=>side?.team?.[slot]||null,playCosmetic:(...args)=>calls.push(args)};
  vm.runInNewContext(`${fn('winnerSideIndex')}\n${fn('playCosmeticOutcome')}\nglobalThis.outcome=playCosmeticOutcome;`,context);
  context.outcome({winner:'p1',sides:[{team:[{uid:'player-a'},{uid:'player-b'}]},{team:[{uid:'foe-a'},{uid:'foe-b'}]}]});
  assert.deepEqual(calls.map(row=>row.slice(1)),[['player-a','outcome','outcome:player:0'],['player-b','outcome','outcome:player:1']]);
  assert.ok(cleared.includes('foe:0:aura'),'battle end clears persistent auras on both sides');
  calls.length=0;context.outcome({winner:'tie',sides:[{team:[{uid:'player-a'}]},{team:[{uid:'foe-a'}]}]});assert.deepEqual(calls,[],'a tie plays no winner effect');
  assert.match(source,/window\.addEventListener\('pagehide', clearCosmeticEffects/,'page unload releases loop effects');
});

test('a replacement UID clears the old persistent aura and anchors a new one for its active slot',()=>{
  const cleared=[],played=[],state={cosmeticBattleId:'battle-1',cosmeticAuras:new Map(),cosmeticAnchors:new Map(),activeCosmeticUids:new Map([['player:0','lead'],['player:1','old-uid']]),reducedEffects:false};
  const context={state,clearCosmeticKey:key=>cleared.push(key),clearCosmeticEffects(){},cosmeticUidForActor:(token,snapshot)=>snapshot.sides[token.startsWith('p1')?0:1].activeUIDs[context.actorSlot(token)],playCosmetic:(...args)=>played.push(args),actorSlot:token=>token==='p1b'?1:0,actorSide:token=>token.startsWith('p1')?'player':'foe'};
  vm.runInNewContext(`${fn('syncCosmeticBattle')}\nglobalThis.sync=syncCosmeticBattle;`,context);
  context.sync({id:'battle-1',ended:false,sides:[{activeUIDs:['lead','new-uid']},{activeUIDs:[]}]});
  assert.deepEqual(cleared,['player:1','player:1:aura','move:player:1']);
  assert.deepEqual(played,[['playEntry','new-uid','aura','player:1:aura']]);
  assert.equal(state.activeCosmeticUids.get('player:1'),'new-uid');
});


test('workshop parameters survive a save and resolve identically for battle',()=>{
 const mvu=require('../mvu.cjs'),cosmetics=require('../cosmetics.cjs');
 const world=mvu.createInitialMvu().stat_data.宝可梦;
 world.战斗.状态='finished'; world.遭遇=null;
 const item=cosmetics.definitions().find(row=>!row.retired&&row.effect.scale!==1&&row.effect.speed!==1);
 world.外观.已拥有.push(item.id);
 const params={scale:1.4,speed:1.3,particleCount:30,seed:42,opacity:.5,layer:'front'};
 const preview=fxRuntime.globalKantoCosmetics.resolveEffect(item.effect,params);
 const saved=JSON.parse(JSON.stringify(cosmetics.apply(world,'configure',{uid:'starter',id:item.id,slot:item.slot,parameters:params})));
 const view=cosmetics.view(saved),context={window:fxRuntime,getParty:()=>saved.队伍,state:{cosmetics:view}};
 vm.runInNewContext(fn('cosmeticItem')+'\nglobalThis.pick=cosmeticItem;',context);
 const battle=context.pick('starter',item.slot).effect;
 for(const key of ['scale','speed','particleCount','seed','opacity','layer'])assert.equal(battle[key],preview[key],key);
 assert.equal(battle.scale,1.4);assert.equal(battle.speed,1.3);
 const legacy=fxRuntime.globalKantoCosmetics.resolveEffect(item.effect,null);
 assert.equal(legacy.scale,Math.max(.8,Math.min(1.8,item.effect.scale)));
 assert.match(source,/toast\(action==='cosmetic-configure'\?'特效设置已保存并装备。'/);
});
