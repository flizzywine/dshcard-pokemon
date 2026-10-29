'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const cosmetics=require('../cosmetics.cjs');

class NodeMock{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.attrs={};this.dataset={};this.removed=false;this.width=260;this.height=110;this.calls=[];this.commandLog=[];this.propertyLog=[];this.classList={add:()=>{}};this.ctx=new Proxy({}, {get:(_target,key)=> (...args)=>{this.calls.push(String(key));this.commandLog.push([String(key),...args.map(value=>typeof value==='number'?Number(value.toFixed(3)):String(value))]);},set:(_target,key,value)=>{this.propertyLog.push(['set:'+String(key),typeof value==='number'?Number(value.toFixed(5)):String(value)]);return true;}});}
  appendChild(node){this.children.push(node);node.parent=this;return node;}
  append(...nodes){nodes.forEach(node=>this.appendChild(node));}
  remove(){this.removed=true;if(this.parent)this.parent.children=this.parent.children.filter(item=>item!==this);}
  replaceChildren(){this.children=[];}
  setAttribute(name,value){this.attrs[name]=value;}
  addEventListener(_type,handler){this.handler=handler;}
  getBoundingClientRect(){return {width:this.width,height:this.height};}
  getContext(){return this.ctx;}
}

function fxHarness({reduced=true,ImageClass,observers=false}={}){
  const callbacks=new Map(),timeouts=new Map(),nodes=[],documentListeners={};let token=0;
  const document={hidden:false,createElement:tag=>{const node=new NodeMock(tag);nodes.push(node);return node;},addEventListener:(type,handler)=>{documentListeners[type]=handler;}};
  const intersectionObservers=[],mutationObservers=[];if(observers)document.documentElement={};
  const ObserverClasses=observers?{IntersectionObserver:class{constructor(callback){this.callback=callback;intersectionObservers.push(this)}observe(){this.callback([{isIntersecting:true}])}disconnect(){this.disconnected=true}},MutationObserver:class{constructor(callback){this.callback=callback;mutationObservers.push(this)}observe(){}disconnect(){this.disconnected=true}}}:{};
  const window={document,devicePixelRatio:1,...(ImageClass?{Image:ImageClass}:{}),...ObserverClasses,matchMedia:()=>({matches:reduced}),requestAnimationFrame:fn=>{const id=++token;callbacks.set(id,fn);return id;},cancelAnimationFrame:id=>callbacks.delete(id),setTimeout:fn=>{const id=++token;timeouts.set(id,fn);return id;},clearTimeout:id=>timeouts.delete(id),ResizeObserver:class{observe(){}disconnect(){}}};
  window.window=window;window.globalThis=window;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/cosmetic-fx.js'),'utf8'),window);
  return {window,nodes,flushOne(){const [id,fn]=callbacks.entries().next().value||[];if(fn){callbacks.delete(id);fn(1000+id);}},callbacks,timeouts,setHidden(value){document.hidden=value;documentListeners.visibilitychange?.();},setIntersection(value){intersectionObservers.forEach(observer=>observer.callback([{isIntersecting:value}]))},detach(){intersectionObservers.forEach(observer=>observer.callback([{isIntersecting:false}]));mutationObservers.forEach(observer=>observer.callback([]))},intersectionObservers,mutationObservers};
}

test('every catalog effect renders and can be played through the browser runtime',()=>{
  const {window,flushOne}=fxHarness(),fx=window.globalKantoCosmetics,all=cosmetics.definitions();
  assert.ok(all.length>=160);assert.ok(fx.geometries.length>=20);
  for(const item of all){
    const canvas=new NodeMock('canvas');fx.renderPreview(canvas,item.effect);assert.ok(canvas.calls.length>0,`${item.id} preview paints`);
    const host=new NodeMock('div'),stop=fx.playMove(host,item.effect);assert.equal(host.children.length,1,`${item.id} gets a stage overlay`);flushOne();stop();assert.equal(host.children.length,0,`${item.id} cleans its overlay`);
  }
  const host=new NodeMock('div');const stopEntry=fx.playEntry(host,all[0].effect),stopOutcome=fx.playOutcome(host,all[1].effect);assert.equal(host.children.length,2);fx.stopAll();stopEntry();stopOutcome();assert.equal(host.children.length,0);
});

test('active effect canvases have overscan without changing the logical effect scale',()=>{
 const {window}=fxHarness(),host=new NodeMock('div');window.globalKantoCosmetics.playEntry(host,{particleId:'paper-lantern',scale:1,cosmeticSlot:'aura'});const canvas=host.children[0].children[0];assert.equal(canvas.width,520);assert.equal(canvas.height,220);assert.equal(canvas.style.left,'-50%');assert.ok(canvas.commandLog.some(row=>row[0]==='setTransform'&&row[5]===130&&row[6]===55),'drawing origin moves into the padded canvas');window.globalKantoCosmetics.stopAll();
});

