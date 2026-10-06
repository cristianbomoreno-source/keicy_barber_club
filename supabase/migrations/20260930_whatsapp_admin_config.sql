-- Migración: Configuración de WhatsApp desde Admin
-- Fecha: 2026-09-30
-- Descripción: Permite activar/desactivar funciones de WhatsApp desde la configuración

-- Tabla para configuración global (si no existe)
CREATE TABLE IF NOT EXISTS configuracion_global (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Función para obtener el estado de los cron jobs de WhatsApp
CREATE OR REPLACE FUNCTION get_whatsapp_cron_status()
RETURNS TABLE(jobname TEXT, active BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT jobname::TEXT, active
  FROM cron.job
  WHERE jobname LIKE 'whatsapp%'
  ORDER BY jobname;
$$;

-- Función para activar/desactivar un cron job de WhatsApp
CREATE OR REPLACE FUNCTION toggle_whatsapp_cron(p_jobname TEXT, p_active BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Solo permitir modificar jobs de WhatsApp por seguridad
  IF p_jobname NOT LIKE 'whatsapp%' THEN
    RAISE EXCEPTION 'Solo se pueden modificar jobs de WhatsApp';
  END IF;

  IF p_active THEN
    UPDATE cron.job SET active = true WHERE jobname = p_jobname;
  ELSE
    UPDATE cron.job SET active = false WHERE jobname = p_jobname;
  END IF;
END;
$$;

-- Asegurar que existen las configuraciones (pausadas por defecto)
INSERT INTO configuracion_global (key, value)
VALUES
  ('whatsapp_post_pago_activo', 'false'::jsonb),
  ('email_confirmacion_activo', 'false'::jsonb),
  ('email_recibo_activo', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Comentarios
COMMENT ON FUNCTION get_whatsapp_cron_status IS 'Obtiene el estado de los cron jobs de WhatsApp para el panel de admin';
COMMENT ON FUNCTION toggle_whatsapp_cron IS 'Activa o desactiva un cron job de WhatsApp desde el panel de admin';
