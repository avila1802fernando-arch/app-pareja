// Edge Function "psicologo"
// «Tu espacio»: Claude como psicólogo personal, en sesiones individuales (public/psicologo.js). Solo para las cuentas
// de psico_permitidos (psicologo.sql; cada uno con su espacio aparte). La llama la app, con la sesión de quien la usa:
//   { sesion_id, accion: "responder" } → Claude contesta lo último que escribiste
//   { sesion_id, accion: "cerrar" }    → Claude escribe el resumen, pone al día lo que entiende de ti y la sesión se cierra
//
// Privado: nada de esto escribe en `eventos` (no hay avisos ni notificaciones) y la función `sesion` (la de pareja) no
// lee estas tablas. Esta sí lee los resúmenes de las sesiones de pareja, que la persona ya tiene: así entiende su relación.
//
// Secreto necesario: ANTHROPIC_API_KEY (el mismo de `sesion`). SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY vienen inyectados.
// Se publica con --no-verify-jwt porque la revisión la hace la función misma: le pregunta a Supabase Auth quién llama,
// que tenga su espacio y que la sesión sea suya. Si no, nunca llega a hablar con Claude.

import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { type Cierre, ESQUEMA_CIERRE, type Formulacion, INSTRUCCIONES, PEDIDO_CIERRE, type ResumenPsico } from "./instrucciones.ts";

const MODELO = "claude-opus-5-5";
const ESFUERZO_CHARLA = "medium"; // conversación: piensa lo justo, sin hacerte esperar mucho
const ESFUERZO_CIERRE = "high";   // el resumen y la formulación del caso se piensan con calma
const ESPERA_MS = 1200;           // si escribes dos mensajes seguidos, Claude los contesta juntos
const TOPE_DIARIO = 120;          // respuestas de Claude por persona en 24 h: un techo para el gasto
const SESIONES_QUE_RECUERDA = 10; // resúmenes de tus sesiones anteriores que Claude lee en cada sesión
const PAREJA_QUE_LEE = 4;         // resúmenes de sus sesiones de pareja, como contexto
const TURNO_COLGADO_MS = 120_000; // igual que en psico_tomar_turno (psicologo.sql)
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

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type Sesion = { id: string; usuario_id: string; numero: number; estado: string; pensando_desde: string | null; creado_en: string };
type Mensaje = { id: number; de_claude: boolean; texto: string; creado_en: string };
type Anterior = { numero: number; tema: string | null; tarea: string | null; resumen: ResumenPsico | null; cerrada_en: string | null };
type DePareja = { numero: number; tema: string | null; acuerdo: string | null; ejercicio: string | null; resumen: Record<string, unknown> | null; cerrada_en: string | null };
type Datos = {
  sesion: Sesion; mensajes: Mensaje[]; anteriores: Anterior[]; formulacion: Formulacion | null;
  yo: { nombre: string; tz: string | null; trato: Trato };
  pareja: { nombre: string; tz: string | null; desde: string | null; conocidos: string | null; sesiones: DePareja[]; encuentro: { titulo: string; tipo: string; inicio: string } | null } | null;
};
type Turno = Anthropic.Beta.BetaMessageParam;
type Trato = "el" | "ella"; // cómo hablarle (psico_permitidos.trato)

