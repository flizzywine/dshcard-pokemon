'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const appPath=path.join(__dirname,'../public/app.js');
const app=fs.readFileSync(appPath,'utf8');
const publicRoot=path.join(__dirname,'../public');
function fn(name){
  const match=new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(app);assert.ok(match,`app contains ${name}`);
  const start=match.index,paren=app.indexOf('(',start);let parenDepth=0,quote='',escaped=false,close=-1;
  for(let i=paren;i<app.length;i++){const ch=app[i];if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote='';continue;}if(ch==='\''||ch==='"'||ch==='`'){quote=ch;continue;}if(ch==='(')parenDepth++;if(ch===')'&&--parenDepth===0){close=i;break;}}
  const open=app.indexOf('{',close);let depth=0;quote='';escaped=false;
  for(let i=open;i<app.length;i++){const ch=app[i];if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote='';continue;}if(ch==='\''||ch==='"'||ch==='`'){quote=ch;continue;}if(ch==='{')depth++;if(ch==='}'&&--depth===0)return app.slice(start,i+1);}
  throw Error(`unterminated ${name}`);
}
class Node{
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.listeners={};this.attributes={};this.open=false;this.hidden=false;this.disabled=false;this.value='';this.className='';this._text='';}
  set textContent(value){this._text=String(value??'');if(!this._text)this.children=[];}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  appendChild(child){this.children.push(child);return child;}
  append(...children){children.forEach(child=>this.appendChild(child));}
  replaceChildren(...children){this.children=[];this._text='';children.forEach(child=>this.appendChild(child));}
  addEventListener(type,callback){(this.listeners[type]||=[]).push(callback);}
  dispatch(type){for(const listener of this.listeners[type]||[])listener({type,target:this,currentTarget:this});}
  setAttribute(name,value){this.attributes[name]=String(value);}
}
function findAll(root,predicate){return [root,...root.children.flatMap(child=>findAll(child,predicate))].filter(predicate);}

function partyHarness(){
  const mon={uid:'pika-unique',图鉴编号:25,昵称:'皮卡丘',等级:18,当前HP:32,最大HP:45,状态:'par',闪光:true,携带道具:'oranberry',经验:5832,性格:'Jolly',特性:'static',能力值:{hp:45,atk:30,def:20,spa:35,spd:25,spe:40},个体值:{hp:20,atk:21,def:22,spa:23,spd:24,spe:25},努力值:{hp:0,atk:4,def:0,spa:0,spd:0,spe:6},招式:[{id:'thunderbolt',PP:15,PP上限:15}]};
  const state={world:{队伍:[mon]},busy:false,partyDisclosure:{},types:{Electric:'电'},dex:{abilityNames:{static:'静电'},natureNames:{jolly:'爽朗'}},cosmetics:{equipped:{伙伴:{'pika-unique':{move:'kfx-003'}}},inventory:[{id:'kfx-003',name:'霹雳弧光'}]}};
  const document={createElement:tag=>new Node(tag)};
  const context={document,state,els:{team:new Node('div')},getParty:()=>state.world.队伍,dexId:entry=>entry.图鉴编号,speciesById:id=>({name:'皮卡丘',types:['Electric']}),first:(object,keys,fallback)=>{for(const key of keys)if(object?.[key]!==undefined&&object[key]!==null)return object[key];return fallback;},isShiny:entry=>entry.闪光===true,artworkUrl:id=>`art/${id}.png`,assetUrl:id=>`sprite/${id}`,normalizeLookup:value=>String(value||'').toLowerCase(),typeName:type=>state.types[type]||type, statusNames:{par:'麻痹'},statList:[['hp','HP'],['atk','攻'],['def','防'],['spa','特攻'],['spd','特防'],['spe','速']],moveById:id=>({name:id==='thunderbolt'?'十万伏特':id}),itemName:id=>id==='oranberry'?'橙橙果':id,renderCompanionBond:()=>{const d=new Node('details');d.className='companion-bond';const s=new Node('summary');s.textContent='羁绊';d.appendChild(s);return d;},renderMonManagement:()=>{const d=new Node('details');d.className='mon-management';const s=new Node('summary');s.textContent='管理';d.appendChild(s);return d;},canEditMvuRoster:()=>false,battleStatus:()=> 'finished',managePartyAction(){}};
  vm.runInNewContext(`${fn('learningMoveDetail')}\n${fn('renderParty')}\nglobalThis.renderParty=renderParty;`,context);
  return {context,mon};
}

