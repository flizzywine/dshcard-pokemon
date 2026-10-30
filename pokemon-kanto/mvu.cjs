'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {Dex, catalog} = require('./engine.cjs');
const scenes = require('./scenes.cjs');
const companionship = require('./companionship.cjs');
const npcQuests = require('./npc-quests.cjs');
const specialEncounters = require('./special-encounters.cjs');
const starterConfig = require('./starter-config.cjs');
const {levelCap, shopFor} = require('./progression-rules.cjs');
const growth = require('./growth-mechanics.cjs');
const machineAcquisitions = require('./machine-acquisitions.cjs');
const campaign=require('./story-campaign.cjs');
const storyEvents=require('./kanto-story-events.cjs');
const storyConversation=require('./story-conversation.cjs');
const gadgets=require('./quest-gadgets.cjs');
const fieldSkills=require('./field-skills.cjs');
const wildEncounters=require('./wild-encounter-adapter.cjs');
const frlgRewards=require('./frlg-rewards.cjs');
const frlgHeldItems=require('./frlg-held-items.cjs');
const cityFacilities=require('./city-facilities.cjs');
const fieldServices=require('./kanto-field-services.cjs');
const encounterBalance=require('./encounter-balance.cjs');
const classicServices=require('./classic-services.cjs');
const tileWorld=require('./tile-world.cjs');
const cosmetics=require('./cosmetics.cjs');
const rocketEvents=require('./rocket-boss-events.cjs');
const bossProfiles=require('./boss-profiles.cjs');
const hellChallenges=require('./hell-challenges.cjs');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data', name), 'utf8').replace(/^\uFEFF/, ''));
const locations = read('map.json');
const byNode = new Map(locations.map(n => [n.id, n]));
const byId = new Map(catalog.species.map(s => [s.id, s]));
const progression = fs.existsSync(path.join(__dirname, 'public/data/progression.json')) ? read('progression.json') : {};
const itemCatalog = [...read('items.json'),...read('field-items.json'),...read('special-balls.json')];
const knownItems=new Set(itemCatalog.map(item=>item.id));
for(const row of read('gen3-item-audit.json').items){
 if(knownItems.has(row.id)||row.sourcePocket==='POCKET_KEY_ITEMS'||row.sourcePocket==='POCKET_TM_CASE')continue;
 const mail=row.id.endsWith('mail'),held=mail||['cleansetag','everstone','redscarf','bluescarf','pinkscarf','greenscarf','yellowscarf'].includes(row.id);
 itemCatalog.push({id:row.id,name:({fabmail:'花边邮件',everstone:'不变之石',cleansetag:'洁净之符',moomoomilk:'哞哞鲜奶',lavacookie:'釜炎仙贝',superrepel:'白银喷雾',maxrepel:'黄金喷雾',escaperope:'离洞绳',repel:'除虫喷雾',pearl:'珍珠',bigpearl:'大珍珠',stardust:'星星沙子',starpiece:'星星碎片'})[row.id]||row.id,category:held?'held':'field',price:row.sourcePrice||0,description:row.note||'第三世代道具。'});
}
const tmhmCatalog = read('tmhm.json').filter(item => item.id !== 'hm08').map(item => {
 const moveNameZh=catalog.moves[item.move]?.name||item.moveName;
 return {...item,moveNameZh,nameZh:`${item.kind==='hm'?'HM':'TM'}${String(item.number).padStart(2,'0')} ${moveNameZh}`};
});
const itemsById = new Map([...itemCatalog, ...tmhmCatalog.map(item => ({...item, category: 'machine'}))].map(item => [item.id, item]));
const KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const zero = () => Object.fromEntries(KEYS.map(k => [k, 0]));
const clone = value => structuredClone(value);
const badges = ['岩石徽章', '蓝色徽章', '橙色徽章', '彩虹徽章', '粉红徽章', '金色徽章', '深红徽章', '绿色徽章'];
const gymTms = ['tm39', 'tm03', 'tm34', 'tm19', 'tm06', 'tm04', 'tm38', 'tm26'];
const gymLevels = [[12,14],[18,21],[21,18,24],[29,24,29],[37,39,37,43],[38,37,38,43],[42,40,42,47],[45,42,44,45,50]];
const LEGENDARY_SPECIES = new Set([144,145,146,150,151]);
const elite = [
 {name:'科拿',ids:[87,91,80,124,131],levels:[52,51,52,54,54]},
 {name:'希巴',ids:[95,107,106,95,68],levels:[51,53,53,54,56]},
 {name:'菊子',ids:[94,42,93,24,94],levels:[54,54,53,56,58]},
 {name:'阿渡',ids:[130,148,148,142,149],levels:[56,54,54,58,60]},
 {name:'冠军小茂',ids:[18,65,112,103,130,6],levels:[59,57,59,59,61,63]},
];
// 具名训练家的友谊对战队伍（关都 1—151）。等级随徽章数与所在节点成长；
// 没配对的角色仍用所在路段的路人队伍，名字照用玩家/正文给的。
const NAMED_TRAINER_TEAMS = {
 '小智':[25,1,7,4,58,6],
 '赤红':[1,4,7,25,130,6],
 '小黄':[25,35,113,26,131,103],
 '小蓝':[18,65,112,103,130,6],
 '小绿':[1,4,7,18,65,112],
 '大木博士':[16,19,21,25],
 '正辉':[81,82,137],
 '富士老人':[92,93,94],
 '武藏':[23,24,110,71],
 '小次郎':[52,109,110,71],
};
function namedTrainerTeam(name, world, node) {
 const badgeCount = world.训练家?.徽章?.length || 0;
 const base = Math.max(5, Number(node?.level) || 5, badgeCount * 4 + 3);
 // 小茂按玩家的初始御三家取克制的那只，随徽章成长（与劲敌线一致的规则）。
 if (name === '小茂') {
  const starter = {1:4,4:7,7:1}[world.剧情?.初始御三家编号 || world.队伍?.[0]?.图鉴编号] || 4;
  const evolved = starter + (badgeCount >= 5 ? 2 : badgeCount >= 2 ? 1 : 0);
  const ids = badgeCount >= 5 ? [18,65,112,evolved] : badgeCount >= 2 ? [17,64,evolved] : badgeCount >= 1 ? [16,evolved] : [evolved];
  return ids.map((id, index) => [id, Math.min(100, base + index)]);
 }
 const ids = NAMED_TRAINER_TEAMS[name];
 if (Array.isArray(ids) && ids.length) {
  const count = Math.min(ids.length, badgeCount >= 6 ? 6 : badgeCount >= 3 ? 4 : badgeCount >= 1 ? 3 : 2);
  return ids.slice(0, count).map((id, index) => [id, Math.min(100, base + index)]);
 }
 // 馆主与四天王的友谊战用他们自己的招牌队伍，等级随徽章走（正式道馆战仍走 challenge-gym）。
 const gym = catalog.gyms.find(item => item.name === name);
 if (gym) return gym.ids.map((id, index) => [id, Math.min(100, base + index)]);
 const eliteRow = elite.find(item => item.name === name);
 if (eliteRow) return eliteRow.ids.map((id, index) => [id, Math.min(100, base + index)]);
 return null;
}
function integer(n, low, high, label) {
 if (!Number.isInteger(n) || n < low || n > high) throw Error(`${label}须为${low}—${high}整数。`);
 return n;
}
function stats(mon,{allowOvercap=false}={}) {
 const s = byId.get(mon.图鉴编号); if (!s) throw Error('图鉴编号只支持1—151。');
 const nature = Dex.natures.get(mon.性格 || 'Serious'); if (!nature.exists) throw Error('未知性格。');
 if(allowOvercap&&mon.突破?.mode==='hell-npc')return require('./npc-overcap.cjs').calculate(s.stats,mon.等级,nature);
 return Object.fromEntries(KEYS.map(k => {
  const base = Math.floor((2 * s.stats[k] + mon.个体值[k] + Math.floor(mon.努力值[k] / 4)) * mon.等级 / 100);
  return [k, k === 'hp' ? base + mon.等级 + 10 : Math.floor((base + 5) * (nature.plus === k ? 1.1 : nature.minus === k ? 0.9 : 1))];
 }));
}
function expAt(level, speciesId) {
 if (level <= 1) return 0;
 const n = level, rate = progression[speciesId]?.growthRate || 2;
 // PokéAPI growth IDs: slow=1, medium=2, fast=3, medium-slow=4, erratic=5, fluctuating=6.
 if (rate === 1) return Math.floor(5 * n ** 3 / 4);
 if (rate === 3) return Math.floor(4 * n ** 3 / 5);
 if (rate === 4) return Math.max(0, Math.floor(6 * n ** 3 / 5 - 15 * n * n + 100 * n - 140));
 if (rate === 5) return Math.floor(n ** 3 * (n <= 50 ? (100-n)/50 : n <= 68 ? (150-n)/100 : n <= 98 ? (1911-10*n)/1500 : (160-n)/100));
 if (rate === 6) return Math.floor(n ** 3 * (n <= 15 ? (Math.floor((n+1)/3)+24)/50 : n <= 36 ? (n+14)/50 : (Math.floor(n/2)+32)/50));
 return n ** 3;
}
function naturalMoves(id, level) {
 const choices = growth.levelMoves(id).filter(entry => entry.level <= level);
 const picked = choices.slice(-4).map(m => m.move);
 return picked.length ? picked : byId.get(id).defaultMoves.slice(0, 4);
}
function makeMon(id, level, uid, options = {}) {
 const s = byId.get(id); if (!s) throw Error('不支持的精灵。');
 const seed = createHash('sha256').update(uid).digest();
 const mon = {uid,图鉴编号:id,昵称:s.name,等级:level,经验:expAt(level,id),性格:'Serious',特性:s.abilities[0],
  个体值:Object.fromEntries(KEYS.map((k,i)=>[k,options.starter ? 25 : seed[i] % 32])),努力值:zero(),能力值:{},当前HP:0,状态:'',
  招式:naturalMoves(id,level).map(key=>({id:key,PP:catalog.moves[key].pp,PP上限:catalog.moves[key].pp})),亲密度:70,闪光:options.shiny===true||options.wild===true&&seed.readUInt16BE(6)%8192===0};
 if(options.wild)mon.携带道具=frlgHeldItems.generate(id,uid);
 if(options.moves)mon.招式=options.moves.map(id=>({id,PP:catalog.moves[id].pp,PP上限:catalog.moves[id].pp}));
 if(options.ivs)Object.assign(mon.个体值,options.ivs);if(options.evs)Object.assign(mon.努力值,options.evs);
 if(options.nature)mon.性格=options.nature;if(options.ability)mon.特性=options.ability;if(options.heldItem)mon.携带道具=options.heldItem;
 mon.能力值=stats(mon);mon.当前HP=mon.能力值.hp; return mon;
}
function root(variables) {
 const w = variables?.stat_data?.宝可梦;
 if (!w || typeof w !== 'object') throw Error('MVU缺少 stat_data.宝可梦。');
 return w;
}
function checkMon(mon,{allowOvercap=false}={}) {
 const s = byId.get(mon?.图鉴编号); if (!s) throw Error('MVU包含关都151以外的精灵。');
 if(mon.闪光!==undefined&&typeof mon.闪光!=='boolean')throw Error('闪光标记须为布尔值。');
 if (typeof mon.uid !== 'string' || !mon.uid || mon.uid.length>100) throw Error('每只精灵需要唯一uid。');
 integer(mon.等级,1,100,'等级'); integer(mon.经验,0,2000000,'经验');
 if (!s.abilities.includes(mon.特性)) throw Error(`${s.name}的特性不是第三世代特性。`);
 if(mon.携带道具&&!itemsById.get(mon.携带道具)?.category?.includes('held'))throw Error('携带道具必须是本包支持的第三世代物品。');
 for (const k of KEYS) {integer(mon.个体值?.[k],0,31,'个体值');integer(mon.努力值?.[k],0,255,'努力值');}
 if (KEYS.reduce((sum,k)=>sum+mon.努力值[k],0)>510) throw Error('努力值总和不能超过510。');
 if(mon.突破&&(!allowOvercap||mon.突破.mode!=='hell-npc'||mon.突破.iv!==63||mon.突破.evPerStat!==510||mon.突破.evTotal!==3060))throw Error('突破配置仅限地狱训练家对手。');
 const calculated=stats(mon,{allowOvercap});
 if (KEYS.some(k=>mon.能力值?.[k]!==calculated[k])) throw Error(`${s.name}的MVU能力值与等级、性格、IV/EV不一致，请先修正。`);
 integer(mon.当前HP,0,calculated.hp,'当前HP');
 if (!['','brn','psn','tox','par','slp','frz'].includes(mon.状态)) throw Error('无效异常状态。');
 if (!Array.isArray(mon.招式)||!mon.招式.length||mon.招式.length>4||new Set(mon.招式.map(m=>m.id)).size!==mon.招式.length) throw Error('每只精灵需要1—4个不同招式。');
 for (const m of mon.招式) {
  if (!s.moves.includes(m.id)||!growth.canKnowMove(mon.图鉴编号,m.id)) throw Error(`${s.name}在火红叶绿无法学习${m.id}。`);
  const base=catalog.moves[m.id].pp;
  if (![0,1,2,3].some(up=>Math.floor(base*(5+up)/5)===m.PP上限)) throw Error('PP上限与招式不符。');
  integer(m.PP,0,m.PP上限,'剩余PP');
 }
 if (mon.待学招式!==undefined&&(!Array.isArray(mon.待学招式)||new Set(mon.待学招式).size!==mon.待学招式.length||mon.待学招式.some(id=>!growth.canLearnLevelMove(mon.图鉴编号,id)))) throw Error(`${s.name}的待学招式资料无效。`);
 if(mon.待进化!==undefined){
  if(!Array.isArray(mon.待进化)||mon.待进化.length>1)throw Error('待进化事项格式无效。');
  for(const decision of mon.待进化){const target=growth.evolutionAtLevel(mon.图鉴编号,mon.等级,mon.亲密度||0);if(!decision||typeof decision.id!=='string'||decision.id.length>160||decision.from!==mon.图鉴编号||decision.to!==target?.num||!Number.isInteger(decision.level)||decision.level>mon.等级)throw Error('待进化事项与当前宝可梦不符。');}
 }
 return mon;
}
function updateDexStats(world, {seen = [], caught = []} = {}) {
 const fromMons=(mons, predicate)=>mons.filter(predicate).flatMap(mon=>[Number(mon.收服图鉴编号),Number(mon.图鉴编号)]).filter(id=>Number.isInteger(id)&&id>=1&&id<=151);
 const seenIds=new Set([...(world.统计?.见过图鉴||[]),...fromMons([...world.队伍||[],...world.电脑||[],...(world.遭遇?.队伍||[]).slice(0,1)],()=>true),...seen]);
 const caughtIds=new Set([...(world.统计?.捕获图鉴||[]),...fromMons([...world.队伍||[],...world.电脑||[]],mon=>!(mon.uid==='starter'&&world.剧情?.初始御三家已选===false)),...caught]);
 world.统计.见过图鉴=[...seenIds].filter(id=>Number.isInteger(id)&&id>=1&&id<=151);
 world.统计.捕获图鉴=[...caughtIds].filter(id=>Number.isInteger(id)&&id>=1&&id<=151);
}
function validateMvu(variables) {
 const w=root(variables);
 if (!Array.isArray(w.队伍)||w.队伍.length<1||w.队伍.length>6) throw Error('MVU队伍需要1—6只精灵。');
 if (!Array.isArray(w.电脑)||w.电脑.length>420) throw Error('电脑精灵容量超过初版上限420。');
 const ids=new Set();for(const mon of [...w.队伍,...w.电脑]){checkMon(mon);if(ids.has(mon.uid))throw Error('精灵uid重复。');ids.add(mon.uid);}
 if (!byNode.has(w.地图?.节点)) throw Error('地图节点不存在。');
 integer(w.地图.轮次,0,1000000,'剧情轮次');integer(w.训练家?.金钱,0,9999999,'金钱');
 if(typeof w.设置?.bondBattleEffects!=='boolean')throw Error('羁绊战斗效果开关须为布尔值。');
 if (!Array.isArray(w.训练家.徽章)||new Set(w.训练家.徽章).size!==w.训练家.徽章.length||w.训练家.徽章.some(x=>!badges.includes(x)))throw Error('徽章资料无效。');
 if(!w.背包||!w.背包.物品||typeof w.背包.物品!=='object'||Array.isArray(w.背包.物品))throw Error('背包资料无效。');
 for(const key of Object.keys(w.背包.物品))if(!itemsById.has(key))throw Error(`背包包含未知物品${key}。`);
 for(const key of itemsById.keys())integer(w.背包.物品[key],0,999,'物品数量');
 if(w.剧情?.待领取挑战奖励!==undefined){const pending=w.剧情.待领取挑战奖励;if(!pending||typeof pending!=='object'||Array.isArray(pending))throw Error('待领取挑战奖励无效。');for(const [id,count] of Object.entries(pending)){if(!['ppmax','luckyegg','leftovers','masterball'].includes(id))throw Error('待领取挑战奖励无效。');integer(count,0,1000000,'待领取挑战奖励');}}
 if (!['pending','active','finished'].includes(w.战斗?.状态))throw Error('战斗状态无效。');
 integer(w.战斗.操作序号,0,1000000000,'战斗操作序号');
 if (!Array.isArray(w.任务))throw Error('任务资料无效。');
 if(w.遭遇){if(!['wild','trainer','gym'].includes(w.遭遇.类型)||!Array.isArray(w.遭遇.队伍)||w.遭遇.队伍.length<1||w.遭遇.队伍.length>6)throw Error('MVU遭遇数据无效。');w.遭遇.队伍.forEach(mon=>checkMon(mon,{allowOvercap:w.遭遇.类型!=='wild'&&(w.设置.对手难度==='hell'||w.遭遇.难度应用?.level==='hell')}));}
 if(w.羁绊!==undefined)companionship.validate(w);
 if(w.委托!==undefined)npcQuests.validate(w);
 if(w.剧情?.已完成支线对战!==undefined)specialEncounters.validate(w);
 if(w.剧情?.关都主线!==undefined)campaign.validate(w);
 if(w.剧情?.关都事件!==undefined)storyEvents.validate(w);
 if(w.城市设施!==undefined)cityFacilities.validate(w);
 if(w.剧情?.场地服务!==undefined)fieldServices.validate(w);
 if(w.经典设施!==undefined)classicServices.validate(w);
 if(w.tileWorld!==undefined&&!tileWorld.validate(w).ok)throw Error('逐格地图位置无效。');
 if(w.外观!==undefined)cosmetics.validate(w);
 if(w.剧情?.火箭队剧情!==undefined)rocketEvents.validate(w);
 if(!['auto','original','enhanced','extreme'].includes(w.设置.bossTier))throw Error('首领强度配置无效。');
 if(!['singles','doubles'].includes(w.设置.battleMode))throw Error('请选择单打或双打。');
 return true;
}
function recalculateDerived(variables) {
 const next=clone(variables),w=next?.stat_data?.宝可梦;
 if(!w||typeof w!=='object')return next;
 const collections=[w.队伍,w.电脑,w.遭遇?.队伍];
 for(const list of collections){
  if(!Array.isArray(list))continue;
  for(const mon of list){
   // Recalculate only well-formed legal inputs. Invalid IV/EV/nature/species
   // stay visible to validateMvu instead of being normalized away.
   const species=byId.get(mon?.图鉴编号), nature=Dex.natures.get(mon?.性格||'Serious');
   if(!species||!nature.exists||!Number.isInteger(mon?.等级)||mon.等级<1||mon.等级>100)continue;
   if(KEYS.some(k=>!Number.isInteger(mon?.个体值?.[k])||mon.个体值[k]<0||mon.个体值[k]>31||
     !Number.isInteger(mon?.努力值?.[k])||mon.努力值[k]<0||mon.努力值[k]>255)||
     KEYS.reduce((sum,k)=>sum+(mon.努力值?.[k]||0),0)>510)continue;
   const oldMax=mon.能力值?.hp;
   const hp=mon.当前HP;
   mon.能力值=stats(mon,{allowOvercap:list===w.遭遇?.队伍&&w.遭遇?.类型!=='wild'&&(w.设置?.对手难度==='hell'||w.遭遇?.难度应用?.level==='hell')});
   if(Number.isInteger(hp)){
    if(hp===0)mon.当前HP=0;
    else mon.当前HP=Math.max(0,Math.min(mon.能力值.hp,hp+(Number.isInteger(oldMax)?mon.能力值.hp-oldMax:0)));
   }
  }
 }
 return next;
}
const TASKS = [
 {id:'choose-starter',name:'选择最初的伙伴',description:'选择妙蛙种子、小火龙或杰尼龟。',kind:'starter'},
 {id:'defeat-rival',name:'战胜小茂',description:'在真新镇战胜劲敌小茂。',kind:'rival'},
 {id:'catch-pokemon',name:'收服第一只伙伴',description:'捕捉一只野生宝可梦。',kind:'caught',target:1},
 {id:'first-badge',name:'获得第一枚徽章',description:'挑战并战胜第一座道馆馆主。',kind:'badge',target:1},
 ...badges.slice(1).map((badge,index)=>({id:`badge-${index+2}`,name:`获得${badge}`,description:`依次挑战并战胜第${index+2}座道馆馆主。`,kind:'badge',target:index+2})),
 {id:'catch-5',name:'结识五位伙伴',description:'累计收服5只野生宝可梦。',kind:'caught',target:5},
 {id:'catch-10',name:'组成丰富的伙伴图鉴',description:'累计收服10只野生宝可梦。',kind:'caught',target:10},
 {id:'league-four',name:'挑战关都联盟',description:'取得八枚徽章后，战胜四天王。',kind:'league',target:4},
 {id:'league-champion',name:'成为关都冠军',description:'战胜冠军小茂，完成关都联盟挑战。',kind:'league',target:5},
];
function syncTasks(world) {
 const defeated=new Set(world.剧情.已击败训练家||[]);
 const caught=Math.max(Number.isInteger(world.统计?.捕获次数)?world.统计.捕获次数:0,Number.isInteger(world.剧情.捕获次数)?world.剧情.捕获次数:0,[...(world.队伍||[]),...(world.电脑||[])].filter(mon=>mon.收服来源==='wild'||mon.uid?.startsWith('caught-')).length);
 const rivalDefeated=!!world.统计?.首次击败小茂||!!world.剧情.首次击败小茂||defeated.has('小茂');
 const badgeCount=Array.isArray(world.训练家?.徽章)?world.训练家.徽章.length:0;
 const leagueProgress=Math.max(0,Math.min(5,Number.isInteger(world.剧情?.联盟进度)?world.剧情.联盟进度:0));
 const completedStarter=world.剧情.初始御三家已选===true;
 const stateFor=(task)=>{
  let current=0,unlocked=true;const target=task.target||1;
  if(task.kind==='starter')current=completedStarter?1:0;
  else if(task.kind==='rival'){current=rivalDefeated?1:0;unlocked=completedStarter||rivalDefeated;}
  else if(task.kind==='caught')current=Math.min(caught,task.target);
  else if(task.kind==='badge'){current=Math.min(badgeCount,task.target);unlocked=task.target===1||badgeCount>=task.target-1;}
  else if(task.kind==='league'){
   current=Math.min(leagueProgress,task.target);
   unlocked=task.target===4?badgeCount>=8:leagueProgress>=4;
  }
  return {current, status:!unlocked?'未解锁':current>=target?'已完成':'进行中'};
 };
 const old=Array.isArray(world.任务)?world.任务:[];
 const generated=TASKS.map(task=>{
  const {current,status}=stateFor(task);
  return {...task,标题:task.name,说明:task.description,描述:task.description,状态:status,进度:current,目标:task.target||1};
 });
 const order={'进行中':0,'未解锁':1,'已完成':2};
 generated.sort((a,b)=>order[a.状态]-order[b.状态]||TASKS.findIndex(task=>task.id===a.id)-TASKS.findIndex(task=>task.id===b.id));
 world.任务=[...generated,...old.filter(task=>task&&typeof task.id==='string'&&!TASKS.some(base=>base.id===task.id))];
}
function ensureMvuDefaults(variables) {
 if(!variables?.stat_data?.宝可梦)return clone(variables);
 const next=clone(variables),w=next.stat_data.宝可梦;
 if(!w.背包||typeof w.背包!=='object')w.背包={物品:{},关键物品:[]};
 if(!w.背包.物品||typeof w.背包.物品!=='object'||Array.isArray(w.背包.物品))w.背包.物品={};
 const legacy=Object.keys(w.背包.物品).length===0;
 // Early MVU drafts used the engine's old `ball` shorthand. Migrate it
 // before filling defaults so a spent/existing quantity can never be topped
 // back up by the legacy starter inventory.
 if(!Object.hasOwn(w.背包.物品,'pokeball')&&Number.isInteger(w.背包.物品.ball))w.背包.物品.pokeball=w.背包.物品.ball;
 delete w.背包.物品.ball;
 for(const item of itemCatalog)if(!Object.hasOwn(w.背包.物品,item.id))w.背包.物品[item.id]=legacy?(item.id==='potion'?3:item.id==='pokeball'?5:0):0;
 for(const machine of tmhmCatalog)if(!Object.hasOwn(w.背包.物品,machine.id))w.背包.物品[machine.id]=0;
 if(!Array.isArray(w.背包.关键物品))w.背包.关键物品=[];
 if(w.邮件收纳===undefined)w.邮件收纳=[];
 if(w.战斗&&w.战斗.操作序号===undefined)w.战斗.操作序号=0;
 if(w.战斗?.战报)delete w.战斗.战报;
 if(!w.剧情||typeof w.剧情!=='object')w.剧情={};
 if(!Array.isArray(w.剧情.已击败训练家))w.剧情.已击败训练家=[];
 if(!w.剧情.已领取机器||typeof w.剧情.已领取机器!=='object'||Array.isArray(w.剧情.已领取机器))w.剧情.已领取机器={};
 if(!Array.isArray(w.剧情.特殊遭遇已触发))w.剧情.特殊遭遇已触发=[];
 if(typeof w.剧情.首次击败小茂!=='boolean')w.剧情.首次击败小茂=w.剧情.已击败训练家.includes('小茂');
 if(!Number.isInteger(w.剧情.捕获次数)||w.剧情.捕获次数<0)w.剧情.捕获次数=[...(w.队伍||[]),...(w.电脑||[])].filter(mon=>mon.收服来源==='wild'||mon.uid?.startsWith('caught-')).length;
 if(!w.统计||typeof w.统计!=='object')w.统计={};
 if(typeof w.统计.首次击败小茂!=='boolean')w.统计.首次击败小茂=!!w.剧情.首次击败小茂||w.剧情.已击败训练家.includes('小茂');
 if(!Number.isInteger(w.统计.捕获次数)||w.统计.捕获次数<0)w.统计.捕获次数=w.剧情.捕获次数;
 if(!Array.isArray(w.统计.见过图鉴))w.统计.见过图鉴=[];
 if(!Array.isArray(w.统计.捕获图鉴))w.统计.捕获图鉴=[];
 updateDexStats(w);
 if(!Array.isArray(w.训练家?.徽章))w.训练家.徽章=[];
 if(!w.设置||typeof w.设置!=='object'||Array.isArray(w.设置))w.设置={};
 if(w.设置.对手难度===undefined)w.设置.对手难度='normal';
 if(!['firered','leafgreen'].includes(w.设置.版本))w.设置.版本='firered';
 if(w.设置.战后补给===undefined)w.设置.战后补给=true;
 if(typeof w.设置.bondBattleEffects!=='boolean')w.设置.bondBattleEffects=true;
 if(!['auto','original','enhanced','extreme'].includes(w.设置.bossTier))w.设置.bossTier='auto';
 if(!['singles','doubles'].includes(w.设置.battleMode))w.设置.battleMode='singles';
 w.经典设施=classicServices.ensure(w).经典设施;tileWorld.ensure(w);cosmetics.ensure(w);rocketEvents.ensure(w);
 companionship.ensure(w);
 specialEncounters.ensure(w);
 campaign.ensure(w);storyEvents.ensure(w);storyConversation.ensure(w);gadgets.ensure(w);
 fieldServices.ensure(w);const cityDefaults=cityFacilities.ensure(w);w.城市设施=cityDefaults.城市设施;w.背包=cityDefaults.背包;
 npcQuests.ensure(w);syncTasks(w);npcQuests.refresh(w,{storyTurn:w.地图?.轮次});return next;
}
function inventoryFromRecord(recordBag) {
 const source=recordBag&&typeof recordBag==='object'?recordBag:{};
 return Object.fromEntries(itemCatalog.map(item=>[item.id,Number.isInteger(source[item.id])?source[item.id]:
  item.id==='potion'&&Number.isInteger(source.potion)?source.potion:
  item.id==='pokeball'?(Number.isInteger(source.pokeball)?source.pokeball:Number.isInteger(source.ball)?source.ball:5):0]));
}
function createInitialMvu(starter=1) {
 if(![1,4,7].includes(starter))throw Error('请选择关都御三家。');
 const w={版本:1,训练家:{姓名:'训练家',金钱:3000,徽章:[]},地图:{区域:'关都',节点:'pallet',地点:'真新镇',轮次:0},
 队伍:[makeMon(starter,5,'starter',{starter:true})],电脑:[],背包:{物品:Object.fromEntries([...itemCatalog,...tmhmCatalog].map(item=>[item.id,item.id==='potion'?3:item.id==='pokeball'?5:0])),关键物品:[]},
 剧情:{初始御三家已选:false,联盟进度:0,首次击败小茂:false,捕获次数:0,已击败训练家:[]},统计:{首次击败小茂:false,捕获次数:0},任务:[],遭遇:null,战斗:{轮次:0,状态:'finished',结果:'',摘要:'大木博士赠予了你的第一位伙伴。'}};
 return ensureMvuDefaults(ensureEncounter({stat_data:{宝可梦:w}},1));
}
function ensureEncounter(variables,turn) {
 integer(turn,1,1000000,'剧情轮次'); const next=ensureMvuDefaults(variables),w=root(next);
 if(w.城市设施?.safari?.status==='active')throw Error('狩猎地带请使用狩猎球、诱饵和石头处理遭遇。');
 if(w.战斗.轮次===turn && w.遭遇)return next;
 if(['pending','active'].includes(w.战斗.状态)&&w.战斗.轮次!==turn)throw Error('上一轮战斗尚未结束，请先完成战斗。');
 const node=byNode.get(w.地图.节点);if(!node)throw Error('未知地点。');
 let encounter;
 if(turn===1 && w.地图.节点==='pallet') {
  const rival={1:4,4:7,7:1}[w.队伍[0].图鉴编号]||4;
  encounter={类型:'trainer',训练家:'小茂',队伍:[makeMon(rival,5,`rival-${turn}`)]};
 } else if(node.id==='indigo' && campaign.canEnterElite(w) && (w.剧情.联盟进度||0)<5) {
  const stage=w.剧情.联盟进度||0,foe=elite[stage];encounter={类型:'trainer',训练家:foe.name,联盟:stage,队伍:foe.ids.map((id,i)=>makeMon(id,foe.levels[i],`elite-${stage}-${i}-${turn}`))};
 } else if(node.kind==='town') {
  w.地图.轮次=turn;w.遭遇=null;w.战斗={轮次:turn,状态:'finished',结果:'',摘要:`抵达${node.name}，可与居民交谈、补给或主动接受挑战。`,操作序号:0};return next;
 } else {
  const selected=wildEncounters.choose(w,turn);
  encounter={类型:'wild',训练家:'野生宝可梦',版本:selected.version,方法:selected.method,来源地图:selected.sourceMap,队伍:[makeMon(selected.speciesId,selected.level,`wild-${node.id}-${turn}`,{wild:true})]};
 }
 w.地图.轮次=turn;w.遭遇=encounter;w.战斗={轮次:turn,状态:'pending',结果:'',摘要:`${node.name}：${encounter.训练家}等待对战。`,操作序号:0};
 updateDexStats(w,{seen:w.遭遇?.队伍?.map(mon=>mon.图鉴编号)||[]});
 validateMvu(next);return next;
}
function toEngine(mon,{bondTrust=0,bondBattleEffects=false}={}) {
 return {id:mon.图鉴编号,uid:mon.uid,name:mon.昵称,shiny:mon.闪光===true,level:mon.等级,ivs:mon.个体值,evs:mon.努力值,nature:mon.性格,ability:mon.特性,happiness:mon.亲密度??70,
 bondTrust,bondBattleEffects,
 item:mon.持有邮件&&mon.持有邮件.itemId===mon.携带道具?'mail':mon.携带道具==='expshare'?'':mon.携带道具||'',
 moves:mon.招式.map(m=>m.id),state:{hp:mon.当前HP,status:mon.状态,...(mon.突破?{overcap:clone(mon.突破)}:{}),moves:mon.招式.map(m=>({id:m.id,pp:m.PP,maxpp:m.PP上限,
 ppUps:[0,1,2,3].find(up=>Math.floor(catalog.moves[m.id].pp*(5+up)/5)===m.PP上限)||0}))}};
}
function startFromMvu(game,variables) {
 validateMvu(variables);const w=root(variables);
 if(w.城市设施?.safari?.status==='active')throw Error('狩猎地带使用专用狩猎操作，不派宝可梦战斗。');
 if(w.战斗.状态!=='pending')throw Error('本轮战斗已经开始或结束，不能重新生成。');
 if(!w.队伍.some(m=>m.当前HP>0))throw Error('全队失去战斗能力，请先在宝可梦中心恢复。');
 hellChallenges.assertUnlocked(w,w.遭遇);
 applyBossRoster(w);
 const authoredEncounter=w.遭遇.storyEventId||w.遭遇.specialId?clone(w.遭遇):null;
 const balanced=encounterBalance.applyEncounterDifficulty(w);if(balanced!==w)w.遭遇=balanced.遭遇;
 validateMvu(variables);
 const team=w.队伍.slice().sort((a,b)=>(b.当前HP>0)-(a.当前HP>0));
 const bondEnabled=w.设置?.bondBattleEffects!==false;
 if(w.设置.battleMode==='doubles'&&w.遭遇.类型!=='wild'&&(team.filter(mon=>mon.当前HP>0).length<2||w.遭遇.队伍.length<2))throw Error('双打需要至少两只可出战的伙伴和两只对手，请补齐队伍或选择单打。');
 const snapshot=game.start({team:team.map(mon=>toEngine(mon,{bondTrust:w.羁绊?.伙伴?.[mon.uid]?.信赖||0,bondBattleEffects:bondEnabled})),opponent:w.遭遇.队伍.map(toEngine),bondBattleEffects:bondEnabled,mode:w.遭遇.类型==='trainer'?'practice':w.遭遇.类型,doubleBattle:w.遭遇.类型!=='wild'&&w.设置.battleMode==='doubles',trainerItems:w.遭遇.itemInventory||{},itemPolicy:w.遭遇.itemPolicy||{},gym:w.遭遇.道馆,level:50,difficulty:w.设置?.对手难度||'normal'});
 const record=game.battles.get(snapshot.id);record.authoredEncounter=authoredEncounter;record.encounterRound=w.战斗.轮次;record.rewarded=false;
 record.caughtSpecies=clone(w.统计?.捕获图鉴||[]);
 record.bag=inventoryFromRecord(w.背包.物品);
 record.actionSeq=0;
 record.battle.p2.name=w.遭遇.训练家;
 snapshot.sides[1].name=w.遭遇.训练家;snapshot.bag={...record.bag,ball:record.bag.pokeball};return snapshot;
}
function updateMon(mon,p) {
 mon.当前HP=p.hp;mon.状态=p.status==='fnt'?'':p.status;
 const happinessDelta=p.happiness-(p.set.happiness??p.happiness);if(happinessDelta){mon.亲密度=Math.max(0,Math.min(255,(mon.亲密度||0)+happinessDelta));p.set.happiness=p.happiness;}
 if(!(mon.携带道具==='expshare'&&!p.item)&&!(mon.持有邮件&&mon.持有邮件.itemId===mon.携带道具&&p.item==='mail'))mon.携带道具=p.item||'';
 for(const m of mon.招式){const slot=p.baseMoveSlots.find(x=>x.id===m.id);if(slot)m.PP=slot.pp;}
 // For an untransformed Pokémon the base/current slots reference the same PP.
 if(!p.transformed)for(const m of mon.招式){const slot=p.moveSlots.find(x=>x.id===m.id);if(slot)m.PP=slot.pp;}
}
function applyLevelGrowth(mon,oldLevel,oldHp=mon.能力值.hp) {
 while(mon.等级<100&&mon.经验>=expAt(mon.等级+1,mon.图鉴编号))mon.等级++;
 const levelSpecies=mon.图鉴编号;
 for(let level=oldLevel+1;level<=mon.等级;level++){
  const happiness=mon.亲密度||0;
  let levelFriendship=happiness<100?5:happiness<200?3:2;
  if(levelFriendship>0&&mon.携带道具==='soothebell')levelFriendship=Math.floor(levelFriendship*150/100);
  mon.亲密度=Math.min(255,happiness+levelFriendship);
  for(const id of growth.levelMovesAt(levelSpecies,level)){
   if(mon.招式.some(move=>move.id===id)||(mon.待学招式||[]).includes(id))continue;
   if(mon.招式.length<4)mon.招式.push({id,PP:catalog.moves[id].pp,PP上限:catalog.moves[id].pp});
   else mon.待学招式=[...new Set([...(mon.待学招式||[]),id])];
  }
 }
 // FRLG marks battle level-ups and offers evolution after battle; one growth award
 // can therefore evolve only the current species once, even if it spans levels.
 const evolution=mon.等级>oldLevel&&mon.携带道具!=='everstone'?growth.evolutionAtLevel(levelSpecies,mon.等级,mon.亲密度||0):null;
 if(evolution&&!mon.待进化?.length)mon.待进化=[{id:`${mon.uid}:${levelSpecies}:${mon.等级}:${evolution.num}`,from:levelSpecies,to:evolution.num,level:mon.等级}];
 mon.能力值=stats(mon);if(mon.当前HP>0)mon.当前HP=Math.min(mon.能力值.hp,mon.当前HP+mon.能力值.hp-oldHp);
 return mon.等级-oldLevel;
}
function grantExperience(mon,amount,cap=null) {
 if(!Number.isInteger(amount)||amount<0)throw Error('经验增量须为非负整数。');
 const oldLevel=mon.等级,oldHp=mon.能力值.hp;
 if(amount>0&&mon.等级<100&&(cap===null||mon.等级<=cap)){
  const maxExp=cap===null?2000000:Math.min(2000000,expAt(cap+1,mon.图鉴编号)-1);
  mon.经验=Math.min(maxExp,mon.经验+amount);
 }
 return applyLevelGrowth(mon,oldLevel,oldHp);
}
function grantLevel(mon,cap=null) {
 if(mon.等级>=100)throw Error('等级已经达到100。');
 if(cap!==null&&mon.等级>=cap)throw Error(`当前等级上限为${cap}级。`);
 const oldLevel=mon.等级,oldHp=mon.能力值.hp;
 mon.等级++;
 mon.经验=Math.max(mon.经验,expAt(mon.等级,mon.图鉴编号));
 applyLevelGrowth(mon,oldLevel,oldHp);
 return mon.等级-oldLevel;
}
function awardExperience(w,record) {
 const shareMode=gadgets.modifiers(w).partyExpShareMode;
 const battle=record.battle,defeated=battle.p2.pokemon.filter(p=>p.fainted && !(record.experienceAwardedFoes||[]).includes(p.set?.slotId));
 const teamByUid=new Map(w.队伍.map(mon=>[mon.uid,mon]));
 const legacyActive=new Set((battle.p1.pokemon||[]).filter(p=>p.activeTurns>0||p.activeMoveActions>0||p.previouslySwitchedIn>0).map(p=>p.set.slotId));
 // Old battle records lack per-foe history; conservatively apply their surviving battle participants to each defeated foe.
 let legacyParticipants=w.队伍.filter(mon=>mon.当前HP>0&&legacyActive.has(mon.uid));
 if(!legacyParticipants.length)legacyParticipants=w.队伍.filter(mon=>mon.当前HP>0).slice(0,1);
 const gainedByUid=new Map();
 for(const p of defeated){
  const foeUid=p.set?.slotId,recorded=record.participationByFoe?.[foeUid];
  // Restored pre-tracking saves have an empty map; migrate each missing foe,
  // rather than treating the mere presence of that map as complete history.
  const participants=Array.isArray(recorded)
   ? recorded.map(uid=>teamByUid.get(uid)).filter(Boolean)
   : legacyParticipants;
  const livingIds=record.livingByFoeAtDefeat?.[foeUid];
  const living=Array.isArray(livingIds)?new Set(livingIds):new Set(w.队伍.filter(mon=>mon.当前HP>0).map(mon=>mon.uid));
  const livingParticipants=participants.filter(mon=>living.has(mon.uid));
  const heldAtDefeat=record.heldItemsByFoeAtDefeat?.[foeUid];
  const itemAtDefeat=mon=>mon.携带道具==='expshare'?'expshare':heldAtDefeat&&Object.hasOwn(heldAtDefeat,mon.uid)?heldAtDefeat[mon.uid]:mon.携带道具;
  const shareHolders=w.队伍.filter(mon=>(shareMode==='split'||itemAtDefeat(mon)==='expshare')&&living.has(mon.uid));
  const activeParticipants=livingParticipants.filter(mon=>mon.等级<100);
  const shares=shareHolders.filter(mon=>mon.等级<100);
  const recipients=new Map([...activeParticipants,...shares].map(mon=>[mon.uid,mon]));
  if(shareMode==='journey')for(const mon of w.队伍)if(living.has(mon.uid)&&mon.等级<100)recipients.set(mon.uid,mon);
  if(!recipients.size)continue;
  const data=progression[p.baseSpecies.num]||{},base=Math.floor((data.baseExperience||64)*p.level/7);
  const addExperience=(mon,amount)=>{
   // FRLG applies held-item and trainer bonuses sequentially, flooring each
   // integer stage. The held item only boosts EXP this Pokémon actually earns.
   let value=amount;
   if(itemAtDefeat(mon)==='luckyegg')value=Math.floor(value*150/100);
   if(w.遭遇.类型!=='wild')value=Math.floor(value*150/100);
   // NPC trades retain explicit provenance; do not infer foreign ownership
   // for older saves whose original trainer identity is unknown.
   if(mon.交换来源==='FRLG-NPC')value=Math.floor(value*150/100);
   const bondBonus=companionship.benefitsFor(w.羁绊?.伙伴?.[mon.uid]).experienceBonusPercent;
   if(bondBonus)value=Math.floor(value*(100+bondBonus)/100);
   gainedByUid.set(mon.uid,(gainedByUid.get(mon.uid)||0)+value);
  };
  if(livingParticipants.length){
   const participantShare=shareHolders.length?Math.floor(Math.floor(base/2)/livingParticipants.length):Math.floor(base/livingParticipants.length);
   for(const mon of activeParticipants)addExperience(mon,Math.max(1,participantShare));
  }
  if(shareHolders.length){
   const expShare=Math.floor(Math.floor(base/2)/shareHolders.length);
   for(const mon of shares)addExperience(mon,Math.max(1,expShare));
  }
  if(shareMode==='journey')for(const mon of recipients.values())addExperience(mon,base);
  for(const mon of recipients.values()){
   let total=KEYS.reduce((sum,k)=>sum+mon.努力值[k],0);
   const effortMultiplier=itemAtDefeat(mon)==='machobrace'?2:1;
   for(const k of KEYS){const value=Math.min((data.effort?.[k]||0)*effortMultiplier,255-mon.努力值[k],510-total);mon.努力值[k]+=value;total+=value;}
  }
 }
 record.experienceAwardedFoes=[...new Set([...(record.experienceAwardedFoes||[]),...defeated.map(p=>p.set?.slotId).filter(Boolean)])];
 for(const [uid,gained] of gainedByUid){
  const mon=teamByUid.get(uid);
  if(!mon)continue;
  const cap=levelCap(w);
  const wasFainted=mon.当前HP<=0;
  // Existing over-cap saves remain intact and receive no more EXP until the cap catches up.
  grantExperience(mon,gained,cap);
  if(wasFainted)mon.当前HP=0;
 }
}
function syncBattleMon(mon,p) {
 if(!p)return;
 p.level=mon.等级;p.set.level=mon.等级;p.set.evs={...mon.努力值};p.maxhp=mon.能力值.hp;p.baseMaxhp=mon.能力值.hp;p.hp=mon.当前HP;
 p.baseStoredStats={atk:mon.能力值.atk,def:mon.能力值.def,spa:mon.能力值.spa,spd:mon.能力值.spd,spe:mon.能力值.spe};
 if(!p.transformed)p.storedStats={...p.baseStoredStats};p.happiness=mon.亲密度;p.set.happiness=mon.亲密度;
 const slots=mon.招式.map(m=>{const old=p.baseMoveSlots.find(slot=>slot.id===m.id);return {...old,move:Dex.moves.get(m.id).name,id:m.id,pp:m.PP,maxpp:m.PP上限,target:Dex.moves.get(m.id).target,disabled:old?.disabled??false,used:old?.used??false};});
 // Showdown keeps base/current slots shared outside Transform, so PP changes
 // survive a switch (clearVolatile restores from baseMoveSlots).
 p.baseMoveSlots=slots;if(!p.transformed)p.moveSlots=slots;
 p.set.moves=mon.招式.map(m=>m.id);
}
function learnBattleMove(variables,record,uid,move,slot){
 if(record.battle.ended||!record.pendingBattleLearning?.includes(uid))throw Error('当前没有此宝可梦的战斗学招事项。');
 const copy=ensureMvuDefaults(variables),w=root(copy);w.战斗.状态='finished';
 const next=learnMove(copy,uid,move,slot),mon=root(next).队伍.find(m=>m.uid===uid);root(next).战斗.状态='active';
 syncBattleMon(mon,record.battle.p1.pokemon.find(p=>p.set.slotId===uid));
 if(!mon.待学招式?.length)record.pendingBattleLearning=record.pendingBattleLearning.filter(id=>id!==uid);
 const forced=record.battle.p1.activeRequest?.forceSwitch;record.battle.makeRequest((Array.isArray(forced)?forced.some(Boolean):forced)?'switch':'move');
 validateMvu(next);return next;
}
function applyBattleResult(variables,record,{storyTurn}={}) {
 const next=ensureMvuDefaults(variables),w=root(next),b=record.battle;
 if(record.encounterRound!==undefined&&w.战斗.轮次!==record.encounterRound)throw Error('MVU遭遇版本已变化。');
 for(const p of b.p1.pokemon){const mon=w.队伍.find(m=>m.uid===p.set.slotId);if(!mon)throw Error('MVU队伍与战场不一致。');updateMon(mon,p);}
 for(const p of b.p2.pokemon){const mon=w.遭遇.队伍.find(m=>m.uid===p.set.slotId);if(mon)updateMon(mon,p);}
 w.背包.物品={...w.背包.物品,...inventoryFromRecord(record.bag)};
 w.战斗.操作序号=Number.isSafeInteger(record.actionSeq)?record.actionSeq:0;
 w.战斗.最近战斗ID=record.id;w.战斗.对手背包=clone(record.opponentBag||{});w.战斗.对手用药次数=record.trainerItemUses||0;
 w.战斗.状态=b.ended?'finished':'active';w.战斗.结果=b.ended?(record.caught?'caught':record.escaped?'escaped':b.winner===b.p1.name?'win':b.winner?'lose':'draw'):'';
 w.战斗.摘要=`${w.遭遇.训练家} · 战斗第${b.turn}回合 · ${b.ended?({win:'胜利',lose:'败北',caught:'收服成功',escaped:'逃离',draw:'平局'}[w.战斗.结果]):'进行中'}。`;
 const growthBefore=new Map(w.队伍.map(mon=>[mon.uid,{exp:mon.经验,level:mon.等级,stats:JSON.stringify(mon.能力值),pending:[...(mon.待学招式||[])]}]));
 if(!(b.ended&&(record.rewarded||w.战斗.已奖励)))awardExperience(w,record);
 record.growthRewards ||= {};
 for(const mon of w.队伍){const old=growthBefore.get(mon.uid);if(!old)continue;const reward=record.growthRewards[mon.uid] ||= {uid:mon.uid,昵称:mon.昵称,获得:0,升级:0};reward.获得+=Math.max(0,mon.经验-old.exp);reward.升级+=Math.max(0,mon.等级-old.level);if(!b.ended && (mon.待学招式||[]).some(id=>!old.pending.includes(id)))record.pendingBattleLearning ||= [];if(!b.ended && (mon.待学招式||[]).some(id=>!old.pending.includes(id))&&!record.pendingBattleLearning.includes(mon.uid))record.pendingBattleLearning.push(mon.uid);if(mon.经验!==old.exp||mon.等级!==old.level||JSON.stringify(mon.能力值)!==old.stats)syncBattleMon(mon,b.p1.pokemon.find(p=>p.set.slotId===mon.uid));}
 if(!b.ended && w.队伍.some(mon=>mon.经验!==growthBefore.get(mon.uid)?.exp||JSON.stringify(mon.能力值)!==growthBefore.get(mon.uid)?.stats)){const forced=b.p1.activeRequest?.forceSwitch;b.makeRequest((Array.isArray(forced)?forced.some(Boolean):forced)?'switch':'move');}
 if(b.ended && !record.rewarded && !w.战斗.已奖励){
  const previous=clone(w);
  const rewards={物品:[]};
  const pending=w.剧情.待领取挑战奖励||{};
  for(const [id,amount] of Object.entries(pending)){
   const delivered=Math.min(amount,999-w.背包.物品[id]);
   if(delivered){w.背包.物品[id]+=delivered;record.bag[id]=w.背包.物品[id];pending[id]-=delivered;rewards.物品.push({id,名称:`${itemsById.get(id).name}（高难度奖励补领）`,数量:delivered,来源:'补领高难度挑战奖励'});}
  }

  const battleParticipants=[...new Set(Object.values(record.participationByFoe||{}).flat())];
  const bondStoryTurn=Number.isSafeInteger(storyTurn)&&storyTurn>0?storyTurn:w.地图?.轮次;
  companionship.onBattleResult(w,{storyTurn:bondStoryTurn,participants:battleParticipants,result:w.战斗.结果});
  if(record.caught){
   const p=b.p2.pokemon.find(p=>p.baseSpecies.num===record.caught.id),source=w.遭遇.队伍.find(m=>m.uid===p?.set.slotId);
   if(source){const captured=clone(source);captured.uid=`caught-${record.id}`;captured.收服来源='wild';captured.收服图鉴编号=captured.图鉴编号;captured.捕获球=record.caught.ball||'pokeball';(w.队伍.length<6?w.队伍:w.电脑).push(captured);w.统计.捕获次数=(w.统计.捕获次数||0)+1;w.剧情.捕获次数=w.统计.捕获次数;}
  }
  if(w.战斗.结果==='win'){
   const hellReward=record.difficulty==='hell'?cosmetics.awardHellFirstWin(w,w.遭遇):null;
   if(hellReward)rewards.外观=[{id:hellReward.id,名称:hellReward.name,来源:'地狱难度首胜奖励'}];
   const firstGym=w.遭遇.类型==='gym'&&!previous.训练家.徽章.includes(badges[w.遭遇.道馆]);
   const firstBoss=!!w.遭遇.bossProfileId&&!previous.外观.首领胜利.includes(w.遭遇.bossProfileId);
   const firstChallengeWin=record.difficulty==='hell'?Boolean(hellReward):(w.遭遇.类型==='gym'?firstGym:firstBoss);
   const bonuses=firstChallengeWin?frlgRewards.challengeBonus(record.difficulty):[];
   for(const bonus of bonuses){
    const count=Math.min(1,999-w.背包.物品[bonus.id]),deferred=1-count;
    if(count){w.背包.物品[bonus.id]+=count;record.bag[bonus.id]=w.背包.物品[bonus.id];rewards.物品.push({id:bonus.id,名称:`${itemsById.get(bonus.id).name}（${{hard:'困难',expert:'极难',hell:'地狱'}[record.difficulty]}首胜：${bonus.use}）`,数量:count,来源:`${record.difficulty}难度首胜奖励`});}
    if(deferred){w.剧情.待领取挑战奖励=w.剧情.待领取挑战奖励||{};w.剧情.待领取挑战奖励[bonus.id]=(w.剧情.待领取挑战奖励[bonus.id]||0)+deferred;rewards.物品.push({id:bonus.id,名称:`${itemsById.get(bonus.id).name}（背包已满，待下次战斗结算补领；${bonus.use}）`,数量:deferred,来源:'背包已满，待下次战斗结算补领'});}
   }
   const trainerPrize=frlgRewards.trainerPrize(w.遭遇,{moneyMultiplier:record.moneyMultiplier??1,doubleBattle:record.doubleBattle===true});
   if(trainerPrize)w.训练家.金钱=Math.min(9999999,w.训练家.金钱+trainerPrize.amount);
   if(w.遭遇.训练家==='小茂'&&!w.遭遇.specialId){w.剧情.已击败训练家=[...new Set([...(w.剧情.已击败训练家||[]),'小茂'])];w.剧情.首次击败小茂=true;w.统计.首次击败小茂=true;}
   if(w.遭遇.类型==='gym'&&!w.训练家.徽章.includes(badges[w.遭遇.道馆]))w.训练家.徽章.push(badges[w.遭遇.道馆]);
   if(w.遭遇.类型==='gym'&&!previous.训练家.徽章.includes(badges[w.遭遇.道馆])){
    const tmId=gymTms[w.遭遇.道馆],machine=tmhmCatalog.find(entry=>entry.id===tmId);
    if(machine&&w.背包.物品[tmId]<999){w.背包.物品[tmId]++;record.bag[tmId]=w.背包.物品[tmId];rewards.物品.push({id:tmId,名称:machine.name,数量:1,来源:'道馆馆主奖励'});}
   }
   if(w.遭遇.联盟!==undefined&&!w.遭遇.hellRematchKey)w.剧情.联盟进度=Math.min(5,w.遭遇.联盟+1);
  }
  rewards.经验=Object.values(record.growthRewards||{}).filter(item=>item.获得||item.升级);
  rewards.金币=w.训练家.金钱-previous.训练家.金钱;
  rewards.徽章=w.训练家.徽章.filter(item=>!previous.训练家.徽章.includes(item));
  // Optional journey supplies are an explicit game rule, separate from cartridge prize money.
  if(w.战斗.结果==='win'&&w.设置.战后补给){
   const id=w.遭遇.类型==='gym'?'superpotion':w.遭遇.类型==='wild'?'pokeball':'potion';
   const count=Math.min(w.遭遇.类型==='gym'?2:1,999-w.背包.物品[id]);
   if(count>0){w.背包.物品[id]+=count;record.bag[id]=w.背包.物品[id];rewards.物品.push({id,名称:itemsById.get(id).name,数量:count,来源:'旅程补给'});}
  }
  w.战斗.奖励=rewards;
  campaign.onBattleResult(w,w.遭遇,w.战斗.结果);
  fieldServices.onBattleEnd(w);
  if(w.遭遇.storyEventId){const source=clone(record.authoredEncounter||w.遭遇);source.队伍=source.队伍.map(mon=>({...mon,招式:mon.招式.map(move=>typeof move==='string'?move:move.id)}));rocketEvents.onBattleResult(w,{eventId:w.遭遇.storyEventId,result:w.战斗.结果,storyTurn:bondStoryTurn,encounter:source});}
  if(w.战斗.结果==='win'&&w.遭遇.bossProfileId){w.外观.首领胜利=[...new Set([...w.外观.首领胜利,w.遭遇.bossProfileId])];}
  if(w.剧情.联盟进度>=5){w.统计.成就=[...new Set([...(w.统计.成就||[]),'kanto-champion'])];}
  w.战斗.已奖励=true;record.rewarded=true;
 }
 if(b.ended&&w.遭遇?.specialId&&!w.遭遇.hellRematchKey)specialEncounters.onBattleResult(w,{encounterId:w.遭遇.specialId,result:w.战斗.结果,storyTurn:w.地图?.轮次,location:w.地图?.节点,encounter:record.authoredEncounter||w.遭遇});
 const offer=w.剧情?.遭遇邀约;
 if(b.ended&&offer?.状态==='accepted'&&offer.角色===w.遭遇?.训练家)offer.状态='resolved';
 updateDexStats(w);
 updateDexStats(w,{seen:b.p2.pokemon.filter(mon=>mon.isActive||mon.previouslySwitchedIn>0||mon.activeTurns>0).map(mon=>mon.baseSpecies.num)});
 syncTasks(w);npcQuests.refresh(w,{storyTurn:w.地图?.轮次});validateMvu(next);return next;
}
function travel(variables,nodeId) {
 variables=ensureMvuDefaults(variables);
 validateMvu(variables);const next=clone(variables),w=root(next),current=byNode.get(w.地图.节点),node=byNode.get(nodeId);
 if(w.战斗.状态!=='finished')throw Error('请先完成本轮战斗，再移动地图。');
 if(w.城市设施?.safari?.status==='active')throw Error('请先结束本次狩猎，再离开狩猎地带。');
 if(!node||!current.links.includes(nodeId))throw Error('只能前往相邻地点。');
 const access=fieldSkills.validateTravel(w,nodeId);if(!access.allowed)throw Error(access.reason);
 if(w.训练家.徽章.length<(node.requiresBadges||0))throw Error(`需要至少${node.requiresBadges}枚徽章。`);
 if(nodeId==='saffron'){
  const keys=w.背包.关键物品;if(Array.isArray(keys)){const tea=keys.findIndex(item=>String(typeof item==='string'?item:item?.id||'').toLowerCase()==='tea');if(tea>=0)keys.splice(tea,1);}else if(keys&&typeof keys==='object')delete keys.tea;
  w.剧情.关都事件.标记.saffronGateOpen=true;
 }
 w.地图.节点=node.id;w.地图.地点=node.name;storyConversation.clear(w);npcQuests.recordVisit(w,node.id);npcQuests.refresh(w,{storyTurn:w.地图.轮次});return next;
}
function configureStarterMon(mon,options){
 const chosen=starterConfig.validateOptions(options),damage=Math.max(0,mon.能力值.hp-mon.当前HP),fainted=mon.当前HP===0;
 if(chosen.nature)mon.性格=chosen.nature;
 if(chosen.shiny!==undefined)mon.闪光=chosen.shiny;
 if(chosen.ivs)Object.assign(mon.个体值,chosen.ivs);
 mon.能力值=stats(mon);mon.当前HP=fainted?0:Math.max(1,mon.能力值.hp-damage);
 return chosen;
}
function restoreStarterOptions(variables,options,sourceTurn){
 if(variables?.stat_data?.宝可梦?.战斗?.状态==='active')return clone(variables);
 const next=ensureMvuDefaults(variables),w=root(next),chosen=starterConfig.validateOptions(options);
 if(w.战斗.状态==='active'||w.剧情.初始伙伴设定||!w.剧情.初始御三家已选)return next;
 const mon=[...w.队伍,...w.电脑].find(mon=>mon.uid==='starter');
 if(!mon||!chosen.nature&&chosen.shiny===undefined&&!Object.keys(chosen.ivs||{}).length)return next;
 // Repair only values left at the old fixed defaults, preserving later manual edits.
 if(chosen.nature&&mon.性格!=='Serious'&&mon.性格!==chosen.nature||Object.entries(chosen.ivs||{}).some(([key,value])=>mon.个体值[key]!==25&&mon.个体值[key]!==value))return next;
 configureStarterMon(mon,chosen);w.剧情.初始伙伴设定={...chosen,来源故事轮次:sourceTurn,已补录:true};validateMvu(next);return next;
}
function chooseStarter(variables,id,options={}) {
 const next=ensureMvuDefaults(variables),w=root(next);if(w.地图.节点!=='pallet'||w.战斗.状态!=='pending'||w.剧情.初始御三家已选)throw Error('已经离开初始伙伴选择阶段。');
 if(![1,4,7].includes(id))throw Error('请选择妙蛙种子、小火龙或杰尼龟。');
 // Older opening saves registered their unchosen display placeholder as caught.
 if(w.队伍.length===1&&w.队伍[0].uid==='starter'&&!w.电脑.length&&!(w.统计.捕获次数||0)&&w.统计.捕获图鉴?.length===1&&w.统计.捕获图鉴[0]===w.队伍[0].图鉴编号)w.统计.捕获图鉴=[];
 const starter=makeMon(id,5,'starter',{starter:true}),chosen=configureStarterMon(starter,options);
 w.队伍=[starter];w.剧情.初始御三家已选=true;w.剧情.初始御三家编号=id;w.剧情.初始伙伴设定=chosen;
 w.遭遇.队伍=[makeMon({1:4,4:7,7:1}[id],5,'rival-1')];updateDexStats(w);syncTasks(w);validateMvu(next);return next;
}
function center(variables){const w=root(variables);if(byNode.get(w.地图.节点)?.kind!=='town'||w.战斗.状态==='active')throw Error('请在城镇且战斗外使用宝可梦中心。');return w;}
// 战败画面「重新挑战这一战」: the lost battle again, from the start. Both teams are restored (HP, status,
// PP) and the same opponent waits as a new pending round; nothing is charged. Encounters that run their own
// attempts (campaign, Rocket story, special, hell rematch, League) keep their own entries instead.
function lostBattleRetryable(encounter){return Boolean(encounter&&Array.isArray(encounter.队伍)&&encounter.队伍.length&&!encounter.specialId&&!encounter.storyEventId&&!encounter.campaignId&&!encounter.hellRematchKey&&encounter.联盟===undefined);}
function retryLostBattle(variables,battleId){
 const next=ensureMvuDefaults(variables),w=root(next);
 if(w.战斗.状态!=='finished'||w.战斗.结果!=='lose')throw Error('只有刚输掉的战斗可以重新挑战。');
 if(battleId!==undefined&&battleId!==w.战斗.最近战斗ID)throw Error('战斗状态已变化，请刷新后再操作。');
 if(!lostBattleRetryable(w.遭遇))throw Error('这一战请从原来的入口再次挑战。');
 for(const m of [...w.队伍,...w.遭遇.队伍]){if(m.能力值?.hp)m.当前HP=m.能力值.hp;m.状态='';for(const move of m.招式||[])if(move&&typeof move==='object'&&Number.isFinite(move.PP上限))move.PP=move.PP上限;}
 const turn=w.地图.轮次+1;w.地图.轮次=turn;
 w.战斗={轮次:turn,状态:'pending',结果:'',摘要:`再次挑战${w.遭遇.训练家||'对手'}。`,操作序号:0};
 validateMvu(next);return next;
}
function healAtCenter(variables){const next=ensureMvuDefaults(variables),w=center(next);for(const m of w.队伍){m.当前HP=m.能力值.hp;m.状态='';for(const move of m.招式)move.PP=move.PP上限;}w.剧情.剧场={...(w.剧情.剧场||{}),地点:w.地图.节点,轮次:w.地图.轮次,最近动作:'heal',角色:'nurse_joy',对白:'乔伊小姐：大家都恢复健康了。旅途中也要记得照顾好伙伴。'};return next;}
function buyItem(variables,item,count=1){const next=ensureMvuDefaults(variables),w=center(next),definition=itemsById.get(item),shop=shopFor(w);if(!definition||!shop.available||!shop.items.includes(item))throw Error('这家商店没有出售这种物品。');integer(count,1,99,'购买数量');if(w.训练家.金钱<definition.price*count)throw Error('金钱不足。');if(w.背包.物品[item]+count>999)throw Error('物品已达到上限。');w.训练家.金钱-=definition.price*count;w.背包.物品[item]+=count;npcQuests.recordPurchase(w,item,count,w.地图?.轮次);npcQuests.refresh(w,{storyTurn:w.地图?.轮次});validateMvu(next);return next;}
function useItem(variables,itemId,uid,options={}){
 const next=ensureMvuDefaults(variables),w=root(next),machine=tmhmCatalog.find(entry=>entry.id===itemId),mon=w.队伍.find(p=>p.uid===uid);
 if(w.战斗.状态==='active')throw Error('战斗中请使用战斗道具指令。');
 if(!mon)throw Error('请从队伍中选择一只宝可梦。');
 if(machine){
  if(!w.背包.物品[itemId])throw Error(`${machine.name}已经用完。`);
  if(!machine.learners.includes(mon.图鉴编号))throw Error(`${mon.昵称}无法使用${machine.name}。`);
  const move=machine.move,slot=options.slot;
  if(mon.招式.some(entry=>entry.id===move))throw Error(`${mon.昵称}已经学会${machine.moveName}。`);
  if(slot===0)return next;
  if(slot===undefined||slot===null){if(mon.招式.length>=4)throw Error('招式已满，请指定要替换的招式位置。');mon.招式.push({id:move,PP:catalog.moves[move].pp,PP上限:catalog.moves[move].pp,...(machine.kind==='hm'?{秘传:true}:{})});}
  else{
   integer(slot,1,4,'招式位置');
   if(slot>mon.招式.length+1)throw Error('请选择已有招式位置。');
   if(mon.招式[slot-1]?.秘传||mon.招式[slot-1]&&growth.isHmMove(mon.招式[slot-1].id))throw Error('秘传招式不能被普通招式学习器覆盖。');
   const entry={id:move,PP:catalog.moves[move].pp,PP上限:catalog.moves[move].pp,...(machine.kind==='hm'?{秘传:true}:{})};
   if(slot===mon.招式.length+1)mon.招式.push(entry);else mon.招式[slot-1]=entry;
  }
  if(machine.consumable)w.背包.物品[itemId]--;
  if((mon.亲密度||0)<200)mon.亲密度=Math.min(255,(mon.亲密度||0)+1);
  validateMvu(next);return next;
 }
 const item=itemsById.get(itemId);
 if(!item||!item.outside)throw Error('该物品不能在战斗外使用。');
 if(!w.背包.物品[itemId])throw Error(`${item.name}已经用完。`);
 const effect=item.outside;
 if(effect.pp!==undefined||effect.ppUps!==undefined){
  const slot=options.slot;
  if(!effect.allMoves&&(!Number.isInteger(slot)||slot<1||slot>mon.招式.length))throw Error('请选择要使用道具的招式。');
  const selected=effect.allMoves?mon.招式:[mon.招式[slot-1]];
  let changed=false;
  for(const move of selected){
   if(effect.ppUps!==undefined){
    const base=catalog.moves[move.id].pp,oldMax=move.PP上限;
    const ups=[0,1,2,3].find(up=>Math.floor(base*(5+up)/5)===oldMax)??0;
    if(ups>=3||(effect.ppUps!=='max'&&oldMax<=4))continue;
    move.PP上限=Math.floor(base*(5+(effect.ppUps==='max'?3:ups+1))/5);
    move.PP=Math.min(move.PP上限,move.PP+move.PP上限-oldMax);changed=true;
   }else if(move.PP<move.PP上限){move.PP=effect.pp==='all'?move.PP上限:Math.min(move.PP上限,move.PP+effect.pp);changed=true;}
  }
  if(!changed)throw Error('所选招式的PP或PP上限已经达到该道具可恢复的上限。');
 }else if(effect.ev){
  const key=effect.ev,total=KEYS.reduce((sum,key)=>sum+mon.努力值[key],0),gain=Math.min(effect.amount||10,100-mon.努力值[key],510-total);
  if(gain<=0)throw Error('该项营养品已达到100努力值上限，或总努力值已达到510。');
  const oldMax=mon.能力值.hp;mon.努力值[key]+=gain;mon.能力值=stats(mon);if(mon.当前HP>0)mon.当前HP=Math.min(mon.能力值.hp,mon.当前HP+mon.能力值.hp-oldMax);
  const happiness=mon.亲密度||0;mon.亲密度=Math.min(255,happiness+(happiness<100?5:happiness<200?3:2));
 }else if(effect.level){
  grantLevel(mon,levelCap(w));
 }else if(effect.reviveParty){
  const fainted=w.队伍.filter(entry=>entry.当前HP===0);if(!fainted.length)throw Error('队伍中没有倒下的宝可梦。');
  for(const entry of fainted){entry.当前HP=entry.能力值.hp;entry.状态='';}
 }else{
  const canRevive=!!effect.revive&&mon.当前HP===0;
  const canHeal=!!effect.heal&&mon.当前HP>0&&mon.当前HP<mon.能力值.hp;
  const canCure=effect.status?.includes(mon.状态)&&mon.当前HP>0;
  if(!canRevive&&!canHeal&&!canCure)throw Error(effect.revive?'复活道具只能用于倒下的宝可梦。':'该物品对当前HP或异常状态没有效果。');
  if(canRevive){mon.当前HP=Math.max(1,Math.floor(mon.能力值.hp*effect.revive));mon.状态='';}
  if(canHeal)mon.当前HP=Math.min(mon.能力值.hp,mon.当前HP+effect.heal);
  if(canCure)mon.状态='';
 }
 if(effect.friendship){const value=mon.亲密度||0;mon.亲密度=Math.max(0,Math.min(255,value+effect.friendship[value<100?0:value<200?1:2]));}
 if(!item.reusable)w.背包.物品[itemId]--;
 validateMvu(next);return next;
}
function moveBox(variables,uid,direction){
 const next=ensureMvuDefaults(variables),w=center(next),uids=Array.isArray(uid)?uid:[uid];
 if(!uids.length||uids.length>30||new Set(uids).size!==uids.length||uids.some(id=>typeof id!=='string'))throw Error('请选择1至30只不同的伙伴。');
 if(!['deposit','withdraw'].includes(direction))throw Error('未知电脑操作。');
 const source=direction==='deposit'?w.队伍:w.电脑,target=direction==='deposit'?w.电脑:w.队伍;
 if(uids.some(id=>!source.some(mon=>mon.uid===id)))throw Error(direction==='deposit'?'没有这只精灵。':'电脑中没有这只精灵。');
 if(direction==='deposit'&&w.队伍.length-uids.length<1)throw Error('队伍至少保留一只精灵。');
 if(direction==='deposit'&&w.电脑.length+uids.length>420)throw Error('电脑最多存放420只精灵。');
 if(direction==='withdraw'&&w.队伍.length+uids.length>6)throw Error('队伍已经满员，最多同行六只。');
 const selected=new Set(uids),moved=source.filter(mon=>selected.has(mon.uid));target.push(...moved);const remaining=source.filter(mon=>!selected.has(mon.uid));if(direction==='deposit')w.队伍=remaining;else w.电脑=remaining;
 validateMvu(next);return next;
}
function learnMove(variables,uid,move,slot){
 const next=ensureMvuDefaults(variables),w=root(next);
 if(w.战斗.状态==='active')throw Error('战斗期间不能改变招式。');
 const mon=[...w.队伍,...w.电脑].find(m=>m.uid===uid);
 if(!mon||mon.待学招式?.[0]!==move)throw Error('只能处理这只宝可梦队列中的第一个待学招式。');
 integer(slot,0,4,'招式位置');
 if(slot>0){
  if(mon.招式.some(m=>m.id===move))throw Error('已经掌握这个招式。');
  if(slot>mon.招式.length+1)throw Error('请选择已有招式位置。');
  if(mon.招式[slot-1]&&growth.isHmMove(mon.招式[slot-1].id))throw Error('秘传招式不能被升级招式覆盖。');
  mon.招式[slot-1]={id:move,PP:catalog.moves[move].pp,PP上限:catalog.moves[move].pp};
 }
 mon.待学招式=mon.待学招式.filter(id=>id!==move);validateMvu(next);return next;
}
function theaterView(variables){const normalized=ensureMvuDefaults(variables);validateMvu(normalized);const world=clone(root(normalized));return {world,locations:scenes.locationsView(),companionship:companionship.view(world),theater:scenes.buildTheater(world)};}
function theaterAction(variables,action,args={}){
 let next=ensureMvuDefaults(variables),w=root(next);
 let questReceipt=null;
 const safariStory=action==='kanto-story-event'&&['safari-secret-house-surf','safari-gold-teeth-strength'].includes(args.eventId)&&w.地图.节点==='safari';
 if(safariStory&&w.城市设施?.safari?.status!=='active')throw Error('请先从浅红市入口付费进入狩猎地带。');
 if(w.城市设施?.safari?.status==='active'&&!action.startsWith('facility-safari-')&&!safariStory)throw Error('请先处理本次狩猎；结束狩猎后可继续其他行动。');
 if(safariStory&&w.城市设施.safari.encounter)throw Error('请先处理眼前的野生宝可梦，再沿路标前往小屋。');
 // Facility rules validate location, revision and balance themselves, including
 // idempotent retries after their buttons have changed in the refreshed scene.
 const directService=action.startsWith('classic-')||action.startsWith('cosmetic-')||['tile-world','rocket-story-choice','rocket-battle','story-converse'].includes(action);
 const directQuest=['quest-accept','quest-turn-in','deep-quest-accept','deep-quest-advance','deep-quest-claim'].includes(action);
 const selected=action.startsWith('facility-')?{payload:Object.fromEntries(['revision','facilityId','coins','itemId','speciesId','steps','floor','count','drinkId'].filter(key=>args[key]!==undefined).map(key=>[key,args[key]]))}:action==='wild'||directQuest||directService?{payload:args}:['bond','care','train'].includes(action)?{payload:args}:scenes.applyTheaterChoice(w,action,args);
 const payload={...(selected.payload||{}),...(action==='trainer-battle'&&typeof args.trainerName==='string'?{trainerName:args.trainerName.slice(0,40)}:{}),...Object.fromEntries(['choiceId','chapterId','eventId','deepQuestId','tournamentId','attempt','round'].filter(key=>args[key]!==undefined).map(key=>[key,args[key]]))};
 if(action.startsWith('classic-')){next.stat_data.宝可梦=classicServices.apply(w,action,payload,{storyTurn:args.storyTurn});w=root(next);}
 else if(action.startsWith('cosmetic-')){next.stat_data.宝可梦=cosmetics.apply(w,action,payload,{storyTurn:args.storyTurn});w=root(next);}
 else if(action==='tile-world'){
  if(w.战斗.状态!=='finished')throw Error('请先完成当前遭遇，再探索逐格地图。');
  syncTileLocation(w);
  const applied=tileWorld.apply(w,payload.operation,payload,{storyTurn:args.storyTurn});
  if(!applied.result.ok)throw Error(tileFailure(applied.result));
  next.stat_data.宝可梦=applied.world;w=root(next);w.剧情.地图回执=applied.result;
  const region=tileWorld.maps.find(map=>map.id===w.tileWorld.mapId)?.region,macro=macroForRegion(region);
  if(macro&&macro!==w.地图.节点){w.地图.节点=macro;w.地图.地点=byNode.get(macro).name;storyConversation.clear(w);npcQuests.recordVisit(w,macro);}
  w.tileWorld.macroNode=w.地图.节点;
 }
 else if(action==='story-converse')storyConversation.begin(w,payload,args.storyTurn??w.地图.轮次);
 else if(action==='rocket-story-choice'){next.stat_data.宝可梦=rocketEvents.apply(w,action,payload,{storyTurn:args.storyTurn});w=root(next);}
 else if(action==='rocket-battle'){
  const started=rocketEvents.startBattle(w,payload.eventId,{tier:effectiveBossTier(w),partyLevel:partyLevel(w),starterId:w.剧情.初始御三家编号||w.队伍[0]?.图鉴编号,storyTurn:args.storyTurn});
  next.stat_data.宝可梦=started.world;w=root(next);w.遭遇={...started.encounter,队伍:started.profile.team.map(profileMon)};w.地图.轮次++;
  w.战斗={轮次:w.地图.轮次,状态:'pending',操作序号:0,结果:'',摘要:started.encounter.title};
 }
 else if(action.startsWith('facility-')){
  const node=w.地图.节点;next.stat_data.宝可梦=cityFacilities.apply(w,action,payload,{storyTurn:args.storyTurn??w.地图.轮次});w=root(next);
  if(node!==w.地图.节点)npcQuests.recordVisit(w,w.地图.节点);
  const service=cityFacilities.view(w);w.剧情.剧场={...(w.剧情.剧场||{}),地点:w.地图.节点,轮次:w.地图.轮次,最近动作:action,角色:w.地图.节点==='safari'?'fisherman':'gentleman',对白:service.summary||service.context||'设施记录已更新。'};
 }
 else if(action.startsWith('field-')){next.stat_data.宝可梦=fieldServices.apply(w,action,{...payload,...args},{storyTurn:args.storyTurn??w.地图.轮次});w=root(next);}
 else if(action==='starter')next=chooseStarter(next,payload.id,args.starterOptions);
 else if(action==='talk'){
  w=root(next);const previous=w.剧情.剧场||{},node=w.地图.节点;
  const perTown={...(previous.城镇交谈次数||{})},count=Number.isInteger(perTown[node])?perTown[node]:0;
  const line=scenes.citizenDialogue(node,count);perTown[node]=count+1;
  w.剧情.剧场={地点:node,轮次:w.地图.轮次,交谈次数:(previous.交谈次数||0)+1,城镇交谈次数:perTown,
   角色:line.personId,对白:`${line.speaker}：${line.text}`};
 } else if(action==='heal'){
  next=healAtCenter(next);w=root(next);const previous=w.剧情.剧场||{};
  w.剧情.剧场={地点:w.地图.节点,轮次:w.地图.轮次,交谈次数:previous.交谈次数||0,
   城镇交谈次数:{...(previous.城镇交谈次数||{})},角色:'nurse_joy',对白:'乔伊小姐：大家都恢复健康了。旅途中也要记得照顾好伙伴。'};
 }
 else if(action==='buy')next=buyItem(next,payload.item,args.count??payload.count??1);
 else if(action==='claim-machine'){
  w=root(next);if(w.战斗.状态==='active')throw Error('战斗中不能领取道具。');
  const claimed=machineAcquisitions.claim(w,payload.item);
  w.剧情.剧场={...(w.剧情.剧场||{}),地点:w.地图.节点,轮次:w.地图.轮次,角色:'oak_aide',对白:`大木博士的助手：这是${claimed.name}，请收下。`};
 }
 else if(action==='travel')next=travel(next,payload.node);
 else if(action==='wild'||action==='explore'){
  w=root(next);if(w.战斗.状态!=='finished')throw Error('请先完成当前遭遇，不能覆盖已有战斗。');
  const turn=w.地图.轮次+1,requestedId=Number(payload.speciesId??payload.id)||undefined;
  const node=byNode.get(w.地图.节点);if(!['route','cave'].includes(node?.kind))throw Error('请先到野外；城镇内可接受训练家挑战。');
  if(payload.scripted&&(!byId.has(requestedId)||LEGENDARY_SPECIES.has(requestedId)))throw Error('剧情指定遭遇只支持普通关都宝可梦；传说需对应特殊事件。');
  const selected=payload.scripted?{speciesId:requestedId,level:Math.max(2,node.level||5),version:w.设置.版本,method:'story',sourceMap:node.id}:wildEncounters.choose(w,turn,{speciesId:requestedId,method:payload.method||'auto'}),species=byId.get(selected.speciesId);
  w.地图.轮次=turn;
  w.遭遇={类型:'wild',训练家:'野生宝可梦',版本:selected.version,方法:selected.method,来源地图:selected.sourceMap,队伍:[makeMon(species.id,selected.level,`wild-${w.地图.节点}-${turn}`,{wild:true})]};
  w.战斗={轮次:turn,状态:'pending',结果:'',摘要:`野生的${species.name}从草丛里钻了出来。`,操作序号:0};
 }
 else if(action==='legendary'){
  w=root(next);
  const special=scenes.legendaryForNode(w.地图.节点),speciesId=payload.id;
  if(!special||special.speciesId!==speciesId)throw Error('当前位置没有这只传说宝可梦的特殊遭遇。');
  const triggered=w.剧情.特殊遭遇已触发;
  if(triggered.includes(special.key))throw Error('这次传说宝可梦遭遇已经触发过。');
  const turn=w.地图.轮次+1;
  triggered.push(special.key);
  w.地图.轮次=turn;
  w.遭遇={类型:'wild',训练家:'传说宝可梦',固定遭遇:special.key,队伍:[makeMon(special.speciesId,special.level,`legend-${special.key}-${turn}`)]};
  w.战斗={轮次:turn,状态:'pending',结果:'',摘要:`${byNode.get(w.地图.节点).name}：传说宝可梦${special.name}现身。`,操作序号:0};
 }
 else if(action==='special-battle'){
  const special=specialEncounters.apply(w,payload.encounterId,{storyTurn:args.storyTurn});
  const encounter=special.遭遇;
  encounter.队伍=encounter.队伍.map(mon=>makeMon(mon.speciesId,mon.level,mon.uid));
  special.战斗={轮次:special.地图.轮次,状态:'pending',结果:'',摘要:`${encounter.title}：${encounter.训练家}向你发起支线对战。`,操作序号:0};
  next.stat_data.宝可梦=special;w=root(next);
 }
 else if(['camp','bond','care','train'].includes(action)){
  next.stat_data.宝可梦=companionship.apply(w,action,{...payload,storyTurn:args.storyTurn??payload.storyTurn});
  if(action==='camp'||action==='care'){
   npcQuests.recordEvent(next.stat_data.宝可梦,action,payload.uid,args.storyTurn??payload.storyTurn);
   if(action==='camp'&&(payload.mode||'rest')==='rest')npcQuests.recordEvent(next.stat_data.宝可梦,'care',payload.uid,args.storyTurn??payload.storyTurn);
  }
  w=root(next);
 }
 else if(['quest-accept','quest-turn-in','deep-quest-accept','deep-quest-advance','deep-quest-claim'].includes(action)){
  next.stat_data.宝可梦=npcQuests.apply(w,action,payload,{storyTurn:args.storyTurn});
  w=root(next);
  questReceipt=npcQuests.actionResult(w,action,payload);
  if(questReceipt){const definition=action.startsWith('deep-quest-')?gadgets.definitions.find(quest=>quest.id===payload.deepQuestId):npcQuests.definitions(w).find(quest=>quest.id===payload.questId);questReceipt={...questReceipt,npcId:definition?.npcId||null,action,storyTurn:args.storyTurn??w.地图.轮次};w.剧情.委托回执=questReceipt;}
 }
 else if(action==='avoid-encounter'){
  w=root(next);w.遭遇=null;w.战斗={轮次:w.地图.轮次,状态:'finished',结果:'avoided',摘要:'你和伙伴轻轻离开了草丛，没有惊动野生宝可梦。',操作序号:0};
 }
 else if(action==='trainer-battle'){
  w=root(next);const node=byNode.get(w.地图.节点),turn=w.地图.轮次+1;
  const roster=node.id==='viridian-forest'?['捕虫少年',[10,13]]:node.kind==='cave'?['登山男',[74,95]]:node.kind==='route'?['短裤小子',[19,21]]:['迷你裙',[16,39]];
  const index=createHash('sha256').update(`${node.id}:${turn}`).digest()[0]%roster[1].length;
  const named=namedTrainerTeam(payload.trainerName,w,node);
  const pairs=named||(w.设置.battleMode==='doubles'?[0,1]:[0]).map(slot=>[roster[1][(index+slot)%roster[1].length],Math.max(3,node.level||5)]);
  w.地图.轮次=turn;w.遭遇={类型:'trainer',训练家:payload.trainerName||roster[0],itemInventory:node.level>=20?{superpotion:1}:{potion:1},itemPolicy:{maxUses:1},队伍:pairs.map(([speciesId,level],slot)=>makeMon(speciesId,level,`trainer-${node.id}-${turn}-${slot}`))};
  w.战斗={轮次:turn,状态:'pending',结果:'',摘要:`${roster[0]}向你发起了友谊挑战。`,操作序号:0};
 }
 else if(action==='hell-rematch'){
  const row=hellChallenges.prepare(w,payload.key),turn=w.地图.轮次+1;
  let encounter;
  if(row.gym!==undefined){const gym=catalog.gyms[row.gym];encounter={类型:'gym',训练家:gym.name,道馆:row.gym,队伍:gym.ids.map((id,i)=>makeMon(id,gymLevels[row.gym][i],`hell-${row.key}-${turn}-${i}`))};}
  else if(row.league!==undefined){const foe=elite[row.league];encounter={类型:'trainer',训练家:foe.name,联盟:row.league,队伍:foe.ids.map((id,i)=>makeMon(id,foe.levels[i],`hell-${row.key}-${turn}-${i}`))};}
  else if(row.specialId){const original=specialEncounters.definitions().find(item=>item.id===row.specialId);encounter={类型:'trainer',训练家:original.trainer,npc:original.trainer,specialId:row.specialId,theme:original.theme,title:original.title,队伍:specialEncounters.team(w,row.specialId).map((mon,i)=>makeMon(mon.speciesId,mon.level,`hell-${row.key}-${turn}-${i}`))};}
  else if(row.key==='rival'){const counter={1:4,4:7,7:1}[w.剧情.初始御三家编号||w.队伍[0].图鉴编号]||4;encounter={类型:'trainer',训练家:'小茂',队伍:[makeMon(counter,5,`hell-rival-${turn}`)]};}
  else {const profile=bossProfiles.build(row.key,'extreme',{partyLevel:partyLevel(w),starterId:w.剧情.初始御三家编号||w.队伍[0].图鉴编号});encounter={类型:'trainer',训练家:row.name,bossProfileId:row.key,bossTier:'extreme',theme:'rocket',title:`地狱重赛：${row.name}`,队伍:profile.team.map(profileMon),itemInventory:profile.itemInventory,itemPolicy:profile.itemPolicy,tactic:profile.tactic};}
  encounter.hellRematchKey=row.key;w.地图.轮次=turn;w.遭遇=encounter;w.战斗={轮次:turn,状态:'pending',结果:'',摘要:`地狱重赛：${row.name}再次应战。`,操作序号:0};
 }
 else if(action==='challenge-gym'){
  w=root(next);const node=byNode.get(w.地图.节点),gymIndex=payload.gym;
  if(w.战斗.状态!=='finished')throw Error('请先完成当前遭遇，不能覆盖已有战斗。');
  if(!Number.isInteger(node?.gym)||node.gym!==gymIndex)throw Error('当前位置没有可挑战的对应道馆。');
  if(w.训练家.徽章.includes(badges[gymIndex]))throw Error('这座道馆的徽章已经取得。');
  if(w.训练家.徽章.length!==gymIndex)throw Error(`道馆挑战顺序未满足，请先取得${badges[w.训练家.徽章.length]||'前置徽章'}。`);
  const turn=w.地图.轮次+1,gym=catalog.gyms[gymIndex];
  if(!gym)throw Error('道馆数据不存在。');
  w.地图.轮次=turn;w.遭遇={类型:'gym',训练家:gym.name,道馆:gymIndex,队伍:gym.ids.map((id,i)=>makeMon(id,gymLevels[gymIndex][i],`gym${gymIndex}-${i}-${turn}`))};
  w.战斗={轮次:turn,状态:'pending',结果:'',摘要:`${node.name}：已主动向${gym.name}发起道馆挑战。`,操作序号:0};
 } else if(action.startsWith('campaign-')){
  next.stat_data.宝可梦=campaign.apply(w,action,payload);w=root(next);
  if(w.遭遇?.campaignId&&action==='campaign-enter-round')w.遭遇.队伍=w.遭遇.队伍.map(mon=>makeMon(mon.speciesId,mon.level,mon.uid));
 } else if(action==='kanto-story-event'){
  next.stat_data.宝可梦=storyEvents.apply(w,action,payload,{storyTurn:args.storyTurn});w=root(next);
 } else if(action==='challenge-elite'){
  if(!campaign.canEnterElite(w))throw Error('必须先赢得石英大会，才能挑战四天王。');
  next=ensureEncounter(next,w.地图.轮次+1);w=root(next);
 } else throw Error('未知剧场操作。');
 w=root(next);
 if(w.战斗?.状态==='pending')hellChallenges.assertUnlocked(w,w.遭遇);
 if(w.战斗.状态==='pending')applyBossRoster(w);
 if(!['talk','heal','kanto-story-event','rocket-story-choice'].includes(action)&&w.剧情.剧场?.对白)delete w.剧情.剧场.对白;
 w.剧情.剧场={...(w.剧情.剧场||{}),地点:w.地图.节点,轮次:w.地图.轮次,最近动作:action};
 if(questReceipt)Object.assign(w.剧情.剧场,{角色:questReceipt.npcId,对白:[questReceipt.result,questReceipt.ending].filter(Boolean).join('\n')});
 storyConversation.prune(w);
 updateDexStats(w);
 syncTasks(w);npcQuests.refresh(w,{storyTurn:args.storyTurn??w.地图?.轮次});validateMvu(next);return next;
}
function toolAction(variables,action,payload,storyTurn){const next=ensureMvuDefaults(variables);next.stat_data.宝可梦=require('./gadget-actions.cjs').apply(root(next),action,payload,{storyTurn});validateMvu(next);return next;}
function flyToTown(variables,node){const next=ensureMvuDefaults(variables),w=root(next);if(w.战斗.状态!=='finished')throw Error('请先结束当前遭遇。');const access=fieldSkills.validateFly(w,node);if(!access.allowed)throw Error(access.reason);w.地图.节点=node;w.地图.地点=byNode.get(node).name;storyConversation.clear(w);npcQuests.recordVisit(w,node);npcQuests.refresh(w,{storyTurn:w.地图.轮次});validateMvu(next);return next;}