// Lo que la app sabe explicar (MOTIVOS en public/psicologo.js)
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
  if (!/^[0-9a-f-]{36}$/i.test(sesionId) || !["responder", "cerrar"].includes(accion)) return responder({ error: "datos" }, 400);

  // ¿Quién llama, tiene su espacio y la sesión es suya?
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return responder({ error: "sin_sesion" }, 401);
  const [{ data: permitido }, { data: suya }] = await Promise.all([
    admin.from("psico_permitidos").select("usuario_id, trato").eq("usuario_id", user.id).maybeSingle(),
    admin.from("psico_sesiones").select("id").eq("id", sesionId).eq("usuario_id", user.id).maybeSingle(),
  ]);
  if (!permitido) return responder({ error: "sin_permiso" }, 403);
  if (!suya) return responder({ error: "no_existe" }, 404);

  const llave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!llave) return responder({ error: "falta_llave" }, 503);
  const claude = new Anthropic({ apiKey: llave });

  try {
    const trato = permitido.trato === "ella" ? "ella" : "el";
    if (accion === "cerrar") return responder(await cerrar(claude, sesionId, trato));
    return responder(await contestar(claude, sesionId, trato));
  } catch (e) {
    const codigo = motivo(e);
    // (al registro va solo el código y el tipo de error, nunca lo que se habló)
    console.error("psicologo:", accion, codigo, e instanceof Anthropic.APIError ? `${e.status} ${e.type ?? ""}` : (e instanceof Error ? e.name : ""));
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
// De a una llamada por vez (psico_tomar_turno). Si escribiste algo mientras Claude pensaba, la llamada de ese mensaje
// no pudo tomar el turno: lo contesta esta, en otra vuelta.
async function contestar(claude: Anthropic, sesionId: string, trato: Trato) {
  await esperar(ESPERA_MS);
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const { data: tengo } = await admin.rpc("psico_tomar_turno", { p_sesion: sesionId });
    if (!tengo) return { ok: true, nota: "otra llamada está contestando" };
    let visto = 0;
    try {
      const d = await cargar(sesionId, trato);
      const ultimo = d.mensajes.at(-1);
      if (ultimo && ultimo.de_claude) return { ok: true, nota: "nada nuevo" };
      visto = ultimo?.id ?? 0;
      await revisarTope(d.sesion.usuario_id);
      const r = await claude.beta.messages.create({
        model: MODELO,
        max_tokens: 16000,
        ...RESPALDO,
        output_config: { effort: ESFUERZO_CHARLA },
        cache_control: { type: "ephemeral" },
        system: sistema(d),
        messages: historia(d),
      });
      if (r.stop_reason === "refusal") throw new Aviso("rechazo");
      const texto = textoDe(r).replace(/^claude:\s*/i, "").slice(0, 8000);
      if (!texto) throw new Aviso("claude");
      const { error } = await admin.from("psico_mensajes")
        .insert({ sesion_id: sesionId, usuario_id: d.sesion.usuario_id, de_claude: true, texto });
      if (error) throw new Error(error.message);
    } finally {
      await admin.rpc("psico_soltar_turno", { p_sesion: sesionId });
    }
    const { data: ult } = await admin.from("psico_mensajes").select("id, de_claude").eq("sesion_id", sesionId)
      .order("id", { ascending: false }).limit(1).maybeSingle();
    if (!ult || ult.de_claude || ult.id <= visto) return { ok: true };
  }
  return { ok: true };
}

