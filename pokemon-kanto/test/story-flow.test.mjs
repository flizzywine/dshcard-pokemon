import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { apply } from '../index.mjs';

const require = createRequire(import.meta.url);
const mvu = require('../mvu.cjs');
const clone = value => structuredClone(value);
const GAME_ID = 'story-flow-test';
const PREFIX = 'dsh-card-pokemon-frlg-stage/';

function readyWorld(node = 'pallet') {
  const variables = mvu.createInitialMvu();
  const world = variables.stat_data['宝可梦'];
  world.剧情.初始御三家已选 = true;
  world.地图.节点 = node;
  world.地图.地点 = ({pallet:'真新镇','route2':'2号道路',viridian:'常青市'})[node] || node;
  world.地图.轮次 = 1;
  world.战斗 = {轮次:1, 状态:'finished', 结果:'', 摘要:'', 操作序号:0, 奖励:{经验:[],金币:0,物品:[],徽章:[]}};
  world.遭遇 = null;
  world.队伍 = [mvu.makeMon(1, 5, 'story-starter')];
  mvu.recalculateDerived(variables);
  mvu.validateMvu(variables);
  return variables;
}

function makeHost({variables = readyWorld(), turn = 1, textVersion = 'story-v1'} = {}) {
  const routes = new Map(), storage = new Map(), callbacks = {}, history = new Map(), texts = new Map();
  const host = {
    head: {gameId:GAME_ID, turn, textVersion, settled:true, busy:false},
    variables:clone(variables),
    async call(route, body = {}) {
      const handler = routes.get(PREFIX + route);
      assert.ok(handler, `registered route ${route}`);
      return handler({...body, gameId:GAME_ID});
    },
    async settleAt(nextTurn, input, text='settled story') {
      this.head = {gameId:GAME_ID, turn:nextTurn, textVersion:`story-v${nextTurn}`, settled:true, busy:false};
      history.set(nextTurn, input);
      texts.set(nextTurn,text);
      return callbacks.settled({...this.head, variables:clone(this.variables), text});
    },
    restart() { apply({tavern:this.T}); },
  };
  host.T = {
    apiVersion:3,
    handle(name, fn) { routes.set(name, fn); },
    async getTurnState({gameId}) { assert.equal(gameId,GAME_ID); return {...host.head}; },
    async getTurn({gameId, turn:requestedTurn}) {
      assert.equal(gameId,GAME_ID);
      return requestedTurn===host.head.turn ? {turn:requestedTurn,textVersion:host.head.textVersion,variables:clone(host.variables),text:texts.get(requestedTurn)||''} : null;
    },
    async getHistory({gameId,from,to}) {
      assert.equal(gameId,GAME_ID);
      return from===to && history.has(from) ? [{turn:from,input:history.get(from),text:'settled story',rawText:'settled story'}] : [];
    },
    async setVariables({turn:writeTurn,textVersion,variables:next}) {
      if(writeTurn!==host.head.turn || textVersion!==host.head.textVersion) throw Object.assign(new Error('stale write'),{code:'STALE_TURN'});
      host.variables=clone(next);
      return {turn:writeTurn,textVersion};
    },
    async saveTurnData({turn:saveTurn,textVersion,data}) {
      storage.set(saveTurn,{turn:saveTurn,textVersion,data:clone(data)});
      return {turn:saveTurn,textVersion};
    },
    async readTurnData({turn:requestedTurn}) {
      const latest=[...storage.values()].filter(entry=>entry.turn<=requestedTurn).sort((a,b)=>b.turn-a.turn)[0];
      return clone(latest||null);
    },
    onTurnSettled(fn) { callbacks.settled=fn; },
    onTimelineChanged(fn) {},
    onGameRemoved(fn) {},
    turnSection() {},
    promptSection() {},
    settlementSection() {},
  };
  host.routes=routes; host.storage=storage; host.callbacks=callbacks; host.history=history; host.texts=texts;
  apply({tavern:host.T});
  return host;
}

test('preparing canonical RP text is read-only and can be explicitly queued afterwards', async () => {
  const host=makeHost(), before=clone(host.variables);
  const plan=await host.call('plan',{action:'trainer-battle',payload:{}});
  assert.equal(typeof plan.playerText,'string');assert.ok(plan.playerText.length>0);
  assert.deepEqual(host.variables,before);assert.equal(host.storage.size,0);
  await host.call('intent',{action:'trainer-battle',payload:{},playerText:plan.playerText});
  await host.settleAt(2,plan.playerText);
  assert.equal(host.variables.stat_data.宝可梦.遭遇.类型,'trainer');
  assert.equal(host.variables.stat_data.宝可梦.战斗.剧情入场,true);
});

