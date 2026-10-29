(function (root) {
  'use strict';
  const MAX_ACTIVE = 8, MAX_LOOPING = 4, MAX_PARTICLES = 24, live = new Set();
  const THEMES = Object.freeze(['fire','water','leaf','electric','ice','ghost','starlight','dust']);
  const GEOMETRY_THEME = Object.freeze({
    'crown':'fire','meteor':'fire','comet-tail':'fire','fan':'fire',
    'ripple':'water','wavefront':'water','ribbon-loop':'water','vortex':'water',
    'petal-vortex':'leaf','blade-cross':'leaf','spiral-stair':'leaf',
    'helix':'electric','pulse-column':'electric','arc-burst':'electric',
    'hex-shield':'ice','lattice':'ice','prism-shower':'ice',
    'glyph-seal':'ghost','portal':'ghost','afterimage':'ghost',
    'orbit':'starlight','constellation':'starlight','spiral':'starlight','orbiting-cubes':'starlight',
    'ground-rune':'dust','hex-dust':'dust','shiny-burst':'starlight','graveyard':'ghost','lotus-field':'leaf'
  });
  const reduceMotion = () => Boolean(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const cosmeticOpacity=1;
  const seeded = (seed, index) => { let x = (seed * 1664525 + (index + 1) * 1013904223) >>> 0; x ^= x >>> 16; return (x >>> 0) / 4294967296; };
  const palettes = effect => Array.isArray(effect?.colors) && effect.colors.length ? effect.colors.slice(0, 3) : ['#75d7ed', '#d8f8ed', '#f5df9c'];
  function themeFor(effect={}) {
    const key=String(effect.family||effect.theme||effect.id||'').toLowerCase().replace(/[^a-z]/g,'');
    const explicit=THEMES.find(theme=>key===theme||key.includes(theme));
    if(explicit)return explicit;
    const geometry=String(effect.geometry||'').toLowerCase();if(GEOMETRY_THEME[geometry])return GEOMETRY_THEME[geometry];
    const color=String(effect.colors?.[0]||'').toLowerCase(),rgb=color.match(/^#?([0-9a-f]{6})$/i);
    if(rgb){const hex=rgb[1],r=parseInt(hex.slice(0,2),16)/255,g=parseInt(hex.slice(2,4),16)/255,b=parseInt(hex.slice(4,6),16)/255,max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;let hue=0;if(delta){if(max===r)hue=60*(((g-b)/delta)%6);else if(max===g)hue=60*((b-r)/delta+2);else hue=60*((r-g)/delta+4);}if(hue<0)hue+=360;if(hue<16||hue>=345)return 'fire';if(hue<48)return 'dust';if(hue<78)return 'starlight';if(hue<148)return 'leaf';if(hue<192)return 'water';if(hue<222)return 'electric';if(hue<256)return 'ice';return 'ghost';}
    if(/water|aqua|cyan/i.test(color))return 'water';if(/leaf|green/i.test(color))return 'leaf';if(/electric|volt|yellow/i.test(color))return 'electric';if(/ice|frost|blue/i.test(color))return 'ice';if(/ghost|violet|purple/i.test(color))return 'ghost';if(/star|gold/i.test(color))return 'starlight';if(/sand|earth/i.test(color))return 'dust';
    return THEMES[(Math.max(1,Number(effect.seed)||1)-1)%THEMES.length];
  }
  function particle(ctx,theme,x,y,size,color,rotation,alpha){
    ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=Math.max(.8,size*.16);ctx.shadowColor=color;ctx.shadowBlur=theme==='ice'||theme==='starlight'?5:3;
    ctx.beginPath();
    if(theme==='fire'){
      const flame=ctx.createLinearGradient?.(0,-size,0,size);if(flame?.addColorStop){flame.addColorStop(0,'#fff7c7');flame.addColorStop(.38,color);flame.addColorStop(1,'#e64225');ctx.fillStyle=flame;}
      ctx.moveTo(0,size);ctx.bezierCurveTo(-size*.95,size*.2,-size*.55,-size*.5,0,-size);ctx.bezierCurveTo(size*.1,-size*.25,size*.92,-size*.28,size*.48,size*.58);ctx.quadraticCurveTo(size*.3,size*.95,0,size);ctx.fill();
    }else if(theme==='water'){
      ctx.moveTo(0,-size);ctx.quadraticCurveTo(size*.9,-size*.05,size*.58,size*.62);ctx.quadraticCurveTo(0,size*1.2,-size*.58,size*.62);ctx.quadraticCurveTo(-size*.9,-size*.05,0,-size);ctx.fill();
    }else if(theme==='leaf'){
      ctx.moveTo(-size,0);ctx.quadraticCurveTo(-size*.1,-size*1.15,size,0);ctx.quadraticCurveTo(size*.1,size*1.1,-size,0);ctx.fill();ctx.beginPath();ctx.moveTo(-size*.72,size*.08);ctx.lineTo(size*.68,-size*.08);ctx.stroke();
    }else if(theme==='electric'){
      ctx.moveTo(-size*.36,-size);ctx.lineTo(size*.2,-size*.16);ctx.lineTo(-size*.12,-size*.04);ctx.lineTo(size*.4,size);ctx.stroke();
      ctx.beginPath();ctx.moveTo(-size*.05,-size*.12);ctx.lineTo(-size*.85,size*.28);ctx.lineTo(-size*.48,size*.35);ctx.stroke();
      ctx.fillStyle='#fffef0';ctx.shadowColor='#ffffff';ctx.shadowBlur=8;ctx.beginPath();ctx.arc(0,0,size*.19,0,Math.PI*2);ctx.fill();
    }else if(theme==='ice'){
      ctx.moveTo(0,-size);ctx.lineTo(size*.58,0);ctx.lineTo(0,size);ctx.lineTo(-size*.58,0);ctx.closePath();ctx.fill();ctx.globalAlpha*=.82;ctx.beginPath();ctx.moveTo(-size*.3,0);ctx.lineTo(size*.3,0);ctx.moveTo(0,-size*.45);ctx.lineTo(0,size*.45);ctx.stroke();
    }else if(theme==='ghost'){
      ctx.ellipse(0,0,size*.7,size*1.2,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha*=.55;ctx.beginPath();ctx.arc(-size*.28,-size*.12,size*.44,-1.2,1.25);ctx.stroke();
    }else if(theme==='starlight'){
      ctx.moveTo(0,-size);ctx.lineTo(size*.2,-size*.22);ctx.lineTo(size,size*.05);ctx.lineTo(size*.23,size*.28);ctx.lineTo(0,size);ctx.lineTo(-size*.2,size*.28);ctx.lineTo(-size,size*.05);ctx.lineTo(-size*.2,-size*.22);ctx.closePath();ctx.fill();
    }else{
      ctx.ellipse(0,0,size*.85,size*.52,0,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  const FORM_ALIASES=Object.freeze({
    orbit:'double-orbit',spiral:'comet-tail',ripple:'pulse-rings',helix:'updraft',crown:'wing-arcs',
    'hex-shield':'hex-shield',lattice:'constellation',meteor:'shard-burst','comet-tail':'comet-tail',fan:'fountain-fan',
    'petal-vortex':'petal-orbit','blade-cross':'wing-arcs','ribbon-loop':'ribbon-loop','glyph-seal':'ground-glyph',
    portal:'accretion',constellation:'constellation','prism-shower':'snowfall',wavefront:'wavefront',afterimage:'comet-tail',
    'pulse-column':'light-column',vortex:'updraft','spiral-stair':'updraft','orbiting-cubes':'double-orbit',
    'ground-rune':'ground-glyph','arc-burst':'radial-shards','hex-dust':'sand-drift',
    'black-hole':'black-hole','portal-cat':'portal-cat','bat-swarm':'bat-swarm','spectral-eye':'spectral-eye','lantern-rise':'lantern-rise','scythe-orbit':'scythe-orbit','dragon-coil':'dragon-coil','crystal-crown':'crystal-crown','kanto-trio':'kanto-trio','fireworks':'fireworks','shiny-burst':'shiny-burst','graveyard':'graveyard','lotus-field':'lotus-field'
  });
  const FORMS=Object.freeze(['double-orbit','comet-tail','updraft','fountain-fan','pulse-rings','petal-orbit','constellation','accretion','wing-arcs','rainfall','snowfall','ember-fall','radial-shards','wavefront','ribbon-loop','light-column','hex-shield','ground-glyph','sand-drift','afterimage','black-hole','portal-cat','bat-swarm','spectral-eye','lantern-rise','scythe-orbit','dragon-coil','crystal-crown','kanto-trio','fireworks','shiny-burst','graveyard','lotus-field']);
  const scriptUrl=root.document?.currentScript?.src||root.location?.href||'';const trioAssets=new Map();
  const PIXEL_FORMS=new Set(['hell-brock','hell-misty','hell-lt-surge','hell-erika','hell-koga','hell-sabrina','hell-blaine','hell-giovanni','hell-lorelei','hell-bruno','hell-agatha','hell-lance','hell-champion','hell-rival','hell-apollo','hell-athena','hell-lance-rocket','hell-lambda','hell-rocket-viridian','hell-rival-route22','hell-silph-showdown','hell-rocket-bridge','hell-rocket-celadon','hell-first-win','shiny','secret-shiny','hitodama','bats','ghosts','the-eye','pumpkings-delight','rising-star','snowflake','present','paper-lantern','fireworks','pungent-stench','black-hole','witchs-haze','pumpkids-treat','witchs-cat','pumpcat','white-kitty','spinning-scythe','spiders-web','zombies-grip','zodiac','eerie-howl','graveyard','kings-fall','red-dragon','anniversary-cake','kanto-friends','shiny-kanto-friends','menacing-spirit','shiny-menacing-spirit','xmas-decorations','spirit-of-spring','phantom','shiny-phantom','dark-crystal','shiny-dark-crystal','lotus-field','blood-lotus-field','original-starsea','original-koi','original-hourglass','original-eclipse','original-aurora','original-fireflies']);
  const LEGACY_PIXEL_IDS=Object.freeze({'shiny-burst':'shiny','fireworks':'fireworks','black-hole':'black-hole','bat-swarm':'bats','graveyard':'graveyard','lotus-field':'lotus-field'});
  PIXEL_FORMS.add('bond-canopy');
  const pixelCanvas=root.document?.createElement?.('canvas')||null;
  if(pixelCanvas){pixelCanvas.width=120;pixelCanvas.height=68;const pixelContext=pixelCanvas.getContext('2d');if(pixelContext)pixelContext.imageSmoothingEnabled=false;}
  const PIXEL_SPRITES=Object.freeze({
    batA:['44....44.44....44','4114.41114114.4114','4121411221141214','4122112221122114','..412211122114..','...41122222114...','....41112114....','.....411114.....','......4444......'],
    batB:['..44.........44..','.4124.......4214.','4122144...4412214','41222114441122214','.411221122112211.','..41122122112214.','...41122222114...','....41112114.....','.....411114......'],
    tomb:['...44444...','..4111114..','.412222114.','41221122114','41221122114','41222222114','41222122114','41222222114','41111111114','44444444444'],
    lotusPetal:['...44...','..4224..','.4221224','42111224','42111224','.422224.','..4444..'],
    star:['...4...','...2...','..121..','4211124','..121..','...2...','...4...'],
    ghost:['..444..','.42224.','4122214','4121114','4111114','4.4.4.4'],
    eye:['..444444444..','.42222222224.','4122222222214','4111111111114','.41111111114.','..444444444..'],
    pumpkin:['.4444444.','422222214','421121114','421111114','411111114','411111114','.4444444.'],
    gift:['444444444','422424224','422424224','.4444444.','412222214','412424214','444444444'],
    lantern:['..44444..','.4222224.','.4212214.','.4212214.','.4111114.','.4111114.','..44444..','...444...'],
    cat:['4.4...4.4','.42444424','412222214','412111114','.4111114.','..4...4..','.44...44.'],
    scythe:['...444444','..422...4.','.421....4.','421....4..','4.....44...','.4...44....','..444......'],
    web:['1......1','11....11','1.1..1.1','..1111..','..1..1..','.1....1.','1......1'],
    hand:['...444...','..42224..','.4211224.','.41.1124.','.41.1124.','..41.14..','...444...'],
    dragon:['....44....','...4224...','4442224444','42.2112.24','.41111114.','..44..44..'],
    cake:['..44444..','.4222224.','422222224','411111114','.4444444.','422222224','444444444'],
    crystal:['...44....','..4224...','.421124..','42111224.','.411114..','..4114...','...44....'],
    snow:['...1...','..111..','1111111','.11111.','..111..','...1...'],
    crown:['4.4.4.4','.42424.','4222224','4444444'],
    wolf:['..44....','4422224.','422222224','4211.1114','.4111114.','..44.44..'],
    skull:['..444..','.42224.','4222224','4111114','4.4.4.4','.41114.','..4.4..'],
    candle:['...1...','..111..','...1...','.11111.','1111111','1111111'],
    candy:['.44.','.4224','42124','.4114','.44.'],
    leaf:['..44..','.4224.','422114','.4114.','..44..'],
    zodiac:['..111..','.11111.','1111111','..1.1..','.11.11.','11...11'],
    spring:['..111..','.11111.','1111111','.11111.','..111..','...1...'],
    spirit:['..111..','.11111.','1111111','1.1.1.1','.11111.','..1.1..']
  });
  function pixelSprite(ctx,matrix,x,y,scale,colors,ink='#20233e'){
    for(let row=0;row<matrix.length;row++)for(let col=0;col<matrix[row].length;col++){const bit=matrix[row][col];if(bit==='.'||bit===' ')continue;const color=bit==='1'?colors[0]:bit==='2'?colors[1]||colors[0]:bit==='3'?colors[2]||colors[0]:bit==='4'?ink:ink;ctx.fillStyle=color;ctx.fillRect(Math.round(x+col*scale),Math.round(y+row*scale),scale,scale);}
  }
  function pixelDot(ctx,x,y,size,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),size,size);}
  // Everything is drawn into the same tiny surface.  The staggered layers read as
  // pixel art at any display scale without allocating particle objects each frame.
  function pixelSpark(ctx,x,y,s,inner,outer,alpha=1){
    const r=Math.max(1,Math.round(s));ctx.globalAlpha=clamp(alpha,0,1);
    ctx.fillStyle=outer;ctx.fillRect(Math.round(x-r*2),Math.round(y),r*4+1,r);ctx.fillRect(Math.round(x),Math.round(y-r*2),r,r*4+1);
    pixelDot(ctx,x,y,r,inner);ctx.globalAlpha=1;
  }
  function pixelOrbit(ctx,cx,cy,rx,ry,phase,color,alpha=1,segments=42){
    ctx.globalAlpha=clamp(alpha,0,1);
    for(let i=0;i<segments;i++){const a=(i/segments)*Math.PI*2+phase;if((i%5)!==0)pixelDot(ctx,cx+Math.cos(a)*rx,cy+Math.sin(a)*ry,1,color);}
    ctx.globalAlpha=1;
  }
  const textureCache=new Map(),textureListeners=new Set(),textureRecipes=new Map();
  let textureReadyTimer=0;
  function textureReady(){if((!textureListeners.size&&!live.size)||textureReadyTimer)return;textureReadyTimer=root.setTimeout(()=>{textureReadyTimer=0;for(const callback of textureListeners)callback();for(const item of live)if(item.paused||reduceMotion()||root.document?.hidden){const time=reduceMotion()?.85:item.elapsed/1000;paintCanvas(item.canvas,item.effect,time,item.loop,item.style);if(item.frontCanvas)paintCanvas(item.frontCanvas,{...item.effect,depthPass:'front'},time,item.loop,item.style);}},16);}
  const textureSheets={normalA:['normal-a.png',4,4],normalB:['normal-b.png',4,4],variants:['variants.png',4,2],hellA:['hell-atlas.png',4,3],hellB:['hell-extra.png',4,3]};
  ['shiny','fireworks','black-hole','bats','graveyard','lotus-field','pumpkings-delight','rising-star','snowflake','present','paper-lantern','pungent-stench','witchs-haze','pumpkids-treat','witchs-cat','pumpcat'].forEach((id,n)=>textureRecipes.set(id,['normalA',n]));
  ['white-kitty','spinning-scythe','spiders-web','zombies-grip','zodiac','eerie-howl','kings-fall','red-dragon','anniversary-cake','kanto-friends','menacing-spirit','xmas-decorations','spirit-of-spring','phantom','dark-crystal','blood-lotus-field'].forEach((id,n)=>textureRecipes.set(id,['normalB',n]));
  ['secret-shiny','hitodama','ghosts','the-eye','shiny-kanto-friends','shiny-menacing-spirit','shiny-phantom','shiny-dark-crystal'].forEach((id,n)=>textureRecipes.set(id,['variants',n]));
  ['hell-brock','hell-misty','hell-lt-surge','hell-erika','hell-koga','hell-sabrina','hell-blaine','hell-giovanni','hell-lorelei','hell-agatha','hell-lance','hell-champion'].forEach((id,n)=>textureRecipes.set(id,['hellA',n]));
  ['hell-bruno','hell-rival','hell-rival-route22','hell-silph-showdown','hell-apollo','hell-athena','hell-lance-rocket','hell-lambda','hell-rocket-viridian','hell-rocket-bridge','hell-rocket-celadon','hell-first-win'].forEach((id,n)=>textureRecipes.set(id,['hellB',n]));
  function textureSheet(key){
    if(textureCache.has(key))return textureCache.get(key);
    const base=String(root.__KANTO_FX_ASSET_ROOT__||'');if(!base||typeof root.Image!=='function')return null;
    const spec=textureSheets[key],image=new root.Image(),entry={image,ready:false,failed:false,cells:new Map()};textureCache.set(key,entry);
    image.onload=()=>{entry.ready=Boolean(image.naturalWidth&&image.naturalHeight);textureReady();};image.onerror=()=>{entry.failed=true;textureReady();};image.src=base+spec[0];return entry;
  }
  function textureCell(key,index){
    const entry=textureSheet(key);if(!entry?.ready)return null;if(entry.cells.has(index))return entry.cells.get(index);
    const [,cols,rows]=textureSheets[key],sw=entry.image.naturalWidth/cols,sh=entry.image.naturalHeight/rows;
    const canvas=root.document.createElement('canvas');canvas.width=384;canvas.height=256;const ctx=canvas.getContext('2d');if(!ctx)return null;
    ctx.drawImage(entry.image,(index%cols)*sw,Math.floor(index/cols)*sh,sw,sh,0,0,384,256);
    // Feather the atlas boundaries once; this prevents a rectangular edge even
    // when the painted source includes low-opacity atmospheric haze.
    if(typeof ctx.createRadialGradient==='function'){
      const fade=ctx.createRadialGradient(192,128,90,192,128,220);
      if(fade?.addColorStop){fade.addColorStop(0,'#fff');fade.addColorStop(.7,'#fff');fade.addColorStop(1,'#fff0');ctx.globalCompositeOperation='destination-in';ctx.fillStyle=fade;ctx.fillRect(0,0,384,256);ctx.globalCompositeOperation='source-over';}
    }
    entry.cells.set(index,canvas);return canvas;
  }
  const texturePieces=new WeakMap();
  function animatedTexturePieces(texture){
    if(texturePieces.has(texture))return texturePieces.get(texture);
    // Independently animated wings, crest and ground. Soft masks overlap,
    // avoiding hard rectangular cuts while allowing material to flow locally.
    const regions=[{x:0,y:12,w:174,h:224,axis:'x',reverse:true},{x:210,y:12,w:174,h:224,axis:'x'},
      {x:50,y:0,w:284,h:104,axis:'y',reverse:true},{x:20,y:168,w:344,h:88,axis:'y'}];
    const pieces=regions.map(region=>{
      const canvas=root.document.createElement('canvas');canvas.width=region.w;canvas.height=region.h;const c=canvas.getContext('2d');
      if(!c)return null;c.drawImage(texture,region.x,region.y,region.w,region.h,0,0,region.w,region.h);
      const gradient=c.createLinearGradient?.(0,0,region.axis==='x'?region.w:0,region.axis==='y'?region.h:0);
      if(gradient?.addColorStop){gradient.addColorStop(0,region.reverse?'#fff':'#fff0');gradient.addColorStop(region.reverse?.64:.36,'#fff');gradient.addColorStop(1,region.reverse?'#fff0':'#fff');c.globalCompositeOperation='destination-in';c.fillStyle=gradient;c.fillRect(0,0,region.w,region.h);}
      return {canvas,...region};
    }).filter(Boolean);
    texturePieces.set(texture,pieces);return pieces;
  }
  function drawTexturedScene(ctx,effect,time,width,height,style,id){
    const recipe=textureRecipes.get(id);if(!recipe)return false;const texture=textureCell(recipe[0],recipe[1]);if(!texture)return false;
    const hell=id.startsWith('hell-'),t=Math.max(0,time),phase=t*clamp(Number(effect.speed)||1,.5,1.8),unit=Math.min(width/120,height/68),scale=clamp(Number(effect.scale)||1,.7,2.7),aura=style==='aura',open=aura?1:1-Math.pow(1-clamp(phase/.55,0,1),3),fade=aura?1:1-clamp((t-1.25)/.3,0,1),strength=(hell?.9:.76)*open*fade;
    ctx.save();ctx.translate(width/2+(effect.anchor==='opponent'?23:effect.anchor==='player'?-23:0)*unit,height/2+unit*(1-open)*5);ctx.scale(unit*scale,unit*scale);ctx.imageSmoothingEnabled=true;ctx.shadowBlur=0;
    const span=(hell?108:94)*(.65+open*.35),tall=hell?66:60,theme=themeFor(effect),seed=Number(effect.seed)||1;
    const motion=/fireworks|shiny$|rising-star|champion/.test(id)?'burst':/bats|pumpcat|white-kitty|witchs-cat|kanto-friends/.test(id)?'flock':/lotus|spring|erika/.test(id)?'bloom':/black-hole|sabrina|athena|phantom/.test(id)?'vortex':/misty|water|lorelei|snowflake/.test(id)?'tide':/fire|blaine|dragon|hell-lance$/.test(id)?'flame':/grave|agatha|stench|haze/.test(id)?'mist':'shards';
    // The complete painting is only a quiet atmospheric underlay. Most of the
    // visible light comes from separately articulated material, not a card tilt.
    ctx.globalAlpha=strength*.06;ctx.drawImage(texture,-span/2,-tall/2,span,tall);
    animatedTexturePieces(texture).forEach((part,n)=>{
      const side=n===0?-1:n===1?1:0,osc=Math.sin(phase*(theme==='water'?2.1:1.6)+n*1.9+recipe[1]*.4),burst=aura?0:Math.sin(clamp(phase/.85,0,1)*Math.PI),dx=side*(1.4*osc+(hell?5:3)*burst),dy=n===3?Math.cos(phase*1.4)*.35:n===2?-2*osc-3*burst:-1.8*osc;
      const x=(part.x+part.w/2)/384*span-span/2,y=(part.y+part.h/2)/256*tall-tall/2;
      const flow=motion==='tide'?Math.sin(phase*3+n)*3:motion==='flame'?-Math.sin(phase*4+n)*2:motion==='mist'?Math.sin(phase+n)*4:0;
      ctx.save();ctx.translate(x+dx+(motion==='mist'?flow:0),y+dy+(motion==='tide'||motion==='flame'?flow:0));ctx.rotate(side*osc*(motion==='vortex'?.16:.045)+(n===2?Math.sin(phase)*.018:0));ctx.scale(1+burst*.05,1+(motion==='flame'?.12:motion==='tide'?.055:.025)*osc);ctx.globalAlpha=strength*(n===3?.18:.24);ctx.drawImage(part.canvas,-part.w/384*span/2,-part.h/256*tall/2,part.w/384*span,part.h/256*tall);ctx.restore();
    });
    // Authored material flecks travel on independent curved paths. These sample
    // the textured side wings and remain outside the creature's silhouette.
    const density=clamp(Number(effect.particleCount)||24,8,64)/32,pieces=animatedTexturePieces(texture),flecks=Math.min(32,Math.ceil((motion==='burst'?(hell?28:20):hell?14:9)*density));
    for(let n=0;n<flecks;n++){
      const age=(phase*(aura?.22:.7)+seeded(seed+41,n))%1,side=n%2?-1:1,angle=age*3.2+n*.9,piece=pieces[n%2];let x=side*(22+age*23)+Math.sin(angle)*3,y=22-age*49+Math.sin(angle*1.4)*4,rotation=side*(phase*.7+n);
      if(motion==='vortex'){const orbit=n*2.399+phase*(1.2+seeded(seed,n)*.6),radius=48-age*25;x=Math.cos(orbit)*radius;y=Math.sin(orbit)*radius*.52;rotation=orbit+Math.PI/2;}
      else if(motion==='burst'){const burstAngle=n*2.399,flight=Math.sin(age*Math.PI/2);x=Math.cos(burstAngle)*flight*52;y=-7+Math.sin(burstAngle)*flight*29+age*age*8;rotation=burstAngle;}
      else if(motion==='bloom'){const orbit=n*2.399+phase*.7;x=Math.cos(orbit)*(24+age*20);y=26-age*53+Math.sin(orbit)*6;rotation=Math.sin(phase*2+n)*1.3;}
      else if(motion==='flock'){x=side*(48-age*35);y=-12+Math.sin(age*5+n)*12;rotation=side*Math.sin(phase*4+n)*.2;}
      else if(motion==='tide'){x=side*(21+Math.sin(age*Math.PI)*24);y=28-age*53;rotation=side*(age*Math.PI-.5);}
      else if(motion==='mist'){x=side*(22+age*20);y=20-Math.sin(age*Math.PI)*22;rotation=Math.sin(phase+n)*.2;}
      if(!piece)continue;const size=(hell?5.5:3.8)*(1-age*.5)*(motion==='flock'?1.5:1),sx=clamp(piece.w*.42+Math.sin(n*2.4)*piece.w*.18,0,piece.w-32),sy=clamp(piece.h*.45+Math.cos(n)*piece.h*.2,0,piece.h-40);
      ctx.save();ctx.translate(x,y);ctx.rotate(rotation);if(motion==='flock')ctx.scale(1,.6+Math.abs(Math.sin(phase*9+n))*.5);ctx.globalAlpha=Math.sin(age*Math.PI)*strength*.85;ctx.drawImage(piece.canvas,sx,sy,32,40,-size/2,-size*.625,size,size*1.25);ctx.restore();
    }
    const count=Math.min(40,Math.ceil((hell?22:12)*density)),colors=palettes(effect);
    for(let n=0;n<count;n++){const age=(phase*(hell?.3:.2)+seeded(seed,n))%1,side=n%2?-1:1,r=24+seeded(seed+3,n)*23,x=side*r+Math.sin(phase+n)*2,y=29-age*(hell?56:44),alpha=Math.sin(age*Math.PI)*strength*.7;ctx.globalAlpha=alpha;ctx.fillStyle=n%4?colors[1]||colors[0]:colors[0];ctx.beginPath();ctx.ellipse(x,y,.2+seeded(seed+6,n)*.45,.35+seeded(seed+8,n)*.65,phase+n,0,Math.PI*2);ctx.fill();}
    ctx.restore();return true;
  }
  // The collection uses one restrained illustration language.  These scenes
  // replace the old enlarged pixel symbols, with a clear area for the creature.
  function drawIllustratedScene(ctx,effect,time,width,height,style,id){
    const recipes={shiny:'stars','secret-shiny':'secret','rising-star':'shooting',hitodama:'flames','menacing-spirit':'flames','shiny-menacing-spirit':'spectral-fire','the-eye':'eye','pumpkings-delight':'pumpkin','pumpkids-treat':'treats',snowflake:'snow',present:'gift','paper-lantern':'lantern','pungent-stench':'mist','witchs-haze':'witch-mist','witchs-cat':'witch-cat',pumpcat:'pumpcat','white-kitty':'white-cat',phantom:'phantom','shiny-phantom':'spectral-cat','spinning-scythe':'scythe','spiders-web':'web','zombies-grip':'hands',zodiac:'zodiac','eerie-howl':'moon','graveyard':'graveyard','kings-fall':'crown','anniversary-cake':'cake','xmas-decorations':'winter','spirit-of-spring':'petals','hell-erika':'petals','hell-koga':'mist','hell-sabrina':'psychic','hell-blaine':'flames','hell-bruno':'fists','hell-agatha':'graveyard','hell-lance':'dragon-seal','hell-silph-showdown':'rival-seal','hell-first-win':'spectral-fire'};
    const kind=id==='kanto-friends'?'trio':id==='shiny-kanto-friends'?'shiny-trio':recipes[id];if(!kind)return false;
    const c=palettes(effect),t=Math.max(0,time)*(Number(effect.speed)||1),seed=Number(effect.seed)||1,size=clamp(Number(effect.scale)||1,.7,1.5),unit=Math.min(width/120,height/68)*size;
    const accent=c[0],light=c[1]||'#f6eee0',shade=c[2]||'#514254',p=.5+.5*Math.sin(t*1.7),tau=Math.PI*2;
    ctx.save();ctx.translate(width/2,height/2);ctx.scale(unit,unit);ctx.translate(-60+(effect.anchor==='opponent'?23:effect.anchor==='player'?-23:0),-34);ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowBlur=0;
    const line=(color,w=.6,a=.8)=>{ctx.strokeStyle=color;ctx.lineWidth=w;ctx.globalAlpha=a;ctx.shadowBlur=0;};
    const oval=(x,y,rx,ry,color,a=.5,rot=0)=>{ctx.globalAlpha=a;ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,rot,0,tau);ctx.fill();};
    const ring=(x,y,rx,ry,color,a=.5,rot=0)=>{line(color,.55,a);ctx.beginPath();ctx.ellipse(x,y,rx,ry,rot,0,tau);ctx.stroke();};
    const path=(points,color,a=.8)=>{ctx.globalAlpha=a;ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],n)=>n?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();};
    const star=(x,y,r,color,a=.8,rot=0)=>{ctx.save();ctx.translate(x,y);ctx.rotate(rot);path([[0,-r],[r*.17,-r*.2],[r,0],[r*.17,r*.2],[0,r],[-r*.17,r*.2],[-r,0],[-r*.17,-r*.2]],color,a);ctx.restore();};
    const petal=(x,y,r,color,a=.7,rot=0)=>{ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.fillStyle=color;ctx.globalAlpha=a;ctx.beginPath();ctx.moveTo(0,-r);ctx.bezierCurveTo(-r*.8,-r*.6,-r*.7,r*.7,0,r*.55);ctx.bezierCurveTo(r*.7,r*.7,r*.8,-r*.6,0,-r);ctx.fill();line(light,.25,a*.6);ctx.beginPath();ctx.moveTo(0,-r*.65);ctx.lineTo(0,r*.3);ctx.stroke();ctx.restore();};
    const dust=(color,count=12,rise=true)=>{for(let n=0;n<count;n++){const q=seeded(seed+3,n),age=(t*(.08+q*.1)+seeded(seed,n))%1,x=16+seeded(seed+7,n)*88+Math.sin(t*.6+n)*2,y=rise?56-age*44:10+age*44;oval(x,y,.22+q*.4,.3+q*.3,color,Math.sin(age*Math.PI)*.65);}};
    const flame=(x,y,r,color,phase)=>{ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(phase)*.18);ctx.globalAlpha=.45;ctx.fillStyle=shade;ctx.beginPath();ctx.moveTo(0,3);ctx.bezierCurveTo(-r,-1,-r*.4,-r,0,-r*1.8);ctx.bezierCurveTo(-1,-r*.3,r,-r*.2,r*.5,r*.5);ctx.quadraticCurveTo(r*.2,r,0,3);ctx.fill();ctx.globalAlpha=.8;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,r*.45);ctx.bezierCurveTo(-r*.6,0,-r*.3,-r*.7,0,-r*1.3);ctx.bezierCurveTo(-.4,-r*.2,r*.6,-r*.3,r*.35,r*.3);ctx.closePath();ctx.fill();oval(0,0,r*.17,r*.42,light,.72);ctx.restore();};
    const cat=(x,y,color,a=1)=>{ctx.save();ctx.translate(x,y);oval(0,4,5,6,color,a);path([[-5,-1],[-5,-8],[-1,-5],[2,-5],[6,-9],[5,-1]],color,a);oval(0,-1,5.5,4.5,color,a);line(color,2,a);ctx.beginPath();ctx.moveTo(4,8);ctx.bezierCurveTo(14,11,13,2,9,2);ctx.stroke();oval(-2,-1,.55,.85,light,.9);oval(2,-1,.55,.85,light,.9);ctx.restore();};
    // Small restrained particles support the silhouette, never a common neon ring.
    dust(light,8);
    if(['stars','secret','shooting'].includes(kind)){
      for(let n=0;n<12;n++){const a=n*2.399+t*(kind==='secret'?-.23:.15),r=21+seeded(seed,n)*20,x=60+Math.cos(a)*r,y=28+Math.sin(a)*r*.65,s=.7+seeded(seed+4,n)*1.7,fade=.25+.7*Math.sin(t*2+n)**4;star(x,y,s,n%3?accent:light,fade,a*.13);if(kind==='shooting'){line(light,.35,fade*.4);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-5,y+7);ctx.stroke();}}
      if(kind==='secret'){for(let side of [-1,1]){line(shade,.7,.65);ctx.beginPath();ctx.moveTo(60+side*39,46);ctx.bezierCurveTo(60+side*45,23,60+side*18,8,60+side*7,13);ctx.stroke();}}
    }else if(['flames','spectral-fire'].includes(kind)){
      const total=id==='hell-blaine'?2:id==='menacing-spirit'?3:5;
      for(let n=0;n<total;n++){const x=total===2?30+n*60:24+n*72/Math.max(1,total-1)+Math.sin(t*.9+n)*3,y=total===2?43:28+Math.sin(t*1.5+n*1.6)*5;flame(x,y,(total===2?7:3)+n%2,kind==='spectral-fire'?(n%2?light:accent):accent,t+n);}
      for(let side of [-1,1]){line(shade,.55,.4);ctx.beginPath();ctx.moveTo(60+side*18,57);ctx.bezierCurveTo(60+side*47,50,60+side*24,40,60+side*39,29);ctx.stroke();}
    }else if(kind==='eye'){
      const blink=1-Math.pow(Math.max(0,Math.sin(t*.8)),32),cy=18;line(accent,.7,.85);ctx.beginPath();ctx.moveTo(38,cy);ctx.quadraticCurveTo(60,cy-12*blink,82,cy);ctx.quadraticCurveTo(60,cy+12*blink,38,cy);ctx.stroke();oval(60+Math.sin(t*.6)*3,cy,3.7,5*blink,shade,.88);oval(60+Math.sin(t*.6)*3,cy,1.2,3*blink,light,.8);for(let side of [-1,1]){line(shade,.5,.65);ctx.beginPath();ctx.moveTo(60+side*27,cy);ctx.lineTo(60+side*35,cy+3);ctx.lineTo(60+side*40,cy);ctx.stroke();}
    }else if(['pumpkin','treats','pumpcat'].includes(kind)){
      if(kind==='pumpcat')cat(32,26,shade,.9);
      const cx=kind==='pumpcat'?87:60,cy=19+Math.sin(t*1.5)*1.5;for(let n=-2;n<=2;n++)oval(cx+n*3,cy,4.4,7.5-Math.abs(n),n%2?shade:accent,.82);path([[cx-2,cy-7],[cx-1,cy-12],[cx+2,cy-11],[cx+1,cy-7]],shade,.9);path([[cx-5,cy-2],[cx-2,cy],[cx-5,cy+1]],light,.85);path([[cx+5,cy-2],[cx+2,cy],[cx+5,cy+1]],light,.85);
      if(kind==='treats')for(let n=0;n<7;n++){const a=t*.5+n*tau/7;petal(60+Math.cos(a)*35,32+Math.sin(a)*18,2,n%2?light:accent,.7,a);}
    }else if(kind==='snow'||kind==='winter'){
      for(let n=0;n<7;n++){const x=17+seeded(seed,n)*86,y=8+((t*5+n*7)%43),r=2+seeded(seed+4,n)*3;ctx.save();ctx.translate(x,y);ctx.rotate(t*.12+n);line(n%2?light:accent,.45,.75);for(let k=0;k<6;k++){ctx.rotate(Math.PI/3);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-r);ctx.moveTo(0,-r*.55);ctx.lineTo(-r*.28,-r*.8);ctx.moveTo(0,-r*.55);ctx.lineTo(r*.28,-r*.8);ctx.stroke();}ctx.restore();}
      if(kind==='winter')for(let side of [-1,1])for(let n=0;n<3;n++)petal(60+side*(23+n*6),53-n*2,3,shade,.7,side*.8);
    }else if(kind==='gift'||kind==='cake'){
      const y=20+Math.sin(t*1.5)*1.5,cx=60,open=kind==='gift'?Math.pow(.5+.5*Math.sin(t*1.5),3)*5:0;
      path([[cx-10,y-3],[cx+10,y-3],[cx+10,y+9],[cx-10,y+9]],shade,.9);path([[cx-10,y-3],[cx+8,y-3],[cx+8,y+7],[cx-10,y+7]],accent,.78);path([[cx-11,y-6-open],[cx+11,y-6-open],[cx+11,y-2-open],[cx-11,y-2-open]],light,.78);line(light,1,.8);ctx.beginPath();ctx.moveTo(cx,y-3);ctx.lineTo(cx,y+7);ctx.stroke();
      if(kind==='gift'){ring(cx-3,y-8-open,4,2,light,.8,-.4);ring(cx+3,y-8-open,4,2,light,.8,.4);}else{for(let n=-1;n<=1;n++){line(light,.8,.8);ctx.beginPath();ctx.moveTo(cx+n*5,y-6);ctx.lineTo(cx+n*5,y-10);ctx.stroke();flame(cx+n*5,y-11,1,accent,t+n);}}
    }else if(kind==='lantern'){
      for(let n=0;n<3;n++){const x=29+n*31+Math.sin(t*.6+n)*3,y=21+Math.sin(t*.8+n*2)*5;oval(x,y,6,8,shade,.7);oval(x-1,y,4.5,7,accent,.7);oval(x-2,y,1.5,6,light,.42);line(shade,.55,.9);for(let k=-1;k<=1;k++){ctx.beginPath();ctx.ellipse(x+k*1.5,y,2+Math.abs(k),8,0,0,tau);ctx.stroke();}line(light,.55,.6);ctx.beginPath();ctx.moveTo(x,y+8);ctx.quadraticCurveTo(x+Math.sin(t+n)*3,y+13,x,y+17);ctx.stroke();}
    }else if(kind==='mist'||kind==='witch-mist'){
      for(let n=0;n<9;n++){const age=(t*.14+n*.117)%1,x=20+seeded(seed,n)*80+Math.sin(t*.8+n)*7,y=56-age*30;oval(x,y,7+age*4,2+age*3,n%2?shade:accent,Math.sin(age*Math.PI)*.16);}
      if(kind==='witch-mist'){path([[48,20],[59,5],[65,20]],shade,.8);oval(59,21,17,2,accent,.45);}else for(let n=0;n<4;n++)oval(22+n*25,46+Math.sin(t+n)*2,2,3,light,.2);
    }else if(['witch-cat','white-cat','phantom','spectral-cat'].includes(kind)){
      for(let side of [-1,1]){const x=60+side*28,y=24+Math.sin(t*.9+side)*2;cat(x,y,kind==='white-cat'?light:shade,.7);if(kind==='witch-cat')path([[x-6,y-7],[x,y-16],[x+4,y-6]],accent,.75);if(kind==='phantom'||kind==='spectral-cat'){ring(x,y+8,9,2,accent,.4);petal(x+side*10,y-7,2,light,.6,t+side);}}
    }else if(kind==='scythe'){
      for(let side of [-1,1]){const x=60+side*28,y=26;ctx.save();ctx.translate(x,y);ctx.rotate(side*(.25+Math.sin(t*.8)*.2));line(shade,1.5,.9);ctx.beginPath();ctx.moveTo(0,20);ctx.lineTo(0,-13);ctx.stroke();ctx.fillStyle=light;ctx.globalAlpha=.7;ctx.beginPath();ctx.moveTo(0,-13);ctx.bezierCurveTo(14,-15,17,-4,13,1);ctx.bezierCurveTo(14,-8,6,-12,0,-9);ctx.closePath();ctx.fill();ctx.restore();}
    }else if(kind==='web'){
      for(let side of [-1,1]){const x=60+side*33,y=16;line(light,.35,.5);for(let n=0;n<6;n++){const a=(n/5)*Math.PI;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*17,y+Math.sin(a)*14);ctx.stroke();}for(let r=5;r<=16;r+=5){ctx.beginPath();ctx.ellipse(x,y,r,r*.8,0,0,Math.PI);ctx.stroke();}line(accent,.5,.7);ctx.beginPath();ctx.moveTo(x,y+14);ctx.lineTo(x+Math.sin(t)*1.5,y+24+Math.sin(t*.7)*3);ctx.stroke();oval(x+Math.sin(t)*1.5,y+25+Math.sin(t*.7)*3,1.3,1.8,shade,.9);}
    }else if(kind==='hands'){
      for(let side of [-1,1]){const x=60+side*30,y=53-Math.sin(t*.8+side)*2;path([[x-4,y+3],[x-5,y-8],[x-3,y-9],[x-2,y-3],[x-2,y-15],[x,y-16],[x+1,y-4],[x+2,y-13],[x+4,y-12],[x+4,y-3],[x+6,y-8],[x+8,y-7],[x+4,y+3]],shade,.82);line(accent,.6,.7);ctx.beginPath();ctx.moveTo(x-3,y);ctx.lineTo(x-2,y-9);ctx.moveTo(x+1,y);ctx.lineTo(x+2,y-8);ctx.stroke();}for(let n=0;n<6;n++)oval(22+n*15,57,4,1,shade,.28);
    }else if(kind==='zodiac'||kind==='dragon-seal'){
      ring(60,19,17,13,shade,.5);ring(60,19,20,15,accent,.4);for(let n=0;n<8;n++){const a=n*tau/8+t*.1,x=60+Math.cos(a)*20,y=19+Math.sin(a)*15;star(x,y,1.3,light,.8);if(n%2===0){line(accent,.5,.6);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(60+Math.cos(a+tau*3/8)*15,19+Math.sin(a+tau*3/8)*11);ctx.stroke();}}
      if(kind==='dragon-seal'){line(light,1,.75);ctx.beginPath();ctx.moveTo(52,24);ctx.bezierCurveTo(44,11,73,10,63,20);ctx.bezierCurveTo(52,28,70,29,70,17);ctx.stroke();}
    }else if(kind==='moon'){
      ctx.globalAlpha=.72;ctx.fillStyle=light;ctx.beginPath();ctx.arc(60,15,10,.7,Math.PI*1.8);ctx.bezierCurveTo(52,20,58,26,68,22);ctx.closePath();ctx.fill();for(let side of [-1,1]){path([[60+side*22,55],[60+side*24,35],[60+side*29,29],[60+side*31,23],[60+side*33,31],[60+side*38,34],[60+side*34,39],[60+side*38,55]],shade,.85);}
    }else if(kind==='graveyard'){
      for(let side of [-1,1]){const x=60+side*29,y=55;ctx.globalAlpha=.78;ctx.fillStyle=shade;ctx.beginPath();ctx.moveTo(x-6,y);ctx.lineTo(x-6,y-13);ctx.quadraticCurveTo(x-6,y-21,x,y-21);ctx.quadraticCurveTo(x+6,y-21,x+6,y-13);ctx.lineTo(x+6,y);ctx.closePath();ctx.fill();line(light,.65,.7);ctx.beginPath();ctx.moveTo(x,y-16);ctx.lineTo(x,y-7);ctx.moveTo(x-3,y-13);ctx.lineTo(x+3,y-13);ctx.stroke();flame(x+side*9,y-8+Math.sin(t+side)*2,2,accent,t+side);}
      for(let n=0;n<4;n++)oval(25+n*24+Math.sin(t*.5+n)*5,56,10,1.2,light,.12);
    }else if(kind==='crown'){
      const y=15+Math.sin(t)*2;path([[45,y+7],[43,y-3],[53,y+2],[60,y-7],[67,y+2],[77,y-3],[75,y+7]],shade,.88);path([[46,y+6],[45,y],[53,y+4],[60,y-4],[67,y+4],[75,y],[74,y+6]],accent,.82);for(let n=0;n<5;n++)oval(48+n*6,y+7,.8,.8,light,.8);
      for(let side of [-1,1])for(let n=0;n<5;n++)petal(60+side*(22+n*2),48-n*5,2.8,accent,.45,side*.9);
    }else if(kind==='trio'||kind==='shiny-trio'){
      [1,4,7].forEach((id,n)=>{const x=33+n*27,y=19+Math.sin(t*.9+n)*2,img=trioImage(id);ring(x,y+8,9,2,c[n%3],.3);if(img?.complete&&img.naturalWidth){ctx.globalAlpha=.7;ctx.drawImage(img,x-7,y-9,14,17);}else drawMiniMon(ctx,n,x,y,18,c);if(kind==='shiny-trio')star(x+8,y-7,1.4,light,.7,t*.1+n);});
    }else if(kind==='petals'){
      for(let n=0;n<18;n++){const age=(t*.12+seeded(seed,n))%1,a=n*2.4+t*.3,r=24+Math.sin(age*Math.PI)*17;petal(60+Math.cos(a)*r,17+age*37,1+seeded(seed+9,n)*2,n%3?accent:light,Math.sin(age*Math.PI)*.8,a);}
      for(let side of [-1,1])for(let n=0;n<3;n++)petal(60+side*(22+n*7),55-n%2*2,3,shade,.7,side*(.7+n*.2));
    }
    ctx.restore();return true;
  }
  // These themed entrances use continuous silhouettes and a small number of
  // bounded particles; the creature remains visible in the open center.
  function drawBossScene(ctx,effect,time,width,height,style,id){
    const themes={'hell-brock':'rock','hell-giovanni':'earth','hell-misty':'water','hell-lorelei':'ice','hell-lt-surge':'electric','hell-champion':'champion','hell-rival':'rival','hell-rival-route22':'rival','hell-apollo':'rocket','hell-athena':'rocket','hell-lance-rocket':'rocket','hell-lambda':'rocket','hell-rocket-viridian':'rocket','hell-rocket-bridge':'rocket','hell-rocket-celadon':'rocket'};
    const theme=themes[id];if(!theme)return false;
    const colors=palettes(effect),t=time*(Number(effect.speed)||1),seed=Number(effect.seed)||1,crop=style==='thumbnail',sx=crop?18:0,sy=crop?9:0,sw=crop?84:120,sh=crop?50:68,scale=Math.min(width/sw,height/sh)*clamp(Number(effect.scale)||1,.7,1.5);
    ctx.save();ctx.translate((width-sw*scale)/2-sx*scale,(height-sh*scale)/2-sy*scale);ctx.scale(scale,scale);ctx.translate(effect.anchor==='opponent'?23:effect.anchor==='player'?-23:0,0);
    ctx.lineCap='round';ctx.lineJoin='round';
    const stroke=(color,width,alpha=1,blur=0)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.globalAlpha=alpha;ctx.shadowColor=color;ctx.shadowBlur=Math.min(1.25,blur);};
    const arc=(x,y,rx,ry,start,end)=>{ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,start,end);ctx.stroke();};
    const shard=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(x-w,y);ctx.lineTo(x-w*.65,y-h*.65);ctx.lineTo(x,y-h);ctx.lineTo(x+w*.75,y-h*.7);ctx.lineTo(x+w,y);ctx.closePath();ctx.fill();ctx.globalAlpha*=.55;ctx.fillStyle='#fff5d9';ctx.beginPath();ctx.moveTo(x,y-h);ctx.lineTo(x-w*.5,y-h*.6);ctx.lineTo(x,y-h*.48);ctx.closePath();ctx.fill();};
    if(theme==='rock'||theme==='earth'){
      // Rock columns rise at the sides; Giovanni's ground fractures outward.
      if(theme==='rock'){for(let side of [-1,1])for(let n=0;n<3;n++){ctx.globalAlpha=.72+n*.08;shard(60+side*(19+n*9),57,5+n,13+n*5+Math.sin(t*1.4+n)*2,n%2?'#a88e70':'#6d625b');}stroke('#eac994',.8,.65,2);arc(60,57,36,4,t*.2,t*.2+Math.PI*1.5);}
      else{
        // An outward-moving shock wave and broken ground convey impact without
        // drawing a solid shape over the Pokémon in the centre.
        const wave=(t*.42)%1;
        for(let i=0;i<3;i++){stroke(i===0?'#fff3ca':'#c99868',1-i*.18,(1-wave)*(.62-i*.12),3);arc(60,57,9+wave*(25+i*5),1.5+wave*(2+i),0,Math.PI*2);}
        stroke('#c99868',1.4,.8,3);for(let side of [-1,1])for(let n=0;n<3;n++){ctx.beginPath();ctx.moveTo(60+side*8,57);ctx.lineTo(60+side*(19+n*5),54+n*2);ctx.lineTo(60+side*(29+n*5),57+n);ctx.stroke();}
        for(let n=0;n<16;n++){const a=(t*(.24+seeded(seed,n)*.1)+seeded(seed+5,n))%1,side=n%2?1:-1,x=60+side*(12+seeded(seed+2,n)*30+4*a),y=57-Math.sin(a*Math.PI)*(8+seeded(seed+8,n)*19);ctx.globalAlpha=(1-a)*.8;shard(x,y,1+seeded(seed+9,n)*1.7,2.5+seeded(seed+3,n)*4,n%3?'#b18a69':'#ffe2a4');}
      }
    }else if(theme==='water'){
      // Traveling ribbons and foam propagate along each side of the Pokémon.
      for(let side of [-1,1])for(let row=0;row<3;row++){const y=39+row*6;stroke(row===0?'#dfffff':'#4bb8dd',1.2,.65-row*.1);ctx.beginPath();
        for(let i=0;i<=28;i++){const x=60+side*(16+i),yy=y+Math.sin(i*.34-t*3-row)*2.2;if(i===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);}ctx.stroke();
        for(let k=0;k<3;k++){const d=16+((t*11+k*10+row*4)%28),x=60+side*d,yy=y+Math.sin((d-16)*.34-t*3-row)*2.2;ctx.fillStyle='#efffff';ctx.globalAlpha=.7;ctx.beginPath();ctx.arc(x,yy,.65,0,Math.PI*2);ctx.fill();}}
      for(let n=0;n<3;n++){stroke(n===1?'#d9ffff':'#59cde9',1.2+n*.3,.7-n*.12,4);arc(60,54,18+n*9,3+n*2,t*(n%2?-.55:.45),t*(n%2?-.55:.45)+Math.PI*1.55);}
      for(let side of [-1,1]){stroke('#a4f4ff',1.4,.8,4);ctx.beginPath();ctx.moveTo(60+side*17,55);ctx.bezierCurveTo(60+side*43,50,60+side*37,30,60+side*(29+Math.sin(t)*3),20);ctx.stroke();}
      for(let n=0;n<9;n++){const age=(t*.25+seeded(seed,n))%1;ctx.globalAlpha=Math.sin(age*Math.PI)*.8;ctx.fillStyle='#dcffff';ctx.beginPath();ctx.arc(22+seeded(seed+5,n)*76,52-age*40,1+n%2*.5,0,Math.PI*2);ctx.fill();}
    }else if(theme==='ice'){
      for(let side of [-1,1])for(let n=0;n<3;n++){ctx.globalAlpha=.68;shard(60+side*(21+n*8),57,4+n,15+n*5,'#75b9db');}
      stroke('#e6ffff',.7,.85,3);for(let n=0;n<8;n++){const x=20+seeded(seed,n)*80,y=9+(t*8+n*7)%41;ctx.beginPath();ctx.moveTo(x-2,y);ctx.lineTo(x+2,y);ctx.moveTo(x,y-2);ctx.lineTo(x,y+2);ctx.stroke();}
    }else if(theme==='electric'){
      for(let side of [-1,1])for(let n=0;n<2;n++){let x=60+side*(23+n*10),j=Math.floor(t*7+n)%3;stroke('#ffe472',1.4,.8,6);ctx.beginPath();ctx.moveTo(x,13);ctx.lineTo(x-side*(4+j),25);ctx.lineTo(x+side*3,26);ctx.lineTo(x-side*5,40);ctx.lineTo(x-side*1,39);ctx.lineTo(x-side*8,51);ctx.stroke();}
      stroke('#fff5b1',.8,.6,3);arc(60,56,30,4,t,-t+Math.PI*1.5);
    }else if(theme==='champion'){
      stroke('#ffe9a5',1.1,.85,5);for(let n=0;n<2;n++)arc(60,52,25+n*8,5+n*3,t*(n?-.3:.4),t*(n?-.3:.4)+Math.PI*1.7);
      ctx.fillStyle='#f7c75f';ctx.globalAlpha=.9;ctx.beginPath();ctx.moveTo(47,20);ctx.lineTo(45,11);ctx.lineTo(53,16);ctx.lineTo(60,8+Math.sin(t)*1.5);ctx.lineTo(67,16);ctx.lineTo(75,11);ctx.lineTo(73,20);ctx.closePath();ctx.fill();stroke('#fff6ca',.8,.9,3);ctx.beginPath();ctx.moveTo(48,21);ctx.lineTo(72,21);ctx.stroke();
      for(let n=0;n<7;n++){const a=t*.5+n*6.28/7,x=60+Math.cos(a)*36,y=29+Math.sin(a)*17;stroke('#fff3c2',.8,.8,4);ctx.beginPath();ctx.moveTo(x-2,y);ctx.lineTo(x+2,y);ctx.moveTo(x,y-2);ctx.lineTo(x,y+2);ctx.stroke();}
    }else if(theme==='rival'){
      // Two opposing streaks cross behind the subject, with a quick traveling highlight.
      for(let side of [-1,1]){stroke(side<0?'#ff7d55':'#7acaff',2,.65,5);ctx.beginPath();ctx.moveTo(60+side*43,50);ctx.quadraticCurveTo(60+side*30,28,60+side*10,18);ctx.stroke();stroke('#fff6dc',.7,.9,2);let a=(t*.45+(side+1)*.25)%1;ctx.beginPath();ctx.arc(60+side*(43-30*a),50-30*a,1.4,0,Math.PI*2);ctx.stroke();}
      stroke('#f6e6bd',1,.5);arc(60,56,29,4,-t*.3,Math.PI-t*.3);
    }else{
      const variant=['hell-apollo','hell-athena','hell-lance-rocket','hell-lambda','hell-rocket-viridian','hell-rocket-bridge','hell-rocket-celadon'].indexOf(id);
      stroke('#ed6070',1,.7,4);arc(60,55,32,5,t*.3,t*.3+Math.PI*1.6);
      for(let side of [-1,1]){
        ctx.fillStyle='#2a1728';ctx.globalAlpha=.7;
        if(variant===0||variant===4){ctx.beginPath();ctx.moveTo(60+side*24,57);ctx.lineTo(60+side*32,20+variant%3*3);ctx.lineTo(60+side*38,57);ctx.closePath();ctx.fill();stroke(colors[0],1,.8,4);ctx.beginPath();ctx.moveTo(60+side*32,22+variant%3*3);ctx.lineTo(60+side*32,49);ctx.stroke();}
        else if(variant===1||variant===6){stroke(colors[0],2,.6,5);ctx.beginPath();ctx.moveTo(60+side*15,55);ctx.bezierCurveTo(60+side*45,48,60+side*39,24,60+side*29,13);ctx.bezierCurveTo(60+side*22,20,60+side*38,31,60+side*34,37);ctx.stroke();}
        else if(variant===2){for(let n=0;n<3;n++){const y=14+n*10+(t*5)%6;ctx.globalAlpha=.65;shard(60+side*(25+n*3),y,2+n,4+n,colors[n%3]);}}
        else if(variant===3){stroke(colors[0],1,.7,2);for(let n=0;n<5;n++){const y=20+n*6;ctx.beginPath();ctx.moveTo(60+side*20,y);ctx.lineTo(60+side*(32+n%2*5),y);ctx.stroke();}}
        else{stroke(colors[0],1.4,.75,3);for(let n=0;n<3;n++){ctx.beginPath();ctx.moveTo(60+side*(18+n*4),52-n*5);ctx.lineTo(60+side*(37+n*2),42-n*6);ctx.stroke();}}
      }
      for(let n=0;n<14;n++){const age=(t*(.18+variant*.015)+seeded(seed,n))%1;ctx.globalAlpha=Math.sin(age*Math.PI)*.65;ctx.fillStyle=n%2?colors[0]:colors[1];ctx.beginPath();ctx.arc(23+seeded(seed+4,n)*74,54-age*43,.5+n%3*.35,0,Math.PI*2);ctx.fill();}
      // The group shares a colour language, but each encounter has its own
      // motion motif rather than seven copies of the same pair of pillars.
      const phase=t*.7,accent=colors[1]||'#ffc4b6';stroke(accent,.8,.72,3);
      if(variant===0){for(let n=0;n<3;n++){ctx.beginPath();ctx.moveTo(22+n*5,21+n*2);ctx.quadraticCurveTo(30+n*5,10,42+n*4,19+n*2);ctx.stroke();}}
      else if(variant===1){for(let side of [-1,1])for(let n=0;n<2;n++){ctx.beginPath();ctx.ellipse(60+side*(27+n*3),25+n*4,7+n*2,2,side*.5,phase,phase+Math.PI*1.45);ctx.stroke();}}
      else if(variant===2){for(let n=0;n<3;n++){const y=13+n*6+(phase*8)%5;ctx.beginPath();ctx.moveTo(60,y);ctx.lineTo(55,y+4);ctx.lineTo(60,y+7);ctx.lineTo(65,y+4);ctx.closePath();ctx.stroke();}}
      else if(variant===3){for(let n=0;n<5;n++){const y=15+n*6;ctx.beginPath();ctx.moveTo(18+(n%2)*4,y);ctx.lineTo(34+(n%2)*5+Math.sin(phase+n)*3,y);ctx.moveTo(86-(n%2)*5,y);ctx.lineTo(102-(n%2)*4,y);ctx.stroke();}}
      else if(variant===4){for(let n=0;n<3;n++)arc(60,18,8+n*5,3+n*2,-phase+n,Math.PI-phase+n);}
      else if(variant===5){for(let side of [-1,1]){ctx.beginPath();ctx.moveTo(60+side*37,15);ctx.lineTo(60+side*26,23);ctx.lineTo(60+side*39,30);ctx.stroke();}}
      else{for(let side of [-1,1]){ctx.beginPath();ctx.moveTo(60+side*32,15);ctx.bezierCurveTo(60+side*21,19,60+side*42,30,60+side*28,36);ctx.stroke();}}
    }
    ctx.restore();return true;
  }
  function drawSignatureScene(ctx,effect,time,width,height,style,id){
    const supported=['black-hole','red-dragon','dark-crystal','shiny-dark-crystal','lotus-field','blood-lotus-field','ghosts','bats','fireworks'];
    if(!supported.includes(id))return false;
    const colors=palettes(effect),t=time*(Number(effect.speed)||1),seed=Number(effect.seed)||1;
    const crop=style==='thumbnail',sx=crop?18:0,sy=crop?9:0,sw=crop?84:120,sh=crop?50:68;
    const size=clamp(Number(effect.scale)||1,.7,1.5),scale=Math.min(width/sw,height/sh)*size;
    ctx.save();ctx.translate((width-sw*scale)/2-sx*scale,(height-sh*scale)/2-sy*scale);ctx.scale(scale,scale);
    ctx.translate(effect.anchor==='opponent'?23:effect.anchor==='player'?-23:0,0);
    const glow=(color,blur)=>{ctx.shadowColor=color;ctx.shadowBlur=Math.min(1.2,blur);};
    const ellipse=(x,y,rx,ry,color,alpha=1)=>{ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.stroke();};
    if(id==='black-hole'){
      // Inclined accretion disk: separate luminous filaments, dark center, and sparks.
      ctx.save();ctx.translate(60,18);ctx.rotate(-.25);glow('#a956ff',7);
      const opening=Math.min(1,Math.max(0,t*1.4)),radius=.32+opening*.68;
      for(let i=0;i<7;i++){ctx.lineWidth=i===2?1.7:.55;ctx.globalAlpha=(.24+i*.085)*opening;ctx.strokeStyle=i%2?'#f4b6ff':'#7158ef';ctx.beginPath();ctx.ellipse(0,0,(11+i*3)*radius,(3+i*.8)*radius,0,t*(i%2?-.5:.32)+i*.6,t*(i%2?-.5:.32)+i*.6+Math.PI*1.55);ctx.stroke();}
      ctx.shadowBlur=0;ctx.globalAlpha=.88*opening;ctx.fillStyle='#100a25';ctx.beginPath();ctx.ellipse(0,0,7*radius,3.8*radius,0,0,Math.PI*2);ctx.fill();ctx.restore();
      for(let n=0;n<22;n++){const age=(t*.22+seeded(seed+3,n))%1,a=n*2.4+t*1.3,r=9+(1-age)*31;ctx.globalAlpha=Math.sin(age*Math.PI)*.8;ctx.fillStyle=n%3?'#b983ff':'#fff1ff';ctx.beginPath();ctx.arc(60+Math.cos(a)*r,18+Math.sin(a)*r*.38,.3+(n%3)*.24,0,Math.PI*2);ctx.fill();}
    }else if(id==='red-dragon'){
      // An articulated spiral alternates distant and near arcs around the subject.
      // The near arc stays low, leaving the face and body legible even in front mode.
      ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
      const points=[];for(let n=0;n<=64;n++){const q=n/64,a=q*Math.PI*4.2-t*1.25,r=32-q*6;
        points.push({x:60+Math.cos(a)*r,y:38+Math.sin(a)*8-q*20+Math.sin(q*19-t*3)*1.5,front:Math.sin(a)>0});}
      for(let pass=0;pass<2;pass++)for(let n=0;n<64;n++){const a=points[n],b=points[n+1];if(Number(a.front)!==pass)continue;
        for(let layer=0;layer<3;layer++){ctx.globalAlpha=pass?.87:.48;ctx.strokeStyle=['#542139','#d64d36','#ffc17b'][layer];ctx.lineWidth=[5.6,3.8,.8][layer];ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
        if(n%3===0){ctx.globalAlpha=.8;ctx.strokeStyle='#ffe0a5';ctx.lineWidth=.55;ctx.beginPath();ctx.moveTo(a.x-1,a.y-2);ctx.lineTo(a.x,a.y-.4);ctx.lineTo(a.x+1,a.y-2);ctx.stroke();}}
      const head=points[64];ctx.translate(head.x,head.y);ctx.rotate(Math.atan2(head.y-points[62].y,head.x-points[62].x));
      ctx.globalAlpha=.95;ctx.fillStyle='#f15d39';ctx.beginPath();ctx.moveTo(5,0);ctx.lineTo(-3,-4);ctx.lineTo(-6,-2);ctx.lineTo(-5,3);ctx.lineTo(2,3);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#ffe0a5';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(-3,-3);ctx.lineTo(-5,-7);ctx.moveTo(0,-3);ctx.lineTo(0,-7);ctx.moveTo(4,1);ctx.quadraticCurveTo(8,0,10,-2);ctx.moveTo(4,2);ctx.quadraticCurveTo(8,4,10,6);ctx.stroke();ctx.fillStyle='#fff8ca';ctx.beginPath();ctx.arc(1,-1,1,0,Math.PI*2);ctx.fill();ctx.restore();
      for(let n=0;n<10;n++){const age=(t*.24+seeded(seed,n))%1,x=25+seeded(seed+2,n)*70,y=56-age*45;ctx.globalAlpha=(1-age)*.8;ctx.fillStyle=n%2?'#ff8b45':'#ffe4a2';ctx.beginPath();ctx.arc(x+Math.sin(t+n)*2,y,.5+n%2*.35,0,Math.PI*2);ctx.fill();}
    }else if(id==='ghosts'){
      // Three differently timed wisps drift above the Pokémon with translucent tails.
      for(let n=0;n<3;n++){
        const x=34+n*25+Math.sin(t*1.2+n*2)*4,y=19+Math.cos(t*1.5+n)*3,opacity=.35+.35*Math.sin(t+n*1.6)**2;
        ctx.save();ctx.translate(x,y);ctx.globalAlpha=opacity;ctx.fillStyle=n===1?'#d7f5ff':'#93c6ff';glow('#82d7ff',5);
        ctx.beginPath();ctx.moveTo(-5,5);ctx.bezierCurveTo(-8,-6,-3,-11,0,-11);ctx.bezierCurveTo(7,-11,8,-3,5,5);ctx.quadraticCurveTo(3,2,1,5);ctx.quadraticCurveTo(-1,2,-3,5);ctx.closePath();ctx.fill();
        ctx.shadowBlur=0;ctx.globalAlpha=.7;ctx.fillStyle='#34436a';ctx.beginPath();ctx.arc(-2,-3,.7,0,Math.PI*2);ctx.arc(2,-3,.7,0,Math.PI*2);ctx.fill();ctx.restore();
      }
      for(let n=0;n<12;n++){const age=(t*.18+seeded(seed,n))%1;ctx.globalAlpha=Math.sin(age*Math.PI)*.55;ctx.fillStyle=n%2?'#c7f7ff':'#a38eff';ctx.beginPath();ctx.arc(19+seeded(seed+3,n)*82,51-age*40,.4+n%3*.2,0,Math.PI*2);ctx.fill();}
    }else if(id==='bats'){
      // Offset flights and alternating wing poses avoid a static bat icon.
      for(let n=0;n<7;n++){
        const side=n%2?1:-1,age=(t*(.16+n%3*.025)+seeded(seed,n))%1,x=60+side*(18+age*30),y=15+(n%3)*8+Math.sin(age*5+n)*3,flap=Math.sin(t*9+n*2)*3;
        ctx.save();ctx.translate(x,y);ctx.scale(side,1);ctx.globalAlpha=Math.sin(age*Math.PI)*.8;ctx.fillStyle=n%3?'#a49bea':'#d9c5ff';glow('#8e76db',2);
        ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(-3,-4-flap,-8,-1-flap);ctx.lineTo(-6,2);ctx.lineTo(-3,1);ctx.lineTo(0,3);ctx.lineTo(3,1);ctx.lineTo(6,2);ctx.lineTo(8,-1-flap);ctx.quadraticCurveTo(3,-4-flap,0,0);ctx.fill();ctx.restore();
      }
    }else if(id==='fireworks'){
      // Each rocket launches, blooms into a staggered burst, then fades.
      for(let n=0;n<3;n++){
        const age=(t*.36+n/3)%1,x=28+n*32,y=22+(n%2)*6;
        if(age<.32){const q=age/.32;ctx.globalAlpha=Math.sin(q*Math.PI)*.9;ctx.strokeStyle=colors[n%colors.length];ctx.lineWidth=1.2;glow(ctx.strokeStyle,4);ctx.beginPath();ctx.moveTo(x,57-q*(57-y));ctx.lineTo(x,61-q*(57-y));ctx.stroke();}
        else{const q=(age-.32)/.68;for(let k=0;k<12;k++){const a=k*Math.PI/6,r=2+q*14,fall=q*q*5;ctx.globalAlpha=(1-q)*.9;ctx.strokeStyle=k%2?colors[n%colors.length]:'#fff8db';ctx.lineWidth=k%3===0?1.2:.65;glow(ctx.strokeStyle,3);ctx.beginPath();ctx.moveTo(x+Math.cos(a)*r*.55,y+Math.sin(a)*r*.55+fall);ctx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r+fall);ctx.stroke();}}
      }
    }else if(id.includes('crystal')){
      const shiny=id.startsWith('shiny'),base=shiny?'#ef73df':'#9b6bdb',edge=shiny?'#c8ffff':'#e6d5ff';
      for(let side of [-1,1])for(let n=0;n<3;n++){const x=60+side*(23+n*8),h=12+n*5+Math.sin(t+n)*1.2,y=57-h,w=5+n*1.5;ctx.globalAlpha=.8;ctx.fillStyle='#241741';ctx.beginPath();ctx.moveTo(x-w,57);ctx.lineTo(x-w*.7,y+6);ctx.lineTo(x,y);ctx.lineTo(x+w*.7,y+7);ctx.lineTo(x+w,57);ctx.closePath();ctx.fill();ctx.fillStyle=base;ctx.beginPath();ctx.moveTo(x-w*.7,56);ctx.lineTo(x,y);ctx.lineTo(x,56);ctx.closePath();ctx.fill();ctx.fillStyle=edge;ctx.globalAlpha=.65;ctx.beginPath();ctx.moveTo(x,y+2);ctx.lineTo(x+w*.45,y+8);ctx.lineTo(x+1,52);ctx.closePath();ctx.fill();}
      glow(edge,4);for(let n=0;n<(shiny?16:12);n++){const a=n*(shiny?1.9:2.4)+t*(shiny?-.7:.4),r=22+seeded(seed,n)*20,x=60+Math.cos(a)*r,y=30+Math.sin(a)*r*.6;ctx.globalAlpha=.35+.5*Math.sin(t*2+n)**2;ctx.strokeStyle=edge;ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(x-2,y);ctx.lineTo(x+2,y);ctx.moveTo(x,y-2);ctx.lineTo(x,y+2);ctx.stroke();}
    }else{
      const blood=id==='blood-lotus-field',petal=blood?'#dc315f':'#e3f9f4',edge=blood?'#ffadb2':'#a8e7f4';
      ctx.lineWidth=.7;glow(petal,4);ellipse(60,56,37,5,edge,.45);ellipse(60,56,27,3,petal,.55);
      for(let side of [-1,1])for(let n=0;n<3;n++){const x=60+side*(15+n*11),y=54+n%2*2;ctx.save();ctx.translate(x,y);ctx.rotate(side*.15);for(let k=-2;k<=2;k++){ctx.save();ctx.rotate(k*(.12+.28*(.5+.5*Math.sin(t*(blood?1.6:1.1)+n*.8))));ctx.globalAlpha=.85;ctx.fillStyle=k%2?petal:edge;ctx.beginPath();ctx.moveTo(0,2);ctx.bezierCurveTo(-5,-2,-3,-9,0,-12);ctx.bezierCurveTo(3,-9,5,-2,0,2);ctx.fill();ctx.restore();}ctx.restore();}
      for(let n=0;n<11;n++){const age=(t*(blood?.2:.13)+seeded(seed,n))%1,x=20+seeded(seed+1,n)*80,y=blood?10+age*45:55-age*45;ctx.globalAlpha=Math.sin(age*Math.PI)*.8;ctx.fillStyle=n%2?petal:edge;ctx.save();ctx.translate(x+Math.sin(t+n)*3,y);ctx.rotate(t+n);ctx.beginPath();ctx.ellipse(0,0,2.1,.8,0,0,Math.PI*2);ctx.fill();ctx.restore();}
    }
    ctx.restore();return true;
  }
  // A modular atlas supplies isolated translucent parts, never a painted card.
  const HELL_CYCLES=Object.freeze({"hell-brock":{"file":"hell-brock.png","poster":"hell-brock-poster.png","title":"岩峰誓约","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":107.8,"y":-2,"auraStart":3,"auraFrames":6},"hell-misty":{"file":"hell-misty.png","poster":"hell-misty-poster.png","title":"碧海回澜","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":107.8,"y":-2,"auraStart":3,"auraFrames":6},"hell-lt-surge":{"file":"hell-lt-surge.png","poster":"hell-lt-surge-poster.png","title":"雷霆断空","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":107.8,"y":-2,"auraStart":3,"auraFrames":6},"hell-erika":{"file":"hell-erika.png","poster":"hell-erika-poster.png","title":"百花织庭","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":107.8,"y":-2,"auraStart":3,"auraFrames":6},"hell-koga":{"file":"hell-koga.png","poster":"hell-koga-poster.png","title":"忍影毒幕","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":107.8,"y":-2,"auraStart":3,"auraFrames":6},"hell-sabrina":{"file":"hell-sabrina.png","poster":"hell-sabrina-poster.png","title":"念界碎镜","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":107.8,"y":-2,"auraStart":3,"auraFrames":6},"hell-blaine":{"file":"hell-blaine.png","poster":"hell-blaine-poster.png","title":"熔心破晓","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":107.8,"y":-2,"auraStart":3,"auraFrames":6},"hell-giovanni":{"file":"hell-giovanni.png","poster":"hell-giovanni-poster.png","title":"大地裂隙","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":92.4,"y":10,"auraStart":3,"auraFrames":6},"hell-lorelei":{"file":"hell-lorelei.png","poster":"hell-lorelei-poster.png","title":"极光冰庭","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":114.8,"y":-3,"auraStart":3,"auraFrames":6},"hell-bruno":{"file":"hell-bruno.png","poster":"hell-bruno-poster.png","title":"斗魄山河","cols":4,"rows":3,"frames":12,"fps":8,"width":186.0,"height":120.9,"y":-2,"auraStart":3,"auraFrames":6},"hell-agatha":{"file":"hell-agatha.png","poster":"hell-agatha-poster.png","title":"彼岸归途","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":107.8,"y":-2,"auraStart":3,"auraFrames":6},"hell-champion":{"file":"hell-champion.png","poster":"hell-champion-poster.png","title":"冠冕长歌","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":114.8,"y":-3,"auraStart":3,"auraFrames":6},"hell-rival":{"file":"hell-rival.png","poster":"hell-rival-poster.png","title":"青穹疾轨","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":107.8,"y":-2,"auraStart":3,"auraFrames":6},"hell-rival-route22":{"file":"hell-rival-route22.png","poster":"hell-rival-route22-poster.png","title":"林风再会","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":107.8,"y":-2,"auraStart":3,"auraFrames":6},"hell-silph-showdown":{"file":"hell-silph-showdown.png","poster":"hell-silph-showdown-poster.png","title":"棱镜决意","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":107.8,"y":-2,"auraStart":3,"auraFrames":6},"hell-rocket-bridge":{"file":"hell-rocket-bridge.png","poster":"hell-rocket-bridge-poster.png","title":"赤金渡线","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":107.8,"y":-2,"auraStart":3,"auraFrames":6},"hell-rocket-celadon":{"file":"hell-rocket-celadon.png","poster":"hell-rocket-celadon-poster.png","title":"夜幕机关","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":107.8,"y":-2,"auraStart":3,"auraFrames":6},"hell-apollo":{"file":"hell-apollo.png","poster":"hell-apollo-poster.png","title":"绯翼暗潮","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":107.8,"y":-2,"auraStart":3,"auraFrames":6},"hell-athena":{"file":"hell-athena.png","poster":"hell-athena-poster.png","title":"月纱幻舞","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":107.8,"y":-2,"auraStart":3,"auraFrames":6},"hell-lance-rocket":{"file":"hell-lance-rocket.png","poster":"hell-lance-rocket-poster.png","title":"断电风暴","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":107.8,"y":-2,"auraStart":3,"auraFrames":6},"hell-lambda":{"file":"hell-lambda.png","poster":"hell-lambda-poster.png","title":"千面潜影","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":107.8,"y":-2,"auraStart":3,"auraFrames":6},"hell-rocket-viridian":{"file":"hell-rocket-viridian.png","poster":"hell-rocket-viridian-poster.png","title":"黑曜终局","cols":4,"rows":3,"frames":12,"fps":8,"width":162.4,"height":107.8,"y":-2,"auraStart":3,"auraFrames":6}});
  const NORMAL_CYCLES=Object.freeze({"paper-lantern":{"file":"normal-lanterns.png","poster":"normal-lanterns-poster.png","title":"归途灯影","cols":4,"rows":2,"frames":8,"fps":5.3,"width":108,"height":71,"y":-2},"lotus-field":{"file":"normal-garden.png","poster":"normal-garden-poster.png","title":"庭园清梦","cols":4,"rows":2,"frames":8,"fps":5.3,"width":106,"height":69,"y":1},"original-starsea":{"file":"normal-starsea.png","poster":"normal-starsea-poster.png","title":"雾灯星鲸","cols":4,"rows":2,"frames":8,"fps":5.3,"width":112,"height":73,"y":-2},"rising-star":{"file":"ordinary-fossil-sand.png","poster":"ordinary-fossil-sand-poster.png","title":"化石砂流","cols":2,"rows":2,"frames":4,"fps":3.2,"width":111,"height":74,"y":0,"crossfade":true},"present":{"file":"ordinary-harbor-beacon.png","poster":"ordinary-harbor-beacon-poster.png","title":"回航信标","cols":2,"rows":2,"frames":4,"fps":3.2,"width":111,"height":74,"y":0,"crossfade":true},"spiders-web":{"file":"ordinary-seed-bank.png","poster":"ordinary-seed-bank-poster.png","title":"留种之庭","cols":2,"rows":2,"frames":4,"fps":3.2,"width":111,"height":74,"y":0,"crossfade":true},"pungent-stench":{"file":"ordinary-trace-free.png","poster":"ordinary-trace-free-poster.png","title":"林间无痕","cols":2,"rows":2,"frames":4,"fps":3.2,"width":111,"height":74,"y":0,"crossfade":true},"zodiac":{"file":"ordinary-trail-markers.png","poster":"ordinary-trail-markers-poster.png","title":"归途路标","cols":2,"rows":2,"frames":4,"fps":3.2,"width":111,"height":74,"y":0,"crossfade":true},"kings-fall":{"file":"ordinary-moonstone-bloom.png","poster":"ordinary-moonstone-bloom-poster.png","title":"月石微花","cols":2,"rows":2,"frames":4,"fps":3.2,"width":111,"height":74,"y":0,"crossfade":true},"pumpkids-treat":{"file":"ordinary-ember-letter.png","poster":"ordinary-ember-letter-poster.png","title":"余烬书简","cols":2,"rows":2,"frames":4,"fps":3.2,"width":111,"height":74,"y":0,"crossfade":true},"witchs-cat":{"file":"ordinary-camp-tea.png","poster":"ordinary-camp-tea-poster.png","title":"篝火茶会","cols":2,"rows":2,"frames":4,"fps":3.2,"width":111,"height":74,"y":0,"crossfade":true},"pumpcat":{"file":"ordinary-herbal-chimes.png","poster":"ordinary-herbal-chimes-poster.png","title":"药草风铃","cols":2,"rows":2,"frames":4,"fps":3.2,"width":111,"height":74,"y":0,"crossfade":true},"white-kitty":{"file":"ordinary-tidal-shells.png","poster":"ordinary-tidal-shells-poster.png","title":"潮汐回声","cols":2,"rows":2,"frames":4,"fps":3.2,"width":111,"height":74,"y":0,"crossfade":true},"anniversary-cake":{"file":"ordinary-migration-wings.png","poster":"ordinary-migration-wings-poster.png","title":"季风蝶信","cols":2,"rows":2,"frames":4,"fps":3.2,"width":111,"height":74,"y":0,"crossfade":true},"menacing-spirit":{"file":"ordinary-grid-echo.png","poster":"ordinary-grid-echo-poster.png","title":"电网回声","cols":2,"rows":2,"frames":4,"fps":3.2,"width":111,"height":74,"y":0,"crossfade":true},"bond-canopy":{"file":"ordinary-bond-companions.png","poster":"ordinary-bond-companions-poster.png","title":"双羽同行","cols":2,"rows":2,"frames":4,"fps":3.2,"width":111,"height":74,"y":0,"crossfade":true}});
  const MATERIAL_RIGS=Object.freeze({"rising-star":{"motion":"mineral","parts":[[0.02,0.51,0.46,0.46,"still"],[0.02,0.06,0.26,0.46,"drift"],[0.39,0.73,0.57,0.24,"sand"]]},"present":{"motion":"harbor","parts":[[0.7,0.02,0.28,0.55,"swing"],[0.04,0.65,0.9,0.32,"water"],[0.02,0.43,0.4,0.48,"mist"]]},"spiders-web":{"motion":"botany","parts":[[0.02,0.52,0.32,0.43,"still"],[0.7,0.58,0.28,0.37,"still"],[0.17,0.08,0.24,0.34,"seed"],[0.6,0.03,0.25,0.32,"seed"]]},"pungent-stench":{"motion":"forest","parts":[[0.01,0.4,0.32,0.56,"cloth"],[0.69,0.48,0.3,0.47,"cloth"],[0.22,0.73,0.55,0.23,"mist"]]},"zodiac":{"motion":"rope","parts":[[0.02,0.61,0.4,0.35,"still"],[0.05,0.07,0.35,0.55,"cloth"],[0.35,0.64,0.62,0.31,"cloth"]]},"kings-fall":{"motion":"mineral","parts":[[0.05,0.09,0.3,0.6,"drift"],[0.66,0.12,0.28,0.58,"drift"],[0.04,0.75,0.91,0.21,"sand"]]},"pumpkids-treat":{"motion":"paper","parts":[[0.06,0.07,0.35,0.4,"bird"],[0.6,0.09,0.34,0.4,"bird"],[0.02,0.47,0.38,0.46,"ember"],[0.69,0.44,0.28,0.5,"ember"]]},"witchs-cat":{"motion":"camp","parts":[[0.03,0.43,0.31,0.51,"still"],[0.69,0.61,0.3,0.33,"still"],[0.15,0.04,0.7,0.45,"steam"]]},"pumpcat":{"motion":"chimes","parts":[[0.01,0.02,0.35,0.64,"swing"],[0.64,0.02,0.35,0.65,"swing"],[0.14,0.61,0.2,0.3,"leaf"],[0.72,0.62,0.2,0.3,"leaf"]]},"white-kitty":{"motion":"tide","parts":[[0.02,0.6,0.37,0.35,"still"],[0.02,0.1,0.35,0.5,"water"],[0.3,0.68,0.66,0.27,"water"]]},"anniversary-cake":{"motion":"butterflies","parts":[[0.04,0.15,0.25,0.3,"butterfly"],[0.3,0.04,0.24,0.28,"butterfly"],[0.63,0.04,0.25,0.3,"butterfly"],[0.77,0.38,0.19,0.32,"butterfly"]]},"menacing-spirit":{"motion":"current","parts":[[0.02,0.53,0.26,0.37,"still"],[0.73,0.53,0.25,0.37,"still"],[0.26,0.55,0.47,0.27,"current"]]},"bond-canopy":{"motion":"wings","parts":[[0.02,0.03,0.43,0.81,"wing"],[0.55,0.03,0.43,0.81,"wing"],[0.18,0.67,0.64,0.3,"cloth"]]},"paper-lantern":{"motion":"lantern","parts":[[0.01,0.06,0.3,0.55,"swing"],[0.68,0.05,0.29,0.56,"swing"],[0.18,0.69,0.64,0.26,"mist"]]},"lotus-field":{"motion":"garden","parts":[[0.02,0.14,0.31,0.65,"cloth"],[0.69,0.18,0.29,0.62,"cloth"],[0.09,0.68,0.82,0.28,"leaf"]]},"original-starsea":{"motion":"whale","parts":[[0.02,0.25,0.95,0.52,"whale"],[0.1,0.72,0.8,0.24,"water"]]},"hell-brock":{"motion":"mineral"},"hell-misty":{"motion":"tide"},"hell-lt-surge":{"motion":"current"},"hell-erika":{"motion":"garden"},"hell-koga":{"motion":"forest"},"hell-sabrina":{"motion":"eye"},"hell-blaine":{"motion":"lava"},"hell-giovanni":{"motion":"earth"},"hell-lorelei":{"motion":"ice"},"hell-bruno":{"motion":"fists"},"hell-agatha":{"motion":"souls"},"hell-champion":{"motion":"wings"},"hell-rival":{"motion":"wind"},"hell-rival-route22":{"motion":"forest"},"hell-silph-showdown":{"motion":"glass"},"hell-rocket-bridge":{"motion":"current"},"hell-rocket-celadon":{"motion":"gears"},"hell-apollo":{"motion":"wings"},"hell-athena":{"motion":"cloth"},"hell-lance-rocket":{"motion":"current"},"hell-lambda":{"motion":"masks"},"hell-rocket-viridian":{"motion":"earth"}});
  // Each illustration is a source of separate materials, not a frame to shake.
  // Low-alpha painted haze is removed once. Props keep their own pivots and clocks.
  const materialCuts=new WeakMap();
  function materialParts(image,profile,id,rig){
    let cache=materialCuts.get(image);if(!cache){cache=new Map();materialCuts.set(image,cache);}if(cache.has(id))return cache.get(id);
    const sideKind=({mineral:'drift',tide:'water',current:'current',garden:'cloth',forest:'mist',eye:'drift',lava:'ember',earth:'still',ice:'drift',fists:'fist',souls:'soul',wings:'wing',wind:'cloth',glass:'drift',gears:'gear',cloth:'cloth',masks:'mask'})[rig.motion]||'cloth';
    const specs=rig.parts||[[.015,.08,.35,.67,sideKind],[.64,.08,.345,.67,sideKind],[.03,.72,.94,.24,['tide','ice'].includes(rig.motion)?'water':['lava','current'].includes(rig.motion)?'current':'mist']];
    if(!rig.parts&&rig.motion==='eye')specs.push([.25,.07,.50,.29,'eye']);
    const sw=image.naturalWidth/profile.cols,sh=image.naturalHeight/profile.rows,pose=profile.frames===12?4:1;
    const parts=specs.map((spec,n)=>{
      const [x,y,w,h,kind]=spec,canvas=root.document.createElement('canvas');canvas.width=Math.max(2,Math.ceil(sw*w));canvas.height=Math.max(2,Math.ceil(sh*h));const c=canvas.getContext('2d');if(!c)return null;
      // Pose four is the eye's closed key pose. Its independent eyelid rig
      // must start from the fully open drawing or scaling can never open it.
      const sourcePose=kind==='eye'?0:pose,ox=(sourcePose%profile.cols)*sw,oy=Math.floor(sourcePose/profile.cols)*sh;
      const copy=()=>c.drawImage(image,ox+x*sw,oy+y*sh,w*sw,h*sh,0,0,canvas.width,canvas.height);
      c.filter='saturate(.86)';copy();c.filter='none';c.globalCompositeOperation='destination-in';copy();copy();
      if(c.createLinearGradient){for(const [x0,y0,x1,y1]of [[0,0,canvas.width,0],[0,0,0,canvas.height]]){const gradient=c.createLinearGradient(x0,y0,x1,y1);if(gradient?.addColorStop){gradient.addColorStop(0,'#ffffff00');gradient.addColorStop(.10,'#ffffff');gradient.addColorStop(.9,'#ffffff');gradient.addColorStop(1,'#ffffff00');c.fillStyle=gradient;c.fillRect(0,0,canvas.width,canvas.height);}}}
      c.globalCompositeOperation='source-over';
      const fluid=['water','mist','steam','ember','sand','current'].includes(kind),frames=[];
      // Only fluid material changes shape. Solid props never dissolve between
      // different drawings; their motion comes from their individual joints.
      if(fluid)for(let frame=0;frame<4;frame++){
        const tile=root.document.createElement('canvas');tile.width=canvas.width;tile.height=canvas.height;const tc=tile.getContext('2d');if(!tc)continue;
        const poseIndex=profile.frames===12?frame*3:profile.frames===8?frame*2:frame;
        const sourceX=(poseIndex%profile.cols)*sw+x*sw,sourceY=Math.floor(poseIndex/profile.cols)*sh+y*sh;
        const paint=()=>tc.drawImage(image,sourceX,sourceY,w*sw,h*sh,0,0,tile.width,tile.height);
        tc.filter='saturate(.86)';paint();tc.filter='none';tc.globalCompositeOperation='destination-in';paint();paint();
        if(tc.createLinearGradient)for(const [x0,y0,x1,y1]of [[0,0,tile.width,0],[0,0,0,tile.height]]){const g=tc.createLinearGradient(x0,y0,x1,y1);if(g?.addColorStop){g.addColorStop(0,'#ffffff00');g.addColorStop(.1,'#ffffff');g.addColorStop(.9,'#ffffff');g.addColorStop(1,'#ffffff00');tc.fillStyle=g;tc.fillRect(0,0,tile.width,tile.height);}}
        tc.globalCompositeOperation='source-over';frames.push(tile);
      }
      let blend=null;if(frames.length===4){blend=root.document.createElement('canvas');blend.width=canvas.width;blend.height=canvas.height;}
      return{image:canvas,frames,blend,x:(x-.5)*profile.width,y:(y-.5)*profile.height+profile.y,w:w*profile.width,h:h*profile.height,kind,n};
    }).filter(Boolean);cache.set(id,parts);return parts;
  }
  function drawMaterialMotion(ctx,effect,time,width,height,style,id,image,profile){
    const rig=MATERIAL_RIGS[id];if(!rig)return false;const parts=materialParts(image,profile,id,rig);if(!parts.length)return false;
    const t=Math.max(0,time)*clamp(Number(effect.speed)||1,.5,1.8),persistent=style==='aura',legend=id.startsWith('hell-');
    const ease=value=>{const q=clamp(value,0,1);return q*q*(3-2*q);};
    // Playback speed alters the material clock, never the lifetime. A slow
    // setting must still fade out before the overlay is removed.
    const unit=Math.min(width/120,height/68)*clamp(Number(effect.scale)||1,.7,2.7)*(legend?.94:.91),envelope=persistent?ease(time/.4):ease(time/.26)*(1-ease((time-1.08)/.47));
    ctx.save();ctx.translate(width/2+(effect.anchor==='opponent'?23:effect.anchor==='player'?-23:0)*unit,height/2+unit*3);ctx.scale(unit,unit);ctx.imageSmoothingEnabled=true;
    for(const p of parts){
      const phase=p.n*1.73+(Number(effect.seed)||1)*.017,side=p.x+p.w/2<0?-1:1,age=t+phase,kind=p.kind,delay=p.n*.045;
      const entry=persistent?1:ease((time-delay)/.28),weight=envelope*entry*(persistent?(legend?.76:.68):(legend?.94:.88));if(weight<=0)continue;
      let dx=0,dy=0,angle=0,sx=1,sy=1,opacity=1,pivotX=p.w/2,pivotY=p.h/2;
      if(kind==='swing'){pivotY=1;angle=Math.sin(t*1.55+phase)*.075+Math.sin(t*2.7+phase)*.012;}
      else if(kind==='drift'){dx=Math.sin(t*.73+phase)*1.1;dy=Math.sin(t*.91+phase)*1.35;angle=Math.sin(t*.57+phase)*.045;}
      else if(kind==='seed'||kind==='leaf'){const q=(t*.14+p.n*.23)%1;dx=Math.sin(q*5+phase)*2.8;dy=-q*6.5;angle=Math.sin(t*1.3+phase)*.22;sx=.85+.15*Math.cos(t*2.1+phase);opacity=.35+.65*Math.sin(q*Math.PI);}
      else if(kind==='butterfly'||kind==='bird'){dx=Math.sin(t*.85+phase)*4;dy=Math.sin(t*1.1+phase)*3;angle=Math.sin(t*.9+phase)*.11;sx=.66+.34*Math.abs(Math.sin(t*(kind==='bird'?3.3:5.8)+phase));}
      else if(kind==='wing'){pivotX=side<0?p.w*.9:p.w*.1;pivotY=p.h*.77;angle=side*(.035+.065*Math.sin(t*1.55+phase));sx=.91+.09*Math.cos(t*1.55+phase);}
      else if(kind==='whale'){dx=Math.sin(t*.55)*2.8;dy=Math.sin(t*.9)*1.8;angle=Math.sin(t*.65)*.025;}
      else if(kind==='fist'){const punch=Math.pow(Math.max(0,Math.sin(t*2.0+phase)),6);dx=-side*punch*6;dy=-punch*1.3;angle=side*punch*.045;}
      else if(kind==='eye'){const blink=Math.exp(-Math.pow(((t+1.1)%4.7-2.8)/.075,2));sy=1-blink*.94;}
      else if(kind==='gear'){angle=t*.13*side;}
      else if(kind==='mask'){sx=.88+.12*Math.cos(t*.7+phase);dy=Math.sin(t*.72+phase)*2;angle=Math.sin(t*.45+phase)*.035;}
      else if(kind==='soul'){dy=Math.sin(t*.7+phase)*2.4;dx=Math.sin(t*.55+phase)*1.2;opacity=.65+.25*Math.sin(t*.9+phase);}
      else if(kind==='current'){opacity=.67+.18*Math.sin(t*8+phase)+.1*Math.sin(t*19+phase);}
      else if(kind==='water'){dx=Math.sin(t*1.7+phase)*2.3;dy=Math.cos(t*1.25+phase)*.75;sy=1+Math.sin(t*1.3+phase)*.025;}
      else if(kind==='ember'){dy=-1.7-Math.sin(t*1.7+phase)*1.6;sx=1+Math.sin(t*2.8+phase)*.035;opacity=.8+.17*Math.sin(t*2.2+phase);}
      else if(kind==='mist'||kind==='steam'){dx=Math.sin(t*.63+phase)*2.6;dy=-Math.sin(t*.81+phase)*1.3;opacity=.68+.2*Math.sin(t*.75+phase);}
      else if(kind==='sand'){dx=Math.sin(t*.84+phase)*1.8;dy=Math.sin(t*.7+phase)*.5;}
      if(legend){
        // Challenger signatures have independent material choreography. Keep
        // the visual weight on the outer props and the centre silhouette clear.
        if(['mineral','ice','glass'].includes(rig.motion)&&kind==='drift'){
          const rate=rig.motion==='ice'?.62:rig.motion==='glass'?1.1:.43;
          dy-=1.7+Math.sin(t*rate+phase)*1.2;dx+=side*(.7+Math.sin(t*rate*.7+phase)*.65);angle+=side*Math.sin(t*rate+phase)*.04;
        }else if(rig.motion==='fists'&&kind==='fist'){
          const gather=Math.pow(Math.max(0,Math.sin(t*1.2+phase+.7)),4);dy-=gather*2.1;sx+=gather*.035;
        }else if(rig.motion==='souls'&&kind==='soul'){
          dx+=Math.sin(t*.55+phase)*2.2;dy-=1.8+Math.cos(t*.55+phase)*1.3;
        }else if(rig.motion==='eye'&&kind==='drift'){
          angle+=side*t*.025;dy-=Math.sin(t*.5+phase)*1.1;
        }else if(rig.motion==='wings'&&kind==='wing'){
          const breath=Math.sin(t*1.15+phase);angle+=side*breath*.035;dy-=1.1+breath*.7;
        }
      }
      if(!persistent&&kind!=='still')dy+=(1-entry)*4;
      if(!persistent){const impulse=Math.sin(ease((time-.16)/.76)*Math.PI),accent=style==='move'?1.9:style==='outcome'?1.35:1;dx+=side*impulse*accent;dy-=impulse*(style==='outcome'?1.6:.5);}
      ctx.save();ctx.translate(p.x+pivotX+dx,p.y+pivotY+dy);ctx.rotate(angle);ctx.scale(sx,sy);ctx.translate(-pivotX,-pivotY);ctx.globalAlpha=weight*opacity;
      const fluid=['water','mist','steam','ember','current','sand'].includes(kind),flow=fluid||['cloth','wing'].includes(kind);
      let texture=p.image;
      if(p.blend&&p.frames.length===4){const clock=t*(kind==='current'?1.35:kind==='ember'?.8:kind==='water'?.55:.34)+p.n*.27,index=Math.floor(clock)%4,mix=ease(clock%1),bc=p.blend.getContext('2d');if(bc){bc.clearRect(0,0,p.blend.width,p.blend.height);bc.globalCompositeOperation='source-over';bc.globalAlpha=1-mix;bc.drawImage(p.frames[index],0,0);bc.globalCompositeOperation='lighter';bc.globalAlpha=mix;bc.drawImage(p.frames[(index+1)%4],0,0);bc.globalAlpha=1;bc.globalCompositeOperation='source-over';texture=p.blend;}}
      if(flow){
        // Fluids need a travelling wave, not just a whole-patch crossfade.
        // Keep the subdivision budget lower than cloth on small displays.
        const strips=fluid?(width<550?8:14):(width<550?20:28);
        for(let k=0;k<strips;k++){
          const q=(k+.5)/strips,srcY=Math.floor(k*p.image.height/strips),srcH=Math.floor((k+1)*p.image.height/strips)-srcY;
          const breeze=kind==='steam'?(1-q)*3.8:kind==='cloth'||kind==='wing'?q*1.7:kind==='water'?2.8:kind==='mist'?2.1:kind==='ember'?(1-q)*1.6:kind==='current'?.8:.55;
          const speed=kind==='water'?1.9:kind==='current'?6.7:kind==='ember'?2.4:.9;
          const shift=Math.sin(t*speed+q*5+phase)*breeze,stretch=1+Math.sin(t*speed+q*6+phase)*(kind==='water'?.026:.008);
          ctx.drawImage(texture,0,srcY,texture.width,srcH,shift,p.h*srcY/texture.height,p.w*stretch,p.h*srcH/texture.height);
        }
      }else ctx.drawImage(texture,0,0,p.w,p.h);
      ctx.restore();
    }
    ctx.restore();return true;
  }

  const hellImages=new Map();
  function hellImage(id,poster=false){
    const profile=HELL_CYCLES[id]||NORMAL_CYCLES[id],base=String(root.__KANTO_FX_ASSET_ROOT__||'');if(!profile||!base||typeof root.Image!=='function')return null;
    const key=id+(poster?':poster':':atlas'),now=root.performance?.now?.()||Date.now();
    if(hellImages.has(key)){const entry=hellImages.get(key);entry.used=now;return entry.ready?entry.image:null;}
    if(!poster){const atlases=[...hellImages].filter(([,entry])=>!entry.poster);if(atlases.length>=6){atlases.sort((a,b)=>a[1].used-b[1].used);hellImages.delete(atlases[0][0]);}}
    const entry={image:new root.Image(),poster,ready:false,failed:false,used:now};hellImages.set(key,entry);
    entry.image.onload=()=>{entry.ready=Boolean(entry.image.naturalWidth&&entry.image.naturalHeight);textureReady();};entry.image.onerror=()=>{entry.failed=true;};entry.image.src=base+(poster?profile.poster:profile.file);return entry.ready?entry.image:null;
  }
  function drawHellCycle(ctx,effect,time,width,height,style,id){
    const profile=HELL_CYCLES[id]||NORMAL_CYCLES[id];if(!profile)return false;
    const poster=style==='thumbnail',openEyePoster=poster&&id==='hell-sabrina',image=hellImage(id,poster&&!openEyePoster);if(!image)return false;
    if(!poster&&drawMaterialMotion(ctx,effect,time,width,height,style,id,image,profile))return true;
    const unit=Math.min(width/120,height/68)*clamp(Number(effect.scale)||1,.7,2.7),t=Math.max(0,time)*clamp(Number(effect.speed)||1,.5,1.8),aura=style==='aura'||poster;
    const open=aura?1:1-Math.pow(1-clamp(t/.32,0,1),3),release=aura?1:1-clamp((time-1.23)/.32,0,1),alpha=open*release;
    ctx.save();ctx.translate(width/2+(effect.anchor==='opponent'?23:effect.anchor==='player'?-23:0)*unit,height/2);ctx.scale(unit,unit);ctx.imageSmoothingEnabled=true;
    if(poster){ctx.globalAlpha=1;if(openEyePoster)ctx.drawImage(image,0,0,image.naturalWidth/profile.cols,image.naturalHeight/profile.rows,-60,-34,120,68);else ctx.drawImage(image,-60,-34,120,68);ctx.restore();return true;}
    const frame=style==='aura'&&profile.auraFrames?profile.auraStart+Math.floor(t*profile.fps)%profile.auraFrames:Math.floor(t*profile.fps)%profile.frames,sw=image.naturalWidth/profile.cols,sh=image.naturalHeight/profile.rows;
    // Every challenger has its own twelve authored poses. The small continuous
    // material displacement bridges key poses; the complete scene never spins
    // like a card. Horizontal bands overlap and share their x coordinates.
    const blend=profile.crossfade?clamp(((t*profile.fps)%1-.72)/.28,0,1):0,poses=blend>0?[[frame,1-blend],[(frame+1)%profile.frames,blend]]:[[frame,1]];
    const bands=12,srcW=sw*.964,srcH=sh*.964;
    for(const [pose,weight]of poses){const srcX=(pose%profile.cols)*sw+sw*.018,srcY=Math.floor(pose/profile.cols)*sh+sh*.018;
     for(let n=0;n<bands;n++){const q=(n+.5)/bands,edge=Math.abs(q-.5)*2,drift=Math.sin(t*2.3+q*5.1)*(.12+edge*.36),bulge=1+Math.sin(t*1.7+q*4)*.006;
      ctx.globalAlpha=alpha*weight;ctx.drawImage(image,srcX+n*srcW/bands,srcY,srcW/bands+.2,srcH,-profile.width/2+n*profile.width/bands,-profile.height*bulge/2+profile.y+drift,profile.width/bands+.45,profile.height*bulge);}}
    if(!aura&&t<.75&&ctx.createRadialGradient){const g=ctx.createRadialGradient(0,16,1,0,16,48);if(g?.addColorStop){const color=palettes(effect)[1]||'#e8d3ac';g.addColorStop(0,color);g.addColorStop(1,'#ffffff00');ctx.globalAlpha=Math.sin(clamp(t/.75,0,1)*Math.PI)*.09;ctx.fillStyle=g;ctx.fillRect(-52,-32,104,64);}}
    ctx.restore();return true;
  }
  let dragonAtlas=null;
  function dragonImage(){
    if(dragonAtlas)return dragonAtlas.ready?dragonAtlas.image:null;
    const base=String(root.__KANTO_FX_ASSET_ROOT__||'');if(!base||typeof root.Image!=='function')return null;
    const entry=dragonAtlas={image:new root.Image(),ready:false};entry.image.onload=()=>{entry.ready=Boolean(entry.image.naturalWidth&&entry.image.naturalHeight);textureReady();};entry.image.onerror=()=>{entry.failed=true;};entry.image.src=base+'dragon-cycle.png';return entry.ready?entry.image:null;
  }
  function drawDragonCycle(ctx,effect,time,width,height,style,id){
    // Reserve the full ceremonial coil for the hell reward. The ordinary red
    // dragon uses the articulated living-material path below, with its own
    // winding motion and silhouette rather than the same atlas.
    if(id!=='hell-lance')return false;const image=dragonImage();if(!image)return false;
    const unit=Math.min(width/120,height/68)*clamp(Number(effect.scale)||1,.7,2.7),t=Math.max(0,time)*clamp(Number(effect.speed)||1,.5,1.8),aura=style==='aura'||style==='thumbnail',envelope=aura?1:Math.min(1,t/.18)*Math.min(1,Math.max(0,(1.55-time)/.3)),frame=(t*.72%1)*12,first=Math.floor(frame),mix=frame-first,sw=image.naturalWidth/4,sh=image.naturalHeight/3;
    const opening=aura?1:.72+.28*(1-Math.pow(1-clamp(t/.35,0,1),3));
    ctx.save();ctx.translate(width/2+(effect.anchor==='opponent'?23:effect.anchor==='player'?-23:0)*unit,height/2);ctx.scale(unit*opening,unit*opening);ctx.imageSmoothingEnabled=true;
    if(effect.depthPass){ctx.beginPath();ctx.rect(-90,effect.depthPass==='front'?0:-75,180,75);ctx.clip();}
    for(const [index,alpha]of [[Math.round(frame)%12,1]]){ctx.globalAlpha=alpha*envelope;ctx.drawImage(image,(index%4)*sw,Math.floor(index/4)*sh,sw,sh,-59,-45,118,90);}
    if(effect.depthPass!=='front')for(let n=0;n<(id.startsWith('hell-')?16:9);n++){const age=(t*.25+seeded(effect.seed||1,n))%1,a=n*2.399+t*.15,r=44+age*12;ctx.globalAlpha=Math.sin(age*Math.PI)*.65*envelope;ctx.fillStyle=n%3?'#ffc874':'#fff2d0';ctx.beginPath();ctx.ellipse(Math.cos(a)*r,Math.sin(a)*r*.68,.2+age*.3,.5+age*.8,a,0,Math.PI*2);ctx.fill();}
    ctx.restore();return true;
  }
  let livingAtlas=null;
  function livingImage(){
    if(livingAtlas)return livingAtlas.ready?livingAtlas.image:null;
    const base=String(root.__KANTO_FX_ASSET_ROOT__||'');if(!base||typeof root.Image!=='function')return null;
    const entry=livingAtlas={image:new root.Image(),ready:false};
    entry.image.onload=()=>{entry.ready=Boolean(entry.image.naturalWidth&&entry.image.naturalHeight);textureReady();};
    entry.image.onerror=()=>{entry.failed=true;};entry.image.src=base+'living-art.png';return entry.ready?entry.image:null;
  }
  let prestigeAtlas=null;
  function prestigeImage(){
    if(prestigeAtlas)return prestigeAtlas.ready?prestigeAtlas.image:null;
    const base=String(root.__KANTO_FX_ASSET_ROOT__||'');if(!base||typeof root.Image!=='function')return null;
    const entry=prestigeAtlas={image:new root.Image(),ready:false};entry.image.onload=()=>{entry.ready=Boolean(entry.image.naturalWidth&&entry.image.naturalHeight);textureReady();};entry.image.onerror=()=>{entry.failed=true;};entry.image.src=base+'prestige-art.png';return entry.ready?entry.image:null;
  }
  function drawLivingScene(ctx,effect,time,width,height,style,id){
    const image=livingImage();if(!image)return false;const prestige=prestigeImage();
    const t=Math.max(0,time)*clamp(Number(effect.speed)||1,.5,1.8),seed=Number(effect.seed)||1,hell=id.startsWith('hell-'),unit=Math.min(width/120,height/68)*clamp(Number(effect.scale)||1,.7,2.7),cellW=image.naturalWidth/4,cellH=image.naturalHeight/4;
    const c=palettes(effect),theme=themeFor(effect),hash=[...id].reduce((a,ch)=>(a*33+ch.charCodeAt(0))>>>0,5381);
    let kind=/dragon|hell-lance$/.test(id)?'dragon':/eye|sabrina/.test(id)?'eye':/misty|water|lorelei/.test(id)?'wave':/lotus|spring|erika/.test(id)?'flower':/blaine|fire|spirit|phoenix/.test(id)?'phoenix':/crystal|ice|snow|frost/.test(id)?'crystal':/ghost|phantom|haze|agatha|black-hole/.test(id)?'shadow':({water:'wave',leaf:'flower',fire:'phoenix',ice:'crystal',ghost:'shadow'}[theme]||'star');
    const motifs={bats:'bats',graveyard:'grave','eerie-howl':'wolf','paper-lantern':'lantern','spinning-scythe':'scythe','spiders-web':'web','zombies-grip':'thorns','witchs-cat':'cat',pumpcat:'phoenix','white-kitty':'cat','kanto-friends':'ribbons','shiny-kanto-friends':'ribbons','pumpkings-delight':'phoenix','pumpkids-treat':'flower','anniversary-cake':'butterflies',zodiac:'zodiac',present:'ribbons','xmas-decorations':'frost','snowflake':'frost','rising-star':'meteor','hell-brock':'rock','hell-misty':'wave','hell-lt-surge':'electric','hell-erika':'flower','hell-koga':'poison','hell-sabrina':'eye','hell-blaine':'phoenix','hell-giovanni':'earth','hell-lorelei':'frost','hell-bruno':'medallion','hell-agatha':'grave','hell-lance':'dragon','hell-champion':'crown','hell-rival':'ribbons','hell-rival-route22':'meteor','hell-silph-showdown':'electric','hell-apollo':'thorns','hell-athena':'ribbons','hell-lance-rocket':'dragon','hell-lambda':'web','hell-rocket-viridian':'poison','hell-rocket-bridge':'electric','hell-rocket-celadon':'flower','hell-first-win':'phoenix'};
    kind=({'spirit-of-spring':'spring','blood-lotus-field':'blood-flower','xmas-decorations':'winter','menacing-spirit':'spirit',hitodama:'spirit',ghosts:'spirit-orbit','shiny-menacing-spirit':'spirit-orbit','phantom':'shadow','shiny-phantom':'wolf','white-kitty':'snow-cat'}[id])||motifs[id]||kind;
    // Procedural black holes and fireworks have their own launch and accretion choreography.
    if(id==='black-hole'||id==='fireworks')return false;
    if(effect.depthPass&&kind!=='dragon')return effect.depthPass==='front';
    // IDs continue to select distinct phase, density and composition, even where
    // their elemental families share components.
    const envelope=style==='aura'||style==='thumbnail'?1:Math.min(1,t/.18)*Math.min(1,Math.max(0,(1.55-time)/.28));
    const offset=(hash%97)/23, density=clamp((Number(effect.particleCount)||24)/24,.35,2.6), tau=Math.PI*2;
    ctx.save();ctx.translate(width/2+(effect.anchor==='opponent'?23:effect.anchor==='player'?-23:0)*unit,height/2);ctx.scale(unit,unit);ctx.imageSmoothingEnabled=true;
    const part=(index,x,y,w,h,angle=0,alpha=1,flip=1)=>{ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(flip,1);ctx.globalAlpha=alpha*envelope;ctx.drawImage(image,(index%4)*cellW,Math.floor(index/4)*cellH,cellW,cellH,-w/2,-h/2,w,h);ctx.restore();};
    // Strip deformation bends the painted material locally; moving the emitter
    // never substitutes for the actual wave/feather motion.
    const deform=(index,x,y,w,h,phase,alpha=1,flip=1,bend=1)=>{
      ctx.save();ctx.translate(x,y);ctx.scale(flip,1);ctx.globalAlpha=alpha*envelope;
      const cols=8,sourceX=(index%4)*cellW,sourceY=Math.floor(index/4)*cellH;
      for(let strip=0;strip<cols;strip++){const q=strip/cols,drift=Math.sin(q*Math.PI*2-phase)*h*.12*bend,swell=1+Math.cos(q*Math.PI*1.7-phase)*.12*bend;
        ctx.drawImage(image,sourceX+q*cellW,sourceY,cellW/cols,cellH,-w/2+q*w,-h*swell/2+drift,w/cols+.2,h*swell);}
      ctx.restore();
    };
    const ornament=(index,x,y,w,h,angle=0,alpha=1,flip=1)=>{if(!prestige){part(index%16,x,y,w,h,angle,alpha,flip);return;}ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(flip,1);ctx.globalAlpha=alpha*envelope;ctx.drawImage(prestige,(index%4)*prestige.naturalWidth/4,Math.floor(index/4)*prestige.naturalHeight/4,prestige.naturalWidth/4,prestige.naturalHeight/4,-w/2,-h/2,w,h);ctx.restore();};
    if(kind==='earth'){for(let side of [-1,1])for(let n=0;n<4;n++){const age=(t*.18+n*.22)%1;ornament(0,side*(12+n*12),24-Math.sin(age*Math.PI)*7,17,10,side*(.6+n*.4+t*.12),.85,side);part(14,side*(16+n*10),20-age*21,4,5,t+n,(1-age)*.5);}}else if(kind==='dragon'){
      // Segment positions follow a helix, advancing with phase; the forward
      // portion is low enough to leave the Pokémon's face visible.
      for(let pass=0;pass<2;pass++)for(let n=0;n<80;n++){const q=n/79,a=q*tau*2.15-t*1.35+offset,r=42-q*6,x=Math.cos(a)*r,y=16+Math.sin(a)*12-q*37+Math.sin(q*17-t*3)*1.4;if(Number(Math.sin(a)>0)!==pass||(effect.depthPass==='back'&&pass)||(effect.depthPass==='front'&&!pass))continue;const nextQ=Math.min(1,q+.005),a2=nextQ*tau*2.15-t*1.35+offset,r2=42-nextQ*6,dx=Math.cos(a2)*r2-x,dy=16+Math.sin(a2)*12-nextQ*37+Math.sin(nextQ*17-t*3)*1.4-y;part(1,x,y,12,6.5,Math.atan2(dy,dx),pass?.95:.62);if(n%9===0)part(2,x,y-4,9,8,Math.sin(t+n)*.3,.68);}
      const a=tau*2.15-t*1.35+offset;if(!effect.depthPass||(effect.depthPass==='front')===(Math.sin(a)>0))part(0,Math.cos(a)*36,-21+Math.sin(a)*12+Math.sin(17-t*3)*1.4,20,17,a+Math.PI/2,.98);
    }else if(kind==='spring'){
      for(let side of [-1,1])for(let n=0;n<3;n++){const y=21-n*12;deform(9,side*(30+n*5),y,21,24,t*1.3+n,.9,side,.6);ornament(11,side*(24+n*7+Math.sin(t*1.5+n)*3),y-6,9*(.2+.8*Math.abs(Math.sin(t*6+n))),10,side*.2,.85,side);}
    }else if(kind==='blood-flower'){
      for(let side of [-1,1])for(let n=0;n<4;n++){const a=n*.55+t*.25,x=side*(22+Math.sin(a)*12),y=25-n*14;ctx.save();ctx.filter='hue-rotate(315deg) saturate(1.3)';for(let k=0;k<6;k++)part(10,x,y,7,18,k*Math.PI/3+t*.25,.9,side);ctx.restore();}
    }else if(kind==='winter'){
      for(let n=0;n<7;n++){const age=(t*.12+seeded(seed,n))%1,x=-43+n*14,y=-28+age*58;part(13,x+Math.sin(t+n)*3,y,13,20,Math.sin(t*.6+n)*.6,Math.sin(age*Math.PI)*.85);}
    }else if(kind==='spirit'||kind==='spirit-orbit'){
      for(let n=0;n<7;n++){const a=n*tau/7-t*.6,x=kind==='spirit'?(n-3)*13:Math.cos(a)*39,y=kind==='spirit'?16-Math.sin(n/6*Math.PI)*29:Math.sin(a)*19-8;deform(7,x,y,13,23,t*3+n,.85,1,.7);}
    }else if(kind==='snow-cat'){
      ctx.save();ctx.filter='saturate(.25) brightness(1.7)';ornament(10,0,-25,28,31,Math.sin(t*.9)*.07,.9);ctx.restore();for(let side of [-1,1])part(13,side*31,17+Math.sin(t+side)*3,24,36,side*.2,.85,side);
    }else if(kind==='bats'){
      for(let n=0;n<8;n++){const age=(t*(.13+n%3*.025)+seeded(seed,n))%1,side=n%2?1:-1;ornament(Math.sin(t*9+n*2)>0?5:6,side*(17+age*33),-17+n%3*8+Math.sin(age*6+n)*4,12,8,side*.1,Math.sin(age*Math.PI)*.9,side);}
    }else if(kind==='grave'){
      for(let side of [-1,1])for(let n=0;n<3;n++){ornament(8,side*(22+n*10),19+n*.6,12,19,side*.08,.8,side);part(7,side*(27+n*8),5+Math.sin(t*1.5+n)*4,7,12,0,.6);}
    }else if(kind==='lantern'){
      for(let n=0;n<5;n++){const age=(t*.12+seeded(seed,n))%1,x=(n-2)*18+Math.sin(t+n)*3,y=28-age*53;ornament(4,x,y,11,17,Math.sin(t+n)*.12,Math.sin(age*Math.PI)*.9);ctx.strokeStyle=c[1]||'#ffe9ba';ctx.globalAlpha=.65;ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(x,y+8);ctx.quadraticCurveTo(x+Math.sin(t*2+n)*3,y+13,x,y+16);ctx.stroke();}
    }else if(kind==='scythe'){
      for(let n=0;n<3;n++){const a=t*1.1+n*tau/3;ornament(7,Math.cos(a)*36,Math.sin(a)*16-3,18,15,a+.6,.85);}
    }else if(kind==='butterflies'){
      for(let n=0;n<7;n++){const age=(t*.15+seeded(seed,n))%1,side=n%2?1:-1;ornament(11,side*(20+age*28),20-age*39+Math.sin(t*2+n)*3,10*(.35+.65*Math.abs(Math.sin(t*7+n))),10,side*.2,Math.sin(age*Math.PI)*.85,side);}
    }else if(kind==='cat'){
      for(let side of [-1,1]){const a=t*.6+side;ornament(10,side*(30+Math.cos(a)*4),-9+Math.sin(t*1.4+side)*4,22,24,side*.12,.8,side);part(15,side*34,8,19,27,Math.sin(a)*.2,.5,side);}
    }else if(kind==='ribbons'){
      for(let side of [-1,1])for(let n=0;n<3;n++){const a=t*.8+n*2.1;ornament(14,side*(26+n*7),Math.sin(a)*8-4,13,32,side*(.4+Math.sin(a)*.35),.65+n*.08,side);if(effect.bond100||id==='shiny-kanto-friends')ornament(11,side*(24+n*9),-20+Math.sin(t*1.5+n)*5,8*(.25+.75*Math.abs(Math.sin(t*6+n))),9,side*.15,.8,side);}
    }else if(kind==='rock'||kind==='earth'||kind==='frost'){
      for(let side of [-1,1])for(let n=0;n<3;n++){const lift=Math.sin(t*1.2+n+offset)*2;if(kind==='frost')part(13,side*(22+n*9),17-lift,13,29+n*3,side*.08,.8,side);else ornament(0,side*(22+n*9),17-lift,13,29+n*3,side*.08,.8,side);if(kind==='earth')part(14,side*(20+n*10),25-(t*9+n*9)%28,5,6,t+n,.7);}
    }else if(kind==='electric'){
      for(let side of [-1,1])for(let n=0;n<3;n++){const jump=Math.floor(t*8+n)%3;ornament(1,side*(23+n*9+jump),-4+n*5,12,32,side*.15,.65+.25*Math.sin(t*7+n)**2,side);}
    }else if(kind==='poison'||kind==='thorns'){
      for(let side of [-1,1])for(let n=0;n<3;n++){const age=(t*.18+seeded(seed,n+side*3))%1;ornament(kind==='poison'?2:12,side*(23+n*9+Math.sin(t+n)*2),20-age*38,kind==='poison'?20:12,kind==='poison'?15:30,side*.2,Math.sin(age*Math.PI)*.75,side);}
    }else if(kind==='crown'||kind==='medallion'||kind==='wolf'){
      ornament(kind==='crown'?3:kind==='wolf'?9:13,0,-20+Math.sin(t*1.5)*2,kind==='wolf'?27:24,18,Math.sin(t)*.06,.9);
      for(let n=0;n<8;n++){const a=n*tau/8+t*.65;part(14,Math.cos(a)*37,Math.sin(a)*15-5,5,8,a,.8);}
    }else if(kind==='web'){
      for(let side of [-1,1]){ctx.strokeStyle=c[1]||'#eadfff';ctx.lineWidth=.55;ctx.globalAlpha=.65;ctx.beginPath();for(let n=0;n<5;n++){ctx.moveTo(side*20,-25);ctx.lineTo(side*(25+n*6),18);}for(let n=1;n<=4;n++){ctx.moveTo(side*(20+n*2),-25+n*9);ctx.quadraticCurveTo(side*(35+n*2),-18+n*9,side*(49+n*2),-25+n*9);}ctx.stroke();ornament(12,side*40,12+Math.sin(t+side)*3,9,20,side*.3,.7,side);}
    }else if(kind==='meteor'||kind==='zodiac'){
      for(let n=0;n<10;n++){const age=(t*.25+seeded(seed,n))%1,a=n*tau/10+offset,x=Math.cos(a)*(20+age*25),y=Math.sin(a)*(12+age*15)-7;part(14,x,y,5+age*4,9+age*8,a+Math.PI/2,Math.sin(age*Math.PI)*.85);}
    }else if(kind==='eye'){
      const cycle=t%(style==='aura'?4.2:1.55),blink=Math.exp(-Math.pow((cycle-(style==='aura'?2.5:.7))/.085,2));part(blink>.65?4:3,0,-20,30,13*(1-blink*.82),0,.92);if(blink<=.65){const x=Math.sin(t*.7+offset)*4,y=Math.cos(t*.43)*1.5;ctx.fillStyle=c[2]||'#281743';ctx.globalAlpha=.9;ctx.beginPath();ctx.ellipse(x,y-20,2.1,3.2*(1-blink),0,0,tau);ctx.fill();}
      for(let side of [-1,1])part(15,side*37,0,21,37,side*.12,.35,side);
    }else if(kind==='wave'){
      for(let row=0;row<2;row++)for(let side of [-1,1])for(let n=0;n<2;n++){const age=(t*(.22+row*.04)+n*.5+row*.2)%1,travel=age*36,x=side*(18+travel),y=15+row*7+Math.sin(age*Math.PI*2-t*2)*2,fade=Math.sin(age*Math.PI);deform(5,x,y,27,17,t*3+n+row,.78*fade,side,1.3);part(6,x+side*(2+Math.sin(t*3+n)*2),y-5-Math.cos(t*3+n),13,6,Math.sin(t*3+n)*.18,.9*fade,side);}
    }else if(kind==='flower'){
      for(let side of [-1,1])for(let n=0;n<3;n++){const x=side*(18+n*11),y=22+n%2*2,open=.12+.7*(.5+.5*Math.sin(t*1.15+n*.7+offset));part(9,x,y+4,13,14,side*.35,.65,side);for(let k=-2;k<=2;k++)part(10,x+k*2.4,y,8,15,k*open,.86);}
    }else if(kind==='phoenix'){
      for(let side of [-1,1]){const flap=Math.sin(t*3+offset+side*.2);deform(8,side*(30+flap*2),-5+flap*3,35,39,t*3+side*.4,.78,side,.9);for(let n=0;n<3;n++){const age=(t*.23+seeded(seed+4,n+side*4))%1;part(7,side*(22+n*8),25-age*45,8,13,Math.sin(t+n)*.2,Math.sin(age*Math.PI)*.8,side);}}
    }else if(kind==='crystal'){
      for(let side of [-1,1])for(let n=0;n<3;n++){const x=side*(22+n*9),rise=(.5+.5*Math.sin(t*1.4+n+offset))*2;part(theme==='ice'?13:11,x,16-rise,12,29,side*.1,.8,side);}
    }else if(kind==='shadow'){
      for(let side of [-1,1]){deform(15,side*(31+Math.sin(t+offset)*3),0,27,43,t*1.5+side,.55,side,.65);for(let n=0;n<3;n++){const age=(t*.16+seeded(seed,n+(side+1)*3))%1;part(7,side*(22+n*8),22-age*40,8,12,Math.sin(t+n)*.3,Math.sin(age*Math.PI)*.7,side);}}
    }else{
      for(let n=0;n<12;n++){const a=n*tau/12+t*(.35+(hash%4)*.08),r=26+seeded(seed,n)*16;part(n%3===0?12:14,Math.cos(a)*r,Math.sin(a)*r*.55-4,5+n%3*2,8+n%2*3,a+t,.55+.3*Math.sin(t*2+n)**2);}
    }
    // Hell rewards add independent ornaments and moving highlights rather than
    // obscuring the subject with a large opaque plate.
    const count=effect.depthPass==='front'?0:Math.min(20,Math.ceil((hell?14:7)*density));for(let n=0;n<count;n++){const age=(t*(.15+(hash%5)*.015)+seeded(seed+hash,n))%1,side=n%2?1:-1,x=side*(23+seeded(seed+3,n)*24),y=25-age*48;if(hell&&n%4===0){const accent=/brock|giovanni/.test(id)?0:/koga|viridian/.test(id)?2:/champion/.test(id)?13:/apollo|rocket/.test(id)?12:/erika|celadon/.test(id)?15:/athena|rival/.test(id)?11:1;ornament(accent,x+Math.sin(t+n)*2,y,5,8,t*.4+n,Math.sin(age*Math.PI)*.65,side);}else part(14,x+Math.sin(t+n)*2,y,hell?3.5:2.5,hell?6:4,t+n,Math.sin(age*Math.PI)*(hell?.85:.65),side);}
    ctx.restore();return true;
  }
  let novelAtlas=null;
  function novelImage(){
    if(novelAtlas)return novelAtlas.ready?novelAtlas.image:null;
    const base=String(root.__KANTO_FX_ASSET_ROOT__||'');if(!base||typeof root.Image!=='function')return null;
    const entry=novelAtlas={image:new root.Image(),ready:false};entry.image.onload=()=>{entry.ready=Boolean(entry.image.naturalWidth&&entry.image.naturalHeight);textureReady();};entry.image.onerror=()=>{entry.failed=true;};entry.image.src=base+'novel-art.png';return entry.ready?entry.image:null;
  }
  ['original-windchime','original-ferntrail','original-clockwork'].forEach(id=>PIXEL_FORMS.add(id));
  function drawNovelScene(ctx,effect,time,width,height,style,id){
    if(!id.startsWith('original-'))return false;const image=novelImage();if(!image)return false;
    if(effect.depthPass==='front')return true;
    const t=Math.max(0,time)*clamp(Number(effect.speed)||1,.5,1.8),unit=Math.min(width/120,height/68)*clamp(Number(effect.scale)||1,.7,2.7),seed=Number(effect.seed)||1,tau=Math.PI*2;
    const wind=1-Math.pow(1-clamp(t/.55,0,1),3),burst=Math.sin(clamp((t-.25)/.8,0,1)*Math.PI),fade=style==='aura'?1:1-clamp((t-1.4)/.35,0,1),w=image.naturalWidth/4,h=image.naturalHeight/4;
    ctx.save();ctx.translate(width/2+(effect.anchor==='opponent'?23:effect.anchor==='player'?-23:0)*unit,height/2);ctx.scale(unit,unit);ctx.imageSmoothingEnabled=true;
    const part=(i,x,y,sx,sy,a=0,alpha=1,flip=1)=>{ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.scale(flip,1);ctx.globalAlpha=alpha*fade;ctx.drawImage(image,(i%4)*w,Math.floor(i/4)*h,w,h,-sx/2,-sy/2,sx,sy);ctx.restore();};
    const glow=(x,y,r,color,alpha)=>{if(!ctx.createRadialGradient)return;const g=ctx.createRadialGradient(x,y,0,x,y,r);if(!g?.addColorStop)return;g.addColorStop(0,color);g.addColorStop(1,'#ffffff00');ctx.globalAlpha=alpha*fade;ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,tau);ctx.fill();};
    if(id==='original-windchime'){
      // Suspended glass bells: each pendulum has its own lag; feather slips
      // rise at the edges, keeping the companion's centre unobstructed.
      for(let n=0;n<3;n++){
        const x=(n-1)*35,y=-17+(n===1?-5:5),swing=Math.sin(t*2.4+n*.8)*.22;
        ctx.save();ctx.translate(x,y);ctx.rotate(swing);ctx.globalAlpha=.8*wind*fade;
        ctx.strokeStyle='#b9dcd4';ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(0,5);ctx.stroke();
        ctx.fillStyle='#658b8b';ctx.beginPath();ctx.moveTo(-6,14);ctx.bezierCurveTo(-7,2,7,2,6,14);ctx.quadraticCurveTo(0,17,-6,14);ctx.fill();
        ctx.strokeStyle='#e2f1d8';ctx.beginPath();ctx.moveTo(-4,12);ctx.quadraticCurveTo(-4,6,0,6);ctx.stroke();
        part(15,Math.sin(t*3+n)*2,23,5,14,swing*.4,.7*wind);ctx.restore();
        const age=(t*.42+n*.31)%1;part(15,x+(n-1)*age*8,10-age*30,6,13,age*.6,.6*Math.sin(age*Math.PI)*wind);
      }
    }else if(id==='original-ferntrail'){
      for(const side of [-1,1]){
        ctx.strokeStyle='#97c7a0';ctx.lineWidth=.65;ctx.globalAlpha=.65*wind*fade;ctx.beginPath();ctx.moveTo(side*24,28);ctx.bezierCurveTo(side*46,13,side*26,-12,side*43,-29);ctx.stroke();
        for(let n=0;n<6;n++){const unfurl=clamp(t*2-n*.15,0,1),y=24-n*9,x=side*(31+Math.sin(n*.7)*5),leaf=Math.sin(t*.8+n)*.09;part(14,x,y,15*unfurl,13*unfurl,side*(.7+leaf),(.45+n*.05)*wind,side);glow(x,y,3,'#d4e5a9',.2*Math.sin(t*3-n*.6)**4*unfurl);}
      }
      for(let n=0;n<4;n++){const p=(t*.22+n*.25)%1;part(13,-42+p*84,26-Math.sin(p*Math.PI)*4,3,4,p,.5*Math.sin(p*Math.PI)*wind);}
    }else if(id==='original-clockwork'){
      // Two meshing brass wheels, with individually cut teeth and a turning
      // key; the wheels stay beside the sprite rather than covering its face.
      for(let n=0;n<2;n++){
        const side=n?1:-1,r=n?13:18,x=side*36,y=n?-16:14,a=t*(n?-1.1:.8);
        ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.globalAlpha=.8*wind*fade;ctx.strokeStyle=n?'#d7c69e':'#9f8761';ctx.fillStyle='#463e31';ctx.lineWidth=1.1;ctx.beginPath();
        for(let k=0;k<48;k++){const q=k*tau/48,rr=r*(k%4<2?1:.86);if(!k)ctx.moveTo(Math.cos(q)*rr,Math.sin(q)*rr);else ctx.lineTo(Math.cos(q)*rr,Math.sin(q)*rr);}ctx.closePath();ctx.fill();ctx.stroke();
        ctx.beginPath();ctx.arc(0,0,r*.63,0,tau);ctx.stroke();for(let k=0;k<4;k++){const q=k*tau/4;ctx.beginPath();ctx.moveTo(Math.cos(q)*4,Math.sin(q)*4);ctx.lineTo(Math.cos(q)*r*.6,Math.sin(q)*r*.6);ctx.stroke();}ctx.restore();
      }
      const turn=Math.sin(t*1.7)*.6;ctx.save();ctx.translate(0,-24);ctx.rotate(turn);ctx.globalAlpha=.75*wind*fade;ctx.strokeStyle='#e2d5b2';ctx.lineWidth=1.7;ctx.beginPath();ctx.arc(-7,0,4,0,tau);ctx.moveTo(-3,0);ctx.lineTo(13,0);ctx.lineTo(13,4);ctx.moveTo(8,0);ctx.lineTo(8,3);ctx.stroke();ctx.restore();
      for(let n=0;n<3;n++)part(9,(-1)**n*43,10-n*13,2,4,t+n,.35*wind);
    }else if(id==='original-starsea'){
      glow(0,-13,48,'#aac9ed',.22*wind);for(let n=0;n<3;n++)part(3,0,18+n*4,70+n*12,12,Math.sin(t*.7+n)*.03,.4*wind);
      // Jointed body: independent head, torso and tail swing with delayed phase.
      const y=-17+Math.sin(t*1.2)*2,swim=Math.sin(t*2.1);part(0,11,y,39,26,swim*.05,.95*wind);part(1,-8,y+swim*.7,29,20,-swim*.08,.96*wind);part(2,-23,y+Math.sin(t*2.1-.7)*2,25,20,Math.sin(t*2.1-.8)*.2,.96*wind);
      for(let n=0;n<7;n++){const a=n*tau/7+t*.35;part(15,Math.cos(a)*42,-9+Math.sin(a)*19,6,10,a,.32+.3*Math.sin(t+n)**2);}
    }else if(id==='original-koi'){
      glow(0,10,45,'#d5e9e3',.2*wind);for(let n=0;n<3;n++)part(3,0,20+n*3,64+n*12,10,t*.1,.42*wind);
      for(let n=0;n<2;n++){const a=t*.75+n*Math.PI,x=Math.cos(a)*31,y=Math.sin(a)*12-1,turn=Math.sin(a)>=0?1:-1,bend=Math.sin(t*4+n*2);part(n?5:4,x,y,27,17,a*.15,.95*wind,turn);part(6,x-turn*13,y+bend*2,14,13,-turn*bend*.3,.9*wind,turn);}
      for(let side of [-1,1])part(7,side*38,19,18,13,side*.2,.75*wind,side);
    }else if(id==='original-hourglass'){
      glow(0,-10,38,'#f5d69c',.23*wind);for(let side of [-1,1])part(10,side*32,5,17,32,side*(.12+Math.sin(t+side)*.08),.62*wind,side);
      part(8,0,-8,30,43,Math.sin(t*.6)*.035,.94*wind);part(9,0,-6+(t*8)%5,9,25,0,.88*wind);
      for(let n=0;n<12;n++){const age=(t*.3+seeded(seed,n))%1,x=(seeded(seed+2,n)-.5)*19,y=15+age*9;part(9,x,y,2,3,0,(1-age)*.5*wind);}
    }else if(id==='original-eclipse'){
      glow(0,-17,37,'#e8d6ba',.24*wind);ctx.globalAlpha=.55*fade*wind;ctx.strokeStyle='#f3dfb9';ctx.lineWidth=1;for(let n=0;n<3;n++){ctx.beginPath();ctx.ellipse(0,-17,19+n*4,19+n*4,0,t*.25+n*.5,t*.25+n*.5+Math.PI*1.55);ctx.stroke();}
      part(11,0,-17,34,34,-.4+Math.sin(t*.4)*.08,.95*wind);for(let side of [-1,1])part(15,side*33,5,20,31,side*(.35+Math.sin(t+side)*.1),.65*wind,side);
    }else if(id==='original-aurora'){
      glow(0,-17,53,'#b4e0db',.2*wind);for(let n=0;n<5;n++){const x=(n-2)*18,flow=Math.sin(t*1.1+n*.8);part(12,x,-12+flow*3,24,48,flow*.1,.48*wind);}
      for(let side of [-1,1])part(14,side*37,19,23,28,side*(.35+Math.sin(t+side)*.1),.7*wind,side);
    }else{
      glow(-28,8,30,'#e9d9a1',.18*wind);glow(30,-7,29,'#d9e9bd',.17*wind);for(let side of [-1,1])for(let n=0;n<3;n++)part(14,side*(24+n*9),23,18,29,side*(.3+Math.sin(t*.8+n)*.15),.7*wind,side);
      for(let n=0;n<14;n++){const a=t*(.45+seeded(seed,n)*.35)+n*2.399,r=18+seeded(seed+5,n)*28,x=Math.cos(a)*r,y=Math.sin(a*1.25)*20-3,shine=.35+.55*Math.sin(t*2+n)**4;glow(x,y,5,'#fff5bd',shine*.22);part(13,x,y,5,6,Math.sin(t+n)*.3,shine*wind);}
    }
    ctx.restore();return true;
  }
  const heroAtlases=new Map();
  function heroImage(sheet){
    if(heroAtlases.has(sheet)){const entry=heroAtlases.get(sheet);return entry.ready?entry.image:null;}
    const base=String(root.__KANTO_FX_ASSET_ROOT__||'');if(!base||typeof root.Image!=='function')return null;
    const entry={image:new root.Image(),ready:false};heroAtlases.set(sheet,entry);entry.image.onload=()=>{entry.ready=Boolean(entry.image.naturalWidth&&entry.image.naturalHeight);textureReady();};entry.image.onerror=()=>{entry.failed=true;};entry.image.src=base+'hero-'+sheet+'.png';return entry.ready?entry.image:null;
  }
  function drawHeroScene(ctx,effect,time,width,height,style,id){
    // The legacy full-scene four-frame sheets read like a rapidly changing
    // backdrop. These themes now use the articulated living-atlas emitters.
    if(['bats','graveyard','the-eye','snowflake','witchs-haze','dark-crystal','blood-lotus-field','spirit-of-spring','xmas-decorations'].includes(id))return false;
    if(!id||id.startsWith('original-')||/^(red-dragon|hell-lance|black-hole|fireworks|shiny|secret-shiny|rising-star|hell-lt-surge|hell-rocket-bridge|spirit-of-spring|blood-lotus-field|xmas-decorations|shiny-dark-crystal|hell-bruno|hell-rival|hell-rival-route22|hell-giovanni)$/.test(id))return false;
    const explicit={
      'hell-brock':['terrain',0], 'hell-misty':['elemental',0], 'hell-lt-surge':['elemental',1], 'hell-erika':['elemental',2], 'hell-koga':['terrain',2], 'hell-sabrina':['elemental',3], 'hell-blaine':['elemental',1], 'hell-giovanni':['terrain',0], 'hell-lorelei':['terrain',1], 'hell-bruno':['terrain',0], 'hell-agatha':['spectral',1], 'hell-champion':['spectral',3],
      'hell-rival':['spectral',3], 'hell-rival-route22':['terrain',0], 'hell-silph-showdown':['terrain',3], 'hell-apollo':['terrain',3], 'hell-athena':['spectral',2], 'hell-lance-rocket':['terrain',3], 'hell-lambda':['spectral',2], 'hell-rocket-viridian':['terrain',2], 'hell-rocket-bridge':['elemental',1], 'hell-rocket-celadon':['spectral',0], 'hell-first-win':['spectral',3],
      'the-eye':['elemental',3], bats:['spectral',2], graveyard:['spectral',1], 'paper-lantern':['spectral',0], 'lotus-field':['elemental',2], 'blood-lotus-field':['elemental',2], 'spirit-of-spring':['elemental',2], 'dark-crystal':['terrain',3], 'shiny-dark-crystal':['terrain',3], snowflake:['terrain',1], 'xmas-decorations':['terrain',1], 'pungent-stench':['terrain',2], 'witchs-haze':['terrain',2], 'kings-fall':['spectral',3], 'rising-star':['spectral',3], 'secret-shiny':['spectral',3]
    };
    const fallback={water:['elemental',0],fire:['elemental',1],leaf:['elemental',2],electric:['elemental',1],ice:['terrain',1],ghost:['spectral',1],starlight:['spectral',3],dust:['terrain',0]};
    if(!explicit[id]&&!id.startsWith('hell-'))return false;
    const [sheet,row]=explicit[id]||fallback[themeFor(effect)]||['spectral',3],image=heroImage(sheet);if(!image)return false;
    if(effect.depthPass==='front')return true;
    const t=Math.max(0,time)*clamp(Number(effect.speed)||1,.5,1.8),open=1-Math.pow(1-clamp(t/.45,0,1),3),fade=style==='aura'?1:1-clamp((t-1.4)/.35,0,1),unit=Math.min(width/120,height/68)*clamp(Number(effect.scale)||1,.7,2.7),cellW=image.naturalWidth/4,cellH=image.naturalHeight/4;
    // Four authored frames contain genuine material evolution. Slice each frame
    // into narrow independent bands so waves, fire and mist continue to flow
    // between frame changes without shifting the entire painted scene.
    const identity=[...id].reduce((value,ch)=>(value*31+ch.charCodeAt(0))>>>0,7),frame=(Math.floor(t*(4+(identity%3)))+identity%4)%4,phase=t*(sheet==='elemental'&&row===0?2.8:sheet==='spectral'&&row===2?4:1.5),alpha=fade*open;
    ctx.save();ctx.translate(width/2+(effect.anchor==='opponent'?23:effect.anchor==='player'?-23:0)*unit,height/2);ctx.scale(unit,unit);ctx.imageSmoothingEnabled=true;
    if(ctx.createRadialGradient){const color=sheet==='elemental'?(row===0?'#a4e6ef':row===1?'#ffd6a0':row===2?'#e5d6d6':'#d8c4ef'):sheet==='terrain'?(row===0?'#e4c9a4':row===1?'#d3f2ff':row===2?'#c6e2bc':'#d2c3ef'):'#e9ddc3',g=ctx.createRadialGradient(0,0,2,0,0,49);if(g?.addColorStop){g.addColorStop(0,color);g.addColorStop(1,'#ffffff00');ctx.globalAlpha=.13*alpha;ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,0,55,33,0,0,Math.PI*2);ctx.fill();}}
    if(sheet==='terrain'&&row===3&&/apollo|lance-rocket/.test(id))ctx.filter='hue-rotate(55deg) saturate(1.1)';
    const strips=12;for(let n=0;n<strips;n++){const sourceX=n*cellW/strips,side=n<strips/2?-1:1,edge=Math.abs((n+.5)/strips-.5)*2,flow=Math.sin(phase+n*.7+row)*(.4+edge*.8),dx=sheet==='elemental'&&row===0?flow*1.8:flow*.4,dy=sheet==='elemental'&&row===1?-flow*1.5:sheet==='terrain'&&row===2?flow*1.2:flow*.55;
      ctx.globalAlpha=alpha;ctx.drawImage(image,frame*cellW+cellW*.025+n*(cellW*.95)/strips,row*cellH+cellH*.075,cellW*.95/strips+.25,cellH*.85,-56+n*112/strips,-32+dy,112/strips+1.1,64);}
    ctx.restore();return true;
  }
  // Missing optional artwork must not collapse unrelated earned rewards into
  // the same spring-petal scene. Keep their current identities in fallback.
  function drawRewardFallback(ctx,effect,time,width,height,style,id){
    if(!['pumpkids-treat','anniversary-cake'].includes(id))return false;
    const t=Math.max(0,time)*clamp(Number(effect.speed)||1,.5,1.8),unit=Math.min(width/120,height/68)*clamp(Number(effect.scale)||1,.7,2.7),colors=palettes(effect),seed=Number(effect.seed)||1;
    const steady=style==='aura'||style==='thumbnail',smooth=q=>{q=clamp(q,0,1);return q*q*(3-2*q);},fade=steady?.78:smooth(time/.25)*(1-smooth((time-1.18)/.37));
    ctx.save();ctx.translate(width/2+(effect.anchor==='opponent'?23:effect.anchor==='player'?-23:0)*unit,height/2);ctx.scale(unit,unit);ctx.shadowBlur=0;
    if(id==='pumpkids-treat'){
      // Warm curved petals lift from the ground at both edges, with a small
      // fading ember trail. The companion's central silhouette stays clear.
      for(let n=0;n<12;n++){
        const age=(t*(.2+seeded(seed,n)*.08)+seeded(seed+1,n))%1,side=n%2?1:-1,x=side*(24+age*24)+Math.sin(t*1.3+n)*3,y=27-age*57,r=2+seeded(seed+3,n)*2;
        ctx.save();ctx.translate(x,y);ctx.rotate(side*(age*2.3+n));ctx.globalAlpha=fade*Math.sin(age*Math.PI)*.9;ctx.fillStyle=n%3?colors[0]:'#ffdfad';ctx.beginPath();ctx.moveTo(0,-r);ctx.bezierCurveTo(-r*.9,-r*.3,-r*.55,r*.8,0,r*.55);ctx.bezierCurveTo(r*.7,r*.25,r*.8,-r*.5,0,-r);ctx.fill();ctx.restore();
        ctx.globalAlpha=fade*(1-age)*.35;ctx.strokeStyle='#ffc590';ctx.lineWidth=.45;ctx.beginPath();ctx.moveTo(x,y+3);ctx.quadraticCurveTo(x-side*2,y+5,x-side*3,y+8);ctx.stroke();
      }
    }else{
      // Paired butterflies bank and flap independently around the outer arc.
      for(let n=0;n<6;n++){
        const a=n*Math.PI/3+t*(.38+n%2*.12),x=Math.cos(a)*(33+n%2*10),y=-8+Math.sin(a)*20,flap=.15+.85*Math.abs(Math.sin(t*7+n*1.7));
        ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(a)*.35);ctx.globalAlpha=fade*.86;
        for(const side of [-1,1]){ctx.save();ctx.scale(side*flap,1);ctx.fillStyle=n%2?colors[1]||'#f1d6bb':colors[0];ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(3,-8,11,-7,8,-1);ctx.bezierCurveTo(12,5,3,7,0,0);ctx.fill();ctx.restore();}
        ctx.strokeStyle='#e8d9bd';ctx.lineWidth=.55;ctx.beginPath();ctx.moveTo(0,-3);ctx.lineTo(0,3);ctx.stroke();ctx.restore();
      }
    }
    ctx.restore();return true;
  }
  function drawPixelScene(ctx,effect,time,width,height,style='preview'){
    const signatureId=PIXEL_FORMS.has(effect.particleId)||['original-windchime','original-ferntrail','original-clockwork'].includes(effect.particleId)?effect.particleId:(LEGACY_PIXEL_IDS[formFor(effect)]||'');
    if(drawHellCycle(ctx,effect,time,width,height,style,signatureId)||drawDragonCycle(ctx,effect,time,width,height,style,signatureId)||drawNovelScene(ctx,effect,time,width,height,style,signatureId))return;
    if(drawHeroScene(ctx,effect,time,width,height,style,signatureId)){if(['hell-apollo','hell-lance-rocket','hell-lambda','hell-agatha','hell-athena','hell-rival-route22'].includes(signatureId))drawLivingScene(ctx,{...effect,opacity:.65},time,width,height,style,signatureId);return;}
    if(drawLivingScene(ctx,effect,time,width,height,style,signatureId))return;
    if(drawRewardFallback(ctx,effect,time,width,height,style,signatureId))return;
    const replacement={'pumpkings-delight':'menacing-spirit','kanto-friends':'shiny','shiny-kanto-friends':'secret-shiny'};
    if(replacement[signatureId]){drawIllustratedScene(ctx,effect,time,width,height,style,replacement[signatureId]);return;}
    if(drawSignatureScene(ctx,effect,time,width,height,style,signatureId)||drawIllustratedScene(ctx,effect,time,width,height,style,signatureId)||drawBossScene(ctx,effect,time,width,height,style,signatureId))return;
    if(!pixelCanvas)return;const pctx=pixelCanvas.getContext('2d');if(!pctx)return;pctx.imageSmoothingEnabled=false;pctx.globalAlpha=1;pctx.globalCompositeOperation='source-over';pctx.clearRect(0,0,120,68);
    const form=formFor(effect),id=PIXEL_FORMS.has(effect.particleId)?effect.particleId:(LEGACY_PIXEL_IDS[form]||''),colors=palettes(effect),seed=Number(effect.seed)||1,t=(time*(Number(effect.speed)||1))%1.6,phase=time*(Number(effect.speed)||1),count=clamp(Math.round(Number(effect.particleCount)||18),6,48),cx=60,anchorShift=effect.anchor==='opponent'?23:effect.anchor==='player'?-23:0,baseline=59,size=clamp(Number(effect.scale)||1,.7,1.5),sprite=(key,x,y,s=1,palette=colors)=>pixelSprite(pctx,PIXEL_SPRITES[key],x,y,s,palette);
    pctx.save();pctx.translate(anchorShift,0);
    const groundColor=colors[2]||colors[0],highlight=colors[1]||colors[0];
    // Subtle secondary motion gives every collectible a beginning and depth,
    // even for the compact character-shaped effects.  Keep it below the focal
    // sprite and cap work independent of screen size or collection size.
    if(!id.startsWith('hell-')&&!['shiny','fireworks','black-hole','bats','graveyard','lotus-field','blood-lotus-field'].includes(id)){
      pixelOrbit(pctx,cx,56,25,3,phase*.3,groundColor,.42,24);
      for(let n=0;n<Math.min(12,Math.ceil(count/3));n++){const a=n*2.399+phase*.55,r=16+seeded(seed+11,n)*16,x=cx+Math.cos(a)*r,y=27+Math.sin(a)*r*.58;pixelDot(pctx,x,y,n%5===0?2:1,n%3===0?highlight:n%3===1?colors[0]:groundColor);}
    }
    if(id.startsWith('hell-')&&id!=='hell-first-win'){
      const theme=({'hell-brock':'rock','hell-misty':'water','hell-lt-surge':'electric','hell-erika':'leaf','hell-koga':'poison','hell-sabrina':'psychic','hell-blaine':'fire','hell-giovanni':'earth','hell-lorelei':'ice','hell-bruno':'fist','hell-agatha':'ghost','hell-lance':'dragon','hell-champion':'crown','hell-rival':'rival','hell-rival-route22':'rival','hell-silph-showdown':'psychic','hell-apollo':'rocket','hell-athena':'rocket','hell-lance-rocket':'rocket','hell-lambda':'rocket','hell-rocket-viridian':'rocket','hell-rocket-bridge':'rocket','hell-rocket-celadon':'rocket'})[id]||'fire';
      const variant=seed%7,osc=Math.sin(phase*2),spark=(x,y,col=highlight)=>pixelSpark(pctx,x,y,1,'#fff4dc',col,.7);
      pixelOrbit(pctx,cx,56,30,4,phase*.25,colors[0],.5,36);
      // A faint back layer frames the subject while keeping its central silhouette clear.
      for(let n=0;n<16;n++){const a=n*2.399+phase*.22,r=31+(n%4)*3,x=cx+Math.cos(a)*r,y=31+Math.sin(a)*r*.59;pctx.globalAlpha=.18+(n%3)*.08;pixelDot(pctx,x,y,n%5===0?2:1,n%2?colors[0]:highlight);}pctx.globalAlpha=1;
      if(theme==='rock'){
        for(let side of [-1,1])for(let n=0;n<3;n++){const x=cx+side*(23+n*7),h=9+n*5+Math.sin(phase+n)*2,y=57-h;pctx.fillStyle=groundColor;pctx.fillRect(x-3,y,7,h);pctx.fillRect(x-2,y-3,5,3);pctx.fillStyle=colors[0];pctx.fillRect(x-2,y+1,3,h-2);pixelDot(pctx,x-1,y,2,highlight);}
        for(let n=0;n<9;n++){const a=n*2.4+phase*.3,r=22+n%3*4;pixelDot(pctx,cx+Math.cos(a)*r,31+Math.sin(a)*r*.6,2,n%2?colors[0]:highlight);}
      }else if(theme==='earth'){
        for(let side of [-1,1])for(let n=0;n<5;n++){const x=cx+side*(8+n*6),y=57+n%2*2;pctx.fillStyle=groundColor;pctx.fillRect(x,y,side*7,3);pctx.fillRect(x+side*5,y-3,side*2,4);pixelDot(pctx,x+side*3,y,2,highlight);}
        for(let n=0;n<8;n++){const q=seeded(seed,n),age=(phase*.5+q)%1,x=cx+(n%2?1:-1)*(12+q*26),y=57-age*21;pctx.globalAlpha=1-age;pixelDot(pctx,x,y,2+n%2,colors[0]);pixelDot(pctx,x-2,y+3,1,highlight);}pctx.globalAlpha=1;
      }else if(theme==='water'){
        for(let n=0;n<4;n++)pixelOrbit(pctx,cx,54-n*2,20+n*6,2+n,phase*(n%2?-.5:.4),n%2?highlight:colors[0],.7,42);
        for(let side of [-1,1])for(let n=0;n<10;n++){const a=n*.24+phase*.65,x=cx+side*(26+Math.sin(a)*8),y=50-n*3;pixelDot(pctx,x,y,2,colors[0]);pixelDot(pctx,x-side*3,y+2,1,highlight);}
        for(let n=0;n<5;n++){const a=n*1.26+phase*.7;spark(cx+Math.cos(a)*33,27+Math.sin(a)*17,colors[0]);}
      }else if(theme==='ice'){
        for(let side of [-1,1])for(let n=0;n<3;n++){const x=cx+side*(23+n*7),h=11+n*4,y=56-h;pctx.fillStyle=groundColor;pctx.fillRect(x-3,y+4,7,h-4);pctx.fillStyle=colors[0];pctx.fillRect(x-2,y+2,5,h-2);pctx.fillRect(x-1,y,3,2);pctx.fillStyle=highlight;pctx.fillRect(x-1,y+3,1,h-4);}
        for(let n=0;n<7;n++){const x=cx-35+n*11,y=15+((n*9+phase*7)%30);sprite('snow',x-3,y-3,1,[highlight,colors[0],groundColor]);pixelDot(pctx,x,y-4,1,colors[0]);}
      }else if(theme==='electric'){
        for(let n=0;n<5;n++){const x=cx-30+n*15,y=14+(n%3)*5+(Math.floor(phase*6+n)%3);pctx.fillStyle=highlight;pctx.fillRect(x,y,3,9);pctx.fillRect(x-3,y+7,6,3);pctx.fillRect(x-3,y+9,3,7);spark(x,y+16,colors[0]);}
      }else if(theme==='leaf'){
        for(let n=0;n<10;n++){const a=n*2.4+phase*.8,r=17+(n%4)*5,x=cx+Math.cos(a)*r,y=30+Math.sin(a)*r*.65;sprite('leaf',x-3,y-3,1,[colors[0],highlight,groundColor]);}
        for(let n=0;n<5;n++)pixelDot(pctx,cx-28+n*14,55,2,highlight);
      }else if(theme==='poison'||theme==='ghost'){
        for(let n=0;n<6;n++){const a=n*1.05+phase*.6,x=cx+Math.cos(a)*(23+n%2*5),y=29+Math.sin(a)*15;sprite(theme==='ghost'?'ghost':'spirit',x-3,y-3,1,[colors[0],highlight,groundColor]);}
        for(let n=0;n<9;n++){const x=cx-30+n*7,y=48+Math.sin(phase+n)*3;pctx.globalAlpha=.35;pixelDot(pctx,x,y,3,colors[0]);}pctx.globalAlpha=1;
      }else if(theme==='psychic'){
        for(let n=0;n<3;n++)pixelOrbit(pctx,cx,30,12+n*9,7+n*5,phase*(n%2?-1:1),n%2?highlight:colors[0],.75,44);
        for(let n=0;n<4;n++){const a=phase+n*Math.PI/2;spark(cx+Math.cos(a)*27,30+Math.sin(a)*15,colors[0]);}
      }else if(theme==='fire'){
        for(let n=0;n<9;n++){const x=cx-32+n*8,y=54-(n%3)*3-Math.abs(Math.sin(phase*2+n))*8;pctx.fillStyle=colors[0];pctx.fillRect(x,y,5,8);pctx.fillRect(x+1,y-4,3,4);pixelDot(pctx,x+2,y+2,2,highlight);}
      }else if(theme==='fist'){
        for(let side of [-1,1]){const x=cx+side*(23+osc*3),y=25;pctx.fillStyle=groundColor;pctx.fillRect(x-6,y,12,10);pctx.fillStyle=colors[0];pctx.fillRect(x-5,y+1,10,6);for(let n=0;n<3;n++)pixelDot(pctx,x-4+n*3,y+1,2,highlight);}
        for(let n=0;n<6;n++)pixelDot(pctx,cx-30+n*12,49+(n%2)*4,3,colors[0]);
      }else if(theme==='dragon'){
        for(let n=0;n<15;n++){const a=n*.4+phase*.7,x=cx+Math.cos(a)*30,y=30+Math.sin(a)*16;pixelDot(pctx,x,y,n%3?2:3,n%2?colors[0]:highlight);}sprite('dragon',cx+Math.cos(phase*.7)*30-5,30+Math.sin(phase*.7)*16-4,1,[colors[0],highlight,groundColor]);
      }else if(theme==='crown'||theme==='rival'){
        const rivalRoute=id==='hell-rival-route22';sprite(theme==='crown'?'crown':rivalRoute?'dragon':'star',cx-7,12+osc*2,2,[colors[0],highlight,groundColor]);for(let n=0;n<8;n++){const a=n*Math.PI/4+phase*(rivalRoute?-.7:.4),r=rivalRoute?20+n%2*12:29;spark(cx+Math.cos(a)*r,31+Math.sin(a)*(rivalRoute?9:15),colors[n%2]);}if(rivalRoute){pixelOrbit(pctx,cx,34,33,17,-phase*.5,highlight,.6,36);}
      }else{
        const rocketStyle=['hell-apollo','hell-athena','hell-lance-rocket','hell-lambda','hell-rocket-viridian','hell-rocket-bridge','hell-rocket-celadon'].indexOf(id);
        const x=cx-9,y=13+osc*2;
        if(rocketStyle===0||rocketStyle===4){sprite('skull',x+2,y,2,[colors[0],highlight,groundColor]);}
        else if(rocketStyle===1||rocketStyle===6){sprite('scythe',x,y,2,[colors[0],highlight,groundColor]);}
        else if(rocketStyle===2){sprite('dragon',x-1,y,2,[colors[0],highlight,groundColor]);}
        else if(rocketStyle===3){sprite('eye',x-4,y+2,2,[colors[0],highlight,groundColor]);}
        else {pctx.fillStyle=groundColor;pctx.fillRect(x-3,y-3,24,21);pctx.fillStyle=colors[0];pctx.fillRect(x,y,18,15);pctx.fillStyle='#fff0dc';pctx.fillRect(x+4,y+3,3,9);pctx.fillRect(x+7,y+3,6,3);pctx.fillRect(x+10,y+6,3,3);pctx.fillRect(x+8,y+9,3,3);pctx.fillRect(x+11,y+12,3,2);}
        for(let n=0;n<12;n++){const a=n*Math.PI/6+phase*(rocketStyle%2?-.5:.5),r=22+(rocketStyle%3)*4,x=cx+Math.cos(a)*r,y=32+Math.sin(a)*r*.55;if(rocketStyle%3===0)pixelSpark(pctx,x,y,1,highlight,colors[0],.7);else if(rocketStyle%3===1){pctx.fillStyle=colors[0];pctx.fillRect(x,y,5,1);pctx.fillRect(x+2,y-2,1,5);}else pixelDot(pctx,x,y,n%2?2:3,n%2?highlight:colors[0]);}
        if(rocketStyle>=3)for(let n=0;n<4;n++){const x=cx-32+n*20,y=48+(n%2)*4;pctx.fillStyle=groundColor;pctx.fillRect(x,y,8,3);pixelDot(pctx,x+3,y-2,2,highlight);}
      }
      for(let side of [-1,1])for(let n=0;n<4;n++){const x=cx+side*(23+n*5),y=53+(n%2)*3;pctx.globalAlpha=.3+.25*Math.sin(phase*2+n)**2;pixelDot(pctx,x,y,2,n%2?colors[0]:highlight);pixelDot(pctx,x-side*2,y+2,1,groundColor);}pctx.globalAlpha=1;
    }else if(id==='hell-first-win'){
      // A broken obsidian crown frames the creature; embers rise through a molten seal.
      pixelOrbit(pctx,cx,56,35,6,phase*.24,'#8d2835',.7,48);
      pixelOrbit(pctx,cx,56,28,4,-phase*.36,'#ff7740',.85,42);
      for(let n=0;n<7;n++){const x=cx-30+n*10,h=5+(n%3)*3;pctx.fillStyle='#40152c';pctx.fillRect(x,55-h,6,h);pctx.fillRect(x+1,53-h,4,2);pixelDot(pctx,x+2,54-h,2,'#f04b32');}
      for(let side of [-1,1])for(let n=0;n<4;n++){const x=cx+side*(25+n*3),y=45-n*7;pctx.fillStyle='#6d1637';pctx.fillRect(x,y,side*3,5);pixelDot(pctx,x,y-2,2,n%2?'#ff8b3d':'#ff492c');}
      for(let n=0;n<Math.min(count,32);n++){const q=seeded(seed,n),age=(phase*.35+q)%1,x=cx+(seeded(seed+8,n)-.5)*62+Math.sin(phase*2+n)*3,y=56-age*47,fade=Math.sin(age*Math.PI);pctx.globalAlpha=fade*.8;pixelDot(pctx,x,y,q>.8?2:1,n%3===0?'#fff0a0':n%3===1?'#ff9a43':'#e52e32');if(q>.72)pixelDot(pctx,x,y+3,1,'#8d2835');}pctx.globalAlpha=1;
      for(let n=0;n<3;n++){const x=cx+(n-1)*19,y=50-Math.sin(phase*2+n)*2;pixelSpark(pctx,x,y,1,'#fff1a8','#ff5a32',.5+.4*Math.sin(phase*3+n));}
    }else if(id==='shiny'){
      const pulse=.45+.55*Math.sin(phase*Math.PI/1.6)**2,spread=12+Math.round(pulse*8);
      // A dim, broken halo precedes the bright foreground flashes.
      for(let ring=0;ring<2;ring++)pixelOrbit(pctx,cx,34,12+ring*9+pulse*5,7+ring*4,phase*(ring?-.5:.7),ring?groundColor:colors[0],.25+ring*.12,32);
      pixelOrbit(pctx,cx,48,18+spread*.35,4+spread*.09,phase*.6,groundColor,.55);
      for(let n=0;n<10;n++){const a=n*Math.PI/5+phase*.34,r=spread+(n%3)*4,x=cx+Math.cos(a)*r,y=33+Math.sin(a)*r*.68,twinkle=.35+.65*Math.abs(Math.sin(phase*4+n));pixelSpark(pctx,x,y,n%4===0?2:1,highlight,colors[0],twinkle);}
      for(let n=0;n<count;n++){const q=seeded(seed,n),a=n*2.399+phase*.4,r=17+q*17,y=33+Math.sin(a)*r*.7;pixelDot(pctx,cx+Math.cos(a)*r,y,q>.86?2:1,n%3===0?highlight:n%3===1?colors[0]:groundColor);}
      pixelSpark(pctx,cx-14,22,2,highlight,'#ffe697',pulse);pixelSpark(pctx,cx+16,30,1,'#fffdf0',colors[0],pulse);pixelSpark(pctx,cx-26,48,1,highlight,groundColor,pulse*.8);
    }else if(id==='fireworks'){
      for(let launch=0;launch<3;launch++){
        const age=t-launch*.28;if(age<0)continue;const burst=(age-.45)/1.15,x0=cx+(launch-1)*22,y0=15+(launch%2)*8,pal=[colors[0],groundColor,highlight][launch];
        if(age<.45){const y=baseline-4-age*72;for(let tail=0;tail<11;tail++){pctx.globalAlpha=Math.max(.18,1-tail*.075);pixelDot(pctx,x0+Math.round(Math.sin(tail*1.7+phase*8)*tail*.16),y+tail*2,tail<2?2:1,tail%2?pal:highlight);}pctx.globalAlpha=1;}
        else {const reach=3+(1-Math.exp(-burst*3))*17,gravity=burst*burst*9,fade=Math.max(0,1-burst*.85);pctx.globalAlpha=fade;
          if(burst<.24)pixelSpark(pctx,x0,y0,2,'#fffdf0',pal,1-burst/.24);pctx.globalAlpha=fade;
          for(let n=0;n<14;n++){const a=n*Math.PI/7+launch*.2,dx=Math.cos(a),dy=Math.sin(a)*.72;for(let tail=0;tail<3;tail++){const rr=reach-tail*2;pixelDot(pctx,x0+dx*rr,y0+dy*rr+gravity,tail===0?2:1,tail===0?highlight:pal);}}
          for(let n=0;n<8;n++){const q=seeded(seed+launch,n),a=n*2.399,rr=reach*(.4+q*.7);pixelDot(pctx,x0+Math.cos(a)*rr,y0+Math.sin(a)*rr*.7+gravity,q>.8?2:1,n%2?highlight:pal);}pctx.globalAlpha=1;
        }
      }
    }else if(id==='black-hole'){
      const cy=25,open=Math.min(1,phase*2.7),rotation=phase*1.8;
      // Broken outer accretion streams arrive before the dark core opens.
      for(let n=0;n<18;n++){const a=n*2.399-rotation*.6,r=24+(n%4)*3,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r*.48;pctx.globalAlpha=.25+(n%3)*.12;pixelDot(pctx,x,y,n%6===0?2:1,n%3?groundColor:colors[0]);}pctx.globalAlpha=1;
      for(let ring=3;ring>=0;ring--){const rx=(10+ring*4)*open,ry=(4+ring*1.7)*open;pixelOrbit(pctx,cx,cy,rx,ry,rotation*(ring%2?1:-.7),ring%2?colors[0]:groundColor,.48+ring*.1,54);}
      for(let y=-7;y<=7;y++)for(let x=-10;x<=10;x++){const d=x*x/100+y*y/49;if(d<open*open)pixelDot(pctx,cx+x,cy+y,1,d<.43?'#100e23':d<.72?'#422672':d<.9?colors[0]:highlight);}
      for(let n=0;n<count;n++){const q=seeded(seed,n),a=n*2.399+rotation,r=6+((n*3+phase*10)%22);for(let tail=2;tail>=0;tail--){const old=a-tail*.15,rr=r+tail*1.2;pctx.globalAlpha=tail?.2:1;pixelDot(pctx,cx+Math.cos(old)*rr,cy+Math.sin(old)*rr*.53,tail?1:q>.85?2:1,n%3?colors[0]:highlight);}}pctx.globalAlpha=1;
      pixelOrbit(pctx,cx,cy,11*open,4.5*open,-rotation*.4,highlight,.65,36);
      for(let n=0;n<5;n++){const a=n*1.26+rotation,r=24+Math.sin(phase+n)*3;pixelSpark(pctx,cx+Math.cos(a)*r,cy+Math.sin(a)*r*.57,1,highlight,groundColor,.7);}
    }else if(id==='bats'){
      // Smaller silhouettes recede behind the wider, brighter foreground flock.
      for(let n=0;n<4;n++){const a=phase*.7+n*1.57,x=cx+Math.cos(a)*27,y=24+Math.sin(a)*13;pctx.globalAlpha=.35;pixelSprite(pctx,PIXEL_SPRITES.batB,x-8,y-4,1,[groundColor,groundColor,colors[0]],groundColor);}pctx.globalAlpha=1;
      for(let n=0;n<7;n++){const a=phase*.9+n*.91,r=13+(n%3)*6,x=cx+Math.cos(a)*r,y=28+Math.sin(a)*r*.64,flap=(Math.floor(phase*7)+n)%2,s=1;
        for(let tail=1;tail<=3;tail++){const old=a-tail*.12;pctx.globalAlpha=.1+(3-tail)*.06;pixelDot(pctx,cx+Math.cos(old)*r,28+Math.sin(old)*r*.64,tail===1?2:1,colors[0]);}pctx.globalAlpha=1;
        pctx.globalAlpha=n===0?1:.8;pixelSprite(pctx,flap?PIXEL_SPRITES.batA:PIXEL_SPRITES.batB,x-8*s,y-4*s,s,[groundColor,colors[0],highlight],'#201630');pctx.globalAlpha=1;
        pixelDot(pctx,x-1,y,1,'#ffd9d3');pixelDot(pctx,x+1,y,1,'#ffd9d3');}
      for(let n=0;n<Math.floor(count/2);n++){const q=seeded(seed,n),a=n*2.399+phase,r=21+q*12;pixelDot(pctx,cx+Math.cos(a)*r,31+Math.sin(a)*r*.65,q>.85?2:1,n%2?highlight:groundColor);}
    }else if(id==='graveyard'){
      const rise=Math.min(1,phase*2);pixelOrbit(pctx,cx,56,38,5,0,groundColor,.8);pixelOrbit(pctx,cx,57,31,3,.3,colors[0],.5);
      for(let n=0;n<8;n++){const x=24+n*10+Math.sin(phase*.6+n)*3,y=45+(n%3)*2;pctx.globalAlpha=.18;pctx.fillStyle=highlight;pctx.fillRect(Math.round(x),y,10+(n%3)*3,2);}pctx.globalAlpha=1;
      for(let n=0;n<3;n++){const x=cx-36+n*29,y=47+(n%2)*4+(1-rise)*13;pixelSprite(pctx,PIXEL_SPRITES.tomb,x,y,1,[groundColor,colors[0],highlight],'#343b55');pctx.fillStyle=highlight;pctx.fillRect(Math.round(x+5),Math.round(y+3),1,4);pctx.fillRect(Math.round(x+3),Math.round(y+4),5,1);}
      for(let band=0;band<4;band++){const y=53+band*2,w=13+Math.floor((Math.sin(phase*2+band)*.5+.5)*12),x=cx-35+((phase*9+band*21)%70);pctx.globalAlpha=.28+band*.08;pctx.fillStyle=band%2?colors[0]:highlight;pctx.fillRect(x,y,w,1);pctx.fillRect(x+3,y-1,Math.max(2,w-7),1);pctx.fillRect(x+7,y+1,Math.max(2,w-10),1);}pctx.globalAlpha=1;
      for(let n=0;n<count;n++){const q=seeded(seed,n),x=cx-34+((n*13+phase*8)%68),y=27+q*24+Math.sin(phase+n)*2;pixelDot(pctx,x,y,q>.87?2:1,n%2?highlight:colors[0]);}
    }else if(id==='lotus-field'||id==='blood-lotus-field'){
      const blood=id==='blood-lotus-field',petals=blood?['#b3244c','#fa6a7c','#5d163b']:['#e960a5','#fff0e8','#45958f'],water=blood?'#9f1d42':'#55b0a2',opening=Math.min(1,phase*1.6);
      for(let ring=0;ring<3;ring++)pixelOrbit(pctx,cx,55,14+ring*10,2+ring*1.1,phase*.2+ring,water,.65);
      for(let n=0;n<12;n++){const x=cx-35+n*6,y=57+(n%3);pctx.globalAlpha=.3;pctx.fillStyle=n%2?water:petals[1];pctx.fillRect(x,y,3+(n%3),1);}pctx.globalAlpha=1;
      for(let flower=0;flower<3;flower++){const x=cx+(flower-1)*25,y=51+(flower%2)*4,reach=2+opening*5;
        pixelOrbit(pctx,x,y+3,10+opening*3,2,phase*.3+flower,water,.55,20);
        for(let n=0;n<7;n++){const a=n*Math.PI*2/7,px=x+Math.cos(a)*reach,py=y+Math.sin(a)*reach*.35;pixelSprite(pctx,PIXEL_SPRITES.lotusPetal,px-4,py-4,1,[petals[0],petals[1],petals[2]],petals[2]);}
        pixelDot(pctx,x,y,2,blood?'#ffc4a5':'#ffe57a');}
      for(let n=0;n<count;n++){const q=seeded(seed,n),x=cx-36+q*72,y=47+seeded(seed+7,n)*11;pixelDot(pctx,x,y,q>.88?2:1,n%2?water:petals[1]);}
      for(let n=0;n<8;n++){const x=cx-34+seeded(seed+5,n)*68,y=18+((n*7+phase*7)%30),drift=Math.sin(phase+n)*3;pctx.globalAlpha=.28;pixelDot(pctx,x+drift-2,y-3,1,petals[1]);pctx.globalAlpha=.65;pixelDot(pctx,x+drift,y,2,petals[n%2]);pixelDot(pctx,x+drift+1,y-1,1,petals[1]);}pctx.globalAlpha=1;
    }else if(id==='secret-shiny'){
      const pulse=Math.floor(phase*5)%2;pixelOrbit(pctx,cx,29,24,13,phase*.35,'#b956df',.5,40);pixelOrbit(pctx,cx,29,17,9,-phase*.5,'#a9fbff',.65,32); sprite('star',cx-7,15,2,pulse?['#ff4ab5','#fff2ff','#4724d5']:['#a9fbff','#fffdf3','#1c48cb']);
      for(let n=0;n<4;n++){const a=phase*.5+n*Math.PI/2;pixelSpark(pctx,cx+Math.cos(a)*30,29+Math.sin(a)*16,1,'#fffdf3',n%2?'#ff4ab5':'#a9fbff',.65);}
      for(let n=0;n<12;n++){const a=n*Math.PI/6+phase*.22,r=18+(n%3)*5;pixelDot(pctx,cx+Math.round(Math.cos(a)*r),32+Math.round(Math.sin(a)*r*.6),n%4===0?2:1,n%2?colors[0]:highlight);}
    }else if(id==='hitodama'){
      for(let n=0;n<4;n++){const x=22+(n*23+Math.floor(phase*8+n*7))%78,y=24+Math.round(Math.sin(phase*1.3+n)*13),flicker=Math.floor(time*6+n)%2;sprite('spirit',x-4,y-5,flicker?1:2,[colors[0],highlight,groundColor]);pixelDot(pctx,x-1,y-1,1,'#08111d');}
      for(let n=0;n<count;n++){const x=24+Math.floor(seeded(seed,n)*70),y=32+Math.floor(seeded(seed+4,n)*24);pixelDot(pctx,x,y,1,n%2?highlight:colors[0]);}
    }else if(id==='ghosts'){
      for(let n=0;n<5;n++){const x=13+n*21+Math.round(Math.sin(phase+n)*4),y=22+Math.round(Math.sin(phase*1.2+n*1.8)*12);sprite('ghost',x,y,2,[n%2?colors[0]:highlight,colors[0],groundColor]);pixelDot(pctx,x+4,y+4,2,'#08111d');pixelDot(pctx,x+9,y+4,2,'#08111d');}
    }else if(id==='the-eye'){
      const blink=Math.floor(time*5)%7===0,shift=Math.round(Math.sin(phase*1.2)*2);sprite('eye',cx-13,14,2,[colors[0],highlight,groundColor]);pctx.fillStyle='#090b17';pctx.fillRect(cx-5,blink?20:18,10,blink?1:5);if(!blink){pctx.fillStyle=groundColor;pctx.fillRect(cx-2+shift,18,4,4);pctx.fillStyle=highlight;pctx.fillRect(cx-1+shift,19,1,2);}
    }else if(id==='pumpkings-delight'){
      sprite('pumpkin',cx-9,14,2,[colors[0],highlight,groundColor]);pctx.fillStyle=groundColor;pctx.fillRect(cx-2,11,3,4);for(let n=0;n<4;n++){const a=phase+n*Math.PI/2,x=cx+Math.round(Math.cos(a)*25),y=25+Math.round(Math.sin(a)*12);sprite(n%2?'candy':'leaf',x-3,y-3,1,[highlight,colors[0],groundColor]);}
    }else if(id==='rising-star'){
      for(let n=0;n<5;n++){const y=58-((Math.floor(phase*9)+n*14)%48),x=cx-22+Math.round(Math.sin(phase+n)*13);sprite('star',x-3,y-3,1+(n===4?1:0),[highlight,colors[0],groundColor]);for(let k=1;k<4;k++)pixelDot(pctx,x,y+k*2,1,colors[(n+k)%3]);}
    }else if(id==='snowflake'){
      pixelOrbit(pctx,cx,55,30,4,phase*.2,'#b9edff',.35,32);
      for(let n=0;n<7;n++){const x=12+(n*17+Math.floor(phase*8+n*5))%98,y=14+((n*11+Math.floor(phase*7))%43),s=n%3===0?2:1;sprite('snow',x-3*s,y-3*s,s,[highlight,colors[0],groundColor]);for(let b=0;b<3;b++){pixelDot(pctx,x-4*s,y+(b-1)*2*s,s,colors[0]);pixelDot(pctx,x+4*s,y+(b-1)*2*s,s,colors[0]);}}
    }else if(id==='present'){
      const hop=Math.abs(Math.sin(phase*2.2))*5,open=Math.floor(time*4)%5===3;sprite('gift',cx-9,18-hop,2,[colors[0],highlight,groundColor]);if(open){for(let n=0;n<8;n++){const a=n*Math.PI/4,r=14+Math.floor((time*11)%8);pixelDot(pctx,cx+Math.round(Math.cos(a)*r),25+Math.round(Math.sin(a)*r),2,n%2?highlight:groundColor);sprite('star',cx+Math.round(Math.cos(a)*r)-2,21+Math.round(Math.sin(a)*r),1,[highlight,colors[0],groundColor]);}}
    }else if(id==='paper-lantern'){
      const lift=Math.floor((phase*13)%30),sway=Math.round(Math.sin(phase)*5);sprite('lantern',cx-12+sway,39-lift,3,[colors[0],highlight,groundColor]);for(let n=0;n<6;n++)pixelDot(pctx,cx+sway+(n%2?3:-3),58-lift+n,1,n%2?highlight:groundColor);
    }else if(id==='pungent-stench'){
      for(let n=0;n<5;n++){const x=24+n*18+Math.round(Math.sin(phase+n)*4),y=42-Math.round((phase*9+n*7)%24);sprite('skull',x-4,y-4,1+(n%2),[colors[0],highlight,groundColor]);for(let k=0;k<3;k++)pixelDot(pctx,x+Math.round(Math.sin(phase+k)*7),y-k*3,1,colors[(k+n)%3]);}
    }else if(id==='witchs-haze'){
      sprite('crown',cx-9,39,3,[colors[0],highlight,groundColor]);for(let n=0;n<8;n++){const y=18+((Math.floor(phase*8)+n*7)%36),x=18+n*12+Math.round(Math.sin(phase+n)*5);sprite('spirit',x-3,y-4,1,[n%2?colors[0]:highlight,groundColor,colors[0]]);}
    }else if(id==='pumpkids-treat'){
      for(let n=0;n<10;n++){const a=phase*1.5+n*Math.PI/5,r=13+(n%3)*7,x=cx+Math.round(Math.cos(a)*r),y=34+Math.round(Math.sin(a)*r*.6);sprite('candy',x-3,y-3,1+(n%4===0?1:0),[n%2?colors[0]:highlight,groundColor,colors[0]]);}
      sprite('pumpkin',cx-8,15,2,[colors[0],highlight,groundColor]);
    }else if(id==='witchs-cat'||id==='pumpcat'||id==='white-kitty'||id==='phantom'||id==='shiny-phantom'){
      const palette=id==='white-kitty'?[highlight,'#fffdf0',groundColor]:id==='shiny-phantom'?['#f5b8ff','#fff5fb','#3a6cda']:id==='pumpcat'?[colors[0],highlight,'#ef7e2f']:colors;
      const jump=Math.round(Math.sin(phase*2)*3);sprite('cat',cx-9,15-jump,2,palette);if(id==='pumpcat'){sprite('pumpkin',cx+14,22,1,[colors[0],highlight,groundColor]);}else if(id==='witchs-cat'){sprite('crown',cx-5,11-jump,1,[groundColor,highlight,colors[0]]);}else if(id==='phantom'||id==='shiny-phantom'){sprite('ghost',cx+9,19-jump,1,palette);}
      pixelDot(pctx,cx-4,21-jump,1,'#11101a');pixelDot(pctx,cx+3,21-jump,1,'#11101a');if(id==='shiny-phantom'){sprite('star',cx+14,15-jump,1,['#7eeaff','#fff7d5','#b843e5']);for(let n=0;n<5;n++)pixelDot(pctx,cx-24+n*12,15+(n%2)*3,1,'#c6f7ff');}
    }else if(id==='spinning-scythe'){
      const frame=Math.floor(phase*5)%4;for(let n=0;n<3;n++){const a=phase*1.4+n*2.1,x=cx+Math.round(Math.cos(a)*19),y=35+Math.round(Math.sin(a)*10);sprite('scythe',x-4,y-4,2,[n===frame?highlight:colors[0],groundColor,colors[0]]);}for(let n=0;n<8;n++){const a=phase+n*Math.PI/4;pixelDot(pctx,cx+Math.round(Math.cos(a)*27),35+Math.round(Math.sin(a)*14),1,highlight);}
    }else if(id==='spiders-web'){
      for(let r=8;r<=29;r+=7){for(let n=0;n<8;n++){const a=n*Math.PI/4;const x=cx+Math.round(Math.cos(a)*r),y=31+Math.round(Math.sin(a)*r*.65);pixelDot(pctx,x,y,2,n%2?colors[0]:highlight);}}for(let n=0;n<8;n++){const a=n*Math.PI/4;pctx.strokeStyle=colors[0];pctx.beginPath();pctx.moveTo(cx,31);pctx.lineTo(cx+Math.round(Math.cos(a)*34),31+Math.round(Math.sin(a)*22));pctx.stroke();}sprite('web',cx-4,28,1,[colors[0],highlight,groundColor]);
    }else if(id==='zombies-grip'){
      pctx.fillStyle=groundColor;pctx.fillRect(18,55,84,3);for(let n=0;n<3;n++){const x=31+n*24,y=41+Math.floor(Math.sin(phase+n)*3);sprite('hand',x,y,3,[colors[0],highlight,'#392d32']);}for(let n=0;n<10;n++)pixelDot(pctx,24+n*8,52+(n%2),1,colors[0]);
    }else if(id==='zodiac'){
      sprite('zodiac',cx-11,12,3,[highlight,colors[0],groundColor]);for(let n=0;n<12;n++){const a=n*Math.PI/6+phase*.2,r=28;pixelDot(pctx,cx+Math.round(Math.cos(a)*r),29+Math.round(Math.sin(a)*r*.55),n%3===0?2:1,n%2?highlight:groundColor);}pctx.fillStyle=highlight;pctx.fillRect(cx-2,9,3,3);
    }else if(id==='eerie-howl'){
      sprite('wolf',cx-10,15,2,[colors[0],highlight,groundColor]);for(let ring=0;ring<3;ring++){const x0=cx+10+ring*6;for(let y=16-ring*2;y<28+ring*2;y+=3){pixelDot(pctx,x0,y,1,ring===1?highlight:colors[0]);}}for(let n=0;n<5;n++)pixelDot(pctx,20+n*17,55,1,groundColor);
    }else if(id==='kings-fall'){
      sprite('crown',cx-7,17,2,[highlight,colors[0],groundColor]);for(let n=0;n<12;n++){const x=15+Math.floor(seeded(seed,n)*90),y=13+((Math.floor(phase*8)+n*13)%44);sprite(n%3?'leaf':'crown',x,y,1,[n%2?colors[0]:highlight,groundColor,colors[0]]);}
    }else if(id==='red-dragon'){
      const drift=Math.round(Math.sin(phase)*6);sprite('dragon',cx-10+drift,14,2,[colors[0],highlight,groundColor]);for(let n=0;n<9;n++){const x=cx+drift-12-n*4+Math.floor((phase*8)%5),y=29+(n%3)*2;pixelDot(pctx,x,y,n%3===0?2:1,n%2?groundColor:highlight);}
    }else if(id==='anniversary-cake'){
      sprite('cake',cx-28,40,2,[colors[0],highlight,groundColor]);for(let n=0;n<3;n++){sprite('candle',cx-26+n*6,31+(n%2),1,[highlight,colors[0],groundColor]);pixelDot(pctx,cx-26+n*6,29,1,groundColor);}for(let n=0;n<8;n++){const x=18+((n*13+Math.floor(phase*8))%84),y=15+Math.floor(seeded(seed,n)*20);pixelDot(pctx,x,y,1,n%2?highlight:colors[0]);}
    }else if(id==='kanto-friends'||id==='shiny-kanto-friends'){
      const pals=id==='shiny-kanto-friends'?['#fff7c7','#b1f5ff','#ffc2ea']:colors;for(let n=0;n<3;n++){const x=cx-31+n*24,y=34+Math.round(Math.sin(phase*1.5+n)*3);sprite(n===0?'cat':n===1?'dragon':'ghost',x-7,y,2,[pals[n%3],highlight,groundColor]);}for(let n=0;n<6;n++)pixelDot(pctx,cx-29+n*11,52-(n%2)*4,1,pals[n%3]);
      if(id==='shiny-kanto-friends')for(let n=0;n<4;n++)pixelSpark(pctx,cx-30+n*20,22+(n%2)*5,1,'#fffdf0',pals[n%3],.8);
    }else if(id==='menacing-spirit'||id==='shiny-menacing-spirit'){
      const pal=id==='shiny-menacing-spirit'?['#fb66ff','#fff5d4','#20cbe4']:colors;sprite('spirit',cx-11,11,3,pal);sprite('skull',cx-7,17,2,pal);for(let n=0;n<6;n++){const y=24+n*5,x=21+Math.round(Math.sin(phase+n)*4);pixelDot(pctx,x,y,2,n%2?pal[0]:pal[1]);pixelDot(pctx,99-x,y,2,n%2?pal[0]:pal[1]);}
      if(id==='shiny-menacing-spirit'){pixelOrbit(pctx,cx,46,31,8,phase*.8,pal[2],.8);for(let n=0;n<3;n++)pixelSpark(pctx,cx-26+n*26,18+(n%2)*6,1,pal[1],pal[0],.9);}
    }else if(id==='xmas-decorations'){
      for(let n=0;n<7;n++){const x=15+n*15,y=23+Math.round(Math.sin(phase*.7+n*.8)*4);pixelDot(pctx,x,y,3,n%2?highlight:colors[0]);pctx.fillStyle=groundColor;pctx.fillRect(x+1,y-3,1,3);sprite(n%3===0?'star':'snow',x-3,y+6,1,[highlight,colors[0],groundColor]);}for(let n=0;n<4;n++)pixelDot(pctx,26+n*23,48,2,groundColor);
    }else if(id==='spirit-of-spring'){
      sprite('spirit',cx-10,25,3,[highlight,colors[0],groundColor]);for(let n=0;n<12;n++){const a=phase*.5+n*2.4,r=12+(n%4)*5,x=cx+Math.round(Math.cos(a)*r),y=37+Math.round(Math.sin(a)*r*.55);sprite(n%2?'leaf':'spring',x-3,y-3,1,[n%2?colors[0]:highlight,groundColor,colors[0]]);}
    }else if(id==='dark-crystal'||id==='shiny-dark-crystal'){
      const pal=id==='shiny-dark-crystal'?['#ff7add','#d7ffff','#421bd4']:colors;for(let n=0;n<5;n++){const x=35+n*7,y=31+(n%2)*5,h=12+(n%3)*5;sprite('crystal',x-4,y-h/2,1+(n%2),[pal[n%3],pal[1],groundColor]);pctx.fillStyle=pal[1];pctx.fillRect(x,y-h/2+2,1,Math.max(2,h/3));}for(let n=0;n<10;n++){const x=24+Math.floor(seeded(seed,n)*72),y=15+Math.floor((phase*8+n*7)%38);pixelDot(pctx,x,y,1,n%2?pal[0]:pal[1]);}if(id==='shiny-dark-crystal'){for(let n=0;n<8;n++){const a=n*Math.PI/4,x=cx+Math.round(Math.cos(a)*31),y=32+Math.round(Math.sin(a)*16);sprite('star',x-2,y-2,1,[pal[0],pal[1],pal[2]]);}}
    }
    pctx.restore();const thumbnail=style==='thumbnail',sourceX=thumbnail?18:0,sourceY=thumbnail?9:0,sourceWidth=thumbnail?84:120,sourceHeight=thumbnail?50:68;
    const integerScale=Math.max(1,Math.floor(Math.min(width/sourceWidth,height/sourceHeight))),drawWidth=Math.max(1,Math.round(sourceWidth*integerScale*size)),drawHeight=Math.max(1,Math.round(sourceHeight*integerScale*size));ctx.save();ctx.imageSmoothingEnabled=false;ctx.globalCompositeOperation='source-over';ctx.drawImage(pixelCanvas,sourceX,sourceY,sourceWidth,sourceHeight,Math.floor((width-drawWidth)/2),Math.floor((height-drawHeight)/2),drawWidth,drawHeight);ctx.restore();
  }
  function assetHref(relative){const base=String(root.__KANTO_ASSET_ROOT__||'').trim();return base?base+relative:scriptUrl?new URL(relative,scriptUrl).href:relative;}
  function trioImage(id){if(trioAssets.has(id))return trioAssets.get(id);if(typeof root.Image!=='function')return null;const img=new root.Image();trioAssets.set(id,img);img.onload=()=>{img.ready=true;};img.onerror=()=>{trioAssets.set(id,null);};try{img.src=assetHref(`assets/pokemon/${id}.png`);}catch{trioAssets.set(id,null);return null;}return img;}
  function formFor(effect={}){const raw=String(effect.form||effect.geometry||'orbit').toLowerCase();return FORMS.includes(raw)?raw:(FORM_ALIASES[raw]||({spiral:'updraft',fan:'fountain-fan',burst:'radial-shards',wave:'wavefront'}[effect.trajectory?.type||effect.emitter]||'double-orbit'));}
  function scaffold(ctx,form,cx,ground,radius,phase,colors,style,burst){
    const premium=burst>0,alpha=premium?.56:.3;ctx.globalAlpha=alpha;ctx.strokeStyle=colors[0];ctx.lineWidth=1.15;ctx.shadowColor=colors[0];ctx.shadowBlur=5;ctx.beginPath();
    if(form==='pulse-rings'||form==='wavefront'){const rx=radius*(.28+burst*.62),ry=Math.max(2,radius*(form==='wavefront'?.2:.1));ctx.ellipse(cx,ground,rx,ry,0,phase*.25,phase*.25+Math.PI*1.68);ctx.stroke();ctx.beginPath();ctx.ellipse(cx,ground,rx*.72,ry*.65,0,-phase*.18,-phase*.18+Math.PI*1.35);ctx.stroke();}
    else if(form==='hex-shield'){for(let layer=0;layer<2;layer++){const r=radius*(.42+layer*.17);for(let k=0;k<6;k++){const a=phase*.12+k*Math.PI/3,x=cx+Math.cos(a)*r,y=ground-radius*.28+Math.sin(a)*r*.42;k===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.closePath();ctx.stroke();}}
    else if(form==='ground-glyph'){for(let k=0;k<8;k++){const a=k*Math.PI/4+phase*.08,x=cx+Math.cos(a)*radius*.55,y=ground+Math.sin(a)*radius*.12;ctx.moveTo(cx+Math.cos(a)*radius*.29,ground+Math.sin(a)*radius*.06);ctx.lineTo(x,y);ctx.arc(x,y,1.4,0,Math.PI*2);}ctx.stroke();}
    else if(form==='constellation'){const pts=[];for(let k=0;k<6;k++)pts.push([cx+Math.cos(phase*.12+k*1.04)*radius*(.36+(k%2)*.18),ground-radius*(.12+(k%3)*.09)]);pts.forEach((p,i)=>{ctx.moveTo(...p);ctx.arc(p[0],p[1],1.5,0,Math.PI*2);if(i>0){ctx.moveTo(...pts[i-1]);ctx.lineTo(...p);}});ctx.stroke();}
    else if(form==='wing-arcs'){for(const side of [-1,1]){ctx.moveTo(cx,ground-radius*.19);ctx.quadraticCurveTo(cx+side*radius*.82,ground-radius*.66,cx+side*radius*.58,ground-radius*.08);ctx.stroke();}}
    else if(form==='light-column'){ctx.moveTo(cx-radius*.12,ground);ctx.lineTo(cx-radius*.07,ground-radius*.72);ctx.lineTo(cx,ground-radius*.86);ctx.lineTo(cx+radius*.08,ground-radius*.72);ctx.lineTo(cx+radius*.12,ground);ctx.stroke();}
    else if(form==='ribbon-loop'){for(let n=0;n<2;n++){ctx.ellipse(cx,ground-radius*.23,radius*(.44+n*.13),radius*.21,phase*.2+n*.8,Math.PI*.08,Math.PI*1.92);ctx.stroke();}}
    else if(form==='accretion'){for(let k=0;k<3;k++){const a=phase*.75+k*2.1,r=radius*(.18+k*.14);ctx.moveTo(cx+Math.cos(a)*r,ground-radius*.22+Math.sin(a)*r*.4);ctx.quadraticCurveTo(cx+Math.cos(a+1.2)*r*.3,ground-radius*.32,cx,ground-radius*.22);ctx.stroke();}}
    else if(form==='fountain-fan'){for(let k=-3;k<=3;k++){ctx.moveTo(cx,ground);ctx.quadraticCurveTo(cx+k*radius*.12,ground-radius*.3,cx+k*radius*.23,ground-radius*(.42+Math.abs(k)*.035));}ctx.stroke();}
    else if(form==='double-orbit'||form==='petal-orbit'){for(let k=0;k<2;k++){ctx.ellipse(cx,ground-radius*.23,radius*(.48+k*.15),radius*(.12+k*.045),k?-.35:.35,0,Math.PI*2);ctx.stroke();}}
    else if(form==='afterimage'){for(let k=0;k<3;k++){ctx.ellipse(cx+(k-1)*radius*.12,ground-radius*.18,radius*(.34+k*.07),radius*.14,0,Math.PI*.08,Math.PI*.92);ctx.stroke();}}
    else if(form==='graveyard'){ctx.moveTo(cx-radius*.7,ground);ctx.quadraticCurveTo(cx,ground-radius*.18,cx+radius*.7,ground);ctx.stroke();for(let k=-1;k<=1;k++){const x=cx+k*radius*.35,y=ground-radius*.08;ctx.beginPath();ctx.moveTo(x-radius*.1,y);ctx.lineTo(x-radius*.1,y-radius*.18);ctx.quadraticCurveTo(x-radius*.1,y-radius*.26,x,y-radius*.26);ctx.quadraticCurveTo(x+radius*.1,y-radius*.26,x+radius*.1,y-radius*.18);ctx.lineTo(x+radius*.1,y);ctx.stroke();}}
    else if(form==='lotus-field'){for(let k=0;k<5;k++){const x=cx+(k-2)*radius*.27,y=ground-radius*(.01+(k%2)*.02);ctx.beginPath();ctx.ellipse(x,y,radius*.14,radius*.045,k%2?.22:-.22,0,Math.PI*2);ctx.stroke();}for(let k=0;k<6;k++){const a=phase*.12+k*Math.PI/3;ctx.beginPath();ctx.ellipse(cx+Math.cos(a)*radius*.13,ground-radius*.13+Math.sin(a)*radius*.07,radius*.13,radius*.055,a,0,Math.PI*2);ctx.stroke();}}
    ctx.globalAlpha=1;
  }
  function drawIcon(ctx,form,cx,ground,radius,time,colors,style,charge,burst){
    if(!['black-hole','portal-cat','bat-swarm','spectral-eye','lantern-rise','scythe-orbit','dragon-coil','crystal-crown','kanto-trio','fireworks'].includes(form))return;
    const r=radius*.55,cy=ground-radius*.28,phase=time*3.8;ctx.save();ctx.translate(cx,cy);ctx.globalAlpha=.88;ctx.lineWidth=1.8;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=colors[0];ctx.fillStyle=colors[0];ctx.shadowColor=colors[0];ctx.shadowBlur=7;
    if(form==='black-hole'){
      const spin=phase*.48;for(let ring=0;ring<3;ring++){ctx.globalAlpha=.52-ring*.1;ctx.beginPath();ctx.ellipse(0,0,r*(.42+ring*.11),r*(.13+ring*.035),spin+ring*.7,0,Math.PI*1.75);ctx.stroke();}ctx.globalAlpha=.92;ctx.globalCompositeOperation='source-over';const g=ctx.createRadialGradient?.(0,0,1,0,0,r*.24);if(g?.addColorStop){g.addColorStop(0,'#03050c');g.addColorStop(.72,'#090b18');g.addColorStop(1,colors[1]||colors[0]);ctx.fillStyle=g;}ctx.beginPath();ctx.arc(0,0,r*.24,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.42;for(let k=0;k<5;k++){const a=spin+k*1.256,rr=r*(.29+(k%2)*.1);ctx.beginPath();ctx.arc(Math.cos(a)*rr,Math.sin(a)*rr*.35,1.7,0,Math.PI*2);ctx.fill();}
    }else if(form==='portal-cat'){
      const open=clamp((time%1.1-.08)/.52,0,1),scale=.35+open*.65;ctx.globalAlpha=.42;ctx.beginPath();ctx.ellipse(0,r*.1,r*.42,r*.28,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=.9;ctx.save();ctx.translate(0,r*.03+(1-open)*r*.12);ctx.scale(scale,scale);ctx.fillStyle=colors[1]||'#fff4d7';ctx.beginPath();ctx.ellipse(0,-r*.08,r*.2,r*.24,0,0,Math.PI*2);ctx.fill();ctx.moveTo(-r*.15,-r*.22);ctx.lineTo(-r*.2,-r*.43);ctx.lineTo(-r*.04,-r*.32);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(r*.15,-r*.22);ctx.lineTo(r*.2,-r*.43);ctx.lineTo(r*.04,-r*.32);ctx.closePath();ctx.fill();ctx.beginPath();ctx.ellipse(0,r*.16,r*.29,r*.15,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(r*.23,r*.15);ctx.bezierCurveTo(r*.49,r*.05,r*.5,r*.36,r*.3,r*.34);ctx.stroke();ctx.restore();ctx.globalAlpha=.75;ctx.beginPath();ctx.ellipse(0,r*.1,r*.43,r*.29,0,phase*.12,phase*.12+Math.PI*1.55);ctx.stroke();
    }else if(form==='bat-swarm'){
      for(let n=0;n<4;n++){const a=phase*.45+n*1.57,x=Math.cos(a)*r*.34,y=Math.sin(a)*r*.2,wing=Math.sin(phase*1.8+n)*r*.12;ctx.save();ctx.translate(x,y);ctx.scale(.48,.48);ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(-r*.1,-r*.17,-r*.35,-r*.14+wing);ctx.lineTo(-r*.22,-r*.01);ctx.lineTo(-r*.35,r*.09+wing);ctx.quadraticCurveTo(-r*.1,r*.08,0,r*.2);ctx.quadraticCurveTo(r*.1,r*.08,r*.35,r*.09+wing);ctx.lineTo(r*.22,-r*.01);ctx.lineTo(r*.35,-r*.14+wing);ctx.quadraticCurveTo(r*.1,-r*.17,0,0);ctx.fill();ctx.restore();}
    }else if(form==='spectral-eye'){
      const blink=Math.pow(Math.max(0,Math.sin(time*2.4)),22),track=Math.sin(phase*.38)*r*.12;ctx.globalAlpha=.8;ctx.beginPath();ctx.moveTo(-r*.48,0);ctx.quadraticCurveTo(0,-r*(.34*(1-blink)+.035),r*.48,0);ctx.quadraticCurveTo(0,r*(.34*(1-blink)+.035),-r*.48,0);ctx.stroke();ctx.fillStyle=colors[1]||'#fff';ctx.beginPath();ctx.ellipse(track,0,r*.12,Math.max(1,r*.12*(1-blink)),0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#111421';ctx.beginPath();ctx.arc(track,0,r*.052,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.65;for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(side*r*.36,0);ctx.lineTo(side*r*.55,-r*.12);ctx.stroke();}
    }else if(form==='lantern-rise'){
      const lift=Math.sin(time*1.6)*r*.09;ctx.translate(0,-lift);ctx.globalAlpha=.78;ctx.beginPath();ctx.moveTo(-r*.19,-r*.24);ctx.lineTo(r*.19,-r*.24);ctx.lineTo(r*.16,r*.15);ctx.lineTo(0,r*.24);ctx.lineTo(-r*.16,r*.15);ctx.closePath();ctx.fill();ctx.globalAlpha=.95;ctx.strokeStyle=colors[1]||'#fff2ae';for(const x of [-.1,0,.1]){ctx.beginPath();ctx.moveTo(x*r,-r*.21);ctx.lineTo(x*r,r*.16);ctx.stroke();}ctx.beginPath();ctx.moveTo(-r*.11,-r*.3);ctx.quadraticCurveTo(0,-r*.39,r*.11,-r*.3);ctx.stroke();for(let t=-1;t<=1;t++){ctx.beginPath();ctx.moveTo(t*r*.07,r*.2);ctx.quadraticCurveTo(t*r*.11,r*.35,t*r*.08,r*.44);ctx.stroke();}
    }else if(form==='scythe-orbit'){
      ctx.rotate(phase*.5);ctx.globalAlpha=.92;ctx.beginPath();ctx.moveTo(-r*.28,r*.33);ctx.lineTo(r*.23,-r*.31);ctx.strokeStyle=colors[1]||'#fff';ctx.lineWidth=3;ctx.stroke();ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(r*.1,-r*.12);ctx.quadraticCurveTo(r*.5,-r*.55,r*.4,-r*.05);ctx.quadraticCurveTo(r*.3,r*.12,r*.1,-r*.12);ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(0,0,r*.47,phase*.2,phase*.2+Math.PI*1.15);ctx.stroke();
    }else if(form==='dragon-coil'){
      const sway=Math.sin(phase*.35)*r*.08;ctx.globalAlpha=.82;ctx.lineWidth=r*.075;ctx.beginPath();ctx.moveTo(-r*.46,r*.13);ctx.bezierCurveTo(-r*.5,-r*.38,r*.2,-r*.39,r*.38,-r*.06);ctx.bezierCurveTo(r*.54,r*.25,-r*.12,r*.42,-r*.3,r*.13);ctx.bezierCurveTo(-r*.42,-r*.08,r*.19,-r*.2,r*.39,-r*.3+sway);ctx.stroke();ctx.lineWidth=1.7;ctx.fillStyle=colors[1]||'#ffcb8c';ctx.beginPath();ctx.ellipse(r*.4,-r*.3+sway,r*.11,r*.08,-.3,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(r*.38,-r*.36+sway);ctx.lineTo(r*.35,-r*.49+sway);ctx.moveTo(r*.45,-r*.36+sway);ctx.lineTo(r*.51,-r*.47+sway);ctx.stroke();
    }else if(form==='crystal-crown'){
      const pts=[[-.38,.18],[-.3,-.14],[-.2,.05],[-.08,-.46],[.02,.04],[.18,-.33],[.22,.08],[.37,-.2],[.42,.18]];ctx.globalAlpha=.88;for(let n=0;n<pts.length-1;n++){const [x,y]=pts[n],[x2,y2]=pts[n+1];ctx.beginPath();ctx.moveTo(x*r,y*r);ctx.lineTo(x2*r,y2*r);ctx.stroke();}ctx.beginPath();ctx.moveTo(-r*.42,r*.19);ctx.lineTo(r*.43,r*.19);ctx.stroke();ctx.globalAlpha=.9;for(let n=0;n<4;n++){const x=(-.3+n*.2)*r,y=(n%2?-.32:-.44)*r;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+r*.11,y-r*.09);ctx.lineTo(x+r*.2,y);ctx.lineTo(x+r*.11,y+r*.1);ctx.closePath();ctx.fill();}ctx.globalAlpha=.95;for(let n=0;n<3;n++){const x=(n-1)*r*.26,y=-r*(.18+(n%2)*.14),j=Math.sin(phase*2+n)*r*.06;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+j,y-r*.12);ctx.lineTo(x+r*.09,y-r*.17);ctx.strokeStyle=colors[(n+1)%colors.length];ctx.stroke();ctx.strokeStyle=colors[0];}
    }else if(form==='kanto-trio'){
      const ids=[1,4,7];ids.forEach((id,index)=>{const img=trioImage(id);const x=(index-1)*r*.46,y=Math.sin(time*2+index)*r*.035;if(img?.complete&&img.naturalWidth){ctx.globalAlpha=.92;try{ctx.drawImage(img,x-r*.2,y-r*.35,r*.4,r*.5);}catch{drawMiniMon(ctx,index,x,y,r,colors);}}else drawMiniMon(ctx,index,x,y,r,colors);});
    }else if(form==='fireworks'){
      const t=time%1.25;if(t<.34){const riseY=r*(.2-t*.85);ctx.globalAlpha=.9;ctx.beginPath();ctx.moveTo(0,r*.32);ctx.lineTo(0,riseY);ctx.stroke();ctx.beginPath();ctx.arc(0,riseY,2.2,0,Math.PI*2);ctx.fill();}else{const age=clamp((t-.34)/.78,0,1),rr=r*(.08+age*.48);ctx.globalAlpha=1-age*.6;for(let n=0;n<12;n++){const a=n*Math.PI/6+phase*.15;ctx.beginPath();ctx.moveTo(Math.cos(a)*rr*.25,Math.sin(a)*rr*.25);ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);ctx.stroke();ctx.beginPath();ctx.arc(Math.cos(a)*rr,Math.sin(a)*rr,1.7,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=.8*(1-age);ctx.beginPath();ctx.arc(0,0,rr*.35,0,Math.PI*2);ctx.stroke();}
    }else if(form==='shiny-burst'){
      const pulse=.76+.24*Math.sin(time*5.5),outer=r*(.48+.18*pulse);ctx.globalAlpha=.9;ctx.fillStyle=colors[1]||'#fff';ctx.beginPath();for(let k=0;k<8;k++){const a=-Math.PI/2+k*Math.PI/4,rr=k%2?outer*.3:outer;ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();ctx.fill();ctx.globalAlpha=.72;for(let k=0;k<8;k++){const a=k*Math.PI/4+phase*.18;ctx.beginPath();ctx.moveTo(Math.cos(a)*outer*.56,Math.sin(a)*outer*.56);ctx.lineTo(Math.cos(a)*outer*.93,Math.sin(a)*outer*.93);ctx.stroke();}ctx.globalAlpha=.96;ctx.beginPath();ctx.arc(0,0,r*.13,0,Math.PI*2);ctx.fill();
    }else if(form==='graveyard'){
      const mist=Math.sin(time*1.7)*r*.05;ctx.globalAlpha=.55;ctx.beginPath();ctx.moveTo(-r*.58,r*.12);ctx.quadraticCurveTo(-r*.28,-r*.06,0,r*.1);ctx.quadraticCurveTo(r*.28,-r*.02,r*.6,r*.12);ctx.stroke();for(let n=0;n<3;n++){const x=(n-1)*r*.38,y=r*(.03+(n%2)*.04);ctx.globalAlpha=.62;ctx.fillStyle=colors[2]||colors[0];ctx.beginPath();ctx.moveTo(x-r*.11,y);ctx.lineTo(x-r*.11,y-r*.24);ctx.quadraticCurveTo(x-r*.11,y-r*.34,x,y-r*.34);ctx.quadraticCurveTo(x+r*.11,y-r*.34,x+r*.11,y-r*.24);ctx.lineTo(x+r*.11,y);ctx.closePath();ctx.fill();ctx.globalAlpha=.92;ctx.strokeStyle=colors[1]||'#fff';ctx.beginPath();ctx.moveTo(x,y-r*.27);ctx.lineTo(x,y-r*.13);ctx.moveTo(x-r*.045,y-r*.22);ctx.lineTo(x+r*.045,y-r*.22);ctx.stroke();}for(let n=0;n<3;n++){const x=Math.sin(time*1.1+n*2.1)*r*.44,y=-r*(.13+n%2*.11)+mist;ctx.globalAlpha=.7;ctx.fillStyle=colors[n%colors.length];ctx.beginPath();ctx.arc(x,y,r*.035,0,Math.PI*2);ctx.fill();}
    }else if(form==='lotus-field'){
      for(let n=0;n<4;n++){const x=(n-1.5)*r*.28,y=r*.1+(n%2)*r*.06;ctx.globalAlpha=.8;ctx.fillStyle=colors[2]||colors[0];ctx.beginPath();ctx.ellipse(x,y,r*.18,r*.07,n%2?.3:-.3,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.5;ctx.strokeStyle=colors[1]||'#fff';ctx.beginPath();ctx.moveTo(x-r*.12,y);ctx.quadraticCurveTo(x,y-r*.08,x+r*.12,y);ctx.stroke();}const bloom=1+.08*Math.sin(time*2.2);ctx.save();ctx.scale(bloom,bloom);for(let n=0;n<8;n++){const a=n*Math.PI/4+phase*.07;ctx.globalAlpha=.84;ctx.fillStyle=colors[n%2];ctx.beginPath();ctx.ellipse(Math.cos(a)*r*.13,Math.sin(a)*r*.1,r*.11,r*.045,a,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=.98;ctx.fillStyle=colors[1]||'#fff';ctx.beginPath();ctx.arc(0,-r*.02,r*.045,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    ctx.restore();
  }
  function drawMiniMon(ctx,index,x,y,r,colors){ctx.save();ctx.translate(x,y);ctx.globalAlpha=.86;ctx.fillStyle=colors[index%colors.length];ctx.strokeStyle=colors[1]||'#fff';const k=r*.2;ctx.beginPath();if(index===0){ctx.ellipse(0,k*.2,k*.9,k*.62,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(-k*.45,-k*.2);ctx.lineTo(-k*.55,-k*1.15);ctx.lineTo(-k*.12,-k*.55);ctx.closePath();ctx.fill();ctx.moveTo(k*.25,-k*.2);ctx.lineTo(k*.7,-k*.85);ctx.lineTo(k*.62,-k*.08);ctx.closePath();ctx.fill();ctx.stroke();}else if(index===1){ctx.ellipse(0,k*.18,k*.48,k*.72,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(-k*.25,-k*.4);ctx.lineTo(-k*.16,-k*1.3);ctx.lineTo(k*.02,-k*.45);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(k*.12,-k*.52);ctx.lineTo(k*.55,-k*1.08);ctx.lineTo(k*.35,-k*.15);ctx.closePath();ctx.fill();ctx.stroke();}else{ctx.ellipse(0,k*.1,k*.68,k*.55,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(0,k*.1,k*.38,Math.PI,Math.PI*2);ctx.stroke();ctx.moveTo(-k*.5,-k*.18);ctx.lineTo(-k*.68,-k*.86);ctx.moveTo(k*.5,-k*.18);ctx.lineTo(k*.68,-k*.86);ctx.stroke();}ctx.restore();}
  function positionFor(form,i,q,phase,cx,ground,radius,rise,style,direction){
    const t=(phase*.38+q+i*.071)%1,a=phase*.9+i*2.399,side=(i%2?1:-1),u=(q-.5)*2;let x=cx+u*radius*.55,y=ground-rise*(.12+t*.55),angle=0;
    switch(form){
      case'double-orbit':{const r=radius*(i%2?.55:.34);x=cx+Math.cos(a*(i%2?-.78:1))*r;y=ground-rise*.2+Math.sin(a)*radius*.12;angle=a;break;}
      case'comet-tail':x=cx+side*radius*(.22+t*.55);y=ground-rise*(.55-t*.46);angle=-side*.65;break;
      case'updraft':{const u2=(t-.5)*2,a2=phase*1.35+i*.72,r=radius*(.08+t*.43);x=cx+Math.cos(a2)*r;y=ground-rise*(.05+t*.74);angle=a2;break;}
      case'fountain-fan':{const fan=(i%7-3)/3;x=cx+fan*radius*(.18+t*.43);y=ground-rise*(.08+t*.7);angle=fan*.6;break;}
      case'pulse-rings':{const a2=i*2.4+phase*.2,r=radius*(.22+t*.55);x=cx+Math.cos(a2)*r;y=ground-rise*.2+Math.sin(a2)*r*.22;angle=a2;break;}
      case'petal-orbit':{const a2=a+(i%3)*2.094,r=radius*(.32+.15*Math.sin(a2*2));x=cx+Math.cos(a2)*r;y=ground-rise*.23+Math.sin(a2)*radius*.22;angle=a2+Math.PI/2;break;}
      case'constellation':{const k=i%6,aa=phase*.14+k*1.04;x=cx+Math.cos(aa)*radius*(.36+(k%2)*.18);y=ground-rise*(.18+(k%3)*.1);angle=aa;break;}
      case'accretion':{const r=radius*(.62-t*.52),aa=a*(1.2+t);x=cx+Math.cos(aa)*r;y=ground-rise*.2+Math.sin(aa)*r*.24;angle=aa;break;}
      case'wing-arcs':{const f=(i%2?1:-1),u2=(i%12)/11;x=cx+f*radius*(.05+u2*.65);y=ground-rise*(.18+Math.sin(u2*Math.PI)*.34)+Math.sin(phase+u2*3)*radius*.035;angle=f*(u2-.4);break;}
      case'rainfall':case'snowfall':case'ember-fall':x=cx+u*radius*.72+Math.sin(phase*.5+i)*radius*.04;y=ground-rise*(.12+t*.65)+(form==='snowfall'?Math.sin(phase+i)*radius*.04:0);angle=form==='rainfall'?.18:form==='ember-fall'?-.22:phase*.4+i*.2;break;
      case'radial-shards':{const aa=direction+(i%12)*Math.PI/6,r=radius*(.12+t*.64);x=cx+Math.cos(aa)*r;y=ground-rise*.23+Math.sin(aa)*r*.48;angle=aa;break;}
      case'wavefront':{const aa=i*2.4,r=radius*(.24+t*.45);x=cx+Math.cos(aa)*r;y=ground-rise*.2+Math.sin(phase*1.15-r*.03+i*.32)*radius*.06+Math.sin(aa)*r*.16;angle=aa;break;}
      case'ribbon-loop':{const aa=a*.8,r=radius*(.38+.11*Math.sin(aa*2));x=cx+Math.cos(aa)*r;y=ground-rise*.23+Math.sin(aa*2)*radius*.16;angle=aa+Math.PI/2;break;}
      case'light-column':x=cx+Math.sin(i*2.1+phase)*radius*.1;y=ground-rise*(.06+t*.78);angle=0;break;
      case'hex-shield':{const aa=(i%6)*Math.PI/3+phase*.12,r=radius*(.46+(i%2)*.11);x=cx+Math.cos(aa)*r;y=ground-rise*.28+Math.sin(aa)*r*.42;angle=aa;break;}
      case'ground-glyph':{const aa=i*Math.PI/4+phase*.08,r=radius*(i%2?.46:.29);x=cx+Math.cos(aa)*r;y=ground+Math.sin(aa)*radius*.09;angle=aa;break;}
      case'sand-drift':x=cx+u*radius*.58+Math.sin(phase*.4+i)*radius*.04;y=ground-rise*(.04+t*.28);angle=u*.4;break;
      case'black-hole':{const rr=radius*(.55-t*.45),aa=a*1.3;x=cx+Math.cos(aa)*rr;y=ground-rise*.22+Math.sin(aa)*rr*.28;angle=aa;break;}
      case'portal-cat':{const gate=clamp((phase*.16+q-.18)/.36,0,1);x=cx+(q-.5)*radius*.55;y=ground-rise*(.13+gate*.24);angle=(q-.5)*.3;break;}
      case'bat-swarm':{const aa=phase*.4+i*1.7,r=radius*(.22+(i%3)*.12);x=cx+Math.cos(aa)*r;y=ground-rise*.25+Math.sin(aa)*radius*.16;angle=Math.sin(phase*1.8+i)*.5;break;}
      case'spectral-eye':x=cx+u*radius*.33;y=ground-rise*.27+Math.sin(phase*.5+i*.5)*radius*.035;angle=0;break;
      case'lantern-rise':x=cx+Math.sin(phase*.35+i*.73)*radius*.23;y=ground-rise*(.1+t*.55);angle=Math.sin(phase*.4+i)*.08;break;
      case'scythe-orbit':{const aa=a*.8,r=radius*.45;x=cx+Math.cos(aa)*r;y=ground-rise*.26+Math.sin(aa)*radius*.18;angle=aa+Math.PI*.4;break;}
      case'dragon-coil':{const aa=a*.7;x=cx+Math.sin(aa)*radius*.43;y=ground-rise*.23+Math.sin(aa*2+phase*.25)*radius*.11;angle=aa;break;}
      case'crystal-crown':{const k=i%7;x=cx+(k-3)*radius*.14;y=ground-rise*(.18+((k+1)%3)*.1);angle=k*.15;break;}
      case'kanto-trio':x=cx+((i%3)-1)*radius*.36;y=ground-rise*.25+Math.sin(phase+i)*radius*.025;angle=0;break;
      case'fireworks':{const age=clamp((phase*.22+q*.18-.1)/.3,0,1),aa=(i%12)*Math.PI/6,r=radius*(.08+age*.48);x=cx+Math.cos(aa)*r;y=ground-rise*.23+Math.sin(aa)*r*.48;angle=aa;break;}
      case'shiny-burst':{const aa=i*Math.PI/4+phase*.13,r=radius*(.2+q*.46);x=cx+Math.cos(aa)*r;y=ground-rise*.28+Math.sin(aa)*r*.36;angle=aa;break;}
      case'graveyard':{const side=i%2?1:-1;x=cx+side*radius*(.2+q*.45);y=ground-rise*(.12+q*.55)+Math.sin(phase*.7+i)*radius*.04;angle=side*.15;break;}
      case'lotus-field':{const aa=a+(i%6)*Math.PI/3,r=radius*(.16+(i%3)*.23);x=cx+Math.cos(aa)*r;y=ground-rise*.12+Math.sin(aa)*radius*.1;angle=aa;break;}
      default:x=cx+Math.cos(a)*radius*(.34+q*.25);y=ground-rise*(.15+t*.48);angle=a;
    }
    if(style==='move'){const dx=Math.cos(direction),dy=Math.sin(direction);x+=dx*radius*.12;y+=dy*radius*.12;angle+=direction;}
    return [x,y,angle,t];
  }
  function draw(ctx,effect,time,width,height,loop=false,style='preview'){
    const theme=themeFor(effect),form=formFor(effect),colors=palettes(effect),seed=Number(effect.seed)||1,phase=time*clamp(effect.speed||1,.7,1.3);
    if(PIXEL_FORMS.has(effect.particleId)||PIXEL_FORMS.has(LEGACY_PIXEL_IDS[form])){drawPixelScene(ctx,effect,time,width,height,style);return;}
    const cx=width*.5,ground=height*.84,radius=Math.min(width*.35,height*.46)*clamp(effect.scale||1,.72,2.1),premium=effect.prestige===true||effect.rarity==='传说',premiumCue=premium&&(style==='entry'||style==='outcome');
    const base=style==='outcome'?20:style==='move'?17:style==='entry'?13:style==='aura'?8:10,count=clamp(premiumCue?Math.max(18,Math.round(Math.min(MAX_PARTICLES,(Number(effect.particleCount)||24)*.85))):Math.round(base*Math.min(1.25,(Number(effect.particleCount)||24)/28)),4,MAX_PARTICLES),rise=Math.min(height*.34,radius*1.3);
    const period=style==='entry'?.92:1.12,beat=clamp(time/period,0,1),charge=premiumCue&&beat<.24,burst=premiumCue?clamp((beat-.24)/.62,0,1):0,eased=1-Math.pow(1-burst,3),direction=[-Math.PI/2,0,Math.PI/2,Math.PI][Math.abs(Number(effect.variant)||0)%4];
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.globalCompositeOperation='lighter';
    const rings=form==='pulse-rings'||form==='wavefront'?2:form==='double-orbit'||form==='petal-orbit'||form==='ribbon-loop'?0:1;
    for(let ring=0;ring<rings;ring++){const k=radius*(.36+ring*.2)*(premiumCue&&!charge?1+eased*.2:1);ctx.globalAlpha=premiumCue?.32:.22;ctx.strokeStyle=colors[ring%colors.length];ctx.lineWidth=1.2;ctx.shadowColor=colors[0];ctx.shadowBlur=4;ctx.beginPath();ctx.ellipse(cx,ground,k,k*(form==='wavefront'?.2:.11),0,phase*.2,phase*.2+Math.PI*(ring?1.25:1.75));ctx.stroke();}
    scaffold(ctx,form,cx,ground,radius,phase,colors,style,burst);drawIcon(ctx,form,cx,ground,radius,time,colors,style,charge,burst);
    if(premiumCue&&charge){ctx.globalAlpha=.7;ctx.strokeStyle=colors[1]||colors[0];ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(cx,ground-rise*.18,radius*.12,phase*3,phase*3+Math.PI*1.7);ctx.stroke();}
    for(let i=0;i<count;i++){
      const q=seeded(seed,i),[x,y,angle,cycle]=positionFor(form,i,q,phase,cx,ground,radius,rise,style,direction),size=(style==='outcome'?1.6:1.15)+q*(style==='move'?1.3:1.1)+(premiumCue?1.05:0),fade=(.24+Math.sin(cycle*Math.PI)*.56)*(style==='aura'||loop?1:Math.max(.12,1-time/2.4));
      if(premiumCue&&!charge&&i<8){const dx=Math.cos(direction),dy=Math.sin(direction)*.43;ctx.save();ctx.globalAlpha=fade*.38;ctx.strokeStyle=colors[(i+1)%colors.length]||colors[0];ctx.lineWidth=Math.max(.8,size*.25);ctx.shadowColor=colors[0];ctx.shadowBlur=5;ctx.beginPath();ctx.moveTo(x-dx*size*3,y-dy*size*3);ctx.lineTo(x,y);ctx.stroke();ctx.restore();}
      particle(ctx,theme,x,y,size,colors[i%colors.length],angle,fade);
    }
    if(style==='outcome'){for(let i=0;i<3;i++){const q=seeded(seed+9,i),x=cx+(q-.5)*radius*1.35,y=ground-rise*(.56+q*.16);particle(ctx,'starlight',x,y,2.2,colors[i%colors.length],phase+i,.85);}}
    ctx.restore();
  }
    function canvasFor(container){const canvas=root.document.createElement('canvas');canvas.className='kanto-cosmetic-canvas';canvas.setAttribute('aria-hidden','true');container.appendChild(canvas);return canvas;}
  function paintCanvas(canvas,effect,time=0,loop=false,style='preview'){
    const thumbnail=style==='thumbnail'||String(canvas.className||'').includes('card-preview'),bleed=thumbnail?0:Number(canvas.dataset?.overscan)||0;
    const rect=thumbnail?null:bleed?(canvas.parentElement||canvas.parentNode||canvas.parent)?.getBoundingClientRect():canvas.getBoundingClientRect();
    const dpr=thumbnail?1:clamp(root.devicePixelRatio||1,1,1.5),width=thumbnail?320:Math.max(1,rect?.width||320),height=thumbnail?180:Math.max(1,rect?.height||180),padX=width*bleed,padY=height*bleed,outerWidth=width+padX*2,outerHeight=height+padY*2,pixelWidth=Math.round(outerWidth*dpr),pixelHeight=Math.round(outerHeight*dpr);
    if(canvas.width!==pixelWidth)canvas.width=pixelWidth;if(canvas.height!==pixelHeight)canvas.height=pixelHeight;canvas.style.opacity=String(Number.isFinite(effect.opacity)?clamp(effect.opacity,0,1):cosmeticOpacity);
    const anchor=canvas.closest?.('.kanto-cosmetic-anchor,.kanto-cosmetic-viewer-anchor');if(anchor)anchor.style.zIndex=effect.layer==='front'?'4':'2';
    const ctx=canvas.getContext('2d');if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,padX*dpr,padY*dpr);ctx.clearRect(-padX,-padY,outerWidth,outerHeight);draw(ctx,effect,time,width,height,loop,thumbnail?'thumbnail':style);
    // Give older bespoke emitters the same quiet arrival/release as the new
    // rigs. Apply after drawing because individual emitters set globalAlpha.
    if(!thumbnail&&!MATERIAL_RIGS[effect.particleId]&&!/^(red-dragon|hell-lance)$/.test(effect.particleId||'')){
      const smooth=value=>{const q=clamp(value,0,1);return q*q*(3-2*q);},alpha=style==='aura'?.74*smooth(time/.4):smooth(time/.22)*(1-smooth((time-1.08)/.47));
      ctx.save();ctx.globalCompositeOperation='destination-in';ctx.globalAlpha=alpha;ctx.fillStyle='#fff';ctx.fillRect(-padX,-padY,outerWidth,outerHeight);ctx.restore();
    }
  }
  let raf=0,lastFrame=0;
  function hasRunnable(){return [...live].some(item=>!item.paused);}
  function schedule(){if(!raf&&!root.document?.hidden&&hasRunnable()&&!reduceMotion())raf=root.requestAnimationFrame(tick);}
  function tick(now){raf=0;const delta=lastFrame?Math.max(0,Math.min(80,now-lastFrame)):0;lastFrame=now;for(const item of [...live]){if(item.paused)continue;item.elapsed+=delta;const elapsed=item.elapsed/1000;if(!item.loop&&item.elapsed>=item.duration){item.stop();continue;}const shownTime=item.loop&&item.preview&&item.style!=='aura'?elapsed%(item.duration/1000):!item.loop?elapsed*1550/item.duration:elapsed;paintCanvas(item.canvas,item.effect,shownTime,item.loop,item.style);if(item.frontCanvas)paintCanvas(item.frontCanvas,{...item.effect,depthPass:'front'},shownTime,item.loop,item.style);}schedule();}
  function visibilityChanged(){if(root.document?.hidden){if(raf)root.cancelAnimationFrame(raf);raf=0;}else schedule();}
  root.document?.addEventListener?.('visibilitychange',visibilityChanged);
  function stoppedEffect(){const stop=()=>{};stop.pause=stop.resume=stop.restart=()=>{};stop.isPaused=()=>true;return stop;}
  function play(rootNode,effect,duration=1350,options={}){
    if(!rootNode||!effect)return stoppedEffect();const loop=options?.loop===true,preview=options?.preview===true;
    if(loop&&!preview&&[...live].filter(item=>item.loop&&!item.preview).length>=MAX_LOOPING)return stoppedEffect();
    while(live.size>=MAX_ACTIVE){const oldest=[...live].find(item=>!item.loop);if(oldest)oldest.stop();else return stoppedEffect();}
    const overlay=root.document.createElement('div');overlay.className='kanto-cosmetic-fx-overlay';const canvas=canvasFor(overlay),bleed=Math.max(.5,Math.min(1.2,(Number(effect.scale)||1)*.42-.15));canvas.dataset.overscan=String(bleed);canvas.style.left=canvas.style.top=`${-bleed*100}%`;canvas.style.width=canvas.style.height=`${(1+bleed*2)*100}%`;canvas.style.opacity=String(cosmeticOpacity);rootNode.appendChild(overlay);
    canvas.style.opacity=String(Number.isFinite(effect.opacity)?clamp(effect.opacity,0,1):cosmeticOpacity);const anchor=canvas.closest?.('.kanto-cosmetic-anchor,.kanto-cosmetic-viewer-anchor');if(anchor)anchor.style.zIndex=effect.layer==='front'?'4':'2';
    let frontRoot=null,frontCanvas=null;const split=effect.layer==='auto'&&/red-dragon|hell-lance$/.test(effect.particleId||'')&&(rootNode.parentElement||rootNode.parentNode);
    if(split){frontRoot=root.document.createElement('div');frontRoot.className='kanto-cosmetic-depth-front';frontRoot.setAttribute('aria-hidden','true');for(const key of ['left','top','width','height'])frontRoot.style[key]=rootNode.style[key];frontRoot.style.position='absolute';frontRoot.style.zIndex='4';frontRoot.style.pointerEvents='none';frontRoot.style.overflow='visible';(rootNode.parentElement||rootNode.parentNode).appendChild(frontRoot);const frontOverlay=root.document.createElement('div');frontOverlay.className='kanto-cosmetic-fx-overlay';frontRoot.appendChild(frontOverlay);frontCanvas=canvasFor(frontOverlay);frontCanvas.dataset.overscan=String(bleed);frontCanvas.style.left=frontCanvas.style.top=`${-bleed*100}%`;frontCanvas.style.width=frontCanvas.style.height=`${(1+bleed*2)*100}%`;frontCanvas.style.opacity=canvas.style.opacity;effect={...effect,depthPass:'back'};}
    const style=options?.style||(loop?'aura':'move'),item={overlay,canvas,frontCanvas,frontRoot,effect,duration:clamp(duration,180,2600),loop,preview,style,elapsed:0,timeout:0,paused:false,stop:null};
    item.stop=()=>{if(!live.has(item))return;live.delete(item);if(item.timeout)root.clearTimeout(item.timeout);overlay.remove();frontRoot?.remove();if(!live.size&&raf){root.cancelAnimationFrame(raf);raf=0;lastFrame=0;}};
    live.add(item);
    if(reduceMotion()||root.document?.hidden){paintCanvas(canvas,effect,.85,loop,style);if(frontCanvas)paintCanvas(frontCanvas,{...effect,depthPass:'front'},.85,loop,style);if(!loop)item.timeout=root.setTimeout(item.stop,260);}
    else schedule();
    item.stop.pause=()=>{item.paused=true;if(!hasRunnable()&&raf){root.cancelAnimationFrame(raf);raf=0;lastFrame=0;}};
    item.stop.resume=()=>{if(!live.has(item))return;item.paused=false;schedule();};
    item.stop.restart=()=>{if(!live.has(item))return;item.elapsed=0;paintCanvas(canvas,effect,reduceMotion()?.85:0,loop,style);if(frontCanvas)paintCanvas(frontCanvas,{...effect,depthPass:'front'},reduceMotion()?.85:0,loop,style);item.stop.resume();};
    item.stop.isPaused=()=>item.paused;
    return item.stop;
  }
  function renderPreview(canvasOrContainer,effect,options={}){const canvas=canvasOrContainer?.tagName==='CANVAS'?canvasOrContainer:canvasFor(canvasOrContainer);const scale=clamp(Number(options.scale)||1,.72,2.1),previewEffect=scale===1?effect:{...effect,scale:(Number(effect.scale)||1)*scale};paintCanvas(canvas,previewEffect,Math.max(0,Number(options.time)||0),false,options.style||'entry');return()=>canvas.remove();}
  function playEntry(rootNode,effect,options={}){const aura=effect?.cosmeticSlot==='aura'||effect?.slot==='aura',loop=options.loop===undefined?aura:options.loop===true;return play(rootNode,effect,options.duration||1550,{...options,loop,style:loop?'aura':'entry'});}
  function playMove(rootNode,effect,options={}){return play(rootNode,effect,options.duration||900,{...options,style:'move'});}
  function playOutcome(rootNode,effect,options={}){return play(rootNode,effect,options.duration||1750,{...options,style:'outcome'});}
  function anchorBounds(stage,actor,side){
    if(!stage?.width||!stage?.height||!actor?.width||!actor?.height)return null;
    const width=Math.min(Math.max(actor.width*.95,stage.width*.2),stage.width*.46),height=Math.min(Math.max(actor.height*.84,stage.height*.24),stage.height*.48);
    const x=(actor.left||0)+actor.width*.5-(stage.left||0),y=(actor.top||0)+actor.height*(side==='player'?.64:.58)-(stage.top||0);
    return {left:(x-width/2)/stage.width*100,top:(y-height/2)/stage.height*100,width:width/stage.width*100,height:height/stage.height*100};
  }
  function render(container,state,onAction){
    if(!container||!root.document)return()=>{};
    container.__cosmeticPreviewStop?.();container.__cosmeticPreviewStop=null;container.replaceChildren();container.classList.add('kanto-cosmetic-panel');
    const head=root.document.createElement('header'),heading=root.document.createElement('div'),title=root.document.createElement('strong'),subtitle=root.document.createElement('small');
    title.textContent='舞台幻彩工坊';subtitle.textContent='纯外观藏品 · 不提供战斗属性';heading.append(title,subtitle);head.appendChild(heading);
    const target=root.document.createElement('select');target.className='kanto-cosmetic-target';target.setAttribute('aria-label','装备对象');
    for(const mon of state.party||[]){const option=root.document.createElement('option');option.value=mon.uid;option.textContent=mon.name;target.appendChild(option);}target.value=(state.party||[]).some(mon=>mon.uid===state.selectedUid)?state.selectedUid:(state.party?.[0]?.uid||'');target.disabled=!state.party?.length;head.appendChild(target);
    const clear=root.document.createElement('button');clear.type='button';clear.textContent='全部卸下';clear.disabled=!target.value;clear.addEventListener('click',()=>onAction?.({action:'clear',uid:target.value}));head.appendChild(clear);container.appendChild(head);
    let selectedSlot=container.dataset.previewSlot||'';const equipmentButtons=[];const currentId=slot=>{const own=state.equipped?.伙伴?.[target.value];return own&&Object.hasOwn(own,slot)?own[slot]:state.equipped?.全局?.[slot];};const refreshCardTargets=()=>{for(const row of equipmentButtons){const active=currentId(selectedSlot||row.item.slot)===row.item.id;row.equip.disabled=active||!target.value;row.equip.textContent=active?'已装备':'装备';row.unequip.hidden=!active;}clear.disabled=!target.value;};

    const sampleMap=new Map();for(const item of [...(state.particleDirectory||[]).map(entry=>(state.catalog||[]).find(item=>item.effect?.particleId===entry.key)),...(state.catalog||[]).filter(item=>item.id.startsWith('hell-')||item.id.startsWith('original-'))])if(item&&!sampleMap.has(item.effect.particleId))sampleMap.set(item.effect.particleId,item);
    const samples=[...sampleMap.values()],remembered=(state.catalog||[]).find(item=>item.id===container.dataset?.previewCosmeticId);if(remembered){const index=samples.findIndex(item=>item.effect.particleId===remembered.effect.particleId);if(index>=0)samples[index]=remembered;}let previewItemInViewer=()=>false;
    if(samples.length){
      const viewer=root.document.createElement('section');viewer.className='kanto-cosmetic-viewer';const viewerHeading=root.document.createElement('div');viewerHeading.className='kanto-cosmetic-viewer-heading';
      const viewerTitle=root.document.createElement('h2');viewerTitle.textContent='粒子独立预览';const viewerNote=root.document.createElement('p');viewerNote.textContent='选择效果，查看宝可梦登场时的表现。';const search=root.document.createElement('input');search.type='search';search.className='kanto-cosmetic-viewer-search';search.placeholder='搜索中文或英文名称';search.setAttribute('aria-label','搜索粒子效果');viewerHeading.append(viewerTitle,viewerNote,search);viewer.appendChild(viewerHeading);
      const select=root.document.createElement('select');select.className='kanto-cosmetic-viewer-select';select.setAttribute('aria-label','选择粒子预览');select.value=remembered?.effect.particleId||'';viewer.appendChild(select);
      const stage=root.document.createElement('div');stage.className='kanto-cosmetic-viewer-stage';stage.setAttribute('aria-label','粒子动画预览');viewer.appendChild(stage);
      stage.classList.add('has-creature');const creature=root.document.createElement('img');creature.className='kanto-cosmetic-viewer-creature';creature.alt='我方宝可梦背面';stage.appendChild(creature);
      const previewAnchor=root.document.createElement('div');previewAnchor.className='kanto-cosmetic-viewer-anchor';stage.appendChild(previewAnchor);
      const controls=root.document.createElement('div');controls.className='kanto-cosmetic-viewer-controls';
      const addRange=(label,min,max,step,value)=>{const wrap=root.document.createElement('label');wrap.className='kanto-cosmetic-control';const text=root.document.createElement('span');text.textContent=label;const input=root.document.createElement('input');input.type='range';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(value);const output=root.document.createElement('output');output.textContent=String(value);input.addEventListener('input',()=>{output.textContent=input.value;refresh();});wrap.append(text,input,output);controls.appendChild(wrap);return input;};
      const scaleInput=addRange('大小',.8,1.8,.1,1),speedInput=addRange('速度',.5,1.8,.1,1),countInput=addRange('粒子数',8,64,1,24);
      const seedLabel=root.document.createElement('label');seedLabel.className='kanto-cosmetic-control kanto-cosmetic-seed';const seedText=root.document.createElement('span');seedText.textContent='随机种子';const seedInput=root.document.createElement('input');seedInput.type='number';seedInput.min='1';seedInput.max='9999';seedInput.value='1';seedInput.addEventListener('input',refresh);seedLabel.append(seedText,seedInput);controls.appendChild(seedLabel);
      const sideLabel=root.document.createElement('label');sideLabel.className='kanto-cosmetic-control kanto-cosmetic-side';const sideText=root.document.createElement('span');sideText.textContent='站位';const side=root.document.createElement('select');side.setAttribute('aria-label','选择我方或对手站位');for(const [key,label] of [['player','我方背面'],['opponent','对手正面']]){const option=root.document.createElement('option');option.value=key;option.textContent=label;side.appendChild(option);}side.value='player';sideLabel.append(sideText,side);controls.appendChild(sideLabel);
      const loopLabel=root.document.createElement('label');loopLabel.className='kanto-cosmetic-loop';const loop=root.document.createElement('input');loop.type='checkbox';loop.checked=true;const loopText=root.document.createElement('span');loopText.textContent='循环播放';loopLabel.append(loop,loopText);controls.appendChild(loopLabel);
      const buttons=root.document.createElement('div');buttons.className='kanto-cosmetic-viewer-buttons';const pause=root.document.createElement('button');pause.type='button';pause.textContent='暂停';const replay=root.document.createElement('button');replay.type='button';replay.textContent='重播';const previous=root.document.createElement('button');previous.type='button';previous.textContent='上一个';const next=root.document.createElement('button');next.type='button';next.textContent='下一个';buttons.append(pause,replay,previous,next);controls.appendChild(buttons);viewer.appendChild(controls);
      const opacityLabel=root.document.createElement('label');opacityLabel.className='kanto-cosmetic-control';const opacityText=root.document.createElement('span');opacityText.textContent='特效不透明度';const opacityInput=root.document.createElement('input');opacityInput.type='range';opacityInput.min='0';opacityInput.max='100';opacityInput.step='5';opacityInput.value=String(Math.round(cosmeticOpacity*100));opacityInput.setAttribute('aria-label','特效不透明度');const opacityOutput=root.document.createElement('output');opacityOutput.textContent=opacityInput.value+'%';opacityInput.addEventListener('input',()=>{opacityOutput.textContent=opacityInput.value+'%';refresh();});opacityLabel.append(opacityText,opacityInput,opacityOutput);controls.appendChild(opacityLabel);
      const layerLabel=root.document.createElement('label');layerLabel.className='kanto-cosmetic-control';const layerText=root.document.createElement('span');layerText.textContent='显示位置';const layer=root.document.createElement('select');layer.setAttribute('aria-label','特效显示位置');for(const [value,label]of [['auto','自然环绕（前后分层）'],['back','全部在精灵后方'],['front','全部在精灵前方']]){const option=root.document.createElement('option');option.value=value;option.textContent=label;layer.appendChild(option);}layer.value='back';layer.addEventListener('change',refresh);layerLabel.append(layerText,layer);controls.appendChild(layerLabel);
      const slotLabel=root.document.createElement('label');slotLabel.className='kanto-cosmetic-control';const slotText=root.document.createElement('span');slotText.textContent='播放时机';const slotSelect=root.document.createElement('select');slotSelect.setAttribute('aria-label','特效播放时机');for(const [value,label]of [['entry','登场'],['move','出招'],['aura','常驻光环'],['outcome','胜利']]){const option=root.document.createElement('option');option.value=value;option.textContent=label;slotSelect.appendChild(option);}slotLabel.append(slotText,slotSelect);controls.appendChild(slotLabel);slotSelect.addEventListener('change',()=>{selectedSlot=slotSelect.value;container.dataset.previewSlot=selectedSlot;resetParameters();refresh();refreshCardTargets();});
      const save=root.document.createElement('button');save.type='button';save.textContent='保存并装备';save.className='kanto-cosmetic-save';const savedNote=root.document.createElement('span');savedNote.className='kanto-cosmetic-save-note';savedNote.setAttribute('role','status');controls.append(save,savedNote);
      const directoryDetails=root.document.createElement('details');directoryDetails.className='kanto-cosmetic-directory';const summary=root.document.createElement('summary');summary.textContent=`常规主题目录 · ${(state.particleDirectory||[]).length} 种`;directoryDetails.appendChild(summary);const list=root.document.createElement('ul');for(const particle of state.particleDirectory||[]){const row=root.document.createElement('li');const name=root.document.createElement('span');name.textContent=particle.label||particle.name;const status=root.document.createElement('small');status.textContent=NORMAL_CYCLES[particle.key]?.frames===4?'四动作奖励演出':'原创部件动画';row.append(name,status);list.appendChild(row);}directoryDetails.appendChild(list);viewer.appendChild(directoryDetails);
      const entries=new Map((state.particleDirectory||[]).map(entry=>[entry.key,entry]));for(const item of samples)if(!entries.has(item.effect.particleId))entries.set(item.effect.particleId,{key:item.effect.particleId,label:item.name,name:item.name});let matching=samples.slice(),stopViewer=null,userPaused=false,onscreen=true;const selected=()=>matching.find(item=>item.effect.particleId===select.value)||matching[0];
      const syncViewerPause=()=>{if(!stopViewer)return;if(userPaused||!onscreen||root.document?.hidden)stopViewer.pause();else stopViewer.resume();};
      function resetParameters(){const source=selected();if(!source)return;selectedSlot=selectedSlot||source.slot;container.dataset.previewSlot=selectedSlot;slotSelect.value=selectedSlot;const saved=state.parameters?.[target.value]?.[selectedSlot],p=saved?.id===source.id?saved:null;scaleInput.value=String(p?.scale??clamp(Number(source.effect.scale)||1,.8,1.8));speedInput.value=String(p?.speed??clamp(Number(source.effect.speed)||1,.5,1.8));countInput.value=String(p?.particleCount??source.effect.particleCount??24);seedInput.value=String(p?.seed??source.effect.seed??1);opacityInput.value=String(Math.round((p?.opacity??cosmeticOpacity)*100));opacityOutput.textContent=opacityInput.value+'%';layer.value=p?.layer||source.effect.layer||'auto';for(const input of [scaleInput,speedInput,countInput]){const output=input.parentElement?.querySelector?.('output');if(output)output.textContent=input.value;}}
      function updateOptions(){const prior=select.value||remembered?.effect.particleId||'',query=String(search.value||'').trim().toLocaleLowerCase();matching=samples.filter(item=>{const entry=entries.get(item.effect.particleId);return [entry?.name,entry?.label,entry?.legacyName,entry?.legacyLabel,item.name,item.effect.particleId].some(value=>String(value||'').toLocaleLowerCase().includes(query));});select.replaceChildren();for(const item of matching){const entry=entries.get(item.effect.particleId),option=root.document.createElement('option');option.value=item.effect.particleId;option.textContent=entry?.label||entry?.name||item.name;select.appendChild(option);}select.disabled=!matching.length;select.value=matching.some(item=>item.effect.particleId===prior)?prior:(matching[0]?.effect.particleId||'');previous.disabled=next.disabled=!matching.length;viewerNote.textContent=matching.length?'默认参数与战斗一致；调整滑块可临时试验。':'没有找到匹配的效果，请更换关键词。';resetParameters();refresh();}
      function refresh(){const source=selected();stopViewer?.();stopViewer=null;save.disabled=!source?.owned||!target.value;savedNote.textContent=source?.owned?'预览中；保存后应用到当前伙伴。':'先领取特效，再保存并装备。';if(!source)return;container.dataset.previewCosmeticId=source.id;const location=side.value==='opponent'?'opponent':'player';const effect={...resolveEffect(source.effect,{seed:Math.max(1,Math.min(9999,Number(seedInput.value)||1)),scale:Number(scaleInput.value),speed:Number(speedInput.value),particleCount:Number(countInput.value),opacity:Number(opacityInput.value)/100,layer:layer.value}),anchor:'center'};
        try{const chosen=(state.party||[]).find(mon=>mon.uid===target.value)||(state.party||[])[0],dex=Number(chosen?.speciesId)||4;const mon=assetHref(`assets/pokemon/${chosen?.shiny?'shiny/':''}${location==='player'?'back/':''}${dex}.png`);stage.style.backgroundImage='none';stage.style.backgroundPosition=location==='player'?'30.8% 86%':'69.2% 86%';}catch{};
        const chosen=(state.party||[]).find(mon=>mon.uid===target.value)||(state.party||[])[0],dex=Number(chosen?.speciesId)||4,back=location==='player',fallback=assetHref(`assets/pokemon/${chosen?.shiny?'shiny/':''}${back?'back/':''}${dex}.png`),frames=root.__KANTO_ANIMATED_SPRITES__?.pokemon?.find(row=>row.dex===dex),animation=frames?.[chosen?.shiny?'shiny':'animated']?.[back?'back':'front'],hdAnimation=frames?.hd?.[chosen?.shiny?'shiny':'animated']?.[back?'back':'front'];
        const animatedUrl=animation&&root.__KANTO_ANIMATED_ROOT__?root.__KANTO_ANIMATED_ROOT__+animation:null,hdUrl=hdAnimation&&root.__KANTO_ANIMATED_ROOT__?root.__KANTO_ANIMATED_ROOT__+hdAnimation:null;
        creature.dataset.side=location;creature.alt=back?'我方宝可梦背面':'对手宝可梦正面';creature.className='kanto-cosmetic-viewer-creature'+(hdUrl?' is-hd':'');let triedLegacy=false;creature.onerror=()=>{creature.className='kanto-cosmetic-viewer-creature';if(hdUrl&&animatedUrl&&!triedLegacy){triedLegacy=true;creature.src=animatedUrl;}else{creature.onerror=null;creature.src=fallback;}};creature.src=hdUrl||animatedUrl||fallback;
        const bounds=anchorBounds(stage.getBoundingClientRect(),creature.getBoundingClientRect(),location);if(bounds)for(const [key,value]of Object.entries(bounds))previewAnchor.style[key]=`${value}%`;
        const previewStyle=selectedSlot||source.slot;stopViewer=play(previewAnchor,effect,1550,{loop:loop.checked,preview:true,style:previewStyle});syncViewerPause();}
      select.addEventListener('change',()=>{userPaused=false;pause.textContent='暂停';resetParameters();refresh();});
      pause.addEventListener('click',()=>{if(!stopViewer)return;userPaused=!userPaused;pause.textContent=userPaused?'继续':'暂停';syncViewerPause();});
      replay.addEventListener('click',()=>{userPaused=false;pause.textContent='暂停';refresh();});
      previewItemInViewer=id=>{const item=(state.catalog||[]).find(row=>row.id===id);if(!item||!samples.some(row=>row.effect.particleId===item.effect.particleId))return false;search.value='';updateOptions();const exactIndex=matching.findIndex(row=>row.effect.particleId===item.effect.particleId);matching[exactIndex]=item;select.value=item.effect.particleId;userPaused=false;pause.textContent='暂停';resetParameters();refresh();viewer.scrollIntoView?.({block:'nearest',behavior:reduceMotion()?'auto':'smooth'});return true;};
      search.addEventListener('input',updateOptions);side.addEventListener('change',refresh);loop.addEventListener('change',refresh);target.addEventListener('change',()=>{resetParameters();refresh();refreshCardTargets();});
      save.addEventListener('click',async()=>{const item=selected();if(!item?.owned||!target.value)return;save.disabled=true;try{const result=await onAction?.({action:'configure',id:item.id,slot:selectedSlot||item.slot,uid:target.value,parameters:{scale:Number(scaleInput.value),speed:Number(speedInput.value),particleCount:Number(countInput.value),seed:Number(seedInput.value),opacity:Number(opacityInput.value)/100,layer:layer.value}});savedNote.textContent=result===false?'保存未完成，请查看页面提示。':'已保存到当前伙伴。';}catch(error){savedNote.textContent=error.message||'保存失败。';}finally{save.disabled=false;}});
      const shift=offset=>{if(!matching.length)return;const index=Math.max(0,matching.findIndex(item=>item.effect.particleId===select.value));select.value=matching[(index+offset+matching.length)%matching.length].effect.particleId;userPaused=false;pause.textContent='暂停';resetParameters();refresh();};previous.addEventListener('click',()=>shift(-1));next.addEventListener('click',()=>shift(1));
      container.appendChild(viewer);updateOptions();
      let intersectionObserver=null,detachObserver=null;
      const cleanupDetached=()=>{stopViewer?.();stopViewer=null;intersectionObserver?.disconnect();detachObserver?.disconnect();};
      if(typeof root.IntersectionObserver==='function'){intersectionObserver=new root.IntersectionObserver(entries=>{if(container.isConnected===false){cleanupDetached();return;}onscreen=Boolean(entries[0]?.isIntersecting);syncViewerPause();});intersectionObserver.observe(viewer);}
      if(typeof root.MutationObserver==='function'&&!intersectionObserver&&container.parentNode){detachObserver=new root.MutationObserver(()=>{if(container.isConnected===false)cleanupDetached();});detachObserver.observe(container.parentNode,{childList:true});}
      container.__cosmeticPreviewStop=()=>{stopViewer?.();stopViewer=null;intersectionObserver?.disconnect();detachObserver?.disconnect();};
    }

    const grid=root.document.createElement('div');grid.className='kanto-cosmetic-grid';
    const seenParticles=new Set();const visibleCatalog=(state.catalog||[]).filter(item=>{const key=item.effect?.particleId||item.id,first=!seenParticles.has(key);seenParticles.add(key);return first||item.owned;});
    for(const item of visibleCatalog){const card=root.document.createElement('article');card.className='kanto-cosmetic-card';card.dataset.rarity=item.rarity;card.dataset.cosmeticId=item.id;const title=root.document.createElement('h3');title.textContent=item.name;const preview=root.document.createElement('canvas');preview.className='kanto-cosmetic-canvas kanto-cosmetic-card-preview';preview.width=320;preview.height=180;card.append(title,preview);renderPreview(preview,item.effect,{time:1.1,style:item.slot==='aura'?'aura':item.slot==='move'?'move':item.slot==='outcome'?'outcome':'entry'});const description=root.document.createElement('p');description.textContent=`${item.slotName} · ${item.rarity} · ${item.description}`;const status=root.document.createElement('small');status.textContent=item.owned?'已收藏':item.unlockReason||item.costReason||`可领取 · ${item.cost.coins?item.cost.coins+'枚代币':'₽'+item.cost.money}`;const actions=root.document.createElement('div');actions.className='kanto-cosmetic-actions';const action=(label,kind,disabled=false)=>{const button=root.document.createElement('button');button.type='button';button.textContent=label;button.disabled=disabled;button.addEventListener('click',()=>{if(kind==='preview'&&previewItemInViewer(item.id))return;onAction?.({action:kind,id:item.id,slot:selectedSlot||item.slot,uid:target.value||undefined});});actions.appendChild(button);return button;};action('预览','preview');if(!item.owned)action('领取','acquire',Boolean(item.unlockReason||item.costReason));else {const equip=action('装备','equip'),unequip=action('卸下','unequip');equipmentButtons.push({item,equip,unequip});}const obtain=root.document.createElement('small');obtain.className='kanto-cosmetic-acquisition';obtain.textContent=item.acquisition||'';card.append(description,status,obtain,actions);grid.appendChild(card);}
    refreshCardTargets();container.appendChild(grid);const catalogById=new Map(visibleCatalog.map(item=>[String(item.id),item]));const repaintTextures=()=>{for(const card of grid.children){const item=catalogById.get(card.dataset.cosmeticId);if(item)renderPreview(card.children[1],item.effect,{time:1.1,style:item.slot==='aura'?'aura':item.slot==='move'?'move':item.slot==='outcome'?'outcome':'entry'});}};textureListeners.add(repaintTextures);const priorStop=container.__cosmeticPreviewStop;container.__cosmeticPreviewStop=()=>{textureListeners.delete(repaintTextures);priorStop?.();};let cleaned=false;return()=>{if(cleaned)return;cleaned=true;container.__cosmeticPreviewStop?.();container.__cosmeticPreviewStop=null;container.replaceChildren();};
  }
  // Saved slider values are absolute values, including in older workshop saves.
  function resolveEffect(effect, parameters) {
    const base = effect || {}, p = parameters || {};
    return {...base, scale:p.scale ?? clamp(Number(base.scale)||1,.8,1.8), speed:p.speed ?? clamp(Number(base.speed)||1,.5,1.8),
      particleCount:p.particleCount ?? base.particleCount, seed:p.seed ?? base.seed, opacity:p.opacity ?? base.opacity, layer:p.layer ?? base.layer};
  }
  root.globalKantoCosmetics={resolveEffect,materialRigs:()=>Object.entries(MATERIAL_RIGS).map(([id,rig])=>({id,...rig})),rewardProfiles:()=>Object.entries({...HELL_CYCLES,...NORMAL_CYCLES}).map(([id,p])=>({id,...p})),hellProfiles:()=>Object.entries(HELL_CYCLES).map(([id,p])=>({id,...p})),hellTextureStatus:()=>[...hellImages].map(([key,v])=>({key,poster:v.poster,ready:v.ready,failed:v.failed})),playEntry,playMove,playOutcome,renderPreview,render,anchorBounds,stopAll:()=>[...live].forEach(item=>item.stop()),geometries:ARCHETYPE_NAMES(),themes:THEMES,forms:FORMS,themeFor,formFor,trioAssets,textureManifest:()=>[...textureRecipes].map(([id,[sheet,cell]])=>({id,sheet,cell})),textureStatus:()=>[...textureCache].map(([key,value])=>({key,ready:value.ready,failed:value.failed})).concat([['living',livingAtlas],['prestige',prestigeAtlas],['novel',novelAtlas],['dragon',dragonAtlas],...[...heroAtlases].map(([key,value])=>['hero-'+key,value])].filter(([,entry])=>entry).map(([key,value])=>({key,ready:value.ready,failed:Boolean(value.failed)})))};
  function ARCHETYPE_NAMES(){return ['orbit','spiral','ripple','helix','crown','hex-shield','lattice','meteor','comet-tail','fan','petal-vortex','blade-cross','ribbon-loop','glyph-seal','portal','constellation','prism-shower','wavefront','afterimage','pulse-column','vortex','spiral-stair','orbiting-cubes','ground-rune','arc-burst'];}
})(typeof window!=='undefined'?window:globalThis);
