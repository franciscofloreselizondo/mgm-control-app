-- Claudio: fotos de tickets (WhatsApp → bucket comprobantes), pago de servicios y asignar limpieza.
-- Marca "via" para que la app muestre de forma sutil lo que registró Claudio.
alter table transactions add column if not exists via text;
alter table tasks add column if not exists via text;
alter table service_payments add column if not exists via text;
update transactions set via = 'claudio' where via is null and description like '%vía Claudio (%';
update tasks set via = 'claudio' where via is null and progress like 'Creado vía Claudio (%';

-- Boleto de un solo uso para subir una foto por la función claudio-foto (sin llaves guardadas en n8n).
create table if not exists claudio_foto_tickets (token text primary key, at timestamptz not null default now());
alter table claudio_foto_tickets enable row level security;
create or replace function claudio_foto_ticket() returns text language plpgsql set search_path = public as $$
declare t text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin delete from claudio_foto_tickets where at < now() - interval '1 hour'; insert into claudio_foto_tickets(token) values (t); return t; end $$;
create or replace function claudio_foto_usar(p_token text) returns boolean language plpgsql security definer set search_path = public as $$
declare n int; begin delete from claudio_foto_tickets where token = p_token and at > now() - interval '5 minutes'; get diagnostics n = row_count; return n > 0; end $$;

create or replace function claudio_foto_ok(p text) returns boolean language sql stable security definer set search_path = public, storage as $$
  select nullif(trim(coalesce(p,'')),'') is not null and exists (select 1 from storage.objects where bucket_id = 'comprobantes' and name = trim(p)) $$;

drop function if exists claudio_registrar(text,text,text,numeric,date,text,text);
create or replace function claudio_registrar(p_tipo text, p_depa text, p_categoria text, p_monto numeric, p_fecha date, p_descripcion text, p_quien text, p_foto text default '')
returns text language plpgsql set search_path = public as $$
declare v_kind text := lower(trim(coalesce(p_tipo,'gasto'))); v_depa text := claudio_depa(p_depa); v_cat text; v_otro text;
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Mexico_City')::date);
  v_cats text[]; v_desc text; v_id uuid; v_fotos jsonb := '[]'::jsonb; v_nota text := '';
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
  if nullif(trim(coalesce(p_foto,'')),'') is not null then
    if claudio_foto_ok(p_foto) then v_fotos := jsonb_build_array(trim(p_foto)); v_nota := ' Con foto del ticket.';
    else v_nota := ' OJO: la foto no se encontró y no se adjuntó.'; end if;
  end if;
  insert into transactions (kind, date, property_code, category, category_other, description, amount, photos, via)
  values (v_kind, v_fecha, v_depa, v_cat, v_otro, v_desc, p_monto, v_fotos, 'claudio') returning id into v_id;
  return 'OK: ' || v_kind || ' registrado · ' || v_depa || ' · ' || v_cat || coalesce(': ' || v_otro, '') || ' · $' || to_char(p_monto,'FM999,999,990.00') || ' · ' || to_char(v_fecha,'DD/MM/YYYY') || '.' || v_nota || ' (id ' || v_id || ')';
end $$;

create or replace function claudio_adjuntar_foto(p_foto text, p_movimiento text)
returns text language plpgsql set search_path = public as $$
declare v_id uuid; v_row transactions;
begin
  if not claudio_foto_ok(p_foto) then return 'ERROR: no encuentro esa foto (' || coalesce(p_foto,'') || ').'; end if;
  begin v_id := trim(p_movimiento)::uuid; exception when others then return 'ERROR: id de movimiento inválido; búscalo con consultar_mgm en transactions.'; end;
  update transactions set photos = case when photos @> jsonb_build_array(trim(p_foto)) then photos else photos || jsonb_build_array(trim(p_foto)) end where id = v_id returning * into v_row;
  if v_row.id is null then return 'ERROR: no existe ese movimiento.'; end if;
  return 'OK: foto adjunta a ' || v_row.kind || ' · ' || v_row.property_code || ' · ' || v_row.category || ' · $' || to_char(v_row.amount,'FM999,999,990.00') || ' · ' || to_char(v_row.date,'DD/MM/YYYY') || '.';
end $$;

