'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

test('standalone preview mounts media with matching MIME and keeps traversal outside media roots',async t=>{
 const server=require('../server.cjs');
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}`;
 const page=await (await fetch(base+'/')).text();
 assert.match(page,/__KANTO_FX_ASSET_ROOT__="\/assets\/fx\/"/);
 for(const [route,type] of [['/assets/fx/normal-garden.png','image/png'],['/assets/pokemon/animated/4-front-n.gif','image/gif'],['/assets/pokemon/hd/4-front-n.webp','image/webp']]){
  const response=await fetch(base+route);assert.equal(response.status,200,route);assert.equal(response.headers.get('content-type'),type);
  assert.ok((await response.arrayBuffer()).byteLength>100,route);
 }
 const escaped=await fetch(base+'/assets/fx/..%2F..%2Fcard-source%2Fcard.json');
 assert.equal(escaped.status,403);
});
