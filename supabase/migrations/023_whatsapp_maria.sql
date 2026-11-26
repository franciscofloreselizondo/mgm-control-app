-- WhatsApp con Claudio para María: 10 avisos configurables en Admin → Automatizaciones → WhatsApp.
-- Todo nace APAGADO. n8n llama mgm_wa_tick() cada 5 min, manda lo que regresa y marca con mgm_wa_marcar().
create table if not exists wa_avisos (
  id bigserial primary key,
  item text not null,
  ref text not null,                 -- evita duplicados: item + día + hora, o el id del movimiento
  created_at timestamptz default now(),
  resumen text not null,             -- una línea (va en la plantilla de WhatsApp)
  detalle text not null,             -- varias líneas con ligas (se manda cuando María responde "ver")
  estado text not null default 'pendiente' check (estado in ('pendiente','enviado','error','omitido')),
  enviado_at timestamptz,
  error text,
  visto boolean default false,
  unique (item, ref)
);
alter table wa_avisos enable row level security;
drop policy if exists super_read on wa_avisos;
create policy super_read on wa_avisos for select to authenticated using (my_role() = 'superadmin');

insert into settings (key, value) values ('whatsapp', '{"on": false, "silencio": ["23:00","07:00"], "items": {}}'::jsonb)
on conflict (key) do nothing;

create or replace function mgm_wa_link(q text) returns text language sql immutable as
$$ select 'https://franciscofloreselizondo.github.io/mgm-control-app/?ir=' || q $$;

create or replace function mgm_wa_fmt(d date) returns text language sql immutable as
$$ select (array['dom','lun','mar','mié','jue','vie','sáb'])[extract(dow from d)::int + 1] || ' ' || extract(day from d)::int || '/' || extract(month from d)::int $$;

create or replace function mgm_wa_money(n numeric) returns text language sql immutable as
$$ select '$' || to_char(round(coalesce(n,0)), 'FM999,999,990') $$;

