// Utilidades compartidas por las Edge Functions (notificar, recordatorios).
// Supabase empaqueta esta carpeta `_shared` junto con cada función al hacer deploy.
//
// Secretos necesarios (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:tu@correo.com), WEBHOOK_SECRET
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen inyectados por Supabase.

import webpush from "npm:web-push@3.6.7";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export type Mensaje = { title: string; body: string; tag?: string; url?: string; vibrate?: number[] };

// Cliente con permisos totales (solo se usa dentro de las funciones, nunca en el frontend)
export function clienteAdmin(): SupabaseClient {
  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT")!,
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// ¿La llamada trae el secreto que configuramos en el webhook / cron?
export function autorizado(req: Request): boolean {
  return req.headers.get("x-webhook-secret") === Deno.env.get("WEBHOOK_SECRET");
}

// Envía la push a todos los teléfonos de un usuario. Devuelve cuántas salieron.
export async function enviarPush(sb: SupabaseClient, usuarioId: string, mensaje: Mensaje): Promise<number> {
  const { data: subs } = await sb.from("push_subs").select("endpoint, p256dh, auth").eq("usuario_id", usuarioId);
  let enviadas = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(mensaje),
        { TTL: 60 * 60 },
      );
      enviadas++;
    } catch (e) {
      // 404/410 = el teléfono se dio de baja: borrar la suscripción
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from("push_subs").delete().eq("endpoint", s.endpoint);
      else console.error("push falló", code, (e as Error).message);
    }
  }
  return enviadas;
}

// Hora "HH:MM" en la zona horaria de quien recibe (si la zona no es válida, UTC)
export function horaEn(iso: string, tz?: string | null): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  try { return d.toLocaleTimeString("es", { ...opts, timeZone: tz ?? "UTC" }); }
  catch { return d.toLocaleTimeString("es", { ...opts, timeZone: "UTC" }); }
}

// Fecha corta "sáb 19 oct, 19:00" en la zona de quien recibe
export function fechaEn(iso: string, tz?: string | null): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
  try { return d.toLocaleString("es", { ...opts, timeZone: tz ?? "UTC" }); }
  catch { return d.toLocaleString("es", { ...opts, timeZone: "UTC" }); }
}
