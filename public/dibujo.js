// Dibujos con el dedo ✏️
// Un lienzo para hacerle un dibujo al otro: pinceles (lápiz, marcador, spray y neón), borrador, línea y formas,
// balde de pintura, stickers y texto, con 23 colores y uno a elección, grosor, opacidad, deshacer y rehacer.
// El fondo puede ser un color, un papel (cuadros, rayas, puntos o corazones) o una foto, y se cambia cuando quieras:
// lo dibujado va en una capa transparente aparte, así el borrador y el balde nunca tocan el fondo.
// Se envía como un momento (una imagen con su fondo, en la tabla momentos): del otro lado se ve igual y queda en el
// álbum junto a las fotos y los dibujos de antes. También se puede guardar en el teléfono.
// Si se cierra sin enviar, el dibujo sigue ahí al volver a abrirlo (mientras la app no se cierre).
// app.js deja lo que hace falta en window.nosotros.
(() => {
  "use strict";
  const L = 1080;    // lado del lienzo y de la imagen que se envía (los dibujos de antes eran de 720)
  const PASOS = 50;  // cuántas cosas se pueden deshacer
  const FONDO = Object.freeze({ color: "#fffafc", papel: "liso", foto: null }); // el de siempre: el papel rosado de la app
  const COLORES = [
    ["#e0457b", "Rosa"], ["#c9325c", "Frambuesa"], ["#ff9ab8", "Rosa claro"], ["#e53935", "Rojo"],
    ["#ff7a3d", "Naranja"], ["#f7b500", "Amarillo"], ["#ffe27a", "Amarillo pastel"], ["#8b5a2b", "Café"],
    ["#3f9b4a", "Verde"], ["#9bd770", "Verde claro"], ["#0f8f86", "Turquesa"], ["#5fd8c9", "Aguamarina"],
    ["#3b82f6", "Azul"], ["#9cc8ff", "Celeste"], ["#1e3a8a", "Azul marino"], ["#7c3aed", "Morado"],
    ["#c9a7ff", "Lila"], ["#f1c7a1", "Piel"], ["#ffd6e3", "Rosa pastel"], ["#ffffff", "Blanco"],
    ["#bdbdbd", "Gris claro"], ["#6b6b6b", "Gris"], ["#1f1a1d", "Negro"],
  ];
  const FONDOS = [
    ["#fffafc", "Papel rosado"], ["#ffffff", "Blanco"], ["#fff3b0", "Amarillo"], ["#ffd6e3", "Rosa"],
    ["#d4ecff", "Celeste"], ["#e8dcff", "Lila"], ["#dcf3e6", "Menta"], ["#ffe1c7", "Durazno"],
    ["#efe3d0", "Papel kraft"], ["#2a1530", "Noche"], ["#10233f", "Azul noche"], ["#1f1a1d", "Negro"],
  ];
  const HERRAMIENTAS = [["pincel", "Pincel"], ["borrador", "Borrador"], ["formas", "Formas"], ["balde", "Balde"], ["sticker", "Stickers"], ["texto", "Texto"]];
  const PINCELES = [["lapiz", "Lápiz"], ["marcador", "Marcador"], ["spray", "Spray"], ["neon", "Neón"]];
  const FORMAS = [["linea", "Línea"], ["rect", "Cuadrado"], ["circulo", "Círculo"], ["corazon", "Corazón"], ["estrella", "Estrella"]];
  const PAPELES = [["liso", "Liso"], ["cuadros", "Cuadros"], ["rayas", "Rayas"], ["puntos", "Puntos"], ["corazones", "Corazones"]];
  // las letras de la app: a mano (Caveat), redonda (Nunito) y elegante (Fraunces): nombre, familia, peso y estilo
  const LETRAS = [
    ["mano", "A mano", '"Caveat", cursive', 600, "normal"],
    ["redonda", "Redonda", '"Nunito", sans-serif', 700, "normal"],
    ["elegante", "Elegante", '"Fraunces", serif', 500, "italic"],
  ];
  const STICKERS = ["❤️", "💕", "💖", "💘", "💋", "😘", "🥰", "😍", "😊", "😂", "🥺", "😭", "😎", "🤗", "🙈", "😴",
    "✨", "⭐", "🌙", "☀️", "🌈", "🌸", "🌻", "🌹", "🦋", "🐱", "🐶", "🧸", "🎁", "✈️", "🇪🇨", "🇨🇱"];
  const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  // grosor de cada herramienta, en píxeles del lienzo: el mínimo, el máximo y con el que parte
  const TAMANOS = { pincel: [3, 120, 22], borrador: [12, 240, 70], formas: [3, 70, 14], sticker: [60, 540, 200], texto: [40, 320, 150] };
  const CON_COLOR = ["pincel", "formas", "balde", "texto"];
  const PISTAS = {
    borrador: "Borra lo dibujado; el fondo no se borra.",
    formas: "Arrastra en el dibujo para hacer la forma. Con un toque sale una mediana.",
    balde: "Toca una parte del dibujo para pintarla hasta sus bordes.",
    sticker: "Toca el dibujo para pegarlo. Antes de soltar, arrástralo a donde quieras.",
    texto: "Escribe y toca el dibujo para ponerlo. Antes de soltar, arrástralo a donde quieras.",
    fondo: "El fondo se cambia cuando quieras: lo dibujado no se toca.",
  };
  // íconos con el mismo trazo que los del sprite de index.html
  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICONOS = {
    pincel: svg('<path d="M19.5 4.5c-2.7.9-6.5 4.6-8.5 7.5l1.6 1.6c2.9-2 6.6-5.8 7.5-8.5Z"/><path d="M10.6 12.6c-2.3-.2-4.1 1.4-4.1 3.6 0 1.3-.9 2.4-2.5 3 3.5 1.4 7.6.3 8.1-3.2"/>'),
    borrador: svg('<path d="m14.3 4.6 5.1 5.1a1.5 1.5 0 0 1 0 2.1l-7.6 7.7H8.2l-3.6-3.6a1.5 1.5 0 0 1 0-2.1l7.6-9.2a1.5 1.5 0 0 1 2.1 0Z"/><path d="m9.2 9.2 5.6 5.6M11.8 19.5h7.7"/>'),
    formas: svg('<rect x="3.5" y="10" width="9.5" height="9.5" rx="1.5"/><circle cx="15.5" cy="8.5" r="5"/>'),
    balde: svg('<path d="M11 4.5 18.5 12l-6.2 6.2a2 2 0 0 1-2.8 0l-4.7-4.7a2 2 0 0 1 0-2.8Z"/><path d="M4.6 12.5h13.6M8.6 3.6 11 6"/><path d="M20 15.2c1 1.4 1.5 2.4 1.5 3.1a1.5 1.5 0 0 1-3 0c0-.7.5-1.7 1.5-3.1Z"/>'),
    sticker: svg('<circle cx="12" cy="12" r="8.5"/><path d="M8.6 14c.9 1.3 2 1.9 3.4 1.9s2.5-.6 3.4-1.9M9.3 9.6h.01M14.7 9.6h.01"/>'),
    texto: svg('<path d="M5.5 7V5h13v2M12 5v14M9.5 19h5"/>'),
    fondo: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.6"/><path d="m4 17 4.8-4.3 3.7 3.2 2.8-2.4 4.7 4"/>'),
    deshacer: svg('<path d="M9 13.5 4.5 9 9 4.5"/><path d="M4.5 9h10a5 5 0 0 1 0 10h-3"/>'),
    rehacer: svg('<path d="m15 13.5 4.5-4.5L15 4.5"/><path d="M19.5 9h-10a5 5 0 0 0 0 10h3"/>'),
    limpiar: svg('<path d="M4.5 6.5h15M9.5 6.5v-2h5v2M6.5 6.5l.9 12.1a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.1M10 10.5v5.5M14 10.5v5.5"/>'),
    guardar: svg('<path d="M12 4v10.5M7.5 10.5 12 15l4.5-4.5M4.5 15.5V18a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5"/>'),
    foto: '<svg class="ico" aria-hidden="true"><use href="#i-camara"/></svg>',
    linea: svg('<path d="M5 19 19 5"/>'),
    rect: svg('<rect x="4.5" y="4.5" width="15" height="15" rx="1.5"/>'),
    circulo: svg('<circle cx="12" cy="12" r="7.5"/>'),
    corazon: svg('<path d="M12 20.5c-5-3.6-8.5-7-8.5-11A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8.5 2.5c0 4-3.5 7.4-8.5 11Z"/>'),
    estrella: svg('<path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8Z"/>'),
    relleno: svg('<path fill="currentColor" d="M12 20.5c-5-3.6-8.5-7-8.5-11A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8.5 2.5c0 4-3.5 7.4-8.5 11Z"/>'),
  };

  // ---------- utilidades ----------
  const $ = (id) => document.getElementById(id);
  const boton = () => { const b = document.createElement("button"); b.type = "button"; return b; };
  const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const luz = (hex) => { const [r, g, b] = rgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  const esHex = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
  const letra = (h) => LETRAS.find((l) => l[0] === h) || LETRAS[0];
  const fuente = (h, t) => { const [, , fam, peso, estilo] = letra(h); return `${estilo} ${peso} ${t}px ${fam}`; };
  // Números al azar que se repiten con la misma semilla: el spray sale igual al deshacer y rehacer
  const azar = (s) => () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // ---------- estado ----------
  const dib = {
    herr: "pincel", pincel: "lapiz", forma: "corazon", relleno: false, letra: "mano", sticker: STICKERS[0],
    color: COLORES[0][0], libre: null, fondoLibre: null, opacidad: 100, tam: {}, fondo: FONDO, verFondo: false,
  };
  Object.keys(TAMANOS).forEach((k) => (dib.tam[k] = TAMANOS[k][2]));
  // hechos: lo que se ve, en orden (se puede deshacer); lo que ya no se puede deshacer queda pintado en la base
  let listo = false, hechos = [], deshechos = [], actual = null, sucio = false, dedo = null, cuadro = 0, rocio = null, avisoTimer = null;
  let dlg, pantalla, ctx, fondoC, capaC, baseC, vivoC, pasoC, fijoC, fctx, cctx, bctx, vctx, pctx, fijoX;

  // Las herramientas quedan como las dejaste la última vez (solo en este teléfono)
  function recordar() {
    const { herr, pincel, forma, relleno, letra: l, sticker, color, libre, opacidad, tam } = dib;
    try { localStorage.setItem("dibujo-herramientas", JSON.stringify({ herr, pincel, forma, relleno, letra: l, sticker, color, libre, opacidad, tam })); } catch (e) {}
  }
  function acordarse() {
    let g = null;
    try { g = JSON.parse(localStorage.getItem("dibujo-herramientas")); } catch (e) {}
    if (!g || typeof g !== "object") return;
    const hay = (lista, v) => lista.some((x) => x[0] === v);
    if (hay(HERRAMIENTAS, g.herr)) dib.herr = g.herr;
    if (hay(PINCELES, g.pincel)) dib.pincel = g.pincel;
    if (hay(FORMAS, g.forma)) dib.forma = g.forma;
    if (hay(LETRAS, g.letra)) dib.letra = g.letra;
    if (STICKERS.includes(g.sticker)) dib.sticker = g.sticker;
    if (esHex(g.color)) dib.color = g.color;
    if (esHex(g.libre)) dib.libre = g.libre;
    dib.relleno = g.relleno === true;
    if (g.opacidad >= 10 && g.opacidad <= 100) dib.opacidad = g.opacidad;
    if (g.tam) Object.keys(TAMANOS).forEach((k) => { const [a, b] = TAMANOS[k]; if (g.tam[k] >= a && g.tam[k] <= b) dib.tam[k] = g.tam[k]; });
  }

  // ---------- abrir ----------
  $("btn-dibujo").addEventListener("click", () => {
    const X = window.nosotros; if (!X) return;
    preparar();
    $("dibujo-para").textContent = `Un dibujo para ${X.otro.nombre}`;
    pintarBarra(); componer();
    dlg.showModal();
    pintarPanel(); // después de abrir: la muestra del grosor se mide con el lienzo ya en pantalla
  });
  // Los lienzos se arman recién la primera vez que se abre (son varios y ocupan memoria)
  function preparar() {
    if (listo) return;
    listo = true; acordarse();
    dlg = $("dlg-dibujo"); pantalla = $("dibujo-canvas"); pantalla.width = pantalla.height = L;
    ctx = pantalla.getContext("2d");
    [fondoC, capaC, baseC, vivoC, pasoC, fijoC] = [0, 0, 0, 0, 0, 0].map(() => { const c = document.createElement("canvas"); c.width = c.height = L; return c; });
    [fctx, cctx, bctx, vctx, pctx, fijoX] = [fondoC, capaC, baseC, vivoC, pasoC, fijoC].map((c) => c.getContext("2d"));
    armar(); escuchar(); pintarFondo();
  }

  // ---------- botones ----------
  // Botones de los que se elige uno (role=radio): `vestir` les pone su cara y `elegir` guarda lo elegido
  function grupo(id, opciones, vestir, elegir) {
    const g = $(id);
    opciones.forEach((op) => {
      const b = boton(); b.setAttribute("role", "radio"); b.dataset.valor = op[0]; vestir(b, op);
      b.addEventListener("click", () => { elegir(op[0]); elegido(); });
      g.append(b);
    });
  }
  const marcar = (id, valor) => $(id).querySelectorAll("[data-valor]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.valor === valor)));
  const elegido = () => { pintarPanel(); recordar(); };
  // El último círculo de cada paleta abre el selector de colores del teléfono
  function otroColor(id, nombre, alElegir) {
    const c = document.createElement("label"), i = document.createElement("i"), e = document.createElement("input");
    c.className = "dib-libre"; e.type = "color"; e.setAttribute("aria-label", nombre);
    e.addEventListener("input", () => alElegir(e.value));
    c.append(i, e); $(id).append(c);
    return c;
  }
  function armar() {
    [["dib-deshacer", "deshacer", deshacer], ["dib-rehacer", "rehacer", rehacer], ["dib-limpiar", "limpiar", limpiar], ["dib-guardar", "guardar", guardar]]
      .forEach(([id, ico, fn]) => { const b = $(id); b.insertAdjacentHTML("afterbegin", ICONOS[ico]); b.addEventListener("click", fn); });
    grupo("dib-herramientas", HERRAMIENTAS, (b, [h, n]) => (b.innerHTML = `${ICONOS[h]}<span>${n}</span>`), (h) => { dib.herr = h; dib.verFondo = false; });
    $("dib-fondo").insertAdjacentHTML("afterbegin", ICONOS.fondo);
    $("dib-fondo").addEventListener("click", () => { dib.verFondo = !dib.verFondo; pintarPanel(); });
    grupo("dib-pinceles", PINCELES, (b, [, n]) => (b.textContent = n), (v) => (dib.pincel = v));
    grupo("dib-formas", FORMAS, (b, [v, n]) => { b.innerHTML = ICONOS[v]; b.setAttribute("aria-label", n); b.title = n; }, (v) => (dib.forma = v));
    $("dib-relleno").insertAdjacentHTML("afterbegin", ICONOS.relleno);
    $("dib-relleno").addEventListener("click", () => { dib.relleno = !dib.relleno; elegido(); });
    grupo("dib-letras", LETRAS, (b, [, n, fam, peso, estilo]) => { b.textContent = n; Object.assign(b.style, { fontFamily: fam, fontWeight: peso, fontStyle: estilo }); },
      (v) => { dib.letra = v; letrasListas(); });
    grupo("dib-stickers", STICKERS.map((s) => [s]), (b, [s]) => { b.textContent = s; b.setAttribute("aria-label", `Sticker ${s}`); }, (v) => (dib.sticker = v));
    grupo("dib-colores", COLORES, (b, [v, n]) => { b.style.background = v; b.setAttribute("aria-label", n); }, (v) => (dib.color = v));
    otroColor("dib-colores", "Otro color", (v) => { dib.color = dib.libre = v; pintarPanel(); recordar(); });
    grupo("dib-fondos", FONDOS, (b, [v, n]) => { b.style.background = v; b.setAttribute("aria-label", n); }, (v) => cambiarFondo({ color: v }));
    otroColor("dib-fondos", "Otro color de fondo", (v) => { dib.fondoLibre = v; cambiarFondo({ color: v }); });
    grupo("dib-papeles", PAPELES, (b, [, n]) => (b.textContent = n), (v) => cambiarFondo({ papel: v }));
    $("dib-foto-poner").insertAdjacentHTML("afterbegin", ICONOS.foto);
    $("dib-foto-in").addEventListener("change", async (e) => {
      const f = e.target.files[0]; e.target.value = ""; if (!f) return;
      try { cambiarFondo({ foto: await recortarFoto(f) }); } catch (err) { avisar("No se pudo abrir esa foto 😕"); }
    });
    $("dib-foto-quitar").addEventListener("click", () => cambiarFondo({ foto: null }));
    // el deslizador del grosor va más fino en los tamaños chicos
    $("dib-grosor").addEventListener("input", (e) => {
      const t = TAMANOS[dib.herr]; if (!t) return;
      dib.tam[dib.herr] = Math.round(t[0] + (t[1] - t[0]) * (e.target.value / 100) ** 2); pintarMuestra();
    });
    $("dib-opacidad").addEventListener("input", (e) => { dib.opacidad = +e.target.value; pintarMuestra(); });
    ["dib-grosor", "dib-opacidad"].forEach((id) => $(id).addEventListener("change", recordar));
    $("dibujo-enviar").addEventListener("click", enviar);
    $("dibujo-cancelar").addEventListener("click", () => dlg.close());
    // en el computador: Ctrl+Z deshace, Ctrl+Y (o Ctrl+Mayús+Z) rehace
    dlg.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.target.matches("input[type=text], input:not([type])")) return;
      const k = e.key.toLowerCase();
      if (k === "z") { e.preventDefault(); if (e.shiftKey) rehacer(); else deshacer(); }
      else if (k === "y") { e.preventDefault(); rehacer(); }
    });
    dlg.addEventListener("close", () => { if (actual) terminar(); dedo = null; });
  }
  // las letras se cargan antes de escribir con ellas en el lienzo (si no, saldría otra letra)
  function letrasListas() {
    if (!document.fonts || !document.fonts.load) return;
    document.fonts.load(fuente(dib.letra, 60), "Aa").then(() => { if (actual && actual.tipo === "texto") { sucio = true; pedirCuadro(); } }, () => {});
  }

  function pintarPanel() {
    if (!listo) return;
    const v = dib.verFondo ? "fondo" : dib.herr, ver = (id, si) => ($(id).hidden = !si);
    marcar("dib-herramientas", dib.herr);
    $("dib-fondo").setAttribute("aria-pressed", String(dib.verFondo));
    $("dib-pista").textContent = PISTAS[v] || "";
    ver("dib-pinceles", v === "pincel");
    ver("dib-formas-fila", v === "formas");
    ver("dib-escribir", v === "texto");
    ver("dib-stickers", v === "sticker");
    ver("dib-colores", CON_COLOR.includes(v));
    const grosor = !!TAMANOS[v], opacidad = CON_COLOR.includes(v);
    ver("dib-ajustes", grosor || opacidad); ver("dib-grosor-caja", grosor); ver("dib-opacidad-caja", opacidad);
    $("dib-ajustes").classList.toggle("uno", grosor !== opacidad);
    ["dib-fondos", "dib-papeles", "dib-foto"].forEach((id) => ver(id, v === "fondo"));
    marcar("dib-pinceles", dib.pincel); marcar("dib-formas", dib.forma); marcar("dib-letras", dib.letra); marcar("dib-stickers", dib.sticker);
    marcar("dib-colores", dib.color); marcar("dib-fondos", dib.fondo.color); marcar("dib-papeles", dib.fondo.papel);
    $("dib-relleno").setAttribute("aria-pressed", String(dib.relleno));
    // el círculo de "otro color" muestra el último que se eligió en el selector
    [["dib-colores", dib.libre, dib.color, COLORES], ["dib-fondos", dib.fondoLibre, dib.fondo.color, FONDOS]].forEach(([id, libre, color, lista]) => {
      const c = $(id).querySelector(".dib-libre");
      c.style.setProperty("--libre", libre || "transparent");
      c.classList.toggle("elegido", !lista.some((x) => x[0] === color));
      if (libre) c.querySelector("input").value = libre;
    });
    $("dib-foto-quitar").hidden = !dib.fondo.foto;
    $("dib-foto-poner").lastChild.textContent = dib.fondo.foto ? "Otra foto" : "Poner una foto";
    if (grosor) { const [a, b] = TAMANOS[v]; $("dib-grosor").value = Math.round(100 * Math.sqrt((dib.tam[v] - a) / (b - a))); }
    $("dib-opacidad").value = dib.opacidad;
    pintarMuestra();
    if (v === "texto") letrasListas();
  }
  // Al lado del grosor, cómo se va a ver (a la escala del lienzo en la pantalla)
  function pintarMuestra() {
    const m = $("dib-muestra"), h = dib.herr, t = dib.tam[h], k = pantalla.getBoundingClientRect().width / L || 0.3;
    m.replaceChildren(); m.removeAttribute("style");
    if (!t) return;
    if (h === "sticker" || h === "texto") {
      m.textContent = h === "sticker" ? dib.sticker : "Aa";
      m.style.font = h === "texto" ? fuente(dib.letra, Math.min(30, Math.max(10, t * k))) : `${Math.min(30, Math.max(10, t * k * 0.8))}px ${EMOJI}`;
      if (h === "texto") Object.assign(m.style, { color: dib.color, opacity: dib.opacidad / 100 });
      return;
    }
    const i = document.createElement("i"), s = Math.min(32, Math.max(3, t * k));
    i.style.width = i.style.height = `${s}px`;
    i.style.background = h === "borrador" ? "var(--muted)" : dib.color;
    i.style.opacity = h === "borrador" ? 0.5 : (dib.opacidad / 100) * (h === "pincel" && dib.pincel === "marcador" ? 0.5 : 1);
    if (dib.color === "#ffffff" && h !== "borrador") i.style.boxShadow = "0 0 0 1px var(--line)";
    m.append(i);
  }
  function pintarBarra() {
    $("dib-deshacer").disabled = !hechos.length;
    $("dib-rehacer").disabled = !deshechos.length;
  }
  // Un aviso como los de la app, pero dentro de la ventana (el de la app queda detrás de ella)
  function avisar(txt) {
    const a = $("dib-aviso"); a.textContent = txt; a.classList.add("show");
    clearTimeout(avisoTimer); avisoTimer = setTimeout(() => a.classList.remove("show"), 4000);
  }

  // ---------- el dedo sobre el lienzo ----------
  const punto = (e) => {
    const r = pantalla.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * L) / r.width, y: ((e.clientY - r.top) * L) / r.height };
  };
  function escuchar() {
    pantalla.addEventListener("pointerdown", (e) => {
      if (dedo !== null || actual || (e.pointerType === "mouse" && e.button !== 0)) return;
      e.preventDefault();
      // si el teclado estaba abierto (el texto de abajo), se cierra para dibujar
      const foco = document.activeElement; if (foco && foco !== document.body && foco.blur) foco.blur();
      dedo = e.pointerId;
      try { pantalla.setPointerCapture(e.pointerId); } catch (err) {}
      empezar(punto(e), e.pointerType !== "mouse");
    });
    pantalla.addEventListener("pointermove", (e) => {
      if (e.pointerId !== dedo || !actual) return;
      // en Android llegan varios puntos juntos por cuadro: con todos, la línea sale más suave
      const juntos = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      (juntos.length ? juntos : [e]).forEach((ev) => seguir(punto(ev)));
    });
    // se suelta donde sea (si el dedo se sale del lienzo, igual termina el trazo)
    const soltar = (e) => { if (e.pointerId !== dedo) return; dedo = null; terminar(); };
    ["pointerup", "pointercancel"].forEach((t) => window.addEventListener(t, soltar));
    pantalla.addEventListener("lostpointercapture", soltar);
    // en el iPhone, además del touch-action del CSS: el dedo en el lienzo nunca mueve la ventana ni hace zoom
    ["touchstart", "touchmove"].forEach((t) => pantalla.addEventListener(t, (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false }));
  }
  function empezar(p, conDedo) {
    const h = dib.herr, color = dib.color, opacidad = dib.opacidad / 100;
    if (h === "balde") {
      const paso = { tipo: "balde", x: p.x, y: p.y, color, opacidad };
      if (rellenar(cctx, paso)) { nuevoPaso(paso); pedirCuadro(); }
      return;
    }
    vctx.clearRect(0, 0, L, L);
    if (h === "pincel" || h === "borrador") {
      const borra = h === "borrador";
      actual = { tipo: "trazo", pincel: borra ? "borrador" : dib.pincel, color: borra ? "#000000" : color, grosor: dib.tam[h], opacidad: borra ? 1 : opacidad, puntos: [p], fijo: 0, cortes: [] };
      fijoX.clearRect(0, 0, L, L);
      if (actual.pincel === "spray") {
        const a = actual; a.semilla = (Math.random() * 2147483647) | 0; a.azar = azar(a.semilla); a.hecho = 0;
        // con el dedo quieto, el spray sigue soltando pintura
        rocio = setInterval(() => { if (actual === a && a.puntos.length < 6000) { a.puntos.push(a.puntos[a.puntos.length - 1]); sucio = true; pedirCuadro(); } }, 50);
      }
    } else if (h === "formas") actual = { tipo: "forma", forma: dib.forma, relleno: dib.relleno, color, grosor: dib.tam.formas, opacidad, a: p, b: p };
    else {
      const texto = $("dib-texto-in").value.trim();
      if (h === "texto" && !texto) { avisar("Escribe algo primero ✍️"); $("dib-texto-in").focus(); return; }
      const tam = dib.tam[h];
      // con el dedo, el sticker o el texto va un poco más arriba: así se ve dónde queda
      actual = h === "sticker" ? { tipo: "sticker", emoji: dib.sticker, tam } : { tipo: "texto", texto, letra: dib.letra, color, tam, opacidad };
      actual.alza = conDedo ? tam * 0.6 : 0;
      ubicar(actual, p);
    }
    sucio = true; pedirCuadro();
  }
  const ubicar = (a, p) => { a.x = Math.max(0, Math.min(L, p.x)); a.y = Math.max(0, Math.min(L, p.y - a.alza)); };
  function seguir(p) {
    const a = actual;
    if (a.tipo === "trazo") {
      const u = a.puntos[a.puntos.length - 1];
      if (Math.hypot(p.x - u.x, p.y - u.y) < 2) return; // pegadito al anterior: no suma nada
      a.puntos.push(p);
    } else if (a.tipo === "forma") a.b = p;
    else ubicar(a, p);
    sucio = true; pedirCuadro();
  }
  // Lo que se está dibujando va en el lienzo de paso (vivo), a opacidad plena; se pega en la capa al soltar
  function vivo(a) {
    if (a.tipo === "trazo" && a.pincel === "spray") { rociar(vctx, a, a.hecho, a.azar); a.hecho = a.puntos.length; return; }
    vctx.clearRect(0, 0, L, L);
    if (a.tipo !== "trazo" || a.pincel === "neon") { pintar(vctx, a); return; }
    // en un trazo largo, lo de atrás ya no cambia: queda pintado aparte y en cada cuadro solo se dibuja lo último
    // (el neón no: su brillo se notaría en las uniones)
    const p = a.puntos;
    if (p.length - 2 - a.fijo > 60) {
      trazar(fijoX, a, a.fijo, p.length - 2, false);
      a.fijo = p.length - 2; a.cortes.push(a.fijo);
    }
    vctx.drawImage(fijoC, 0, 0);
    trazar(vctx, a, a.fijo);
  }
  function trazar(c, h, desde, hasta, fin) {
    c.save(); c.lineCap = c.lineJoin = "round"; c.strokeStyle = h.color; c.lineWidth = h.grosor;
    camino(c, h.puntos, desde, hasta, fin); c.stroke(); c.restore();
  }
  function terminar() {
    const a = actual; if (!a) return;
    clearInterval(rocio); actual = null;
    if (sucio) { sucio = false; vivo(a); }
    if (a.tipo === "forma" && Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y) < 16) {
      if (a.forma === "linea") { pedirCuadro(); return; } // un toque no hace una línea
      const { x, y } = a.a; a.a = { x: x - 120, y: y - 120 }; a.b = { x: x + 120, y: y + 120 };
      vctx.clearRect(0, 0, L, L); pintar(vctx, a);
    }
    delete a.azar; delete a.hecho; delete a.alza; delete a.fijo;
    pegar(cctx, a); nuevoPaso(a); pedirCuadro();
  }

  // ---------- pintar ----------
  // La pantalla: el fondo, lo dibujado y encima lo que se está dibujando (una vez por cuadro)
  const pedirCuadro = () => { if (!cuadro) cuadro = requestAnimationFrame(componer); };
  function componer() {
    cuadro = 0;
    const a = actual;
    if (a && sucio) { sucio = false; vivo(a); }
    ctx.drawImage(fondoC, 0, 0);
    if (a && a.pincel === "borrador") {
      // el borrador se ve mientras borra: la capa sin lo que va borrando
      pctx.clearRect(0, 0, L, L); pctx.drawImage(capaC, 0, 0);
      pctx.globalCompositeOperation = "destination-out"; pctx.drawImage(vivoC, 0, 0); pctx.globalCompositeOperation = "source-over";
      ctx.drawImage(pasoC, 0, 0);
    } else {
      ctx.drawImage(capaC, 0, 0);
      if (a) pegar(ctx, a);
    }
  }
  // Pega en c lo que hay en el lienzo de paso, con su opacidad (el marcador es transparente); el borrador, saca
  function pegar(c, h) {
    c.save();
    c.globalAlpha = h.opacidad == null ? 1 : h.opacidad * (h.pincel === "marcador" ? 0.5 : 1);
    if (h.pincel === "borrador") c.globalCompositeOperation = "destination-out";
    c.drawImage(vivoC, 0, 0);
    c.restore();
  }
  // Un paso ya hecho, otra vez sobre la capa (al deshacer se vuelven a pintar los que quedan)
  function aplicar(c, h) {
    if (h.tipo === "limpiar") c.clearRect(0, 0, L, L);
    else if (h.tipo === "balde") rellenar(c, h);
    else if (h.tipo !== "fondo") { vctx.clearRect(0, 0, L, L); pintar(vctx, h); pegar(c, h); }
  }
  // Pinta un paso en c, a opacidad plena
  function pintar(c, h) {
    c.save();
    c.lineCap = c.lineJoin = "round"; c.strokeStyle = c.fillStyle = h.color || "#000000";
    if (h.tipo === "trazo") {
      if (h.pincel === "spray") rociar(c, h, 0, azar(h.semilla));
      else if (h.pincel === "neon") {
        // neón: el color brilla alrededor y al centro queda una línea casi blanca
        camino(c, h.puntos); c.lineWidth = h.grosor;
        c.shadowColor = h.color; c.shadowBlur = h.grosor * 1.2; c.stroke(); c.stroke();
        c.shadowBlur = 0; c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = Math.max(2, h.grosor * 0.3); c.stroke();
      } else {
        // de a pedazos, cortado donde se cortó mientras se dibujaba: sale igual, píxel por píxel
        let desde = 0;
        (h.cortes || []).forEach((k) => { trazar(c, h, desde, k, false); desde = k; });
        trazar(c, h, desde);
      }
    } else if (h.tipo === "forma") forma(c, h);
    else estampar(c, h);
    c.restore();
  }
  // El camino suavizado por los puntos del dedo: curvas que van de un punto medio al siguiente. Se puede pedir desde
  // la curva `desde` hasta `hasta` y sin el último tramo recto (`fin`): así se arma un trazo largo de a pedazos.
  function camino(c, p, desde = 0, hasta = p.length - 2, fin = true) {
    const medio = (i) => [(p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2];
    const [x0, y0] = desde ? medio(desde) : [p[0].x, p[0].y];
    c.beginPath(); c.moveTo(x0, y0);
    if (p.length === 1) { c.lineTo(x0 + 0.1, y0); return; }
    for (let i = desde + 1; i <= hasta; i++) c.quadraticCurveTo(p[i].x, p[i].y, ...medio(i));
    if (fin) c.lineTo(p[p.length - 1].x, p[p.length - 1].y);
  }
  // Spray: puntitos al azar alrededor del dedo, también entre un punto y el siguiente si se movió rápido
  function rociar(c, h, desde, sig) {
    const p = h.puntos, R = h.grosor * 0.9, r = Math.max(2, h.grosor / 18), n = Math.round(5 + R / 4);
    c.fillStyle = h.color; c.beginPath();
    for (let i = desde; i < p.length; i++) {
      const a = p[i ? i - 1 : 0], b = p[i], pasos = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (R * 0.4)));
      for (let s = 1; s <= pasos; s++) {
        const cx = a.x + ((b.x - a.x) * s) / pasos, cy = a.y + ((b.y - a.y) * s) / pasos;
        for (let k = 0; k < n; k++) {
          const ang = sig() * 2 * Math.PI, d = Math.sqrt(sig()) * R, x = cx + Math.cos(ang) * d, y = cy + Math.sin(ang) * d;
          c.moveTo(x + r, y); c.arc(x, y, r, 0, 2 * Math.PI);
        }
      }
    }
    c.fill();
  }
  // Línea, cuadrado, círculo, corazón y estrella, de una esquina a la otra (los tres últimos, parejitos)
  function forma(c, h) {
    const { a, b } = h;
    c.lineWidth = h.grosor; c.beginPath();
    if (h.forma === "linea") { c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); return; }
    let w = b.x - a.x, t = b.y - a.y;
    if (h.forma !== "rect") { const s = Math.max(Math.abs(w), Math.abs(t)); w = (w < 0 ? -1 : 1) * s; t = (t < 0 ? -1 : 1) * s; }
    const x = Math.min(a.x, a.x + w), y = Math.min(a.y, a.y + t), W = Math.abs(w), H = Math.abs(t);
    if (h.forma === "rect") c.rect(x, y, W, H);
    else if (h.forma === "circulo") c.ellipse(x + W / 2, y + H / 2, W / 2, H / 2, 0, 0, 2 * Math.PI);
    else if (h.forma === "corazon") corazon(c, x, y, W, H);
    else estrella(c, x, y, W, H);
    c.closePath();
    if (h.relleno) c.fill(); else c.stroke();
  }
  function corazon(c, x, y, w, h) {
    const X = (u) => x + u * w, Y = (v) => y + v * h;
    c.moveTo(X(0.5), Y(0.97));
    c.bezierCurveTo(X(0.18), Y(0.75), X(0), Y(0.55), X(0), Y(0.31));
    c.bezierCurveTo(X(0), Y(0.12), X(0.14), Y(0.02), X(0.28), Y(0.02));
    c.bezierCurveTo(X(0.39), Y(0.02), X(0.47), Y(0.08), X(0.5), Y(0.18));
    c.bezierCurveTo(X(0.53), Y(0.08), X(0.61), Y(0.02), X(0.72), Y(0.02));
    c.bezierCurveTo(X(0.86), Y(0.02), X(1), Y(0.12), X(1), Y(0.31));
    c.bezierCurveTo(X(1), Y(0.55), X(0.82), Y(0.75), X(0.5), Y(0.97));
  }
  function estrella(c, x, y, w, h) {
    const R = Math.min(w / 1.902, h / 1.809), cx = x + w / 2, cy = y + (h - 1.809 * R) / 2 + R;
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? R * 0.45 : R, ang = -Math.PI / 2 + (i * Math.PI) / 5;
      c[i ? "lineTo" : "moveTo"](cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
    }
  }
  // Stickers y texto (si el texto no cabe, se achica hasta caber)
  function estampar(c, h) {
    c.textAlign = "center"; c.textBaseline = "middle";
    if (h.tipo === "sticker") { c.font = `${h.tam}px ${EMOJI}`; c.fillText(h.emoji, h.x, h.y); return; }
    let t = h.tam; c.font = fuente(h.letra, t);
    const ancho = c.measureText(h.texto).width;
    if (ancho > L * 0.94) { t = (t * L * 0.94) / ancho; c.font = fuente(h.letra, t); }
    c.fillText(h.texto, h.x, h.y);
  }
  // Balde: pinta la parte que tocaste hasta los bordes de lo dibujado (el fondo no cuenta como borde). Por debajo del
  // borde suave de las líneas también pone el color, para que no quede una rayita clara entre la línea y la pintura.
  // Qué pintar se calcula una sola vez y queda en el paso como tiras de píxeles (fila, desde, hasta): al deshacer y
  // rehacer solo se vuelve a pintar, sin leer el lienzo.
  function rellenar(c, h) {
    if (!h.zona && !zonaDe(h)) return false;
    c.save(); c.fillStyle = h.color; c.globalAlpha = h.opacidad;
    tiras(c, h.zona); c.fill();                                       // la zona: el color nuevo encima de lo que había
    c.globalCompositeOperation = "destination-over"; tiras(c, h.borde); c.fill(); // el borde: por debajo de la línea
    c.restore();
    return true;
  }
  const tiras = (c, t) => { c.beginPath(); for (let i = 0; i < t.length; i += 3) c.rect(t[i + 1], t[i], t[i + 2] - t[i + 1], 1); };
  function zonaDe(h) {
    const x0 = Math.max(0, Math.min(L - 1, Math.floor(h.x))), y0 = Math.max(0, Math.min(L - 1, Math.floor(h.y)));
    const d = leer(), i0 = (y0 * L + x0) * 4, N = L * L, [nr, ng, nb] = rgb(h.color);
    const sr = d[i0], sg = d[i0 + 1], sb = d[i0 + 2], sa = d[i0 + 3];
    if (h.opacidad >= 1 && sa === 255 && sr === nr && sg === ng && sb === nb) return false; // ya es de ese color
    // qué píxeles se parecen al que tocaste (con poco color, el color casi no importa)
    const TOL = 56, igual = new Uint8Array(N);
    for (let j = 0, i = 0; j < N; j++, i += 4) {
      const a = d[i + 3];
      if (Math.abs(a - sa) > TOL) continue;
      const m = Math.min(a, sa) / 255;
      igual[j] = Math.max(Math.abs(d[i] - sr), Math.abs(d[i + 1] - sg), Math.abs(d[i + 2] - sb)) * m <= TOL ? 1 : 0;
    }
    // la zona: los parecidos que se tocan con el que tocaste, fila por fila
    const zona = new Uint8Array(N), pila = [x0, y0], tz = [];
    let x1 = x0, x2 = x0, y1 = y0, y2 = y0;
    while (pila.length) {
      const y = pila.pop(); let x = pila.pop(), j = y * L + x;
      if (zona[j] || !igual[j]) continue;
      while (x > 0 && !zona[j - 1] && igual[j - 1]) { x--; j--; }
      const desde = x;
      let arriba = false, abajo = false;
      for (; x < L && !zona[j] && igual[j]; x++, j++) {
        zona[j] = 1;
        if (y > 0) { const s = !zona[j - L] && igual[j - L]; if (s && !arriba) pila.push(x, y - 1); arriba = s; }
        if (y < L - 1) { const s = !zona[j + L] && igual[j + L]; if (s && !abajo) pila.push(x, y + 1); abajo = s; }
      }
      tz.push(y, desde, x);
      if (desde < x1) x1 = desde;
      if (x - 1 > x2) x2 = x - 1;
      if (y < y1) y1 = y;
      if (y > y2) y2 = y;
    }
    // el borde: lo que tiene algo de color a 2 píxeles o menos de la zona (primero se mira a lo ancho, después a lo alto)
    const R = 2, bx1 = Math.max(0, x1 - R), bx2 = Math.min(L - 1, x2 + R), ancho = new Uint8Array(N), tb = [];
    for (let y = y1; y <= y2; y++) {
      let n = 0; const f = y * L;
      for (let x = bx1; x <= Math.min(L - 1, bx1 + R - 1); x++) n += zona[f + x];
      for (let x = bx1; x <= bx2; x++) {
        if (x + R < L) n += zona[f + x + R];
        if (x - R - 1 >= 0) n -= zona[f + x - R - 1];
        ancho[f + x] = n ? 1 : 0;
      }
    }
    for (let y = Math.max(0, y1 - R); y <= Math.min(L - 1, y2 + R); y++) {
      let desde = -1;
      for (let x = bx1; x <= bx2 + 1; x++) {
        const j = y * L + x;
        let si = x <= bx2 && !zona[j] && d[j * 4 + 3] > 0;
        if (si) { si = false; for (let k = Math.max(y1, y - R); k <= Math.min(y2, y + R) && !si; k++) si = !!ancho[k * L + x]; }
        if (si && desde < 0) desde = x;
        else if (!si && desde >= 0) { tb.push(y, desde, x); desde = -1; }
      }
    }
    h.zona = Uint16Array.from(tz); h.borde = Uint16Array.from(tb);
    return true;
  }
  // Para leer los píxeles, la capa se copia a un lienzo aparte: la capa sigue en la tarjeta gráfica y dibujar no se pone lento
  let lector = null;
  function leer() {
    if (!lector) { const c = document.createElement("canvas"); c.width = c.height = L; lector = c.getContext("2d", { willReadFrequently: true }); }
    lector.clearRect(0, 0, L, L); lector.drawImage(capaC, 0, 0);
    return lector.getImageData(0, 0, L, L).data;
  }

  // ---------- el fondo ----------
  function pintarFondo() {
    const f = dib.fondo;
    fctx.fillStyle = f.color; fctx.fillRect(0, 0, L, L);
    if (f.foto) fctx.drawImage(f.foto, 0, 0);
    papel(fctx, f.papel, f.foto ? "#ffffff" : f.color);
  }
  // El papel: líneas suaves que se notan sobre cualquier color (claras en los fondos oscuros)
  function papel(c, tipo, color) {
    if (tipo === "liso") return;
    const oscuro = luz(color) < 0.45, P = 60;
    c.save();
    c.strokeStyle = c.fillStyle = oscuro ? "rgba(255,255,255,.17)" : "rgba(58,34,48,.14)"; c.lineWidth = 2.5;
    c.beginPath();
    if (tipo === "cuadros") for (let i = P; i < L; i += P) { c.moveTo(i, 0); c.lineTo(i, L); c.moveTo(0, i); c.lineTo(L, i); }
    else if (tipo === "rayas") for (let y = 150; y < L; y += 72) { c.moveTo(0, y); c.lineTo(L, y); }
    else if (tipo === "puntos") for (let y = P; y < L; y += P) for (let x = P; x < L; x += P) { c.moveTo(x + 4.5, y); c.arc(x, y, 4.5, 0, 2 * Math.PI); }
    else {
      c.fillStyle = oscuro ? "rgba(255,154,184,.22)" : "rgba(224,69,123,.15)";
      for (let f = 0, y = 40; y < L; y += 120, f++) for (let x = f % 2 ? 100 : 40; x < L; x += 120) corazon(c, x, y, 40, 36);
    }
    if (tipo === "cuadros" || tipo === "rayas") c.stroke(); else c.fill();
    // el cuaderno: con su margen rosado
    if (tipo === "rayas") { c.strokeStyle = oscuro ? "rgba(255,154,184,.4)" : "rgba(224,69,123,.35)"; c.beginPath(); c.moveTo(126, 0); c.lineTo(126, L); c.stroke(); }
    c.restore();
  }
  // Cada cambio de fondo es un paso que se puede deshacer; varios toques seguidos en el fondo cuentan como uno
  function cambiarFondo(cambios) {
    const antes = dib.fondo, despues = Object.freeze({ ...antes, ...cambios });
    if (antes.color === despues.color && antes.papel === despues.papel && antes.foto === despues.foto) return;
    const u = hechos[hechos.length - 1];
    if (u && u.tipo === "fondo" && !deshechos.length) u.despues = despues;
    else nuevoPaso({ tipo: "fondo", antes, despues });
    dib.fondo = despues; pintarFondo(); pedirCuadro(); pintarPanel(); pintarBarra();
  }
  // La foto de fondo, recortada al cuadrado del lienzo desde el centro
  function recortarFoto(file) {
    return new Promise((ok, mal) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const c = document.createElement("canvas"); c.width = c.height = L;
        const s = Math.max(L / img.naturalWidth, L / img.naturalHeight), w = img.naturalWidth * s, h = img.naturalHeight * s;
        c.getContext("2d").drawImage(img, (L - w) / 2, (L - h) / 2, w, h);
        URL.revokeObjectURL(url); ok(c);
      };
      img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("foto")); };
      img.src = url;
    });
  }

  // ---------- deshacer y rehacer ----------
  function nuevoPaso(h) {
    hechos.push(h); deshechos = [];
    // lo más viejo ya no se puede deshacer: queda pintado en la base
    if (hechos.length > PASOS) aplicar(bctx, hechos.shift());
    pintarBarra();
  }
  function rehacerCapa() {
    cctx.clearRect(0, 0, L, L); cctx.drawImage(baseC, 0, 0);
    hechos.forEach((h) => aplicar(cctx, h));
  }
  function deshacer() {
    if (!hechos.length || actual) return;
    const h = hechos.pop(); deshechos.push(h);
    if (h.tipo === "fondo") { dib.fondo = h.antes; pintarFondo(); pintarPanel(); } else rehacerCapa();
    pedirCuadro(); pintarBarra();
  }
  function rehacer() {
    if (!deshechos.length || actual) return;
    const h = deshechos.pop(); hechos.push(h);
    if (h.tipo === "fondo") { dib.fondo = h.despues; pintarFondo(); pintarPanel(); } else aplicar(cctx, h);
    pedirCuadro(); pintarBarra();
  }
  const capaVacia = () => { const d = leer(); for (let i = 3; i < d.length; i += 4) if (d[i]) return false; return true; };
  const vacio = () => dib.fondo.color === FONDO.color && dib.fondo.papel === FONDO.papel && !dib.fondo.foto && capaVacia();
  // Borrar todo también se puede deshacer; el fondo se queda
  function limpiar() {
    if (actual || capaVacia() || !confirm("¿Borrar todo lo dibujado? (el fondo se queda)")) return;
    const h = { tipo: "limpiar" }; aplicar(cctx, h); nuevoPaso(h); pedirCuadro();
  }

  // ---------- enviar y guardar ----------
  // La imagen tal cual se ve: el fondo y lo dibujado encima
  function aplanar() {
    const c = document.createElement("canvas"); c.width = c.height = L;
    const x = c.getContext("2d"); x.drawImage(fondoC, 0, 0); x.drawImage(capaC, 0, 0);
    return c;
  }
  async function enviar() {
    const X = window.nosotros;
    if (vacio()) { avisar("Dibuja algo primero 😊"); return; }
    const b = $("dibujo-enviar"); b.disabled = true; b.textContent = "Enviando…";
    let ruta = null;
    try { ruta = await X.subirFoto(await X.aImagen(aplanar(), 0.92), "dibujo"); } catch (e) {}
    const texto = $("dibujo-texto").value.trim() || "✏️ Te hice un dibujo";
    const { error } = ruta ? await X.sb.from("momentos").insert({ pareja_id: X.pareja.id, de_usuario: X.user.id, ruta, texto }) : { error: true };
    b.disabled = false; b.textContent = "Enviar dibujo";
    if (error) { avisar("No se pudo enviar. Revisa tu conexión e intenta de nuevo"); return; }
    dlg.close(); X.lluvia("✏️", 8); X.toast(`Dibujo enviado a ${X.otro.nombre} ✏️`); X.cargarMomentos();
    // el próximo dibujo empieza en blanco
    hechos = []; deshechos = []; dib.fondo = FONDO; $("dibujo-texto").value = "";
    bctx.clearRect(0, 0, L, L); cctx.clearRect(0, 0, L, L); pintarFondo(); componer(); pintarBarra();
  }
  // En el iPhone se abre la hoja de compartir, que trae «Guardar imagen» (va a Fotos); en Android se descarga
  // y aparece en la galería. La imagen se arma sin esperas para no perder el toque (si no, el iPhone no comparte).
  function guardar() {
    if (vacio()) { avisar("Dibuja algo primero 😊"); return; }
    const foto = !!dib.fondo.foto, tipo = foto ? "image/jpeg" : "image/png";
    const datos = aplanar().toDataURL(tipo, 0.92), bin = atob(datos.slice(datos.indexOf(",") + 1)), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const d = new Date(), dos = (n) => String(n).padStart(2, "0");
    const nombre = `nosotros-dibujo-${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}.${foto ? "jpg" : "png"}`;
    const blob = new Blob([bytes], { type: tipo });
    if (esIOS && navigator.canShare) {
      const archivo = new File([blob], nombre, { type: tipo });
      if (navigator.canShare({ files: [archivo] })) {
        navigator.share({ files: [archivo] }).then(() => avisar("¡Listo! 💾"), (e) => { if (!e || e.name !== "AbortError") descargar(blob, nombre); });
        return;
      }
    }
    descargar(blob, nombre);
  }
  function descargar(blob, nombre) {
    // el enlace va dentro de la ventana: lo de afuera no se puede tocar mientras está abierta
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre; a.hidden = true;
    dlg.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    avisar("Guardado en las descargas del teléfono 📥");
  }
})();
