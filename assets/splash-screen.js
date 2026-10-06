// ============================================
// Splash Screen - Keicy Barbería
// Compatible con sistema de temas
// ============================================

(function() {
  // Solo mostrar en la primera carga de la sesión
  const splashShown = sessionStorage.getItem('dn_splash_shown');
  if (splashShown) return;

  // Detectar tema actual
  const theme = localStorage.getItem('dn_theme') || 'light';
  const isDark = theme === 'dark';
  const bgColor = isDark ? '#0A0A0C' : '#FFFFFF';
  const logoFilter = isDark ? 'none' : 'none';

  // Crear estilos
  const style = document.createElement('style');
  style.textContent = `
    .dn-splash {
      position: fixed;
      inset: 0;
      background: ${bgColor};
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      opacity: 1;
      transition: opacity 0.4s ease;
    }
    .dn-splash.fade-out {
      opacity: 0;
      pointer-events: none;
    }
    .dn-splash-logo {
      width: 120px;
      height: 120px;
      border-radius: 24px;
      animation: dn-splash-pulse 1.5s ease-in-out infinite;
    }
    @keyframes dn-splash-pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.08); opacity: 0.85; }
    }
  `;
  document.head.appendChild(style);

  // Crear splash
  const splash = document.createElement('div');
  splash.className = 'dn-splash';
  splash.innerHTML = `<img src="/assets/logo-transparent.png" class="dn-splash-logo" alt="Keicy Barber">`;
  document.body.insertBefore(splash, document.body.firstChild);

  // Ocultar splash después de la animación
  const hideSplash = () => {
    splash.classList.add('fade-out');
    sessionStorage.setItem('dn_splash_shown', 'true');
    setTimeout(() => splash.remove(), 400);
  };

  // Ocultar después de 400ms o cuando la página cargue
  const minTime = new Promise(resolve => setTimeout(resolve, 400));
  const pageLoad = new Promise(resolve => {
    if (document.readyState === 'complete') {
      resolve();
    } else {
      window.addEventListener('load', resolve, { once: true });
    }
  });

  Promise.all([minTime, pageLoad]).then(hideSplash);
})();
