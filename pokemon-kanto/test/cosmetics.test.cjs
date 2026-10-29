'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const cosmetics=require('../cosmetics.cjs');
const mvu=require('../mvu.cjs');
const questCatalog=require('../public/data/deep-quests.json');
const rocketEvents=require('../public/data/rocket-boss-events.json').events;
const tileCatalog=require('../tile-world-data.json');
const bossProfiles=require('../boss-profiles.cjs');

function world(){return {训练家:{金钱:6000,徽章:[]},队伍:[{uid:'starter',图鉴编号:1,昵称:'妙蛙种子'},{uid:'pika',图鉴编号:25,昵称:'皮卡丘'}],电脑:[],剧情:{已完成支线对战:[]},委托:{记录:{},探访地点:[]},统计:{成就:[]},城市设施:{gameCorner:{coinCase:true,coins:1000}}};}

test('160 cosmetics retain legacy IDs, eight themes and 40 implemented pixel recipes',()=>{
  const all=cosmetics.definitions(),directory=cosmetics.particleDirectory();assert.equal(all.length,192);assert.ok(new Set(all.map(item=>item.effect.geometry)).size>=25,'legacy geometry semantics stay available alongside particle rendering');
  assert.deepEqual(all.slice(0,100).map(item=>item.id),Array.from({length:100},(_,i)=>`kfx-${String(i+1).padStart(3,'0')}`));
  assert.equal(directory.length,41);assert.ok(directory.every(item=>item.implemented));assert.equal(new Set(directory.map(item=>item.key)).size,41);
  assert.equal(new Set(all.slice(0,160).map(item=>item.effect.particleId)).size,41);assert.ok(all.slice(0,160).every(item=>directory.some(entry=>entry.key===item.effect.particleId)), 'every legacy cosmetic routes through a registered recipe');
  assert.deepEqual(new Set(all.map(item=>item.effect.family)),new Set(['fire','water','leaf','electric','ice','ghost','starlight','dust']));
  for(const theme of ['fire','water','leaf','electric','ice','ghost','starlight','dust']){const rows=all.slice(100).filter(item=>item.effect.family===theme);assert.deepEqual(new Set(rows.map(item=>item.slot)),new Set(['aura','entry','move','outcome']),`${theme} spans every cosmetic slot`);assert.ok(new Set(rows.map(item=>item.effect.geometry)).size>=4,`${theme} has several morphology variants`);assert.equal(new Set(rows.map(item=>item.effect.trajectory.type)).size,4,`${theme} has four motion routes`);}
  assert.equal(all.find(item=>item.id==='kfx-017').unlock.kind,'trust','a representative companion effect now follows real bond progression');
  assert.deepEqual(all.filter(item=>['kfx-001','kfx-026','kfx-076','kfx-091'].includes(item.id)).map(item=>[item.id,item.unlock]),[
    ['kfx-001',{kind:'badge',count:0}],['kfx-026',{kind:'quest',id:'hiker-mtmoon-footprints',exact:true,count:1}],['kfx-076',{kind:'scene',id:'MAP_CELADON_CITY',count:1}],['kfx-091',{kind:'achievement',id:'kanto-champion'}]
  ]);
  assert.deepEqual(new Set(all.map(item=>item.effect.trajectory.type)),new Set(['orbit','spiral','ballistic','wave']));
  for(const item of all){assert.ok(item.effect.particleCount<=96);assert.ok(item.effect.layers>=2);assert.ok(item.effect.colors.length>=3);assert.ok(item.effect.rarity);assert.match(item.description,/原创像素|限外观展示|仅改变舞台外观/);assert.equal(item.stats,undefined,'catalogued effects carry no battle-stat modifiers');}
  const legacy=world();legacy.外观={版本:1,已拥有:['kfx-001','kfx-076'],已装备:{全局:{},伙伴:{}},首领胜利:[]};cosmetics.ensure(legacy);assert.deepEqual(legacy.外观.已拥有,['kfx-001','kfx-076']);cosmetics.validate(legacy);
});

