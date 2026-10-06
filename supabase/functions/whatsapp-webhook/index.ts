// =====================================================
// WhatsApp Cloud API - Webhook Handler
// Edge Function para recibir eventos de Meta
//
// GET: Verificación del webhook (NO valida firma)
// POST: Eventos de WhatsApp (SÍ valida X-Hub-Signature-256)
//
// Soporta:
// - messages: Mensajes entrantes
// - statuses: Estados de mensajes enviados
// - history: Historial de coexistencia (SMB App)
// - smb_app_state_sync: Sincronización de contactos (SMB App)
// - smb_message_echoes: Mensajes enviados desde app móvil (SMB App)
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  verifyWebhookToken,
  validateWebhookSignature,
  getSucursalByPhoneNumberId,
  createSupabaseClient
} from '../_shared/whatsapp/config.ts';
import {
  updateMessageStatus,
  isWebhookEventProcessed,
  logIncomingMessage,
  sendWhatsAppText
} from '../_shared/whatsapp/client.ts';
import { processActionToken } from '../_shared/whatsapp/templates.ts';
import {
  parseActionTokenPayload,
  type WhatsAppWebhookPayload,
  type WebhookMessage,
  type WebhookStatus
} from '../_shared/whatsapp/types.ts';

// =====================================================
// Tipos para eventos de Coexistencia (SMB App)
// =====================================================

interface CoexistenceHistoryMessage {
  id: string;
  timestamp: string;
  type: string;
  from: string;
  text?: { body: string };
  // Otros tipos de contenido
}

interface CoexistenceContact {
  wa_id: string;
  profile?: { name: string };
}

interface CoexistenceSyncEvent {
  contacts?: CoexistenceContact[];
  deleted_contacts?: string[];
}

interface CoexistenceMessageEcho {
  id: string;
  timestamp: string;
  type: string;
  to: string;
  text?: { body: string };
  status?: string;
}

