// =====================================================
// Sincronización de Citas WeiBook → Supabase
// Se ejecuta cada minuto via pg_cron
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WEIBOOK_API = 'https://api.v2.reservation.weibook.co/v1/filter-reservation';
const WEIBOOK_KEY = 'diegoneirabarber';
const WEIBOOK_ZONE = 'America/Bogota';
const WEIBOOK_APP_SOURCE = 'console';
const WEIBOOK_VERSION_APP = '3.0';
// Cookie de sesión estática (no expira)
const WEIBOOK_SESSION = '%7B%22v%22%3A1%2C%22businessId%22%3A%2266803f4a7288190011d53ee6%22%2C%22branchLogin%22%3A%22true%22%2C%22role%22%3A%22admin%22%2C%22precision%22%3A0%2C%22locale%22%3A%22America%2FBogota%22%2C%22userId%22%3A%2265c22e29676dc10011ca6f0e%22%7D';

// Sedes de WeiBook (CORREGIDO - los IDs estaban invertidos)
const BRANCHES = [
  { id: '66803f4a7288190011d53ee8', name: 'Colina' },      // Dayron, Juan Diego, etc.
  { id: '66803f4a7288190011d53ee6', name: 'Calle 165' },   // Marlon, Ángel, etc.
];

// Sedes (corregido)
const SUCURSAL_COLINA = '97cb4114-3e57-4858-809e-7d96e482709f';
const SUCURSAL_CALLE165 = '4b1e04a6-9a1b-4cff-a116-916e07b97455';

// Cliente genérico para bloqueos y citas sin cliente
const CLIENTE_BLOQUEO_ID = 'ddb33d9f-c107-4816-9ef7-ad17b265a653';

