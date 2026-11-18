// @ts-nocheck  (incluye JS sin tipos del constructor de Excel)
// daily-backup · MGM Control App
// Todos los días a las 22:00 (Guadalajara) manda un Excel con toda la operación, una hoja por pestaña,
// a los correos de Supuestos → Respaldo diario. Lo dispara pg_cron (supabase/migrations/004_respaldo.sql).
// Un solo archivo para poder pegarlo en el editor de funciones de Supabase.
// Seguridad: no expone datos (el Excel solo va a los correos guardados en la base) y no manda más de
// un respaldo cada 20 horas, aunque alguien llame la URL muchas veces.
import { createClient } from "npm:@supabase/supabase-js@2";
import ExcelJS from "npm:exceljs@4.4.0";
import { Buffer } from "node:buffer";

const BREVO_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const TABLES = ["properties", "cleaners", "cleaning_rates", "settings", "app_users", "reservations", "blocks", "days_off",
  "payroll_extras", "payroll_payments", "transactions", "tasks", "purchases", "access_codes", "cleanings", "parking_loans", "service_accounts", "service_payments"];
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

// ---------- constructor de Excel (igual que web/mgmx.js) ----------
/* MGM Control App · constructor de Excel (calendario y respaldo).
   Mismo archivo en web/mgmx.js y supabase/functions/_shared/mgmx.js: si cambias uno, copia al otro. */
