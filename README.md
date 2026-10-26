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
  - **Dormir juntos 🌙**: "Me voy a dormir" le avisa al otro; si los dos están acostados se ve su nochecita (los dos tapaditos, cuánto llevan y la hora de cada uno). "Buenos días ☀️" cierra la noche y se puede contar qué se soñó. Cuenta las noches que durmieron juntos y la racha (`public/noche.js`).
  - **Concentrarnos juntos ⏳**: un rato de estudio o trabajo a la par. Uno propone (minutos, rondas, descanso y en qué va a trabajar), el otro dice «¡Vamos!» y corre el mismo reloj en los dos teléfonos, con cuenta regresiva, dos velitas que se consumen, pausa y «+5 min» para los dos, campanitas y la pantalla encendida. Suma los minutos de foco de la semana (`public/focus.js`, tabla `focos`).
- **Juntos**
  - **Sesión de pareja 💬**: un rato para hablar de ustedes con **Claude** como moderador. Cada uno escribe desde su teléfono y Claude contesta en la misma conversación: un tema por vez, turnos para escucharse, sin tomar partido. Se ve cuando el otro está adentro y cuando está escribiendo, y en lo que escribes aparece ✓ (enviado) y ✓✓ en turquesa cuando el otro ya lo vio. Con el **micrófono** se dicta en vez de escribir (lo hace el reconocimiento de voz del teléfono; si el teléfono no lo permite, queda el micrófono del teclado). Al tocar «Terminar», Claude escribe un **resumen** (cómo llegaron, lo que siente y necesita cada uno, su acuerdo y un ejercicio para la semana) que queda guardado para los dos y que Claude vuelve a leer en la sesión siguiente. El ejercicio y el acuerdo de la semana quedan en una notita en Juntos. Necesita una llave de Anthropic (paso 8) y tiene un costo pequeño (`public/sesion.js`, función `sesion`).
  - **Pregunta del día**: la misma para los dos. La respuesta del otro solo se puede leer después de responder. Racha 🔥 de días seguidos e historial.
  - **Cartas**: para leer con calma, en papel y con letra manuscrita. Se pueden **sellar hasta una fecha** (el aniversario, el día del viaje…): hasta entonces solo se ve de quién es y cuándo se abre, y llega un aviso cuando ya se puede abrir.
  - **Cuando nos veamos**: lista compartida de cosas para hacer juntos, para ir tachando.
  - **Nuestro girasol 🌻**: una planta que riegan los dos (una vez por día cada uno) y crece por etapas hasta florecer; si siguen regando, se vuelve un ramo.
  - **Frasco de razones 🫙**: "te quiero porque…". El otro no puede leerlas hasta sacarlas del frasco (lo asegura la base de datos).
  - **Vales de amor 🎟️**: "un abrazo de 10 minutos", "tú eliges la película"… para canjear cuando se vean; a quien lo regaló le llega un aviso al canjearlo.
  - **Nuestros momentos**: el álbum con las fotos del día de los dos.
- **Juegos** 🎮 · Cuatro minijuegos para jugar cada uno en su teléfono, con el **récord de cada uno** en cada juego y la corona 👑 para quien va ganando, y dos juegos para jugar los dos a la vez (`public/juegos/`):
  - **UNO en vivo** 🃏: las cartas de siempre. Del mismo color o número, salta, reversa, +2 y +4, y hay que decir "¡UNO!" cuando queda una (si el otro te pilla sin decirlo, robas dos). Gana quien se queda sin cartas y se lleva los puntos de lo que le quedó al otro. Las manos son secretas de verdad: la base baraja, reparte y revisa cada jugada (`supabase/uno.sql`). Con apuesta, aviso 🔔 y práctica contra la compu 🤖.
  - **Batalla naval en vivo** ⚓: cada uno acomoda su flota en secreto y se turnan para disparar (si aciertas, vuelves a disparar). Se puede apostar algo ("Quien pierde canta una canción…"), se ve si el otro tiene la batalla abierta y, si no, se le manda un aviso 🔔. Las flotas son secretas de verdad: los disparos los resuelve la base (`supabase/batalla.sql`). También se puede practicar contra la compu 🤖.
  - **Atrapa los corazones**: 90 segundos y 6 niveles tocando corazones (la postal "edición revancha", ahora para los dos). Cada corazón dice algo bonito con el nombre de quien juega.
  - **Vuelo hasta ti**: un corazón con alas vuela los km que los separan (los reales si activaron la ubicación) esquivando nubes de tormenta.
  - **Memoria de nosotros**: cuatro rondas contra el reloj para encontrar parejas (el girasol, las cartas, la misma luna…).
  - **Fusión de corazones**: como el 2048, de «me gustas» hasta «el primer abrazo» 🫂.
  - **Marcador del amor**: cuántos récords tiene cada uno. Si le quitas un récord al otro, le llega un aviso 🏆; al terminar se le puede **retar** 😏.
  - **Premio secreto** 💌: cada uno esconde un mensaje que el otro solo puede leer cuando le quita un récord.
