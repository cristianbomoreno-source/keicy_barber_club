// ============================================
// Theme Manager - Keicy Barbería
// Sistema de temas claro/oscuro
// ============================================

(function() {
  const THEME_KEY = 'dn_theme';

  // Obtener tema guardado o usar 'light' por defecto
  function getTheme() {
    return localStorage.getItem(THEME_KEY) || 'light';
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
      metaTheme.content = theme === 'dark' ? '#0A0A0C' : '#FFFFFF';
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
