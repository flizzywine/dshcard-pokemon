'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const mvu=require('../mvu.cjs');
const {settle}=require('../settlement-provider.cjs');

function pointerParts(path){return path.slice(1).split('/').map(part=>part.replace(/~1/g,'/').replace(/~0/g,'~'));}
function applyOperations(source,operations){
 const value=structuredClone(source);
 for(const operation of operations){
  const parts=pointerParts(operation.path);
  if(parts[0]!=='stat_data')throw new Error(`unexpected path ${operation.path}`);
  if(parts.length===1){
   if(operation.op==='remove')delete value.stat_data;
   else value.stat_data=structuredClone(operation.value);
   continue;
  }
  let parent=value;
  for(const part of parts.slice(0,-1)){if(!parent[part]||typeof parent[part]!=='object')parent[part]={};parent=parent[part];}
  const last=parts.at(-1);
  if(operation.op==='remove')delete parent[last];
  else parent[last]=structuredClone(operation.value);
 }
 return value;
}
function variablesAt(node='route1',status='finished'){
 let variables=mvu.ensureEncounter(mvu.createInitialMvu(),1);
 variables=mvu.chooseStarter(variables,1);
 const world=variables.stat_data.宝可梦;
 world.地图.节点=node;
 world.地图.地点=({pallet:'真新镇',route1:'1号道路',viridian:'常青市','viridian-forest':'常青森林'})[node]||node;
 world.遭遇=null;
 world.战斗={轮次:world.地图.轮次,状态:status,结果:'',摘要:'',操作序号:0};
 mvu.validateMvu(variables);
 return variables;
}
function invoke(baselineVariables,input,overrides={}){
 return settle({baselineVariables,input,storyText:'',turn:2,textVersion:1,...overrides});
}

test('settlement preserves its original variables while normalizing an existing save',()=>{
 const baseline=variablesAt('viridian');
 delete baseline.stat_data.宝可梦.背包.物品.potion;
 const original=structuredClone(baseline);
 const result=invoke(baseline,'我买一瓶伤药');
 assert.deepEqual(baseline,original);
 assert.ok(result.submission.operations.length>0);
});

test('provider initializes an absent Pokémon root while preserving other variables',()=>{
 const baseline={custom:'keep',stat_data:{Other:{count:7}}};
 const result=invoke(baseline,'');
 assert.equal(result.handled,true);
 assert.ok(result.submission.operations.length>0);
 assert.ok(result.submission.operations.every(operation=>operation.path.startsWith('/stat_data')));
 const applied=applyOperations(baseline,result.submission.operations);
 assert.deepEqual(applied.custom,'keep');assert.deepEqual(applied.stat_data.Other,{count:7});
 assert.equal(applied.stat_data.宝可梦.战斗.状态,'pending');
 assert.equal(applied.stat_data.宝可梦.遭遇.训练家,'小茂');
});

test('plain language travel to 长青市 settles through the plugin and emits a complete JSON patch',()=>{
 const baseline=variablesAt('route1'),result=invoke(baseline,'我想前往长青市');
 const applied=applyOperations(baseline,result.submission.operations),world=applied.stat_data.宝可梦;
 assert.equal(world.地图.节点,'viridian');
 assert.ok(result.submission.operations.length);
 for(const operation of result.submission.operations){
  assert.match(operation.path,/^\/stat_data(?:\/|$)/);
  assert.ok(['add','remove','replace'].includes(operation.op));
  if(operation.op!=='remove')assert.doesNotThrow(()=>JSON.stringify(operation.value));
 }
 assert.ok(result.submission.operations.every(op=>op.path.startsWith('/stat_data/宝可梦/')),'normal actions use smaller existing containers instead of a full-world replacement');
});

test('compound travel and named encounter move first, then preserve the requested Pikachu',()=>{
 const baseline=variablesAt('route1'),result=invoke(baseline,'我带着伙伴去常青森林遇到皮卡丘');
 const world=applyOperations(baseline,result.submission.operations).stat_data.宝可梦;
 assert.equal(world.地图.节点,'viridian-forest');
 assert.equal(world.遭遇.类型,'wild');assert.equal(world.遭遇.队伍[0].图鉴编号,25);
 assert.equal(world.遭遇.方法,'story');assert.equal(world.战斗.状态,'pending');
});

