/**
 * MGM Control App · sube el respaldo a Google Drive cada 4 horas (7, 11, 15, 19 y 23 h, hora de Guadalajara).
 * Se instala una sola vez en script.google.com con la cuenta dueña de la carpeta:
 *   1) Pega este código, 2) en Propiedades del script agrega MGM_KEY (la misma que el secret BACKUP_DRIVE_KEY),
 *   3) ejecuta instalar() una vez y acepta permisos.
 */
const FOLDER_ID = '17vghLLY2y3zosh0i-6KNavLbw59lK9H7';
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
function subirRespaldo() {
  const key = PropertiesService.getScriptProperties().getProperty('MGM_KEY');
  if (!key) throw new Error('Falta la propiedad MGM_KEY: Configuración del proyecto → Propiedades de la secuencia de comandos → Agregar propiedad (nombre MGM_KEY, valor = tu clave) → Guardar.');
  const r = UrlFetchApp.fetch(URL_FN, { headers: { 'x-mgm-key': key }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Respaldo falló: ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 200));
  const nombre = 'MGM_respaldo_' + Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd_HH') + 'h.xlsx';
  DriveApp.getFolderById(FOLDER_ID).createFile(r.getBlob().setName(nombre));
}