(function () {
  const P = n => String(n).padStart(2, '0');
  const toD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const fromD = d => d.getUTCFullYear() + '-' + P(d.getUTCMonth() + 1) + '-' + P(d.getUTCDate());
  const add = (s, n) => { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return fromD(d); };
  const dow = s => toD(s).getUTCDay();
  const monday = s => { const w = dow(s); return add(s, w === 0 ? -6 : 1 - w); };
  const MES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const DIA = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];
  const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const C = { bg: 'FF0D1A0F', r1: 'FF16301A', r2: 'FF1D3D21', verde: 'FF7EE08A', azul: 'FF8FC3FF', rojo: 'FFFF6B57', morado: 'FFC08CFF', gris: 'FFB5BDB6', blanco: 'FFFFFFFF', na: 'FF9B7BFF' };
  const props = D => D.properties.filter(p => p.active !== false && p.kind !== 'cajon').sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const activas = D => D.reservations.filter(r => r.status !== 'cancelada');
  const nombre = (D, k) => (D.cleaners.find(c => c.key === k) || {}).name || k || '';
  const corto = c => String(c || '').replace(/^Q-/, '');

  // Hoja con el formato de la hoja CALENDARIOS: depa × día, 4 subcolumnas (ocupa, cajón, sale, clave)
  function fillCalendar(ws, D, ym) {
    const [y, m] = ym.split('-').map(Number), ini = ym + '-01', ult = fromD(new Date(Date.UTC(y, m, 0)));
    const by = {}, lent = {}, exm = {};
    (D.cleanings || []).forEach(x => { exm[x.property_code + '|' + x.date] = x; });
    activas(D).forEach(r => { (by[r.property_code] = by[r.property_code] || []).push(r); if (r.parking_from) (lent[r.parking_from] = lent[r.parking_from] || []).push(r); });
    ws.columns = [{ width: 15 }, ...Array.from({ length: 7 }, () => [{ width: 13 }, { width: 11 }, { width: 13 }, { width: 4 }]).flat()];
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];
    const paint = (row, bg) => { for (let c = 1; c <= 29; c++) row.getCell(c).fill = fill(bg); };
    let rn = 1;
    let row = ws.getRow(rn++); paint(row, C.bg); row.getCell(1).value = y; row.getCell(1).font = { color: { argb: C.gris }, bold: true };
    row = ws.getRow(rn++); paint(row, C.bg); row.getCell(1).value = MES[m - 1]; row.getCell(1).font = { color: { argb: C.blanco }, bold: true, size: 16 }; row.height = 24;
    for (let w = monday(ini); w <= ult; w = add(w, 7)) {
      const dias = [0, 1, 2, 3, 4, 5, 6].map(i => add(w, i));
      row = ws.getRow(rn); paint(row, C.bg); row.getCell(1).value = 'Depa'; row.getCell(1).font = { color: { argb: C.verde }, bold: true };
      dias.forEach((d, i) => { const c = 2 + i * 4; ws.mergeCells(rn, c, rn, c + 3); const cell = row.getCell(c); cell.value = DIA[i]; cell.font = { color: { argb: C.verde }, bold: true }; cell.alignment = { horizontal: 'center' }; });
      rn++;
      row = ws.getRow(rn); paint(row, C.bg);
      dias.forEach((d, i) => { const c = 2 + i * 4; const off = D.days_off.filter(o => o.date === d).map(o => nombre(D, o.cleaner_key) + ' no').join(', ');
        row.getCell(c).value = toD(d).getUTCDate(); row.getCell(c).font = { color: { argb: C.blanco }, bold: true }; row.getCell(c).alignment = { horizontal: 'left' };
        if (off) { ws.mergeCells(rn, c + 1, rn, c + 3); row.getCell(c + 1).value = off; row.getCell(c + 1).font = { color: { argb: C.rojo } }; } });
      rn++;
      props(D).forEach((p, pi) => {
        row = ws.getRow(rn); paint(row, pi % 2 ? C.r2 : C.r1);
        row.getCell(1).value = p.code; row.getCell(1).font = { color: { argb: C.verde }, bold: true }; row.getCell(1).fill = fill(C.bg);
        const rs = by[p.code] || [], ls = lent[p.code] || [];
        dias.forEach((d, i) => {
          const c = 2 + i * 4;
          const noche = rs.find(r => r.checkin <= d && d < r.checkout), sale = rs.find(r => r.checkout === d);
          const bl = D.blocks.find(b => b.property_code === p.code && b.date_from <= d && d <= b.date_to);
          const xt = exm[p.code + '|' + d];
          if (bl && !noche && !sale && !xt) { row.getCell(c).value = 'N/A' + (bl.note ? ' · ' + bl.note : ''); row.getCell(c).font = { color: { argb: C.na } }; return; }
          if (noche) { row.getCell(c).value = noche.checkin === d ? noche.guest : 'X'; row.getCell(c).font = { color: { argb: C.azul } }; }
          let es = '';
          if (p.building === 'Qalina') {
            const pr = ls.find(r => r.checkin <= d && d < r.checkout);
            if (pr) es = 'Prestado a ' + corto(pr.property_code);
            else if ((D.parking_loans || []).some(x => x.cajon === p.code && x.date_from <= d && d < x.date_to)) es = 'Prestado a ' + D.parking_loans.find(x => x.cajon === p.code && x.date_from <= d && d < x.date_to).name;
            else if (noche && noche.has_car === true) es = p.has_parking ? 'Si' : noche.parking_from ? 'De ' + corto(noche.parking_from) : 'FALTA';
            else if (noche && noche.has_car === false) es = 'No';
          }
          if (es) { row.getCell(c + 1).value = es; row.getCell(c + 1).font = { color: { argb: es === 'FALTA' ? C.rojo : C.gris }, size: 9 }; }
          if (sale) { row.getCell(c + 2).value = sale.guest; row.getCell(c + 2).font = { color: { argb: C.rojo }, bold: true };
            row.getCell(c + 3).value = sale.cleaner_key || ''; row.getCell(c + 3).font = { color: { argb: C.morado }, bold: true }; row.getCell(c + 3).alignment = { horizontal: 'center' }; }
          else if (xt) { row.getCell(c + 2).value = 'Limpieza'; row.getCell(c + 2).font = { color: { argb: C.morado }, size: 9 };
            row.getCell(c + 3).value = xt.cleaner_key || ''; row.getCell(c + 3).font = { color: { argb: C.morado }, bold: true }; row.getCell(c + 3).alignment = { horizontal: 'center' }; }
        });
        rn++;
      });
      paint(ws.getRow(rn++), C.bg);
    }
  }

  // ---------- Estilo MGM para las hojas del respaldo ----------
  const K = { ink: 'FF23272A', forest: 'FF2F4F43', forestL: 'FFE3ECE7', copper: 'FFB0703C', copperL: 'FFF6EADF', paper: 'FFF7F5F1', line: 'FFD9DDD8', zebra: 'FFF7F8F6', rojo: 'FFB43C28', rojoL: 'FFF9E1DC', ama: 'FFC9962A', amaL: 'FFFBF0D6', verde: 'FF3B7A57', verdeL: 'FFE1F0E6', gris: 'FF7B8082' };
  const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const fdate = s => s ? toD(String(s).slice(0, 10)) : null;
  const fmtCorto = s => { const d = toD(s); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; };
  const DIA3 = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const MONEY = '"$"#,##0.00;[Red]-"$"#,##0.00', MONEY0 = '"$"#,##0;[Red]-"$"#,##0', FDATE = 'dd/mmm/yyyy';
  const thin = { style: 'thin', color: { argb: K.line } };
  const BOX = { top: thin, left: thin, bottom: thin, right: thin };
  const MONEYK = new Set(['amount', 't', 'b', 'tot', 'monto', 'total', 'pagado', 'saldo', 'sup']);
  const DATEK = new Set(['checkin', 'checkout', 'date', 'f', 'sem', 'week_start', 'date_from', 'date_to', 'paid_on']);
  function titulo(ws, txt, sub, ncol) {
    ws.mergeCells(1, 1, 1, Math.max(ncol, 2)); const c = ws.getCell(1, 1); c.value = txt; c.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } }; c.fill = fill(K.forest); c.alignment = { vertical: 'middle', indent: 1 }; ws.getRow(1).height = 28;
    ws.mergeCells(2, 1, 2, Math.max(ncol, 2)); const d = ws.getCell(2, 1); d.value = sub || ''; d.font = { italic: true, size: 10, color: { argb: K.gris } }; d.alignment = { indent: 1 };
  }
  // Tabla de datos estilizada: título, encabezado verde, filas cebra, formatos $ y fecha, filtros, totales.
  function table(wb, name, cols, rows, o) {
    o = o || {}; const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: o.tab || K.gris } } });
    titulo(ws, o.titulo || name, o.sub || (rows.length + ' registros'), cols.length);
    ws.columns = cols.map(([, key, width]) => ({ key, width: width || 16 }));
    const hr = ws.getRow(4); cols.forEach(([h], i) => { const c = hr.getCell(i + 1); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill(K.ink); c.alignment = { vertical: 'middle', wrapText: true }; c.border = BOX; }); hr.height = 22;
    rows.forEach((r, n) => { const row = ws.getRow(5 + n);
      cols.forEach(([, key], i) => { const c = row.getCell(i + 1); let v = r[key];
        if (DATEK.has(key) && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) { v = fdate(v); c.numFmt = FDATE; }
        else if (MONEYK.has(key) && v != null && v !== '') { v = Number(v); c.numFmt = MONEY; }
        c.value = v == null ? null : v; c.border = BOX; if (n % 2) c.fill = fill(K.zebra); c.alignment = { vertical: 'top', wrapText: typeof v === 'string' && v.length > 40 }; });
      if (o.paint) o.paint(row, r); });
    const last = 4 + rows.length;
    if (rows.length && o.totales) { const tr = ws.getRow(last + 1);
      cols.forEach(([, key], i) => { const c = tr.getCell(i + 1); c.fill = fill(K.forestL); c.font = { bold: true }; c.border = BOX;
        if (i === 0) c.value = 'TOTAL'; else if (o.totales.includes(key)) { const L = ws.getColumn(i + 1).letter; c.value = { formula: `SUBTOTAL(9,${L}5:${L}${last})`, result: rows.reduce((t, x) => t + (Number(x[key]) || 0), 0) }; c.numFmt = MONEY; } }); }
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(last, 4), column: cols.length } };
    ws.views = [{ state: 'frozen', ySplit: 4, xSplit: o.xSplit || 0, showGridLines: false }];
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    return ws;
  }
  // Bloques para hojas de vista (Resumen)
  function seccion(ws, r, txt, ncol) { ws.mergeCells(r, 1, r, ncol); const c = ws.getCell(r, 1); c.value = txt.toUpperCase(); c.font = { bold: true, size: 11, color: { argb: K.forest } }; c.border = { bottom: { style: 'medium', color: { argb: K.forest } } }; ws.getRow(r).height = 20; return r + 1; }
  function encab(ws, r, hs) { hs.forEach((h, i) => { const c = ws.getCell(r, i + 1); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }; c.fill = fill(K.ink); c.border = BOX; }); return r + 1; }
  function fila(ws, r, vals, fmts, n) { vals.forEach((v, i) => { const c = ws.getCell(r, i + 1); c.value = v; c.border = BOX; if (fmts && fmts[i]) c.numFmt = fmts[i]; if (n % 2) c.fill = fill(K.zebra); }); return r + 1; }
  function kpis(ws, r, items) { // pares [valor, etiqueta, color]
    items.forEach(([v, l, col], i) => { const c1 = i * 2 + 1; ws.mergeCells(r, c1, r, c1 + 1); ws.mergeCells(r + 1, c1, r + 1, c1 + 1);
      const a = ws.getCell(r, c1), b = ws.getCell(r + 1, c1); a.value = v; a.font = { bold: true, size: 20, color: { argb: col || K.ink } }; a.alignment = { horizontal: 'center' }; a.fill = fill(K.paper);
      b.value = l; b.font = { size: 9, color: { argb: K.gris } }; b.alignment = { horizontal: 'center' }; b.fill = fill(K.paper); if (typeof v === 'number' && v > 999) a.numFmt = MONEY0; });
    ws.getRow(r).height = 30; return r + 3;
  }
  const settingD = (D, k, def) => { const s = (D.settings || []).find(x => x.key === k); return s ? s.value : def; };
  const ocupadasD = (D, d) => activas(D).filter(r => r.checkin <= d && d < r.checkout);
  function nominaD(D, k, ini) {
    const fin = add(ini, 7), bono = Number(settingD(D, 'bono_domingo', 50) ?? 50);
    const rate = (p, kk) => { const r = D.cleaning_rates.find(x => x.property_code === p && x.cleaner_key === kk); return r ? Number(r.amount) : 0; };
    const lim = kk => [...activas(D).filter(r => r.cleaner_key === kk && r.checkout >= ini && r.checkout < fin).map(r => ({ id: 'r:' + r.id, dp: r.property_code, f: r.checkout })),
      ...(D.cleanings || []).filter(x => x.cleaner_key === kk && x.date >= ini && x.date < fin).map(x => ({ id: 'x:' + x.id, dp: x.property_code, f: x.date }))];
    const det = lim(k).map(x => ({ ...x, t: rate(x.dp, k), b: dow(x.f) === 0 ? bono : 0 }));
    const SV = (settingD(D, 'supervision', { R: { team: ['F', 'K', 'G', 'A'], monto: 30 } }) || {})[k], quit = new Set(settingD(D, 'sup_quitar', []) || []), pausas = (settingD(D, 'sup_pausas', []) || []).filter(p => p.sup === k);
    const sup = SV ? SV.team.flatMap(c => lim(c)).filter(x => !quit.has(x.id) && !pausas.some(p => p.from <= x.f && x.f <= p.to)).length * (Number(SV.monto) || 0) : 0;
    const otros = D.payroll_extras.filter(x => x.cleaner_key === k && x.week_start === ini).reduce((t, x) => t + Number(x.amount), 0);
    const pagado = D.payroll_payments.filter(x => x.cleaner_key === k && x.week_start === ini).reduce((t, x) => t + Number(x.amount), 0);
    const total = det.reduce((t, x) => t + x.t + x.b, 0) + sup + otros;
    return { n: det.length, det, sup, otros, total, pagado, saldo: total - pagado };
  }
  // Hoja "Resumen": tablero del día
  function resumen(wb, D, today) {
    const ws = wb.addWorksheet('Resumen', { properties: { tabColor: { argb: K.copper } } }); ws.columns = [{ width: 22 }, ...Array(7).fill(0).map(() => ({ width: 13 }))];
    const d = toD(today); titulo(ws, 'MGM Control App · Respaldo del ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(), 'Vistas para leer rápido. Al final están las hojas "BD" con toda la información en crudo.', 8);
    ws.views = [{ showGridLines: false }]; ws.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    const act = activas(D), salen = act.filter(r => r.checkout === today), entran = act.filter(r => r.checkin === today), occ = ocupadasD(D, today);
    const occSet = new Set(occ.map(r => r.property_code)), P = props(D), libres = P.filter(p => !occSet.has(p.code)).length;
    let r = seccion(ws, 4, 'Hoy', 8); r = kpis(ws, r, [[salen.length, 'Salen hoy', K.rojo], [entran.length, 'Entran hoy', K.forest], [occ.length, 'Ocupados', K.ink], [libres, 'Libres', K.copper]]);
    // próximas salidas
    const sinLimp = new Set(P.filter(p => p.cleaning === false).map(p => p.code));
    const prox = act.filter(r2 => r2.checkout >= today && r2.checkout <= add(today, 7)).sort((a, b) => a.checkout.localeCompare(b.checkout));
    r = seccion(ws, r, 'Salidas próximos 7 días', 8); r = encab(ws, r, ['Fecha', 'Día', 'Depa', 'Huésped', 'Chica', '', '', '']);
    prox.forEach((x, n) => { const ch = sinLimp.has(x.property_code) ? 'No la hacemos' : x.cleaner_key ? nombre(D, x.cleaner_key) : 'SIN ASIGNAR';
      r = fila(ws, r, [fdate(x.checkout), DIA3[dow(x.checkout)], x.property_code, x.guest, ch], [FDATE], n);
      if (ch === 'SIN ASIGNAR') { const c = ws.getCell(r - 1, 5); c.font = { bold: true, color: { argb: K.rojo } }; c.fill = fill(K.rojoL); } });
    if (!prox.length) r = fila(ws, r, ['Sin salidas'], null, 0);
    // nómina semana
    const ini = monday(today); r = seccion(ws, r + 1, 'Nómina semana del ' + fmtCorto(ini) + ' al ' + fmtCorto(add(ini, 6)), 8);
    r = encab(ws, r, ['Chica', 'Limpiezas', 'Supervisión', 'Otros', 'Total', 'Pagado', 'Saldo', '']);
    let T = [0, 0, 0, 0, 0, 0];
    D.cleaners.filter(c => c.active !== false).sort((a, b) => a.name.localeCompare(b.name)).forEach((c, n) => { const N = nominaD(D, c.key, ini); if (!N.n && !N.total && !N.pagado) return;
      r = fila(ws, r, [c.name, N.n, N.sup, N.otros, N.total, N.pagado, N.saldo], [null, null, MONEY0, MONEY0, MONEY0, MONEY0, MONEY0], n);
      if (N.saldo > 0) ws.getCell(r - 1, 7).font = { bold: true, color: { argb: K.rojo } };
      T = [T[0] + N.n, T[1] + N.sup, T[2] + N.otros, T[3] + N.total, T[4] + N.pagado, T[5] + N.saldo]; });
    r = fila(ws, r, ['TOTAL', ...T], [null, null, MONEY0, MONEY0, MONEY0, MONEY0, MONEY0], 0); for (let i = 1; i <= 7; i++) { ws.getCell(r - 1, i).font = { bold: true }; ws.getCell(r - 1, i).fill = fill(K.forestL); }
    // gastos e ingresos del mes
    const ym = today.slice(0, 7), mesTx = (D.transactions || []).filter(t => (t.date || '').startsWith(ym));
    const ing = mesTx.filter(t => t.kind === 'ingreso').reduce((s2, t) => s2 + Number(t.amount), 0), gas = mesTx.filter(t => t.kind === 'gasto').reduce((s2, t) => s2 + Number(t.amount), 0);
    r = seccion(ws, r + 1, 'Gastos e ingresos de ' + MES[+ym.slice(5) - 1].toLowerCase(), 8); r = kpis(ws, r, [[ing, 'Ingresos', K.verde], [gas, 'Gastos', K.rojo], [ing - gas, 'Diferencia', ing - gas >= 0 ? K.verde : K.rojo]]);
    const porCat = {}; mesTx.filter(t => t.kind === 'gasto').forEach(t => { porCat[t.category] = (porCat[t.category] || 0) + Number(t.amount); });
    r = encab(ws, r, ['Categoría de gasto', 'Monto', '% del gasto']);
    Object.entries(porCat).sort((a, b) => b[1] - a[1]).forEach(([k2, v], n) => { r = fila(ws, r, [k2, v, gas ? v / gas : 0], [null, MONEY0, '0%'], n); });
    // pendientes
    const ab = (D.tasks || []).filter(t => t.status !== 'terminado');
    r = seccion(ws, r + 1, 'Pendientes abiertos', 8); r = kpis(ws, r, [[ab.filter(t => t.priority === 'alta').length, 'Prioridad alta', K.rojo], [ab.filter(t => t.priority === 'media').length, 'Prioridad media', K.ama], [ab.filter(t => t.priority === 'baja').length, 'Prioridad baja', K.verde], [ab.length, 'Total abiertos', K.ink]]);
    const resp = {}; ab.forEach(t => { const k2 = t.responsible || 'Sin responsable'; resp[k2] = (resp[k2] || 0) + 1; });
    r = encab(ws, r, ['Responsable', 'Abiertos']); Object.entries(resp).sort((a, b) => b[1] - a[1]).forEach(([k2, v], n) => { r = fila(ws, r, [k2, v], null, n); });
    // servicios
    if ((D.service_accounts || []).length) {
      const pm = add(ym + '-01', -1).slice(0, 7), pp = (D.service_payments || []).filter(p => p.status === 'pagado');
      const tot = per => pp.filter(p => p.period === per).reduce((s2, p) => s2 + Number(p.amount || 0), 0);
      r = seccion(ws, r + 1, 'Pagos de servicios', 8); r = kpis(ws, r, [[tot(pm), 'Pagado ' + MES[+pm.slice(5) - 1].toLowerCase(), K.forest], [tot(ym), 'Pagado ' + MES[+ym.slice(5) - 1].toLowerCase(), K.forest], [pp.filter(p => p.period.startsWith(ym.slice(0, 4))).reduce((s2, p) => s2 + Number(p.amount || 0), 0), 'Pagado ' + ym.slice(0, 4), K.ink]]);
    }
    return ws;
  }
  // Hoja de servicios tipo grid: depa × mes por servicio
  function servicios(wb, D, y) {
    if (!(D.service_accounts || []).length) return;
    const ws = wb.addWorksheet('Servicios ' + y, { properties: { tabColor: { argb: K.forest } } });
    ws.columns = [{ width: 18 }, { width: 18 }, { width: 14 }, ...Array(12).fill(0).map(() => ({ width: 10 })), { width: 12 }];
    titulo(ws, 'Pagos de servicios ' + y, 'Verde = pagado · gris = N/A o sin cargo · rojo = pendiente (mes sin registro)', 16);
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 3, showGridLines: false }]; ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    const SV = [['luz', 'Luz (CFE)'], ['agua', 'Agua (SIAPA)'], ['gas', 'Gas'], ['internet', 'Internet'], ['mantenimiento', 'Mantenimiento']], hoy = new Date().toISOString().slice(0, 7);
    let r = 4;
    for (const [k, l] of SV) {
      const A = D.service_accounts.filter(a => a.service === k && a.active !== false).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)); if (!A.length) continue;
      r = seccion(ws, r, l, 16); r = encab(ws, r, ['Depa', 'Contrato', 'Responsable', ...MON.map(m => m[0].toUpperCase() + m.slice(1)), 'Total']);
      A.forEach((a, n) => { const PP = D.service_payments.filter(p => p.account_id === a.id), ini = PP.map(p => p.period).sort()[0]; let tot = 0;
        const row = [a.label, a.contrato || a.extra || '', a.responsable || ''];
        r = fila(ws, r, row, null, n); const rr2 = r - 1;
        for (let m = 1; m <= 12; m++) { const per = y + '-' + P(m), p = PP.find(x => x.period === per), c = ws.getCell(rr2, 3 + m); c.border = BOX; c.alignment = { horizontal: 'right' };
          if (p && p.status === 'pagado') { c.value = Number(p.amount) || 0; c.numFmt = MONEY0; c.font = { color: { argb: K.verde } }; tot += Number(p.amount) || 0; }
          else if (p && p.status === 'na') { c.value = 'N/A'; c.font = { color: { argb: K.gris }, size: 9 }; }
          else if (p && p.status === 'saldo_favor') { c.value = 'a favor'; c.font = { color: { argb: 'FF2F6DB0' }, size: 9 }; }
          else if ((p && p.status === 'pendiente') || (!p && ini && per >= ini && per <= hoy && (a.responsable || '').trim() && PP.some(x => x.status === 'pagado'))) { c.value = 'pend.'; c.font = { bold: true, color: { argb: K.rojo } }; c.fill = fill(K.rojoL); } }
        const ct = ws.getCell(rr2, 16); ct.value = tot; ct.numFmt = MONEY0; ct.font = { bold: true }; ct.border = BOX; });
      r++;
    }
    return ws;
  }
  // Gastos por depa × categoría (mes actual y anterior)
  function gastosPivot(wb, D, today) {
    const ws = wb.addWorksheet('Gastos por depa', { properties: { tabColor: { argb: K.copper } } }); ws.views = [{ state: 'frozen', xSplit: 1, showGridLines: false }]; ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    const cats = [...new Set((D.transactions || []).filter(t => t.kind === 'gasto').map(t => t.category))].sort();
    ws.columns = [{ width: 16 }, ...cats.map(() => ({ width: 13 })), { width: 13 }];
    titulo(ws, 'Gastos por departamento y categoría', 'Mes actual y mes anterior', cats.length + 2);
    let r = 4; const ym = today.slice(0, 7);
    for (const m of [ym, add(ym + '-01', -1).slice(0, 7)]) {
      const tx = D.transactions.filter(t => t.kind === 'gasto' && (t.date || '').startsWith(m)); r = seccion(ws, r, MES[+m.slice(5) - 1] + ' ' + m.slice(0, 4), cats.length + 2);
      r = encab(ws, r, ['Depa', ...cats, 'Total']); const deps = [...new Set(tx.map(t => t.property_code || 'General'))].sort();
      const colT = Array(cats.length + 1).fill(0);
      deps.forEach((dp, n) => { const v = cats.map(c => tx.filter(t => (t.property_code || 'General') === dp && t.category === c).reduce((s2, t) => s2 + Number(t.amount), 0)); const tt = v.reduce((a, b) => a + b, 0);
        v.forEach((x, i) => colT[i] += x); colT[cats.length] += tt;
        r = fila(ws, r, [dp, ...v.map(x => x || null), tt], [null, ...cats.map(() => MONEY0), MONEY0], n); ws.getCell(r - 1, cats.length + 2).font = { bold: true }; });
      r = fila(ws, r, ['TOTAL', ...colT], [null, ...colT.map(() => MONEY0)], 0); for (let i = 1; i <= cats.length + 2; i++) { ws.getCell(r - 1, i).font = { bold: true }; ws.getCell(r - 1, i).fill = fill(K.forestL); }
      r += 1;
    }
    return ws;
  }

  // Respaldo completo: vistas estilizadas + una hoja "BD" por pestaña de la app.
  function buildBackup(ExcelJS, D, today, opts) {
    opts = opts || {};
    const wb = new ExcelJS.Workbook(); wb.creator = 'MGM Control App';
    const ym = today.slice(0, 7), nx = add(ym + '-28', 7).slice(0, 7), pv = add(ym + '-01', -1).slice(0, 7);
    resumen(wb, D, today);
    for (const m of [ym, nx, pv]) fillCalendar(wb.addWorksheet('Cal ' + MES[+m.slice(5) - 1].slice(0, 3) + m.slice(2, 4), { properties: { tabColor: { argb: K.ink } } }), D, m);
    const ord = Object.fromEntries(props(D).map((p, i) => [p.code, i]));
    const cat = t => (t.category_other ? t.category + ': ' + t.category_other : t.category);
    const rate = (p, k) => { const r = D.cleaning_rates.find(x => x.property_code === p && x.cleaner_key === k); return r ? Number(r.amount) : null; };
    const bono = Number((D.settings.find(s => s.key === 'bono_domingo') || {}).value ?? 50);
    const prioCol = { alta: [K.rojoL, K.rojo], media: [K.amaL, K.ama], baja: [K.verdeL, K.verde] };
    // vistas
    const ab = (D.tasks || []).filter(t => t.status !== 'terminado').sort((a, b) => ['alta', 'media', 'baja'].indexOf(a.priority) - ['alta', 'media', 'baja'].indexOf(b.priority) || (a.date || '').localeCompare(b.date || ''));
    table(wb, 'Pendientes abiertos', [['Prioridad', 'priority', 10], ['Depa', 'property_code', 14], ['Descripción', 'description', 46], ['Responsable', 'responsible', 14], ['Fecha', 'date', 12], ['Estatus', 'st', 12], ['Avances', 'notes', 36]],
      ab.map(t => ({ ...t, priority: (t.priority || '').toUpperCase(), st: ({ en_proceso: 'En proceso', en_pausa: 'En pausa', terminado: 'Terminado' })[t.status] || t.status })),
      { tab: K.rojo, sub: ab.length + ' pendientes sin terminar · ordenados por prioridad', paint: (row, t) => { const pc = prioCol[(t.priority || '').toLowerCase()]; if (pc) { row.getCell(1).fill = fill(pc[0]); row.getCell(1).font = { bold: true, color: { argb: pc[1] } }; } } });
    const ini = monday(today);
    const nomRows = []; D.cleaners.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(c => { const N = nominaD(D, c.key, ini); N.det.sort((a, b) => a.f.localeCompare(b.f)).forEach(x => nomRows.push({ chica: c.name, f: x.f, dia: DIA3[dow(x.f)], dp: x.dp, t: x.t, b: x.b, tot: x.t + x.b }));
      if (N.sup) nomRows.push({ chica: c.name, dp: 'Supervisión', tot: N.sup }); if (N.otros) nomRows.push({ chica: c.name, dp: 'Otros', tot: N.otros }); });
    table(wb, 'Nómina semana', [['Chica', 'chica', 14], ['Fecha', 'f', 12], ['Día', 'dia', 6], ['Depa / concepto', 'dp', 16], ['Tarifa', 't', 11], ['Bono domingo', 'b', 13], ['Total', 'tot', 12]], nomRows,
      { tab: K.forest, titulo: 'Nómina semana del ' + fmtCorto(ini) + ' al ' + fmtCorto(add(ini, 6)), sub: 'Detalle por chica (incluye supervisión y otros). Usa el filtro de Chica para ver una sola.', totales: ['t', 'b', 'tot'] });
    gastosPivot(wb, D, today);
    servicios(wb, D, ym.slice(0, 4));
    // datos crudos (BD)
    const T = (n, c, rws, o) => table(wb, 'BD ' + n, c, rws, { tab: K.gris, ...(o || {}) });
    T('Reservas', [['Departamento', 'property_code'], ['Huésped', 'guest', 22], ['Check in', 'checkin', 12], ['Check out', 'checkout', 12], ['Auto', 'auto', 8], ['Cajón de', 'parking_from', 12], ['Chica', 'chica', 12], ['Estatus', 'status', 12], ['Monto', 'amount', 12]],
      D.reservations.slice().sort((a, b) => a.checkin.localeCompare(b.checkin) || (ord[a.property_code] ?? 99) - (ord[b.property_code] ?? 99))
        .map(r => ({ ...r, auto: r.has_car == null ? '' : r.has_car ? 'Sí' : 'No', chica: nombre(D, r.cleaner_key), amount: r.amount == null ? null : Number(r.amount) })), { xSplit: 1 });
    T('Nómina limpiezas', [['Semana (lunes)', 'sem', 14], ['Chica', 'chica'], ['Fecha', 'f', 12], ['Departamento', 'dp'], ['Tipo', 'tipo', 10], ['Tarifa', 't', 10], ['Bono domingo', 'b', 14], ['Total', 'tot', 10]],
      [...activas(D).filter(r => r.cleaner_key).map(r => ({ k: r.cleaner_key, f: r.checkout, dp: r.property_code, tipo: 'Salida' })), ...(D.cleanings || []).filter(x => x.cleaner_key).map(x => ({ k: x.cleaner_key, f: x.date, dp: x.property_code, tipo: 'Extra' }))]
        .sort((a, b) => a.f.localeCompare(b.f))
        .map(r => { const t = rate(r.dp, r.k) || 0, b = dow(r.f) === 0 ? bono : 0; return { sem: monday(r.f), chica: nombre(D, r.k), f: r.f, dp: r.dp, tipo: r.tipo, t, b, tot: t + b }; }), { totales: ['t', 'b', 'tot'] });
    T('Limpiezas extra', [['Departamento', 'property_code'], ['Fecha', 'date', 12], ['Chica', 'chica'], ['Nota', 'note', 36]], (D.cleanings || []).slice().sort((a, b) => a.date.localeCompare(b.date)).map(x => ({ ...x, chica: nombre(D, x.cleaner_key) })));
    T('Nómina otros', [['Semana (lunes)', 'week_start', 14], ['Chica', 'chica'], ['Descripción', 'description', 36], ['Monto', 'amount', 10]],
      D.payroll_extras.slice().sort((a, b) => a.week_start.localeCompare(b.week_start)).map(x => ({ ...x, chica: nombre(D, x.cleaner_key), amount: Number(x.amount) })), { totales: ['amount'] });
    T('Nómina pagos', [['Semana (lunes)', 'week_start', 14], ['Chica', 'chica'], ['Fecha de pago', 'date', 14], ['Forma', 'method', 14], ['Monto', 'amount', 10], ['Nota', 'note', 30]],
      D.payroll_payments.slice().sort((a, b) => a.date.localeCompare(b.date)).map(x => ({ ...x, chica: nombre(D, x.cleaner_key), amount: Number(x.amount) })), { totales: ['amount'] });
    for (const [kind, name] of [['gasto', 'Gastos'], ['ingreso', 'Ingresos']])
      T(name, [['Mes', 'mes', 10], ['Departamento', 'property_code'], ['Categoría', 'cat', 26], ['Fecha', 'date', 12], ['Descripción', 'description', 40], ['Monto', 'amount', 12], ['Capturado', 'cap', 10], ['Fotos', 'nf', 8]],
        D.transactions.filter(t => t.kind === kind).sort((a, b) => a.date.slice(0, 7).localeCompare(b.date.slice(0, 7)) || (ord[a.property_code] ?? 99) - (ord[b.property_code] ?? 99) || cat(a).localeCompare(cat(b)) || a.date.localeCompare(b.date))
          .map(t => ({ ...t, mes: t.date.slice(0, 7), cat: cat(t), amount: Number(t.amount), cap: t.checked ? 'Sí' : 'No', nf: (t.photos || []).length })), { totales: ['amount'] });
    if ((D.service_payments || []).length) { const acc = Object.fromEntries(D.service_accounts.map(a => [a.id, a]));
      T('Servicios', [['Servicio', 'sv', 13], ['Propiedad', 'label', 18], ['Contrato', 'contrato', 18], ['Mes', 'period', 10], ['Estado', 'status', 12], ['Monto', 'amount', 12], ['Fecha de pago', 'paid_on', 13], ['Nota', 'note', 24]],
        D.service_payments.map(p => ({ ...p, sv: (acc[p.account_id] || {}).service, label: (acc[p.account_id] || {}).label, contrato: (acc[p.account_id] || {}).contrato, amount: p.amount == null ? null : Number(p.amount) }))
          .sort((a, b) => (a.sv || '').localeCompare(b.sv || '') || (a.label || '').localeCompare(b.label || '') || a.period.localeCompare(b.period)), { totales: ['amount'] }); }
    T('Pendientes', [['Departamento', 'property_code'], ['Descripción', 'description', 40], ['Responsable', 'responsible'], ['Fecha', 'date', 12], ['Prioridad', 'priority', 10], ['Estatus', 'status', 12], ['Avances', 'notes', 40]], D.tasks);
    T('Compras', [['Descripción', 'description', 40], ['Lugar', 'store'], ['Responsable', 'responsible'], ['Fecha', 'date', 12], ['Comprado', 'ok', 10]], D.purchases.map(p => ({ ...p, ok: p.done ? 'Sí' : 'No' })));
    T('Depas y ligas', [['Departamento', 'code'], ['Edificio', 'building'], ['Tiene cajón', 'hp', 12], ['Sótano', 'parking_level', 8], ['Presta cajón', 'lp', 12], ['Liga Airbnb', 'airbnb_url', 50]],
      props(D).map(p => ({ ...p, hp: p.has_parking ? 'Sí' : 'No', lp: p.lends_parking ? 'Sí' : 'No' })));
    const cs = D.cleaners.slice().sort((a, b) => a.name.localeCompare(b.name));
    T('Tarifas limpieza', [['Departamento', 'code'], ...cs.map(c => [c.name, c.key, 10])], props(D).map(p => ({ code: p.code, ...Object.fromEntries(cs.map(c => [c.key, rate(p.code, c.key)])) })));
    T('Descansos', [['Fecha', 'date', 12], ['Chica', 'chica']], D.days_off.slice().sort((a, b) => a.date.localeCompare(b.date)).map(o => ({ ...o, chica: nombre(D, o.cleaner_key) })));
    T('Bloqueos NA', [['Departamento', 'property_code'], ['Desde', 'date_from', 12], ['Hasta', 'date_to', 12], ['Nota', 'note', 30]], D.blocks);
    T('Cajones apartados', [['Cajón', 'cajon'], ['Nombre', 'name', 24], ['Desde', 'date_from', 12], ['Hasta', 'date_to', 12]], D.parking_loans || []);
    if (opts.claves) T('Claves', [['Lugar', 'place', 20], ['Clave 1', 'code1'], ['Clave 2', 'code2']], D.access_codes);
    T('Usuarios', [['Nombre', 'name'], ['Correo', 'email', 30], ['Acceso', 'role']], D.app_users);
    return wb;
  }
  globalThis.MGMX = { fillCalendar, buildBackup, MES };
})();

