// =====================================================
// WhatsApp Cloud API - Configuración y Credenciales
// =====================================================
//
// INTEGRACIÓN DIRECTA CON WHATSAPP CLOUD API
// No usa Embedded Signup - Configuración manual con tokens permanentes
//
// Variables de entorno requeridas:
// - WHATSAPP_ACCESS_TOKEN: Token permanente de usuario del sistema
// - WHATSAPP_PHONE_NUMBER_ID: ID del número de teléfono en Meta
// - WHATSAPP_VERIFY_TOKEN: Token para verificación de webhook
// - WHATSAPP_APP_SECRET: App Secret para validar firmas de webhook
//
// Configuración fija:
// - WABA ID: 851994237367851
// - App ID: 910914185080805
// =====================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { WhatsAppCredentials, SucursalWhatsApp } from './types.ts';

// Versión de la API de WhatsApp
export const WHATSAPP_API_VERSION = 'v18.0';
export const WHATSAPP_API_BASE_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

// Configuración fija de la cuenta propia
export const WHATSAPP_WABA_ID = '851994237367851';
export const META_APP_ID = '910914185080805';

// Crear cliente de Supabase con service_role para operaciones internas
export function createSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Convierte un nombre de sede a slug para variables de entorno.
 * "Calle 165" -> "CALLE_165", "Colina" -> "COLINA"
 */
function sedeNameToEnvSlug(sedeName: string): string {
  return sedeName
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^A-Z0-9]/g, '_')      // Reemplazar caracteres especiales
    .replace(/_+/g, '_')              // Eliminar underscores duplicados
    .replace(/^_|_$/g, '');           // Eliminar underscores al inicio/final
}

/**
 * Obtiene el Access Token de WhatsApp para una sede.
 *
 * ESTRATEGIA DE TOKENS:
 * 1. Busca secret específico por nombre de sede: WHATSAPP_ACCESS_TOKEN_<SEDE_SLUG>
 *    Ejemplo: WHATSAPP_ACCESS_TOKEN_COLINA, WHATSAPP_ACCESS_TOKEN_CALLE_165
 * 2. Si no existe, usa el token global: WHATSAPP_ACCESS_TOKEN
 */
function getAccessTokenForSede(sedeSlug: string | null): string {
  if (sedeSlug) {
    const envSlug = sedeNameToEnvSlug(sedeSlug);
    const specificToken = Deno.env.get(`WHATSAPP_ACCESS_TOKEN_${envSlug}`);
    if (specificToken) {
      return specificToken;
    }
  }

  // Fallback a token global
  const globalToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  if (!globalToken) {
    throw new Error('WHATSAPP_ACCESS_TOKEN no configurado. Configure WHATSAPP_ACCESS_TOKEN (global) o WHATSAPP_ACCESS_TOKEN_<SEDE> (específico).');
  }

  return globalToken;
}

/**
 * Obtiene el Phone Number ID de WhatsApp para una sede.
 *
 * ESTRATEGIA MULTI-SEDE:
 * 1. Busca secret específico: WHATSAPP_PHONE_NUMBER_ID_<SEDE_SLUG>
 *    Ejemplo: WHATSAPP_PHONE_NUMBER_ID_COLINA, WHATSAPP_PHONE_NUMBER_ID_CALLE_165
 * 2. Si no existe, usa el global: WHATSAPP_PHONE_NUMBER_ID
 */
function getPhoneNumberIdForSede(sedeSlug: string | null): string {
  if (sedeSlug) {
    const envSlug = sedeNameToEnvSlug(sedeSlug);
    const specificId = Deno.env.get(`WHATSAPP_PHONE_NUMBER_ID_${envSlug}`);
    if (specificId) {
      console.log(`[WhatsApp Config] Usando Phone Number ID específico para sede: ${sedeSlug}`);
      return specificId;
    }
  }

  // Fallback a Phone Number ID global
  const globalId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  if (!globalId) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID no configurado.');
  }

  return globalId;
}