test('opacity and depth edits stay in the preview until Save forwards the companion configuration',async()=>{
 const {window,nodes}=fxHarness(),calls=[],w={训练家:{徽章:[]},队伍:[{uid:'starter',图鉴编号:4,昵称:'小火龙'}],电脑:[{uid:'pc1',图鉴编号:25,昵称:'皮卡丘'}]},state=cosmetics.view(w);state.catalog.forEach(item=>item.owned=true);window.globalKantoCosmetics.render(new NodeMock('section'),state,payload=>{calls.push(payload);return true;});
 const opacity=nodes.find(node=>node.attrs['aria-label']==='特效不透明度'),layer=nodes.find(node=>node.attrs['aria-label']==='特效显示位置'),save=nodes.find(node=>node.className==='kanto-cosmetic-save'),target=nodes.find(node=>node.className==='kanto-cosmetic-target');assert.equal(target.children.length,1);opacity.value='30';opacity.handler();layer.value='front';layer.handler();assert.equal(calls.length,0);await save.handler();assert.equal(calls[0].action,'configure');assert.equal(calls[0].uid,'starter');assert.equal(calls[0].parameters.opacity,.3);assert.equal(calls[0].parameters.layer,'front');
 const clear=nodes.find(node=>node.textContent==='全部卸下');clear.handler();assert.equal(calls[1].action,'clear');
});

test('legacy art references remain distinct while missing modular packs use animated procedural fallback',()=>{
 const loaded=[];class MissingArt{set src(value){loaded.push(value);this.onerror();}}
 const {window}=fxHarness({ImageClass:MissingArt});window.__KANTO_FX_ASSET_ROOT__='/fx/';const fx=window.globalKantoCosmetics,recipes=fx.textureManifest();
 assert.equal(new Set(recipes.map(row=>`${row.sheet}:${row.cell}`)).size,recipes.length);assert.ok(recipes.length>=63);
 for(const id of ['black-hole','fireworks','hell-misty','pumpkings-delight','kanto-friends']){const frames=[.2,1.1].map(time=>{const canvas=new NodeMock('canvas');fx.renderPreview(canvas,{particleId:id,seed:53},{time});return canvas.commandLog;});assert.ok(frames.every(frame=>frame.some(row=>row[0]==='fill'||row[0]==='stroke')),id+' fallback stays drawable');}
 assert.equal(loaded.filter(url=>url.endsWith('living-art.png')).length,1,'failed pack is requested only once');assert.ok(!loaded.some(url=>url.includes('normal-a')),'rejected complete scene art is not restored');
});

test('modular art animates every collectible from isolated atlas cells',()=>{
  const loaded=[];class LivingImage{constructor(){this.naturalWidth=1024;this.naturalHeight=1024;}set src(value){loaded.push(value);this.onload();}}
  const {window}=fxHarness({ImageClass:LivingImage});window.__KANTO_FX_ASSET_ROOT__='/fx/';const fx=window.globalKantoCosmetics;
  for(const item of cosmetics.definitions()){
    const frames=[.2,.8].map(time=>{const canvas=new NodeMock('canvas');fx.renderPreview(canvas,item.effect,{time,style:'entry'});return canvas.commandLog;});
    assert.notDeepEqual(frames[0],frames[1],`${item.effect.particleId} moves over time`);
    assert.ok(frames[0].some(row=>['black-hole','fireworks'].includes(item.effect.particleId)?['stroke','fill'].includes(row[0]):row[0]==='drawImage'),`${item.effect.particleId} uses modular art or its bespoke procedural scene`);
  }
  assert.equal(loaded.filter(url=>url.endsWith('living-art.png')).length,1,'modular atlas is cached');
});

test('dragon depth passes draw distinct articulated segments',()=>{
  class AtlasImage{constructor(){this.naturalWidth=1024;this.naturalHeight=1024;}set src(value){this.onload();}}
  const {window}=fxHarness({ImageClass:AtlasImage});window.__KANTO_FX_ASSET_ROOT__='/fx/';const fx=window.globalKantoCosmetics;
  const frames=['back','front'].map(depthPass=>{const canvas=new NodeMock('canvas');fx.renderPreview(canvas,{particleId:'red-dragon',depthPass,seed:4},{time:.8});return canvas.commandLog;});
  assert.ok(frames.every(frame=>frame.some(row=>row[0]==='drawImage')));assert.notDeepEqual(frames[0],frames[1]);
});

test('the gallery requests small accurate posters and live twelve-pose sheets have a bounded cache',()=>{
 const loaded=[];class ReadyImage{constructor(){this.naturalWidth=1448;this.naturalHeight=1086;}set src(url){loaded.push(url);this.onload();}}
 const {window}=fxHarness({ImageClass:ReadyImage});window.__KANTO_FX_ASSET_ROOT__='/fx/';const fx=window.globalKantoCosmetics,profiles=fx.hellProfiles();
 for(const profile of profiles){const canvas=new NodeMock('canvas');canvas.className='kanto-cosmetic-card-preview';fx.renderPreview(canvas,{particleId:profile.id,scale:1},{time:.8});}
 assert.equal(loaded.length,22);assert.equal(loaded.filter(url=>url.endsWith('-poster.png')).length,21,'only the eye needs its open atlas pose instead of a closed poster');
 for(const profile of profiles.slice(0,10)){fx.renderPreview(new NodeMock('canvas'),{particleId:profile.id,scale:1},{time:.8,style:'aura'});assert.ok(fx.hellTextureStatus().filter(row=>!row.poster).length<=6);}
 const total=loaded.length;fx.renderPreview(new NodeMock('canvas'),{particleId:profiles[9].id,scale:1},{time:1.1,style:'aura'});assert.equal(loaded.length,total,'replaying the active effect reuses its decoded sheet');
});

