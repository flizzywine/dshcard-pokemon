'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

class MockNode{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.width=240;this.height=120;this.parent=null;this.removed=false;this.style={};this.dataset={};this.attrs={};this.calls=[];this.ctx=new Proxy({}, {get:(_t,key)=>()=>this.calls.push(String(key)),set:()=>true});}
  appendChild(node){this.children.push(node);node.parent=this;return node;}
  remove(){this.removed=true;if(this.parent)this.parent.children=this.parent.children.filter(item=>item!==this);}
  setAttribute(k,v){this.attrs[k]=v;}
  getBoundingClientRect(){return {width:this.width,height:this.height};}
  getContext(){return this.ctx;}
}
function harness(reduced=false){
  const callbacks=new Map(),timeouts=new Map(),listeners={};let id=0;
  const document={hidden:false,createElement:tag=>new MockNode(tag),addEventListener:(name,fn)=>listeners[name]=fn};
  const window={document,devicePixelRatio:1,matchMedia:()=>({matches:reduced}),requestAnimationFrame:fn=>{callbacks.set(++id,fn);return id;},cancelAnimationFrame:key=>callbacks.delete(key),setTimeout:fn=>{timeouts.set(++id,fn);return id;},clearTimeout:key=>timeouts.delete(key)};
  window.window=window;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/cosmetic-fx.js'),'utf8'),window);
  return {window,callbacks,timeouts,listeners,frame(t){const entry=callbacks.entries().next().value;if(!entry)return false;callbacks.delete(entry[0]);entry[1](t);return true;}};
}

test('all visual profiles share one RAF, draw bounded organic particles and honor the visibility pause',()=>{
  const h=harness(),fx=h.window.globalKantoCosmetics,a=new MockNode('div'),b=new MockNode('div');
  const stopA=fx.playEntry(a,{seed:11,colors:['#ff9a50'],particleCount:10000},{loop:true});
  const stopB=fx.playMove(b,{seed:12,colors:['#60d6ef'],particleCount:10000});
  assert.equal(h.callbacks.size,1,'two simultaneous effects schedule one shared frame');
  h.frame(1000);assert.equal(h.callbacks.size,1,'one scheduler requests the next frame');
  const canvas=a.children[0].children[0];assert.ok(canvas.calls.filter(call=>call==='ellipse').length<=24,'canvas keeps its ground glow and particles tightly bounded');
  h.window.document.hidden=true;h.listeners.visibilitychange();assert.equal(h.callbacks.size,0,'hidden tabs cancel the shared RAF');
  h.window.document.hidden=false;h.listeners.visibilitychange();assert.equal(h.callbacks.size,1,'visible tabs resume the shared scheduler');
  h.frame(5000);assert.equal(b.children.length,1,'hidden time does not consume a temporary effect duration');
  stopA();stopB();assert.equal(h.callbacks.size,0);assert.equal(a.children.length+b.children.length,0);
});

test('the effect pool caps active overlays and reduced-motion renders a static, disposable aura',()=>{
  const h=harness(true),fx=h.window.globalKantoCosmetics,host=new MockNode('div'),stops=[];
  for(let i=0;i<10;i++)stops.push(fx.playMove(host,{seed:i+1,particleCount:30}));
  assert.equal(host.children.length,8,'active effects are capped at eight');
  assert.equal(h.timeouts.size,8,'static reduced-motion effects have one cleanup timer each');
  fx.stopAll();assert.equal(host.children.length,0);assert.equal(h.timeouts.size,0);
  stops.forEach(stop=>stop());
});

test('eight stable themes use different particle silhouettes and honor family, ID, geometry and palette hints',()=>{
  const {window}=harness(true),fx=window.globalKantoCosmetics;
  assert.deepEqual(Array.from(fx.themes),['fire','water','leaf','electric','ice','ghost','starlight','dust']);
  assert.equal(fx.themeFor({family:'water',geometry:'crown',seed:1}),'water','explicit family takes priority');
  assert.equal(fx.themeFor({id:'ghost-spark',geometry:'orbit'}),'ghost','semantic ID takes priority over geometry');
  assert.equal(fx.themeFor({geometry:'petal-vortex'}),'leaf');
  assert.equal(fx.themeFor({colors:['#4deaff'],seed:99}),'water','palette hue identifies a stable family');
  assert.equal(fx.themeFor({geometry:'ground-rune'}),'dust');
  const signatures={};
  for(const theme of fx.themes){
    const canvas=new MockNode('canvas');fx.renderPreview(canvas,{family:theme,seed:4,colors:['#63dded','#e7fbff'],particleCount:40});
    signatures[theme]=canvas.calls.join(',');
    assert.ok(canvas.calls.length<500,`${theme} stays within a small canvas command budget`);
    assert.ok(canvas.calls.includes('ellipse'),'${theme} stays grounded near the stage floor');
  }
  assert.equal(new Set(Object.values(signatures)).size,8,'each semantic theme has a visibly distinct canvas drawing path');
  assert.ok(signatures.fire.includes('bezierCurveTo'),'fire uses a flickering tongue silhouette');
  assert.ok(signatures.water.includes('quadraticCurveTo'),'water uses droplets');
  assert.ok(signatures.electric.includes('lineTo'),'electric uses a broken bolt path');
  assert.ok(signatures.ghost.includes('arc'),'ghost uses a drifting wisp');
});

test('entry, move, aura and outcome previews have distinct stage choreography',()=>{
  const {window}=harness(true),fx=window.globalKantoCosmetics,effect={family:'fire',seed:23,particleCount:28,colors:['#ff744e','#ffe69d']};
  const render=style=>{const canvas=new MockNode('canvas');fx.renderPreview(canvas,effect,{style});return canvas.calls.join(',');};
  const entry=render('entry'),move=render('move'),aura=render('aura'),outcome=render('outcome');
  assert.equal(new Set([entry,move,aura,outcome]).size,4);
});

test('rare entry and victory cues use a two-beat charge and directional theme burst within the 24-particle cap',()=>{
  const {window}=harness(true),fx=window.globalKantoCosmetics,effect={family:'electric',rarity:'传说',prestige:true,variant:1,seed:44,particleCount:10000,colors:['#ffe65c','#fff9bd']};
  const render=(style,time)=>{const canvas=new MockNode('canvas');fx.renderPreview(canvas,effect,{style,time});return canvas.calls;};
  const charged=render('entry',0),burst=render('entry',.48),victory=render('outcome',.55),aura=render('aura',.48);
  assert.notDeepEqual(charged,burst,'the entry shifts from a compact charged symbol to a directional burst');
  assert.notDeepEqual(burst,victory,'victory has extra rings and star glints');
  assert.notDeepEqual(aura,burst,'persistent aura stays restrained');
  assert.ok(burst.length<1400,'maximum quality draw remains bounded');
  assert.ok(burst.filter(call=>call==='lineTo').length>0,'electric burst uses forked lightning paths');
});