const GYM_BOSS=['brock','misty','lt_surge','erika','koga','sabrina','blaine','giovanni'];
function effectiveBossTier(w){return w.设置.bossTier==='auto'?({easy:'original',normal:'original',hard:'enhanced',expert:'extreme',hell:'extreme',ai:'enhanced'}[w.设置.对手难度]||'original'):w.设置.bossTier;}
function partyLevel(w){const living=w.队伍.filter(mon=>mon.当前HP>0);return Math.round(living.reduce((n,mon)=>n+mon.等级,0)/Math.max(1,living.length));}
function profileMon(mon){return makeMon(mon.speciesId,mon.level,mon.uid,{moves:mon.moves,ivs:mon.iv,evs:mon.ev,nature:mon.nature,ability:mon.ability,heldItem:mon.heldItem});}
function applyBossRoster(w){
 const e=w.遭遇;if(!e||e.bossProfileId)return;
 const boss=e.类型==='gym'?GYM_BOSS[e.道馆]:e.联盟!==undefined?['lorelei','bruno','agatha','lance','champion'][e.联盟]:null;
 if(!boss)return;
 const tier=effectiveBossTier(w);
 if(tier==='original'){e.bossProfileId=boss;e.bossTier='original';e.itemInventory={...(boss==='brock'?{potion:1}:{superpotion:2})};e.itemPolicy={maxUses:2,allowed:Object.keys(e.itemInventory)};return;}
 e.基准队伍数量=e.队伍.length;
 const profile=bossProfiles.build(boss,tier,{partyLevel:partyLevel(w),starterId:w.剧情.初始御三家编号||w.队伍[0]?.图鉴编号});
 e.队伍=profile.team.map(profileMon);e.bossProfileId=boss;e.bossTier=tier;e.tactic=profile.tactic;e.itemInventory=profile.itemInventory;e.itemPolicy=profile.itemPolicy;
}
const REGION_NODES={PALLET_TOWN:'pallet',VIRIDIAN_CITY:'viridian',PEWTER_CITY:'pewter',CERULEAN_CITY:'cerulean',VERMILION_CITY:'vermilion',LAVENDER_TOWN:'lavender',CELADON_CITY:'celadon',FUCHSIA_CITY:'fuchsia',SAFFRON_CITY:'saffron',CINNABAR_ISLAND:'cinnabar',INDIGO_PLATEAU:'indigo',VIRIDIAN_FOREST:'viridian-forest',MT_MOON:'mt-moon',ROCK_TUNNEL:'rock-tunnel',SEAFOAM_ISLANDS:'seafoam',POWER_PLANT:'power-plant',SAFARI_ZONE:'safari',VICTORY_ROAD:'victory-road',CERULEAN_CAVE:'cerulean-cave',POKEMON_MANSION:'mansion'};
function macroForRegion(region){const key=String(region||'').replace(/^MAPSEC_/,'');const route=/^ROUTE_(\d+)$/.exec(key);const id=route?'route'+route[1]:REGION_NODES[key];return byNode.has(id)?id:null;}
function syncTileLocation(w){
 tileWorld.ensure(w);if(w.tileWorld.macroNode===w.地图.节点)return;
 const map=tileWorld.maps.find(map=>macroForRegion(map.region)===w.地图.节点&&['town','city','route'].some(type=>map.type?.toLowerCase().includes(type)))||tileWorld.maps.find(map=>macroForRegion(map.region)===w.地图.节点);
 if(map){w.tileWorld.mapId=map.id;const view=tileWorld.view(w),cells=view.collision;let i=Math.floor(map.height/2)*map.width+Math.floor(map.width/2);if(cells[i])i=cells.findIndex(value=>value===0);if(i>=0){w.tileWorld.x=i%map.width;w.tileWorld.y=Math.floor(i/map.width);}}
 w.tileWorld.macroNode=w.地图.节点;
}
function tileFailure(result){return ({blocked:'前方无法通行。','blocked-by-object':'有物体挡住了去路。',locked:'需要对应钥匙才能通过。','stale-revision':'地图已更新，请重新操作。','out-of-reach':'请靠近后再调查。','already-collected':'这里的道具已经取走了。','requires-field-move':'需要对应秘传招式与徽章。','map-edge':'这里没有通往相邻地图的道路。'})[result.reason]||'这里暂时无法执行这个动作。';}

