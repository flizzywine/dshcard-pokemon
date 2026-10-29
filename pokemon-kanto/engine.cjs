'use strict';
// Local single-player adapter. Turn resolution stays in Showdown's Gen 3 simulator.
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {Battle} = require('./vendor/showdown/sim/battle.js');
const {Dex: BaseDex, toID} = require('./vendor/showdown/sim/dex.js');
const {resolveCapture, resolveRun} = require('./capture-escape-rules.cjs');
const Dex = BaseDex.mod('gen3');
const npcOvercap=require('./npc-overcap.cjs');
const {DIFFICULTIES, getEnemyChoiceCandidates, getEnemyDecisionSummary, chooseEnemyChoice} = require('./opponent-ai.cjs');
const localePath = path.join(__dirname, 'public/data/locales.json');
const locale = fs.existsSync(localePath) ? JSON.parse(fs.readFileSync(localePath, 'utf8').replace(/^\uFEFF/, '')) : {};
const itemPath = path.join(__dirname, 'public/data/items.json');
const fieldItemPath = path.join(__dirname, 'public/data/field-items.json');
const baseItems = fs.existsSync(itemPath) ? JSON.parse(fs.readFileSync(itemPath, 'utf8').replace(/^\uFEFF/, '')) : [];
const fieldItems = fs.existsSync(fieldItemPath) ? JSON.parse(fs.readFileSync(fieldItemPath, 'utf8').replace(/^\uFEFF/, '')) : [];
const specialBalls=JSON.parse(fs.readFileSync(path.join(__dirname,'public/data/special-balls.json'),'utf8'));
const items = [...new Map([...baseItems, ...fieldItems,...specialBalls].map(item => [item.id, item])).values()];
const itemById = Object.fromEntries(items.map(item => [item.id, item]));
// In FRLG ITEM3_STATUS_ALL includes confusion as well as non-volatile status.
const confusionCureItems = new Set(['fullheal', 'fullrestore', 'healpowder', 'lavacookie']);
const canCureConfusion = (target, itemId) => confusionCureItems.has(itemId) && Boolean(target.volatiles?.confusion);
const presets = {
  3: ['gigadrain', 'sludgebomb', 'sleeppowder', 'leechseed'],
  6: ['flamethrower', 'wingattack', 'dragonclaw', 'slash'],
  9: ['surf', 'icebeam', 'bite', 'protect'],
  25: ['thunderbolt', 'quickattack', 'thunderwave', 'irontail'],
  65: ['psychic', 'calmmind', 'recover', 'thunderpunch'],
  94: ['shadowball', 'thunderbolt', 'hypnosis', 'dreameater'],
  130: ['surf', 'earthquake', 'dragondance', 'return'],
  143: ['bodyslam', 'shadowball', 'rest', 'sleeptalk'],
  149: ['dragonclaw', 'wingattack', 'thunderbolt', 'earthquake'],
  150: ['psychic', 'icebeam', 'recover', 'calmmind'],
};

function learnset(species) {
  const moves = new Set();
  for (let s = species; s?.exists; s = s.prevo ? Dex.species.get(s.prevo) : null) {
    const learn = Dex.species.getLearnsetData(s.id).learnset || {};
    for (const [id, sources] of Object.entries(learn)) {
      // Gen 1/2 cannot transfer into Gen 3; accept only an actual Gen 3 source.
      if (sources.some(source => source.startsWith('3')) && Dex.moves.get(id).gen <= 3) moves.add(id);
    }
  }
  return [...moves];
}
function defaults(species, legal) {
  const chosen = (presets[species.num] || []).filter(id => legal.includes(id));
  const score = id => {
    const m = Dex.moves.get(id);
    return (m.basePower || (m.damage ? 65 : 0)) * (species.types.includes(m.type) ? 1.5 : 1) *
      (m.accuracy === true ? 1 : m.accuracy / 100) - (m.recharge ? 30 : 0) - (m.selfdestruct ? 200 : 0);
  };
  const ordered = legal.slice().sort((a, b) => score(b) - score(a));
  for (const id of ordered) {
    if (chosen.length >= 3) break;
    if (chosen.includes(id)) continue;
    const m = Dex.moves.get(id);
    if (!chosen.some(other => Dex.moves.get(other).type === m.type && Dex.moves.get(other).category === m.category)) chosen.push(id);
  }
  for (const id of ['thunderwave', 'sleeppowder', 'recover', 'synthesis', 'swordsdance', 'protect', ...ordered]) {
    if (chosen.length === 4) break;
    if (legal.includes(id) && !chosen.includes(id)) chosen.push(id);
  }
  return chosen;
}

const species = Dex.species.all().filter(s => s.num >= 1 && s.num <= 151 && !s.forme).sort((a, b) => a.num - b.num).map(s => {
  const moves = learnset(s);
  return {id: s.num, key: s.id, english: s.name, name: locale.species?.[s.num] || s.name,
    types: s.types, stats: s.baseStats, abilities: Object.values(s.abilities), moves,
    defaultMoves: defaults(s, moves)};
});
const byId = new Map(species.map(s => [s.id, s]));
// Keep Kanto learnsets scoped to the original dex while exposing the entire
// numbered Gen III move catalogue for called moves such as Metronome and Mimic.
const gen3MoveIds = new Set(Dex.moves.all()
  .filter(move => move.exists && move.gen <= 3 && move.num >= 1 && move.num <= 354)
  .map(move => move.id));
const allMoves = new Set([...species.flatMap(s => s.moves), ...gen3MoveIds, 'struggle']);
const moves = Object.fromEntries([...allMoves].map(id => {
  const m = Dex.moves.get(id);
  return [id, {id, english: m.name, name: locale.moves?.[id] || m.name,
    type: m.type, power: m.basePower, accuracy: m.accuracy, pp: m.pp,
    category: m.category, description: locale.descriptions?.[id] || m.shortDesc,
    priority: m.priority, number: m.num, generation: m.gen, target: m.target,
    multihit: m.multihit ?? null, flags: {...m.flags}, contact: Boolean(m.flags?.contact)}];
}));
const catalog = {species, moves, items, types: locale.types || {}, abilityNames: locale.abilities || {}, natureNames: locale.natures || {},
  generation: 3, version: '0.1.0', rules: '第三世代单打；队伍等级、个体值、努力值、性格、特性、招式与PP均以当前MVU为准。'};

