// =====================================================
// Envía las notificaciones push encoladas en notificaciones_push.
// La llaman los triggers de la base de datos (pg_net + x-cron-secret).
// Body: { ids: number[] }  — sin ids reintenta las pendientes de los últimos 15 min.
// =====================================================

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { esLlamadaDeLaApp, respuestaNoAutorizada } from '../_shared/auth.ts';

const VAPID_PUBLICA = 'BGWko3b2HuZO7qAK1JvNLOSLi58C9ym9OdiL_VQ8gLzEHBApxI2guTrdfazwSoQvX0Mund1pbPU-N6MfUPJ62_0';
const VAPID_SUJETO = 'https://www.keicybarberclub.com';
const headers = { 'Content-Type': 'application/json' };

Deno.serve(async (req) => {
  // Solo tareas internas (triggers) o el servidor; ningún usuario la llama directo
  if (!(await esLlamadaDeLaApp(req, []))) return respuestaNoAutorizada();

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body?.ids) ? body.ids.filter(Number.isInteger).slice(0, 200) : [];

  let q = sb.from('notificaciones_push')
    .select('id, usuario_id, tipo, titulo, cuerpo, url, ref_id')
    .is('enviada_at', null)
    .order('id')
    .limit(100);
  q = ids.length ? q.in('id', ids) : q.gte('created_at', new Date(Date.now() - 15 * 60_000).toISOString());
  const { data: notifs, error } = await q;
  if (error) return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers });
  if (!notifs?.length) return new Response(JSON.stringify({ success: true, enviadas: 0 }), { headers });

  const { data: privada } = await sb.rpc('_dn_vapid_privada');
  if (!privada) return new Response(JSON.stringify({ success: false, error: 'Falta dn_vapid_private' }), { status: 500, headers });
  webpush.setVapidDetails(VAPID_SUJETO, VAPID_PUBLICA, privada as string);

  const usuarios = [...new Set(notifs.map(n => n.usuario_id))];
  const { data: subs } = await sb.from('push_suscripciones')
    .select('id, usuario_id, endpoint, p256dh, auth')
    .in('usuario_id', usuarios);

  let enviadas = 0;
  for (const n of notifs) {
    const destinos = (subs || []).filter(s => s.usuario_id === n.usuario_id);
    const payload = JSON.stringify({
      title: n.titulo,
      body: n.cuerpo || '',
      url: n.url || '/',
      tag: n.tipo + (n.ref_id ? ':' + n.ref_id : ''),
      tipo: n.tipo
    });
    let ok = 0;
    const errores: string[] = [];
    for (const s of destinos) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 3600, urgency: n.tipo === 'cliente_llego' ? 'high' : 'normal' }
        );
        ok++;
        await sb.from('push_suscripciones').update({ ultimo_envio_ok_at: new Date().toISOString() }).eq('id', s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404/410: el navegador ya no tiene esa suscripción
        if (status === 404 || status === 410) {
          await sb.from('push_suscripciones').delete().eq('id', s.id);
        }
        errores.push(`${status || ''} ${(e as Error).message || e}`.trim().slice(0, 200));
      }
    }
    if (ok) enviadas++;
    await sb.from('notificaciones_push').update({
      enviada_at: new Date().toISOString(),
      dispositivos_ok: ok,
      error: errores.length ? errores.join(' | ').slice(0, 500) : (destinos.length ? null : 'Sin dispositivos')
    }).eq('id', n.id);
  }

  return new Response(JSON.stringify({ success: true, enviadas, total: notifs.length }), { headers });
});
