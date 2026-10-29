'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function harness(initial) {
  let activeKey='',cursor=0,component;
  const hooks=new Map(),calls=[],turnListeners=[];
  const element=(type,props,...children)=>({type,props:{...(props||{}),...(children.length?{children:children.length<2?children[0]:children}: {})},children:children.length?(children.length<2?[children[0]]:children):[]});
  const React={
    createElement:element,
    cloneElement:(node,props,...children)=>element(node.type,{...node.props,...props},...(children.length?children:node.children)),
    useState(value){const list=hooks.get(activeKey)||[];hooks.set(activeKey,list);const i=cursor++;if(!(i in list))list[i]={value:typeof value==='function'?value():value};return[list[i].value,next=>{list[i].value=typeof next==='function'?next(list[i].value):next;}];},
    useRef(value){const list=hooks.get(activeKey)||[];hooks.set(activeKey,list);const i=cursor++;if(!(i in list))list[i]={value:{current:value}};return list[i].value;},
    useEffect(effect,deps){const list=hooks.get(activeKey)||[];hooks.set(activeKey,list);const i=cursor++,old=list[i];if(!old||JSON.stringify(old.deps)!==JSON.stringify(deps)){list[i]={deps};queueMicrotask(effect);}},
    useMemo(factory){cursor++;return factory();}
  };
  const render=(fn,props,key)=>{activeKey=key;cursor=0;return fn(props);};
  const ui={
    registerStageView(value){ui.stageView=value;},registerTextMarker(){},registerComposerAction(){},
    showStage(){},assetUrl(value){return value;},getMusicState(){return{enabled:false};},watchMusic(){return()=>{};},watchTurnState(_id,fn){turnListeners.push(fn);return()=>{};},
    async callHost(route,args={}){
      calls.push({route,args});
      if(route.endsWith('/mvu'))return initial;
      if(route.endsWith('/models'))return{available:false,groups:[]};
      if(route.endsWith('/stage-assets'))return initial.stageAssets||{trainers:[],npcPortraits:{entries:[]},species:[],scenery:[],audio:{}};
      if(route.endsWith('/scene'))return initial.sceneAction?initial.sceneAction(args,initial):initial.afterScene||initial;
      if(route.endsWith('/enter-battle'))return initial.battleAfterEnter||initial;
      if(route.endsWith('/presentation'))return{};
      return{};
    }
  };
  const sandbox={window:{__ModuleLoader__:{load(entry){component=entry.factory(name=>{assert.equal(name,'react');return React;});}},addEventListener(){},removeEventListener(){}},navigator:{clipboard:{writeText(){}}},URL,Promise,Map,Set,queueMicrotask,setTimeout,clearTimeout,globalThis:null};
  sandbox.globalThis=sandbox;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../client.js'),'utf8'),sandbox);component.apply({tavernUi:ui});
  return{ui,render,calls,turnListeners};
}

function walk(node,predicate,found=[]){if(node==null||typeof node==='boolean')return found;if(Array.isArray(node)){node.forEach(item=>walk(item,predicate,found));return found;}if(typeof node!=='object')return found;if(predicate(node))found.push(node);walk(node.props?.children,predicate,found);walk(node.children,predicate,found);return found;}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function makeData(){
  const facilityOption={id:'facility-info',label:'玉虹游戏厅',enabled:true,payload:{facilityId:'game-corner',revision:0}};
  const coinCase={id:'facility-coin-case',label:'已领取代币盒',enabled:false,payload:{revision:0}};
  const buy={id:'facility-buy-coins',label:'购买50枚代币（1000元）',enabled:true,payload:{coins:50,revision:0}};
  const world={训练家:{姓名:'小智',金钱:5000,徽章:[]},地图:{节点:'celadon',地点:'玉虹市',轮次:4},队伍:[],背包:{物品:{}},战斗:{状态:'finished',轮次:4},剧情:{}};
  return{writable:true,turn:9,world,shop:{available:true},progression:{levelCap:40},facilities:{node:'celadon',context:'玉虹市的代币兑换服务。',facilities:[{id:'game-corner',name:'玉虹游戏厅',kind:'game-corner',description:'领取代币盒、购买代币并兑换奖品。',primaryAction:'facility-coin-case'}],revision:0,gameCorner:{coinCase:true,coins:0},safari:{status:'outside',balls:0,steps:0,encounter:null},options:[coinCase,buy]},fieldServices:{options:[]},theater:{title:'玉虹市',dialogue:'街道上很热闹。',pokemon:[],options:[facilityOption,coinCase,buy]}};
}
function renderStage(app){const input={gameId:'fac-game',stage:{},beats:[],index:0,beat:{text:''},advance(){},footer:null};const item=app.ui.stageView.render(input);return app.render(item.type,item.props,'stage');}
function buttons(tree){return walk(tree,node=>node.type==='button');}
function label(button){return[].concat(button.props.children||[]).join('');}
function click(tree,text){const button=buttons(tree).find(item=>label(item)===text);assert.ok(button,`missing button: ${text}`);return button.props.onClick({stopPropagation(){}});}

