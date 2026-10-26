-- Nosotros · Batalla naval en vivo ⚓
-- Un juego para los dos, cada uno en su teléfono: cada uno acomoda su flota en secreto y se turnan para disparar
-- (si aciertas, vuelves a disparar). Las flotas son secretas de verdad: cada uno solo puede leer la suya y los
-- disparos los resuelve la base (batalla_disparar), que es la única que mira la flota del otro.
-- El tablero es de 10 × 10 y cada celda es fila * 10 + columna (0 = A1, 99 = J10). La flota: 5, 4, 3, 3 y 2.
-- public/juegos/batalla.js es la otra mitad (y batalla-motor.js tiene las mismas reglas para jugar contra la compu).
-- Pegar en Supabase → SQL Editor → Run, después de schema.sql y avisos.sql. Se puede volver a ejecutar: no borra datos.

-- ========== TABLAS ==========
create table if not exists public.batallas (
  id uuid primary key default gen_random_uuid(),
  pareja_id uuid not null references public.parejas(id) on delete cascade,
  creado_por uuid not null references auth.users(id) on delete cascade,     -- quien retó
  rival uuid not null references auth.users(id) on delete cascade,          -- quien recibió el reto
  estado text not null default 'colocando' check (estado in ('colocando', 'jugando', 'terminada', 'cancelada')),
  listos uuid[] not null default '{}',                                       -- quienes ya acomodaron su flota
  turno uuid references auth.users(id) on delete set null,                   -- quien dispara ahora
  ganador uuid references auth.users(id) on delete set null,
  rendido boolean not null default false,                                    -- ganó porque el otro se rindió
  apuesta text check (apuesta is null or char_length(apuesta) <= 120),       -- "Quien pierde…"
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  avisado_en timestamptz,                                                    -- el último "¡Avisarle!" (batalla_avisar)
  check (creado_por <> rival)
);
create index if not exists batallas_pareja_idx on public.batallas (pareja_id, creado_en desc);

-- La flota de cada uno, en orden: [[portaaviones (5)], [acorazado (4)], [crucero (3)], [submarino (3)], [lancha (2)]],
-- cada barco con sus celdas. Solo la lee su dueño.
create table if not exists public.batalla_flotas (
  batalla_id uuid not null references public.batallas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  barcos jsonb not null,
  primary key (batalla_id, usuario_id)
);

-- Cada disparo con su resultado. Si hundió un barco, `barco` trae sus celdas (para dibujarlo) y `barco_n` cuál
-- era (0 = portaaviones … 4 = lancha: así los dos le dicen igual, aunque haya dos barcos de 3).
create table if not exists public.batalla_disparos (
  id bigint generated always as identity primary key,
  batalla_id uuid not null references public.batallas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  celda smallint not null check (celda between 0 and 99),
  resultado text not null check (resultado in ('agua', 'tocado', 'hundido')),
  barco smallint[],
  barco_n smallint check (barco_n between 0 and 4),
  creado_en timestamptz not null default now(),
  unique (batalla_id, usuario_id, celda)
);
create index if not exists batalla_disparos_idx on public.batalla_disparos (batalla_id, id);

-- ========== SEGURIDAD (RLS) ==========
-- Se leen entre los dos, salvo las flotas (cada uno la suya). Nada se escribe directo: todo por las funciones.
alter table public.batallas enable row level security;
alter table public.batalla_flotas enable row level security;
alter table public.batalla_disparos enable row level security;

create or replace function public.es_mi_batalla(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.batallas x where x.id = b and public.es_mi_pareja(x.pareja_id));
$$;

drop policy if exists "batallas: leer" on public.batallas;
create policy "batallas: leer" on public.batallas for select using (public.es_mi_pareja(pareja_id));
drop policy if exists "flotas: solo la mía" on public.batalla_flotas;
create policy "flotas: solo la mía" on public.batalla_flotas for select using (usuario_id = auth.uid());
drop policy if exists "disparos: leer" on public.batalla_disparos;
create policy "disparos: leer" on public.batalla_disparos for select using (public.es_mi_batalla(batalla_id));

-- ========== LAS REGLAS ==========
-- ¿La flota está bien armada? 5 barcos de 5, 4, 3, 3 y 2 celdas, en ese orden, cada uno derecho (en una fila o una
-- columna), dentro del tablero y sin pisarse. (Se pueden tocar: igual que al acomodarlos a mano.)
create or replace function public.batalla_flota_valida(p jsonb) returns boolean
language plpgsql immutable as $$
declare
  barco jsonb;
  celdas int[];
  n int;
  tam int[] := '{}';
  todas int[] := '{}';
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> 5 then return false; end if;
  for barco in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(barco) <> 'array' then return false; end if;
    select array_agg(distinct x::int order by x::int) into celdas from jsonb_array_elements_text(barco) x;
    n := coalesce(array_length(celdas, 1), 0);
    if n <> jsonb_array_length(barco) or n < 2 or n > 5 then return false; end if;   -- sin celdas repetidas
    if celdas[1] < 0 or celdas[n] > 99 then return false; end if;
    -- en una fila: n celdas distintas entre la primera y la última, que están en la misma fila → seguidas
    -- en una columna: todas con la misma columna y de la primera a la última hay (n - 1) filas → seguidas
    if not ((celdas[1] / 10 = celdas[n] / 10 and celdas[n] - celdas[1] = n - 1)
            or ((select count(distinct x % 10) from unnest(celdas) x) = 1 and celdas[n] - celdas[1] = (n - 1) * 10))
    then return false; end if;
    tam := tam || n;
    todas := todas || celdas;
  end loop;
  if tam <> array[5, 4, 3, 3, 2] then return false; end if;                                 -- en orden
  return (select count(distinct x) from unnest(todas) x) = 17;                             -- sin pisarse
