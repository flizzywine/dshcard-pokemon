'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const mvu=require('../mvu.cjs');
const runtime=require('../story-runtime.cjs');

function variablesAt(node,badges=[]){
 const variables=mvu.createInitialMvu(1),world=variables.stat_data.宝可梦;
 world.剧情.初始御三家已选=true;
 world.遭遇=null;
 world.战斗={轮次:0,状态:'finished',结果:'',摘要:'',操作序号:0};
 world.地图.节点=node;
 world.地图.地点={ 'route1':'1号道路','victory-road':'冠军之路' }[node]||node;
 world.训练家.徽章=[...badges];
 mvu.validateMvu(variables);
 return variables;
}

test('a non-adjacent natural destination settles through every legal map hop and retains the user input',()=>{
 const input='我想从1号道路一路前往尼比市';
 const settled=runtime.finishStoryAction(variablesAt('route1'),input,2);
 const world=settled.stat_data.宝可梦;
 assert.equal(world.地图.节点,'pewter');
 assert.deepEqual(world.剧情.最近行动,{action:'travel',turn:2,text:input});
 assert.equal(world.剧情.行动提示,'');
});

test('travel cannot bypass badge, field-move, or item gates and reports the actual blocked route',()=>{
 const badges=['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章','深红徽章'];
 const start=variablesAt('victory-road',badges),before=structuredClone(start.stat_data.宝可梦.地图);
 const settled=runtime.finishStoryAction(start,'我前往石英高原',2);
 const world=settled.stat_data.宝可梦;
 assert.deepEqual(world.地图,before,'a failed route leaves all map state untouched');
 assert.match(world.剧情.行动提示,/徽章|道路|不能通行/);
});

test('a trainer invitation creates a real pending trainer battle at the current route',()=>{
 const variables=variablesAt('viridian-forest');
 const settled=runtime.finishStoryAction(variables,'我想和捕虫少年切磋',2);
 const world=settled.stat_data.宝可梦;
 assert.equal(world.战斗.状态,'pending');
 assert.equal(world.遭遇.类型,'trainer');
 assert.match(world.遭遇.训练家,/捕虫少年/);
 assert.equal(world.剧情.最近行动.text,'我想和捕虫少年切磋');
});

test('a specifically requested ordinary Pokémon stays selected even outside the random encounter table',()=>{
 const settled=runtime.finishStoryAction(variablesAt('route2'),'我想在草丛遇见皮卡丘',2),world=settled.stat_data.宝可梦;
 assert.equal(world.遭遇.类型,'wild');assert.equal(world.遭遇.队伍[0].图鉴编号,25);
 assert.equal(world.遭遇.方法,'story');assert.equal(world.遭遇.来源地图,'route2');assert.equal(world.战斗.状态,'pending');
});

test('one natural sentence travels first and then starts the named species encounter',()=>{
 const input='我带着伙伴去常青森林遇到皮卡丘',settled=runtime.finishStoryAction(variablesAt('route1'),input,2),world=settled.stat_data.宝可梦;
 assert.equal(world.地图.节点,'viridian-forest');assert.equal(world.遭遇.队伍[0].图鉴编号,25);
 assert.equal(world.战斗.状态,'pending');assert.deepEqual(world.剧情.最近行动,{action:'wild',turn:2,text:input});
});

test('a failed later step rolls back the whole natural-language action sequence and shows a hint',()=>{
 const original=variablesAt('route1'),settled=runtime.finishStoryAction(original,'我先去石英高原然后遇到皮卡丘',2),world=settled.stat_data.宝可梦;
 assert.equal(world.地图.节点,'route1');assert.equal(world.战斗.状态,'finished');assert.equal(world.遭遇,null);
 assert.match(world.剧情.行动提示,/徽章|道路|不能通行/);
 assert.equal(original.stat_data.宝可梦.地图.节点,'route1','the source snapshot remains untouched');
});

test('a named trainer class can be challenged in town without using the random class name',()=>{
 const settled=runtime.finishStoryAction(variablesAt('pallet'),'我和捕虫少年打一场',2),world=settled.stat_data.宝可梦;
 assert.equal(world.遭遇.类型,'trainer');assert.equal(world.遭遇.训练家,'捕虫少年');
 assert.equal(world.战斗.状态,'pending');
});