// deno-lint-ignore no-explicit-any
const MGMX = (globalThis as any).MGMX;

async function loadAll(t: string) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(t).select("*").range(from, from + 999);
    if (error) throw new Error(`${t}: ${error.message}`);
    rows.push(...data); if (data.length < 1000) break;
  }
  return rows;
}
const setting = (D: Record<string, unknown[]>, k: string) => (D.settings as { key: string; value: unknown }[]).find((s) => s.key === k)?.value;

Deno.serve(async (req: Request) => {
  try {
    // Modo archivo (para el Apps Script que sube el respaldo a Google Drive cada 4 h):
    // GET ?file=1 con header x-mgm-key = secret BACKUP_DRIVE_KEY → devuelve el .xlsx, sin correo.
    const url = new URL(req.url);
    if (url.searchParams.get("file") === "1") {
      const KEY = Deno.env.get("BACKUP_DRIVE_KEY") ?? "";
      if (!KEY || req.headers.get("x-mgm-key") !== KEY) return Response.json({ error: "no autorizado" }, { status: 401 });
      const D: Record<string, unknown[]> = {};
      for (const t of TABLES) D[t] = await loadAll(t);
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
      const wb = MGMX.buildBackup(ExcelJS, D, today, { claves: setting(D, "backup_claves") === true });
      return new Response(await wb.xlsx.writeBuffer(), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
    }
    if (!BREVO_KEY) return Response.json({ error: "Falta el secret BREVO_API_KEY" }, { status: 500 });
    const D: Record<string, unknown[]> = {};
    for (const t of TABLES) D[t] = await loadAll(t);

    const last = Number(setting(D, "backup_last") ?? 0);
    if (Date.now() - last < 20 * 3600 * 1000) return Response.json({ status: "ya se envió hoy" });

    const to = ((setting(D, "backup_emails") as string[]) ?? []).filter((e) => typeof e === "string" && e.includes("@"));
    if (!to.length) return Response.json({ status: "sin destinatarios (Supuestos → Respaldo diario)" });
    const sender = (setting(D, "backup_sender") as { email: string; name?: string }) ?? null;
    if (!sender?.email) return Response.json({ error: "Falta backup_sender en settings" }, { status: 500 });

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
    const wb = MGMX.buildBackup(ExcelJS, D, today, { claves: setting(D, "backup_claves") === true });
    const content = Buffer.from(await wb.xlsx.writeBuffer()).toString("base64");
    const activas = (D.reservations as { status: string }[]).filter((r) => r.status !== "cancelada").length;

    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: sender.name ?? "MGM Control App", email: sender.email },
        to: to.map((email) => ({ email })),
        subject: `Respaldo MGM Control App · ${today}`,
        htmlContent: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#23272a"><p><b>Respaldo diario de MGM Control App</b> al ${today}.</p>
<p>${activas} reservas activas · ${D.transactions.length} gastos e ingresos · ${D.tasks.length} pendientes · ${D.purchases.length} compras.</p>
<p>El Excel adjunto empieza con las vistas para leer rápido (Resumen del día, calendarios, pendientes, nómina de la semana, gastos por depa y servicios) y al final trae las hojas "BD" con toda la información.</p></div>`,
        attachment: [{ name: `MGM_respaldo_${today}.xlsx`, content }],
      }),
    });
    if (!r.ok) throw new Error(`Brevo ${r.status}: ${await r.text()}`);
    await sb.from("settings").upsert({ key: "backup_last", value: Date.now() });
    return Response.json({ status: "enviado", to, reservas: activas });
  } catch (e) {
    console.error(e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
