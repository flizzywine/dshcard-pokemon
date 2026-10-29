'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {Dex,catalog}=require('./engine.cjs');
const growth=require('./growth-mechanics.cjs');
const DATA=JSON.parse(fs.readFileSync(path.join(__dirname,'boss-profiles.json'),'utf8'));
const speciesById=new Map(catalog.species.map(item=>[item.id,item]));
const itemById=new Map([...require('./public/data/items.json'),...require('./public/data/field-items.json')].filter(item=>item.category==='held').map(item=>[item.id,item]));
const plans=Object.freeze({
  'stone-control':['sandstorm','rockslide','earthquake','toxic','protect','roar','rest'],
  'rain-current':['raindance','surf','hydropump','thunder','icebeam','recover','toxic','protect'],
  'paralysis-voltage':['thunderwave','thunderbolt','thunder','hiddenpower','brickbreak','irontail','quickattack','protect'],
  'sleep-garden':['sleeppowder','leechseed','gigadrain','solarbeam','sunnyday','synthesis','sludgebomb','protect'],
  'toxic-veil':['toxic','sludgebomb','protect','substitute','minimize','doubleteam','explosion','shadowball'],
  'calm-mind':['calmmind','psychic','recover','reflect','thunderwave','shadowball','icebeam','firepunch'],
  'sunfire':['sunnyday','fireblast','overheat','flamethrower','solarbeam','willowisp','earthquake','quickattack'],
  'sand-trap':['sandstorm','earthquake','rockslide','roar','toxic','substitute','crunch','slash'],
  'ice-trap':['icebeam','blizzard','surf','thunderbolt','psychic','reflect','sing','toxic'],
  'counter-momentum':['bulkup','brickbreak','crosschop','rockslide','earthquake','counter','rest','sleeptalk'],
  'ghost-status':['willowisp','toxic','hypnosis','dreameater','shadowball','meanlook','curse','confuseray'],
  'dragon-weather':['dragonclaw','dragondance','earthquake','surf','flamethrower','icebeam','thunderwave','aerialace'],
  'balanced-counter':['earthquake','surf','icebeam','thunderbolt','flamethrower','psychic','shadowball','brickbreak'],
  'toxic-ledger':['toxic','sludgebomb','protect','pursuit','thief','doubleteam','shadowball','explosion'],
  'dark-feint':['fakeout','taunt','sleeppowder','sludgebomb','pursuit','bite','protect','gigadrain'],
  'trap-pursuit':['taunt','meanlook','pursuit','toxic','shadowball','sludgebomb','roar','substitute'],
  'adaptive-decoy':['substitute','counter','mirrorcoat','protect','toxic','surf','earthquake','shadowball'],
  'sand-judgment':['sandstorm','earthquake','rockslide','roar','crunch','toxic','protect','substitute']
});
const TIER_DELTA=Object.freeze({original:0,enhanced:2,extreme:6});
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function bossDefinition(id){return DATA.bosses.find(boss=>boss.id===id)||null;}
function tierTeam(boss,tier){
  if(tier==='original')return boss.original.map(mon=>[...mon]);
  const base=boss.original.map(mon=>[...mon]),reserve=boss.reserve.map(mon=>[...mon]);
  const count=tier==='enhanced'?(boss.id==='brock'?3:Math.min(6,Math.max(4,base.length+1))):6;
  return [...base,...reserve].slice(0,count);
}
function resolveLevel(raw,tier,partyLevel,badgeIndex=0){
  let level=raw+TIER_DELTA[tier];
  if(Number.isFinite(partyLevel))level=Math.max(level,Math.round(partyLevel+({original:0,enhanced:2,extreme:5}[tier])));
  return clamp(level,1,100);
}
function chooseMoves(id,level,style,monIndex){
  const species=speciesById.get(id);if(!species)throw new Error(`图鉴${id}不在关都151内。`);
  const legal=species.moves.filter(move=>catalog.moves[move]?.generation<=3&&growth.canKnowMove(id,move));
  const preferences=plans[style]||[],shift=preferences.length?(monIndex*2)%preferences.length:0;
  const ordered=[...preferences.slice(shift),...preferences.slice(0,shift),...growth.levelMoves(id).filter(entry=>entry.level<=level).map(entry=>entry.move)];
  const picked=[];for(const move of ordered)if(legal.includes(move)&&!picked.includes(move)&&catalog.moves[move]?.pp>0){picked.push(move);if(picked.length===4)break;}
  if(picked.length<4){
    const abilityId=species.abilities[0],ability=String(abilityId||'');
    const candidates=legal.filter(move=>!picked.includes(move)&&catalog.moves[move]?.pp>0).map(move=>{const row=catalog.moves[move],stab=species.types.includes(row.type)?1.5:1,power=row.basePower||0;return {move,score:power*stab+(row.category==='status'?style==='toxic-veil'||style==='sleep-garden'?52:8:0)};}).sort((a,b)=>b.score-a.score||a.move.localeCompare(b.move));
    for(const row of candidates){picked.push(row.move);if(picked.length===4)break;}
    void ability;void monIndex;
  }
  if(!picked.length)throw new Error(`${species.name}没有可用的第三世代招式。`);return picked;
}
function statsFor(id,role){const species=speciesById.get(id),stats=species.stats;const physical=stats.atk>=stats.spa;const wall=/control|trap|veil|ledger|status|ice/.test(role);if(wall)return {hp:252,def:252,spd:6,atk:0,spa:0,spe:0};return physical?{hp:6,atk:252,def:0,spa:0,spd:0,spe:252}:{hp:6,atk:0,def:0,spa:252,spd:0,spe:252};}
function natureFor(id,role){const s=speciesById.get(id);if(/control|trap|veil|ledger|status|ice/.test(role))return s.stats.def>=s.stats.spd?'Bold':'Calm';return s.stats.atk>=s.stats.spa?(s.stats.spe>=70?'Jolly':'Adamant'):'Timid';}
function build(id,tier='original',options={}){
  if(typeof tier==='object'){options=tier;tier=options.tier||'original';}
  const boss=bossDefinition(id);if(!boss)throw new Error('没有这个首领配置。');if(!Object.hasOwn(TIER_DELTA,tier))throw new Error('首领难度须为 original、enhanced 或 extreme。');
  const sourceTeam=tierTeam(boss,tier);
  if(boss.id==='champion'&&Number.isInteger(options.starterId)&&sourceTeam.length===6){sourceTeam[5][0]=options.starterId<=3?6:options.starterId<=6?9:3;}
  const usedItems=new Set(options.usedItems||[]);
  const roster=sourceTeam.map(([speciesId,baseLevel],index)=>{
    const level=resolveLevel(baseLevel,tier,options.partyLevel,boss.badgeIndex),species=speciesById.get(speciesId);if(!species)throw new Error(`${boss.id}包含不支持的宝可梦${speciesId}。`);
    const preferredItems=['oranberry','sitrusberry','leftovers','shellbell','choiceband','focusband','quickclaw','brightpowder'];
    const item=preferredItems.find(key=>itemById.has(key)&&!usedItems.has(key))||null;if(item)usedItems.add(item);
    const moves=chooseMoves(speciesId,level,boss.style,index);
    return {uid:`boss-${boss.id}-${tier}-${index+1}`,speciesId,name:species.name,level,iv:{hp:31,atk:31,def:31,spa:31,spd:31,spe:31},ev:statsFor(speciesId,boss.style),nature:natureFor(speciesId,boss.style),ability:species.abilities[0],heldItem:item,moves};
  });
  const inventory={...boss.items};if(tier==='enhanced')for(const key of Object.keys(inventory))inventory[key]=Math.min(2,inventory[key]+1);if(tier==='extreme')for(const key of Object.keys(inventory))inventory[key]=Math.min(3,inventory[key]+2);
  return {id:boss.id,name:boss.name,role:boss.role,style:boss.style,tier,requiredBadges:boss.badgeIndex,team:roster,tactic:boss.tactic,itemInventory:inventory,itemPolicy:{...DATA.itemPolicy,maxUses:tier==='original'?1:tier==='enhanced'?2:3,allowed:Object.keys(inventory).filter(item=>inventory[item]>0)},playerLevel:Number.isFinite(options.partyLevel)?options.partyLevel:null,rewardCosmetic:`kfx-${String((BOSS_IDS.indexOf(id)*7)%100+21).padStart(3,'0')}`};
}
const BOSS_IDS=DATA.bosses.map(boss=>boss.id);
function select(id,options={}){
  if(typeof options==='string')options={tier:options};const boss=bossDefinition(id);if(!boss)throw new Error('没有这个首领配置。');
  let tier=options.tier||'original';if(tier==='auto'){const level=Number(options.partyLevel||0);tier=level>=60?'extreme':level>=30?'enhanced':'original';}
  const profile=build(id,tier,options);return {...profile,availableTiers:Object.keys(TIER_DELTA),label:`${boss.name} · ${tier}`,portraitKey:boss.id};
}
function validate(){
  for(const boss of DATA.bosses){for(const tier of Object.keys(TIER_DELTA)){const profile=build(boss.id,tier);if(profile.team.length>6||profile.team.some(mon=>mon.level<1||mon.level>100))throw new Error(`首领队伍无效：${boss.id}/${tier}`);for(const mon of profile.team){if(mon.speciesId<1||mon.speciesId>151||!speciesById.has(mon.speciesId))throw new Error('首领使用了关都图鉴外宝可梦。');if(mon.moves.length>4||mon.moves.some(move=>!growth.canKnowMove(mon.speciesId,move)||!catalog.moves[move]||catalog.moves[move].generation>3))throw new Error(`首领招式不属于FRLG可用的第三世代招式：${boss.id}/${mon.speciesId}`);if(!speciesById.get(mon.speciesId)?.abilities.includes(mon.ability))throw new Error(`首领特性不合法：${boss.id}/${mon.speciesId}`);if(mon.heldItem&&!itemById.has(mon.heldItem))throw new Error(`首领携带道具不合法：${boss.id}/${mon.heldItem}`);if(Object.values(mon.iv).some(value=>value!==31)||Object.values(mon.ev).reduce((sum,value)=>sum+value,0)!==510)throw new Error(`首领个体值/努力值无效：${boss.id}/${mon.speciesId}`);}}}
  return true;
}
module.exports={select,build,validate,definitions:()=>DATA.bosses.map(boss=>({...boss,tiers:Object.keys(TIER_DELTA)})),tiers:Object.keys(TIER_DELTA)};
