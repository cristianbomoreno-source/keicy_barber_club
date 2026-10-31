-- El webhook de WhatsApp busca cada evento por webhook_event_id (idempotencia) y no había índice:
-- con la campaña Fronteras cada búsqueda recorría la tabla entera (≈5,8 s con la base cargada).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wa_logs_webhook_event_id ON public.whatsapp_message_logs (webhook_event_id);