test('opening pending starter selection applies shiny, nature and six 31 IVs',()=>{
 const baseline=mvu.ensureEncounter(mvu.createInitialMvu(),1);
 const result=invoke(baseline,'我选择小火龙，天真性格，6V，闪光',{turn:1});
 const world=applyOperations(baseline,result.submission.operations).stat_data.宝可梦,starter=world.队伍[0];
 assert.equal(world.剧情.初始御三家已选,true);assert.equal(starter.图鉴编号,4);
 assert.equal(starter.性格,'Naive');assert.equal(starter.闪光,true);
 assert.deepEqual(starter.个体值,{hp:31,atk:31,def:31,spa:31,spd:31,spe:31});
 assert.equal(world.遭遇.队伍[0].图鉴编号,7,'the rival starter changes with the player choice');
 assert.ok(result.submission.operations.some(op=>op.path==='/stat_data/宝可梦/队伍'&&Array.isArray(op.value)),'arrays remain atomic while unrelated containers stay out of the patch');
});

test('legacy opening starter settings are recovered from the current player input',()=>{
 let baseline=mvu.ensureEncounter(mvu.createInitialMvu(),1);
 baseline=mvu.chooseStarter(baseline,4);
 delete baseline.stat_data.宝可梦.剧情.初始伙伴设定;
 const result=invoke(baseline,'我选择小火龙，天真性格，6V闪光',{turn:1});
 const world=applyOperations(baseline,result.submission.operations).stat_data.宝可梦,starter=world.队伍[0];
 assert.equal(starter.图鉴编号,4);assert.equal(starter.闪光,true);assert.equal(starter.性格,'Naive');
 assert.deepEqual(starter.个体值,{hp:31,atk:31,def:31,spa:31,spd:31,spe:31});
 assert.equal(world.剧情.初始伙伴设定.已补录,true);
});

test('the same story version and input do not buy twice when its receipt is present',()=>{
 const baseline=variablesAt('pallet');
 const args={baselineVariables:baseline,input:'我买一瓶伤药',storyText:'店员递来伤药。',turn:2,textVersion:4};
 const first=settle(args),after=applyOperations(baseline,first.submission.operations);
 const second=settle({...args,baselineVariables:after});
 assert.deepEqual(second.submission.operations,[]);
 assert.equal(after.stat_data.宝可梦.背包.物品.potion,baseline.stat_data.宝可梦.背包.物品.potion+1);
 assert.equal(after.stat_data.宝可梦.训练家.金钱,baseline.stat_data.宝可梦.训练家.金钱-300);
});

test('an active battle only migrates defaults and never executes new player input',()=>{
 const baseline=variablesAt('route1','active'),world=baseline.stat_data.宝可梦;
 delete world.设置.battleMode;
 const result=invoke(baseline,'我前往常青市');
 const next=applyOperations(baseline,result.submission.operations).stat_data.宝可梦;
 assert.equal(next.地图.节点,'route1');assert.equal(next.战斗.状态,'active');
 assert.equal(next.设置.battleMode,'singles');
});

test('aborted settlement throws AbortError instead of returning an empty submission',()=>{
 const controller=new AbortController();controller.abort();
 assert.throws(()=>invoke(variablesAt(),'我前往常青市',{signal:controller.signal}),error=>error.name==='AbortError');
});

test('unsafe prototype keys and invalid MVU data fail loudly',()=>{
 const baseline=variablesAt();
 Object.defineProperty(baseline.stat_data.宝可梦.剧情,'__proto__',{value:'unsafe',enumerable:true});
 assert.throws(()=>invoke(baseline,''),/Unsafe JSON object key/);
 const invalid=variablesAt();invalid.stat_data.宝可梦.队伍[0].个体值.hp=99;
 assert.throws(()=>invoke(invalid,''),/个体值/);
});
