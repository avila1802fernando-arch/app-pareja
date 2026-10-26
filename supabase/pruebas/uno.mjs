// Prueba uno.sql en un Postgres local (PGlite, sin Docker y sin tocar la base real): manos secretas, el mazo que no lee
// nadie, jugadas válidas, salta/reversa/+2/+4, robar, "¡UNO!" y pillar, ganar con puntos, volver a barajar y avisos.
//   npm install && node uno.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
const leer = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const ID = { fer: "f1", mar: "a2", eli: "e1", suelta: "c3" };
const uid = (k) => `00000000-0000-0000-0000-0000000000${ID[k]}`;
let fallas = 0;
const ok = (cond, txt) => { console.log(`${cond ? "OK " : "MAL"} ${txt}`); if (!cond) fallas++; };
async function como(quien, sql, params = []) {
  await db.exec("reset role");
  if (quien === "anon") { await db.exec("set role anon"); await db.query("select set_config('test.uid', '', false)"); }
  else { await db.exec("set role authenticated"); await db.query("select set_config('test.uid', $1, false)", [uid(quien)]); }
  try { return await db.query(sql, params); } finally { await db.exec("reset role"); }
}
const fila = async (quien, sql, params) => (await como(quien, sql, params)).rows[0];
async function falla(quien, sql, params) { try { await como(quien, sql, params); return false; } catch (e) { return e.message; } }
const r = async (quien, fn, ...args) => {
  const marcas = args.map((_, i) => `$${i + 1}`).join(", ");
  return (await fila(quien, `select public.${fn}(${marcas}) as r`, args)).r;
};
const partida = async (id) => (await db.query("select * from public.unos where id = $1", [id])).rows[0];
const manoDe = async (id, k) => (await db.query("select cartas from public.uno_manos where juego_id = $1 and usuario_id = $2", [id, uid(k)])).rows[0].cartas;
// Pone la mesa como se necesita para cada prueba (como dueño de la base: sin RLS)
async function mesa(id, { fer, mar, arriba, color, turno, mazo = [], pozo = [] }) {
  await db.query("update public.uno_manos set cartas = $1, robada = null where juego_id = $2 and usuario_id = $3", [fer, id, uid("fer")]);
  await db.query("update public.uno_manos set cartas = $1, robada = null where juego_id = $2 and usuario_id = $3", [mar, id, uid("mar")]);
  await db.query("update public.uno_mazos set mazo = $1, pozo = $2 where juego_id = $3", [mazo, pozo, id]);
  await db.query(`update public.unos set arriba = $1, color = $2, turno = $3, robo = null, uno_dicho = '{}', uno_pendiente = null,
    cartas = jsonb_build_object($4::text, $5::int, $6::text, $7::int), mazo = $8 where id = $9`,
    [arriba, color || arriba[0], uid(turno), uid("fer"), fer.length, uid("mar"), mar.length, mazo.length, id]);
}

// Lo justo de Supabase y de Nosotros (stub.sql) + privado.llamar, que aquí solo anota a quién se avisaría
await db.exec(leer("./stub.sql"));
await db.exec(`create schema privado;
  create table privado.llamadas (funcion text, cuerpo jsonb);
  create function privado.llamar(funcion text, cuerpo jsonb) returns void language sql as $$ insert into privado.llamadas values (funcion, cuerpo) $$;`);
const SQL = leer("../uno.sql");
await db.exec(SQL);
await db.exec(SQL);
ok(true, "uno.sql corre dos veces seguidas sin error");

// ---------- las cartas ----------
const mazo = (await db.query("select public.uno_mazo_nuevo() m")).rows[0].m;
const cuenta = (pred) => mazo.filter(pred).length;
ok(mazo.length === 108, `el mazo tiene 108 cartas (${mazo.length})`);
ok(["r", "a", "v", "z"].every((c) => cuenta((x) => x[0] === c) === 25), "25 de cada color");
ok(cuenta((x) => x === "x") === 4 && cuenta((x) => x === "x4") === 4, "4 comodines y 4 roba cuatro");
ok(cuenta((x) => x === "r0") === 1 && cuenta((x) => x === "r7") === 2 && cuenta((x) => x === "zd") === 2, "un 0, dos de cada número y dos de cada acción por color");
const vale = async (c, a, col) => (await db.query("select public.uno_vale($1, $2, $3) v", [c, a, col])).rows[0].v;
ok(await vale("r3", "r7", "r") && await vale("z7", "r7", "r") && await vale("x4", "r7", "r") && !(await vale("z3", "r7", "r")), "vale mismo color, mismo número o comodín; nada más");
ok(await vale("zs", "rs", "r") && !(await vale("r4", "x4", "a")) && await vale("a4", "x4", "a"), "salta sobre salta; sobre un +4 solo cuenta el color elegido");
const pts = (await db.query("select public.uno_puntos(array['r7','zs','x4','a0']) p")).rows[0].p;
ok(pts === 77, `los puntos: 7 + 20 + 50 + 0 = 77 (${pts})`);

