'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeElement {
  constructor(tag) { this.tagName=tag.toUpperCase(); this.children=[]; this.dataset={}; this.attributes={}; this.listeners={}; this.parentNode=null; this.hidden=false; this.disabled=false; this._value=''; this._text=''; this.className=''; }
  set textContent(value) { this._text=String(value??''); if(this._text==='')this.children=[]; }
  get textContent() { return this._text + this.children.map(child=>child.textContent).join(''); }
  appendChild(child) { child.parentNode=this; this.children.push(child); return child; }
  append(...children) { for(const child of children)this.appendChild(child); }
  replaceChildren(...children) { this.children=[]; for(const child of children)this.appendChild(child); }
  setAttribute(key,value) { this.attributes[key]=String(value); }
  addEventListener(type,callback) { (this.listeners[type] ||= []).push(callback); }
  dispatch(type) { const event={type,target:this,currentTarget:this}; for(const callback of this.listeners[type]||[])callback(event); }
  set value(value) { this._value=String(value); for(const child of this.children)if(child.tagName==='OPTION')child.selected=child.value===this._value; }
  get value() { const selected=this.children.find(child=>child.tagName==='OPTION'&&child.selected); return selected?.value ?? this._value; }
  get firstChild() { return this.children[0] || null; }
  get options() { return this.children.filter(child=>child.tagName==='OPTION'); }
  focus() { this.ownerDocument.activeElement=this; }
  contains(target) { return this===target || this.children.some(child=>child.contains(target)); }
  querySelectorAll(selector) { const results=[]; const match=selector==='[data-focus-key]'?node=>!!node.dataset.focusKey:()=>false; const walk=node=>{for(const child of node.children){if(match(child))results.push(child);walk(child);}};walk(this);return results; }
  setSelectionRange(start,end) { this.selectionStart=start; this.selectionEnd=end; }
}

function setup() {
  const document={activeElement:null,createElement(tag){const element=new FakeElement(tag);element.ownerDocument=document;return element;}};
  const sandbox={document,console,Promise,Set,Map,Object,Array,String,Number};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/tools-panel.js'),'utf8'),sandbox,{filename:'tools-panel.js'});
  return {api:sandbox.KantoTools,document};
}
function find(node,predicate){if(predicate(node))return node;for(const child of node.children||[]){const found=find(child,predicate);if(found)return found;}return null;}
function byFocus(node,key){return find(node,item=>item.dataset?.focusKey===key);}
function buttons(node){const result=[];const walk=item=>{if(item.tagName==='BUTTON')result.push(item);for(const child of item.children||[])walk(child);};walk(node);return result;}
function fixture(){
  const move={id:'leechseed',name:'寄生种子',level:7,queued:false};
  return {
    tools:{unlocked:['partyExpShare','trainingTerminal','terminalArchive','researchTerminalFreeTM','campKit','fieldRadar','bondLens','leagueNotes'],gadgets:[],terminal:{unlocked:true,recallUnlocked:true,freeCompatibleTM:true,levelMoves:[{uid:'pika-1',name:'皮卡丘',speciesId:25,level:10,moves:[move]}],machines:[{id:'tm06',name:'TM 06 Toxic',moveId:'toxic',moveName:'剧毒',count:1,learners:[{uid:'pika-1',name:'皮卡丘',knowsMove:false}]}]},camp:{enabled:true,plus:false,location:'1号道路',description:'每故事轮次一次：每只存活伙伴恢复最多一半最大HP、每招恢复5点PP；不复活也不治疗异常状态。'},ecology:{unlocked:true,typeFilter:true,location:'route1',locationName:'1号道路',species:[{id:16,name:'波波',types:['Normal','Flying']},{id:19,name:'小拉达',types:['Normal']},{id:25,name:'皮卡丘',types:['Electric']}]},bondHistory:{unlocked:true,entries:[{uid:'pika-1',name:'皮卡丘',trust:22,mood:'安心',memories:[{storyTurn:12,text:'在森林边观察到波波归巢。'}]}]},leagueHistory:{unlocked:true,leagueProgress:2,tournamentAttempts:1,champion:false,tournamentHistory:[{attempt:1,result:'eliminated',roundsWon:3}],lastSettlement:{round:22,result:'win',summary:'战胜野外训练家。'}},actions:[]},
    gadgets:{gadgets:[{id:'partyExpShare',name:'全队经验共享装置',description:'可切换经验分配模式。',unlocked:true}],availableGadgets:[{id:'partyExpShare',name:'全队经验共享装置',description:'可切换经验分配模式。',unlocked:true},{id:'campKit',name:'野外营地工具',description:'恢复同行伙伴。',unlocked:true}],partyExpShareMode:'off',partyExpShareOptions:[{id:'off',label:'关闭',enabled:true},{id:'split',label:'全队均分',enabled:true},{id:'journey',label:'旅程模式',enabled:true}]},
    world:{队伍:[{uid:'pika-1',昵称:'皮卡丘',等级:10,招式:[{id:'thundershock',name:'电击'},{id:'growl',name:'叫声'}]}],机制奖励:{partyExpShareMode:'off'}},busy:false,
  };
}

