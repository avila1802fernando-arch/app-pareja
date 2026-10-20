// Edge Function "notificar"
// La llama un Database Webhook cada vez que se inserta una fila en `eventos`.
// Busca las suscripciones push de la OTRA persona y le envía la notificación.
//
// Secretos y utilidades compartidas: ver ../_shared/push.ts

import { autorizado, clienteAdmin, enviarPush, horaEn, type Mensaje } from "../_shared/push.ts";

const MINUTOS_SIN_REPETIR = 15; // no avisar dos "entradas" seguidas en menos de 15 min

const sb = clienteAdmin();

Deno.serve(async (req) => {
  if (!autorizado(req)) return new Response("no autorizado", { status: 401 });

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

  let mensaje: Mensaje;
  if (ev.tipo === "entrada") {
    mensaje = { title: `${nombre} acaba de entrar ❤️`, body: "Y te extraña." };
  } else if (ev.tipo === "libre") {
    // ¿Hasta qué hora está libre? Se muestra en la hora local de quien recibe.
    const [{ data: d }, { data: destino }] = await Promise.all([
      sb.from("disponibilidad").select("hasta").eq("usuario_id", ev.de_usuario).maybeSingle(),
      sb.from("perfiles").select("tz").eq("id", otroId).maybeSingle(),
    ]);
    mensaje = {
      title: `${nombre} está libre para una llamada ☎️`,
      body: d?.hasta ? `Hasta las ${horaEn(d.hasta, destino?.tz)} (tu hora). ¿Hablamos?` : "¿Hablamos?",
      tag: "libre",
    };
  } else {
    mensaje = { title: `${nombre} dice: te extraño ❤️`, body: "Entra y respóndele." };
  }

  const enviadas = await enviarPush(sb, otroId, mensaje);
  return new Response(JSON.stringify({ enviadas }), { headers: { "content-type": "application/json" } });
});
