'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const root=path.join(__dirname,'../public');
const trainers=JSON.parse(fs.readFileSync(path.join(root,'data/trainers.json'),'utf8'));
const portraits=JSON.parse(fs.readFileSync(path.join(root,'data/npc-portraits.json'),'utf8'));
const expected=['trainer_ariana','trainer_proton','trainer_petrel'];
function decode(png){
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20),depth=png[24],type=png[25];assert.equal(depth,8);assert.equal(type,6,'RGBA PNG with alpha channel');
 let off=8,idat=[];while(off<png.length){const size=png.readUInt32BE(off),chunk=png.toString('ascii',off+4,off+8);if(chunk==='IDAT')idat.push(png.subarray(off+8,off+8+size));off+=size+12;if(chunk==='IEND')break;}
 const raw=zlib.inflateSync(Buffer.concat(idat)),stride=width*4,pixels=Buffer.alloc(height*stride);let cursor=0;
 for(let y=0;y<height;y++){const filter=raw[cursor++],row=y*stride;for(let x=0;x<stride;x++){let value=raw[cursor++],left=x>=4?pixels[row+x-4]:0,up=y?pixels[row-stride+x]:0,ul=y&&x>=4?pixels[row-stride+x-4]:0;if(filter===1)value=(value+left)&255;else if(filter===2)value=(value+up)&255;else if(filter===3)value=(value+Math.floor((left+up)/2))&255;else if(filter===4){const p=left+up-ul,pa=Math.abs(p-left),pb=Math.abs(p-up),pc=Math.abs(p-ul);value=(value+(pa<=pb&&pa<=pc?left:pb<=pc?up:ul))&255;}else assert.equal(filter,0);pixels[row+x]=value;}}
 return {width,height,pixels};
}
test('0.9.4 Rocket executive assets are complete, transparent, hashed and named-only',()=>{
 const named=portraits.namedCharacters||[];assert.equal(expected.length,3);
 for(const id of expected){const entry=trainers.find(item=>item.id===id),namedEntry=named.find(item=>item.id===id);assert.ok(entry,id);assert.ok(namedEntry,id);assert.equal(entry.sourceRepository,'Project original art');assert.equal(entry.generationTool,'built-in image_gen');assert.equal(entry.fullBody,true);assert.equal(entry.transparent,true);assert.equal(entry.alphaChannel,true);assert.equal(entry.width,1024);assert.equal(entry.height,1536);assert.equal(namedEntry.displayEligible,false);assert.equal(namedEntry.fallbackEligible,false);assert.ok(!portraits.entries.some(item=>item.id===id),'named identities stay out of the generic fallback pool');const png=fs.readFileSync(path.join(root,entry.image)),image=decode(png);assert.equal(crypto.createHash('sha256').update(png).digest('hex'),entry.sha256);assert.equal(image.width,entry.width);assert.equal(image.height,entry.height);assert.equal(image.pixels[3],0);assert.equal(image.pixels[(image.width-1)*4+3],0);assert.equal(image.pixels[(image.height-1)*image.width*4+3],0);assert.equal(image.pixels[(image.height*image.width-1)*4+3],0);let minX=image.width,minY=image.height,maxX=-1,maxY=-1;for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(image.pixels[(y*image.width+x)*4+3]>16){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}assert.deepEqual({x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1,canvasWidth:image.width,canvasHeight:image.height},entry.artBounds);assert.ok(entry.artBounds.y<20&&entry.artBounds.y+entry.artBounds.height>1500,`${id} includes head and both shoes`);}
 const archer=trainers.find(item=>item.id==='trainer_archer');assert.ok(archer.aliases.includes('Apollo')&&archer.aliases.includes('阿波罗'));const proton=trainers.find(item=>item.id==='trainer_proton');assert.ok(proton.aliases.includes('Lance (Rocket)'));assert.ok(!proton.aliases.some(alias=>alias==='Lance'),'Rocket Proton avoids the bare Lance alias used for the Elite Four identity');
});
