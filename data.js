// =====================================================================
//  Data layer — same API for LIVE (Supabase) and DEMO (browser storage)
//  list(table, {eq, gte, lte, in, order, desc, limit})
//  insert(table, row) / update(table, id, patch) / remove(table, id)
// =====================================================================
(function () {
  const cfg = window.APP_CONFIG;
  const LIVE = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const REP_TABLES = ['clients', 'visits', 'follow_ups', 'competitor_entries'];

  // ------------------------------------------------------------ LIVE
  let sb = null;
  const live = {
    async init() {
      if (!window.supabase) throw new Error('Could not load Supabase library. Check your internet connection.');
      sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
    },
    async currentUserId() {
      const { data } = await sb.auth.getSession();
      return data.session ? data.session.user.id : null;
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password' : error.message);
    },
    async signOut() { await sb.auth.signOut(); },
    async changePassword(pw) {
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) throw error;
    },
    async list(table, q = {}) {
      let all = [], from = 0;
      const page = 1000;
      // page through results so big tables are not cut at 1000 rows
      for (;;) {
        let r = sb.from(table).select('*');
        for (const [k, v] of Object.entries(q.eq || {})) r = r.eq(k, v);
        for (const [k, v] of Object.entries(q.gte || {})) r = r.gte(k, v);
        for (const [k, v] of Object.entries(q.lte || {})) r = r.lte(k, v);
        for (const [k, v] of Object.entries(q.in || {})) r = r.in(k, v);
        if (q.order) r = r.order(q.order, { ascending: !q.desc });
        const lim = q.limit ? Math.min(q.limit - all.length, page) : page;
        r = r.range(from, from + lim - 1);
        const { data, error } = await r;
        if (error) throw error;
        all = all.concat(data);
        if (data.length < lim || (q.limit && all.length >= q.limit)) break;
        from += lim;
      }
      return all;
    },
    async insert(table, row) {
      const { data, error } = await sb.from(table).insert(row).select().single();
      if (error) throw error;
      return data;
    },
    async update(table, id, patch) {
      const { data, error } = await sb.from(table).update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    async remove(table, id) {
      const { error } = await sb.from(table).delete().eq('id', id);
      if (error) throw error;
    },
    async savePushSubscription(sub) {
      const j = sub.toJSON();
      const uid = await live.currentUserId();
      const { error } = await sb.from('push_subscriptions').upsert(
        { user_id: uid, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
        { onConflict: 'endpoint' });
      if (error) throw error;
    },
  };

  // ------------------------------------------------------------ DEMO
  const KEY = 'fieldvisits_demo_v1';
  let db = null;
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
  const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };

  function seed() {
    const P = { admin: uid(), mgr: uid(), r1: uid(), r2: uid() };
    const areas = ['قويسنا', 'العبور', 'الزقازيق', 'بلبيس', 'منيا القمح', 'صان الحجر', 'ابو حماد'].map((name) => ({ id: uid(), name }));
    const A = Object.fromEntries(areas.map((a) => [a.name, a.id]));
    const products = [
      ['Methionine Liquid', 'Amino acids'], ['Methionine Powder', 'Amino acids'], ['Threonine', 'Amino acids'],
      ['Vitamin premix', 'Premix'], ['Enzymes', 'Additives'],
    ].map(([name, category]) => ({ id: uid(), name, category, active: true }));
    const comp = ['Evonik', 'Chinese generic', 'Hendrix'].map((name) => ({ id: uid(), name }));
    const cprod = [
      { id: uid(), competitor_id: comp[0].id, name: 'Methionine powder' },
      { id: uid(), competitor_id: comp[1].id, name: 'Threonine' },
      { id: uid(), competitor_id: comp[2].id, name: 'Layer concentrate' },
    ];
    const C = (name, area, rep, contact, pot, type, notes = '') =>
      ({ id: uid(), name, area_id: A[area], rep_id: rep, contact_person: contact, potentiality: pot, client_type: type, phone: '', notes, created_at: new Date().toISOString() });
    const clients = [
      C('المتميز', 'قويسنا', P.r1, 'خالد رزق', 'Medium', 'Feed mill'),
      C('الهدى', 'قويسنا', P.r1, 'احمد عادل', 'Medium', 'Feed mill'),
      C('محمد بدوي', 'الزقازيق', P.r1, 'محمد بدوي', 'Medium', 'Feed mill'),
      C('المحروسه', 'بلبيس', P.r1, 'احمد الهلالي', 'Low', 'Feed mill'),
      C('خير مصر', 'منيا القمح', P.r2, 'احمد ابو الخير', 'Medium', 'Feed mill', 'Capacity ~1000 ton'),
      C('مجمع انتاج البيض', 'العبور', P.r2, 'سامح حلاوه', 'High', 'Layer farm'),
      C('احمد صلاح', 'الزقازيق', P.r2, 'احمد صلاح', 'Medium', 'Farm'),
    ];
    const V = (ci, d, obj, fb, prods = []) => ({
      id: uid(), rep_id: clients[ci].rep_id, client_id: clients[ci].id, visit_date: daysFromNow(d), visit_type: 'Planned',
      objective: obj, contact_person: clients[ci].contact_person, product_ids: prods.map((i) => products[i].id), feedback: fb,
      created_at: new Date().toISOString(),
    });
    const visits = [
      V(0, -9, 'Introduction', 'قال لما الليكويد يجي ابلغه', [0]),
      V(1, -9, 'Price follow-up', 'بيجيب مثيونين ايفونيك ب 270 وجاب اخر مره ثيرونين ب 240', [1, 2]),
      V(2, -8, 'Follow-up', 'عرفته ان ليكويد جاي بعد العيد', [0]),
      V(3, -8, 'Follow-up', 'مثيونين بودر قدامه رينج اسبوعين ويخلص عنده وشغال ب سيرونين صيني', [1]),
      V(4, -1, 'Introduction', 'حاليا طاقته 1000 طن بس معندوش مانع في الليكويد', [0]),
      V(5, 0, 'Introduction', 'بيجيب مركز من هندركس', [3]),
      V(6, 0, 'Introduction', 'بيجيب علف من ابو حنفي', []),
    ];
    const F = (vi, type, d, note, status = 'Open') => ({
      id: uid(), visit_id: visits[vi].id, client_id: visits[vi].client_id, rep_id: visits[vi].rep_id,
      fu_type: type, due_date: daysFromNow(d), note, status, postponed_count: 0, created_at: new Date().toISOString(),
    });
    const follow_ups = [
      F(3, 'Expected order', 2, 'Methionine powder runs out in 2 weeks — expects order'),
      F(0, 'Call back', -1, 'Tell him when liquid arrives'),
      F(2, 'Visit again', 6, 'Liquid arriving after Eid'),
      F(4, 'Send sample', 12, 'Ask Dr. Mosaad about liquid trial'),
    ];
    const E = (cp, ci, d, price, unit, notes) => ({
      id: uid(), rep_id: clients[ci].rep_id, competitor_product_id: cprod[cp].id, client_id: clients[ci].id,
      area_id: clients[ci].area_id, entry_date: daysFromNow(d), price, unit, notes, created_at: new Date().toISOString(),
    });
    const competitor_entries = [
      E(0, 1, -9, 270, 'kg', ''), E(1, 1, -9, 240, 'kg', 'Last purchase'),
      E(1, 3, -8, null, 'kg', 'Using Chinese threonine'), E(2, 5, 0, null, 'ton', 'Buying concentrate from Hendrix'),
    ];
    return {
      currentUser: null,
      profiles: [
        { id: P.admin, full_name: 'Admin', email: 'admin@demo', role: 'admin', manager_id: null, active: true },
        { id: P.mgr, full_name: 'Kamal (Manager)', email: 'manager@demo', role: 'manager', manager_id: null, active: true },
        { id: P.r1, full_name: 'Ahmed (Rep)', email: 'ahmed@demo', role: 'rep', manager_id: P.mgr, active: true },
        { id: P.r2, full_name: 'Omar (Rep)', email: 'omar@demo', role: 'rep', manager_id: P.mgr, active: true },
      ],
      areas, products, competitors: comp, competitor_products: cprod, clients, visits, follow_ups, competitor_entries,
      push_subscriptions: [],
    };
  }

  function canSee(repId) {
    const me = db.profiles.find((p) => p.id === db.currentUser);
    if (!me) return false;
    if (me.role === 'admin' || repId === me.id) return true;
    if (repId == null) return me.role === 'manager';
    const p = db.profiles.find((x) => x.id === repId);
    return !!p && p.manager_id === me.id;
  }

  const demo = {
    async init() {
      try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { db = null; }
      if (!db) { db = seed(); save(); }
    },
    async currentUserId() { return db.currentUser; },
    async signIn(email) {
      const p = db.profiles.find((x) => x.email === email || x.id === email);
      if (!p) throw new Error('Unknown demo user');
      db.currentUser = p.id; save();
    },
    async signOut() { db.currentUser = null; save(); },
    async changePassword() {},
    demoUsers() { return db.profiles; },
    reset() { localStorage.removeItem(KEY); },
    async list(table, q = {}) {
      let rows = (db[table] || []).slice();
      if (REP_TABLES.includes(table)) rows = rows.filter((r) => canSee(r.rep_id));
      for (const [k, v] of Object.entries(q.eq || {})) rows = rows.filter((r) => r[k] === v);
      for (const [k, v] of Object.entries(q.gte || {})) rows = rows.filter((r) => r[k] != null && r[k] >= v);
      for (const [k, v] of Object.entries(q.lte || {})) rows = rows.filter((r) => r[k] != null && r[k] <= v);
      for (const [k, v] of Object.entries(q.in || {})) rows = rows.filter((r) => v.includes(r[k]));
      if (q.order) rows.sort((a, b) => ((a[q.order] ?? '') > (b[q.order] ?? '') ? 1 : -1) * (q.desc ? -1 : 1));
      if (q.limit) rows = rows.slice(0, q.limit);
      return JSON.parse(JSON.stringify(rows));
    },
    async insert(table, row) {
      const r = { id: uid(), created_at: new Date().toISOString(), ...row };
      if (REP_TABLES.includes(table) && !r.rep_id) r.rep_id = db.currentUser;
      db[table] = db[table] || [];
      db[table].push(r); save();
      return JSON.parse(JSON.stringify(r));
    },
    async update(table, id, patch) {
      const r = db[table].find((x) => x.id === id);
      if (!r) throw new Error('Not found');
      Object.assign(r, patch); save();
      return JSON.parse(JSON.stringify(r));
    },
    async remove(table, id) { db[table] = db[table].filter((x) => x.id !== id); save(); },
    async savePushSubscription() {},
  };

  window.Data = Object.assign(LIVE ? live : demo, { LIVE });
})();
