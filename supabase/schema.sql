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
-- Foto de perfil: ruta dentro del bucket privado `fotos` (ver más abajo)
alter table public.perfiles add column if not exists foto text;
-- Ubicación aproximada (redondeada a ~10 km) solo para mostrar "nos separan N km"
alter table public.perfiles add column if not exists lat double precision;
alter table public.perfiles add column if not exists lon double precision;

create table if not exists public.parejas (
  id uuid primary key default gen_random_uuid(),
  usuario_a uuid not null references auth.users(id) on delete cascade,
  usuario_b uuid references auth.users(id) on delete cascade,
  codigo text not null unique,
  creado_en timestamptz not null default now(),
  check (usuario_a <> usuario_b)
);
-- Fechas de la pareja: `desde` = novios desde, `conocidos` = el día que se conocieron.
-- Sus días del mes son especiales (aviso mensual). Se cambian con fijar_fechas().
alter table public.parejas add column if not exists desde date;
alter table public.parejas add column if not exists conocidos date;

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
    'animo', 'respuesta', 'carta',
    'momento', 'riego', 'vale', 'canje', 'razon',
    'latido', 'notita', 'cancion',
    'a_dormir', 'despierto',
    'record', 'reto'
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

-- parejas: leo la mía. Ya no se crean desde la app: las arma entrar_pareja() (ver más abajo)
drop policy if exists "pareja: leer la mía" on public.parejas;
create policy "pareja: leer la mía" on public.parejas
  for select using (usuario_a = auth.uid() or usuario_b = auth.uid());
drop policy if exists "pareja: crear" on public.parejas;

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

-- ========== ENTRAR A LA PAREJA, SIN CÓDIGOS ==========
-- La app es solo para dos, así que la pareja se arma sola: el primero que entra la crea y el
-- segundo queda unido apenas entra. Solo cuentan las cuentas internas (usuario@nosotros.invalid):
-- esas las crea únicamente la función `cuenta`, con su lista USUARIOS_PERMITIDOS y su tope.
-- (unirse_pareja queda para las versiones viejas de la app que alguien tenga abiertas.)
create or replace function public.entrar_pareja(p_desde date default null, p_conocidos date default null)
returns public.parejas
language plpgsql security definer set search_path = public as $$
declare
  fila public.parejas;
begin
  if not exists (select 1 from auth.users
                  where id = auth.uid() and email like '%@nosotros.invalid' and email_confirmed_at is not null) then
    return null;
  end if;
  -- de a uno: si los dos entran por primera vez al mismo tiempo, igual queda una sola pareja
  perform pg_advisory_xact_lock(hashtext('nosotros:entrar_pareja'));

  -- ya tengo pareja: la devuelvo
  select * into fila from public.parejas
   where usuario_a = auth.uid() or usuario_b = auth.uid()
   order by creado_en limit 1;
  if found then return fila; end if;

  -- la otra persona ya entró y me está esperando: me uno a su pareja
  update public.parejas set usuario_b = auth.uid()
   where id = (select x.id from public.parejas x join auth.users u on u.id = x.usuario_a
                where x.usuario_b is null and x.usuario_a <> auth.uid() and u.email like '%@nosotros.invalid'
                order by x.creado_en limit 1)
  returning * into fila;
  if found then return fila; end if;

  -- soy la primera persona: creo la pareja (la columna `codigo` ya no se usa, pero es obligatoria)
  insert into public.parejas (usuario_a, codigo, desde, conocidos)
  values (auth.uid(), upper(substr(md5(gen_random_uuid()::text), 1, 8)),
          case when p_desde between date '1950-01-01' and current_date + 1 then p_desde end,
          case when p_conocidos between date '1950-01-01' and current_date + 1 then p_conocidos end)
  returning * into fila;
  return fila;
end;
$$;
grant execute on function public.entrar_pareja(date, date) to authenticated;

-- ========== FECHAS DE LA PAREJA ==========
-- Por función (y no con un permiso de UPDATE) para que solo se puedan tocar estas fechas.
create or replace function public.fijar_fechas(p_conocidos date, p_desde date)
returns public.parejas
language plpgsql security definer set search_path = public as $$
declare
  fila public.parejas;
