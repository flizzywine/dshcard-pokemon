'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');

const currentRoot=path.resolve(__dirname,'..');
const baselineRoot=process.env.KANTO_ENGINE_BASELINE||'';
const available=Boolean(baselineRoot)&&fs.existsSync(path.join(baselineRoot,'engine.cjs'));
const moveSets={3:['gigadrain','sludgebomb','sleeppowder','leechseed'],6:['flamethrower','wingattack','dragonclaw','slash'],9:['surf','icebeam','bite','protect'],25:['thunderbolt','quickattack','thunderwave','irontail'],65:['psychic','calmmind','recover','thunderpunch'],130:['surf','earthquake','dragondance','return']};
const ids=[3,6,9,25,65,130];
const team=ids.map((id,i)=>({id,moves:moveSets[id],uid:`perf-${i+1}`,name:`对照${i+1}`}));
const input={mode:'practice',difficulty:'normal',level:50,seed:[0x093,0x031,0x0c0,0x25],team,opponent:team.map((mon,i)=>({...mon,uid:`foe-${i+1}`,name:`对手${i+1}`}))};
function timed(fn){const start=performance.now(),value=fn();return {value,ms:performance.now()-start};}
function normalized(snapshot){return {...snapshot,id:'<battle>',bag:Object.fromEntries(Object.entries(snapshot.bag||{}).filter(([,count])=>count!==0))};}
function choosePlayerMove(snapshot){
  if(snapshot.request.forceSwitch){const replacement=snapshot.request.switches.find(mon=>!mon.fainted&&mon.hp>0&&!mon.active);if(replacement)return `switch ${replacement.slot}`;}
  const usable=(snapshot.request.moves||[]).filter(move=>!move.disabled&&move.pp!==0);
  if(!usable.length)return 'move 1';
  usable.sort((a,b)=>(b.power||0)-(a.power||0));
  return `move ${usable[0].slot||snapshot.request.moves.indexOf(usable[0])+1}`;
}
function makeRun(root){const mod=require(path.join(root,'engine.cjs')),ai=require(path.join(root,'opponent-ai.cjs')),game=new mod.KantoGame();return {mod,ai,game,snapshot:game.start(input)};}
function measure(run){
  const record=run.game.battles.get(run.snapshot.id),battle=record.battle;
  let snapshotMs=0,actMs=0,turns=0,last=run.snapshot,trace=[];
  const summaryCount=256,summary=run.game.enemyChoiceCandidates(run.snapshot.id);
  const summaryBatch=timed(()=>{for(let i=0;i<summaryCount;i++)run.game.enemyChoiceCandidates(run.snapshot.id);});
  const choiceCount=512,openingChoice=run.ai.chooseEnemyChoice(battle,{difficulty:'normal',rng:()=>0.5});
  const aiBatch=timed(()=>{for(let i=0;i<choiceCount;i++)run.ai.chooseEnemyChoice(battle,{difficulty:'normal',rng:()=>0.5});});
  while(!last.ended&&turns<160){
    const before=run.game.battles.get(run.snapshot.id).battle;
    const choice=choosePlayerMove(last);
    const t=timed(()=>run.game.act({battleId:run.snapshot.id,choice}));last=t.value;actMs+=t.ms;turns++;
    trace.push({choice,snapshot:normalized(last)});
    if(last.ended)break;
    if(!before||!last.request)break;
  }
  const serialization=battle.toJSON(),encoded=JSON.stringify(serialization),savedCursor=record.cursor;
  record.cursor=0;for(let i=0;i<24;i++){record.cursor=0;snapshotMs+=timed(()=>run.game.snapshot(record)).ms;}record.cursor=savedCursor;
  const toJson=Array.from({length:40},()=>timed(()=>battle.toJSON()).ms);
  const fromJson=Array.from({length:20},()=>timed(()=>run.mod.Battle.fromJSON(serialization)).ms);
  const parsed=JSON.parse(encoded),roundTrip=run.mod.Battle.fromJSON(parsed);
  assert.deepEqual(roundTrip.log,battle.log,'Showdown JSON restoration preserves the complete event log');
  const restored=run.game.snapshot({...record,battle:roundTrip,cursor:roundTrip.log.length});
  assert.deepEqual({...normalized(restored),events:[]},{...normalized(last),events:[]},'Showdown JSON restoration preserves the public battle snapshot');roundTrip.destroy();
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kanto-engine-perf-')),file=path.join(dir,'battle.json');
  let ioMs=0;for(let i=0;i<16;i++){const w=timed(()=>fs.writeFileSync(file,encoded));const r=timed(()=>fs.readFileSync(file));ioMs+=w.ms+r.ms;assert.equal(r.value.length,Buffer.byteLength(encoded));}
  fs.rmSync(dir,{recursive:true,force:true});
  return {trace,turns,ended:last.ended,openingChoice,summary,summaryMs:summaryBatch.ms/summaryCount,bytes:Buffer.byteLength(encoded),snapshotMs:snapshotMs/24,opponentChoiceMs:aiBatch.ms/choiceCount,actMsPerTurn:actMs/Math.max(1,turns),toJSONMs:toJson.reduce((a,b)=>a+b,0)/toJson.length,fromJSONMs:fromJson.reduce((a,b)=>a+b,0)/fromJson.length,jsonEncodeMs:Array.from({length:40},()=>timed(()=>JSON.stringify(serialization)).ms).reduce((a,b)=>a+b,0)/40,fileReadWriteMs:ioMs/32};
}
function median(rows){const keys=['turns','bytes','actMsPerTurn','snapshotMs','opponentChoiceMs','summaryMs','toJSONMs','fromJSONMs','jsonEncodeMs','fileReadWriteMs'];return Object.fromEntries(keys.map(key=>{const values=rows.map(row=>row[key]).sort((a,b)=>a-b),middle=Math.floor(values.length/2);return [key,values.length%2?values[middle]:(values[middle-1]+values[middle])/2];}));}