create or replace function claudio_asignar_limpieza(p_depa text, p_salida date, p_persona text, p_quien text)
returns text language plpgsql set search_path = public as $$
declare v_depa text := claudio_depa(p_depa); v_key text; v_name text; r reservations; n int;
begin
  if v_depa is null then return 'ERROR: no existe el depa "' || coalesce(p_depa,'') || '".'; end if;
  select key, name into v_key, v_name from cleaners where active and (lower(key) = lower(trim(p_persona)) or lower(name) = lower(trim(p_persona))) limit 1;
  if v_key is null then select key, name into v_key, v_name from cleaners where active and lower(name) like lower(trim(p_persona)) || '%' limit 1; end if;
  if v_key is null then return 'ERROR: no encuentro a "' || coalesce(p_persona,'') || '". Personal activo: ' || (select string_agg(name, ', ' order by name) from cleaners where active); end if;
  if p_salida is null then
    select count(*) into n from reservations where property_code = v_depa and status = 'activa' and checkout >= (now() at time zone 'America/Mexico_City')::date and checkout <= (now() at time zone 'America/Mexico_City')::date + 14;
    if n <> 1 then return 'ERROR: indica la fecha de salida. Salidas próximas en ' || v_depa || ': ' || coalesce((select string_agg(to_char(checkout,'DD/MM') || ' ' || guest, ', ' order by checkout) from reservations where property_code = v_depa and status = 'activa' and checkout >= (now() at time zone 'America/Mexico_City')::date and checkout <= (now() at time zone 'America/Mexico_City')::date + 30), 'ninguna'); end if;
    select * into r from reservations where property_code = v_depa and status = 'activa' and checkout >= (now() at time zone 'America/Mexico_City')::date order by checkout limit 1;
  else
    select * into r from reservations where property_code = v_depa and status = 'activa' and checkout = p_salida limit 1;
    if r.id is null then return 'ERROR: no hay salida en ' || v_depa || ' el ' || to_char(p_salida,'DD/MM/YYYY') || '. Salidas próximas: ' || coalesce((select string_agg(to_char(checkout,'DD/MM') || ' ' || guest, ', ' order by checkout) from reservations where property_code = v_depa and status = 'activa' and checkout >= (now() at time zone 'America/Mexico_City')::date and checkout <= (now() at time zone 'America/Mexico_City')::date + 30), 'ninguna'); end if;
  end if;
  if exists (select 1 from days_off where date = r.checkout and cleaner_key = v_key) then return 'ERROR: ' || v_name || ' descansa el ' || to_char(r.checkout,'DD/MM') || '. Elige a otra persona o quítale el descanso en la app.'; end if;
  update reservations set cleaner_key = v_key where id = r.id;
  return 'OK: limpieza de ' || v_depa || ' del ' || to_char(r.checkout,'DD/MM/YYYY') || ' (salida de ' || r.guest || ') asignada a ' || v_name || coalesce('. Antes: ' || (select name from cleaners where key = r.cleaner_key), '') || '.';
end $$;

create or replace function claudio_pagar_servicio(p_servicio text, p_cuenta text, p_periodo text, p_monto numeric, p_fecha date, p_quien text, p_foto text default '')
returns text language plpgsql set search_path = public as $$
declare v_srv text := lower(trim(coalesce(p_servicio,''))); v_norm text := regexp_replace(lower(coalesce(p_cuenta,'')), '[^a-z0-9]', '', 'g');
  v_per text := coalesce(nullif(trim(p_periodo),''), to_char(now() at time zone 'America/Mexico_City','YYYY-MM'));
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Mexico_City')::date);
  a service_accounts; n int; v_pid text := gen_random_uuid()::text; v_cat text; d record; v_tx uuid; v_fotos text[] := '{}'; v_nota text := ''; v_desc text; v_amt numeric; v_n int := 0;
