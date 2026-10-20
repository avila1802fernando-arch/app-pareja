// Edge Function "notificar"
// La llaman los Database Webhooks:
//   - `eventos` (INSERT): entrada, "te extraño" o "estoy libre" → push a la otra persona
//   - `eventos_cal` (INSERT / UPDATE / DELETE): cambios del calendario → push a la otra persona
//
// Secretos y utilidades compartidas: ver ../_shared/push.ts

import { autorizado, clienteAdmin, enviarPush, fechaEn, horaEn, type Mensaje } from "../_shared/push.ts";

const MINUTOS_SIN_REPETIR = 15; // no avisar dos "entradas" seguidas en menos de 15 min
const TIPOS: Record<string, string> = { llamada: "☎️ Llamada", cita: "💞 Cita", viaje: "✈️ Viaje", aniversario: "🎉 Aniversario", otro: "📌 Otro" };

const sb = clienteAdmin();

type Pareja = { usuario_a: string; usuario_b: string | null };
type Evento = { id: number; pareja_id: string; de_usuario: string; tipo: string; creado_en: string };
type EventoCal = {
  id: string; pareja_id: string; creado_por: string; actualizado_por: string | null;
  titulo: string; tipo: string; inicio: string; fin: string | null; nota: string | null;
};

const ok = (texto: string) => new Response(texto, { status: 200 });

Deno.serve(async (req) => {
  if (!autorizado(req)) return new Response("no autorizado", { status: 401 });
  const payload = await req.json();
  if (payload.table === "eventos" && payload.type === "INSERT") return porEvento(payload.record as Evento);
  if (payload.table === "eventos_cal") return porCalendario(payload);
  return ok("ignorado");
});

// ¿Quién es la otra persona de la pareja?
async function elOtro(parejaId: string, yo: string): Promise<string | null> {
  const { data } = await sb.from("parejas").select("usuario_a, usuario_b").eq("id", parejaId).single();
  const p = data as Pareja | null;
  if (!p || !p.usuario_b) return null;
  return p.usuario_a === yo ? p.usuario_b : p.usuario_a;
}
async function nombreDe(id: string): Promise<string> {
  const { data } = await sb.from("perfiles").select("nombre").eq("id", id).maybeSingle();
  return data?.nombre ?? "Tu pareja";
}
async function tzDe(id: string): Promise<string | null> {
  const { data } = await sb.from("perfiles").select("tz").eq("id", id).maybeSingle();
  return data?.tz ?? null;
}

// ----- eventos: entrada, te extraño, libre -----
async function porEvento(ev: Evento) {
  // Anti-spam: si es "entrada" y la misma persona ya entró hace poco, no avisar
  if (ev.tipo === "entrada") {
    const desde = new Date(Date.now() - MINUTOS_SIN_REPETIR * 60_000).toISOString();
    const { count } = await sb.from("eventos")
      .select("id", { count: "exact", head: true })
      .eq("pareja_id", ev.pareja_id).eq("de_usuario", ev.de_usuario).eq("tipo", "entrada")
      .neq("id", ev.id).gte("creado_en", desde);
    if ((count ?? 0) > 0) return ok("reciente, sin aviso");
  }

  const otroId = await elOtro(ev.pareja_id, ev.de_usuario);
  if (!otroId) return ok("pareja incompleta");
  const nombre = await nombreDe(ev.de_usuario);

  let mensaje: Mensaje;
  if (ev.tipo === "entrada") {
    mensaje = { title: `${nombre} acaba de entrar ❤️`, body: "Y te extraña." };
  } else if (ev.tipo === "libre") {
    // ¿Hasta qué hora está libre? Se muestra en la hora local de quien recibe.
    const [{ data: d }, tz] = await Promise.all([
      sb.from("disponibilidad").select("hasta").eq("usuario_id", ev.de_usuario).maybeSingle(),
      tzDe(otroId),
    ]);
    mensaje = {
      title: `${nombre} está libre para una llamada ☎️`,
      body: d?.hasta ? `Hasta las ${horaEn(d.hasta, tz)} (tu hora). ¿Hablamos?` : "¿Hablamos?",
      tag: "libre",
    };
  } else {
    mensaje = { title: `${nombre} dice: te extraño ❤️`, body: "Entra y respóndele." };
  }

  const enviadas = await enviarPush(sb, otroId, mensaje);
  return new Response(JSON.stringify({ enviadas }), { headers: { "content-type": "application/json" } });
}

// ----- eventos_cal: agendó / cambió / canceló -----
const CAMPOS_CAL = ["titulo", "tipo", "inicio", "fin", "nota"] as const;
async function porCalendario(payload: { type: string; record: EventoCal | null; old_record: EventoCal | null }) {
  const ev = (payload.type === "DELETE" ? payload.old_record : payload.record)!;
  // Un UPDATE que no toca lo visible (p. ej. el cron marcando recordado_en) no avisa
  if (payload.type === "UPDATE" && CAMPOS_CAL.every((c) => payload.record![c] === payload.old_record![c])) return ok("sin cambios");

  const actor = payload.type === "INSERT" ? ev.creado_por : (ev.actualizado_por ?? ev.creado_por);
  const otroId = await elOtro(ev.pareja_id, actor);
  if (!otroId) return ok("pareja incompleta");
  const [nombre, tz] = await Promise.all([nombreDe(actor), tzDe(otroId)]);

  const verbo = payload.type === "INSERT" ? "agendó" : payload.type === "UPDATE" ? "cambió" : "canceló";
  const mensaje: Mensaje = {
    title: `${nombre} ${verbo}: ${ev.titulo}`,
    body: `${TIPOS[ev.tipo] ?? ev.tipo} · ${fechaEn(ev.inicio, tz)} (tu hora)`,
    tag: `cal-${ev.id}`,
    url: "/#calendario",
  };
  const enviadas = await enviarPush(sb, otroId, mensaje);
  return new Response(JSON.stringify({ enviadas }), { headers: { "content-type": "application/json" } });
}
