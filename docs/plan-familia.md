# Plan · «Recreo», los juegos en familia de Eli y Maritza

> **Para la IA que lo construya.** Lee el plan completo antes de tocar nada. Mandan las **reglas de oro** (§1) y el **orden de trabajo** (§15). Si algo del plan choca con el código real, gana el código: avísale a Fernando antes de improvisar.
>
> **Adjuntos** (`docs/plan-familia/`): `familia.sql` (la base, **ya probada**: 41 comprobaciones OK), `pruebas/` (cómo se probó, sin tocar la base real), `familia-cuenta.ts` (borrador de la función de cuentas), `paridad.mjs` (la revisión automática).
> **Diseño**: `docs/recreo-maqueta.html`, con 6 pantallas y la guía de estilo. Se ve con el servidor `maqueta` de `.claude/launch.json` → http://localhost:3022/docs/recreo-maqueta.html. Sus tokens (`:root`) se copian tal cual.

---

## 0. En 30 segundos

- **Qué**: una app nueva, **Recreo**, con los cuatro juegos de Nosotros dibujados de nuevo **sin nada romántico**, para **Eli** (Elizabeth, la hermana de Fernando) y **Maritza** (su mamá).
- **Aparte de verdad**: carpeta nueva `familia/` y **su propio proyecto de Vercel** (otra dirección, otro nombre, otro ícono). Eli y Maritza nunca ven Nosotros.
- **Ranking de los cuatro**: Eli, Maritza, Fernando y Martina. Los récords de Fernando y Martina salen de lo que ya juegan en Nosotros: los juegos del Recreo tienen **exactamente las mismas reglas de puntaje**, así que se pueden comparar.
- **Nosotros no se toca**: ni un archivo de `public/`, ni `schema.sql`, ni sus funciones. Solo se **agregan** cosas: dos tablas y unas funciones en la misma base, una función nueva de cuentas y la carpeta `familia/`.
- **Pensado para Maritza**: entra tocando su nombre (sin escribir usuario), letra de 17 px con opción «Letra grande», botones de 56 px, una práctica que no cuenta y frases de fin de partida que siempre animan.
- **Costo**: cero. La misma base de Supabase (un proyecto nuevo costaría ~US$10/mes en la org Pro) y Vercel Hobby.

---

## 1. Reglas de oro

1. **Nosotros no se toca.** Prohibido editar `public/**`, `supabase/schema.sql`, `supabase/avisos.sql`, `supabase/functions/{cuenta,notificar,recordatorios,_shared}/**` y el `README.md` de la raíz. Copiar desde ahí sí (leer no es tocar). `paridad.mjs` lo revisa con `git status`.
2. **Nada romántico en el Recreo**: ni corazones (ni emoji, ni dibujo, ni la función `corazon()`), ni rosado, ni «amor / beso / pareja / te quiero / extrañar / novios», ni Talca, ni la distancia entre ellos, ni el nombre «Nosotros». `paridad.mjs` lo revisa.
3. **Mismo puntaje que Nosotros.** Los juegos se copian y solo cambia su cara: dibujos, colores, emojis y textos. Ninguna constante que mueva el puntaje o la dificultad (§8.0). `paridad.mjs` lo revisa.
4. **Costo cero.** Nada que pida tarjeta. No crear otro proyecto de Supabase.
5. **Producción solo con permiso de Fernando.** Correr SQL en la base real, publicar funciones y publicar en Vercel: dejar todo listo y probado, y pedirle que lo apruebe (§12). Nunca `--force`.
6. **La IA no crea cuentas ni escribe contraseñas**, tampoco «de prueba» en la base real. Las cuentas las crean Eli y Maritza desde el Recreo, con Fernando al lado.
7. **En local, solo modo prueba.** `localhost` habla con la base real: el Recreo tiene un modo prueba (`#prueba`) que **no crea el cliente de Supabase**. Toda la revisión en el navegador se hace así.
8. **Español neutro en género**, textos cortos y amables («¡Primer lugar!», nunca «campeón/a»). Ecuatorianismos con cariño: «¡Chévere!», «¡De ley!», «¡Achachay!».
9. **Código como el de Nosotros**: JS sin frameworks ni compilación, `"use strict"`, todo en español (nombres y comentarios), funciones cortas, `try/catch` alrededor de `localStorage`, `prefers-reduced-motion` respetado.

---

## 2. Quiénes juegan

| Persona | Usuario | Cuenta (correo interno) | Cómo entra | Personaje y color al empezar |
|---|---|---|---|---|
| Eli (Elizabeth), hermana | `eli` | `eli@familia.invalid` | toca «Eli» y crea su contraseña | 🦋 uva |
| Maritza, mamá | `maritza` | `maritza@familia.invalid` | toca «Maritza» y crea su contraseña | 🌺 coral |
| Fernando | `fernando` | `fernando@nosotros.invalid` (la de siempre) | opcional: «¿Eres Fernando o Martina?» | 🦊 azul |
| Martina | `martina` | `martina@nosotros.invalid` (la de siempre) | opcional, igual | 🐧 menta |

- Eli y Maritza eligen su personaje y su color la primera vez (lo de la tabla es lo que viene marcado).
- Fernando y Martina **aparecen en el ranking desde el primer día**, aunque nunca abran el Recreo. Su nombre sale del usuario («Fernando», «Martina»), **no** del perfil de Nosotros: ahí podría haber un apodo romántico.
- **Por qué `@familia.invalid` y no `@nosotros.invalid`**: si una cuenta de la familia usara el dominio de la pareja y alguien la abriera en la dirección de Nosotros, `entrar_pareja()` le crearía una «pareja» nueva con las fechas de novios (y `recordatorios` le mandaría mesiversarios). Con `@familia.invalid`, Nosotros la rechaza («Esta cuenta no es una de las dos de Nosotros») y no pasa nada más.
- Contarle a Martina que sus récords se van a ver en el Recreo de la familia.

---

## 3. Cómo encaja

```
  Nosotros (no se toca)                          Recreo (nuevo)
  nosotros-sand.vercel.app                       recreo-familia.vercel.app   ← proyecto de Vercel aparte
  public/                                        familia/
       │                                              │
       └──────────── Supabase lrsrmblmqvkpltajegqw (el mismo) ──────────────┘
            auth.users ── @nosotros.invalid (la pareja) · @familia.invalid (la familia)
            partidas (de Nosotros) ── solo lectura, por función ──► ranking_familia() · actividad_familia()
            familia_miembros · familia_partidas (nuevas)
            función familia-cuenta (nueva) ── crea eli / maritza
```

**Por qué un proyecto de Vercel aparte** (y no `nosotros-sand.vercel.app/familia`):
- Otra dirección, otro nombre y otro ícono: Eli y Maritza nunca ven Nosotros, ni por accidente en la raíz.
- Cero cambios en `public/` (ni siquiera `vercel.json`), y publicar el Recreo nunca vuelve a publicar Nosotros.
- Otro origen = otro `localStorage` y otro service worker: las sesiones no se pisan aunque Fernando use las dos apps en el mismo navegador.

**Por qué la misma base**: el ranking necesita las partidas de Fernando y Martina, y un proyecto nuevo costaría plata y habría que sincronizar.

**Qué lee y escribe cada app**
- El Recreo lee `familia_miembros` (RLS), `ranking_familia()`, `actividad_familia()` y el tiempo real de `familia_partidas` y `familia_miembros`.
- El Recreo escribe `familia_partidas` (solo las suyas), `entrar_familia()` y `editar_familia()`.
- Nosotros sigue igual que hoy: no lee nada del Recreo.

---

## 4. Base de datos: `supabase/familia.sql`

**Ya está escrito y probado**: `docs/plan-familia/familia.sql`. Se copia tal cual a `supabase/familia.sql`. Se puede correr las veces que haga falta y no borra datos.

