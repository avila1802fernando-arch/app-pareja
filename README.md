# Nosotros ❤️

App de pareja a distancia. Funciona en Android (Chrome) y en iPhone (iOS 16.4 o superior, instalada en pantalla de inicio), con notificaciones aunque el teléfono esté bloqueado.

Costo: **US$0**. Supabase (base de datos, login, funciones) y Vercel (hosting) en sus planes gratuitos, sin tarjeta.

## Qué hace

- **Inicio**
  - Cada vez que uno entra, el otro recibe "te extraño".
  - **Relojes**: la hora de cada uno, con la diferencia. Se calcula sola con la zona horaria de cada perfil: Ecuador está siempre en UTC−5 y Chile en UTC−3 con su horario de verano (septiembre–abril) o UTC−4 el resto del año, así que se ve "+2 h" o "+1 h".
  - **Cuenta regresiva**: el corazón muestra los días que faltan para el próximo *viaje* o *cita* del calendario, con una barra de cuánto de la espera ya pasó. Debajo, "Juntos hace 1 año, 3 meses…" (la fecha se pone en Ajustes) y "¡Hoy cumplen…!" en aniversarios y mesiversarios.
  - **Estoy libre para hablar**: el otro lo ve en vivo y recibe una push; si los dos están libres, aparece "¡Los dos están libres!". Se apaga sola a las 2 horas.
  - **Señales**: abrazo 🤗, beso 😘, pienso en ti 💭, buenos días ☀️ y buenas noches 🌙. Llegan como push con vibración y, con la app abierta, llueven emojis por la pantalla.
  - **Ánimo**: cada uno comparte cómo se siente (y una nota corta); si es triste o con estrés, la push le sugiere al otro mandar un abrazo.
  - **Fotos de perfil** de los dos y **momentos 📸**: una foto del día con un texto, que le aparece al otro en el Inicio. Las fotos van a un bucket **privado** de Supabase Storage: solo las ve la pareja (no están en el código ni en GitHub).
  - **Distancia 📍**: "N km nos separan", con la ubicación de cada uno redondeada a ~10 km (se activa en Ajustes).
  - **Días especiales**: el día del mes en que se conocieron y en que se hicieron novios se celebran en el Inicio, se marcan en el calendario y les llega un aviso a los dos a las 9:00.
- **Juntos**
  - **Pregunta del día**: la misma para los dos. La respuesta del otro solo se puede leer después de responder. Racha 🔥 de días seguidos e historial.
  - **Cartas**: para leer con calma, en papel y con letra manuscrita. Se pueden **sellar hasta una fecha** (el aniversario, el día del viaje…): hasta entonces solo se ve de quién es y cuándo se abre, y llega un aviso cuando ya se puede abrir.
  - **Cuando nos veamos**: lista compartida de cosas para hacer juntos, para ir tachando.
  - **Nuestro girasol 🌻**: una planta que riegan los dos (una vez por día cada uno) y crece por etapas hasta florecer; si siguen regando, se vuelve un ramo.
  - **Frasco de razones 🫙**: "te quiero porque…". El otro no puede leerlas hasta sacarlas del frasco (lo asegura la base de datos).
  - **Vales de amor 🎟️**: "un abrazo de 10 minutos", "tú eliges la película"… para canjear cuando se vean; a quien lo regaló le llega un aviso al canjearlo.
  - **Nuestros momentos**: el álbum con las fotos del día de los dos.
- **Horarios** · Cuadrícula semanal donde cada uno marca cuándo normalmente puede. Se ven los dos horarios y las **horas en común**, siempre con las dos horas locales.
- **Calendario** · Llamadas, citas, viajes, aniversarios. Vista mes y lista de próximos. Al crear o cambiar algo, el otro recibe una push; **30 minutos antes** les llega un recordatorio a los dos.
- **Ajustes** · Nombre, zona horaria, "juntos desde", notificaciones y cerrar sesión.

## Estructura

