// Edge Function "notificar"
// La llama un Database Webhook cada vez que se inserta una fila en `eventos`.
// Busca las suscripciones push de la OTRA persona y le envía la notificación.
//
// Secretos necesarios (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:tu@correo.com), WEBHOOK_SECRET
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen inyectados por Supabase.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const MINUTOS_SIN_REPETIR = 15; // no avisar dos "entradas" seguidas en menos de 15 min

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
    return new Response("no autorizado", { status: 401 });
  }
  const payload = await req.json();
  if (payload.type !== "INSERT" || payload.table !== "eventos") {
    return new Response("ignorado", { status: 200 });
  }
  const ev = payload.record as {
    id: number; pareja_id: string; de_usuario: string; tipo: string; creado_en: string;
  };

  // Anti-spam: si es "entrada" y la misma persona ya entró hace poco, no avisar
  if (ev.tipo === "entrada") {
    const desde = new Date(Date.now() - MINUTOS_SIN_REPETIR * 60_000).toISOString();
    const { count } = await sb.from("eventos")
      .select("id", { count: "exact", head: true })
      .eq("pareja_id", ev.pareja_id).eq("de_usuario", ev.de_usuario).eq("tipo", "entrada")
      .neq("id", ev.id).gte("creado_en", desde);
    if ((count ?? 0) > 0) return new Response("reciente, sin aviso", { status: 200 });
  }

  // ¿Quién es la otra persona?
  const { data: pareja } = await sb.from("parejas").select("usuario_a, usuario_b").eq("id", ev.pareja_id).single();
  if (!pareja || !pareja.usuario_b) return new Response("pareja incompleta", { status: 200 });
  const otroId = pareja.usuario_a === ev.de_usuario ? pareja.usuario_b : pareja.usuario_a;

  const { data: perfil } = await sb.from("perfiles").select("nombre").eq("id", ev.de_usuario).maybeSingle();
  const nombre = perfil?.nombre ?? "Tu pareja";

  const mensaje = ev.tipo === "entrada"
    ? { title: `${nombre} acaba de entrar ❤️`, body: "Y te extraña." }
    : { title: `${nombre} dice: te extraño ❤️`, body: "Entra y respóndele." };

  const { data: subs } = await sb.from("push_subs").select("endpoint, p256dh, auth").eq("usuario_id", otroId);
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
  return new Response(JSON.stringify({ enviadas }), { headers: { "content-type": "application/json" } });
});
