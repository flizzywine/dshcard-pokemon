'use strict';
const {createHash}=require('node:crypto');
const source=require('./public/data/frlg-held-items.json');
const data=source.species;
const supported=new Set([
 'oranberry','sitrusberry','rawstberry','moonstone','silverpowder','poisonbarb','sharpbeak',
 'tinymushroom','bigmushroom','nugget','twistedspoon','focusband','hardstone','magnet',
 'stick','spelltag','thickclub','metalpowder','luckyegg'
]);
function itemId(token){
 if(!token||token==='NONE')return null;
 const id=token.toLowerCase().replaceAll('_','');
 return supported.has(id)?id:null;
}
function generate(speciesId,uid){
 const entry=data[String(speciesId)];
 if(!entry||typeof uid!=='string')return '';
 const common=itemId(entry.common),rare=itemId(entry.rare);
 if(common&&common===rare)return common;
 const draw=createHash('sha256').update('frlg-wild-item:'+uid).digest().readUInt32BE(0)%100;
 if(draw<=44)return '';
 if(draw<=94)return common||'';
 return rare||'';
}
module.exports={generate,source,table:data};

