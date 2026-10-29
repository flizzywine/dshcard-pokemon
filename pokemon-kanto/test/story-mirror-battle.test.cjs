'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const mvu=require('../mvu.cjs');
const runtime=require('../story-runtime.cjs');

test('a narrated mirror battle associates the opposing Pokémon with its trainer',()=>{
 const variables=mvu.createInitialMvu(4),world=variables.stat_data.宝可梦;
 world.剧情.初始御三家已选=true;world.战斗.状态='finished';
 const scene='阿明放出小火龙。\n@bubble:ming|阿明|期待|[你先。]\n小火龙向对手冲去，挡住了攻击。';
 const intent=runtime.naturalTrainerInvitation(variables,'我准备迎战',scene);
 assert.equal(intent?.payload.trainerName,'阿明');
 assert.equal(intent?.payload.speciesId,4);
});