test('a missed busy settlement is caught up on read and battle entry starts its wild opponent directly',async()=>{
  const host=makeHost();
  host.head={...host.head,turn:2,textVersion:'story-v2',busy:true};
  host.history.set(2,'我前往1号道路，寻找波波');
  host.texts.set(2,'一只波波从草丛里跳出来，望着你。\n【进入本轮战斗】');
  await host.callbacks.settled({...host.head,variables:clone(host.variables),text:host.texts.get(2)});
  assert.equal(host.variables.stat_data.宝可梦.地图.节点,'pallet');
  host.head.busy=false;
  const started=await host.call('enter-battle');
  assert.equal(started.world.地图.节点,'route1');
  assert.equal(started.world.遭遇.类型,'wild');
  assert.equal(started.world.遭遇.队伍[0].图鉴编号,16);
  assert.equal(started.world.战斗.状态,'active');
  assert.equal(host.history.size,1,'entry does not send any new RP');
});

test('a generated local wild entrance becomes MVU state and is not recreated after defeat or restart',async()=>{
  const host=makeHost({variables:readyWorld('route1')});
  const text='你的小火龙靠着你的腿，眼前一只波波落在路边。\n【进入本轮战斗】\n那只波波等你先动。';
  await host.settleAt(2,'我放慢脚步，看看路边。',text);
  const encounter=clone(host.variables.stat_data.宝可梦.遭遇);
  assert.equal(encounter.队伍[0].图鉴编号,16);
  await host.call('mvu');assert.deepEqual(host.variables.stat_data.宝可梦.遭遇,encounter);
  host.variables.stat_data.宝可梦.战斗.状态='finished';host.variables.stat_data.宝可梦.战斗.结果='lose';
  host.restart();await host.call('mvu');
  assert.equal(host.variables.stat_data.宝可梦.战斗.状态,'finished');
  await assert.rejects(host.call('enter-battle'),error=>error.code==='NO_PENDING_ENCOUNTER');
});

test('story markers never spawn illegal species or a replacement trainer battle in town',async()=>{
  for(const [node,text] of [['pallet','一只波波落在研究所。\n【进入本轮战斗】'],['route1','一只超梦从草丛里跳出来。\n【进入本轮战斗】'],['route1','委托要求研究波波。\n【进入本轮战斗】']]){
    const host=makeHost({variables:readyWorld(node)});
    await host.settleAt(2,'我看看周围。',text);
    assert.equal(host.variables.stat_data.宝可梦.遭遇,null);
    await assert.rejects(host.call('enter-battle'),error=>error.code==='NO_PENDING_ENCOUNTER');
  }
});

test('/intent only queues an action; its exact prose executes after the following turn settles', async () => {
  const host=makeHost();
  const before=clone(host.variables.stat_data['宝可梦']);
  const plan=await host.call('intent',{action:'travel',payload:{node:'route1'},turn:1,textVersion:'story-v1'});
  let world=host.variables.stat_data['宝可梦'];
  assert.equal(world.地图.节点,before.地图.节点);
  assert.deepEqual(world.背包,before.背包);
  assert.equal(world.剧情.待执行行动.playerText,plan.playerText);
  await host.settleAt(2,plan.playerText);
  world=host.variables.stat_data['宝可梦'];
  assert.equal(world.地图.节点,'route1');
  assert.equal(world.剧情.最近行动.action,'travel');
  assert.equal(world.剧情.待执行行动,undefined);
});

test('changed prose cannot execute a previously queued intent', async () => {
  const host=makeHost();
  const plan=await host.call('intent',{action:'travel',payload:{node:'route1'},turn:1,textVersion:'story-v1'});
  await host.settleAt(2,'我改变主意了，留在这里看看伙伴。');
  const world=host.variables.stat_data['宝可梦'];
  assert.equal(world.地图.节点,'pallet');
  assert.equal(world.剧情.待执行行动,undefined);
  assert.notEqual(world.剧情.最近行动?.action,'travel');
});