exception when others then
  return false; -- algo que no era un número, etc.
end;
$$;

-- Retar: una sola batalla a la vez por pareja (si ya hay una, devuelve esa). Las que quedaron abandonadas
-- (12 h sin movimiento) se cancelan solas. Al otro le llega un aviso (ver avisar_batalla).
create or replace function public.batalla_crear(p_apuesta text default null) returns public.batallas
language plpgsql security definer set search_path = public as $$
declare
  pj public.parejas;
  b public.batallas;
begin
  select * into pj from public.parejas
   where (usuario_a = auth.uid() or usuario_b = auth.uid()) and usuario_b is not null;
  if not found then return null; end if;
  perform pg_advisory_xact_lock(hashtext('nosotros:batalla:' || pj.id));
  update public.batallas set estado = 'cancelada', turno = null, actualizado_en = now()
   where pareja_id = pj.id and estado in ('colocando', 'jugando') and actualizado_en < now() - interval '12 hours';
  select * into b from public.batallas
   where pareja_id = pj.id and estado in ('colocando', 'jugando') order by creado_en desc limit 1;
  if found then return b; end if;
  insert into public.batallas (pareja_id, creado_por, rival, apuesta)
  values (pj.id, auth.uid(), case when pj.usuario_a = auth.uid() then pj.usuario_b else pj.usuario_a end,
          nullif(left(btrim(coalesce(p_apuesta, '')), 120), ''))
  returning * into b;
  return b;
end;
$$;

-- Acomodar mi flota (se puede cambiar hasta que el otro también esté listo). Con los dos listos empieza
-- la batalla y la suerte decide quién dispara primero.
create or replace function public.batalla_colocar(p_id uuid, p_barcos jsonb) returns public.batallas
language plpgsql security definer set search_path = public as $$
declare
  b public.batallas;
begin
  select * into b from public.batallas where id = p_id and auth.uid() in (creado_por, rival) for update;
  if not found or b.estado <> 'colocando' then return b; end if;
  if not public.batalla_flota_valida(p_barcos) then raise exception 'flota no válida'; end if;
  insert into public.batalla_flotas (batalla_id, usuario_id, barcos) values (p_id, auth.uid(), p_barcos)
  on conflict (batalla_id, usuario_id) do update set barcos = excluded.barcos;
  update public.batallas
     set listos = case when auth.uid() = any(listos) then listos else listos || auth.uid() end, actualizado_en = now()
   where id = p_id returning * into b;
  if cardinality(b.listos) >= 2 then
    update public.batallas
       set estado = 'jugando', turno = case when random() < 0.5 then creado_por else rival end, actualizado_en = now()
     where id = p_id returning * into b;
  end if;
  return b;
end;
$$;

-- Disparar: solo quien tiene el turno, una vez por celda. Agua → le toca al otro; tocado o hundido → sigue
-- disparando. Con los 17 aciertos se gana. Devuelve el disparo (o nada, si no correspondía).
create or replace function public.batalla_disparar(p_id uuid, p_celda int) returns public.batalla_disparos
language plpgsql security definer set search_path = public as $$
declare
  b public.batallas;
  otro uuid;
  flota jsonb;
  barco jsonb;
  celdas int[];
  mios int[];
  res text := 'agua';
  cual int;
  hundido smallint[];
  hundido_n smallint;
  d public.batalla_disparos;
  aciertos int;
