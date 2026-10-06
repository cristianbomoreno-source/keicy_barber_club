// Shared Supabase client + lightweight session helpers.
// Prototype-stage: session is just a JSON blob in localStorage (no real
// Supabase Auth JWT yet). Good enough to know "who is looking at this page"
// across the different HTML files in this project.

// =====================================================
// ⚠️ CONFIGURAR ESTOS VALORES CON TU PROYECTO SUPABASE
// =====================================================
const SUPABASE_URL = 'https://TU_PROYECTO.supabase.co';  // Cambiar por URL de tu proyecto
const SUPABASE_KEY = 'TU_ANON_KEY_AQUI';  // Cambiar por tu anon key
console.log('[DN] Supabase KEY:', SUPABASE_KEY.substring(0, 20) + '...');

// Verificar que window.supabase esté disponible (puede tardar en cargar desde CDN)
let sb;
if (window.supabase) {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('[DN] Supabase client inicializado');
} else {
  console.warn('[DN] Esperando carga de Supabase CDN...');
  // Crear un proxy temporal que espera la inicialización
  let _sbReady = false;
  let _sbInstance = null;
  const _sbQueue = [];

  // Función para inicializar cuando esté listo
  const initSupabase = () => {
    if (window.supabase && !_sbReady) {
      _sbInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      _sbReady = true;
      console.log('[DN] Supabase client inicializado (delayed)');
    }
  };

  // Intentar cada 50ms hasta 5 segundos
  let attempts = 0;
  const checkInterval = setInterval(() => {
    attempts++;
    if (window.supabase) {
      clearInterval(checkInterval);
      initSupabase();
    } else if (attempts > 100) {
      clearInterval(checkInterval);
      console.error('[DN] ERROR: Supabase CDN no cargó después de 5 segundos');
    }
  }, 50);

  // Crear sb como objeto que delegará al cliente real cuando esté listo
  sb = new Proxy({}, {
    get(target, prop) {
      if (!_sbReady) initSupabase();
      if (_sbInstance) return _sbInstance[prop];
      console.error('[DN] Supabase aún no está listo');
      return undefined;
    }
  });
}
console.log('[DN] sb definido:', typeof sb);

// ============================================
// MODO DEBUG - Monitoreo de queries
// Activar: localStorage.setItem('DN_DEBUG', 'true')
// Ver stats: dnDebugStats()
// ============================================
const DN_DEBUG = localStorage.getItem('DN_DEBUG') === 'true';
const DN_QUERY_LOG = [];

if (DN_DEBUG) {
  const originalFrom = sb.from.bind(sb);
  sb.from = function(table) {
    const startTime = performance.now();
    const query = originalFrom(table);
    const originalSelect = query.select.bind(query);

    query.select = function(...args) {
      const result = originalSelect(...args);
      const originalThen = result.then?.bind(result);

      if (originalThen) {
        result.then = function(onFulfilled, onRejected) {
          return originalThen((response) => {
            const endTime = performance.now();
            const duration = (endTime - startTime).toFixed(2);
            const rowCount = response.data?.length || 0;
            const logEntry = {
              table,
              select: args[0] || '*',
              rows: rowCount,
              ms: duration,
              ts: new Date().toISOString(),
              page: window.location.pathname
            };
            DN_QUERY_LOG.push(logEntry);
            console.log(`%c[DN_DEBUG] ${table}`, 'color:#C8A05A;font-weight:bold',
              `→ ${rowCount} rows in ${duration}ms`, logEntry);
            if (onFulfilled) return onFulfilled(response);
            return response;
          }, onRejected);
        };
      }
      return result;
    };
    return query;
  };
  console.log('%c[DN_DEBUG] Modo debug ACTIVO - Monitoreando queries Supabase', 'color:#4CAF50;font-weight:bold');
}

// Ver estadísticas de queries
function dnDebugStats() {
  if (!DN_QUERY_LOG.length) {
    console.log('No hay queries registradas');
    return {};
  }
  const byTable = {};
  DN_QUERY_LOG.forEach(q => {
    if (!byTable[q.table]) byTable[q.table] = { count: 0, totalRows: 0, totalMs: 0 };
    byTable[q.table].count++;
    byTable[q.table].totalRows += q.rows;
    byTable[q.table].totalMs += parseFloat(q.ms);
  });
  console.table(byTable);
  return byTable;
}

const DN_SESSION_KEY = 'dn_session';

// Helpers para cookies (mejor persistencia en iOS PWA)
function dnSetCookie(name, value, days = 365) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function dnGetCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function dnDeleteCookie(name) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

function dnSaveSession(user) {
  // Limpiar avatar si es base64 (muy grande para almacenamiento)
  const cleanUser = { ...user };
  if (cleanUser.avatar_url && cleanUser.avatar_url.startsWith('data:')) {
    cleanUser.avatar_url = null;
  }

  const userJson = JSON.stringify(cleanUser);
  let saved = false;

  // 1. Intentar guardar en localStorage
  try {
    localStorage.setItem(DN_SESSION_KEY, userJson);
    console.log('[Session] Guardada en localStorage:', cleanUser.id);
    saved = true;
  } catch (e) {
    console.warn('[Session] localStorage lleno, limpiando caches...', e);
    // Limpiar caches y reintentar
    try {
      localStorage.removeItem('dn_img_cache');
      localStorage.removeItem('dn_data_cache');
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('dn_') && key !== 'dn_session' && key !== 'dn_sede_actual') {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      localStorage.setItem(DN_SESSION_KEY, userJson);
      console.log('[Session] Guardada en localStorage (después de limpiar):', cleanUser.id);
      saved = true;
    } catch (e2) {
      console.error('[Session] Error guardando en localStorage:', e2);
    }
  }

  // 2. También guardar en cookie como respaldo (mejor persistencia en iOS PWA)
  try {
    dnSetCookie(DN_SESSION_KEY, userJson, 365);
    console.log('[Session] Guardada en cookie como respaldo');
  } catch (e) {
    console.warn('[Session] Error guardando en cookie:', e);
  }

  // 3. Fallback: sessionStorage (menos persistente pero funciona)
  if (!saved) {
    try {
      sessionStorage.setItem(DN_SESSION_KEY, userJson);
      console.log('[Session] Guardada en sessionStorage como fallback:', cleanUser.id);
      saved = true;
    } catch (e3) {
      console.error('[Session] Error guardando en sessionStorage:', e3);
    }
  }

  return saved;
}

function dnGetSession() {
  // 1. Primero intentar localStorage
  try {
    const raw = localStorage.getItem(DN_SESSION_KEY);
    if (raw) {
      const session = JSON.parse(raw);
      if (session && session.id) {
        return session;
      }
    }
  } catch (e) {
    console.warn('[Session] Error leyendo localStorage:', e);
  }

  // 2. Fallback: intentar cookie (mejor persistencia en iOS PWA)
  try {
    const cookieRaw = dnGetCookie(DN_SESSION_KEY);
    if (cookieRaw) {
      const session = JSON.parse(cookieRaw);
      if (session && session.id) {
        console.log('[Session] Recuperada de cookie, restaurando localStorage');
        // Restaurar en localStorage para próximas lecturas
        try {
          localStorage.setItem(DN_SESSION_KEY, cookieRaw);
        } catch (e) {}
        return session;
      }
    }
  } catch (e) {
    console.warn('[Session] Error leyendo cookie:', e);
  }

  // 3. Fallback: intentar sessionStorage
  try {
    const raw = sessionStorage.getItem(DN_SESSION_KEY);
    if (raw) {
      const session = JSON.parse(raw);
      if (session && session.id) {
        console.log('[Session] Usando sessionStorage como fallback');
        return session;
      }
    }
  } catch (e) {
    console.warn('[Session] Error leyendo sessionStorage:', e);
  }

  return null;
}

function dnClearSession() {
  try {
    localStorage.removeItem(DN_SESSION_KEY);
  } catch (e) {}
  try {
    sessionStorage.removeItem(DN_SESSION_KEY);
  } catch (e) {}
  try {
    dnDeleteCookie(DN_SESSION_KEY);
  } catch (e) {}
}

function dnRequireSession(redirectTo) {
  const user = dnGetSession();
  if (!user) {
    window.location.href = redirectTo;
    return null;
  }
  return user;
}

