// ============================================
// Theme Manager - Keicy Barbería
// Sistema de temas claro/oscuro
// ============================================

(function() {
  const THEME_KEY = 'dn_theme';

  // Obtener tema guardado o usar 'dark' por defecto (Manual de Marca: negro dominante)
  function getTheme() {
    return localStorage.getItem(THEME_KEY) || 'dark';
  }

  // Guardar tema
  function setTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  }

  // Aplicar tema al documento
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    // Actualizar meta theme-color
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.content = theme === 'dark' ? '#000000' : '#FFFFFF';
    }
  }

  // Toggle tema
  function toggleTheme() {
    const current = getTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
    return next;
  }

  // Aplicar tema inmediatamente (antes de que se renderice la página)
  applyTheme(getTheme());

  // Exportar funciones globales
  window.dnGetTheme = getTheme;
  window.dnSetTheme = setTheme;
  window.dnToggleTheme = toggleTheme;
})();
