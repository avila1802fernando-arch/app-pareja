// Prueba public/juegos/uno-motor.js en Node: las cartas, las reglas (deben portarse igual que supabase/uno.sql,
// probada en uno.mjs), la compu y la mesa local.
//   node uno-motor.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const U = require("../../public/juegos/uno-motor.js");

let fallas = 0;
const ok = (cond, txt) => { console.log(`${cond ? "OK " : "MAL"} ${txt}`); if (!cond) fallas++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
// azar con semilla, para que las pruebas den siempre lo mismo
function semilla(s) { return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

// ---------- las cartas ----------
const m = U.mazoNuevo();
const cuenta = (pred) => m.filter(pred).length;
ok(m.length === 108 && ["r", "a", "v", "z"].every((c) => cuenta((x) => x[0] === c) === 25), "108 cartas, 25 de cada color");
ok(cuenta((x) => x === "x") === 4 && cuenta((x) => x === "x4") === 4 && cuenta((x) => x === "z0") === 1 && cuenta((x) => x === "zd") === 2, "4 comodines, 4 +4, un 0 y dos de cada una por color");
const b = U.barajar(m, semilla(3));
ok(b.slice().sort().join() === m.slice().sort().join() && b.join() !== m.join(), "barajar cambia el orden pero no las cartas");
ok(U.vale("r3", "r7", "r") && U.vale("z7", "r7", "r") && U.vale("x4", "r7", "r") && !U.vale("z3", "r7", "r"), "vale mismo color, mismo número o comodín");
ok(U.vale("zs", "rs", "r") && !U.vale("r4", "x4", "a") && U.vale("a4", "x4", "a"), "salta sobre salta; sobre un +4 solo el color elegido");
ok(U.puntosDe(["r7", "zs", "x4", "a0"]) === 77, "los puntos: 7 + 20 + 50 + 0");
ok(U.nombreCarta("rd") === "rojo +2" && U.nombreCarta("zs") === "azul salta" && U.nombreCarta("x4") === "comodín +4" && U.nombreCarta("a7") === "amarillo 7", "los nombres de las cartas");
ok(U.ordenar(["x", "z1", "r9", "rd", "a0", "x4", "r2"]).join() === "r2,r9,rd,a0,z1,x,x4", "la mano se ordena por color y valor, comodines al final");

// ---------- la compu ----------
ok(U.elegirJugada(["z3", "a5"], "r7", "r", 7, semilla(1)) === null, "sin ninguna que valga, la compu roba");
let jug = U.elegirJugada(["x", "r2", "z9"], "r7", "r", 7, semilla(1));
ok(jug && jug.carta === "r2", "guarda el comodín si tiene otra que sirve");
jug = U.elegirJugada(["r2", "rd", "x4"], "r7", "r", 1, semilla(1));
ok(jug && ["rd", "x4"].includes(jug.carta), `si al otro le queda una, ataca con +2 o +4 (${jug && jug.carta})`);
jug = U.elegirJugada(["r2", "x4"], "r7", "r", 1, semilla(1));
ok(jug && jug.carta === "x4" && ["r", "a", "v", "z"].includes(jug.color), "y si solo tiene el +4 para atacar, lo usa (con color)");
ok(U.elegirColor(["z1", "z5", "a2", "x"], semilla(2)) === "z", "elige el color del que tiene más");

// compu contra compu, muchas veces: nadie hace trampa, no se pierden cartas y siempre alguien gana
let partidas = 0, limpias = 0, jugadasTotal = 0, conservadas = true;
for (let n = 0; n < 300; n++) {
  const az = semilla(500 + n), lista = [];
  const j = U.reglas.crear(lista, "A", "B", null, 1, az);
  let pasos = 0, trampa = false;
  while (j.estado === "jugando" && pasos < 2000) {
    pasos++;
    const q = j.turno;
    if (j.robo === q) { const c = j.robadas[q]; if (!U.reglas.jugar(j, q, c, U.esComodin(c) ? "r" : null, az)) trampa = true; continue; }
    const e = U.elegirJugada(j.manos[q], j.arriba, j.color, j.cartas[q === "A" ? "B" : "A"], az);
    if (j.manos[q].length === 2 && az() < 0.5) U.reglas.decir(j, q);
    if (e) { if (!U.reglas.jugar(j, q, e.carta, e.color, az)) trampa = true; }
    else if (!U.reglas.robar(j, q, az)) trampa = true;
    if (j.uno_pendiente && az() < 0.5) U.reglas.pillar(j, j.uno_pendiente === "A" ? "B" : "A", az);
    const total = j.manos.A.length + j.manos.B.length + j.baraja.length + j.pozo.length + 1;
    if (total !== 108) conservadas = false;
  }
  partidas++;
  if (!trampa && j.estado === "terminada" && j.manos[j.ganador].length === 0) limpias++;
  jugadasTotal += j.jugadas;
}
ok(limpias === partidas, `300 partidas compu contra compu: todas terminan con un ganador y sin jugadas inválidas (${limpias})`);
ok(conservadas, "y en ningún momento se pierde o se duplica una carta (siempre 108)");
ok(jugadasTotal / partidas > 10 && jugadasTotal / partidas < 120, `una partida dura unas ${Math.round(jugadasTotal / partidas)} cartas jugadas`);

// ---------- la mesa local (igual que uno.sql) ----------
function mesa(yo, otro, compartida, extra = {}) {
  return U.mesaLocal({ yo, otro, guardar: (l) => (compartida.lista = l), cargar: () => compartida.lista, azar: semilla(9), ...extra });
}
// pone la mesa como se necesita para cada prueba
function poner(j, { fer, mar, arriba, color, turno, mazo = [], pozo = [] }) {
  Object.assign(j, { arriba, color: color || arriba[0], turno, robo: null, uno_dicho: [], uno_pendiente: null, robadas: {}, baraja: mazo.slice(), pozo: pozo.slice() });
  j.manos = { fer: fer.slice(), mar: mar.slice() };
  j.cartas = { fer: fer.length, mar: mar.length }; j.mazo = mazo.length;
}
const base = { lista: [] };
const fer = mesa("fer", "mar", base), mar = mesa("mar", "fer", base);
const p0 = await fer.crear("Quien pierde canta 🎤");
ok(p0.estado === "jugando" && p0.cartas.fer === 7 && p0.cartas.mar === 7 && p0.mazo === 93 && /^[ravz][0-9]$/.test(p0.arriba), "Fernando reta: 7 y 7, 93 en el mazo y un número arriba");
ok(!("manos" in p0) && !("baraja" in p0), "lo que se ve de la partida no trae las manos ni el mazo");
ok((await mar.crear(null)).id === p0.id, "una partida a la vez");
const mf = await fer.miMano(p0.id), mm = await mar.miMano(p0.id);
ok(mf.cartas.length === 7 && mm.cartas.length === 7 && mf.cartas.join() !== mm.cartas.join(), "cada uno ve su mano");
const j = base.lista[0];
poner(j, { fer: ["r3", "z7", "as", "x4", "z1"], mar: ["a5", "z9"], arriba: "r7", turno: "fer", mazo: ["a2", "v9", "z4", "r1", "a3", "v5"] });
ok((await mar.jugar(j.id, "a5")) === null && (await fer.jugar(j.id, "a9")) === null && (await fer.jugar(j.id, "z1")) === null, "fuera de turno, una que no tiene o una que no vale: no");
let res = await fer.jugar(j.id, "z7");
ok(res && res.juego.arriba === "z7" && res.juego.turno === "mar" && res.mano.length === 4, "azul 7 sobre rojo 7: le toca a Martina");
const hist = await mar.jugadas(j.id);
ok(hist.length === 1 && hist[0].carta === "z7" && hist[0].tipo === "juega", "la jugada queda anotada");
poner(j, { fer: ["rs", "rd", "x4", "x", "r5"], mar: ["a5"], arriba: "r7", turno: "fer", mazo: ["a2", "v9", "z4", "r1", "a3", "v5", "z8"] });
await fer.jugar(j.id, "rs");
ok(base.lista[0].turno === "fer", "salta: vuelve a jugar");
await fer.jugar(j.id, "rd");
ok(base.lista[0].turno === "fer" && base.lista[0].cartas.mar === 3, "+2: Martina roba dos");
ok((await fer.jugar(j.id, "x4")) === null, "comodín sin color: no");
await fer.jugar(j.id, "x4", "v");
ok(base.lista[0].color === "v" && base.lista[0].cartas.mar === 7 && base.lista[0].turno === "fer", "+4 verde: Martina roba cuatro");
await fer.jugar(j.id, "x", "a");
ok(base.lista[0].turno === "mar" && base.lista[0].color === "a", "comodín amarillo: le toca a Martina");
poner(j, { fer: ["r1", "z2"], mar: ["v1", "v2", "v3"], arriba: "r7", turno: "fer", mazo: ["a1", "r2"] });
res = await fer.robar(j.id);
ok(res.robada === "r2" && res.juego.robo === "fer" && res.juego.turno === "fer", "roba un rojo 2 que sirve");
ok((await fer.robar(j.id)) === null && (await fer.jugar(j.id, "r1")) === null, "no roba dos veces ni juega otra que no sea la robada");
res = await fer.pasar(j.id);
ok(res && res.juego.turno === "mar", "pasa: le toca a Martina");
res = await mar.robar(j.id);
ok(res.robada === "a1" && res.juego.turno === "fer" && res.juego.robo === null, "Martina roba una que no sirve: le toca a Fernando");
poner(j, { fer: ["r1", "r2"], mar: ["a1", "a2", "a3"], arriba: "r7", turno: "fer", mazo: ["v1", "v2", "v3"] });
await fer.jugar(j.id, "r1");
ok(base.lista[0].uno_pendiente === "fer" && (await fer.pillar(j.id)) === null, "queda con una sin decir ¡UNO!: no se puede pillar a sí mismo…");
await mar.pillar(j.id);
ok(base.lista[0].cartas.fer === 3 && base.lista[0].uno_pendiente === null, "…pero Martina lo pilla: roba dos");
poner(j, { fer: ["r1", "r2"], mar: ["a1", "a2", "r3"], arriba: "r7", turno: "fer", mazo: ["v1", "v2"] });
await fer.decir(j.id);
await fer.jugar(j.id, "r1");
ok(base.lista[0].uno_pendiente === null, "si lo dice antes, no lo pueden pillar");
poner(j, { fer: ["r1", "r2"], mar: ["a1", "a2", "r3"], arriba: "r7", turno: "fer", mazo: ["v1", "v2"] });
await fer.jugar(j.id, "r1");
await mar.jugar(j.id, "r3");
ok(base.lista[0].uno_pendiente === null && (await mar.pillar(j.id)) === null, "si Martina juega sin pillarlo, se le pasó");
poner(j, { fer: ["rd"], mar: ["a5", "zs", "x"], arriba: "r7", turno: "fer", mazo: ["v1", "v9"] });
res = await fer.jugar(j.id, "rd");
ok(res.juego.estado === "terminada" && res.juego.ganador === "fer" && res.juego.puntos === 85, `gana con su último +2 y se lleva 85 puntos (${res.juego.puntos})`);
ok((await fer.manoRival(j.id)).length === 5 && (await mar.activa()) === null && (await fer.historial()).length === 1, "al final se ve lo que le quedó al otro y queda en el historial");
const p2 = await mar.crear(null);
ok(p2.id !== p0.id && base.lista.filter((x) => x.id === p2.id).length === 1, "la nueva no repite el número");
poner(base.lista[0], { fer: ["rd", "r5"], mar: ["a1"], arriba: "r7", turno: "fer", mazo: ["z1"], pozo: ["v1", "v2", "v3", "v4"] });
await fer.jugar(p2.id, "rd");
const j2 = base.lista[0];
ok(j2.manos.mar.length === 3 && j2.pozo.length === 0 && j2.baraja.length === 4, "se acabó el mazo: se baraja el pozo y Martina roba igual");
ok((await mar.rendirse(p2.id)).ganador === "fer", "rendirse con la partida empezada: gana el otro");
const p3 = await fer.crear(null);
ok((await fer.rendirse(p3.id)).estado === "cancelada", "sin ninguna carta jugada, rendirse cancela");

// ---------- contra la compu ----------
const solo = { lista: [] };
const yo = mesa("fer", "compu", solo, { compu: "compu", pausa: () => 0 });
const pc = await yo.crear(null);
ok(pc.estado === "jugando" && pc.cartas.compu === 7, "una partida contra la compu");
let vueltas = 0;
while (solo.lista[0].estado === "jugando" && vueltas++ < 3000) {
  const t = solo.lista[0];
  if (t.turno === "fer") {
    if (t.robo === "fer") { const c = t.robadas.fer; await yo.jugar(t.id, c, U.esComodin(c) ? "r" : null); }
    else {
      const e = U.elegirJugada(t.manos.fer, t.arriba, t.color, t.cartas.compu);
      if (t.manos.fer.length === 2) await yo.decir(t.id);
      if (e) await yo.jugar(t.id, e.carta, e.color); else await yo.robar(t.id);
    }
  }
  await espera(1);
}
const fin = solo.lista[0];
ok(fin.estado === "terminada" && ["fer", "compu"].includes(fin.ganador), `contra la compu se juega hasta el final (ganó: ${fin.ganador})`);
ok(fin.log.some((d) => d.usuario_id === "compu" && d.tipo === "juega"), "la compu juega sola cuando le toca");

console.log(fallas ? `\n${fallas} PRUEBA(S) FALLARON` : "\nTodo bien ✓");
process.exit(fallas ? 1 : 0);
