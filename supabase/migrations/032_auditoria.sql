-- Auditoría de control: toda la batería de base de datos en una sola función de solo lectura.
-- Uso: select mgm_auditoria();  (solo postgres / service_role; la app y los usuarios no pueden llamarla)
create or replace function public.mgm_auditoria() returns json language sql stable set search_path = public, pg_temp as $fn$
with h as (select (now() at time zone 'America/Mexico_City')::date hoy),
ra as (select r.*, (r.checkout - r.checkin) noches from reservations r where r.status = 'activa'),
pares as (select a.id ida, b.id idb, a.property_code, a.noches na, b.noches nb from ra a join ra b
          on a.property_code = b.property_code and a.id < b.id and a.checkin < b.checkout and b.checkin < a.checkout),
pagos as (select s.*, a.label, a.service, a.to_pnl, a.property_code pc, a.split,
            (select coalesce(sum(t.amount), 0) from transactions t where t.service_payment_id = s.id) ligado,
            (select count(*) from transactions t where t.service_payment_id = s.id) n_ligas
          from service_payments s join service_accounts a on a.id = s.account_id)
select json_build_object(
 'corrida', json_build_object('hoy', (select hoy from h), 'utc', now()),
 'operacion', json_build_object(
   'respaldo_ultimo', (select value from settings where key = 'backup_last'),
   'sync_ultimo', (select value from settings where key = 'airbnb_sync_last'),
   'respaldo_destinos', (select value from settings where key = 'backup_emails'),
   'cron', (select json_agg(json_build_object('job', j.jobname, 'activo', j.active, 'horario', j.schedule,
              'corridas_7d', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '7 days'),
              'fallas_7d', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '7 days' and d.status <> 'succeeded'),
              'ultima', (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid))) from cron.job j),
   'http_respuestas_malas', (select count(*) from net._http_response where coalesce(status_code, 0) >= 400 or timed_out or error_msg is not null),
   'http_respuestas', (select count(*) from net._http_response),
   'sync_7d', (select json_object_agg(action, n) from (select action, count(*) n from sync_log where at > now() - interval '7 days' group by 1) x),
   'sync_sin_ver', (select count(*) from sync_log where seen is not true),
   'whatsapp_7d', (select json_object_agg(estado, n) from (select estado, count(*) n from wa_avisos where created_at > now() - interval '7 days' group by 1) x),
   'whatsapp_ultimo_enviado', (select max(enviado_at) from wa_avisos where estado = 'enviado'),
   'pedidos_claudio_abiertos', (select count(*) from claudio_pedidos where coalesce(estado, 'nuevo') not in ('hecho', 'descartado')),
   'pedidos_claudio_estados', (select json_object_agg(coalesce(estado, 'null'), n) from (select estado, count(*) n from claudio_pedidos group by 1) x)),
 'integridad', json_build_object(
   'reservas_sin_depa', (select count(*) from reservations r where not exists (select 1 from properties p where p.code = r.property_code)),
   'reservas_chica_inexistente', (select count(*) from reservations r where r.cleaner_key is not null and upper(r.cleaner_key) not in ('NA', 'N/A', '__NA') and not exists (select 1 from cleaners c where c.key = r.cleaner_key)),
   'movimientos_sin_depa', (select count(*) from transactions t where t.property_code is not null and not exists (select 1 from properties p where p.code = t.property_code)),
   'ingresos_reserva_inexistente', (select count(*) from transactions t where t.reservation_id is not null and not exists (select 1 from reservations r where r.id = t.reservation_id)),
   'gastos_pago_inexistente', (select count(*) from transactions t where t.service_payment_id is not null and not exists (select 1 from service_payments s where s.id = t.service_payment_id)),
   'limpiezas_sin_depa', (select count(*) from cleanings c where not exists (select 1 from properties p where p.code = c.property_code)),
   'motor_listados_sin_depa', (select json_agg(l.code) from pl_listings l where not exists (select 1 from properties p where p.code = l.code)),
   'motor_ideas_sin_depa', (select json_agg(distinct i.code) from pl_ideas i where i.code is not null and not exists (select 1 from properties p where p.code = i.code)),
   'decisiones_sin_idea', (select count(*) from precio_decisiones d where d.idea_id is not null and not exists (select 1 from pl_ideas i where i.id = d.idea_id))),
 'validez', json_build_object(
   'reservas', (select json_build_object('activas', count(*) filter (where status = 'activa'), 'canceladas', count(*) filter (where status = 'cancelada'),
                  'estado_raro', count(*) filter (where status not in ('activa', 'cancelada')), 'fechas_invertidas', count(*) filter (where checkout <= checkin),
                  'manual', count(*) filter (where source = 'manual'), 'airbnb', count(*) filter (where source = 'airbnb')) from reservations),
   'estancias_mas_30', (select json_agg(json_build_object('depa', property_code, 'in', checkin, 'out', checkout, 'noches', noches, 'origen', source, 'monto', amount) order by noches desc) from ra where noches > 30),
   'movimientos', (select json_build_object('gastos', count(*) filter (where kind = 'gasto'), 'ingresos', count(*) filter (where kind = 'ingreso'),
                  'tipo_raro', count(*) filter (where kind not in ('gasto', 'ingreso')), 'monto_cero_o_negativo', count(*) filter (where coalesce(amount, 0) <= 0), 'sin_fecha', count(*) filter (where date is null)) from transactions),
   'pagos_servicio', (select json_build_object('total', count(*), 'pagados', count(*) filter (where status = 'pagado'), 'pagados_sin_monto', count(*) filter (where status = 'pagado' and coalesce(amount, 0) <= 0),
                  'estado_raro', count(*) filter (where status not in ('pagado', 'pendiente', 'na', 'saldo_favor'))) from service_payments),
   'bloqueos', (select count(*) from blocks)),
 'duplicados', json_build_object(
   'traslapes_pares', (select count(*) from pares),
   'traslapes_reales', (select count(*) from pares where na <= 30 and nb <= 30),
   'traslapes_por_estancia_larga', (select count(*) from pares where na > 30 or nb > 30),
   'traslapes_reales_detalle', (select json_agg(x) from (select p.property_code depa, a.checkin a_in, a.checkout a_out, b.checkin b_in, b.checkout b_out from pares p join ra a on a.id = p.ida join ra b on b.id = p.idb where p.na <= 30 and p.nb <= 30 limit 8) x),
   'codigo_airbnb_repetido', (select count(*) from (select airbnb_code from ra where airbnb_code is not null group by 1 having count(*) > 1) x),
   'ingreso_repetido_por_reserva', (select count(*) from (select reservation_id from transactions where reservation_id is not null group by 1 having count(*) > 1) x),
   'pago_repetido_cuenta_mes', (select count(*) from (select account_id, period from service_payments group by 1, 2 having count(*) > 1) x),
   'gasto_repetido_por_pago', (select count(*) from (select service_payment_id, property_code from transactions where service_payment_id is not null group by 1, 2 having count(*) > 1) x)),
 'conciliacion', json_build_object(
   'reservas_con_monto', (select count(*) from ra where coalesce(amount, 0) > 0),
   'reservas_con_monto_suma', (select coalesce(sum(amount), 0) from ra where coalesce(amount, 0) > 0),
   'ingresos_ligados', (select count(*) from transactions t join ra r on r.id = t.reservation_id where t.kind = 'ingreso'),
   'ingresos_ligados_suma', (select coalesce(sum(t.amount), 0) from transactions t join ra r on r.id = t.reservation_id where t.kind = 'ingreso'),
   'reservas_con_monto_sin_ingreso', (select count(*) from ra r where coalesce(r.amount, 0) > 0 and not exists (select 1 from transactions t where t.reservation_id = r.id)),
   'ingreso_distinto_al_monto', (select count(*) from transactions t join ra r on r.id = t.reservation_id where t.amount is distinct from r.amount),
   'ingreso_de_reserva_cancelada_o_sin_monto', (select count(*) from transactions t join reservations r on r.id = t.reservation_id where r.status <> 'activa' or coalesce(r.amount, 0) <= 0),
   'pagos_pnl_pagados', (select count(*) from pagos where status = 'pagado' and coalesce(amount, 0) > 0 and to_pnl),
   'pagos_pnl_sin_gasto', (select count(*) from pagos where status = 'pagado' and coalesce(amount, 0) > 0 and to_pnl and n_ligas = 0),
   'pagos_pnl_sin_gasto_suma', (select coalesce(sum(amount), 0) from pagos where status = 'pagado' and coalesce(amount, 0) > 0 and to_pnl and n_ligas = 0),
   'pagos_pnl_gasto_distinto', (select count(*) from pagos where status = 'pagado' and coalesce(amount, 0) > 0 and to_pnl and n_ligas > 0 and abs(ligado - amount) > 0.02),
   'gasto_ligado_a_pago_no_pagado', (select count(*) from pagos where n_ligas > 0 and (status <> 'pagado' or not to_pnl))),
 'completitud', json_build_object(
   'mes_actual', (select json_build_object('iniciadas', count(*), 'sin_monto', count(*) filter (where coalesce(amount, 0) <= 0)) from ra, h where checkin >= date_trunc('month', h.hoy)::date and checkin <= h.hoy),
   'mes_anterior', (select json_build_object('iniciadas', count(*), 'sin_monto', count(*) filter (where coalesce(amount, 0) <= 0)) from ra, h where checkin >= (date_trunc('month', h.hoy) - interval '1 month')::date and checkin < date_trunc('month', h.hoy)::date),
   'gastos_30d', (select json_build_object('total', count(*), 'con_foto', count(*) filter (where jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) > 0), 'de_servicios', count(*) filter (where service_payment_id is not null)) from transactions, h where kind = 'gasto' and date > h.hoy - 30),
   'gastos_total', (select json_build_object('total', count(*), 'con_foto', count(*) filter (where jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) > 0)) from transactions where kind = 'gasto'),
   'salidas_30d_sin_chica', (select json_agg(json_build_object('depa', r.property_code, 'salio', r.checkout)) from ra r join properties p on p.code = r.property_code, h where r.checkout < h.hoy and r.checkout >= h.hoy - 30 and r.cleaner_key is null and p.cleaning is not false),
   'salidas_7d_proximas_sin_chica', (select count(*) from ra r join properties p on p.code = r.property_code, h where r.checkout >= h.hoy and r.checkout <= h.hoy + 7 and r.cleaner_key is null and p.cleaning is not false),
   'depas_activos', (select count(*) from properties where active is not false and coalesce(kind, 'depa') <> 'cajon'),
   'depas_sin_ical', (select json_agg(code) from properties where active is not false and coalesce(kind, 'depa') <> 'cajon' and coalesce(ical_url, '') = ''),
   'depas_sin_liga_airbnb', (select json_agg(code) from properties where active is not false and coalesce(kind, 'depa') <> 'cajon' and coalesce(airbnb_url, '') = ''),
   'pendientes_abiertos', (select count(*) from tasks where status = 'en_proceso'),
   'pendientes_vencidos', (select count(*) from tasks, h where status = 'en_proceso' and date < h.hoy),
   'motor', (select json_build_object('foto', (select max(actualizado) from pl_listings), 'listados', (select count(*) from pl_listings), 'sin_sincronizar', (select count(*) from pl_listings where sync is not true),
              'ideas_vigentes', (select count(*) from pl_ideas where vigente is not false), 'ideas_vencidas', (select count(*) from pl_ideas, h where vigente is not false and vence < h.hoy),
              'decisiones', (select count(*) from precio_decisiones), 'meses_vs_zona', (select count(*) from pl_mensual)))),
 'acceso', json_build_object(
   'usuarios_por_rol', (select json_object_agg(role, n) from (select role, count(*) n from app_users group by 1) x),
   'usuarios_sin_entrar_30d', (select count(*) from app_users where last_seen is null or last_seen < now() - interval '30 days'),
   'tablas_sin_rls', (select json_agg(c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
   'tablas_rls_sin_politicas', (select json_agg(c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and not exists (select 1 from pg_policy p where p.polrelid = c.oid)),
   'funciones_definer_abiertas_a_anon', (select json_agg(p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')),
   'funciones_sin_search_path', (select json_agg(p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
                                   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
   'quien_decide_precios', (select value from settings where key = 'precio_decide'),
   'decisiones_de_otra_persona', (select count(*) from precio_decisiones d where lower(d.por) is distinct from lower((select value #>> '{}' from settings where key = 'precio_decide')))),
 'cambios', json_build_object(
   'migraciones', (select count(*) from supabase_migrations.schema_migrations),
   'migracion_ultima', (select name from supabase_migrations.schema_migrations order by version desc limit 1),
   'nombre_proveedor_en_datos', (select (select count(*) from pl_ideas where (coalesce(titulo, '') || coalesce(detalle, '') || coalesce(tipo, '')) ~* convert_from(decode('7072696365203f6c616273', 'hex'), 'utf8'))
        + (select count(*) from tasks where description ~* convert_from(decode('7072696365203f6c616273', 'hex'), 'utf8')) + (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc ~* convert_from(decode('7072696365203f6c616273', 'hex'), 'utf8'))
        + (select count(*) from wa_avisos where (coalesce(resumen, '') || coalesce(detalle, '')) ~* convert_from(decode('7072696365203f6c616273', 'hex'), 'utf8')))),
 'tablas', (select json_object_agg(relname, n_live_tup order by relname) from pg_stat_user_tables where schemaname = 'public')
)
$fn$;
revoke all on function public.mgm_auditoria() from public, anon, authenticated;
