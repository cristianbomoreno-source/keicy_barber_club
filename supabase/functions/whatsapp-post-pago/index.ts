// =====================================================
// WhatsApp - Mensaje Post-Pago
// Envía mensaje de agradecimiento con link a recibo y reseña
//
// SEGURIDAD: Verifica que la cita existe y está pagada
// GRATIS: Dentro de las 24h de la confirmación del cliente
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { sendWhatsAppText, sendWhatsAppTemplate } from '../_shared/whatsapp/client.ts';
import { createSupabaseClient } from '../_shared/whatsapp/config.ts';
import { esLlamadaDeLaApp, respuestaNoAutorizada } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

interface PostPagoRequest {
  cita_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Solo la app (equipo con sesión), las tareas programadas o el servidor
  if (!(await esLlamadaDeLaApp(req))) {
    return respuestaNoAutorizada(corsHeaders);
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body: PostPagoRequest = await req.json();
    const { cita_id } = body;

    if (!cita_id) {
      return new Response(JSON.stringify({ error: 'cita_id requerido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createSupabaseClient();

    // Verificar si WhatsApp post-pago está activo
    const { data: config } = await supabase
      .from('configuracion_global')
      .select('value')
      .eq('key', 'whatsapp_post_pago_activo')
      .single();

    if (!config?.value) {
      console.log('[PostPago] WhatsApp post-pago está PAUSADO');
      return new Response(JSON.stringify({
        success: true,
        message: 'WhatsApp post-pago pausado por configuración'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Obtener datos de la cita
    const { data: cita, error: citaError } = await supabase
      .from('citas')
      .select(`
        id, precio, propina, barbero_id, sucursal_id, estado, pagada_at,
        usuarios!citas_cliente_id_fkey(full_name, username, phone),
        servicios(nombre)
      `)
      .eq('id', cita_id)
      .single();

    if (citaError || !cita) {
      console.error('[PostPago] Cita no encontrada:', citaError);
      return new Response(JSON.stringify({ error: 'Cita no encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verificar que la cita está pagada
    if (cita.estado !== 'pagada' && !cita.pagada_at) {
      console.warn('[PostPago] Cita no está pagada:', cita_id);
      return new Response(JSON.stringify({ error: 'Cita no pagada' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const clienteTelefono = cita.usuarios?.phone;
    if (!clienteTelefono) {
      console.log('[PostPago] Cliente sin teléfono');
      return new Response(JSON.stringify({ success: true, message: 'Cliente sin teléfono' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Obtener nombre del barbero
    let barberoNombre = 'tu barbero';
    if (cita.barbero_id) {
      const { data: barberoUser } = await supabase
        .from('usuarios')
        .select('full_name, username')
        .eq('id', cita.barbero_id)
        .single();

      if (barberoUser) {
        barberoNombre = barberoUser.full_name || barberoUser.username || 'tu barbero';
      }
    }

    const clienteNombre = cita.usuarios?.full_name || cita.usuarios?.username || '';
    const primerNombre = clienteNombre.split(' ')[0] || 'Cliente';
    const total = (Number(cita.precio) || 0) + (Number(cita.propina) || 0);
    const totalFormatted = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(total);

    // Generar URLs cortas
    const baseUrl = 'https://www.keicybarberclub.com';
    let reciboUrl = `${baseUrl}/recibo/?c=${cita_id}`;
    let resenaUrl = `${baseUrl}/resena/?c=${cita_id}` + (cita.barbero_id ? `&b=${cita.barbero_id}` : '');

    // Intentar crear códigos cortos
    try {
      const { data: shortCodes, error: shortError } = await supabase
        .rpc('crear_short_urls_cita', {
          p_cita_id: cita_id,
          p_barbero_id: cita.barbero_id || null
        });

      if (!shortError && shortCodes) {
        if (shortCodes.recibo) {
          reciboUrl = `${baseUrl}/r/${shortCodes.recibo}`;
        }
        if (shortCodes.resena) {
          resenaUrl = `${baseUrl}/s/${shortCodes.resena}`;
        }
        console.log('[PostPago] URLs cortas generadas:', shortCodes);
      } else if (shortError) {
        console.warn('[PostPago] Error generando URLs cortas, usando URLs largas:', shortError);
      }
    } catch (shortUrlErr) {
      console.warn('[PostPago] Excepción generando URLs cortas:', shortUrlErr);
    }

    // Construir mensaje
    const mensaje = `¡Gracias por tu visita, ${primerNombre}! 💈

Tu pago de ${totalFormatted} ha sido registrado.

📋 Ver tu recibo:
${reciboUrl}

⭐ Califica a ${barberoNombre}:
${resenaUrl}

¡Te esperamos pronto! De corazón esperamos hayas tenido una muy buena experiencia 🫵🏻❤️`;

    console.log(`[PostPago] Enviando mensaje a ${clienteTelefono}`);

    // Plantilla aprobada por Meta: llega aunque el cliente no haya escrito en las
    // últimas 24 horas (con texto libre fallaba con el error 131047). Los botones
    // abren el recibo y la reseña; la URL de la plantilla es la del sitio + este sufijo.
    const sufijo = (u: string) => u.replace(`${baseUrl}/`, '');
    let result = await sendWhatsAppTemplate({
      sucursalId: cita.sucursal_id,
      to: clienteTelefono,
      templateName: 'gracias_visita',
      languageCode: 'es',
      citaId: cita_id,
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: primerNombre },
            { type: 'text', text: totalFormatted },
            { type: 'text', text: barberoNombre }
          ]
        },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: sufijo(reciboUrl) }] },
        { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: sufijo(resenaUrl) }] }
      ]
    });

    // Si la plantilla todavía no está aprobada (o falla al enviarla), se usa el texto
    if (!result.success) {
      console.warn('[PostPago] Plantilla no disponible, se envía texto:', result.error);
      result = await sendWhatsAppText(
        cita.sucursal_id,
        clienteTelefono,
        mensaje,
        cita_id
      );
    }

    if (result.success) {
      console.log('[PostPago] Mensaje enviado:', result.messageId);
      return new Response(JSON.stringify({
        success: true,
        messageId: result.messageId
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      console.error('[PostPago] Error enviando mensaje:', result.error);
      return new Response(JSON.stringify({
        success: false,
        error: result.error
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('[PostPago] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Error interno'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
