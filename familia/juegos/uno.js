// UNO 🃏 · la pantalla
// El juego de cartas en vivo para dos, cada uno en su teléfono: se juega una del mismo color o número que la de
// arriba (o un comodín); salta y reversa te dejan jugar otra vez, +2 y +4 hacen robar al otro, y cuando te queda una
// hay que decir "¡UNO!" (si te pillan sin decirlo, robas dos). Antes de empezar se puede apostar algo.
// La usan las dos apps y el archivo es el mismo en las dos (lo revisa familia/herramientas/paridad.mjs). La app dice
// con quién se puede jugar (ctx.rivales): si hay más de una persona, primero se elige ("¿Con quién juegas?"); las que
// vienen con grupo "otros" (los del Recreo, en la app principal) salen aparte, bajo «Otros».
// La base (supabase/uno.sql) baraja, reparte y revisa cada jugada; las manos son secretas. Para la otra persona de la
// cuenta, la app principal trae su propio adaptador (rival.adaptador, con avisos push); con la familia se juega por
// uno_retar, desde cualquiera de las dos apps (sin push: el aviso va por WhatsApp).
// Las mismas reglas en JavaScript (uno-motor.js) sirven para practicar contra la compu y para probar sin la base: en
// modo prueba, cada par de personas tiene su mesa en localStorage y las pestañas se avisan con BroadcastChannel.
// La pantalla usa el marco de los juegos (.jv) y las piezas de la batalla naval (bn-…: el cuerpo, el turno, la
// apuesta, los avisos y el «¿Con quién juegas?»); uno.css pone los colores de la mesa y las cartas.
(() => {
  "use strict";
  const U = window.UnoMotor;
  if (!U) return;
  const { NOMBRE_COLOR, esComodin, nombreCarta } = U;
  const COMPU = "compu";
  // Ideas de apuesta (la app principal trae otras para la otra persona de la cuenta: rival.ideas)
  const IDEAS = [
    "Quien pierde lava los platos 🍽️",
    "Quien gana elige la próxima película 🎬",
    "Quien pierde invita un helado 🍦",
    "Quien pierde cuenta un chiste 🤡",
    "Quien gana elige qué se cena 🍕",
    "Quien pierde ordena la sala 🧹",
  ];
  // El color del círculo de cada persona del Recreo (el mismo de su ranking)
  const COLOR_AV = { azul: "#3B82F6", coral: "#E8603F", menta: "#0E9C82", uva: "#7A5AF0", sol: "#E8A400", hoja: "#3A9A3F" };
  const ICONO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.2" y="5.2" width="10" height="14.5" rx="2" transform="rotate(-12 8.2 12.4)"/><rect x="10.8" y="4.3" width="10" height="14.5" rx="2" transform="rotate(10 15.8 11.5)"/><circle cx="15.7" cy="11.6" r="2.6"/></svg>';
  const X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>';
  const SONIDO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
  const MUDO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
  const JUGAR_SVG = '<svg class="ico" aria-hidden="true"><use href="#i-jugar"/></svg>'; // (solo en el Recreo: el ícono es de su página)
  // los símbolos de salta y reversa (en las cartas)
  const SIMBOLO = {
    s: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/><path d="M6.8 17.2 17.2 6.8"/></svg>',
    r: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9.5h11.5l-3-3M19 14.5H7.5l3 3"/></svg>',
  };

  let ctx = null;            // lo que pasa la app: app, sb, prueba, yo, rivales, enlace, toast, lluvia, vibrar, renderAvatares, alCambiar
  let mesas = new Map();     // id de cada rival → { rival, ad (su adaptador), resumen: { activa, historial }, presente, quitar }
  let familia = null;        // el canal de los UNO de familia (Supabase): uno solo para todos
  let compu = null;          // la práctica contra la compu (en memoria)
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
  // Los botones con la cara de cada app
  const CL = () => (ctx && ctx.app === "recreo"
    ? { principal: "btn btn-sol btn-ancho bn-principal", secundario: "btn btn-sec btn-ancho bn-secundario", chico: "btn btn-sec btn-chico bn-chico", enlace: "enlace bn-enlace" }
    : { principal: "jv-jugar bn-principal", secundario: "ghost bn-secundario", chico: "ghost bn-chico", enlace: "link bn-enlace" });
  const nombreOtro = () => (E && E.modo === "compu" ? "la compu" : E && E.rival ? E.rival.nombre : "");
  const mayus = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const toast = (m) => { if (ctx && ctx.toast) ctx.toast(m); };
  const vibrar = (p) => { try { if (ctx && ctx.vibrar) ctx.vibrar(p); else if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };
  const poco = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const anotar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const vistaAbierta = () => !!V && !V.raiz.hidden && !!E;
  const enJuego = (j) => !!j && j.estado === "jugando";
  const hora = (iso) => new Date(iso).getTime() || 0;
  const todas = () => Array.from(mesas.values());
  const varios = () => mesas.size > 1;
  const cambio = () => { if (ctx && ctx.alCambiar) ctx.alCambiar(); };
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
  // El círculo de una persona: el de la app principal (data-av, lo pinta la app) o el personaje del Recreo
  function avatarDe(p) {
    let a;
    if (p && p.av) { a = nodo("span", "avatar mini"); a.dataset.av = p.av; }
    else if (p && p.avatar) { a = nodo("span", `bn-av c-${p.color || "azul"}`, p.avatar); a.style.setProperty("--av", COLOR_AV[p.color] || COLOR_AV.azul); }
    else a = nodo("span", "bn-robot", "🤖");
    a.setAttribute("aria-hidden", "true");
    return a;
  }

  // ---------- sonido (Web Audio, sin archivos; el mismo "silencio" que los demás juegos) ----------
  let AC = null;
  const CLAVE_MUDO = () => (ctx && ctx.app === "recreo" ? "recreo-mudo" : "juegos-mudo");
  const mudo = () => leer(CLAVE_MUDO()) === "1";
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
  // activa, historial, crear, jugar, robar, pasar, decir, pillar, rendirse, miMano, manoRival, jugadas; escuchar(fn)
  // avisa ("uno", fila), ("jugada", jugada), ("presencia", ¿el otro tiene esta mesa abierta?) y ("conectado") cuando
  // el canal vuelve después de caerse; presencia(si), reabrir, apagar y, solo si hay push, avisar(id).
  const conError = (r) => { if (r.error) throw r.error; return r.data; };
  const fila = (d) => (d && d.id ? d : null); // una función que no encuentra nada devuelve una fila vacía
  // Un solo canal para todos los UNO de familia: llegan los míos (RLS) y se reparten por rival; y la presencia,
  // donde cada uno anota con quién tiene la mesa abierta ({ con }). Si se cae, se vuelve a abrir solo (vivo-canal.js).
  function canalFamilia() {
    if (familia) return familia;
    const sb = ctx.sb, yoId = yo();
    const F = { viendo: null, oyentes: new Map(), deQuien: new Map() }; // deQuien: id de partida → rival
    const emitir = (rivalId, tipo, f) => { const s = F.oyentes.get(rivalId); if (s) s.forEach((fn) => fn(tipo, f)); };
    F.recordar = (j) => { if (j && j.id) F.deQuien.set(j.id, j.creado_por === yoId ? j.rival : j.creado_por); };
    F.vivo = window.VivoCanal(sb, "vivo-uno-familia", { config: { presence: { key: yoId } } }, (c) => {
      c.on("postgres_changes", { event: "*", schema: "public", table: "unos" }, (p) => {
        const j = p.new;
        if (!j || !j.id || !j.familia || (j.creado_por !== yoId && j.rival !== yoId)) return;
        F.recordar(j);
        emitir(F.deQuien.get(j.id), "uno", j);
      })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "uno_jugadas" }, (p) => {
          const d = p.new;
          if (d && d.id && F.deQuien.has(d.juego_id)) emitir(F.deQuien.get(d.juego_id), "jugada", d);
        })
        .on("presence", { event: "sync" }, () => {
          const st = c.presenceState();
          F.oyentes.forEach((_, rivalId) => emitir(rivalId, "presencia", (st[rivalId] || []).some((m) => m.con === yoId)));
        });
    }, null, () => F.oyentes.forEach((_, rivalId) => emitir(rivalId, "conectado")));
    // (la presencia la manda vivo-canal.js sin pasar el límite de Supabase, que a la sexta en 30 s cierra el canal)
    F.ver = (rivalId) => {
      if (F.viendo === rivalId) return;
      F.viendo = rivalId;
      F.vivo.presencia(rivalId ? { con: rivalId } : null);
    };
    F.escuchar = (rivalId, fn) => {
      if (!F.oyentes.has(rivalId)) F.oyentes.set(rivalId, new Set());
      F.oyentes.get(rivalId).add(fn);
      F.vivo.abrir();
      return () => { const s = F.oyentes.get(rivalId); if (s) s.delete(fn); };
    };
    F.reabrir = () => F.vivo.revisar();
    F.apagar = () => { F.vivo.apagar(); F.oyentes.clear(); };
    familia = F;
    return F;
  }
  function adaptadorFamilia(rival) {
    const sb = ctx.sb, yoId = yo(), F = canalFamilia();
    const delPar = (q) => q.eq("familia", true)
      .or(`and(creado_por.eq.${yoId},rival.eq.${rival.id}),and(creado_por.eq.${rival.id},rival.eq.${yoId})`);
    const rpc = async (nombre, args) => conError(await sb.rpc(nombre, args));
    return {
      modo: "vivo",
      async activa() {
        const j = conError(await delPar(sb.from("unos").select("*")).eq("estado", "jugando")
          .order("creado_en", { ascending: false }).limit(1))[0] || null;
        F.recordar(j);
        return j;
      },
      async historial() {
        const h = conError(await delPar(sb.from("unos").select("id, estado, creado_por, rival, ganador, puntos, rendido, apuesta, creado_en, actualizado_en"))
          .eq("estado", "terminada").order("actualizado_en", { ascending: false }).limit(300)) || [];
        h.forEach(F.recordar);
        return h;
      },
      async crear(apuesta) {
        const j = fila(await rpc("uno_retar", { p_rival: rival.id, p_apuesta: apuesta || null }));
        F.recordar(j);
        return j;
      },
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
      async jugadas(id) { return conError(await sb.from("uno_jugadas").select("*").eq("juego_id", id).order("id")) || []; },
      escuchar(fn) { return F.escuchar(rival.id, fn); },
      reabrir() { F.reabrir(); },
      presencia(si) { if (si) F.ver(rival.id); else if (F.viendo === rival.id) F.ver(null); },
      apagar() {},
    };
  }
  // Modo prueba: cada par de personas tiene su mesa en localStorage y las pestañas se avisan con BroadcastChannel
  function adaptadorPrueba(rival) {
    const yoId = yo(), CLAVE = `vivo-uno-${[yoId, rival.id].sort().join("-")}`;
    let bc = null, alCambio = null, viendo = false;
    try { bc = new BroadcastChannel(CLAVE); } catch (e) {}
    const enviar = (m) => { try { if (bc) bc.postMessage(m); } catch (e) {} };
    const mesa = U.mesaLocal({
      yo: yoId, otro: rival.id,
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
      if (m.tipo === "presencia") { if (m.fila && m.fila.quien === rival.id) presencias.forEach((fn) => fn("presencia", !!m.fila.viendo)); return; }
      if (alCambio) alCambio(m);
    };
    const salir = () => { if (viendo) enviar({ tipo: "presencia", fila: { quien: yoId, viendo: false } }); };
    window.addEventListener("pagehide", salir);
    enviar({ tipo: "quien" });
    const extra = {
      modo: "vivo",
      escuchar(fn) { const quitar = escucharMesa(fn); presencias.add(fn); return () => { quitar(); presencias.delete(fn); }; },
      presencia(si) { if (viendo === si) return; viendo = si; enviar({ tipo: "presencia", fila: { quien: yoId, viendo: si } }); },
      apagar() { salir(); window.removeEventListener("pagehide", salir); presencias.clear(); if (bc) bc.close(); bc = null; },
    };
    if (rival.adaptador) extra.avisar = async () => true; // (como si hubiera push, igual que de verdad con esta persona)
    return Object.assign(mesa, extra);
  }
  function adaptadorCompu() {
    let memoria = [];
    const mesa = U.mesaLocal({ yo: yo(), otro: COMPU, compu: COMPU, guardar: (l) => (memoria = l), cargar: () => memoria });
    return Object.assign(mesa, { presencia() {}, apagar() {} });
  }
  const crearAdaptador = (r) => (ctx.prueba ? adaptadorPrueba(r) : r.adaptador ? r.adaptador(yo()) : adaptadorFamilia(r));

  // ---------- las mesas: una por rival ----------
  // Conserva las de quienes siguen, abre las de los nuevos y cierra las de quienes ya no están
  function ponerRivales(lista) {
    const nuevas = new Map();
    (lista || []).forEach((r) => {
      if (!r || !r.id || r.id === yo()) return;
      const vieja = mesas.get(r.id);
      if (vieja) { vieja.rival = r; nuevas.set(r.id, vieja); return; }
      const m = { rival: r, ad: crearAdaptador(r), resumen: { activa: null, historial: [] }, presente: false, quitar: null };
      m.quitar = m.ad.escuchar((tipo, f) => alLlegar(m, tipo, f));
      nuevas.set(r.id, m);
      refrescar(m);
    });
    mesas.forEach((m, id) => { if (!nuevas.has(id)) cerrarMesa(m); });
    mesas = nuevas;
    cambio();
    if (vistaAbierta() && E.modo === "vivo" && !E.mesaRef) pintar();
  }
  function cerrarMesa(m) {
    try { if (m.quitar) m.quitar(); if (m.ad.presencia) m.ad.presencia(false); if (m.ad.apagar) m.ad.apagar(); } catch (e) {}
  }
  async function refrescar(m) {
    try {
      const [activa, historial] = await Promise.all([m.ad.activa(), m.ad.historial()]);
      m.resumen = { activa, historial };
    } catch (e) { /* sin red: se queda lo que había y se reintenta al volver */ }
    cambio();
    if (vistaAbierta() && E.modo === "vivo" && !E.mesaRef) pintar();
  }

  // ---------- lo que se sabe de una partida ----------
  const soyParte = (j) => !!j && (j.creado_por === yo() || j.rival === yo());
  const rivalDe = (j) => (j.creado_por === yo() ? j.rival : j.creado_por);
  const cuantasDe = (j, id) => (j && j.cartas && j.cartas[id]) || 0;
  const valorTexto = (c) => { const v = U.valorDe(c); return v === "s" ? "salta" : v === "r" ? "reversa" : v === "d" ? "+2" : v; };

  // ---------- cómo va cada mesa (para la tarjeta, el «¿Con quién juegas?» y los avisos) ----------
  // nivel 3: te toca a ti; 2: un reto nuevo o esperas al otro; 1: terminó hace poco; 0: nada
  function estado(m) {
    const j = m.resumen.activa, o = m.rival.nombre, h = m.resumen.historial[0];
    if (j && soyParte(j) && enJuego(j)) {
      if (j.jugadas === 0 && j.creado_por !== yo()) {
        return { nivel: j.turno === yo() ? 3 : 2, corto: "🃏 ¡Te retó!", t1: `🃏 ${o} te retó a un UNO`,
          t2: j.apuesta ? `Se juegan: «${j.apuesta}»` : j.turno === yo() ? "Ya están las cartas: empiezas tú" : "Ya están repartidas las cartas" };
      }
      const n = cuantasDe(j, rivalDe(j));
      if (j.turno === yo()) return { nivel: 3, corto: "🃏 ¡Te toca!", t1: "🃏 ¡Te toca jugar!", t2: `A ${o} le ${n === 1 ? "queda una carta" : `quedan ${n} cartas`}` };
      return { nivel: 2, corto: `Le toca a ${o}`, t1: `Le toca a ${o}`, t2: m.presente ? `${o} está pensando… 👀` : "Entra a ver cómo va la partida" };
    }
    if (h && Date.now() - hora(h.actualizado_en) < 36 * 3600000) {
      const gane = h.ganador === yo();
      return { nivel: 1, corto: gane ? "Ganaste la última 🏆" : `Ganó ${o} 😏`, t1: gane ? `Ganaste la última mano${varios() ? ` con ${o}` : ""} 🏆` : `${o} ganó la última 😏`,
        t2: m.presente ? `🟢 ${o} está mirando la mesa ahora` : "¿Revancha?" };
    }
    return { nivel: 0, corto: "Retar 🃏", t1: `Reta a ${o} a un UNO 🃏`, t2: m.presente ? `🟢 ${o} está mirando la mesa ahora` : "En vivo, cada uno en su teléfono" };
  }
  // La mesa que más importa ahora (a igual nivel, la primera de la lista: la de la app principal va primero)
  function mesaPrincipal() {
    let mejor = null, nivelMejor = -1;
    todas().forEach((m) => { const n = estado(m).nivel; if (n > nivelMejor) { mejor = m; nivelMejor = n; } });
    return mejor;
  }
  // (con `extra`, la que acaba de terminar aunque el historial no la tenga aún)
  function historialCon(m, extra) {
    const h = m.resumen.historial;
    return extra && extra.estado === "terminada" && !h.some((x) => x.id === extra.id) ? [extra].concat(h) : h;
  }
  // "Manos ganadas · Tú 3 · Eli 2"
  function marcadorDe(m, extra) {
    const h = historialCon(m, extra);
    if (!h.length) return null;
    const mias = h.filter((x) => x.ganador === yo()).length;
    return `Manos ganadas · Tú ${mias} · ${m.rival.nombre} ${h.length - mias}`;
  }
  function puntosDe(m, extra) {
    const h = historialCon(m, extra);
    const suma = (quien) => h.filter((x) => x.ganador === quien).reduce((s, x) => s + (x.puntos || 0), 0);
    const a = suma(yo()), b = h.reduce((s, x) => s + (x.puntos || 0), 0) - a;
    return a || b ? `Puntos de todas las manos · Tú ${a} · ${m.rival.nombre} ${b}` : null;
  }
  const listaNombres = (n, y) => (n.length < 2 ? n.join("") : `${n.slice(0, -1).join(", ")} ${y || "y"} ${n[n.length - 1]}`);
  // Lo que dice la tarjeta: [título, detalle, la mesa de la que habla (para su marcador) o nada]
  function textoTarjeta() {
    const m = mesaPrincipal(), e = estado(m);
    if (e.nivel > 0 || !varios()) return [e.t1, e.t2, m];
    const presente = todas().find((x) => x.presente);
    if (presente) return [`Reta a ${presente.rival.nombre} a un UNO 🃏`, `🟢 ${presente.rival.nombre} está mirando la mesa ahora`, presente];
    const nombres = todas().map((x) => x.rival.nombre), otros = todas().filter((x) => x.rival.grupo === "otros");
    if (otros.length && otros.length < nombres.length) return [`Reta a ${m.rival.nombre} a un UNO 🃏`, `o a ${listaNombres(otros.map((x) => x.rival.nombre))}, en «Otros»`, m];
    return ["¿Con quién juegas? 🃏", `${listaNombres(nombres, "o")}: elige a quién retar`, null];
  }
  function marcadorTarjeta(m) {
    if (m) return marcadorDe(m);
    const h = [].concat(...todas().map((x) => x.resumen.historial));
    return h.length ? `Manos ganadas · ${h.filter((x) => x.ganador === yo()).length} de ${h.length}` : null;
  }
  function tarjeta() {
    if (!ctx || !mesas.size) return null;
    const m = mesaPrincipal(), e = estado(m), toca = e.nivel === 3, activa = todas().some((x) => enJuego(x.resumen.activa));
    const [t1, t2, deQuien] = textoTarjeta(), marcador = marcadorTarjeta(deQuien);
    const vivo = nodo("span", `bn-vivo${activa || todas().some((x) => x.presente) ? " encendido" : ""}`, "En vivo");
    const lema = "Las cartas de siempre, los dos a la vez: del mismo color o número, +2, +4… y no te olvides de decir «¡UNO!».";
    const textoBoton = toca ? "¡Vamos!" : activa ? "Volver" : "Jugar";
    let b;
    if (ctx.app === "recreo") {
      b = boton(`j-carta tarjeta bn-carta uno-tarjeta${toca ? " toca" : ""}`);
      const arte = nodo("span", "arte arte-vivo arte-uno sticker"); arte.innerHTML = ICONO; arte.setAttribute("aria-hidden", "true");
      const info = nodo("span", "j-info"), nombre = nodo("strong", "j-nombre", "UNO ");
      nombre.append(vivo);
      info.append(nombre, nodo("small", "j-lema", lema));
      const marcas = nodo("span", "j-marcas"), lider = nodo("span", "j-lider"), txt = nodo("span");
      txt.append(nodo("b", null, t1), nodo("small", null, marcador ? `${t2} · ${marcador}` : t2));
      lider.append(txt);
      const jugar = nodo("span", "btn btn-sol btn-chico");
      jugar.innerHTML = JUGAR_SVG; // (el triángulo de "Jugar" de los demás juegos del Recreo)
      jugar.append(textoBoton);
      marcas.append(lider, jugar);
      b.append(arte, info, marcas);
    } else {
      b = boton(`j-carta bn-carta uno-tarjeta${toca ? " toca" : ""}`);
      const ico = nodo("span", "j-icono"); ico.innerHTML = ICONO;
      const info = nodo("span", "j-info"), nombre = nodo("strong", "j-nombre", "UNO ");
      nombre.append(vivo);
      info.append(nombre, nodo("small", "j-lema", lema));
      const est = nodo("span", "bn-estado-carta");
      est.append(nodo("b", null, t1), nodo("small", null, t2));
      info.append(est);
      if (marcador) info.append(nodo("span", "j-hoy", marcador));
      b.append(ico, info, nodo("span", "j-jugar", textoBoton));
    }
    b.setAttribute("aria-label", `UNO, en vivo. ${t1}. ${t2}.${marcador ? ` ${marcador}.` : ""}`);
    b.addEventListener("click", () => abrir("vivo", e.nivel >= 2 ? m.rival.id : null));
    return b;
  }

  // Lo que llega de la base (o de la otra pestaña): la tarjeta, los avisos y, si está abierta, la mesa
  function alLlegar(m, tipo, f) {
    const mirando = vistaAbierta() && E.modo === "vivo" && E.mesaRef === m;
    if (tipo === "conectado") { refrescar(m); if (mirando) revisar(); return; } // volvió el canal: a ponerse al día
    if (tipo === "presencia") {
      if (m.presente === f) return;
      m.presente = f;
      cambio();
      if (vistaAbierta()) pintar();
      return;
    }
    if (tipo === "uno") {
      const r = m.resumen, antes = r.activa && r.activa.id === f.id ? r.activa : null;
      if (enJuego(f)) r.activa = f;
      else {
        if (r.activa && r.activa.id === f.id) r.activa = null;
        if (f.estado === "terminada") r.historial = [f].concat(r.historial.filter((h) => h.id !== f.id));
      }
      if (!mirando && soyParte(f)) avisoFuera(m, antes, f);
      cambio();
      if (vistaAbierta() && !mirando) pintar(); // el «¿Con quién juegas?» o el aviso para volver (practicando con la compu)
    }
    if (mirando) alLlegarVista(tipo, f);
  }
  // Con esta mesa cerrada, lo importante llega como aviso en la app
  function avisoFuera(m, antes, f) {
    const o = m.rival.nombre;
    if (!antes && enJuego(f) && f.creado_por !== yo() && f.jugadas === 0) { toast(`🃏 ${o} te retó a un UNO`); vibrar([80, 60, 80]); }
    else if (!antes) return;
    else if (enJuego(f) && f.turno === yo() && antes.turno !== yo()) { toast(`🃏 Te toca jugar en el UNO con ${o}`); vibrar([40, 30, 40]); }
    else if (f.estado === "terminada" && antes.estado === "jugando") toast(f.ganador === yo() ? `🏆 ¡Le ganaste la mano de UNO a ${o}!${f.rendido ? " Se rindió" : ""}` : `${o} ganó la mano de UNO 😏 ¿Revancha?`);
    else if (f.estado === "cancelada") toast(`El reto de UNO con ${o} quedó cancelado`);
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
    V.sonido = boton("jv-boton", null, () => { anotar(CLAVE_MUDO(), mudo() ? "0" : "1"); pintarSonido(); activarAudio(); });
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

  function nuevoEstado(modo, m) {
    return {
      modo, mesaRef: m || null, rival: m ? m.rival : null, mesa: modo === "compu" ? compu : m ? m.ad : null,
      partida: null, mano: [], robada: null, manoRival: null, mensaje: "",
      eligiendo: null, ocupado: false, arribaEn: 0, turnoEn: 0, nuevas: null, vistas: new Set(),
      apuesta: "", revancha: false, error: null, avisadoEn: 0, cola: null,
    };
  }
  // Solo una mesa abierta a la vez: la de antes deja de "estar mirando"
  function soltarPresencia() { if (E && E.mesaRef) E.mesaRef.ad.presencia(false); }
  function verPresencia() { if (E && E.mesaRef) E.mesaRef.ad.presencia(!document.hidden && vistaAbierta() && E.modo === "vivo"); }
  // modo "vivo" (con rivalId, directo a esa mesa; sin él: si hay una sola persona, esa; si no, «¿Con quién juegas?»)
  // o "compu" (la práctica)
  async function abrir(modo, rivalId) {
    if (!ctx || (modo !== "compu" && !mesas.size)) return;
    montarVista();
    activarAudio();
    if (modo === "compu" && !compu) {
      compu = adaptadorCompu();
      compu.escuchar((tipo, f) => { if (vistaAbierta() && E.modo === "compu") alLlegarVista(tipo, f); });
    }
    const m = modo === "compu" ? null : (rivalId && mesas.get(rivalId)) || (mesas.size === 1 ? todas()[0] : null);
    soltarPresencia();
    E = nuevoEstado(modo, m);
    const e = E;
    if (V.raiz.hidden) {
      V.foco = document.activeElement;
      V.raiz.hidden = false;
      document.body.classList.add("con-juego");
      fondoInerte(true);
      history.pushState({ uno: true }, ""); // "atrás" en Android cierra la mesa
    }
    verPresencia();
    V.raiz.dataset.modo = modo;
    V.titulo.textContent = modo === "compu" ? "UNO · práctica" : "UNO";
    delete V.raiz.dataset.fase;
    V.capa.innerHTML = "";
    if (modo === "vivo" && !m) { pintar(); enfocar(); return; } // «¿Con quién juegas?»
    V.cuerpo.innerHTML = "";
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
    enfocar();
  }
  function enfocar() {
    const p = V.cuerpo.querySelector(".bn-principal:not([disabled]), .uno-mano .puede, .bn-persona") || V.cerrar;
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
    soltarPresencia();
    V.raiz.hidden = true;
    V.capa.innerHTML = "";
    document.body.classList.remove("con-juego");
    fondoInerte(false);
    E = null;
    todas().forEach(refrescar);
    if (V.foco && V.foco.focus && document.contains(V.foco)) V.foco.focus({ preventScroll: true });
  }

  // La fase según lo que se sabe
  function fase() {
    if (E.error) return "error";
    if (E.modo === "vivo" && !E.mesaRef) return "lobby";
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
    V.cuerpo.append(nodo("p", "bn-texto", E.error), principal("Intentar de nuevo", () => { E.error = null; recargar(); }, "reintentar"));
  };
  // ---------- 0 · ¿con quién juegas? ----------
  PINTAR.lobby = () => {
    const c = V.cuerpo, propias = todas().filter((m) => m.rival.grupo !== "otros"), otros = todas().filter((m) => m.rival.grupo === "otros");
    c.append(nodo("p", "jv-ojo", "En vivo · cada uno en su teléfono"));
    c.append(nodo("h3", "jv-h", "¿Con quién juegas? 🃏"));
    const fila = (m) => {
      const e = estado(m), b = boton(`bn-persona${e.nivel === 3 ? " toca" : ""}${m.presente ? " en-linea" : ""}`, null, () => elegir(m.rival.id), `persona-${m.rival.id}`);
      const txt = nodo("span", "bn-persona-txt"), marcador = marcadorDe(m);
      txt.append(nodo("b", null, m.rival.nombre), nodo("small", null, marcador || (m.presente ? "🟢 Está mirando la mesa" : "Todavía no juegan una mano")));
      b.append(avatarDe(m.rival), txt, nodo("span", `bn-chip-estado n${e.nivel}`, e.corto));
      b.setAttribute("aria-label", `${m.rival.nombre}: ${e.t1}.${marcador ? ` ${marcador}.` : ""}`);
      return b;
    };
    if (propias.length) { const l = nodo("div", "bn-personas"); propias.forEach((m) => l.append(fila(m))); c.append(l); }
    if (otros.length) {
      c.append(nodo("p", "bn-grupo", propias.length ? "Otros · del Recreo" : "Del Recreo"));
      const l = nodo("div", "bn-personas"); otros.forEach((m) => l.append(fila(m))); c.append(l);
    }
    c.append(boton(CL().secundario, "Practicar contra la compu 🤖", () => abrir("compu"), "practicar"));
  };
  function elegir(rivalId) { if (vistaAbierta()) abrir("vivo", rivalId); }
  const linkOtraPersona = () => (varios() && E.modo === "vivo" ? boton(CL().enlace, "← Jugar con otra persona", () => abrir("vivo"), "otra-persona") : null);
  // Practicando con la compu, si una partida de verdad te espera, se ofrece volver
  function avisoDesdeCompu() {
    const m = todas().find((x) => estado(x).nivel === 3);
    if (!m) return;
    const d = nodo("div", "bn-volver");
    d.append(nodo("span", null, `🃏 Te toca en el UNO con ${m.rival.nombre}`), boton(CL().chico, "Volver 🃏", () => abrir("vivo", m.rival.id), "volver-vivo"));
    V.cuerpo.append(d);
  }
  function apuestaVer(texto, deuda) { return nodo("p", `bn-apuesta-ver${deuda ? " deuda" : ""}`, texto); }
  function principal(texto, fn, foco) { return boton(CL().principal, texto, fn, foco); }

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
    const c = V.cuerpo, o = E.rival.nombre, m = E.mesaRef;
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
    if (m.presente) c.append(nodo("p", "bn-presente", `🟢 ${o} está mirando la mesa ahora`));
    const caja = nodo("div", "bn-caja");
    const lab = nodo("label", null, "¿Qué se apuestan? (si quieren)"); lab.htmlFor = "uno-apuesta";
    const t = nodo("textarea", "papel bn-apuesta"); t.id = "uno-apuesta"; t.maxLength = 120; t.rows = 2;
    t.placeholder = "Quien pierde…"; t.value = E.apuesta; t.dataset.foco = "apuesta";
    t.addEventListener("input", () => (E.apuesta = t.value));
    const ideas = nodo("div", "bn-ideas");
    (E.rival.ideas || IDEAS).forEach((i, k) => ideas.append(boton("bn-idea", i, () => { t.value = E.apuesta = i; t.focus(); }, `idea-${k}`)));
    caja.append(lab, t, ideas);
    const retar = principal(`Retar a ${o} 🃏`, () => crearPartida(retar, t.value.trim()), "retar");
    c.append(caja, retar, boton(CL().secundario, "Practicar contra la compu 🤖", () => abrir("compu"), "practicar"));
    const marcador = marcadorDe(m), otra = linkOtraPersona();
    if (marcador) c.append(nodo("p", "bn-nota", marcador));
    if (otra) c.append(otra);
  };
  async function crearPartida(btn, apuesta) {
    const e = E, o = E.rival.nombre;
    btn.disabled = true;
    let j = null;
    try { j = await E.mesa.crear(apuesta); if (!j) throw new Error("sin partida"); }
    catch (er) { if (E === e) { toast("No se pudo enviar el reto. Revisa tu conexión."); btn.disabled = false; } return; }
    if (E !== e) return;
    E.mesaRef.resumen.activa = j;
    cambio();
    if (j.creado_por === yo() && j.jugadas === 0) {
      toast(ctx.prueba ? `(prueba) Reto enviado a ${o}` : E.mesa.avisar ? `Le avisamos a ${o} 🃏 ¡Ya están las cartas!` : `¡Ya están las cartas! 🃏 Avísale a ${o} para que entre`);
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
    const presente = E.modo === "vivo" && E.mesaRef.presente;
    // el otro: cuántas cartas tiene (boca abajo) y si dijo "¡UNO!"
    const rival = nodo("div", "uno-rival");
    rival.append(lado(E.modo === "compu" ? null : E.rival, mayus(o), nOtro, !mia, presente, j.uno_dicho.indexOf(rivalDe(j)) >= 0));
    const abanico = nodo("div", "uno-abanico");
    abanico.setAttribute("aria-hidden", "true");
    for (let i = 0; i < Math.min(nOtro, 14); i++) abanico.append(dorso("mini"));
    if (nOtro > 14) abanico.append(nodo("span", "uno-mas", `+${nOtro - 14}`));
    rival.append(abanico);
    c.append(rival);
    if (j.uno_pendiente === rivalDe(j)) c.append(boton(`${CL().principal} uno-pillar`, `¡${mayus(o)} no dijo UNO! Pillar 👉`, () => accion("pillar"), "pillar"));
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
    if (puedeDecirUno()) acciones.append(boton(`${CL().principal} uno-grito`, "¡UNO! 📣", () => accion("decir"), "uno"));
    if (mia && j.robo === yo()) acciones.append(boton(CL().chico, "Pasar ➜", () => accion("pasar"), "pasar"));
    else if (mia) { const r = boton(CL().chico, "Robar una", () => robar(), "robar"); r.disabled = !puedeRobar(); acciones.append(r); }
    if (acciones.childNodes.length) c.append(acciones);
    c.append(manoDibujada());
    if (j.apuesta && E.modo === "vivo") c.append(nodo("p", "bn-nota", `Se juegan: «${j.apuesta}»`));
    const sinEmpezar = j.jugadas === 0 && E.modo === "vivo";
    c.append(boton(CL().enlace, sinEmpezar ? (j.creado_por === yo() ? "Cancelar el reto" : "Rechazar el reto") : "Rendirme 🏳️", () => rendirse(), "rendirse"));
    const otra = linkOtraPersona();
    if (otra && !mia) c.append(otra);
  };
  function lado(persona, nombre, n, leToca, enLinea, dijoUno) {
    const s = nodo("div", `bn-lado${leToca ? " toca" : ""}${enLinea ? " en-linea" : ""}`);
    const t = nodo("span", "bn-lado-txt");
    t.append(nodo("b", null, nombre), nodo("small", null, `${n} ${n === 1 ? "carta" : "cartas"}${dijoUno && n <= 2 ? " · ¡UNO! 📣" : ""}`));
    s.append(avatarDe(persona), t);
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
    capa.append(colores, boton(CL().enlace, "Mejor no", () => { E.eligiendo = null; pintar(); }, "no-color"));
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
  // "¡Avisarle!": con push si esta mesa lo tiene (una por minuto); si no, por WhatsApp (o lo que el teléfono ofrezca)
  function botonAvisar(texto) {
    if (!E.mesa.avisar) return boton(`${CL().chico} bn-avisar`, "💬 Avisarle por WhatsApp", () => avisarPorMensaje(), "avisar");
    const hace = Date.now() - E.avisadoEn < 60000;
    const btn = boton(`${CL().chico} bn-avisar`, hace ? "Le avisamos 🔔 ✓" : texto, async () => {
      const e = E;
      btn.disabled = true;
      let ok = false;
      try { ok = await E.mesa.avisar(E.partida.id); }
      catch (er) { if (E === e) { toast("No se pudo avisar. Revisa tu conexión."); btn.disabled = false; } return; }
      if (E !== e) return;
      const o = E.rival.nombre;
      toast(!ok ? "Ya le avisamos hace un ratito 😉" : ctx.prueba ? `(prueba) Le avisaríamos a ${o} 🔔` : `Le avisamos a ${o} 🔔`);
      E.avisadoEn = Date.now();
      pintar();
    }, "avisar");
    btn.disabled = hace;
    return btn;
  }
  async function avisarPorMensaje() {
    const j = E.partida, o = E.rival.nombre;
    const que = j && j.jugadas === 0 && j.creado_por === yo() ? "¡Te reté a un UNO y ya están las cartas!" : "¡Te toca jugar en el UNO!";
    const texto = `${o}: ${que} 🃏 Entra a jugar: ${E.rival.enlace || ctx.enlace || location.origin}`;
    if (ctx.prueba) { toast(`(prueba) Le mandaríamos: «${texto}»`); return; }
    if (navigator.share) {
      try { await navigator.share({ text: texto }); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    window.open("https://wa.me/?text=" + encodeURIComponent(texto), "_blank", "noopener");
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
    const j = E.partida, sinEmpezar = j.jugadas === 0 && E.modo === "vivo", o = nombreOtro();
    const pregunta = sinEmpezar ? (j.creado_por === yo() ? `¿Cancelar el reto a ${o}?` : `¿Rechazar el reto de ${o}?`)
      : E.modo === "compu" ? "¿Te rindes ante la compu?" : `¿Te rindes? ${mayus(o)} gana la mano.`;
    if (!confirm(pregunta)) return;
    const e = E;
    let r = null;
    try { r = await E.mesa.rendirse(j.id); }
    catch (er) { if (E === e) toast("No se pudo. Revisa tu conexión."); return; }
    if (E !== e || !r) return;
    if (r.estado === "cancelada") { if (E.mesaRef) E.mesaRef.resumen.activa = null; cambio(); irAlReto(false, ""); return; }
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
    if (E.modo === "vivo") refrescar(E.mesaRef);
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
      c.append(principal(conCompu ? "Otra práctica 🤖" : `Retar a ${E.rival.nombre} 🃏`, () => (conCompu ? nuevaPractica() : irAlReto(false, "")), "otra"));
      c.append(boton(CL().enlace, "Volver a los juegos", () => salir(), "salir"));
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
      c.append(nodo("p", "bn-nota", titulo));
      const fila = nodo("div", "uno-resto");
      U.ordenar(cartas).forEach((x) => fila.append(dibujoCarta(x, "chica")));
      c.append(fila);
    };
    if (gane) resto(`A ${o} le quedaron:`, E.manoRival);
    else resto("Te quedaron:", E.mano);
    if (!conCompu) {
      const m = marcadorDe(E.mesaRef, j), p = puntosDe(E.mesaRef, j);
      if (m) c.append(nodo("p", "bn-nota", m));
      if (p) c.append(nodo("p", "bn-nota", p));
    }
    c.append(principal("Revancha 🃏", () => (conCompu ? nuevaPractica() : irAlReto(true, j.apuesta)), "otra"));
    if (conCompu) c.append(boton(CL().secundario, varios() ? "Retar a alguien de verdad 🃏" : `Retar a ${todas()[0].rival.nombre} de verdad 🃏`, () => abrir("vivo"), "de-verdad"));
    const otra = linkOtraPersona();
    if (otra) c.append(otra);
    c.append(boton(CL().enlace, "Volver a los juegos", () => salir(), "salir"));
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

  // ---------- al día aunque se corte el tiempo real ----------
  // El canal puede quedar sordo sin que se note (el teléfono durmió, cambió la red, venció la sesión). Con la mesa
  // abierta se le pregunta a la base cada 5 s, al volver a la app y cuando vuelve el canal; si algo cambió, entra por
  // el mismo camino que el tiempo real: primero las jugadas que faltan (las de después de lo que ya se sabe), en orden,
  // y después la partida.
  let revisando = false;
  async function revisar() {
    if (revisando || document.hidden || !vistaAbierta() || E.modo !== "vivo" || !E.mesaRef || E.cola || E.ocupado || E.error) return;
    const e = E, m = E.mesaRef, antes = E.partida;
    revisando = true;
    try {
      let j = await E.mesa.activa();
      if (!j && enJuego(antes)) {
        j = (await E.mesa.historial()).find((h) => h.id === antes.id) || null; // ya terminó
        if (!j) { if (E === e && !E.cola) recargar(); return; } // o la cancelaron: como al abrirla de nuevo
      }
      if (E !== e || E.cola || !j) return;
      const a = E.partida;
      if (a && a.id === j.id && a.estado === j.estado && hora(a.actualizado_en) === hora(j.actualizado_en)) return; // nada nuevo
      if (a && a.id === j.id && E.mesa.jugadas) {
        const jugadas = await E.mesa.jugadas(j.id);
        if (E !== e || E.cola) return;
        jugadas.filter((d) => hora(d.creado_en) > hora(a.actualizado_en)).forEach((d) => alLlegar(m, "jugada", d));
      }
      alLlegar(m, "uno", j);
    } catch (er) { /* sin red: se intenta en la próxima vuelta */ }
    finally { revisando = false; }
  }
  // de paso, el canal que se cayó sin avisar se vuelve a abrir (si está bien, no se toca)
  const ponerAlDia = () => { if (!ctx || document.hidden) return; todas().forEach((m) => { if (m.ad.reabrir) m.ad.reabrir(); }); revisar(); };
  setInterval(ponerAlDia, 5000);

  // ---------- arranque ----------
  function apagarTodo() {
    mesas.forEach(cerrarMesa);
    mesas = new Map();
    if (familia) familia.apagar();
    familia = null;
  }
  // op: { app, sb, prueba, yo: { id, nombre, av | avatar y color }, rivales: [{ id, nombre, av | avatar y color, grupo,
  //       ideas, enlace, adaptador }], enlace, toast, lluvia, vibrar, renderAvatares, alCambiar }
  function iniciar(op) {
    if (vistaAbierta()) cerrar();
    apagarTodo();
    ctx = op;
    compu = null;
    ponerRivales(op.rivales || []);
  }
  // La app avisa cuando cambian las personas (p. ej. llegó la lista del Recreo)
  function rivales(lista) { if (ctx) ponerRivales(lista); }
  // Al volver a la app: ponerse al día (el tiempo real no repite lo que pasó con el teléfono dormido)
  async function alDia() {
    if (!ctx) return;
    todas().forEach((m) => { if (m.ad.reabrir) m.ad.reabrir(); refrescar(m); });
    if (vistaAbierta() && E.modo === "vivo" && E.mesaRef) recargar();
  }
  window.addEventListener("popstate", () => { if (vistaAbierta() && !(history.state && history.state.uno)) cerrar(); });
  // con la app en segundo plano no se está mirando la mesa; al volver, se revisa al tiro si algo pasó
  document.addEventListener("visibilitychange", () => {
    if (E && E.mesaRef) E.mesaRef.ad.presencia(!document.hidden && vistaAbierta() && E.modo === "vivo");
    ponerAlDia();
  });

  window.Uno = { iniciar, rivales, tarjeta, abrir, alDia };
})();