test('edited stage prose is authoritative and can cancel a prepared map action',async()=>{
  const host=makeHost();
  const draft='我改变主意了，留在真新镇陪伙伴坐一会儿。';
  const plan=await host.call('intent',{action:'travel',payload:{node:'route1'},playerText:draft});
  assert.equal(plan.queued,false);assert.equal(plan.playerText,draft);
  await host.settleAt(2,draft);
  assert.equal(host.variables.stat_data.宝可梦.地图.节点,'pallet');
  const edited='我和伙伴慢慢前往1号道路，留意路边的声音。';
  const accepted=await host.call('intent',{action:'travel',payload:{node:'route1'},playerText:edited});
  assert.equal(accepted.queued,true);assert.equal(accepted.playerText,edited);
  await host.settleAt(3,edited);
  assert.equal(host.variables.stat_data.宝可梦.地图.节点,'route1');
});

test('center healing is a direct native service and does not require a story submission',async()=>{
  const variables=readyWorld(),mon=variables.stat_data.宝可梦.队伍[0];
  mon.当前HP=1;mon.状态='par';mon.招式[0].PP=0;
  const host=makeHost({variables});
  await host.call('scene',{action:'heal'});
  const after=host.variables.stat_data.宝可梦.队伍[0];
  assert.equal(after.当前HP,after.能力值.hp);assert.equal(after.状态,'');assert.equal(after.招式[0].PP,after.招式[0].PP上限);
  assert.equal(host.history.size,0);assert.equal(host.variables.stat_data.宝可梦.剧情.待执行行动,undefined);
});

test('companionship receives the trusted native story turn and preserves the selected UID',async()=>{
  const variables=readyWorld();variables.stat_data.宝可梦.队伍.push(mvu.makeMon(4,5,'second-partner'));
  const host=makeHost({variables});
  await host.call('scene',{action:'bond',uid:'second-partner',mode:'talk',storyTurn:9999});
  let world=host.variables.stat_data.宝可梦;
  assert.equal(world.羁绊.伙伴['second-partner'].信赖,2);assert.equal(world.羁绊.伙伴['story-starter'].信赖,0);
  assert.equal(world.羁绊.伙伴['second-partner'].共同记忆[0].故事轮次,1);
  await host.settleAt(2,'我仔细照料小火龙，安抚它的紧张。');
  world=host.variables.stat_data.宝可梦;
  assert.equal(world.羁绊.伙伴['second-partner'].信赖,2,'natural-language care is no longer a visible companion action');
  assert.equal(world.羁绊.伙伴['second-partner'].共同记忆.at(-1).故事轮次,1);
});

test('AI opponent model is validated and passed only to its battle decision',async()=>{
  const variables=mvu.ensureEncounter(readyWorld('route2'),2),host=makeHost({variables});
  const groups=[{provider:'configured',providerName:'Configured',models:[{id:'chosen',name:'Chosen'}]}];
  host.T.taskModels=async()=>groups;host.T.backgroundModel=async()=>({provider:'configured',model:'default'});
  await assert.rejects(host.call('settings',{aiModel:{provider:'other',model:'missing'}}),/不可用/);
  await host.call('settings',{difficulty:'ai',aiModel:{provider:'configured',model:'chosen'}});
  const calls=[];host.T.runTask=async args=>{calls.push(args);return{text:'{"choice":"move 1"}'};};
  const battle=await host.call('battle');
  await host.call('action',{battleId:battle.id,seq:battle.seq,choice:'move 1'});
  assert.deepEqual(calls[0].modelSelection,{provider:'configured',model:'chosen'});
  assert.equal((await host.T.backgroundModel()).model,'default');
});

test('varied local offers become real tasks only after schema validation and native story acceptance, without a second model wait',async()=>{
  const quests=require('../npc-quests.cjs'),host=makeHost();let generated=0;
  const context=quests.generationContext(host.variables.stat_data.宝可梦);
  host.T.runTask=async()=>{generated++;return{text:JSON.stringify([{title:'路边观察的约定',description:'研究员想了解附近道路上的宝可梦生活，请帮他完成一次实际调查。',objectiveId:context.objectiveOptions[0].id,rewardId:context.rewardOptions[0].id}])};};
  await host.call('quest-generate');await host.call('quest-generate');assert.equal(generated,0);
  const world=host.variables.stat_data.宝可梦;
  const quest=quests.definitions(world).find(item=>item.id.startsWith('gen-'));
  assert.ok(quest);assert.equal(world.委托.记录[quest.id],undefined,'merely reading an offer does not accept it');
  const accepted=await host.call('intent',{action:'quest-accept',payload:{questId:quest.id}});
  await host.settleAt(2,accepted.playerText);
  assert.equal(host.variables.stat_data.宝可梦.委托.记录[quest.id].status,'active');
  assert.ok(host.variables.stat_data.宝可梦.任务.some(task=>task.questId===quest.id));
});

