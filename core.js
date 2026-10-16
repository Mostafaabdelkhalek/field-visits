// =====================================================================
//  Core: state, helpers, router, layout
// =====================================================================
const CFG = window.APP_CONFIG;
const S = {          // app state / cache
  me: null,
  profiles: [], areas: [], products: [], competitors: [], competitor_products: [], clients: [],
};
const Pages = {};    // route name -> async render function

// ---------- small helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byId = (arr, id) => arr.find((x) => x.id === id);
const nameOf = (arr, id, field = 'name') => (byId(arr, id) || {})[field] || '';
const repName = (id) => nameOf(S.profiles, id, 'full_name') || '—';
const clientName = (id) => nameOf(S.clients, id) || '(client not visible)';
const areaName = (id) => nameOf(S.areas, id);
const productName = (id) => nameOf(S.products, id);
const cprodLabel = (id) => {
  const cp = byId(S.competitor_products, id);
  if (!cp) return '';
  return `${nameOf(S.competitors, cp.competitor_id)} — ${cp.name}`;
};
const isManager = () => S.me && (S.me.role === 'manager' || S.me.role === 'admin');
const isAdmin = () => S.me && S.me.role === 'admin';

// ---------- dates ----------
const fmtISO = (d) => d.toLocaleDateString('en-CA');            // YYYY-MM-DD local
const today = () => fmtISO(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return fmtISO(d); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
const weekStart = (iso = today()) => {
  const d = new Date(iso + 'T12:00:00');
  const diff = (d.getDay() - CFG.WEEK_START + 7) % 7;
  return addDays(iso, -diff);
};
const monthStart = (iso = today()) => iso.slice(0, 8) + '01';
const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso.slice(0, 10) + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};
const relDay = (iso) => {
  const n = daysBetween(today(), iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
};

// ---------- UI feedback ----------
function toast(msg, kind = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}
function errMsg(e) { return (e && (e.message || e.error_description)) || String(e); }

// Bottom-sheet modal. Returns the sheet element. onSubmit(formData, sheet) may return false to keep open.
function sheet(title, bodyHtml, { submitLabel = 'Save', onSubmit, danger = false } = {}) {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <form class="sheet-body">${bodyHtml}
        ${onSubmit ? `<div class="sheet-actions"><button type="button" class="btn ghost" data-close>Cancel</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" type="submit">${esc(submitLabel)}</button></div>` : ''}
      </form>
    </div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) closeSheet(); });
  const form = $('form', wrap);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return;
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    try {
      const keep = await onSubmit(new FormData(form), wrap);
      if (keep !== false) closeSheet();
    } catch (err) { toast(errMsg(err), 'err'); }
    btn.disabled = false;
  });
  setTimeout(() => wrap.classList.add('open'), 10);
  return wrap;
}
function closeSheet() { $$('.sheet-wrap').forEach((w) => w.remove()); }

