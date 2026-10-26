// Batalla naval ⚓ · el motor (sin pantalla)
// Las mismas reglas de supabase/batalla.sql en JavaScript: armar y validar flotas, resolver disparos, la compu
// y una "mesa" local que se porta igual que la base. La mesa local sirve para jugar contra la compu y para probar
// la pantalla en el computador sin tocar la base (dos pestañas: NosotrosJuegos.probar("batalla") y
// NosotrosJuegos.probar("batalla", { soy: "otro" })). batalla.js es la pantalla.
// El tablero es de 10 × 10; cada celda es fila * 10 + columna (0 = A1, 99 = J10). La flota: 5, 4, 3, 3 y 2.
(function (raiz) {
  "use strict";
  const LADO = 10, TAMANOS = [5, 4, 3, 3, 2], TOTAL = 17;
  const NOMBRES = ["Portaaviones", "Acorazado", "Crucero", "Submarino", "Lancha"];
  const LETRAS = "ABCDEFGHIJ";
  const fila = (c) => Math.floor(c / LADO);
  const col = (c) => c % LADO;
  const nombreCelda = (c) => `${LETRAS[col(c)]}${fila(c) + 1}`;
  const enTablero = (c) => Number.isInteger(c) && c >= 0 && c < LADO * LADO;
  const azarEntero = (n, azar) => Math.floor((azar || Math.random)() * n);

  // ---------- la flota ----------
  const barcoDe = (inicio, tam, vertical) => Array.from({ length: tam }, (_, i) => inicio + i * (vertical ? LADO : 1));
  const cabe = (inicio, tam, vertical) => enTablero(inicio) && (vertical ? fila(inicio) + tam <= LADO : col(inicio) + tam <= LADO);
  const esVertical = (b) => b.length > 1 && b[1] - b[0] === LADO;
  function vecinos(c) {
    const v = [];
    for (let df = -1; df <= 1; df++) for (let dc = -1; dc <= 1; dc++) {
      if (!df && !dc) continue;
      const f = fila(c) + df, k = col(c) + dc;
      if (f >= 0 && f < LADO && k >= 0 && k < LADO) v.push(f * LADO + k);
    }
    return v;
  }

  // Igual que batalla_flota_valida(): 5 barcos de 5, 4, 3, 3 y 2 (en ese orden: el índice dice cuál es), derechos,
  // dentro y sin pisarse
  function flotaValida(barcos) {
    if (!Array.isArray(barcos) || barcos.length !== TAMANOS.length) return false;
    const todas = new Set(), tam = [];
    for (const b of barcos) {
      if (!Array.isArray(b) || !b.every(enTablero)) return false;
      const s = [...new Set(b)].sort((x, y) => x - y), n = s.length;
      if (n !== b.length || n < 2 || n > 5) return false;
      const enFila = fila(s[0]) === fila(s[n - 1]) && s[n - 1] - s[0] === n - 1;
      const enColumna = s.every((c) => col(c) === col(s[0])) && s[n - 1] - s[0] === (n - 1) * LADO;
      if (!enFila && !enColumna) return false;
      tam.push(n); s.forEach((c) => todas.add(c));
    }
    return tam.join() === TAMANOS.join() && todas.size === TOTAL;
  }

  // Una flota al azar. Con `separados`, los barcos no se tocan ni en diagonal (se ve más ordenado y es lo clásico).
  function flotaAlAzar(azar, separados = true) {
    for (let intento = 0; intento < 300; intento++) {
      const ocupadas = new Set(), cerca = new Set(), barcos = [];
      for (let i = 0; i < TAMANOS.length; i++) {
        const tam = TAMANOS[i];
        let puesto = false;
        for (let k = 0; k < 300 && !puesto; k++) {
          const vertical = azarEntero(2, azar) === 1, inicio = azarEntero(LADO * LADO, azar);
          if (!cabe(inicio, tam, vertical)) continue;
          const b = barcoDe(inicio, tam, vertical);
          if (b.some((c) => ocupadas.has(c) || (separados && cerca.has(c)))) continue;
          b.forEach((c) => { ocupadas.add(c); cerca.add(c); vecinos(c).forEach((v) => cerca.add(v)); });
          barcos.push(b);
          puesto = true;
        }
        if (!puesto) break; // no entró: se vuelve a empezar la flota
      }
      if (barcos.length === TAMANOS.length) return barcos;
    }
    return flotaAlAzar(azar, false);
  }

  // Mover el barco i a otra celda de inicio (y orientación). Devuelve la flota nueva, o null si no cabe o pisa a otro.
  function moverBarco(barcos, i, inicio, vertical) {
    const tam = barcos[i].length;
    if (!cabe(inicio, tam, vertical)) return null;
    const nuevo = barcoDe(inicio, tam, vertical);
    const otras = new Set(barcos.filter((_, j) => j !== i).flat());
    if (nuevo.some((c) => otras.has(c))) return null;
    return barcos.map((b, j) => (j === i ? nuevo : b.slice()));
  }
  // Girar el barco i (de horizontal a vertical o al revés) desde su primera celda; si no cabe, se corre hacia atrás
  function girarBarco(barcos, i) {
    const b = barcos[i], vertical = !esVertical(b), tam = b.length, inicio = Math.min(...b);
    for (let atras = 0; atras < tam; atras++) {
      const nuevoInicio = vertical ? inicio - atras * LADO : inicio - atras;
      if (!vertical && fila(nuevoInicio) !== fila(inicio)) break;
      const r = moverBarco(barcos, i, nuevoInicio, vertical);
      if (r) return r;
    }
    return null;
  }

  // ---------- disparos ----------
  // Igual que batalla_disparar(): agua, tocado, o hundido (con las celdas del barco y cuál era)
  function resolver(barcos, previas, celda) {
    const mias = new Set(previas); mias.add(celda);
    for (let i = 0; i < barcos.length; i++) {
      const b = barcos[i];
      if (!b.includes(celda)) continue;
      return b.every((c) => mias.has(c)) ? { resultado: "hundido", barco: b.slice(), barco_n: i } : { resultado: "tocado", barco: null, barco_n: null };
    }
    return { resultado: "agua", barco: null, barco_n: null };
  }
  // Qué barcos de una flota ya se hundieron con estos disparos
  const hundidos = (barcos, celdas) => { const s = new Set(celdas); return barcos.map((b) => b.every((c) => s.has(c))); };

  // ---------- la compu ----------
  // Caza en tablero de ajedrez (el barco más chico mide 2) y, cuando toca algo, lo persigue hasta hundirlo.
  // De vez en cuando dispara al azar, para que no sea imbatible.
  function elegirDisparo(disparos, azar) {
    const hechos = new Set(disparos.map((d) => d.celda));
    const hundidas = new Set(disparos.filter((d) => d.barco).flatMap((d) => d.barco));
    const libre = (c) => enTablero(c) && !hechos.has(c);
    const elegir = (lista) => lista[azarEntero(lista.length, azar)];
    const heridas = disparos.filter((d) => d.resultado !== "agua" && !hundidas.has(d.celda)).map((d) => d.celda);
    if (heridas.length) {
      let opciones = [];
      if (heridas.length >= 2) {
        if (heridas.every((c) => fila(c) === fila(heridas[0]))) {
          const cs = heridas.map(col), f = fila(heridas[0]);
          opciones = [Math.min(...cs) - 1, Math.max(...cs) + 1].filter((k) => k >= 0 && k < LADO).map((k) => f * LADO + k).filter(libre);
        } else if (heridas.every((c) => col(c) === col(heridas[0]))) {
          opciones = [Math.min(...heridas) - LADO, Math.max(...heridas) + LADO].filter(libre);
        }
      }
      if (!opciones.length) {
        opciones = heridas.flatMap((c) => [c - LADO, c + LADO, col(c) > 0 ? c - 1 : -1, col(c) < LADO - 1 ? c + 1 : -1]).filter(libre);
      }
      if (opciones.length) return elegir(opciones);
    }
    const todas = Array.from({ length: LADO * LADO }, (_, c) => c).filter(libre);
    if ((azar || Math.random)() < 0.2) return elegir(todas);
    const alrededor = new Set([...hundidas].flatMap(vecinos));
    const caza = todas.filter((c) => (fila(c) + col(c)) % 2 === 0 && !alrededor.has(c));
    return elegir(caza.length ? caza : todas);
  }

  // ---------- la mesa local (se porta igual que las funciones de batalla.sql) ----------
  // b = { id, estado, creado_por, rival, listos, turno, ganador, rendido, apuesta, creado_en, actualizado_en,
  //       flotas: { [usuario]: barcos }, disparos: [{ id, usuario_id, celda, resultado, barco, barco_n, creado_en }] }
  const ahoraIso = () => new Date().toISOString();
  const activa = (b) => b && (b.estado === "colocando" || b.estado === "jugando");
  const reglas = {
    crear(lista, yo, otro, apuesta, sigId) {
      const vieja = lista.find(activa);
      if (vieja) return vieja;
      const b = {
        id: `local-${sigId}`, estado: "colocando", creado_por: yo, rival: otro, listos: [], turno: null, ganador: null, rendido: false,
        apuesta: (String(apuesta || "").trim().slice(0, 120)) || null, creado_en: ahoraIso(), actualizado_en: ahoraIso(), flotas: {}, disparos: [],
      };
      lista.unshift(b);
      return b;
    },
    colocar(b, quien, barcos, azar) {
      if (!b || ![b.creado_por, b.rival].includes(quien) || b.estado !== "colocando") return b;
      if (!flotaValida(barcos)) throw new Error("flota no válida");
      b.flotas[quien] = barcos.map((x) => x.slice());
      if (!b.listos.includes(quien)) b.listos.push(quien);
      if (b.listos.length >= 2) { b.estado = "jugando"; b.turno = (azar || Math.random)() < 0.5 ? b.creado_por : b.rival; }
      b.actualizado_en = ahoraIso();
      return b;
    },
    disparar(b, quien, celda) {
      if (!b || b.estado !== "jugando" || b.turno !== quien || !enTablero(celda)) return null;
      if (b.disparos.some((d) => d.usuario_id === quien && d.celda === celda)) return null;
      const otro = b.creado_por === quien ? b.rival : b.creado_por;
      const previas = b.disparos.filter((d) => d.usuario_id === quien).map((d) => d.celda);
      const { resultado, barco, barco_n } = resolver(b.flotas[otro], previas, celda);
      const d = { id: b.disparos.length + 1, batalla_id: b.id, usuario_id: quien, celda, resultado, barco, barco_n, creado_en: ahoraIso() };
      b.disparos.push(d);
      const aciertos = b.disparos.filter((x) => x.usuario_id === quien && x.resultado !== "agua").length;
      if (aciertos >= TOTAL) { b.estado = "terminada"; b.ganador = quien; b.turno = null; }
      else if (resultado === "agua") b.turno = otro;
      b.actualizado_en = ahoraIso();
      return d;
    },
    rendirse(b, quien) {
      if (!b || ![b.creado_por, b.rival].includes(quien) || !activa(b)) return null;
      if (b.estado === "jugando") { b.estado = "terminada"; b.ganador = b.creado_por === quien ? b.rival : b.creado_por; b.rendido = true; }
      else b.estado = "cancelada";
      b.turno = null; b.actualizado_en = ahoraIso();
      return b;
    },
    // Lo que una persona puede ver de una batalla: la fila (sin flotas) y, de las flotas, solo la suya
    // (y la del otro cuando ya terminó, como batalla_flota_rival)
    fila(b) { const { flotas, disparos, ...resto } = b; return { ...resto, listos: b.listos.slice() }; },
  };

  // Una mesa local con su "base" en memoria o en localStorage (para dos pestañas), con la misma forma que el
  // adaptador de Supabase que usa la pantalla: activa, crear, colocar, disparar, rendirse, miFlota, flotaRival,
  // disparos, historial y escuchar. `compu`: el id de la compu (juega sola cuando le toca).
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

    let compuEsperando = null;
    function turnoCompu(b) {
      if (!compu || !b || b.estado !== "jugando" || b.turno !== compu || compuEsperando) return;
      compuEsperando = setTimeout(() => {
        compuEsperando = null;
        releer();
        const actual = buscar(b.id);
        if (!actual || actual.estado !== "jugando" || actual.turno !== compu) return;
        const mios = actual.disparos.filter((d) => d.usuario_id === compu);
        const d = reglas.disparar(actual, compu, elegirDisparo(mios, azar));
        if (d) { persistir("disparo", d); persistir("batalla", reglas.fila(actual)); }
        turnoCompu(actual);
      }, pausa ? pausa() : 900 + Math.random() * 700);
    }

    return {
      modo: compu ? "compu" : "local",
      async activa() { releer(); const b = lista.find(activa); return b ? reglas.fila(b) : null; },
      async historial() { releer(); return lista.filter((b) => b.estado === "terminada").map(reglas.fila); },
      async crear(apuesta) {
        releer();
        const b = reglas.crear(lista, yo, otro, apuesta, sigId());
        if (compu && !b.flotas[compu]) reglas.colocar(b, compu, flotaAlAzar(azar), azar);
        persistir("batalla", reglas.fila(b));
        return reglas.fila(b);
      },
      async colocar(id, barcos) {
        releer();
        const b = buscar(id);
        reglas.colocar(b, yo, barcos, azar);
        if (b) persistir("batalla", reglas.fila(b));
        turnoCompu(b);
        return b ? reglas.fila(b) : null;
      },
      async disparar(id, celda) {
        releer();
        const b = buscar(id), d = reglas.disparar(b, yo, celda);
        if (!d) return null;
        persistir("disparo", d); persistir("batalla", reglas.fila(b));
        turnoCompu(b);
        return d;
      },
      async rendirse(id) {
        releer();
        const b = buscar(id), r = reglas.rendirse(b, yo);
        if (r) persistir("batalla", reglas.fila(r));
        return r ? reglas.fila(r) : null;
      },
      async miFlota(id) { releer(); const b = buscar(id); return b && b.flotas[yo] ? b.flotas[yo].map((x) => x.slice()) : null; },
      async flotaRival(id) {
        releer();
        const b = buscar(id);
        if (!b || b.estado !== "terminada") return null;
        const o = b.creado_por === yo ? b.rival : b.creado_por;
        return b.flotas[o] ? b.flotas[o].map((x) => x.slice()) : null;
      },
      async disparos(id) { releer(); const b = buscar(id); return b ? b.disparos.map((d) => ({ ...d })) : []; },
      escuchar(fn) { oyentes.add(fn); return () => oyentes.delete(fn); },
      // la compu retoma su turno si la pantalla se abrió con una batalla a medias
      reanudar() { releer(); const b = lista.find(activa); if (b) turnoCompu(b); },
    };
  }

  const api = {
    LADO, TAMANOS, TOTAL, NOMBRES, LETRAS, fila, col, nombreCelda, barcoDe, cabe, esVertical, vecinos,
    flotaValida, flotaAlAzar, moverBarco, girarBarco, resolver, hundidos, elegirDisparo, reglas, mesaLocal,
  };
  raiz.BatallaMotor = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
