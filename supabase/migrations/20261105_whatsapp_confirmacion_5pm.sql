-- Confirmaciones de WhatsApp a las 5 p. m. (Colombia) para las citas del día
-- siguiente de 10:00 a 12:59.
--
-- claim_citas_confirmacion_5pm solo toma citas en 'pending', pero la columna no
-- tenía valor por defecto y todas quedaban en NULL (nadie se habría enviado).

ALTER TABLE public.citas ALTER COLUMN whatsapp_confirmation_status SET DEFAULT 'pending';

UPDATE public.citas
SET whatsapp_confirmation_status = 'pending'
WHERE whatsapp_confirmation_status IS NULL
  AND estado = 'agendada'
  AND fecha >= (now() AT TIME ZONE 'America/Bogota')::date;

-- pg_cron corre en UTC: 22:00 UTC = 5:00 p. m. Colombia
SELECT cron.schedule(
  'whatsapp-confirmacion-5pm',
  '0 22 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://ygrmammcaupnygdxmgth.supabase.co/functions/v1/whatsapp-confirmation-cron',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public._dn_cron_secret()),
    body := '{"tipo":"5pm"}'::jsonb,
    timeout_milliseconds := 140000
  );
  $job$
);

-- Enciende el interruptor general el 5-nov-2026 a las 4:55 p. m. Colombia, una sola vez.
-- Encenderlo antes activaría también los mensajes de gracias al cobrar.
SELECT cron.schedule(
  'whatsapp-encender-5nov',
  '55 21 5 11 *',
  $job$
  UPDATE public.app_config SET value = 'true', updated_at = now() WHERE key = 'whatsapp_enabled';
  SELECT cron.unschedule('whatsapp-encender-5nov');
  $job$
);