- **Agenda** · El calendario y los horarios, en la misma pestaña (arriba se elige cuál ver).
- **Horarios** · Cuadrícula semanal donde cada uno marca cuándo normalmente puede. Se ven los dos horarios y las **horas en común**, siempre con las dos horas locales.
- **Calendario** · Llamadas, citas, viajes, aniversarios. Vista mes y lista de próximos. Al crear o cambiar algo, el otro recibe una push; **30 minutos antes** les llega un recordatorio a los dos.
- **Ajustes** · Nombre, zona horaria, "juntos desde", notificaciones y cerrar sesión.
- **Campanita 🔔** · Arriba a la derecha, en todas las pestañas. Cada push que manda la app (señales, cartas, calendario, recordatorios…) queda guardada ahí durante 3 meses, aunque se borre del teléfono o ese teléfono no tenga las push activadas. El número son las que todavía no se vieron; tocar una lleva a lo suyo. Las guarda `enviarPush` (`supabase/functions/_shared/push.ts`) en la tabla `notificaciones`, así que hay que volver a publicar `notificar` y `recordatorios`.

## Estilo visual: correo aéreo entre los dos

Para que nada se vea de plantilla, todo sale de la papelería de cartas entre Ecuador y Chile (sección "CORREO AÉREO" al final de `public/styles.css` y tokens al principio):

- **Botones**: tinta sólida con un filete fino adentro y el canto de un sello abajo (`--filete`, `--accent-hondo`); los secundarios con borde punteado de recortable. Nada de píldoras con degradado y brillo.
- **Íconos**: los del sprite de `index.html` (`<svg class="ico"><use href="#i-…"/></svg>`, en JS `iconoSvg("…")`), con el mismo trazo que la barra. Los emojis van en los textos (mensajes, avisos, ideas de vales), no como íconos de botones o listas.
- **Campos**: renglón de carta (línea de tinta abajo; las áreas de texto con renglones).
- **Títulos de sección**: subrayado a mano (`--garabato`); los antetítulos (`.eyebrow`) escritos con Caveat.
- **Detalles**: estampillas perforadas ("nuestro amor en números", íconos de los juegos), cinta adhesiva en las tarjetas destacadas, rayas de correo aéreo en rosa y turquesa (`--aereo`, un color de cada uno) arriba de las ventanas y del marcador, avisos como notita amarilla, boletos de feria en la sala de juegos y un matasellos "Por avión · EC ⇄ CL" en la entrada.

## Estructura

```
public/                 ← la app (HTML, CSS, JS, íconos, service worker)
  config.js             ← TUS claves públicas (editar)
  preguntas.js          ← las preguntas del día (puedes agregar las tuyas)
  juegos/               ← la sala de juegos (sala.js), cada minijuego (corazones, vuelo, memoria, fusion), la batalla naval (batalla.js, batalla-motor.js) y el UNO (uno.js, uno-motor.js)
supabase/schema.sql     ← tablas y seguridad (pegar en el SQL Editor; se puede repetir)
supabase/avisos.sql     ← la base avisa a las funciones: triggers + tarea cada 5 min (editar 2 valores y pegar)
supabase/batalla.sql    ← la batalla naval en vivo: flotas secretas, turnos y avisos (pegar después de avisos.sql)
supabase/uno.sql        ← el UNO en vivo: manos secretas, el mazo, las jugadas y avisos (pegar después de avisos.sql)
supabase/functions/
  _shared/push.ts       ← código común para enviar push
  notificar/index.ts    ← push por "te extraño", señales, ánimo, cartas, pregunta del día, calendario y sesiones
  recordatorios/index.ts← recordatorios 30 min antes, cartas que ya se pueden abrir y apaga "estoy libre" vencidos
  sesion/index.ts       ← Claude modera las sesiones de pareja (instrucciones.ts: cómo modera y el formato del resumen)
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

> **Usuario y contraseña, sin correo.** Supabase exige un email, así que cada cuenta usa uno interno `usuario@nosotros.invalid`. El dominio `.invalid` no existe: nunca se envía ni se recibe nada, y nadie puede pedir "recuperar contraseña" por ustedes. Si alguien olvida su contraseña, se cambia desde **Ajustes** (con la sesión abierta) o, sin sesión, en **SQL Editor** (cambia el usuario y la clave nueva):
>
> ```sql
> update auth.users set encrypted_password = extensions.crypt('ClaveNueva123', extensions.gen_salt('bf', 10)), updated_at = now()
>  where email = 'martina@nosotros.invalid';
> ```
>
> **Nunca borres un usuario** en Authentication → Users: se borra en cascada la pareja y con ella **toda la historia de los dos** (cartas, fotos, calendario, girasol…), también lo que escribió el otro.

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

**App solo para ustedes dos:** agrega al `.env` la línea `USUARIOS_PERMITIDOS=fernando,martina` (y vuelve a correr `secrets set`). Así la función `cuenta` solo deja crear esos dos usuarios y rechaza a cualquier otro.

Al terminar te muestra las URLs de las funciones, parecidas a
`https://TU_REF.supabase.co/functions/v1/notificar` y `.../recordatorios`.

