/**
 * Sistema Centralizado de Estados de Citas
 * Keicy Barbería
 *
 * Este módulo define la única fuente de verdad para:
 * - Estados válidos de citas
 * - Transiciones permitidas
 * - Colores y etiquetas por estado
 * - Validación de cambios de estado
 */

// ============================================
// DEFINICIÓN DE ESTADOS
// ============================================

const CITA_ESTADOS = {
  AGENDADA: 'agendada',
  CONFIRMADA: 'confirmada',
  SALA_ESPERA: 'sala_espera',
  EN_SERVICIO: 'en_servicio',
  PENDIENTE_PAGO: 'pendiente_pago',
  FINALIZADA: 'finalizada',
  CANCELADA: 'cancelada',
  NO_SHOW: 'no_show',
};

// Alias para compatibilidad con código existente
const CITA_ESTADOS_ALIAS = {
  'en_proceso': CITA_ESTADOS.EN_SERVICIO,
};

// ============================================
// PRIORIDAD DE ESTADOS
// ============================================
// Un estado con prioridad mayor NO puede retroceder a uno menor
// (excepto con permisos de admin)

const ESTADO_PRIORIDAD = {
  [CITA_ESTADOS.AGENDADA]: 1,
  [CITA_ESTADOS.CONFIRMADA]: 2,
  [CITA_ESTADOS.SALA_ESPERA]: 3,
  [CITA_ESTADOS.EN_SERVICIO]: 4,
  [CITA_ESTADOS.PENDIENTE_PAGO]: 5,
  [CITA_ESTADOS.FINALIZADA]: 6,
  [CITA_ESTADOS.CANCELADA]: 6,
  [CITA_ESTADOS.NO_SHOW]: 6,
};

// ============================================
// ESTADOS FINALES
// ============================================
// Una vez en estos estados, no se puede revertir automáticamente

const ESTADOS_FINALES = new Set([
  CITA_ESTADOS.PENDIENTE_PAGO,
  CITA_ESTADOS.FINALIZADA,
  CITA_ESTADOS.CANCELADA,
  CITA_ESTADOS.NO_SHOW,
]);

// Estados que NO deben aparecer en listas de "citas activas"
const ESTADOS_INACTIVOS = new Set([
  CITA_ESTADOS.FINALIZADA,
  CITA_ESTADOS.CANCELADA,
  CITA_ESTADOS.NO_SHOW,
]);

// Estados que indican "servicio en curso"
const ESTADOS_EN_CURSO = new Set([
  CITA_ESTADOS.EN_SERVICIO,
  CITA_ESTADOS.PENDIENTE_PAGO,
]);

// ============================================
// CONFIGURACIÓN VISUAL
// ============================================

const ESTADO_CONFIG = {
  [CITA_ESTADOS.AGENDADA]: {
    label: 'Agendada',
    labelCorto: 'Agendada',
    color: '#6B7280',       // Gris
    bgColor: 'rgba(107, 114, 128, 0.15)',
    borderColor: 'rgba(107, 114, 128, 0.4)',
    icon: 'calendar',
  },
  [CITA_ESTADOS.CONFIRMADA]: {
    label: 'Confirmada',
    labelCorto: 'Confirmada',
    color: '#3B82F6',       // Azul
    bgColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: 'rgba(59, 130, 246, 0.4)',
    icon: 'check',
  },
  [CITA_ESTADOS.SALA_ESPERA]: {
    label: 'En Sala de Espera',
    labelCorto: 'Esperando',
    color: '#F59E0B',       // Naranja
    bgColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
    icon: 'clock',
  },
  [CITA_ESTADOS.EN_SERVICIO]: {
    label: 'En Servicio',
    labelCorto: 'En Servicio',
    color: '#D9B872',       // Dorado
    bgColor: 'rgba(217, 184, 114, 0.18)',
    borderColor: 'rgba(217, 184, 114, 0.45)',
    icon: 'scissors',
  },
  [CITA_ESTADOS.PENDIENTE_PAGO]: {
    label: 'Pendiente de Pago',
    labelCorto: 'Por Pagar',
    color: '#EF4444',       // Rojo
    bgColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    icon: 'credit-card',
  },
  [CITA_ESTADOS.FINALIZADA]: {
    label: 'Finalizada',
    labelCorto: 'Finalizada',
    color: '#34D399',       // Verde
    bgColor: 'rgba(52, 211, 153, 0.15)',
    borderColor: 'rgba(52, 211, 153, 0.4)',
    icon: 'check-circle',
  },
  [CITA_ESTADOS.CANCELADA]: {
    label: 'Cancelada',
    labelCorto: 'Cancelada',
    color: '#9CA3AF',       // Gris claro
    bgColor: 'rgba(156, 163, 175, 0.15)',
    borderColor: 'rgba(156, 163, 175, 0.4)',
    icon: 'x-circle',
  },
  [CITA_ESTADOS.NO_SHOW]: {
    label: 'No Asistió',
    labelCorto: 'No Asistió',
    color: '#F87171',       // Rojo claro
    bgColor: 'rgba(248, 113, 113, 0.15)',
    borderColor: 'rgba(248, 113, 113, 0.4)',
    icon: 'user-x',
  },
};

