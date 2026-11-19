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
  park: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9.5 17V7h3.5a3 3 0 0 1 0 6H9.5"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  task: '<path d="M9 11l2 2 4-4"/><rect x="4" y="4" width="16" height="16" rx="3"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M3 4h2l2.4 11h11l2-8H7"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'
};
let DEFAULT_BAR = '';
const APP_VER = '54';
const TABLES = ['properties', 'cleaners', 'cleaning_rates', 'settings', 'app_users', 'reservations', 'blocks', 'days_off',
  'payroll_extras', 'payroll_payments', 'transactions', 'tasks', 'purchases', 'access_codes', 'cleanings', 'pnl_beta', 'parking_loans', 'service_accounts', 'service_payments', 'sync_log'];
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
    async touch() { try { await sb.rpc('touch_me'); } catch (_) {} },
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
    async load(t) { return { rows: JSON.parse(JSON.stringify(T[t] || (T[t] = []))) }; },
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
const apartado = (code, d) => (S.t.parking_loans || []).find(x => x.cajon === code && x.date_from <= d && d < x.date_to);
const cajonesSueltos = () => S.t.properties.filter(p => p.active !== false && esCajon(p)).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
const limpiaMGM = c => (prop(c) || {}).cleaning !== false;
const props = () => S.t.properties.filter(p => p.active !== false && !esCajon(p)).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
const prop = c => S.t.properties.find(p => p.code === c);
const isQ = c => (prop(c) || {}).building === 'Qalina';
const cleaners = () => S.t.cleaners.filter(c => c.active !== false).sort((a, b) => a.name.localeCompare(b.name));
const NA = 'NA'; const hayNA = () => S.t.cleaners.some(c => c.key === NA); // "N/A": esta salida no lleva limpieza (cuenta como resuelta, no entra a nómina)
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
async function reload(t) { const r = await DB.load(t); if (r.rows) { S.t[t] = r.rows; S.falta?.delete(t); render(); } }

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
function showLogin() { S.email = null; $('shell').hidden = true; $('login').hidden = false; window.__mgmOK && window.__mgmOK(); }
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
  S.email = email; $('login').hidden = true; $('shell').hidden = false; window.__mgmOK && window.__mgmOK();
  $('view').innerHTML = '<div class="empty">Cargando…</div>';
  const lento = setTimeout(() => { if ($('view').textContent.trim() === 'Cargando…') $('view').innerHTML = '<div class="card" style="text-align:center"><b>Está tardando en cargar</b><div class="m" style="margin:8px 0 12px">Puede ser la señal o una versión vieja guardada en el teléfono.</div><div class="row" style="gap:8px;justify-content:center"><button onclick="location.reload()">Reintentar</button><button class="pri" onclick="window.__mgmLimpiar && window.__mgmLimpiar()">Limpiar y recargar</button></div></div>'; }, 15000);
  const res = await Promise.all(TABLES.map(t => DB.load(t)));
  clearTimeout(lento);
  S.falta = new Set(); TABLES.forEach((t, i) => { S.t[t] = res[i].rows || []; if (!res[i].rows) S.falta.add(t); });
  S.me = S.t.app_users.find(u => (u.email || '').toLowerCase() === email.toLowerCase()) || null;
  if (S.me && DB.touch) DB.touch();
  render();
  const timers = {};
  DB.subscribe(t => { clearTimeout(timers[t]); timers[t] = setTimeout(() => reload(t), 400); }, ok => { S.live = ok; renderLive(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) return; if (S.tab === 'calendario') { S.calMes = today().slice(0, 7); S.calScroll = true; render(); } if (!CFG.DEMO) TABLES.forEach(reload); });
}

