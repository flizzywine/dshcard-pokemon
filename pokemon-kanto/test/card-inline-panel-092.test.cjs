'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const card=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../../card-source/card.json'),'utf8'));
const statusScript=card.data.extensions.regex_scripts.find(script=>script.id==='dsh-mvu-status-view');
assert.ok(statusScript,'the card keeps the MVU status view regex');
assert.ok(card.data.extensions.regex_scripts.some(script=>script.id==='kanto-hide-activity-choices'),'the separately maintained activity-choice filter is preserved');
const match=/<script>([\s\S]*?)<\/script>/.exec(statusScript.replaceString);
assert.ok(match,'the inline status panel still contains its host bridge script');
const inlineScript=match[1];

class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.style={};this.handlers={};this.attributes={};this.hidden=false;this.open=false;this.value='';this._text='';}
 append(...children){for(const child of children){if(child!==undefined&&child!==null)this.children.push(child)}}
 replaceChildren(...children){this.children=[];this.append(...children)}
 addEventListener(type,handler){(this.handlers[type]||=[]).push(handler)}
 setAttribute(name,value){this.attributes[name]=String(value)}
 dispatch(type){for(const handler of this.handlers[type]||[])handler({target:this})}
 get textContent(){return this._text+this.children.map(child=>child.textContent||'').join('')}
 set textContent(value){this._text=String(value);this.children=[]}
 get options(){return this.children}
}

function harness(){
 const world={
  訓練家:{姓名:'小岚',金钱:3000,徽章:[]},地图:{地点:'真新镇'},战斗:{状态:'pending',摘要:'开场选择伙伴'},
  队伍:[{uid:'starter-charmander',图鉴编号:4,昵称:'小火龙',等级:5,当前HP:13,状态:'',能力值:{hp:20,atk:11,def:10,spa:12,spd:9,spe:14},个体值:{hp:31,atk:30,def:29,spa:28,spd:27,spe:26},招式:[{id:'growl',PP:38,PP上限:40}]}],
  背包:{物品:{potion:3,pokeball:5},关键物品:[{id:'itemfinder'}]},任务:[]
 };
 const ids=Object.fromEntries(['trainer','place','money','badges','team','battle','slots','items','questsList','summary'].map(id=>[id,new Element()]));
 const document={getElementById:id=>ids[id],createElement:tag=>new Element(tag),querySelectorAll:()=>[],addEventListener(){}};
 const listeners=[],assetPaths=[];
 const context={document,setTimeout,clearTimeout,window:{KantoAssets:{href(path){assetPaths.push(path);return `resolved/${path}`}}},Mvu:{events:{VARIABLE_INITIALIZED:'init',VARIABLE_UPDATE_ENDED:'update'},getMvuData(){return {stat_data:{宝可梦:world}}}},tavern_events:{},waitGlobalInitialized(){return Promise.resolve()},eventOn(event,listener){listeners.push(listener)}};
 vm.runInNewContext(inlineScript,context,{filename:'dsh-mvu-status-view.js'});
 return {world,ids,listeners,assetPaths};
}

test('inline status panel script parses and renders default-collapsed UID cards and bag groups from MVU',async()=>{
 assert.doesNotThrow(()=>new vm.Script(inlineScript,{filename:'dsh-mvu-status-view.js'}));
 const {world,ids,listeners,assetPaths}=harness(),before=JSON.stringify(world);
 await new Promise(resolve=>setImmediate(resolve));
 const cards=ids.slots.children.filter(node=>node.tagName==='DETAILS');
 assert.equal(cards.length,1);assert.equal(cards[0].open,false);assert.equal(cards[0].dataset.uid,'starter-charmander');
 assert.match(cards[0].textContent,/小火龙 · Lv\.5/);assert.match(cards[0].textContent,/HP 13 \/ 20/);
 assert.match(cards[0].textContent,/HP 31/);assert.match(cards[0].textContent,/物攻 30/);assert.match(cards[0].textContent,/growl 38\/40/);
 assert.ok(assetPaths.includes('assets/pokemon/artwork/4.png'),'the summary requests its card-pack artwork through the host bridge');
 const groups=ids.items.children.filter(node=>node.tagName==='DETAILS');
 assert.equal(groups.length,3);assert.ok(groups.every(group=>group.open===false),'all inventory categories start folded');
 const callback=listeners[0];assert.equal(typeof callback,'function');
 cards[0].open=true;cards[0].dispatch('toggle');groups[0].open=true;groups[0].dispatch('toggle');callback();
 await new Promise(resolve=>setTimeout(resolve,100));
 const rerendered=ids.slots.children.find(node=>node.tagName==='DETAILS'),rerenderedGroups=ids.items.children.filter(node=>node.tagName==='DETAILS');
 assert.equal(rerendered.open,true,'the same Pokémon UID keeps its open state across MVU updates');
 assert.equal(rerendered,cards[0],'unchanged numeric data does not rebuild an existing card');
 assert.equal(rerenderedGroups.find(node=>node.dataset.category===groups[0].dataset.category).open,true,'the same bag category keeps its open state across updates');
 assert.equal(JSON.stringify(world),before,'rendering only reads MVU values and does not mutate game state');
});
