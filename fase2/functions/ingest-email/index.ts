// ingest-email · recibe cada correo de Airbnb (lo manda el Apps Script del Gmail de María),
// lo interpreta con Claude, da de alta / cambia / cancela la reserva y avisa a María.
import { createClient } from "npm:@supabase/supabase-js@2";
import { alertRecipients, appLink, fmt, sendEmail, sendPush } from "../_shared/alerts.ts";

const SECRET = Deno.env.get("INGEST_SECRET")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL = Deno.env.get("CLAUDE_MODEL") ?? "claude-haiku-5-5";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

type Mail = { gmail_id: string; subject: string; from: string; date: string; body: string };
type Parsed = {
  tipo: "alta" | "baja" | "cambio" | "otro";
  codigo?: string | null; anuncio?: string | null; huesped?: string | null;
  checkin?: string | null; checkout?: string | null;
  antes_checkin?: string | null; antes_checkout?: string | null;
  huespedes?: number | null; depa?: string | null;
};

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (req.headers.get("x-ingest-secret") !== SECRET) return json({ error: "unauthorized" }, 401);
  const mail = (await req.json()) as Mail;
  if (!mail?.gmail_id) return json({ error: "gmail_id requerido" }, 400);

  // idempotencia
  const { data: seen } = await sb.from("reservation_events").select("id").eq("gmail_id", mail.gmail_id).maybeSingle();
  if (seen) return json({ status: "duplicado" });

  const { data: props } = await sb.from("properties").select("code").eq("active", true);
  let p: Parsed;
  try {
    p = await parse(mail, (props ?? []).map((x) => x.code));
  } catch (e) {
    // 500 → el Apps Script no etiqueta el correo y lo reintenta en la siguiente vuelta
    console.error("parse", mail.gmail_id, e);
    return json({ error: String(e) }, 500);
  }

  if (p.tipo === "otro" || !p.codigo) {
    await sb.from("reservation_events").insert({
      gmail_id: mail.gmail_id, type: p.tipo === "otro" ? "otro" : "error", subject: mail.subject, data: p, received_at: mail.date,
    });
    return json({ status: p.tipo === "otro" ? "ignorado" : "sin_codigo" });
  }

  const code = p.codigo.trim().toUpperCase();
  const { data: prev } = await sb.from("reservations").select("*").eq("code", code).maybeSingle();

  // depa: mapeo confirmado > anterior > sugerencia de Claude (queda marcada para confirmar)
  let property_code: string | null = prev?.property_code ?? null;
  if (p.anuncio) {
    const { data: map } = await sb.from("listing_map").select("property_code").eq("listing_name", p.anuncio).maybeSingle();
    if (map?.property_code) property_code = map.property_code;
  }

  const row: Record<string, unknown> = {
    code,
    listing_name: p.anuncio ?? prev?.listing_name ?? null,
    property_code,
    property_guess: property_code ? null : (p.depa ?? prev?.property_guess ?? null),
    guest: p.huesped ?? prev?.guest ?? null,
    guests: p.huespedes ?? prev?.guests ?? null,
    checkin: p.checkin ?? prev?.checkin ?? null,
    checkout: p.checkout ?? prev?.checkout ?? null,
  };
  if (p.tipo === "baja") {
    row.status = "cancelada";
    row.checkin = prev?.checkin ?? p.checkin ?? null;
    row.checkout = prev?.checkout ?? p.checkout ?? null;
  } else if (p.tipo === "cambio") row.status = "modificada";
  else row.status = prev?.status === "modificada" ? "modificada" : "confirmada";

  // si cambia la fecha de salida, la limpieza asignada ya no aplica
  const salidaCambio = prev && p.tipo === "cambio" && prev.checkout !== row.checkout;
  if (salidaCambio) row.cleaner_key = null;

  const { error: upErr } = await sb.from("reservations").upsert(row);
  if (upErr) return json({ error: upErr.message }, 500);

  const before = p.tipo === "cambio"
    ? { checkin: p.antes_checkin ?? prev?.checkin ?? null, checkout: p.antes_checkout ?? prev?.checkout ?? null }
    : null;
  await sb.from("reservation_events").insert({
    gmail_id: mail.gmail_id, type: p.tipo, code, subject: mail.subject, data: { ...p, property_code }, before,
    received_at: mail.date,
  });

  await notify(p.tipo, row, prev, before, !!salidaCambio);
  return json({ status: "ok", tipo: p.tipo, code });
});

