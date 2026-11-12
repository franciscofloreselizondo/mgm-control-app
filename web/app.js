/* MGM Control App v2 · captura manual */
(() => {
'use strict';
const CFG = window.MGM_CONFIG || {};

// ---------- utilidades ----------
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => ymd(new Date());
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const add = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const dow = s => parse(s).getDay();
const monday = s => { const w = dow(s); return add(s, w === 0 ? -6 : 1 - w); };
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_L = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fmt = s => { if (!s) return '—'; const d = parse(s); return DIAS[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()]; };
const fmtMes = m => MESES_L[+m.slice(5) - 1] + ' ' + m.slice(0, 4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n * 100) / 100).toLocaleString('es-MX');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
const $ = id => document.getElementById(id);
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } };

const ICON = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  task: '<path d="M9 11l2 2 4-4"/><rect x="4" y="4" width="16" height="16" rx="3"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M3 4h2l2.4 11h11l2-8H7"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'
};
let DEFAULT_BAR = '';
const APP_VER = '23';
const TABLES = ['properties', 'cleaners', 'cleaning_rates', 'settings', 'app_users', 'reservations', 'blocks', 'days_off',
  'payroll_extras', 'payroll_payments', 'transactions', 'tasks', 'purchases', 'access_codes', 'cleanings'];
const CAT_GASTO = ['Gasto por inversión', 'Limpieza', 'Lavandería', 'Productos de limpieza', 'Mantenimiento del edificio', 'Fumigación',
  'Reparaciones menores', 'Pintura', 'Limpieza de muebles', 'Mantenimiento AC', 'Gas', 'Luz', 'Internet', 'Agua', 'Predial', 'Otro'];
const CAT_INGRESO = ['Ingreso por reserva', 'Otros ingresos'];
const EXTRA_PLACES = ['Bodega Qalina', 'Caja fuerte Qalina'];
const ST = { en_proceso: 'En proceso', en_pausa: 'En pausa', terminado: 'Terminado' };
const PR = { alta: 'Alta', media: 'Media', baja: 'Baja' };
const PR_ORD = { alta: 0, media: 1, baja: 2 };

// ---------- capa de datos: Supabase ----------
function supaDB() {
  const sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  const m = (q, match) => { for (const k in match) q = q.eq(k, match[k]); return q; };
  const e = r => (r.error ? r.error.message : null);
  return {
    async session() { const { data: { session } } = await sb.auth.getSession(); return session ? session.user.email : null; },
    onAuth(cb) { sb.auth.onAuthStateChange((_e, s) => cb(s ? s.user.email : null)); },
    async sendCode(email) { return e(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } })); },
    async verifyCode(email, token) { return e(await sb.auth.verifyOtp({ email, token, type: 'email' })); },
    async google() { return e(await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } })); },
    logout() { return sb.auth.signOut(); },
    async load(t) {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const r = await sb.from(t).select('*').range(from, from + 999);
        if (r.error) return { error: r.error.message };
        rows.push(...r.data); if (r.data.length < 1000) break;
      }
      return { rows };
    },
    async insert(t, row) { return e(await sb.from(t).insert(row)); },
    async update(t, match, patch) { return e(await m(sb.from(t).update(patch), match)); },
    async remove(t, match) { return e(await m(sb.from(t).delete(), match)); },
    async upsert(t, row, pk) { return e(await sb.from(t).upsert(row, { onConflict: pk.join(',') })); },
    async upload(blob) {
      const path = today().slice(0, 7) + '/' + uid() + '.jpg';
      const r = await sb.storage.from('comprobantes').upload(path, blob, { contentType: 'image/jpeg' });
      if (r.error) throw new Error(r.error.message); return path;
    },
    async setAvatar(img) { return e(await sb.rpc('set_my_avatar', { img })); },
    async photoUrl(path) { const r = await sb.storage.from('comprobantes').createSignedUrl(path, 3600); return r.data ? r.data.signedUrl : ''; },
    subscribe(onChange, onState) {
      const ch = sb.channel('mgm');
      TABLES.forEach(t => ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => onChange(t)));
      ch.subscribe(s => onState(s === 'SUBSCRIBED'));
    }
  };
}

// ---------- capa de datos: maqueta (se guarda en este navegador) ----------
function demoDB() {
  const KEY = 'mgm-demo-v6';
  const seed = () => JSON.parse(JSON.stringify(window.MGM_SEED || {}));
  let T = ls.get(KEY, null) || seed();
  let role = ls.get(KEY + '-role', 'superadmin');
  const fix = () => TABLES.forEach(t => { T[t] = T[t] || []; });
  fix();
  const save = () => ls.set(KEY, T);
  const hit = (r, match) => Object.keys(match).every(k => r[k] === match[k]);
  return {
    demo: true,
    get role() { return role; },
    setRole(r) { role = r; ls.set(KEY + '-role', r); },
    reset(examples) { T = seed(); fix(); if (examples && window.MGM_EXAMPLES) window.MGM_EXAMPLES(T, { today, add, uid, monday }); save(); },
    async session() { return { superadmin: 'maria@ejemplo.com', socio: 'mike@ejemplo.com', finanzas: 'sandy@ejemplo.com' }[role] || 'maria@ejemplo.com'; },
    onAuth() {}, async sendCode() { return null; }, async verifyCode() { return null; }, async google() { return null; }, logout() {},
    async load(t) { return { rows: JSON.parse(JSON.stringify(T[t])) }; },
    async insert(t, row) { T[t].push({ ...row }); save(); return null; },
    async update(t, match, patch) { T[t].forEach(r => { if (hit(r, match)) Object.assign(r, patch); }); save(); return null; },
    async remove(t, match) { T[t] = T[t].filter(r => !hit(r, match)); save(); return null; },
    async upsert(t, row, pk) { const i = T[t].findIndex(r => pk.every(k => r[k] === row[k])); if (i >= 0) Object.assign(T[t][i], row); else T[t].push({ ...row }); save(); return null; },
    upload(blob) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); }); },
    async setAvatar(img) { const u = T.app_users.find(x => x.role === role); if (u) { u.avatar = img; save(); } return null; },
    async photoUrl(path) { return path; },
    subscribe(_c, onState) { onState(true); }
  };
}
const DB = CFG.DEMO ? demoDB() : supaDB();

// ---------- estado ----------
const S = {
  t: Object.fromEntries(TABLES.map(t => [t, []])), email: null, me: null, live: false,
  tab: (location.hash || '#hoy').slice(1), dia: today(), semana: monday(today()), calMes: today().slice(0, 7), calScroll: true,
  zoom: ls.get('mgm-zoom', 1),
  f: {
    res: { show: 'proximas', depa: '' },
    fin: { kind: 'gasto', mes: today().slice(0, 7), depa: '', cat: '' },
    task: { depa: '', status: '', prio: '', resp: '', sort: 'prio' },
    buy: { estado: 'pend', resp: '', store: '', sort: 'date' }
  }
};
const esCajon = p => p.kind === 'cajon';
const cajonesSueltos = () => S.t.properties.filter(p => p.active !== false && esCajon(p)).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
const limpiaMGM = c => (prop(c) || {}).cleaning !== false;
const props = () => S.t.properties.filter(p => p.active !== false && !esCajon(p)).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
const prop = c => S.t.properties.find(p => p.code === c);
const isQ = c => (prop(c) || {}).building === 'Qalina';
const cleaners = () => S.t.cleaners.filter(c => c.active !== false).sort((a, b) => a.name.localeCompare(b.name));
const nombre = k => (S.t.cleaners.find(c => c.key === k) || {}).name || k || '';
const rate = (p, k) => { const r = S.t.cleaning_rates.find(x => x.property_code === p && x.cleaner_key === k); return r ? Number(r.amount) : null; };
const setting = (k, d) => { const s = S.t.settings.find(x => x.key === k); return s ? s.value : d; };
const activas = () => S.t.reservations.filter(r => r.status !== 'cancelada');
const descansa = (d, k) => S.t.days_off.some(o => o.date === d && o.cleaner_key === k);
const bloqueado = (p, d) => S.t.blocks.find(b => b.property_code === p && b.date_from <= d && d <= b.date_to);
const ocupadas = d => activas().filter(r => r.checkin <= d && d < r.checkout);
const sinCajon = r => isQ(r.property_code) && r.has_car === true && !(prop(r.property_code) || {}).has_parking && !r.parking_from;
const corto = c => String(c || '').replace(/^Q-/, '');

function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3000); }

// ---------- escritura (optimista) ----------
const hit = (r, match) => Object.keys(match).every(k => r[k] === match[k]);
async function done(p, t, okMsg) { const err = await p; if (err) { toast('No se guardó: ' + err); reload(t); return false; } if (okMsg) toast(okMsg); return true; }
// Deshacer: cada cambio guarda su inverso; los cambios de una misma acción (< 1.5 s) se agrupan
const UNDO = []; let undoing = false, undoT = 0;
const keyOf = r => r.id != null ? { id: r.id } : r.key != null ? { key: r.key } : r.code != null ? { code: r.code } : null;
function pushUndo(t, ops, label) {
  if (undoing || !ops.length) return; const now = Date.now();
  if (UNDO.length && now - undoT < 1500) UNDO[UNDO.length - 1].ops.push(...ops); else UNDO.push({ ops, label: label || 'cambio' });
  undoT = now; if (UNDO.length > 30) UNDO.shift();
}
async function deshacer() {
  const u = UNDO.pop(); if (!u) return toast('Nada que deshacer');
  undoing = true;
  try { for (const op of u.ops.reverse()) { if (op.a === 'del') await del(op.t, op.m); else if (op.a === 'ins') await ins(op.t, op.row); else await upd(op.t, op.m, op.p); } }
  finally { undoing = false; }
  toast('Deshecho: ' + u.label);
}
function ins(t, row, msg) { const k = keyOf(row); pushUndo(t, [k ? { a: 'del', t, m: k } : { a: 'del', t, m: { ...row } }], msg); S.t[t].push(row); render(); return done(DB.insert(t, row), t, msg); }
function upd(t, match, patch, msg) {
  const ops = []; S.t[t].forEach(r => { if (hit(r, match)) { ops.push({ a: 'upd', t, m: keyOf(r) || match, p: Object.fromEntries(Object.keys(patch).map(k => [k, r[k] === undefined ? null : r[k]])) }); Object.assign(r, patch); } });
  pushUndo(t, ops, msg); render(); return done(DB.update(t, match, patch), t, msg);
}
function del(t, match, msg) { pushUndo(t, S.t[t].filter(r => hit(r, match)).map(r => ({ a: 'ins', t, row: JSON.parse(JSON.stringify(r)) })), msg); S.t[t] = S.t[t].filter(r => !hit(r, match)); render(); return done(DB.remove(t, match), t, msg); }
function ups(t, row, pk, msg) {
  const i = S.t[t].findIndex(r => pk.every(k => r[k] === row[k])), m = Object.fromEntries(pk.map(k => [k, row[k]]));
  pushUndo(t, [i >= 0 ? { a: 'upd', t, m, p: Object.fromEntries(Object.keys(row).map(k => [k, S.t[t][i][k] === undefined ? null : S.t[t][i][k]])) } : { a: 'del', t, m }], msg);
  if (i >= 0) Object.assign(S.t[t][i], row); else S.t[t].push(row); render(); return done(DB.upsert(t, row, pk), t, msg);
}
async function reload(t) { const r = await DB.load(t); if (r.rows) { S.t[t] = r.rows; render(); } }