// ---------- navegación ----------
const MAIN = ['hoy', 'cajones', 'calendario', 'nomina', 'menu'];
const MENU = [
  ['reservas', 'Reservas', 'Capturar, buscar y editar reservas'],
  ['limpiezas', 'Limpiezas', 'Descansos, supervisión y tarifas'],
  ['finanzas', 'Gastos e ingresos', 'Captura, fotos y exportar a Excel'],
  ['pendientes', 'Pendientes', 'Tareas por departamento'],
  ['compras', 'Compras', 'Lista de compras pendientes'],
  ['claves', 'Claves', 'Claves de puerta, bodega y caja fuerte'],
  ['ligas', 'Ligas Airbnb', 'Liga de cada anuncio para copiar'],
  ['servicios', 'Pagos de servicios', 'Luz, agua, gas, internet y mantenimiento por depa · histórico'],
  ['pnl', 'P&L (Beta)', 'Reportes por depa y para dueños · solo María y Paco'],
  ['usuarios', 'Admin', 'Automatizaciones (prender/apagar) · permisos · actividad · solo superadmin'],
  ['supuestos', 'Supuestos', 'Chicas, cajones, bono, usuarios']
];
const ROLES = { superadmin: 'Superadmin · acceso a todo', socio: 'Socio · calendario, cajones, pendientes, compras, claves y ligas', finanzas: 'Finanzas · solo gastos e ingresos' };
const ROLE_OPTS = [['superadmin', 'Superadmin (todo)'], ['socio', 'Socio (calendario, cajones, pendientes, compras, claves, ligas)'], ['finanzas', 'Finanzas (solo gastos e ingresos)']];
const ACCESS = {
  superadmin: { home: 'hoy', bar: null },
  socio: { home: 'hoy', bar: [['hoy', 'Hoy', ICON.home, 1], ['cajones', 'Cajones', ICON.park], ['calendario', 'Calendario', ICON.cal], ['pendientes', 'Pendientes', ICON.task], ['compras', 'Compras', ICON.cart], ['claves', 'Claves', ICON.key], ['ligas', 'Ligas', ICON.link]] },
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
const TITLES = { perfil: 'Mi perfil', reservas: 'Reservas', cajones: 'Cajones Qalina', hoy: 'Hoy', calendario: 'Calendario', nomina: 'Nómina', menu: 'Menú', ...Object.fromEntries(MENU.map(m => [m[0], m[1]])) };
const VIEWS = {};
function go(tab) { S.tab = tab; try { history.replaceState(null, '', '#' + tab); } catch (_) {} scrollTo(0, 0); S.calScroll = tab === 'calendario'; if (tab === 'servicios') { S.servScroll = true; const pm = mesAnt(); if (S.f.serv) { S.f.serv.y = pm.slice(0, 4); S.f.serv.m = pm.slice(5); } } render(); }
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
const mesAnt = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return ymd(d).slice(0, 7); };
// Pagos de servicios: abre con la columna del mes anterior pegada a la columna de depa
function irAMesAnt() {
  const sel = S.f.serv ? S.f.serv.y + '-' + (S.f.serv.m || mesAnt().slice(5)) : mesAnt();
  const box = document.querySelector('#view .scroll'), th = box && box.querySelector('th[data-per="' + sel + '"]'), dpc = box && box.querySelector('th.dpc');
  if (!th || !dpc) return; box.scrollLeft = 0; box.scrollLeft = th.getBoundingClientRect().left - dpc.getBoundingClientRect().right;
}
function irAHoy() {
  const sem = $('semhoy'); if (!sem) return;
  sem.scrollIntoView({ block: 'start' });
  const th = sem.querySelector('th.hoy'), dpc = sem.querySelector('th.dpc'); if (!th || !dpc) return;
  let x = 0; for (let el = th; el && el !== sem; el = el.offsetParent) x += el.offsetLeft;
  sem.scrollLeft = Math.max(0, x - dpc.offsetWidth);
  // corrección por zoom (iPhone y Chrome lo reportan distinto)
  for (let i = 0; i < 2; i++) { const d = th.getBoundingClientRect().left - dpc.getBoundingClientRect().right; if (Math.abs(d) < 3) break; sem.scrollLeft += i ? d : d / (S.zoom || 1); }
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
  const keepS = S.tab === 'servicios' && S.lastTab === 'servicios' ? [...document.querySelectorAll('#view .scroll')].map(c => c.scrollLeft) : null;
  const keepX = S.tab === 'calendario' && S.lastTab === 'calendario' && S.lastMes === S.calMes ? [...document.querySelectorAll('#view .cal')].map(c => c.scrollLeft) : null;
  $('view').innerHTML = VIEWS[S.tab]();
  if (keepS && !S.servScroll) document.querySelectorAll('#view .scroll').forEach((c, i) => { if (keepS[i]) c.scrollLeft = keepS[i]; });
  if (keepX) document.querySelectorAll('#view .cal').forEach((c, i) => { if (keepX[i]) c.scrollLeft = keepX[i]; });
  S.lastTab = S.tab; S.lastMes = S.calMes;
  fijarCabecera();
  { const rs = document.documentElement.style, bar = document.querySelector('.bar'), ch = document.querySelector('.calhead');
    if (bar) rs.setProperty('--barh', bar.offsetHeight + 'px'); if (ch) rs.setProperty('--calh', ch.offsetHeight + 'px'); }
  if (S.servScroll && S.tab === 'servicios') { S.servScroll = false; irAMesAnt(); requestAnimationFrame(irAMesAnt); }
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
$('sheet').addEventListener('change', e => { const t = e.target; if (t.id === 'waD') { S.waD = t.value; sheetAsigWA(); } else if (t.id === 'waClv') { S.waClv = t.checked; sheetAsigWA(); } });
$('sheet').addEventListener('click', async e => {
  if (e.target.id === 'sheet') return closeSheet();
  const img = e.target.closest('img[data-phi]'); if (img) { $('viewerImg').src = img.src; $('viewer').hidden = false; return; }
  const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
  if (d.close) return closeSheet();
  if (d.rmph !== undefined && F) { const k = F.fields(F.v).find(f => f && f.type === 'photos').k; F.v[k].splice(+d.rmph, 1); return drawForm(); }
  if (d.act !== undefined && F) { const a = F.actions[+d.act]; if (a.confirm && !confirmTap(b)) return; const v = F.v; closeSheet(); return a.run(v); }
  if (d.pick !== undefined) { closeSheet(); return upd('reservations', { id: d.id }, { cleaner_key: d.pick || null }, d.pick === NA ? 'Marcada N/A · no se limpia' : d.pick ? 'Asignado a ' + nombre(d.pick) : 'Sin asignar'); }
  if (d.editres) { closeSheet(); return resForm(d.editres); }
  if (d.wacopy) { const t = $('waTxt').value; try { await navigator.clipboard.writeText(t); toast('Copiado, pégalo en WhatsApp'); } catch (_) { $('waTxt').select(); document.execCommand('copy'); toast('Copiado'); } return; }
  if (d.wapl) { S.waTit = $('waTit').value; S.waPie = $('waPie').value; S.waSel.has(d.wapl) ? S.waSel.delete(d.wapl) : S.waSel.add(d.wapl); return sheetWA(); }
  if (d.wa) { S.waTit = $('waTit').value; S.waPie = $('waPie').value; const L = clavesConCodigo().map(x => x.pl); S.waSel = new Set(d.wa === 'todos' ? L : d.wa === 'qalina' ? L.filter(x => x === 'Bodega Qalina' || (prop(x) || {}).building === 'Qalina') : []); return sheetWA(); }
  if (d.wagen) { S.waTit = $('waTit').value.trim() || 'CONTRASEÑAS DEPARTAMENTOS'; S.waPie = $('waPie').value.trim(); return crearImagenWA(); }
  if (d.washare) return compartirWA();
  if (d.wadl) return saveFile(S.waBlob, 'claves.png');
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
    const ap = v.checkin && v.checkout && (S.t.parking_loans || []).find(x => x.cajon === p.code && x.date_from < v.checkout && v.checkin < x.date_to);
    return [p.code, `${p.code} · sótano ${p.parking_level ?? '?'}${busy ? ' · OCUPADO' : ap ? ' · APARTADO a ' + ap.name : ''}`];
  });
}
function cleanerOpts(depa, fecha, actual) { return [['', '— sin asignar —'], ...(hayNA() ? [[NA, 'N/A · no se limpia']] : []), ...cleaners().filter(c => !(fecha && descansa(fecha, c.key)) || c.key === actual).map(c => { const t = rate(depa, c.key); return [c.key, c.name + (t != null ? ' · ' + money(t) : '') + (fecha && descansa(fecha, c.key) ? ' · descansa' : '')]; })]; }
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
    <div class="row" style="margin-top:14px">${hayNA() ? `<button class="${r.cleaner_key === NA ? 'pri' : ''}" data-pick="${NA}" data-id="${r.id}">N/A · no se limpia</button>` : ''}<button data-pick="" data-id="${r.id}">Quitar asignación</button><button data-editres="${r.id}">Editar reserva</button><span class="sp"></span><button data-close="1">Cerrar</button></div>`);
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
// ---------- Asignaciones del día para WhatsApp (María copia y pega mientras toma confianza) ----------
function textoAsignaciones(d, conClaves) {
  const P = new Set(props().filter(p => p.cleaning !== false).map(p => p.code)), act = activas();
  const L = [...act.filter(r => r.checkout === d && P.has(r.property_code)).map(r => ({ k: r.cleaner_key, dp: r.property_code, t: 'Salida', ent: act.find(x => x.property_code === r.property_code && x.checkin === d) })),
    ...S.t.cleanings.filter(x => x.date === d && P.has(x.property_code)).map(x => ({ k: x.cleaner_key, dp: x.property_code, t: 'Limpieza extra' + (x.note ? ' (' + x.note + ')' : '') }))];
  const by = {}; L.filter(x => x.k !== NA).forEach(x => (by[x.k || ''] = by[x.k || ''] || []).push(x));
  const fecha = fmt(d);
  const clave = c => { const a = S.t.access_codes.find(x => x.place === c); return a && (a.code1 || a.code2) ? ' · clave ' + [a.code1, a.code2].filter(Boolean).join(' / ') : ''; };
  const bloque = k => `*${k ? nombre(k) : 'SIN ASIGNAR'}* · ${fecha}\n` + by[k].map(x => `• ${x.dp} – ${x.t}${x.ent ? ' · entra huésped hoy' : ''}${conClaves ? clave(x.dp) : ''}`).join('\n');
  const keys = Object.keys(by).sort((a, b) => (a ? nombre(a) : 'zz').localeCompare(b ? nombre(b) : 'zz'));
  return { keys, fecha, total: L.filter(x => x.k !== NA).length, todo: keys.length ? `🧹 *Limpiezas ${fecha}*\n\n` + keys.map(bloque).join('\n\n') : `Sin limpiezas el ${fecha}.`, bloque };
}
function sheetAsigWA() {
  S.waD = S.waD || add(today(), 1); const T = textoAsignaciones(S.waD, S.waClv);
  sheet(`<h3>Asignaciones para WhatsApp</h3>
    <div class="row" style="gap:8px;flex-wrap:wrap"><label class="m">Día <input type="date" id="waD" value="${S.waD}"></label><label class="m"><input type="checkbox" id="waClv" ${S.waClv ? 'checked' : ''}> Incluir claves</label><span class="sp"></span><span class="m">${T.total} limpieza(s)</span></div>
    <textarea id="waTxt" rows="9" style="width:100%;margin-top:10px;font-size:14px">${esc(T.todo)}</textarea>
    <div class="row" style="gap:8px;margin-top:8px"><button class="pri sp" data-wacopy="1">Copiar todo</button><a class="btn" href="https://wa.me/?text=${encodeURIComponent(T.todo)}" target="_blank" rel="noopener">Abrir en WhatsApp</a></div>
    ${T.keys.length > 1 ? `<div class="m" style="margin:12px 0 6px">O manda a cada chica su parte:</div>${T.keys.map(k => `<div class="row" style="margin-bottom:6px"><span class="sp">${esc(k ? nombre(k) : 'Sin asignar')}</span><a class="btn" href="https://wa.me/?text=${encodeURIComponent(T.bloque(k))}" target="_blank" rel="noopener">WhatsApp</a></div>`).join('')}` : ''}
    <div class="row" style="margin-top:10px"><span class="sp"></span><button data-close="1">Cerrar</button></div>`);
}
VIEWS.hoy = () => {
  const P = pendientes(), d = today(), act = activas();
  const salen = act.filter(r => r.checkout === d), entran = act.filter(r => r.checkin === d), occ = ocupadas(d), lib = libres(d);
  let h = `<div class="m" style="margin-bottom:8px">${fmt(d)}</div><div class="kpis k4"><button class="kpi" data-hoy="sale"><div class="v">${salen.length}</div><div class="l">Salen hoy ›</div></button><button class="kpi" data-hoy="entra"><div class="v">${entran.length}</div><div class="l">Entran hoy ›</div></button><button class="kpi" data-hoy="occ"><div class="v">${occ.length}</div><div class="l">Ocupados ›</div></button><button class="kpi" data-hoy="libre"><div class="v">${lib.length}</div><div class="l">Libres ›</div></button></div>`;
  if (isSuper()) { const L = (S.t.sync_log || []).filter(x => !x.seen).sort((a, b) => a.at < b.at ? 1 : -1);
    if (L.length) h += `<h2>🔄 Cambios de Airbnb (${L.length})</h2>` + L.slice(0, 15).map(x => `<div class="card row"><div class="sp"><div><span class="dp">${esc(x.property_code)}</span> <span class="b ${x.action === 'baja' ? 'baja' : ''}">${x.action === 'alta' ? 'NUEVA' : x.action === 'baja' ? 'CANCELADA' : 'CAMBIO'}</span></div><div class="m">${esc(x.detail)}</div></div>${x.reservation_id ? `<button class="pri" data-res="${x.reservation_id}">Abrir</button>` : ''}<button data-synok="${x.id}">Visto</button></div>`).join('') + (L.length > 1 ? `<div class="row" style="margin-bottom:8px"><span class="sp"></span><button data-synok="*">Marcar todo visto</button></div>` : ''); }
  if (isSuper()) h += `<div class="row" style="margin:12px 0 4px"><button class="sp" data-asigwa="1">📲 Asignaciones de mañana para WhatsApp</button></div>`;
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
          const ap = apartado(p.code, d);
          if (pr) es = 'Prest. a ' + esc(corto(pr.property_code));
          else if (ap) es = 'Prest. a ' + esc(ap.name);
          else if (noche && noche.has_car === true) es = p.has_parking ? 'Sí' : noche.parking_from ? 'De ' + esc(corto(noche.parking_from)) : '<span class="falta">Falta</span>';
          else if (noche && noche.has_car === false) es = 'No';
        }
        const xt = exm[p.code + '|' + d];
        const k = sale && !sale.cleaner_key && !limpiaMGM(p.code) ? '' : sale ? `<button class="k ${sale.cleaner_key ? '' : 'vacio'}" data-asig="${sale.id}">${sale.cleaner_key === NA ? 'N/A' : esc(sale.cleaner_key || '+')}</button>` : xt ? `<button class="k ${xt.cleaner_key ? '' : 'vacio'}" data-extra="${xt.id}">${xt.cleaner_key === NA ? 'N/A' : esc(xt.cleaner_key || '+')}</button>` : '';
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
    .map(r => ({ id: 'r:' + r.id, dp: r.property_code, f: r.checkout, t: rate(r.property_code, k), b: dow(r.checkout) === 0 ? bono : 0 }))
    .concat(S.t.cleanings.filter(x => x.cleaner_key === k && x.date >= ini && x.date < fin).map(x => ({ id: 'x:' + x.id, dp: x.property_code, f: x.date, t: rate(x.property_code, k), b: dow(x.date) === 0 ? bono : 0, x: true })))
    .sort((a, b) => a.f.localeCompare(b.f));
  // Supervisión: si k supervisa a otras chicas, gana un monto por cada unidad que ellas limpian
  const SV = supConf()[k], quit = new Set(setting('sup_quitar', [])), pausas = setting('sup_pausas', []).filter(p => p.sup === k);
  const sup = !SV ? [] : SV.team.flatMap(c => limpiezasDe(c, ini, fin).map(x => ({ ...x, quien: c, m: Number(SV.monto) || 0,
    off: quit.has(x.id) ? 'quitada' : pausas.some(p => p.from <= x.f && x.f <= p.to) ? 'pausa' : '' }))).sort((a, b) => a.f.localeCompare(b.f));
  const supTot = sup.filter(x => !x.off).reduce((s, x) => s + x.m, 0);
  const extras = S.t.payroll_extras.filter(x => x.cleaner_key === k && x.week_start === ini);
  const pagos = S.t.payroll_payments.filter(x => x.cleaner_key === k && x.week_start === ini).sort((a, b) => a.date.localeCompare(b.date));
  const total = det.reduce((s, x) => s + (x.t || 0) + x.b, 0) + extras.reduce((s, x) => s + Number(x.amount), 0) + supTot;
  const pagado = pagos.reduce((s, x) => s + Number(x.amount), 0);
  return { det, extras, pagos, total, pagado, saldo: total - pagado, sup, supTot };
}
const supConf = () => setting('supervision', { R: { team: ['F', 'K', 'G', 'A'], monto: 30 } }) || {};
const supervisorDe = c => Object.keys(supConf()).find(k => (supConf()[k].team || []).includes(c));
function limpiezasDe(c, ini, fin) {
  return activas().filter(r => r.cleaner_key === c && r.checkout >= ini && r.checkout < fin).map(r => ({ id: 'r:' + r.id, dp: r.property_code, f: r.checkout }))
    .concat(S.t.cleanings.filter(x => x.cleaner_key === c && x.date >= ini && x.date < fin).map(x => ({ id: 'x:' + x.id, dp: x.property_code, f: x.date, x: true })));
}
function textoNomina(k, ini) {
  const N = nominaDe(k, ini);
  let t = `*Nómina ${nombre(k)}*\nSemana ${fmt(ini)} – ${fmt(add(ini, 6))}\n\n`;
  t += N.det.length ? N.det.map(x => `• ${fmt(x.f)} · ${x.dp}${x.x ? ' (extra)' : ''} · ${x.t == null ? 'sin tarifa' : money(x.t)}${x.b ? ` + ${money(x.b)} domingo` : ''}`).join('\n') : '• Sin limpiezas';
  if (N.sup.length) { const ok = N.sup.filter(x => !x.off); t += `\n\nSupervisión (${ok.length} × ${money(ok[0] ? ok[0].m : 0)}):\n` + ok.map(x => `• ${fmt(x.f)} · ${x.dp} (${nombre(x.quien)})`).join('\n') + `\nSubtotal supervisión: ${money(N.supTot)}`; }
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
    if (N.sup.length) { const ok = N.sup.filter(x => !x.off).length;
      h += `<details style="margin-top:6px"><summary class="sub" style="display:flex"><span class="sp">Supervisión · ${ok} de ${N.sup.length} unidades</span><b>${money(N.supTot)}</b></summary><table>${N.sup.map(x => `<tr style="${x.off ? 'opacity:.45' : ''}"><td>${fmt(x.f)}</td><td class="dp">${esc(x.dp)} <span class="m">${esc(nombre(x.quien))}</span></td><td class="r">${x.off === 'pausa' ? '<span class="m">pausa</span>' : money(x.off ? 0 : x.m)}</td><td class="x">${x.off === 'pausa' ? '' : `<button class="xs" data-supq="${x.id}">${x.off ? 'Devolver' : 'Quitar'}</button>`}</td></tr>`).join('')}</table></details>`; }
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
VIEWS.menu = () => `<div class="menu">${MENU.filter(m => !['pnl', 'servicios', 'usuarios'].includes(m[0]) || isSuper()).map(([k, t, s]) => `<button class="card tap" data-go="${k}"><div class="dp">${t}</div><div class="m">${s}</div></button>`).join('')}</div><div class="menu-foot"><img class="l" src="img/logo-white.png" alt="MGM Housing Management"><img class="s" src="img/skyline.svg" alt=""></div>`;

// ---------- CAJONES QALINA ----------
VIEWS.cajones = () => {
  const d = S.dia;
  let h = `<div class="nav"><button data-dn="-1">‹</button><div class="d">${fmt(d)} · noche</div><button data-dn="1">›</button><button data-dn="0">Hoy</button></div>`;
  const occ = ocupadas(d), by = {}; occ.forEach(r => { by[r.property_code] = r; });
  const qal = props().filter(p => p.building === 'Qalina');
  const nec = qal.filter(p => by[p.code] && by[p.code].has_car === true && !p.has_parking).map(p => by[p.code]);
  const usados = new Set([...occ.map(r => r.parking_from).filter(Boolean), ...(S.t.parking_loans || []).filter(x => x.date_from <= d && d < x.date_to).map(x => x.cajon)]);
  const libres = [...qal, ...cajonesSueltos()].filter(p => p.has_parking && p.lends_parking && !(by[p.code] && by[p.code].has_car === true) && !usados.has(p.code)).map(p => p.code);
  const faltan = nec.filter(r => !r.parking_from).length;
  const cf = S.cajF || '', K = (k, v, l, x = '') => `<button class="kpi ${x} ${cf === k ? 'sel' : ''}" data-cajf="${k}"><div class="v">${v}</div><div class="l">${l} ›</div></button>`;
  h += `<div class="kpis">${K('nec', nec.length, 'Necesitan prestado')}${K('libres', libres.length, 'Cajones libres')}${K('faltan', faltan, 'Por asignar', faltan ? 'alert' : '')}</div>`;
  if (cf) h += `<div class="row" style="margin-bottom:8px"><span class="m sp">Mostrando: <b>${{ nec: 'necesitan cajón prestado', libres: 'cajones libres', faltan: 'por asignar' }[cf]}</b></span><button data-cajf="">Ver todo</button></div>`;
  if (faltan > libres.length) h += `<div class="err">Faltan ${faltan - libres.length} cajón(es) esta noche.</div>`;
  const libresH = `<h2>Libres para prestar</h2><div class="card">${libres.length ? libres.map(k => `<span class="b n" style="margin:2px">${esc(k)} · S${prop(k).parking_level ?? '?'}</span>`).join(' ') : '<span class="m">Ninguno</span>'}</div>`;
  if (cf === 'libres') return h + libresH;
  h += cf ? '' : '<h2>Ocupados esta noche</h2>';
  const occQ = qal.filter(p => by[p.code] && (cf === 'nec' ? by[p.code].has_car === true && !p.has_parking : cf === 'faltan' ? by[p.code].has_car === true && !p.has_parking && !by[p.code].parking_from : true));
  if (cf && !occQ.length) h += '<div class="card empty">Ninguno.</div>';
  if (!cf && !occQ.length) h += '<div class="card empty">Ningún depa de Qalina ocupado.</div>';
  for (const p of occQ) {
    const r = by[p.code], pr = occ.find(x => x.parking_from === p.code);
    h += `<div class="card"><div class="row"><span class="dp">${esc(p.code)}</span><span>${esc(r.guest)}</span><span class="sp"></span><span class="m">${p.has_parking ? 'Cajón S' + (p.parking_level ?? '?') : 'Sin cajón'}</span></div>
      <div class="m">${fmt(r.checkin)} → ${fmt(r.checkout)}</div>${pr ? `<div class="m">Su cajón está <b>prestado a ${esc(pr.property_code)}</b> (${esc(pr.guest)})</div>` : ''}
      <div class="row" style="margin-top:8px"><span class="m">¿Trae auto?</span><div class="seg">${[['Sí', true], ['No', false]].map(([l, x]) => `<button data-car="${r.id}" data-v="${x ? 1 : 0}" class="${(r.has_car === true) === x ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${!p.has_parking && r.has_car === true ? `<span class="sp"></span><select data-caj="${r.id}"><option value="">Cajón de…</option>${[...new Set([...(r.parking_from ? [r.parking_from] : []), ...libres])].map(o => `<option ${r.parking_from === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : ''}</div></div>`;
  }
  if (cf) return h;
  h += libresH;
  const prestables = [...qal, ...cajonesSueltos()].filter(p => p.has_parking && p.lends_parking);
  const aps = (S.t.parking_loans || []).filter(x => x.date_to > today()).sort((a, b) => a.date_from.localeCompare(b.date_from));
  if (S.falta && S.falta.has('parking_loans')) h += `<h2>Apartados a externos</h2><div class="card m">Se activa en unos minutos (falta crear la tabla en la base de datos).</div>`;
  else h += `<h2>Apartados a externos</h2><div class="card"><div class="m" style="margin-bottom:6px">Cajones que prestamos a alguien sin reserva. Mientras estén apartados no aparecen como libres.</div>
    <div class="row" style="flex-wrap:wrap;gap:6px"><select id="apC">${prestables.map(p => `<option value="${esc(p.code)}">${esc(p.code)} · S${p.parking_level ?? '?'}</option>`).join('')}</select><input id="apN" placeholder="Nombre de quién" style="flex:1;min-width:140px"></div>
    <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px"><label class="m">Desde <input type="date" id="apD" value="${d}"></label><label class="m">Hasta <input type="date" id="apH" value="${add(d, 1)}"></label><span class="sp"></span><button class="pri" data-apadd="1">Apartar</button></div>
    <div class="list" style="margin-top:8px">${aps.length ? aps.map(x => `<div class="it"><div class="sp"><b>${esc(x.cajon)}</b> · ${esc(x.name)}<div class="m">${fmt(x.date_from)} → ${fmt(x.date_to)}</div></div><button data-apdel="${x.id}">Quitar</button></div>`).join('') : '<div class="m">Ninguno.</div>'}</div></div>`;
  const mes = d.slice(0, 7), ini = mes + '-01', fin = ymd(new Date(+mes.slice(0, 4), +mes.slice(5), 1));
  const t = {}; activas().forEach(r => { if (!r.parking_from) return; let n = 0; for (let x = r.checkin; x < r.checkout; x = add(x, 1)) if (x >= ini && x < fin) n++; if (n) t[r.parking_from] = (t[r.parking_from] || 0) + n; });
  const ks = Object.keys(t).sort(), renta = Number(setting('renta_cajon', 500));
  h += `<h2>Cajones prestados · ${fmtMes(mes)}</h2><div class="card">${ks.length ? `<table><tr><th>Cajón de</th><th class="r">Noches</th><th class="r">Renta</th></tr>${ks.map(k => `<tr><td class="dp">${esc(k)}</td><td class="r">${t[k]}</td><td class="r">${money(renta)}</td></tr>`).join('')}<tr><th>Total</th><th></th><th class="r">${money(ks.length * renta)}</th></tr></table>` : '<span class="m">Sin préstamos este mes.</span>'}</div>`;
  // Historial de préstamos (reservas con cajón prestado + apartados a externos)
  const hm = S.cajMes || mes, hi = hm + '-01', hf = ymd(new Date(+hm.slice(0, 4), +hm.slice(5), 1));
  const noches = (a, b) => { let n = 0; for (let x = a; x < b; x = add(x, 1)) if (x >= hi && x < hf) n++; return n; };
  const H = [
    ...activas().filter(r => r.parking_from && r.checkin < hf && hi < r.checkout).map(r => ({ cajon: r.parking_from, quien: r.property_code + ' · ' + r.guest, tipo: 'Reserva', grupo: r.property_code, a: r.checkin, b: r.checkout })),
    ...(S.t.parking_loans || []).filter(x => x.date_from < hf && hi < x.date_to).map(x => ({ cajon: x.cajon, quien: x.name, tipo: 'Externo', grupo: x.name, a: x.date_from, b: x.date_to }))
  ].map(x => ({ ...x, n: noches(x.a, x.b) })).sort((a, b) => a.a.localeCompare(b.a));
  const G = {}; H.forEach(x => { const g = G[x.grupo] = G[x.grupo] || { tipo: x.tipo, veces: 0, n: 0 }; g.veces++; g.n += x.n; });
  const gk = Object.keys(G).sort((a, b) => G[b].n - G[a].n);
  h += `<h2>Historial de préstamos</h2><div class="nav"><button data-cajmes="-1">‹</button><div class="d">${fmtMes(hm)}</div><button data-cajmes="1">›</button></div>`;
  h += `<div class="card"><div class="m" style="margin-bottom:6px"><b>Quién pide más</b> · ${H.length} préstamo(s), ${H.reduce((t, x) => t + x.n, 0)} noches</div>${gk.length ? `<table><tr><th>Quién</th><th>Tipo</th><th class="r">Veces</th><th class="r">Noches</th></tr>${gk.map(k => `<tr><td class="dp">${esc(k)}</td><td>${G[k].tipo}</td><td class="r">${G[k].veces}</td><td class="r">${G[k].n}</td></tr>`).join('')}</table>` : '<span class="m">Sin préstamos este mes.</span>'}</div>`;
  const G2 = {}; H.forEach(x => { const g = G2[x.cajon] = G2[x.cajon] || { veces: 0, n: 0 }; g.veces++; g.n += x.n; });
  const gk2 = Object.keys(G2).sort((a, b) => G2[b].n - G2[a].n);
  h += `<div class="card"><div class="m" style="margin-bottom:6px"><b>Quién presta más</b> · cajones de ${gk2.length} depa(s)</div>${gk2.length ? `<table><tr><th>Cajón de</th><th>Sótano</th><th class="r">Veces</th><th class="r">Noches</th></tr>${gk2.map(k => `<tr><td class="dp">${esc(k)}</td><td>S${(prop(k) || {}).parking_level ?? '?'}</td><td class="r">${G2[k].veces}</td><td class="r">${G2[k].n}</td></tr>`).join('')}</table>` : '<span class="m">Sin préstamos este mes.</span>'}</div>`;
  return h;
};

// ---------- LIMPIEZAS ----------
VIEWS.limpiezas = () => {
  const cs = cleaners();
  let h = '';
  h += `<h2 style="margin-top:0">Descansos</h2><div class="card"><div class="row"><input type="date" id="offDate" value="${today()}"><select id="offK">${cs.map(c => `<option value="${c.key}">${esc(c.name)}</option>`).join('')}</select><button class="pri" data-addoff="1">Agregar</button></div>
    <div class="list">${S.t.days_off.filter(o => o.date >= today()).sort((a, b) => a.date.localeCompare(b.date)).map(o => `<div class="it"><div class="sp">${fmt(o.date)} · ${esc(nombre(o.cleaner_key))}</div><button data-deloff="${o.date}|${o.cleaner_key}">Quitar</button></div>`).join('')}</div></div>`;
  const C = supConf(), hoy = today();
  h += `<h2>Supervisión de limpieza</h2>`;
  for (const k of Object.keys(C)) {
    const P = setting('sup_pausas', []).filter(p => p.sup === k && p.to >= hoy).sort((a, b) => a.from.localeCompare(b.from));
    h += `<div class="card"><div class="row"><b style="font-size:16px">${esc(nombre(k))}</b><span class="m">supervisora</span><span class="sp"></span><span class="m">$ por unidad</span><input type="number" inputmode="numeric" style="width:70px" data-supmonto="${k}" value="${Number(C[k].monto) || 0}"></div>
      <div class="m" style="margin-top:8px">Le reportan:</div><div class="chips" style="margin-top:4px">${cs.filter(c => c.key !== k).map(c => `<label class="chip ${C[k].team.includes(c.key) ? 'on' : ''}"><input type="checkbox" hidden data-supteam="${k}|${c.key}" ${C[k].team.includes(c.key) ? 'checked' : ''}>${esc(c.name)}</label>`).join('')}</div>
      <div class="m" style="margin-top:10px">Pausas (vacaciones o días que no supervisa): no cobra supervisión esos días.</div>
      <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:4px"><label class="m">Desde <input type="date" id="spD-${k}" value="${hoy}"></label><label class="m">Hasta <input type="date" id="spH-${k}" value="${hoy}"></label><button data-suppadd="${k}">Agregar pausa</button></div>
      ${P.length ? `<div class="list" style="margin-top:6px">${P.map(p => `<div class="it"><div class="sp">${fmt(p.from)} → ${fmt(p.to)}</div><button data-suppdel="${p.id}">Quitar</button></div>`).join('')}</div>` : ''}
      <div class="m" style="margin-top:10px">Para quitarle una unidad en particular: Nómina → ${esc(nombre(k))} → Supervisión → Quitar.</div>
      <div class="row" style="margin-top:8px"><span class="sp"></span><button data-supset="${k}|del">Ya no es supervisora</button></div></div>`;
  }
  const libresSup = cs.filter(c => !C[c.key]);
  h += `<div class="card row"><span class="m sp">Agregar supervisora</span><select data-supnew="1"><option value="">Elegir…</option>${libresSup.map(c => `<option value="${c.key}">${esc(c.name)}</option>`).join('')}</select></div>`;
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
      t && t.service_payment_id && { type: 'note', html: 'Este gasto viene de Pagos de servicios; lo ideal es corregirlo ahí para que ambos coincidan.' },
      !t && kind === 'gasto' && Object.values(SERV_CAT).includes(v.category) && v.property_code && S.t.transactions.some(x => x.service_payment_id && x.property_code === v.property_code && x.category === v.category && (x.date || '').slice(0, 7) === (v.date || '').slice(0, 7)) && { type: 'note', cls: 'warn', html: `Ya hay un pago de ${esc(v.category)} de este depa en este mes, capturado en Pagos de servicios. Revisa que no sea el mismo.` },
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
  const abiertos = S.t.tasks.filter(t => t.status !== 'terminado');
  h += `<div class="row prio-f"><span class="m">Prioridad</span>${['alta', 'media', 'baja'].map(k => `<button class="pf ${f.prio === k ? 'on' : ''}" data-tprio="${k}" title="${PR[k]}"><i class="dot ${k}"></i>${abiertos.filter(t => t.priority === k).length}</button>`).join('')}${f.prio ? '<button class="pf" data-tprio="">Todas</button>' : ''}</div>`;
  h += `<div class="row filt">${fsel('task', 'depa', depaOpts('Todos los depas'))}${fsel('task', 'status', [['', 'Todo estatus'], ...Object.entries(ST)])}${fsel('task', 'resp', [['', 'Todo responsable'], ...resps])}${fsel('task', 'sort', [['prio', 'Orden: prioridad'], ['date', 'Orden: fecha'], ['depa', 'Orden: depa']])}</div>`;
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
// ---------- Claves → imagen para WhatsApp ----------
const lugarCorto = pl => pl === 'Bodega Qalina' ? 'Bodega' : pl === 'Caja fuerte Qalina' ? 'Caja fuerte' : pl.replace(/^Q-/, 'Q');
function clavesConCodigo() { return [...EXTRA_PLACES, ...props().map(p => p.code)].map(pl => ({ pl, c: S.t.access_codes.find(x => x.place === pl) || {} })).filter(x => x.c.code1 || x.c.code2); }
function sheetWA() {
  const L = clavesConCodigo();
  if (!S.waSel) S.waSel = new Set(L.filter(x => x.pl === 'Bodega Qalina' || (prop(x.pl) || {}).building === 'Qalina').map(x => x.pl));
  S.waTit = S.waTit || 'CONTRASEÑAS DEPARTAMENTOS'; S.waPie = S.waPie || '¡Gracias por tu gran trabajo diario!';
  sheet(`<h3>Imagen de claves para WhatsApp</h3>
    <div class="row" style="gap:6px;flex-wrap:wrap"><button data-wa="todos">Todos</button><button data-wa="qalina">Solo Qalina</button><button data-wa="ninguno">Ninguno</button><span class="sp"></span><span class="m">${S.waSel.size} seleccionados</span></div>
    <div class="chips" style="margin:10px 0">${L.map(x => `<button class="chip ${S.waSel.has(x.pl) ? 'on' : ''}" data-wapl="${esc(x.pl)}">${esc(lugarCorto(x.pl))}</button>`).join('')}</div>
    <label class="fl"><span>Título</span><input id="waTit" value="${esc(S.waTit)}"></label>
    <label class="fl"><span>Mensaje al pie</span><input id="waPie" value="${esc(S.waPie)}"></label>
    <div id="waOut" style="margin-top:10px"></div>
    <div class="row" style="margin-top:12px"><button data-close="1">Cerrar</button><span class="sp"></span><button class="pri" data-wagen="1">Crear imagen</button></div>`);
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function estrella(g, x, y, r, col) { g.save(); g.fillStyle = col; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr2 = i % 2 ? r * .38 : r; g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } g.closePath(); g.fill(); g.restore(); }
function huella(g, x, y, s) { g.save(); g.fillStyle = '#2b3a4a'; g.beginPath(); g.ellipse(x, y + s * .35, s * .42, s * .34, 0, 0, 7); g.fill(); [[-.42, -.12], [-.15, -.42], [.15, -.42], [.42, -.12]].forEach(([dx, dy]) => { g.beginPath(); g.arc(x + dx * s, y + dy * s, s * .16, 0, 7); g.fill(); }); g.restore(); }
function llave(g, x, y, col) { g.save(); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 6; g.beginPath(); g.arc(x + 14, y, 11, 0, 7); g.stroke(); g.beginPath(); g.moveTo(x + 25, y); g.lineTo(x + 58, y); g.stroke(); g.fillRect(x + 46, y, 6, 12); g.fillRect(x + 54, y, 5, 9); g.restore(); }
function puerta(g, x, y) { g.save(); g.strokeStyle = '#7d6a4f'; g.lineWidth = 3; rr(g, x, y, 34, 50, 4); g.stroke(); g.fillStyle = '#7d6a4f'; g.beginPath(); g.arc(x + 26, y + 27, 3, 0, 7); g.fill(); g.restore(); }
async function crearImagenWA() {
  const items = clavesConCodigo().filter(x => S.waSel.has(x.pl)); if (!items.length) return toast('Selecciona al menos un lugar');
  await (document.fonts && document.fonts.ready);
  const W = 1080, cols = 2, filas = Math.ceil(items.length / cols), RH = 112, top = 250, H = top + filas * RH + 190;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  // fondo
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#cfe9fb'); bg.addColorStop(1, '#a9d4f3'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.globalAlpha = .35; for (let i = 0; i < 18; i++) { g.fillStyle = '#ffffff'; g.beginPath(); g.arc((i * 197) % W, (i * 331) % H, 10 + (i * 7) % 26, 0, 7); g.fill(); } g.globalAlpha = 1;
  g.fillStyle = 'rgba(255,255,255,.55)'; rr(g, 30, 30, W - 60, H - 60, 36); g.fill();
  // título
  g.fillStyle = '#1f2d3d'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let fs = 64; g.font = `800 ${fs}px Outfit, Arial, sans-serif`; while (g.measureText(S.waTit).width > W - 200 && fs > 30) { fs -= 2; g.font = `800 ${fs}px Outfit, Arial, sans-serif`; }
  g.fillText(S.waTit, W / 2, 130);
  [[95, 90, 22, '#f5c542'], [W - 100, 85, 26, '#f5c542'], [160, 175, 14, '#f5c542'], [W - 170, 185, 16, '#f5c542'], [W / 2 - 330, 70, 12, '#ffffff'], [W / 2 + 330, 66, 12, '#ffffff']].forEach(a => estrella(g, ...a));
  // filas (llenado por columna, como el formato)
  const cw = (W - 150) / 2, porCol = filas;
  items.forEach((it, i) => {
    const c = Math.floor(i / porCol), r = i % porCol, x = 60 + c * (cw + 30), y = top + r * RH;
    const azul = (r + c) % 3 !== 1;
    g.fillStyle = azul ? '#bfe1f7' : '#fde3a0'; g.strokeStyle = azul ? '#7fb8e0' : '#e9bf55'; g.lineWidth = 3; rr(g, x, y, cw, RH - 22, 22); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.7)'; rr(g, x + 14, y + 14, 80, RH - 50, 14); g.fill();
    llave(g, x + 22, y + (RH - 22) / 2, azul ? '#3c7fc0' : '#c9962a');
    const txt = '• ' + lugarCorto(it.pl) + ': ' + [it.c.code1, it.c.code2].filter(Boolean).join(' / ');
    let f2 = 40; g.font = `700 ${f2}px Outfit, Arial, sans-serif`; while (g.measureText(txt).width > cw - 170 && f2 > 22) { f2 -= 1; g.font = `700 ${f2}px Outfit, Arial, sans-serif`; }
    g.fillStyle = '#16202b'; g.textAlign = 'left'; g.fillText(txt, x + 108, y + (RH - 22) / 2 + 2);
    if (i % 3 === 0 && 108 + g.measureText(txt).width < cw - 70) puerta(g, x + cw - 50, y + 20);
  });
  // huellas
  [[48, top + 40], [W - 48, top + RH * 2], [48, top + RH * 4], [W - 48, top + RH * 6], [48, top + RH * 7.5]].forEach(([x, y]) => y < H - 200 && huella(g, x, y, 22));
  // pie
  const fy = top + filas * RH + 30; g.fillStyle = '#ffffff'; g.strokeStyle = '#7fb8e0'; g.lineWidth = 3; rr(g, 90, fy, W - 180, 96, 48); g.fill(); g.stroke();
  g.textAlign = 'center'; g.fillStyle = '#1f2d3d'; let f3 = 40; g.font = `700 ${f3}px Outfit, Arial, sans-serif`; while (g.measureText(S.waPie).width > W - 260 && f3 > 22) { f3 -= 1; g.font = `700 ${f3}px Outfit, Arial, sans-serif`; }
  g.fillText(S.waPie, W / 2, fy + 49); estrella(g, 130, fy + 48, 16, '#f5c542'); estrella(g, W - 130, fy + 48, 16, '#f5c542');
  const blob = await new Promise(r => cv.toBlob(r, 'image/png')); S.waBlob = blob;
  const url = URL.createObjectURL(blob);
  $('waOut').innerHTML = `<img src="${url}" style="width:100%;border-radius:12px;border:1px solid var(--line)"><div class="row" style="margin-top:8px;gap:8px"><button class="pri sp" data-washare="1">Compartir en WhatsApp</button><button data-wadl="1">Descargar</button></div>`;
}
async function compartirWA() {
  const f = new File([S.waBlob], 'claves.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: S.waTit }); } catch (_) {} }
  else saveFile(S.waBlob, 'claves.png');
}
VIEWS.claves = () => {
  const places = [...props().map(p => p.code), ...EXTRA_PLACES];
  return `<div class="row" style="margin-bottom:8px"><button class="pri sp" data-waopen="1">📲 Imagen de claves para WhatsApp</button></div><div class="m" style="margin-bottom:8px">Se guardan al salir de cada campo.</div><div class="card scroll"><table><tr><th>Lugar</th><th>Clave 1</th><th>Clave 2</th></tr>${places.map(pl => { const c = S.t.access_codes.find(x => x.place === pl) || {};
    return `<tr><td class="dp">${esc(pl)}</td><td><input class="code" data-code="${esc(pl)}|code1" value="${esc(c.code1 || '')}" autocomplete="off"></td><td><input class="code" data-code="${esc(pl)}|code2" value="${esc(c.code2 || '')}" autocomplete="off"></td></tr>`; }).join('')}</table></div>`;
};
// ---------- P&L (Beta): análisis + cuestionario para María (solo superadmin) ----------
const PNLQ = [
  ['Decisiones clave', [
    { id: 'ingreso', q: '¿En qué mes cuenta el ingreso de una reserva?', help: 'Hoy el Excel usa la fecha en que Airbnb paga. Lo estándar en STR es contar las noches ocupadas dentro de cada mes.', opts: ['Por fecha de payout (como hoy)', 'Por noches ocupadas en el mes (estándar)', 'No estoy segura, explícame'] },
    { id: 'imp8', q: '¿Qué es el 8% que se descuenta para llegar a la Utilidad Neta?', help: 'En el P&L de Q-104 se aplica desde junio: Utilidad neta = Utilidad antes de impuestos − 8%.', opts: ['ISR del dueño', 'Otro concepto (explícalo abajo)', 'No sé'], ask: '¿Aplica igual en todos los depas?' },
    { id: 'gestion', q: '¿Qué % de gestión administrativa cobra MGM?', help: 'En Q-104 es 15% sobre ingresos por reservas.', opts: ['15% en todos los depas', 'Varía por depa (anota cuál abajo)'] },
    { id: 'envio', q: '¿Cómo se entrega el PDF a cada dueño?', opts: ['María lo revisa y lo manda', 'Se envía solo a cada dueño', 'Se envía solo, con copia a María'] }
  ]],
  ['Datos de Airbnb', [
    { id: 'correos', q: '¿Ya reenvías los correos de Airbnb a la app?', help: 'Confirmaciones, cambios y cancelaciones. De ahí la app toma el huésped y lo que ganas en cada reserva; hoy casi no hay ingresos registrados.', opts: ['Sí, con regla automática en Gmail (todos los depas)', 'Sí, a mano', 'Solo algunos depas o anuncios', 'Todavía no'], ask: '¿Desde qué cuenta, a cuál y desde qué fecha?' },
    { id: 'captura', q: '¿Cómo prefieres cargar los pagos de Airbnb?', help: 'Por reserva se necesita: código HM…, monto bruto, limpieza cobrada, comisión Airbnb, impuestos liquidados, retención ISR, retención IVA, payout neto y fecha de payout.', opts: ['Subir cada mes el CSV de transacciones de Airbnb (recomendado)', 'Captura manual por reserva', 'Las dos'] },
    { id: 'ocup', q: '¿De dónde sale el % de ocupación?', help: 'Ojo: junio dice 96% (Airbnb) pero calculado desde reservas da 57%.', opts: ['Calculado desde las reservas de la app', 'Dato de Airbnb capturado a mano'] },
    { id: 'tarifa', q: '¿De dónde sale la tarifa promedio por noche?', opts: ['Calculada: ingreso ÷ noches', 'Dato de Airbnb capturado a mano'] },
    { id: 'resenas', q: '¿Cómo armamos la Evaluación de desempeño?', opts: ['Estrellas por reserva capturadas en la app', 'Subir las capturas de Airbnb del mes', 'Las dos', 'No incluirla'] }
  ]],
  ['Cobros al dueño', [
    { id: 'limpieza', q: 'Limpieza: ¿cuánto se le cobra al dueño por cada salida?', help: 'Q-104 octubre: 6 limpiezas × $500 = $3,000.', opts: ['Mismo monto en todos los depas', 'Varía por depa (anota abajo)'] },
    { id: 'lavanderia', q: 'Lavandería: ¿cómo se cobra?', help: 'Q-104: $200 por limpieza de junio a septiembre y $100 en octubre.', opts: ['Monto fijo por limpieza', 'Lo que se pague real en el mes', 'Varía por depa'] },
    { id: 'otros', q: 'Otros ingresos (ej. renta de estacionamiento $580): ¿qué depas los tienen y son fijos cada mes?', text: true },
    { id: 'liquida', q: '¿Registramos la transferencia de la utilidad al dueño (monto, fecha, referencia)?', opts: ['Sí, como estado de cuenta', 'No es necesario'] },
    { id: 'recurrentes', q: '¿Qué gastos son fijos cada mes por depa (internet, gas, etc.)?', text: true }
  ]],
  ['Dueños', [
    { id: 'duenos', q: 'Anota por depa: dueño y correo (un depa por línea).', help: 'Ej.: Q-104 – Nombre del dueño – correo@dominio.com', text: true, rows: 6 }
  ]],
  ['Cortes por correo', [
    { id: 'semanal', q: 'Corte semanal para ti: ¿cuándo te llega?', opts: ['Lunes 8:00 am', 'Domingo 8:00 pm', 'Otro (anota abajo)'], ask: '¿Qué quieres ver en el corte semanal?' },
    { id: 'mensual', q: 'Corte mensual del portafolio: ¿qué día?', opts: ['Día 1', 'Día 3 (da tiempo de capturar gastos)', 'Día 5', 'Otro'] }
  ]],
  ['Elementos sugeridos (estándar STR)', [
    { id: 'extras', q: 'Marca los que quieres en el reporte al dueño:', multi: ['RevPAR (ingreso por noche disponible)', 'Estancia promedio', 'Anticipación de reserva', 'Costo de limpieza por salida', 'Comparativo vs mes anterior', 'Comparativo vs mismo mes año anterior', 'Reservas confirmadas del mes siguiente', 'Calificación promedio', 'Estado de cuenta / liquidación', 'Canal de reserva (Airbnb, directo…)'] }
  ]]
];
const PNL_HALLAZGOS = [
  'El total de gastos no cuadra en el PDF: arriba $40,527 y abajo $40,498. La diferencia ($29) es "Gastos por inversión", que suma al total pero su sección no aparece.',
  'La fila "Mantenimiento AA" de enero suma la categoría "Pintura".',
  '"Otro" se suma dos veces: en Limpieza y en Mantenimiento.',
  'En la gráfica "Días libres vs rentados" las etiquetas están invertidas (junio: 17 libres / 13 rentados con 57% de ocupación) y el total da −58.',
  'La ocupación de Airbnb (96% junio) no coincide con la calculada desde reservas (57%).'
];
const pnlRow = () => S.t.pnl_beta.find(r => r.id === 'respuestas') || { id: 'respuestas', data: {} };
const pnlPreg = () => S.t.pnl_beta.filter(r => r.id !== 'respuestas').sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
function pnlSet(k, v) { const r = pnlRow(); return ups('pnl_beta', { id: 'respuestas', data: { ...r.data, [k]: v }, updated_by: S.email, updated_at: new Date().toISOString() }, ['id'], 'Respuesta guardada'); }
VIEWS.pnl = () => {
  if (!isSuper()) return '<div class="empty">Solo María y Paco.</div>';
  const A = pnlRow().data || {}, all = PNLQ.flatMap(s => s[1]);
  const hechas = all.filter(q => q.multi ? (A[q.id] || []).length : A[q.id]).length;
  let h = `<div class="card" style="border-left:4px solid var(--copper,#b0703c)"><div class="row"><b class="sp">P&L (Beta)</b><span class="b">${hechas}/${all.length} respondidas</span></div>
    <div class="m" style="margin-top:6px">Estudié el P&L de Q-104 (octubre). Antes de construir el módulo necesito tus respuestas. Se guardan solas; cuando termines, avísale a Paco para que yo las revise y te haga más preguntas o arme la primera versión.</div>
    <div class="m" style="margin-top:6px">Lo que vamos a construir: <b>1)</b> consulta diaria del P&L por depa y del portafolio, <b>2)</b> corte semanal por correo para ti, <b>3)</b> corte mensual del portafolio y <b>4)</b> un PDF por depa para el dueño, con el look de las propuestas MGM, conservando todo lo que tiene hoy el reporte.</div>
    ${A.updated_by ? '' : ''}</div>`;
  h += `<details class="card"><summary><b>Lo que ya tiene la app y lo que falta</b></summary>
    <div class="m" style="margin-top:8px"><b>Ya lo tenemos:</b> reservas (depa, huésped, fechas, noches), bloqueos N/A, gastos con categoría y fotos, ingresos, limpiezas hechas por depa. Con eso salen solos: ocupación, noches promedio, días libres vs rentados y comprobantes.</div>
    <div class="m" style="margin-top:6px"><b>Falta capturar:</b> datos de pago de Airbnb por reserva, % de gestión e impuesto por depa, dueño y correo, tarifas de limpieza y lavandería al dueño, ajustes y reembolsos negativos, categoría "Muebles", grupo para "Otro", calificaciones, gastos recurrentes y liquidación al dueño.</div></details>`;
  h += `<details class="card"><summary><b>Errores que encontré en el Excel actual (${PNL_HALLAZGOS.length})</b></summary>${PNL_HALLAZGOS.map(x => `<div class="m" style="margin-top:6px">• ${esc(x)}</div>`).join('')}</details>`;
  for (const [sec, qs] of PNLQ) {
    h += `<h2>${esc(sec)}</h2>`;
    for (const q of qs) {
      const v = A[q.id];
      h += `<div class="card"><div class="dp" style="font-size:15px">${esc(q.q)}</div>${q.help ? `<div class="m" style="margin-top:4px">${esc(q.help)}</div>` : ''}`;
      if (q.opts) h += `<div class="chips" style="margin-top:8px">${q.opts.map(o => `<label class="chip ${v === o ? 'on' : ''}"><input type="radio" name="pq-${q.id}" data-pq="${q.id}" value="${esc(o)}" ${v === o ? 'checked' : ''} hidden>${esc(o)}</label>`).join('')}</div>`;
      if (q.multi) { const sel = v || []; h += `<div class="chips" style="margin-top:8px">${q.multi.map(o => `<label class="chip ${sel.includes(o) ? 'on' : ''}"><input type="checkbox" data-pqm="${q.id}" value="${esc(o)}" ${sel.includes(o) ? 'checked' : ''} hidden>${esc(o)}</label>`).join('')}</div>`; }
      if (q.text) h += `<textarea style="width:100%;margin-top:8px" rows="${q.rows || 3}" data-pqt="${q.id}" placeholder="Escribe aquí…">${esc(v || '')}</textarea>`;
      else h += `<textarea style="width:100%;margin-top:8px" rows="2" data-pqt="${q.id}_c" placeholder="${esc(q.ask || 'Comentario (opcional)')}">${esc(A[q.id + '_c'] || '')}</textarea>`;
      h += `</div>`;
    }
  }
  h += `<h2>Tus preguntas para Claude</h2><div class="card"><textarea id="pnlQ" style="width:100%" rows="3" placeholder="¿Algo no está claro o quieres agregar algo al reporte? Escríbelo aquí."></textarea><div class="row" style="margin-top:8px"><span class="sp"></span><button class="pri" data-pnlq="1">Agregar pregunta</button></div></div>`;
  h += pnlPreg().map(p => `<div class="card"><div class="m">${esc(p.updated_by || '')} · ${esc(fmt((p.updated_at || '').slice(0, 10)))}</div><div style="margin-top:4px;white-space:pre-wrap">${esc(p.data.texto)}</div>${p.data.respuesta ? `<div class="m" style="margin-top:8px;border-left:3px solid var(--acc);padding-left:8px;white-space:pre-wrap"><b>Respuesta:</b> ${esc(p.data.respuesta)}</div>` : '<div class="m" style="margin-top:6px">Pendiente de respuesta</div>'}<div class="row" style="margin-top:6px"><span class="sp"></span><button data-pnldel="${p.id}">Borrar</button></div></div>`).join('');
  return h;
};
// ---------- PAGOS DE SERVICIOS ----------
const SERV = [['luz', 'Luz (CFE)'], ['agua', 'Agua (SIAPA)'], ['gas', 'Gas'], ['internet', 'Internet'], ['mantenimiento', 'Mantenimiento']];
const SERV_CAT = { luz: 'Luz', agua: 'Agua', gas: 'Gas', internet: 'Internet', mantenimiento: 'Mantenimiento del edificio' };
const SERV_ST = [['pagado', 'Pagado'], ['pendiente', 'Pendiente de pago'], ['na', 'N/A (no aplica / sin cargo)'], ['saldo_favor', 'Saldo a favor']];
const MES3 = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const sAcc = () => (S.t.service_accounts || []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.label.localeCompare(b.label));
const sPay = (acc, per) => (S.t.service_payments || []).find(p => p.account_id === acc && p.period === per);
// Liga con Gastos e ingresos (y por lo tanto con el P&L): solo cuentas que paga María (to_pnl) y pagos "pagado".
// Una cuenta puede ir a un depa o dividirse (split: [{code, pct}], ej. Lighthouse 2005 = LHA 65% / LHB 35%).
const destinos = a => !a || !a.to_pnl ? [] : Array.isArray(a.split) && a.split.length ? a.split : a.property_code ? [{ code: a.property_code, pct: 100 }] : [];
function syncServicio(pay) {
  const a = sAcc().find(x => x.id === pay.account_id), T = pay.status === 'pagado' && Number(pay.amount) > 0 ? destinos(a) : [];
  const ligadas = S.t.transactions.filter(t => t.service_payment_id === pay.id);
  ligadas.filter(t => !T.some(d => d.code === t.property_code)).forEach(t => del('transactions', { id: t.id }));
  for (const d of T) {
    const row = { kind: 'gasto', date: pay.paid_on || pay.period + '-01', property_code: d.code, category: SERV_CAT[a.service], category_other: null,
      description: 'Pago de servicio · ' + a.label + (d.pct < 100 ? ` (${d.pct}%)` : ''), amount: Math.round(Number(pay.amount) * d.pct) / 100, photos: pay.photos || [], service_payment_id: pay.id };
    const ya = ligadas.find(t => t.property_code === d.code);
    if (ya) upd('transactions', { id: ya.id }, row);
    else { // si Sandy ya lo capturó en Gastos (mismo depa, categoría y mes, sin ligar), se liga en vez de duplicar
      const suelto = S.t.transactions.find(t => !t.service_payment_id && t.kind === 'gasto' && t.property_code === d.code && t.category === row.category && (t.date || '').slice(0, 7) === row.date.slice(0, 7));
      if (suelto) upd('transactions', { id: suelto.id }, row); else ins('transactions', { id: uid(), ...row, checked: false, reservation_id: null });
    }
  }
}
VIEWS.servicios = () => {
  if (S.falta && (S.falta.has('service_accounts') || S.falta.has('service_payments'))) return '<div class="card m">El módulo se activa en cuanto Paco termine de crear las tablas y cargar el histórico del Excel.</div>';
  const F = S.f.serv || (S.f.serv = { s: 'luz', y: mesAnt().slice(0, 4), m: mesAnt().slice(5), q: '', solo: '' }), mesHoy = F.y + '-' + (F.m || mesAnt().slice(5));
  let h = `<div class="seg" style="margin-bottom:8px;overflow-x:auto;white-space:nowrap">${SERV.map(([k, l]) => `<button data-servs="${k}" class="${F.s === k ? 'on' : ''}">${l.split(' ')[0]}</button>`).join('')}</div>
    <div class="nav"><button data-servy="-1">‹</button><div class="d">${F.y}</div><button data-servy="1">›</button><select data-servm="1" style="flex:1">${MES3.map((m, i) => { const v = String(i + 1).padStart(2, '0'); return `<option value="${v}" ${mesHoy.slice(5) === v ? 'selected' : ''}>${['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][i]}</option>`; }).join('')}</select><button data-servx="1">Excel</button></div>
    <div class="row" style="gap:6px;margin-bottom:8px"><input id="servQ" placeholder="Buscar depa…" value="${esc(F.q)}" style="flex:1"><select data-f="serv|solo"><option value="">Todos</option><option value="mgm" ${F.solo === 'mgm' ? 'selected' : ''}>Los paga MGM</option><option value="falta" ${F.solo === 'falta' ? 'selected' : ''}>Sin registro en el mes</option><option value="pend" ${F.solo === 'pend' ? 'selected' : ''}>Con pendientes</option><option value="pagmes" ${F.solo === 'pagmes' ? 'selected' : ''}>Pagados en el mes</option><option value="paganio" ${F.solo === 'paganio' ? 'selected' : ''}>Con pagos en el año</option></select></div>
    <div class="row" style="gap:8px;margin-bottom:10px"><button class="pri sp" data-servpay="">＋ Registrar pago</button><button data-servacc="">＋ Cuenta</button><button data-servedit="1" class="${F.edit ? 'on pri' : ''}">${F.edit ? 'Listo' : 'Ocultar'}</button></div>`;
  const OC = new Set(setting('serv_ocultos', []));
  let A = sAcc().filter(a => a.service === F.s && a.active !== false);
  const nOc = A.filter(a => OC.has(a.id)).length;
  if (!F.edit) A = A.filter(a => !OC.has(a.id));
  if (F.q) A = A.filter(a => (a.label + ' ' + (a.property_code || '')).toLowerCase().includes(F.q.toLowerCase()));
  const esMgm = a => /^mar[ií]a/i.test(a.responsable || '');
  if (F.solo === 'mgm') A = A.filter(esMgm);
  if (F.solo === 'falta') A = A.filter(a => esMgm(a) && !sPay(a.id, mesHoy));
  if (F.solo === 'pend') A = A.filter(a => pendientesDe(a, F.y).length);
  if (F.solo === 'pagmes') A = A.filter(a => (sPay(a.id, mesHoy) || {}).status === 'pagado');
  if (F.solo === 'paganio') A = A.filter(a => (S.t.service_payments || []).some(p => p.account_id === a.id && p.period.startsWith(F.y) && p.status === 'pagado'));
  const pagMes = A.reduce((t, a) => { const p = sPay(a.id, mesHoy); return t + (p && p.status === 'pagado' ? Number(p.amount) || 0 : 0); }, 0);
  const pagAnio = A.reduce((t, a) => t + (S.t.service_payments || []).filter(p => p.account_id === a.id && p.period.startsWith(F.y) && p.status === 'pagado').reduce((s, p) => s + (Number(p.amount) || 0), 0), 0);
  const pend = A.reduce((t, a) => t + pendientesDe(a, F.y).length, 0);
  h += `<div class="kpis"><button class="kpi ${F.solo === 'pagmes' ? 'sel' : ''}" data-servk="pagmes"><div class="v">${money(Math.round(pagMes))}</div><div class="l">Pagado ${MES3[+mesHoy.slice(5) - 1].toLowerCase()} ›</div></button><button class="kpi ${F.solo === 'paganio' ? 'sel' : ''}" data-servk="paganio"><div class="v">${money(Math.round(pagAnio))}</div><div class="l">Pagado ${F.y} ›</div></button><button class="kpi ${pend ? 'alert' : ''} ${F.solo === 'pend' ? 'sel' : ''}" data-servpend="1"><div class="v">${pend}</div><div class="l">Pendientes ›</div></button></div>`;
  if (F.edit) h += `<div class="warn" style="margin-bottom:8px">Toca el ojo de cada depa para ocultarlo o mostrarlo en ${esc(SERV.find(x => x[0] === F.s)[1])}. Al terminar toca <b>Listo</b>.</div>`;
  else if (nOc) h += `<div class="row" style="margin-bottom:6px"><span class="m sp">${nOc} depa(s) oculto(s) en esta pestaña</span><button data-servedit="1">Ver / editar</button></div>`;
  if (!A.length) return h + '<div class="card empty">Sin cuentas.</div>';
  const per = m => `${F.y}-${String(m + 1).padStart(2, '0')}`;
  const cell = (a, m) => { const p = sPay(a.id, per(m)), pe = !p && pendientesDe(a, F.y).includes(per(m));
    if (pe) return `<td class="sv pendiente ${per(m) === mesHoy ? 'hoyc' : ''}" data-servpay="${a.id}|${per(m)}">—</td>`;
    const t = !p ? '' : p.status === 'pagado' ? money(Number(p.amount) || 0).replace('$', '') : p.status === 'na' ? 'N/A' : p.status === 'saldo_favor' ? 'a favor' : 'pend.';
    return `<td class="sv ${p ? p.status : ''} ${per(m) === mesHoy ? 'hoyc' : ''}" data-servpay="${a.id}|${per(m)}">${t}${p && p.paid_on ? `<small>${+p.paid_on.slice(8)}/${+p.paid_on.slice(5, 7)}</small>` : ''}</td>`; };
  h += `<div class="card scroll" style="padding:6px 0"><table class="svt"><tr><th class="dpc">Depa</th>${MES3.map((m, i) => `<th data-per="${per(i)}" class="${per(i) === mesHoy ? 'hoyc' : ''}">${m}</th>`).join('')}<th class="r">Total</th></tr>`;
  for (const a of A) { const tot = (S.t.service_payments || []).filter(p => p.account_id === a.id && p.period.startsWith(F.y) && p.status === 'pagado').reduce((s, p) => s + (Number(p.amount) || 0), 0);
    h += `<tr style="${OC.has(a.id) ? 'opacity:.4' : ''}"><th class="dpc" ${F.edit ? `data-servhide="${a.id}"` : `data-servacc="${a.id}"`}>${F.edit ? `<span class="eye">${OC.has(a.id) ? '🙈' : '👁'}</span>` : ''}<b>${esc(a.label)}</b><small>${esc(a.responsable || '—')}${destinos(a).length ? ' · Gastos' + (destinos(a).length > 1 ? ' ' + destinos(a).map(d => d.code + ' ' + d.pct + '%').join('/') : '') : ''}</small>${a.contrato || a.extra ? `<small class="nserv"># ${esc(a.contrato || a.extra)}</small>` : ''}</th>${MES3.map((_, i) => cell(a, i)).join('')}<td class="r"><b>${money(tot)}</b></td></tr>`; }
  h += `</table></div><div class="m">Toca una celda para registrar o editar el pago de ese mes; toca el depa para ver contrato, vencimiento y forma de pago. Los pagos de cuentas marcadas "Gastos" (las que paga María) aparecen solos en Gastos e ingresos y en el P&L.</div>`;
  return h;
};
// Pendiente = mes (hasta el actual) sin registro y sin N/A, desde el primer mes con registro de esa cuenta; o marcado "pendiente"
function pendientesDe(a, y) {
  const P = (S.t.service_payments || []).filter(p => p.account_id === a.id), hoy = today().slice(0, 7);
  // Cuentas que no aplican (sin responsable o sin ningún pago registrado) no generan pendientes
  if (!(a.responsable || '').trim() || !P.some(p => p.status === 'pagado')) return [];
  const ini = P.map(p => p.period).sort()[0];
  const out = []; for (let m = 1; m <= 12; m++) { const per = `${y}-${String(m).padStart(2, '0')}`; if (per > hoy || per < ini) continue;
    const p = P.find(x => x.period === per); if (!p || p.status === 'pendiente') out.push(per); }
  return out;
}
function servPayForm(accId, period) {
  const ex = accId && period ? sPay(accId, period) : null, A = sAcc().filter(a => a.active !== false);
  const a0 = accId || (A.find(a => a.service === S.f.serv.s) || A[0] || {}).id;
  openForm({ title: ex ? 'Editar pago' : 'Registrar pago',
    values: ex ? { ...ex, amount: ex.amount == null ? '' : Math.abs(ex.amount), paid_on: ex.paid_on || '', note: ex.note || '', photos: [...(ex.photos || [])] } : { account_id: a0, period: period || today().slice(0, 7), status: 'pagado', amount: '', paid_on: today(), note: '', photos: [] },
    fields: v => { const ac = A.find(a => a.id === v.account_id) || {}; return [
      { k: 'account_id', label: 'Cuenta', type: 'select', options: SERV.flatMap(([s, l]) => A.filter(a => a.service === s).map(a => [a.id, `${l.split(' ')[0]} · ${a.label}`])) },
      ac.id && { type: 'note', html: [ac.contrato && 'Contrato: <b>' + esc(ac.contrato) + '</b>', ac.extra && esc(ac.extra_label || 'Dato') + ': <b>' + esc(ac.extra) + '</b>', ac.vencimiento && 'Vence: ' + esc(ac.vencimiento), ac.forma_pago && 'Pago: ' + esc(ac.forma_pago)].filter(Boolean).join(' · ') },
      { k: 'period', label: 'Mes del recibo', type: 'month' }, { k: 'status', label: 'Estado', type: 'select', options: SERV_ST },
      (v.status === 'pagado' || v.status === 'saldo_favor' || v.status === 'pendiente') && { k: 'amount', label: v.status === 'saldo_favor' ? 'Saldo a favor' : 'Monto', type: 'number' },
      v.status === 'pagado' && { k: 'paid_on', label: 'Fecha de pago', type: 'date' },
      { k: 'note', label: 'Nota', type: 'text' }, { k: 'photos', label: 'Recibo / comprobante (opcional)', type: 'photos' }]; },
    actions: ex ? [{ label: 'Borrar', confirm: true, run: () => { S.t.transactions.filter(t => t.service_payment_id === ex.id).forEach(t => del('transactions', { id: t.id })); del('service_payments', { id: ex.id }, 'Pago borrado'); } }] : [],
    save: async v => {
      if (!v.account_id) return 'Elige la cuenta.'; if (!/^\d{4}-\d{2}$/.test(v.period || '')) return 'Elige el mes.';
      if (v.status === 'pagado' && !(Number(v.amount) > 0)) return 'Escribe el monto pagado.';
      const otro = sPay(v.account_id, v.period); if (otro && (!ex || otro.id !== ex.id)) return 'Ese mes ya tiene un registro; tócalo en la tabla para editarlo.';
      const row = { account_id: v.account_id, period: v.period, status: v.status, amount: v.amount === '' || v.status === 'na' ? null : (v.status === 'saldo_favor' ? -Math.abs(Number(v.amount)) : Number(v.amount)), paid_on: v.status === 'pagado' ? v.paid_on || null : null, note: (v.note || '').trim() || null, photos: v.photos || [] };
      let pay; if (ex) { upd('service_payments', { id: ex.id }, row, 'Pago guardado'); pay = { ...ex, ...row }; } else { pay = { id: uid(), ...row, created_by: S.email }; ins('service_payments', pay, 'Pago registrado'); }
      syncServicio(pay);
    } });
}
function servAccForm(id) {
  const a = id ? sAcc().find(x => x.id === id) : null;
  openForm({ title: a ? a.label + ' · ' + (SERV.find(s => s[0] === a.service) || [])[1] : 'Nueva cuenta de servicio',
    values: a ? { ...a, property_code: Array.isArray(a.split) && a.split.length ? '__split' : a.property_code || '', split_txt: (a.split || []).map(x => x.code + ':' + x.pct).join(', '), to_pnl: String(!!a.to_pnl), active: String(a.active !== false) } : { service: S.f.serv.s, label: '', property_code: '', contrato: '', extra: '', vencimiento: '', responsable: 'María', forma_pago: '', to_pnl: 'true', active: 'true' },
    fields: v => [
      !a && { k: 'service', label: 'Servicio', type: 'select', options: SERV },
      { k: 'label', label: 'Propiedad (como aparece en la lista)', type: 'text' },
      { k: 'property_code', label: 'Depa en la app (para Gastos y P&L)', type: 'select', options: [['', '— ninguno —'], ['__split', 'Dividir entre varios depas…'], ...props().map(p => [p.code, p.code])] },
      v.property_code === '__split' && { k: 'split_txt', label: 'División (depa:% separados por coma)', type: 'text', ph: 'LHA:65, LHB:35' },
      { k: 'contrato', label: v.service === 'gas' ? 'Cliente' : 'Contrato', type: 'text' },
      v.service !== 'luz' && v.service !== 'mantenimiento' && { k: 'extra', label: { agua: 'Clave', gas: 'Proveedor', internet: 'Proveedor' }[v.service] || 'Dato', type: 'text' },
      { k: 'vencimiento', label: 'Vencimiento', type: 'text', ph: 'Ej. Día 6 c/2 meses' }, { k: 'responsable', label: 'Responsable de pago', type: 'text' },
      { k: 'forma_pago', label: 'Forma de pago', type: 'text' },
      { k: 'to_pnl', label: '¿Se suma al P&L del depa?', type: 'select', options: [['true', 'Sí, lo paga MGM y se carga al P&L'], ['false', 'No (lo paga el dueño u otro)']] },
      a && { k: 'active', label: 'Estado', type: 'select', options: [['true', 'Activa'], ['false', 'Dada de baja (se conserva el histórico)']] }],
    actions: a ? [{ label: 'Borrar cuenta e histórico', confirm: true, run: () => del('service_accounts', { id: a.id }, 'Cuenta borrada') }] : [],
    save: async v => {
      if (!(v.label || '').trim()) return 'Escribe la propiedad.';
      let split = null;
      if (v.property_code === '__split') { split = (v.split_txt || '').split(',').map(x => x.split(':').map(y => y.trim())).filter(x => x[0]).map(([code, pct]) => ({ code, pct: Number(pct) }));
        if (split.some(x => !prop(x.code) || !(x.pct > 0))) return 'Revisa la división: usa códigos de depa de la app, ej. LHA:65, LHB:35.';
        if (Math.round(split.reduce((t, x) => t + x.pct, 0)) !== 100) return 'Los porcentajes deben sumar 100.'; }
      const row = { label: v.label.trim(), property_code: split ? null : v.property_code || null, split, contrato: (v.contrato || '').trim() || null, extra: (v.extra || '').trim() || null, extra_label: { agua: 'Clave', gas: 'Proveedor', internet: 'Proveedor' }[v.service] || null,
        vencimiento: (v.vencimiento || '').trim() || null, responsable: (v.responsable || '').trim() || null, forma_pago: (v.forma_pago || '').trim() || null, to_pnl: String(v.to_pnl) === 'true', active: String(v.active) !== 'false' };
      if (a) { upd('service_accounts', { id: a.id }, row, 'Cuenta guardada'); (S.t.service_payments || []).filter(p => p.account_id === a.id).forEach(syncServicio); }
      else ins('service_accounts', { id: uid(), service: v.service, sort: 999, ...row }, 'Cuenta agregada');
    } });
}
async function exportServicios() {
  try {
    const X = await excelJS(), wb = new X.Workbook(), ws = wb.addWorksheet('Servicios ' + S.f.serv.y), y = S.f.serv.y;
    const MESL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const head = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F4F43' } } };
    ws.columns = [{ width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 18 }, ...Array(24).fill(0).map((_, i) => ({ width: i % 2 ? 12 : 10 }))];
    ws.addRow(['PAGOS DE SERVICIOS ' + y]).font = { bold: true, size: 14 };
    for (const [s, l] of SERV) {
      ws.addRow([]); const t = ws.addRow([l.toUpperCase(), '', '', '', '', '', ...MESL.flatMap(m => [m, ''])]); t.font = { bold: true };
      const hr = ws.addRow(['Propiedad', s === 'gas' ? 'Cliente' : 'Contrato', { agua: 'Clave', gas: 'Proveedor', internet: 'Proveedor' }[s] || '', 'Vencimiento', 'Responsable de pago', 'Forma de pago', ...MESL.flatMap(() => ['Monto', 'Fecha de pago'])]);
      hr.eachCell(c => Object.assign(c, head));
      for (const a of sAcc().filter(a => a.service === s)) ws.addRow([a.label, a.contrato || 'N/A', a.extra || '', a.vencimiento || '', a.responsable || '', a.forma_pago || '', ...MESL.flatMap((_, i) => { const p = sPay(a.id, `${y}-${String(i + 1).padStart(2, '0')}`);
        if (!p) return [0, 'N/A']; if (p.status === 'na') return ['N/A', 'N/A']; if (p.status === 'saldo_favor') return [Number(p.amount) || 0, 'Saldo a favor']; if (p.status === 'pendiente') return [Number(p.amount) || 0, 'Pendiente'];
        return [Number(p.amount) || 0, p.paid_on ? new Date(p.paid_on + 'T12:00:00') : (p.note || '')]; })]);
    }
    ws.eachRow(r => r.eachCell(c => { if (c.value instanceof Date) c.numFmt = 'dd/mm/yyyy'; else if (typeof c.value === 'number') c.numFmt = '"$"#,##0.00'; }));
    saveFile(new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_MIME }), 'MGM_servicios_' + y + '.xlsx');
  } catch (e) { toast(e.message); }
}
// ---------- USUARIOS Y PERMISOS (superadmin) ----------
// ✏️ edita · 👁 ve · — sin acceso. Refleja ACCESS (pantallas) y las reglas RLS de la base de datos.
const PERM = [
  ['Hoy', '✏️', '✏️ sin $', '—'],
  ['Reservas', '✏️', '✏️ vía Cal. sin $', '—'],
  ['Calendario', '✏️', '✏️', '—'],
  ['Cajones Qalina', '✏️', '✏️', '—'],
  ['Nómina', '✏️', '—', '—'],
  ['Limpiezas (descansos, supervisión, tarifas)', '✏️', '—', '—'],
  ['Gastos e ingresos', '✏️', '—', '✏️'],
  ['Pagos de servicios', '✏️', '—', '👁 en Gastos'],
  ['Pendientes', '✏️', '✏️', '—'],
  ['Compras', '✏️', '✏️', '—'],
  ['Claves', '✏️', '✏️', '—'],
  ['Ligas Airbnb', '✏️', '✏️', '—'],
  ['P&L (Beta)', '✏️', '—', '—'],
  ['Supuestos y usuarios', '✏️', '—', '—'],
  ['Respaldo diario (correo 10 pm)', 'María recibe', '—', '—']
];
const ROL_N = { superadmin: 'Superadmin', socio: 'Socio', finanzas: 'Finanzas' };
const haceCuanto = ts => { if (!ts) return 'Nunca ha entrado'; const m = Math.round((Date.now() - new Date(ts)) / 60000);
  return m < 2 ? 'Ahora' : m < 60 ? `Hace ${m} min` : m < 1440 ? `Hace ${Math.round(m / 60)} h` : m < 2880 ? 'Ayer' : `Hace ${Math.round(m / 1440)} días`; };
const AUTOS = [['ical', '🔄 Reservas desde Airbnb (iCal)', 'Cada 30 min: altas, cambios de fechas y cancelaciones'], ['correos', '✉️ Correos de Airbnb', 'Cada 30 min: nombre del huésped y monto'],
  ['resp_correo', '📧 Respaldo diario por correo', 'Todos los días 10 pm'], ['resp_drive', '☁️ Respaldo en Drive', 'Cada 4 h + paquete del lunes + fotos'], ['claves', '🔑 Pendientes de cambio de clave', 'Cada 3 meses, uno por depa']];
const autos = () => ({ on: true, ...(setting('automatizaciones', {}) || {}) });
VIEWS.usuarios = () => {
  if (!isSuper()) return '<div class="empty">Solo superadmin.</div>';
  const t = S.usrTab || 'auto', U = S.t.app_users, cnt = r => U.filter(u => u.role === r).length;
  let h = `<div class="seg" style="margin-bottom:12px;display:flex"><button class="sp ${t === 'auto' ? 'on' : ''}" data-usrtab="auto">Automatizaciones</button><button class="sp ${t === 'permisos' ? 'on' : ''}" data-usrtab="permisos">Permisos</button><button class="sp ${t === 'actividad' ? 'on' : ''}" data-usrtab="actividad">Actividad</button></div>`;
  if (t === 'auto') {
    const A = autos(), on = A.on !== false, last = setting('airbnb_sync_last', null);
    h += `<div class="card" style="border:2px solid ${on ? '#2e7d4f' : '#c0392b'}"><div class="row"><div class="sp"><div style="font-size:17px;font-weight:600">${on ? '🟢 Automatizaciones prendidas' : '⏸️ Todo en pausa'}</div><div class="m">${on ? 'Si algo falla, apágalo aquí y todo se detiene en la siguiente vuelta.' : 'Nada automático corre. La app sigue funcionando normal a mano.'}</div></div><label class="sw"><input type="checkbox" data-auto="on" ${on ? 'checked' : ''}><span></span></label></div>${A.by ? `<div class="m" style="margin-top:6px">Último cambio: ${esc(A.by)} · ${haceCuanto(A.at)}</div>` : ''}</div>
    <div class="card list${on ? '' : ' off'}">${AUTOS.map(([k, n, dsc]) => `<div class="it"><div class="sp"><div>${n}</div><div class="m">${dsc}${k === 'ical' && last ? ` · última: ${haceCuanto(last.at)}${last.errores?.length ? ' · ⚠️ ' + last.errores.length + ' error(es)' : ''}` : ''}</div></div><label class="sw"><input type="checkbox" data-auto="${k}" ${A[k] !== false ? 'checked' : ''} ${on ? '' : 'disabled'}><span></span></label></div>`).join('')}</div>
    <div class="m">El respaldo de Drive y el del correo te protegen si algo se borra: apágalos solo si ellos son los que fallan.</div>`;
    return h;
  }
  if (t === 'actividad') {
    const L = U.slice().sort((a, b) => (b.last_seen || '').localeCompare(a.last_seen || ''));
    h += `<div class="card list">${L.map(u => `<div class="it"><span class="avatar sm">${avatarHTML(u)}</span><div class="sp"><div>${esc(u.name || u.email)}</div><div class="m">${esc(u.email)}</div></div><div style="text-align:right"><span class="b ${u.role === 'superadmin' ? 'alta' : u.role === 'socio' ? 'cambio' : 'n'}">${ROL_N[u.role] || u.role}</span><div class="m" style="margin-top:4px">${haceCuanto(u.last_seen)}${u.visits ? ' · ' + u.visits + ' visitas' : ''}</div></div></div>`).join('')}</div>
      <div class="m">La actividad se registra desde hoy, cada vez que alguien abre la app. Para agregar o cambiar el tipo de usuario: Menú → Supuestos → Usuarios.</div>`;
    return h;
  }
  h += `<div class="card scroll" style="padding:8px 0"><div class="m" style="padding:0 12px 8px">✏️ ve y edita · 👁 solo ve · — sin acceso · sin $ = no ve montos</div><table class="permt"><tr><th class="dpc">Módulo</th>${['superadmin', 'socio', 'finanzas'].map(r => `<th>${ROL_N[r]}<small>${cnt(r)} · ${esc(U.filter(u => u.role === r).map(u => (u.name || u.email).split(/[ @]/)[0]).join(', '))}</small></th>`).join('')}</tr>
    ${PERM.map(([m, a, b, c]) => `<tr><th class="dpc">${esc(m)}</th>${[a, b, c].map(x => `<td class="${x === '—' ? 'no' : ''}">${esc(x)}</td>`).join('')}</tr>`).join('')}</table></div>
    <div class="m">Personal de limpieza: sin acceso (fase 2: confirmación por WhatsApp). Los permisos también están protegidos en la base de datos, no solo en las pantallas.</div>`;
  return h;
};
VIEWS.ligas = () => props().map(p => `<div class="card"><div class="row"><span class="dp">${esc(p.code)}</span><span class="sp"></span>${p.airbnb_url ? `<a href="${esc(p.airbnb_url)}" target="_blank" rel="noopener">Abrir</a>` : ''}<button class="${p.airbnb_url ? 'pri' : ''}" data-copyurl="${esc(p.code)}" ${p.airbnb_url ? '' : 'disabled'}>Copiar</button></div><input style="width:100%;margin-top:8px" type="url" inputmode="url" placeholder="https://airbnb.mx/h/…" data-url="${esc(p.code)}" value="${esc(p.airbnb_url || '')}">${isSuper() ? `<div class="m" style="margin-top:8px">Calendario iCal (Airbnb → Calendario → Disponibilidad → Exportar)${p.ical_url ? ' · ✅ sincronizando' : ''}</div><input style="width:100%;margin-top:4px" type="url" inputmode="url" placeholder="https://www.airbnb.mx/calendar/ical/….ics?s=…" data-ical="${esc(p.code)}" value="${esc(p.ical_url || '')}">` : ''}</div>`).join('');

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
  const DEP = S.t.properties.filter(p => !esCajon(p)).sort((a, b) => (a.active === false) - (b.active === false) || (a.sort ?? 0) - (b.sort ?? 0) || a.code.localeCompare(b.code));
  h += `<div class="row"><h2 class="sp">Depas</h2><button data-newdepa="1">＋ Agregar</button></div><div class="m" style="margin-bottom:6px">Desactivar un depa lo quita del calendario, de Hoy y de la sincronización con Airbnb. Su historial se conserva.</div><div class="card list">${DEP.map(p => `<div class="it"><span class="dp">${esc(p.code)}</span><div class="sp"><span class="m">${esc(p.building || '')}${p.ical_url || p.ical_extra ? ' · 🔄 Airbnb' : ''}</span>${p.active === false ? ' <span class="b baja">INACTIVO</span>' : ''}</div><button data-togdepa="${esc(p.code)}" class="${p.active === false ? 'pri' : ''}">${p.active === false ? 'Activar' : 'Desactivar'}</button></div>`).join('')}</div>`;
  h += `<div class="row"><h2 class="sp">Chicas</h2><button data-newcleaner="1">＋ Agregar</button></div><div class="card list">${S.t.cleaners.filter(c => c.key !== NA).sort((a, b) => a.name.localeCompare(b.name)).map(c => `<div class="it"><span class="b n">${esc(c.key)}</span><div class="sp">${esc(c.name)}${c.active === false ? ' <span class="m">(inactiva)</span>' : ''}</div><button data-togcleaner="${esc(c.key)}">${c.active === false ? 'Activar' : 'Desactivar'}</button></div>`).join('')}</div>`;
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
  const el = e.target.closest('button,[data-res],[data-tx],[data-task],[data-buy],[data-extra],[data-servpay],[data-servacc],[data-servhide]'); if (!el) return; const d = el.dataset;
  if (d.asig) return sheetAsignar(d.asig);
  if (d.extra) return extraForm(d.extra);
  if (d.newextra) return extraForm(null);
  if (d.synok) { const ids = d.synok === '*' ? S.t.sync_log.filter(x => !x.seen).map(x => x.id) : [d.synok]; for (const id of ids) await upd('sync_log', { id }, { seen: true }, ids.length > 1 ? null : 'Listo'); if (ids.length > 1) toast('Todo visto'); return; }
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
  if (d.apadd) {
    const c = $('apC').value, n = $('apN').value.trim(), a = $('apD').value, b = $('apH').value;
    if (!n) return toast('Escribe el nombre'); if (!a || !b || b <= a) return toast('La fecha "hasta" debe ser después de "desde"');
    const choque = activas().find(x => x.parking_from === c && x.checkin < b && a < x.checkout) || (S.t.parking_loans || []).find(x => x.cajon === c && x.date_from < b && a < x.date_to);
    if (choque) return toast('Ese cajón ya está prestado en esas fechas (' + (choque.guest || choque.name) + ')');
    return ins('parking_loans', { id: uid(), cajon: c, name: n, date_from: a, date_to: b }, 'Cajón apartado');
  }
  if (d.cajmes) { const [y, m] = (S.cajMes || S.dia.slice(0, 7)).split('-').map(Number), dt = new Date(y, m - 1 + Number(d.cajmes), 1); S.cajMes = ymd(dt).slice(0, 7); return render(); }
  if (d.apdel) return del('parking_loans', { id: d.apdel }, 'Apartado quitado');
  if (d.servs) { S.f.serv.s = d.servs; S.servScroll = true; return render(); }
  if (d.servy) { S.f.serv.y = String(+S.f.serv.y + Number(d.servy)); return render(); }
  if (d.servx) return exportServicios();
  if (d.servk) { S.f.serv.solo = S.f.serv.solo === d.servk ? '' : d.servk; return render(); }
  if (d.servpend) { S.f.serv.solo = S.f.serv.solo === 'pend' ? '' : 'pend'; return render(); }
  if (d.servedit) { S.f.serv.edit = !S.f.serv.edit; return render(); }
  if (d.servhide) { const o = new Set(setting('serv_ocultos', [])); o.has(d.servhide) ? o.delete(d.servhide) : o.add(d.servhide); return ups('settings', { key: 'serv_ocultos', value: [...o] }, ['key']); }
  if (d.servpay !== undefined) { const [a, p] = d.servpay.split('|'); return servPayForm(a || null, p || null); }
  if (d.servacc !== undefined) return servAccForm(d.servacc || null);
  if (d.tprio !== undefined) { S.f.task.prio = S.f.task.prio === d.tprio ? '' : d.tprio; return render(); }
  if (d.cajf !== undefined) { S.cajF = S.cajF === d.cajf ? '' : d.cajf; return render(); }
  if (d.supq) { const q = new Set(setting('sup_quitar', [])); q.has(d.supq) ? q.delete(d.supq) : q.add(d.supq); return ups('settings', { key: 'sup_quitar', value: [...q] }, ['key'], q.has(d.supq) ? 'Supervisión quitada en esa unidad' : 'Supervisión devuelta'); }
  if (d.supset) { const [k, f] = d.supset.split('|'), C = { ...supConf() }; C[k] = { team: [], monto: 30, ...(C[k] || {}) };
    if (f === 'del') delete C[k]; else if (f === 'add') {} return ups('settings', { key: 'supervision', value: C }, ['key'], f === 'del' ? 'Supervisora quitada' : 'Supervisora agregada'); }
  if (d.suppadd) { const k = d.suppadd, a = $('spD-' + k).value, b = $('spH-' + k).value; if (!a || !b || b < a) return toast('Revisa las fechas');
    return ups('settings', { key: 'sup_pausas', value: [...setting('sup_pausas', []), { id: uid(), sup: k, from: a, to: b }] }, ['key'], 'Pausa agregada'); }
  if (d.suppdel) return ups('settings', { key: 'sup_pausas', value: setting('sup_pausas', []).filter(p => p.id !== d.suppdel) }, ['key'], 'Pausa quitada');
  if (d.usrtab) { S.usrTab = d.usrtab; return render(); }
  if (d.waopen) return sheetWA();
  if (d.asigwa) return sheetAsigWA();
  if (d.undo) return deshacer();
  if (d.pnlq) { const x = $('pnlQ').value.trim(); if (!x) return toast('Escribe tu pregunta'); return ins('pnl_beta', { id: uid(), data: { texto: x }, updated_by: S.email, updated_at: new Date().toISOString() }, 'Pregunta enviada'); }
  if (d.pnldel) return del('pnl_beta', { id: d.pnldel }, 'Pregunta borrada');
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
  if (d.togdepa) { const p = S.t.properties.find(x => x.code === d.togdepa), on = p.active === false; if (!on && !confirmTap(el)) return; return upd('properties', { code: p.code }, { active: on }, on ? p.code + ' activado' : p.code + ' desactivado'); }
  if (d.newdepa) return openForm({ title: 'Agregar depa', values: { code: '', building: '' }, fields: () => [{ k: 'code', label: 'Código (como sale en el calendario, p. ej. Q-901)', type: 'text' }, { k: 'building', label: 'Edificio (p. ej. Qalina)', type: 'text' }],
    save: async v => { const code = (v.code || '').trim(); if (!code) return 'Falta el código.'; if (S.t.properties.some(p => p.code.toLowerCase() === code.toLowerCase())) return 'Ese depa ya existe.'; const sort = Math.max(0, ...S.t.properties.map(p => p.sort ?? 0)) + 1; ins('properties', { code, building: (v.building || '').trim() || null, sort, active: true, kind: 'depa' }, code + ' agregado · pon su tarifa de limpieza y su liga iCal'); } });
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
  if (d.supteam) { const [k, c] = d.supteam.split('|'), C = { ...supConf() }, T = new Set(C[k].team); t.checked ? T.add(c) : T.delete(c);
    if (t.checked) { const otra = Object.keys(C).find(o => o !== k && C[o].team.includes(c)); if (otra) C[otra] = { ...C[otra], team: C[otra].team.filter(x => x !== c) }; }
    C[k] = { ...C[k], team: [...T] }; return ups('settings', { key: 'supervision', value: C }, ['key'], 'Equipo actualizado'); }
  if (d.supmonto) { const C = { ...supConf() }; C[d.supmonto] = { ...C[d.supmonto], monto: Number(t.value) || 0 }; return ups('settings', { key: 'supervision', value: C }, ['key'], 'Monto guardado'); }
  if (d.supnew !== undefined) { if (!t.value) return; const C = { ...supConf(), [t.value]: { team: [], monto: 30 } }; return ups('settings', { key: 'supervision', value: C }, ['key'], 'Supervisora agregada'); }
  if (d.servm) { S.f.serv.m = t.value; S.servScroll = true; return render(); }
  if (t.id === 'servQ') { S.f.serv.q = t.value.trim(); return render(); }
  if (d.pq) return pnlSet(d.pq, t.value);
  if (d.pqm) { const cur = new Set(pnlRow().data[d.pqm] || []); t.checked ? cur.add(t.value) : cur.delete(t.value); return pnlSet(d.pqm, [...cur]); }
  if (d.pqt) return pnlSet(d.pqt, t.value);
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
  if (d.auto) { const A = { ...autos(), [d.auto]: t.checked, by: S.me.name || S.me.email, at: new Date().toISOString() }; return ups('settings', { key: 'automatizaciones', value: A }, ['key'], d.auto === 'on' ? (t.checked ? 'Automatizaciones prendidas' : 'Todo en pausa') : (t.checked ? 'Prendida' : 'En pausa')); }
  if (d.ical !== undefined) { const v = t.value.trim(); if (v && !/^https:\/\/[^ ]+\.ics/i.test(v)) return toast('Esa liga no parece de calendario (.ics)'); return upd('properties', { code: d.ical }, { ical_url: v || null }, v ? 'Calendario guardado · se sincroniza cada 30 min' : 'Calendario quitado'); }
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
