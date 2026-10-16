// =====================================================================
//  Manager dashboard, More, Admin (users, lists, import)
// =====================================================================
Pages.dashboard = async (view, args, query = {}, asHome = false) => {
  if (!isManager()) return go('/home');
  setTitle('Dashboard');
  const period = query.p || 'week';
  const from = period === 'month' ? monthStart() : period === 'd30' ? addDays(today(), -29) : weekStart();
  const t = today();
  const [visits, fus, comp] = await Promise.all([
    Data.list('visits', { gte: { visit_date: addDays(t, -120) }, order: 'visit_date', desc: true }),
    Data.list('follow_ups', { eq: { status: 'Open' }, order: 'due_date' }),
    Data.list('competitor_entries', { gte: { entry_date: from }, order: 'entry_date', desc: true }),
  ]);
  const pv = visits.filter((v) => v.visit_date >= from && v.visit_date <= t);
  const overdue = fus.filter((f) => f.due_date < t);
  const dueSoon = fus.filter((f) => f.due_date >= t && f.due_date <= addDays(t, CFG.REMIND_DAYS_BEFORE));
  const lastVisit = {};
  visits.forEach((v) => { if (!lastVisit[v.client_id]) lastVisit[v.client_id] = v.visit_date; });

  const reps = myReps().filter((p) => p.role === 'rep' || pv.some((v) => v.rep_id === p.id));
  const repStats = reps.map((p) => {
    const mine = pv.filter((v) => v.rep_id === p.id);
    const myFu = fus.filter((f) => f.rep_id === p.id);
    const lv = visits.find((v) => v.rep_id === p.id);
    return {
      p, visits: mine.length, clients: new Set(mine.map((v) => v.client_id)).size,
      today: mine.filter((v) => v.visit_date === t).length,
      planned: mine.length ? Math.round(100 * mine.filter((v) => v.visit_type === 'Planned').length / mine.length) : null,
      open: myFu.length, overdue: myFu.filter((f) => f.due_date < t).length, last: lv && lv.visit_date,
    };
  }).sort((a, b) => b.visits - a.visits);

  const potRank = { High: 0, Medium: 1, Low: 2 };
  const neglected = S.clients
    .filter((c) => c.rep_id && (!lastVisit[c.id] || daysBetween(lastVisit[c.id], t) > 30))
    .sort((a, b) => (potRank[a.potentiality] ?? 3) - (potRank[b.potentiality] ?? 3) || (lastVisit[a.id] || '').localeCompare(lastVisit[b.id] || ''));

  view.innerHTML = `
    <div class="row-between">
      <div class="hello"><div><div class="muted small">${fmtDate(t)}</div><h2>Hi, ${esc(S.me.full_name.split(' ')[0])}</h2></div></div>
      <select id="period" class="compact">${[['week', 'This week'], ['month', 'This month'], ['d30', 'Last 30 days']].map(([k, l]) => opt(k, l, k === period)).join('')}</select>
    </div>
    <div class="stats four">
      <a class="stat" href="#/visits?range=${period}"><b>${pv.length}</b><span>visits</span></a>
      <div class="stat"><b>${new Set(pv.map((v) => v.client_id)).size}</b><span>clients covered</span></div>
      <a class="stat" href="#/followups"><b>${fus.length}</b><span>open follow-ups</span></a>
      <a class="stat ${overdue.length ? 'bad' : ''}" href="#/followups"><b>${overdue.length}</b><span>overdue</span></a>
    </div>
    <section><h3>Team</h3>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Rep</th><th>Today</th><th>Visits</th><th>Clients</th><th>Planned</th><th>Open FU</th><th>Overdue</th><th>Last visit</th></tr></thead>
        <tbody>${repStats.map((r) => `<tr data-rep="${r.p.id}">
          <td><b>${esc(r.p.full_name)}</b></td><td>${r.today}</td><td>${r.visits}</td><td>${r.clients}</td>
          <td>${r.planned == null ? '—' : r.planned + '%'}</td><td>${r.open}</td>
          <td class="${r.overdue ? 'red' : ''}">${r.overdue}</td><td class="small">${r.last ? relDay(r.last) : '—'}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">No reps assigned to you yet.</td></tr>'}
        </tbody></table></div>
      <p class="muted small">Tap a rep to see his visits.</p>
    </section>
    <section><h3 class="red">Overdue follow-ups <span class="count">${overdue.length}</span></h3>
      ${overdue.slice(0, 10).map((f) => fuCard(f)).join('') || '<div class="empty">None 👍</div>'}
      ${overdue.length > 10 ? '<a class="link" href="#/followups">See all</a>' : ''}</section>
    ${dueSoon.length ? `<section><h3 class="amber">Due in the next ${CFG.REMIND_DAYS_BEFORE} days <span class="count">${dueSoon.length}</span></h3>${dueSoon.map((f) => fuCard(f)).join('')}</section>` : ''}
    <section><h3>Latest visits</h3>${pv.slice(0, 8).map((v) => `<div class="date-h">${fmtDate(v.visit_date)}</div>${visitRow(v)}`).join('') || '<div class="empty">No visits in this period.</div>'}
      ${pv.length > 8 ? `<a class="link" href="#/visits?range=${period}">See all ${pv.length} visits</a>` : ''}</section>
    <section><h3>Clients not visited for 30+ days <span class="count">${neglected.length}</span></h3>
      ${neglected.slice(0, 12).map((c) => `<a class="item" href="#/client/${c.id}"><div class="item-main"><div class="row-between"><b>${esc(c.name)}</b>${c.potentiality ? `<span class="pot ${c.potentiality.toLowerCase()}">${c.potentiality}</span>` : ''}</div>
        <div class="muted small">${esc(repName(c.rep_id))} · ${esc(areaName(c.area_id))} · ${lastVisit[c.id] ? 'last ' + relDay(lastVisit[c.id]) : 'never visited'}</div></div></a>`).join('') || '<div class="empty">All clients visited recently 👍</div>'}
      ${neglected.length > 12 ? '<a class="link" href="#/clients?sort=last">See all</a>' : ''}</section>
    <section><h3>Competitor activity</h3>${comp.slice(0, 5).map(compRow).join('') || '<div class="empty">No competitor info in this period.</div>'}
      <a class="link" href="#/competitors">Open price board</a></section>
    <a class="fab" href="#/visit/new" aria-label="Log a visit">＋</a>`;
  $('#period').onchange = (e) => go((asHome ? '/home' : '/dashboard') + '?p=' + e.target.value);
  $$('[data-rep]', view).forEach((tr) => (tr.onclick = () => go(`/visits?range=${period}&rep=${tr.dataset.rep}`)));
  bindFuActions(view, fus, () => route());
};

// ---------- MORE ----------
Pages.more = async (view) => {
  setTitle('More');
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  view.innerHTML = `
    <div class="card"><b>${esc(S.me.full_name)}</b><div class="muted small">${esc(S.me.email || '')} · ${S.me.role}${S.me.manager_id ? ' · manager: ' + esc(repName(S.me.manager_id)) : ''}</div></div>
    <div class="menu">
      <button id="pushBtn">🔔 Reminders on this phone <span class="muted small">${perm === 'granted' ? 'On' : perm === 'denied' ? 'Blocked in browser settings' : perm === 'unsupported' ? 'Install the app first' : 'Off — tap to enable'}</span></button>
      ${isManager() ? '<a href="#/dashboard">📊 Dashboard</a>' : ''}
      ${isManager() ? '<a href="#/import">⬆ Import clients from Excel</a>' : ''}
      ${isManager() ? '<a href="#/lists">🗂 Lists: areas, products, competitors</a>' : ''}
      ${isAdmin() ? '<a href="#/users">👥 Users & roles</a>' : ''}
      <button id="installBtn">📲 Install on phone</button>
      ${Data.LIVE ? '<button id="pwBtn">🔑 Change password</button>' : ''}
      <button id="outBtn" class="red">⎋ ${Data.LIVE ? 'Sign out' : 'Switch demo user'}</button>
    </div>
    <p class="muted small center">${esc(CFG.APP_NAME)} · ${Data.LIVE ? 'online' : 'demo mode — data stays in this browser'}</p>`;
  $('#pushBtn').onclick = enablePush;
  $('#installBtn').onclick = showInstallHelp;
  $('#outBtn').onclick = async () => { await Data.signOut(); S.me = null; location.hash = ''; renderLogin(); };
  if ($('#pwBtn')) $('#pwBtn').onclick = () => sheet('Change password', field('New password (min 6)', '<input name="pw" type="password" minlength="6" required>'),
    { onSubmit: async (fd) => { await Data.changePassword(fd.get('pw')); toast('Password changed'); } });
};

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
function showInstallHelp() {
  if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; return; }
  sheet('Install on your phone', `
    <p><b>Android (Chrome):</b> tap the ⋮ menu → <b>Add to Home screen</b> / <b>Install app</b>.</p>
    <p><b>iPhone (Safari):</b> tap the Share button ⬆ → <b>Add to Home Screen</b>. Then open the app from the home screen — reminders on iPhone only work this way (iOS 16.4 or newer).</p>`);
}

function b64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
async function enablePush() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return showInstallHelp();
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return toast('Notifications were not allowed. Enable them from the browser settings.', 'err');
  try {
    const reg = await navigator.serviceWorker.ready;
    if (CFG.VAPID_PUBLIC_KEY && Data.LIVE && reg.pushManager) {
      const sub = (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(CFG.VAPID_PUBLIC_KEY) }));
      await Data.savePushSubscription(sub);
    }
    reg.showNotification('Reminders are on ✓', { body: `You'll be reminded ${CFG.REMIND_DAYS_BEFORE} days before each follow-up and on the day.`, icon: 'icons/icon-192.png' });
    toast('Reminders enabled on this device');
    route();
  } catch (e) { toast('Could not enable: ' + errMsg(e), 'err'); }
}

