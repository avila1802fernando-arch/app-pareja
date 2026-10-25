// Prueba las sesiones de pareja de schema.sql en un Postgres local (PGlite, sin Docker y sin tocar la base real):
// quién ve y quién escribe, el turno de Claude, el cierre, los avisos y que se pueda repetir.
// stub-schema.sql imita lo justo de Supabase.
//   npm install && node sesiones.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
const leer = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const ID = { fer: "f1", mar: "a2", intruso: "d4" };
const uid = (k) => `00000000-0000-0000-0000-0000000000${ID[k]}`;
let fallas = 0;
const ok = (cond, txt) => { console.log(`${cond ? "OK " : "MAL"} ${txt}`); if (!cond) fallas++; };

// Corre algo como una de las cuentas (con las reglas de RLS) o como la función `sesion` (service role)
async function como(quien, sql, params = []) {
  await db.exec("reset role");
  if (quien === "funcion") await db.exec("set role service_role");
  else { await db.exec("set role authenticated"); await db.query("select set_config('test.uid', $1, false)", [uid(quien)]); }
  try { return await db.query(sql, params); }
  finally { await db.exec("reset role"); await db.query("select set_config('test.uid', '', false)"); }
}
async function falla(quien, sql, params) {
  try { await como(quien, sql, params); return false; } catch (e) { return e.message; }
}
const uno = async (quien, sql, params) => (await como(quien, sql, params)).rows[0];
const eventos = async (tipo) => (await db.query("select count(*)::int n from public.eventos where tipo = $1", [tipo])).rows[0].n;

await db.exec(leer("./stub-schema.sql"));
const SQL = leer("../schema.sql");
await db.exec(SQL);
await db.exec(SQL); // se puede repetir sin errores
ok(true, "schema.sql corre dos veces seguidas sin error");

for (const [k, nombre] of [["fer", "Fernando"], ["mar", "Martina"], ["intruso", "Intruso"]]) {
  await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [uid(k), `${k}@nosotros.invalid`]);
  await db.query("insert into public.perfiles (id, nombre) values ($1, $2)", [uid(k), nombre]);
}
const p = (await uno("fer", "select (public.entrar_pareja()).id")).id;
await como("mar", "select public.entrar_pareja()");
await como("intruso", "select public.entrar_pareja()"); // queda en una pareja aparte, sin nadie

// ---- abrir ----
const s1 = await uno("fer", "select * from public.sesion_abrir()");
ok(s1.numero === 1 && s1.estado === "abierta", "Fernando abre la sesión 1");
ok(await eventos("sesion") === 1, "abrirla le avisa a Martina (evento 'sesion')");
ok((await uno("mar", "select * from public.sesion_abrir()")).id === s1.id, "si Martina toca «Empezar» con una abierta, cae en la misma");
ok((await uno("intruso", "select * from public.sesion_abrir()")).id === null, "alguien sin pareja completa no puede abrir sesiones");

// ---- escribir ----
const m1 = await uno("fer", "select * from public.sesion_escribir($1, $2)", [s1.id, "  Hola, llego con un 7  "]);
ok(m1.texto === "Hola, llego con un 7" && m1.autor === uid("fer"), "Fernando escribe (sin espacios de más)");
ok(await eventos("sesion_msj") === 0, "su primer mensaje no vuelve a avisar: ya salió el aviso de que abrió");
await como("mar", "select public.sesion_escribir($1, 'Un 8 🥰')", [s1.id]);
ok(await eventos("sesion_msj") === 1, "el primer mensaje de Martina le avisa a Fernando");
await como("mar", "select public.sesion_escribir($1, 'Y otra cosa')", [s1.id]);
ok(await eventos("sesion_msj") === 1, "los siguientes, en 10 minutos, no vuelven a avisar");
ok((await uno("mar", "select * from public.sesion_escribir($1, '   ')", [s1.id])).id === null, "un mensaje vacío no se guarda");
ok((await como("mar", "select * from public.sesion_mensajes where sesion_id = $1", [s1.id])).rows.length === 3, "los dos leen toda la conversación");

// ---- lo que no se puede ----
ok((await como("intruso", "select * from public.sesiones")).rows.length === 0, "otra persona no ve las sesiones");
ok((await como("intruso", "select * from public.sesion_mensajes")).rows.length === 0, "ni los mensajes");
ok((await uno("intruso", "select * from public.sesion_escribir($1, 'hola')", [s1.id])).id === null, "ni puede escribir en ellas");
ok(!!(await falla("fer", "insert into public.sesion_mensajes (sesion_id, pareja_id, autor, texto) values ($1, $2, null, 'soy Claude')", [s1.id, p])),
  "nadie puede escribir haciéndose pasar por Claude");
