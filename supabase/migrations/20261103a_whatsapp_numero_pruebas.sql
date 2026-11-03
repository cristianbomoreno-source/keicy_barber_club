-- Número de pruebas de WhatsApp (3-nov-2026): whatsapp-plantillas {accion:'probar'} solo envía aquí.
-- El interruptor general (whatsapp_enabled) sigue en 'false': no sale nada automático a clientes.
insert into app_config (key, value, description)
values ('whatsapp_numero_pruebas', '573202107769', 'Único número al que se envían las pruebas de plantillas de WhatsApp')
on conflict (key) do update set value = excluded.value, description = excluded.description, updated_at = now();
