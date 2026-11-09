-- Tu espacio 🌿 · un psicólogo personal con Claude, solo para quien esté en psico_permitidos (hoy, Fernando)
-- Sesiones individuales: lo que escribes aquí lo lees solo tú (y Claude, que contesta desde la función `psicologo`).
-- Tu pareja no ve nada: ni la tarjeta, ni las sesiones, ni que existen. Nada de esto escribe en `eventos`, así que no
-- hay avisos, ni campanita, ni notificaciones. El moderador de las sesiones de pareja (función `sesion`) no lee estas
-- tablas. public/psicologo.js es la otra mitad.
-- Pegar completo en Supabase → SQL Editor → Run (o con la CLI: npx supabase db query --remote=<ref> -f supabase/psicologo.sql).
-- Se puede volver a ejecutar: no borra datos.

-- ========== QUIÉN TIENE SU ESPACIO ==========
-- Una fila por cuenta con psicólogo. Cada uno ve solo su propia fila: tu pareja no puede saber quién está.
-- Solo se agrega desde aquí (SQL Editor): la app no puede escribir en esta tabla.
create table if not exists public.psico_permitidos (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now()
);

-- ========== LAS SESIONES ==========
-- Una sola abierta a la vez. Al terminar, Claude deja el resumen (y actualiza psico_perfil).
create table if not exists public.psico_sesiones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  numero integer not null,
  estado text not null default 'abierta' check (estado in ('abierta', 'resumiendo', 'cerrada')),
  pensando_desde timestamptz,          -- Claude está escribiendo (lo pone y lo quita la función `psicologo`)
  tema text,
  tarea text,                          -- lo que te propuso para la semana (si lo aceptaste)
  resumen jsonb,
  creado_en timestamptz not null default now(),
  cerrada_en timestamptz,
  unique (usuario_id, numero)
);
create index if not exists psico_sesiones_usuario_idx on public.psico_sesiones (usuario_id, numero desc);

create table if not exists public.psico_mensajes (
  id bigint generated always as identity primary key,
  sesion_id uuid not null references public.psico_sesiones(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  de_claude boolean not null default false,
  texto text not null check (char_length(texto) between 1 and 8000),
  creado_en timestamptz not null default now()
);
create index if not exists psico_mensajes_sesion_idx on public.psico_mensajes (sesion_id, id);
create index if not exists psico_mensajes_usuario_idx on public.psico_mensajes (usuario_id, creado_en desc);

-- ========== LO QUE CLAUDE VA ENTENDIENDO DE TI ==========
-- Su formulación del caso (quién eres, lo que te trae, tus patrones, lo que te ayuda…). La reescribe al cerrar cada
-- sesión y la lee al empezar la siguiente: así no empieza de cero. Tú la puedes leer en la app.
create table if not exists public.psico_perfil (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  formulacion jsonb not null,
  actualizado_en timestamptz not null default now()
);

-- ========== QUIÉN LEE ==========
-- Cada uno lee solo lo suyo. Nadie escribe directo: solo con las funciones de abajo (y Claude, con la función).
alter table public.psico_permitidos enable row level security;
alter table public.psico_sesiones   enable row level security;
alter table public.psico_mensajes   enable row level security;
alter table public.psico_perfil     enable row level security;
drop policy if exists "psico_permitidos: el mío" on public.psico_permitidos;
create policy "psico_permitidos: el mío" on public.psico_permitidos for select using (usuario_id = auth.uid());
drop policy if exists "psico_sesiones: las mías" on public.psico_sesiones;
create policy "psico_sesiones: las mías" on public.psico_sesiones for select using (usuario_id = auth.uid());
drop policy if exists "psico_mensajes: los míos" on public.psico_mensajes;
create policy "psico_mensajes: los míos" on public.psico_mensajes for select using (usuario_id = auth.uid());
drop policy if exists "psico_perfil: el mío" on public.psico_perfil;
create policy "psico_perfil: el mío" on public.psico_perfil for select using (usuario_id = auth.uid());
-- Permisos explícitos (sin depender de lo que el proyecto dé por defecto a las tablas nuevas)
revoke all on public.psico_permitidos, public.psico_sesiones, public.psico_mensajes, public.psico_perfil from anon, authenticated;
grant select on public.psico_permitidos, public.psico_sesiones, public.psico_mensajes, public.psico_perfil to authenticated;
grant all on public.psico_permitidos, public.psico_sesiones, public.psico_mensajes, public.psico_perfil to service_role;

-- ========== LO QUE HACE LA APP ==========
create or replace function public.psico_puedo() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.psico_permitidos where usuario_id = auth.uid());
$$;

-- Empezar: si ya hay una abierta, vuelves a esa
create or replace function public.psico_abrir() returns public.psico_sesiones
language plpgsql security definer set search_path = public as $$
declare
  yo uuid := auth.uid();
  s public.psico_sesiones;