// ============================================
// TRANSICIONES PERMITIDAS
// ============================================

const TRANSICIONES_PERMITIDAS = {
  [CITA_ESTADOS.AGENDADA]: [
    CITA_ESTADOS.CONFIRMADA,
    CITA_ESTADOS.CANCELADA,
    CITA_ESTADOS.NO_SHOW,
  ],
  [CITA_ESTADOS.CONFIRMADA]: [
    CITA_ESTADOS.SALA_ESPERA,
    CITA_ESTADOS.EN_SERVICIO,
    CITA_ESTADOS.CANCELADA,
    CITA_ESTADOS.NO_SHOW,
  ],
  [CITA_ESTADOS.SALA_ESPERA]: [
    CITA_ESTADOS.EN_SERVICIO,
    CITA_ESTADOS.CANCELADA,
    CITA_ESTADOS.NO_SHOW,
  ],
  [CITA_ESTADOS.EN_SERVICIO]: [
    CITA_ESTADOS.PENDIENTE_PAGO,
    CITA_ESTADOS.FINALIZADA,
    CITA_ESTADOS.CANCELADA,
  ],
  [CITA_ESTADOS.PENDIENTE_PAGO]: [
    CITA_ESTADOS.FINALIZADA,
  ],
  // Estados finales no tienen transiciones automáticas
  [CITA_ESTADOS.FINALIZADA]: [],
  [CITA_ESTADOS.CANCELADA]: [],
  [CITA_ESTADOS.NO_SHOW]: [],
};

// Transiciones que requieren permisos de admin (puede ir a cualquier estado)
const TRANSICIONES_ADMIN = [
  // Desde estados finales
  { from: CITA_ESTADOS.FINALIZADA, to: CITA_ESTADOS.PENDIENTE_PAGO },
  { from: CITA_ESTADOS.FINALIZADA, to: CITA_ESTADOS.EN_SERVICIO },
  { from: CITA_ESTADOS.FINALIZADA, to: CITA_ESTADOS.AGENDADA },
  { from: CITA_ESTADOS.CANCELADA, to: CITA_ESTADOS.AGENDADA },
  { from: CITA_ESTADOS.CANCELADA, to: CITA_ESTADOS.CONFIRMADA },
  { from: CITA_ESTADOS.NO_SHOW, to: CITA_ESTADOS.AGENDADA },
  { from: CITA_ESTADOS.NO_SHOW, to: CITA_ESTADOS.CONFIRMADA },
  // Desde pendiente_pago (admin puede revertir)
  { from: CITA_ESTADOS.PENDIENTE_PAGO, to: CITA_ESTADOS.EN_SERVICIO },
  { from: CITA_ESTADOS.PENDIENTE_PAGO, to: CITA_ESTADOS.CANCELADA },
  { from: CITA_ESTADOS.PENDIENTE_PAGO, to: CITA_ESTADOS.AGENDADA },
  // Desde en_servicio
  { from: CITA_ESTADOS.EN_SERVICIO, to: CITA_ESTADOS.SALA_ESPERA },
  { from: CITA_ESTADOS.EN_SERVICIO, to: CITA_ESTADOS.AGENDADA },
  // Desde sala_espera
  { from: CITA_ESTADOS.SALA_ESPERA, to: CITA_ESTADOS.CONFIRMADA },
  { from: CITA_ESTADOS.SALA_ESPERA, to: CITA_ESTADOS.AGENDADA },
  // Desde confirmada
  { from: CITA_ESTADOS.CONFIRMADA, to: CITA_ESTADOS.AGENDADA },
];

// ============================================
// FUNCIONES DE VALIDACIÓN
// ============================================

/**
 * Normaliza un estado (maneja aliases)
 */
function normalizarEstado(estado) {
  if (!estado) return null;
  const normalized = estado.toLowerCase().trim();
  return CITA_ESTADOS_ALIAS[normalized] || normalized;
}

/**
 * Verifica si un estado es válido
 */
function esEstadoValido(estado) {
  const normalized = normalizarEstado(estado);
  return Object.values(CITA_ESTADOS).includes(normalized);
}

/**
 * Verifica si un estado es final
 */
function esEstadoFinal(estado) {
  return ESTADOS_FINALES.has(normalizarEstado(estado));
}

/**
 * Verifica si un estado es "activo" (aparece en listas de citas activas)
 */
function esEstadoActivo(estado) {
  return !ESTADOS_INACTIVOS.has(normalizarEstado(estado));
}

