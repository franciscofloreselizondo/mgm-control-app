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
  // ---------- Hojas funcionales: estadísticas arriba + tabla de Excel (filtros, orden, totales que respetan el filtro) ----------
  let TN = 0;
  const FMT = { money: MONEY, money0: MONEY0, date: FDATE, pct: '0%', int: '0' };
  function hoja(wb, name, tab, widths, tit, sub) {
    const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: tab } } });
    ws.columns = widths.map(w => ({ width: w })); titulo(ws, tit || name, sub || '', widths.length);
    ws.views = [{ showGridLines: false }]; ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    return ws;
  }
  // tabla nativa de Excel: cols = [encabezado, función(fila) → valor, formato?, total?]
  function tablaX(ws, r, cols, rows, o) {
    o = o || {};
    if (o.titulo) r = seccion(ws, r, o.titulo, cols.length);
    const data = rows.length ? rows.map(x => cols.map(c => { const v = c[1](x); return c[2] === 'date' ? fdate(v) : v == null ? null : v; })) : [cols.map((c, i) => i ? null : 'Sin registros')];
    const hasTot = cols.some(c => c[3]);
    ws.addTable({ name: 'T' + (++TN) + '_' + (o.id || 'tabla'), ref: 'A' + r, headerRow: true, totalsRow: hasTot,
      style: { theme: 'TableStyleMedium7', showRowStripes: true },
      columns: cols.map((c, i) => ({ name: c[0], filterButton: true, totalsRowLabel: i === 0 && hasTot ? 'Total (filtrado)' : undefined, totalsRowFunction: c[3] ? (c[3] === 'count' ? 'count' : 'sum') : (i === 0 && hasTot ? undefined : 'none') })),
      rows: data });
    for (let i = 0; i <= data.length + (hasTot ? 1 : 0); i++) cols.forEach((c, j) => { if (c[2] && FMT[c[2]]) ws.getCell(r + i, j + 1).numFmt = FMT[c[2]]; });
    if (o.paint) rows.forEach((x, i) => o.paint(ws.getRow(r + 1 + i), x));
    return r + data.length + (hasTot ? 2 : 1) + 1;
  }
  // panel de estadística (pequeña tabla estática con encabezado oscuro)
  function panel(ws, r, tit, heads, rows, fmts, ncol) {
    r = seccion(ws, r, tit, ncol || heads.length); r = encab(ws, r, heads);
    if (!rows.length) return fila(ws, r, ['Sin datos'], null, 0) + 1;
    rows.forEach((v, n) => { r = fila(ws, r, v, fmts, n); if (v[0] === 'TOTAL') for (let i = 1; i <= heads.length; i++) { const c = ws.getCell(r - 1, i); c.font = { bold: true }; c.fill = fill(K.forestL); } });
    return r + 1;
  }
  const mesesAtras = (ym, n) => Array.from({ length: n }, (_, i) => add(ym + '-15', -30 * i).slice(0, 7)).reverse();
  const mesLbl = m => MON[+m.slice(5) - 1] + ' ' + m.slice(2, 4);
  const diasMes = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)).getUTCDate();
  const nochesEn = (r, m) => { const ini = m + '-01', fin = add(m + '-' + P(diasMes(m)), 1); let n = 0; for (let d = r.checkin > ini ? r.checkin : ini; d < r.checkout && d < fin; d = add(d, 1)) n++; return n; };
  const prioCol = { alta: [K.rojoL, K.rojo], media: [K.amaL, K.ama], baja: [K.verdeL, K.verde] };
  const ST = { en_proceso: 'En proceso', en_pausa: 'En pausa', terminado: 'Terminado' };

  function hReservas(wb, D, today) {
    const ym = today.slice(0, 7), P0 = props(D), act = activas(D);
    const ws = hoja(wb, 'Reservas', K.forest, [16, 22, 13, 13, 9, 12, 9, 12, 12, 13], 'Reservas', 'Ocupación del mes arriba · tabla completa abajo (usa las flechas de los encabezados para filtrar y ordenar)');
    const delMes = act.filter(r => nochesEn(r, ym) > 0), noches = delMes.reduce((t, r) => t + nochesEn(r, ym), 0), cap = P0.length * diasMes(ym);
    let r = seccion(ws, 4, 'Ocupación de ' + MES[+ym.slice(5) - 1].toLowerCase(), 10);
    r = kpis(ws, r, [[delMes.length, 'Reservas en el mes', K.ink], [noches, 'Noches ocupadas', K.forest], [cap ? Math.round(noches / cap * 100) + '%' : '—', 'Ocupación portafolio', K.copper], [delMes.length ? (noches / delMes.length).toFixed(1) : '—', 'Noches por reserva', K.ink], [act.filter(x => x.checkout.startsWith(ym)).length, 'Salidas del mes', K.rojo]]);
    const rows = P0.map(p => { const rs = delMes.filter(x => x.property_code === p.code), n = rs.reduce((t, x) => t + nochesEn(x, ym), 0); return [p.code, rs.length, n, n / diasMes(ym), rs.reduce((t, x) => t + (Number(x.amount) || 0), 0)]; }).sort((a, b) => b[3] - a[3]);
    r = panel(ws, r, 'Ocupación por depa · ' + mesLbl(ym), ['Depa', 'Reservas', 'Noches', '% ocupación', 'Monto capturado'], [...rows, ['TOTAL', delMes.length, noches, cap ? noches / cap : 0, rows.reduce((t, x) => t + x[4], 0)]], [null, null, null, '0%', MONEY0]);
    const tend = mesesAtras(ym, 6).map(m => { const rs = act.filter(x => nochesEn(x, m) > 0), n = rs.reduce((t, x) => t + nochesEn(x, m), 0); return [mesLbl(m), rs.length, n, P0.length ? n / (P0.length * diasMes(m)) : 0]; });
    r = panel(ws, r, 'Tendencia últimos 6 meses', ['Mes', 'Reservas', 'Noches', '% ocupación'], tend, [null, null, null, '0%']);
    const ord = D.reservations.slice().sort((a, b) => b.checkin.localeCompare(a.checkin));
    tablaX(ws, r, [['Depa', x => x.property_code], ['Huésped', x => x.guest], ['Check in', x => x.checkin, 'date'], ['Check out', x => x.checkout, 'date'], ['Noches', x => Math.round((toD(x.checkout) - toD(x.checkin)) / 864e5), 'int', 'sum'],
      ['Estatus', x => x.status === 'cancelada' ? 'Cancelada' : x.checkout < today ? 'Terminada' : x.checkin <= today ? 'En curso' : 'Próxima'], ['Auto', x => x.has_car == null ? '' : x.has_car ? 'Sí' : 'No'], ['Cajón de', x => x.parking_from || ''], ['Chica', x => nombre(D, x.cleaner_key)], ['Monto', x => x.amount == null ? null : Number(x.amount), 'money', 'sum']], ord,
      { titulo: 'Todas las reservas (más recientes primero)', id: 'reservas', paint: (row, x) => { const c = row.getCell(6); if (x.status === 'cancelada') c.font = { color: { argb: K.rojo } }; else if (x.checkin <= today && today < x.checkout) c.font = { bold: true, color: { argb: K.verde } }; } });
  }
  function hNomina(wb, D, today) {
    const ws = hoja(wb, 'Nómina', K.forest, [14, 14, 12, 7, 16, 10, 11, 11, 12, 14], 'Nómina de limpieza', 'Semana actual y últimas 6 semanas arriba · detalle, pagos y otros abajo');
    const ini = monday(today), cs = D.cleaners.slice().sort((a, b) => a.name.localeCompare(b.name));
    const cur = cs.map(c => [c.name, nominaD(D, c.key, ini)]).filter(([, N]) => N.n || N.total || N.pagado);
    let r = panel(ws, 4, 'Semana del ' + fmtCorto(ini) + ' al ' + fmtCorto(add(ini, 6)), ['Chica', 'Limpiezas', 'Supervisión', 'Otros', 'Total', 'Pagado', 'Saldo'],
      [...cur.map(([n, N]) => [n, N.n, N.sup, N.otros, N.total, N.pagado, N.saldo]), ['TOTAL', ...[0, 1, 2, 3, 4, 5].map(i => cur.reduce((t, [, N]) => t + [N.n, N.sup, N.otros, N.total, N.pagado, N.saldo][i], 0))]], [null, null, MONEY0, MONEY0, MONEY0, MONEY0, MONEY0]);
    const sems = Array.from({ length: 6 }, (_, i) => add(ini, -7 * (5 - i)));
    const piv = cs.map(c => [c.name, ...sems.map(s => nominaD(D, c.key, s).total)]).filter(v => v.slice(1).some(x => x));
    r = panel(ws, r, 'Total por semana (lunes)', ['Chica', ...sems.map(fmtCorto)], [...piv, ['TOTAL', ...sems.map((_, i) => piv.reduce((t, v) => t + v[i + 1], 0))]], [null, ...sems.map(() => MONEY0)]);
    const bono = Number(settingD(D, 'bono_domingo', 50) ?? 50), rate = (p, k) => { const x = D.cleaning_rates.find(y => y.property_code === p && y.cleaner_key === k); return x ? Number(x.amount) : 0; };
    const det = [...activas(D).filter(x => x.cleaner_key).map(x => ({ k: x.cleaner_key, f: x.checkout, dp: x.property_code, tipo: 'Salida' })), ...(D.cleanings || []).filter(x => x.cleaner_key).map(x => ({ k: x.cleaner_key, f: x.date, dp: x.property_code, tipo: 'Extra' }))]
      .filter(x => x.f <= add(today, 14)).sort((a, b) => b.f.localeCompare(a.f)).map(x => ({ ...x, t: rate(x.dp, x.k), b: dow(x.f) === 0 ? bono : 0 }));
    r = tablaX(ws, r, [['Semana', x => monday(x.f), 'date'], ['Chica', x => nombre(D, x.k)], ['Fecha', x => x.f, 'date'], ['Día', x => DIA3[dow(x.f)]], ['Depa', x => x.dp], ['Tipo', x => x.tipo], ['Tarifa', x => x.t, 'money0', 'sum'], ['Bono dom.', x => x.b, 'money0', 'sum'], ['Total', x => x.t + x.b, 'money0', 'sum']], det, { titulo: 'Detalle de limpiezas pagables', id: 'nomina' });
    r = tablaX(ws, r, [['Semana', x => x.week_start, 'date'], ['Chica', x => nombre(D, x.cleaner_key)], ['Fecha de pago', x => x.date, 'date'], ['Forma', x => x.method], ['Monto', x => Number(x.amount), 'money0', 'sum'], ['Nota', x => x.note || '']], D.payroll_payments.slice().sort((a, b) => b.date.localeCompare(a.date)), { titulo: 'Pagos hechos', id: 'pagos' });
    tablaX(ws, r, [['Semana', x => x.week_start, 'date'], ['Chica', x => nombre(D, x.cleaner_key)], ['Descripción', x => x.description], ['Monto', x => Number(x.amount), 'money0', 'sum']], D.payroll_extras.slice().sort((a, b) => b.week_start.localeCompare(a.week_start)), { titulo: 'Otros (bonos y ajustes)', id: 'otros' });
  }
  function hLimpiezas(wb, D, today) {
    const ws = hoja(wb, 'Limpiezas', K.forest, [16, 12, 12, 12, 12, 12, 12, 30], 'Limpiezas', 'Cuántas hace cada chica por mes · descansos · limpiezas extra');
    const ms = mesesAtras(today.slice(0, 7), 6), cs = D.cleaners.slice().sort((a, b) => a.name.localeCompare(b.name));
    const cnt = (k, m) => activas(D).filter(x => x.cleaner_key === k && x.checkout.startsWith(m)).length + (D.cleanings || []).filter(x => x.cleaner_key === k && x.date.startsWith(m)).length;
    const piv = cs.map(c => [c.name, ...ms.map(m => cnt(c.key, m))]).filter(v => v.slice(1).some(x => x));
    let r = panel(ws, 4, 'Limpiezas por chica y mes', ['Chica', ...ms.map(mesLbl)], [...piv, ['TOTAL', ...ms.map((_, i) => piv.reduce((t, v) => t + v[i + 1], 0))]]);
    const sinAsig = activas(D).filter(x => !x.cleaner_key && x.checkout >= today && x.checkout <= add(today, 14) && (props(D).find(p => p.code === x.property_code) || {}).cleaning !== false);
    r = panel(ws, r, 'Salidas sin chica asignada · próximos 14 días', ['Fecha', 'Día', 'Depa', 'Huésped'], sinAsig.sort((a, b) => a.checkout.localeCompare(b.checkout)).map(x => [fdate(x.checkout), DIA3[dow(x.checkout)], x.property_code, x.guest]), [FDATE]);
    r = tablaX(ws, r, [['Fecha', x => x.date, 'date'], ['Día', x => DIA3[dow(x.date)]], ['Chica', x => nombre(D, x.cleaner_key)]], D.days_off.filter(o => o.date >= add(today, -30)).sort((a, b) => a.date.localeCompare(b.date)), { titulo: 'Descansos (último mes y próximos)', id: 'descansos' });
    tablaX(ws, r, [['Depa', x => x.property_code], ['Fecha', x => x.date, 'date'], ['Chica', x => nombre(D, x.cleaner_key) || 'Sin asignar'], ['Nota', x => x.note || '']], (D.cleanings || []).slice().sort((a, b) => b.date.localeCompare(a.date)), { titulo: 'Limpiezas extra', id: 'extras' });
  }
  function hFinanzas(wb, D, today) {
    const ym = today.slice(0, 7), tx = D.transactions || [];
    const ws = hoja(wb, 'Gastos e ingresos', K.copper, [16, 12, 16, 26, 13, 36, 13, 11, 8, 14], 'Gastos e ingresos', 'Resultado del mes, tendencia, categorías y depas · tabla completa abajo');
    const sum = (f) => tx.filter(f).reduce((t, x) => t + Number(x.amount), 0);
    const ing = sum(x => x.kind === 'ingreso' && x.date.startsWith(ym)), gas = sum(x => x.kind === 'gasto' && x.date.startsWith(ym));
    let r = seccion(ws, 4, MES[+ym.slice(5) - 1] + ' ' + ym.slice(0, 4), 10);
    r = kpis(ws, r, [[ing, 'Ingresos', K.verde], [gas, 'Gastos', K.rojo], [ing - gas, 'Resultado', ing - gas >= 0 ? K.verde : K.rojo], [tx.filter(x => x.date.startsWith(ym) && !x.checked).length, 'Sin palomita de capturado', K.ama]]);
    const ms = mesesAtras(ym, 12);
    r = panel(ws, r, 'Tendencia 12 meses', ['Mes', 'Ingresos', 'Gastos', 'Resultado'], ms.map(m => { const i = sum(x => x.kind === 'ingreso' && x.date.startsWith(m)), g = sum(x => x.kind === 'gasto' && x.date.startsWith(m)); return [mesLbl(m), i, g, i - g]; }), [null, MONEY0, MONEY0, MONEY0]);
    const m6 = ms.slice(-6), cats = [...new Set(tx.filter(x => x.kind === 'gasto').map(x => x.category))].sort();
    const pc = cats.map(c => [c, ...m6.map(m => sum(x => x.kind === 'gasto' && x.category === c && x.date.startsWith(m)))]).filter(v => v.slice(1).some(x => x));
    r = panel(ws, r, 'Gastos por categoría · últimos 6 meses', ['Categoría', ...m6.map(mesLbl)], [...pc, ['TOTAL', ...m6.map((_, i) => pc.reduce((t, v) => t + v[i + 1], 0))]], [null, ...m6.map(() => MONEY0)]);
    const deps = [...new Set(tx.filter(x => x.date.startsWith(ym)).map(x => x.property_code || 'General'))].sort();
    const pd = deps.map(d => { const i = sum(x => x.kind === 'ingreso' && (x.property_code || 'General') === d && x.date.startsWith(ym)), g = sum(x => x.kind === 'gasto' && (x.property_code || 'General') === d && x.date.startsWith(ym)); return [d, i, g, i - g]; }).sort((a, b) => b[3] - a[3]);
    r = panel(ws, r, 'Resultado por depa · ' + mesLbl(ym), ['Depa', 'Ingresos', 'Gastos', 'Resultado'], [...pd, ['TOTAL', ing, gas, ing - gas]], [null, MONEY0, MONEY0, MONEY0]);
    tablaX(ws, r, [['Mes', x => mesLbl(x.date.slice(0, 7))], ['Tipo', x => x.kind === 'ingreso' ? 'Ingreso' : 'Gasto'], ['Depa', x => x.property_code || 'General'], ['Categoría', x => x.category_other ? x.category + ': ' + x.category_other : x.category], ['Fecha', x => x.date, 'date'],
      ['Descripción', x => x.description || ''], ['Monto', x => (x.kind === 'gasto' ? -1 : 1) * Number(x.amount), 'money', 'sum'], ['Capturado', x => x.checked ? 'Sí' : 'No'], ['Fotos', x => (x.photos || []).length, 'int'], ['Origen', x => x.service_payment_id ? 'Servicios' : x.reservation_id ? 'Reserva' : 'Manual']],
      tx.slice().sort((a, b) => b.date.localeCompare(a.date)), { titulo: 'Todos los movimientos (gastos en negativo; el total es el resultado de lo filtrado)', id: 'finanzas', paint: (row, x) => { row.getCell(7).font = { color: { argb: x.kind === 'gasto' ? K.rojo : K.verde } }; } });
  }
  function hPendientes(wb, D, today) {
    const T = D.tasks || [], ab = T.filter(t => t.status !== 'terminado');
    const ws = hoja(wb, 'Pendientes', K.rojo, [11, 14, 46, 14, 13, 12, 40], 'Pendientes', 'Abiertos por prioridad, responsable y depa · tabla completa abajo (abiertos primero)');
    let r = seccion(ws, 4, 'Abiertos', 7);
    r = kpis(ws, r, [[ab.filter(t => t.priority === 'alta').length, 'Prioridad alta', K.rojo], [ab.filter(t => t.priority === 'media').length, 'Prioridad media', K.ama], [ab.filter(t => t.priority === 'baja').length, 'Prioridad baja', K.verde]]);
    const resp = [...new Set(T.map(t => t.responsible || 'Sin responsable'))];
    r = panel(ws, r, 'Por responsable', ['Responsable', 'En proceso', 'En pausa', 'Terminados', 'Abiertos'], resp.map(p => { const q = T.filter(t => (t.responsible || 'Sin responsable') === p); return [p, q.filter(t => t.status === 'en_proceso').length, q.filter(t => t.status === 'en_pausa').length, q.filter(t => t.status === 'terminado').length, q.filter(t => t.status !== 'terminado').length]; }).sort((a, b) => b[4] - a[4]));
    const dps = [...new Set(ab.map(t => t.property_code || 'General'))];
    r = panel(ws, r, 'Abiertos por depa', ['Depa', 'Alta', 'Media', 'Baja', 'Total'], dps.map(d => { const q = ab.filter(t => (t.property_code || 'General') === d); return [d, q.filter(t => t.priority === 'alta').length, q.filter(t => t.priority === 'media').length, q.filter(t => t.priority === 'baja').length, q.length]; }).sort((a, b) => b[4] - a[4]));
    const o = { alta: 0, media: 1, baja: 2 };
    tablaX(ws, r, [['Prioridad', x => (x.priority || '').toUpperCase()], ['Depa', x => x.property_code || 'General'], ['Descripción', x => x.description], ['Responsable', x => x.responsible || ''], ['Fecha', x => x.date, 'date'], ['Estatus', x => ST[x.status] || x.status], ['Avances', x => x.notes || '']],
      T.slice().sort((a, b) => (a.status === 'terminado') - (b.status === 'terminado') || (o[a.priority] ?? 3) - (o[b.priority] ?? 3) || (a.date || '').localeCompare(b.date || '')),
      { titulo: 'Todos los pendientes', id: 'pendientes', paint: (row, x) => { const pc = prioCol[x.priority]; if (pc) { row.getCell(1).fill = fill(pc[0]); row.getCell(1).font = { bold: true, color: { argb: pc[1] } }; } if (x.status === 'terminado') row.getCell(6).font = { color: { argb: K.gris } }; } });
  }
  function hCompras(wb, D) {
    const C2 = D.purchases || [], pend = C2.filter(p => !p.done);
    const ws = hoja(wb, 'Compras', K.copper, [40, 18, 14, 13, 11], 'Compras', 'Pendientes por comprar primero');
    let r = seccion(ws, 4, 'Estado', 5); r = kpis(ws, r, [[pend.length, 'Por comprar', K.rojo], [C2.length - pend.length, 'Comprados', K.verde]]);
    const lug = [...new Set(pend.map(p => p.store || 'Sin lugar'))];
    r = panel(ws, r, 'Por comprar, por lugar', ['Lugar', 'Pendientes'], lug.map(l => [l, pend.filter(p => (p.store || 'Sin lugar') === l).length]).sort((a, b) => b[1] - a[1]));
    tablaX(ws, r, [['Descripción', x => x.description], ['Lugar', x => x.store || ''], ['Responsable', x => x.responsible || ''], ['Fecha', x => x.date, 'date'], ['Comprado', x => x.done ? 'Sí' : 'No']], C2.slice().sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (b.date || '').localeCompare(a.date || '')),
      { titulo: 'Lista de compras', id: 'compras', paint: (row, x) => { if (!x.done) row.getCell(5).font = { bold: true, color: { argb: K.rojo } }; } });
  }
  function hCajones(wb, D, today) {
    const ym = today.slice(0, 7), ws = hoja(wb, 'Cajones', K.ink, [16, 26, 13, 13, 10, 12], 'Cajones Qalina', 'Quién pide y quién presta este mes · historial completo abajo');
    const ini = ym + '-01', fin = add(ym + '-' + P(diasMes(ym)), 1), nn = (a, b) => { let n = 0; for (let d = a > ini ? a : ini; d < b && d < fin; d = add(d, 1)) n++; return n; };
    const H = [...activas(D).filter(x => x.parking_from).map(x => ({ cajon: x.parking_from, quien: x.property_code, det: x.guest, tipo: 'Reserva', a: x.checkin, b: x.checkout })),
      ...(D.parking_loans || []).map(x => ({ cajon: x.cajon, quien: x.name, det: '', tipo: 'Externo', a: x.date_from, b: x.date_to }))];
    const Hm = H.map(x => ({ ...x, n: nn(x.a, x.b) })).filter(x => x.n > 0);
    const agrupa = k => { const g = {}; Hm.forEach(x => { const y = g[x[k]] = g[x[k]] || [0, 0]; y[0]++; y[1] += x.n; }); return Object.entries(g).sort((a, b) => b[1][1] - a[1][1]).map(([q, v]) => [q, v[0], v[1]]); };
    let r = panel(ws, 4, 'Quién pide más · ' + mesLbl(ym), ['Depa / persona', 'Veces', 'Noches'], agrupa('quien'));
    r = panel(ws, r, 'Quién presta más · ' + mesLbl(ym), ['Cajón de', 'Veces', 'Noches'], agrupa('cajon'));
    tablaX(ws, r, [['Cajón de', x => x.cajon], ['Prestado a', x => x.quien + (x.det ? ' · ' + x.det : '')], ['Desde', x => x.a, 'date'], ['Hasta', x => x.b, 'date'], ['Noches', x => Math.round((toD(x.b) - toD(x.a)) / 864e5), 'int', 'sum'], ['Tipo', x => x.tipo]], H.sort((a, b) => b.a.localeCompare(a.a)), { titulo: 'Historial de préstamos', id: 'cajones' });
  }
  function hCatalogos(wb, D, opts) {
    const ws = hoja(wb, 'Depas y tarifas', K.gris, [16, 12, 12, 9, 12, 12, 50], 'Depas, tarifas, bloqueos y usuarios', 'Catálogos de la app');
    const cs = D.cleaners.slice().sort((a, b) => a.name.localeCompare(b.name)), rate = (p, k) => { const x = D.cleaning_rates.find(y => y.property_code === p && y.cleaner_key === k); return x ? Number(x.amount) : null; };
    let r = tablaX(ws, 4, [['Depa', x => x.code], ['Edificio', x => x.building || ''], ['Tiene cajón', x => x.has_parking ? 'Sí' : 'No'], ['Sótano', x => x.parking_level ?? ''], ['Presta cajón', x => x.lends_parking ? 'Sí' : 'No'], ['Limpieza MGM', x => x.cleaning === false ? 'No' : 'Sí'], ['Liga Airbnb', x => x.airbnb_url || '']], props(D), { titulo: 'Depas', id: 'depas' });
    r = tablaX(ws, r, [['Depa', x => x.code], ...cs.map(c => [c.name, x => rate(x.code, c.key), 'money0'])], props(D), { titulo: 'Tarifas de limpieza por chica', id: 'tarifas' });
    r = tablaX(ws, r, [['Depa', x => x.property_code], ['Desde', x => x.date_from, 'date'], ['Hasta', x => x.date_to, 'date'], ['Nota', x => x.note || '']], D.blocks.slice().sort((a, b) => b.date_from.localeCompare(a.date_from)), { titulo: 'Bloqueos N/A', id: 'bloqueos' });
    r = tablaX(ws, r, [['Nombre', x => x.name || ''], ['Correo', x => x.email], ['Acceso', x => x.role]], D.app_users, { titulo: 'Usuarios', id: 'usuarios' });
    if (opts.claves) tablaX(ws, r, [['Lugar', x => x.place], ['Clave 1', x => x.code1 || ''], ['Clave 2', x => x.code2 || '']], D.access_codes, { titulo: 'Claves', id: 'claves' });
  }

  // Respaldo completo (mismo archivo para el correo de las 10 pm y para Drive): cada pestaña con estadísticas y tabla filtrable.
  function buildBackup(ExcelJS, D, today, opts) {
    opts = opts || {}; TN = 0;
    const wb = new ExcelJS.Workbook(); wb.creator = 'MGM Control App';
    const ym = today.slice(0, 7), nx = add(ym + '-28', 7).slice(0, 7), pv = add(ym + '-01', -1).slice(0, 7);
    resumen(wb, D, today);
    for (const m of [ym, nx, pv]) fillCalendar(wb.addWorksheet('Cal ' + MES[+m.slice(5) - 1].slice(0, 3) + m.slice(2, 4), { properties: { tabColor: { argb: K.ink } } }), D, m);
    hReservas(wb, D, today); hNomina(wb, D, today); hLimpiezas(wb, D, today); hFinanzas(wb, D, today);
    const sv = servicios(wb, D, ym.slice(0, 4));
    if (sv && (D.service_payments || []).length) { const acc = Object.fromEntries(D.service_accounts.map(a => [a.id, a])), last = sv.lastRow ? sv.lastRow.number + 2 : 6;
      tablaX(sv, last, [['Servicio', x => (acc[x.account_id] || {}).service], ['Propiedad', x => (acc[x.account_id] || {}).label], ['Contrato', x => (acc[x.account_id] || {}).contrato || ''], ['Mes', x => x.period], ['Estado', x => ({ pagado: 'Pagado', na: 'N/A', saldo_favor: 'Saldo a favor', pendiente: 'Pendiente' })[x.status] || x.status],
        ['Monto', x => x.amount == null ? null : Number(x.amount), 'money', 'sum'], ['Fecha de pago', x => x.paid_on, 'date'], ['Nota', x => x.note || '']], D.service_payments.slice().sort((a, b) => b.period.localeCompare(a.period)), { titulo: 'Todos los registros de pago', id: 'servicios' }); }
    hPendientes(wb, D, today); hCompras(wb, D); hCajones(wb, D, today); hCatalogos(wb, D, opts);
    return wb;
  }
  globalThis.MGMX = { fillCalendar, buildBackup, MES };
})();

