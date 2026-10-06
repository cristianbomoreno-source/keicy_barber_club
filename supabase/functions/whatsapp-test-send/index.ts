import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Configuración de sedes (Phone Number IDs de Meta)
// Colina: +57 321 948 1543 -> phone_number_id: 786659147873161
// Calle 165: +57 324 459 7361 -> phone_number_id: 687040821167199
const SEDES = {
  colina: {
    name: 'Colina',
    phoneNumberId: '786659147873161',
    displayPhone: '+57 321 948 1543'
  },
  calle165: {
    name: 'Calle 165',
    phoneNumberId: '687040821167199',
    displayPhone: '+57 324 459 7361'
  }
};

const TEMPLATE_CONFIRMACION = 'confirmacion';
const TEMPLATE_CONFIRMACION_165 = 'confirmacion_cita';
const HEADER_IMAGE_URL = 'https://diegoneirabarber.com/assets/whatsapp-header.jpg';

async function sendTemplateMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  sedeName: string
) {
  const today = new Date();
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const fechaCompleta = `${today.getDate()} de ${meses[today.getMonth()]} de ${today.getFullYear()}`;

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: TEMPLATE_CONFIRMACION,
      language: { code: 'es' },
      components: [
        {
          type: 'header',
          parameters: [
            { type: 'image', image: { link: HEADER_IMAGE_URL } }
          ]
        },
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Test' },
            { type: 'text', text: sedeName },
            { type: 'text', text: 'Hoy' },
            { type: 'text', text: fechaCompleta },
            { type: 'text', text: '3:00 PM' },
            { type: 'text', text: 'Diego Neira' }
          ]
        },
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: '0',
          parameters: [{ type: 'payload', payload: 'TEST_CONFIRMAR' }]
        },
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: '1',
          parameters: [{ type: 'payload', payload: 'TEST_CANCELAR' }]
        }
      ]
    }
  };

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  return response.json();
}

serve(async (req) => {
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  const destinatario = '573202107769';

  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'WHATSAPP_ACCESS_TOKEN no configurado' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const results: Record<string, unknown> = {};

  // Enviar desde Colina (tiene la plantilla "confirmacion" aprobada)
  results.colina = {
    from: `${SEDES.colina.name} (${SEDES.colina.displayPhone})`,
    to: destinatario,
    type: 'template',
    result: await sendTemplateMessage(
      SEDES.colina.phoneNumberId,
      accessToken,
      destinatario,
      SEDES.colina.name
    )
  };

  // Enviar desde Calle 165 (usa plantilla confirmacion_cita)
  const today165 = new Date();
  const meses165 = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const fechaCompleta165 = `${today165.getDate()} de ${meses165[today165.getMonth()]} de ${today165.getFullYear()}`;

  const payload165 = {
    messaging_product: 'whatsapp',
    to: destinatario,
    type: 'template',
    template: {
      name: TEMPLATE_CONFIRMACION_165,
      language: { code: 'es' },
      components: [
        {
          type: 'header',
          parameters: [
            { type: 'image', image: { link: HEADER_IMAGE_URL } }
          ]
        },
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Test' },
            { type: 'text', text: 'Diego Neira Barbería Calle 165' },
            { type: 'text', text: 'Hoy' },
            { type: 'text', text: fechaCompleta165 },
            { type: 'text', text: '3:00 PM' },
            { type: 'text', text: 'Diego Neira' }
          ]
        },
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: '0',
          parameters: [{ type: 'payload', payload: 'TEST_CONFIRMAR' }]
        },
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: '1',
          parameters: [{ type: 'payload', payload: 'TEST_CANCELAR' }]
        }
      ]
    }
  };

  const response165 = await fetch(
    `https://graph.facebook.com/v21.0/${SEDES.calle165.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload165)
    }
  );

  results.calle165 = {
    from: `${SEDES.calle165.name} (${SEDES.calle165.displayPhone})`,
    to: destinatario,
    type: 'template (confirmacion_cita)',
    result: await response165.json()
  };

  return new Response(JSON.stringify({
    mensaje: '🧪 Prueba de plantilla confirmación desde ambas sedes',
    timestamp: new Date().toISOString(),
    results
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
});
