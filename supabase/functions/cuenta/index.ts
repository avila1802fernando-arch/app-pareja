// Edge Function "cuenta"
// Crea una cuenta con usuario y contraseña, sin correo. Supabase Auth necesita un email,
// así que se usa uno interno `usuario@nosotros.invalid`: el dominio .invalid no existe y nunca
// recibe mensajes. La cuenta queda confirmada al crearse, así que no se envía nada.
//
// Se publica con --no-verify-jwt porque la llama alguien que todavía no tiene sesión.
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen inyectados por Supabase.
// MAX_CUENTAS (opcional, por defecto 6): tope de cuentas, para que nadie llene la base.
// USUARIOS_PERMITIDOS (opcional): lista separada por comas, p. ej. "fernando,martina".
//   Si existe, solo esos usuarios se pueden crear: la app queda solo para ustedes dos.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const DOMINIO = "nosotros.invalid"; // el mismo que en public/app.js
const MAX_CUENTAS = Number(Deno.env.get("MAX_CUENTAS") ?? 6);
const PERMITIDOS = (Deno.env.get("USUARIOS_PERMITIDOS") ?? "")
  .split(",").map((u) => u.trim().toLowerCase()).filter(Boolean);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, "content-type": "application/json" } });

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return responder({ error: "Método no permitido." }, 405);

  let datos: { usuario?: unknown; clave?: unknown };
  try { datos = await req.json(); } catch { return responder({ error: "Datos no válidos." }, 400); }
  const usuario = String(datos.usuario ?? "").trim().toLowerCase();
  const clave = String(datos.clave ?? "");
  if (!/^[a-z0-9._-]{3,24}$/.test(usuario)) {
    return responder({ error: "Usuario no válido: de 3 a 24 letras, números, punto o guion (sin espacios ni tildes)." }, 400);
  }
  if (clave.length < 8 || clave.length > 72) {
    return responder({ error: "La contraseña debe tener entre 8 y 72 caracteres." }, 400);
  }
  if (PERMITIDOS.length && !PERMITIDOS.includes(usuario)) {
    return responder({ error: "Esta app es privada y ese usuario no está permitido 💗" }, 403);
  }

  // Tope de cuentas: esta app es para una pareja (y alguna de prueba)
  const { data: lista, error: errLista } = await sb.auth.admin.listUsers({ page: 1, perPage: MAX_CUENTAS + 1 });
  if (errLista) return responder({ error: "No se pudo revisar las cuentas. Intenta de nuevo." }, 500);
  if (lista.users.length >= MAX_CUENTAS) {
    return responder({ error: "Esta app ya tiene todas sus cuentas. Borra alguna de prueba en Supabase → Authentication → Users." }, 403);
  }

  const { error } = await sb.auth.admin.createUser({
    email: `${usuario}@${DOMINIO}`,
    password: clave,
    email_confirm: true,
    user_metadata: { usuario },
  });
  if (error) {
    const yaExiste = /already|registered|exists/i.test(error.message);
    return responder(
      { error: yaExiste ? "Ese usuario ya existe. Elige otro o entra con tu contraseña." : "No se pudo crear la cuenta: " + error.message },
      yaExiste ? 409 : 400,
    );
  }
  return responder({ ok: true });
});