test('ordinary red dragon and hell dragon use distinct painted resources',()=>{
 const loaded=[];class ReadyImage{constructor(){this.naturalWidth=1448;this.naturalHeight=1086;}set src(url){loaded.push(url);this.onload();}}
 const {window}=fxHarness({ImageClass:ReadyImage}),fx=window.globalKantoCosmetics;window.__KANTO_FX_ASSET_ROOT__='/fx/';
 fx.renderPreview(new NodeMock('canvas'),{particleId:'red-dragon',seed:4},{time:.8,style:'aura'});
 assert.ok(loaded.some(url=>url.endsWith('living-art.png')));
 assert.ok(!loaded.some(url=>url.endsWith('dragon-cycle.png')));
 fx.renderPreview(new NodeMock('canvas'),{particleId:'hell-lance',seed:4},{time:.8,style:'aura'});
 assert.ok(loaded.some(url=>url.endsWith('dragon-cycle.png')));
});

test('Sabrina eye starts from the open source pose and its eyelid closes only during the blink',()=>{
 class ReadyImage{constructor(){this.naturalWidth=1448;this.naturalHeight=1086;}set src(_url){this.onload();}}
 const {window,nodes}=fxHarness({ImageClass:ReadyImage}),fx=window.globalKantoCosmetics;window.__KANTO_FX_ASSET_ROOT__='/fx/';
 const canvas=new NodeMock('canvas'),effect={particleId:'hell-sabrina',scale:1,speed:1};
 fx.renderPreview(canvas,effect,{time:.4,style:'aura'});
 const eye=nodes.find(node=>node.width===181&&node.height===105);
 assert.ok(eye,'eye is extracted as its own painted material');
 assert.ok(eye.commandLog.some(row=>row[0]==='drawImage'&&row[3]===25.34),'source crop uses row zero, the open pose');
 assert.ok(canvas.commandLog.some(row=>row[0]==='scale'&&row[1]===1&&row[2]===1));
 canvas.commandLog=[];
 fx.renderPreview(canvas,effect,{time:1.7,style:'aura'});
 assert.ok(canvas.commandLog.some(row=>row[0]==='scale'&&row[2]<.1),'independent eyelid visibly closes at its blink');
});

test('a failed texture pack keeps a drawable fallback without retrying an image every frame',()=>{
  let loads=0;class FailedImage{set src(value){loads++;this.onerror();}}
  const {window}=fxHarness({ImageClass:FailedImage});window.__KANTO_FX_ASSET_ROOT__='/missing/';const fx=window.globalKantoCosmetics,c=new NodeMock('canvas');
  for(let frame=0;frame<8;frame++)fx.renderPreview(c,{particleId:'hell-misty',seed:1},{time:frame/10});
  assert.equal(loads,3);assert.ok(c.calls.includes('fill')||c.calls.includes('stroke'));assert.equal(fx.textureStatus()[0].failed,true);
});

test('all material rigs move continuously inside a pose and reuse extracted material canvases',()=>{
 class ReadyImage{constructor(){this.naturalWidth=1536;this.naturalHeight=1024;}set src(_url){this.onload();}}
 const {window,nodes}=fxHarness({ImageClass:ReadyImage}),fx=window.globalKantoCosmetics;window.__KANTO_FX_ASSET_ROOT__='/fx/';
 assert.equal(fx.materialRigs().length,38);
 for(const rig of fx.materialRigs()){
  const canvas=new NodeMock('canvas'),effect={particleId:rig.id,scale:1,speed:1};
  fx.renderPreview(canvas,effect,{time:.4,style:'aura'});const created=nodes.length;nodes.forEach(n=>{n.commandLog=[];n.propertyLog=[];});canvas.commandLog=[];canvas.propertyLog=[];
  fx.renderPreview(canvas,effect,{time:.42,style:'aura'});const first=[canvas.commandLog,canvas.propertyLog,...nodes.flatMap(n=>[n.commandLog,n.propertyLog])];nodes.forEach(n=>{n.commandLog=[];n.propertyLog=[];});canvas.commandLog=[];canvas.propertyLog=[];
  fx.renderPreview(canvas,effect,{time:.46,style:'aura'});
  assert.notDeepEqual(first,[canvas.commandLog,canvas.propertyLog,...nodes.flatMap(n=>[n.commandLog,n.propertyLog])],rig.id+' moves between key poses');assert.equal(nodes.length,created,rig.id+' reuses its material cutouts');
  assert.ok(canvas.commandLog.length<1200,rig.id+' draw budget stays bounded');
 }
});

test('material release reaches transparent at every supported speed without affecting stable auras',()=>{
 class ReadyImage{constructor(){this.naturalWidth=1536;this.naturalHeight=1024;}set src(_url){this.onload();}}
 const {window}=fxHarness({ImageClass:ReadyImage}),fx=window.globalKantoCosmetics;window.__KANTO_FX_ASSET_ROOT__='/fx/';
 for(const speed of [.5,1,1.8])for(const style of ['entry','move','outcome']){
  const canvas=new NodeMock('canvas'),effect={particleId:'present',scale:1,speed};fx.renderPreview(canvas,effect,{time:1.55,style});
  assert.ok(!canvas.commandLog.some(row=>row[0]==='drawImage'),'no painted material survives the release');
  canvas.commandLog=[];fx.renderPreview(canvas,effect,{time:1.55,style:'aura'});assert.ok(canvas.commandLog.some(row=>row[0]==='drawImage'),'aura continues');
 }
});

