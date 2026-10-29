'use strict';

const fs = require('node:fs');
const path = require('node:path');
const locations = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data/map.json'), 'utf8').replace(/^\uFEFF/, ''));
const locationsById = new Map(locations.map(node => [node.id, node]));
const MOODS = new Set(['平静', '愉快', '紧张', '疲惫', '勇敢', '安心']);
const MODES = Object.freeze({
  bond: { talk: { mood: '安心', gain: 2, memory: '一起安静地交谈，熟悉了彼此回应的方式。', clue: '愿意回应熟悉的声音或目光' }, listen: { mood: '平静', gain: 2, memory: '训练家耐心地倾听，同伴渐渐放松下来。', clue: '在安静陪伴时会慢慢放松' }, play: { mood: '愉快', gain: 2, memory: '短暂的玩耍让旅途多了一段轻松的回忆。', clue: '心情轻松时会主动靠近' } },
  care: { comfort: { mood: '安心', gain: 1, memory: '训练家留意到同伴的疲惫，并温柔地陪在身边。', clue: '感到不安时更需要熟悉的陪伴' }, groom: { mood: '愉快', gain: 1, memory: '训练家细心整理同伴的身体和随身物品，同伴渐渐习惯了这份照料。', clue: '熟悉日常照料后会更自在' }, check: { mood: '平静', gain: 1, memory: '训练家检查了同伴的状态，记住了它的小习惯。', clue: '有固定的休息和整理习惯' } },
  train: { practice: { mood: '勇敢', gain: 1, memory: '一起练习基础配合，逐渐熟悉了彼此的节奏。', clue: '能跟随熟悉的手势和节奏配合' }, focus: { mood: '平静', gain: 1, memory: '专注练习时，同伴学会了更好地等待和观察。', clue: '行动前会先观察训练家的信号' }, confidence: { mood: '安心', gain: 1, memory: '训练家放慢节奏鼓励同伴，练习在平稳中结束。', clue: '受到鼓励时会更愿意尝试' } },
});
const MAX_MEMORIES = 12;
const MAX_CLUES = 36;
const TRUST_TIERS = Object.freeze([
  { at: 0, id: 'new', name: '初识', experienceBonusPercent: 0, campHpPercent: 10, campPp: 0 },
  { at: 20, id: 'familiar', name: '熟悉', experienceBonusPercent: 5, campHpPercent: 15, campPp: 1 },
  { at: 40, id: 'reliable', name: '可靠', experienceBonusPercent: 10, campHpPercent: 20, campPp: 2 },
  { at: 60, id: 'close', name: '亲近', experienceBonusPercent: 15, campHpPercent: 25, campPp: 3, inboundAccuracyMultiplier: 0.97, critStageBonus: 0 },
  { at: 80, id: 'inseparable', name: '默契', experienceBonusPercent: 20, campHpPercent: 30, campPp: 4, inboundAccuracyMultiplier: 0.97, critStageBonus: 1 },
  { at: 100, id: 'devoted', name: '深厚', experienceBonusPercent: 20, campHpPercent: 30, campPp: 4, inboundAccuracyMultiplier: 0.95, critStageBonus: 1 },
]);
const clone = value => structuredClone(value);

function tierFor(trust) {
  const value = Number.isInteger(trust) ? Math.max(0, Math.min(100, trust)) : 0;
  return [...TRUST_TIERS].reverse().find(tier => value >= tier.at) || TRUST_TIERS[0];
}

function ensure(world) {
  if (!world || typeof world !== 'object') throw new TypeError('需要关都世界状态。');
  if (!world.羁绊 || typeof world.羁绊 !== 'object' || Array.isArray(world.羁绊)) world.羁绊 = {};
  const bond = world.羁绊;
  if (!bond.伙伴 || typeof bond.伙伴 !== 'object' || Array.isArray(bond.伙伴)) bond.伙伴 = {};
  if (!Array.isArray(bond.短期线索)) bond.短期线索 = [];
  bond.短期线索 = bond.短期线索.filter(clue => clue && typeof clue.UID === 'string' && typeof clue.内容 === 'string' && Number.isSafeInteger(clue.到期故事轮次)).slice(-MAX_CLUES);
  for (const key of ['上次羁绊增长故事轮次', '上次露营故事轮次']) {
    if (bond[key] !== null && (!Number.isSafeInteger(bond[key]) || bond[key] < 0)) bond[key] = null;
    if (bond[key] === undefined) bond[key] = null;
  }
  for (const mon of [...(world.队伍 || []), ...(world.电脑 || [])]) {
    if (typeof mon?.uid !== 'string' || !mon.uid) continue;
    const old = bond.伙伴[mon.uid];
    const record = old && typeof old === 'object' && !Array.isArray(old) ? old : {};
    record.信赖 = Number.isInteger(record.信赖) ? Math.max(0, Math.min(100, record.信赖)) : mon.uid==='starter' ? 10 : 0;
    if (!MOODS.has(record.心情)) record.心情 = '平静';
    if (!Array.isArray(record.共同记忆)) record.共同记忆 = [];
    record.共同记忆 = record.共同记忆.filter(memory => memory && Number.isSafeInteger(memory.故事轮次) && memory.故事轮次 >= 0 && typeof memory.事件 === 'string').slice(-MAX_MEMORIES);
    bond.伙伴[mon.uid] = record;
  }
  return world;
}

