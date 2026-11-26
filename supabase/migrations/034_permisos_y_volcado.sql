-- 1) Permisos (auditoría, hallazgo M6): la función que crea pendientes de claves solo la corre la tarea trimestral;
--    las tres funciones de apoyo de WhatsApp fijan su ruta de búsqueda.
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'crear_pendientes_claves' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('mgm_wa_link', 'mgm_wa_fmt', 'mgm_wa_money') loop
    execute format('alter function %s set search_path = public, pg_temp', f);
  end loop;
end $$;

-- 2) Volcado completo (hallazgo A1): todas las tablas públicas en un JSON. Lo usa la función respaldo-completo.
--    Las claves de acceso solo entran si settings.backup_claves = true.
create or replace function public.mgm_volcado() returns jsonb language plpgsql stable set search_path = public, pg_temp as $fn$
declare r record; j jsonb; salida jsonb := '{}'::jsonb; con_claves boolean;
begin
  select (value = 'true'::jsonb) into con_claves from settings where key = 'backup_claves';
  for r in select tablename from pg_tables where schemaname = 'public' order by tablename loop
    if r.tablename = 'access_codes' and con_claves is not true then continue; end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', r.tablename) into j;
    salida := salida || jsonb_build_object(r.tablename, j);
  end loop;
  return salida;
end $fn$;
revoke all on function public.mgm_volcado() from public, anon, authenticated;
grant execute on function public.mgm_volcado() to service_role;

-- 3) La batería de auditoría ahora reporta también el respaldo completo.
alter function public.mgm_auditoria() rename to mgm_auditoria_base;
create or replace function public.mgm_auditoria() returns json language sql stable set search_path = public, pg_temp as $fn$
  select (mgm_auditoria_base()::jsonb || jsonb_build_object('respaldo', jsonb_build_object(
    'volcado_ultimo', (select value from settings where key = 'volcado_last'),
    'volcado_horas', (select round(((extract(epoch from now()) * 1000 - (value->>'at')::numeric) / 3600000)::numeric, 1) from settings where key = 'volcado_last'),
    'volcado_destinos', (select jsonb_array_length(value) from settings where key = 'volcado_emails'),
    'excel_horas', (select round(((extract(epoch from now()) * 1000 - (value #>> '{}')::numeric) / 3600000)::numeric, 1) from settings where key = 'backup_last'),
    'excel_destinos', (select jsonb_array_length(value) from settings where key = 'backup_emails'),
    'tablas_publicas', (select count(*) from pg_tables where schemaname = 'public'),
    'claves_en_respaldo', (select value from settings where key = 'backup_claves'))))::json
$fn$;
revoke all on function public.mgm_auditoria() from public, anon, authenticated;

-- 4) Tarea nocturna: 22:10 de Guadalajara, diez minutos después del Excel.
select cron.schedule('mgm-volcado-diario', '10 4 * * *', $c$
  select net.http_post(url := 'https://vmhjcrkskpjwkhvjzvcx.supabase.co/functions/v1/respaldo-completo',
    headers := '{"content-type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 120000);
$c$);
