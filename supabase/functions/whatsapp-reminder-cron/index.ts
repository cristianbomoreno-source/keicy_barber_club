// =====================================================
// WhatsApp Cloud API - Cron de Confirmaciones (INTERNO)
//
// Envía plantilla "confirmacion" 2 HORAS antes de la cita
//
// SEGURIDAD: Solo llamado por pg_cron interno de Supabase
// CONCURRENCIA: Claim atómico con FOR UPDATE SKIP LOCKED
// TOKENS: Se crean ANTES de enviar a Meta
// RETRY: Backoff exponencial (2, 4, 8 minutos)
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

  // Esta función solo es llamada por pg_cron interno de Supabase
  // La protección está en que pg_cron solo puede ser configurado por admins de la BD
  console.log('[Cron Reminder] Iniciando...');

  const startTime = Date.now();
  const supabase = createSupabaseClient();
  const results = { claimed: 0, sent: 0, failed: 0, errors: [] as string[] };

  // Leer parámetros del body (opcional, para envío manual)
  let minutosAntes = 120;
  let margenMinutos = 5;
  let maxCitas = 10;

  try {
    const body = await req.json();
    if (body.minutos_antes) minutosAntes = parseInt(body.minutos_antes);
    if (body.margen_minutos) margenMinutos = parseInt(body.margen_minutos);
    if (body.max_citas) maxCitas = parseInt(body.max_citas);
    console.log(`[Cron] Parámetros: minutos_antes=${minutosAntes}, margen=${margenMinutos}, max=${maxCitas}`);
  } catch {
    // Body vacío o inválido, usar valores por defecto
  }

  try {
    // =====================================================
    // PASO 1: Reclamar citas atómicamente
    // =====================================================
    const { data: citas, error } = await supabase.rpc('claim_citas_para_recordatorio', {
      minutos_antes: minutosAntes,
      margen_minutos: margenMinutos,
      max_citas: maxCitas,
      claim_timeout_minutes: 5
    });

    if (error) {
      console.error('[Cron] Error claim:', error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: responseHeaders
      });
    }

    if (!citas?.length) {
      console.log('[Cron] Sin citas pendientes');
      return new Response(JSON.stringify({ success: true, message: 'Sin citas', results }), {
        status: 200,
        headers: responseHeaders
      });
    }

    results.claimed = citas.length;
    console.log(`[Cron] ${citas.length} citas reclamadas`);

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

      // Generar tokens
      const confirmToken = generateActionToken();
      const cancelToken = generateActionToken();

      // =====================================================
      // PASO 3: Crear tokens ANTES de enviar a Meta
      // Si el envío falla, los tokens quedan revocados
      // =====================================================
      const { data: tokensCreated } = await supabase.rpc('crear_action_tokens_pendientes', {
        p_cita_id: cita.cita_id,
        p_claim_id: cita.claim_id,
        p_confirm_token: confirmToken,
        p_cancel_token: cancelToken,
        p_cliente_telefono: cita.cliente_telefono
      });

      if (!tokensCreated) {
        console.warn(`[Cron] Claim expirado para ${cita.cita_id}`);
        results.failed++;
        continue;
      }

      // =====================================================
      // PASO 4: Enviar a Meta
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
          // PASO 5: Marcar éxito + actualizar tokens con message_id
          // =====================================================
          const { data: marked } = await supabase.rpc('marcar_recordatorio_enviado', {
            p_cita_id: cita.cita_id,
            p_claim_id: cita.claim_id,
            p_message_id: sendResult.messageId
          });

          if (marked) {
            console.log(`[Cron] Enviado: ${cita.cita_id}`);
            results.sent++;
          } else {
            // Claim expiró durante el envío
            console.warn(`[Cron] Claim inválido: ${cita.cita_id}`);
            results.failed++;
          }
        } else {
          // =====================================================
          // PASO 6: Marcar fallo + revocar tokens + backoff
          // =====================================================
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

      // Rate limit
      await new Promise(r => setTimeout(r, 100));
    }

    const endTime = Date.now();
    console.log(`[Cron Reminder] Fin. Enviados: ${results.sent}, Fallidos: ${results.failed}`);

    // Registrar en logs
    await supabase.rpc('registrar_cron_whatsapp', {
      p_tipo: 'reminder',
      p_citas_reclamadas: results.claimed,
      p_mensajes_enviados: results.sent,
      p_mensajes_fallidos: results.failed,
      p_errores: JSON.stringify(results.errors),
      p_duracion_ms: endTime - startTime,
      p_detalles: JSON.stringify({ success: true, minutos_antes: minutosAntes })
    });

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: responseHeaders
    });

  } catch (error) {
    const endTime = Date.now();
    console.error('[Cron Reminder] Error:', error);

    // Registrar error en logs
    await supabase.rpc('registrar_cron_whatsapp', {
      p_tipo: 'reminder',
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
    await supabase.rpc('marcar_recordatorio_fallido', {
      p_cita_id: citaId,
      p_claim_id: claimId,
      p_error: error
    });
  } catch (e) {
    console.error(`[Cron] Error marcando fallo ${citaId}:`, e);
  }
}