// ---------- retar y repartir ----------
const j = await fila("fer", "select * from public.uno_crear('Quien pierde canta 🎤')");
ok(j && j.estado === "jugando" && j.creado_por === uid("fer") && j.rival === uid("mar") && j.apuesta.startsWith("Quien pierde"), "Fernando reta a Martina (con apuesta)");
ok(j.cartas[uid("fer")] === 7 && j.cartas[uid("mar")] === 7 && j.mazo === 93, "7 cartas para cada uno y 93 en el mazo");
ok(/^[ravz][0-9]$/.test(j.arriba) && j.color === j.arriba[0], `la primera del pozo es un número (${j.arriba})`);
ok([uid("fer"), uid("mar")].includes(j.turno), "empieza quien diga la suerte");
const total = async (id) => {
  const m = (await db.query("select cardinality(mazo) + cardinality(pozo) n from public.uno_mazos where juego_id = $1", [id])).rows[0].n;
  const h = (await db.query("select coalesce(sum(cardinality(cartas)), 0)::int n from public.uno_manos where juego_id = $1", [id])).rows[0].n;
  return m + h + 1;
};
ok(await total(j.id) === 108, "no se pierde ni se inventa ninguna carta (108 entre manos, mazo y pozo)");
let llamadas = (await db.query("select cuerpo from privado.llamadas")).rows;
ok(llamadas.length === 1 && llamadas[0].cuerpo.table === "unos" && llamadas[0].cuerpo.type === "INSERT", "al retar se avisa (notificar, tabla unos)");
ok((await fila("mar", "select * from public.uno_crear(null)")).id === j.id, "si Martina también reta, le devuelve la misma partida");
ok(!(await fila("suelta", "select * from public.uno_crear(null)")).id, "una cuenta sin pareja completa no puede retar");
ok(!(await fila("eli", "select * from public.uno_crear(null)")).id, "alguien de la familia no puede retar");
ok(!!(await falla("anon", "select * from public.uno_crear(null)")), "sin sesión no se puede");
ok(!!(await falla("fer", "insert into public.unos (pareja_id, creado_por, rival, arriba, color) values ('00000000-0000-0000-0000-00000000aaaa', $1, $2, 'r1', 'r')", [uid("fer"), uid("mar")])),
  "no se puede crear una partida directo en la tabla");

// ---------- secretos ----------
const mias = (await como("fer", "select usuario_id, cartas from public.uno_manos")).rows;
ok(mias.length === 1 && mias[0].usuario_id === uid("fer") && mias[0].cartas.length === 7, "Fernando ve solo su mano");
ok((await como("mar", "select usuario_id from public.uno_manos")).rows.every((x) => x.usuario_id === uid("mar")), "Martina ve solo la suya");
ok((await como("fer", "select * from public.uno_mazos")).rows.length === 0 && (await como("mar", "select * from public.uno_mazos")).rows.length === 0,
  "nadie puede ver el mazo (ni los dos)");
ok((await como("eli", "select * from public.unos")).rows.length === 0 && (await como("eli", "select * from public.uno_manos")).rows.length === 0,
  "la familia no ve nada");
ok(!!(await falla("fer", "select public.uno_sacar($1, $2, 5)", [j.id, uid("fer")])), "nadie puede llamar directo a la función que saca cartas");
await como("fer", "update public.uno_manos set cartas = '{x4,x4}'");
ok((await manoDe(j.id, "fer")).length === 7, "nadie se puede cambiar la mano a mano");

