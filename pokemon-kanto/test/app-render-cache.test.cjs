'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
function fn(name,next){const start=source.indexOf(`  function ${name}(`),end=source.indexOf(`  function ${next}(`,start);assert.ok(start>=0&&end>start);return source.slice(start,end);}
class Node {constructor(tag){this.tag=tag;this.children=[];this.textContent='';} appendChild(node){this.children.push(node);} append(...nodes){this.children.push(...nodes);} replaceChildren(){this.children=[];}}
test('JSON renders only when open and world changes',()=>{
 let count=0;const state={world:{value:1}},els={mvuJson:{parentElement:{open:false},textContent:''}};
 const context={state,els,JSON:{stringify:(...args)=>{count++;return JSON.stringify(...args);}}};
 vm.runInNewContext(fn('renderMvuJson','hasStarterChoice')+'\nglobalThis.run=renderMvuJson;',context);
 context.run();context.run();assert.equal(count,0);
 els.mvuJson.parentElement.open=true;context.run();context.run();assert.equal(count,1);assert.match(els.mvuJson.textContent,/1/);
 state.world={value:2};context.run();assert.equal(count,2);assert.match(els.mvuJson.textContent,/2/);
 els.mvuJson.parentElement.open=false;state.world={value:3};context.run();assert.equal(count,2);els.mvuJson.parentElement.open=true;context.run();assert.equal(count,3);
 assert.match(source,/parentElement\?\.addEventListener\('toggle', renderMvuJson\)/);
 assert.match(source,/state\.mvuJsonWorld = undefined; renderMvuJson\(\)/);
});
test('dex avoids rebuilding for the same query and data, and invalidates on change',()=>{
 let creates=0;const state={species:Array.from({length:151},(_,i)=>({id:i+1,name:`mon${i+1}`,types:['normal']})),types:{normal:'普通'}},els={dexResults:new Node('div'),dexSearch:{value:''}};
 const context={state,els,document:{createElement:tag=>{creates++;return new Node(tag);}},assetUrl:id=>String(id),typeName:type=>state.types[type]};
 vm.runInNewContext(fn('renderDex','encounterName')+'\nglobalThis.run=renderDex;',context);
 context.run();assert.equal(creates,755);context.run();assert.equal(creates,755);
 els.dexSearch.value='mon1';context.run();assert.ok(creates>755);const afterQuery=creates;context.run();assert.equal(creates,afterQuery);
 state.species=[{id:1,name:'new',types:['normal']}];context.run();assert.ok(creates>afterQuery);const afterSpecies=creates;
 state.types={normal:'一般'};context.run();assert.ok(creates>afterSpecies);
 state.dexRenderCache=null;const beforeClear=creates;context.run();assert.ok(creates>beforeClear);
 assert.match(source,/function hydrateDex\(data\) \{\s*state\.dexRenderCache = null/);
 assert.match(source,/els\.dexResults\.replaceChildren\(\); state\.dexRenderCache = null/);
});
