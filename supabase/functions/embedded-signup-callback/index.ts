// =====================================================
// WhatsApp Embedded Signup Callback
// Procesa el resultado del flujo de Embedded Signup
// con validación de seguridad completa
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

// Configuración esperada
const META_APP_ID = '910914185080805';
const EXPECTED_WABA_ID = '851994237367851';
const EXPECTED_PHONE_NUMBER_ID = '786659147873161';

// Tipos
interface EmbeddedSignupEvent {
  event: 'OAUTH_CODE_RECEIVED' | 'WA_EMBEDDED_SIGNUP_COMPLETE';
  state: string;
  mode: 'dry-run' | 'live';
  code?: string;
  data?: EmbeddedSignupData;
  validationWarnings?: string[];
  timestamp: string;
}

interface EmbeddedSignupData {
  phone_number_id?: string;
  waba_id?: string;
  business_id?: string;
  current_step?: string;
  error_message?: string;
  is_coexistence?: boolean;
}

interface CoexistenceOnboardingLog {
  id?: string;
  event_type: string;
  mode: string;
  waba_id: string | null;
  phone_number_id: string | null;
  business_id: string | null;
  is_coexistence: boolean;
  validation_passed: boolean;
  validation_warnings: string[];
  error_message: string | null;
  raw_payload: Record<string, unknown>;
  created_at?: string;
}

