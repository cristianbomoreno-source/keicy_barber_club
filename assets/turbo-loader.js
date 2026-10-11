// ============================================
// Turbo Loader - Carga ultra rápida
// ============================================

(function() {
  'use strict';

  // 1. PREFETCH DE PÁGINAS AL HOVER
  const prefetchedUrls = new Set();
  const prefetchLink = document.createElement('link');
  prefetchLink.rel = 'prefetch';

  function prefetchUrl(url) {
    if (prefetchedUrls.has(url)) return;
    if (url.includes('#') || url.startsWith('javascript:')) return;

    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    link.as = 'document';
    document.head.appendChild(link);
    prefetchedUrls.add(url);
  }

  // Prefetch al hover sobre links
  document.addEventListener('mouseover', (e) => {
    const link = e.target.closest('a[href]');
    if (link && link.href && link.href.startsWith(location.origin)) {
      prefetchUrl(link.href);
    }
  }, { passive: true });

  // Prefetch al tocar en móvil (touchstart)
  document.addEventListener('touchstart', (e) => {
    const link = e.target.closest('a[href]');
    if (link && link.href && link.href.startsWith(location.origin)) {
      prefetchUrl(link.href);
    }
  }, { passive: true });

  // 2. LAZY LOADING DE IMÁGENES
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
          }
          if (img.dataset.srcset) {
            img.srcset = img.dataset.srcset;
            img.removeAttribute('data-srcset');
          }
          img.classList.add('loaded');
          imageObserver.unobserve(img);
        }
      });
    }, { rootMargin: '50px' });

    // Observar imágenes con data-src
    document.querySelectorAll('img[data-src]').forEach(img => {
      imageObserver.observe(img);
    });

    // Observar nuevas imágenes agregadas dinámicamente
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            if (node.tagName === 'IMG' && node.dataset.src) {
              imageObserver.observe(node);
            }
            node.querySelectorAll?.('img[data-src]').forEach(img => {
              imageObserver.observe(img);
            });
          }
        });
      });
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  // 3. PRELOAD DE RECURSOS CRÍTICOS PARA SIGUIENTE PÁGINA
  function preloadNextPageAssets() {
    // Detectar página actual y precargar assets de páginas relacionadas
    const path = location.pathname;
    const preloads = [];

    if (path.includes('/admin/')) {
      // En admin, precargar otras páginas de admin
      preloads.push(
        '/admin/dashboard.html',
        '/admin/calendario.html',
        '/admin/clientes.html',
        '/admin/caja.html'
      );
    } else if (path.includes('/barbero/')) {
      // En barbero, precargar otras páginas de barbero
      preloads.push(
        '/barbero/home.html',
        '/barbero/agenda.html',
        '/barbero/perfil.html'
      );
    } else if (path.includes('/reservar/')) {
      // En reservar, precargar assets críticos
      preloads.push('/reservar/index.html');
    } else if (path.includes('/cliente/')) {
      // En cliente, precargar otras páginas de cliente
      preloads.push(
        '/cliente/home.html',
        '/cliente/login.html',
        '/cliente/club.html'
      );
    } else if (path.includes('/admin_sede/')) {
      // En admin sede, precargar páginas principales
      preloads.push(
        '/admin_sede/dashboard.html',
        '/admin_sede/caja.html',
        '/admin_sede/clientes.html',
        '/admin_sede/ventas.html'
      );
    } else if (path.includes('/recepcion/')) {
      preloads.push('/recepcion/dashboard.html');
    }

    // Prefetch con baja prioridad después de que cargue la página
    setTimeout(() => {
      preloads.forEach(url => {
        if (!url.includes(path)) prefetchUrl(url);
      });
    }, 2000);
  }

  // 4. OPTIMIZAR ANIMACIONES - Usar GPU
  document.documentElement.style.setProperty('--gpu-hint', 'translateZ(0)');

  // 5. DEFER NON-CRITICAL WORK
  window.requestIdleCallback = window.requestIdleCallback || function(cb) {
    return setTimeout(cb, 1);
  };

  // 6. INSTANT PAGE TRANSITIONS (opcional)
  let transitioning = false;
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link || transitioning) return;
    if (link.href.startsWith(location.origin) && !link.href.includes('#')) {
      // Mostrar feedback inmediato
      if (!link.classList.contains('no-transition')) {
        document.body.style.opacity = '0.95';
        transitioning = true;
      }
    }
  }, { passive: true });

  // 7. MEMORY CLEANUP - Liberar memoria al salir
  window.addEventListener('beforeunload', () => {
    prefetchedUrls.clear();
  });

  // Inicializar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', preloadNextPageAssets);
  } else {
    preloadNextPageAssets();
  }

  // Exponer API global
  window.turboLoader = {
    prefetch: prefetchUrl,
    preloadAssets: preloadNextPageAssets
  };

})();