// Headers CORS (Meta requiere respuestas CORS)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // =========================================
  // GET: Verificación del Webhook por Meta
  // NO valida X-Hub-Signature-256 (Meta no la envía en GET)
  // Solo compara hub.verify_token con WHATSAPP_VERIFY_TOKEN
  // =========================================
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('[Webhook GET] Verificación:', { mode, hasToken: !!token, hasChallenge: !!challenge });

    // Validar solo el verify_token
    if (mode === 'subscribe' && token && verifyWebhookToken(token)) {
      console.log('[Webhook GET] Verificación exitosa');
      return new Response(challenge, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    console.error('[Webhook GET] Verificación fallida');
    return new Response('Forbidden', {
      status: 403,
      headers: corsHeaders
    });
  }

  // =========================================
  // POST: Eventos de WhatsApp
  // OBLIGATORIO: Validar X-Hub-Signature-256
  // =========================================
  if (req.method === 'POST') {
    // Leer raw body ANTES de validar firma
    const rawBody = await req.text();

    // OBLIGATORIO: Validar firma HMAC-SHA256
    const signature = req.headers.get('x-hub-signature-256');
    const signatureResult = await validateWebhookSignature(rawBody, signature);

    if (!signatureResult.valid) {
      console.error('[Webhook POST] Firma inválida:', signatureResult.error);
      return new Response('Invalid signature', {
        status: 403,
        headers: corsHeaders
      });
    }

    // Parsear JSON después de validar firma
    let payload: WhatsAppWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error('[Webhook POST] JSON inválido');
      return new Response('Invalid JSON', {
        status: 400,
        headers: corsHeaders
      });
    }

    // Verificar que es WhatsApp
    if (payload.object !== 'whatsapp_business_account') {
      console.log('[Webhook POST] Evento ignorado:', payload.object);
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    // Procesar entries
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const field = change.field;
        const value = change.value;

        // =========================================
        // Campo: messages (mensajes y estados)
        // =========================================
        if (field === 'messages') {
          const phoneNumberId = value.metadata?.phone_number_id;

          if (!phoneNumberId) {
            console.warn('[Webhook POST] Sin phone_number_id');
            continue;
          }

          // Identificar sede por phone_number_id
          const sede = await getSucursalByPhoneNumberId(phoneNumberId);
          if (!sede) {
            // Sede no encontrada - responder OK para evitar reintentos
            console.warn(`[Webhook POST] Sede no encontrada para: ${phoneNumberId}`);
            continue;
          }

          console.log(`[Webhook POST] Evento para: ${sede.nombre}`);

          // Procesar mensajes
          if (value.messages?.length) {
            for (const message of value.messages) {
              await processIncomingMessage(message, sede.id, phoneNumberId);
            }
          }

          // Procesar estados
          if (value.statuses?.length) {
            for (const status of value.statuses) {
              await processStatusUpdate(status);
            }
          }
        }

        // =========================================
        // Campo: history (Coexistencia - Historial)
        // Mensajes históricos compartidos durante onboarding
        // =========================================
        else if (field === 'history') {
          console.log('[Webhook POST] Evento history (coexistencia)');
          await processHistoryEvent(entry.id, value);
        }

        // =========================================
        // Campo: smb_app_state_sync (Coexistencia - Contactos)
        // Sincronización de contactos de la app móvil
        // =========================================
        else if (field === 'smb_app_state_sync') {
          console.log('[Webhook POST] Evento smb_app_state_sync (coexistencia)');
          await processSmbAppStateSync(entry.id, value);
        }

        // =========================================
        // Campo: smb_message_echoes (Coexistencia - Ecos)
        // Mensajes enviados desde la app móvil
        // =========================================
        else if (field === 'smb_message_echoes') {
          console.log('[Webhook POST] Evento smb_message_echoes (coexistencia)');
          await processSmbMessageEchoes(entry.id, value);
        }

        // =========================================
        // Campo: account_update (Actualizaciones de cuenta)
        // Notificaciones de cambios en la cuenta de WhatsApp
        // =========================================
        else if (field === 'account_update') {
          console.log('[Webhook POST] Evento account_update');
          await processAccountUpdate(entry.id, value);
        }

        // Otros campos - ignorar silenciosamente
        else {
          console.log(`[Webhook POST] Campo ignorado: ${field}`);
        }
      }
    }

    return new Response('OK', { status: 200, headers: corsHeaders });
  }

  return new Response('Method not allowed', {
    status: 405,
    headers: corsHeaders
  });
});

/**
 * Procesa un mensaje entrante.
 */