// ---------- form helpers ----------
const opt = (v, label, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(label)}</option>`;
const options = (arr, selected, { value = 'id', label = 'name', blank } = {}) =>
  (blank != null ? opt('', blank, !selected) : '') + arr.map((x) => opt(x[value], x[label], x[value] === selected)).join('');
const field = (label, inner, hint = '') => `<label class="field"><span>${esc(label)}</span>${inner}${hint ? `<small>${hint}</small>` : ''}</label>`;
const val = (fd, k) => { const v = fd.get(k); return v == null || v === '' ? null : String(v).trim(); };

// ---------- lookups ----------
async function loadLookups() {
  const [profiles, areas, products, competitors, competitor_products, clients] = await Promise.all([
    Data.list('profiles', { order: 'full_name' }),
    Data.list('areas', { order: 'name' }),
    Data.list('products', { order: 'name' }),
    Data.list('competitors', { order: 'name' }),
    Data.list('competitor_products', { order: 'name' }),
    Data.list('clients', { order: 'name' }),
  ]);
  Object.assign(S, { profiles, areas, products, competitors, competitor_products, clients });
}
const myReps = () => S.profiles.filter((p) => p.active !== false && (isAdmin() ? true : p.id === S.me.id || p.manager_id === S.me.id));

// ---------- router ----------
function go(path) { if (location.hash !== '#' + path) location.hash = path; else route(); }
function parseRoute() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0].split('/');
  const query = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
  return { name: parts[0], args: parts.slice(1), query };
}
const NAV = [
  { r: 'home', icon: '⌂', label: 'Home' },
  { r: 'visits', icon: '✎', label: 'Visits' },
  { r: 'clients', icon: '☷', label: 'Clients' },
  { r: 'followups', icon: '⏰', label: 'Follow-ups' },
  { r: 'competitors', icon: '⚑', label: 'Competitors' },
  { r: 'more', icon: '☰', label: 'More' },
];
async function route() {
  closeSheet();
  if (!S.me) return renderLogin();
  const { name, args, query } = parseRoute();
  const page = Pages[name] || Pages.home;
  const view = $('#view');
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.r === name || (name === 'visit' && a.dataset.r === 'visits') || (name === 'client' && a.dataset.r === 'clients')));
  view.innerHTML = '<div class="loading">Loading…</div>';
  window.scrollTo(0, 0);
  try { await page(view, args, query); }
  catch (e) { console.error(e); view.innerHTML = `<div class="card err">Something went wrong: ${esc(errMsg(e))}</div>`; }
}
function setTitle(t, back) {
  $('#title').textContent = t;
  const b = $('#back');
  b.hidden = !back;
  b.onclick = () => (history.length > 1 ? history.back() : go(back));
}

function renderShell() {
  document.body.innerHTML = `
    <header class="topbar">
      <button id="back" class="icon-btn" hidden aria-label="Back">‹</button>
      <h1 id="title">${esc(CFG.APP_NAME)}</h1>
      ${Data.LIVE ? '' : '<span class="demo-tag" title="Demo mode — data is saved only in this browser">DEMO</span>'}
    </header>
    <main id="view"></main>
    <nav class="nav">${NAV.map((n) => `<a href="#/${n.r}" data-r="${n.r}"><i>${n.icon}</i><span>${n.label}</span></a>`).join('')}</nav>`;
}

// ---------- login ----------
function renderLogin() {
  document.body.innerHTML = `
  <div class="login">
    <div class="login-card">
      <div class="logo">FV</div>
      <h1>${esc(CFG.APP_NAME)}</h1>
      <p class="muted">${esc(CFG.COMPANY_NAME)} — sales visits</p>
      ${Data.LIVE ? `
      <form id="loginForm">
        ${field('Email', '<input name="email" type="email" autocomplete="username" required>')}
        ${field('Password', '<input name="password" type="password" autocomplete="current-password" required>')}
        <button class="btn primary block" type="submit">Sign in</button>
        <p class="muted small center">Accounts are created by the admin.</p>
      </form>` : `
      <p class="demo-note">Demo mode: pick a user to see the app from their side. Data is stored only in this browser.</p>
      <div class="demo-users">${Data.demoUsers().map((p) => `<button class="btn block ${p.role === 'rep' ? '' : 'ghost'}" data-u="${p.id}">${esc(p.full_name)} <small>${p.role}</small></button>`).join('')}</div>
      <button class="link small" id="resetDemo">Reset demo data</button>`}
    </div>
  </div>`;
  if (Data.LIVE) {
    $('#loginForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const btn = $('button', e.target); btn.disabled = true; btn.textContent = 'Signing in…';
      try { await Data.signIn(fd.get('email').trim(), fd.get('password')); await boot(); }
      catch (err) { toast(errMsg(err), 'err'); btn.disabled = false; btn.textContent = 'Sign in'; }
    };
  } else {
    $$('[data-u]').forEach((b) => (b.onclick = async () => { await Data.signIn(b.dataset.u); await boot(); }));
    $('#resetDemo').onclick = () => { Data.reset(); location.reload(); };
  }
}

async function boot() {
  try {
    await Data.init();
    const id = await Data.currentUserId();
    if (!id) { S.me = null; return renderLogin(); }
    await loadLookups();
    S.me = byId(S.profiles, id);
    if (!S.me || S.me.active === false) {
      await Data.signOut(); S.me = null; renderLogin();
      return toast('Your account is not active. Contact the admin.', 'err');
    }
    renderShell();
    if (!location.hash || location.hash === '#/') location.hash = '#/home';
    route();
  } catch (e) {
    console.error(e);
    document.body.innerHTML = `<div class="login"><div class="login-card"><h1>Cannot start</h1><p>${esc(errMsg(e))}</p><button class="btn primary" onclick="location.reload()">Retry</button></div></div>`;
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', boot);
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
