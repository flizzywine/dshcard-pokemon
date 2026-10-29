'use strict';

const campaign = require('./story-campaign.cjs');
const storyEvents = require('./kanto-story-events.cjs');

const MAX_TURNS = 12;
const clone = value => structuredClone(value);
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);

function cleanState(world, create = false) {
  if (!isObject(world?.剧情)) {
    if (!create) return null;
    world.剧情 = {};
  }
  const state = isObject(world.剧情.对话互动) ? world.剧情.对话互动 : create ? (world.剧情.对话互动 = {}) : null;
  if (!state) return null;
  state.version = 1;
  const focus = state.focus;
  if (!isObject(focus) || !['event', 'chapter', 'prologue'].includes(focus.kind) ||
      typeof focus.id !== 'string' || !Number.isSafeInteger(focus.turns) || focus.turns < 0 || focus.turns > MAX_TURNS ||
      !Number.isSafeInteger(focus.beat) || focus.beat < 0 || focus.beat > MAX_TURNS || !Number.isSafeInteger(focus.startedTurn) || focus.startedTurn < 0 ||
      !Number.isSafeInteger(focus.lastTurn) || focus.lastTurn < 0 || typeof focus.node !== 'string') {
    state.focus = null;
  } else {
    state.focus = {kind:focus.kind,id:focus.id,node:focus.node,startedTurn:focus.startedTurn,lastTurn:focus.lastTurn,turns:focus.turns,beat:focus.beat};
  }
  return state;
}
function stateFor(world) { return cleanState(world, true); }
function ensure(world) { cleanState(world, false); return world; }

function locate(world, kind, id) {
  const node = world?.地图?.节点;
  if (kind === 'event') {
    const scene = storyEvents.view(world).events.find(row => row.id === id);
    return scene?.status === 'available' && node ? {kind,id,node,actor:scene.actor || scene.speaker,title:scene.title,conversation:scene.conversation} : null;
  }
  const view = campaign.view(world);
  if (kind === 'prologue') {
    const scene = view.phase === 'prologue' && view.scene?.id === id ? view.scene : null;
    return scene && node === scene.location ? {kind,id,node,actor:scene.actor,title:scene.title,conversation:scene.conversation} : null;
  }
  if (kind === 'chapter') {
    const scene = view.phase === 'chapter' && view.scene?.id === id ? view.scene : null;
    return scene && node === scene.location ? {kind,id,node,actor:scene.actor,title:scene.title,conversation:scene.conversation} : null;
  }
  return null;
}

function resolve(world, focus) {
  if (!focus || focus.node !== world?.地图?.节点) return null;
  return locate(world, focus.kind, focus.id);
}

function begin(world, target, storyTurn = world?.地图?.轮次 || 0) {
  if (!isObject(target)) throw new Error('请选择一段当前开放的剧情对话。');
  const kinds = Number(typeof target.eventId === 'string') + Number(typeof target.chapterId === 'string') + Number(target.prologue === true);
  if (kinds !== 1) throw new Error('剧情对话目标无效；请指定事件、章节或序章。');
  const kind = target.eventId ? 'event' : target.chapterId ? 'chapter' : 'prologue';
  const id = kind === 'event' ? target.eventId : kind === 'chapter' ? target.chapterId : campaign.data().prologue.id;
  const resolved = locate(world, kind, id);
  if (!resolved) throw new Error('这段剧情当前不在当前位置开放；请先前往对应地点或满足前置条件。');
  const turn = Number.isSafeInteger(storyTurn) && storyTurn >= 0 ? storyTurn : 0;
  const state = stateFor(world), prior = state.focus;
  const same = prior?.kind === kind && prior.id === id && prior.node === resolved.node;
  if (!same) state.focus = {kind,id,node:resolved.node,startedTurn:turn,lastTurn:turn,turns:0,beat:0};
  else if (prior.lastTurn !== turn) prior.lastTurn = turn;
  return {focus:view(world),playerText:playerText(resolved, state.focus)};
}

function playerText(target, focus) {
  const actor = typeof target.actor === 'string' ? target.actor : target.actor?.name;
  const name = actor || '眼前的人物';
  return `我想继续和${name}聊聊${target.title}这件事，问问对方最在意什么。`;
}