// ---------- jugar ----------
await mesa(j.id, { fer: ["r3", "z7", "as", "vd", "x", "x4", "z1"], mar: ["a5", "a6", "v2", "v3", "z9", "r8", "a1"], arriba: "r7", turno: "fer", mazo: ["a2", "v9", "z4", "r1", "a3", "v5"] });
ok((await r("mar", "uno_jugar", j.id, "a5", null)) === null, "quien no tiene el turno no juega");
ok((await r("fer", "uno_jugar", j.id, "a9", null)) === null, "no se puede jugar una carta que no tiene");
ok((await r("fer", "uno_jugar", j.id, "z1", null)) === null, "ni una que no vale (azul 1 sobre rojo 7)");
let res = await r("fer", "uno_jugar", j.id, "z7", null);
let p = await partida(j.id);
ok(res && res.mano.length === 6 && p.arriba === "z7" && p.color === "z" && p.turno === uid("mar") && p.cartas[uid("fer")] === 6,
  "azul 7 sobre rojo 7: vale, cambia el color y le toca a Martina");
ok((await como("fer", "select tipo, carta from public.uno_jugadas order by id desc limit 1")).rows[0].carta === "z7", "la jugada queda a la vista de los dos");
ok((await como("mar", "select tipo, carta from public.uno_jugadas order by id desc limit 1")).rows[0].tipo === "juega", "(también para Martina)");
await r("mar", "uno_jugar", j.id, "z9", null);
p = await partida(j.id);
ok(p.turno === uid("fer") && p.arriba === "z9", "Martina juega azul 9: vuelve a Fernando");
ok((await r("fer", "uno_jugar", j.id, "as", null)) === null, "amarillo salta no vale sobre azul 9");

// salta, reversa, +2, +4
await mesa(j.id, { fer: ["rs", "rr", "rd", "x4", "x", "r5"], mar: ["a5", "a6"], arriba: "r7", turno: "fer", mazo: ["a2", "v9", "z4", "r1", "a3", "v5", "z8", "z9"] });
const enJuego = await total(j.id);
await r("fer", "uno_jugar", j.id, "rs", null);
ok((await partida(j.id)).turno === uid("fer"), "salta: Fernando vuelve a jugar");
await r("fer", "uno_jugar", j.id, "rr", null);
ok((await partida(j.id)).turno === uid("fer"), "reversa (entre dos): también vuelve a jugar");
await r("fer", "uno_jugar", j.id, "rd", null);
p = await partida(j.id);
ok(p.turno === uid("fer") && p.cartas[uid("mar")] === 4 && (await manoDe(j.id, "mar")).length === 4 && p.mazo === 6, "+2: Martina roba dos y Fernando sigue");
ok((await r("fer", "uno_jugar", j.id, "x4", null)) === null, "un comodín sin color no vale");
ok((await r("fer", "uno_jugar", j.id, "x4", "m")) === null, "ni con un color que no existe");
await r("fer", "uno_jugar", j.id, "x4", "v");
p = await partida(j.id);
ok(p.turno === uid("fer") && p.color === "v" && p.arriba === "x4" && p.cartas[uid("mar")] === 8, "+4 con verde: Martina roba cuatro, manda el verde y Fernando sigue");
ok((await r("fer", "uno_jugar", j.id, "r5", null)) === null, "sobre el +4 verde, el rojo 5 no vale");
await r("fer", "uno_jugar", j.id, "x", "a");
p = await partida(j.id);
ok(p.turno === uid("mar") && p.color === "a", "comodín amarillo: le toca a Martina");
ok(await total(j.id) === enJuego, `ninguna carta se pierde ni se duplica al jugar (${enJuego})`);

// ---------- robar y pasar ----------
await mesa(j.id, { fer: ["r1", "z2"], mar: ["v1", "v2", "v3"], arriba: "r7", turno: "fer", mazo: ["a1", "r2"] });
res = await r("fer", "uno_robar", j.id);
p = await partida(j.id);
ok(res.robada === "r2" && p.robo === uid("fer") && p.turno === uid("fer") && res.mano.length === 3, "Fernando roba un rojo 2: le sirve, puede jugarlo");
ok((await r("fer", "uno_robar", j.id)) === null, "no se roba dos veces");
ok((await r("fer", "uno_jugar", j.id, "r1", null)) === null, "después de robar solo puede jugar la que robó (no el rojo 1 que ya tenía)");
res = await r("fer", "uno_pasar", j.id);
p = await partida(j.id);
ok(res && p.turno === uid("mar") && p.robo === null, "o pasar: le toca a Martina");
ok((await r("mar", "uno_pasar", j.id)) === null, "pasar sin haber robado no vale");
res = await r("mar", "uno_robar", j.id);
p = await partida(j.id);
ok(res.robada === "a1" && p.turno === uid("fer") && p.robo === null && p.cartas[uid("mar")] === 4, "Martina roba un amarillo 1 que no le sirve: le toca a Fernando");
await mesa(j.id, { fer: ["z1", "z2"], mar: ["v1"], arriba: "r7", turno: "fer", mazo: ["r9"] });
res = await r("fer", "uno_robar", j.id);
await r("fer", "uno_jugar", j.id, "r9", null);
p = await partida(j.id);
ok(p.arriba === "r9" && p.turno === uid("mar"), "y si le sirve, la juega");

