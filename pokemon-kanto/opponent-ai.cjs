'use strict';

const { Dex: BaseDex } = require('./vendor/showdown/sim/dex.js');
const Dex = BaseDex.mod('gen3');
const {Battle}=require('./vendor/showdown/sim/battle.js');

const DIFFICULTIES = Object.freeze(['easy', 'normal', 'hard', 'expert', 'hell', 'ai']);
const legalMoves = (request) => (request?.active?.[0]?.moves || [])
  .map((move, index) => ({ ...move, slot: index + 1 }))
  .filter(move => !move.disabled && move.pp !== 0);

function actorChoiceCandidates(battle, side, index, usedSwitches = new Set()) {
  const request = side?.activeRequest, actor = side?.active?.[index];
  if (!request || request.wait || !actor) return ['pass'];
  const forced = Array.isArray(request.forceSwitch) ? !!request.forceSwitch[index] : !!request.forceSwitch;
  const switches = side.pokemon.flatMap((pokemon, slot) => !pokemon.isActive && !pokemon.fainted && pokemon.hp > 0 && !usedSwitches.has(slot + 1) ? [`switch ${slot + 1}`] : []);
  if (forced) return switches.length ? switches : ['pass'];
  const moveRequest = request.active?.[index];
  const moves = (moveRequest?.moves || []).map((move, slot) => ({...move,slot:slot+1})).filter(move=>!move.disabled&&move.pp!==0);
  if (!moves.length) return (moveRequest?.moves?.length ? ['move 1'] : ['pass']);
  const candidates=[];
  for(const move of moves){
    const targets=[];
    if(battle.activePerHalf>1&&battle.actions.targetTypeChoices(move.target)){
      for(const target of [...side.active,...(side.foe?.active||[])]){
        if(!target||target.fainted)continue;
        const loc=actor.getLocOf(target);
        if(battle.validTargetLoc(loc,actor,move.target))targets.push(loc);
      }
    } else targets.push(0);
    for(const loc of targets){
      const suffix=loc?(loc>0?` +${loc}`:` ${loc}`):'';
      candidates.push(`move ${move.slot}${suffix}`);
    }
  }
  if(!candidates.length&&moveRequest?.moves?.length)candidates.push('move 1');
  return [...candidates,...switches];
}

/** Legal individual and atomic joint choices from the simulator request. */
function getEnemyChoiceCandidates(battle) {
  const side=battle?.p2,request=side?.activeRequest;
  if(!request||request.wait||battle?.ended)return [];
  if(battle.gameType==='singles')return actorChoiceCandidates(battle,side,0);
  const perSlot=side.active.map((_,index)=>actorChoiceCandidates(battle,side,index));
  const combinations=[];
  const walk=(index,commands,used=new Set())=>{
    if(index===perSlot.length){combinations.push(commands.join(', '));return;}
    for(const choice of perSlot[index]){
      const match=/^switch (\d+)$/.exec(choice),slot=match?Number(match[1]):null;
      if(slot&&used.has(slot))continue;
      const next=new Set(used);if(slot)next.add(slot);
      walk(index+1,[...commands,choice],next);
    }
  };
  walk(0,[]);return combinations;
}

function actorSummary(pokemon) {
  return { id: pokemon.baseSpecies.num, name: pokemon.name, hp: pokemon.hp, maxhp: pokemon.maxhp,
    status: pokemon.status || '', types: pokemon.getTypes(), active: pokemon.isActive, fainted: pokemon.fainted,
    actorSlot:pokemon.position,uid:pokemon.set?.slotId||'',
    moves: (pokemon.moveSlots || []).map(move => ({ id: move.id, pp: move.pp, maxpp: move.maxpp })) };
}