// Requiere sesión y verifica que el rol sea uno de los permitidos
// Si el rol no está permitido, cierra sesión inmediatamente y redirige al login
function dnRequireRole(allowedRoles, redirectTo) {
  const user = dnGetSession();
  if (!user) {
    window.location.href = redirectTo;
    return null;
  }

  // Verificar rol
  if (!allowedRoles.includes(user.role)) {
    console.warn(`Acceso denegado: rol "${user.role}" no autorizado. Cerrando sesión.`);
    dnClearSession();
    alert('No tienes permiso para acceder a esta página. Tu sesión ha sido cerrada.');
    window.location.href = redirectTo;
    return null;
  }

  return user;
}

// Protección específica para páginas de admin (solo admin y admin_sede)
function dnRequireAdmin(redirectTo) {
  return dnRequireRole(['admin', 'admin_sede'], redirectTo || '../index.html');
}

// Protección específica para páginas de barbero
function dnRequireBarbero(redirectTo) {
  return dnRequireRole(['barbero'], redirectTo || '../index.html');
}

// Protección específica para páginas de cliente
function dnRequireCliente(redirectTo) {
  return dnRequireRole(['cliente'], redirectTo || '../index.html');
}

// Baraja un arreglo sin modificar el original (Fisher-Yates). Se usa, por ejemplo,
// para que el orden de los barberos en la reserva pública cambie cada vez que se carga.
function dnShuffle(arr) {
  const a = [...(arr || [])];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Distancia aproximada en km entre dos coordenadas (fórmula de Haversine).
// Se usa para mostrar "A x km de ti" en el selector de sede, cuando el navegador
// permite geolocalización y la sede tiene lat/lng configurados.
function dnDistanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function dnInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function dnFormatCOP(n) {
  const num = Number(n) || 0;
  return '$' + num.toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

function dnTodayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

/**
 * dnLocalDayRangeUTC - Devuelve rango UTC para un día local Colombia (UTC-5)
 * @param {string} dateISO - Fecha en formato YYYY-MM-DD (opcional, default: hoy)
 * @returns {{start: string, end: string}} - Timestamps UTC para inicio/fin del día local
 *
 * Ejemplo: Para 2026-08-07 Colombia:
 *   start: '2026-08-07T05:00:00Z' (00:00 Colombia = 05:00 UTC)
 *   end:   '2026-08-08T04:59:59Z' (23:59 Colombia = 04:59 UTC día siguiente)
 */
function dnLocalDayRangeUTC(dateISO) {
  const date = dateISO || dnTodayISO();
  // Colombia = UTC-5
  // 00:00 Colombia = 05:00 UTC mismo día
  // 23:59:59 Colombia = 04:59:59 UTC día siguiente
  const [year, month, day] = date.split('-').map(Number);

  // Inicio del día Colombia en UTC
  const startUTC = new Date(Date.UTC(year, month - 1, day, 5, 0, 0));

  // Fin del día Colombia en UTC (04:59:59 del día siguiente)
  const endUTC = new Date(Date.UTC(year, month - 1, day + 1, 4, 59, 59));

  return {
    start: startUTC.toISOString(),
    end: endUTC.toISOString()
  };
}

// ============================================
// CACHE DE IMÁGENES - Optimización de ancho de banda
// ============================================
const DN_IMG_CACHE_KEY = 'dn_img_cache';
const DN_IMG_CACHE_DURATION = 3600000; // 1 hora en ms

// Obtener URL cacheada o null
function dnGetCachedImage(key) {
  try {
    const cache = JSON.parse(sessionStorage.getItem(DN_IMG_CACHE_KEY) || '{}');
    const entry = cache[key];
    if (entry && Date.now() - entry.ts < DN_IMG_CACHE_DURATION) {
      return entry.url;
    }
  } catch {}
  return null;
}

// Guardar URL en cache
function dnCacheImage(key, url) {
  if (!url) return;
  try {
    const cache = JSON.parse(sessionStorage.getItem(DN_IMG_CACHE_KEY) || '{}');
    cache[key] = { url, ts: Date.now() };
    // Limpiar entradas viejas (max 50)
    const keys = Object.keys(cache);
    if (keys.length > 50) {
      const oldest = keys.sort((a, b) => cache[a].ts - cache[b].ts).slice(0, keys.length - 50);
      oldest.forEach(k => delete cache[k]);
    }
    sessionStorage.setItem(DN_IMG_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

// Cargar imagen con cache (para avatares)
function dnLoadImage(imgEl, url, cacheKey, fallbackFn) {
  if (!url) {
    if (fallbackFn) fallbackFn();
    return;
  }
  // Verificar cache
  const cached = cacheKey ? dnGetCachedImage(cacheKey) : null;
  if (cached) {
    imgEl.src = cached;
    imgEl.style.display = 'block';
    return;
  }
  // Cargar y cachear
  imgEl.onload = () => {
    if (cacheKey) dnCacheImage(cacheKey, url);
    imgEl.style.display = 'block';
  };
  imgEl.onerror = () => {
    if (fallbackFn) fallbackFn();
  };
  imgEl.src = url;
}

// ============================================
// CACHE DE DATOS - Para queries frecuentes
// ============================================
const DN_DATA_CACHE = {};
const DN_DATA_CACHE_TTL = {
  sucursales: 300000,      // 5 minutos
  servicios: 300000,       // 5 minutos
  categorias_servicio: 300000,
  barberos: 120000,        // 2 minutos
  metodos_pago: 600000,    // 10 minutos
  configuracion_negocio: 600000,
  default: 60000           // 1 minuto
};

// Obtener datos cacheados o ejecutar query
async function dnCachedQuery(cacheKey, queryFn, ttlOverride) {
  const now = Date.now();
  const cached = DN_DATA_CACHE[cacheKey];
  const ttl = ttlOverride || DN_DATA_CACHE_TTL[cacheKey.split(':')[0]] || DN_DATA_CACHE_TTL.default;

  if (cached && (now - cached.ts) < ttl) {
    if (DN_DEBUG) console.log(`%c[DN_CACHE] HIT: ${cacheKey}`, 'color:#4CAF50');
    return cached.data;
  }

  if (DN_DEBUG) console.log(`%c[DN_CACHE] MISS: ${cacheKey}`, 'color:#FF9800');
  const data = await queryFn();
  DN_DATA_CACHE[cacheKey] = { data, ts: now };
  return data;
}

// Invalidar cache específico
function dnInvalidateCache(keyPattern) {
  Object.keys(DN_DATA_CACHE).forEach(key => {
    if (key.startsWith(keyPattern)) {
      delete DN_DATA_CACHE[key];
      if (DN_DEBUG) console.log(`%c[DN_CACHE] INVALIDATED: ${key}`, 'color:#F44336');
    }
  });
}

// Limpiar todo el cache
function dnClearDataCache() {
  Object.keys(DN_DATA_CACHE).forEach(key => delete DN_DATA_CACHE[key]);
  if (DN_DEBUG) console.log('%c[DN_CACHE] ALL CLEARED', 'color:#F44336');
}

// ============================================
// AISLAMIENTO TEST - Funciones helper
// Permiten E2E en la misma DB sin contaminar datos reales
// ============================================

// Obtener IDs de sedes TEST (es_test=true) - para uso en queries de exclusión
async function dnGetSedesTestIds() {
  const cacheKey = 'sedes_test_ids';
  return dnCachedQuery(cacheKey, async () => {
    const { data, error } = await sb.from('sucursales').select('id').eq('es_test', true);
    if (error) {
      console.warn('Error obteniendo sedes TEST:', error);
      return [];
    }
    return (data || []).map(s => s.id);
  }, 60000); // Cache 1 minuto
}

// Verificar si una sede específica es TEST
async function dnIsSedeTest(sedeId) {
  if (!sedeId) return false;
  const testIds = await dnGetSedesTestIds();
  return testIds.includes(sedeId);
}

// Obtener filtro SQL para excluir sedes TEST en queries de citas
// Retorna array de IDs TEST o null si no hay ninguna
async function dnGetSedesTestFilter() {
  const testIds = await dnGetSedesTestIds();
  return testIds.length > 0 ? testIds : null;
}

// Funciones helper con cache automático
async function dnLoadServicios(sucursalId) {
  const cacheKey = `servicios:${sucursalId || 'all'}`;
  return dnCachedQuery(cacheKey, async () => {
    let query = sb.from('servicios').select('id, nombre, precio, duracion_min, categoria_id, foto_url, activo').eq('activo', true).order('orden');
    if (sucursalId) query = query.eq('sucursal_id', sucursalId);
    const { data, error } = await query;
    if (error) throw error;
    // Mapear duracion_min a duracion para compatibilidad
    return (data || []).map(s => ({ ...s, duracion: s.duracion_min }));
  });
}

async function dnLoadCategorias() {
  return dnCachedQuery('categorias_servicio:all', async () => {
    const { data, error } = await sb.from('categorias_servicio').select('id, nombre, orden').order('orden');
    if (error) throw error;
    return data || [];
  });
}

async function dnLoadBarberos(sucursalId, includeInactive) {
  const cacheKey = `barberos:${sucursalId || 'all'}:${includeInactive ? 'all' : 'active'}`;
  return dnCachedQuery(cacheKey, async () => {
    // barberos.id = usuarios.id (relación 1:1)
    let query = sb.from('barberos').select('id, puesto, especialidad, comision_pct, calificacion, orden, usuarios!barberos_id_fkey(id, username, full_name, avatar_url)').order('orden');
    if (sucursalId) query = query.eq('sucursal_id', sucursalId);
    if (!includeInactive) query = query.eq('activo', true);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  });
}

async function dnLoadMetodosPago() {
  return dnCachedQuery('metodos_pago:all', async () => {
    const { data, error } = await sb.from('metodos_pago').select('id, nombre, icono, activo').eq('activo', true).order('orden');
    if (error) throw error;
    return data || [];
  });
}

async function dnLoadConfiguracion() {
  return dnCachedQuery('configuracion_negocio:main', async () => {
    const { data, error } = await sb.from('configuracion_negocio').select('*').eq('id', true).maybeSingle();
    if (error) throw error;
    return data;
  });
}

// Lee un archivo de imagen subido por el usuario y lo devuelve como data URL
// (mismo patrón ya usado para fotos de barbero). maxMB limita el peso permitido.
// Lee un archivo de imagen subido por el usuario, lo redimensiona/comprime en el
// navegador (evita guardar fotos de varios MB como texto — eso es lo que rompió la
// carga de servicios cuando había 20+ fotos pesadas en una sola consulta) y lo
// devuelve como data URL JPEG. maxMB limita el peso del ARCHIVO ORIGINAL subido
// (antes de comprimir); maxDim limita el lado más largo de la imagen ya comprimida.
function dnReadImageAsDataURL(file, maxMB = 3, maxDim = 900) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('no-file')); return; }
    if (!file.type || !file.type.startsWith('image/')) { reject(new Error('not-image')); return; }
    if (file.size > maxMB * 1024 * 1024) { reject(new Error('too-large')); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = () => reject(new Error('not-image'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(reader.error || new Error('read-error'));
    reader.readAsDataURL(file);
  });
}

// ---- Supabase Storage helpers ----
// Buckets para diferentes tipos de imágenes
const DN_AVATAR_BUCKET = 'avatars';
const DN_PHOTOS_BUCKET = 'photos'; // Para servicios, productos, sedes

// Convierte un data URL (base64) a Blob para poder subirlo a Storage
function dnBase64ToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return new Blob([array], { type: mime });
}

// Sube una imagen a Storage y devuelve la URL pública
// Acepta File o data URL (base64)
async function dnUploadAvatar(userId, imageData) {
  if (!userId || !imageData) return null;

  let blob;
  if (typeof imageData === 'string' && imageData.startsWith('data:')) {
    blob = dnBase64ToBlob(imageData);
  } else if (imageData instanceof Blob || imageData instanceof File) {
    blob = imageData;
  } else {
    console.error('[dnUploadAvatar] Formato de imagen no válido');
    return null;
  }

  // Nombre único: {userId}_{timestamp}.webp (o .jpg si no es webp)
  const ext = blob.type.includes('webp') ? 'webp' : 'jpg';
  const fileName = `${userId}_${Date.now()}.${ext}`;

  // Subir a Storage
  const { data, error } = await sb.storage
    .from(DN_AVATAR_BUCKET)
    .upload(fileName, blob, {
      cacheControl: '3600',
      upsert: false,
      contentType: blob.type
    });

  if (error) {
    console.error('[dnUploadAvatar] Error subiendo:', error);
    // Si el error es por bucket no existe, dar instrucciones
    if (error.message?.includes('not found') || error.statusCode === 404) {
      console.error('[dnUploadAvatar] El bucket "avatars" no existe. Créalo en Supabase Dashboard > Storage.');
    }
    return null;
  }

  // Obtener URL pública
  const { data: urlData } = sb.storage.from(DN_AVATAR_BUCKET).getPublicUrl(data.path);
  return urlData?.publicUrl || null;
}

// Elimina un avatar anterior de Storage (para no acumular archivos)
async function dnDeleteOldAvatar(oldUrl) {
  if (!oldUrl || !oldUrl.includes(DN_AVATAR_BUCKET)) return;
  try {
    // Extraer el path del archivo de la URL
    const match = oldUrl.match(/avatars\/([^?]+)/);
    if (match?.[1]) {
      await sb.storage.from(DN_AVATAR_BUCKET).remove([match[1]]);
    }
  } catch (e) {
    console.warn('[dnDeleteOldAvatar]', e);
  }
}

// Migra un avatar de base64 a Storage
// Devuelve la nueva URL o null si falla
async function dnMigrateAvatarToStorage(userId, base64Url) {
  if (!base64Url || !base64Url.startsWith('data:')) return null;
  const newUrl = await dnUploadAvatar(userId, base64Url);
  if (newUrl) {
    // Actualizar en la tabla usuarios
    const { error } = await sb.from('usuarios').update({ avatar_url: newUrl }).eq('id', userId);
    if (error) {
      console.error('[dnMigrateAvatar] Error actualizando BD:', error);
      return null;
    }
  }
  return newUrl;
}

// Sube una imagen genérica a Storage (para servicios, productos, etc.)
// Devuelve la URL pública o null si falla
async function dnUploadPhoto(prefix, imageData) {
  if (!imageData) return null;

  let blob;
  if (typeof imageData === 'string' && imageData.startsWith('data:')) {
    blob = dnBase64ToBlob(imageData);
  } else if (imageData instanceof Blob || imageData instanceof File) {
    blob = imageData;
  } else {
    return null;
  }

  const ext = blob.type.includes('webp') ? 'webp' : 'jpg';
  const fileName = `${prefix}_${Date.now()}.${ext}`;

  const { data, error } = await sb.storage
    .from(DN_PHOTOS_BUCKET)
    .upload(fileName, blob, { cacheControl: '3600', upsert: false, contentType: blob.type });

  if (error) {
    console.error('[dnUploadPhoto] Error:', error);
    return null;
  }

  const { data: urlData } = sb.storage.from(DN_PHOTOS_BUCKET).getPublicUrl(data.path);
  return urlData?.publicUrl || null;
}

// ---- Sede (sucursal) actual ----
// El negocio puede tener varias sedes. Guardamos cuál está viendo el usuario
// en localStorage para que se recuerde al navegar entre pantallas del panel.
const DN_SEDE_KEY = 'dn_sede_actual';

function dnGetSedeActual() {
  return localStorage.getItem(DN_SEDE_KEY) || null;
}

function dnSetSedeActual(sucursalId) {
  localStorage.setItem(DN_SEDE_KEY, sucursalId);
}

// Trae todas las sucursales activas (o todas si includeInactive=true) y
// asegura que dnGetSedeActual() apunte a una sede válida, devolviendo la lista.
// IMPORTANTE: Excluye sedes TEST (es_test=true) por defecto para operación normal.
// OPTIMIZADO: Usa cache de 5 minutos para evitar queries repetidas.
async function dnLoadSucursales(includeInactive, includeTest = false) {
  const cacheKey = `sucursales:${includeInactive ? 'all' : 'active'}:${includeTest ? 'withTest' : 'noTest'}`;
  const sedes = await dnCachedQuery(cacheKey, async () => {
    let query = sb.from('sucursales').select('*').order('orden', { ascending: true });
    if (!includeInactive) query = query.eq('activa', true);
    if (!includeTest) query = query.eq('es_test', false);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  });
  const current = dnGetSedeActual();
  // Si current es null, significa "Todas las sedes" - no seleccionar automáticamente
  // Solo auto-seleccionar si current tiene un valor pero no es válido
  if (current && sedes.length && !sedes.find(s => s.id === current)) {
    const principal = sedes.find(s => s.principal) || sedes[0];
    dnSetSedeActual(principal.id);
  }
  return sedes;
}

// Igual que dnLoadSucursales, pero para la página pública de reservas: usa la vista
// "sucursales_publicas", que oculta (no rompe) cualquier foto guardada con un peso
// excesivo, en vez de forzar al navegador a descargar varios MB de una sola vez.
// OPTIMIZADO: Usa cache de 5 minutos.
async function dnLoadSucursalesPublico(includeInactive) {
  const cacheKey = `sucursales_publicas:${includeInactive ? 'all' : 'active'}`;
  const sedes = await dnCachedQuery(cacheKey, async () => {
    let query = sb.from('sucursales_publicas').select('*').order('orden', { ascending: true });
    if (!includeInactive) query = query.eq('activa', true);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  });
  const current = dnGetSedeActual();
  // Si current es null, significa "Todas las sedes" - no seleccionar automáticamente
  if (current && sedes.length && !sedes.find(s => s.id === current)) {
    const principal = sedes.find(s => s.principal) || sedes[0];
    dnSetSedeActual(principal.id);
  }
  return sedes;
}

// Inicializa la tarjeta de sede en la parte superior del sidebar (solo visible
// en modo expandido). Si el negocio tiene una sola sede activa, la tarjeta es
// meramente informativa. Si tiene varias, se convierte en un desplegable para
// cambiar de sede: al elegir una, se guarda con dnSetSedeActual() y se llama a
// onChange(sedeId) si se pasó una, o se recarga la página si no.
async function dnInitSidebarCard(onChange) {
  const card = document.getElementById('sidebarCard');
  if (!card) return;
  const nameEl = document.getElementById('sidebarCardName');
  const subEl = document.getElementById('sidebarCardSede');
  const chevronEl = document.getElementById('sidebarCardChevron');
  const menuEl = document.getElementById('sidebarCardMenu');
  try {
    const sedes = await dnLoadSucursales(false);
    const currentId = dnGetSedeActual();
    const current = currentId ? sedes.find(s => s.id === currentId) : null;
    if (subEl) subEl.textContent = current ? (current.direccion || current.nombre) : 'Todas las sedes';
    if (sedes.length <= 1) {
      if (chevronEl) chevronEl.style.display = 'none';
      card.style.cursor = 'default';
      return;
    }
    if (menuEl) {
      const currentId = dnGetSedeActual();
      const todasOption = `<div class="sidebar-card-menu-item${!currentId ? ' active' : ''}" data-id="">Todas las sedes</div>`;
      const sedeOptions = sedes.map(s => `<div class="sidebar-card-menu-item${s.id === currentId ? ' active' : ''}" data-id="${s.id}">${s.nombre}</div>`).join('');
      menuEl.innerHTML = todasOption + sedeOptions;
    }
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menuEl) menuEl.classList.toggle('show');
    });
    if (menuEl) {
      menuEl.querySelectorAll('.sidebar-card-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const sedeId = item.dataset.id;
          if (sedeId) {
            dnSetSedeActual(sedeId);
          } else {
            localStorage.removeItem('dn_sede_actual');
          }
          menuEl.classList.remove('show');
          if (typeof onChange === 'function') onChange(sedeId);
          else location.reload();
        });
      });
    }
    document.addEventListener('click', () => { if (menuEl) menuEl.classList.remove('show'); });
  } catch (err) {
    console.error(err);
  }
}