function worldView(variables,{storyTurn,includeTileWorld=false,stageOnly=false}={}){
 const normalized=ensureMvuDefaults(variables);validateMvu(normalized);const world=clone(root(normalized));
 if(stageOnly){
  const theater=scenes.buildTheater(world,{storyTurn}),questIds=new Set((theater.options||[]).map(option=>option.payload?.deepQuestId).filter(Boolean));
  const questView=gadgets.view(world);questView.quests=(questView.quests||[]).filter(quest=>questIds.has(quest.id));
  return {world,theater,shop:shopFor(world),facilities:cityFacilities.view(world),fieldServices:{options:fieldServices.options(world,{storyTurn})},companionship:companionship.view(world),campaign:{state:clone(world.剧情.关都主线),data:campaign.data(),context:campaign.view(world)},storyEvents:storyEvents.view(world),storyConversation:storyConversation.view(world),gadgets:questView,progression:{levelCap:levelCap(world),badges:world.训练家.徽章.length,difficultyDescription:encounterBalance.DIFFICULTY_INFO[world.设置.对手难度]}};
 }
 // The retired tile map is opt-in for migration tools, never built for a stage
 // refresh. Its collision grids and atlases used to be sent on every click.
 if(includeTileWorld)syncTileLocation(world);
 return {world,classicServices:classicServices.view(world,{storyTurn}),...(includeTileWorld?{tileWorld:tileWorld.view(world)}:{}),cosmetics:cosmetics.view(world),rocketEvents:rocketEvents.options(world),locations:locations.map(node=>({...clone(node),encounters:wildEncounters.habitat(world,node.id)?.species||[]})),items:clone(itemCatalog),tmhm:clone(tmhmCatalog),shop:shopFor(world),facilities:cityFacilities.view(world),fieldServices:{options:fieldServices.options(world,{storyTurn})},companionship:companionship.view(world),battleEffects:{bondBattleEffects:world.设置.bondBattleEffects,description:'自定义羁绊战斗辅助：信赖60时对己方接受普通命中检定的攻击命中率乘0.97；信赖100时乘0.95；信赖80时己方攻击要害等级+1。可在设置关闭。'},campaign:{state:clone(world.剧情.关都主线),data:campaign.data(),context:campaign.view(world)},storyEvents:storyEvents.view(world),storyConversation:storyConversation.view(world),gadgets:gadgets.view(world),tools:require('./gadget-actions.cjs').view(world,{storyTurn}),field:{actions:fieldSkills.fieldActions(world),travel:locations.filter(node=>byNode.get(world.地图.节点).links.includes(node.id)).map(node=>({node:node.id,...fieldSkills.travelInfo(world,node.id)}))},progression:{levelCap:levelCap(world),nextGym:world.训练家.徽章.length<8?world.训练家.徽章.length:null,badges:world.训练家.徽章.length,leagueProgress:world.剧情.联盟进度||0,difficultyDescription:encounterBalance.DIFFICULTY_INFO[world.设置.对手难度]},theater:scenes.buildTheater(world,{storyTurn})};
}
module.exports={lostBattleRetryable,retryLostBattle,updateDexStats,toolAction,flyToTown,createInitialMvu,validateMvu,recalculateDerived,ensureMvuDefaults,inventoryFromRecord,ensureEncounter,startFromMvu,applyBattleResult,learnBattleMove,travel,worldView,theaterView,theaterAction,chooseStarter,restoreStarterOptions,healAtCenter,buyItem,useItem,moveBox,learnMove,stats,makeMon,expAt,applyLevelGrowth,grantExperience,grantLevel};

