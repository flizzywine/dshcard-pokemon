'use strict';
const scenes = require('./scenes.cjs');
const quests = require('./npc-quests.cjs');
const specials = require('./special-encounters.cjs');
const wildEncounters=require('./wild-encounter-adapter.cjs');
const storyConversation=require('./story-conversation.cjs');
const itemCatalog=require('./public/data/items.json');
const {shopFor}=require('./progression-rules.cjs');

const LEGENDARY_ENCOUNTERS = new Set([144, 145, 146, 150, 151]);
const GYM_LEADERS = ['小刚', '小霞', '马志士', '莉佳', '阿桔', '娜姿', '夏伯', '坂木'];
const HYPOTHETICAL = /如果|假如|要是|万一|将来|以后|有一天|总有一天/u;
const WISH = /希望/u;
const WISH_PRESENT = /(?:希望[^。！？；;\n]{0,16}(?:现在|马上|立刻|立即|这就|今天|今日))|(?:(?:现在|马上|立刻|立即|今天|今日)[^。！？；;\n]{0,8}希望)/u;
const NEGATION = /不要|不去|不打|不战|不挑战|不迎战|不应战|不想|别(?:去|打|挑战|进入|买)|不能|禁止|取消|算了|暂不|拒绝|不如/u;
const PAST = /记得|回忆|刚才|昨天|曾经|上次|那天|当时/u;
const REPORTED_SPEECH = /听说|据说|有人说|他说|她说/u;
const NON_ACTION = new RegExp([NEGATION.source, REPORTED_SPEECH.source, '如果', '假如', '要是'].join('|'), 'u');
const TRAINER_CLASSES=[['捕虫少年',/捕虫(?:少年|小子|男孩)?/u],['短裤小子',/短裤小子|短裤少年/u],['登山男',/登山男|登山家|攀岩者/u],['水手',/水手|船员/u],['迷你裙',/迷你裙|少女训练家/u],['训练家',/训练家|训练者|对手/u]];

function hypothetical(input) {
  const text = String(input || '');
  return HYPOTHETICAL.test(text) || (WISH.test(text) && !WISH_PRESENT.test(text));
}

// A natural-language turn is often several clauses. Negation, past narration,
// and reported speech only apply to their own clause; one negated clause must
// not suppress a later committed action (and vice versa).
function actionClauses(input) {
  return String(input || '').split(/(?:[，,；;\n]+|然后|接着|随后|之后|但是|可是|不过|而是|而(?=[要去前到往进]))/u)
    .map(text => text.trim()).filter(Boolean).slice(0, 12);
}