test('hell material themes keep distinct motion and bounded fluid subdivision at phone and desktop sizes',()=>{
 class ReadyImage{constructor(){this.naturalWidth=1536;this.naturalHeight=1024;}set src(_url){this.onload();}}
 const {window}=fxHarness({ImageClass:ReadyImage}),fx=window.globalKantoCosmetics;window.__KANTO_FX_ASSET_ROOT__='/fx/';
 const signatures=[];
 for(const id of ['hell-brock','hell-misty','hell-bruno','hell-agatha','hell-champion']){
  const frame=new NodeMock('canvas');fx.renderPreview(frame,{particleId:id,seed:7},{time:.7,style:'aura'});
  signatures.push(JSON.stringify(frame.commandLog));
  assert.ok(frame.commandLog.filter(row=>row[0]==='drawImage').length<100,id+' has a bounded material draw budget');
 }
 assert.equal(new Set(signatures).size,signatures.length,'theme joints do not collapse to the same movement');
 for(const width of [320,960]){
  const frame=new NodeMock('canvas');frame.width=width;frame.height=width*.5625;
  fx.renderPreview(frame,{particleId:'hell-misty',seed:7},{time:.7,style:'aura'});
  assert.ok(frame.commandLog.filter(row=>row[0]==='drawImage').length<100,'water uses bounded travelling-wave strips');
  frame.commandLog=[];
  fx.renderPreview(frame,{particleId:'hell-misty',speed:.5},{time:1.55,style:'entry'});
  assert.equal(frame.commandLog.filter(row=>row[0]==='drawImage').length,0,'enhanced water still releases at half speed');
 }
});

test('particle work stays bounded under extreme catalog values and caps concurrent stage effects',()=>{
  const {window}=fxHarness(),fx=window.globalKantoCosmetics,canvas=new NodeMock('canvas');
  fx.renderPreview(canvas,{geometry:'orbiting-cubes',trajectory:{type:'ballistic',variant:3,spread:1.2,curvature:1.3},particleCount:1e9,layers:1e9,scale:100,speed:100,colors:['#fff']});
  assert.ok(canvas.calls.length<5000,`one frame stays under a predictable ${canvas.calls.length}-operation budget`);
  const host=new NodeMock('div'),stops=[];for(let i=0;i<10;i++)stops.push(fx.playMove(host,{geometry:'orbit',particleCount:8}));
  assert.equal(host.children.length,8,'the stage keeps at most eight active overlays');
  fx.stopAll();stops.forEach(stop=>stop());assert.equal(host.children.length,0,'all overlays clean up after stopping');
});

test('aura loops stay on one bounded canvas/RAF and stop cleanly on replacement or reduced motion',()=>{
  const {window,flushOne,callbacks,timeouts}=fxHarness({reduced:false}),fx=window.globalKantoCosmetics,host=new NodeMock('div'),effect={geometry:'orbit',particleCount:16};
  const stop=fx.playEntry(host,effect,{duration:1550,loop:true});assert.equal(host.children.length,1);
  for(let i=0;i<12;i++){flushOne();assert.equal(host.children.length,1,'loop reuses its overlay instead of growing nodes');assert.equal(callbacks.size,1,'loop schedules exactly one next frame');assert.equal(timeouts.size,0,'loop does not stack timeout callbacks');}
  stop();assert.equal(host.children.length,0);assert.equal(callbacks.size,0);assert.equal(timeouts.size,0);
  const battleHost=new NodeMock('div');fx.playEntry(battleHost,effect,{loop:true});assert.equal(callbacks.size,1);fx.stopAll();assert.equal(battleHost.children.length,0,'battle cleanup removes the long-lived aura');assert.equal(callbacks.size,0);
  const reduced=fxHarness({reduced:true}),reducedHost=new NodeMock('div');
  reduced.window.globalKantoCosmetics.playEntry(reducedHost,effect,{duration:1550,loop:true});reduced.flushOne();
  assert.equal(reducedHost.children.length,1,'reduced motion still paints one static aura frame');assert.equal(reduced.callbacks.size,0);assert.equal(reduced.timeouts.size,0,'persistent reduced-motion aura does not run a cleanup timer');
});

test('cosmetic slot metadata keeps battle entry one-shot while aura slot previews loop by default',()=>{
  const {window,callbacks}=fxHarness({reduced:false}),fx=window.globalKantoCosmetics,host=new NodeMock('div');
  const aura=fx.playEntry(host,{particleId:'shiny',cosmeticSlot:'aura'});assert.equal(callbacks.size,1);aura();
  const entry=fx.playEntry(host,{particleId:'bats',cosmeticSlot:'entry'});assert.equal(callbacks.size,1);entry();assert.equal(callbacks.size,0);
});

