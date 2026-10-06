// =====================================================
// WhatsApp Cloud API - Servicio de Envío (INTERNO)
// Edge Function para enviar mensajes de WhatsApp
//
// SEGURIDAD: Este endpoint es PRIVADO.
// Solo acepta llamadas con service_role key.
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { sendCitaReminder } from '../_shared/whatsapp/templates.ts';
import { sendWhatsAppText } from '../_shared/whatsapp/client.ts';
import { validateInternalSecret } from '../_shared/whatsapp/config.ts';

// Headers para respuestas (NO CORS público)
const responseHeaders = {
  'Content-Type': 'application/json'
};

interface SendReminderRequest {
  type: 'reminder';
  cita_id: string;
  to: string;
  cliente_nombre: string;
  sede_nombre: string;
  hora: string;
  barbero_nombre: string;
  sucursal_id: string;
}

interface SendTextRequest {
  type: 'text';
  sucursal_id: string;
  to: string;
  text: string;
  cita_id?: string;
}

type SendRequest = SendReminderRequest | SendTextRequest;

serve(async (req) => {
  // NO permitimos preflight CORS - este endpoint es solo interno
  if (req.method === 'OPTIONS') {
    return new Response('Not allowed', { status: 405 });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: responseHeaders
    });
  }

  // OBLIGATORIO: Verificar autenticación con secret dedicado
  const internalSecret = req.headers.get('x-internal-secret');
  if (!validateInternalSecret(internalSecret)) {
    console.error('[WhatsApp Send] Acceso no autorizado');
    return new Response(JSON.stringify({
      success: false,
      error: 'Unauthorized'
    }), {
      status: 401,
      headers: responseHeaders
    });
  }

  try {
    const body: SendRequest = await req.json();

    console.log(`[WhatsApp Send] Solicitud recibida: tipo=${body.type}`);

    if (body.type === 'reminder') {
      // Enviar recordatorio de cita
      const result = await sendCitaReminder({
        citaId: body.cita_id,
        sucursalId: body.sucursal_id,
        clienteTelefono: body.to,
        clienteNombre: body.cliente_nombre,
        sedeName: body.sede_nombre,
        hora: body.hora,
        barberoNombre: body.barbero_nombre
      });

      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 500,
        headers: responseHeaders
      });

    } else if (body.type === 'text') {
      // Enviar mensaje de texto
      const result = await sendWhatsAppText(
        body.sucursal_id,
        body.to,
        body.text,
        body.cita_id
      );

      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 500,
        headers: responseHeaders
      });

    } else {
      return new Response(JSON.stringify({ error: 'Tipo no soportado' }), {
        status: 400,
        headers: responseHeaders
      });
    }

  } catch (error) {
    console.error('[WhatsApp Send] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Error interno'
    }), {
      status: 500,
      headers: responseHeaders
    });
  }
});