// Mapeo de barberos WeiBook -> Supabase (nombre en minúsculas -> id barbero)
const BARBERO_MAP: Record<string, { id: string; sucursal: string }> = {
  // COLINA (10 barberos)
  'dayron': { id: 'de809c84-5b8c-4c7c-becc-59b5711bd31b', sucursal: SUCURSAL_COLINA },
  'dayron ardila': { id: 'de809c84-5b8c-4c7c-becc-59b5711bd31b', sucursal: SUCURSAL_COLINA },
  'camilo rodriguez': { id: 'e8296aef-2763-43d5-b06f-1f1106916a92', sucursal: SUCURSAL_COLINA },
  'camilo rodríguez': { id: 'e8296aef-2763-43d5-b06f-1f1106916a92', sucursal: SUCURSAL_COLINA },
  'roberto': { id: '3dcef93a-dfcc-41c1-9b39-fc8c84d000f5', sucursal: SUCURSAL_COLINA },
  'roberto lugo': { id: '3dcef93a-dfcc-41c1-9b39-fc8c84d000f5', sucursal: SUCURSAL_COLINA },
  'camilo merchan': { id: '85d3e609-d17d-4d1c-abfa-c60848ac9248', sucursal: SUCURSAL_COLINA },
  'camilo merchán': { id: '85d3e609-d17d-4d1c-abfa-c60848ac9248', sucursal: SUCURSAL_COLINA },
  'daniel': { id: '59c8882f-7376-4232-9a76-128678795d23', sucursal: SUCURSAL_COLINA },
  'daniel marroquín': { id: '59c8882f-7376-4232-9a76-128678795d23', sucursal: SUCURSAL_COLINA },
  'daniel marroquin': { id: '59c8882f-7376-4232-9a76-128678795d23', sucursal: SUCURSAL_COLINA },
  'carlos': { id: 'f880b0db-ab5a-4284-a854-1ead48b01da2', sucursal: SUCURSAL_COLINA },
  'carlos urrea': { id: 'f880b0db-ab5a-4284-a854-1ead48b01da2', sucursal: SUCURSAL_COLINA },
  'orlando': { id: 'bfaf33b8-8378-48d7-8bbb-2cfa3be12a06', sucursal: SUCURSAL_COLINA },
  'orlando rivera': { id: 'bfaf33b8-8378-48d7-8bbb-2cfa3be12a06', sucursal: SUCURSAL_COLINA },
  'cristian': { id: '2eee1082-ed87-4e83-96fb-eef068daa19e', sucursal: SUCURSAL_COLINA },
  'cristian moncaleano': { id: '2eee1082-ed87-4e83-96fb-eef068daa19e', sucursal: SUCURSAL_COLINA },
  'miguel': { id: '81f06b69-4783-467e-bc81-9eca07aad64a', sucursal: SUCURSAL_COLINA },
  'miguel trujillo': { id: '81f06b69-4783-467e-bc81-9eca07aad64a', sucursal: SUCURSAL_COLINA },
  'juan diego': { id: '5f4e6e5e-8238-4880-a846-3e350f8b4379', sucursal: SUCURSAL_COLINA },
  'juan diego quintero': { id: '5f4e6e5e-8238-4880-a846-3e350f8b4379', sucursal: SUCURSAL_COLINA },

  // CALLE 165 (6 barberos)
  'marlon': { id: '827e9a97-5ef2-432b-9b7a-86dba4ec8466', sucursal: SUCURSAL_CALLE165 },
  'marlon rodríguez': { id: '827e9a97-5ef2-432b-9b7a-86dba4ec8466', sucursal: SUCURSAL_CALLE165 },
  'marlon rodriguez': { id: '827e9a97-5ef2-432b-9b7a-86dba4ec8466', sucursal: SUCURSAL_CALLE165 },
  'ángel': { id: 'b8f7317e-9fcb-4410-9333-2ef690ddebfd', sucursal: SUCURSAL_CALLE165 },
  'angel': { id: 'b8f7317e-9fcb-4410-9333-2ef690ddebfd', sucursal: SUCURSAL_CALLE165 },
  'ángel carrasco': { id: 'b8f7317e-9fcb-4410-9333-2ef690ddebfd', sucursal: SUCURSAL_CALLE165 },
  'angel carrasco': { id: 'b8f7317e-9fcb-4410-9333-2ef690ddebfd', sucursal: SUCURSAL_CALLE165 },
  'david': { id: '75421122-8881-4b96-ba84-03f9dfc63d34', sucursal: SUCURSAL_CALLE165 },
  'david romero': { id: '75421122-8881-4b96-ba84-03f9dfc63d34', sucursal: SUCURSAL_CALLE165 },
  'jesus': { id: 'dce6ac9d-57fd-444e-b656-771a471f28ec', sucursal: SUCURSAL_CALLE165 },
  'jesus rodriguez': { id: 'dce6ac9d-57fd-444e-b656-771a471f28ec', sucursal: SUCURSAL_CALLE165 },
  'andi': { id: '48c6ec57-480d-4a69-8dba-376bf7fceda7', sucursal: SUCURSAL_CALLE165 },
  'andi cely': { id: '48c6ec57-480d-4a69-8dba-376bf7fceda7', sucursal: SUCURSAL_CALLE165 },
  'andrés cely': { id: '48c6ec57-480d-4a69-8dba-376bf7fceda7', sucursal: SUCURSAL_CALLE165 },
  'andres cely': { id: '48c6ec57-480d-4a69-8dba-376bf7fceda7', sucursal: SUCURSAL_CALLE165 },
  'smith': { id: '8e80ae74-60cd-426d-b670-94fd1501a74b', sucursal: SUCURSAL_CALLE165 },
  'smith molina': { id: '8e80ae74-60cd-426d-b670-94fd1501a74b', sucursal: SUCURSAL_CALLE165 },

  // Otros (sin sede específica o genéricos)
  'danny': { id: '277f7b56-09c3-4d07-b140-abc83628df54', sucursal: SUCURSAL_COLINA },
  'juan bermudez': { id: '27db3146-3a13-40fb-a483-d19b186a1c25', sucursal: SUCURSAL_COLINA },
  'dominique': { id: '1c2db400-c193-42e9-a6ce-361725965661', sucursal: SUCURSAL_COLINA },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responseHeaders = {
  'Content-Type': 'application/json',
  ...corsHeaders
};

interface WeibookReservation {
  _id: string;
  status: string;
  id_client?: {
    _id?: string;
    name?: string;
    telephone?: string;
    email?: string;
  };
  collaborator?: {
    name?: string;
  };
  date?: string;
  date_time_start_format?: string;
  services?: Array<{
    service_name?: string;
    min?: number;
    cost_service?: number;
  }>;
}

function createSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

function findBarbero(collaboratorName: string | undefined) {
  if (!collaboratorName) return null;
  // Limpiar nombre: quitar paréntesis (incluso sin cerrar), @menciones, y texto extra
  let name = collaboratorName.toLowerCase()
    .replace(/\(.*?\)?/g, '')      // Quitar paréntesis (con o sin cierre)
    .replace(/@\S+/g, '')          // Quitar @menciones
    .replace(/ig:/gi, '')          // Quitar "IG:"
    .replace(/\s+/g, ' ')          // Normalizar espacios
    .trim();

  // 1. Buscar coincidencia exacta
  if (BARBERO_MAP[name]) {
    return BARBERO_MAP[name];
  }

  // 2. Buscar coincidencia exacta con nombre completo
  for (const [key, value] of Object.entries(BARBERO_MAP)) {
    if (name === key) {
      return value;
    }
  }

  // 3. Buscar si el nombre contiene exactamente la clave (para nombres con apellido)
  for (const [key, value] of Object.entries(BARBERO_MAP)) {
    // Solo coincide si la clave tiene más de una palabra (nombre + apellido)
    if (key.includes(' ') && name.includes(key)) {
      return value;
    }
  }

  // 4. Buscar por nombre y apellido separados
  const nameParts = name.split(' ').filter(p => p.length > 0);
  if (nameParts.length >= 2) {
    const fullName = nameParts[0] + ' ' + nameParts[1];
    for (const [key, value] of Object.entries(BARBERO_MAP)) {
      if (key === fullName || fullName.includes(key) || key.includes(fullName)) {
        return value;
      }
    }
  }

  // 5. Buscar solo por primer nombre (último recurso)
  const firstName = nameParts[0];
  for (const [key, value] of Object.entries(BARBERO_MAP)) {
    // Solo si la clave es exactamente el primer nombre (sin apellido)
    if (key === firstName && !key.includes(' ')) {
      return value;
    }
  }

  return null;
}

async function fetchWeibookReservations(date: string, branchId: string, token: string): Promise<WeibookReservation[]> {
  try {
    const res = await fetch(WEIBOOK_API, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'app_source': WEIBOOK_APP_SOURCE,
        'authorization': token,
        'branch': branchId,
        'content-type': 'application/json',
        'cookie': `wb_session=${WEIBOOK_SESSION}`,
        'key': WEIBOOK_KEY,
        'origin': 'https://app.weibook.co',
        'referer': 'https://app.weibook.co/',
        'version_app': WEIBOOK_VERSION_APP,
        'zone': WEIBOOK_ZONE,
      },
      body: JSON.stringify({
        date: date + ' 00:00:00',
        newCalendar: true,
        id_branch: branchId
      })
    });

    const data = await res.json();

    if (!res.ok || data.message) {
      console.error(`[Sync] Error ${res.status} para ${date} branch ${branchId}:`, data.message || 'Unknown error');
      return [];
    }

    console.log(`[Sync] ${date} branch ${branchId}: ${data.reservations?.length || 0} reservaciones`);
    return data.reservations || [];
  } catch (err) {
    console.error(`[Sync] Error fetch ${date}:`, err);
    return [];
  }
}

