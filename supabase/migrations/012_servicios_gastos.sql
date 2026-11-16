alter table service_accounts add column if not exists split jsonb;
alter table transactions add column if not exists service_payment_id text references service_payments(id) on delete cascade;
create index if not exists transactions_sp on transactions(service_payment_id);
-- Lighthouse 2005: 65% LHA / 35% LHB. Backfill de pagos históricos a transactions (ver historial del chat).
