// Imports the public pret/pokefirered map JSON and the original 16-bit map grids.
// Run from this directory: node import-tile-world.cjs [path-to-pokefirered]
const fs = require('node:fs');
const path = require('node:path');
const source = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'work', 'frlg-source-092', 'pokefirered-ce6406d8c2eaf46d543c8a2606de0c3cb1951982'));
const out = path.join(__dirname, 'tile-world-data.json');
const mapsDir = path.join(source, 'data/maps');
const layouts = JSON.parse(fs.readFileSync(path.join(source, 'data/layouts/layouts.json'), 'utf8')).layouts;
const layoutById = new Map(layouts.map(x => [x.id, x]));
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const parseBlocks = text => { const starts=[...text.matchAll(/^([A-Za-z0-9_]+)::[^\r\n]*\r?\n/gm)], out={}; for(let i=0;i<starts.length;i++)out[starts[i][1]]=text.slice(starts[i].index+starts[i][0].length,starts[i+1]?.index??text.length); return out; };
const u16s = p => { const b = fs.readFileSync(p), a = []; for (let i=0;i+1<b.length;i+=2) a.push(b.readUInt16LE(i)); return a; };
const u32s = p => { const b = fs.readFileSync(p), a = []; for (let i=0;i+3<b.length;i+=4) a.push(b.readUInt32LE(i)); return a; };
const DIRS = [[0,-1],[0,1],[-1,0],[1,0]];
const tilesetDir = (which, name) => path.join(source, 'data/tilesets', which, name.replace(/^gTileset_/, '').replace(/[A-Z]/g, (m,i)=> (i? '_':'')+m.toLowerCase()));
const normalizeTileset = name => ({GenericBuilding1:'generic_building_1',GenericBuilding2:'generic_building_2',SeviiIslands123:'sevii_islands_123',SeviiIslands45:'sevii_islands_45',SeviiIslands67:'sevii_islands_67',SSAnne:'ss_anne'}[name.replace(/^gTileset_/, '')] || name.replace(/^gTileset_/, '').replace(/[A-Z]/g, (m,i)=> (i? '_':'')+m.toLowerCase()));
const readAttr = (which, ts) => { const p=path.join(source,'data/tilesets',which,normalizeTileset(ts),'metatile_attributes.bin'); return fs.existsSync(p)?u32s(p):[]; };
const graphics = {};
const globalScripts=path.join(source,'data/scripts');
const silphBlocks=parseBlocks(fs.readFileSync(path.join(globalScripts,'silphco_doors.inc'),'utf8'));
const openLabelById={}; for(const match of (silphBlocks.EventScript_OpenDoor||'').matchAll(/call_if_eq VAR_TEMP_1,\s*(\d+),\s*(\w+)/g))openLabelById[Number(match[1])]=match[2];
const silphTileIds={};for(const match of fs.readFileSync(path.join(source,'include/constants/metatile_labels.h'),'utf8').matchAll(/^#define\s+(METATILE_SilphCo_\w+)\s+(0x[\da-fA-F]+|\d+)/gm))silphTileIds[match[1]]=Number(match[2]);
const tileLabels={};for(const match of fs.readFileSync(path.join(source,'include/constants/metatile_labels.h'),'utf8').matchAll(/^#define\s+(METATILE_\w+)\s+(0x[\da-fA-F]+|\d+)/gm))tileLabels[match[1]]=Number(match[2]);
const silphOpenCells={};for(const [label,body] of Object.entries(silphBlocks)){if(!/^EventScript_Open\d+FDoor\d*$/.test(label))continue;silphOpenCells[label]=[...body.matchAll(/setmetatile\s+(\d+),\s*(\d+),\s*(METATILE_SilphCo_\w+),\s*([01])/g)].map(m=>({x:Number(m[1]),y:Number(m[2]),tileId:silphTileIds[m[3]],collision:Number(m[4])}));}
const silphCloseCells={};for(const [label,body] of Object.entries(silphBlocks)){if(!/^EventScript_Close\d+FDoor\d*$/.test(label))continue;silphCloseCells[label]=[...body.matchAll(/setmetatile\s+(\d+),\s*(\d+),\s*(METATILE_SilphCo_\w+),\s*([01])/g)].map(m=>({x:Number(m[1]),y:Number(m[2]),tileId:silphTileIds[m[3]],collision:Number(m[4])}));}
const doorScripts=parseBlocks(fs.readFileSync(path.join(globalScripts,'silphco_doors.inc'),'utf8'));
const silphDoorRules={};for(const [script,body] of Object.entries(doorScripts)){const floor=script.match(/^SilphCo_(\d+F)_EventScript_Door\w*$/)?.[1];if(!floor)continue;const idx=Number(body.match(/setvar VAR_TEMP_1,\s*(\d+)/)?.[1]),flag=body.match(/goto_if_set\s+(FLAG_SILPH_[A-Z0-9_]+),/)?.[1],openLabel=openLabelById[idx],closeLabel=openLabel?.replace('EventScript_Open','EventScript_Close');if(idx&&flag&&openLabel)silphDoorRules[script]={id:flag,flag,mapId:`MAP_SILPH_CO_${floor}`,openLabel,index:idx,cells:silphOpenCells[openLabel]||[],closedCells:silphCloseCells[closeLabel]||[]};}
const scriptRewards={},scriptRewardFlags={};
function collectScriptRewards(file){if(!fs.existsSync(file))return;for(const [script,body] of Object.entries(parseBlocks(fs.readFileSync(file,'utf8')))){const matches=[...body.matchAll(/(?:finditem|giveitem)\s+(ITEM_[A-Z0-9_]+)/g)];if(matches.length===1&&!/trainerbattle/.test(body)){const before=body.slice(0,matches[0].index);if(!/goto_if|call_if|compare|checkitem/i.test(before)){scriptRewards[script]=matches[0][1];scriptRewardFlags[script]=[...before.matchAll(/setflag\s+(FLAG_[A-Z0-9_]+)/g)].map(m=>m[1]);}}}}
for(const f of fs.readdirSync(globalScripts).filter(f=>f.endsWith('.inc')))collectScriptRewards(path.join(globalScripts,f));
const readTilesetGraphics = (which,name) => {
  const norm=normalizeTileset(name),key=`${which}:${norm}`; if(graphics[key])return;
  // Silph Co uses the exact same original atlas and palettes as the condominiums.
  const artNorm=which==='secondary'&&norm==='silph_co'?'condominiums':norm;
  const dir=path.join(source,'data/tilesets',which,artNorm),metaPath=path.join(source,'data/tilesets',which,norm,'metatiles.bin'),png=path.join(dir,'tiles.png');
  if(!fs.existsSync(png)||!fs.existsSync(metaPath))return;
  const publicDir=path.join(__dirname,'public/assets/maps/tilesets');fs.mkdirSync(publicDir,{recursive:true});
  const asset=`assets/maps/tilesets/${which}_${norm}.png`;fs.copyFileSync(png,path.join(__dirname,'public',asset));
  const raw=u16s(metaPath), metatiles=[];for(let i=0;i+7<raw.length;i+=8)metatiles.push(raw.slice(i,i+8));
  const palDir=path.join(dir,'palettes'),palettes=[];
  if(fs.existsSync(palDir))for(const f of fs.readdirSync(palDir).filter(x=>x.endsWith('.pal')).sort()){
    const lines=fs.readFileSync(path.join(palDir,f),'utf8').trim().split(/\r?\n/), colors=lines.slice(3).map(line=>line.trim().split(/\s+/).slice(0,3).map(Number)).filter(c=>c.length===3&&c.every(Number.isFinite));
    palettes[Number.parseInt(f,10)]=colors;
  }
  graphics[key]={asset,metatiles,palettes};
};
// Import all Kanto/Sevii playable areas. Only battle-colosseum test layouts are excluded.
const dirs = fs.readdirSync(mapsDir, {withFileTypes:true}).filter(d=>d.isDirectory());
for(const dir of dirs)collectScriptRewards(path.join(mapsDir,dir.name,'scripts.inc'));
const surgeBlocks=parseBlocks(fs.readFileSync(path.join(mapsDir,'VermilionCity_Gym','scripts.inc'),'utf8'));
const parseTileWrites=(block)=>[...(surgeBlocks[block]||'').matchAll(/setmetatile\s+(\d+),\s*(\d+),\s*(METATILE_\w+),\s*([01])/g)].map(m=>({x:Number(m[1]),y:Number(m[2]),tileId:tileLabels[m[3]],collision:Number(m[4])}));
const surgeMechanism={firstSwitch:parseTileWrites('VermilionCity_Gym_EventScript_SetOneBeamOff'),open:parseTileWrites('VermilionCity_Gym_EventScript_SetBeamsOff'),closed:parseTileWrites('VermilionCity_Gym_EventScript_SetBeamsOn')};
const mansionBlocks=parseBlocks(fs.readFileSync(path.join(globalScripts,'pokemon_mansion.inc'),'utf8')), mansionMechanisms={};
for(const [index,floor] of [[0,'1F'],[1,'2F'],[2,'3F'],[3,'B1F']]){const parse=(prefix)=>[...(mansionBlocks[`PokemonMansion_EventScript_${prefix}_${floor}`]||'').matchAll(/setmetatile\s+(\d+),\s*(\d+),\s*(METATILE_\w+),\s*([01])/g)].map(m=>({x:Number(m[1]),y:Number(m[2]),tileId:tileLabels[m[3]],collision:Number(m[4])}));mansionMechanisms[`MAP_POKEMON_MANSION_${floor}`]={index,open:parse('PressSwitch'),closed:parse('ResetSwitch')};}
const mansionSwitchScripts={};for(const dir of dirs){const blocks=parseBlocks(fs.readFileSync(path.join(mapsDir,dir.name,'scripts.inc'),'utf8'));for(const [script,body] of Object.entries(blocks)){if(!/call\s+PokemonMansion_EventScript_SecretSwitch/.test(body))continue;const index=Number(body.match(/setvar VAR_0x8004,\s*(\d+)/)?.[1]);if(Number.isInteger(index))mansionSwitchScripts[script]=index;}}
const all = [], excluded=[];
for (const dir of dirs) {
  const p=path.join(mapsDir,dir.name,'map.json'); if (!fs.existsSync(p)) continue;
  const m=readJSON(p);
  if (/BATTLE_COLOSSEUM/i.test(m.id)) { excluded.push({id:m.id,name:m.name,region:m.region_map_section,reason:'battle-only map'}); continue; }
  const l=layoutById.get(m.layout); if (!l) continue;
  const lp=path.join(source,l.blockdata_filepath); if (!fs.existsSync(lp)) continue;
  const grid=u16s(lp), n=l.width*l.height;
  if (grid.length<n) continue;
  const pa=readAttr('primary',l.primary_tileset), sa=readAttr('secondary',l.secondary_tileset);
  readTilesetGraphics('primary',l.primary_tileset);readTilesetGraphics('secondary',l.secondary_tileset);
  const collision=[], behavior=[], elevation=[], tileIds=[];
  for(let i=0;i<n;i++) { const v=grid[i], id=v&0x3ff, c=(v>>10)&3, e=(v>>12)&15; tileIds.push(id); collision.push(c); elevation.push(e);
    const attrs=id<640?pa[id]:(sa[id-640]||0); behavior.push(attrs&0x1ff); }
  const bg=(m.bg_events||[]).map((e,i)=>({...e,eventId:`${m.id}:bg:${i}`,kind:e.type==='hidden_item'?'hiddenItem':e.type==='item'?'item':e.type,script:e.script||null,door:silphDoorRules[e.script]||null,mechanism:/^VermilionCity_Gym_EventScript_TrashCan\d+$/.test(e.script||'')?'surge-trash-can':Number.isInteger(mansionSwitchScripts[e.script])?'mansion-secret-switch':null,trashCanId:Number((e.script||'').match(/TrashCan(\d+)$/)?.[1])||null,switchFloor:mansionSwitchScripts[e.script],
    access:(e.type==='hidden_item'||e.type==='item')?(e.underfoot?(collision[e.y*l.width+e.x]===0?'walkable-underfoot':'blocked-underfoot'):(DIRS.some(([dx,dy])=>e.x+dx>=0&&e.y+dy>=0&&e.x+dx<l.width&&e.y+dy<l.height&&collision[(e.y+dy)*l.width+e.x+dx]===0)?'walkable-adjacent':'no-open-adjacent-tile')):undefined}));
  const hidden=bg.filter(e=>e.kind==='hiddenItem');
  const graphicsUnavailable=!(graphics['primary:'+normalizeTileset(l.primary_tileset)]&&graphics['secondary:'+normalizeTileset(l.secondary_tileset)]);
  const objects=(m.object_events||[]).map((e,i)=>({...e,eventId:`${m.id}:obj:${e.local_id||i}`,reward:scriptRewards[e.script]||null,rewardFlags:scriptRewardFlags[e.script]||[],pushable:e.graphics_id==='OBJ_EVENT_GFX_PUSHABLE_BOULDER',mechanism:Number.isInteger(mansionSwitchScripts[e.script])?'mansion-secret-switch':null,switchFloor:mansionSwitchScripts[e.script]}));
  all.push({id:m.id,name:m.name,region:m.region_map_section,type:m.map_type,floor:m.floor_number||0,layout:m.layout,width:l.width,height:l.height,primaryTileset:l.primary_tileset,secondaryTileset:l.secondary_tileset,
    tiles:tileIds,collision,elevation,behavior,graphicsUnavailable,connections:m.connections||[],warps:m.warp_events||[],coordEvents:m.coord_events||[],objectEvents:objects,bgEvents:bg,hiddenItems:hidden,
    sourceFiles:{map:`data/maps/${dir.name}/map.json`,grid:l.blockdata_filepath,tilesets:[normalizeTileset(l.primary_tileset),normalizeTileset(l.secondary_tileset)]}});
}
all.sort((a,b)=>a.name.localeCompare(b.name));
const hidden=all.flatMap(m=>m.hiddenItems.map(e=>({mapId:m.id,mapName:m.name,...e}))), access={};
for(const e of hidden)access[e.access]=(access[e.access]||0)+1;
const itemIds={};for(const e of hidden)itemIds[e.item]=(itemIds[e.item]||0)+1;
const graphicsUnavailable=all.filter(m=>m.graphicsUnavailable).map(m=>({id:m.id,name:m.name,missing:[!graphics['primary:'+normalizeTileset(m.primaryTileset)]?m.primaryTileset:null,!graphics['secondary:'+normalizeTileset(m.secondaryTileset)]?m.secondaryTileset:null].filter(Boolean)}));
const itemAuditPath=path.join(__dirname,'public/data/gen3-item-audit.json');
const known=new Set(fs.existsSync(itemAuditPath)?readJSON(itemAuditPath).items.map(i=>i.sourceId):[]);
const unlistedItems=Object.keys(itemIds).filter(id=>id&&id!=='ITEM_NONE'&&!known.has(id)).map(id=>({item:id,occurrences:itemIds[id]}));
fs.writeFileSync(out,JSON.stringify({source:'pret/pokefirered public source; map JSON and map.bin grids imported; original tileset atlases/metatiles/palettes copied',audit:{mapCount:all.length,excludedMapCount:excluded.length,hiddenItemCount:hidden.length,hiddenItemAccess:access,hiddenItemItemIds:itemIds,unlistedItems,graphicsUnavailable,scriptRewardCount:Object.keys(scriptRewards).length,silphDoorCount:Object.keys(silphDoorRules).length,excludedMaps:excluded},graphics,scriptRewards,scriptRewardFlags,silphDoorRules,surgeMechanism,mansionMechanisms,maps:all},null,0));
console.log(`Imported ${all.length} maps (${excluded.length} battle-only maps excluded); ${hidden.length} hidden-item events; output ${out}`);
