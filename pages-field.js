// =====================================================================
//  Field pages: Home, Visit form/details, Visits list, Follow-ups
// =====================================================================
const OBJECTIVES = ['Introduction', 'Follow-up', 'Price negotiation', 'Order taking', 'Technical support', 'Complaint', 'Sample delivery', 'Payment collection', 'Other'];
const FU_TYPES = ['Expected order', 'Call back', 'Visit again', 'Send sample', 'Send price offer', 'Payment collection', 'Other'];
const VISIT_TYPES = ['Planned', 'Unplanned', 'Call'];
const QUICK_DATES = [['Next week', 7], ['2 weeks', 14], ['Next month', 30]];

// ---------- shared pieces ----------
function fuCard(f, { showRep = isManager(), actions = true } = {}) {
  const n = daysBetween(today(), f.due_date);
  const cls = f.status !== 'Open' ? 'closed' : n < 0 ? 'overdue' : n <= CFG.REMIND_DAYS_BEFORE ? 'soon' : '';
  return `<div class="item fu ${cls}" data-fu="${f.id}">
    <div class="item-main">
      <div class="row-between"><b>${esc(clientName(f.client_id))}</b><span class="badge ${cls}">${f.status === 'Open' ? relDay(f.due_date) : f.status}</span></div>
      <div class="muted small">${esc(f.fu_type)} · ${fmtDate(f.due_date)}${showRep ? ' · ' + esc(repName(f.rep_id)) : ''}${f.postponed_count ? ` · postponed ×${f.postponed_count}` : ''}</div>
      ${f.note ? `<div class="note">${esc(f.note)}</div>` : ''}
      ${f.outcome ? `<div class="note outcome">↳ ${esc(f.outcome)}</div>` : ''}
    </div>
    ${actions && f.status === 'Open' && (f.rep_id === S.me.id || isManager()) ? `<div class="item-actions">
      <button class="btn sm primary" data-act="done">Done</button>
      <button class="btn sm" data-act="postpone">Postpone</button>
      <button class="btn sm ghost" data-act="cancel">Cancel</button></div>` : ''}
  </div>`;
}

function bindFuActions(root, rows, after) {
  $$('[data-fu] [data-act]', root).forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    const f = rows.find((x) => x.id === b.closest('[data-fu]').dataset.fu);
    const act = b.dataset.act;
    if (act === 'done') {
      sheet('Mark as done', `<p><b>${esc(clientName(f.client_id))}</b> — ${esc(f.fu_type)}</p>
        ${field('What happened? (optional)', '<textarea name="outcome" rows="3" placeholder="e.g. Ordered 2 tons"></textarea>')}`,
      { submitLabel: 'Mark done', onSubmit: async (fd) => {
        await Data.update('follow_ups', f.id, { status: 'Done', outcome: val(fd, 'outcome'), closed_at: new Date().toISOString() });
        toast('Follow-up closed'); after();
      } });
    } else if (act === 'postpone') {
      const s = sheet('Postpone to…', `${quickDatePicker('due', addDays(f.due_date < today() ? today() : f.due_date, 7))}
        ${field('Reason (optional)', '<input name="outcome" placeholder="e.g. Client asked to call after Eid">')}`,
      { submitLabel: 'Postpone', onSubmit: async (fd) => {
        const due = val(fd, 'due');
        if (!due) { toast('Choose a date', 'err'); return false; }
        const reason = val(fd, 'outcome');
        await Data.update('follow_ups', f.id, {
          due_date: due, postponed_count: (f.postponed_count || 0) + 1, reminded_before: false, reminded_due: false,
          note: reason ? `${f.note ? f.note + '\n' : ''}[Postponed ${fmtDate(today())}] ${reason}` : f.note,
        });
        toast('Postponed to ' + fmtDate(due)); after();
      } });
      bindQuickDates(s);
    } else if (act === 'cancel') {
      sheet('Cancel follow-up', field('Reason', '<input name="outcome" required placeholder="e.g. Client bought from competitor">'),
        { submitLabel: 'Cancel follow-up', danger: true, onSubmit: async (fd) => {
          await Data.update('follow_ups', f.id, { status: 'Cancelled', outcome: val(fd, 'outcome'), closed_at: new Date().toISOString() });
          toast('Follow-up cancelled'); after();
        } });
    }
  }));
}

