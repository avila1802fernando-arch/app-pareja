// Avioncito de papel ✈️
// Un avioncito de papel (del color de quien juega) vuela lo más lejos que puede. Se toca para subir y hay que
// pasar entre nubes de tormenta: cada nube son 100 km y cada estrella ⭐ que recoges, 50 más. El cielo pasa de la
// mañana al atardecer y, a los 4.000 km, se hace de noche con estrellas. El récord es la distancia más larga.
// Misma física y puntaje que el vuelo de la otra app.
(() => {
  "use strict";
  if (!window.RecreoJuegos) return;
  const KM_NUBE = 100, KM_CARTA = 50;
  const META_KM = 4000; // la vuelta completa (solo decorado: el puntaje son los km recorridos)
  // el cielo según cuánto del camino llevas: mañana → mediodía → atardecer → noche al llegar
  const CIELOS = [[0, "#bfe6ff", "#f4faff"], [0.35, "#8fd0ff", "#fff1c9"], [0.7, "#ffb27a", "#ffd59e"], [1, "#22305e", "#4a3f7a"]];
  const FRASES_ESTRELLA = ["«¡Más alto!»", "«¡Sigue así!»", "«¡Qué pulso!»", "«¡Brillante!»", "«¡Volando!»", "«¡Chévere!»"];
  const HITOS = { 1000: "1.000 km: ¡ya cruzaste el mar!", 2000: "2.000 km y sigues volando", 3000: "3.000 km… ¡qué pulso!" };
  const metaKm = META_KM;
  const fmt = (n) => Math.round(n).toLocaleString("es");

  RecreoJuegos.registrar({
    id: "vuelo",
    nombre: "Avioncito de papel",
    lema: "Vuela lo más lejos que puedas sin chocar con las nubes.",
    tono: ["#3B82F6", "#FFC53D", "#1F4FB8"],
    emoji: "✈️",
    arte: '<span class="nube" style="left:8px;top:54px;width:34px;height:12px"></span><span class="nube" style="left:48px;top:18px;width:26px;height:10px"></span><svg viewBox="0 0 48 48" style="position:absolute;left:18px;top:20px;width:46px;height:46px"><path d="M4 22 44 6 30 42l-8-14Z" fill="#fff" stroke="#E8603F" stroke-width="2.4" stroke-linejoin="round"/><path d="m22 28 22-22" stroke="#E8603F" stroke-width="2.4" stroke-linecap="round"/></svg>',
    unidad: "km",
    marca: (n) => `${fmt(n)} km`,
    hud: [["km", "Recorrido"], ["falta", "Falta"], ["cartas", "Estrellas"]],
    reglas: [["👆", "toca para subir"], ["⛈️", "no choques las nubes"], ["☁️", "+100 km por nube"], ["⭐", "+50 km cada estrella"]],
    nota: "Cada nube que pasas son 100 km. ¿Llegarás a los 4.000?",
    detalle: "Toca la pantalla (o la barra espaciadora) para subir; si no tocas, bajas. Chocar una nube o el suelo termina el vuelo.",
    botonJugar: "Despegar ✈️",
    rango(km) {
      const p = km / metaKm;
      return { nombre: p >= 1 ? "¡Vuelta completa!" : p >= 0.75 ? "Piloto de altura" : p >= 0.5 ? "Medio camino" : p >= 0.25 ? "Buen despegue" : "Turbulencias" };
    },
    crear,
  });

  function crear(api) {
    const L = api.lienzo(), cv = L.cv, g = L.g;
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", "Avioncito de papel: toca para volar entre las nubes");
    let W = L.W, H = L.H, k = H / 640;
    let raf = 0, last = 0, corriendo = false, pausado = false, S = null;
    const poco = api.pocoMovimiento(), tone = api.tono;
    const miColor = api.yo.colorHex || "#3B82F6";
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
        metas: r.metas, pasadas: 0, mio: r.mio, pasoMio: false, hito: 1000,
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
    function flotar(text, x, y, color, size, grande) {
      S.floats.push({ text, x: Math.max(70, Math.min(W - 70, x)), y, color, size: size || 16, grande: !!grande, life: grande ? 1.6 : 1, max: grande ? 1.6 : 1 });
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
      flotar(`+${n} km`, x, y, S.km / metaKm > 0.85 ? "#ffe08a" : "#1f4fb8", 15);
      if (!S.llego && S.km >= metaKm) {
        S.llego = true;
        banner("¡Vuelta completa! 🎉", `${fmt(metaKm)} km de cielo… ¡qué viaje!`, 3.4);
        burst(px(), S.y, ["#FFC53D", "#ffffff", "#7C9BFF", "#3DD1B4"], 40);
        api.lluvia("🎉", 18); api.vibrar([80, 50, 80, 50, 260]);
        [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i === 4 ? 0.45 : 0.14, "triangle", 0.06, 0, i * 0.12));
      } else if (S.km >= S.hito) {
        flotar(HITOS[S.hito] || `${fmt(S.hito)} km`, W / 2, H * 0.3, "#1f4fb8", 22, true);
        S.hito += 1000;
        tone(784, 0.1, "triangle", 0.05); tone(988, 0.16, "triangle", 0.05, 0, 0.1);
      }
      // cada marca de la familia que pasas se celebra ahí mismo
      while (S.pasadas < S.metas.length && S.km > S.metas[S.pasadas].mejor) {
        const m = S.metas[S.pasadas++], ultima = S.pasadas === S.metas.length;
        if (!S.banner) banner(ultima ? "👑 ¡Primer lugar!" : `¡Pasaste a ${m.nombre}!`, ultima ? `Ni ${m.nombre} llegó tan lejos` : "Su récord quedó atrás", 2.2);
        tone(659, 0.12, "triangle", 0.06); tone(880, 0.12, "triangle", 0.06, 0, 0.1); tone(1175, 0.3, "triangle", 0.06, 0, 0.2);
        api.vibrar([40, 30, 40]);
      }
      if (!S.pasoMio && S.mio && S.km > S.mio) {
        S.pasoMio = true;
        flotar("¡Nuevo récord! ✨", W / 2, H * 0.4, "#0e9c82", 22);
      }
    }

    function chocar() {
      if (S.fase !== "vuela") return;
      S.fase = "cae"; S.cae = 0; S.vy = -260 * k; S.sacudida = poco ? 0 : 12; S.flash = 0.6;
      tone(180, 0.45, "sawtooth", 0.07, 55); api.vibrar(160);
      burst(px(), S.y, ["#ffffff", "#e9e2f5", "#bcd3ff"], 18);
    }
    function terminarVuelo() {
      if (S.fase === "fin") return;
      S.fase = "fin"; corriendo = false;
      cancelAnimationFrame(raf);
      dibujar();
      const falta = Math.max(0, metaKm - S.km);
      api.terminar({
        puntos: S.km,
        prefijo: S.llego ? `¡Volaste los ${fmt(metaKm)} km completos! 🎉` : `Te faltaron ${fmt(falta)} km para la vuelta completa.`,
        stats: [[`${fmt(S.km)} km`, "recorridos"], [S.nubes, "nubes"], [S.cartas, "estrellas"]],
        detalle: { nubes: S.nubes, estrellas: S.cartas, llego: S.llego },
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
          flotar(`⭐ ${FRASES_ESTRELLA[Math.floor(Math.random() * FRASES_ESTRELLA.length)]}`, l.x, l.y - 48 * k, "#b07a00", 20, true);
          burst(l.x, l.y, ["#FFD36B", "#ffffff", "#FFC53D"], 10);
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
        S.parts.push({ x: x - 14 * k, y: S.y + 3 * k, vx: -v * 0.5 - 30 * k, vy: (Math.random() - 0.5) * 30 * k, life: 0.6, max: 0.6, s: (4 + Math.random() * 3) * k, c: Math.random() < 0.5 ? "#ffffff" : "#ffe9a8", g: 0 });
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
      grd.addColorStop(0, noche ? "#8f9cc9" : "#fbfcff"); grd.addColorStop(1, noche ? "#55638f" : "#c9d3ea");
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
        g.strokeStyle = noche ? "#1e2747" : "#5a6a96"; g.lineWidth = 2 * k; g.lineCap = "round";
        [0.36, 0.66].forEach((f) => { g.beginPath(); g.arc(c.x + w * f, ey, 3.6 * k, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); });
        g.fillStyle = "rgba(255,170,120,.45)";
        [0.24, 0.78].forEach((f) => { g.beginPath(); g.ellipse(c.x + w * f, ey + 6 * k, 4.5 * k, 2.6 * k, 0, 0, 6.3); g.fill(); });
      }
      if (c.rayo) {
        g.strokeStyle = "#ffd84d"; g.lineWidth = 3 * k; g.lineJoin = "round";
        const x0 = c.x + w * 0.5, y0 = arriba - 4 * k;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 - 6 * k, y0 + 12 * k); g.lineTo(x0 + 3 * k, y0 + 12 * k); g.lineTo(x0 - 4 * k, y0 + 24 * k); g.stroke();
      }
    }
    // El avioncito de papel: un ala clara, otra en sombra y el doblez del medio (del tamaño del radio de choque)
    function jugador(x, y) {
      g.save(); g.translate(x, y); g.rotate(S.ang + Math.sin(S.aleteo) * 0.06);
      const s = 17 * k;
      g.lineJoin = "round";
      g.fillStyle = mezclar(miColor, "#000000", 0.28);
      g.beginPath(); g.moveTo(s * 1.15, 0); g.lineTo(-s, s * 0.55); g.lineTo(-s * 0.35, s * 0.05); g.closePath(); g.fill();
      g.fillStyle = miColor; g.strokeStyle = "#ffffff"; g.lineWidth = 2 * k;
      g.beginPath(); g.moveTo(s * 1.15, 0); g.lineTo(-s, -s * 0.75); g.lineTo(-s * 0.35, s * 0.05); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = "rgba(255,255,255,.8)"; g.lineWidth = 1.4 * k;
      g.beginPath(); g.moveTo(s * 1.1, 0); g.lineTo(-s * 0.35, s * 0.05); g.stroke();
      g.restore();
    }
    // Arriba: el camino de la casa a la meta, con un puntito por cada récord de la familia y el avioncito encima
    function camino() {
      const x0 = 30, x1 = W - 30, y = 22, p = Math.min(1, S.km / metaKm), noche = S.km / metaKm > 0.85;
      g.save();
      g.strokeStyle = noche ? "rgba(255,255,255,.45)" : "rgba(31,79,184,.35)"; g.lineWidth = 3; g.setLineDash([2, 7]); g.lineCap = "round";
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.setLineDash([]);
      g.strokeStyle = "#FFC53D"; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + (x1 - x0) * p, y); g.stroke();
      const lider = S.metas[S.metas.length - 1];
      const marca = (km, color, txt) => {
        if (km == null || km <= 0) return;
        const mx = x0 + (x1 - x0) * Math.min(1, km / metaKm);
        g.fillStyle = color; g.beginPath(); g.arc(mx, y, 4.5, 0, 6.3); g.fill();
        g.strokeStyle = "#ffffff"; g.lineWidth = 1.5; g.stroke();
        if (txt) { g.font = `600 10px ${api.NUM}`; g.textAlign = "center"; g.fillStyle = noche ? "#ffe08a" : "#7a5200"; g.fillText(txt, mx, y + 15); }
      };
      S.metas.forEach((m) => marca(m.mejor, (window.recreo && window.recreo.COLORES[m.color]) || "#7a5af0", m === lider ? `👑 ${m.nombre}` : null));
      marca(S.mio, miColor, null);
      const ini = api.sprite("🏠", 15, L.dpr), fin = api.sprite("🏁", 15, L.dpr);
      g.drawImage(ini.c, x0 - ini.box / 2, y - ini.box / 2, ini.box, ini.box);
      g.drawImage(fin.c, x1 - fin.box / 2, y - fin.box / 2, fin.box, fin.box);
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
        g.fillStyle = mezclar("#22305e", "#2e3a6e", 0.5); g.beginPath(); g.arc(mx + 9 * k, my - 6 * k, mr, 0, 6.3); g.fill();
        g.globalAlpha = 1;
      }
      sierra(PICOS, piso() - 6 * k, 120 * k, noche ? "rgba(60,70,120,.55)" : "rgba(110,140,190,.22)", 0.12, 120 * k, false);
      sierra(CERROS, piso(), 34 * k, noche ? "rgba(40,80,70,.6)" : "rgba(120,190,140,.32)", 0.35, 140 * k, true);
      S.cols.forEach((c) => nube(c, noche));
      S.sobres.forEach((l) => {
        if (l.tomada) return;
        const sp = api.sprite("⭐", 26 * k, L.dpr), yy = l.y + Math.sin(l.t * 3) * 4 * k;
        g.fillStyle = "rgba(255,255,255,.55)"; g.beginPath(); g.arc(l.x, yy, 18 * k, 0, 6.3); g.fill();
        g.drawImage(sp.c, l.x - sp.box / 2, yy - sp.box / 2, sp.box, sp.box);
      });
      // suelo de pasto con florcitas que pasan
      const sg = g.createLinearGradient(0, piso(), 0, H);
      sg.addColorStop(0, noche ? "#2e4a3a" : "#9ed67a"); sg.addColorStop(1, noche ? "#1f3329" : "#6bb85a");
      g.fillStyle = sg; g.fillRect(-20, piso(), W + 40, H - piso() + 20);
      const pasoF = 38 * k, off = S.offset % pasoF;
      for (let x = -off, i = 0; x < W + pasoF; x += pasoF, i++) {
        g.fillStyle = noche ? "rgba(255,255,255,.35)" : i % 2 ? "rgba(255,255,255,.85)" : "rgba(255,213,92,.95)";
        g.beginPath(); g.arc(x, piso() + 13 * k, 3.2 * k, 0, 6.3); g.fill();
      }
      S.parts.forEach((q) => { g.globalAlpha = Math.max(0, q.life / q.max); g.fillStyle = q.c; g.beginPath(); g.arc(q.x, q.y, q.s / 2, 0, 6.3); g.fill(); });
      g.globalAlpha = 1;
      jugador(px(), S.y);
      g.textAlign = "center"; g.textBaseline = "middle";
      S.floats.forEach((f) => {
        g.globalAlpha = Math.max(0, f.life / f.max);
        g.font = `700 ${f.grande ? f.size + 2 : f.size}px ${api.NUM}`;
        g.lineWidth = 4; g.strokeStyle = noche ? "rgba(0,0,0,.35)" : "rgba(255,255,255,.9)";
        g.strokeText(f.text, f.x, f.y); g.fillStyle = noche ? "#ffe08a" : f.color; g.fillText(f.text, f.x, f.y);
      });
      g.globalAlpha = 1;
      camino();
      if (S.banner > 0) {
        g.globalAlpha = Math.max(0, Math.min(1, S.banner / 0.4));
        const bw = Math.min(W - 30, 310), bh = 72, bx = (W - bw) / 2, by = H * 0.34 - bh / 2;
        g.fillStyle = "rgba(31,79,184,.94)"; rrect(bx, by, bw, bh, 18); g.fill();
        g.fillStyle = "#ffffff"; g.font = `700 18px ${api.NUM}`; g.fillText(S.bannerTxt, W / 2, by + 26);
        g.fillStyle = "#ffe9a8"; g.font = `600 16px ${api.NUM}`; g.fillText(S.bannerSub, W / 2, by + 51);
        g.globalAlpha = 1;
      }
      if (S.fase === "listo") {
        const a = 0.65 + 0.35 * Math.sin(S.t * 4);
        g.globalAlpha = a; g.font = `700 20px ${api.NUM}`;
        g.lineWidth = 5; g.strokeStyle = "rgba(255,255,255,.95)"; g.strokeText("Toca para volar 👆", W / 2, H * 0.68);
        g.fillStyle = "#1f4fb8"; g.fillText("Toca para volar 👆", W / 2, H * 0.68);
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
