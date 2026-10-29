// Batalla naval ⚓ · la pantalla
// Un juego en vivo para dos, cada uno en su teléfono: cada uno acomoda su flota en secreto y se turnan para disparar
// (si aciertas, vuelves a disparar). Antes de empezar se puede apostar algo ("Quien pierde…").
// La usan las dos apps y el archivo es el mismo en las dos (lo revisa familia/herramientas/paridad.mjs). La app dice
// con quién se puede jugar (ctx.rivales): si hay más de una persona, primero se elige ("¿Con quién juegas?"); las que
// vienen con grupo "otros" (los del Recreo, en la app principal) salen aparte, bajo «Otros».
// La base (supabase/batalla.sql) guarda las flotas en secreto y resuelve los disparos. Para la otra persona de la
// cuenta, la app principal trae su propio adaptador (rival.adaptador, con avisos push); con la familia se juega por
// batalla_retar, desde cualquiera de las dos apps (sin push: el aviso va por WhatsApp).
// Las mismas reglas en JavaScript (batalla-motor.js) sirven para practicar contra la compu y para probar sin la base:
// en modo prueba, cada par de personas tiene su mesa en localStorage y las pestañas se avisan con BroadcastChannel.
(() => {
  "use strict";
  const M = window.BatallaMotor;
  if (!M) return;
  const { LADO, TAMANOS, TOTAL, NOMBRES, LETRAS, nombreCelda } = M;
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
  const ICONO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="4.6" r="1.8"/><path d="M12 6.4v14"/><path d="M8.2 9.6h7.6"/><path d="M4.4 13.2c.4 4.3 3.7 6.9 7.6 6.9s7.2-2.6 7.6-6.9"/><path d="M2.8 14.8l1.6-1.8 1.9 1.5M21.2 14.8l-1.6-1.8-1.9 1.5"/></svg>';
  const X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>';
  const SONIDO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
  const MUDO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
  const JUGAR_SVG = '<svg class="ico" aria-hidden="true"><use href="#i-jugar"/></svg>'; // (solo en el Recreo: el ícono es de su página)

  let ctx = null;            // lo que pasa la app: app, sb, prueba, yo, rivales, enlace, toast, lluvia, vibrar, renderAvatares, alCambiar
  let mesas = new Map();     // id de cada rival → { rival, ad (su adaptador), resumen: { activa, historial }, presente, quitar }
  let familia = null;        // el canal de las batallas de familia (Supabase): uno solo para todas
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
  const enCurso = (b) => !!b && (b.estado === "colocando" || b.estado === "jugando");
  const acabada = (b) => !!b && (b.estado === "terminada" || b.estado === "cancelada");
  const hora = (iso) => new Date(iso).getTime() || 0;
  const todas = () => Array.from(mesas.values());
  const varios = () => mesas.size > 1;
  const cambio = () => { if (ctx && ctx.alCambiar) ctx.alCambiar(); };
  // Lo que se anima al cambiar (un disparo, el turno) sigue su animación aunque la pantalla se vuelva a dibujar:
  // --d (en batalla.css) adelanta la animación lo que ya pasó
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
    apuntar: () => tono(980, 0.04, "sine", 0.025),
    mover: () => tono(560, 0.06, "sine", 0.035),
    disparo: () => tono(700, 0.14, "sine", 0.04, 320),
    agua: () => { tono(260, 0.22, "sine", 0.06, 110, 0.05); tono(520, 0.1, "triangle", 0.025, 300, 0.07); },
    tocado: () => { tono(140, 0.38, "sawtooth", 0.07, 45, 0.05); tono(90, 0.3, "square", 0.03, 40, 0.07); },
    hundido: () => { SON.tocado(); [392, 330, 262].forEach((f, i) => tono(f, 0.22, "triangle", 0.05, 0, 0.4 + i * 0.16)); },
    turno: () => { tono(880, 0.09, "triangle", 0.05); tono(1175, 0.14, "triangle", 0.05, 0, 0.09); },
    gana: () => [523, 659, 784, 1046].forEach((f, i) => tono(f, i === 3 ? 0.45 : 0.15, "triangle", 0.07, 0, 0.6 + i * 0.14)),
    pierde: () => [392, 330, 262].forEach((f, i) => tono(f, i === 2 ? 0.4 : 0.2, "triangle", 0.05, 0, 0.5 + i * 0.2)),
  };

  // ---------- adaptadores: la misma forma para la base, la mesa entre pestañas y la compu ----------
  // activa, historial, crear, colocar, disparar, rendirse, miFlota, flotaRival, disparos; escuchar(fn) avisa
  // ("batalla", fila), ("disparo", disparo), ("presencia", ¿el otro tiene esta mesa abierta?) y ("conectado") cuando
  // el canal vuelve después de caerse; presencia(si), reabrir, apagar y, solo si hay push, avisar(id).
  const conError = (r) => { if (r.error) throw r.error; return r.data; };
  const fila = (d) => (d && d.id ? d : null); // una función que no encuentra nada devuelve una fila vacía
  // Un solo canal para todas las batallas de familia: llegan las mías (RLS) y se reparten por rival; y la presencia,
  // donde cada uno anota con quién tiene la mesa abierta ({ con }). Si se cae, se vuelve a abrir solo (vivo-canal.js).
  function canalFamilia() {
    if (familia) return familia;
    const sb = ctx.sb, yoId = yo();
    const F = { viendo: null, oyentes: new Map(), deQuien: new Map() }; // deQuien: id de batalla → rival
    const emitir = (rivalId, tipo, f) => { const s = F.oyentes.get(rivalId); if (s) s.forEach((fn) => fn(tipo, f)); };
    F.recordar = (b) => { if (b && b.id) F.deQuien.set(b.id, b.creado_por === yoId ? b.rival : b.creado_por); };
    F.vivo = window.VivoCanal(sb, "vivo-batalla-familia", { config: { presence: { key: yoId } } }, (c) => {
      c.on("postgres_changes", { event: "*", schema: "public", table: "batallas" }, (p) => {
        const b = p.new;
        if (!b || !b.id || !b.familia || (b.creado_por !== yoId && b.rival !== yoId)) return;
        F.recordar(b);
        emitir(F.deQuien.get(b.id), "batalla", b);
      })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "batalla_disparos" }, (p) => {
          const d = p.new;
          if (d && d.id && F.deQuien.has(d.batalla_id)) emitir(F.deQuien.get(d.batalla_id), "disparo", d);
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
    return {
      modo: "vivo",
      async activa() {
        const b = conError(await delPar(sb.from("batallas").select("*")).in("estado", ["colocando", "jugando"])
          .order("creado_en", { ascending: false }).limit(1))[0] || null;
        F.recordar(b);
        return b;
      },
      async historial() {
        const h = conError(await delPar(sb.from("batallas").select("id, estado, creado_por, rival, ganador, rendido, apuesta, creado_en, actualizado_en"))
          .eq("estado", "terminada").order("actualizado_en", { ascending: false }).limit(300)) || [];
        h.forEach(F.recordar);
        return h;
      },
      async crear(apuesta) {
        const b = fila(conError(await sb.rpc("batalla_retar", { p_rival: rival.id, p_apuesta: apuesta || null })));
        F.recordar(b);
        return b;
      },
      async colocar(id, barcos) { return fila(conError(await sb.rpc("batalla_colocar", { p_id: id, p_barcos: barcos }))); },
      async disparar(id, celda) { return fila(conError(await sb.rpc("batalla_disparar", { p_id: id, p_celda: celda }))); },
      async rendirse(id) { return fila(conError(await sb.rpc("batalla_rendirse", { p_id: id }))); },
      async miFlota(id) {
        const d = conError(await sb.from("batalla_flotas").select("barcos").eq("batalla_id", id).eq("usuario_id", yoId).maybeSingle());
        return d ? d.barcos : null;
      },
      async flotaRival(id) { return conError(await sb.rpc("batalla_flota_rival", { p_id: id })) || null; },
      async disparos(id) { return conError(await sb.from("batalla_disparos").select("*").eq("batalla_id", id).order("id")) || []; },
      escuchar(fn) { return F.escuchar(rival.id, fn); },
      reabrir() { F.reabrir(); },
      presencia(si) { if (si) F.ver(rival.id); else if (F.viendo === rival.id) F.ver(null); },
      apagar() {},
    };
  }
  // Modo prueba: cada par de personas tiene su mesa en localStorage y las pestañas se avisan con BroadcastChannel
  function adaptadorPrueba(rival) {
    const yoId = yo(), CLAVE = `vivo-batalla-${[yoId, rival.id].sort().join("-")}`;
    let bc = null, alCambio = null, viendo = false;
    try { bc = new BroadcastChannel(CLAVE); } catch (e) {}
    const enviar = (m) => { try { if (bc) bc.postMessage(m); } catch (e) {} };
    const mesa = M.mesaLocal({
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
    const mesa = M.mesaLocal({ yo: yo(), otro: COMPU, compu: COMPU, guardar: (l) => (memoria = l), cargar: () => memoria });
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

  // ---------- lo que se sabe de una batalla ----------
  const soyParte = (b) => !!b && (b.creado_por === yo() || b.rival === yo());
  const rivalDe = (b) => (b.creado_por === yo() ? b.rival : b.creado_por);
  const listo = (b, id) => !!b && (b.listos || []).indexOf(id) >= 0;
  const misDisparos = () => E.disparos.filter((d) => d.usuario_id === yo());
  const susDisparos = () => E.disparos.filter((d) => d.usuario_id !== yo());
  const aciertos = (lista) => lista.filter((d) => d.resultado !== "agua").length;
  // Cuál barco era uno hundido: lo dice la base (barco_n); si no, por su tamaño (el primer barco de 3 es el crucero)
  function indiceHundido(d, previos) {
    if (d.barco_n != null) return d.barco_n;
    const tam = d.barco.length;
    if (tam !== 3) return TAMANOS.indexOf(tam);
    return previos.some((x) => x.barco && x.barco.length === 3) ? 3 : 2;
  }
  const hundidosDe = (lista) => lista.filter((d) => d.barco).map((d, k, todos) => indiceHundido(d, todos.slice(0, k)));
  const nombreMio = (celdas) => { const i = (E.miFlota || []).findIndex((b) => b.indexOf(celdas[0]) >= 0); return i >= 0 ? NOMBRES[i] : "barco"; };

  // ---------- cómo va cada mesa (para la tarjeta, el «¿Con quién juegas?» y los avisos) ----------
  // nivel 3: te toca a ti (disparar o acomodar tu flota); 2: esperas al otro; 1: terminó hace poco; 0: nada
  function estado(m) {
    const b = m.resumen.activa, o = m.rival.nombre, h = m.resumen.historial[0];
    if (b && soyParte(b)) {
      if (b.estado === "jugando") {
        return b.turno === yo() ? { nivel: 3, corto: "🎯 ¡Te toca!", t1: "🎯 ¡Te toca disparar!", t2: `En la batalla con ${o}` }
          : { nivel: 2, corto: `Le toca a ${o}`, t1: `Le toca disparar a ${o}`, t2: m.presente ? `${o} está apuntando… 👀` : "Entra a ver cómo va la batalla" };
      }
      if (!listo(b, yo())) {
        if (b.creado_por !== yo()) return { nivel: 3, corto: "⚓ ¡Te retó!", t1: `⚓ ${o} te retó a una batalla`, t2: b.apuesta ? `Se juegan: «${b.apuesta}»` : "Acomoda tu flota y a jugar" };
        return { nivel: 3, corto: "Acomoda tu flota", t1: "Acomoda tu flota", t2: listo(b, rivalDe(b)) ? `La flota de ${o} ya está lista` : `${o} también está acomodando la suya` };
      }
      return { nivel: 2, corto: "Esperando…", t1: `Esperando a ${o}…`, t2: m.presente ? `${o} está acomodando su flota 👀` : "Tu flota ya está lista" };
    }
    if (h && Date.now() - hora(h.actualizado_en) < 36 * 3600000) {
      const gane = h.ganador === yo();
      return { nivel: 1, corto: gane ? "Ganaste la última 🏆" : `Ganó ${o} 😏`, t1: gane ? `Ganaste la última${varios() ? ` con ${o}` : ""} 🏆` : `${o} ganó la última 😏`,
        t2: m.presente ? `🟢 ${o} está mirando la batalla ahora` : "¿Revancha?" };
    }
    return { nivel: 0, corto: "Retar ⚓", t1: `Reta a ${o} ⚓`, t2: m.presente ? `🟢 ${o} está mirando la batalla ahora` : "En vivo, cada uno en su teléfono" };
  }
  // La mesa que más importa ahora (a igual nivel, la primera de la lista: la de la app principal va primero)
  function mesaPrincipal() {
    let mejor = null, nivelMejor = -1;
    todas().forEach((m) => { const n = estado(m).nivel; if (n > nivelMejor) { mejor = m; nivelMejor = n; } });
    return mejor;
  }
  // "Batallas ganadas · Tú 3 · Eli 2" (con `extra`, la que acaba de terminar aunque el historial no la tenga aún)
  function marcadorDe(m, extra) {
    let h = m.resumen.historial;
    if (extra && extra.estado === "terminada" && !h.some((x) => x.id === extra.id)) h = [extra].concat(h);
    if (!h.length) return null;
    const mias = h.filter((x) => x.ganador === yo()).length;
    return `Batallas ganadas · Tú ${mias} · ${m.rival.nombre} ${h.length - mias}`;
  }
  const listaNombres = (n, y) => (n.length < 2 ? n.join("") : `${n.slice(0, -1).join(", ")} ${y || "y"} ${n[n.length - 1]}`);
  // Lo que dice la tarjeta: [título, detalle, la mesa de la que habla (para su marcador) o nada]
  function textoTarjeta() {
    const m = mesaPrincipal(), e = estado(m);
    if (e.nivel > 0 || !varios()) return [e.t1, e.t2, m];
    const presente = todas().find((x) => x.presente);
    if (presente) return [`Reta a ${presente.rival.nombre} ⚓`, `🟢 ${presente.rival.nombre} está mirando la batalla ahora`, presente];
    const nombres = todas().map((x) => x.rival.nombre), otros = todas().filter((x) => x.rival.grupo === "otros");
    if (otros.length && otros.length < nombres.length) return [`Reta a ${m.rival.nombre} ⚓`, `o a ${listaNombres(otros.map((x) => x.rival.nombre))}, en «Otros»`, m];
    return ["¿Con quién juegas? ⚓", `${listaNombres(nombres, "o")}: elige a quién retar`, null];
  }
  function marcadorTarjeta(m) {
    if (m) return marcadorDe(m);
    const h = [].concat(...todas().map((x) => x.resumen.historial));
    return h.length ? `Batallas ganadas · ${h.filter((x) => x.ganador === yo()).length} de ${h.length}` : null;
  }
  function tarjeta() {
    if (!ctx || !mesas.size) return null;
    const m = mesaPrincipal(), e = estado(m), toca = e.nivel === 3, activa = todas().some((x) => enCurso(x.resumen.activa));
    const [t1, t2, deQuien] = textoTarjeta(), marcador = marcadorTarjeta(deQuien);
    const vivo = nodo("span", `bn-vivo${activa || todas().some((x) => x.presente) ? " encendido" : ""}`, "En vivo");
    const lema = "Cada uno acomoda su flota en secreto y se turnan para disparar. Si aciertas, vuelves a disparar.";
    const textoBoton = toca ? "¡Vamos!" : activa ? "Volver" : "Jugar";
    let b;
    if (ctx.app === "recreo") {
      b = boton(`j-carta tarjeta bn-carta${toca ? " toca" : ""}`);
      const arte = nodo("span", "arte arte-vivo arte-batalla sticker"); arte.innerHTML = ICONO; arte.setAttribute("aria-hidden", "true");
      const info = nodo("span", "j-info"), nombre = nodo("strong", "j-nombre", "Batalla naval ");
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
      b = boton(`j-carta bn-carta${toca ? " toca" : ""}`);
      const ico = nodo("span", "j-icono"); ico.innerHTML = ICONO;
      const info = nodo("span", "j-info"), nombre = nodo("strong", "j-nombre", "Batalla naval ");
      nombre.append(vivo);
      info.append(nombre, nodo("small", "j-lema", lema));
      const est = nodo("span", "bn-estado-carta");
      est.append(nodo("b", null, t1), nodo("small", null, t2));
      info.append(est);
      if (marcador) info.append(nodo("span", "j-hoy", marcador));
      b.append(ico, info, nodo("span", "j-jugar", textoBoton));
    }
    b.setAttribute("aria-label", `Batalla naval, en vivo. ${t1}. ${t2}.${marcador ? ` ${marcador}.` : ""}`);
    b.addEventListener("click", () => abrir("vivo", e.nivel >= 2 ? m.rival.id : null));
    return b;
  }

  // Lo que llega de la base (o de la otra pestaña): la tarjeta, los avisos y, si está abierta, la vista
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
    if (tipo === "batalla") {
      const r = m.resumen, antes = r.activa && r.activa.id === f.id ? r.activa : null;
      if (enCurso(f)) r.activa = f;
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
    if (!antes && f.estado === "colocando" && f.creado_por !== yo()) { toast(`⚓ ${o} te retó a una batalla naval`); vibrar([80, 60, 80]); }
    else if (!antes) return;
    else if (antes.estado === "colocando" && f.estado === "jugando") toast(f.turno === yo() ? `⚓ ¡Empezó la batalla con ${o}! Disparas tú primero 🎯` : `⚓ ¡Empezó la batalla naval con ${o}!`);
    else if (f.estado === "jugando" && f.turno === yo() && antes.turno !== yo()) { toast(`🎯 Te toca disparar en la batalla con ${o}`); vibrar([40, 30, 40]); }
    else if (f.estado === "terminada" && antes.estado === "jugando") toast(f.ganador === yo() ? `🏆 ¡Le ganaste la batalla naval a ${o}!${f.rendido ? ` Se rindió` : ""}` : `${o} ganó la batalla naval 😏 ¿Revancha?`);
    else if (f.estado === "cancelada") toast(`El reto de batalla naval con ${o} quedó cancelado`);
  }
  function alLlegarVista(tipo, f) {
    if (E.cola) { E.cola.push([tipo, f]); return; } // cargando: se aplica al terminar
    if (tipo === "batalla") ponerBatalla(f);
    else if (tipo === "disparo" && E.batalla && f.batalla_id === E.batalla.id) recibirDisparo(f);
  }

  // ---------- la vista (pantalla completa, con el marco de los demás juegos) ----------
  function montarVista() {
    if (V) return;
    V = {};
    const raiz = nodo("div", "jv bn"); raiz.hidden = true;
    raiz.setAttribute("role", "dialog"); raiz.setAttribute("aria-modal", "true"); raiz.setAttribute("aria-labelledby", "bn-titulo");
    const marco = nodo("div", "jv-marco bn-marco");
    const barra = nodo("header", "jv-barra");
    V.cerrar = boton("jv-boton", null, () => salir()); V.cerrar.innerHTML = X_SVG; V.cerrar.setAttribute("aria-label", "Volver a los juegos");
    V.titulo = nodo("h2", "jv-titulo", "Batalla naval"); V.titulo.id = "bn-titulo";
    V.sonido = boton("jv-boton", null, () => { anotar(CLAVE_MUDO(), mudo() ? "0" : "1"); pintarSonido(); activarAudio(); });
    barra.append(V.cerrar, V.titulo, V.sonido);
    V.cuerpo = nodo("div", "bn-cuerpo");
    V.voz = nodo("p", "sr"); V.voz.setAttribute("aria-live", "polite"); // lo importante, para el lector de pantalla
    marco.append(barra, V.cuerpo, V.voz);
    raiz.append(marco);
    document.body.append(raiz);
    V.raiz = raiz;
    raiz.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); salir(); } });
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
      batalla: null, disparos: [], miFlota: null, flotaRival: null, borrador: null,
      seleccion: null, apuntada: null, vista: "su", editando: false, mensaje: "", nuevo: null, turnoEn: 0, ocupado: false,
      apuesta: "", revancha: false, error: null, avisadoEn: 0, cursor: {}, cola: null,
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
      history.pushState({ batalla: true }, ""); // "atrás" en Android cierra la batalla
    }
    verPresencia();
    V.raiz.dataset.modo = modo;
    V.titulo.textContent = modo === "compu" ? "Batalla naval · práctica" : "Batalla naval";
    delete V.raiz.dataset.fase;
    if (modo === "vivo" && !m) { pintar(); enfocar(); return; } // «¿Con quién juegas?»
    V.cuerpo.innerHTML = "";
    V.cuerpo.append(nodo("p", "bn-cargando", "Preparando los barcos…"));
    await cargarBatalla();
    if (E !== e) return;
    if (modo === "compu" && !E.batalla && !E.error) {
      const b = await compu.crear(null); // la compu acomoda su flota al tiro
      if (E !== e) return;
      if (!E.batalla) ponerBatalla(b);
    }
    if (modo === "compu") compu.reanudar();
    pintar();
    enfocar();
  }
  function enfocar() {
    const p = V.cuerpo.querySelector(".bn-principal:not([disabled]), .bn-persona") || V.cerrar;
    p.focus({ preventScroll: true });
  }
  // Trae la batalla en curso con sus disparos y mi flota. Lo que llegue por el tiempo real mientras tanto se
  // guarda en E.cola y se aplica después (si no, un disparo podía perderse entre la consulta y la respuesta).
  async function cargarBatalla() {
    const e = E;
    E.cola = [];
    try {
      let b = await E.mesa.activa();
      // la que estabas jugando terminó mientras no mirabas: se muestra cómo terminó
      if (!b && enCurso(E.batalla)) b = (await E.mesa.historial()).find((h) => h.id === E.batalla.id) || null;
      const [disparos, flota, rival] = b ? await Promise.all([E.mesa.disparos(b.id), E.mesa.miFlota(b.id),
        b.estado === "terminada" ? E.mesa.flotaRival(b.id) : null]) : [[], null, null];
      if (E !== e) return;
      const misma = !!E.batalla && !!b && E.batalla.id === b.id; // al volver a la app: no se pierde lo que estabas haciendo
      Object.assign(E, {
        batalla: b, disparos, miFlota: flota, flotaRival: rival, error: null,
        borrador: misma && E.borrador ? E.borrador : flota ? null : M.flotaAlAzar(),
        editando: misma && E.editando, seleccion: misma ? E.seleccion : null, apuntada: misma ? E.apuntada : null,
        vista: misma ? E.vista : b && b.estado === "jugando" && b.turno !== yo() ? "mia" : "su",
      });
    } catch (er) {
      if (E !== e) return;
      E.error = "No se pudo abrir la batalla. Revisa tu conexión e intenta de nuevo.";
    }
    const cola = E.cola;
    E.cola = null;
    cola.forEach(([tipo, f]) => alLlegarVista(tipo, f));
  }
  async function recargar() { const e = E; await cargarBatalla(); if (E === e) pintar(); }
  function salir() {
    if (!(history.state && history.state.batalla)) { cerrar(); return; }
    history.back(); // → popstate → cerrar
    setTimeout(() => { if (vistaAbierta() && history.state && history.state.batalla) cerrar(); }, 500); // por si el navegador no vuelve
  }
  function cerrar() {
    if (!V || V.raiz.hidden) return;
    soltarPresencia();
    V.raiz.hidden = true;
    document.body.classList.remove("con-juego");
    fondoInerte(false);
    E = null;
    todas().forEach(refrescar);
    if (V.foco && V.foco.focus && document.contains(V.foco)) V.foco.focus({ preventScroll: true });
  }

  // La fase según lo que se sabe
  function fase() {
    const b = E.batalla;
    if (E.error) return "error";
    if (E.modo === "vivo" && !E.mesaRef) return "lobby";
    if (!b) return "reto";
    if (b.estado === "colocando") return listo(b, yo()) && !E.editando ? "espera" : "colocar";
    if (b.estado === "jugando") return "juego";
    return "fin";
  }
  const PINTAR = {};
  function pintar() {
    if (!vistaAbierta() || E.cola) return; // (cargando: se dibuja al terminar)
    const a = document.activeElement, foco = a && V.cuerpo.contains(a) ? a.dataset.foco : null;
    const f = fase(), y = V.cuerpo.scrollTop, otraFase = V.raiz.dataset.fase !== f;
    V.raiz.dataset.fase = f;
    V.cuerpo.innerHTML = "";
    if (E.modo === "compu") avisoDesdeCompu();
    PINTAR[f]();
    V.cuerpo.scrollTop = otraFase ? 0 : y;
    if (ctx.renderAvatares) ctx.renderAvatares();
    if (foco) { const n = V.cuerpo.querySelector(`[data-foco="${foco}"]`); if (n) n.focus({ preventScroll: true }); }
  }
  PINTAR.error = () => {
    V.cuerpo.append(nodo("p", "bn-texto", E.error), boton(CL().principal, "Intentar de nuevo", () => { E.error = null; recargar(); }, "reintentar"));
  };
  // ---------- 0 · ¿con quién juegas? ----------
  PINTAR.lobby = () => {
    const c = V.cuerpo, propias = todas().filter((m) => m.rival.grupo !== "otros"), otros = todas().filter((m) => m.rival.grupo === "otros");
    c.append(nodo("p", "jv-ojo", "En vivo · cada uno en su teléfono"));
    c.append(nodo("h3", "jv-h", "¿Con quién juegas? ⚓"));
    const fila = (m) => {
      const e = estado(m), b = boton(`bn-persona${e.nivel === 3 ? " toca" : ""}${m.presente ? " en-linea" : ""}`, null, () => elegir(m.rival.id), `persona-${m.rival.id}`);
      const txt = nodo("span", "bn-persona-txt"), marcador = marcadorDe(m);
      txt.append(nodo("b", null, m.rival.nombre), nodo("small", null, marcador || (m.presente ? "🟢 Está mirando la batalla" : "Todavía no juegan una")));
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
  // Practicando con la compu, si una batalla de verdad te espera, se ofrece volver
  function avisoDesdeCompu() {
    const m = todas().find((x) => estado(x).nivel === 3);
    if (!m) return;
    const e = estado(m), d = nodo("div", "bn-volver");
    d.append(nodo("span", null, `${e.t1}${varios() ? ` · ${m.rival.nombre}` : ""}`), boton(CL().chico, "Volver ⚓", () => abrir("vivo", m.rival.id), "volver-vivo"));
    V.cuerpo.append(d);
  }
  function apuestaVer(texto, deuda) { return nodo("p", `bn-apuesta-ver${deuda ? " deuda" : ""}`, texto); }
  function principal(texto, fn, foco) { return boton(CL().principal, texto, fn, foco); }

  // ---------- 1 · retar ----------
  PINTAR.reto = () => {
    const c = V.cuerpo, o = E.rival.nombre, m = E.mesaRef;
    c.append(nodo("p", "jv-ojo", E.revancha ? "¿Otra?" : "En vivo · cada uno en su teléfono"));
    c.append(nodo("h3", "jv-h", E.revancha ? `La revancha con ${o} ⚓` : `Reta a ${o} a una batalla naval ⚓`));
    if (!E.revancha) c.append(nodo("p", "bn-texto", "Cada uno acomoda su flota en secreto: portaaviones, acorazado, crucero, submarino y lancha. Se turnan para disparar y, si aciertas, vuelves a disparar. Gana quien hunda primero toda la flota del otro."));
    if (m.presente) c.append(nodo("p", "bn-presente", `🟢 ${o} está mirando la batalla ahora`));
    const caja = nodo("div", "bn-caja");
    const lab = nodo("label", null, "¿Qué se apuestan? (si quieren)"); lab.htmlFor = "bn-apuesta";
    const t = nodo("textarea", "papel bn-apuesta"); t.id = "bn-apuesta"; t.maxLength = 120; t.rows = 2;
    t.placeholder = "Quien pierde…"; t.value = E.apuesta; t.dataset.foco = "apuesta";
    t.addEventListener("input", () => (E.apuesta = t.value));
    const ideas = nodo("div", "bn-ideas");
    (E.rival.ideas || IDEAS).forEach((i, k) => ideas.append(boton("bn-idea", i, () => { t.value = E.apuesta = i; t.focus(); }, `idea-${k}`)));
    caja.append(lab, t, ideas);
    const retar = principal(`Retar a ${o} ⚓`, () => crearBatalla(retar, t.value.trim()), "retar");
    c.append(caja, retar, boton(CL().secundario, "Practicar contra la compu 🤖", () => abrir("compu"), "practicar"));
    const marcador = marcadorDe(m), otra = linkOtraPersona();
    if (marcador) c.append(nodo("p", "bn-nota", marcador));
    if (otra) c.append(otra);
  };
  async function crearBatalla(btn, apuesta) {
    const e = E, o = E.rival.nombre;
    btn.disabled = true;
    let b = null;
    try { b = await E.mesa.crear(apuesta); if (!b) throw new Error("sin batalla"); }
    catch (er) { if (E === e) { toast("No se pudo enviar el reto. Revisa tu conexión."); btn.disabled = false; } return; }
    if (E !== e) return;
    E.mesaRef.resumen.activa = b;
    cambio();
    if (b.creado_por === yo() && b.estado === "colocando" && !listo(b, yo())) {
      toast(ctx.prueba ? `(prueba) Reto enviado a ${o}` : E.mesa.avisar ? `Le avisamos a ${o} ⚓ Mientras, acomoda tu flota` : `Reto listo ⚓ Avísale a ${o} y mientras, acomoda tu flota`);
      ponerBatalla(b);
    } else {
      // ya había una en curso (p. ej. el otro retó justo al mismo tiempo): se trae entera
      if (b.creado_por !== yo()) toast(`⚓ ${o} ya te había retado: ¡a la batalla!`);
      recargar();
    }
  }

  // ---------- 2 · acomodar la flota ----------
  PINTAR.colocar = () => {
    const c = V.cuerpo, b = E.batalla, o = nombreOtro();
    if (!E.borrador) E.borrador = E.miFlota ? E.miFlota.map((x) => x.slice()) : M.flotaAlAzar();
    c.append(nodo("p", "jv-ojo", "En secreto 🤫"));
    c.append(nodo("h3", "jv-h", E.editando ? "Cambia tu flota" : "Acomoda tu flota"));
    if (b.apuesta && E.modo === "vivo") c.append(apuestaVer(`Se juegan: «${b.apuesta}»`));
    c.append(nodo("p", "bn-ayuda", E.seleccion == null
      ? "Toca un barco para elegirlo y después toca dónde lo quieres. Tócalo otra vez para girarlo."
      : `${NOMBRES[E.seleccion]}: toca dónde ponerlo, o tócalo otra vez para girarlo.`));
    c.append(grilla("edicion"));
    const barcos = nodo("div", "bn-barcos");
    barcos.setAttribute("role", "group"); barcos.setAttribute("aria-label", "Elige un barco");
    NOMBRES.forEach((n, i) => {
      const ch = boton(`bn-chip${E.seleccion === i ? " on" : ""}`, null, () => { E.seleccion = E.seleccion === i ? null : i; pintar(); }, `chip-${i}`);
      ch.append(mini(TAMANOS[i]), n);
      ch.setAttribute("aria-label", `${n}, ${TAMANOS[i]} casillas`);
      ch.setAttribute("aria-pressed", String(E.seleccion === i));
      barcos.append(ch);
    });
    c.append(barcos);
    const fila = nodo("div", "bn-fila");
    const girarB = boton(CL().chico, "Girar ⟳", () => girar(), "girar");
    girarB.disabled = E.seleccion == null;
    fila.append(boton(CL().chico, "Al azar 🎲", () => { E.borrador = M.flotaAlAzar(); E.seleccion = null; SON.mover(); pintar(); }, "azar"), girarB);
    c.append(fila);
    const listoB = principal(E.editando ? "Guardar mi flota ⚓" : "¡Listo, a la batalla! ⚓", () => colocar(listoB), "listo");
    c.append(listoB);
    if (E.modo === "vivo") {
      c.append(nodo("p", "bn-nota", listo(b, rivalDe(b)) ? `La flota de ${o} ya está lista ✓ La batalla empieza apenas acomodes la tuya.`
        : E.mesaRef.presente ? `${mayus(o)} también está acomodando la suya 👀` : `${mayus(o)} todavía no acomoda la suya.`));
    }
    if (E.editando) c.append(boton(CL().enlace, "Dejarla como estaba", () => { E.editando = false; E.borrador = null; E.seleccion = null; pintar(); }, "dejar"));
    else if (E.modo === "compu") c.append(boton(CL().enlace, "Volver", () => abrir("vivo"), "volver"));
    else c.append(boton(CL().enlace, b.creado_por === yo() ? "Cancelar el reto" : "Rechazar el reto", () => cancelar(), "cancelar"));
  };
  function mini(n) {
    const s = nodo("span", "bn-mini"); s.style.setProperty("--n", n); s.setAttribute("aria-hidden", "true");
    return s;
  }
  function girar() {
    if (E.seleccion == null) return;
    const r = M.girarBarco(E.borrador, E.seleccion);
    if (!r) { toast("Ahí no cabe girado: muévelo un poco primero"); return; }
    E.borrador = r; SON.mover(); pintar();
  }
  // Mover el barco elegido para que quede sobre la celda tocada: si no cabe desde ahí, se corre hacia atrás, y si
  // así tampoco, se prueba girado
  function moverCerca(barcos, i, celda) {
    const tam = barcos[i].length, era = M.esVertical(barcos[i]);
    for (const vertical of [era, !era]) {
      for (let atras = 0; atras < tam; atras++) {
        const inicio = vertical ? celda - atras * LADO : celda - atras;
        if (inicio < 0 || (!vertical && M.fila(inicio) !== M.fila(celda))) break;
        const r = M.moverBarco(barcos, i, inicio, vertical);
        if (r) return r;
      }
    }
    return null;
  }
  function tocarEdicion(celda) {
    const i = E.borrador.findIndex((b) => b.indexOf(celda) >= 0);
    if (i >= 0) {
      if (E.seleccion === i) { girar(); return; } // tocar otra vez el elegido lo gira
      E.seleccion = i; SON.apuntar(); pintar(); return;
    }
    if (E.seleccion == null) { toast("Primero toca el barco que quieres mover"); return; }
    const r = moverCerca(E.borrador, E.seleccion, celda);
    if (!r) { toast("Ahí no cabe: elige otro lugar"); return; }
    E.borrador = r; SON.mover(); pintar();
  }
  async function colocar(btn) {
    const e = E, b = E.batalla, flota = E.borrador.map((x) => x.slice());
    const antes = { miFlota: E.miFlota, editando: E.editando };
    btn.disabled = true;
    // se ve al tiro; si la base no lo guarda, se vuelve atrás
    E.miFlota = flota; E.editando = false; E.seleccion = null;
    try {
      const r = await E.mesa.colocar(b.id, flota);
      if (E !== e) return;
      if (!r) throw new Error("sin respuesta");
      ponerBatalla(r);
      if (fase() === "espera") pintar();
    } catch (er) {
      if (E !== e) return;
      Object.assign(E, antes);
      toast("No se pudo guardar tu flota. Revisa tu conexión.");
      pintar();
    }
  }
  async function cancelar() {
    const e = E, rechazo = E.batalla.creado_por !== yo(), o = E.rival.nombre;
    if (!confirm(rechazo ? `¿Rechazar el reto de ${o}?` : `¿Cancelar el reto a ${o}?`)) return;
    try { await E.mesa.rendirse(E.batalla.id); } catch (er) { if (E === e) toast("No se pudo cancelar. Revisa tu conexión."); return; }
    if (E !== e) return;
    E.mesaRef.resumen.activa = null;
    cambio();
    irAlReto(false, "");
  }

  // ---------- 2b · esperando al otro ----------
  PINTAR.espera = () => {
    const c = V.cuerpo, b = E.batalla, o = nombreOtro(), vivo = E.modo === "vivo", presente = vivo && E.mesaRef.presente;
    c.append(nodo("p", "jv-ojo", "Tu flota está lista ⚓"));
    c.append(nodo("h3", "jv-h", `Esperando a que ${o} acomode la suya…`));
    c.append(nodo("p", "bn-texto", presente ? `${mayus(o)} está en la batalla, acomodando sus barcos 👀` : `Puedes salir y volver cuando quieras: ${E.mesa.avisar ? "te avisamos apenas empiece." : "la batalla te espera."}`));
    if (b.apuesta) c.append(apuestaVer(`Se juegan: «${b.apuesta}»`));
    c.append(grilla("mia"));
    if (vivo && !presente) c.append(botonAvisar(`🔔 Avisarle a ${o}`));
    c.append(boton(CL().secundario, "Cambiar mi flota", () => { E.editando = true; E.borrador = E.miFlota.map((x) => x.slice()); pintar(); }, "cambiar"));
    if (!vivo) return; // (contra la compu no se espera: acomoda su flota al tiro)
    c.append(boton(CL().secundario, "Mientras, practicar contra la compu 🤖", () => abrir("compu"), "practicar"));
    c.append(boton(CL().enlace, b.creado_por === yo() ? "Cancelar el reto" : "Rechazar el reto", () => cancelar(), "cancelar"));
    const otra = linkOtraPersona();
    if (otra) c.append(otra);
  };
  // "¡Avisarle!": con push si esta mesa lo tiene (una por minuto); si no, por WhatsApp (o lo que el teléfono ofrezca)
  function botonAvisar(texto) {
    if (!E.mesa.avisar) return boton(CL().chico + " bn-avisar", "💬 Avisarle por WhatsApp", () => avisarPorMensaje(), "avisar");
    const hace = Date.now() - E.avisadoEn < 60000;
    const btn = boton(CL().chico + " bn-avisar", hace ? "Le avisamos 🔔 ✓" : texto, async () => {
      const e = E;
      btn.disabled = true;
      let ok = false;
      try { ok = await E.mesa.avisar(E.batalla.id); }
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
    const b = E.batalla, o = E.rival.nombre;
    const que = b && b.estado === "jugando" ? (b.turno === yo() ? "La batalla naval sigue" : "¡Te toca disparar en la batalla naval!") : "¡Te reté a una batalla naval!";
    const texto = `${o}: ${que} ⚓ Entra a jugar: ${E.rival.enlace || ctx.enlace || location.origin}`;
    if (ctx.prueba) { toast(`(prueba) Le mandaríamos: «${texto}»`); return; }
    if (navigator.share) {
      try { await navigator.share({ text: texto }); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    window.open("https://wa.me/?text=" + encodeURIComponent(texto), "_blank", "noopener");
  }

  // ---------- 3 · la batalla ----------
  function empezo() {
    const mia = E.batalla.turno === yo();
    E.vista = mia ? "su" : "mia";
    E.turnoEn = Date.now();
    E.mensaje = mia ? "¡Empieza la batalla! La suerte dice que disparas tú primero 🎯" : `¡Empieza la batalla! La suerte dice que dispara ${nombreOtro()} primero`;
    decir(E.mensaje);
    SON.turno(); vibrar([40, 30, 40]);
    pintar();
  }
  PINTAR.juego = () => {
    const c = V.cuerpo, b = E.batalla, o = nombreOtro(), mia = b.turno === yo(), presente = E.modo === "vivo" && E.mesaRef.presente;
    // los dos: cuántos barcos le quedan a cada uno y a quién le toca
    const quedanMios = E.miFlota ? M.hundidos(E.miFlota, susDisparos().map((d) => d.celda)).filter((x) => !x).length : TAMANOS.length;
    const quedanSuyos = TAMANOS.length - hundidosDe(misDisparos()).length;
    const duelo = nodo("div", "bn-duelo");
    duelo.append(lado(ctx.yo, "Tú", quedanMios, mia), nodo("span", "bn-vs", "vs"),
      lado(E.modo === "compu" ? null : E.rival, mayus(o), quedanSuyos, !mia, presente));
    c.append(duelo);
    const turno = nodo("p", `bn-turno${mia ? " mio" : ""}`, mia ? "¡Te toca disparar! 🎯" : `Le toca a ${o}…`);
    if (mia) reciente(turno, E.turnoEn, 700, "pop");
    c.append(turno);
    if (!mia && E.modo === "vivo" && !presente) {
      const fuera = nodo("div", "bn-fuera");
      fuera.append(nodo("span", null, `${mayus(o)} no tiene la batalla abierta.`), botonAvisar("🔔 Avisarle que le toca"));
      c.append(fuera);
    }
    const vistas = nodo("div", "bn-vistas");
    vistas.setAttribute("role", "group"); vistas.setAttribute("aria-label", "Qué tablero ver");
    [["su", `Mar de ${mayus(o)} 🎯`], ["mia", "Mi flota ⚓"]].forEach(([v, t]) => {
      const x = boton(E.vista === v ? "on" : "", t, () => { E.vista = v; pintar(); }, `vista-${v}`);
      x.setAttribute("aria-pressed", String(E.vista === v));
      vistas.append(x);
    });
    c.append(vistas);
    c.append(grilla(E.vista));
    c.append(nodo("p", "bn-mensaje", E.mensaje || (mia ? "Toca una celda para apuntar y después «¡Fuego!» (o tócala otra vez)." : `${mayus(o)} está apuntando…`)));
    if (E.vista === "su") {
      const fuego = principal(E.apuntada == null ? (mia ? "Elige dónde disparar" : "Espera tu turno") : `¡Fuego en ${nombreCelda(E.apuntada)}! 💥`, () => disparar(), "fuego");
      fuego.classList.add("bn-fuego");
      fuego.disabled = !mia || E.apuntada == null || E.ocupado;
      c.append(fuego);
    } else if (mia) c.append(principal("Ir a disparar 🎯", () => { E.vista = "su"; pintar(); }, "ir"));
    c.append(flotaEstado());
    if (b.apuesta && E.modo === "vivo") c.append(nodo("p", "bn-nota", `Se juegan: «${b.apuesta}»`));
    c.append(boton(CL().enlace, "Rendirme 🏳️", () => rendirse(), "rendirse"));
    const otra = linkOtraPersona();
    if (otra && !mia) c.append(otra);
  };
  function lado(persona, nombre, quedan, leToca, enLinea) {
    const s = nodo("div", `bn-lado${leToca ? " toca" : ""}${enLinea ? " en-linea" : ""}`);
    const t = nodo("span", "bn-lado-txt");
    t.append(nodo("b", null, nombre), nodo("small", null, `${quedan} ${quedan === 1 ? "barco" : "barcos"} a flote`));
    s.append(avatarDe(persona), t);
    if (enLinea) s.title = "Tiene la batalla abierta";
    return s;
  }
  // Los barcos: los suyos que ya hundiste o los tuyos que siguen a flote
  function flotaEstado() {
    const ul = nodo("ul", "bn-flota");
    let hundido;
    if (E.vista === "su") { const ns = hundidosDe(misDisparos()); hundido = (i) => ns.indexOf(i) >= 0; }
    else { const h = E.miFlota ? M.hundidos(E.miFlota, susDisparos().map((d) => d.celda)) : []; hundido = (i) => !!h[i]; }
    NOMBRES.forEach((n, i) => {
      const li = nodo("li", hundido(i) ? "hundido" : null);
      li.append(mini(TAMANOS[i]), nodo("span", null, n));
      if (hundido(i)) li.setAttribute("aria-label", `${n}: hundido`);
      ul.append(li);
    });
    ul.setAttribute("aria-label", E.vista === "su" ? `Barcos de ${nombreOtro()}` : "Tus barcos");
    return ul;
  }
  function tocarSu(celda) {
    const b = E.batalla;
    if (!b || b.estado !== "jugando" || b.turno !== yo() || E.ocupado) return;
    if (misDisparos().some((d) => d.celda === celda)) { toast(`Ya disparaste a ${nombreCelda(celda)}`); return; }
    if (E.apuntada === celda) { disparar(); return; } // tocar dos veces la misma: ¡fuego!
    E.apuntada = celda; SON.apuntar();
    E.mensaje = `Apuntando a ${nombreCelda(celda)}…`;
    pintar();
  }
  async function disparar() {
    const e = E, b = E.batalla, celda = E.apuntada;
    if (!b || celda == null || E.ocupado || b.estado !== "jugando" || b.turno !== yo()) return;
    E.ocupado = true; SON.disparo(); pintar();
    let d = null;
    try { d = await E.mesa.disparar(b.id, celda); }
    catch (er) { if (E === e) { E.ocupado = false; toast("No se pudo disparar. Revisa tu conexión."); pintar(); } return; }
    if (E !== e) return;
    E.ocupado = false; E.apuntada = null;
    if (!d) { toast("Ese disparo no valió (¿cambió el turno?)"); recargar(); return; }
    if (!recibirDisparo(d)) pintar(); // (si ya había llegado por el tiempo real, solo se redibuja)
  }
  // Un disparo nuevo (mío o del otro): se suma una sola vez, suena, se cuenta y se ve
  function recibirDisparo(d) {
    if (!E || E.disparos.some((x) => x.id === d.id)) return false; // llega por la respuesta y por el tiempo real
    const previos = E.disparos.filter((x) => x.usuario_id === d.usuario_id && x.barco);
    E.disparos.push(d);
    E.nuevo = { id: d.id, en: Date.now() };
    if (E.apuntada === d.celda && d.usuario_id === yo()) E.apuntada = null;
    const mio = d.usuario_id === yo(), o = nombreOtro(), cel = nombreCelda(d.celda);
    if (mio) {
      if (d.resultado === "agua") { E.mensaje = `${cel}: ¡agua! 💦 Le toca a ${o}.`; SON.agua(); }
      else if (d.resultado === "tocado") { E.mensaje = `${cel}: ¡tocado! 💥 Dispara otra vez.`; SON.tocado(); vibrar(40); }
      else { E.mensaje = `¡Hundiste su ${NOMBRES[indiceHundido(d, previos)].toLowerCase()}! 🚢 Dispara otra vez.`; SON.hundido(); vibrar([60, 40, 120]); if (ctx.lluvia) ctx.lluvia("💥", 8); }
    } else {
      if (d.resultado === "agua") { E.mensaje = `${mayus(o)} disparó a ${cel}: ¡agua! 💦`; SON.agua(); }
      else if (d.resultado === "tocado") { E.mensaje = `${mayus(o)} te dio en ${cel} 💥`; SON.tocado(); vibrar([80, 40, 80]); }
      else { E.mensaje = `${mayus(o)} hundió tu ${nombreMio(d.barco).toLowerCase()} 😱`; SON.hundido(); vibrar([120, 60, 200]); }
      E.vista = "mia"; // para ver dónde te dio
    }
    decir(E.mensaje);
    // Lo que cambia en la batalla ya se sabe con el disparo (la fila nueva llega después por el tiempo real):
    // agua → le toca al otro; 17 aciertos → ganó. La base hace lo mismo, en la misma transacción.
    const b = E.batalla;
    if (b && b.estado === "jugando" && b.turno === d.usuario_id) {
      const sig = Object.assign({}, b, { actualizado_en: d.creado_en || b.actualizado_en });
      if (aciertos(E.disparos.filter((x) => x.usuario_id === d.usuario_id)) >= TOTAL) Object.assign(sig, { estado: "terminada", ganador: d.usuario_id, turno: null });
      else if (d.resultado === "agua") sig.turno = d.usuario_id === b.creado_por ? b.rival : b.creado_por;
      ponerBatalla(sig);
      return true;
    }
    pintar();
    return true;
  }
  // Llegó la batalla (de la base, de la otra pestaña o deducida de un disparo): se avisa lo que cambió
  function ponerBatalla(f) {
    if (!E || !f) return;
    const antes = E.batalla, o = nombreOtro();
    if (!antes || antes.id !== f.id) {
      // otra batalla: un reto nuevo o la revancha reemplaza a la que terminó (nunca a una en curso)
      if (enCurso(antes) || !enCurso(f) || !soyParte(f)) return;
      Object.assign(E, { batalla: f, disparos: [], miFlota: null, flotaRival: null, borrador: M.flotaAlAzar(), seleccion: null,
        apuntada: null, editando: false, mensaje: "", vista: "su", revancha: false });
      if (E.modo === "vivo" && f.creado_por !== yo()) {
        toast(antes ? `⚓ ¡${o} quiere la revancha!` : `⚓ ${o} te retó a una batalla naval`);
        SON.turno(); vibrar([80, 60, 80]);
      }
      pintar();
      return;
    }
    // una fila que llega tarde (de antes de algo que ya se sabe) no deshace lo nuevo
    const tf = hora(f.actualizado_en), ta = hora(antes.actualizado_en);
    if (tf && ta && tf < ta) return;
    E.batalla = f;
    if (antes.estado === "colocando" && f.estado === "jugando") { empezo(); return; }
    if (acabada(f)) { if (!acabada(antes)) terminar(); else pintar(); return; }
    if (f.estado === "jugando" && f.turno === yo() && antes.turno !== yo()) {
      E.turnoEn = Date.now();
      SON.turno(); vibrar([40, 30, 40]);
      decir("Te toca disparar");
      // un momento para ver su último disparo en tu flota y de vuelta a su mar
      const e = E;
      setTimeout(() => { if (E === e && E.batalla.estado === "jugando" && E.batalla.turno === yo() && E.vista !== "su") { E.vista = "su"; pintar(); } }, poco() ? 0 : 1400);
    }
    pintar();
  }
  async function rendirse() {
    if (!confirm(E.modo === "compu" ? "¿Te rindes ante la compu?" : `¿Te rindes? ${mayus(E.rival.nombre)} gana la batalla.`)) return;
    const e = E;
    try { const r = await E.mesa.rendirse(E.batalla.id); if (E === e && r) ponerBatalla(r); }
    catch (er) { if (E === e) toast("No se pudo. Revisa tu conexión."); }
  }

  // ---------- 4 · el final ----------
  async function terminar() {
    const e = E, b = E.batalla;
    E.apuntada = null; E.ocupado = false; E.vista = "su";
    if (b.estado === "terminada") {
      const gane = b.ganador === yo();
      if (gane) { SON.gana(); vibrar([60, 40, 60, 40, 220]); if (ctx.lluvia) setTimeout(() => ctx.lluvia(e.modo === "compu" ? "⚓" : "🏆", 16), 500); }
      else SON.pierde();
      decir(gane ? "¡Ganaste la batalla!" : `${mayus(nombreOtro())} ganó la batalla`);
    }
    pintar();
    if (E.modo === "vivo") refrescar(E.mesaRef);
    if (b.estado !== "terminada") return;
    let flota = null;
    try { flota = await E.mesa.flotaRival(b.id); } catch (er) {}
    if (E !== e || !flota) return;
    E.flotaRival = flota; // dónde estaban sus barcos
    pintar();
  }
  PINTAR.fin = () => {
    const c = V.cuerpo, b = E.batalla, o = nombreOtro(), conCompu = E.modo === "compu";
    if (b.estado === "cancelada") {
      c.append(nodo("p", "jv-ojo", "Batalla naval"));
      c.append(nodo("h3", "jv-h", "El reto quedó cancelado"));
      c.append(principal(conCompu ? "Otra práctica 🤖" : `Retar a ${E.rival.nombre} ⚓`, () => (conCompu ? nuevaPractica() : irAlReto(false, "")), "otra"));
      c.append(boton(CL().enlace, "Volver a los juegos", () => salir(), "salir"));
      return;
    }
    const gane = b.ganador === yo();
    c.append(nodo("p", "jv-ojo", "Fin de la batalla"));
    c.append(nodo("h3", "jv-rango", gane ? (conCompu ? "¡Le ganaste a la compu! 🏆" : "¡Ganaste la batalla! 🏆") : conCompu ? "Ganó la compu 🤖" : `${mayus(o)} ganó esta vez 😏`));
    if (b.rendido) c.append(nodo("p", "bn-texto", gane ? `${mayus(o)} se rindió 🏳️` : "Te rendiste 🏳️"));
    if (b.apuesta && !conCompu) c.append(apuestaVer(gane ? `Ganaste la apuesta: «${b.apuesta}»` : `${mayus(o)} ganó la apuesta: «${b.apuesta}»`, true));
    const mios = misDisparos(), suyos = susDisparos(), est = nodo("div", "jv-stats");
    [[mios.length, "tus disparos"], [mios.length ? `${Math.round((aciertos(mios) / mios.length) * 100)}%` : "—", "tu puntería"],
      [suyos.length, conCompu ? "de la compu" : `de ${o}`]].forEach(([v, t]) => {
      const d = nodo("div"); d.append(nodo("b", null, String(v)), nodo("span", null, t)); est.append(d);
    });
    c.append(est);
    if (!conCompu) { const m = marcadorDe(E.mesaRef, b); if (m) c.append(nodo("p", "bn-nota", m)); }
    c.append(nodo("p", "bn-nota", E.flotaRival ? `Así estaba la flota de ${o}:` : `Tus disparos en el mar de ${o}:`));
    c.append(grilla("su"));
    c.append(principal("Revancha ⚓", () => (conCompu ? nuevaPractica() : irAlReto(true, b.apuesta)), "otra"));
    if (conCompu) c.append(boton(CL().secundario, varios() ? "Retar a alguien de verdad ⚓" : `Retar a ${todas()[0].rival.nombre} de verdad ⚓`, () => abrir("vivo"), "de-verdad"));
    const otra = linkOtraPersona();
    if (otra) c.append(otra);
    c.append(boton(CL().enlace, "Volver a los juegos", () => salir(), "salir"));
  };
  function irAlReto(revancha, apuesta) {
    Object.assign(E, { batalla: null, disparos: [], miFlota: null, flotaRival: null, borrador: null, seleccion: null, apuntada: null,
      editando: false, mensaje: "", revancha, apuesta: apuesta || "" });
    pintar();
  }
  async function nuevaPractica() {
    const e = E;
    let b = null;
    try { b = await E.mesa.crear(null); } catch (er) { return; }
    if (E === e && b && (!E.batalla || E.batalla.id !== b.id)) ponerBatalla(b);
  }

  // ---------- el tablero ----------
  // tipo: "edicion" (acomodando), "mia" (mi flota con sus disparos) o "su" (su mar con mis disparos).
  // Una sola parada de Tab: dentro se mueve con las flechas.
  function grilla(tipo) {
    const g = nodo("div", `bn-grilla bn-${tipo}`);
    g.setAttribute("role", "group");
    g.setAttribute("aria-label", tipo === "su" ? `Mar de ${nombreOtro()}: usa las flechas para moverte` : "Tu flota: usa las flechas para moverte");
    const rotulo = (t) => { const r = nodo("span", "bn-rotulo", t); r.setAttribute("aria-hidden", "true"); return r; };
    g.append(rotulo(""));
    for (let k = 0; k < LADO; k++) g.append(rotulo(LETRAS[k]));
    const flota = tipo === "edicion" ? E.borrador || [] : tipo === "mia" ? E.miFlota || [] : E.flotaRival || [];
    const lista = tipo === "su" ? misDisparos() : tipo === "mia" ? susDisparos() : [];
    const tiros = new Map(lista.map((d) => [d.celda, d]));
    // la forma de cada barco que se ve: los míos, los suyos al final y los suyos que ya hundí
    const formas = new Map();
    const marcar = (celdas, i, hundido) => { const s = celdas.slice().sort((x, y) => x - y); s.forEach((c) => formas.set(c, { s, i, hundido })); };
    const tiradas = new Set(lista.map((d) => d.celda));
    flota.forEach((b, i) => marcar(b, i, tipo !== "edicion" && b.every((c) => tiradas.has(c))));
    lista.filter((d) => d.barco).forEach((d, k, hundidos) => marcar(d.barco, indiceHundido(d, hundidos.slice(0, k)), true));
    const b = E.batalla, puedo = tipo === "edicion" || (tipo === "su" && !!b && b.estado === "jugando" && b.turno === yo() && !E.ocupado);
    const cursor = E.cursor[tipo] != null ? E.cursor[tipo] : tipo === "su" && E.apuntada != null ? E.apuntada : 0;
    for (let f = 0; f < LADO; f++) {
      g.append(rotulo(String(f + 1)));
      for (let k = 0; k < LADO; k++) {
        const c = f * LADO + k, forma = formas.get(c), t = tiros.get(c);
        const cel = nodo("button", "bn-celda"); cel.type = "button";
        cel.dataset.celda = c; cel.dataset.foco = `${tipo}-${c}`;
        cel.tabIndex = c === cursor ? 0 : -1;
        if (!puedo || (tipo === "su" && t)) cel.setAttribute("aria-disabled", "true");
        let estadoCelda = tipo === "su" ? "sin disparar" : "agua";
        if (forma) {
          const pos = forma.s.indexOf(c), n = forma.s.length;
          cel.classList.add("barco", n > 1 && forma.s[1] - forma.s[0] === LADO ? "v" : "h");
          if (pos === 0) cel.classList.add("ini");
          if (pos === n - 1) cel.classList.add("fin");
          if (forma.hundido) cel.classList.add("hundido");
          else if (tipo === "su") cel.classList.add("revelado");
          if (tipo === "edicion" && E.seleccion === forma.i) cel.classList.add("sel");
          estadoCelda = NOMBRES[forma.i] ? NOMBRES[forma.i].toLowerCase() : "barco";
        }
        if (t) {
          cel.classList.add(t.resultado === "agua" ? "agua" : "tocado");
          estadoCelda = t.resultado === "agua" ? "agua" : forma && forma.hundido ? `${estadoCelda}, hundido` : forma ? `${estadoCelda}, tocado` : "tocado";
          if (E.nuevo && E.nuevo.id === t.id) reciente(cel, E.nuevo.en, 900, "nuevo");
        }
        if (tipo === "su" && E.apuntada === c && !t) {
          cel.classList.add("apunta"); estadoCelda = "apuntando aquí";
          cel.style.setProperty("--d", `${-(Date.now() % 1200)}ms`); // el pulso no vuelve a empezar al redibujar
        }
        cel.setAttribute("aria-label", `${nombreCelda(c)}: ${estadoCelda}`);
        g.append(cel);
      }
    }
    g.addEventListener("click", (ev) => {
      const cel = ev.target.closest && ev.target.closest(".bn-celda");
      if (!cel || cel.getAttribute("aria-disabled") === "true") return;
      const c = Number(cel.dataset.celda);
      E.cursor[tipo] = c;
      if (tipo === "edicion") tocarEdicion(c); else if (tipo === "su") tocarSu(c);
    });
    g.addEventListener("keydown", (ev) => {
      const cel = ev.target.closest && ev.target.closest(".bn-celda");
      if (!cel) return;
      const c = Number(cel.dataset.celda), f = M.fila(c), k = M.col(c);
      const paso = { ArrowUp: f > 0 ? -LADO : 0, ArrowDown: f < LADO - 1 ? LADO : 0, ArrowLeft: k > 0 ? -1 : 0, ArrowRight: k < LADO - 1 ? 1 : 0, Home: -k, End: LADO - 1 - k }[ev.key];
      if (paso == null) return;
      ev.preventDefault();
      const n = g.querySelector(`[data-celda="${c + paso}"]`);
      if (!n) return;
      cel.tabIndex = -1; n.tabIndex = 0; n.focus();
      E.cursor[tipo] = c + paso;
    });
    return g;
  }

  // ---------- al día aunque se corte el tiempo real ----------
  // El canal puede quedar sordo sin que se note (el teléfono durmió, cambió la red, venció la sesión). Con la batalla
  // abierta se le pregunta a la base cada 5 s, al volver a la app y cuando vuelve el canal; si algo cambió, entra por
  // el mismo camino que el tiempo real: primero los disparos que faltan, en orden, y después la batalla.
  let revisando = false;
  async function revisar() {
    if (revisando || document.hidden || !vistaAbierta() || E.modo !== "vivo" || !E.mesaRef || E.cola || E.ocupado || E.error) return;
    const e = E, m = E.mesaRef, antes = E.batalla;
    revisando = true;
    try {
      let b = await E.mesa.activa();
      if (!b && enCurso(antes)) {
        b = (await E.mesa.historial()).find((h) => h.id === antes.id) || null; // ya terminó
        if (!b) { if (E === e && !E.cola) recargar(); return; } // o la cancelaron: como al abrirla de nuevo
      }
      if (E !== e || E.cola || !b) return;
      const a = E.batalla;
      if (a && a.id === b.id && a.estado === b.estado && hora(a.actualizado_en) === hora(b.actualizado_en)) return; // nada nuevo
      if (a && a.id === b.id) {
        const disparos = await E.mesa.disparos(b.id);
        if (E !== e || E.cola) return;
        disparos.forEach((d) => alLlegar(m, "disparo", d)); // (los que ya estaban no se repiten)
      }
      alLlegar(m, "batalla", b);
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
  window.addEventListener("popstate", () => { if (vistaAbierta() && !(history.state && history.state.batalla)) cerrar(); });
  // con la app en segundo plano no se está mirando la batalla; al volver, se revisa al tiro si algo pasó
  document.addEventListener("visibilitychange", () => {
    if (E && E.mesaRef) E.mesaRef.ad.presencia(!document.hidden && vistaAbierta() && E.modo === "vivo");
    ponerAlDia();
  });

  window.Batalla = { iniciar, rivales, tarjeta, abrir, alDia };
})();