// ---------- sesión ----------
async function start() {
  if (!CFG.DEMO && !CFG.SUPABASE_URL) { document.body.innerHTML = '<p style="padding:24px">Falta config.js con SUPABASE_URL y SUPABASE_ANON_KEY.</p>'; return; }
  DB.onAuth(email => { if (email && !S.email) boot(email); if (!email && S.email) showLogin(); });
  const email = await DB.session();
  email ? boot(email) : showLogin();
  if (!CFG.DEMO && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!CFG.DEMO) { // actualización automática: al volver a la app revisa si hay versión nueva y recarga
    const chk = async () => { try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); const v = (await r.json()).v;
      if (v && v !== APP_VER && sessionStorage.getItem('mgm_rl') !== v) { sessionStorage.setItem('mgm_rl', v); try { const rg = await navigator.serviceWorker?.getRegistration(); await rg?.update(); } catch (_) {} location.reload(); } } catch (_) {} };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') chk(); });
    setInterval(chk, 10 * 60 * 1000); chk();
  }
}
function showLogin() { S.email = null; $('shell').hidden = true; $('login').hidden = false; }
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const err = await DB.sendCode($('email').value.trim().toLowerCase());
  $('loginMsg').textContent = err ? 'Error: ' + err : 'Te mandamos un código. Escríbelo aquí (o abre el enlace del correo).';
  if (!err) { $('codeForm').hidden = false; $('code').focus(); }
});
$('codeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const err = await DB.verifyCode($('email').value.trim().toLowerCase(), $('code').value.trim());
  if (err) $('loginMsg').textContent = 'Código incorrecto o vencido. Pide uno nuevo.';
});
if (CFG.GOOGLE) { $('btnGoogle').hidden = false; $('orLine').textContent = 'o con un código a tu correo'; }
$('btnGoogle').addEventListener('click', async () => { const err = await DB.google(); if (err) $('loginMsg').textContent = 'Error: ' + err; });
async function boot(email) {
  S.email = email; $('login').hidden = true; $('shell').hidden = false;
  $('view').innerHTML = '<div class="empty">Cargando…</div>';
  const res = await Promise.all(TABLES.map(t => DB.load(t)));
  TABLES.forEach((t, i) => { S.t[t] = res[i].rows || []; });
  S.me = S.t.app_users.find(u => (u.email || '').toLowerCase() === email.toLowerCase()) || null;
  render();
  const timers = {};
  DB.subscribe(t => { clearTimeout(timers[t]); timers[t] = setTimeout(() => reload(t), 400); }, ok => { S.live = ok; renderLive(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !CFG.DEMO) TABLES.forEach(reload); });
}

// ---------- navegación ----------
const MAIN = ['hoy', 'reservas', 'calendario', 'nomina', 'menu'];
const MENU = [
  ['cajones', 'Cajones Qalina', 'Quién trae auto y qué cajón usa'],
  ['limpiezas', 'Limpiezas', 'Descansos y tarifas'],
  ['finanzas', 'Gastos e ingresos', 'Captura, fotos y exportar a Excel'],
  ['pendientes', 'Pendientes', 'Tareas por departamento'],
  ['compras', 'Compras', 'Lista de compras pendientes'],
  ['claves', 'Claves', 'Claves de puerta, bodega y caja fuerte'],
  ['ligas', 'Ligas Airbnb', 'Liga de cada anuncio para copiar'],
  ['supuestos', 'Supuestos', 'Chicas, cajones, bono, usuarios']
];
const ROLES = { superadmin: 'Superadmin · acceso a todo', socio: 'Socio · calendario, pendientes, compras, claves y ligas', finanzas: 'Finanzas · solo gastos e ingresos' };
const ROLE_OPTS = [['superadmin', 'Superadmin (todo)'], ['socio', 'Socio (calendario, pendientes, compras, claves, ligas)'], ['finanzas', 'Finanzas (solo gastos e ingresos)']];
const ACCESS = {
  superadmin: { home: 'hoy', bar: null },
  socio: { home: 'hoy', bar: [['hoy', 'Hoy', ICON.home, 1], ['calendario', 'Calendario', ICON.cal], ['pendientes', 'Pendientes', ICON.task], ['compras', 'Compras', ICON.cart], ['claves', 'Claves', ICON.key], ['ligas', 'Ligas', ICON.link]] },
  finanzas: { home: 'finanzas', bar: [] }
};
const isSuper = () => S.me && S.me.role === 'superadmin';
const homeTab = () => (ACCESS[S.me && S.me.role] || ACCESS.superadmin).home;
let barRole = null;
function setupTabbar() {
  const role = S.me.role; if (barRole === role) return; barRole = role;
  if (!DEFAULT_BAR) DEFAULT_BAR = $('tabbar').innerHTML;
  const acc = ACCESS[role] || ACCESS.superadmin;
  if (!acc.bar) { $('tabbar').innerHTML = DEFAULT_BAR; $('tabbar').style.gridTemplateColumns = ''; return; }
  $('tabbar').innerHTML = acc.bar.map(([t, l, ic, bdg]) => `<button data-t="${t}"><svg viewBox="0 0 24 24">${ic}</svg><span>${l}</span>${bdg ? '<i id="badge" hidden></i>' : ''}</button>`).join('');
  $('tabbar').style.gridTemplateColumns = `repeat(${Math.max(acc.bar.length, 1)},1fr)`;
}
function allowed(tab) { const acc = ACCESS[S.me.role] || ACCESS.superadmin; return tab === 'perfil' || !acc.bar || acc.bar.some(b => b[0] === tab) || tab === acc.home; }
const TITLES = { perfil: 'Mi perfil', reservas: 'Reservas', hoy: 'Hoy', calendario: 'Calendario', nomina: 'Nómina', menu: 'Menú', ...Object.fromEntries(MENU.map(m => [m[0], m[1]])) };
const VIEWS = {};
function go(tab) { S.tab = tab; try { history.replaceState(null, '', '#' + tab); } catch (_) {} scrollTo(0, 0); S.calScroll = tab === 'calendario'; render(); }
// Congela los controles de arriba (botones, filtros, navegación) de cada pestaña
function fijarCabecera() {
  const v = $('view'); if (!v || v.querySelector('.calhead')) return;
  const stop = el => el.tagName === 'H2' || el.matches('.card,.kpis,.menu,.err,.list,.calwrap,.cal,.menu-foot,table');
  const lead = []; for (const el of v.children) { if (stop(el)) break; lead.push(el); }
  if (!lead.length || !lead.some(el => el.matches('button,select,input') || el.querySelector('button,select,input'))) return;
  const w = document.createElement('div'); w.className = 'calhead vhead'; v.insertBefore(w, lead[0]); lead.forEach(el => w.appendChild(el));
}
// Flechita para saltar arriba / abajo
function initJump() {
  const b = document.createElement('button'); b.id = 'jump'; b.className = 'jump'; b.hidden = true; b.setAttribute('aria-label', 'Ir arriba o abajo');
  b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>'; document.body.appendChild(b);
  const upd = () => { const max = document.documentElement.scrollHeight - innerHeight; const show = max > innerHeight * 0.6 && !$('shell')?.hidden;
    b.hidden = !show; const up = scrollY > max / 2; b.classList.toggle('up', up); b.dataset.dir = up ? 'up' : 'down'; };
  addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd);
  new MutationObserver(() => requestAnimationFrame(upd)).observe($('view'), { childList: true });
  b.onclick = () => scrollTo({ top: b.dataset.dir === 'up' ? 0 : document.documentElement.scrollHeight, behavior: 'smooth' });
  upd();
}
// Calendario: lleva la vista a la semana y columna de hoy
function irAHoy() {
  const sem = $('semhoy'); if (!sem) return;
  sem.scrollIntoView({ block: 'start' });
  const th = sem.querySelector('th.hoy'), dpc = sem.querySelector('th.dpc'); if (!th || !dpc) return;
  const z = S.zoom || 1, delta = th.getBoundingClientRect().left - dpc.getBoundingClientRect().right;
  sem.scrollLeft += delta / z;
}
function renderLive() { const l = $('live'); l.className = 'live' + (S.live ? '' : ' off'); }
function render() {
  if (!S.email) return;
  if (!S.me) { $('tabbar').hidden = true; $('avatar').hidden = true; $('view').innerHTML = `<div class="err">Tu correo (${esc(S.email)}) no tiene acceso. Pide a María o Mike que te agreguen en Supuestos → Usuarios.</div><button data-logout="1">Cerrar sesión</button>`; return; }
  setupTabbar();
  const acc = ACCESS[S.me.role] || ACCESS.superadmin, fin = S.me.role === 'finanzas';
  if (!VIEWS[S.tab] || !allowed(S.tab)) S.tab = acc.home;
  const main = acc.bar ? acc.bar.map(b => b[0]) : MAIN;
  const sub = !main.includes(S.tab) && !fin;
  $('tabbar').hidden = fin;
  $('back').hidden = !sub || !!acc.bar || S.tab === 'perfil';
  $('avatar').innerHTML = avatarHTML(S.me); $('avatar').hidden = false;
  $('title').textContent = TITLES[S.tab];
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.t === (S.tab === 'perfil' ? '' : sub ? 'menu' : S.tab)));
  const P = isSuper() ? pendientes() : { limpiezas: [], cajones: [] }; const n = P.limpiezas.length + P.cajones.length;
  if ($('badge')) { $('badge').hidden = !n; $('badge').textContent = n; }
  $('view').innerHTML = VIEWS[S.tab]();
  fijarCabecera();
  { const rs = document.documentElement.style, bar = document.querySelector('.bar'), ch = document.querySelector('.calhead');
    if (bar) rs.setProperty('--barh', bar.offsetHeight + 'px'); if (ch) rs.setProperty('--calh', ch.offsetHeight + 'px'); }
  if (S.calScroll && S.tab === 'calendario') { S.calScroll = false; irAHoy(); requestAnimationFrame(irAHoy); setTimeout(irAHoy, 300); }
  renderLive();
}

// ---------- hoja inferior y formularios ----------
function sheet(html) { const s = $('sheet'); s.innerHTML = `<div class="in">${html}</div>`; s.hidden = false; }
function closeSheet() { $('sheet').hidden = true; F = null; }
let F = null;
function openForm(cfg) { F = cfg; F.v = { ...(cfg.values || {}) }; drawForm(); }
function drawForm() {
  const fs = F.fields(F.v).filter(Boolean);
  let h = `<h3>${esc(F.title)}</h3><form id="frm" autocomplete="off">`;
  for (const f of fs) {
    if (f.type === 'note') { h += `<div class="${f.cls || 'm'}" style="margin:8px 0">${f.html}</div>`; continue; }
    if (f.type === 'photos') {
      h += `<div class="fl"><span>${esc(f.label)}</span><div class="photos">${(F.v[f.k] || []).map((p, i) => `<span class="ph"><img data-phi="${i}" alt=""><button type="button" data-rmph="${i}">×</button></span>`).join('')}<label class="addph">＋<input type="file" accept="image/*" multiple hidden data-addph="${f.k}"></label></div></div>`;
      continue;
    }
    const val = F.v[f.k] ?? '';
    h += `<label class="fl"><span>${esc(f.label)}</span>`;
    if (f.type === 'select') h += `<select data-k="${f.k}" data-dyn="1">${f.options.map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(val) === String(ov) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`;
    else if (f.type === 'textarea') h += `<textarea data-k="${f.k}" rows="3">${esc(val)}</textarea>`;
    else h += `<input type="${f.type}" data-k="${f.k}" value="${esc(val)}" ${f.type === 'number' ? 'inputmode="decimal" step="any" min="0"' : ''} ${f.dyn ? 'data-dyn="1"' : ''} placeholder="${esc(f.ph || '')}">`;
    h += '</label>';
  }
  h += `<div id="frmErr" class="err" hidden></div><div class="row" style="margin-top:14px">${(F.actions || []).map((a, i) => `<button type="button" class="${a.cls || ''}" data-act="${i}" ${a.confirm ? 'data-confirm="1"' : ''}>${esc(a.label)}</button>`).join('')}<span class="sp"></span><button type="button" data-close="1">Cerrar</button><button class="pri" type="submit">Guardar</button></div></form>`;
  sheet(h); hydratePhotos();
}
const photoCache = new Map();
async function photoSrc(path) { if (!photoCache.has(path)) photoCache.set(path, DB.photoUrl(path)); return photoCache.get(path); }
function hydratePhotos() { if (!F) return; const k = (F.fields(F.v).find(f => f && f.type === 'photos') || {}).k; if (!k) return; document.querySelectorAll('#sheet img[data-phi]').forEach(async img => { img.src = await photoSrc(F.v[k][+img.dataset.phi]); }); }
async function shrink(file) {
  const bmp = await createImageBitmap(file); const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
}
function confirmTap(b) { if (b.dataset.armed) return true; b.dataset.armed = '1'; b.dataset.old = b.textContent; b.textContent = '¿Seguro? Toca otra vez'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = b.dataset.old; } }, 3500); return false; }