test('VM module exposes a populated, state-driven panel with unlocked tools and settings',()=>{
  const {api,document}=setup(),container=document.createElement('div');
  const hooks={asset:path=>`/${path}`,moveName:id=>id==='leechseed'?'寄生种子':id};
  api.render(container,fixture(),hooks);
  assert.ok(find(container,node=>node.textContent==='永久工具'));
  assert.ok(find(container,node=>node.textContent==='全队经验共享装置'));
  byFocus(container,'start-machine').dispatch('click');
  api.render(container,fixture(),hooks);
  assert.ok(find(container,node=>node.textContent.includes('TM 06 Toxic')));
  byFocus(container,'terminal-cancel-machine').dispatch('click');
  byFocus(container,'start-recall').dispatch('click');
  api.render(container,fixture(),hooks);
  assert.ok(find(container,node=>node.textContent.includes('寄生种子')));
  assert.ok(find(container,node=>node.textContent.includes('波波')));
  assert.ok(byFocus(container,'exp-mode-split'));
  assert.ok(find(container,node=>node.textContent.includes('不复活也不治疗异常状态')));
  assert.ok(find(container,node=>node.textContent.includes('在森林边观察到波波归巢。')));
  assert.ok(find(container,node=>node.textContent.includes('第 1 次报名：未晋级，赢下 3/6 轮')));
});

test('bond and league archives are real collapsible sections and display only supplied saved records',()=>{
  const {api,document}=setup(),container=document.createElement('div');
  api.render(container,fixture());
  const bondSection=()=>find(container,node=>node.className==='ktools-section ktools-bond-history');
  const leagueSection=()=>find(container,node=>node.className==='ktools-section ktools-league-history');
  assert.ok(bondSection()?.children[1].hidden);
  assert.ok(leagueSection()?.children[1].hidden);
  byFocus(container,'section-bond-history').dispatch('click');
  assert.equal(bondSection().children[1].hidden,false);
  assert.ok(bondSection().textContent.includes('信赖 22 · 安心'));
  byFocus(container,'section-league-history').dispatch('click');
  assert.equal(leagueSection().children[1].hidden,false);
  assert.ok(leagueSection().textContent.includes('联盟进度：2/5'));
  assert.ok(leagueSection().textContent.includes('战胜野外训练家。'));
});

test('VM terminal form selects a real member and move, confirms exact action payload, and preserves draft on rerender',async()=>{
  const {api,document}=setup(),container=document.createElement('div'),data=fixture(),calls=[];
  api.render(container,data,{onAction:(...args)=>calls.push(args),onConfig(){}});
  byFocus(container,'start-recall').dispatch('click');
  api.render(container,data,{onAction:(...args)=>calls.push(args),onConfig(){}});
  assert.ok(byFocus(container,'terminal-member-recall'));
  assert.equal(byFocus(container,'terminal-move-recall').value,'leechseed');
  byFocus(container,'terminal-confirm-recall').dispatch('click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls[0][0],'gadget-recall');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1])),{uid:'pika-1',move:'leechseed'});
  assert.ok(find(container,node=>node.textContent==='招式回忆已提交。'));
});

test('VM errors are visible, busy state disables actions, and section/filter selections persist',async()=>{
  const {api,document}=setup(),container=document.createElement('div'),data=fixture();
  api.render(container,data,{onAction(){throw new Error('服务器拒绝了这个动作。')},onConfig(){}});
  byFocus(container,'camp-rest').dispatch('click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(find(container,node=>node.textContent==='服务器拒绝了这个动作。'));
  data.busy=true;api.render(container,data,{onAction(){},onConfig(){}});
  assert.equal(byFocus(container,'camp-rest').disabled,true);
  data.busy=false;
  const filter=byFocus(container,'ecology-filter');filter.value='Electric';filter.dispatch('change');
  api.render(container,data,{onAction(){},onConfig(){}});
  assert.equal(byFocus(container,'ecology-filter').value,'Electric');
  assert.ok(find(container,node=>node.textContent.includes('皮卡丘')));
  const ecology=find(container,node=>node.className==='ktools-section ktools-ecology');
  assert.equal(find(ecology,node=>node.textContent.includes('波波')),null);
  byFocus(container,'section-terminal').dispatch('click');
  api.render(container,data,{onAction(){},onConfig(){}});
  const terminalSection=find(container,node=>node.className==='ktools-section ktools-terminal');
  assert.equal(terminalSection.children[1].hidden,true);
  assert.equal(find(container,node=>node.className==='ktools-section ktools-experience').children[1].hidden,false);
});

test('full move slots require a concrete non-HM replacement before confirming',()=>{
  const {api,document}=setup(),container=document.createElement('div'),data=fixture(),calls=[];
  data.world.队伍[0].招式=[{id:'cut',name:'居合斩',秘传:true},{id:'growl',name:'叫声'},{id:'thunderwave',name:'电磁波'},{id:'quickattack',name:'电光一闪'}];
  api.render(container,data,{onAction:(...args)=>calls.push(args)});
  byFocus(container,'start-recall').dispatch('click');
  const slot=byFocus(container,'terminal-slot');
  assert.equal(slot.value,'2');
  assert.equal(slot.options.find(option=>option.value==='append'),undefined);
  assert.equal(slot.options.find(option=>option.value==='1').disabled,true);
  byFocus(container,'terminal-confirm-recall').dispatch('click');
  assert.equal(calls[0][0],'gadget-recall');
  assert.equal(calls[0][1].slot,2);
});
