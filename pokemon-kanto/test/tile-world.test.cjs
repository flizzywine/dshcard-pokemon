const test=require('node:test');
const assert=require('node:assert/strict');
const tile=require('../tile-world.cjs');
const data=require('../tile-world-data.json');

test('imports source-sized Kanto floor grids, exact source collision and event tables',()=>{
  assert.equal(data.audit.mapCount,data.maps.length);
  assert.ok(data.maps.length>250);
  assert.ok(data.audit.hiddenItemCount>100);
  for(const m of data.maps){assert.equal(m.tiles.length,m.width*m.height,m.id);assert.equal(m.collision.length,m.tiles.length,m.id);assert.equal(m.elevation.length,m.tiles.length,m.id);}
  assert.ok(data.maps.some(m=>/SILPH_CO/.test(m.id)));
  assert.ok(data.maps.some(m=>/ROCKET_HIDEOUT/.test(m.id)));
  assert.ok(data.maps.some(m=>/INDIGO_PLATEAU/.test(m.id)));
  assert.equal(data.audit.hiddenItemAccess['no-open-adjacent-tile'],1);
  assert.equal(data.audit.graphicsUnavailable.length,0,'all maps should resolve original or source-declared shared tile atlases');
  assert.ok(data.maps.every(m=>m.hiddenItems.every(e=>e.flag&&e.item&&Number.isInteger(e.x)&&Number.isInteger(e.y))));
});

test('world movement follows collision and rejects stale action revisions',()=>{
  let world=tile.ensure({});const m=data.maps.find(x=>x.id===world.tileWorld.mapId),s=world.tileWorld;
  const open=m.collision[(s.y-1)*m.width+s.x]===0;
  assert.ok(open,'starter map should have a legal initial step');
  let r=tile.apply(world,'move',{direction:'up',expectedRevision:0});
  assert.equal(r.result.ok,true);assert.deepEqual([r.world.tileWorld.x,r.world.tileWorld.y],[s.x,s.y-1]);
  world=r.world;r=tile.apply(world,'move',{direction:'up',expectedRevision:0});
  assert.equal(r.result.reason,'stale-revision');assert.equal(r.world.tileWorld.revision,1);
});

test('legacy tile inventory migrates into the shared MVU bag once',()=>{
  const old={tileWorld:{mapId:'MAP_PALLET_TOWN',x:10,y:15,inventory:{ITEM_POTION:2,ITEM_CARD_KEY:1}}};
  const world=tile.ensure(old);
  assert.equal(world.背包.物品.potion,2);assert.ok(world.背包.关键物品.some(item=>item.id==='cardkey'));
  assert.equal(Object.hasOwn(world.tileWorld,'inventory'),false);
  tile.ensure(world);assert.equal(world.背包.物品.potion,2,'repeated ensure does not duplicate migrated counts');
});

test('source hidden items require local reach, set their original flag once, and persist inventory',()=>{
  const map=data.maps.find(m=>m.hiddenItems.some(e=>e.access==='walkable-adjacent'));
  const item=map.hiddenItems.find(e=>e.access==='walkable-adjacent');
  let world=tile.ensure({背包:{物品:{},关键物品:[{id:'itemfinder'}]},tileWorld:{mapId:map.id,x:0,y:0,facing:'up'}});
  // Probe from the map origin first: the supplied event coordinates cannot be used to teleport.
  let r=tile.apply(world,'interact',{x:item.x,y:item.y});
  if(Math.abs(world.tileWorld.x-item.x)+Math.abs(world.tileWorld.y-item.y)>1)assert.equal(r.result.reason,'out-of-reach');
  const neighbors=[[0,-1],[0,1],[-1,0],[1,0]].map(([dx,dy])=>[item.x+dx,item.y+dy]).find(([x,y])=>x>=0&&y>=0&&x<map.width&&y<map.height&&map.collision[y*map.width+x]===0);
  assert.ok(neighbors,'audited hidden item must have an adjacent open tile');
  world=tile.ensure({背包:world.背包,tileWorld:{...world.tileWorld,x:neighbors[0],y:neighbors[1]}});
  r=tile.apply(world,'interact',{x:item.x,y:item.y});assert.equal(r.result.ok,true);assert.equal(r.result.pickedUp.item,item.item);
  assert.equal(r.world.tileWorld.flags[item.flag],true);const itemId=require('../public/data/gen3-item-audit.json').items.find(x=>x.sourceId===item.item)?.id||item.item.replace(/^ITEM_/,'').toLowerCase();assert.ok(r.world.背包.物品[itemId]>=item.quantity);assert.equal(Object.hasOwn(r.world.tileWorld,'inventory'),false);
  const again=tile.apply(r.world,'interact',{x:item.x,y:item.y});assert.equal(again.result.reason,'already-collected');
  assert.equal(tile.validate(r.world).ok,true);
});

