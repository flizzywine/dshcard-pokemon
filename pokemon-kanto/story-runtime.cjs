'use strict';
const mvu = require('./mvu.cjs');
const {createHash}=require('node:crypto');
const scenes = require('./scenes.cjs');
const {catalog} = require('./engine.cjs');
const {parseStoryIntent,nonAction,encounterTarget,trainerNameMention} = require('./story-intents.cjs');
const {shopFor} = require('./progression-rules.cjs');
const quests = require('./npc-quests.cjs');
const specials = require('./special-encounters.cjs');
const starterConfig = require('./starter-config.cjs');
const classicServices=require('./classic-services.cjs');
const wildEncounters=require('./wild-encounter-adapter.cjs');
const storyConversation=require('./story-conversation.cjs');
const locations = scenes.locationsView();
const names = new Map(catalog.species.map(mon=>[mon.id,mon.name]));

function planAction(world, action, payload={}) {
  if(world.战斗?.状态==='active')throw Error('请先完成正在进行的战斗。');
  if(action==='story-converse'){
    const target={...(typeof payload.eventId==='string'?{eventId:payload.eventId}:{}),...(typeof payload.chapterId==='string'?{chapterId:payload.chapterId}:{}),...(payload.prologue===true?{prologue:true}:{})};
    const preview=storyConversation.begin(structuredClone(world),target,world.地图?.轮次||0);
    return {action,payload:target,playerText:preview.playerText};
  }
  if(action==='quest-inquire'){
    if(!quests.generationContext(world).eligible)throw Error('请在城镇中完成当前遭遇后，再询问当地委托。');
    return {action,payload:{},playerText:`我在${world.地图.地点}和当地居民聊起近况，问问有没有需要训练家和宝可梦一起帮忙的事情。`};
  }
  if(action==='visit-shop'){
    if(!shopFor(world).available)throw Error('这里没有城镇商店。');
    return {action,payload:{},playerText:`我走进${world.地图.地点}的商店，向店员询问这里出售的物品。`};
  }
  if(action==='buy'){
    const item=require('./public/data/items.json').find(entry=>entry.id===payload.item);
    const count=Math.max(1,Math.min(99,Number(payload.count)||1));
    if(!item||!shopFor(world).items.includes(item.id))throw Error(`这里没有出售${item?.name||'这件物品'}。`);
    return {action,payload:{item:item.id,count},playerText:`我在${world.地图.地点}购买${count}份${item.name}。`};
  }
  if(action==='trainer-battle'&&payload.trainerName)return {action,payload:{trainerName:String(payload.trainerName)}};
  if(action==='wild'){
    const node=locations.find(item=>item.id===world.地图.节点);
    if(!node||!['route','cave'].includes(node.kind)||world.战斗.状态!=='finished')throw Error('请在野外且当前遭遇结束后探索。');
    const id=Number(payload.speciesId)||undefined,scripted=payload.scripted===true;
    const method=payload.method||'auto';
    if(scripted&&(!id||[144,145,146,150,151].includes(id)))throw Error('剧情指定遭遇仅支持关都普通野生宝可梦。');
    if(id&&!scripted&&!wildEncounters.habitat(world,node.id,method)?.species.includes(id))throw Error('这种宝可梦当前不能从本版本的这片野外触发。');
    return {action,payload:{...(id?{speciesId:id}:{}),...(scripted?{scripted:true}:{}),method,start:true},playerText:`我在${node.name}探索${method==='water'?'附近的水面':id?'，遇见一只'+names.get(id):'附近的草丛或洞穴'}，准备与野生宝可梦对战。`};
  }
  if(action==='travel'){
    const node=locations.find(item=>item.id===payload.node);
    if(!node)throw Error('地图上没有这个目的地。');
    if(world.战斗?.状态!=='finished')throw Error('请先完成本轮战斗，再移动地图。');
    return {action,payload:{node:node.id},playerText:`我和伙伴从${world.地图.地点}出发，沿着道路前往${node.name}。`};
  }
  const option=scenes.applyTheaterChoice(world,action,payload),args=option.payload||{};
  if(action==='starter'&&payload.starterOptions)args.starterOptions=starterConfig.validateOptions(payload.starterOptions);
  const node=locations.find(item=>item.id===args.node);
  const partner=world.队伍?.find(mon=>mon.uid===args.uid)?.昵称||'伙伴';
  const quest=quests.definitions(world).find(item=>item.id===args.questId);
  const special=specials.definitions().find(item=>item.id===args.encounterId);
  const texts={starter:`我选择${names.get(args.id)}作为最初的伙伴，接过大木博士递来的精灵球。`,
    camp:`我和伙伴在${world.地图.地点}寻找安全的营地，停下来露营休息，照顾大家并留意彼此的习惯。`,
    bond:`我放慢脚步，和${partner}聊聊，耐心等它用自己的方式回应。`,
    care:`我仔细照料${partner}，检查它是否疲惫或不舒服，留出让它安心的时间。`,
    train:`我和${partner}练习配合，从熟悉的手势和节奏开始，不急着挑战更强的对手。`,
    'quest-accept':`我向${quest?.npcName||'委托人'}接取委托：${quest?.title||'当地的委托'}，仔细确认需要完成的事情和约定的报酬。`,
    'quest-turn-in':`我回到${quest?.npcName||'委托人'}面前，交付委托：${quest?.title||'当地的委托'}，请对方核对我完成的事情。`,
    travel:`我和伙伴从${world.地图.地点}出发，沿着道路前往${node?.name||'相邻地点'}。`,
    heal:`我带伙伴走进${world.地图.地点}的宝可梦中心，请乔伊小姐帮大家恢复体力。`,
    talk:`我在${world.地图.地点}停下脚步，和附近的居民聊聊这里的生活与旅途。`,
    explore:`我和伙伴在${world.地图.地点}继续探索，留意草丛、脚步声和野生宝可梦的动静。`,
    legendary:`我和伙伴在${world.地图.地点}循着线索调查${names.get(args.id)}的踪迹，谨慎靠近并准备应战。`,
    'special-battle':`我在${world.地图.地点}走近${special?.trainer||'眼前的训练家'}，回应这场挑战：${special?.title||'特别对战'}。在正式交手前，我先确认伙伴的状态。`,
    'trainer-battle':`我和${world.地图.地点}的${args.trainerName||'训练家'}打招呼，提出进行一场友谊对战。`,
    'challenge-gym':`我走进${world.地图.地点}的道馆，向${catalog.gyms[args.gym]?.name||'馆主'}正式提出徽章挑战。`,
    'start-battle':`我握住伙伴的精灵球，向${world.遭遇?.训练家||'眼前的对手'}应战。`,
    'avoid-encounter':`我放轻脚步，和伙伴离开草丛，暂时不惊动这只野生宝可梦。`};
  return {action,payload:args,playerText:texts[action]||option.label};
}

