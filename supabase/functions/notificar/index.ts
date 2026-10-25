// Edge Function "notificar"
// La llaman los triggers de supabase/avisos.sql (mismo formato que un Database Webhook):
//   - `eventos` (INSERT): entrada, "te extraño", "estoy libre", abrazo, beso, a dormir… → push a la otra persona
//   - `eventos_cal` (INSERT / UPDATE / DELETE): cambios del calendario → push a la otra persona
//
// Secretos y utilidades compartidas: ver ../_shared/push.ts

import { autorizado, clienteAdmin, enviarPush, fechaEn, horaEn, type Mensaje } from "../_shared/push.ts";

const MINUTOS_SIN_REPETIR = 15; // no avisar dos "entradas" seguidas en menos de 15 min
const TIPOS: Record<string, string> = { llamada: "☎️ Llamada", cita: "💞 Cita", viaje: "✈️ Viaje", aniversario: "🎉 Aniversario", otro: "📌 Otro" };

// Señales simples: el texto solo depende del nombre de quien la manda.
// Cada tipo lleva su `tag`: en la bandeja, un aviso nuevo reemplaza solo a uno del mismo tipo, nunca a otro distinto.
const SENALES: Record<string, (n: string) => Mensaje> = {
  // (las que dicen "ahora" duran 3 h: llegar a la mañana siguiente diciendo "acaba de entrar" confunde)
  entrada: (n) => ({ title: `${n} acaba de entrar ❤️`, body: "Y te extraña.", tag: "entrada", ttl: 3 * 3600 }),
  te_extrano: (n) => ({ title: `${n} dice: te extraño ❤️`, body: "Entra y respóndele.", tag: "te_extrano", vibrate: [200, 100, 200] }),
  abrazo: (n) => ({ title: `🤗 ${n} te manda un abrazo`, body: "Bien apretado.", tag: "abrazo", vibrate: [500] }),
  beso: (n) => ({ title: `😘 ${n} te manda un beso`, body: "Y otro más.", tag: "beso", vibrate: [80, 60, 80] }),
  pensando: (n) => ({ title: `💭 ${n} está pensando en ti`, body: "Justo ahora.", tag: "pensando", vibrate: [60], ttl: 3 * 3600 }),
  buenos_dias: (n) => ({ title: `☀️ Buenos días, de parte de ${n}`, body: "Que tengas un día bonito.", tag: "buenos_dias", vibrate: [100, 80, 100, 80, 100] }),
  buenas_noches: (n) => ({ title: `🌙 ${n} te da las buenas noches`, body: "Que descanses.", tag: "buenas_noches", vibrate: [100, 80, 100, 80, 100] }),
};
// Un tipo que esta función todavía no conoce: aviso genérico (nunca un "te extraño" que nadie mandó)
const GENERICO = (n: string): Mensaje => ({ title: `💗 ${n} te mandó algo`, body: "Entra a verlo.", url: "/" });

// Juegos (los mismos que en public/juegos/): nombre y cómo se lee el puntaje
const puntos = (n: number) => `${n.toLocaleString("es")} ${n === 1 ? "punto" : "puntos"}`;
const JUEGOS: Record<string, { nombre: string; marca: (n: number) => string }> = {
  corazones: { nombre: "Atrapa los corazones", marca: puntos },
  vuelo: { nombre: "Vuelo hasta ti", marca: (n) => `${n.toLocaleString("es")} km` },
  memoria: { nombre: "Memoria de nosotros", marca: puntos },
  fusion: { nombre: "Fusión de corazones", marca: puntos },
};

