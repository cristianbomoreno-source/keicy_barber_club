// =====================================================
// WhatsApp Cloud API - Tipos TypeScript
// =====================================================

// Credenciales de WhatsApp por sede
export interface WhatsAppCredentials {
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
  phoneNumber: string;
}

// Estructura de sucursal con WhatsApp
export interface SucursalWhatsApp {
  id: string;
  nombre: string;
  whatsapp_phone_number: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_waba_id: string | null;
  whatsapp_token_ref: string | null; // Referencia al secret, NO el token real
}

// Cita para recordatorio
export interface CitaRecordatorio {
  cita_id: string;
  cliente_id: string;
  cliente_telefono: string;
  cliente_nombre: string;
  fecha: string;
  hora_inicio: string;
  sucursal_id: string;
  sucursal_nombre: string;
  whatsapp_phone_number_id: string;
  barbero_nombre: string;
}

// =====================================================
// Tipos de Webhook de Meta
// =====================================================

export interface WhatsAppWebhookPayload {
  object: string;
  entry: WebhookEntry[];
}

export interface WebhookEntry {
  id: string;
  changes: WebhookChange[];
}

export interface WebhookChange {
  value: WebhookValue;
  field: string;
}

export interface WebhookValue {
  messaging_product: string;
  metadata: WebhookMetadata;
  contacts?: WebhookContact[];
  messages?: WebhookMessage[];
  statuses?: WebhookStatus[];
  errors?: WebhookError[];
}

export interface WebhookMetadata {
  display_phone_number: string;
  phone_number_id: string;
}

export interface WebhookContact {
  profile: {
    name: string;
  };
  wa_id: string;
}

export interface WebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'button' | 'interactive' | 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'location' | 'contacts';
  text?: {
    body: string;
  };
  button?: {
    text: string;
    payload: string;
  };
  interactive?: {
    type: string;
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
      description?: string;
    };
  };
  context?: {
    from: string;
    id: string;
  };
}

export interface WebhookStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    origin: {
      type: string;
    };
  };
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
  errors?: WebhookError[];
}

export interface WebhookError {
  code: number;
  title: string;
  message?: string;
  error_data?: {
    details: string;
  };
}

// =====================================================
// Tipos de Envío de Mensajes
// =====================================================

export interface SendTemplateRequest {
  sucursalId: string;
  to: string;
  templateName: string;
  languageCode: string;
  components: TemplateComponent[];
  citaId?: string;
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: 'quick_reply' | 'url';
  index?: string;
  parameters: TemplateParameter[];
}

export interface TemplateParameter {
  type: 'text' | 'image' | 'document' | 'video' | 'payload';
  text?: string;
  payload?: string;
  image?: {
    link: string;
  };
}

export interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
}

// =====================================================
// Tipos para logs
// =====================================================

export interface MessageLogEntry {
  cita_id?: string;
  sucursal_id: string;
  direction: 'outbound' | 'inbound';
  message_id?: string;
  message_type: string;
  template_name?: string;
  to_phone?: string;
  from_phone?: string;
  payload?: Record<string, unknown>;
  status: string;
  error_code?: string;
  error_message?: string;
  webhook_event_id?: string;
}

// =====================================================
// Payloads de botones con Action Tokens
// =====================================================

export type ButtonAction = 'CONFIRMAR' | 'CANCELAR';

export interface ParsedActionToken {
  action: ButtonAction;
  token: string;
}

/**
 * Parsea el payload de un botón con action token.
 * Formato esperado: "CONFIRMAR:<token>" o "CANCELAR:<token>"
 */
export function parseActionTokenPayload(payload: string): ParsedActionToken | null {
  const parts = payload.split(':');
  if (parts.length !== 2) return null;

  const [action, token] = parts;
  if (!['CONFIRMAR', 'CANCELAR'].includes(action)) return null;
  if (!token || token.length < 20) return null; // Tokens tienen mínimo 20 chars

  return {
    action: action as ButtonAction,
    token
  };
}

// =====================================================
// Legacy (mantener compatibilidad temporal)
// =====================================================

/** @deprecated Usar parseActionTokenPayload */
export type LegacyButtonAction = 'CONFIRMAR_CITA' | 'CANCELAR_CITA';

/** @deprecated Usar parseActionTokenPayload */
export interface ParsedButtonPayload {
  action: LegacyButtonAction;
  citaId: string;
}

/** @deprecated Usar parseActionTokenPayload */
export function parseButtonPayload(payload: string): ParsedButtonPayload | null {
  // Intentar parsear formato legacy
  const parts = payload.split(':');
  if (parts.length !== 2) return null;

  const [action, citaId] = parts;
  if (!['CONFIRMAR_CITA', 'CANCELAR_CITA'].includes(action)) return null;
  if (!citaId || citaId.length < 10) return null;

  return {
    action: action as LegacyButtonAction,
    citaId
  };
}