/** Bounded public battle context for a host model; never includes MVU variables or credentials. */
function getEnemyDecisionSummary(battle, { difficulty = 'normal', playerInput = '', candidates: suppliedCandidates } = {}) {
  const request = battle?.p2?.activeRequest;
  const side = battle?.p2;
  const active = side?.active || [];
  // This is also the command source for each move's target list below. Build it
  // once per actor instead of rebuilding the same legal command rows per move.
  const actorCommands = active.map((_, actorSlot) => actorChoiceCandidates(battle, side, actorSlot));
  const summary = {
    difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : 'normal',
    forcedSwitch: Array.isArray(request?.forceSwitch)?request.forceSwitch.map(Boolean):!!request?.forceSwitch,
    activeCommands:active.map((pokemon,actorSlot)=>({actorSlot,uid:pokemon?.set?.slotId||'',name:pokemon?.name||'',moves:(request?.active?.[actorSlot]?.moves||[]).map((move,slot)=>({...move,slot:slot+1,targets:actorCommands[actorSlot].filter(command=>new RegExp(`^move ${slot+1}(?: |$)`).test(command)).map(command=>command.replace(/^move \d+\s*/,''))}))})),
    candidates: suppliedCandidates || getEnemyChoiceCandidates(battle),
    enemy: battle?.p2?.pokemon?.map(actorSummary) || [],
    player: battle?.p1?.pokemon?.map(actorSummary) || [],
    turn: Number(battle?.turn) || 0,
  };
  if (['expert','hell'].includes(summary.difficulty) && typeof playerInput === 'string') summary.playerInput = playerInput.slice(0, 500);
  if(summary.difficulty==='hell')summary.playerConfiguration=battle.p1.pokemon.map(mon=>({uid:mon.set.slotId,moves:mon.moveSlots.map(move=>move.id),ability:mon.ability,item:mon.item,stats:{...mon.storedStats}}));
  return summary;
}

function effectivePower(actor, target, move) {
  if (!move || move.category === 'Status') return 0;
  const immunity = !Dex.getImmunity(move.type, target);
  if (immunity) return 0;
  const effectiveness = 2 ** Dex.getEffectiveness(move.type, target);
  const category = move.category === 'Physical' ? ['atk', 'def'] : ['spa', 'spd'];
  const statRatio = actor.getStat(category[0]) / Math.max(1, target.getStat(category[1]));
  const power = move.basePower || (move.damage ? 65 : 0);
  return power * effectiveness * (actor.hasType(move.type) ? 1.5 : 1) * statRatio * (move.accuracy === true ? 1 : (move.accuracy || 100) / 100);
}

function moveScore(battle, actor, target, option, difficulty, predictionTarget = target) {
  const move = Dex.moves.get(option.id);
  if (!move.exists) return 0;
  let score = effectivePower(actor, target, move);
  const expert = ['expert', 'hell', 'ai'].includes(difficulty);
  // Read-only Gen III viability checks: do not run simulator events while planning.
  if(expert&&target){
    const ability=target.ability,damaging=move.category!=='Status';
    if((damaging&&!Dex.getImmunity(move.type,target))||
      (move.type==='Water'&&ability==='waterabsorb')||(move.type==='Electric'&&ability==='voltabsorb')||
      (move.type==='Fire'&&ability==='flashfire')||(move.type==='Ground'&&ability==='levitate')||
      (move.flags?.sound&&ability==='soundproof')||(damaging&&ability==='wonderguard'&&Dex.getEffectiveness(move.type,target)<=0))return -1000;
    if(move.category==='Status'){
      if(move.heal&&actor.hp===actor.maxhp)return -1000;
      if(move.status&&(target.status||move.status==='slp'&&['insomnia','vitalspirit'].includes(ability)||
        ['psn','tox'].includes(move.status)&&(target.hasType('Poison')||target.hasType('Steel')||ability==='immunity')||
        move.status==='brn'&&(target.hasType('Fire')||ability==='waterveil')||move.status==='par'&&target.hasType('Ground')))return -1000;
      if(move.boosts){const recipient=move.target==='self'?actor:target;const changes=Object.entries(move.boosts);if(changes.length&&changes.every(([stat,delta])=>delta>0?recipient.boosts[stat]>=6:recipient.boosts[stat]<=-6))return -1000;}
    }
  }
  if (move.category === 'Status') {
    if (difficulty === 'normal') {
      score = move.heal && actor.hp < actor.maxhp * 0.45 ? 220 : move.status && !target.status ? 70 : move.boosts && battle.turn < 4 ? 65 : 12;
    } else if (move.heal) score = actor.hp < actor.maxhp * (difficulty === 'hard' ? 0.6 : 0.48) ? 125 + (1 - actor.hp / actor.maxhp) * 80 : 4;
    else if (move.status) score = !target.status ? (expert ? 92 : 62) : 3;
    else if (move.boosts) score = battle.turn < 5 ? (expert ? 68 : 52) : 18;
    else score = 8;
  } else {
    if (move.selfdestruct) score *= 0.35;
    if (move.recoil) score *= 0.8;
    if (move.flags?.charge) score *= 0.55;
    if (expert) {
      score += (1 - target.hp / target.maxhp) * 18;
      if (score >= target.hp) score += 65;
      if (target.status === 'protect') score *= 0.45;
    }
  }
  if (difficulty === 'hard' && move.heal && actor.hp / actor.maxhp < 0.65) score += 28;
  if (difficulty === 'hard' && move.status && !target.status) score += 12;
  if (['expert','hell'].includes(difficulty) && predictionTarget && predictionTarget !== target) {
    const predicted = effectivePower(actor, predictionTarget, move);
    if (predicted > 0) score = Math.max(score * 0.65, predicted * 1.18);
  }
  return score;
}

