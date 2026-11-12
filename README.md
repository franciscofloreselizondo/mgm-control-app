# MGM Control App (v2 · captura manual)

App para llevar reservas, limpiezas, cajones de Qalina, nómina, gastos e ingresos, pendientes, compras,
claves y ligas de Airbnb de los depas que administra MGM. Las reservas se capturan a mano; no depende del correo.

## Pestañas
| Pestaña | Qué hace |
|---|---|
| **Reservas** | Alta, cambio, cancelación y borrado. Depa, huésped, check in/out, auto y cajón (solo Qalina), chica de limpieza, monto opcional (genera el ingreso). Bloqueos N/A. **Limpiezas extra** (a media estancia o sin estancia), que cuentan en nómina. |
| **Hoy** | Salen / entran / ocupados (se tocan para ver detalle), limpiezas sin asignar a 7 días, autos sin cajón. |
| **Calendario** | Formato de la hoja: depa × día. Azul entra/sigue, rojo sale, clave de quién limpia, cajón ("Prest. a 404" / "De 104"). Zoom 30–140 %. |
| **Nómina** | Semana lun–dom por chica: limpiezas, bono de domingo, "otros", pagos parciales o completos (efectivo/transferencia), saldo y botón Copiar por persona. |
| **Menú →** Cajones Qalina | Por noche: quién trae auto, cajón propio o prestado, libres, renta mensual. |
| Limpiezas | Chicas, descansos y tarifa por depa y chica. |
| Gastos e ingresos | Fecha, depa, categoría, descripción, monto, fotos (opcional), palomita de capturado. Filtros por mes/depa/categoría. Exporta a Excel y CSV ordenado por mes, depa, categoría y fecha. |
| Pendientes | Tareas por depa: responsable, fecha, avances, estatus y prioridad (3 colores), con filtros y orden. |
| Compras | Lugar, descripción, responsable, fecha, palomita; filtros y orden. |
| Claves | 2 claves por depa + Bodega Qalina y Caja fuerte Qalina. |
| Ligas Airbnb | Liga por depa con botón Copiar. |
| Supuestos | Bono de domingo, renta de cajón, cajones de Qalina, usuarios. |

## Roles
- **superadmin** (María, Mike): todo.
- **finanzas** (Sandy): solo Gastos e ingresos. La base de datos rechaza cualquier otra lectura (RLS), no solo se oculta en pantalla.
- Chicas de limpieza: sin acceso (fase 2: WhatsApp con confirmación).

## Qué se necesita para producción
| Servicio | Para qué | Costo |
|---|---|---|
| **Supabase** | Base de datos, inicio de sesión por correo, fotos de comprobantes, tiempo real | Gratis al inicio; Pro US$25/mes para respaldos diarios |
| **GitHub** | Código + hospedaje (GitHub Pages) | Gratis |
| **Brevo** | Enviar el respaldo diario por correo y el código de inicio de sesión | Gratis hasta 300/día |
| Dominio (después) | `app.tudominio.com` y remitente propio | ~US$12/año |

Ya **no** se necesita llave de Anthropic ni script en Gmail.

## Instalación
1. **Supabase**: crear proyecto → SQL Editor → ejecutar en orden `supabase/migrations/001_schema.sql`, `002_seed.sql`
   (depas, chicas, tarifas y cajones del Excel) y `003_usuarios.sql` (cambiar antes los correos de María, Mike y Sandy).
   Después `005_precarga.sql` (no está en el repo: contiene huéspedes y claves; se pega directo en el SQL Editor): reservas, limpiezas y descansos del Excel (27 jul 2026 – 3 ene 2027), los 18 pendientes abiertos y las claves.
2. Authentication → URL Configuration → Site URL = URL de GitHub Pages (y agregarla en Redirect URLs).
   - **Código por correo**: Authentication → Emails → plantilla "Magic Link": incluir `{{ .Token }}` en el texto
     (ej. "Tu código es {{ .Token }}") para que llegue el código además del enlace.
   - **Google**: en console.cloud.google.com crear credencial OAuth "Web application" con Redirect URI
     `https://<PROYECTO>.supabase.co/auth/v1/callback`; pegar Client ID y Secret en Authentication → Providers → Google.
   - Cualquiera puede intentar entrar, pero solo ve datos quien esté en **Supuestos → Usuarios** (tabla `app_users`).
     María y Mike agregan, quitan o cambian el acceso desde ahí.
3. `web/config.js`: poner `SUPABASE_URL` y `SUPABASE_ANON_KEY` (son públicas; la seguridad la da RLS).
4. **GitHub**: subir el repo → Settings → Pages → Source: GitHub Actions. Cada push a `main` publica `web/`.
5. En el celular: abrir la URL → Compartir → Agregar a inicio. Se entra con correo (llega un enlace, sin contraseña).

## Exportar y respaldo diario
- **Calendario → Excel**: descarga el mes en el mismo formato de la hoja (depa × día, colores incluidos).
- **Supuestos → Descargar respaldo ahora**: Excel con una hoja por pestaña.
- **Respaldo diario 10:00 pm** por correo (destinatarios en Supuestos → Respaldo diario; inicia con mariagalarzam@gmail.com).
  Las claves de puerta no viajan por correo salvo que pongas `BACKUP_INCLUDE_CLAVES=true`.

Instalación del respaldo:
```bash
npm i -g supabase && supabase login && supabase link --project-ref <PROYECTO>
cp .env.example .env        # CRON_SECRET, BREVO_API_KEY, BACKUP_SENDER_EMAIL
supabase secrets set --env-file .env
supabase functions deploy daily-backup --no-verify-jwt
```
Luego activar las extensiones `pg_cron` y `pg_net` y ejecutar `supabase/migrations/004_respaldo.sql` con tus valores.
El remitente debe estar verificado en Brevo (Senders). Supabase Pro además guarda respaldos diarios de la base.

## Fase 2 (carpeta `fase2/`, no instalada)
- Lectura automática de correos de Airbnb (Apps Script + función con Claude) y alertas.
- WhatsApp a las chicas con confirmación.
- Conexión en tiempo real con Airbnb: Airbnb no da API a anfitriones; la vía es un PMS con API/webhooks
  (p. ej. Hospitable) o iCal por anuncio (solo fechas, con retraso).
