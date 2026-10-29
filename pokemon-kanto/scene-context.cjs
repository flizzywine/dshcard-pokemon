'use strict';
const campaign=require('./story-campaign.cjs');
function sceneContext(world){
 const encounter=world?.遭遇,status=world?.战斗?.状态;
 if(encounter?.campaignId&&status!=='finished')return{sceneTag:'tournament',musicEvent:'tournament'};
 if(encounter?.类型==='gym'&&status!=='finished')return{sceneTag:'gym:'+world.地图.节点,musicEvent:'gymInterior'};
 if(world?.地图?.节点==='pallet'&&world?.剧情?.初始御三家已选===false)return{sceneTag:'oak-lab',musicEvent:'opening'};
 if(world?.地图?.节点==='safari'&&world?.城市设施?.safari?.status==='active')return{sceneTag:'safari-zone'};
 const saved=world?.剧情?.剧场;if(!saved||saved.地点!==world.地图?.节点||saved.轮次!==world.地图?.轮次)return{};
 if(saved.最近动作==='heal')return{sceneTag:'pokemon-center',musicEvent:'pokemonCenter'};
 if(['visit-shop','buy'].includes(saved.最近动作))return{sceneTag:'mart',musicEvent:'mart'};
 if(saved.最近动作?.startsWith('facility-department-')||saved.最近动作==='facility-rooftop-trade')return{sceneTag:'department-store',musicEvent:'mart'};
 if(saved.最近动作==='camp')return{sceneTag:'camp',musicEvent:'campRest'};
 if(saved.最近动作==='kanto-story-event'){
  if(typeof saved.sceneTag==='string'&&typeof saved.musicEvent==='string')return{sceneTag:saved.sceneTag,musicEvent:saved.musicEvent};
  const id=world.剧情.关都事件?.记录?.at(-1)?.id||'';
  if(id==='ss-anne-captain')return{sceneTag:'ss-anne',musicEvent:'ssAnne'};
  if(/rocket|silph/.test(id))return{sceneTag:'rocket-base',musicEvent:id.includes('silph')?'silphCo':'rocketBase'};
  if(id==='cinnabar-mansion-key')return{sceneTag:'cave',musicEvent:'pokemonMansion'};
 }
 if(saved.最近动作?.startsWith('campaign-')){const view=campaign.view(world);return{sceneTag:view.scene?.sceneTag,musicEvent:view.scene?.musicEvent};}
 return{};
}
module.exports={sceneContext};
