// =====================================================================
//  Clients and Competitors
// =====================================================================
const CLIENT_TYPES = ['Feed mill', 'Broiler farm', 'Layer farm', 'Breeder farm', 'Hatchery', 'Distributor', 'Integration', 'Other'];
const POTS = ['High', 'Medium', 'Low'];
const UNITS = ['kg', 'ton', 'liter', 'bag', 'box', 'unit'];

// ---------- CLIENT create / edit sheet ----------
function clientSheet(c, onSaved) {
  c = c || { rep_id: S.me.id };
  const reps = myReps();
  const s = sheet(c.id ? 'Edit client' : 'New client', `
    ${field('Client / company name *', `<input name="name" required value="${esc(c.name || '')}">`)}
    <div class="grid2">
      ${field('Type', `<select name="client_type">${opt('', '—', !c.client_type)}${CLIENT_TYPES.map((t) => opt(t, t, t === c.client_type)).join('')}</select>`)}
      ${field('Potentiality', `<select name="potentiality">${opt('', '—', !c.potentiality)}${POTS.map((t) => opt(t, t, t === c.potentiality)).join('')}</select>`)}
    </div>
    <div class="grid2">
      ${field('Area', `<select name="area_id">${options(S.areas, c.area_id, { blank: '—' })}</select>`)}
      ${isManager() ? field('Responsible rep', `<select name="rep_id">${options(reps, c.rep_id, { label: 'full_name', blank: '— none —' })}</select>`) : ''}
    </div>
    <div class="grid2">
      ${field('Contact person', `<input name="contact_person" value="${esc(c.contact_person || '')}">`)}
      ${field('Title', `<input name="contact_title" value="${esc(c.contact_title || '')}" placeholder="Owner, Nutritionist…">`)}
    </div>
    <div class="grid2">
      ${field('Phone', `<input name="phone" type="tel" value="${esc(c.phone || '')}">`)}
      ${field('Capacity', `<input name="capacity" value="${esc(c.capacity || '')}" placeholder="e.g. 1000 ton/month">`)}
    </div>
    ${field('Address', `<input name="address" value="${esc(c.address || '')}">`)}
    ${field('Notes', `<textarea name="notes" rows="2">${esc(c.notes || '')}</textarea>`)}
    <label class="switch"><input type="checkbox" name="use_gps"> <span>📍 I'm at the client now — save my location</span></label>`,
  { onSubmit: async (fd) => {
    const row = {
      name: val(fd, 'name'), client_type: val(fd, 'client_type'), potentiality: val(fd, 'potentiality'), area_id: val(fd, 'area_id'),
      contact_person: val(fd, 'contact_person'), contact_title: val(fd, 'contact_title'), phone: val(fd, 'phone'),
      capacity: val(fd, 'capacity'), address: val(fd, 'address'), notes: val(fd, 'notes'),
      rep_id: isManager() ? val(fd, 'rep_id') : (c.rep_id || S.me.id),
    };
    const dup = S.clients.find((x) => x.id !== c.id && x.name.trim().toLowerCase() === row.name.toLowerCase());
    if (dup) { toast(`"${dup.name}" already exists — open it from Clients`, 'err'); return false; }
    if (fd.get('use_gps')) {
      try {
        const p = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000 }));
        row.lat = p.coords.latitude; row.lng = p.coords.longitude;
      } catch (e) { toast('Could not get location — saved without it', 'err'); }
    }
    const saved = c.id ? await Data.update('clients', c.id, row) : await Data.insert('clients', row);
    const i = S.clients.findIndex((x) => x.id === saved.id);
    if (i >= 0) S.clients[i] = saved; else S.clients.push(saved);
    S.clients.sort((a, b) => a.name.localeCompare(b.name));
    toast(c.id ? 'Client updated' : 'Client added');
    onSaved && onSaved(saved);
  } });
  return s;
}

