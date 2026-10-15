# Funciones desactivadas (14-oct-2026)

Estas funciones estaban publicadas en Supabase sin ninguna autenticación y la app no
las usa. En producción se reemplazaron por una función que responde 410
(`supabase/functions/_stub_desactivada/index.ts`). El código original queda aquí solo
como referencia; no se despliega.

| Función | Problema |
|---|---|
| whatsapp-send-text | Enviaba cualquier texto a cualquier número desde el WhatsApp de la barbería |
| whatsapp-test-postpago | Igual: mensaje "gracias por tu visita" a cualquier número (no estaba en el repo) |
| whatsapp-test-send | Prueba que enviaba plantillas de confirmación |
| send-confirmations-165 | Reenviaba confirmaciones a 8 clientes fijos cada vez que alguien la llamaba |
| create-template-165 | Mostraba las plantillas de WhatsApp de Calle 165 |
| otp-send | Ninguna página la usa y cualquiera podía pedir códigos por WhatsApp. Su código sigue en `supabase/functions/otp-send/` (sin desplegar) para cuando se implemente la verificación del celular |
| whatsapp-verify-access, whatsapp-debug-config | Diagnóstico: mostraban datos de la cuenta de WhatsApp Business (no estaban en el repo) |

Si alguna vuelve a hacer falta, debe usar `esLlamadaDeLaApp` de `_shared/auth.ts`.
