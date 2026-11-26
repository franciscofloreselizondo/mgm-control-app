// respaldo-completo · MGM Control App
// Volcado completo de la base: TODAS las tablas públicas (también las de módulos nuevos, sin tocar este archivo)
// en un JSON dentro de un .zip, enviado por correo a settings.volcado_emails. Sirve para restaurar; el Excel diario es para leer.
// Lo dispara pg_cron cada noche (supabase/migrations/034_permisos_y_volcado.sql).
// Seguridad: no devuelve datos (solo viajan a los correos guardados en la base) y no manda más de uno cada 20 horas.
// Las claves de acceso solo se incluyen si settings.backup_claves = true, igual que en el Excel.
import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";

const BREVO_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve(async () => {
  try {
    if (!BREVO_KEY) return Response.json({ error: "Falta el secret BREVO_API_KEY" }, { status: 500 });
    const { data: aj, error: e1 } = await sb.from("settings").select("key,value").in("key", ["volcado_last", "volcado_emails", "backup_sender"]);
    if (e1) throw new Error(e1.message);
    const val = (k: string) => (aj ?? []).find((s) => s.key === k)?.value;
    const last = Number((val("volcado_last") as { at?: number } | undefined)?.at ?? 0);
    if (Date.now() - last < 20 * 3600 * 1000) return Response.json({ status: "ya se envió hoy" });
    const to = ((val("volcado_emails") as string[]) ?? []).filter((e) => typeof e === "string" && e.includes("@"));
    if (!to.length) return Response.json({ status: "sin destinatarios (settings.volcado_emails)" });
    const sender = val("backup_sender") as { email: string; name?: string } | undefined;
    if (!sender?.email) return Response.json({ error: "Falta backup_sender en settings" }, { status: 500 });

    const { data: D, error: e2 } = await sb.rpc("mgm_volcado");
    if (e2) throw new Error(e2.message);
    const tablas = Object.keys(D).sort();
    const filas = tablas.reduce((n, t) => n + (D[t] as unknown[]).length, 0);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
    const zip = new JSZip();
    zip.file(`MGM_volcado_${today}.json`, JSON.stringify({ app: "MGM Control App", fecha: today, generado: new Date().toISOString(), tablas: D }));
    const content = await zip.generateAsync({ type: "base64", compression: "DEFLATE", compressionOptions: { level: 9 } });

    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: sender.name ?? "MGM Control App", email: sender.email },
        to: to.map((email) => ({ email })),
        subject: `Volcado completo MGM Control App · ${today}`,
        htmlContent: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#23272a"><p><b>Volcado completo de la base de MGM Control App</b> al ${today}.</p>
<p>${tablas.length} tablas · ${filas} renglones. Es la copia para restaurar; guárdala. El Excel diario es la copia para leer.</p>
<p style="color:#5f6668;font-size:13px">${tablas.map((t) => `${t} (${(D[t] as unknown[]).length})`).join(" · ")}</p></div>`,
        attachment: [{ name: `MGM_volcado_${today}.zip`, content }],
      }),
    });
    if (!r.ok) throw new Error(`Brevo ${r.status}: ${await r.text()}`);
    await sb.from("settings").upsert({ key: "volcado_last", value: { at: Date.now(), fecha: today, tablas: tablas.length, filas, kb: Math.round(content.length * 0.75 / 1024) } });
    return Response.json({ status: "enviado", tablas: tablas.length, filas });
  } catch (e) {
    console.error(e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
