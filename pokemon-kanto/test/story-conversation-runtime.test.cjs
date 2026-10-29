'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mvu = require('../mvu.cjs');
const runtime = require('../story-runtime.cjs');
const director = require('../story-director.cjs');
const conversation = require('../story-conversation.cjs');
const eventData = require('../public/data/kanto-story-events.json');
const campaignData = require('../public/data/kanto-campaign.json');

function variablesAt(node) {
  const variables = mvu.createInitialMvu(1), world = variables.stat_data.宝可梦;
  world.地图.节点 = node;
  world.地图.地点 = require('../public/data/map.json').find(row => row.id === node).name;
  world.剧情.初始御三家已选 = true;
  world.剧情.初始御三家编号 = 1;
  world.剧情.关都主线.prologueSeen = true;
  world.战斗.状态 = 'finished';
  return mvu.ensureMvuDefaults(variables);
}

test('story-converse selects any open current event, stores a small focus, and persists one free beat idempotently', () => {
  const variables = variablesAt('route25'), world = variables.stat_data.宝可梦;
  const target = 'bill-cottage-ticket';
  const plan = runtime.planAction(world, 'story-converse', {eventId:target});
  assert.equal(plan.payload.eventId, target);
  assert.match(plan.playerText, /小霞/);
  assert.match(director.prompt(world, plan, plan.playerText, 10), /岬角小屋的求救信号/,'the queued intent previews the selected scene before focus persistence');
  assert.doesNotMatch(director.prompt(world, plan, plan.playerText, 10), /游戏厅的暗门/);
  let started = runtime.applyAction(variables, 'story-converse', {eventId:target}, 10);
  let view = mvu.worldView(started, {stageOnly:true,storyTurn:10});
  assert.equal(view.storyEvents.scene.eventId, target);
  assert.equal(view.storyConversation.id, target);
  assert.ok(view.storyConversation.focus.length < 701);
  assert.equal(view.storyConversation.turns, 0);
  assert.match(director.prompt(started.stat_data.宝可梦, null, '我问比尔为什么接错线路。', 10), /当前剧情互动焦点/);
  assert.doesNotMatch(director.prompt(started.stat_data.宝可梦, null, '我问比尔为什么接错线路。', 10), /游戏厅的暗门/);

  started = runtime.finishStoryAction(started, '我问比尔为什么接错线路。', 11);
  started = runtime.finishStoryAction(started, '我再问一遍。', 11);
  assert.equal(started.stat_data.宝可梦.剧情.对话互动.focus.turns, 1, 'repeated processing of one story turn does not advance twice');
  assert.equal(started.stat_data.宝可梦.剧情.关都事件.进度[target]?.完成 || false, false);
  assert.deepEqual(started.stat_data.宝可梦.剧情.关都事件.记录, [], 'free dialogue does not create a choice receipt');

  const moved = mvu.travel(started, 'route24');
  assert.equal(moved.stat_data.宝可梦.剧情.对话互动.focus, null, 'a map move clears the selected actor');
});

test('story-converse validates event, chapter, and prologue against current open scene', () => {
  let variables = variablesAt('viridian-forest'), world = variables.stat_data.宝可梦;
  assert.throws(() => runtime.planAction(world, 'story-converse', {eventId:'bill-cottage-ticket'}), /当前位置|前置条件/);
  const yellow = runtime.planAction(world, 'story-converse', {eventId:'yellow-forest-listening'});
  assert.equal(yellow.payload.eventId, 'yellow-forest-listening');
  assert.match(yellow.playerText, /小黄/);

  variables = variablesAt('pewter'); world = variables.stat_data.宝可梦;
  world.训练家.徽章 = ['岩石徽章'];
  mvu.ensureMvuDefaults(variables);
  const chapter = runtime.planAction(world, 'story-converse', {chapterId:'pewter-afterglow'});
  assert.equal(chapter.payload.chapterId, 'pewter-afterglow');
  assert.match(chapter.playerText, /小刚/);
  assert.throws(() => runtime.planAction(world, 'story-converse', {chapterId:'cerulean-crossing'}), /当前位置|前置条件/);

  variables = variablesAt('pallet'); world = variables.stat_data.宝可梦;
  world.剧情.关都主线.prologueSeen = false;
  mvu.ensureMvuDefaults(variables);
  const prologue = runtime.planAction(world, 'story-converse', {prologue:true});
  assert.equal(prologue.payload.prologue, true);
  assert.match(prologue.playerText, /大木博士/);
  assert.throws(() => runtime.planAction(world, 'story-converse', {eventId:'yellow-forest-listening',prologue:true}), /目标无效/);
});

