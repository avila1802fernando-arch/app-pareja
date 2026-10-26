// Prueba public/juegos/batalla-motor.js en Node: flotas al azar, validar, mover y girar, disparos, la compu y la
// mesa local (que debe portarse igual que supabase/batalla.sql, probada en batalla.mjs).
//   node batalla-motor.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const M = require("../../public/juegos/batalla-motor.js");

let fallas = 0;
const ok = (cond, txt) => { console.log(`${cond ? "OK " : "MAL"} ${txt}`); if (!cond) fallas++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
// azar con semilla, para que las pruebas den siempre lo mismo
function semilla(s) { return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

// ---------- flotas ----------
let validas = 0, separadas = 0;
const distintas = new Set();
const az = semilla(7);
for (let i = 0; i < 2000; i++) {
  const f = M.flotaAlAzar(az);
  if (M.flotaValida(f)) validas++;
  const celdas = new Set(f.flat());
  const tocan = f.some((b, j) => b.some((c) => M.vecinos(c).some((v) => celdas.has(v) && !b.includes(v))));
  if (!tocan) separadas++;
  distintas.add(JSON.stringify(f));
}
ok(validas === 2000, `2.000 flotas al azar, todas válidas (${validas})`);
ok(separadas === 2000, `y ningún barco toca a otro, ni en diagonal (${separadas})`);
ok(distintas.size > 1990, `y salen distintas (${distintas.size} diferentes)`);

const FLOTA_F = [[0, 1, 2, 3, 4], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [80, 81]];
const FLOTA_M = [[9, 19, 29, 39, 49], [7, 17, 27, 37], [55, 56, 57], [75, 76, 77], [95, 96]];
ok(M.flotaValida(FLOTA_F) && M.flotaValida(FLOTA_M), "las flotas de la prueba del SQL son válidas");
ok(!M.flotaValida([[0, 1, 2, 3, 4], [3, 13, 23, 33], [40, 41, 42], [60, 61, 62], [80, 81]]), "barcos que se pisan: no");
ok(!M.flotaValida([[0, 1, 2, 3, 4], [20, 21, 22, 23], [40, 51, 60], [65, 66, 67], [80, 81]]), "celdas sueltas (A5, B6, A7): no");
ok(!M.flotaValida([[8, 9, 10], [0, 1, 2, 3, 4], [20, 21, 22, 23], [60, 61, 62], [80, 81]]), "un barco que cruza de fila: no");
ok(!M.flotaValida([[0, 1, 2, 3], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [80, 81]]), "tamaños equivocados: no");
ok(!M.flotaValida([[0, 1, 2, 3, 4], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [99, 100]]), "fuera del tablero: no");
ok(!M.flotaValida([[0, 1, 2, 3, 4], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [80, 80]]), "celda repetida: no");
ok(!M.flotaValida([[0, 1, 2, 3, "4"], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [80, 81]]), "algo que no es número: no");
ok(!M.flotaValida([[80, 81], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [0, 1, 2, 3, 4]]), "fuera de orden (la lancha primero): no");

// ---------- mover y girar ----------
let f = M.moverBarco(FLOTA_F, 4, 88, false);
ok(f && JSON.stringify(f[4]) === "[88,89]" && M.flotaValida(f), "mover la lancha a I9");
ok(M.moverBarco(FLOTA_F, 4, 89, false) === null, "no se puede mover fuera del tablero");
ok(M.moverBarco(FLOTA_F, 4, 1, true) === null, "no se puede mover encima de otro barco");
ok(M.girarBarco(FLOTA_F, 0) === null, "girar el portaaviones de A1 pisaría al acorazado: no se puede");
f = M.girarBarco([[5, 6, 7, 8, 9], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [80, 81]], 3);
ok(f && M.esVertical(f[3]) && M.flotaValida(f), "girar el submarino de A7: queda vertical y válido");
f = M.girarBarco([[0, 1, 2, 3, 4], [20, 21, 22, 23], [40, 41, 42], [50, 51, 52], [93, 94]], 4);
ok(f && M.esVertical(f[4]) && M.flotaValida(f), "girar la lancha de la última fila: se corre hacia arriba para caber");

// ---------- disparos ----------
ok(M.resolver(FLOTA_F, [], 50).resultado === "agua", "A6: agua");
ok(M.resolver(FLOTA_F, [], 80).resultado === "tocado", "A9: tocado");
const h = M.resolver(FLOTA_F, [80], 81);
ok(h.resultado === "hundido" && JSON.stringify(h.barco) === "[80,81]" && h.barco_n === 4, "B9 después de A9: hundida la lancha (el barco 4)");
ok(M.resolver(FLOTA_F, [60, 61], 62).barco_n === 3 && M.resolver(FLOTA_F, [40, 41], 42).barco_n === 2, "el submarino y el crucero (los dos de 3) no se confunden");
ok(M.nombreCelda(0) === "A1" && M.nombreCelda(99) === "J10" && M.nombreCelda(16) === "G2", "nombres de celdas: A1, J10, G2");

// ---------- la compu ----------
const tiros = [];
for (let juego = 0; juego < 300; juego++) {
  const az2 = semilla(100 + juego), flota = M.flotaAlAzar(az2), disparos = [];
  let n = 0;
  while (n < 100) {
    const c = M.elegirDisparo(disparos, az2);
    if (disparos.some((d) => d.celda === c)) { n = 999; break; }
    const r = M.resolver(flota, disparos.map((d) => d.celda), c);
    disparos.push({ celda: c, ...r }); n++;
    if (disparos.filter((d) => d.resultado !== "agua").length === 17) break;
  }
  tiros.push(n);
}
const prom = tiros.reduce((a, b) => a + b, 0) / tiros.length;
ok(tiros.every((n) => n <= 100), "la compu nunca repite celda y siempre termina");
ok(prom > 40 && prom < 70, `la compu hunde una flota en ${prom.toFixed(1)} disparos en promedio (ni tonta ni imbatible)`);
const tocada = [{ celda: 44, resultado: "tocado", barco: null }];
ok([34, 54, 43, 45].includes(M.elegirDisparo(tocada, semilla(3))), "si tocó algo, el siguiente disparo va al lado");
const enLinea = [{ celda: 44, resultado: "tocado", barco: null }, { celda: 45, resultado: "tocado", barco: null }];
ok([43, 46].includes(M.elegirDisparo(enLinea, semilla(4))), "con dos aciertos en fila, sigue por esa fila");

// ---------- la mesa local (igual que batalla.sql) ----------
function mesa(yo, otro, compartida, extra = {}) {
  return M.mesaLocal({ yo, otro, guardar: (l) => (compartida.lista = l), cargar: () => compartida.lista, azar: semilla(9), ...extra });
}
const base = { lista: [] };
const fer = mesa("fer", "mar", base), mar = mesa("mar", "fer", base);
const b = await fer.crear("Quien pierde canta 🎤");
ok(b.estado === "colocando" && b.creado_por === "fer" && b.rival === "mar", "Fernando reta a Martina");
ok((await mar.crear(null)).id === b.id, "una batalla a la vez");
let err = null;
try { await fer.colocar(b.id, [[0, 1]]); } catch (e) { err = e; }
ok(!!err, "una flota mal armada se rechaza");
await fer.colocar(b.id, FLOTA_F);
ok((await mar.miFlota(b.id)) === null && JSON.stringify(await fer.miFlota(b.id)) === JSON.stringify(FLOTA_F), "cada uno ve solo su flota");
ok((await fer.disparar(b.id, 9)) === null, "no se dispara antes de que estén los dos");
const r = await mar.colocar(b.id, FLOTA_M);
ok(r.estado === "jugando" && ["fer", "mar"].includes(r.turno), "con los dos listos empieza, turno al azar");
base.lista[0].turno = "fer";
ok((await mar.disparar(b.id, 0)) === null, "quien no tiene el turno no dispara");
ok((await fer.disparar(b.id, 50)).resultado === "agua" && base.lista[0].turno === "mar", "agua: le toca al otro");
ok((await mar.disparar(b.id, 0)).resultado === "tocado" && base.lista[0].turno === "mar", "tocado: sigue disparando");
for (const c of [1, 2, 3]) await mar.disparar(b.id, c);
const hund = await mar.disparar(b.id, 4);
ok(hund.resultado === "hundido" && hund.barco.length === 5, "hunde el portaaviones");
ok((await mar.disparar(b.id, 4)) === null, "no se repite una celda");
await mar.disparar(b.id, 99);
ok((await fer.flotaRival(b.id)) === null, "en plena batalla no se ve la flota del otro");
for (const c of FLOTA_M.flat()) await fer.disparar(b.id, c);
const fin = await fer.activa();
ok(fin === null && base.lista[0].estado === "terminada" && base.lista[0].ganador === "fer", "con 17 aciertos gana Fernando");
ok(JSON.stringify(await mar.flotaRival(b.id)) === JSON.stringify(FLOTA_F), "al terminar se ve la flota del otro");
ok((await fer.historial()).length === 1, "queda en el historial (para el marcador)");
const b2 = await mar.crear(null);
ok(b2.id !== b.id && base.lista.filter((x) => x.id === b2.id).length === 1, "la batalla nueva de la otra pestaña no repite el número");
ok((await fer.rendirse(b2.id)).estado === "cancelada", "rendirse mientras acomodan: se cancela");
const b3 = await fer.crear(null);
await fer.colocar(b3.id, FLOTA_F); await mar.colocar(b3.id, FLOTA_M);
const rr = await mar.rendirse(b3.id);
ok(rr.estado === "terminada" && rr.ganador === "fer" && rr.rendido, "rendirse jugando: gana el otro");

// ---------- contra la compu ----------
const solo = { lista: [] };
const yo = mesa("fer", "compu", solo, { compu: "compu", pausa: () => 0 });
const bc = await yo.crear(null);
ok(bc.listos.includes("compu"), "la compu acomoda su flota al tiro");
await yo.colocar(bc.id, M.flotaAlAzar(semilla(21)));
let vueltas = 0;
while (solo.lista[0].estado === "jugando" && vueltas++ < 500) {
  if (solo.lista[0].turno === "fer") {
    const hechos = new Set(solo.lista[0].disparos.filter((d) => d.usuario_id === "fer").map((d) => d.celda));
    const c = Array.from({ length: 100 }, (_, i) => i).find((i) => !hechos.has(i));
    await yo.disparar(bc.id, c);
  }
  await espera(1);
}
const t = solo.lista[0];
ok(t.estado === "terminada" && ["fer", "compu"].includes(t.ganador), `contra la compu se juega hasta el final (ganó: ${t.ganador})`);
ok(t.disparos.some((d) => d.usuario_id === "compu"), "la compu dispara sola cuando le toca");

console.log(fallas ? `\n${fallas} PRUEBA(S) FALLARON` : "\nTodo bien ✓");
process.exit(fallas ? 1 : 0);
