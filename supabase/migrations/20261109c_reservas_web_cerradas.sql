-- Reservas en línea cerradas ("Próximamente"). Mientras app_config.reservas_web_activas
-- no sea 'true', se rechaza toda cita creada desde la página de reservas (origen web_reservas).
-- Las citas del equipo, de WeiBook y de la agenda no se ven afectadas.
-- Para reabrir: UPDATE app_config SET value = 'true' WHERE key = 'reservas_web_activas';

INSERT INTO public.app_config (key, value, description)
SELECT 'reservas_web_activas', 'false', 'Si es true, la página /reservar acepta citas en línea'
WHERE NOT EXISTS (SELECT 1 FROM public.app_config WHERE key = 'reservas_web_activas');

CREATE OR REPLACE FUNCTION public.bloquear_reservas_web_cerradas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.origen = 'web_reservas' AND coalesce(
       (SELECT replace(value, '"', '') FROM app_config WHERE key = 'reservas_web_activas'), 'false') <> 'true' THEN
    RAISE EXCEPTION 'RESERVA_NO_DISPONIBLE: las reservas en línea están cerradas por ahora';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_reservas_web ON public.citas;
CREATE TRIGGER trg_bloquear_reservas_web
  BEFORE INSERT ON public.citas
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_reservas_web_cerradas();