```
public/                 ← la app (HTML, CSS, JS, íconos, service worker)
  config.js             ← TUS claves públicas (editar)
  preguntas.js          ← las preguntas del día (puedes agregar las tuyas)
supabase/schema.sql     ← tablas y seguridad (pegar en el SQL Editor; se puede repetir)
supabase/cron.sql       ← tarea cada 5 min para recordatorios (editar 2 valores y pegar)
supabase/functions/
  _shared/push.ts       ← código común para enviar push
  notificar/index.ts    ← push por "te extraño", señales, ánimo, cartas, pregunta del día y calendario
  recordatorios/index.ts← recordatorios 30 min antes, cartas que ya se pueden abrir y apaga "estoy libre" vencidos
public/vercel.json     ← encabezados para Vercel (va dentro de public: ahí lo lee)
```

---

## Paso 1 · Cuentas (10 min)

Crea cuenta, con el mismo correo, en:
- https://github.com
- https://supabase.com  (elige "Sign in with GitHub")
- https://vercel.com    (elige "Continue with GitHub")

Sube esta carpeta a un repositorio nuevo en GitHub llamado `nosotros` (puede ser privado). Desde tu PC con Windows:

```bash
git init
git add .
git commit -m "Nosotros"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/nosotros.git
git push -u origin main
```

## Paso 2 · Supabase: proyecto y base de datos (10 min)

1. En Supabase → **New project**. Nombre `nosotros`, región **South America (São Paulo)**. Guarda la contraseña de la base de datos aunque no la vas a usar.
2. Cuando termine de crearse: menú **SQL Editor** → **New query** → pega todo el contenido de `supabase/schema.sql` → **Run**. Debe decir "Success". (Puedes volver a correrlo cuando el archivo cambie: no borra nada.)
3. Menú **Project Settings → API**. Copia:
   - **Project URL** → en `public/config.js`, campo `SUPABASE_URL`
   - **anon public** key → campo `SUPABASE_ANON_KEY`
4. Menú **Authentication → Sign In / Providers**: deja activo **Email** (por dentro las cuentas usan un correo interno). *Confirm email* da igual: la función `cuenta` crea las cuentas ya confirmadas. Recomendado: **desactiva "Allow new users to sign up"**, así nadie puede registrarse por fuera de la app (la función `cuenta` sí puede, y tiene un tope de 6 cuentas).

> **Usuario y contraseña, sin correo.** Supabase exige un email, así que cada cuenta usa uno interno `usuario@nosotros.invalid`. El dominio `.invalid` no existe: nunca se envía ni se recibe nada, y nadie puede pedir "recuperar contraseña" por ustedes. Si alguien olvida su contraseña, se cambia desde **Ajustes** (con la sesión abierta) o se borra el usuario en **Authentication → Users** y se crea de nuevo (sus datos de pareja se pierden).

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

**Si el repo no aparece al importar** (tu Vercel está conectado a otra cuenta de GitHub), publica con la CLI, desde la carpeta del proyecto:

```bash
cd public
npx vercel login
npx vercel link --yes --project nosotros
npx vercel deploy --prod
```

Con esta forma, cada vez que haya cambios se publica repitiendo `npx vercel deploy --prod` dentro de `public`. `public/.vercelignore` evita que se suban archivos locales como `.env.local`.

## Paso 5 · Funciones que envían las push (10 min)

La CLI de Supabase se usa con `npx` (no hace falta instalarla; Supabase no permite `npm install -g`).

Crea un archivo `.env` en la carpeta del proyecto (ya está en `.gitignore`, no se sube) con:

```
VAPID_PUBLIC_KEY=la publica
VAPID_PRIVATE_KEY=la privada
VAPID_SUBJECT=https://tu-app.vercel.app
WEBHOOK_SECRET=una-clave-larga-inventada
```