test('unrelated story turns do not consume conversation beats or complete evidence-based events',()=>{
 let vars=runtime.applyAction(variablesAt('viridian-forest'),'story-converse',{eventId:'yellow-forest-listening'},10);
 for(let turn=11;turn<26;turn++)vars=runtime.finishStoryAction(vars,'云遮住了太阳，远处传来鸟鸣。',turn);
 const focus=vars.stat_data.宝可梦.剧情.对话互动.focus;
 assert.equal(focus.beat,0);
 assert.equal(focus.turns,0);
 assert.equal(vars.stat_data.宝可梦.剧情.关都事件.进度['yellow-forest-listening']?.完成||false,false);
 vars=runtime.finishStoryAction(vars,'我认真听她继续讲。',26);
 assert.equal(vars.stat_data.宝可梦.剧情.对话互动.focus.beat,1);
 assert.deepEqual(vars.stat_data.宝可梦.剧情.关都事件.记录,[]);
});

test('each of the 23 events and 8 chapters can be explicitly targeted when opened at its own location', () => {
  const badges = ['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章','深红徽章','绿色徽章'];
  for (const entry of eventData) {
    const variables = variablesAt(entry.node), world = variables.stat_data.宝可梦;
    world.训练家.徽章 = badges.slice(0,entry.requires?.badges || 0);
    const state = world.剧情.关都事件;
    for (const [key,value] of Object.entries(entry.requires?.flags || {})) state.标记[key] = value;
    for (const [item,count] of Object.entries(entry.requires?.items || {})) world.背包.物品[item] = count;
    mvu.ensureMvuDefaults(variables);
    const planned = runtime.planAction(world,'story-converse',{eventId:entry.id});
    assert.equal(planned.payload.eventId,entry.id,`explicit event target ${entry.id} is not replaced by the default scene`);
    assert.ok(planned.playerText.length > 0);
  }
  for (const chapter of campaignData.chapters) {
    const variables = variablesAt(chapter.location), world = variables.stat_data.宝可梦;
    world.训练家.徽章 = badges.slice(0,chapter.badgeCount);
    mvu.ensureMvuDefaults(variables);
    const planned = runtime.planAction(world,'story-converse',{chapterId:chapter.id});
    assert.equal(planned.payload.chapterId,chapter.id,`explicit chapter target ${chapter.id} remains selected`);
  }
});

test('explicit focus switches target and the bounded counter never stores user prose', () => {
  const variables = variablesAt('viridian-forest'), world = variables.stat_data.宝可梦;
  const state = structuredClone(world);
  conversation.begin(state, {eventId:'yellow-forest-listening'}, 4);
  conversation.advance(state, 5);
  conversation.begin(state, {eventId:'forest-pikachu-grove'}, 6);
  const focus = state.剧情.对话互动.focus;
  assert.equal(focus.id, 'forest-pikachu-grove');
  assert.equal(focus.turns, 0);
  assert.equal(JSON.stringify(focus).includes('玩家'), false);
  assert.equal(Object.keys(focus).length, 7);
  for (let turn = 7; turn < 7 + conversation.MAX_TURNS; turn++) conversation.advance(state,turn);
  assert.equal(state.剧情.对话互动.focus,null,'the active focus expires at its documented dialogue turn bound');
});

test('event conversation actor and beats stay centered on the authored scene speaker', () => {
  const forest = eventData.find(row => row.id === 'forest-pikachu-grove');
  const forestText = `${forest.conversation.focus} ${forest.conversation.beats.join(' ')}`;
  assert.match(forest.speaker, /小智/);
  assert.match(forestText, /小智/);
  assert.doesNotMatch(forestText, /小黄/,'小黄 has her own event and is not substituted into Xiaozhi’s event');
  const hideout = eventData.find(row => row.id === 'celadon-rocket-hideout');
  const hideoutText = `${hideout.conversation.focus} ${hideout.conversation.beats.join(' ')}`;
  assert.match(hideout.speaker, /火箭队队员/);
  assert.match(hideoutText, /火箭队队员/);
});

