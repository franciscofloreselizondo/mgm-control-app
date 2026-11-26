-- Aplicada el 25-nov-2026. En la app, los avisos y los datos, el proveedor de precios se llama siempre «Motor de precios MGM».
-- Qué hizo: (1) el aviso semanal de WhatsApp dejó de traer la liga directa y ahora lleva a Gestión de Ocupación dentro de la app
-- (mgm_wa_link('ocupacion')); (2) se renombró al proveedor en los textos de las ideas ya cargadas (pl_ideas);
-- (3) la liga de respaldo al motor vive en settings.motor_url.
-- El texto original de la migración no se conserva aquí a propósito: el repositorio es público.
select 1;