// ---------- CLIENTS LIST ----------
Pages.clients = async (view, args, query) => {
  setTitle('Clients');
  const since = addDays(today(), -365);
  const visits = await Data.list('visits', { gte: { visit_date: since } });
  const last = {};
  visits.forEach((v) => { if (!last[v.client_id] || v.visit_date > last[v.client_id]) last[v.client_id] = v.visit_date; });
  let rows = S.clients.slice();
  if (!isManager()) rows = rows.filter((c) => c.rep_id === S.me.id);
  if (query.rep) rows = rows.filter((c) => c.rep_id === query.rep);
  if (query.area) rows = rows.filter((c) => c.area_id === query.area);
  if (query.pot) rows = rows.filter((c) => c.potentiality === query.pot);
  if (query.s) { const s = query.s.toLowerCase(); rows = rows.filter((c) => `${c.name} ${c.contact_person || ''} ${c.phone || ''}`.toLowerCase().includes(s)); }
  if (query.sort === 'last') rows.sort((a, b) => (last[a.id] || '').localeCompare(last[b.id] || '')); // never visited first, then oldest
  view.innerHTML = `
    <form class="filters" id="cfilt">
      <input type="search" name="s" value="${esc(query.s || '')}" placeholder="Search name / contact / phone">
      <select name="area">${options(S.areas, query.area, { blank: 'All areas' })}</select>
      <select name="pot">${opt('', 'All potentiality', !query.pot)}${POTS.map((p) => opt(p, p, p === query.pot)).join('')}</select>
      ${isManager() ? `<select name="rep">${options(myReps(), query.rep, { label: 'full_name', blank: 'All reps' })}</select>` : ''}
      <select name="sort">${opt('', 'Sort: A–Z', !query.sort)}${opt('last', 'Sort: longest not visited', query.sort === 'last')}</select>
    </form>
    <div class="list-head muted">${rows.length} client${rows.length === 1 ? '' : 's'}</div>
    ${rows.map((c) => {
      const lv = last[c.id];
      const gap = lv ? daysBetween(lv, today()) : null;
      return `<a class="item" href="#/client/${c.id}"><div class="item-main">
        <div class="row-between"><b>${esc(c.name)}</b>${c.potentiality ? `<span class="pot ${c.potentiality.toLowerCase()}">${c.potentiality}</span>` : ''}</div>
        <div class="muted small">${esc([areaName(c.area_id), c.client_type, c.contact_person].filter(Boolean).join(' · '))}${isManager() ? ' · ' + esc(repName(c.rep_id)) : ''}</div>
        <div class="small ${gap == null || gap > 30 ? 'warn-text' : 'muted'}">${lv ? `Last visit: ${fmtDate(lv)} (${relDay(lv)})` : 'Not visited yet'}</div>
      </div></a>`;
    }).join('') || '<div class="empty">No clients found.</div>'}
    <button class="fab" id="addClient" aria-label="New client">＋</button>`;
  const f = $('#cfilt');
  const apply = () => go('/clients?' + new URLSearchParams([...new FormData(f)].filter(([, v]) => v)));
  $$('select', f).forEach((el) => (el.onchange = apply));
  f.onsubmit = (e) => { e.preventDefault(); apply(); };
  $('[name=s]', f).addEventListener('search', apply);
  $('#addClient').onclick = () => clientSheet(null, (c) => go('/client/' + c.id));
};

