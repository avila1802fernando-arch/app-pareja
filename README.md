# Nosotros ❤️

App de pareja: cada vez que uno de los dos la abre, el otro recibe una notificación de "te extraño" en el teléfono, incluso bloqueado. Funciona en Android (Chrome) y en iPhone (iOS 16.4 o superior, instalada en pantalla de inicio).

Costo: **US$0**. Supabase (base de datos, login, función de envío) y Vercel (hosting) en sus planes gratuitos, sin tarjeta.

## Estructura

```
public/                 ← la app (HTML, CSS, JS, íconos, service worker)
  config.js             ← TUS claves públicas (editar)
supabase/schema.sql     ← tablas y seguridad (pegar en el SQL Editor)
supabase/functions/notificar/index.ts  ← envía las push
vercel.json
```

---

## Paso 1 · Cuentas (10 min)

Crea cuenta, con el mismo correo, en:
- https://github.com
- https://supabase.com  (elige "Sign in with GitHub")
- https://vercel.com    (elige "Continue with GitHub")

Sube esta carpeta a un repositorio nuevo en GitHub llamado `nosotros` (puede ser privado). Desde tu PC con Windows:

```bash
cd nosotros-app
git init
git add .
git commit -m "Nosotros"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/nosotros.git
git push -u origin main
```

## Paso 2 · Supabase: proyecto y base de datos (10 min)

1. En Supabase → **New project**. Nombre `nosotros`, región **South America (São Paulo)**. Guarda la contraseña de la base de datos aunque no la vas a usar.
2. Cuando termine de crearse: menú **SQL Editor** → **New query** → pega todo el contenido de `supabase/schema.sql` → **Run**. Debe decir "Success".
3. Menú **Project Settings → API**. Copia:
   - **Project URL** → en `public/config.js`, campo `SUPABASE_URL`
   - **anon public** key → campo `SUPABASE_ANON_KEY`
4. Menú **Authentication → Providers → Email**: deja activo *Enable Email provider* y **desactiva** *Confirm email* (así el código de 6 dígitos entra directo).
5. Menú **Authentication → Email Templates → Magic Link**: reemplaza el cuerpo por esto, para que el correo traiga el código en lugar de un enlace:
   ```html
   <h2>Tu código para entrar a Nosotros</h2>
   <p style="font-size:32px;letter-spacing:6px"><b>{{ .Token }}</b></p>
   <p>Vence en 1 hora.</p>
   ```

> El correo gratuito de Supabase permite pocos envíos por hora (unos 3-4). Para dos personas que entran de vez en cuando alcanza, y la sesión queda guardada en el teléfono, así que casi nunca volverán a pedir código.

## Paso 3 · Claves de notificación (2 min)

En tu PC (necesitas Node.js instalado):

```bash
npx web-push generate-vapid-keys
```

Te da una **Public Key** y una **Private Key**.
- La pública va en `public/config.js`, campo `VAPID_PUBLIC_KEY`.
- La privada la usarás en el paso 5. No la subas a GitHub.

Haz commit y push de `config.js` ya rellenado.

## Paso 4 · Vercel: publicar la app (5 min)

1. En Vercel → **Add New → Project** → importa el repo `nosotros`.
2. En *Root Directory* escribe `public`. Framework: **Other**. Deploy.
3. Al terminar tendrás una URL tipo `https://nosotros-xxxx.vercel.app`. Esa es la app.
4. Vuelve a Supabase → **Authentication → URL Configuration** → en *Site URL* pega esa URL.

Desde ahora cada `git push` vuelve a publicar solo.

## Paso 5 · Función que envía las push (10 min)

Instala la CLI de Supabase (una vez):

```bash
npm install -g supabase
```

Luego, dentro de la carpeta del proyecto:

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF     # el "ref" está en Project Settings → General

# Inventa una clave secreta larga para el webhook, por ejemplo con: openssl rand -hex 24
supabase secrets set VAPID_PUBLIC_KEY="la publica" VAPID_PRIVATE_KEY="la privada" VAPID_SUBJECT="mailto:tu@correo.com" WEBHOOK_SECRET="tu-clave-secreta"

supabase functions deploy notificar --no-verify-jwt
```

Al terminar te muestra la URL de la función, parecida a
`https://TU_REF.supabase.co/functions/v1/notificar`.

## Paso 6 · Conectar la base de datos con la función (3 min)

En Supabase → **Database → Webhooks** → **Create a new hook**:
- Name: `notificar`
- Table: `eventos`
- Events: solo **Insert**
- Type: **HTTP Request**, método **POST**
- URL: la URL de la función del paso 5
- HTTP Headers → **Add new header**: `x-webhook-secret` = la misma clave que pusiste en `WEBHOOK_SECRET`
- Timeout: 5000

Guardar. Listo: cada vez que alguien entra o toca "te extraño", la base de datos avisa a la función y la función manda la push al otro teléfono.

## Paso 7 · Instalar en los teléfonos

**Android (Chrome)**
1. Abre la URL de Vercel. Chrome ofrece "Agregar a pantalla de inicio" (o menú ⋮ → *Instalar app*).
2. Abre la app desde el ícono, entra con tu correo, escribe tu nombre y **Crear nuestra pareja**. Te da un código de 6 letras.
3. Toca **Activar notificaciones** y acepta.

**iPhone (Safari, iOS 16.4+)**
1. Abre la URL en **Safari** (no en Chrome ni desde WhatsApp).
2. Botón Compartir → **Agregar a pantalla de inicio** → Agregar.
3. Abre la app **desde el ícono** (es obligatorio: fuera de ahí iOS no permite notificaciones).
4. Entra con su correo, escribe su nombre, pone el código que le pasaste y **Unirme**.
5. Toca **Activar notificaciones** y acepta. iPhone también pide tener activas las notificaciones en Ajustes → Notificaciones → Nosotros.

## Prueba

Uno cierra la app y bloquea el teléfono. El otro abre la app. En pocos segundos debe sonar: "Fernando acaba de entrar ❤️ Y te extraña."

Reglas que ya trae:
- Si la misma persona entra varias veces en 15 minutos, solo se avisa la primera (para no ser pesados). Puedes cambiarlo en `MINUTOS_SIN_REPETIR` dentro de `index.ts`.
- El botón "te extraño" siempre avisa, sin límite.

## Si algo no funciona

| Síntoma | Revisar |
|---|---|
| No llega el correo con el código | Carpeta spam; límite de envíos por hora de Supabase; que *Confirm email* esté desactivado |
| "Código no válido" al unirse | Que el primero haya tocado "Crear nuestra pareja" y que el código esté bien escrito (sin O ni I ni 0 ni 1, no se usan) |
| No aparece el botón de notificaciones en iPhone | La app se abrió desde Safari y no desde el ícono de la pantalla de inicio |
| La push no llega | Supabase → **Edge Functions → notificar → Logs**. Si dice "no autorizado", el header `x-webhook-secret` no coincide. Si dice `enviadas: 0`, la otra persona no activó notificaciones |
| Vercel muestra 404 | *Root Directory* debe ser `public` |