## Paso 6 · Avisos: la base de datos llama a las funciones (5 min)

Un solo script, `supabase/avisos.sql`, deja todo cableado: un trigger en `eventos` (entrar, "te extraño", señales, "estoy libre", ánimo, pregunta del día, cartas…) y otro en `eventos_cal` (agendar, cambiar o cancelar) que llaman a `notificar`, y una tarea cada 5 minutos que llama a `recordatorios`.

1. Supabase → **Database → Extensions**: activa **pg_cron** y **pg_net**.
2. Abre `supabase/avisos.sql` y cambia las dos líneas marcadas con ◀:
   - `TU_REF` por el *Reference ID* del proyecto (Project Settings → General)
   - `TU_WEBHOOK_SECRET` por la misma clave del paso 5
3. Pega el archivo en **SQL Editor** → **Run**. Se puede volver a correr: si lo corres sin cambiar esas dos líneas, se queda con los valores que ya había.
4. Para la **batalla naval** ⚓ y el **UNO** 🃏: pega también `supabase/batalla.sql` y `supabase/uno.sql` → **Run** (después de `avisos.sql`, así el reto y el "¡Avisarle!" llegan como push). Se pueden volver a correr.

No crees **Database Webhooks** en el panel: hacen lo mismo y cada aviso llegaría doble (si ya los tenías de una versión anterior, `avisos.sql` los quita).

Desde entonces, cada 5 minutos la función `recordatorios` manda el aviso de lo que empieza en 30 minutos, avisa de las cartas selladas que ya se pueden abrir y apaga los "estoy libre" vencidos. Para comprobar que corre: `select * from cron.job_run_details order by start_time desc limit 5;` (debe decir `succeeded`).

## Paso 7 · Instalar en los teléfonos

**Android (Chrome)**
1. Abre la URL de Vercel. Chrome ofrece "Agregar a pantalla de inicio" (o menú ⋮ → *Instalar app*).
2. Abre la app desde el ícono y toca **Crear una cuenta nueva** (usuario y contraseña). Entras directo al Inicio: no hay códigos, la pareja se arma sola (el primero que entra la crea y el otro queda unido apenas crea su cuenta). Los dos usuarios van en `USUARIOS` de `public/config.js`, iguales a `USUARIOS_PERMITIDOS` de la función `cuenta`. Tu nombre sale del usuario y se cambia en **Ajustes**.
3. En **Ajustes**, toca **Activar notificaciones** y acepta. Revisa ahí que la zona horaria sea la tuya (la app toma la del teléfono).

**iPhone (Safari, iOS 16.4+)**
1. Abre la URL en **Safari** (no en Chrome ni desde WhatsApp).
2. Botón Compartir → **Agregar a pantalla de inicio** → Agregar.
3. Abre la app **desde el ícono** (es obligatorio: fuera de ahí iOS no permite notificaciones).
4. Crea su cuenta con su usuario (o entra con el usuario y la contraseña que le pasaste): queda unida a la pareja sola y entra directo al Inicio.

**Desde el computador** también funciona: abre la misma URL en Chrome, Edge o Safari y entra con el mismo usuario. Se ve con menú a la izquierda y en dos columnas. (Las notificaciones en el computador llegan solo si el navegador está abierto.)
5. En **Ajustes**, toca **Activar notificaciones** y acepta. iPhone también pide tener activas las notificaciones en Ajustes → Notificaciones → Nosotros.

