'use strict';
const {createHash}=require('node:crypto');
const tables=require('./frlg-encounters.cjs');
const locations=require('./public/data/map.json');
const byNode=new Map(locations.map(node=>[node.id,node]));
const legendary=new Set([144,145,146,150,151]);
const version=world=>world?.设置?.版本==='leafgreen'?'leafgreen':'firered';
function habitat(world,nodeId=world.地图.节点,method='auto'){
 const node=byNode.get(nodeId);if(!node)return null;
 const source=tables.pool(nodeId,{version:version(world),method});
 if(!source&&method!=='auto')return null;
 return source?{...source,species:source.species.filter(id=>!legendary.has(id))}:{sourceMap:null,method:'auto',rate:null,species:(node.encounters||[]).filter(id=>!legendary.has(id)),slots:[]};
}
function choose(world,turn,{speciesId,method='auto'}={}){
 const node=byNode.get(world.地图.节点);if(!node||!['route','cave'].includes(node.kind))throw Error('只有野外路线和洞窟可以探索野生遭遇。');
 const table=habitat(world,node.id,method);if(!table?.species.length||speciesId&&!table.species.includes(speciesId))throw Error('这种宝可梦不在当前版本与探索方式的当地遭遇池中。');
 const seed=`${node.id}:${turn}`;
 const chosen=table.sourceMap?tables.roll(node.id,{version:version(world),method,speciesId,seed}):null;
 const bytes=createHash('sha256').update(seed).digest();
 return {...(chosen||{speciesId:speciesId||table.species[bytes[0]%table.species.length],level:Math.max(2,(node.level||3)+(bytes[1]%3)-1)}),method:table.method,version:version(world),sourceMap:table.sourceMap};
}
module.exports={version,habitat,choose};