test('Silph Co Card Key doors reject without the key, open source cells with it, and stay open',()=>{
  const map=data.maps.find(m=>m.id==='MAP_SILPH_CO_2F'),event=map.bgEvents.find(e=>e.door),door=event.door,cell=door.closedCells.find(c=>c.collision===1);
  assert.ok(event&&door.cells.length&&door.closedCells.length);
  let world=tile.ensure({tileWorld:{mapId:map.id,x:event.x-1,y:event.y, facing:'right'}});
  const closed=tile.view(world);assert.equal(closed.collision[cell.y*map.width+cell.x],1);
  const deniedMove=tile.apply(world,'move',{direction:'right'});assert.equal(deniedMove.result.reason,'blocked');assert.deepEqual([deniedMove.world.tileWorld.x,deniedMove.world.tileWorld.y],[event.x-1,event.y]);
  let r=tile.apply(world,'interact',{x:event.x,y:event.y});assert.equal(r.result.reason,'locked');assert.equal(r.world.tileWorld.revision,0);
  world.背包.关键物品.push({id:'cardkey',名称:'门卡'});
  r=tile.apply(world,'interact',{x:event.x,y:event.y});assert.equal(r.result.ok,true);assert.equal(r.result.puzzle,'silph-card-key');
  assert.equal(r.world.tileWorld.flags[door.flag],true);
  const opened=tile.view(r.world),openCell=door.cells.find(c=>c.collision===0);
  assert.equal(opened.collision[openCell.y*map.width+openCell.x],0);assert.equal(opened.tiles[openCell.y*map.width+openCell.x],openCell.tileId);
  const crossing=tile.apply(r.world,'move',{direction:'right'});assert.equal(crossing.result.ok,true);
});

test('Rocket Hideout item-ball script grants the Lift Key and gates elevator floor choices',()=>{
  const map=data.maps.find(m=>m.id==='MAP_ROCKET_HIDEOUT_B4F'),key=map.objectEvents.find(o=>o.reward==='ITEM_LIFT_KEY');assert.ok(key);
  let world=tile.ensure({tileWorld:{mapId:map.id,x:key.x+1,y:key.y,facing:'left'}});
  let r=tile.apply(world,'interact',{x:key.x,y:key.y});assert.equal(r.result.pickedUp.item,'ITEM_LIFT_KEY');assert.equal(r.world.tileWorld.flags.FLAG_CAN_USE_ROCKET_HIDEOUT_LIFT,true);
  assert.ok(r.world.背包.关键物品.some(item=>item.id==='liftkey'));assert.equal(Object.hasOwn(r.world.tileWorld,'inventory'),false);
  world=tile.ensure({tileWorld:{mapId:'MAP_ROCKET_HIDEOUT_ELEVATOR',x:0,y:1,facing:'down',inventory:{}}});
  let locked=tile.apply(world,'interact',{x:0,y:2});assert.equal(locked.result.reason,'locked');
  world=r.world;world.tileWorld.mapId='MAP_ROCKET_HIDEOUT_ELEVATOR';world.tileWorld.x=0;world.tileWorld.y=1;
  r=tile.apply(world,'interact',{x:0,y:2});assert.deepEqual(r.result.choices,['B1F','B2F','B4F']);
  r=tile.apply(r.world,'interact',{x:0,y:2,floor:'B2F'});assert.equal(r.result.transition.mapId,'MAP_ROCKET_HIDEOUT_B2F');assert.deepEqual([r.world.tileWorld.x,r.world.tileWorld.y],[28,16]);
});

test('the remaining hidden-item location without an adjacent walk tile is explicitly audited unreachable',()=>{
  const m=data.maps.find(m=>m.hiddenItems.some(e=>e.access==='no-open-adjacent-tile'));
  const e=m.hiddenItems.find(e=>e.access==='no-open-adjacent-tile');assert.equal(m.id,'MAP_THREE_ISLAND_DUNSPARCE_TUNNEL');
  const world=tile.ensure({背包:{物品:{},关键物品:[{id:'itemfinder'}]},tileWorld:{mapId:m.id,x:0,y:0}});const r=tile.apply(world,'interact',{x:e.x,y:e.y});assert.equal(r.result.reason,'out-of-reach');
});

