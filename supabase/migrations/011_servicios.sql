-- Pagos de servicios (luz, agua, gas, internet, mantenimiento)
create table if not exists service_accounts (
  id text primary key, service text not null, label text not null, property_code text,
  contrato text, extra text, extra_label text, vencimiento text, responsable text, forma_pago text,
  to_pnl boolean default false, active boolean default true, sort int default 0, note text
);
create table if not exists service_payments (
  id text primary key, account_id text not null references service_accounts(id) on delete cascade,
  period text not null, status text not null default 'pagado', amount numeric, paid_on date, note text,
  photos text[], created_by text, created_at timestamptz default now(), unique (account_id, period)
);
alter table service_accounts enable row level security; alter table service_payments enable row level security;
drop policy if exists super_all on service_accounts; drop policy if exists super_all on service_payments;
create policy super_all on service_accounts for all to authenticated using (my_role() = 'superadmin') with check (my_role() = 'superadmin');
create policy super_all on service_payments for all to authenticated using (my_role() = 'superadmin') with check (my_role() = 'superadmin');
alter publication supabase_realtime add table service_accounts;
alter publication supabase_realtime add table service_payments;
