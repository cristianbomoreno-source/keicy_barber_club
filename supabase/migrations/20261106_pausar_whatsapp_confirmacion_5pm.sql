-- Pausa el envío diario de confirmaciones de WhatsApp hasta nuevo aviso.
-- Para reanudar: active := true. El interruptor whatsapp_enabled sigue encendido
-- para que los clientes reciban respuesta a los botones y el mensaje de gracias.
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'whatsapp-confirmacion-5pm'),
  active := false
);
