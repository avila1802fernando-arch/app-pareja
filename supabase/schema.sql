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
-- Desde cuándo están juntos (para el contador del Inicio). Se cambia con fijar_desde().
alter table public.parejas add column if not exists desde date;

create table if not exists public.eventos (
  id bigint generated always as identity primary key,
  pareja_id uuid not null references public.parejas(id) on delete cascade,
  de_usuario uuid not null references auth.users(id) on delete cascade,
  tipo text not null,
  creado_en timestamptz not null default now()
);
-- Tipos de señal permitidos (se redefine aquí para que las bases viejas tomen los nuevos)
alter table public.eventos drop constraint if exists eventos_tipo_check;
alter table public.eventos add constraint eventos_tipo_check
  check (tipo in (
    'entrada', 'te_extrano', 'libre',
    'abrazo', 'beso', 'pensando', 'buenos_dias', 'buenas_noches',
    'animo', 'respuesta', 'carta'
  ));
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

-- Ánimo: cómo se siente cada uno ahora (una fila por persona)
create table if not exists public.animos (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  estado text not null check (estado in ('feliz', 'amor', 'calma', 'sueno', 'extrano', 'triste', 'estres', 'malestar', 'celebrar')),
  nota text check (nota is null or char_length(nota) <= 80),
  actualizado_en timestamptz not null default now()
);

-- Pregunta del día: la respuesta de cada uno. La del otro solo se ve después de responder.
-- `pregunta` guarda el texto para que el historial no cambie si se editan las preguntas.
create table if not exists public.respuestas (
  pareja_id uuid not null references public.parejas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  pregunta text not null check (char_length(pregunta) <= 300),
  texto text not null check (char_length(texto) between 1 and 500),
  creado_en timestamptz not null default now(),
  primary key (usuario_id, dia)
);
create index if not exists respuestas_pareja_idx on public.respuestas (pareja_id, dia desc);

-- Cartas de uno para el otro. Con `abrir_en` quedan selladas: el texto no se entrega antes de esa fecha.
create table if not exists public.cartas (
  id uuid primary key default gen_random_uuid(),
  pareja_id uuid not null references public.parejas(id) on delete cascade,
  de_usuario uuid not null references auth.users(id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 4000),
  abrir_en timestamptz,            -- null = se puede leer ya
  leida_en timestamptz,
  avisada_en timestamptz,          -- cuándo `recordatorios` avisó que ya se podía abrir
  creado_en timestamptz not null default now()
);
create index if not exists cartas_pareja_idx on public.cartas (pareja_id, creado_en desc);

-- Lista compartida "Cuando nos veamos": cosas para hacer juntos
create table if not exists public.deseos (
  id uuid primary key default gen_random_uuid(),
  pareja_id uuid not null references public.parejas(id) on delete cascade,
  creado_por uuid not null references auth.users(id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 140),
  hecho_en timestamptz,
  creado_en timestamptz not null default now()
);
create index if not exists deseos_pareja_idx on public.deseos (pareja_id, creado_en);

-- Horarios habituales: una fila por hora marcada, guardada en UTC
-- (dia 0=domingo … 6=sábado, hora 0-23). Cada uno la ve en su zona horaria.
create table if not exists public.horarios (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  dia smallint not null check (dia between 0 and 6),
  hora smallint not null check (hora between 0 and 23),
  primary key (usuario_id, dia, hora)
);

-- Calendario compartido
create table if not exists public.eventos_cal (
  id uuid primary key default gen_random_uuid(),
  pareja_id uuid not null references public.parejas(id) on delete cascade,
  creado_por uuid not null references auth.users(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 80),
  tipo text not null default 'otro' check (tipo in ('llamada', 'cita', 'viaje', 'aniversario', 'otro')),
  inicio timestamptz not null,
  fin timestamptz,
  nota text check (nota is null or char_length(nota) <= 500),
  recordado_en timestamptz,            -- cuándo se envió el recordatorio (para no repetirlo)
  actualizado_por uuid references auth.users(id) on delete set null, -- quién hizo el último cambio (lo pone el trigger)
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (fin is null or fin >= inicio)
);
create index if not exists eventos_cal_pareja_idx on public.eventos_cal (pareja_id, inicio);

-- ========== SEGURIDAD (RLS) ==========
alter table public.perfiles       enable row level security;
alter table public.parejas        enable row level security;
alter table public.eventos        enable row level security;
alter table public.push_subs      enable row level security;
alter table public.disponibilidad enable row level security;
alter table public.animos         enable row level security;
alter table public.respuestas     enable row level security;
alter table public.cartas         enable row level security;
alter table public.deseos         enable row level security;
alter table public.horarios       enable row level security;
alter table public.eventos_cal    enable row level security;

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

-- ¿Ya respondí la pregunta de ese día? (sin pasar por RLS, para usarla dentro de la política)
create or replace function public.ya_respondi(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.respuestas where usuario_id = auth.uid() and dia = d);
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

