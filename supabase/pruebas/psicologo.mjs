// Prueba «Tu espacio» (psicologo.sql) en un Postgres local (PGlite, sin Docker y sin tocar la base real):
// que solo Fernando lo tenga, que nadie más lea lo suyo (ni Martina, ni alguien sin sesión), el turno de Claude,
// el cierre, que no salga ningún aviso y que se pueda repetir. stub-schema.sql imita lo justo de Supabase.
//   npm install && node psicologo.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
const leer = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const ID = { fer: "f1", mar: "a2", eli: "e3" };
const uid = (k) => `00000000-0000-0000-0000-0000000000${ID[k]}`;
let fallas = 0;
const ok = (cond, txt) => { console.log(`${cond ? "OK " : "MAL"} ${txt}`); if (!cond) fallas++; };

// Corre algo como una de las cuentas (con las reglas de RLS), como alguien sin sesión (anon) o como la función (service role)
async function como(quien, sql, params = []) {
  await db.exec("reset role");
  if (quien === "funcion") await db.exec("set role service_role");
  else if (quien === "anon") await db.exec("set role anon");
  else { await db.exec("set role authenticated"); await db.query("select set_config('test.uid', $1, false)", [uid(quien)]); }
  try { return await db.query(sql, params); }
  finally { await db.exec("reset role"); await db.query("select set_config('test.uid', '', false)"); }
}
async function falla(quien, sql, params) {
  try { await como(quien, sql, params); return false; } catch (e) { return e.message; }
}
const uno = async (quien, sql, params) => (await como(quien, sql, params)).rows[0];
const cuantas = async (quien, tabla) => (await como(quien, `select count(*)::int n from public.${tabla}`)).rows[0].n;
const eventos = async () => (await db.query("select count(*)::int n from public.eventos")).rows[0].n;

await db.exec(leer("./stub-schema.sql"));
await db.exec(leer("../schema.sql"));
for (const [k, usuario, nombre] of [["fer", "fernando", "Fernando"], ["mar", "martina", "Martina"], ["eli", "eli", "Eli"]]) {
  await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [uid(k), `${usuario}@nosotros.invalid`]);
  await db.query("insert into public.perfiles (id, nombre) values ($1, $2)", [uid(k), nombre]);
}
await como("fer", "select public.entrar_pareja()");
await como("mar", "select public.entrar_pareja()");
const SQL = leer("../psicologo.sql");
await db.exec(SQL);
await db.exec(SQL); // se puede repetir sin errores (y Fernando no queda dos veces)
ok(true, "psicologo.sql corre dos veces seguidas sin error");
const eventosAntes = await eventos();

// ---- quién lo tiene ----
ok((await uno("fer", "select public.psico_puedo() as v")).v === true, "Fernando tiene su espacio");
ok((await uno("mar", "select public.psico_puedo() as v")).v === false, "Martina no lo tiene");
ok((await uno("eli", "select public.psico_puedo() as v")).v === false, "nadie más lo tiene");
ok(await cuantas("fer", "psico_permitidos") === 1, "Fernando ve su fila de permitido");
ok(await cuantas("mar", "psico_permitidos") === 0, "Martina no ve quién tiene espacio");
ok((await db.query("select count(*)::int n from public.psico_permitidos")).rows[0].n === 1, "Fernando quedó una sola vez");
ok(!!(await falla("anon", "select public.psico_puedo()")), "sin sesión no se puede ni preguntar");

// ---- abrir ----
const s1 = await uno("fer", "select * from public.psico_abrir()");
ok(s1.numero === 1 && s1.estado === "abierta" && s1.usuario_id === uid("fer"), "Fernando abre su sesión 1");
ok((await uno("fer", "select * from public.psico_abrir()")).id === s1.id, "si vuelve a tocar «Empezar», cae en la misma");
ok((await uno("mar", "select * from public.psico_abrir()")).id === null, "Martina no puede abrir una");
ok((await uno("eli", "select * from public.psico_abrir()")).id === null, "alguien sin permiso tampoco");

// ---- escribir ----
const m1 = await uno("fer", "select * from public.psico_escribir($1, $2)", [s1.id, "  Hoy llego con un 5  "]);
ok(m1.texto === "Hoy llego con un 5" && m1.de_claude === false, "Fernando escribe (sin espacios de más)");
ok((await uno("fer", "select * from public.psico_escribir($1, '   ')", [s1.id])).id === null, "un mensaje vacío no se guarda");
ok((await uno("mar", "select * from public.psico_escribir($1, 'hola')", [s1.id])).id === null, "Martina no puede escribir en la sesión de Fernando");
ok(!!(await falla("fer", "insert into public.psico_mensajes (sesion_id, usuario_id, de_claude, texto) values ($1, $2, true, 'falso Claude')", [s1.id, uid("fer")])),
  "nadie escribe directo en la tabla (ni haciéndose pasar por Claude)");