function applyAction(variables, action, payload={}, turn=1) {
  if(action==='narrative-trainer'){
    if(typeof payload.trainerName!=='string'||!payload.trainerName||payload.trainerName.length>20)throw Error('剧情没有提供可验证的训练家。');
    const ids=payload.speciesIds|| (payload.speciesId?[payload.speciesId]:[]);
    if(!Array.isArray(ids)||ids.length>6||ids.some(id=>!catalog.species.some(mon=>mon.id===id)))throw Error('剧情中的宝可梦无法识别。');
    const next=applyAction(variables,'trainer-battle',{trainerName:payload.trainerName},turn),world=rootWorld(next);
    const level=Math.max(3,Math.min(70,Math.max(world.遭遇.队伍[0]?.等级||5,...(world.队伍||[]).map(mon=>mon.等级||1),5+(world.训练家.徽章?.length||0)*5)));
    const stageIds=ids.length?ids:storyTrainerRoster(world,payload.trainerName);
    if(stageIds?.length)world.遭遇.队伍=stageIds.map((id,i)=>mvu.makeMon(id,level,`story-trainer-${turn}-${i}`));
    else world.遭遇.队伍=world.遭遇.队伍.map((mon,i)=>mvu.makeMon(mon.图鉴编号,level,`story-trainer-${turn}-${i}`));
    world.遭遇.剧情来源={故事轮次:turn,角色:payload.trainerName,...(payload.speciesId?{物种:payload.speciesId}:{})};
    if(payload.eventKey)world.剧情.叙事对战回执=[...new Set([...(world.剧情.叙事对战回执||[]),payload.eventKey])].slice(-50);
    return next;
  }
  // Battle-marker recovery can return a user-authored ordered sequence (for
  // example, travel to a named habitat and then encounter a specific species).
  // Apply it to a private snapshot so an invalid later step never leaks a
  // partial map move or other state change to the caller.
  if(action==='sequence'){
    const steps=payload?.actions;
    if(!Array.isArray(steps)||!steps.length)throw Error('剧情行动序列为空或格式无效。');
    let next=structuredClone(variables);
    for(const step of steps){
      if(!step||typeof step.action!=='string')throw Error('剧情行动序列包含无效步骤。');
      next=applyAction(next,step.action,step.payload||{},turn);
    }
    mvu.validateMvu(next);return next;
  }
  // A recovered named encounter may carry the habitat location described by
  // the story. Move through the legal route first, then create the encounter
  // there; do not silently substitute a random encounter from the old node.
  if(action==='wild'&&payload?.node){
    let arrived=variables;
    if(rootWorld(variables).地图.节点!==payload.node)arrived=travelByLegalRoute(variables,payload.node);
    const {node:_node,...encounterPayload}=payload;
    return applyAction(arrived,'wild',encounterPayload,turn);
  }
  const plan=planAction(variables.stat_data.宝可梦,action,payload);
  let next=structuredClone(variables),world=next.stat_data.宝可梦;
  if(action==='visit-shop')world.剧情.剧场={...(world.剧情.剧场||{}),地点:world.地图.节点,轮次:world.地图.轮次,最近动作:action,角色:'gentleman',对白:'店员：欢迎光临，看看本店的货架吧。'};
  else if(action==='quest-inquire')world.剧情.剧场={...(world.剧情.剧场||{}),地点:world.地图.节点,轮次:world.地图.轮次,最近动作:action,对白:'你和当地人聊起了旅途，留意有哪些力所能及的事情。'};
  else if(action==='travel')next=travelByLegalRoute(next,plan.payload.node);
  else if(action==='buy')next=mvu.theaterAction(next,'buy',plan.payload);
  else if(action==='trainer-battle'){
    next=mvu.theaterAction(next,action,{...plan.payload,storyTurn:turn});
    const world=rootWorld(next),name=String(plan.payload.trainerName||'').trim();
    if(name&&world.遭遇?.类型==='trainer'){world.遭遇.训练家=name;world.战斗.摘要=`${name}向你发起了友谊挑战。`;}
  }
  else if(action!=='start-battle')next=mvu.theaterAction(next,action,{...plan.payload,storyTurn:turn});
  world=next.stat_data.宝可梦;
  if(['wild','explore','legendary','trainer-battle','challenge-gym','special-battle','start-battle'].includes(action)&&world.战斗.状态==='pending')world.战斗.剧情入场=true;
  mvu.validateMvu(next);return next;
}

