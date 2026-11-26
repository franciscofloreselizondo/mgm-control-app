-- Una sola regla de cálculo para la app (Estadísticas), Paco App Store y Claudio. Periodo [p_desde, p_hasta).
-- Noche ocupada = depa activo con reserva no cancelada o bloqueo 'externa' (reserva por fuera de Airbnb) esa noche.
-- Noche disponible = depa activo sin bloqueo de 'mantenimiento' esa noche. Ocupación = ocupadas / disponibles.
-- web/app.js (stCalc) aplica esta misma regla: si cambias una, cambia la otra.
create or replace function mgm_stats(p_desde date, p_hasta date)
returns table (depas int, noches_disponibles int, noches_ocupadas int, noches_por_fuera int, ocupacion_pct numeric,
  reservas int, reservas_con_monto int, ingresos numeric, gastos numeric, gastos_n int, gastos_sin_foto int)
language sql stable set search_path = public as $$
  with dp as (select code from properties where active is not false and kind = 'depa'),
  dias as (select dp.code, g::date dia from dp, generate_series(p_desde, p_hasta - 1, interval '1 day') g),
  x as (select d.code, d.dia,
      exists (select 1 from blocks b where b.property_code = d.code and b.kind = 'mantenimiento' and b.date_from <= d.dia and d.dia <= b.date_to) mant,
      exists (select 1 from reservations r where r.property_code = d.code and r.status <> 'cancelada' and r.checkin <= d.dia and d.dia < r.checkout) res,
      exists (select 1 from blocks b where b.property_code = d.code and b.kind = 'externa' and b.date_from <= d.dia and d.dia <= b.date_to) ext
    from dias d),
  o as (select count(*) filter (where not mant)::int disp, count(*) filter (where not mant and (res or ext))::int ocu, count(*) filter (where not mant and ext and not res)::int fuera from x),
  r as (select count(*)::int n, count(*) filter (where amount > 0)::int con from reservations r join dp on dp.code = r.property_code where r.status <> 'cancelada' and r.checkin >= p_desde and r.checkin < p_hasta),
  t as (select coalesce(sum(amount) filter (where kind = 'ingreso'), 0) ing, coalesce(sum(amount) filter (where kind = 'gasto'), 0) gas, count(*) filter (where kind = 'gasto')::int gn,
      count(*) filter (where kind = 'gasto' and (photos is null or jsonb_array_length(photos) = 0))::int sf from transactions where date >= p_desde and date < p_hasta)
  select (select count(*)::int from dp), o.disp, o.ocu, o.fuera, case when o.disp > 0 then round(100.0 * o.ocu / o.disp, 1) else 0 end, r.n, r.con, t.ing, t.gas, t.gn, t.sf from o, r, t $$;
revoke all on function mgm_stats(date, date) from public, anon, authenticated;
do $$ begin if exists (select 1 from pg_roles where rolname = 'claudio_lector') then grant execute on function mgm_stats(date, date) to claudio_lector; end if; end $$;