async function processIncomingMessage(
  message: WebhookMessage,
  sucursalId: string,
  _phoneNumberId: string
): Promise<void> {
  const messageId = message.id;
  const fromPhone = message.from;
  const messageType = message.type;

  console.log(`[Webhook] Mensaje: tipo=${messageType}, de=${fromPhone}`);

  // Idempotencia
  if (await isWebhookEventProcessed(messageId)) {
    console.log(`[Webhook] Ya procesado: ${messageId}`);
    return;
  }

  // Registrar mensaje
  await logIncomingMessage({
    sucursal_id: sucursalId,
    direction: 'inbound',
    message_id: messageId,
    message_type: messageType,
    from_phone: fromPhone,
    payload: message as unknown as Record<string, unknown>,
    status: 'received',
    webhook_event_id: messageId
  });

  // Procesar botones con action tokens
  if (messageType === 'button' && message.button) {
    const buttonPayload = message.button.payload;
    const parsed = parseActionTokenPayload(buttonPayload);

    if (parsed) {
      console.log(`[Webhook] Botón: ${parsed.action}`);

      const result = await processActionToken({
        token: parsed.token,
        action: parsed.action,
        sucursalId,
        fromPhone
      });

      // Enviar respuesta
      if (result.message) {
        await sendWhatsAppText(sucursalId, fromPhone, result.message);
      }

      // Si fue una confirmación exitosa, enviar mensaje de políticas
      if (result.success && parsed.action === 'CONFIRMAR' && !result.message?.includes('ya está confirmada')) {
        const politicasMsg = `📋 *Parce Antes de tu cita, ten presente:*

⏰ *Puntualidad*
• Llega 10 min antes
• Tiempo de espera máxima : 15 minutos ⏳
• Después serás re-agendado según disponibilidad 👊🏻

⚠️ *Importante*

• A la tercera falla no podrás agendar
• Avísanos con tiempo si no puedes asistir por fa 🙏🏻

💳 *Métodos de pago*

• 💵 Efectivo — Siempre disponible

• 🏧 QR — Paga desde cualquier app bancaria

• Tarjeta — paga con cualquier tarjeta


💛 ¡Te esperamos en la barber y siempre mil gracias por la LEALTAD! ❤️`;

        // Esperar un momento antes de enviar el segundo mensaje
        await new Promise(r => setTimeout(r, 1500));
        await sendWhatsAppText(sucursalId, fromPhone, politicasMsg);
        console.log(`[Webhook] Políticas enviadas a ${fromPhone}`);
      }
    } else {
      console.warn(`[Webhook] Payload no reconocido: ${buttonPayload}`);
    }

  } else if (messageType === 'interactive' && message.interactive) {
    const reply = message.interactive.button_reply || message.interactive.list_reply;
    if (reply) {
      const parsed = parseActionTokenPayload(reply.id);
      if (parsed) {
        const result = await processActionToken({
          token: parsed.token,
          action: parsed.action,
          sucursalId,
          fromPhone
        });

        if (result.message) {
          await sendWhatsAppText(sucursalId, fromPhone, result.message);
        }

        // Si fue una confirmación exitosa, enviar mensaje de políticas
        if (result.success && parsed.action === 'CONFIRMAR' && !result.message?.includes('ya está confirmada')) {
          const politicasMsg = `📋 *Parce Antes de tu cita, ten presente:*

⏰ *Puntualidad*
• Llega 10 min antes
• Tiempo de espera máxima : 15 minutos ⏳
• Después serás re-agendado según disponibilidad 👊🏻

⚠️ *Importante*

• A la tercera falla no podrás agendar
• Avísanos con tiempo si no puedes asistir por fa 🙏🏻

💳 *Métodos de pago*

• 💵 Efectivo — Siempre disponible

• 🏧 QR — Paga desde cualquier app bancaria

• Tarjeta — paga con cualquier tarjeta


💛 ¡Te esperamos en la barber y siempre mil gracias por la LEALTAD! ❤️`;

          await new Promise(r => setTimeout(r, 1500));
          await sendWhatsAppText(sucursalId, fromPhone, politicasMsg);
          console.log(`[Webhook] Políticas enviadas a ${fromPhone}`);
        }
      }
    }

  } else if (messageType === 'text' && message.text) {
    // Solo registrar, NO responder automáticamente
    console.log(`[Webhook] Texto de ${fromPhone}: "${message.text.body.substring(0, 50)}..."`);
  }
}

/**
 * Procesa actualización de estado.
 */
async function processStatusUpdate(status: WebhookStatus): Promise<void> {
  const messageId = status.id;
  const newStatus = status.status;

  console.log(`[Webhook] Estado: ${messageId} -> ${newStatus}`);

  let errorCode: string | undefined;
  let errorMessage: string | undefined;

  if (status.errors?.length) {
    errorCode = status.errors[0].code.toString();
    errorMessage = status.errors[0].title || status.errors[0].message;
  }

  await updateMessageStatus(messageId, newStatus, errorCode, errorMessage);
}

// =====================================================
// Handlers de Coexistencia (WhatsApp Business App)
// =====================================================

/**
 * Procesa eventos de historial (coexistencia).
 * Se recibe durante el onboarding cuando el usuario comparte su historial.
 * Contiene mensajes de los últimos 180 días.
 */
