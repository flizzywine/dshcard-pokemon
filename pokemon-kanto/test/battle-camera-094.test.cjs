const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../public/battle-camera.js'),'utf8');
function fixture(){
 const listeners=new Map(),animations=[];let document;
 class Node {
  constructor(name,movable=false){this.name=name;this.movable=movable;this.children=[];this.classList={add(){},remove(){}};this.ownerDocument=document;}
  matches(){return this.movable;} get nextSibling(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1]||null;}
  appendChild(node){node.remove();this.children.push(node);node.parentNode=this;return node;}
  prepend(node){node.remove();this.children.unshift(node);node.parentNode=this;}
  insertBefore(node,next){node.remove();const i=this.children.indexOf(next);this.children.splice(i<0?this.children.length:i,0,node);node.parentNode=this;}
  remove(){if(this.parentNode){const i=this.parentNode.children.indexOf(this);this.parentNode.children.splice(i,1);this.parentNode=null;}}
  animate(frames,options){const a={node:this,frames,options,cancelled:false,cancel(){this.cancelled=true;}};animations.push(a);return a;}
 }
 document={hidden:false,createElement:name=>new Node(name),addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)};
 const window={document,addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)};
 vm.runInNewContext(source,{window});const stage=new Node('arena'),background=new Node('background',true),hp=new Node('hp'),sprite=new Node('sprite',true),fx=new Node('fx',true),dialogue=new Node('dialogue');
 for(const node of [background,hp,sprite,fx,dialogue])stage.appendChild(node);
 return {window,document,stage,hp,sprite,fx,animations,listeners};
}
test('camera moves scene and FX together while HP and input remain fixed, with at most two live animations',()=>{
 const f=fixture(),order=[...f.stage.children],camera=f.window.KantoBattleCamera.attach(f.stage,{speed:2});
 assert.equal(f.hp.parentNode,f.stage);assert.equal(f.sprite.parentNode,camera.world);assert.equal(f.fx.parentNode,camera.world);
 camera.entry();camera.attack('player','foe',{power:100});camera.impact('foe',{critical:true});camera.attack('foe','player',{power:40});
 assert.ok(f.animations.filter(a=>!a.cancelled).length<=2);assert.equal(f.animations.at(-1).options.duration,340);assert.equal(f.hp.parentNode,f.stage);
 camera.stop();assert.deepEqual(f.stage.children,order);assert.equal(f.animations.every(a=>a.cancelled),true);assert.equal(f.listeners.size,0);
});
test('reduced effects, hidden page, speed changes and repeated mounts release finite camera work',()=>{
 const f=fixture(),camera=f.window.KantoBattleCamera.attach(f.stage,{reduced:true});camera.attack('player','foe');assert.equal(f.animations.length,0);
 assert.equal(f.window.KantoBattleCamera.attach(f.stage,{speed:4}),camera);camera.entry();assert.equal(f.animations.at(-1).options.duration,175);
 f.document.hidden=true;f.listeners.get('visibilitychange')();assert.ok(f.animations.at(-1).cancelled);camera.attack('player','foe');assert.equal(f.animations.length,1);
 f.document.hidden=false;camera.finish();f.listeners.get('pagehide')();assert.ok(f.animations.every(a=>a.cancelled));assert.equal(f.listeners.size,0);
});
