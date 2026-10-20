-- Nosotros · esquema de base de datos
-- Pegar completo en Supabase → SQL Editor → Run

-- ========== TABLAS ==========
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 24),
  creado_en timestamptz not null default now()
);

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
  tipo text not null check (tipo in ('entrada', 'te_extrano')),
  creado_en timestamptz not null default now()
);
create index if not exists eventos_pareja_idx on public.eventos (pareja_id, creado_en desc);

create table if not exists public.push_subs (
  endpoint text primary key,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  creado_en timestamptz not null default now()
);

-- ========== SEGURIDAD (RLS) ==========
alter table public.perfiles  enable row level security;
alter table public.parejas   enable row level security;
alter table public.eventos   enable row level security;
alter table public.push_subs enable row level security;

-- ¿Este usuario pertenece a esta pareja?
create or replace function public.es_mi_pareja(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.parejas
    where id = p and (usuario_a = auth.uid() or usuario_b = auth.uid())
  );
$$;

-- perfiles: cada uno edita el suyo; puede leer el de su pareja
create policy "perfil propio: escribir" on public.perfiles
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy "perfil: leer el mío y el de mi pareja" on public.perfiles
  for select using (
    id = auth.uid() or exists (
      select 1 from public.parejas
      where (usuario_a = auth.uid() and usuario_b = perfiles.id)
         or (usuario_b = auth.uid() and usuario_a = perfiles.id)
    )
  );

-- parejas: leo la mía; creo una donde yo soy usuario_a
create policy "pareja: leer la mía" on public.parejas
  for select using (usuario_a = auth.uid() or usuario_b = auth.uid());
create policy "pareja: crear" on public.parejas
  for insert with check (usuario_a = auth.uid() and usuario_b is null);

-- eventos: leo los de mi pareja; inserto solo los míos
create policy "eventos: leer" on public.eventos
  for select using (public.es_mi_pareja(pareja_id));
create policy "eventos: insertar" on public.eventos
  for insert with check (de_usuario = auth.uid() and public.es_mi_pareja(pareja_id));

-- push_subs: solo las mías
create policy "push: propias" on public.push_subs
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

-- ========== TIEMPO REAL ==========
alter publication supabase_realtime add table public.eventos;
alter publication supabase_realtime add table public.parejas;
