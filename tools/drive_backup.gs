/**
 * MGM Control App · respaldos a Google Drive (carpeta Co-Host MGM → "Respaldos app")
 *  - Excel de datos cada 4 h (7, 11, 15, 19 y 23 h, Guadalajara). Se guardan 30 días.
 *  - Paquete restaurable cada lunes 6 am: MGM_app_AAAA-MM-DD.zip (esquema.sql en vivo + archivos de la app + pasos). Se guardan 12.
 *  - Fotos de comprobantes: cada noche (23 h) copia a "Respaldos app/Comprobantes" solo las nuevas.
 * Instalación: propiedad MGM_KEY (= secret BACKUP_DRIVE_KEY de Supabase) y ejecutar instalar().
 */
const FOLDER_ID = '17vghLLY2y3zosh0i-6KNavLbw59lK9H7';
const SUBCARPETA = 'Respaldos app';
const DIAS_GUARDAR = 30, ZIPS_GUARDAR = 12;
const FN = 'https://vmhjcrkskpjwkhvjzvcx.supabase.co/functions/v1/daily-backup?file=1';
const SITIO = 'https://franciscofloreselizondo.github.io/mgm-control-app/';
const REPO = 'https://raw.githubusercontent.com/franciscofloreselizondo/mgm-control-app/main/';
const HORAS = [7, 11, 15, 19, 23];
const TZ = 'America/Mexico_City';

