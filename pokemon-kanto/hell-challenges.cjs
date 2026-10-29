'use strict';
// Read existing victory evidence; do not create a second progression database.
const bosses=require('./boss-profiles.cjs');
const specials=require('./special-encounters.cjs');
const rocket=require('./rocket-boss-events.cjs');
const GYMS=['brock','misty','lt_surge','erika','koga','sabrina','blaine','giovanni'];
const BADGES=['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章','深红徽章','绿色徽章'];
const TOWNS=['pewter','cerulean','vermilion','celadon','fuchsia','saffron','cinnabar','viridian'];
const LEAGUE=['lorelei','bruno','agatha','lance','champion'];
const names=new Map(bosses.definitions().map(boss=>[boss.id,boss.name]));
const DEFINITIONS=[
 ...GYMS.map((key,gym)=>({key,gym,location:TOWNS[gym],name:names.get(key)})),
 ...LEAGUE.map((key,league)=>({key,league,location:'indigo',name:names.get(key)})),
 {key:'rival',location:'pallet',name:'小茂·初战'},
 ...specials.definitions().map(item=>({key:item.id,specialId:item.id,location:item.location,name:item.title})),
 ...rocket.EVENTS.map(item=>({key:item.bossId,location:item.node,name:item.speaker,rocketEvent:item.id}))
];
const byKey=new Map(DEFINITIONS.map(row=>[row.key,row]));
function keyFor(encounter){
 if(!encounter||encounter.类型==='wild')return null;
 const key=encounter.storyEventId?encounter.bossProfileId:encounter.specialId||encounter.bossProfileId|| (encounter.类型==='gym'?GYMS[encounter.道馆]:encounter.联盟!==undefined?LEAGUE[encounter.联盟]:encounter.训练家==='小茂'?'rival':null);
 return byKey.has(key)?key:null;
}
function cleared(world,key){
 const row=byKey.get(key);if(!row)return false;
 if(world.外观?.已拥有?.includes('hell-'+key.replaceAll('_','-')))return true; // Existing earned rewards remain valid.
 if(world.外观?.首领胜利?.includes(key))return true;
 if(row.gym!==undefined)return world.训练家?.徽章?.includes(BADGES[row.gym])===true;
 if(row.league!==undefined)return (world.剧情?.联盟进度||0)>row.league||world.统计?.成就?.includes('kanto-champion')===true;
 if(row.specialId)return world.剧情?.已完成支线对战?.includes(key)===true;
 if(row.rocketEvent)return world.剧情?.火箭队剧情?.progress?.[row.rocketEvent]?.won===true;
 return world.剧情?.首次击败小茂===true||world.剧情?.已击败训练家?.includes('小茂')===true;
}
function assertUnlocked(world,encounter){
 if(world.设置?.对手难度!=='hell')return;
 const key=keyFor(encounter);if(key&&!cleared(world,key))throw new Error(`先在其他难度战胜${byKey.get(key).name}一次，才能解锁这场地狱挑战。`);
}
function options(world){
 if(world.设置?.对手难度!=='hell')return [];
 return DEFINITIONS.filter(row=>row.location===world.地图?.节点&&cleared(world,row.key)).map(row=>{
  const reason=world.战斗?.状态!=='finished'?'请先完成当前战斗。':!world.队伍?.some(mon=>mon.当前HP>0)?'请先恢复队伍。':'';
  return {id:'hell-rematch',label:`地狱重赛：${row.name}`,enabled:!reason,...(reason?{reason}:{}),payload:{key:row.key}};
 });
}
function prepare(world,key){
 const row=byKey.get(key);if(!row||row.location!==world.地图?.节点)throw new Error('请前往对应特殊对手的所在地再挑战。');
 if(world.设置?.对手难度!=='hell')throw new Error('请选择地狱难度后再发起地狱重赛。');
 if(!cleared(world,key))throw new Error(`先在其他难度战胜${row.name}一次，才能解锁这场地狱挑战。`);
 if(world.战斗?.状态!=='finished')throw new Error('请先完成当前战斗。');
 if(!world.队伍?.some(mon=>mon.当前HP>0))throw new Error('请先恢复队伍。');
 return row;
}
module.exports={keyFor,cleared,assertUnlocked,options,prepare,definitions:()=>DEFINITIONS.map(row=>({...row}))};