// ---- Admin Sede helpers ----
// Funciones específicas para el rol admin_sede que administra una sede específica

const DN_TURNO_SEDE_KEY = 'dn_turno_sede_actual';

// Verifica si el usuario logueado tiene rol admin_sede
function dnIsAdminSede() {
  const session = dnGetSession();
  return session && session.role === 'admin_sede';
}

// Verifica si el usuario logueado es admin general
function dnIsAdmin() {
  const session = dnGetSession();
  return session && session.role === 'admin';
}

// Obtiene la sede actual del turno del admin_sede (distinto de dn_sede_actual que es para admins generales)
function dnGetTurnoSedeActual() {
  const stored = localStorage.getItem(DN_TURNO_SEDE_KEY);
  if (!stored) return null;

  // Verificar si tiene formato nuevo (con fecha)
  try {
    const parsed = JSON.parse(stored);
    if (parsed && parsed.fecha && parsed.sedeId) {
      // Verificar si es del mismo día
      const today = dnTodayISO();
      if (parsed.fecha !== today) {
        // Es de otro día, limpiar y retornar null
        localStorage.removeItem(DN_TURNO_SEDE_KEY);
        return null;
      }
      return parsed.sedeId;
    }
  } catch (e) {
    // Formato antiguo (solo sedeId), migrar
    const sedeId = stored;
    dnSetTurnoSedeActual(sedeId);
    return sedeId;
  }

  return stored;
}