begin
  select * into b from public.batallas where id = p_id and auth.uid() in (creado_por, rival) for update;
  if not found or b.estado <> 'jugando' or b.turno is distinct from auth.uid() or p_celda not between 0 and 99 then
    return null;
  end if;
  if exists (select 1 from public.batalla_disparos where batalla_id = p_id and usuario_id = auth.uid() and celda = p_celda) then
    return null;
  end if;
  otro := case when b.creado_por = auth.uid() then b.rival else b.creado_por end;
  select barcos into flota from public.batalla_flotas where batalla_id = p_id and usuario_id = otro;
  select coalesce(array_agg(celda::int), '{}') || p_celda into mios
    from public.batalla_disparos where batalla_id = p_id and usuario_id = auth.uid();
  for barco, cual in select e.valor, e.n - 1 from jsonb_array_elements(flota) with ordinality e(valor, n) loop
    select array_agg(x::int) into celdas from jsonb_array_elements_text(barco) x;
    if p_celda = any(celdas) then
      if celdas <@ mios then res := 'hundido'; hundido := celdas::smallint[]; hundido_n := cual; else res := 'tocado'; end if;
      exit;
    end if;
  end loop;
  insert into public.batalla_disparos (batalla_id, usuario_id, celda, resultado, barco, barco_n)
  values (p_id, auth.uid(), p_celda, res, hundido, hundido_n) returning * into d;
  select count(*) into aciertos from public.batalla_disparos
   where batalla_id = p_id and usuario_id = auth.uid() and resultado <> 'agua';
  if aciertos >= 17 then
    update public.batallas set estado = 'terminada', ganador = auth.uid(), turno = null, actualizado_en = now() where id = p_id;
  elsif res = 'agua' then
    update public.batallas set turno = otro, actualizado_en = now() where id = p_id;
  else
    update public.batallas set actualizado_en = now() where id = p_id;
  end if;
  return d;
end;
$$;

-- Rendirse (en plena batalla gana el otro) o cancelar el reto (si todavía están acomodando las flotas)
create or replace function public.batalla_rendirse(p_id uuid) returns public.batallas
language sql security definer set search_path = public as $$
  update public.batallas set
    estado = case when estado = 'jugando' then 'terminada' else 'cancelada' end,
    ganador = case when estado = 'jugando' then (case when creado_por = auth.uid() then rival else creado_por end) end,
    rendido = (estado = 'jugando'), turno = null, actualizado_en = now()
   where id = p_id and auth.uid() in (creado_por, rival) and estado in ('colocando', 'jugando')
  returning *;
$$;

-- Al terminar, cada uno puede ver dónde estaban los barcos del otro
create or replace function public.batalla_flota_rival(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select f.barcos from public.batalla_flotas f join public.batallas b on b.id = f.batalla_id
   where b.id = p_id and b.estado = 'terminada' and auth.uid() in (b.creado_por, b.rival) and f.usuario_id <> auth.uid();
$$;

-- ========== AVISOS ==========
-- Al que recibe el reto le llega una push, y también a quien acomodó primero cuando el otro termina y empieza
-- la batalla (puede haber salido de la app mientras esperaba). La manda la función notificar, por el mismo
-- camino que los demás avisos (privado.llamar de avisos.sql); si avisos.sql no está, no pasa nada.

-- "¡Avisarle!": una push al otro para que vuelva a la batalla (le toca disparar o lo están esperando).
-- Una por minuto como mucho. Devuelve si se mandó.
create or replace function public.batalla_avisar(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  b public.batallas;
begin
  select * into b from public.batallas
   where id = p_id and auth.uid() in (creado_por, rival) and estado in ('colocando', 'jugando') for update;
  if not found or b.avisado_en > now() - interval '1 minute' then return false; end if;
  update public.batallas set avisado_en = now() where id = p_id returning * into b;
  if to_regprocedure('privado.llamar(text, jsonb)') is not null then
    execute 'select privado.llamar($1, $2)' using 'notificar', jsonb_build_object(
      'type', 'AVISO', 'table', 'batallas', 'schema', 'public', 'record', to_jsonb(b), 'de', auth.uid());
  end if;
  return true;
end;
$$;

revoke all on function public.batalla_crear(text) from public, anon;
revoke all on function public.batalla_colocar(uuid, jsonb) from public, anon;
revoke all on function public.batalla_disparar(uuid, int) from public, anon;
revoke all on function public.batalla_rendirse(uuid) from public, anon;
revoke all on function public.batalla_flota_rival(uuid) from public, anon;
revoke all on function public.batalla_avisar(uuid) from public, anon;
grant execute on function public.batalla_crear(text) to authenticated;
grant execute on function public.batalla_colocar(uuid, jsonb) to authenticated;
grant execute on function public.batalla_disparar(uuid, int) to authenticated;
grant execute on function public.batalla_rendirse(uuid) to authenticated;
grant execute on function public.batalla_flota_rival(uuid) to authenticated;
grant execute on function public.batalla_avisar(uuid) to authenticated;

-- El reto y el comienzo de la batalla avisan solos (el "¡Avisarle!" de arriba lo pide uno a mano)
create or replace function public.avisar_batalla() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' or (old.estado = 'colocando' and new.estado = 'jugando'))
     and to_regprocedure('privado.llamar(text, jsonb)') is not null then
    execute 'select privado.llamar($1, $2)' using 'notificar', jsonb_build_object(
      'type', tg_op, 'table', 'batallas', 'schema', 'public',
      'record', to_jsonb(new), 'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) end);
  end if;
  return new;
end;
$$;
drop trigger if exists batallas_aviso on public.batallas;
create trigger batallas_aviso after insert or update on public.batallas
  for each row execute function public.avisar_batalla();

-- ========== TIEMPO REAL ==========
-- (las flotas no: son secretas)
do $$
declare t text;
begin
  foreach t in array array['batallas', 'batalla_disparos'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
