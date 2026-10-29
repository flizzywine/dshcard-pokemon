'use strict';

const fs = require('node:fs');
const path = require('node:path');
const clone = value => structuredClone(value);
const SLOT_NAMES = Object.freeze({aura:'光环',entry:'登场',move:'招式',outcome:'胜利'});
const ARCHETYPES = Object.freeze([
  ['orbit','星环盘旋','orbit'],['spiral','螺旋星河','spiral'],['ripple','同心涟漪','ripple'],['helix','双螺旋','helix'],['crown','王冠升焰','crown'],
  ['hex-shield','六边护幕','hex-shield'],['lattice','菱格晶网','lattice'],['meteor','流星雨','meteor'],['comet-tail','彗尾拖曳','comet-tail'],['fan','扇形喷发','fan'],
  ['petal-vortex','花瓣回旋','petal-vortex'],['blade-cross','交错刃轨','blade-cross'],['ribbon-loop','缎带翻环','ribbon-loop'],['glyph-seal','符文封印','glyph-seal'],['portal','折跃门环','portal'],
  ['constellation','星座连线','constellation'],['prism-shower','棱晶散射','prism-shower'],['wavefront','波前推进','wavefront'],['afterimage','镜像残影','afterimage'],['pulse-column','脉冲光柱','pulse-column'],
  ['vortex','中心涡旋','vortex'],['spiral-stair','螺旋阶梯','spiral-stair'],['orbiting-cubes','立方轨道','orbiting-cubes'],['ground-rune','地面阵纹','ground-rune'],['arc-burst','弧光迸发','arc-burst']
]);
const FORM_LABELS=Object.freeze({'double-orbit':'双层卫星','comet-tail':'彗尾','updraft':'螺旋升流','fountain-fan':'扇形喷泉','pulse-rings':'环形脉冲','petal-orbit':'花瓣环绕','constellation':'星座连线','accretion':'向内吸积','wing-arcs':'翅翼弧光','rainfall':'细雨','snowfall':'雪晶','ember-fall':'余烬飘散','radial-shards':'碎片放射','wavefront':'波浪前锋','ribbon-loop':'缎带环','light-column':'光柱升起','hex-shield':'六角护盾','ground-glyph':'地面纹章','sand-drift':'尘砂流','afterimage':'残像拖影','black-hole':'黑洞','portal-cat':'猫钻传送门','bat-swarm':'蝙蝠群','spectral-eye':'幽灵之眼','lantern-rise':'纸灯笼','scythe-orbit':'旋转镰刀','dragon-coil':'赤龙盘旋','crystal-crown':'暗晶王冠','kanto-trio':'关都御三家','fireworks':'双段烟花','shiny-burst':'闪光星芒','graveyard':'墓园幽影','lotus-field':'莲花领域'});
const PRESENTATION_FORMS=Object.freeze(['double-orbit','comet-tail','updraft','fountain-fan','pulse-rings','petal-orbit','constellation','accretion','wing-arcs','rainfall','snowfall','ember-fall','radial-shards','wavefront','ribbon-loop','light-column','hex-shield','ground-glyph','sand-drift','afterimage','black-hole','portal-cat','bat-swarm','spectral-eye','lantern-rise','scythe-orbit','dragon-coil','crystal-crown','kanto-trio','fireworks','shiny-burst','graveyard','lotus-field']);
const PARTICLE_ROWS=Object.freeze([
  ['shiny','Shiny','闪光星芒'],['secret-shiny','Secret Shiny','隐藏闪光'],['hitodama','Hitodama','鬼火'],['bats','Bats','蝙蝠群'],['ghosts','Ghosts','幽灵群'],['the-eye','The Eye','凝视之眼'],['pumpkings-delight',"Pumpking’s Delight",'南瓜王馈赠'],['rising-star','Rising Star','升起的明星'],['snowflake','Snowflake','雪花'],['present','Present','礼物'],['paper-lantern','Paper Lantern','纸灯笼'],['fireworks','Fireworks','烟花'],['pungent-stench','Pungent Stench','恶臭'],['black-hole','Black Hole','黑洞'],['witchs-haze',"Witch’s Haze",'女巫迷雾'],['pumpkids-treat',"Pumpkid’s Treat",'南瓜糖果旋风'],['witchs-cat',"Witch’s Cat",'女巫猫'],['pumpcat','Pumpcat','南瓜猫'],['white-kitty','White Kitty','白猫'],['spinning-scythe','Spinning Scythe','旋转镰刀'],['spiders-web',"Spider’s Web",'蛛网'],['zombies-grip',"Zombie’s Grip",'僵尸之握'],['zodiac','Zodiac','生肖'],['eerie-howl','Eerie Howl','阴森狼嚎'],['graveyard','Graveyard','墓园'],['kings-fall',"King’s Fall",'王之陨落'],['red-dragon','Red Dragon','赤龙'],['anniversary-cake','Anniversary Cake','周年蛋糕'],['kanto-friends','Kanto Friends','关都伙伴'],['shiny-kanto-friends','Shiny Kanto Friends','闪光关都伙伴'],['menacing-spirit','Menacing Spirit','威压之灵'],['shiny-menacing-spirit','Shiny Menacing Spirit','闪光威压之灵'],['xmas-decorations','Xmas Decorations','圣诞装饰'],['spirit-of-spring','Spirit of Spring','春之灵'],['phantom','Phantom','幻影猫灵'],['shiny-phantom','Shiny Phantom','闪光幻影猫灵'],['dark-crystal','Dark Crystal','暗黑水晶'],['shiny-dark-crystal','Shiny Dark Crystal','闪光暗黑水晶'],['lotus-field','Lotus Field','莲花领域'],['blood-lotus-field','Blood Lotus Field','血莲花领域']
]);
const PARTICLE_KEY_BY_NAME=Object.freeze(Object.fromEntries(PARTICLE_ROWS.map(([key,name,label])=>[name,key])));
const SHOWCASE_PARTICLES=Object.freeze([
  {name:'闪光星芒',particleId:'shiny',form:'shiny-burst',family:'starlight',colors:['#fff5a8','#fffef0','#f8bc39'],description:'原创像素闪光：层叠星芒骤亮，碎星沿不同轨迹散落。'},
  {name:'庆典烟花',particleId:'fireworks',form:'fireworks',family:'fire',colors:['#ff6b9d','#fff2a6','#6deaff'],description:'原创登场烟花：火箭错峰升空，光束绽放后渐渐坠落。仅改变舞台外观。'},
  {name:'黑洞',particleId:'black-hole',form:'black-hole',family:'ghost',colors:['#b792ff','#f0d5ff','#6042cb'],description:'原创登场黑洞：光环张开，星屑旋转并向暗核汇聚。仅改变舞台外观。'},
  {name:'蝙蝠群',particleId:'bats',form:'bat-swarm',family:'ghost',colors:['#d0a6ff','#f3dcff','#7754a8'],description:'原创登场蝙蝠：剪影错峰飞过，双翼交替拍动。仅改变舞台外观。'},
  {name:'墓园幽影',particleId:'graveyard',form:'graveyard',family:'ghost',colors:['#a9b9d9','#d8e6f7','#7486a9'],description:'原创像素墓园：石碑升起，前后两层雾带与鬼火漂行。'},
  {name:'莲花领域',particleId:'lotus-field',form:'lotus-field',family:'leaf',colors:['#ff85bd','#ffd6eb','#7cd7c8'],description:'原创登场莲花：水波与花朵轻盈舒展，花瓣随风飘扬。仅改变舞台外观。'},
]);
const THEMES = Object.freeze(['fire','water','leaf','electric','ice','ghost','starlight','dust']);
const THEME_LABELS = Object.freeze({fire:'焰',water:'潮',leaf:'叶',electric:'电',ice:'晶',ghost:'影',starlight:'星',dust:'砂'});
const PALETTES = Object.freeze([
  ['#4deaff','#a9fbff','#1679bd'],['#ff4ca3','#ffc5e5','#83175f'],['#fff07a','#fffbd0','#cb781b'],['#bb78ff','#e8d0ff','#5030ae'],['#6effa7','#ceffb6','#188557']
]);
// Each named effect keeps a recognizable palette instead of inheriting an
// unrelated random catalog color.  Existing cosmetic IDs and ownership stay put.
const PARTICLE_PALETTES=Object.freeze(Object.fromEntries([
  [['shiny','rising-star'],['#ffd55c','#fffdf0','#b87b19']],
  [['secret-shiny'],['#ff64c8','#eefcff','#6943d6']],
  [['hitodama','ghosts','witchs-haze','witchs-cat','spinning-scythe','spiders-web','phantom','menacing-spirit'],['#b992ed','#f5e6ff','#624a92']],
  [['shiny-phantom','shiny-menacing-spirit','shiny-dark-crystal'],['#ff78d5','#e1ffff','#6845b4']],
  [['bats','black-hole','the-eye','dark-crystal'],['#b792ff','#f0d5ff','#6042cb']],
  [['pumpkings-delight','pumpkids-treat','pumpcat'],['#ee8d3b','#ffdc79','#984328']],
  [['snowflake','white-kitty','xmas-decorations'],['#9bd6f1','#f5ffff','#558fac']],
  [['present','anniversary-cake'],['#f578ab','#fff1c7','#bb466e']],
  [['paper-lantern','zodiac','kings-fall','red-dragon','spirit-of-spring'],['#ef724b','#fff0ac','#aa352e']],
  [['fireworks'],['#ff6b9d','#fff2a6','#6deaff']],
  [['pungent-stench','zombies-grip'],['#92be7c','#d4e8a6','#486b60']],
  [['eerie-howl','graveyard'],['#a9b9d9','#d8e6f7','#7486a9']],
  [['kanto-friends','shiny-kanto-friends'],['#7bcb92','#ffedaa','#71b9d6']],
  [['lotus-field'],['#ff85bd','#ffd6eb','#7cd7c8']],
  [['blood-lotus-field'],['#e34a6b','#ffc3cb','#992d4d']]
].flatMap(([keys,palette])=>keys.map(key=>[key,Object.freeze(palette)]))));
const readData = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data', name), 'utf8').replace(/^\uFEFF/, ''));
const DEEP_QUEST_CATALOG = readData('deep-quests.json');
const ROCKET_EVENTS = readData('rocket-boss-events.json').events;
const tileWorld=require('./tile-world.cjs');
const reachableHidden=tileWorld.hiddenItems.filter(item=>item.access!=='no-open-adjacent-tile');
const HIDDEN_MAPS=Object.freeze([...new Set(reachableHidden.map(item=>item.mapId))]);
const HIDDEN_EVENT_IDS=new Set(reachableHidden.map(item=>item.eventId));
const BOSS_IDS = Object.freeze(['brock','misty','lt_surge','erika','koga','sabrina','blaine','giovanni','lorelei','bruno','agatha','lance','champion','apollo','athena','lance_rocket','lambda','rocket_viridian']);
const DEEP_QUESTS = Object.freeze(DEEP_QUEST_CATALOG.map(quest => quest.id));
const SCENE_LABELS = Object.freeze({
  MAP_CELADON_CITY:'玉虹市', MAP_CELADON_CITY_GAME_CORNER:'玉虹游戏厅', MAP_CERULEAN_CAVE_1F:'华蓝洞窟一层',
  MAP_CERULEAN_CITY:'华蓝市', MAP_FIVE_ISLAND_MEMORIAL_PILLAR:'五之岛纪念碑', MAP_FIVE_ISLAND_RESORT_GORGEOUS:'五之岛豪华度假区',
  MAP_FIVE_ISLAND_ROCKET_WAREHOUSE:'五之岛火箭队仓库', MAP_FOUR_ISLAND:'四之岛', MAP_FUCHSIA_CITY:'浅红市',
  MAP_MT_EMBER_EXTERIOR:'灯火山山麓', MAP_MT_MOON_B1F:'月见山地下一区', MAP_MT_MOON_B2F:'月见山地下二区',
  MAP_NAVEL_ROCK_SUMMIT:'肚脐岩山顶', MAP_ONE_ISLAND_TREASURE_BEACH:'一之岛宝藏海滩', MAP_PEWTER_CITY:'深灰市',
  MAP_POKEMON_MANSION_1F:'宝可梦屋一层', MAP_POKEMON_MANSION_3F:'宝可梦屋三层', MAP_POKEMON_MANSION_B1F:'宝可梦屋地下室',
  MAP_POKEMON_TOWER_5F:'宝可梦塔五层', MAP_POKEMON_TOWER_7F:'宝可梦塔七层', MAP_POWER_PLANT:'无人发电厂',
  MAP_ROCKET_HIDEOUT_B1F:'火箭队地下基地一层', MAP_ROCKET_HIDEOUT_B3F:'火箭队地下基地三层', MAP_ROCKET_HIDEOUT_B4F:'火箭队地下基地四层',
  MAP_ROUTE10:'十号道路', MAP_ROUTE11:'十一号道路', MAP_ROUTE12:'十二号道路', MAP_ROUTE13:'十三号道路', MAP_ROUTE14:'十四号道路',
  MAP_ROUTE16:'十六号道路', MAP_ROUTE17:'十七号道路', MAP_ROUTE20:'二十号道路', MAP_ROUTE21_NORTH:'二十一号道路北段',
  MAP_ROUTE23:'二十三号道路', MAP_ROUTE24:'二十四号道路', MAP_ROUTE25:'二十五号道路', MAP_ROUTE3:'三号道路', MAP_ROUTE4:'四号道路',
  MAP_ROUTE6:'六号道路', MAP_ROUTE7:'七号道路', MAP_ROUTE8:'八号道路', MAP_ROUTE9:'九号道路', MAP_SAFARI_ZONE_CENTER:'狩猎地带中心',
  MAP_SAFARI_ZONE_WEST:'狩猎地带西区', MAP_SAFFRON_CITY_COPYCATS_HOUSE_2F:'金黄市模仿少女家二楼', MAP_SEAFOAM_ISLANDS_B3F:'双子岛地下三区',
  MAP_SEAFOAM_ISLANDS_B4F:'双子岛地下四区', MAP_SEVEN_ISLAND_SEVAULT_CANYON:'七之岛遗迹峡谷', MAP_SEVEN_ISLAND_SEVAULT_CANYON_ENTRANCE:'七之岛遗迹峡谷入口',
  MAP_SEVEN_ISLAND_TANOBY_RUINS:'七之岛遗迹', MAP_SEVEN_ISLAND_TRAINER_TOWER:'七之岛训练家之塔', MAP_SILPH_CO_10F:'西尔佛公司十层',
  MAP_SILPH_CO_11F:'西尔佛公司十一层', MAP_SILPH_CO_2F:'西尔佛公司二层', MAP_SILPH_CO_3F:'西尔佛公司三层', MAP_SILPH_CO_4F:'西尔佛公司四层',
  MAP_SILPH_CO_5F:'西尔佛公司五层', MAP_SILPH_CO_6F:'西尔佛公司六层', MAP_SILPH_CO_7F:'西尔佛公司七层', MAP_SILPH_CO_8F:'西尔佛公司八层',
  MAP_SILPH_CO_9F:'西尔佛公司九层', MAP_SIX_ISLAND:'六之岛', MAP_SIX_ISLAND_GREEN_PATH:'六之岛绿色小径', MAP_SIX_ISLAND_OUTCAST_ISLAND:'六之岛遗弃之岛',
  MAP_SIX_ISLAND_WATER_PATH:'六之岛水之小径', MAP_SSANNE_B1F_CORRIDOR:'圣安奴号地下走廊', MAP_SSANNE_EXTERIOR:'圣安奴号甲板', MAP_SSANNE_KITCHEN:'圣安奴号厨房',
  MAP_THREE_ISLAND:'三之岛', MAP_THREE_ISLAND_BERRY_FOREST:'三之岛浆果森林', MAP_THREE_ISLAND_BOND_BRIDGE:'三之岛羁绊之桥',
  MAP_TWO_ISLAND_CAPE_BRINK:'二之岛岬岸', MAP_UNDERGROUND_PATH_EAST_WEST_TUNNEL:'地下通道东西隧道', MAP_UNDERGROUND_PATH_NORTH_SOUTH_TUNNEL:'地下通道南北隧道',
  MAP_VERMILION_CITY:'枯叶市', MAP_VICTORY_ROAD_1F:'冠军之路一层', MAP_VIRIDIAN_CITY_GYM:'常青道馆', MAP_VIRIDIAN_FOREST:'常青森林'
});
const SCENES = Object.freeze(HIDDEN_MAPS.slice(0, 8));
const ACHIEVEMENTS = Object.freeze(['kanto-champion','rocket-network-broken','hidden-sites-8','deep-quest-3','perfect-teamwork']);
const ACHIEVEMENT_LABELS = Object.freeze({'kanto-champion':'关都联盟冠军','rocket-network-broken':'火箭队网络瓦解','hidden-sites-8':'发现八处隐藏物品','deep-quest-3':'完成三项深度委托','perfect-teamwork':'伙伴信赖达到100'});
const COSTS = Object.freeze({money:[0,300,600,900,1400],coins:[50,100,200,400,800]});
const all = [];
for (let i=0;i<100;i++) {
  const group=Math.floor(i/25), archetype=ARCHETYPES[i%ARCHETYPES.length], variant=Math.floor(i/ARCHETYPES.length), palette=PALETTES[(i*3+variant)%PALETTES.length];
  const showcase=SHOWCASE_PARTICLES[i],rarity=['稀有','珍贵','华彩','传说'][Math.floor(i/25)],family=showcase?.family||THEMES[i%THEMES.length],form=showcase?.form||PRESENTATION_FORMS[i%PRESENTATION_FORMS.length];
  const slot=['aura','entry','move','outcome'][i%4];
  let unlock;
  if(group===0)unlock={kind:'badge',count:Math.min(8,Math.max(0,Math.floor(i/3)))};
  else if(group===1)unlock={kind:'boss',id:BOSS_IDS[(i-25)%BOSS_IDS.length]};
  else if(group===2)unlock={kind:'quest',id:DEEP_QUESTS[(i-50)%DEEP_QUESTS.length],count:Math.floor((i-50)/6)+1};
  else unlock={kind:'scene',id:SCENES[(i-75)%SCENES.length],count:Math.floor((i-75)/5)+1};
  const casino=i>=80&&i<90;
  const cost=casino?{coins:COSTS.coins[(i-80)%COSTS.coins.length]}:{money:COSTS.money[(i+variant)%COSTS.money.length]};
  if(i>=90)unlock={kind:'achievement',id:ACHIEVEMENTS[(i-90)%ACHIEVEMENTS.length]};
  const particleId=showcase?.particleId||PARTICLE_ROWS[i%PARTICLE_ROWS.length][0],particleLabel=PARTICLE_ROWS.find(row=>row[0]===particleId)?.[2]||FORM_LABELS[form];
  all.push(Object.freeze({
    id:`kfx-${String(i+1).padStart(3,'0')}`,name:showcase?.name||`${particleLabel} · ${['初现','流光','回响','极境'][variant%4]}`,
    slot,slotName:SLOT_NAMES[slot],rarity:['稀有','珍贵','华彩','传说'][Math.floor(i/25)],
    description:showcase?.description||`原创像素${particleLabel}登场效果：独立sprite与动作节奏，限外观展示。`,
    effect:{particleId,cosmeticSlot:slot,family,form,rarity,variant:variant%8,geometry:showcase?.form||archetype[2],emitter:['radial','spiral','fan','burst'][i%4],trajectory:{type:['orbit','spiral','ballistic','wave'][i%4],variant:variant,spread:.58+(variant%4)*.12,curvature:.65+(variant%4)*.2},layers:2+(i%3),particleCount:18+(i*7)%48,seed:i+1,colors:showcase?.colors||PARTICLE_PALETTES[particleId]||palette,scale:[.76,.9,1.05,1.18][variant%4],speed:[.78,1,1.18,1.35][variant%4]},
    unlock,cost
  }));
}
const NEW_UNLOCKS = Object.freeze([
  ...Array.from({length:10},(_,i)=>({kind:'badge',count:1+(i%8)})),
  ...Array.from({length:10},(_,i)=>({kind:'boss',id:BOSS_IDS[i%BOSS_IDS.length]})),
  ...Array.from({length:10},(_,i)=>({kind:'quest',id:DEEP_QUESTS[i%DEEP_QUESTS.length],count:1+(i%3)})),
  ...Array.from({length:10},(_,i)=>({kind:'scene',id:SCENES[i%SCENES.length],count:1+(i%3)})),
  ...Array.from({length:10},()=>({kind:'badge',count:0})),
  ...Array.from({length:10},(_,i)=>({kind:'trust',count:[60,70,80,90,100][i%5]}))
]);
for(let offset=0;offset<60;offset++){
  const i=100+offset,archetype=ARCHETYPES[(i*7+Math.floor(i/8))%ARCHETYPES.length],family=THEMES[(offset*5+Math.floor(offset/8))%THEMES.length];
  const unlock=NEW_UNLOCKS[offset],slot=['aura','entry','move','outcome'][offset%4],rare=offset%6===0;
  const palette=PALETTES[(offset*3+Math.floor(offset/8))%PALETTES.length],variant=Math.floor(offset/8),form=PRESENTATION_FORMS[i%PRESENTATION_FORMS.length];
  const coin=offset>=40&&offset<50,coins=COSTS.coins[(offset-40)%COSTS.coins.length];
  const particleId=PARTICLE_ROWS[i%PARTICLE_ROWS.length][0],particleLabel=PARTICLE_ROWS.find(row=>row[0]===particleId)?.[2]||FORM_LABELS[form];
  all.push(Object.freeze({
    id:`kfx-${String(i+1).padStart(3,'0')}`,name:`${particleLabel} · ${['绽放','回响','疾风','辉耀'][offset%4]}`,
    slot,slotName:SLOT_NAMES[slot],rarity:rare||i>=125?'传说':i>=115?'华彩':'珍贵',
    description:`原创像素${particleLabel}登场效果：保留专属轮廓与动作节奏，限外观展示。`,
    effect:{particleId,cosmeticSlot:slot,family,form,rarity:rare||i>=125?'传说':i>=115?'华彩':'珍贵',variant:offset%8,geometry:archetype[2],emitter:['radial','spiral','fan','burst'][offset%4],trajectory:{type:['orbit','spiral','ballistic','wave'][offset%4],variant,spread:.62+(variant%5)*.1,curvature:.7+(variant%4)*.18},layers:2+(offset%3),particleCount:20+(offset*7)%44,seed:i+1,colors:PARTICLE_PALETTES[particleId]||palette,scale:[.8,.94,1.08,1.22][offset%4],speed:[.82,1,1.16,1.32][offset%4],prestige:rare||i>=125},
    unlock,cost:coin?{coins}:{money:COSTS.money[(offset+variant)%COSTS.money.length]}
  }));
}
const HELL_REWARDS=Object.freeze({
 brock:'小刚·岩峰',misty:'小霞·潮汐',lt_surge:'马志士·雷霆',erika:'莉佳·花舞',koga:'阿桔·毒雾',sabrina:'娜姿·念力',blaine:'夏伯·烈焰',giovanni:'坂木·大地',
 lorelei:'科拿·冰晶',bruno:'希巴·斗志',agatha:'菊子·幽魂',lance:'渡·龙威',champion:'冠军·荣光',rival:'小茂·初战',
 'rival-route22':'小茂·道路再战','silph-showdown':'小茂·西尔佛试炼','rocket-bridge':'火箭队·金珠桥','rocket-celadon':'火箭队·玉虹',
 apollo:'阿波罗·暗影',athena:'雅典娜·幻影',lance_rocket:'兰斯·断电',lambda:'拉姆达·潜行',rocket_viridian:'坂木·终局'
});
const HELL_COLORS=Object.freeze({
 brock:['#d1ac77','#f7dfa8','#76513a'],misty:['#43bfe8','#b9f4ff','#2257b3'],lt_surge:['#ffe04e','#fff7bb','#e7841e'],erika:['#f28cb4','#e0ffb1','#559d62'],koga:['#a867d7','#e0a9ff','#492c73'],sabrina:['#d37efa','#fff2ff','#5c49bf'],blaine:['#ff6a27','#ffe16a','#b52721'],giovanni:['#b7834c','#eed19b','#59412e'],
 lorelei:['#8feaff','#e5fdff','#5682d8'],bruno:['#ef9060','#ffdc98','#943a30'],agatha:['#a99cf3','#e5d2ff','#443775'],lance:['#ef635a','#ffca72','#81325a'],champion:['#ffd15b','#fff7c5','#df753c'],rival:['#65c8f3','#ffffff','#4164cc'],
 'rival-route22':['#a1e766','#f5ffc1','#388e69'],'silph-showdown':['#5ad5dc','#e7ffff','#5b56b9'],'rocket-bridge':['#ed6a80','#ffd1c4','#56385f'],'rocket-celadon':['#ce74b7','#f8c8ef','#583b7b'],
 apollo:['#de6274','#ffc4b6','#583048'],athena:['#f18fc8','#ffdef0','#803e80'],lance_rocket:['#d4aa58','#fff0a5','#575460'],lambda:['#8cbd83','#e4f5bb','#425863'],rocket_viridian:['#e26653','#ffe1a4','#593230']
});
for(const [key,label] of Object.entries(HELL_REWARDS)){
 const id='hell-'+key.replaceAll('_','-');
 all.push(Object.freeze({id,name:`地狱首胜·${label}`,slot:'aura',slotName:SLOT_NAMES.aura,rarity:'传说',description:`地狱难度战胜${label.split('·')[0]}的纪念特效，仅改变舞台外观。`,effect:{particleId:id,cosmeticSlot:'aura',family:'fire',form:id,rarity:'传说',geometry:id,emitter:'spiral',trajectory:{type:'spiral',variant:0,spread:.8,curvature:1},layers:3,particleCount:48,seed:161,colors:HELL_COLORS[key],scale:1.1,speed:1,prestige:true},unlock:{kind:'hell-first-win'},cost:{money:0}}));
}
const ORIGINAL_EFFECTS=[
 ['starsea','雾灯星鲸','water','wavefront',{kind:'quest',id:DEEP_QUESTS[0],count:2}],
 ['koi','镜湖双鲤','water','ripple',{kind:'boss',id:'misty'}],
 ['hourglass','沙时星仪','starlight','constellation',{kind:'achievement',id:'deep-quest-3'}],
 ['eclipse','蚀月之庭','ghost','portal',{kind:'boss',id:'agatha'}],
 ['aurora','天穹极光','ice','ribbon-loop',{kind:'badge',count:8}],
 ['fireflies','萤森夜语','leaf','petal-vortex',{kind:'trust',count:60}],
 ['windchime','候鸟风铃','starlight','wing-arcs',{kind:'story',id:'vermilion-butterfree-migration'},'完成巴大蝶迁徙剧情后领取：铜铃随风摆动，羽片依次掠过，细小声纹沿外缘散开。'],
 ['ferntrail','森径叶脉','leaf','ground-glyph',{kind:'story',id:'yellow-forest-listening'},'完成小黄的森林倾听剧情后领取：蕨叶逐片展开，叶脉沿地面依次点亮，再汇成安静的林径。'],
 ['clockwork','解锁齿轮','dust','helix',{kind:'quest',id:'ash-silph-rescue',count:1,exact:true},'完成西尔佛救援委托后领取：黄铜齿轮反向啮合，钥匙转过锁孔，解锁后的光沿机械轨道运行。']
];
for(const [n,[key,name,family,form,unlock,description]]of ORIGINAL_EFFECTS.entries())all.push(Object.freeze({
 id:'original-'+key,name,slot:'entry',slotName:SLOT_NAMES.entry,slotChoices:Object.keys(SLOT_NAMES),rarity:'传说',description:(description||'原创动态演出：分体动作、材质形变与环境光；可选择播放时机。')+'仅改变舞台外观。',unlock,cost:{money:0},
 effect:{particleId:'original-'+key,cosmeticSlot:'entry',family,form,geometry:form,rarity:'传说',variant:n,emitter:'burst',trajectory:{type:['orbit','spiral','ballistic','wave'][n%4],variant:n,spread:1,curvature:1},layers:4,particleCount:20,seed:600+n,colors:['#88d7ec','#fff1c4','#36476c'],scale:1,speed:1,layer:'auto'}
}));
const ART_NAMES=Object.freeze({"shiny": "星辉初绽", "secret-shiny": "极光星冕", "hitodama": "幽蓝魂焰", "bats": "月夜蝠舞", "ghosts": "灵灯巡游", "the-eye": "虚空凝视", "pumpkings-delight": "焰羽新生", "rising-star": "逐光流星", "snowflake": "霜枝冬华", "present": "风铃祝福", "paper-lantern": "归途灯影", "fireworks": "花火庆典", "pungent-stench": "毒沼流岚", "black-hole": "星渊黑洞", "witchs-haze": "暮影轻纱", "pumpkids-treat": "余烬花雨", "witchs-cat": "月影灵猫", "pumpcat": "暮火守灵", "white-kitty": "雪夜守灵", "spinning-scythe": "银月回刃", "spiders-web": "银丝星网", "zombies-grip": "幽影封印", "zodiac": "流光星宿", "eerie-howl": "月下长啸", "graveyard": "寂静碑林", "kings-fall": "落日王冕", "red-dragon": "赤龙巡天", "anniversary-cake": "芳华蝶舞", "kanto-friends": "初旅三色", "shiny-kanto-friends": "虹彩同途", "menacing-spirit": "冥焰威仪", "shiny-menacing-spirit": "紫金冥焰", "xmas-decorations": "霜雪铃音", "spirit-of-spring": "青藤生息", "phantom": "夜幕游灵", "shiny-phantom": "月华游灵", "dark-crystal": "暗晶共鸣", "shiny-dark-crystal": "虹晶棱光", "lotus-field": "庭园清梦", "blood-lotus-field": "绯莲夜境"});
for(let i=0;i<all.length;i++){const item=all[i],label=ART_NAMES[item.effect.particleId];if(label){const suffix=item.name.includes(' · ')?item.name.slice(item.name.indexOf(' · ')):'';all[i]=Object.freeze({...item,name:label+suffix,effect:{...item.effect,layer:'auto'},slotChoices:Object.keys(SLOT_NAMES),description:'原创分层动态演出，可选择登场、出招、常驻光环或胜利时播放；仅改变舞台外观。'});}}
for(const [n,item]of all.entries())if(item.id==='kfx-160')all[n]=Object.freeze({...item,name:'双羽同行 · 满羁绊',effect:{...item.effect,particleId:'bond-canopy',bond100:true},unlock:{kind:'trust',count:100},cost:{money:0},description:'信赖100解锁：双羽随同伴的节奏张合，羽尾相触后分开。仅改变舞台外观。'});
// New representative rewards follow what the player actually accomplished.
// Old owned IDs/equipment are kept even if their acquisition route is refined.
const THEMED_UNLOCKS={
 'lotus-field':{kind:'quest',id:'erika-garden-rest',count:1,exact:true},
 'paper-lantern':{kind:'quest',id:'lavender-tower-lanterns',count:1,exact:true},
 'witchs-haze':{kind:'quest',id:'rocket-lavender-transparency',count:1,exact:true},
 'witchs-cat':{kind:'trust',count:60},
 'spinning-scythe':{kind:'boss',id:'agatha'},
 'red-dragon':{kind:'boss',id:'lance'},
 'kanto-friends':{kind:'quest',id:'oak-open-field',count:1,exact:true},
 'dark-crystal':{kind:'scene',id:'MAP_CERULEAN_CAVE_1F',count:1,exact:true},
 'pumpkings-delight':{kind:'boss',id:'blaine'},
 'snowflake':{kind:'boss',id:'lorelei'},
 'anniversary-cake':{kind:'story',id:'vermilion-butterfree-migration'},
 'original-starsea':{kind:'story',id:'bill-lighthouse-unknown'},
 'original-koi':{kind:'quest',id:'misty-water-memory',count:1,exact:true}
};
for(const [particleId,unlock]of Object.entries(THEMED_UNLOCKS)){const index=all.findIndex(item=>item.effect.particleId===particleId);if(index>=0)all[index]=Object.freeze({...all[index],unlock,cost:{money:0}});}
const ORDINARY_REWARDS=readData('ordinary-effects.json');
const RETIRED_PARTICLES=new Set(['shiny','secret-shiny','kanto-friends','shiny-kanto-friends','shiny-menacing-spirit','shiny-phantom','shiny-dark-crystal']);
for(let i=0;i<all.length;i++){
 const item=all[i],reward=ORDINARY_REWARDS.find(reward=>reward.id===item.effect.particleId);
 if(reward)all[i]=Object.freeze({...item,name:reward.title+(item.id==='kfx-160'?' · 满羁绊':''),unlock:reward.unlock,cost:{money:0},description:`${reward.title}：四动作原创奖励演出，随对应经历解锁，可选择播放时机。仅改变舞台外观。`});
 else if(RETIRED_PARTICLES.has(item.effect.particleId))all[i]=Object.freeze({...item,retired:true});
}
const STORY_UNLOCK_NAMES=Object.freeze(Object.fromEntries(readData('kanto-story-events.json').map(event=>[event.id,event.title])));
function acquisitionText(item){const u=item.unlock;
 if(u.kind==='hell-first-win')return '先在其他难度战胜对应对手，再赢得地狱重赛首胜，自动获得。';
 if(u.kind==='quest'){const title=DEEP_QUEST_CATALOG.find(q=>q.id===u.id)?.title||'指定委托';return u.exact?`完成委托「${title}」后领取。`:`完成${u.count}项深度委托，或完成「${title}」后领取。`;}
 if(u.kind==='story')return `完成剧情「${STORY_UNLOCK_NAMES[u.id]||'指定剧情'}」后领取。`;
 if(u.kind==='trust')return `伙伴信赖达到${u.count}后领取。`;
 if(u.kind==='boss')return `战胜${bossNames[u.id]||'对应首领'}后领取。`;
 if(u.kind==='badge')return u.count?`获得${u.count}枚徽章后领取。`:'旅程开始即可领取。';
 if(u.kind==='scene')return u.exact?`到访「${SCENE_LABELS[u.id]||'对应地点'}」后领取。`:`探索${u.count}处隐藏地点，或到访「${SCENE_LABELS[u.id]||'对应地点'}」后领取。`;
 return `达成「${ACHIEVEMENT_LABELS[u.id]||'对应成就'}」后领取。`;
}
const REFERENCE_PARTICLES=Object.freeze([...PARTICLE_ROWS.map(([key,name,label],index)=>{const reward=ORDINARY_REWARDS.find(row=>row.id===key);return Object.freeze({id:`reference-${String(index+1).padStart(2,'0')}`,key,name:reward?.title||ART_NAMES[key]||name,label:reward?.title||ART_NAMES[key]||label,legacyName:name,legacyLabel:label,retired:RETIRED_PARTICLES.has(key),implemented:true,referenceVerified:false,description:reward?`${reward.title}：四动作原创奖励演出。`:`原创部件动画：${ART_NAMES[key]||label}，与原版名称仅保留兼容映射。`});}),Object.freeze({id:'ordinary-bond-canopy',key:'bond-canopy',name:'双羽同行',label:'双羽同行',implemented:true,referenceVerified:false,description:'信赖100解锁的四动作双羽演出。'})]);
const byId=new Map(all.map(item=>[item.id,item]));
function uniqueStrings(value){return Array.isArray(value)?[...new Set(value.filter(id=>byId.has(id)))]:[];}
function validParameters(p){return p&&typeof p==='object'&&!Array.isArray(p)&&Number.isFinite(p.scale)&&p.scale>=.8&&p.scale<=1.8&&Number.isFinite(p.speed)&&p.speed>=.5&&p.speed<=1.8&&Number.isInteger(p.particleCount)&&p.particleCount>=8&&p.particleCount<=64&&Number.isInteger(p.seed)&&p.seed>=1&&p.seed<=9999&&Number.isFinite(p.opacity)&&p.opacity>=0&&p.opacity<=1&&['front','back','auto'].includes(p.layer);}
function ensure(world){
  if(!world||typeof world!=='object')throw new TypeError('需要关都世界状态。');
  const state=world.外观&&typeof world.外观==='object'&&!Array.isArray(world.外观)?world.外观:{};
  state.版本=1;state.已拥有=uniqueStrings(state.已拥有);state.已装备=state.已装备&&typeof state.已装备==='object'&&!Array.isArray(state.已装备)?state.已装备:{};
  state.已装备.全局=state.已装备.全局&&typeof state.已装备.全局==='object'?state.已装备.全局:{};
  state.已装备.伙伴=state.已装备.伙伴&&typeof state.已装备.伙伴==='object'&&!Array.isArray(state.已装备.伙伴)?state.已装备.伙伴:{};
  const cleanSlots=slots=>{for(const slot of Object.keys(SLOT_NAMES))if(slots[slot]!==''&&(!byId.has(slots[slot])||byId.get(slots[slot]).retired||!state.已拥有.includes(slots[slot])))delete slots[slot];};
  cleanSlots(state.已装备.全局);
  const knownUids=new Set([...(world.队伍||[]),...(world.电脑||[])].map(mon=>mon?.uid).filter(Boolean));
  for(const uid of Object.keys(state.已装备.伙伴))if(!knownUids.has(uid)||!state.已装备.伙伴[uid]||typeof state.已装备.伙伴[uid]!=='object')delete state.已装备.伙伴[uid];else cleanSlots(state.已装备.伙伴[uid]);
  state.参数=state.参数&&typeof state.参数==='object'&&!Array.isArray(state.参数)?state.参数:{};
  for(const [uid,slots]of Object.entries(state.参数)){if(!knownUids.has(uid)||!slots||typeof slots!=='object'||Array.isArray(slots)){delete state.参数[uid];continue;}for(const [slot,p]of Object.entries(slots))if(!Object.hasOwn(SLOT_NAMES,slot)||!validParameters(p)||p.id!==state.已装备.伙伴[uid]?.[slot])delete slots[slot];}
  state.首领胜利=Array.isArray(state.首领胜利)?[...new Set(state.首领胜利.filter(id=>BOSS_IDS.includes(id)))]:[];
  world.外观=state;return world;
}
function completedDeepQuests(world){return Object.entries(world?.委托?.深度记录||{}).filter(([id,record])=>DEEP_QUESTS.includes(id)&&record?.status==='completed').map(([id])=>id);}
function questComplete(world,id){return DEEP_QUESTS.includes(id)&&world?.委托?.深度记录?.[id]?.status==='completed';}
function macroNodeForMap(id){const key=String(id||'').toUpperCase().replace(/^MAP_/,'');const route=key.match(/ROUTE_?(\d+)/);if(route)return `route${Number(route[1])}`;
  const aliases=[['CERULEAN_CAVE','cerulean-cave'],['VIRIDIAN_FOREST','viridian-forest'],['POKEMON_TOWER','pokemon-tower'],['DIGLETTS_CAVE','diglett-cave'],['POWER_PLANT','power-plant'],['VICTORY_ROAD','victory-road'],['MT_MOON','mt-moon'],['SEAFOAM','seafoam'],['SAFARI_ZONE','safari'],['SILPH_CO','saffron'],['CELADON','celadon'],['CERULEAN','cerulean'],['VERMILION','vermilion'],['VIRIDIAN','viridian'],['PEWTER','pewter'],['LAVENDER','lavender'],['FUCHSIA','fuchsia'],['SAFFRON','saffron'],['CINNABAR','cinnabar'],['INDIGO','indigo']];
  return aliases.find(([hint])=>key.includes(hint))?.[1]||null;
}
const HIDDEN_MAP_NODE=Object.freeze(Object.fromEntries(HIDDEN_MAPS.map(id=>[id,macroNodeForMap(id)])));
function macroVisitedNodes(world){return [...new Set(Array.isArray(world?.委托?.探访地点)?world.委托.探访地点:[])];}
function macroHiddenFinds(world){const claimed=world?.剧情?.场地服务?.claimed||{};return [...new Set([claimed['leftovers:route12']?'MAP_ROUTE12':null,claimed['leftovers:route16']?'MAP_ROUTE16':null,claimed.soothebell?'MAP_POKEMON_TOWER_1F':null,claimed.machobrace?'MAP_VIRIDIAN_CITY':null].filter(Boolean))];}
function visitedHiddenScenes(world){const tileVisited=Object.entries(world?.tileWorld?.visited||{}).filter(([id,visited])=>visited===true&&HIDDEN_MAPS.includes(id)).map(([id])=>`tile:${id}`);const nodeSet=new Set(macroVisitedNodes(world));const macroVisited=[...new Set(Object.entries(HIDDEN_MAP_NODE).filter(([,node])=>node&&nodeSet.has(node)).map(([,node])=>`macro:${node}`))];const searched=macroHiddenFinds(world).map(id=>`search:${id}`);return [...new Set([...tileVisited,...macroVisited,...searched])];}
function sceneVisited(world,id){const node=HIDDEN_MAP_NODE[id];return HIDDEN_MAPS.includes(id)&&(world?.tileWorld?.visited?.[id]===true||(node&&macroVisitedNodes(world).includes(node))||macroHiddenFinds(world).includes(id));}
function collectedHiddenSites(world){const tileCollected=Object.entries(world?.tileWorld?.collected||{}).filter(([eventId,collected])=>collected===true&&HIDDEN_EVENT_IDS.has(eventId)).length;const macroCollected=macroHiddenFinds(world).length;return Math.max(tileCollected,macroCollected);}
function achievementEarned(world,id){
  if(id==='kanto-champion')return (world?.统计?.成就||[]).includes(id)||(world?.剧情?.联盟进度||0)>=5;
  if(id==='rocket-network-broken')return ROCKET_EVENTS.every(event=>world?.剧情?.火箭队剧情?.progress?.[event.id]?.complete===true);
  if(id==='hidden-sites-8')return collectedHiddenSites(world)>=8||macroHiddenFinds(world).length>=4;
  if(id==='deep-quest-3')return completedDeepQuests(world).length>=3;
  if(id==='perfect-teamwork')return Object.values(world?.羁绊?.伙伴||{}).some(record=>record?.信赖===100);
  return false;
}
const bossNames=Object.fromEntries(require('./boss-profiles.cjs').definitions().map(boss=>[boss.id,boss.name]));
function unlockState(world,item){
  const u=item.unlock,wins=new Set([...(world?.外观?.首领胜利||[]),...(world?.剧情?.首领胜利||[]),...(world?.剧情?.已完成支线对战||[])]);
  if(u.kind==='hell-first-win')return world?.外观?.已拥有?.includes(item.id)?'':'先在其他难度战胜对应对手一次，再挑战地狱难度重赛；地狱首胜后自动获得。';
  if(u.kind==='badge')return (world?.训练家?.徽章?.length||0)>=u.count?'':'需要获得'+u.count+'枚徽章。';
  if(u.kind==='boss')return wins.has(u.id)?'':`需要战胜首领：${bossNames[u.id]||'关都首领'}。`;
  if(u.kind==='story')return world?.剧情?.关都事件?.进度?.[u.id]?.完成===true?'':`需要完成剧情「${STORY_UNLOCK_NAMES[u.id]||'指定剧情'}」。`;
  if(u.kind==='quest'&&u.exact)return questComplete(world,u.id)?'':`需要完成指定深度委托「${DEEP_QUEST_CATALOG.find(q=>q.id===u.id)?.title||'指定委托'}」。`;
  if(u.kind==='scene'&&u.exact)return sceneVisited(world,u.id)?'':`需要探索并到访「${SCENE_LABELS[u.id]||'对应地点'}」。`;
  if(u.kind==='quest')return completedDeepQuests(world).length>=u.count||questComplete(world,u.id)?'':`需要完成${u.count}项深度委托，或完成「${DEEP_QUEST_CATALOG.find(quest=>quest.id===u.id)?.title||'指定深度委托'}」。`;
  if(u.kind==='scene')return visitedHiddenScenes(world).length>=u.count||sceneVisited(world,u.id)?'':`需要探索${u.count}处含隐藏物品的地点，或到访「${SCENE_LABELS[u.id]||'隐藏地点'}」。`;
  if(u.kind==='achievement')return achievementEarned(world,u.id)?'':`需要达成「${ACHIEVEMENT_LABELS[u.id]||'特殊成就'}」。`;
  if(u.kind==='trust')return Object.values(world?.羁绊?.伙伴||{}).some(record=>Number(record?.信赖)>=u.count)?'':`需要任一伙伴信赖达到${u.count}。`;
  return '获取条件尚未满足。';
}
function affordability(world,item){if(item.cost.coins){const wallet=world?.城市设施?.gameCorner;return wallet?.coinCase===true&&wallet.coins>=item.cost.coins?'':`需要游戏厅代币 ${item.cost.coins} 枚。`;}return (world?.训练家?.金钱||0)>=item.cost.money?'':`需要 ₽${item.cost.money}。`;}
function view(world){const snapshot=ensure(clone(world)),state=snapshot.外观,party=(snapshot.队伍||[]).map(mon=>({uid:mon.uid,name:mon.昵称||mon.name||`图鉴${mon.图鉴编号}`,speciesId:mon.图鉴编号,shiny:mon.闪光===true}));return {catalog:all.filter(item=>!item.retired).map(item=>({...item,acquisition:acquisitionText(item),owned:state.已拥有.includes(item.id),unlockReason:unlockState(snapshot,item),costReason:affordability(snapshot,item)})),particleDirectory:REFERENCE_PARTICLES.filter(item=>!item.retired).map(clone),inventory:state.已拥有.map(id=>byId.get(id)).filter(item=>!item.retired),equipped:clone(state.已装备),parameters:clone(state.参数),party,world:snapshot};}
function apply(world,action,payload={},options={}){
  const next=ensure(clone(world)),id=payload?.id,item=byId.get(id),slot=payload?.slot,uid=payload?.uid;const state=next.外观;
  action=String(action||'').replace(/^cosmetic-/,'');
  if(next.战斗?.状态&&next.战斗.状态!=='finished')throw new Error('请先结束当前对战，再管理舞台外观。');
  if(uid&&!(next.队伍||[]).some(mon=>mon.uid===uid))throw new Error('只能调整当前队伍伙伴的特效；电脑中的伙伴请先取出。');
  if(['equip','unequip','configure','clear'].includes(action)&&!uid)throw new Error('请选择当前队伍中的伙伴。');
  if(action==='clear'){state.已装备.伙伴[uid]=Object.fromEntries(Object.keys(SLOT_NAMES).map(slot=>[slot,'']));delete state.参数[uid];return next;}
  if(!item)throw new Error('没有这件舞台外观。');
  if(item.retired)throw new Error('这款旧特效已下架，请在工坊选择新的普通奖励。');
  if(action==='acquire'){
    if(state.已拥有.includes(id))throw new Error('这件外观已经拥有。');const locked=unlockState(next,item);if(locked)throw new Error(locked);const poor=affordability(next,item);if(poor)throw new Error(poor);
    if(item.cost.coins)next.城市设施.gameCorner.coins-=item.cost.coins;else next.训练家.金钱-=item.cost.money;state.已拥有.push(id);
  }else if(action==='configure'){
    if(!state.已拥有.includes(id))throw new Error('请先领取这件特效，再保存并装备。');
    const p=payload.parameters;if(!validParameters(p))throw new Error('特效参数超出允许范围。');
    const target=slot||item.slot;if(!Object.hasOwn(SLOT_NAMES,target))throw new Error('未知特效时机。');
    (state.已装备.伙伴[uid]||={})[target]=id;(state.参数[uid]||={})[target]={id,scale:p.scale,speed:p.speed,particleCount:p.particleCount,seed:p.seed,opacity:p.opacity,layer:p.layer};
  }else if(action==='equip'){
    const target=slot||item.slot;if(!Object.hasOwn(SLOT_NAMES,target))throw new Error('未知特效时机。');if(!state.已拥有.includes(id))throw new Error('请先解锁并领取这件外观。');const owner=(state.已装备.伙伴[uid]||= {});if(owner[target]!==id&&state.参数[uid])delete state.参数[uid][target];owner[target]=id;
  }else if(action==='unequip'){
    const target=slot||item.slot;if(!Object.hasOwn(SLOT_NAMES,target))throw new Error('未知特效时机。');const owner=state.已装备.伙伴[uid]||={};if((Object.hasOwn(owner,target)?owner[target]:state.已装备.全局[target])!==id)throw new Error('这件外观当前没有装备。');owner[target]='';if(state.参数[uid])delete state.参数[uid][target];
  }else throw new Error('未知外观操作。');
  if(options.storyTurn!==undefined&&(!Number.isSafeInteger(options.storyTurn)||options.storyTurn<1))throw new Error('故事回合无效。');
  return next;
}
function onBattleResult(world,{encounterId,result}={}){
  ensure(world);if(result!=='win'||!BOSS_IDS.includes(encounterId))return world;
  if(!world.外观.首领胜利.includes(encounterId))world.外观.首领胜利.push(encounterId);
  const reward=all.find(item=>!item.retired&&item.unlock.kind==='boss'&&item.unlock.id===encounterId);if(reward&&!world.外观.已拥有.includes(reward.id))world.外观.已拥有.push(reward.id);
  return world;
}
function awardHellFirstWin(world,encounter){
 ensure(world);
 const gym=['brock','misty','lt_surge','erika','koga','sabrina','blaine','giovanni'];
 const league=['lorelei','bruno','agatha','lance','champion'];
 const key=encounter?.storyEventId?encounter.bossProfileId:encounter?.specialId||encounter?.bossProfileId||(encounter?.类型==='gym'?gym[encounter.道馆]:encounter?.联盟!==undefined?league[encounter.联盟]:encounter?.类型==='trainer'&&encounter.训练家==='小茂'?'rival':null);
 if(!Object.hasOwn(HELL_REWARDS,key))return null;
 const id='hell-'+key.replaceAll('_','-');if(world.外观.已拥有.includes(id))return null;
 world.外观.已拥有.push(id);return byId.get(id);
}
function validate(world){
  const state=world?.外观;if(!state||state.版本!==1||!Array.isArray(state.已拥有)||state.已拥有.length>all.length||new Set(state.已拥有).size!==state.已拥有.length||state.已拥有.some(id=>!byId.has(id))||!state.已装备||typeof state.已装备!=='object'||Array.isArray(state.已装备)||!state.已装备.全局||!state.已装备.伙伴||!Array.isArray(state.首领胜利)||state.首领胜利.some(id=>!BOSS_IDS.includes(id)))throw new Error('舞台外观资料无效。');
  const check=slots=>{for(const [slot,id]of Object.entries(slots))if(!Object.hasOwn(SLOT_NAMES,slot)||id!==''&&(!byId.has(id)||!state.已拥有.includes(id)))throw new Error('舞台外观装备槽无效。');};check(state.已装备.全局);
  const uids=new Set([...(world.队伍||[]),...(world.电脑||[])].map(mon=>mon.uid));for(const [uid,slots]of Object.entries(state.已装备.伙伴)){if(!uids.has(uid))throw new Error('舞台外观伙伴UID无效。');check(slots);}for(const [uid,slots]of Object.entries(state.参数||{})){if(!uids.has(uid))throw new Error('特效参数伙伴UID无效。');for(const [slot,p]of Object.entries(slots))if(!validParameters(p)||p.id!==state.已装备.伙伴[uid]?.[slot])throw new Error('保存的特效参数无效。');}return true;
}
module.exports={definitions:()=>all.map(clone),particleDirectory:()=>REFERENCE_PARTICLES.map(clone),ensure,validate,view,apply,onBattleResult,awardHellFirstWin,SLOT_NAMES};