function quickDatePicker(name, value = '') {
  return `<div class="field"><span>When?</span>
    <div class="chips quick">${QUICK_DATES.map(([l, d]) => `<button type="button" class="chip" data-days="${d}">${l}</button>`).join('')}</div>
    <input type="date" name="${name}" value="${value}" min="${today()}">
    <small class="remind-hint"></small></div>`;
}
function bindQuickDates(root) {
  const input = $('input[type=date]', root);
  const hint = $('.remind-hint', root);
  const upd = () => {
    $$('.quick .chip', root).forEach((c) => c.classList.toggle('on', input.value === addDays(today(), +c.dataset.days)));
    if (!hint) return;
    if (!input.value) { hint.textContent = ''; return; }
    const r = addDays(input.value, -CFG.REMIND_DAYS_BEFORE);
    hint.textContent = `🔔 Reminder on ${fmtDate(r < today() ? today() : r)} and on ${fmtDate(input.value)}`;
  };
  $$('.quick .chip', root).forEach((c) => (c.onclick = () => { input.value = addDays(today(), +c.dataset.days); upd(); }));
  input.addEventListener('change', upd);
  upd();
}

function visitRow(v, { showRep = isManager() } = {}) {
  const prods = (v.product_ids || []).map(productName).filter(Boolean);
  return `<a class="item" href="#/visit/${v.id}">
    <div class="item-main">
      <div class="row-between"><b>${esc(clientName(v.client_id))}</b><span class="muted small">${esc(areaName((byId(S.clients, v.client_id) || {}).area_id))}</span></div>
      <div class="muted small">${esc(v.objective || v.visit_type || '')}${showRep ? ' · ' + esc(repName(v.rep_id)) : ''}${v.visit_type === 'Unplanned' ? ' · <i>unplanned</i>' : v.visit_type === 'Call' ? ' · 📞 call' : ''}</div>
      ${v.feedback ? `<div class="note clamp">${esc(v.feedback)}</div>` : ''}
      ${prods.length ? `<div class="tags">${prods.map((p) => `<span class="tag">${esc(p)}</span>`).join('')}</div>` : ''}
    </div></a>`;
}

// ---------- HOME ----------
Pages.home = async (view) => {
  if (isManager()) return Pages.dashboard(view, [], {}, true);
  setTitle('My day');
  const soonLimit = addDays(today(), CFG.REMIND_DAYS_BEFORE);
  const [fus, visitsWeek] = await Promise.all([
    Data.list('follow_ups', { eq: { status: 'Open', rep_id: S.me.id }, lte: { due_date: addDays(today(), 7) }, order: 'due_date' }),
    Data.list('visits', { eq: { rep_id: S.me.id }, gte: { visit_date: weekStart() }, order: 'created_at', desc: true }),
  ]);
  const todays = visitsWeek.filter((v) => v.visit_date === today());
  const urgent = fus.filter((f) => f.due_date <= soonLimit);
  const later = fus.filter((f) => f.due_date > soonLimit);
  view.innerHTML = `
    <div class="hello"><div><div class="muted small">${fmtDate(today())}</div><h2>Hi, ${esc(S.me.full_name.split(' ')[0])}</h2></div></div>
    <a class="btn primary block big" href="#/visit/new">＋ Log a visit</a>
    <div class="stats">
      <div class="stat"><b>${todays.length}</b><span>visits today</span></div>
      <div class="stat"><b>${visitsWeek.length}</b><span>this week</span></div>
      <div class="stat ${urgent.length ? 'warn' : ''}"><b>${urgent.length}</b><span>need action</span></div>
    </div>
    <section><h3>🔔 Reminders</h3>
      ${urgent.length ? urgent.map((f) => fuCard(f)).join('') : '<div class="empty">Nothing due in the next ' + CFG.REMIND_DAYS_BEFORE + ' days 👍</div>'}
      ${later.length ? `<details class="later"><summary>Later this week (${later.length})</summary>${later.map((f) => fuCard(f)).join('')}</details>` : ''}
    </section>
    <section><h3>Today's visits</h3>
      ${todays.length ? todays.map((v) => visitRow(v)).join('') : '<div class="empty">No visits logged today yet.</div>'}
    </section>`;
  bindFuActions(view, fus, () => route());
};

