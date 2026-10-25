// Edge Function "sesion"
// Claude modera las sesiones de pareja (public/sesion.js). La llama la app, con la sesión de quien la usa:
//   { sesion_id, accion: "responder" }  → Claude contesta lo último que se escribió (o se queda callado si no hace falta)
//   { sesion_id, accion: "pedir" }      → igual, pero Claude no se puede quedar callado: se lo pidieron
//   { sesion_id, accion: "cerrar" }     → Claude escribe el resumen, el acuerdo y el ejercicio, y la sesión se cierra
//
// Secreto necesario: ANTHROPIC_API_KEY (console.anthropic.com → API Keys). SUPABASE_URL, SUPABASE_ANON_KEY y
// SUPABASE_SERVICE_ROLE_KEY ya vienen inyectados por Supabase.
// Se publica con --no-verify-jwt porque la revisión la hace la función misma: le pregunta a Supabase Auth quién llama
// (sirve con las llaves nuevas y las antiguas) y que la sesión sea de su pareja. Sin sesión abierta en la app no pasa
// de ahí: nunca llega a hablar con Claude.

import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { ESQUEMA_RESUMEN, INSTRUCCIONES, PEDIDO_RESUMEN, type Resumen } from "./instrucciones.ts";

const MODELO = "claude-opus-5-5";
const ESFUERZO_CHARLA = "low";     // conversación: respuestas cortas y rápidas
const ESFUERZO_RESUMEN = "medium"; // el resumen se piensa un poco más
const ESPERA_MS = 2500;            // si escriben dos mensajes seguidos, Claude los contesta juntos
const TOPE_DIARIO = 150;           // respuestas de Claude por pareja en 24 h: un techo para el gasto
const SESIONES_QUE_RECUERDA = 8;   // resúmenes anteriores que Claude lee en cada sesión
const TURNO_COLGADO_MS = 120_000;  // igual que en sesion_tomar_turno (schema.sql)
// Si Claude rechaza algo por sus reglas de seguridad, Anthropic lo reintenta solo con otro modelo
const RESPALDO = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, "content-type": "application/json" } });
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type Sesion = { id: string; pareja_id: string; numero: number; creado_por: string; estado: string; pensando_desde: string | null; creado_en: string };
type Mensaje = { id: number; autor: string | null; texto: string; creado_en: string };
type Perfil = { id: string; nombre: string; tz: string | null };
type Anterior = { numero: number; tema: string | null; acuerdo: string | null; ejercicio: string | null; resumen: Resumen | null; cerrada_en: string | null };
type Datos = {
  sesion: Sesion; mensajes: Mensaje[]; perfiles: Perfil[]; anteriores: Anterior[];
  pareja: { desde: string | null; conocidos: string | null };
  encuentro: { titulo: string; tipo: string; inicio: string } | null;
};
type Turno = Anthropic.Beta.BetaMessageParam;

// Lo que la app sabe explicar (MOTIVOS en public/sesion.js)
class Aviso extends Error {
  constructor(public codigo: string) { super(codigo); }
}
const ESTADO_HTTP: Record<string, number> = { tope: 429, rechazo: 422, ocupado: 503, vacia: 409, no_existe: 404 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return responder({ error: "metodo" }, 405);
  let datos: { sesion_id?: unknown; accion?: unknown };
  try { datos = await req.json(); } catch { return responder({ error: "datos" }, 400); }
  const sesionId = String(datos.sesion_id ?? ""), accion = String(datos.accion ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(sesionId) || !["responder", "pedir", "cerrar"].includes(accion)) {
    return responder({ error: "datos" }, 400);
  }

  // ¿Quién llama, y la sesión es de su pareja? La consulta va con su propia sesión: las reglas (RLS) deciden.
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return responder({ error: "sin_sesion" }, 401);
  const comoUsuario = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: suya } = await comoUsuario.from("sesiones").select("id").eq("id", sesionId).maybeSingle();
  if (!suya) return responder({ error: "no_existe" }, 404);

  const llave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!llave) return responder({ error: "falta_llave" }, 503);
  const claude = new Anthropic({ apiKey: llave });

  try {
    if (accion === "cerrar") return responder(await cerrar(claude, sesionId, user.id));
    return responder(await contestar(claude, sesionId, accion === "pedir" ? user.id : null));
  } catch (e) {
    const codigo = motivo(e);
    console.error("sesion:", accion, codigo, e instanceof Error ? e.message : JSON.stringify(e));
    return responder({ error: codigo }, ESTADO_HTTP[codigo] ?? 502);
  }
});

