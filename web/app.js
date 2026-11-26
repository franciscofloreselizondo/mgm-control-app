/* MGM Control App · reservas por iCal de Airbnb + correos, operación, nómina, finanzas y avisos por WhatsApp */
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
const APP_VER = '86';
const TABLES = ['properties', 'cleaners', 'cleaning_rates', 'settings', 'app_users', 'reservations', 'blocks', 'days_off',
  'payroll_extras', 'payroll_payments', 'transactions', 'tasks', 'purchases', 'access_codes', 'cleanings', 'pnl_beta', 'parking_loans', 'service_accounts', 'service_payments', 'sync_log', 'pl_mensual', 'pl_listings', 'pl_ideas', 'precio_decisiones'];
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
      sb.getChannels().filter(c => c.topic === 'realtime:mgm').forEach(c => sb.removeChannel(c)); // por si se vuelve a entrar sin recargar
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
  calV: ls.get('mgm-calv', 'N'),
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
const AN = window.MGM_AN || { iniciar() {}, evento() {}, error() {} };
async function done(p, t, okMsg, op) { const err = await p; if (err) { AN.evento('guardado_fallido', { tabla: t, op, error: String(err).slice(0, 150) }); toast('No se guardó: ' + err); reload(t); return false; } AN.evento('dato_guardado', { tabla: t, op }); if (okMsg) toast(okMsg); return true; }
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
function ins(t, row, msg) { const k = keyOf(row); pushUndo(t, [k ? { a: 'del', t, m: k } : { a: 'del', t, m: { ...row } }], msg); S.t[t].push(row); render(); return done(DB.insert(t, row), t, msg, 'alta'); }
function upd(t, match, patch, msg) {
  const ops = []; S.t[t].forEach(r => { if (hit(r, match)) { ops.push({ a: 'upd', t, m: keyOf(r) || match, p: Object.fromEntries(Object.keys(patch).map(k => [k, r[k] === undefined ? null : r[k]])) }); Object.assign(r, patch); } });
  pushUndo(t, ops, msg); render(); return done(DB.update(t, match, patch), t, msg, 'cambio');
}
function del(t, match, msg) { pushUndo(t, S.t[t].filter(r => hit(r, match)).map(r => ({ a: 'ins', t, row: JSON.parse(JSON.stringify(r)) })), msg); S.t[t] = S.t[t].filter(r => !hit(r, match)); render(); return done(DB.remove(t, match), t, msg, 'borrado'); }
function ups(t, row, pk, msg) {
  const i = S.t[t].findIndex(r => pk.every(k => r[k] === row[k])), m = Object.fromEntries(pk.map(k => [k, row[k]]));
  pushUndo(t, [i >= 0 ? { a: 'upd', t, m, p: Object.fromEntries(Object.keys(row).map(k => [k, S.t[t][i][k] === undefined ? null : S.t[t][i][k]])) } : { a: 'del', t, m }], msg);
  if (i >= 0) Object.assign(S.t[t][i], row); else S.t[t].push(row); render(); return done(DB.upsert(t, row, pk), t, msg, 'alta_o_cambio');
}
async function reload(t) { const r = await DB.load(t); if (r.rows) { S.t[t] = r.rows; S.falta?.delete(t); render(); } }

// ---------- sesión ----------
async function start() {
  try { const q = new URLSearchParams(location.search); if (q.get('v') && !q.get('ir')) history.replaceState(null, '', location.pathname + location.hash); } catch (_) {}
  if (!CFG.DEMO && !CFG.SUPABASE_URL) { document.body.innerHTML = '<p style="padding:24px">Falta config.js con SUPABASE_URL y SUPABASE_ANON_KEY.</p>'; return; }
  DB.onAuth(email => { if (email && !S.email) boot(email); if (!email && S.email) showLogin(); });
  const email = await DB.session();
  if (!email) showLogin(); else if (!S.email) boot(email); // onAuth puede haber arrancado ya: no arrancar dos veces
  if (!CFG.DEMO && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!CFG.DEMO) { // actualización automática: al volver a la app revisa si hay versión nueva y recarga
    const chk = async () => { try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); const v = (await r.json()).v;
      if (v && v !== APP_VER && sessionStorage.getItem('mgm_rl') !== v) { sessionStorage.setItem('mgm_rl', v); try { const rg = await navigator.serviceWorker?.getRegistration(); await rg?.update(); } catch (_) {} location.replace(location.pathname + '?v=' + v + location.hash); } /* URL nueva: GitHub Pages no sirve la página vieja de su caché */ } catch (_) {} };
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
  const lento = setTimeout(() => { if ($('view').textContent.trim() === 'Cargando…') $('view').innerHTML = '<div class="card" style="text-align:center"><b>Está tardando en cargar</b><div class="m" style="margin:8px 0 12px">Puede ser la señal o una versión vieja guardada en el teléfono.</div><div class="row" style="gap:8px;justify-content:center"><button onclick="location.reload()">Reintentar</button><button class="pri" onclick="window.__mgmLimpiar && window.__mgmLimpiar()">Limpiar y recargar</button></div></div>'; AN.evento('carga_lenta'); }, 15000);
  const res = await Promise.all(TABLES.map(t => DB.load(t)));
  clearTimeout(lento);
  S.falta = new Set(); TABLES.forEach((t, i) => { S.t[t] = res[i].rows || []; if (!res[i].rows) S.falta.add(t); });
  S.me = S.t.app_users.find(u => (u.email || '').toLowerCase() === email.toLowerCase()) || null;
  if (S.me && DB.touch) DB.touch();
  render();
  try { ligaAccion(); } catch (e) { console.warn('liga', e); }
  AN.iniciar({ version: APP_VER, email, rol: S.me && S.me.role, name: S.me && S.me.name });
  AN.evento('app_cargada', { ms: Math.round(performance.now()), tablas_sin_cargar: S.falta.size });
  const timers = {};
  DB.subscribe(t => { clearTimeout(timers[t]); timers[t] = setTimeout(() => reload(t), 400); }, ok => { S.live = ok; renderLive(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) return; if (S.tab === 'calendario') { S.calMes = today().slice(0, 7); S.calScroll = true; render(); } if (!CFG.DEMO) TABLES.forEach(reload); });
}

// ---------- Ligas de acción (vienen en los avisos de WhatsApp de Claudio) ----------
// ?ir=asignar&res=… · reserva&res=… · cajon&res=… · visto&log=… · asigwa&d=… · calendario&d=… · hoy · nomina&sem=… · pago&chica=…&sem=…
//   · servicios&m=YYYY-MM · servpago&acc=…&m=… · pendiente&id=… · pendientes
function ligaAccion() {
  const q = new URLSearchParams(location.search), ir = q.get('ir'); if (!ir || !S.me) return;
  try { history.replaceState(null, '', location.pathname + '#' + S.tab); } catch (_) {}
  AN.evento('liga_whatsapp', { ir });
  const res = q.get('res'), r = res && S.t.reservations.find(x => x.id === res), d = q.get('d'), sem = q.get('sem');
  const ir_a = t => { if (allowed(t)) go(t); };
  const falta = () => toast('Ese registro ya no existe o cambió');
  if (sem && /^\d{4}-\d{2}-\d{2}$/.test(sem)) S.semana = monday(sem);
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) { S.calMes = d.slice(0, 7); S.dia = d; }
  switch (ir) {
    case 'asignar': ir_a('calendario'); return r ? sheetAsignar(r.id) : falta();
    case 'reserva': case 'cajon': ir_a('calendario'); return r ? resForm(r.id) : falta();
    case 'visto': { const l = (S.t.sync_log || []).find(x => x.id === q.get('log')); ir_a('hoy'); if (l && !l.seen) upd('sync_log', { id: l.id }, { seen: true }, 'Marcado como visto'); return; }
    case 'asigwa': ir_a('hoy'); if (d) S.waD = d; return sheetAsigWA();
    case 'calendario': S.calScroll = true; return ir_a('calendario');
    case 'nomina': return ir_a('nomina');
    case 'pago': ir_a('nomina'); return q.get('chica') ? pagoForm(q.get('chica')) : null;
    case 'servicios': case 'servpago': { ir_a('servicios'); const m = q.get('m'); if (m && S.f.serv) { S.f.serv.y = m.slice(0, 4); S.f.serv.m = m.slice(5, 7); render(); } return ir === 'servpago' && q.get('acc') ? servPayForm(q.get('acc'), m) : null; }
    case 'pendiente': { ir_a('pendientes'); const t = S.t.tasks.find(x => x.id === q.get('id')); return t ? taskForm(t.id) : falta(); }
    case 'pendientes': return ir_a('pendientes');
    case 'mov': { ir_a('finanzas'); const t = S.t.transactions.find(x => x.id === q.get('id')); return t ? txForm(t.id) : falta(); }
    case 'admin': S.usrTab = 'auto'; return ir_a('usuarios');
    case 'pnl': return ir_a('pnl');
    case 'ocupacion': return ir_a('ocupacion');
    case 'stats': return ir_a('stats');
    default: return ir_a('hoy');
  }
}