function validate(world) {
  const bond = world?.羁绊;
  if (!bond || typeof bond !== 'object' || !bond.伙伴 || typeof bond.伙伴 !== 'object' || Array.isArray(bond.伙伴)) throw new Error('羁绊资料无效。');
  if (!Array.isArray(bond.短期线索) || bond.短期线索.length > MAX_CLUES) throw new Error('短期剧情线索资料无效。');
  for (const [uid, record] of Object.entries(bond.伙伴)) {
    if (!uid || !record || typeof record !== 'object' || !Number.isInteger(record.信赖) || record.信赖 < 0 || record.信赖 > 100 || !MOODS.has(record.心情) || !Array.isArray(record.共同记忆) || record.共同记忆.length > MAX_MEMORIES) throw new Error('同伴羁绊状态无效。');
    for (const memory of record.共同记忆) if (!Number.isSafeInteger(memory.故事轮次) || memory.故事轮次 < 0 || typeof memory.事件 !== 'string' || memory.事件.length > 240) throw new Error('共同记忆资料无效。');
  }
  for (const clue of bond.短期线索) if (!clue || typeof clue.UID !== 'string' || typeof clue.内容 !== 'string' || clue.内容.length > 180 || !Number.isSafeInteger(clue.到期故事轮次) || clue.到期故事轮次 < 0) throw new Error('短期剧情线索资料无效。');
  for (const key of ['上次羁绊增长故事轮次', '上次露营故事轮次']) if (bond[key] !== null && (!Number.isSafeInteger(bond[key]) || bond[key] < 0)) throw new Error('羁绊行动故事轮次无效。');
  return true;
}

function options(world) {
  const node = locationsById.get(world?.地图?.节点);
  if (world?.剧情?.初始御三家已选 !== true || world?.战斗?.状态 !== 'finished' || !node || !['town', 'route', 'cave'].includes(node.kind)) return [];
  const party = Array.isArray(world.队伍) ? world.队伍 : [];
  if (!party.length) return [];
  if (!party.some(mon => mon.当前HP > 0)) return [];
  const outdoor=['route','cave'].includes(node.kind);
  return [{id:'camp',label:outdoor?'与伙伴露营':'与伙伴休憩',enabled:true,payload:{mode:'rest'}}];
}

function appendMemory(record, storyTurn, event) {
  record.共同记忆.push({故事轮次:storyTurn,事件:String(event).slice(0, 240)});
  if (record.共同记忆.length > MAX_MEMORIES) record.共同记忆.splice(0, record.共同记忆.length - MAX_MEMORIES);
}

function addClue(bond, uid, storyTurn, text) {
  bond.短期线索=bond.短期线索.filter(clue => clue.到期故事轮次 >= storyTurn);
  bond.短期线索.push({UID:uid,内容:text,到期故事轮次:storyTurn+2});
  if(bond.短期线索.length>MAX_CLUES)bond.短期线索.splice(0,bond.短期线索.length-MAX_CLUES);
}

function gainTrust(world, uid, storyTurn, amount, mood, event, clue) {
  const bond=world.羁绊;
  if(bond.上次羁绊增长故事轮次===storyTurn)return false;
  const record=bond.伙伴[uid];
  if(!record)return false;
  bond.上次羁绊增长故事轮次=storyTurn;
  record.信赖=Math.min(100,record.信赖+amount);
  record.心情=mood;
  appendMemory(record,storyTurn,event);
  addClue(bond,uid,storyTurn,clue);
  return true;
}

function onBattleResult(world, {storyTurn=world?.地图?.轮次, participants=[], result=''}={}) {
  ensure(world);
  if(!Number.isSafeInteger(storyTurn)||storyTurn<1) return world;
  const bond=world.羁绊;
  if(bond.上次羁绊增长故事轮次===storyTurn)return world;
  const living=new Set((world.队伍||[]).filter(mon=>mon.当前HP>0).map(mon=>mon.uid));
  const earned=[...new Set(participants)].filter(uid=>living.has(uid)&&bond.伙伴[uid]);
  if(!earned.length)return world;
  const resultText=result==='win'?'并肩赢下了这场战斗':result==='lose'?'在战斗中彼此照应并平安退下':'一起经历了这场战斗';
  for(const uid of earned){
    const record=bond.伙伴[uid];
    record.信赖=Math.min(100,record.信赖+2);
    record.心情=result==='win'?'勇敢':'安心';
    appendMemory(record,storyTurn,`${resultText}，记住了彼此的配合。`);
    addClue(bond,uid,storyTurn,'战斗中能跟上熟悉的配合节奏');
  }
  bond.上次羁绊增长故事轮次=storyTurn;
  return world;
}