function travelByLegalRoute(variables,destinationId){
  const origin=variables.stat_data.宝可梦.地图.节点;
  if(origin===destinationId)throw Error('你已经在这个地点。');
  const queue=[{variables:structuredClone(variables),path:[]}],seen=new Set([origin]);
  let firstGateReason='',destinationGateReason='';
  while(queue.length){
    const current=queue.shift(),world=current.variables.stat_data.宝可梦,node=locations.find(item=>item.id===world.地图.节点);
    if(!node)continue;
    for(const nextId of node.links||[]){
      // A successfully visited node already has its shortest path queued.
      // Skip the expensive world clone/validation for back-edges.
      if(seen.has(nextId))continue;
      let moved;
      try{moved=mvu.travel(current.variables,nextId);}catch(error){const reason=String(error.message||'这条道路目前无法通行。');if(!firstGateReason)firstGateReason=reason;if(nextId===destinationId&&!destinationGateReason)destinationGateReason=reason;continue;}
      const path=[...current.path,nextId];
      if(nextId===destinationId)return moved;
      seen.add(nextId);queue.push({variables:moved,path});
    }
  }
  throw Error(destinationGateReason||firstGateReason||`从${variables.stat_data.宝可梦.地图.地点}没有已开放的合法路线可前往${locations.find(item=>item.id===destinationId)?.name||'目的地'}。`);
}

