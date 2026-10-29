'use strict';
const fs=require('node:fs');const path=require('node:path');
const packed=path.join(__dirname,'tile-world-data.json.br');
const CATALOG=fs.existsSync(packed)?JSON.parse(require('node:zlib').brotliDecompressSync(fs.readFileSync(packed))):require('./tile-world-data.json');
const MAPS = new Map(CATALOG.maps.map(m => [m.id,m]));
const ITEM_AUDIT = require('./public/data/gen3-item-audit.json');
const SOURCE_ITEMS = new Map(ITEM_AUDIT.items.map(item => [item.sourceId, item]));
const fieldSkills=require('./field-skills.cjs');
const DIR = {up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
const clone = value => structuredClone(value);
const initialMap = 'MAP_PALLET_TOWN';
const normalizeTileset = name => ({GenericBuilding1:'generic_building_1',GenericBuilding2:'generic_building_2',SeviiIslands123:'sevii_islands_123',SeviiIslands45:'sevii_islands_45',SeviiIslands67:'sevii_islands_67',SSAnne:'ss_anne'}[name.replace(/^gTileset_/, '')] || name.replace(/^gTileset_/, '').replace(/[A-Z]/g, (m,i)=> (i? '_':'')+m.toLowerCase()));
function ensure(world={}) {
  world.tileWorld ||= {mapId:initialMap,x:10,y:15,facing:'up',flags:{},collected:{},revision:0,turn:0,history:[],puzzle:{},visited:{}};
  world.背包 ||= {物品:{},关键物品:[]}; world.背包.物品 ||= {}; world.背包.关键物品 ||= [];
  const s=world.tileWorld; s.flags ||= {}; s.collected ||= {}; s.puzzle ||= {}; s.visited ||= {}; s.history ||= [];
  if (s.inventory && typeof s.inventory === 'object') {
    for (const [sourceId, amount] of Object.entries(s.inventory)) {
      const item = SOURCE_ITEMS.get(sourceId), id = item?.id || sourceId.replace(/^ITEM_/, '').toLowerCase();
      if (!Number.isSafeInteger(amount) || amount < 1) continue;
      if (item?.sourcePocket === 'POCKET_KEY_ITEMS') {
        if (!world.背包.关键物品.some(entry => keyItemId(entry) === id)) world.背包.关键物品.push({id,名称:keyName(id),说明:'从地图中找到的关键物品。',类型:'关键物品'});
      } else world.背包.物品[id] = (world.背包.物品[id] || 0) + amount;
    }
    delete s.inventory;
  }
  if(!Number.isInteger(s.revision)||s.revision<0)s.revision=0;if(!Number.isInteger(s.turn)||s.turn<0)s.turn=0;if(!DIR[s.facing])s.facing='up';
  if (!MAPS.has(s.mapId)) s.mapId=initialMap;
  if (!Number.isInteger(s.x)||!Number.isInteger(s.y)) { s.x=10;s.y=15; }
  return world;
}
function keyItemId(entry) { return String(typeof entry === 'string' ? entry : entry?.id || '').toLowerCase(); }
function keyName(id) { return ({cardkey:'门卡',liftkey:'电梯钥匙'})[id] || id; }
function itemId(sourceId) { return SOURCE_ITEMS.get(sourceId)?.id || String(sourceId).replace(/^ITEM_/, '').toLowerCase(); }
function grantItem(world, sourceId, amount=1) {
  const source=SOURCE_ITEMS.get(sourceId), id=itemId(sourceId);
  if (source?.sourcePocket === 'POCKET_KEY_ITEMS') {
    if (!world.背包.关键物品.some(entry => keyItemId(entry) === id)) world.背包.关键物品.push({id,名称:keyName(id),说明:'从地图中找到的关键物品。',类型:'关键物品'});
  } else world.背包.物品[id]=(world.背包.物品[id]||0)+amount;
}
function validate(world) {
 const s=world?.tileWorld,m=s&&MAPS.get(s.mapId);
 if(!s||!m)return {ok:false,reason:'missing-world'};
 if(!Number.isInteger(s.x)||!Number.isInteger(s.y)||s.x<0||s.y<0||s.x>=m.width||s.y>=m.height)return {ok:false,reason:'position-out-of-bounds'};
 return {ok:true};
}
function front(s){const d=DIR[s.facing]||DIR.up;return {x:s.x+d[0],y:s.y+d[1]};}
function objectPos(s,o){return s.puzzle.boulders?.[o.eventId]||{x:o.x,y:o.y};}
function objectAt(m,s,x,y){return m.objectEvents.find(o=>{const p=objectPos(s,o);return p.x===x&&p.y===y&&(!o.flag||o.flag==='0'||!s.flags[o.flag])&&!s.puzzle.removedBoulders?.[o.eventId];});}
function mansionFloor(mapId){return CATALOG.mansionMechanisms?.[mapId]?.index;}
function actions(world){const s=world.tileWorld,m=MAPS.get(s.mapId),p=front(s),finder=hasItem(world,'itemfinder');return ['move','interact','useDoor','pushBoulder','returnArea'].filter(a=>a==='pushBoulder'?!!objectAt(m,s,p.x,p.y)?.pushable:a!=='interact'||m.bgEvents.some(e=>e.x===p.x&&e.y===p.y&&(!['hiddenItem','item'].includes(e.kind)||finder)&&!s.collected[e.eventId])||m.warps.some(w=>w.x===p.x&&w.y===p.y)||objectAt(m,s,p.x,p.y));}
function doorIsOpen(s,door){return !!(s.puzzle.openDoors?.[door.id]||s.flags[door.flag]);}
function surgePhase(s){if(s.flags.FLAG_FOUND_BOTH_VERMILION_GYM_SWITCHES||s.puzzle.surge?.complete)return 'open';if(s.flags.FLAG_TEMP_1||s.puzzle.surge?.firstFound)return 'first';return 'closed';}
function surgeCellsFor(s){const phase=surgePhase(s);return phase==='open'?CATALOG.surgeMechanism.open:phase==='first'?CATALOG.surgeMechanism.firstSwitch:CATALOG.surgeMechanism.closed;}
function view(world){ensure(world);const s=world.tileWorld,m=MAPS.get(s.mapId),interactables=[],tiles=m.tiles.slice(),collision=m.collision.slice(),finder=hasItem(world,'itemfinder');
 for(const e of m.bgEvents){if((e.kind==='hiddenItem'||e.kind==='item')&&(!finder||s.collected[e.eventId]))continue;const doorOpen=e.door?doorIsOpen(s,e.door):false;interactables.push({...e,available:true,doorOpen,label:e.kind==='hiddenItem'?'隐藏道具':e.door?(doorOpen?'已开启的门':'门卡门'):e.mechanism==='mansion-secret-switch'?'机关开关':e.kind==='sign'?'告示牌':e.kind});}
 for(const o of m.objectEvents){if(s.collected[o.eventId]||s.puzzle.removedBoulders?.[o.eventId])continue;const pos=objectPos(s,o);interactables.push({kind:o.pushable?'boulder':o.reward?'itemBall':o.mechanism||'object',x:pos.x,y:pos.y,eventId:o.eventId,label:o.pushable?'Pushable boulder':o.reward?'Item ball':o.mechanism==='mansion-secret-switch'?'Secret switch':'Person / object',reward:o.reward,script:o.script,flag:o.flag});}
 for(const e of m.warps)interactables.push({kind:'warp',x:e.x,y:e.y,eventId:'warp:'+e.x+','+e.y+':'+e.dest_map,label:'Door / passage'});
 for(const door of Object.values(CATALOG.silphDoorRules||{})){if(door.mapId!==m.id)continue;const cells=doorIsOpen(s,door)?door.cells:door.closedCells;for(const cell of cells||[]){if(cell.x<0||cell.y<0||cell.x>=m.width||cell.y>=m.height)continue;const i=cell.y*m.width+cell.x;if(Number.isInteger(cell.tileId))tiles[i]=cell.tileId;collision[i]=cell.collision;}}
 if(m.id==='MAP_VERMILION_CITY_GYM')for(const cell of surgeCellsFor(s)){const i=cell.y*m.width+cell.x;if(i<0||i>=tiles.length)continue;if(Number.isInteger(cell.tileId))tiles[i]=cell.tileId;collision[i]=cell.collision;}
 const mansion=CATALOG.mansionMechanisms?.[m.id];if(mansion)for(const cell of (s.flags.FLAG_POKEMON_MANSION_SWITCH_STATE?mansion.open:mansion.closed)){const i=cell.y*m.width+cell.x;if(i<0||i>=tiles.length)continue;if(Number.isInteger(cell.tileId))tiles[i]=cell.tileId;collision[i]=cell.collision;}
 return {mapId:m.id,name:m.name,width:m.width,height:m.height,tiles,collision,elevation:m.elevation,behavior:m.behavior,tilesets:{primary:CATALOG.graphics['primary:'+normalizeTileset(m.primaryTileset)],secondary:CATALOG.graphics['secondary:'+normalizeTileset(m.secondaryTileset)]},position:{x:s.x,y:s.y,facing:s.facing},warps:m.warps,interactables,revision:s.revision,availableActions:actions(world),connections:m.connections,region:m.region,graphicsUnavailable:m.graphicsUnavailable,puzzles:m.id==='MAP_VERMILION_CITY_GYM'?{surge:{phase:surgePhase(s),attempt:s.puzzle.surge?.attempt||0}}:undefined};
}
function findWarp(m,x,y){return m.warps.find(w=>w.x===x&&w.y===y);}
function warpBehaviorAllowed(m,x,y,direction){const b=m.behavior[y*m.width+x];const arrow={right:0x62,left:0x63,up:0x64,down:0x65},stairs={right:[0x6c,0x6e],left:[0x6d,0x6f]};if(Object.values(arrow).includes(b))return b===arrow[direction];if([0x6c,0x6d,0x6e,0x6f].includes(b))return (stairs[direction]||[]).includes(b);return [0x60,0x61,0x66,0x67,0x68,0x69,0x6a,0x6b,0x71].includes(b);}
function usableWarp(m,x,y,direction){const w=findWarp(m,x,y);return w&&warpBehaviorAllowed(m,x,y,direction)?w:null;}
function hasItem(world,id){const canonical=itemId(id);return !!(world.背包?.物品?.[canonical]||world.背包?.物品?.[id]||world.背包?.关键物品?.some(entry=>keyItemId(entry)===canonical));}
function hasFieldMove(world,id){try{return fieldSkills.fieldActions(world).some(a=>a.id===id&&a.enabled);}catch{return false;}}
function surgeCanNeighbors(id){const x=(id-1)%5,y=Math.floor((id-1)/5),neighbors=[];if(x>0)neighbors.push(id-1);if(x<4)neighbors.push(id+1);if(y>0)neighbors.push(id-5);if(y<2)neighbors.push(id+5);return neighbors;}
function validSurgeTargets(targets){return Array.isArray(targets)&&targets.length===2&&targets.every(id=>Number.isInteger(id)&&id>=1&&id<=15)&&surgeCanNeighbors(targets[0]).includes(targets[1]);}
function rollSurgeSwitches(){const first=1+Math.floor(Math.random()*15),neighbors=surgeCanNeighbors(first),second=neighbors[Math.floor(Math.random()*neighbors.length)];return [first,second];}
const forcedTileDirections=Object.freeze({0x50:'right',0x51:'left',0x52:'up',0x53:'down',0x54:'right',0x55:'left',0x56:'up',0x57:'down'});
function blockedByCollision(m,s,x,y,direction){if(x<0||y<0||x>=m.width||y>=m.height)return true;const i=y*m.width+x;for(const door of Object.values(CATALOG.silphDoorRules||{})){if(door.mapId!==m.id)continue;const cells=doorIsOpen(s,door)?door.cells:door.closedCells;const cell=(cells||[]).find(c=>c.x===x&&c.y===y);if(cell)return cell.collision!==0;}if(m.id==='MAP_VERMILION_CITY_GYM'){const cell=surgeCellsFor(s).find(c=>c.x===x&&c.y===y);if(cell)return cell.collision!==0;}const mansion=CATALOG.mansionMechanisms?.[m.id];if(mansion){const cell=(s.flags.FLAG_POKEMON_MANSION_SWITCH_STATE?mansion.open:mansion.closed).find(c=>c.x===x&&c.y===y);if(cell)return cell.collision!==0;}return m.collision[i]!==0;}
function destinationWarp(dest,warpId){const requested=Number(warpId);if(!Number.isInteger(requested)||requested<0)return null;return dest.warps.find(warp=>Number(warp.warp_id)===requested)||dest.warps[requested]||null;}
function warp(world,w){const s=world.tileWorld,dest=MAPS.get(w.dest_map);if(!dest)return {ok:false,reason:'missing-destination',intent:{type:'warp',...w}};const target=destinationWarp(dest,w.dest_warp_id);if(!target)return {ok:false,reason:'destination-warp-missing'};s.mapId=dest.id;s.x=target.x;s.y=target.y;s.visited[dest.id]=true;return {ok:true,transition:{mapId:dest.id,x:target.x,y:target.y}};}
function apply(world,action,payload={},opts={}) {
 world=ensure(clone(world||{}));const s=world.tileWorld,m=MAPS.get(s.mapId);let result={ok:false,reason:'invalid-action'};
 if(payload.expectedRevision!==undefined&&payload.expectedRevision!==s.revision)return {world,result:{ok:false,reason:'stale-revision',revision:s.revision}};
 if(action==='move'){
  const direction=payload.direction,d=DIR[direction];if(!d)return {world,result:{ok:false,reason:'invalid-direction'}};
  const x=s.x+d[0],y=s.y+d[1];
  if(x<0||y<0||x>=m.width||y>=m.height){
   const connection=m.connections.find(item=>item.direction===direction);
   if(!connection||!MAPS.has(connection.map))result={ok:false,reason:'map-edge'};
   else{
    s.facing=direction;s.mapId=connection.map;const nextMap=MAPS.get(s.mapId),offset=Number(connection.offset||0);
    if(direction==='up'){s.x=Math.max(0,Math.min(nextMap.width-1,s.x-offset));s.y=nextMap.height-1;}
    else if(direction==='down'){s.x=Math.max(0,Math.min(nextMap.width-1,s.x-offset));s.y=0;}
    else if(direction==='left'){s.x=nextMap.width-1;s.y=Math.max(0,Math.min(nextMap.height-1,s.y-offset));}
    else{s.x=0;s.y=Math.max(0,Math.min(nextMap.height-1,s.y-offset));}
    result={ok:true,transition:{mapId:s.mapId,x:s.x,y:s.y}};
   }
  }else if(blockedByCollision(m,s,x,y,direction))result={ok:false,reason:'blocked'};
  else if(objectAt(m,s,x,y))result={ok:false,reason:'blocked-by-object'};
  else{
   s.facing=direction;s.x=x;s.y=y;const forcedPath=[];let nextWarp=usableWarp(m,x,y,direction);
   if(nextWarp)result=warp(world,nextWarp);
   else{
    let behavior=m.behavior[y*m.width+x],steps=0;const enteredCurrent=behavior>=0x50&&behavior<=0x53;
    while(Object.hasOwn(forcedTileDirections,behavior)&&steps++<80){
     const forcedDirection=forcedTileDirections[behavior],delta=DIR[forcedDirection],nx=s.x+delta[0],ny=s.y+delta[1];
     if(blockedByCollision(m,s,nx,ny,forcedDirection)||objectAt(m,s,nx,ny))break;
     s.facing=forcedDirection;s.x=nx;s.y=ny;forcedPath.push({x:nx,y:ny,direction:forcedDirection});
     nextWarp=usableWarp(m,nx,ny,forcedDirection);if(nextWarp){result=warp(world,nextWarp);break;}
     behavior=m.behavior[ny*m.width+nx];
    }
    if(result.reason==='invalid-action')result={ok:true,position:{x:s.x,y:s.y},...(forcedPath.length?{puzzle:enteredCurrent?'seafoam-water-current':'rocket-hideout-spin',forcedPath}:{})};
   }
  }
 }else if(action==='pushBoulder'){const d=DIR[payload.direction||s.facing];if(!d)return {world,result:{ok:false,reason:'invalid-direction'}};const bx=s.x+d[0],by=s.y+d[1],boulder=objectAt(m,s,bx,by);if(!boulder?.pushable)result={ok:false,reason:'no-pushable-boulder'};else if(!hasFieldMove(world,'strength')&&!s.flags.FIELD_MOVE_STRENGTH_AVAILABLE)result={ok:false,reason:'requires-field-move',requires:'strength'};else{const tx=bx+d[0],ty=by+d[1],hole=tx>=0&&ty>=0&&tx<m.width&&ty<m.height&&m.behavior[ty*m.width+tx]===0x66;if(tx<0||ty<0||tx>=m.width||ty>=m.height)result={ok:false,reason:'edge'};else if(objectAt(m,s,tx,ty))result={ok:false,reason:'blocked-by-object'};else if(!hole&&blockedByCollision(m,s,tx,ty,payload.direction))result={ok:false,reason:'blocked'};else{s.puzzle.boulders||={};s.facing=payload.direction;s.x=bx;s.y=by;if(hole){s.puzzle.removedBoulders||={};s.puzzle.removedBoulders[boulder.eventId]=true;s.puzzle.filledHoles||={};s.puzzle.filledHoles[m.id+':'+tx+','+ty]=true;if(boulder.flag&&boulder.flag!=='0')s.flags[boulder.flag]=true;let landed=null;const fall=findWarp(m,tx,ty),dest=fall&&MAPS.get(fall.dest_map);if(dest){const target=destinationWarp(dest,fall.dest_warp_id),lower=target&&dest.objectEvents.filter(o=>o.pushable).sort((a,b)=>(Math.abs(a.x-target.x)+Math.abs(a.y-target.y))-(Math.abs(b.x-target.x)+Math.abs(b.y-target.y)))[0];if(lower){if(lower.flag&&lower.flag!=='0')s.flags[lower.flag]=false;landed={mapId:dest.id,boulderId:lower.eventId,x:lower.x,y:lower.y};}}result={ok:true,puzzle:'strength-boulder-hole',boulderId:boulder.eventId,hole:{x:tx,y:ty},landedBoulder:landed};}else{s.puzzle.boulders[boulder.eventId]={x:tx,y:ty};result={ok:true,puzzle:'strength-push',boulderId:boulder.eventId,position:{x:tx,y:ty}};}}}
 }else if(action==='useDoor'||action==='warp'){const p=front(s),w=usableWarp(m,s.x,s.y,s.facing)||usableWarp(m,p.x,p.y,s.facing);result=w?warp(world,w):{ok:false,reason:'no-warp'};
 }else if(action==='interact'){const p=front(s),x=payload.x??p.x,y=payload.y??p.y,e=m.bgEvents.find(e=>e.x===x&&e.y===y);
  if(Math.abs(s.x-x)+Math.abs(s.y-y)>1)return {world,result:{ok:false,reason:'out-of-reach'}};
  if(m.id==='MAP_ROCKET_HIDEOUT_ELEVATOR'&&e?.script==='RocketHideout_Elevator_EventScript_FloorSelect'){if(!hasItem(world,'ITEM_LIFT_KEY')&&!s.flags.FLAG_CAN_USE_ROCKET_HIDEOUT_LIFT)result={ok:false,reason:'locked',requires:'ITEM_LIFT_KEY',intent:{type:'elevator-needs-key'}};else{const choices={B1F:{mapId:'MAP_ROCKET_HIDEOUT_B1F',x:24,y:25,floor:3},B2F:{mapId:'MAP_ROCKET_HIDEOUT_B2F',x:28,y:16,floor:2},B4F:{mapId:'MAP_ROCKET_HIDEOUT_B4F',x:20,y:23,floor:0}},selected=choices[String(payload.floor||'').toUpperCase()];if(!selected)result={ok:true,puzzle:'rocket-elevator',choices:Object.keys(choices),currentFloor:s.puzzle.elevatorFloor??null,intent:{type:'choose-elevator-floor',choices:Object.keys(choices)}};else{s.mapId=selected.mapId;s.x=selected.x;s.y=selected.y;s.puzzle.elevatorFloor=selected.floor;s.visited[s.mapId]=true;result={ok:true,puzzle:'rocket-elevator',transition:{mapId:s.mapId,x:s.x,y:s.y}};}}}
  else
  if(e&&(e.kind==='hiddenItem'||e.kind==='item')){const distance=Math.abs(s.x-x)+Math.abs(s.y-y),allowed=e.underfoot?distance===0:distance<=1;if(!allowed)result={ok:false,reason:'out-of-reach'};else if(e.kind==='hiddenItem'&&!hasItem(world,'itemfinder'))result={ok:false,reason:'requires-itemfinder',requires:'itemfinder'};else if(objectAt(m,s,x,y))result={ok:false,reason:'blocked-by-object'};else if(s.collected[e.eventId])result={ok:false,reason:'already-collected'};else{s.collected[e.eventId]=true;const item=e.item||e.item_name||'UNKNOWN_ITEM',qty=Number(e.quantity||1);grantItem(world,item,qty);if(e.flag)s.flags[e.flag]=true;result={ok:true,pickedUp:{item,quantity:qty,hidden:e.kind==='hiddenItem',eventId:e.eventId},intent:{type:'field-item',item,quantity:qty,flag:e.flag,mapId:m.id,x:e.x,y:e.y}};}}
  else if(e?.door){const door=e.door;if(s.puzzle.openDoors?.[door.id])result={ok:true,alreadyOpen:true,puzzle:'silph-card-key'};else if(!hasItem(world,'ITEM_CARD_KEY')&&!s.flags.FLAG_HIDE_SILPH_CO_5F_CARD_KEY)result={ok:false,reason:'locked',requires:'ITEM_CARD_KEY',intent:{type:'locked-door',mapId:m.id,doorId:door.id,script:e.script}};else{s.puzzle.openDoors||={};s.puzzle.openDoors[door.id]=true;s.flags[door.flag]=true;result={ok:true,puzzle:'silph-card-key',doorId:door.id,openedCells:door.cells,intent:{type:'door-opened',mapId:m.id,doorId:door.id}};}}
  else if(e?.mechanism==='mansion-secret-switch'){s.flags.FLAG_POKEMON_MANSION_SWITCH_STATE=!s.flags.FLAG_POKEMON_MANSION_SWITCH_STATE;result={ok:true,puzzle:'pokemon-mansion-secret-switch',status:s.flags.FLAG_POKEMON_MANSION_SWITCH_STATE?'open':'closed',flag:'FLAG_POKEMON_MANSION_SWITCH_STATE',floor:mansionFloor(m.id)};}
  else if(m.id==='MAP_VERMILION_CITY_GYM'&&e?.mechanism==='surge-trash-can'){
   let game=s.puzzle.surge;
   if(!game||typeof game!=='object')game=s.puzzle.surge={targets:rollSurgeSwitches(),firstFound:false,complete:false,attempt:0};
   if(!validSurgeTargets(game.targets)){game.targets=rollSurgeSwitches();game.firstFound=false;game.complete=false;s.flags.FLAG_TEMP_1=false;delete s.flags.FLAG_FOUND_BOTH_VERMILION_GYM_SWITCHES;}
   const id=e.trashCanId;
   if(game.complete||s.flags.FLAG_FOUND_BOTH_VERMILION_GYM_SWITCHES)result={ok:true,puzzle:'surge-trash-can',status:'already-open'};
   else if(!game.firstFound&&!s.flags.FLAG_TEMP_1){
    if(id===game.targets[0]){game.firstFound=true;s.flags.FLAG_TEMP_1=true;result={ok:true,puzzle:'surge-trash-can',status:'first-switch-found',lock:'one-of-two'};}
    else result={ok:true,puzzle:'surge-trash-can',status:'wrong-first',reset:false};
   }else if(id===game.targets[1]){game.firstFound=true;game.complete=true;s.flags.FLAG_FOUND_BOTH_VERMILION_GYM_SWITCHES=true;result={ok:true,puzzle:'surge-trash-can',status:'both-switches-found',lock:'open'};}
   else{game.firstFound=false;game.complete=false;game.attempt=(game.attempt||0)+1;game.targets=rollSurgeSwitches();s.flags.FLAG_TEMP_1=false;delete s.flags.FLAG_FOUND_BOTH_VERMILION_GYM_SWITCHES;result={ok:true,puzzle:'surge-trash-can',status:'wrong-second-reset',reset:true};}
  }
  else if(e)result={ok:true,intent:{type:e.kind==='sign'?'read-sign':'map-event',mapId:m.id,x:e.x,y:e.y,script:e.script,sourceEvent:e}};else{const o=objectAt(m,s,x,y);if(o){if(o.mechanism==='mansion-secret-switch'){s.flags.FLAG_POKEMON_MANSION_SWITCH_STATE=!s.flags.FLAG_POKEMON_MANSION_SWITCH_STATE;result={ok:true,puzzle:'pokemon-mansion-secret-switch',status:s.flags.FLAG_POKEMON_MANSION_SWITCH_STATE?'open':'closed',flag:'FLAG_POKEMON_MANSION_SWITCH_STATE',floor:mansionFloor(m.id)};}else if(o.reward){if(s.collected[o.eventId])result={ok:false,reason:'already-collected'};else{s.collected[o.eventId]=true;grantItem(world,o.reward,1);if(o.flag&&o.flag!=='0')s.flags[o.flag]=true;for(const flag of o.rewardFlags||[])s.flags[flag]=true;result={ok:true,pickedUp:{item:o.reward,quantity:1,eventId:o.eventId},intent:{type:'field-item',item:o.reward,quantity:1,flag:o.flag,rewardFlags:o.rewardFlags,mapId:m.id,x:o.x,y:o.y,script:o.script}};}}else result={ok:true,intent:{type:o.trainer_type&&o.trainer_type!=='TRAINER_TYPE_NONE'?'trainer':'object-event',mapId:m.id,x,y,script:o.script,event:o}};}else{const w=usableWarp(m,x,y,s.facing);result=w?warp(world,w):{ok:false,reason:'nothing-to-interact'};}}
 }else if(action==='returnArea')result={ok:true,intent:{type:'open-area-map',mapId:m.id,region:m.region}};
 if(result.ok){s.revision++;s.turn=Number.isInteger(opts.storyTurn)?opts.storyTurn:s.turn+1;s.visited[s.mapId]=true;s.history.push({revision:s.revision,action,payload:clone(payload),mapId:s.mapId,x:s.x,y:s.y});if(s.history.length>80)s.history.shift();}
 return {world,result};
}
module.exports={ensure,validate,view,apply,maps:CATALOG.maps.map(m=>({id:m.id,name:m.name,region:m.region,type:m.type,floor:m.floor,width:m.width,height:m.height})),hiddenItems:CATALOG.maps.flatMap(m=>m.hiddenItems.map(e=>({mapId:m.id,mapName:m.name,...e}))),source:CATALOG.source};
