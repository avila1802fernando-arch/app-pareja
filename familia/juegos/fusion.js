// Fusión de frutas 🍉 (como el 2048)
// Se desliza el dedo y todo el tablero se mueve hacia ese lado; dos frutas iguales que chocan se juntan en la
// siguiente: de una cereza a una frutilla, a unas uvas… hasta la sandía 🍉 (y más allá). Cada fusión suma su
// valor y el juego termina cuando ya no quedan movimientos. Mismas reglas y puntaje que el 2048 de la otra app.
(() => {
  "use strict";
  if (!window.RecreoJuegos) return;
  // nivel → [emoji, nombre]; el valor de un nivel n es 2^n (como en el 2048)
  const FICHAS = [null,
    ["🍒", "Cereza"], ["🍓", "Frutilla"], ["🍇", "Uvas"], ["🍋", "Limón"], ["🍊", "Mandarina"],
    ["🍎", "Manzana"], ["🍐", "Pera"], ["🥭", "Mango"], ["🍍", "Piña"], ["🥥", "Coco"],
    ["🍉", "Sandía"], ["🧺", "Canasta llena"], ["🏆", "Frutería de oro"],
  ];
  const ficha = (v) => FICHAS[Math.min(v, FICHAS.length - 1)];
  const fmt = (n) => Number(n).toLocaleString("es");

  RecreoJuegos.registrar({
    id: "fusion",
    nombre: "Fusión de frutas",
    lema: "Junta frutas iguales hasta llegar a la sandía.",
    tono: ["#FF8A5B", "#FFC53D", "#B4441F"],
    emoji: "🍉",
    arte: '<span class="mini-ficha emo" style="left:10px;top:10px">🍒</span><span class="mini-ficha emo" style="left:44px;top:10px">🍓</span><span class="mini-ficha emo" style="left:10px;top:44px">🍇</span><span class="mini-ficha emo" style="left:44px;top:44px">🍉</span>',
    unidad: "puntos",
    marca: (n) => `${fmt(n)} pts`,
    hud: [["puntos", "Puntos"], ["mejor", "Mejor fruta"], ["jugadas", "Jugadas"]],
    reglas: [["👆", "desliza a cualquier lado"], ["🍒", "iguales se juntan"], ["🍍", "cada fusión suma"], ["🍉", "meta: la sandía"]],
    nota: (api) => `De una cereza a una sandía: ¿hasta dónde llegas, ${api.yo.nombre}?`,
    detalle: "Desliza el dedo (o usa las flechas del teclado): todo se mueve hacia ese lado y dos frutas iguales que chocan se vuelven la siguiente. Termina cuando ya no quedan movimientos. Si necesitas parar, la pausa te deja guardar tu puntaje.",
    botonJugar: "Empezar 🍒",
    rango(p, res) {
      const n = res.mejor || 1;
      return { nombre: n >= 13 ? "Frutería de oro 🏆" : n >= 12 ? "Canasta llena 🧺" : n >= 11 ? "¡La sandía! 🍉" : n >= 10 ? "Coco 🥥"
        : n >= 9 ? "Piña dulce 🍍" : n >= 8 ? "Mango maduro 🥭" : n >= 7 ? "Pera 🍐" : "Fruta a fruta 🍒" };
    },
    crear,
  });

  function crear(api) {
    const LOGROS = {
      7: "🍐 ¡Una pera!", 8: "🥭 ¡Mango maduro!", 9: "🍍 ¡Piña dulce!", 10: "🥥 ¡Llegó el coco!",
      11: "🍉 ¡LA SANDÍA! ¡Lo lograste!", 12: "🧺 ¡Canasta llena!", 13: "🏆 ¡Frutería de oro!",
    };
    const raiz = document.createElement("div"); raiz.className = "fu jv-propio";
    const aviso = document.createElement("p"); aviso.className = "fu-aviso"; aviso.setAttribute("aria-live", "polite");
    const tablero = document.createElement("div"); tablero.className = "fu-tablero";
    tablero.setAttribute("role", "img");
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const c = document.createElement("div"); c.className = "fu-celda"; c.style.setProperty("--x", x); c.style.setProperty("--y", y); tablero.append(c);
    }
    raiz.append(aviso, tablero);
    api.campo.prepend(raiz);
    let grid = [], S = null, corriendo = false, pausado = false, sigId = 0, inicio = null, finTimer = 0;

    function medir() {
      const r = api.campo.getBoundingClientRect();
      const lado = Math.max(200, Math.min(r.width - 24, r.height - 24 - 64, 460));
      const gap = Math.round(lado * 0.026), t = (lado - gap * 5) / 4;
      tablero.style.setProperty("--lado", lado + "px");
      tablero.style.setProperty("--gap", gap + "px");
      tablero.style.setProperty("--t", t.toFixed(1) + "px");
    }
    function pintar(f) {
      const [e, txt] = ficha(f.v);
      f.el.className = `fu-ficha n${Math.min(f.v, 13)}` + (f.el.classList.contains("une") ? " une" : "");
      f.el.querySelector("b").textContent = e;
      f.el.querySelector("small").textContent = txt;
    }
    function lugar(f) { f.el.style.setProperty("--x", f.x); f.el.style.setProperty("--y", f.y); }
    function crearFicha(v, x, y) {
      const el = document.createElement("div");
      el.innerHTML = '<div class="fu-in"><b></b><small></small></div>';
      const f = { id: ++sigId, v, x, y, el };
      pintar(f); lugar(f); el.classList.add("nace");
      tablero.append(el);
      return f;
    }
    function nueva() {
      const libres = [];
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (!grid[y][x]) libres.push([x, y]);
      if (!libres.length) return;
      const [x, y] = libres[Math.floor(Math.random() * libres.length)];
      grid[y][x] = crearFicha(Math.random() < 0.9 ? 1 : 2, x, y);
    }
    function hayMovimientos() {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const f = grid[y][x];
        if (!f) return true;
        if (x < 3 && grid[y][x + 1] && grid[y][x + 1].v === f.v) return true;
        if (y < 3 && grid[y + 1][x] && grid[y + 1][x].v === f.v) return true;
      }
      return false;
    }
    function describir() {
      const n = [].concat(...grid).filter(Boolean).length;
      tablero.setAttribute("aria-label", `Tablero con ${n} frutas. Mejor fruta: ${ficha(S ? S.mejor : 1)[1]}.`);
    }

    function mover(dx, dy) {
      if (!corriendo || pausado || !S || S.moviendo) return;
      const orden = [0, 1, 2, 3];
      const xs = dx === 1 ? [3, 2, 1, 0] : orden, ys = dy === 1 ? [3, 2, 1, 0] : orden;
      const unidas = new Set(), quitar = [];
      let movio = false;
      ys.forEach((y) => xs.forEach((x) => {
        const f = grid[y][x];
        if (!f) return;
        let nx = x, ny = y;
        for (;;) {
          const tx = nx + dx, ty = ny + dy;
          if (tx < 0 || tx > 3 || ty < 0 || ty > 3) break;
          const o = grid[ty][tx];
          if (!o) { nx = tx; ny = ty; continue; }
          if (o.v === f.v && !unidas.has(o.id)) {
            // se juntan: esta fruta se desliza hasta la otra y desaparece; la otra sube de nivel
            grid[y][x] = null;
            o.v++; unidas.add(o.id);
            f.x = tx; f.y = ty; lugar(f); f.el.style.zIndex = "0";
            quitar.push({ f, o });
            S.puntos += 2 ** o.v; S.fusiones++;
            movio = true;
            return;
          }
          break;
        }
        if (nx !== x || ny !== y) { grid[y][x] = null; grid[ny][nx] = f; f.x = nx; f.y = ny; lugar(f); movio = true; }
      }));
      if (!movio) return;
      S.jugadas++; S.moviendo = true;
      api.tono(300 + Math.random() * 60, 0.05, "sine", 0.02);
      setTimeout(() => {
        quitar.forEach(({ f, o }) => {
          f.el.remove();
          o.el.classList.remove("une", "nace"); pintar(o); void o.el.offsetWidth; o.el.classList.add("une");
          celebrar(o.v);
        });
        if (quitar.length) api.tono(440 + Math.min(...quitar.map((q) => q.o.v)) * 40, 0.08, "triangle", 0.045);
        nueva(); S.moviendo = false; hud(); describir();
        if (!hayMovimientos()) sinMovimientos();
      }, api.pocoMovimiento() ? 0 : 125);
    }
    function celebrar(v) {
      if (v <= S.mejor) return;
      S.mejor = v;
      if (LOGROS[v]) {
        aviso.textContent = LOGROS[v];
        [659, 784, 1046].forEach((f, i) => api.tono(f, 0.14, "triangle", 0.05, 0, i * 0.1));
        api.vibrar(40);
        if (v >= 11) { api.lluvia(ficha(v)[0], 16); api.vibrar([60, 40, 60, 40, 200]); }
      }
    }
    function sinMovimientos() {
      corriendo = false;
      aviso.textContent = "Ya no quedan movimientos";
      api.tono(330, 0.3, "triangle", 0.05); api.tono(262, 0.4, "triangle", 0.05, 0, 0.25);
      finTimer = setTimeout(terminar, 1100);
    }
    function terminar() {
      const [e, txt] = ficha(S.mejor);
      api.terminar({
        puntos: S.puntos,
        mejor: S.mejor,
        prefijo: S.mejor >= 11 ? "¡Llegaste a la sandía! 🍉" : `Tu mejor fruta: ${e} ${txt}.`,
        stats: [[e, "mejor fruta"], [S.fusiones, "fusiones"], [S.jugadas, "jugadas"]],
        detalle: { mejor: S.mejor, fusiones: S.fusiones, jugadas: S.jugadas },
      });
    }
    function hud() {
      api.hud("puntos", fmt(S.puntos));
      api.hud("mejor", `${ficha(S.mejor)[0]} ${2 ** S.mejor}`, S.mejor >= 10);
      api.hud("jugadas", String(S.jugadas));
    }

    // gestos: deslizar en cualquier parte del campo; flechas o WASD en el computador
    function tocar(e) { inicio = { x: e.clientX, y: e.clientY }; }
    function soltar(e) {
      if (!inicio) return;
      const dx = e.clientX - inicio.x, dy = e.clientY - inicio.y;
      inicio = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) mover(dx > 0 ? 1 : -1, 0); else mover(0, dy > 0 ? 1 : -1);
    }
    const TECLAS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] };
    function tecla(e) {
      if (!api.jugando()) return;
      const d = TECLAS[e.key] || TECLAS[e.key.toLowerCase()];
      if (!d) return;
      e.preventDefault(); mover(d[0], d[1]);
    }
    raiz.addEventListener("pointerdown", tocar);
    raiz.addEventListener("pointerup", soltar);
    raiz.addEventListener("pointercancel", () => (inicio = null));
    window.addEventListener("keydown", tecla);

    function reiniciar() {
      tablero.querySelectorAll(".fu-ficha").forEach((e) => e.remove());
      grid = Array.from({ length: 4 }, () => [null, null, null, null]);
    }
    // antes de jugar: el tablero con sus dos primeras frutas
    medir(); reiniciar();
    grid[1][1] = crearFicha(1, 1, 1); grid[2][2] = crearFicha(2, 2, 2);

    return {
      iniciar() {
        medir(); reiniciar();
        S = { puntos: 0, jugadas: 0, fusiones: 0, mejor: 1, moviendo: false };
        nueva(); nueva();
        S.mejor = Math.max(...[].concat(...grid).filter(Boolean).map((f) => f.v));
        corriendo = true; pausado = false;
        aviso.textContent = "Desliza para juntar frutas 🍒";
        hud(); describir();
      },
      pausar() { pausado = true; },
      reanudar() { pausado = false; },
      rendirse() { if (!S) return; corriendo = false; clearTimeout(finTimer); terminar(); },
      // el cierre diferido de "sin movimientos" no debe terminar otro juego que se abra después
      detener() { corriendo = false; clearTimeout(finTimer); window.removeEventListener("keydown", tecla); },
      ajustar: medir,
    };
  }
})();