| Pieza | Para qué |
|---|---|
| `familia_miembros` (usuario_id, nombre, avatar, color, creado_en, actualizado_en) | quién está en el Recreo y cómo se ve. `actualizado_en = creado_en` quiere decir que todavía no eligió personaje (la app muestra «Elige tu personaje») |
| `familia_partidas` (usuario_id, juego, puntos, detalle, creado_en) | una fila por partida del Recreo. `juego`: `lluvia`, `vuelo`, `memoria`, `fusion` |
| `es_familia()` | ¿soy del Recreo? (la usan las políticas) |
| `entrar_familia()` | la primera vez crea mi fila. Solo cuentas `@familia.invalid` o las dos de la pareja completa. Si no corresponde, devuelve una fila vacía: revisar con `filaValida()` como en Nosotros |
| `editar_familia(nombre, avatar, color)` | cambiar lo mío (`null` = no cambiar) |
| `familia_todas()` | interna, sin permiso para la app: junta `familia_partidas` con las `partidas` de Nosotros (`corazones` → `lluvia`), solo de gente del Recreo |
| `ranking_familia(p_desde)` | por persona y juego: mejor puntaje, cuántas partidas, mejor desde `p_desde` (hoy) y la última |
| `actividad_familia(p_limite)` | las últimas partidas de todos |
| siembra | Fernando 🦊 azul y Martina 🐧 menta entran a `familia_miembros` con su usuario como nombre |
| tiempo real | `familia_miembros` y `familia_partidas` en `supabase_realtime` |

**Qué puede ver cada uno** (probado):

| Quién | Ve | No ve |
|---|---|---|
| Eli o Maritza | nombres, personajes y colores de los cuatro; sus partidas del Recreo; el ranking y la actividad (mejores puntajes, cuántas veces y cuándo) | nada de Nosotros: perfiles, fotos, ubicación, cartas, eventos, `partidas` ni su `detalle`, premios |
| Fernando o Martina en el Recreo | lo mismo que la familia | (Nosotros sigue igual) |
| Una cuenta suelta `@nosotros.invalid`, de otro dominio, sin confirmar, o sin sesión | nada: `entrar_familia()` no la deja entrar y el ranking viene vacío o da error de permiso | todo |

Las partidas no se editan ni se borran. Borrar una cuenta de la familia en *Authentication → Users* borra solo lo suyo del Recreo (al revés que las de la pareja, que se llevan toda la historia de Nosotros).

**Prueba local** (sin Docker y sin tocar la base real): `docs/plan-familia/pruebas/` levanta un Postgres dentro de Node (PGlite), imita lo justo de Supabase y de Nosotros (`stub.sql`) y corre 41 comprobaciones (`familia.mjs`): quién entra y quién no, que nadie lea `partidas` ni `perfiles`, que no se pueda guardar a nombre de otro, que el ranking junte bien los récords, que el apodo de Nosotros no se cuele, y que se pueda correr dos veces. En la fase 1 se mueve a `supabase/pruebas/`:

```bash
cd supabase/pruebas && npm install --no-package-lock && node familia.mjs
```

Si se cambia `familia.sql`, se agrega la comprobación que corresponda y se vuelve a correr hasta ver «Todo bien ✓».

---

## 5. Cuentas: función `familia-cuenta`

Borrador listo en `docs/plan-familia/familia-cuenta.ts` → va en `supabase/functions/familia-cuenta/index.ts`. Es la función `cuenta` adaptada:

- `POST { accion: "estado", usuario }` → `{ existe }`. Con esto el Recreo sabe si mostrarle a Maritza «Crea tu contraseña» o «Tu contraseña», sin preguntarle.
- `POST { accion: "crear", usuario, clave }` → crea `usuario@familia.invalid` ya confirmada.
- Solo usuarios de `FAMILIA_PERMITIDOS` (`eli,maritza`); sin esa lista no crea nada. Tope `MAX_FAMILIA` (10).
- Contraseña de 8 a 72 caracteres (igual que Nosotros).
- No crea la fila de `familia_miembros`: la crea `entrar_familia()` al entrar (un solo lugar decide quién es del Recreo).
- Ojo: la función `cuenta` de Nosotros cuenta *todas* las cuentas para su tope de 6. Con Eli y Maritza serán 4 (más las de prueba que haya). Solo importaría si la pareja necesitara crear otra cuenta.

Secretos: agregar al `.env` la línea `FAMILIA_PERMITIDOS=eli,maritza` (el `.env` no se sube a GitHub).

---

## 6. La app: carpeta `familia/`

### 6.1 Archivos

```
familia/
  index.html          pantallas (carga, entrada, contraseña, personaje, aviso), las 3 pestañas y el sprite de íconos SVG
  estilos.css         tokens de la maqueta + componentes (botones, tarjetas, avatar, puesto, chips, barra, aviso, lluvia)
  config.js           claves públicas de Supabase y la lista de la familia (§6.2)
  app.js              arranque, sesión, pestañas, «Yo», instalar, aviso, lluvia de emojis, letra grande, modo prueba
  datos.js            todo lo que viene de la base: miembros, ranking, actividad, guardar, tiempo real, caché, modo prueba
  ranking.js          la pestaña Ranking y la tarjeta «Mientras no estabas» de la pestaña Juegos
  juegos/
    sala.js           tarjetas de juegos, vista de juego a pantalla completa, fin de partida, práctica y retar
    lluvia.js  vuelo.js  memoria.js  fusion.js    los cuatro juegos (§8)
    juegos.css        la vista de juego y cada juego, con tokens del Recreo
  fuentes/            fredoka-v17.woff2 y nunito-v32.woff2 (copiadas de public/fuentes/)
  icons/              icon-192.png, icon-512.png, icon-512-maskable.png, apple-180.png (§7.6)
  manifest.json  sw.js  vercel.json  .vercelignore  README.md
  herramientas/       paridad.mjs, iconos.py (no se publican)
```

- Nombres globales, paralelos a los de Nosotros: `window.recreo` (lo que la app comparte, como `window.nosotros`), `window.RecreoJuegos` (registro de juegos, como `NosotrosJuegos`) y `window.RecreoDatos` (la base).
- Todo se carga con `defer` en `index.html`; aquí no hace falta bajar los juegos después, como en Nosotros, porque los juegos son la app. Orden: supabase-js (el mismo CDN y versión de Nosotros, `@supabase/supabase-js@2.45.4`), `config.js`, `datos.js`, `app.js`, `ranking.js`, `juegos/sala.js` y los cuatro juegos.
- Ids del HTML: `#carga`, `#s-entrada`, `#s-clave`, `#s-personaje`, `#s-aviso`, `#s-app` con `#tab-juegos` (`#juegos-hola`, `#novedades`, `#juegos-lista`), `#tab-ranking`, `#tab-yo`, la barra `#tabs` y el aviso `#toast`.

### 6.2 `config.js`

```js
// Claves PÚBLICAS (las mismas de public/config.js: está bien que vayan en el frontend)
window.RECREO_CONFIG = {
  SUPABASE_URL: "https://lrsrmblmqvkpltajegqw.supabase.co",
  SUPABASE_ANON_KEY: "…la misma anon key de public/config.js…",
  // La familia: los mismos de FAMILIA_PERMITIDOS en la función familia-cuenta. Salen como tarjetas en la entrada.
  FAMILIA: [
    { usuario: "eli", nombre: "Eli", avatar: "🦋", color: "uva" },
    { usuario: "maritza", nombre: "Maritza", avatar: "🌺", color: "coral" },
  ],
  // Entran con su cuenta de siempre (usuario@nosotros.invalid)
  YA_TIENEN_CUENTA: ["fernando", "martina"],
};
```

`correoDe(usuario)` = `usuario@nosotros.invalid` si está en `YA_TIENEN_CUENTA`; si no, `usuario@familia.invalid`. (Ningún nombre de variable puede llevar palabras prohibidas: `paridad.mjs` revisa también el código.)

### 6.3 Arranque y sesión

