// Prueba familia.sql en un Postgres local (PGlite, sin Docker y sin tocar la base real): permisos, ranking y
// que se pueda repetir. stub.sql imita lo justo de Supabase y de Nosotros.
//   npm install && node familia.mjs            (lee ../familia.sql)
//   node familia.mjs ruta/a/otro.sql           (otra copia del SQL)
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
const leer = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const SQL = process.argv[2] ? readFileSync(process.argv[2], "utf8") : leer("../familia.sql");
const ID = { fer: "f1", mar: "a2", eli: "e1", mam: "b2", suelta: "c3", intruso: "d4", sinconf: "e5" };
const uid = (k) => `00000000-0000-0000-0000-0000000000${ID[k]}`;
let fallas = 0;
const ok = (cond, txt) => { console.log(`${cond ? "OK " : "MAL"} ${txt}`); if (!cond) fallas++; };

async function como(quien, sql, params = []) {
  await db.exec("reset role");
  if (quien === "anon") { await db.exec("set role anon"); await db.query("select set_config('test.uid', '', false)"); }
  else { await db.exec("set role authenticated"); await db.query("select set_config('test.uid', $1, false)", [uid(quien)]); }
  try { return await db.query(sql, params); } finally { await db.exec("reset role"); }
}
async function falla(quien, sql, params) {
  try { await como(quien, sql, params); return false; } catch (e) { return e.message; }
}

await db.exec(leer("./stub.sql"));
await db.exec(SQL);
await db.exec(SQL); // se puede repetir sin errores ni duplicados
ok(true, "familia.sql corre dos veces seguidas sin error");

const sembrados = (await db.query("select nombre, avatar, color from public.familia_miembros order by nombre")).rows;
ok(sembrados.length === 2, `al principio solo están Fernando y Martina (${sembrados.map((r) => r.nombre).join(", ")})`);
const ocultos = (await db.query("select nombre from public.familia_miembros where oculto")).rows.map((r) => r.nombre);
ok(ocultos.length === 1 && ocultos[0] === "Martina", "Martina queda oculta en el Recreo");
ok(sembrados.some((r) => r.nombre === "Fernando" && r.avatar === "🦊"), "Fernando sale con su usuario, no con el apodo 'Tu amorcito'");

// Maritza todavía no entró: no ve nada
ok((await como("mam", "select * from public.familia_miembros")).rows.length === 0, "antes de entrar, Maritza no ve a nadie");
ok((await como("mam", "select * from public.ranking_familia(now() - interval '1 day')")).rows.length === 0, "antes de entrar, Maritza no ve el ranking");

// Entrar
const eli = (await como("eli", "select * from public.entrar_familia()")).rows[0];
ok(eli && eli.nombre === "Eli", `Eli entra y queda como "${eli && eli.nombre}"`);
ok(eli && +eli.creado_en === +eli.actualizado_en, "Eli todavía no elige personaje (creado_en = actualizado_en)");
const otraVez = (await como("eli", "select * from public.entrar_familia()")).rows[0];
ok(otraVez.usuario_id === eli.usuario_id, "entrar dos veces devuelve la misma fila");
const mam = (await como("mam", "select * from public.entrar_familia()")).rows[0];
ok(mam && mam.nombre === "Maritza", `Maritza entra y queda como "${mam && mam.nombre}"`);
const fer = (await como("fer", "select * from public.entrar_familia()")).rows[0];
ok(fer && fer.avatar === "🦊", "Fernando entra con su cuenta de Nosotros y conserva su personaje");

const nadie = async (k) => { const r = (await como(k, "select * from public.entrar_familia()")).rows[0]; return !r || r.usuario_id == null; };
ok(await nadie("suelta"), "una cuenta @nosotros.invalid sin pareja completa NO entra");
ok(await nadie("intruso"), "una cuenta de otro dominio NO entra");
ok(await nadie("sinconf"), "una cuenta sin confirmar NO entra");
ok(!!(await falla("anon", "select * from public.entrar_familia()")), "sin sesión no se puede llamar entrar_familia");

// Ver y jugar
ok((await como("eli", "select * from public.familia_miembros")).rows.length === 3, "Eli ve a 3 del Recreo (no a Martina)");
ok((await como("mar", "select * from public.entrar_familia()")).rows.every((f) => f.usuario_id == null), "Martina NO puede entrar al Recreo");
ok((await como("mar", "select * from public.ranking_familia(now())")).rows.length === 0, "Martina no ve el ranking");
await db.query("insert into public.familia_partidas (usuario_id, juego, puntos) values ($1, 'memoria', 7777)", [uid("mar")]);
ok(!(await como("eli", "select * from public.familia_partidas")).rows.some((f) => f.usuario_id === uid("mar")), "Eli no ve partidas de Martina (tampoco en tiempo real)");
await como("eli", "insert into public.familia_partidas (usuario_id, juego, puntos) values ($1, 'lluvia', 1800)", [uid("eli")]);
ok(true, "Eli guarda su partida");
ok(!!(await falla("eli", "insert into public.familia_partidas (usuario_id, juego, puntos) values ($1, 'lluvia', 9999)", [uid("mam")])),
  "Eli NO puede guardar una partida a nombre de Maritza");
