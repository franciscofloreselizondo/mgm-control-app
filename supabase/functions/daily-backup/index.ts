// daily-backup · todos los días a las 22:00 (Guadalajara) manda por correo un Excel con toda la operación,
// una hoja por pestaña, incluido el calendario en el formato de la hoja. Lo dispara pg_cron (004_respaldo.sql).
import { createClient } from "npm:@supabase/supabase-js@2";
import ExcelJS from "npm:exceljs@4.4.0";
import { Buffer } from "node:buffer";
import "../_shared/mgmx.js";

const SECRET = Deno.env.get("CRON_SECRET")!;
const BREVO_KEY = Deno.env.get("BREVO_API_KEY")!;
const SENDER = Deno.env.get("BACKUP_SENDER_EMAIL")!;
const INCLUDE_CLAVES = Deno.env.get("BACKUP_INCLUDE_CLAVES") === "true";
const TABLES = ["properties", "cleaners", "cleaning_rates", "settings", "app_users", "reservations", "blocks", "days_off",
  "payroll_extras", "payroll_payments", "transactions", "tasks", "purchases", "access_codes", "cleanings"];
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

async function loadAll(t: string) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(t).select("*").range(from, from + 999);
    if (error) throw new Error(`${t}: ${error.message}`);
    rows.push(...data); if (data.length < 1000) break;
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== SECRET) return new Response("unauthorized", { status: 401 });
  try {
    const D: Record<string, unknown[]> = {};
    for (const t of TABLES) D[t] = await loadAll(t);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
    // deno-lint-ignore no-explicit-any
    const wb = (globalThis as any).MGMX.buildBackup(ExcelJS, D, today, { claves: INCLUDE_CLAVES });
    const content = Buffer.from(await wb.xlsx.writeBuffer()).toString("base64");

    const cfg = (D.settings as { key: string; value: unknown }[]).find((s) => s.key === "backup_emails")?.value;
    const to = (Array.isArray(cfg) ? cfg : []).filter((e) => typeof e === "string" && e.includes("@"));
    if (!to.length) return Response.json({ status: "sin destinatarios (Supuestos → Respaldo diario)" });

    const activas = (D.reservations as { status: string }[]).filter((r) => r.status !== "cancelada").length;
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: "MGM Control App", email: SENDER },
        to: to.map((email) => ({ email })),
        subject: `Respaldo MGM Control App · ${today}`,
        htmlContent: `<p>Respaldo diario de la operación al ${today}.</p><p>${activas} reservas activas · ${D.transactions.length} movimientos de gastos e ingresos · ${D.tasks.length} pendientes.</p><p>El Excel adjunto trae una hoja por pestaña; las primeras son el calendario en el formato de siempre.</p>`,
        attachment: [{ name: `MGM_respaldo_${today}.xlsx`, content }],
      }),
    });
    if (!r.ok) throw new Error(`Brevo ${r.status}: ${await r.text()}`);
    return Response.json({ status: "enviado", to });
  } catch (e) {
    console.error(e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