-- animos: leo el mío y el de mi pareja; escribo solo el mío
drop policy if exists "animos: leer" on public.animos;
create policy "animos: leer" on public.animos
  for select using (usuario_id = auth.uid() or public.es_pareja_de(usuario_id));
drop policy if exists "animos: propio" on public.animos;
create policy "animos: propio" on public.animos
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- respuestas: la mía siempre; la de mi pareja solo los días que yo también respondí
drop policy if exists "respuestas: leer" on public.respuestas;
create policy "respuestas: leer" on public.respuestas
  for select using (usuario_id = auth.uid() or (public.es_mi_pareja(pareja_id) and public.ya_respondi(dia)));
drop policy if exists "respuestas: crear" on public.respuestas;
create policy "respuestas: crear" on public.respuestas
  for insert with check (usuario_id = auth.uid() and public.es_mi_pareja(pareja_id));
drop policy if exists "respuestas: editar la mía" on public.respuestas;
create policy "respuestas: editar la mía" on public.respuestas
  for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- cartas: veo las que escribí y las que me escribieron; las selladas, solo cuando llega su fecha.
-- No se editan (como una carta de verdad); quien la escribió puede borrarla. "Leída" va por marcar_leida().
drop policy if exists "cartas: leer" on public.cartas;
create policy "cartas: leer" on public.cartas
  for select using (de_usuario = auth.uid() or (public.es_mi_pareja(pareja_id) and (abrir_en is null or abrir_en <= now())));
drop policy if exists "cartas: escribir" on public.cartas;
create policy "cartas: escribir" on public.cartas
  for insert with check (de_usuario = auth.uid() and public.es_mi_pareja(pareja_id) and leida_en is null and avisada_en is null);
drop policy if exists "cartas: borrar las mías" on public.cartas;
create policy "cartas: borrar las mías" on public.cartas
  for delete using (de_usuario = auth.uid());

-- deseos: lista compartida, los dos agregan, marcan y quitan
drop policy if exists "deseos: leer" on public.deseos;
create policy "deseos: leer" on public.deseos
  for select using (public.es_mi_pareja(pareja_id));
drop policy if exists "deseos: agregar" on public.deseos;
create policy "deseos: agregar" on public.deseos
  for insert with check (creado_por = auth.uid() and public.es_mi_pareja(pareja_id));
drop policy if exists "deseos: marcar" on public.deseos;
create policy "deseos: marcar" on public.deseos
  for update using (public.es_mi_pareja(pareja_id)) with check (public.es_mi_pareja(pareja_id));
drop policy if exists "deseos: quitar" on public.deseos;
create policy "deseos: quitar" on public.deseos
  for delete using (public.es_mi_pareja(pareja_id));

-- horarios: leo el mío y el de mi pareja; escribo solo el mío
drop policy if exists "horarios: leer" on public.horarios;
create policy "horarios: leer" on public.horarios
  for select using (usuario_id = auth.uid() or public.es_pareja_de(usuario_id));
drop policy if exists "horarios: propios" on public.horarios;
create policy "horarios: propios" on public.horarios
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- eventos_cal: es compartido, los dos leen, crean, editan y borran los de su pareja
drop policy if exists "calendario: leer" on public.eventos_cal;
create policy "calendario: leer" on public.eventos_cal
  for select using (public.es_mi_pareja(pareja_id));
drop policy if exists "calendario: crear" on public.eventos_cal;
create policy "calendario: crear" on public.eventos_cal
  for insert with check (creado_por = auth.uid() and public.es_mi_pareja(pareja_id));
drop policy if exists "calendario: editar" on public.eventos_cal;
create policy "calendario: editar" on public.eventos_cal
  for update using (public.es_mi_pareja(pareja_id)) with check (public.es_mi_pareja(pareja_id));
drop policy if exists "calendario: borrar" on public.eventos_cal;
create policy "calendario: borrar" on public.eventos_cal
  for delete using (public.es_mi_pareja(pareja_id));

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

-- ========== DESDE CUÁNDO ESTAMOS JUNTOS ==========
-- Por función (y no con un permiso de UPDATE) para que solo se pueda tocar esta fecha.
create or replace function public.fijar_desde(p_fecha date)
returns public.parejas
language plpgsql security definer set search_path = public as $$
declare
  fila public.parejas;
begin
  if p_fecha is not null and (p_fecha > current_date + 1 or p_fecha < date '1950-01-01') then
    raise exception 'fecha no válida';
  end if;
  update public.parejas set desde = p_fecha
   where usuario_a = auth.uid() or usuario_b = auth.uid()
  returning * into fila;
  return fila;
end;
$$;
grant execute on function public.fijar_desde(date) to authenticated;

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