test('the eight-overlay budget evicts temporary effects before four persistent auras',()=>{
  const {window,callbacks}=fxHarness({reduced:false}),fx=window.globalKantoCosmetics,effect={geometry:'orbit',particleCount:12};
  const auras=Array.from({length:4},(_,index)=>{const host=new NodeMock('div');fx.playEntry(host,effect,{loop:true});return host;});
  const temporary=Array.from({length:4},()=>{const host=new NodeMock('div');fx.playMove(host,effect);return host;});
  assert.equal(callbacks.size,1);
  const fifthAura=new NodeMock('div');fx.playEntry(fifthAura,effect,{loop:true});assert.equal(fifthAura.children.length,0,'loop cap rejects an extra aura without displacing existing effects');
  const burst=new NodeMock('div');fx.playOutcome(burst,effect);
  assert.ok(auras.every(host=>host.children.length===1),'all persistent aura canvases stay alive at capacity');
  assert.equal(temporary[0].children.length,0,'the oldest temporary canvas is evicted first');
  assert.ok(temporary.slice(1).every(host=>host.children.length===1));assert.equal(burst.children.length,1);assert.equal(callbacks.size,1);
  fx.stopAll();assert.equal(callbacks.size,0);assert.ok([...auras,...temporary,burst].every(host=>host.children.length===0));
});

test('the collection shows one unowned representative per effect and keeps owned duplicates accessible',()=>{
  const {window}=fxHarness(),container=new NodeMock('section'),calls=[],state=cosmetics.view({训练家:{金钱:0,徽章:[]},队伍:[{uid:'p',图鉴编号:25,昵称:'皮卡丘'}]});
  window.globalKantoCosmetics.render(container,state,action=>calls.push(action));
  const grid=container.children.at(-1);assert.equal(grid.children.length,new Set(state.catalog.map(item=>item.effect.particleId||item.id)).size);const firstCard=grid.children[0],actions=firstCard.children.at(-1);
  actions.children[0].handler();assert.equal(calls.length,0,'preview runs in the local viewer without asking for a battle');
  assert.equal(firstCard.children[1].calls.length>0,true,'every card displays a free static effect preview');
  const duplicate=state.catalog.find((item,index)=>index>0&&state.catalog.slice(0,index).some(other=>other.effect.particleId===item.effect.particleId));duplicate.owned=true;window.globalKantoCosmetics.render(container,state,action=>calls.push(action));const ownedCard=container.children.at(-1).children.find(card=>card.children[0].textContent===duplicate.name&&card.children.at(-1).children.some(button=>button.textContent==='装备'));assert.ok(ownedCard,'an owned legacy duplicate remains available to equip');
});

test('viewer resolves creature sprites using the host asset-prefix convention',()=>{
  const {window,nodes}=fxHarness(),container=new NodeMock('section');
  window.__KANTO_ASSET_ROOT__='https://host.example/api/file?package=kanto&path=';
  window.globalKantoCosmetics.render(container,cosmetics.view({训练家:{金钱:0,徽章:[]},队伍:[]}));
  const stage=nodes.find(node=>node.className==='kanto-cosmetic-viewer-stage');
  assert.equal(stage.children[0].src,'https://host.example/api/file?package=kanto&path=assets/pokemon/back/4.png');
  const side=nodes.find(node=>node.attrs['aria-label']==='选择我方或对手站位');
  side.value='opponent';side.handler();
  assert.equal(stage.children[0].src,'https://host.example/api/file?package=kanto&path=assets/pokemon/4.png');
});

test('the preview starts with the selected shiny back animation and falls back to its back sprite',()=>{
 const {window,nodes}=fxHarness();window.__KANTO_ASSET_ROOT__='/media/';window.__KANTO_ANIMATED_ROOT__='/animations/';window.__KANTO_ANIMATED_SPRITES__={pokemon:[{dex:25,shiny:{back:'shiny-back25.gif',front:'shiny-front25.gif'}}]};
 window.globalKantoCosmetics.render(new NodeMock('section'),cosmetics.view({训练家:{徽章:[]},队伍:[{uid:'starter',图鉴编号:25,昵称:'皮卡丘',闪光:true}]}));
 const creature=nodes.find(node=>node.className==='kanto-cosmetic-viewer-creature');assert.equal(creature.src,'/animations/shiny-back25.gif');assert.equal(creature.alt,'我方宝可梦背面');creature.onerror();assert.equal(creature.src,'/media/assets/pokemon/shiny/back/25.png');
 const side=nodes.find(node=>node.attrs['aria-label']==='选择我方或对手站位');side.value='opponent';side.handler();assert.equal(creature.src,'/animations/shiny-front25.gif');assert.equal(creature.alt,'对手宝可梦正面');
});


test('each movement form emits a distinct drawing signature',()=>{
  const {window,nodes}=fxHarness(),fx=window.globalKantoCosmetics,signatures=new Map();
  assert.ok(fx.forms.length>=16);
  for(const form of fx.forms){nodes[0].commandLog=[];const canvas=new NodeMock('canvas');fx.renderPreview(canvas,{family:'water',form,geometry:form,seed:19,variant:2,colors:['#68d7ed','#f1ffff','#2d83c7'],particleCount:20},{time:.63,style:'move'});const source=nodes[0].commandLog.length?nodes[0]:canvas,signature=source.commandLog.map(row=>row.join(',')).join('|');assert.ok(signature.length>100,`${form} paints a distinct visual`);signatures.set(form,signature);}
  assert.equal(new Set(signatures.values()).size,fx.forms.length,'form command signatures must be unique');
});


