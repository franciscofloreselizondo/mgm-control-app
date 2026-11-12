-- Respaldo diario por correo a las 22:00 de Guadalajara (04:00 UTC). Requiere la función daily-backup
-- desplegada (sin verificación JWT) y el secret BREVO_API_KEY en Edge Functions → Secrets.
create extension if not exists pg_cron;
create extension if not exists pg_net;

insert into settings(key, value) values
  ('backup_emails', '["mariagalarzam@gmail.com"]'),
  ('backup_sender', '{"email":"club@hermanosmcgregor.com","name":"MGM Control App"}')
on conflict (key) do nothing;

select cron.unschedule('mgm-respaldo-diario') where exists (select 1 from cron.job where jobname = 'mgm-respaldo-diario');
select cron.schedule('mgm-respaldo-diario', '0 4 * * *', $$
  select net.http_post(
    url := 'https://vmhjcrkskpjwkhvjzvcx.supabase.co/functions/v1/daily-backup',
    headers := '{"content-type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ); $$);
