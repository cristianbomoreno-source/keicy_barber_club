// ============================================
// Navegación Móvil Unificada - Keicy Barbería
// Compatible con iPhone Dynamic Island y Safe Areas
// FUENTE ÚNICA DE VERDAD para la navegación inferior
// ============================================

(function() {
  'use strict';

  // Configuración de la navegación para admin
  const adminNavItems = [
    { href: 'dashboard.html', label: 'Inicio', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>' },
    { href: 'calendario.html', label: 'Agenda', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M8 3v4M16 3v4" stroke-linecap="round"/></svg>' },
    { href: 'caja.html', label: 'Caja', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/><rect x="5" y="14" width="14" height="3" rx="1"/></svg>' },
    { href: 'clientes.html', label: 'Clientes', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.4"/><path d="M4.5 20c1.6-3.6 4.4-5.4 7.5-5.4s5.9 1.8 7.5 5.4" stroke-linecap="round"/></svg>' },
    { href: 'configuracion.html', label: 'Config', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg>' }
  ];

  // Configuración de la navegación para barbero
  const barberoNavItems = [
    {
      href: 'home.html',
      label: 'Inicio',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 11.5 12 4l9 7.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 10v9.5a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      activeOn: ['home.html', 'index.html', '']
    },
    {
      href: 'agenda.html',
      label: 'Agenda',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="4" y="5" width="16" height="15" rx="4"/><path d="M8 3v4M16 3v4M4 10h16" stroke-linecap="round"/></svg>',
      activeOn: ['agenda.html']
    },
    {
      href: 'perfil.html',
      label: 'Perfil',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="8" r="3.4"/><path d="M4.5 20c1.6-3.6 4.4-5.4 7.5-5.4s5.9 1.8 7.5 5.4" stroke-linecap="round"/></svg>',
      activeOn: ['perfil.html']
    }
  ];

  // Configuración de la navegación para recepcion
  const recepcionNavItems = [
    {
      href: 'dashboard.html',
      label: 'Inicio',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>',
      activeOn: ['dashboard.html', 'index.html', '']
    },
    {
      href: '../admin/calendario.html',
      label: 'Agenda',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 14h2M13 14h2M9 17h2" stroke-linecap="round"/></svg>',
      activeOn: ['calendario.html']
    },
    {
      href: '../admin/caja.html',
      label: 'Caja',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M3 11h18M9 15h2" stroke-linecap="round"/></svg>',
      activeOn: ['caja.html']
    }
  ];

  // Configuración de la navegación para admin_sede
  // ÚNICA FUENTE DE VERDAD: 5 opciones fijas
  // Caja | Agenda | Venta | Historial | Config
  const adminSedeNavItems = [
    {
      href: 'caja.html',
      label: 'Caja',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M3 11h18"/></svg>',
      activeOn: ['caja.html', 'solicitar-reapertura.html', 'cerrar-turno.html']
    },
    {
      href: 'calendario.html',
      label: 'Agenda',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16" stroke-linecap="round"/></svg>',
      activeOn: ['calendario.html', 'nueva-cita.html']
    },
    {
      href: 'ventas.html',
      label: 'Venta',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>',
      activeOn: ['ventas.html', 'ordenes.html', 'dashboard.html', 'seleccionar-sede.html', 'iniciar-turno.html'],
      hasBadge: true,
      badgeId: 'navOrdenesBadge'
    },
    {
      href: 'historial.html',
      label: 'Historial',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>',
      activeOn: ['historial.html']
    },
    {
      href: 'configuracion.html',
      label: 'Config',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
      activeOn: ['configuracion.html', 'estadisticas.html']
    }
  ];

  // Detectar si estamos en modo popup (no mostrar navegación)
  function isPopupMode() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('popup') === '1' || document.documentElement.classList.contains('popup-mode');
  }

  function isAdminSede() {
    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    // Detectar admin_sede por pathname O por parámetro ?admin_sede=1
    return path.includes('/admin_sede/') || path.includes('admin_sede/') || urlParams.get('admin_sede') === '1';
  }

  function isAdmin() {
    const path = window.location.pathname;
    return (path.includes('/admin/') || path.includes('admin/')) && !isAdminSede();
  }

  function isBarbero() {
    const path = window.location.pathname;
    return path.includes('/barbero/') || path.includes('barbero/');
  }

  function isRecepcion() {
    const path = window.location.pathname;
    return path.includes('/recepcion/') || path.includes('recepcion/');
  }

  function getCurrentPage() {
    const path = window.location.pathname;
    const page = path.split('/').pop() || 'dashboard.html';
    return page;
  }

  // Determinar qué item de navegación debe estar activo
  function getActiveItem(navItems, currentPage) {
    for (const item of navItems) {
      // Si tiene lista de páginas activas, verificar
      if (item.activeOn && item.activeOn.includes(currentPage)) {
        return item.href;
      }
      // Verificación simple por href
      if (currentPage === item.href) {
        return item.href;
      }
    }
    // Default a dashboard si no hay coincidencia
    if (currentPage === '' || currentPage === 'index.html') {
      return 'dashboard.html';
    }
    return null;
  }

  // Los estilos están en design-system.css para evitar FOUT
  // Esta función ya no inyecta estilos
  function injectStyles() {
    // Estilos movidos a design-system.css
  }

  function createMobileNav() {
    // No crear navegación en modo popup
    if (isPopupMode()) {
      return;
    }

    const currentPage = getCurrentPage();
    const inAdminSede = isAdminSede();
    const inAdmin = isAdmin();
    const inBarbero = isBarbero();
    const inRecepcion = isRecepcion();

    // Solo mostrar navegación si estamos en admin, admin_sede, barbero o recepcion
    if (!inAdminSede && !inAdmin && !inBarbero && !inRecepcion) {
      return;
    }

    const navItems = inRecepcion ? recepcionNavItems : (inBarbero ? barberoNavItems : (inAdminSede ? adminSedeNavItems : adminNavItems));
    const activeHref = getActiveItem(navItems, currentPage);

    // Inyectar estilos primero
    injectStyles();

    // Eliminar TODAS las navegaciones existentes (incluyendo duplicados)
    document.querySelectorAll('nav.mobile-nav, .dn-bottom-nav, .tab-bar').forEach(el => el.remove());

    // Crear nueva navegación
    const nav = document.createElement('nav');
    nav.className = 'mobile-nav';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Navegación principal');

    // Determinar si estamos en modo admin_sede pero en ruta de /admin/
    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const isAdminSedeInAdminPath = inAdminSede && (path.includes('/admin/') && !path.includes('/admin_sede/'));

    navItems.forEach(item => {
      const a = document.createElement('a');

      // Si es admin_sede navegando en /admin/, redirigir a /admin_sede/
      let href = item.href;
      if (isAdminSedeInAdminPath && !href.startsWith('..') && !href.startsWith('/')) {
        href = '../admin_sede/' + href;
      }
      a.href = href;

      a.className = 'mobile-nav-item';
      a.setAttribute('aria-label', item.label);

      // Marcar como activo
      if (activeHref === item.href) {
        a.classList.add('active');
        a.setAttribute('aria-current', 'page');
      }

      // Agregar badge si está configurado
      let badgeHtml = '';
      if (item.hasBadge && item.badgeId) {
        badgeHtml = `<span class="nav-badge" id="${item.badgeId}" style="display:none;">0</span>`;
      }

      a.innerHTML = item.icon + badgeHtml + '<span>' + item.label + '</span>';
      nav.appendChild(a);
    });

    // Insertar antes del cierre del body
    document.body.appendChild(nav);
  }

  // Función global para ocultar/mostrar navegación (para modales)
  window.hideBottomNav = function() {
    const nav = document.querySelector('.mobile-nav');
    if (nav) nav.style.display = 'none';
  };

  window.showBottomNav = function() {
    const nav = document.querySelector('.mobile-nav');
    if (nav) nav.style.display = '';
  };

  // Ejecutar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createMobileNav);
  } else {
    createMobileNav();
  }

  // Re-evaluar si se cambia el modo popup dinámicamente
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.attributeName === 'class') {
        const nav = document.querySelector('.mobile-nav');
        if (isPopupMode() && nav) {
          nav.style.display = 'none';
        } else if (!isPopupMode() && nav) {
          nav.style.display = '';
        }
      }
    });
  });

  observer.observe(document.documentElement, { attributes: true });

  // ============================================
  // Sistema de notificaciones de órdenes pendientes
  // ============================================

  // Función global para actualizar el badge de órdenes
  window.updateNavOrdenesBadge = function(count) {
    // Actualizar badge en navegación móvil
    const badge = document.getElementById('navOrdenesBadge');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
      if (count > 0) {
        badge.classList.add('pulse');
        setTimeout(() => badge.classList.remove('pulse'), 1000);
      }
    }
    // También actualizar badge del sidebar si existe
    const sidebarBadge = document.getElementById('navOrdersBadge');
    if (sidebarBadge) {
      sidebarBadge.textContent = count > 99 ? '99+' : count.toString();
      if (count > 0) {
        sidebarBadge.classList.add('visible');
      } else {
        sidebarBadge.classList.remove('visible');
      }
    }
  };

  // Alias para compatibilidad
  window.updateNavVentasBadge = window.updateNavOrdenesBadge;

  // Cargar órdenes pendientes y actualizar badge
  async function loadOrdenesPendientesNav() {
    // Solo ejecutar si estamos en admin_sede y hay Supabase disponible
    if (!isAdminSede() || typeof window.sb === 'undefined') return;

    try {
      const sedeId = window.dnGetTurnoSedeActual ? window.dnGetTurnoSedeActual() : null;
      if (!sedeId) return;

      // Contar citas en estado pendiente_pago de esta sede
      const { count, error } = await window.sb
        .from('citas')
        .select('id', { count: 'exact', head: true })
        .eq('sucursal_id', sedeId)
        .eq('estado', 'pendiente_pago');

      if (!error) {
        window.updateNavVentasBadge(count || 0);
      }
    } catch (err) {
      console.error('Error cargando órdenes para nav:', err);
    }
  }

  // Suscribirse a cambios en citas (realtime)
  function subscribeToOrdenes() {
    if (!isAdminSede() || typeof window.sb === 'undefined') return;

    const sedeId = window.dnGetTurnoSedeActual ? window.dnGetTurnoSedeActual() : null;
    if (!sedeId) return;

    // Suscribirse a cambios en citas de la sede
    window.sb
      .channel('ordenes-nav-' + sedeId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'citas',
        filter: `sucursal_id=eq.${sedeId}`
      }, () => {
        // Recargar conteo cuando hay cambios
        loadOrdenesPendientesNav();
      })
      .subscribe();
  }

  // Inicializar después de que Supabase esté disponible
  function initOrdenesNotifications() {
    if (typeof window.sb !== 'undefined') {
      loadOrdenesPendientesNav();
      subscribeToOrdenes();
    } else {
      // Reintentar después de un momento
      setTimeout(initOrdenesNotifications, 500);
    }
  }

  // Iniciar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initOrdenesNotifications, 100);
    });
  } else {
    setTimeout(initOrdenesNotifications, 100);
  }
})();
