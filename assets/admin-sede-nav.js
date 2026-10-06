// admin-sede-nav.js
// Este script modifica la navegación cuando un admin_sede está viendo páginas de admin

(function() {
  const isAdminSede = new URLSearchParams(window.location.search).get('admin_sede') === '1';
  if (!isAdminSede) return;

  // Esperar a que el DOM esté listo
  function initAdminSedeNav() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const navGroup = sidebar.querySelector('.nav-group');
    if (navGroup) {
      // Determinar qué página está activa
      const currentPath = window.location.pathname;
      const isCalendario = currentPath.includes('calendario');
      const isClientes = currentPath.includes('clientes');
      const isCaja = currentPath.includes('caja');
      const isFidelizacion = currentPath.includes('fidelizacion');
      const isBarberos = currentPath.includes('barberos');
      const isInventario = currentPath.includes('inventario');
      const isServicios = currentPath.includes('servicios');

      navGroup.innerHTML = `
        <div class="nav-section-label">Gestionar</div>
        <a class="nav-link" href="../admin_sede/ventas.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          <span class="nav-label">Ventas</span>
        </a>
        <a class="nav-link ${isCalendario ? 'active' : ''}" href="../admin_sede/calendario.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 14h2M13 14h2" stroke-linecap="round"/></svg>
          <span class="nav-label">Agenda</span>
        </a>
        <a class="nav-link ${isClientes ? 'active' : ''}" href="../admin_sede/clientes.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.4"/><path d="M4.5 20c1.6-3.6 4.4-5.4 7.5-5.4s5.9 1.8 7.5 5.4" stroke-linecap="round"/></svg>
          <span class="nav-label">Clientes</span>
        </a>
        <a class="nav-link ${isCaja ? 'active' : ''}" href="../admin_sede/caja.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M3 11h18M9 15h2" stroke-linecap="round"/></svg>
          <span class="nav-label">Caja</span>
        </a>
        <a class="nav-link ${isFidelizacion ? 'active' : ''}" href="../admin_sede/fidelizacion.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 17.3 6.2 21l1.6-6.9L2.5 9.5l7-.6L12 2.3l2.5 6.6 7 .6-5.3 4.6 1.6 6.9z" stroke-linejoin="round"/></svg>
          <span class="nav-label">Fidelización</span>
        </a>
        <div class="nav-section-label">Operaciones</div>
        <a class="nav-link ${isBarberos ? 'active' : ''}" href="../admin_sede/barberos.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20c1.3-3.6 3.7-5.2 6-5.2s4.7 1.6 6 5.2M14.5 14.8c2 .3 3.7 1.7 4.5 4.2" stroke-linecap="round"/></svg>
          <span class="nav-label">Colaboradores</span>
        </a>
        <a class="nav-link ${isInventario ? 'active' : ''}" href="../admin_sede/inventario.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 8v8l9 5 9-5V8"/></svg>
          <span class="nav-label">Inventario</span>
        </a>
        <a class="nav-link ${isServicios ? 'active' : ''}" href="../admin_sede/servicios.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8.5 7.5 20 19M8.5 16.5 20 5"/></svg>
          <span class="nav-label">Servicios</span>
        </a>
      `;
    }

    // Ocultar sidebar-card (selector de sede) y plan-card
    const sidebarCard = sidebar.querySelector('.sidebar-card');
    if (sidebarCard) sidebarCard.style.display = 'none';
    const planCard = sidebar.querySelector('.plan-card');
    if (planCard) planCard.style.display = 'none';
  }

  // Ejecutar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminSedeNav);
  } else {
    initAdminSedeNav();
  }
})();