Cliente: `supabase.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "recreo-sesion" } })`. **En modo prueba no se crea.**

```
carga (logo que se arma, ≤ 1,4 s) ─► ¿hay sesión? ── sí ─► entrar_familia() ─► fila vacía ─► aviso «Esta cuenta no es del Recreo» + Cerrar sesión
                                      │                        └─► ¿actualizado_en = creado_en? ── sí ─► Elige tu personaje ─► Juegos
                                      no                                                        └ no ──────────────────────► Juegos
                                      ▼
               ¿Quién va a jugar? (una tarjeta por persona de FAMILIA)
                ├─ toca «Maritza» ─► familia-cuenta «estado» ─► existe ─► «Tu contraseña» ─────────────────────► iniciar sesión
                │                                              └ no ────► «Crea tu contraseña» (dos veces) ─► «crear» ─► iniciar sesión
                │                    (sin red o con error: mostrar los dos botones «Ya tengo contraseña» y «Es mi primera vez»)
                └─ «¿Eres Fernando o Martina?» ─► usuario + contraseña de siempre ─► iniciar sesión
```

- Igual que Nosotros: un vigilante de 10 s que nunca deja la carga pegada y ofrece reintentar; `onAuthStateChange` carga solo si cambió la persona; un 400 de Supabase es «contraseña incorrecta» y lo demás «revisa tu conexión».
- Formulario de contraseña con botón de ojo (como Nosotros), etiqueta visible, error **debajo del campo**, `autocomplete="new-password"` o `"current-password"`, y un `<input autocomplete="username">` oculto con el usuario para que el teléfono ofrezca guardar la contraseña.
- «¿Olvidaste tu contraseña?» → «Pídele a Fernando que te ayude: él la puede cambiar.» (el SQL para cambiarla va en `familia/README.md`, como en el README de Nosotros pero con `@familia.invalid`).
- **Cerrar sesión con `signOut({ scope: "local" })`**: con el alcance por defecto, Fernando cerraría su sesión de Nosotros en todos sus teléfonos.
- **«Cambiar contraseña» solo para cuentas `@familia.invalid`**: para Fernando y Martina cambiaría también la de Nosotros.
- En iPhone, la app instalada no comparte sesión con Safari: si Maritza creó la cuenta en Safari, en el ícono vuelve a tocar su nombre y pone su contraseña (va en la guía, §13).

### 6.4 Pantallas

Todas están en la maqueta. Contenido de 560 px de ancho como máximo, centrado; barra de abajo con tres pestañas y su texto siempre visible. En computador (≥ 760 px), las tarjetas de juegos van en dos columnas.

**¿Quién va a jugar?** (maqueta 1). Logo que se arma + «Recreo» + «Juegos en familia». Una tarjeta grande (88 px) por persona de `FAMILIA`, con su personaje. Nota: «La primera vez eliges una contraseña. Después, el teléfono se acuerda de ti.» Enlace «¿Eres Fernando o Martina?». Botón «Poner el Recreo en mi pantalla» si el navegador lo permite.

**Contraseña**. «Hola, Maritza 👋». Para crear: «Elige una contraseña (mínimo 8 letras o números). Anótala: te la pedimos una sola vez en este teléfono.» Para entrar: «¡Qué bueno verte, Eli!». Botón azul «Crear y entrar» o «Entrar». Enlace «Volver».

**Elige tu personaje** (la primera vez). 24 personajes: 🦋 🌺 🦊 🐧 🐢 🦜 🦙 🐼 🐱 🐶 🦉 🐝 🐸 🐬 🦁 🐨 🐙 🦄 🌵 🍍 🌈 ⚽ 🎸 🚀. Seis colores. «Tu nombre en el ranking» (1 a 20 letras). Interruptor «Letra grande» con la vista previa al lado. Botón «¡Listo!» → `editar_familia` → Juegos, con una lluvia de 🎉.

**Juegos** (maqueta 2)
- Saludo: personaje + «¡Hola, Eli!» + «¿Qué jugamos hoy?» + botón de sonido (48 px).
- «Mientras no estabas» si hay novedades (§9.4): hasta tres líneas + «Ver el ranking»; se cierra con una ✕ y queda como vista.
- Una tarjeta por juego: sticker del juego, nombre y lema; abajo, 👑 «Martina · 2.340» + «Tú: 1.800 · 3º lugar» (o «Tú: todavía no juegas», o «👑 ¡Vas primero!») y el botón amarillo «Jugar». Toda la tarjeta abre el juego.
- Sin conexión: una franja «Sin internet: mostrando lo último que vimos».

**Ranking** (maqueta 3)
- «De siempre / De hoy». El de hoy usa `mejor_hoy` y empieza a la medianoche del teléfono de quien mira.
- Medallero: podio con los tres primeros (personaje, nombre, 🥇🥈🥉) y debajo el resto. Si está vacío: «Todavía nadie tiene medallas. ¡A jugar!».
- Una tabla por juego: puesto (círculo oro, plata o bronce), personaje, nombre (+ etiqueta «Tú»), «9 partidas · hace 2 h» y puntaje. Quien no jugó ese juego va al final, en gris: «todavía no juega».
- «Últimas partidas»: ocho líneas como «🌺 Maritza · Memoria: 1.120 pts 🏆 · hace 2 h» (🏆 si fue su mejor).
- Un puntito en la pestaña Ranking mientras haya novedades sin ver.

**Yo** (maqueta 5). Etiqueta de cuaderno «Hola, me llamo · Maritza» en su color, personaje grande, «Tu personaje», «Tu color», «Tu nombre», interruptores «Letra grande», «Sonido» y «Vibración», «Poner el Recreo en mi pantalla» (como `renderInstalar` de Nosotros: `beforeinstallprompt` en Android; en iPhone, «Compartir → Agregar a pantalla de inicio»), «Cambiar contraseña» (solo la familia) y «Cerrar sesión».

**Vista de juego** (maquetas 4 y 6). La de Nosotros (barra con ✕, título y sonido; marcador oscuro; campo) con los colores del Recreo. Capa «Cómo se juega» con las reglas en seis dibujitos, las metas (👑 el líder, la siguiente, tú), el botón amarillo «¡A jugar!» y «Practicar (no cuenta)». El fin de partida está en §9.3.

**Aviso**. «Un momentito» + el mensaje + «Intentar de nuevo» y «Cerrar sesión» (como `s-aviso` de Nosotros).

### 6.5 `datos.js`: la única puerta a la base

`window.RecreoDatos`:

| Función | Hace |
|---|---|
| `iniciar({ sb, user, prueba })` | carga todo y abre el tiempo real |
| `recargar()` | a la vez: `familia_miembros`, `rpc("ranking_familia", { p_desde })` y `rpc("actividad_familia", { p_limite: 12 })`. Guarda una copia en `localStorage` (`recreo-cache-<uid>`) para mostrar algo sin red |
| `yo()`, `miembros()`, `miembro(id)` | las personas |
| `tabla(juego, { hoy })` | filas ordenadas con su puesto (§9.1) |
| `medallero({ hoy })` | oro, plata y bronce por persona (§9.2) |
| `metas(juego)` | las marcas de los demás, de menor a mayor, con nombre, color y personaje |
| `guardar(juego, puntos, detalle)` | inserta en `familia_partidas` y actualiza el ranking local al instante. Si falla, la deja en una cola (`recreo-pendientes-<uid>`) y la reintenta al volver la red o la app |
| `actividad()`, `novedades()`, `marcarVisto()` | §9.4 |
| `editarMiembro({ nombre, avatar, color })` | `rpc("editar_familia")` |
| evento | `recreo:datos` en `window` cada vez que algo cambió |

