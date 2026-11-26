-- 040 · Ingresos de Airbnb desde el historial de transacciones, en neto depositado (26-nov-2026)
--
-- Decisión de Paco: el ingreso por reserva es lo que Airbnb deposita, DESPUÉS de las retenciones de IVA e ISR,
-- igual que María lo lleva en sus Excel de P&L. Antes la app tomaba «Ganas» del correo (antes de retenciones, ~12% más).
--
-- Aplicado en la base como: airbnb_movimientos, airbnb_aplicar_neto, airbnb_aplicar_fix_nombre, airbnb_cruce_recortada_estable.
-- El texto completo de las funciones vive en la base.
--
-- Tablas
--   airbnb_lotes    lote subido (boleto de un solo uso de 15 min; los datos crudos se borran al cargarlos)
--   airbnb_mov      un renglón por movimiento del CSV de Airbnb, sin nombres ni teléfonos de huéspedes
--                   grupo: res | imp | aj | ret | resol | payout | otros · pendiente = cobro por recibir
--   airbnb_cambios  rastro de cada cambio a reservations/transactions, por corrida, para deshacer
-- Vista
--   airbnb_pagos    un renglón por código de confirmación: ganas, por_cobrar, retenciones, resolucion, neto
--                   neto = reservación + impuestos trasladados + ajustes + retenciones (cobrado y por cobrar)
-- Funciones (solo postgres/service_role, salvo airbnb_subir que valida el boleto)
--   airbnb_boleto(origen)        crea el lote y regresa el boleto
--   airbnb_subir(boleto, datos)  recibe el texto que genera tools/airbnb_mov.py
--   airbnb_cargar(lote)          pasa el lote a airbnb_mov; reemplaza el mismo rango de fechas y la foto de pendientes
--   airbnb_cruce()               reglas: codigo · fechas (depa + entrada + salida, pareja única) · recortada (reservas que la app
--                                tiene desde el 27-jul-2026 y Airbnb desde antes: el monto se reparte por noches)
--   airbnb_aplicar(simular)      llena reservations.amount y airbnb_code y crea o corrige el ingreso ligado
--   airbnb_deshacer(corrida)     regresa todo lo que cambió una corrida
-- Correos de confirmación
--   airbnb_mail.ganas guarda el «Ganas» del correo; airbnb_mail.amount queda en neto estimado con settings.airbnb_factor_neto
--   (0.87685, medido en 516 reservas pagadas de ago–nov 2026). Trigger airbnb_mail_neto.
--
-- Primera carga (corrida 1): cobros del 1-jun al 25-nov-2026 + pendientes al 26-nov; 3,948 movimientos, 794 códigos.
-- 513 reservas cruzadas (68 por código, 436 por fechas, 9 recortadas): 456 montos nuevos y 57 corregidos de «Ganas» a neto.

create table if not exists public.airbnb_lotes (
  id bigint generated always as identity primary key,
  creado timestamptz not null default now(), por text, origen text,
  ticket_hash text, vence timestamptz, datos text, filas int,
  cargado timestamptz, aplicado timestamptz, resumen jsonb, cambios jsonb);

create table if not exists public.airbnb_mov (
  id bigint generated always as identity primary key,
  fecha date not null, grupo text not null, tipo text, code text, property_code text, espacio text,
  checkin date, checkout date, estado text, monto numeric not null default 0, bruto numeric,
  pendiente boolean not null default false, lote bigint not null references public.airbnb_lotes(id));

create table if not exists public.airbnb_cambios (
  id bigint generated always as identity primary key,
  corrida bigint not null, at timestamptz not null default now(),
  reservation_id uuid not null, regla text not null, code text not null,
  monto_antes numeric, monto_despues numeric, code_antes text,
  tx_id uuid, tx_nueva boolean not null default false, tx_monto_antes numeric, deshecho timestamptz);

alter table public.airbnb_mail add column if not exists ganas numeric;
