'use strict';
function sameModel(a,b){return !!a&&!!b&&a.provider===b.provider&&a.model===b.model;}
async function modelOptions(T,gameId){
 const groups=typeof T.taskModels==='function'?await T.taskModels({gameId}):[];
 const current=typeof T.backgroundModel==='function'?await T.backgroundModel({gameId}):null;
 return {available:typeof T.taskModels==='function',groups:(Array.isArray(groups)?groups:[]).map(g=>({provider:g.provider,providerName:g.providerName||g.provider,models:(g.models||[]).map(m=>({id:m.id,name:m.name||m.id}))})),current};
}
async function validateModel(T,gameId,value){
 if(value===null)return null;
 if(!value||typeof value!=='object'||typeof value.provider!=='string'||typeof value.model!=='string')throw Error('请选择有效的AI对手模型。');
 const catalog=await modelOptions(T,gameId);
 if(!catalog.available)throw Error('请安装当前版本的DSH兼容更新后再选择对手模型。');
 if(!catalog.groups.some(g=>g.provider===value.provider&&g.models.some(m=>m.id===value.model)))throw Error('所选模型已不可用，请刷新模型列表。');
 return {provider:value.provider,model:value.model};
}
module.exports={modelOptions,validateModel,sameModel};
