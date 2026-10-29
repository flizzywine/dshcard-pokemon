'use strict';
const {createHash}=require('node:crypto');
const quests=require('./npc-quests.cjs');
const campaign=require('./story-campaign.cjs');
const storyEvents=require('./kanto-story-events.cjs');
const storyConversation=require('./story-conversation.cjs');
const rhythms=[
 '写一个伙伴主动做出的小动作，让训练家可以回应；不要替玩家说出回应。',
 '让当地NPC有自己的工作、顾虑和边界，交谈可以留下下次再见的具体线索。',
 '用栖息环境、食物、声音或野生精灵的习惯体现生态；接近、绕行、观察都应有意义。',
 '让一次训练或旅行中的小困难自然暴露伙伴的习惯，容许犹豫、误会和慢慢建立信任。',
 '用安静的日常留出呼吸空间：整理背包、休息、做饭、睡前警戒都可以承接前事。',
 '回应上一次共同经历中的一个细节；用不同伙伴的具体反应表现性格，避免齐声赞美。',
 '让眼前人物有自己的顾虑或责任，他可以不同意玩家，但先认真回应玩家刚才的问题。',
 '给场景一个能够继续追问的小线索，让不同人物对它作出不同解释；不要提前宣布真相。',
 '让一只同行宝可梦以符合其状态和习性的动作表达态度，把回应的余地留给玩家。',
 '呈现一个没有标准答案的小抉择或人情难处，但不要列选项，也不要替玩家决定。',
 '用当地工作的细节或环境变化串起交谈，让人和宝可梦各自有事情要做。',
 '允许对话有停顿或分歧，也允许以善意缓和；关系变化只能依据已经记录的经历。'
];
const eventDefinitions=new Map(storyEvents.EVENTS.map(event=>[event.id,event]));
const short=(value,max=120)=>typeof value==='string'?value.slice(0,max):'';
const number=value=>Number.isSafeInteger(value)?value:null;
function continuity(world,turn){
 const current=Number.isSafeInteger(turn)?turn:Number.MAX_SAFE_INTEGER;
 const chosen=world?.剧情?.初始御三家已选===true;
 const members=chosen&&Array.isArray(world?.队伍)?world.队伍.slice(0,6):[];
 const clues=Array.isArray(world?.羁绊?.短期线索)?world.羁绊.短期线索:[];
 const party=members.map(mon=>{
  const record=world?.羁绊?.伙伴?.[mon.uid],memories=Array.isArray(record?.共同记忆)?record.共同记忆:[];
  return {名字:short(mon.昵称,24),状态:short(mon.状态,16)||'正常',心情:short(record?.心情,16),
   信赖:number(record?.信赖),共同记忆:memories.slice(-2).map(item=>short(item?.事件,80)).filter(Boolean),
   近期线索:clues.filter(item=>item?.UID===mon.uid&&item.到期故事轮次>=current).slice(-1).map(item=>short(item.内容,60)).filter(Boolean)};
 });
 const definitions=[...(Array.isArray(quests.quests)?quests.quests:[]),...(Array.isArray(world?.委托?.随机委托)?world.委托.随机委托:[])];
 const records=world?.委托?.记录||{};
 const active=definitions.filter(quest=>['active','ready'].includes(records[quest.id]?.status)).slice(0,4).map(quest=>({
  标题:short(quest.title,50),委托人:short(quest.npcName,24),地点:short(quest.location,24),说明:short(quest.description,80),
  状态:records[quest.id].status,进度:number(records[quest.id].progress),目标:number(quest.objective?.target),报酬约定:short(quest.rewardPreview,70)}));
 const local=chosen?definitions.filter(quest=>quest.location===world?.地图?.节点&&!records[quest.id]).slice(0,2).map(quest=>({标题:short(quest.title,50),委托人:short(quest.npcName,24),说明:short(quest.description,60)})):[];
 const tasks=Array.isArray(world?.任务)?world.任务:[];
 const deep=tasks.filter(task=>task?.category==='deep-quest'&&['进行中','可推进'].includes(task.状态)).slice(0,4).map(task=>({
  标题:short(task.标题,50),委托人:short(task.委托人,24),地点:short(task.委托地点,24),状态:short(task.状态,12),
  当前阶段:short(task.stageTitle,50),阶段:short(task.阶段,12),说明:short(task.描述,100),进度:number(task.进度),目标:number(task.目标)}));
 const main=tasks.filter(task=>!task?.category&&!task?.questId&&task?.状态==='进行中').slice(0,2).map(task=>({标题:short(task.标题,50),说明:short(task.说明||task.描述,60)}));
 const history=Array.isArray(world?.剧情?.关都事件?.记录)?world.剧情.关都事件.记录:[];
 const echoes=Array.isArray(world?.剧情?.关都主线?.echoes)?world.剧情.关都主线.echoes:[];
 const side=Array.isArray(world?.剧情?.支线剧情线索)?world.剧情.支线剧情线索:[];
 return {地点:short(world?.地图?.地点,60),地图节点:short(world?.地图?.节点,40),伙伴:party,
  委托:{进行中:active,深度:deep,本地未接取:local,主线:main},
  已记录事件:history.slice(-2).map(row=>{
   const event=eventDefinitions.get(row.id),stage=event?.stages?.find(item=>item.id===row.阶段),choice=stage?.choices?.find(item=>item.id===row.选择);
   return {事件:short(event?.title||row.id,50),结果:short(row.结果,30),经过:short(choice?.text,140)};
  }),
  已选主线回响:echoes.slice(-2).map(row=>short(row.text,100)).filter(Boolean),
  已完成支线线索:side.slice(-2).map(row=>short(row.text,100)).filter(Boolean)};
}
function campaignContext(world){
 return campaign.prompt(world).replace(/\n选择：[\s\S]*?(?=\n关系羁绊：)/u,'\n剧情分支由插件根据玩家的自然语言行动记录；正文不列出分支选项。');
}
function eventContext(world){
 if(!world?.剧情?.关都事件)return '';
 const scene=storyEvents.view(world).scene;
 if(!scene||scene.status!=='available')return '';
 const conversation=scene.conversation||{};
 const lead={标题:short(scene.title,60),人物:short(scene.speaker,40),当前情境:short(scene.text,180),
  人物顾虑:short(conversation.focus,350),可能线索:(conversation.beats||[]).slice(0,4).map(beat=>short(beat,160)),
  待回应问题:(conversation.questions||[]).slice(0,2).map(question=>short(question,120)),未来回访:short(conversation.revisit,160)};
 return '【当地可用的剧情线索】仅在和玩家行动相关时采用，不代表已经接取或发生：'+JSON.stringify(lead);
}
function boundedLines(value,limit){
 const result=[];let length=0;
 for(const line of String(value||'').split('\n'))if(length+line.length+1<=limit){result.push(line);length+=line.length+1;}
 return result.join('\n');
}
function prompt(world,planned,input,turn){
 const seed=createHash('sha256').update(`${world.地图?.节点}:${turn}:${input||''}`).digest()[0];
 // Event view normalizes legacy story records; do that on a private story
 // snapshot so a prompt preview cannot modify the caller's MVU state.
 const previewWorld={...world,剧情:structuredClone(world.剧情||{})};
 const focus=planned?.action;
 const guidance=focus==='camp'?'露营写选营地、照顾体型和习性的差异、做饭或守夜；至少给一位伙伴主动表达的机会，不一段带过整夜。':
 ['care','bond','train'].includes(focus)?'把所选伙伴放在场景中心，写非语言回应、身体结构与习性、具体的小习惯；尊重它疲惫与受伤的状态，不把所有精灵写成宠物狗。':
 ['challenge-gym','special-battle'].includes(focus)?'馆主应有与属性和城市相符的个性、场地与理念。通过裁判、观众和对手准备营造压迫；正式对战开始前停下，不列出行动选项，由玩家用自然语言操作战斗插件。':
 ['quest-accept','quest-turn-in','quest-inquire'].includes(focus)?'委托人说明眼下的具体困难和为什么需要帮助，允许质疑报酬或拒绝。只采用权威任务清单，奖励和完成状态由后台执行。':rhythms[seed%rhythms.length];
 const focusedConversation=storyConversation.prompt(previewWorld,planned?.action==='story-converse'?planned.payload:null);
 const storyContext=focusedConversation?'\n'+focusedConversation:'\n'+boundedLines(campaignContext(previewWorld),1500)+'\n'+eventContext(previewWorld);
 return '【关都旅程叙事导演】以原创的宝可梦旅行小说方式写当前场景，不复述界面操作，不写教程。一次推进一个有感官细节、有来往回应的情节；保留玩家的台词和重大选择。玩家用自然语言继续与当前人物交谈时，先回应玩家刚才的意思，再让人物依据自己的目的、顾虑和已有经历自然回应；玩家拒绝、追问或转话题时不要强推预设进度。这轮只推进一个具体节拍，不替玩家回答、不擅自选择剧情分支、不自动完成事件或宣布关系和解；留下人物真实回应和可供玩家接话的停顿，允许同一场互动持续多轮。对话设计中的悬念和开放问题应分轮展开，未来回访线索要记住人物在意的细节；让同行伙伴各有反应，不齐声总结。人物不是菜单服务员，精灵不是只会点头的工具。让相遇、道别、约定与共同记忆在以后回响；节奏有平静与紧张，不把每次散步写成生死危机。随机性用于日常事件、情绪、社会关系和合法生态，不用于编造奖励、宝可梦数值或任意传送。玩家的自然语言选择和行动由插件解析、校验并更新 MVU；模型只续写叙事，不输出或提交宝可梦数值补丁、JSON 或 operations。正文不生成 <活动选择...>、活动选择列表、活动菜单或自创剧情按钮；不要用按钮列表代替情节。唯一可输出的剧情操作标记是【进入本轮战斗】，且只用于插件上下文确认的合法待操作战斗；日常轮次可以没有战斗。不要生成战果摘要或要求玩家再次提交战果。'+guidance+
 '\n【旅程连续性】'+JSON.stringify(continuity(world,turn))+
 '\n以上资料是当前 MVU 的事实，相关时自然呼应即可，不必逐条复述；未接取的委托只是线索。信赖与原版亲密度独立，战斗数值、状态、委托进度与奖励均由后台结算，不能在叙事中自行改变或宣布完成。'+storyContext;
}
module.exports={prompt};
