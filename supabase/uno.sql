-- Nosotros · UNO en vivo 🃏
-- El juego de cartas para los dos, cada uno en su teléfono. Las manos son secretas de verdad: cada uno solo puede leer
-- la suya y el mazo no lo lee nadie. Lo baraja y lo reparte la base, que también revisa cada jugada (las funciones de
-- abajo son la única forma de jugar).
-- Las cartas: color (r rojo, a amarillo, v verde, z azul) + valor (0–9, s salta, r reversa, d roba dos), y los
-- comodines x (cambia el color) y x4 (roba cuatro). Entre dos, salta y reversa hacen lo mismo: vuelves a jugar.
-- public/juegos/uno.js es la pantalla y uno-motor.js tiene las mismas reglas en JavaScript (para jugar contra la compu).
-- Pegar en Supabase → SQL Editor → Run, después de schema.sql y avisos.sql. Se puede volver a ejecutar: no borra datos.

-- ========== TABLAS ==========
create table if not exists public.unos (
  id uuid primary key default gen_random_uuid(),
  pareja_id uuid not null references public.parejas(id) on delete cascade,
  creado_por uuid not null references auth.users(id) on delete cascade,     -- quien retó
  rival uuid not null references auth.users(id) on delete cascade,
  estado text not null default 'jugando' check (estado in ('jugando', 'terminada', 'cancelada')),
  turno uuid references auth.users(id) on delete set null,
  arriba text not null,                                                       -- la carta de arriba del pozo
  color text not null check (color in ('r', 'a', 'v', 'z')),                 -- el que vale (tras un comodín, el elegido)
  cartas jsonb not null default '{}',                                         -- cuántas tiene cada uno: { usuario: n }
  mazo int not null default 0,                                                -- cuántas quedan para robar
  robo uuid,                                    -- quien robó una carta que sirve: la juega o pasa
  uno_dicho uuid[] not null default '{}',       -- quienes dijeron "¡UNO!" (vale mientras tengan 2 cartas o menos)
  uno_pendiente uuid,                           -- quien quedó con una carta sin decirlo: el otro lo puede pillar
  jugadas int not null default 0,               -- cartas jugadas en total
  ganador uuid references auth.users(id) on delete set null,
  puntos int,                                   -- los puntos de lo que le quedó en la mano al que perdió
  rendido boolean not null default false,       -- ganó porque el otro se rindió
  apuesta text check (apuesta is null or char_length(apuesta) <= 120),        -- "Quien pierde…"
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  avisado_en timestamptz,                       -- el último "¡Avisarle!" (uno_avisar)
  check (creado_por <> rival)
);
create index if not exists unos_pareja_idx on public.unos (pareja_id, creado_en desc);

-- La mano de cada uno. Solo la lee su dueño. `robada`: la que acaba de robar (después de robar, solo puede jugar esa).
create table if not exists public.uno_manos (
  juego_id uuid not null references public.unos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  cartas text[] not null default '{}',
  robada text,
  primary key (juego_id, usuario_id)
);

-- El mazo (boca abajo: se roba del final) y el pozo (lo jugado debajo de la de arriba, para volver a barajar).
-- No lo lee nadie, ni los dos.
create table if not exists public.uno_mazos (
  juego_id uuid primary key references public.unos(id) on delete cascade,
  mazo text[] not null,
  pozo text[] not null default '{}'
);

-- Lo que pasa en la mesa, para verlo en vivo: jugar (con la carta), robar (cuántas, no cuáles), pasar, "¡UNO!" y
-- pillar (n: cuántas le hizo robar al otro)
create table if not exists public.uno_jugadas (
  id bigint generated always as identity primary key,
  juego_id uuid not null references public.unos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('juega', 'roba', 'pasa', 'uno', 'pilla')),
  carta text,
  color text,                                                                 -- el color elegido con un comodín
  n int,
  creado_en timestamptz not null default now()
);
create index if not exists uno_jugadas_idx on public.uno_jugadas (juego_id, id);

-- ========== SEGURIDAD (RLS) ==========
-- Se leen entre los dos la partida y las jugadas; la mano, cada uno la suya; el mazo, nadie. Nada se escribe directo.
alter table public.unos enable row level security;
alter table public.uno_manos enable row level security;
alter table public.uno_mazos enable row level security;
alter table public.uno_jugadas enable row level security;

create or replace function public.es_mi_uno(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.unos x where x.id = p and public.es_mi_pareja(x.pareja_id));
$$;

