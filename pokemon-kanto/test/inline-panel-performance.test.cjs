'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('inline MVU card avoids global stream-token subscriptions and coalesces unchanged snapshots',()=>{
 const card=JSON.parse(fs.readFileSync(new URL('../../card-source/card.json','file:///'+__filename.replace(/\\/g,'/')),'utf8'));
 const html=card.data.extensions.regex_scripts.find(script=>script.scriptName==='MVU 状态视图').replaceString;
 assert.doesNotMatch(html,/Object\.values\(tavern_events\)/);
 assert.match(html,/VARIABLE_UPDATE_ENDED/);assert.match(html,/signature===lastSignature/);
 const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];assert.doesNotThrow(()=>new vm.Script(js));
});
