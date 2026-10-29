'use strict';
const {Dex,catalog}=require('./engine.cjs');
const KEYS=['hp','atk','def','spa','spd','spe'];
const labels={hp:['HP','体力','生命'],atk:['物攻','攻击','Atk'],def:['物防','防御','Def'],spa:['特攻','特殊攻击','SpA'],spd:['特防','特殊防御','SpD'],spe:['速度','速','Spe']};
const aliases=Object.entries(labels).flatMap(([key,names])=>names.map(name=>({key,name}))).sort((a,b)=>b.name.length-a.name.length);
const statPattern=aliases.map(item=>item.name).join('|');
function validateOptions(options={}){
 if(!options||typeof options!=='object'||Array.isArray(options))throw Error('初始伙伴设定无效。');
 const next={};
 if(options.shiny!==undefined){if(typeof options.shiny!=='boolean')throw Error('闪光设定须为布尔值。');next.shiny=options.shiny;}
 if(options.nature!==undefined){const nature=Dex.natures.get(options.nature);if(!nature.exists)throw Error('未知的宝可梦性格。');next.nature=nature.name;}
 if(options.ivs!==undefined){
  if(!options.ivs||typeof options.ivs!=='object'||Array.isArray(options.ivs))throw Error('个体值设定无效。');
  next.ivs={};for(const [key,value] of Object.entries(options.ivs)){
   if(!KEYS.includes(key)||!Number.isInteger(value)||value<0||value>31)throw Error('个体值须为0—31整数。');next.ivs[key]=value;
  }
 }
 return next;
}
function parseOptions(input){
 const text=String(input||''),options={};
 if(/闪光|异色|shiny/i.test(text))options.shiny=!/不(?:是|要)?闪光|非闪光|不是异色|非异色|not shiny/i.test(text);
 const natures=Object.entries(catalog.natureNames).filter(([id,label])=>new RegExp('(?:'+label+'\\s*性格|性格\\s*(?:为|是|[:：])?\\s*'+label+'|\\b'+id+'\\b)','i').test(text));
 if(natures.length>1)throw Error('初始伙伴只能指定一种性格。');
 if(!natures.length&&/性格/.test(text))throw Error('没有识别到所写的性格，请使用天真、固执、爽朗等性格名称。');
 if(natures.length)options.nature=Dex.natures.get(natures[0][0]).name;
 if(/个体值|IVs?|[6六]V/iu.test(text)){
  const ivs={};
  const grouped=new RegExp('((?:(?:'+statPattern+')[、，,\\/\\s及和与]*)+)(?:的?个体值|IVs?)?\\s*(?:均为|都是|全部|各为|为|是|都|均|[:：=])*\\s*(\\d{1,3})(?![\\d.])','giu');
  for(const match of text.matchAll(grouped)){
   const value=Number(match[2]);if(value>31)throw Error('个体值须为0—31整数。');
   const attrs=match[1].match(new RegExp(statPattern,'giu'))||[];
   for(const attr of attrs){const key=aliases.find(item=>item.name.toLowerCase()===attr.toLowerCase()).key;if(ivs[key]!==undefined&&ivs[key]!==value)throw Error('同一项个体值不能指定两个数值。');ivs[key]=value;}
  }
  if(!Object.keys(ivs).length){
   const all=/[6六]\s*V/iu.test(text)?31:Number(/(?:个体值|IVs?)\s*(?:全|全部|六项|均|都|为|是|[:：=]|\s)*(\d{1,3})(?![\d.])/iu.exec(text)?.[1]);
   if(!Number.isInteger(all)||all<0||all>31)throw Error('请写明个体值项目与0—31的数值。');
   for(const key of KEYS)ivs[key]=all;
  }
  options.ivs=ivs;
 }
 return validateOptions(options);
}
function parseChoice(input){
 if(typeof input!=='string')return null;
 const text=input.trim();
 if(/[“”「」『』"']|不选|不要|不想|还没|取消|如果|假如|以后|曾经|听说|他说|她说/.test(text))return null;
 const choices=[[1,'妙蛙种子'],[4,'小火龙'],[7,'杰尼龟']].filter(([,name])=>text.includes(name));
 if(choices.length!==1||!(text===choices[0][1]||/(?:选择|想选|就选|决定选|我选|我要|作为伙伴|成为.*伙伴)/.test(text)))return null;
 return {id:choices[0][0],options:parseOptions(text)};
}
module.exports={parseChoice,parseOptions,validateOptions};