test('a natural named wild encounter creates a pending species 25 battle with a story entrance', async () => {
  const host=makeHost({variables:readyWorld('viridian-forest')});
  await host.settleAt(2,'我在常青森林草丛遇到皮卡丘，开始战斗');
  const world=host.variables.stat_data['宝可梦'];
  assert.equal(world.遭遇.类型,'wild');
  assert.equal(world.遭遇.队伍[0].图鉴编号,25);
  assert.equal(world.战斗.状态,'pending');
  assert.equal(world.战斗.剧情入场,true);
});

test('a legendary investigation narrates first, then creates one native MVU encounter', async () => {
  const variables=readyWorld('seafoam'), world=variables.stat_data['宝可梦'];
  world.地图.地点='双子岛';
  world.训练家.徽章=['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章','深红徽章','绿色徽章'];
  const host=makeHost({variables});
  const plan=await host.call('intent',{action:'legendary',payload:{id:144},turn:1,textVersion:'story-v1'});
  assert.match(plan.playerText,/急冻鸟/);
  assert.equal(host.variables.stat_data['宝可梦'].遭遇,null);
  await host.settleAt(2,plan.playerText);
  const after=host.variables.stat_data['宝可梦'];
  assert.equal(after.遭遇.队伍[0].图鉴编号,144);
  assert.equal(after.战斗.剧情入场,true);
  assert.deepEqual(after.剧情.特殊遭遇已触发,['articuno']);
  after.战斗.状态='finished'; after.遭遇=null;
  await host.settleAt(3,'我在双子岛寻找急冻鸟的踪迹');
  assert.equal(host.variables.stat_data['宝可梦'].遭遇,null);
  assert.match(host.variables.stat_data['宝可梦'].剧情.行动提示,/传说宝可梦/);
});

test('natural language can investigate an unlocked landmark but cannot move it elsewhere', async () => {
  const variables=readyWorld('power-plant'), world=variables.stat_data['宝可梦'];
  world.地图.地点='发电厂';
  world.训练家.徽章=['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章','深红徽章','绿色徽章'];
  const host=makeHost({variables});
  await host.settleAt(2,'我在双子岛寻找闪电鸟的踪迹');
  assert.equal(host.variables.stat_data['宝可梦'].遭遇,null,'a foreign named landmark cannot use the current landmark action');
  await host.settleAt(3,'我在发电厂寻找闪电鸟的踪迹');
  assert.equal(host.variables.stat_data['宝可梦'].遭遇.队伍[0].图鉴编号,145);
  const other=makeHost({variables:readyWorld('route2')});
  await other.settleAt(2,'我在草丛遇到闪电鸟，进入战斗');
  assert.equal(other.variables.stat_data['宝可梦'].遭遇,null);
});

test('the queued starter selection applies once and leaves no invalid-action warning',async()=>{
  const host=makeHost({variables:mvu.createInitialMvu()});
  const plan=await host.call('intent',{action:'starter',payload:{id:7},turn:1,textVersion:'story-v1'});
  await host.settleAt(2,plan.playerText);
  const world=host.variables.stat_data['宝可梦'];
  assert.equal(world.剧情.初始御三家已选,true);
  assert.equal(world.队伍.length,1);
  assert.equal(world.队伍[0].图鉴编号,7);
  assert.equal(world.剧情.最近行动.action,'starter');
  assert.equal(world.剧情.行动提示,'');
});

test('an edited starter draft carries nature and IVs through the queued native settlement',async()=>{
 const host=makeHost({variables:mvu.createInitialMvu()});
 const input='我选择小火龙（天真性格，物攻特攻速度，个体值31）作为最初的伙伴，接过大木博士递来的精灵球。';
 await host.call('intent',{action:'starter',payload:{id:4},playerText:input});await host.settleAt(2,input);
 const mon=host.variables.stat_data.宝可梦.队伍[0];assert.equal(mon.性格,'Naive');assert.equal(mon.个体值.atk,31);assert.equal(mon.个体值.spa,31);assert.equal(mon.个体值.spe,31);
});