// ---------- terminar: el resumen y la formulación ----------
async function cerrar(claude: Anthropic, sesionId: string, trato: Trato) {
  // si Claude está contestando algo, se espera a que termine (como mucho unos 30 s)
  for (let i = 0; i < 20; i++) {
    const { data: s } = await admin.from("psico_sesiones").select("estado, pensando_desde").eq("id", sesionId).maybeSingle();
    if (!s || s.estado === "cerrada") return { ok: true, nota: "ya estaba cerrada" };
    if (s.estado === "resumiendo" || !s.pensando_desde || Date.now() - Date.parse(s.pensando_desde) > TURNO_COLGADO_MS) break;
    await esperar(1500);
  }
  const { data: tengo } = await admin.rpc("psico_empezar_cierre", { p_sesion: sesionId });
  if (!tengo) return { ok: true, nota: "ya se está cerrando" };
  try {
    const d = await cargar(sesionId, trato);
    if (!d.mensajes.some((m) => !m.de_claude)) throw new Aviso("vacia");
    const conversacion = historia(d);
    agregar(conversacion, "user", PEDIDO_CIERRE);
    const r = await claude.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      ...RESPALDO,
      output_config: { effort: ESFUERZO_CIERRE, format: { type: "json_schema", schema: ESQUEMA_CIERRE } },
      cache_control: { type: "ephemeral" },
      system: sistema(d),
      messages: conversacion,
    });
    if (r.stop_reason === "refusal") throw new Aviso("rechazo");
    if (r.stop_reason !== "end_turn") throw new Aviso("claude");
    const { sesion: resumen, formulacion } = JSON.parse(textoDe(r)) as Cierre;
    const corto = (t: string | undefined, n: number) => (t ?? "").trim().slice(0, n) || null;
    // primero lo que entiende de ti (si falla, la sesión sigue abierta y se puede volver a intentar)
    const { error: e1 } = await admin.from("psico_perfil")
      .upsert({ usuario_id: d.sesion.usuario_id, formulacion, actualizado_en: new Date().toISOString() });
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await admin.from("psico_sesiones").update({
      estado: "cerrada",
      tema: corto(resumen.tema, 160),
      tarea: corto(resumen.tarea, 600),
      resumen,
      cerrada_en: new Date().toISOString(),
      pensando_desde: null,
    }).eq("id", sesionId);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  } catch (e) {
    // no quedó el resumen: la sesión vuelve a estar abierta para intentarlo otra vez
    await admin.from("psico_sesiones").update({ estado: "abierta", pensando_desde: null }).eq("id", sesionId);
    throw e;
  }
}

// ---------- datos ----------
// Todo lo que se lee es de la persona dueña de la sesión (usuario_id): nunca del espacio de su pareja. De la pareja
// solo entran su nombre, su zona horaria y los resúmenes de las sesiones de pareja, que ya leen los dos.
async function cargar(sesionId: string, trato: Trato): Promise<Datos> {
  const { data: sesion } = await admin.from("psico_sesiones")
    .select("id, usuario_id, numero, estado, pensando_desde, creado_en").eq("id", sesionId).maybeSingle();
  if (!sesion) throw new Aviso("no_existe");
  const yo = sesion.usuario_id as string;
  const [mensajes, anteriores, perfil, formulacion, pareja] = await Promise.all([
    admin.from("psico_mensajes").select("id, de_claude, texto, creado_en").eq("sesion_id", sesionId).order("id").limit(1000),
    admin.from("psico_sesiones").select("numero, tema, tarea, resumen, cerrada_en")
      .eq("usuario_id", yo).eq("estado", "cerrada").lt("numero", sesion.numero)
      .order("numero", { ascending: false }).limit(SESIONES_QUE_RECUERDA),
    admin.from("perfiles").select("nombre, tz").eq("id", yo).maybeSingle(),
    admin.from("psico_perfil").select("formulacion").eq("usuario_id", yo).maybeSingle(),
    admin.from("parejas").select("id, usuario_a, usuario_b, desde, conocidos").or(`usuario_a.eq.${yo},usuario_b.eq.${yo}`).limit(1).maybeSingle(),
  ]);
  // sin la conversación completa Claude volvería a saludar o contestaría a medias: mejor no contestar
  if (mensajes.error || anteriores.error || perfil.error || formulacion.error) throw new Error("no se pudieron leer los datos de la sesión");

  let deLaPareja: Datos["pareja"] = null;
  const p = pareja.data;
  const otroId = p ? (p.usuario_a === yo ? p.usuario_b : p.usuario_a) : null;
  if (p && otroId) {
    // (si esto falla, se sigue sin el contexto de la pareja: lo de esta persona es lo importante)
    const [otro, sesiones, encuentro] = await Promise.all([
      admin.from("perfiles").select("nombre, tz").eq("id", otroId).maybeSingle(),
      admin.from("sesiones").select("numero, tema, acuerdo, ejercicio, resumen, cerrada_en")
        .eq("pareja_id", p.id).eq("estado", "cerrada").order("numero", { ascending: false }).limit(PAREJA_QUE_LEE),
      // lo próximo para verse, contado desde que empezó la sesión (así el texto no cambia en cada mensaje y se aprovecha la caché)
      admin.from("eventos_cal").select("titulo, tipo, inicio").eq("pareja_id", p.id)
        .in("tipo", ["viaje", "cita"]).gt("inicio", sesion.creado_en).order("inicio").limit(1).maybeSingle(),
    ]);
    deLaPareja = {
      nombre: otro.data?.nombre ?? "su pareja", tz: otro.data?.tz ?? null, desde: p.desde, conocidos: p.conocidos,
      sesiones: ((sesiones.data ?? []) as DePareja[]).reverse(), encuentro: encuentro.data ?? null,
    };
  }
  return {
    sesion: sesion as Sesion,
    mensajes: (mensajes.data ?? []) as Mensaje[],
    anteriores: ((anteriores.data ?? []) as Anterior[]).reverse(),
    formulacion: (formulacion.data?.formulacion ?? null) as Formulacion | null,
    yo: { nombre: perfil.data?.nombre ?? "", tz: perfil.data?.tz ?? null, trato },
    pareja: deLaPareja,
  };
}