await como("fer", "update public.sesiones set estado = 'cerrada', acuerdo = 'trampa' where id = $1", [s1.id]);
ok((await db.query("select estado, acuerdo from public.sesiones where id = $1", [s1.id])).rows[0].acuerdo === null,
  "ni cambiar la sesión (ni el acuerdo) por fuera de las funciones");
ok(!!(await falla("fer", "select public.sesion_tomar_turno($1)", [s1.id])), "el turno de Claude solo lo puede tomar la función `sesion`");
ok(!!(await falla("mar", "select public.sesion_empezar_cierre($1, $2)", [s1.id, uid("mar")])), "y el cierre, también");

// ---- el turno de Claude ----
const tomar = async () => (await uno("funcion", "select public.sesion_tomar_turno($1) t", [s1.id])).t;
ok(await tomar() === true, "la función toma el turno (Claude está escribiendo)");
ok(await tomar() === false, "otra llamada al mismo tiempo no lo puede tomar");
await como("funcion", "select public.sesion_soltar_turno($1)", [s1.id]);
ok(await tomar() === true, "al soltarlo se puede volver a tomar");
await db.query("update public.sesiones set pensando_desde = now() - interval '3 minutes' where id = $1", [s1.id]);
ok(await tomar() === true, "un turno colgado (más de 2 minutos) se puede retomar");
await como("funcion", "select public.sesion_soltar_turno($1)", [s1.id]);
await como("funcion", "insert into public.sesion_mensajes (sesion_id, pareja_id, autor, texto) values ($1, $2, null, 'Hola a los dos 💛')", [s1.id, p]);
ok(await eventos("sesion_msj") === 1, "lo que escribe Claude no manda avisos");

// ---- terminar ----
const cierre = async (quien) => (await uno("funcion", "select public.sesion_empezar_cierre($1, $2) t", [s1.id, uid(quien)])).t;
ok(await cierre("mar") === true, "Martina toca «Terminar»: empieza el resumen");
ok(await cierre("fer") === false, "no se cierra dos veces al mismo tiempo");
ok((await uno("fer", "select * from public.sesion_escribir($1, 'espera')", [s1.id])).id === null, "mientras Claude escribe el resumen ya no se puede escribir");
ok(await tomar() === false, "ni Claude contesta otra cosa");
await como("funcion", `update public.sesiones set estado = 'cerrada', tema = 'Prueba', acuerdo = 'Un audio de buenos días',
  resumen = '{"tema":"Prueba"}', cerrada_en = now(), pensando_desde = null where id = $1`, [s1.id]);
ok(await eventos("sesion_fin") === 1, "con el resumen guardado se avisa (evento 'sesion_fin')");
ok((await db.query("select de_usuario from public.eventos where tipo = 'sesion_fin'")).rows[0].de_usuario === uid("mar"),
  "el aviso sale a nombre de quien la cerró (así le llega al otro)");

// ---- descartar ----
const s2 = await uno("mar", "select * from public.sesion_abrir()");
ok(s2.numero === 2, "la siguiente es la número 2");
ok((await uno("fer", "select public.sesion_descartar($1) d", [s2.id])).d === true, "una sesión en la que nadie escribió se puede descartar");
const s3 = await uno("mar", "select * from public.sesion_abrir()");
ok(s3.numero === 2, "y su número se vuelve a usar");
await como("mar", "select public.sesion_escribir($1, 'hola')", [s3.id]);
ok((await uno("fer", "select public.sesion_descartar($1) d", [s3.id])).d === false, "una en la que ya escribieron no se descarta");
ok((await uno("intruso", "select public.sesion_descartar($1) d", [s3.id])).d === false, "y otra persona no puede descartar nada");

// ---- tiempo real ----
const pub = (await db.query("select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename like 'sesion%' order by 1")).rows;
ok(pub.map((r) => r.tablename).join() === "sesion_mensajes,sesiones", "las dos tablas llegan en tiempo real");

console.log(fallas ? `\n${fallas} prueba(s) fallaron` : "\nTodo bien ✓");
process.exit(fallas ? 1 : 0);