test('catalog previews are free, while acquire and equip are server-validated and scoped per partner UID',()=>{
  let w=world();cosmetics.ensure(w);const first=cosmetics.definitions().find(row=>!row.retired&&row.unlock.kind==='badge'&&row.unlock.count===0);
  const before=cosmetics.view(w);assert.equal(before.catalog.length,cosmetics.definitions().filter(row=>!row.retired).length);assert.equal(before.party.length,2);assert.deepEqual(w.外观.已拥有,[],'view does not mutate the caller world');
  w=cosmetics.apply(w,'cosmetic-acquire',{id:first.id},{storyTurn:1});assert.ok(w.外观.已拥有.includes(first.id));
  w=cosmetics.apply(w,'cosmetic-equip',{id:first.id,uid:'starter'});assert.equal(w.外观.已装备.伙伴.starter[first.slot],first.id);
  assert.equal(w.外观.已装备.全局[first.slot],undefined);
  assert.throws(()=>cosmetics.apply(w,'cosmetic-equip',{id:first.id,uid:'missing'}),/伙伴/);
  assert.throws(()=>cosmetics.apply(w,'cosmetic-acquire',{id:first.id}),/已经拥有/);
  cosmetics.validate(w);
});

test('catalog unlock references resolve to real Kanto bosses, deep quests and hidden-item maps',()=>{
  const bossIds=new Set(bossProfiles.definitions().map(boss=>boss.id)),questIds=new Set(questCatalog.map(quest=>quest.id));
  const hiddenMaps=new Set(tileCatalog.maps.filter(map=>map.hiddenItems.some(item=>item.access!=='no-open-adjacent-tile')).map(map=>map.id));
  const all=cosmetics.definitions();
  for(const item of all){if(item.unlock.kind==='boss')assert.ok(bossIds.has(item.unlock.id),`${item.id} has a real boss`);if(item.unlock.kind==='quest')assert.ok(questIds.has(item.unlock.id),`${item.id} has a real deep quest`);if(item.unlock.kind==='scene')assert.ok(hiddenMaps.has(item.unlock.id),`${item.id} has a visitable hidden-item map`);}
});

