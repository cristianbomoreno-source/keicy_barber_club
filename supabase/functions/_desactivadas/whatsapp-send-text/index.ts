// DESACTIVADA el 14-oct-2026: enviaba cualquier texto a cualquier número sin autenticación.
// Copia del código que estaba desplegado (versión 8), solo como referencia.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const WHATSAPP_API_VERSION = 'v18.0';
const WHATSAPP_API_BASE_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

function formatPhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('3') && cleaned.length === 10) {
    cleaned = '57' + cleaned;
  }
  return cleaned;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  }

  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');

  if (!accessToken || !phoneNumberId) {
    return new Response(JSON.stringify({ error: 'WhatsApp credentials not configured' }), { status: 500 });
  }

  try {
    const body = await req.json();
    const { telefono, mensaje } = body;

    const formattedPhone = formatPhoneForWhatsApp(telefono);

    const messagePayload = {
      messaging_product: 'whatsapp',
      to: formattedPhone,
      type: 'text',
      text: {
        body: mensaje
      }
    };

    const url = `${WHATSAPP_API_BASE_URL}/${phoneNumberId}/messages`;

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
      return new Response(JSON.stringify({ success: false, error: responseData.error?.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    return new Response(JSON.stringify({ success: true, messageId: responseData.messages?.[0]?.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
});
