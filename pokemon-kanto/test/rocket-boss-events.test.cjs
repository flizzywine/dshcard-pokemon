'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const events=require('../rocket-boss-events.cjs');
const profiles=require('../boss-profiles.cjs');
const map=require('../public/data/map.json');

function world(node='celadon',badges=3){return {地图:{节点:node,轮次:9},训练家:{徽章:Array.from({length:badges},(_,i)=>`badge-${i}`)},队伍:[{uid:'starter',图鉴编号:1,等级:14}],战斗:{状态:'finished'},剧情:{初始御三家已选:true}};}
function choose(w,eventId,choiceId){return events.apply(w,'rocket-story-choice',{eventId,choiceId},{storyTurn:10});}

test('Rocket arcs use existing map nodes and require discovery, a real profile-backed win, and a consequence choice',()=>{
  const view=events.view(world());assert.equal(view.length,5);for(const row of view){assert.ok(map.some(node=>node.id===row.node));assert.ok(row.stage.id==='discovery');assert.ok(row.choices.length>=2);assert.ok(profiles.definitions().some(boss=>boss.id===row.bossId));}
  let w=world();w=choose(w,'rocket-celadon-ledger','copy-ledger');assert.equal(w.剧情.火箭队剧情.flags.rocketLedgerCopy,true);
  assert.throws(()=>choose(w,'rocket-celadon-ledger','publish-route'),/阶段需要通过首领对战/);
  const started=events.startBattle(w,'rocket-celadon-ledger',{tier:'original',partyLevel:14,storyTurn:11});w=started.world;
  assert.equal(started.encounter.bossProfileId,'apollo');assert.equal(started.encounter.队伍.length,3);assert.equal(w.剧情.火箭队剧情.progress['rocket-celadon-ledger'].won,undefined);
  const forged=structuredClone(started.encounter);forged.队伍.pop();
  events.onBattleResult(structuredClone(w),{eventId:'rocket-celadon-ledger',result:'win',storyTurn:12,encounter:forged});assert.equal(w.剧情.火箭队剧情.progress['rocket-celadon-ledger'].won,undefined,'a mismatched team is not accepted as victory evidence');
  const edited=structuredClone(started.encounter);edited.队伍[0].招式[0]='thunderbolt';
  const unverified=events.onBattleResult(structuredClone(w),{eventId:'rocket-celadon-ledger',result:'win',storyTurn:12,encounter:edited});assert.equal(unverified.剧情.火箭队剧情.progress['rocket-celadon-ledger'].won,undefined,'an altered team cannot use a claimed victory to advance the story');
  assert.throws(()=>choose(unverified,'rocket-celadon-ledger','publish-route'),/阶段需要通过首领对战/);
  w=events.onBattleResult(w,{eventId:'rocket-celadon-ledger',result:'win',storyTurn:12,encounter:started.encounter});assert.equal(w.剧情.火箭队剧情.progress['rocket-celadon-ledger'].stage,'resolution');
  assert.equal(w.剧情.火箭队剧情.progress['rocket-celadon-ledger'].complete,undefined);
  w=choose(w,'rocket-celadon-ledger','publish-route');assert.equal(w.剧情.火箭队剧情.progress['rocket-celadon-ledger'].complete,true);assert.equal(w.剧情.火箭队剧情.flags.rocketLedgerPublished,true);
  assert.equal(events.view(w).find(item=>item.id==='rocket-celadon-ledger').status,'complete');events.validate(w);
});

test('Rocket rematches are gated by badges and evidence; losses can retry but do not advance',()=>{
  let w=world('saffron',4);assert.match(events.options(w).find(item=>item.id==='rocket-silph-rescue').reason,/rocketLedgerCopy/);
  w.剧情.火箭队剧情={version:1,progress:{},flags:{rocketLedgerCopy:true},records:[]};w=choose(w,'rocket-silph-rescue','secure-records');
  let started=events.startBattle(w,'rocket-silph-rescue',{tier:'enhanced',storyTurn:11});w=started.world;
  w=events.onBattleResult(w,{eventId:'rocket-silph-rescue',result:'loss',storyTurn:12,encounter:started.encounter});assert.equal(w.剧情.火箭队剧情.progress['rocket-silph-rescue'].stage,'battle');assert.equal(w.剧情.火箭队剧情.progress['rocket-silph-rescue'].won,undefined);
  started=events.startBattle(w,'rocket-silph-rescue',{tier:'enhanced',storyTurn:13});w=started.world;
  w=events.onBattleResult(w,{eventId:'rocket-silph-rescue',result:'win',storyTurn:14,encounter:started.encounter});w=choose(w,'rocket-silph-rescue','protect-addresses');
  assert.equal(w.剧情.火箭队剧情.flags.silphNamesSealed,true);assert.equal(w.剧情.火箭队剧情.flags.rocketSilphChainSecured,true);events.validate(w);
  assert.throws(()=>events.startBattle(world('viridian',7),'rocket-viridian-finale',{storyTurn:1}),/8枚徽章/);
});

test('winning each executive does not set rescue or evidence consequences until the follow-up choice',()=>{
  for(const [id,node,boss,flags,choice,outcome]of [
    ['rocket-silph-rescue','saffron','athena',{rocketLedgerCopy:true},'finish-evacuation','silphRescueVerified'],
    ['rocket-transit-manifest','fuchsia','lambda',{rocketLedgerCopy:true},'shelter-partner','rocketPartnerSheltered'],
    ['rocket-power-plant-intercept','power-plant','lance_rocket',{rocketLedgerCopy:true},'restore-power','powerPlantRestored'],
    ['rocket-viridian-finale','viridian','rocket_viridian',{rocketLedgerCopy:true},'publish-network','rocketNetworkBroken']
  ]){
    let w=world(node,8);w.剧情.火箭队剧情={version:1,progress:{},flags,records:[]};
    w=choose(w,id,events.EVENTS.find(event=>event.id===id).stages[0].choices[0].id);
    const started=events.startBattle(w,id,{tier:'extreme',storyTurn:20});
    assert.equal(started.encounter.bossProfileId,boss);
    w=events.onBattleResult(started.world,{eventId:id,result:'win',storyTurn:21,encounter:started.encounter});
    assert.equal(w.剧情.火箭队剧情.flags[outcome],undefined,'battle victory alone must not manufacture the rescue/evidence outcome');
    const resolution=events.EVENTS.find(event=>event.id===id).stages.find(stage=>stage.id==='resolution');
    const picked=resolution.choices.find(row=>row.id===choice);w=choose(w,id,picked.id);assert.equal(w.剧情.火箭队剧情.flags[outcome],true);events.validate(w);
  }
});