test('direct natural conversation can select an open actor; travel, battles, negation and ambiguous actors cannot be hijacked',()=>{
 const world=variablesAt('viridian-forest').stat_data.宝可梦;
 assert.deepEqual(conversation.detect(world,'我和小黄聊聊这片森林。'),{eventId:'yellow-forest-listening'});
 assert.deepEqual(conversation.detect(world,'我询问森林深处的电光这件事。'),{eventId:'forest-pikachu-grove'});
 for(const text of ['我不想和小黄交谈。','如果去找小黄问问呢？','我前往常青市，再向小黄问问。','小黄说：“聊聊吧。”','我问小黄并挑战训练家。'])assert.equal(conversation.detect(world,text),null,text);
 const intent=require('../story-intents.cjs').parseStoryIntent('我和小黄聊聊这片森林。',world);assert.equal(intent.action,'story-converse');
 let v=runtime.finishStoryAction(variablesAt('viridian-forest'),'我和小黄聊聊这片森林。',20);assert.equal(v.stat_data.宝可梦.剧情.对话互动.focus.id,'yellow-forest-listening');
 for(let t=21;t<26;t++)v=runtime.finishStoryAction(v,'我认真听她继续讲。',t);
 assert.equal(v.stat_data.宝可梦.剧情.对话互动.focus.beat,eventData.find(event=>event.id==='yellow-forest-listening').conversation.beats.length,'late conversation moves beyond the authored beats instead of cycling back to the opening');assert.equal(conversation.view(v.stat_data.宝可梦).beatText,'','free extension does not force the same authored beat again');
});

test('player-addressed quoted dialogue selects the actor without treating quoted wishes as actions',()=>{
 const variables=variablesAt('viridian-forest'),world=variables.stat_data.宝可梦;
 const lines=[
  '我问小黄：“你还好吗？”',
  '我对小黄说：“不要急，我们慢慢聊。”',
  '我问小黄：“我们去常青市吧？”',
 ];
 for(const input of lines){
  assert.deepEqual(conversation.detect(world,input),{eventId:'yellow-forest-listening'},input);
  const intent=require('../story-intents.cjs').parseStoryIntent(input,world);
  assert.equal(intent?.action,'story-converse',input);
  const settled=runtime.finishStoryAction(variables,input,20);
  assert.equal(settled.stat_data.宝可梦.地图.节点,'viridian-forest',input);
  assert.equal(settled.stat_data.宝可梦.剧情.对话互动.focus.id,'yellow-forest-listening',input);
 }
 for(const input of ['“小黄，聊聊吧。”','小智问小黄：“你还好吗？”','我听小智问小黄：“你还好吗？”','我问路人：“小黄还好吗？”','我问路人，小黄说：“你好。”']){
  assert.equal(conversation.detect(world,input),null,input);
 }
});

test('explicitly ending a conversation clears the focus; hypothetical or quoted words do not',()=>{
 const starting=runtime.applyAction(variablesAt('viridian-forest'),'story-converse',{eventId:'yellow-forest-listening'},10);
 for(const input of ['我先不聊了。','我不想和小黄聊了。','我和小黄道别。']){
  const settled=runtime.finishStoryAction(starting,input,11);
  assert.equal(settled.stat_data.宝可梦.剧情.对话互动.focus,null,input);
 }
 for(const input of ['如果我先不聊了呢？','我问小黄：“如果我先不聊了呢？”']){
  const settled=runtime.finishStoryAction(starting,input,11);
  assert.equal(settled.stat_data.宝可梦.剧情.对话互动.focus?.id,'yellow-forest-listening',input);
 }
});