function motivo(e: unknown): string {
  if (e instanceof Aviso) return e.codigo;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return "llave_invalida";
  if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.APIConnectionError) return "ocupado";
  if (e instanceof Anthropic.APIError) {
    if (e.type === "billing_error") return "sin_saldo";
    if (e.type === "overloaded_error" || (e.status ?? 0) >= 500) return "ocupado";
  }
  return "claude";
}

// ---------- contestar ----------
// De a una llamada por vez (sesion_tomar_turno). Si escribieron algo mientras Claude pensaba, la llamada de ese
// mensaje no pudo tomar el turno: lo contesta esta, en otra vuelta.
async function contestar(claude: Anthropic, sesionId: string, pidio: string | null) {
  if (!pidio) await esperar(ESPERA_MS);
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const { data: tengo } = await admin.rpc("sesion_tomar_turno", { p_sesion: sesionId });
    if (!tengo) return { ok: true, nota: "otra llamada está contestando" };
    let visto = 0;
    try {
      const d = await cargar(sesionId);
      const ultimo = d.mensajes.at(-1);
      if (ultimo && ultimo.autor === null) return { ok: true, nota: "nada nuevo" };
      visto = ultimo?.id ?? 0;
      await revisarTope(d.sesion.pareja_id);
      const conversacion = historia(d);
      if (pidio) agregar(conversacion, "user", `[La app] ${nombreDe(d, pidio)} te pide que intervengas ahora.`);
      const r = await claude.beta.messages.create({
        model: MODELO,
        max_tokens: 16000,
        ...RESPALDO,
        output_config: { effort: ESFUERZO_CHARLA },
        cache_control: { type: "ephemeral" },
        system: sistema(d),
        messages: conversacion,
      });
      if (r.stop_reason === "refusal") throw new Aviso("rechazo");
      const texto = textoDe(r).replace(/^claude:\s*/i, "").slice(0, 4000);
      const callado = !texto || (!pidio && /^\[?\s*silencio\s*\]?\.?$/i.test(texto));
      if (!callado) {
        const { error } = await admin.from("sesion_mensajes")
          .insert({ sesion_id: sesionId, pareja_id: d.sesion.pareja_id, autor: null, texto });
        if (error) throw new Error(error.message);
      }
    } finally {
      await admin.rpc("sesion_soltar_turno", { p_sesion: sesionId });
    }
    const { data: ult } = await admin.from("sesion_mensajes").select("id, autor").eq("sesion_id", sesionId)
      .order("id", { ascending: false }).limit(1).maybeSingle();
    if (!ult || ult.autor === null || ult.id <= visto) return { ok: true };
    pidio = null;
  }
  return { ok: true };
}