// Guarda la sede actual del turno del admin_sede (con fecha)
function dnSetTurnoSedeActual(sucursalId) {
  if (sucursalId) {
    const data = {
      sedeId: sucursalId,
      fecha: dnTodayISO()
    };
    localStorage.setItem(DN_TURNO_SEDE_KEY, JSON.stringify(data));
  } else {
    localStorage.removeItem(DN_TURNO_SEDE_KEY);
  }
}

// Limpia la sede del turno (al cerrar sesión o cerrar turno)
function dnClearTurnoSede() {
  localStorage.removeItem(DN_TURNO_SEDE_KEY);
}

// Obtiene las sedes asignadas al admin_sede actual (con cache de 2 min)
async function dnGetSedesAsignadas() {
  const session = dnGetSession();
  if (!session || session.role !== 'admin_sede') return [];

  const cacheKey = `sedes_asignadas:${session.id}`;

  return dnCachedQuery(cacheKey, async () => {
    const { data, error } = await sb
      .from('admin_sede_sedes_asignadas')
      .select('sucursal_id, sucursales!inner(id, nombre, direccion, foto_fachada, activa)')
      .eq('usuario_id', session.id)
      .eq('activo', true);

    if (error) {
      console.error('Error cargando sedes asignadas:', error);
      return [];
    }

    return (data || []).map(d => d.sucursales).filter(s => s && s.activa);
  }, 2 * 60 * 1000); // Cache de 2 minutos
}

// Verifica si hay un turno activo hoy para la sede seleccionada
async function dnVerificarTurnoActivo(sucursalId) {
  const session = dnGetSession();
  if (!session) return null;

  const hoy = dnTodayISO();

  const { data, error } = await sb
    .from('turnos_admin_sede')
    .select('*')
    .eq('sucursal_id', sucursalId)
    .eq('fecha', hoy)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
    console.error('Error verificando turno:', error);
    return null;
  }

  return data || null;
}

// Valida si el admin_sede puede entrar según el horario (>= hora_apertura_admin)
async function dnValidarHorarioEntrada(sucursalId) {
  // Obtener la hora de apertura configurada para la sede
  const { data: sede, error } = await sb
    .from('sucursales')
    .select('hora_apertura_admin')
    .eq('id', sucursalId)
    .single();

  if (error) {
    console.error('Error obteniendo hora apertura:', error);
    return { permitido: true, horaApertura: '09:00', horaActual: '' }; // Permitir por defecto si hay error
  }

  const horaApertura = sede?.hora_apertura_admin || '09:00:00';
  const ahora = new Date();
  const horaActual = ahora.toTimeString().slice(0, 5); // HH:MM
  const horaAperturaCorta = horaApertura.slice(0, 5); // HH:MM

  return {
    permitido: horaActual >= horaAperturaCorta,
    horaApertura: horaAperturaCorta,
    horaActual: horaActual
  };
}

// Verifica si hay una autorización de entrada anticipada aprobada para hoy
async function dnTieneAutorizacionEntrada(sucursalId) {
  const session = dnGetSession();
  if (!session) return false;

  const hoy = dnTodayISO();

  const { data, error } = await sb
    .from('autorizaciones_admin_sede')
    .select('id')
    .eq('solicitante_id', session.id)
    .eq('sucursal_id', sucursalId)
    .eq('fecha', hoy)
    .eq('tipo', 'entrada_anticipada')
    .eq('estado', 'aprobada')
    .limit(1);

  if (error) {
    console.error('Error verificando autorización:', error);
    return false;
  }

  return data && data.length > 0;
}