function nonAction(input) {
  const text = String(input || '').trim();
  if (!text || hypothetical(text)) return true;
  const quoted = /["“”‘’「」『』《》]/u.test(text);
  if (quoted) {
    if (NON_ACTION.test(text) || PAST.test(text)) return true;
    const unquoted = text.replace(/["“”‘’「」『』《》][^"“”‘’「」『』《》]*["“”‘’「」『』《》]/gu, '');
    return !/(?:我|我们|咱们)[^。！？；;\n]{0,40}(?:前往|去往|赶往|走到|移动到|返回|回到|进入|到达|抵达|来到|出发|动身|遇到|遇见|遭遇|碰到|挑战|切磋|打一场|接受挑战)/u.test(unquoted);
  }
  return actionClauses(text).every(clause => NON_ACTION.test(clause) || PAST.test(clause) || reportedMovementOnly(clause));
}

function reportedMovementOnly(text) {
  const reportPattern=/(?:说|说道|表示|建议|提醒|告诉(?:我|你)?)[^。！？；;]*(?:前往|去往|赶往|走到|移动到|返回|回到|进入|到达|抵达|来到|到了|去|到)[^。！？；;]*/u;
  const source=String(text||'');
  const hasReportedVerb=reportPattern.test(source);
  if(!hasReportedVerb)return false;
  const unquoted=source.replace(/["“”‘’「」『』《》][^"“”‘’「」『』《》]*["“”‘’「」『』《》]/gu,'');
  const reported=unquoted.replace(/(?:说|说道|表示|建议|提醒|告诉(?:我|你)?)[^。！？；;]*(?:前往|去往|赶往|走到|移动到|返回|回到|进入|到达|抵达|来到|到了|去|到)[^。！？；;]*/gu,'');
  const playerCommit=/(?:我|我们|咱们)[^。！？；;\n]{0,50}(?:前往|去往|赶往|去|走到|移动到|返回|回到|进入|到达|抵达|来到|出发|动身|听从|照做)/u;
  return !playerCommit.test(reported);
}

function normalizeName(value) {
  return String(value || '').trim().toLocaleLowerCase();
}
function trainerNameMention(text){return TRAINER_CLASSES.find(([,pattern])=>pattern.test(String(text||'')))?.[0]||null;}

function purchaseCount(input, item) {
  const source = String(input || '');
  const numberPattern = '(\\d+|[一二两三四五六七八九十]{1,3})';
  const afterVerb = new RegExp(`(?:购买|购入|买)\\s*${numberPattern}`, 'u').exec(source)?.[1];
  const itemName = [item?.name, item?.id].find(name => name && normalizeName(source).includes(normalizeName(name)));
  const itemAt = itemName ? normalizeName(source).indexOf(normalizeName(itemName)) : -1;
  const afterItem = itemAt < 0 ? null : new RegExp(`^\\s*${numberPattern}`, 'u').exec(source.slice(itemAt + itemName.length))?.[1];
  const raw = afterVerb || afterItem;
  if (!raw) return 1;
  if (/^\d+$/u.test(raw)) return Number(raw);
  const digits = {一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
  if (raw === '十') return 10;
  if (!raw.includes('十')) return digits[raw] ?? NaN;
  const parts = raw.split('十');
  if (parts.length !== 2 || (parts[0] && !digits[parts[0]]) || (parts[1] && !digits[parts[1]])) return NaN;
  return (parts[0] ? digits[parts[0]] : 1) * 10 + (parts[1] ? digits[parts[1]] : 0);
}

function speciesMention(input, catalog) {
  const species = Array.isArray(catalog?.species) ? catalog.species : [];
  const text = normalizeName(input);
  const found = [];
  for (const entry of species) {
    const id = Number(entry?.id);
    if (!Number.isInteger(id) || id < 1 || id > 151) continue;
    const names = [...new Set([entry.name, entry.english].filter(Boolean).map(String))];
    let match = null;
    for (const name of names) {
      const normalized = normalizeName(name);
      if (!normalized) continue;
      const latin = /^[a-z0-9 .'-]+$/i.test(normalized);
      const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = latin ? new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i') : new RegExp(escaped, 'i');
      const result = pattern.exec(text);
      if (result) {
        const start = result.index + (latin && !/^[a-z0-9]/i.test(result[0]) ? 1 : 0);
        const length = name.length;
        if (!match || length > match.length) match = {id, name, start, length};
      }
    }
    const number = new RegExp(`#\\s*0*${id}(?!\\d)`, 'i').exec(text);
    if (number && (!match || String(number[0]).length > match.length)) match = {id, name: `#${id}`, start: number.index, length: number[0].length};
    if (match) found.push(match);
  }
  return found.sort((a, b) => b.length - a.length || a.start - b.start)[0] || null;
}

function currentNode(world, locations) {
  return (Array.isArray(locations) ? locations : []).find(node => node?.id === world?.地图?.节点) || null;
}

function encounterTarget(input, catalog) {
  // Resolve the encounter clause, so a carried partner is not mistaken for the opponent.
  const cues = [...input.matchAll(/遇到|遇见|遭遇|碰到|碰见|发现野生|野生(?:宝可梦|精灵)?/gu)];
  const cue = cues.at(-1) || /调查|寻找|搜寻|找(?:到)?|挑战|开始战斗|进入战斗|开始对战|开战|应战/u.exec(input);
  if (!cue) return null;
  return speciesMention(input.slice(cue.index + cue[0].length).split(/[，,。;；！!？?]/u)[0], catalog);
}

function isBattleActive(world) { return world?.战斗?.状态 === 'active'; }
function hasStarter(world) { return world?.剧情?.初始御三家已选 === true; }
function result(action, payload, playerText, extra = {}) {
  return {action, payload, playerText, ...extra};
}
function refusal(playerText, reason, extra = {}) {
  return {action: null, payload: {}, playerText, reason, ...extra};
}

function travelPlan(input,locations,node){
  const verbs=[...input.matchAll(/前往|去往|赶往|走到|移动到|返回|回到|进入|到达|抵达|来到|去|到/gu)]
    .filter(match=>!(match[0]==='到'&&input[match.index-1]==='遇'));
  const verb=verbs.at(-1);if(!verb)return null;
  const after=input.slice(verb.index+verb[0].length);
  const encounterAt=after.search(/遇到|遇见|遭遇|碰到|碰见|发现野生|寻找|搜寻|找(?:到)?/u);
  const targetText=encounterAt<0?after:after.slice(0,encounterAt);
  const names=(Array.isArray(locations)?locations:[]).flatMap(location=>location?.id&&location?.name?
    [{location,name:location.name},...(location.id==='viridian'?[{location,name:'长青市'},{location,name:'常青市'}]:[]),...(location.id==='viridian-forest'?[{location,name:'长青森林'}]:[])]:[]);
  const destination=names.filter(entry=>targetText.includes(entry.name))
    .sort((a,b)=>b.name.length-a.name.length)[0]?.location;
  if(!destination||destination.id===node?.id)return null;
  return {action:'travel',payload:{node:destination.id}};
}

function parseClauseIntent(input, world, {locations = [], catalog = {species: [], gyms: []}} = {}) {
  if (typeof input !== 'string' || !input.trim() || !world || typeof world !== 'object') return null;
  const playerText = input.trim();
  // A player's addressed line may contain movement, refusal, or a question in
  // quotation marks. Bind the conversation without executing the quoted text.
  if (/["“”‘’「」『』《》]/u.test(playerText)) {
    const conversation = storyConversation.detect(world,playerText);
    if (conversation) return result('story-converse',conversation,playerText);
  }
  if (nonAction(playerText)||reportedMovementOnly(playerText)) return null;

  const status = world?.战斗?.状态;
  const startBattle = /(?:开始战斗|进入战斗|进入本轮战斗|开始对战|开战|应战|开始(?:这场)?战斗)/u.test(playerText);
  if (status === 'pending' && startBattle) return result('start-battle', {}, playerText);
  // An active battle cannot be restarted, moved away from, or overwritten.
  if (isBattleActive(world)) return null;
  // Do not overwrite an unresolved pending encounter with a different scene action.
  if (status === 'pending') return null;

  const node = currentNode(world, locations);
  const badges = Array.isArray(world?.训练家?.徽章) ? world.训练家.徽章 : [];
  const catalogGyms = Array.isArray(catalog?.gyms) ? catalog.gyms : [];
  const requested=encounterTarget(playerText,catalog);
  const hasExplicitEncounter=/(?:遇到|遇见|遭遇|碰到|碰见|发现野生|寻找|搜寻|找(?:到)?)/u.test(playerText);
  if(status==='finished'&&hasStarter(world)&&node&&['route','cave'].includes(node.kind)&&requested&&!LEGENDARY_ENCOUNTERS.has(requested.id)&&hasExplicitEncounter){
    const travel=travelPlan(playerText,locations,node);
    const wild={action:'wild',payload:{speciesId:requested.id,scripted:true,start:true},requestedSpecies:requested.id};
    if(travel)return result('sequence',{actions:[travel,wild]},playerText,{requestedSpecies:requested.id});
    return result('wild',wild.payload,playerText,{requestedSpecies:requested.id});
  }
  if(/(?:挑战|迎战|应战|交手|对战|较量|回应.*挑战)/u.test(playerText)){
    const special=specials.definitions().find(item=>item.location===node?.id&&(playerText.includes(item.title)||playerText.includes(item.trainer)));
    if(special){try{const selected=scenes.applyTheaterChoice(world,'special-battle',{encounterId:special.id});return result('special-battle',selected.payload,playerText);}catch(error){return refusal(playerText,error.message);}}
  }
  // Specific social actions precede generic center and travel wording.
  if(hasStarter(world)&&status==='finished'){
    const quest=quests.definitions(world).filter(item=>item.location===node?.id&&playerText.includes(item.title)).sort((a,b)=>b.title.length-a.title.length)[0];
    const questAction=/(?:交付|交还|提交|领取报酬|领报酬)/u.test(playerText)?'quest-turn-in':/(?:接取|接受|接下|承接)/u.test(playerText)?'quest-accept':null;
    if(quest&&questAction){try{const selected=scenes.applyTheaterChoice(world,questAction,{questId:quest.id});return result(questAction,selected.payload,playerText);}catch(error){return refusal(playerText,error.message);}}
    if(node?.kind==='town'&&/(?:委托|任务|帮忙的事|帮忙的事情)/u.test(playerText)&&/(?:询问|问问|打听|有没有|有什么|寻找|帮忙)/u.test(playerText))return result('quest-inquire',{},playerText);
    const namedPartner=(world.队伍||[]).filter(mon=>playerText.includes(mon.昵称||'\u0000')).sort((a,b)=>(b.昵称||'').length-(a.昵称||'').length)[0];
    const partner=namedPartner||(world.队伍||[])[0],partnerScope=!!namedPartner||/(?:伙伴|宝可梦|精灵)/u.test(playerText);
    const social=/(?:露营|扎营|搭帐篷|营火旁休息)/u.test(playerText)?['camp',{}]:
      partnerScope&&/(?:照料|梳理|检查身体|安抚|照顾)/u.test(playerText)?['care',{uid:partner?.uid,mode:'comfort'}]:
      partnerScope&&/(?:练习配合|练习手势|配合练习|默契训练)/u.test(playerText)?['train',{uid:partner?.uid,mode:'practice'}]:
      /(?:和|与).*(?:聊聊|玩耍|陪伴|倾听)/u.test(playerText)&&partner&&partnerScope?['bond',{uid:partner.uid,mode:'talk'}]:null;
    if(social){try{const selected=scenes.applyTheaterChoice(world,...social);return result(social[0],selected.payload,playerText);}catch(error){return refusal(playerText,error.message);}}
  }
  if (requested && LEGENDARY_ENCOUNTERS.has(requested.id)) {
    const namedLocation = locations.find(location => location?.name && playerText.includes(location.name) && location.id !== node?.id);
    if (namedLocation) return null;
    try {
      const option = scenes.applyTheaterChoice(world, 'legendary', {id: requested.id});
      return result('legendary', option.payload, playerText, {requestedSpecies: requested.id});
    } catch (error) {
      return refusal(playerText, `传说宝可梦遭遇尚不可用：${error.message}`, {requestedSpecies: requested.id});
    }
  }

  if (/(?:道馆战|挑战赛|挑战道馆)/u.test(playerText)||GYM_LEADERS.some(name=>playerText.includes(name)&&/(?:挑战|迎战|应战)/u.test(playerText))) {
    const leaderIndex = GYM_LEADERS.findIndex(name => playerText.includes(name));
    const gym = Number.isInteger(node?.gym) ? node.gym : -1;
    if (leaderIndex < 0 || node?.kind !== 'town' || gym !== leaderIndex) return null;
    const expected = catalogGyms[gym]?.name || GYM_LEADERS[gym];
    if (expected && expected !== GYM_LEADERS[gym] && !playerText.includes(expected)) return null;
    if (badges.length !== gym || badges.includes(world?.训练家?.徽章?.[gym])) {
      return refusal(playerText, '道馆挑战顺序或徽章状态不满足。');
    }
    return result('challenge-gym', {gym}, playerText);
  }

  const trainerInvite=/(?:来一场(?:对战|战斗|切磋)?|切磋|打一场(?:对战)?|进行一场(?:友谊)?对战|友谊对战|接受(?:.{0,8})?挑战|接受训练家挑战|应战|挑战|对战)/u.test(playerText);
  const trainerName=trainerNameMention(playerText);
  if(hasStarter(world)&&status==='finished'&&node?.kind&&trainerInvite&&(trainerName||(node.kind!=='town'&&/来一场(?:对战|战斗|切磋)?/u.test(playerText))))return result('trainer-battle',{trainerName:trainerName||'训练家'},playerText);

  if (/(?:宝可梦中心|精灵中心|乔伊小姐|治疗|恢复健康|恢复队伍)/u.test(playerText)) {
    if (!/(?:去|前往|进入|到|请|帮我|给我|使用|治疗|恢复)/u.test(playerText)) return null;
    if (node?.kind !== 'town' || !hasStarter(world)) return null;
    return result('heal', {}, playerText);
  }

  if(/(?:买|购买|购入)/u.test(playerText)){
    const itemText=normalizeName(playerText),item=itemCatalog.filter(entry=>itemText.includes(normalizeName(entry.name))||itemText.includes(normalizeName(entry.id)))
      .sort((a,b)=>b.name.length-a.name.length)[0];
    if(item){
      const shop=shopFor(world),count=purchaseCount(playerText,item);
      if(!shop.available)return refusal(playerText,'这里没有城镇商店。');
      if(!shop.items.includes(item.id))return refusal(playerText,`这家商店没有出售${item.name}。`);
      if(!Number.isSafeInteger(count)||count<1||count>99)return refusal(playerText,'购买数量需为 1 到 99。');
      return result('buy',{item:item.id,count},playerText);
    }
  }

  if (/(?:商店|友好商店|百货|补给站)/u.test(playerText) && /(?:去|前往|进入|到|逛|打开)/u.test(playerText)) {
    if (node?.kind !== 'town') return null;
    return result('visit-shop', {}, playerText);
  }

  const travel=travelPlan(playerText,locations,node), destination=locations.find(location=>location.id===travel?.payload.node);
  if (travel && destination) {
    if (status !== 'finished' || !node || !Array.isArray(node.links)) return null;
    if(node.links.includes(destination.id)&&badges.length<(destination.requiresBadges||0))return refusal(playerText,`前往${destination.name}需要更多徽章。`);
    return result('travel', travel.payload, playerText);
  }

  const conversationTarget=storyConversation.detect(world,playerText);
  if(conversationTarget)return result('story-converse',conversationTarget,playerText);
  const encounterVerb = /(?:遇到|遇见|遭遇|碰到|碰见|发现野生|野生(?:宝可梦|精灵)?|开始战斗|进入战斗|开始对战|开战|应战)/u;
  const searchingSpecies = /(?:寻找|搜寻|找(?:到)?)/u.test(playerText) && requested && !LEGENDARY_ENCOUNTERS.has(requested.id);
  const sceneCue = /(?:草丛|草地|森林|洞窟|山洞|道路|水道|野外|野生)/u.test(playerText) ||
    (!!node && (node.kind === 'route' || node.kind === 'cave') && playerText.includes(node.name));
  if ((!encounterVerb.test(playerText) && !searchingSpecies) || (!sceneCue && !searchingSpecies)) {
    if(hasStarter(world)&&status==='finished'&&['route','cave'].includes(node?.kind)&&/(?:深入探索|探索草丛|寻找野生|寻找宝可梦|(?:走进|走入|进入|钻入|钻进|踏入|去|到)[^。！？；;\n]{0,8}(?:草丛|长草)|(?:草丛|长草)[^。！？；;\n]{0,12}(?:找|探索|转转|看看|走走)|向洞穴深处|向洞窟深处|继续探索|在森林.*继续前进|沿着.*小路.*探索)/u.test(playerText))return result('explore',{},playerText);
    return null;
  }
  if (status !== 'finished' || !node || !['route', 'cave'].includes(node.kind)) return null;
  if (!hasStarter(world)) return null;
  const namedLocation = (Array.isArray(locations) ? locations : [])
    .filter(location => location?.name && playerText.includes(location.name))
    .sort((a, b) => String(b.name).length - String(a.name).length)[0];
  if (namedLocation && namedLocation.id !== node.id) return null;

  const method=/(?:水面|海上|水中|冲浪时)/u.test(playerText)?'water':'auto';
  if ((encounterVerb.test(playerText)||searchingSpecies||sceneCue) && status === 'finished' && node && ['route','cave'].includes(node.kind)) {
    return result('wild', {speciesId: requested?.id, ...(method!=='auto'?{method}:{}),start: true}, playerText,
      requested ? {requestedSpecies: requested.id} : {});
  }
  return null;
}

function parseStoryIntent(input, world, options = {}) {
  if (typeof input !== 'string' || !input.trim() || !world || typeof world !== 'object') return null;
  const playerText = input.trim();
  // Quotations keep their sentence-level handling: a first-person commitment
  // outside the quote may still bind it, while pure or reported quotes never do.
  if (/["“”‘’「」『』《》]/u.test(playerText)) return parseClauseIntent(playerText, world, options);
  const clauses = actionClauses(playerText);
  if (clauses.length <= 1) return parseClauseIntent(playerText, world, options);
  const actions = [];
  for (const clause of clauses) {
    const candidate = parseClauseIntent(clause, world, options);
    if (!candidate) continue;
    if (!candidate.action) {
      if (candidate.reason) return {...candidate, playerText};
      continue;
    }
    const steps = candidate.action === 'sequence' ? candidate.payload.actions : [candidate];
    actions.push(...steps);
  }
  if (!actions.length) return null;
  if (actions.length === 1) return {...actions[0], playerText};
  return result('sequence', {actions}, playerText);
}

module.exports = {parseStoryIntent,nonAction,encounterTarget,trainerNameMention};