test('hidden items stay undisclosed and uncollectable until the Itemfinder is owned',()=>{
  const map=data.maps.find(m=>m.id==='MAP_VIRIDIAN_FOREST'),item=map.hiddenItems[0];
  let world=tile.ensure({tileWorld:{mapId:map.id,x:item.x,y:item.y}});
  assert.equal(tile.view(world).interactables.some(entry=>entry.eventId===item.eventId),false);
  let r=tile.apply(world,'interact',{x:item.x,y:item.y});assert.equal(r.result.reason,'requires-itemfinder');
  world.背包.关键物品.push({id:'itemfinder',名称:'探宝器'});
  assert.equal(tile.view(world).interactables.some(entry=>entry.eventId===item.eventId),true);
  r=tile.apply(world,'interact',{x:item.x,y:item.y});assert.equal(r.result.ok,true);
});

test('underfoot leftovers remain blocked by an uncleared source Snorlax even with the Itemfinder',()=>{
  const map=data.maps.find(m=>m.id==='MAP_ROUTE12'),item=map.hiddenItems.find(entry=>entry.item==='ITEM_LEFTOVERS');
  const world=tile.ensure({背包:{物品:{},关键物品:[{id:'itemfinder'}]},tileWorld:{mapId:map.id,x:item.x,y:item.y}});
  const blocked=tile.apply(world,'interact',{x:item.x,y:item.y});assert.equal(blocked.result.reason,'blocked-by-object');
  world.tileWorld.flags.FLAG_HIDE_ROUTE_12_SNORLAX=true;
  const found=tile.apply(world,'interact',{x:item.x,y:item.y});assert.equal(found.result.pickedUp.item,'ITEM_LEFTOVERS');
  assert.equal(found.world.背包.物品.leftovers,1);
});

test('underfoot Tower and Viridian Gym items wait for their original blocking event flags',()=>{
  for(const [mapId,itemId,flag,itemKey] of [
    ['MAP_POKEMON_TOWER_7F','ITEM_SOOTHE_BELL','FLAG_HIDE_TOWER_FUJI','soothebell'],
    ['MAP_VIRIDIAN_CITY_GYM','ITEM_MACHO_BRACE','FLAG_HIDE_VIRIDIAN_GIOVANNI','machobrace'],
  ]){
    const map=data.maps.find(m=>m.id===mapId),item=map.hiddenItems.find(e=>e.item===itemId);
    const world=tile.ensure({背包:{物品:{},关键物品:[{id:'itemfinder'}]},tileWorld:{mapId,x:item.x,y:item.y}});
    assert.equal(tile.apply(world,'interact',{x:item.x,y:item.y}).result.reason,'blocked-by-object',mapId);
    world.tileWorld.flags[flag]=true;
    const found=tile.apply(world,'interact',{x:item.x,y:item.y});
    assert.equal(found.result.ok,true,mapId);assert.equal(found.world.背包.物品[itemKey],1,mapId);
  }
});

test('Victory Road boulders require the field Strength move and advance only into open source cells',()=>{
  const map=data.maps.find(m=>m.id==='MAP_VICTORY_ROAD_2F'),boulder=map.objectEvents.find(o=>o.pushable&&o.local_id==='LOCALID_VICTORY_ROAD_2F_BOULDER1');
  assert.ok(boulder);const base={tileWorld:{mapId:map.id,x:6,y:18,facing:'up'}};
  let locked=tile.apply(base,'pushBoulder',{direction:'up'});assert.equal(locked.result.requires,'strength');
  const skilled={...base,队伍:[{招式:['strength']}],训练家:{徽章:['彩虹徽章']}};
  const moved=tile.apply(skilled,'pushBoulder',{direction:'up'});assert.equal(moved.result.ok,true);assert.equal(moved.result.puzzle,'strength-push');
  assert.deepEqual(moved.world.tileWorld.puzzle.boulders[boulder.eventId],{x:6,y:16});
  assert.equal(tile.view(moved.world).interactables.find(e=>e.eventId===boulder.eventId).y,16);
});