begin
  if (p_conocidos is not null and (p_conocidos > current_date + 1 or p_conocidos < date '1950-01-01'))
     or (p_desde is not null and (p_desde > current_date + 1 or p_desde < date '1950-01-01')) then
    raise exception 'fecha no válida';
  end if;
  update public.parejas set conocidos = p_conocidos, desde = p_desde
   where usuario_a = auth.uid() or usuario_b = auth.uid()
  returning * into fila;
  return fila;
end;
$$;
grant execute on function public.fijar_fechas(date, date) to authenticated;

-- Versión anterior (solo "desde"), por si algún teléfono tiene la app vieja abierta
create or replace function public.fijar_desde(p_fecha date)
returns public.parejas
language sql security definer set search_path = public as $$
  update public.parejas set desde = p_fecha
   where (usuario_a = auth.uid() or usuario_b = auth.uid())
     and (p_fecha is null or p_fecha between date '1950-01-01' and current_date + 1)
  returning *;
$$;
grant execute on function public.fijar_desde(date) to authenticated;

-- Avisos de días especiales ya enviados (para mandar uno solo por persona y día).
-- Solo la usa la función `recordatorios` (service role): RLS sin políticas = nadie más la ve.
create table if not exists public.avisos_dia (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  clave text not null,
  dia date not null,
  primary key (usuario_id, clave, dia)
);
alter table public.avisos_dia enable row level security;

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

-- ========== MOMENTOS, GIRASOL, VALES Y FRASCO ==========
-- Momentos: una foto del día con un texto corto (la foto vive en el bucket `fotos`)
create table if not exists public.momentos (
  id uuid primary key default gen_random_uuid(),
  pareja_id uuid not null references public.parejas(id) on delete cascade,
  de_usuario uuid not null references auth.users(id) on delete cascade,
  ruta text not null,
  texto text check (texto is null or char_length(texto) <= 140),
  creado_en timestamptz not null default now()
);
create index if not exists momentos_pareja_idx on public.momentos (pareja_id, creado_en desc);

-- Nuestro girasol: cada uno lo riega una vez por día; crece con los días que lo riegan los dos
create table if not exists public.riegos (
  pareja_id uuid not null references public.parejas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  creado_en timestamptz not null default now(),
  primary key (usuario_id, dia)
);
create index if not exists riegos_pareja_idx on public.riegos (pareja_id, dia);

-- Vales de amor: uno se lo regala al otro, que lo canjea (por ejemplo, en Talca)
create table if not exists public.vales (
  id uuid primary key default gen_random_uuid(),
  pareja_id uuid not null references public.parejas(id) on delete cascade,
  de_usuario uuid not null references auth.users(id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 100),
  emoji text not null default '🎟️' check (char_length(emoji) <= 8),
  canjeado_en timestamptz,
  creado_en timestamptz not null default now()
);
create index if not exists vales_pareja_idx on public.vales (pareja_id, creado_en desc);

-- Frasco de razones: "te quiero porque…". Las que todavía no saca el otro, el otro no las puede leer.
create table if not exists public.razones (
  id uuid primary key default gen_random_uuid(),
  pareja_id uuid not null references public.parejas(id) on delete cascade,
  de_usuario uuid not null references auth.users(id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 200),
  sacada_en timestamptz,
  creado_en timestamptz not null default now()
);
create index if not exists razones_pareja_idx on public.razones (pareja_id, creado_en desc);

alter table public.momentos enable row level security;
alter table public.riegos   enable row level security;
alter table public.vales    enable row level security;
alter table public.razones  enable row level security;

drop policy if exists "momentos: leer" on public.momentos;
create policy "momentos: leer" on public.momentos for select using (public.es_mi_pareja(pareja_id));
drop policy if exists "momentos: compartir" on public.momentos;
create policy "momentos: compartir" on public.momentos
  for insert with check (de_usuario = auth.uid() and public.es_mi_pareja(pareja_id));
drop policy if exists "momentos: borrar los míos" on public.momentos;
create policy "momentos: borrar los míos" on public.momentos for delete using (de_usuario = auth.uid());

drop policy if exists "riegos: leer" on public.riegos;
create policy "riegos: leer" on public.riegos for select using (public.es_mi_pareja(pareja_id));
drop policy if exists "riegos: regar" on public.riegos;
create policy "riegos: regar" on public.riegos
  for insert with check (usuario_id = auth.uid() and public.es_mi_pareja(pareja_id));

