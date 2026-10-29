// =====================================================
// WhatsApp - Plantillas de Meta (solo admin)
// GET  → estado de las plantillas propias en cada cuenta (WABA) de las sedes
// POST { accion: 'crear', nombre: 'confirmacion' | 'recordatorio_cita' | 'gracias_visita' | 'todas' }
//      → la crea en cada cuenta, con el logo de Keicy como encabezado
// POST { accion: 'suscribir' } → apunta los eventos de cada cuenta al webhook de Keicy
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { esLlamadaDeLaApp, respuestaNoAutorizada } from '../_shared/auth.ts';
import { whatsappHabilitado } from '../_shared/whatsapp/config.ts';

const GRAPH = 'https://graph.facebook.com/v21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

const APP_ID = '910914185080805';
const LOGO_URL = 'https://www.keicybarberclub.com/assets/whatsapp-header-keicy.jpg';

// Encabezado de imagen con el logo de Keicy. Meta pide un "handle" de ejemplo,
// que se obtiene subiendo la imagen con la API de subida reanudable de la app.
const HEADER_LOGO = { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['__LOGO__'] } };

const BOTONES_CITA = {
  type: 'BUTTONS',
  buttons: [
    { type: 'QUICK_REPLY', text: 'Confirmar cita' },
    { type: 'QUICK_REPLY', text: 'Cancelar cita' }
  ]
};

