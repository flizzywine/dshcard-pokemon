(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function render(commandsContainer,{snapshot,busy=false,onSubmit}={}){
    if(!commandsContainer||!snapshot)return;
    const commands=snapshot.request?.activeCommands||[],switches=snapshot.request?.switches||[],forced=snapshot.request?.forceSwitchSlots||commands.map(c=>c.forceSwitch),party=snapshot.sides?.[0]?.team||[],battleItems=snapshot.battleItems||[];
    const targetOptions=party.map((mon,index)=>`<option value="${index+1}">${esc(mon.name)} #${index+1} · ${esc(mon.hp)}/${esc(mon.maxhp)} HP${mon.fainted?' · 倒下':mon.active?' · 上场':''}</option>`).join('');
    commandsContainer.innerHTML=`<section class="doubles-commands" aria-label="双打指令"><header><h2>双打指令</h2><p>为两只上场伙伴选好行动，再一次提交。</p></header><div class="doubles-actors">${commands.map((actor,index)=>{
      const force=!!forced[actor.actorSlot]||!!actor.forceSwitch,moveOptions=actor.moves||[],validMoves=moveOptions.filter(m=>!m.disabled&&m.pp!==0),options=validMoves.length?validMoves:moveOptions.slice(0,1);
      return `<article class="doubles-actor" data-actor="${actor.actorSlot}" data-force="${force}"><h3><span>${index+1}</span>${esc(actor.name||`上场伙伴${index+1}`)}</h3>${force?'<p class="doubles-required">需要替换倒下的伙伴</p>':`<label>行动<select data-action ${busy?'disabled':''}><option value="move">使用招式</option><option value="switch">换下场</option>${battleItems.length?'<option value="item">使用战斗药品</option>':''}</select></label><label data-move-label>招式<select data-move-slot ${busy?'disabled':''}>${options.map(m=>`<option value="${m.slot}">${esc(m.name||m.id)} · PP ${m.pp??'?'}/${m.maxpp??'?'}</option>`).join('')||'<option value="1">挣扎</option>'}</select></label><label data-target-label>目标<select data-target ${busy?'disabled':''}></select></label><label data-item-label hidden>药品<select data-item ${busy?'disabled':''}>${battleItems.map(item=>`<option value="${esc(item.id)}">${esc(item.name)} ×${item.count}</option>`).join('')}</select></label><label data-item-target-label hidden>使用对象<select data-item-target ${busy?'disabled':''}>${targetOptions}</select></label><label data-item-move-label hidden>恢复招式<select data-item-move ${busy?'disabled':''}></select></label>`}<label data-switch-label ${force?'':'hidden'}>换入伙伴<select data-switch ${busy?'disabled':''}><option value="">选择替补</option>${switches.filter(p=>!p.active&&!p.fainted&&p.hp>0).map(p=>`<option value="${p.slot}">${esc(p.name)} #${p.id} · ${esc(p.hp)}/${p.maxhp} HP</option>`).join('')}</select></label></article>`;
    }).join('')}</div><button type="button" data-submit ${busy||commands.length!==2?'disabled':''}>提交双打指令</button><p class="doubles-feedback" aria-live="polite"></p></section>`;
    const actors=[...commandsContainer.querySelectorAll('.doubles-actor')];
    const sync=()=>{
      const chosen=new Set();let valid=true;
      for(const card of actors){
        const actorSlot=Number(card.dataset.actor),force=card.dataset.force==='true',action=card.querySelector('[data-action]')?.value||'move',switchLabel=card.querySelector('[data-switch-label]');
        if(force||action==='switch'){
          switchLabel.hidden=false;if(!force)card.querySelector('[data-move-label]').hidden=true;
          for(const label of card.querySelectorAll('[data-item-label],[data-item-target-label],[data-item-move-label]'))label.hidden=true;
          const pick=card.querySelector('[data-switch]'),slot=pick.value;pick.querySelectorAll('option').forEach(option=>{if(option.value)option.disabled=chosen.has(option.value);});
          if(slot){if(chosen.has(slot))valid=false;chosen.add(slot);}else valid=false;
        }else if(action==='item'){
          switchLabel.hidden=true;card.querySelector('[data-move-label]').hidden=true;card.querySelector('[data-target-label]').hidden=true;
          const itemSelect=card.querySelector('[data-item]'),targetSelect=card.querySelector('[data-item-target]'),moveSelect=card.querySelector('[data-item-move]'),item=battleItems.find(entry=>entry.id===itemSelect.value),target=party[Number(targetSelect.value)-1];
          card.querySelector('[data-item-label]').hidden=false;card.querySelector('[data-item-target-label]').hidden=false;
          const needsMove=!!item&&item.pp!==null&&!item.allMoves;card.querySelector('[data-item-move-label]').hidden=!needsMove;
          if(needsMove&&target){const previous=moveSelect.value;moveSelect.innerHTML=(target.moves||[]).map((move,index)=>`<option value="${index+1}" ${move.pp>=move.maxpp?'disabled':''}>${esc(move.id)} · PP ${move.pp}/${move.maxpp}</option>`).join('');if([...moveSelect.options].some(option=>option.value===previous&&!option.disabled))moveSelect.value=previous;}
          if(!item||!target)valid=false;
          else{
            if(needsMove&&(!target.moves?.some(move=>move.pp<move.maxpp)||!moveSelect.value))valid=false;
            if(item.heal&&target.hp>=target.maxhp&&!item.status?.includes(target.status))valid=false;
            if(item.revive&&(!target.fainted||target.hp>0))valid=false;
            if(!item.revive&&target.fainted&&item.pp===null)valid=false;
            if(item.status?.length&&!item.status.includes(target.status)&&!item.heal)valid=false;
          }
        }else{
          switchLabel.hidden=true;card.querySelector('[data-move-label]').hidden=false;
          for(const label of card.querySelectorAll('[data-item-label],[data-item-target-label],[data-item-move-label]'))label.hidden=true;
          const moveSlot=Number(card.querySelector('[data-move-slot]').value),move=(commands.find(c=>c.actorSlot===actorSlot)?.moves||[]).find(m=>m.slot===moveSlot),targetSelect=card.querySelector('[data-target]'),targetLabel=card.querySelector('[data-target-label]'),targets=move?.targets||[];
          targetLabel.hidden=!targets.length;const previous=targetSelect.value;targetSelect.innerHTML=targets.map(t=>`<option value="${t.loc}">${t.side==='ally'?'伙伴':'对手'} · ${esc(t.name)}${t.uid?` · ${esc(t.uid)}`:''}</option>`).join('');if(targets.some(t=>String(t.loc)===previous))targetSelect.value=previous;
          if(targets.length&&!targetSelect.value)valid=false;
        }
      }
      commandsContainer.querySelector('[data-submit]').disabled=busy||!valid||commands.length!==2;
    };
    commandsContainer.addEventListener('change',sync);sync();
    commandsContainer.querySelector('[data-submit]')?.addEventListener('click',()=>{
      if(busy||typeof onSubmit!=='function')return;const parts=[];
      for(const card of actors){
        const force=card.dataset.force==='true',action=card.querySelector('[data-action]')?.value||'move';
        if(force||action==='switch')parts.push(`switch ${card.querySelector('[data-switch]').value}`);
        else if(action==='item'){const target=card.querySelector('[data-item-target]').value,move=card.querySelector('[data-item-move-label]').hidden?'':` ${card.querySelector('[data-item-move]').value}`;parts.push(`item ${card.querySelector('[data-item]').value} ${target}${move}`);}
        else{const slot=Number(card.querySelector('[data-move-slot]').value),target=card.querySelector('[data-target]')?.value;parts.push(`move ${slot}${target?` ${Number(target)>0?'+':''}${target}`:''}`);}
      }
      if(parts.length!==2||parts.some(part=>part.endsWith('undefined')))return;
      commandsContainer.querySelector('.doubles-feedback').textContent='正在提交两位伙伴的行动…';onSubmit(parts.join(', '));
    });
  }
  globalThis.KantoDoubles={render};
})();