drop policy if exists "vales: leer" on public.vales;
create policy "vales: leer" on public.vales for select using (public.es_mi_pareja(pareja_id));
drop policy if exists "vales: regalar" on public.vales;
create policy "vales: regalar" on public.vales
  for insert with check (de_usuario = auth.uid() and public.es_mi_pareja(pareja_id) and canjeado_en is null);
drop policy if exists "vales: borrar los míos sin canjear" on public.vales;
create policy "vales: borrar los míos sin canjear" on public.vales
  for delete using (de_usuario = auth.uid() and canjeado_en is null);

drop policy if exists "razones: leer" on public.razones;
create policy "razones: leer" on public.razones
  for select using (de_usuario = auth.uid() or (public.es_mi_pareja(pareja_id) and sacada_en is not null));
drop policy if exists "razones: escribir" on public.razones;
create policy "razones: escribir" on public.razones
  for insert with check (de_usuario = auth.uid() and public.es_mi_pareja(pareja_id) and sacada_en is null);
drop policy if exists "razones: borrar las mías" on public.razones;
create policy "razones: borrar las mías" on public.razones for delete using (de_usuario = auth.uid());

-- Canjear un vale que me regalaron
create or replace function public.canjear_vale(p_id uuid) returns public.vales
language sql security definer set search_path = public as $$
  update public.vales set canjeado_en = now()
   where id = p_id and canjeado_en is null and de_usuario <> auth.uid() and public.es_mi_pareja(pareja_id)
  returning *;
$$;
-- Cuántas razones me esperan en el frasco (sin mostrarlas)
create or replace function public.razones_en_frasco() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.razones r
   where public.es_mi_pareja(r.pareja_id) and r.de_usuario <> auth.uid() and r.sacada_en is null;
$$;
-- Sacar una razón al azar del frasco
create or replace function public.sacar_razon() returns public.razones
language sql security definer set search_path = public as $$
  update public.razones set sacada_en = now()
   where id = (select r.id from public.razones r
                where public.es_mi_pareja(r.pareja_id) and r.de_usuario <> auth.uid() and r.sacada_en is null
                order by random() limit 1)
  returning *;
$$;
grant execute on function public.canjear_vale(uuid) to authenticated;
grant execute on function public.razones_en_frasco() to authenticated;
grant execute on function public.sacar_razon() to authenticated;

-- Avisos: momento, riego y vale dejan un evento (el webhook de `eventos` avisa al otro)
create or replace function public.evento_desde_tabla() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  fila jsonb := to_jsonb(new);
begin
  insert into public.eventos (pareja_id, de_usuario, tipo)
  values ((fila->>'pareja_id')::uuid, coalesce(fila->>'de_usuario', fila->>'usuario_id')::uuid, tg_argv[0]);
  return new;
end;
$$;
drop trigger if exists momentos_aviso on public.momentos;
create trigger momentos_aviso after insert on public.momentos
  for each row execute function public.evento_desde_tabla('momento');
drop trigger if exists riegos_aviso on public.riegos;
create trigger riegos_aviso after insert on public.riegos
  for each row execute function public.evento_desde_tabla('riego');
drop trigger if exists vales_aviso on public.vales;
create trigger vales_aviso after insert on public.vales
  for each row execute function public.evento_desde_tabla('vale');
drop trigger if exists razones_aviso on public.razones;
create trigger razones_aviso after insert on public.razones
  for each row execute function public.evento_desde_tabla('razon');
-- Al canjear un vale se avisa a quien lo regaló
create or replace function public.registrar_canje() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.canjeado_en is null and new.canjeado_en is not null then
    insert into public.eventos (pareja_id, de_usuario, tipo)
    values (new.pareja_id, coalesce(auth.uid(), new.de_usuario), 'canje');
  end if;
  return new;
end;
$$;
drop trigger if exists vales_canje on public.vales;
create trigger vales_canje after update on public.vales
  for each row execute function public.registrar_canje();

-- ========== NOTITAS Y CANCIONES ==========
-- Notita en la nevera: un post-it corto que queda en el Inicio del otro hasta que lo "despega"
create table if not exists public.notitas (
  id uuid primary key default gen_random_uuid(),
  pareja_id uuid not null references public.parejas(id) on delete cascade,
  de_usuario uuid not null references auth.users(id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 120),
  color text not null default 'amarillo' check (color in ('amarillo', 'rosa', 'celeste', 'lila')),
  despegada_en timestamptz,
  creado_en timestamptz not null default now()
);
create index if not exists notitas_pareja_idx on public.notitas (pareja_id, creado_en desc);

