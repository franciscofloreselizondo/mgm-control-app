-- Respaldo diario por correo a las 22:00 de Guadalajara (04:00 UTC).
-- Antes: Database → Extensions → activar pg_cron y pg_net. Reemplaza <PROYECTO> y <CRON_SECRET>.
insert into settings(key, value) values ('backup_emails', '["mariagalarzam@gmail.com"]') on conflict (key) do nothing;

select cron.schedule('mgm-respaldo-diario', '0 4 * * *', $$
  select net.http_post(
    url     := 'https://<PROYECTO>.supabase.co/functions/v1/daily-backup',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  ); $$);