// deno-lint-ignore no-explicit-any
const MGMX = (globalThis as any).MGMX;

// ---------- Fase 2 · A: reservas desde el iCal de Airbnb ----------
// Por cada depa con ical_url: altas, cambios de fechas y cancelaciones; todo queda en sync_log para que María lo revise.
function parseICS(txt: string) {
  const un = txt.replace(/\r?\n[ \t]/g, ""), ev: { start: string; end: string; summary: string; code: string; desc: string }[] = [];
  for (const blk of un.split("BEGIN:VEVENT").slice(1)) {
    const get = (k: string) => { const m = blk.match(new RegExp("^" + k + "[^:\\n]*:(.*)$", "m")); return m ? m[1].trim() : ""; };
    const d = (v: string) => v ? v.slice(0, 4) + "-" + v.slice(4, 6) + "-" + v.slice(6, 8) : "";
    const desc = get("DESCRIPTION").replace(/\\n/g, "\n"), code = (desc.match(/HM[A-Z0-9]{6,}/) || [""])[0];
    ev.push({ start: d(get("DTSTART")), end: d(get("DTEND")), summary: get("SUMMARY"), code, desc });
  }
  return ev;
}
async function syncAirbnb() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
  const props = ((await loadAll("properties")) as { code: string; ical_url?: string; active?: boolean }[]).filter((p) => p.ical_url && p.active !== false);
  const res = (await loadAll("reservations")) as { id: string; property_code: string; guest: string; checkin: string; checkout: string; status: string; airbnb_code?: string }[];
  const out = { depas: props.length, altas: 0, cambios: 0, bajas: 0, ligadas: 0, errores: [] as string[] };
  const log = (property_code: string, action: string, detail: string, reservation_id?: string) => sb.from("sync_log").insert({ property_code, action, detail, reservation_id });
  for (const p of props) {
    try {
      const r = await fetch(p.ical_url!, { headers: { "user-agent": "MGM Control App" } }); const txt = await r.text();
      if (!r.ok || !txt.includes("BEGIN:VCALENDAR")) { out.errores.push(p.code + ": " + r.status); continue; }
      const evs = parseICS(txt).filter((e) => e.code && e.start && e.end && e.end >= today);
      const mine = res.filter((x) => x.property_code === p.code && x.status !== "cancelada");
      for (const e of evs) {
        let x = res.find((y) => y.airbnb_code === e.code);
        if (!x) { // ¿ya la capturó María a mano? se liga por depa + fechas
          x = mine.find((y) => !y.airbnb_code && y.checkin === e.start && y.checkout === e.end) || mine.find((y) => !y.airbnb_code && y.checkin === e.start);
          if (x) { await sb.from("reservations").update({ airbnb_code: e.code }).eq("id", x.id); x.airbnb_code = e.code; out.ligadas++; await aplicarMail(e.code);
            if (x.checkout !== e.end) { await sb.from("reservations").update({ checkout: e.end, review: true }).eq("id", x.id); await log(p.code, "cambio", `${x.guest}: salida ${x.checkout} → ${e.end} (${e.code})`, x.id); out.cambios++; }
            continue; }
        }
        if (x) {
          if (x.status === "cancelada") { await sb.from("reservations").update({ status: "activa", review: true }).eq("id", x.id); await log(p.code, "alta", `Reactivada en Airbnb: ${x.guest} ${e.start} → ${e.end} (${e.code})`, x.id); out.altas++; }
          else if (x.checkin !== e.start || x.checkout !== e.end) { await sb.from("reservations").update({ checkin: e.start, checkout: e.end, review: true }).eq("id", x.id); await log(p.code, "cambio", `${x.guest}: ${x.checkin}→${x.checkout} ahora ${e.start}→${e.end} (${e.code})`, x.id); out.cambios++; }
          continue;
        }
        const { data } = await sb.from("reservations").insert({ property_code: p.code, guest: "Airbnb " + e.code, checkin: e.start, checkout: e.end, airbnb_code: e.code, source: "airbnb", review: true, status: "activa" }).select("id").single();
        const conMail = await aplicarMail(e.code);
        await log(p.code, "alta", `Nueva reserva ${e.start} → ${e.end} (${e.code}). ${conMail ? "Falta asignar chica." : "Falta nombre del huésped y chica."}`, data?.id); out.altas++;
      }
      const vivos = new Set(evs.map((e) => e.code));
      if (!vivos.size && mine.some((y) => y.airbnb_code && y.checkin >= today)) { out.errores.push(p.code + ": calendario vacío, no se cancela nada"); continue; }
      for (const x of mine.filter((y) => y.airbnb_code && y.checkin >= today && !vivos.has(y.airbnb_code))) {
        await sb.from("reservations").update({ status: "cancelada", review: true }).eq("id", x.id);
        await log(p.code, "baja", `Ya no aparece en Airbnb (cancelada): ${x.guest} ${x.checkin} → ${x.checkout} (${x.airbnb_code})`, x.id); out.bajas++;
      }
    } catch (e) { out.errores.push(p.code + ": " + String(e).slice(0, 80)); }
  }
  await sb.from("settings").upsert({ key: "airbnb_sync_last", value: { at: new Date().toISOString(), ...out } });
  return out;
}

