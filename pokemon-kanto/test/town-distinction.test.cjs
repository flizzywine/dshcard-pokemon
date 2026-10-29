'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const mvu=require('../mvu.cjs'),field=require('../field-skills.cjs'),{presentation}=require('../presentation.cjs');
const map=require('../public/data/map.json');
const root=v=>v.stat_data.宝可梦;
const badges=['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章','深红徽章','绿色徽章'];
function ready(node){const v=mvu.chooseStarter(mvu.createInitialMvu(),1),w=root(v);w.地图.节点=node;w.地图.地点=node;w.地图.轮次=2;w.战斗={状态:'finished',轮次:2,结果:''};w.遭遇=null;return v;}
const scene=(v,action,payload={})=>mvu.theaterAction(v,action,{...payload,storyTurn:20});
const facility=(v,action,payload={})=>scene(v,action,{revision:root(v).城市设施.revision,...payload});

test('map adjacency is reciprocal; Victory Road requires all eight badges and Saffron tea does not trap legacy travelers',()=>{
 const byId=new Map(map.map(node=>[node.id,node]));for(const node of map)for(const next of node.links)assert.ok(byId.get(next)?.links.includes(node.id),`${node.id}/${next}`);
 let v=ready('route22');root(v).训练家.徽章=badges.slice(0,7);assert.equal(field.validateTravel(v,'route23').allowed,false);
 root(v).训练家.徽章=badges;assert.equal(field.validateTravel(v,'route23').allowed,true);assert.equal(byId.get('victory-road').requiresBadges,8);
 v=ready('route7');assert.equal(field.validateTravel(v,'saffron').allowed,false);
 root(v).地图.节点='celadon';v=scene(v,'field-claim-tea',{item:'tea'});root(v).地图.节点='route7';assert.equal(field.validateTravel(v,'saffron').allowed,true);
 v=mvu.travel(v,'saffron');assert.equal(root(v).剧情.关都事件.标记.saffronGateOpen,true);assert.ok(!root(v).背包.关键物品.includes('tea'));
 v=ready('route7');root(v).委托.探访地点.push('saffron');assert.equal(field.validateTravel(v,'saffron').allowed,true);
});

test('paid Safari retains HM03 story and sends gold teeth back to the Fuchsia warden',()=>{
 let v=ready('fuchsia');assert.throws(()=>mvu.travel(v,'safari'),/支付500|付费/);
 v=facility(v,'facility-safari-enter');assert.equal(presentation(root(v)).scene.sceneryId,'original-safari-zone');
 assert.ok(mvu.worldView(v).theater.options.some(o=>o.payload?.eventId==='safari-secret-house-surf'));
 v=scene(v,'kanto-story-event',{eventId:'safari-secret-house-surf',choiceId:'follow-map'});v=scene(v,'kanto-story-event',{eventId:'safari-secret-house-surf',choiceId:'promise-care'});assert.equal(root(v).背包.物品.hm03,1);
 v=scene(v,'kanto-story-event',{eventId:'safari-gold-teeth-strength',choiceId:'lift-post'});
 assert.ok(!mvu.worldView(v).theater.options.some(o=>o.payload?.eventId==='safari-gold-teeth-strength'));
 v=facility(v,'facility-safari-exit');const option=mvu.worldView(v).theater.options.find(o=>o.payload?.eventId==='safari-gold-teeth-strength');assert.ok(option);
 v=scene(v,option.id,option.payload);assert.equal(root(v).背包.物品.hm04,1);assert.equal(root(v).剧情.剧场.角色,'gentleman');
});

test('department floors buy into the real bag, drinks heal and the same inventory trades for a one-time TM',()=>{
 let v=ready('celadon');root(v).训练家.金钱=30000;
 v=facility(v,'facility-department-floor',{floor:'4F'});v=facility(v,'facility-department-buy',{itemId:'firestone'});assert.equal(root(v).背包.物品.firestone,1);assert.equal(root(v).训练家.金钱,27900);
 assert.equal(presentation(root(v)).scene.sceneryId,'original-department-store');
 v=facility(v,'facility-department-floor',{floor:'rooftop'});v=facility(v,'facility-department-buy',{itemId:'freshwater',count:2});assert.equal(root(v).背包.物品.freshwater,2);
 root(v).队伍[0].当前HP=1;v=mvu.useItem(v,'freshwater','starter');assert.equal(root(v).背包.物品.freshwater,1);assert.equal(root(v).队伍[0].当前HP,root(v).队伍[0].能力值.hp);
 const payload={drinkId:'freshwater',revision:root(v).城市设施.revision};v=scene(v,'facility-rooftop-trade',payload);assert.equal(root(v).背包.物品.freshwater,0);assert.equal(root(v).背包.物品.tm16,1);
 v=scene(v,'facility-rooftop-trade',payload);assert.equal(root(v).背包.物品.tm16,1,'replayed redemption does not duplicate the reward');
 assert.equal(root(v).城市设施.departmentStore.drinks,undefined);
});

test('MVU normalization migrates an old department drinks stash exactly once into the bag',()=>{
 let v=ready('celadon'),w=root(v);w.城市设施.departmentStore={floor:'rooftop',drinks:{freshwater:2,sodapop:0,lemonade:0},traded:{freshwater:false,sodapop:false,lemonade:false}};
 v=mvu.ensureMvuDefaults(v);assert.equal(root(v).背包.物品.freshwater,2);v=mvu.ensureMvuDefaults(v);assert.equal(root(v).背包.物品.freshwater,2);
});

test('Pallet leaves the lab after opening; a finished gym battle does not force the town into an arena',()=>{
 let v=ready('pallet');assert.equal(presentation(root(v)).scene.backgroundId,'pallet-town');
 v=ready('cerulean');root(v).遭遇={类型:'gym',训练家:'小霞',道馆:1,队伍:[]};assert.notEqual(presentation(root(v)).scene.sceneryType,'stadium');
 v=ready('saffron');v=scene(v,'trainer-battle');assert.equal(root(v).遭遇.队伍[0].等级,30);
});

test('the exact game Blue reference identity wins over the shorter manga Green alias',()=>{
 const v=ready('pallet');root(v).遭遇={类型:'trainer',训练家:'青绿（游戏版参考）',队伍:[]};assert.equal(presentation(root(v)).scene.npcId,'game-blue-reference');
});
