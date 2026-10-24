// Vuelo hasta ti ✈️
// Un corazoncito con alas vuela los kilómetros que los separan (los de verdad, si los dos activaron la
// ubicación; si no, 4.000). Se toca para aletear y hay que pasar entre nubes de tormenta: cada nube son
// 100 km menos y cada carta 💌 que recoges, 50 más. El cielo pasa de la mañana al atardecer y, si llegas
// hasta tu pareja, se hace de noche con estrellas. El récord es la distancia más larga.
(() => {
  "use strict";
  if (!window.NosotrosJuegos) return;
  const KM_NUBE = 100, KM_CARTA = 50;
  // el cielo según cuánto del camino llevas: mañana → mediodía → atardecer → noche al llegar
  const CIELOS = [[0, "#bfe6ff", "#fff0f5"], [0.35, "#8fd0ff", "#ffe2bd"], [0.7, "#ff9fbf", "#ffd59e"], [1, "#2b1d55", "#8a3d72"]];
  const FRASES_CARTA = ["«Ya voy»", "«Espérame»", "«Falta poco»", "«Te extraño»", "«Te quiero»", "«Pienso en ti»"];
  const HITOS = { 1000: "1.000 km pensando en ti", 2000: "2.000 km y no me canso", 3000: "3.000 km… ya casi" };
  let metaKm = 4000;
  const fmt = (n) => Math.round(n).toLocaleString("es");

  NosotrosJuegos.registrar({
    id: "vuelo",
    nombre: "Vuelo hasta ti",
    lema: "Esquiva las nubes de tormenta y vuela los kilómetros que los separan.",
    tono: ["#6cb8ff", "#ff9ab8", "#2f6fb8"],
    icono: '<svg viewBox="0 0 24 24"><path d="M21 3.5 3.5 10.6l6.6 2.7 2.7 6.6L21 3.5Z"/><path d="m10.1 13.3 4.6-4.6"/><path d="M5 20.4c-1-.7-1.8-1.3-1.8-2.1 0-.6.5-1 1-1 .3 0 .6.2.8.5.1-.3.4-.5.7-.5.6 0 1 .4 1 1 0 .8-.7 1.4-1.7 2.1Z"/></svg>',
    unidad: "km",
    marca: (n) => `${fmt(n)} km`,
    hud: [["km", "Recorrido"], ["falta", "Falta"], ["cartas", "Cartas"]],
    reglas: [["👆", "toca para aletear"], ["⛈️", "no choques las nubes"], ["☁️", "+100 km por nube"], ["💌", "+50 km cada carta"]],
    nota: (api) => `Vuela los ${fmt(api.distancia)} km que te separan de ${api.otro.nombre}. Cada nube que pasas, 100 km menos 💞`,
    detalle: "Toca la pantalla (o la barra espaciadora) para subir; si no tocas, bajas. Chocar una nube o el suelo termina el vuelo.",
    botonJugar: "Despegar ✈️",
    rango(km) {
      const p = km / metaKm;
      return { nombre: p >= 1 ? "¡Aterrizaje de amor!" : p >= 0.75 ? "Ya casi llegas" : p >= 0.5 ? "Mitad del camino" : p >= 0.25 ? "Despegue con amor" : "Turbulencias del corazón" };
    },
    crear,
  });

  function crear(api) {
    metaKm = api.distancia;
    const otroN = api.otro.nombre, encuentro = api.encuentro;
    const L = api.lienzo(), cv = L.cv, g = L.g;
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", `Vuelo hasta ${otroN}: toca para volar entre las nubes`);
    let W = L.W, H = L.H, k = H / 640;
    let raf = 0, last = 0, corriendo = false, pausado = false, S = null;
    const poco = api.pocoMovimiento(), tone = api.tono;
    const yoIni = (api.yo.nombre || "?").charAt(0).toUpperCase(), suIni = (otroN || "?").charAt(0).toUpperCase();
    // alturas fijas de montañas y cerros (así no cambian al repetirse)
    const PICOS = Array.from({ length: 9 }, (_, i) => 0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + 0.6)));
    const CERROS = Array.from({ length: 7 }, (_, i) => 0.4 + 0.6 * Math.abs(Math.sin(i * 2.3 + 1.1)));
    const ESTRELLAS = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random() * 0.62, r: 0.6 + Math.random() * 1.3, p: Math.random() * 6.3 }));

    const piso = () => H - 30 * k;
    const radio = () => 15 * k;
    const ancho = () => 64 * k;
    const px = () => W * 0.3;
    const avance = () => Math.min(1, S.nubes / 40);
    const hueco = () => (205 - 60 * avance()) * k;
    const velocidad = () => (150 + 65 * avance()) * k;
    const espacio = () => 235 * k;

    function nuevo() {
      const r = api.records;
      return {
        fase: "listo", t: 0, y: H * 0.45, vy: 0, ang: 0, aleteo: 0, km: 0, nubes: 0, cartas: 0,
        cols: [], sobres: [], parts: [], floats: [], estela: 0, offset: 0, centro: H * 0.45,
        sacudida: 0, flash: 0, cae: 0, llego: false, banner: 0, bannerTxt: "", bannerSub: "",
        rival: r.suyo, mio: r.mio, pasoRival: false, pasoMio: false, hito: 1000,
      };
    }

    // ---------- mundo ----------
    function nuevaNube(x) {
      const h = hueco(), min = 64 * k + h / 2, max = piso() - 24 * k - h / 2;
      const c = Math.max(min, Math.min(max, S.centro + (Math.random() - 0.5) * H * 0.5));
      S.centro = c;
      S.cols.push({ x, c, h, paso: false, cara: Math.random() < 0.55, rayo: avance() > 0.45 && Math.random() < 0.3 });
      if (Math.random() < 0.42) S.sobres.push({ x: x + ancho() + (espacio() - ancho()) / 2, y: c + (Math.random() - 0.5) * h * 0.4, t: Math.random() * 6 });
    }
    function circRect(cx, cy, r, x, y, w, h) {
      const nx = Math.max(x, Math.min(cx, x + w)), ny = Math.max(y, Math.min(cy, y + h));
      return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
    }
    function flotar(text, x, y, color, size, mano) {
      S.floats.push({ text, x: Math.max(70, Math.min(W - 70, x)), y, color, size: size || 16, mano: !!mano, life: mano ? 1.6 : 1, max: mano ? 1.6 : 1 });
    }
    function burst(x, y, colores, n) {
      if (poco) n = Math.ceil(n / 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = (60 + Math.random() * 160) * k;
        S.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50 * k, life: 0.7 + Math.random() * 0.5, max: 1.2, s: (5 + Math.random() * 6) * k, c: colores[i % colores.length], g: 300 * k });
      }
    }
    function banner(txt, sub, seg) { S.bannerTxt = txt; S.bannerSub = sub || ""; S.banner = seg || 2.4; }

    function sumarKm(n, x, y) {
      S.km += n;
      flotar(`+${n} km`, x, y, S.km / metaKm > 0.85 ? "#ffe08a" : "#2f6fb8", 15);
      if (!S.llego && S.km >= metaKm) {
        S.llego = true;
        banner(`¡Llegaste hasta ${otroN}! 💞`, `${fmt(metaKm)} km de cielo… y valió la pena`, 3.4);
        burst(px(), S.y, ["#ff5c8a", "#ffd6e3", "#ffe08a", "#ffffff"], 40);
        api.lluvia("💞", 18); api.vibrar([80, 50, 80, 50, 260]);
        [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i === 4 ? 0.45 : 0.14, "triangle", 0.06, 0, i * 0.12));
      } else if (S.km >= S.hito) {
        flotar(HITOS[S.hito] || `${fmt(S.hito)} km pensando en ti`, W / 2, H * 0.3, "#b8285a", 24, true);
        S.hito += 1000;
        tone(784, 0.1, "triangle", 0.05); tone(988, 0.16, "triangle", 0.05, 0, 0.1);
      }
      if (!S.pasoRival && S.rival != null && S.km > S.rival) {
        S.pasoRival = true;
        if (!S.banner) banner(`¡Pasaste a ${otroN}! 👑`, "Su récord quedó atrás", 2.2);
        tone(659, 0.12, "triangle", 0.06); tone(880, 0.12, "triangle", 0.06, 0, 0.1); tone(1175, 0.3, "triangle", 0.06, 0, 0.2);
        api.vibrar([40, 30, 40]);
      } else if (!S.pasoMio && S.mio && S.km > S.mio && (S.pasoRival || S.rival == null || S.mio > S.rival)) {
        S.pasoMio = true;
        flotar("¡Nuevo récord! ✨", W / 2, H * 0.4, "#0f766e", 22);
      }
    }

    function chocar() {
      if (S.fase !== "vuela") return;
      S.fase = "cae"; S.cae = 0; S.vy = -260 * k; S.sacudida = poco ? 0 : 12; S.flash = 0.6;
      tone(180, 0.45, "sawtooth", 0.07, 55); api.vibrar(160);
      burst(px(), S.y, ["#ffffff", "#e9e2f5", "#ff9ab8"], 18);
    }
    function terminarVuelo() {
      if (S.fase === "fin") return;
      S.fase = "fin"; corriendo = false;
      cancelAnimationFrame(raf);
      dibujar();
      const falta = Math.max(0, metaKm - S.km);
      api.terminar({
        puntos: S.km,
        prefijo: S.llego ? `¡Cruzaste ${fmt(metaKm)} km de cielo hasta ${otroN}! 💞`
          : `Te faltaron ${fmt(falta)} km para llegar hasta ${otroN}.` + (encuentro ? ` El ${encuentro} esa distancia se vuelve cero ✈️` : ""),
        stats: [[`${fmt(S.km)} km`, "recorridos"], [S.nubes, "nubes"], [S.cartas, "cartas"]],
        detalle: { nubes: S.nubes, cartas: S.cartas, llego: S.llego },
      });
    }

    function actualizar(dt) {
      S.t += dt;
      const v = velocidad();
      if (S.fase === "listo") {
        S.y = H * 0.45 + Math.sin(S.t * 3) * 8 * k; S.aleteo += dt * 10; S.offset += v * 0.4 * dt;
        return;
      }
      partes(dt);
      if (S.fase === "cae") {
        S.cae += dt; S.vy = Math.min(S.vy + 1800 * k * dt, 900 * k); S.y += S.vy * dt; S.ang += dt * 7;
        S.sacudida = Math.max(0, S.sacudida - 30 * dt); S.flash = Math.max(0, S.flash - dt * 1.5);
        if (S.cae > 0.9) terminarVuelo();
        return;
      }
      S.offset += v * dt;
      S.vy = Math.min(S.vy + 1500 * k * dt, 700 * k);
      S.y += S.vy * dt;
      S.ang = Math.max(-0.45, Math.min(1.1, S.vy / (700 * k)));
      S.aleteo += dt * (S.vy < 0 ? 26 : 9);
      if (S.y < radio()) { S.y = radio(); S.vy = Math.max(0, S.vy); }
      const ultima = S.cols[S.cols.length - 1];
      if (!ultima || ultima.x + espacio() <= W + 10 * k) nuevaNube(ultima ? ultima.x + espacio() : W + 40 * k);
      S.cols.forEach((c) => (c.x -= v * dt));
      S.sobres.forEach((l) => { l.x -= v * dt; l.t += dt; });
      S.cols = S.cols.filter((c) => c.x + ancho() > -30 * k);
      S.sobres = S.sobres.filter((l) => l.x > -30 * k && !l.tomada);
      const x = px(), r = radio() * 0.8;
      S.cols.forEach((c) => {
        if (!c.paso && c.x + ancho() < x - radio()) { c.paso = true; S.nubes++; sumarKm(KM_NUBE, x, S.y - 30 * k); tone(880, 0.08, "triangle", 0.045); }
      });
      S.sobres.forEach((l) => {
        if (!l.tomada && Math.hypot(l.x - x, l.y - S.y) < radio() + 16 * k) {
          l.tomada = true; S.cartas++;
          sumarKm(KM_CARTA, l.x, l.y - 24 * k);
          flotar(`💌 ${FRASES_CARTA[Math.floor(Math.random() * FRASES_CARTA.length)]}`, l.x, l.y - 48 * k, "#b8285a", 22, true);
          burst(l.x, l.y, ["#ff9ab8", "#ffffff", "#ffe08a"], 10);
          tone(1046, 0.1, "sine", 0.05, 1568);
        }
      });
      if (S.y + r > piso()) { chocar(); return; }
      for (const c of S.cols) {
        if (x + r < c.x || x - r > c.x + ancho()) continue;
        if (circRect(x, S.y, r, c.x, -60, ancho(), c.c - c.h / 2 + 60) || circRect(x, S.y, r, c.x, c.c + c.h / 2, ancho(), H)) { chocar(); return; }
      }
      S.estela -= dt;
      if (S.estela <= 0 && !poco) {
        S.estela = 0.07;
        S.parts.push({ x: x - 12 * k, y: S.y + 4 * k, vx: -v * 0.5 - 30 * k, vy: (Math.random() - 0.5) * 30 * k, life: 0.6, max: 0.6, s: (5 + Math.random() * 4) * k, c: Math.random() < 0.5 ? "#ff9ab8" : "#ffffff", g: 0 });
      }
      S.banner = Math.max(0, S.banner - dt);
      S.flash = Math.max(0, S.flash - dt * 1.5);
      hud();
    }
    function partes(dt) {
      for (let i = S.parts.length - 1; i >= 0; i--) {
        const p = S.parts[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.life -= dt;
        if (p.life <= 0) S.parts.splice(i, 1);
      }
      for (let i = S.floats.length - 1; i >= 0; i--) {
        const f = S.floats[i];
        f.y -= 40 * dt; f.life -= dt;
        if (f.life <= 0) S.floats.splice(i, 1);
      }
    }
    function hud() {
      api.hud("km", fmt(S.km));
      api.hud("falta", S.llego ? "¡llegaste!" : `${fmt(metaKm - S.km)} km`, S.llego || metaKm - S.km <= 500);
      api.hud("cartas", String(S.cartas));
    }

    // ---------- dibujo ----------
    function mezclar(c1, c2, t) {
      const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
      const ch = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
      return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
    }
    function cielo(p) {
      let a = CIELOS[CIELOS.length - 1], b = a;
      for (let i = 0; i < CIELOS.length - 1; i++) if (p <= CIELOS[i + 1][0]) { a = CIELOS[i]; b = CIELOS[i + 1]; break; }
      const t = a === b ? 0 : Math.max(0, Math.min(1, (p - a[0]) / (b[0] - a[0])));
      return [mezclar(a[1], b[1], t), mezclar(a[2], b[2], t)];
    }
    function rrect(x, y, w, h, r) {
      r = Math.min(r, w / 2, Math.abs(h) / 2);
      g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }
    function sierra(alturas, base, alto, color, factor, paso, suave) {
      const mov = S.offset * factor, inicio = -(mov % paso);
      let i = Math.floor(mov / paso);
      g.fillStyle = color; g.beginPath(); g.moveTo(-paso, H);
      for (let x = inicio - paso; x <= W + paso; x += paso, i++) {
        const h = alturas[((i % alturas.length) + alturas.length) % alturas.length] * alto;
        if (suave) g.quadraticCurveTo(x + paso / 2, base - h * 2, x + paso, base);
        else { g.lineTo(x, base); g.lineTo(x + paso / 2, base - h); g.lineTo(x + paso, base); }
      }
      g.lineTo(W + paso, H); g.closePath(); g.fill();
    }
    function nube(c, noche) {
      const w = ancho(), arriba = c.c - c.h / 2, abajo = c.c + c.h / 2;
      const grd = g.createLinearGradient(c.x, 0, c.x + w, 0);
      grd.addColorStop(0, noche ? "#9a89c2" : "#fbf7ff"); grd.addColorStop(1, noche ? "#5f4f8a" : "#cfc1ea");
      g.fillStyle = grd;
      rrect(c.x, -30, w, arriba - 14 * k + 30, 16 * k); g.fill();
      rrect(c.x, abajo + 14 * k, w, H, 16 * k); g.fill();
      // copos esponjosos en el borde del hueco
      [[arriba - 14 * k, 1], [abajo + 14 * k, -1]].forEach(([y, d]) => {
        g.beginPath();
        g.arc(c.x + w * 0.2, y + d * 1 * k, 12 * k, 0, 6.3);
        g.arc(c.x + w * 0.52, y + d * 2 * k, 13 * k, 0, 6.3);
        g.arc(c.x + w * 0.84, y, 11 * k, 0, 6.3);
        g.fill();
      });
      // una carita dormida, porque hasta las tormentas pueden ser tiernas
      if (c.cara) {
        const ey = abajo + 22 * k;
        g.strokeStyle = noche ? "#2a1d48" : "#7c5aa6"; g.lineWidth = 2 * k; g.lineCap = "round";
        [0.36, 0.66].forEach((f) => { g.beginPath(); g.arc(c.x + w * f, ey, 3.6 * k, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); });
        g.fillStyle = "rgba(255,120,160,.45)";
        [0.24, 0.78].forEach((f) => { g.beginPath(); g.ellipse(c.x + w * f, ey + 6 * k, 4.5 * k, 2.6 * k, 0, 0, 6.3); g.fill(); });
      }
      if (c.rayo) {
        g.strokeStyle = "#ffd84d"; g.lineWidth = 3 * k; g.lineJoin = "round";
        const x0 = c.x + w * 0.5, y0 = arriba - 4 * k;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 - 6 * k, y0 + 12 * k); g.lineTo(x0 + 3 * k, y0 + 12 * k); g.lineTo(x0 - 4 * k, y0 + 24 * k); g.stroke();
      }
    }
    function jugador(x, y) {
      g.save(); g.translate(x, y); g.rotate(S.ang);
      // alitas a los costados que aletean (más rápido cuando sube)
      const a = Math.sin(S.aleteo) * 0.5;
      g.fillStyle = "#ffffff"; g.strokeStyle = "rgba(201,50,92,.4)"; g.lineWidth = 1.5;
      [-1, 1].forEach((lado) => {
        g.save(); g.scale(lado, 1); g.translate(11 * k, -3 * k); g.rotate(-0.15 + a);
        g.beginPath(); g.ellipse(9 * k, -2 * k, 11 * k, 5.2 * k, -0.35, 0, 6.3); g.fill(); g.stroke();
        g.beginPath(); g.ellipse(6 * k, 3 * k, 7 * k, 3.6 * k, -0.1, 0, 6.3); g.fill(); g.stroke();
        g.restore();
      });
      const s = 30 * k, grd = g.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
      grd.addColorStop(0, "#ff86ab"); grd.addColorStop(1, "#d23d6e");
      g.fillStyle = grd; api.corazon(g, 0, 0, s);
      g.fillStyle = "rgba(255,255,255,.55)";
      g.beginPath(); g.ellipse(-6.5 * k, -5 * k, 3.6 * k, 2.4 * k, -0.6, 0, 6.3); g.fill();
      g.fillStyle = "#ffffff"; g.font = `700 ${Math.round(12 * k)}px ${api.NUM}`; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(yoIni, 0, 1 * k);
      g.restore();
    }
    // Arriba: el camino desde ti hasta tu pareja, con el avión, su récord 👑 y el tuyo
    function camino() {
      const x0 = 30, x1 = W - 30, y = 22, p = Math.min(1, S.km / metaKm), noche = S.km / metaKm > 0.85;
      g.save();
      g.strokeStyle = noche ? "rgba(255,255,255,.45)" : "rgba(47,111,184,.35)"; g.lineWidth = 3; g.setLineDash([2, 7]); g.lineCap = "round";
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.setLineDash([]);
      g.strokeStyle = "#ff5c8a"; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + (x1 - x0) * p, y); g.stroke();
      const marca = (km, color, txt) => {
        if (km == null || km <= 0) return;
        const mx = x0 + (x1 - x0) * Math.min(1, km / metaKm);
        g.fillStyle = color; g.beginPath(); g.arc(mx, y, 4, 0, 6.3); g.fill();
        if (txt) { g.font = `600 10px ${api.NUM}`; g.textAlign = "center"; g.fillText(txt, mx, y + 15); }
      };
      marca(S.mio, noche ? "#ccfbf1" : "#0f766e", null);
      marca(S.rival, "#f5b82e", `👑 ${otroN}`);
      g.fillStyle = "#ffffff"; g.beginPath(); g.arc(x0, y, 11, 0, 6.3); g.fill();
      g.fillStyle = "#2f6fb8"; g.font = `700 11px ${api.NUM}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(yoIni, x0, y + 0.5);
      g.fillStyle = "#ff5c8a"; api.corazon(g, x1, y + 1, 24);
      g.fillStyle = "#ffffff"; g.fillText(suIni, x1, y);
      const sp = api.sprite("✈️", 16, L.dpr);
      g.drawImage(sp.c, Math.max(x0 + 14, x0 + (x1 - x0) * p) - sp.box / 2, y - sp.box / 2 - 12, sp.box, sp.box);
      g.restore();
    }
    function dibujar() {
      if (!S) return;
      const p = Math.min(1.2, S.km / metaKm), noche = p > 0.85;
      g.save();
      if (S.sacudida > 0) g.translate((Math.random() - 0.5) * S.sacudida, (Math.random() - 0.5) * S.sacudida);
      const [c1, c2] = cielo(p), sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, c1); sky.addColorStop(1, c2);
      g.fillStyle = sky; g.fillRect(-20, -20, W + 40, H + 40);
      // estrellas y luna al llegar la noche; antes, el sol que va bajando
      const ae = Math.max(0, Math.min(1, (p - 0.75) / 0.25));
      if (ae > 0) {
        g.fillStyle = "#ffffff";
        ESTRELLAS.forEach((s) => { g.globalAlpha = ae * (0.35 + 0.55 * (0.5 + 0.5 * Math.sin(S.t * 2 + s.p))); g.beginPath(); g.arc(s.x * W, s.y * H, s.r, 0, 6.3); g.fill(); });
        g.globalAlpha = 1;
      }
      if (p < 0.92) {
        const sx = W * 0.78, sy = H * (0.16 + 0.4 * p), sr = 26 * k;
        const glow = g.createRadialGradient(sx, sy, sr * 0.4, sx, sy, sr * 3);
        glow.addColorStop(0, "rgba(255,236,170,.75)"); glow.addColorStop(1, "rgba(255,236,170,0)");
        g.fillStyle = glow; g.beginPath(); g.arc(sx, sy, sr * 3, 0, 6.3); g.fill();
        g.fillStyle = mezclar("#fff3b0", "#ff9a5c", Math.min(1, p / 0.85)); g.beginPath(); g.arc(sx, sy, sr, 0, 6.3); g.fill();
      } else {
        const mx = W * 0.78, my = H * 0.17, mr = 22 * k;
        g.globalAlpha = ae; g.fillStyle = "#fff2d4"; g.beginPath(); g.arc(mx, my, mr, 0, 6.3); g.fill();
        g.fillStyle = mezclar("#2b1d55", "#3b2668", 0.5); g.beginPath(); g.arc(mx + 9 * k, my - 6 * k, mr, 0, 6.3); g.fill();
        g.globalAlpha = 1;
      }
      sierra(PICOS, piso() - 6 * k, 120 * k, noche ? "rgba(70,50,110,.55)" : "rgba(150,110,190,.22)", 0.12, 120 * k, false);
      sierra(CERROS, piso(), 34 * k, noche ? "rgba(110,60,120,.6)" : "rgba(255,140,175,.28)", 0.35, 140 * k, true);
      S.cols.forEach((c) => nube(c, noche));
      S.sobres.forEach((l) => {
        if (l.tomada) return;
        const sp = api.sprite("💌", 26 * k, L.dpr), yy = l.y + Math.sin(l.t * 3) * 4 * k;
        g.fillStyle = "rgba(255,255,255,.55)"; g.beginPath(); g.arc(l.x, yy, 18 * k, 0, 6.3); g.fill();
        g.drawImage(sp.c, l.x - sp.box / 2, yy - sp.box / 2, sp.box, sp.box);
      });
      // suelo con florcitas de corazón que pasan
      const sg = g.createLinearGradient(0, piso(), 0, H);
      sg.addColorStop(0, noche ? "#5a2f5e" : "#ffc2d6"); sg.addColorStop(1, noche ? "#3a1d44" : "#ff9fbf");
      g.fillStyle = sg; g.fillRect(-20, piso(), W + 40, H - piso() + 20);
      g.fillStyle = noche ? "rgba(255,214,227,.35)" : "rgba(255,255,255,.7)";
      const pasoF = 38 * k, off = S.offset % pasoF;
      for (let x = -off; x < W + pasoF; x += pasoF) api.corazon(g, x, piso() + 13 * k, 8 * k);
      S.parts.forEach((q) => { g.globalAlpha = Math.max(0, q.life / q.max); g.fillStyle = q.c; api.corazon(g, q.x, q.y, q.s); });
      g.globalAlpha = 1;
      jugador(px(), S.y);
      g.textAlign = "center"; g.textBaseline = "middle";
      S.floats.forEach((f) => {
        g.globalAlpha = Math.max(0, f.life / f.max);
        g.font = f.mano ? `700 ${f.size + 4}px ${api.MANO}` : `700 ${f.size}px ${api.NUM}`;
        g.lineWidth = 4; g.strokeStyle = noche ? "rgba(0,0,0,.35)" : "rgba(255,255,255,.9)";
        g.strokeText(f.text, f.x, f.y); g.fillStyle = noche && !f.mano ? "#ffe08a" : f.color; g.fillText(f.text, f.x, f.y);
      });
      g.globalAlpha = 1;
      camino();
      if (S.banner > 0) {
        g.globalAlpha = Math.max(0, Math.min(1, S.banner / 0.4));
        const bw = Math.min(W - 30, 310), bh = 72, bx = (W - bw) / 2, by = H * 0.34 - bh / 2;
        g.fillStyle = "rgba(47,111,184,.92)"; rrect(bx, by, bw, bh, 18); g.fill();
        g.fillStyle = "#ffffff"; g.font = `700 18px ${api.NUM}`; g.fillText(S.bannerTxt, W / 2, by + 26);
        g.fillStyle = "#ffe3ef"; g.font = `700 20px ${api.MANO}`; g.fillText(S.bannerSub, W / 2, by + 51);
        g.globalAlpha = 1;
      }
      if (S.fase === "listo") {
        const a = 0.65 + 0.35 * Math.sin(S.t * 4);
        g.globalAlpha = a; g.font = `700 20px ${api.NUM}`;
        g.lineWidth = 5; g.strokeStyle = "rgba(255,255,255,.95)"; g.strokeText("Toca para volar 👆", W / 2, H * 0.68);
        g.fillStyle = "#2f6fb8"; g.fillText("Toca para volar 👆", W / 2, H * 0.68);
        g.globalAlpha = 1;
      }
      if (S.flash > 0) { g.fillStyle = `rgba(255,255,255,${S.flash * 0.7})`; g.fillRect(-20, -20, W + 40, H + 40); }
      g.restore();
    }

    // ---------- control ----------
    function bucle(ts) {
      if (!corriendo) return;
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts;
      raf = requestAnimationFrame(bucle);
      if (pausado) return;
      actualizar(dt);
      if (corriendo) dibujar();
    }
    function aletear(e) {
      if (!corriendo || pausado || !S) return;
      if (e && e.cancelable) e.preventDefault();
      if (S.fase === "listo") S.fase = "vuela";
      if (S.fase !== "vuela") return;
      S.vy = -430 * k;
      tone(560, 0.07, "sine", 0.035, 820);
    }
    function tecla(e) {
      if (!api.jugando()) return;
      if (e.code === "Space" || e.key === "ArrowUp" || e.key === "w" || e.key === "W") aletear(e);
    }
    cv.addEventListener("pointerdown", aletear);
    window.addEventListener("keydown", tecla);
    function ajustar() {
      L.ajustar(); W = L.W; H = L.H; k = H / 640;
      if (!S) { S = nuevo(); }
      if (!corriendo) dibujar();
    }

    S = nuevo(); dibujar();
    return {
      iniciar() {
        ajustar();
        S = nuevo();
        corriendo = true; pausado = false;
        hud();
        last = performance.now();
        cancelAnimationFrame(raf); raf = requestAnimationFrame(bucle);
      },
      pausar() { pausado = true; },
      reanudar() { pausado = false; last = performance.now(); },
      detener() { corriendo = false; cancelAnimationFrame(raf); cv.removeEventListener("pointerdown", aletear); window.removeEventListener("keydown", tecla); },
      ajustar,
    };
  }
})();
