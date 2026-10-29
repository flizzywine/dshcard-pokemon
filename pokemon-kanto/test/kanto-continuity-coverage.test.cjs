'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, 'public/data', file), 'utf8'));
const trainerEntries = read('trainers.json');
const trainers = new Map(trainerEntries.map(entry => [entry.id, entry]));
const campaign = require('../story-campaign.cjs').data();
const events = read('kanto-story-events.json');
const quests = read('deep-quests.json');
const audio = read('story-audio.json');
const map = read('map.json');
const sceneContext = require('../scene-context.cjs').sceneContext;
const presentation = require('../presentation.cjs');

test('campaign, story-event, and deep-quest portrait references resolve to real trainer art', () => {
  const references = [
    ...campaign.chapters.flatMap(chapter => (chapter.speakers || []).map(speaker => [chapter.id, speaker.id, speaker.portraitId])),
    ...events.map(event => [event.id, event.speaker, event.portraitId]),
    ...events.flatMap(event=>event.stages.filter(stage=>stage.portraitId).map(stage=>[event.id+'/'+stage.id,stage.speaker||event.speaker,stage.portraitId])),
    ...quests.map(quest => [quest.id, quest.npcName, quest.npcId]),
  ];
  assert.equal(campaign.chapters.length, 8);
  assert.equal(events.length, 23);
  assert.equal(quests.length, 33);
  for (const [source, name, id] of references) {
    const entry = trainers.get(id);
    assert.ok(entry, `${source} portrait ID ${id} (${name}) has a trainer record`);
    const image = path.join(root, 'public', entry.image);
    assert.ok(fs.existsSync(image), `${source} portrait file exists: ${entry.image}`);
  }
});

test('game rival, manga identities, and anime aliases remain explicitly distinct', () => {
  const required = ['trainer_ash','oak','misty','brock','rival_early','rival_late',
    'trainer_jessie','trainer_james','red','manga-red','manga-green','manga-blue'];
  for (const id of required) assert.ok(trainers.has(id), `missing ${id}`);
  const alias = (id, value) => assert.ok(trainers.get(id).aliases.includes(value), `${id} should resolve ${value}`);
  alias('trainer_ash', '小智'); alias('trainer_jessie', '武藏'); alias('trainer_james', '小次郎');
  for (const id of ['rival_early','rival_late']) {
    alias(id, 'Gary'); alias(id, 'Blue (game rival)');
    assert.ok(!trainers.get(id).aliases.includes('青绿'));
  }
  for (const [id, character, from] of [
    ['manga-red','Red (Pokémon Adventures)','red'],
    ['manga-green','Green (Pokémon Adventures)','game-blue-reference'],
    ['manga-blue','Blue (Pokémon Adventures)','leaf'],
  ]) {
    const entry = trainers.get(id);
    assert.equal(entry.spriteType, 'adapted-art');
    assert.equal(entry.adapted, true);
    assert.equal(entry.adaptedCharacter, character);
    assert.equal(entry.adaptedFromId, from);
    assert.ok(entry.adaptationNote.length > 30);
    assert.equal(entry.width, 1024); assert.equal(entry.height, 1024);
  }
  alias('manga-green', '青绿'); alias('manga-blue', '小蓝');
  const yellow=trainers.get('manga-yellow');
  assert.equal(yellow.generated,true);assert.equal(yellow.ageGroup,'child');
  assert.ok(yellow.stageScale<.8,'Yellow has a visibly shorter child silhouette');
  assert.equal(events.find(event=>event.id==='yellow-forest-listening').portraitId,'manga-yellow');
  assert.notEqual(trainers.get('rival_early').image,trainers.get('manga-green').image,'Gary and Green have separate artwork');
});