test('natural-language item purchases use the local shop and update the shared bag',()=>{
 const start=variablesAt('pallet'),settled=runtime.finishStoryAction(start,'我买一瓶伤药',2),world=settled.stat_data.宝可梦;
 assert.equal(world.背包.物品.potion,start.stat_data.宝可梦.背包.物品.potion+1);
 assert.equal(world.训练家.金钱,start.stat_data.宝可梦.训练家.金钱-300);
});

test('a quantity stated after an item is not silently reduced to one',()=>{
 const start=variablesAt('pallet'),settled=runtime.finishStoryAction(start,'我购买伤药三瓶',2),world=settled.stat_data.宝可梦;
 assert.equal(world.背包.物品.potion,start.stat_data.宝可梦.背包.物品.potion+3);
 assert.equal(world.训练家.金钱,start.stat_data.宝可梦.训练家.金钱-900);
 const parse=require('../story-intents.cjs').parseStoryIntent;
 const {catalog}=require('../engine.cjs'),locations=require('../public/data/map.json');
 assert.equal(parse('购买十二瓶伤药',start.stat_data.宝可梦,{catalog,locations}).payload.count,12);
});

test('battle-marker recovery distinguishes explicit wild species from an NPC trainer challenge',()=>{
 const field=variablesAt('viridian-forest');
 const wildText='野生皮卡丘从蕨叶后跳出来，盯着你的伙伴。\n【进入本轮战斗】';
 const wild=runtime.recoverBattleIntent(field,'我遇到皮卡丘',wildText);
 assert.deepEqual(wild,{type:'wild',action:'wild',payload:{speciesId:25,scripted:true,node:'viridian-forest'}});
 const trainerText='捕虫少年走近你，提出一场切磋。\n【进入本轮战斗】';
 assert.deepEqual(runtime.recoverBattleIntent(field,'我和捕虫少年打一场',trainerText),
  {type:'trainer',action:'trainer-battle',payload:{trainerName:'捕虫少年'}});
 const combined='野生皮卡丘跳出草丛，捕虫少年向你发起挑战。\n【进入本轮战斗】';
 assert.equal(runtime.narrativeEncounter(field,'我遇到皮卡丘并接受捕虫少年挑战',combined).type,'wild','the explicit wild Pokémon retains priority over an NPC challenge');
});

test('Leaf invitation requires current explicit facts and creates her stated opening partner only on action',()=>{
 const start=variablesAt('pallet'),world=start.stat_data.宝可梦;
 const text='叶子脚边的妙蛙种子抬起头。叶子笑着说：“来吧。真打一个！”';
 const plan=runtime.naturalTrainerInvitation(start,'我和叶子聊聊',text);
 assert.deepEqual(plan,{action:'narrative-trainer',payload:{trainerName:'叶子',speciesId:1}});
 const next=runtime.applyAction(start,plan.action,plan.payload,3).stat_data.宝可梦;
 assert.equal(next.遭遇.训练家,'叶子');assert.equal(next.遭遇.队伍[0].图鉴编号,1);assert.equal(next.遭遇.队伍.length,1);
 assert.equal(world.战斗.状态,'finished');
 for(const bad of ['叶子脚边的妙蛙种子抬头。她回忆起上次，“来吧。真打一个！”','叶子脚边的妙蛙种子抬头。她说：“不要打，来吧。真打一个！”'])assert.equal(runtime.naturalTrainerInvitation(start,'我聊聊',bad),null);
 const active=structuredClone(start);active.stat_data.宝可梦.战斗.状态='active';assert.equal(runtime.naturalTrainerInvitation(active,'我聊聊',text),null);
});

