'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const mvu=require('../mvu.cjs');
const companionship=require('../companionship.cjs');
const gadgets=require('../gadget-actions.cjs');
const {KantoGame}=require('../engine.cjs');
const root=variables=>variables.stat_data.宝可梦;

function fieldWorld(){
  const variables=mvu.createInitialMvu(),world=root(variables),lead=world.队伍[0];
  world.剧情.初始御三家已选=true;world.地图.节点='route1';world.地图.地点='1号道路';world.地图.轮次=7;
  world.遭遇=null;world.战斗={轮次:7,状态:'finished',结果:'',摘要:'',操作序号:0};
  lead.当前HP=1;lead.招式[0].PP=Math.max(0,lead.招式[0].PP-5);
  return variables;
}

function settledBattle(trust){
  const variables=fieldWorld(),world=root(variables),lead=world.队伍[0];
  world.羁绊.伙伴[lead.uid].信赖=trust;
  world.遭遇={类型:'trainer',训练家:'测试训练家',队伍:[mvu.makeMon(16,12,'bond-exp-foe')]};
  world.战斗={轮次:7,状态:'pending',结果:'',摘要:'',操作序号:0};
  const game=new KantoGame(),snapshot=mvu.startFromMvu(game,variables),record=game.battles.get(snapshot.id);
  const foe=record.battle.p2.pokemon[0];foe.hp=0;foe.fainted=true;
  record.participationByFoe={[foe.set.slotId]:[lead.uid]};
  record.livingByFoeAtDefeat={[foe.set.slotId]:[lead.uid]};
  record.battle.win('p1');
  return {variables,record,lead};
}

test('trust tiers produce explicit experience and camp benefits without changing FRLG friendship',()=>{
  assert.deepEqual([0,19,20,39,40,60,80,100].map(value=>companionship.benefitsFor({信赖:value}).experienceBonusPercent),[0,0,5,5,10,15,20,20]);
  const variables=fieldWorld(),world=root(variables),mon=world.队伍[0],record=world.羁绊.伙伴[mon.uid];
  record.信赖=80;mon.亲密度=219;
  const beforeFriendship=mon.亲密度,beforeHp=mon.当前HP,beforePp=mon.招式[0].PP;
  const camped=root(mvu.theaterAction(variables,'camp',{storyTurn:7}));
  const after=camped.队伍[0];
  assert.equal(after.当前HP,Math.min(after.能力值.hp,beforeHp+Math.ceil(after.能力值.hp*0.30)));
  assert.equal(after.招式[0].PP,Math.min(after.招式[0].PP上限,beforePp+4));
  assert.equal(after.亲密度,beforeFriendship,'custom trust stays distinct from original friendship');
  assert.equal(camped.羁绊.伙伴[mon.uid].信赖,85);
  assert.equal(mvu.theaterView(variables).companionship.benefits[0].campPp,4);
  assert.match(mvu.theaterView(variables).companionship.friendshipField,/亲密度（原版0—255/);
});

test('battle settlement awards participant trust and memories once, with tier-scaled EXP',()=>{
  const base=settledBattle(0),loyal=settledBattle(80);
  const baseSettled=mvu.applyBattleResult(base.variables,base.record),loyalSettled=mvu.applyBattleResult(loyal.variables,loyal.record);
  const baseAfter=root(baseSettled),loyalAfter=root(loyalSettled);
  const baseGain=baseAfter.队伍[0].经验-base.lead.经验;
  const loyalGain=loyalAfter.队伍[0].经验-loyal.lead.经验;
  assert.equal(loyalGain,Math.floor(baseGain*1.2));
  const record=loyalAfter.羁绊.伙伴[loyal.lead.uid];
  assert.equal(record.信赖,82);
  assert.match(record.共同记忆.at(-1).事件,/战斗/);
  const repeated=root(mvu.applyBattleResult(loyalSettled,loyal.record));
  assert.equal(repeated.羁绊.伙伴[loyal.lead.uid].信赖,82,'replaying settlement cannot repeat trust');
  assert.equal(repeated.队伍[0].经验,loyalAfter.队伍[0].经验,'replaying settlement cannot repeat EXP');
});

