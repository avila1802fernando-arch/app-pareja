// Memoria de nosotros 🃏
// Cuatro rondas contra el reloj para encontrar las parejas de lo que más quieren: el girasol, las cartas,
// el vuelo, la misma luna… Al empezar cada ronda hay un momento para memorizar. Las parejas seguidas valen
// más, el tiempo que sobra suma y una ronda sin errores regala 300 puntos. El dorso lleva sus iniciales.
(() => {
  "use strict";
  if (!window.NosotrosJuegos) return;
  // 4 rondas desde el 2026-10-25 (antes 3): la última, de 24 cartas. Igual en las dos apps (el puntaje se compara).
  const RONDAS = [{ cols: 3, filas: 4, seg: 45, ver: 1.6 }, { cols: 4, filas: 4, seg: 60, ver: 2.1 }, { cols: 4, filas: 5, seg: 75, ver: 2.6 }, { cols: 4, filas: 6, seg: 90, ver: 3.1 }];
  // [emoji, nombre en la carta, lo que se dice al encontrar la pareja]
  const CARTAS = [
    ["🌻", "Nuestro girasol", "Crece un poquito cada día, como lo nuestro"],
    ["💌", "Una carta", "Escrita con calma, leída mil veces"],
    ["✈️", "El vuelo", "Cada día falta menos para ese vuelo"],
    ["🌙", "La misma luna", "La miramos los dos, aunque sea a distinta hora"],
    ["🎶", "Nuestra canción", "Suena y pienso en ti"],
    ["📸", "Un momento", "Guardado para siempre"],
    ["🧸", "Un abrazo", "De esos que duran minutos"],
    ["💋", "Besitos", "De los que cruzan países"],
    ["☕", "Desayuno juntos", "Algún día, en la misma mesa"],
    ["🌅", "Un atardecer", "De la mano y sin apuro"],
    ["🍦", "Helado a medias", "Uno para los dos"],
    ["🎟️", "Un vale", "Canjeable por un abrazo eterno"],
    ["🫙", "El frasco", "Lleno de razones para quererte"],
    ["🌹", "Una rosa", "Para ti, siempre"],
  ];
  const fmt = (n) => Number(n).toLocaleString("es");
  const barajar = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  NosotrosJuegos.registrar({
    id: "memoria",
    nombre: "Memoria de nosotros",
    lema: "Encuentra las parejas de lo que más quieren: cuatro rondas contra el reloj.",
    tono: ["#b794f6", "#ff9ab8", "#7c4dcc"],
    icono: '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="10" height="14" rx="2.2"/><path d="M15 7.2l3.6.6a2 2 0 0 1 1.6 2.3l-1.6 9.2a2 2 0 0 1-2.3 1.6l-4-.7"/><path d="M8 14c-1.5-1-2.4-1.9-2.4-2.9a1.2 1.2 0 0 1 2.4-.4 1.2 1.2 0 0 1 2.4.4c0 1-.9 1.9-2.4 2.9Z"/></svg>',
    unidad: "puntos",
    marca: (n) => `${fmt(n)} pts`,
    hud: [["puntos", "Puntos"], ["ronda", "Ronda"], ["tiempo", "Tiempo"], ["racha", "Racha"]],
    reglas: [["🃏", "encuentra las parejas"], ["🔥", "seguidas valen más"], ["⏱️", "el tiempo que sobra suma"], ["✨", "ronda perfecta: +300"]],
    nota: (api) => `Cada pareja que encuentras es un pedacito de ${api.yo.nombre} y ${api.otro.nombre}.`,
    detalle: "Al empezar cada ronda tienes un momento para memorizar. Un error resta 10 puntos y corta la racha.",
    botonJugar: "Empezar 🃏",
    rango(p, res) {
      const r = res.rondas || 0;
      return { nombre: r >= 4 ? "Memoria enamorada 🧠💞" : r === 3 ? "Corazón atento" : r === 2 ? "Buena memoria, mejor corazón" : r === 1 ? "Calentando la memoria" : "Pensando en otra cosa… 😏" };
    },
    crear,
  });

  function crear(api) {
    const raiz = document.createElement("div"); raiz.className = "mem jv-propio";
    const aviso = document.createElement("p"); aviso.className = "mem-aviso"; aviso.setAttribute("aria-live", "polite");
    const tablero = document.createElement("div"); tablero.className = "mem-tablero";
    raiz.append(aviso, tablero);
    api.campo.prepend(raiz);
    const iniciales = `${(api.yo.nombre || "?").charAt(0).toUpperCase()} ♥ ${(api.otro.nombre || "?").charAt(0).toUpperCase()}`;
    let S = null, raf = 0, ultimo = 0, corriendo = false, pausado = false, esperas = [];
    // las esperas se congelan mientras el juego está en pausa (si no, la ronda siguiente arrancaría tapada)
    const despues = (fn, ms) => { const t = setTimeout(() => (pausado ? despues(fn, 250) : fn()), ms); esperas.push(t); };
    const limpiar = () => { esperas.forEach(clearTimeout); esperas = []; };

    // cartas del tamaño justo para que la ronda quepa en la pantalla
    function medir(R) {
      const r = api.campo.getBoundingClientRect(), gap = 8;
      const ancho = r.width - 24, alto = r.height - 24 - 56;
      const porAncho = (ancho - gap * (R.cols - 1)) / R.cols;
      const porAlto = ((alto - gap * (R.filas - 1)) / R.filas) * 0.8;
      const cw = Math.max(40, Math.min(porAncho, porAlto, 112));
      tablero.style.setProperty("--cols", R.cols);
      tablero.style.setProperty("--cw", cw.toFixed(1) + "px");
      tablero.style.setProperty("--ch", (cw / 0.8).toFixed(1) + "px");
    }
    function crearCarta(c) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "mem-carta";
      b.innerHTML = '<span class="mem-in"><span class="mem-cara mem-dorso"><i></i></span><span class="mem-cara mem-frente"><b></b><small></small></span></span>';
      b.querySelector("i").textContent = iniciales;
      b.querySelector("b").textContent = c[0];
      b.querySelector("small").textContent = c[1];
      b.dataset.par = c[0];
      b.setAttribute("aria-label", "Carta boca abajo");
      b.addEventListener("click", () => voltear(b, c));
      tablero.append(b);
      return b;
    }
    // antes de jugar, el tablero se ve boca abajo
    function vistaPrevia() {
      tablero.innerHTML = ""; medir(RONDAS[0]);
      CARTAS.slice(0, 12).forEach((c) => { const b = crearCarta(c); b.tabIndex = -1; });
      aviso.textContent = "";
    }

    function empezarRonda(i) {
      const R = RONDAS[i];
      Object.assign(S, { ronda: i, tiempo: R.seg, erroresRonda: 0, parejasRonda: 0, abiertas: [], bloqueado: true, fase: "ver" });
      const elegidas = barajar([...CARTAS]).slice(0, (R.cols * R.filas) / 2);
      tablero.innerHTML = ""; medir(R);
      S.els = barajar([...elegidas, ...elegidas]).map(crearCarta);
      S.els.forEach((b) => b.classList.add("abierta"));
      aviso.textContent = `Ronda ${i + 1} · ¡Memoriza! 👀`;
      api.tono(523, 0.1, "triangle", 0.05); api.tono(659, 0.14, "triangle", 0.05, 0, 0.1);
      hud();
      despues(() => {
        if (!S || S.ronda !== i || !corriendo) return;
        S.els.forEach((b) => b.classList.remove("abierta"));
        S.fase = "juego"; S.bloqueado = false;
        aviso.textContent = "¡Ahora encuentra las parejas!";
      }, R.ver * 1000);
    }
    function mas(b, txt) {
      const r = b.getBoundingClientRect(), base = raiz.getBoundingClientRect();
      const s = document.createElement("span"); s.className = "mem-mas"; s.textContent = txt;
      s.style.left = r.left - base.left + r.width / 2 + "px"; s.style.top = r.top - base.top + r.height / 2 + "px";
      raiz.append(s); setTimeout(() => s.remove(), 900);
    }
    function voltear(b, c) {
      if (!corriendo || pausado || !S || S.fase !== "juego" || S.bloqueado) return;
      if (b.classList.contains("abierta") || b.classList.contains("hecha")) return;
      b.classList.add("abierta"); b.setAttribute("aria-label", c[1]);
      api.tono(620, 0.06, "sine", 0.035);
      S.abiertas.push(b);
      if (S.abiertas.length < 2) return;
      const [a, d] = S.abiertas; S.abiertas = [];
      if (a.dataset.par === d.dataset.par) {
        S.racha++; S.mejorRacha = Math.max(S.mejorRacha, S.racha);
        const pts = 100 + 50 * Math.min(S.racha - 1, 9); // hasta 550 por pareja con una racha larga
        S.puntos += pts; S.parejas++; S.parejasRonda++;
        [a, d].forEach((x) => { x.classList.remove("abierta"); x.classList.add("hecha"); x.setAttribute("aria-label", `${c[1]}: pareja encontrada`); });
        aviso.textContent = `${c[0]} ${c[2]}`;
        mas(d, `+${pts}`);
        const base = 520 + Math.min(S.racha, 8) * 60;
        api.tono(base, 0.09, "triangle", 0.05); api.tono(base * 1.5, 0.14, "triangle", 0.05, 0, 0.08);
        api.vibrar(20);
        if (S.parejasRonda === S.els.length / 2) finRonda();
      } else {
        S.racha = 0; S.errores++; S.erroresRonda++;
        S.puntos = Math.max(0, S.puntos - 10);
        S.bloqueado = true;
        [a, d].forEach((x) => x.classList.add("mal"));
        api.tono(220, 0.12, "triangle", 0.04);
        despues(() => {
          [a, d].forEach((x) => { x.classList.remove("abierta", "mal"); x.setAttribute("aria-label", "Carta boca abajo"); });
          if (S) S.bloqueado = false;
        }, 750);
      }
      hud();
    }
    function finRonda() {
      S.fase = "entre"; S.bloqueado = true; S.rondas++;
      const perfecta = S.erroresRonda === 0, bono = Math.ceil(S.tiempo) * 15 + (perfecta ? 300 : 0);
      S.puntos += bono;
      aviso.textContent = perfecta ? `✨ ¡Ronda perfecta! +${fmt(bono)}` : `¡Ronda ${S.ronda + 1} lista! +${fmt(bono)} por el tiempo`;
      [523, 659, 784].forEach((f, i) => api.tono(f, 0.14, "triangle", 0.05, 0, i * 0.12));
      if (perfecta) api.lluvia("✨", 8);
      hud();
      if (S.ronda + 1 >= RONDAS.length) {
        S.puntos += 500; hud();
        despues(() => { aviso.textContent = "🧠💞 ¡Memoria enamorada! +500"; api.lluvia("💞", 14); }, 900);
        despues(() => fin(false), 2200);
      } else {
        despues(() => empezarRonda(S.ronda + 1), 1600);
      }
    }
    function fin(porTiempo) {
      if (!corriendo) return;
      corriendo = false; cancelAnimationFrame(raf); limpiar();
      if (porTiempo) { aviso.textContent = "⏱️ ¡Se acabó el tiempo!"; api.tono(300, 0.3, "sawtooth", 0.04, 150); }
      api.terminar({
        puntos: S.puntos,
        rondas: S.rondas,
        prefijo: porTiempo ? `Se acabó el tiempo en la ronda ${S.ronda + 1}.` : "",
        stats: [[S.parejas, "parejas"], [S.errores, "errores"], [`${S.rondas}/${RONDAS.length}`, "rondas"]],
        detalle: { rondas: S.rondas, errores: S.errores, racha: S.mejorRacha },
      });
    }
    function hud() {
      api.hud("puntos", fmt(S.puntos));
      api.hud("ronda", `${S.ronda + 1}/${RONDAS.length}`);
      api.hud("tiempo", String(Math.ceil(Math.max(0, S.tiempo))), S.tiempo < 10 && S.fase === "juego");
      api.hud("racha", S.racha >= 2 ? `🔥 ${S.racha}` : "—", S.racha >= 3);
    }
    function bucle(ts) {
      if (!corriendo) return;
      const dt = Math.min((ts - ultimo) / 1000, 0.1); ultimo = ts;
      raf = requestAnimationFrame(bucle);
      if (pausado || S.fase !== "juego") return;
      S.tiempo -= dt;
      if (S.tiempo <= 0) { S.tiempo = 0; hud(); fin(true); return; }
      hud();
    }

    vistaPrevia();
    return {
      iniciar() {
        limpiar(); cancelAnimationFrame(raf);
        S = { ronda: 0, puntos: 0, racha: 0, mejorRacha: 0, errores: 0, parejas: 0, rondas: 0, tiempo: RONDAS[0].seg, els: [] };
        corriendo = true; pausado = false;
        empezarRonda(0);
        ultimo = performance.now(); raf = requestAnimationFrame(bucle);
      },
      pausar() { pausado = true; },
      reanudar() { pausado = false; ultimo = performance.now(); },
      detener() { corriendo = false; cancelAnimationFrame(raf); limpiar(); },
      ajustar() { medir(RONDAS[S ? S.ronda : 0]); },
    };
  }
})();