/**
 * Obtiene las credenciales de WhatsApp directamente de variables de entorno.
 * Esta es la función principal para integración directa (sin Embedded Signup).
 *
 * Variables requeridas:
 * - WHATSAPP_ACCESS_TOKEN: Token permanente de usuario del sistema
 * - WHATSAPP_PHONE_NUMBER_ID: ID del número de teléfono en Meta
 *
 * Usa WABA_ID fijo: 851994237367851
 */
export function getDirectWhatsAppCredentials(): WhatsAppCredentials {
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');

  if (!accessToken) {
    throw new Error('WHATSAPP_ACCESS_TOKEN no configurado. Configure el token permanente de usuario del sistema.');
  }

  if (!phoneNumberId) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID no configurado. Configure el ID del número de teléfono de Meta.');
  }

  return {
    phoneNumberId,
    wabaId: WHATSAPP_WABA_ID,
    accessToken,
    phoneNumber: Deno.env.get('WHATSAPP_PHONE_NUMBER') || ''
  };
}

/**
 * Obtiene las credenciales de WhatsApp para una sede específica.
 *
 * MULTI-SEDE: Cada sede puede tener su propio Phone Number ID configurado
 * en variables de entorno: WHATSAPP_PHONE_NUMBER_ID_<SEDE_SLUG>
 *
 * Ejemplo:
 * - WHATSAPP_PHONE_NUMBER_ID_COLINA = 123456789
 * - WHATSAPP_PHONE_NUMBER_ID_CALLE_165 = 687040821167199
 * - WHATSAPP_PHONE_NUMBER_ID = fallback global
 */
export async function getWhatsAppCredentials(sucursalId: string): Promise<WhatsAppCredentials> {
  const supabase = createSupabaseClient();

  // Siempre buscar la sede para obtener su nombre
  const { data: sede, error } = await supabase
    .from('sucursales')
    .select('id, nombre, whatsapp_phone_number, whatsapp_token_ref')
    .eq('id', sucursalId)
    .eq('activa', true)
    .single();

  if (error || !sede) {
    console.warn(`[WhatsApp Config] Sede ${sucursalId} no encontrada, usando credenciales globales`);
    // Fallback a credenciales globales
    return getDirectWhatsAppCredentials();
  }

  // Usar el nombre de la sede (o token_ref si existe) para buscar credenciales específicas
  const sedeRef = sede.whatsapp_token_ref || sede.nombre;

  // Obtener Phone Number ID específico de la sede o fallback a global
  const phoneNumberId = getPhoneNumberIdForSede(sedeRef);

  // Obtener Access Token específico de la sede o fallback a global
  const accessToken = getAccessTokenForSede(sedeRef);

  console.log(`[WhatsApp Config] Credenciales para sede "${sede.nombre}": phoneNumberId=${phoneNumberId.substring(0, 6)}...`);

  return {
    phoneNumberId,
    wabaId: WHATSAPP_WABA_ID,
    accessToken,
    phoneNumber: sede.whatsapp_phone_number || ''
  };
}

/**
 * Busca una sede por su WhatsApp Phone Number ID.
 * Usado cuando llega un webhook para identificar a qué sede pertenece.
 */
export async function getSucursalByPhoneNumberId(phoneNumberId: string): Promise<SucursalWhatsApp | null> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('sucursales')
    .select('id, nombre, whatsapp_phone_number, whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_token_ref')
    .eq('whatsapp_phone_number_id', phoneNumberId)
    .eq('activa', true)
    .single();

  if (error || !data) {
    console.error(`[WhatsApp Config] Sede no encontrada para phone_number_id: ${phoneNumberId}`);
    return null;
  }

  return data as SucursalWhatsApp;
}

/**
 * Verifica el token de verificación del webhook.
 */
export function verifyWebhookToken(token: string): boolean {
  const expectedToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN');
  if (!expectedToken) {
    console.error('[WhatsApp Config] WHATSAPP_VERIFY_TOKEN no configurado');
    return false;
  }
  return token === expectedToken;
}

/**
 * Valida la firma X-Hub-Signature-256 del webhook.
 * Meta firma los payloads con el App Secret.
 *
 * IMPORTANTE: Esta validación es OBLIGATORIA en producción.
 * Si WHATSAPP_APP_SECRET no está configurado, se rechaza la petición.
 */
