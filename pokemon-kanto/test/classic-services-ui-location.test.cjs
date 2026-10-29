'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const services=require('../classic-services.cjs');
const mvu=require('../mvu.cjs');
function render(service){
 const replacement={innerHTML:''},picker={hidden:false,querySelector:()=>replacement};
 const button={addEventListener(){}},actionPicker={value:'0',addEventListener(){}};
 const container={innerHTML:'',querySelector(selector){return selector==='[data-classic-replace]'?picker:selector==='#classic-action-select'?actionPicker:button;}};
 const context={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/classic-services-ui.js'),'utf8'),context);
 context.KantoClassicServices.render(container,{view:service});
 return {html:container.innerHTML,replacement:replacement.innerHTML};
}
test('the classic panel hides non-local facility cards and local tutor replacement names are Chinese',()=>{
 const world=mvu.createInitialMvu(4).stat_data.宝可梦;
 world.地图.节点='pallet';
 const away=render(services.view(world));
 assert.equal((away.html.match(/class="classic-card" hidden/g)||[]).length,4);
 world.地图.节点='celadon';world.城市设施.departmentStore.floor='3F';
 world.队伍[0].招式=['scratch','growl','ember','smokescreen'].map(id=>({id}));
 const here=render(services.view(world));
 assert.equal((here.html.match(/class="classic-card" hidden/g)||[]).length,2);
 assert.match(here.html,/双倍奉还/);
 assert.match(here.replacement,/抓/);
 assert.doesNotMatch(here.replacement,/scratch/);
});