test('old fixed-default starter parameters recover from the original native history even after a sync receipt',async()=>{
 const vars=mvu.chooseStarter(mvu.createInitialMvu(),4),world=vars.stat_data.宝可梦;delete world.剧情.初始伙伴设定;
 world.剧情.叙事同步={故事轮次:2,正文版本:'story-v2'};
 const host=makeHost({variables:vars,turn:2,textVersion:'story-v2'}),input='我选择小火龙（天真性格，物攻特攻速度，个体值31）作为最初的伙伴。';
 host.T.getHistory=async()=>[{turn:2,input,text:'开场'}];
 const result=await host.call('mvu');assert.equal(result.world.队伍[0].性格,'Naive');assert.equal(result.world.队伍[0].个体值.spe,31);assert.equal(result.world.剧情.初始伙伴设定.已补录,true);
 host.restart();await host.call('mvu');assert.equal(host.variables.stat_data.宝可梦.队伍[0].个体值.hp,25);
});

test('starter small talk, rejected choices and questions never choose a partner implicitly',async()=>{
  for(const input of ['小火龙很可爱','我不选小火龙','妙蛙种子和杰尼龟有什么不同？','如果我选择小火龙会怎样？']){
    const host=makeHost({variables:mvu.createInitialMvu()});await host.settleAt(2,input);
    assert.equal(host.variables.stat_data['宝可梦'].剧情.初始御三家已选,false,input);
  }
});

test('negation and small talk do not spawn encounters on every settled turn', async () => {
  const host=makeHost({variables:readyWorld('route2')});
  await host.settleAt(2,'皮卡丘真可爱');
  assert.equal(host.variables.stat_data['宝可梦'].遭遇,null);
  await host.settleAt(3,'我不要开始战斗');
  assert.equal(host.variables.stat_data['宝可梦'].遭遇,null);
  assert.equal(host.variables.stat_data['宝可梦'].战斗.状态,'finished');
});

test('an active battle carries forward without replacing its encounter', async () => {
  const variables=readyWorld('route2'), world=variables.stat_data['宝可梦'];
  const foe=mvu.makeMon(10,4,'active-story-foe');
  world.遭遇={类型:'wild',队伍:[foe]};
  world.战斗={轮次:1,状态:'active',结果:'',摘要:'',操作序号:0,奖励:{经验:[],金币:0,物品:[],徽章:[]}};
  mvu.validateMvu(variables);
  const host=makeHost({variables});
  await host.settleAt(2,'前往常青市');
  const after=host.variables.stat_data['宝可梦'];
  assert.equal(after.地图.节点,'route2');
  assert.equal(after.战斗.状态,'active');
  assert.equal(after.遭遇.队伍[0].uid,foe.uid);
});

test('battle rewards survive shopping and restart without a report route or model summary', async () => {
  const variables=readyWorld('pallet'), world=variables.stat_data['宝可梦'];
  world.训练家.徽章=['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章','深红徽章','绿色徽章'];
  world.队伍=[mvu.makeMon(6,35,'battle-reward-charizard')];
  world.队伍[0].招式=[{id:'ember',PP:25,PP上限:25}];
  world.遭遇={类型:'trainer',训练家:'捕虫少年',队伍:[mvu.makeMon(10,3,'battle-reward-caterpie')]};
  world.战斗.状态='pending';
  mvu.validateMvu(variables);
  const host=makeHost({variables});
  let battle=await host.call('battle',{turn:1,textVersion:'story-v1'});
  for(let guard=0;guard<20&&!battle.ended;guard++) {
    const legal=battle.request.moves.findIndex(move=>move.pp>0&&!move.disabled);
    battle=await host.call('action',{battleId:battle.id,choice:`move ${legal+1}`,seq:battle.seq,turn:1,textVersion:'story-v1'});
  }
  assert.equal(battle.ended,true);
  let summaries=0;
  host.T.backgroundModel=async()=>({id:'configured-model'});
  host.T.runTask=async()=>{summaries++;return {text:'unrequested summary'}};
  await assert.rejects(host.call('report',{battleId:battle.id}),/report/);
  assert.equal(summaries,0,'battle settlement does not invoke an AI summary task');
  const beforeRetry=clone(host.variables.stat_data['宝可梦']);
  const earnedExp=beforeRetry.队伍[0].经验,earnedRewards=clone(beforeRetry.战斗.奖励);

  const inTown=clone(host.variables), townWorld=inTown.stat_data['宝可梦'];
  townWorld.地图.节点='viridian'; townWorld.地图.地点='常青市';
  await host.T.setVariables({gameId:GAME_ID,turn:1,textVersion:'story-v1',variables:inTown});
  await host.call('shop',{item:'potion',count:1,turn:1,textVersion:'story-v1'});
  const moneyAfterShopping=host.variables.stat_data['宝可梦'].训练家.金钱;
  const bagAfterShopping=clone(host.variables.stat_data['宝可梦'].背包);
  host.restart();
  const resumed=await host.call('mvu');
  assert.equal(resumed.world.训练家.金钱,moneyAfterShopping,'reloading after shopping does not reapply battle money');
  assert.equal(resumed.world.队伍[0].经验,earnedExp,'reloading after shopping does not reapply battle experience');
  assert.deepEqual(resumed.world.背包,bagAfterShopping,'reloading after shopping does not restore spent or purchased items');
  assert.deepEqual(resumed.world.战斗.奖励,earnedRewards,'the real MVU reward record remains readable after restart');
  assert.equal(summaries,0,'no background model ran during settlement, shopping, or restart');
});

