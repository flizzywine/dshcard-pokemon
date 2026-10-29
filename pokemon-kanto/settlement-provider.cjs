'use strict';

const {createHash}=require('node:crypto');
const mvu=require('./mvu.cjs');
const runtime=require('./story-runtime.cjs');
const starterConfig=require('./starter-config.cjs');
const classicServices=require('./classic-services.cjs');

const RECEIPT_KEY='本地结算回执';
const RECEIPT_VERSION=1;
const FORBIDDEN_KEYS=new Set(['__proto__','prototype','constructor']);

function clone(value){return structuredClone(value);}
function object(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function abortIfNeeded(signal){
 if(signal?.aborted){const error=new Error('Settlement was aborted.');error.name='AbortError';throw error;}
}
function hash(value){return createHash('sha256').update(String(value??''),'utf8').digest('hex');}
function pointerPart(value){return String(value).replace(/~/g,'~0').replace(/\//g,'~1');}
function assertSafeKey(key){if(FORBIDDEN_KEYS.has(String(key)))throw new Error(`Unsafe JSON object key: ${key}`);}
function assertSafeTree(value){
 if(Array.isArray(value)){for(const item of value)assertSafeTree(item);return;}
 if(!object(value))return;
 for(const [key,item] of Object.entries(value)){assertSafeKey(key);assertSafeTree(item);}
}

function withInitialWorld(baselineVariables,turn){
 // ensureMvuDefaults clones an existing variables tree itself. Avoid cloning
 // that tree once more before handing it over, especially for large saves.
 if(object(baselineVariables?.stat_data?.宝可梦))return mvu.ensureMvuDefaults(baselineVariables);
 const baseline=object(baselineVariables)?clone(baselineVariables):{};
 if(!object(baseline.stat_data))baseline.stat_data={};

 let fresh=mvu.createInitialMvu();
 fresh=mvu.ensureEncounter(fresh,1);
 const world=fresh.stat_data.宝可梦;
 if(Number.isInteger(turn)&&turn>1){world.地图.轮次=turn;world.战斗.轮次=turn;}
 baseline.stat_data={...baseline.stat_data,...fresh.stat_data};
 return mvu.ensureMvuDefaults(baseline);
}

function restoreOpeningEncounter(variables,turn){
 const world=variables.stat_data.宝可梦;
 if(world.地图?.节点!=='pallet'||world.剧情?.初始御三家已选||world.战斗?.状态==='active')return variables;
 if(world.战斗?.状态==='finished'&&!world.遭遇){
  let next=mvu.ensureEncounter(variables,Math.max(1,world.战斗.轮次||turn||1));
  const nextWorld=next.stat_data.宝可梦;
  if(Number.isInteger(turn)&&turn>1&&nextWorld.遭遇?.类型==='trainer'&&nextWorld.遭遇.训练家==='小茂'){
   nextWorld.地图.轮次=turn;nextWorld.战斗.轮次=turn;
  }
  return next;
 }
 return variables;
}

function applyStarterInput(variables,input,turn){
 const world=variables.stat_data.宝可梦;
 if(world.战斗?.状态==='active')return variables;
 const choice=starterConfig.parseChoice(input);
 if(!choice)return variables;
 if(!world.剧情?.初始御三家已选&&world.地图?.节点==='pallet'&&world.战斗?.状态==='pending'){
  return mvu.chooseStarter(variables,choice.id,choice.options);
 }
 if(world.剧情?.初始御三家已选&&!world.剧情?.初始伙伴设定&&world.战斗?.状态!=='active'&&choice.id===world.剧情?.初始御三家编号){
  return mvu.restoreStarterOptions(variables,choice.options,turn);
 }
 return variables;
}

function makeReceipt(input,storyText,turn,textVersion,trustedTextVersion=false){
 return {版本:RECEIPT_VERSION,故事轮次:Number.isInteger(turn)?turn:null,正文版本:textVersion??null,
  输入哈希:hash(input),正文哈希:trustedTextVersion&&typeof textVersion==='string'&&textVersion.length>0?`host-version:${textVersion}`:hash(storyText)};
}
function sameJson(left,right){
 if(Object.is(left,right))return true;
 if(Array.isArray(left)||Array.isArray(right))return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((item,index)=>sameJson(item,right[index]));
 if(object(left)||object(right)){
  if(!object(left)||!object(right))return false;
  const leftKeys=Object.keys(left),rightKeys=Object.keys(right);
  return leftKeys.length===rightKeys.length&&leftKeys.every(key=>Object.hasOwn(right,key)&&sameJson(left[key],right[key]));
 }
 return false;
}
function sameReceipt(previous,next){
 return object(previous)&&previous.版本===RECEIPT_VERSION&&previous.故事轮次===next.故事轮次&&
  previous.正文版本===next.正文版本&&previous.输入哈希===next.输入哈希&&previous.正文哈希===next.正文哈希;
}

function diffJson(before,after,path,operations){
 // Compare object fields while walking them instead of recursively comparing
 // the entire subtree at every level. Arrays still need a full comparison,
 // because they are emitted as a single atomic replacement.
 if(Object.is(before,after))return;
 const beforeObject=object(before),afterObject=object(after);
 if(beforeObject&&afterObject){
  // New schema keys require replacing an existing container under strictSet.
  // Normal scalar changes can stay small instead of replacing the whole world.
  if(Object.keys(after).some(key=>!Object.hasOwn(before,key))){
   operations.push({op:'replace',path,value:clone(after)});return;
  }
  const keys=new Set([...Object.keys(before),...Object.keys(after)]);
  for(const key of [...keys].sort()){
   assertSafeKey(key);
   const beforeHas=Object.hasOwn(before,key),afterHas=Object.hasOwn(after,key),childPath=`${path}/${pointerPart(key)}`;
   if(beforeHas&&!afterHas)operations.push({op:'remove',path:childPath});
   else if(!beforeHas&&afterHas)operations.push({op:'add',path:childPath,value:clone(after[key])});
   else diffJson(before[key],after[key],childPath,operations);
  }
  return;
 }
 if(Array.isArray(before)&&Array.isArray(after)&&sameJson(before,after))return;
 if(path==='/')throw new Error('The JSON patch root cannot be replaced.');
 if(before===undefined)operations.push({op:'add',path,value:clone(after)});
 else if(after===undefined)operations.push({op:'remove',path});
 else operations.push({op:'replace',path,value:clone(after)});
}

// The host limits the number of leaf differences it displays while auditing a
// submitted batch. A large array or newly populated bag can consume that limit
// before another valid operation is seen. In that rare case, submit the same
// atomic Pokémon-root value as one operation; never change unrelated roots.
function exceedsLeafBudget(before,after,budget=160){
 let remaining=budget;
 const visit=(left,right)=>{
  if(remaining<=0||Object.is(left,right))return;
  const leftObject=left!==null&&typeof left==='object',rightObject=right!==null&&typeof right==='object';
  if(leftObject&&rightObject&&Array.isArray(left)===Array.isArray(right)){
   for(const key of new Set([...Object.keys(left),...Object.keys(right)])){visit(left[key],right[key]);if(remaining<=0)break;}
  }else remaining--;
 };
 visit(before,after);return remaining<=0;
}

function jsonPatch(before,after){
 if(!object(before)||!object(after))throw new TypeError('Settlement variables must be JSON objects.');
 const beforeStat=object(before.stat_data)?before.stat_data:{};
 const afterStat=object(after.stat_data)?after.stat_data:{};
 const previousWorld=beforeStat.宝可梦;
 const nextWorld=afterStat.宝可梦;
 if(!object(nextWorld))throw new Error('Settlement did not produce a valid Pokémon root.');
 if(!object(previousWorld))return [{op:'add',path:'/stat_data/宝可梦',value:clone(nextWorld)}];
 const operations=[];diffJson(previousWorld,nextWorld,'/stat_data/宝可梦',operations);
 return operations.length>180||(operations.length>1&&exceedsLeafBudget(previousWorld,nextWorld))
  ?[{op:'replace',path:'/stat_data/宝可梦',value:clone(nextWorld)}]:operations;
}

function settle({baselineVariables,input='',storyText='',turn=1,textVersion=0,signal,includeVariables=false,trustedTextVersion=false}={}){
 abortIfNeeded(signal);
 const before=object(baselineVariables)?clone(baselineVariables):{};
 const incomingReceipt=makeReceipt(input,storyText,turn,textVersion,trustedTextVersion);
 const existingWorld=before.stat_data?.宝可梦;
 if(object(existingWorld)&&sameReceipt(existingWorld.剧情?.[RECEIPT_KEY],incomingReceipt)){
  // A retry cannot repeat the player's action. A version upgrade may still
  // add safe missing defaults (e.g. the daycare's turn counter) to an old save.
  const normalized=mvu.ensureMvuDefaults(before);
  mvu.validateMvu(normalized);
  abortIfNeeded(signal);
  return {handled:true,submission:{operations:jsonPatch(before,normalized)},...(includeVariables?{variables:normalized}:{})};
 }
 let variables=withInitialWorld(before,turn);
 let world=variables.stat_data.宝可梦;
 variables=mvu.recalculateDerived(variables);
 world=variables.stat_data.宝可梦;

 const receipt=incomingReceipt;
 const previousReceipt=world.剧情?.[RECEIPT_KEY];
 const duplicate=sameReceipt(previousReceipt,receipt);
 // A regenerated assistant response may carry a new text version while the
 // already-committed player action is unchanged. Do not buy, travel, or award
 // twice when the host supplies the previously committed state as baseline.
 // When the host rolls back to the pre-turn snapshot, its receipt differs and
 // the action is applied normally.
 const actionAlreadyApplied=object(previousReceipt)&&previousReceipt.版本===RECEIPT_VERSION&&
  previousReceipt.故事轮次===receipt.故事轮次&&previousReceipt.输入哈希===receipt.输入哈希;

 if(!duplicate){
  if(!actionAlreadyApplied&&world.战斗?.状态!=='active'){
   variables=restoreOpeningEncounter(variables,turn);
   variables=applyStarterInput(variables,input,turn);
   world=variables.stat_data.宝可梦;
   if(world.战斗?.状态!=='active'){
    variables=runtime.finishStoryAction(variables,input,turn);
    world=variables.stat_data.宝可梦;
    if(world.战斗?.状态==='finished')variables=runtime.reconcileNarrativeEncounter(variables,input,storyText,turn);
   }
  }
  variables=runtime.reconcileEncounterOffer(variables,input,storyText,turn,textVersion);
  world=variables.stat_data.宝可梦;
  variables.stat_data.宝可梦=classicServices.advanceDaycareTurn(world,{storyTurn:turn});
  world=variables.stat_data.宝可梦;
  world.剧情={...(world.剧情||{}),[RECEIPT_KEY]:receipt};
 }

 abortIfNeeded(signal);
 variables=mvu.ensureMvuDefaults(variables);
 variables=mvu.recalculateDerived(variables);
 assertSafeTree(variables.stat_data.宝可梦);
 mvu.validateMvu(variables);
 return {handled:true,submission:{operations:jsonPatch(before,variables)},...(includeVariables?{variables}:{})};
}

function calculate(options){return settle({...options,includeVariables:true}).variables;}
// DSH API v4 supplies currentVariables and accepts { operations } directly.
// Keep the older pure calculator contract private to legacy-host recovery.
function settleOfficial({currentVariables,...context}={}){
 if(!object(currentVariables))throw new TypeError('官方 MVU 未提供当前变量快照。');
 // API4 supplies the canonical pending-text key and rechecks it before commit.
 // Reuse that identity instead of hashing the whole story a second time.
 // Keep the legacy receipt shape so strict saved schemas need no key removal.
 const result=settle({...context,baselineVariables:currentVariables,trustedTextVersion:true});
 return {operations:result.submission.operations};
}
module.exports={settle,calculate,settleOfficial};