test('Seafoam boulder hole movement hides the pushed boulder and reveals its matching lower-floor boulder',()=>{
  const map=data.maps.find(m=>m.id==='MAP_SEAFOAM_ISLANDS_B1F'),boulder=map.objectEvents.find(o=>o.pushable&&o.x===22&&o.y===8),hole=map.warps.find(w=>w.x===23&&w.y===8),dest=data.maps.find(m=>m.id===hole.dest_map),lower=dest.objectEvents.find(o=>o.pushable&&o.x===22&&o.y===8);
  assert.ok(boulder&&hole&&lower);const skilled={tileWorld:{mapId:map.id,x:21,y:8,facing:'right'},队伍:[{招式:['strength']}],训练家:{徽章:['彩虹徽章']}};
  const r=tile.apply(skilled,'pushBoulder',{direction:'right'});assert.equal(r.result.puzzle,'strength-boulder-hole');assert.equal(r.result.landedBoulder.boulderId,lower.eventId);
  assert.equal(r.world.tileWorld.flags[boulder.flag],true);assert.equal(r.world.tileWorld.flags[lower.flag],false);
  assert.ok(tile.view(r.world).interactables.some(e=>e.eventId===boulder.eventId)===false);
  assert.ok(tile.view(tile.ensure({tileWorld:{mapId:dest.id,x:20,y:8,flags:r.world.tileWorld.flags}})).interactables.some(e=>e.eventId===lower.eventId));
});

test('Seafoam source water currents carry the player in their authored direction',()=>{
  const map=data.maps.find(m=>m.id==='MAP_SEAFOAM_ISLANDS_B3F');
  const start={tileWorld:{mapId:map.id,x:18,y:4,facing:'down'}};
  const moved=tile.apply(start,'move',{direction:'down'});
  assert.equal(moved.result.ok,true);assert.equal(moved.result.puzzle,'seafoam-water-current');
  assert.deepEqual(moved.result.forcedPath,[{x:18,y:6,direction:'down'},{x:18,y:7,direction:'down'}]);
  assert.deepEqual([moved.world.tileWorld.x,moved.world.tileWorld.y],[18,7]);
});

test('Sabrina Gym teleporters land at the exact source-declared destination warp index',()=>{
  const map=data.maps.find(m=>m.id==='MAP_SAFFRON_CITY_GYM'),source=map.warps.find(w=>w.dest_map===map.id&&w.dest_warp_id==='32');
  assert.ok(source);const target=map.warps[Number(source.dest_warp_id)];assert.deepEqual([target.x,target.y],[28,23]);
  const world=tile.ensure({tileWorld:{mapId:map.id,x:source.x,y:source.y,facing:'up'}});
  const result=tile.apply(world,'interact',{x:source.x,y:source.y});
  assert.equal(result.result.ok,true);assert.deepEqual([result.world.tileWorld.x,result.world.tileWorld.y],[target.x,target.y]);
});

test('Surge trash cans are a random two-switch adjacent sequence; wrong second resets the locks',()=>{
  const map=data.maps.find(m=>m.id==='MAP_VERMILION_CITY_GYM'),bin=id=>map.bgEvents.find(e=>e.trashCanId===id);
  assert.equal(tile.apply({tileWorld:{mapId:map.id,x:5,y:8,facing:'up'}},'move',{direction:'up'}).result.reason,'blocked');
  let world=tile.ensure({tileWorld:{mapId:map.id,x:4,y:10,facing:'left',puzzle:{surgeTargets:[1,2],surge:{targets:[1,2],firstFound:false,complete:false,attempt:0}}}});
  let r=tile.apply(world,'interact',{x:bin(3).x,y:bin(3).y});assert.equal(r.result.status,'wrong-first');
  world=r.world;world.tileWorld.x=2;world.tileWorld.y=10;
  r=tile.apply(world,'interact',{x:bin(1).x,y:bin(1).y});assert.equal(r.result.status,'first-switch-found');assert.equal(tile.view(r.world).puzzles.surge.phase,'first');
  world=r.world;world.tileWorld.x=6;world.tileWorld.y=10;
  r=tile.apply(world,'interact',{x:bin(3).x,y:bin(3).y});assert.equal(r.result.status,'wrong-second-reset');assert.equal(tile.view(r.world).puzzles.surge.phase,'closed');
  world=r.world;world.tileWorld.puzzle.surge.targets=[1,2];world.tileWorld.x=2;world.tileWorld.y=10;
  r=tile.apply(world,'interact',{x:bin(1).x,y:bin(1).y});world=r.world;world.tileWorld.x=4;world.tileWorld.y=10;
  r=tile.apply(world,'interact',{x:bin(2).x,y:bin(2).y});assert.equal(r.result.status,'both-switches-found');assert.equal(r.world.tileWorld.flags.FLAG_FOUND_BOTH_VERMILION_GYM_SWITCHES,true);
  const open=tile.view(r.world);assert.equal(open.puzzles.surge.phase,'open');assert.equal(open.collision[7*map.width+5],0);
  r.world.tileWorld.x=5;r.world.tileWorld.y=8;assert.equal(tile.apply(r.world,'move',{direction:'up'}).result.ok,true);
});

