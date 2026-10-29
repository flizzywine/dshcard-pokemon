import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {apply} from '../index.mjs';
const require=createRequire(import.meta.url),mvu=require('../mvu.cjs'),{settle}=require('../settlement-provider.cjs');
function applyPatch(source,operations){const next=structuredClone(source);for(const op of operations){const parts=op.path.slice(1).split('/').map(x=>x.replace(/~1/g,'/').replace(/~0/g,'~'));let node=next;for(const key of parts.slice(0,-1))node=node[key]||=( {} );if(op.op==='remove')delete node[parts.at(-1)];else node[parts.at(-1)]=structuredClone(op.value);}return next;}
function host(){
 const routes=new Map(),callbacks={};let variables=mvu.createInitialMvu(4),head={turn:12,textVersion:'v12',settled:true,busy:false};
 const w=variables.stat_data.宝可梦;w.剧情.初始御三家已选=true;w.地图.节点='viridian';w.地图.地点='常青市';w.遭遇=null;w.战斗={轮次:12,状态:'finished',操作序号:0};
 const counts={reads:0,writes:0,model:0};
 const T={apiVersion:4,capabilities:{mvuSettlementProvider:1},handle:(name,fn)=>routes.set(name,fn),mvuSettlementProvider(){},onTurnSettled(fn){callbacks.settled=fn;},
  getTurnState:async()=>({...head}),getTurn:async()=>{counts.reads++;await new Promise(r=>setImmediate(r));return {...head,variables:structuredClone(variables)};},
  getHistory:async()=>[{input:'',text:''}],readTurnData:async()=>null,saveTurnData:async()=>{},
  setVariables:async args=>{counts.writes++;variables=structuredClone(args.variables);},runTask:async()=>{counts.model++;return new Promise(()=>{});}};
 apply({tavern:T});return {T,counts,callbacks,get variables(){return variables;},set variables(v){variables=v;},get head(){return head;},set head(v){head=v;},call:(route,args={})=>routes.get('dsh-card-pokemon-frlg-stage/'+route)({gameId:'perf-game',...args})};
}
test('asking for new quests returns locally and cannot hold the game queue behind an unresponsive model',async()=>{
 const h=host();const result=await h.call('quest-generate');
 assert.equal(h.counts.model,0);assert.ok(result.world.委托.随机委托.length>0);
 const before=h.counts.writes;await h.call('mvu');assert.equal(h.counts.writes,before,'reading a panel must not rewrite MVU');
 assert.ok(result.world.委托.随机委托.every(q=>q.reward.coins>=500));
});
test('concurrent panel reads share one snapshot and omit retired tile collision grids and duplicate cosmetic worlds',async()=>{
 const h=host();const result=await Promise.all(Array.from({length:20},()=>h.call('mvu')));
 assert.equal(h.counts.reads,1);assert.equal(h.counts.writes,0);
 assert.equal(result[0].tileWorld,undefined);assert.equal(result[0].cosmetics.world,undefined);
 assert.equal(result[0].world.地图.节点,'viridian');
});
test('a committed local settlement notification does not settle the action or rewrite variables a second time',async()=>{
 const h=host();h.variables=applyPatch(h.variables,settle({baselineVariables:h.variables,input:'',storyText:'夏风吹过街道。',turn:12,textVersion:'v12'}).submission.operations);
 await h.callbacks.settled({gameId:'perf-game',...h.head,variables:structuredClone(h.variables),text:'夏风吹过街道。'});
 assert.equal(h.counts.writes,0);assert.equal(h.counts.model,0);
});
test('ordinary story updates stay granular, and daycare advances once per completed story turn including quiet RP',()=>{
 let vars=host().variables;
 vars=applyPatch(vars,settle({baselineVariables:vars,input:'看看伙伴',storyText:'街边很安静。',turn:12,textVersion:'v12'}).submission.operations);
 const before=vars.stat_data.宝可梦.经典设施.daycare.turns;
 const args={baselineVariables:vars,input:'我坐在长椅上休息。',storyText:'伙伴靠在你身旁。',turn:13,textVersion:'v13'};
 const output=settle(args),next=applyPatch(vars,output.submission.operations);
 assert.equal(next.stat_data.宝可梦.经典设施.daycare.turns,before+1);
 assert.ok(output.submission.operations.every(op=>op.path!=='/stat_data/宝可梦'));
 assert.ok(JSON.stringify(output.submission.operations).length<JSON.stringify(next.stat_data.宝可梦).length/4);
 assert.deepEqual(settle({...args,baselineVariables:next}).submission.operations,[]);
});
test('replaying a settled purchase is inert and cannot charge coins or advance daycare twice',()=>{
 const baseline=host().variables,before=baseline.stat_data.宝可梦;
 const args={baselineVariables:baseline,input:'我买一瓶伤药',storyText:'店员把伤药递过来。',turn:12,textVersion:'v12'};
 const first=settle(args),settled=applyPatch(baseline,first.submission.operations),world=settled.stat_data.宝可梦;
 assert.ok(first.submission.operations.length>0);
 assert.equal(world.背包.物品.potion,before.背包.物品.potion+1);
 assert.equal(world.训练家.金钱,before.训练家.金钱-300);
 assert.equal(world.经典设施.daycare.turns,1);
 assert.equal(world.剧情.本地结算回执.故事轮次,12);
 assert.equal(world.剧情.本地结算回执.正文版本,'v12');
 const retry=settle({...args,baselineVariables:settled,includeVariables:true});
 assert.deepEqual(retry.submission.operations,[]);
 assert.deepEqual(retry.variables,settled);
 assert.equal(retry.variables.stat_data.宝可梦.背包.物品.potion,before.背包.物品.potion+1);
 assert.equal(retry.variables.stat_data.宝可梦.训练家.金钱,before.训练家.金钱-300);
 assert.equal(retry.variables.stat_data.宝可梦.经典设施.daycare.turns,1);
});
test('a regenerated body version or edited prose replaces the receipt once without replaying the same story turn',()=>{
 const baseline=host().variables;
 const first=settle({baselineVariables:baseline,input:'我坐在长椅上休息。',storyText:'街边很安静。',turn:12,textVersion:'v12'});
 const settled=applyPatch(baseline,first.submission.operations),daycare=settled.stat_data.宝可梦.经典设施.daycare.turns;
 assert.equal(settled.stat_data.宝可梦.剧情.本地结算回执.正文版本,'v12');
 const regenerated=settle({baselineVariables:settled,input:'我坐在长椅上休息。',storyText:'晚风穿过街道。',turn:12,textVersion:'v13'});
 const afterVersion=applyPatch(settled,regenerated.submission.operations);
 assert.ok(regenerated.submission.operations.length>0,'the v12 receipt must not mark the regenerated v13 body as already settled');
 assert.equal(afterVersion.stat_data.宝可梦.剧情.本地结算回执.故事轮次,12);
 assert.equal(afterVersion.stat_data.宝可梦.剧情.本地结算回执.正文版本,'v13');
 assert.notEqual(afterVersion.stat_data.宝可梦.剧情.本地结算回执.正文哈希,settled.stat_data.宝可梦.剧情.本地结算回执.正文哈希);
 assert.equal(afterVersion.stat_data.宝可梦.经典设施.daycare.turns,daycare,'regenerating the same story turn must not advance daycare twice');
 const editedArgs={baselineVariables:afterVersion,input:'我坐在长椅上休息。',storyText:'雨后街道泛着微光。',turn:12,textVersion:'v13'};
 const edited=settle(editedArgs),afterEdit=applyPatch(afterVersion,edited.submission.operations);
 assert.ok(edited.submission.operations.length>0,'editing the prose hash without changing the version still requires fresh settlement');
 assert.notEqual(afterEdit.stat_data.宝可梦.剧情.本地结算回执.正文哈希,afterVersion.stat_data.宝可梦.剧情.本地结算回执.正文哈希);
 assert.equal(afterEdit.stat_data.宝可梦.经典设施.daycare.turns,daycare);
 assert.deepEqual(settle({...editedArgs,baselineVariables:afterEdit}).submission.operations,[]);
});
test('a receipt from the previous story turn cannot make the next turn look already settled',()=>{
 const baseline=host().variables;
 const args={baselineVariables:baseline,input:'我坐在长椅上休息。',storyText:'街边很安静。',turn:12,textVersion:'v12'};
 const after12=applyPatch(baseline,settle(args).submission.operations),turns=after12.stat_data.宝可梦.经典设施.daycare.turns;
 assert.equal(after12.stat_data.宝可梦.剧情.本地结算回执.故事轮次,12);
 const next=settle({...args,baselineVariables:after12,turn:13,textVersion:'v13'});
 const after13=applyPatch(after12,next.submission.operations);
 assert.ok(next.submission.operations.length>0,'the old receipt must not suppress the new turn');
 assert.equal(after13.stat_data.宝可梦.经典设施.daycare.turns,turns+1);
 assert.equal(after13.stat_data.宝可梦.剧情.本地结算回执.故事轮次,13);
 assert.equal(after13.stat_data.宝可梦.剧情.本地结算回执.正文版本,'v13');
 assert.deepEqual(settle({...args,baselineVariables:after13,turn:13,textVersion:'v13'}).submission.operations,[]);
});
test('regenerating a response on an already committed purchase does not buy again',()=>{
 const baseline=host().variables;
 const args={baselineVariables:baseline,input:'我买一瓶伤药',storyText:'店员把伤药递过来。',turn:12,textVersion:'v12'};
 const after=applyPatch(baseline,settle(args).submission.operations),before=after.stat_data.宝可梦;
 const regenerated=settle({...args,baselineVariables:after,textVersion:'v13',storyText:'店员点点头。'});
 const next=applyPatch(after,regenerated.submission.operations).stat_data.宝可梦;
 assert.equal(next.训练家.金钱,before.训练家.金钱);
 assert.equal(next.背包.物品.potion,before.背包.物品.potion);
 assert.equal(next.剧情.本地结算回执.正文版本,'v13');
 const rollback=applyPatch(baseline,settle({...args,textVersion:'v13',storyText:'店员点点头。'}).submission.operations).stat_data.宝可梦;
 assert.equal(rollback.背包.物品.potion,baseline.stat_data.宝可梦.背包.物品.potion+1);
});