// ---------- ¡UNO! y pillar ----------
await mesa(j.id, { fer: ["r1", "r2"], mar: ["a1", "a2", "a3"], arriba: "r7", turno: "fer", mazo: ["v1", "v2", "v3", "v4", "v5", "v6"] });
await r("fer", "uno_jugar", j.id, "r1", null);
p = await partida(j.id);
ok(p.uno_pendiente === uid("fer"), "Fernando queda con una sin decir ¡UNO!: se le puede pillar");
ok((await r("fer", "uno_pillar", j.id)) === null, "uno no se puede pillar a sí mismo");
await r("mar", "uno_pillar", j.id);
p = await partida(j.id);
ok(p.uno_pendiente === null && p.cartas[uid("fer")] === 3 && (await manoDe(j.id, "fer")).length === 3, "Martina lo pilla: Fernando roba dos");
ok((await r("mar", "uno_pillar", j.id)) === null, "no se pilla dos veces");
const pillada = (await como("fer", "select tipo, n, usuario_id from public.uno_jugadas order by id desc limit 1")).rows[0];
ok(pillada.tipo === "pilla" && pillada.n === 2 && pillada.usuario_id === uid("mar"), "queda anotado quién pilló");

await mesa(j.id, { fer: ["r1", "r2"], mar: ["a1", "a2", "a3"], arriba: "r7", turno: "fer", mazo: ["v1", "v2"] });
await r("fer", "uno_decir", j.id);
ok((await partida(j.id)).uno_dicho.includes(uid("fer")), "Fernando dice ¡UNO! con dos cartas");
await r("fer", "uno_jugar", j.id, "r1", null);
ok((await partida(j.id)).uno_pendiente === null && (await r("mar", "uno_pillar", j.id)) === null, "juega la penúltima: ya no lo pueden pillar");

await mesa(j.id, { fer: ["r1", "r2"], mar: ["a1", "a2", "a3"], arriba: "r7", turno: "fer", mazo: ["v1", "v2"] });
await r("fer", "uno_jugar", j.id, "r1", null);
await r("fer", "uno_decir", j.id);
ok((await partida(j.id)).uno_pendiente === null, "y si lo dice justo después (antes de que lo pillen), se salva");

await mesa(j.id, { fer: ["r1", "r2"], mar: ["a1", "a2", "r3"], arriba: "r7", turno: "fer", mazo: ["v1", "v2"] });
await r("fer", "uno_jugar", j.id, "r1", null);
await r("mar", "uno_jugar", j.id, "r3", null);
ok((await partida(j.id)).uno_pendiente === null && (await r("mar", "uno_pillar", j.id)) === null, "si Martina juega sin pillarlo, se le pasó");
await mesa(j.id, { fer: ["r1", "r2", "r3"], mar: ["a1"], arriba: "r7", turno: "fer", mazo: ["v1"] });
const nada = await fila("fer", "select * from public.uno_decir($1)", [j.id]);
ok(!nada.uno_dicho.includes(uid("fer")), "con tres cartas todavía no se puede decir ¡UNO!");

// ---------- ganar ----------
await mesa(j.id, { fer: ["rd"], mar: ["a5", "zs", "x"], arriba: "r7", turno: "fer", mazo: ["v1", "v9"] });
res = await r("fer", "uno_jugar", j.id, "rd", null);
p = await partida(j.id);
ok(p.estado === "terminada" && p.ganador === uid("fer") && p.turno === null && res.mano.length === 0, "Fernando juega su última carta (un +2) y gana");
ok(p.puntos === 5 + 20 + 50 + 1 + 9, `se lleva los puntos de lo que le quedó a Martina, con las dos que robó (${p.puntos})`);
ok((await r("mar", "uno_robar", j.id)) === null, "terminada, ya no se juega");
const rival = await r("mar", "uno_mano_rival", j.id);
ok(Array.isArray(rival) && rival.length === 0 && (await r("fer", "uno_mano_rival", j.id)).length === 5, "al terminar se ve lo que le quedó al otro");
ok((await r("eli", "uno_mano_rival", j.id)) === null, "la familia no");

