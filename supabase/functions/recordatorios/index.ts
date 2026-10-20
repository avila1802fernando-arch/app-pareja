// Edge Function "recordatorios"
// La llama pg_cron cada 5 minutos (ver supabase/cron.sql). En cada pasada:
//   1. apaga las disponibilidades ("estoy libre") que ya vencieron
//   2. manda un recordatorio push a los dos por cada evento del calendario
//      que empieza en los próximos MINUTOS_ANTES minutos (una sola vez por evento)
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

  return new Response(JSON.stringify({ apagadas: apagadas ?? 0, recordatorios: (evs ?? []).length, enviadas }), {
    headers: { "content-type": "application/json" },
  });
});