// ---------- terminar: el resumen ----------
async function cerrar(claude: Anthropic, sesionId: string, quien: string) {
  // si Claude está contestando algo, se espera a que termine (como mucho unos 30 s)
  for (let i = 0; i < 20; i++) {
    const { data: s } = await admin.from("sesiones").select("estado, pensando_desde").eq("id", sesionId).maybeSingle();
    if (!s || s.estado === "cerrada") return { ok: true, nota: "ya estaba cerrada" };
    if (s.estado === "resumiendo" || !s.pensando_desde || Date.now() - Date.parse(s.pensando_desde) > TURNO_COLGADO_MS) break;
    await esperar(1500);
  }
  const { data: tengo } = await admin.rpc("sesion_empezar_cierre", { p_sesion: sesionId, p_quien: quien });
  if (!tengo) return { ok: true, nota: "ya se está cerrando" };
  try {
    const d = await cargar(sesionId);
    if (!d.mensajes.some((m) => m.autor)) throw new Aviso("vacia");
    const conversacion = historia(d);
    agregar(conversacion, "user", PEDIDO_RESUMEN);
    const r = await claude.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      ...RESPALDO,
      output_config: { effort: ESFUERZO_RESUMEN, format: { type: "json_schema", schema: ESQUEMA_RESUMEN } },
      cache_control: { type: "ephemeral" },
      system: sistema(d),
      messages: conversacion,
    });
    if (r.stop_reason === "refusal") throw new Aviso("rechazo");
    if (r.stop_reason !== "end_turn") throw new Aviso("claude");
    const resumen = JSON.parse(textoDe(r)) as Resumen;
    const corto = (t: string | undefined, n: number) => (t ?? "").trim().slice(0, n) || null;
    const { error } = await admin.from("sesiones").update({
      estado: "cerrada",
      tema: corto(resumen.tema, 160),
      acuerdo: corto(resumen.acuerdo, 600),
      ejercicio: corto(resumen.ejercicio, 600),
      resumen,
      cerrada_en: new Date().toISOString(),
      pensando_desde: null,
    }).eq("id", sesionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    // no quedó el resumen: la sesión vuelve a estar abierta para intentarlo otra vez
    await admin.from("sesiones").update({ estado: "abierta", cerrada_por: null, pensando_desde: null }).eq("id", sesionId);
    throw e;
  }
}

// ---------- datos ----------
async function cargar(sesionId: string): Promise<Datos> {
  const { data: sesion } = await admin.from("sesiones")
    .select("id, pareja_id, numero, creado_por, estado, pensando_desde, creado_en").eq("id", sesionId).maybeSingle();
  if (!sesion) throw new Aviso("no_existe");
  const [pareja, mensajes, anteriores] = await Promise.all([
    admin.from("parejas").select("usuario_a, usuario_b, desde, conocidos").eq("id", sesion.pareja_id).single(),
    admin.from("sesion_mensajes").select("id, autor, texto, creado_en").eq("sesion_id", sesionId).order("id").limit(1000),
    admin.from("sesiones").select("numero, tema, acuerdo, ejercicio, resumen, cerrada_en")
      .eq("pareja_id", sesion.pareja_id).eq("estado", "cerrada").lt("numero", sesion.numero)
      .order("numero", { ascending: false }).limit(SESIONES_QUE_RECUERDA),
  ]);
  // sin la conversación completa Claude volvería a saludar o contestaría a medias: mejor no contestar
  if (pareja.error || mensajes.error || anteriores.error) throw new Error("no se pudieron leer los datos de la sesión");
  const ids = [pareja.data.usuario_a, pareja.data.usuario_b].filter(Boolean) as string[];
  const [perfiles, encuentro] = await Promise.all([
    admin.from("perfiles").select("id, nombre, tz").in("id", ids),
    // lo próximo para verse, contado desde que empezó la sesión (así el texto no cambia en cada mensaje y se aprovecha la caché)
    admin.from("eventos_cal").select("titulo, tipo, inicio").eq("pareja_id", sesion.pareja_id)
      .in("tipo", ["viaje", "cita"]).gt("inicio", sesion.creado_en).order("inicio").limit(1).maybeSingle(),
  ]);
  return {
    sesion: sesion as Sesion,
    mensajes: (mensajes.data ?? []) as Mensaje[],
    perfiles: (perfiles.data ?? []) as Perfil[],
    anteriores: ((anteriores.data ?? []) as Anterior[]).reverse(),
    pareja: { desde: pareja.data.desde, conocidos: pareja.data.conocidos },
    encuentro: encuentro.data ?? null,
  };
}

async function revisarTope(parejaId: string) {
  const desde = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await admin.from("sesion_mensajes").select("id", { count: "exact", head: true })
    .eq("pareja_id", parejaId).is("autor", null).gte("creado_en", desde);
  if ((count ?? 0) >= TOPE_DIARIO) throw new Aviso("tope");
}

// ---------- lo que lee Claude ----------
const nombreDe = (d: Datos, id: string | null) => d.perfiles.find((p) => p.id === id)?.nombre ?? "Tu pareja";

