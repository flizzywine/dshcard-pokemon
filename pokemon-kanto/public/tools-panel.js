(() => {
  'use strict';

  const states = new WeakMap();
  const clampText = value => String(value ?? '');
  const asArray = value => Array.isArray(value) ? value : [];

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = clampText(text);
    return node;
  }
  function button(label, className, onClick, {disabled = false, expanded, focusKey} = {}) {
    const node = element('button', className, label); node.type = 'button'; node.disabled = disabled;
    if (expanded !== undefined) node.setAttribute('aria-expanded', String(expanded));
    if (focusKey) node.dataset.focusKey = focusKey;
    node.addEventListener('click', onClick); return node;
  }
  function stateFor(container) {
    if (!states.has(container)) states.set(container, {
      expanded: { capabilities: true, experience: true, terminal: true, camp: true, ecology: true, 'bond-history': false, 'league-history': false },
      draft: null, filterType: '', pending: false, error: '', notice: '', last: null,
    });
    return states.get(container);
  }
  function unlockedIds(tools, gadgets) {
    const ids = new Set(asArray(tools?.unlocked).map(String));
    for (const item of asArray(tools?.gadgets)) if (item?.unlocked !== false && item?.id) ids.add(item.id);
    for (const item of asArray(gadgets?.gadgets)) if (item?.unlocked !== false && item?.id) ids.add(item.id);
    return ids;
  }
  function allGadgets(tools, gadgets) {
    const rows = asArray(gadgets?.availableGadgets).length ? gadgets.availableGadgets
      : asArray(gadgets?.gadgets).length ? gadgets.gadgets : asArray(tools?.gadgets);
    const byId = new Map();
    for (const item of rows) if (item?.id) byId.set(item.id, item);
    return [...byId.values()];
  }
  function moveLabel(id, fallback, hooks) {
    try { return typeof hooks.moveName === 'function' ? hooks.moveName(id) || fallback || id : fallback || id; }
    catch { return fallback || id; }
  }
  function addOptions(select, rows, valueKey, labelFor, selected, disabledFor) {
    for (const row of rows) {
      const option = element('option', '', labelFor(row));
      option.value = clampText(valueKey(row)); option.selected = clampText(selected) === option.value;
      option.disabled = !!disabledFor?.(row); select.appendChild(option);
    }
  }
  function makeSelect(labelText, key, options, stateValue, onChange, className = 'ktools-select') {
    const wrap = element('label', 'ktools-field'); wrap.appendChild(element('span', 'ktools-label', labelText));
    const select = element('select', className); select.dataset.focusKey = key; select.setAttribute('aria-label', labelText);
    const placeholder = element('option', '', options.length ? '请选择' : '暂无可选项'); placeholder.value = ''; placeholder.disabled = true;
    select.appendChild(placeholder); select.value = stateValue || '';
    select.addEventListener('change', event => onChange(event.target.value));
    wrap.appendChild(select); return { wrap, select };
  }
  function section(container, state, id, title, subtitle, content) {
    const card = element('section', `ktools-section ktools-${id}`);
    const opened = state.expanded[id] !== false;
    const head = button('', 'ktools-section-toggle', () => {
      state.expanded[id] = !opened;
      rerenderPreservingFocus(container);
    }, { expanded: opened, focusKey: `section-${id}` });
    const labels = element('span', 'ktools-section-heading');
    labels.appendChild(element('strong', '', title));
    if (subtitle) labels.appendChild(element('small', '', subtitle));
    head.appendChild(labels);
    const marker = element('span', 'ktools-chevron', opened ? '收起' : '展开'); marker.setAttribute('aria-hidden', 'true'); head.appendChild(marker);
    card.appendChild(head);
    const body = element('div', 'ktools-section-body'); body.hidden = !opened;
    if (content) body.appendChild(content);
    card.appendChild(body); return card;
  }
  function rerender(container) {
    const state = states.get(container);
    if (state?.last) render(container, state.last.data, state.last.hooks);
  }
  function rememberFocus(container) {
    const active = document.activeElement;
    if (!active || !container.contains(active) || !active.dataset?.focusKey) return null;
    return { key: active.dataset.focusKey, start: active.selectionStart, end: active.selectionEnd };
  }
  function restoreFocus(container, focus) {
    if (!focus) return;
    const found = [...container.querySelectorAll('[data-focus-key]')].find(node => node.dataset.focusKey === focus.key);
    if (!found) return;
    found.focus();
    if (Number.isInteger(focus.start) && typeof found.setSelectionRange === 'function') {
      try { found.setSelectionRange(focus.start, focus.end); } catch { /* select controls do not expose a text range */ }
    }
  }
  function rerenderPreservingFocus(container) {
    const focus = rememberFocus(container); rerender(container); restoreFocus(container, focus);
  }
  function setDraft(state, draft) { state.draft = draft; state.error = ''; state.notice = ''; }
  function clearDraft(state) { state.draft = null; state.error = ''; state.notice = ''; }
  function report(container, state, error) {
    state.pending = false; state.error = error?.message || String(error || '操作失败，请检查条件后重试。'); state.notice = '';
    rerender(container);
  }
  async function invoke(container, state, hook, args, actionLabel) {
    if (state.pending || state.last?.data?.busy) return;
    state.pending = true; state.error = ''; state.notice = '';
    rerender(container);
    try {
      if (typeof hook !== 'function') throw new Error('当前面板尚未连接原生操作。');
      await hook(...args);
      state.pending = false; state.error = ''; state.notice = `${actionLabel}已提交。`;
      if (args[0] === 'gadget-recall' || args[0] === 'gadget-machine') state.draft = null;
      rerender(container);
    } catch (error) { report(container, state, error); }
  }
  function selectedAction(data, state) {
    if (!state.draft) return null;
    const tools = data.tools || {}, terminal = tools.terminal || {}, world = data.world || {};
    const team = asArray(world.队伍);
    const uid = state.draft.uid;
    const mon = team.find(item => item.uid === uid);
    if (!mon) return null;
    if (state.draft.kind === 'recall') {
      const record = asArray(terminal.levelMoves).find(item => item.uid === uid);
      const move = asArray(record?.moves).find(item => item.id === state.draft.moveId);
      return move ? { kind: 'recall', mon, move } : null;
    }
    const machine = asArray(terminal.machines).find(item => item.id === state.draft.itemId);
    const learner = asArray(machine?.learners).find(item => item.uid === uid && !item.knowsMove);
    return machine && learner ? { kind: 'machine', mon, machine, learner } : null;
  }
  function movesForMon(mon) { return asArray(mon?.招式); }
  function slotRows(mon) {
    const moves = movesForMon(mon), rows = moves.length < 4 ? [{ id: 'append', label: `追加为第${moves.length + 1}招` }] : [];
    moves.forEach((move, index) => rows.push({ id: String(index + 1), label: `${index + 1}. ${move.name || move.id}`, hm: !!move.秘传 || /^hm\d+$/i.test(move.id || '') }));
    return rows;
  }
  function formFor(container, state, data, hooks, mode) {
    const tools = data.tools || {}, terminal = tools.terminal || {}, world = data.world || {};
    const allMembers = asArray(world.队伍);
    const members = mode === 'recall'
      ? asArray(terminal.levelMoves).filter(record => asArray(record.moves).length)
      : asArray(terminal.machines).flatMap(machine => asArray(machine.learners).filter(person => !person.knowsMove).map(person => ({ uid: person.uid, name: person.name, machineId: machine.id })));
    if (state.draft?.kind !== mode || !members.some(item => item.uid === state.draft?.uid)) {
      state.draft = { kind: mode, uid: members[0]?.uid || '', moveId: '', itemId: mode === 'machine' ? members[0]?.machineId || '' : '', slot: 'append' };
    }
    const availableMember = members.find(item => item.uid === state.draft.uid);
    const memberSelect = makeSelect('使用对象', `terminal-member-${mode}`, members,
      state.draft.uid, uid => {
        state.draft.uid = uid; state.draft.moveId = ''; state.draft.itemId = mode === 'machine' ? members.find(row => row.uid === uid)?.machineId || '' : ''; state.draft.slot = 'append';
        rerenderPreservingFocus(container);
      });
    addOptions(memberSelect.select, members, row => row.uid, row => row.name || allMembers.find(mon => mon.uid === row.uid)?.昵称 || row.uid, state.draft.uid);
    const fields = element('div', 'ktools-form-fields'); fields.appendChild(memberSelect.wrap);

    let selectedMove = null, selectedMachine = null;
    if (mode === 'recall') {
      const record = asArray(terminal.levelMoves).find(item => item.uid === state.draft.uid);
      const candidates = asArray(record?.moves);
      if (!candidates.some(row => row.id === state.draft.moveId)) state.draft.moveId = candidates[0]?.id || '';
      const moveSelect = makeSelect('合法升级招式', 'terminal-move-recall', candidates, state.draft.moveId, id => {
        state.draft.moveId = id; state.draft.slot = 'append'; rerenderPreservingFocus(container);
      });
      addOptions(moveSelect.select, candidates, row => row.id, row => `${moveLabel(row.id, row.name, hooks)} · Lv.${row.level}${row.queued ? ' · 待学' : ''}`, state.draft.moveId);
      fields.appendChild(moveSelect.wrap); selectedMove = candidates.find(row => row.id === state.draft.moveId);
    } else {
      const machines = asArray(terminal.machines).filter(machine => machine.learners.some(row => row.uid === state.draft.uid && !row.knowsMove));
      if (!machines.some(row => row.id === state.draft.itemId)) state.draft.itemId = machines[0]?.id || '';
      const machineSelect = makeSelect('兼容TM', 'terminal-machine', machines, state.draft.itemId, id => {
        state.draft.itemId = id; state.draft.slot = 'append'; rerenderPreservingFocus(container);
      });
      addOptions(machineSelect.select, machines, row => row.id, row => `${row.nameZh||row.name} · ${moveLabel(row.moveId, row.moveName, hooks)} · ×${row.count}`, state.draft.itemId);
      fields.appendChild(machineSelect.wrap); selectedMachine = machines.find(row => row.id === state.draft.itemId);
    }
    const mon = allMembers.find(item => item.uid === state.draft.uid);
    const slots = mon ? slotRows(mon) : [];
    const validSlots = slots.filter(row => !row.hm);
    if (!validSlots.some(row => row.id === state.draft.slot)) state.draft.slot = validSlots[0]?.id || '';
    const slotSelect = makeSelect('处理招式位置', 'terminal-slot', slots, state.draft.slot, id => {
      state.draft.slot = id; rerenderPreservingFocus(container);
    });
    addOptions(slotSelect.select, slots, row => row.id, row => row.label, state.draft.slot, row => row.hm);
    fields.appendChild(slotSelect.wrap);

    const selected = selectedAction(data, state);
    const controls = element('div', 'ktools-form-controls');
    const confirm = button(mode === 'recall' ? '确认回忆' : '确认研修', 'ktools-primary', () => {
      const current = selectedAction(data, state);
      if (!current) { state.error = '请重新选择有效的宝可梦与招式。'; rerender(container); return; }
      const payload = { uid: current.mon.uid, slot: state.draft.slot === 'append' ? undefined : Number(state.draft.slot) };
      if (mode === 'recall') payload.move = current.move.id; else payload.item = current.machine.id;
      invoke(container, state, data.hooks?.onAction, [mode === 'recall' ? 'gadget-recall' : 'gadget-machine', payload], mode === 'recall' ? '招式回忆' : 'TM研修');
    }, { disabled: !!data.busy || state.pending || !terminal.recallUnlocked && mode === 'recall' || !selected || validSlots.length === 0, focusKey: `terminal-confirm-${mode}` });
    const cancel = button('取消', 'ktools-secondary', () => { clearDraft(state); rerenderPreservingFocus(container); }, { disabled: !!data.busy || state.pending, focusKey: `terminal-cancel-${mode}` });
    controls.append(confirm, cancel); fields.appendChild(controls);
    if (!members.length) fields.appendChild(element('p', 'ktools-empty-inline', mode === 'recall' ? '目前没有可回忆的升级招式。' : '目前没有已持有且兼容队伍成员的TM。'));
    if (mode === 'recall' && !terminal.recallUnlocked) fields.appendChild(element('p', 'ktools-lock-note', '回忆功能需要招式研修档案或招式记忆检索；可在任务中解锁。'));
    const card = element('div', 'ktools-terminal-form');
    card.appendChild(element('p', 'ktools-form-intro', mode === 'recall' ? '回忆只适用于FRLG招式表中、当前等级前的升级招式。' : `研修会${terminal.freeCompatibleTM ? '保留' : '消耗'}所选TM；直接使用背包TM仍按通常规则消耗。`));
    card.appendChild(fields);
    return card;
  }
  function makeFormPicker(container, state, data, hooks) {
    const box = element('div', 'ktools-terminal-start');
    const buttons = element('div', 'ktools-choice-row');
    const terminal = data.tools?.terminal || {};
    const canRecall = terminal.recallUnlocked && asArray(terminal.levelMoves).some(record => asArray(record.moves).length);
    const canMachine = asArray(terminal.machines).some(machine => asArray(machine.learners).some(learner => !learner.knowsMove));
    buttons.append(
      button('回忆升级招式', 'ktools-choice', () => { setDraft(state, {kind:'recall',uid:'',moveId:'',slot:'append'}); rerenderPreservingFocus(container); }, { disabled: !!data.busy || state.pending || !canRecall, focusKey:'start-recall' }),
      button('使用兼容TM', 'ktools-choice', () => { setDraft(state, {kind:'machine',uid:'',itemId:'',slot:'append'}); rerenderPreservingFocus(container); }, { disabled: !!data.busy || state.pending || !canMachine, focusKey:'start-machine' }),
    );
    box.appendChild(buttons);
    if (state.draft) box.appendChild(formFor(container, state, data, hooks, state.draft.kind));
    return box;
  }
  function render(container, input = {}, hooks = {}) {
    if (!container || typeof container.replaceChildren !== 'function') throw new TypeError('需要可挂载工具面板的容器。');
    const state = stateFor(container), focus = rememberFocus(container);
    const data = { tools: input.tools || {}, gadgets: input.gadgets || {}, world: input.world || {}, busy: !!input.busy, hooks };
    state.last = { data, hooks };
    const root = element('div', 'ktools-panel');
    const heading = element('header', 'ktools-header');
    heading.appendChild(element('div', 'ktools-title-block', ''));
    const titleBlock = heading.firstChild; titleBlock.appendChild(element('p', 'ktools-kicker', '旅途准备'));
    titleBlock.appendChild(element('h2', '', '永久工具'));
    titleBlock.appendChild(element('p', 'ktools-subtitle', '由委托解锁的实用能力。状态和结果以人物卡为准。'));
    root.appendChild(heading);

    if (state.error || state.notice) {
      const note = element('p', `ktools-feedback${state.error ? ' is-error' : ''}`, state.error || state.notice);
      note.setAttribute('role', state.error ? 'alert' : 'status'); note.setAttribute('aria-live', 'polite'); root.appendChild(note);
    }
    const busy = data.busy || state.pending;
    const availableGadgets = allGadgets(data.tools, data.gadgets), unlocked = unlockedIds(data.tools, data.gadgets);
    const caps = element('div', 'ktools-capabilities');
    const visible = availableGadgets.filter(gadget => gadget.unlocked || unlocked.has(gadget.id));
    if (!visible.length) caps.appendChild(element('p', 'ktools-empty', '尚无永久工具。完成相关深度委托后可逐步解锁。'));
    else for (const gadget of visible) {
      const card = element('article', `ktools-capability${unlocked.has(gadget.id) ? '' : ' is-locked'}`);
      const top = element('div', 'ktools-capability-top'); top.appendChild(element('strong', '', gadget.name || gadget.id));
      top.appendChild(element('span', 'ktools-state', unlocked.has(gadget.id) ? '已解锁' : '未解锁'));
      card.appendChild(top); card.appendChild(element('p', '', gadget.description || ''));
      if (!unlocked.has(gadget.id)) card.appendChild(element('small', '', '完成对应委托后解锁。'));
      caps.appendChild(card);
    }
    root.appendChild(section(container,state,'capabilities','已解锁能力','永久保留',caps));

    const options = asArray(data.gadgets.partyExpShareOptions);
    if (options.length && unlocked.has('partyExpShare')) {
      const exp = element('div', 'ktools-exp');
      const mode = data.gadgets.partyExpShareMode || data.world?.机制奖励?.partyExpShareMode || 'off';
      const labels = element('div', 'ktools-choice-row ktools-mode-row');
      for (const option of options) {
        const active = option.id === mode;
        labels.appendChild(button(option.label, `ktools-mode${active ? ' is-active' : ''}`, () => invoke(container,state,hooks.onConfig,['partyExpShareMode',option.id],'经验共享设置'), {
          disabled: busy || !option.enabled || active, focusKey:`exp-mode-${option.id}`,
        }));
      }
      exp.appendChild(labels);
      exp.appendChild(element('p', 'ktools-caption', '关闭时按参战与持有学习装置规则分配；全队均分与旅程模式会按各自说明计算。'));
      root.appendChild(section(container,state,'experience','全队经验共享', '模式设置',exp));
    }

    const terminal = data.tools.terminal || {};
    if (terminal.unlocked) {
      const content = makeFormPicker(container, state, data, hooks);
      if (!terminal.recallUnlocked) content.appendChild(element('p', 'ktools-lock-note', '招式回忆升级需要招式研修档案或招式记忆检索；相关委托会解锁这项能力。'));
      root.appendChild(section(container,state,'terminal','招式研修终端', '合法升级招式与已拥有TM',content));
    }

    const camp = data.tools.camp || {};
    if (unlocked.has('campKit') || camp.enabled || camp.description) {
      const content = element('div', 'ktools-action-block');
      content.appendChild(element('p', 'ktools-caption', camp.description || '营地效果会显示实际恢复范围，并且不会复活倒下的伙伴。'));
      if (camp.location) content.appendChild(element('p', 'ktools-location', `当前位置：${camp.location}`));
      const rest = button(camp.plus ? '充分休整' : '基础休整', 'ktools-primary', () => invoke(container,state,hooks.onAction,['gadget-camp-rest',{}],'营地休整'), {
        disabled: busy || !camp.enabled, focusKey:'camp-rest',
      });
      content.appendChild(rest);
      if (!camp.enabled && camp.reason) content.appendChild(element('p', 'ktools-lock-note', camp.reason));
      root.appendChild(section(container,state,'camp','野外营地',unlocked.has('campKit') ? (camp.plus ? '耐候组件已启用' : '基础工具') : '未解锁 · 完成委托',content));
    }

    const bondHistory = data.tools.bondHistory || {};
    if (bondHistory.unlocked) {
      const content = element('div', 'ktools-record-list');
      const entries = asArray(bondHistory.entries);
      if (!entries.length) content.appendChild(element('p', 'ktools-empty-inline', '还没有已记录的信赖变化或共同记忆。'));
      for (const entry of entries) {
        const card = element('article', 'ktools-record-card');
        const heading = element('div', 'ktools-record-heading');
        heading.appendChild(element('strong', '', entry.name || `伙伴 ${entry.uid || ''}`));
        heading.appendChild(element('span', 'ktools-record-meta', `信赖 ${Number.isInteger(entry.trust) ? entry.trust : 0} · ${entry.mood || '平静'}`));
        card.appendChild(heading);
        const memories = asArray(entry.memories);
        if (!memories.length) card.appendChild(element('p', 'ktools-empty-inline', '目前没有共同记忆。'));
        else {
          const list = element('ol', 'ktools-record-events');
          for (const memory of memories) {
            const turn = Number.isInteger(memory.storyTurn) ? `第 ${memory.storyTurn} 回合 · ` : '';
            list.appendChild(element('li', '', `${turn}${memory.text || ''}`));
          }
          card.appendChild(list);
        }
        content.appendChild(card);
      }
      root.appendChild(section(container,state,'bond-history','羁绊观察档案',`${entries.length} 位有记录的伙伴`,content));
    }

    const leagueHistory = data.tools.leagueHistory || {};
    if (leagueHistory.unlocked) {
      const content = element('div', 'ktools-record-list');
      content.appendChild(element('p', 'ktools-record-summary', `联盟进度：${Number.isInteger(leagueHistory.leagueProgress) ? leagueHistory.leagueProgress : 0}/5 · 石英大会报名：${Number.isInteger(leagueHistory.tournamentAttempts) ? leagueHistory.tournamentAttempts : 0} 次 · ${leagueHistory.champion ? '已获大会优胜' : '尚未记录大会优胜'}`));
      const attempts = asArray(leagueHistory.tournamentHistory);
      if (!attempts.length) content.appendChild(element('p', 'ktools-empty-inline', '还没有已保存的石英大会结果。'));
      else {
        const list = element('ol', 'ktools-record-events');
        for (const attempt of attempts) {
          const result = attempt.result === 'champion' ? '优胜' : '未晋级';
          const won = Number.isInteger(attempt.roundsWon) ? attempt.roundsWon : 0;
          list.appendChild(element('li', '', `第 ${attempt.attempt} 次报名：${result}，赢下 ${won}/6 轮`));
        }
        content.appendChild(list);
      }
      if (leagueHistory.lastSettlement) {
        const last = leagueHistory.lastSettlement;
        const resultLabel = ({ win: '胜利', lose: '败北', draw: '平局', caught: '收服', escaped: '逃离', avoided: '避开' })[last.result] || last.result;
        content.appendChild(element('p', 'ktools-record-summary', `最近结算（第 ${Number.isInteger(last.round) ? last.round : '—'} 回合 · ${resultLabel}）：${last.summary || '无战报摘要。'}`));
      }
      root.appendChild(section(container,state,'league-history','联盟复盘档案','仅显示存档中的进度与赛果',content));
    }

    const ecology = data.tools.ecology || {};
    if (ecology.unlocked || unlocked.has('fieldRadar')) {
      const content = element('div', 'ktools-ecology');
      const list = asArray(ecology.species);
      const localTypes = [...new Set(list.flatMap(species => asArray(species.types)))].sort((a,b)=>a.localeCompare(b,'en'));
      const filter = element('div', 'ktools-radar-filter');
      filter.appendChild(element('span', 'ktools-label', ecology.typeFilter ? '按本地物种属性筛选' : '属性筛选需升级雷达'));
      if (ecology.typeFilter) {
        const select = element('select', 'ktools-select'); select.dataset.focusKey = 'ecology-filter'; select.setAttribute('aria-label','按属性筛选当地生态');
        const any = element('option','','所有属性'); any.value=''; select.appendChild(any);
        addOptions(select,localTypes,type=>type,type=>type,state.filterType);
        if (!localTypes.includes(state.filterType)) state.filterType=''; select.value=state.filterType;
        select.disabled = busy;
        select.addEventListener('change',event=>{state.filterType=event.target.value;rerenderPreservingFocus(container);});
        filter.appendChild(select);
      }
      content.appendChild(filter);
      const visibleSpecies = list.filter(species => !ecology.typeFilter || !state.filterType || asArray(species.types).includes(state.filterType));
      if (!visibleSpecies.length) content.appendChild(element('p','ktools-empty-inline',ecology.location ? '当前位置的地图资料没有记录野生种类。' : '还没有当前位置生态资料。'));
      else {
        const grid = element('div','ktools-species-grid');
        for (const species of visibleSpecies) {
          const row = element('article','ktools-species');
          if (typeof hooks.asset === 'function') {
            const image = element('img','ktools-species-image'); image.alt=''; image.loading='lazy';
            try { image.src = hooks.asset(`assets/pokemon/${encodeURIComponent(String(species.id))}.png`); } catch { image.hidden=true; }
            row.appendChild(image);
          }
          const detail = element('div','ktools-species-detail'); detail.appendChild(element('strong','',species.name || `图鉴 ${species.id}`));
          detail.appendChild(element('span','',`#${String(species.id).padStart(3,'0')} · ${asArray(species.types).join(' / ')}`));
          row.appendChild(detail); grid.appendChild(row);
        }
        content.appendChild(grid);
      }
      if (ecology.locationName) content.appendChild(element('p','ktools-location',`生态资料：${ecology.locationName}`));
      root.appendChild(section(container,state,'ecology','野外生态雷达',ecology.typeFilter ? '可按属性筛选' : '当前位置记录',content));
    }

    if (busy) root.setAttribute('aria-busy','true');
    container.replaceChildren(root);
    restoreFocus(container,focus);
    return root;
  }

  globalThis.KantoTools = Object.freeze({ render });
})();
