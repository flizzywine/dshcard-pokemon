'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mvu = require('../mvu.cjs');
const map = require('../public/data/map.json');
const {GYM_CAPS,levelCap} = require('../progression-rules.cjs');

const BADGES=['岩石徽章','蓝色徽章','橙色徽章','彩虹徽章','粉红徽章','金色徽章','深红徽章','绿色徽章'];
const LEGENDARIES=new Set([144,145,146,150,151]);
const root=variables=>variables.stat_data['宝可梦'];
function atNode(id,badgeCount=0,leagueProgress=0){
  const variables=mvu.createInitialMvu(),world=root(variables),node=map.find(item=>item.id===id);
  world.地图.节点=id;world.地图.地点=node.name;world.地图.轮次=0;
  world.训练家.徽章=BADGES.slice(0,badgeCount);
  world.剧情.联盟进度=leagueProgress;
  world.遭遇=null;world.战斗={轮次:0,状态:'finished',结果:'',摘要:'',操作序号:0};
  return variables;
}

test('ordinary route and cave encounters never roll legendary species',()=>{
  for(const node of map.filter(item=>['route','cave'].includes(item.kind))){
    let variables=atNode(node.id),world=root(variables);
    for(let turn=1;turn<=64;turn++){
      variables=mvu.ensureEncounter(variables,turn);world=root(variables);
      assert.equal(LEGENDARIES.has(world.遭遇.队伍[0].图鉴编号),false,`${node.name} turn ${turn}`);
      world.战斗.状态='finished';world.遭遇=null;
    }
  }
});

test('late-game landmark actions create one explicit fixed legendary encounter',()=>{
  const cases=[
    ['seafoam',144,'articuno',8,0],
    ['power-plant',145,'zapdos',8,0],
    ['cerulean-cave',150,'mewtwo',8,5],
  ];
  for(const [nodeId,speciesId,key,badgeCount,leagueProgress] of cases){
    let variables=atNode(nodeId,badgeCount,leagueProgress),world=root(variables);
    const option=mvu.theaterView(variables).theater.options.find(item=>item.id==='legendary');
    assert.ok(option?.enabled,`${key} should have an enabled explicit action`);
    variables=mvu.theaterAction(variables,'legendary',{id:speciesId,key});world=root(variables);
    assert.equal(world.遭遇.固定遭遇,key);
    assert.equal(world.遭遇.队伍[0].图鉴编号,speciesId);
    assert.equal(world.剧情.特殊遭遇已触发.includes(key),true);
    assert.equal(world.战斗.状态,'pending');
    assert.throws(()=>mvu.theaterAction(variables,'legendary',{id:speciesId,key}),/触发过/);
    world.战斗.状态='finished';world.遭遇=null;
    variables=mvu.ensureEncounter(variables,world.地图.轮次+1);world=root(variables);
    assert.notEqual(world.遭遇.队伍[0].图鉴编号,speciesId,`${key} must not respawn after resolution`);
  }
});

test('legendary leads are hidden behind their progression gates',()=>{
  for(const [nodeId,id] of [['seafoam',144],['power-plant',145]]){
    const beforeEight=mvu.theaterView(atNode(nodeId,7)).theater.options.find(item=>item.id==='legendary');
    assert.equal(beforeEight.enabled,false);
    assert.match(beforeEight.reason,/八枚徽章/);
    const ready=mvu.theaterView(atNode(nodeId,8)).theater.options.find(item=>item.id==='legendary');
    assert.equal(ready.payload.id,id);
  }
  const variables=atNode('cerulean-cave',8,4);
  const beforeChampion=mvu.theaterView(variables).theater.options.find(item=>item.id==='legendary');
  assert.equal(beforeChampion.enabled,false);
  assert.match(beforeChampion.reason,/冠军/);
  const afterChampion=mvu.theaterView(atNode('cerulean-cave',8,5)).theater.options.find(item=>item.id==='legendary');
  assert.equal(afterChampion.enabled,true);
});

test('gym team levels stay within each pre-gym cap',()=>{
  const towns=map.filter(node=>Number.isInteger(node.gym));
  for(const node of towns){
    const variables=atNode(node.id,node.gym),world=root(variables);
    const challenged=mvu.theaterAction(variables,'challenge-gym',{gym:node.gym});
    const levels=root(challenged).遭遇.队伍.map(mon=>mon.等级);
    assert.ok(Math.max(...levels)<=levelCap(world),`${node.name} levels ${levels} exceed cap ${GYM_CAPS[node.gym]}`);
  }
});
