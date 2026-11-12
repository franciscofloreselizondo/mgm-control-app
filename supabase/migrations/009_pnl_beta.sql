-- P&L (Beta): respuestas y preguntas de María. Solo superadmin.
create table if not exists pnl_beta (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz default now()
);
alter table pnl_beta enable row level security;
drop policy if exists super_all on pnl_beta;
create policy super_all on pnl_beta for all to authenticated using (my_role() = 'superadmin') with check (my_role() = 'superadmin');
alter publication supabase_realtime add table pnl_beta;
select count(*) from pnl_beta;