// ---------- navegación ----------
const MAIN = ['hoy', 'cajones', 'calendario', 'nomina', 'menu'];
const MENU = [
  ['reservas', 'Reservas', 'Buscar, editar o capturar (las de Airbnb llegan solas)'],
  ['limpiezas', 'Limpiezas', 'Descansos, supervisión y tarifas'],
  ['finanzas', 'Gastos e ingresos', 'Captura, fotos y exportar a Excel'],
  ['pendientes', 'Pendientes', 'Tareas por departamento'],
  ['compras', 'Compras', 'Lista de compras pendientes'],
  ['claves', 'Claves', 'Claves de puerta, bodega y caja fuerte'],
  ['ligas', 'Ligas Airbnb', 'Liga de cada anuncio para copiar'],
  ['servicios', 'Pagos de servicios', 'Luz, agua, gas, internet y mantenimiento por depa · histórico'],
  ['stats', 'Estadísticas', 'Ocupación, ingresos, gastos, tendencia de 3 meses y alertas · solo María y Paco'],
  ['pnl', 'P&L', 'Estado de resultados por fechas, torre o depa · PDF con comprobantes · solo María y Paco'],
  ['ocupacion', 'Gestión de Ocupación', 'Tú contra la zona, mapa de desgaste y prioridades de precio · solo María decide'],
  ['usuarios', 'Admin', 'Automatizaciones · permisos · actividad · supuestos (depas, chicas, cajones, bono) · solo superadmin']
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
const TITLES = { supuestos: 'Supuestos', perfil: 'Mi perfil', reservas: 'Reservas', cajones: 'Cajones Qalina', hoy: 'Hoy', calendario: 'Calendario', nomina: 'Nómina', menu: 'Menú', ...Object.fromEntries(MENU.map(m => [m[0], m[1]])), ocupacion: 'Ocupación' };
const VIEWS = {};
function go(tab) { if (tab !== S.tab) AN.evento('pestana_vista', { pestana: tab }); S.tab = tab; try { history.replaceState(null, '', '#' + tab); } catch (_) {} scrollTo(0, 0); S.calScroll = tab === 'calendario'; if (tab === 'servicios') { S.servScroll = true; const pm = mesAnt(); if (S.f.serv) { S.f.serv.y = pm.slice(0, 4); S.f.serv.m = pm.slice(5); } } render(); }
// Congela los controles de arriba (botones, filtros, navegación) de cada pestaña
function fijarCabecera() {
  const v = $('view'); if (!v || v.querySelector('.calhead')) return;
  const stop = el => el.tagName === 'H2' || el.matches('.card,.kpis,.menu,.err,.list,.calwrap,.cal,.menu-foot,.stinfo,table');
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
  if (d.washare) { AN.evento('compartir_whatsapp'); return compartirWA(); }
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
    title: 'Bloqueo (N/A)', values: { property_code: '', kind: '', date_from: today(), date_to: today(), note: '' },
    fields: () => [{ k: 'property_code', label: 'Departamento', type: 'select', options: depaOpts() }, { k: 'kind', label: 'Motivo', type: 'select', options: [['', '— elige —'], ['externa', 'Reserva por fuera de Airbnb (cuenta como ocupado)'], ['mantenimiento', 'Mantenimiento u otro (no disponible)']] }, { k: 'date_from', label: 'Desde', type: 'date' }, { k: 'date_to', label: 'Hasta', type: 'date' }, { k: 'note', label: 'Nota (opcional)', type: 'text' }],
    save: async v => { if (!v.property_code) return 'Elige el departamento.'; if (!v.kind) return 'Elige el motivo: así las estadísticas saben si cuenta como ocupado.'; if (!v.date_from || !v.date_to || v.date_to < v.date_from) return 'Revisa las fechas.'; ins('blocks', { id: uid(), property_code: v.property_code, kind: v.kind, date_from: v.date_from, date_to: v.date_to, note: v.note || null }, 'Bloqueo agregado'); }
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
  if (bl.length) h += '<h2>Bloqueos (N/A)</h2>' + bl.map(b => `<div class="card row"><div class="sp"><span class="dp">${esc(b.property_code)}</span> ${fmt(b.date_from)} – ${fmt(b.date_to)} <span class="b ${b.kind === 'externa' ? 'alta' : 'n'}">${b.kind === 'externa' ? 'RESERVA POR FUERA' : 'MANTENIMIENTO'}</span> <span class="m">${esc(b.note || '')}</span></div><button data-blkind="${b.id}">Cambiar motivo</button><button data-del="blocks|${b.id}">Quitar</button></div>`).join('');
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
// Horas que faltan para una fecha y hora local ('YYYY-MM-DD', hora del día)
function hrsPara(f, hora) { const t = parse(f); t.setHours(hora, 0, 0, 0); return Math.ceil((t - new Date()) / 36e5); }
const hrsTxt = n => n <= 0 ? 'Ya' : n < 48 ? n + ' h' : Math.round(n / 24) + ' días';
// Lo que hay que resolver, de lo más urgente a lo menos: cajón que falta, depa sin clave, limpieza sin chica, calendarios sin sincronizar
function porResolver(P) {
  const d = today(), m = add(d, 1), R = [];
  P.cajones.forEach(r => R.push({ h: hrsPara(r.checkin, 15), t: `${r.property_code} · falta cajón`, s: `Entra ${pnom(r.guest)} ${fmt(r.checkin)}, con coche`, b: `<button class="pri" data-res="${r.id}">Asignar</button>` }));
  if (isSuper()) { const conClave = new Set(S.t.access_codes.filter(c => (c.code1 || '').trim()).map(c => c.place));
    activas().filter(r => (r.checkin === d || r.checkin === m) && !conClave.has(r.property_code)).forEach(r => R.push({ h: hrsPara(r.checkin, 15), t: `${r.property_code} · sin clave`, s: `Entra ${pnom(r.guest)} ${fmt(r.checkin)}`, b: `<button class="pri" data-go="claves">Poner</button>` })); }
  P.limpiezas.forEach(r => R.push({ h: hrsPara(r.f, 11), t: `${r.dp} · sin chica`, s: `${r.extra ? 'Limpieza extra' : 'Sale'} ${fmt(r.f)}`, b: `<button class="pri" ${r.extra ? 'data-extra' : 'data-asig'}="${r.id}">Asignar</button>` }));
  if (isSuper()) { const e = (setting('airbnb_sync_last', null) || {}).errores || []; if (e.length) R.push({ h: 0, t: `${e.length} calendario(s) sin sincronizar`, s: 'Airbnb no respondió en la última vuelta', b: `<button class="pri" data-go="ligas">Ver</button>` }); }
  return R.sort((x, y) => x.h - y.h);
}
VIEWS.hoy = () => {
  const P = pendientes(), d = today(), m = add(d, 1), act = activas();
  const salen = act.filter(r => r.checkout === d), entran = act.filter(r => r.checkin === d), occ = ocupadas(d), lib = libres(d);
  let h = `<div class="row" style="margin-bottom:8px"><span class="m">${fmt(d)}</span><span class="sp"></span>${isSuper() ? '<button class="hoywa" data-asigwa="1" title="Asignaciones de mañana para WhatsApp">📲 Asignaciones</button>' : ''}</div><div class="kpis k4 hoyk"><button class="kpi hk-sale" data-hoy="sale"><div class="v">${salen.length}</div><div class="l">Salen hoy ›</div></button><button class="kpi hk-entra" data-hoy="entra"><div class="v">${entran.length}</div><div class="l">Entran hoy ›</div></button><button class="kpi hk-occ" data-hoy="occ"><div class="v">${occ.length}</div><div class="l">Ocupados ›</div></button><button class="kpi hk-libre" data-hoy="libre"><div class="v">${lib.length}</div><div class="l">Libres ›</div></button></div>`;
  const R = porResolver(P);
  h += `<h2>${R.length ? R.length + ' por resolver · en orden de urgencia' : 'Por resolver'}</h2>`;
  h += R.length ? R.map(x => `<div class="card row hoyr"><div class="hrs ${x.h <= 24 ? 'mal' : 'med'}"><b>${hrsTxt(x.h)}</b><span>${x.h <= 0 ? 'urge' : 'restan'}</span></div><div class="sp"><div><b>${esc(x.t)}</b></div><div class="m">${esc(x.s)}</div></div>${x.b}</div>`).join('') : '<div class="card empty">Todo en orden ✓</div>';
  if (isSuper()) { const L0 = (S.t.sync_log || []).filter(x => !x.seen).sort((a, b) => a.at < b.at ? 1 : -1), L = L0.filter(x => x.action !== 'claudio'), C = L0.filter(x => x.action === 'claudio');
    // Lo que Claudio registró por WhatsApp: mismo patrón que los cambios de Airbnb (se queda hasta marcarlo visto)
    if (C.length) h += `<h2>💬 Claudio registró por WhatsApp (${C.length})</h2>` + C.slice(0, 15).map(x => `<div class="card row"><div class="sp"><div>${x.property_code ? `<span class="dp">${esc(x.property_code)}</span> ` : ''}<span class="b">CLAUDIO</span> <span class="m">${esc(new Date(x.at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }))}</span></div><div class="m">${esc(x.detail)}</div></div><button data-synok="${x.id}">Visto</button></div>`).join('') + (C.length > 1 ? `<div class="row" style="margin-bottom:8px"><span class="sp"></span><button data-synok="claudio">Marcar todo visto</button></div>` : '');
    if (L.length) h += `<h2>🔄 Cambios de Airbnb (${L.length})</h2>` + L.slice(0, 15).map(x => `<div class="card row"><div class="sp"><div><span class="dp">${esc(x.property_code)}</span> <span class="b ${x.action === 'baja' ? 'baja' : ''}">${x.action === 'alta' ? 'NUEVA' : x.action === 'baja' ? 'CANCELADA' : 'CAMBIO'}</span></div><div class="m">${esc(x.detail)}</div></div>${x.reservation_id ? `<button class="pri" data-res="${x.reservation_id}">Abrir</button>` : ''}<button data-synok="${x.id}">Visto</button></div>`).join('') + (L.length > 1 ? `<div class="row" style="margin-bottom:8px"><span class="sp"></span><button data-synok="*">Marcar todo visto</button></div>` : ''); }
  if (isSuper()) { const pi = ocPend().slice(0, 3), top = pi.length ? [] : ocDatos(7).filter(x => x.libres.length).sort((a, b) => b.libres.length - a.libres.length).slice(0, 3);
    if (pi.length) h += `<div class="card hoyp"><div class="row"><b class="sp">${pi.length} prioridades para ocupar más</b><button class="lnk" data-go="ocupacion">Ver todas</button></div>${pi.map((i, n) => `<div class="it"><span class="n">${n + 1}</span><div class="sp"><div><b>${esc(i.titulo)}</b></div><div class="m">${i.antes != null && i.nuevo != null ? 'De ' + ocMon(i.antes, i.moneda) + ' a ' + ocMon(i.nuevo, i.moneda) + (i.vence ? ' · vence ' + fmt(i.vence) : '') : esc((i.detalle || '').split('.')[0])}</div></div><button data-ochoy="${esc(i.id)}">Revisar</button></div>`).join('')}</div>`;
    else if (top.length) h += `<div class="card hoyp"><div class="row"><b class="sp">${top.length} prioridades para ocupar más</b><button class="lnk" data-go="ocupacion">Ver todas</button></div>${top.map((x, i) => `<div class="it"><span class="n">${i + 1}</span><div class="sp"><div><b>${esc(x.p.code)}</b> · ${x.libres.length} ${x.libres.length === 1 ? 'noche libre' : 'noches libres'} esta semana</div><div class="m">${x.tramos.map(([a, b]) => a === b ? fmt(a) : fmt(a) + ' a ' + fmt(b)).join(' · ')}</div></div><button data-go="ocupacion">Revisar</button></div>`).join('')}</div>`; }
  // Mañana: lo que hay que dejar listo hoy
  const sm = act.filter(r => r.checkout === m), em = act.filter(r => r.checkin === m), xm = S.t.cleanings.filter(x => x.date === m);
  const carga = {}; let sin = 0;
  sm.filter(r => limpiaMGM(r.property_code)).concat(xm).forEach(r => { if (r.cleaner_key && r.cleaner_key !== NA) carga[r.cleaner_key] = (carga[r.cleaner_key] || 0) + 1; else if (!r.cleaner_key) sin++; });
  const off = S.t.days_off.filter(o => o.date === m).map(o => o.cleaner_key);
  h += `<div class="card hoym"><div><b>Mañana</b> <span class="m">${fmt(m)} · ${sm.length} salen · ${em.length} entran</span></div><div class="row" style="gap:6px;margin-top:6px">${cleaners().filter(c => !off.includes(c.key)).map(c => `<span class="b n">${esc(c.name)} ${carga[c.key] || 0}</span>`).join('')}${off.map(k => `<span class="b baja">${esc(nombre(k))} descansa</span>`).join('')}${sin ? `<span class="b cambio">${sin} sin chica</span>` : ''}</div></div>`;
  return h + `<div class="menu-foot"><img class="l" src="img/logo-white.png" alt="MGM Housing Management"><img class="s" src="img/skyline.svg" alt=""></div>`;
};

// ---------- CALENDARIO ----------
// En el calendario solo va el primer nombre del huésped (el nombre completo se ve al tocar la reserva): así la semana cabe más compacta.
const pnom = g => { const n = String(g || '').trim().split(/\s+/)[0] || ''; return n.length > 11 ? n.slice(0, 10) + '…' : n; };
const calvBtn = () => `<span class="calv" title="Vista: Simple o Nueva"><button data-calv="S" class="${S.calV === 'S' ? 'on' : ''}" aria-label="Vista simple">S</button><button data-calv="N" class="${S.calV !== 'S' ? 'on' : ''}" aria-label="Vista nueva">N</button></span>`;
VIEWS.calendario = () => {
  const [y, m] = S.calMes.split('-').map(Number);
  const ini = S.calMes + '-01', ult = ymd(new Date(y, m, 0));
  const by = {}, lent = {};
  activas().forEach(r => { (by[r.property_code] ||= []).push(r); if (r.parking_from) (lent[r.parking_from] ||= []).push(r); });
  const exm = {}; S.t.cleanings.forEach(x => { exm[x.property_code + '|' + x.date] = x; });
  const NOM = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];
  const NV = S.calV !== 'S';
  // Cabecera compacta: dos renglones de botones y la leyenda en una línea
  let h = `<div class="calhead calc"><div class="crow"><button data-cm="-1" aria-label="Mes anterior">‹</button><div class="d">${MESES_L[m - 1]} ${y}</div><button data-cm="1" aria-label="Mes siguiente">›</button><button data-cm="0">Hoy</button><span class="czoom"><button data-zoom="-1" aria-label="Alejar">－</button><span class="m">${Math.round(S.zoom * 100)}%</span><button data-zoom="1" aria-label="Acercar">＋</button></span></div>`;
  h += `<div class="crow"><button data-undo="1" ${UNDO.length ? '' : 'disabled'} title="Deshacer el último cambio" aria-label="Deshacer">↶${UNDO.length ? '<small style="font-size:11px;margin-left:3px">' + UNDO.length + '</small>' : ''}</button><button data-expcal="1">Excel</button><button class="sp" data-newextra="1">＋ Limpieza</button><button class="pri sp" data-newres="1">＋ Reserva</button></div>`;
  h += `<div class="m calleg"><span><i style="background:#1f5fa8"></i>Entra / sigue</span><span><i style="background:#b5372b"></i>Sale</span><span><i style="background:#6b3fa0"></i>Limpia</span><span><i style="background:#7b8082"></i>Cajón</span><span class="sp"></span>${calvBtn()}</div></div>`;
  h += `<div class="calwrap ${NV ? 'nv' : ''}" style="zoom:${S.zoom};--lw:${Math.max(1, 1 / S.zoom).toFixed(2)}px">`;
  for (let w = monday(ini); w <= ult; w = add(w, 7)) {
    const dias = [0, 1, 2, 3, 4, 5, 6].map(i => add(w, i));
    h += `<div class="cal" ${dias.includes(today()) ? 'id="semhoy"' : ''}>`;
    if (w === monday(ini)) h += `<div class="mes"><small>${y}</small>${MESES_L[m - 1].toUpperCase()}</div>`;
    h += `<table><thead><tr><th class="dpc">Depa</th>${NOM.map((n, i) => `<th colspan="4" class="ds ${i > 4 ? 'fin' : ''}">${n}</th>`).join('')}</tr>`;
    h += `<tr class="num"><th class="dpc"></th>${dias.map(d => { const off = S.t.days_off.filter(o => o.date === d).map(o => nombre(o.cleaner_key) + ' no').join(', '); return `<th colspan="4" class="ds ${d === today() ? 'hoy' : ''} ${dow(d) === 0 || dow(d) === 6 ? 'fin' : ''}">${parse(d).getDate()}${d === today() ? ' · hoy' : ''}${off ? `<span class="off">${esc(off)}</span>` : ''}</th>`; }).join('')}</tr></thead><tbody>`;
    let torreAnt = null;
    for (const p of props()) {
      const rs = by[p.code] || [], ls2 = lent[p.code] || [];
      h += `<tr class="${torreAnt !== null && (p.building || '') !== torreAnt ? 'tsep' : ''}"><td class="dpc">${esc(p.code)}</td>`;
      torreAnt = p.building || '';
      dias.forEach((d, i) => {
        const bl = bloqueado(p.code, d);
        const noche = rs.find(r => r.checkin <= d && d < r.checkout), sale = rs.find(r => r.checkout === d);
        if (bl && !noche && !sale && !exm[p.code + '|' + d]) { h += `<td class="ds na" colspan="4">${bl.kind === 'externa' ? 'Por fuera' : 'N/A'}${bl.note ? ' · ' + esc(bl.note) : ''}</td>`; return; }
        const oc = noche ? (noche.checkin === d ? esc(pnom(noche.guest)) : 'X') : '';
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
        const c3 = sale ? esc(pnom(sale.guest)) : xt ? '<span class="xl">Limpieza</span>' : '';
        const cn = noche ? ' noc' : '', cs = sale ? ' sal' : '';
        h += `<td class="ds oc${cn}${noche && noche.checkin === d ? ' ent' : ''}" ${noche ? `data-res="${noche.id}" title="${esc(noche.guest)}"` : ''}>${oc}</td><td class="es${cn}">${es}</td><td class="en${cs}" ${sale ? `data-res="${sale.id}"` : xt ? `data-extra="${xt.id}"` : ''}>${c3}</td><td class="kc${cs}">${k}</td>`;
      });
      h += '</tr>';
    }
    h += '</tbody></table></div>';
  }
  return h + '</div>';
};

// ---------- P&L (estado de resultados para dueños) ----------
// Supuestos tomados de las respuestas de María (settings.pnl_config): % de gestión, tarifa de limpieza y lavandería por salida, cajones e IVA.
const plCfg = () => ({ gestion: { def: 15 }, limpieza: {}, cajon_ing: { monto: 580, codes: [] }, cajon_renta: { monto: 500, codes: [] }, iva: 8, ...(setting('pnl_config', null) || {}) });
const plRango = () => { const hoy = today(); return [S.plF || hoy.slice(0, 7) + '-01', S.plT || hoy]; };
const plPct = (a, b) => b ? Math.round(a / b * 1000) / 10 : 0;
function plCalc(f, tx, codes) { // periodo [f, tx)
  const C = plCfg(), set = new Set(codes), A = stCalc(f, tx, codes), EXC = ['Limpieza', 'Lavandería'];
  let frac = 0; for (let d = f; d < tx;) { const ym = d.slice(0, 7), fin = stMes(ym, 1) + '-01', z = fin < tx ? fin : tx; frac += stDias(d, z) / stDias(ym + '-01', fin); d = z; }
  const dep = Object.fromEntries(codes.map(c => [c, { code: c, torre: prop(c)?.building || 'Sin edificio', ingRes: 0, otros: 0, nSal: 0, gastos: 0, cat: {}, renta: 0, sinMonto: 0, nochesM: 0, sinTarifa: false }]));
  const RES = [], canal = {}, cal = [];
  for (const r of activas()) { if (!set.has(r.property_code) || r.checkout <= f || r.checkin >= tx) continue;
    const tot = stDias(r.checkin, r.checkout), a = r.checkin > f ? r.checkin : f, z = r.checkout < tx ? r.checkout : tx, n = stDias(a, z), x = dep[r.property_code], amt = Number(r.amount) || 0, parte = amt && tot ? amt * n / tot : 0;
    if (amt) { x.ingRes += parte; x.nochesM += n; } else x.sinMonto++;
    if (r.checkout >= f && r.checkout < tx) x.nSal++;
    const k = r.source === 'airbnb' || r.airbnb_code ? 'Airbnb' : r.source ? String(r.source) : 'Directo'; canal[k] = (canal[k] || 0) + n;
    RES.push({ r, n, tot, parte }); }
  const GAS = [], OTR = [];
  for (const t of S.t.transactions) { if (t.date < f || t.date >= tx || !set.has(t.property_code)) continue; const x = dep[t.property_code], m = Number(t.amount) || 0;
    if (t.kind === 'gasto') { if (EXC.includes(t.category)) continue; x.gastos += m; const c = catLabel(t); x.cat[c] = (x.cat[c] || 0) + m; GAS.push(t); }
    else if (t.category !== 'Ingreso por reserva') { x.otros += m; OTR.push(t); } }
  for (const x of Object.values(dep)) { const a = A.deps.find(d => d.code === x.code) || {};
    x.noches = a.noches || 0; x.disp = a.disp || 0; x.pg = C.gestion[x.code] ?? C.gestion.def; x.gestion = x.ingRes * x.pg / 100;
    const tl = C.limpieza[x.code]; x.tl = tl; if (tl == null && x.nSal) x.sinTarifa = true; x.limp = x.nSal * (Number(tl) || 0);
    x.cajon = (C.cajon_ing.codes || []).includes(x.code) ? C.cajon_ing.monto * frac : 0; x.renta = (C.cajon_renta.codes || []).includes(x.code) ? C.cajon_renta.monto * frac : 0;
    x.ing = x.ingRes + x.otros + x.cajon; x.egr = x.gestion + x.limp + x.gastos + x.renta; x.antes = x.ing - x.egr; x.iva = x.antes > 0 ? x.antes * C.iva / 100 : 0; x.neta = x.antes - x.iva; }
  const deps = Object.values(dep), sum = k => deps.reduce((n, x) => n + (x[k] || 0), 0), cat = {};
  deps.forEach(x => Object.entries(x.cat).forEach(([c, m]) => { cat[c] = (cat[c] || 0) + m; }));
  const T = { ingRes: sum('ingRes'), otros: sum('otros'), cajon: sum('cajon'), ing: sum('ing'), gestion: sum('gestion'), limp: sum('limp'), nSal: sum('nSal'), gastos: sum('gastos'), renta: sum('renta'), egr: sum('egr'), antes: sum('antes'), iva: sum('iva'), neta: sum('neta'),
    noches: sum('noches'), disp: sum('disp'), nochesM: sum('nochesM'), sinMonto: sum('sinMonto'), cat: Object.entries(cat).sort((a, b) => b[1] - a[1]) };
  T.ocup = plPct(T.noches, T.disp); T.tarifa = T.nochesM ? T.ingRes / T.nochesM : null; T.revpar = T.disp ? T.ingRes / T.disp : null; T.estancia = RES.length ? RES.reduce((n, x) => n + x.tot, 0) / RES.length : 0;
  T.cal = cal.length ? cal.reduce((a, b) => a + b, 0) / cal.length : null; T.nCal = cal.length; T.canal = Object.entries(canal).sort((a, b) => b[1] - a[1]); T.sinFoto = GAS.filter(t => !(t.photos || []).length).length;
  return { f, tx, codes, deps, T, RES: RES.sort((a, b) => a.r.checkin.localeCompare(b.r.checkin)), GAS: GAS.sort((a, b) => a.date.localeCompare(b.date)), OTR, C, sinTarifa: deps.filter(x => x.sinTarifa).map(x => x.code) };
}
function plDatos() { const [f, t] = plRango(), tx = add(t, 1), codes = stCodes(), n = stDias(f, tx), P = plCalc(f, tx, codes), B = plCalc(add(f, -n), f, codes); return { f, t, tx, codes, P, B, n }; }
// Renglones del estado de resultados: [etiqueta, monto, tipo] (tipo: 'h' encabezado, 't' total, '' renglón, 's' subtotal)
function plRenglones(P) { const T = P.T, R = [['Ingresos', null, 'h'], ['Ingresos por reservas (por noches ocupadas en el periodo)', T.ingRes, '']];
  if (T.cajon) R.push(['Renta de cajón de estacionamiento', T.cajon, '']); if (T.otros) R.push(['Otros ingresos', T.otros, '']);
  R.push(['Total de ingresos', T.ing, 's'], ['Gastos', null, 'h'], ['Gestión administrativa MGM', -T.gestion, ''], [`Limpieza y lavandería (${T.nSal} ${T.nSal === 1 ? 'salida' : 'salidas'})`, -T.limp, '']);
  T.cat.forEach(([c, m]) => R.push([c, -m, ''])); if (T.renta) R.push(['Renta de cajón de estacionamiento', -T.renta, '']);
  R.push(['Total de gastos', -T.egr, 's'], ['Utilidad antes de impuestos', T.antes, 't'], [`IVA a cargo del dueño (${P.C.iva}%)`, -T.iva, ''], ['Utilidad neta', T.neta, 't']); return R; }
// Lectura del periodo: explica los números y de dónde salen, sin recomendar.
function plLectura(D) { const { P, B, f, t, n } = D, T = P.T, U = B.T, L = [], dv = (a, b) => b ? Math.round((a - b) / Math.abs(b) * 100) : null, sg = v => (v > 0 ? 'subió ' : 'bajó ') + Math.abs(v) + '%';
  L.push(`Del ${fmt(f)} al ${fmt(t)} (${n} ${n === 1 ? 'día' : 'días'}), ${stTitulo().toLowerCase()} registró ingresos por ${money(Math.round(T.ing))}: ${money(Math.round(T.ingRes))} de reservas${T.cajon + T.otros ? ' y ' + money(Math.round(T.cajon + T.otros)) + ' de otros ingresos' : ''}. Se ocuparon ${T.noches} de ${T.disp} noches disponibles, una ocupación de ${T.ocup}%.`);
  if (T.tarifa != null) L.push(`La tarifa promedio fue de ${money(Math.round(T.tarifa))} por noche ocupada y el ingreso por noche disponible (RevPAR) de ${money(Math.round(T.revpar))}. La estancia promedio fue de ${Math.round(T.estancia * 10) / 10} noches.`);
  const top = [['Gestión administrativa MGM', T.gestion], ['Limpieza y lavandería', T.limp], ...T.cat, ...(T.renta ? [['Renta de cajón', T.renta]] : [])].filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  L.push(`Los gastos sumaron ${money(Math.round(T.egr))}, equivalentes al ${plPct(T.egr, T.ing)}% del ingreso.${top.length ? ' Los rubros de mayor peso fueron ' + top.map(x => `${x[0].toLowerCase()} (${money(Math.round(x[1]))}, ${plPct(x[1], T.egr)}% del gasto)`).join(', ') + '.' : ''}`);
  L.push(`La gestión administrativa se calcula como porcentaje de los ingresos por reservas de cada depa, y la limpieza y lavandería como el número de salidas del periodo por la tarifa acordada de cada depa; por eso ambos rubros se mueven junto con la ocupación.`);
  L.push(`La utilidad antes de impuestos fue de ${money(Math.round(T.antes))}, un margen de ${plPct(T.antes, T.ing)}% sobre el ingreso. Después del IVA a cargo del dueño (${P.C.iva}%), la utilidad neta fue de ${money(Math.round(T.neta))}.`);
  if (U.ing || U.egr) { const di = dv(T.ing, U.ing), dg = dv(T.egr, U.egr); let x = `Contra el periodo anterior de igual duración (${fmt(B.f)} al ${fmt(add(B.tx, -1))}), `;
    x += (di == null ? 'no hay ingreso previo para comparar' : 'el ingreso ' + sg(di)) + (dg == null ? '' : ' y el gasto ' + sg(dg)) + '.';
    if (di != null) x += ` En noches ocupadas pasó de ${U.noches} a ${T.noches}` + (T.tarifa != null && U.tarifa != null ? ` y en tarifa promedio de ${money(Math.round(U.tarifa))} a ${money(Math.round(T.tarifa))}; el cambio en el ingreso proviene de la combinación de esos dos factores.` : '.');
    L.push(x); } else L.push('No hay movimientos en el periodo anterior de igual duración, así que no se presenta comparativo.');
  if (T.canal.length) L.push('Por canal, las noches ocupadas se repartieron así: ' + T.canal.map(([c, v]) => `${c} ${plPct(v, T.canal.reduce((a, b) => a + b[1], 0))}%`).join(', ') + '.' + (T.cal != null ? ` La calificación promedio de las ${T.nCal} reservas calificadas fue de ${Math.round(T.cal * 100) / 100}.` : ''));
  const av = []; if (T.sinMonto) av.push(`${T.sinMonto} ${T.sinMonto === 1 ? 'reserva del periodo no tiene' : 'reservas del periodo no tienen'} monto capturado, por lo que el ingreso mostrado es menor al real`);
  if (P.sinTarifa.length) av.push(`falta la tarifa de limpieza y lavandería de ${P.sinTarifa.join(', ')}, así que sus salidas se cuentan en $0`); if (T.sinFoto) av.push(`${T.sinFoto} de ${P.GAS.length} gastos no tienen comprobante adjunto`);
  if (av.length) L.push('Alcance de la información: ' + av.join('; ') + '.'); return L; }
VIEWS.pnl = () => {
  if (!isSuper()) return '<div class="empty">Solo María y Paco.</div>';
  const tab = S.plTab || 'pl'; let h = `<div class="seg" style="margin-bottom:10px;display:flex"><button class="sp ${tab === 'pl' ? 'on' : ''}" data-pltab="pl">Estado de resultados</button><button class="sp ${tab === 'cfg' ? 'on' : ''}" data-pltab="cfg">Supuestos y respuestas</button></div>`;
  if (tab === 'cfg') { const C = plCfg(); return h + `<div class="card"><b>Supuestos que usa el P&L</b><div class="m" style="margin-top:6px">Gestión MGM: ${C.gestion.def}% de los ingresos por reservas${Object.entries(C.gestion).filter(x => x[0] !== 'def').map(([c, p]) => ` · ${esc(c)} ${p}%`).join('')}.</div><div class="m" style="margin-top:4px">Limpieza y lavandería por salida: ${Object.entries(C.limpieza).map(([c, p]) => `${esc(c)} ${money(p)}`).join(' · ') || 'sin tarifas'}.</div><div class="m" style="margin-top:4px">Cajón: reciben ${money(C.cajon_ing.monto)} al mes ${(C.cajon_ing.codes || []).join(', ') || '—'}; pagan ${money(C.cajon_renta.monto)} al mes ${(C.cajon_renta.codes || []).join(', ') || '—'}.</div><div class="m" style="margin-top:4px">IVA a cargo del dueño: ${C.iva}% de la utilidad antes de impuestos. El ingreso de cada reserva se reparte por noches ocupadas en cada mes.</div></div>` + pnlForm(); }
  const D = plDatos(), { P, B, f, t } = D, T = P.T, U = B.T, G = stGrupos(), sel = stSel(), torres = [...new Set(props().map(p => p.building || 'Sin edificio'))].sort(), o = (tp, v, l) => `<option value="${tp}|${esc(v)}" ${sel.tipo === tp && sel.val === v ? 'selected' : ''}>${esc(l)}</option>`;
  const hoy = today(), ym = hoy.slice(0, 7), rap = [['Este mes', ym + '-01', hoy], ['Mes pasado', stMes(ym, -1) + '-01', add(ym + '-01', -1)], ['3 meses', stMes(ym, -2) + '-01', hoy], ['Este año', ym.slice(0, 4) + '-01-01', hoy]];
  h += `<div class="stfix"><select data-stsel="1" style="width:100%"><option value="todo|">Toda la gestión (${props().length} depas)</option><optgroup label="Torre">${torres.map(x => o('torre', x, x)).join('')}</optgroup>${Object.keys(G).length ? `<optgroup label="Grupo">${Object.keys(G).sort().map(g => o('grupo', g, g)).join('')}</optgroup>` : ''}<optgroup label="Depa">${props().map(p => o('depa', p.code, p.code)).join('')}</optgroup></select>
    <div class="row" style="margin-top:8px;gap:6px"><input type="date" data-plf="1" value="${f}" class="sp" aria-label="Desde"><span class="m">a</span><input type="date" data-plt="1" value="${t}" class="sp" aria-label="Hasta"></div>
    <div class="row" style="margin-top:8px;gap:6px">${rap.map(([l, a, b]) => `<button class="chip ${f === a && t === b ? 'pri' : ''}" data-plr="${a}|${b}">${l}</button>`).join('')}</div></div>`;
  const k = (c, v, l, x) => `<div class="kpi ${c ? 'st-k-' + c : ''}"><div class="v">${v}</div><div class="l">${l}</div>${x ? `<div class="m" style="font-size:11px">${x}</div>` : ''}</div>`, dl = (a, b) => b ? (a >= b ? '▲ ' : '▼ ') + Math.abs(Math.round((a - b) / Math.abs(b) * 100)) + '% vs anterior' : '';
  h += `<div class="kpis" style="grid-template-columns:repeat(2,1fr);margin-top:10px">` + k('', money(Math.round(T.ing)), 'Ingresos', dl(T.ing, U.ing)) + k('', money(Math.round(T.egr)), 'Gastos', dl(T.egr, U.egr)) + k(T.antes >= 0 ? 'ok' : 'mal', money(Math.round(T.antes)), 'Utilidad antes de impuestos', plPct(T.antes, T.ing) + '% de margen') + k(T.neta >= 0 ? 'ok' : 'mal', money(Math.round(T.neta)), 'Utilidad neta', dl(T.neta, U.neta))
    + k('', T.ocup + '%', 'Ocupación', T.noches + ' de ' + T.disp + ' noches') + k('', T.tarifa == null ? '—' : money(Math.round(T.tarifa)), 'Tarifa promedio por noche', '') + k('', T.revpar == null ? '—' : money(Math.round(T.revpar)), 'RevPAR', 'ingreso por noche disponible') + k('', (Math.round(T.estancia * 10) / 10) + ' noches', 'Estancia promedio', P.RES.length + ' reservas') + '</div>';
  h += `<div class="row" style="margin:6px 0 2px;gap:6px"><button class="pri sp" data-plpdf="1">PDF con comprobantes</button>${S.plPdf ? `<button data-pldl="1">Descargar</button><button data-plshare="1">Enviar</button>` : ''}</div>${S.plPdf ? `<div class="m">Listo: ${esc(S.plPdf.name)}. «Enviar» abre correo, WhatsApp o lo que elijas con el PDF adjunto.</div>` : ''}`;
  h += `<h2>Estado de resultados · ${esc(stTitulo())}</h2><div class="card"><table class="pltab">${plRenglones(P).map(([l, m, tp]) => tp === 'h' ? `<tr class="h"><td colspan="3">${l}</td></tr>` : `<tr class="${tp}"><td>${esc(l)}</td><td class="r">${m < 0 ? '(' + money(Math.round(-m)) + ')' : money(Math.round(m))}</td><td class="r m">${T.ing ? plPct(Math.abs(m), T.ing) + '%' : ''}</td></tr>`).join('')}</table><div class="m" style="margin-top:6px">La tercera columna es el porcentaje sobre el ingreso total. Los gastos van entre paréntesis.</div></div>`;
  h += `<h2>Lectura del periodo</h2><div class="card">${plLectura(D).map(x => `<p style="margin:0 0 8px;line-height:1.45">${esc(x)}</p>`).join('')}</div>`;
  const filaDep = () => `<div style="overflow-x:auto"><table class="pltab"><tr class="h"><td>Depa</td><td class="r">Ingreso</td><td class="r">Gasto</td><td class="r">Neta</td><td class="r">Ocup.</td></tr>${P.deps.slice().sort((a, b) => b.neta - a.neta).map(x => `<tr><td><button class="lnk" data-stgo="depa|${esc(x.code)}">${esc(x.code)}</button></td><td class="r">${money(Math.round(x.ing))}</td><td class="r">${money(Math.round(x.egr))}</td><td class="r" style="color:${x.neta >= 0 ? '#1f6b4a' : '#a3301f'}"><b>${money(Math.round(x.neta))}</b></td><td class="r">${plPct(x.noches, x.disp)}%</td></tr>`).join('')}</table></div>`;
  const filaRes = () => P.RES.length ? `<div class="list">${P.RES.map(x => `<div class="it"><div class="sp"><div><b>${esc(x.r.property_code)}</b> · ${esc(pnom(x.r.guest))}</div><div class="m">${fmt(x.r.checkin)} a ${fmt(x.r.checkout)} · ${x.n} de ${x.tot} noches en el periodo</div></div><b>${x.parte ? money(Math.round(x.parte)) : '<span class="b cambio">SIN MONTO</span>'}</b></div>`).join('')}</div>` : '<div class="empty">Sin reservas en el periodo.</div>';
  const filaGas = () => P.GAS.length ? `<div class="list">${P.GAS.map(x => `<div class="it"><div class="sp"><div><b>${esc(x.property_code)}</b> · ${esc(catLabel(x))}</div><div class="m">${fmt(x.date)}${x.description ? ' · ' + esc(x.description) : ''}</div></div>${(x.photos || []).length ? '<span class="b alta">TICKET</span>' : '<span class="b n">SIN TICKET</span>'}<b style="min-width:76px;text-align:right">${money(Math.round(x.amount))}</b></div>`).join('')}</div>` : '<div class="empty">Sin gastos en el periodo.</div>';
  h += `<h2>Detalle</h2><div class="card aclist">${P.deps.length > 1 ? acRow('pl:depas', { tit: 'Por depa', sub: 'Toca un depa para ver solo el suyo', pills: acPill(P.deps.length + ' DEPAS', ''), body: filaDep }) : ''}${acRow('pl:res', { tit: 'Reservas del periodo', sub: 'Ingreso repartido por noches dentro del periodo', pills: T.sinMonto ? acPill(T.sinMonto + ' SIN MONTO', 'med') : acPill(P.RES.length + ' RESERVAS', ''), body: filaRes })}${acRow('pl:gas', { tit: 'Gastos y comprobantes', sub: 'Los tickets van completos en el anexo del PDF', pills: T.sinFoto ? acPill(T.sinFoto + ' SIN TICKET', 'med') : acPill(P.GAS.length + ' GASTOS', ''), body: filaGas })}</div>`;
  return h + `<div class="m" style="margin-top:10px">Ingreso de reservas = pago neto de Airbnb de cada reserva, repartido por noches. No se incluyen la nómina de limpieza ni la lavandería reales: al dueño se le cobra la tarifa acordada por salida.</div>`;
};
async function plImg(path) { try { const url = await photoSrc(path); if (!url) return null; const im = await new Promise((ok, no) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = no; i.src = url; });
  const mx = 1100, e = Math.min(1, mx / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * e); c.height = Math.round(im.height * e); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return { d: c.toDataURL('image/jpeg', 0.7), w: c.width, h: c.height }; } catch (_) { return null; } }
