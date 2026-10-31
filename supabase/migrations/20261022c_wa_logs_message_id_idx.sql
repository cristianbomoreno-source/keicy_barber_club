-- Índice faltante: cada estado de Meta (sent/delivered/read) actualiza
-- whatsapp_message_logs por message_id. Sin índice era un escaneo completo
-- y la campaña Fronteras (~900 envíos) saturó la base el 22-oct-2026.
-- Aplicado con CONCURRENTLY (no bloquea la tabla).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wa_logs_message_id ON public.whatsapp_message_logs(message_id);
