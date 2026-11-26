-- Frankie con manos (26-nov-2026). Aplicada en la base como migración «frankie_manos».
-- Qué hace:
--   1. Cada pedido que Frankie anota (insert en claudio_pedidos) abre un pendiente en el Command Center
--      (pas.trabajo: tipo 'cambio', estado 'propuesta', origen 'frankie', ref_origen = id del pedido)
--      y deja un mensaje para Paco en la cola pas.wa_paco. Disparador: frankie_pedido_nuevo.
--   2. pas.wa_paco es la cola de WhatsApp para Paco. Al insertar se toca el timbre de n8n (pas.timbrar_paco,
--      con la liga y la llave que viven en Vault) y hay un reintento cada 5 min (tarea pas-wa-paco-timbre).
--      El flujo «MGM · Avisos de WhatsApp a María» tiene una rama para Paco: toma la cola (pas.wa_paco_tomar),
--      manda texto y, si WhatsApp lo rechaza, plantilla; marca el resultado (pas.wa_paco_marcar).
--   3. Paco contesta «autorizo N» o «descarta N» por WhatsApp. El flujo del asistente lo detecta sin pasar
--      por el agente y llama public.frankie_decidir(texto): pone el pedido en 'en_proceso' y el pendiente
--      en 'aprobado', o ambos en 'descartado', y le contesta.
--   4. La tarea programada «Frankie · manos» (cada hora, de 8 a 22) ejecuta en Claude lo aprobado: solo
--      capturas y correcciones de datos de MGM; lo demás lo regresa a Paco. Avisa por la misma cola.
-- Las funciones no se pueden llamar desde la app ni sin sesión (solo postgres / service_role).
create table if not exists pas.wa_paco (
  id bigint generated always as identity primary key,
  creado timestamptz not null default now(),
  ref text,
  mensaje text not null,
  plano text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'error')),
  intentos int not null default 0,
  tomado_at timestamptz,
  enviado_at timestamptz,
  error text
);
alter table pas.wa_paco enable row level security;
-- El cuerpo de las funciones (pas.timbrar_paco, pas.wa_paco_tomar, pas.wa_paco_marcar, pas.wa_paco_trg,
-- public.frankie_pedido_nuevo, public.frankie_decidir) quedó aplicado en la base junto con esta migración.
