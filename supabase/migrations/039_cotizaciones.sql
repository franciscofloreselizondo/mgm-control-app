-- Cotizaciones (solo superadmin: María y Paco). Cada cotización guarda todos sus supuestos en `data` (jsonb)
-- y la app arma el PDF en el teléfono. Tipo inicial: 'admin_deco' (administración + proyección + decoración + mood board).
create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'admin_deco',
  titulo text,
  cliente text,
  estado text not null default 'borrador' check (estado in ('borrador','enviada','aceptada','rechazada')),
  version int not null default 1,
  data jsonb not null default '{}'::jsonb,
  creado timestamptz default now(),
  actualizado timestamptz default now(),
  por text
);
alter table quotes enable row level security;
drop policy if exists super_all on quotes;
create policy super_all on quotes for all to authenticated using (my_role() = 'superadmin') with check (my_role() = 'superadmin');
do $$ begin alter publication supabase_realtime add table quotes; exception when others then null; end $$;

-- Datos del depa que sirven para elegir comparables (opcionales: María los llena cuando los tenga)
alter table properties add column if not exists recamaras int;
alter table properties add column if not exists m2 numeric;
