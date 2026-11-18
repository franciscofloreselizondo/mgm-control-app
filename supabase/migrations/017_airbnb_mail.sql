-- Fase 2 · B: datos de los correos de Airbnb que María reenvía (nombre del huésped y monto), por código HM.
create table if not exists airbnb_mail (
  code text primary key, guest text, amount numeric, kind text, subject text, received_at timestamptz, created_at timestamptz default now()
);
alter table airbnb_mail enable row level security;
drop policy if exists super_all on airbnb_mail;
create policy super_all on airbnb_mail for all to authenticated using (my_role() = 'superadmin') with check (my_role() = 'superadmin');
select 'ok';