// Crea un nuevo turno para el admin_sede
// Automáticamente abre la caja con el dinero inicial
async function dnCrearTurno(sucursalId, dineroInicial, inventarioBebidas, personalAseoHoy, operador = null) {
  const session = dnGetSession();
  if (!session) throw new Error('No hay sesión activa');

  const hoy = dnTodayISO();
  const ahora = new Date().toISOString();

  // Obtener operador de sessionStorage si no se pasa como parámetro
  if (!operador) {
    try {
      const opData = sessionStorage.getItem('operador_turno');
      if (opData) {
        operador = JSON.parse(opData);
        sessionStorage.removeItem('operador_turno'); // Limpiar después de usar
      }
    } catch (e) {}
  }

  // Nombre del responsable (operador o usuario de sesión)
  const nombreResponsable = operador?.nombre || session.full_name || session.username || 'Admin Sede';

  // 1. Crear turno
  const turnoData = {
    usuario_id: session.id,
    sucursal_id: sucursalId,
    fecha: hoy,
    abierto_at: ahora,
    dinero_inicial: dineroInicial || 0,
    inventario_bebidas_inicial: inventarioBebidas || null,
    personal_aseo_hoy: personalAseoHoy || [],
    estado: 'abierto'
  };

  // Agregar operador si existe
  if (operador) {
    turnoData.operador_id = operador.id;
    turnoData.operador_nombre = operador.nombre;
  }

  const { data, error } = await sb
    .from('turnos_admin_sede')
    .insert(turnoData)
    .select()
    .single();

  if (error) throw error;

  // 2. Abrir caja automáticamente (crear sesión de caja)
  const { data: cajaSesion, error: cajaError } = await sb
    .from('caja_sesiones')
    .insert({
      sucursal_id: sucursalId,
      fecha: hoy,
      estado: 'abierta',
      abierta_at: ahora,
      abierta_por: nombreResponsable,
      base_apertura: dineroInicial || 0,
      turno_id: data.id // Vincular con el turno
    })
    .select()
    .single();

  if (cajaError) {
    console.warn('Error abriendo caja automática:', cajaError.message);
    // No fallar el turno si la caja falla, pero registrar
  }

  // 3. Registrar en logs
  await dnLogTurno(data.id, 'apertura', {
    dinero_inicial: dineroInicial,
    inventario_bebidas: inventarioBebidas,
    personal_aseo_hoy: personalAseoHoy,
    caja_sesion_id: cajaSesion?.id || null
  });

  return data;
}

// Registra una acción en los logs del turno
async function dnLogTurno(turnoId, accion, datos) {
  const session = dnGetSession();

  await sb.from('turnos_admin_sede_logs').insert({
    turno_id: turnoId,
    usuario_id: session?.id,
    accion: accion,
    datos: datos || null,
    user_agent: navigator.userAgent
  });
}

// Actualiza el progreso del cierre de turno
async function dnActualizarCierreTurno(turnoId, paso, datos) {
  const { error } = await sb
    .from('turnos_admin_sede')
    .update({
      cierre_paso_actual: paso,
      cierre_datos: datos,
      estado: paso >= 6 ? 'cerrado' : 'cierre_en_progreso',
      cerrado_at: paso >= 6 ? new Date().toISOString() : null
    })
    .eq('id', turnoId);

  if (error) throw error;

  await dnLogTurno(turnoId, paso >= 6 ? 'cierre_completado' : `cierre_paso_${paso}`, datos);
}

// Solicita reapertura de turno cerrado
async function dnSolicitarReapertura(sucursalId, motivo) {
  const session = dnGetSession();
  if (!session) throw new Error('No hay sesión activa');

  const hoy = dnTodayISO();

  // Actualizar el turno con la solicitud
  const { data: turno, error: turnoError } = await sb
    .from('turnos_admin_sede')
    .update({
      solicitud_reapertura_at: new Date().toISOString(),
      solicitud_reapertura_motivo: motivo
    })
    .eq('sucursal_id', sucursalId)
    .eq('fecha', hoy)
    .eq('estado', 'cerrado')
    .select()
    .single();

  if (turnoError) throw turnoError;

  // Crear registro de autorización
  const { error } = await sb
    .from('autorizaciones_admin_sede')
    .insert({
      tipo: 'reapertura',
      solicitante_id: session.id,
      sucursal_id: sucursalId,
      fecha: hoy,
      motivo: motivo,
      estado: 'pendiente'
    });

  if (error) throw error;

  await dnLogTurno(turno.id, 'solicitud_reapertura', { motivo });

  return turno;
}

// Obtiene las solicitudes pendientes (para el panel de admin)
async function dnGetSolicitudesPendientes() {
  const { data, error } = await sb
    .from('autorizaciones_admin_sede')
    .select(`
      *,
      solicitante:usuarios!solicitante_id(id, full_name, username),
      sucursal:sucursales!sucursal_id(id, nombre)
    `)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error cargando solicitudes:', error);
    return [];
  }

  return data || [];
}

// Aprobar o rechazar una solicitud (solo admin)
async function dnResponderSolicitud(solicitudId, aprobar) {
  const session = dnGetSession();
  if (!session || session.role !== 'admin') throw new Error('Sin permisos');

  const { data, error } = await sb
    .from('autorizaciones_admin_sede')
    .update({
      estado: aprobar ? 'aprobada' : 'rechazada',
      autorizado_por: session.id,
      autorizado_at: new Date().toISOString()
    })
    .eq('id', solicitudId)
    .select()
    .single();

  if (error) throw error;

  // Si es reapertura aprobada, reabrir el turno
  if (aprobar && data.tipo === 'reapertura') {
    await sb
      .from('turnos_admin_sede')
      .update({
        estado: 'abierto',
        reapertura_autorizada_por: session.id,
        reapertura_autorizada_at: new Date().toISOString(),
        cierre_paso_actual: 0,
        cerrado_at: null
      })
      .eq('sucursal_id', data.sucursal_id)
      .eq('fecha', data.fecha);
  }

  return data;
}

// ---- Permisos de módulos para admin_sede ----
const MODULOS_ADMIN_SEDE = [
  { id: 'dashboard', nombre: 'Resumen', icono: '📊' },
  { id: 'calendario', nombre: 'Agenda', icono: '📅' },
  { id: 'clientes', nombre: 'Clientes', icono: '👥' },
  { id: 'caja', nombre: 'Caja', icono: '💰' },
  { id: 'fidelizacion', nombre: 'Fidelización', icono: '⭐' },
  { id: 'barberos', nombre: 'Colaboradores', icono: '✂️' },
  { id: 'inventario', nombre: 'Inventario', icono: '📦' },
  { id: 'servicios', nombre: 'Servicios', icono: '💇' }
];

// Obtener permisos de un admin_sede
async function dnGetPermisosAdminSede(usuarioId) {
  const { data, error } = await sb
    .from('admin_sede_permisos')
    .select('modulo, permitido')
    .eq('usuario_id', usuarioId);

  if (error) {
    console.error('Error cargando permisos:', error);
    return {};
  }

  const permisos = {};
  // Por defecto todos los módulos están habilitados
  MODULOS_ADMIN_SEDE.forEach(m => permisos[m.id] = true);
  // Aplicar permisos guardados
  (data || []).forEach(p => permisos[p.modulo] = p.permitido);

  return permisos;
}

// Guardar permisos de un admin_sede
async function dnGuardarPermisosAdminSede(usuarioId, permisos) {
  // Eliminar permisos existentes
  await sb.from('admin_sede_permisos').delete().eq('usuario_id', usuarioId);

  // Insertar nuevos permisos
  const rows = Object.entries(permisos).map(([modulo, permitido]) => ({
    usuario_id: usuarioId,
    modulo,
    permitido
  }));

  if (rows.length > 0) {
    const { error } = await sb.from('admin_sede_permisos').insert(rows);
    if (error) throw error;
  }
}

// Verificar si el admin_sede actual tiene permiso para un módulo
async function dnTienePermisoModulo(modulo) {
  const session = dnGetSession();
  if (!session) return false;
  if (session.role === 'admin') return true; // Admin general tiene todos los permisos

  const permisos = await dnGetPermisosAdminSede(session.id);
  return permisos[modulo] !== false;
}