test('all catalog entries explicitly route to authored semantic forms without changing legacy IDs',()=>{
  const all=cosmetics.definitions().filter(item=>item.id.startsWith('kfx-')),fx=fxHarness().window.globalKantoCosmetics;
  assert.equal(all.length,160);assert.ok(all.every(item=>fx.forms.includes(item.effect.form)));
  assert.equal(new Set(all.map(item=>item.effect.form)).size,fx.forms.length,'all authored forms are assigned in the actual catalog');
  assert.deepEqual(all.slice(0,100).map(item=>item.id),Array.from({length:100},(_,i)=>`kfx-${String(i+1).padStart(3,'0')}`));
});

test('showcase effects animate with visible frame changes',()=>{
  const {window,nodes}=fxHarness(),fx=window.globalKantoCosmetics;
  for(const form of ['shiny-burst','fireworks','black-hole','bat-swarm','graveyard','lotus-field']){
    const phases=[.08,.46,.88].map(time=>{nodes[0].commandLog=[];const canvas=new NodeMock('canvas');fx.renderPreview(canvas,{family:'ghost',form,geometry:form,seed:53,variant:1,particleCount:24,colors:['#b992ff','#f5e6ff','#521b88']},{time,style:'entry'});return (nodes[0].commandLog.length?nodes[0]:canvas).commandLog.map(row=>row.join(',')).join('|');});
    assert.equal(new Set(phases).size,3,`${form} must change its actual drawing stream across charge, emergence and burst timing`);
  }
});

test('signature scenes differ across variants and animate within a bounded budget',()=>{
  const {window}=fxHarness(),fx=window.globalKantoCosmetics;
  const ids=['black-hole','red-dragon','dark-crystal','shiny-dark-crystal','lotus-field','blood-lotus-field'];
  const signatures=ids.map(particleId=>{
    const frames=[.2,.8].map(time=>{const canvas=new NodeMock('canvas');fx.renderPreview(canvas,{particleId,seed:53,colors:['#b992ff','#f5e6ff','#521b88']},{time,style:'entry'});assert.ok(canvas.commandLog.length<1500,`${particleId} has bounded frame work`);return JSON.stringify(canvas.commandLog);});
    assert.notEqual(frames[0],frames[1],`${particleId} changes over time`);return frames[0];
  });
  assert.equal(new Set(signatures).size,ids.length,'each signature has its own geometry or motion');
});

test('boss rewards have distinct animated scenes with bounded rendering',()=>{
  const {window}=fxHarness(),fx=window.globalKantoCosmetics;
  const ids=['hell-brock','hell-giovanni','hell-misty','hell-lorelei','hell-lt-surge','hell-champion','hell-apollo','hell-rival'];
  const signatures=ids.map(particleId=>{
    const frames=[.2,.8].map(time=>{const canvas=new NodeMock('canvas');fx.renderPreview(canvas,{particleId,seed:53,colors:['#b992ff','#f5e6ff','#521b88']},{time,style:'entry'});assert.ok(canvas.commandLog.length<1500,`${particleId} stays within the frame budget`);return JSON.stringify(canvas.commandLog);});
    assert.notEqual(frames[0],frames[1],`${particleId} changes over time`);return frames[0];
  });
  assert.equal(new Set(signatures).size,ids.length,'boss scenes have distinct geometry');
});

test('rocket rewards use distinct shapes even with the same palette',()=>{
  const {window}=fxHarness(),fx=window.globalKantoCosmetics;
  const ids=['hell-apollo','hell-athena','hell-lance-rocket','hell-lambda','hell-rocket-viridian','hell-rocket-bridge','hell-rocket-celadon'];
  const signatures=ids.map(particleId=>{const canvas=new NodeMock('canvas');fx.renderPreview(canvas,{particleId,seed:53,colors:['#c74761','#ffd7ca','#42182e']},{time:.8,style:'entry'});return JSON.stringify(canvas.commandLog);});
  assert.equal(new Set(signatures).size,ids.length,'differences come from the paths and motion, not merely recolouring');
});