test('a settled route1 scene reconciles adjacent travel after accepting a quest in Pallet',async()=>{
  const host=makeHost();
  const text='大木博士说明1号道路的观察委托。\n\n——\n\n镇子北头的白栅栏到尽头。再往前，走进草丛，走了约莫半里。\n路边的界石上蹲着一只波波。\n小火龙的爪子已经抠进土里。\n【进入本轮战斗】';
  await host.settleAt(2,'我接受记录1号道路的委托，之后出发。',text);
  const before=clone(host.variables.stat_data.宝可梦);
  const result=await host.call('enter-battle');
  assert.equal(result.world.地图.节点,'route1');
  assert.equal(result.world.遭遇.队伍[0].图鉴编号,16);
  assert.equal(result.world.战斗.状态,'active');
  assert.deepEqual(result.world.背包,before.背包);
  assert.equal(host.history.size,1);
});

test('an explanation of an adjacent route without travel never teleports a town encounter',async()=>{
  const host=makeHost();
  await host.settleAt(2,'我问问博士。','博士说1号道路有一只波波。\n【进入本轮战斗】');
  assert.equal(host.variables.stat_data.宝可梦.地图.节点,'pallet');
  await assert.rejects(host.call('enter-battle'),error=>error.code==='NO_PENDING_ENCOUNTER');
});

test('late readable story text catches up an empty receipt once, including quoted player dialogue',async()=>{
  const host=makeHost({variables:readyWorld('route1')});
  await host.settleAt(2,'我说：“走吧，小火龙。”');
  host.texts.set(2,'你的小火龙跟在身边，路边一只波波跳下来。\n【进入本轮战斗】');
  await host.call('mvu');
  assert.equal(host.variables.stat_data.宝可梦.遭遇.队伍[0].图鉴编号,16);
  host.variables.stat_data.宝可梦.战斗.状态='finished';
  host.variables.stat_data.宝可梦.战斗.已奖励=true;
  host.restart();await host.call('mvu');
  assert.equal(host.variables.stat_data.宝可梦.战斗.状态,'finished');
  await assert.rejects(host.call('enter-battle'),error=>error.code==='NO_PENDING_ENCOUNTER');
});

test('the legacy impossible town-wild start can recover before any action without changing the party or bag',async()=>{
  const vars=readyWorld(),w=vars.stat_data.宝可梦;
  w.遭遇={类型:'wild',训练家:'野生宝可梦',队伍:[mvu.makeMon(1,2,'wild-pallet-2',{wild:true})]};
  w.战斗={轮次:2,状态:'active',结果:'',操作序号:0};
  w.队伍[0].携带道具='';
  const host=makeHost({variables:vars,turn:2,textVersion:'story-v2'}),party=clone(w.队伍),bag=clone(w.背包);
  host.history.set(2,'我向北出发寻找波波。');
  host.texts.set(2,'你离开真新镇，1号道路就在北边。\n——\n再往前走进草丛，路边一只波波跳下来。\n【进入本轮战斗】');
  const result=await host.call('enter-battle');
  assert.equal(result.world.地图.节点,'route1');assert.equal(result.world.遭遇.队伍[0].图鉴编号,16);
  assert.deepEqual(result.world.队伍,party);assert.deepEqual(result.world.背包,bag);
});
