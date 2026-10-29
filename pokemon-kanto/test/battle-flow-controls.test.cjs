'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {KantoGame}=require('../engine.cjs');
const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
function extract(name){
 const start=app.indexOf(`function ${name}(`);assert.notEqual(start,-1);const end=app.indexOf('\n  }',start);assert.ok(end>start);
 return (app.slice(Math.max(0,start-6),start)==='async '?'async ':'')+app.slice(start,end+4);
}
const protectHelpers = app.match(/  const protectTimers = .*\r?\n  function clearProtectTimer\(side\) \{[^\n]+\}/)[0];
function sprite(){const values=new Set();return{classList:{add:(...keys)=>keys.forEach(key=>values.add(key)),remove:(...keys)=>keys.forEach(key=>values.delete(key)),toggle:(key,on)=>{if(on)values.add(key);else values.delete(key);}},style:{removeProperty(){}},values};}
test('skip releases presentation waits without performing or cancelling a battle action',async()=>{
 const timers=new Map(),pending=new Set(),state={presenting:true,animationSpeed:1,presentationSerial:2};let n=0;
 const sprites=[sprite(),sprite()],button={disabled:false};
 const context={state,presentationWaiters:pending,setTimeout:fn=>{timers.set(++n,fn);return n;},clearTimeout:id=>timers.delete(id),clearBattleCinematic(){},clearShinyEntries(){},clearFxEffects(){},els:{effectLayer:{replaceChildren(){}}},spriteFor:side=>sprites[side==='player'?0:1],$:()=>button};
 vm.runInNewContext(`${extract('wait')}\n${extract('skipBattlePresentation')}\nglobalThis.pause=wait;globalThis.skip=skipBattlePresentation;`,context);
 const a=context.pause(700),b=context.pause(600);assert.equal(timers.size,2);
 context.skip();await Promise.all([a,b]);
 assert.equal(timers.size,0);assert.equal(pending.size,0);assert.equal(state.fastForward,true);assert.equal(state.presentationSerial,3);
 await context.pause(800);assert.equal(timers.size,0,'all remaining presentation delays finish immediately');
 assert.equal(button.disabled,true);
});
test('skipping an in-progress capture preserves every remaining battle log row and ends presentation cleanly',async()=>{
 const timers=new Map(),pending=new Set(),state={presenting:false,animationSpeed:1,eventBattleId:'saved-battle',eventLog:[],boosts:{player:{},foe:{}}};let n=0;
 const sprites=[sprite(),sprite()],button={hidden:true},logs=[];
 const context={state,presentationWaiters:pending,setTimeout:fn=>{timers.set(++n,fn);return n;},clearTimeout:id=>timers.delete(id),clearBattleCinematic(){},clearShinyEntries(){},clearFxEffects(){},els:{effectLayer:{replaceChildren(){}},stage:sprite(),counter:{}},spriteFor:side=>sprites[side==='player'?0:1],$:()=>button,
  window:{KantoAudio:{event(){}}},protocol:line=>line.split('|'),actorSide:value=>String(value||'').startsWith('p2')?'foe':'player',formatEvent:line=>line,setMessage(){},recordEvent:line=>logs.push(line),emitConfirmedMoveCue(){},confirmedMoveCue(){},heldItemCue(){return null;},choiceBandLockMessage(){return null;},applyHpEvent(){},tacticalStates:{player:new Set(),foe:new Set()},renderBoosts(){},
 };
 vm.runInNewContext(`${protectHelpers}\n${extract('wait')}\n${extract('skipBattlePresentation')}\n${extract('processEvents')}\nasync function animateCapture(){await wait(800);}\nglobalThis.run=processEvents;globalThis.skip=skipBattlePresentation;`,context);
 const lines=['|capture|p2a:波波|3','|-damage|p1a:皮卡丘|12/30','|-status|p1a:皮卡丘|brn','|turn|3'];
 const done=context.run(lines,{id:'saved-battle'});assert.equal(timers.size,1);
 context.skip();await done;
 assert.deepEqual(logs,lines);assert.equal(state.presenting,false);assert.equal(state.fastForward,false);assert.equal(button.hidden,true);assert.equal(pending.size,0);
});
test('real battle snapshot restores Substitute and Reflect after a view reload',()=>{
 const game=new KantoGame(),start=game.start({mode:'wild',seed:[8,9,10,11],team:[{id:122,level:40,moves:['reflect','substitute','psychic']}],opponent:[{id:16,level:5,moves:['tackle']}]});
 game.act({battleId:start.id,choice:'move 1'});const next=game.act({battleId:start.id,choice:'move 2'});
 assert.ok(next.sides[0].conditions.includes('reflect'));assert.ok(next.sides[0].team.find(mon=>mon.active).volatiles.includes('substitute'));
 const sprites=[sprite(),sprite()],panel={},context={clearTimeout,tacticalStates:{player:new Set(),foe:new Set()},activeMon:side=>side.team.find(mon=>mon.active),spriteFor:side=>sprites[side==='player'?0:1],$:()=>panel};
 vm.runInNewContext(`${protectHelpers}\n${extract('syncTacticalSnapshot')}\nglobalThis.sync=syncTacticalSnapshot;`,context);context.sync(next);
 assert.ok(context.tacticalStates.player.has('substitute'));assert.ok(sprites[0].values.has('volatile-substitute'));assert.match(panel.textContent,/我方 · 反射壁/);
 next.sides[0].conditions=[];next.sides[0].team.find(mon=>mon.active).volatiles=[];context.sync(next);
 assert.equal(context.tacticalStates.player.size,0);assert.equal(sprites[0].values.has('volatile-substitute'),false);assert.equal(panel.hidden,true);
});
