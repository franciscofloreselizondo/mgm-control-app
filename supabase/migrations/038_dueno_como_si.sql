-- 038 · Regla del dueño: el asistente nunca contesta solo «no puedo» (26-nov-2026)
--
-- Qué cambia
--   · claudio_pedidos.accion (jsonb): acción inmediata al autorizar. Hoy: {"tipo":"wa_maria","mensaje":"…"}.
--     Null = lo ejecuta la tarea «Frankie · manos» en su pasada horaria.
--   · claudio_pedido_paco(pedido, contexto): pedido que deja Paco por WhatsApp cuando su asistente
--     no puede hacer algo directo. Entra a pas.trabajo como 'propuesta'; no genera WhatsApp porque
--     el asistente le contesta en el mismo chat con «responde autorizo N».
--   · claudio_mensaje_maria(mensaje): borrador de mensaje de Paco para María. No sale hasta «autorizo N».
--   · frankie_pedido_nuevo(): los pedidos con accion no crean pendiente ni aviso; los de Paco crean
--     pendiente sin aviso; los de María siguen igual (pendiente + WhatsApp a Paco para decidir).
--   · frankie_decidir(): al autorizar un borrador wa_maria lo encola en pas.wa_paco (destino 'maria')
--     y lo cierra; un borrador de más de 24 h no se envía.
--   · pas.wa_paco_marcar(): si un aviso para María falla 3 veces, Paco recibe el aviso de la falla.
--
-- Permisos: las dos funciones nuevas son SECURITY DEFINER y solo las ejecuta service_role/postgres
-- (revocadas a public, anon y authenticated). El texto completo de las funciones vive en la base;
-- se aplicaron como las migraciones «dueno_como_si» y «dueno_como_si_aviso_falla».

alter table public.claudio_pedidos add column if not exists accion jsonb;
comment on column public.claudio_pedidos.accion is
  'Acción inmediata al autorizar, p. ej. {"tipo":"wa_maria","mensaje":"…"}. Null = lo ejecuta Claude en la pasada horaria.';
