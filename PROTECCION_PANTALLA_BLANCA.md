# Protección contra "pantalla en blanco" en iPhone (estándar para todas las apps)

Problema: en iOS todos los navegadores usan WebKit. Si una versión vieja queda guardada (service worker / caché),
si un CDN externo no responde (DNS, Private Relay, VPN) o si el HTML y el JS quedan de versiones distintas,
la app puede quedarse en blanco en Safari, Chrome y el acceso directo al mismo tiempo.

Qué hace esta app (copiar en cada app nueva):
1. **Sin dependencias externas para arrancar**: supabase-js y las fuentes viven en el repo (`web/vendor`, `web/fonts`).
   Nada de `cdn.jsdelivr` ni Google Fonts en el arranque.
2. **Versiones amarradas**: `bump.sh` pone `?v=N` a styles/config/mgmx/app en `index.html`, cambia la caché del SW y `version.json`.
   HTML y JS de la misma versión siempre viajan juntos.
3. **Service worker red-primero con tiempo límite**: si la red no responde en 6 s usa la copia; solo guarda respuestas 200.
4. **Botón de rescate**: script en línea en `index.html`. Si la app no arranca en 10 s o falla un archivo, aparece
   "Recargar app", que borra service worker + caché y recarga (no toca datos). `?reset=1` en la URL hace lo mismo.
5. **Carga lenta de datos**: a los 15 s muestra "Reintentar / Limpiar y recargar" en vez de "Cargando…" eterno.
6. **Autoactualización**: al volver a la app compara `version.json` y recarga una vez si hay versión nueva.

Si aun así pasa en un teléfono: abrir `https://…/mgm-control-app/?reset=1`, o Modo Avión 15 s,
o Ajustes > Apps > Safari > Avanzado > Datos de sitios web > borrar `github.io`.

# Respaldo restaurable (estándar para todas las apps)

- Datos: Excel legible (Resumen + una pestaña por módulo con estadísticas y tabla de Excel con filtros/totales). Mismo archivo por correo y en Drive.
- Paquete semanal (lunes 6 am) `APP_app_AAAA-MM-DD.zip`: `esquema.sql` generado en vivo desde la base (tablas, llaves, índices, funciones, triggers, RLS/policies, storage, realtime, cron) + archivos publicados de la app + `LEEME-restaurar.txt`. Se guardan 12.
- Fotos/archivos de storage: copia nocturna incremental a Drive.
- Endpoint protegido con header `x-*-key` contra un secret; la función SQL del esquema solo la ejecuta service_role (probar que anon recibe "permission denied").
- Subida con Google Apps Script en la cuenta del dueño (NO cuenta de servicio: no tiene espacio en un Drive personal). Nombre de la propiedad EXACTO (mayúsculas).
- MGM Control App: carpeta Co-Host MGM → "Respaldos app" (Excel cada 4 h 7–23 h, 30 días; zip lunes 6 am; Comprobantes 23 h). Correo a María 10 pm.