function getDatesToSync(daysAhead: number = 60): string[] {
  const dates: string[] = [];
  const today = new Date();

  // Sincronizar próximos N días (por defecto 60)
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }

  return dates;
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

  const WEIBOOK_TOKEN = Deno.env.get('WEIBOOK_AUTH_TOKEN');
  if (!WEIBOOK_TOKEN) {
    console.error('[Sync] WEIBOOK_AUTH_TOKEN no configurado');
    return new Response(JSON.stringify({ error: 'Token no configurado' }), {
      status: 500,
      headers: responseHeaders
    });
  }

  // Leer body para fecha específica
  let body: { fecha?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Body vacío o inválido, usar comportamiento por defecto
  }

  console.log('[Sync] Iniciando sincronización...');
  const supabase = createSupabaseClient();

  const results = {
    dates_processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    canceled: 0,
    errors: 0
  };

  // Si se envía fecha específica, solo sincronizar ese día
  // Si no, sincronizar próximos 60 días (para cron)
  const dates = body.fecha ? [body.fecha] : getDatesToSync(60);
  console.log(`[Sync] Procesando ${dates.length} día(s): ${dates.join(', ')}`);

  for (const date of dates) {
    results.dates_processed++;

    const allReservations: WeibookReservation[] = [];
    const canceledIds: string[] = [];

    // Obtener citas de ambas sedes
    for (const branch of BRANCHES) {
      const reservations = await fetchWeibookReservations(date, branch.id, WEIBOOK_TOKEN);

      for (const r of reservations) {
        // Detectar citas canceladas
        if (r.status === 'canceled' || r.status === 'cancelled') {
          canceledIds.push(r._id);
        } else if (r.status === 'blocking') {
          // Ignorar bloqueos de agenda - no importarlos
          continue;
        } else {
          // Solo citas con cliente
          allReservations.push(r);
        }
      }
    }

    // Eliminar duplicados
    const uniqueReservations = [...new Map(allReservations.map(r => [r._id, r])).values()];
    const weibookIds = uniqueReservations.map(r => r._id);

    // Cancelar citas que ya no existen o están canceladas en Weibook
    const { data: citasExistentes } = await supabase
      .from('citas')
      .select('id, notas')
      .eq('fecha', date)
      .eq('estado', 'agendada')
      .like('notas', 'WeiBook:%');

    if (citasExistentes && citasExistentes.length > 0) {
      for (const cita of citasExistentes) {
        const weibookId = cita.notas?.replace('WeiBook: ', '');
        if (weibookId && (!weibookIds.includes(weibookId) || canceledIds.includes(weibookId))) {
          await supabase
            .from('citas')
            .update({ estado: 'cancelada', sync_weibook_at: new Date().toISOString() })
            .eq('id', cita.id);
          results.canceled++;
        }
      }
    }

    if (uniqueReservations.length === 0) continue;

    console.log(`[Sync] ${date}: ${uniqueReservations.length} citas activas, ${canceledIds.length} canceladas`);

    for (const res of uniqueReservations) {
      try {
        const barberoInfo = findBarbero(res.collaborator?.name);
        if (!barberoInfo) {
          results.skipped++;
          continue;
        }

        // Parsear fecha y hora PRIMERO (antes de verificar si existe)
        // Weibook devuelve UTC, convertir a Bogotá (UTC-5)
        let fechaParsed: string = date;
        let horaInicioParsed: string = '10:00';
        let horaFinParsed: string = '11:00';
        if (res.date_time_start_format) {
          const d = new Date(res.date_time_start_format);
          let hours = d.getUTCHours() - 5; // Convertir UTC a Bogotá

          if (hours < 0) {
            // Si es negativo, es del día anterior en Bogotá
            hours += 24;
            const adjustedDate = new Date(d);
            adjustedDate.setUTCDate(adjustedDate.getUTCDate() - 1);
            fechaParsed = adjustedDate.toISOString().split('T')[0];
          } else {
            fechaParsed = d.toISOString().split('T')[0];
          }

          horaInicioParsed = String(hours).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
          const duracion = res.services?.[0]?.min || 60;
          const [h, m] = horaInicioParsed.split(':').map(Number);
          const finM = m + duracion;
          horaFinParsed = `${String(h + Math.floor(finM / 60)).padStart(2, '0')}:${String(finM % 60).padStart(2, '0')}`;
        }

        // Verificar si ya existe
        const { data: existing } = await supabase
          .from('citas')
          .select('id')
          .like('notas', `%${res._id}%`)
          .limit(1);

        if (existing && existing.length > 0) {
          // Actualizar barbero, sucursal, fecha Y HORA si cambió
          await supabase
            .from('citas')
            .update({
              barbero_id: barberoInfo.id,
              sucursal_id: barberoInfo.sucursal,
              fecha: fechaParsed,
              hora_inicio: horaInicioParsed,
              hora_fin: horaFinParsed,
              sync_weibook_at: new Date().toISOString()
            })
            .eq('id', existing[0].id);
          results.updated++;
          continue;
        }

        // Buscar o crear cliente (usar genérico para bloqueos/sin cliente)
        let clienteId: string | null = null;
        const isBlocking = res.status === 'blocking';
        const hasClient = res.id_client && res.id_client.name;

        if (!hasClient || isBlocking) {
          // Usar cliente genérico para bloqueos o citas sin cliente
          clienteId = CLIENTE_BLOQUEO_ID;
        } else {
          const clientPhone = res.id_client?.telephone?.replace(/\D/g, '') || null;
          const clientName = res.id_client?.name || 'Cliente WeiBook';

          if (clientPhone && clientPhone.length >= 7) {
            const { data: existingClient } = await supabase
              .from('usuarios')
              .select('id')
              .eq('phone', clientPhone)
              .limit(1);

            if (existingClient && existingClient.length > 0) {
              clienteId = existingClient[0].id;
            }
          }

          if (!clienteId) {
            const { data: byName } = await supabase
              .from('usuarios')
              .select('id')
              .eq('full_name', clientName)
              .eq('role', 'cliente')
              .limit(1);

            if (byName && byName.length > 0) {
              clienteId = byName[0].id;
            }
          }

          if (!clienteId) {
            // Crear cliente
            const username = clientPhone || `wb_${res._id.slice(-8)}`;
            const { data: newClient, error: createError } = await supabase
              .from('usuarios')
              .insert({
                username,
                phone: clientPhone,
                full_name: clientName,
                email: res.id_client?.email || null,
                role: 'cliente',
                origen: 'weibook'
              })
              .select('id')
              .single();

            if (createError) {
              // Buscar de nuevo por si ya existe
              const { data: retry } = await supabase
                .from('usuarios')
                .select('id')
                .eq('username', username)
                .limit(1);
              clienteId = retry?.[0]?.id || null;
            } else {
              clienteId = newClient?.id || null;
            }
          }

          if (!clienteId) {
            // Fallback al cliente genérico
            clienteId = CLIENTE_BLOQUEO_ID;
          }
        }

        // Usar fecha y hora ya parseadas al inicio del loop
        const fecha = fechaParsed;
        const horaInicio = horaInicioParsed;
        const horaFin = horaFinParsed;

        // Buscar servicio - si no hay match claro, dejar sin servicio para que el barbero defina
        const serviceName = res.services?.[0]?.service_name;
        let servicioId: string | null = null;
        let precio: number | null = null;

        if (serviceName) {
          const { data: servicios } = await supabase
            .from('servicios')
            .select('id, precio, nombre')
            .eq('activo', true)
            .ilike('nombre', `%${serviceName}%`)
            .limit(1);

          if (servicios && servicios.length > 0) {
            // Solo asignar si el nombre coincide razonablemente
            const svcNombre = servicios[0].nombre.toLowerCase();
            const weibookNombre = serviceName.toLowerCase();
            // Match exacto o el servicio contiene el nombre de WeiBook
            if (svcNombre === weibookNombre || svcNombre.includes(weibookNombre) || weibookNombre.includes(svcNombre)) {
              servicioId = servicios[0].id;
              precio = servicios[0].precio || null;
            }
            // Si no hay match claro, servicio_id y precio quedan null - el barbero define
          }
        }

        // Crear cita
        const { error: insertError } = await supabase
          .from('citas')
          .insert({
            fecha,
            hora_inicio: horaInicio,
            hora_fin: horaFin,
            cliente_id: clienteId,
            barbero_id: barberoInfo.id,
            servicio_id: servicioId,
            sucursal_id: barberoInfo.sucursal,
            precio,
            estado: 'agendada',
            notas: `WeiBook: ${res._id}`,
            sync_weibook_at: new Date().toISOString()
          });

        if (insertError) {
          console.error(`[Sync] Error insert:`, insertError.message);
          results.errors++;
        } else {
          results.created++;
        }

      } catch (err) {
        console.error(`[Sync] Error procesando:`, err);
        results.errors++;
      }
    }
  }

  console.log(`[Sync] Completado: ${results.created} creadas, ${results.updated} actualizadas, ${results.canceled} canceladas, ${results.skipped} omitidas, ${results.errors} errores`);

  return new Response(JSON.stringify({ success: true, results }), {
    status: 200,
    headers: responseHeaders
  });
});
