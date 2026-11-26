// claudio-foto · MGM Control App
// Recibe la foto de un ticket que María manda a Claudio por WhatsApp y la guarda en el bucket privado "comprobantes".
// Seguridad: solo acepta un boleto de un solo uso (5 min) que emite la base con claudio_foto_ticket();
// sin boleto válido no guarda nada. Solo imágenes, máximo 8 MB.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "método" }, 405);
  const ticket = req.headers.get("x-ticket") ?? "";
  if (!/^[a-f0-9]{64}$/.test(ticket)) return json({ error: "boleto" }, 401);
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.length < 100 || buf.length > 8 * 1024 * 1024) return json({ error: "tamaño" }, 413);
  const jpg = buf[0] === 0xff && buf[1] === 0xd8, png = buf[0] === 0x89 && buf[1] === 0x50, webp = buf[8] === 0x57 && buf[9] === 0x45;
  if (!jpg && !png && !webp) return json({ error: "solo imágenes" }, 415);
  const { data: ok, error: e1 } = await sb.rpc("claudio_foto_usar", { p_token: ticket });
  if (e1 || ok !== true) return json({ error: "boleto" }, 401);
  const mes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).format(new Date());
  const path = `${mes}/wa-${crypto.randomUUID()}.jpg`; // la app espera rutas .jpg; el tipo real va en contentType
  const { error } = await sb.storage.from("comprobantes").upload(path, buf, { contentType: jpg ? "image/jpeg" : png ? "image/png" : "image/webp" });
  if (error) return json({ error: error.message }, 500);
  return json({ path });
});