- Tiempo real: canal `recreo` con los `INSERT` de `familia_partidas` (aviso «🎮 Maritza acaba de hacer 1.120 en Memoria» si no fui yo) y los `INSERT/UPDATE` de `familia_miembros`. Las partidas que Fernando y Martina juegan **en Nosotros** no llegan en vivo (su RLS no lo permite): aparecen al recargar.
- Al volver a la app después de 30 s, o al volver la red: `recargar()` y reabrir el canal si se cayó (como `ponerseAlDia` de Nosotros).
- «Hoy»: `p_desde` = medianoche del teléfono, `aIso(diaHoy() + "T00:00", tz)`. Copiar `partes`, `aWall`, `claveDia`, `aIso` y `offsetMin` de `public/app.js` (cerca de las líneas 969 y 1105).
- **Modo prueba** (`#prueba`, o `#prueba=maritza` para entrar como ella): sin Supabase; las personas y los puntajes de la maqueta, en memoria; `guardar` solo suma en memoria; «estado», «crear» e iniciar sesión se simulan; franja fija «Modo prueba: nada se guarda · Salir».

### 6.6 Lo que la sala y los juegos reciben

`window.recreo` (lo arma `app.js`, como `window.nosotros`): `toast`, `lluvia(emoji, n)` (copiar la de `public/app.js` con `.lluvia` y `@keyframes sube` de `public/styles.css`, líneas 267–268), `vibrar` (respeta el interruptor), `pocoMovimiento`, `ago`, `diaHoy`, `aIso`, `claveDia`, `tz`, `prueba`, `COLORES` (nombre del color → hex, para dibujar en canvas) y `yo` (getter con nombre, avatar y color). Eventos: `recreo:dentro` (ya hay sesión y datos), `recreo:aldia` (volví a la app) y `recreo:datos` (cambió el ranking).

---

## 7. Diseño

Hecho con la habilidad de diseño UI/UX Pro Max: para «Casual Puzzle Game» recomienda claymorphism con bloques vivos; para apps de familia, un color por integrante; el estilo «Accessible & Ethical» pone las reglas de letra (16 px o más), contraste y foco visible; y la pareja tipográfica «Playful Creative» es Fredoka + Nunito. De su recomendación se descartó la paleta rosada, porque es la de Nosotros.

### 7.1 El concepto: el cuaderno del recreo

Hoja cuadriculada de fondo (líneas azul clarito cada 26 px), stickers troquelados (borde blanco de 3 px y sombra) para los juegos y las medallas, una etiqueta «Hola, me llamo» en el perfil y botones gorditos, como teclas, que se hunden 3 px al tocarlos. Cada persona tiene su color y su personaje en todas partes: avatar, fila del ranking, el avioncito, el dorso de las cartas.

Distinto de Nosotros a propósito: Nosotros es papelería de cartas (rosado y turquesa, Fraunces, letra manuscrita, cinta washi, corazones); el Recreo son útiles escolares (crema, azul, amarillo sol, Fredoka).

### 7.2 Tokens

Los de `:root` de la maqueta, sin cambiar valores, con su versión oscura (`prefers-color-scheme: dark`). Contrastes medidos:

| Par | Claro | Oscuro |
|---|---|---|
| texto sobre fondo | 14,2:1 | 16,5:1 |
| texto secundario sobre tarjeta | 7,1:1 | 7,5:1 |
| texto del botón azul | 6,0:1 | 7,6:1 |
| azul como enlace sobre fondo | 5,6:1 | 7,5:1 |
| texto sobre amarillo sol | 9,7:1 | 10,7:1 |
| texto sobre oro / plata / bronce | 8,2 / 9,9 / 6,9:1 | — |
| verde «ok» / rojo «error» sobre tarjeta | 4,9 / 5,4:1 | 8,4 / 6,9:1 |
| anillos de color de cada persona sobre blanco | ≥ 3,4:1 (sol usa `#B07A00`: `#C98A00` daba 2,95:1) | colores claros sobre oscuro |

Base 17 px (`html{font-size:calc(17px * var(--escala, 1))}`); con «Letra grande», `--escala: 1.15` (19,5 px). Todo en `rem` para que escale.

### 7.3 Componentes (clases de la maqueta)

- `.btn` + `.btn-sol` (Jugar, Otra vez, ¡A jugar!), `.btn-primario` (Entrar, Guardar, ¡Listo!), `.btn-sec` (Practicar, Retar, Cancelar), `.enlace`. Alto 56 px (48 px los chicos dentro de tarjetas). Al tocar: `translateY(3px)` y la sombra baja, sin mover nada alrededor.
- `.tarjeta` (blanca, borde de 2 px, radio 22, sombra «arcilla»), `.sticker` (borde blanco), `.arte .arte-<juego>` (84 px, girado −4°).
- `.av` + `.c-<color>`: el personaje en un círculo de su color (36, 48, 64 o 96 px).
- `.puesto .p1/.p2/.p3` (medallas), `.chip`, `.segmento`, `.interruptor` (en la app real, `role="switch"` + `aria-checked`), `.aviso` (el toast: tinta oscura, no la notita amarilla de Nosotros).
- `.barra`: tres pestañas, 76 px + la zona segura del teléfono, ícono en píldora + texto.
- Íconos: sprite SVG en `index.html` (trazo 2,2, puntas redondas): juegos, ranking, yo, jugar, flecha, sonido, cerrar, compartir, otra, instalar, salir y corona, copiados de la maqueta; «mudo» y «ojo» se toman de `public/juegos/sala.js` y `public/app.js`. Los emojis solo van dentro de los juegos, como personaje y en textos; nunca como ícono de un botón.

### 7.4 Pensado para Maritza (y bueno para todos)

- Entra tocando su nombre: no escribe usuario. La contraseña se pide una vez por teléfono.
- Letra base de 17 px; «Letra grande» en «Yo» y en «Elige tu personaje». El canvas de los juegos no cambia.
- Botones de 56 px separados 8 px o más; nada importante solo con ícono; todo lo que se toca mide 48 px o más.
- Contraste AA o más en claro y oscuro (§7.2). El color nunca va solo: siempre nombre + personaje + número de puesto.
- Errores en palabras simples, al lado del campo. Nunca «400», «JWT» ni «RLS».
- La práctica que no cuenta (§9.6) y frases de fin que siempre rescatan algo bueno (§9.3).
- Sonido y vibración se pueden apagar; «reducir movimiento» apaga lluvias y rebotes.
- Sin tiempos límite fuera de los juegos; los avisos duran 4 s y lo importante queda en pantalla.

### 7.5 Movimiento y sonido

- 150, 240 y 320 ms; al entrar `--salida`, al salir más rápido; el rebote (`--resorte`) solo en medallas e insignias.
- Una sola animación importante por pantalla: el logo en la carga, la insignia del fin de partida, la lluvia al batir un récord (🎉 ✨ 👑, nunca corazones).
- Los tonos de los juegos son los de Nosotros (Web Audio, sin archivos).
- Con `prefers-reduced-motion`: sin lluvias ni rebotes, fundidos cortos.

### 7.6 Íconos, manifiesto y service worker

- Logo: cuatro fichas redondeadas en coral, azul, menta y sol, giradas −6°, con una estrella, un avioncito, una carta y una cereza en blanco (el `<symbol id="logo">` de la maqueta).
- PNG con Python + Pillow (ya instalado, versión 12.3): `familia/herramientas/iconos.py` dibuja el logo sobre crema `#FFF6E5` en 192, 512, 512 «maskable» (logo al 70 % dentro de la zona segura) y 180 para iPhone.
- `manifest.json`: `name` «Recreo · juegos en familia», `short_name` «Recreo», `start_url` y `scope` «/», `display` standalone, `orientation` portrait, `background_color` y `theme_color` `#FFF6E5`, `lang` es y los tres íconos. `<meta name="theme-color">` claro `#FFF6E5` / oscuro `#0F1428`; `apple-mobile-web-app-title` «Recreo».
- `sw.js` mínimo (install y activate, como el de Nosotros pero sin push): alcanza para que Chrome ofrezca instalar.
- `vercel.json`: `sw.js` y `config.js` sin caché; `fuentes/` un año e inmutables; `icons/` una semana. `.vercelignore`: `herramientas/`, `README.md` y `.env*`.