-- ========== SEÑALES QUE NACEN DE OTRAS TABLAS ==========
-- Igual que "estoy libre": cada una deja un evento y el webhook de `eventos` avisa al otro.
-- Busca la pareja completa de un usuario.
create or replace function public.pareja_de(u uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.parejas
   where usuario_b is not null and (usuario_a = u or usuario_b = u)
   limit 1;
$$;

-- Ánimo: avisa cuando cambia el estado o la nota
create or replace function public.registrar_animo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pid uuid := public.pareja_de(new.usuario_id);
begin
  if pid is not null and (tg_op = 'INSERT' or new.estado is distinct from old.estado or new.nota is distinct from old.nota) then
    insert into public.eventos (pareja_id, de_usuario, tipo) values (pid, new.usuario_id, 'animo');
  end if;
  return new;
end;
$$;
drop trigger if exists animos_aviso on public.animos;
create trigger animos_aviso
  after insert or update on public.animos
  for each row execute function public.registrar_animo();

-- Pregunta del día: avisa cuando alguien responde
create or replace function public.registrar_respuesta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.eventos (pareja_id, de_usuario, tipo) values (new.pareja_id, new.usuario_id, 'respuesta');
  return new;
end;
$$;
drop trigger if exists respuestas_aviso on public.respuestas;
create trigger respuestas_aviso
  after insert on public.respuestas
  for each row execute function public.registrar_respuesta();

-- ========== PREGUNTA DEL DÍA ==========
-- ¿Mi pareja ya respondió ese día? (sí/no, sin mostrar qué dijo)
create or replace function public.respondio_pareja(p_dia date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.respuestas r where r.dia = p_dia and public.es_pareja_de(r.usuario_id));
$$;

-- Racha: días seguidos en que respondieron los dos (si hoy aún falta alguien, cuenta hasta ayer)
create or replace function public.racha_preguntas(p_hoy date) returns integer
language plpgsql stable security definer set search_path = public as $$
declare
  pid uuid := public.pareja_de(auth.uid());
  d date := p_hoy;
  n integer := 0;
begin
  if pid is null then return 0; end if;
  if (select count(*) from public.respuestas where pareja_id = pid and dia = d) < 2 then d := d - 1; end if;
  while (select count(*) from public.respuestas where pareja_id = pid and dia = d) >= 2 loop
    n := n + 1; d := d - 1;
  end loop;
  return n;
end;
$$;
grant execute on function public.respondio_pareja(date) to authenticated;
grant execute on function public.racha_preguntas(date) to authenticated;

-- ========== CARTAS ==========
-- Avisa cuando llega una carta (si está sellada, la push dice hasta cuándo)
create or replace function public.registrar_carta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.eventos (pareja_id, de_usuario, tipo) values (new.pareja_id, new.de_usuario, 'carta');
  return new;
end;
$$;
drop trigger if exists cartas_aviso on public.cartas;
create trigger cartas_aviso
  after insert on public.cartas
  for each row execute function public.registrar_carta();

-- Cartas selladas que me escribieron: solo de quién y cuándo se abren (el texto sigue oculto)
create or replace function public.cartas_selladas()
returns table (id uuid, de_usuario uuid, abrir_en timestamptz, creado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.de_usuario, c.abrir_en, c.creado_en from public.cartas c
   where public.es_mi_pareja(c.pareja_id) and c.de_usuario <> auth.uid() and c.abrir_en > now()
   order by c.abrir_en;
$$;

-- Marcar como leída una carta que me escribieron (y que ya se puede abrir)
create or replace function public.marcar_leida(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.cartas set leida_en = now()
   where id = p_id and leida_en is null and de_usuario <> auth.uid()
     and public.es_mi_pareja(pareja_id) and (abrir_en is null or abrir_en <= now());
$$;
grant execute on function public.cartas_selladas() to authenticated;
grant execute on function public.marcar_leida(uuid) to authenticated;

-- ========== CALENDARIO: ÚLTIMO CAMBIO ==========
-- Guarda quién y cuándo cambió el evento (para avisar solo al otro) y,
-- si se movió la hora de inicio, vuelve a armar el recordatorio.
create or replace function public.eventos_cal_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := coalesce(auth.uid(), old.actualizado_por, new.creado_por);
  if new.inicio is distinct from old.inicio then new.recordado_en := null; end if;
  return new;
end;
$$;
drop trigger if exists eventos_cal_touch on public.eventos_cal;
create trigger eventos_cal_touch
  before update on public.eventos_cal
  for each row execute function public.eventos_cal_touch();

-- ========== TIEMPO REAL ==========
-- Agrega las tablas a la publicación solo si aún no están (para poder re-ejecutar).
do $$
declare t text;
begin
  foreach t in array array['perfiles', 'parejas', 'eventos', 'disponibilidad', 'animos', 'respuestas', 'cartas', 'deseos', 'horarios', 'eventos_cal'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
