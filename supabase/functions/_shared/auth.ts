// =====================================================
// Autorización de funciones que envían mensajes a nombre de la barbería.
// Solo aceptan llamadas de:
//  - el equipo con sesión en la app (admin, admin de sede, barbero, aseo)
//  - las tareas programadas, con el encabezado x-cron-secret
//  - el propio servidor (service role)
// La clave pública de la página NO alcanza.
// =====================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ROLES_EQUIPO = ['admin', 'admin_sede', 'barbero', 'aseo'];

function igualSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function esLlamadaDeLaApp(req: Request, roles: string[] = ROLES_EQUIPO): Promise<boolean> {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !serviceKey) return false;
  const sb = createClient(url, serviceKey);

  // Tareas programadas: la clave vive en la bóveda de la base de datos
  const cronHeader = req.headers.get('x-cron-secret');
  if (cronHeader) {
    const { data: secreto } = await sb.rpc('_dn_cron_secret');
    if (typeof secreto === 'string' && secreto && igualSeguro(cronHeader, secreto)) return true;
  }

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  if (igualSeguro(token, serviceKey)) return true;

  // Usuario del equipo con sesión real (la clave pública no tiene usuario)
  const { data } = await sb.auth.getUser(token);
  if (!data?.user) return false;
  const { data: u } = await sb.from('usuarios').select('role').eq('id', data.user.id).maybeSingle();
  return !!u && roles.includes(u.role);
}

export function respuestaNoAutorizada(headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ success: false, error: 'No autorizado' }), {
    status: 401,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}
