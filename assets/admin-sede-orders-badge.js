/**
 * Badge de órdenes pendientes para sidebar de admin_sede
 * Actualiza el badge en el enlace de Órdenes
 */
(function() {
  'use strict';

  // No ejecutar en modo popup
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('popup') === '1') return;

  let lastCount = 0;

  // Actualizar el badge existente de órdenes
  function updateBadge(count) {
    const badge = document.getElementById('ordenesBadge');
    if (!badge) return;

    badge.textContent = count > 99 ? '99+' : count.toString();

    if (count > 0) {
      badge.classList.add('has-orders');
      // Pulsar si hay nuevas órdenes
      if (count > lastCount && lastCount > 0) {
        badge.classList.add('pulse');
        setTimeout(() => badge.classList.remove('pulse'), 600);
      }
    } else {
      badge.classList.remove('has-orders');
    }

    lastCount = count;
  }

  // Cargar conteo de órdenes pendientes
  async function loadOrdersCount() {
    try {
      // Verificar que tenemos acceso a supabase y la sede
      if (typeof dnGetTurnoSedeActual !== 'function') return;

      const sedeId = dnGetTurnoSedeActual();
      if (!sedeId) return;

      // Usar sb global (cliente supabase)
      if (typeof sb === 'undefined') return;

      // Contar citas pendientes de pago
      const { count, error } = await sb
        .from('citas')
        .select('id', { count: 'exact', head: true })
        .eq('sucursal_id', sedeId)
        .eq('estado', 'pendiente_pago');

      if (error) {
        console.error('Error cargando órdenes:', error);
        return;
      }

      updateBadge(count || 0);
    } catch (err) {
      console.error('Error en loadOrdersCount:', err);
    }
  }

  // Inicializar cuando DOM esté listo
  function init() {
    // Esperar a que el badge exista
    const checkBadge = setInterval(() => {
      const badge = document.getElementById('ordenesBadge');
      if (badge) {
        clearInterval(checkBadge);

        // Cargar inmediatamente
        loadOrdersCount();

        // Polling cada 60 segundos (optimizado de 15s para reducir requests)
        setInterval(loadOrdersCount, 60000);
      }
    }, 100);

    // Timeout de seguridad
    setTimeout(() => clearInterval(checkBadge), 10000);
  }

  // Iniciar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