const PLANTILLAS: Record<string, unknown> = {
  // Confirmación de cita (whatsapp-confirmation-cron)
  confirmacion: {
    name: 'confirmacion',
    language: 'es',
    category: 'UTILITY',
    components: [
      HEADER_LOGO,
      {
        type: 'BODY',
        text: 'Hola {{1}} 👋\nTe recordamos tu cita en *{{2}}*.\n\n📅 *{{3}}*, {{4}}\n🕐 *{{5}}*\n💈 Tu barbero será *{{6}}*\n\nPor favor confirma o cancela tu cita con los botones de abajo.',
        example: { body_text: [['Juan', 'Keicy Barber Club La Flora', 'Hoy', '28 de octubre de 2026', '3:00 PM', 'Carlos']] }
      },
      BOTONES_CITA
    ]
  },
  // Recordatorio unas horas antes (whatsapp-reminder-cron)
  recordatorio_cita: {
    name: 'recordatorio_cita',
    language: 'es',
    category: 'UTILITY',
    components: [
      HEADER_LOGO,
      {
        type: 'BODY',
        text: 'Hola {{1}} 👋\nTu cita en *{{2}}* es hoy a las *{{3}}* con *{{4}}*.\n\nPor favor confirma o cancela tu cita con los botones de abajo.',
        example: { body_text: [['Juan', 'Keicy Barber Club La Flora', '3:00 PM', 'Carlos']] }
      },
      BOTONES_CITA
    ]
  },
  // Mensaje después de cobrar. Se envía como plantilla para que llegue aunque el
  // cliente no haya escrito en las últimas 24 horas (error 131047 con texto libre).
  gracias_visita: {
    name: 'gracias_visita',
    language: 'es',
    category: 'UTILITY',
    components: [
      HEADER_LOGO,
      {
        type: 'BODY',
        text: '¡Gracias por tu visita, {{1}}! 💈\n\nTu pago de {{2}} ha sido registrado. Con los botones de abajo puedes ver tu recibo y calificar la atención de {{3}}.',
        example: { body_text: [['Juan', '$ 35.000', 'Carlos']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Ver recibo', url: 'https://www.keicybarberclub.com/{{1}}', example: ['https://www.keicybarberclub.com/r/AB12CD'] },
          { type: 'URL', text: 'Calificar', url: 'https://www.keicybarberclub.com/{{1}}', example: ['https://www.keicybarberclub.com/s/AB12CD'] }
        ]
      }
    ]
  }
};

// Sube el logo a Meta y devuelve el handle para el ejemplo del encabezado
async function subirLogo(token: string): Promise<string> {
  const img = new Uint8Array(await (await fetch(LOGO_URL)).arrayBuffer());
  const sesion = await fetch(`${GRAPH}/${APP_ID}/uploads?file_length=${img.length}&file_type=image/jpeg&access_token=${token}`, { method: 'POST' })
    .then(r => r.json());
  if (!sesion?.id) throw new Error('No se pudo abrir la subida: ' + JSON.stringify(sesion));
  const subida = await fetch(`${GRAPH}/${sesion.id}`, {
    method: 'POST',
    headers: { 'Authorization': `OAuth ${token}`, 'file_offset': '0' },
    body: img
  }).then(r => r.json());
  if (!subida?.h) throw new Error('No se pudo subir el logo: ' + JSON.stringify(subida));
  return subida.h;
}

function conLogo(plantilla: unknown, handle: string) {
  return JSON.parse(JSON.stringify(plantilla).replace('__LOGO__', handle));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!(await esLlamadaDeLaApp(req, ['admin']))) return respuestaNoAutorizada(corsHeaders);

  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  if (!token) return json({ error: 'WHATSAPP_ACCESS_TOKEN no configurado' }, 500);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: sedes } = await sb.from('sucursales').select('nombre, whatsapp_waba_id').not('whatsapp_waba_id', 'is', null);
  const cuentas = [...new Map((sedes || []).map(s => [s.whatsapp_waba_id, s.nombre])).entries()];

  const resultado: Record<string, unknown> = {};

  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));

    // Prueba: envía gracias_visita con datos de ejemplo a un número (desde la sede indicada)
    if (body?.accion === 'probar') {
      if (!(await whatsappHabilitado())) return json({ error: 'WhatsApp desactivado (app_config.whatsapp_enabled)' }, 409);
      const tel = String(body.telefono || '').replace(/\D/g, '');
      const to = tel.length === 10 ? '57' + tel : tel;
      const { data: sede } = await sb.from('sucursales').select('nombre, whatsapp_phone_number_id')
        .ilike('nombre', `%${body.sede || ''}%`).not('whatsapp_phone_number_id', 'is', null).limit(1).maybeSingle();
      if (!sede || to.length < 11) return json({ error: 'Sede o teléfono inválido' }, 400);
      const r = await fetch(`${GRAPH}/${sede.whatsapp_phone_number_id}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to, type: 'template',
          template: {
            name: 'gracias_visita', language: { code: 'es' },
            components: [
              { type: 'header', parameters: [{ type: 'image', image: { link: LOGO_URL } }] },
              { type: 'body', parameters: [{ type: 'text', text: 'Prueba' }, { type: 'text', text: '$ 35.000' }, { type: 'text', text: 'Keicy Barber Club' }] },
              { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'reservar/' }] },
              { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: 'reservar/' }] }
            ]
          }
        })
      });
      return json({ sede: sede.nombre, to, respuesta: await r.json() }, r.ok ? 200 : 400);
    }

    // Suscribe la app a cada cuenta (WABA) con el webhook de Keicy. La app de Meta es
    // compartida con Diego Neira, así que sin este override los eventos irían a su webhook.
    if (body?.accion === 'suscribir') {
      for (const [waba, sede] of cuentas) {
        resultado[sede] = await fetch(`${GRAPH}/${waba}/subscribed_apps`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            override_callback_uri: `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-webhook`,
            verify_token: Deno.env.get('WHATSAPP_VERIFY_TOKEN')
          })
        }).then(r => r.json());
      }
      return json({ suscrita: resultado });
    }

    const nombres = body?.nombre === 'todas' ? Object.keys(PLANTILLAS) : [body?.nombre];
    if (!nombres.every((n: string) => PLANTILLAS[n]) || !['crear', 'editar'].includes(body?.accion)) {
      return json({ error: 'Plantilla desconocida' }, 400);
    }
    const handle = await subirLogo(token);

    for (const nombre of nombres) {
      const plantilla = conLogo(PLANTILLAS[nombre], handle) as { name: string; components: unknown[] };
      const porCuenta: Record<string, unknown> = {};
      for (const [waba, sede] of cuentas) {
        if (body.accion === 'editar') {
          // Editar: cambia el contenido de la plantilla ya creada (Meta la vuelve a revisar)
          const lista = await fetch(`${GRAPH}/${waba}/message_templates?name=${plantilla.name}&fields=id,name`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }).then(r => r.json());
          const id = lista?.data?.find((t: { name: string }) => t.name === plantilla.name)?.id;
          if (!id) { porCuenta[sede] = { error: 'No existe en esta cuenta' }; continue; }
          porCuenta[sede] = await fetch(`${GRAPH}/${id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ components: plantilla.components })
          }).then(r => r.json());
          continue;
        }
        porCuenta[sede] = await fetch(`${GRAPH}/${waba}/message_templates`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(plantilla)
        }).then(r => r.json());
      }
      resultado[nombre] = porCuenta;
    }
    return json({ [body.accion === 'editar' ? 'editada' : 'creada']: resultado });
  }

  // GET ?info=numeros: número real de WhatsApp de cada sede según Meta
  if (new URL(req.url).searchParams.get('info') === 'numeros') {
    const { data: lineas } = await sb.from('sucursales').select('nombre, whatsapp_phone_number_id, whatsapp_phone_number')
      .not('whatsapp_phone_number_id', 'is', null);
    for (const l of lineas || []) {
      const r = await fetch(`${GRAPH}/${l.whatsapp_phone_number_id}?fields=display_phone_number,verified_name`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      resultado[l.nombre] = { en_base_de_datos: l.whatsapp_phone_number, segun_meta: await r.json() };
    }
    return json(resultado);
  }

  // GET: estado
  const nombre = new URL(req.url).searchParams.get('nombre') || 'gracias_visita';
  for (const [waba, sede] of cuentas) {
    const r = await fetch(`${GRAPH}/${waba}/message_templates?name=${encodeURIComponent(nombre)}&fields=name,status,category,language,rejected_reason`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    resultado[sede] = await r.json();
  }
  return json(resultado);
});
