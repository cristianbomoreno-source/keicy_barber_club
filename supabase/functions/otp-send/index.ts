// =====================================================
// OTP Send - Edge Function para Club de Leales
// Keicy Barber Club
// =====================================================
//
// Esta función maneja el envío de códigos OTP por WhatsApp
// para la verificación de clientes en el Club de Leales.
//
// Endpoints:
// POST /otp-send { telefono: string } - Genera y envía OTP
// POST /otp-send/validate { telefono: string, codigo: string } - Valida OTP
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// CORS headers para permitir acceso desde el frontend
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const responseHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json'
};

// Crear cliente de Supabase con service_role
function createSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Formatear teléfono para WhatsApp (agregar código de país)
function formatPhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');

  if (cleaned.startsWith('3') && cleaned.length === 10) {
    cleaned = '57' + cleaned;
  }

  return cleaned;
}

// Enviar mensaje de texto por WhatsApp usando la configuración existente
async function sendWhatsAppOTP(to: string, codigo: string, nombreCliente: string): Promise<{ success: boolean; error?: string }> {
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');

  if (!accessToken || !phoneNumberId) {
    console.error('[OTP Send] Credenciales de WhatsApp no configuradas');
    return { success: false, error: 'WhatsApp no configurado' };
  }

  const formattedPhone = formatPhoneForWhatsApp(to);

  const messagePayload = {
    messaging_product: 'whatsapp',
    to: formattedPhone,
    type: 'text',
    text: {
      body: `Hola ${nombreCliente}! Tu código de verificación para Club de Leales Keicy Barber es: *${codigo}*

Este código expira en 5 minutos.

Si no solicitaste este código, ignora este mensaje.`
    }
  };

  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messagePayload)
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('[OTP Send] Error de WhatsApp API:', JSON.stringify(responseData));
      return {
        success: false,
        error: responseData.error?.message || 'Error enviando mensaje'
      };
    }

    console.log(`[OTP Send] Mensaje enviado a ${formattedPhone}, ID: ${responseData.messages?.[0]?.id}`);
    return { success: true };

  } catch (error) {
    console.error('[OTP Send] Error de red:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error de red'
    };
  }
}

interface SendOTPRequest {
  telefono: string;
}

interface ValidateOTPRequest {
  telefono: string;
  codigo: string;
}

serve(async (req) => {
  // Manejar preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: responseHeaders
    });
  }

  const url = new URL(req.url);
  const isValidate = url.pathname.endsWith('/validate');

  try {
    const supabase = createSupabaseClient();
    const body = await req.json();

    if (isValidate) {
      // ===== VALIDAR OTP =====
      const { telefono, codigo } = body as ValidateOTPRequest;

      if (!telefono || !codigo) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Teléfono y código son requeridos'
        }), {
          status: 400,
          headers: responseHeaders
        });
      }

      console.log(`[OTP Send] Validando código para ${telefono}`);

      // Usar la función RPC de la base de datos
      const { data: result, error } = await supabase.rpc('validar_otp', {
        p_telefono: telefono,
        p_codigo: codigo
      });

      if (error) {
        console.error('[OTP Send] Error validando OTP:', error);
        return new Response(JSON.stringify({
          success: false,
          error: 'Error validando código'
        }), {
          status: 500,
          headers: responseHeaders
        });
      }

      return new Response(JSON.stringify(result), {
        status: result.valido ? 200 : 400,
        headers: responseHeaders
      });

    } else {
      // ===== GENERAR Y ENVIAR OTP =====
      const { telefono } = body as SendOTPRequest;

      if (!telefono) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Teléfono es requerido'
        }), {
          status: 400,
          headers: responseHeaders
        });
      }

      console.log(`[OTP Send] Generando OTP para ${telefono}`);

      // Usar la función RPC que genera el código y hace validaciones
      const { data: otpResult, error } = await supabase.rpc('generar_otp', {
        p_telefono: telefono
      });

      if (error) {
        console.error('[OTP Send] Error generando OTP:', error);
        return new Response(JSON.stringify({
          success: false,
          error: 'Error generando código'
        }), {
          status: 500,
          headers: responseHeaders
        });
      }

      // La función RPC retorna { success, telefono, codigo, nombre, error }
      if (!otpResult.success) {
        return new Response(JSON.stringify({
          success: false,
          error: otpResult.error
        }), {
          status: 400,
          headers: responseHeaders
        });
      }

      // Enviar el código por WhatsApp
      const waResult = await sendWhatsAppOTP(
        otpResult.telefono,
        otpResult.codigo,
        otpResult.nombre || 'Cliente'
      );

      if (!waResult.success) {
        // Falló el envío de WhatsApp, pero el código ya está generado
        // Podríamos intentar un fallback o informar al usuario
        console.error('[OTP Send] Error enviando WhatsApp:', waResult.error);

        return new Response(JSON.stringify({
          success: false,
          error: 'No pudimos enviar el código por WhatsApp. Intenta de nuevo.'
        }), {
          status: 500,
          headers: responseHeaders
        });
      }

      // Todo exitoso
      return new Response(JSON.stringify({
        success: true,
        mensaje: 'Código enviado por WhatsApp',
        expires_in: otpResult.expires_in || 300,
        // No enviamos el código en la respuesta por seguridad
        // Solo para desarrollo/debug:
        // codigo: otpResult.codigo
      }), {
        status: 200,
        headers: responseHeaders
      });
    }

  } catch (error) {
    console.error('[OTP Send] Error inesperado:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Error interno del servidor'
    }), {
      status: 500,
      headers: responseHeaders
    });
  }
});
