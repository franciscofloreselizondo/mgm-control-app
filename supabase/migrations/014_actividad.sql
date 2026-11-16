alter table app_users add column if not exists last_seen timestamptz;
alter table app_users add column if not exists visits int default 0;
create or replace function touch_me() returns void language sql security definer set search_path = public as $$
  update app_users set last_seen = now(), visits = coalesce(visits, 0) + 1 where lower(email) = lower(auth.jwt()->>'email');
$$;
grant execute on function touch_me() to authenticated;