begin
  v_srv := case when v_srv like 'mant%' then 'mantenimiento' when v_srv in ('cfe','electricidad') then 'luz' when v_srv in ('wifi','telmex','izzi','totalplay') then 'internet' else v_srv end;
  if v_srv not in ('luz','agua','gas','internet','mantenimiento') then return 'ERROR: servicio debe ser luz, agua, gas, internet o mantenimiento.'; end if;
  if v_per !~ '^\d{4}-\d{2}$' then return 'ERROR: periodo debe ser YYYY-MM.'; end if;
  if p_monto is null or p_monto <= 0 then return 'ERROR: falta el monto pagado.'; end if;
  select count(*) into n from service_accounts s where active and service = v_srv and (regexp_replace(lower(label), '[^a-z0-9]', '', 'g') = v_norm or regexp_replace(lower(coalesce(property_code,'')), '[^a-z0-9]', '', 'g') = v_norm
    or exists (select 1 from jsonb_array_elements(coalesce(split,'[]'::jsonb)) e where regexp_replace(lower(e->>'code'), '[^a-z0-9]', '', 'g') = v_norm));
  if n <> 1 then return 'ERROR: ' || case when n = 0 then 'no encuentro' else 'hay varias cuentas para' end || ' "' || coalesce(p_cuenta,'') || '" en ' || v_srv || '. Cuentas de ' || v_srv || ': ' || (select string_agg(label, ', ' order by sort, label) from service_accounts where active and service = v_srv); end if;
  select * into a from service_accounts s where active and service = v_srv and (regexp_replace(lower(label), '[^a-z0-9]', '', 'g') = v_norm or regexp_replace(lower(coalesce(property_code,'')), '[^a-z0-9]', '', 'g') = v_norm
    or exists (select 1 from jsonb_array_elements(coalesce(split,'[]'::jsonb)) e where regexp_replace(lower(e->>'code'), '[^a-z0-9]', '', 'g') = v_norm));
  if exists (select 1 from service_payments where account_id = a.id and period = v_per) then
    return 'YA EXISTE: ' || v_srv || ' de ' || a.label || ' ya tiene registro en ' || v_per || ' (' || (select status || coalesce(' $' || to_char(amount,'FM999,999,990.00'),'') from service_payments where account_id = a.id and period = v_per) || '). Para cambiarlo, edítalo en la app en Servicios.'; end if;
  if nullif(trim(coalesce(p_foto,'')),'') is not null then
    if claudio_foto_ok(p_foto) then v_fotos := array[trim(p_foto)]; v_nota := ' Con foto del recibo.'; else v_nota := ' OJO: la foto no se encontró y no se adjuntó.'; end if;
  end if;
  insert into service_payments (id, account_id, period, status, amount, paid_on, note, photos, created_by, via)
  values (v_pid, a.id, v_per, 'pagado', p_monto, v_fecha, 'vía Claudio (' || coalesce(nullif(trim(p_quien),''),'WhatsApp') || ')', v_fotos, 'claudio', 'claudio');
  if a.to_pnl then
    v_cat := case v_srv when 'luz' then 'Luz' when 'agua' then 'Agua' when 'gas' then 'Gas' when 'internet' then 'Internet' else 'Mantenimiento del edificio' end;
    for d in select e->>'code' as code, (e->>'pct')::numeric as pct from jsonb_array_elements(case when jsonb_typeof(a.split) = 'array' and jsonb_array_length(a.split) > 0 then a.split when a.property_code is not null then jsonb_build_array(jsonb_build_object('code', a.property_code, 'pct', 100)) else '[]'::jsonb end) e loop
      v_tx := null;
      v_desc := 'Pago de servicio · ' || a.label || case when d.pct < 100 then ' (' || d.pct || '%)' else '' end; v_amt := round(p_monto * d.pct) / 100;
      select id into v_tx from transactions where service_payment_id is null and kind = 'gasto' and property_code = d.code and category = v_cat and to_char(date,'YYYY-MM') = to_char(v_fecha,'YYYY-MM') limit 1;
      if v_tx is not null then update transactions set date = v_fecha, description = v_desc, amount = v_amt, photos = to_jsonb(v_fotos), service_payment_id = v_pid where id = v_tx;
      else insert into transactions (kind, date, property_code, category, description, amount, photos, service_payment_id, via) values ('gasto', v_fecha, d.code, v_cat, v_desc, v_amt, to_jsonb(v_fotos), v_pid, 'claudio'); end if;
      v_n := v_n + 1;
    end loop;
  end if;
  return 'OK: ' || v_srv || ' de ' || a.label || ' marcado pagado · ' || v_per || ' · $' || to_char(p_monto,'FM999,999,990.00') || ' · ' || to_char(v_fecha,'DD/MM/YYYY') || '.' || case when v_n > 0 then ' Gasto ligado en ' || v_n || ' depa(s).' else ' Esta cuenta no va al P&L, así que no generó gasto.' end || v_nota;
end $$;

revoke all on function claudio_registrar(text,text,text,numeric,date,text,text,text), claudio_adjuntar_foto(text,text), claudio_asignar_limpieza(text,date,text,text),
  claudio_pagar_servicio(text,text,text,numeric,date,text,text), claudio_foto_ticket(), claudio_foto_usar(text), claudio_foto_ok(text) from public, anon, authenticated;
grant execute on function claudio_foto_usar(text) to service_role;