-- Una canción para ti: un enlace (YouTube, Spotify…) con una dedicatoria
create table if not exists public.canciones (
  id uuid primary key default gen_random_uuid(),
  pareja_id uuid not null references public.parejas(id) on delete cascade,
  de_usuario uuid not null references auth.users(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 120),
  url text check (url is null or (char_length(url) <= 400 and url ~* '^https?://')),
  nota text check (nota is null or char_length(nota) <= 140),
  creado_en timestamptz not null default now()
);
create index if not exists canciones_pareja_idx on public.canciones (pareja_id, creado_en desc);

alter table public.notitas   enable row level security;
alter table public.canciones enable row level security;

drop policy if exists "notitas: leer" on public.notitas;
create policy "notitas: leer" on public.notitas for select using (public.es_mi_pareja(pareja_id));
drop policy if exists "notitas: dejar" on public.notitas;
create policy "notitas: dejar" on public.notitas
  for insert with check (de_usuario = auth.uid() and public.es_mi_pareja(pareja_id) and despegada_en is null);
drop policy if exists "notitas: borrar las mías" on public.notitas;
create policy "notitas: borrar las mías" on public.notitas for delete using (de_usuario = auth.uid());

drop policy if exists "canciones: leer" on public.canciones;
create policy "canciones: leer" on public.canciones for select using (public.es_mi_pareja(pareja_id));
drop policy if exists "canciones: dedicar" on public.canciones;
create policy "canciones: dedicar" on public.canciones
  for insert with check (de_usuario = auth.uid() and public.es_mi_pareja(pareja_id));
drop policy if exists "canciones: borrar las mías" on public.canciones;
create policy "canciones: borrar las mías" on public.canciones for delete using (de_usuario = auth.uid());

-- Despegar (guardar) una notita que me dejaron
create or replace function public.despegar_notita(p_id uuid) returns public.notitas
language sql security definer set search_path = public as $$
  update public.notitas set despegada_en = now()
   where id = p_id and despegada_en is null and de_usuario <> auth.uid() and public.es_mi_pareja(pareja_id)
  returning *;
$$;
grant execute on function public.despegar_notita(uuid) to authenticated;

drop trigger if exists notitas_aviso on public.notitas;
create trigger notitas_aviso after insert on public.notitas
  for each row execute function public.evento_desde_tabla('notita');
drop trigger if exists canciones_aviso on public.canciones;
create trigger canciones_aviso after insert on public.canciones
  for each row execute function public.evento_desde_tabla('cancion');

-- ========== DORMIR JUNTOS ==========
-- Una fila por noche y persona: "Me voy a dormir" la abre y "Buenos días" la cierra (con lo que soñó, si quiere).
-- Si los dos tienen su noche abierta a la vez, están durmiendo juntos.
create table if not exists public.noches (
  id uuid primary key default gen_random_uuid(),
  pareja_id uuid not null references public.parejas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  inicio timestamptz not null default now(),
  fin timestamptz,
  sueno text check (sueno is null or char_length(sueno) <= 280),
  check (fin is null or fin >= inicio)
);
create index if not exists noches_pareja_idx on public.noches (pareja_id, inicio desc);
alter table public.noches enable row level security;
-- Se lee entre los dos; se escribe solo con acostarme() y despertar()
drop policy if exists "noches: leer" on public.noches;
create policy "noches: leer" on public.noches for select using (public.es_mi_pareja(pareja_id));

-- Me voy a dormir: si ya tengo una noche abierta (de las últimas 14 h) devuelve esa
create or replace function public.acostarme() returns public.noches
language plpgsql security definer set search_path = public as $$
declare
  p uuid;
  n public.noches;
begin
  select id into p from public.parejas
   where (usuario_a = auth.uid() or usuario_b = auth.uid()) and usuario_b is not null;
  if p is null then return null; end if;
  select * into n from public.noches
   where usuario_id = auth.uid() and fin is null and inicio > now() - interval '14 hours'
   order by inicio desc limit 1;
  if found then return n; end if;
  insert into public.noches (pareja_id, usuario_id) values (p, auth.uid()) returning * into n;
  return n;
end;
$$;
grant execute on function public.acostarme() to authenticated;