$('sheet').addEventListener('input', e => { const k = e.target.dataset.k; if (F && k) F.v[k] = e.target.value; });
$('sheet').addEventListener('change', async e => {
  const t = e.target;
  if (F && t.dataset.addph) {
    const k = t.dataset.addph; F.v[k] = F.v[k] || [];
    for (const file of t.files) { try { F.v[k].push(await DB.upload(await shrink(file))); } catch (err) { toast('No se pudo subir la foto: ' + err.message); } }
    return drawForm();
  }
  if (F && t.dataset.k) { F.v[t.dataset.k] = t.value; if (t.dataset.dyn) drawForm(); }
});
$('sheet').addEventListener('submit', async e => {
  e.preventDefault(); if (!F) return;
  const err = await F.save(F.v);
  if (err) { const x = $('frmErr'); x.textContent = err; x.hidden = false; } else closeSheet();
});
$('sheet').addEventListener('click', async e => {
  if (e.target.id === 'sheet') return closeSheet();
  const img = e.target.closest('img[data-phi]'); if (img) { $('viewerImg').src = img.src; $('viewer').hidden = false; return; }
  const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
  if (d.close) return closeSheet();
  if (d.rmph !== undefined && F) { const k = F.fields(F.v).find(f => f && f.type === 'photos').k; F.v[k].splice(+d.rmph, 1); return drawForm(); }
  if (d.act !== undefined && F) { const a = F.actions[+d.act]; if (a.confirm && !confirmTap(b)) return; const v = F.v; closeSheet(); return a.run(v); }
  if (d.pick !== undefined) { closeSheet(); return upd('reservations', { id: d.id }, { cleaner_key: d.pick || null }, d.pick ? 'Asignado a ' + nombre(d.pick) : 'Sin asignar'); }
  if (d.editres) { closeSheet(); return resForm(d.editres); }
});
$('viewer').addEventListener('click', () => { $('viewer').hidden = true; });

// responsables: Mike, María u Otro
const RESP = ['María', 'Mike'];
const respFields = v => [{ k: 'resp_sel', label: 'Responsable', type: 'select', options: [['', '—'], ...RESP, 'Otro'] }, v.resp_sel === 'Otro' && { k: 'resp_other', label: 'Nombre', type: 'text' }];
const respIn = s => (!s ? { resp_sel: '', resp_other: '' } : RESP.includes(s) ? { resp_sel: s, resp_other: '' } : { resp_sel: 'Otro', resp_other: s });
const respOut = v => (v.resp_sel === 'Otro' ? (v.resp_other || '').trim() || 'Otro' : v.resp_sel || null);
const depaOpts = (blank = '— elegir —') => [['', blank], ...props().map(p => p.code)];

// ---------- RESERVAS ----------
function solapa(v, selfId) { return activas().find(r => r.id !== selfId && r.property_code === v.property_code && r.checkin < v.checkout && v.checkin < r.checkout); }
function prestadores(v, selfId) {
  return [...props(), ...cajonesSueltos()].filter(p => p.building === 'Qalina' && p.has_parking && p.lends_parking && p.code !== v.property_code).map(p => {
    const busy = v.checkin && v.checkout && activas().some(x => x.id !== selfId && x.checkin < v.checkout && v.checkin < x.checkout && ((x.property_code === p.code && x.has_car === true) || x.parking_from === p.code));
    return [p.code, `${p.code} · sótano ${p.parking_level ?? '?'}${busy ? ' · OCUPADO' : ''}`];
  });
}
function cleanerOpts(depa, fecha, actual) { return [['', '— sin asignar —'], ...cleaners().filter(c => !(fecha && descansa(fecha, c.key)) || c.key === actual).map(c => { const t = rate(depa, c.key); return [c.key, c.name + (t != null ? ' · ' + money(t) : '') + (fecha && descansa(fecha, c.key) ? ' · descansa' : '')]; })]; }
async function syncIngreso(r) {
  if (!isSuper()) return;
  const ex = S.t.transactions.find(t => t.reservation_id === r.id);
  const want = r.status !== 'cancelada' && r.amount != null && Number(r.amount) > 0;
  const data = { kind: 'ingreso', date: r.checkin, property_code: r.property_code, category: 'Ingreso por reserva', description: `Reserva ${r.guest} · ${fmt(r.checkin)} → ${fmt(r.checkout)}`, amount: Number(r.amount) };
  if (want && ex) return upd('transactions', { id: ex.id }, data);
  if (want) return ins('transactions', { id: uid(), ...data, category_other: null, photos: [], checked: false, reservation_id: r.id });
  if (ex) return del('transactions', { id: ex.id });
}
function resForm(id, preset) {
  const r = id ? S.t.reservations.find(x => x.id === id) : null;
  openForm({
    title: r ? 'Editar reserva' : 'Nueva reserva',
    values: r ? { ...r, car: r.has_car ? 'si' : 'no', amount: r.amount ?? '', cleaner_key: r.cleaner_key || '', parking_from: r.parking_from || '' }
      : { property_code: '', guest: '', checkin: today(), checkout: add(today(), 2), car: 'no', parking_from: '', cleaner_key: '', amount: '', ...(preset || {}) },
    fields: v => {
      const p = prop(v.property_code), q = p && p.building === 'Qalina';
      const sol = v.property_code && v.checkin && v.checkout && v.checkout > v.checkin && solapa(v, r && r.id);
      return [
        { k: 'property_code', label: 'Departamento', type: 'select', options: depaOpts() },
        { k: 'guest', label: 'Huésped', type: 'text' },
        { k: 'checkin', label: 'Check in', type: 'date', dyn: true },
        { k: 'checkout', label: 'Check out', type: 'date', dyn: true },
        sol && { type: 'note', cls: 'warn', html: `Se empalma con ${esc(sol.guest)} (${fmt(sol.checkin)} → ${fmt(sol.checkout)}).` },
        q && { k: 'car', label: '¿Trae auto?', type: 'select', options: [['no', 'No'], ['si', 'Sí']] },
        q && v.car === 'si' && p.has_parking && { type: 'note', html: `Usa el cajón del depa (sótano ${p.parking_level ?? '?'}).` },
        q && v.car === 'si' && !p.has_parking && { k: 'parking_from', label: 'Cajón prestado por', type: 'select', options: [['', '— por asignar —'], ...prestadores(v, r && r.id)] },
        (limpiaMGM(v.property_code) || v.cleaner_key) && { k: 'cleaner_key', label: `Chica de limpieza (salida ${v.checkout ? fmt(v.checkout) : ''})`, type: 'select', options: cleanerOpts(v.property_code, v.checkout, v.cleaner_key) },
        isSuper() && { k: 'amount', label: 'Monto de la reserva (opcional)', type: 'number', ph: 'Se registra como ingreso' }
      ];
    },
    actions: r ? [
      r.status === 'cancelada' ? { label: 'Reactivar', run: async () => { await upd('reservations', { id: r.id }, { status: 'activa' }, 'Reactivada'); syncIngreso({ ...r, status: 'activa' }); } }
        : { label: 'Cancelar reserva', confirm: true, run: async () => { await upd('reservations', { id: r.id }, { status: 'cancelada', cleaner_key: null, parking_from: null }, 'Reserva cancelada'); syncIngreso({ ...r, status: 'cancelada' }); } },
      { label: 'Borrar', confirm: true, run: async () => { const ex = isSuper() && S.t.transactions.find(t => t.reservation_id === r.id); if (ex) await del('transactions', { id: ex.id }); del('reservations', { id: r.id }, 'Borrada'); } }
    ] : [],
    save: async v => {
      if (!v.property_code) return 'Elige el departamento.';
      if (!(v.guest || '').trim()) return 'Falta el nombre del huésped.';
      if (!v.checkin || !v.checkout) return 'Faltan las fechas.';
      if (v.checkout <= v.checkin) return 'El check out debe ser después del check in.';
      const p = prop(v.property_code), q = p.building === 'Qalina', car = q && v.car === 'si';
      const row = {
        property_code: v.property_code, guest: v.guest.trim(), checkin: v.checkin, checkout: v.checkout,
        has_car: q ? car : null, parking_from: car && !p.has_parking ? v.parking_from || null : null,
        cleaner_key: v.cleaner_key || null, amount: !isSuper() ? (r ? r.amount : null) : v.amount === '' || v.amount == null ? null : Number(v.amount), status: r ? r.status : 'activa'
      };
      if (r) await upd('reservations', { id: r.id }, row, 'Reserva guardada'); else { row.id = uid(); await ins('reservations', row, 'Reserva creada'); }
      syncIngreso({ ...row, id: r ? r.id : row.id });
    }
  });
}
function extraForm(id, preset) {
  const x = id ? S.t.cleanings.find(c => c.id === id) : null;
  openForm({
    title: x ? 'Limpieza extra' : 'Nueva limpieza extra',
    values: x ? { ...x, cleaner_key: x.cleaner_key || '', note: x.note || '' } : { property_code: '', date: today(), cleaner_key: '', note: '', ...(preset || {}) },
    fields: v => { const occ = v.property_code && v.date && activas().find(r => r.property_code === v.property_code && r.checkin <= v.date && v.date < r.checkout);
      return [{ type: 'note', html: 'Para limpiezas que no son por salida: a media estancia o con el depa vacío. Cuenta para la nómina.' },
        { k: 'property_code', label: 'Departamento', type: 'select', options: depaOpts() }, { k: 'date', label: 'Fecha', type: 'date', dyn: true },
        occ && { type: 'note', html: `Ese día está hospedado ${esc(occ.guest)} (${fmt(occ.checkin)} → ${fmt(occ.checkout)}).` },
        { k: 'cleaner_key', label: 'Chica de limpieza', type: 'select', options: cleanerOpts(v.property_code, v.date, v.cleaner_key) }, { k: 'note', label: 'Nota (opcional)', type: 'text', ph: 'Ej. limpieza a media estancia' }]; },
    actions: x ? [{ label: 'Borrar', confirm: true, run: () => del('cleanings', { id: x.id }, 'Borrada') }] : [],
    save: async v => { if (!v.property_code) return 'Elige el departamento.'; if (!v.date) return 'Falta la fecha.';
      const row = { property_code: v.property_code, date: v.date, cleaner_key: v.cleaner_key || null, note: (v.note || '').trim() || null };
      if (x) upd('cleanings', { id: x.id }, row, 'Guardada'); else ins('cleanings', { id: uid(), ...row }, 'Limpieza extra agregada'); }
  });
}
function blockForm() {
  openForm({
    title: 'Bloqueo (N/A)', values: { property_code: '', date_from: today(), date_to: today(), note: '' },
    fields: () => [{ k: 'property_code', label: 'Departamento', type: 'select', options: depaOpts() }, { k: 'date_from', label: 'Desde', type: 'date' }, { k: 'date_to', label: 'Hasta', type: 'date' }, { k: 'note', label: 'Nota (opcional)', type: 'text' }],
    save: async v => { if (!v.property_code) return 'Elige el departamento.'; if (!v.date_from || !v.date_to || v.date_to < v.date_from) return 'Revisa las fechas.'; ins('blocks', { id: uid(), property_code: v.property_code, date_from: v.date_from, date_to: v.date_to, note: v.note || null }, 'Bloqueo agregado'); }
  });
}
function resCard(r) {
  const p = prop(r.property_code) || {}, q = p.building === 'Qalina';
  const tags = [];
  if (q) tags.push(r.has_car ? (p.has_parking ? 'Auto · cajón propio' : r.parking_from ? 'Auto · cajón de ' + r.parking_from : '<b style="color:var(--baja)">Auto · falta cajón</b>') : 'Sin auto');
  if (limpiaMGM(r.property_code) || r.cleaner_key) tags.push(r.cleaner_key ? 'Limpia ' + esc(nombre(r.cleaner_key)) : '<b style="color:var(--baja)">Limpieza sin asignar</b>');
  if (r.amount != null) tags.push(money(Number(r.amount)));
  return `<div class="card tap" data-res="${r.id}"><div class="row"><span class="dp">${esc(r.property_code)}</span><span>${esc(r.guest)}</span><span class="sp"></span>${r.status === 'cancelada' ? '<span class="b baja">CANCELADA</span>' : ''}</div>
    <div class="m">${fmt(r.checkin)} → ${fmt(r.checkout)} · ${Math.round((parse(r.checkout) - parse(r.checkin)) / 864e5)} noches</div><div class="m">${tags.join(' · ')}</div></div>`;
}
VIEWS.reservas = () => {
  const f = S.f.res, hoy = today();
  let rs = S.t.reservations.filter(r => (f.show === 'canceladas' ? r.status === 'cancelada' : r.status !== 'cancelada' && (f.show === 'pasadas' ? r.checkout < hoy : r.checkout >= hoy)));
  if (f.depa) rs = rs.filter(r => r.property_code === f.depa);
  rs.sort((a, b) => (f.show === 'proximas' ? a.checkin.localeCompare(b.checkin) : b.checkin.localeCompare(a.checkin)));
  let h = `<div class="row" style="margin-bottom:10px"><button class="pri big sp" data-newres="1">＋ Nueva reserva</button></div><div class="row" style="margin-bottom:10px"><button class="sp" data-newextra="1">＋ Limpieza extra</button><button class="sp" data-newblock="1">＋ Bloqueo N/A</button></div>`;
  h += `<div class="row" style="margin-bottom:10px"><div class="seg">${[['proximas', 'Vigentes'], ['pasadas', 'Pasadas'], ['canceladas', 'Canceladas']].map(([k, l]) => `<button data-fset="res|show|${k}" class="${f.show === k ? 'on' : ''}">${l}</button>`).join('')}</div><span class="sp"></span>${fsel('res', 'depa', depaOpts('Todos los depas'))}</div>`;
  h += rs.length ? rs.slice(0, 150).map(resCard).join('') : `<div class="card empty">${f.show === 'proximas' ? 'Sin reservas capturadas. Toca “Nueva reserva”.' : 'Nada por aquí.'}</div>`;
  const ex = S.t.cleanings.filter(x => x.date >= hoy && (!f.depa || x.property_code === f.depa)).sort((a, b) => a.date.localeCompare(b.date));
  if (ex.length && f.show === 'proximas') h += '<h2>Limpiezas extra</h2>' + ex.map(x => `<div class="card row tap" data-extra="${x.id}"><div class="sp"><span class="dp">${esc(x.property_code)}</span> · ${fmt(x.date)} <span class="m">${esc(x.note || '')}</span></div><span class="${x.cleaner_key ? 'm' : 'b baja'}">${x.cleaner_key ? esc(nombre(x.cleaner_key)) : 'SIN ASIGNAR'}</span></div>`).join('');
  const bl = S.t.blocks.filter(b => b.date_to >= hoy).sort((a, b) => a.date_from.localeCompare(b.date_from));
  if (bl.length) h += '<h2>Bloqueos (N/A)</h2>' + bl.map(b => `<div class="card row"><div class="sp"><span class="dp">${esc(b.property_code)}</span> ${fmt(b.date_from)} – ${fmt(b.date_to)} <span class="m">${esc(b.note || '')}</span></div><button data-del="blocks|${b.id}">Quitar</button></div>`).join('');
  return h;
};
const fsel = (grp, k, opts) => `<select data-f="${grp}|${k}">${opts.map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${S.f[grp][k] === ov ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`;