function intendedSwitchTarget(battle, playerInput) {
  if (typeof playerInput !== 'string' || !/(换|切换|交换|派出|换上|替换)/.test(playerInput)) return null;
  const text = playerInput.toLocaleLowerCase();
  const reserves = battle.p1.pokemon.filter(pokemon => !pokemon.isActive && !pokemon.fainted && pokemon.hp > 0);
  return reserves.find(pokemon => [pokemon.name, pokemon.set?.mvuState?.nickname].filter(Boolean)
    .some(name => text.includes(String(name).toLocaleLowerCase()))) || null;
}

function scoreSwitch(battle, actor, candidate) {
  const attackers = battle.p1.active?.filter(p=>p&&!p.fainted)||[];
  if (!attackers.length || !candidate) return -Infinity;
  const threat = defender => Math.max(0, ...attackers.flatMap(attacker=>(attacker.moveSlots||[]).map(slot=>effectivePower(attacker,defender,Dex.moves.get(slot.id)))));
  const currentThreat = threat(actor), replacementThreat = threat(candidate);
  // The switch costs the same single enemy action. Avoid switches that merely preserve HP at low tactical value.
  return (currentThreat - replacementThreat) * 1.5 - (1 - actor.hp / actor.maxhp) * 20 - 25;
}

function localChoice(battle, difficulty, { playerInput = '', rng = Math.random } = {}) {
  const side = battle.p2, request = side.activeRequest, options = getEnemyChoiceCandidates(battle);
  if (!options.length) return null;
  if(battle.gameType!=='singles'){
    const commands=[],usedSwitches=new Set();
    for(let index=0;index<side.active.length;index++){
      const actor=side.active[index],forced=Array.isArray(request.forceSwitch)?!!request.forceSwitch[index]:!!request.forceSwitch;
      const choices=actorChoiceCandidates(battle,side,index,usedSwitches);
      if(forced){const selected=choices[0]||'pass';commands.push(selected);const sw=/^switch (\d+)$/.exec(selected);if(sw)usedSwitches.add(Number(sw[1]));continue;}
      const moveRows=request.active?.[index]?.moves||[];
      const scored=choices.map(choice=>{
        const moveMatch=/^move (\d+)(?: ([+-]?\d+))?$/.exec(choice),switchMatch=/^switch (\d+)$/.exec(choice);
        if(moveMatch){const moveOption={...moveRows[Number(moveMatch[1])-1],id:moveRows[Number(moveMatch[1])-1]?.id};const move= Dex.moves.get(moveOption.id);let target=moveMatch[2]?actor.getAtLoc(Number(moveMatch[2])):(side.foe.active.find(p=>p&&!p.fainted)||side.foe.active[0]);const score=moveScore(battle,actor,target,moveOption,difficulty);return {choice,score};}
        if(switchMatch){const replacement=side.pokemon[Number(switchMatch[1])-1];return {choice,score:['expert','hell','ai'].includes(difficulty)?scoreSwitch(battle,actor,replacement):-Infinity};}
        return {choice,score:0};
      });
      if(difficulty==='normal')for(const row of scored)row.score*=0.7+Math.floor(rng()*31)/100;
      scored.sort((a,b)=>b.score-a.score);
      const selected=scored[0]?.choice||choices[0]||'pass';commands.push(selected);const sw=/^switch (\d+)$/.exec(selected);if(sw)usedSwitches.add(Number(sw[1]));
    }
    return commands.join(', ');
  }
  if (request.forceSwitch) return options[0];
  const actor = side.active?.[0], target = battle.p1.active?.[0];
  const usable = legalMoves(request);
  if (!usable.length) return options.find(choice => choice === 'move 1') || options[0];
  if (difficulty === 'easy') {
    // Easy favors a varied first move and occasionally uses the other legal moves at random.
    const selected = rng() < 0.65 ? usable[0] : usable[Math.floor(rng() * usable.length)];
    return `move ${selected.slot}`;
  }
  const prediction = ['expert','hell'].includes(difficulty) ? intendedSwitchTarget(battle, playerInput) : null;
  const scored = usable.map(option => ({ choice: `move ${option.slot}`, score: moveScore(battle, actor, target, option, difficulty, prediction) }));
  if (['expert', 'hell'].includes(difficulty)) {
    const currentIndex = side.pokemon.indexOf(actor);
    for (let index = 0; index < side.pokemon.length; index++) {
      const candidate = side.pokemon[index];
      if (index === currentIndex || candidate.fainted || candidate.hp <= 0 || candidate.isActive) continue;
      scored.push({ choice: `switch ${index + 1}`, score: scoreSwitch(battle, actor, candidate) });
    }
  }
  if (difficulty === 'normal') {
    // Preserve the previous default heuristic and its mild randomness.
    for (const choice of scored) choice.score *= 0.7 + Math.floor(rng() * 31) / 100;
  }
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.choice || options[0];
}

