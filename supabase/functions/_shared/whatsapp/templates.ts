// =====================================================
// WhatsApp Cloud API - Plantillas
// =====================================================

import { sendWhatsAppTemplate } from './client.ts';
import { formatTimeForMessage, createSupabaseClient } from './config.ts';
import type { SendMessageResponse, TemplateComponent } from './types.ts';

// Nombres de las plantillas en Meta
export const TEMPLATE_RECORDATORIO_CITA = 'recordatorio_cita';
export const TEMPLATE_CONFIRMACION = 'confirmacion';
export const TEMPLATE_CONFIRMACION_165 = 'confirmacion_cita';

// =====================================================
// ⚠️ CONFIGURAR ESTOS VALORES CON TU NÚMERO DE WHATSAPP
// =====================================================
// Phone Number IDs - obtener de Meta Business después de agregar el número
const PHONE_NUMBER_ID_PRINCIPAL = 'TU_PHONE_NUMBER_ID';  // Cambiar

// URL de la imagen de cabecera para confirmaciones
const HEADER_IMAGE_URL = 'https://keicybarber.com/assets/whatsapp-header.jpg';  // Cambiar dominio

/**
 * Formatea la fecha de la cita para el mensaje.
 * Devuelve: { label: "Hoy" | "Mañana" | día, fechaCompleta: "22 de septiembre de 2026" }
 */
function formatDateForMessage(fecha: string): { label: string; fechaCompleta: string } {
  const citaDate = new Date(fecha + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];

  const dia = citaDate.getDate();
  const mes = meses[citaDate.getMonth()];
  const año = citaDate.getFullYear();
  const fechaCompleta = `${dia} de ${mes} de ${año}`;

  let label: string;
  if (citaDate.getTime() === today.getTime()) {
    label = 'Hoy';
  } else if (citaDate.getTime() === tomorrow.getTime()) {
    label = 'Mañana';
  } else {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    label = dias[citaDate.getDay()];
  }

  return { label, fechaCompleta };
}

/**
 * Envía confirmación de cita por WhatsApp (2 horas antes).
 * Plantilla: confirmacion
 *
 * Header: Imagen de la barbería
 * Body:
 * {{1}} = Nombre del cliente
 * {{2}} = Nombre de la sede
 * {{3}} = Etiqueta del día (Hoy/Mañana/Día)
 * {{4}} = Fecha completa (22 de septiembre de 2026)
 * {{5}} = Hora de la cita
 * {{6}} = Nombre del barbero
 */
export async function sendCitaConfirmacion(params: {
  citaId: string;
  sucursalId: string;
  clienteTelefono: string;
  clienteNombre: string;
  sedeName: string;
  fecha: string;
  hora: string;
  barberoNombre: string;
  confirmToken: string;
  cancelToken: string;
  headerImageUrl?: string;
}): Promise<SendMessageResponse> {
  const {
    citaId,
    sucursalId,
    clienteTelefono,
    clienteNombre,
    sedeName,
    fecha,
    hora,
    barberoNombre,
    confirmToken,
    cancelToken,
    headerImageUrl
  } = params;

  const horaFormateada = formatTimeForMessage(hora);
  const { label: diaLabel, fechaCompleta } = formatDateForMessage(fecha);

  // Construir componentes de la plantilla
  const components: TemplateComponent[] = [
    {
      type: 'header',
      parameters: [
        {
          type: 'image',
          image: {
            link: headerImageUrl || HEADER_IMAGE_URL
          }
        }
      ]
    },
    {
      type: 'body',
      parameters: [
        { type: 'text', text: clienteNombre || 'Cliente' },
        { type: 'text', text: sedeName },
        { type: 'text', text: diaLabel },
        { type: 'text', text: fechaCompleta },
        { type: 'text', text: horaFormateada },
        { type: 'text', text: barberoNombre || 'tu barbero' }
      ]
    },
    {
      type: 'button',
      sub_type: 'quick_reply',
      index: '0',
      parameters: [
        {
          type: 'payload',
          payload: `CONFIRMAR:${confirmToken}`
        }
      ]
    },
    {
      type: 'button',
      sub_type: 'quick_reply',
      index: '1',
      parameters: [
        {
          type: 'payload',
          payload: `CANCELAR:${cancelToken}`
        }
      ]
    }
  ];

  // Determinar qué plantilla usar según la sede
  const supabase = createSupabaseClient();
  const { data: sede } = await supabase
    .from('sucursales')
    .select('whatsapp_phone_number_id')
    .eq('id', sucursalId)
    .single();

  // Calle 165 usa 'confirmacion_cita', Colina usa 'confirmacion'
  const templateName = sede?.whatsapp_phone_number_id === PHONE_NUMBER_ID_165
    ? TEMPLATE_CONFIRMACION_165
    : TEMPLATE_CONFIRMACION;

  console.log(`[Templates] Enviando confirmación para cita ${citaId} con plantilla ${templateName}`);

  // Enviar la plantilla
  const result = await sendWhatsAppTemplate({
    sucursalId,
    to: clienteTelefono,
    templateName,
    languageCode: 'es',
    components,
    citaId
  });

  return result;
}