drop policy if exists "unos: leer" on public.unos;
create policy "unos: leer" on public.unos for select using (public.es_mi_pareja(pareja_id));
drop policy if exists "uno_manos: solo la mía" on public.uno_manos;
create policy "uno_manos: solo la mía" on public.uno_manos for select using (usuario_id = auth.uid());
drop policy if exists "uno_jugadas: leer" on public.uno_jugadas;
create policy "uno_jugadas: leer" on public.uno_jugadas for select using (public.es_mi_uno(juego_id));
-- (uno_mazos no tiene ninguna política: no se puede leer)

-- ========== LAS CARTAS ==========
-- Las 108: por color, un 0 y dos de cada 1–9, salta, reversa y roba dos; y 4 comodines y 4 roba cuatro
create or replace function public.uno_mazo_nuevo() returns text[]
language sql immutable as $$
  select array_agg(c) from (
    select col || v as c
      from unnest(array['r', 'a', 'v', 'z']) col,
           unnest(array['0', '1', '1', '2', '2', '3', '3', '4', '4', '5', '5', '6', '6', '7', '7', '8', '8', '9', '9',
                        's', 's', 'r', 'r', 'd', 'd']) v
    union all
    select unnest(array['x', 'x', 'x', 'x', 'x4', 'x4', 'x4', 'x4'])
  ) t;
$$;

-- ¿Se puede jugar `c` sobre `arriba` con el color que vale? Los comodines siempre; si no, mismo color o mismo número
-- o símbolo (sobre un comodín solo cuenta el color elegido)
create or replace function public.uno_vale(c text, arriba text, color text) returns boolean
language sql immutable as $$
  select c in ('x', 'x4') or left(c, 1) = color or (arriba not in ('x', 'x4') and substr(c, 2) = substr(arriba, 2));
$$;

-- Los puntos de una mano, como en el UNO de verdad: el número, 20 las de acción y 50 los comodines
create or replace function public.uno_puntos(cs text[]) returns int
language sql immutable as $$
  select coalesce(sum(case when c in ('x', 'x4') then 50 when substr(c, 2) in ('s', 'r', 'd') then 20 else substr(c, 2)::int end), 0)::int
    from unnest(cs) c;
$$;

-- Para uso interno (nadie las puede llamar directo):
-- saca n cartas del mazo para `quien` (si no alcanzan, se baraja el pozo y se pone debajo)
create or replace function public.uno_sacar(p_id uuid, p_quien uuid, p_n int) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  z public.uno_mazos;
  nuevas text[] := '{}';
  n int;
begin
  select * into z from public.uno_mazos where juego_id = p_id for update;
  if cardinality(z.mazo) < p_n and cardinality(z.pozo) > 0 then
    z.mazo := (select array_agg(c order by random()) from unnest(z.pozo) c) || z.mazo;
    z.pozo := '{}';
  end if;
  n := least(p_n, cardinality(z.mazo));
  if n > 0 then
    nuevas := z.mazo[cardinality(z.mazo) - n + 1:];
    z.mazo := z.mazo[:cardinality(z.mazo) - n];
  end if;
  update public.uno_mazos set mazo = z.mazo, pozo = z.pozo where juego_id = p_id;
  update public.uno_manos set cartas = cartas || nuevas where juego_id = p_id and usuario_id = p_quien;
  return nuevas;
