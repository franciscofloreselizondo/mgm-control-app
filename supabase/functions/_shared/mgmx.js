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
  const props = D => D.properties.filter(p => p.active !== false).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
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
          if (noche) { row.getCell(c).value = noche.checkin === d || i === 0 ? noche.guest : 'X'; row.getCell(c).font = { color: { argb: C.azul } }; }
          let es = '';
          if (p.building === 'Qalina') {
            const pr = ls.find(r => r.checkin <= d && d < r.checkout);
            if (pr) es = 'Prestado a ' + corto(pr.property_code);
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

  function table(wb, name, cols, rows) {
    const ws = wb.addWorksheet(name);
    ws.columns = cols.map(([header, key, width]) => ({ header, key, width: width || 16 }));
    rows.forEach(r => ws.addRow(r));
    ws.getRow(1).font = { bold: true }; ws.views = [{ state: 'frozen', ySplit: 1 }];
    return ws;
  }

  // Respaldo completo: una hoja por pestaña de la app.
  function buildBackup(ExcelJS, D, today, opts) {
    opts = opts || {};
    const wb = new ExcelJS.Workbook(); wb.creator = 'MGM Control App';
    const ym = today.slice(0, 7), nx = add(ym + '-28', 7).slice(0, 7), pv = add(ym + '-01', -1).slice(0, 7);
    for (const m of [ym, nx, pv]) fillCalendar(wb.addWorksheet('Cal ' + MES[+m.slice(5) - 1].slice(0, 3) + m.slice(2, 4)), D, m);
    const ord = Object.fromEntries(props(D).map((p, i) => [p.code, i]));
    const cat = t => (t.category_other ? t.category + ': ' + t.category_other : t.category);
    const rate = (p, k) => { const r = D.cleaning_rates.find(x => x.property_code === p && x.cleaner_key === k); return r ? Number(r.amount) : null; };
    const bono = Number((D.settings.find(s => s.key === 'bono_domingo') || {}).value ?? 50);
    table(wb, 'Reservas', [['Departamento', 'property_code'], ['Huésped', 'guest', 22], ['Check in', 'checkin', 12], ['Check out', 'checkout', 12], ['Auto', 'auto', 8], ['Cajón de', 'parking_from', 12], ['Chica', 'chica', 12], ['Monto', 'amount', 12], ['Estatus', 'status', 12]],
      D.reservations.slice().sort((a, b) => a.checkin.localeCompare(b.checkin) || (ord[a.property_code] ?? 99) - (ord[b.property_code] ?? 99))
        .map(r => ({ ...r, auto: r.has_car == null ? '' : r.has_car ? 'Sí' : 'No', chica: nombre(D, r.cleaner_key), amount: r.amount == null ? null : Number(r.amount) })));
    table(wb, 'Nómina limpiezas', [['Semana (lunes)', 'sem', 14], ['Chica', 'chica'], ['Fecha', 'f', 12], ['Departamento', 'dp'], ['Tipo', 'tipo', 10], ['Tarifa', 't', 10], ['Bono domingo', 'b', 14], ['Total', 'tot', 10]],
      [...activas(D).filter(r => r.cleaner_key).map(r => ({ k: r.cleaner_key, f: r.checkout, dp: r.property_code, tipo: 'Salida' })), ...(D.cleanings || []).filter(x => x.cleaner_key).map(x => ({ k: x.cleaner_key, f: x.date, dp: x.property_code, tipo: 'Extra' }))]
        .sort((a, b) => a.f.localeCompare(b.f))
        .map(r => { const t = rate(r.dp, r.k) || 0, b = dow(r.f) === 0 ? bono : 0; return { sem: monday(r.f), chica: nombre(D, r.k), f: r.f, dp: r.dp, tipo: r.tipo, t, b, tot: t + b }; }));
    table(wb, 'Limpiezas extra', [['Departamento', 'property_code'], ['Fecha', 'date', 12], ['Chica', 'chica'], ['Nota', 'note', 36]], (D.cleanings || []).slice().sort((a, b) => a.date.localeCompare(b.date)).map(x => ({ ...x, chica: nombre(D, x.cleaner_key) })));
    table(wb, 'Nómina otros', [['Semana (lunes)', 'week_start', 14], ['Chica', 'chica'], ['Descripción', 'description', 36], ['Monto', 'amount', 10]],
      D.payroll_extras.slice().sort((a, b) => a.week_start.localeCompare(b.week_start)).map(x => ({ ...x, chica: nombre(D, x.cleaner_key), amount: Number(x.amount) })));
    table(wb, 'Nómina pagos', [['Semana (lunes)', 'week_start', 14], ['Chica', 'chica'], ['Fecha de pago', 'date', 14], ['Forma', 'method', 14], ['Monto', 'amount', 10], ['Nota', 'note', 30]],
      D.payroll_payments.slice().sort((a, b) => a.date.localeCompare(b.date)).map(x => ({ ...x, chica: nombre(D, x.cleaner_key), amount: Number(x.amount) })));
    for (const [kind, name] of [['gasto', 'Gastos'], ['ingreso', 'Ingresos']])
      table(wb, name, [['Mes', 'mes', 10], ['Departamento', 'property_code'], ['Categoría', 'cat', 26], ['Fecha', 'date', 12], ['Descripción', 'description', 40], ['Monto', 'amount', 12], ['Capturado', 'cap', 10], ['Fotos', 'nf', 7]],
        D.transactions.filter(t => t.kind === kind).sort((a, b) => a.date.slice(0, 7).localeCompare(b.date.slice(0, 7)) || (ord[a.property_code] ?? 99) - (ord[b.property_code] ?? 99) || cat(a).localeCompare(cat(b)) || a.date.localeCompare(b.date))
          .map(t => ({ ...t, mes: t.date.slice(0, 7), cat: cat(t), amount: Number(t.amount), cap: t.checked ? 'Sí' : 'No', nf: (t.photos || []).length })));
    table(wb, 'Pendientes', [['Departamento', 'property_code'], ['Descripción', 'description', 40], ['Responsable', 'responsible'], ['Fecha', 'date', 12], ['Prioridad', 'priority', 10], ['Estatus', 'status', 12], ['Avances', 'progress', 40]], D.tasks);
    table(wb, 'Compras', [['Descripción', 'description', 40], ['Lugar', 'store'], ['Responsable', 'responsible'], ['Fecha', 'date', 12], ['Comprado', 'ok', 10]], D.purchases.map(p => ({ ...p, ok: p.done ? 'Sí' : 'No' })));
    table(wb, 'Depas y ligas', [['Departamento', 'code'], ['Edificio', 'building'], ['Tiene cajón', 'hp', 12], ['Sótano', 'parking_level', 8], ['Presta cajón', 'lp', 12], ['Liga Airbnb', 'airbnb_url', 50]],
      props(D).map(p => ({ ...p, hp: p.has_parking ? 'Sí' : 'No', lp: p.lends_parking ? 'Sí' : 'No' })));
    const cs = D.cleaners.slice().sort((a, b) => a.name.localeCompare(b.name));
    table(wb, 'Tarifas limpieza', [['Departamento', 'code'], ...cs.map(c => [c.name, c.key, 10])], props(D).map(p => ({ code: p.code, ...Object.fromEntries(cs.map(c => [c.key, rate(p.code, c.key)])) })));
    table(wb, 'Descansos', [['Fecha', 'date', 12], ['Chica', 'chica']], D.days_off.slice().sort((a, b) => a.date.localeCompare(b.date)).map(o => ({ ...o, chica: nombre(D, o.cleaner_key) })));
    table(wb, 'Bloqueos NA', [['Departamento', 'property_code'], ['Desde', 'date_from', 12], ['Hasta', 'date_to', 12], ['Nota', 'note', 30]], D.blocks);
    if (opts.claves) table(wb, 'Claves', [['Lugar', 'place', 20], ['Clave 1', 'code1'], ['Clave 2', 'code2']], D.access_codes);
    table(wb, 'Usuarios', [['Nombre', 'name'], ['Correo', 'email', 30], ['Acceso', 'role']], D.app_users);
    return wb;
  }
  globalThis.MGMX = { fillCalendar, buildBackup, MES };
})();