test('a named ordinary trainer uses their stated partner or a legal local team',()=>{
 const start=variablesAt('route1');
 const explicit='小明派出皮卡丘。小明说：“跟我来一场对战！”';
 const named=runtime.naturalTrainerInvitation(start,'我继续旅行',explicit);
 assert.deepEqual(named,{action:'narrative-trainer',payload:{trainerName:'小明',speciesId:25}});
 const first=runtime.applyAction(start,named.action,{...named.payload,eventKey:'event-1'},3),w=first.stat_data.宝可梦;
 assert.equal(w.遭遇.训练家,'小明');assert.equal(w.遭遇.队伍[0].图鉴编号,25);
 assert.deepEqual(w.剧情.叙事对战回执,['event-1']);
 const fallback=runtime.naturalTrainerInvitation(start,'我继续旅行','小明说：“跟我来一场对战！”');
 assert.deepEqual(fallback,{action:'narrative-trainer',payload:{trainerName:'小明'}});
 const generated=runtime.applyAction(start,fallback.action,fallback.payload,3).stat_data.宝可梦;
 assert.equal(generated.遭遇.训练家,'小明');assert.ok(generated.遭遇.队伍.length);
 first.stat_data.宝可梦.战斗.状态='finished';
 const second=runtime.naturalTrainerInvitation(first,'我继续旅行','小红说：“和我打一场！”');
 const afterSecond=runtime.applyAction(first,second.action,{...second.payload,eventKey:'event-2'},3).stat_data.宝可梦;
 assert.equal(afterSecond.遭遇.训练家,'小红');assert.deepEqual(afterSecond.剧情.叙事对战回执,['event-1','event-2']);
 assert.equal(runtime.naturalTrainerInvitation(start,'我继续旅行','小明说：“如果你愿意，跟我来一场对战！”'),null);
 assert.equal(runtime.naturalTrainerInvitation(start,'不要战斗',explicit),null);
 assert.equal(runtime.naturalTrainerInvitation(start,'我继续旅行','小明曾经说：“跟我来一场对战！”'),null);
 const pending=structuredClone(start);pending.stat_data.宝可梦.战斗.状态='pending';assert.equal(runtime.naturalTrainerInvitation(pending,'我继续旅行',explicit),null);
});

test('native bubble identifies its actual speaker and exact selected line',()=>{
 const start=variablesAt('route1');
 const text='小明派出皮卡丘。\n@bubble:new-npc|小明|期待|[跟我来一场对战！]\n@bubble:second|小红|高兴|[和我打一场！]';
 assert.deepEqual(runtime.naturalTrainerInvitation(start,'我旅行',text,'跟我来一场对战！'),{action:'narrative-trainer',payload:{trainerName:'小明',speciesId:25}});
 assert.deepEqual(runtime.naturalTrainerInvitation(start,'我旅行',text,'和我打一场！'),{action:'narrative-trainer',payload:{trainerName:'小红'}});
 assert.equal(runtime.naturalTrainerInvitation(start,'我旅行',text,'跟我来一场对战'),null);
 assert.equal(runtime.naturalTrainerInvitation(start,'我旅行',text+'\n@bubble:third|阿明|期待|[跟我来一场对战！]','跟我来一场对战！'),null);
});

test('unrelated memories do not suppress a present invitation and speaker names are escaped',()=>{
 const start=variablesAt('route1');
 const text='昨天你回忆了过去的旅程。\n@bubble:one|阿明.*|期待|[跟我来一场对战！]';
 const plan=runtime.naturalTrainerInvitation(start,'之前不打。现在我准备好了。',text,'跟我来一场对战！');
 assert.equal(plan.payload.trainerName,'阿明.*');
 assert.equal(runtime.applyAction(start,plan.action,plan.payload,3).stat_data.宝可梦.遭遇.训练家,'阿明.*');
 assert.equal(runtime.naturalTrainerInvitation(start,'我准备好了','@bubble:one|阿明|期待|[如果可以，跟我来一场对战！]','如果可以，跟我来一场对战！'),null);
});

test('special characters use their own stage roster when the scene does not name a Pokémon',()=>{
 for(const [name,badges,expected] of [['叶子',0,[1]],['叶子',3,[17,37,2]],['叶子',6,[18,38,134,3]],['小霞',1,[120,121]],['小茂',0,[4]]]){
  const start=variablesAt('pallet',['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章'].slice(0,badges));start.stat_data.宝可梦.剧情.初始御三家编号=1;
  const text=`@bubble:special|${name}|期待|[跟我来一场对战！]`;
  const plan=runtime.naturalTrainerInvitation(start,'我准备好了',text,'跟我来一场对战！');
  const battle=runtime.applyAction(start,plan.action,plan.payload,3).stat_data.宝可梦;
  assert.equal(battle.遭遇.训练家,name);assert.deepEqual(battle.遭遇.队伍.map(mon=>mon.图鉴编号),expected);
  assert.equal(start.stat_data.宝可梦.战斗.状态,'finished');
 }
});