begin
  if not public.psico_puedo() then return null; end if;
  perform pg_advisory_xact_lock(hashtext('nosotros:psico:' || yo));
  select * into s from public.psico_sesiones where usuario_id = yo and estado <> 'cerrada' order by creado_en desc limit 1;
  if found then return s; end if;
  insert into public.psico_sesiones (usuario_id, numero)
  values (yo, coalesce((select max(numero) from public.psico_sesiones where usuario_id = yo), 0) + 1)
  returning * into s;
  return s;
end;
$$;

create or replace function public.psico_escribir(p_sesion uuid, p_texto text) returns public.psico_mensajes
language plpgsql security definer set search_path = public as $$
declare
  s public.psico_sesiones;
  m public.psico_mensajes;
  t text := btrim(coalesce(p_texto, ''));
begin
  if t = '' or not public.psico_puedo() then return null; end if;
  select * into s from public.psico_sesiones where id = p_sesion and usuario_id = auth.uid();
  if not found or s.estado <> 'abierta' then return null; end if;
  insert into public.psico_mensajes (sesion_id, usuario_id, de_claude, texto)
  values (s.id, s.usuario_id, false, left(t, 6000))
  returning * into m;
  return m;
end;
$$;

-- Descartar una sesión abierta en la que todavía no escribiste nada
create or replace function public.psico_descartar(p_sesion uuid) returns boolean
language sql security definer set search_path = public as $$
  with b as (
    delete from public.psico_sesiones s
     where s.id = p_sesion and s.usuario_id = auth.uid() and s.estado = 'abierta'
       and not exists (select 1 from public.psico_mensajes m where m.sesion_id = s.id and not m.de_claude)
    returning 1)
  select exists (select 1 from b);
$$;

-- Borrar todo tu espacio (sesiones, mensajes y lo que Claude entendió de ti). No se puede deshacer.
create or replace function public.psico_borrar_todo() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then return 0; end if;
  delete from public.psico_sesiones where usuario_id = auth.uid();
  get diagnostics n = row_count;
  delete from public.psico_perfil where usuario_id = auth.uid();
  return n;
end;
$$;

revoke all on function public.psico_puedo() from public, anon;
revoke all on function public.psico_abrir() from public, anon;
revoke all on function public.psico_escribir(uuid, text) from public, anon;
revoke all on function public.psico_descartar(uuid) from public, anon;
revoke all on function public.psico_borrar_todo() from public, anon;
grant execute on function public.psico_puedo() to authenticated;
grant execute on function public.psico_abrir() to authenticated;
grant execute on function public.psico_escribir(uuid, text) to authenticated;
grant execute on function public.psico_descartar(uuid) to authenticated;
grant execute on function public.psico_borrar_todo() to authenticated;

-- ========== SOLO PARA LA FUNCIÓN `psicologo` (service role) ==========
-- Claude contesta de a una llamada por vez: la que toma el turno escribe "pensando" y lo suelta al terminar.
-- Un turno colgado (más de 2 minutos) se puede volver a tomar.
create or replace function public.psico_tomar_turno(p_sesion uuid) returns boolean
language sql security definer set search_path = public as $$
  with t as (
    update public.psico_sesiones set pensando_desde = now()
     where id = p_sesion and estado = 'abierta'
       and (pensando_desde is null or pensando_desde < now() - interval '2 minutes')
    returning 1)
  select exists (select 1 from t);
$$;
create or replace function public.psico_soltar_turno(p_sesion uuid) returns void
language sql security definer set search_path = public as $$
  update public.psico_sesiones set pensando_desde = null where id = p_sesion and estado = 'abierta';
$$;
-- Terminar: pasa a "resumiendo" (ya no se escribe) mientras Claude escribe el resumen. Un cierre colgado se reintenta.
create or replace function public.psico_empezar_cierre(p_sesion uuid) returns boolean
language sql security definer set search_path = public as $$
  with t as (
    update public.psico_sesiones set estado = 'resumiendo', pensando_desde = now()
     where id = p_sesion
       and (estado = 'abierta' or (estado = 'resumiendo' and pensando_desde < now() - interval '3 minutes'))
    returning 1)
  select exists (select 1 from t);
$$;
revoke all on function public.psico_tomar_turno(uuid) from public, anon, authenticated;
revoke all on function public.psico_soltar_turno(uuid) from public, anon, authenticated;
revoke all on function public.psico_empezar_cierre(uuid) from public, anon, authenticated;
grant execute on function public.psico_tomar_turno(uuid) to service_role;
grant execute on function public.psico_soltar_turno(uuid) to service_role;
grant execute on function public.psico_empezar_cierre(uuid) to service_role;

-- ========== FERNANDO ==========
-- (Las cuentas de Nosotros son usuario@nosotros.invalid.) Para dárselo a alguien más, otra línea igual con su usuario.
insert into public.psico_permitidos (usuario_id)
select id from auth.users where email = 'fernando@nosotros.invalid'
on conflict (usuario_id) do nothing;