test('Bill and Mr Fuji appear with their own generated portraits in the rescued/research stages', () => {
  const bill = events.find(event => event.id === 'bill-cottage-ticket');
  const fuji = events.find(event => event.id === 'lavender-fuji-rescue');
  assert.equal(bill.speaker, '小霞'); assert.equal(bill.portraitId, 'misty');
  assert.equal(fuji.speaker, '看灵人'); assert.equal(fuji.portraitId, 'channeler');
  assert.ok(bill.stages.some(stage=>stage.speaker==='正辉'&&stage.portraitId==='bill'));
  assert.ok(fuji.stages.some(stage=>stage.speaker==='富士老人'&&stage.portraitId==='fuji'));
  for(const id of ['bill','fuji'])assert.equal(trainers.get(id).generated,true);
});

test('new event and stage scene metadata resolve to existing background tags and music tracks', () => {
  const backgrounds = read('backgrounds.json');
  const scenery = read('story-scenery.json').items;
  for (const id of ['route3-partner-camp','vermilion-rocket-promise','saffron-manga-evidence','seafoam-autonomous-rescue']) {
    const event = events.find(entry => entry.id === id);
    assert.ok(event, `missing ${id}`);
    for (const stage of event.stages) {
      const sceneTag = stage.sceneTag || event.sceneTag;
      const musicEvent = stage.musicEvent || event.musicEvent;
      assert.ok(sceneTag, `${id}/${stage.id} carries a scene tag`);
      assert.ok(musicEvent, `${id}/${stage.id} carries a music event`);
      const hasTaggedImage = [...backgrounds, ...scenery].some(item => item.sceneTags?.includes(sceneTag));
      const hasCampFallback = sceneTag === 'camp' && backgrounds.some(item => item.id === 'masters-forest-evening');
      assert.ok(hasTaggedImage || hasCampFallback, `${sceneTag} has a tagged image or explicit presentation fallback`);
      const trackId = audio.events[musicEvent];
      assert.ok(trackId && audio.tracks[trackId], `${musicEvent} maps to an existing story track`);
      assert.ok(fs.existsSync(path.join(root, 'public', audio.tracks[trackId].file)), `${trackId} is bundled`);
    }
  }
});

test('gym, camp, and mansion beats select an included scene image and sourced music cue', () => {
  const worldAt = (node, action) => {
    const variables = require('../mvu.cjs').createInitialMvu(1);
    const world = variables.stat_data['宝可梦'];
    const location = map.find(entry => entry.id === node);
    world.地图.节点 = node; world.地图.地点 = location.name;
    world.战斗.状态 = 'finished'; world.遭遇 = null;
    world.剧情.剧场 = {地点:node,轮次:world.地图.轮次,最近动作:action};
    return world;
  };
  const assertScene = (world, tag, event, expectedId) => {
    const context = sceneContext(world);
    assert.equal(context.sceneTag, tag);
    assert.equal(context.musicEvent, event);
    const scene = presentation.sceneryFor(world);
    assert.equal(scene.id, expectedId);
    assert.ok(fs.existsSync(path.join(root, 'public', scene.image)), `${scene.id} image exists`);
    const trackId = audio.events[event];
    assert.ok(trackId && audio.tracks[trackId], `${event} points to an included track`);
    assert.ok(fs.existsSync(path.join(root, 'public', audio.tracks[trackId].file)), `${trackId} audio exists`);
  };

  for (const node of ['pewter','cerulean','vermilion','celadon','fuchsia','saffron','cinnabar','viridian']) {
    const world = worldAt(node, 'gym');
    world.遭遇 = {类型:'gym',道馆:0,训练家:'馆主',队伍:[]};
    world.战斗.状态 = 'pending';
    assertScene(world, `gym:${node}`, 'gymInterior', node === 'pewter' ? 'original-rock-gym' : `gym-${node}`);
  }
  assertScene(worldAt('route25','camp'), 'camp', 'campRest', 'original-companion-camp-night');
  const mansion = worldAt('cinnabar','kanto-story-event');
  mansion.剧情.关都事件.记录 = [{id:'cinnabar-mansion-key'}];
  assertScene(mansion, 'cave', 'pokemonMansion', 'masters-cave-alt');
});
