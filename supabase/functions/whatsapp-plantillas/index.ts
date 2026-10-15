// =====================================================
// WhatsApp - Plantillas de Meta (solo admin)
// GET  → estado de las plantillas propias en cada cuenta (WABA) de las sedes
// POST { accion: 'crear', nombre: 'gracias_visita' } → la crea en cada cuenta
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { esLlamadaDeLaApp, respuestaNoAutorizada } from '../_shared/auth.ts';

const GRAPH = 'https://graph.facebook.com/v21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

// Mensaje después de cobrar. Se envía como plantilla para que llegue aunque el
// cliente no haya escrito en las últimas 24 horas (error 131047 con texto libre).
const PLANTILLAS: Record<string, unknown> = {
  gracias_visita: {
    name: 'gracias_visita',
    language: 'es',
    category: 'UTILITY',
    allow_category_change: true,
    components: [
      {
        type: 'BODY',
        text: '¡Gracias por tu visita, {{1}}! 💈\n\nTu pago de {{2}} ha sido registrado. Con los botones de abajo puedes ver tu recibo y calificar la atención de {{3}}.\n\n¡Te esperamos pronto! De corazón esperamos hayas tenido una muy buena experiencia 🫵🏻❤️',
        example: { body_text: [['Juan', '$ 35.000', 'Cristian']] }
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
              { type: 'body', parameters: [{ type: 'text', text: 'Prueba' }, { type: 'text', text: '$ 35.000' }, { type: 'text', text: 'Keicy Barber Club' }] },
              { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'reservar/' }] },
              { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: 'reservar/' }] }
            ]
          }
        })
      });
      return json({ sede: sede.nombre, to, respuesta: await r.json() }, r.ok ? 200 : 400);
    }

    const plantilla = PLANTILLAS[body?.nombre] as { name: string; components: unknown[] } | undefined;
    if (!plantilla || !['crear', 'editar'].includes(body?.accion)) return json({ error: 'Plantilla desconocida' }, 400);

    // Editar: cambia el contenido de la plantilla ya creada (Meta la vuelve a revisar)
    if (body.accion === 'editar') {
      for (const [waba, sede] of cuentas) {
        const lista = await fetch(`${GRAPH}/${waba}/message_templates?name=${plantilla.name}&fields=id,name`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json());
        const id = lista?.data?.find((t: { name: string }) => t.name === plantilla.name)?.id;
        if (!id) { resultado[sede] = { error: 'No existe en esta cuenta' }; continue; }
        const r = await fetch(`${GRAPH}/${id}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ components: plantilla.components })
        });
        resultado[sede] = await r.json();
      }
      return json({ editada: resultado });
    }
    for (const [waba, sede] of cuentas) {
      const r = await fetch(`${GRAPH}/${waba}/message_templates`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(plantilla)
      });
      resultado[sede] = await r.json();
    }
    return json({ creada: resultado });
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
