-- Historial de corridas de la auditoría de control: resultado completo de mgm_auditoria() y hallazgos de cada corrida.
-- Solo lectura/escritura con service_role (seguridad por renglón activa y sin políticas, a propósito).
create table if not exists public.auditoria_corridas (
  id bigint generated always as identity primary key,
  fecha date not null,
  at timestamptz not null default now(),
  version text,
  dictamen text,
  resultado jsonb not null,
  hallazgos jsonb not null default '[]'::jsonb,
  nota text
);
alter table public.auditoria_corridas enable row level security;
revoke all on public.auditoria_corridas from anon, authenticated;