// ============================================
// COBRO CENTRALIZADO V2 - Fuente única de verdad
// ============================================
// Sistema unificado de cobros que maneja:
// 1. Tickets con número único server-side
// 2. Snapshot de items (precios históricos)
// 3. Múltiples métodos de pago (pagos divididos)
// 4. Movimientos de caja integrados
// 5. Idempotencia por clave única
// 6. Validación de totales server-side

/**
 * Genera una clave de idempotencia única para el cobro
 * @returns {string} Clave única basada en timestamp + random
 */
function dnGenerarIdempotencyKey() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  const session = dnGetSession();
  const userId = session?.id?.substring(0, 8) || 'anon';
  return `cobro_${userId}_${timestamp}_${random}`;
}

/**
 * Registra un cobro completo usando el sistema unificado V2
 * Esta función maneja TODO en una sola transacción ACID:
 * - Ticket con número único
 * - Items con snapshot de precios
 * - Múltiples métodos de pago
 * - Movimientos de caja
 * - Actualización de cita
 *
 * @param {Object} params - Parámetros del cobro
 * @param {string} [params.citaId] - ID de la cita (opcional para walk-in)
 * @param {string} params.sucursalId - ID de la sucursal
 * @param {Array} params.items - Array de items [{tipo, item_id, nombre, precio_unitario, cantidad, barbero_id, barbero_nombre}]
 * @param {Array} params.metodosPago - Array de métodos [{metodo, monto}]
 * @param {number} params.subtotal - Subtotal antes de descuento
 * @param {number} [params.descuento=0] - Monto de descuento
 * @param {number} [params.propina=0] - Monto de propina
 * @param {number} params.total - Total final (subtotal - descuento + propina)
 * @param {string} [params.clienteId] - ID del cliente
 * @param {string} params.clienteNombre - Nombre del cliente
 * @param {string} [params.clienteTelefono] - Teléfono del cliente
 * @param {string} [params.barberoId] - ID del barbero principal
 * @param {string} [params.barberoNombre] - Nombre del barbero
 * @param {string} [params.tipo='servicio'] - Tipo de cobro (servicio, producto, mixto, walk_in)
 * @param {string} [params.idempotencyKey] - Clave de idempotencia (se genera si no se proporciona)
 * @returns {Promise<{success: boolean, ticketId?: string, numeroTicket?: string, error?: string, yaExistia?: boolean}>}
 */
async function dnRegistrarCobroV2({
  citaId,
  sucursalId,
  items = [],
  metodosPago = [],
  subtotal,
  descuento = 0,
  propina = 0,
  total,
  clienteId,
  clienteNombre = 'Cliente',
  clienteTelefono,
  barberoId,
  barberoNombre,
  tipo = 'servicio',
  idempotencyKey,
  notas
}) {
  // Validaciones básicas en frontend (el server también valida)
  if (!sucursalId) {
    return { success: false, error: 'sucursalId es requerido' };
  }

  if (!metodosPago || metodosPago.length === 0) {
    return { success: false, error: 'Debe especificar al menos un método de pago' };
  }

  if (total === undefined || total <= 0) {
    return { success: false, error: 'El total debe ser mayor a 0' };
  }

  // Validar que suma de métodos = total
  const sumaMetodos = metodosPago.reduce((sum, m) => sum + (Number(m.monto) || 0), 0);
  if (Math.abs(sumaMetodos - total) > 10) {
    return { success: false, error: `La suma de métodos (${sumaMetodos}) no coincide con el total (${total})` };
  }

  // Generar clave de idempotencia si no se proporcionó
  const finalIdempotencyKey = idempotencyKey || dnGenerarIdempotencyKey();

  const session = dnGetSession();

  try {
    console.log('[dnRegistrarCobroV2] Iniciando cobro:', {
      citaId,
      sucursalId,
      total,
      metodos: metodosPago.map(m => `${m.metodo}:${m.monto}`).join(', '),
      idempotencyKey: finalIdempotencyKey
    });

    const { data: rpcResult, error: rpcErr } = await sb.rpc('registrar_cobro_v2', {
      p_idempotency_key: finalIdempotencyKey,
      p_cita_id: citaId || null,
      p_sucursal_id: sucursalId,
      p_items: items,
      p_metodos_pago: metodosPago,
      p_subtotal: subtotal || total,
      p_descuento: descuento,
      p_propina: propina,
      p_total: total,
      p_cliente_id: clienteId || null,
      p_cliente_nombre: clienteNombre,
      p_cliente_telefono: clienteTelefono || null,
      p_barbero_id: barberoId || null,
      p_barbero_nombre: barberoNombre || null,
      p_tipo: tipo,
      p_registrado_por: session?.id || null,
      p_registrado_por_nombre: session?.full_name || session?.username || null,
      p_notas: notas || null
    });

    if (rpcErr) {
      console.error('[dnRegistrarCobroV2] Error en RPC:', rpcErr);
      return { success: false, error: 'Error en cobro: ' + rpcErr.message };
    }

    if (rpcResult && typeof rpcResult === 'object') {
      if (rpcResult.yaExistia) {
        console.warn('[dnRegistrarCobroV2] Cobro ya existía (idempotencia):', rpcResult);
      } else {
        console.log('[dnRegistrarCobroV2] Cobro registrado:', rpcResult);
      }
      return rpcResult;
    }

    return { success: false, error: 'Respuesta inesperada del servidor' };

  } catch (err) {
    console.error('[dnRegistrarCobroV2] Error inesperado:', err);
    return { success: false, error: 'Error inesperado: ' + err.message };
  }
}

/**
 * Anula un cobro existente SIN eliminar el historial.
 * Crea un ticket compensatorio negativo y movimientos de caja de egreso.
 * Conserva trazabilidad completa del cobro original.
 *
 * @param {Object} params - Parámetros de anulación
 * @param {string} params.ticketId - ID del ticket a anular
 * @param {string} [params.motivo] - Motivo de la anulación
 * @returns {Promise<{success: boolean, ticketAnulacionId?: string, numeroAnulacion?: string, error?: string}>}
 */
async function dnAnularCobro({ ticketId, motivo = 'Anulación solicitada' }) {
  if (!ticketId) {
    return { success: false, error: 'ticketId es requerido' };
  }

  try {
    console.log('[dnAnularCobro] Anulando ticket:', ticketId, 'Motivo:', motivo);

    const { data: rpcResult, error: rpcErr } = await sb.rpc('anular_cobro', {
      p_ticket_id: ticketId,
      p_motivo: motivo
    });

    if (rpcErr) {
      console.error('[dnAnularCobro] Error en RPC:', rpcErr);
      return { success: false, error: 'Error en anulación: ' + rpcErr.message };
    }

    if (rpcResult && typeof rpcResult === 'object') {
      console.log('[dnAnularCobro] Resultado:', rpcResult);

      // Eliminar reseña asociada al ticket si existe
      try {
        const { error: resenaErr } = await sb.from('resenas')
          .delete()
          .eq('ticket_id', ticketId);

        if (resenaErr) {
          console.warn('[dnAnularCobro] Error eliminando reseña:', resenaErr);
        } else {
          console.log('[dnAnularCobro] Reseña asociada eliminada (si existía)');
        }
      } catch (resenaError) {
        console.warn('[dnAnularCobro] Error al intentar eliminar reseña:', resenaError);
      }

      return rpcResult;
    }

    return { success: false, error: 'Respuesta inesperada del servidor' };

  } catch (err) {
    console.error('[dnAnularCobro] Error inesperado:', err);
    return { success: false, error: 'Error inesperado: ' + err.message };
  }
}

/**
 * Registra un cobro simple (compatibilidad con sistema anterior)
 * DEPRECATED: Usar dnRegistrarCobroV2 para nuevos desarrollos
 *
 * @param {Object} params - Parámetros del cobro
 * @param {string} params.citaId - ID de la cita a cobrar
 * @param {number} params.monto - Monto total a cobrar
 * @param {string} params.metodo - Método de pago (efectivo, nequi, etc.)
 * @param {string} [params.sucursalId] - ID de sucursal
 * @returns {Promise<{success: boolean, pagoId?: string, error?: string, yaExistia?: boolean}>}
 */