// ---------- CLIENT DETAILS ----------
Pages.client = async (view, args) => {
  const c = byId(S.clients, args[0]);
  if (!c) { view.innerHTML = '<div class="empty">Client not found.</div>'; return; }
  setTitle(c.name, 'clients');
  const [visits, fus, comp] = await Promise.all([
    Data.list('visits', { eq: { client_id: c.id }, order: 'visit_date', desc: true }),
    Data.list('follow_ups', { eq: { client_id: c.id, status: 'Open' }, order: 'due_date' }),
    Data.list('competitor_entries', { eq: { client_id: c.id }, order: 'entry_date', desc: true }),
  ]);
  const canEdit = c.rep_id === S.me.id || isManager();
  view.innerHTML = `
    <div class="card">
      <div class="row-between"><h2>${esc(c.name)}</h2>${c.potentiality ? `<span class="pot ${c.potentiality.toLowerCase()}">${c.potentiality}</span>` : ''}</div>
      <div class="muted">${esc([c.client_type, areaName(c.area_id)].filter(Boolean).join(' · '))}</div>
      <dl class="dl">
        <dt>Contact</dt><dd>${esc(c.contact_person || '—')}${c.contact_title ? ` <span class="muted">(${esc(c.contact_title)})</span>` : ''}</dd>
        <dt>Phone</dt><dd>${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : '—'}</dd>
        <dt>Rep</dt><dd>${esc(repName(c.rep_id))}</dd>
        ${c.capacity ? `<dt>Capacity</dt><dd>${esc(c.capacity)}</dd>` : ''}
        ${c.address ? `<dt>Address</dt><dd>${esc(c.address)}</dd>` : ''}
        ${c.lat ? `<dt>Location</dt><dd><a target="_blank" rel="noopener" href="https://maps.google.com/?q=${c.lat},${c.lng}">Open in Google Maps ↗</a></dd>` : ''}
        ${c.notes ? `<dt>Notes</dt><dd class="pre">${esc(c.notes)}</dd>` : ''}
      </dl>
      <div class="row gap">
        <a class="btn primary block" href="#/visit/new?client=${c.id}">＋ Visit</a>
        <a class="btn block" href="#/competitor/new?client=${c.id}">⚑ Competitor</a>
        ${canEdit ? '<button class="btn block ghost" id="editC">Edit</button>' : ''}
      </div>
    </div>
    <section><h3>Open follow-ups</h3>${fus.map((f) => fuCard(f)).join('') || '<div class="empty">None.</div>'}</section>
    <section><h3>Visit history <span class="count">${visits.length}</span></h3>${visits.map((v) => `<div class="date-h">${fmtDate(v.visit_date)}</div>${visitRow(v)}`).join('') || '<div class="empty">No visits yet.</div>'}</section>
    ${comp.length ? `<section><h3>Competitor info</h3>${comp.map(compRow).join('')}</section>` : ''}`;
  bindFuActions(view, fus, () => route());
  if (canEdit) $('#editC').onclick = () => clientSheet(c, () => route());
  bindCompRows(view, comp);
};

// ---------- COMPETITORS ----------
function compRow(e) {
  return `<div class="item comp" data-ce="${e.id}"><div class="item-main">
    <div class="row-between"><b>${esc(cprodLabel(e.competitor_product_id))}</b>${e.price != null ? `<span class="price">${Number(e.price).toLocaleString()} <small>/${esc(e.unit || '')}</small></span>` : ''}</div>
    <div class="muted small">${fmtDate(e.entry_date)}${e.client_id ? ' · ' + esc(clientName(e.client_id)) : ''}${e.area_id ? ' · ' + esc(areaName(e.area_id)) : ''}${isManager() ? ' · ' + esc(repName(e.rep_id)) : ''}</div>
    ${e.notes ? `<div class="note">${esc(e.notes)}</div>` : ''}
  </div></div>`;
}
function bindCompRows(root, rows) {
  $$('[data-ce]', root).forEach((el) => (el.onclick = () => {
    const e = rows.find((x) => x.id === el.dataset.ce);
    if (!(e.rep_id === S.me.id || isAdmin())) return;
    sheet('Competitor entry', compRow(e), { submitLabel: 'Delete entry', danger: true,
      onSubmit: async () => { await Data.remove('competitor_entries', e.id); toast('Deleted'); route(); } });
  }));
}

