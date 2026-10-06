/**
 * =====================================================
 * CONFIGURACIÓN DE LA BARBERÍA - KEICY BARBER CLUB
 * =====================================================
 *
 * Modifica estos valores para personalizar la app.
 * Este archivo centraliza toda la configuración específica.
 */

const BARBERIA_CONFIG = {
  // ===== INFORMACIÓN BÁSICA =====
  nombre: 'Keicy Barber Club',
  nombreCorto: 'Keicy',
  slogan: 'Tu barbería de confianza',

  // ===== CONTACTO =====
  telefono: '+57 317 171 3526',
  telefonoWhatsApp: '573171713526',  // Sin + ni espacios
  email: 'contacto@keicybarber.com',
  instagram: '@keicy_barber_club',

  // ===== DOMINIO =====
  dominio: 'keicybarber.com',        // Cambiar cuando tengas dominio

  // ===== SUPABASE =====
  // IMPORTANTE: Cambiar estos valores cuando crees el proyecto en Supabase
  supabase: {
    url: 'https://TU_PROYECTO.supabase.co',
    anonKey: 'TU_ANON_KEY_AQUI'
  },

  // ===== WHATSAPP BUSINESS =====
  // IMPORTANTE: Configurar cuando agregues el número a Meta Business
  whatsapp: {
    phoneNumberId: 'XXXXXXXXXX',     // ID del número en Meta
    // El Access Token se configura en Supabase como secret
  },

  // ===== SEDES =====
  sedes: [
    {
      id: 'sede-laflora',
      uuid: '46c99064-8218-41a0-a8c7-a81103f658fa',  // UUID en Supabase
      nombre: 'Sede La Flora',
      direccion: 'Av. 4 Nte. #49, Urb. La Flora, Cali',
      telefono: '+57 317 171 3526',
      whatsappPhoneNumberId: 'XXXXXXXXXX',
      horario: {
        apertura: 10,  // 10:00 AM
        cierre: 20,    // 8:00 PM
        almuerzoInicio: 13,
        almuerzoFin: 14
      },
      coordenadas: {
        lat: 3.4516,
        lng: -76.5320
      }
    }
  ],

  // ===== HORARIOS =====
  horarioDefault: {
    apertura: 10,
    cierre: 20,
    almuerzoInicio: 13,
    almuerzoFin: 14
  },

  // ===== COLORES (para personalizar tema) =====
  colores: {
    primario: '#C9A35B',      // Dorado
    secundario: '#0A0A0C',    // Negro
    acento: '#10B981',        // Verde éxito
    error: '#EF4444'          // Rojo error
  },

  // ===== REDES SOCIALES =====
  redes: {
    instagram: 'https://instagram.com/keicy_barber_club',
    facebook: '',
    tiktok: 'https://tiktok.com/@keicy_barber_club'
  }
};

// Hacer disponible globalmente
window.BARBERIA_CONFIG = BARBERIA_CONFIG;

// Para debugging
console.log('[Config] Barbería:', BARBERIA_CONFIG.nombre);
