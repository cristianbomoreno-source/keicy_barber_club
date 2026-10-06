/**
 * Sistema de Modales y Alertas Personalizadas - Keicy Barbería
 *
 * Uso:
 *   // Confirmación
 *   const confirmed = await dnShowConfirm({
 *     type: 'warning', // 'warning', 'success', 'info'
 *     icon: '⚠️',
 *     title: 'Título',
 *     message: 'Mensaje descriptivo',
 *     details: [
 *       { label: 'Campo', value: 'Valor', highlight: true }
 *     ],
 *     confirmText: 'Confirmar',
 *     danger: true // botón rojo
 *   });
 *
 *   // Alerta simple
 *   await dnShowAlert({
 *     type: 'info',
 *     title: 'Información',
 *     message: 'Mensaje',
 *     buttonText: 'Aceptar'
 *   });
 *
 *   // Toast
 *   dnToast('Mensaje', 'success'); // 'success', 'error', 'info'
 */

(function() {
  // Crear elementos del DOM si no existen
  function ensureModalElements() {
    if (document.getElementById('dnModalOverlay')) return;

    // Modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'dn-modal-overlay';
    overlay.id = 'dnModalOverlay';
    overlay.onclick = function(e) { if (e.target === this) dnCloseModal(); };
    overlay.innerHTML = `
      <div class="dn-modal">
        <div class="dn-modal-header">
          <div class="dn-modal-icon" id="dnModalIcon">⚠️</div>
          <div class="dn-modal-title" id="dnModalTitle">Confirmar acción</div>
        </div>
        <div class="dn-modal-body">
          <div class="dn-modal-message" id="dnModalMessage"></div>
          <div class="dn-modal-details" id="dnModalDetails" style="display:none;"></div>
        </div>
        <div class="dn-modal-footer">
          <button class="dn-modal-btn cancel" id="dnModalCancelBtn" onclick="dnCloseModal()">Cancelar</button>
          <button class="dn-modal-btn" id="dnModalConfirmBtn" onclick="dnConfirmAction()">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Toast
    const toast = document.createElement('div');
    toast.className = 'dn-toast';
    toast.id = 'dnToast';
    toast.innerHTML = `
      <span class="dn-toast-icon" id="dnToastIcon">✓</span>
      <span class="dn-toast-message" id="dnToastMessage"></span>
    `;
    document.body.appendChild(toast);
  }

  // Callback para resolver la promesa
  let dnModalCallback = null;

  // Mostrar modal de confirmación
  window.dnShowConfirm = function(options) {
    ensureModalElements();

    return new Promise((resolve) => {
      const overlay = document.getElementById('dnModalOverlay');
      const icon = document.getElementById('dnModalIcon');
      const title = document.getElementById('dnModalTitle');
      const message = document.getElementById('dnModalMessage');
      const details = document.getElementById('dnModalDetails');
      const confirmBtn = document.getElementById('dnModalConfirmBtn');
      const cancelBtn = document.getElementById('dnModalCancelBtn');

      // Configurar icono
      icon.className = 'dn-modal-icon ' + (options.type || 'warning');
      icon.textContent = options.icon || (options.type === 'success' ? '✓' : options.type === 'info' ? 'ℹ️' : '⚠️');

      // Configurar título y mensaje
      title.textContent = options.title || 'Confirmar';
      message.innerHTML = options.message || '¿Estás seguro?';

      // Configurar detalles si existen
      if (options.details && options.details.length > 0) {
        details.style.display = 'block';
        details.innerHTML = options.details.map(d => `
          <div class="dn-modal-detail-row">
            <span class="dn-modal-detail-label">${d.label}</span>
            <span class="dn-modal-detail-value ${d.highlight ? 'highlight' : ''}">${d.value}</span>
          </div>
        `).join('');
      } else {
        details.style.display = 'none';
      }

      // Configurar botones
      confirmBtn.textContent = options.confirmText || 'Confirmar';
      confirmBtn.className = 'dn-modal-btn ' + (options.danger ? 'danger' : 'confirm');

      // Mostrar/ocultar botón cancelar
      cancelBtn.style.display = options.hideCancel ? 'none' : 'block';
      cancelBtn.textContent = options.cancelText || 'Cancelar';

      // Guardar callback
      dnModalCallback = resolve;

      // Mostrar modal
      overlay.classList.add('show');
    });
  };

  // Cerrar modal
  window.dnCloseModal = function() {
    const overlay = document.getElementById('dnModalOverlay');
    if (overlay) overlay.classList.remove('show');
    if (dnModalCallback) {
      dnModalCallback(false);
      dnModalCallback = null;
    }
  };

  // Confirmar acción
  window.dnConfirmAction = function() {
    const overlay = document.getElementById('dnModalOverlay');
    if (overlay) overlay.classList.remove('show');
    if (dnModalCallback) {
      dnModalCallback(true);
      dnModalCallback = null;
    }
  };

  // Mostrar alerta simple (sin botón cancelar)
  window.dnShowAlert = function(options) {
    return dnShowConfirm({
      ...options,
      type: options.type || 'info',
      confirmText: options.buttonText || 'Aceptar',
      hideCancel: true
    }).then(() => true);
  };

  // Mostrar toast
  window.dnToast = function(message, type) {
    ensureModalElements();

    const toast = document.getElementById('dnToast');
    const icon = document.getElementById('dnToastIcon');
    const msg = document.getElementById('dnToastMessage');

    const icons = {
      success: '✓',
      error: '✕',
      info: 'ℹ️',
      warning: '⚠️'
    };

    icon.textContent = icons[type] || icons.success;
    msg.textContent = message;

    // Remover clase show si ya está visible
    toast.classList.remove('show');

    // Pequeño delay para reiniciar animación
    setTimeout(() => {
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }, 10);
  };

  // Cerrar modal con Escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') dnCloseModal();
  });

  // Inicializar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureModalElements);
  }
})();