## Paso 8 · Sesiones de pareja con Claude (10 min, tiene costo)

Claude se usa con una llave de la API de Anthropic. Es aparte del plan de claude.ai (Pro o Max): se paga por uso, con saldo que se carga antes. Cada sesión cuesta más o menos **entre 30 centavos y 1 dólar** (sale más barata si escriben seguido; las pausas de más de 5 minutos la encarecen un poco), así que US$5 alcanzan para unas 10 a 15 sesiones. Además, la función tiene un tope de 150 respuestas de Claude por día.

1. En https://console.anthropic.com crea una cuenta y carga saldo (**Billing**). Recomendado: en **Limits** pon un límite de gasto mensual (por ejemplo, US$5).
2. En **API Keys** → **Create Key** (nombre `nosotros`). Copia la llave: empieza con `sk-ant-` y solo se muestra una vez.
3. Pégala en el `.env` de la carpeta del proyecto (el mismo del paso 5, que no se sube a GitHub), en una línea nueva:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
4. Supabase → SQL Editor: vuelve a correr **todo** `supabase/schema.sql` (crea las tablas de las sesiones).
5. Dentro de la carpeta del proyecto:
   ```bash
   npx supabase secrets set --env-file .env
   npx supabase functions deploy sesion --no-verify-jwt
   npx supabase functions deploy notificar --no-verify-jwt
   ```
   `sesion` revisa ella misma quién la llama (le pregunta a Supabase Auth) y que la sesión sea de su pareja: sin sesión abierta en la app no llega a hablar con Claude. La llave nunca llega al teléfono.
6. Publica la app (`git push`, o `npx vercel deploy --prod` dentro de `public`).

Para probar: en **Juntos** toca **Empezar nuestra primera sesión**. Claude saluda en unos segundos y al otro le llega el aviso.

Ajustes (constantes al inicio de `supabase/functions/sesion/index.ts`): `MODELO` (Claude Opus 5.5), `ESFUERZO_CHARLA` y `ESFUERZO_RESUMEN` (cuánto piensa antes de contestar), `ESPERA_MS` (si escriben dos mensajes seguidos, Claude los contesta juntos) y `TOPE_DIARIO`. Cómo modera y cómo escribe el resumen está en `instrucciones.ts`. Si Claude rechaza algo por sus reglas de seguridad, Anthropic lo reintenta solo con otro modelo (`fallbacks: "default"`).

## Si ya tenías una versión anterior funcionando

Cada vez que llega una versión nueva:

1. `git push` (Vercel publica solo).
2. Supabase → SQL Editor: vuelve a correr **todo** `supabase/schema.sql` (no borra nada).
3. Vuelve a publicar las funciones:
   ```bash
   npx supabase functions deploy cuenta --no-verify-jwt
   npx supabase functions deploy notificar --no-verify-jwt
   npx supabase functions deploy recordatorios --no-verify-jwt
   npx supabase functions deploy sesion --no-verify-jwt
   ```
   (`sesion` solo si ya hiciste el paso 8.)
4. Si todavía no lo corriste, `supabase/avisos.sql` (paso 6): reemplaza a los Database Webhooks del panel y a `cron.sql` de versiones anteriores. Las funciones nuevas (señales, ánimo, pregunta del día, cartas, lista) **no necesitan avisos ni secretos nuevos**.
5. Para la batalla naval y el UNO: corre `supabase/batalla.sql` y `supabase/uno.sql` (una vez; se pueden repetir) y vuelve a publicar `notificar`.

## Prueba