// ---------- Fase 2 · B: correos de Airbnb reenviados por María → nombre del huésped y monto ----------
function parseMail(m: { subject: string; body: string }) {
  const txt = m.subject + "\n" + m.body, code = (txt.match(/\bHM[A-Z0-9]{8}\b/) || [""])[0];
  const kind = /cancelad|cancel(l)?ed/i.test(m.subject) ? "baja" : /confirmad|confirmed|nueva reserv|new booking|instant/i.test(m.subject) ? "alta"
    : /modific|changed|altered|actualiz/i.test(m.subject) ? "cambio" : "otro";
  const g = m.subject.match(/[:\-–]\s*(.+?)\s+(llega|arrives|ha cancelado|canceled|cancelled|reserv)/i);
  const num = (re: RegExp) => { const x = m.body.match(re); return x ? Number(x[1].replace(/[,\s]/g, "")) : null; };
  const amount = num(/(?:T[uú] ganas|Ganas|You earn|Your payout|Pago al anfitri[oó]n)[^$\d]{0,40}\$\s?([\d,]+(?:\.\d{1,2})?)/i);
  return { code, kind, guest: g ? g[1].trim().slice(0, 80) : null, amount: amount && amount > 0 ? amount : null };
}
async function ingestAirbnb(body: { mails?: { id: string; subject: string; body: string; date: string }[] }) {
  const out = { recibidos: 0, con_codigo: 0, aplicados: 0 };
  for (const m of body.mails || []) {
    out.recibidos++; const p = parseMail(m); if (!p.code || p.kind === "otro") continue; out.con_codigo++;
    const { data: prev } = await sb.from("airbnb_mail").select("*").eq("code", p.code).maybeSingle();
    await sb.from("airbnb_mail").upsert({ code: p.code, guest: p.guest ?? prev?.guest ?? null, amount: p.amount ?? prev?.amount ?? null, kind: p.kind, subject: m.subject.slice(0, 200), received_at: m.date });
    if (await aplicarMail(p.code)) out.aplicados++;
  }
  return out;
}
async function aplicarMail(code: string) {
  const { data: am } = await sb.from("airbnb_mail").select("*").eq("code", code).maybeSingle();
  const { data: r } = await sb.from("reservations").select("id,guest,amount,property_code").eq("airbnb_code", code).maybeSingle();
  if (!am || !r) return false;
  const patch: Record<string, unknown> = {};
  if (am.guest && (!r.guest || r.guest.startsWith("Airbnb HM"))) patch.guest = am.guest;
  if (am.amount && !r.amount) patch.amount = am.amount;
  if (!Object.keys(patch).length) return false;
  await sb.from("reservations").update(patch).eq("id", r.id);
  await sb.from("sync_log").insert({ property_code: r.property_code, action: "correo", detail: `Del correo de Airbnb: ${patch.guest ?? r.guest}${patch.amount ? " · $" + Number(patch.amount).toLocaleString("es-MX") : ""} (${code})`, reservation_id: r.id, seen: true });
  return true;
}

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
    // Interruptores de Admin → Automatizaciones (María puede pausar todo o cada una)
    const { data: au } = await sb.from("settings").select("value").eq("key", "automatizaciones").maybeSingle();
    const A = (au?.value ?? {}) as Record<string, unknown>, activa = (k: string) => A.on !== false && A[k] !== false;
    if (url.searchParams.get("sync") === "airbnb") return Response.json(activa("ical") ? await syncAirbnb() : { pausado: true });
    if (url.searchParams.get("ingest") === "airbnb") {
      const KEY = Deno.env.get("BACKUP_DRIVE_KEY") ?? "";
      if (!KEY || req.headers.get("x-mgm-key") !== KEY) return Response.json({ error: "no autorizado" }, { status: 401 });
      if (!activa("correos")) return Response.json({ pausado: true });
      return Response.json(await ingestAirbnb(await req.json()));
    }
    if (url.searchParams.get("file") === "1") {
      const KEY = Deno.env.get("BACKUP_DRIVE_KEY") ?? "";
      if (!KEY || req.headers.get("x-mgm-key") !== KEY) return Response.json({ error: "no autorizado" }, { status: 401 });
      const tipo = url.searchParams.get("tipo") || "datos";
      if (!activa("resp_drive")) return new Response(null, { status: 204 });
      if (tipo === "esquema") {
        const { data, error } = await sb.rpc("bk_schema"); if (error) throw error;
        return new Response(String(data), { headers: { "content-type": "text/plain; charset=utf-8" } });
      }
      if (tipo === "claves") { // solo para el paquete semanal de Drive
        const rows = (await loadAll("access_codes")) as { place: string; code1?: string; code2?: string }[];
        const q = (v?: string) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
        return new Response("\uFEFFLugar,Clave 1,Clave 2\n" + rows.map((r) => [r.place, r.code1, r.code2].map(q).join(",")).join("\n"), { headers: { "content-type": "text/csv; charset=utf-8" } });
      }
      if (tipo === "fotos") { // rutas de comprobantes (gastos y servicios) con liga firmada de 2 h para que el script las copie a Drive
        const paths = new Set<string>();
        for (const t of ["transactions", "service_payments"]) for (const r of (await loadAll(t)) as { photos?: string[] }[]) for (const ph of r.photos || []) if (typeof ph === "string" && ph) paths.add(ph);
        const list = [...paths], out: { path: string; url: string }[] = [];
        for (let i = 0; i < list.length; i += 100) { const { data } = await sb.storage.from("comprobantes").createSignedUrls(list.slice(i, i + 100), 7200);
          for (const d of data || []) if (d.signedUrl && d.path) out.push({ path: d.path, url: d.signedUrl }); }
        return Response.json(out);
      }
      const D: Record<string, unknown[]> = {};
      for (const t of TABLES) D[t] = await loadAll(t);
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
      const wb = MGMX.buildBackup(ExcelJS, D, today, { claves: setting(D, "backup_claves") === true });
      return new Response(await wb.xlsx.writeBuffer(), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
    }
    if (!activa("resp_correo")) return Response.json({ pausado: true });
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
<p>El Excel adjunto trae el Resumen del día, los calendarios y una pestaña por módulo (Reservas, Nómina, Limpiezas, Gastos e ingresos, Servicios, Pendientes, Compras, Cajones y Depas) con estadísticas arriba y la tabla completa abajo, con filtros y totales.</p></div>`,
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