test('fixed-seed 6v6 single battle is behavior-identical to the installed baseline and reports CPU/IO costs', {skip:!available},()=>{
  const old=makeRun(baselineRoot),fresh=makeRun(currentRoot);
  assert.deepEqual(normalized(fresh.snapshot),normalized(old.snapshot),'opening snapshots must match');
  const currentTrace=measure(fresh),baselineTrace=measure(old);
  assert.deepEqual(currentTrace.trace,baselineTrace.trace,'every action snapshot and event must remain identical');
  assert.deepEqual(currentTrace.openingChoice,baselineTrace.openingChoice,'opponent choice and AI diagnostics must remain identical');
  assert.deepEqual(currentTrace.summary,baselineTrace.summary,'opponent candidate summary remains identical');
  assert.equal(currentTrace.ended,true,'the current 6v6 battle completed');assert.equal(baselineTrace.ended,true,'the installed 6v6 battle completed');
  measure(makeRun(baselineRoot));measure(makeRun(currentRoot));
  const baselineRows=[],currentRows=[];
  for(let i=0;i<6;i++){
    if(i%2){currentRows.push(measure(makeRun(currentRoot)));baselineRows.push(measure(makeRun(baselineRoot)));}
    else{baselineRows.push(measure(makeRun(baselineRoot)));currentRows.push(measure(makeRun(currentRoot)));}
  }
  const baselineResult=median(baselineRows),currentResult=median(currentRows);
  assert.equal(currentResult.turns,baselineResult.turns);
  console.log('\nKanto 6v6 benchmark (ms/op; IO is synchronous temp-file read+write):');
  for(const key of ['turns','bytes','actMsPerTurn','snapshotMs','opponentChoiceMs','summaryMs','toJSONMs','fromJSONMs','jsonEncodeMs','fileReadWriteMs'])console.log(`${key.padEnd(20)} baseline=${baselineResult[key]} current=${currentResult[key]}`);
});