test('facility-info opens an in-scene service panel; game-corner actions stay out of main buttons and use refreshed revisions',async()=>{
  const data=makeData();data.sceneAction=(args,state)=>{
    assert.equal(args.action,'facility-buy-coins');
    const revision=args.payload.revision;assert.equal(revision,state.facilities.revision);
    state.facilities.revision++;state.facilities.gameCorner.coins+=args.payload.coins;
    state.world.训练家.金钱-=1000;state.world.城市设施={receipts:{[`r${revision}`]:{action:args.action,result:'bought-50-coins'}}};
    state.facilities.options=[{id:'facility-buy-coins',label:'购买50枚代币（1000元）',enabled:true,payload:{coins:50,revision:state.facilities.revision}}];
    state.theater.options=[...state.theater.options.filter(option=>!option.id.startsWith('facility-buy-coins')),...state.facilities.options];
    return state;
  };
  const app=harness(data);let tree=renderStage(app);await tick();tree=renderStage(app);
  assert.equal(buttons(tree).some(item=>/购买50枚代币|代币盒/.test(label(item))),false,'coin actions should be available only in the facility service');
  await click(tree,'玉虹游戏厅');
  tree=renderStage(app);let scene=walk(tree,node=>node.type?.name==='TheaterScene')[0],theater=app.render(scene.type,scene.props,'theater');
  assert.ok(walk(theater,node=>node.type==='p'&&node.props.className==='kanto-service-summary'&&/代币盒：0 枚/.test(node.children.join(''))).length,'the service summary reads the current coin case and balance');
  await click(theater,'购买50枚代币（1000元）');await tick();tree=renderStage(app);
  scene=walk(tree,node=>node.type?.name==='TheaterScene')[0];theater=app.render(scene.type,scene.props,'theater');
  assert.equal(data.facilities.gameCorner.coins,50);
  assert.ok(theater.props.children);
  assert.ok(app.calls.some(call=>call.route.endsWith('/scene')&&call.args.payload.revision===0));
  assert.ok(walk(theater,node=>node.type==='button'&&label(node)==='购买50枚代币（1000元）').length);
  await click(theater,'购买50枚代币（1000元）');
  assert.equal(app.calls.filter(call=>call.route.endsWith('/scene')).at(-1).args.payload.revision,1,'the next service choice carries the updated revision');
});

test('Safari actions execute immediately and display the backend receipt with refreshed counters',async()=>{
  const data=makeData();data.facilities.node='safari';data.facilities.facilities=[{id:'safari-zone',name:'狩猎地带',kind:'safari',description:'园内行动。',primaryAction:'facility-safari-step'}];
  data.facilities.safari={status:'active',balls:30,steps:600,encounter:{speciesId:29,level:25}};
  const bait={id:'facility-safari-bait',label:'投掷诱饵',enabled:true,payload:{revision:0}};
  data.facilities.options=[bait];data.theater.options=[bait];data.world.地图.节点='safari';data.world.地图.地点='狩猎地带';
  data.sceneAction=(args,state)=>{state.facilities.revision++;state.facilities.safari.steps=599;state.facilities.safari.encounter.baitTurns=2;state.world.城市设施={receipts:{'r0':{action:args.action,result:'bait'}}};state.facilities.options=[{...bait,payload:{revision:1}}];state.theater.options=state.facilities.options;return state;};
  const app=harness(data);let tree=renderStage(app);await tick();tree=renderStage(app);
  await click(tree,'投掷诱饵');await tick();tree=renderStage(app);
  const scene=walk(tree,node=>node.type?.name==='TheaterScene')[0],theater=app.render(scene.type,scene.props,'theater');
  assert.ok(walk(theater,node=>node.type==='p'&&node.children.join('').includes('剩余 599 步')).length,'safari receipt includes the updated step count');
  assert.ok(app.calls.some(call=>call.route.endsWith('/scene')&&call.args.action==='facility-safari-bait'));
  assert.equal(app.calls.some(call=>/\/(plan|intent)$/.test(call.route)),false,'service actions never become RP drafts');
});

