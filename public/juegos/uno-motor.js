// UNO 🃏 · el motor (sin pantalla)
// Las mismas reglas de supabase/uno.sql en JavaScript: el mazo, qué carta vale, qué hace cada una, los puntos, la
// compu y una "mesa" local que se porta igual que la base. La mesa local sirve para jugar contra la compu y para
// probar la pantalla en el computador sin tocar la base (dos pestañas: NosotrosJuegos.probar("uno") y
// NosotrosJuegos.probar("uno", { soy: "otro" })). uno.js es la pantalla.
// Cartas: color (r rojo, a amarillo, v verde, z azul) + valor (0–9, s salta, r reversa, d roba dos), y los comodines
// x (cambia el color) y x4 (roba cuatro). Entre dos, salta y reversa hacen lo mismo: vuelves a jugar.
(function (raiz) {
  "use strict";
  const COLORES = ["r", "a", "v", "z"];
  const NOMBRE_COLOR = { r: "rojo", a: "amarillo", v: "verde", z: "azul" };
  const VALORES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "s", "r", "d"];
  const esComodin = (c) => c === "x" || c === "x4";
  const colorDe = (c) => (esComodin(c) ? null : c[0]);
  const valorDe = (c) => (esComodin(c) ? c : c.slice(1));
  const azarDe = (azar) => azar || Math.random;

  // ---------- las cartas ----------
  // Las 108: por color, un 0 y dos de cada 1–9, salta, reversa y roba dos; y 4 comodines y 4 roba cuatro
  function mazoNuevo() {
    const m = [];
    COLORES.forEach((c) => VALORES.forEach((v) => { m.push(c + v); if (v !== "0") m.push(c + v); }));
    for (let i = 0; i < 4; i++) m.push("x", "x4");
    return m;
  }
  function barajar(cs, azar) {
    const a = cs.slice(), al = azarDe(azar);
    for (let i = a.length - 1; i > 0; i--) { const k = Math.floor(al() * (i + 1)); const t = a[i]; a[i] = a[k]; a[k] = t; }
    return a;
  }
  // Igual que uno_vale(): los comodines siempre; si no, mismo color o mismo número o símbolo (sobre un comodín solo
  // cuenta el color elegido)
  const vale = (c, arriba, color) => esComodin(c) || c[0] === color || (!esComodin(arriba) && c.slice(1) === arriba.slice(1));
  // Igual que uno_puntos(): el número, 20 las de acción y 50 los comodines
  const puntosDe = (cs) => cs.reduce((s, c) => s + (esComodin(c) ? 50 : "srd".indexOf(c[1]) >= 0 ? 20 : Number(c[1])), 0);
  function nombreCarta(c) {
    if (c === "x") return "comodín";
    if (c === "x4") return "comodín +4";
    const v = c.slice(1);
    return `${NOMBRE_COLOR[c[0]]} ${v === "s" ? "salta" : v === "r" ? "reversa" : v === "d" ? "+2" : v}`;
  }
  // Para mostrar la mano: por color y después por valor, los comodines al final
  const orden = (c) => (esComodin(c) ? 400 + (c === "x4" ? 1 : 0) : COLORES.indexOf(c[0]) * 100 + VALORES.indexOf(c.slice(1)));
  const ordenar = (cs) => cs.slice().sort((x, y) => orden(x) - orden(y));

  // ---------- la compu ----------
  // El color del que tiene más cartas (para los comodines)
  function elegirColor(mano, azar) {
    const n = { r: 0, a: 0, v: 0, z: 0 };
    mano.forEach((c) => { if (!esComodin(c)) n[c[0]]++; });
    const max = Math.max(n.r, n.a, n.v, n.z), mejores = COLORES.filter((c) => n[c] === max);
    return mejores[Math.floor(azarDe(azar)() * mejores.length)];
  }
  // Qué jugar: guarda los comodines para cuando hagan falta, bota primero las que valen más puntos y, si al otro le
  // quedan una o dos cartas, ataca con +4, +2, salta y reversa. Un poco de azar para que no sea predecible.
  // Devuelve { carta, color } o null (no tiene ninguna que valga: roba).
  function elegirJugada(mano, arriba, color, cartasOtro, azar) {
    const validas = mano.filter((c) => vale(c, arriba, color));
    if (!validas.length) return null;
    const al = azarDe(azar);
    const peso = (c) => {
      const v = valorDe(c), apurado = cartasOtro <= 2;
      let p = al() * 6;
      if (esComodin(c)) p -= c === "x4" ? 40 : 30;
      if (apurado) p += c === "x4" ? 90 : v === "d" ? 60 : v === "s" || v === "r" ? 40 : 0;
      else p += v === "d" ? 10 : v === "s" || v === "r" ? 7 : 0;
      if (!esComodin(c)) p += (/[0-9]/.test(v) ? Number(v) : 12) * 0.6 + mano.filter((x) => x[0] === c[0]).length * 2;
      return p;
    };
    const carta = validas.map((c) => [c, peso(c)]).sort((x, y) => y[1] - x[1])[0][0];
    return { carta, color: esComodin(carta) ? elegirColor(mano.filter((x) => x !== carta), azar) : null };
  }

  // ---------- las reglas (se portan igual que las funciones de uno.sql) ----------
  // j = { id, estado, creado_por, rival, turno, arriba, color, cartas: { usuario: n }, mazo, robo, uno_dicho, uno_pendiente,
  //       jugadas, ganador, puntos, rendido, apuesta, creado_en, actualizado_en, avisado_en,
  //       y lo secreto: manos: { usuario: [cartas] }, robadas: { usuario: carta }, baraja, pozo, log: [jugadas] }
  const ahoraIso = () => new Date().toISOString();
  const enJuego = (j) => !!j && j.estado === "jugando";
  const otroDe = (j, quien) => (j.creado_por === quien ? j.rival : j.creado_por);
  const esDeLaMesa = (j, quien) => j.creado_por === quien || j.rival === quien;
  // saca n del mazo para `quien` (si no alcanzan, se baraja el pozo y se pone debajo; se roba del final)
  function sacar(j, quien, n, azar) {
    if (j.baraja.length < n && j.pozo.length) { j.baraja = barajar(j.pozo, azar).concat(j.baraja); j.pozo = []; }
    const k = Math.min(n, j.baraja.length), nuevas = k ? j.baraja.splice(j.baraja.length - k, k) : [];
    j.manos[quien] = j.manos[quien].concat(nuevas);
    return nuevas;
  }
  // cuántas tiene cada uno y cuántas quedan; el "¡UNO!" solo cuenta para quien tiene dos o menos
  function contar(j) {
    j.cartas = {};
    Object.keys(j.manos).forEach((u) => (j.cartas[u] = j.manos[u].length));
    j.mazo = j.baraja.length;
    j.uno_dicho = j.uno_dicho.filter((u) => j.cartas[u] <= 2);
  }
  function anotar(j, quien, tipo, extra) {
    const d = Object.assign({ id: j.log.length + 1, juego_id: j.id, usuario_id: quien, tipo, carta: null, color: null, n: null, creado_en: ahoraIso() }, extra);
    j.log.push(d);
    return d;
  }
  const reglas = {
    crear(lista, yo, otro, apuesta, sigId, azar) {
      const vieja = lista.find(enJuego);
      if (vieja) return vieja;
      const baraja = barajar(mazoNuevo(), azar);
      const k = baraja.findIndex((c) => /^[ravz][0-9]$/.test(c)), arriba = baraja.splice(k, 1)[0];
      const j = {
        id: `local-${sigId}`, estado: "jugando", creado_por: yo, rival: otro, turno: azarDe(azar)() < 0.5 ? yo : otro,
        arriba, color: arriba[0], cartas: {}, mazo: 0, robo: null, uno_dicho: [], uno_pendiente: null, jugadas: 0,
        ganador: null, puntos: null, rendido: false, apuesta: String(apuesta || "").trim().slice(0, 120) || null,
        creado_en: ahoraIso(), actualizado_en: ahoraIso(), avisado_en: null,
        manos: { [yo]: baraja.slice(0, 7), [otro]: baraja.slice(7, 14) }, robadas: {}, baraja: baraja.slice(14), pozo: [], log: [],
      };
      contar(j);
      lista.unshift(j);
      return j;
    },
    // Igual que uno_jugar(): devuelve la jugada, o null si no valía
    jugar(j, quien, carta, color, azar) {
      if (!enJuego(j) || j.turno !== quien) return null;
      const mano = j.manos[quien], i = mano.indexOf(carta);
      if (i < 0 || (j.robo === quien && carta !== j.robadas[quien]) || !vale(carta, j.arriba, j.color)
          || (esComodin(carta) && COLORES.indexOf(color) < 0)) return null;
      const otro = otroDe(j, quien), habiaDicho = j.uno_dicho.indexOf(quien) >= 0;
      mano.splice(i, 1);
      j.robadas[quien] = null;
      j.pozo.push(j.arriba);
      if (carta === "x4") sacar(j, otro, 4, azar); else if (valorDe(carta) === "d") sacar(j, otro, 2, azar);
      const vuelve = carta === "x4" || ["s", "r", "d"].indexOf(valorDe(carta)) >= 0;
      const d = anotar(j, quien, "juega", { carta, color: esComodin(carta) ? color : null });
      j.arriba = carta; j.color = esComodin(carta) ? color : carta[0]; j.robo = null; j.jugadas++;
      contar(j);
      j.uno_pendiente = mano.length === 1 && !habiaDicho ? quien : null;
      if (!mano.length) { j.estado = "terminada"; j.ganador = quien; j.turno = null; j.puntos = puntosDe(j.manos[otro]); }
      else j.turno = vuelve ? quien : otro;
      j.actualizado_en = ahoraIso();
      return d;
    },
    // Igual que uno_robar(): { d, robada } o null
    robar(j, quien, azar) {
      if (!enJuego(j) || j.turno !== quien || j.robo) return null;
      const nuevas = sacar(j, quien, 1, azar), sirve = nuevas.length === 1 && vale(nuevas[0], j.arriba, j.color);
      j.robadas[quien] = sirve ? nuevas[0] : null;
      const d = anotar(j, quien, "roba", { n: nuevas.length });
      j.robo = sirve ? quien : null; j.turno = sirve ? quien : otroDe(j, quien);
      contar(j);
      j.uno_pendiente = null; j.actualizado_en = ahoraIso();
      return { d, robada: nuevas[0] || null };
    },
    pasar(j, quien) {
      if (!enJuego(j) || j.turno !== quien || j.robo !== quien) return null;
      j.robadas[quien] = null;
      const d = anotar(j, quien, "pasa", {});
      j.robo = null; j.turno = otroDe(j, quien); j.actualizado_en = ahoraIso();
      return d;
    },
    decir(j, quien) {
      if (!enJuego(j) || !esDeLaMesa(j, quien) || j.cartas[quien] > 2 || j.uno_dicho.indexOf(quien) >= 0) return null;
      const d = anotar(j, quien, "uno", {});
      j.uno_dicho.push(quien);
      if (j.uno_pendiente === quien) j.uno_pendiente = null;
      j.actualizado_en = ahoraIso();
      return d;
    },
    pillar(j, quien, azar) {
      if (!enJuego(j) || !esDeLaMesa(j, quien) || !j.uno_pendiente || j.uno_pendiente === quien) return null;
      sacar(j, j.uno_pendiente, 2, azar);
      const d = anotar(j, quien, "pilla", { n: 2 });
      contar(j);
      j.uno_pendiente = null; j.actualizado_en = ahoraIso();
      return d;
    },
    rendirse(j, quien) {
      if (!enJuego(j) || !esDeLaMesa(j, quien)) return null;
      if (j.jugadas > 0) { j.estado = "terminada"; j.ganador = otroDe(j, quien); j.rendido = true; } else j.estado = "cancelada";
      j.turno = null; j.robo = null; j.uno_pendiente = null; j.actualizado_en = ahoraIso();
      return j;
    },
    // Lo que se ve de una partida: todo menos las manos, el mazo y el pozo (como la tabla unos)
    fila(j) {
      const { manos, robadas, baraja, pozo, log, ...resto } = j;
      return JSON.parse(JSON.stringify(resto));
    },
  };

  // Una mesa local con su "base" en memoria o en localStorage (para dos pestañas), con la misma forma que el
  // adaptador de Supabase que usa la pantalla. `compu`: el id de la compu (juega sola cuando le toca y a veces pilla
  // al otro si no dijo "¡UNO!").
  function mesaLocal({ yo, otro, guardar, cargar, avisar, escucharCambios, compu, azar, pausa }) {
    let lista = cargar() || [];
    // antes de cada jugada se vuelve a leer: con dos pestañas, la otra pudo cambiar algo
    const releer = () => (lista = cargar() || []);
    const sigId = () => lista.reduce((m, b) => Math.max(m, Number(String(b.id).split("-")[1]) || 0), 0) + 1;
    const oyentes = new Set();
    const emitir = (tipo, f) => oyentes.forEach((fn) => { try { fn(tipo, f); } catch (e) {} });
    const buscar = (id) => lista.find((b) => b.id === id) || null;
    const persistir = (tipo, f) => { guardar(lista); emitir(tipo, f); if (avisar) avisar({ tipo, fila: f }); };
    // la otra pestaña cambió algo: se recarga y se avisa a la pantalla
    if (escucharCambios) escucharCambios((m) => { lista = cargar() || []; emitir(m.tipo, m.fila); });
    // como en la base: primero la jugada y después la partida
    function publicar(j, d) {
      if (d) persistir("jugada", Object.assign({}, d));
      persistir("uno", reglas.fila(j));
      programarCompu();
    }
    const respuesta = (j) => ({ juego: reglas.fila(j), mano: j.manos[yo].slice() });

    let espera = null, pensado = null;
    function programarCompu() {
      if (!compu || espera) return;
      const j = lista.find(enJuego);
      if (!j) return;
      const pillable = !!j.uno_pendiente && j.uno_pendiente !== compu && pensado !== `${j.id}:${j.actualizado_en}`;
      if (j.turno !== compu && !pillable) return;
      const t = pausa ? pausa() : j.turno === compu ? 900 + Math.random() * 700 : 1300 + Math.random() * 1300;
      espera = setTimeout(() => { espera = null; moverCompu(); programarCompu(); }, t);
    }
    function moverCompu() {
      releer();
      const j = lista.find(enJuego);
      if (!j) return;
      // ¿el otro quedó con una sin decir "¡UNO!"? la compu a veces se da cuenta
      if (j.uno_pendiente && j.uno_pendiente !== compu && pensado !== `${j.id}:${j.actualizado_en}`) {
        pensado = `${j.id}:${j.actualizado_en}`;
        if (azarDe(azar)() < 0.65) { const d = reglas.pillar(j, compu, azar); if (d) { publicar(j, d); return; } }
      }
      if (j.turno !== compu) return;
      if (j.robo === compu) {
        const c = j.robadas[compu];
        publicar(j, reglas.jugar(j, compu, c, esComodin(c) ? elegirColor(j.manos[compu].filter((x) => x !== c), azar) : null, azar));
        return;
      }
      const jug = elegirJugada(j.manos[compu], j.arriba, j.color, j.cartas[otroDe(j, compu)], azar);
      if (!jug) { const r = reglas.robar(j, compu, azar); publicar(j, r && r.d); return; }
      // con dos cartas dice "¡UNO!"… casi siempre (a veces se le olvida: ahí la puedes pillar)
      if (j.manos[compu].length === 2 && azarDe(azar)() < 0.85) { const du = reglas.decir(j, compu); if (du) persistir("jugada", Object.assign({}, du)); }
      publicar(j, reglas.jugar(j, compu, jug.carta, jug.color, azar));
    }

    return {
      modo: compu ? "compu" : "local",
      async activa() { releer(); const j = lista.find(enJuego); return j ? reglas.fila(j) : null; },
      async historial() { releer(); return lista.filter((j) => j.estado === "terminada").map(reglas.fila); },
      async crear(apuesta) {
        releer();
        const j = reglas.crear(lista, yo, otro, apuesta, sigId(), azar);
        publicar(j, null);
        return reglas.fila(j);
      },
      async jugar(id, carta, color) {
        releer();
        const j = buscar(id), d = j && reglas.jugar(j, yo, carta, color, azar);
        if (!d) return null;
        publicar(j, d);
        return respuesta(j);
      },
      async robar(id) {
        releer();
        const j = buscar(id), r = j && reglas.robar(j, yo, azar);
        if (!r) return null;
        publicar(j, r.d);
        return Object.assign(respuesta(j), { robada: r.robada });
      },
      async pasar(id) {
        releer();
        const j = buscar(id), d = j && reglas.pasar(j, yo);
        if (!d) return null;
        publicar(j, d);
        return respuesta(j);
      },
      async decir(id) {
        releer();
        const j = buscar(id);
        if (!j) return null;
        const d = reglas.decir(j, yo);
        if (d) publicar(j, d);
        return reglas.fila(j);
      },
      async pillar(id) {
        releer();
        const j = buscar(id), d = j && reglas.pillar(j, yo, azar);
        if (!d) return null;
        publicar(j, d);
        return reglas.fila(j);
      },
      async rendirse(id) {
        releer();
        const j = buscar(id);
        if (!j || !reglas.rendirse(j, yo)) return null;
        publicar(j, null);
        return reglas.fila(j);
      },
      async miMano(id) {
        releer();
        const j = buscar(id);
        return j && j.manos[yo] ? { cartas: j.manos[yo].slice(), robada: j.robadas[yo] || null } : null;
      },
      async manoRival(id) {
        releer();
        const j = buscar(id);
        return j && j.estado === "terminada" ? j.manos[otroDe(j, yo)].slice() : null;
      },
      async jugadas(id) { releer(); const j = buscar(id); return j ? j.log.map((d) => Object.assign({}, d)) : []; },
      escuchar(fn) { oyentes.add(fn); return () => oyentes.delete(fn); },
      // la compu retoma si la pantalla se abrió con una partida a medias
      reanudar() { releer(); programarCompu(); },
    };
  }

  const api = {
    COLORES, NOMBRE_COLOR, VALORES, esComodin, colorDe, valorDe, mazoNuevo, barajar, vale, puntosDe, nombreCarta, ordenar,
    elegirColor, elegirJugada, reglas, mesaLocal,
  };
  raiz.UnoMotor = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