function benefitsFor(record) {
  const trust=Number.isInteger(record?.信赖)?Math.max(0,Math.min(100,record.信赖)):0;
  const tier=tierFor(trust);
  const next=TRUST_TIERS.find(item=>item.at>trust);
  return {trust,currentTier:tier.name,tier,tierId:tier.id,nextThreshold:next?.at??null,nextTrust:next?.at??null,
    experienceBonusPercent:tier.experienceBonusPercent,
    expMultiplier:1+tier.experienceBonusPercent/100,
    battleEffects:{inboundAccuracyMultiplier:tier.inboundAccuracyMultiplier??1,critStageBonus:tier.critStageBonus??0},
    recovery:{hpPercent:tier.campHpPercent,pp:tier.campPp},campHpPercent:tier.campHpPercent,campPp:tier.campPp};
}

function view(world) {
  ensure(world);
  const members=new Map([...(world.队伍||[]),...(world.电脑||[])].map(mon=>[mon.uid,mon]));
  const companions=Object.entries(world.羁绊.伙伴).map(([uid,record])=>{
    const mon=members.get(uid),benefits=benefitsFor(record);
    return {uid,name:mon?.昵称||`伙伴 ${uid}`,inParty:(world.队伍||[]).some(item=>item.uid===uid),
      ...benefits,mood:record.心情,memories:record.共同记忆.slice(-3).map(memory=>({storyTurn:memory.故事轮次,text:memory.事件}))};
  }).filter(entry=>entry.inParty||entry.trust>0||entry.memories.length)
    .sort((a,b)=>b.trust-a.trust||a.name.localeCompare(b.name,'zh-CN'));
  return {trustIsCustom:true,friendshipField:'亲密度（原版0—255，独立于0—100羁绊信赖）',
    tiers:TRUST_TIERS.map(tier=>({...tier})),benefits:companions,
    campActions:[{id:'rest',label:'与伙伴露营',description:'每故事轮次一次；按信赖档位恢复同行存活伙伴HP和招式PP，并增加信赖。'}],
    rules:{experience:'战斗结算时，按伙伴自身羁绊档位对其本次EXP最终值加成；不改变Gen3经验公式、EV或亲密度。',
      battle:'自定义可关闭的Gen3辅助：信赖60—99令对该伙伴进行的普通命中检定准确率×0.97；信赖100×0.95。信赖80起该伙伴的普通攻击要害等级+1。必中、自身招式和一击必杀不受此规则影响；Battle Armor/Shell Armor仍会阻止要害。',
      camp:'每故事轮次一次；城镇休憩或野外露营恢复存活伙伴HP和每招PP，不复活倒下伙伴。',
      trust:'每故事轮次最多一次信赖增长；御三家初始10，露营每位存活伙伴+5、战斗参与者+2，兼容的旧动作仍有效。正式亲密度另用原版0—255字段。'}};
}

