'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

class Element {
 constructor(tagName,doc){this.tagName=tagName.toUpperCase();this.ownerDocument=doc;this.children=[];this.listeners={};this.dataset={};this.style={};this.textContent='';this.disabled=false;this.clientWidth=600;this.clientHeight=360;}
 append(...nodes){for(const node of nodes){this.children.push(node);node.parent=this;}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}
 setAttribute(name,value){this[name]=value;}
 focus(){this.ownerDocument.activeElement=this;for(const fn of this.listeners.focus||[])fn();}
 click(){if(this.disabled)return;for(const fn of this.listeners.click||[])fn({preventDefault(){}});}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(item=>item!==this);}
 getContext(){return this.context||=(this.tagName==='CANVAS'?{
  fillRect(){},fillText(){},beginPath(){},arc(){},fill(){},stroke(){},drawImage(){},createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}},putImageData(){},getImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}},
 }:null);}
 querySelectorAll(selector){const found=[];const visit=node=>{for(const child of node.children||[]){if(selector==='button'&&child.tagName==='BUTTON')found.push(child);visit(child);}};visit(this);return found;}
 closest(selector){return selector==='details'?this.details||this.parent?.closest?.(selector)||null:null;}
}

function createUi(){
 const doc={activeElement:null,createElement(tag){return new Element(tag,this);}};
 const sandbox={document:doc};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/tile-world-ui.js'),'utf8'),sandbox);
 return {doc,ui:sandbox.KantoTileWorld};
}

function sampleView(revision=9){return {mapId:'MAP_ROUTE12',name:'Route12',width:2,height:2,tiles:[0,0,0,0],collision:[0,0,0,0],position:{x:0,y:0},tilesets:{},revision,availableActions:['move','interact','pushBoulder','useDoor','returnArea'],interactables:[]};}

test('tile-world controls submit current revisions, use Chinese labels, and return to the app area panel',()=>{
 const {doc,ui}=createUi(),container=doc.createElement('div'),details=doc.createElement('details'),calls=[];
 details.open=true;container.details=details;
 ui.render(container,sampleView(),{onAction:(action,payload)=>calls.push({action,payload})});
 const buttons=container.querySelectorAll('button'),find=key=>buttons.find(button=>button.dataset.ktwFocus===key);
 assert.equal(buttons.find(button=>button.dataset.ktwFocus==='return-area').textContent,'返回区域地图');
 assert.equal(container.children[0].children[0].children[0].textContent,'12号道路');
 assert.equal(container.querySelectorAll('button').some(button=>/Area map|Move:|Interact:|Doors:/.test(button.textContent)),false);
 find('move-left').click();find('interact').click();find('use-door').click();find('push-boulder').click();
 assert.deepEqual(calls.map(call=>call.action),['move','interact','useDoor','pushBoulder']);
 assert.ok(calls.every(call=>call.payload.expectedRevision===9),'every button action carries the revision the view was rendered from');
 find('return-area').click();assert.equal(details.open,false,'the exit closes the existing app disclosure instead of sending a no-op world action');
 assert.equal(calls.length,4);
});

test('rerender after a step restores focus to the same movement control',()=>{
 const {doc,ui}=createUi(),container=doc.createElement('div'),calls=[];
 ui.render(container,sampleView(4),{onAction:(action,payload)=>calls.push({action,payload})});
 container.querySelectorAll('button').find(button=>button.dataset.ktwFocus==='move-right').click();
 ui.render(container,sampleView(5),{onAction:(action,payload)=>calls.push({action,payload})});
 const focused=doc.activeElement;
 assert.equal(focused.dataset.ktwFocus,'move-right');
 assert.equal(calls[0].payload.expectedRevision,4);
});
