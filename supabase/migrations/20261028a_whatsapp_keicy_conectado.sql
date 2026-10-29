-- WhatsApp de Keicy conectado por coexistencia (28-oct-2026)
-- Número +57 317 171 3526 · WABA 1063106458711350 · Phone Number ID 609857948888403

-- Interruptor general apagado: mientras no sea 'true' no sale ningún mensaje de WhatsApp
update app_config
set value = 'false',
    description = 'Interruptor general: si no es true, no sale ningún mensaje de WhatsApp',
    updated_at = now()
where key = 'whatsapp_enabled';

-- Sede La Flora enlazada con el número de Keicy
update sucursales
set whatsapp_phone_number_id = '609857948888403',
    whatsapp_waba_id = '1063106458711350',
    whatsapp_phone_number = '573171713526'
where id = '46c99064-8218-41a0-a8c7-a81103f658fa';