export async function validateWebhookSignature(
  rawBody: string,
  signature: string | null
): Promise<{ valid: boolean; error?: string }> {
  const appSecret = Deno.env.get('WHATSAPP_APP_SECRET');

  // OBLIGATORIO: Si no hay app secret configurado, rechazar
  if (!appSecret) {
    console.error('[WhatsApp Config] WHATSAPP_APP_SECRET no configurado - REQUERIDO para validar webhooks');
    return { valid: false, error: 'App secret not configured' };
  }

  if (!signature) {
    console.error('[WhatsApp Config] Webhook sin firma X-Hub-Signature-256');
    return { valid: false, error: 'Missing signature header' };
  }

  // La firma viene como "sha256=XXXX"
  if (!signature.startsWith('sha256=')) {
    console.error('[WhatsApp Config] Formato de firma inválido');
    return { valid: false, error: 'Invalid signature format' };
  }

  const expectedSignature = signature.substring(7); // Quitar "sha256="

  try {
    // Crear HMAC-SHA256 del raw body con el app secret
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(appSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(rawBody)
    );

    // Convertir a hex
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const calculatedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Comparación segura (timing-safe) para evitar timing attacks
    if (calculatedSignature.length !== expectedSignature.length) {
      console.error('[WhatsApp Config] Longitud de firma no coincide');
      return { valid: false, error: 'Signature length mismatch' };
    }

    let result = 0;
    for (let i = 0; i < calculatedSignature.length; i++) {
      result |= calculatedSignature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }

    if (result !== 0) {
      console.error('[WhatsApp Config] Firma no válida');
      return { valid: false, error: 'Invalid signature' };
    }

    return { valid: true };
  } catch (error) {
    console.error('[WhatsApp Config] Error validando firma:', error);
    return { valid: false, error: 'Signature validation error' };
  }
}

/**
 * Verifica si una llamada al endpoint whatsapp-send está autorizada.
 * Usa un secret dedicado, NO la service_role_key.
 */
export function validateInternalSecret(secretHeader: string | null): boolean {
  if (!secretHeader) {
    return false;
  }

  const expectedSecret = Deno.env.get('WHATSAPP_INTERNAL_SECRET');
  if (!expectedSecret) {
    console.error('[WhatsApp Config] WHATSAPP_INTERNAL_SECRET no configurado');
    return false;
  }

  return secretHeader === expectedSecret;
}

/**
 * Verifica si una llamada al cron está autorizada.
 * Usa WHATSAPP_CRON_SECRET o el secret por defecto.
 */
export function validateCronSecret(secretHeader: string | null): boolean {
  if (!secretHeader) {
    return false;
  }

  // Secret por defecto para pg_cron interno
  const DEFAULT_CRON_SECRET = 'dn-cron-whatsapp-2024-secure';
  const expectedSecret = Deno.env.get('WHATSAPP_CRON_SECRET') || DEFAULT_CRON_SECRET;

  return secretHeader === expectedSecret;
}

/**
 * Genera un token criptográficamente seguro para acciones de botón.
 */
export function generateActionToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  // Convertir a base64url (URL-safe)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Formatea un número de teléfono para WhatsApp.
 * Asegura que tenga el código de país (57 para Colombia).
 */
export function formatPhoneForWhatsApp(phone: string): string {
  // Eliminar caracteres no numéricos
  let cleaned = phone.replace(/\D/g, '');

  // Si empieza con +, ya lo quitamos arriba
  // Si empieza con 57, está bien
  // Si empieza con 3 (celular colombiano), agregar 57
  if (cleaned.startsWith('3') && cleaned.length === 10) {
    cleaned = '57' + cleaned;
  }

  // Si tiene el + al inicio (no debería después de limpiar), quitarlo
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  return cleaned;
}

/**
 * Formatea hora para mostrar en mensaje (12h con AM/PM).
 */
export function formatTimeForMessage(time: string): string {
  // time viene como "HH:MM" o "HH:MM:SS"
  const [hours, minutes] = time.split(':').map(Number);

  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}