test('real quest, macro/tile scene visit, trust, achievement, boss, money and Game Corner routes are enforced',()=>{
  const all=cosmetics.definitions().filter(item=>!item.retired),find=kind=>all.find(item=>item.unlock.kind===kind);
  let w=world(),badge=find('badge');assert.equal(cosmetics.view(w).catalog.find(item=>item.id===badge.id).unlockReason,'');
  const quest=find('quest');assert.match(cosmetics.view(w).catalog.find(item=>item.id===quest.id).unlockReason,/深度委托/);
  w.委托.深度记录={[quest.unlock.id]:{status:'completed'}};assert.equal(cosmetics.view(w).catalog.find(item=>item.id===quest.id).unlockReason,'');
  const scene=all.find(item=>item.unlock.kind==='scene'&&!item.unlock.exact);assert.match(cosmetics.view(w).catalog.find(item=>item.id===scene.id).unlockReason,/探索/);
  w.委托.探访地点=['celadon'];assert.equal(cosmetics.view(w).catalog.find(item=>item.id==='kfx-077').unlockReason,'','a macro map visit resolves the legacy MAP_ scene ID without tile-world progress');
  w.委托.探访地点=[];
  w.剧情.场地服务={claimed:{'leftovers:route12':true,'leftovers:route16':true,soothebell:true,machobrace:true}};
  assert.ok(all.filter(item=>item.unlock.kind==='scene'&&Number(item.id.slice(4))>=76&&Number(item.id.slice(4))<=90).every(item=>cosmetics.view(w).catalog.find(row=>row.id===item.id).unlockReason===''),'macro Itemfinder venue claims release every legacy scene reward without tile-world progress');
  w.剧情.场地服务={claimed:{}};
  w.tileWorld={visited:Object.fromEntries(tileCatalog.maps.filter(map=>map.hiddenItems.some(item=>item.access!=='no-open-adjacent-tile')).slice(0,8).map(map=>[map.id,true])),collected:{}};assert.equal(cosmetics.view(w).catalog.find(item=>item.id===scene.id).unlockReason,'');
  const achievement=all.find(item=>item.unlock.kind==='achievement');assert.match(cosmetics.view(w).catalog.find(item=>item.id===achievement.id).unlockReason,/达成/);
  const achievementStates={
    'kanto-champion':()=>{w.剧情.联盟进度=5;},
    'rocket-network-broken':()=>{w.剧情.火箭队剧情={progress:Object.fromEntries(rocketEvents.map(event=>[event.id,{complete:true}]))};},
    'hidden-sites-8':()=>{w.剧情.场地服务={claimed:{'leftovers:route12':true,'leftovers:route16':true,soothebell:true,machobrace:true}};},
    'deep-quest-3':()=>{w.委托.深度记录=Object.fromEntries(questCatalog.slice(0,3).map(row=>[row.id,{status:'completed'}]));},
    'perfect-teamwork':()=>{w.羁绊={伙伴:{starter:{信赖:100}}};}
  };
  for(const id of new Set(all.filter(item=>item.unlock.kind==='achievement').map(item=>item.unlock.id))){w=world();achievementStates[id]();const item=all.find(row=>row.unlock.kind==='achievement'&&row.unlock.id===id);assert.equal(cosmetics.view(w).catalog.find(row=>row.id===item.id).unlockReason,'',`${id} uses a real completion state`);}
  const trust=all.find(item=>item.unlock.kind==='trust');w=world();assert.match(cosmetics.view(w).catalog.find(item=>item.id===trust.id).unlockReason,/信赖/);w.羁绊={伙伴:{starter:{信赖:100}}};assert.equal(cosmetics.view(w).catalog.find(item=>item.id===trust.id).unlockReason,'');
  w=world();w.tileWorld={visited:Object.fromEntries(tileCatalog.maps.filter(map=>map.hiddenItems.some(item=>item.access!=='no-open-adjacent-tile')).slice(0,2).map(map=>[map.id,true])),collected:{}};
  const boss=find('boss');assert.match(cosmetics.view(w).catalog.find(item=>item.id===boss.id).unlockReason,/战胜首领/);
  w=cosmetics.onBattleResult(w,{encounterId:boss.unlock.id,result:'win'});assert.ok(w.外观.首领胜利.includes(boss.unlock.id));assert.ok(w.外观.已拥有.includes(boss.id));
  const coin=all.find(item=>item.cost.coins);w.城市设施.gameCorner.coins=coin.cost.coins-1;assert.match(cosmetics.view(w).catalog.find(item=>item.id===coin.id).costReason,/代币/);
  w.城市设施.gameCorner.coins=coin.cost.coins;const coins=w.城市设施.gameCorner.coins;w=cosmetics.apply(w,'cosmetic-acquire',{id:coin.id});assert.equal(w.城市设施.gameCorner.coins,coins-coin.cost.coins);
  const paid=all.find(item=>item.cost.money>0);w.训练家.金钱=paid.cost.money;const yen=w.训练家.金钱;w=cosmetics.apply(w,'cosmetic-acquire',{id:paid.id});assert.equal(w.训练家.金钱,yen-paid.cost.money);
  cosmetics.validate(w);
});