function fecha(iso: string, tz: string | null, conDia = false): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric", ...(conDia ? { weekday: "long" } : {}) };
  try { return new Date(iso).toLocaleDateString("es", { ...opts, timeZone: tz ?? "UTC" }); }
  catch { return new Date(iso).toLocaleDateString("es", { ...opts, timeZone: "UTC" }); }
}
function hora(iso: string, tz: string | null): string {
  try { return new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", timeZone: tz ?? "UTC" }); }
  catch { return new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }); }
}

// Lo que sabe de ustedes. Cambia solo entre una sesión y otra (por eso va después de las instrucciones, que no cambian).
function contexto(d: Datos): string {
  const { sesion, pareja, encuentro } = d;
  const tz = d.perfiles[0]?.tz ?? null;
  const l: string[] = ["# Lo que sabes de ellos", ""];
  for (const p of d.perfiles) {
    l.push(`- ${p.nombre} vive en la zona horaria ${p.tz ?? "(sin dato)"}. En su hora, esta sesión empezó el ${fecha(sesion.creado_en, p.tz, true)} a las ${hora(sesion.creado_en, p.tz)}.`);
  }
  if (pareja.conocidos) l.push(`- Se conocieron el ${fecha(pareja.conocidos, "UTC")}.`);
  if (pareja.desde) l.push(`- Son novios desde el ${fecha(pareja.desde, "UTC")}.`);
  if (encuentro) {
    const dias = Math.ceil((Date.parse(encuentro.inicio) - Date.parse(sesion.creado_en)) / 86_400_000);
    l.push(`- Lo próximo que tienen en el calendario para verse: «${encuentro.titulo}» (${encuentro.tipo}), el ${fecha(encuentro.inicio, tz)}: faltan ${dias} ${dias === 1 ? "día" : "días"}.`);
  }
  l.push(`- Esta es su sesión número ${sesion.numero}.`, "", "# Sus sesiones anteriores", "");
  if (!d.anteriores.length) l.push("Todavía no tienen: esta es la primera.");
  for (const a of d.anteriores) {
    const r = a.resumen;
    l.push(`## Sesión ${a.numero}${a.cerrada_en ? ` · ${fecha(a.cerrada_en, tz)}` : ""}`);
    const campo = (titulo: string, texto?: string | null) => { if (texto && texto.trim()) l.push(`${titulo}: ${texto.trim()}`); };
    campo("Tema", a.tema ?? r?.tema);
    campo("Cómo llegaron", r?.llegada);
    for (const p of r?.personas ?? []) campo(p.nombre, p.siente_y_necesita);
    campo("Lo que entendieron", r?.entendimos);
    campo("Lo que se valoraron", r?.valoramos);
    campo("Acuerdo", a.acuerdo ?? r?.acuerdo);
    campo("Ejercicio", a.ejercicio ?? r?.ejercicio);
    campo("Quedó pendiente", r?.pendiente);
    l.push("");
  }
  return l.join("\n").trim();
}

function sistema(d: Datos): Anthropic.Beta.BetaTextBlockParam[] {
  return [
    { type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } },
    { type: "text", text: contexto(d) },
  ];
}

// Dos mensajes seguidos del mismo lado van juntos (la API también lo haría)
function agregar(lista: Turno[], role: "user" | "assistant", texto: string) {
  const ult = lista.at(-1);
  if (ult && ult.role === role && typeof ult.content === "string") ult.content += "\n\n" + texto;
  else lista.push({ role, content: texto });
}
function historia(d: Datos): Turno[] {
  const lista: Turno[] = [];
  agregar(lista, "user", `[La app] ${nombreDe(d, d.sesion.creado_por)} abrió la sesión número ${d.sesion.numero}. Saluda a los dos y empieza.`);
  for (const m of d.mensajes) {
    if (m.autor) agregar(lista, "user", `${nombreDe(d, m.autor)}: ${m.texto}`);
    else agregar(lista, "assistant", m.texto);
  }
  return lista;
}

function textoDe(r: Anthropic.Beta.BetaMessage): string {
  return r.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text).join("").trim();
}