async function processHistoryEvent(
  wabaId: string,
  value: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createSupabaseClient();
    const messages = (value.messages || []) as CoexistenceHistoryMessage[];

    console.log(`[Coexistence History] WABA: ${wabaId}, mensajes: ${messages.length}`);

    // Registrar el evento (no procesamos los mensajes individualmente por ahora)
    await supabase.from('whatsapp_coexistence_logs').insert({
      event_type: 'HISTORY_SYNC',
      mode: 'live',
      waba_id: wabaId,
      phone_number_id: null,
      business_id: null,
      is_coexistence: true,
      validation_passed: true,
      validation_warnings: [],
      error_message: null,
      raw_payload: {
        message_count: messages.length,
        timestamp: new Date().toISOString(),
        // Solo guardamos metadatos, no el contenido de los mensajes
        sample_types: [...new Set(messages.slice(0, 10).map(m => m.type))]
      }
    });

    console.log(`[Coexistence History] Evento registrado`);
  } catch (error) {
    console.error('[Coexistence History] Error:', error);
  }
}

/**
 * Procesa sincronización de estado de app (coexistencia).
 * Se recibe cuando hay cambios en los contactos de la app móvil.
 */
async function processSmbAppStateSync(
  wabaId: string,
  value: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createSupabaseClient();
    const syncData = value as CoexistenceSyncEvent;

    const contactsAdded = syncData.contacts?.length || 0;
    const contactsDeleted = syncData.deleted_contacts?.length || 0;

    console.log(`[Coexistence Sync] WABA: ${wabaId}, +${contactsAdded} -${contactsDeleted} contactos`);

    // Registrar el evento
    await supabase.from('whatsapp_coexistence_logs').insert({
      event_type: 'SMB_APP_STATE_SYNC',
      mode: 'live',
      waba_id: wabaId,
      phone_number_id: null,
      business_id: null,
      is_coexistence: true,
      validation_passed: true,
      validation_warnings: [],
      error_message: null,
      raw_payload: {
        contacts_added: contactsAdded,
        contacts_deleted: contactsDeleted,
        timestamp: new Date().toISOString()
      }
    });

    console.log(`[Coexistence Sync] Evento registrado`);
  } catch (error) {
    console.error('[Coexistence Sync] Error:', error);
  }
}

/**
 * Procesa ecos de mensajes (coexistencia).
 * Se recibe cuando el usuario envía un mensaje desde la app móvil.
 * Permite mantener sincronizado el historial entre app y API.
 */
async function processSmbMessageEchoes(
  wabaId: string,
  value: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createSupabaseClient();
    const messages = (value.messages || []) as CoexistenceMessageEcho[];

    console.log(`[Coexistence Echo] WABA: ${wabaId}, mensajes: ${messages.length}`);

    for (const message of messages) {
      // Registrar cada mensaje enviado desde la app móvil
      const logEntry = {
        event_type: 'SMB_MESSAGE_ECHO',
        mode: 'live',
        waba_id: wabaId,
        phone_number_id: null,
        business_id: null,
        is_coexistence: true,
        validation_passed: true,
        validation_warnings: [],
        error_message: null,
        raw_payload: {
          message_id: message.id,
          to: message.to,
          type: message.type,
          timestamp: message.timestamp,
          // No guardamos el contenido del mensaje por privacidad
          has_text: !!message.text
        }
      };

      await supabase.from('whatsapp_coexistence_logs').insert(logEntry);
    }

    console.log(`[Coexistence Echo] ${messages.length} mensajes registrados`);
  } catch (error) {
    console.error('[Coexistence Echo] Error:', error);
  }
}

/**
 * Procesa actualizaciones de cuenta.
 * Notificaciones de cambios en la configuración de WhatsApp Business.
 */
async function processAccountUpdate(
  wabaId: string,
  value: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createSupabaseClient();

    console.log(`[Account Update] WABA: ${wabaId}`);

    // Registrar el evento
    await supabase.from('whatsapp_coexistence_logs').insert({
      event_type: 'ACCOUNT_UPDATE',
      mode: 'live',
      waba_id: wabaId,
      phone_number_id: (value.phone_number as string) || null,
      business_id: null,
      is_coexistence: false,
      validation_passed: true,
      validation_warnings: [],
      error_message: null,
      raw_payload: {
        event: value.event || 'unknown',
        timestamp: new Date().toISOString()
      }
    });

    console.log(`[Account Update] Evento registrado`);
  } catch (error) {
    console.error('[Account Update] Error:', error);
  }
}