Luego, dentro de la carpeta del proyecto:

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF     # el "ref" está en Project Settings → General
npx supabase secrets set --env-file .env
npx supabase functions deploy cuenta --no-verify-jwt
npx supabase functions deploy notificar --no-verify-jwt
npx supabase functions deploy recordatorios --no-verify-jwt
```

`cuenta` es la que crea las cuentas desde la app: sin ella, "Crear una cuenta nueva" no funciona.

Al terminar te muestra las URLs de las funciones, parecidas a
`https://TU_REF.supabase.co/functions/v1/notificar` y `.../recordatorios`.

## Paso 6 · Webhooks: la base de datos avisa a la función (5 min)

En Supabase → **Database → Webhooks** → **Create a new hook**. Crea **dos**:

| | Webhook 1 | Webhook 2 |
|---|---|---|
| Name | `notificar` | `notificar-calendario` |
| Table | `eventos` | `eventos_cal` |
| Events | solo **Insert** | **Insert**, **Update** y **Delete** |
| Type | HTTP Request, **POST** | HTTP Request, **POST** |
| URL | la URL de `notificar` del paso 5 | la misma URL de `notificar` |
| HTTP Headers | `x-webhook-secret` = tu `WEBHOOK_SECRET` | igual |
| Timeout | 5000 | 5000 |

El primero avisa cuando alguien entra, manda "te extraño" o una señal, se pone libre, comparte su ánimo, responde la pregunta del día o escribe una carta (todo eso queda registrado en `eventos`, por eso no necesita webhooks propios). El segundo avisa cuando se agenda, cambia o cancela algo del calendario.

## Paso 7 · Recordatorios cada 5 minutos (5 min)

1. Supabase → **Database → Extensions**: busca y activa **pg_cron** y **pg_net** (si `cron.sql` falla en la primera línea, es esto).
2. Abre `supabase/cron.sql` y reemplaza:
   - `TU_REF` por el *Reference ID* del proyecto (Project Settings → General)
   - `TU_WEBHOOK_SECRET` por la misma clave del paso 5
3. Pega el archivo en **SQL Editor** → **Run**.

Desde entonces, cada 5 minutos la función `recordatorios` manda el aviso de lo que empieza en 30 minutos, avisa de las cartas selladas que ya se pueden abrir y apaga los "estoy libre" vencidos. Para comprobar que corre: `select * from cron.job_run_details order by start_time desc limit 5;` (debe decir `succeeded`).

## Paso 8 · Instalar en los teléfonos

**Android (Chrome)**
1. Abre la URL de Vercel. Chrome ofrece "Agregar a pantalla de inicio" (o menú ⋮ → *Instalar app*).
2. Abre la app desde el ícono, toca **Crear una cuenta nueva** (usuario y contraseña), escribe tu nombre y **Crear nuestra pareja**. Te da un código de 6 letras.
3. En **Ajustes**, toca **Activar notificaciones** y acepta. Revisa ahí que la zona horaria sea la tuya (la app toma la del teléfono).

**iPhone (Safari, iOS 16.4+)**
1. Abre la URL en **Safari** (no en Chrome ni desde WhatsApp).
2. Botón Compartir → **Agregar a pantalla de inicio** → Agregar.
3. Abre la app **desde el ícono** (es obligatorio: fuera de ahí iOS no permite notificaciones).
4. Crea su cuenta (o entra con el usuario y la contraseña que le pasaste), escribe su nombre, pone el código de la pareja y **Unirme**.

**Desde el computador** también funciona: abre la misma URL en Chrome, Edge o Safari y entra con el mismo usuario. Se ve con menú a la izquierda y en dos columnas. (Las notificaciones en el computador llegan solo si el navegador está abierto.)
5. En **Ajustes**, toca **Activar notificaciones** y acepta. iPhone también pide tener activas las notificaciones en Ajustes → Notificaciones → Nosotros.

## Si ya tenías una versión anterior funcionando

Cada vez que llega una versión nueva:

1. `git push` (Vercel publica solo).
2. Supabase → SQL Editor: vuelve a correr **todo** `supabase/schema.sql` (no borra nada).
3. Vuelve a publicar las funciones:
   ```bash
   npx supabase functions deploy cuenta --no-verify-jwt
   npx supabase functions deploy notificar --no-verify-jwt
   npx supabase functions deploy recordatorios --no-verify-jwt
   ```
