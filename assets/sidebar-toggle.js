/**
 * Script unificado para el toggle del sidebar
 * Funciona en todas las páginas de admin_sede y admin
 */
(function() {
  'use strict';

  const STORAGE_KEY = 'sidebarExpanded';

  function init() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // Restaurar estado guardado
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState === 'true') {
      sidebar.classList.add('expanded');
    } else if (savedState === 'false') {
      sidebar.classList.remove('expanded');
    }

    // Función de toggle
    function toggleSidebar(e) {
      if (e) e.stopPropagation();
      sidebar.classList.toggle('expanded');
      localStorage.setItem(STORAGE_KEY, sidebar.classList.contains('expanded'));
    }

    // Asignar a window para uso global
    window.toggleSidebar = toggleSidebar;

    // Event listeners para logos
    const logoIcon = document.getElementById('sidebarLogoIcon');
    const logoFull = document.getElementById('sidebarLogoFull');
    const toggleBtn = document.getElementById('sidebarToggleBtn');

    if (logoIcon) logoIcon.addEventListener('click', toggleSidebar);
    if (logoFull) logoFull.addEventListener('click', toggleSidebar);
    if (toggleBtn) toggleBtn.addEventListener('click', toggleSidebar);

    // Cerrar sidebar al hacer click fuera (solo en móvil expandido)
    document.addEventListener('click', function(e) {
      if (window.innerWidth <= 768) return; // No en móvil
      if (!sidebar.classList.contains('expanded')) return;
      
      // Si el click fue dentro del sidebar, no hacer nada
      if (sidebar.contains(e.target)) return;
      
      // Si el click fue en un botón de toggle, no hacer nada (ya se manejó)
      if (e.target.closest('#sidebarToggleBtn')) return;
    });

    // Agregar transición CSS si no existe
    if (!sidebar.style.transition) {
      sidebar.style.transition = 'width 0.28s cubic-bezier(.22,1,.36,1), padding 0.28s cubic-bezier(.22,1,.36,1)';
    }
  }

  // Iniciar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