function rootWorld(variables){return variables.stat_data.宝可梦;}
function actionClauses(input){return String(input||'').split(/(?:[，,；;\n]+|然后|接着|随后|之后)/u).map(text=>text.trim()).filter(Boolean).slice(0,12);}
function finishStoryAction(variables,input,turn) {
  const original=variables,base=structuredClone(variables),initial=rootWorld(base),pending=initial.剧情?.待执行行动;
  delete initial.剧情.待执行行动;
  let plans=[];
  const quotedConversation=typeof input==='string'&&/["“”‘’「」『』《》]/u.test(input)&&storyConversation.detect(initial,input);
  if(pending&&String(pending.playerText).trim()===String(input||'').trim()&&pending.node===initial.地图.节点&&turn>pending.createdTurn)plans=[pending];
  else if(typeof input==='string'&&(!nonAction(input)||quotedConversation)){
    // Keep addressed dialogue intact even if its quotation contains commas.
    const clauses=quotedConversation?[input]:actionClauses(input);
    if(clauses.length>1){
      let scratch=structuredClone(base);const planned=[];
      for(const clause of clauses){
        const candidate=parseStoryIntent(clause,rootWorld(scratch),{locations,catalog});
        if(!candidate)continue;
        if(!candidate.action){
          const failed=structuredClone(original);rootWorld(failed).剧情.行动提示=candidate.reason||'';return failed;
        }
        const steps=candidate.action==='sequence'?candidate.payload.actions:[candidate];
        for(const step of steps){
          try{scratch=applyAction(scratch,step.action,step.payload,turn);planned.push(step);}
          catch(error){const failed=structuredClone(original);rootWorld(failed).剧情.行动提示=String(error.message||'当前剧情无法执行这次行动。');return failed;}
        }
      }
      plans=planned;
    }else{
      const candidate=parseStoryIntent(input,initial,{locations,catalog});
      if(candidate&&!candidate.action){const failed=structuredClone(original);rootWorld(failed).剧情.行动提示=candidate.reason||'';return failed;}
      if(candidate)plans=candidate.action==='sequence'?candidate.payload.actions:[candidate];
    }
  }
  if(!plans.length){if(typeof input==='string'&&input.trim()){
    if(storyConversation.endedByPlayer(input))storyConversation.clear(initial);
    else storyConversation.advance(initial,turn,input);
  }base.stat_data.宝可梦=classicServices.advanceDaycareTurn(initial,{storyTurn:turn});return base;}
  let next=structuredClone(base),last=null;
  try{
    for(let plan of plans){
      if(plan.action==='starter'){const chosen=starterConfig.parseChoice(input);if(chosen?.id===plan.payload.id)plan={...plan,payload:{...plan.payload,starterOptions:chosen.options}};}
      next=applyAction(next,plan.action,plan.payload,turn);last=plan;
    }
    const world=rootWorld(next);
    // Existing host schemas can require the id introduced by a queued action.
    // Clear its value for direct input instead of deleting the required key.
    const previousAction=world.剧情.最近行动;
    world.剧情.最近行动={action:last?.action||'sequence',turn,text:String(input).slice(0,1200),...(pending?.id?{id:pending.id}:Object.hasOwn(previousAction||{},'id')?{id:''}:{})};
    world.剧情.行动提示='';
    if(last?.action==='quest-inquire'&&world.委托?.上次生成故事轮次!==turn){
      const context=quests.generationContext(world);
      if(context.eligible){
        const list=quests.localGeneratedCandidates(world,{storyTurn:turn});
        next.stat_data.宝可梦=quests.addGeneratedOffers(world,list,{storyTurn:turn});
        const updated=rootWorld(next);updated.委托.上次生成故事轮次=turn;
        updated.剧情.委托发布={npcName:context.npc.name,npcId:context.npc.id,turn,text:list.map(item=>item.title+'：'+item.description).join('\n')};
      }
    }
    next.stat_data.宝可梦=classicServices.advanceDaycareTurn(rootWorld(next),{storyTurn:turn});
    return next;
  }catch(error){
    const failed=structuredClone(original);rootWorld(failed).剧情.行动提示=String(error.message||'当前剧情无法执行这次行动。');return failed;
  }
}

function narrativeEncounter(variables,input,text){
  const world=variables.stat_data.宝可梦,node=locations.find(item=>item.id===world.地图?.节点);
  if(world.城市设施?.safari?.status==='active')return null;
  if(!world.剧情?.初始御三家已选||!node||/(?:不要|不去|不打|不战|不想|别(?:去|打|挑战|进入)|暂不|拒绝|取消|算了|如果|假如|要是|听说|据说|有人说|他说|她说)/u.test(String(input||'')))return null;
  const source=String(text||'').replace(/<initvar\b[^>]*>[\s\S]*?<\/initvar>/gi,'').replace(/<updatevariable\b[^>]*>[\s\S]*?<\/updatevariable>/gi,'').replace(/```[\s\S]*?```/g,'');
  const marker=/【进入本轮战斗】|^\s*进入本轮战斗\s*$/mu.exec(source);
  if(!marker)return null;
  const prose=source.slice(0,marker.index);
  // A settled scene may have walked into a named adjacent habitat. Explanations
  // about distant routes do not move the player; the final scene must show travel.
  const scene=prose.split(/\n\s*(?:——+|—{2,}|\*{3,}|-{3,})\s*\n/u).at(-1).slice(-2200);
  const movement=(scene.match(/走了|走出|走进|踏进|沿着|再往前|向北|草丛|洞口|土路|隧道/gu)||[]).length>=2;
  const nodes=[node,...(movement?locations.filter(item=>node.links?.includes(item.id)&&prose.includes(item.name)&&world.训练家.徽章.length>=(item.requiresBadges||0)):[])].filter(item=>['route','cave'].includes(item.kind));
  const explicit=encounterTarget(String(input||''),catalog),legendary=new Set([144,145,146,150,151]);
  if(explicit){
    if(legendary.has(explicit.id)||!nodes.length)return null;
    const spoken=speciesMentionInText(scene,explicit.id);
    // The player's named Pokémon is authoritative. If the generated story
    // names a different one, leave the scene unsettled rather than silently
    // substituting a random opponent; direct recovery can use the input.
    if(!spoken)return null;
    const location=nodes.find(item=>item.id===spoken.node)||nodes[0];
    return {type:'wild',id:explicit.id,speciesId:explicit.id,node:location.id,scripted:true};
  }
  const declared=parseStoryIntent(String(input||''),world,{locations,catalog});
  if(declared?.action==='trainer-battle')return {type:'trainer',trainerName:declared.payload.trainerName||'训练家'};
  if(declared?.action==='challenge-gym'||declared?.action==='special-battle')return null;
  const found=[];
  for(const mon of catalog.species){
    if([144,145,146,150,151].includes(mon.id))continue;
    const habitat=nodes.find(item=>wildEncounters.habitat(world,item.id)?.species.includes(mon.id));if(!habitat)continue;
    const pattern=new RegExp('(?:一只|野生的?|那只|这只|对面的?|眼前的?)\\s*'+mon.name,'gu');
    for(const match of prose.matchAll(pattern)){
      const prefix=prose.slice(Math.max(0,match.index-18),match.index).split(/[，,。！？\n]/u).at(-1);
      if(/(?:我的|你的|伙伴|收服的|队伍里的|回忆|听说|研究|记录|寻找|捕获)[^。！？\n]{0,8}$/u.test(prefix))continue;
      found.push({type:'wild',id:mon.id,speciesId:mon.id,index:match.index,node:habitat.id,scripted:false});
    }
  }
  const target=found.sort((a,b)=>b.index-a.index)[0];
  if(target)return target;
  const trainerName=trainerNameMention(prose),challengeCue=/(?:挑战|切磋|对战|友谊赛|比试|邀请.{0,6}(?:对战|切磋)|发起.{0,6}挑战)/u.test(prose);
  return trainerName&&challengeCue?{type:'trainer',trainerName}:null;
}

function describedExchange(world,scene){
  if(/(?:对战|战斗|比试)(?:已经|已|就此)?(?:结束|取消|作罢)|胜负已分|握手言和/u.test(scene.slice(-600)))return null;
  const commands=[...scene.matchAll(/^\s*@bubble:[^|\r\n]+\|([^|\r\n]+)\|[^|\r\n]*\|\[([^\]\r\n]*)\]/gmu)]
    .filter(row=>/(?:别躲|你先|用.{0,12}(?:挡|攻)|使出|迎上去|接下来.{0,8}(?:招|攻击))/u.test(row[2]));
  const ownIds=new Set((world.队伍||[]).map(mon=>mon.图鉴编号));
  const candidates=[...new Set(commands.map(row=>row[1].trim()))].filter(name=>name&&name.length<=20&&name!==world.训练家?.姓名&&!catalog.species.some(mon=>mon.name===name));
  if(candidates.length!==1||!/(?:对手|对面|藤鞭|火花|攻击|撞击|爪|招式)/u.test(scene)||!/(?:迎|挡|躲|冲|扑|伸|收回|划过|碰|蓄)/u.test(scene))return null;
  const name=candidates[0],escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const mentioned=catalog.species.filter(mon=>scene.includes(mon.name));
  if(!mentioned.some(mon=>ownIds.has(mon.id)))return null;
  const foreign=mentioned.filter(mon=>!ownIds.has(mon.id));
  // An explicitly associated opponent may have the same species as ours.
  // Only use the species-difference heuristic when ownership is ambiguous.
  const associated=mentioned.filter(mon=>new RegExp(`(?:${mon.name}[^。！？\\n]{0,18}(?:从|在|是|属于)?${escaped}(?:的)?(?:脚边|身边|身旁)|${escaped}[^。！？\\n]{0,18}(?:的|放出|派出)${mon.name})`,'u').test(scene));
  const ids=associated.length?associated.map(mon=>mon.id):storyTrainerRoster(world,name)?.filter(id=>foreign.some(mon=>mon.id===id));
  if(!ids?.length)return null;
  return {action:'narrative-trainer',payload:{trainerName:name,...(ids.length===1?{speciesId:ids[0]}:{speciesIds:ids})}};
}