test('battle recovery never replaces an explicitly requested opponent with incidental prose',()=>{
 const field=variablesAt('viridian-forest');
 const conflicting='野生绿毛虫从叶子后出现。\n【进入本轮战斗】';
 assert.equal(runtime.narrativeEncounter(field,'我在草丛遇到皮卡丘',conflicting),null,'conflicting prose is not silently committed');
 assert.deepEqual(runtime.recoverBattleIntent(field,'我在草丛遇到皮卡丘',conflicting),
  {type:'wild',action:'wild',payload:{speciesId:25,scripted:true,start:true}});
 const trainer='一只绿毛虫正吃着叶子，捕虫少年举起球请求切磋。\n【进入本轮战斗】';
 assert.deepEqual(runtime.recoverBattleIntent(field,'我和捕虫少年打一场',trainer),
  {type:'trainer',action:'trainer-battle',payload:{trainerName:'捕虫少年'}});
 assert.equal(runtime.narrativeEncounter(field,'我想遇到超梦',conflicting),null,'a legendary request is never replaced by an ordinary wild species');
});

test('a recovered battle marker can be applied directly and moves to its described habitat first',()=>{
 const start=variablesAt('route2');
 const recovered=runtime.recoverBattleIntent(start,'我去常青森林遇到皮卡丘','我沿着土路再往前走进常青森林。野生皮卡丘从蕨叶后跳出来，盯着你的伙伴。\n【进入本轮战斗】');
 assert.deepEqual(recovered,{type:'wild',action:'wild',payload:{speciesId:25,scripted:true,node:'viridian-forest'}});
 const settled=runtime.applyAction(start,recovered.action,recovered.payload,2),world=settled.stat_data.宝可梦;
 assert.equal(world.地图.节点,'viridian-forest');
 assert.equal(world.遭遇.队伍[0].图鉴编号,25);
 assert.equal(world.遭遇.来源地图,'viridian-forest');
 assert.equal(world.战斗.状态,'pending');
 assert.equal(start.stat_data.宝可梦.地图.节点,'route2','recovery does not mutate the input snapshot');
});

test('applyAction executes recovered ordered sequences and rolls back a bad step',()=>{
 const start=variablesAt('route1'),sequence={actions:[
  {action:'travel',payload:{node:'viridian-forest'}},
  {action:'wild',payload:{speciesId:25,scripted:true}},
 ]};
 const settled=runtime.applyAction(start,'sequence',sequence,2),world=settled.stat_data.宝可梦;
 assert.equal(world.地图.节点,'viridian-forest');assert.equal(world.遭遇.队伍[0].图鉴编号,25);
 assert.throws(()=>runtime.applyAction(start,'sequence',{actions:[
  {action:'travel',payload:{node:'viridian-forest'}},
  {action:'wild',payload:{speciesId:25,scripted:true,node:'victory-road'}},
 ]},2),/徽章|道路|通行/);
 assert.equal(start.stat_data.宝可梦.地图.节点,'route1');
 assert.equal(start.stat_data.宝可梦.战斗.状态,'finished');
});

test('remembered or reported NPC travel does not move the player',()=>{
 for(const input of ['小刚说去常青市','我回忆起抵达长青市的那天','不要去常青市']){
  const start=variablesAt('route1'),settled=runtime.finishStoryAction(start,input,2);
  assert.equal(settled.stat_data.宝可梦.地图.节点,'route1',input);
 }
});

test('clause-local negation and past narration settle only the committed present movement',()=>{
 for(const input of [
  '不要去真新镇，去尼比市',
  '去尼比市，不要去真新镇',
  '去尼比市看看，不打道馆',
  '昨天在常青市休息，今天去尼比市',
  '我希望现在去尼比市',
 ]){
  const settled=runtime.finishStoryAction(variablesAt('route1'),input,2),world=settled.stat_data.宝可梦;
  assert.equal(world.地图.节点,'pewter',input);
  assert.deepEqual(world.剧情.最近行动,{action:'travel',turn:2,text:input},input);
  assert.equal(world.战斗.状态,'finished',input);
  assert.equal(world.训练家.徽章.length,0,input);
 }
});

