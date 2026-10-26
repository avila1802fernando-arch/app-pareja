// Prueba batalla.sql en un Postgres local (PGlite, sin Docker y sin tocar la base real): flotas secretas,
// turnos, disparos, hundir, ganar, rendirse, avisos y que nadie de afuera vea nada.
//   npm install && node batalla.mjs
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

// Lo justo de Supabase y de Nosotros (stub.sql) + privado.llamar, que aquí solo anota a quién se avisaría
await db.exec(leer("./stub.sql"));
await db.exec(`create schema privado;
  create table privado.llamadas (funcion text, cuerpo jsonb);
  create function privado.llamar(funcion text, cuerpo jsonb) returns void language sql as $$ insert into privado.llamadas values (funcion, cuerpo) $$;`);
const SQL = leer("../batalla.sql");
await db.exec(SQL);
await db.exec(SQL);
ok(true, "batalla.sql corre dos veces seguidas sin error");

// ---------- validar flotas ----------
const FLOTA_F = [[0, 1, 2, 3, 4], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [80, 81]];
const FLOTA_M = [[9, 19, 29, 39, 49], [7, 17, 27, 37], [55, 56, 57], [75, 76, 77], [95, 96]];
const valida = async (f) => (await db.query("select public.batalla_flota_valida($1::jsonb) v", [JSON.stringify(f)])).rows[0].v;
ok(await valida(FLOTA_F) && await valida(FLOTA_M), "dos flotas bien armadas son válidas");
ok(!(await valida([[0, 1, 2, 3, 4], [3, 13, 23, 33], [40, 41, 42], [60, 61, 62], [80, 81]])), "barcos que se pisan: no");
ok(!(await valida([[0, 11, 22, 33, 44], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [80, 81]].map((b, i) => i === 1 ? [25, 26, 27, 28] : b))), "en diagonal: no");
ok(!(await valida([[0, 1, 2, 3, 4], [20, 21, 22, 23], [40, 51, 60], [65, 66, 67], [80, 81]])), "celdas sueltas que parecen columna (A5, B6, A7): no");
ok(!(await valida([[8, 9, 10], [0, 1, 2, 3, 4], [20, 21, 22, 23], [60, 61, 62], [80, 81]])), "un barco que cruza de una fila a otra: no");
ok(!(await valida([[0, 1, 2, 3], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [80, 81]])), "tamaños que no son 5-4-3-3-2: no");
ok(!(await valida([[0, 1, 2, 3, 4], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [99, 100]])), "fuera del tablero: no");
ok(!(await valida([[0, 1, 2, 3, 4], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [80, 80]])), "celda repetida: no");
ok(!(await valida([[0, 1, 2, 3, "x"], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [80, 81]])), "algo que no es número: no (sin error)");
ok(!(await valida([[80, 81], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [0, 1, 2, 3, 4]])), "los barcos fuera de orden (la lancha primero): no");

// ---------- retar ----------
const b = await fila("fer", "select * from public.batalla_crear('Quien pierde canta una canción 🎤')");
ok(b && b.estado === "colocando" && b.creado_por === uid("fer") && b.rival === uid("mar") && b.apuesta.startsWith("Quien pierde"),
  "Fernando reta a Martina (con apuesta)");
let llamadas = (await db.query("select cuerpo from privado.llamadas")).rows;
ok(llamadas.length === 1 && llamadas[0].cuerpo.table === "batallas" && llamadas[0].cuerpo.type === "INSERT", "al retar se avisa (notificar, tabla batallas)");
ok((await fila("mar", "select * from public.batalla_crear(null)")).id === b.id, "si Martina también reta, le devuelve la misma batalla (una a la vez)");
ok(!(await fila("suelta", "select * from public.batalla_crear(null)")).id, "una cuenta sin pareja completa no puede retar");
ok(!(await fila("eli", "select * from public.batalla_crear(null)")).id, "alguien de la familia no puede retar");
ok((await como("eli", "select * from public.batallas")).rows.length === 0, "la familia no ve las batallas");
ok(!!(await falla("anon", "select * from public.batalla_crear(null)")), "sin sesión no se puede retar");
ok(!!(await falla("fer", "insert into public.batallas (pareja_id, creado_por, rival) values ('00000000-0000-0000-0000-00000000aaaa', $1, $2)", [uid("fer"), uid("mar")])),
  "no se puede crear una batalla directo en la tabla");