---

## 8. Los cuatro juegos

### 8.0 Cómo copiar sin cambiar el puntaje

1. Copiar el archivo de `public/juegos/` con su nombre nuevo (`corazones.js` → `lluvia.js`; los demás igual).
2. Cambiar **solo**: comentarios; `NosotrosJuegos.registrar({...})` → `RecreoJuegos.registrar({...})` con su id, nombre, lema, tono, arte, reglas, nota, detalle, rango y botón; emojis y colores; fondos y dibujos; textos que se ven; la lógica de «rival», que pasa a ser «metas» (§8.5).
3. **No** cambiar: tiempos, probabilidades, tamaños, velocidades, puntos, vidas, márgenes de toque, física, rondas, bonos ni tablero. Tampoco los nombres internos que aparecen en las líneas de paridad (`"heart"`, `"broken"`, `"cupid"`, `"gold"`, `"letter"`, `"freeze"`, `pBroken`, `pCupid`, `S.sobres`, `KM_CARTA`…): no se ven, y dejarlos igual hace exacta la comparación con el original y permite traer al Recreo un arreglo futuro de Nosotros. Los demás nombres internos sí se pueden cambiar si ayudan a leer (`LOVE` → `ANIMO`, `sayLove` → `animar`, `HEARTS` → `ESTRELLAS`), y los que lleven una palabra prohibida en español se cambian siempre (`S.parejas` → `S.pares`).
4. Correr `node familia/herramientas/paridad.mjs`: revisa las líneas que deben seguir idénticas en cada juego, las palabras prohibidas y que Nosotros no cambió.
5. Mirar el diff contra el original (`git diff --no-index public/juegos/corazones.js familia/juegos/lluvia.js`): cada cambio tiene que ser de los permitidos.

### 8.1 Lluvia de estrellas (`lluvia.js`, copia de `corazones.js`)

`id: "lluvia"`; en la base, los récords de Nosotros de `corazones` cuentan aquí. Es de noche en los seis niveles: `const dark = () => true;` para que todos los textos usen su versión clara.

| Nosotros | Recreo | Regla (igual) |
|---|---|---|
| 💗 💖 💙 💕 corazones | ⭐ 💫 ✨ estrellas | +10 × multiplicador |
| 💔 corazón roto (fondo gris) | ☄️ meteorito (mismo fondo oscuro) | no tocar: pierdes una vida |
| 💘 cupido (anillo punteado) | 👽 marcianito (mismo anillo) | +25; si cae, pierdes una vida |
| 🌟 estrella dorada | 🌠 estrella fugaz | +50, muy rápida |
| 💌 carta | ⏰ reloj | +2 segundos |
| ❄️ copo | ❄️ copo | cámara lenta 2,5 s |

- Anillos (`RING`): heart `#F5B82E`, broken `#111418` (de noche `#E2E8F0`, como ya hace el código), cupid `#22C55E`, gold `#7C9BFF`, letter `#14B8A6`, freeze `#4FB3EA`.
- Fondos (`BG`), cada nivel más de noche: `["#2B3A8F","#4A3FA0"]`, `["#26337F","#3F358F"]`, `["#202B70","#352C7E"]`, `["#1A2361","#2B236C"]`, `["#141A4E","#0E1138"]`, `["#0D1036","#05061A"]`. Las estrellitas titilan en todos los niveles (en `paintBg`, sin los renglones de carta).
- Partículas: `api.estrellita` en vez de `api.corazon`; colores `["#FFD36B","#FFF3C4","#7C9BFF","#FFFFFF"]`. Barra de tiempo de `#FFC53D` a `#7C9BFF`. Destello al perder una vida en rojo `rgba(192,57,43,…)`, no rosado. Vidas en el marcador: `★★☆`.
- Niveles (`LEVELS`, los mismos `at`): Calentamiento / «Fácil… por ahora» · Meteoritos / «No toques los ☄️» · Rescate / «Si un 👽 cae, pierdes una vida» · Mareo / «Ahora se mueven de lado» · Estrellas tímidas / «Aparecen y desaparecen» · Tormenta solar / «Suerte. La vas a necesitar».
- Frases al atrapar (reemplazan a `LOVE`, mismas cuatro categorías): fácil «¡Bien!», «¡Eso!» · media «¡Buena, {nombre}!», «¡Chévere!», «¡Qué rapidez!» · difícil «¡Increíble!», «¡Qué nivel, {nombre}!», «¡De ley!», «¡Reflejos de gato!» · muy difícil «¡Leyenda, {nombre}!», «¡De otro planeta!», «¡Puntería espacial!».
- Otros textos: «¡Meteorito!» (al tocar ☄️), «¡El marcianito se cayó!», «+2 s ⏰», «¡Achachay! ❄️» (cámara lenta), «Se te escaparon 6».
- Logros (en `localStorage`, `recreo-logros-lluvia-<uid>`): 🔥 Imparable (racha de 15) · 🌠 Estrella fugaz (atrapa una 🌠) · 👽 Rescate total (4 marcianitos en una partida) · 🛡️ Sin un rasguño (nivel 4 sin tocar un ☄️) · ⛈️ Tormenta superada (llega al nivel 6) · 👑 Primer lugar (supera el récord más alto).
- Rango: ≥ 3.500 «Leyenda de las estrellas» · ≥ 2.500 «Nivel cometa» · ≥ 1.900 «Casi en órbita» · ≥ 1.200 «Despegando» · ≥ 500 «Aprendiz de astronauta» · menos, «Mirando el cielo».
- Registro: nombre «Lluvia de estrellas»; lema «60 segundos de estrellas, marcianitos y meteoritos. Atrápalas antes de que caigan.»; tono `["#4B57C9","#FFC53D","#1F2A8A"]`; las seis reglas de la maqueta (pantalla 6); nota «¡Vamos, {nombre}! Atrapa todas las que puedas.»; detalle el de Nosotros con «estrellas» en vez de «corazones»; botón «¡A jugar!».
- Arriba al centro del campo: «Meta: Fernando 2.100» (la siguiente marca que te falta pasar) o «👑 Primer lugar».

### 8.2 Avioncito de papel (`vuelo.js`)

`id: "vuelo"`. La meta es fija, `const META_KM = 4000;`, en vez de la distancia real entre Fernando y Martina (es solo decorado: el puntaje son los km recorridos).

- Jugador: un avión de papel (triángulo con su doblez, en el color de quien juega, borde blanco) en vez del corazón con alas. Mismo tamaño aproximado (≈ 30 px) y **el mismo radio de choque** (`radio() * 0.8`). Se inclina con `S.ang` y tiembla un poquito con `S.aleteo`.
- Sobres 💌 → estrellas ⭐ (+50 km), con «¡Más alto!», «¡Sigue así!», «¡Qué pulso!», «¡Brillante!», «¡Volando!», «¡Chévere!».
- Hitos: 1.000 «1.000 km: ¡ya cruzaste el mar!» · 2.000 «2.000 km y sigues volando» · 3.000 «3.000 km… ¡qué pulso!». A los 4.000: «¡Vuelta completa! 🎉» / «4.000 km de cielo… ¡qué viaje!», con lluvia de 🎉.
- Cielo (`CIELOS`): `[0,"#BFE6FF","#F4FAFF"]`, `[0.35,"#8FD0FF","#FFF1C9"]`, `[0.7,"#FFB27A","#FFD59E"]`, `[1,"#22305E","#4A3F7A"]`. Suelo de pasto (`#9ED67A` → `#6BB85A`; de noche `#2E4A3A`) con florcitas redondas en vez de corazones; cerros verdes. Las nubes se quedan (con su carita dormida; el rubor pasa a durazno, `rgba(255,170,120,.45)`).
- Camino de arriba: de 🏠 a 🏁, con un puntito por cada récord de la familia en su color y 👑 en el del líder; el avioncito avanza encima.
- Marcador: Recorrido · Falta (para los 4.000) · Estrellas. Al final: «¡Volaste los 4.000 km completos! 🎉» o «Te faltaron 1.300 km para la vuelta completa.».
- Rango: ≥ 100 % «¡Vuelta completa!» · ≥ 75 % «Piloto de altura» · ≥ 50 % «Medio camino» · ≥ 25 % «Buen despegue» · menos, «Turbulencias».
- Registro: nombre «Avioncito de papel»; lema «Vuela lo más lejos que puedas sin chocar con las nubes.»; tono `["#3B82F6","#FFC53D","#1F4FB8"]`; reglas 👆 toca para subir · ⛈️ no choques las nubes · ☁️ +100 km por nube · ⭐ +50 km cada estrella; nota «Cada nube que pasas son 100 km. ¿Llegarás a los 4.000?»; botón «Despegar ✈️».

