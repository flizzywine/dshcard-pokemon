const test=require('node:test'),assert=require('node:assert/strict');
const config=require('../starter-config.cjs'),mvu=require('../mvu.cjs'),{KantoGame}=require('../engine.cjs');
const text='我选择小火龙（天真性格，物攻特攻速度，个体值31）作为最初的伙伴，接过大木博士递来的精灵球。';
test('the actual grouped starter instruction preserves Naive and the three requested IVs',()=>{
 assert.deepEqual(config.parseChoice(text),{id:4,options:{nature:'Naive',ivs:{atk:31,spa:31,spe:31}}});
 assert.deepEqual(config.parseOptions('性格是固执，个体值：物攻31、特攻0、速度31'),{nature:'Adamant',ivs:{atk:31,spa:0,spe:31}});
 assert.deepEqual(config.parseOptions('Naive，六V').ivs,{hp:31,atk:31,def:31,spa:31,spd:31,spe:31});
 for(const phrase of ['IV全31','个体值全31','6v'])assert.deepEqual(config.parseOptions(phrase).ivs,{hp:31,atk:31,def:31,spa:31,spd:31,spe:31});
});
test('configured starter stats and actual simulator use the selected build',()=>{
 const choice=config.parseChoice(text),variables=mvu.chooseStarter(mvu.createInitialMvu(),choice.id,choice.options),mon=variables.stat_data.宝可梦.队伍[0];
 assert.equal(mon.性格,'Naive');assert.deepEqual(mon.个体值,{hp:25,atk:31,def:25,spa:31,spd:25,spe:31});assert.equal(mon.能力值.spe,14);assert.equal(mon.能力值.spd,9);
 const game=new KantoGame(),battle=mvu.startFromMvu(game,variables),actor=game.battles.get(battle.id).battle.p1.active[0];
 assert.equal(actor.set.nature,'Naive');assert.equal(actor.set.ivs.atk,31);assert.equal(actor.storedStats.spe,14);
});

test('shiny selection, engine state, capture and all 151 real shiny image sets remain consistent',()=>{
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
 const choice=config.parseChoice('我选择闪光小火龙（天真性格，物攻特攻速度个体值31）作为伙伴');assert.equal(choice.options.shiny,true);
 const variables=mvu.chooseStarter(mvu.createInitialMvu(),4,choice.options),world=variables.stat_data.宝可梦;
 assert.equal(world.队伍[0].闪光,true);world.遭遇={类型:'wild',训练家:'野生宝可梦',队伍:[mvu.makeMon(16,3,'shiny-wild',{shiny:true})]};
 const game=new KantoGame(),snapshot=mvu.startFromMvu(game,variables),record=game.battles.get(snapshot.id);
 assert.equal(snapshot.sides[0].team[0].shiny,true);assert.equal(record.battle.p2.active[0].set.shiny,true);
 record.caught={id:16,name:'波波'};record.battle.win('p1');const caught=mvu.applyBattleResult(variables,record).stat_data.宝可梦.队伍.find(mon=>mon.收服来源==='wild');assert.equal(caught.闪光,true);
 const rows=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/data/pokemon-shiny.json'),'utf8')).entries;assert.equal(rows.length,151);
 for(const row of rows)for(const type of ['artwork','front','back']){const bytes=fs.readFileSync(path.join(__dirname,'../public',row[type].image));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),row[type].sha256);}
});
test('legacy build repair preserves damage, PP, EXP, EVs, bag, and unrelated IVs and runs once',()=>{
 const variables=mvu.chooseStarter(mvu.createInitialMvu(),4),world=variables.stat_data.宝可梦;delete world.剧情.初始伙伴设定;
 const mon=world.队伍[0];mon.当前HP-=3;mon.招式[0].PP--;const before=structuredClone(world);
 const fixed=mvu.restoreStarterOptions(variables,config.parseChoice(text).options,2),after=fixed.stat_data.宝可梦;
 assert.equal(after.队伍[0].性格,'Naive');assert.equal(after.队伍[0].当前HP,after.队伍[0].能力值.hp-3);assert.equal(after.队伍[0].招式[0].PP,before.队伍[0].招式[0].PP);
 for(const field of ['经验','努力值','uid','等级'])assert.deepEqual(after.队伍[0][field],before.队伍[0][field]);
 assert.deepEqual(after.背包,before.背包);assert.deepEqual(mvu.restoreStarterOptions(fixed,config.parseChoice(text).options,2),fixed);
});
test('invalid or conflicting setup is refused atomically and never changes an active battle',()=>{
 for(const input of ['天真性格，物攻个体值32','物攻个体值31.5','物攻IV31、物攻IV0','勇猛性格'])assert.throws(()=>config.parseOptions(input));
 const initial=mvu.createInitialMvu(),copy=structuredClone(initial);assert.throws(()=>mvu.chooseStarter(initial,4,{ivs:{atk:32}}));assert.deepEqual(initial,copy);
 const active=mvu.chooseStarter(initial,4);delete active.stat_data.宝可梦.剧情.初始伙伴设定;active.stat_data.宝可梦.战斗.状态='active';assert.deepEqual(mvu.restoreStarterOptions(active,{nature:'Naive'},2),active);
});