function naturalTrainerInvitation(variables,input,text,selectedQuote){
  const world=variables?.stat_data?.宝可梦;
  if(!world?.剧情?.初始御三家已选||world.战斗?.状态!=='finished')return null;
  const inputClause=String(input||'').split(/[。！？；;\n]/u).filter(Boolean).at(-1)||'';
  if(/不要|不打|不战|拒绝|取消|算了|如果|假如|要是/u.test(inputClause))return null;
  const scene=String(text||'').replace(/<initvar\b[^>]*>[\s\S]*?<\/initvar>/gi,'').replace(/<updatevariable\b[^>]*>[\s\S]*?<\/updatevariable>/gi,'').split(/\n\s*(?:——+|—{2,}|\*{3,}|-{3,})\s*\n/u).at(-1).slice(-2200);
  const invitePattern=/(?:真打(?:一个|一场)|来(?:一场|打一场|一局)(?:.{0,8})?(?:对战|战斗|切磋)|(?:和我|跟我|与你|和你).{0,8}(?:对战|打一场|切磋))/u;
  const bubbles=[...scene.matchAll(/^\s*@bubble:([^|\r\n]+)\|([^|\r\n]+)\|([^|\r\n]*)\|\[([^\]\r\n]*)\]/gmu)]
    .filter(match=>(!selectedQuote||match[4].trim()===selectedQuote)&&invitePattern.test(match[4]));
  if(bubbles.length>1)return null;
  const invitations=[...scene.matchAll(/[“「『"＂][^”」』"＂\n]{0,100}(?:真打(?:一个|一场)|来(?:一场|打一场|一局)(?:.{0,8})?(?:对战|战斗|切磋)|(?:和我|跟我|与你|和你).{0,8}(?:对战|打一场|切磋))[^”」』"＂\n]*[”」』"＂]/gu)];
  const preparedPattern=/([\u4e00-\u9fa5]{2,4}?)(?:准备|摆出|拿出|握住)[^。！？\r\n]{0,35}(?:与你|和你|跟你|对你)[^。！？\r\n]{0,12}(?:对战|战斗|交手)/u;
  const prepared=selectedQuote&&!/[“”「」『』"＂]/u.test(selectedQuote)&&preparedPattern.test(selectedQuote)?scene.indexOf(selectedQuote):-1;
  // Narration can already be describing the opening exchange without a formal
  // invitation. Require a named trainer actively directing a named Pokémon and
  // an explicit opponent or combat action in the same current scene.
  const ongoingPattern=/([\u4e00-\u9fa5]{2,4}?)(?:指挥|命令|操纵|让|叫)([^。！？\n]{0,25})(?:对战|交手|攻击|进攻|使出|使用|迎战|发起攻击)/u;
  const ongoing=ongoingPattern.exec(scene);
  const ongoingSpecies=ongoing&&catalog.species.filter(mon=>ongoing[2].trimStart().startsWith(mon.name));
  const ongoingAllowed=ongoing&&ongoingSpecies.length===1&&(!selectedQuote||scene.includes(selectedQuote));
  const invitation=bubbles[0]||invitations.find(match=>!selectedQuote||match[0]===selectedQuote)||(prepared>=0?Object.assign([selectedQuote],{index:prepared}):null)||(ongoingAllowed?ongoing:null);if(!invitation)return selectedQuote?null:describedExchange(world,scene);
  const before=scene.slice(Math.max(0,invitation.index-180),invitation.index);
  const spoken=bubbles.length?bubbles[0][4]:invitation[0];
  const after=scene.slice(invitation.index+invitation[0].length);
  if(/(?:拒绝(?:了)?(?:这场|对战|挑战|邀请)|(?:对战|战斗|比试|挑战)(?:已经|已|就此)?(?:结束|取消|作罢)|(?:胜负已分|战斗结束|对战结束))/u.test(after))return null;
  if(/如果|假如|要是|拒绝|不(?:会|想|能|要|再)?(?:打|战|对战|挑战)/u.test(spoken)||/(?:回忆|回想|曾经|听说|据说)[^。！？\n]{0,24}(?:说|道|喊|问|[：:])\s*$/u.test(before))return null;
  const speaker=bubbles.length?bubbles[0][2].trim():invitation===ongoing?ongoing[1]:prepared>=0?preparedPattern.exec(selectedQuote)?.[1]:/(?:^|[。！？\n])\s*(?:训练家|少年|少女)?\s*([\u4e00-\u9fa5]{2,4}?)(?:笑着|认真地|兴奋地|微笑着|抬头|转身|开口)?(?:说|说道|喊|问|道|邀请)[：:]?\s*$/u.exec(before)?.[1]
    || /(叶子)(?:[^。！？\n]{0,45})$/u.exec(before)?.[1];
  if(!speaker||/^(?:她|他|你|我|我们|他们|对方|那个|一位|一个|少年|少女|训练家|笑着|然后|接着|突然|她笑着|他笑着)/u.test(speaker))return null;
  const escapedSpeaker=speaker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const associated=catalog.species.filter(mon=>{
    const name=mon.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return new RegExp(`(?:${escapedSpeaker}[^。！？\\n]{0,30}(?:的|脚边|身边|派出|放出|伙伴)[^。！？\\n]{0,12}${name}|${name}[^。！？\\n]{0,20}(?:是|属于)${escapedSpeaker})`,'u').test(scene);
  });
  if(associated.length>6)return null;
  if(invitation===ongoing&&!associated.some(mon=>mon.id===ongoingSpecies[0].id))associated.unshift(ongoingSpecies[0]);
  const speciesId=associated[0]?.id;
  return {action:'narrative-trainer',payload:{trainerName:speaker,...(associated.length>1?{speciesIds:associated.map(mon=>mon.id)}:speciesId?{speciesId}:{})}};
}