async function revisarTope(usuarioId: string) {
  const desde = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await admin.from("psico_mensajes").select("id", { count: "exact", head: true })
    .eq("usuario_id", usuarioId).eq("de_claude", true).gte("creado_en", desde);
  if ((count ?? 0) >= TOPE_DIARIO) throw new Aviso("tope");
}

// ---------- lo que lee Claude ----------
function fecha(iso: string, tz: string | null, conDia = false): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric", ...(conDia ? { weekday: "long" } : {}) };
  try { return new Date(iso).toLocaleDateString("es", { ...opts, timeZone: tz ?? "UTC" }); }
  catch { return new Date(iso).toLocaleDateString("es", { ...opts, timeZone: "UTC" }); }
}
function hora(iso: string, tz: string | null): string {
  try { return new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", timeZone: tz ?? "UTC" }); }
  catch { return new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }); }
}
const PAIS: Record<string, string> = { "America/Guayaquil": "Ecuador", "Pacific/Galapagos": "Ecuador", "America/Santiago": "Chile", "America/Punta_Arenas": "Chile" };
const dondeVive = (tz: string | null) => (tz ? `${PAIS[tz] ? `${PAIS[tz]} (zona horaria ${tz})` : `la zona horaria ${tz}`}` : "(sin dato)");

const TITULOS_FORMULACION: [keyof Formulacion, string][] = [
  ["quien_eres", "Su vida hoy"], ["lo_que_te_trae", "Lo que lo trae"], ["objetivos", "Sus objetivos"], ["historia", "Su historia"],
  ["patrones", "Patrones"], ["disparadores", "Disparadores"], ["fortalezas", "Fortalezas"], ["lo_que_ayuda", "Lo que le ayuda"],
  ["como_se_conecta", "Cómo se conecta"], ["avances", "Avances"], ["a_cuidar", "A cuidar"],
];

