// ============================================
// Utils.js - Utilidades comunes Keicy Barber
// ============================================

(function() {
  'use strict';

  // =====================
  // 1. TOAST NOTIFICATIONS
  // =====================
  let toastTimeout = null;

  function toast(msg, duration = 2500) {
    const el = document.getElementById('toast');
    if (!el) {
      console.warn('[toast] Elemento #toast no encontrado');
      return;
    }

    const textEl = document.getElementById('toastText') || el.querySelector('span:last-child') || el;
    if (textEl !== el) {
      textEl.textContent = msg;
    } else {
      el.innerHTML = `<span class="toast-dot"></span><span>${msg}</span>`;
    }

    // Limpiar timeout anterior
    if (toastTimeout) clearTimeout(toastTimeout);

    el.classList.add('show');
    toastTimeout = setTimeout(() => el.classList.remove('show'), duration);
  }

  // =====================
  // 2. FORMATEO DE MONEDA
  // =====================
  function formatCOP(value, decimals = 0) {
    if (value === null || value === undefined || isNaN(value)) return '$0';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value);
  }

  // =====================
  // 3. FORMATEO DE FECHAS
  // =====================
  function formatDate(dateStr, options = {}) {
    if (!dateStr) return '';

    const defaults = {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    };

    const opts = { ...defaults, ...options };
    const date = new Date(dateStr + (dateStr.includes('T') ? '' : 'T12:00:00'));

    return date.toLocaleDateString('es-CO', opts);
  }

  function formatTime(timeStr) {
    if (!timeStr) return '';
    return timeStr.slice(0, 5); // HH:MM
  }

  function formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return '';
    const date = new Date(dateTimeStr);
    return date.toLocaleString('es-CO', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Fecha relativa (hace 5 min, ayer, etc.)
  function timeAgo(dateStr) {
    if (!dateStr) return '';

    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'ahora';
    if (diffMins < 60) return `hace ${diffMins} min`;
    if (diffHours < 24) return `hace ${diffHours}h`;
    if (diffDays === 1) return 'ayer';
    if (diffDays < 7) return `hace ${diffDays} días`;

    return formatDate(dateStr);
  }

  // =====================
  // 4. VALIDACIONES
  // =====================
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isValidPhone(phone) {
    const clean = phone.replace(/\D/g, '');
    return clean.length >= 10 && clean.length <= 12;
  }

  function isValidCC(cc) {
    const clean = cc.replace(/\D/g, '');
    return clean.length >= 6 && clean.length <= 12;
  }

  // =====================
  // 5. FORMATEO DE TEXTO
  // =====================
  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  function titleCase(str) {
    if (!str) return '';
    return str.split(' ').map(capitalize).join(' ');
  }

  function truncate(str, maxLength = 50) {
    if (!str || str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + '...';
  }

  function getInitials(name, maxChars = 2) {
    if (!name) return '';
    return name.split(' ').map(n => n[0]).join('').slice(0, maxChars).toUpperCase();
  }

  // =====================
  // 6. UTILIDADES DOM
  // =====================
  function $(selector) {
    return document.querySelector(selector);
  }

  function $$(selector) {
    return document.querySelectorAll(selector);
  }

  function debounce(fn, delay = 300) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function throttle(fn, limit = 100) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  // =====================
  // 7. STORAGE HELPERS
  // =====================
  function getStorage(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  function setStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function removeStorage(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  // =====================
  // 8. VIBRACIÓN (MÓVIL)
  // =====================
  function vibrate(pattern = [50]) {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }

  // =====================
  // 9. CLIPBOARD
  // =====================
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copiado al portapapeles');
      return true;
    } catch {
      // Fallback para navegadores antiguos
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      toast('Copiado al portapapeles');
      return true;
    }
  }

  // =====================
  // 10. URL HELPERS
  // =====================
  function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function setUrlParam(name, value) {
    const url = new URL(window.location);
    url.searchParams.set(name, value);
    window.history.replaceState({}, '', url);
  }

  function removeUrlParam(name) {
    const url = new URL(window.location);
    url.searchParams.delete(name);
    window.history.replaceState({}, '', url);
  }

  // =====================
  // 11. LOADING STATES
  // =====================
  function showLoading(selector = '#app') {
    const el = document.querySelector(selector);
    if (el) el.classList.add('loading');
  }

  function hideLoading(selector = '#app') {
    const el = document.querySelector(selector);
    if (el) el.classList.remove('loading');
  }

  // =====================
  // 12. CONFIRMACIÓN
  // =====================
  function confirmAction(message) {
    return confirm(message);
  }

  // =====================
  // EXPORTAR API GLOBAL
  // =====================
  window.dnUtils = {
    // Toast
    toast,

    // Formateo
    formatCOP,
    formatDate,
    formatTime,
    formatDateTime,
    timeAgo,

    // Validaciones
    isValidEmail,
    isValidPhone,
    isValidCC,

    // Texto
    capitalize,
    titleCase,
    truncate,
    getInitials,

    // DOM
    $,
    $$,
    debounce,
    throttle,

    // Storage
    getStorage,
    setStorage,
    removeStorage,

    // Otros
    vibrate,
    copyToClipboard,
    getUrlParam,
    setUrlParam,
    removeUrlParam,
    showLoading,
    hideLoading,
    confirmAction
  };

  // Alias globales para compatibilidad
  window.toast = toast;
  window.formatCOP = formatCOP;
  window.vibrate = vibrate;

})();
