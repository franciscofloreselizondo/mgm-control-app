/**
 * MGM Control App · sube el respaldo a Google Drive cada 4 horas (7, 11, 15, 19 y 23 h, hora de Guadalajara).
 * Guarda en la subcarpeta "Respaldos app" de Co-Host MGM y borra (a la papelera) los de más de 30 días.
 * Instalación: pegar el código, agregar la propiedad MGM_KEY (= secret BACKUP_DRIVE_KEY) y ejecutar instalar().
 */
const FOLDER_ID = '17vghLLY2y3zosh0i-6KNavLbw59lK9H7';
const SUBCARPETA = 'Respaldos app';
const DIAS_GUARDAR = 30;
const URL_FN = 'https://vmhjcrkskpjwkhvjzvcx.supabase.co/functions/v1/daily-backup?file=1';
const HORAS = [7, 11, 15, 19, 23];

function instalar() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('cadaHora').timeBased().everyHours(1).create();
  subirRespaldo();
}
function cadaHora() {
  const h = Number(Utilities.formatDate(new Date(), 'America/Mexico_City', 'H'));
  if (HORAS.indexOf(h) >= 0) subirRespaldo();
}
function carpeta() {
  const raiz = DriveApp.getFolderById(FOLDER_ID), it = raiz.getFoldersByName(SUBCARPETA);
  return it.hasNext() ? it.next() : raiz.createFolder(SUBCARPETA);
}
function subirRespaldo() {
  const key = PropertiesService.getScriptProperties().getProperty('MGM_KEY');
  if (!key) throw new Error('Falta la propiedad MGM_KEY: Configuración del proyecto → Propiedades de la secuencia de comandos → Agregar propiedad (nombre MGM_KEY, valor = tu clave) → Guardar.');
  const r = UrlFetchApp.fetch(URL_FN, { headers: { 'x-mgm-key': key }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Respaldo falló: ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 200));
  const nombre = 'MGM_respaldo_' + Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd_HH') + 'h.xlsx';
  const dest = carpeta();
  dest.createFile(r.getBlob().setName(nombre));
  limpiarViejos(dest);
}
function limpiarViejos(dest) {
  const limite = Date.now() - DIAS_GUARDAR * 864e5, it = (dest || carpeta()).getFiles();
  while (it.hasNext()) { const f = it.next(); if (f.getName().indexOf('MGM_respaldo_') === 0 && f.getDateCreated().getTime() < limite) f.setTrashed(true); }
}
// Una sola vez: mueve a la subcarpeta los respaldos que hayan quedado sueltos en Co-Host MGM
function migrar() {
  const raiz = DriveApp.getFolderById(FOLDER_ID), dest = carpeta(), it = raiz.getFiles(); let n = 0;
  while (it.hasNext()) { const f = it.next(); if (f.getName().indexOf('MGM_respaldo_') === 0) { f.moveTo(dest); n++; } }
  Logger.log(n + ' respaldo(s) movidos a ' + SUBCARPETA);
}
