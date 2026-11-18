-- Fase 2 · A: sincronizar reservas desde el calendario iCal de cada anuncio de Airbnb (cada hora).
alter table properties add column if not exists ical_url text;
alter table reservations add column if not exists airbnb_code text;
alter table reservations add column if not exists source text default 'manual';
alter table reservations add column if not exists review boolean default false;
create index if not exists reservations_code on reservations(airbnb_code);
create table if not exists sync_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz default now(),
  property_code text, action text, detail text, reservation_id uuid, seen boolean default false
);
alter table sync_log enable row level security;
drop policy if exists super_all on sync_log;
create policy super_all on sync_log for all to authenticated using (my_role() = 'superadmin') with check (my_role() = 'superadmin');
alter publication supabase_realtime add table sync_log;
select cron.unschedule('mgm-airbnb-ical') where exists (select 1 from cron.job where jobname = 'mgm-airbnb-ical');
select cron.schedule('mgm-airbnb-ical', '7 * * * *', $$ select net.http_post(url := 'https://vmhjcrkskpjwkhvjzvcx.supabase.co/functions/v1/daily-backup?sync=airbnb', headers := '{"content-type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 120000); $$);
select 'ok';
