// Alertas: correo por Brevo + notificación push a la app (PWA).
import webpush from "npm:web-push@3.6.7";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const BREVO_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const SENDER_EMAIL = Deno.env.get("ALERT_SENDER_EMAIL") ?? "";
const SENDER_NAME = Deno.env.get("ALERT_SENDER_NAME") ?? "MGM Control";
const APP_URL = Deno.env.get("APP_URL") ?? "";
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

if (VAPID_PUBLIC && VAPID_PRIVATE) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

export async function sendEmail(to: string[], subject: string, html: string) {
  if (!BREVO_KEY || !SENDER_EMAIL || !to.length) return { skipped: true };
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: to.map((email) => ({ email })),
      subject,
      htmlContent: html,
    }),
  });
  if (!r.ok) console.error("Brevo", r.status, await r.text());
  return { ok: r.ok };
}

export async function sendPush(sb: SupabaseClient, title: string, body: string, url = APP_URL) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return { skipped: true };
  const { data: subs } = await sb.from("push_subscriptions").select("endpoint, keys");
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title, body, url }));
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      else console.error("push", code, e);
    }
  }
  return { sent };
}

export async function alertRecipients(sb: SupabaseClient): Promise<string[]> {
  const { data } = await sb.from("settings").select("value").eq("key", "alert_emails").maybeSingle();
  return Array.isArray(data?.value) ? data!.value as string[] : [];
}

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export function fmt(d?: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  return `${DIA[dt.getUTCDay()]} ${day} ${MES[m - 1]}`;
}
export const appLink = (hash = "") => (APP_URL ? `${APP_URL}${hash}` : "");