function advance(world, storyTurn, input) {
  const state = cleanState(world, false), focus = state?.focus;
  if (!focus || !Number.isSafeInteger(storyTurn) || storyTurn < 0 || focus.lastTurn >= storyTurn) return false;
  const target = resolve(world, focus);
  if (!target || focus.turns >= MAX_TURNS) { state.focus = null; return false; }
  // A story turn is not automatically a conversation beat. Quiet observation,
  // unrelated narration and hypothetical questions cannot consume this focus.
  // Omitted input keeps the explicit low-level advance API backwards compatible.
  if (input !== undefined && !continuesConversation(input)) return false;
  const beatCount = Math.max(1, target.conversation?.beats?.length || 1);
  focus.turns += 1;
  focus.beat = Math.min(focus.beat + 1, beatCount);
  focus.lastTurn = storyTurn;
  if (focus.turns >= MAX_TURNS) state.focus = null;
  return true;
}

function continuesConversation(input) {
  const text=String(input||'').trim();
  if (!text || text.length>4000) return false;
  const outside=text.replace(QUOTE_SEGMENTS,'');
  if (MOVEMENT.test(outside)||ENCOUNTER.test(outside)||HEAL.test(outside)||
      /如果|假如|要是|万一|听说|据说|昨天|曾经|回忆/u.test(outside)) return false;
  return DIRECT_CUE.test(outside)||PLAYER_ADDRESS.test(outside)||
    /(?:我|我们|咱们)[^。！？\n]{0,18}(?:听(?:她|他|对方|小黄|下去)|继续听|追问|回应|回答|点头|摇头|保持沉默)/u.test(outside);
}

function clear(world) {
  const state = cleanState(world, false);
  if (!state) return false;
  const changed = state.focus !== null;
  state.focus = null;
  return changed;
}

function view(world) {
  const focus = world?.剧情?.对话互动?.focus, target = resolve(world, focus);
  if (!target) return null;
  return focusView(target,focus);
}

function focusView(target, focus) {
  const beats = Array.isArray(target.conversation?.beats) ? target.conversation.beats : [];
  const questions = Array.isArray(target.conversation?.questions) ? target.conversation.questions : [];
  return {
    kind:focus.kind,id:focus.id,node:focus.node,turns:focus.turns,beat:focus.beat,
    title:String(target.title || '').slice(0,120),
    actor:typeof target.actor === 'string' ? target.actor.slice(0,80) : String(target.actor?.name || '').slice(0,80),
    focus:String(target.conversation?.focus || '').slice(0,700),
    beatText:String(beats[focus.beat] || '').slice(0,400),
    openQuestion:String(questions[focus.beat] || '').slice(0,240),
    revisit:String(target.conversation?.revisit || '').slice(0,280),
  };
}

function preview(world, requested) {
  if (!requested) return null;
  const kinds = Number(typeof requested.eventId === 'string') + Number(typeof requested.chapterId === 'string') + Number(requested.prologue === true);
  if (kinds !== 1) return null;
  const kind = requested.eventId ? 'event' : requested.chapterId ? 'chapter' : 'prologue';
  const id = kind === 'event' ? requested.eventId : kind === 'chapter' ? requested.chapterId : campaign.data().prologue.id;
  const target = locate(world,kind,id);
  return target ? focusView(target,{kind,id,node:target.node,turns:0,beat:0,startedTurn:0,lastTurn:0}) : null;
}

function prompt(world, requested) {
  const current = preview(world,requested) || view(world);
  if (!current) return '';
  const exhausted = !current.beatText;
  return '【当前剧情互动焦点】玩家已明确选择与当前人物交谈；优先续写这一段，不切回默认事件或主线。自由输入只推进叙述，不选择分支、不结算事件、不发奖励；一轮写人物真实回应并留下停顿，不替玩家说话。'+(exhausted?'已写完预设节拍；不要循环重演，依据玩家刚才的话自由延伸当前交谈。':'当前节拍是人物可能关注的线索而不是已经发生的事实；先回应玩家的问题或拒绝，不强迫按预设发生，也不要假装跳过的节拍已发生。')+'焦点资料：' + JSON.stringify(current);
}

