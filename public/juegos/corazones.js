// Atrapa los corazones 💗 — ahora para los dos
// Nació como una postal de Fernando para Martina ("edición revancha"): ahora lo juegan los dos y cada uno
// persigue el récord del otro. 60 segundos y 6 niveles: corazones que caen, cupidos que no pueden caer,
// corazones rotos que no hay que tocar, estrellas fugaces, cartas que regalan tiempo y copos que lo ponen
// en cámara lenta. 8 seguidos suben el multiplicador (hasta x5) y cada corazón te dice algo bonito.
(() => {
  "use strict";
  if (!window.NosotrosJuegos) return;
  const GAME_TIME = 60, ESCAPE_LIMIT = 6;
  const LEVELS = [
    { at: 0, name: "Calentamiento", tip: "Fácil... por ahora" },
    { at: 10, name: "Corazones rotos", tip: "No toques los 💔" },
    { at: 20, name: "Cupido", tip: "Si un 💘 cae, pierdes una vida" },
    { at: 30, name: "Mareo", tip: "Ahora se mueven de lado" },
    { at: 40, name: "Fantasmas", tip: "Aparecen y desaparecen" },
    { at: 50, name: "Tormenta de amor", tip: "Suerte. La vas a necesitar" },
  ];
  // rosa y turquesa (un color de cada uno) y, en los niveles difíciles, de noche
  const BG = [["#fff6f9", "#ffe0ea"], ["#f0fdfa", "#c9f5ec"], ["#fff1f6", "#ffd0df"], ["#ecfdfa", "#b3eee3"], ["#3b1d4a", "#1d1033"], ["#2a0f2e", "#12061a"]];
  const HEARTS = ["💗", "💖", "💙", "💕"];
  const GLYPH = { broken: "💔", cupid: "💘", gold: "🌟", letter: "💌", freeze: "❄️" };
  const RING = { heart: "#ff5c8a", broken: "#111418", cupid: "#c9325c", gold: "#f5b82e", letter: "#14b8a6", freeze: "#4fb3ea" };
  let diaTxt = "05·05";

  const logrosDe = (otro) => [
    { id: "racha15", icon: "🔥", name: "Imparable", desc: "Racha de 15 sin fallar" },
    { id: "estrella", icon: "🌟", name: "Estrella fugaz", desc: "Atrapa una estrella" },
    { id: "cupido", icon: "💘", name: "Flechazo", desc: "4 cupidos en una partida" },
    { id: "intacto", icon: "🛡️", name: "Corazón intacto", desc: "Nivel 4 sin tocar un 💔" },
    { id: "tormenta", icon: "⛈️", name: "Tormenta superada", desc: "Llega al nivel 6" },
    { id: "rival", icon: "👑", name: `Le ganaste a ${otro}`, desc: "Supera su récord" },
  ];
  const claveLogros = (id) => `juegos-logros-corazones-${id}`;
  function leerLogros(id) { try { return JSON.parse(localStorage.getItem(claveLogros(id)) || "{}") || {}; } catch (e) { return {}; } }
  function guardarLogros(id, l) { try { localStorage.setItem(claveLogros(id), JSON.stringify(l)); } catch (e) {} }
  function pintarLogros(api, cont, fresco) {
    const l = leerLogros(api.yo.id), lista = logrosDe(api.otro.nombre);
    cont.innerHTML = "";
    const t = document.createElement("p"); t.className = "jv-logros-titulo";
    t.textContent = `Logros ${lista.filter((a) => l[a.id]).length}/${lista.length}`;
    const ul = document.createElement("ul"); ul.className = "jv-logros";
    lista.forEach((a) => {
      const li = document.createElement("li");
      li.className = (l[a.id] ? "ok" : "") + (a.id === fresco ? " fresco" : "");
      li.innerHTML = '<span aria-hidden="true"></span><b></b><small></small>';
      li.querySelector("span").textContent = a.icon; li.querySelector("b").textContent = a.name; li.querySelector("small").textContent = a.desc;
      li.setAttribute("aria-label", `${a.name}: ${a.desc}${l[a.id] ? " (conseguido)" : ""}`);
      ul.append(li);
    });
    cont.append(t, ul);
  }

  NosotrosJuegos.registrar({
    id: "corazones",
    nombre: "Atrapa los corazones",
    lema: "60 segundos de corazones, cupidos y caos. Tócalos antes de que caigan.",
    tono: ["#ff6f9c", "#2dd4bf", "#b8285a"],
    icono: '<svg viewBox="0 0 24 24"><path d="M12 20c-4.3-3.1-7.2-5.8-7.2-8.9A3.7 3.7 0 0 1 12 9.3a3.7 3.7 0 0 1 7.2 1.8c0 3.1-2.9 5.8-7.2 8.9Z"/><path d="M7.5 3.2v2.4M12 2.2v3.4M16.5 3.2v2.4"/></svg>',
    unidad: "puntos",
    marca: (n) => `${Number(n).toLocaleString("es")} pts`,
    hud: [["puntos", "Puntos"], ["racha", "Racha"], ["vidas", "Vidas"], ["tiempo", "Tiempo"]],
    reglas: [["💗", "+10 puntos"], ["🌟", "+50, muy rápida"], ["💌", "+2 segundos"], ["❄️", "cámara lenta"], ["💘", "si cae, pierdes vida", true], ["💔", "no lo toques", true]],
    nota: (api) => `Cada corazón te dice algo de parte de ${api.otro.nombre}. Los más difíciles, lo más bonito.`,
    detalle: "8 seguidos suben el multiplicador (hasta x5). Tocar donde no hay nada resta 5 y corta la racha. Si se te escapan 6 corazones, pierdes una vida.",
    extra: (api, cont) => pintarLogros(api, cont),
    rango(p) {
      const nombre = p >= 3500 ? `Leyenda del ${diaTxt}` : p >= 2500 ? "Cupido oficial" : p >= 1900 ? "Casi Cupido"
        : p >= 1200 ? "Rompecorazones" : p >= 500 ? "Aprendiz de Cupido" : "Corazón de práctica";
      return { nombre };
    },
    crear,
  });

  function crear(api) {
    diaTxt = api.diaEspecial;
    const L = api.lienzo(), cv = L.cv, g = L.g;
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", "Campo de juego: toca los corazones que caen");
    let W = L.W, H = L.H, DPRv = L.dpr, SPRITES = {};
    let running = false, paused = false, raf = 0, last = 0, S = null;
    const reduceMotion = api.pocoMovimiento();
    const tone = api.tono;
    const yoN = api.yo.nombre;
    // mensajes de amor: mientras más difícil el corazón, más bonito lo que dice
    const LOVE = {
      facil: { words: [`Me gustas, ${yoN}`, "Me gustas mucho"], light: "#c9325c", dark: "#ffd6e3", size: 21 },
      media: { words: [`Me encantas, ${yoN}`, "Te quiero", "Te quiero mucho", "Me encantas"], light: "#b8285a", dark: "#ffb3c7", size: 23 },
      dificil: { words: ["Te quiero, mi amor", `Te adoro, ${yoN}`, "Me encantas, mi amor", "Eres mi lugar favorito"], light: "#8f1d4a", dark: "#ff9ab8", size: 25 },
      muyDificil: { words: [`Te amo, ${yoN}`, "Te amo, mi amor", "Eres mi persona favorita"], light: "#b7791f", dark: "#ffe08a", size: 30 },
    };
    const STARS = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 1.4, p: Math.random() * 6.28 }));
    let ach = leerLogros(api.yo.id);

    // ---------- fichas: círculo + borde + emoji, dibujadas una vez ----------
    function sprite(e, ring) {
      const key = e.glyph + "|" + e.size + "|" + ring + "|" + e.type;
      if (SPRITES[key]) return SPRITES[key];
      const R = e.size * 0.6, box = Math.ceil((R + 9) * 2), c = document.createElement("canvas");
      c.width = c.height = Math.ceil(box * DPRv);
      const x = c.getContext("2d");
      x.scale(DPRv, DPRv);
      const m = box / 2;
      x.shadowColor = "rgba(0,0,0,.28)"; x.shadowBlur = 10; x.shadowOffsetY = 3;
      x.beginPath(); x.arc(m, m, R, 0, 6.28);
      x.fillStyle = e.type === "broken" ? "#3a3f47" : "#ffffff"; x.fill();
      x.shadowColor = "transparent"; x.shadowBlur = 0; x.shadowOffsetY = 0;
      x.beginPath(); x.arc(m, m, R, 0, 6.28); x.lineWidth = 3; x.strokeStyle = ring; x.stroke();
      x.textAlign = "center"; x.textBaseline = "middle";
      x.font = Math.round(e.size * 0.78) + "px " + api.EMOJI;
      x.fillStyle = ring; // color de respaldo si el teléfono no tiene emojis a color
      x.fillText(e.glyph, m, m + 2);
      return (SPRITES[key] = { c, box });
    }

    function ajustar() {
      L.ajustar();
      W = L.W; H = L.H;
      if (L.dpr !== DPRv) { DPRv = L.dpr; SPRITES = {}; }
      if (!running) drawIdle(); else draw();
    }

    function newState() {
      const r = api.records;
      return {
        score: 0, lives: 3, combo: 0, maxCombo: 0, timeLeft: GAME_TIME, elapsed: 0, level: 1,
        spawnAcc: 0, countdown: 3.4, lastCount: "", freezeT: 0, shake: 0, flash: 0, bolt: 0, boltNext: 2.5,
        banner: 0, bannerText: "", bannerTip: "", ents: [], parts: [], floats: [],
        taps: 0, hits: 0, escaped: 0, brokenTouched: 0, cupids: 0,
        rival: r.suyo, mio: r.mio, pasoRival: false, pasoMio: false,
      };
    }
    const levelFor = (t) => { let n = 1; LEVELS.forEach((l, i) => { if (t >= l.at) n = i + 1; }); return n; };
    const mult = () => Math.min(1 + Math.floor(S.combo / 8), 5);
    const dark = () => S && S.level >= 5;

    // ---------- entidades ----------
    function spawn() {
      const Lv = S.level, r = Math.random();
      let type = "heart", acc = 0;
      const pBroken = Lv >= 2 ? Math.min(0.2 + 0.05 * (Lv - 2), 0.4) : 0;
      const pCupid = Lv >= 3 ? 0.08 : 0, pGold = 0.025, pLetter = 0.02, pFreeze = Lv >= 3 ? 0.02 : 0;
      if (r < (acc += pBroken)) type = "broken";
      else if (r < (acc += pCupid)) type = "cupid";
      else if (r < (acc += pGold)) type = "gold";
      else if (r < (acc += pLetter)) type = "letter";
      else if (r < (acc += pFreeze)) type = "freeze";
      const size = (Lv >= 5 ? 38 : Lv >= 3 ? 42 : 47) * (type === "gold" ? 0.9 : 1);
      const baseV = (120 + Lv * 44) * (H / 440);
      S.ents.push({
        type, glyph: type === "heart" ? HEARTS[Math.floor(Math.random() * HEARTS.length)] : GLYPH[type],
        x: size / 2 + 6 + Math.random() * (W - size - 12), y: -size, cx: 0, size,
        vy: baseV * (0.8 + Math.random() * 0.5) * (type === "gold" ? 1.55 : 1),
        phase: Math.random() * 6.28, sway: Lv >= 4 ? 16 + Math.random() * 30 : 0, swayF: 1.6 + Math.random() * 2.2,
        ghost: Lv >= 5 && type !== "cupid" && Math.random() < 0.55, t: 0,
      });
    }
    function burst(x, y, colors, n) {
      if (reduceMotion) n = Math.ceil(n / 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 170;
        S.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.7 + Math.random() * 0.4, max: 1.1,
          size: 5 + Math.random() * 6, color: colors[Math.floor(Math.random() * colors.length)] });
      }
    }
    function addFloat(text, x, y, color, size, script) {
      size = size || 18;
      const half = script ? Math.min(W / 2, text.length * size * 0.24 + 8) : 50, life = script ? 1.4 : 1;
      y = Math.max(script ? 48 : 30, Math.min(H - 24, y));
      if (script) {
        // si ya hay una frase cerca, la nueva se acomoda debajo para que no se encimen
        for (let tries = 0; tries < 5; tries++) {
          const clash = S.floats.some((f) => f.script && f.life > 0.35 && Math.abs(f.y - y) < size + 6 && Math.abs(f.x - x) < 150);
          if (!clash) break;
          y = y + size + 8 > H - 24 ? y - (size + 8) * (tries + 1) : y + size + 8;
        }
      }
      S.floats.push({ text, x: Math.max(half, Math.min(W - half, x)), y, color, size, life, max: life, script: !!script });
    }
    const ghostAlpha = (e) => (e.ghost ? 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(e.t * 3.4 + e.phase), 2) : 1);
    function loveTier(e) {
      if (e.type === "gold" || (e.ghost && ghostAlpha(e) < 0.5)) return "muyDificil";
      if (e.type === "cupid" || e.ghost || S.level >= 6) return "dificil";
      if (e.type !== "heart" || S.level >= 4) return "media";
      return "facil";
    }
    function sayLove(e) {
      const key = loveTier(e), t = LOVE[key];
      addFloat(t.words[Math.floor(Math.random() * t.words.length)], e.cx, e.y - 36, dark() ? t.dark : t.light, t.size, true);
      if (key === "muyDificil") {
        burst(e.cx, e.y, ["#f5b82e", "#ffe08a", "#ff9ab8", "#ffffff"], 26);
        tone(784, 0.18, "sine", 0.05); tone(988, 0.18, "sine", 0.05, 0, 0.12); tone(1318, 0.3, "sine", 0.05, 0, 0.24);
      }
    }
    function loseLife(msg, x, y) {
      S.lives--; S.combo = 0;
      S.shake = reduceMotion ? 0 : 12; S.flash = 0.55;
      addFloat(msg, x, y, dark() ? "#ffffff" : "#8f1d4a", 20);
      tone(160, 0.4, "sawtooth", 0.06, 60);
      api.vibrar(120);
    }
    function unlock(id) {
      if (ach[id]) return;
      ach[id] = true; guardarLogros(api.yo.id, ach);
      const a = logrosDe(api.otro.nombre).find((x) => x.id === id);
      if (S && running && a) {
        addFloat("🏆 " + a.name, W / 2, H * 0.55, dark() ? "#ffe08a" : "#b7791f", 20);
        tone(988, 0.12, "triangle", 0.05); tone(1318, 0.2, "triangle", 0.05, 0, 0.1);
      }
    }
    // El momento en que pasas el récord de tu pareja (o el tuyo) se celebra ahí mismo
    function revisarMarcas() {
      if (!S.pasoRival && S.rival != null && S.score > S.rival) {
        S.pasoRival = true;
        addFloat(`¡Superaste a ${api.otro.nombre}! 👑`, W / 2, H * 0.42, dark() ? "#ffe08a" : "#b7791f", 26);
        burst(W / 2, H * 0.42, ["#f5b82e", "#ffe08a", "#ff9ab8"], 30);
        tone(659, 0.12, "triangle", 0.06); tone(880, 0.12, "triangle", 0.06, 0, 0.1); tone(1175, 0.3, "triangle", 0.06, 0, 0.2);
        api.vibrar([40, 30, 40]);
      } else if (!S.pasoMio && S.mio && S.score > S.mio && (S.pasoRival || S.rival == null || S.mio > S.rival)) {
        S.pasoMio = true;
        addFloat("¡Nuevo récord! ✨", W / 2, H * 0.42, dark() ? "#ccfbf1" : "#0f766e", 24);
        tone(880, 0.12, "triangle", 0.05); tone(1175, 0.2, "triangle", 0.05, 0, 0.1);
      }
    }

    function hit(e) {
      S.hits++;
      let pts = 0, label = "";
      if (e.type === "broken") {
        S.brokenTouched++;
        burst(e.cx, e.y, ["#6b7280", "#9ca3af", "#c9325c"], 14);
        loseLife("¡Corazón roto!", e.cx, e.y);
        return;
      }
      S.combo++;
      if (S.combo > S.maxCombo) S.maxCombo = S.combo;
      if (S.combo >= 15) unlock("racha15");
      const m = mult();
      if (e.type === "heart") { pts = 10 * m; burst(e.cx, e.y, ["#ff5c8a", "#ff9ab8", "#2dd4bf"], 10); }
      if (e.type === "cupid") { pts = 25 * m; S.cupids++; if (S.cupids >= 4) unlock("cupido"); burst(e.cx, e.y, ["#ff5c8a", "#f5b82e"], 14); }
      if (e.type === "gold") { pts = 50 * m; unlock("estrella"); burst(e.cx, e.y, ["#f5b82e", "#ffe08a", "#fff"], 22); tone(1320, 0.25, "triangle", 0.06, 1760); }
      if (e.type === "letter") { S.timeLeft += 2; label = "+2s 💌"; burst(e.cx, e.y, ["#14b8a6", "#2dd4bf"], 12); tone(660, 0.12, "triangle", 0.06, 990); }
      if (e.type === "freeze") { S.freezeT = 2.5; label = "cámara lenta ❄️"; burst(e.cx, e.y, ["#8fd3ff", "#ffffff"], 14); tone(900, 0.4, "sine", 0.05, 300); }
      if (pts) { S.score += pts; label = "+" + pts + (m > 1 ? "  x" + m : ""); }
      addFloat(label, e.cx, e.y, dark() ? "#ffd6e3" : "#b8285a", m >= 3 ? 18 : 15);
      sayLove(e);
      tone(480 + Math.min(S.combo, 25) * 28, 0.09, "sine", 0.07);
      if (S.combo > 0 && S.combo % 8 === 0 && S.combo <= 32) {
        addFloat("¡Racha x" + mult() + "!", W / 2, H * 0.3, dark() ? "#ffe08a" : "#b8285a", 28);
        tone(784, 0.1, "triangle", 0.05); tone(1046, 0.14, "triangle", 0.05, 0, 0.08);
      }
      revisarMarcas();
    }
    function escaped(e) {
      if (e.type === "heart") {
        S.combo = 0; S.escaped++;
        if (S.escaped % ESCAPE_LIMIT === 0) loseLife("Se te escaparon " + ESCAPE_LIMIT, e.cx, H - 34);
        else addFloat("se escapó " + (S.escaped % ESCAPE_LIMIT) + "/" + ESCAPE_LIMIT, e.cx, H - 24, dark() ? "#fff" : "#8a6a78", 15);
      } else if (e.type === "cupid") {
        loseLife("¡Cupido se cayó!", e.cx, H - 34);
      }
    }

    // ---------- toques ----------
    function tocar(ev) {
      if (!running || paused || S.countdown > 0) return;
      ev.preventDefault();
      const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      S.taps++;
      for (let i = S.ents.length - 1; i >= 0; i--) {
        const e = S.ents[i], dx = x - e.cx, dy = y - e.y, rad = e.size * 0.56;
        if (dx * dx + dy * dy <= rad * rad) { S.ents.splice(i, 1); hit(e); return; }
      }
      S.score = Math.max(0, S.score - 5);
      addFloat(S.combo >= 3 ? "racha perdida · -5" : "-5", x, y, dark() ? "#ffd6e3" : "#b8285a", 15);
      S.combo = 0;
      tone(200, 0.07, "triangle", 0.035);
    }
    cv.addEventListener("pointerdown", tocar);

    // ---------- bucle ----------
    function tick(ts) {
      if (!running) return;
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts;
      raf = requestAnimationFrame(tick);
      if (paused) return;
      if (S.countdown > 0) {
        S.countdown -= dt;
        const c = S.countdown > 2.4 ? "3" : S.countdown > 1.4 ? "2" : S.countdown > 0.4 ? "1" : "¡YA!";
        if (c !== S.lastCount) { S.lastCount = c; tone(c === "¡YA!" ? 880 : 440, 0.15, "triangle", 0.07); }
        draw();
        return;
      }
      const slow = S.freezeT > 0 ? 0.45 : 1;
      S.freezeT = Math.max(0, S.freezeT - dt);
      S.elapsed += dt; S.timeLeft -= dt;
      const nl = levelFor(S.elapsed);
      if (nl > S.level) {
        S.level = nl; S.banner = 2.4;
        S.bannerText = "Nivel " + nl + " · " + LEVELS[nl - 1].name; S.bannerTip = LEVELS[nl - 1].tip;
        tone(523, 0.12, "triangle", 0.06); tone(659, 0.12, "triangle", 0.06, 0, 0.1); tone(784, 0.2, "triangle", 0.06, 0, 0.2);
        if (nl >= 4 && S.brokenTouched === 0) unlock("intacto");
        if (nl >= 6) unlock("tormenta");
      }
      let interval = Math.max(0.24, 0.72 - 0.085 * (S.level - 1));
      if (S.level >= 6) interval *= 0.85;
      S.spawnAcc += dt * slow;
      while (S.spawnAcc >= interval) { S.spawnAcc -= interval; spawn(); }
      const wind = S.level >= 6 ? Math.sin(S.elapsed * 1.1) * 95 : 0;
      for (let i = S.ents.length - 1; i >= 0; i--) {
        const e = S.ents[i];
        e.t += dt * slow; e.y += e.vy * dt * slow; e.x += wind * dt * slow;
        e.x = Math.max(e.size / 2, Math.min(W - e.size / 2, e.x));
        e.cx = Math.max(e.size / 2, Math.min(W - e.size / 2, e.x + Math.sin(e.t * e.swayF + e.phase) * e.sway));
        if (e.y - e.size / 2 > H) { S.ents.splice(i, 1); escaped(e); }
      }
      for (let p = S.parts.length - 1; p >= 0; p--) {
        const q = S.parts[p];
        q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 320 * dt; q.life -= dt;
        if (q.life <= 0) S.parts.splice(p, 1);
      }
      for (let f = S.floats.length - 1; f >= 0; f--) {
        const fl = S.floats[f];
        fl.y -= 42 * dt; fl.life -= dt;
        if (fl.life <= 0) S.floats.splice(f, 1);
      }
      S.shake = Math.max(0, S.shake - 40 * dt); S.flash = Math.max(0, S.flash - dt);
      S.banner = Math.max(0, S.banner - dt); S.bolt = Math.max(0, S.bolt - dt * 1.6);
      if (S.level >= 6 && !reduceMotion) {
        S.boltNext -= dt;
        if (S.boltNext <= 0) { S.bolt = 0.45; S.boltNext = 2 + Math.random() * 2.5; tone(70, 0.5, "sawtooth", 0.03, 40); }
      }
      renderHud();
      if (S.timeLeft <= 0 || S.lives <= 0) { S.timeLeft = Math.max(0, S.timeLeft); renderHud(); end(); return; }
      draw();
    }
    function renderHud() {
      api.hud("puntos", S.score.toLocaleString("es"));
      api.hud("racha", "x" + mult() + (S.combo ? " · " + S.combo : ""), mult() >= 3);
      api.hud("vidas", "💗".repeat(Math.max(S.lives, 0)) + "🤍".repeat(3 - Math.max(S.lives, 0)));
      api.hud("tiempo", String(Math.ceil(Math.max(S.timeLeft, 0))), S.timeLeft < 10);
    }

    // ---------- dibujo ----------
    function rrect(x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
      g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
      g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
    }
    function paintBg(level, t) {
      const bg = BG[level - 1], grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, bg[0]); grd.addColorStop(1, bg[1]);
      g.fillStyle = grd; g.fillRect(-20, -20, W + 40, H + 40);
      if (level >= 5) {
        g.fillStyle = "#ffffff";
        STARS.forEach((s) => {
          g.globalAlpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2 + s.p));
          g.beginPath(); g.arc(s.x * W, s.y * H, s.r, 0, 6.28); g.fill();
        });
        g.globalAlpha = 1;
      } else {
        // papel de carta: renglones suaves y corazoncitos de fondo
        g.fillStyle = level % 2 ? "rgba(255,92,138,.08)" : "rgba(20,184,166,.08)";
        for (let y = 30; y < H; y += 34) g.fillRect(0, y, W, 1);
      }
    }
    function drawIdle() {
      if (!W) return;
      g.clearRect(0, 0, W, H);
      paintBg(1, 0);
      g.fillStyle = "rgba(255,92,138,.18)";
      for (let i = 0; i < 9; i++) api.corazon(g, ((i * 97) % 100) / 100 * W, ((i * 53) % 100) / 100 * H, 18 + (i % 3) * 10);
    }
    function draw() {
      const s = S;
      g.save();
      g.clearRect(0, 0, W, H);
      if (s.shake > 0) g.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);
      paintBg(s.level, s.elapsed);
      if (s.bolt > 0) { g.fillStyle = "rgba(255,255,255," + s.bolt + ")"; g.fillRect(-20, -20, W + 40, H + 40); }
      if (s.freezeT > 0) { g.fillStyle = "rgba(140,210,255,.2)"; g.fillRect(-20, -20, W + 40, H + 40); }
      g.textAlign = "center"; g.textBaseline = "middle";
      s.ents.forEach((e) => {
        g.globalAlpha = ghostAlpha(e);
        const ring = e.type === "broken" && dark() ? "#e2e8f0" : RING[e.type] || "#ff5c8a";
        if (e.type === "gold") {
          const rg = g.createRadialGradient(e.cx, e.y, 2, e.cx, e.y, e.size);
          rg.addColorStop(0, "rgba(255,220,110,.75)"); rg.addColorStop(1, "rgba(255,220,110,0)");
          g.fillStyle = rg; g.beginPath(); g.arc(e.cx, e.y, e.size, 0, 6.28); g.fill();
        }
        const sp = sprite(e, ring);
        g.drawImage(sp.c, e.cx - sp.box / 2, e.y - sp.box / 2, sp.box, sp.box);
        if (e.type === "cupid") {
          g.beginPath(); g.arc(e.cx, e.y, e.size * 0.78, 0, 6.28);
          g.strokeStyle = "rgba(255,92,138,.85)"; g.lineWidth = 2.5;
          g.setLineDash([5, 4]); g.lineDashOffset = -e.t * 30; g.stroke(); g.setLineDash([]);
        }
      });
      g.globalAlpha = 1;
      s.parts.forEach((p) => { g.globalAlpha = Math.max(p.life / p.max, 0); g.fillStyle = p.color; api.corazon(g, p.x, p.y, p.size); });
      g.globalAlpha = 1;
      s.floats.forEach((f) => {
        g.globalAlpha = Math.max(f.life / f.max, 0);
        g.font = f.script ? `700 ${f.size + 4}px ${api.MANO}` : `700 ${f.size}px ${api.NUM}`;
        g.lineWidth = 4; g.strokeStyle = dark() ? "rgba(0,0,0,.35)" : "rgba(255,255,255,.92)";
        g.strokeText(f.text, f.x, f.y);
        g.fillStyle = f.color; g.fillText(f.text, f.x, f.y);
      });
      g.globalAlpha = 1;

      // barra de tiempo, nivel, escapes y el récord a vencer
      const frac = Math.max(0, Math.min(1, s.timeLeft / GAME_TIME));
      g.fillStyle = dark() ? "rgba(255,255,255,.15)" : "rgba(184,40,90,.12)"; g.fillRect(0, 0, W, 6);
      const tg = g.createLinearGradient(0, 0, W, 0); tg.addColorStop(0, "#ff6f9c"); tg.addColorStop(1, "#2dd4bf");
      g.fillStyle = tg; g.fillRect(0, 0, W * frac, 6);
      const tenue = dark() ? "rgba(255,255,255,.72)" : "rgba(90,30,60,.6)";
      g.font = `600 11px ${api.NUM}`;
      g.fillStyle = tenue; g.textAlign = "left"; g.fillText("NIVEL " + s.level, 10, 20);
      g.textAlign = "right";
      g.fillStyle = s.escaped % ESCAPE_LIMIT >= ESCAPE_LIMIT - 2 ? (dark() ? "#ffe08a" : "#b7791f") : tenue;
      g.fillText("ESCAPES " + (s.escaped % ESCAPE_LIMIT) + "/" + ESCAPE_LIMIT, W - 10, 20);
      if (s.rival != null) {
        g.textAlign = "center";
        g.fillStyle = s.pasoRival ? (dark() ? "#ffe08a" : "#b7791f") : tenue;
        g.fillText(s.pasoRival ? `👑 Superaste a ${api.otro.nombre}` : `${api.otro.nombre}: ${s.rival.toLocaleString("es")}`, W / 2, 20);
      }
      g.textAlign = "center";

      if (s.banner > 0) {
        g.globalAlpha = Math.max(Math.min(1, s.banner / 0.4, (2.4 - s.banner) / 0.25), 0);
        const bw = Math.min(W - 30, 300), bh = 70, bx = (W - bw) / 2, by = H * 0.36 - bh / 2;
        g.fillStyle = dark() ? "rgba(255,255,255,.14)" : "rgba(143,29,74,.92)";
        rrect(bx, by, bw, bh, 18); g.fill();
        g.fillStyle = "#ffffff"; g.font = `700 19px ${api.NUM}`; g.fillText(s.bannerText, W / 2, by + 26);
        g.fillStyle = "#ffd6e3"; g.font = `700 20px ${api.MANO}`; g.fillText(s.bannerTip, W / 2, by + 50);
        g.globalAlpha = 1;
      }
      if (s.countdown > 0) {
        g.fillStyle = "rgba(255,255,255,.55)"; g.fillRect(-20, -20, W + 40, H + 40);
        const txt = s.lastCount || "3", ph = s.countdown % 1;
        g.save(); g.translate(W / 2, H / 2); g.scale(1 + ph * 0.4, 1 + ph * 0.4);
        g.font = `700 84px ${api.NUM}`; g.fillStyle = txt === "¡YA!" ? "#ff5c8a" : "#8f1d4a"; g.fillText(txt, 0, 0);
        g.restore();
      }
      if (s.flash > 0) {
        const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
        vg.addColorStop(0, "rgba(201,50,92,0)"); vg.addColorStop(1, "rgba(201,50,92," + s.flash * 0.9 + ")");
        g.fillStyle = vg; g.fillRect(-20, -20, W + 40, H + 40);
      }
      g.restore();
    }

    // ---------- inicio / fin ----------
    function iniciar() {
      ajustar();
      ach = leerLogros(api.yo.id);
      S = newState();
      running = true; paused = false;
      renderHud();
      last = performance.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    }
    function end() {
      running = false;
      cancelAnimationFrame(raf);
      draw();
      const s = S;
      if (s.rival != null && s.score > s.rival) unlock("rival");
      api.terminar({
        puntos: s.score,
        prefijo: s.lives <= 0 ? `Te quedaste sin vidas en el nivel ${s.level}.` : "",
        stats: [[s.maxCombo, "mejor racha"], [(s.taps ? Math.round((s.hits / s.taps) * 100) : 0) + "%", "precisión"], [s.level, "nivel"]],
        detalle: { nivel: s.level, racha: s.maxCombo, precision: s.taps ? Math.round((s.hits / s.taps) * 100) : 0 },
      });
    }

    drawIdle();
    return {
      iniciar,
      pausar() { paused = true; },
      reanudar() { paused = false; last = performance.now(); },
      detener() { running = false; cancelAnimationFrame(raf); cv.removeEventListener("pointerdown", tocar); },
      ajustar,
    };
  }
})();
