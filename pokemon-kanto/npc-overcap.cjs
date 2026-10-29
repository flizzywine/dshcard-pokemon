'use strict';
const KEYS=['hp','atk','def','spa','spd','spe'];
const profile=Object.freeze({mode:'hell-npc',iv:63,evPerStat:510,evTotal:3060});
function calculate(base,level,nature={}){
  const stats={};for(const key of KEYS){const value=Math.floor((2*base[key]+profile.iv+Math.floor(profile.evPerStat/4))*level/100);stats[key]=key==='hp'?value+level+10:Math.floor((value+5)*(nature.plus===key?1.1:nature.minus===key?.9:1));}return stats;
}
function apply(pokemon){
  const stats=calculate(pokemon.baseSpecies.baseStats,pokemon.level,pokemon.getNature());
  const oldMax=pokemon.maxhp,oldHp=pokemon.hp,saved=pokemon.set.mvuState?.hp;
  pokemon.storedStats={atk:stats.atk,def:stats.def,spa:stats.spa,spd:stats.spd,spe:stats.spe};pokemon.baseStoredStats={...pokemon.storedStats};
  pokemon.maxhp=stats.hp;pokemon.baseMaxhp=stats.hp;
  pokemon.hp=Number.isSafeInteger(saved)&&pokemon.set.mvuState?.overcap?.mode===profile.mode?Math.min(stats.hp,Math.max(0,saved)):oldHp===0?0:Math.max(1,Math.round(stats.hp*Math.min(1,oldHp/oldMax)));
  pokemon.set.npcOvercap={...profile};return stats;
}
module.exports={profile,calculate,apply};
