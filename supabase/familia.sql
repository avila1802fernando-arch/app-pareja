-- Recreo · juegos en familia
-- Una app APARTE de Nosotros (carpeta familia/, otra URL) que usa la misma base de datos: Eli y Maritza
-- juegan los mismos cuatro juegos, sin nada romántico, y en el ranking ven también los récords de
-- Fernando y Martina. Pegar completo en Supabase → SQL Editor → Run (o con la CLI: ver familia/README.md).
-- Se puede volver a ejecutar: no borra datos. No cambia nada de Nosotros: solo agrega tablas y funciones
-- nuevas y LEE los récords de `partidas` para armar el ranking.

-- ========== QUIÉN JUEGA ==========
-- Una fila por persona del Recreo: su nombre en el ranking, su personaje (un emoji) y su color.
-- Las cuentas de la familia son usuario@familia.invalid (las crea la función familia-cuenta);
-- Fernando y Martina entran con su cuenta de siempre (usuario@nosotros.invalid).
create table if not exists public.familia_miembros (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 20),
  avatar text not null default '🙂' check (char_length(avatar) between 1 and 16),
  color text not null default 'azul' check (color in ('azul', 'coral', 'menta', 'uva', 'sol', 'hoja')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()   -- igual a creado_en = todavía no eligió su personaje
);

-- Una fila por partida terminada en el Recreo (las de práctica no se guardan). Son los mismos juegos de
-- Nosotros con otra cara y LAS MISMAS reglas de puntaje: lluvia (= corazones), vuelo, memoria, fusion.
create table if not exists public.familia_partidas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  juego text not null check (juego in ('lluvia', 'vuelo', 'memoria', 'fusion')),
  puntos integer not null check (puntos between 0 and 100000000),
  detalle jsonb check (detalle is null or pg_column_size(detalle) <= 2000),
  creado_en timestamptz not null default now()
);
-- Oculto: no sale en el Recreo (ni en el ranking, ni en las partidas) y no puede entrar. Martina está oculta
-- porque Fernando lo pidió el 2026-10-25 (ver el final del archivo).
alter table public.familia_miembros add column if not exists oculto boolean not null default false;
create index if not exists familia_partidas_recientes_idx on public.familia_partidas (creado_en desc);
create index if not exists familia_partidas_mejor_idx on public.familia_partidas (usuario_id, juego, puntos desc);

-- ========== SEGURIDAD (RLS) ==========
alter table public.familia_miembros enable row level security;
alter table public.familia_partidas enable row level security;

-- ¿Soy del Recreo? (sin pasar por RLS, para usarla dentro de las políticas)
create or replace function public.es_familia() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.familia_miembros where usuario_id = auth.uid() and not oculto);
$$;

-- ¿Esta persona está oculta? (también sin pasar por RLS: la familia no ve las filas ocultas)
create or replace function public.familia_oculto(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.familia_miembros where usuario_id = u and oculto);
$$;

-- Los del Recreo se ven entre ellos. Nombre, personaje y color se cambian con editar_familia().
drop policy if exists "familia: verse" on public.familia_miembros;
create policy "familia: verse" on public.familia_miembros for select using (public.es_familia() and not oculto);

-- Partidas: las ven todos los del Recreo; cada uno guarda solo las suyas (no se editan ni se borran)
drop policy if exists "familia: ver partidas" on public.familia_partidas;
create policy "familia: ver partidas" on public.familia_partidas
  for select using (public.es_familia() and not public.familia_oculto(usuario_id));
drop policy if exists "familia: jugar" on public.familia_partidas;
create policy "familia: jugar" on public.familia_partidas
  for insert with check (usuario_id = auth.uid() and public.es_familia());

-- ========== ENTRAR AL RECREO ==========
-- La primera vez crea mi fila. Pueden entrar las cuentas de la familia y las dos de Nosotros (las de la
-- pareja completa; una cuenta de prueba suelta no). El nombre sale del usuario ("maritza" → "Maritza") y
-- no del perfil de Nosotros: ahí puede haber un apodo que no es para la familia.
create or replace function public.entrar_familia() returns public.familia_miembros
language plpgsql security definer set search_path = public as $$
declare
  fila public.familia_miembros;
  correo text;
begin
  select email into correo from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if correo is null then return null; end if;
  select * into fila from public.familia_miembros where usuario_id = auth.uid();
  if found then
    if fila.oculto then return null; end if; -- oculta: no entra
    return fila;
  end if;
  if not (correo like '%@familia.invalid'
          or (correo like '%@nosotros.invalid' and exists (
                select 1 from public.parejas
                 where (usuario_a = auth.uid() or usuario_b = auth.uid()) and usuario_b is not null))) then
    return null;
  end if;
  insert into public.familia_miembros (usuario_id, nombre)
  values (auth.uid(), left(initcap(split_part(correo, '@', 1)), 20))
  on conflict (usuario_id) do nothing;
  select * into fila from public.familia_miembros where usuario_id = auth.uid();
  return fila;
end;
$$;
revoke all on function public.entrar_familia() from public, anon;
grant execute on function public.entrar_familia() to authenticated;

-- Cambiar mi nombre, personaje o color (lo que venga en null se queda como estaba)
create or replace function public.editar_familia(p_nombre text, p_avatar text, p_color text)
returns public.familia_miembros
language sql security definer set search_path = public as $$
  update public.familia_miembros set
    nombre = coalesce(nullif(left(btrim(p_nombre), 20), ''), nombre),
    avatar = coalesce(nullif(btrim(p_avatar), ''), avatar),
    color = coalesce(p_color, color),
    actualizado_en = now()
   where usuario_id = auth.uid()
  returning *;
