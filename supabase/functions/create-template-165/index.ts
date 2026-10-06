import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const WABA_165 = '1062593775598096';

serve(async (req) => {
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');

  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'WHATSAPP_ACCESS_TOKEN no configurado' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Ver estado de plantillas
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${WABA_165}/message_templates?fields=name,status,language,category`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );

  const result = await response.json();

  return new Response(JSON.stringify({
    mensaje: 'Plantillas de Calle 165',
    templates: result
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
});
