// ============================================
// Notificaciones push del equipo (barberos, admin y admin de sede).
//  - Barbero: aviso cuando su cliente llega.
//  - Admin / admin de sede: reseñas de 3★ o menos y productos con stock bajo.
// Los avisos los genera la base de datos; aquí solo se activa el dispositivo.
// Requiere supabase-client.js antes.
// ============================================
(function () {
  const VAPID_PUBLICA = 'BGWko3b2HuZO7qAK1JvNLOSLi58C9ym9OdiL_VQ8gLzEHBApxI2guTrdfazwSoQvX0Mund1pbPU-N6MfUPJ62_0';
  const SW_URL = '/sw-push.js';
  const CLAVE_POSPUESTO = 'dn_push_pospuesto';
  const soportado = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  function base64ABytes(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }

  async function guardarEnServidor(sub) {
    const j = sub.toJSON();
    const { data, error } = await sb.rpc('dn_push_suscribir', {
      p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_user_agent: navigator.userAgent
    });
    if (error || !data?.success) throw new Error(data?.error || 'No pudimos registrar este dispositivo.');
  }

  // Pide permiso (si hace falta), suscribe este navegador y lo guarda a nombre del usuario actual
  async function dnPushActivar() {
    if (!soportado) throw new Error('Este navegador no permite notificaciones.');
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') throw new Error('Las notificaciones están bloqueadas para este sitio.');
    const reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ABytes(VAPID_PUBLICA) });
    }
    await guardarEnServidor(sub);
    return true;
  }

  // Quita este dispositivo (se usa al cerrar sesión, para que no le lleguen avisos al siguiente)
  async function dnPushQuitarEsteDispositivo() {
    if (!soportado) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = reg && (await reg.pushManager.getSubscription());
      if (!sub) return;
      await sb.rpc('dn_push_desuscribir', { p_endpoint: sub.endpoint });
      await sub.unsubscribe();
    } catch (e) {}
  }

  async function dnPushProbar() {
    const { data, error } = await sb.rpc('dn_push_probar');
    if (error || !data?.success) throw new Error(data?.error || 'No pudimos enviar la prueba.');
  }

  window.dnPushActivar = dnPushActivar;
  window.dnPushProbar = dnPushProbar;
  window.dnPushQuitarEsteDispositivo = dnPushQuitarEsteDispositivo;

  // Al cerrar sesión, primero se quita el dispositivo (necesita la sesión todavía activa)
  if (typeof window.dnLogout === 'function' && !window.dnLogout._conPush) {
    const logoutOriginal = window.dnLogout;
    window.dnLogout = async function (destino) {
      await Promise.race([dnPushQuitarEsteDispositivo(), new Promise((r) => setTimeout(r, 2000))]);
      return logoutOriginal(destino);
    };
    window.dnLogout._conPush = true;
  }

  // ---------- Aviso para activarlas ----------
  function textoSegunRol(role) {
    if (role === 'barbero') return 'Actívalas para saber al instante cuándo llega tu cliente.';
    return 'Actívalas para enterarte de reseñas malas y productos con poco stock.';
  }

  function pospuestoReciente() {
    try { return Date.now() - Number(localStorage.getItem(CLAVE_POSPUESTO) || 0) < 3 * 24 * 3600 * 1000; }
    catch (e) { return false; }
  }

  function mostrarAviso(user, modo) {
    if (document.getElementById('dnPushAviso')) return;
    const el = document.createElement('div');
    el.id = 'dnPushAviso';
    el.setAttribute('role', 'dialog');
    el.style.cssText = [
      'position:fixed', 'left:12px', 'right:12px', 'top:calc(env(safe-area-inset-top, 0px) + 12px)',
      'z-index:99990', 'max-width:440px', 'margin:0 auto', 'box-sizing:border-box',
      'background:var(--card, #16161a)', 'color:var(--text, #fff)',
      'border:1px solid rgba(255,172,72,0.45)', 'border-radius:16px', 'padding:14px 14px 12px',
      'box-shadow:0 12px 32px rgba(0,0,0,0.28)', 'font-family:inherit',
      'transform:translateY(-12px)', 'opacity:0', 'transition:transform .25s ease, opacity .25s ease'
    ].join(';');
    const ios = modo === 'ios';
    el.innerHTML = `
      <div style="display:flex;gap:12px;align-items:flex-start;">
        <div style="font-size:22px;line-height:1;">🔔</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:14.5px;">${ios ? 'Instala la app para recibir avisos' : 'Activa las notificaciones'}</div>
          <div style="font-size:13px;opacity:.75;margin-top:3px;line-height:1.35;">${ios
            ? 'En iPhone toca Compartir → "Agregar a inicio", abre la app desde ahí y vuelve a entrar.'
            : textoSegunRol(user.role)}</div>
          <div id="dnPushError" style="display:none;color:var(--error, #ef5350);font-size:12.5px;margin-top:6px;"></div>
          <div style="display:flex;gap:8px;margin-top:10px;">
            ${ios ? '' : '<button type="button" id="dnPushSi" style="flex:1;height:38px;border:none;border-radius:10px;background:var(--gold, #FFAC48);color:#141414;font-weight:700;font-size:13.5px;font-family:inherit;cursor:pointer;">Activar</button>'}
            <button type="button" id="dnPushNo" style="flex:${ios ? 1 : 0} 0 auto;height:38px;padding:0 14px;border:1px solid var(--divider, rgba(255,255,255,0.15));border-radius:10px;background:transparent;color:inherit;font-size:13.5px;font-family:inherit;cursor:pointer;">${ios ? 'Entendido' : 'Ahora no'}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.transform = 'none'; el.style.opacity = '1'; });

    const cerrar = () => { el.style.opacity = '0'; el.style.transform = 'translateY(-12px)'; setTimeout(() => el.remove(), 250); };
    el.querySelector('#dnPushNo').addEventListener('click', () => {
      try { localStorage.setItem(CLAVE_POSPUESTO, String(Date.now())); } catch (e) {}
      cerrar();
    });
    const si = el.querySelector('#dnPushSi');
    if (si) si.addEventListener('click', async () => {
      si.disabled = true; si.textContent = 'Activando…';
      try {
        await dnPushActivar();
        await dnPushProbar().catch(() => {});
        cerrar();
      } catch (err) {
        const box = el.querySelector('#dnPushError');
        box.textContent = Notification.permission === 'denied'
          ? 'Están bloqueadas. Actívalas en los ajustes del navegador para este sitio.'
          : err.message;
        box.style.display = 'block';
        si.disabled = false; si.textContent = 'Reintentar';
      }
    });
  }

  async function iniciar() {
    const user = typeof dnGetSession === 'function' ? dnGetSession() : null;
    if (!user || typeof dnEsStaff !== 'function' || !dnEsStaff(user) || dnEsPaginaLogin()) return;
    // Solo con sesión real de Supabase (la suscripción se guarda a nombre de auth.uid())
    const { data } = await sb.auth.getSession();
    if (data?.session?.user?.id !== user.id) return;

    if (!soportado) {
      if (esIOS && !instalada && !pospuestoReciente()) mostrarAviso(user, 'ios');
      return;
    }
    if (Notification.permission === 'granted') {
      // Ya dio permiso: mantener la suscripción al día y a nombre de quien está ahora
      dnPushActivar().catch((e) => console.warn('[Push]', e.message));
    } else if (Notification.permission === 'default' && !pospuestoReciente()) {
      setTimeout(() => mostrarAviso(user, 'normal'), 1200);
    }
  }

  const arrancar = () => (typeof dnCuandoSbListo === 'function' ? dnCuandoSbListo(iniciar) : iniciar());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();