// ---------- HOY ----------
function pendientes() {
  const hoy = today(), fin = add(hoy, 7);
  return {
    limpiezas: [...activas().filter(r => r.checkout >= hoy && r.checkout <= fin && !r.cleaner_key && limpiaMGM(r.property_code)).map(r => ({ id: r.id, dp: r.property_code, f: r.checkout, txt: 'Sale ' + r.guest + (entraMismoDia(r) ? ' · entra otro huésped ese día' : '') })),
      ...S.t.cleanings.filter(x => x.date >= hoy && x.date <= fin && !x.cleaner_key && limpiaMGM(x.property_code)).map(x => ({ id: x.id, extra: true, dp: x.property_code, f: x.date, txt: 'Limpieza extra' + (x.note ? ' · ' + x.note : '') }))].sort((a, b) => a.f.localeCompare(b.f)),
    cajones: activas().filter(r => r.checkout > hoy && r.checkin <= fin && sinCajon(r)).sort((a, b) => a.checkin.localeCompare(b.checkin))
  };
}
const entraMismoDia = r => activas().some(x => x.id !== r.id && x.property_code === r.property_code && x.checkin === r.checkout);
function sheetAsignar(id) {
  const r = S.t.reservations.find(x => x.id === id); if (!r) return;
  sheet(`<h3>${esc(r.property_code)} · ${fmt(r.checkout)}</h3><div class="m">Sale ${esc(r.guest)}${entraMismoDia(r) ? ' · entra otro huésped ese día' : ''}</div>
    <div class="chips">${cleaners().filter(c => !descansa(r.checkout, c.key) || r.cleaner_key === c.key).map(c => { const off = descansa(r.checkout, c.key), t = rate(r.property_code, c.key); return `<button class="chip ${r.cleaner_key === c.key ? 'on' : ''}" data-pick="${c.key}" data-id="${r.id}" ${off ? 'style="opacity:.45"' : ''}>${esc(c.name)}${t != null ? ' · ' + money(t) : ''}${off ? ' · descansa' : ''}</button>`; }).join('')}</div>
    <div class="row" style="margin-top:14px"><button data-pick="" data-id="${r.id}">Quitar asignación</button><button data-editres="${r.id}">Editar reserva</button><span class="sp"></span><button data-close="1">Cerrar</button></div>`);
}
function sheetLista(titulo, rs, modo) {
  sheet(`<h3>${esc(titulo)}</h3>${rs.length ? rs.map(r => { const p = prop(r.property_code) || {};
    const car = p.building === 'Qalina' ? (r.has_car ? (p.has_parking ? 'Auto · cajón propio' : r.parking_from ? 'Auto · cajón de ' + r.parking_from : 'Auto · falta cajón') : 'Sin auto') : '';
    return `<div class="card"><div class="row"><span class="dp">${esc(r.property_code)}</span><span>${esc(r.guest)}</span><span class="sp"></span><button data-editres="${r.id}">Editar</button></div><div class="m">${fmt(r.checkin)} → ${fmt(r.checkout)}${car ? ' · ' + car : ''}</div>${modo === 'sale' && (limpiaMGM(r.property_code) || r.cleaner_key) ? `<div class="m">Limpia: ${r.cleaner_key ? esc(nombre(r.cleaner_key)) : '<b style="color:var(--baja)">sin asignar</b>'}${entraMismoDia(r) ? ' · entra otro huésped hoy' : ''}</div>` : ''}</div>`; }).join('') : '<div class="empty">Nadie.</div>'}
    <div class="row" style="margin-top:10px"><span class="sp"></span><button data-close="1">Cerrar</button></div>`);
}
const libres = d => { const occ = new Set(ocupadas(d).map(r => r.property_code)); return props().filter(p => !occ.has(p.code) && !bloqueado(p.code, d)); };
function sheetLibres(d) {
  const L = libres(d).map(p => ({ p, n: activas().filter(r => r.property_code === p.code && r.checkin >= d).sort((a, b) => a.checkin.localeCompare(b.checkin))[0] }))
    .sort((a, b) => (a.n ? a.n.checkin : '9999').localeCompare(b.n ? b.n.checkin : '9999'));
  sheet(`<h3>Libres esta noche</h3>${L.length ? L.map(({ p, n }) => `<div class="card"><div class="row"><span class="dp">${esc(p.code)}</span><span class="sp"></span>${n && n.checkin === d ? '<span class="b alta">ENTRA HOY</span>' : ''}</div><div class="m">${n ? `Próxima entrada: ${fmt(n.checkin)} · ${esc(n.guest)}` : 'Sin reservas próximas'}</div></div>`).join('') : '<div class="empty">Ninguno, todo ocupado.</div>'}
    <div class="row" style="margin-top:10px"><span class="sp"></span><button data-close="1">Cerrar</button></div>`);
}
VIEWS.hoy = () => {
  const P = pendientes(), d = today(), act = activas();
  const salen = act.filter(r => r.checkout === d), entran = act.filter(r => r.checkin === d), occ = ocupadas(d), lib = libres(d);
  let h = `<div class="m" style="margin-bottom:8px">${fmt(d)}</div><div class="kpis k4"><button class="kpi" data-hoy="sale"><div class="v">${salen.length}</div><div class="l">Salen hoy ›</div></button><button class="kpi" data-hoy="entra"><div class="v">${entran.length}</div><div class="l">Entran hoy ›</div></button><button class="kpi" data-hoy="occ"><div class="v">${occ.length}</div><div class="l">Ocupados ›</div></button><button class="kpi" data-hoy="libre"><div class="v">${lib.length}</div><div class="l">Libres ›</div></button></div>`;
  h += '<h2>Limpiezas por asignar · próximos 7 días</h2>';
  h += P.limpiezas.length ? P.limpiezas.map(r => `<div class="card row"><div class="sp"><div><span class="dp">${esc(r.dp)}</span> · ${fmt(r.f)}${r.f === d ? ' <span class="b baja">HOY</span>' : ''}</div><div class="m">${esc(r.txt)}</div></div><button class="pri" ${r.extra ? 'data-extra' : 'data-asig'}="${r.id}">Asignar</button></div>`).join('') : '<div class="card empty">Todo asignado ✓</div>';
  if (P.cajones.length) h += '<h2>Autos sin cajón</h2>' + P.cajones.map(r => `<div class="card row"><div class="sp"><div><span class="dp">${esc(r.property_code)}</span> · ${esc(r.guest)}</div><div class="m">${fmt(r.checkin)} → ${fmt(r.checkout)}</div></div><button class="pri" data-res="${r.id}">Asignar cajón</button></div>`).join('');
  return h;
};