// ---------- VISIT FORM / DETAILS ----------
Pages.visit = async (view, args, query) => {
  if (args[0] === 'new' || args[1] === 'edit') return visitForm(view, args[1] === 'edit' ? args[0] : null, query);
  const v = (await Data.list('visits', { eq: { id: args[0] } }))[0];
  if (!v) { view.innerHTML = '<div class="empty">Visit not found.</div>'; return; }
  setTitle('Visit', 'visits');
  const [fus, comp] = await Promise.all([
    Data.list('follow_ups', { eq: { visit_id: v.id } }),
    Data.list('competitor_entries', { eq: { client_id: v.client_id, entry_date: v.visit_date } }),
  ]);
  const c = byId(S.clients, v.client_id) || {};
  const canEdit = v.rep_id === S.me.id || isAdmin();
  view.innerHTML = `
    <div class="card">
      <div class="row-between"><h2><a href="#/client/${c.id}">${esc(c.name || 'Client')}</a></h2><span class="badge">${esc(v.visit_type)}</span></div>
      <div class="muted">${fmtDate(v.visit_date)} · ${esc(areaName(c.area_id))} · ${esc(repName(v.rep_id))}</div>
      <dl class="dl">
        <dt>Objective</dt><dd>${esc(v.objective || '—')}</dd>
        <dt>Contact</dt><dd>${esc(v.contact_person || '—')}</dd>
        <dt>Products</dt><dd>${(v.product_ids || []).map(productName).filter(Boolean).map((p) => `<span class="tag">${esc(p)}</span>`).join(' ') || '—'}</dd>
        <dt>Feedback</dt><dd class="pre">${esc(v.feedback || '—')}</dd>
        ${v.lat ? `<dt>Location</dt><dd><a target="_blank" rel="noopener" href="https://maps.google.com/?q=${v.lat},${v.lng}">Open map ↗</a></dd>` : ''}
      </dl>
    </div>
    <section><h3>Follow-ups</h3>${fus.length ? fus.map((f) => fuCard(f)).join('') : '<div class="empty">No follow-up for this visit.</div>'}
      ${canEdit ? `<button class="btn block ghost" id="addFu">＋ Add follow-up</button>` : ''}</section>
    ${comp.length ? `<section><h3>Competitor info</h3>${comp.map(compRow).join('')}</section>` : ''}
    <a class="btn block ghost" href="#/competitor/new?client=${v.client_id}">⚑ Log competitor info</a>
    ${canEdit ? `<div class="row gap"><a class="btn block" href="#/visit/${v.id}/edit">Edit visit</a><button class="btn block danger ghost" id="delVisit">Delete</button></div>` : ''}`;
  bindFuActions(view, fus, () => route());
  if (canEdit) {
    $('#delVisit').onclick = () => sheet('Delete this visit?', '<p>This cannot be undone.</p>', { submitLabel: 'Delete', danger: true,
      onSubmit: async () => { await Data.remove('visits', v.id); toast('Visit deleted'); go('/visits'); } });
    $('#addFu').onclick = () => {
      const s = sheet('Add follow-up', fuFields(), { onSubmit: async (fd) => {
        const due = val(fd, 'due');
        if (!due) { toast('Choose a date', 'err'); return false; }
        await Data.insert('follow_ups', { visit_id: v.id, client_id: v.client_id, rep_id: v.rep_id, fu_type: val(fd, 'fu_type'), due_date: due, note: val(fd, 'fu_note'), status: 'Open' });
        toast('Follow-up added'); route();
      } });
      bindQuickDates(s);
    };
  }
};

