-- Reabre las reservas en línea: el trigger trg_bloquear_reservas_web deja pasar las citas web.
UPDATE public.app_config SET value = 'true', updated_at = now() WHERE key = 'reservas_web_activas';
