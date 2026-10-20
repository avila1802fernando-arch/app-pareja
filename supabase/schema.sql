-- Nosotros · esquema de base de datos
-- Pegar completo en Supabase → SQL Editor → Run.
-- Se puede volver a ejecutar las veces que haga falta: no borra datos.

-- ========== TABLAS ==========
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 24),
  creado_en timestamptz not null default now()
);
-- Zona horaria de cada uno (IANA, p. ej. America/Guayaquil). La app la rellena sola.
alter table public.perfiles add column if not exists tz text;

create table if not exists public.parejas (
  id uuid primary key default gen_random_uuid(),
  usuario_a uuid not null references auth.users(id) on delete cascade,
  usuario_b uuid references auth.users(id) on delete cascade,
  codigo text not null unique,
  creado_en timestamptz not null default now(),
  check (usuario_a <> usuario_b)
);

create table if not exists public.eventos (
  id bigint generated always as identity primary key,
  pareja_id uuid not null references public.parejas(id) on delete cascade,
  de_usuario uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'te_extrano', 'libre')),
  creado_en timestamptz not null default now()
);
-- Bases creadas antes de 'libre': ampliar el tipo permitido
alter table public.eventos drop constraint if exists eventos_tipo_check;
alter table public.eventos add constraint eventos_tipo_check
  check (tipo in ('entrada', 'te_extrano', 'libre'));
create index if not exists eventos_pareja_idx on public.eventos (pareja_id, creado_en desc);

create table if not exists public.push_subs (
  endpoint text primary key,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  creado_en timestamptz not null default now()
);

-- Disponibilidad para llamar: una fila por persona
create table if not exists public.disponibilidad (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  libre boolean not null default false,
  hasta timestamptz,
  actualizado_en timestamptz not null default now()
);

-- ========== SEGURIDAD (RLS) ==========
alter table public.perfiles       enable row level security;
alter table public.parejas        enable row level security;
alter table public.eventos        enable row level security;
alter table public.push_subs      enable row level security;
alter table public.disponibilidad enable row level security;

-- ¿Este usuario pertenece a esta pareja?
create or replace function public.es_mi_pareja(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.parejas
    where id = p and (usuario_a = auth.uid() or usuario_b = auth.uid())
  );
$$;

-- ¿Este usuario es mi pareja?
create or replace function public.es_pareja_de(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.parejas
    where (usuario_a = auth.uid() and usuario_b = u)
       or (usuario_b = auth.uid() and usuario_a = u)
  );
$$;

-- perfiles: cada uno edita el suyo; puede leer el de su pareja
drop policy if exists "perfil propio: escribir" on public.perfiles;
create policy "perfil propio: escribir" on public.perfiles
  for all using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "perfil: leer el mío y el de mi pareja" on public.perfiles;
create policy "perfil: leer el mío y el de mi pareja" on public.perfiles
  for select using (id = auth.uid() or public.es_pareja_de(id));

-- parejas: leo la mía; creo una donde yo soy usuario_a
drop policy if exists "pareja: leer la mía" on public.parejas;
create policy "pareja: leer la mía" on public.parejas
  for select using (usuario_a = auth.uid() or usuario_b = auth.uid());
drop policy if exists "pareja: crear" on public.parejas;
create policy "pareja: crear" on public.parejas
  for insert with check (usuario_a = auth.uid() and usuario_b is null);

-- eventos: leo los de mi pareja; inserto solo los míos
drop policy if exists "eventos: leer" on public.eventos;
create policy "eventos: leer" on public.eventos
  for select using (public.es_mi_pareja(pareja_id));
drop policy if exists "eventos: insertar" on public.eventos;
create policy "eventos: insertar" on public.eventos
  for insert with check (de_usuario = auth.uid() and public.es_mi_pareja(pareja_id));

-- push_subs: solo las mías
drop policy if exists "push: propias" on public.push_subs;
create policy "push: propias" on public.push_subs
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- disponibilidad: leo la mía y la de mi pareja; escribo solo la mía
drop policy if exists "disponibilidad: leer" on public.disponibilidad;
create policy "disponibilidad: leer" on public.disponibilidad
  for select using (usuario_id = auth.uid() or public.es_pareja_de(usuario_id));
drop policy if exists "disponibilidad: propia" on public.disponibilidad;
create policy "disponibilidad: propia" on public.disponibilidad
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- ========== UNIRSE A UNA PAREJA CON CÓDIGO ==========
-- Se ejecuta con privilegios porque el usuario B aún no puede "ver" la pareja.
create or replace function public.unirse_pareja(p_codigo text)
returns public.parejas
language plpgsql security definer set search_path = public as $$
declare
  fila public.parejas;
begin
  -- ya tengo pareja: la devuelvo
  select * into fila from public.parejas
   where usuario_a = auth.uid() or usuario_b = auth.uid();
  if found then return fila; end if;

  update public.parejas
     set usuario_b = auth.uid()
   where codigo = upper(p_codigo)
     and usuario_b is null
     and usuario_a <> auth.uid()
  returning * into fila;
  if not found then return null; end if;
  return fila;
end;
$$;
grant execute on function public.unirse_pareja(text) to authenticated;

-- ========== "ESTOY LIBRE" → EVENTO ==========
-- Cuando alguien pasa a libre, queda registrado en `eventos` (tipo 'libre').
-- Así el webhook de `eventos` que ya existe le avisa al otro, sin configurar nada más.
create or replace function public.registrar_libre() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
begin
  -- solo al encenderse (o si lo anterior ya estaba vencido)
  if new.libre and (tg_op = 'INSERT' or not old.libre or old.hasta < now()) then
    select id into pid from public.parejas
     where usuario_b is not null
       and (usuario_a = new.usuario_id or usuario_b = new.usuario_id);
    if pid is not null then
      insert into public.eventos (pareja_id, de_usuario, tipo) values (pid, new.usuario_id, 'libre');
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists disponibilidad_libre on public.disponibilidad;
create trigger disponibilidad_libre
  after insert or update of libre, hasta on public.disponibilidad
  for each row execute function public.registrar_libre();

-- ========== TIEMPO REAL ==========
-- Agrega las tablas a la publicación solo si aún no están (para poder re-ejecutar).
do $$
declare t text;
begin
  foreach t in array array['perfiles', 'parejas', 'eventos', 'disponibilidad'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