const fuFields = (d = {}) => `
  ${field('Type', `<select name="fu_type">${FU_TYPES.map((t) => opt(t, t, t === (d.fu_type || 'Expected order'))).join('')}</select>`)}
  ${quickDatePicker('due', d.due_date || '')}
  ${field('Note', `<input name="fu_note" value="${esc(d.note || '')}" placeholder="e.g. Will place order for liquid methionine">`)}`;

function clientPicker(selectedId) {
  const list = S.clients.filter((c) => isManager() || c.rep_id === S.me.id);
  return `<div class="field"><span>Client *</span>
    <div class="picker">
      <input type="search" id="clientSearch" placeholder="Search client…" autocomplete="off">
      <select name="client_id" id="clientSel" required size="1">
        ${opt('', '— Select client —', !selectedId)}
        ${list.map((c) => opt(c.id, `${c.name}${c.area_id ? ' — ' + areaName(c.area_id) : ''}`, c.id === selectedId)).join('')}
      </select>
    </div>
    <button type="button" class="link small" id="newClientBtn">＋ New client</button></div>`;
}
function bindClientPicker(root, onPick) {
  const search = $('#clientSearch', root), sel = $('#clientSel', root);
  const all = $$('option', sel).filter((o) => o.value).map((o) => [o.value, o.textContent]);
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    const cur = sel.value;
    const hits = all.filter(([, t]) => !q || t.toLowerCase().includes(q));
    // rebuild the list (hiding <option> does not work on iPhone)
    sel.innerHTML = opt('', hits.length ? '— Select client —' : 'No match', false) + hits.map(([v, t]) => opt(v, t, v === cur)).join('');
    if (q && hits.length && !hits.some(([v]) => v === cur)) sel.value = hits[0][0];
    if (sel.value !== cur) onPick && onPick(sel.value);
  });
  sel.addEventListener('change', () => onPick && onPick(sel.value));
  $('#newClientBtn', root).onclick = () => clientSheet(null, (c) => {
    const label = `${c.name}${c.area_id ? ' — ' + areaName(c.area_id) : ''}`;
    all.push([c.id, label]);
    search.value = '';
    sel.insertAdjacentHTML('beforeend', opt(c.id, label, true));
    sel.value = c.id; onPick && onPick(c.id);
  });
}