// Ánimos (los mismos que en public/app.js). `abrazo`: el aviso sugiere mandar uno.
const ESTADOS: Record<string, { emoji: string; frase: string; abrazo?: boolean }> = {
  feliz: { emoji: "😊", frase: "está feliz" },
  amor: { emoji: "🥰", frase: "anda con mucho amor" },
  calma: { emoji: "😌", frase: "está en calma" },
  sueno: { emoji: "😴", frase: "tiene sueño" },
  extrano: { emoji: "🥺", frase: "te está extrañando", abrazo: true },
  triste: { emoji: "😢", frase: "está triste", abrazo: true },
  estres: { emoji: "😤", frase: "tiene estrés", abrazo: true },
  malestar: { emoji: "🤒", frase: "no se siente bien", abrazo: true },
  celebrar: { emoji: "🥳", frase: "tiene ganas de celebrar" },
};

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
  if (ev.tipo === "libre") {
    // ¿Hasta qué hora está libre? Se muestra en la hora local de quien recibe.
    const [{ data: d }, tz] = await Promise.all([
      sb.from("disponibilidad").select("hasta").eq("usuario_id", ev.de_usuario).maybeSingle(),
      tzDe(otroId),
    ]);
    mensaje = {
      title: `${nombre} está libre para una llamada ☎️`,
      body: d?.hasta ? `Hasta las ${horaEn(d.hasta, tz)} (tu hora). ¿Hablamos?` : "¿Hablamos?",
      tag: "libre",
      ttl: 2 * 3600, // "estoy libre" dura 2 h: después ya no sirve que llegue
    };
  } else if (ev.tipo === "animo") {
    const { data: a } = await sb.from("animos").select("estado, nota").eq("usuario_id", ev.de_usuario).maybeSingle();
    const e = ESTADOS[a?.estado ?? ""] ?? { emoji: "💗", frase: "compartió cómo se siente" };
    const sugerencia = e.abrazo ? "Mándale un abrazo 🤗" : "Entra a ver cómo está.";
    mensaje = {
      title: `${e.emoji} ${nombre} ${e.frase}`,
      body: a?.nota ? `“${a.nota}” · ${sugerencia}` : sugerencia,
      tag: "animo",
    };
  } else if (ev.tipo === "respuesta") {
    // ¿Quien recibe ya respondió ese día? Entonces ya puede leerla; si no, que responda primero.
    const { data: r } = await sb.from("respuestas").select("dia").eq("usuario_id", ev.de_usuario)
      .order("creado_en", { ascending: false }).limit(1).maybeSingle();
    const { count } = r
      ? await sb.from("respuestas").select("dia", { count: "exact", head: true }).eq("usuario_id", otroId).eq("dia", r.dia)
      : { count: 0 };
    mensaje = {
      title: `💭 ${nombre} respondió la pregunta del día`,
      body: (count ?? 0) > 0 ? "Ya puedes leer lo que dijo." : "Responde tú para ver lo que dijo 👀",
      tag: "pregunta",
      url: "/#juntos",
    };
  } else if (ev.tipo === "carta") {
    const [{ data: c }, tz] = await Promise.all([
      sb.from("cartas").select("abrir_en").eq("de_usuario", ev.de_usuario)
        .order("creado_en", { ascending: false }).limit(1).maybeSingle(),
      tzDe(otroId),
    ]);
    const sellada = !!c?.abrir_en && new Date(c.abrir_en) > new Date();
    mensaje = {
      title: sellada ? `💌 ${nombre} te escribió una carta sellada` : `💌 ${nombre} te escribió una carta`,
      body: sellada ? `Podrás abrirla el ${fechaEn(c!.abrir_en!, tz)} (tu hora).` : "Ábrela con calma.",
      tag: "carta",
      url: "/#juntos",
      vibrate: [100, 50, 100, 50, 300],
    };
  } else if (ev.tipo === "momento") {
    const { data: m } = await sb.from("momentos").select("texto").eq("de_usuario", ev.de_usuario)
      .order("creado_en", { ascending: false }).limit(1).maybeSingle();
    mensaje = { title: `📸 ${nombre} compartió un momento`, body: m?.texto ? `“${m.texto}”` : "Entra a verlo 💗", tag: "momento", url: "/" };
  } else if (ev.tipo === "riego") {
    // ¿Quien recibe ya regó ese día? Entonces los dos lo regaron
    const { data: r } = await sb.from("riegos").select("dia").eq("usuario_id", ev.de_usuario)
      .order("creado_en", { ascending: false }).limit(1).maybeSingle();
    const { count } = r
      ? await sb.from("riegos").select("dia", { count: "exact", head: true }).eq("usuario_id", otroId).eq("dia", r.dia)
      : { count: 0 };
    mensaje = (count ?? 0) > 0
      ? { title: "🌻 ¡Los dos regaron hoy el girasol!", body: "Creció un poquito más 💛", tag: "girasol", url: "/#juntos" }
      : { title: `💧 ${nombre} regó nuestro girasol`, body: "¡Te toca a ti!", tag: "girasol", url: "/#juntos" };
  } else if (ev.tipo === "vale") {
    const { data: v } = await sb.from("vales").select("emoji, texto").eq("de_usuario", ev.de_usuario)
      .order("creado_en", { ascending: false }).limit(1).maybeSingle();
    mensaje = { title: `🎟️ ${nombre} te regaló un vale`, body: v ? `${v.emoji} ${v.texto}` : "Entra a verlo 💗", tag: "vale", url: "/#juntos", vibrate: [80, 60, 80, 60, 200] };
  } else if (ev.tipo === "canje") {
    // El vale canjeado lo había regalado quien recibe este aviso
    const { data: v } = await sb.from("vales").select("emoji, texto").eq("de_usuario", otroId)
      .not("canjeado_en", "is", null).order("canjeado_en", { ascending: false }).limit(1).maybeSingle();
    mensaje = { title: `🎟️ ${nombre} canjeó tu vale`, body: v ? `${v.emoji} ${v.texto} 💗` : "¡Cumple lo prometido! 💗", tag: "canje", url: "/#juntos" };
  } else if (ev.tipo === "razon") {
    mensaje = { title: `🫙 ${nombre} echó una razón nueva al frasco`, body: "Sácala cuando quieras 💌", tag: "frasco", url: "/#juntos" };
  } else if (ev.tipo === "latido") {
    mensaje = { title: `💓 ${nombre} te mandó su latido`, body: "Entra y mantén el corazón presionado para mandarle el tuyo.", tag: "latido", vibrate: [120, 120, 120, 500, 120, 120, 120, 500] };
  } else if (ev.tipo === "notita") {
    const { data: n } = await sb.from("notitas").select("texto").eq("de_usuario", ev.de_usuario)
      .order("creado_en", { ascending: false }).limit(1).maybeSingle();
    mensaje = { title: `📝 ${nombre} te dejó una notita`, body: n?.texto ?? "Está pegada en tu Inicio 💗", tag: "notita", url: "/" };
  } else if (ev.tipo === "cancion") {
    const { data: c } = await sb.from("canciones").select("titulo").eq("de_usuario", ev.de_usuario)
      .order("creado_en", { ascending: false }).limit(1).maybeSingle();
    mensaje = { title: `🎶 ${nombre} te dedicó una canción`, body: c?.titulo ?? "Entra a escucharla 💗", tag: "cancion", url: "/" };
  } else if (ev.tipo === "a_dormir") {
    // ¿Quien recibe ya está acostado? Entonces ahora duermen juntos
    const desde = new Date(Date.now() - 14 * 3600_000).toISOString();
    const { count } = await sb.from("noches").select("id", { count: "exact", head: true })
      .eq("usuario_id", otroId).is("fin", null).gte("inicio", desde);
    mensaje = (count ?? 0) > 0
      ? { title: `🌙 ${nombre} ya se acostó contigo`, body: "Ahora sí, a dormir juntos 💤 Que sueñen bonito.", tag: "noche", url: "/", vibrate: [60, 80, 60] }
      : { title: `🌙 ${nombre} se fue a la camita`, body: "Te espera para dormir juntos 💤", tag: "noche", url: "/", vibrate: [60, 80, 60] };
  } else if (ev.tipo === "despierto") {
    const { data: n } = await sb.from("noches").select("sueno").eq("usuario_id", ev.de_usuario)
      .not("fin", "is", null).order("fin", { ascending: false }).limit(1).maybeSingle();
    mensaje = {
      title: `☀️ ${nombre} despertó y te da los buenos días`,
      body: n?.sueno ? `Soñó: “${n.sueno}”` : "Que tengas un día precioso 💛",
      tag: "despierto", url: "/", vibrate: [100, 80, 100, 80, 100],
    };
  } else if (ev.tipo === "record" || ev.tipo === "reto") {
    // La partida de la que se trata es la última que guardó quien manda el aviso
    const { data: p } = await sb.from("partidas").select("juego, puntos").eq("usuario_id", ev.de_usuario)
      .order("creado_en", { ascending: false }).limit(1).maybeSingle();
    const j = JUEGOS[p?.juego ?? ""] ?? { nombre: "un juego", marca: puntos };
    const marca = p ? j.marca(p.puntos) : "";
    if (ev.tipo === "record") {
      // ¿Con ESTE récord se ganó también tu premio secreto? El trigger marca ganado_en y crea este evento en la
      // misma transacción (los dos con now()): coinciden exacto. Una ventana de minutos atraparía un premio de antes.
      const { count } = await sb.from("premios").select("id", { count: "exact", head: true })
        .eq("de_usuario", otroId).eq("ganado_en", ev.creado_en);
      mensaje = {
        title: `🏆 ${nombre} te quitó el récord en ${j.nombre}`,
        body: (marca ? `Hizo ${marca}` : "Te superó") + ((count ?? 0) > 0 ? " y se ganó tu premio secreto 💌" : "") + ". ¿Revancha? 🔥",
        tag: "record", url: "/#juegos", vibrate: [120, 60, 120, 60, 320],
      };
    } else {
      mensaje = {
        title: `😏 ${nombre} te reta en ${j.nombre}`,
        body: marca ? `Hizo ${marca}. ¿Le ganas?` : "¿Le ganas?",
        tag: "reto", url: "/#juegos", vibrate: [80, 60, 80],
      };
    }
  } else if (ev.tipo === "foco" || ev.tipo === "foco_empieza") {
    // El rato de foco del que se trata es el último de la pareja
    const { data: f } = await sb.from("focos").select("minutos, rondas, tareas")
      .eq("pareja_id", ev.pareja_id).order("creado_en", { ascending: false }).limit(1).maybeSingle();
    const tarea = (f?.tareas as Record<string, string> | null)?.[ev.de_usuario];
    const plan = f ? `${f.minutos} min${f.rondas > 1 ? ` × ${f.rondas} rondas` : ""}` : "Un rato";
    mensaje = ev.tipo === "foco"
      ? { title: `📚 ${nombre} quiere concentrarse contigo`, body: `${plan}${tarea ? ` · ${tarea}` : ""}. Entra y dale a «¡Vamos!»`, tag: "foco", url: "/", vibrate: [60, 60, 60] }
      : { title: `⏳ ${nombre} se sumó: ¡empezó su rato de foco!`, body: `${plan} juntos, cada uno en lo suyo. ¡Ánimo! 💪`, tag: "foco", url: "/", vibrate: [80, 60, 80] };
  } else if (ev.tipo === "sesion" || ev.tipo === "sesion_msj" || ev.tipo === "sesion_fin") {
    // Sesiones de pareja: lo que se escriben no va en el aviso (se vería con el teléfono bloqueado)
    if (ev.tipo === "sesion") {
      mensaje = { title: `💬 ${nombre} abrió una sesión para hablar`, body: "Entra cuando puedas: Claude los acompaña.", tag: "sesion", url: "/#sesion", vibrate: [80, 60, 80] };
    } else if (ev.tipo === "sesion_msj") {
      mensaje = { title: `💬 ${nombre} te escribió en su sesión`, body: "Entra a responderle 💗", tag: "sesion", url: "/#sesion", vibrate: [60, 40, 60] };
    } else {
      const { data: s } = await sb.from("sesiones").select("numero, acuerdo").eq("pareja_id", ev.pareja_id)
        .eq("estado", "cerrada").order("numero", { ascending: false }).limit(1).maybeSingle();
      mensaje = {
        title: `💌 Llegó el resumen de su sesión${s ? ` ${s.numero}` : ""}`,
        body: s?.acuerdo ? `Su acuerdo: ${s.acuerdo.slice(0, 120)}` : "Léanlo con calma.",
        tag: "sesion", url: "/#sesion",
      };
    }
  } else {
    mensaje = (SENALES[ev.tipo] ?? GENERICO)(nombre);
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
