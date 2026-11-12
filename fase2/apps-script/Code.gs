/**
 * MGM Control · lector del Gmail de María
 * Se instala UNA vez en la cuenta de Gmail de María (script.google.com → Nuevo proyecto).
 * Cada 5 minutos busca correos de Airbnb no procesados, los manda a Supabase y los etiqueta.
 *
 * Configuración (Proyecto → Configuración → Propiedades del script):
 *   INGEST_URL     https://<tu-proyecto>.supabase.co/functions/v1/ingest-email
 *   INGEST_SECRET  el mismo valor que pusiste en Supabase (secret INGEST_SECRET)
 *   SUPABASE_ANON  la "anon public key" de Supabase (la pide el gateway de Edge Functions)
 *
 * Luego ejecuta instalar() una vez y acepta los permisos.
 */
const LABEL = 'MGM/procesado';
const QUERY = 'from:(airbnb.com) newer_than:3d -label:MGM-procesado';

function instalar() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('revisar').timeBased().everyMinutes(5).create();
  GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  revisar();
}

function revisar() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const p = PropertiesService.getScriptProperties();
    const url = p.getProperty('INGEST_URL'), secret = p.getProperty('INGEST_SECRET'), anon = p.getProperty('SUPABASE_ANON');
    const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
    const threads = GmailApp.search(QUERY, 0, 50);
    threads.forEach(th => {
      let todoOk = true;
      th.getMessages().forEach(m => {
        const payload = {
          gmail_id: m.getId(),
          subject: m.getSubject(),
          from: m.getFrom(),
          date: m.getDate().toISOString(),
          body: m.getPlainBody().slice(0, 12000)
        };
        const r = UrlFetchApp.fetch(url, {
          method: 'post', contentType: 'application/json', muteHttpExceptions: true,
          headers: { 'x-ingest-secret': secret, 'Authorization': 'Bearer ' + anon },
          payload: JSON.stringify(payload)
        });
        if (r.getResponseCode() >= 300) { todoOk = false; console.error(r.getResponseCode(), r.getContentText()); }
      });
      if (todoOk) th.addLabel(label);   // si algo falló, se reintenta en 5 min (la función ignora duplicados)
    });
  } finally { lock.releaseLock(); }
}

/** Para cargar el histórico la primera vez (últimos 45 días). Ejecutar a mano una sola vez. */
function cargarHistorico() {
  const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  const p = PropertiesService.getScriptProperties();
  const threads = GmailApp.search('from:(airbnb.com) newer_than:45d -label:MGM-procesado', 0, 200).reverse();
  threads.forEach(th => {
    let ok = true;
    th.getMessages().forEach(m => {
      const r = UrlFetchApp.fetch(p.getProperty('INGEST_URL'), {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { 'x-ingest-secret': p.getProperty('INGEST_SECRET'), 'Authorization': 'Bearer ' + p.getProperty('SUPABASE_ANON') },
        payload: JSON.stringify({ gmail_id: m.getId(), subject: m.getSubject(), from: m.getFrom(),
          date: m.getDate().toISOString(), body: m.getPlainBody().slice(0, 12000) })
      });
      if (r.getResponseCode() >= 300) ok = false;
    });
    if (ok) th.addLabel(label);
  });
}