async function dnRegistrarCobro({ citaId, monto, metodo, sucursalId, registradoPor }) {
  if (!citaId || !monto || !metodo) {
    return { success: false, error: 'Faltan parámetros requeridos' };
  }

  try {
    // Intentar usar RPC atómico (transacción PostgreSQL)
    const { data: rpcResult, error: rpcErr } = await sb.rpc('registrar_cobro', {
      p_cita_id: citaId,
      p_monto: monto,
      p_metodo: metodo,
      p_sucursal_id: sucursalId || null,
      p_registrado_por: registradoPor || null
    });

    if (rpcErr) {
      console.error('[dnRegistrarCobro] Error en RPC:', rpcErr);
      return { success: false, error: 'Error en cobro: ' + rpcErr.message };
    }

    // El RPC retorna JSONB directamente
    if (rpcResult && typeof rpcResult === 'object') {
      if (rpcResult.yaExistia) {
        console.warn('[dnRegistrarCobro] Pago ya existía:', rpcResult);
      } else {
        console.log('[dnRegistrarCobro] Cobro registrado via RPC:', rpcResult);
      }
      return rpcResult;
    }

    return { success: false, error: 'Respuesta inesperada del servidor' };

  } catch (err) {
    console.error('[dnRegistrarCobro] Error inesperado:', err);
    return { success: false, error: 'Error inesperado: ' + err.message };
  }
}


/**
 * Registra venta directa de productos (sin cita asociada)
 * Para usar cuando se venden productos sin servicio
 * Guarda COGS histórico (costo aplicado al momento de la venta)
 */