ok(!!(await falla("fer", "update public.psico_sesiones set estado = 'cerrada' where id = $1", [s1.id])), "nadie cambia la sesión directo");

// ---- nadie más lee ----
await como("funcion", "insert into public.psico_perfil (usuario_id, formulacion) values ($1, '{\"quien_eres\":\"x\"}')", [uid("fer")]);
for (const t of ["psico_sesiones", "psico_mensajes", "psico_perfil"]) {
  ok(await cuantas("fer", t) === 1, `Fernando lee su ${t}`);
  ok(await cuantas("mar", t) === 0, `Martina no ve nada en ${t}`);
  ok(await cuantas("eli", t) === 0, `nadie más ve nada en ${t}`);
  ok(!!(await falla("anon", `select count(*) from public.${t}`)), `sin sesión, ${t} ni se puede consultar`);
}
ok((await uno("mar", "select public.psico_descartar($1) as v", [s1.id])).v === false, "Martina no puede descartar la sesión de Fernando");
ok((await uno("mar", "select public.psico_borrar_todo() as n")).n === 0, "si Martina toca «borrar todo», no borra nada de Fernando");
ok(await cuantas("fer", "psico_mensajes") === 1, "lo de Fernando sigue intacto");

// ---- el turno de Claude (función) ----
ok(!!(await falla("fer", "select public.psico_tomar_turno($1)", [s1.id])), "la app no puede tomar el turno de Claude");
ok((await uno("funcion", "select public.psico_tomar_turno($1) as v", [s1.id])).v === true, "la función toma el turno");
ok((await uno("funcion", "select public.psico_tomar_turno($1) as v", [s1.id])).v === false, "una segunda llamada no puede tomarlo a la vez");
await como("funcion", "insert into public.psico_mensajes (sesion_id, usuario_id, de_claude, texto) values ($1, $2, true, 'Hola, Fernando')", [s1.id, uid("fer")]);
await como("funcion", "select public.psico_soltar_turno($1)", [s1.id]);
ok((await uno("fer", "select pensando_desde from public.psico_sesiones where id = $1", [s1.id])).pensando_desde === null, "al soltar el turno ya no está «escribiendo»");
await db.query("update public.psico_sesiones set pensando_desde = now() - interval '3 minutes' where id = $1", [s1.id]);
ok((await uno("funcion", "select public.psico_tomar_turno($1) as v", [s1.id])).v === true, "un turno colgado se puede volver a tomar");
await como("funcion", "select public.psico_soltar_turno($1)", [s1.id]);

// ---- terminar ----
ok((await uno("fer", "select public.psico_descartar($1) as v", [s1.id])).v === false, "una sesión en la que ya escribió no se descarta");
ok((await uno("funcion", "select public.psico_empezar_cierre($1) as v", [s1.id])).v === true, "la función empieza el cierre");
ok((await uno("funcion", "select public.psico_empezar_cierre($1) as v", [s1.id])).v === false, "no se cierra dos veces a la vez");
ok((await uno("fer", "select * from public.psico_escribir($1, 'una cosa más')", [s1.id])).id === null, "mientras se resume ya no se escribe");
await como("funcion", "update public.psico_sesiones set estado = 'cerrada', tema = 'El trabajo', cerrada_en = now(), pensando_desde = null where id = $1", [s1.id]);
const s2 = await uno("fer", "select * from public.psico_abrir()");
ok(s2.numero === 2 && s2.id !== s1.id, "después de cerrar, la siguiente es la número 2");
ok((await uno("fer", "select public.psico_descartar($1) as v", [s2.id])).v === true, "una recién abierta, sin escribir, se descarta");

// ---- sin avisos ----
ok(await eventos() === eventosAntes, "nada de esto escribe en `eventos`: no hay avisos ni notificaciones para Martina");

// ---- borrar todo ----
ok((await uno("fer", "select public.psico_borrar_todo() as n")).n === 1, "Fernando borra todo su espacio");
ok(await cuantas("fer", "psico_sesiones") === 0 && await cuantas("fer", "psico_mensajes") === 0 && await cuantas("fer", "psico_perfil") === 0,
  "no queda nada: ni sesiones, ni mensajes, ni lo que Claude entendió");
ok((await uno("fer", "select public.psico_puedo() as v")).v === true, "y sigue teniendo su espacio para empezar de nuevo");

console.log(fallas ? `\n${fallas} prueba(s) fallaron` : "\nTodo bien");
process.exit(fallas ? 1 : 0);