/**
 * Verifica si la transición de estado está permitida
 * @param {string} estadoActual - Estado actual de la cita
 * @param {string} estadoNuevo - Estado al que se quiere cambiar
 * @param {boolean} esAdmin - Si el usuario tiene permisos de admin
 * @returns {{ permitido: boolean, razon?: string }}
 */
function validarTransicion(estadoActual, estadoNuevo, esAdmin = false) {
  const actual = normalizarEstado(estadoActual);
  const nuevo = normalizarEstado(estadoNuevo);

  // Si es el mismo estado, permitir (idempotencia)
  if (actual === nuevo) {
    return { permitido: true };
  }

  // Admin puede cambiar a CUALQUIER estado
  if (esAdmin) {
    return { permitido: true, requiereAdmin: true };
  }

  // Verificar estados válidos
  if (!esEstadoValido(actual)) {
    return { permitido: false, razon: `Estado actual inválido: ${estadoActual}` };
  }
  if (!esEstadoValido(nuevo)) {
    return { permitido: false, razon: `Estado nuevo inválido: ${estadoNuevo}` };
  }

  // Verificar transiciones permitidas para no-admin
  const transicionesPermitidas = TRANSICIONES_PERMITIDAS[actual] || [];
  if (transicionesPermitidas.includes(nuevo)) {
    return { permitido: true };
  }

  // No permitido
  return {
    permitido: false,
    razon: `Transición de ${actual} a ${nuevo} no está permitida`,
  };
}

/**
 * Obtiene la configuración visual de un estado
 */
function getEstadoConfig(estado) {
  const normalized = normalizarEstado(estado);
  return ESTADO_CONFIG[normalized] || ESTADO_CONFIG[CITA_ESTADOS.AGENDADA];
}

/**
 * Obtiene las transiciones disponibles desde un estado
 */
function getTransicionesDisponibles(estadoActual, esAdmin = false) {
  const actual = normalizarEstado(estadoActual);
  const transiciones = [...(TRANSICIONES_PERMITIDAS[actual] || [])];

  if (esAdmin) {
    TRANSICIONES_ADMIN
      .filter(t => t.from === actual)
      .forEach(t => {
        if (!transiciones.includes(t.to)) {
          transiciones.push(t.to);
        }
      });
  }

  return transiciones;
}

/**
 * Renderiza un badge de estado con estilos consistentes
 */
function renderEstadoBadge(estado, opciones = {}) {
  const config = getEstadoConfig(estado);
  const { clase = '', inline = true } = opciones;

  const style = `
    display:${inline ? 'inline-flex' : 'flex'};
    align-items:center;
    gap:5px;
    padding:3px 10px;
    border-radius:999px;
    font-size:10px;
    font-weight:700;
    text-transform:uppercase;
    letter-spacing:0.3px;
    background:${config.bgColor};
    border:1px solid ${config.borderColor};
    color:${config.color};
  `.replace(/\s+/g, ' ');

  return `<span class="estado-badge ${clase}" style="${style}">${config.labelCorto}</span>`;
}

// ============================================
// QUERIES HELPERS
// ============================================

/**
 * Retorna el filtro SQL para citas activas
 */
function filtroEstadosActivos() {
  return Array.from(ESTADOS_INACTIVOS).map(e => `'${e}'`).join(',');
}

/**
 * Retorna el array de estados activos para usar con Supabase .in()
 */
function arrayEstadosActivos() {
  return Object.values(CITA_ESTADOS).filter(e => !ESTADOS_INACTIVOS.has(e));
}

/**
 * Retorna el array de estados para historial
 */
function arrayEstadosHistorial() {
  return [CITA_ESTADOS.FINALIZADA, CITA_ESTADOS.CANCELADA, CITA_ESTADOS.NO_SHOW];
}

// ============================================
// EXPORTAR (para uso en módulos ES6 o como global)
// ============================================

if (typeof window !== 'undefined') {
  window.CITA_ESTADOS = CITA_ESTADOS;
  window.ESTADOS_FINALES = ESTADOS_FINALES;
  window.ESTADO_CONFIG = ESTADO_CONFIG;
  window.validarTransicion = validarTransicion;
  window.esEstadoFinal = esEstadoFinal;
  window.esEstadoActivo = esEstadoActivo;
  window.getEstadoConfig = getEstadoConfig;
  window.getTransicionesDisponibles = getTransicionesDisponibles;
  window.renderEstadoBadge = renderEstadoBadge;
  window.normalizarEstado = normalizarEstado;
  window.arrayEstadosActivos = arrayEstadosActivos;
  window.arrayEstadosHistorial = arrayEstadosHistorial;
}

// Para Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CITA_ESTADOS,
    ESTADOS_FINALES,
    ESTADO_PRIORIDAD,
    ESTADO_CONFIG,
    TRANSICIONES_PERMITIDAS,
    validarTransicion,
    esEstadoFinal,
    esEstadoActivo,
    getEstadoConfig,
    getTransicionesDisponibles,
    normalizarEstado,
    arrayEstadosActivos,
    arrayEstadosHistorial,
  };
}
