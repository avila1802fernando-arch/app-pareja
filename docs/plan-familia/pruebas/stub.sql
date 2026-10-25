-- Imitación mínima de Supabase para probar familia.sql en PGlite (NO es la base real)
create role anon nologin;
create role authenticated nologin;
create schema auth;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
alter default privileges in schema public grant all on tables to anon, authenticated;
create publication supabase_realtime;

-- Lo justo de Nosotros (mismas columnas y políticas que schema.sql)
create table public.perfiles (id uuid primary key references auth.users(id) on delete cascade, nombre text not null);
create table public.parejas (
  id uuid primary key default gen_random_uuid(),
  usuario_a uuid not null references auth.users(id) on delete cascade,
  usuario_b uuid references auth.users(id) on delete cascade,
  codigo text not null unique
);
create table public.partidas (
  id uuid primary key default gen_random_uuid(),
  pareja_id uuid not null references public.parejas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  juego text not null, puntos integer not null, detalle jsonb,
  creado_en timestamptz not null default now()
);
alter table public.perfiles enable row level security;
alter table public.parejas enable row level security;
alter table public.partidas enable row level security;
create function public.es_mi_pareja(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.parejas where id = p and (usuario_a = auth.uid() or usuario_b = auth.uid()));
$$;
create function public.es_pareja_de(u uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.parejas where (usuario_a = auth.uid() and usuario_b = u) or (usuario_b = auth.uid() and usuario_a = u));
$$;
create policy "perfil: leer" on public.perfiles for select using (id = auth.uid() or public.es_pareja_de(id));
create policy "pareja: leer la mía" on public.parejas for select using (usuario_a = auth.uid() or usuario_b = auth.uid());
create policy "partidas: leer" on public.partidas for select using (public.es_mi_pareja(pareja_id));
grant all on all tables in schema public to anon, authenticated;

-- Gente de prueba
insert into auth.users values
  ('00000000-0000-0000-0000-0000000000f1', 'fernando@nosotros.invalid', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'martina@nosotros.invalid', now()),
  ('00000000-0000-0000-0000-0000000000e1', 'eli@familia.invalid', now()),
  ('00000000-0000-0000-0000-0000000000b2', 'maritza@familia.invalid', now()),
  ('00000000-0000-0000-0000-0000000000c3', 'prueba@nosotros.invalid', now()),   -- cuenta suelta, sin pareja completa
  ('00000000-0000-0000-0000-0000000000d4', 'intruso@otro.com', now()),
  ('00000000-0000-0000-0000-0000000000e5', 'sinconfirmar@familia.invalid', null);
insert into public.perfiles values
  ('00000000-0000-0000-0000-0000000000f1', 'Tu amorcito'),   -- un apodo de Nosotros que NO debe salir en el Recreo
  ('00000000-0000-0000-0000-0000000000a2', 'Martina');
insert into public.parejas (id, usuario_a, usuario_b, codigo) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a2', 'A'),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-0000000000c3', null, 'B');
insert into public.partidas (pareja_id, usuario_id, juego, puntos, detalle, creado_en) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000f1', 'corazones', 2100, '{"secreto":"no"}', now() - interval '3 days'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000f1', 'corazones', 1500, null, now() - interval '1 hour'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000f1', 'memoria', 900, null, now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a2', 'corazones', 2340, null, now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a2', 'vuelo', 3200, null, now() - interval '5 hours'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a2', 'otro_juego', 99, null, now()),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-0000000000c3', 'corazones', 5000, null, now());
