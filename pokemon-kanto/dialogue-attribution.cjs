'use strict';
// A conservative display fallback, never a change to prose or native cast data.
const trainers=require('./public/data/trainers.json');
const aliases=trainers.flatMap(entry=>[entry.name,...(entry.aliases||[])].filter(name=>typeof name==='string'&&name.length>=2).map(name=>({name,speaker:entry.name,image:entry.image,id:entry.id}))).sort((a,b)=>b.name.length-a.name.length);
function attributions(raw,{oakContext=false}={}){
 const text=String(raw||'').slice(0,200000).replace(/<(initvar|UpdateVariable|script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/```[\s\S]*?```/g,'');
 const known=oakContext?[{name:'博士',speaker:'大木博士',image:trainers.find(t=>t.id==='oak')?.image,id:'oak'},...aliases]:aliases;
 const candidates=segment=>known.flatMap(entry=>{const index=segment.lastIndexOf(entry.name);return index<0?[]:[{...entry,index,end:index+entry.name.length}];}).sort((a,b)=>b.end-a.end||b.name.length-a.name.length);
 const lines=[];let previousSpeaker=null,lastQuoteEnd=0,n=0;
 for(const match of text.matchAll(/“([^”\r\n]+)”|「([^」\r\n]+)」|『([^』\r\n]+)』/g)){
  n++;const quote=match.slice(1).find(v=>v!==undefined)?.trim();if(!quote)continue;
  const start=match.index,end=start+match[0].length,paragraphStart=text.lastIndexOf('\n',start-1)+1,nextBreak=text.indexOf('\n',end);
  const before=text.slice(paragraphStart,start),after=text.slice(end,nextBreak<0?Math.min(text.length,end+90):nextBreak).slice(0,90);
  let person=null;
  const leading=candidates(after.slice(0,35)).find(p=>/^[\s，,。.!！?？]*$/.test(after.slice(0,p.index))&&p.index<5);
  if(leading)person=leading;
  if(!person){
   const prefix=before.slice(-100),named=candidates(prefix);
   person=named.find(p=>{const suffix=prefix.slice(p.end);return /[：:]\s*$/.test(suffix)&&suffix.length<35 || /^(?:[，,]?[^“”「」]{0,22})?(?:说|问|答|道|喃喃|嘀咕|解释|提醒|开口)[^“”「」]{0,12}$/.test(suffix);})||null;
  }
  if(!person){
   // An explicit named subject in the immediately preceding narration may own
   // a following pronoun-led quote, but a different named speaker breaks it.
   const between=text.slice(lastQuoteEnd,start),paragraphs=between.split(/\n+/).map(s=>s.trim()).filter(Boolean),prior=paragraphs.at(-1)||'';
   const subject=candidates(prior).find(p=>p.index<3);
   if(subject&&/^(?:他|她|[，,。.!！?？\s])/.test(after))person=subject;
   else if(previousSpeaker&&/^\s*[，,。.!！?？]?\s*(?:他|她)(?:说|问|答|道|笑|站|抬|低|看|转|点)/.test(after)&&!candidates(before).length)person=previousSpeaker;
  }
  if(person){lines.push({n,quote,speaker:person.speaker,emotion:'neutral',image:person.image||''});previousSpeaker=person;}else previousSpeaker=null;
  lastQuoteEnd=end;
  if(n>=400)break;
 }
 return lines;
}
module.exports={attributions};