function chooseEnemyChoice(battle, { difficulty = 'normal', enemyChoice, playerInput = '', rng = Math.random } = {}) {
  const level = DIFFICULTIES.includes(difficulty) ? difficulty : 'normal';
  const candidates = getEnemyChoiceCandidates(battle);
  if (!candidates.length) return { choice: null, source: 'none', fallbackReason: '' };
  if(level==='hell'){
    const choice=oracleChoice(battle,candidates);
    if(choice)return {choice,source:'hell-oracle',fallbackReason:''};
  }
  if (level === 'ai') {
    if (typeof enemyChoice === 'string' && candidates.includes(enemyChoice)) return { choice: enemyChoice, source: 'host-ai', fallbackReason: '' };
    return { choice: localChoice(battle, 'expert', { playerInput, rng }), source: 'expert-fallback', fallbackReason: typeof enemyChoice === 'string' ? '模型选择不在当前合法候选内，已回退极难策略。' : '未提供模型选择，已回退极难策略。' };
  }
  return { choice: localChoice(battle, level, { playerInput, rng }), source: level, fallbackReason: '' };
}

function oracleChoice(battle,candidates){
  if(!battle.p1?.isChoiceDone()||!battle.p1.choice?.actions?.length||battle.p2.activeRequest?.forceSwitch)return null;
  const value=b=>{
    if(b.ended&&b.winner)return b.winner===b.p2.name?1e6:-1e6;
    const teamScore=side=>side.pokemon.reduce((n,mon)=>n+(mon.fainted||mon.hp<=0?0:1500+500*mon.hp/mon.maxhp-(mon.status?45:0)+Object.values(mon.boosts).reduce((a,v)=>a+v,0)*18),0);
    return teamScore(b.p2)-teamScore(b.p1);
  };
  const initial=battle.toJSON(),ranked=candidates.map(choice=>({choice,score:choice.split(',').reduce((sum,part,index)=>{
    const actor=battle.p2.active[index],target=battle.p1.active.find(mon=>mon&&!mon.fainted);if(!actor||!target)return sum;
    const move=/^move (\d+)(?: ([+-]?\d+))?$/.exec(part.trim()),sw=/^switch (\d+)$/.exec(part.trim());
    if(move){const option=battle.p2.activeRequest?.active?.[index]?.moves?.[Number(move[1])-1];return sum+(option?moveScore(battle,actor,target,option,'hell'):0);}
    return sum+(sw?scoreSwitch(battle,actor,battle.p2.pokemon[Number(sw[1])-1]):0);
  },0)})).sort((a,b)=>b.score-a.score).slice(0,12);
  let best=null,bestScore=-Infinity;
  for(const row of ranked){let fork;try{
    fork=Battle.fromJSON(structuredClone(initial));
    // Read the submitted action, not the future random stream. Simulation uses
    // its own fixed seed; it cannot consume or replace live battle randomness.
    fork.resetRNG([0x94,0x143,0x712,0x223]);
    if(!fork.choose('p2',row.choice))continue;
    const score=value(fork)+row.score*.015;if(score>bestScore){bestScore=score;best=row.choice;}
  }catch{}finally{fork?.destroy();}}
  return best;
}

module.exports = { DIFFICULTIES, getEnemyChoiceCandidates, getEnemyDecisionSummary, chooseEnemyChoice };
