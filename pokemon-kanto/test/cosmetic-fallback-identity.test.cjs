'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('missing artwork keeps ember petals and butterflies distinct, animated and finite',()=>{
 const commands=[];
 const ctx=new Proxy({}, {get:(_target,key)=>(...args)=>commands.push([String(key),...args]),set:()=>true});
 const canvas=()=>({tagName:'CANVAS',width:320,height:180,style:{},dataset:{},getContext:()=>ctx,getBoundingClientRect:()=>({width:320,height:180}),setAttribute(){}});
 class MissingImage{set src(_value){this.onerror?.();}}
 const window={document:{createElement:canvas,addEventListener(){}},Image:MissingImage,__KANTO_FX_ASSET_ROOT__:'/missing/',matchMedia:()=>({matches:true})};window.window=window;
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/cosmetic-fx.js'),'utf8'),window);
 const fx=window.globalKantoCosmetics;
 const frame=(id,time)=>{commands.length=0;fx.renderPreview(canvas(),{particleId:id,seed:3,scale:1},{time,style:'aura'});return commands.map(row=>[...row]);};
 const petals=frame('pumpkids-treat',.4),butterflies=frame('anniversary-cake',.4);
 assert.ok(petals.some(row=>row[0]==='bezierCurveTo'));
 assert.ok(butterflies.some(row=>row[0]==='bezierCurveTo'));
 assert.ok(petals.some(row=>row[0]==='quadraticCurveTo'),'petals have rising ember trails');
 assert.ok(!butterflies.some(row=>row[0]==='quadraticCurveTo'),'butterflies use wing silhouettes instead of petal trails');
 assert.notDeepEqual(petals,butterflies);
 assert.notDeepEqual(petals,frame('pumpkids-treat',.9));
 assert.notDeepEqual(butterflies,frame('anniversary-cake',.9));
 for(const rows of [petals,butterflies]){
  assert.ok(rows.length<350,'fallback work is bounded');
  assert.ok(rows.every(row=>row.slice(1).every(value=>typeof value!=='number'||Number.isFinite(value))));
 }
});
