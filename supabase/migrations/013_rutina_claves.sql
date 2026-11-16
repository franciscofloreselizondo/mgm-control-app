-- Rutina: cada 3 meses (16 feb/may/ago/nov, 9:00 GDL) un pendiente por depa con clave 1 activa,
-- para María, prioridad baja. No duplica si ya hay uno abierto para ese depa.
create or replace function crear_pendientes_claves() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into tasks(property_code, description, responsible, date, status, priority)
  select a.place, 'Cambiar clave 1 (rutina trimestral)', 'María', (now() at time zone 'America/Mexico_City')::date, 'en_proceso', 'baja'
  from access_codes a join properties p on p.code = a.place
  where coalesce(trim(a.code1), '') <> '' and p.active is not false
    and not exists (select 1 from tasks t where t.property_code = a.place and t.description = 'Cambiar clave 1 (rutina trimestral)' and t.status <> 'terminado');
  get diagnostics n = row_count; return n;
end $$;
select cron.unschedule('mgm-claves-trimestral') where exists (select 1 from cron.job where jobname = 'mgm-claves-trimestral');
select cron.schedule('mgm-claves-trimestral', '0 15 16 2,5,8,11 *', 'select crear_pendientes_claves()');