// ---------- USERS (admin) ----------
Pages.users = async (view) => {
  if (!isAdmin()) return go('/more');
  setTitle('Users & roles', 'more');
  S.profiles = await Data.list('profiles', { order: 'full_name' });
  const managers = S.profiles.filter((p) => p.role !== 'rep');
  view.innerHTML = `
    <div class="card info small">${Data.LIVE
      ? 'To add a new person: Supabase dashboard → <b>Authentication → Users → Add user</b> (email + password, tick “Auto confirm”). He appears here as a rep — then set his name, role and manager.'
      : 'Demo mode: add users with the button below.'}</div>
    ${S.profiles.map((p) => `<div class="item user" data-uid="${p.id}"><div class="item-main">
      <div class="grid2">
        ${field('Name', `<input data-k="full_name" value="${esc(p.full_name)}">`)}
        ${field('Role', `<select data-k="role">${['rep', 'manager', 'admin'].map((r) => opt(r, r, r === p.role)).join('')}</select>`)}
      </div>
      <div class="grid2">
        ${field('Manager', `<select data-k="manager_id">${options(managers.filter((m) => m.id !== p.id), p.manager_id, { label: 'full_name', blank: '— none —' })}</select>`)}
        ${field('Phone', `<input data-k="phone" value="${esc(p.phone || '')}">`)}
      </div>
      <div class="row-between"><span class="muted small">${esc(p.email || '')}</span>
        <label class="switch"><input type="checkbox" data-k="active" ${p.active !== false ? 'checked' : ''}> <span>Active</span></label></div>
    </div></div>`).join('')}
    ${Data.LIVE ? '' : '<button class="btn block" id="addUser">＋ Add demo user</button>'}`;
  $$('[data-uid] [data-k]', view).forEach((el) => (el.onchange = async () => {
    const id = el.closest('[data-uid]').dataset.uid;
    const k = el.dataset.k;
    const v = el.type === 'checkbox' ? el.checked : (el.value || null);
    if (k === 'full_name' && !v) return toast('Name is required', 'err');
    try {
      await Data.update('profiles', id, { [k]: v });
      Object.assign(byId(S.profiles, id), { [k]: v });
      if (id === S.me.id) Object.assign(S.me, { [k]: v });
      toast('Saved');
      if (k === 'role') route();
    } catch (e) { toast(errMsg(e), 'err'); }
  }));
  if ($('#addUser')) $('#addUser').onclick = () => sheet('Add demo user', field('Name', '<input name="n" required>') + field('Email', '<input name="e" type="email" required>'),
    { onSubmit: async (fd) => { await Data.insert('profiles', { full_name: val(fd, 'n'), email: val(fd, 'e'), role: 'rep', manager_id: null, active: true }); route(); } });
};

