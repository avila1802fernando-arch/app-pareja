// Edge Function "recordatorios"
// La llama pg_cron cada 5 minutos (ver supabase/cron.sql). En cada pasada:
//   1. apaga las disponibilidades ("estoy libre") que ya vencieron
//   2. manda un recordatorio push a los dos por cada evento del calendario
//      que empieza en los próximos MINUTOS_ANTES minutos (una sola vez por evento)
//   3. avisa cuando una carta sellada ya se puede abrir (una sola vez por carta)
//
// Secretos y utilidades compartidas: ver ../_shared/push.ts

import { autorizado, clienteAdmin, enviarPush, fechaEn } from "../_shared/push.ts";

const MINUTOS_ANTES = 30;
const TIPOS: Record<string, string> = { llamada: "☎️ Llamada", cita: "💞 Cita", viaje: "✈️ Viaje", aniversario: "🎉 Aniversario", otro: "📌 Otro" };

const sb = clienteAdmin();

Deno.serve(async (req) => {
  if (!autorizado(req)) return new Response("no autorizado", { status: 401 });
  const ahora = new Date();

  // 1) disponibilidades vencidas
  const { count: apagadas } = await sb.from("disponibilidad")
    .update({ libre: false }, { count: "exact" })
    .eq("libre", true).lt("hasta", ahora.toISOString());

  // 2) recordatorios pendientes
  const limite = new Date(ahora.getTime() + MINUTOS_ANTES * 60_000).toISOString();
  const { data: evs } = await sb.from("eventos_cal")
    .select("id, pareja_id, titulo, tipo, inicio")
    .is("recordado_en", null)
    .gt("inicio", ahora.toISOString())
    .lte("inicio", limite);

  let enviadas = 0;
  for (const ev of evs ?? []) {
    const { data: pareja } = await sb.from("parejas").select("usuario_a, usuario_b").eq("id", ev.pareja_id).single();
    if (!pareja) continue;
    const minutos = Math.max(1, Math.round((new Date(ev.inicio).getTime() - ahora.getTime()) / 60_000));
    for (const id of [pareja.usuario_a, pareja.usuario_b]) {
      if (!id) continue;
      const { data: perfil } = await sb.from("perfiles").select("tz").eq("id", id).maybeSingle();
      enviadas += await enviarPush(sb, id, {
        title: `En ${minutos} min: ${ev.titulo}`,
        body: `${TIPOS[ev.tipo] ?? ev.tipo} · ${fechaEn(ev.inicio, perfil?.tz)} (tu hora)`,
        tag: `recordatorio-${ev.id}`,
        url: "/#calendario",
      });
    }
    // Marcar como recordado (el webhook de eventos_cal ignora este cambio)
    await sb.from("eventos_cal").update({ recordado_en: ahora.toISOString() }).eq("id", ev.id);
  }

  // 3) cartas selladas cuya fecha ya llegó y que nadie ha abierto
  const { data: cartas } = await sb.from("cartas")
    .select("id, pareja_id, de_usuario, creado_en")
    .not("abrir_en", "is", null).lte("abrir_en", ahora.toISOString())
    .is("avisada_en", null).is("leida_en", null);
  for (const c of cartas ?? []) {
    const { data: pareja } = await sb.from("parejas").select("usuario_a, usuario_b").eq("id", c.pareja_id).single();
    const para = pareja && (pareja.usuario_a === c.de_usuario ? pareja.usuario_b : pareja.usuario_a);
    if (para) {
      const [{ data: autor }, { data: perfil }] = await Promise.all([
        sb.from("perfiles").select("nombre").eq("id", c.de_usuario).maybeSingle(),
        sb.from("perfiles").select("tz").eq("id", para).maybeSingle(),
      ]);
      enviadas += await enviarPush(sb, para, {
        title: `💌 Ya puedes abrir la carta de ${autor?.nombre ?? "tu pareja"}`,
        body: `La escribió el ${fechaEn(c.creado_en, perfil?.tz)}. Te estaba esperando.`,
        tag: `carta-${c.id}`,
        url: "/#juntos",
        vibrate: [100, 50, 100, 50, 300],
      });
    }
    await sb.from("cartas").update({ avisada_en: ahora.toISOString() }).eq("id", c.id);
  }

  return new Response(JSON.stringify({
    apagadas: apagadas ?? 0, recordatorios: (evs ?? []).length, cartas: (cartas ?? []).length, enviadas,
  }), {
    headers: { "content-type": "application/json" },
  });
});
