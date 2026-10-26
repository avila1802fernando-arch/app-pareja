// UNO 🃏 · la pantalla
// El juego de cartas en vivo para los dos, cada uno en su teléfono: se juega una del mismo color o número que la de
// arriba (o un comodín); salta y reversa te dejan jugar otra vez, +2 y +4 hacen robar al otro, y cuando te queda una
// hay que decir "¡UNO!" (si te pillan sin decirlo, robas dos). Antes de empezar se puede apostar algo.
// La base (supabase/uno.sql) baraja, reparte y revisa cada jugada; las manos son secretas. Por el tiempo real llegan
// las jugadas del otro y se sabe si tiene la mesa abierta; si no, se le puede avisar.
// Las mismas reglas en JavaScript (uno-motor.js) sirven para practicar contra la compu y para probar en el computador
// sin la base: NosotrosJuegos.probar("uno") en una pestaña y probar("uno", { soy: "otro" }) en otra.
// sala.js la carga y la conecta con Uno.iniciar(ctx); la tarjeta de la pestaña Juegos sale de Uno.tarjeta().
// La pantalla usa el marco de los juegos (.jv) y las piezas comunes de la batalla naval (bn-…: el cuerpo, el turno,
// la apuesta y los avisos); uno.css pone los colores de la mesa y las cartas.
(() => {
  "use strict";
  const U = window.UnoMotor;
  if (!U) return;
  const { NOMBRE_COLOR, esComodin, nombreCarta } = U;
  const COMPU = "compu";
  const IDEAS = [
    "Quien pierde canta una canción en la próxima llamada 🎤",
    "Quien gana elige la película de esta noche 🎬",
    "Quien pierde cocina cuando nos veamos 🍳",
    "Quien pierde da un masaje de 10 minutos cuando nos veamos 💆",
    "Quien pierde escribe una carta de amor 💌",
    "Quien pierde manda una foto chistosa 🤪",
  ];
  const ICONO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.2" y="5.2" width="10" height="14.5" rx="2" transform="rotate(-12 8.2 12.4)"/><rect x="10.8" y="4.3" width="10" height="14.5" rx="2" transform="rotate(10 15.8 11.5)"/><circle cx="15.7" cy="11.6" r="2.6"/></svg>';
  const X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>';
  const SONIDO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
  const MUDO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
  // los símbolos de salta y reversa (en las cartas)
  const SIMBOLO = {
    s: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/><path d="M6.8 17.2 17.2 6.8"/></svg>',
    r: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9.5h11.5l-3-3M19 14.5H7.5l3 3"/></svg>',
  };

  let ctx = null;            // lo que pasa sala.js: sb, prueba, yo, otro, parejaId, toast, lluvia, vibrar, renderAvatares, alCambiar
  let vivo = null;           // la partida con tu pareja: Supabase (o una mesa local entre dos pestañas, en modo prueba)
  let compu = null;          // la práctica contra la compu (en memoria)
  let resumen = { activa: null, historial: [] }; // lo que muestra la tarjeta
  let presente = false;      // ¿tu pareja tiene la mesa abierta ahora mismo?
  let V = null, E = null;    // la vista abierta y su estado

  // ---------- utilidades ----------
  function nodo(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function boton(cls, txt, fn, foco) {
    const b = nodo("button", cls, txt); b.type = "button";
    if (fn) b.addEventListener("click", fn);
    if (foco) b.dataset.foco = foco; // para devolverle el foco después de volver a dibujar
    return b;
  }
  const yo = () => ctx.yo.id;
  const nombreOtro = () => (E && E.modo === "compu" ? "la compu" : ctx.otro.nombre);
  const mayus = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const toast = (m) => { if (ctx && ctx.toast) ctx.toast(m); };
  const vibrar = (p) => { try { if (ctx && ctx.vibrar) ctx.vibrar(p); else if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };
  const poco = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const anotar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const vistaAbierta = () => !!V && !V.raiz.hidden && !!E;
  const enJuego = (j) => !!j && j.estado === "jugando";
  const hora = (iso) => new Date(iso).getTime() || 0;
  // las cartas que están en `a` y no en `b` (contando repetidas)
  const diferencia = (a, b) => { const r = b.slice(); return a.filter((x) => { const i = r.indexOf(x); if (i >= 0) { r.splice(i, 1); return false; } return true; }); };
  // Lo que se anima al cambiar (una carta que llega, el turno) sigue su animación aunque la pantalla se vuelva a
  // dibujar: --d (en batalla.css y uno.css) adelanta la animación lo que ya pasó
  function reciente(el, desde, ms, clase) {
    const t = Date.now() - (desde || 0);
    if (!desde || t > ms || poco()) return;
    el.classList.add(clase);
    el.style.setProperty("--d", `${-t}ms`);
  }

  // ---------- sonido (Web Audio, sin archivos; el mismo "silencio" que los demás juegos) ----------
  let AC = null;
  const mudo = () => leer("juegos-mudo") === "1";
  function activarAudio() {
    try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume(); } catch (e) { AC = null; }
  }
  function tono(f, dur, tipo, vol, hacia, retraso) {
    if (mudo() || !AC) return;
    try {
      const t0 = AC.currentTime + (retraso || 0), o = AC.createOscillator(), g = AC.createGain();
      o.type = tipo || "sine"; o.frequency.setValueAtTime(f, t0);
      if (hacia) o.frequency.exponentialRampToValueAtTime(hacia, t0 + dur);
      g.gain.setValueAtTime(vol || 0.06, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(AC.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) {}
  }
  const SON = {
    carta: () => { tono(900, 0.07, "triangle", 0.035, 520); tono(420, 0.06, "sine", 0.025, 300, 0.05); },
    robar: () => tono(380, 0.09, "triangle", 0.035, 640),
    mas: () => { tono(160, 0.3, "sawtooth", 0.06, 70); tono(240, 0.18, "square", 0.025, 120, 0.08); },
    uno: () => [660, 880, 1320].forEach((f, i) => tono(f, 0.12, "triangle", 0.06, 0, i * 0.09)),
    pillado: () => { tono(300, 0.16, "square", 0.04, 200); tono(220, 0.24, "square", 0.04, 140, 0.16); },
    turno: () => { tono(880, 0.09, "triangle", 0.05); tono(1175, 0.14, "triangle", 0.05, 0, 0.09); },
    color: () => tono(740, 0.12, "sine", 0.04, 990),
    gana: () => [523, 659, 784, 1046].forEach((f, i) => tono(f, i === 3 ? 0.45 : 0.15, "triangle", 0.07, 0, 0.3 + i * 0.14)),
    pierde: () => [392, 330, 262].forEach((f, i) => tono(f, i === 2 ? 0.4 : 0.2, "triangle", 0.05, 0, 0.3 + i * 0.2)),
  };

  // ---------- adaptadores: la misma forma para la base, la mesa entre pestañas y la compu ----------
  // activa, historial, crear, jugar, robar, pasar, decir, pillar, rendirse, miMano, manoRival, avisar; escuchar(fn)
  // avisa ("uno", fila), ("jugada", jugada) y ("presencia", ¿el otro tiene la mesa abierta?); presencia(si) y apagar().
  function adaptadorSupabase(sb, yoId, parejaId) {
    const conError = (r) => { if (r.error) throw r.error; return r.data; };
    const fila = (d) => (d && d.id ? d : null); // una función que no encuentra nada devuelve una fila vacía
    const oyentes = new Set();
    const emitir = (tipo, f) => oyentes.forEach((fn) => fn(tipo, f));
    let canal = null, viendo = false;
    function abrirCanal() {
      if (canal) sb.removeChannel(canal);
      const c = sb.channel(`uno-${parejaId}`, { config: { presence: { key: yoId } } });
      canal = c;
      c.on("postgres_changes", { event: "*", schema: "public", table: "unos", filter: `pareja_id=eq.${parejaId}` },
        (p) => { if (p.new && p.new.id) emitir("uno", p.new); })
        // sin filtro: RLS solo deja pasar las jugadas de nuestras partidas
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "uno_jugadas" },
          (p) => { if (p.new && p.new.id) emitir("jugada", p.new); })
        // quién tiene la mesa abierta (cada uno se anota con track mientras la mira)
        .on("presence", { event: "sync" }, () => {
          const st = c.presenceState();
          emitir("presencia", Object.keys(st).some((k) => k !== yoId && st[k].length > 0));
        })
        .subscribe((estado) => { if (estado === "SUBSCRIBED" && viendo) c.track({ viendo: true }).catch(() => {}); });
    }
    const rpc = async (nombre, args) => conError(await sb.rpc(nombre, args));
    return {
      modo: "vivo",
      async activa() {
        return conError(await sb.from("unos").select("*").eq("pareja_id", parejaId).eq("estado", "jugando")
          .order("creado_en", { ascending: false }).limit(1))[0] || null;
      },
      async historial() {
        return conError(await sb.from("unos").select("id, estado, creado_por, rival, ganador, puntos, rendido, apuesta, creado_en, actualizado_en")
          .eq("pareja_id", parejaId).eq("estado", "terminada").order("actualizado_en", { ascending: false }).limit(300)) || [];
      },
      async crear(apuesta) { return fila(await rpc("uno_crear", { p_apuesta: apuesta || null })); },
      async jugar(id, carta, color) { return (await rpc("uno_jugar", { p_id: id, p_carta: carta, p_color: color || null })) || null; },
      async robar(id) { return (await rpc("uno_robar", { p_id: id })) || null; },
      async pasar(id) { return (await rpc("uno_pasar", { p_id: id })) || null; },
      async decir(id) { return fila(await rpc("uno_decir", { p_id: id })); },
      async pillar(id) { return fila(await rpc("uno_pillar", { p_id: id })); },
      async rendirse(id) { return fila(await rpc("uno_rendirse", { p_id: id })); },
      async miMano(id) {
        const d = conError(await sb.from("uno_manos").select("cartas, robada").eq("juego_id", id).eq("usuario_id", yoId).maybeSingle());
        return d ? { cartas: d.cartas || [], robada: d.robada || null } : null;
      },
      async manoRival(id) { return (await rpc("uno_mano_rival", { p_id: id })) || null; },
      async avisar(id) { return (await rpc("uno_avisar", { p_id: id })) === true; },
      escuchar(fn) { oyentes.add(fn); if (!canal) abrirCanal(); return () => oyentes.delete(fn); },
      reabrir() { if (!canal || canal.state === "closed" || canal.state === "errored") abrirCanal(); },
      presencia(si) {
        if (viendo === si) return;
        viendo = si;
        if (canal && canal.state === "joined") (si ? canal.track({ viendo: true }) : canal.untrack()).catch(() => {});
      },
      apagar() { if (canal) sb.removeChannel(canal); canal = null; oyentes.clear(); },
    };
  }
  // Modo prueba: dos pestañas del mismo computador (localStorage + BroadcastChannel), sin la base
  function adaptadorPrueba(yoId, otroId) {
    const CLAVE = "uno-prueba";
    let bc = null, alCambio = null, viendo = false;
    try { bc = new BroadcastChannel(CLAVE); } catch (e) {}
    const enviar = (m) => { try { if (bc) bc.postMessage(m); } catch (e) {} };
    const mesa = U.mesaLocal({
      yo: yoId, otro: otroId,
      guardar: (l) => anotar(CLAVE, JSON.stringify(l)),
      cargar: () => { try { return JSON.parse(leer(CLAVE) || "[]"); } catch (e) { return []; } },
      avisar: enviar,
      escucharCambios: (fn) => { alCambio = fn; },
    });
    const escucharMesa = mesa.escuchar, presencias = new Set();
    // la presencia va por el mismo canal: "¿quién está mirando?" y "estoy / ya no estoy mirando"
    if (bc) bc.onmessage = (e) => {
      const m = e.data || {};
      if (m.tipo === "quien") { if (viendo) enviar({ tipo: "presencia", fila: { quien: yoId, viendo: true } }); return; }
      if (m.tipo === "presencia") { if (m.fila && m.fila.quien === otroId) presencias.forEach((fn) => fn("presencia", !!m.fila.viendo)); return; }
      if (alCambio) alCambio(m);
    };
    const salir = () => { if (viendo) enviar({ tipo: "presencia", fila: { quien: yoId, viendo: false } }); };
    window.addEventListener("pagehide", salir);
    enviar({ tipo: "quien" });
    return Object.assign(mesa, {
      modo: "vivo",
      escuchar(fn) { const quitar = escucharMesa(fn); presencias.add(fn); return () => { quitar(); presencias.delete(fn); }; },
      presencia(si) { if (viendo === si) return; viendo = si; enviar({ tipo: "presencia", fila: { quien: yoId, viendo: si } }); },
      async avisar() { return true; },
      apagar() { salir(); window.removeEventListener("pagehide", salir); presencias.clear(); if (bc) bc.close(); bc = null; },
    });
  }
  function adaptadorCompu() {
    let memoria = [];
    const mesa = U.mesaLocal({ yo: yo(), otro: COMPU, compu: COMPU, guardar: (l) => (memoria = l), cargar: () => memoria });
    return Object.assign(mesa, { presencia() {}, async avisar() { return false; }, apagar() {} });
  }

  // ---------- lo que se sabe de una partida ----------
  const soyParte = (j) => !!j && (j.creado_por === yo() || j.rival === yo());
  const rivalDe = (j) => (j.creado_por === yo() ? j.rival : j.creado_por);
  const cuantasDe = (j, id) => (j && j.cartas && j.cartas[id]) || 0;
  const valorTexto = (c) => { const v = U.valorDe(c); return v === "s" ? "salta" : v === "r" ? "reversa" : v === "d" ? "+2" : v; };

  // ---------- la tarjeta de la pestaña Juegos ----------
  function textoTarjeta() {
    const j = resumen.activa, o = ctx.otro.nombre;
    if (j && soyParte(j)) {
      if (j.jugadas === 0 && j.creado_por !== yo()) {
        return [`🃏 ${o} te retó a un UNO`, j.apuesta ? `Se juegan: «${j.apuesta}»` : j.turno === yo() ? "Ya están las cartas: empiezas tú" : "Ya están repartidas las cartas"];
      }
      const n = cuantasDe(j, rivalDe(j));
      if (j.turno === yo()) return ["🃏 ¡Te toca jugar!", `A ${o} le ${n === 1 ? "queda una carta" : `quedan ${n} cartas`}`];
      return [`Le toca a ${o}`, presente ? `${o} está pensando… 👀` : "Entra a ver cómo va la partida"];
    }
    const u = resumen.historial[0];
    if (u && Date.now() - hora(u.actualizado_en) < 36 * 3600000) {
      return [u.ganador === yo() ? "Ganaste la última mano 🏆" : `${o} ganó la última 😏`, presente ? `🟢 ${o} está mirando la mesa ahora` : "¿Revancha?"];
    }
    return [`Reta a ${o} a un UNO 🃏`, presente ? `🟢 ${o} está mirando la mesa ahora` : "En vivo, cada uno en su teléfono"];
  }
  // "Manos ganadas · Tú 3 · Martina 2" (con `extra`, la que acaba de terminar aunque el historial no la tenga aún)
  function historialCon(extra) {
    const h = resumen.historial;
    return extra && extra.estado === "terminada" && !h.some((x) => x.id === extra.id) ? [extra].concat(h) : h;
  }
  function marcadorTexto(extra) {
    const h = historialCon(extra);
    if (!h.length) return null;
    const mias = h.filter((x) => x.ganador === yo()).length;
    return `Manos ganadas · Tú ${mias} · ${ctx.otro.nombre} ${h.length - mias}`;
  }
  function puntosTexto(extra) {
    const h = historialCon(extra);
    const suma = (quien) => h.filter((x) => x.ganador === quien).reduce((s, x) => s + (x.puntos || 0), 0);
    const a = suma(yo()), b = h.reduce((s, x) => s + (x.puntos || 0), 0) - a;
    return a || b ? `Puntos de todas las manos · Tú ${a} · ${ctx.otro.nombre} ${b}` : null;
  }
  function tarjeta() {
    if (!ctx) return null;
    const activa = resumen.activa && soyParte(resumen.activa) ? resumen.activa : null;
    const toca = !!activa && activa.turno === yo();
    const b = boton(`j-carta bn-carta uno-tarjeta${toca ? " toca" : ""}`);
    const ico = nodo("span", "j-icono"); ico.innerHTML = ICONO;
    const info = nodo("span", "j-info");
    const [t1, t2] = textoTarjeta();
    const nombre = nodo("strong", "j-nombre", "UNO ");
    nombre.append(nodo("span", `bn-vivo${activa || presente ? " encendido" : ""}`, "En vivo"));
    info.append(nombre, nodo("small", "j-lema", "Las cartas de siempre, los dos a la vez: del mismo color o número, +2, +4… y no te olvides de decir «¡UNO!»."));
    const estado = nodo("span", "bn-estado-carta");
    estado.append(nodo("b", null, t1), nodo("small", null, t2));
    info.append(estado);
    const m = marcadorTexto();
    if (m) info.append(nodo("span", "j-hoy", m));
    b.append(ico, info, nodo("span", "j-jugar", toca ? "¡Vamos!" : activa ? "Volver" : "Jugar"));
    b.setAttribute("aria-label", `UNO, en vivo. ${t1}. ${t2}.${m ? ` ${m}.` : ""}`);
    b.addEventListener("click", () => abrir("vivo"));
    return b;
  }

  async function refrescarResumen() {
    if (!vivo) return;
    try {
      const [activa, historial] = await Promise.all([vivo.activa(), vivo.historial()]);
      resumen = { activa, historial };
    } catch (e) { /* sin red: se queda lo que había y se reintenta al volver */ }
    if (ctx.alCambiar) ctx.alCambiar();
  }

  // Lo que llega de la base (o de la otra pestaña): la tarjeta, los avisos y, si está abierta, la mesa
  function alLlegar(tipo, f) {
    const mirando = vistaAbierta() && E.modo === "vivo";
    if (tipo === "presencia") {
      if (presente === f) return;
      presente = f;
      if (ctx.alCambiar) ctx.alCambiar();
      if (vistaAbierta()) pintar();
      return;
    }
    if (tipo === "uno") {
      const antes = resumen.activa && resumen.activa.id === f.id ? resumen.activa : null;
      if (enJuego(f)) resumen.activa = f;
      else {
        if (resumen.activa && resumen.activa.id === f.id) resumen.activa = null;
        if (f.estado === "terminada") resumen.historial = [f].concat(resumen.historial.filter((h) => h.id !== f.id));
      }
      if (!mirando && soyParte(f)) avisoFuera(antes, f);
      if (ctx.alCambiar) ctx.alCambiar();
      if (vistaAbierta() && !mirando) pintar(); // practicando con la compu: el aviso para volver
    }
    if (mirando) alLlegarVista(tipo, f);
  }
  // Con la mesa cerrada (o practicando con la compu), lo importante llega como aviso en la app
  function avisoFuera(antes, f) {
    const o = ctx.otro.nombre;
    if (!antes && enJuego(f) && f.creado_por !== yo() && f.jugadas === 0) { toast(`🃏 ${o} te retó a un UNO`); vibrar([80, 60, 80]); }
    else if (!antes) return;
    else if (enJuego(f) && f.turno === yo() && antes.turno !== yo()) { toast("🃏 Te toca jugar en el UNO"); vibrar([40, 30, 40]); }
    else if (f.estado === "terminada" && antes.estado === "jugando") toast(f.ganador === yo() ? `🏆 ¡Ganaste la mano de UNO!${f.rendido ? ` ${o} se rindió` : ""}` : `${o} ganó la mano de UNO 😏 ¿Revancha?`);
    else if (f.estado === "cancelada") toast("El reto de UNO quedó cancelado");
  }
  function alLlegarVista(tipo, f) {
    if (E.cola) { E.cola.push([tipo, f]); return; } // cargando: se aplica al terminar
    if (tipo === "uno") ponerPartida(f);
    else if (tipo === "jugada") recibirJugada(f);
  }

  // ---------- la vista (pantalla completa, con el marco de los demás juegos) ----------
  function montarVista() {
    if (V) return;
    V = {};
    const raiz = nodo("div", "jv bn uno"); raiz.hidden = true;
    raiz.setAttribute("role", "dialog"); raiz.setAttribute("aria-modal", "true"); raiz.setAttribute("aria-labelledby", "uno-titulo");
    const marco = nodo("div", "jv-marco bn-marco");
    const barra = nodo("header", "jv-barra");
    V.cerrar = boton("jv-boton", null, () => salir()); V.cerrar.innerHTML = X_SVG; V.cerrar.setAttribute("aria-label", "Volver a los juegos");
    V.titulo = nodo("h2", "jv-titulo", "UNO"); V.titulo.id = "uno-titulo";
    V.sonido = boton("jv-boton", null, () => { anotar("juegos-mudo", mudo() ? "0" : "1"); pintarSonido(); activarAudio(); });
    barra.append(V.cerrar, V.titulo, V.sonido);
    V.cuerpo = nodo("div", "bn-cuerpo");
    V.capa = nodo("div", "uno-capa"); // para elegir el color de un comodín
    V.voz = nodo("p", "sr"); V.voz.setAttribute("aria-live", "polite"); // lo importante, para el lector de pantalla
    marco.append(barra, V.cuerpo, V.capa, V.voz);
    raiz.append(marco);
    document.body.append(raiz);
    V.raiz = raiz;
    raiz.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (E && E.eligiendo) { E.eligiendo = null; pintar(); } else salir();
    });
    pintarSonido();
  }
  function pintarSonido() {
    V.sonido.innerHTML = mudo() ? MUDO : SONIDO;
    V.sonido.setAttribute("aria-label", mudo() ? "Activar el sonido" : "Silenciar el sonido");
    V.sonido.setAttribute("aria-pressed", String(mudo()));
  }
  function decir(t) { if (V) V.voz.textContent = t; }
  function fondoInerte(si) { ["app", "tabs"].forEach((id) => { const e = document.getElementById(id); if (e) e.inert = si; }); }

  function nuevoEstado(modo) {
    return {
      modo, mesa: modo === "compu" ? compu : vivo, partida: null, mano: [], robada: null, manoRival: null, mensaje: "",
      eligiendo: null, ocupado: false, arribaEn: 0, turnoEn: 0, nuevas: null, vistas: new Set(),
      apuesta: "", revancha: false, error: null, avisadoEn: 0, cola: null,
    };
  }
  async function abrir(modo) {
    if (!ctx || !vivo) return;
    montarVista();
    activarAudio();
    if (modo === "compu" && !compu) {
      compu = adaptadorCompu();
      compu.escuchar((tipo, f) => { if (vistaAbierta() && E.modo === "compu") alLlegarVista(tipo, f); });
    }
    E = nuevoEstado(modo);
    const e = E;
    if (V.raiz.hidden) {
      V.foco = document.activeElement;
      V.raiz.hidden = false;
      document.body.classList.add("con-juego");
      fondoInerte(true);
      history.pushState({ uno: true }, ""); // "atrás" en Android cierra la mesa
    }
    vivo.presencia(modo === "vivo" && !document.hidden);
    V.raiz.dataset.modo = modo;
    V.titulo.textContent = modo === "compu" ? "UNO · práctica" : "UNO";
    delete V.raiz.dataset.fase;
    V.cuerpo.innerHTML = ""; V.capa.innerHTML = "";
    V.cuerpo.append(nodo("p", "bn-cargando", "Barajando las cartas…"));
    await cargarPartida();
    if (E !== e) return;
    if (modo === "compu" && !E.partida && !E.error) {
      const j = await compu.crear(null); // contra la compu se empieza al tiro
      if (E !== e) return;
      if (!E.partida) ponerPartida(j);
    }
    if (modo === "compu") compu.reanudar();
    pintar();
    const p = V.cuerpo.querySelector(".bn-principal:not([disabled]), .uno-mano .puede") || V.cerrar;
    p.focus({ preventScroll: true });
  }
  // Trae la partida en curso y mi mano. Lo que llegue por el tiempo real mientras tanto se guarda en E.cola y se
  // aplica después (si no, una jugada podía perderse entre la consulta y la respuesta).
  async function cargarPartida() {
    const e = E;
    E.cola = [];
    try {
      let j = await E.mesa.activa();
      // la que estabas jugando terminó mientras no mirabas: se muestra cómo terminó
      if (!j && enJuego(E.partida)) j = (await E.mesa.historial()).find((h) => h.id === E.partida.id) || null;
      const [m, rival] = j ? await Promise.all([E.mesa.miMano(j.id), j.estado === "terminada" ? E.mesa.manoRival(j.id) : null]) : [null, null];
      if (E !== e) return;
      const misma = !!E.partida && !!j && E.partida.id === j.id;
      Object.assign(E, {
        partida: j, mano: m ? m.cartas : [], robada: m ? m.robada : null, manoRival: rival, error: null,
        eligiendo: misma ? E.eligiendo : null, mensaje: misma ? E.mensaje : "",
      });
    } catch (er) {
      if (E !== e) return;
      E.error = "No se pudo abrir la mesa. Revisa tu conexión e intenta de nuevo.";
    }
    const cola = E.cola;
    E.cola = null;
    cola.forEach(([tipo, f]) => alLlegarVista(tipo, f));
  }
  async function recargar() { const e = E; await cargarPartida(); if (E === e) pintar(); }
  // la mano cambió por algo del otro (+2, +4, me pillaron) o por robar: se trae de nuevo
  async function cargarMano() {
    const e = E, j = E.partida;
    if (!j) return;
    let m = null;
    try { m = await E.mesa.miMano(j.id); } catch (er) { return; }
    if (E !== e || !m || !E.partida || E.partida.id !== j.id) return;
    const nuevas = diferencia(m.cartas, E.mano);
    if (nuevas.length && E.mano.length) E.nuevas = { cartas: nuevas, en: Date.now() };
    E.mano = m.cartas; E.robada = m.robada;
    pintar();
  }
  function salir() {
    if (!(history.state && history.state.uno)) { cerrar(); return; }
    history.back(); // → popstate → cerrar
    setTimeout(() => { if (vistaAbierta() && history.state && history.state.uno) cerrar(); }, 500); // por si el navegador no vuelve
  }
  function cerrar() {
    if (!V || V.raiz.hidden) return;
    V.raiz.hidden = true;
    V.capa.innerHTML = "";
    document.body.classList.remove("con-juego");
    fondoInerte(false);
    if (vivo) vivo.presencia(false);
    E = null;
    refrescarResumen();
    if (V.foco && V.foco.focus && document.contains(V.foco)) V.foco.focus({ preventScroll: true });
  }

  // La fase según lo que se sabe
  function fase() {
    if (E.error) return "error";
    if (!E.partida) return "reto";
    return enJuego(E.partida) ? "juego" : "fin";
  }
  const PINTAR = {};
  function pintar() {
    if (!vistaAbierta() || E.cola) return; // (cargando: se dibuja al terminar)
    const a = document.activeElement, foco = a && V.raiz.contains(a) ? a.dataset.foco : null;
    const f = fase(), y = V.cuerpo.scrollTop, otraFase = V.raiz.dataset.fase !== f;
    V.raiz.dataset.fase = f;
    V.cuerpo.innerHTML = ""; V.capa.innerHTML = "";
    if (E.modo === "compu") avisoDesdeCompu();
    PINTAR[f]();
    if (f === "juego" && E.eligiendo) V.capa.append(elegirColor());
    V.cuerpo.scrollTop = otraFase ? 0 : y;
    if (ctx.renderAvatares) ctx.renderAvatares();
    if (foco) { const n = V.raiz.querySelector(`[data-foco="${foco}"]`); if (n) n.focus({ preventScroll: true }); }
  }
  PINTAR.error = () => {
    V.cuerpo.append(nodo("p", "bn-texto", E.error), boton("jv-jugar bn-principal", "Intentar de nuevo", () => { E.error = null; recargar(); }, "reintentar"));
  };
  // Practicando con la compu, si la partida de verdad te espera, se ofrece volver
  function avisoDesdeCompu() {
    const j = resumen.activa;
    if (!j || !soyParte(j) || j.turno !== yo()) return;
    const d = nodo("div", "bn-volver");
    d.append(nodo("span", null, `🃏 Te toca en el UNO con ${ctx.otro.nombre}`), boton("ghost", "Volver 🃏", () => abrir("vivo"), "volver-vivo"));
    V.cuerpo.append(d);
  }
  function apuestaVer(texto, deuda) { return nodo("p", `bn-apuesta-ver${deuda ? " deuda" : ""}`, texto); }
  function principal(texto, fn, foco) { return boton("jv-jugar bn-principal", texto, fn, foco); }

  // ---------- una carta ----------
  // c: la carta ("r7", "zs", "x4"…); tam: "grande" (el pozo), "chica" (la mano del otro al final) o nada (tu mano)
  function dibujoCarta(c, tam, esBoton) {
    const comodin = esComodin(c), v = U.valorDe(c);
    const el = nodo(esBoton ? "button" : "span", `uno-c c-${comodin ? "x" : c[0]}${tam ? ` ${tam}` : ""}`);
    if (esBoton) el.type = "button";
    const texto = c === "x4" ? "+4" : v === "d" ? "+2" : comodin ? "" : v;
    const esquina = (abajo) => {
      const e = nodo("span", `uno-esq${abajo ? " abajo" : ""}`);
      if (!comodin && SIMBOLO[v]) e.innerHTML = SIMBOLO[v]; else e.textContent = c === "x" ? "✦" : texto;
      e.setAttribute("aria-hidden", "true");
      return e;
    };
    const sello = nodo("span", `uno-sello${comodin ? " rueda" : ""}${v === "6" || v === "9" ? " subraya" : ""}`);
    sello.setAttribute("aria-hidden", "true");
    if (c === "x4") sello.append(nodo("b", null, "+4"));
    else if (!comodin && SIMBOLO[v]) sello.innerHTML = SIMBOLO[v];
    else if (!comodin) sello.textContent = texto;
    el.append(esquina(false), sello, esquina(true));
    el.setAttribute("aria-label", nombreCarta(c));
    return el;
  }
  function dorso(tam) { const d = nodo("span", `uno-c uno-dorso${tam ? ` ${tam}` : ""}`); d.setAttribute("aria-hidden", "true"); return d; }

  // ---------- 1 · retar ----------
  PINTAR.reto = () => {
    const c = V.cuerpo, o = ctx.otro.nombre;
    c.append(nodo("p", "jv-ojo", E.revancha ? "¿Otra?" : "En vivo · cada uno en su teléfono"));
    c.append(nodo("h3", "jv-h", E.revancha ? `La revancha con ${o} 🃏` : `Reta a ${o} a un UNO 🃏`));
    if (!E.revancha) {
      const reglas = nodo("ul", "uno-reglas");
      ["Siete cartas para cada uno. Juega una del mismo color o número que la de arriba, o un comodín.",
        "Salta y reversa te dejan jugar otra vez; con +2 y +4 el otro roba y tú sigues.",
        "Si no tienes ninguna que sirva, robas una.",
        "Cuando te quede una, ¡di UNO! Si te pillan sin decirlo, robas dos.",
        "Gana quien se quede sin cartas, y se lleva los puntos de lo que le quedó al otro."].forEach((t) => reglas.append(nodo("li", null, t)));
      c.append(reglas);
    }
    if (presente) c.append(nodo("p", "bn-presente", `🟢 ${o} está mirando la mesa ahora`));
    const caja = nodo("div", "bn-caja");
    const lab = nodo("label", null, "¿Qué se apuestan? (si quieren)"); lab.htmlFor = "uno-apuesta";
    const t = nodo("textarea", "papel bn-apuesta"); t.id = "uno-apuesta"; t.maxLength = 120; t.rows = 2;
    t.placeholder = "Quien pierde…"; t.value = E.apuesta; t.dataset.foco = "apuesta";
    t.addEventListener("input", () => (E.apuesta = t.value));
    const ideas = nodo("div", "bn-ideas");
    IDEAS.forEach((i, k) => ideas.append(boton("bn-idea", i, () => { t.value = E.apuesta = i; t.focus(); }, `idea-${k}`)));
    caja.append(lab, t, ideas);
    const retar = principal(`Retar a ${o} 🃏`, () => crearPartida(retar, t.value.trim()), "retar");
    c.append(caja, retar, boton("ghost bn-secundario", "Practicar contra la compu 🤖", () => abrir("compu"), "practicar"));
    const m = marcadorTexto();
    if (m) c.append(nodo("p", "small-note", m));
  };
  async function crearPartida(btn, apuesta) {
    const e = E, o = ctx.otro.nombre;
    btn.disabled = true;
    let j = null;
    try { j = await E.mesa.crear(apuesta); if (!j) throw new Error("sin partida"); }
    catch (er) { if (E === e) { toast("No se pudo enviar el reto. Revisa tu conexión."); btn.disabled = false; } return; }
    if (E !== e) return;
    resumen.activa = j;
    if (ctx.alCambiar) ctx.alCambiar();
    if (j.creado_por === yo() && j.jugadas === 0) {
      toast(ctx.prueba ? `(prueba) Reto enviado a ${o}` : `Le avisamos a ${o} 🃏 ¡Ya están las cartas!`);
      ponerPartida(j);
    } else {
      // ya había una en curso (p. ej. el otro retó justo al mismo tiempo): se trae entera
      if (j.creado_por !== yo()) toast(`🃏 ${o} ya te había retado: ¡a jugar!`);
      recargar();
    }
  }

  // ---------- 2 · la mesa ----------
  const puedeRobar = () => { const j = E.partida; return enJuego(j) && j.turno === yo() && !j.robo && !E.ocupado; };
  const puedeDecirUno = () => {
    const j = E.partida;
    return enJuego(j) && E.mano.length > 0 && E.mano.length <= 2 && j.uno_dicho.indexOf(yo()) < 0 && (j.turno === yo() || j.uno_pendiente === yo());
  };
  function puedeJugar(c) {
    const j = E.partida;
    if (j.robo === yo()) return c === E.robada;
    return U.vale(c, j.arriba, j.color);
  }
  PINTAR.juego = () => {
    const c = V.cuerpo, j = E.partida, o = nombreOtro(), mia = j.turno === yo(), nOtro = cuantasDe(j, rivalDe(j));
    // el otro: cuántas cartas tiene (boca abajo) y si dijo "¡UNO!"
    const rival = nodo("div", "uno-rival");
    rival.append(lado(E.modo === "compu" ? null : "suyo", mayus(o), nOtro, !mia, E.modo === "vivo" && presente, j.uno_dicho.indexOf(rivalDe(j)) >= 0));
    const abanico = nodo("div", "uno-abanico");
    abanico.setAttribute("aria-hidden", "true");
    for (let i = 0; i < Math.min(nOtro, 14); i++) abanico.append(dorso("mini"));
    if (nOtro > 14) abanico.append(nodo("span", "uno-mas", `+${nOtro - 14}`));
    rival.append(abanico);
    c.append(rival);
    if (j.uno_pendiente === rivalDe(j)) c.append(boton("jv-jugar bn-principal uno-pillar", `¡${mayus(o)} no dijo UNO! Pillar 👉`, () => accion("pillar"), "pillar"));
    // la mesa: el mazo (tócalo para robar) y la de arriba, con el color que va
    const mesa = nodo("div", "uno-mesa");
    const mazo = boton("uno-mazo", null, () => robar(), "mazo");
    mazo.append(dorso("grande"), nodo("span", "uno-cuenta", String(j.mazo)));
    mazo.disabled = !puedeRobar();
    mazo.setAttribute("aria-label", `Mazo: quedan ${j.mazo}.${puedeRobar() ? " Tócalo para robar una." : ""}`);
    const pozo = nodo("div", `uno-pozo col-${j.color}`);
    const arriba = dibujoCarta(j.arriba, "grande");
    reciente(arriba, E.arribaEn, 600, "llega");
    pozo.append(arriba);
    mesa.append(mazo, pozo);
    c.append(mesa);
    c.append(nodo("p", `uno-color col-${j.color}`, `Va el ${NOMBRE_COLOR[j.color]}`));
    const turno = nodo("p", `bn-turno${mia ? " mio" : ""}`, mia ? "¡Te toca! 🃏" : `Le toca a ${o}…`);
    if (mia) reciente(turno, E.turnoEn, 700, "pop");
    c.append(turno);
    if (!mia && E.modo === "vivo" && !presente) {
      const fuera = nodo("div", "bn-fuera");
      fuera.append(nodo("span", null, `${mayus(o)} no tiene la mesa abierta.`), botonAvisar("🔔 Avisarle que le toca"));
      c.append(fuera);
    }
    c.append(nodo("p", "bn-mensaje", E.mensaje || (mia ? "Toca una carta que sirva o roba del mazo." : `${mayus(o)} está pensando…`)));
    const acciones = nodo("div", "uno-acciones");
    if (puedeDecirUno()) acciones.append(boton("jv-jugar uno-grito", "¡UNO! 📣", () => accion("decir"), "uno"));
    if (mia && j.robo === yo()) acciones.append(boton("ghost", "Pasar ➜", () => accion("pasar"), "pasar"));
    else if (mia) { const r = boton("ghost", "Robar una", () => robar(), "robar"); r.disabled = !puedeRobar(); acciones.append(r); }
    if (acciones.childNodes.length) c.append(acciones);
    c.append(manoDibujada());
    if (j.apuesta && E.modo === "vivo") c.append(nodo("p", "small-note", `Se juegan: «${j.apuesta}»`));
    const sinEmpezar = j.jugadas === 0 && E.modo === "vivo";
    c.append(boton("link", sinEmpezar ? (j.creado_por === yo() ? "Cancelar el reto" : "Rechazar el reto") : "Rendirme 🏳️", () => rendirse(), "rendirse"));
  };
  function lado(av, nombre, n, leToca, enLinea, dijoUno) {
    const s = nodo("div", `bn-lado${leToca ? " toca" : ""}${enLinea ? " en-linea" : ""}`);
    const a = av ? nodo("span", "avatar mini") : nodo("span", "bn-robot", "🤖");
    if (av) a.dataset.av = av;
    a.setAttribute("aria-hidden", "true");
    const t = nodo("span", "bn-lado-txt");
    t.append(nodo("b", null, nombre), nodo("small", null, `${n} ${n === 1 ? "carta" : "cartas"}${dijoUno && n <= 2 ? " · ¡UNO! 📣" : ""}`));
    s.append(a, t);
    if (enLinea) s.title = "Tiene la mesa abierta";
    return s;
  }
  function manoDibujada() {
    const j = E.partida, mia = enJuego(j) && j.turno === yo() && !E.ocupado;
    const caja = nodo("div", `uno-mano${mia ? " mi-turno" : ""}`);
    caja.setAttribute("role", "group");
    caja.setAttribute("aria-label", `Tus cartas (${E.mano.length})`);
    const nuevas = E.nuevas && Date.now() - E.nuevas.en < 1200 ? E.nuevas.cartas.slice() : [];
    let robadaMarcada = false;
    U.ordenar(E.mano).forEach((c, i) => {
      const b = dibujoCarta(c, null, true), puede = mia && puedeJugar(c);
      b.dataset.foco = `carta-${i}`;
      if (puede) b.classList.add("puede"); else if (mia) b.setAttribute("aria-disabled", "true");
      const k = nuevas.indexOf(c);
      if (k >= 0) { nuevas.splice(k, 1); reciente(b, E.nuevas.en, 1200, "nueva"); }
      if (j.robo === yo() && c === E.robada && !robadaMarcada) { b.classList.add("robada"); robadaMarcada = true; }
      b.addEventListener("click", () => tocarCarta(c));
      caja.append(b);
    });
    return caja;
  }
  function tocarCarta(c) {
    const j = E.partida;
    if (!enJuego(j) || E.ocupado) return;
    if (j.turno !== yo()) { toast(`Espera tu turno: le toca a ${nombreOtro()}`); return; }
    if (!puedeJugar(c)) {
      toast(j.robo === yo() ? "Ahora solo puedes jugar la que robaste (o pasar)"
        : `Esa no sirve: tiene que ser ${NOMBRE_COLOR[j.color]}${esComodin(j.arriba) ? "" : ` o un ${valorTexto(j.arriba)}`}, o un comodín`);
      vibrar(30);
      return;
    }
    if (esComodin(c)) { E.eligiendo = c; SON.color(); pintar(); return; }
    jugar(c, null);
  }
  // Elegir el color de un comodín
  function elegirColor() {
    const capa = nodo("div", "uno-elegir");
    capa.setAttribute("role", "dialog"); capa.setAttribute("aria-label", "Elige el color");
    capa.append(nodo("p", "jv-ojo", E.eligiendo === "x4" ? "Comodín +4" : "Comodín"), nodo("h3", "jv-h", "¿Qué color va ahora?"));
    // se sugiere el color del que tienes más
    const sugerido = U.elegirColor(E.mano.filter((x) => x !== E.eligiendo));
    const colores = nodo("div", "uno-colores");
    U.COLORES.forEach((k) => {
      const b = boton(`col-${k}${k === sugerido ? " sugerido" : ""}`, mayus(NOMBRE_COLOR[k]), () => jugar(E.eligiendo, k), `color-${k}`);
      colores.append(b);
    });
    capa.append(colores, boton("link", "Mejor no", () => { E.eligiendo = null; pintar(); }, "no-color"));
    setTimeout(() => { const b = capa.querySelector(".sugerido"); if (b && !capa.contains(document.activeElement)) b.focus({ preventScroll: true }); }, 0);
    return capa;
  }
  async function jugar(c, color) {
    const e = E, j = E.partida;
    if (!enJuego(j) || E.ocupado) return;
    E.ocupado = true; E.eligiendo = null; SON.carta(); pintar();
    let r = null;
    try { r = await E.mesa.jugar(j.id, c, color); }
    catch (er) { if (E === e) { E.ocupado = false; toast("No se pudo jugar. Revisa tu conexión."); pintar(); } return; }
    if (E !== e) return;
    E.ocupado = false;
    if (!r) { toast("Esa jugada no valió (¿cambió algo en la mesa?)"); recargar(); return; }
    E.mano = r.mano; E.robada = null;
    const o = mayus(nombreOtro()), v = U.valorDe(c);
    E.mensaje = !r.mano.length ? "¡Te quedaste sin cartas! 🎉"
      : c === "x4" ? `¡+4! ${o} roba cuatro, va el ${NOMBRE_COLOR[color]} y vuelves a jugar 😈`
      : c === "x" ? `Comodín: ahora va el ${NOMBRE_COLOR[color]}`
      : v === "d" ? `¡+2! ${o} roba dos y vuelves a jugar 😈`
      : v === "s" || v === "r" ? `¡${mayus(valorTexto(c))}! Vuelves a jugar`
      : r.mano.length === 1 && r.juego.uno_dicho.indexOf(yo()) < 0 ? "Te queda una… 👀" : "";
    if (c === "x4" || v === "d") { SON.mas(); vibrar(40); }
    decir(E.mensaje || `Jugaste ${nombreCarta(c)}`);
    ponerPartida(r.juego, true);
  }
  async function robar() {
    const e = E, j = E.partida;
    if (!puedeRobar()) return;
    E.ocupado = true; SON.robar(); pintar();
    let r = null;
    try { r = await E.mesa.robar(j.id); }
    catch (er) { if (E === e) { E.ocupado = false; toast("No se pudo robar. Revisa tu conexión."); pintar(); } return; }
    if (E !== e) return;
    E.ocupado = false;
    if (!r) { toast("No se pudo robar (¿cambió el turno?)"); recargar(); return; }
    const nuevas = diferencia(r.mano, E.mano);
    if (nuevas.length) E.nuevas = { cartas: nuevas, en: Date.now() };
    E.mano = r.mano;
    E.robada = r.juego.robo === yo() ? r.robada : null;
    E.mensaje = !r.robada ? "Ya no quedan cartas para robar"
      : E.robada ? `Robaste ${nombreCarta(r.robada)}: ¡sirve! Júgala o pasa.`
      : `Robaste ${nombreCarta(r.robada)}: no sirve. Le toca a ${nombreOtro()}.`;
    decir(E.mensaje);
    ponerPartida(r.juego, true);
  }
  // ¡UNO!, pillar y pasar
  async function accion(tipo) {
    const e = E, j = E.partida;
    if (!enJuego(j) || E.ocupado) return;
    E.ocupado = true;
    if (tipo === "decir") { SON.uno(); vibrar([50, 30, 50]); }
    let r = null;
    try { r = await E.mesa[tipo](j.id); }
    catch (er) { if (E === e) { E.ocupado = false; toast("No se pudo. Revisa tu conexión."); pintar(); } return; }
    if (E !== e) return;
    E.ocupado = false;
    if (!r) { if (tipo === "pillar") toast("¡Muy tarde! Ya no se puede pillar 😅"); recargar(); return; }
    if (tipo === "pasar") {
      E.mano = r.mano; E.robada = null;
      E.mensaje = `Te la quedas. Le toca a ${nombreOtro()}.`;
      decir(E.mensaje);
      ponerPartida(r.juego, true);
      return;
    }
    E.mensaje = tipo === "decir" ? "¡UNO! 📣" : `¡Pillado! ${mayus(nombreOtro())} roba dos 😏`;
    if (tipo === "pillar") { SON.pillado(); vibrar([60, 40, 60]); }
    decir(E.mensaje);
    ponerPartida(r, true);
  }
  // "¡Avisarle!": una push para que vuelva a la mesa (una por minuto)
  function botonAvisar(texto) {
    const hace = Date.now() - E.avisadoEn < 60000;
    const btn = boton("ghost bn-avisar", hace ? "Le avisamos 🔔 ✓" : texto, async () => {
      const e = E;
      btn.disabled = true;
      let ok = false;
      try { ok = await vivo.avisar(E.partida.id); }
      catch (er) { if (E === e) { toast("No se pudo avisar. Revisa tu conexión."); btn.disabled = false; } return; }
      if (E !== e) return;
      const o = ctx.otro.nombre;
      toast(!ok ? "Ya le avisamos hace un ratito 😉" : ctx.prueba ? `(prueba) Le avisaríamos a ${o} 🔔` : `Le avisamos a ${o} 🔔`);
      E.avisadoEn = Date.now();
      pintar();
    }, "avisar");
    btn.disabled = hace;
    return btn;
  }
  // Una jugada del otro (las mías ya se contaron al hacerlas): qué pasó, con su sonido
  function recibirJugada(d) {
    if (!E || !E.partida || d.juego_id !== E.partida.id || E.vistas.has(d.id)) return;
    E.vistas.add(d.id);
    if (d.usuario_id === yo()) return;
    const o = mayus(nombreOtro());
    if (d.tipo === "juega") {
      const v = U.valorDe(d.carta);
      E.mensaje = d.carta === "x4" ? `¡${o} jugó un +4! Robas cuatro y va el ${NOMBRE_COLOR[d.color]} 😱`
        : d.carta === "x" ? `${o} jugó un comodín: ahora va el ${NOMBRE_COLOR[d.color]}`
        : v === "d" ? `¡${o} jugó un +2! Robas dos 😱`
        : v === "s" || v === "r" ? `${o} jugó ${nombreCarta(d.carta)} y vuelve a jugar`
        : `${o} jugó ${nombreCarta(d.carta)}`;
      if (d.carta === "x4" || v === "d") { SON.mas(); vibrar([90, 50, 90]); } else SON.carta();
    } else if (d.tipo === "roba") { E.mensaje = `${o} robó una carta`; SON.robar(); }
    else if (d.tipo === "pasa") E.mensaje = `${o} se quedó la que robó y pasó`;
    else if (d.tipo === "uno") { E.mensaje = `¡${o} dijo UNO! 📣`; SON.uno(); }
    else if (d.tipo === "pilla") { E.mensaje = `¡${o} te pilló sin decir UNO! Robas dos 😅`; SON.pillado(); vibrar([100, 50, 100]); }
    decir(E.mensaje);
    pintar();
  }
  // Llegó la partida (de la base, de la otra pestaña o de la respuesta a una jugada mía): se avisa lo que cambió.
  // `propia`: es la respuesta a algo que hice yo (ya sonó).
  function ponerPartida(f, propia) {
    if (!E || !f) return;
    const antes = E.partida, o = nombreOtro();
    if (!antes || antes.id !== f.id) {
      // otra partida: un reto nuevo o la revancha reemplaza a la que terminó (nunca a una en curso)
      if (enJuego(antes) || !enJuego(f) || !soyParte(f)) return;
      Object.assign(E, { partida: f, mano: [], robada: null, manoRival: null, mensaje: "", eligiendo: null, revancha: false,
        arribaEn: Date.now(), turnoEn: f.turno === yo() ? Date.now() : 0, vistas: new Set() });
      if (E.modo === "vivo" && f.creado_por !== yo()) {
        toast(antes ? `🃏 ¡${o} quiere la revancha!` : `🃏 ${o} te retó a un UNO`);
        SON.turno(); vibrar([80, 60, 80]);
      }
      cargarMano();
      pintar();
      return;
    }
    // una fila que llega tarde (de antes de algo que ya se sabe) no deshace lo nuevo
    const tf = hora(f.actualizado_en), ta = hora(antes.actualizado_en);
    if (tf && ta && tf < ta) return;
    E.partida = f;
    if (f.arriba !== antes.arriba || f.jugadas !== antes.jugadas) E.arribaEn = Date.now();
    if (cuantasDe(f, yo()) !== E.mano.length) cargarMano();
    if (!enJuego(f)) { if (enJuego(antes)) terminar(); else pintar(); return; }
    if (f.turno === yo() && antes.turno !== yo()) {
      E.turnoEn = Date.now();
      if (!propia) { SON.turno(); vibrar([40, 30, 40]); decir(`${E.mensaje ? `${E.mensaje}. ` : ""}Te toca`); }
    }
    if (f.robo !== yo()) E.robada = null;
    pintar();
  }
  async function rendirse() {
    const j = E.partida, sinEmpezar = j.jugadas === 0 && E.modo === "vivo";
    const pregunta = sinEmpezar ? (j.creado_por === yo() ? `¿Cancelar el reto a ${ctx.otro.nombre}?` : `¿Rechazar el reto de ${ctx.otro.nombre}?`)
      : E.modo === "compu" ? "¿Te rindes ante la compu?" : `¿Te rindes? ${mayus(ctx.otro.nombre)} gana la mano.`;
    if (!confirm(pregunta)) return;
    const e = E;
    let r = null;
    try { r = await E.mesa.rendirse(j.id); }
    catch (er) { if (E === e) toast("No se pudo. Revisa tu conexión."); return; }
    if (E !== e || !r) return;
    if (r.estado === "cancelada") { resumen.activa = null; if (ctx.alCambiar) ctx.alCambiar(); irAlReto(false, ""); return; }
    ponerPartida(r, true);
  }

  // ---------- 3 · el final ----------
  async function terminar() {
    const e = E, j = E.partida;
    E.eligiendo = null; E.ocupado = false;
    if (j.estado === "terminada") {
      const gane = j.ganador === yo();
      if (gane) { SON.gana(); vibrar([60, 40, 60, 40, 220]); if (ctx.lluvia) setTimeout(() => ctx.lluvia(e.modo === "compu" ? "🃏" : "🏆", 16), 500); }
      else SON.pierde();
      decir(gane ? "¡Ganaste la mano!" : `${mayus(nombreOtro())} ganó la mano`);
    }
    pintar();
    if (E.modo === "vivo") refrescarResumen();
    if (j.estado !== "terminada") return;
    let m = null;
    try { m = await E.mesa.manoRival(j.id); } catch (er) {}
    if (E !== e || !m) return;
    E.manoRival = m; // lo que le quedó al otro
    pintar();
  }
  PINTAR.fin = () => {
    const c = V.cuerpo, j = E.partida, o = nombreOtro(), conCompu = E.modo === "compu";
    if (j.estado === "cancelada") {
      c.append(nodo("p", "jv-ojo", "UNO"));
      c.append(nodo("h3", "jv-h", "El reto quedó cancelado"));
      c.append(principal(conCompu ? "Otra práctica 🤖" : `Retar a ${ctx.otro.nombre} 🃏`, () => (conCompu ? nuevaPractica() : irAlReto(false, "")), "otra"));
      c.append(boton("link", "Volver a los juegos", () => salir(), "salir"));
      return;
    }
    const gane = j.ganador === yo();
    c.append(nodo("p", "jv-ojo", "Fin de la mano"));
    c.append(nodo("h3", "jv-rango", gane ? (conCompu ? "¡Le ganaste a la compu! 🏆" : "¡Ganaste la mano! 🏆") : conCompu ? "Ganó la compu 🤖" : `${mayus(o)} ganó esta vez 😏`));
    if (j.rendido) c.append(nodo("p", "bn-texto", gane ? `${mayus(o)} se rindió 🏳️` : "Te rendiste 🏳️"));
    if (j.puntos != null && !j.rendido) c.append(nodo("p", "uno-puntos", gane ? `+${j.puntos} puntos para ti` : `+${j.puntos} puntos para ${o}`));
    if (j.apuesta && !conCompu) c.append(apuestaVer(gane ? `Ganaste la apuesta: «${j.apuesta}»` : `${mayus(o)} ganó la apuesta: «${j.apuesta}»`, true));
    // lo que le quedó a cada uno
    const resto = (titulo, cartas) => {
      if (!cartas || !cartas.length) return;
      c.append(nodo("p", "small-note", titulo));
      const fila = nodo("div", "uno-resto");
      U.ordenar(cartas).forEach((x) => fila.append(dibujoCarta(x, "chica")));
      c.append(fila);
    };
    if (gane) resto(`A ${o} le quedaron:`, E.manoRival);
    else resto("Te quedaron:", E.mano);
    if (!conCompu) {
      const m = marcadorTexto(j), p = puntosTexto(j);
      if (m) c.append(nodo("p", "small-note", m));
      if (p) c.append(nodo("p", "small-note", p));
    }
    c.append(principal("Revancha 🃏", () => (conCompu ? nuevaPractica() : irAlReto(true, j.apuesta)), "otra"));
    if (conCompu) c.append(boton("ghost bn-secundario", `Retar a ${ctx.otro.nombre} de verdad 🃏`, () => abrir("vivo"), "de-verdad"));
    c.append(boton("link", "Volver a los juegos", () => salir(), "salir"));
  };
  function irAlReto(revancha, apuesta) {
    Object.assign(E, { partida: null, mano: [], robada: null, manoRival: null, mensaje: "", eligiendo: null, revancha, apuesta: apuesta || "" });
    pintar();
  }
  async function nuevaPractica() {
    const e = E;
    let j = null;
    try { j = await E.mesa.crear(null); } catch (er) { return; }
    if (E === e && j && (!E.partida || E.partida.id !== j.id)) ponerPartida(j);
  }

  // ---------- arranque ----------
  function iniciar(op) {
    if (vistaAbierta()) cerrar();
    if (vivo) vivo.apagar();
    ctx = op;
    vivo = ctx.prueba ? adaptadorPrueba(ctx.yo.id, ctx.otro.id) : adaptadorSupabase(ctx.sb, ctx.yo.id, ctx.parejaId);
    compu = null; presente = false; resumen = { activa: null, historial: [] };
    vivo.escuchar(alLlegar);
    refrescarResumen();
  }
  // Al volver a la app: ponerse al día (el tiempo real no repite lo que pasó con el teléfono dormido)
  async function alDia() {
    if (!vivo) return;
    if (vivo.reabrir) vivo.reabrir();
    await refrescarResumen();
    if (vistaAbierta() && E.modo === "vivo") recargar();
  }
  window.addEventListener("popstate", () => { if (vistaAbierta() && !(history.state && history.state.uno)) cerrar(); });
  // con la app en segundo plano no se está mirando la mesa
  document.addEventListener("visibilitychange", () => { if (vivo) vivo.presencia(!document.hidden && vistaAbierta() && E.modo === "vivo"); });

  window.Uno = { iniciar, tarjeta, abrir, alDia };
})();
