-- Cajones apartados a personas externas (sin reserva)
create table if not exists parking_loans (
  id text primary key,
  cajon text not null references properties(code) on update cascade,
  name text not null,
  date_from date not null,
  date_to date not null,
  created_at timestamptz default now()
);
alter table parking_loans enable row level security;
drop policy if exists super_all on parking_loans;
create policy super_all on parking_loans for all to authenticated using (my_role() = 'superadmin') with check (my_role() = 'superadmin');
alter publication supabase_realtime add table parking_loans;
select count(*) from parking_loans;