test('a focused conversation includes complete current location, active quest and partner memories without mutating MVU',()=>{
 let variables=variablesAt('pallet');
 variables=mvu.theaterAction(variables,'quest-accept',{questId:'oak-route1-survey',storyTurn:3});
 const world=variables.stat_data.宝可梦;
 world.地图.节点='viridian-forest';world.地图.地点='常青森林';
 world.羁绊.伙伴.starter.心情='安心';
 world.羁绊.伙伴.starter.共同记忆=[{故事轮次:4,事件:'曾在林边一起看波波归巢。'}];
 for(let i=1;i<=5;i++){
  const mon={...structuredClone(world.队伍[0]),uid:`buddy-${i}`,昵称:`同行伙伴${i}`};
  world.队伍.push(mon);
  world.羁绊.伙伴[mon.uid]={信赖:i*10,心情:'平静',共同记忆:[{故事轮次:4,事件:`和第${i}位伙伴一起守过夜。`}]};
 }
 const plan=runtime.planAction(world,'story-converse',{eventId:'forest-pikachu-grove'});
 const before=structuredClone(world),prompt=director.prompt(world,plan,'我问小智为什么停下。',5);
 assert.match(prompt,/和第5位伙伴一起守过夜/,'a full party must not lose later members’ memories to text truncation');
 const line=prompt.match(/【旅程连续性】([^\n]+)/u);
 assert.ok(line,'focused dialogue gets a complete, bounded fact snapshot');
 const facts=JSON.parse(line[1]);
 assert.equal(facts.地点,'常青森林');
 assert.ok(facts.伙伴.some(mon=>mon.名字==='妙蛙种子'&&mon.共同记忆.includes('曾在林边一起看波波归巢。')));
 assert.ok(facts.伙伴.some(mon=>mon.名字==='同行伙伴5'&&mon.共同记忆.includes('和第5位伙伴一起守过夜。')));
 assert.ok(facts.委托.进行中.some(quest=>quest.标题==='记录1号道路'&&quest.状态==='active'));
 assert.equal(facts.委托.深度.some(quest=>quest.状态==='未接取'),false,'unaccepted long quest catalog is not presented as player history');
 assert.match(prompt,/小智想证明森林里的皮卡丘并不怕人/,'the selected actor’s own motivation remains in the focused scene');
 assert.match(prompt,/不替玩家|不代替玩家/);
 assert.match(prompt,/奖励.*(?:后台|记录)|(?:后台|记录).*奖励/);
 assert.deepEqual(world,before,'generating context is read-only');
});

test('recorded story choices retain their actual consequence in later conversation context',()=>{
 const events=require('../kanto-story-events.cjs');
 const event=eventData.find(row=>row.id==='forest-pikachu-grove'),stage=event.stages[0],choice=stage.choices[0];
 const world=events.apply(variablesAt('viridian-forest').stat_data.宝可梦,'kanto-story-event',
  {eventId:event.id,choiceId:choice.id},{storyTurn:4});
 const text=director.prompt(world,null,'我回想刚才发生的事。',5),line=text.match(/【旅程连续性】([^\n]+)/u);
 const facts=JSON.parse(line[1]);
 assert.ok(facts.已记录事件.some(row=>row.事件===event.title&&row.结果==='成功'&&row.经过===choice.text.slice(0,140)));
});

test('a full party and active quests fit the host prompt limit without breaking the fact JSON',()=>{
 const world=variablesAt('route25').stat_data.宝可梦,defs=require('../npc-quests.cjs').quests;
 for(let i=1;i<=5;i++){
  const mon={...structuredClone(world.队伍[0]),uid:`long-${i}`,昵称:`伙伴${i}`};
  world.队伍.push(mon);
  world.羁绊.伙伴[mon.uid]={信赖:30,心情:'平静',共同记忆:[{故事轮次:1,事件:'往事'.repeat(120)},{故事轮次:2,事件:'同行'.repeat(120)}]};
  world.羁绊.短期线索.push({UID:mon.uid,内容:'线索'.repeat(90),到期故事轮次:20});
 }
 for(const quest of defs.slice(0,4))world.委托.记录[quest.id]={status:'active',progress:0};
 for(let i=0;i<4;i++)world.任务.push({category:'deep-quest',标题:`正在进行的委托${i}`,委托人:'旅人',状态:'进行中',阶段:'1/3',描述:'细节'.repeat(80),进度:0,目标:1});
 const prompt=director.prompt(world,null,'我问比尔现在最担心什么。',10);
 assert.ok(prompt.length<8000,`the host must receive the whole scene (${prompt.length} characters)`);
 const facts=JSON.parse(prompt.match(/【旅程连续性】([^\n]+)/u)[1]);
 assert.equal(facts.伙伴.length,6);
 assert.equal(facts.委托.进行中.length,4);
 assert.match(prompt,/岬角小屋的求救信号/,'the active scene is not truncated');
});