// Lo que sabe de esta persona. Cambia solo entre una sesión y otra (por eso va después de las instrucciones, que no cambian).
function contexto(d: Datos): string {
  const { sesion, yo, pareja } = d;
  const l: string[] = ["# Lo que sabes de esta persona", ""];
  l.push(`- Se llama ${yo.nombre || "(sin nombre)"} y vive en ${dondeVive(yo.tz)}.`);
  l.push(yo.trato === "ella" ? "- Es mujer: háblale en femenino (por ejemplo «bienvenida», «cansada», «tranquila»)." : "- Es hombre: háblale en masculino (por ejemplo «bienvenido», «cansado», «tranquilo»).");
  l.push(`- En su hora, esta sesión empezó el ${fecha(sesion.creado_en, yo.tz, true)} a las ${hora(sesion.creado_en, yo.tz)}.`);
  l.push(`- Es su sesión número ${sesion.numero} contigo.`);
  if (pareja) {
    l.push(`- Su pareja se llama ${pareja.nombre} y vive en ${dondeVive(pareja.tz)}: tienen una relación a distancia.`);
    if (pareja.conocidos) l.push(`- Se conocieron el ${fecha(pareja.conocidos, "UTC")}.`);
    if (pareja.desde) l.push(`- Son novios desde el ${fecha(pareja.desde, "UTC")}.`);
    if (pareja.encuentro) {
      const dias = Math.ceil((Date.parse(pareja.encuentro.inicio) - Date.parse(sesion.creado_en)) / 86_400_000);
      l.push(`- Lo próximo que tienen en el calendario para verse: «${pareja.encuentro.titulo}» (${pareja.encuentro.tipo}), el ${fecha(pareja.encuentro.inicio, yo.tz)}: faltan ${dias} ${dias === 1 ? "día" : "días"}.`);
    }
  }
  l.push("", `# Tu formulación de su caso (lo que has ido entendiendo de ${yo.trato === "ella" ? "ella" : "él"})`, "");
  const f = d.formulacion;
  const conTexto = f ? TITULOS_FORMULACION.filter(([k]) => typeof f[k] === "string" && f[k].trim()) : [];
  if (!conTexto.length) l.push(`Todavía no tienes: estás empezando a ${yo.trato === "ella" ? "conocerla" : "conocerlo"}.`);
  for (const [k, titulo] of conTexto) l.push(`${titulo}: ${f![k].trim()}`);

  l.push("", "# Sus sesiones anteriores contigo", "");
  if (!d.anteriores.length) l.push("Todavía no tiene: esta es la primera.");
  for (const a of d.anteriores) {
    const r = a.resumen;
    l.push(`## Sesión ${a.numero}${a.cerrada_en ? ` · ${fecha(a.cerrada_en, yo.tz)}` : ""}`);
    const campo = (titulo: string, texto?: string | null) => { if (texto && texto.trim()) l.push(`${titulo}: ${texto.trim()}`); };
    campo("Tema", a.tema ?? r?.tema);
    campo("Cómo llegó", r?.llegada);
    campo("Lo que trabajaron", r?.trabajamos);
    campo("Lo que se dio cuenta", r?.descubriste);
    campo("Herramienta", r?.herramienta);
    campo("Tarea", a.tarea ?? r?.tarea);
    campo("Quedó para la próxima", r?.proxima);
    l.push("");
  }

  if (pareja && pareja.sesiones.length) {
    l.push("# Sus últimas sesiones de pareja (las leen los dos; las modera otro Claude, neutral)", "");
    for (const s of pareja.sesiones) {
      const r = (s.resumen ?? {}) as Record<string, unknown>;
      const t = (k: string) => (typeof r[k] === "string" ? (r[k] as string).trim() : "");
      l.push(`## Sesión de pareja ${s.numero}${s.cerrada_en ? ` · ${fecha(s.cerrada_en, yo.tz)}` : ""}`);
      const campo = (titulo: string, texto?: string | null) => { if (texto && texto.trim()) l.push(`${titulo}: ${texto.trim()}`); };
      campo("Tema", s.tema ?? t("tema"));
      const personas = Array.isArray(r.personas) ? r.personas as { nombre?: string; siente_y_necesita?: string }[] : [];
      for (const p of personas) campo(p.nombre ?? "", p.siente_y_necesita);
      campo("Lo que entendieron", t("entendimos"));
      campo("El ciclo que se les repite", t("ciclo"));
      campo("Sus fortalezas", t("fortalezas"));
      campo("Acuerdo", s.acuerdo ?? t("acuerdo"));
      campo("Ejercicio", s.ejercicio ?? t("ejercicio"));
      l.push("");
    }
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
  agregar(lista, "user", `[La app] ${d.yo.nombre || "La persona"} abrió su sesión número ${d.sesion.numero}. Saluda y empieza.`);
  for (const m of d.mensajes) agregar(lista, m.de_claude ? "assistant" : "user", m.texto);
  return lista;
}

function textoDe(r: Anthropic.Beta.BetaMessage): string {
  return r.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text).join("").trim();
}