$$;
revoke all on function public.editar_familia(text, text, text) from public, anon;
grant execute on function public.editar_familia(text, text, text) to authenticated;

-- ========== RANKING ==========
-- Todas las partidas que cuentan: las del Recreo y las que Fernando y Martina juegan en Nosotros ("corazones"
-- allá es "lluvia" aquí), solo de gente del Recreo. La familia nunca lee `partidas` directo (ni su detalle):
-- solo lo que devuelven ranking_familia y actividad_familia.
create or replace function public.familia_todas()
returns table (usuario_id uuid, juego text, puntos integer, creado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select t.usuario_id, t.juego, t.puntos, t.creado_en
    from (
      select f.usuario_id, f.juego, f.puntos, f.creado_en from public.familia_partidas f
      union all
      select p.usuario_id, case p.juego when 'corazones' then 'lluvia' else p.juego end, p.puntos, p.creado_en
        from public.partidas p
       where p.juego in ('corazones', 'vuelo', 'memoria', 'fusion')
    ) t
   where exists (select 1 from public.familia_miembros m where m.usuario_id = t.usuario_id and not m.oculto);
$$;
revoke all on function public.familia_todas() from public, anon, authenticated;

-- El mejor puntaje de cada uno en cada juego, cuántas veces jugó, su mejor desde p_desde (el comienzo de
-- "hoy" en la zona de quien mira) y cuándo jugó por última vez
create or replace function public.ranking_familia(p_desde timestamptz)
returns table (usuario_id uuid, juego text, mejor integer, partidas integer, mejor_hoy integer, ultima timestamptz)
language sql stable security definer set search_path = public as $$
  select t.usuario_id, t.juego, max(t.puntos)::int, count(*)::int,
         (max(t.puntos) filter (where t.creado_en >= p_desde))::int, max(t.creado_en)
    from public.familia_todas() t
   where public.es_familia()
   group by t.usuario_id, t.juego;
$$;
revoke all on function public.ranking_familia(timestamptz) from public, anon;
grant execute on function public.ranking_familia(timestamptz) to authenticated;

-- Las últimas partidas de todos (para "Últimas partidas" y "Mientras no estabas")
create or replace function public.actividad_familia(p_limite integer default 12)
returns table (usuario_id uuid, juego text, puntos integer, creado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select t.usuario_id, t.juego, t.puntos, t.creado_en
    from public.familia_todas() t
   where public.es_familia()
   order by t.creado_en desc
   limit least(greatest(coalesce(p_limite, 12), 1), 50);
$$;
revoke all on function public.actividad_familia(integer) from public, anon;
grant execute on function public.actividad_familia(integer) to authenticated;

-- ========== FERNANDO Y MARTINA EN EL RANKING ==========
-- Aparecen desde el primer día con los récords que ya tienen en Nosotros. Si entran al Recreo, pueden
-- cambiar su personaje y su color.
insert into public.familia_miembros (usuario_id, nombre, avatar, color)
select u.id, left(initcap(split_part(u.email, '@', 1)), 20),
       case split_part(u.email, '@', 1) when 'fernando' then '🦊' when 'martina' then '🐧' else '🙂' end,
       case split_part(u.email, '@', 1) when 'fernando' then 'azul' when 'martina' then 'menta' else 'hoja' end
  from auth.users u
 where u.email like '%@nosotros.invalid'
   and exists (select 1 from public.parejas x
                where (x.usuario_a = u.id or x.usuario_b = u.id) and x.usuario_b is not null)
on conflict (usuario_id) do nothing;

-- Martina no se ve en el Recreo: ni sus récords ni su nombre (lo pidió Fernando el 2026-10-25).
-- Para que vuelva a aparecer: quitar estas líneas y correr  update public.familia_miembros set oculto = false ...
update public.familia_miembros set oculto = true
 where usuario_id in (select id from auth.users where email = 'martina@nosotros.invalid') and not oculto;

-- ========== LA FAMILIA EN NOSOTROS ==========
-- Fernando y Martina ven en su sala de juegos los récords de Eli y Maritza (lo pidió Fernando el 2026-10-25).
-- Solo los de la familia (@familia.invalid, no ocultos) y solo para las dos cuentas de la pareja completa.
-- El juego sale con su nombre de Nosotros ("lluvia" del Recreo = "corazones"): las reglas de puntaje son las mismas.
create or replace function public.records_familia()
returns table (nombre text, avatar text, color text, juego text, mejor integer, partidas integer, ultima timestamptz)
language sql stable security definer set search_path = public as $$
  select m.nombre, m.avatar, m.color, case f.juego when 'lluvia' then 'corazones' else f.juego end,
         max(f.puntos)::int, count(*)::int, max(f.creado_en)
    from public.familia_partidas f
    join public.familia_miembros m on m.usuario_id = f.usuario_id and not m.oculto
    join auth.users u on u.id = f.usuario_id and u.email like '%@familia.invalid'
   where exists (select 1 from public.parejas x
                  where (x.usuario_a = auth.uid() or x.usuario_b = auth.uid()) and x.usuario_b is not null)
   group by m.usuario_id, m.nombre, m.avatar, m.color, f.juego;
$$;
revoke all on function public.records_familia() from public, anon;
grant execute on function public.records_familia() to authenticated;

-- ========== TIEMPO REAL ==========
-- Una partida nueva o un personaje cambiado se ven al instante (RLS: solo les llega a los del Recreo)
do $$
declare t text;
begin
  foreach t in array array['familia_miembros', 'familia_partidas'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
