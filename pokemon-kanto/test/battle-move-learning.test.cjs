'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../public/app.js'),'utf8');
class Element { constructor(){this.children=[];this.listeners={};this.disabled=false;} append(...nodes){this.children.push(...nodes)} appendChild(node){this.children.push(node);return node} addEventListener(name,fn){this.listeners[name]=fn} click(){if(!this.disabled)this.listeners.click?.()} }
function fixture(machine){
 const calls=[],mon={uid:'one',昵称:'伙伴',招式:[{id:'cut',秘传:true,PP:10,PP上限:30},{id:'tackle',PP:20,PP上限:35}]};
 const context={document:{createElement:()=>new Element()},state:{busy:false},assetUrl:()=>'',dexId:()=>1,isShiny:()=>false,moveById:id=>({name:id,type:'Normal',basePower:40,pp:35}),typeName:x=>x,first:(obj,keys,fallback)=>keys.map(key=>obj[key]).find(value=>value!=null)??fallback,isHmMove:id=>id==='cut',learnMove:(...args)=>calls.push(['level',...args]),useMvuItem:(...args)=>calls.push(['item',...args])};
 vm.runInNewContext(source.slice(source.indexOf('  function learningMoveDetail('),source.indexOf('  function machineControls('))+';globalThis.render=renderLearningChoice;',context);
 const root=context.render(mon,'newmove',machine,()=>calls.push(['close'])); return {root,calls,buttons:root.children.at(-1).children};
}
test('battle learning protects HM slots, shows move details, and submits the selected slot',()=>{const v=fixture();assert.match(v.root.children[1].textContent,/新招式.*威力 40/);assert.equal(v.buttons[0].disabled,true);v.buttons[0].click();assert.equal(v.calls.length,0);v.buttons[1].click();assert.deepEqual(v.calls,[['level','one','newmove',2]]);});
test('declining a machine leaves it unused; choosing a slot invokes item use once',()=>{const a=fixture({id:'tm01'});a.buttons[4].click();assert.deepEqual(a.calls,[['close']]);const b=fixture({id:'tm01'});b.buttons[2].click();assert.equal(b.calls[1][0],'item');assert.equal(b.calls[1][1],'tm01');assert.equal(b.calls[1][3].slot,3);});
test('finished battle result renders pending learning in place',()=>{assert.match(source,/panel\.appendChild\(renderLearningChoice\(learner, learner\.待学招式\[0\]\)\)/);});