const DIRECT_CUE=/(?:聊聊|聊天|交谈|谈谈|询问|问问|问一问|问|打听|请教|了解)/u;
const EXCLUDED_WORDS=/(?:不要|不去|不打|不战|不想|别(?:去|打|挑战|进入|买)|不能|禁止|取消|算了|如果|假如|要是|万一|希望|以后|将来|听说|据说|有人说|他说|她说|记得|回忆|刚才|昨天|曾经|上次)/u;
const QUOTED=/["“”‘’「」『』《》]/u;
const QUOTE_SEGMENTS=/["“”‘’「」『』《》][^"“”‘’「」『』《》]*["“”‘’「」『』《》]/gu;
const PLAYER_ADDRESS=/(?:我|我们|咱们)(?:先|再|轻声|耐心|认真|直接|小声|缓缓)*(?:(?:询问|问问|问一问|请教|打听|问)([^，,。！？；;：:\n]{1,30})|(?:向|对|跟|与|和)([^，,。！？；;：:\n]{1,20})(?:交谈|询问|请教|打听|问|说|讲|聊|谈))/u;
const MOVEMENT=/(?:前往|去往|赶往|走到|移动到|返回|回到|抵达|到达|出发|动身|进入(?:城市|道路|森林|洞穴|洞窟|岛|道馆|中心))/u;
const ENCOUNTER=/(?:遇到|遇见|遭遇|捕捉|收服|开始战斗|进入战斗|开始对战|开战|应战|迎战|挑战道馆|打一场|来一场(?:对战|战斗|切磋)?|切磋|挑战训练家)/u;
const HEAL=/(?:去|前往|进入|请|帮我|给我|使用).{0,10}(?:宝可梦中心|精灵中心|乔伊小姐)|(?:恢复队伍|治疗队伍)/u;
function endedByPlayer(input) {
  const text=String(input||'').replace(QUOTE_SEGMENTS,'');
  if(/(?:如果|假如|要是|万一|会不会|会怎样|听说|据说|有人说|他说|她说|回忆|曾经)/u.test(text))return false;
  return /(?:(?:先不|暂不|暂时不|不想|不再|不)(?:再|继续)?(?:和|与|跟)?[^，,。！？；;\n]{0,16}(?:聊|交谈|说话|讨论)|(?:结束|中止)(?:这段|这次|当前)?(?:聊天|交谈|谈话|对话)|(?:和|与|跟)[^，,。！？；;\n]{1,16}(?:告别|道别))/u.test(text);
}
function isExcludedInput(input) {
  const text=String(input||'').trim();
  const quoted=QUOTED.test(text), outside=quoted?text.replace(QUOTE_SEGMENTS,''):text;
  // Quoted words describe dialogue, not committed movement or combat. Only
  // an explicit first-person speaking action may bind an actor from outside
  // the quotation; pure quotes and third-party speech stay unbound.
  return !text || text.length>4000 || (quoted&&!PLAYER_ADDRESS.test(outside)) || EXCLUDED_WORDS.test(outside) || MOVEMENT.test(outside) || ENCOUNTER.test(outside) || HEAL.test(outside);
}

function currentTargets(world) {
  const targets=[];
  for(const scene of storyEvents.view(world).events||[]) if(scene.status==='available') targets.push({kind:'event',id:scene.id,title:scene.title,actors:[scene.actor,scene.speaker].filter(Boolean)});
  const active=campaign.view(world);
  if(active.scene&&(active.phase==='prologue'||active.phase==='chapter')){
    targets.push({kind:active.phase==='prologue'?'prologue':'chapter',id:active.scene.id,title:active.scene.title,
      actors:(active.scene.speakers||[]).map(person=>person.name).filter(Boolean)});
  }
  return targets;
}
function actorAliases(name) {
  const value=String(name||'').replace(/\s+/gu,'');
  const bare=value.replace(/[（(](?:特别篇|劲敌|冠军|火箭队)?[）)]/gu,'');
  return [...new Set([value,bare].filter(alias=>alias.length>=2))];
}
function detect(world,input) {
  const text=String(input||'').trim();
  const quoted=QUOTED.test(text),outside=quoted?text.replace(QUOTE_SEGMENTS,''):text;
  const addressed=quoted?PLAYER_ADDRESS.exec(outside):null, subject=quoted?(addressed?.[1]||addressed?.[2]||''):outside;
  if(isExcludedInput(text)||(!DIRECT_CUE.test(outside)&&!addressed)||world?.战斗?.状态==='active'||world?.战斗?.状态==='pending')return null;
  const targets=currentTargets(world);
  const titleMatches=targets.filter(target=>typeof target.title==='string'&&target.title.length>=3&&subject.includes(target.title));
  if(titleMatches.length===1)return titleMatches[0].kind==='event'?{eventId:titleMatches[0].id}:titleMatches[0].kind==='chapter'?{chapterId:titleMatches[0].id}:{prologue:true};
  if(titleMatches.length>1)return null;
  const actorMatches=targets.filter(target=>target.actors.some(actor=>actorAliases(actor).some(alias=>subject.includes(alias))));
  if(actorMatches.length!==1)return null;
  const target=actorMatches[0];
  return target.kind==='event'?{eventId:target.id}:target.kind==='chapter'?{chapterId:target.id}:{prologue:true};
}

function prune(world) {
  const focus = world?.剧情?.对话互动?.focus;
  if (focus && !resolve(world,focus)) return clear(world);
  return false;
}

module.exports = {MAX_TURNS,ensure,locate,begin,advance,clear,view,preview,prompt,prune,detect,isExcludedInput,endedByPlayer};
