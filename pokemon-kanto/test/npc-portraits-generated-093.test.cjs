'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');

const root=path.join(__dirname,'../public');
const catalogue=JSON.parse(fs.readFileSync(path.join(root,'data/npc-portraits.json'),'utf8'));
const trainers=JSON.parse(fs.readFileSync(path.join(root,'data/trainers.json'),'utf8'));
const expected=['ash_anime_v1','ace_trainer_male_project_v1','traveler_trainer_female_project_v1','girl_backpacker_project_v1','breeder_female_project_v1'];

function readRgba(file){
  const png=fs.readFileSync(file);
  assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20),depth=png[24],colorType=png[25];
  assert.equal(depth,8);assert.equal(colorType,6,'asset keeps an RGBA alpha channel');
  let offset=8;const idat=[];
  while(offset<png.length){const length=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8);if(type==='IDAT')idat.push(png.subarray(offset+8,offset+8+length));offset+=length+12;if(type==='IEND')break;}
  const raw=zlib.inflateSync(Buffer.concat(idat)),stride=width*4,pixels=Buffer.alloc(height*stride);let cursor=0;
  for(let y=0;y<height;y++){
    const filter=raw[cursor++],row=y*stride;
    for(let x=0;x<stride;x++){
      let value=raw[cursor++],left=x>=4?pixels[row+x-4]:0,up=y?pixels[row-stride+x]:0,upLeft=y&&x>=4?pixels[row-stride+x-4]:0;
      if(filter===1)value=(value+left)&255;else if(filter===2)value=(value+up)&255;else if(filter===3)value=(value+Math.floor((left+up)/2))&255;else if(filter===4){const p=left+up-upLeft,pa=Math.abs(p-left),pb=Math.abs(p-up),pc=Math.abs(p-upLeft);value=(value+(pa<=pb&&pa<=pc?left:pb<=pc?up:upLeft))&255;}
      else assert.equal(filter,0,'PNG uses a supported filter');
      pixels[row+x]=value;
    }
  }
  return {png,width,height,pixels,stride};
}

test('0.9.3 generated trainer portraits are registered, hashed, full-body transparent PNGs',()=>{
  const entries=expected.map(id=>catalogue.entries.find(entry=>entry.id===id));
  assert.ok(entries.every(Boolean));
  for(const entry of entries){
    assert.equal(entry.sourceRepository,'Project original art');assert.equal(entry.generationTool,'built-in image_gen');
    assert.ok(entry.generationPrompt);assert.ok(entry.generationSourcePath);assert.equal(entry.fullBody,true);
    assert.equal(entry.transparent,true);assert.equal(entry.alphaChannel,true);assert.equal(entry.width,1024);assert.equal(entry.height,1536);
    const file=path.join(root,entry.image);assert.ok(fs.existsSync(file),entry.image);
    const {png,width,height,pixels,stride}=readRgba(file);
    assert.equal(crypto.createHash('sha256').update(png).digest('hex'),entry.sha256);
    assert.equal(width,entry.width);assert.equal(height,entry.height);
    assert.equal(pixels[3],0,'top-left corner remains transparent');assert.equal(pixels[(width-1)*4+3],0,'top-right corner remains transparent');
    assert.equal(pixels[(height-1)*stride+3],0,'bottom-left corner remains transparent');assert.equal(pixels[(height*width-1)*4+3],0,'bottom-right corner remains transparent');
    let minX=width,minY=height,maxX=-1,maxY=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[y*stride+x*4+3]>entry.alphaThreshold){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    assert.deepEqual({x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1,canvasWidth:width,canvasHeight:height},entry.artBounds);
  }
});

test('Ash uses the original-series portrait and keeps the previous portrait as fallback',()=>{
  const ash=trainers.find(entry=>entry.id==='trainer_ash');
  assert.ok(ash);assert.equal(ash.image,'assets/trainers/project-original/ash-anime-v1.png');
  assert.equal(ash.age,'child');assert.equal(ash.ageYears,10);assert.equal(ash.gender,'male');assert.equal(ash.fullBody,true);
  assert.ok(ash.portraitFallbacks.some(item=>item.image==='assets/trainers/official/ash.png'));
});

test('new generic portraits are fallback-only and have accurate demographic roles',()=>{
  const byId=Object.fromEntries(catalogue.entries.map(entry=>[entry.id,entry]));
  for(const id of expected.slice(1))assert.equal(byId[id].fallbackOnly,true);
  assert.deepEqual([byId.ace_trainer_male_project_v1.gender,byId.ace_trainer_male_project_v1.age],['male','adult']);
  assert.equal(byId.ace_trainer_male_project_v1.ageYears,28);
  assert.deepEqual([byId.traveler_trainer_female_project_v1.gender,byId.traveler_trainer_female_project_v1.age],['female','adult']);
  assert.equal(byId.traveler_trainer_female_project_v1.ageYears,28);
  assert.deepEqual([byId.girl_backpacker_project_v1.gender,byId.girl_backpacker_project_v1.age],['female','teen']);
  assert.equal(byId.girl_backpacker_project_v1.ageYears,16);
  assert.deepEqual([byId.breeder_female_project_v1.gender,byId.breeder_female_project_v1.age],['female','adult']);
  assert.equal(byId.breeder_female_project_v1.lifeStage,'middle-aged');
  assert.equal(byId.breeder_female_project_v1.ageYears,45);
  assert.ok(byId.breeder_female_project_v1.roles.includes('breeder'));
});