// ---------- LISTS (areas / products / competitors) ----------
Pages.lists = async (view) => {
  if (!isManager()) return go('/more');
  setTitle('Lists', 'more');
  await loadLookups();
  const block = (table, title, rows, extra = () => '') => `
    <section data-table="${table}"><h3>${title} <span class="count">${rows.length}</span></h3>
      ${rows.map((r) => `<div class="item slim" data-id="${r.id}"><div class="item-main row-between">
        <span>${esc(r.name)}${extra(r)}</span>
        <span class="row gap-s">
          ${table === 'products' ? `<button class="btn sm ghost" data-a="toggle">${r.active === false ? 'Activate' : 'Hide'}</button>` : ''}
          <button class="btn sm ghost" data-a="rename">Rename</button>
          <button class="btn sm ghost red" data-a="del">✕</button></span></div></div>`).join('')}
      <form class="row gap add-row"><input name="name" placeholder="Add ${title.toLowerCase().replace(/s$/, '')}…" required><button class="btn">Add</button></form>
    </section>`;
  view.innerHTML =
    block('areas', 'Areas', S.areas) +
    block('products', 'Our products', S.products, (r) => (r.active === false ? ' <span class="muted small">(hidden)</span>' : '')) +
    block('competitors', 'Competitors', S.competitors, (r) => {
      const ps = S.competitor_products.filter((p) => p.competitor_id === r.id);
      return ps.length ? `<div class="muted small">${ps.map((p) => esc(p.name)).join(', ')}</div>` : '';
    });
  $$('section[data-table]', view).forEach((sec) => {
    const table = sec.dataset.table;
    $('form', sec).onsubmit = async (e) => {
      e.preventDefault();
      try { await Data.insert(table, { name: e.target.name.value.trim() }); toast('Added'); route(); } catch (err) { toast(errMsg(err), 'err'); }
    };
    $$('[data-a]', sec).forEach((b) => (b.onclick = async () => {
      const id = b.closest('[data-id]').dataset.id;
      const row = byId(S[table], id);
      try {
        if (b.dataset.a === 'toggle') { await Data.update(table, id, { active: row.active === false }); route(); }
        if (b.dataset.a === 'rename') {
          sheet('Rename', field('Name', `<input name="n" value="${esc(row.name)}" required>`),
            { onSubmit: async (fd) => { await Data.update(table, id, { name: val(fd, 'n') }); route(); } });
        }
        if (b.dataset.a === 'del') {
          sheet(`Delete “${row.name}”?`, `<p>${table === 'competitors' ? 'All its products and price entries will be deleted too.' : 'Records that use it will keep working but lose this link.'}</p>`,
            { submitLabel: 'Delete', danger: true, onSubmit: async () => { await Data.remove(table, id); toast('Deleted'); route(); } });
        }
      } catch (err) { toast(errMsg(err), 'err'); }
    }));
  });
};