### 8.3 Memoria del Ecuador (`memoria.js`)

`id: "memoria"`. Catorce cartas (la ronda 3 usa diez pares), con datos verdaderos y fáciles de leer:

| Carta | Nombre | Al encontrar el par |
|---|---|---|
| 🐢 | Tortuga gigante | Las de Galápagos pueden vivir más de 100 años |
| 🌋 | Cotopaxi | Uno de los volcanes activos más altos del mundo |
| 🏔️ | Chimborazo | Su cumbre es el punto más lejano del centro de la Tierra |
| 🌎 | Mitad del mundo | La línea ecuatorial pasa muy cerca de Quito |
| 🐧 | Pingüino | En Galápagos vive el único pingüino al norte del ecuador |
| 🦜 | Loro | Ecuador tiene más de 1.600 especies de aves |
| 🦙 | Llama | Vive en los páramos de los Andes |
| 🦋 | Mariposa | En Ecuador hay miles de especies de mariposas |
| 🐬 | Delfín rosado | Vive en los ríos de la Amazonía |
| 🐋 | Ballena jorobada | Visita la costa entre junio y septiembre |
| 🍫 | Cacao | El cacao fino de aroma del Ecuador es famoso en el mundo |
| 🍌 | Banano | Ecuador es el mayor exportador de banano del mundo |
| ☕ | Café de Loja | Famoso por su aroma |
| 🐒 | Mono | En la Amazonía viven monos de muchas especies |

- Dorso de las cartas: el personaje de quien juega (en vez de las iniciales con corazón), sobre rayas del color del juego.
- Textos: «Ronda 1 · ¡Memoriza! 👀», «¡Ahora encuentra los pares!», al final «🐘 ¡Memoria de elefante! +500» con lluvia de 🎉. Renombrar `S.parejas`/`S.parejasRonda` a `S.pares`/`S.paresRonda`, y «pareja encontrada» a «par encontrado» (es palabra prohibida aunque no se vea).
- Rango: 3 rondas «¡Memoria de elefante! 🐘» · 2 «¡Muy buena memoria!» · 1 «Buen comienzo» · 0 «Pensando en otra cosa 😅».
- Registro: nombre «Memoria del Ecuador»; lema «Encuentra los pares: animales, volcanes y sabores. Tres rondas contra el reloj.»; tono `["#14B8A6","#FFC53D","#0B6E62"]`; reglas 🃏 encuentra los pares · 🔥 seguidos valen más · ⏱️ el tiempo que sobra suma · ✨ ronda perfecta: +300; nota «Cada par que encuentras trae un dato del Ecuador.»; estadísticas «pares / errores / rondas»; botón «Empezar 🃏».
- Fondo `.mem`: de menta clarito a crema (`#E3FAF4` → `#FFF6E5`; oscuro `#12302C` → `#0F1428`).

### 8.4 Fusión de frutas (`fusion.js`)

`id: "fusion"`. Como el famoso juego de la sandía: de una cereza hasta la sandía (2.048) y más allá.

| Nivel | Valor | Ficha |
|---|---|---|
| 1 | 2 | 🍒 Cereza |
| 2 | 4 | 🍓 Frutilla |
| 3 | 8 | 🍇 Uvas |
| 4 | 16 | 🍋 Limón |
| 5 | 32 | 🍊 Mandarina |
| 6 | 64 | 🍎 Manzana |
| 7 | 128 | 🍐 Pera |
| 8 | 256 | 🥭 Mango |
| 9 | 512 | 🍍 Piña |
| 10 | 1.024 | 🥥 Coco |
| 11 | 2.048 | 🍉 Sandía (la meta) |
| 12 | 4.096 | 🧺 Canasta llena |
| 13 | 8.192 | 🏆 Frutería de oro |

- Al llegar (reemplazan a `LOGROS`): 7 «🍐 ¡Una pera!» · 8 «🥭 ¡Mango maduro!» · 9 «🍍 ¡Piña dulce!» · 10 «🥥 ¡Llegó el coco!» · 11 «🍉 ¡LA SANDÍA! ¡Lo lograste!» · 12 «🧺 ¡Canasta llena!» · 13 «🏆 ¡Frutería de oro!».
- Textos: «Desliza para juntar frutas 🍒», «Ya no quedan movimientos» (sin 💔); al final «¡Llegaste a la sandía! 🍉» o «Tu mejor fruta: 🥭 Mango.».
- Rango: 13 «Frutería de oro 🏆» · 12 «Canasta llena 🧺» · 11 «¡La sandía! 🍉» · 10 «Coco 🥥» · 9 «Piña dulce 🍍» · 8 «Mango maduro 🥭» · 7 «Pera 🍐» · menos, «Fruta a fruta 🍒».
- Colores de las fichas `n1…n13`: de rojo cereza clarito a verde sandía, con la etiqueta chica legible (4,5:1 o más). Tablero crema (`#F3E3C3`; oscuro `#2B2F55`) en vez de rosado.
- Registro: nombre «Fusión de frutas»; lema «Junta frutas iguales hasta llegar a la sandía.»; tono `["#FF8A5B","#FFC53D","#B4441F"]`; reglas 👆 desliza a cualquier lado · 🍒 iguales se juntan · 🍍 cada fusión suma · 🍉 meta: la sandía; nota «De una cereza a una sandía: ¿hasta dónde llegas, {nombre}?»; botón «Empezar 🍒».

### 8.5 La sala para varias personas (`sala.js`)

Copia de `public/juegos/sala.js`, con `window.RecreoJuegos` en vez de `window.NosotrosJuegos` y claves de `localStorage` con prefijo `recreo-`.

**Se queda**: el registro de juegos, el sonido (Web Audio), `sprite()`, `lienzo()`, la vista a pantalla completa con sus capas (cómo se juega, pausa, fin), la pausa al salir de la app o al tocar «atrás» en Android, `fondoInerte`, la carga de las letras antes de dibujar y Escape en el computador.

**Se va**: el Marcador del amor, el Premio secreto (y su diálogo), «Retar» por `eventos`, el puntito de «tu pareja jugó», `probar()` (lo reemplaza el modo prueba de toda la app), `CIUDADES`, `lejos()`, `diaEspecial()`, `encuentro()`, `distancia()` y `corazon()` (en su lugar, `estrellita(g, x, y, s)`, una estrella de cinco puntas).