/**
 * Envía el recordatorio de cita por WhatsApp con action tokens seguros.
 *
 * Los payloads de los botones usan tokens opacos en lugar de UUIDs:
 * - CONFIRMAR:<token_aleatorio>
 * - CANCELAR:<token_aleatorio>
 */
export async function sendCitaReminderWithTokens(params: {
  citaId: string;
  claimId: string;
  sucursalId: string;
  clienteTelefono: string;
  clienteNombre: string;
  sedeName: string;
  hora: string;
  barberoNombre: string;
  confirmToken: string;
  cancelToken: string;
}): Promise<SendMessageResponse> {
  const {
    citaId,
    sucursalId,
    clienteTelefono,
    clienteNombre,
    sedeName,
    hora,
    barberoNombre,
    confirmToken,
    cancelToken
  } = params;

  const horaFormateada = formatTimeForMessage(hora);

  // Construir componentes con tokens opacos
  const components: TemplateComponent[] = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: clienteNombre || 'Cliente' },
        { type: 'text', text: sedeName },
        { type: 'text', text: horaFormateada },
        { type: 'text', text: barberoNombre || 'tu barbero' }
      ]
    },
    {
      type: 'button',
      sub_type: 'quick_reply',
      index: '0',
      parameters: [
        {
          type: 'payload',
          payload: `CONFIRMAR:${confirmToken}`
        }
      ]
    },
    {
      type: 'button',
      sub_type: 'quick_reply',
      index: '1',
      parameters: [
        {
          type: 'payload',
          payload: `CANCELAR:${cancelToken}`
        }
      ]
    }
  ];

  console.log(`[Templates] Enviando recordatorio para cita ${citaId}`);

  // Enviar la plantilla
  const result = await sendWhatsAppTemplate({
    sucursalId,
    to: clienteTelefono,
    templateName: TEMPLATE_RECORDATORIO_CITA,
    languageCode: 'es',
    components,
    citaId
  });

  return result;
}

/**
 * Procesa la respuesta de un botón usando action tokens.
 *
 * TODO EL FLUJO ES ATÓMICO EN LA RPC:
 * 1. Bloquear token (FOR UPDATE)
 * 2. Validar token (existe, no expirado, no usado, acción, sede, teléfono)
 * 3. Verificar si otro token del mismo recordatorio ya fue usado
 * 4. Bloquear cita (FOR UPDATE)
 * 5. Cambiar estado de cita
 * 6. Registrar en historial
 * 7. Marcar token como usado
 * 8. INVALIDAR TODOS los demás tokens de ese recordatorio
 * 9. Commit
 */