test('particle viewer is separate from battle playback and exposes selection, replay, pause and bounded parameters',()=>{
  const {window,callbacks,nodes,setHidden}=fxHarness({reduced:false}),container=new NodeMock('section'),state=cosmetics.view({训练家:{金钱:0,徽章:[]},队伍:[]});
  window.globalKantoCosmetics.render(container,state,()=>{});
  const viewer=container.children[1];assert.equal(viewer.className,'kanto-cosmetic-viewer');assert.equal(callbacks.size,1,'160 static cards add no RAF; only the single independent preview runs');
  const select=viewer.children[1],stage=viewer.children[2],controls=viewer.children[3],pause=controls.children.find(node=>node.className==='kanto-cosmetic-viewer-buttons').children[0],replay=controls.children.find(node=>node.className==='kanto-cosmetic-viewer-buttons').children[1];
  assert.equal(select.children.length,state.particleDirectory.length+state.catalog.filter(item=>item.id.startsWith('hell-')||item.id.startsWith('original-')).length);assert.equal(stage.children[1].children.length,1);assert.equal(state.particleDirectory.length,34);assert.ok(state.particleDirectory.every(item=>item.implemented&&!item.retired));
  pause.handler();assert.equal(callbacks.size,0);assert.equal(pause.textContent,'继续');pause.handler();assert.equal(callbacks.size,1);assert.equal(pause.textContent,'暂停');
  replay.handler();assert.equal(callbacks.size,1,'replay restarts the same independent preview renderer');
  setHidden(true);assert.equal(callbacks.size,0,'hidden browser tabs pause the viewer RAF');setHidden(false);assert.equal(callbacks.size,1,'the viewer resumes when its tab becomes visible');
  select.value='bats';select.handler();assert.equal(stage.children[1].children.length,1,'switching effects replaces the previous canvas');assert.equal(callbacks.size,1);
  container.__cosmeticPreviewStop();assert.equal(stage.children[1].children.length,0);assert.equal(callbacks.size,0);
  assert.ok(nodes.some(node=>node.commandLog.some(row=>row[0]==='bezierCurveTo'||row[0]==='ellipse')),'scenes use native-resolution illustrated shapes');
});

test('reward preview uses exact saved effect parameters and the selected companion',()=>{
 const {window,nodes}=fxHarness(),container=new NodeMock('section'),state=cosmetics.view({训练家:{金钱:0,徽章:[]},队伍:[{uid:'pikachu',图鉴编号:25,昵称:'皮卡丘',闪光:true}]});
 window.globalKantoCosmetics.render(container,state);
 const item=state.catalog.find(row=>row.id==='hell-brock'),grid=container.children.at(-1),card=grid.children.find(row=>row.children[0].textContent===item.name);
 card.children.at(-1).children[0].handler();
 const seed=nodes.find(node=>node.type==='number'),select=nodes.find(node=>node.attrs['aria-label']==='选择粒子预览'),stage=nodes.find(node=>node.className==='kanto-cosmetic-viewer-stage');
 assert.equal(select.value,item.effect.particleId);assert.equal(seed.value,String(item.effect.seed));assert.match(stage.children[0].src,/pokemon\/shiny\/back\/25\.png/);
});

test('pixel preview supports name filtering, both battle positions, looping and replay without extra animation loops',()=>{
  const {window,callbacks}=fxHarness({reduced:false}),container=new NodeMock('section'),state=cosmetics.view({训练家:{金钱:0,徽章:[]},队伍:[]});
  window.globalKantoCosmetics.render(container,state,()=>{});
  const viewer=container.children[1],search=viewer.children[0].children[2],select=viewer.children[1],stage=viewer.children[2],controls=viewer.children[3];
  const side=controls.children[4].children[1],loop=controls.children[5].children[0],buttons=controls.children[6];
  search.value='black hole';search.handler();assert.equal(select.children.length,1);assert.equal(select.value,'black-hole');assert.equal(stage.children[1].children.length,1);assert.equal(callbacks.size,1);
  side.value='opponent';side.handler();assert.equal(stage.children[1].children.length,1);assert.equal(callbacks.size,1,'switching sides replaces, rather than stacks, an animation');
  loop.checked=false;loop.handler();assert.equal(stage.children[1].children.length,1);assert.equal(callbacks.size,1,'single play keeps one RAF');
  buttons.children[1].handler();assert.equal(callbacks.size,1,'replaying retains one RAF');
  search.value='not an effect';search.handler();assert.equal(select.children.length,0);assert.equal(stage.children[1].children.length,0);assert.equal(callbacks.size,0,'an empty search cancels the previous animation');
  search.value='地狱';search.handler();assert.ok(select.children.length>1);const before=select.value;buttons.children[3].handler();assert.notEqual(select.value,before,'next selects another filtered effect');assert.equal(callbacks.size,1);
  const grid=container.children.at(-1);assert.ok(grid.children.every(card=>card.children[1].width===320&&card.children[1].height===180),'static thumbnails have a fixed resolution independent of device density');
  container.__cosmeticPreviewStop();assert.equal(callbacks.size,0);
});

test('the independent preview works while four battle auras are already active',()=>{
  const {window,callbacks}=fxHarness({reduced:false}),fx=window.globalKantoCosmetics,effect={particleId:'shiny',cosmeticSlot:'aura'},auras=[];
  for(let n=0;n<4;n++){const host=new NodeMock('div');auras.push({host,stop:fx.playEntry(host,effect,{loop:true})});}
  const rejected=fx.playEntry(new NodeMock('div'),effect,{loop:true});assert.doesNotThrow(()=>{rejected.pause();rejected.resume();rejected.restart();});
  const container=new NodeMock('section'),state=cosmetics.view({训练家:{金钱:0,徽章:[]},队伍:[]});fx.render(container,state,()=>{});
  const stage=container.children[1].children[2];assert.equal(stage.children[1].children.length,1,'preview has its own allowance instead of being blocked by four auras');assert.equal(callbacks.size,1,'all five animated effects still share one scheduler');
  container.__cosmeticPreviewStop();auras.forEach(({host,stop})=>{stop();assert.equal(host.children.length,0);});assert.equal(callbacks.size,0);
});