- Uno cierra la app y bloquea el teléfono. El otro abre la app. En pocos segundos debe sonar: "Fernando acaba de entrar ❤️ Y te extraña."
- Uno toca **Estoy libre para hablar**: al otro le llega "X está libre para una llamada ☎️" y en su Inicio aparece "X está libre ahora".
- Uno agenda una llamada para dentro de 40 minutos: al otro le llega "X agendó: …" y a los dos, unos 30 minutos antes, "En 30 min: …".
- Uno toca **Abrazo** 🤗: al otro le llega la push con vibración; si tenía la app abierta, llueven abrazos por la pantalla.
- Uno escribe una carta **sellada** para dentro de 10 minutos: el otro ve "🔒 Carta sellada de X · se abre…" y, cuando llega la hora (con un margen de hasta 5 minutos), le llega "Ya puedes abrir la carta de X".
- Agreguen el viaje que tengan planeado en **Calendario** con tipo *Viaje*: el corazón del Inicio empieza a contar los días.
- **Batalla naval**: uno reta al otro desde Juegos. Al otro le llega "⚓ X te reta a una batalla naval"; cuando los dos acomodan su flota, empieza y los disparos se ven al instante en los dos teléfonos.
- **UNO**: uno reta al otro desde Juegos y ya están repartidas las cartas. Al otro le llega "🃏 X te reta a un UNO"; cada carta jugada se ve al instante en los dos teléfonos.
- Para probar los juegos en vivo en el computador sin sesión (no toca la base): en la consola, `NosotrosJuegos.probar("uno")` (o `"batalla"`) en una pestaña y `NosotrosJuegos.probar("uno", { soy: "otro" })` en otra. Las pruebas automáticas: `cd supabase/pruebas && npm install && npm run test:batalla && npm run test:uno`.

Ajustes que ya trae (constantes al inicio de cada archivo):
- `MINUTOS_SIN_REPETIR = 15` en `notificar/index.ts`: si la misma persona entra varias veces en 15 minutos, solo se avisa la primera.
- `HORAS_LIBRE = 2` en `public/app.js`: cuánto dura "estoy libre".
- `MINUTOS_ANTES = 30` en `recordatorios/index.ts`: con cuánta anticipación llega el recordatorio.
- `public/preguntas.js`: la lista de preguntas del día. Agrega las tuyas al final. Ojo: al publicarlas cambia qué pregunta toca cada día desde ese momento; lo ya respondido conserva el texto de su pregunta, y si uno ya respondió la de hoy, los dos ven esa.

## Si algo no funciona

| Síntoma | Revisar |
|---|---|
| "No se pudo crear la cuenta" | Que la función `cuenta` esté publicada (paso 5). Si dice que ya están todas las cuentas, borra las **de prueba** en **Authentication → Users** (nunca las de ustedes dos: se borraría toda su historia) |
| "Usuario o contraseña incorrectos" | El usuario va en minúsculas y sin espacios; la contraseña distingue mayúsculas |
| "No pudimos abrir su rincón" | Que `schema.sql` esté corrido completo (trae la función `entrar_pareja`) y que se entre con usuario y contraseña de la app, no con otra cuenta |
| No aparece el botón de notificaciones en iPhone | La app se abrió desde Safari y no desde el ícono de la pantalla de inicio |
| La push no llega | Supabase → **Edge Functions → notificar → Logs**. Si dice "no autorizado", el header `x-webhook-secret` no coincide. Si dice `enviadas: 0`, la otra persona no activó notificaciones |
| Llega "te extraño" pero no lo del calendario | Falta correr `avisos.sql` (paso 6): trae el aviso de `eventos_cal` |
| Cada aviso llega dos veces | Quedaron los Database Webhooks del panel además de `avisos.sql`: vuelve a correr `avisos.sql` (los quita) |
| No llegan los recordatorios / "estoy libre" no se apaga solo | `select * from cron.job_run_details order by start_time desc limit 5;` en el SQL Editor. Si no hay filas, falta el paso 6; si dice `failed`, revisa la URL y el secreto con `select * from privado.config;` |
| Las horas de mi pareja salen mal | Cada uno revisa su zona horaria en **Ajustes** |
| El corazón no muestra la cuenta regresiva | El encuentro debe estar en Calendario con tipo **Viaje** o **Cita** |
| Error al compartir ánimo, responder o mandar una señal nueva | Falta volver a correr `schema.sql` completo (crea las tablas nuevas y amplía los tipos de `eventos`) |
| No llega el aviso de "ya puedes abrir la carta" | Igual que los recordatorios: revisa `cron.job_run_details` (paso 6) |
| `schema.sql` da error | Córrelo completo, de arriba a abajo; está hecho para repetirse sin borrar datos |
| En Juntos no aparece la sesión de pareja | Falta correr `schema.sql` completo (paso 8) o la pareja todavía no está completa |
| "Falta conectar a Claude" / "La llave de Claude no funciona" | La llave del paso 8: que esté en `.env`, que se haya corrido `secrets set` y que no la hayan borrado en console.anthropic.com |
| "Se acabó el saldo de Claude" | Carga saldo en console.anthropic.com → Billing |
| Claude no contesta | Supabase → **Edge Functions → sesion → Logs**. En la app, «Pedirle a Claude que responda» lo vuelve a intentar |
| Vercel muestra 404 | *Root Directory* debe ser `public` |