// ---------- IMPORT CLIENTS ----------
const IMPORT_COLS = ['Name', 'Area', 'Rep email', 'Contact person', 'Title', 'Phone', 'Potentiality', 'Type'];
Pages.import = async (view) => {
  if (!isManager()) return go('/more');
  setTitle('Import clients', 'more');
  view.innerHTML = `
    <div class="card small">
      <p>Copy the rows from Excel and paste them below (or choose a CSV file). Columns in this order:</p>
      <p><code>${IMPORT_COLS.join(' | ')}</code></p>
      <p class="muted">Only <b>Name</b> is required. New areas are created automatically. Clients whose name already exists are skipped.</p>
    </div>
    <textarea id="paste" rows="8" placeholder="Paste rows here…"></textarea>
    <div class="row gap"><input type="file" id="file" accept=".csv,.txt"><button class="btn" id="preview">Preview</button></div>
    <div id="out"></div>`;
  $('#file').onchange = async (e) => { const f = e.target.files[0]; if (f) $('#paste').value = await f.text(); };
  $('#preview').onclick = () => {
    const text = $('#paste').value.trim();
    if (!text) return toast('Paste rows first', 'err');
    const sep = text.includes('\t') ? '\t' : ',';
    let rows = text.split(/\r?\n/).map((l) => l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ''))).filter((r) => r[0]);
    if (/^name$/i.test(rows[0][0])) rows = rows.slice(1);
    const existing = new Set(S.clients.map((c) => c.name.trim().toLowerCase()));
    const items = rows.map((r) => {
      const rep = r[2] ? S.profiles.find((p) => (p.email || '').toLowerCase() === r[2].toLowerCase()) : null;
      const pot = POTS.find((p) => p.toLowerCase() === (r[6] || '').toLowerCase().trim()) || (/med/i.test(r[6] || '') ? 'Medium' : null);
      return { r, rep, pot, dup: existing.has(r[0].toLowerCase()) };
    });
    const ok = items.filter((i) => !i.dup);
    $('#out').innerHTML = `
      <div class="table-wrap"><table class="table small"><thead><tr>${IMPORT_COLS.map((c) => `<th>${c}</th>`).join('')}<th></th></tr></thead>
      <tbody>${items.map((i) => `<tr class="${i.dup ? 'muted' : ''}">${IMPORT_COLS.map((_, k) => `<td>${esc(i.r[k] || '')}</td>`).join('')}
        <td>${i.dup ? 'exists – skip' : i.r[2] && !i.rep ? '<span class="red">rep not found</span>' : '✓'}</td></tr>`).join('')}</tbody></table></div>
      <button class="btn primary block" id="doImport" ${ok.length ? '' : 'disabled'}>Import ${ok.length} client${ok.length === 1 ? '' : 's'}</button>`;
    $('#doImport').onclick = async (e) => {
      e.target.disabled = true;
      let n = 0;
      try {
        for (const i of ok) {
          let areaId = null;
          const an = (i.r[1] || '').trim();
          if (an) {
            let a = S.areas.find((x) => x.name.trim().toLowerCase() === an.toLowerCase());
            if (!a) { a = await Data.insert('areas', { name: an }); S.areas.push(a); }
            areaId = a.id;
          }
          const c = await Data.insert('clients', {
            name: i.r[0], area_id: areaId, rep_id: i.rep ? i.rep.id : (isAdmin() ? null : S.me.id),
            contact_person: i.r[3] || null, contact_title: i.r[4] || null, phone: i.r[5] || null,
            potentiality: i.pot, client_type: i.r[7] || null,
          });
          S.clients.push(c); n++;
          e.target.textContent = `Importing… ${n}/${ok.length}`;
        }
        toast(`${n} clients imported`); go('/clients');
      } catch (err) { toast(`Stopped after ${n}: ${errMsg(err)}`, 'err'); e.target.disabled = false; }
    };
  };
};