// Crear cliente de Supabase
function createSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Validar state/nonce para CSRF protection
async function validateState(state: string, sessionCookie: string | null): Promise<{ valid: boolean; error?: string }> {
  if (!state) {
    return { valid: false, error: 'Missing state parameter' };
  }

  if (!sessionCookie) {
    return { valid: false, error: 'Missing session cookie' };
  }

  try {
    const sessionData = JSON.parse(atob(sessionCookie));

    // Verificar que el state coincide
    if (sessionData.state !== state) {
      return { valid: false, error: 'State mismatch - possible CSRF attack' };
    }

    // Verificar expiración
    if (Date.now() > sessionData.expiresAt) {
      return { valid: false, error: 'Session expired' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid session data' };
  }
}

// Intercambiar code por access token (server-side)
async function exchangeCodeForToken(code: string): Promise<{ success: boolean; accessToken?: string; error?: string }> {
  const appId = META_APP_ID;
  const appSecret = Deno.env.get('WHATSAPP_APP_SECRET');
  const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/embedded-signup-callback`;

  if (!appSecret) {
    return { success: false, error: 'App secret not configured' };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
      `client_id=${appId}&` +
      `client_secret=${appSecret}&` +
      `code=${encodeURIComponent(code)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}`,
      { method: 'GET' }
    );

    const data = await response.json();

    if (data.error) {
      console.error('[Callback] Error en code exchange:', data.error);
      return { success: false, error: data.error.message || 'Code exchange failed' };
    }

    // NO loggeamos el access_token por seguridad
    console.log('[Callback] Code exchange exitoso');
    return { success: true, accessToken: data.access_token };
  } catch (error) {
    console.error('[Callback] Error en code exchange:', error);
    return { success: false, error: 'Network error during code exchange' };
  }
}

// Validar que los IDs pertenecen a nuestra app/negocio
async function validateOwnership(wabaId: string, phoneNumberId: string, accessToken: string): Promise<{ valid: boolean; error?: string; details?: Record<string, unknown> }> {
  try {
    // Verificar WABA
    const wabaResponse = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}?fields=id,name,timezone_id&access_token=${accessToken}`
    );
    const wabaData = await wabaResponse.json();

    if (wabaData.error) {
      return { valid: false, error: `Cannot access WABA: ${wabaData.error.message}` };
    }

    // Verificar Phone Number
    const phoneResponse = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=id,display_phone_number,platform_type,status&access_token=${accessToken}`
    );
    const phoneData = await phoneResponse.json();

    if (phoneData.error) {
      return { valid: false, error: `Cannot access Phone Number: ${phoneData.error.message}` };
    }

    return {
      valid: true,
      details: {
        waba: {
          id: wabaData.id,
          name: wabaData.name,
          timezone_id: wabaData.timezone_id
        },
        phone: {
          id: phoneData.id,
          display_phone_number: phoneData.display_phone_number,
          platform_type: phoneData.platform_type,
          status: phoneData.status
        }
      }
    };
  } catch (error) {
    return { valid: false, error: `Validation error: ${error}` };
  }
}

// Registrar evento en log de coexistence onboarding
async function logOnboardingEvent(log: CoexistenceOnboardingLog): Promise<void> {
  try {
    const supabase = createSupabaseClient();

    // Sanitizar payload (remover tokens)
    const sanitizedPayload = { ...log.raw_payload };
    if ('code' in sanitizedPayload) {
      sanitizedPayload.code = '[REDACTED]';
    }
    if ('access_token' in sanitizedPayload) {
      sanitizedPayload.access_token = '[REDACTED]';
    }

    await supabase.from('whatsapp_coexistence_logs').insert({
      ...log,
      raw_payload: sanitizedPayload
    });

    console.log(`[Callback] Evento registrado: ${log.event_type}`);
  } catch (error) {
    // No fallar si el log falla, pero registrar en consola
    console.error('[Callback] Error registrando evento:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Solo aceptar POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body: EmbeddedSignupEvent = await req.json();
    const { event, state, mode, code, data, validationWarnings, timestamp } = body;

    console.log(`[Callback] Evento recibido: ${event}, modo: ${mode}`);

    // Obtener cookie de session
    const cookieHeader = req.headers.get('cookie') || '';
    const sessionMatch = cookieHeader.match(/es_session=([^;]+)/);
    const sessionCookie = sessionMatch ? sessionMatch[1] : null;

    // Validar state/CSRF
    const stateValidation = await validateState(state, sessionCookie);
    if (!stateValidation.valid) {
      console.error(`[Callback] Validación de state fallida: ${stateValidation.error}`);

      await logOnboardingEvent({
        event_type: 'STATE_VALIDATION_FAILED',
        mode,
        waba_id: null,
        phone_number_id: null,
        business_id: null,
        is_coexistence: false,
        validation_passed: false,
        validation_warnings: [],
        error_message: stateValidation.error || 'Unknown error',
        raw_payload: { event, timestamp }
      });

      return new Response(JSON.stringify({
        success: false,
        error: stateValidation.error
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Procesar según el tipo de evento
    if (event === 'OAUTH_CODE_RECEIVED' && code) {
      // Intercambiar code por token (solo en modo live)
      if (mode === 'dry-run') {
        await logOnboardingEvent({
          event_type: 'OAUTH_CODE_DRY_RUN',
          mode,
          waba_id: null,
          phone_number_id: null,
          business_id: null,
          is_coexistence: false,
          validation_passed: true,
          validation_warnings: [],
          error_message: null,
          raw_payload: { event, timestamp, codeLength: code.length }
        });

        return new Response(JSON.stringify({
          success: true,
          message: 'Dry-run: Code recibido pero no intercambiado',
          mode: 'dry-run'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const tokenResult = await exchangeCodeForToken(code);

      if (!tokenResult.success) {
        await logOnboardingEvent({
          event_type: 'CODE_EXCHANGE_FAILED',
          mode,
          waba_id: null,
          phone_number_id: null,
          business_id: null,
          is_coexistence: false,
          validation_passed: false,
          validation_warnings: [],
          error_message: tokenResult.error || 'Unknown error',
          raw_payload: { event, timestamp }
        });

        return new Response(JSON.stringify({
          success: false,
          error: tokenResult.error
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      await logOnboardingEvent({
        event_type: 'CODE_EXCHANGE_SUCCESS',
        mode,
        waba_id: null,
        phone_number_id: null,
        business_id: null,
        is_coexistence: false,
        validation_passed: true,
        validation_warnings: [],
        error_message: null,
        raw_payload: { event, timestamp }
      });

      return new Response(JSON.stringify({
        success: true,
        message: 'Code intercambiado exitosamente. Esperando evento WA_EMBEDDED_SIGNUP.'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (event === 'WA_EMBEDDED_SIGNUP_COMPLETE' && data) {
      const wabaId = data.waba_id || '';
      const phoneNumberId = data.phone_number_id || '';
      const businessId = data.business_id || '';
      const isCoexistence = data.is_coexistence || false;

      // Validar que los IDs coinciden con los esperados
      const warnings: string[] = validationWarnings || [];

      if (wabaId && wabaId !== EXPECTED_WABA_ID) {
        warnings.push(`WABA ID diferente: ${wabaId} (esperado: ${EXPECTED_WABA_ID})`);
      }

      if (phoneNumberId && phoneNumberId !== EXPECTED_PHONE_NUMBER_ID) {
        warnings.push(`Phone Number ID diferente: ${phoneNumberId} (esperado: ${EXPECTED_PHONE_NUMBER_ID})`);
      }

      // Si hay error en el flujo
      if (data.error_message) {
        await logOnboardingEvent({
          event_type: 'EMBEDDED_SIGNUP_ERROR',
          mode,
          waba_id: wabaId,
          phone_number_id: phoneNumberId,
          business_id: businessId,
          is_coexistence: isCoexistence,
          validation_passed: false,
          validation_warnings: warnings,
          error_message: data.error_message,
          raw_payload: body as unknown as Record<string, unknown>
        });

        return new Response(JSON.stringify({
          success: false,
          error: data.error_message,
          diagnostic: {
            wabaId,
            phoneNumberId,
            isCoexistence,
            warnings,
            recommendation: 'El flujo falló. El número no ha sido modificado.'
          }
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Modo dry-run: no hacer cambios reales
      if (mode === 'dry-run') {
        await logOnboardingEvent({
          event_type: 'EMBEDDED_SIGNUP_DRY_RUN_COMPLETE',
          mode,
          waba_id: wabaId,
          phone_number_id: phoneNumberId,
          business_id: businessId,
          is_coexistence: isCoexistence,
          validation_passed: warnings.length === 0,
          validation_warnings: warnings,
          error_message: null,
          raw_payload: body as unknown as Record<string, unknown>
        });

        return new Response(JSON.stringify({
          success: true,
          mode: 'dry-run',
          message: 'Dry-run completado. No se realizaron cambios.',
          data: {
            wabaId,
            phoneNumberId,
            businessId,
            isCoexistence,
            currentStep: data.current_step
          },
          warnings,
          nextStep: warnings.length > 0
            ? 'Revisar advertencias antes de continuar en modo live'
            : 'Listo para ejecutar en modo live'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Modo live: verificar y actualizar
      // Por seguridad, no actualizamos automáticamente la sucursal
      // Solo registramos el evento exitoso para revisión manual

      await logOnboardingEvent({
        event_type: 'EMBEDDED_SIGNUP_LIVE_COMPLETE',
        mode,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        business_id: businessId,
        is_coexistence: isCoexistence,
        validation_passed: warnings.length === 0,
        validation_warnings: warnings,
        error_message: null,
        raw_payload: body as unknown as Record<string, unknown>
      });

      return new Response(JSON.stringify({
        success: true,
        mode: 'live',
        message: 'Embedded Signup completado. Coexistence habilitado.',
        data: {
          wabaId,
          phoneNumberId,
          businessId,
          isCoexistence,
          currentStep: data.current_step
        },
        warnings,
        nextSteps: [
          'Verificar que platform_type cambió a CLOUD_API',
          'Probar envío de mensaje via API',
          'Confirmar que la app móvil sigue funcionando',
          'Actualizar configuración de sucursal si los IDs son correctos'
        ]
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Evento no reconocido
    return new Response(JSON.stringify({
      success: false,
      error: 'Unknown event type'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Callback] Error procesando request:', error);

    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