// ---------- acomodar ----------
ok(!!(await falla("fer", "select public.batalla_colocar($1, $2::jsonb)", [b.id, JSON.stringify([[0, 1], [2, 3]])])), "una flota mal armada se rechaza");
let r = await fila("fer", "select * from public.batalla_colocar($1, $2::jsonb)", [b.id, JSON.stringify(FLOTA_F)]);
ok(r.estado === "colocando" && r.listos.length === 1, "Fernando acomoda su flota y queda esperando");
ok((await como("fer", "select * from public.batalla_flotas")).rows.length === 1, "Fernando ve su flota");
ok((await como("mar", "select * from public.batalla_flotas")).rows.length === 0, "Martina NO ve la flota de Fernando");
ok(!(await fila("fer", "select * from public.batalla_disparar($1, 9)", [b.id])).id, "no se dispara antes de que los dos estén listos");
ok(!(await fila("eli", "select * from public.batalla_colocar($1, $2::jsonb)", [b.id, JSON.stringify(FLOTA_M)])).id, "alguien de afuera no puede acomodar en esta batalla");
r = await fila("mar", "select * from public.batalla_colocar($1, $2::jsonb)", [b.id, JSON.stringify(FLOTA_M)]);
ok(r.estado === "jugando" && [uid("fer"), uid("mar")].includes(r.turno), "Martina acomoda la suya: empieza la batalla con un turno al azar");
llamadas = (await db.query("select cuerpo from privado.llamadas")).rows;
ok(llamadas.length === 2 && llamadas[1].cuerpo.type === "UPDATE" && llamadas[1].cuerpo.old_record.estado === "colocando",
  "al empezar se avisa a quien estaba esperando");
ok(r.estado === "jugando" && (await fila("mar", "select * from public.batalla_colocar($1, $2::jsonb)", [b.id, JSON.stringify(FLOTA_F)])).estado === "jugando",
  "ya empezada, no se puede cambiar la flota");
ok(JSON.stringify((await fila("mar", "select barcos from public.batalla_flotas")).barcos) === JSON.stringify(FLOTA_M), "la flota de Martina no cambió");

// ---------- disparar ----------
// Para seguir la prueba sin depender de la suerte: le toca a Fernando
await db.query("update public.batallas set turno = $1 where id = $2", [uid("fer"), b.id]);
ok(!(await fila("mar", "select * from public.batalla_disparar($1, 0)", [b.id])).id, "quien no tiene el turno no dispara");
let d = await fila("fer", "select * from public.batalla_disparar($1, 50)", [b.id]);
ok(d.resultado === "agua", "Fernando dispara a A6: agua");
ok((await fila("fer", "select turno from public.batallas")).turno === uid("mar"), "con agua, le toca a Martina");
d = await fila("mar", "select * from public.batalla_disparar($1, 0)", [b.id]);
ok(d.resultado === "tocado" && (await fila("mar", "select turno from public.batallas")).turno === uid("mar"), "Martina le da a A1: tocado, y sigue disparando");
for (const c of [1, 2, 3]) await como("mar", "select public.batalla_disparar($1, $2)", [b.id, c]);
d = await fila("mar", "select * from public.batalla_disparar($1, 4)", [b.id]);
ok(d.resultado === "hundido" && JSON.stringify([...d.barco].sort((x, y) => x - y)) === "[0,1,2,3,4]" && d.barco_n === 0,
  "con E1 hunde el portaaviones de Fernando (se ven sus celdas y cuál era)");
ok((await fila("mar", "select barco_n from public.batalla_disparos where celda = 3")).barco_n === null, "un tocado no dice qué barco era");
ok(!(await fila("mar", "select * from public.batalla_disparar($1, 4)", [b.id])).id, "no se puede disparar dos veces a la misma celda");
d = await fila("mar", "select * from public.batalla_disparar($1, 99)", [b.id]);
ok(d.resultado === "agua" && (await fila("fer", "select turno from public.batallas")).turno === uid("fer"), "Martina falla: vuelve a Fernando");
ok(!(await fila("fer", "select * from public.batalla_disparar($1, 100)", [b.id])).id, "una celda fuera del tablero no cuenta");
ok((await como("fer", "select * from public.batalla_disparos")).rows.length === 7 && (await como("mar", "select * from public.batalla_disparos")).rows.length === 7,
  "los dos ven todos los disparos");
ok((await como("eli", "select * from public.batalla_disparos")).rows.length === 0, "la familia no ve los disparos");
ok(!!(await falla("fer", "insert into public.batalla_disparos (batalla_id, usuario_id, celda, resultado) values ($1, $2, 5, 'hundido')", [b.id, uid("fer")])),
  "no se puede inventar un disparo directo en la tabla");
ok((await fila("fer", "select public.batalla_flota_rival($1) f", [b.id])).f === null, "en plena batalla no se puede ver la flota del otro");

