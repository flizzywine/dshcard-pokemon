import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {apply} from '../index.mjs';
const require=createRequire(import.meta.url),mvu=require('../mvu.cjs'),provider=require('../settlement-provider.cjs');
test('API4 registration uses the official capability and currentVariables contract without snapshot writes',async()=>{
 let config,writes=0;const tasks=[];
 const variables=mvu.createInitialMvu(),copy=structuredClone(variables);
 const T={apiVersion:4,capabilities:{mvuSettlementProvider:1},handle(){},setVariables(){writes++;},mvuSettlementProvider(def){config=def;},settlementTask(def){tasks.push(def);}};
 apply({tavern:T});assert.equal(config.name,'pokemon-kanto-local');
 const result=await config.settle({gameId:'one',turn:2,textVersion:'v2',currentVariables:variables,input:'我选择闪光小火龙，天真性格，6V。',storyText:'大木博士将精灵球递来。',swipe:0,branch:'main',storageRevision:1,lifecycleRevision:1,signal:new AbortController().signal});
 assert.deepEqual(Object.keys(result),['operations']);assert.ok(result.operations.length);assert.equal(writes,0);assert.deepEqual(variables,copy);
 const applied=provider.calculate({baselineVariables:variables,input:'我选择闪光小火龙，天真性格，6V。',storyText:'大木博士将精灵球递来。',turn:2,textVersion:'v2'});
 const mon=applied.stat_data.宝可梦.队伍[0];assert.equal(mon.图鉴编号,4);assert.equal(mon.闪光,true);assert.equal(mon.性格,'Naive');assert.ok(Object.values(mon.个体值).every(n=>n===31));assert.ok(tasks.length);
});
test('a method without the official capability is not mistaken for API4',()=>{
 let registrations=0;const T={apiVersion:3,handle(){},setVariables(){},mvuSettlementProvider(){registrations++;},onTurnSettled(){}};apply({tavern:T});assert.equal(registrations,0);
 assert.throws(()=>provider.settleOfficial({baselineVariables:mvu.createInitialMvu()}),/当前变量快照/);
});
test('API4 settlement aborts, preserves unrelated roots and refuses unsafe prototype paths',()=>{
 const value=mvu.createInitialMvu();value.stat_data.external={preserve:7};value.display_data={preserve:true};
 const aborted=new AbortController();aborted.abort();assert.throws(()=>provider.settleOfficial({currentVariables:value,signal:aborted.signal}),e=>e.name==='AbortError');
 const result=provider.settleOfficial({currentVariables:value,input:'我选择杰尼龟。',turn:2,textVersion:'v2'});assert.ok(result.operations.every(op=>op.path.startsWith('/stat_data/宝可梦')));assert.deepEqual(value.stat_data.external,{preserve:7});assert.deepEqual(value.display_data,{preserve:true});
});

test('a large legacy bag repair is one atomic world operation to avoid the host audit cap',()=>{
 const value=mvu.createInitialMvu(),bag=value.stat_data.宝可梦.背包.物品;
 for(const id of Object.keys(bag).filter(id=>!['potion','pokeball'].includes(id)).slice(0,170))delete bag[id];
 const before=structuredClone(value),context={currentVariables:value,input:'我选择小火龙。',turn:2,textVersion:'large-legacy-save'};
 const result=provider.settleOfficial(context);
 assert.equal(result.operations.length,1);assert.equal(result.operations[0].path,'/stat_data/宝可梦');assert.equal(result.operations[0].op,'replace');
 const expected=provider.calculate({baselineVariables:value,input:context.input,turn:context.turn,textVersion:context.textVersion,trustedTextVersion:true});
 assert.deepEqual(result.operations[0].value,expected.stat_data.宝可梦);assert.deepEqual(value,before,'the authoritative input remains unchanged');
});

test('official settlement reuses the host text identity while legacy callers retain a body digest',()=>{
 const variables=mvu.createInitialMvu();
 const args={baselineVariables:variables,input:'看看伙伴',storyText:'正文',turn:2,textVersion:'canonical-v2',trustedTextVersion:true};
 const next=provider.calculate(args);
 assert.equal(next.stat_data.宝可梦.剧情.本地结算回执.正文哈希,'host-version:canonical-v2');
 assert.deepEqual(provider.settle({...args,baselineVariables:next}).submission.operations,[]);
 const legacy=provider.calculate({...args,trustedTextVersion:false});
 assert.match(legacy.stat_data.宝可梦.剧情.本地结算回执.正文哈希,/^[a-f0-9]{64}$/);
});

test('direct travel after a queued action preserves the host-required action id and retries are inert',()=>{
 const value=mvu.createInitialMvu(),world=value.stat_data.宝可梦;
 world.剧情.初始御三家已选=true;world.剧情.最近行动={action:'travel',turn:1,text:'旧行动',id:'queued-1'};
 world.遭遇=null;world.战斗={轮次:0,状态:'finished',结果:'',摘要:'',操作序号:0};
 world.地图.节点='route1';world.地图.地点='1号道路';
 const args={baselineVariables:value,input:'去尼比市',turn:2,textVersion:'v2'};
 const result=provider.settle({...args,includeVariables:true});
 assert.equal(result.variables.stat_data.宝可梦.地图.节点,'pewter');
 assert.equal(result.variables.stat_data.宝可梦.剧情.最近行动.id,'');
 assert.ok(!result.submission.operations.some(op=>op.op==='remove'&&op.path==='/stat_data/宝可梦/剧情/最近行动/id'));
 const retry=provider.settle({...args,baselineVariables:result.variables,includeVariables:true});
 assert.deepEqual(retry.submission.operations,[]);
 assert.deepEqual(retry.variables,result.variables);
});

test('the native theater resolves original and animated asset packs independently',async()=>{
 const handlers=new Map();
 const T={apiVersion:4,capabilities:{mvuSettlementProvider:1},mvuSettlementProvider(){},settlementTask(){},setVariables(){},handle(route,fn){handlers.set(route,fn);},getTurnState:async()=>({turn:0,textVersion:null}),listCardPacks:async()=>[{id:'kanto-media',baseUrl:'/original/'},{id:'kanto-animated-096',baseUrl:'/animated/'}]};
 apply({tavern:T});const view=await handlers.get('dsh-card-pokemon-frlg-stage/view')({gameId:'fixture'});
 assert.equal(view.assetRoot,'/original/');assert.equal(view.animatedAssetRoot,'/animated/');assert.match(view.js,/__KANTO_ANIMATED_SPRITES__/);
});
