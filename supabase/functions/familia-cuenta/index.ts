// Edge Function "familia-cuenta" — las cuentas del Recreo (juegos en familia)
// (La función `cuenta` de Nosotros no se toca: esta es aparte.)
//
// Igual que `cuenta`: usuario y contraseña, sin correo. Supabase Auth necesita un email, así que se usa uno
// interno usuario@familia.invalid. OJO: NUNCA @nosotros.invalid, que es el de la pareja: con ese dominio
// entrar_pareja() le armaría una "pareja" nueva a quien entre a Nosotros y le llegarían los mesiversarios.
//   POST { accion: "estado", usuario }        → { existe }   (la app decide si muestra "crea tu contraseña" o "tu contraseña")
//   POST { accion: "crear", usuario, clave }  → { ok: true }
//
// Se publica con --no-verify-jwt porque la llama alguien que todavía no tiene sesión.
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen inyectados por Supabase.
// FAMILIA_PERMITIDOS (obligatorio): "eli,maritza". Solo esos usuarios existen; sin la lista no se crea nada.
// MAX_FAMILIA (opcional, por defecto 10): tope de cuentas de la familia.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const DOMINIO = "familia.invalid"; // el mismo que en familia/app.js
const MAX_FAMILIA = Number(Deno.env.get("MAX_FAMILIA") ?? 10);
const PERMITIDOS = (Deno.env.get("FAMILIA_PERMITIDOS") ?? "")
  .split(",").map((u) => u.trim().toLowerCase()).filter((u) => /^[a-z0-9._-]{3,24}$/.test(u));

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, "content-type": "application/json" } });

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Las cuentas que ya existen de la familia (son pocas: con una página alcanza)
async function cuentasDeLaFamilia(): Promise<string[]> {
  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.map((u) => u.email ?? "").filter((e) => e.endsWith(`@${DOMINIO}`));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return responder({ error: "Método no permitido." }, 405);

  let datos: { accion?: unknown; usuario?: unknown; clave?: unknown };
  try { datos = await req.json(); } catch { return responder({ error: "Datos no válidos." }, 400); }
  const usuario = String(datos.usuario ?? "").trim().toLowerCase();
  if (!PERMITIDOS.includes(usuario)) return responder({ error: "Ese nombre no está en la lista de la familia." }, 403);

  let familia: string[];
  try { familia = await cuentasDeLaFamilia(); }
  catch { return responder({ error: "No se pudo revisar las cuentas. Intenta de nuevo." }, 500); }
  const existe = familia.includes(`${usuario}@${DOMINIO}`);

  if (datos.accion === "estado") return responder({ existe });
  if (datos.accion !== "crear") return responder({ error: "Acción no válida." }, 400);

  const clave = String(datos.clave ?? "");
  if (clave.length < 8 || clave.length > 72) {
    return responder({ error: "La contraseña debe tener entre 8 y 72 letras o números." }, 400);
  }
  if (existe) return responder({ error: "Esa cuenta ya existe: entra con tu contraseña." }, 409);
  if (familia.length >= MAX_FAMILIA) return responder({ error: "Ya están todas las cuentas de la familia." }, 403);

  const { error } = await sb.auth.admin.createUser({
    email: `${usuario}@${DOMINIO}`,
    password: clave,
    email_confirm: true,
    user_metadata: { usuario, recreo: true },
  });
  if (error) {
    const yaExiste = /already|registered|exists/i.test(error.message);
    return responder(
      { error: yaExiste ? "Esa cuenta ya existe: entra con tu contraseña." : "No se pudo crear la cuenta: " + error.message },
      yaExiste ? 409 : 400,
    );
  }
  return responder({ ok: true });
});