**Cambia**:
- `api.records` → `{ mio, hoyMio, partidasMio, metas, lider }`, con `metas = RecreoDatos.metas(id)`. En los juegos, `S.rival`/`S.pasoRival` pasan a ser «la siguiente meta»: cada vez que superas una marca, «¡Pasaste a Maritza!»; si era la más alta, «👑 ¡Primer lugar!».
- `api.yo` trae además `avatar` y `color` (los usan el avioncito y el dorso de Memoria).
- `cartaJuego` dibuja la tarjeta de la maqueta (sticker, líder, «Tú», «Jugar»).
- `abrir(def, { practica })`; la capa de inicio tiene «¡A jugar!» y «Practicar (no cuenta)»; en práctica, una cinta «PRÁCTICA» sobre el marcador.
- `terminar(res)`: guarda con `RecreoDatos.guardar` (salvo en práctica) y arma el final de §9.3.
- `retar()` → `compartir()` (§9.5).
- Textos: «Aquí te esperamos ⏸️» (pausa), «Terminar y guardar mi puntaje», «Salir sin guardar», «Otra vez», «Retar por WhatsApp», «Volver a los juegos».
- `juegos.css`: sin `.j-marcador`, `.j-premio` ni nada de corazones; las tarjetas como la maqueta; `--hand`, `--display` y la letra manuscrita pasan a `--f-titulo`; `.jv-reglas li.malo` en `--error`. Al terminar, cada `var(--…)` usado tiene que existir en `estilos.css` (o ser uno `--j-*` del propio archivo).

---

## 9. Ranking, medallas, novedades y retos

### 9.1 Puestos
Por juego, de mayor a menor. Un empate comparte puesto (1, 1, 3). Quien no tiene partidas no tiene puesto y va al final («todavía no juega»). «De hoy», igual pero con `mejor_hoy`.

### 9.2 Medallero
En cada juego: 🥇 al 1º, 🥈 al 2º y 🥉 al 3º (los empates comparten medalla). Se ordena por oros, después platas, después bronces y después nombre. El podio muestra a los tres primeros.

### 9.3 Fin de partida
Antes de guardar se calcula el puesto con la marca anterior y con la nueva. Insignia y frase (la primera fila que corresponda):

| Qué pasó | Insignia | Frase |
|---|---|---|
| era práctica | — | «Práctica: no se guardó. ¿Ahora de verdad?» y botón «Jugar de verdad» |
| ahora es 1º | 👑 ¡Primer lugar! Pasaste a {nombre} | «Que el resto vaya preparando la revancha.» |
| empató con el 1º | ¡Empate en el primer lugar! | «Una partida más y es tuyo.» |
| récord personal y subió de puesto | ✨ ¡Nuevo récord personal! | «Subiste al {n}º lugar: pasaste a {nombres}.» |
| récord personal | ✨ ¡Nuevo récord personal! | «Te faltan {x} para alcanzar a {siguiente}.» |
| nadie más lo ha jugado | — | «Nadie más ha jugado este todavía: tu marca es la meta.» |
| sigue 1º | — | «Sigues en el primer lugar 👑» |
| quedó a 85 % o más de la siguiente marca | — | «Te faltaron {x} para pasar a {siguiente}. ¡Casi!» |
| lo demás | — | «La marca de {siguiente} sigue ahí: {marca}. ¡Tú puedes!» |

Debajo del puntaje, «Quedaste {n}º de {total}». Lluvia de 👑 (primer lugar) o ✨ (récord); fanfarria o tono de consuelo, como en Nosotros.

### 9.4 Mientras no estabas
`recreo-visto-<uid>` (en `localStorage`) guarda las mejores marcas que ya viste. Al abrir, por cada juego y cada otra persona cuya marca subió: primero «😮 {Nombre} te pasó en {Juego}: {marca}» si te superó; después «👑 {Nombre} es primer lugar en {Juego}» si quedó 1º; si no, «{Nombre} mejoró su marca en {Juego}». Máximo tres, en ese orden. Queda visto al cerrar la tarjeta o al abrir Ranking.

### 9.5 Retar por WhatsApp
Texto: «¡Te reto en {Juego}! Hice {marca} {emoji}. ¿Me ganas? {location.origin}». Con `navigator.share({ text })` si existe; si no, `https://wa.me/?text=` + `encodeURIComponent(texto)` en una pestaña nueva. Sin tope de tiempo: no le manda push a nadie.

### 9.6 Práctica
El mismo juego, con las mismas reglas, sin guardar. Sirve para aprender (sobre todo el Avioncito) sin miedo a «arruinar» el ranking.

---

## 10. Textos

- Tono: corto, cálido, de familia; tuteo, como en Nosotros; neutro en género.
- Prohibido (lo revisa `paridad.mjs`): corazón, amor, beso, pareja, novio/a, te quiero, te amo, extrañar, cupido, enamorado, Talca, Nosotros; y 💗 💖 💕 💞 💘 💝 💓 💟 💌 💋 ❤ ♥ 🥰 😘 😍 🌹 💑 💏 💍. Ojo con las «parejas» de Memoria: son «pares».
- Sí: «¡Chévere!», «¡De ley!», «¡Achachay!» (el frío del ❄️), «¡Qué nivel!», «¡Tú puedes!», 🎉 ✨ 👑 🏆 ⭐.
- Números con `toLocaleString("es")` (1.240). Fechas relativas como `ago()` de Nosotros («hace 2 h», «el 20 oct a las 19:05»).

---

## 11. Pruebas

### 11.1 Automáticas (sin tocar la base real)
1. SQL: `cd supabase/pruebas && npm install --no-package-lock && node familia.mjs` → «Todo bien ✓».
2. Paridad, nada romántico y Nosotros intacto: `node familia/herramientas/paridad.mjs` → «Todo bien ✓».
3. Sintaxis: `node --check` en cada `.js` de `familia/` y en `supabase/functions/familia-cuenta/index.ts`.
4. `git status`: solo cosas nuevas en `familia/`, `supabase/familia.sql`, `supabase/pruebas/`, `supabase/functions/familia-cuenta/` y `docs/` (el `.env` no se sube).

### 11.2 En el navegador, en modo prueba
Agregar a `.claude/launch.json` la configuración `recreo`: `python -m http.server 3020 --bind 127.0.0.1 -d familia` (el 3000 suele estar ocupado). Abrir `http://localhost:3020/#prueba` y también `#prueba=maritza`. En la pestaña de red no debe salir **nada** hacia `supabase.co`.

En claro y oscuro, a 375 px y en computador:
- [ ] ¿Quién va a jugar? → contraseña (crear y entrar) → personaje → Juegos (en prueba, todo simulado).
- [ ] Juegos: novedades, las cuatro tarjetas con el líder y «Tú», sonido.
- [ ] Cada juego: cómo se juega, una partida entera, pausa (botón, «atrás», cambiar de app), práctica, fin con la frase correcta, «Otra vez», retar (en el computador abre wa.me), volver.
- [ ] Lluvia: los seis niveles (60 s); el meteorito resta vida; el marcianito que cae resta vida; reloj +2 s; hielo «¡Achachay!»; la meta arriba al centro.
- [ ] Avioncito: el avión en el color de quien juega, estrellas +50, hitos, el camino con los puntitos de la familia.
- [ ] Memoria: tres rondas, los datos del Ecuador, el dorso con el personaje.
- [ ] Fusión: frutas por lo menos hasta el mango; etiquetas legibles.
- [ ] Ranking: siempre y hoy, medallero, tablas, empates, «todavía no juega», últimas partidas.
- [ ] Yo: cambiar personaje, color y nombre (se nota en todas partes), «Letra grande» (nada se corta), sonido, vibración, instalar, cerrar sesión.
- [ ] Sin red (modo sin conexión de las herramientas del navegador): la franja «sin internet» aparece y una partida queda pendiente y se guarda al volver.
- [ ] Reducir movimiento: sin lluvias ni rebotes.
- [ ] Con teclado en el computador: Tab llega a todo con el foco visible; Escape pausa.
- [ ] Ningún texto romántico a la vista (además de `paridad.mjs`).
- [ ] La lista final de la habilidad de diseño (`references/pro-rules.md` de UI/UX Pro Max): íconos de una sola familia, toques con respuesta en 80–150 ms, áreas de toque, contraste en los dos temas, zona segura.

Capturas de cada pantalla para mostrárselas a Fernando.

### 11.3 Después de publicar (las hace Fernando, no la IA)
1. Fernando abre la dirección del Recreo en su teléfono → «¿Eres Fernando o Martina?» → entra con su cuenta → ve el ranking con sus récords y los de Martina (los de Nosotros).
2. Juega una partida → aparece en el ranking.
3. Abre Nosotros: todo igual (y la partida del Recreo no aparece ahí).
4. Con Eli y Maritza: §13.