test('all 160 rewards can be acquired from macro-only maximum progression state',()=>{
  let w=world();const all=cosmetics.definitions().slice(0,160).filter(row=>!row.retired);
  w.训练家.徽章=['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章','深红徽章','绿色徽章'];
  w.训练家.金钱=100000;w.城市设施.gameCorner.coins=100000;
  w.委托.深度记录=Object.fromEntries(questCatalog.map(quest=>[quest.id,{status:'completed'}]));
  w.委托.探访地点=['celadon','cerulean','cerulean-cave','viridian','viridian-forest','pewter','lavender','fuchsia','saffron','cinnabar','mt-moon','pokemon-tower','safari','seafoam','power-plant','victory-road',...Array.from({length:25},(_,i)=>`route${i+1}`)];
  w.剧情.场地服务={claimed:{'leftovers:route12':true,'leftovers:route16':true,soothebell:true,machobrace:true}};
  w.剧情={联盟进度:5,火箭队剧情:{progress:Object.fromEntries(rocketEvents.map(event=>[event.id,{complete:true}]))}};w.剧情.关都事件={进度:Object.fromEntries(require('../public/data/kanto-story-events.json').map(event=>[event.id,{完成:true,阶段:event.stages.at(-1).id}]))};
  w.剧情.场地服务={claimed:{'leftovers:route12':true,'leftovers:route16':true,soothebell:true,machobrace:true}};
  w.羁绊={伙伴:{starter:{信赖:100}}};
  for(const bossId of new Set(all.filter(item=>item.unlock.kind==='boss').map(item=>item.unlock.id)))cosmetics.onBattleResult(w,{encounterId:bossId,result:'win'});
  const catalog=cosmetics.view(w).catalog.filter(item=>item.unlock.kind!=='hell-first-win');
  assert.ok(catalog.every(item=>item.unlockReason===''),catalog.filter(item=>item.unlockReason).map(item=>`${item.id}: ${item.unlockReason}`).join('\n'));
  for(const item of all)if(!w.外观.已拥有.includes(item.id))w=cosmetics.apply(w,'cosmetic-acquire',{id:item.id});
  assert.equal(w.外观.已拥有.length,all.length);cosmetics.validate(w);
});

test('only won authored boss encounters grant victory unlocks and cosmetics never alter party stats',()=>{
  const w=world(),before=structuredClone(w.队伍);cosmetics.onBattleResult(w,{encounterId:'apollo',result:'loss'});assert.deepEqual(w.外观.首领胜利,[]);
  cosmetics.onBattleResult(w,{encounterId:'apollo',result:'win'});assert.ok(w.外观.首领胜利.includes('apollo'));assert.deepEqual(w.队伍,before);
  const equip=cosmetics.definitions().find(item=>item.id===w.外观.已拥有.at(-1));assert.ok(equip);assert.equal(equip.stats,undefined);
});

test('cosmetic acquisition, currency spend and UID equipment operate on a real initialized MVU world',()=>{
  let variables=mvu.chooseStarter(mvu.createInitialMvu(),1),w=variables.stat_data.宝可梦;
  w.战斗.状态='finished';
  const before=structuredClone(w.队伍.map(mon=>({uid:mon.uid,hp:mon.当前HP,stats:mon.能力值,items:mon.携带道具})));
  const item=cosmetics.definitions().find(entry=>!entry.retired&&entry.unlock.kind==='badge'&&entry.unlock.count===0&&entry.cost.money>0);
  const money=w.训练家.金钱;w=cosmetics.apply(w,'cosmetic-acquire',{id:item.id},{storyTurn:w.地图.轮次||1});assert.equal(w.训练家.金钱,money-item.cost.money);
  w=cosmetics.apply(w,'cosmetic-equip',{id:item.id,uid:'starter'});assert.equal(w.外观.已装备.伙伴.starter[item.slot],item.id);
  assert.deepEqual(w.队伍.map(mon=>({uid:mon.uid,hp:mon.当前HP,stats:mon.能力值,items:mon.携带道具})),before,'cosmetics do not change battle data');
  variables.stat_data.宝可梦=w;assert.equal(mvu.validateMvu(variables),true);
});
