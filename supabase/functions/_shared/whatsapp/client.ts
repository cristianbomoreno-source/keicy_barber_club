// =====================================================
// WhatsApp Cloud API - Cliente de Envío
// =====================================================

import {
  WHATSAPP_API_BASE_URL,
  getWhatsAppCredentials,
  createSupabaseClient,
  formatPhoneForWhatsApp
} from './config.ts';
import type {
  SendTemplateRequest,
  SendMessageResponse,
  MessageLogEntry
} from './types.ts';

/**
 * Envía un mensaje de plantilla de WhatsApp.
 */
export async function sendWhatsAppTemplate(
  request: SendTemplateRequest
): Promise<SendMessageResponse> {
  const { sucursalId, to, templateName, languageCode, components, citaId } = request;

  // Obtener credenciales de la sede
  let credentials;
  try {
    credentials = await getWhatsAppCredentials(sucursalId);
  } catch (error) {
    console.error('[WhatsApp Client] Error obteniendo credenciales:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error obteniendo credenciales'
    };
  }

  // Formatear número de teléfono
  const formattedPhone = formatPhoneForWhatsApp(to);

  // Construir el payload del mensaje
  const messagePayload = {
    messaging_product: 'whatsapp',
    to: formattedPhone,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode
      },
      components
    }
  };

  // URL de la API
  const url = `${WHATSAPP_API_BASE_URL}/${credentials.phoneNumberId}/messages`;

  console.log(`[WhatsApp Client] Enviando plantilla "${templateName}" a ${formattedPhone} desde sede ${sucursalId}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messagePayload)
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('[WhatsApp Client] Error de API:', JSON.stringify(responseData));

      // Guardar log de error
      await logMessage({
        cita_id: citaId,
        sucursal_id: sucursalId,
        direction: 'outbound',
        message_type: 'template',
        template_name: templateName,
        to_phone: formattedPhone,
        payload: messagePayload,
        status: 'failed',
        error_code: responseData.error?.code?.toString(),
        error_message: responseData.error?.message || 'Error desconocido'
      });

      return {
        success: false,
        error: responseData.error?.message || 'Error enviando mensaje',
        errorCode: responseData.error?.code?.toString()
      };
    }

    const messageId = responseData.messages?.[0]?.id;
    console.log(`[WhatsApp Client] Mensaje enviado exitosamente. ID: ${messageId}`);

    // Guardar log de éxito
    await logMessage({
      cita_id: citaId,
      sucursal_id: sucursalId,
      direction: 'outbound',
      message_id: messageId,
      message_type: 'template',
      template_name: templateName,
      to_phone: formattedPhone,
      payload: messagePayload,
      status: 'sent'
    });

    return {
      success: true,
      messageId
    };

  } catch (error) {
    console.error('[WhatsApp Client] Error de red:', error);

    await logMessage({
      cita_id: citaId,
      sucursal_id: sucursalId,
      direction: 'outbound',
      message_type: 'template',
      template_name: templateName,
      to_phone: formattedPhone,
      payload: messagePayload,
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Error de red'
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error de red'
    };
  }
}

/**
 * Envía un mensaje de texto simple (para respuestas).
 */
export async function sendWhatsAppText(
  sucursalId: string,
  to: string,
  text: string,
  citaId?: string
): Promise<SendMessageResponse> {
  let credentials;
  try {
    credentials = await getWhatsAppCredentials(sucursalId);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error obteniendo credenciales'
    };
  }

  const formattedPhone = formatPhoneForWhatsApp(to);

  const messagePayload = {
    messaging_product: 'whatsapp',
    to: formattedPhone,
    type: 'text',
    text: {
      body: text
    }
  };

  const url = `${WHATSAPP_API_BASE_URL}/${credentials.phoneNumberId}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messagePayload)
    });

    const responseData = await response.json();

    if (!response.ok) {
      await logMessage({
        cita_id: citaId,
        sucursal_id: sucursalId,
        direction: 'outbound',
        message_type: 'text',
        to_phone: formattedPhone,
        payload: { text },
        status: 'failed',
        error_code: responseData.error?.code?.toString(),
        error_message: responseData.error?.message
      });

      return {
        success: false,
        error: responseData.error?.message,
        errorCode: responseData.error?.code?.toString()
      };
    }

    const messageId = responseData.messages?.[0]?.id;

    await logMessage({
      cita_id: citaId,
      sucursal_id: sucursalId,
      direction: 'outbound',
      message_id: messageId,
      message_type: 'text',
      to_phone: formattedPhone,
      payload: { text },
      status: 'sent'
    });

    return {
      success: true,
      messageId
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error de red'
    };
  }
}

/**
 * Guarda un log de mensaje en la base de datos.
 */
async function logMessage(entry: MessageLogEntry): Promise<void> {
  try {
    const supabase = createSupabaseClient();

    const { error } = await supabase
      .from('whatsapp_message_logs')
      .insert({
        cita_id: entry.cita_id || null,
        sucursal_id: entry.sucursal_id,
        direction: entry.direction,
        message_id: entry.message_id || null,
        message_type: entry.message_type,
        template_name: entry.template_name || null,
        to_phone: entry.to_phone || null,
        from_phone: entry.from_phone || null,
        payload: entry.payload || null,
        status: entry.status,
        error_code: entry.error_code || null,
        error_message: entry.error_message || null,
        webhook_event_id: entry.webhook_event_id || null
      });

    if (error) {
      console.error('[WhatsApp Client] Error guardando log:', error);
    }
  } catch (error) {
    console.error('[WhatsApp Client] Error en logMessage:', error);
  }
}

/**
 * Actualiza el estado de un mensaje en los logs.
 */
export async function updateMessageStatus(
  messageId: string,
  status: string,
  errorCode?: string,
  errorMessage?: string
): Promise<void> {
  try {
    const supabase = createSupabaseClient();

    const { error } = await supabase
      .from('whatsapp_message_logs')
      .update({
        status,
        error_code: errorCode || null,
        error_message: errorMessage || null,
        status_updated_at: new Date().toISOString()
      })
      .eq('message_id', messageId);

    if (error) {
      console.error('[WhatsApp Client] Error actualizando estado:', error);
    }

    // También actualizar en la tabla de citas si corresponde
    const { data: log } = await supabase
      .from('whatsapp_message_logs')
      .select('cita_id')
      .eq('message_id', messageId)
      .single();

    if (log?.cita_id) {
      await supabase
        .from('citas')
        .update({
          whatsapp_reminder_status: status,
          whatsapp_status_updated_at: new Date().toISOString()
        })
        .eq('id', log.cita_id);
    }
  } catch (error) {
    console.error('[WhatsApp Client] Error en updateMessageStatus:', error);
  }
}

/**
 * Verifica si un evento de webhook ya fue procesado (idempotencia).
 */
export async function isWebhookEventProcessed(eventId: string): Promise<boolean> {
  try {
    const supabase = createSupabaseClient();

    const { data } = await supabase
      .from('whatsapp_message_logs')
      .select('id')
      .eq('webhook_event_id', eventId)
      .single();

    return !!data;
  } catch {
    return false;
  }
}

/**
 * Guarda un log de mensaje entrante.
 */
export async function logIncomingMessage(entry: MessageLogEntry): Promise<void> {
  await logMessage(entry);
}
