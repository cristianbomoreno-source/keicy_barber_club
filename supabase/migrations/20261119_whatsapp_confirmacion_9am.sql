-- 19-nov-2026: confirmaciones de WhatsApp en dos tandas.
--   5:00 p. m. (job 5, ya existía): citas de mañana 10:00-12:59.
--   9:00 a. m. (nuevo): citas de hoy 14:00-19:59 (claim_citas_confirmacion_9am).
select cron.schedule('whatsapp-confirmacion-9am', '0 14 * * *', $$
  SELECT net.http_post(
    url := 'https://ygrmammcaupnygdxmgth.supabase.co/functions/v1/whatsapp-confirmation-cron',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public._dn_cron_secret()),
    body := '{"tipo":"9am"}'::jsonb,
    timeout_milliseconds := 140000
  );
$$);