test('field battle services dispatch scene then enter-battle, while direct field claims bypass planning',async()=>{
  const data=makeData();const challenge={id:'field-challenge-dojo',label:'挑战格斗道场',enabled:true,payload:{}};
  data.theater.options=[challenge];data.fieldServices.options=[challenge];
  data.sceneAction=(args,state)=>{assert.equal(args.action,challenge.id);state.world.战斗.状态='pending';return state;};
  data.battleAfterEnter={...data,world:{...data.world,战斗:{状态:'active',轮次:5}},battleId:'dojo-battle'};
  const app=harness(data);let tree=renderStage(app);await tick();tree=renderStage(app);
  await click(tree,'挑战格斗道场');await tick();
  const routes=app.calls.map(call=>call.route.split('/').at(-1));
  assert.ok(routes.indexOf('scene')>=0&&routes.indexOf('enter-battle')>routes.indexOf('scene'));
  assert.equal(routes.includes('plan'),false);assert.equal(routes.includes('intent'),false);
});

test('local facility claims use their dynamic action and payload, then refresh the service options',async()=>{
  const data=makeData(),claim={id:'facility-claim-pokemon',label:'复活菊石兽 Lv.5',enabled:true,payload:{speciesId:138,revision:0}};
  data.facilities.facilities=[{id:'museum-lab',name:'博物馆研究室',kind:'laboratory',description:'化石研究。',primaryAction:'facility-claim-pokemon'}];
  data.facilities.options=[claim];data.theater.options=[{...claim},{id:'facility-info',label:'博物馆研究室',enabled:true,payload:{facilityId:'museum-lab'}}];
  data.sceneAction=(args,state)=>{assert.equal(args.action,'facility-claim-pokemon');assert.equal(args.payload.speciesId,138);state.facilities.options=[];state.theater.options=[];return state;};
  const app=harness(data);let tree=renderStage(app);await tick();tree=renderStage(app);
  await click(tree,'博物馆研究室');tree=renderStage(app);
  let scene=walk(tree,node=>node.type?.name==='TheaterScene')[0],theater=app.render(scene.type,scene.props,'theater');
  await click(theater,'复活菊石兽 Lv.5');await tick();tree=renderStage(app);
  scene=walk(tree,node=>node.type?.name==='TheaterScene')[0];theater=app.render(scene.type,scene.props,'theater');
  assert.ok(walk(theater,node=>node.type==='p'&&node.children.join('').includes('复活菊石兽 Lv.5')).length);
  assert.equal(buttons(theater).some(item=>label(item)==='复活菊石兽 Lv.5'),false,'refreshed facility options remove an already completed claim');
  assert.equal(app.calls.filter(call=>call.route.endsWith('/scene')).at(-1).args.action,'facility-claim-pokemon');
});

test('field claims execute directly and return updated local field-service choices',async()=>{
  const data=makeData(),claim={id:'field-claim-itemfinder',label:'领取探宝器',enabled:true,payload:{item:'itemfinder'}};
  data.fieldServices.options=[claim];data.theater.options=[claim];
  data.sceneAction=(args,state)=>{assert.equal(args.action,'field-claim-itemfinder');state.fieldServices.options=[];state.theater.options=[];return state;};
  const app=harness(data);let tree=renderStage(app);await tick();tree=renderStage(app);
  await click(tree,'领取探宝器');await tick();
  assert.equal(app.calls.filter(call=>call.route.endsWith('/scene')).at(-1).args.action,'field-claim-itemfinder');
  assert.equal(app.calls.some(call=>/\/(plan|intent)$/.test(call.route)),false);
});

