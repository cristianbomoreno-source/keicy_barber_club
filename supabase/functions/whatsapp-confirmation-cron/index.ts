// =====================================================
// WhatsApp Cloud API - Cron de Confirmaciones Programadas
//
// Tipos de confirmación:
// - "5pm": Citas de mañana 10:00-12:59 (enviado a las 5 PM)
// - "9am": Citas de hoy 14:00-19:59 (enviado a las 9 AM)
// - "immediate": Citas del mismo día (envío inmediato)
//
// SEGURIDAD: Solo llamado por pg_cron interno de Supabase
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  createSupabaseClient,
  generateActionToken
} from '../_shared/whatsapp/config.ts';
import { sendCitaConfirmacion } from '../_shared/whatsapp/templates.ts';

const responseHeaders = { 'Content-Type': 'application/json' };

interface ClaimedCita {
  cita_id: string;
  claim_id: string;
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

type ConfirmationType = '5pm' | '9am' | 'immediate';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('Not allowed', { status: 405 });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: responseHeaders
    });
  }

  // Leer tipo de confirmación
  let tipo: ConfirmationType = 'immediate';
  try {
    const body = await req.json();
    if (body.tipo && ['5pm', '9am', 'immediate'].includes(body.tipo)) {
      tipo = body.tipo;
    }
  } catch {
    // Por defecto: immediate
  }

  console.log(`[Confirmación] Iniciando tipo: ${tipo}`);

  const startTime = Date.now();
  const supabase = createSupabaseClient();
  const results = { tipo, claimed: 0, sent: 0, failed: 0, errors: [] as string[] };

  try {
    // =====================================================
    // PASO 1: Reclamar citas según el tipo
    // =====================================================
    let rpcName: string;
    switch (tipo) {
      case '5pm':
        rpcName = 'claim_citas_confirmacion_5pm';
        break;
      case '9am':
        rpcName = 'claim_citas_confirmacion_9am';
        break;
      default:
        rpcName = 'claim_citas_confirmacion_inmediata';
    }

    const { data: citas, error } = await supabase.rpc(rpcName, {
      max_citas: tipo === 'immediate' ? 10 : 50
    });

    if (error) {
      console.error(`[Confirmación] Error claim (${rpcName}):`, error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: responseHeaders
      });
    }

    if (!citas?.length) {
      console.log(`[Confirmación] Sin citas pendientes para ${tipo}`);
      return new Response(JSON.stringify({ success: true, message: 'Sin citas', results }), {
        status: 200,
        headers: responseHeaders
      });
    }

    results.claimed = citas.length;
    console.log(`[Confirmación] ${citas.length} citas reclamadas para ${tipo}`);

    // =====================================================
    // PASO 2: Procesar cada cita
    // =====================================================
    for (const cita of citas as ClaimedCita[]) {
      if (!cita.cliente_telefono) {
        await markFailed(supabase, cita.cita_id, cita.claim_id, 'Sin teléfono');
        results.failed++;
        continue;
      }

      if (!cita.whatsapp_phone_number_id) {
        await markFailed(supabase, cita.cita_id, cita.claim_id, 'Sede sin WhatsApp');
        results.failed++;
        continue;
      }

      // Generar tokens para los botones de confirmación/cancelación
      const confirmToken = generateActionToken();
      const cancelToken = generateActionToken();

      // =====================================================
      // PASO 3: Crear tokens ANTES de enviar a Meta
      // Usa función específica para confirmaciones (no recordatorios)
      // =====================================================
      const { data: tokensCreated } = await supabase.rpc('crear_action_tokens_confirmacion', {
        p_cita_id: cita.cita_id,
        p_claim_id: cita.claim_id,
        p_confirm_token: confirmToken,
        p_cancel_token: cancelToken,
        p_cliente_telefono: cita.cliente_telefono
      });

      if (!tokensCreated) {
        console.warn(`[Confirmación] Claim expirado para ${cita.cita_id}`);
        results.failed++;
        continue;
      }

      // =====================================================
      // PASO 4: Enviar mensaje de confirmación
      // =====================================================
      try {
        const sendResult = await sendCitaConfirmacion({
          citaId: cita.cita_id,
          sucursalId: cita.sucursal_id,
          clienteTelefono: cita.cliente_telefono,
          clienteNombre: cita.cliente_nombre,
          sedeName: cita.sucursal_nombre,
          fecha: cita.fecha,
          hora: cita.hora_inicio,
          barberoNombre: cita.barbero_nombre,
          confirmToken,
          cancelToken
        });

        if (sendResult.success && sendResult.messageId) {
          // =====================================================
          // PASO 5: Marcar confirmación enviada
          // =====================================================
          const { data: marked } = await supabase.rpc('marcar_confirmacion_enviada', {
            p_cita_id: cita.cita_id,
            p_claim_id: cita.claim_id,
            p_message_id: sendResult.messageId
          });

          if (marked) {
            console.log(`[Confirmación] Enviado (${tipo}): ${cita.cita_id} → ${cita.cliente_nombre}`);
            results.sent++;
          } else {
            console.warn(`[Confirmación] Claim inválido: ${cita.cita_id}`);
            results.failed++;
          }
        } else {
          await markFailed(supabase, cita.cita_id, cita.claim_id, sendResult.error || 'Error Meta');
          results.failed++;
          results.errors.push(`${cita.cita_id}: ${sendResult.error}`);
        }
      } catch (sendError) {
        const errorMsg = sendError instanceof Error ? sendError.message : 'Excepción';
        await markFailed(supabase, cita.cita_id, cita.claim_id, errorMsg);
        results.failed++;
        results.errors.push(`${cita.cita_id}: ${errorMsg}`);
      }

      // Rate limit: 100ms entre mensajes
      await new Promise(r => setTimeout(r, 100));
    }

    const endTime = Date.now();
    console.log(`[Confirmación] Fin ${tipo}. Enviados: ${results.sent}, Fallidos: ${results.failed}`);

    // Registrar en logs
    await supabase.rpc('registrar_cron_whatsapp', {
      p_tipo: tipo,
      p_citas_reclamadas: results.claimed,
      p_mensajes_enviados: results.sent,
      p_mensajes_fallidos: results.failed,
      p_errores: JSON.stringify(results.errors),
      p_duracion_ms: endTime - startTime,
      p_detalles: JSON.stringify({ success: true })
    });

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: responseHeaders
    });

  } catch (error) {
    const endTime = Date.now();
    console.error('[Confirmación] Error:', error);

    // Registrar error en logs
    await supabase.rpc('registrar_cron_whatsapp', {
      p_tipo: tipo,
      p_citas_reclamadas: results.claimed,
      p_mensajes_enviados: results.sent,
      p_mensajes_fallidos: results.failed,
      p_errores: JSON.stringify([error instanceof Error ? error.message : 'Error']),
      p_duracion_ms: endTime - startTime,
      p_detalles: JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error' })
    });

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Error',
      results
    }), {
      status: 500,
      headers: responseHeaders
    });
  }
});

async function markFailed(
  supabase: ReturnType<typeof createSupabaseClient>,
  citaId: string,
  claimId: string,
  error: string
): Promise<void> {
  try {
    await supabase.rpc('marcar_confirmacion_fallida', {
      p_cita_id: citaId,
      p_claim_id: claimId,
      p_error: error
    });
  } catch (e) {
    console.error(`[Confirmación] Error marcando fallo ${citaId}:`, e);
  }
}
