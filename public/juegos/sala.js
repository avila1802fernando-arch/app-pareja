// Sala de juegos 🎮
// Minijuegos para jugar cada uno en su teléfono. Cada juego guarda el récord de cada uno (tabla `partidas`),
// la corona 👑 la tiene quien va ganando, al terminar se puede retar al otro y, si le quitas un récord,
// te ganas su premio secreto 💌 (tabla `premios`). Los juegos viven en corazones.js, vuelo.js, memoria.js
// y fusion.js, y se anotan con NosotrosJuegos.registrar(). Los juegos en vivo, los dos a la vez (el UNO 🃏 y la
// Batalla naval ⚓), viven aparte en uno.js y batalla.js: se bajan después de la sala y sus tarjetas van primeras.
// app.js deja lo que hace falta en window.nosotros, avisa con "nosotros:dentro" y, cada vez que se abre
// la pestaña, con "nosotros:juegos".
(() => {
  "use strict";
  const C = window.NOSOTROS_CONFIG || {};
  const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  const NUM = '"Fredoka","Nunito",system-ui,sans-serif';
  const MANO = '"Caveat","Segoe Print",cursive';
  const ICONOS = {
    cerrar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
    sonido: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    mudo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
    corona: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 8.5 8 12l4-6.5 4 6.5 4.5-3.5-1.8 9.5H5.3L3.5 8.5Z"/></svg>',
    candado: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><path d="M12 14.5v2"/></svg>',
  };

  const JUEGOS = [];
  let X = null;               // window.nosotros (o uno de prueba)
  let marcador = {};          // juego → usuario_id → { mejor, partidas, hoy, ultima }
  let recientes = [];         // últimas partidas de los dos
  let premio = { esperando: false, mio: null, mios: [], ganados: [] };
  let sinBase = false;        // la base todavía no tiene la tabla de partidas: récords solo en este teléfono
  let familia = [];           // los récords de Eli y Maritza en el Recreo: { nombre, avatar, juego, mejor, partidas, ultima }
  let prueba = false;         // abierto con NosotrosJuegos.probar() (sin sesión)
  let canal = null, S = null, V = null, actual = null, foco = null;

  // ---------- utilidades ----------
  const $ = (id) => document.getElementById(id);
  function nodo(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function boton(cls, html, etiqueta) {
    const b = nodo("button", cls); b.type = "button";
    if (html) b.innerHTML = html;
    if (etiqueta) b.setAttribute("aria-label", etiqueta);
    return b;
  }
  const fmt = (n) => Number(n || 0).toLocaleString("es");
  const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const anotar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const poco = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const vibrar = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };
  const yo = () => ({ id: X && X.user ? X.user.id : "yo", nombre: (X && X.perfil && X.perfil.nombre) || "Tú" });
  const elOtro = () => ({ id: X && X.otro ? X.otro.id : null, nombre: (X && X.otro && X.otro.nombre) || "tu pareja" });
  function toast(m) {
    if (X && X.toast) { X.toast(m); return; }
    const t = $("toast"); if (!t) return;
    t.textContent = m; t.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 3500);
  }
  // "Guayaquil y Talca": las ciudades de los dos según su zona horaria (si se conocen)
  const CIUDADES = { "America/Guayaquil": "Guayaquil", "America/Santiago": (C.FECHAS && C.FECHAS.lugar) || "Santiago" };
  function lejos() {
    const a = X && X.miTz && CIUDADES[X.miTz()], b = X && X.suTz && CIUDADES[X.suTz()];
    return a && b && a !== b ? `${a} y ${b}` : "nuestras dos ciudades";
  }
  // El día en que se conocieron, como en la postal: "05·05"
  function diaEspecial() {
    const f = C.FECHAS && C.FECHAS.conocidos;
    return f ? `${f.slice(8, 10)}·${f.slice(5, 7)}` : "nuestro día";
  }
  // "1 de marzo" si el encuentro todavía no llega
  function encuentro() {
    const f = C.FECHAS && C.FECHAS.encuentro;
    if (!f) return null;
    const hoy = X && X.diaHoy ? X.diaHoy() : new Date().toISOString().slice(0, 10);
    if (f <= hoy) return null;
    return new Date(f + "T12:00:00Z").toLocaleDateString("es", { day: "numeric", month: "long", timeZone: "UTC" });
  }
  // Los km que de verdad los separan (si los dos activaron la ubicación); si no, 4.000 km
  function distancia() {
    const a = X && X.perfil, b = X && X.otro;
    if (!a || !b || a.lat == null || b.lat == null) return 4000;
    const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    const km = 2 * 6371 * Math.asin(Math.sqrt(h));
    return km < 50 ? 4000 : Math.round(km / 100) * 100;
  }

  // ---------- sonido (Web Audio: tonos cortos, sin archivos) ----------
  let AC = null, mudo = leer("juegos-mudo") === "1";
  function activarAudio() {
    try {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === "suspended") AC.resume();
    } catch (e) { AC = null; }
  }
  function tono(f, dur, tipo, vol, hacia, retraso) {
    if (mudo || !AC) return;
    try {
      const t0 = AC.currentTime + (retraso || 0), o = AC.createOscillator(), g = AC.createGain();
      o.type = tipo || "sine";
      o.frequency.setValueAtTime(f, t0);
      if (hacia) o.frequency.exponentialRampToValueAtTime(hacia, t0 + dur);
      g.gain.setValueAtTime(vol || 0.06, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(AC.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) {}
  }
  const fanfarria = () => [523, 659, 784, 1046].forEach((f, i) => tono(f, i === 3 ? 0.4 : 0.15, "triangle", 0.07, 0, i * 0.14));
  const consuelo = () => [392, 330, 262].forEach((f, i) => tono(f, i === 2 ? 0.4 : 0.2, "triangle", 0.05, 0, i * 0.2));

  // ---------- dibujo compartido para los juegos en canvas ----------
  // Corazón relleno con el color actual; (x, y) es su centro y s su alto
  function corazon(g, x, y, s) {
    g.save(); g.translate(x, y - s * 0.3); g.scale(s / 10, s / 10);
    g.beginPath(); g.moveTo(0, 3);
    g.bezierCurveTo(0, 1, -3, -2, -5, 0); g.bezierCurveTo(-7, 2, -5, 5, 0, 8);
    g.bezierCurveTo(5, 5, 7, 2, 5, 0); g.bezierCurveTo(3, -2, 0, 1, 0, 3);
    g.closePath(); g.fill(); g.restore();
  }
  // Un emoji dibujado una vez y reutilizado (mucho más fluido en iPhone)
  const sprites = new Map();
  function sprite(emoji, px, dpr) {
    const k = `${emoji}|${px}|${dpr}`;
    if (sprites.has(k)) return sprites.get(k);
    const box = Math.ceil(px * 1.35), c = document.createElement("canvas");
    c.width = c.height = Math.ceil(box * dpr);
    const g = c.getContext("2d");
    g.scale(dpr, dpr); g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `${px}px ${EMOJI}`; g.fillText(emoji, box / 2, box / 2 + px * 0.06);
    const s = { c, box }; sprites.set(k, s); return s;
  }
  // Un canvas que ocupa todo el campo de juego, nítido en pantallas retina
  function lienzo(campo) {
    const cv = nodo("canvas", "jv-lienzo jv-propio");
    campo.prepend(cv);
    const L = { cv, g: cv.getContext("2d"), W: 0, H: 0, dpr: 1 };
    L.ajustar = () => {
      // se mide el lienzo y no el campo (que tiene borde): así lo dibujado cae justo donde se toca
      const r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      L.W = Math.max(1, r.width); L.H = Math.max(1, r.height); L.dpr = dpr;
      cv.width = Math.round(L.W * dpr); cv.height = Math.round(L.H * dpr);
      L.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    L.ajustar();
    return L;
  }

  // ---------- datos ----------
  const hoyDe = (iso) => { try { return X.claveDia(iso, X.miTz()) === X.diaHoy(); } catch (e) { return false; } };
  function anotarEnMarcador(uid, juego, puntos, iso) {
    const m = (marcador[juego] = marcador[juego] || {});
    const r = (m[uid] = m[uid] || { mejor: null, partidas: 0, hoy: null, ultima: null });
    r.mejor = r.mejor == null ? puntos : Math.max(r.mejor, puntos);
    r.partidas++;
    if (hoyDe(iso)) r.hoy = r.hoy == null ? puntos : Math.max(r.hoy, puntos);
    r.ultima = iso;
  }
  function recordsDe(id) {
    const m = marcador[id] || {}, a = m[yo().id] || {}, b = (elOtro().id && m[elOtro().id]) || {};
    return {
      mio: a.mejor == null ? null : a.mejor, suyo: b.mejor == null ? null : b.mejor,
      hoyMio: a.hoy == null ? null : a.hoy, hoySuyo: b.hoy == null ? null : b.hoy,
      partidasMio: a.partidas || 0, partidasSuyo: b.partidas || 0,
    };
  }
  // Respaldo en este teléfono: si la nube no está disponible, el récord propio no se pierde
  const claveLocal = () => `juegos-${yo().id}`;
  function localDe() { try { return JSON.parse(leer(claveLocal()) || "{}") || {}; } catch (e) { return {}; } }
  function anotarLocal(juego, puntos) {
    const l = localDe(); l[juego] = Math.max(l[juego] || 0, puntos); anotar(claveLocal(), JSON.stringify(l));
  }

  async function cargar() {
    if (!X || prueba || !X.sb || !X.pareja) return;
    const y = yo(), o = elOtro();
    let desde;
    try { desde = X.aIso(X.diaHoy() + "T00:00", X.miTz()); } catch (e) { desde = new Date(Date.now() - 86400000).toISOString(); }
    // Los récords de la familia (Eli y Maritza juegan en el Recreo, la app de juegos aparte). Va por su cuenta:
    // si la base todavía no tiene records_familia, la tarjeta simplemente no aparece.
    X.sb.rpc("records_familia").then(({ data, error }) => {
      if (error && !/could not find the function|does not exist/i.test(error.message || "") && error.code !== "PGRST202") return;
      familia = error ? [] : data || [];
      if (S) pintarFamilia();
    }, () => {});
    const [m, r, esp, mios, ganados] = await Promise.all([
      X.sb.rpc("marcador_juegos", { p_desde: desde }),
      X.sb.from("partidas").select("id, usuario_id, juego, puntos, creado_en").eq("pareja_id", X.pareja.id)
        .order("creado_en", { ascending: false }).limit(12),
      X.sb.rpc("premio_esperando"),
      X.sb.from("premios").select("id, texto, ganado_en, creado_en").eq("de_usuario", y.id).order("creado_en", { ascending: false }).limit(20),
      X.sb.from("premios").select("id, texto, ganado_en, creado_en").eq("de_usuario", o.id).not("ganado_en", "is", null)
        .order("ganado_en", { ascending: false }).limit(30),
    ]);
    if (m.error) {
      // Un corte de red no cuenta: se queda lo que había y se reintenta al volver a la pestaña
      const falta = m.error.code === "PGRST202" || m.error.code === "42883" || /could not find the function|does not exist/i.test(m.error.message || "");
      if (!falta) return;
      // la base todavía no tiene los juegos: se juega igual, con el récord propio guardado aquí
      sinBase = true; marcador = {};
      Object.entries(localDe()).forEach(([j, p]) => { marcador[j] = { [y.id]: { mejor: p, partidas: 0, hoy: null, ultima: null } }; });
      recientes = []; premio = { esperando: false, mio: null, mios: [], ganados: [] };
      return;
    }
    sinBase = false; marcador = {};
    (m.data || []).forEach((f) => {
      (marcador[f.juego] = marcador[f.juego] || {})[f.usuario_id] = { mejor: f.mejor, partidas: f.partidas, hoy: f.mejor_hoy, ultima: f.ultima };
    });
    recientes = r.data || [];
    const mis = mios.data || [];
    premio = { esperando: !!esp.data, mio: mis.find((p) => !p.ganado_en) || null, mios: mis, ganados: ganados.data || [] };
  }

  async function guardarPartida(juego, puntos, detalle) {
    const y = yo(), ahora = new Date().toISOString();
    anotarLocal(juego, puntos);
    anotarEnMarcador(y.id, juego, puntos, ahora);
    recientes = [{ usuario_id: y.id, juego, puntos, creado_en: ahora }, ...recientes].slice(0, 12);
    if (prueba || sinBase || !X.sb || !X.pareja) return false;
    const { data, error } = await X.sb.from("partidas").insert({ pareja_id: X.pareja.id, usuario_id: y.id, juego, puntos, detalle: detalle || null })
      .select("creado_en").single();
    if (error) { toast("No se pudo guardar la partida 😢 Tu récord queda en este teléfono."); return false; }
    return data.creado_en; // con esto se sabe si ESTA partida ganó el premio secreto
  }

  // ---------- la pestaña: marcador, juegos, premio secreto y últimas partidas ----------
  function montarSala() {
    if (S) return;
    const uno = $("juegos-uno"), dos = $("juegos-dos");
    if (!uno || !dos) return;
    S = {};
    // marcador del amor: cuántos récords tiene cada uno
    const m = nodo("section", "j-marcador"); m.setAttribute("aria-labelledby", "j-marcador-titulo");
    const ojo = nodo("p", "eyebrow", "Marcador del amor"); ojo.id = "j-marcador-titulo";
    const duelo = nodo("div", "j-duelo");
    const jugador = (k) => {
      const d = nodo("div", "j-jugador " + k), corona = nodo("span", "j-corona");
      corona.innerHTML = ICONOS.corona; corona.hidden = true;
      const av = nodo("span", "avatar"); av.dataset.av = k; av.setAttribute("aria-hidden", "true");
      const n = nodo("b", "j-cuenta", "0"), nom = nodo("small", null, k === "mio" ? "Tú" : "");
      d.append(corona, av, n, nom);
      return { d, corona, n, nom };
    };
    S.suyo = jugador("suyo"); S.mio = jugador("mio");
    duelo.append(S.suyo.d, nodo("span", "j-vs", "vs"), S.mio.d);
    S.frase = nodo("p", "j-frase-marcador"); S.frase.setAttribute("aria-live", "polite");
    S.nota = nodo("p", "small-note");
    m.append(ojo, duelo, S.frase, S.nota);
    S.aviso = nodo("p", "small-note j-aviso"); S.aviso.hidden = true;
    S.aviso.textContent = "Por ahora cada récord queda en su teléfono: el marcador compartido se activa cuando se actualice la base de datos.";
    S.lista = nodo("div", "j-lista");
    uno.append(m, S.aviso, S.lista);

    // premio secreto
    const p = nodo("section", "j-premio"); p.setAttribute("aria-labelledby", "j-premio-titulo");
    const h = nodo("h2", null, "Premio secreto 💌"); h.id = "j-premio-titulo";
    S.pSuyo = nodo("div", "j-premio-suyo");
    S.pDet = nodo("details", "j-ganados"); S.pResumen = nodo("summary", "small-note"); S.pLista = nodo("ul");
    S.pDet.append(S.pResumen, S.pLista);
    const f = nodo("form", "stack j-premio-form");
    S.pEstado = nodo("p", "small-note");
    const lab = nodo("label", "sr", "Tu premio secreto"); lab.htmlFor = "j-premio-texto";
    S.pTexto = nodo("textarea", "papel"); S.pTexto.id = "j-premio-texto"; S.pTexto.maxLength = 400; S.pTexto.rows = 3; S.pTexto.required = true;
    S.pTexto.placeholder = "Si lees esto es porque me ganaste… y te debo un beso eterno 💋";
    S.pGuardar = nodo("button", null, "Esconder mi premio 🔒"); S.pGuardar.type = "submit";
    S.pQuitar = boton("link", null, null); S.pQuitar.textContent = "Quitar mi premio"; S.pQuitar.hidden = true;
    f.append(S.pEstado, lab, S.pTexto, S.pGuardar, S.pQuitar);
    p.append(h, S.pSuyo, S.pDet, f);
    f.addEventListener("submit", guardarPremio);
    S.pQuitar.addEventListener("click", quitarPremio);

    // últimas partidas
    const rec = nodo("section", "log j-recientes");
    rec.append(nodo("h2", null, "Últimas partidas"));
    S.recientes = nodo("ul"); rec.append(S.recientes);

    // récords de la familia (Eli y Maritza, desde el Recreo)
    S.familia = nodo("section", "log j-familia"); S.familia.hidden = true;
    S.familia.append(nodo("h2", null, "Récords de la familia 🎮"),
      nodo("p", "small-note", "Eli y Maritza juegan estos mismos juegos en el Recreo, con las mismas reglas: sus marcas se comparan con las de ustedes."));
    S.familiaLista = nodo("ul"); S.familia.append(S.familiaLista);
    dos.append(p, rec, S.familia);
  }

  // El mejor de Eli y de Maritza en cada juego; 👑 si es más que el récord de los dos
  function pintarFamilia() {
    if (!S || !S.familia) return;
    const ul = S.familiaLista;
    ul.innerHTML = "";
    const filas = JUEGOS.flatMap((j) => familia.filter((f) => f.juego === j.id).sort((a, b) => b.mejor - a.mejor).map((f) => ({ j, f })));
    S.familia.hidden = !filas.length;
    filas.forEach(({ j, f }) => {
      const r = recordsDe(j.id), deLosDos = Math.max(r.mio == null ? -1 : r.mio, r.suyo == null ? -1 : r.suyo);
      const li = nodo("li"), a = nodo("span"), b = nodo("span");
      a.textContent = `${f.avatar} ${f.nombre} · ${j.nombre}: ${j.marca(f.mejor)}${f.mejor > deLosDos ? " 👑" : ""}`;
      b.textContent = X && X.ago ? X.ago(f.ultima) : "";
      li.append(a, b); ul.append(li);
    });
  }

  function pintarSala() {
    if (!S || !X) return;
    const o = elOtro();
    let mios = 0, suyos = 0, total = 0;
    JUEGOS.forEach((j) => {
      const r = recordsDe(j.id);
      total += r.partidasMio + r.partidasSuyo;
      if (r.mio != null && (r.suyo == null || r.mio > r.suyo)) mios++;
      else if (r.suyo != null && (r.mio == null || r.suyo > r.mio)) suyos++;
    });
    S.mio.n.textContent = mios; S.suyo.n.textContent = suyos; S.suyo.nom.textContent = o.nombre;
    S.mio.corona.hidden = !(mios > suyos); S.suyo.corona.hidden = !(suyos > mios);
    S.mio.d.classList.toggle("gana", mios > suyos); S.suyo.d.classList.toggle("gana", suyos > mios);
    S.frase.textContent = !mios && !suyos ? "Todavía no hay récords. ¿Quién estrena la sala? 😏"
      : mios === suyos ? `Empate ${mios} a ${suyos} 💞 El amor está parejo`
      : mios > suyos ? `Vas ganando ${mios} a ${suyos} 👑`
      : `${o.nombre} va ganando ${suyos} a ${mios} 👑`;
    S.nota.textContent = total ? `${fmt(total)} ${total === 1 ? "partida" : "partidas"} entre los dos · cada juego guarda el récord de cada uno`
      : "Cada juego guarda el récord de cada uno. Quítale uno a tu pareja y gánate su premio secreto 💌";
    S.aviso.hidden = !sinBase || prueba;
    S.lista.innerHTML = "";
    JUEGOS.forEach((j) => S.lista.append(cartaJuego(j)));
    S.vivas = {}; pintarEnVivo();
    pintarPremio(); pintarRecientes(); pintarFamilia();
    if (X.renderAvatares) X.renderAvatares();
  }

  function cartaJuego(j) {
    const r = recordsDe(j.id), o = elOtro();
    const b = boton("j-carta");
    ["--j-a", "--j-b", "--j-c"].forEach((v, i) => b.style.setProperty(v, j.tono[i]));
    const ico = nodo("span", "j-icono"); ico.innerHTML = j.icono;
    const info = nodo("span", "j-info");
    info.append(nodo("strong", "j-nombre", j.nombre), nodo("small", "j-lema", j.lema));
    const lider = r.mio != null && (r.suyo == null || r.mio > r.suyo) ? "mio"
      : r.suyo != null && (r.mio == null || r.suyo > r.mio) ? "suyo" : null;
    const recs = nodo("span", "j-records");
    [["suyo", o.nombre, r.suyo], ["mio", "Tú", r.mio]].forEach(([k, quien, v]) => {
      const p = nodo("span", "j-rec" + (lider === k ? " lider" : ""));
      const av = nodo("span", "avatar mini"); av.dataset.av = k;
      const t = nodo("span", "j-rec-txt");
      t.append(nodo("small", null, quien), nodo("b", null, v == null ? "—" : j.marca(v)));
      p.append(av, t);
      if (lider === k) { const c = nodo("span", "j-corona"); c.innerHTML = ICONOS.corona; p.append(c); }
      recs.append(p);
    });
    const hoy = nodo("span", "j-hoy");
    hoy.textContent = r.hoyMio == null && r.hoySuyo == null ? "Hoy todavía no juegan"
      : `Hoy: tú ${r.hoyMio == null ? "—" : j.marca(r.hoyMio)} · ${o.nombre} ${r.hoySuyo == null ? "—" : j.marca(r.hoySuyo)}`;
    info.append(recs, hoy);
    const jugar = nodo("span", "j-jugar", "Jugar");
    b.append(ico, info, jugar);
    b.setAttribute("aria-label", `${j.nombre}. Récord de ${o.nombre}: ${r.suyo == null ? "todavía no juega" : j.marca(r.suyo)}. ` +
      `Tu récord: ${r.mio == null ? "todavía no juegas" : j.marca(r.mio)}. Jugar`);
    b.addEventListener("click", () => abrir(j));
    return b;
  }

  function pintarPremio() {
    const o = elOtro();
    S.pSuyo.innerHTML = "";
    S.pSuyo.classList.toggle("cerrado", premio.esperando);
    if (premio.esperando) {
      const ic = nodo("span", "j-candado"); ic.innerHTML = ICONOS.candado;
      const t = nodo("span", "j-premio-txt");
      t.append(nodo("strong", null, `${o.nombre} escondió un premio para ti`), nodo("small", null, "Quítale un récord en cualquier juego para abrirlo"));
      S.pSuyo.append(ic, t);
    } else {
      S.pSuyo.append(nodo("small", null, premio.ganados.length
        ? `${o.nombre} todavía no esconde otro premio. ¡Pídele uno nuevo! 😏`
        : `${o.nombre} todavía no esconde un premio para ti. ¡Pídeselo! 😏`));
    }
    S.pDet.hidden = !premio.ganados.length;
    S.pResumen.textContent = `Premios que le ganaste a ${o.nombre} (${premio.ganados.length})`;
    S.pLista.innerHTML = "";
    premio.ganados.forEach((p) => {
      const li = nodo("li", "j-papel");
      li.append(nodo("p", null, p.texto), nodo("small", null, `Ganado ${X.ago ? X.ago(p.ganado_en) : ""}`));
      S.pLista.append(li);
    });
    const mio = premio.mio, ultimo = premio.mios[0];
    S.pEstado.textContent = mio ? `Tu premio está escondido 🔒 ${o.nombre} tiene que quitarte un récord para leerlo.`
      : ultimo && ultimo.ganado_en ? `💌 ${o.nombre} se ganó tu premio ${X.ago ? X.ago(ultimo.ganado_en) : ""}. ¿Le escondes otro?`
      : `Escribe algo bonito para ${o.nombre}: solo podrá leerlo cuando te quite un récord.`;
    // solo se rellena si nadie lo editó desde la última vez que lo rellenamos (no se pierde un borrador)
    if (document.activeElement !== S.pTexto && S.pTexto.value === (S.pTextoPuesto || "")) {
      S.pTexto.value = S.pTextoPuesto = mio ? mio.texto : "";
    }
    S.pGuardar.textContent = mio ? "Cambiar mi premio" : "Esconder mi premio 🔒";
    S.pQuitar.hidden = !mio;
  }

  function pintarRecientes() {
    const ul = S.recientes, y = yo(), o = elOtro();
    ul.innerHTML = "";
    const lista = recientes.filter((p) => JUEGOS.some((j) => j.id === p.juego)).slice(0, 8);
    if (!lista.length) { ul.append(nodo("li", "muted", "Aquí aparecerán sus partidas 🎮")); return; }
    lista.forEach((p) => {
      const j = JUEGOS.find((x) => x.id === p.juego), r = recordsDe(j.id);
      const mejor = p.usuario_id === y.id ? r.mio : r.suyo;
      const li = nodo("li"), a = nodo("span"), b = nodo("span");
      a.textContent = `${p.usuario_id === y.id ? "Tú" : o.nombre} · ${j.nombre}: ${j.marca(p.puntos)}${mejor === p.puntos ? " 🏆" : ""}`;
      b.textContent = X.ago ? X.ago(p.creado_en) : "";
      li.append(a, b); ul.append(li);
    });
  }

  async function guardarPremio(e) {
    e.preventDefault();
    const texto = S.pTexto.value.trim(), o = elOtro();
    if (!texto) return;
    if (prueba || sinBase) { toast("El premio secreto se activa cuando se actualice la base de datos 💌"); return; }
    S.pGuardar.disabled = true;
    const q = premio.mio
      ? X.sb.from("premios").update({ texto }).eq("id", premio.mio.id).select("id, texto, ganado_en, creado_en").single()
      : X.sb.from("premios").insert({ pareja_id: X.pareja.id, de_usuario: yo().id, texto }).select("id, texto, ganado_en, creado_en").single();
    const { data, error } = await q;
    S.pGuardar.disabled = false;
    if (error) { toast("No se pudo guardar tu premio"); return; }
    premio.mio = data; premio.mios = [data, ...premio.mios.filter((x) => x.id !== data.id)];
    S.pTextoPuesto = S.pTexto.value; // ya guardado: pintarPremio puede volver a rellenarlo
    S.pTexto.blur(); pintarPremio();
    toast(`Premio escondido 🔒 ${o.nombre} tendrá que quitarte un récord para leerlo`);
    if (X.estallido) X.estallido(S.pGuardar, "💌", 7);
  }
  async function quitarPremio() {
    if (!premio.mio || !confirm("¿Quitar tu premio secreto?")) return;
    const { error } = await X.sb.from("premios").delete().eq("id", premio.mio.id);
    if (error) { toast("No se pudo quitar"); return; }
    premio.mios = premio.mios.filter((x) => x.id !== premio.mio.id); premio.mio = null;
    S.pTextoPuesto = S.pTexto.value; // se quitó: que pintarPremio lo vacíe
    pintarPremio();
  }

  // Puntito en la pestaña cuando tu pareja jugó desde la última vez que entraste
  function marcarPunto() {
    const b = document.querySelector('#tabs button[data-tab="juegos"]');
    if (!b || !X || prueba) return;
    const tab = $("tab-juegos"), clave = `juegos-visto-${yo().id}`;
    if (tab && !tab.hidden) { anotar(clave, String(Date.now())); b.classList.remove("punto"); b.setAttribute("aria-label", "Juegos"); return; }
    const visto = +(leer(clave) || 0);
    const hay = recientes.some((p) => p.usuario_id !== yo().id && new Date(p.creado_en).getTime() > visto);
    b.classList.toggle("punto", hay);
    b.setAttribute("aria-label", hay ? `Juegos: ${elOtro().nombre} jugó hace poco` : "Juegos");
  }

  // ---------- la vista de un juego (pantalla completa) ----------
  function montarVista() {
    if (V) return;
    V = {};
    const raiz = nodo("div", "jv"); raiz.hidden = true;
    raiz.setAttribute("role", "dialog"); raiz.setAttribute("aria-modal", "true"); raiz.setAttribute("aria-labelledby", "jv-titulo");
    const marco = nodo("div", "jv-marco");
    const barra = nodo("header", "jv-barra");
    V.cerrar = boton("jv-boton", ICONOS.cerrar, "Salir del juego");
    V.titulo = nodo("h2", "jv-titulo"); V.titulo.id = "jv-titulo";
    V.sonido = boton("jv-boton");
    barra.append(V.cerrar, V.titulo, V.sonido);
    V.hud = nodo("div", "jv-hud");
    V.campo = nodo("div", "jv-campo");

    // antes de jugar: reglas y el duelo
    V.inicio = nodo("div", "jv-capa jv-inicio");
    V.iTitulo = nodo("h3", "jv-h"); V.iReglas = nodo("ul", "jv-reglas");
    V.iNota = nodo("p", "jv-nota"); V.iDetalle = nodo("p", "jv-detalle");
    V.iDuelo = nodo("div", "jv-duelo");
    V.jugar = boton("jv-jugar"); V.iExtra = nodo("div", "jv-extra");
    V.inicio.append(nodo("p", "jv-ojo", "Cómo se juega"), V.iTitulo, V.iReglas, V.iNota, V.iDetalle, V.iDuelo, V.jugar, V.iExtra);

    // pausa
    V.pausa = nodo("div", "jv-capa jv-pausa"); V.pausa.hidden = true;
    V.seguir = boton("jv-jugar"); V.seguir.textContent = "Seguir jugando";
    V.rendirse = boton("ghost"); V.rendirse.textContent = "Terminar y guardar mi puntaje";
    V.salirP = boton("link"); V.salirP.textContent = "Salir sin guardar";
    V.pausa.append(nodo("p", "jv-ojo", "Pausa"), nodo("h3", "jv-h", "Te esperamos aquí 💗"), V.seguir, V.rendirse, V.salirP);

    // fin de la partida
    V.fin = nodo("div", "jv-capa jv-fin"); V.fin.hidden = true;
    V.fRango = nodo("h3", "jv-rango");
    V.fPuntaje = nodo("div", "jv-puntaje"); V.fNum = nodo("span"); V.fUnidad = nodo("small"); V.fPuntaje.append(V.fNum, V.fUnidad);
    V.fInsignia = nodo("p", "jv-insignia"); V.fFrase = nodo("p", "jv-frase"); V.fStats = nodo("div", "jv-stats");
    V.fPremio = nodo("div", "jv-premio"); V.fPremio.hidden = true;
    V.leerPremio = boton("ghost"); V.leerPremio.textContent = "Leer su premio 💌";
    V.fPremio.append(nodo("strong", null, ""), V.leerPremio);
    const acciones = nodo("div", "jv-acciones");
    V.otra = boton("jv-jugar"); V.otra.textContent = "Revancha 🔥";
    V.retar = boton("ghost");
    acciones.append(V.otra, V.retar);
    V.salir = boton("link"); V.salir.textContent = "Volver a la sala";
    V.fin.append(nodo("p", "jv-ojo", "Fin de la partida"), V.fRango, V.fPuntaje, V.fInsignia, V.fFrase, V.fStats, V.fPremio, acciones, V.salir);

    V.campo.append(V.inicio, V.pausa, V.fin);
    marco.append(barra, V.hud, V.campo);
    raiz.append(marco);
    document.body.append(raiz);
    V.raiz = raiz;

    // el premio ganado se lee en un papelito
    const d = nodo("dialog", "dlg j-dlg-premio");
    d.innerHTML = '<div class="stack centro"><p class="eyebrow"></p><p class="papelito"></p><button type="button">Guardarlo en el corazón 💗</button></div>';
    document.body.append(d);
    V.dlg = d;
    d.querySelector("button").addEventListener("click", () => d.close());

    V.cerrar.addEventListener("click", () => (actual && actual.estado === "jugando" ? pausar() : salir()));
    V.sonido.addEventListener("click", () => { mudo = !mudo; anotar("juegos-mudo", mudo ? "1" : "0"); pintarSonido(); activarAudio(); });
    V.jugar.addEventListener("click", empezar);
    V.otra.addEventListener("click", empezar);
    V.retar.addEventListener("click", retar);
    V.salir.addEventListener("click", salir);
    V.seguir.addEventListener("click", seguir);
    V.rendirse.addEventListener("click", rendirse);
    V.salirP.addEventListener("click", salir);
    V.leerPremio.addEventListener("click", () => {
      V.dlg.showModal();
      if (X.lluvia) X.lluvia("💌", 14);
    });
    raiz.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (actual && actual.estado === "jugando") pausar(); else if (actual && actual.estado === "pausa") seguir(); else salir();
    });
    pintarSonido();
  }
  function pintarSonido() {
    V.sonido.innerHTML = mudo ? ICONOS.mudo : ICONOS.sonido;
    V.sonido.setAttribute("aria-label", mudo ? "Activar el sonido" : "Silenciar el sonido");
    V.sonido.setAttribute("aria-pressed", String(mudo));
  }
  // Mientras se juega, lo de atrás no recibe el foco del teclado ni del lector de pantalla
  function fondoInerte(si) {
    ["app", "tabs"].forEach((id) => { const e = $(id); if (e) e.inert = si; });
  }
  function mostrarCapa(cual) {
    V.inicio.hidden = cual !== "inicio"; V.pausa.hidden = cual !== "pausa"; V.fin.hidden = cual !== "fin";
    V.raiz.classList.toggle("jugando", !cual);
  }

  function crearApi(def) {
    return {
      get yo() { return yo(); },
      get otro() { return elOtro(); },
      get records() { return recordsDe(def.id); },
      campo: V.campo, tono, vibrar, corazon, sprite, NUM, MANO, EMOJI,
      pocoMovimiento: poco,
      lienzo: () => lienzo(V.campo),
      lluvia: (e, n) => { if (X && X.lluvia) X.lluvia(e, n); },
      jugando: () => !!actual && actual.estado === "jugando",
      diaEspecial: diaEspecial(), encuentro: encuentro(), distancia: distancia(), lejos: lejos(),
      hud(k, v, caliente) {
        const e = V.hudVal[k]; if (!e) return;
        const t = String(v);
        if (e.textContent !== t) e.textContent = t;
        e.classList.toggle("caliente", !!caliente);
      },
      terminar: (res) => terminar(res),
    };
  }

  function abrir(def) {
    montarVista();
    if (actual) cerrar(true);
    activarAudio();
    actual = { def, estado: "inicio", guardada: false };
    ["--j-a", "--j-b", "--j-c"].forEach((v, i) => V.raiz.style.setProperty(v, def.tono[i]));
    V.raiz.dataset.juego = def.id;
    V.titulo.textContent = def.nombre;
    V.hud.innerHTML = ""; V.hudVal = {};
    V.hud.style.setProperty("--n", def.hud.length);
    def.hud.forEach(([k, etiqueta]) => {
      const d = nodo("div"), v = nodo("span", "val", "0");
      d.append(nodo("span", "lbl", etiqueta), v); V.hud.append(d); V.hudVal[k] = v;
    });
    foco = document.activeElement;
    V.raiz.hidden = false;
    document.body.classList.add("con-juego");
    fondoInerte(true);
    history.pushState({ juego: def.id }, ""); // "atrás" en Android cierra el juego
    actual.api = crearApi(def);
    actual.inst = def.crear(actual.api);
    pintarInicio();
    mostrarCapa("inicio");
    // las letras del canvas (Fredoka y Caveat) se cargan antes de dibujar el campo otra vez
    if (document.fonts && document.fonts.load) {
      Promise.all([document.fonts.load(`700 20px ${NUM}`), document.fonts.load(`700 20px ${MANO}`)])
        .then(() => actual && actual.inst.ajustar && actual.inst.ajustar(), () => {});
    }
    V.jugar.focus({ preventScroll: true });
  }

  function pintarInicio() {
    const { def, api } = actual, r = recordsDe(def.id), o = elOtro();
    V.iTitulo.textContent = `¿Te animas, ${yo().nombre}?`;
    V.iReglas.innerHTML = "";
    def.reglas.forEach(([ic, t, malo]) => {
      const li = nodo("li", malo ? "malo" : null), s = nodo("span", "ic", ic);
      s.setAttribute("aria-hidden", "true"); li.append(s, t); V.iReglas.append(li);
    });
    V.iNota.textContent = typeof def.nota === "function" ? def.nota(api) : def.nota || "";
    V.iDetalle.textContent = def.detalle || ""; V.iDetalle.hidden = !def.detalle;
    V.iDuelo.innerHTML = "";
    const lider = r.suyo != null && (r.mio == null || r.suyo > r.mio);
    const a = nodo("span", "rival" + (lider ? " lider" : "")), b = nodo("span");
    a.append(`${lider ? "👑 " : ""}Récord de ${o.nombre}: `, nodo("b", null, r.suyo == null ? "—" : def.marca(r.suyo)));
    b.append(`${!lider && r.mio != null ? "👑 " : ""}Tu récord: `, nodo("b", null, r.mio == null ? "—" : def.marca(r.mio)));
    V.iDuelo.append(a, b);
    V.iExtra.innerHTML = "";
    if (def.extra) def.extra(api, V.iExtra);
    V.jugar.textContent = def.botonJugar || "Jugar 💗";
  }

  function empezar() {
    if (!actual) return;
    activarAudio();
    mostrarCapa(null);
    actual.estado = "jugando"; actual.guardada = false;
    actual.inst.iniciar();
  }
  function pausar() {
    if (!actual || actual.estado !== "jugando") return;
    actual.estado = "pausa";
    if (actual.inst.pausar) actual.inst.pausar();
    V.rendirse.hidden = !actual.inst.rendirse;
    mostrarCapa("pausa");
    V.seguir.focus({ preventScroll: true });
  }
  function seguir() {
    if (!actual || actual.estado !== "pausa") return;
    actual.estado = "jugando"; mostrarCapa(null);
    if (actual.inst.reanudar) actual.inst.reanudar();
  }
  function rendirse() {
    if (!actual || actual.estado !== "pausa" || !actual.inst.rendirse) return;
    actual.estado = "jugando"; mostrarCapa(null);
    actual.inst.rendirse();
  }
  function salir() {
    if (history.state && history.state.juego) history.back(); // → popstate → cerrar
    else cerrar(true);
  }
  function cerrar() {
    if (!actual) return;
    try { if (actual.inst && actual.inst.detener) actual.inst.detener(); } catch (e) {}
    [...V.campo.children].forEach((e) => { if (!e.classList.contains("jv-capa")) e.remove(); });
    actual = null;
    V.raiz.hidden = true; V.raiz.classList.remove("jugando");
    document.body.classList.remove("con-juego");
    fondoInerte(false);
    pintarSala();
    if (foco && foco.focus && document.contains(foco)) foco.focus({ preventScroll: true });
  }

  // Lo que se dice al final según cómo quedó frente al récord de tu pareja
  function fraseRival(def, puntos, antes, leGana, empata) {
    const o = elOtro();
    if (leGana) return `La corona ahora es tuya 👑 Que ${o.nombre} vaya preparando la revancha 😏`;
    if (empata) return "El amor está parejo… pero solo por ahora 😏";
    if (antes.suyo == null) return `${o.nombre} todavía no juega este. Tu marca será su meta 😏`;
    if (puntos > antes.suyo) return `Sigues por delante de ${o.nombre} 👑 Que intente alcanzarte.`;
    if (antes.mio != null && antes.mio > antes.suyo) return `Esta no fue tu mejor partida, pero la corona sigue siendo tuya 👑`;
    if (puntos >= antes.suyo * 0.85) return `Te faltaron ${def.marca(antes.suyo - puntos)} para el récord de ${o.nombre}. Tan cerca y tan lejos, como ${lejos()}.`;
    return `El récord de ${o.nombre} sigue ahí, mirándote: ${def.marca(antes.suyo)} 😏`;
  }

  async function terminar(res) {
    // también en pausa: un juego puede terminar solo (p. ej. Memoria tras su última ronda) mientras está pausado
    if (!actual || (actual.estado !== "jugando" && actual.estado !== "pausa")) return;
    actual.estado = "fin";
    const { def } = actual, o = elOtro(), antes = recordsDe(def.id);
    const puntos = Math.max(0, Math.round(res.puntos || 0));
    const leGana = antes.suyo != null && puntos > antes.suyo && (antes.mio == null || antes.mio <= antes.suyo);
    const empata = !leGana && antes.suyo != null && puntos > 0 && puntos === antes.suyo;
    const nuevo = puntos > 0 && (antes.mio == null || puntos > antes.mio);
    const rango = def.rango(puntos, res);
    const frase = [res.prefijo, fraseRival(def, puntos, antes, leGana, empata)].filter(Boolean).join(" ");

    V.fRango.textContent = rango.nombre;
    V.fNum.textContent = fmt(puntos); V.fUnidad.textContent = def.unidad;
    V.fInsignia.hidden = !(leGana || empata || nuevo);
    V.fInsignia.classList.toggle("oro", leGana);
    V.fInsignia.textContent = leGana ? `👑 ¡Le quitaste el récord a ${o.nombre}!` : empata ? `¡Empate con ${o.nombre}! 💞` : "✨ ¡Nuevo récord personal!";
    V.fFrase.textContent = frase;
    V.fStats.innerHTML = "";
    (res.stats || []).slice(0, 3).forEach(([v, et]) => {
      const d = nodo("div"); d.append(nodo("b", null, String(v)), nodo("span", null, et)); V.fStats.append(d);
    });
    V.fStats.hidden = !(res.stats || []).length;
    V.fPremio.hidden = true;
    V.retar.textContent = `Retar a ${o.nombre} 😏`;
    V.retar.disabled = true;
    mostrarCapa("fin");
    V.otra.focus({ preventScroll: true });
    if (leGana) { fanfarria(); vibrar([60, 40, 60, 40, 220]); setTimeout(() => X.lluvia && X.lluvia("👑", 16), 250); }
    else if (nuevo) { fanfarria(); setTimeout(() => X.lluvia && X.lluvia("✨", 12), 250); }
    else consuelo();

    const guardadaEn = await guardarPartida(def.id, puntos, res.detalle);
    if (!actual || actual.def !== def) return;
    actual.guardada = !!guardadaEn;
    V.retar.disabled = !guardadaEn && !prueba;
    if (leGana && guardadaEn) mostrarPremioGanado(guardadaEn);
  }

  // Si al quitarle el récord se ganó su premio secreto, se ofrece leerlo ahí mismo.
  // El trigger de la partida marca ganado_en en la misma transacción: si coincide con la partida, lo ganó esta.
  async function mostrarPremioGanado(partidaEn) {
    const o = elOtro();
    const { data } = await X.sb.from("premios").select("id, texto, ganado_en, creado_en").eq("de_usuario", o.id)
      .not("ganado_en", "is", null).order("ganado_en", { ascending: false }).limit(1);
    const p = data && data[0];
    if (!p || new Date(p.ganado_en).getTime() !== new Date(partidaEn).getTime()) return;
    premio.esperando = false;
    premio.ganados = [p, ...premio.ganados.filter((x) => x.id !== p.id)];
    if (!actual) return;
    V.fPremio.querySelector("strong").textContent = `💌 ¡Y te ganaste el premio secreto de ${o.nombre}!`;
    V.dlg.querySelector(".eyebrow").textContent = `Premio secreto de ${o.nombre}`;
    V.dlg.querySelector(".papelito").textContent = p.texto;
    V.fPremio.hidden = false;
    tono(1046, 0.18, "sine", 0.05); tono(1318, 0.3, "sine", 0.05, 0, 0.14);
  }

  async function retar() {
    if (!actual) return;
    const o = elOtro();
    if (prueba) { toast(`(prueba) Reto enviado a ${o.nombre} 😏`); return; }
    if (!actual.guardada) return;
    const k = `juegos-reto-${actual.def.id}`;
    if (Date.now() - (+(leer(k) || 0)) < 3 * 60000) { toast("Ya le mandaste un reto hace poco 😏 Dale tiempo"); return; }
    V.retar.disabled = true;
    const { error } = await X.sb.from("eventos").insert({ pareja_id: X.pareja.id, de_usuario: yo().id, tipo: "reto" });
    V.retar.disabled = false;
    if (error) { toast("No se pudo mandar el reto"); return; }
    anotar(k, String(Date.now()));
    toast(`Reto enviado a ${o.nombre} 😏`);
    if (X.estallido) X.estallido(V.retar, "😏", 6);
  }

  // ---------- Juegos en vivo, los dos a la vez: Batalla naval ⚓ (batalla.js) y UNO 🃏 (uno.js) ----------
  // Cada uno con su motor y su hoja de estilos (uno.css usa piezas de batalla.css, así que va después)
  const EN_VIVO = [{ id: "batalla", global: "Batalla" }, { id: "uno", global: "Uno" }];
  let enVivo = null, conEnVivo = false;
  function bajarEnVivo() {
    if (enVivo) return enVivo;
    const css = EN_VIVO.map((g) => {
      const l = document.createElement("link");
      l.rel = "stylesheet"; l.href = `/juegos/${g.id}.css`; document.head.append(l);
      return l;
    });
    enVivo = new Promise((listo) => {
      const archivos = EN_VIVO.flatMap((g) => [`${g.id}-motor`, g.id]);
      archivos.forEach((j, i) => {
        const s = document.createElement("script");
        s.src = `/juegos/${j}.js`; s.async = false;
        if (i === archivos.length - 1) s.onload = s.onerror = listo;
        document.body.append(s);
      });
    }).then(() => { if (!EN_VIVO.some((g) => window[g.global])) { enVivo = null; css.forEach((l) => l.remove()); } }); // sin red: se reintenta la próxima vez
    return enVivo;
  }
  function conectarEnVivo() {
    if (!X || !X.pareja || !X.otro || !X.otro.id) return;
    EN_VIVO.forEach((g) => {
      if (!window[g.global]) return;
      window[g.global].iniciar({
        sb: prueba ? null : X.sb, prueba, yo: yo(), otro: elOtro(), parejaId: X.pareja.id, toast, vibrar,
        lluvia: (e, n) => { if (X && X.lluvia) X.lluvia(e, n); },
        renderAvatares: () => { if (X && X.renderAvatares) X.renderAvatares(); },
        alCambiar: pintarEnVivo,
      });
    });
    conEnVivo = true;
    pintarEnVivo();
  }
  // Las tarjetas se cambian solas cuando algo pasa en el juego (sin redibujar el resto de la sala). Cada una se pone
  // primera la primera vez: queda arriba el UNO y después la batalla.
  function pintarEnVivo() {
    if (!S || !conEnVivo) return;
    S.vivas = S.vivas || {};
    EN_VIVO.forEach((g) => {
      if (!window[g.global]) return;
      const n = window[g.global].tarjeta();
      if (!n) return;
      const vieja = S.vivas[g.id], tenia = !!vieja && document.activeElement === vieja;
      if (vieja && vieja.parentNode === S.lista) vieja.replaceWith(n); else S.lista.prepend(n);
      S.vivas[g.id] = n;
      if (tenia) n.focus({ preventScroll: true });
    });
  }

  // ---------- registro, arranque y modo de prueba ----------
  function registrar(def) {
    JUEGOS.push(def);
    if (S && X) pintarSala();
  }

  // Solo para probar en el computador sin iniciar sesión: NosotrosJuegos.probar("vuelo", { marcador: { vuelo: [1200, 1800] } })
  // Los juegos en vivo, en dos pestañas: probar("uno") en una y probar("uno", { soy: "otro" }) en la otra (el lado de tu
  // pareja); igual con "batalla"
  function probar(id, op = {}) {
    prueba = true;
    const hoy = new Date().toISOString().slice(0, 10);
    const fer = { id: "yo", nombre: op.yo || "Fernando" }, mar = { id: "otro", nombre: op.otro || "Martina" };
    const y = op.soy === "otro" ? mar : fer, o = op.soy === "otro" ? fer : mar;
    X = {
      user: { id: y.id }, perfil: { nombre: y.nombre }, otro: o, pareja: { id: "prueba" },
      toast: null, lluvia: null, estallido: null, renderAvatares: () => {},
      miTz: () => "America/Guayaquil", suTz: () => "America/Santiago", diaHoy: () => hoy, claveDia: (iso) => String(iso).slice(0, 10),
      ago: () => "hace un momento",
    };
    marcador = {};
    Object.entries(op.marcador || {}).forEach(([j, [mio, suyo]]) => {
      marcador[j] = {};
      if (mio != null) marcador[j].yo = { mejor: mio, partidas: 3, hoy: mio, ultima: null };
      if (suyo != null) marcador[j].otro = { mejor: suyo, partidas: 2, hoy: null, ultima: null };
    });
    premio = { esperando: !!op.premio, mio: null, mios: [], ganados: [] };
    familia = op.familia || [];
    montarSala(); pintarSala();
    const vivo = EN_VIVO.find((g) => g.id === id);
    bajarEnVivo().then(() => { conectarEnVivo(); if (vivo && window[vivo.global]) window[vivo.global].abrir("vivo"); });
    if (id && !vivo) { const def = JUEGOS.find((j) => j.id === id); if (def) abrir(def); }
    return "ok";
  }

  function suscribir() {
    if (canal) X.sb.removeChannel(canal);
    canal = X.sb.channel(`juegos-${X.pareja.id}`).on("postgres_changes",
      { event: "INSERT", schema: "public", table: "partidas", filter: `pareja_id=eq.${X.pareja.id}` },
      (p) => {
        const f = p.new;
        if (!f || !f.id || f.usuario_id === yo().id) return;
        anotarEnMarcador(f.usuario_id, f.juego, f.puntos, f.creado_en);
        recientes = [f, ...recientes].slice(0, 12);
        pintarSala(); marcarPunto();
      }).subscribe();
  }
  function iniciar() {
    if (!window.nosotros || !window.nosotros.pareja) return;
    X = window.nosotros; prueba = false;
    montarSala();
    suscribir();
    cargar().then(() => { pintarSala(); marcarPunto(); });
    bajarEnVivo().then(conectarEnVivo);
  }

  window.NosotrosJuegos = { registrar, probar };
  window.addEventListener("nosotros:dentro", iniciar);
  window.addEventListener("nosotros:juegos", () => {
    if (!X || prueba) return;
    montarSala(); pintarSala(); marcarPunto();
    cargar().then(() => { pintarSala(); marcarPunto(); });
  });
  // Al volver a la app tras un rato: el marcador se pone al día y, si el canal se cayó, se vuelve a abrir
  window.addEventListener("nosotros:aldia", () => {
    if (!X || prueba) return;
    if (!canal || canal.state === "closed" || canal.state === "errored") suscribir();
    cargar().then(() => { pintarSala(); marcarPunto(); });
    if (conEnVivo) EN_VIVO.forEach((g) => { if (window[g.global]) window[g.global].alDia(); });
  });
  // "Atrás" (botón o gesto de Android) en plena partida la pausa en vez de tirarla; si no se está jugando, cierra
  window.addEventListener("popstate", () => {
    if (!actual) return;
    if (actual.estado === "jugando") { history.pushState({ juego: actual.def.id }, ""); pausar(); return; }
    cerrar();
  });
  window.addEventListener("resize", () => { if (actual && actual.inst && actual.inst.ajustar) actual.inst.ajustar(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pausar(); });
  // bajar la cortina de notificaciones no oculta la página, pero sí le quita el foco
  window.addEventListener("blur", () => pausar());
  if (window.nosotros) iniciar();
})();