async function visitForm(view, editId, query) {
  let v = { visit_date: today(), visit_type: 'Planned', product_ids: [], client_id: query.client || '' };
  if (editId) v = (await Data.list('visits', { eq: { id: editId } }))[0] || v;
  setTitle(editId ? 'Edit visit' : 'Log a visit', 'home');
  const prods = S.products.filter((p) => p.active !== false);
  view.innerHTML = `
  <form id="vf" class="form">
    ${clientPicker(v.client_id)}
    <div class="grid2">
      ${field('Date', `<input type="date" name="visit_date" value="${v.visit_date}" max="${today()}" required>`)}
      ${field('Type', `<select name="visit_type">${VISIT_TYPES.map((t) => opt(t, t, t === v.visit_type)).join('')}</select>`)}
    </div>
    ${field('Objective', `<select name="objective">${opt('', '—', !v.objective)}${OBJECTIVES.map((t) => opt(t, t, t === v.objective)).join('')}</select>`)}
    ${field('Contact person', `<input name="contact_person" value="${esc(v.contact_person || '')}">`)}
    <div class="field"><span>Products discussed</span>
      <div class="chips">${prods.map((p) => `<label class="chip"><input type="checkbox" name="product_ids" value="${p.id}" ${(v.product_ids || []).includes(p.id) ? 'checked' : ''}>${esc(p.name)}</label>`).join('') || '<small class="muted">No products yet — admin adds them in More → Lists.</small>'}</div>
    </div>
    ${field('Feedback / what happened', `<textarea name="feedback" rows="4" placeholder="What did the client say?">${esc(v.feedback || '')}</textarea>`)}
    ${editId ? '' : `
    <div class="fu-box">
      <label class="switch"><input type="checkbox" name="has_fu" id="hasFu"> <span>🔔 Add follow-up / reminder</span></label>
      <div id="fuFields" hidden>${fuFields()}</div>
    </div>
    <label class="switch"><input type="checkbox" name="then_comp"> <span>⚑ Log competitor info after saving</span></label>`}
    <div class="muted small" id="gpsState"></div>
    <button class="btn primary block big" type="submit">${editId ? 'Save changes' : 'Save visit'}</button>
  </form>`;
  const form = $('#vf');
  bindClientPicker(form, (id) => {
    const c = byId(S.clients, id);
    if (c && !form.contact_person.value) form.contact_person.value = c.contact_person || '';
  });
  if (!editId) {
    $('#hasFu').onchange = (e) => { $('#fuFields').hidden = !e.target.checked; };
    bindQuickDates($('#fuFields'));
  }
  // capture location quietly (optional)
  let pos = null;
  if (!editId && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((p) => { pos = p.coords; $('#gpsState').textContent = '📍 Location captured'; },
      () => { $('#gpsState').textContent = ''; }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 });
  }
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    if (!val(fd, 'client_id')) return toast('Choose the client', 'err');
    const hasFu = fd.get('has_fu');
    if (hasFu && !val(fd, 'due')) return toast('Choose the follow-up date', 'err');
    const btn = $('button[type=submit]', form); btn.disabled = true;
    const row = {
      client_id: val(fd, 'client_id'), visit_date: val(fd, 'visit_date'), visit_type: val(fd, 'visit_type'),
      objective: val(fd, 'objective'), contact_person: val(fd, 'contact_person'),
      product_ids: fd.getAll('product_ids'), feedback: val(fd, 'feedback'),
    };
    try {
      if (editId) {
        await Data.update('visits', editId, row);
        toast('Visit updated'); go('/visit/' + editId); return;
      }
      if (pos) Object.assign(row, { lat: pos.latitude, lng: pos.longitude });
      row.rep_id = S.me.id;
      const saved = await Data.insert('visits', row);
      if (hasFu) {
        await Data.insert('follow_ups', { visit_id: saved.id, client_id: row.client_id, rep_id: S.me.id, fu_type: val(fd, 'fu_type'), due_date: val(fd, 'due'), note: val(fd, 'fu_note'), status: 'Open' });
      }
      toast(hasFu ? 'Visit saved + reminder set 🔔' : 'Visit saved ✓');
      go(fd.get('then_comp') ? '/competitor/new?client=' + row.client_id : '/home');
    } catch (err) { toast(errMsg(err), 'err'); btn.disabled = false; }
  };
}