-- Buenos días: cierra mi última noche abierta y guarda el sueño
create or replace function public.despertar(p_sueno text default null) returns public.noches
language sql security definer set search_path = public as $$
  update public.noches set fin = now(), sueno = nullif(left(btrim(p_sueno), 280), '')
   where id = (select id from public.noches where usuario_id = auth.uid() and fin is null order by inicio desc limit 1)
  returning *;
$$;
grant execute on function public.despertar(text) to authenticated;

drop trigger if exists noches_aviso on public.noches;
create trigger noches_aviso after insert on public.noches
  for each row execute function public.evento_desde_tabla('a_dormir');
create or replace function public.registrar_despertar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.fin is null and new.fin is not null then
    insert into public.eventos (pareja_id, de_usuario, tipo) values (new.pareja_id, new.usuario_id, 'despierto');
  end if;
  return new;
end;
$$;
drop trigger if exists noches_despierto on public.noches;
create trigger noches_despierto after update on public.noches
  for each row execute function public.registrar_despertar();

-- ========== JUEGOS ==========
-- Una fila por partida terminada. El récord de cada uno en cada juego es su mejor partida.
create table if not exists public.partidas (
  id uuid primary key default gen_random_uuid(),
  pareja_id uuid not null references public.parejas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  juego text not null check (juego ~ '^[a-z_]{2,24}$'),
  puntos integer not null check (puntos between 0 and 100000000),
  detalle jsonb check (detalle is null or pg_column_size(detalle) <= 2000),
  creado_en timestamptz not null default now()
);
create index if not exists partidas_pareja_idx on public.partidas (pareja_id, creado_en desc);
create index if not exists partidas_mejor_idx on public.partidas (usuario_id, juego, puntos desc);
alter table public.partidas enable row level security;
-- Se leen entre los dos; cada uno guarda solo sus partidas (no se editan ni se borran)
drop policy if exists "partidas: leer" on public.partidas;
create policy "partidas: leer" on public.partidas for select using (public.es_mi_pareja(pareja_id));
drop policy if exists "partidas: jugar" on public.partidas;
create policy "partidas: jugar" on public.partidas
  for insert with check (usuario_id = auth.uid() and public.es_mi_pareja(pareja_id));

-- Premio secreto: un mensaje que el otro solo puede leer cuando te quita un récord.
-- Cada uno tiene a lo más un premio esperando; los que ya se ganaron quedan guardados.
create table if not exists public.premios (
  id uuid primary key default gen_random_uuid(),
  pareja_id uuid not null references public.parejas(id) on delete cascade,
  de_usuario uuid not null references auth.users(id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 400),
  ganado_en timestamptz,
  creado_en timestamptz not null default now()
);
create unique index if not exists premios_uno_esperando on public.premios (de_usuario) where ganado_en is null;
alter table public.premios enable row level security;
drop policy if exists "premios: leer" on public.premios;
create policy "premios: leer" on public.premios
  for select using (de_usuario = auth.uid() or (public.es_mi_pareja(pareja_id) and ganado_en is not null));
drop policy if exists "premios: dejar" on public.premios;
create policy "premios: dejar" on public.premios
  for insert with check (de_usuario = auth.uid() and public.es_mi_pareja(pareja_id) and ganado_en is null);
drop policy if exists "premios: cambiar el que espera" on public.premios;
create policy "premios: cambiar el que espera" on public.premios
  for update using (de_usuario = auth.uid() and ganado_en is null)
  with check (de_usuario = auth.uid() and public.es_mi_pareja(pareja_id) and ganado_en is null);
drop policy if exists "premios: quitar el que espera" on public.premios;
create policy "premios: quitar el que espera" on public.premios
  for delete using (de_usuario = auth.uid() and ganado_en is null);

-- Al terminar una partida: si le quitó el récord a su pareja, se gana su premio secreto
-- y le llega un aviso (evento 'record'). Mejorar un récord que ya era tuyo no avisa.
create or replace function public.registrar_partida() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  otro uuid;
  su_mejor integer;
  mi_mejor integer;