test('party summary stays compact and its detailed stats, moves, companion panel and effects reopen by UID',()=>{
  const {context,mon}=partyHarness();context.renderParty();
  const card=context.els.team.children[0];assert.equal(card.tagName,'details');assert.equal(card.open,false);
  const summary=card.children[0],summaryText=summary.textContent;
  for(const text of ['皮卡丘','Lv. 18','电','HP 32/45','麻痹','闪光','橙橙果'])assert.ok(summaryText.includes(text),`summary includes ${text}`);
  assert.ok(!summaryText.includes('IV '));
  const content=card.children[1];for(const text of ['IV 20','EV 0','十万伏特','羁绊','管理','霹雳弧光'])assert.ok(content.textContent.includes(text),`expanded panel includes ${text}`);
  card.open=true;card.dispatch('toggle');assert.equal(context.state.partyDisclosure[mon.uid],true);
  context.renderParty();assert.equal(context.els.team.children[0].open,true,'a rerender preserves the disclosure for this UID');
});

test('bag groups use only actual stocked items, show counts, and remember section disclosure',()=>{
  const container=new Node('div'),keyItems=new Node('div'),state={bagDisclosure:{},world:{背包:{物品:{potion:2,pokeball:3,oranberry:1,tm06:1,pearl:0},关键物品:['自行车']}}};
  const definitions={potion:{id:'potion',name:'伤药',category:'medicine'},pokeball:{id:'pokeball',name:'精灵球',category:'ball'},oranberry:{id:'oranberry',name:'橙橙果',category:'held'},tm06:{id:'tm06',name:'TM06',category:'machine'}};
  const context={state,document:{createElement:tag=>new Node(tag)},els:{inventory:container,keyItems,potionCount:new Node('span'),ballCount:new Node('span')},renderQuestDeliveries(){},getBagItems:()=>state.world.背包.物品,normalizeItemList:items=>Object.entries(items),first:(object,keys,fallback)=>{for(const key of keys)if(object?.[key]!==undefined&&object[key]!==null)return object[key];return fallback;},safeNum:value=>Number(value)||0,itemDefinition:id=>definitions[id]||{},itemName:id=>definitions[id]?.name||id,itemCount:aliases=>state.world.背包.物品[aliases[0]]||0,machines:[],getParty:()=>[],battleStatus:()=> 'finished',state};
  context.itemDescription=(_id,def)=>def.description||'';
  vm.runInNewContext(`${fn('renderInventory')}\n${fn('renderStoredMail')}\n${fn('renderInventoryRow')}\nglobalThis.renderInventory=renderInventory;`,context);
  context.renderInventory();
  const groups=findAll(container,node=>node.className==='inventory-group');
  assert.deepEqual(groups.map(group=>group.children[0].textContent).sort(),['携带物 · 1 类 / 1 件','药品 · 1 类 / 2 件','学习机 · 1 类 / 1 件','精灵球 · 1 类 / 3 件'].sort());
  assert.ok(groups.every(group=>group.open===false));assert.ok(!container.textContent.includes('pearl'));
  const medicine=groups.find(group=>group.children[0].textContent.startsWith('药品'));medicine.open=true;medicine.dispatch('toggle');assert.equal(state.bagDisclosure.medicine,true);
  context.renderInventory();assert.ok(findAll(container,node=>node.className==='inventory-group').find(group=>group.children[0].textContent.startsWith('药品')).open);
  assert.match(keyItems.textContent,/关键道具 · 1 件/);assert.match(keyItems.textContent,/自行车/);
});

test('Kanto landform artwork sits under the existing clickable nodes at the same real 0–100 map coordinates',()=>{
  const html=fs.readFileSync(path.join(publicRoot,'index.html'),'utf8'),svg=fs.readFileSync(path.join(publicRoot,'assets/maps/kanto-region.svg'),'utf8'),map=JSON.parse(fs.readFileSync(path.join(publicRoot,'data/map.json'),'utf8'));
  assert.match(html,/class="map-art" src="\.\/assets\/maps\/kanto-region-painted-v1\.png"/);
  assert.match(svg,/<svg[^>]*viewBox="0 0 100 100"/);assert.match(svg,/id="mountains"/);assert.match(svg,/id="forest"/);assert.match(svg,/id="water-lines"/);assert.match(svg,/id="land"/);
  assert.match(app,/translate\(\$\{x\} \$\{y\}\)/);assert.match(app,/safeNum\(node\.x\)/);assert.match(app,/safeNum\(node\.y\)/);assert.match(app,/is-locked/);
  assert.ok(map.some(node=>node.id==='pallet'&&node.x===30&&node.y===88));assert.ok(map.some(node=>node.id==='cerulean'&&node.x===67&&node.y===34));
  assert.match(app,/regionArtwork.src=assetHref\('assets\/maps\/kanto-region-painted-v1\.png'\)/);assert.match(app,/regionArtwork.onerror/);assert.ok(fs.existsSync(path.join(publicRoot,'assets/maps/kanto-region-painted-v1.png')));
  assert.match(html,/当前位置/);assert.match(html,/未开放/);
});
