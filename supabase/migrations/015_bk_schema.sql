-- Respaldo restaurable: genera en vivo el DDL de la base (esquema public, RLS, funciones, triggers, cron, storage, realtime).
-- Solo lo puede ejecutar service_role (la función de respaldo); ni anon ni usuarios logueados.
create or replace function bk_schema() returns text language plpgsql security definer set search_path = public, pg_catalog as $$
declare out text := ''; r record; cols text; 
begin
  out := out || '-- MGM Control App · esquema generado ' || to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM-DD HH24:MI') || E' (America/Mexico_City)\n';
  out := out || E'-- Orden: extensiones, tablas, llaves, índices, funciones, triggers, RLS/policies, storage, realtime, cron.\n\n';
  out := out || E'create extension if not exists pgcrypto;\ncreate extension if not exists pg_cron;\ncreate extension if not exists pg_net;\n\n';
  -- tablas
  for r in select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by c.relname loop
    select string_agg(format('  %I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
             case when a.attnotnull then ' not null' else '' end,
             case when d.adbin is not null then ' default ' || pg_get_expr(d.adbin, d.adrelid) else '' end), E',\n' order by a.attnum)
      into cols from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped;
    out := out || format(E'create table if not exists public.%I (\n%s\n);\n', r.relname, cols);
  end loop;
  out := out || E'\n-- llaves y restricciones\n';
  for r in select conrelid::regclass::text t, conname, pg_get_constraintdef(oid) def, contype from pg_constraint
           where connamespace = 'public'::regnamespace and contype in ('p','u','c') order by 1, contype loop
    out := out || format(E'alter table %s add constraint %I %s;\n', r.t, r.conname, r.def);
  end loop;
  for r in select conrelid::regclass::text t, conname, pg_get_constraintdef(oid) def from pg_constraint
           where connamespace = 'public'::regnamespace and contype = 'f' order by 1 loop
    out := out || format(E'alter table %s add constraint %I %s;\n', r.t, r.conname, r.def);
  end loop;
  out := out || E'\n-- índices\n';
  for r in select indexdef from pg_indexes i where schemaname = 'public'
           and not exists (select 1 from pg_constraint c where c.conname = i.indexname) order by tablename, indexname loop
    out := out || r.indexdef || E';\n';
  end loop;
  out := out || E'\n-- funciones\n';
  for r in select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind in ('f','p') order by p.proname loop
    out := out || pg_get_functiondef(r.oid) || E';\n\n';
  end loop;
  out := out || E'-- triggers\n';
  for r in select pg_get_triggerdef(t.oid) def from pg_trigger t join pg_class c on c.oid = t.tgrelid
           where c.relnamespace = 'public'::regnamespace and not t.tgisinternal loop
    out := out || r.def || E';\n';
  end loop;
  out := out || E'\n-- seguridad por filas (RLS) y policies\n';
  for r in select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relrowsecurity order by 1 loop
    out := out || format(E'alter table public.%I enable row level security;\n', r.relname);
  end loop;
  for r in select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies where schemaname in ('public','storage') order by 1, 2, 3 loop
    out := out || format(E'create policy %I on %I.%I as %s for %s to %s%s%s;\n', r.policyname, r.schemaname, r.tablename, r.permissive, r.cmd,
      array_to_string(r.roles, ', '), case when r.qual is not null then ' using (' || r.qual || ')' else '' end,
      case when r.with_check is not null then ' with check (' || r.with_check || ')' else '' end);
  end loop;
  out := out || E'\n-- permisos de ejecución de funciones\n';
  for r in select p.proname, pg_get_function_identity_arguments(p.oid) args, p.proacl from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proacl is not null loop
    out := out || format(E'-- %s(%s): %s\n', r.proname, r.args, r.proacl::text);
  end loop;
  out := out || E'\n-- storage\n';
  for r in select id, name, public from storage.buckets loop
    out := out || format(E'insert into storage.buckets (id, name, public) values (%L, %L, %s) on conflict do nothing;\n', r.id, r.name, r.public);
  end loop;
  out := out || E'\n-- realtime\n';
  for r in select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' order by 1 loop
    out := out || format(E'alter publication supabase_realtime add table public.%I;\n', r.tablename);
  end loop;
  out := out || E'\n-- tareas programadas (pg_cron)\n';
  for r in select jobname, schedule, command from cron.job order by jobname loop
    out := out || format(E'select cron.schedule(%L, %L, %L);\n', r.jobname, r.schedule, r.command);
  end loop;
  return out;
end $$;
revoke all on function bk_schema() from public, anon, authenticated;
grant execute on function bk_schema() to service_role;
update settings set value = 'true'::jsonb where key = 'backup_claves';
insert into settings(key, value) select 'backup_claves', 'true'::jsonb where not exists (select 1 from settings where key = 'backup_claves');
select length(bk_schema()) as bytes;