async function plPdf() {
  toast('Armando el P&L…'); await stCargaPdf();
  const D = plDatos(), { P, f, t } = D, T = P.T, doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' }), W = 612, H = 792, mx = 40, VERDE = [47, 79, 67], GR = [111, 116, 117], INK = [35, 39, 42];
  const lim = x => String(x).replace(/→/g, 'a').replace(/−/g, '-').replace(/[▲▼]/g, ''); let y = 0; const m = n => money(Math.round(n)), salto = n => { if (y + n > H - 50) { doc.addPage(); y = 50; } };
  const txt = (s, x, yy, o = {}) => { doc.setFont('helvetica', o.b ? 'bold' : 'normal'); doc.setFontSize(o.s || 10); doc.setTextColor(...(o.c || INK)); doc.text(Array.isArray(s) ? s : lim(s), x, yy, { align: o.a || 'left', maxWidth: o.w }); };
  const h2 = s => { salto(44); y += 26; txt(s.toUpperCase(), mx, y, { b: 1, s: 9, c: GR }); y += 6; doc.setDrawColor(230, 226, 218); doc.line(mx, y, W - mx, y); y += 16; };
  doc.setFillColor(...VERDE); doc.rect(0, 0, W, 86, 'F'); txt('MGM Housing Management', mx, 36, { b: 1, s: 18, c: [255, 255, 255] }); txt('Estado de resultados · ' + stTitulo() + ' · ' + P.codes.length + ' depa' + (P.codes.length === 1 ? '' : 's'), mx, 56, { s: 11, c: [255, 255, 255] });
  txt(fmt(f) + ' – ' + fmt(t) + ' ' + t.slice(0, 4), mx, 72, { s: 9, c: [220, 232, 226] }); txt('Generado ' + fmt(today()), W - mx, 72, { s: 9, c: [220, 232, 226], a: 'right' }); y = 86;
  h2('Indicadores'); const K = [[m(T.ing), 'Ingresos'], [m(T.egr), 'Gastos'], [m(T.antes), 'Utilidad antes de impuestos'], [m(T.neta), 'Utilidad neta'], [T.ocup + '%', 'Ocupación · ' + T.noches + ' de ' + T.disp + ' noches'], [T.tarifa == null ? '—' : m(T.tarifa), 'Tarifa promedio por noche'], [T.revpar == null ? '—' : m(T.revpar), 'RevPAR'], [(Math.round(T.estancia * 10) / 10) + ' noches', 'Estancia promedio']], kw = (W - 2 * mx - 30) / 4;
  K.forEach((x, i) => { const cx = mx + (i % 4) * (kw + 10), cy = y + Math.floor(i / 4) * 60; doc.setDrawColor(230, 226, 218); doc.setFillColor(255, 255, 255); doc.roundedRect(cx, cy, kw, 50, 5, 5, 'FD'); txt(x[0], cx + 10, cy + 22, { b: 1, s: 14 }); txt(x[1], cx + 10, cy + 38, { s: 7.5, c: GR, w: kw - 16 }); }); y += 116;
  h2('Estado de resultados'); for (const [l, mo, tp] of plRenglones(P)) { salto(18); if (tp === 'h') { y += 4; txt(l, mx, y, { b: 1, s: 10, c: VERDE }); y += 15; continue; } if (tp) { doc.setDrawColor(200, 200, 196); doc.line(mx, y - 10, W - mx, y - 10); }
    txt(l, mx + (tp ? 0 : 10), y, { b: !!tp, w: 380 }); txt(mo < 0 ? '(' + m(-mo) + ')' : m(mo), W - mx - 60, y, { b: !!tp, a: 'right' }); txt(T.ing ? plPct(Math.abs(mo), T.ing) + '%' : '', W - mx, y, { a: 'right', c: GR, s: 9 }); y += tp ? 18 : 15; }
  txt('La última columna es el porcentaje sobre el ingreso total. Los gastos van entre paréntesis.', mx, y + 2, { s: 8, c: GR }); y += 10;
  h2('Lectura del periodo'); for (const p of plLectura(D)) { const L = doc.splitTextToSize(lim(p), W - 2 * mx); salto(L.length * 13 + 8); txt(L, mx, y); y += L.length * 13 + 8; }
  const tabla = (tit, cols, rows) => { h2(tit); const xs = cols.map(c => c[1]); const cab = () => { cols.forEach((c, i) => txt(c[0], xs[i], y, { b: 1, s: 8, c: GR, a: c[2] })); y += 13; }; cab(); for (const r of rows) { if (y + 14 > H - 50) { doc.addPage(); y = 50; cab(); } r.forEach((v, i) => txt(String(v), xs[i], y, { s: 9, a: cols[i][2], w: cols[i][3] })); y += 13; } if (!rows.length) { txt('Sin movimientos en el periodo.', mx, y, { c: GR }); y += 13; } };
  if (P.deps.length > 1) tabla('Por depa', [['Depa', mx], ['Torre', mx + 110], ['Ingreso', mx + 300, 'right'], ['Gasto', mx + 380, 'right'], ['Utilidad neta', mx + 470, 'right'], ['Ocup.', W - mx, 'right']], P.deps.slice().sort((a, b) => b.neta - a.neta).map(x => [x.code, x.torre, m(x.ing), m(x.egr), m(x.neta), plPct(x.noches, x.disp) + '%']));
  tabla('Reservas del periodo', [['Depa', mx], ['Huésped', mx + 90], ['Entrada', mx + 215], ['Salida', mx + 290], ['Noches', mx + 400, 'right'], ['Ingreso del periodo', W - mx, 'right']], P.RES.map(x => [x.r.property_code, pnom(x.r.guest), fmt(x.r.checkin), fmt(x.r.checkout), x.n + ' de ' + x.tot, x.parte ? m(x.parte) : 'sin monto']));
  let nA = 0; const anexo = []; tabla('Gastos del periodo', [['Fecha', mx], ['Depa', mx + 62], ['Concepto', mx + 150], ['Anexo', mx + 430, 'right'], ['Monto', W - mx, 'right']], P.GAS.map(x => { const ph = x.photos || []; let ref = 'sin ticket'; if (ph.length) { nA++; ref = 'A' + nA; anexo.push({ ref, x, ph }); } return [fmt(x.date), x.property_code, lim(catLabel(x) + (x.description ? ' · ' + x.description : '')).slice(0, 52), ref, m(x.amount)]; }));
  h2('Supuestos del cálculo'); const C = P.C; for (const p of [`Ingreso por reservas: pago neto de Airbnb de cada reserva, repartido por noches ocupadas dentro del periodo.`, `Gestión administrativa MGM: ${C.gestion.def}% de los ingresos por reservas${Object.entries(C.gestion).filter(x => x[0] !== 'def' && P.codes.includes(x[0])).map(([c, p]) => `; ${c} ${p}%`).join('')}.`, `Limpieza y lavandería: tarifa acordada por salida de cada depa. No se incluyen la nómina de limpieza ni la lavandería reales.`, `Cajones: renta de $${C.cajon_ing.monto} al mes para los depas que la reciben y $${C.cajon_renta.monto} al mes para los que la pagan, en proporción a los días del periodo.`, `IVA a cargo del dueño: ${C.iva}% de la utilidad antes de impuestos de cada depa.`]) { const L = doc.splitTextToSize(lim('• ' + p), W - 2 * mx); salto(L.length * 12 + 4); txt(L, mx, y, { s: 9 }); y += L.length * 12 + 4; }
  if (anexo.length) { doc.addPage(); y = 50; txt('ANEXO · COMPROBANTES', mx, y, { b: 1, s: 12, c: VERDE }); y += 8; txt(`${anexo.length} gastos con comprobante. La clave (A1, A2…) corresponde a la columna «Anexo» de la tabla de gastos.`, mx, y + 10, { s: 9, c: GR }); y += 26;
    for (const a of anexo) for (const [i, ph] of a.ph.entries()) { const im = await plImg(ph), bw = W - 2 * mx, bh = 300; if (y + bh + 34 > H - 40) { doc.addPage(); y = 50; }
      txt(`${a.ref}${a.ph.length > 1 ? '.' + (i + 1) : ''} · ${fmt(a.x.date)} · ${a.x.property_code} · ${lim(catLabel(a.x))} · ${m(a.x.amount)}`, mx, y, { b: 1, s: 9 }); y += 8;
      if (im) { const e = Math.min(bw / im.w, bh / im.h), w = im.w * e, hh = im.h * e; doc.addImage(im.d, 'JPEG', mx, y, w, hh); y += hh + 22; } else { txt('No se pudo cargar la imagen de este comprobante.', mx, y + 12, { s: 9, c: GR }); y += 30; } } }
  const np = doc.getNumberOfPages(); for (let i = 1; i <= np; i++) { doc.setPage(i); txt('MGM Housing Management · Estado de resultados · ' + stTitulo(), mx, H - 24, { s: 8, c: GR }); txt(i + ' de ' + np, W - mx, H - 24, { s: 8, c: GR, a: 'right' }); }
  const name = 'PL-' + stTitulo().replace(/[^\wáéíóúñ]+/gi, '-') + '-' + f + '-a-' + t + '.pdf'; S.plPdf = { name, blob: doc.output('blob') }; render(); toast('P&L listo');
}

// ---------- GESTIÓN DE OCUPACIÓN (v1: noches libres con los datos de la app) ----------
function ocDatos(dias) {
  const by = {}; activas().forEach(r => { (by[r.property_code] ||= []).push(r); });
  const ds = Array.from({ length: dias }, (_, i) => add(today(), i));
  return props().map(p => {
    const rs = by[p.code] || [], libres = ds.filter(d => !rs.some(r => r.checkin <= d && d < r.checkout) && !bloqueado(p.code, d));
    const tramos = []; libres.forEach(d => { const u = tramos[tramos.length - 1]; if (u && add(u[1], 1) === d) u[1] = d; else tramos.push([d, d]); });
    return { p, libres, tramos };
  });
}
// Solo quien está en el supuesto precio_decide (María) puede decidir precios; los demás superadmin solo consultan.
const ocDecide = () => !!S.me && (S.me.email || '').toLowerCase() === String(setting('precio_decide', '') || '').toLowerCase();
const ocMon = (n, mon) => n == null ? '—' : (mon === 'USD' ? 'US$' : '$') + Math.round(n).toLocaleString('es-MX');
const ocFecha = ts => { const d = new Date(ts); return d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }); };
// Última decisión por idea. Pendiente = sin decisión, revertida, o "después" de un día anterior.
function ocEstado() { const u = {}; S.t.precio_decisiones.slice().sort((a, b) => String(a.at).localeCompare(String(b.at))).forEach(x => { u[x.idea_id] = x; }); return u; }
function ocPend() { const u = ocEstado(); return S.t.pl_ideas.filter(i => i.vigente !== false).filter(i => { const x = u[i.id]; return !x || x.estado === 'revertida' || (x.estado === 'despues' && String(x.at).slice(0, 10) < new Date().toISOString().slice(0, 10)); }).sort((a, b) => (a.prioridad || 50) - (b.prioridad || 50)); }
const ocAuto = i => !!i && i.antes != null && i.nuevo != null && String(i.idea_id || i.id || '').startsWith('base-'); // precio base: lo aplica el sistema
const OC_PASADA = 'en la siguiente pasada (cada hora, de 8 am a 10 pm)';
function ocGuarda(row, msg) { const r = { id: uid(), por: S.me.email, at: new Date().toISOString(), ...row }; S.t.precio_decisiones.push(r); render(); return done(DB.insert('precio_decisiones', r), 'precio_decisiones', msg, 'alta'); }
const OC_BANDAS = [['Menos de $1,200', 0, 1200], ['$1,200 a $1,499', 1200, 1500], ['$1,500 a $2,499', 1500, 2500], ['$2,500 o más', 2500, 1e9]];
const ocBanda = l => l.moneda === 'USD' ? 3 : OC_BANDAS.findIndex(b => l.base >= b[1] && l.base < b[2]);
const ocCalor = d => d <= -15 ? ['#f3c1b8', '#7a1f12'] : d <= -5 ? ['#fbe6e2', '#a3301f'] : d < 5 ? ['#f1eee7', '#23272a'] : d < 20 ? ['#e3efe8', '#1f6b4a'] : ['#bfe0cd', '#14503a'];
// La liga al motor de precios vive en la base (idea.liga o settings.motor_url), no en el código.
const ocLiga = i => (i && i.liga) || setting('motor_url', '#');
function ocModal() {
  const R = S.ocRev; if (!R) return ''; const i = S.t.pl_ideas.find(x => x.id === R.id); if (!i) return '';
  const precio = i.antes != null && i.nuevo != null, pc = precio ? Math.round((i.nuevo - i.antes) / i.antes * 100) : 0, fila = (k, v) => `<div class="it"><span class="m sp">${k}</span><b>${v}</b></div>`;
  let h = `<div class="sheet" data-ocx="1"><div class="in ocm"><h3>${esc(i.titulo)}</h3><div class="m" style="margin-bottom:8px">${esc(i.tipo)} · fuente: Motor de precios MGM</div>`;
  if (R.paso === 2) {
    h += `<div class="card" style="border:2px solid var(--acc)"><b>Confirma tu decisión</b><div style="margin:6px 0">Vas a aprobar: <b>${esc(i.code)}</b>, precio base de <b>${ocMon(i.antes, i.moneda)}</b> a <b>${ocMon(i.nuevo, i.moneda)}</b> (${pc > 0 ? 'sube' : 'baja'} ${Math.abs(pc)}%).</div><div class="m">El precio base mueve todas las noches futuras de este depa.</div></div>
      <div class="card"><b>Puedes dar reversa</b><div class="m" style="margin-top:4px">La decisión queda en «Historial y deshacer» con el precio anterior (${ocMon(i.antes, i.moneda)}). Con «Deshacer» el sistema lo regresa.</div></div>
      <div class="m" style="margin:8px 2px">Al confirmar, el sistema aplica el cambio en el Motor de precios MGM ${OC_PASADA} y lo deja registrado. Solo se ejecuta lo que tú confirmas aquí.</div>
      <div class="row" style="margin-top:10px"><button class="pri sp" data-ocact="confirmar">Sí, confirmo</button><button class="sp" data-ocact="volver">Regresar</button></div>`;
  } else if (R.paso === 3) {
    h += `<div class="card" style="border:2px solid #2e7d4f"><b>Orden registrada</b><div class="m" style="margin-top:4px">El sistema cambiará el precio base de ${esc(i.code)} a <b>${ocMon(i.nuevo, i.moneda)}</b> ${OC_PASADA}. Cuando quede, la verás como APLICADA en Historial; ahí mismo puedes deshacerla.</div></div>
      <div class="row" style="margin-top:10px"><button class="pri sp" data-ocact="cerrar">Listo</button><a class="btn sp" href="${esc(ocLiga(i))}" target="_blank" rel="noopener">Abrir Motor de precios MGM</a></div>`;
  } else {
    h += `<div class="card list">${precio ? fila('Precio base hoy', ocMon(i.antes, i.moneda)) + fila('Precio sugerido', ocMon(i.nuevo, i.moneda)) + fila('Cambio', (pc > 0 ? 'Sube ' : 'Baja ') + Math.abs(pc) + '%') : ''}${i.vence ? fila('La sugerencia vence', fmt(i.vence)) : ''}</div><div style="margin:8px 2px">${esc(i.detalle || '')}</div>`;
    if (!ocDecide()) h += `<div class="warn">Solo María puede decidir cambios de precio. Tú puedes consultar.</div><div class="row" style="margin-top:10px"><a class="btn sp" href="${esc(ocLiga(i))}" target="_blank" rel="noopener">Abrir Motor de precios MGM</a><button class="sp" data-ocact="cerrar">Cerrar</button></div>`;
    else h += (precio ? `<div class="row" style="margin-top:10px"><button class="pri sp" data-ocact="aprobar">Aprobar cambio</button></div>` : `<div class="row" style="margin-top:10px"><a class="btn sp" href="${esc(ocLiga(i))}" target="_blank" rel="noopener">Abrir Motor de precios MGM</a><button class="pri sp" data-ocact="atendida">Marcar atendida</button></div>`)
      + `<div class="row" style="margin-top:8px"><button class="sp" data-ocact="despues">Después</button><button class="sp" data-ocact="ignorar" style="color:var(--baja)">Ignorar</button></div><div class="m" style="text-align:center;margin-top:6px">«Después» la regresa mañana. «Ignorar» la quita; se puede reactivar en Historial.</div><div class="row" style="margin-top:8px"><button class="sp" data-ocact="cerrar">Cerrar</button></div>`;
  }
  return h + '</div></div>';
}
VIEWS.ocupacion = () => {
  if (!isSuper()) return '<div class="empty">Solo María y Paco.</div>';
  const tab = S.ocTab || 'res', T = S.ocT || '', D = S.t.precio_decisiones, vivas = D.filter(x => ['aprobada', 'aplicada'].includes(x.estado) && ocEstado()[x.idea_id] === x);
  const Lall = S.t.pl_listings.filter(l => l.sync !== false && l.occ30 != null), L = Lall.filter(l => !T || l.torre === T), torres = [...new Set(Lall.map(l => l.torre))];
  let h = `<div class="seg" style="margin-bottom:10px;display:flex"><button class="sp ${tab === 'res' ? 'on' : ''}" data-octab="res">Resumen</button><button class="sp ${tab === 'his' ? 'on' : ''}" data-octab="his">Historial y deshacer${vivas.length ? ' (' + vivas.length + ')' : ''}</button></div>`;
  if (!Lall.length) return h + '<div class="card empty">Aún no hay datos del Motor de precios MGM cargados.</div>' + ocLibres();
  const act = Lall.map(l => l.actualizado).sort().pop();
  if (tab === 'his') {
    h += `<div class="m" style="margin:0 2px 10px">Cada orden guarda el precio anterior. El sistema aplica en el Motor de precios MGM lo que confirmas y, con «Deshacer», regresa el precio anterior ${OC_PASADA}. ${ocDecide() ? '' : 'Solo María puede deshacer.'}</div>`;
    const EST = { aprobada: ['APROBADA · FALTA APLICAR', 'cambio'], aplicada: ['APLICADA', 'alta'], despues: ['DESPUÉS', 'n'], ignorada: ['IGNORADA', 'n'], revertida: ['REVERTIDA', 'baja'] }, ult = ocEstado();
    const rows = D.slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const ejec = x => { const j = x.ejec || {}; return x.pendiente === 'aplicar' ? '<div class="m" style="margin-top:6px">⏳ El sistema la aplica ' + OC_PASADA + '.</div>' : x.pendiente === 'revertir' ? '' : x.ejec_at && j.ok ? '<div class="m" style="margin-top:6px">✅ ' + (j.accion === 'revertir' ? 'Precio regresado' : 'Aplicada') + ' por el sistema · ' + ocFecha(x.ejec_at) + '</div>' : j.error ? '<div class="warn" style="margin-top:6px">No se ejecutó: ' + esc(j.error) + '</div>' : ''; };
    return h + (rows.length ? rows.map(x => { const viva = ult[x.idea_id] === x, e = x.pendiente === 'aplicar' ? ['APROBADA · EN COLA', 'cambio'] : x.pendiente === 'revertir' ? ['REVERSA EN COLA', 'cambio'] : x.estado === 'aprobada' && !viva && !x.ejec_at ? ['APROBADA · NO SE APLICÓ', 'n'] : EST[x.estado] || [x.estado, 'n'], precio = x.antes != null && x.nuevo != null, idea = S.t.pl_ideas.find(i => i.id === x.idea_id);
      return `<div class="card"><div class="row"><div class="sp"><div><b>${esc(x.titulo || x.code || '')}</b></div><div class="m">${precio ? ocMon(x.antes, x.moneda) + ' → ' + ocMon(x.nuevo, x.moneda) + ' · ' : ''}${esc((S.t.app_users.find(u => u.email === x.por) || {}).name || x.por || '')} · ${ocFecha(x.at)}</div></div><span class="b ${e[1]}">${e[0]}</span></div>${x.nota ? `<div class="m" style="margin-top:6px">${esc(x.nota)}</div>` : ''}${ejec(x)}
        ${viva && ocDecide() && x.estado !== 'revertida' ? `<div class="row" style="margin-top:8px">${x.estado === 'aprobada' && precio ? `<a class="btn" href="${esc(ocLiga(idea))}" target="_blank" rel="noopener">Abrir Motor de precios MGM</a><button data-ocmarca="${x.id}">La apliqué a mano</button>` : ''}<span class="sp"></span><button data-ocdes="${x.id}">${['ignorada', 'despues'].includes(x.estado) ? 'Reactivar' : 'Deshacer'}</button></div>` : ''}</div>`; }).join('') : '<div class="card empty">Todavía no hay decisiones registradas.</div>');
  }
  h += `<div class="row" style="margin-bottom:8px"><span class="m sp">Motor de precios MGM al ${ocFecha(act)}</span><select data-oct="1"><option value="">Todas las torres</option>${torres.map(t => `<option ${t === T ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
  // --- tú contra la zona ---
  const avg = (a, f) => a.length ? a.reduce((x, y) => x + (+f(y) || 0), 0) / a.length : 0, o = Math.round(avg(L, l => l.occ30)), oz = Math.round(avg(L, l => l.occ30z));
  const M = S.t.pl_mensual.slice().sort((a, b) => a.mes.localeCompare(b.mes)), um = M[M.length - 1], dA = um ? Math.round((um.adr - um.adr_zona) / um.adr_zona * 100) : null;
  const tit = (o >= oz ? 'Llenas más que la zona' : 'Llenas menos que la zona') + (dA == null ? '' : dA < -3 ? (o >= oz ? ', pero cobras ' : ' y cobras ') + Math.abs(dA) + '% menos' : dA > 3 ? ' y cobras ' + dA + '% más' : ' con tarifa a la par');
  const cmp = (lab, tu, zo, mx, txtTu, txtZo, bien) => `<div style="margin-top:10px"><div class="row"><b class="sp" style="font-size:13px">${lab}</b><span class="m">tú <b style="color:${bien ? '#1f6b4a' : '#a3301f'}">${txtTu}</b> · zona ${txtZo}</span></div><div class="ocbar"><i style="width:${Math.min(100, Math.round(tu / mx * 100))}%;background:${bien ? '#1f6b4a' : '#a3301f'}"></i><b style="left:${Math.min(99, Math.round(zo / mx * 100))}%"></b></div></div>`;
  h += `<button class="card tap ochero" data-ocstats="1"><div class="row"><div class="sp" style="font-size:18px;font-weight:700;line-height:1.2">${tit}</div><span class="m">Ver en el tiempo ›</span></div>${cmp('Ocupación · próximos 30 días', o, oz, Math.max(60, o, oz) * 1.1, o + '%', oz + '%', o >= oz)}${um ? cmp('Tarifa por noche · ' + MESES_L[+um.mes.slice(5) - 1], um.adr, um.adr_zona, Math.max(um.adr, um.adr_zona) * 1.1, money(um.adr), money(um.adr_zona), um.adr >= um.adr_zona) : ''}<div class="m" style="margin-top:8px">La raya negra es la zona.${um ? ' La tarifa compara los ' + um.depas + ' depas con un año de historia.' : ''}</div></button>`;
  // --- mapa de desgaste: zona × rango de precio ---
  const filas = (T ? [T] : torres).map(t => ({ t, c: OC_BANDAS.map((_, bi) => { const g = L.filter(l => l.torre === t && ocBanda(l) === bi); return g.length ? { n: g.length, d: Math.round(avg(g, l => l.occ30 - l.occ30z)) } : null; }) }));
  h += `<h2>Mapa de desgaste · zona y precio</h2><div class="card" style="overflow-x:auto"><table class="ocheat"><thead><tr><th>Zona</th>${OC_BANDAS.map(b => `<th>${b[0]}</th>`).join('')}</tr></thead><tbody>${filas.map(f => `<tr><th>${esc(f.t)}</th>${f.c.map(c => { if (!c) return '<td class="v"></td>'; const k = ocCalor(c.d); return `<td style="background:${k[0]};color:${k[1]}"><b>${c.d > 0 ? '+' : ''}${c.d} pts</b><span>${c.n} ${c.n === 1 ? 'depa' : 'depas'}</span></td>`; }).join('')}</tr>`).join('')}</tbody></table><div class="m" style="margin-top:8px">Cada celda: tu ocupación a 30 días menos la de la zona, por precio base. Rojo = más desgastado (llenas menos que la zona); verde = arriba de la zona.</div></div>`;
  // --- prioridades ---
  const P = ocPend().filter(i => !T || (prop(i.code) || {}).building === T || (L.find(l => l.code === i.code) || {}).torre === T), tipos = ['', ...new Set(P.map(i => i.tipo))], F = S.ocTipo || '', PF = P.filter(i => !F || i.tipo === F), ver = S.ocMas ? PF : PF.slice(0, 5);
  h += `<h2>Prioridades · ${P.length} por revisar</h2><div class="row" style="gap:6px;margin-bottom:8px">${tipos.map(t => `<button class="chip ${F === t ? 'pri' : ''}" data-octipo="${esc(t)}">${t || 'Todas'}</button>`).join('')}</div>`;
  h += ver.length ? `<div class="card list">${ver.map((i, n) => `<div class="it"><span class="ocn">${n + 1}</span><div class="sp"><div><b>${esc(i.titulo)}</b></div><div class="m">${i.antes != null && i.nuevo != null ? 'De ' + ocMon(i.antes, i.moneda) + ' a ' + ocMon(i.nuevo, i.moneda) + (i.vence ? ' · vence ' + fmt(i.vence) : '') : esc((i.detalle || '').split('.')[0])}</div></div><button data-ocrev="${esc(i.id)}">Revisar</button></div>`).join('')}</div>${PF.length > 5 ? `<div class="row" style="margin-top:6px"><span class="sp"></span><button data-ocmas="1">${S.ocMas ? 'Ver menos' : 'Ver las ' + PF.length}</button></div>` : ''}` : '<div class="card empty">Sin prioridades pendientes ✓</div>';
  // --- detalle expandible ---
  const dinero = () => `<div class="list">${L.slice().sort((a, b) => (a.occ30 - a.occ30z) - (b.occ30 - b.occ30z)).map(l => { const d = Math.round(l.occ30 - l.occ30z), col = d <= -15 ? '#a3301f' : d < 0 ? '#b06a00' : '#1f6b4a'; return `<div class="it"><div style="width:86px;flex:none"><b>${esc(l.code)}</b></div><div class="sp"><div class="ocbar"><i style="width:${Math.max(2, Math.round(l.occ30))}%;background:${col}"></i><b style="left:${Math.min(99, Math.round(l.occ30z))}%"></b></div><div class="m">${Math.round(l.occ30)}% ocupado · zona ${Math.round(l.occ30z)}%${l.revpar30 != null ? ' · gana ' + money(l.revpar30) + ' de ' + money(l.revpar30z) + ' por noche disponible' : ''}</div></div></div>`; }).join('')}</div>`;
  const bajo = L.filter(l => l.occ30 < l.occ30z).length;
  h += `<h2>Detalle</h2><div class="card aclist">${acRow('oc:dinero', { tit: 'Dónde se está quedando el dinero', sub: 'Ocupación a 30 días de cada depa contra su zona', pills: acPill(bajo + ' ABAJO DE LA ZONA', bajo ? 'mal' : 'ok'), body: dinero })}${acRow('oc:libres', { tit: 'Noches libres en el calendario', sub: 'Según las reservas de la app', pills: '', body: ocLibres })}</div>`;
  h += `<div class="m" style="margin-top:10px">Ningún cambio se aplica sin orden: cada uno lo aprueba María y lo confirma una segunda vez. Entonces el sistema lo aplica en el Motor de precios MGM y queda en el historial para poder revertirlo.</div>`;
  return h + ocModal();
};
function ocLibres() {
  const dias = S.ocDias || 14, T = S.ocT || '', all = ocDatos(dias), L = all.filter(x => !T || (x.p.building || '') === T), con = L.filter(x => x.libres.length).sort((a, b) => b.libres.length - a.libres.length);
  return `<div class="row" style="margin:6px 0"><div class="seg">${[7, 14, 30].map(n => `<button class="${dias === n ? 'on' : ''}" data-ocdias="${n}">${n} días</button>`).join('')}</div></div>` + (con.length ? `<div class="list">${con.map(x => `<div class="it"><div class="sp"><div><b>${esc(x.p.code)}</b> <span class="m">${esc(x.p.building || '')}</span></div><div class="m">${x.tramos.map(([a, b]) => a === b ? fmt(a) : fmt(a) + ' a ' + fmt(b)).join(' · ')}</div></div><span class="b ${x.libres.length >= dias * 0.6 ? 'baja' : x.libres.length >= dias * 0.3 ? 'cambio' : 'n'}">${x.libres.length} ${x.libres.length === 1 ? 'noche' : 'noches'}</span></div>`).join('')}</div>` : '<div class="empty">Todo ocupado en este periodo ✓</div>');
}

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
VIEWS.menu = () => `<div class="menu">${MENU.filter(m => !['pnl', 'stats', 'servicios', 'usuarios', 'ocupacion'].includes(m[0]) || isSuper()).map(([k, t, s]) => `<button class="card tap" data-go="${k}"><div class="dp">${t}</div><div class="m">${s}</div></button>`).join('')}</div><div class="menu-foot"><img class="l" src="img/logo-white.png" alt="MGM Housing Management"><img class="s" src="img/skyline.svg" alt=""></div>`;

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
  h += '<h2>Más de cajones</h2><div class="card aclist">';
  if (S.falta && S.falta.has('parking_loans')) h += acRow('ca:apartados', { tit: 'Apartados a externos', sub: 'Cajones prestados a alguien sin reserva', pills: '', body: () => '<div class="m">Se activa en unos minutos (falta crear la tabla en la base de datos).</div>' });
  else h += acRow('ca:apartados', { tit: 'Apartados a externos', sub: 'Cajones prestados a alguien sin reserva', pills: acPill(aps.length ? aps.length + ' APARTADO' + (aps.length > 1 ? 'S' : '') : 'NINGUNO', aps.length ? 'ok' : ''), body: () => `<div class="m" style="margin-bottom:6px">Cajones que prestamos a alguien sin reserva. Mientras estén apartados no aparecen como libres.</div>
    <div class="row" style="flex-wrap:wrap;gap:6px"><select id="apC">${prestables.map(p => `<option value="${esc(p.code)}">${esc(p.code)} · S${p.parking_level ?? '?'}</option>`).join('')}</select><input id="apN" placeholder="Nombre de quién" style="flex:1;min-width:140px"></div>
    <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px"><label class="m">Desde <input type="date" id="apD" value="${d}"></label><label class="m">Hasta <input type="date" id="apH" value="${add(d, 1)}"></label><span class="sp"></span><button class="pri" data-apadd="1">Apartar</button></div>
    <div class="list" style="margin-top:8px">${aps.length ? aps.map(x => `<div class="it"><div class="sp"><b>${esc(x.cajon)}</b> · ${esc(x.name)}<div class="m">${fmt(x.date_from)} → ${fmt(x.date_to)}</div></div><button data-apdel="${x.id}">Quitar</button></div>`).join('') : '<div class="m">Ninguno.</div>'}</div>` });
  const mes = d.slice(0, 7), ini = mes + '-01', fin = ymd(new Date(+mes.slice(0, 4), +mes.slice(5), 1));
  const t = {}; activas().forEach(r => { if (!r.parking_from) return; let n = 0; for (let x = r.checkin; x < r.checkout; x = add(x, 1)) if (x >= ini && x < fin) n++; if (n) t[r.parking_from] = (t[r.parking_from] || 0) + n; });
  const ks = Object.keys(t).sort(), rentaDe = k => Number((setting('renta_cajon_depa', {}) || {})[k] ?? setting('renta_cajon', 500));
  h += acRow('ca:mes', { tit: 'Cajones prestados · ' + fmtMes(mes), sub: 'Noches y renta por cajón en el mes', pills: acPill(ks.length ? ks.length + ' CAJONES · ' + money(ks.reduce((a, k) => a + rentaDe(k), 0)) : 'SIN PRÉSTAMOS', ks.length ? 'ok' : ''), body: () => `${ks.length ? `<table><tr><th>Cajón de</th><th class="r">Noches</th><th class="r">Renta</th></tr>${ks.map(k => `<tr><td class="dp">${esc(k)}</td><td class="r">${t[k]}</td><td class="r">${money(rentaDe(k))}</td></tr>`).join('')}<tr><th>Total</th><th></th><th class="r">${money(ks.reduce((a, k) => a + rentaDe(k), 0))}</th></tr></table>` : '<span class="m">Sin préstamos este mes.</span>'}` });
  // Historial de préstamos (reservas con cajón prestado + apartados a externos)
  const hm = S.cajMes || mes, hi = hm + '-01', hf = ymd(new Date(+hm.slice(0, 4), +hm.slice(5), 1));
  const noches = (a, b) => { let n = 0; for (let x = a; x < b; x = add(x, 1)) if (x >= hi && x < hf) n++; return n; };
  const H = [
    ...activas().filter(r => r.parking_from && r.checkin < hf && hi < r.checkout).map(r => ({ cajon: r.parking_from, quien: r.property_code + ' · ' + r.guest, tipo: 'Reserva', grupo: r.property_code, a: r.checkin, b: r.checkout })),
    ...(S.t.parking_loans || []).filter(x => x.date_from < hf && hi < x.date_to).map(x => ({ cajon: x.cajon, quien: x.name, tipo: 'Externo', grupo: x.name, a: x.date_from, b: x.date_to }))
  ].map(x => ({ ...x, n: noches(x.a, x.b) })).sort((a, b) => a.a.localeCompare(b.a));
  const G = {}; H.forEach(x => { const g = G[x.grupo] = G[x.grupo] || { tipo: x.tipo, veces: 0, n: 0 }; g.veces++; g.n += x.n; });
  const gk = Object.keys(G).sort((a, b) => G[b].n - G[a].n);
  let hh = `<div class="nav"><button data-cajmes="-1">‹</button><div class="d">${fmtMes(hm)}</div><button data-cajmes="1">›</button></div>`;
  hh += `<div class="card"><div class="m" style="margin-bottom:6px"><b>Quién pide más</b> · ${H.length} préstamo(s), ${H.reduce((t, x) => t + x.n, 0)} noches</div>${gk.length ? `<table><tr><th>Quién</th><th>Tipo</th><th class="r">Veces</th><th class="r">Noches</th></tr>${gk.map(k => `<tr><td class="dp">${esc(k)}</td><td>${G[k].tipo}</td><td class="r">${G[k].veces}</td><td class="r">${G[k].n}</td></tr>`).join('')}</table>` : '<span class="m">Sin préstamos este mes.</span>'}</div>`;
  const G2 = {}; H.forEach(x => { const g = G2[x.cajon] = G2[x.cajon] || { veces: 0, n: 0 }; g.veces++; g.n += x.n; });
  const gk2 = Object.keys(G2).sort((a, b) => G2[b].n - G2[a].n);
  hh += `<div class="card"><div class="m" style="margin-bottom:6px"><b>Quién presta más</b> · cajones de ${gk2.length} depa(s)</div>${gk2.length ? `<table><tr><th>Cajón de</th><th>Sótano</th><th class="r">Veces</th><th class="r">Noches</th></tr>${gk2.map(k => `<tr><td class="dp">${esc(k)}</td><td>S${(prop(k) || {}).parking_level ?? '?'}</td><td class="r">${G2[k].veces}</td><td class="r">${G2[k].n}</td></tr>`).join('')}</table>` : '<span class="m">Sin préstamos este mes.</span>'}</div>`;
  h += acRow('ca:historial', { tit: 'Historial de préstamos', sub: 'Quién pide y quién presta más, por mes', pills: acPill(H.length + ' EN ' + fmtMes(hm).toUpperCase(), H.length ? 'ok' : ''), body: () => hh });
  return h + '</div>';
};