test('offscreen viewer pauses and detached panel cancels the preview and observers',()=>{
  const {window,callbacks,setIntersection,detach,intersectionObservers,mutationObservers}=fxHarness({reduced:false,observers:true}),container=new NodeMock('section'),state=cosmetics.view({训练家:{金钱:0,徽章:[]},队伍:[]});container.isConnected=true;
  window.globalKantoCosmetics.render(container,state,()=>{});assert.equal(callbacks.size,1);setIntersection(false);assert.equal(callbacks.size,0);setIntersection(true);assert.equal(callbacks.size,1);
  container.isConnected=false;detach();assert.equal(callbacks.size,0);assert.equal(container.children[1].children[2].children[1].children.length,0,'detaching cleans the live canvas');assert.ok(intersectionObservers.every(observer=>observer.disconnected));assert.ok(mutationObservers.every(observer=>observer.disconnected));
});

test('all forty reference entries render distinct bounded scenes',()=>{
  const {window,nodes}=fxHarness(),fx=window.globalKantoCosmetics,entries=cosmetics.particleDirectory(),catalog=cosmetics.definitions();
  assert.equal(entries.length,41);assert.ok(entries.every(entry=>entry.implemented));assert.equal(new Set(catalog.filter(item=>item.id.startsWith('kfx-')).map(item=>item.effect.particleId)).size,41);
  const signatures=[];
  for(const entry of entries){const item=catalog.find(row=>row.effect.particleId===entry.key);assert.ok(item,`${entry.name} has a catalog item`);nodes[0].commandLog=[];const canvas=new NodeMock('canvas');fx.renderPreview(canvas,item.effect,{time:.73,style:'entry'});const commands=(nodes[0].commandLog.length?nodes[0]:canvas).commandLog;assert.ok(commands.some(row=>row[0]==='fillRect'||row[0]==='fill'||row[0]==='stroke'),`${entry.name} paints visible geometry`);assert.ok(commands.length<5000,`${entry.name} stays within the per-frame drawing budget`);signatures.push([entry.key,commands.map(row=>row.join(',')).join('|')]);}
  const duplicateRecipes=signatures.filter(([,signature],index)=>signatures.findIndex(([,other])=>other===signature)!==index).map(([key])=>key);
  assert.equal(new Set(signatures.map(([,signature])=>signature)).size,41,`each catalogued effect has its own sprite/action recipe; duplicate drawing commands: ${duplicateRecipes.join(',')}`);
  const legacy=catalog.filter(item=>!item.effect.particleId);assert.equal(legacy.length,0,'old package entries resolve to pixel effects by particleId');
});

test('explicit particle IDs override legacy geometry and reference fidelity is reported honestly',()=>{
  const {window,nodes}=fxHarness(),fx=window.globalKantoCosmetics,entries=cosmetics.particleDirectory(),catalog=cosmetics.definitions();
  assert.ok(entries.every(entry=>entry.implemented&&entry.referenceVerified===false),'implemented interpretations do not claim an unobserved original');
  for(const entry of entries){const item=catalog.find(row=>row.effect.particleId===entry.key);nodes[0].commandLog=[];fx.renderPreview(new NodeMock('canvas'),item.effect,{time:.62,style:'entry'});const original=JSON.stringify(nodes[0].commandLog);nodes[0].commandLog=[];fx.renderPreview(new NodeMock('canvas'),{...item.effect,form:'shiny-burst'},{time:.62,style:'entry'});assert.equal(JSON.stringify(nodes[0].commandLog),original,`${entry.key} keeps its own drawing even with stale legacy metadata`);}
});

test('Kanto trio can draw synchronously with path fallback before optional PNG assets load',()=>{
  const {window}=fxHarness(),fx=window.globalKantoCosmetics,canvas=new NodeMock('canvas');fx.renderPreview(canvas,{family:'starlight',form:'kanto-trio',seed:2,colors:['#7de8ff','#fff3c0']},{time:.3,style:'entry'});assert.ok(canvas.commandLog.length>0);assert.equal(fx.trioAssets.size,0,'missing Image API uses vectors immediately without delaying a battle frame');
});


test('Kanto trio assets load asynchronously into a three-image cache and retain a path fallback',()=>{
  const created=[];class FakeImage{constructor(){this.complete=false;this.naturalWidth=0;created.push(this)}set src(value){this.url=value}}
  const {window}=fxHarness({ImageClass:FakeImage}),fx=window.globalKantoCosmetics,canvas=new NodeMock('canvas'),effect={form:'kanto-trio',family:'starlight',colors:['#7de8ff','#fff3c0']};
  fx.renderPreview(canvas,effect,{time:.25,style:'entry'});assert.equal(created.length,3);assert.equal(new Set(created.map(image=>image.url)).size,3);assert.ok(created.every(image=>image.url.includes('assets/pokemon/')));assert.ok(canvas.commandLog.some(row=>row[0]==='ellipse'),'vector fallback paints immediately while the images are pending');
  created.forEach(image=>{image.complete=true;image.naturalWidth=64;image.onload()});const loaded=new NodeMock('canvas');fx.renderPreview(loaded,effect,{time:.55,style:'entry'});assert.equal(created.length,3,'the image cache is reused');assert.equal(loaded.commandLog.filter(row=>row[0]==='drawImage').length,3,'loaded sprites paint once each');
});