function apply(world, action, payload = {}) {
  const next=ensure(clone(world)),bond=next.羁绊;
  const storyTurn=payload.storyTurn;
  if(!Number.isSafeInteger(storyTurn)||storyTurn<1)throw new Error('需要由宿主提供有效的故事回合。');
  const node=locationsById.get(next.地图?.节点);
  if(next.剧情?.初始御三家已选!==true&&payload.source!=='gadget')throw new Error('请先选择最初的伙伴。');
  if(next.战斗?.状态!=='finished')throw new Error('请先完成当前遭遇，再与伙伴互动。');
  if(!['town','route','cave'].includes(node?.kind))throw new Error('当前地点不适合与伙伴互动。');
  bond.短期线索=bond.短期线索.filter(clue=>clue.到期故事轮次>=storyTurn);
  if(action==='camp'){
    if(!['town','route','cave'].includes(node?.kind)||next.战斗?.状态!=='finished')throw new Error('只能在城镇或野外休憩，且不能有进行中遭遇。');
    if(!next.队伍?.some(mon=>mon.当前HP>0))throw new Error('队伍全员倒下，露营不能复活宝可梦。');
    if(bond.上次露营故事轮次===storyTurn)throw new Error('本故事回合已经露营休息过。');
    const campMode=payload.mode||'rest';
    if(campMode!=='rest')throw new Error('未知的露营方式。');
    bond.上次露营故事轮次=storyTurn;
    if(!next.机制奖励||typeof next.机制奖励!=='object')next.机制奖励={};
    if(!next.机制奖励.操作记录||typeof next.机制奖励.操作记录!=='object')next.机制奖励.操作记录={};
    next.机制奖励.操作记录.营地轮次=storyTurn;
    for(const mon of next.队伍){
      if(mon.当前HP<=0)continue;
      const tier=tierFor(bond.伙伴[mon.uid]?.信赖);
      if(campMode==='rest'){
        const unlocked=next.机制奖励.已解锁||[];
        const enhanced=unlocked.includes('campKitPlus'),basic=unlocked.includes('campKit');
        const hpPercent=enhanced?100:basic?Math.max(50,tier.campHpPercent):tier.campHpPercent;
        const ppRecovery=enhanced?Infinity:basic?Math.max(5,tier.campPp):tier.campPp;
        const recovery=Math.max(1,Math.ceil(mon.能力值.hp*hpPercent/100));
        mon.当前HP=Math.min(mon.能力值.hp,mon.当前HP+recovery);
        for(const move of mon.招式)move.PP=ppRecovery===Infinity?move.PP上限:Math.min(move.PP上限,move.PP+ppRecovery);
        if(enhanced)mon.状态='';
      }
      const record=bond.伙伴[mon.uid];record.心情='安心';
      const event='一起在营火旁休息，熟悉了夜里的动静和彼此的习惯。';
      const clue='夜里休息后显得安心，能留意周围细微动静';
      appendMemory(record,storyTurn,event);
      addClue(bond,mon.uid,storyTurn,clue);
    }
    if(bond.上次羁绊增长故事轮次!==storyTurn){
      for(const mon of next.队伍.filter(item=>item.当前HP>0))bond.伙伴[mon.uid].信赖=Math.min(100,bond.伙伴[mon.uid].信赖+5);
      bond.上次羁绊增长故事轮次=storyTurn;
    }
    return next;
  }
  if(!['bond','care','train'].includes(action))throw new Error('未知的伙伴互动。');
  const mon=next.队伍?.find(item=>item.uid===payload.uid);
  if(!mon)throw new Error('只能与当前队伍中的伙伴互动。');
  if(action==='train'&&mon.当前HP<=0)throw new Error('倒下的宝可梦不能参加练习。');
  if(bond.上次羁绊增长故事轮次===storyTurn)throw new Error('本故事回合已经增加过羁绊。');
  const mode=MODES[action]?.[payload.mode];
  if(!mode)throw new Error('未知的伙伴互动方式。');
  const record=bond.伙伴[mon.uid];
  if(!gainTrust(next,mon.uid,storyTurn,mode.gain,mode.mood,mode.memory,mode.clue))throw new Error('本故事回合已经增加过羁绊。');
  return next;
}

function prompt(world, storyTurn) {
  const bond=world?.羁绊;
  if(!bond?.伙伴)return '';
  const current=Number.isSafeInteger(storyTurn)?storyTurn:Number.MAX_SAFE_INTEGER;
  const roster=(world.队伍||[]).map(mon=>{
    const record=bond.伙伴[mon.uid];if(!record)return null;
    const memories=record.共同记忆.slice(-3).map(memory=>memory.事件);
    const clues=bond.短期线索.filter(clue=>clue.UID===mon.uid&&clue.到期故事轮次>=current).map(clue=>clue.内容);
    return {uid:mon.uid,name:mon.昵称,trust:record.信赖,mood:record.心情,
      benefits:benefitsFor(record),memories,clues};
  }).filter(Boolean);
  if(!roster.length)return '';
  return '【同伴羁绊叙事提示】羁绊信赖是本作自定义辅助规则，与第三世代0—255亲密度分开；效果受设置中的bondBattleEffects开关控制。可以叙述真实规则：战后EXP档位加成，露营恢复存活伙伴HP/PP；启用时信赖60—99让普通命中检定准确率乘0.97，100乘0.95；信赖80起普通攻击要害等级+1。不得写成数值之外的临时命中、闪避或伤害结果，不得声称影响必中、自身招式、一击必杀或绕过Battle Armor/Shell Armor；不能改招式、进化条件或训练家决定。紧张时可先留出空间、以目光或轻声回应；安心或愉快时可用熟悉的小动作表达亲近；疲惫或受伤经历应循序恢复，不要瞬间治愈。以下信赖、档位和共同记忆均以MVU为准。\n'+JSON.stringify(roster).slice(0,3000);
}

module.exports={ensure,validate,options,apply,prompt,view,benefitsFor,tierFor,onBattleResult,TRUST_TIERS,MAX_MEMORIES};
