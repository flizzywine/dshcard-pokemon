const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
test('item catalog is indexed once per catalog version and preserves names and aliases',()=>{
 const start=source.indexOf('  let itemCatalogCache = null;'),end=source.indexOf('  function renderHudTabs()',start);
 assert.ok(start>=0&&end>start);
 let reads=0;
 const state={items:{items:[{id:'potion',name:'伤药',key:'heal'}]},machines:[{id:'tm27',nameZh:'TM27 报恩',move:'return'}]};
 const ctx={state,itemLabels:{},first:(obj,keys,fallback)=>{reads++;for(const key of keys)if(obj?.[key]!==undefined&&obj[key]!==null)return obj[key];return fallback;}};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end)+';this.catalogEntries=catalogEntries;this.itemDefinition=itemDefinition;this.itemName=itemName;',ctx);
 assert.equal(ctx.itemName('TM27'),'TM27 报恩');assert.equal(ctx.itemName('potion'),'伤药');
 const afterFirst=reads;for(let i=0;i<2000;i++)ctx.itemDefinition(i%2?'POTION':'tm27');assert.equal(reads,afterFirst,'lookups reuse the index');
 state.machines=[{id:'tm27',nameZh:'TM27 新名称'}];assert.equal(ctx.itemName('tm27'),'TM27 新名称','a replaced machine list invalidates the index');
 state.items={potion:{id:'potion',name:'新伤药'}};assert.equal(ctx.itemName('potion'),'新伤药','a replaced catalog invalidates the index');
});
