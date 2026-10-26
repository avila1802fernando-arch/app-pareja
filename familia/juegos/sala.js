// Recreo · la sala de juegos
// Las tarjetas de la pestaña Juegos, la vista de un juego a pantalla completa (cómo se juega, pausa y fin de la
// partida), la práctica que no cuenta y «Retar por WhatsApp». Los juegos viven en lluvia.js, vuelo.js, memoria.js y
// fusion.js y se anotan con RecreoJuegos.registrar(). Los puntajes van y vienen por RecreoDatos (datos.js).
// Es la sala de la otra app adaptada a varias personas: en vez de un rival hay «metas», las marcas de los demás.
// Arriba van los juegos en vivo, para dos a la vez (Batalla naval y UNO): son los mismos de la otra app (batalla.js y
// uno.js, con sus motores y estilos) y aquí cada uno reta a cualquiera de la familia.
(() => {
  "use strict";
  const D = window.RecreoDatos;
  const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  const NUM = '"Fredoka","Nunito",system-ui,sans-serif';
  const ICONOS = {
    cerrar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
    sonido: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    mudo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
    corona: '<svg class="corona" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 8.5 8 12l4-6.5 4 6.5 4.5-3.5-1.8 9.5H5.3L3.5 8.5Z"/></svg>',
    jugar: '<svg class="ico" aria-hidden="true"><use href="#i-jugar"/></svg>',
    otra: '<svg class="ico" aria-hidden="true"><use href="#i-otra"/></svg>',
    compartir: '<svg class="ico" aria-hidden="true"><use href="#i-compartir"/></svg>',
  };

  const JUEGOS = [];
  let X = null;               // window.recreo
  let V = null, actual = null, foco = null;
  let entraEn = 0;            // cuándo se abrió la pestaña Juegos (para la cascada de las tarjetas)

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
  const reducir = window.matchMedia("(prefers-reduced-motion: reduce)");
  const poco = () => reducir.matches;
  const vibrar = (p) => { if (X && X.vibrar) X.vibrar(p); };
  const toast = (m) => { if (X && X.toast) X.toast(m); };
  const yo = () => (X ? X.yo : { id: null, nombre: "Tú", avatar: "🙂", color: "azul", colorHex: "#3B82F6" });

  // ---------- sonido (Web Audio: tonos cortos, sin archivos) ----------
  let AC = null;
  const estaMudo = () => { try { return localStorage.getItem("recreo-mudo") === "1"; } catch (e) { return false; } };
  function activarAudio() {
    try {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === "suspended") AC.resume();
    } catch (e) { AC = null; }
  }
  function tono(f, dur, tipo, vol, hacia, retraso) {
    if (estaMudo() || !AC) return;
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
  // Estrella de cinco puntas rellena con el color actual; (x, y) es su centro y s su alto
  function estrellita(g, x, y, s) {
    const r1 = s / 2, r2 = r1 * 0.45;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? r2 : r1, a = (Math.PI * i) / 5;
      g.lineTo(x + r * Math.sin(a), y - r * Math.cos(a));
    }
    g.closePath(); g.fill();
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

  // ---------- marcas ----------
  // Mi marca y las de los demás en un juego. `metas`: las de los demás de menor a mayor; `lider`: la más alta.
  function records(id) {
    const m = D.mio(id), metas = D.metas(id);
    return { mio: m.mejor, hoyMio: m.hoy, partidasMio: m.partidas, metas, lider: metas.length ? metas[metas.length - 1] : null };
  }
  const siguienteMeta = (metas, marca) => metas.find((m) => m.mejor > (marca == null ? -1 : marca)) || null; // sin "??": navegadores viejos

  // ---------- las tarjetas de la pestaña Juegos ----------
  // Entran en cascada al abrir la pestaña; si la sala se redibuja a mitad, siguen donde iban
  let finCascada = 0;
  function cascada(lista) {
    const t = Date.now() - entraEn, en = t < 1100 && !poco();
    lista.classList.toggle("entrando", en);
    if (en) lista.style.setProperty("--d", `${-t}ms`);
    // y se apaga al terminar: si no, una tarjeta en vivo que cambia después volvería a entrar
    clearTimeout(finCascada);
    if (en) finCascada = setTimeout(() => lista.classList.remove("entrando"), 1700 - t);
  }
  // El puntaje final sube contando (como en las máquinas de juegos)
  function contar(el, n) {
    const mia = (el._cuenta = {});
    if (poco() || n < 10 || !window.requestAnimationFrame) { el.textContent = fmt(n); return; }
    const t0 = performance.now(), dur = Math.min(900, 350 + n / 15);
    const paso = (t) => {
      if (el._cuenta !== mia) return;
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = fmt(Math.round(n * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(paso);
    };
    el.textContent = "0";
    requestAnimationFrame(paso);
  }
  function pintarSala() {
    const lista = $("juegos-lista");
    if (!lista || !X) return;
    lista.innerHTML = "";
    cascada(lista);
    JUEGOS.forEach((j) => lista.append(cartaJuego(j)));
    pintarEnVivo();
  }
  function cartaJuego(j) {
    const t = D.tabla(j.id), primero = t[0] && t[0].marca != null ? t[0] : null;
    const mia = t.find((f) => f.persona.usuario_id === yo().id) || { marca: null };
    const b = boton("j-carta tarjeta");
    ["--j-a", "--j-b", "--j-c"].forEach((v, i) => b.style.setProperty(v, j.tono[i]));
    const arte = nodo("span", `arte arte-${j.id} sticker`); arte.innerHTML = j.arte; arte.setAttribute("aria-hidden", "true");
    const info = nodo("span", "j-info");
    info.append(nodo("strong", "j-nombre", j.nombre), nodo("small", "j-lema", j.lema));
    const marcas = nodo("span", "j-marcas"), lider = nodo("span", "j-lider"), txt = nodo("span");
    let linea1, linea2;
    if (!primero) { linea1 = "Nadie ha jugado todavía"; linea2 = "¡Estrénalo!"; }
    else if (primero.persona.usuario_id === yo().id) { linea1 = `Tú · ${j.marca(primero.marca)}`; linea2 = "¡Vas primero!"; }
    else {
      linea1 = `${primero.persona.nombre} · ${j.marca(primero.marca)}`;
      linea2 = mia.marca == null ? "Tú: todavía no juegas" : `Tú: ${j.marca(mia.marca)} · ${mia.puesto}º lugar`;
    }
    txt.append(nodo("b", null, linea1), nodo("small", null, linea2));
    if (primero) lider.insertAdjacentHTML("beforeend", ICONOS.corona);
    lider.append(txt);
    const jugar = nodo("span", "btn btn-sol btn-chico"); jugar.innerHTML = ICONOS.jugar + "Jugar";
    marcas.append(lider, jugar);
    b.append(arte, info, marcas);
    b.setAttribute("aria-label", `${j.nombre}. ${linea1}. ${linea2}. Jugar`);
    b.addEventListener("click", () => abrir(j));
    return b;
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
    V.cinta = nodo("p", "jv-cinta", "Práctica: no se guarda"); V.cinta.hidden = true;
    V.campo = nodo("div", "jv-campo");

    // antes de jugar: reglas y metas
    V.inicio = nodo("div", "jv-capa jv-inicio");
    V.iTitulo = nodo("h3", "jv-h"); V.iReglas = nodo("ul", "jv-reglas");
    V.iNota = nodo("p", "jv-nota"); V.iDetalle = nodo("p", "jv-detalle");
    V.iMetas = nodo("div", "jv-metas");
    V.jugar = boton("btn btn-sol btn-ancho jv-accion");
    V.practicar = boton("btn btn-sec btn-ancho jv-accion"); V.practicar.textContent = "Practicar (no cuenta)";
    V.iExtra = nodo("div", "jv-extra");
    V.inicio.append(nodo("p", "jv-ojo", "Cómo se juega"), V.iTitulo, V.iReglas, V.iNota, V.iDetalle, V.iMetas, V.jugar, V.practicar, V.iExtra);

    // pausa
    V.pausa = nodo("div", "jv-capa jv-pausa"); V.pausa.hidden = true;
    V.seguir = boton("btn btn-sol btn-ancho jv-accion"); V.seguir.textContent = "Seguir jugando";
    V.rendirse = boton("btn btn-sec btn-ancho jv-accion"); V.rendirse.textContent = "Terminar y guardar mi puntaje";
    V.salirP = boton("enlace"); V.salirP.textContent = "Salir sin guardar";
    V.pausa.append(nodo("p", "jv-ojo", "Pausa"), nodo("h3", "jv-h", "Aquí te esperamos ⏸️"), V.seguir, V.rendirse, V.salirP);

    // fin de la partida
    V.fin = nodo("div", "jv-capa jv-fin"); V.fin.hidden = true;
    V.fRango = nodo("p", "jv-rango");
    V.fPuntaje = nodo("div", "jv-puntaje"); V.fNum = nodo("span"); V.fUnidad = nodo("small"); V.fPuntaje.append(V.fNum, V.fUnidad);
    V.fInsignia = nodo("p", "jv-insignia"); V.fPuesto = nodo("p", "jv-puesto"); V.fFrase = nodo("p", "jv-frase"); V.fStats = nodo("div", "jv-stats");
    V.otra = boton("btn btn-sol btn-ancho jv-accion");
    V.retar = boton("btn btn-sec btn-ancho jv-accion"); V.retar.innerHTML = ICONOS.compartir + "Retar por WhatsApp";
    V.salir = boton("enlace"); V.salir.textContent = "Volver a los juegos";
    V.fin.append(nodo("p", "jv-ojo", "Fin de la partida"), V.fRango, V.fPuntaje, V.fInsignia, V.fPuesto, V.fFrase, V.fStats, V.otra, V.retar, V.salir);

    V.campo.append(V.inicio, V.pausa, V.fin);
    marco.append(barra, V.hud, V.cinta, V.campo);
    raiz.append(marco);
    document.body.append(raiz);
    V.raiz = raiz;

    V.cerrar.addEventListener("click", () => (actual && actual.estado === "jugando" ? pausar() : salir()));
    V.sonido.addEventListener("click", () => {
      try { localStorage.setItem("recreo-mudo", estaMudo() ? "0" : "1"); } catch (e) {}
      window.dispatchEvent(new Event("recreo:sonido")); activarAudio();
    });
    V.jugar.addEventListener("click", () => empezar(false));
    V.practicar.addEventListener("click", () => empezar(true));
    V.otra.addEventListener("click", () => empezar(false));
    V.retar.addEventListener("click", compartir);
    V.salir.addEventListener("click", salir);
    V.seguir.addEventListener("click", seguir);
    V.rendirse.addEventListener("click", rendirse);
    V.salirP.addEventListener("click", salir);
    raiz.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (actual && actual.estado === "jugando") pausar(); else if (actual && actual.estado === "pausa") seguir(); else salir();
    });
    pintarSonido();
  }
  function pintarSonido() {
    if (!V) return;
    V.sonido.innerHTML = estaMudo() ? ICONOS.mudo : ICONOS.sonido;
    V.sonido.setAttribute("aria-label", estaMudo() ? "Activar el sonido" : "Silenciar el sonido");
    V.sonido.setAttribute("aria-pressed", String(estaMudo()));
  }
  window.addEventListener("recreo:sonido", pintarSonido);
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
      get records() { return records(def.id); },
      get practica() { return !!(actual && actual.practica); },
      campo: V.campo, tono, vibrar, estrellita, sprite, NUM, MANO: NUM, EMOJI,
      pocoMovimiento: poco,
      lienzo: () => lienzo(V.campo),
      lluvia: (e, n) => { if (X && X.lluvia) X.lluvia(e, n); },
      jugando: () => !!actual && actual.estado === "jugando",
      hud(k, v, caliente) {
        const e = V.hudVal[k]; if (!e) return;
        const t = String(v);
        if (e.textContent !== t) {
          // si sube de golpe (no algo que cambia en cada cuadro, como los metros), da un saltito
          const n = parseInt(t.replace(/[^\d]/g, ""), 10) || 0, ahora = Date.now();
          const salta = n > (e._n || 0) && ahora - (e._t || 0) > 250;
          e.textContent = t; e._n = n; e._t = ahora;
          if (salta && !poco() && e.animate && (!e._pop || e._pop.playState === "finished")) {
            e._pop = e.animate([{ transform: "scale(1.3)" }, { transform: "scale(1)" }], { duration: 260, easing: "cubic-bezier(.34,1.56,.64,1)" });
          }
        }
        e.classList.toggle("caliente", !!caliente);
      },
      terminar: (res) => terminar(res),
    };
  }

  function abrir(def) {
    montarVista();
    if (actual) cerrar();
    activarAudio();
    actual = { def, estado: "inicio", guardada: false, practica: false };
    ["--j-a", "--j-b", "--j-c"].forEach((v, i) => V.raiz.style.setProperty(v, def.tono[i]));
    V.raiz.dataset.juego = def.id;
    V.titulo.textContent = def.nombre;
    V.hud.innerHTML = ""; V.hudVal = {};
    V.hud.style.setProperty("--n", def.hud.length);
    def.hud.forEach(([k, etiqueta]) => {
      const d = nodo("div"), v = nodo("span", "val", "0");
      d.append(nodo("span", "lbl", etiqueta), v); V.hud.append(d); V.hudVal[k] = v;
    });
    V.cinta.hidden = true;
    foco = document.activeElement;
    V.raiz.hidden = false;
    document.body.classList.add("con-juego");
    fondoInerte(true);
    history.pushState({ juego: def.id }, ""); // "atrás" en Android cierra el juego
    actual.api = crearApi(def);
    actual.inst = def.crear(actual.api);
    pintarInicio();
    mostrarCapa("inicio");
    // la letra de los números se carga antes de dibujar el campo otra vez
    if (document.fonts && document.fonts.load) {
      document.fonts.load(`700 20px ${NUM}`).then(() => actual && actual.inst.ajustar && actual.inst.ajustar(), () => {});
    }
    V.jugar.focus({ preventScroll: true });
  }

  function pintarInicio() {
    const { def, api } = actual, r = records(def.id);
    V.iTitulo.textContent = `¿Te animas, ${yo().nombre}?`;
    V.iReglas.innerHTML = "";
    def.reglas.forEach(([ic, t, malo]) => {
      const li = nodo("li", malo ? "malo" : null), s = nodo("span", "ic", ic);
      s.setAttribute("aria-hidden", "true"); li.append(s, t); V.iReglas.append(li);
    });
    V.iNota.textContent = typeof def.nota === "function" ? def.nota(api) : def.nota || "";
    V.iDetalle.textContent = def.detalle || ""; V.iDetalle.hidden = !def.detalle;
    V.iMetas.innerHTML = "";
    const chip = (txt, b, cls) => { const s = nodo("span", cls || null); s.append(txt, nodo("b", null, b)); V.iMetas.append(s); };
    if (r.lider && (r.mio == null || r.lider.mejor > r.mio)) chip(`👑 ${r.lider.nombre} `, def.marca(r.lider.mejor), "lider");
    else if (r.mio != null && r.metas.length) chip("👑 Tú ", def.marca(r.mio), "lider");
    const sig = siguienteMeta(r.metas, r.mio);
    if (sig && sig !== r.lider) chip(`Siguiente: ${sig.nombre} `, def.marca(sig.mejor));
    chip("Tu marca ", r.mio == null ? "—" : def.marca(r.mio));
    V.iExtra.innerHTML = "";
    if (def.extra) def.extra(api, V.iExtra);
    V.jugar.innerHTML = ICONOS.jugar + (def.botonJugar || "¡A jugar!");
  }

  function empezar(practica) {
    if (!actual) return;
    activarAudio();
    mostrarCapa(null);
    actual.estado = "jugando"; actual.guardada = false; actual.practica = !!practica;
    V.cinta.hidden = !actual.practica;
    actual.inst.iniciar();
  }
  function pausar() {
    if (!actual || actual.estado !== "jugando") return;
    actual.estado = "pausa";
    if (actual.inst.pausar) actual.inst.pausar();
    V.rendirse.hidden = !actual.inst.rendirse || actual.practica;
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
    else cerrar();
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

  // El final de la partida: siempre algo bueno que decir (ver docs/plan-familia.md §9.3)
  function resumen(def, puntos, antes, practica) {
    const marca = (n) => def.marca(n);
    const otros = antes.metas, lider = antes.lider, maxOtros = lider ? lider.mejor : null;
    const yaPrimero = antes.mio != null && (maxOtros == null || antes.mio > maxOtros);
    const mejor = antes.mio == null ? puntos : Math.max(antes.mio, puntos);
    const puestoDe = (m) => 1 + otros.filter((o) => o.mejor > m).length;
    const nuevo = puntos > 0 && (antes.mio == null || puntos > antes.mio);
    const sig = siguienteMeta(otros, puntos);
    const r = { insignia: "", oro: false, frase: "", puesto: "", celebrar: null };
    if (!practica && (puntos > 0 || antes.mio != null)) r.puesto = `Vas ${puestoDe(mejor)}º de ${otros.length + 1} en este juego`;
    if (practica) r.frase = "Práctica: no se guardó. ¿Ahora de verdad?";
    else if (maxOtros != null && puntos > maxOtros && !yaPrimero) {
      r.insignia = `👑 ¡Primer lugar! Pasaste a ${lider.nombre}`; r.oro = true; r.celebrar = "👑";
      r.frase = "Que el resto vaya preparando la revancha.";
    } else if (maxOtros != null && puntos > 0 && puntos === maxOtros && !yaPrimero) {
      r.insignia = "¡Empate en el primer lugar!"; r.celebrar = "✨"; r.frase = "Una partida más y es tuyo.";
    } else if (nuevo && otros.length) {
      r.insignia = "✨ ¡Nuevo récord personal!"; r.celebrar = "✨";
      const pasados = otros.filter((o) => o.mejor < puntos && (antes.mio == null || o.mejor >= antes.mio));
      if (yaPrimero) r.frase = "Y sigues en el primer lugar 👑";
      else if (pasados.length) r.frase = `Subiste al ${puestoDe(puntos)}º lugar: pasaste a ${pasados.map((o) => o.nombre).join(" y ")}.`;
      else if (sig) r.frase = `Te faltan ${marca(sig.mejor - puntos)} para alcanzar a ${sig.nombre}.`;
    } else if (!otros.length) {
      if (nuevo) { r.insignia = "✨ ¡Nuevo récord personal!"; r.celebrar = "✨"; }
      r.frase = "Nadie más ha jugado este todavía: tu marca es la meta.";
    } else if (yaPrimero) r.frase = "Sigues en el primer lugar 👑";
    else if (sig && puntos >= sig.mejor * 0.85) r.frase = `Te faltaron ${marca(sig.mejor - puntos)} para pasar a ${sig.nombre}. ¡Casi!`;
    else if (sig) r.frase = `La marca de ${sig.nombre} sigue ahí: ${marca(sig.mejor)}. ¡Tú puedes!`;
    return r;
  }

  async function terminar(res) {
    // también en pausa: un juego puede terminar solo (p. ej. Memoria tras su última ronda) mientras está pausado
    if (!actual || (actual.estado !== "jugando" && actual.estado !== "pausa")) return;
    actual.estado = "fin";
    const { def, practica } = actual, antes = records(def.id);
    const puntos = Math.max(0, Math.round(res.puntos || 0));
    const r = resumen(def, puntos, antes, practica);
    actual.ultimo = puntos;

    V.fRango.textContent = def.rango(puntos, res).nombre;
    contar(V.fNum, puntos); V.fUnidad.textContent = def.unidad;
    V.fInsignia.hidden = !r.insignia; V.fInsignia.textContent = r.insignia; V.fInsignia.classList.toggle("oro", r.oro);
    V.fPuesto.hidden = !r.puesto; V.fPuesto.textContent = r.puesto;
    V.fFrase.textContent = [res.prefijo, r.frase].filter(Boolean).join(" ");
    V.fStats.innerHTML = "";
    (res.stats || []).slice(0, 3).forEach(([v, et]) => {
      const d = nodo("div"); d.append(nodo("b", null, String(v)), nodo("span", null, et)); V.fStats.append(d);
    });
    V.fStats.hidden = !(res.stats || []).length;
    V.otra.innerHTML = ICONOS.otra + (practica ? "Jugar de verdad" : "Otra vez");
    V.retar.hidden = practica || puntos <= 0;
    V.cinta.hidden = true;
    mostrarCapa("fin");
    V.otra.focus({ preventScroll: true });
    if (r.celebrar === "👑") { fanfarria(); vibrar([60, 40, 60, 40, 220]); setTimeout(() => X.lluvia("👑", 16), 250); }
    else if (r.celebrar) { fanfarria(); setTimeout(() => X.lluvia("✨", 12), 250); }
    else consuelo();

    if (practica) return;
    const ok = await D.guardar(def.id, puntos, res.detalle);
    if (actual && actual.def === def) actual.guardada = true;
    if (!ok) toast("Sin señal: tu partida se guardará apenas vuelva internet 📶");
  }

  // Retar por WhatsApp (o lo que el teléfono ofrezca para compartir)
  async function compartir() {
    if (!actual) return;
    const { def } = actual;
    const texto = `¡Te reto en ${def.nombre}! Hice ${def.marca(actual.ultimo || 0)} ${def.emoji || "🎮"}. ¿Me ganas? ${location.origin}`;
    if (navigator.share) {
      try { await navigator.share({ text: texto }); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    window.open("https://wa.me/?text=" + encodeURIComponent(texto), "_blank", "noopener");
  }

  // ---------- juegos en vivo, para dos a la vez: Batalla naval ⚓ (batalla.js) y UNO 🃏 (uno.js) ----------
  // Cada uno con su motor y su hoja de estilos (uno.css usa piezas de batalla.css, así que va después). Se bajan
  // después de entrar, así no demoran la app. Se reta a cualquiera de la familia; las partidas con Fernando también
  // las ve él desde la otra app.
  const EN_VIVO = [{ id: "batalla", global: "Batalla" }, { id: "uno", global: "Uno" }];
  let enVivo = null, conectadoComo = null;
  const vivas = {};
  function bajarEnVivo() {
    if (enVivo) return enVivo;
    const css = EN_VIVO.map((g) => {
      const l = document.createElement("link");
      l.rel = "stylesheet"; l.href = `/juegos/${g.id}.css`; document.head.append(l);
      return l;
    });
    enVivo = new Promise((listo) => {
      const archivos = [];
      EN_VIVO.forEach((g) => archivos.push(`${g.id}-motor`, g.id));
      archivos.forEach((j, i) => {
        const s = document.createElement("script");
        s.src = `/juegos/${j}.js`; s.async = false;
        if (i === archivos.length - 1) s.onload = s.onerror = listo;
        document.body.append(s);
      });
    }).then(() => { if (!EN_VIVO.some((g) => window[g.global])) { enVivo = null; css.forEach((l) => l.remove()); } }); // sin red: se reintenta la próxima vez
    return enVivo;
  }
  // Con quién se puede jugar: todos los de la familia menos yo (la que está oculta ni llega: RLS no la deja ver)
  const rivalesEnVivo = () => D.miembros().filter((m) => m.usuario_id && m.usuario_id !== yo().id)
    .map((m) => ({ id: m.usuario_id, nombre: m.nombre || "Alguien", avatar: m.avatar || "🙂", color: m.color || "azul" }));
  function conectarEnVivo() {
    const y = yo();
    if (!X || !y.id) return;
    EN_VIVO.forEach((g) => {
      if (!window[g.global]) return;
      if (conectadoComo === y.id) { window[g.global].rivales(rivalesEnVivo()); return; }
      window[g.global].iniciar({
        app: "recreo", sb: X.prueba ? null : X.sb, prueba: !!X.prueba, yo: { id: y.id, nombre: y.nombre, avatar: y.avatar, color: y.color },
        rivales: rivalesEnVivo(), enlace: location.origin, toast, vibrar,
        lluvia: (e, n) => { if (X && X.lluvia) X.lluvia(e, n); },
        alCambiar: pintarEnVivo,
      });
    });
    conectadoComo = y.id;
    pintarEnVivo();
  }
  const ponerEnVivo = () => bajarEnVivo().then(conectarEnVivo);
  // Las tarjetas se cambian solas cuando algo pasa en el juego (sin redibujar el resto de la sala); van arriba de
  // todo: primero el UNO y después la batalla
  function pintarEnVivo() {
    const lista = $("juegos-lista");
    if (!lista || !X || !conectadoComo) return;
    EN_VIVO.forEach((g) => {
      if (!window[g.global]) return;
      const n = window[g.global].tarjeta();
      if (!n) return;
      const vieja = vivas[g.id], tenia = !!vieja && document.activeElement === vieja;
      if (vieja && vieja.parentNode === lista) vieja.replaceWith(n); else lista.prepend(n);
      vivas[g.id] = n;
      if (tenia) n.focus({ preventScroll: true });
    });
  }

  // ---------- registro y arranque ----------
  function registrar(def) {
    JUEGOS.push(def);
    if (X) pintarSala();
  }
  const juego = (id) => JUEGOS.find((j) => j.id === id) || null;

  window.RecreoJuegos = { registrar, juego, juegos: () => JUEGOS.slice() };
  window.addEventListener("recreo:dentro", () => { X = window.recreo; pintarSala(); ponerEnVivo(); });
  window.addEventListener("recreo:datos", () => { if (X && !actual) pintarSala(); if (X) ponerEnVivo(); });
  window.addEventListener("recreo:tab", (e) => { if (e.detail === "juegos") { entraEn = Date.now(); if (X && !actual) pintarSala(); } });
  // Al volver a la app tras un rato: los juegos en vivo se ponen al día (y vuelven a abrir su canal si se cayó)
  window.addEventListener("recreo:aldia", () => { if (conectadoComo) EN_VIVO.forEach((g) => { if (window[g.global]) window[g.global].alDia(); }); });
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
})();