test('clause-local parsing keeps hypotheses, past-only statements, quotes and negation inert',()=>{
 for(const input of ['如果去尼比市','希望以后挑战小刚','昨天在常青市休息','“去尼比市”','不要去尼比市']){
  const start=variablesAt('route1'),settled=runtime.finishStoryAction(start,input,2);
  assert.equal(settled.stat_data.宝可梦.地图.节点,'route1',input);
 }
});

test('whole-scene invitation rejects an ended or refused battle',()=>{
 const start=mvu.createInitialMvu(1),w=start.stat_data.宝可梦;
 w.剧情.初始御三家已选=true;w.战斗.状态='finished';
 const invite='@bubble:leaf|叶子|期待|[来吧。真打一场，点到为止。]';
 for(const tail of ['我拒绝了这场挑战。','这场对战已经结束。'])assert.equal(runtime.naturalTrainerInvitation(start,'我继续旅行',invite+'\n'+tail),null);
});

test('ongoing narrative does not revive a finished or hypothetical battle',()=>{
 const start=mvu.createInitialMvu(4),w=start.stat_data.宝可梦;
 w.剧情.初始御三家已选=true;w.战斗.状态='finished';
 const scene='小刚站在一旁观战。叶子指挥妙蛙种子向小火龙发起攻击。';
 assert.equal(runtime.naturalTrainerInvitation(start,'我继续旅行',scene+'这场对战已经结束。'),null);
 assert.equal(runtime.naturalTrainerInvitation(start,'如果要是对战',scene),null);
});

test('the reported Leaf exchange resolves commands and Pokémon without making the spectator an opponent',()=>{
 const start=variablesAt('pewter');start.stat_data.宝可梦.队伍=[mvu.makeMon(4,5,'starter-charmander')];
 const scene=`叶子没有说话，只把手往下一压。
@bubble:leaf-one|叶子|期待|[别躲。]
@bubble:leaf-two|叶子||[用它挡，或者用它自己快的地方。]
小火龙听到了。藤蔓第三次过来的时候，它把身体迎过去，前爪迎上那根藤，爪尖一碰，藤蔓滑开了。
妙蛙种子把藤鞭收回去，身子重新往下一沉。
@bubble:brock|小刚|赞同|[好。]
对面那个矮着身子的对手已经在蓄下一次了。`;
 assert.deepEqual(runtime.naturalTrainerInvitation(start,'我让小火龙接住这一招。',scene),{action:'narrative-trainer',payload:{trainerName:'叶子',speciesId:1}});
 assert.equal(runtime.naturalTrainerInvitation(start,'我让小火龙接住这一招。',scene+'这场对战已经结束。'),null);
 assert.equal(runtime.naturalTrainerInvitation(start,'我拒绝对战。',scene),null);
});

test('compound negation across travel clauses only commits the destination that is not refused',()=>{
 for(const input of [
  '不去真新镇，也不去常青市，直接去尼比市',
  '我不去真新镇也不去常青市而是去尼比市',
 ]){
  const settled=runtime.finishStoryAction(variablesAt('route1'),input,2),world=settled.stat_data.宝可梦;
  assert.equal(world.地图.节点,'pewter',input);
  assert.equal(world.地图.地点,'尼比市',input);
  assert.deepEqual(world.剧情.最近行动,{action:'travel',turn:2,text:input},input);
  assert.equal(world.剧情.行动提示,'',input);
 }
});

test('compound negation in an encounter clause keeps only the requested species',()=>{
 const input='我不想遇到皮卡丘，也不想和捕虫少年打，我只想在草丛遇到绿毛虫';
 const start=variablesAt('route2'),settled=runtime.finishStoryAction(start,input,2),world=settled.stat_data.宝可梦;
 assert.equal(world.地图.节点,'route2');
 assert.equal(world.战斗.状态,'pending');
 assert.equal(world.遭遇.类型,'wild');
 assert.equal(world.遭遇.队伍[0].图鉴编号,10);
 assert.equal(world.遭遇.来源地图,'route2');
 assert.equal(world.剧情.最近行动.action,'wild');
 assert.equal(world.剧情.最近行动.text,input);
});