Pages.competitors = async (view, args, query) => {
  setTitle('Competitors');
  const tab = query.tab || 'board';
  const days = +(query.days || 90);
  const q = { gte: { entry_date: addDays(today(), -days + 1) }, order: 'entry_date', desc: true };
  let rows = await Data.list('competitor_entries', q);
  if (query.comp) rows = rows.filter((e) => (byId(S.competitor_products, e.competitor_product_id) || {}).competitor_id === query.comp);
  if (query.prod) rows = rows.filter((e) => e.competitor_product_id === query.prod);
  if (query.area) rows = rows.filter((e) => e.area_id === query.area);

  // price board: one line per competitor product
  const board = {};
  rows.forEach((e) => {
    const b = (board[e.competitor_product_id] = board[e.competitor_product_id] || { id: e.competitor_product_id, n: 0, prices: [], latest: null });
    b.n++;
    if (e.price != null) { b.prices.push(+e.price); if (!b.latest) b.latest = e; }
  });
  const boardRows = Object.values(board).sort((a, b) => cprodLabel(a.id).localeCompare(cprodLabel(b.id)));

  view.innerHTML = `
    <div class="tabs">${[['board', 'Price board'], ['entries', 'All entries']].map(([k, l]) => `<a class="${k === tab ? 'on' : ''}" href="#/competitors?${new URLSearchParams({ ...query, tab: k })}">${l}</a>`).join('')}</div>
    <form class="filters" id="cpf">
      <select name="days">${[[30, 'Last 30 days'], [90, 'Last 90 days'], [180, 'Last 6 months'], [365, 'Last year']].map(([d, l]) => opt(d, l, d === days)).join('')}</select>
      <select name="comp">${options(S.competitors, query.comp, { blank: 'All competitors' })}</select>
      <select name="area">${options(S.areas, query.area, { blank: 'All areas' })}</select>
      <input type="hidden" name="tab" value="${tab}">
    </form>
    ${tab === 'board' ? (boardRows.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Competitor product</th><th>Latest price</th><th>Min–Max</th><th>Mentions</th></tr></thead>
        <tbody>${boardRows.map((b) => `<tr data-prod="${b.id}">
          <td><b>${esc(cprodLabel(b.id))}</b></td>
          <td>${b.latest ? `${Number(b.latest.price).toLocaleString()} /${esc(b.latest.unit || '')}<div class="muted small">${fmtDate(b.latest.entry_date)}</div>` : '—'}</td>
          <td>${b.prices.length ? `${Math.min(...b.prices).toLocaleString()} – ${Math.max(...b.prices).toLocaleString()}` : '—'}</td>
          <td>${b.n}</td></tr>`).join('')}</tbody></table></div>
        <p class="muted small">Tap a product to see all its entries.</p>` : '<div class="empty">No competitor info in this period.</div>')
      : (query.prod ? `<div class="chip on">${esc(cprodLabel(query.prod))} <a href="#/competitors?${new URLSearchParams({ ...query, prod: '' })}">✕</a></div>` : '') +
        (rows.map(compRow).join('') || '<div class="empty">No entries.</div>')}
    <a class="fab" href="#/competitor/new" aria-label="Add competitor info">＋</a>`;
  const f = $('#cpf');
  $$('select', f).forEach((el) => (el.onchange = () => go('/competitors?' + new URLSearchParams([...new FormData(f)].filter(([, v]) => v)))));
  $$('[data-prod]', view).forEach((tr) => (tr.onclick = () => go('/competitors?' + new URLSearchParams({ ...query, tab: 'entries', prod: tr.dataset.prod }))));
  bindCompRows(view, rows);
};

Pages.competitor = async (view, args, query) => {
  setTitle('Competitor info', 'competitors');
  const myClients = S.clients.filter((c) => isManager() || c.rep_id === S.me.id);
  const pre = byId(S.clients, query.client);
  view.innerHTML = `
  <form id="cf" class="form">
    <p class="muted small">Record what competitors are selling in the field — product, price, who is buying.</p>
    ${field('Competitor *', `<select name="competitor_id" required>${options(S.competitors, null, { blank: '— Select —' })}${opt('__new', '＋ New competitor…')}</select>`)}
    <div id="newComp" hidden>${field('New competitor name', '<input name="new_comp" placeholder="e.g. Evonik">')}</div>
    ${field('Product *', `<select name="cprod_id" required disabled>${opt('', 'Select competitor first')}</select>`)}
    <div id="newProd" hidden>${field('New product name', '<input name="new_prod" placeholder="e.g. Methionine powder 99%">')}</div>
    <div class="grid2">
      ${field('Price', '<input name="price" type="number" step="any" inputmode="decimal" placeholder="optional">')}
      ${field('Unit', `<select name="unit">${UNITS.map((u) => opt(u, 'per ' + u, u === 'kg')).join('')}</select>`)}
    </div>
    ${field('Client (where you heard it)', `<select name="client_id">${opt('', '— none —', !pre)}${myClients.map((c) => opt(c.id, c.name, pre && c.id === pre.id)).join('')}</select>`)}
    ${field('Area', `<select name="area_id">${options(S.areas, pre ? pre.area_id : null, { blank: '—' })}</select>`)}
    ${field('Date', `<input type="date" name="entry_date" value="${today()}" max="${today()}">`)}
    ${field('Notes', '<textarea name="notes" rows="3" placeholder="Payment terms, quality complaints, volumes…"></textarea>')}
    <button class="btn primary block big" type="submit">Save</button>
    <label class="switch"><input type="checkbox" name="another"> <span>Add another after saving</span></label>
  </form>`;
  const form = $('#cf');
  const compSel = form.competitor_id, prodSel = form.cprod_id;
  const fillProducts = () => {
    const cid = compSel.value;
    $('#newComp').hidden = cid !== '__new';
    if (!cid) { prodSel.disabled = true; prodSel.innerHTML = opt('', 'Select competitor first'); $('#newProd').hidden = true; return; }
    const list = cid === '__new' ? [] : S.competitor_products.filter((p) => p.competitor_id === cid);
    prodSel.disabled = false;
    prodSel.innerHTML = (list.length ? options(list, null, { blank: '— Select —' }) : '') + opt('__new', '＋ New product…', !list.length);
    $('#newProd').hidden = prodSel.value !== '__new';
  };
  compSel.onchange = fillProducts;
  prodSel.onchange = () => { $('#newProd').hidden = prodSel.value !== '__new'; };
  form.client_id.onchange = () => { const c = byId(S.clients, form.client_id.value); if (c && c.area_id) form.area_id.value = c.area_id; };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const btn = $('button[type=submit]', form); btn.disabled = true;
    try {
      let compId = val(fd, 'competitor_id');
      if (compId === '__new') {
        const nm = val(fd, 'new_comp'); if (!nm) throw new Error('Write the competitor name');
        const ex = S.competitors.find((c) => c.name.toLowerCase() === nm.toLowerCase());
        compId = ex ? ex.id : (await Data.insert('competitors', { name: nm })).id;
        if (!ex) S.competitors.push({ id: compId, name: nm });
      }
      let prodId = val(fd, 'cprod_id');
      if (prodId === '__new') {
        const nm = val(fd, 'new_prod'); if (!nm) throw new Error('Write the product name');
        const ex = S.competitor_products.find((p) => p.competitor_id === compId && p.name.toLowerCase() === nm.toLowerCase());
        prodId = ex ? ex.id : (await Data.insert('competitor_products', { competitor_id: compId, name: nm })).id;
        if (!ex) S.competitor_products.push({ id: prodId, competitor_id: compId, name: nm });
      }
      const price = val(fd, 'price');
      await Data.insert('competitor_entries', {
        rep_id: S.me.id, competitor_product_id: prodId, client_id: val(fd, 'client_id'), area_id: val(fd, 'area_id'),
        entry_date: val(fd, 'entry_date') || today(), price: price == null ? null : +price, unit: val(fd, 'unit'), notes: val(fd, 'notes'),
      });
      toast('Competitor info saved ✓');
      if (fd.get('another')) route(); else go('/competitors?tab=entries');
    } catch (err) { toast(errMsg(err), 'err'); btn.disabled = false; }
  };
};
