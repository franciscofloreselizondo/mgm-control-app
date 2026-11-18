-- Interruptor de Admin → Automatizaciones para la rutina trimestral de claves.
select cron.unschedule('mgm-claves-trimestral') where exists (select 1 from cron.job where jobname = 'mgm-claves-trimestral');
select cron.schedule('mgm-claves-trimestral', '0 15 16 2,5,8,11 *', $$ select crear_pendientes_claves() where coalesce((select (value->>'on')::boolean is not false and (value->>'claves')::boolean is not false from settings where key = 'automatizaciones'), true) $$);
select 'listo';
