/**
 * Sidebar exclusivo para admin_sede - BLOQUEADO contra cambios
 * Este sidebar es fijo y no debe modificarse por ningún otro script
 */
(function() {
  'use strict';

  const urlParams = new URLSearchParams(window.location.search);
  const isAdminSedePath = window.location.pathname.includes('/admin_sede/');
  const hasAdminSedeParam = urlParams.get('admin_sede') === '1';

  // Ejecutar si está en /admin_sede/ O tiene ?admin_sede=1
  if (!isAdminSedePath && !hasAdminSedeParam) return;

  // Marcar que estamos en admin_sede para bloquear otros sidebars
  window.__ADMIN_SEDE_SIDEBAR_LOCKED__ = true;

  // Detectar página actual para marcar como activa
  const currentPage = window.location.pathname.split('/').pop().replace('.html', '');

  function getActiveClass(page) {
    return currentPage === page ? ' active' : '';
  }

  function init() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // Obtener estado expandido del localStorage
    const isExpanded = localStorage.getItem('sidebarExpanded') === '1';

    // Reemplazar contenido completo del sidebar
    sidebar.innerHTML = `
    <img src="../assets/apple-touch-icon-v2.png" class="sidebar-logo sidebar-logo-icon" id="sidebarLogoIcon" alt="Logo" onclick="toggleSidebar()">
    <img src="../assets/logo.png" class="sidebar-logo sidebar-logo-full" id="sidebarLogoFull" alt="Keicy Barberia" onclick="toggleSidebar()">

    <div class="sidebar-card" id="sidebarSedeCard" onclick="toggleSedeSelector()" style="cursor:pointer;">
      <div class="sidebar-card-icon">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-5 9 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      </div>
      <div class="sidebar-card-info">
        <div class="sidebar-card-name" id="sedeName">Cargando...</div>
        <div class="sidebar-card-sub">Cambiar sede <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
    </div>
    <div class="sede-selector" id="sedeSelector">
      <div class="sede-selector-title">Seleccionar sede</div>
      <div class="sede-selector-list" id="sedeSelectorList"></div>
    </div>

    <div class="nav-group">
      <div class="nav-section-label">Gestionar</div>
      <a class="nav-link${getActiveClass('caja')}" href="caja.html?admin_sede=1" data-modulo="caja">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M3 11h18M9 15h2" stroke-linecap="round"/></svg>
        <span class="nav-label">Cuadre de caja</span>
      </a>
      <a class="nav-link${getActiveClass('clientes')}" href="clientes.html?admin_sede=1" data-modulo="clientes">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.4"/><path d="M4.5 20c1.6-3.6 4.4-5.4 7.5-5.4s5.9 1.8 7.5 5.4" stroke-linecap="round"/></svg>
        <span class="nav-label">Clientes</span>
      </a>
      <a class="nav-link${getActiveClass('calendario')}" href="calendario.html?admin_sede=1" data-modulo="calendario">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 14h2M13 14h2" stroke-linecap="round"/></svg>
        <span class="nav-label">Agenda</span>
      </a>
      <a class="nav-link${getActiveClass('ventas')}" href="../admin_sede/ventas.html" data-modulo="ventas">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
        <span class="nav-label">Vender</span>
      </a>
      <a class="nav-link${getActiveClass('ordenes')}" href="../admin_sede/ordenes.html" data-modulo="ordenes" id="ordenesEnEsperaLink">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4" stroke-linecap="round"/></svg>
        <span class="nav-label">Órdenes en espera</span>
        <span class="nav-badge" id="ordenesBadge">0</span>
      </a>
      <div class="nav-section-label">Desempeño</div>
      <a class="nav-link${getActiveClass('historial')}" href="../admin_sede/historial.html" data-modulo="historial">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
        <span class="nav-label">Historial</span>
      </a>
      <a class="nav-link${getActiveClass('estadisticas')}" href="../admin_sede/estadisticas.html" data-modulo="estadisticas">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
        <span class="nav-label">Estadísticas</span>
      </a>
      <a class="nav-link${getActiveClass('configuracion')}" href="../admin_sede/configuracion.html" data-modulo="configuracion">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span class="nav-label">Configuración</span>
      </a>
    </div>

    <div class="sidebar-bottom">
      <div class="logout-btn" id="logoutBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span class="logout-label">Cerrar sesión</span>
      </div>
      <a class="nav-link help-link" href="https://wa.me/573212319355" target="_blank">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01"/></svg>
        <span class="nav-label">Centro de ayuda</span>
      </a>
    </div>
    `;

    // Aplicar estado expandido
    if (isExpanded) {
      sidebar.classList.add('expanded');
    }

    // Agregar estilos necesarios para sede-selector y sidebar-card-icon
    addStyles();

    // Cargar sedes
    loadSedes();

    // Configurar logout
    setupLogout();
  }

  function addStyles() {
    if (document.getElementById('admin-sede-sidebar-styles')) return;
    const style = document.createElement('style');
    style.id = 'admin-sede-sidebar-styles';
    style.textContent = `
      .sidebar-card-icon { width:32px; height:32px; display:flex; align-items:center; justify-content:center; background:var(--glass-2, rgba(255,255,255,0.04)); border-radius:8px; flex-shrink:0; }
      .sede-selector { display:none; background:var(--card, #1c1c1c); border:1px solid var(--divider, rgba(255,255,255,0.08)); border-radius:12px; margin-bottom:12px; overflow:hidden; }
      .sidebar.expanded .sede-selector.show { display:block; }
      .sede-selector-title { padding:10px 12px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-secondary, rgba(255,255,255,0.5)); border-bottom:1px solid var(--divider, rgba(255,255,255,0.08)); }
      .sede-option { display:flex; align-items:center; gap:10px; padding:10px 12px; cursor:pointer; transition:background 0.15s; }
      .sede-option:hover { background:var(--glass-2, rgba(255,255,255,0.04)); }
      .sede-option.active { background:var(--gold, #D4AF55); color:#141414; }
      .sede-option-icon { width:28px; height:28px; border-radius:8px; background:var(--glass-2, rgba(255,255,255,0.06)); display:flex; align-items:center; justify-content:center; }
      .sede-option.active .sede-option-icon { background:rgba(0,0,0,0.15); }
      .sede-option-name { font-size:12px; font-weight:600; }
      .nav-badge { display:none; min-width:18px; height:18px; padding:0 5px; background:#e74c3c; color:var(--text); border-radius:9px; font-size:10px; font-weight:700; line-height:18px; text-align:center; }
      .nav-badge.has-orders { display:inline-block; }
      .sidebar:not(.expanded) .nav-badge.has-orders { position:absolute; top:6px; right:6px; width:8px; height:8px; min-width:8px; padding:0; font-size:0; border-radius:50%; }
    `;
    document.head.appendChild(style);
  }

  async function loadSedes() {
    try {
      if (typeof sb === 'undefined') return;

      const { data: sedes, error } = await sb
        .from('sucursales')
        .select('id, nombre')
        .order('nombre');

      if (error || !sedes) return;

      const sedeActual = typeof dnGetTurnoSedeActual === 'function' ? dnGetTurnoSedeActual() : null;

      // Actualizar nombre de sede actual
      const sedeName = document.getElementById('sedeName');
      if (sedeName && sedeActual) {
        const sedeInfo = sedes.find(s => s.id === sedeActual);
        if (sedeInfo) sedeName.textContent = sedeInfo.nombre;
      }

      // Llenar lista de sedes
      const list = document.getElementById('sedeSelectorList');
      if (list) {
        list.innerHTML = sedes.map(sede => `
          <div class="sede-option ${sede.id === sedeActual ? 'active' : ''}" onclick="cambiarSedeAdmin('${sede.id}')">
            <div class="sede-option-icon">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-5 9 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <span class="sede-option-name">${sede.nombre}</span>
          </div>
        `).join('');
      }

      // Cargar badge de órdenes
      loadOrdersBadge(sedeActual);
    } catch (err) {
      console.error('Error cargando sedes:', err);
    }
  }

  async function loadOrdersBadge(sedeId) {
    try {
      if (!sedeId || typeof sb === 'undefined') return;

      const { count, error } = await sb
        .from('citas')
        .select('id', { count: 'exact', head: true })
        .eq('sucursal_id', sedeId)
        .eq('estado', 'pendiente_pago');

      if (error) return;

      const badge = document.getElementById('ordenesBadge');
      if (badge) {
        badge.textContent = count > 99 ? '99+' : count.toString();
        if (count > 0) {
          badge.classList.add('has-orders');
        } else {
          badge.classList.remove('has-orders');
        }
      }
    } catch (err) {
      console.error('Error cargando badge:', err);
    }
  }

  function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.onclick = function() {
        if (confirm('¿Seguro que deseas cerrar sesión?')) {
          if (typeof dnClearSession === 'function') dnClearSession();
          if (typeof dnClearTurnoSede === 'function') dnClearTurnoSede();
          window.location.href = '../auth.html';
        }
      };
    }
  }

  // Función global para toggle sidebar expandido/colapsado
  window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const isExpanded = sidebar.classList.toggle('expanded');
    localStorage.setItem('sidebarExpanded', isExpanded ? '1' : '0');

    // Cerrar selector de sede si se colapsa
    if (!isExpanded) {
      const selector = document.getElementById('sedeSelector');
      if (selector) selector.classList.remove('show');
    }
  };

  // Función global para toggle sede selector
  window.toggleSedeSelector = function() {
    const selector = document.getElementById('sedeSelector');
    if (selector) selector.classList.toggle('show');
  };

  // Función global para cambiar sede
  window.cambiarSedeAdmin = function(nuevaSedeId) {
    if (typeof dnSetTurnoSedeActual === 'function') {
      dnSetTurnoSedeActual(nuevaSedeId);
    }
    if (typeof dnSetSedeActual === 'function') {
      dnSetSedeActual(nuevaSedeId);
    }
    window.location.reload();
  };

  // Verificar estado del turno y mostrar pantalla de bloqueo si está cerrado
  async function checkTurnoStatus() {
    try {
      if (typeof sb === 'undefined') return;

      // Intentar obtener sedeId de varias fuentes
      let sedeId = typeof dnGetTurnoSedeActual === 'function' ? dnGetTurnoSedeActual() : null;
      if (!sedeId && typeof dnGetSedeActual === 'function') {
        sedeId = dnGetSedeActual();
      }
      if (!sedeId) {
        // Intentar obtener de localStorage directamente
        sedeId = localStorage.getItem('dn_sede_actual');
      }
      if (!sedeId) return;

      // Obtener fecha de hoy en formato ISO
      const today = new Date();
      const todayISO = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

      // Buscar si hay sesión de caja abierta
      const { data: sesionAbierta } = await sb
        .from('caja_sesiones')
        .select('id')
        .eq('estado', 'abierta')
        .eq('sucursal_id', sedeId)
        .limit(1);

      // Si hay sesión abierta, no bloquear
      if (sesionAbierta && sesionAbierta.length > 0) return;

      // Buscar si hay sesión cerrada hoy
      const { data: sesionCerrada } = await sb
        .from('caja_sesiones')
        .select('id')
        .eq('estado', 'cerrada')
        .eq('sucursal_id', sedeId)
        .gte('cerrada_at', todayISO + 'T00:00:00')
        .limit(1);

      // Si hay sesión cerrada hoy, mostrar pantalla de bloqueo
      if (sesionCerrada && sesionCerrada.length > 0) {
        mostrarPantallaBloqueo();
      }
    } catch (err) {
      console.error('Error verificando estado del turno:', err);
    }
  }

  function mostrarPantallaBloqueo() {
    // No mostrar en la página de caja (ya tiene su propia lógica)
    if (currentPage === 'caja') return;

    // Agregar estilos de bloqueo
    const style = document.createElement('style');
    style.id = 'turno-cerrado-styles';
    style.textContent = `
      .turno-cerrado-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        width: 100vw; height: 100vh;
        background: var(--bg, #141414);
        z-index: 99999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 24px;
      }
      .turno-cerrado-icon {
        font-size: 64px;
        margin-bottom: 16px;
        opacity: 0.8;
      }
      .turno-cerrado-title {
        font-size: 32px;
        font-weight: 800;
        margin-bottom: 12px;
        color: var(--text, #fff);
      }
      .turno-cerrado-title em {
        font-style: italic;
        color: var(--gold, #D4AF55);
      }
      .turno-cerrado-subtitle {
        font-size: 14px;
        color: var(--text-secondary, rgba(255,255,255,0.5));
        max-width: 400px;
        line-height: 1.6;
        margin-bottom: 32px;
      }
      .turno-cerrado-card {
        background: var(--card, #1c1c1c);
        border: 1px solid var(--divider, rgba(255,255,255,0.08));
        border-radius: 16px;
        padding: 24px;
        max-width: 360px;
        width: 100%;
      }
      .turno-cerrado-card-title {
        font-size: 16px;
        font-weight: 700;
        margin-bottom: 8px;
        color: var(--text, #fff);
      }
      .turno-cerrado-card-text {
        font-size: 13px;
        color: var(--text-secondary, rgba(255,255,255,0.5));
        line-height: 1.5;
        margin-bottom: 16px;
      }
      .turno-cerrado-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        padding: 14px 20px;
        border: none;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        background: linear-gradient(180deg, var(--gold-bright, #E8C547), var(--gold, #D4AF55));
        color: #141414;
        text-decoration: none;
      }
      .turno-cerrado-btn:hover {
        opacity: 0.9;
      }
    `;
    document.head.appendChild(style);

    // Crear overlay de bloqueo
    const overlay = document.createElement('div');
    overlay.className = 'turno-cerrado-overlay';
    overlay.innerHTML = `
      <div class="turno-cerrado-icon">🔒</div>
      <div class="turno-cerrado-title">Turno <em>cerrado</em></div>
      <div class="turno-cerrado-subtitle">
        El turno de hoy ha finalizado. Para continuar operando debes iniciar un nuevo turno.
      </div>
      <div class="turno-cerrado-card">
        <div class="turno-cerrado-card-title">Iniciar nuevo turno</div>
        <div class="turno-cerrado-card-text">
          Al abrir un nuevo turno podrás registrar ventas, gastos y movimientos. Se te pedirá seleccionar responsable, base de caja e inventario de bebidas.
        </div>
        <a class="turno-cerrado-btn" href="${isAdminSedePath ? '../admin/caja.html?admin_sede=1' : 'caja.html?admin_sede=1'}">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
          Abrir nuevo turno
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </a>
      </div>
    `;
    document.body.appendChild(overlay);

    // Ocultar sidebar y contenido
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.style.display = 'none';
  }

  // Guardar el HTML del sidebar para protección
  let sidebarHTML = null;

  function protectSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar || !sidebarHTML) return;

    // Usar MutationObserver para detectar cambios no autorizados
    const observer = new MutationObserver((mutations) => {
      // Si el sidebar fue modificado externamente, restaurarlo
      const currentHTML = sidebar.innerHTML;
      if (currentHTML !== sidebarHTML && !currentHTML.includes('nav-section-label')) {
        console.warn('[admin-sede-sidebar] Intento de modificación bloqueado');
        sidebar.innerHTML = sidebarHTML;
        // Re-aplicar estado expandido
        const isExpanded = localStorage.getItem('sidebarExpanded') === '1';
        if (isExpanded) sidebar.classList.add('expanded');
        // Re-cargar sedes
        loadSedes();
      }
    });

    observer.observe(sidebar, { childList: true, subtree: true, characterData: true });
  }

  // Iniciar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      // Guardar HTML para protección
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebarHTML = sidebar.innerHTML;
      protectSidebar();
      // Verificar estado del turno después de un pequeño delay para asegurar que sb esté disponible
      setTimeout(checkTurnoStatus, 200);
    });
  } else {
    setTimeout(() => {
      init();
      // Guardar HTML para protección
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebarHTML = sidebar.innerHTML;
      protectSidebar();
      setTimeout(checkTurnoStatus, 200);
    }, 50);
  }
})();
