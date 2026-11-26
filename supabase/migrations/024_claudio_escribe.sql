-- Claudio (WhatsApp) puede registrar gastos, ingresos y pendientes, y anotar pedidos que aún no sabe hacer.
-- Solo por estas funciones (consulta fija en n8n, parámetros ligados); el agente sigue sin SQL de escritura libre.
create table if not exists claudio_pedidos (
  id bigserial primary key, at timestamptz not null default now(), quien text not null, pedido text not null,
  contexto text, estado text not null default 'nuevo' check (estado in ('nuevo','en_proceso','hecho','descartado')), nota text);
alter table claudio_pedidos enable row level security;
drop policy if exists claudio_pedidos_super on claudio_pedidos;
create policy claudio_pedidos_super on claudio_pedidos for select to authenticated using (my_role() = 'superadmin');

create or replace function claudio_depa(p text) returns text language sql stable set search_path = public as $$
  select code from properties
  where regexp_replace(lower(code), '[^a-z0-9]', '', 'g') = regexp_replace(lower(coalesce(p,'')), '[^a-z0-9]', '', 'g') limit 1 $$;

create or replace function claudio_registrar(p_tipo text, p_depa text, p_categoria text, p_monto numeric, p_fecha date, p_descripcion text, p_quien text)
returns text language plpgsql set search_path = public as $$
declare v_kind text := lower(trim(coalesce(p_tipo,'gasto'))); v_depa text := claudio_depa(p_depa); v_cat text; v_otro text;
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Mexico_City')::date);
  v_cats text[]; v_desc text;
begin
  if v_kind not in ('gasto','ingreso') then return 'ERROR: tipo debe ser gasto o ingreso.'; end if;
  if v_depa is null then return 'ERROR: no existe el depa "' || coalesce(p_depa,'') || '". Depas: ' || (select string_agg(code, ', ' order by sort, code) from properties where active); end if;
  if p_monto is null or p_monto <= 0 then return 'ERROR: falta el monto (mayor a 0).'; end if;
  if v_fecha > (now() at time zone 'America/Mexico_City')::date + 31 or v_fecha < date '2024-01-01' then return 'ERROR: fecha fuera de rango: ' || v_fecha; end if;
  v_cats := case when v_kind = 'gasto' then array['Gasto por inversión','Limpieza','Lavandería','Productos de limpieza','Mantenimiento del edificio','Fumigación','Reparaciones menores','Pintura','Limpieza de muebles','Mantenimiento AC','Gas','Luz','Internet','Agua','Predial','Otro']
                 else array['Ingreso por reserva','Otros ingresos'] end;
  select c into v_cat from unnest(v_cats) c where lower(c) = lower(trim(coalesce(p_categoria,''))) limit 1;
  if v_cat is null then v_cat := case when v_kind = 'gasto' then 'Otro' else 'Otros ingresos' end; v_otro := nullif(trim(coalesce(p_categoria,'')), ''); end if;
  if v_cat in ('Otro','Otros ingresos') and v_otro is null then v_otro := coalesce(nullif(trim(p_descripcion),''), 'Sin detalle'); end if;
  v_desc := trim(coalesce(nullif(trim(p_descripcion),'') || ' · ', '') || 'vía Claudio (' || coalesce(nullif(trim(p_quien),''),'WhatsApp') || ')');
  if exists (select 1 from transactions where kind = v_kind and property_code = v_depa and category = v_cat and amount = p_monto and date = v_fecha and description = v_desc) then
    return 'YA EXISTE: ese mismo ' || v_kind || ' ya estaba registrado (' || v_depa || ', ' || v_cat || ', $' || to_char(p_monto,'FM999,999,990.00') || ', ' || v_fecha || '). No se duplicó.'; end if;
  insert into transactions (kind, date, property_code, category, category_other, description, amount)
  values (v_kind, v_fecha, v_depa, v_cat, v_otro, v_desc, p_monto);
  return 'OK: ' || v_kind || ' registrado · ' || v_depa || ' · ' || v_cat || coalesce(': ' || v_otro, '') || ' · $' || to_char(p_monto,'FM999,999,990.00') || ' · ' || to_char(v_fecha,'DD/MM/YYYY') || '. Ya se ve en la app (Finanzas); ahí se le puede agregar foto.';
end $$;

create or replace function claudio_pendiente(p_depa text, p_descripcion text, p_fecha date, p_prioridad text, p_responsable text, p_quien text)
returns text language plpgsql set search_path = public as $$
declare v_depa text := claudio_depa(p_depa); v_pri text := lower(trim(coalesce(p_prioridad,'media')));
begin
  if nullif(trim(coalesce(p_descripcion,'')),'') is null then return 'ERROR: falta la descripción del pendiente.'; end if;
  if nullif(trim(coalesce(p_depa,'')),'') is not null and v_depa is null then return 'ERROR: no existe el depa "' || p_depa || '". Depas: ' || (select string_agg(code, ', ' order by sort, code) from properties where active); end if;
  if v_pri not in ('alta','media','baja') then v_pri := 'media'; end if;
  if exists (select 1 from tasks where description = trim(p_descripcion) and property_code is not distinct from v_depa and status <> 'terminado') then return 'YA EXISTE: ese pendiente ya estaba abierto. No se duplicó.'; end if;
  insert into tasks (property_code, description, responsible, date, status, priority, progress)
  values (v_depa, trim(p_descripcion), nullif(trim(coalesce(p_responsable,'')),''), p_fecha, 'en_proceso', v_pri, 'Creado vía Claudio (' || coalesce(nullif(trim(p_quien),''),'WhatsApp') || ')');
  return 'OK: pendiente creado' || coalesce(' · ' || v_depa, '') || ' · ' || trim(p_descripcion) || coalesce(' · para el ' || to_char(p_fecha,'DD/MM/YYYY'), '') || ' · prioridad ' || v_pri || '.';
end $$;

create or replace function claudio_pedido(p_quien text, p_pedido text, p_contexto text)
returns text language plpgsql set search_path = public as $$
declare v_id bigint;
begin
  if nullif(trim(coalesce(p_pedido,'')),'') is null then return 'ERROR: falta el pedido.'; end if;
  insert into claudio_pedidos (quien, pedido, contexto) values (coalesce(nullif(trim(p_quien),''),'WhatsApp'), trim(p_pedido), nullif(trim(coalesce(p_contexto,'')),'')) returning id into v_id;
  return 'OK: pedido #' || v_id || ' anotado para Paco.';
end $$;

revoke all on function claudio_registrar(text,text,text,numeric,date,text,text), claudio_pendiente(text,text,date,text,text,text), claudio_pedido(text,text,text), claudio_depa(text) from public, anon, authenticated;
do $$ begin if exists (select 1 from pg_roles where rolname = 'claudio_lector') then grant select on claudio_pedidos to claudio_lector; end if; end $$;
