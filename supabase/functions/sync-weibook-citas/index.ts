// =====================================================
// Sincronización de Citas WeiBook → Supabase
// Se ejecuta cada minuto via pg_cron
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { esLlamadaDeLaApp, respuestaNoAutorizada } from '../_shared/auth.ts';

const WEIBOOK_API = 'https://api.v2.reservation.weibook.co/v1/filter-reservation';
const WEIBOOK_KEY = 'keicy_barber_club';
const WEIBOOK_ZONE = 'America/Bogota';
const WEIBOOK_APP_SOURCE = 'console';
const WEIBOOK_VERSION_APP = '3.0';
// Business ID de Keicy Barber Club
const WEIBOOK_BUSINESS_ID = '684f0086aecdcd001151dd48';

// Sede única de Keicy (La Flora, Cali)
// Usa el business ID como branch ya que solo hay una sede
const BRANCHES = [
  { id: '684f0086aecdcd001151dd48', name: 'La Flora' },
];

// Sede en Supabase
const SUCURSAL_LAFLORA = '46c99064-8218-41a0-a8c7-a81103f658fa';

// Cliente genérico para bloqueos y citas sin cliente
const CLIENTE_BLOQUEO_ID = 'aa9aa773-0d1f-4b9d-8d8f-a67e57f87853';

// Mapeo de barberos WeiBook -> Supabase (nombre en minúsculas -> id barbero)
const BARBERO_MAP: Record<string, { id: string; sucursal: string }> = {
  // Danny Uribe - WeiBook ID: 694f0c71ee13c0000d93b128
  'danny uribe': { id: '0efc1e44-45ff-4a2a-9682-7015a365b139', sucursal: SUCURSAL_LAFLORA },
  'danny': { id: '0efc1e44-45ff-4a2a-9682-7015a365b139', sucursal: SUCURSAL_LAFLORA },

  // Daniel Rojas - WeiBook ID: 68519630cd06e20011fac0b5
  'daniel rojas': { id: '6f805d41-35aa-45d4-862a-d584257a3dab', sucursal: SUCURSAL_LAFLORA },
  'daniel': { id: '6f805d41-35aa-45d4-862a-d584257a3dab', sucursal: SUCURSAL_LAFLORA },

  // Jorge Ivan Atoy - WeiBook ID: 6ac018611c3bf2b85ba165a6
  'jorge ivan atoy': { id: '646fb723-f182-4772-8f11-394301ddf4ac', sucursal: SUCURSAL_LAFLORA },
  'jorge': { id: '646fb723-f182-4772-8f11-394301ddf4ac', sucursal: SUCURSAL_LAFLORA },

  // Gabriel Ruiz Ruiz - WeiBook ID: 684f00c7aecdcd001151e0b2
  'gabriel ruiz ruiz': { id: '5814037c-2fc3-466d-902f-cc9b3773a380', sucursal: SUCURSAL_LAFLORA },
  'gabriel ruiz': { id: '5814037c-2fc3-466d-902f-cc9b3773a380', sucursal: SUCURSAL_LAFLORA },
  'gabriel': { id: '5814037c-2fc3-466d-902f-cc9b3773a380', sucursal: SUCURSAL_LAFLORA },

  // Nicolás Castillo - WeiBook ID: 69bc3622c7a39a000dfe65cd
  'nicolás castillo': { id: '2e531658-2f3a-41a3-90e3-047721c16d48', sucursal: SUCURSAL_LAFLORA },
  'nicolas castillo': { id: '2e531658-2f3a-41a3-90e3-047721c16d48', sucursal: SUCURSAL_LAFLORA },
  'nicolás': { id: '2e531658-2f3a-41a3-90e3-047721c16d48', sucursal: SUCURSAL_LAFLORA },
  'nicolas': { id: '2e531658-2f3a-41a3-90e3-047721c16d48', sucursal: SUCURSAL_LAFLORA },
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

interface Servicio {
  id: string;
  nombre: string;
  precio: number | null;
}

// Nombre en WeiBook -> nombre en el catálogo, cuando no son iguales
const SERVICIO_ALIAS: Record<string, string> = {};

// Compara sin tildes, mayúsculas ni signos
function normalizarNombre(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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

async function fetchWeibookReservations(date: string, branchId: string, token: string): Promise<WeibookReservation[] | null> {
  try {
    const res = await fetch(WEIBOOK_API, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'app_source': WEIBOOK_APP_SOURCE,
        'authorization': token,
        'content-type': 'application/json',
        'key': WEIBOOK_KEY,
        'origin': 'https://app.weibook.co',
        'referer': 'https://app.weibook.co/',
        'version_app': WEIBOOK_VERSION_APP,
        'zone': WEIBOOK_ZONE,
      },
      body: JSON.stringify({
        date: date + ' 00:00:00',
        newCalendar: true
      })
    });

    const data = await res.json();

    if (!res.ok || data.message) {
      console.error(`[Sync] Error ${res.status} para ${date} branch ${branchId}:`, data.message || 'Unknown error');
      return null;
    }

    if (!Array.isArray(data.reservations)) {
      console.error(`[Sync] Respuesta sin reservaciones para ${date} branch ${branchId}`);
      return null;
    }

    console.log(`[Sync] ${date} branch ${branchId}: ${data.reservations.length} reservaciones`);
    return data.reservations;
  } catch (err) {
    console.error(`[Sync] Error fetch ${date}:`, err);
    return null;
  }
}

