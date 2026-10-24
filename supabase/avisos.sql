-- Nosotros · avisos: la base de datos llama a las Edge Functions
-- Reemplaza a los dos Database Webhooks del panel y a cron.sql: un solo script.
--
-- Antes de pegarlo en Supabase → SQL Editor, cambia en las dos líneas marcadas con ◀:
--   TU_REF            → el "Reference ID" del proyecto (Project Settings → General)
--   TU_WEBHOOK_SECRET → el mismo WEBHOOK_SECRET que cargaste en las funciones (archivo .env)
-- Se puede volver a ejecutar: reemplaza lo anterior sin duplicar nada. Si se corre sin cambiar las líneas ◀
-- (con TU_REF / TU_WEBHOOK_SECRET), se queda con la URL y el secreto que ya estaban guardados.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Configuración privada: la app (anon / authenticated) no puede leer este esquema
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;
create table if not exists privado.config (clave text primary key, valor text not null);
insert into privado.config (clave, valor) values
  ('funciones_url', 'https://TU_REF.supabase.co/functions/v1'),   -- ◀
  ('webhook_secret', 'TU_WEBHOOK_SECRET')                          -- ◀
on conflict (clave) do update set valor = excluded.valor
  where excluded.valor not like '%TU\_%';  -- los valores de ejemplo nunca pisan los de verdad

-- Llama a una Edge Function con el secreto (pg_net: no bloquea a quien escribió)
create or replace function privado.llamar(funcion text, cuerpo jsonb) returns void
language plpgsql security definer set search_path = privado, public as $$
declare
  base text := (select valor from privado.config where clave = 'funciones_url');
  secreto text := (select valor from privado.config where clave = 'webhook_secret');
begin
  perform net.http_post(
    url := base || '/' || funcion,
    body := cuerpo,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', secreto),
    timeout_milliseconds := 5000
  );
end;
$$;

-- eventos (INSERT) → notificar. Mismo formato que un Database Webhook.
create or replace function privado.aviso_eventos() returns trigger
language plpgsql security definer set search_path = privado, public as $$
begin
  perform privado.llamar('notificar', jsonb_build_object(
    'type', 'INSERT', 'table', 'eventos', 'schema', 'public', 'record', to_jsonb(new), 'old_record', null));
  return new;
end;
$$;
drop trigger if exists aviso_eventos on public.eventos;
create trigger aviso_eventos
  after insert on public.eventos
  for each row execute function privado.aviso_eventos();

-- eventos_cal (INSERT / UPDATE / DELETE) → notificar
create or replace function privado.aviso_calendario() returns trigger
language plpgsql security definer set search_path = privado, public as $$
begin
  perform privado.llamar('notificar', jsonb_build_object(
    'type', tg_op, 'table', 'eventos_cal', 'schema', 'public',
    'record', case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    'old_record', case when tg_op = 'INSERT' then null else to_jsonb(old) end));
  return coalesce(new, old);
end;
$$;
drop trigger if exists aviso_calendario on public.eventos_cal;
create trigger aviso_calendario
  after insert or update or delete on public.eventos_cal
  for each row execute function privado.aviso_calendario();

-- Los Database Webhooks del panel (`notificar` y `notificar-calendario`, de una versión anterior de la guía)
-- hacen lo mismo que estos dos triggers: si quedaran los dos, cada aviso llegaría doble. Se quitan solo
-- cuando ya hay una URL de verdad guardada, para no quedarse nunca sin avisos.
do $$
begin
  if exists (select 1 from privado.config where clave = 'funciones_url' and valor not like '%TU\_%') then
    drop trigger if exists "notificar" on public.eventos;
    drop trigger if exists "notificar-calendario" on public.eventos_cal;
  end if;
end;
$$;

-- Cada 5 minutos → recordatorios (calendario 30 min antes, cartas que ya se abren, "libre" vencido)
select cron.unschedule('nosotros-recordatorios')
 where exists (select 1 from cron.job where jobname = 'nosotros-recordatorios');
select cron.schedule('nosotros-recordatorios', '*/5 * * * *', $$ select privado.llamar('recordatorios', '{}'::jsonb) $$);

-- Para revisar después:
--   select status_code, content::text, created from net._http_response order by created desc limit 10;
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
