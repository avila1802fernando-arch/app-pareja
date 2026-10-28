# Recreo · juegos en familia

App aparte (no se publica junto con la otra) para que **Eli** y **Maritza** jueguen los cuatro juegos sin nada romántico, con un ranking donde sale también Fernando (Martina está oculta: no se ven sus récords). El plan completo, con las decisiones, está en `docs/plan-familia.md`; la maqueta, en `docs/recreo-maqueta.html`.

- **Juegos**: Lluvia de estrellas, Avioncito de papel, Memoria del Ecuador y Fusión de frutas. Tienen las mismas reglas de puntaje que los de la otra app, así que los récords se pueden comparar.
- **Juegos en vivo, para dos a la vez**: UNO y Batalla naval, cada uno en su teléfono. Se reta a cualquiera de la familia («¿Con quién juegas?»); Fernando también los juega con ellas desde la otra app, donde salen en «Otros». No hay push: el aviso va por WhatsApp. Son las mismas pantallas de la otra app (`batalla.js`, `uno.js`, sus motores y sus estilos, y `vivo-canal.js`, el canal de tiempo real que se vuelve a abrir solo si se cae): se cambian en `public/juegos/` y se copian aquí tal cual (la revisión avisa si quedaron distintos). Si el tiempo real se corta, con la partida abierta cada teléfono le pregunta a la base cada 5 s, así el turno igual llega.
- **Base**: el mismo proyecto de Supabase, con tablas propias (`supabase/familia.sql`). Eli y Maritza no pueden leer nada de la otra app. Las partidas en vivo van en las tablas de esos juegos (`supabase/batalla.sql` y `supabase/uno.sql`), marcadas como de familia: solo las ven los dos que juegan.
- **Cuentas**: `eli` y `maritza` (correo interno `usuario@familia.invalid`), creadas desde el Recreo por la función `familia-cuenta`. Fernando puede entrar con su cuenta de siempre; Martina está oculta y no puede entrar.
- **Costo**: cero.

## Probar en el computador (sin tocar la base real)

Servidor `recreo` de `.claude/launch.json` (puerto 3020), y abrir:

- `http://localhost:3020/#prueba` → se entra tocando un nombre (todo simulado).
- `http://localhost:3020/#prueba=maritza` → directo como Maritza.
- `http://localhost:3020/#prueba=eli-nuevo` → para ver «Elige tu personaje».
- Los juegos en vivo: `#prueba=eli` en una pestaña y `#prueba=maritza` (o `#prueba=fernando`) en otra; la partida pasa de una pestaña a la otra.

En modo prueba no se crea el cliente de Supabase: nada sale hacia la base.

Revisiones automáticas, desde la raíz del repo:

```bash
node familia/herramientas/paridad.mjs
```

```bash
cd supabase/pruebas && npm install --no-package-lock && node familia.mjs
```

```bash
cd supabase/pruebas && npm run test:batalla && npm run test:uno
```

La primera revisa que los juegos tengan el mismo puntaje que los originales, que no haya nada romántico, que la otra app siga intacta, que los juegos en vivo sean los mismos archivos en las dos apps y que nada use algo que el navegador viejo del teléfono de Eli no entienda. La segunda prueba el SQL del Recreo (41 comprobaciones) en un Postgres local, y la tercera el de los juegos en vivo, también las partidas de familia.

## Publicar (con permiso de Fernando)

Desde la raíz del proyecto, en este orden:

```bash
npx supabase db query --linked --project-ref lrsrmblmqvkpltajegqw -f supabase/familia.sql
```

```bash
npx supabase secrets set --env-file .env --project-ref lrsrmblmqvkpltajegqw
```

```bash
npx supabase functions deploy familia-cuenta --project-ref lrsrmblmqvkpltajegqw --no-verify-jwt --use-api
```

Para los juegos en vivo (después de `familia.sql`; se pueden repetir):

```bash
npx supabase db query --linked --project-ref lrsrmblmqvkpltajegqw -f supabase/batalla.sql
```

```bash
npx supabase db query --linked --project-ref lrsrmblmqvkpltajegqw -f supabase/uno.sql
```

Y desde `familia/` (proyecto de Vercel nuevo):

```bash
npx vercel link --yes --project recreo-familia
```

```bash
npx vercel deploy --prod --yes
```

Dirección publicada: **https://recreo-familia.vercel.app** (proyecto `recreo-familia` en Vercel, desde el 2026-10-24). Para volver a publicar después de un cambio, basta el último comando desde `familia/`.

## Si alguien olvida su contraseña

Supabase → SQL Editor (cambiar el usuario y la clave nueva):

```sql
update auth.users set encrypted_password = extensions.crypt('ClaveNueva123', extensions.gen_salt('bf', 10)), updated_at = now()
 where email = 'maritza@familia.invalid';
```

## Sumar a alguien más de la familia

1. Agregar su usuario a `FAMILIA_PERMITIDOS` en el `.env` (por ejemplo `eli,maritza,papa`) y volver a correr `secrets set`.
2. Agregarlo a `FAMILIA` en `familia/config.js` (usuario, nombre, personaje y color) y volver a publicar Vercel.

Borrar una cuenta de la familia (Authentication → Users) borra solo lo suyo del Recreo.

## Íconos

```bash
python familia/herramientas/iconos.py
```