// Fernando hunde toda la flota de Martina (17 aciertos seguidos: siempre vuelve a disparar)
const todas = FLOTA_M.flat();
for (const c of todas.slice(0, -1)) await como("fer", "select public.batalla_disparar($1, $2)", [b.id, c]);
d = await fila("fer", "select * from public.batalla_disparar($1, $2)", [b.id, todas[todas.length - 1]]);
r = await fila("fer", "select * from public.batallas where id = $1", [b.id]);
ok(d.resultado === "hundido" && r.estado === "terminada" && r.ganador === uid("fer") && r.turno === null, "con el acierto 17 Fernando gana la batalla");
const hundidos = (await como("fer", "select barco_n from public.batalla_disparos where usuario_id = $1 and resultado = 'hundido' order by id", [uid("fer")])).rows;
ok(hundidos.map((x) => x.barco_n).join() === "0,1,2,3,4", "cada barco hundido dice cuál era (crucero y submarino, aunque los dos midan 3)");
ok(!(await fila("mar", "select * from public.batalla_disparar($1, 10)", [b.id])).id, "terminada, ya no se dispara");
ok(JSON.stringify((await fila("mar", "select public.batalla_flota_rival($1) f", [b.id])).f) === JSON.stringify(FLOTA_F), "al terminar, Martina ve dónde estaban los barcos de Fernando");
ok((await fila("eli", "select public.batalla_flota_rival($1) f", [b.id])).f === null, "la familia no ve ninguna flota");

// ---------- rendirse, cancelar y abandonadas ----------
const b2 = await fila("mar", "select * from public.batalla_crear(null)");
ok(b2.id !== b.id && b2.creado_por === uid("mar"), "terminada la anterior, Martina puede retar de nuevo");
r = await fila("fer", "select * from public.batalla_rendirse($1)", [b2.id]);
ok(r.estado === "cancelada" && r.ganador === null, "si todavía están acomodando, rendirse cancela el reto (nadie gana)");
const b3 = await fila("fer", "select * from public.batalla_crear(null)");
await como("fer", "select public.batalla_colocar($1, $2::jsonb)", [b3.id, JSON.stringify(FLOTA_F)]);
await como("mar", "select public.batalla_colocar($1, $2::jsonb)", [b3.id, JSON.stringify(FLOTA_M)]);
r = await fila("mar", "select * from public.batalla_rendirse($1)", [b3.id]);
ok(r.estado === "terminada" && r.ganador === uid("fer") && r.rendido === true, "en plena batalla, si Martina se rinde gana Fernando");
ok(!(await fila("eli", "select * from public.batalla_rendirse($1)", [b3.id])).id, "alguien de afuera no puede rendir a nadie");
const b4 = await fila("fer", "select * from public.batalla_crear(null)");
await db.query("update public.batallas set actualizado_en = now() - interval '13 hours' where id = $1", [b4.id]);
const b5 = await fila("mar", "select * from public.batalla_crear(null)");
ok(b5.id !== b4.id && (await db.query("select estado from public.batallas where id = $1", [b4.id])).rows[0].estado === "cancelada",
  "una batalla abandonada (12 h sin movimiento) se cancela sola al retar de nuevo");
llamadas = (await db.query("select count(*)::int n from privado.llamadas")).rows[0].n;
ok(llamadas === 7, `cada reto avisa una vez y cada comienzo otra (7 avisos en total: ${llamadas})`);

// ---------- avisarle ----------
ok((await fila("fer", "select public.batalla_avisar($1) a", [b5.id])).a === true, "Fernando le avisa a Martina que lo está esperando");
const aviso = (await db.query("select cuerpo from privado.llamadas offset 7")).rows;
ok(aviso.length === 1 && aviso[0].cuerpo.type === "AVISO" && aviso[0].cuerpo.de === uid("fer") && aviso[0].cuerpo.record.id === b5.id,
  "el aviso va a notificar (tipo AVISO, de Fernando)");
ok((await fila("mar", "select public.batalla_avisar($1) a", [b5.id])).a === false, "uno por minuto como mucho");
await db.query("update public.batallas set avisado_en = now() - interval '2 minutes' where id = $1", [b5.id]);
ok((await fila("mar", "select public.batalla_avisar($1) a", [b5.id])).a === true, "pasado el minuto se puede de nuevo");
ok((await fila("eli", "select public.batalla_avisar($1) a", [b5.id])).a === false, "alguien de afuera no puede avisar");
ok((await fila("fer", "select public.batalla_avisar($1) a", [b.id])).a === false, "en una batalla terminada no se avisa");
ok(!!(await falla("anon", "select public.batalla_avisar($1)", [b5.id])), "sin sesión no se puede avisar");
llamadas = (await db.query("select count(*)::int n from privado.llamadas")).rows[0].n;
ok(llamadas === 9, `los avisos a mano no disparan otros (9 en total: ${llamadas})`);

console.log(fallas ? `\n${fallas} PRUEBA(S) FALLARON` : "\nTodo bien ✓");
process.exit(fallas ? 1 : 0);