-- Arma el contenido de un aviso programado. Regresa null cuando no hay nada que decir.
create or replace function mgm_wa_contenido(p_item text, p_cfg jsonb, p_hoy date) returns table(resumen text, detalle text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  lim date; n int; m int; txt text; acc text; mes_ant text; ini date; fin date;
begin
  if p_item = 'arranque' then
    select count(*), count(*) filter (where coalesce(p.cleaning, true) and r.cleaner_key is null) into n, m
      from reservations r join properties p on p.code = r.property_code where r.status = 'activa' and r.checkout = p_hoy;
    resumen := format('Arranque %s: %s salidas, %s sin chica, %s entradas, %s libres', mgm_wa_fmt(p_hoy), n, m,
      (select count(*) from reservations where status='activa' and checkin = p_hoy),
      (select count(*) from properties where active is not false and coalesce(kind,'depa') <> 'cajon' and code not in (select property_code from reservations where status='activa' and checkin <= p_hoy and checkout > p_hoy)));
    select string_agg(format('• %s · sale %s%s → %s', s.property_code, s.guest, case when s.ent then ' · *entra otro hoy*' else '' end,
             case when not s.mgm then 'no la hacemos' when s.cleaner_key = 'NA' then 'N/A'
                  when s.cleaner_key is null then '*SIN CHICA* ' || mgm_wa_link('asignar&res=' || s.id) else coalesce(c.name, s.cleaner_key) end), E'\n' order by s.cleaner_key nulls first, s.property_code)
      into txt from (select r.*, exists(select 1 from reservations b where b.status='activa' and b.property_code = r.property_code and b.checkin = p_hoy) ent, coalesce(p.cleaning, true) mgm
                     from reservations r join properties p on p.code = r.property_code where r.status = 'activa' and r.checkout = p_hoy) s
      left join cleaners c on c.key = s.cleaner_key;
    detalle := '☀️ *Arranque del día · ' || mgm_wa_fmt(p_hoy) || '*' || E'\n\n*Salidas*\n' || coalesce(txt, 'Ninguna') ||
      E'\n\n*Entradas*\n' || coalesce((select string_agg('• ' || property_code || ' · ' || guest, E'\n' order by property_code) from reservations where status='activa' and checkin = p_hoy), 'Ninguna') ||
      E'\n\n*Libres esta noche:* ' || coalesce((select string_agg(code, ', ' order by sort, code) from properties where active is not false and coalesce(kind,'depa') <> 'cajon'
          and code not in (select property_code from reservations where status='activa' and checkin <= p_hoy and checkout > p_hoy)), 'ninguno') ||
      coalesce(E'\n*Descansan:* ' || (select string_agg(c.name, ', ') from days_off d join cleaners c on c.key = d.cleaner_key where d.date = p_hoy), '') ||
      E'\n\nVer Hoy: ' || mgm_wa_link('hoy');
    return next; return;

  elsif p_item = 'asignaciones' then
    lim := p_hoy + 1;
    select count(*), count(*) filter (where r.cleaner_key is null) into n, m from reservations r join properties p on p.code = r.property_code
      where r.status = 'activa' and r.checkout = lim and coalesce(p.cleaning, true);
    if n = 0 then return; end if;
    resumen := format('Asignaciones de mañana %s: %s limpiezas%s', mgm_wa_fmt(lim), n, case when m > 0 then format(', %s sin chica', m) else ', todas asignadas' end);
    detalle := '🧹 *Asignaciones de mañana · ' || mgm_wa_fmt(lim) || '*' || E'\n\n' ||
      coalesce((select string_agg(x, E'\n\n') from (
        select format('*%s*', coalesce(c.name, 'SIN ASIGNAR')) || E'\n' || string_agg('• ' || r.property_code || ' – Salida' ||
               case when exists(select 1 from reservations b where b.status='activa' and b.property_code = r.property_code and b.checkin = lim) then ' · entra huésped' else '' end ||
               case when coalesce((p_cfg->>'claves')::boolean, false) then coalesce(' · clave ' || nullif(concat_ws(' / ', a.code1, a.code2), ''), '') else '' end ||
               case when r.cleaner_key is null then ' → ' || mgm_wa_link('asignar&res=' || r.id) else '' end, E'\n' order by r.property_code) x
        from reservations r join properties p on p.code = r.property_code left join cleaners c on c.key = r.cleaner_key left join access_codes a on a.place = r.property_code
        where r.status = 'activa' and r.checkout = lim and coalesce(p.cleaning, true) and coalesce(r.cleaner_key,'') <> 'NA'
        group by c.name order by c.name nulls last) g), '') ||
      E'\n\nTexto para reenviar: ' || mgm_wa_link('asigwa&d=' || lim);
    return next; return;

  elsif p_item = 'sin_chica' then
    lim := p_hoy + ceil(coalesce((p_cfg->>'anticipacion')::numeric, 36) / 24)::int;
    select count(*) into n from reservations r join properties p on p.code = r.property_code
      where r.status = 'activa' and coalesce(p.cleaning, true) and r.checkout between p_hoy and lim
        and (r.cleaner_key is null or exists(select 1 from days_off d where d.date = r.checkout and d.cleaner_key = r.cleaner_key));
    if n = 0 then return; end if;
    resumen := format('Limpieza sin chica: %s salida(s) hasta el %s', n, mgm_wa_fmt(lim));
    detalle := '🙋 *Limpiezas por resolver*' || E'\n\n' || (select string_agg(format('• %s · %s · %s → %s', r.property_code, mgm_wa_fmt(r.checkout),
        case when r.cleaner_key is null then 'sin chica' else coalesce(c.name, r.cleaner_key) || ' descansa' end, mgm_wa_link('asignar&res=' || r.id)), E'\n' order by r.checkout, r.property_code)
      from reservations r join properties p on p.code = r.property_code left join cleaners c on c.key = r.cleaner_key
      where r.status = 'activa' and coalesce(p.cleaning, true) and r.checkout between p_hoy and lim
        and (r.cleaner_key is null or exists(select 1 from days_off d where d.date = r.checkout and d.cleaner_key = r.cleaner_key)));
    return next; return;

  elsif p_item = 'cajones' then
    lim := p_hoy + ceil(coalesce((p_cfg->>'anticipacion')::numeric, 48) / 24)::int;
    select count(*) into n from reservations r join properties p on p.code = r.property_code
      where r.status = 'activa' and p.building = 'Qalina' and coalesce(p.has_parking, false) = false and r.checkin between p_hoy and lim
        and (r.has_car is null or (r.has_car and r.parking_from is null));
    if n = 0 then return; end if;
    resumen := format('Cajones Qalina: %s llegada(s) por resolver hasta el %s', n, mgm_wa_fmt(lim));
    detalle := '🚗 *Cajones Qalina*' || E'\n\n' || (select string_agg(format('• %s · llega %s · %s → %s', r.property_code, mgm_wa_fmt(r.checkin),
        case when r.has_car is null then '¿trae auto?' else 'trae auto, falta cajón' end, mgm_wa_link('cajon&res=' || r.id)), E'\n' order by r.checkin, r.property_code)
      from reservations r join properties p on p.code = r.property_code
      where r.status = 'activa' and p.building = 'Qalina' and coalesce(p.has_parking, false) = false and r.checkin between p_hoy and lim
        and (r.has_car is null or (r.has_car and r.parking_from is null)));
    return next; return;

  elsif p_item = 'nomina' then
    ini := date_trunc('week', p_hoy)::date - 7; fin := ini + 7;   -- semana lunes-domingo que acaba de cerrar (misma regla que la pestaña Nómina)
    with l as (
      select r.cleaner_key k, r.property_code dp, r.checkout f, 'r:' || r.id lid from reservations r where r.status = 'activa' and r.checkout >= ini and r.checkout < fin
      union all select x.cleaner_key, x.property_code, x.date, 'x:' || x.id from cleanings x where x.date >= ini and x.date < fin),
    t as (select l.k, count(*) n, sum(coalesce(cr.amount, 0) + case when extract(dow from l.f) = 0 then coalesce((select (value#>>'{}')::numeric from settings where key = 'bono_domingo'), 50) else 0 end) tot
          from l left join cleaning_rates cr on cr.property_code = l.dp and cr.cleaner_key = l.k where l.k is not null and l.k <> 'NA' group by l.k),
    sv as (select s.key sup, tm.c, coalesce((s.value->>'monto')::numeric, 0) monto
           from jsonb_each(coalesce((select value from settings where key = 'supervision'), '{"R":{"team":["F","K","G","A"],"monto":30}}'::jsonb)) s,
                jsonb_array_elements_text(coalesce(s.value->'team', '[]'::jsonb)) tm(c)),
    su as (select sv.sup k, count(*) n, sum(sv.monto) x from sv join l on l.k = sv.c
           where not coalesce((select value from settings where key = 'sup_quitar'), '[]'::jsonb) ? l.lid
             and not exists(select 1 from jsonb_array_elements(coalesce((select value from settings where key = 'sup_pausas'), '[]'::jsonb)) pz
                            where pz->>'sup' = sv.sup and l.f between (pz->>'from')::date and (pz->>'to')::date)
           group by sv.sup),
    e as (select cleaner_key k, sum(amount) x from payroll_extras where week_start = ini group by 1),
    p as (select cleaner_key k, sum(amount) x from payroll_payments where week_start = ini group by 1),
    ks as (select k from t union select k from su),
    tot as (select ks.k, coalesce(t.n, 0) n, coalesce(t.tot, 0) + coalesce(su.x, 0) + coalesce(e.x, 0) total, coalesce(su.n, 0) sn, coalesce(su.x, 0) sx, coalesce(e.x, 0) ex, coalesce(p.x, 0) px
            from ks left join t on t.k = ks.k left join su on su.k = ks.k left join e on e.k = ks.k left join p on p.k = ks.k)
    select count(*), round(sum(tot.total))::int, string_agg(format('• *%s*: %s limpiezas%s%s · %s · %s → %s', c.name, tot.n,
             case when tot.sn > 0 then format(' + supervisión %s (%s)', tot.sn, mgm_wa_money(tot.sx)) else '' end,
             case when tot.ex > 0 then ' + otros ' || mgm_wa_money(tot.ex) else '' end,
             'total ' || mgm_wa_money(tot.total),
             case when tot.px >= tot.total then 'pagado ✅' else 'falta ' || mgm_wa_money(tot.total - tot.px) end,
             mgm_wa_link('pago&chica=' || tot.k || '&sem=' || ini)), E'\n' order by c.name)
      into n, m, txt from tot join cleaners c on c.key = tot.k;
    if coalesce(n, 0) = 0 then return; end if;
    resumen := format('Corte de nómina %s al %s: %s chicas, total %s', mgm_wa_fmt(ini), mgm_wa_fmt(fin - 1), n, mgm_wa_money(m));
    detalle := '💵 *Corte de nómina · ' || mgm_wa_fmt(ini) || ' al ' || mgm_wa_fmt(fin - 1) || '*' || E'\n\n' || txt ||
      E'\n\nVer nómina: ' || mgm_wa_link('nomina&sem=' || ini);
    return next; return;

  elsif p_item = 'servicios' then
    mes_ant := to_char(p_hoy - interval '1 month', 'YYYY-MM');
    with pend as (
      select a.* from service_accounts a where a.active is not false and a.responsable is not null
        and exists(select 1 from service_payments x where x.account_id = a.id and x.status <> 'na')
        and not exists(select 1 from service_payments x where x.account_id = a.id and x.period = mes_ant)),
    venc as (
      select a.*, (regexp_match(a.vencimiento, '(\d+)'))[1]::int dia from service_accounts a
      where a.active is not false and a.responsable is not null and a.vencimiento ~ '\d'
        and not exists(select 1 from service_payments x where x.account_id = a.id and x.period = to_char(p_hoy, 'YYYY-MM'))),
    v7 as (select * from venc where make_date(extract(year from p_hoy)::int, extract(month from p_hoy)::int, least(greatest(dia,1), extract(day from (date_trunc('month', p_hoy) + interval '1 month - 1 day'))::int)) between p_hoy and p_hoy + 7)
    select (select count(*) from pend), (select count(*) from v7),
           (select string_agg(format('• %s %s → %s', coalesce(property_code, label), service, mgm_wa_link('servpago&acc=' || id || '&m=' || mes_ant)), E'\n' order by property_code, service) from (select * from pend order by property_code limit 12) z),
           (select string_agg(format('• %s %s · vence día %s → %s', coalesce(property_code, label), service, dia, mgm_wa_link('servpago&acc=' || id || '&m=' || to_char(p_hoy, 'YYYY-MM'))), E'\n' order by dia, property_code) from (select * from v7 order by dia limit 12) z)
      into n, m, txt, acc;
    if n + m = 0 then return; end if;
    resumen := format('Pagos de servicios: %s pendientes de %s, %s vencen en 7 días', n, mes_ant, m);
    detalle := '🧾 *Pagos de servicios*' || E'\n\n*Pendientes de ' || mes_ant || E'*\n' || coalesce(txt, 'Ninguno') ||
      E'\n\n*Vencen en 7 días*\n' || coalesce(acc, 'Ninguno') || E'\n\nVer mes: ' || mgm_wa_link('servicios&m=' || mes_ant);
    return next; return;

  elsif p_item = 'pendientes' then
    select count(*) filter (where status <> 'terminado' and priority = 'alta'),
           count(*) filter (where status <> 'terminado' and date < p_hoy) into n, m from tasks;
    resumen := format('Pendientes: %s de prioridad alta, %s vencidos', n, m);
    detalle := '📋 *Pendientes*' || E'\n\n*Prioridad alta*\n' ||
      coalesce((select string_agg(format('• %s · %s → %s', coalesce(property_code, '—'), left(description, 60), mgm_wa_link('pendiente&id=' || id)), E'\n' order by date nulls last)
        from (select * from tasks where status <> 'terminado' and priority = 'alta' order by date nulls last limit 8) z), 'Ninguno') ||
      E'\n\n*Vencidos*\n' || coalesce((select string_agg(format('• %s · %s · %s → %s', coalesce(property_code, '—'), left(description, 50), mgm_wa_fmt(date), mgm_wa_link('pendiente&id=' || id)), E'\n' order by date)
        from (select * from tasks where status <> 'terminado' and date < p_hoy and coalesce(priority,'') <> 'alta' order by date limit 8) z), 'Ninguno') ||
      E'\n\nVer todos: ' || mgm_wa_link('pendientes');
    return next; return;

  elsif p_item = 'semana' then
    ini := p_hoy - 6;
    with d as (select count(*) depas from properties where active is not false and coalesce(kind,'depa') <> 'cajon'),
    r as (select * from reservations where status = 'activa' and property_code in (select code from properties where active is not false and coalesce(kind,'depa') <> 'cajon'))
    select round(100.0 * (select sum(greatest(0, least(checkout, p_hoy + 1) - greatest(checkin, ini))) from r) / nullif((select depas from d) * 7, 0)),
           round(100.0 * (select sum(greatest(0, least(checkout, p_hoy + 8) - greatest(checkin, p_hoy + 1))) from r) / nullif((select depas from d) * 7, 0))
      into n, m;
    resumen := format('Semana de negocio: ocupación %s%% (próxima %s%%), ingresos %s', coalesce(n, 0), coalesce(m, 0),
      mgm_wa_money((select sum(amount) from transactions where kind = 'ingreso' and date between ini and p_hoy)));
    detalle := '📊 *Semana de negocio · ' || mgm_wa_fmt(ini) || ' al ' || mgm_wa_fmt(p_hoy) || '*' || E'\n\n' ||
      format('• Ocupación: %s%% · próxima semana %s%% (ya reservado)', coalesce(n, 0), coalesce(m, 0)) || E'\n' ||
      format('• Ingresos registrados: %s', mgm_wa_money((select sum(amount) from transactions where kind = 'ingreso' and date between ini and p_hoy))) || E'\n' ||
      format('• Reservas nuevas de Airbnb: %s · cancelaciones: %s', (select count(*) from sync_log where action = 'alta' and at >= ini), (select count(*) from sync_log where action = 'baja' and at >= ini)) ||
      E'\n\n*Noches libres en 14 días*\n' || coalesce((select string_agg(format('• %s: %s noches', code, libres), E'\n' order by libres desc) from (select * from (
        select p.code, 14 - coalesce((select sum(greatest(0, least(r.checkout, p_hoy + 15) - greatest(r.checkin, p_hoy + 1))) from reservations r where r.status='activa' and r.property_code = p.code), 0) libres
        from properties p where p.active is not false and coalesce(p.kind,'depa') <> 'cajon') z0 where libres >= 3 order by libres desc limit 10) z), 'Todo lleno ✨') ||
      E'\n\nCalendario: ' || mgm_wa_link('calendario&d=' || (p_hoy + 1)) || E'\nGestión de Ocupación: ' || mgm_wa_link('ocupacion');
    return next; return;
  end if;
end $$;

-- Cada 5 min (n8n): genera lo que toca y regresa lo pendiente de enviar.
create or replace function mgm_wa_tick() returns table(id bigint, item text, resumen text, detalle text)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  cfg jsonb; auto jsonb; ahora timestamp; hoy date; hm text; it record; c record; silencio boolean; desde timestamptz; nins int;
begin
  select value into cfg from settings where key = 'whatsapp';
  select value into auto from settings where key = 'automatizaciones';
  if cfg is null or coalesce((cfg->>'on')::boolean, false) = false or coalesce((auto->>'on')::boolean, true) = false then return; end if;
  ahora := now() at time zone 'America/Mexico_City'; hoy := ahora::date; hm := to_char(ahora, 'HH24:MI');
  silencio := case when coalesce(cfg->'silencio'->>0, '23:00') > coalesce(cfg->'silencio'->>1, '07:00')
                   then hm >= coalesce(cfg->'silencio'->>0, '23:00') or hm < coalesce(cfg->'silencio'->>1, '07:00')
                   else hm >= coalesce(cfg->'silencio'->>0, '23:00') and hm < coalesce(cfg->'silencio'->>1, '07:00') end;
  desde := greatest(coalesce((cfg->>'at')::timestamptz, now()), now() - interval '6 hours');

  -- Programados: dentro de los 20 min después de su hora, en sus días; uno por día y hora.
  for it in select key k, value v from jsonb_each(coalesce(cfg->'items', '{}'::jsonb)) loop
    continue when coalesce((it.v->>'on')::boolean, false) = false or it.k in ('airbnb', 'reasignar');
    for c in select h from jsonb_array_elements_text(coalesce(it.v->'horas', jsonb_build_array(coalesce(it.v->>'hora', '08:00')))) h loop
      continue when not (hm >= c.h and hm < to_char((c.h::time + interval '20 minutes'), 'HH24:MI'));
      continue when not (coalesce(it.v->'dias', '[0,1,2,3,4,5,6]'::jsonb) @> to_jsonb(extract(dow from hoy)::int)
                         or (it.k = 'servicios' and extract(day from hoy)::int = coalesce((it.v->>'dia_mes')::int, 0)));
      continue when exists(select 1 from wa_avisos w where w.item = it.k and w.ref = hoy || ' ' || c.h);
      insert into wa_avisos(item, ref, resumen, detalle, estado)
        select it.k, hoy || ' ' || c.h, x.resumen, x.detalle, 'pendiente' from mgm_wa_contenido(it.k, it.v, hoy) x where x.resumen is not null
        on conflict do nothing;
      get diagnostics nins = row_count;
      if nins = 0 then insert into wa_avisos(item, ref, resumen, detalle, estado) values (it.k, hoy || ' ' || c.h, '—', 'Sin novedades', 'omitido') on conflict do nothing; end if;
    end loop;
  end loop;

  -- Al momento: movimientos de Airbnb desde que se prendió (o las últimas 6 h).
  if coalesce((cfg->'items'->'reasignar'->>'on')::boolean, false) then
    insert into wa_avisos(item, ref, resumen, detalle)
    select 'reasignar', l.id::text,
      format('Limpieza afectada en %s: %s', l.property_code, left(l.detail, 160)),
      '⚠️ *Cambio que mueve una limpieza*' || E'\n\n' || l.property_code || ' · ' || l.detail || E'\n' ||
      'Estaba asignada a *' || coalesce(cl.name, r.cleaner_key) || '* (salida ' || mgm_wa_fmt(r.checkout) || ').' || E'\n\n' ||
      'Reasignar: ' || mgm_wa_link('asignar&res=' || r.id) || E'\nVer reserva: ' || mgm_wa_link('reserva&res=' || r.id) ||
      E'\n\nMensaje para la chica:\n' || 'Hola ' || coalesce(cl.name, '') || ', hubo un cambio en ' || l.property_code ||
        case when l.action = 'baja' then ': se canceló la reserva, ya no hay limpieza el ' || mgm_wa_fmt(r.checkout) || '.' else ': la salida ahora es el ' || mgm_wa_fmt(r.checkout) || '. Te confirmo tu limpieza.' end
    from sync_log l join reservations r on r.id = l.reservation_id left join cleaners cl on cl.key = r.cleaner_key
    where l.at > desde and l.action in ('cambio', 'baja') and r.cleaner_key is not null and r.cleaner_key <> 'NA'
    on conflict do nothing;
  end if;
  if coalesce((cfg->'items'->'airbnb'->>'on')::boolean, false) then
    insert into wa_avisos(item, ref, resumen, detalle)
    select 'airbnb', l.id::text,
      format('Airbnb %s · %s: %s', case l.action when 'alta' then 'nueva' when 'baja' then 'cancelación' else 'cambio' end, l.property_code, left(l.detail, 160)),
      '🔄 *Airbnb · ' || case l.action when 'alta' then 'Reserva nueva' when 'baja' then 'Cancelación' else 'Cambio de fechas' end || '*' || E'\n\n' ||
      l.property_code || ' · ' || l.detail ||
      case when l.reservation_id is not null then E'\n\nAbrir reserva: ' || mgm_wa_link('reserva&res=' || l.reservation_id) else '' end ||
      case when l.action = 'alta' and r.cleaner_key is null and coalesce(p.cleaning, true) then E'\nAsignar chica: ' || mgm_wa_link('asignar&res=' || l.reservation_id) else '' end ||
      E'\nMarcar visto: ' || mgm_wa_link('visto&log=' || l.id)
    from sync_log l left join reservations r on r.id = l.reservation_id left join properties p on p.code = l.property_code
    where l.at > desde and l.action in ('alta', 'cambio', 'baja')
      and not exists(select 1 from wa_avisos w where w.item = 'reasignar' and w.ref = l.id::text)
    on conflict do nothing;
  end if;

  -- Lo de "al momento" espera a que termine el silencio; lo programado sale a su hora.
  update wa_avisos w set estado = 'omitido', error = 'vencido' where w.estado = 'pendiente' and w.created_at <= now() - interval '1 day';
  return query select w.id, w.item, w.resumen, w.detalle from wa_avisos w
    where w.estado = 'pendiente' and (not silencio or w.item not in ('airbnb', 'reasignar'))
    order by w.id;
end $$;

create or replace function mgm_wa_marcar(p_id bigint, p_ok boolean, p_error text default null) returns void
language sql security definer set search_path = public as
$$ update wa_avisos set estado = case when p_ok then 'enviado' else 'error' end, enviado_at = case when p_ok then now() end, error = p_error where id = p_id $$;

-- Lo que Claudio manda cuando María responde "ver": los avisos enviados en las últimas 24 h que aún no ha visto.
create or replace function mgm_wa_ver() returns text language plpgsql volatile security definer set search_path = public as $$
declare t text;
begin
  select string_agg(z.detalle, E'\n\n────────\n\n' order by z.id) into t from (
    select w.id, w.detalle from wa_avisos w where w.estado = 'enviado' and not w.visto and w.enviado_at > now() - interval '24 hours' order by w.id desc limit 3) z;
  update wa_avisos set visto = true where estado = 'enviado' and not visto and enviado_at > now() - interval '24 hours';
  return coalesce(t, 'No tengo avisos nuevos. Escríbeme lo que necesites saber de la app.');
end $$;

revoke all on function mgm_wa_contenido(text, jsonb, date), mgm_wa_tick(), mgm_wa_marcar(bigint, boolean, text), mgm_wa_ver() from public, anon, authenticated;
select 'ok';