// ---------- VISITS LIST ----------
const RANGES = { today: 'Today', week: 'This week', month: 'This month', d30: 'Last 30 days', custom: 'Custom' };
function rangeDates(r, q) {
  if (r === 'today') return [today(), today()];
  if (r === 'month') return [monthStart(), today()];
  if (r === 'd30') return [addDays(today(), -29), today()];
  if (r === 'custom') return [q.from || addDays(today(), -7), q.to || today()];
  return [weekStart(), today()];
}
Pages.visits = async (view, args, query) => {
  setTitle('Visits');
  const r = query.range || 'week';
  const [from, to] = rangeDates(r, query);
  const q = { gte: { visit_date: from }, lte: { visit_date: to }, order: 'visit_date', desc: true };
  if (query.rep) q.eq = { rep_id: query.rep };
  let rows = await Data.list('visits', q);
  if (query.area) rows = rows.filter((v) => (byId(S.clients, v.client_id) || {}).area_id === query.area);
  if (query.s) { const s = query.s.toLowerCase(); rows = rows.filter((v) => (clientName(v.client_id) + ' ' + (v.feedback || '')).toLowerCase().includes(s)); }
  const groups = {};
  rows.forEach((v) => (groups[v.visit_date] = groups[v.visit_date] || []).push(v));
  view.innerHTML = `
    <form class="filters" id="vfilt">
      <select name="range">${Object.entries(RANGES).map(([k, l]) => opt(k, l, k === r)).join('')}</select>
      ${r === 'custom' ? `<input type="date" name="from" value="${from}"><input type="date" name="to" value="${to}">` : ''}
      ${isManager() ? `<select name="rep">${options(myReps(), query.rep, { label: 'full_name', blank: 'All reps' })}</select>` : ''}
      <select name="area">${options(S.areas, query.area, { blank: 'All areas' })}</select>
      <input type="search" name="s" value="${esc(query.s || '')}" placeholder="Search client / feedback">
    </form>
    <div class="row-between list-head"><span class="muted">${rows.length} visit${rows.length === 1 ? '' : 's'}</span>
      <button class="btn sm ghost" id="csv" ${rows.length ? '' : 'disabled'}>⬇ Export Excel (CSV)</button></div>
    ${Object.keys(groups).map((d) => `<h4 class="date-h">${fmtDate(d)}</h4>${groups[d].map((v) => visitRow(v)).join('')}`).join('') || '<div class="empty">No visits in this period.</div>'}
    <a class="fab" href="#/visit/new" aria-label="Log a visit">＋</a>`;
  const f = $('#vfilt');
  const apply = () => { const p = new URLSearchParams([...new FormData(f)].filter(([, v]) => v)); go('/visits?' + p); };
  $$('select, input[type=date]', f).forEach((el) => (el.onchange = apply));
  f.onsubmit = (e) => { e.preventDefault(); apply(); };
  $('[name=s]', f).addEventListener('search', apply);
  $('#csv').onclick = () => downloadCSV(`visits_${from}_to_${to}.csv`,
    ['Date', 'Rep', 'Client', 'Area', 'Potentiality', 'Type', 'Objective', 'Contact', 'Products', 'Feedback'],
    rows.map((v) => { const c = byId(S.clients, v.client_id) || {}; return [v.visit_date, repName(v.rep_id), c.name, areaName(c.area_id), c.potentiality, v.visit_type, v.objective, v.contact_person, (v.product_ids || []).map(productName).join(', '), v.feedback]; }));
};

function downloadCSV(name, head, rows) {
  const cell = (x) => { const s = String(x ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n'); // BOM so Excel shows Arabic
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

// ---------- FOLLOW-UPS ----------
Pages.followups = async (view, args, query) => {
  setTitle('Follow-ups');
  const tab = query.tab || 'open';
  const q = tab === 'open' ? { eq: { status: 'Open' }, order: 'due_date' } : { in: { status: ['Done', 'Cancelled'] }, order: 'closed_at', desc: true, limit: 200 };
  if (query.rep) q.eq = { ...(q.eq || {}), rep_id: query.rep };
  const rows = await Data.list('follow_ups', q);
  const t = today(), soon = addDays(t, CFG.REMIND_DAYS_BEFORE), wk = addDays(t, 7);
  const sec = (title, list, cls = '') => list.length ? `<section><h3 class="${cls}">${title} <span class="count">${list.length}</span></h3>${list.map((f) => fuCard(f)).join('')}</section>` : '';
  view.innerHTML = `
    <div class="tabs">${[['open', 'Open'], ['closed', 'Done / cancelled']].map(([k, l]) => `<a class="${k === tab ? 'on' : ''}" href="#/followups?tab=${k}${query.rep ? '&rep=' + query.rep : ''}">${l}</a>`).join('')}</div>
    ${isManager() ? `<form class="filters"><select name="rep" id="fuRep">${options(myReps(), query.rep, { label: 'full_name', blank: 'All reps' })}</select></form>` : ''}
    ${tab === 'open' ? (
      sec('Overdue', rows.filter((f) => f.due_date < t), 'red') +
      sec('Due soon', rows.filter((f) => f.due_date >= t && f.due_date <= soon), 'amber') +
      sec('This week', rows.filter((f) => f.due_date > soon && f.due_date <= wk)) +
      sec('Later', rows.filter((f) => f.due_date > wk))
    ) || '<div class="empty">No open follow-ups. Add one when logging a visit.</div>'
      : rows.map((f) => fuCard(f)).join('') || '<div class="empty">Nothing closed yet.</div>'}`;
  if ($('#fuRep')) $('#fuRep').onchange = (e) => go(`/followups?tab=${tab}${e.target.value ? '&rep=' + e.target.value : ''}`);
  bindFuActions(view, rows, () => route());
};