async function dnRegistrarVentaProducto({ sucursalId, productoId, clienteId, cantidad, precioUnitario, metodo, registradoPor, comisionMonto, comisionPara, turnoId, barberoId }) {
  if (!sucursalId || !productoId || !cantidad || !precioUnitario || !metodo) {
    return { success: false, error: 'Faltan parámetros requeridos' };
  }

  try {
    // Obtener costo actual del producto para COGS histórico
    const { data: producto } = await sb.from('inventario_productos_venta')
      .select('costo')
      .eq('id', productoId)
      .single();

    const costoUnitario = producto?.costo || 0;
    const costoTotal = costoUnitario * cantidad;

    const { data, error } = await sb.from('ventas_productos').insert({
      sucursal_id: sucursalId,
      turno_id: turnoId || null,
      producto_id: productoId,
      cliente_id: clienteId || null,
      barbero_id: barberoId || null,
      cantidad: cantidad,
      precio_unitario: precioUnitario,
      precio_total: precioUnitario * cantidad,
      costo_unitario: costoUnitario,
      costo_total: costoTotal,
      comision_monto: comisionMonto || 0,
      comision_para: comisionPara || 'admin_sede',
      registrado_por: registradoPor,
      pagado: true,
      pagado_at: new Date().toISOString(),
      metodo_pago: metodo
    }).select('id').single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, ventaId: data.id, costoTotal };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================
// SISTEMA FINANCIERO - RPCs
// ============================================

/**
 * Registra comisión de servicio o producto
 */
async function dnRegistrarComision({ barberoId, citaId, pagoId, sucursalId, tipo, concepto, baseCalculo, porcentaje }) {
  try {
    const { data, error } = await sb.rpc('registrar_comision', {
      p_barbero_id: barberoId,
      p_cita_id: citaId || null,
      p_pago_id: pagoId || null,
      p_sucursal_id: sucursalId,
      p_tipo: tipo,
      p_concepto: concepto,
      p_base_calculo: baseCalculo,
      p_porcentaje: porcentaje
    });
    if (error) return { success: false, error: error.message };
    return { success: true, comisionId: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Paga a un colaborador (barbero, admin, aseo)
 * Registra pago + movimiento de caja + marca comisiones como pagadas
 */
async function dnPagarColaborador({ usuarioId, barberoId, sucursalId, tipo, concepto, monto, metodo }) {
  try {
    const { data, error } = await sb.rpc('pagar_colaborador', {
      p_usuario_id: usuarioId,
      p_barbero_id: barberoId || null,
      p_sucursal_id: sucursalId,
      p_tipo: tipo,
      p_concepto: concepto,
      p_monto: monto,
      p_metodo: metodo
    });
    if (error) return { success: false, error: error.message };
    return data;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Registra gasto/proveedor
 */
async function dnRegistrarGasto({ sucursalId, categoria, concepto, beneficiario, monto, metodo }) {
  try {
    const { data, error } = await sb.rpc('registrar_gasto', {
      p_sucursal_id: sucursalId,
      p_categoria: categoria,
      p_concepto: concepto,
      p_beneficiario: beneficiario || '',
      p_monto: monto,
      p_metodo: metodo
    });
    if (error) return { success: false, error: error.message };
    return data;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Cierra turno y calcula totales
 * Automáticamente cierra la caja vinculada al turno
 */
async function dnCerrarTurno({ turnoId, efectivoContado, observaciones }) {
  try {
    const session = dnGetSession();
    const ahora = new Date().toISOString();

    // 1. Cerrar turno vía RPC
    const { data, error } = await sb.rpc('cerrar_turno', {
      p_turno_id: turnoId,
      p_efectivo_contado: efectivoContado,
      p_observaciones: observaciones || null
    });
    if (error) return { success: false, error: error.message };

    // 2. Cerrar caja automáticamente (buscar por turno_id o por fecha/sucursal)
    // Primero intentar por turno_id directo
    let cajaCerrada = false;
    const { data: cajaPorTurno } = await sb
      .from('caja_sesiones')
      .select('id, sucursal_id')
      .eq('turno_id', turnoId)
      .eq('estado', 'abierta')
      .single();

    if (cajaPorTurno) {
      // Cerrar la caja vinculada al turno
      await sb.from('caja_sesiones').update({
        estado: 'cerrada',
        cerrada_at: ahora,
        cerrada_por: session?.full_name || session?.username || 'Sistema',
        efectivo_cierre_real: efectivoContado
      }).eq('id', cajaPorTurno.id);
      cajaCerrada = true;
    } else {
      // Fallback: buscar caja abierta del mismo día/sucursal
      const { data: turno } = await sb.from('turnos_admin_sede').select('sucursal_id, fecha').eq('id', turnoId).single();
      if (turno) {
        const { data: cajaDelDia } = await sb
          .from('caja_sesiones')
          .select('id')
          .eq('sucursal_id', turno.sucursal_id)
          .eq('fecha', turno.fecha)
          .eq('estado', 'abierta')
          .single();

        if (cajaDelDia) {
          await sb.from('caja_sesiones').update({
            estado: 'cerrada',
            cerrada_at: ahora,
            cerrada_por: session?.full_name || session?.username || 'Sistema',
            efectivo_cierre_real: efectivoContado,
            turno_id: turnoId // Vincular retroactivamente
          }).eq('id', cajaDelDia.id);
          cajaCerrada = true;
        }
      }
    }

    console.log('Turno cerrado, caja cerrada:', cajaCerrada);
    return data;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Obtiene comisiones pendientes de un turno/barbero
 */
async function dnGetComisionesPendientes(sucursalId, barberoId = null) {
  let query = sb.from('comisiones')
    .select('*, barberos(id, usuarios!barberos_id_fkey(id, full_name, avatar_url))')
    .eq('sucursal_id', sucursalId)
    .eq('estado', 'pendiente');

  if (barberoId) {
    query = query.eq('barbero_id', barberoId);
  }

  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

/**
 * Obtiene pagos de colaboradores de un turno
 */
async function dnGetPagosColaboradores(turnoId) {
  const { data, error } = await sb.from('pagos_colaboradores')
    .select('*, usuarios(full_name)')
    .eq('turno_id', turnoId);
  if (error) return [];
  return data || [];
}

/**
 * Registra movimiento de ingreso en caja
 */
async function dnRegistrarIngreso({ sucursalId, categoria, concepto, monto, metodo, referenciaId }) {
  try {
    // Obtener turno activo
    const { data: turno } = await sb.from('caja_sesiones')
      .select('id')
      .eq('sucursal_id', sucursalId)
      .eq('estado', 'abierta')
      .eq('fecha', dnTodayISO())
      .order('abierta_at', { ascending: false })
      .limit(1)
      .single();

    if (!turno) return { success: false, error: 'No hay turno abierto' };

    const afectaEfectivo = (metodo === 'efectivo');

    const { data, error } = await sb.from('caja_movimientos').insert({
      sesion_id: turno.id,
      sucursal_id: sucursalId,
      tipo: 'ingreso',
      categoria: categoria,
      descripcion: concepto,
      referencia_id: referenciaId || null,
      monto: monto,
      metodo_pago: metodo,
      afecta_efectivo: afectaEfectivo,
      created_by: dnGetSession()?.id
    }).select('id').single();

    if (error) return { success: false, error: error.message };
    return { success: true, movimientoId: data.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================
// PWA UPDATE HANDLER - Forzar actualización
// ============================================
(function() {
  // Escuchar mensajes del Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SW_UPDATED') {
        console.log('[PWA] Nueva versión detectada:', event.data.version);
        // Recargar la página para obtener los nuevos archivos
        window.location.reload(true);
      }
      if (event.data && event.data.type === 'CACHES_CLEARED') {
        console.log('[PWA] Caches limpiados, recargando...');
        window.location.reload(true);
      }
    });

    // Verificar actualizaciones del SW cada vez que se carga la página
    navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration) {
        registration.update().then(() => {
          console.log('[PWA] Service Worker actualizado');
        }).catch((err) => {
          console.log('[PWA] Error actualizando SW:', err);
        });

        // Si hay un SW esperando, activarlo inmediatamente
        if (registration.waiting) {
          console.log('[PWA] SW en espera, activando...');
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        // Escuchar cuando un nuevo SW está listo
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('[PWA] Nuevo SW encontrado');
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA] Nuevo SW instalado, forzando activación...');
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      }
    });

    // Detectar cuando el controlador cambia (nuevo SW activado)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[PWA] Nuevo SW tomó control, recargando...');
      window.location.reload(true);
    });
  }

  // Limpiar caches manualmente al cargar
  if ('caches' in window) {
    const CURRENT_CACHE = 'diego-neira-v27';
    caches.keys().then((cacheNames) => {
      cacheNames.forEach((cacheName) => {
        if (cacheName !== CURRENT_CACHE) {
          console.log('[PWA] Limpiando cache antiguo:', cacheName);
          caches.delete(cacheName);
        }
      });
    });
  }
})();

// ============================================
// CLUB DE LEALES - Sistema de Lealtad
// ============================================

const DN_LEALTAD_KEY = 'dn_lealtad_session';

// Normalizar teléfono colombiano (quitar +57, espacios, guiones)
function dnNormalizePhone(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('57') && digits.length === 12) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10 || !digits.startsWith('3')) {
    return null;
  }
  return digits;
}

// Guardar sesión de lealtad
function dnSaveLealtadSession(user) {
  const cleanUser = { ...user, is_lealtad: true };
  // Limpiar avatar si es base64
  if (cleanUser.avatar_url && cleanUser.avatar_url.startsWith('data:')) {
    cleanUser.avatar_url = null;
  }

  const userJson = JSON.stringify(cleanUser);

  try {
    localStorage.setItem(DN_LEALTAD_KEY, userJson);
    console.log('[Lealtad] Sesión guardada en localStorage');
  } catch (e) {
    console.warn('[Lealtad] Error guardando en localStorage:', e);
  }

  // Cookie como respaldo (30 días)
  try {
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${DN_LEALTAD_KEY}=${encodeURIComponent(userJson)}; expires=${expires}; path=/; SameSite=Lax`;
  } catch (e) {
    console.warn('[Lealtad] Error guardando cookie:', e);
  }

  return true;
}

// Obtener sesión de lealtad
function dnGetLealtadSession() {
  try {
    const raw = localStorage.getItem(DN_LEALTAD_KEY);
    if (raw) {
      const session = JSON.parse(raw);
      if (session && session.id && session.is_lealtad) {
        return session;
      }
    }
  } catch (e) {
    console.warn('[Lealtad] Error leyendo localStorage:', e);
  }

  // Fallback: cookie
  try {
    const cookieMatch = document.cookie.match(new RegExp('(^| )' + DN_LEALTAD_KEY + '=([^;]+)'));
    if (cookieMatch) {
      const session = JSON.parse(decodeURIComponent(cookieMatch[2]));
      if (session && session.id && session.is_lealtad) {
        // Restaurar en localStorage
        try {
          localStorage.setItem(DN_LEALTAD_KEY, JSON.stringify(session));
        } catch (e) {}
        return session;
      }
    }
  } catch (e) {
    console.warn('[Lealtad] Error leyendo cookie:', e);
  }

  return null;
}

// Limpiar sesión de lealtad
function dnClearLealtadSession() {
  try {
    localStorage.removeItem(DN_LEALTAD_KEY);
  } catch (e) {}
  try {
    document.cookie = `${DN_LEALTAD_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  } catch (e) {}
}

// Requerir sesión de lealtad
function dnRequireLealtadSession(redirectTo) {
  const session = dnGetLealtadSession();
  if (!session) {
    window.location.href = redirectTo || 'login.html';
    return null;
  }
  return session;
}

// Calcular categoría de lealtad basada en cortes
function dnCalcularLealtad(cortes) {
  const n = Number(cortes) || 0;

  if (n < 10) {
    return {
      categoria: null,
      siguiente: 'bronce',
      cortes_total: n,
      cortes_para_siguiente: 10 - n,
      progreso_porcentaje: Math.round((n * 100) / 10)
    };
  }
  if (n < 30) {
    return {
      categoria: 'bronce',
      siguiente: 'plata',
      cortes_total: n,
      cortes_para_siguiente: 30 - n,
      progreso_porcentaje: Math.round(((n - 10) * 100) / 20)
    };
  }
  if (n < 50) {
    return {
      categoria: 'plata',
      siguiente: 'oro',
      cortes_total: n,
      cortes_para_siguiente: 50 - n,
      progreso_porcentaje: Math.round(((n - 30) * 100) / 20)
    };
  }
  if (n < 70) {
    return {
      categoria: 'oro',
      siguiente: 'black',
      cortes_total: n,
      cortes_para_siguiente: 70 - n,
      progreso_porcentaje: Math.round(((n - 50) * 100) / 20)
    };
  }
  return {
    categoria: 'black',
    siguiente: null,
    cortes_total: n,
    cortes_para_siguiente: 0,
    progreso_porcentaje: 100
  };
}

// Cargar beneficios por categoría (con cache)
async function dnLoadBeneficiosPorCategoria(categoria) {
  if (!categoria) return [];

  const cacheKey = `beneficios:${categoria}`;
  return dnCachedQuery(cacheKey, async () => {
    const { data, error } = await sb.rpc('get_beneficios_por_categoria', {
      p_categoria: categoria
    });
    if (error) throw error;
    return data || [];
  }, 300000); // Cache 5 minutos
}

// Cargar promoción semanal (con cache)
async function dnLoadPromocionSemanal() {
  return dnCachedQuery('promocion_semanal', async () => {
    const { data, error } = await sb.rpc('get_promocion_semanal');
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  }, 300000); // Cache 5 minutos
}

// Buscar cliente por teléfono
async function dnBuscarClientePorTelefono(telefono) {
  const normalized = dnNormalizePhone(telefono);
  if (!normalized) {
    return { encontrado: false, mensaje: 'Número inválido' };
  }

  const { data, error } = await sb.rpc('buscar_cliente_por_telefono', {
    p_telefono: normalized
  });

  if (error) {
    console.error('Error buscando cliente:', error);
    return { encontrado: false, mensaje: 'Error de conexión' };
  }

  return data;
}

// Enviar OTP por WhatsApp
async function dnEnviarOTP(telefono) {
  const normalized = dnNormalizePhone(telefono);
  if (!normalized) {
    return { success: false, error: 'Número inválido' };
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/otp-send`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY
        },
        body: JSON.stringify({ telefono: normalized })
      }
    );

    return await response.json();
  } catch (err) {
    console.error('Error enviando OTP:', err);
    return { success: false, error: 'Error de conexión' };
  }
}

// Validar OTP
async function dnValidarOTP(telefono, codigo) {
  const normalized = dnNormalizePhone(telefono);
  if (!normalized) {
    return { valido: false, mensaje: 'Número inválido' };
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/otp-send/validate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY
        },
        body: JSON.stringify({ telefono: normalized, codigo })
      }
    );

    const result = await response.json();

    // Si es válido, guardar sesión
    if (result.valido && result.usuario) {
      dnSaveLealtadSession(result.usuario);
    }

    return result;
  } catch (err) {
    console.error('Error validando OTP:', err);
    return { valido: false, mensaje: 'Error de conexión' };
  }
}