begin
  select case when usuario_a = new.usuario_id then usuario_b else usuario_a end into otro
    from public.parejas where id = new.pareja_id;
  if otro is null then return new; end if;
  select max(puntos) into su_mejor from public.partidas where usuario_id = otro and juego = new.juego;
  select max(puntos) into mi_mejor from public.partidas
   where usuario_id = new.usuario_id and juego = new.juego and id <> new.id;
  if su_mejor is not null and new.puntos > su_mejor and coalesce(mi_mejor, -1) <= su_mejor then
    update public.premios set ganado_en = now()
     where de_usuario = otro and pareja_id = new.pareja_id and ganado_en is null;
    insert into public.eventos (pareja_id, de_usuario, tipo) values (new.pareja_id, new.usuario_id, 'record');
  end if;
  return new;
end;
$$;
drop trigger if exists partidas_record on public.partidas;
create trigger partidas_record after insert on public.partidas
  for each row execute function public.registrar_partida();

-- Marcador: el mejor puntaje de cada uno en cada juego, cuántas veces jugó y su mejor de hoy
create or replace function public.marcador_juegos(p_desde timestamptz)
returns table (juego text, usuario_id uuid, mejor integer, partidas integer, mejor_hoy integer, ultima timestamptz)
language sql stable security definer set search_path = public as $$
  select p.juego, p.usuario_id, max(p.puntos)::int, count(*)::int,
         (max(p.puntos) filter (where p.creado_en >= p_desde))::int, max(p.creado_en)
    from public.partidas p
   where p.pareja_id = public.pareja_de(auth.uid())
   group by p.juego, p.usuario_id;
$$;
-- ¿Mi pareja me dejó un premio que todavía no gano? (sí/no, sin mostrarlo)
create or replace function public.premio_esperando() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.premios r
   where public.es_mi_pareja(r.pareja_id) and r.de_usuario <> auth.uid() and r.ganado_en is null);
$$;
grant execute on function public.marcador_juegos(timestamptz) to authenticated;
grant execute on function public.premio_esperando() to authenticated;

-- ========== FOTOS (Supabase Storage) ==========
-- Bucket PRIVADO. Rutas: <pareja_id>/<usuario_id>/<archivo>. Solo la pareja las ve; cada uno sube y borra las suyas.
create or replace function public.es_mi_pareja_txt(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.parejas where id::text = p and (usuario_a = auth.uid() or usuario_b = auth.uid()));
$$;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "fotos: ver las de nuestra pareja" on storage.objects;
create policy "fotos: ver las de nuestra pareja" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.es_mi_pareja_txt((storage.foldername(name))[1]));
drop policy if exists "fotos: subir las mías" on storage.objects;
create policy "fotos: subir las mías" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.es_mi_pareja_txt((storage.foldername(name))[1])
              and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists "fotos: borrar las mías" on storage.objects;
create policy "fotos: borrar las mías" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[2] = auth.uid()::text);

-- ========== CAMPANITA: LAS NOTIFICACIONES QUEDAN GUARDADAS ==========
-- Cada push que mandan las funciones (notificar, recordatorios) queda también aquí, para volver a verla
-- en la app aunque se haya borrado del teléfono o ese teléfono no tenga las push activadas.
-- Solo las escribe el service role (enviarPush); cada uno lee las suyas y las marca como leídas.
create table if not exists public.notificaciones (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  cuerpo text,
  url text,
  tag text,
  creado_en timestamptz not null default now(),
  leida_en timestamptz
);
create index if not exists notificaciones_usuario_idx on public.notificaciones (usuario_id, creado_en desc);
alter table public.notificaciones enable row level security;
drop policy if exists "notificaciones: leer las mías" on public.notificaciones;
create policy "notificaciones: leer las mías" on public.notificaciones
  for select using (usuario_id = auth.uid());

-- Abrir la campanita las marca todas como leídas (por función: no se puede cambiar nada más)
create or replace function public.leer_notificaciones() returns void
language sql security definer set search_path = public as $$
  update public.notificaciones set leida_en = now() where usuario_id = auth.uid() and leida_en is null;
$$;
grant execute on function public.leer_notificaciones() to authenticated;

-- ========== TIEMPO REAL ==========
-- Agrega las tablas a la publicación solo si aún no están (para poder re-ejecutar).
do $$
declare t text;
begin
  foreach t in array array['perfiles', 'parejas', 'eventos', 'disponibilidad', 'animos', 'respuestas', 'cartas', 'deseos', 'horarios', 'eventos_cal',
                                'momentos', 'riegos', 'vales', 'notitas', 'canciones', 'noches', 'partidas', 'premios', 'notificaciones'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
