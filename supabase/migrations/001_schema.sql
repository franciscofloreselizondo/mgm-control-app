-- MGM Control App v2 · captura manual (sin correos)
-- Supabase → SQL Editor: ejecutar 001_schema.sql, 002_seed.sql y 003_usuarios.sql en ese orden.

-- ---------- catálogos ----------
create table if not exists properties (
  code           text primary key,            -- 'Q-404', 'LHA', 'Lobby 1806'
  building       text,
  sort           int  default 0,
  has_parking    boolean default false,
  parking_level  int,
  lends_parking  boolean default false,       -- aceptó prestar su cajón
  airbnb_url     text,
  active         boolean default true
);
create table if not exists cleaners (
  key text primary key, name text not null, phone text, active boolean default true
);
create table if not exists cleaning_rates (
  property_code text references properties(code) on update cascade on delete cascade,
  cleaner_key   text references cleaners(key) on update cascade on delete cascade,
  amount        numeric not null,
  primary key (property_code, cleaner_key)
);
create table if not exists settings (key text primary key, value jsonb);
create table if not exists app_users (
  email text primary key, name text, role text not null check (role in ('superadmin','finanzas')),
  avatar text                                   -- foto de perfil (JPEG 256×256 en base64)
);

-- ---------- reservas ----------
create table if not exists reservations (
  id            uuid primary key default gen_random_uuid(),
  property_code text not null references properties(code) on update cascade,
  guest         text not null,
  checkin       date not null,
  checkout      date not null,
  has_car       boolean,                       -- solo Qalina
  parking_from  text references properties(code) on update cascade,  -- cajón prestado por este depa
  cleaner_key   text references cleaners(key) on update cascade,     -- limpieza el día de salida
  amount        numeric,                       -- opcional; genera un ingreso
  status        text not null default 'activa' check (status in ('activa','cancelada')),
  created_at    timestamptz default now(),
  check (checkout > checkin)
);
create index if not exists reservations_dates on reservations(checkin, checkout);

create table if not exists blocks (            -- N/A: depa no disponible
  id uuid primary key default gen_random_uuid(),
  property_code text references properties(code) on update cascade on delete cascade,
  date_from date not null, date_to date not null, note text
);
create table if not exists days_off (
  date date not null,
  cleaner_key text references cleaners(key) on update cascade on delete cascade,
  primary key (date, cleaner_key)
);

create table if not exists cleanings (          -- limpiezas extra: a media estancia o sin estancia
  id uuid primary key default gen_random_uuid(),
  property_code text not null references properties(code) on update cascade,
  date date not null,
  cleaner_key text references cleaners(key) on update cascade,
  note text
);

-- ---------- nómina ----------
create table if not exists payroll_extras (    -- "otros" por chica y semana
  id uuid primary key default gen_random_uuid(),
  cleaner_key text not null references cleaners(key) on update cascade,
  week_start date not null, description text not null, amount numeric not null check (amount > 0)
);
create table if not exists payroll_payments (  -- pagos parciales o completos
  id uuid primary key default gen_random_uuid(),
  cleaner_key text not null references cleaners(key) on update cascade,
  week_start date not null, date date not null, amount numeric not null check (amount > 0),
  method text not null check (method in ('efectivo','transferencia')), note text
);

-- ---------- gastos e ingresos ----------
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('gasto','ingreso')),
  date date not null,
  property_code text not null references properties(code) on update cascade,
  category text not null,
  category_other text,
  description text,
  amount numeric not null,
  photos jsonb not null default '[]',          -- rutas en el bucket "comprobantes"
  checked boolean not null default false,
  reservation_id uuid references reservations(id) on delete cascade
);
create index if not exists transactions_date on transactions(date);

-- ---------- pendientes, compras, claves ----------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  property_code text references properties(code) on update cascade,
  description text not null, responsible text, date date, progress text,
  status text not null default 'en_proceso' check (status in ('en_proceso','en_pausa','terminado')),
  priority text not null default 'media' check (priority in ('alta','media','baja'))
);
create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  store text, description text not null, responsible text, date date, done boolean not null default false
);
create table if not exists access_codes (
  place text primary key, code1 text, code2 text
);

-- ---------- seguridad (RLS) ----------
create or replace function my_role() returns text language sql stable security definer set search_path = public as $$
  select role from app_users where lower(email) = lower(auth.jwt()->>'email')
$$;

do $$
declare t text;
begin
  foreach t in array array['properties','cleaners','cleaning_rates','settings','app_users','reservations','blocks','days_off',
                           'payroll_extras','payroll_payments','transactions','tasks','purchases','access_codes','cleanings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists super_all on %I', t);
    execute format('create policy super_all on %I for all to authenticated using (my_role() = ''superadmin'') with check (my_role() = ''superadmin'')', t);
  end loop;
end $$;

-- rol "finanzas": solo gastos/ingresos (y leer la lista de depas)
drop policy if exists fin_all on transactions;
create policy fin_all on transactions for all to authenticated using (my_role() = 'finanzas') with check (my_role() = 'finanzas');
drop policy if exists fin_read on properties;
create policy fin_read on properties for select to authenticated using (my_role() = 'finanzas');
drop policy if exists self_read on app_users;
create policy self_read on app_users for select to authenticated using (lower(email) = lower(auth.jwt()->>'email'));

-- cada usuario cambia solo su propia foto (sin poder tocar su rol)
create or replace function set_my_avatar(img text) returns void language sql security definer set search_path = public as $$
  update app_users set avatar = img where lower(email) = lower(auth.jwt()->>'email') and (img is null or length(img) < 200000)
$$;
revoke all on function set_my_avatar(text) from public;
grant execute on function set_my_avatar(text) to authenticated;

-- fotos de comprobantes (bucket privado)
insert into storage.buckets (id, name, public) values ('comprobantes', 'comprobantes', false) on conflict do nothing;
drop policy if exists comprobantes_rw on storage.objects;
create policy comprobantes_rw on storage.objects for all to authenticated
  using (bucket_id = 'comprobantes' and my_role() in ('superadmin','finanzas'))
  with check (bucket_id = 'comprobantes' and my_role() in ('superadmin','finanzas'));

-- tiempo real
alter publication supabase_realtime add table reservations, cleanings, blocks, days_off, payroll_extras, payroll_payments,
  transactions, tasks, purchases, access_codes, cleaning_rates, properties, cleaners, settings;