function instalar() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('cadaHora').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('paqueteSemanal').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).inTimezone(TZ).create();
  ScriptApp.newTrigger('correosAirbnb').timeBased().everyMinutes(30).create();
  subirRespaldo(); paqueteSemanal(); copiarFotos();
}
function cadaHora() {
  const h = Number(Utilities.formatDate(new Date(), TZ, 'H'));
  if (HORAS.indexOf(h) >= 0) subirRespaldo();
  if (h === 23) copiarFotos();
}
// Volver a leer los correos de Airbnb de los últimos N días (después de mejorar el lector).
function reprocesar(dias) {
  const label = GmailApp.getUserLabelByName('MGM-airbnb'); if (!label) return;
  GmailApp.search('from:(airbnb.com) label:MGM-airbnb newer_than:' + (dias || 3) + 'd', 0, 100).forEach(th => th.removeLabel(label));
  correosAirbnb();
}
// Para correr desde el editor (sin argumentos): re-lee los correos de Airbnb de los últimos 30 días.
function reprocesar30() { reprocesar(30); }
// Una vez, después de publicar la función: crea los ingresos de las reservas que ya tenían monto.
function rellenarIngresos() {
  const r = UrlFetchApp.fetch(FN.replace('?file=1', '?backfill=ingresos'), { method: 'post', headers: { 'x-mgm-key': clave() }, muteHttpExceptions: true });
  console.log(r.getResponseCode() + ' ' + r.getContentText());
}
// Correos de Airbnb cada 30 min (trigger propio). Ejecutar una vez para crearlo.
function instalarCorreos() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'correosAirbnb').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('correosAirbnb').timeBased().everyMinutes(30).create();
  correosAirbnb();
}
// Fase 2 · B: correos de Airbnb que María reenvía a esta cuenta → nombre del huésped y monto en la app.
function correosAirbnb() {
  const label = GmailApp.getUserLabelByName('MGM-airbnb') || GmailApp.createLabel('MGM-airbnb');
  const threads = GmailApp.search('from:(airbnb.com) newer_than:30d -label:MGM-airbnb', 0, 50);
  if (!threads.length) return;
  const mails = [];
  threads.forEach(th => th.getMessages().forEach(m => mails.push({ id: m.getId(), subject: m.getSubject(), date: m.getDate().toISOString(), body: m.getPlainBody().slice(0, 15000) })));
  const r = UrlFetchApp.fetch(FN.replace('?file=1', '?ingest=airbnb'), { method: 'post', contentType: 'application/json', headers: { 'x-mgm-key': clave() }, payload: JSON.stringify({ mails }), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Correos Airbnb: ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 200));
  if (JSON.parse(r.getContentText()).pausado) return console.log('Correos Airbnb en pausa: se procesan cuando se vuelva a prender');
  threads.forEach(th => th.addLabel(label));
  console.log(r.getContentText());
}
function clave() {
  const key = PropertiesService.getScriptProperties().getProperty('MGM_KEY');
  if (!key) throw new Error('Falta la propiedad MGM_KEY: Configuración del proyecto → Propiedades de la secuencia de comandos → Agregar propiedad (nombre MGM_KEY, valor = tu clave) → Guardar.');
  return key;
}
function pedir(tipo) {
  const r = UrlFetchApp.fetch(FN + '&tipo=' + tipo, { headers: { 'x-mgm-key': clave() }, muteHttpExceptions: true });
  if (r.getResponseCode() === 204) { console.log('En pausa desde Admin → Automatizaciones'); return null; }
  if (r.getResponseCode() !== 200) throw new Error('Respaldo (' + tipo + ') falló: ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 200));
  return r;
}
function sub(nombre, padre) { const p = padre || DriveApp.getFolderById(FOLDER_ID), it = p.getFoldersByName(nombre); return it.hasNext() ? it.next() : p.createFolder(nombre); }
function carpeta() { return sub(SUBCARPETA); }

function subirRespaldo() {
  const r = pedir('datos'); if (!r) return; const dest = carpeta();
  dest.createFile(r.getBlob().setName('MGM_respaldo_' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd_HH') + 'h.xlsx'));
  limpiar(dest, 'MGM_respaldo_', DIAS_GUARDAR);
}
function paqueteSemanal() {
  const hoy = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), blobs = [], esq = pedir('esquema'); if (!esq) return;
  blobs.push(Utilities.newBlob(esq.getContentText(), 'text/plain', 'esquema.sql'));
  blobs.push(Utilities.newBlob(pedir('claves').getContentText(), 'text/csv', 'claves.csv'));
  const web = ['index.html', 'app.js', 'mgmx.js', 'styles.css', 'sw.js', 'config.js', 'version.json', 'manifest.webmanifest', 'vendor/supabase-2.119.0.js'];
  web.forEach(f => { const r = UrlFetchApp.fetch(SITIO + f, { muteHttpExceptions: true }); if (r.getResponseCode() === 200) blobs.push(r.getBlob().setName('web/' + f)); });
  ['supabase/functions/daily-backup/index.ts', 'tools/drive_backup.gs', 'bump.sh', 'PROTECCION_PANTALLA_BLANCA.md'].forEach(f => { const r = UrlFetchApp.fetch(REPO + f, { muteHttpExceptions: true }); if (r.getResponseCode() === 200) blobs.push(r.getBlob().setName(f)); });
  blobs.push(Utilities.newBlob(LEEME.replace('{FECHA}', hoy), 'text/plain', 'LEEME-restaurar.txt'));
  const dest = carpeta();
  dest.createFile(Utilities.zip(blobs, 'MGM_app_' + hoy + '.zip'));
  // los zips se guardan por cantidad (los 12 más recientes)
  const zs = []; const it = dest.getFiles(); while (it.hasNext()) { const f = it.next(); if (f.getName().indexOf('MGM_app_') === 0) zs.push(f); }
  zs.sort((a, b) => b.getDateCreated() - a.getDateCreated()).slice(ZIPS_GUARDAR).forEach(f => f.setTrashed(true));
}
function copiarFotos() {
  const rf = pedir('fotos'); if (!rf) return;
  const lista = JSON.parse(rf.getContentText()), dest = sub('Comprobantes', carpeta()), ya = {};
  const it = dest.getFiles(); while (it.hasNext()) ya[it.next().getName()] = 1;
  let n = 0;
  lista.forEach(x => { const nombre = x.path.replace(/\//g, '__'); if (ya[nombre]) return;
    const r = UrlFetchApp.fetch(x.url, { muteHttpExceptions: true }); if (r.getResponseCode() === 200) { dest.createFile(r.getBlob().setName(nombre)); n++; } });
  Logger.log(n + ' foto(s) nuevas copiadas; ' + lista.length + ' en total');
}
function limpiar(dest, prefijo, dias) {
  const limite = Date.now() - dias * 864e5, it = dest.getFiles();
  while (it.hasNext()) { const f = it.next(); if (f.getName().indexOf(prefijo) === 0 && f.getDateCreated().getTime() < limite) f.setTrashed(true); }
}
const LEEME = `MGM Control App · cómo restaurar (paquete del {FECHA})

Contenido: claves.csv (claves de puertas, solo viajan aquí), esquema.sql (estructura completa de la base, generada en vivo), web/ (la app tal como está publicada),
supabase/functions/daily-backup/index.ts (función de respaldo), tools/drive_backup.gs (este script).
Los datos están en el Excel MGM_respaldo_*.xlsx más reciente y las fotos en Respaldos app/Comprobantes.

1) Crear un proyecto nuevo en supabase.com.
2) SQL Editor: correr esquema.sql completo (crea tablas, llaves, funciones, permisos, storage, realtime y cron).
   En la sección de cron, cambiar la URL del proyecto viejo por la nueva.
3) Cargar los datos: de cada pestaña del Excel exportar la tabla a CSV e importarla en Table Editor
   (o pedirle a Claude que los cargue desde el Excel). Orden: properties, cleaners, cleaning_rates, settings, app_users, y luego el resto.
4) Subir las fotos de Comprobantes al bucket "comprobantes" (el nombre del archivo usa __ en lugar de /).
5) Edge Functions: crear daily-backup con index.ts (Verify JWT apagado) y volver a poner los secrets BREVO_API_KEY y BACKUP_DRIVE_KEY.
6) Auth: Site URL y redirect al sitio, proveedor Google (client id/secret de Google Cloud) y SMTP si se usa.
7) Publicar web/ en GitHub Pages (o cualquier hosting) y en web/config.js poner la URL y la llave publicable del proyecto nuevo.
8) En este script de Apps Script no cambia nada salvo la URL FN si cambió el proyecto.`;

// Una sola vez: mueve a la subcarpeta los respaldos que hayan quedado sueltos en Co-Host MGM
function migrar() {
  const raiz = DriveApp.getFolderById(FOLDER_ID), dest = carpeta(), it = raiz.getFiles(); let n = 0;
  while (it.hasNext()) { const f = it.next(); if (f.getName().indexOf('MGM_respaldo_') === 0) { f.moveTo(dest); n++; } }
  Logger.log(n + ' respaldo(s) movidos a ' + SUBCARPETA);
}