test('new Surge target pairs always pick two physically adjacent cans',()=>{
  const map=data.maps.find(m=>m.id==='MAP_VERMILION_CITY_GYM'),can=map.bgEvents.find(e=>e.trashCanId===3);
  const world=tile.ensure({tileWorld:{mapId:map.id,x:can.x-1,y:can.y,facing:'right'}});
  const result=tile.apply(world,'interact',{x:can.x,y:can.y});
  const [first,second]=result.world.tileWorld.puzzle.surge.targets;
  const position=id=>{const item=map.bgEvents.find(e=>e.trashCanId===id);return {x:item.x,y:item.y};};
  const a=position(first),b=position(second);
  assert.equal(Math.abs(a.x-b.x)+Math.abs(a.y-b.y),2,'can centers are one trash-can-width apart');
  assert.ok(Math.abs(a.x-b.x)+Math.abs(a.y-b.y)<=2,'the second lock must be in a neighboring can position');
});

test('a saved independent Surge pair is discarded instead of opening on a non-neighboring second can',()=>{
  const map=data.maps.find(m=>m.id==='MAP_VERMILION_CITY_GYM'),can=map.bgEvents.find(e=>e.trashCanId===3);
  const world=tile.ensure({tileWorld:{mapId:map.id,x:can.x-1,y:can.y,facing:'right',puzzle:{surge:{targets:[1,3],firstFound:true,complete:false,attempt:1}}}});
  const result=tile.apply(world,'interact',{x:can.x,y:can.y});
  assert.notEqual(result.result.status,'both-switches-found');
  assert.notEqual(result.world.tileWorld.flags.FLAG_FOUND_BOTH_VERMILION_GYM_SWITCHES,true);
  const [first,second]=result.world.tileWorld.puzzle.surge.targets;
  const position=id=>map.bgEvents.find(e=>e.trashCanId===id);
  assert.equal(Math.abs(position(first).x-position(second).x)+Math.abs(position(first).y-position(second).y),2);
});

test('Rocket Hideout spin tiles force the source-defined direction until the spin run ends',()=>{
  const map=data.maps.find(m=>m.id==='MAP_ROCKET_HIDEOUT_B2F');
  assert.equal(map.behavior[6*map.width+3],0x54,'source tile is MB_SPIN_RIGHT');
  const world=tile.ensure({tileWorld:{mapId:map.id,x:2,y:6,facing:'right'}});
  const r=tile.apply(world,'move',{direction:'right'});assert.equal(r.result.ok,true);assert.equal(r.result.puzzle,'rocket-hideout-spin');
  assert.deepEqual([r.world.tileWorld.x,r.world.tileWorld.y],[4,6]);assert.deepEqual(r.result.forcedPath,[{x:4,y:6,direction:'right'}]);
});

test('Pokemon Mansion switch toggles the source-authored multi-door floor barriers',()=>{
  const map=data.maps.find(m=>m.id==='MAP_POKEMON_MANSION_1F'),statue=map.bgEvents.find(e=>e.mechanism==='mansion-secret-switch'),mechanism=data.mansionMechanisms[map.id],cell=mechanism.open.find(c=>c.collision===0);
  assert.ok(statue&&cell);let world=tile.ensure({tileWorld:{mapId:map.id,x:statue.x,y:statue.y+1,facing:'up'}});
  const closed=tile.view(world);assert.equal(closed.collision[cell.y*map.width+cell.x],1);
  let r=tile.apply(world,'interact',{x:statue.x,y:statue.y});assert.equal(r.result.puzzle,'pokemon-mansion-secret-switch');assert.equal(r.result.status,'open');
  assert.equal(tile.view(r.world).collision[cell.y*map.width+cell.x],0);
  r=tile.apply(r.world,'interact',{x:statue.x,y:statue.y});assert.equal(r.result.status,'closed');assert.equal(tile.view(r.world).collision[cell.y*map.width+cell.x],1);
});

test('doors change maps through the declared warp destination and return a transition',()=>{
  const source=data.maps.find(m=>m.id==='MAP_PALLET_TOWN'),w=source.warps.find(x=>data.maps.some(m=>m.id===x.dest_map));
  assert.ok(w);const world=tile.ensure({tileWorld:{mapId:source.id,x:w.x,y:w.y,facing:'up'}});
  const result=tile.apply(world,'interact',{x:w.x,y:w.y});
  assert.equal(result.result.ok,true);assert.equal(result.world.tileWorld.mapId,w.dest_map);assert.equal(result.result.transition.mapId,w.dest_map);
});
