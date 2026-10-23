// Edge Function "recordatorios"
// La llama pg_cron cada 5 minutos (ver supabase/cron.sql). En cada pasada:
//   1. apaga las disponibilidades ("estoy libre") que ya vencieron
//   2. manda un recordatorio push a los dos por cada evento del calendario
//      que empieza en los próximos MINUTOS_ANTES minutos (una sola vez por evento)
//   3. avisa cuando una carta sellada ya se puede abrir (una sola vez por carta)
//   4. días especiales de cada mes (el de novios y el de conocerse): un aviso a cada uno
//      desde las HORA_ESPECIAL de su zona horaria, una sola vez por día (tabla avisos_dia)
//
// Secretos y utilidades compartidas: ver ../_shared/push.ts

import { autorizado, clienteAdmin, enviarPush, fechaEn, type Mensaje } from "../_shared/push.ts";

const MINUTOS_ANTES = 30;
const HORA_ESPECIAL = 9; // los avisos de días especiales salen desde las 9 de la mañana de cada uno

// Fecha "YYYY-MM-DD" y hora en una zona horaria (si la zona no es válida, UTC)
function enZona(d: Date, tz?: string | null): { fecha: string; hora: number } {
  const fmt = (zona: string) => {
    const p: Record<string, string> = {};
    new Intl.DateTimeFormat("en-US", { timeZone: zona, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" })
      .formatToParts(d).forEach((x) => (p[x.type] = x.value));
    return { fecha: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) };
  };
  try { return fmt(tz ?? "UTC"); } catch { return fmt("UTC"); }
}
// ¿Hoy es el mismo día del mes que `base`? (si el mes es más corto, cuenta el último día)
function esMesiversario(base: string, hoy: string): boolean {
  if (hoy <= base) return false;
  const [y, m, d] = hoy.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d === Math.min(Number(base.slice(8, 10)), ultimo);
}
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
function mensajeEspecial(clave: string, base: string, hoy: string): Mensaje {
  const meses = (Number(hoy.slice(0, 4)) - Number(base.slice(0, 4))) * 12 + (Number(hoy.slice(5, 7)) - Number(base.slice(5, 7)));
  const a = Math.floor(meses / 12), m = meses % 12;
  const t = [a && plural(a, "año", "años"), m && plural(m, "mes", "meses")].filter(Boolean).join(" y ");
  const fecha = new Date(base + "T12:00:00Z").toLocaleDateString("es", { day: "numeric", month: "long", timeZone: "UTC" });
  if (clave === "novios") {
    return m === 0
      ? { title: `🎉 ¡Hoy cumplen ${t} de novios!`, body: `Desde el ${fecha}, juntos 💗`, tag: "especial-novios", url: "/", vibrate: [200, 100, 200, 100, 400] }
      : { title: `💗 ¡Feliz mesiversario! ${t} de novios`, body: `Un ${fecha} empezó lo más bonito.`, tag: "especial-novios", url: "/", vibrate: [200, 100, 200] };
  }
  const verbo = meses === 1 || meses === 12 ? "se cumple" : "se cumplen";
  return { title: `💫 Hoy ${verbo} ${t} desde que se conocieron`, body: `Todo empezó un ${fecha}.`, tag: "especial-conocidos", url: "/", vibrate: [150, 80, 150] };
}
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

  // 4) días especiales: el día del mes en que se hicieron novios y en que se conocieron
  let especiales = 0;
  const { data: parejas } = await sb.from("parejas")
    .select("usuario_a, usuario_b, desde, conocidos").not("usuario_b", "is", null);
  for (const p of parejas ?? []) {
    if (!p.desde && !p.conocidos) continue;
    for (const uid of [p.usuario_a, p.usuario_b]) {
      const { data: perfil } = await sb.from("perfiles").select("tz").eq("id", uid).maybeSingle();
      const { fecha: hoy, hora } = enZona(ahora, perfil?.tz);
      if (hora < HORA_ESPECIAL) continue;
      for (const [clave, base] of [["novios", p.desde], ["conocidos", p.conocidos]] as const) {
        if (!base || !esMesiversario(base, hoy)) continue;
        // Primero se anota: si ya estaba (clave primaria), hoy ya se avisó
        const { error } = await sb.from("avisos_dia").insert({ usuario_id: uid, clave, dia: hoy });
        if (error) continue;
        enviadas += await enviarPush(sb, uid, mensajeEspecial(clave, base, hoy));
        especiales++;
      }
    }
  }

  return new Response(JSON.stringify({
    apagadas: apagadas ?? 0, recordatorios: (evs ?? []).length, cartas: (cartas ?? []).length, especiales, enviadas,
  }), {
    headers: { "content-type": "application/json" },
  });
});
