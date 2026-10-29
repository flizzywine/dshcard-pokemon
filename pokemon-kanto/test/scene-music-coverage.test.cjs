const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),data=file=>JSON.parse(fs.readFileSync(path.join(root,'public/data',file),'utf8'));
const {sceneryFor}=require('../presentation.cjs'),map=data('map.json'),events=data('kanto-story-events.json'),audio=data('story-audio.json'),mvu=require('../mvu.cjs');
const hasFile=rel=>assert.ok(rel&&fs.existsSync(path.join(root,'public',rel)),rel);
test('every map node has a valid illustrated scene and a local original-game music assignment',()=>{
 for(const node of map){const world=mvu.createInitialMvu().stat_data.宝可梦;world.地图.节点=node.id;world.战斗.状态='finished';world.剧情.初始御三家已选=true;
  const scene=sceneryFor(world);hasFile(scene?.image);const track=audio.tracks[audio.locations[node.id]];hasFile(track?.file);
 }
});
test('all story stages resolve their own scene and local music, including new lighthouse and Rocket scenes',()=>{
 for(const event of events)for(const stage of event.stages){const world=mvu.createInitialMvu().stat_data.宝可梦;const node=stage.node||event.node;world.地图.节点=node;world.战斗.状态='finished';world.剧情.初始御三家已选=true;
  world.剧情.剧场={地点:node,轮次:world.地图.轮次,最近动作:'kanto-story-event',sceneTag:stage.sceneTag||event.sceneTag,musicEvent:stage.musicEvent||event.musicEvent};
  hasFile(sceneryFor(world)?.image);hasFile(audio.tracks[audio.events[world.剧情.剧场.musicEvent]||audio.locations[node]]?.file);
  if(event.id==='bill-lighthouse-unknown')assert.equal(sceneryFor(world).id,'original-bill-lighthouse-night');
 }
});
test('camp uses the newly drawn camp and five additional recordings contain actual Ogg data',()=>{
 const world=mvu.createInitialMvu().stat_data.宝可梦;world.剧情.初始御三家已选=true;world.战斗.状态='finished';world.剧情.剧场={地点:world.地图.节点,轮次:world.地图.轮次,最近动作:'camp'};
 assert.equal(sceneryFor(world).id,'original-companion-camp-night');
 for(const id of ['game-corner','quest-guide','tense-story','camp-epilogue','lighthouse-flute']){const entry=audio.tracks[id];hasFile(entry?.file);const bytes=fs.readFileSync(path.join(root,'public',entry.file));assert.equal(bytes.toString('ascii',0,4),'OggS');assert.ok(bytes.length>10000);assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'),entry.sha256);}
});