test('past-tense encounters and travel are remembered but not replayed on the present turn',()=>{
 const input='昨天我在常青森林遇到皮卡丘，今天前往尼比市';
 const settled=runtime.finishStoryAction(variablesAt('route1'),input,2),world=settled.stat_data.宝可梦;
 assert.equal(world.地图.节点,'pewter');
 assert.equal(world.战斗.状态,'finished');
 assert.equal(world.遭遇,null);
 assert.deepEqual(world.剧情.最近行动,{action:'travel',turn:2,text:input});
});

test('hypothetical travel and encounter statements stay inert',()=>{
 for(const input of [
  '如果我从1号道路前往尼比市遇到皮卡丘',
  '假如我在常青森林遇到皮卡丘就开始战斗',
  '希望以后能在常青森林遇到皮卡丘',
  '要是能挑战捕虫少年就好了',
 ]){
  const settled=runtime.finishStoryAction(variablesAt('route1'),input,2),world=settled.stat_data.宝可梦;
  assert.equal(world.地图.节点,'route1',input);
  assert.equal(world.战斗.状态,'finished',input);
  assert.equal(world.遭遇,null,input);
 }
});

test('a natural travel-and-encounter sequence cannot cross an unmet badge gate or leak partial state',()=>{
 const badges=['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章','深红徽章'];
 const start=variablesAt('route23',badges),before=structuredClone(start.stat_data.宝可梦);
 const settled=runtime.finishStoryAction(start,'我前往冠军之路遇到皮卡丘',2),world=settled.stat_data.宝可梦;
 assert.equal(world.地图.节点,'route23');
 assert.deepEqual(world.地图,before.地图);
 assert.equal(world.战斗.状态,'finished');
 assert.equal(world.遭遇,null);
 assert.match(world.剧情.行动提示,/8枚徽章/);
 assert.equal(start.stat_data.宝可梦.地图.节点,'route23','the source snapshot remains untouched');
});

test('field-move and story route gates report their own requirement without moving the player',()=>{
 const water=runtime.finishStoryAction(variablesAt('fuchsia'),'我前往19号水道',2).stat_data.宝可梦;
 assert.equal(water.地图.节点,'fuchsia');
 assert.equal(water.遭遇,null);
 assert.match(water.剧情.行动提示,/冲浪|粉红徽章/);
 const tea=runtime.finishStoryAction(variablesAt('route6'),'我前往金黄市',2).stat_data.宝可梦;
 assert.equal(tea.地图.节点,'route6');
 assert.equal(tea.遭遇,null);
 assert.match(tea.剧情.行动提示,/热茶/);
});

test('the same story gate opens only when its key item is actually held',()=>{
 const start=variablesAt('route6'),world=start.stat_data.宝可梦;
 world.背包.关键物品.push('tea');
 const arrived=runtime.finishStoryAction(start,'我前往金黄市',2).stat_data.宝可梦;
 assert.equal(arrived.地图.节点,'saffron');
 assert.equal(arrived.地图.地点,'金黄市');
 assert.equal(arrived.剧情.关都事件.标记.saffronGateOpen,true);
 assert.equal(arrived.背包.关键物品.some(item=>String(typeof item==='string'?item:item?.id||'').toLowerCase()==='tea'),false);
});

test('narrative encounter offer freezes its roster and accepts only once',()=>{
 const initial=variablesAt('route1');
 const prose='@bubble:trainer|叶子|normal|[来一场对战吧！]';
 const offered=runtime.reconcileEncounterOffer(initial,'',prose,3,'v1');
 const offer=offered.stat_data.宝可梦.剧情.遭遇邀约;
 assert.equal(offer.状态,'pending');
 assert.equal(initial.stat_data.宝可梦.剧情.遭遇邀约,undefined);
 assert.deepEqual(runtime.reconcileEncounterOffer(offered,'',prose,3,'v1'),offered);
 offered.stat_data.宝可梦.队伍[0]=mvu.makeMon(1,30,"changed-player");
 const accepted=runtime.acceptEncounterOffer(offered,offer.id,3,'v1');
 assert.deepEqual(accepted.stat_data.宝可梦.遭遇,offer.遭遇);
 assert.equal(accepted.stat_data.宝可梦.剧情.遭遇邀约.状态,'accepted');
 assert.deepEqual(runtime.acceptEncounterOffer(accepted,offer.id,3,'v1'),accepted);
 assert.throws(()=>runtime.acceptEncounterOffer(offered,offer.id,3,'v2'),/邀战已变化/);
});

