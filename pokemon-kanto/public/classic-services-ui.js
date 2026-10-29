(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const render = (container, {view, world, busy = false} = {}, onAction) => {
    if (!container || !view) return;
    const v = view.classicServices || view.classic || view;
    const service = v.classicServices || v;
    const available=service.availability||{trades:false,daycare:false,slots:false,tutor:false};
    const ready = (service.actions || []).filter(a => a.enabled);
    const tradeRows = (service.trades || []).map(t => `<li><strong>${esc(t.nickname)}</strong> · ${esc(t.label||`${t.speciesName||'宝可梦'}（No.${t.species}） ⇄ ${t.requestedName||'所需精灵'}（No.${t.requested}）`)} ${t.available ? '<span class="classic-ready">可交换</span>' : '<span class="classic-muted">'+esc(t.reason||'缺少交换对象')+'</span>'}</li>`).join('');
    const eggs = (service.daycare?.eggs || []).map(e => `<li><span class="classic-egg">🥚</span> #${e.species} · ${e.ready ? '<span class="classic-ready">已可孵化</span>' : `还需 ${e.turnsLeft} 轮剧情`}</li>`).join('') || '<li class="classic-muted">目前没有蛋</li>';
    const parentText = (service.daycare?.parents || []).map(p => `${esc(p.name)} #${p.species} · ${p.gender === 'female' ? '♀' : p.gender === 'male' ? '♂' : '无性别'} · ${esc(p.uid)}`).join('、') || '无人托管';
    const receipts = (service.transactions || []).slice(-5).reverse().map(r => {
      const d = r.detail || {};
      if (d.trade) return `<li>完成NPC交换：${esc(d.trade)}</li>`;
      if (d.deposit) return `<li>寄存了 ${esc(d.deposit)}</li>`;
      if (d.withdraw) return `<li>领回了 ${esc(d.withdraw)}</li>`;
      if (d.hatched) return `<li>孵化了 ${d.hatched.length} 枚蛋</li>`;
      if (d.stop && d.result) return `<li>${d.result === 'win' ? `中奖 ${d.payout} 枚代币` : '这一局没有中奖'} · 转轮 ${esc(d.reels.join(' / '))}</li>`;
      if (d.start) return `<li>开始下注 ${d.bet} 枚代币</li>`;
      if (d.uid && d.move) return `<li>${esc(d.uid)} 学会了 ${esc(d.move==='counter'?'双倍奉还':d.move)}</li>`;
      return `<li>${esc(r.action)}</li>`;
    }).join('') || '<li class="classic-muted">还没有操作记录</li>';
    const reels = service.slots?.active?.reels || [];
    const reelMarkup = reels.length ? `<div class="classic-reels" aria-label="老虎机转轮">${reels.map((r,i)=>`<span class="classic-reel ${r===null?'is-spinning':''}" aria-label="第${i+1}轴">${r===null?'◆':esc(r)}</span>`).join('')}</div><p class="classic-muted">下注 ${service.slots.active.bet} 枚 · 逐轴停止</p>` : '';
    container.innerHTML = `<section class="classic-services" aria-label="关都经典设施">
      <header><div><h2>经典设施</h2><p>来访记录会保存在冒险进度中。</p></div><span class="classic-coins">🎟 ${service.slots?.coins ?? 0} 枚代币</span></header>
      <div class="classic-service-grid">
        <article class="classic-card" ${available.trades?'':'hidden'}><h3>训练家交换</h3><p>交换条件要求完全匹配图鉴编号。</p><ul>${tradeRows || '<li>暂无原版交换</li>'}</ul></article>
        <article class="classic-card" ${available.daycare?'':'hidden'}><h3>宝可梦培育屋</h3><p>${service.daycare?.mode === 'double' ? '双亲培育屋 · 五岛分部扩展' : '单亲托管 · 火红叶绿关都设施'}</p><p>培育进度：${service.daycare?.turns ?? 0} 个故事轮 · ${service.daycare?.compatible ? '寄存的宝可梦相容，可培育蛋' : '目前没有可培育的配对'}</p><p class="classic-muted">每个不同的剧情轮数推进一次；重复读取、设施操作或同轮多场战斗不会推进。</p><p>托管：${parentText}</p><ul>${eggs}</ul></article>
        <article class="classic-card" ${available.slots?'':'hidden'}><h3>玉虹游戏厅老虎机</h3><p>只使用游戏内代币；下注后依次停下三轴。</p>${reelMarkup || '<p class="classic-muted">选择下注开始一局。</p>'}</article>
        <article class="classic-card" ${available.tutor?'':'hidden'}><h3>百货大厦 3F 导师</h3><p>双倍奉还只可教授一次；先选择兼容的宝可梦。</p><p>${service.tutor?.used ? '导师已完成授课。' : '导师尚未授课。'}</p></article>
      </div>
      <div class="classic-card classic-receipt-card"><h3>近期记录</h3><ul>${receipts}</ul></div>
      <div class="classic-action-bar"><label for="classic-action-select">可用操作</label><select id="classic-action-select" ${busy || !ready.length ? 'disabled' : ''}>${ready.length ? ready.map((a,i)=>`<option value="${i}">${esc(a.label)}</option>`).join('') : '<option>当前没有可进行的操作</option>'}</select><div data-classic-replace hidden><label for="classic-replace-slot">替换招式</label><select id="classic-replace-slot"></select></div><button type="button" data-classic-submit ${busy || !ready.length ? 'disabled' : ''}>确认操作</button></div>
      <p class="classic-feedback" aria-live="polite">${busy ? '处理中…' : ''}</p>
    </section>`;
    const submit = container.querySelector('[data-classic-submit]');
    const actionPicker = container.querySelector('#classic-action-select');
    const replacePicker = container.querySelector('[data-classic-replace]');
    const syncReplace = () => {
      const action = ready[Number(actionPicker?.value)];
      const choices = action?.payload?.replaceMoves || [];
      if (!replacePicker) return;
      replacePicker.hidden = !choices.length;
      replacePicker.querySelector('select').innerHTML = choices.map(move => `<option value="${move.index}">${esc(move.name||move.id)}</option>`).join('');
    };
    actionPicker?.addEventListener('change', syncReplace);
    syncReplace();
    submit?.addEventListener('click', () => {
      const index = Number(actionPicker?.value);
      const action = ready[index];
      if (!action || typeof onAction !== 'function' || busy) return;
      const feedback = container.querySelector('.classic-feedback');
      if (action.id.startsWith('classic-trade-')) {
        const okay = globalThis.confirm?.(`确定以符合条件的宝可梦交换成 ${action.label.replace(/^交换：/, '')}？`);
        if (!okay) return;
      }
      feedback.textContent = action.id.startsWith('classic-slot-stop') ? '转轮停止中…' : '正在记录操作…';
      const payload = {...(action.payload || {})};
      if (payload.replaceMoves?.length) payload.replaceIndex = Number(container.querySelector('#classic-replace-slot')?.value);
      delete payload.replaceMoves;
      onAction(action.id, payload);
    });
  };
  globalThis.KantoClassicServices = {render};
})();
