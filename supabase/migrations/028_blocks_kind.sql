-- Bloqueos con motivo: 'externa' = reserva por fuera de Airbnb (cuenta como noche ocupada en Estadísticas);
-- 'mantenimiento' = no disponible (se resta de las noches disponibles).
alter table blocks add column if not exists kind text not null default 'mantenimiento';
alter table blocks drop constraint if exists blocks_kind_chk;
alter table blocks add constraint blocks_kind_chk check (kind in ('externa','mantenimiento'));
