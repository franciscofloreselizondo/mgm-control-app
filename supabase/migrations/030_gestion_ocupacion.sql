-- Gestión de Ocupación: foto del motor de precios (solo lectura para la app) y bitácora de decisiones de precio.
-- Regla de negocio: solo María decide cambios de precio; nadie más puede registrar ni revertir decisiones.
create table if not exists pl_mensual (
  mes text primary key, occ numeric, occ_zona numeric, adr numeric, adr_zona numeric, revpar numeric, revpar_zona numeric, depas int, actualizado timestamptz default now());
create table if not exists pl_listings (
  listing_id text primary key, code text, nombre text, torre text, moneda text default 'MXN', base numeric, minimo numeric, maximo numeric, recomendado numeric,
  occ7 numeric, occ7z numeric, occ30 numeric, occ30z numeric, occ60 numeric, occ60z numeric, revpar30 numeric, revpar30z numeric, sync boolean default true, actualizado timestamptz default now());
create table if not exists pl_ideas (
  id text primary key, code text, tipo text, titulo text, detalle text, antes numeric, nuevo numeric, moneda text default 'MXN', vence date, prioridad int default 50, liga text, creado timestamptz default now(), vigente boolean default true);
create table if not exists precio_decisiones (
  id uuid primary key default gen_random_uuid(), idea_id text, code text, titulo text, antes numeric, nuevo numeric, moneda text default 'MXN',
  estado text not null check (estado in ('aprobada','aplicada','despues','ignorada','revertida')), por text, at timestamptz default now(), nota text);
alter table pl_mensual enable row level security; alter table pl_listings enable row level security; alter table pl_ideas enable row level security; alter table precio_decisiones enable row level security;
drop policy if exists super_lee on pl_mensual; create policy super_lee on pl_mensual for select using (my_role() = 'superadmin');
drop policy if exists super_lee on pl_listings; create policy super_lee on pl_listings for select using (my_role() = 'superadmin');
drop policy if exists super_lee on pl_ideas; create policy super_lee on pl_ideas for select using (my_role() = 'superadmin');
drop policy if exists super_lee on precio_decisiones; create policy super_lee on precio_decisiones for select using (my_role() = 'superadmin');
-- Quién puede decidir precios: el correo guardado en settings.precio_decide (hoy, María).
create or replace function precio_decide() returns boolean language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt()->>'email','')) = lower(coalesce((select value #>> '{}' from settings where key = 'precio_decide'), ''));
$$;
drop policy if exists decide_ins on precio_decisiones; create policy decide_ins on precio_decisiones for insert with check (precio_decide());
drop policy if exists decide_upd on precio_decisiones; create policy decide_upd on precio_decisiones for update using (precio_decide()) with check (precio_decide());
insert into settings(key, value) values ('precio_decide', to_jsonb('mariagalarzam@gmail.com'::text)) on conflict (key) do nothing;
