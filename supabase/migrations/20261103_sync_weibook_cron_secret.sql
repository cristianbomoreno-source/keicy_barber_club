-- sync-weibook-citas responde 401 desde el 15-oct: el cron seguía enviando la
-- clave pública y la función exige x-cron-secret (ver 20261014m_cron_secret_funciones).
-- Aplicar solo después de desplegar la función que no cancela citas si WeiBook falla.
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'sync-weibook-hourly'),
  command := $cmd$
  SELECT net.http_post(
    url := 'https://ygrmammcaupnygdxmgth.supabase.co/functions/v1/sync-weibook-citas',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public._dn_cron_secret()),
    body := '{}'::jsonb,
    timeout_milliseconds := 140000
  );
  $cmd$
);