export async function processActionToken(params: {
  token: string;
  action: 'CONFIRMAR' | 'CANCELAR';
  sucursalId: string;
  fromPhone: string;
}): Promise<{ success: boolean; message: string; citaId?: string }> {
  const { token, action, sucursalId, fromPhone } = params;

  const supabase = createSupabaseClient();

  // La RPC ejecuta TODO atómicamente: validación + cambio de estado + invalidación de tokens
  const { data, error } = await supabase.rpc('validar_action_token', {
    p_token: token,
    p_expected_action: action,
    p_from_phone: fromPhone,
    p_sucursal_id: sucursalId
  });

  if (error) {
    console.error('[Templates] Error en RPC:', error);
    return { success: false, message: 'Error procesando solicitud. Intenta de nuevo.' };
  }

  const result = data?.[0];
  if (!result) {
    return { success: false, message: 'Error procesando solicitud.' };
  }

  // Token inválido
  if (!result.is_valid) {
    console.warn(`[Templates] Token inválido: ${result.error_message}`);

    // FALLBACK: Si el token parece un UUID, intentar procesar directamente
    // (para citas enviadas manualmente sin sistema de tokens)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (result.error_message === 'Token no válido' && uuidRegex.test(token)) {
      console.log(`[Templates] Fallback UUID detectado: ${token}`);
      return await processDirectCitaAction(token, action, sucursalId, fromPhone, supabase);
    }

    // Mensajes amigables según el error
    const errorMessages: Record<string, string> = {
      'Token no válido': 'Este enlace no es válido.',
      'Token expirado': 'Este enlace ha expirado. Contacta a la barbería.',
      'Acción no válida': 'Acción no permitida.',
      'Sede no válida': 'Error de configuración. Contacta a la barbería.',
      'Teléfono no coincide': 'Este número no corresponde a la cita.',
      'Cita no encontrada': 'No encontramos esta cita.',
      'Cita no modificable': 'Esta cita ya no puede modificarse.'
    };

    return {
      success: false,
      message: errorMessages[result.error_message] || 'Solicitud no válida.'
    };
  }

  // Token ya usado (idempotencia) - el otro botón o este ya se presionó
  if (result.already_used) {
    console.log(`[Templates] Token/recordatorio ya procesado para cita ${result.cita_id}`);

    // Consultar estado actual para dar mensaje apropiado
    const { data: cita } = await supabase
      .from('citas')
      .select('estado')
      .eq('id', result.cita_id)
      .single();

    if (cita?.estado === 'confirmada') {
      return { success: true, message: '¡Tu cita ya está confirmada! Te esperamos.', citaId: result.cita_id };
    } else if (cita?.estado === 'cancelada') {
      return { success: true, message: 'Tu cita ya fue cancelada.', citaId: result.cita_id };
    } else {
      return { success: true, message: 'Esta solicitud ya fue procesada.', citaId: result.cita_id };
    }
  }

  // Acción ejecutada exitosamente por la RPC
  console.log(`[Templates] Cita ${result.cita_id} ${action === 'CONFIRMAR' ? 'confirmada' : 'cancelada'}`);

  if (action === 'CONFIRMAR') {
    return {
      success: true,
      message: '¡Tu cita ha sido confirmada! Te esperamos.',
      citaId: result.cita_id
    };
  } else {
    return {
      success: true,
      message: 'Tu cita ha sido cancelada. Si cambias de opinión, agenda una nueva en nuestra web.',
      citaId: result.cita_id
    };
  }
}

// =====================================================
// FALLBACK: Procesar UUID directo (citas enviadas manualmente)
// =====================================================

/**
 * Procesa una acción usando el UUID de la cita directamente.
 * Solo para citas enviadas con el formato manual (sin tokens).
 * Valida que el teléfono coincida para seguridad.
 */