// ---------- CALENDARIO ----------
VIEWS.calendario = () => {
  const [y, m] = S.calMes.split('-').map(Number);
  const ini = S.calMes + '-01', ult = ymd(new Date(y, m, 0));
  const by = {}, lent = {};
  activas().forEach(r => { (by[r.property_code] ||= []).push(r); if (r.parking_from) (lent[r.parking_from] ||= []).push(r); });
  const exm = {}; S.t.cleanings.forEach(x => { exm[x.property_code + '|' + x.date] = x; });
  const NOM = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];
  let h = `<div class="calhead"><div class="nav"><button data-cm="-1">‹</button><div class="d">${MESES_L[m - 1]} ${y}</div><button data-cm="1">›</button><button data-cm="0">Hoy</button></div>`;
  h += `<div class="row" style="margin-bottom:8px"><span class="m">Zoom</span><button data-zoom="-1">－</button><span class="m" style="min-width:42px;text-align:center">${Math.round(S.zoom * 100)}%</span><button data-zoom="1">＋</button><span class="sp"></span><button data-undo="1" ${UNDO.length ? '' : 'disabled'} title="Deshacer el último cambio" aria-label="Deshacer" style="font-size:18px;padding:6px 12px">↶${UNDO.length ? '<small style="font-size:11px;margin-left:3px">' + UNDO.length + '</small>' : ''}</button><button data-expcal="1">Excel</button></div><div class="row" style="margin-bottom:8px"><button class="sp" data-newextra="1">＋ Limpieza extra</button><button class="pri sp" data-newres="1">＋ Reserva</button></div>`;
  h += `<div class="m" style="margin:0 2px 10px"><b style="color:#1f5fa8">Azul</b> entra / sigue (X) · <b style="color:#b5372b">Rojo</b> sale · <b style="color:#6b3fa0">Morado</b> quién limpia · <b style="color:#7b8082">Gris</b> cajón</div></div>`;
  h += `<div class="calwrap" style="zoom:${S.zoom}">`;
  for (let w = monday(ini); w <= ult; w = add(w, 7)) {
    const dias = [0, 1, 2, 3, 4, 5, 6].map(i => add(w, i));
    h += `<div class="cal" ${dias.includes(today()) ? 'id="semhoy"' : ''}>`;
    if (w === monday(ini)) h += `<div class="mes"><small>${y}</small>${MESES_L[m - 1].toUpperCase()}</div>`;
    h += `<table><thead><tr><th class="dpc">Depa</th>${NOM.map(n => `<th colspan="4" class="ds">${n}</th>`).join('')}</tr>`;
    h += `<tr class="num"><th class="dpc"></th>${dias.map(d => { const off = S.t.days_off.filter(o => o.date === d).map(o => nombre(o.cleaner_key) + ' no').join(', '); return `<th colspan="4" class="ds ${d === today() ? 'hoy' : ''}">${parse(d).getDate()}${d === today() ? ' · hoy' : ''}${off ? `<span class="off">${esc(off)}</span>` : ''}</th>`; }).join('')}</tr></thead><tbody>`;
    for (const p of props()) {
      const rs = by[p.code] || [], ls2 = lent[p.code] || [];
      h += `<tr><td class="dpc">${esc(p.code)}</td>`;
      dias.forEach((d, i) => {
        const bl = bloqueado(p.code, d);
        const noche = rs.find(r => r.checkin <= d && d < r.checkout), sale = rs.find(r => r.checkout === d);
        if (bl && !noche && !sale && !exm[p.code + '|' + d]) { h += `<td class="ds na" colspan="4">N/A${bl.note ? ' · ' + esc(bl.note) : ''}</td>`; return; }
        const oc = noche ? (noche.checkin === d ? esc(noche.guest) : 'X') : '';
        let es = '';
        if (p.building === 'Qalina') {
          const pr = ls2.find(r => r.checkin <= d && d < r.checkout);
          if (pr) es = 'Prest. a ' + esc(corto(pr.property_code));
          else if (noche && noche.has_car === true) es = p.has_parking ? 'Sí' : noche.parking_from ? 'De ' + esc(corto(noche.parking_from)) : '<span class="falta">Falta</span>';
          else if (noche && noche.has_car === false) es = 'No';
        }
        const xt = exm[p.code + '|' + d];
        const k = sale && !sale.cleaner_key && !limpiaMGM(p.code) ? '' : sale ? `<button class="k ${sale.cleaner_key ? '' : 'vacio'}" data-asig="${sale.id}">${esc(sale.cleaner_key || '+')}</button>` : xt ? `<button class="k ${xt.cleaner_key ? '' : 'vacio'}" data-extra="${xt.id}">${esc(xt.cleaner_key || '+')}</button>` : '';
        const c3 = sale ? esc(sale.guest) : xt ? '<span class="xl">Limpieza</span>' : '';
        h += `<td class="ds oc" ${noche ? `data-res="${noche.id}"` : ''}>${oc}</td><td class="es">${es}</td><td class="en" ${sale ? `data-res="${sale.id}"` : xt ? `data-extra="${xt.id}"` : ''}>${c3}</td><td>${k}</td>`;
      });
      h += '</tr>';
    }
    h += '</tbody></table></div>';
  }
  return h + '</div>';
};

// ---------- NÓMINA ----------
function nominaDe(k, ini) {
  const fin = add(ini, 7), bono = Number(setting('bono_domingo', 50));
  const det = activas().filter(r => r.cleaner_key === k && r.checkout >= ini && r.checkout < fin).sort((a, b) => a.checkout.localeCompare(b.checkout))
    .map(r => ({ dp: r.property_code, f: r.checkout, t: rate(r.property_code, k), b: dow(r.checkout) === 0 ? bono : 0 }))
    .concat(S.t.cleanings.filter(x => x.cleaner_key === k && x.date >= ini && x.date < fin).map(x => ({ dp: x.property_code, f: x.date, t: rate(x.property_code, k), b: dow(x.date) === 0 ? bono : 0, x: true })))
    .sort((a, b) => a.f.localeCompare(b.f));
  const extras = S.t.payroll_extras.filter(x => x.cleaner_key === k && x.week_start === ini);
  const pagos = S.t.payroll_payments.filter(x => x.cleaner_key === k && x.week_start === ini).sort((a, b) => a.date.localeCompare(b.date));
  const total = det.reduce((s, x) => s + (x.t || 0) + x.b, 0) + extras.reduce((s, x) => s + Number(x.amount), 0);
  const pagado = pagos.reduce((s, x) => s + Number(x.amount), 0);
  return { det, extras, pagos, total, pagado, saldo: total - pagado };
}
function textoNomina(k, ini) {
  const N = nominaDe(k, ini);
  let t = `*Nómina ${nombre(k)}*\nSemana ${fmt(ini)} – ${fmt(add(ini, 6))}\n\n`;
  t += N.det.length ? N.det.map(x => `• ${fmt(x.f)} · ${x.dp}${x.x ? ' (extra)' : ''} · ${x.t == null ? 'sin tarifa' : money(x.t)}${x.b ? ` + ${money(x.b)} domingo` : ''}`).join('\n') : '• Sin limpiezas';
  if (N.extras.length) t += '\n\nOtros:\n' + N.extras.map(x => `• ${x.description} · ${money(Number(x.amount))}`).join('\n');
  t += `\n\n*Total: ${money(N.total)}*`;
  if (N.pagos.length) t += '\n\nPagos:\n' + N.pagos.map(x => `• ${fmt(x.date)} · ${x.method} · ${money(Number(x.amount))}`).join('\n') + `\nPagado: ${money(N.pagado)}`;
  t += `\n*Saldo: ${money(N.saldo)}*`;
  return t;
}
VIEWS.nomina = () => {
  const ini = S.semana;
  let h = `<div class="nav"><button data-wn="-1">‹</button><div class="d">${fmt(ini)} – ${fmt(add(ini, 6))}</div><button data-wn="1">›</button><button data-wn="0">Hoy</button></div>`;
  const all = cleaners().map(c => [c, nominaDe(c.key, ini)]);
  const sinAsig = activas().filter(r => !r.cleaner_key && limpiaMGM(r.property_code) && r.checkout >= ini && r.checkout < add(ini, 7)).length + S.t.cleanings.filter(x => !x.cleaner_key && limpiaMGM(x.property_code) && x.date >= ini && x.date < add(ini, 7)).length;
  if (sinAsig) h += `<div class="warn">${sinAsig} limpieza(s) de esta semana sin chica asignada.</div>`;
  const tot = all.reduce((s, [, n]) => s + n.total, 0), pag = all.reduce((s, [, n]) => s + n.pagado, 0);
  h += `<div class="kpis"><div class="kpi"><div class="v">${money(tot)}</div><div class="l">Total semana</div></div><div class="kpi"><div class="v">${money(pag)}</div><div class="l">Pagado</div></div><div class="kpi ${tot - pag > 0 ? 'alert' : ''}"><div class="v">${money(tot - pag)}</div><div class="l">Por pagar</div></div></div>`;
  for (const [c, N] of all) {
    const sinT = N.det.some(x => x.t == null);
    h += `<div class="card"><div class="row"><b style="font-size:16px">${esc(c.name)}</b><span class="m">${N.det.length} limpiezas</span><span class="sp"></span><b>${money(N.total)}</b></div>`;
    if (sinT) h += `<div class="warn" style="margin-top:6px">Falta tarifa en algún depa (Menú → Limpiezas).</div>`;
    if (N.det.length) h += `<table style="margin-top:6px">${N.det.map(x => `<tr><td>${fmt(x.f)}</td><td class="dp">${esc(x.dp)}${x.x ? ' <span class="m">extra</span>' : ''}</td><td class="r">${x.t == null ? '—' : money(x.t)}${x.b ? ` <span class="m">+${x.b}</span>` : ''}</td></tr>`).join('')}</table>`;
    if (N.extras.length) h += `<div class="sub">Otros</div><table>${N.extras.map(x => `<tr><td>${esc(x.description)}</td><td class="r">${money(Number(x.amount))}</td><td class="x"><button class="xs" data-del="payroll_extras|${x.id}">×</button></td></tr>`).join('')}</table>`;
    if (N.pagos.length) h += `<div class="sub">Pagos</div><table>${N.pagos.map(x => `<tr><td>${fmt(x.date)}</td><td>${esc(x.method)}${x.note ? ' · ' + esc(x.note) : ''}</td><td class="r">${money(Number(x.amount))}</td><td class="x"><button class="xs" data-del="payroll_payments|${x.id}">×</button></td></tr>`).join('')}</table>`;
    h += `<div class="row" style="margin-top:10px"><span class="b ${N.saldo > 0 ? 'cambio' : 'alta'}">${N.saldo > 0 ? 'SALDO ' + money(N.saldo) : N.total > 0 ? 'PAGADO' : 'SIN MOVIMIENTOS'}</span><span class="sp"></span><button data-otro="${c.key}">＋ Otro</button><button data-pago="${c.key}">＋ Pago</button><button data-copynom="${c.key}">Copiar</button></div></div>`;
  }
  return h;
};
function otroForm(k) { openForm({ title: 'Otro · ' + nombre(k), values: { description: '', amount: '' }, fields: () => [{ k: 'description', label: 'Descripción', type: 'text' }, { k: 'amount', label: 'Monto', type: 'number' }],
  save: async v => { if (!(v.description || '').trim()) return 'Falta la descripción.'; if (!(Number(v.amount) > 0)) return 'El monto debe ser mayor a cero.'; ins('payroll_extras', { id: uid(), cleaner_key: k, week_start: S.semana, description: v.description.trim(), amount: Number(v.amount) }, 'Agregado'); } }); }