test('native story turn locks trust across separate battle rounds and camping',()=>{
  const variables=fieldWorld(),world=root(variables),lead=world.队伍[0];
  world.羁绊.伙伴[lead.uid].信赖=0;
  function winRound(input,round){
    const current=root(input),uid=current.队伍[0].uid;
    current.地图.轮次=round;
    current.遭遇={类型:'trainer',训练家:'测试训练家',队伍:[mvu.makeMon(16,12,`foe-${round}`)]};
    current.战斗={轮次:round,状态:'pending',结果:'',摘要:'',操作序号:0};
    const game=new KantoGame(),snapshot=mvu.startFromMvu(game,input),record=game.battles.get(snapshot.id),foe=record.battle.p2.pokemon[0];
    foe.hp=0;foe.fainted=true;
    record.participationByFoe={[foe.set.slotId]:[uid]};
    record.livingByFoeAtDefeat={[foe.set.slotId]:[uid]};
    record.battle.win('p1');
    return {input,record};
  }
  const firstSetup=winRound(variables,7),first=mvu.applyBattleResult(firstSetup.input,firstSetup.record,{storyTurn:900});
  assert.equal(root(first).羁绊.伙伴[lead.uid].信赖,2);
  const secondSetup=winRound(first,8),second=mvu.applyBattleResult(secondSetup.input,secondSetup.record,{storyTurn:900});
  assert.equal(root(second).羁绊.伙伴[lead.uid].信赖,2,'a new battle counter in the same native turn cannot grant trust again');
  const camped=mvu.theaterAction(second,'camp',{mode:'rest',storyTurn:900});
  assert.equal(root(camped).羁绊.伙伴[lead.uid].信赖,2,'camp and battle share the native host turn trust lock');
});

test('one story turn shares the trust-growth gate across battle, camp and legacy actions',()=>{
  const settled=settledBattle(0),afterBattle=mvu.applyBattleResult(settled.variables,settled.record),uid=settled.lead.uid;
  const camped=mvu.theaterAction(afterBattle,'camp',{storyTurn:7});
  assert.equal(root(camped).羁绊.伙伴[uid].信赖,2,'same-turn camping restores but cannot farm another trust gain');
  assert.throws(()=>mvu.theaterAction(camped,'care',{uid,mode:'comfort',storyTurn:7}),/本故事回合/);
  const newer=mvu.theaterAction(camped,'bond',{uid,mode:'talk',storyTurn:8});
  assert.equal(root(newer).羁绊.伙伴[uid].信赖,4,'legacy actions remain callable and use host story turns');
  assert.throws(()=>mvu.theaterAction(newer,'train',{uid,mode:'practice',storyTurn:8}),/本故事回合/);
});

test('companion camping and the camp-kit tool share a single recovery slot per story turn',()=>{
  const variables=fieldWorld(),world=root(variables),mon=world.队伍[0];
  world.机制奖励.已解锁.push('campKit');mon.当前HP=1;mon.招式[0].PP=0;
  const camped=mvu.theaterAction(variables,'camp',{mode:'rest',storyTurn:7});
  const toolView=gadgets.view(root(camped),{storyTurn:7});
  assert.equal(toolView.camp.enabled,false);
  assert.match(toolView.camp.reason,/本故事轮次/);
  assert.throws(()=>mvu.toolAction(camped,'gadget-camp-rest',{},7),/本故事轮次/);
});

test('legacy saves retain existing trust, friendship, memories and gain missing defaults',()=>{
  const variables=fieldWorld(),world=root(variables),uid=world.队伍[0].uid;
  world.羁绊.伙伴[uid]={信赖:42,心情:'愉快',共同记忆:[{故事轮次:3,事件:'旧档里的同行记忆。'}]};
  world.羁绊.上次羁绊增长故事轮次=6;
  const mon=world.队伍[0];mon.亲密度=205;
  const migrated=mvu.ensureMvuDefaults(variables),after=root(migrated);
  assert.equal(after.羁绊.伙伴[uid].信赖,42);
  assert.equal(after.羁绊.伙伴[uid].共同记忆[0].事件,'旧档里的同行记忆。');
  assert.equal(after.羁绊.上次羁绊增长故事轮次,6);
  assert.equal(after.队伍[0].亲密度,205);
  assert.equal(mvu.validateMvu(migrated),true);
});