// Leaf is a project adaptation; existing named encounters and gym data remain
// authoritative where available. These choices only affect a new invitation.
function storyTrainerRoster(world,speaker){
  const badges=world.训练家?.徽章?.length||0;
  const special=specials.definitions().find(item=>item.trainer===speaker&&item.location===world.地图?.节点&&badges>=(item.requiresBadges||0));
  if(special)return specials.team(world,special.id).map(mon=>mon.speciesId);
  const gym=catalog.gyms.find(item=>item.name===speaker);if(gym)return gym.ids.slice();
  const elite={科拿:[87,91,80,124,131],希巴:[95,107,106,95,68],菊子:[94,42,93,24,94],阿渡:[130,148,148,142,149],冠军小茂:[18,65,112,103,130,6]};
  if(Object.hasOwn(elite,speaker))return elite[speaker].slice();
  if(speaker==='叶子')return badges>=6?[18,38,134,3]:badges>=3?[17,37,2]:badges>=1?[16,2]:[1];
  if(speaker==='小茂'){
    const base={1:4,4:7,7:1}[world.剧情?.初始御三家编号]||4;
    const starter=base+(badges>=5?2:badges>=2?1:0);
    return badges>=5?[18,65,112,starter]:badges>=2?[17,64,starter]:badges>=1?[16,starter]:[starter];
  }
  return null;
}