function pagoForm(k) { const N = nominaDe(k, S.semana); openForm({ title: 'Pago · ' + nombre(k), values: { date: today(), amount: N.saldo > 0 ? N.saldo : '', method: 'efectivo', note: '' },
  fields: () => [{ type: 'note', html: `Total semana ${money(N.total)} · saldo ${money(N.saldo)}` }, { k: 'date', label: 'Fecha', type: 'date' }, { k: 'amount', label: 'Monto (parcial o completo)', type: 'number' }, { k: 'method', label: 'Forma de pago', type: 'select', options: [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia']] }, { k: 'note', label: 'Nota (opcional)', type: 'text' }],
  save: async v => { if (!v.date) return 'Falta la fecha.'; if (!(Number(v.amount) > 0)) return 'El monto debe ser mayor a cero.'; ins('payroll_payments', { id: uid(), cleaner_key: k, week_start: S.semana, date: v.date, amount: Number(v.amount), method: v.method, note: v.note || null }, 'Pago registrado'); } }); }

// ---------- MENÚ ----------
VIEWS.menu = () => `<div class="menu">${MENU.map(([k, t, s]) => `<button class="card tap" data-go="${k}"><div class="dp">${t}</div><div class="m">${s}</div></button>`).join('')}</div><div class="menu-foot"><img class="l" src="img/logo-white.png" alt="MGM Housing Management"><img class="s" src="img/skyline.svg" alt=""></div>`;

// ---------- CAJONES QALINA ----------
VIEWS.cajones = () => {
  const d = S.dia;
  let h = `<div class="nav"><button data-dn="-1">‹</button><div class="d">${fmt(d)} · noche</div><button data-dn="1">›</button><button data-dn="0">Hoy</button></div>`;
  const occ = ocupadas(d), by = {}; occ.forEach(r => { by[r.property_code] = r; });
  const qal = props().filter(p => p.building === 'Qalina');
  const nec = qal.filter(p => by[p.code] && by[p.code].has_car === true && !p.has_parking).map(p => by[p.code]);
  const usados = new Set(occ.map(r => r.parking_from).filter(Boolean));
  const libres = [...qal, ...cajonesSueltos()].filter(p => p.has_parking && p.lends_parking && !(by[p.code] && by[p.code].has_car === true) && !usados.has(p.code)).map(p => p.code);
  const faltan = nec.filter(r => !r.parking_from).length;
  h += `<div class="kpis"><div class="kpi"><div class="v">${nec.length}</div><div class="l">Necesitan prestado</div></div><div class="kpi"><div class="v">${libres.length}</div><div class="l">Cajones libres</div></div><div class="kpi ${faltan ? 'alert' : ''}"><div class="v">${faltan}</div><div class="l">Por asignar</div></div></div>`;
  if (faltan > libres.length) h += `<div class="err">Faltan ${faltan - libres.length} cajón(es) esta noche.</div>`;
  h += '<h2>Ocupados esta noche</h2>';
  const occQ = qal.filter(p => by[p.code]);
  if (!occQ.length) h += '<div class="card empty">Ningún depa de Qalina ocupado.</div>';
  for (const p of occQ) {
    const r = by[p.code], pr = occ.find(x => x.parking_from === p.code);
    h += `<div class="card"><div class="row"><span class="dp">${esc(p.code)}</span><span>${esc(r.guest)}</span><span class="sp"></span><span class="m">${p.has_parking ? 'Cajón S' + (p.parking_level ?? '?') : 'Sin cajón'}</span></div>
      <div class="m">${fmt(r.checkin)} → ${fmt(r.checkout)}</div>${pr ? `<div class="m">Su cajón está <b>prestado a ${esc(pr.property_code)}</b> (${esc(pr.guest)})</div>` : ''}
      <div class="row" style="margin-top:8px"><span class="m">¿Trae auto?</span><div class="seg">${[['Sí', true], ['No', false]].map(([l, x]) => `<button data-car="${r.id}" data-v="${x ? 1 : 0}" class="${(r.has_car === true) === x ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${!p.has_parking && r.has_car === true ? `<span class="sp"></span><select data-caj="${r.id}"><option value="">Cajón de…</option>${[...new Set([...(r.parking_from ? [r.parking_from] : []), ...libres])].map(o => `<option ${r.parking_from === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : ''}</div></div>`;
  }
  h += `<h2>Libres para prestar</h2><div class="card">${libres.length ? libres.map(k => `<span class="b n" style="margin:2px">${esc(k)} · S${prop(k).parking_level ?? '?'}</span>`).join(' ') : '<span class="m">Ninguno</span>'}</div>`;
  const mes = d.slice(0, 7), ini = mes + '-01', fin = ymd(new Date(+mes.slice(0, 4), +mes.slice(5), 1));
  const t = {}; activas().forEach(r => { if (!r.parking_from) return; let n = 0; for (let x = r.checkin; x < r.checkout; x = add(x, 1)) if (x >= ini && x < fin) n++; if (n) t[r.parking_from] = (t[r.parking_from] || 0) + n; });
  const ks = Object.keys(t).sort(), renta = Number(setting('renta_cajon', 500));
  h += `<h2>Cajones prestados · ${fmtMes(mes)}</h2><div class="card">${ks.length ? `<table><tr><th>Cajón de</th><th class="r">Noches</th><th class="r">Renta</th></tr>${ks.map(k => `<tr><td class="dp">${esc(k)}</td><td class="r">${t[k]}</td><td class="r">${money(renta)}</td></tr>`).join('')}<tr><th>Total</th><th></th><th class="r">${money(ks.length * renta)}</th></tr></table>` : '<span class="m">Sin préstamos este mes.</span>'}</div>`;
  return h;
};

// ---------- LIMPIEZAS ----------
VIEWS.limpiezas = () => {
  const cs = cleaners();
  let h = '';
  h += `<h2 style="margin-top:0">Descansos</h2><div class="card"><div class="row"><input type="date" id="offDate" value="${today()}"><select id="offK">${cs.map(c => `<option value="${c.key}">${esc(c.name)}</option>`).join('')}</select><button class="pri" data-addoff="1">Agregar</button></div>
    <div class="list">${S.t.days_off.filter(o => o.date >= today()).sort((a, b) => a.date.localeCompare(b.date)).map(o => `<div class="it"><div class="sp">${fmt(o.date)} · ${esc(nombre(o.cleaner_key))}</div><button data-deloff="${o.date}|${o.cleaner_key}">Quitar</button></div>`).join('')}</div></div>`;
  h += `<h2>Tarifa por limpieza</h2><div class="card scroll"><table><tr><th>Depa</th>${cs.map(c => `<th class="r">${esc(c.name)}</th>`).join('')}</tr>`;
  for (const p of props()) h += `<tr><td class="dp">${esc(p.code)}</td>${cs.map(c => `<td class="r"><input type="number" inputmode="numeric" style="width:66px" data-rate="${esc(p.code)}|${c.key}" value="${rate(p.code, c.key) ?? ''}"></td>`).join('')}</tr>`;
  return h + `</table></div><div class="m">Bono por limpieza en domingo: ${money(Number(setting('bono_domingo', 50)))} (se cambia en Supuestos).</div>`;
};

// ---------- GASTOS E INGRESOS ----------
const catLabel = t => (t.category_other ? `${t.category}: ${t.category_other}` : t.category);
function finRows(kind, useCat) {
  const f = S.f.fin, ord = Object.fromEntries(props().map((p, i) => [p.code, i]));
  return S.t.transactions.filter(t => t.kind === kind && (!f.mes || t.date.slice(0, 7) === f.mes) && (!f.depa || t.property_code === f.depa) && (!useCat || !f.cat || t.category === f.cat))
    .sort((a, b) => a.date.slice(0, 7).localeCompare(b.date.slice(0, 7)) || (ord[a.property_code] ?? 99) - (ord[b.property_code] ?? 99) || catLabel(a).localeCompare(catLabel(b)) || a.date.localeCompare(b.date));
}
VIEWS.finanzas = () => {
  const f = S.f.fin, cats = f.kind === 'gasto' ? CAT_GASTO : CAT_INGRESO;
  if (f.cat && !cats.includes(f.cat)) f.cat = '';
  const meses = [...new Set([today().slice(0, 7), ...S.t.transactions.map(t => t.date.slice(0, 7))])].sort().reverse();
  const g = finRows('gasto', f.kind === 'gasto'), i = finRows('ingreso', f.kind === 'ingreso');
  const tg = g.reduce((s, t) => s + Number(t.amount), 0), ti = i.reduce((s, t) => s + Number(t.amount), 0);
  let h = `<div class="row" style="margin-bottom:10px"><div class="seg">${[['gasto', 'Gastos'], ['ingreso', 'Ingresos']].map(([k, l]) => `<button data-fset="fin|kind|${k}" class="${f.kind === k ? 'on' : ''}">${l}</button>`).join('')}</div><span class="sp"></span><button class="pri" data-newtx="1">＋ ${f.kind === 'gasto' ? 'Gasto' : 'Ingreso'}</button></div>`;
  h += `<div class="row filt">${fsel('fin', 'mes', [['', 'Todos los meses'], ...meses.map(m => [m, fmtMes(m)])])}${fsel('fin', 'depa', depaOpts('Todos los depas'))}${fsel('fin', 'cat', [['', 'Todas las categorías'], ...cats])}</div>`;
  h += `<div class="kpis"><div class="kpi"><div class="v">${money(ti)}</div><div class="l">Ingresos</div></div><div class="kpi"><div class="v">${money(tg)}</div><div class="l">Gastos</div></div><div class="kpi ${ti - tg < 0 ? 'alert' : ''}"><div class="v">${money(ti - tg)}</div><div class="l">Neto</div></div></div>`;
  const rows = f.kind === 'gasto' ? g : i; let last = '';
  if (!rows.length) h += '<div class="card empty">Sin registros con estos filtros.</div>';
  for (const t of rows) {
    const grp = fmtMes(t.date.slice(0, 7)) + ' · ' + t.property_code;
    if (grp !== last) { h += `<h2>${esc(grp)}</h2>`; last = grp; }
    h += `<div class="card row tx"><input type="checkbox" class="chk" data-chk="transactions|${t.id}|checked" ${t.checked ? 'checked' : ''} title="Capturado"><div class="sp tap" data-tx="${t.id}"><div>${esc(catLabel(t))}</div><div class="m">${fmt(t.date)}${t.description ? ' · ' + esc(t.description) : ''}${(t.photos || []).length ? ` · 📎${t.photos.length}` : ''}</div></div><b>${money(Number(t.amount))}</b></div>`;
  }
  h += `<h2>Exportar</h2><div class="card"><div class="m" style="margin-bottom:8px">Gastos e ingresos con los filtros de mes y depa, ordenados por mes, departamento, categoría y fecha.</div><div class="row"><button data-export="xlsx">Excel (.xlsx)</button><button data-export="csv">CSV</button></div></div>`;
  return h;
};
function txForm(id) {
  const t = id ? S.t.transactions.find(x => x.id === id) : null, kind = t ? t.kind : S.f.fin.kind, cats = kind === 'gasto' ? CAT_GASTO : CAT_INGRESO;
  const otra = c => c === 'Otro' || c === 'Otros ingresos';
  openForm({
    title: (t ? 'Editar ' : 'Nuevo ') + kind,
    values: t ? { ...t, category_other: t.category_other || '', description: t.description || '', photos: [...(t.photos || [])] } : { date: today(), property_code: S.f.fin.depa || '', category: cats[0], category_other: '', description: '', amount: '', photos: [] },
    fields: v => [
      t && t.reservation_id && { type: 'note', html: 'Este ingreso viene de una reserva; el monto y la fecha se cambian en la reserva.' },
      { k: 'date', label: 'Fecha', type: 'date' }, { k: 'property_code', label: 'Departamento', type: 'select', options: depaOpts() },
      { k: 'category', label: kind === 'gasto' ? 'Categoría' : 'Tipo de ingreso', type: 'select', options: cats },
      otra(v.category) && { k: 'category_other', label: '¿Cuál?', type: 'text' },
      { k: 'description', label: 'Descripción', type: 'text' }, { k: 'amount', label: 'Monto', type: 'number' },
      { k: 'photos', label: 'Fotos (opcional)', type: 'photos' }
    ],
    actions: t ? [{ label: 'Borrar', confirm: true, run: () => del('transactions', { id: t.id }, 'Borrado') }] : [],
    save: async v => {
      if (!v.date) return 'Falta la fecha.'; if (!v.property_code) return 'Elige el departamento.';
      if (otra(v.category) && !(v.category_other || '').trim()) return 'Describe la categoría.';
      if (!(Number(v.amount) > 0)) return 'El monto debe ser mayor a cero.';
      const row = { kind, date: v.date, property_code: v.property_code, category: v.category, category_other: otra(v.category) ? v.category_other.trim() : null, description: (v.description || '').trim() || null, amount: Number(v.amount), photos: v.photos || [] };
      if (t) upd('transactions', { id: t.id }, row, 'Guardado'); else ins('transactions', { id: uid(), ...row, checked: false, reservation_id: null }, 'Guardado');
    }
  });
}
async function saveFile(blob, filename) {
  if (window.claude && window.claude.use) {
    const dl = await window.claude.use('downloads').catch(() => null);
    if (dl) { try { await dl.save({ filename, data: blob }); toast('Archivo guardado'); } catch (e) { toast(e && e.code === 'declined' ? 'Descarga cancelada' : 'No se pudo descargar aquí'); } return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar el exportador')); document.head.appendChild(s); }); }
async function excelJS() { if (!window.ExcelJS) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'); return window.ExcelJS; }
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
async function exportCal() {
  try { const X = await excelJS(), wb = new X.Workbook(); MGMX.fillCalendar(wb.addWorksheet(fmtMes(S.calMes)), S.t, S.calMes);
    saveFile(new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_MIME }), 'MGM_calendario_' + S.calMes + '.xlsx'); } catch (e) { toast(e.message); }
}
async function exportBackup() {
  try { const X = await excelJS(), wb = MGMX.buildBackup(X, S.t, today(), { claves: false });
    saveFile(new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_MIME }), 'MGM_respaldo_' + today() + '.xlsx'); } catch (e) { toast(e.message); }
}
async function exportFin(fmtx) {
  const mk = kind => finRows(kind, false).map(t => ({ Mes: t.date.slice(0, 7), Departamento: t.property_code, 'Categoría': catLabel(t), Fecha: t.date, 'Descripción': t.description || '', Monto: Number(t.amount), Capturado: t.checked ? 'Sí' : 'No', Fotos: (t.photos || []).length }));
  const g = mk('gasto'), i = mk('ingreso'), name = 'MGM_ingresos_gastos_' + (S.f.fin.mes || 'todo') + (S.f.fin.depa ? '_' + S.f.fin.depa.replace(/\s+/g, '') : '');
  if (!g.length && !i.length) return toast('No hay nada que exportar con estos filtros');
  try {
    if (fmtx === 'csv') {
      const rows = [...g.map(r => ({ Tipo: 'Gasto', ...r })), ...i.map(r => ({ Tipo: 'Ingreso', ...r }))], cols = Object.keys(rows[0]);
      const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      return saveFile(new Blob(['﻿' + [cols.join(','), ...rows.map(r => cols.map(c => q(r[c])).join(','))].join('\r\n')], { type: 'text/csv' }), name + '.csv');
    }
    if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const wb = XLSX.utils.book_new(), head = ['Mes', 'Departamento', 'Categoría', 'Fecha', 'Descripción', 'Monto', 'Capturado', 'Fotos'];
    for (const [n, rows] of [['Gastos', g], ['Ingresos', i]]) { const ws = XLSX.utils.json_to_sheet(rows, { header: head }); ws['!cols'] = [10, 16, 26, 12, 40, 12, 10, 6].map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, n); }
    saveFile(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name + '.xlsx');
  } catch (e) { toast(e.message); }
}

// ---------- PENDIENTES ----------
VIEWS.pendientes = () => {
  const f = S.f.task, ord = Object.fromEntries(props().map((p, i) => [p.code, i]));
  const resps = [...new Set(S.t.tasks.map(t => t.responsible).filter(Boolean))].sort();
  let rs = S.t.tasks.filter(t => (!f.depa || t.property_code === f.depa) && (!f.status || t.status === f.status) && (!f.prio || t.priority === f.prio) && (!f.resp || t.responsible === f.resp));
  const term = t => (t.status === 'terminado' ? 1 : 0);
  rs.sort((a, b) => term(a) - term(b) || (f.sort === 'prio' ? PR_ORD[a.priority] - PR_ORD[b.priority] || (a.date || '9').localeCompare(b.date || '9') : f.sort === 'date' ? (a.date || '9').localeCompare(b.date || '9') : (ord[a.property_code] ?? 99) - (ord[b.property_code] ?? 99) || PR_ORD[a.priority] - PR_ORD[b.priority]));
  let h = `<div class="row" style="margin-bottom:10px"><button class="pri big sp" data-newtask="1">＋ Nuevo pendiente</button></div>`;
  h += `<div class="row filt">${fsel('task', 'depa', depaOpts('Todos los depas'))}${fsel('task', 'status', [['', 'Todo estatus'], ...Object.entries(ST)])}${fsel('task', 'prio', [['', 'Toda prioridad'], ...Object.entries(PR)])}${fsel('task', 'resp', [['', 'Todo responsable'], ...resps])}${fsel('task', 'sort', [['prio', 'Orden: prioridad'], ['date', 'Orden: fecha'], ['depa', 'Orden: depa']])}</div>`;
  h += rs.length ? rs.map(t => `<div class="card tap ${t.status === 'terminado' ? 'done' : ''}" data-task="${t.id}"><div class="row"><i class="dot ${t.priority}"></i><span class="dp">${esc(t.property_code || 'General')}</span><span class="sp"></span><span class="b ${t.status === 'terminado' ? 'alta' : t.status === 'en_pausa' ? 'n' : 'cambio'}">${ST[t.status].toUpperCase()}</span></div><div style="margin-top:4px">${esc(t.description)}</div><div class="m">${[t.responsible, t.date && fmt(t.date)].filter(Boolean).map(esc).join(' · ')}</div>${t.progress ? `<div class="m">Avance: ${esc(t.progress)}</div>` : ''}</div>`).join('') : '<div class="card empty">Sin pendientes con estos filtros.</div>';
  return h;
};
function taskForm(id) {
  const t = id ? S.t.tasks.find(x => x.id === id) : null;
  openForm({
    title: t ? 'Editar pendiente' : 'Nuevo pendiente',
    values: t ? { ...t, ...respIn(t.responsible), date: t.date || '', progress: t.progress || '', property_code: t.property_code || '' } : { property_code: S.f.task.depa || '', description: '', ...respIn(''), date: today(), progress: '', status: 'en_proceso', priority: 'media' },
    fields: v => [{ k: 'property_code', label: 'Departamento', type: 'select', options: depaOpts() }, { k: 'description', label: 'Descripción', type: 'textarea' }, ...respFields(v), { k: 'date', label: 'Fecha', type: 'date' },
      { k: 'priority', label: 'Prioridad', type: 'select', options: Object.entries(PR) }, { k: 'status', label: 'Estatus', type: 'select', options: Object.entries(ST) }, { k: 'progress', label: 'Avances', type: 'textarea' }],
    actions: t ? [{ label: 'Borrar', confirm: true, run: () => del('tasks', { id: t.id }, 'Borrado') }] : [],
    save: async v => { if (!v.property_code) return 'Elige el departamento.'; if (!(v.description || '').trim()) return 'Falta la descripción.';
      const row = { property_code: v.property_code, description: v.description.trim(), responsible: respOut(v), date: v.date || null, progress: (v.progress || '').trim() || null, status: v.status, priority: v.priority };
      if (t) upd('tasks', { id: t.id }, row, 'Guardado'); else ins('tasks', { id: uid(), ...row }, 'Guardado'); }
  });
}

// ---------- COMPRAS ----------
VIEWS.compras = () => {
  const f = S.f.buy, uniq = k => [...new Set(S.t.purchases.map(t => t[k]).filter(Boolean))].sort();
  let rs = S.t.purchases.filter(t => (f.estado === 'todas' || (f.estado === 'pend') === !t.done) && (!f.resp || t.responsible === f.resp) && (!f.store || t.store === f.store));
  rs.sort((a, b) => (f.sort === 'store' ? (a.store || '~').localeCompare(b.store || '~') : 0) || (a.date || '9').localeCompare(b.date || '9'));
  let h = `<div class="row" style="margin-bottom:10px"><button class="pri big sp" data-newbuy="1">＋ Nueva compra</button></div>`;
  h += `<div class="row filt">${fsel('buy', 'estado', [['pend', 'Pendientes'], ['hechas', 'Compradas'], ['todas', 'Todas']])}${fsel('buy', 'store', [['', 'Todos los lugares'], ...uniq('store')])}${fsel('buy', 'resp', [['', 'Todo responsable'], ...uniq('responsible')])}${fsel('buy', 'sort', [['date', 'Orden: fecha'], ['store', 'Orden: lugar']])}</div>`;
  h += rs.length ? rs.map(t => `<div class="card row tx ${t.done ? 'done' : ''}"><input type="checkbox" class="chk" data-chk="purchases|${t.id}|done" ${t.done ? 'checked' : ''}><div class="sp tap" data-buy="${t.id}"><div>${esc(t.description)}</div><div class="m">${[t.store, t.responsible, t.date && fmt(t.date)].filter(Boolean).map(esc).join(' · ')}</div></div></div>`).join('') : '<div class="card empty">Sin compras con estos filtros.</div>';
  return h;
};
function buyForm(id) {
  const t = id ? S.t.purchases.find(x => x.id === id) : null;
  openForm({
    title: t ? 'Editar compra' : 'Nueva compra',
    values: t ? { ...t, ...respIn(t.responsible), store: t.store || '', date: t.date || '' } : { description: '', store: '', ...respIn(''), date: today() },
    fields: v => [{ k: 'description', label: 'Descripción', type: 'text', ph: 'Ej. cloro, bolsas, fibras' }, { k: 'store', label: 'Lugar de compra', type: 'text', ph: 'Ej. Costco' }, ...respFields(v), { k: 'date', label: 'Fecha', type: 'date' }],
    actions: t ? [{ label: 'Borrar', confirm: true, run: () => del('purchases', { id: t.id }, 'Borrado') }] : [],
    save: async v => { if (!(v.description || '').trim()) return 'Falta la descripción.';
      const row = { description: v.description.trim(), store: (v.store || '').trim() || null, responsible: respOut(v), date: v.date || null };
      if (t) upd('purchases', { id: t.id }, row, 'Guardado'); else ins('purchases', { id: uid(), ...row, done: false }, 'Guardado'); }
  });
}

// ---------- CLAVES / LIGAS ----------
VIEWS.claves = () => {
  const places = [...props().map(p => p.code), ...EXTRA_PLACES];
  return `<div class="m" style="margin-bottom:8px">Se guardan al salir de cada campo.</div><div class="card scroll"><table><tr><th>Lugar</th><th>Clave 1</th><th>Clave 2</th></tr>${places.map(pl => { const c = S.t.access_codes.find(x => x.place === pl) || {};
    return `<tr><td class="dp">${esc(pl)}</td><td><input class="code" data-code="${esc(pl)}|code1" value="${esc(c.code1 || '')}" autocomplete="off"></td><td><input class="code" data-code="${esc(pl)}|code2" value="${esc(c.code2 || '')}" autocomplete="off"></td></tr>`; }).join('')}</table></div>`;
};
VIEWS.ligas = () => props().map(p => `<div class="card"><div class="row"><span class="dp">${esc(p.code)}</span><span class="sp"></span>${p.airbnb_url ? `<a href="${esc(p.airbnb_url)}" target="_blank" rel="noopener">Abrir</a>` : ''}<button class="${p.airbnb_url ? 'pri' : ''}" data-copyurl="${esc(p.code)}" ${p.airbnb_url ? '' : 'disabled'}>Copiar</button></div><input style="width:100%;margin-top:8px" type="url" inputmode="url" placeholder="https://airbnb.mx/h/…" data-url="${esc(p.code)}" value="${esc(p.airbnb_url || '')}"></div>`).join('');

// ---------- PERFIL ----------
const inicial = u => esc(((u.name || u.email || '?')[0] || '?').toUpperCase());
const avatarHTML = u => (u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : inicial(u));
async function avatarImg(file) {
  const bmp = await createImageBitmap(file), side = Math.min(bmp.width, bmp.height), N = 256;
  const c = document.createElement('canvas'); c.width = c.height = N;
  c.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, N, N);
  return c.toDataURL('image/jpeg', 0.85);
}
async function setAvatar(img) {
  const prev = S.me.avatar; S.me.avatar = img; render();
  const err = await DB.setAvatar(img);
  if (err) { S.me.avatar = prev; render(); toast('No se guardó la foto: ' + err); } else toast(img ? 'Foto actualizada' : 'Foto quitada');
}
VIEWS.perfil = () => { const u = S.me, sup = u.role === 'superadmin';
  return `<div class="card perfil"><label class="avatar big-av" title="Cambiar foto">${avatarHTML(u)}<input type="file" accept="image/*" hidden data-avatar="1"></label>
  <div class="row" style="justify-content:center;margin:-2px 0 10px"><label class="linkbtn">${u.avatar ? 'Cambiar foto' : 'Agregar foto'}<input type="file" accept="image/*" hidden data-avatar="1"></label>${u.avatar ? '<button class="linkbtn" data-noavatar="1">Quitar</button>' : ''}</div><div style="font-size:20px;font-weight:600">${esc(u.name || '')}</div><div class="m">${esc(u.email)}</div><div class="m" style="margin-top:4px">${ROLES[u.role]}</div></div>
  ${sup ? `<div class="card"><label class="fl" style="margin-top:0"><span>Nombre</span><input data-myname="1" value="${esc(u.name || '')}"></label></div><button class="sp" style="width:100%;margin-bottom:8px" data-go="supuestos">Administrar usuarios</button>` : ''}
  <button style="width:100%" data-logout="1">Cerrar sesión</button>`; };

// ---------- SUPUESTOS ----------
VIEWS.supuestos = () => {
  let h = `<h2>Nómina y cajones</h2><div class="card"><div class="row"><span class="sp">Bono por limpieza en domingo</span><input type="number" style="width:90px" data-set="bono_domingo" value="${Number(setting('bono_domingo', 50))}"></div><div class="row" style="margin-top:8px"><span class="sp">Renta mensual por cajón prestado</span><input type="number" style="width:90px" data-set="renta_cajon" value="${Number(setting('renta_cajon', 500))}"></div></div>`;
  h += '<h2>Cajones Qalina</h2><div class="card scroll"><table><tr><th>Depa</th><th>Tiene</th><th>Sótano</th><th>Presta</th></tr>';
  for (const p of [...props(), ...cajonesSueltos()].filter(p => p.building === 'Qalina')) h += `<tr><td class="dp">${esc(p.code)}</td><td><input type="checkbox" class="chk" data-pp="${esc(p.code)}|has_parking" ${p.has_parking ? 'checked' : ''}></td><td><input type="number" style="width:60px" data-pp="${esc(p.code)}|parking_level" value="${p.parking_level ?? ''}"></td><td><input type="checkbox" class="chk" data-pp="${esc(p.code)}|lends_parking" ${p.lends_parking ? 'checked' : ''}></td></tr>`;
  h += '</table></div>';
  h += `<div class="row"><h2 class="sp">Chicas</h2><button data-newcleaner="1">＋ Agregar</button></div><div class="card list">${S.t.cleaners.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => `<div class="it"><span class="b n">${esc(c.key)}</span><div class="sp">${esc(c.name)}${c.active === false ? ' <span class="m">(inactiva)</span>' : ''}</div><button data-togcleaner="${esc(c.key)}">${c.active === false ? 'Activar' : 'Desactivar'}</button></div>`).join('')}</div>`;
  h += `<h2>Limpieza a cargo de MGM</h2><div class="card"><div class="m" style="margin-bottom:6px">Desmarca los depas cuya limpieza no hacemos: no pedirán asignar chica ni entran a nómina.</div><div class="chips">${props().map(p => `<label class="chip ${p.cleaning !== false ? 'on' : ''}"><input type="checkbox" class="chk" data-pp="${esc(p.code)}|cleaning" ${p.cleaning !== false ? 'checked' : ''}> ${esc(p.code)}</label>`).join('')}</div></div>`;
  h += `<div class="row"><h2 class="sp">Usuarios</h2><button data-newuser="1">＋ Agregar</button></div><div class="card list">${S.t.app_users.map(u => `<div class="it"><span class="avatar sm">${avatarHTML(u)}</span><div class="sp"><div>${esc(u.name || u.email)}</div><div class="m">${esc(u.email)} </div></div>${u.email.toLowerCase() === S.email.toLowerCase() ? '<span class="m">tú</span>' : `<select data-urole="${esc(u.email)}">${ROLE_OPTS.map(([v]) => `<option value="${v}" ${u.role === v ? 'selected' : ''}>${v === 'superadmin' ? 'Superadmin' : v === 'socio' ? 'Socio' : 'Finanzas'}</option>`).join('')}</select><button data-deluser="${esc(u.email)}">Quitar</button>`}</div>`).join('')}</div>`;
  const be = setting('backup_emails', []);
  h += `<h2>Respaldo diario</h2><div class="card"><div class="m">Todos los días a las 10:00 pm se envía un Excel con toda la operación (calendario, reservas, nómina, gastos e ingresos, pendientes, compras…) a estos correos, separados por coma:</div><input style="width:100%;margin:8px 0" data-backup="1" value="${esc((Array.isArray(be) ? be : []).join(', '))}"><div class="row"><span class="m sp">Las claves de puerta no se incluyen.</span><button data-expbackup="1">Descargar respaldo ahora</button></div></div>`;
  h += `<div class="card row"><div class="sp m">${esc(S.email)}</div><button data-logout="1">Cerrar sesión</button></div>`;
  return h;
};

// ---------- eventos ----------
$('tabbar').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(b.dataset.t); });
$('back').addEventListener('click', () => go('menu'));
const salir = () => { if (CFG.DEMO) return toast('En la maqueta no hay sesión que cerrar'); DB.logout(); };
$('salir').addEventListener('click', salir);
$('logo').addEventListener('click', () => S.me && go(homeTab()));
$('avatar').addEventListener('click', () => go('perfil'));
window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (t && t !== S.tab) { S.tab = t; render(); } });