end;
$$;
-- cuántas cartas tiene cada uno ({ usuario: n }) y cuántas quedan en el mazo
create or replace function public.uno_cuantas(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(usuario_id::text, cardinality(cartas)), '{}') from public.uno_manos where juego_id = p_id;
$$;
create or replace function public.uno_en_mazo(p_id uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(cardinality(mazo), 0) from public.uno_mazos where juego_id = p_id;
$$;

-- ========== JUGAR ==========
-- Retar: reparte 7 cartas a cada uno y da vuelta la primera del pozo (un número); empieza quien diga la suerte.
-- Una partida a la vez por pareja (si ya hay una, devuelve esa); las abandonadas (12 h sin movimiento) se cancelan
-- solas. Al otro le llega un aviso (ver avisar_uno).
create or replace function public.uno_crear(p_apuesta text default null) returns public.unos
language plpgsql security definer set search_path = public as $$
declare
  pj public.parejas;
  j public.unos;
  otro uuid;
  baraja text[];
  k int;
begin
  select * into pj from public.parejas
   where (usuario_a = auth.uid() or usuario_b = auth.uid()) and usuario_b is not null;
  if not found then return null; end if;
  perform pg_advisory_xact_lock(hashtext('nosotros:uno:' || pj.id));
  update public.unos set estado = 'cancelada', turno = null, robo = null, uno_pendiente = null, actualizado_en = now()
   where pareja_id = pj.id and estado = 'jugando' and actualizado_en < now() - interval '12 hours';
  select * into j from public.unos where pareja_id = pj.id and estado = 'jugando' order by creado_en desc limit 1;
  if found then return j; end if;
  otro := case when pj.usuario_a = auth.uid() then pj.usuario_b else pj.usuario_a end;
  select array_agg(c order by random()) into baraja from unnest(public.uno_mazo_nuevo()) c;
  -- la primera del pozo: la primera carta de número que salga (las demás siguen en el mazo)
  select min(i) into k from generate_subscripts(baraja, 1) i where baraja[i] ~ '^[ravz][0-9]$';
  insert into public.unos (pareja_id, creado_por, rival, turno, arriba, color, cartas, mazo, apuesta)
  values (pj.id, auth.uid(), otro, case when random() < 0.5 then auth.uid() else otro end, baraja[k], left(baraja[k], 1),
          jsonb_build_object(auth.uid()::text, 7, otro::text, 7), cardinality(baraja) - 15,
          nullif(left(btrim(coalesce(p_apuesta, '')), 120), ''))
  returning * into j;
  baraja := baraja[:k - 1] || baraja[k + 1:];
  insert into public.uno_manos (juego_id, usuario_id, cartas) values (j.id, auth.uid(), baraja[1:7]), (j.id, otro, baraja[8:14]);
  insert into public.uno_mazos (juego_id, mazo) values (j.id, baraja[15:]);
  return j;
end;
$$;

-- Jugar una carta (y el color, si es comodín): solo quien tiene el turno, una que tenga y que valga; después de
-- robar, solo la que robó. Salta, reversa, +2 y +4: vuelves a jugar (con +2 y +4 el otro roba). Si te quedas sin
-- cartas, ganas y te llevas los puntos de lo que le quedó al otro. Devuelve la partida y tu mano (o nada, si no valía).
create or replace function public.uno_jugar(p_id uuid, p_carta text, p_color text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  j public.unos;
  mano text[];
  robada text;
  otro uuid;
  i int;
  vuelve boolean;
  cuantas jsonb;
begin
  select * into j from public.unos where id = p_id and auth.uid() in (creado_por, rival) for update;
  if not found or j.estado <> 'jugando' or j.turno is distinct from auth.uid() then return null; end if;
  select m.cartas, m.robada into mano, robada from public.uno_manos m where m.juego_id = p_id and m.usuario_id = auth.uid();
  i := array_position(mano, p_carta);
  if i is null or (j.robo = auth.uid() and p_carta is distinct from robada) or not public.uno_vale(p_carta, j.arriba, j.color)
     or (p_carta in ('x', 'x4') and coalesce(p_color, '') not in ('r', 'a', 'v', 'z')) then
    return null;
  end if;
  otro := case when j.creado_por = auth.uid() then j.rival else j.creado_por end;
  mano := mano[:i - 1] || mano[i + 1:];
  update public.uno_manos set cartas = mano, robada = null where juego_id = p_id and usuario_id = auth.uid();
  update public.uno_mazos set pozo = pozo || j.arriba where juego_id = p_id;
  if p_carta = 'x4' then perform public.uno_sacar(p_id, otro, 4);
  elsif substr(p_carta, 2) = 'd' then perform public.uno_sacar(p_id, otro, 2);
  end if;
  vuelve := p_carta = 'x4' or substr(p_carta, 2) in ('s', 'r', 'd');
  insert into public.uno_jugadas (juego_id, usuario_id, tipo, carta, color)
  values (p_id, auth.uid(), 'juega', p_carta, case when p_carta in ('x', 'x4') then p_color end);
  cuantas := public.uno_cuantas(p_id);
  update public.unos set
    arriba = p_carta, color = case when p_carta in ('x', 'x4') then p_color else left(p_carta, 1) end,
    cartas = cuantas, mazo = public.uno_en_mazo(p_id), robo = null, jugadas = jugadas + 1, actualizado_en = now(),
    -- ¡UNO!: si te quedó una sin decirlo, te pueden pillar; si el otro estaba pillable, ya no (jugaste tú)
    uno_dicho = array(select x from unnest(uno_dicho) x where (cuantas ->> x::text)::int <= 2),
    uno_pendiente = case when cardinality(mano) = 1 and not (auth.uid() = any(uno_dicho)) then auth.uid() end,
    turno = case when cardinality(mano) = 0 then null when vuelve then auth.uid() else otro end,
    estado = case when cardinality(mano) = 0 then 'terminada' else estado end,
    ganador = case when cardinality(mano) = 0 then auth.uid() end,
    puntos = case when cardinality(mano) = 0 then public.uno_puntos(
               (select m.cartas from public.uno_manos m where m.juego_id = p_id and m.usuario_id = otro)) end
  where id = p_id returning * into j;
  return jsonb_build_object('juego', to_jsonb(j), 'mano', to_jsonb(mano));
end;
$$;

-- Robar una (solo quien tiene el turno, una vez). Si la que salió sirve, la puede jugar o pasar; si no, le toca al otro.
create or replace function public.uno_robar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  j public.unos;
  otro uuid;
  nuevas text[];
  sirve boolean;
  cuantas jsonb;
begin
  select * into j from public.unos where id = p_id and auth.uid() in (creado_por, rival) for update;
  if not found or j.estado <> 'jugando' or j.turno is distinct from auth.uid() or j.robo is not null then return null; end if;
  otro := case when j.creado_por = auth.uid() then j.rival else j.creado_por end;
  nuevas := public.uno_sacar(p_id, auth.uid(), 1);
  sirve := cardinality(nuevas) = 1 and public.uno_vale(nuevas[1], j.arriba, j.color);
  update public.uno_manos set robada = case when sirve then nuevas[1] end where juego_id = p_id and usuario_id = auth.uid();
  insert into public.uno_jugadas (juego_id, usuario_id, tipo, n) values (p_id, auth.uid(), 'roba', cardinality(nuevas));
  cuantas := public.uno_cuantas(p_id);
  update public.unos set
    robo = case when sirve then auth.uid() end, turno = case when sirve then auth.uid() else otro end,
    cartas = cuantas, mazo = public.uno_en_mazo(p_id), uno_pendiente = null, actualizado_en = now(),
    uno_dicho = array(select x from unnest(uno_dicho) x where (cuantas ->> x::text)::int <= 2)
  where id = p_id returning * into j;
  return jsonb_build_object('juego', to_jsonb(j), 'robada', nuevas[1],
    'mano', (select to_jsonb(m.cartas) from public.uno_manos m where m.juego_id = p_id and m.usuario_id = auth.uid()));
end;
$$;

-- Pasar: después de robar una que servía, quedársela (le toca al otro)
create or replace function public.uno_pasar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  j public.unos;
begin
  select * into j from public.unos where id = p_id and auth.uid() in (creado_por, rival) for update;
  if not found or j.estado <> 'jugando' or j.turno is distinct from auth.uid() or j.robo is distinct from auth.uid() then
    return null;
  end if;
  update public.uno_manos set robada = null where juego_id = p_id and usuario_id = auth.uid();
  insert into public.uno_jugadas (juego_id, usuario_id, tipo) values (p_id, auth.uid(), 'pasa');
  update public.unos set robo = null, turno = case when creado_por = auth.uid() then rival else creado_por end, actualizado_en = now()
   where id = p_id returning * into j;
  return jsonb_build_object('juego', to_jsonb(j),
    'mano', (select to_jsonb(m.cartas) from public.uno_manos m where m.juego_id = p_id and m.usuario_id = auth.uid()));
end;
$$;

-- ¡UNO!: con dos cartas o menos (antes de jugar la penúltima, o después, antes de que te pillen)
create or replace function public.uno_decir(p_id uuid) returns public.unos
language plpgsql security definer set search_path = public as $$
declare
  j public.unos;
begin
  select * into j from public.unos where id = p_id and auth.uid() in (creado_por, rival) for update;
  if not found or j.estado <> 'jugando' or (j.cartas ->> auth.uid()::text)::int > 2 or auth.uid() = any(j.uno_dicho) then
    return j;
  end if;
  insert into public.uno_jugadas (juego_id, usuario_id, tipo) values (p_id, auth.uid(), 'uno');
  update public.unos set uno_dicho = uno_dicho || auth.uid(), actualizado_en = now(),
         uno_pendiente = case when uno_pendiente = auth.uid() then null else uno_pendiente end
   where id = p_id returning * into j;
  return j;
end;
$$;

-- ¡Pillado!: si el otro quedó con una carta sin decir "¡UNO!" (y todavía no jugaste), roba dos
create or replace function public.uno_pillar(p_id uuid) returns public.unos
language plpgsql security definer set search_path = public as $$
declare
  j public.unos;
  cuantas jsonb;
begin
  select * into j from public.unos where id = p_id and auth.uid() in (creado_por, rival) for update;
  if not found or j.estado <> 'jugando' or j.uno_pendiente is null or j.uno_pendiente = auth.uid() then return null; end if;
  perform public.uno_sacar(p_id, j.uno_pendiente, 2);
  insert into public.uno_jugadas (juego_id, usuario_id, tipo, n) values (p_id, auth.uid(), 'pilla', 2);
  cuantas := public.uno_cuantas(p_id);
  update public.unos set cartas = cuantas, mazo = public.uno_en_mazo(p_id), uno_pendiente = null, actualizado_en = now(),
         uno_dicho = array(select x from unnest(uno_dicho) x where (cuantas ->> x::text)::int <= 2)
   where id = p_id returning * into j;
  return j;
end;
$$;

-- Rendirse (gana el otro) o, si todavía nadie jugó una carta, cancelar el reto
create or replace function public.uno_rendirse(p_id uuid) returns public.unos
language sql security definer set search_path = public as $$
  update public.unos set
    estado = case when jugadas > 0 then 'terminada' else 'cancelada' end,
    ganador = case when jugadas > 0 then (case when creado_por = auth.uid() then rival else creado_por end) end,
    rendido = (jugadas > 0), turno = null, robo = null, uno_pendiente = null, actualizado_en = now()
   where id = p_id and auth.uid() in (creado_por, rival) and estado = 'jugando'
  returning *;
$$;

-- Al terminar, lo que le quedó en la mano al otro
create or replace function public.uno_mano_rival(p_id uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select m.cartas from public.uno_manos m join public.unos u on u.id = m.juego_id
   where u.id = p_id and u.estado = 'terminada' and auth.uid() in (u.creado_por, u.rival) and m.usuario_id <> auth.uid();
$$;

-- ========== AVISOS ==========
-- Al que retaron le llega una push (la manda la función notificar, por el mismo camino que los demás avisos:
-- privado.llamar de avisos.sql; si avisos.sql no está, no pasa nada).
-- "¡Avisarle!": una push al otro para que vuelva a la mesa. Una por minuto como mucho. Devuelve si se mandó.
create or replace function public.uno_avisar(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  j public.unos;
begin
  select * into j from public.unos where id = p_id and auth.uid() in (creado_por, rival) and estado = 'jugando' for update;
  if not found or j.avisado_en > now() - interval '1 minute' then return false; end if;
  update public.unos set avisado_en = now() where id = p_id returning * into j;
  if to_regprocedure('privado.llamar(text, jsonb)') is not null then
    execute 'select privado.llamar($1, $2)' using 'notificar', jsonb_build_object(
      'type', 'AVISO', 'table', 'unos', 'schema', 'public', 'record', to_jsonb(j), 'de', auth.uid());
  end if;
  return true;
end;
$$;

create or replace function public.avisar_uno() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if to_regprocedure('privado.llamar(text, jsonb)') is not null then
    execute 'select privado.llamar($1, $2)' using 'notificar', jsonb_build_object(
      'type', 'INSERT', 'table', 'unos', 'schema', 'public', 'record', to_jsonb(new));
  end if;
  return new;
end;
$$;
drop trigger if exists unos_aviso on public.unos;
create trigger unos_aviso after insert on public.unos for each row execute function public.avisar_uno();

-- ========== PERMISOS ==========
revoke all on function public.uno_sacar(uuid, uuid, int) from public, anon, authenticated;
revoke all on function public.uno_cuantas(uuid) from public, anon, authenticated;
revoke all on function public.uno_en_mazo(uuid) from public, anon, authenticated;
revoke all on function public.uno_crear(text) from public, anon;
revoke all on function public.uno_jugar(uuid, text, text) from public, anon;
revoke all on function public.uno_robar(uuid) from public, anon;
revoke all on function public.uno_pasar(uuid) from public, anon;
revoke all on function public.uno_decir(uuid) from public, anon;
revoke all on function public.uno_pillar(uuid) from public, anon;
revoke all on function public.uno_rendirse(uuid) from public, anon;
revoke all on function public.uno_mano_rival(uuid) from public, anon;
revoke all on function public.uno_avisar(uuid) from public, anon;
grant execute on function public.uno_crear(text) to authenticated;
grant execute on function public.uno_jugar(uuid, text, text) to authenticated;
grant execute on function public.uno_robar(uuid) to authenticated;
grant execute on function public.uno_pasar(uuid) to authenticated;
grant execute on function public.uno_decir(uuid) to authenticated;
grant execute on function public.uno_pillar(uuid) to authenticated;
grant execute on function public.uno_rendirse(uuid) to authenticated;
grant execute on function public.uno_mano_rival(uuid) to authenticated;
grant execute on function public.uno_avisar(uuid) to authenticated;

-- ========== TIEMPO REAL ==========
-- (las manos y el mazo no: son secretos)
do $$
declare t text;
begin
  foreach t in array array['unos', 'uno_jugadas'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