async function processDirectCitaAction(
  citaId: string,
  action: 'CONFIRMAR' | 'CANCELAR',
  sucursalId: string,
  fromPhone: string,
  supabase: ReturnType<typeof createSupabaseClient>
): Promise<{ success: boolean; message: string; citaId?: string }> {
  console.log(`[Templates] Procesando UUID directo: ${citaId}, acción: ${action}`);

  // Buscar la cita
  const { data: cita, error } = await supabase
    .from('citas')
    .select('id, estado, sucursal_id, cliente_telefono, cliente_id')
    .eq('id', citaId)
    .single();

  if (error || !cita) {
    console.warn(`[Templates] Cita no encontrada: ${citaId}`);
    return { success: false, message: 'No encontramos esta cita.' };
  }

  // Verificar sede
  if (cita.sucursal_id !== sucursalId) {
    console.warn(`[Templates] Sede no coincide: ${cita.sucursal_id} vs ${sucursalId}`);
    return { success: false, message: 'Error de configuración. Contacta a la barbería.' };
  }

  // Verificar teléfono (normalizar para comparar)
  const normalizePhone = (phone: string) => phone.replace(/\D/g, '').slice(-10);
  const citaPhone = normalizePhone(cita.cliente_telefono || '');
  const incomingPhone = normalizePhone(fromPhone);

  // Si la cita no tiene teléfono directo, buscar en el usuario
  let phoneMatches = citaPhone === incomingPhone;
  if (!phoneMatches && cita.cliente_id) {
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('phone')
      .eq('id', cita.cliente_id)
      .single();
    if (usuario?.phone) {
      phoneMatches = normalizePhone(usuario.phone) === incomingPhone;
    }
  }

  if (!phoneMatches) {
    console.warn(`[Templates] Teléfono no coincide para cita ${citaId}`);
    return { success: false, message: 'Este número no corresponde a la cita.' };
  }

  // Verificar estado de la cita
  if (cita.estado === 'confirmada') {
    return { success: true, message: '¡Tu cita ya está confirmada! Te esperamos.', citaId };
  }
  if (cita.estado === 'cancelada') {
    return { success: true, message: 'Tu cita ya fue cancelada.', citaId };
  }
  if (!['agendada', 'pendiente'].includes(cita.estado)) {
    return { success: false, message: 'Esta cita ya no puede modificarse.' };
  }

  // Ejecutar la acción
  const newEstado = action === 'CONFIRMAR' ? 'confirmada' : 'cancelada';
  const { error: updateError } = await supabase
    .from('citas')
    .update({ estado: newEstado })
    .eq('id', citaId);

  if (updateError) {
    console.error(`[Templates] Error actualizando cita ${citaId}:`, updateError);
    return { success: false, message: 'Error procesando solicitud. Intenta de nuevo.' };
  }

  // Registrar en historial
  await supabase.from('citas_historial').insert({
    cita_id: citaId,
    campo_modificado: 'estado',
    valor_anterior: cita.estado,
    valor_nuevo: newEstado,
    modificado_por: 'whatsapp_button_legacy',
    notas: `Confirmación/cancelación via WhatsApp (UUID directo, teléfono: ${fromPhone})`
  });

  console.log(`[Templates] Cita ${citaId} ${action === 'CONFIRMAR' ? 'confirmada' : 'cancelada'} (fallback UUID)`);

  if (action === 'CONFIRMAR') {
    return {
      success: true,
      message: '¡Tu cita ha sido confirmada! Te esperamos.',
      citaId
    };
  } else {
    return {
      success: true,
      message: 'Tu cita ha sido cancelada. Si cambias de opinión, agenda una nueva en nuestra web.',
      citaId
    };
  }
}

// =====================================================
// FUNCIONES LEGACY (mantener compatibilidad temporal)
// =====================================================

/**
 * @deprecated Usar sendCitaReminderWithTokens en su lugar
 */
export async function sendCitaReminder(params: {
  citaId: string;
  sucursalId: string;
  clienteTelefono: string;
  clienteNombre: string;
  sedeName: string;
  hora: string;
  barberoNombre: string;
}): Promise<SendMessageResponse> {
  console.warn('[Templates] sendCitaReminder está deprecado, usar sendCitaReminderWithTokens');
  // Esta función ya no debe usarse en producción
  return { success: false, error: 'Usar sendCitaReminderWithTokens' };
}

/**
 * @deprecated Usar processActionToken en su lugar
 */
export async function processCitaButtonResponse(params: {
  action: 'CONFIRMAR_CITA' | 'CANCELAR_CITA';
  citaId: string;
  sucursalId: string;
  fromPhone: string;
}): Promise<{ success: boolean; message: string }> {
  console.warn('[Templates] processCitaButtonResponse está deprecado');
  return { success: false, message: 'Formato de payload no soportado' };
}