function getDatesToSync(daysAhead: number = 60): string[] {
  const dates: string[] = [];
  // Hoy en Bogotá: desde las 7 p. m. la fecha UTC ya es mañana
  const today = new Date(Date.now() - 5 * 60 * 60 * 1000);

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

  // Solo la app (equipo con sesión), las tareas programadas o el servidor
  if (!(await esLlamadaDeLaApp(req))) {
    return respuestaNoAutorizada(corsHeaders);
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

  const { data: catalogo } = await supabase
    .from('servicios')
    .select('id, nombre, precio')
    .eq('activo', true);
  const serviciosPorNombre = new Map<string, Servicio>(
    (catalogo || []).map(s => [normalizarNombre(s.nombre), s])
  );
  const sinEquivalente = new Set<string>();
  const camposServicio = new Set<string>();

  const buscarServicio = (nombre: string | undefined): Servicio | null => {
    if (!nombre) return null;
    const clave = normalizarNombre(nombre);
    const servicio = serviciosPorNombre.get(normalizarNombre(SERVICIO_ALIAS[clave] || clave));
    if (!servicio) sinEquivalente.add(nombre);
    return servicio || null;
  };

  // Primer servicio como principal; el resto, como adicionales de la cita
  const leerServicios = (res: WeibookReservation) => {
    const [principal, ...resto] = res.services || [];
    Object.keys(principal || {}).forEach(k => camposServicio.add(k));
    const adicionales = resto.map(s => {
      const encontrado = buscarServicio(s.service_name);
      return { nombre: encontrado?.nombre || s.service_name, precio: encontrado?.precio ?? s.cost_service ?? 0 };
    }).filter(s => s.nombre);
    return { servicio: buscarServicio(principal?.service_name), adicionales };
  };

  console.log(`[Sync] Procesando ${dates.length} día(s): ${dates.join(', ')}`);

  for (const date of dates) {
    results.dates_processed++;

    const allReservations: WeibookReservation[] = [];
    const canceledIds: string[] = [];
    let consultaFallida = false;

    // Obtener citas de ambas sedes
    for (const branch of BRANCHES) {
      const reservations = await fetchWeibookReservations(date, branch.id, WEIBOOK_TOKEN);
      if (!reservations) {
        consultaFallida = true;
        break;
      }

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

    // Sin respuesta de WeiBook no se sabe qué citas existen: no tocar ese día
    if (consultaFallida) {
      results.errors++;
      continue;
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
          .select('id, servicio_id, precio, servicios_adicionales')
          .like('notas', `%${res._id}%`)
          .limit(1);

        const { servicio, adicionales } = leerServicios(res);

        if (existing && existing.length > 0) {
          // Lo que el barbero ya definió en la cita no se pisa
          const cita = existing[0];
          const serviciosFaltantes: Record<string, unknown> = {};
          if (!cita.servicio_id && servicio) {
            serviciosFaltantes.servicio_id = servicio.id;
            if (cita.precio == null) serviciosFaltantes.precio = servicio.precio;
          }
          if (!cita.servicios_adicionales?.length && adicionales.length > 0) {
            serviciosFaltantes.servicios_adicionales = adicionales;
          }

          // Actualizar barbero, sucursal, fecha Y HORA si cambió
          await supabase
            .from('citas')
            .update({
              barbero_id: barberoInfo.id,
              sucursal_id: barberoInfo.sucursal,
              fecha: fechaParsed,
              hora_inicio: horaInicioParsed,
              hora_fin: horaFinParsed,
              ...serviciosFaltantes,
              sync_weibook_at: new Date().toISOString()
            })
            .eq('id', cita.id);
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

        // Crear cita
        const { error: insertError } = await supabase
          .from('citas')
          .insert({
            fecha,
            hora_inicio: horaInicio,
            hora_fin: horaFin,
            cliente_id: clienteId,
            barbero_id: barberoInfo.id,
            servicio_id: servicio?.id ?? null,
            sucursal_id: barberoInfo.sucursal,
            precio: servicio?.precio ?? null,
            servicios_adicionales: adicionales,
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

  if (camposServicio.size > 0) {
    console.log(`[Sync] Campos de servicio en WeiBook: ${[...camposServicio].join(', ')}`);
  }
  if (sinEquivalente.size > 0) {
    console.log(`[Sync] Servicios sin equivalente: ${[...sinEquivalente].join(' | ')}`);
  }

  console.log(`[Sync] Completado: ${results.created} creadas, ${results.updated} actualizadas, ${results.canceled} canceladas, ${results.skipped} omitidas, ${results.errors} errores`);

  return new Response(JSON.stringify({ success: true, results }), {
    status: 200,
    headers: responseHeaders
  });
});
