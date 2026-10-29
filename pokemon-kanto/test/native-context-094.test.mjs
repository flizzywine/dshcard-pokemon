import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const here=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url);
const mvu=require('../mvu.cjs');
const live=mvu.chooseStarter(mvu.createInitialMvu(4),4);
const fixtureWorld=live.stat_data.宝可梦;
fixtureWorld.遭遇=null;fixtureWorld.战斗={轮次:13,状态:'finished',结果:'',摘要:'',操作序号:0};fixtureWorld.地图.轮次=13;
const localIndex=path.resolve(here,'../index.mjs');
const clone=value=>structuredClone(value);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
let imported;
async function indexModule(){return imported??=(await import(pathToFileURL(localIndex).href));}
function harness({native=true,header={},contextTextVersion,contextTurn=13,turn=13}={}){
 const handlers=new Map(),counts={getTurnContext:0,getTurnState:0,getTurn:0,setVariables:0,saveTurnData:0,readTurnData:0};
 const base={gameId:'native-context-test',turn,textVersion:'fixture-turn-'+turn,greeting:false,generating:false,settling:false,busy:false,settled:true,...header};
 const source={turn:contextTurn,textVersion:contextTextVersion??base.textVersion,text:'',variables:clone(live)};
 const T={apiVersion:4,capabilities:{mvuSettlementProvider:1},handle:(name,fn)=>handlers.set(name,fn),mvuSettlementProvider(){},onTurnSettled(){},
  getTurnState:async()=>{counts.getTurnState++;return clone(base);},
  getTurn:async({turn:requested}={})=>{counts.getTurn++;const result=clone(source);if(Number.isInteger(requested)&&requested!==source.turn)return {turn:requested,textVersion:'previous-fixture-version',text:'',variables:clone(live)};return result;},
  getHistory:async()=>[],readTurnData:async()=>{counts.readTurnData++;return null;},saveTurnData:async()=>{counts.saveTurnData++;},
  setVariables:async({variables})=>{counts.setVariables++;source.variables=clone(variables);}
 };
 if(native)T.getTurnContext=async()=>{counts.getTurnContext++;const state=clone(base),turnData=base.settled===true&&!base.busy&&!base.generating&&!base.settling?clone(source):null;assert.notStrictEqual(state,turnData);if(turnData)assert.notStrictEqual(turnData.variables,source.variables,'context fixture must detach MVU objects');return {state,turn:turnData};};
 return {T,counts,source,base,handlers,async route(name,args={}){if(!handlers.has(name))(await indexModule()).apply({tavern:T});return handlers.get('dsh-card-pokemon-frlg-stage/'+name)({gameId:base.gameId,...args});}};
}

test('official turn APIs serve a stage panel without the removed private batch extension',async()=>{
 const h=harness({native:true}),fixtureHash=digest(h.source.variables);await h.route('mvu',{view:'stage'});
 assert.equal(h.counts.getTurnContext,0);assert.equal(h.counts.getTurnState,1);assert.equal(h.counts.getTurn,1);assert.equal(h.counts.setVariables,0);
 assert.ok(h.source.variables.stat_data?.宝可梦,'the private snapshot was supplied through a detached copy');assert.ok(digest(h.source.variables)===fixtureHash,'getTurnContext fixture must not share mutable variables with the plugin');
});

test('legacy getTurnState plus getTurn fallback remains usable when getTurnContext is absent',async()=>{
 const h=harness({native:false}),result=await h.route('mvu',{view:'stage'});
 assert.equal(h.counts.getTurnContext,0);assert.equal(h.counts.getTurnState,1);assert.equal(h.counts.getTurn,1);assert.equal(h.counts.setVariables,0);
 assert.equal(result.turn,h.base.turn);assert.equal(result.textVersion,h.base.textVersion);assert.ok(result.world);
});

test('pending native header returns a read-only stage and rejects a write',async()=>{
 const header={settled:false,busy:true,generating:true},stage=harness({native:true,header});
 const result=await stage.route('mvu',{view:'stage'});assert.equal(result.writable,false);assert.equal(result.readOnly,true);assert.equal(stage.counts.setVariables,0);
 const write=harness({native:true,header});await assert.rejects(write.route('heal',{turn:write.base.turn,textVersion:write.base.textVersion}),error=>error.code==='TURN_BUSY');assert.equal(write.counts.setVariables,0);
});

test('stale context turn material is never written under the current header version',async()=>{
 const h=harness({native:true,contextTextVersion:'old-fixture-version'});
 await assert.rejects(h.route('heal',{turn:h.base.turn,textVersion:h.base.textVersion}),error=>error.code==='TURN_UNAVAILABLE');
 assert.equal(h.counts.getTurnContext,0);assert.equal(h.counts.getTurn,1);assert.equal(h.counts.setVariables,0);
 const read=harness({native:true,contextTextVersion:'old-fixture-version'}),result=await read.route('mvu',{view:'stage'});
 assert.equal(result.readOnly,true);assert.equal(result.writable,false);assert.equal(read.counts.setVariables,0);
});