async function notify(
  tipo: string, r: Record<string, unknown>, prev: Record<string, unknown> | null,
  before: { checkin: string | null; checkout: string | null } | null, limpiezaLiberada: boolean,
) {
  const depa = (r.property_code as string) || `¿${r.property_guess ?? "depa"}?`;
  const fechas = `${fmt(r.checkin as string)} → ${fmt(r.checkout as string)}`;
  let title = "", body = "", accion = "";
  if (tipo === "alta") {
    title = `🟢 Nueva reserva · ${depa}`;
    body = `${r.guest ?? "Huésped"} · ${fechas}`;
    accion = `Asigna quién limpia el ${fmt(r.checkout as string)}.`;
  } else if (tipo === "baja") {
    title = `🔴 Cancelación · ${depa}`;
    body = `${r.guest ?? "Huésped"} · ${fechas}`;
    accion = prev?.cleaner_key ? `Avisa a ${prev.cleaner_key}: ya no hay limpieza el ${fmt(r.checkout as string)}.` : "Libera la limpieza y el cajón si estaban asignados.";
  } else {
    title = `🟡 Cambio · ${depa}`;
    body = `${r.guest ?? "Huésped"} · ${before ? `${fmt(before.checkin)}→${fmt(before.checkout)} ahora ` : ""}${fechas}`;
    accion = limpiezaLiberada ? `Cambió la salida: vuelve a asignar limpieza para el ${fmt(r.checkout as string)}.` : "Revisa limpieza y estacionamiento.";
  }
  if (!r.property_code) accion += " El anuncio no está ligado a un depa: confírmalo en Ajustes.";

  const link = appLink("#hoy");
  await sendPush(sb, title, `${body}. ${accion}`, link || undefined);
  const to = await alertRecipients(sb);
  await sendEmail(to, `${title} · ${r.guest ?? ""}`,
    `<div style="font-family:Arial,sans-serif;font-size:15px"><h2 style="margin:0 0 8px">${title}</h2>
     <p style="margin:0 0 6px">${body}</p><p style="margin:0 0 14px"><b>${accion}</b></p>
     ${link ? `<a href="${link}" style="background:#1f4e5f;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir MGM Control</a>` : ""}
     <p style="color:#888;font-size:12px;margin-top:16px">Código ${r.code}</p></div>`);
}

async function parse(mail: Mail, codes: string[]): Promise<Parsed> {
  const prompt = `Correo de Airbnb recibido por una administradora de departamentos en Guadalajara, México.
Fecha del correo: ${mail.date}
De: ${mail.from}
Asunto: ${mail.subject}

${mail.body.slice(0, 8000)}

Clasifica el correo y extrae los datos con la herramienta "registrar".
- alta: reservación confirmada / nueva reserva / reserva instantánea ("Reservation confirmed").
- baja: reservación cancelada ("canceled").
- cambio: modificación ACEPTADA (fechas o huéspedes). En checkin/checkout van las fechas NUEVAS; las anteriores en antes_*.
- otro: mensajes de huéspedes, recordatorios, solicitudes aún no aceptadas, pagos, reseñas, promociones.
Fechas en YYYY-MM-DD; infiere el año con la fecha del correo (la estancia casi siempre es posterior al correo).
"depa": solo si el anuncio corresponde claramente a uno de estos códigos internos: ${codes.join(", ")}.`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      tools: [{
        name: "registrar",
        description: "Registra el movimiento de la reserva",
        input_schema: {
          type: "object",
          properties: {
            tipo: { type: "string", enum: ["alta", "baja", "cambio", "otro"] },
            codigo: { type: ["string", "null"], description: "Código de confirmación, p.ej. HMABCD1234" },
            anuncio: { type: ["string", "null"] },
            huesped: { type: ["string", "null"] },
            checkin: { type: ["string", "null"] }, checkout: { type: ["string", "null"] },
            antes_checkin: { type: ["string", "null"] }, antes_checkout: { type: ["string", "null"] },
            huespedes: { type: ["integer", "null"] },
            depa: { type: ["string", "null"] },
          },
          required: ["tipo"],
        },
      }],
      tool_choice: { type: "tool", name: "registrar" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${await r.text()}`);
  const out = await r.json();
  const tool = (out.content ?? []).find((c: { type: string }) => c.type === "tool_use");
  if (!tool) throw new Error("Claude no devolvió datos");
  const p = tool.input as Parsed;
  const okDate = (d?: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  p.checkin = okDate(p.checkin); p.checkout = okDate(p.checkout);
  p.antes_checkin = okDate(p.antes_checkin); p.antes_checkout = okDate(p.antes_checkout);
  if (p.depa && !codes.includes(p.depa)) p.depa = null;
  return p;
}
