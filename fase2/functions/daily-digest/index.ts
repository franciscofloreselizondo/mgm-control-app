// daily-digest · corre cada día a las 19:00 (pg_cron) y avisa lo que falta para mañana:
// limpiezas sin asignar, huéspedes que necesitan cajón sin asignar y anuncios sin depa.
import { createClient } from "npm:@supabase/supabase-js@2";
import { alertRecipients, appLink, fmt, sendEmail, sendPush } from "../_shared/alerts.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const SECRET = Deno.env.get("INGEST_SECRET")!;

function mxDate(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(now); // YYYY-MM-DD
}

Deno.serve(async (req) => {
  if (req.headers.get("x-ingest-secret") !== SECRET) return new Response("unauthorized", { status: 401 });
  const manana = mxDate(1);

  const { data: salidas } = await sb.from("reservations").select("code, property_code, property_guess, guest, cleaner_key")
    .eq("checkout", manana).neq("status", "cancelada");
  const sinLimpia = (salidas ?? []).filter((r) => !r.cleaner_key);

  const { data: noche } = await sb.from("reservations").select("code, property_code, guest, needs_parking, parking_from")
    .lte("checkin", manana).gt("checkout", manana).neq("status", "cancelada");
  const { data: props } = await sb.from("properties").select("code, has_parking");
  const tiene = new Set((props ?? []).filter((p) => p.has_parking).map((p) => p.code));
  const sinCajon = (noche ?? []).filter((r) => r.needs_parking === true && !tiene.has(r.property_code) && !r.parking_from);

  const { count: sinDepa } = await sb.from("reservations").select("code", { count: "exact", head: true })
    .is("property_code", null).neq("status", "cancelada");

  if (!sinLimpia.length && !sinCajon.length && !sinDepa) return Response.json({ status: "todo asignado" });

  const items: string[] = [];
  if (sinLimpia.length) items.push(`${sinLimpia.length} limpieza(s) sin asignar: ${sinLimpia.map((r) => r.property_code || `¿${r.property_guess ?? "?"}?`).join(", ")}`);
  if (sinCajon.length) items.push(`${sinCajon.length} huésped(es) sin cajón: ${sinCajon.map((r) => r.property_code).join(", ")}`);
  if (sinDepa) items.push(`${sinDepa} reserva(s) con anuncio sin ligar a depa`);

  const title = `⚠️ Pendientes para ${fmt(manana)}`;
  await sendPush(sb, title, items.join(" · "), appLink("#hoy") || undefined);
  await sendEmail(await alertRecipients(sb), title,
    `<div style="font-family:Arial,sans-serif;font-size:15px"><h2>${title}</h2><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>
     ${appLink() ? `<a href="${appLink("#hoy")}">Abrir MGM Control</a>` : ""}</div>`);
  return Response.json({ status: "enviado", items });
});