test('department floor buttons drive real MVU purchases and rooftop trade without leaking Game Corner goods',async()=>{
 const mvu=require('../mvu.cjs'),variables=mvu.chooseStarter(mvu.createInitialMvu(),1),world=variables.stat_data.宝可梦;
 world.地图.节点='celadon';world.地图.地点='玉虹市';world.地图.轮次=2;world.战斗={状态:'finished',轮次:2,结果:''};world.遭遇=null;world.训练家.金钱=10000;
 const data={...mvu.worldView(variables,{storyTurn:9}),writable:true,turn:9};
 data.sceneAction=(args,state)=>{const next=mvu.theaterAction({stat_data:{宝可梦:state.world}},args.action,{...args.payload,storyTurn:9});Object.assign(state,mvu.worldView(next,{storyTurn:9}));return state;};
 const app=harness(data);let tree=renderStage(app);await tick();tree=renderStage(app);await click(tree,'玉虹百货大厦');
 const view=()=>{const scene=walk(renderStage(app),node=>node.type?.name==='TheaterScene')[0];return app.render(scene.type,scene.props,'theater');};
 let theater=view();assert.equal(buttons(theater).some(item=>/枚代币/.test(label(item))),false);
 await click(theater,'前往顶楼广场');await tick();theater=view();await click(theater,'购买美味之水（200元）');await tick();
 assert.equal(data.world.背包.物品.freshwater,1);assert.equal(data.world.训练家.金钱,9800);
 const trade=data.facilities.options.find(option=>option.id==='facility-rooftop-trade'&&option.payload.drinkId==='freshwater');assert.ok(trade);
 await click(view(),trade.label);await tick();assert.equal(data.world.背包.物品.freshwater,0);assert.equal(data.world.背包.物品.tm16,1);
 assert.equal(app.calls.some(call=>/\/(plan|intent)$/.test(call.route)),false);
});

test('event portrait ID determines the actual character even when the spoken label is descriptive',async()=>{
 const data=makeData(),event={id:'portrait-check',title:'正辉的研究室',speaker:'救出的研究员',portraitId:'bill',text:'谢谢你来帮忙。',choices:[]};
 data.storyEvents={events:[event]};data.theater.options=[{id:'kanto-story-event',label:event.title,enabled:true,payload:{eventId:event.id}}];
 data.stageAssets={trainers:require('../public/data/trainers.json'),npcPortraits:{entries:[]},species:[],scenery:[],audio:{}};
 const app=harness(data);let tree=renderStage(app);await tick();tree=renderStage(app);await click(tree,event.title);tree=renderStage(app);
 const scene=walk(tree,node=>node.type?.name==='TheaterScene')[0],theater=app.render(scene.type,scene.props,'theater'),actor=walk(theater,node=>node.type?.name==='Portrait')[0];
 assert.ok(actor.props.person.url.includes('project-original/bill-v1.png'));assert.equal(actor.props.person.name,'救出的研究员');
});

test('special quest choices show their own stage and receipt rather than an old captured-battle summary',async()=>{
 const mvu=require('../mvu.cjs');let variables=mvu.chooseStarter(mvu.createInitialMvu(),4),world=variables.stat_data.宝可梦;
 world.地图.节点='pallet';world.地图.地点='真新镇';world.遭遇=null;world.战斗={状态:'finished',轮次:2,摘要:'野生宝可梦 · 战斗第3回合 · 收服成功。'};
 const data={...mvu.worldView(variables,{storyTurn:9}),writable:true,turn:9};
 data.sceneAction=(args,state)=>{variables=mvu.theaterAction({stat_data:{宝可梦:state.world}},args.action,{...args.payload,storyTurn:9});Object.assign(state,mvu.worldView(variables,{storyTurn:9}));return state;};
 const app=harness(data);let tree=renderStage(app);await tick();tree=renderStage(app);
 const toggle=buttons(tree).find(item=>/^当地委托/.test(label(item)));assert.ok(toggle);await toggle.props.onClick({stopPropagation(){}});tree=renderStage(app);
 const card=walk(tree,node=>node.type==='article'&&walk(node,item=>item.type==='strong'&&item.children.join('')==='把观察带回森林').length)[0];assert.ok(card);
 await click(card,'了解委托与调查方案');
 const service=()=>{const element=walk(renderStage(app),node=>node.type?.name==='TheaterScene')[0];return app.render(element.type,element.props,'quest-service');};
 let dialog=service();const choice=buttons(dialog).find(item=>/^选择方案并接取：保留/.test(label(item)));assert.ok(choice);
 await choice.props.onClick({stopPropagation(){}});await tick();dialog=service();
 const text=walk(dialog,node=>node.type==='p').flatMap(node=>node.children).filter(item=>typeof item==='string').join(' ');
 assert.match(text,/走出研究室|常青森林/);assert.doesNotMatch(text,/战斗第3回合|收服成功/);
 assert.equal(data.world.委托.深度记录['oak-open-field'].status,'active');
 assert.ok(app.calls.some(call=>call.route.endsWith('/scene')&&call.args.action==='deep-quest-accept'&&call.args.payload.choiceId==='private'));
 assert.equal(app.calls.some(call=>/\/(plan|intent)$/.test(call.route)),false);
 assert.match(data.world.战斗.摘要,/收服成功/,'quest presentation must not destroy the real previous battle record');
});