function speciesMentionInText(text,id){
  const match=catalog.species.find(mon=>mon.id===id);if(!match)return null;
  const namePattern=new RegExp(`(?:一只|野生的?|那只|这只|对面的?|眼前的?)\\s*${match.name}`,'u');
  if(!namePattern.test(text)&&!new RegExp(`(?:野生|草丛中|草丛里|洞口处|眼前)(?:的)?\\s*${match.name}`,'u').test(text))return null;
  const matchNode=[...locations].filter(item=>['route','cave'].includes(item.kind)&&text.includes(item.name)).at(-1);
  return {node:matchNode?.id};
}

function recoverBattleIntent(variables,input,prose){
  const world=variables?.stat_data?.宝可梦;if(!world)return null;
  const described=narrativeEncounter(variables,input,prose);
  if(described?.type==='wild')return {type:'wild',action:'wild',payload:{speciesId:described.speciesId,scripted:described.scripted===true,...(described.node?{node:described.node}:{})}};
  if(described?.type==='trainer')return {type:'trainer',action:'trainer-battle',payload:{trainerName:described.trainerName}};
  const plan=parseStoryIntent(input,world,{locations,catalog});
  if(plan?.action==='sequence')return {type:'sequence',action:'sequence',payload:plan.payload};
  if(plan?.action==='wild'||plan?.action==='trainer-battle')return {type:plan.action==='wild'?'wild':'trainer',action:plan.action,payload:plan.payload};
  if(world.战斗?.状态==='pending')return {type:'pending',action:'start-battle',payload:{}};
  return null;
}
function reconcileNarrativeEncounter(variables,input,text,turn){
  const world=variables.stat_data.宝可梦;
  if(world.战斗?.状态!=='finished')return variables;
  const target=narrativeEncounter(variables,input,text);if(!target)return variables;
  if(target.type!=='wild')return variables;
  let next=target.node===world.地图.节点?variables:travelByLegalRoute(variables,target.node);
  next=applyAction(next,'wild',{speciesId:target.id,scripted:target.scripted===true},turn);
  next.stat_data.宝可梦.战斗.剧情来源={故事轮次:turn,物种:target.id,地点:target.node};
  return next;
}
// Freeze the complete encounter at settlement time; reads never mutate it.
function reconcileEncounterOffer(variables,input,text,turn,textVersion,selectedQuote){
  const world=rootWorld(variables),requested=naturalTrainerInvitation(variables,input,text,selectedQuote);
  const prior=world.剧情?.遭遇邀约;
  // Moving without a new story version cannot relocate an existing challenge.
  if(prior&&prior.故事轮次===turn&&prior.正文版本===textVersion&&prior.地点!==world.地图.节点){
    if(prior.状态==='pending'){const next=structuredClone(variables);rootWorld(next).剧情.遭遇邀约.状态='expired';return next;}
    return variables;
  }
  if(!requested){
    const offer=world.剧情?.遭遇邀约;
    if(offer?.状态==='pending'&&(offer.正文版本!==textVersion||offer.故事轮次!==turn||offer.地点!==world.地图.节点)){
      const next=structuredClone(variables);rootWorld(next).剧情.遭遇邀约.状态='expired';return next;
    }
    return variables;
  }
  const id='offer:'+createHash('sha256').update(JSON.stringify([turn,textVersion,world.地图.节点,requested])).digest('hex');
  const existing=world.剧情?.遭遇邀约;
  if(existing?.id===id)return variables;
  const prepared=applyAction(variables,requested.action,requested.payload,turn),frozen=rootWorld(prepared);
  const next=structuredClone(variables);
  rootWorld(next).剧情.遭遇邀约={id,地点:world.地图.节点,故事轮次:turn,正文版本:textVersion,角色:requested.payload.trainerName,状态:world.剧情.叙事对战回执?.includes(id)?'resolved':'pending',遭遇:structuredClone(frozen.遭遇),战斗:structuredClone(frozen.战斗)};
  return next;
}
function acceptEncounterOffer(variables,offerId,turn,textVersion){
  const world=rootWorld(variables),offer=world.剧情?.遭遇邀约;
  if(!offer||offer.id!==offerId||offer.故事轮次!==turn||offer.正文版本!==textVersion||offer.地点!==world.地图.节点)throw Object.assign(Error('邀战已变化，请查看最新剧情。'),{code:'STALE_TURN'});
  if(offer.状态==='accepted'&&world.战斗?.状态!=='finished')return variables;
  if(offer.状态!=='pending')throw Object.assign(Error('这段邀请的对战已经处理。'),{code:'NO_PENDING_ENCOUNTER'});
  if(world.战斗?.状态!=='finished')throw Object.assign(Error('请先完成当前遭遇。'),{code:'BATTLE_ACTIVE'});
  const next=structuredClone(variables),w=rootWorld(next),row=w.剧情.遭遇邀约;
  w.地图.轮次++;w.遭遇=structuredClone(row.遭遇);w.战斗=structuredClone(row.战斗);w.战斗.轮次=w.地图.轮次;
  row.状态='accepted';w.剧情.叙事对战回执=[...new Set([...(w.剧情.叙事对战回执||[]),row.id])].slice(-50);
  mvu.validateMvu(next);return next;
}
module.exports={planAction,applyAction,finishStoryAction,reconcileNarrativeEncounter,narrativeEncounter,recoverBattleIntent,naturalTrainerInvitation,reconcileEncounterOffer,acceptEncounterOffer};
