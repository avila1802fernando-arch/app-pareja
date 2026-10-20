-- Nosotros · tarea programada: llama a la función `recordatorios` cada 5 minutos
--
-- Antes de pegar esto:
--   1. Supabase → Database → Extensions: activar `pg_cron` y `pg_net`
--      (o deja que lo hagan las dos líneas de abajo).
--   2. Reemplaza TU_REF por el "Reference ID" del proyecto (Project Settings → General)
--      y TU_WEBHOOK_SECRET por el mismo valor que pusiste en `supabase secrets set WEBHOOK_SECRET=...`.
--
-- Se puede volver a ejecutar: primero quita la tarea si ya existía.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('nosotros-recordatorios')
 where exists (select 1 from cron.job where jobname = 'nosotros-recordatorios');

select cron.schedule(
  'nosotros-recordatorios',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://TU_REF.supabase.co/functions/v1/recordatorios',
    headers := '{"Content-Type": "application/json", "x-webhook-secret": "TU_WEBHOOK_SECRET"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- Para comprobar que quedó programada:
--   select jobid, jobname, schedule, active from cron.job;
-- Para ver las últimas ejecuciones:
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