// ---------- LIMPIEZAS ----------
VIEWS.limpiezas = () => {
  const cs = cleaners(), C = supConf(), hoy = today(), P = props().filter(p => p.cleaning !== false);
  const offs = S.t.days_off.filter(o => o.date >= hoy).sort((a, b) => a.date.localeCompare(b.date)), off7 = offs.filter(o => o.date <= add(hoy, 7));
  const sinTar = P.filter(p => !cs.some(c => rate(p.code, c.key) != null)), huecosTar = P.reduce((n, p) => n + cs.filter(c => rate(p.code, c.key) == null).length, 0);
  let h = acResumen(sinTar.length ? 'med' : 'ok', sinTar.length ? `${sinTar.length} depa${sinTar.length > 1 ? 's' : ''} sin tarifa de limpieza` : 'Limpiezas al día',
    `${off7.length} descanso${off7.length === 1 ? '' : 's'} en los próximos 7 días · ${Object.keys(C).length} supervisora${Object.keys(C).length === 1 ? '' : 's'}${sinTar.length ? '. Sin tarifa, esas limpiezas salen en $0 en nómina.' : ''}`, [['Sin tarifa:', sinTar.map(p => ['li:tarifas', p.code])]]) + '<div class="card aclist">';
  h += acRow('li:descansos', { tit: 'Descansos', sub: 'Días que no trabaja cada chica', pills: acPill(offs.length ? offs.length + ' PRÓXIMOS' : 'NINGUNO', offs.length ? 'ok' : ''),
    body: () => `<div class="row"><input type="date" id="offDate" value="${hoy}"><select id="offK">${cs.map(c => `<option value="${c.key}">${esc(c.name)}</option>`).join('')}</select><button class="pri" data-addoff="1">Agregar</button></div>
    <div class="list">${offs.map(o => `<div class="it"><div class="sp">${fmt(o.date)} · ${esc(nombre(o.cleaner_key))}</div><button data-deloff="${o.date}|${o.cleaner_key}">Quitar</button></div>`).join('')}</div>` });
  for (const k of Object.keys(C)) {
    const PA = setting('sup_pausas', []).filter(p => p.sup === k && p.to >= hoy).sort((a, b) => a.from.localeCompare(b.from));
    h += acRow('li:sup:' + k, { tit: 'Supervisión · ' + nombre(k), sub: 'Cuánto cobra por unidad, quién le reporta y sus pausas', pills: acPill(money(Number(C[k].monto) || 0) + ' · ' + C[k].team.length + ' LE REPORTAN', 'ok') + (PA.length ? acPill(PA.length + ' PAUSA' + (PA.length > 1 ? 'S' : ''), 'med') : ''),
      body: () => `<div class="row"><span class="sp m">$ por unidad supervisada</span><input type="number" inputmode="numeric" style="width:70px" data-supmonto="${k}" value="${Number(C[k].monto) || 0}"></div>
      <div class="m" style="margin-top:8px">Le reportan:</div><div class="chips" style="margin-top:4px">${cs.filter(c => c.key !== k).map(c => `<label class="chip ${C[k].team.includes(c.key) ? 'on' : ''}"><input type="checkbox" hidden data-supteam="${k}|${c.key}" ${C[k].team.includes(c.key) ? 'checked' : ''}>${esc(c.name)}</label>`).join('')}</div>
      <div class="m" style="margin-top:10px">Pausas (vacaciones o días que no supervisa): no cobra supervisión esos días.</div>
      <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:4px"><label class="m">Desde <input type="date" id="spD-${k}" value="${hoy}"></label><label class="m">Hasta <input type="date" id="spH-${k}" value="${hoy}"></label><button data-suppadd="${k}">Agregar pausa</button></div>
      ${PA.length ? `<div class="list" style="margin-top:6px">${PA.map(p => `<div class="it"><div class="sp">${fmt(p.from)} → ${fmt(p.to)}</div><button data-suppdel="${p.id}">Quitar</button></div>`).join('')}</div>` : ''}
      <div class="m" style="margin-top:10px">Para quitarle una unidad en particular: Nómina → ${esc(nombre(k))} → Supervisión → Quitar.</div>
      <div class="row" style="margin-top:8px"><span class="sp"></span><button data-supset="${k}|del">Ya no es supervisora</button></div>` });
  }
  const libresSup = cs.filter(c => !C[c.key]);
  h += acRow('li:supnueva', { tit: 'Agregar supervisora', sub: 'Una chica que cobra por supervisar a otras', pills: '', body: () => `<div class="row"><span class="m sp">Elige quién</span><select data-supnew="1"><option value="">Elegir…</option>${libresSup.map(c => `<option value="${c.key}">${esc(c.name)}</option>`).join('')}</select></div>` });
  h += acRow('li:tarifas', { tit: 'Tarifa por limpieza', sub: 'Cuánto se paga por depa a cada chica', pills: acPill(sinTar.length ? sinTar.length + ' DEPAS SIN TARIFA' : huecosTar ? huecosTar + ' HUECOS' : 'COMPLETAS', sinTar.length ? 'med' : huecosTar ? '' : 'ok'),
    body: () => `<div class="scroll"><table><tr><th>Depa</th>${cs.map(c => `<th class="r">${esc(c.name)}</th>`).join('')}</tr>${props().map(p => `<tr><td class="dp">${esc(p.code)}</td>${cs.map(c => `<td class="r"><input type="number" inputmode="numeric" style="width:66px" data-rate="${esc(p.code)}|${c.key}" value="${rate(p.code, c.key) ?? ''}"></td>`).join('')}</tr>`).join('')}</table></div><div class="m" style="margin-top:6px">Bono por limpieza en domingo: ${money(Number(setting('bono_domingo', 50)))} (se cambia en Supuestos).</div>` });
  return h + '</div>';
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
  const places = [...props().map(p => p.code), ...EXTRA_PLACES], C = pl => S.t.access_codes.find(x => x.place === pl) || {}, tiene = pl => !!(C(pl).code1 || C(pl).code2), sin = places.filter(pl => !tiene(pl));
  return `<div class="row" style="margin-bottom:8px"><button class="pri sp" data-waopen="1">📲 Imagen de claves para WhatsApp</button></div>`
    + acResumen(sin.length ? 'med' : 'ok', `${places.length - sin.length} de ${places.length} lugares con clave`, sin.length ? `Faltan ${sin.length}. Toca uno para capturarla.` : 'Todos tienen clave.', [['Sin clave:', sin.map(pl => ['cl:' + pl, pl])]])
    + '<div class="card aclist">' + places.map(pl => { const c = C(pl), t = tiene(pl);
      return acRow('cl:' + pl, { tit: pl, dp: true, pills: acPill(t ? 'CON CLAVE' : 'SIN CLAVE', t ? 'ok' : ''), right: t ? `<button class="pri" data-copyclave="${esc(pl)}">Copiar</button>` : '',
        body: () => `<label class="m">Clave 1<input class="code" style="width:100%;margin-top:4px" data-code="${esc(pl)}|code1" value="${esc(c.code1 || '')}" autocomplete="off"></label><label class="m" style="display:block;margin-top:8px">Clave 2<input class="code" style="width:100%;margin-top:4px" data-code="${esc(pl)}|code2" value="${esc(c.code2 || '')}" autocomplete="off"></label><div class="m" style="margin-top:6px">Se guarda al salir de cada campo.</div>` }); }).join('') + '</div>';
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
    { id: 'captura', q: '¿Necesitas el desglose de cada pago de Airbnb?', help: 'La app ya toma de cada correo lo que ganas (payout neto, solo pesos) y crea el ingreso. Para el reporte al dueño podría faltar: código HM…, monto bruto, limpieza cobrada, comisión Airbnb, impuestos liquidados, retención ISR, retención IVA, payout neto y fecha de payout.', opts: ['Subir cada mes el CSV de transacciones de Airbnb (recomendado)', 'Captura manual por reserva', 'Las dos'] },
    { id: 'ocup', q: '¿De dónde sale el % de ocupación?', help: 'Desde el 18 nov la app recibe todas las reservas de Airbnb por iCal, así que el cálculo desde la app ya es completo. Ojo: junio dice 96% (Airbnb) pero calculado desde reservas da 57%.', opts: ['Calculado desde las reservas de la app', 'Dato de Airbnb capturado a mano'] },
    { id: 'tarifa', q: '¿De dónde sale la tarifa promedio por noche?', opts: ['Calculada: ingreso ÷ noches', 'Dato de Airbnb capturado a mano'] },
    { id: 'resenas', q: '¿Cómo armamos la Evaluación de desempeño?', opts: ['Estrellas por reserva capturadas en la app', 'Subir las capturas de Airbnb del mes', 'Las dos', 'No incluirla'] }
  ]],
  ['Cobros al dueño', [
    { id: 'limpieza', q: 'Limpieza: ¿cuánto se le cobra al dueño por cada salida?', help: 'Q-104 octubre: 6 limpiezas × $500 = $3,000.', opts: ['Mismo monto en todos los depas', 'Varía por depa (anota abajo)'] },
    { id: 'lavanderia', q: 'Lavandería: ¿cómo se cobra?', help: 'Q-104: $200 por limpieza de junio a septiembre y $100 en octubre.', opts: ['Monto fijo por limpieza', 'Lo que se pague real en el mes', 'Varía por depa'] },
    { id: 'otros', q: 'Otros ingresos (ej. renta de estacionamiento): ¿qué depas los tienen y son fijos cada mes?', help: 'Renta de cajón: base $500 al mes; si alguno cobra más se ajusta por cajón en Supuestos → Cajones Qalina.', text: true },
    { id: 'liquida', q: '¿Registramos la transferencia de la utilidad al dueño (monto, fecha, referencia)?', opts: ['Sí, como estado de cuenta', 'No es necesario'] },
    { id: 'recurrentes', q: 'Luz, agua, gas, internet y mantenimiento ya están en Pagos de servicios. ¿Qué otros gastos son fijos cada mes por depa?', text: true }
  ]],
  ['Dueños', [
    { id: 'duenos', q: 'Anota por depa: dueño y correo (un depa por línea).', help: 'Ej.: Q-104 – Nombre del dueño – correo@dominio.com', text: true, rows: 6 }
  ]],
  ['Cortes por correo', [
    { id: 'semanal', q: 'Corte semanal: ya existe por WhatsApp (Admin → Automatizaciones → WhatsApp → Semana de negocio). ¿Lo quieres también por correo?', opts: ['Con WhatsApp me basta', 'También por correo', 'Solo por correo'], ask: '¿Qué más quieres ver en el corte semanal?' },
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
// ---------- Estadísticas: cómo va el negocio, con alertas, semáforos, tendencia y reporte en PDF ----------
// Todo se calcula con lo que ya está cargado (reservas, bloqueos, gastos e ingresos, limpiezas). Solo se guardan los grupos de depas.
const stDias = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const stMes = (ym, n) => { const d = parse(ym + '-01'); d.setMonth(d.getMonth() + n); return ymd(d).slice(0, 7); };
const stGrupos = () => setting('stat_grupos', {}) || {};
const stSel = () => S.stSel || { tipo: 'todo', val: '' };
function stCodes() { // depas de la selección (siempre activos y no cajones)
  const s = stSel(), D = props();
  if (s.tipo === 'torre') return D.filter(p => (p.building || 'Sin edificio') === s.val).map(p => p.code);
  if (s.tipo === 'depa') return D.filter(p => p.code === s.val).map(p => p.code);
  if (s.tipo === 'grupo') { const g = new Set(stGrupos()[s.val] || []); return D.filter(p => g.has(p.code)).map(p => p.code); }
  return D.map(p => p.code);
}
const stTitulo = () => { const s = stSel(); return s.tipo === 'todo' ? 'Toda la gestión' : s.tipo === 'torre' ? 'Torre ' + s.val : s.tipo === 'depa' ? 'Depa ' + s.val : 'Grupo ' + s.val; };
function stCalc(f, t, codes) { // periodo [f, t) para los depas de `codes`
  const todo = stSel().tipo === 'todo', set = new Set(codes), dias = stDias(f, t), R = activas().filter(r => set.has(r.property_code));
  const dep = Object.fromEntries(codes.map(c => [c, { code: c, torre: prop(c)?.building || 'Sin edificio', noches: 0, ext: 0, disp: dias, ing: 0, gas: 0, limp: 0, nLimp: 0, res: 0, conM: 0, mNoches: 0, mMonto: 0 }]));
  // Misma regla que mgm_stats() en la base (Paco App Store y Claudio usan esa función): se cuenta por depa y por noche.
  // Ocupada = hay reserva no cancelada o bloqueo 'externa' (reserva por fuera de Airbnb); disponible = sin bloqueo de 'mantenimiento'.
  const N = Object.fromEntries(codes.map(c => [c, { res: new Set(), ext: new Set(), man: new Set() }])), dia = {};
  const cada = (a, b, fn) => { for (let d = a > f ? a : f, z = b < t ? b : t; d < z; d = add(d, 1)) fn(d); };
  for (const r of R) cada(r.checkin, r.checkout, d => N[r.property_code].res.add(d));
  for (const b of S.t.blocks) if (N[b.property_code]) cada(b.date_from, add(b.date_to, 1), d => N[b.property_code][b.kind === 'externa' ? 'ext' : 'man'].add(d));
  for (let d = f; d < t; d = add(d, 1)) dia[d] = { o: 0, n: 0 };
  for (const c of codes) { const n = N[c], x = dep[c]; x.disp = dias - n.man.size;
    for (let d = f; d < t; d = add(d, 1)) { if (n.man.has(d)) continue; dia[d].n++; const r = n.res.has(d), e = !r && n.ext.has(d); if (r || e) { dia[d].o++; x.noches++; if (e) x.ext++; } } }
  for (const r of R) if (r.checkin >= f && r.checkin < t) { const x = dep[r.property_code]; x.res++; if (Number(r.amount) > 0) { x.conM++; x.mNoches += stDias(r.checkin, r.checkout); x.mMonto += Number(r.amount); } }
  const TX = S.t.transactions.filter(x => x.date >= f && x.date < t && (todo || set.has(x.property_code))), G = TX.filter(x => x.kind === 'gasto'), I = TX.filter(x => x.kind === 'ingreso');
  for (const x of TX) if (dep[x.property_code]) dep[x.property_code][x.kind === 'gasto' ? 'gas' : 'ing'] += Number(x.amount) || 0;
  const cat = {}; for (const x of G) cat[catLabel(x)] = (cat[catLabel(x)] || 0) + (Number(x.amount) || 0);
  // Limpieza: cada limpieza hecha × su tarifa + bono de domingo + supervisión (igual que Nómina, sin el renglón "otros").
  const bono = Number(setting('bono_domingo', 50)), quit = new Set(setting('sup_quitar', [])), pausas = setting('sup_pausas', []), SC = supConf();
  const L = R.filter(r => r.checkout >= f && r.checkout < t && r.cleaner_key && r.cleaner_key !== NA && prop(r.property_code)?.cleaning !== false).map(r => ({ id: 'r:' + r.id, p: r.property_code, k: r.cleaner_key, d: r.checkout }))
    .concat((S.t.cleanings || []).filter(c => c.date >= f && c.date < t && set.has(c.property_code) && c.cleaner_key && c.cleaner_key !== NA).map(c => ({ id: 'x:' + c.id, p: c.property_code, k: c.cleaner_key, d: c.date })));
  for (const l of L) { const sv = supervisorDe(l.k), off = !sv || quit.has(l.id) || pausas.some(p => p.sup === sv && p.from <= l.d && l.d <= p.to);
    dep[l.p].limp += (rate(l.p, l.k) || 0) + (dow(l.d) === 0 ? bono : 0) + (off ? 0 : Number(SC[sv]?.monto) || 0); dep[l.p].nLimp++; }
  const deps = Object.values(dep), sum = k => deps.reduce((n, x) => n + x[k], 0);
  const A = { f, t, dias, deps, dia, noches: sum('noches'), disp: sum('disp'), ext: sum('ext'), res: sum('res'), conM: sum('conM'), limp: sum('nLimp'), limpCosto: sum('limp'),
    ing: I.reduce((n, x) => n + (Number(x.amount) || 0), 0), gas: G.reduce((n, x) => n + (Number(x.amount) || 0), 0), sinFoto: G.filter(x => !(x.photos || []).length).length, nGas: G.length };
  const nR = R.filter(r => r.checkin >= f && r.checkin < t);
  A.ocup = A.disp ? A.noches / A.disp * 100 : 0; A.tarifa = sum('mNoches') ? sum('mMonto') / sum('mNoches') : null; A.estancia = nR.length ? nR.reduce((n, r) => n + stDias(r.checkin, r.checkout), 0) / nR.length : 0;
  A.costo = A.gas + A.limpCosto; A.resultado = A.ing - A.costo; A.cat = Object.entries({ ...cat, ...(A.limpCosto ? { 'Limpieza (nómina por limpieza hecha)': A.limpCosto } : {}) }).sort((a, b) => b[1] - a[1]);
  return A;
}
// Periodo elegido y su comparación. Regresa [desde, hasta, desdeAnterior|null, hastaAnterior, textoComparación].
function stPeriodo() {
  const per = S.statPer || 'mes', hoy = today(), man = add(hoy, 1), ym = hoy.slice(0, 7), ini = ym + '-01';
  const P = { mes: [ini, man, stMes(ym, -1) + '-01', add(stMes(ym, -1) + '-01', stDias(ini, man)), 'el mes pasado a la misma fecha'], ant: [stMes(ym, -1) + '-01', ini, stMes(ym, -2) + '-01', stMes(ym, -1) + '-01', 'el mes anterior'],
    tri: [stMes(ym, -2) + '-01', man, stMes(ym, -5) + '-01', stMes(ym, -2) + '-01', 'los 3 meses anteriores'], anio: [ym.slice(0, 4) + '-01-01', man, null, null, ''] }[per];
  const d0 = S.t.reservations.reduce((m, r) => r.checkin < m ? r.checkin : m, hoy); // primer dato: antes de eso no hay historia que comparar
  if (P[0] < d0) P[0] = d0; if (P[2] && P[2] < d0) P[2] = null;
  return P;
}
// Semáforos: 'ok' verde, 'med' ámbar, 'mal' rojo, '' neutro.
const stSem = { ocup: v => v >= 75 ? 'ok' : v >= 50 ? 'med' : 'mal', f14: v => v >= 60 ? 'ok' : v >= 40 ? 'med' : 'mal',
  sube: (a, b) => b == null || !b || a == null ? '' : a >= b ? 'ok' : a >= b * 0.9 ? 'med' : 'mal', baja: (a, b) => b == null || !b ? '' : a <= b * 1.05 ? 'ok' : a <= b * 1.2 ? 'med' : 'mal' };
function stDatos() { // todo lo que pintan la pantalla y el PDF
  const P = stPeriodo(), codes = stCodes(), hoy = today(), ym = hoy.slice(0, 7), man = add(hoy, 1);
  const A = stCalc(P[0], P[1], codes), B = P[2] ? stCalc(P[2], P[3], codes) : null, F14 = stCalc(hoy, add(hoy, 14), codes);
  const pct = n => (Math.round(n * 10) / 10) + '%', al = [];
  const sinRes = F14.deps.filter(d => d.disp > 0 && !d.noches).map(d => d.code);
  if (codes.length && F14.ocup < 50) al.push(['Próximos 14 días al ' + pct(F14.ocup) + ' de ocupación.', 'Conviene revisar precios o promociones.']);
  if (sinRes.length) al.push([sinRes.length + ' depa' + (sinRes.length > 1 ? 's' : '') + ' sin ninguna noche reservada en 14 días:', sinRes.slice(0, 8).join(', ') + (sinRes.length > 8 ? '…' : '')]);
  const set = new Set(codes), sinChica = activas().filter(r => set.has(r.property_code) && r.checkout >= hoy && r.checkout <= add(hoy, 7) && !r.cleaner_key && prop(r.property_code).cleaning !== false).length;
  if (sinChica) al.push([sinChica + ' salida' + (sinChica > 1 ? 's' : '') + ' de esta semana sin chica asignada.', '']);
  const flojos = A.deps.filter(d => d.disp >= 7 && d.noches / d.disp < 0.4).sort((a, b) => a.noches / a.disp - b.noches / b.disp);
  if (flojos.length && codes.length > 1) al.push([flojos.length + ' depa' + (flojos.length > 1 ? 's' : '') + ' por debajo de 40% en el periodo:', flojos.slice(0, 6).map(d => d.code + ' ' + Math.round(d.noches / d.disp * 100) + '%').join(', ') + (flojos.length > 6 ? '…' : '')]);
  if (B && A.ocup < B.ocup - 5) al.push(['La ocupación bajó ' + (Math.round((B.ocup - A.ocup) * 10) / 10) + ' puntos', 'contra ' + P[4] + ' (' + pct(B.ocup) + ' → ' + pct(A.ocup) + ').']);
  if (B && B.gas > 0 && A.gas > B.gas * 1.2) al.push(['Los gastos subieron ' + Math.round((A.gas / B.gas - 1) * 100) + '%', 'contra ' + P[4] + ' (' + money(Math.round(B.gas)) + ' → ' + money(Math.round(A.gas)) + ').']);
  const pierden = A.deps.filter(d => d.ing > 0 && d.ing - d.gas - d.limp < 0).map(d => d.code);
  if (pierden.length) al.push([pierden.length + ' depa' + (pierden.length > 1 ? 's' : '') + ' con resultado negativo:', pierden.slice(0, 8).join(', ') + (pierden.length > 8 ? '…' : '')]);
  if (A.res && A.conM < A.res) al.push([(A.res - A.conM) + ' de ' + A.res + ' reservas del periodo no tienen monto.', 'Los ingresos, la tarifa y el resultado están incompletos.']);
  if (A.nGas && A.sinFoto / A.nGas > 0.5) al.push([A.sinFoto + ' de ' + A.nGas + ' gastos sin foto de comprobante.', '']);
  const M = [-2, -1, 0].map(n => { const m = stMes(ym, n); return { m, parcial: !n, c: stCalc(m + '-01', n ? stMes(m, 1) + '-01' : man, codes) }; });
  // Huecos vendibles: noches libres (ni reservadas ni bloqueadas) en los próximos 14 días, por depa y en tramos.
  const huecos = codes.map(c => { const occ = new Set(), tr = []; let n = 0;
    for (const r of activas()) if (r.property_code === c) for (let d = r.checkin > hoy ? r.checkin : hoy; d < r.checkout && d < add(hoy, 14); d = add(d, 1)) occ.add(d);
    for (const b of S.t.blocks) if (b.property_code === c) for (let d = b.date_from > hoy ? b.date_from : hoy; d <= b.date_to && d < add(hoy, 14); d = add(d, 1)) occ.add(d);
    for (let i = 0; i < 14; i++) { const d = add(hoy, i); if (occ.has(d)) continue; n++; const u = tr[tr.length - 1]; if (u && add(u[1], 1) === d) u[1] = d; else tr.push([d, d]); }
    return { code: c, n, tr }; }).filter(x => x.n).sort((a, b) => b.n - a.n);
  const sem = [1, 2, 3, 4, 5, 6, 0].map(w => { let o = 0, n = 0; for (const d in A.dia) if (dow(d) === w) { o += A.dia[d].o; n += A.dia[d].n; } return { w, o, n, p: n ? o / n * 100 : 0 }; });
  // Logros: lo que va bien en la selección (lo contrario de los retos).
  const lg = [], DSL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'], top = sem.slice().sort((a, b) => b.p - a.p)[0];
  if (A.ocup >= 75) lg.push(['Ocupación en verde: ' + pct(A.ocup) + '.', A.noches + ' de ' + A.disp + ' noches ocupadas.']);
  if (B && A.ocup > B.ocup + 2) lg.push(['La ocupación subió ' + (Math.round((A.ocup - B.ocup) * 10) / 10) + ' puntos', 'contra ' + P[4] + ' (' + pct(B.ocup) + ' → ' + pct(A.ocup) + ').']);
  if (B && B.ing > 0 && A.ing > B.ing * 1.03) lg.push(['Los ingresos subieron ' + Math.round((A.ing / B.ing - 1) * 100) + '%', 'contra ' + P[4] + ' (' + money(Math.round(B.ing)) + ' → ' + money(Math.round(A.ing)) + ').']);
  if (B && B.costo > 0 && A.costo < B.costo * 0.95) lg.push(['Los gastos bajaron ' + Math.round((1 - A.costo / B.costo) * 100) + '%', 'contra ' + P[4] + ' (' + money(Math.round(B.costo)) + ' → ' + money(Math.round(A.costo)) + ').']);
  const llenos = A.deps.filter(d => d.disp >= 7 && d.noches / d.disp >= 0.9).sort((a, b) => b.noches / b.disp - a.noches / a.disp);
  if (llenos.length && codes.length > 1) lg.push([llenos.length + ' depa' + (llenos.length > 1 ? 's' : '') + ' arriba de 90% de ocupación:', llenos.slice(0, 8).map(d => d.code).join(', ') + (llenos.length > 8 ? '…' : '')]);
  const mejor = A.deps.filter(d => d.ing > 0).sort((a, b) => (b.ing - b.gas - b.limp) - (a.ing - a.gas - a.limp))[0];
  if (mejor && codes.length > 1 && mejor.ing - mejor.gas - mejor.limp > 0) lg.push(['Mejor resultado: ' + mejor.code + ' con ' + money(Math.round(mejor.ing - mejor.gas - mejor.limp)) + '.', '']);
  if (codes.length && F14.ocup >= 60) lg.push(['Próximos 14 días ya al ' + pct(F14.ocup) + ' reservado.', '']);
  if (!huecos.length && codes.length) lg.push(['Todo vendido los próximos 14 días.', '']);
  if (top && top.n && top.p >= 85) lg.push(['Los ' + DSL[top.w] + ' se llenan al ' + Math.round(top.p) + '%.', '']);
  const salidas = activas().filter(r => set.has(r.property_code) && r.checkout >= hoy && r.checkout <= add(hoy, 7) && prop(r.property_code).cleaning !== false).length;
  if (salidas && !sinChica) lg.push(['Las ' + salidas + ' salidas de esta semana ya tienen chica asignada.', '']);
  if (A.res && A.conM === A.res) lg.push(['Todas las reservas del periodo tienen monto.', 'Los ingresos están completos.']);
  if (A.nGas >= 5 && A.sinFoto === 0) lg.push(['Todos los gastos tienen foto de comprobante.', '']);
  if (A.res && A.conM === A.res && A.resultado > 0) lg.push(['Resultado positivo: ' + money(Math.round(A.resultado)) + '.', '']);
  return { P, codes, A, B, F14, al, lg, M, huecos, sem, pct };
}
// Mapa de bloques: parte la lista en dos mitades de peso parecido y divide el rectángulo por su lado más largo.
function stTree(items, x, y, w, h) {
  const L = items.slice().sort((a, b) => b.v - a.v); if (!L.length) return []; if (L.length === 1) return [{ it: L[0], x, y, w, h }];
  const tot = L.reduce((n, i) => n + i.v, 0); let acc = 0, k = 0; while (k < L.length - 1 && acc + L[k].v <= tot / 2) acc += L[k++].v; if (!k) { k = 1; acc = L[0].v; }
  const f = acc / tot, A1 = L.slice(0, k), B1 = L.slice(k);
  return w * 1.6 >= h ? [...stTree(A1, x, y, w * f, h), ...stTree(B1, x + w * f, y, w * (1 - f), h)] : [...stTree(A1, x, y, w, h * f), ...stTree(B1, x, y + h * f, w, h * (1 - f))];
}
const ST_COLS = [['code', 'Depa'], ['ocup', 'Ocup.'], ['noches', 'Noches'], ['ing', 'Ingresos'], ['gas', 'Gastos'], ['limp', 'Limpieza'], ['resu', 'Resultado'], ['tar', 'Tarifa']];
const stFila = d => ({ code: d.code, ocup: d.disp ? d.noches / d.disp * 100 : 0, noches: d.noches, ing: d.ing, gas: d.gas, limp: d.limp, resu: d.ing - d.gas - d.limp, tar: d.mNoches ? d.mMonto / d.mNoches : null });
function stFilas(deps, porTorre) {
  let F = deps.filter(d => d.disp > 0 || d.ing || d.gas);
  if (porTorre) { const T = {}; for (const d of F) { const x = T[d.torre] = T[d.torre] || { code: d.torre, noches: 0, disp: 0, ing: 0, gas: 0, limp: 0, mNoches: 0, mMonto: 0 }; for (const k of ['noches', 'disp', 'ing', 'gas', 'limp', 'mNoches', 'mMonto']) x[k] += d[k]; } F = Object.values(T); }
  const s = S.stSort || { c: 'ocup', d: -1 }, cmp = (a, b) => s.c === 'code' ? String(a.code).localeCompare(String(b.code), 'es', { numeric: true }) : (a[s.c] ?? -Infinity) - (b[s.c] ?? -Infinity);
  return F.map(stFila).sort((a, b) => cmp(a, b) * s.d);
}
VIEWS.stats = () => {
  if (!isSuper()) return '<div class="empty">Solo María y Paco.</div>';
  const per = S.statPer || 'mes', sel = stSel(), G = stGrupos(), X = stDatos(), { P, A, B, F14, al, lg, M, huecos, sem, pct, codes } = X;
  const torres = [...new Set(props().map(p => p.building || 'Sin edificio'))].sort(), o = (t, v, l) => `<option value="${esc(t + '|' + v)}" ${sel.tipo === t && sel.val === v ? 'selected' : ''}>${esc(l)}</option>`;
  // --- filtro fijo: qué se ve y de cuándo ---
  let h = `<div class="stfix"><select data-stsel="1" style="width:100%"><option value="todo|">Toda la gestión (${props().length} depas)</option><optgroup label="Torre">${torres.map(t => o('torre', t, t + ' (' + props().filter(p => (p.building || 'Sin edificio') === t).length + ')')).join('')}</optgroup>${Object.keys(G).length ? `<optgroup label="Grupo">${Object.keys(G).sort().map(g => o('grupo', g, g + ' (' + G[g].length + ')')).join('')}</optgroup>` : ''}<optgroup label="Depa">${props().map(p => o('depa', p.code, p.code)).join('')}</optgroup><option value="nuevo|">＋ Crear grupo de depas…</option></select>`
    + `<div class="seg" style="margin-top:8px;display:flex">${[['mes', 'Este mes'], ['ant', 'Mes pasado'], ['tri', '3 meses'], ['anio', 'Año']].map(([k, l]) => `<button class="sp ${per === k ? 'on' : ''}" data-statper="${k}">${l}</button>`).join('')}</div></div>`;
  if (S.stNuevo) { const dr = S.stNuevo; return h + `<div class="card"><b>Nuevo grupo</b><div class="m" style="margin:4px 0 8px">Toca los depas que entran (por dueño, por tipo, lo que te sirva). Se guarda para todos.</div><input id="stGName" placeholder="Nombre del grupo" value="${esc(dr.name || '')}" style="width:100%;margin-bottom:8px"><div class="chips">${props().map(p => `<button class="chip ${dr.set.has(p.code) ? 'on' : ''}" data-stchip="${esc(p.code)}">${esc(p.code)}</button>`).join('')}</div><div class="row" style="margin-top:12px"><span class="sp m">${dr.set.size} depas</span><button data-stgx="1">Cancelar</button><button class="pri" data-stgsave="1">Guardar grupo</button></div></div>`; }
  h += `<div class="row stinfo" style="margin-bottom:10px"><div class="sp"><b>${esc(stTitulo())}</b> <span class="m">· ${codes.length} depa${codes.length === 1 ? '' : 's'}</span><div class="m">${fmt(A.f)} – ${fmt(add(A.t, -1))}${B ? ' · contra ' + P[4] : ''}</div></div>${sel.tipo === 'grupo' ? `<button data-stgdel="${esc(sel.val)}">Borrar grupo</button>` : ''}<button class="pri" data-stpdf="1">Reporte PDF</button></div>`;
  if (S.stPdf) h += `<div class="card" style="border-left:4px solid var(--acc)"><b>Reporte listo</b><div class="m" style="margin:2px 0 10px">${esc(S.stPdf.name)}</div><div class="row"><button class="pri sp" data-stshare="1">Enviar por WhatsApp / compartir</button><button data-stdl="1">Descargar</button><button data-stpdfx="1">✕</button></div></div>`;
  if (!codes.length) return h + '<div class="empty">Esta selección no tiene depas activos.</div>';
  const lista = (L, cls, vacio) => L.length ? L.map(x => `<div class="${cls}" style="margin-bottom:6px"><b>${esc(x[0])}</b> ${esc(x[1])}</div>`).join('') : `<div class="m">${vacio}</div>`;
  h += `<h2>Logros (${lg.length})</h2><div class="card">${lista(lg, 'stlogro', 'Todavía no hay logros que destacar en esta selección.')}</div><h2>Retos (${al.length})</h2><div class="card">${lista(al, 'warn', 'Sin retos: nada pide atención ahorita.')}</div>`;
  // --- indicadores con semáforo ---
  const delta = (a, b, pts, buenoSube) => { if (!B || b == null || a == null || (!pts && !b)) return ''; const d = pts ? a - b : (a - b) / b * 100; if (Math.abs(d) < 0.5) return ' · igual'; const bien = buenoSube == null ? '' : (d > 0) === buenoSube ? 'ok' : 'mal'; return ` · <b class="st-${bien}">${d > 0 ? '▲' : '▼'} ${Math.abs(Math.round(d * 10) / 10)}${pts ? ' pts' : '%'}</b>`; };
  const k = (cls, v, l, ex) => `<div class="kpi st ${cls ? 'st-k-' + cls : ''}"><div class="v">${v}</div><div class="l">${l}${ex || ''}</div></div>`, parcial = A.conM < A.res;
  h += `<h2>Indicadores</h2><div class="kpis" style="grid-template-columns:repeat(2,1fr)">`
    + k(stSem.ocup(A.ocup), pct(A.ocup), 'Ocupación', delta(A.ocup, B?.ocup, true, true)) + k(stSem.f14(F14.ocup), pct(F14.ocup), 'Reservado · próximos 14 días', '')
    + k(stSem.sube(A.ing, B?.ing), money(Math.round(A.ing)), 'Ingresos registrados', delta(A.ing, B?.ing, false, true)) + k(stSem.baja(A.costo, B?.costo), money(Math.round(A.costo)), 'Gastos + limpieza', delta(A.costo, B?.costo, false, false))
    + k(parcial ? 'med' : A.resultado >= 0 ? 'ok' : 'mal', money(Math.round(A.resultado)), parcial ? 'Resultado parcial (faltan montos)' : 'Resultado', '') + k(stSem.sube(A.tarifa, B?.tarifa), A.tarifa == null ? '—' : money(Math.round(A.tarifa)), 'Tarifa promedio por noche', delta(A.tarifa, B?.tarifa, false, true))
    + k('', A.noches + ' de ' + A.disp, 'Noches ocupadas' + (A.ext ? ' · ' + A.ext + ' por fuera' : ''), '') + k('', A.noches ? money(Math.round(A.costo / A.noches)) : '—', 'Costo por noche ocupada', '')
    + k('', A.res, 'Reservas · estancia ' + (Math.round(A.estancia * 10) / 10) + ' noches', delta(A.res, B?.res, false, true)) + k('', A.limp, 'Limpiezas · ' + money(Math.round(A.limpCosto)), '') + '</div>';
  h += `<div class="m" style="margin:4px 0 10px">Verde = bien, ámbar = atención, rojo = problema. Resultado = ingresos − gastos − limpieza (nómina por limpieza hecha; la lavandería entra cuando se captura como gasto). Solo ${A.conM} de ${A.res} reservas tienen monto.</div>`;
  h += '<!--stsec-->';
  // --- tendencia de 3 meses ---
  const fila = (tit, val, txt) => { const mx = Math.max(1, ...M.map(x => Math.abs(val(x.c)) || 0)); return `<div style="margin-bottom:12px"><div class="m" style="margin-bottom:4px"><b>${tit}</b></div>${M.map(x => `<div class="row" style="gap:8px;margin-bottom:3px"><span class="m" style="width:44px">${MESES[+x.m.slice(5) - 1]}${x.parcial ? '*' : ''}</span><div class="sp" style="background:var(--acc2);border-radius:5px;height:14px;overflow:hidden"><div style="width:${Math.round((Math.abs(val(x.c)) || 0) / mx * 100)}%;height:100%;background:${x.parcial ? 'var(--cobre)' : 'var(--acc)'};border-radius:5px"></div></div><span style="width:78px;text-align:right;font-weight:600;font-size:13px">${txt(x.c)}</span></div>`).join('')}</div>`; };
  h += `<h2>Tendencia · 3 meses</h2><div class="card">` + fila('Ocupación', c => c.ocup, c => pct(c.ocup)) + fila('Gastos + limpieza', c => c.costo, c => money(Math.round(c.costo))) + fila('Ingresos registrados', c => c.ing, c => money(Math.round(c.ing)))
    + fila('Tarifa promedio por noche', c => c.tarifa, c => c.tarifa == null ? '—' : money(Math.round(c.tarifa))) + `<div class="m">* Mes en curso, del día 1 a hoy. Ingresos y tarifa solo son comparables desde noviembre, cuando empezaron a llegar los montos por correo.</div></div>`;
  // --- tú contra la zona en el tiempo (foto mensual del motor de precios) ---
  const PLM = S.t.pl_mensual.slice().sort((a, b) => a.mes.localeCompare(b.mes));
  if (PLM.length) { const par = (tit, tu, zo, txt) => { const mx = Math.max(1, ...PLM.map(x => Math.max(+tu(x) || 0, +zo(x) || 0))); return `<div style="margin-bottom:14px"><div class="m" style="margin-bottom:6px"><b>${tit}</b></div>${PLM.map(x => { const a = +tu(x) || 0, z = +zo(x) || 0, bien = a >= z; return `<div class="row" style="gap:8px;margin-bottom:5px;align-items:flex-start"><span class="m" style="width:34px;padding-top:1px">${MESES[+x.mes.slice(5) - 1]}</span><div class="sp"><div class="ocbar"><i style="width:${Math.round(a / mx * 100)}%;background:${bien ? '#1f6b4a' : '#a3301f'}"></i><b style="left:${Math.min(99, Math.round(z / mx * 100))}%"></b></div></div><span class="m" style="min-width:128px;text-align:right">tú <b style="color:${bien ? '#1f6b4a' : '#a3301f'}">${txt(a)}</b> · zona ${txt(z)}</span></div>`; }).join('')}</div>`; };
    h += `<h2>Tú contra la zona · Motor de precios MGM</h2><div class="card">` + par('Ocupación', x => x.occ, x => x.occ_zona, v => Math.round(v) + '%') + par('Tarifa promedio por noche', x => x.adr, x => x.adr_zona, v => money(Math.round(v))) + par('Ingreso por noche disponible', x => x.revpar, x => x.revpar_zona, v => money(Math.round(v)))
      + `<div class="m">La raya negra es la zona. Verde = arriba de la zona, rojo = abajo. Datos del Motor de precios MGM con los ${PLM[PLM.length - 1].depas} depas que ya tienen un año de historia; es una foto que se actualiza cuando se vuelve a leer el Motor de precios MGM, no en vivo.</div></div>`; }
  // --- tablas ordenables ---
  const srt = S.stSort || { c: 'ocup', d: -1 }, m0 = n => n ? money(Math.round(n)) : '—', TOR = stFilas(A.deps, true), varias = TOR.length > 1;
  const celdas = d => `<td><b class="st-${stSem.ocup(d.ocup)}">${Math.round(d.ocup)}%</b></td><td>${d.noches}</td><td>${m0(d.ing)}</td><td>${m0(d.gas)}</td><td>${m0(d.limp)}</td><td><b class="${d.ing ? (d.resu >= 0 ? 'st-ok' : 'st-mal') : ''}">${d.ing || d.gas || d.limp ? money(Math.round(d.resu)) : '—'}</b></td><td>${d.tar == null ? '—' : money(Math.round(d.tar))}</td>`;
  // --- torres: mapa de bloques (tamaño = noches ocupadas, color = ocupación); tocar una torre filtra todo ---
  if (varias) { const R = stTree(TOR.map(t => ({ ...t, v: Math.max(t.noches, 0.5) })), 0, 0, 100, 100);
    h += `<h2>Torres</h2><div class="card"><div class="sttree">${R.map(r => { const c = stSem.ocup(r.it.ocup), ch = r.w * r.h < 220; return `<button data-stgo="torre|${esc(r.it.code)}" class="st-b-${c}" style="left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%" title="${esc(r.it.code)} · ${Math.round(r.it.ocup)}% · ${r.it.noches} noches"><b>${esc(r.it.code)}</b>${ch ? '' : `<span>${Math.round(r.it.ocup)}% · ${r.it.noches} noches</span>`}</button>`; }).join('')}</div><div class="m" style="margin-top:8px">Tamaño = noches ocupadas · color = ocupación (verde ≥75%, ámbar 50–75%, rojo &lt;50%). Toca una torre para ver solo esa.</div></div>`; }
  // --- por depa, agrupado por torre para comparar torres; ordenable ---
  if (codes.length > 1) { const D2 = stFilas(A.deps, false), torreDe = Object.fromEntries(A.deps.map(d => [d.code, d.torre]));
    h += `<h2>Por depa${varias ? ' · agrupado por torre' : ''}</h2><div class="card scroll"><table class="sttab"><tr>${ST_COLS.map(([c, l]) => `<th><button data-stsort="${c}">${l}${srt.c === c ? (srt.d < 0 ? ' ▼' : ' ▲') : ''}</button></th>`).join('')}</tr>`
      + (varias ? TOR : [null]).map(t => (t ? `<tr class="tap sttorre" data-stgo="torre|${esc(t.code)}"><td>${esc(t.code)} <span class="m">(${D2.filter(d => torreDe[d.code] === t.code).length})</span></td>${celdas(t)}</tr>` : '') + D2.filter(d => !t || torreDe[d.code] === t.code).map(d => `<tr class="tap" data-stgo="depa|${esc(d.code)}"><td class="dp">${varias ? '&nbsp;&nbsp;' : ''}${esc(d.code)}</td>${celdas(d)}</tr>`).join('')).join('')
      + `</table></div><div class="m" style="margin:-4px 0 10px">Toca un encabezado para ordenar (torres y depas se ordenan igual); toca un renglón para ver solo esa torre o ese depa.</div>`; }
  // --- día de la semana y mapa de calor ---
  const calor = p => `background:color-mix(in srgb, var(--acc) ${Math.round(p)}%, var(--acc2))`, DS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  h += `<h2>Qué días se llenan</h2><div class="card"><div class="row" style="gap:6px;align-items:flex-end;height:96px">${sem.map(x => `<div class="sp" style="text-align:center"><div style="font-size:11px;font-weight:600">${Math.round(x.p)}%</div><div style="height:${Math.max(3, Math.round(x.p * 0.6))}px;background:${x.p < 50 ? 'var(--baja)' : x.p < 75 ? 'var(--cambio)' : 'var(--alta)'};border-radius:4px 4px 0 0"></div><div class="m">${DS[x.w]}</div></div>`).join('')}</div>`;
  if (A.dias <= 62) { const pad = (dow(A.f) + 6) % 7; h += `<div class="m" style="margin:10px 0 6px">Ocupación por día (más oscuro = más lleno)</div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<div class="m" style="text-align:center;font-size:11px">${x}</div>`).join('')}${'<div></div>'.repeat(pad)}${Object.keys(A.dia).sort().map(d => { const x = A.dia[d], p = x.n ? x.o / x.n * 100 : 0; return `<div title="${fmt(d)} · ${Math.round(p)}%" style="${calor(p)};border-radius:4px;padding:5px 0;text-align:center;font-size:11px;color:${p > 55 ? '#fff' : 'var(--ink)'}">${+d.slice(8)}</div>`; }).join('')}</div>`; }
  h += '</div>';
  // --- Airbnb vs por fuera ---
  h += `<h2>De dónde vienen las noches</h2><div class="card">${A.noches ? `<div style="display:flex;height:16px;border-radius:6px;overflow:hidden;background:var(--acc2)"><div style="width:${(A.noches - A.ext) / A.noches * 100}%;background:var(--acc)"></div><div style="width:${A.ext / A.noches * 100}%;background:var(--cobre)"></div></div><div class="row" style="margin-top:8px"><span class="sp"><b style="color:var(--acc)">●</b> Airbnb: ${A.noches - A.ext} noches (${Math.round((A.noches - A.ext) / A.noches * 100)}%)</span><span><b style="color:var(--cobre)">●</b> Por fuera: ${A.ext} (${Math.round(A.ext / A.noches * 100)}%)</span></div>` : '<div class="m">Sin noches ocupadas en el periodo.</div>'}${A.ext ? '' : '<div class="m" style="margin-top:6px">Las reservas por fuera se capturan como bloqueo con motivo "Reserva por fuera de Airbnb".</div>'}</div>`;
  // --- huecos vendibles ---
  const libres = huecos.reduce((n, x) => n + x.n, 0), tramo = ([a, b]) => a === b ? fmt(a) : fmt(a) + ' – ' + fmt(b);
  h += `<h2>Huecos por vender · próximos 14 días</h2><div class="card list">${huecos.length ? `<div class="it"><div class="sp"><b>${libres} noches libres</b> en ${huecos.length} depa${huecos.length > 1 ? 's' : ''}</div></div>` + huecos.slice(0, 12).map(x => `<div class="it"><span class="dp">${esc(x.code)}</span><div class="sp m">${x.tr.slice(0, 3).map(tramo).join(' · ')}${x.tr.length > 3 ? ' …' : ''}</div><b class="st-${x.n >= 10 ? 'mal' : x.n >= 5 ? 'med' : 'ok'}">${x.n}</b></div>`).join('') + (huecos.length > 12 ? `<div class="it m">y ${huecos.length - 12} depas más</div>` : '') : '<div class="it m">Todo vendido: no hay noches libres en 14 días.</div>'}</div>`;
  // --- en qué se va el gasto ---
  if (A.cat.length) h += `<h2>En qué se va el gasto</h2><div class="card list">${A.cat.slice(0, 10).map(([c, n]) => `<div class="it"><div class="sp">${esc(c)}</div><span class="m">${Math.round(n / A.costo * 100)}%</span><b style="min-width:84px;text-align:right">${money(Math.round(n))}</b></div>`).join('')}</div>`;
  // Lo de arriba (logros, retos, indicadores) queda a la vista; el resto se pliega con su dato clave en la etiqueta.
  const [arriba, resto] = h.split('<!--stsec-->'), mejorDia = sem.slice().sort((a, b) => b.p - a.p)[0], DL = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  const etiqueta = { 'Tendencia': () => acPill(MESES[+M[2].m.slice(5) - 1].toUpperCase() + ' ' + pct(M[2].c.ocup), stSem.ocup(M[2].c.ocup)), 'Torres': () => acPill(TOR.length + ' TORRES', ''), 'Por depa': () => acPill(codes.length + ' DEPAS', ''),
    'Qué días se llenan': () => mejorDia && mejorDia.n ? acPill('MEJOR: ' + DL[mejorDia.w] + ' ' + Math.round(mejorDia.p) + '%', '') : '', 'De dónde vienen las noches': () => A.noches ? acPill(Math.round((A.noches - A.ext) / A.noches * 100) + '% AIRBNB', '') : '',
    'Tú contra la zona': () => { const u = PLM[PLM.length - 1]; return u ? acPill('TARIFA ' + (u.adr >= u.adr_zona ? '+' : '−') + Math.abs(Math.round((u.adr - u.adr_zona) / u.adr_zona * 100)) + '% VS ZONA', u.adr >= u.adr_zona ? 'ok' : 'med') : ''; }, 'Huecos por vender': () => acPill(libres + ' NOCHES LIBRES', libres ? (libres > codes.length * 5 ? 'mal' : 'med') : 'ok'), 'En qué se va el gasto': () => A.cat[0] ? acPill(A.cat[0][0].split(' (')[0].toUpperCase().slice(0, 22), '') : '' };
  return arriba + '<h2>Detalle</h2><div class="card aclist">' + resto.split('<h2>').filter(Boolean).map(x => { const c = x.indexOf('</h2>'), tit = x.slice(0, c), k = tit.split(' · ')[0]; return acRow('st:' + k, { tit, pills: (etiqueta[k] || (() => ''))(), body: () => x.slice(c + 5) }); }).join('') + '</div>';
};
// Reporte en PDF de la selección y el periodo que están en pantalla. La librería se baja solo cuando se pide.
function stCargaPdf() { return window.jspdf ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'vendor/jspdf-4.2.1.umd.min.js'; s.onload = ok; s.onerror = () => no(new Error('No se pudo cargar el generador de PDF')); document.head.appendChild(s); }); }
async function stPdf() {
  toast('Armando el reporte…'); await stCargaPdf();
  const { P, A, B, F14, al, lg, M, huecos, pct, codes } = stDatos(), doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' }), W = 612, H = 792, mx = 40, VERDE = [47, 79, 67], col = { ok: [30, 125, 79], med: [154, 98, 0], mal: [179, 38, 30], '': [35, 39, 42] };
  const lim = x => String(x).replace(/→/g, 'a').replace(/−/g, '-'); // la tipografía del PDF no trae esos signos
  let y = 0; const m = n => money(Math.round(n)), salto = n => { if (y + n > H - 50) { doc.addPage(); y = 50; } };
  const txt = (s, x, yy, o = {}) => { doc.setFont('helvetica', o.b ? 'bold' : 'normal'); doc.setFontSize(o.s || 10); doc.setTextColor(...(o.c || [35, 39, 42])); doc.text(Array.isArray(s) ? s : lim(s), x, yy, { align: o.a || 'left', maxWidth: o.w }); };
  const h2 = s => { salto(40); y += 24; txt(s.toUpperCase(), mx, y, { b: 1, s: 9, c: [111, 116, 117] }); y += 6; doc.setDrawColor(230, 226, 218); doc.line(mx, y, W - mx, y); y += 14; };
  doc.setFillColor(...VERDE); doc.rect(0, 0, W, 86, 'F'); txt('MGM Housing Management', mx, 36, { b: 1, s: 18, c: [255, 255, 255] }); txt('Reporte · ' + stTitulo() + ' · ' + codes.length + ' depa' + (codes.length === 1 ? '' : 's'), mx, 56, { s: 11, c: [255, 255, 255] });
  txt(fmt(A.f) + ' – ' + fmt(add(A.t, -1)) + ' ' + A.t.slice(0, 4) + (B ? ' · comparado con ' + P[4] : ''), mx, 72, { s: 9, c: [220, 232, 226] }); txt('Generado ' + fmt(today()), W - mx, 72, { s: 9, c: [220, 232, 226], a: 'right' }); y = 86;
  h2('Indicadores'); const parcial = A.conM < A.res, K = [[stSem.ocup(A.ocup), pct(A.ocup), 'Ocupación'], [stSem.f14(F14.ocup), pct(F14.ocup), 'Reservado próx. 14 días'], [stSem.sube(A.ing, B?.ing), m(A.ing), 'Ingresos registrados'], [stSem.baja(A.costo, B?.costo), m(A.costo), 'Gastos + limpieza'],
    [parcial ? 'med' : A.resultado >= 0 ? 'ok' : 'mal', m(A.resultado), parcial ? 'Resultado parcial' : 'Resultado'], [stSem.sube(A.tarifa, B?.tarifa), A.tarifa == null ? '—' : m(A.tarifa), 'Tarifa promedio / noche'], ['', A.noches + ' de ' + A.disp, 'Noches ocupadas' + (A.ext ? ' (' + A.ext + ' por fuera)' : '')], ['', A.res + ' · ' + (Math.round(A.estancia * 10) / 10) + ' n.', 'Reservas · estancia']];
  const kw = (W - 2 * mx - 3 * 10) / 4; K.forEach((x, i) => { const cx = mx + (i % 4) * (kw + 10), cy = y + Math.floor(i / 4) * 62; doc.setDrawColor(230, 226, 218); doc.setFillColor(255, 255, 255); doc.roundedRect(cx, cy, kw, 52, 5, 5, 'FD'); doc.setFillColor(...(x[0] ? col[x[0]] : [200, 200, 196])); doc.rect(cx, cy, 4, 52, 'F'); txt(x[1], cx + 12, cy + 24, { b: 1, s: 15, c: col[x[0]] }); txt(x[2], cx + 12, cy + 40, { s: 8, c: [111, 116, 117] }); }); y += 124;
  if (B) { txt('Contra ' + P[4] + ': ocupación ' + pct(B.ocup) + ' · ingresos ' + m(B.ing) + ' · gastos + limpieza ' + m(B.costo), mx, y, { s: 9, c: [111, 116, 117] }); y += 6; }
  const listaPdf = (tit, L, vacio, c) => { h2(tit + ' (' + L.length + ')'); if (!L.length) { txt(vacio, mx, y, { c: [111, 116, 117] }); y += 12; } for (const a of L) { const T = doc.splitTextToSize(lim(a[0] + ' ' + a[1]), W - 2 * mx - 14); salto(T.length * 13); doc.setFillColor(...c); doc.circle(mx + 3, y - 3, 2.5, 'F'); txt(T, mx + 14, y); y += T.length * 13; } };
  listaPdf('Logros', lg, 'Sin logros que destacar en esta selección.', col.ok); listaPdf('Retos', al, 'Sin retos.', col.mal);
  h2('Tendencia · 3 meses'); const tc = [mx, 160, 270, 380, 490]; ['Mes', 'Ocupación', 'Ingresos', 'Gastos + limpieza', 'Tarifa'].forEach((s, i) => txt(s, tc[i], y, { b: 1, s: 9 })); y += 14;
  for (const x of M) { [MESES_L[+x.m.slice(5) - 1] + (x.parcial ? ' (a hoy)' : ''), pct(x.c.ocup), m(x.c.ing), m(x.c.costo), x.c.tarifa == null ? '—' : m(x.c.tarifa)].forEach((s, i) => txt(s, tc[i], y)); y += 14; }
  const tablaPdf = (tit, F, primera) => { if (!F.length) return; h2(tit); const cx = [mx, 150, 205, 262, 335, 405, 472, 545], head = () => { [primera, 'Ocup.', 'Noches', 'Ingresos', 'Gastos', 'Limpieza', 'Resultado', 'Tarifa'].forEach((s, i) => txt(s, i > 1 ? cx[i] + 28 : cx[i], y, { b: 1, s: 8.5, a: i > 1 ? 'right' : 'left' })); y += 13; }; head();
    for (const d of F) { if (y > H - 60) { doc.addPage(); y = 50; head(); } const v = [d.code, Math.round(d.ocup) + '%', d.noches, d.ing ? m(d.ing) : '—', d.gas ? m(d.gas) : '—', d.limp ? m(d.limp) : '—', d.ing || d.gas || d.limp ? m(d.resu) : '—', d.tar == null ? '—' : m(d.tar)];
      v.forEach((s, i) => txt(s, i > 1 ? cx[i] + 28 : cx[i], y, { s: 9, a: i > 1 ? 'right' : 'left', b: i === 0, c: i === 1 ? col[stSem.ocup(d.ocup)] : i === 6 && d.ing ? col[d.resu >= 0 ? 'ok' : 'mal'] : undefined })); y += 13; } };
  if (stSel().tipo === 'todo' || stSel().tipo === 'grupo') tablaPdf('Por torre', stFilas(A.deps, true), 'Torre');
  if (codes.length > 1) tablaPdf('Por depa', stFilas(A.deps, false), 'Depa');
  if (A.cat.length) { h2('En qué se va el gasto'); for (const [c, n] of A.cat.slice(0, 12)) { salto(14); txt(c, mx, y, { w: 360 }); txt(Math.round(n / A.costo * 100) + '%', 440, y, { a: 'right', c: [111, 116, 117] }); txt(m(n), W - mx, y, { a: 'right', b: 1 }); y += 14; } }
  if (huecos.length) { h2('Huecos por vender · próximos 14 días (' + huecos.reduce((n, x) => n + x.n, 0) + ' noches libres)'); for (const x of huecos.slice(0, 25)) { salto(14); txt(x.code, mx, y, { b: 1 }); txt(x.tr.slice(0, 4).map(([a, b]) => a === b ? fmt(a) : fmt(a) + ' – ' + fmt(b)).join(' · ') + (x.tr.length > 4 ? ' …' : ''), 150, y, { s: 9, c: [111, 116, 117], w: 360 }); txt(x.n + ' noches', W - mx, y, { a: 'right' }); y += 14; } }
  salto(40); y += 18; txt('Ocupación = noches ocupadas (Airbnb + reservas por fuera) entre noches disponibles (sin mantenimiento). Resultado = ingresos − gastos − limpieza (nómina por limpieza hecha).' + (parcial ? ' Solo ' + A.conM + ' de ' + A.res + ' reservas tienen monto: ingresos, tarifa y resultado están incompletos.' : ''), mx, y, { s: 8, c: [111, 116, 117], w: W - 2 * mx });
  const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); txt('MGM Control App · ' + i + ' de ' + n, W / 2, H - 24, { s: 8, c: [150, 150, 146], a: 'center' }); }
  const name = 'MGM ' + stTitulo().replace(/[^\wáéíóúñÁÉÍÓÚÑ -]/g, '') + ' ' + A.f + ' a ' + add(A.t, -1) + '.pdf';
  S.stPdf = { name, blob: doc.output('blob') }; render(); toast('Reporte listo');
}
function pnlForm() {
  const A = pnlRow().data || {}, all = PNLQ.flatMap(s => s[1]);
  const hechas = all.filter(q => q.multi ? (A[q.id] || []).length : A[q.id]).length;
  let h = `<div class="card" style="border-left:4px solid var(--copper,#b0703c)"><div class="row"><b class="sp">P&L (Beta)</b><span class="b">${hechas}/${all.length} respondidas</span></div>
    <div class="m" style="margin-top:6px">Estudié el P&L de Q-104 (octubre). Antes de construir el módulo necesito tus respuestas. Se guardan solas; cuando termines, avísale a Paco para que yo las revise y te haga más preguntas o arme la primera versión.</div>
    <div class="m" style="margin-top:6px">Lo que vamos a construir: <b>1)</b> consulta diaria del P&L por depa y del portafolio, <b>2)</b> corte semanal para ti (ya sale por WhatsApp), <b>3)</b> corte mensual del portafolio y <b>4)</b> un PDF por depa para el dueño, con el look de las propuestas MGM, conservando todo lo que tiene hoy el reporte.</div>
    ${A.updated_by ? '' : ''}</div>`;
  h += `<details class="card"><summary><b>Lo que ya tiene la app y lo que falta</b></summary>
    <div class="m" style="margin-top:8px"><b>Ya lo tenemos:</b> todas las reservas de Airbnb (iCal cada 30 min), huésped y payout de cada reserva (correos reenviados → ingreso automático), bloqueos N/A, gastos con categoría y fotos, pagos de servicios por depa (con su gasto), limpiezas hechas por depa. Con eso salen solos: ocupación, noches promedio, días libres vs rentados y comprobantes.</div>
    <div class="m" style="margin-top:6px"><b>Falta capturar:</b> desglose del pago de Airbnb (comisión, impuestos, retenciones) si se necesita, % de gestión e impuesto por depa, dueño y correo, tarifas de limpieza y lavandería al dueño, ajustes y reembolsos negativos, categoría "Muebles", grupo para "Otro", calificaciones, otros gastos fijos fuera de servicios y liquidación al dueño.</div></details>`;
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
  { const mgm = sAcc().filter(a => a.active !== false && /^mar[ií]a/i.test(a.responsable || '') && !new Set(setting('serv_ocultos', [])).has(a.id)), falta = mgm.filter(a => !sPay(a.id, mesHoy)), porS = SERV.map(([k, l]) => [k, l.split(' ')[0], falta.filter(a => a.service === k).length]).filter(x => x[2]);
    h += `<div class="card ligares st-k-${falta.length ? 'med' : 'ok'}"><div class="row"><span class="ligadot st-b-${falta.length ? 'med' : 'ok'}"></span><div class="sp"><b>${mgm.length - falta.length} de ${mgm.length} cuentas que paga MGM con registro en ${MES3[+mesHoy.slice(5) - 1].toLowerCase()} ${F.y}</b><div class="m">${falta.length ? 'Faltan ' + falta.length + '. Toca un servicio para ver cuáles.' : 'Todo registrado en el mes.'}</div></div></div>${porS.length ? `<div class="chips" style="margin-top:8px">${porS.map(([k, l, n]) => `<button class="chip" data-servfalta="${k}">${esc(l)} · ${n}</button>`).join('')}</div>` : ''}</div>`; }
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
      // El gasto ligado se crea hasta que el pago ya quedó guardado: si salen juntos, la base rechaza el gasto (su liga apunta a un pago que aún no existe) y el P&L queda incompleto.
      let pay, listo; if (ex) { listo = upd('service_payments', { id: ex.id }, row, 'Pago guardado'); pay = { ...ex, ...row }; } else { pay = { id: uid(), ...row, created_by: S.email }; listo = ins('service_payments', pay, 'Pago registrado'); }
      listo.then(ok => { if (ok) syncServicio(pay); });
    } });
}
// ---------- Ficha del depa: alta o edición con todos sus supuestos en un solo lugar ----------
// Nada es obligatorio salvo el código: María va llenando conforme tiene la información y la ficha dice qué falta.
function depaFalta(p) {
  const f = [], ch = S.t.cleaners.filter(c => c.active !== false && c.key !== NA);
  if (!p.building) f.push('edificio');
  if (p.cleaning !== false && !ch.some(c => rate(p.code, c.key) != null)) f.push('tarifa de limpieza');
  if (!p.ical_url && !p.ical_extra) f.push('calendario de Airbnb');
  if (!p.airbnb_url) f.push('liga del anuncio');
  if (!(S.t.service_accounts || []).some(a => a.property_code === p.code || (a.split || []).some(x => x.code === p.code))) f.push('servicios');
  const k = (S.t.access_codes || []).find(x => x.place === p.code); if (!k || !(k.code1 || k.code2)) f.push('clave de acceso');
  return f;
}
function depaForm(code) {
  const p = code ? S.t.properties.find(x => x.code === code) : null, ch = S.t.cleaners.filter(c => c.active !== false && c.key !== NA).sort((a, b) => a.name.localeCompare(b.name));
  const k0 = p ? (S.t.access_codes || []).find(x => x.place === p.code) || {} : {};
  const tiene = s => !!p && (S.t.service_accounts || []).some(a => a.service === s && (a.property_code === p.code || (a.split || []).some(x => x.code === p.code)));
  const values = { code: '', building: p?.building || '', cleaning: String(p ? p.cleaning !== false : true), ical_url: p?.ical_url || '', airbnb_url: p?.airbnb_url || '',
    has_parking: String(!!p?.has_parking), parking_level: p?.parking_level ?? '', lends_parking: String(!!p?.lends_parking), code1: k0.code1 || '', code2: k0.code2 || '' };
  for (const c of ch) values['rate_' + c.key] = p ? rate(p.code, c.key) ?? '' : '';
  for (const [sv] of SERV) values['srv_' + sv] = p ? '' : 'pnl'; // depa nuevo: propone crear sus 5 cuentas de servicio (se puede cambiar a "Todavía no")
  const falta = p ? depaFalta(p) : [];
  openForm({ title: p ? 'Ficha de ' + p.code : 'Agregar depa', values,
    fields: v => [
      { type: 'note', cls: p && !falta.length ? 'm' : 'm warn', html: p ? (falta.length ? '<b>Le falta:</b> ' + esc(falta.join(' · ')) + '. Llena lo que tengas; lo demás puede esperar.' : 'Ficha completa.') : 'Solo el código es obligatorio. Llena lo que tengas ahora y completa el resto después desde la ficha del depa.' },
      !p && { k: 'code', label: 'Código (como sale en el calendario, p. ej. Q-901)', type: 'text' },
      { k: 'building', label: 'Edificio (p. ej. Qalina)', type: 'text' },
      { k: 'cleaning', label: '¿La limpieza la hace MGM?', type: 'select', options: [['true', 'Sí'], ['false', 'No (no pide chica ni entra a nómina)']] },
      ...(v.cleaning === 'true' ? ch.map(c => ({ k: 'rate_' + c.key, label: 'Pago por limpieza · ' + c.name, type: 'number', ph: 'sin tarifa' })) : []),
      { k: 'ical_url', label: 'Calendario de Airbnb (liga .ics)', type: 'url', ph: 'https://www.airbnb.mx/calendar/ical/…' },
      { k: 'airbnb_url', label: 'Liga del anuncio', type: 'url', ph: 'https://www.airbnb.mx/rooms/…' },
      { k: 'has_parking', label: '¿Tiene cajón?', type: 'select', options: [['false', 'No'], ['true', 'Sí']] },
      v.has_parking === 'true' && { k: 'parking_level', label: 'Sótano del cajón', type: 'number' },
      v.has_parking === 'true' && { k: 'lends_parking', label: '¿Presta su cajón?', type: 'select', options: [['false', 'No'], ['true', 'Sí']] },
      { k: 'code1', label: 'Clave de acceso 1', type: 'text' }, { k: 'code2', label: 'Clave de acceso 2', type: 'text' },
      { type: 'note', html: '<b>Servicios</b> · crea aquí las cuentas que falten; contrato, vencimiento y forma de pago se completan después en Servicios.' },
      ...SERV.map(([sv, sl]) => tiene(sv) ? { type: 'note', html: esc(sl) + ': ya tiene cuenta.' } : { k: 'srv_' + sv, label: sl, type: 'select', options: [['', 'Todavía no'], ['pnl', 'Crear · lo paga MGM (va al P&L)'], ['nopnl', 'Crear · lo paga el dueño u otro']] })],
    save: async v => {
      const cod = p ? p.code : (v.code || '').trim();
      if (!cod) return 'Falta el código.';
      if (!p && S.t.properties.some(x => x.code.toLowerCase() === cod.toLowerCase())) return 'Ese depa ya existe.';
      const ical = (v.ical_url || '').trim(); if (ical && !/^https:\/\/[^ ]+\.ics/i.test(ical)) return 'La liga del calendario no parece de Airbnb (.ics). Déjala vacía si aún no la tienes.';
      const row = { building: (v.building || '').trim() || null, cleaning: v.cleaning === 'true', ical_url: ical || null, airbnb_url: (v.airbnb_url || '').trim() || null,
        has_parking: v.has_parking === 'true', parking_level: v.has_parking === 'true' && v.parking_level !== '' ? Number(v.parking_level) : null, lends_parking: v.has_parking === 'true' && v.lends_parking === 'true' };
      if (p) { const cur = k => k === 'cleaning' ? p.cleaning !== false : typeof row[k] === 'boolean' ? !!p[k] : p[k] ?? null, ch2 = Object.fromEntries(Object.entries(row).filter(([k, x]) => cur(k) !== x)); if (Object.keys(ch2).length) await upd('properties', { code: cod }, ch2, 'Ficha guardada'); }
      else await ins('properties', { code: cod, sort: Math.max(0, ...S.t.properties.map(x => x.sort ?? 0)) + 1, active: true, kind: 'depa', ...row }, cod + ' agregado');
      if (v.cleaning === 'true') for (const c of ch) { const n = v['rate_' + c.key], cur = p ? rate(cod, c.key) : null;
        if (n === '' || n == null) { if (cur != null) del('cleaning_rates', { property_code: cod, cleaner_key: c.key }); }
        else if (Number(n) !== cur) ups('cleaning_rates', { property_code: cod, cleaner_key: c.key, amount: Number(n) }, ['property_code', 'cleaner_key']); }
      const c1 = (v.code1 || '').trim() || null, c2 = (v.code2 || '').trim() || null;
      if (c1 !== (k0.code1 || null) || c2 !== (k0.code2 || null)) ups('access_codes', { ...k0, place: cod, code1: c1, code2: c2 }, ['place']);
      for (const [sv] of SERV) if (v['srv_' + sv]) ins('service_accounts', { id: uid(), service: sv, sort: 999, label: cod, property_code: cod, split: null, contrato: null, extra: null, extra_label: { agua: 'Clave', gas: 'Proveedor', internet: 'Proveedor' }[sv] || null, vencimiento: null, responsable: 'María', forma_pago: null, to_pnl: v['srv_' + sv] === 'pnl', active: true });
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
  ['Admin · automatizaciones y WhatsApp', '✏️', '—', '—'],
  ['Avisos de WhatsApp (Claudio)', 'María recibe', '—', '—'],
  ['Respaldo diario (correo 10 pm)', 'María recibe', '—', '—']
];
const ROL_N = { superadmin: 'Superadmin', socio: 'Socio', finanzas: 'Finanzas' };
const haceCuanto = ts => { if (!ts) return 'Nunca ha entrado'; const m = Math.round((Date.now() - new Date(ts)) / 60000);
  return m < 2 ? 'Ahora' : m < 60 ? `Hace ${m} min` : m < 1440 ? `Hace ${Math.round(m / 60)} h` : m < 2880 ? 'Ayer' : `Hace ${Math.round(m / 1440)} días`; };
const AUTOS = [['ical', '🔄 Reservas desde Airbnb (iCal)', 'Cada 30 min: altas, cambios de fechas y cancelaciones'], ['correos', '✉️ Correos de Airbnb', 'Cada 30 min: nombre del huésped, monto e ingreso (solo pesos)'],
  ['resp_correo', '📧 Respaldo diario por correo', 'Todos los días 10 pm'], ['resp_drive', '☁️ Respaldo en Drive', 'Cada 4 h + paquete del lunes + fotos'], ['claves', '🔑 Pendientes de cambio de clave', 'Cada 3 meses, uno por depa']];
// WhatsApp con Claudio: avisos para María. Todo nace APAGADO; ella prende lo que quiera. n8n lee esta configuración (settings.whatsapp).
const DIAS7 = ['D', 'L', 'M', 'M', 'J', 'V', 'S'], TODOS = [0, 1, 2, 3, 4, 5, 6];
const WA = [
  ['arranque', '☀️ Arranque del día', 'Salidas, entradas, quién limpia qué, lo que falta asignar, depas libres y descansos', { hora: '07:30', dias: TODOS }],
  ['asignaciones', '🧹 Asignaciones de mañana', 'El texto por chica listo para reenviar', { hora: '19:00', dias: TODOS, claves: false }],
  ['airbnb', '🔄 Movimientos de Airbnb', 'Reserva nueva, cambio de fechas o cancelación, al momento', { rt: true }],
  ['reasignar', '⚠️ Limpieza afectada por un cambio', 'Cuando una cancelación o cambio mueve una limpieza ya asignada', { rt: true }],
  ['sin_chica', '🙋 Limpieza sin chica', 'Salidas próximas sin chica, o con la chica en descanso', { horas: ['08:00', '18:00'], dias: TODOS, anticipacion: 36 }],
  ['cajones', '🚗 Cajones Qalina', 'Llegadas con auto sin cajón, o sin saber si traen auto', { hora: '20:00', dias: TODOS, anticipacion: 48 }],
  ['nomina', '💵 Corte de nómina', 'La semana que cerró: limpiezas, bonos, total y pagos por chica', { hora: '09:00', dias: [1] }],
  ['servicios', '🧾 Pagos de servicios', 'Pendientes del mes anterior (el día del mes que elijas) y vencimientos de los próximos 7 días', { hora: '09:30', dias: [1], dia_mes: 3 }],
  ['pendientes', '📋 Pendientes', 'Prioridad alta abiertos, vencidos y terminados en la semana', { hora: '08:30', dias: [1] }],
  ['semana', '📊 Semana de negocio', 'Ocupación, ingresos, reservas nuevas y noches libres en 14 días', { hora: '20:00', dias: [0] }]
];
const waCfg = () => { const c = setting('whatsapp', {}) || {}, items = {}; WA.forEach(([k, , , def]) => { items[k] = { on: false, ...def, ...((c.items || {})[k] || {}) }; }); return { on: false, silencio: ['23:00', '07:00'], ...c, items }; };
function waGuardar(fn, msg) { const c = waCfg(); fn(c); c.by = S.me.name || S.me.email; c.at = new Date().toISOString(); return ups('settings', { key: 'whatsapp', value: c }, ['key'], msg || 'Guardado'); }
function waHTML() {
  const c = waCfg(), on = c.on === true;
  const dias = (k, it) => `<div class="row" style="gap:4px;flex-wrap:wrap">${DIAS7.map((l, n) => `<button class="xs ${(it.dias || []).includes(n) ? 'on pri' : ''}" data-wadia="${k}|${n}" ${on && it.on ? '' : 'disabled'}>${l}</button>`).join('')}</div>`;
  const ctl = (k, it) => it.rt ? `<div class="m">Llega cuando pasa, fuera del horario de silencio.</div>` : `<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px">${it.horas ? it.horas.map((h, i) => `<input type="time" value="${h}" data-wa="${k}" data-waf="horas.${i}" ${on && it.on ? '' : 'disabled'}>`).join('') : `<input type="time" value="${it.hora}" data-wa="${k}" data-waf="hora" ${on && it.on ? '' : 'disabled'}>`}
    ${it.anticipacion != null ? `<label class="m">avisar con <select data-wa="${k}" data-waf="anticipacion" ${on && it.on ? '' : 'disabled'}>${[12, 24, 36, 48, 72].map(n => `<option value="${n}" ${+it.anticipacion === n ? 'selected' : ''}>${n} h</option>`).join('')}</select></label>` : ''}
    ${it.dia_mes != null ? `<label class="m">día del mes <select data-wa="${k}" data-waf="dia_mes" ${on && it.on ? '' : 'disabled'}>${Array.from({ length: 28 }, (_, i) => i + 1).map(n => `<option ${+it.dia_mes === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}
    ${it.claves != null ? `<label class="m"><input type="checkbox" data-wa="${k}" data-waf="claves" ${it.claves ? 'checked' : ''} ${on && it.on ? '' : 'disabled'}> con claves</label>` : ''}</div>${dias(k, it)}`;
  const DN = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'], cuando = it => it.rt ? 'AL MOMENTO' : ((it.horas || [it.hora]).join(' y ') + ' · ' + ((it.dias || []).length === 7 ? 'diario' : (it.dias || []).length === 1 ? DN[it.dias[0]] : (it.dias || []).length + ' días')).toUpperCase();
  const nOn = WA.filter(([k]) => c.items[k].on).length;
  return `<h2 style="margin-top:18px">📲 WhatsApp con Claudio</h2>
    <div class="card ligares st-k-${on ? 'ok' : ''}"><div class="row"><span class="ligadot st-b-${on ? 'ok' : 'n'}"></span><div class="sp"><b>${on ? `${nOn} de ${WA.length} avisos prendidos` : 'Avisos por WhatsApp apagados'}</b><div class="m">Claudio te escribe un resumen corto; responde <b>ver</b> para el detalle. Lo que pide acción trae liga directa a la app.</div></div><label class="sw"><input type="checkbox" data-waon="1" ${on ? 'checked' : ''}><span></span></label></div>
    <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><span class="m">Silencio (no manda los de “al momento”) de</span><input type="time" value="${c.silencio[0]}" data-wa="_" data-waf="silencio.0" ${on ? '' : 'disabled'}><span class="m">a</span><input type="time" value="${c.silencio[1]}" data-wa="_" data-waf="silencio.1" ${on ? '' : 'disabled'}></div></div>
    <div class="card aclist${on ? '' : ' off'}">${WA.map(([k, n, dsc]) => { const it = c.items[k]; return acRow('wa:' + k, { tit: n, sub: dsc, pills: it.on ? acPill(cuando(it), '') : acPill('APAGADO', ''), right: `<label class="sw"><input type="checkbox" data-waitem="${k}" ${it.on ? 'checked' : ''} ${on ? '' : 'disabled'}><span></span></label>`,
      body: () => it.on ? ctl(k, it) : '<div class="m">Préndelo con el interruptor para configurar su horario.</div>' }); }).join('')}</div>
    <div class="m">Toca un aviso para cambiar su horario y días. Solo te escribe a ti (nada a huéspedes). Se apaga todo con el interruptor de arriba o con el general de Automatizaciones.</div>`;
}
const autos = () => ({ on: true, ...(setting('automatizaciones', {}) || {}) });
VIEWS.usuarios = () => {
  if (!isSuper()) return '<div class="empty">Solo superadmin.</div>';
  const t = S.usrTab || 'auto', U = S.t.app_users, cnt = r => U.filter(u => u.role === r).length;
  let h = `<div class="seg" style="margin-bottom:12px;display:flex"><button class="sp ${t === 'auto' ? 'on' : ''}" data-usrtab="auto">Automatizaciones</button><button class="sp ${t === 'permisos' ? 'on' : ''}" data-usrtab="permisos">Permisos</button><button class="sp ${t === 'actividad' ? 'on' : ''}" data-usrtab="actividad">Actividad</button><button class="sp ${t === 'sup' ? 'on' : ''}" data-usrtab="sup">Supuestos</button></div>`;
  if (t === 'sup') return h + VIEWS.supuestos();
  if (t === 'auto') {
    const A = autos(), on = A.on !== false, last = setting('airbnb_sync_last', null);
    h += `<div class="card" style="border:2px solid ${on ? '#2e7d4f' : '#c0392b'}"><div class="row"><div class="sp"><div style="font-size:17px;font-weight:600">${on ? '🟢 Automatizaciones prendidas' : '⏸️ Todo en pausa'}</div><div class="m">${on ? 'Si algo falla, apágalo aquí y todo se detiene en la siguiente vuelta.' : 'Nada automático corre. La app sigue funcionando normal a mano.'}</div></div><label class="sw"><input type="checkbox" data-auto="on" ${on ? 'checked' : ''}><span></span></label></div>${A.by ? `<div class="m" style="margin-top:6px">Último cambio: ${esc(A.by)} · ${haceCuanto(A.at)}</div>` : ''}</div>
    <div class="card list${on ? '' : ' off'}">${AUTOS.map(([k, n, dsc]) => `<div class="it"><div class="sp"><div>${n}</div><div class="m">${dsc}${k === 'ical' && last ? ` · última: ${haceCuanto(last.at)}${last.errores?.length ? ' · ⚠️ ' + last.errores.length + ' error(es)' : ''}` : ''}</div></div><label class="sw"><input type="checkbox" data-auto="${k}" ${A[k] !== false ? 'checked' : ''} ${on ? '' : 'disabled'}><span></span></label></div>`).join('')}</div>
    <div class="m">El respaldo de Drive y el del correo te protegen si algo se borra: apágalos solo si ellos son los que fallan.</div>`;
    h += waHTML();
    return h;
  }
  if (t === 'actividad') {
    const L = U.slice().sort((a, b) => (b.last_seen || '').localeCompare(a.last_seen || ''));
    h += `<div class="card list">${L.map(u => `<div class="it"><span class="avatar sm">${avatarHTML(u)}</span><div class="sp"><div>${esc(u.name || u.email)}</div><div class="m">${esc(u.email)}</div></div><div style="text-align:right"><span class="b ${u.role === 'superadmin' ? 'alta' : u.role === 'socio' ? 'cambio' : 'n'}">${ROL_N[u.role] || u.role}</span><div class="m" style="margin-top:4px">${haceCuanto(u.last_seen)}${u.visits ? ' · ' + u.visits + ' visitas' : ''}</div></div></div>`).join('')}</div>
      <div class="m">La actividad se registra desde el 18 nov, cada vez que alguien abre la app. Para agregar o cambiar el tipo de usuario: Menú → Supuestos → Usuarios.</div>`;
    return h;
  }
  h += `<div class="card scroll" style="padding:8px 0"><div class="m" style="padding:0 12px 8px">✏️ ve y edita · 👁 solo ve · — sin acceso · sin $ = no ve montos</div><table class="permt"><tr><th class="dpc">Módulo</th>${['superadmin', 'socio', 'finanzas'].map(r => `<th>${ROL_N[r]}<small>${cnt(r)} · ${esc(U.filter(u => u.role === r).map(u => (u.name || u.email).split(/[ @]/)[0]).join(', '))}</small></th>`).join('')}</tr>
    ${PERM.map(([m, a, b, c]) => `<tr><th class="dpc">${esc(m)}</th>${[a, b, c].map(x => `<td class="${x === '—' ? 'no' : ''}">${esc(x)}</td>`).join('')}</tr>`).join('')}</table></div>
    <div class="m">Personal de limpieza: sin acceso (fase 2: confirmación por WhatsApp). Los permisos también están protegidos en la base de datos, no solo en las pantallas.</div>`;
  return h;
};
// ---------- Estándar "sin amontonar": resumen con semáforo arriba y renglones o secciones que se abren al tocarlos ----------
// La app recuerda en este teléfono qué quedó abierto. Los campos solo existen mientras su renglón está abierto.
const acAb = () => { if (!S.ac) { try { S.ac = new Set(JSON.parse(localStorage.getItem('mgm_ac') || '[]')); } catch (_) { S.ac = new Set(); } } return S.ac; };
function acTog(k, abrir) { const a = acAb(); abrir || !a.has(k) ? a.add(k) : a.delete(k); try { localStorage.setItem('mgm_ac', JSON.stringify([...a].slice(-60))); } catch (_) {} }
const acPill = (t, c) => `<span class="b ${c === 'ok' ? 'alta' : c === 'mal' ? 'baja' : c === 'med' ? 'cambio' : 'n'}">${esc(t)}</span>`;
// Renglón o sección: título, subtítulo, etiquetas de estado, acción a la derecha y cuerpo (función: solo se arma si está abierto).
function acRow(k, o) { const ab = acAb().has(k); return `<div class="acrow" id="ac-${esc(k)}"><div class="achead"><button class="actog sp" data-actog="${esc(k)}" aria-expanded="${ab}"><span class="acti"><span class="${o.dp ? 'dp' : 'act'}">${esc(o.tit)}</span>${o.sub ? `<span class="m">${esc(o.sub)}</span>` : ''}</span>${o.pills || ''}<span class="ligaflecha">${ab ? '▴' : '▾'}</span></button>${o.right || ''}</div>${ab ? `<div class="acbody">${o.body()}</div>` : ''}</div>`; }
// Resumen: semáforo (ok | med | mal | '' neutro), título, texto y grupos de accesos directos [[etiqueta, [[clave, texto], …]], …].
function acResumen(sem, tit, txt, grupos) { return `<div class="card ligares st-k-${sem}"><div class="row"><span class="ligadot st-b-${sem || 'n'}"></span><div class="sp"><b>${esc(tit)}</b><div class="m">${esc(txt)}</div></div></div>${(grupos || []).filter(g => g[1].length).map(g => `<div class="m" style="margin-top:8px"><b>${esc(g[0])}</b></div><div class="chips">${g[1].map(([k, t]) => `<button class="chip" data-actog="${esc(k)}" data-acir="1">${esc(t)}</button>`).join('')}</div>`).join('')}</div>`; }
// Ligas y calendarios: resumen con semáforo arriba y un renglón por depa que se abre al tocarlo (así no se amontonan los campos).
function ligaEstado(p) { // estado del calendario de Airbnb de un depa: ok | falta | error
  const last = setting('airbnb_sync_last', null), err = (last?.errores || []).find(e => String(e).startsWith(p.code + ':'));
  if (!p.ical_url && !p.ical_extra) return { e: 'falta', t: 'Sin calendario' };
  return err ? { e: 'error', t: String(err).slice(p.code.length + 1).trim() || 'Falló la última lectura' } : { e: 'ok', t: 'Calendario al día' };
}
VIEWS.ligas = () => {
  const D = props(), sup = isSuper(), ab = S.ligaAb || (S.ligaAb = new Set()), E = Object.fromEntries(D.map(p => [p.code, ligaEstado(p)]));
  let h = '';
  if (sup) {
    const last = setting('airbnb_sync_last', null), on = autos().on !== false && autos().ical !== false, min = last?.at ? Math.round((Date.now() - new Date(last.at)) / 60000) : null;
    const con = D.filter(p => E[p.code].e !== 'falta'), falta = D.filter(p => E[p.code].e === 'falta'), mal = D.filter(p => E[p.code].e === 'error'), sinLiga = D.filter(p => !p.airbnb_url), viejo = min == null || min > 120;
    const sem = mal.length || !on || (con.length && viejo) ? 'mal' : falta.length ? 'med' : 'ok';
    const txt = !on ? 'La sincronización con Airbnb está apagada en Automatizaciones.' : mal.length ? `${mal.length} calendario${mal.length > 1 ? 's' : ''} con error en la última lectura.` : con.length && viejo ? `Los calendarios no se leen desde hace ${min == null ? 'mucho' : min > 1440 ? Math.round(min / 1440) + ' días' : Math.round(min / 60) + ' h'}.` : falta.length ? `Los conectados están al día; ${falta.length} depa${falta.length > 1 ? 's' : ''} sin calendario.` : 'Todo bien: todos los calendarios al día.';
    const chips = (L, cls) => L.map(p => `<button class="chip ${cls}" data-ligatog="${esc(p.code)}" data-ligair="1">${esc(p.code)}</button>`).join('');
    h += `<div class="card ligares st-k-${sem}"><div class="row"><span class="ligadot st-b-${sem}"></span><div class="sp"><b>${con.length} de ${D.length} depas conectados a Airbnb</b><div class="m">${txt}</div></div></div>`
      + `<div class="m" style="margin-top:8px">${min == null ? 'Sin lecturas todavía' : 'Última lectura hace ' + (min < 60 ? min + ' min' : min < 1440 ? Math.round(min / 60) + ' h' : Math.round(min / 1440) + ' días')} · se leen cada 30 min · ${D.length - sinLiga.length} de ${D.length} con liga del anuncio</div>`
      + (mal.length ? `<div class="m" style="margin-top:8px"><b class="st-mal">Con error:</b></div><div class="chips">${chips(mal, '')}</div>` : '') + (falta.length ? `<div class="m" style="margin-top:8px"><b>Sin calendario:</b></div><div class="chips">${chips(falta, '')}</div>` : '')
      + (sinLiga.length ? `<div class="m" style="margin-top:8px"><b>Sin liga del anuncio:</b></div><div class="chips">${chips(sinLiga, '')}</div>` : '') + '</div>';
  }
  h += '<div class="card list">' + D.map(p => { const o = ab.has(p.code), e = E[p.code];
    return `<div class="it ligait" id="liga-${esc(p.code)}"><button class="ligatog sp" data-ligatog="${esc(p.code)}" aria-expanded="${o}"><span class="dp">${esc(p.code)}</span>${sup ? `<span class="b ${e.e === 'ok' ? 'alta' : e.e === 'error' ? 'baja' : 'n'}">${e.e === 'ok' ? 'CALENDARIO OK' : e.e === 'error' ? 'ERROR' : 'SIN CALENDARIO'}</span>` : ''}${p.airbnb_url ? '' : '<span class="b n">SIN LIGA</span>'}<span class="ligaflecha">${o ? '▴' : '▾'}</span></button>${p.airbnb_url ? `<button class="pri" data-copyurl="${esc(p.code)}">Copiar</button>` : ''}</div>`
      + (o ? `<div class="ligadet">${p.airbnb_url ? `<a href="${esc(p.airbnb_url)}" target="_blank" rel="noopener">Abrir el anuncio</a>` : ''}<div class="m" style="margin-top:6px">Liga del anuncio</div><input style="width:100%;margin-top:4px" type="url" inputmode="url" placeholder="https://airbnb.mx/h/…" data-url="${esc(p.code)}" value="${esc(p.airbnb_url || '')}">`
        + (sup ? `<div class="m" style="margin-top:10px">Calendario iCal (Airbnb → Calendario → Disponibilidad → Exportar) · <b class="${e.e === 'ok' ? 'st-ok' : e.e === 'error' ? 'st-mal' : ''}">${esc(e.t)}</b></div><input style="width:100%;margin-top:4px" type="url" inputmode="url" placeholder="https://www.airbnb.mx/calendar/ical/….ics?s=…" data-ical="${esc(p.code)}" value="${esc(p.ical_url || '')}">` : '') + '</div>' : ''); }).join('') + '</div>';
  return h;
};

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
  const RCD = setting('renta_cajon_depa', {}) || {}, RB = Number(setting('renta_cajon', 500)), bono = Number(setting('bono_domingo', 50)), P = props();
  const DEP = S.t.properties.filter(p => !esCajon(p)).sort((a, b) => (a.active === false) - (b.active === false) || (a.sort ?? 0) - (b.sort ?? 0) || a.code.localeCompare(b.code));
  const incom = P.filter(p => depaFalta(p).length), CH = S.t.cleaners.filter(c => c.key !== NA), chAct = CH.filter(c => c.active !== false), QA = [...P, ...cajonesSueltos()].filter(p => p.building === 'Qalina');
  const sinTar = P.filter(p => p.cleaning !== false && !chAct.some(c => rate(p.code, c.key) != null)), sinCal = P.filter(p => !p.ical_url && !p.ical_extra), aCargo = P.filter(p => p.cleaning !== false).length, be = setting('backup_emails', []), nBe = (Array.isArray(be) ? be : []).length;
  const pend = [sinTar.length && [sinTar.length + ' depa' + (sinTar.length > 1 ? 's' : '') + ' sin tarifa de limpieza', 'su:depas'], sinCal.length && [sinCal.length + ' sin calendario de Airbnb', 'su:depas'], incom.length && [incom.length + ' con ficha incompleta', 'su:depas'], !nBe && ['Respaldo sin correos', 'su:respaldo']].filter(Boolean);
  let h = acResumen(pend.length ? 'med' : 'ok', pend.length ? `Supuestos: ${pend.length} cosa${pend.length > 1 ? 's' : ''} por completar` : 'Supuestos al día', pend.length ? 'Toca un pendiente para ir directo.' : 'No falta nada por configurar.', [['Pendientes:', pend.map(([t, k]) => [k, t])]]) + '<div class="card aclist">';
  h += acRow('su:depas', { tit: 'Depas', sub: 'Activar, agregar y ficha de cada depa', pills: acPill(P.length + ' ACTIVOS', 'ok') + (incom.length ? acPill(incom.length + ' INCOMPLETOS', 'med') : ''), right: '<button data-newdepa="1">＋ Agregar</button>',
    body: () => `<div class="m" style="margin-bottom:6px">Toca Ficha para ver o completar todo lo de un depa (edificio, tarifas, calendario, cajón, claves, servicios); nada es obligatorio. Desactivar un depa lo quita del calendario, de Hoy y de la sincronización con Airbnb. Su historial se conserva.</div><div class="list">${DEP.map(p => `<div class="it"><span class="dp">${esc(p.code)}</span><div class="sp"><span class="m">${esc(p.building || '')}${p.ical_url || p.ical_extra ? ' · 🔄 Airbnb' : ''}</span>${p.active === false ? ' <span class="b baja">INACTIVO</span>' : ''}${p.active !== false && depaFalta(p).length ? ` <span class="b cambio" title="${esc(depaFalta(p).join(', '))}">FALTAN ${depaFalta(p).length}</span>` : ''}</div><button data-depaficha="${esc(p.code)}">Ficha</button><button data-togdepa="${esc(p.code)}" class="${p.active === false ? 'pri' : ''}">${p.active === false ? 'Activar' : 'Desactivar'}</button></div>`).join('')}</div>` });
  h += acRow('su:limpieza', { tit: 'Limpieza a cargo de MGM', sub: 'Qué depas limpiamos nosotros', pills: acPill(aCargo + ' DE ' + P.length, aCargo ? 'ok' : ''),
    body: () => `<div class="m" style="margin-bottom:6px">Desmarca los depas cuya limpieza no hacemos: no pedirán asignar chica ni entran a nómina.</div><div class="chips">${P.map(p => `<label class="chip ${p.cleaning !== false ? 'on' : ''}"><input type="checkbox" class="chk" data-pp="${esc(p.code)}|cleaning" ${p.cleaning !== false ? 'checked' : ''}> ${esc(p.code)}</label>`).join('')}</div>` });
  h += acRow('su:chicas', { tit: 'Chicas', sub: 'Personal de limpieza', pills: acPill(chAct.length + ' ACTIVAS', 'ok') + (CH.length > chAct.length ? acPill((CH.length - chAct.length) + ' INACTIVAS', '') : ''), right: '<button data-newcleaner="1">＋ Agregar</button>',
    body: () => `<div class="list">${CH.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => `<div class="it"><span class="b n">${esc(c.key)}</span><div class="sp">${esc(c.name)}${c.active === false ? ' <span class="m">(inactiva)</span>' : ''}</div><button data-togcleaner="${esc(c.key)}">${c.active === false ? 'Activar' : 'Desactivar'}</button></div>`).join('')}</div>` });
  h += acRow('su:nomina', { tit: 'Bono y renta base', sub: 'Bono de domingo y renta mensual de cajón', pills: acPill(money(bono) + ' · ' + money(RB), ''),
    body: () => `<div class="row"><span class="sp">Bono por limpieza en domingo</span><input type="number" style="width:90px" data-set="bono_domingo" value="${bono}"></div><div class="row" style="margin-top:8px"><span class="sp">Renta mensual por cajón prestado</span><input type="number" style="width:90px" data-set="renta_cajon" value="${RB}"></div>` });
  h += acRow('su:cajones', { tit: 'Cajones Qalina', sub: 'Quién tiene, sótano, quién presta y renta', pills: acPill(QA.filter(p => p.has_parking).length + ' CAJONES', 'ok') + acPill(QA.filter(p => p.lends_parking).length + ' PRESTAN', ''),
    body: () => `<div class="scroll"><table><tr><th>Depa</th><th>Tiene</th><th>Sótano</th><th>Presta</th><th>Renta/mes</th></tr>${QA.map(p => `<tr><td class="dp">${esc(p.code)}</td><td><input type="checkbox" class="chk" data-pp="${esc(p.code)}|has_parking" ${p.has_parking ? 'checked' : ''}></td><td><input type="number" style="width:60px" data-pp="${esc(p.code)}|parking_level" value="${p.parking_level ?? ''}"></td><td><input type="checkbox" class="chk" data-pp="${esc(p.code)}|lends_parking" ${p.lends_parking ? 'checked' : ''}></td><td>${p.lends_parking ? `<input type="number" style="width:80px" data-rcd="${esc(p.code)}" placeholder="${RB}" value="${RCD[p.code] ?? ''}">` : ''}</td></tr>`).join('')}</table></div><div class="m" style="margin-top:6px">Renta base ${money(RB)} al mes (se cambia en "Bono y renta base"). Si un cajón cobra más, ponlo en su renglón; vacío = base.</div>` });
  h += acRow('su:usuarios', { tit: 'Usuarios', sub: 'Quién entra y con qué permisos', pills: acPill(S.t.app_users.length + ' USUARIOS', 'ok'), right: '<button data-newuser="1">＋ Agregar</button>',
    body: () => `<div class="list">${S.t.app_users.map(u => `<div class="it"><span class="avatar sm">${avatarHTML(u)}</span><div class="sp"><div>${esc(u.name || u.email)}</div><div class="m">${esc(u.email)} </div></div>${u.email.toLowerCase() === S.email.toLowerCase() ? '<span class="m">tú</span>' : `<select data-urole="${esc(u.email)}">${ROLE_OPTS.map(([v]) => `<option value="${v}" ${u.role === v ? 'selected' : ''}>${v === 'superadmin' ? 'Superadmin' : v === 'socio' ? 'Socio' : 'Finanzas'}</option>`).join('')}</select><button data-deluser="${esc(u.email)}">Quitar</button>`}</div>`).join('')}</div>` });
  h += acRow('su:respaldo', { tit: 'Respaldo diario', sub: 'Excel de toda la operación a las 10:00 pm', pills: acPill(nBe ? nBe + ' CORREO' + (nBe > 1 ? 'S' : '') : 'SIN CORREOS', nBe ? 'ok' : 'med'),
    body: () => `<div class="m">Todos los días a las 10:00 pm se envía un Excel con toda la operación (calendario, reservas, nómina, gastos e ingresos, pendientes, compras…) a estos correos, separados por coma:</div><input style="width:100%;margin:8px 0" data-backup="1" value="${esc((Array.isArray(be) ? be : []).join(', '))}"><div class="row"><span class="m sp">Las claves de puerta no se incluyen.</span><button data-expbackup="1">Descargar respaldo ahora</button></div>` });
  h += `</div><div class="card row"><div class="sp m">${esc(S.email)}</div><button data-logout="1">Cerrar sesión</button></div>`;
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
  const el = e.target.closest('button,[data-res],[data-tx],[data-task],[data-buy],[data-extra],[data-servpay],[data-servacc],[data-servhide],[data-stgo]'); if (!el) return; const d = el.dataset;
  if (d.asig) return sheetAsignar(d.asig);
  if (d.extra) return extraForm(d.extra);
  if (d.newextra) return extraForm(null);
  if (d.synok) { const ids = d.synok === '*' ? S.t.sync_log.filter(x => !x.seen && x.action !== 'claudio').map(x => x.id) : d.synok === 'claudio' ? S.t.sync_log.filter(x => !x.seen && x.action === 'claudio').map(x => x.id) : [d.synok]; for (const id of ids) await upd('sync_log', { id }, { seen: true }, ids.length > 1 ? null : 'Listo'); if (ids.length > 1) toast('Todo visto'); return; }
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
  if (d.ocdias) { S.ocDias = +d.ocdias; return render(); }
  if (d.octab) { S.ocTab = d.octab; return render(); }
  if (d.pltab) { S.plTab = d.pltab; return render(); }
  if (d.plr) { [S.plF, S.plT] = d.plr.split('|'); S.plPdf = null; return render(); }
  if (d.plpdf) return plPdf().catch(err => { toast('No se pudo armar el PDF'); window.MGM_AN?.error?.(err, { donde: 'plPdf' }); });
  if (d.pldl && S.plPdf) { const a = document.createElement('a'); a.href = URL.createObjectURL(S.plPdf.blob); a.download = S.plPdf.name; document.body.appendChild(a); a.click(); a.remove(); return; }
  if (d.plshare && S.plPdf) { const fl = new File([S.plPdf.blob], S.plPdf.name, { type: 'application/pdf' }); if (navigator.canShare && navigator.canShare({ files: [fl] })) return navigator.share({ files: [fl], title: S.plPdf.name, text: 'Estado de resultados MGM' }).catch(() => {}); return toast('Este navegador no adjunta archivos: descárgalo y adjúntalo a tu correo.'); }
  if (d.ochoy) { S.ocTab = 'res'; S.ocRev = { id: d.ochoy, paso: 1 }; return go('ocupacion'); }
  if (d.octipo !== undefined) { S.ocTipo = d.octipo; S.ocMas = false; return render(); }
  if (d.ocmas) { S.ocMas = !S.ocMas; return render(); }
  if (d.ocrev) { S.ocRev = { id: d.ocrev, paso: 1 }; return render(); }
  if (d.ocstats) { acTog('st:Tú contra la zona', true); go('stats'); setTimeout(() => document.getElementById('ac-st:Tú contra la zona')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150); return; }
  if (d.ocact) { const R = S.ocRev, i = R && S.t.pl_ideas.find(x => x.id === R.id); if (!i) { S.ocRev = null; return render(); }
    const base = { idea_id: i.id, code: i.code, titulo: i.titulo, antes: i.antes, nuevo: i.nuevo, moneda: i.moneda };
    if (d.ocact === 'cerrar') { S.ocRev = null; return render(); }
    if (d.ocact === 'volver') { R.paso = 1; return render(); }
    if (!ocDecide()) { S.ocRev = null; toast('Solo María puede decidir cambios de precio.'); return render(); }
    if (d.ocact === 'aprobar') { R.paso = 2; return render(); }
    if (d.ocact === 'confirmar') { R.paso = 3; return ocGuarda({ ...base, estado: 'aprobada', pendiente: ocAuto(base) ? 'aplicar' : null }, 'Orden registrada'); }
    if (d.ocact === 'aplicada') { const x = ocEstado()[i.id]; S.ocRev = null; if (x) { x.estado = 'aplicada'; x.pendiente = null; render(); return done(DB.update('precio_decisiones', { id: x.id }, { estado: 'aplicada', pendiente: null }), 'precio_decisiones', 'Marcada como aplicada', 'cambio'); } return render(); }
    if (d.ocact === 'atendida') { S.ocRev = null; return ocGuarda({ ...base, estado: 'aplicada' }, 'Marcada como atendida'); }
    if (d.ocact === 'despues') { S.ocRev = null; return ocGuarda({ ...base, estado: 'despues' }, 'Regresa mañana'); }
    if (d.ocact === 'ignorar') { S.ocRev = null; return ocGuarda({ ...base, estado: 'ignorada' }, 'Ignorada · se puede reactivar en Historial'); }
    return; }
  if (d.ocmarca) { if (!ocDecide()) return toast('Solo María.'); const x = S.t.precio_decisiones.find(r => r.id === d.ocmarca); if (!x) return; x.estado = 'aplicada'; x.pendiente = null; render(); return done(DB.update('precio_decisiones', { id: x.id }, { estado: 'aplicada', pendiente: null }), 'precio_decisiones', 'Marcada como aplicada', 'cambio'); }
  if (d.ocdes) { if (!ocDecide()) return toast('Solo María puede deshacer.'); if (!confirmTap(el)) return; const x = S.t.precio_decisiones.find(r => r.id === d.ocdes); if (!x) return;
    const precio = x.antes != null && x.nuevo != null, aplicada = x.estado === 'aplicada';
    const auto = ocAuto(x), rev = auto && aplicada;
    // Si la orden aún no se aplicaba, se cancela ahí mismo: el sistema ya no la ejecuta.
    if (x.pendiente) { x.pendiente = null; DB.update('precio_decisiones', { id: x.id }, { pendiente: null }); }
    return ocGuarda({ idea_id: x.idea_id, code: x.code, titulo: x.titulo, antes: x.antes, nuevo: x.nuevo, moneda: x.moneda, estado: 'revertida', pendiente: rev ? 'revertir' : null,
      nota: rev ? 'El sistema regresará el precio base de ' + x.code + ' a ' + ocMon(x.antes, x.moneda) + ' ' + OC_PASADA + '.' : precio && aplicada ? 'Regresa el precio base de ' + x.code + ' a ' + ocMon(x.antes, x.moneda) + ' en el Motor de precios MGM.' : 'Decisión deshecha; la idea vuelve a la lista.' },
      rev ? 'Reversa pedida · el sistema regresa el precio a ' + ocMon(x.antes, x.moneda) : 'Deshecho'); }
  if (d.usrtab) { S.usrTab = d.usrtab; return render(); }
  if (d.servfalta) { S.f.serv.s = d.servfalta; S.f.serv.solo = 'falta'; return render(); }
  if (d.actog) { acTog(d.actog, !!d.acir); render(); if (d.acir) document.getElementById('ac-' + d.actog)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  if (d.copyclave) { const c = S.t.access_codes.find(x => x.place === d.copyclave) || {}; try { await navigator.clipboard.writeText([c.code1, c.code2].filter(Boolean).join(' / ')); toast('Clave copiada'); } catch (_) { toast('No se pudo copiar'); } return; }
  if (d.ligatog) { const ab = S.ligaAb || (S.ligaAb = new Set()); if (d.ligair) ab.add(d.ligatog); else ab.has(d.ligatog) ? ab.delete(d.ligatog) : ab.add(d.ligatog); render(); if (d.ligair) document.getElementById('liga-' + d.ligatog)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  if (d.statper) { S.statPer = d.statper; return render(); }
  if (d.stsort) { const c = S.stSort || { c: 'ocup', d: -1 }; S.stSort = { c: d.stsort, d: c.c === d.stsort ? -c.d : d.stsort === 'code' ? 1 : -1 }; return render(); }
  if (d.stgo) { const [tipo, ...v] = d.stgo.split('|'); S.stSel = { tipo, val: v.join('|') }; S.stPdf = null; S.plPdf = null; render(); return window.scrollTo(0, 0); }
  if (d.stchip) { const n = S.stNuevo; n.name = $('stGName')?.value || ''; n.set.has(d.stchip) ? n.set.delete(d.stchip) : n.set.add(d.stchip); return render(); }
  if (d.stgx) { S.stNuevo = null; return render(); }
  if (d.stgsave) { const n = S.stNuevo, name = ($('stGName')?.value || '').trim(); if (!name) return toast('Ponle nombre al grupo'); if (!n.set.size) return toast('Elige al menos un depa'); S.stNuevo = null; S.stSel = { tipo: 'grupo', val: name }; return ups('settings', { key: 'stat_grupos', value: { ...stGrupos(), [name]: [...n.set] } }, ['key'], 'Grupo guardado'); }
  if (d.stgdel) { if (!confirmTap(el)) return; const G = { ...stGrupos() }; delete G[d.stgdel]; S.stSel = { tipo: 'todo', val: '' }; return ups('settings', { key: 'stat_grupos', value: G }, ['key'], 'Grupo borrado'); }
  if (d.stpdf) return stPdf().catch(err => { toast('No se pudo armar el PDF'); window.MGM_AN?.error?.(err, { donde: 'stPdf' }); });
  if (d.stpdfx) { S.stPdf = null; return render(); }
  if (d.stdl && S.stPdf) { const a = document.createElement('a'); a.href = URL.createObjectURL(S.stPdf.blob); a.download = S.stPdf.name; document.body.appendChild(a); a.click(); a.remove(); return; }
  if (d.stshare && S.stPdf) { const f = new File([S.stPdf.blob], S.stPdf.name, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) return navigator.share({ files: [f], title: S.stPdf.name }).catch(() => {});
    toast('Este navegador no deja compartir archivos; se descarga para que lo adjuntes'); const a = document.createElement('a'); a.href = URL.createObjectURL(S.stPdf.blob); a.download = S.stPdf.name; document.body.appendChild(a); a.click(); a.remove(); return; }
  if (d.blkind) { const b = S.t.blocks.find(x => x.id === d.blkind); if (b) return upd('blocks', { id: b.id }, { kind: b.kind === 'externa' ? 'mantenimiento' : 'externa' }, b.kind === 'externa' ? 'Ahora es mantenimiento' : 'Ahora es reserva por fuera'); }
  if (d.waopen) return sheetWA();
  if (d.asigwa) return sheetAsigWA();
  if (d.undo) return deshacer();
  if (d.pnlq) { const x = $('pnlQ').value.trim(); if (!x) return toast('Escribe tu pregunta'); return ins('pnl_beta', { id: uid(), data: { texto: x }, updated_by: S.email, updated_at: new Date().toISOString() }, 'Pregunta enviada'); }
  if (d.pnldel) return del('pnl_beta', { id: d.pnldel }, 'Pregunta borrada');
  if (d.calv) { S.calV = d.calv; ls.set('mgm-calv', S.calV); return render(); }
  if (d.zoom) { S.zoom = Math.min(1.4, Math.max(0.3, Math.round((S.zoom + 0.1 * +d.zoom) * 10) / 10)); ls.set('mgm-zoom', S.zoom); return render(); }
  if (d.dn) { S.dia = +d.dn ? add(S.dia, +d.dn) : today(); return render(); }
  if (d.wn) { S.semana = +d.wn ? add(S.semana, 7 * +d.wn) : monday(today()); return render(); }
  if (d.car) { const v = d.v === '1'; return upd('reservations', { id: d.car }, v ? { has_car: true } : { has_car: false, parking_from: null }); }
  if (d.otro) return otroForm(d.otro);
  if (d.wadia) { const [k, n] = d.wadia.split('|'); return waGuardar(c => { const ds = new Set(c.items[k].dias || []); ds.has(+n) ? ds.delete(+n) : ds.add(+n); c.items[k].dias = [...ds].sort(); }); }
  if (d.pago) return pagoForm(d.pago);
  if (d.copynom) { try { await navigator.clipboard.writeText(textoNomina(d.copynom, S.semana)); toast('Copiado: nómina de ' + nombre(d.copynom)); } catch (_) { toast('No se pudo copiar'); } return; }
  if (d.copyurl) { try { await navigator.clipboard.writeText(prop(d.copyurl).airbnb_url); toast('Liga copiada'); } catch (_) { toast('No se pudo copiar'); } return; }
  if (d.del) { if (!confirmTap(el)) return; const [t, id] = d.del.split('|'); return del(t, { id }, 'Quitado'); }
  if (d.export) { AN.evento('exportar', { tipo: 'finanzas_' + d.export }); return exportFin(d.export); }
  if (d.expcal) { AN.evento('exportar', { tipo: 'calendario' }); return exportCal(); }
  if (d.expbackup) { AN.evento('exportar', { tipo: 'respaldo' }); return exportBackup(); }
  if (d.addoff) { const date = $('offDate').value, k = $('offK').value; if (!date || !k) return; return ups('days_off', { date, cleaner_key: k }, ['date', 'cleaner_key'], 'Descanso agregado'); }
  if (d.deloff) { const [date, k] = d.deloff.split('|'); return del('days_off', { date, cleaner_key: k }); }
  if (d.togcleaner) { const c = S.t.cleaners.find(x => x.key === d.togcleaner); return upd('cleaners', { key: c.key }, { active: c.active === false }); }
  if (d.togdepa) { const p = S.t.properties.find(x => x.code === d.togdepa), on = p.active === false; if (!on && !confirmTap(el)) return; return upd('properties', { code: p.code }, { active: on }, on ? p.code + ' activado' : p.code + ' desactivado'); }
  if (d.newdepa) return depaForm(null);
  if (d.depaficha) return depaForm(d.depaficha);
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
  if (d.oct) { S.ocT = t.value; return render(); }
  if (d.plf) { if (t.value) { S.plF = t.value; if (plRango()[1] < S.plF) S.plT = S.plF; S.plPdf = null; } return render(); }
  if (d.plt) { if (t.value) { S.plT = t.value; if (plRango()[0] > S.plT) S.plF = S.plT; S.plPdf = null; } return render(); }
  if (d.stsel) { const [tipo, ...v] = t.value.split('|'); S.stPdf = null; S.plPdf = null; if (tipo === 'nuevo') S.stNuevo = { name: '', set: new Set() }; else { S.stNuevo = null; S.stSel = { tipo, val: v.join('|') }; } return render(); }
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
  if (d.rcd) { const R = { ...(setting('renta_cajon_depa', {}) || {}) }; if (t.value === '') delete R[d.rcd]; else R[d.rcd] = Number(t.value); return ups('settings', { key: 'renta_cajon_depa', value: R }, ['key'], 'Renta guardada'); }
  if (d.pp) { const [p, f] = d.pp.split('|'); return upd('properties', { code: p }, { [f]: t.type === 'checkbox' ? t.checked : t.value === '' ? null : Number(t.value) }, 'Guardado'); }
  if (d.backup) return ups('settings', { key: 'backup_emails', value: t.value.split(',').map(x => x.trim().toLowerCase()).filter(x => /^\S+@\S+\.\S+$/.test(x)) }, ['key'], 'Correos de respaldo guardados');
  if (d.avatar && t.files && t.files[0]) { const f = t.files[0]; t.value = ''; avatarImg(f).then(setAvatar).catch(() => toast('No se pudo leer la imagen')); return; }
  if (d.myname) { S.me.name = t.value.trim() || null; return upd('app_users', { email: S.me.email }, { name: S.me.name }, 'Nombre guardado'); }
  if (d.urole) return upd('app_users', { email: d.urole }, { role: t.value }, 'Acceso actualizado');
  if (d.set) return ups('settings', { key: d.set, value: Number(t.value) || 0 }, ['key'], 'Guardado');
  if (d.code) { const [place, f] = d.code.split('|'); const cur = S.t.access_codes.find(x => x.place === place) || { place, code1: null, code2: null }; return ups('access_codes', { ...cur, [f]: t.value.trim() || null }, ['place'], 'Clave guardada'); }
  if (d.url !== undefined) return upd('properties', { code: d.url }, { airbnb_url: t.value.trim() || null }, 'Liga guardada');
  if (d.waon) return waGuardar(c => { c.on = t.checked; }, t.checked ? 'Avisos por WhatsApp prendidos' : 'Avisos por WhatsApp apagados');
  if (d.waitem) return waGuardar(c => { c.items[d.waitem].on = t.checked; }, t.checked ? 'Prendido' : 'Apagado');
  if (d.wa) return waGuardar(c => { const [f, i] = d.waf.split('.'), obj = d.wa === '_' ? c : c.items[d.wa], v = t.type === 'checkbox' ? t.checked : t.type === 'time' ? t.value : Number(t.value); if (i != null) { obj[f] = (obj[f] || []).slice(); obj[f][+i] = v; } else obj[f] = v; });
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
