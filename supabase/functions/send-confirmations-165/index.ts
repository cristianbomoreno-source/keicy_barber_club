import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const PHONE_NUMBER_ID_165 = '687040821167199';
const TEMPLATE_NAME = 'confirmacion_cita';
const HEADER_IMAGE_URL = 'https://keicybarberclub.com/assets/whatsapp-header.jpg';

const CITAS = [
  // 18:00
  { id: '75489762-78d3-4db0-b546-4da93c073e17', cliente: 'Ricardo', telefono: '573183380447', barbero: 'David Romero', hora: '6:00 PM' },
  { id: '4993c659-7781-41cd-8fcd-0b5321470e5b', cliente: 'Nicolás', telefono: '573193771991', barbero: 'Andrés Cely', hora: '6:00 PM' },
  { id: '441cd5ca-2020-4160-9e83-ddf55215b403', cliente: 'Alexander', telefono: '573160831712', barbero: 'Jesus Rodriguez', hora: '6:00 PM' },
  // 19:00
  { id: '657be4d7-7e9a-4018-830f-5f37042ae556', cliente: 'Andres', telefono: '573004388430', barbero: 'Andrés Cely', hora: '7:00 PM' },
  { id: '10118adc-83ba-4a86-8296-7dbfedef91d7', cliente: 'Julian', telefono: '573116651962', barbero: 'Marlon Rodríguez', hora: '7:00 PM' },
  { id: 'c2bbb0fb-b658-4879-bfc5-d22b220db248', cliente: 'Diana', telefono: '573105577230', barbero: 'David Romero', hora: '7:00 PM' },
  { id: 'd3a44d23-305c-4bd6-b270-2d9a74ceaff1', cliente: 'Marlon', telefono: '573178862837', barbero: 'Jesus Rodriguez', hora: '7:00 PM' },
  { id: 'd1b395ea-d4ab-4352-b4bf-f0cdd8e702e2', cliente: 'Ismael', telefono: '573027641394', barbero: 'Ángel Carrasco', hora: '7:00 PM' },
];

serve(async (req) => {
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');

  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'Token no configurado' }), { status: 500 });
  }

  const results = [];

  for (const cita of CITAS) {
    const payload = {
      messaging_product: 'whatsapp',
      to: cita.telefono,
      type: 'template',
      template: {
        name: TEMPLATE_NAME,
        language: { code: 'es' },
        components: [
          {
            type: 'header',
            parameters: [{ type: 'image', image: { link: HEADER_IMAGE_URL } }]
          },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: cita.cliente },
              { type: 'text', text: 'Keicy Barber Club' },
              { type: 'text', text: 'Hoy' },
              { type: 'text', text: '3 de octubre de 2026' },
              { type: 'text', text: cita.hora },
              { type: 'text', text: cita.barbero }
            ]
          },
          {
            type: 'button',
            sub_type: 'quick_reply',
            index: '0',
            parameters: [{ type: 'payload', payload: `CONFIRMAR:${cita.id}` }]
          },
          {
            type: 'button',
            sub_type: 'quick_reply',
            index: '1',
            parameters: [{ type: 'payload', payload: `CANCELAR:${cita.id}` }]
          }
        ]
      }
    };

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID_165}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    const result = await response.json();
    results.push({
      cliente: cita.cliente,
      telefono: cita.telefono,
      hora: cita.hora,
      status: result.messages ? 'enviado' : 'error',
      result
    });
  }

  return new Response(JSON.stringify({
    mensaje: 'Confirmaciones enviadas desde Calle 165',
    total: results.length,
    results
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
});
