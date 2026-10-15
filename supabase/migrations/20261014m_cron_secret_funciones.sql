-- 14-oct-2026
-- Las funciones que envían WhatsApp (confirmaciones, recordatorios, post-pago) se
-- podían llamar desde afuera sin ninguna clave. Ahora solo aceptan: el equipo con
-- sesión, el servidor (service role) o las tareas programadas con x-cron-secret.
--
-- La clave de las tareas programadas se genera aquí y vive solo en la bóveda de la
-- base de datos: los cron la leen de la bóveda y las funciones la comparan llamando
-- a _dn_cron_secret() con la service role. No sale del servidor.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'dn_cron_secret') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'dn_cron_secret',
      'Clave de las tareas programadas para llamar edge functions');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._dn_cron_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_temp'
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'dn_cron_secret';
$$;
REVOKE ALL ON FUNCTION public._dn_cron_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._dn_cron_secret() TO service_role;

-- Los cron envían la clave en el encabezado x-cron-secret
DO $$
DECLARE
  j record;
  v_cmd text;
BEGIN
  FOR j IN SELECT jobid, command FROM cron.job WHERE command LIKE '%functions/v1/%' LOOP
    v_cmd := replace(j.command,
      $q$headers := '{"Content-Type": "application/json"}'::jsonb$q$,
      $q$headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public._dn_cron_secret())$q$);
    IF v_cmd <> j.command THEN
      PERFORM cron.alter_job(j.jobid, command := v_cmd);
    END IF;
  END LOOP;
END $$;