$('view').addEventListener('click', async e => {
  const el = e.target.closest('button,[data-res],[data-tx],[data-task],[data-buy],[data-extra]'); if (!el) return; const d = el.dataset;
  if (d.asig) return sheetAsignar(d.asig);
  if (d.extra) return extraForm(d.extra);
  if (d.newextra) return extraForm(null);
  if (d.res) return resForm(d.res);
  if (d.tx) return txForm(d.tx);
  if (d.task) return taskForm(d.task);
  if (d.buy) return buyForm(d.buy);
  if (d.go) return go(d.go);
  if (d.newres) return resForm(null);
  if (d.newblock) return blockForm();
  if (d.newtx) return txForm(null);
  if (d.newtask) return taskForm(null);
  if (d.newbuy) return buyForm(null);
  if (d.fset) { const [g, k, v] = d.fset.split('|'); S.f[g][k] = v; return render(); }
  if (d.hoy) { const t = today(), a = activas(); return d.hoy === 'sale' ? sheetLista('Salen hoy', a.filter(r => r.checkout === t), 'sale') : d.hoy === 'entra' ? sheetLista('Entran hoy', a.filter(r => r.checkin === t)) : d.hoy === 'libre' ? sheetLibres(t) : sheetLista('Ocupados esta noche', ocupadas(t)); }
  if (d.cm) { const n = +d.cm; if (!n) { S.calMes = today().slice(0, 7); S.calScroll = true; } else { const [y, m] = S.calMes.split('-').map(Number); const x = new Date(y, m - 1 + n, 1); S.calMes = x.getFullYear() + '-' + pad(x.getMonth() + 1); } return render(); }
  if (d.undo) return deshacer();
  if (d.zoom) { S.zoom = Math.min(1.4, Math.max(0.3, Math.round((S.zoom + 0.1 * +d.zoom) * 10) / 10)); ls.set('mgm-zoom', S.zoom); return render(); }
  if (d.dn) { S.dia = +d.dn ? add(S.dia, +d.dn) : today(); return render(); }
  if (d.wn) { S.semana = +d.wn ? add(S.semana, 7 * +d.wn) : monday(today()); return render(); }
  if (d.car) { const v = d.v === '1'; return upd('reservations', { id: d.car }, v ? { has_car: true } : { has_car: false, parking_from: null }); }
  if (d.otro) return otroForm(d.otro);
  if (d.pago) return pagoForm(d.pago);
  if (d.copynom) { try { await navigator.clipboard.writeText(textoNomina(d.copynom, S.semana)); toast('Copiado: nómina de ' + nombre(d.copynom)); } catch (_) { toast('No se pudo copiar'); } return; }
  if (d.copyurl) { try { await navigator.clipboard.writeText(prop(d.copyurl).airbnb_url); toast('Liga copiada'); } catch (_) { toast('No se pudo copiar'); } return; }
  if (d.del) { if (!confirmTap(el)) return; const [t, id] = d.del.split('|'); return del(t, { id }, 'Quitado'); }
  if (d.export) return exportFin(d.export);
  if (d.expcal) return exportCal();
  if (d.expbackup) return exportBackup();
  if (d.addoff) { const date = $('offDate').value, k = $('offK').value; if (!date || !k) return; return ups('days_off', { date, cleaner_key: k }, ['date', 'cleaner_key'], 'Descanso agregado'); }
  if (d.deloff) { const [date, k] = d.deloff.split('|'); return del('days_off', { date, cleaner_key: k }); }
  if (d.togcleaner) { const c = S.t.cleaners.find(x => x.key === d.togcleaner); return upd('cleaners', { key: c.key }, { active: c.active === false }); }
  if (d.newcleaner) return openForm({ title: 'Agregar chica', values: { key: '', name: '' }, fields: () => [{ k: 'name', label: 'Nombre', type: 'text' }, { k: 'key', label: 'Clave (1 o 2 letras, sale en el calendario)', type: 'text' }],
    save: async v => { const key = (v.key || '').trim().toUpperCase(); if (!(v.name || '').trim()) return 'Falta el nombre.'; if (!/^[A-ZÑ]{1,2}$/.test(key)) return 'La clave debe ser 1 o 2 letras.'; if (S.t.cleaners.some(c => c.key === key)) return 'Esa clave ya existe.'; ins('cleaners', { key, name: v.name.trim(), phone: null, active: true }, 'Agregada'); } });
  if (d.newuser) return openForm({ title: 'Agregar usuario', values: { email: '', name: '', role: 'superadmin' }, fields: () => [{ k: 'name', label: 'Nombre', type: 'text' }, { k: 'email', label: 'Correo', type: 'email' }, { k: 'role', label: 'Acceso', type: 'select', options: ROLE_OPTS }],
    save: async v => { const email = (v.email || '').trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(email)) return 'Correo inválido.'; ups('app_users', { email, name: (v.name || '').trim() || null, role: v.role }, ['email'], 'Usuario agregado'); } });
  if (d.deluser) { if (!confirmTap(el)) return; return del('app_users', { email: d.deluser }, 'Usuario quitado'); }
  if (d.noavatar) return setAvatar(null);
  if (d.logout) return salir();
});
$('view').addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (d.f) { const [g, k] = d.f.split('|'); S.f[g][k] = t.value; return render(); }
  if (d.chk) { const [tb, id, f] = d.chk.split('|'); return upd(tb, { id }, { [f]: t.checked }); }
  if (d.caj !== undefined) return upd('reservations', { id: d.caj }, { parking_from: t.value || null });
  if (d.rate) { const [p, k] = d.rate.split('|'); return t.value === '' ? del('cleaning_rates', { property_code: p, cleaner_key: k }) : ups('cleaning_rates', { property_code: p, cleaner_key: k, amount: Number(t.value) }, ['property_code', 'cleaner_key'], 'Tarifa guardada'); }
  if (d.pp) { const [p, f] = d.pp.split('|'); return upd('properties', { code: p }, { [f]: t.type === 'checkbox' ? t.checked : t.value === '' ? null : Number(t.value) }, 'Guardado'); }
  if (d.backup) return ups('settings', { key: 'backup_emails', value: t.value.split(',').map(x => x.trim().toLowerCase()).filter(x => /^\S+@\S+\.\S+$/.test(x)) }, ['key'], 'Correos de respaldo guardados');
  if (d.avatar && t.files && t.files[0]) { const f = t.files[0]; t.value = ''; avatarImg(f).then(setAvatar).catch(() => toast('No se pudo leer la imagen')); return; }
  if (d.myname) { S.me.name = t.value.trim() || null; return upd('app_users', { email: S.me.email }, { name: S.me.name }, 'Nombre guardado'); }
  if (d.urole) return upd('app_users', { email: d.urole }, { role: t.value }, 'Acceso actualizado');
  if (d.set) return ups('settings', { key: d.set, value: Number(t.value) || 0 }, ['key'], 'Guardado');
  if (d.code) { const [place, f] = d.code.split('|'); const cur = S.t.access_codes.find(x => x.place === place) || { place, code1: null, code2: null }; return ups('access_codes', { ...cur, [f]: t.value.trim() || null }, ['place'], 'Clave guardada'); }
  if (d.url !== undefined) return upd('properties', { code: d.url }, { airbnb_url: t.value.trim() || null }, 'Liga guardada');
});

// maqueta: cambiar rol / cargar ejemplos
if (CFG.DEMO) {
  const bar = $('demobar'); bar.hidden = false;
  bar.innerHTML = `<b>MAQUETA</b> <select id="demoRole"><option value="superadmin">Ver como María (superadmin)</option><option value="socio">Ver como Mike (socio)</option><option value="finanzas">Ver como Sandy (finanzas)</option></select> <button id="demoEj">Cargar ejemplos</button> <button id="demoVac">Datos del Excel</button>`;
  $('demoRole').value = DB.role;
  const again = async () => { S.email = null; S.tab = 'hoy'; boot(await DB.session()); };
  $('demoRole').addEventListener('change', e => { DB.setRole(e.target.value); again(); });
  $('demoEj').addEventListener('click', () => { DB.reset(true); again(); toast('Ejemplos cargados'); });
  $('demoVac').addEventListener('click', e => { if (!confirmTap(e.target)) return; DB.reset(false); again(); toast('Datos del Excel restaurados'); });
}

initJump();
start();
})();