// First Kanto gym teams. All Pokémon share the selected challenge level.
const gyms = [
  {name: '小刚', ids: [74, 95]}, {name: '小霞', ids: [120, 121]},
  {name: '马志士', ids: [100, 25, 26]}, {name: '莉佳', ids: [71, 114, 45]},
  {name: '阿桔', ids: [109, 89, 109, 110]}, {name: '娜姿', ids: [64, 122, 49, 65]},
  {name: '夏伯', ids: [58, 77, 78, 59]}, {name: '坂木', ids: [111, 51, 31, 34, 112]},
];
catalog.gyms = gyms;

function normalizeTeam(input, level, {minimum = 1} = {}) {
  if (!Array.isArray(input) || input.length < minimum || input.length > 6) throw Error(`队伍必须有 ${minimum}—6 只宝可梦。`);
  return input.map(entry => {
    const s = byId.get(entry?.id);
    if (!s) throw Error('仅支持关都图鉴 001—151。');
    const selected = entry.moves === undefined ? s.defaultMoves : entry.moves;
    if (!Array.isArray(selected) || selected.length < 1 || selected.length > 4 || new Set(selected).size !== selected.length) throw Error('每只宝可梦需要 1—4 个不同的招式。');
    if (selected.some(id => !s.moves.includes(id))) throw Error(`${s.name}不能在第三世代学会所选招式。`);
    const monLevel = entry.level ?? level;
    if (!Number.isInteger(monLevel) || monLevel < 1 || monLevel > 100) throw Error('精灵等级须为1—100。');
    const ivs = entry.ivs || {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31};
    const evs = entry.evs || {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
    for (const key of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) {
      if (!Number.isInteger(ivs[key]) || ivs[key] < 0 || ivs[key] > 31) throw Error('个体值须为0—31整数。');
      if (!Number.isInteger(evs[key]) || evs[key] < 0 || evs[key] > 255) throw Error('单项努力值须为0—255整数。');
    }
    if (Object.values(evs).reduce((a, b) => a + b, 0) > 510) throw Error('努力值总和不能超过510。');
    if (entry.ability && !s.abilities.includes(entry.ability)) throw Error('第三世代不支持该特性。');
    if (entry.nature && !Dex.natures.get(entry.nature).exists) throw Error('无效性格。');
    const heldItem = toID(entry.item);
    // The bundled Gen 3 item dex omits these FRLG items; Lucky Egg and Amulet
    // Coin are handled by this adapter, while wild loot is retained as an ID.
    const adapterItems = new Set(['smokeball','luckyegg','amuletcoin','nugget','tinymushroom','bigmushroom','soothebell','everstone']);
    if (heldItem && !adapterItems.has(heldItem) && (!Dex.items.get(heldItem).exists || Dex.items.get(heldItem).gen > 3)) throw Error('携带道具不属于第三世代。');
    const bondTrust=entry.bondTrust===undefined?0:entry.bondTrust;
    if(!Number.isInteger(bondTrust)||bondTrust<0||bondTrust>100)throw Error('羁绊信赖须为0—100整数。');
    if(entry.bondBattleEffects!==undefined&&typeof entry.bondBattleEffects!=='boolean')throw Error('羁绊战斗效果标记须为布尔值。');
    return {species: s.english, name: entry.name || s.name, moves: selected,
      ability: entry.ability || s.abilities[0], level: monLevel,
      nature: entry.nature || 'Serious', happiness: entry.happiness ?? 255, evs, ivs,
      item:heldItem,shiny:entry.shiny===true,
      bondTrust,bondBattleEffects:entry.bondBattleEffects===true,
      slotId: entry.uid || '', mvuState: entry.state || null};
  });
}
function visibleEvents(log) {
  const events = [];
  for (let i = 0; i < log.length; i++) {
    if (log[i].startsWith('|split|')) { if (log[i + 1]) events.push(log[i + 1]); i += 2; continue; }
    if (log[i] !== '|' && !log[i].startsWith('|t:|') && !log[i].startsWith('|debug|')) events.push(log[i]);
  }
  return events;
}
function actor(p) {
  return {id: p.baseSpecies.num, name: p.name, shiny:!!p.set.shiny, hp: p.hp, maxhp: p.maxhp,
    status: p.status, heldItem: p.item || '', active: p.isActive, fainted: p.fainted, level: p.level,
    types: p.getTypes(), boosts: {...p.boosts}, abilityId:p.ability, ability: locale.abilities?.[p.ability] || p.getAbility().name,
    volatiles:Object.keys(p.volatiles||{}),
    appearanceId: p.species.num, uid: p.set.slotId || '', bondTrust:p.set.bondTrust||0,bondBattleEffects:p.set.bondBattleEffects===true,
    stats: {...p.storedStats},...(p.set.npcOvercap?{overcap:{...p.set.npcOvercap}}:{}),moves:p.baseMoveSlots.map(move=>({id:move.id,pp:move.pp,maxpp:move.maxpp}))};
}
function markParticipation(record) {
  record.participationByFoe ||= {};
  record.livingByFoeAtDefeat ||= {};
  record.heldItemsByFoeAtDefeat ||= {};
  const battle = record.battle;
  // The Gen III switch-in effect sets a battle-wide prize multiplier. Once a
  // living holder has entered, it remains activated through battle end.
  if (battle.p1.active.some(player => player?.hp > 0 && player.item === 'amuletcoin')) record.moneyMultiplier = 2;
  for (const foe of battle.p2.active) {
    const foeUid = foe?.set?.slotId;
    if (!foeUid) continue;
    const participants = record.participationByFoe[foeUid] ||= [];
    for (const player of battle.p1.active) {
      const playerUid = player?.set?.slotId;
      if (player?.hp > 0 && playerUid && !participants.includes(playerUid)) participants.push(playerUid);
    }
  }
  for (const foe of battle.p2.pokemon) {
    const foeUid = foe?.set?.slotId;
    if (!foeUid || (!(foe.fainted || foe.hp <= 0))) continue;
    if (!Object.hasOwn(record.livingByFoeAtDefeat, foeUid)) {
      record.livingByFoeAtDefeat[foeUid] = battle.p1.pokemon
        .filter(player => player.hp > 0 && player.set?.slotId)
        .map(player => player.set.slotId);
    }
    if (!Object.hasOwn(record.heldItemsByFoeAtDefeat, foeUid)) {
      record.heldItemsByFoeAtDefeat[foeUid] = Object.fromEntries(battle.p1.pokemon
        .filter(player => player.set?.slotId)
        .map(player => [player.set.slotId, player.item || '']));
    }
  }
}
function plannedTrainerItem(record){
  if(record){record.opponentBag ||= {};record.trainerItemUses ||= 0;}
  if(!record||record.mode==='wild'||record.trainerItemUses>=(record.itemPolicy?.maxUses??Number.MAX_SAFE_INTEGER))return null;
  const side=record.battle.p2,request=side.activeRequest;if(!request||request.wait||request.forceSwitch&&(Array.isArray(request.forceSwitch)?request.forceSwitch.some(Boolean):true))return null;
  const allowed=new Set(record.itemPolicy?.allowed||Object.keys(record.opponentBag||{}));
  const candidates=side.active.map((mon,actorSlot)=>({mon,actorSlot})).filter(x=>x.mon&&x.mon.hp>0&&!x.mon.fainted);
  if(!candidates.length)return null;
  const choose=(id,target,reason)=>allowed.has(id)&&(record.opponentBag[id]||0)>0?{itemId:id,itemName:itemById[id].name,targetSlot:side.pokemon.indexOf(target)+1,targetUid:target.set?.slotId||'',actorSlot:candidates[0].actorSlot,reason,priority:6}:null;
  for(const {mon} of candidates){
    const damaged=mon.maxhp-mon.hp,status=mon.status,confused=Boolean(mon.volatiles?.confusion);
    if((status||confused)&&damaged>0){const full=choose('fullrestore',mon,'heal-and-cure');if(full)return full;}
    if(status||confused){const cure=choose('fullheal',mon,'cure-status');if(cure)return cure;const full=choose('fullrestore',mon,'cure-status');if(full)return full;}
    if(damaged>0){for(const id of ['fullrestore','maxpotion','hyperpotion','superpotion','potion']){const effect=itemById[id]?.battle;const threshold=['fullrestore','maxpotion'].includes(id)?Math.ceil(mon.maxhp*.5):Math.min(effect?.heal||0,Math.max(1,Math.floor(mon.maxhp*.16)));if(effect?.heal&&record.opponentBag[id]>0&&allowed.has(id)&&damaged>=threshold)return choose(id,mon,'heal');}}
  }
  for(const {mon} of candidates){
    const offense=mon.storedStats.atk>=mon.storedStats.spa?'atk':'spa';
    for(const [id,stat] of [['xattack','atk'],['xspecial','spa'],['xspeed','spe'],['xdefend','def']])if((!record.itemPolicy?.boostStats||record.itemPolicy.boostStats.includes(stat))&&stat===offense&&mon.boosts[stat]<2){const plan=choose(id,mon,'boost');if(plan)return plan;}
  }
  return null;
}
function performTrainerItem(record,plan){
  record.opponentBag ||= {};record.trainerItemUses ||= 0;
  const {battle}=record,target=battle.p2.pokemon[plan.targetSlot-1],item=itemById[plan.itemId],effect=item?.battle;
  if(!target||!effect||!record.opponentBag[plan.itemId])return false;
  if((effect.heal||effect.status)&&!(effect.heal&&target.hp<target.maxhp)&&!effect.status?.includes(target.status)&&!canCureConfusion(target,plan.itemId))return false;
  if(effect.boost&&Object.entries(effect.boost).every(([stat,amount])=>target.boosts[stat]>=6&&amount>0))return false;
  const oldStatus=target.status;
  if(effect.status?.includes(oldStatus))target.cureStatus();
  if(canCureConfusion(target,plan.itemId))target.removeVolatile('confusion');
  if(effect.heal&&target.hp<target.maxhp){const amount=target.heal(effect.heal);battle.add('-heal',target,target.getHealth,`[from] item: ${item.name}`);battle.add('message',`${battle.p2.name}使用了${item.name}，为${target.name}恢复了${amount}点HP。`);}
  else if(effect.status){battle.add('message',`${battle.p2.name}使用了${item.name}，治愈了${target.name}的异常状态。`);}
  else if(effect.boost){if(!battle.boost(effect.boost,target,target,item))return false;battle.add('message',`${battle.p2.name}使用了${item.name}，提升了${target.name}的能力。`);}
  else return false;
  record.opponentBag[plan.itemId]--;record.trainerItemUses++;return true;
}
function preparePlayerBattleItem(record,command,actorSlot){
  const match=/^item ([a-z]+)(?: (\d+))?(?: ([1-4]))?$/.exec(command);
  if(!match)throw Error('双打药品指令格式无效。');
  const [,itemId,targetSlotText,moveSlotText]=match,item=itemById[itemId],effect=item?.battle;
  if(!item||!effect||effect.capture||effect.escape)throw Error('双打行动只能使用非捕捉、非逃跑的战斗药品。');
  if(!record.bag[itemId])throw Error(`${item.name}已经用完。`);
  if(moveSlotText&&(effect.pp===undefined||effect.allMoves))throw Error('该物品不需要指定招式位置。');
  const battle=record.battle,active=battle.p1.active[actorSlot];
  const targetSlot=targetSlotText?Number(targetSlotText):battle.p1.pokemon.indexOf(active)+1;
  const target=battle.p1.pokemon[targetSlot-1];
  if(!target)throw Error('没有这个目标宝可梦。');
  if(effect.revive){
    if(!target.fainted||target.hp>0)throw Error('活力碎片只能用于倒下的宝可梦。');
  }else{
    if(effect.pp===undefined&&(target.fainted||target.hp<=0))throw Error('该宝可梦已经倒下。');
    if((effect.heal||effect.status)&&!(effect.heal&&target.hp<target.maxhp)&&!effect.status?.includes(target.status)&&!canCureConfusion(target,itemId))throw Error('该宝可梦HP已满或没有对应的异常状态。');
  }
  let ppIndexes=[];
  if(effect.pp!==undefined){
    const slots=target.baseMoveSlots;
    if(!Array.isArray(slots)||!slots.length)throw Error('该宝可梦没有可恢复的招式。');
    if(effect.allMoves)ppIndexes=slots.map((_,index)=>index);
    else{
      if(!moveSlotText)throw Error('请指定要恢复PP的招式位置。');
      const index=Number(moveSlotText)-1;if(!slots[index])throw Error('没有这个招式位置。');ppIndexes=[index];
    }
    if(ppIndexes.every(index=>slots[index].pp>=slots[index].maxpp))throw Error('所选招式PP已满。');
  }
  if((effect.boost||effect.volatile||effect.sideCondition)&&target!==active)throw Error('这种战斗道具只能用于当前行动的宝可梦。');
  if(effect.boost&&Object.entries(effect.boost).every(([stat,amount])=>active.boosts[stat]>=6&&amount>0))throw Error('当前能力等级已达到上限，物品没有效果。');
  if(effect.volatile&&active.volatiles[effect.volatile])throw Error('当前状态已存在，物品没有效果。');
  if(effect.sideCondition&&battle.p1.sideConditions[effect.sideCondition])throw Error('当前保护效果仍在持续，物品没有效果。');
  if(effect.cureVolatile&&!target.volatiles[effect.cureVolatile])throw Error('该宝可梦没有这种战斗状态，物品没有效果。');
  return {item,itemId,effect,target,targetSlot,ppIndexes,actorSlot};
}
function applyPlayerBattleItem(record,plan){
  const {battle}=record,{item,itemId,effect,target,ppIndexes}=plan;
  if(!item.reusable)record.bag[itemId]--;
  battle.add('message',`训练家对${target.name}使用了${item.name}。`);
  if(effect.revive){
    battle.p1.pokemonLeft++;target.fainted=false;target.faintQueued=false;target.subFainted=false;target.status='';target.hp=Math.max(1,Math.floor(target.maxhp*effect.revive));
    battle.add('-heal',target,target.getHealth,`[from] item: ${item.name}`);battle.makeRequest('move');
  }else if(effect.heal){
    const amount=target.heal(effect.heal);battle.add('-heal',target,target.getHealth,`[from] item: ${item.name}`);battle.add('message',`恢复了${amount}点HP！`);
  }else if(effect.status){
    target.cureStatus();
  }else if(effect.pp!==undefined){
    for(const index of ppIndexes){const move=target.baseMoveSlots[index];move.pp=effect.pp==='all'?move.maxpp:Math.min(move.maxpp,move.pp+effect.pp);if(!target.transformed&&target.moveSlots[index]?.id===move.id)target.moveSlots[index].pp=move.pp;}
    battle.add('message',`${item.name}已恢复招式PP。`);
  }else if(effect.boost){if(!battle.boost(effect.boost,target,target,item))throw Error('该能力增强道具当前没有效果。');}
  else if(effect.volatile){if(!target.addVolatile(effect.volatile,target,item))throw Error('该要害状态当前无法生效。');}
  else if(effect.sideCondition){if(!battle.p1.addSideCondition(effect.sideCondition,battle.p1.active[plan.actorSlot],item))throw Error('该队伍保护当前无法生效。');}
  else if(effect.cureVolatile){target.removeVolatile(effect.cureVolatile);const name=effect.cureVolatile==='confusion'?'Confusion':'Attract';battle.add('-end',target,name,`[from] item: ${item.name}`);}
  // Full Restore combines HP and status effects, so it reaches the healing
  // branch above even when its target also needs a status cure.
  if(effect.status?.includes(target.status))target.cureStatus();
  if(canCureConfusion(target,itemId))target.removeVolatile('confusion');
  if(effect.friendship){const value=target.happiness;target.happiness=Math.max(0,Math.min(255,value+effect.friendship[value<100?0:value<200?1:2]));}
}
function queueDoublePlayerChoice(side,commands,itemSlot){
  side.clearChoice();
  for(let index=0;index<commands.length;index++){
    if(index===itemSlot){side.choice.actions.push({choice:'pass',pokemon:side.active[index]});continue;}
    const command=commands[index];let match=/^move ([1-4])(?: ([+-][1-3]))?$/.exec(command);
    if(match){if(!side.chooseMove(match[1],match[2]?Number(match[2]):0))return false;continue;}
    match=/^switch ([1-6])$/.exec(command);
    if(match){if(!side.chooseSwitch(match[1]))return false;continue;}
    if(command==='pass'&&side.active[index]?.fainted){side.choice.actions.push({choice:'pass',pokemon:side.active[index]});continue;}
    return false;
  }
  return side.isChoiceDone();
}
function commitEnemyTurnWithTrainerItem(battle, choice, actorSlot){
  const side=battle.p2;
  side.clearChoice();
  const commands=String(choice||'').split(',').map(part=>part.trim());
  if(commands.length!==side.active.length)return false;
  for(let index=0;index<commands.length;index++){
    if(index===actorSlot){
      // NPC inventory actions occupy one active Pokémon's turn, like cartridge item priority.
      // Showdown only permits pass for fainted/commanding actors, so queue a no-op action here.
      side.choice.actions.push({choice:'pass',pokemon:side.active[index]});
      continue;
    }
    const command=commands[index];
    let match=/^move ([1-4])(?: ([+-][1-3]))?$/.exec(command);
    if(match){if(!side.chooseMove(match[1],match[2]?Number(match[2]):0))return false;continue;}
    match=/^switch ([1-6])$/.exec(command);
    if(match){if(!side.chooseSwitch(match[1]))return false;continue;}
    if(command==='pass'&&side.active[index]?.fainted){side.choice.actions.push({choice:'pass',pokemon:side.active[index]});continue;}
    return false;
  }
  if(!side.isChoiceDone())return false;
  battle.commitChoices();
  return true;
}
class KantoGame {
  constructor() { this.battles = new Map(); }
  start(input = {}) {
    const level = input.level ?? 50;
    if (!Number.isInteger(level) || level < 10 || level > 100) throw Error('等级范围为 10—100。');
    const requestedMode = input.mode || 'practice';
    const mode=requestedMode==='doubles'?'practice':requestedMode;
    const doubleBattle=input.doubleBattle===true||requestedMode==='doubles';
    if (!['practice', 'wild', 'gym'].includes(mode)) throw Error('未知对战模式。');
    if(doubleBattle&&mode==='wild')throw Error('野生遭遇保持单打，不能开启双打。');
    const difficulty = input.difficulty ?? 'normal';
    if (!DIFFICULTIES.includes(difficulty)) throw Error('未知对手决策难度。');
    const team = normalizeTeam(input.team, level,{minimum:doubleBattle?2:1});
    const gym = input.gym ?? 0;
    if (mode === 'gym' && (!Number.isInteger(gym) || gym < 0 || gym > 7)) throw Error('请选择关都的八座道馆之一。');
    const seed = input.seed;
    if (seed !== undefined && (!Array.isArray(seed) || seed.length !== 4 || seed.some(n => !Number.isInteger(n) || n < 0 || n > 65535))) throw Error('战斗种子必须是四个 0—65535 整数。');
    const b = new Battle({formatid: doubleBattle?'gen3doublescustomgame':'gen3customgame', ...(seed ? {seed} : {})});
    let opponent;
    try {
      const ids = mode === 'gym' ? gyms[gym].ids : mode === 'wild' ? [b.random(1, 152)] :
        Array.from({length: team.length}, () => b.random(1, 152));
      opponent = normalizeTeam(input.opponent || ids.map(id => ({id})), level,{minimum:doubleBattle?2:1});
      if (mode === 'wild' && opponent.length !== 1) throw Error('野生战斗只能有一只对手。');
      b.setPlayer('p1', {name: '训练家', team});
      b.setPlayer('p2', {name: mode === 'gym' ? gyms[gym].name : mode === 'wild' ? '野生宝可梦' : '对手', team: opponent});
      for (const side of b.sides) for (const p of side.pokemon) {
        // Cartridge defaults use zero PP Ups. Persisted MVU PP is authoritative.
        for (let i = 0; i < p.moveSlots.length; i++) {
          const slot = p.moveSlots[i], saved = p.set.mvuState?.moves?.find(m => m.id === slot.id);
          const maxpp = saved?.maxpp ?? Dex.moves.get(slot.id).pp;
          slot.maxpp = maxpp; slot.pp = saved?.pp ?? maxpp;
          p.baseMoveSlots[i].maxpp = maxpp; p.baseMoveSlots[i].pp = slot.pp;
          p.ppUps[i] = saved?.ppUps || 0;
        }
        if (p.set.mvuState) {
          const saved = p.set.mvuState;
          p.hp = saved.hp;
          if (!p.hp) { p.fainted = true; side.pokemonLeft--; }
          if (saved.status && p.hp) { p.setStatus(saved.status); if (saved.statusState) Object.assign(p.statusState, saved.statusState); }
        }
      }
      if(difficulty==='hell'&&mode!=='wild')for(const pokemon of b.p2.pokemon)npcOvercap.apply(pokemon);
      b.makeRequest('move');
    } catch (error) { b.destroy(); throw error; }
    if (input.bag && (Object.keys(input.bag).some(id => !itemById[id]) || Object.values(input.bag).some(count => !Number.isInteger(count) || count < 0 || count > 999))) {
      b.destroy(); throw Error('背包物品数量无效。');
    }
    const trainerItems=input.trainerItems||input.opponentBag||input.itemInventory||{};
    if(!trainerItems||typeof trainerItems!=='object'||Array.isArray(trainerItems)||Object.keys(trainerItems).some(id=>!itemById[id]||!itemById[id].battle||itemById[id].battle.capture||itemById[id].battle.escape)||Object.values(trainerItems).some(count=>!Number.isInteger(count)||count<0||count>99)){b.destroy();throw Error('训练家战斗物品库存无效。');}
    const itemPolicy=input.itemPolicy&&typeof input.itemPolicy==='object'?structuredClone(input.itemPolicy):null;
    if(itemPolicy?.maxUses!==undefined&&(!Number.isInteger(itemPolicy.maxUses)||itemPolicy.maxUses<0||itemPolicy.maxUses>99)){b.destroy();throw Error('训练家道具使用上限无效。');}
    const bag = Object.fromEntries(items.map(item => [item.id, Number.isInteger(input.bag?.[item.id]) ? input.bag[item.id] :
      item.id === 'potion' ? 3 : item.id === 'pokeball' ? 5 : 0]));
    const bondBattleEffects=input.bondBattleEffects===true;
    for(const pokemon of b.p1.pokemon){pokemon.set.bondBattleEffects=bondBattleEffects;}
    for(const pokemon of b.p2.pokemon){pokemon.set.bondBattleEffects=false;pokemon.set.bondTrust=0;}
    const record = {id: randomUUID(), battle: b, mode, gym, doubleBattle, bag, opponentBag:{...trainerItems},itemPolicy,trainerItemUses:0, difficulty, bondBattleEffects, aiFallbackCount: 0, lastOpponentDecision: null, cursor: 0, attempts: 0, participationByFoe: {}, livingByFoeAtDefeat: {}, heldItemsByFoeAtDefeat:{}};
    markParticipation(record);
    // Bound memory even after repeated setup changes.
    if (this.battles.size >= 16) {
      const oldest = this.battles.keys().next().value;
      this.battles.get(oldest).battle.destroy(); this.battles.delete(oldest);
    }
    this.battles.set(record.id, record);
    return this.snapshot(record);
  }
  enemyChoiceCandidates(battleId, {playerInput = ''} = {}) {
    const record = this.battles.get(battleId);
    if (!record) throw Error('对战已过期，请重新开始。');
    const options = getEnemyChoiceCandidates(record.battle);
    return {difficulty: record.difficulty, options,
      plannedTrainerItem:plannedTrainerItem(record),
      summary: getEnemyDecisionSummary(record.battle, {difficulty: record.difficulty, playerInput, candidates: options})};
  }
  snapshot(record) {
    const b = record.battle, r = b.p1.activeRequest || {};
    const events = visibleEvents(b.log.slice(record.cursor)); record.cursor = b.log.length;
    const activeCommands=b.p1.active.map((pokemon,actorSlot)=>{
      const entry=r.active?.[actorSlot]||{},force=Array.isArray(r.forceSwitch)?!!r.forceSwitch[actorSlot]:!!r.forceSwitch;
      const moveRows=(entry?.moves||[]).map((move,slot)=>{
        const targets=[];
        if(b.activePerHalf>1&&b.actions.targetTypeChoices(move.target))for(const target of [...b.p1.active,...b.p2.active])if(target&&!target.fainted){const loc=pokemon.getLocOf(target);if(b.validTargetLoc(loc,pokemon,move.target))targets.push({loc,side:target.side===b.p1?'ally':'foe',uid:target.set?.slotId||'',name:target.name});}
        return {...moves[toID(move.id||move.move)],...move,slot:slot+1,targets};
      });
      return {actorSlot,uid:pokemon?.set?.slotId||'',name:pokemon?.name||'',forceSwitch:force,trapped:!!entry?.trapped,moves:moveRows};
    });
    const forceSwitchSlots=Array.isArray(r.forceSwitch)?r.forceSwitch.map(Boolean):b.p1.active.map((_,i)=>i===0&&!!r.forceSwitch);
    return {id: record.id, turn: b.turn, ended: b.ended, winner: b.winner || '', mode: record.mode, gym: record.gym,
      difficulty: record.difficulty, doubleBattle:record.doubleBattle,aiFallbackCount: record.aiFallbackCount, lastOpponentDecision: record.lastOpponentDecision,
      bondBattleEffects:record.bondBattleEffects, pendingBattleLearning:[...(record.pendingBattleLearning||[])],
      bondEffect:record.battle.lastBondEffect?{...record.battle.lastBondEffect}:null,
      weather: b.field.weather, bag: {...record.bag, ball: record.bag.pokeball || 0},opponentBag:{...record.opponentBag},trainerItemUses:record.trainerItemUses,plannedTrainerItem:plannedTrainerItem(record), caught: record.caught || null,
      battleItems:items.filter(item=>item.battle&&!item.battle.capture&&!item.battle.escape&&(record.bag[item.id]||0)>0).map(item=>({id:item.id,name:item.name,count:record.bag[item.id],heal:item.battle.heal||0,revive:item.battle.revive||0,pp:item.battle.pp??null,allMoves:item.battle.allMoves===true,status:item.battle.status||[]})),
      escaped: !!record.escaped, attempts: record.attempts,
      sides: b.sides.map(side => ({name: side.name, conditions:Object.keys(side.sideConditions||{}),activeUIDs:side.active.map(mon=>mon?.set?.slotId||''), team: side.pokemon.map(actor)})),
      request: {forceSwitch: record.doubleBattle?forceSwitchSlots:!!r.forceSwitch,forceSwitchSlots, wait: !!r.wait,
        trapped: !!r.active?.[0]?.trapped,activeCommands,
        moves: (r.active?.[0]?.moves || []).map(m => ({...moves[toID(m.id || m.move)], ...m, name: locale.moves?.[toID(m.id || m.move)] || m.move})),
        switches: b.p1.pokemon.map((p, i) => ({slot: i + 1, ...actor(p)}))}, events};
  }
  consumeTurn(record, context = {}) {
    const b = record.battle;
    b.p1.clearChoice();
    b.p1.choice.actions.push({choice: 'pass', pokemon: b.p1.active[0], priority: 7});
    this.advanceEnemy(record, context);
  }
  advanceEnemy(record, {enemyChoice, playerInput = ''} = {}) {
    const b = record.battle;
    let offeredChoice = enemyChoice;
    // Includes an enemy replacement after a KO. Stop as soon as the player must choose.
    for (let i = 0; i < 12 && !b.ended; i++) {
      if (!b.p1.isChoiceDone()) break;
      let selected, autoItem=plannedTrainerItem(record);
      if(autoItem&&performTrainerItem(record,autoItem)){
        const local=chooseEnemyChoice(b,{difficulty:'expert',playerInput,rng:()=>b.random(1_000_000)/1_000_000});
        selected={choice:local.choice||'pass',source:b.p2.active.length===1?'trainer-item':'trainer-item+local',fallbackReason:''};
      } else selected = chooseEnemyChoice(b, {difficulty: record.difficulty, enemyChoice: offeredChoice, playerInput,
        rng: () => b.random(1_000_000) / 1_000_000});
      offeredChoice = undefined;
      const choice = selected.choice;
      if (!choice) break;
      record.lastOpponentDecision = {choice, source: selected.source, fallbackReason: selected.fallbackReason};
      if (selected.fallbackReason) {
        record.aiFallbackCount++;
        b.add('message', `AI对手模型决策不可用：${selected.fallbackReason}`);
      }
      if(autoItem&&selected.source.startsWith('trainer-item')){
        if(!commitEnemyTurnWithTrainerItem(b,choice,autoItem.actorSlot))throw Error('对手道具后的指令无效，请重新开始对战。');
      } else if (!b.choose('p2', choice)) throw Error('对手指令无效，请重新开始对战。');
    }
  }
  act(input = {}) {
    const record = this.battles.get(input.battleId);
    if (!record) throw Error('对战已过期，请重新开始。');
    const b = record.battle;
    if (b.ended) throw Error('对战已经结束。');
    if (record.pendingBattleLearning?.length) throw Error('请先处理战斗中待学的招式。');
    const choice = input.choice;
    const commandPattern=record.doubleBattle?/^(?:(?:move [1-4](?: [+-][1-3])?|switch [1-6]|pass|item [a-z]+(?: \d+)?(?: [1-4])?)(?:,\s*(?:move [1-4](?: [+-][1-3])?|switch [1-6]|pass|item [a-z]+(?: \d+)?(?: [1-4])?)){1})$/:/^(move [1-4]|switch [1-6]|item [a-z]+(?: [1-6])?(?: [1-4])?|capture(?: [a-z]+)?|run)$/;
    if (typeof choice !== 'string' || !commandPattern.test(choice)) throw Error('无效指令。');
    if(record.doubleBattle&&/^(?:capture|run)\b/.test(choice))throw Error('双打回合需要一次提交两位上场精灵的联合指令。');
    const forcedRequest=b.p1.activeRequest?.forceSwitch,forced=Array.isArray(forcedRequest)?forcedRequest.some(Boolean):!!forcedRequest;
    if(forced&&!choice.split(',').some(command=>command.trim().startsWith('switch ')))throw Error('请先替换倒下的宝可梦。');
    b.lastBondEffect=null;
    if(record.doubleBattle){
      const commands=choice.split(',').map(command=>command.trim()),itemSlots=commands.map((command,index)=>/^item /.test(command)?index:-1).filter(index=>index>=0);
      if(itemSlots.length){
        if(itemSlots.length>1)throw Error('双打同一回合最多由一位伙伴使用一件战斗药品。');
        const itemSlot=itemSlots[0],forceRequest=b.p1.activeRequest?.forceSwitch,forcedForSlot=Array.isArray(forceRequest)?!!forceRequest[itemSlot]:!!forceRequest;
        if(forcedForSlot)throw Error('需要替换倒下的伙伴时，不能用该行动位使用药品。');
        const plan=preparePlayerBattleItem(record,commands[itemSlot],itemSlot);
        if(!queueDoublePlayerChoice(b.p1,commands,itemSlot)){b.p1.clearChoice();throw Error('该双打指令当前无法执行：招式可能被禁用、PP不足，或换人目标无效。');}
        b.p1.clearChoice();
        applyPlayerBattleItem(record,plan);
        if(!queueDoublePlayerChoice(b.p1,commands,itemSlot)){b.p1.clearChoice();throw Error('药品处理后双打指令无效，请重新选择行动。');}
        markParticipation(record);this.advanceEnemy(record,input);markParticipation(record);return this.snapshot(record);
      }
    }
    const p = b.p1.active[0], target = b.p2.active[0];
    if (choice.startsWith('item ')) {
      if (forced) throw Error('倒下时必须先替换宝可梦。');
      const [, itemId, slotText, moveSlotText] = choice.match(/^item ([a-z]+)(?: ([1-6]))?(?: ([1-4]))?$/) || [];
      const item = itemById[itemId], slot = slotText ? Number(slotText) : b.p1.pokemon.indexOf(p) + 1;
      const targetMon = b.p1.pokemon[slot - 1];
      if (!item || !item.battle) throw Error('该物品不能在战斗中使用。');
      if (moveSlotText && (item.battle.pp === undefined || item.battle.allMoves)) throw Error('该物品不需要指定招式位置。');
      if (!record.bag[itemId]) throw Error(`${item.name}已经用完。`);
      const effect = item.battle;
      if (effect.escape) {
        if (record.mode !== 'wild') throw Error('该道具只能用于野生战斗。');
        record.bag[itemId]--;
        b.add('message', `训练家使用了${item.name}并立即逃离。`);
        b.add('run', 'success', '0');
        record.escaped = true;
        b.tie();
      } else {
        if (!targetMon) throw Error('没有这个目标宝可梦。');
        if (effect.revive) {
          if (!targetMon.fainted || targetMon.hp > 0) throw Error('活力碎片只能用于倒下的宝可梦。');
        } else {
          if (effect.pp===undefined&&(targetMon.fainted || targetMon.hp <= 0)) throw Error('该宝可梦已经倒下。');
          if((effect.heal||effect.status)&&!(effect.heal&&targetMon.hp<targetMon.maxhp)&&!effect.status?.includes(targetMon.status)&&!canCureConfusion(targetMon,itemId))throw Error('该宝可梦HP已满或没有对应的异常状态。');
        }
        const ppSlots = targetMon.baseMoveSlots;
        let ppIndexes = [];
        if (effect.pp !== undefined) {
          if (!Array.isArray(ppSlots) || !ppSlots.length) throw Error('该宝可梦没有可恢复的招式。');
          if (effect.allMoves) {
            ppIndexes = ppSlots.map((_, index) => index);
          } else {
            if (!moveSlotText) throw Error('请指定要恢复PP的招式位置。');
            const moveIndex = Number(moveSlotText) - 1;
            if (!ppSlots[moveIndex]) throw Error('没有这个招式位置。');
            ppIndexes = [moveIndex];
          }
          if (ppIndexes.every(index => ppSlots[index].pp >= ppSlots[index].maxpp)) throw Error('所选招式PP已满。');
        }
        if ((effect.boost || effect.volatile || effect.sideCondition) && targetMon !== p) throw Error('这种战斗道具只能用于当前上场的宝可梦。');
        if (effect.boost && Object.entries(effect.boost).every(([stat, amount]) => p.boosts[stat] >= 6 && amount > 0)) throw Error('当前能力等级已达到上限，物品没有效果。');
        if (effect.volatile && p.volatiles[effect.volatile]) throw Error('当前状态已存在，物品没有效果。');
        if (effect.sideCondition && b.p1.sideConditions[effect.sideCondition]) throw Error('当前保护效果仍在持续，物品没有效果。');
        if (effect.cureVolatile && !targetMon.volatiles[effect.cureVolatile]) throw Error('该宝可梦没有这种战斗状态，物品没有效果。');
        if (!item.reusable) record.bag[itemId]--;
        b.add('message', `训练家对${targetMon.name}使用了${item.name}。`);
        if (effect.revive) {
          b.p1.pokemonLeft++;
          targetMon.fainted = false; targetMon.faintQueued = false; targetMon.subFainted = false;
          targetMon.status = ''; targetMon.hp = Math.max(1, Math.floor(targetMon.maxhp * effect.revive));
          b.add('-heal', targetMon, targetMon.getHealth, `[from] item: ${item.name}`);
          b.makeRequest('move');
        } else if (effect.heal) {
          const amount = targetMon.heal(effect.heal);
          b.add('-heal', targetMon, targetMon.getHealth, `[from] item: ${item.name}`);
          b.add('message', `恢复了${amount}点HP！`);
        } else if (effect.status) {
          targetMon.cureStatus();
        } else if (effect.pp !== undefined) {
          for (const index of ppIndexes) {
            const move = ppSlots[index];
            move.pp = effect.pp === 'all' ? move.maxpp : Math.min(move.maxpp, move.pp + effect.pp);
            if(!targetMon.transformed&&targetMon.moveSlots[index]?.id===move.id)targetMon.moveSlots[index].pp=move.pp;
          }
          // The compact event is followed by a user-facing message; PP is authoritative in snapshots.
          b.add('message', `${item.name}已恢复招式PP。`);
        } else if (effect.boost) {
          if (!b.boost(effect.boost, targetMon, targetMon, item)) throw Error('该能力增强道具当前没有效果。');
        } else if (effect.volatile) {
          if (!targetMon.addVolatile(effect.volatile, targetMon, item)) throw Error('该要害状态当前无法生效。');
        } else if (effect.sideCondition) {
          if (!b.p1.addSideCondition(effect.sideCondition, p, item)) throw Error('该队伍保护当前无法生效。');
        } else if (effect.cureVolatile) {
          targetMon.removeVolatile(effect.cureVolatile);
          const statusName = effect.cureVolatile === 'confusion' ? 'Confusion' : 'Attract';
          b.add('-end', targetMon, statusName, `[from] item: ${item.name}`);
        }
        if(effect.status?.includes(targetMon.status))targetMon.cureStatus();
        if(canCureConfusion(targetMon,itemId))targetMon.removeVolatile('confusion');
        if(effect.friendship){const value=targetMon.happiness;targetMon.happiness=Math.max(0,Math.min(255,value+effect.friendship[value<100?0:value<200?1:2]));}
        this.consumeTurn(record, input);
      }
    } else if (choice.startsWith('capture')) {
      if (record.mode !== 'wild') throw Error('不能捕捉训练家的宝可梦。');
      const ballId = choice.split(' ')[1] || 'pokeball';
      const ball = itemById[ballId];
      if (!ball?.battle?.capture) throw Error('无法使用这种精灵球。');
      if (!record.bag[ballId]) throw Error(`${ball.name}已经用完。`);
      const rate = locale.catchRates?.[target.baseSpecies.num];
      if (!Number.isInteger(rate) || rate < 1 || rate > 255) throw Error('当前野生宝可梦缺少有效的第三世代捕获率。');
      record.bag[ballId]--;
      const result = resolveCapture({catchRate: rate, maxHp: target.maxhp, hp: target.hp, status: target.status, ballId,context:{types:target.getTypes(),level:target.level,alreadyCaught:(record.caughtSpecies||[]).includes(target.baseSpecies.num),turns:Math.max(0,b.turn-1),underwater:false}}, () => b.random(65536));
      b.add('capture', target.name, result.shakes);
      if (result.success) {
        record.caught = {id: target.baseSpecies.num, name: target.name, ball: ballId,
          snapshot: {...actor(target), moves: target.moveSlots.map(move => ({id: move.id, pp: move.pp, maxpp: move.maxpp}))}};
        b.add('message', `成功收服了${target.name}！`); b.win('p1');
      } else { b.add('message', `${target.name}挣脱了精灵球！`); this.consumeTurn(record, input); }
    } else if (choice === 'run') {
      if (record.mode !== 'wild') throw Error('训练家对战不能逃跑。');
      const alwaysRun = p.ability === 'runaway' || p.item === 'smokeball';
      if (b.p1.activeRequest?.active?.[0]?.trapped && !alwaysRun) throw Error('当前宝可梦被困住了，无法逃跑。');
      const result = resolveRun({playerSpeed: p.storedStats.spe, targetSpeed: target.storedStats.spe, attempts: record.attempts,
        alwaysRun}, () => b.random(256));
      record.attempts = result.attempts;
      b.add('run', result.success ? 'success' : 'failed', result.attempt);
      if (result.success) {
        b.add('message', '成功逃离了野生对战。'); record.escaped = true; b.tie();
      } else { b.add('message', '没能逃走！'); this.consumeTurn(record, input); }
    } else {
      // Validate before any AI RNG is consumed, preserving rejected commands atomically.
      const before = b.log.length;
      if (!b.choose('p1', choice)) {
        b.log.length = before;
        b.p1.clearChoice();
        throw Error('该指令当前无法执行：招式可能被禁用、PP不足，或换人目标无效。');
      }
      markParticipation(record);
      this.advanceEnemy(record, input);
    }
    markParticipation(record);
    return this.snapshot(record);
  }
}
module.exports = {KantoGame, catalog, Dex, Battle};