ok(!!(await falla("eli", "insert into public.familia_partidas (usuario_id, juego, puntos) values ($1, 'corazones', 10)", [uid("eli")])),
  "el juego 'corazones' no existe en el Recreo (se llama 'lluvia')");
ok(!!(await falla("suelta", "insert into public.familia_partidas (usuario_id, juego, puntos) values ($1, 'lluvia', 10)", [uid("suelta")])),
  "quien no es del Recreo no puede guardar partidas");
await como("eli", "update public.familia_partidas set puntos = 99999");
await como("eli", "delete from public.familia_partidas");
const eliPts = (await db.query("select puntos from public.familia_partidas where usuario_id = $1", [uid("eli")])).rows;
ok(eliPts.length === 1 && eliPts[0].puntos === 1800, "las partidas no se pueden editar ni borrar");

// Nada de Nosotros
ok((await como("eli", "select * from public.partidas")).rows.length === 0, "Eli NO lee la tabla partidas de Nosotros");
ok((await como("eli", "select * from public.perfiles")).rows.length === 0, "Eli NO lee perfiles de Nosotros");
ok((await como("eli", "select * from public.parejas")).rows.length === 0, "Eli NO lee parejas");
ok(!!(await falla("eli", "select * from public.familia_todas()")), "familia_todas() no se puede llamar desde la app");

// Ranking
const rk = (await como("eli", "select * from public.ranking_familia(now() - interval '12 hours')")).rows;
const de = (k, j) => rk.find((r) => r.usuario_id === uid(k) && r.juego === j);
ok(de("fer", "lluvia") && de("fer", "lluvia").mejor === 2100 && de("fer", "lluvia").partidas === 2, "Fernando: corazones de Nosotros cuenta como lluvia (mejor 2100, 2 partidas)");
ok(de("fer", "lluvia").mejor_hoy === 1500, "su mejor de hoy es 1500 (la de hace 1 hora)");
ok(!rk.some((r) => r.usuario_id === uid("mar")), "los récords de Martina NO salen en el ranking");
ok(de("eli", "lluvia").mejor === 1800, "Eli: 1800 en lluvia");
ok(!rk.some((r) => r.juego === "otro_juego" || r.juego === "corazones"), "solo los 4 juegos, con los nombres del Recreo");
ok(!rk.some((r) => r.usuario_id === uid("suelta")), "la cuenta suelta (5000 pts) no aparece");
ok(!("detalle" in (rk[0] || {})), "el ranking no trae el detalle de las partidas");
ok((await como("suelta", "select * from public.ranking_familia(now())")).rows.length === 0, "quien no es del Recreo no ve el ranking");
ok(!!(await falla("anon", "select * from public.ranking_familia(now())")), "sin sesión no hay ranking");

const act = (await como("mam", "select * from public.actividad_familia(3)")).rows;
ok(act.length === 3 && +new Date(act[0].creado_en) >= +new Date(act[1].creado_en), "actividad: las 3 más nuevas, de la más reciente a la más vieja");
ok(!(await como("mam", "select * from public.actividad_familia(50)")).rows.some((r) => r.usuario_id === uid("mar")), "actividad sin Martina");
ok(!act.some((r) => r.usuario_id === uid("suelta")), "actividad sin la cuenta suelta");

// Editar
const ed = (await como("eli", "select * from public.editar_familia('  Eli  ', '🦋', 'uva')")).rows[0];
ok(ed.nombre === "Eli" && ed.avatar === "🦋" && ed.color === "uva" && +ed.actualizado_en > +ed.creado_en, "Eli elige 🦋 y uva (y ya no se le vuelve a pedir)");
ok(!!(await falla("eli", "select * from public.editar_familia(null, null, 'rosado')")), "un color fuera de la lista se rechaza");
const ed2 = (await como("eli", "select * from public.editar_familia(null, null, null)")).rows[0];
ok(ed2.avatar === "🦋" && ed2.nombre === "Eli", "editar con todo null no cambia nada");
await como("eli", "update public.familia_miembros set nombre = 'Hackeado' where usuario_id = $1", [uid("mam")]);
ok((await db.query("select nombre from public.familia_miembros where usuario_id = $1", [uid("mam")])).rows[0].nombre === "Maritza",
  "Eli no puede cambiarle el nombre a Maritza");

// Borrar una cuenta de la familia no toca nada de Nosotros
await db.exec(`delete from auth.users where id = '${uid("eli")}'`);
ok((await db.query("select count(*)::int n from public.familia_partidas where usuario_id = $1", [uid("eli")])).rows[0].n === 0, "borrar a Eli borra sus partidas del Recreo");
ok((await db.query("select count(*)::int n from public.partidas")).rows[0].n === 7, "y las partidas de Nosotros siguen intactas");

console.log(fallas ? `\n${fallas} PRUEBA(S) FALLARON` : "\nTodo bien ✓");
process.exit(fallas ? 1 : 0);