// ---------- volver a barajar ----------
const j2 = await fila("mar", "select * from public.uno_crear(null)");
ok(j2.id !== j.id && j2.creado_por === uid("mar"), "terminada la anterior, Martina reta de nuevo");
ok((await fila("fer", "select * from public.uno_crear(null)")).id === j2.id && await total(j2.id) === 108, "(una a la vez, y con sus 108 cartas)");
await mesa(j2.id, { fer: ["rd", "r5"], mar: ["a1"], arriba: "r7", turno: "fer", mazo: ["z1"], pozo: ["v1", "v2", "v3", "v4"] });
await r("fer", "uno_jugar", j2.id, "rd", null);
const z2 = (await db.query("select mazo, pozo from public.uno_mazos where juego_id = $1", [j2.id])).rows[0];
p = await partida(j2.id);
ok(p.cartas[uid("mar")] === 3 && z2.pozo.length === 0 && z2.mazo.length === 4 && p.mazo === 4,
  "se acabó el mazo en pleno +2: se baraja el pozo debajo y Martina roba igual sus dos");
ok([...z2.mazo, ...(await manoDe(j2.id, "mar"))].sort().join() === ["a1", "r7", "v1", "v2", "v3", "v4", "z1"].sort().join(),
  "(con las mismas cartas: la que había, el pozo y la de arriba de antes)");

// ---------- rendirse, cancelar y abandonadas ----------
await db.query("update public.unos set jugadas = 0 where id = $1", [j2.id]);
let rr = await fila("fer", "select * from public.uno_rendirse($1)", [j2.id]);
ok(rr.estado === "cancelada" && rr.ganador === null, "si nadie jugó una carta, rendirse cancela el reto");
const j3 = await fila("fer", "select * from public.uno_crear(null)");
await mesa(j3.id, { fer: ["r1", "r2"], mar: ["a1", "a2"], arriba: "r7", turno: "fer", mazo: ["v1"] });
await r("fer", "uno_jugar", j3.id, "r1", null);
rr = await fila("mar", "select * from public.uno_rendirse($1)", [j3.id]);
ok(rr.estado === "terminada" && rr.ganador === uid("fer") && rr.rendido === true, "con la partida empezada, si Martina se rinde gana Fernando");
ok(!(await fila("eli", "select * from public.uno_rendirse($1)", [j3.id])).id, "alguien de afuera no puede rendir a nadie");
const j4 = await fila("fer", "select * from public.uno_crear(null)");
await db.query("update public.unos set actualizado_en = now() - interval '13 hours' where id = $1", [j4.id]);
const j5 = await fila("mar", "select * from public.uno_crear(null)");
ok(j5.id !== j4.id && (await partida(j4.id)).estado === "cancelada", "una partida abandonada (12 h sin movimiento) se cancela sola al retar de nuevo");

// ---------- avisarle ----------
const enviadosAntes = (await db.query("select count(*)::int n from privado.llamadas")).rows[0].n;
ok(enviadosAntes === 5, `cada reto avisa una vez (5 retos: ${enviadosAntes})`);
ok((await r("fer", "uno_avisar", j5.id)) === true, "Fernando le avisa a Martina que la espera");
const aviso = (await db.query("select cuerpo from privado.llamadas offset 5")).rows;
ok(aviso.length === 1 && aviso[0].cuerpo.type === "AVISO" && aviso[0].cuerpo.table === "unos" && aviso[0].cuerpo.de === uid("fer"), "el aviso va a notificar (tipo AVISO, de Fernando)");
ok((await r("mar", "uno_avisar", j5.id)) === false, "uno por minuto como mucho");
await db.query("update public.unos set avisado_en = now() - interval '2 minutes' where id = $1", [j5.id]);
ok((await r("mar", "uno_avisar", j5.id)) === true, "pasado el minuto se puede de nuevo");
ok((await r("eli", "uno_avisar", j5.id)) === false, "alguien de afuera no puede avisar");
ok((await r("fer", "uno_avisar", j.id)) === false, "en una partida terminada no se avisa");
ok(!!(await falla("anon", "select public.uno_avisar($1)", [j5.id])), "sin sesión no se puede avisar");

console.log(fallas ? `\n${fallas} PRUEBA(S) FALLARON` : "\nTodo bien ✓");
process.exit(fallas ? 1 : 0);
