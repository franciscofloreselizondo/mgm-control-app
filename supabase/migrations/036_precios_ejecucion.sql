-- Las órdenes de precio de María ahora las aplica el sistema en el motor de precios (tarea programada cada hora).
-- pendiente: 'aplicar' (poner el precio nuevo) o 'revertir' (regresar el anterior); null = nada por hacer.
-- ejec_at / ejec: cuándo y con qué resultado lo ejecutó el sistema (control de cambios para deshacer).
alter table public.precio_decisiones
  add column if not exists pendiente text check (pendiente in ('aplicar', 'revertir')),
  add column if not exists ejec_at timestamptz,
  add column if not exists ejec jsonb;
-- La batería de auditoría (mgm_auditoria) suma la sección «precios»: por ejecutar, atoradas más de 3 h, con error,
-- ordenadas por alguien que no es quien decide precios, y los rastros settings.motor_escritura_last / motor_foto_last.
-- (El cuerpo de la función se aplicó en la base junto con esta migración.)