---

## 12. Publicar (solo con permiso de Fernando)

Pedir el «sí» mostrando estos comandos. En este orden (la base primero), desde la raíz del proyecto:

```bash
npx supabase db query --linked --project-ref lrsrmblmqvkpltajegqw -f supabase/familia.sql
```

Con `FAMILIA_PERMITIDOS=eli,maritza` ya agregado al `.env`:

```bash
npx supabase secrets set --env-file .env --project-ref lrsrmblmqvkpltajegqw
```

```bash
npx supabase functions deploy familia-cuenta --project-ref lrsrmblmqvkpltajegqw --no-verify-jwt --use-api
```

Vercel, desde `familia/` (un proyecto nuevo en la misma cuenta de siempre):

```bash
npx vercel link --yes --project recreo-familia
```

```bash
npx vercel deploy --prod --yes
```

- Si la CLI de Supabase pide iniciar sesión: el token personal dura 7 días; repetir `.claude/login-token.ps1`.
- Comprobar después, en el SQL Editor: `select nombre, avatar from familia_miembros;` → Fernando 🦊 y Martina 🐧.
- La dirección `recreo-familia.vercel.app` puede estar tomada (Vercel le agrega algo): anotar la final en `familia/README.md`.
- No hace falta tocar ni volver a publicar Nosotros.

---

## 13. Primer uso con Eli y Maritza

Mensaje para el WhatsApp de la familia: «¡Les hice una app de juegos! Ábranla aquí: {dirección}. Toquen su nombre y elijan una contraseña 🎮».

- **Android (Chrome)**: abrir el enlace → tocar su nombre → crear la contraseña → elegir personaje → en «Yo», «Poner el Recreo en mi pantalla».
- **iPhone (Safari)**: abrir el enlace en **Safari** → Compartir → «Agregar a pantalla de inicio» → abrir **desde el ícono** → tocar su nombre → crear la contraseña. Si la crearon antes en Safari, en el ícono solo vuelven a poner la contraseña.
- Con Maritza: activar «Letra grande» si le sirve; empezar por Memoria o Fusión (sin apuro) y probar el Avioncito en «Practicar».
- Si alguien olvida su contraseña, Fernando la cambia en Supabase → SQL Editor (el comando va en `familia/README.md`).

---

## 14. Riesgos y cómo se evitan

| Riesgo | Cómo se evita |
|---|---|
| Que la IA rompa Nosotros | regla 1 + `paridad.mjs` revisa el `git status` de todo lo de Nosotros |
| Que se cuele algo romántico | regla 2 + búsqueda automática de palabras y emojis + revisión a ojo |
| Ranking injusto | regla 3 + lista de líneas de puntaje que deben quedar idénticas + `git diff --no-index` |
| Una cuenta de la familia entrando a Nosotros | dominio `@familia.invalid`: `entrar_pareja()` la rechaza |
| La familia leyendo cosas de la pareja | RLS: `familia_*` solo para el Recreo; `partidas` solo a través de funciones que devuelven puntajes (41 comprobaciones) |
| El apodo romántico de Fernando en el ranking | el nombre sale del usuario, no del perfil |
| Probar en local escribe en la base real | modo prueba sin cliente de Supabase |
| Fernando cierra su sesión de Nosotros al salir del Recreo | `signOut({ scope: "local" })` |
| Fernando cambia su contraseña de Nosotros sin querer | «Cambiar contraseña» solo para la familia |
| Una partida perdida por mala señal | cola de pendientes que se reintenta |
| iPhone pierde la sesión al instalar | la guía de §13 |
| Costo | la misma base, Vercel Hobby, nada pago |
| El tope de 6 cuentas de la función `cuenta` | quedan 4; solo importaría si la pareja necesitara otra cuenta |

---

## 15. Orden de trabajo

Cada fase termina con sus pruebas en verde antes de seguir. Commits chicos y en español, como los de siempre.

- [ ] **Fase 0 · Preparar**: rama `recreo`; leer este plan y la maqueta. *Lista cuando* se entiende qué no se toca.
- [ ] **Fase 1 · Base**: `git mv docs/plan-familia/familia.sql supabase/familia.sql` y `git mv docs/plan-familia/pruebas supabase/pruebas`. *Lista cuando* `node familia.mjs` dice «Todo bien ✓».
- [ ] **Fase 2 · Cuentas**: `supabase/functions/familia-cuenta/index.ts` desde el borrador; `FAMILIA_PERMITIDOS` en el `.env`. *Lista cuando* `node --check` pasa.
- [ ] **Fase 3 · Esqueleto**: `familia/` con `index.html`, `estilos.css` (tokens de la maqueta), `config.js`, `app.js` (sesión + modo prueba + pestañas + «Yo»), `datos.js`, manifiesto, `sw.js`, `vercel.json`, fuentes e íconos; `paridad.mjs` a `familia/herramientas/`. *Lista cuando* en `#prueba` se recorre entrada → personaje → pestañas, en claro, oscuro y a 375 px.
- [ ] **Fase 4 · Sala**: `juegos/sala.js` y `juegos.css`, empezando por Fusión (la más simple de adaptar). *Lista cuando* Fusión se juega entera en prueba y su fin de partida dice lo correcto.
- [ ] **Fase 5 · Juegos**: Memoria, Avioncito y Lluvia, en ese orden. *Lista cuando* `paridad.mjs` dice «Todo bien ✓» y cada juego pasa §11.2.
- [ ] **Fase 6 · Ranking**: `ranking.js`, novedades, retar, práctica y pendientes. *Lista cuando* pasa todo §11.2.
- [ ] **Fase 7 · Revisión final**: §11.1 y §11.2 completos; `familia/README.md` (qué es, cómo se prueba, cómo se publica, cómo cambiar una contraseña, cómo sumar a alguien de la familia); capturas para Fernando.
- [ ] **Fase 8 · Publicar**: pedirle permiso a Fernando con §12; después, §11.3 y §13 con él.

---

## 16. Después (opcional, pedir permiso antes)

- Avisos push del propio Recreo («Maritza te pasó en Memoria»), con su service worker y una función nueva.
- Que a Fernando le llegue en Nosotros un aviso cuando Eli le gane: **eso toca Nosotros**, así que solo si él lo pide.
- Un quinto juego pensado para Maritza (sopa de letras, «¿cuál es la capital?»), con su propio ranking.
- Sumar a alguien más de la familia (papá, primos): su usuario en `FAMILIA_PERMITIDOS` y en `FAMILIA` de `config.js`.

---

## Anexo · Decisiones tomadas

| Tema | Decisión | Se descartó |
|---|---|---|
| Dónde vive | proyecto de Vercel aparte, carpeta `familia/` | `/familia` dentro de Nosotros (misma dirección y toca `public/`) |
| Base | la misma de Supabase, con tablas nuevas | un proyecto nuevo (~US$10/mes y sin los récords de la pareja) |
| Cuentas | `@familia.invalid` y la función nueva `familia-cuenta` | reutilizar `cuenta` (con el dominio de la pareja, `entrar_pareja()` les armaría una pareja) |
| Entrar | tocar tu nombre + contraseña | escribir el usuario; códigos de invitación |
| Fernando y Martina | siempre en el ranking; pueden entrar con su cuenta | solo verlos, sin poder entrar ni jugar |
| Juegos | copias con otra cara y las mismas reglas | bajar la dificultad para Maritza (rompería el ranking): en su lugar, «Practicar» |
| Retos | compartir por WhatsApp | push (más piezas, y para avisarle a Fernando habría que tocar Nosotros) |
| Diseño | cuaderno del recreo: crema, azul, sol, Fredoka | la paleta rosada que sugería la herramienta (es la de Nosotros) |
| Nombre | Recreo | «Juegos en familia», «Liga familiar» |