4. Si todavía no los tienes: el **Webhook 2** del paso 6 y el paso 7 (pg_cron). Las funciones nuevas (señales, ánimo, pregunta del día, cartas, lista) **no necesitan webhooks ni secretos nuevos**.

## Prueba

- Uno cierra la app y bloquea el teléfono. El otro abre la app. En pocos segundos debe sonar: "Fernando acaba de entrar ❤️ Y te extraña."
- Uno toca **Estoy libre para hablar**: al otro le llega "X está libre para una llamada ☎️" y en su Inicio aparece "X está libre ahora".
- Uno agenda una llamada para dentro de 40 minutos: al otro le llega "X agendó: …" y a los dos, unos 30 minutos antes, "En 30 min: …".
- Uno toca **Abrazo** 🤗: al otro le llega la push con vibración; si tenía la app abierta, llueven abrazos por la pantalla.
- Uno escribe una carta **sellada** para dentro de 10 minutos: el otro ve "🔒 Carta sellada de X · se abre…" y, cuando llega la hora (con un margen de hasta 5 minutos), le llega "Ya puedes abrir la carta de X".
- Agreguen el viaje que tengan planeado en **Calendario** con tipo *Viaje*: el corazón del Inicio empieza a contar los días.

Ajustes que ya trae (constantes al inicio de cada archivo):
- `MINUTOS_SIN_REPETIR = 15` en `notificar/index.ts`: si la misma persona entra varias veces en 15 minutos, solo se avisa la primera.
- `HORAS_LIBRE = 2` en `public/app.js`: cuánto dura "estoy libre".
- `MINUTOS_ANTES = 30` en `recordatorios/index.ts`: con cuánta anticipación llega el recordatorio.
- `public/preguntas.js`: la lista de preguntas del día. Agrega las tuyas al final (las respuestas viejas guardan el texto de su pregunta, así que no se mezclan).

## Si algo no funciona

| Síntoma | Revisar |
|---|---|
| "No se pudo crear la cuenta" | Que la función `cuenta` esté publicada (paso 5). Si dice que ya están todas las cuentas, borra las de prueba en **Authentication → Users** |
| "Usuario o contraseña incorrectos" | El usuario va en minúsculas y sin espacios; la contraseña distingue mayúsculas |
| "Código no válido" al unirse | Que el primero haya tocado "Crear nuestra pareja" y que el código esté bien escrito (sin O ni I ni 0 ni 1, no se usan) |
| No aparece el botón de notificaciones en iPhone | La app se abrió desde Safari y no desde el ícono de la pantalla de inicio |
| La push no llega | Supabase → **Edge Functions → notificar → Logs**. Si dice "no autorizado", el header `x-webhook-secret` no coincide. Si dice `enviadas: 0`, la otra persona no activó notificaciones |
| Llega "te extraño" pero no lo del calendario | Falta el Webhook 2 (tabla `eventos_cal`, con Insert, Update y Delete) |
| No llegan los recordatorios / "estoy libre" no se apaga solo | `select * from cron.job_run_details order by start_time desc limit 5;` en el SQL Editor. Si no hay filas, falta el paso 7; si dice `failed`, revisa `TU_REF` y el secreto en `cron.sql` |
| Las horas de mi pareja salen mal | Cada uno revisa su zona horaria en **Ajustes** |
| El corazón no muestra la cuenta regresiva | El encuentro debe estar en Calendario con tipo **Viaje** o **Cita** |
| Error al compartir ánimo, responder o mandar una señal nueva | Falta volver a correr `schema.sql` completo (crea las tablas nuevas y amplía los tipos de `eventos`) |
| No llega el aviso de "ya puedes abrir la carta" | Igual que los recordatorios: revisa `cron.job_run_details` (paso 7) |
| `schema.sql` da error | Córrelo completo, de arriba a abajo; está hecho para repetirse sin borrar datos |
| Vercel muestra 404 | *Root Directory* debe ser `public` |
