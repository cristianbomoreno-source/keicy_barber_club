// Documentos legales, registro de consentimientos y banner de cookies.
//
// - DN_LEGAL.versiones: versión vigente de cada documento. Si cambias el texto
//   de un documento, sube aquí su versión (y en la tabla documentos_legales);
//   así cada aceptación queda ligada al texto exacto que la persona vio.
// - DN_LEGAL.registrar(): guarda la aceptación en Supabase (tabla
//   consentimientos, solo inserción). Nunca lanza error ni bloquea el flujo.
// - DN_LEGAL.cookies: los píxeles de Meta/Google solo se cargan si la persona
//   los acepta. Las cookies técnicas (sesión, tema, sede) no piden permiso.
(function () {
  var URL_SB = 'https://ygrmammcaupnygdxmgth.supabase.co';
  var KEY_DISPOSITIVO = 'dn_dispositivo_id';
  var KEY_COOKIES = 'dn_cookies_consent';

  var versiones = { terminos: '2.0', privacidad: '2.0', cookies: '1.0', reembolsos: '1.0' };

  // Datos del responsable que aparecen en todos los documentos legales.
  // Los campos vacíos no se muestran: complétalos (razón social y NIT o
  // cédula del titular) y quedan publicados en todas las páginas a la vez.
  var empresa = {
    nombreComercial: 'Keicy Barber Club',
    razonSocial: '',
    nit: '',
    domicilio: 'Cali, Valle del Cauca, Colombia',
    direccion: 'Av. 4 Nte. #49, Urb. La Flora (Sede La Flora), Cali, Valle del Cauca',
    whatsapp: '+57 317 171 3526',
    correo: 'citas@keicybarberclub.com',
    web: 'https://www.keicybarberclub.com'
  };

  function pintarEmpresa() {
    var nodos = document.querySelectorAll('[data-dn-legal]');
    for (var i = 0; i < nodos.length; i++) {
      var campo = nodos[i].getAttribute('data-dn-legal');
      var valor = empresa[campo];
      var fila = nodos[i].closest('[data-dn-legal-fila]') || nodos[i];
      if (valor) { nodos[i].textContent = valor; fila.hidden = false; }
      else fila.hidden = true;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pintarEmpresa);
  else pintarEmpresa();

  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function leer(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function dispositivoId() {
    var id = leer(KEY_DISPOSITIVO);
    if (!id) {
      id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
        : 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      guardar(KEY_DISPOSITIVO, id);
    }
    return id;
  }

  function claveAnon() {
    try { if (typeof SUPABASE_KEY !== 'undefined') return SUPABASE_KEY; } catch (e) {}
    return null;
  }

  // documentos: [{ documento: 'terminos', aceptado: true }, ...]; la versión se
  // completa sola. Devuelve una promesa que siempre resuelve (true/false).
  function registrar(opts) {
    var docs = (opts.documentos || []).map(function (d) {
      var base = d.documento.indexOf('cookies_') === 0 ? 'cookies'
        : (d.documento === 'publicidad' ? 'privacidad' : d.documento);
      return { documento: d.documento, version: d.version || versiones[base] || '1.0', aceptado: !!d.aceptado };
    });
    var params = {
      p_documentos: docs,
      p_canal: opts.canal,
      p_usuario_id: opts.usuarioId || null,
      p_telefono: opts.telefono || null,
      p_nombre: opts.nombre || null,
      p_texto: opts.texto || null,
      p_url: location.href.split('#')[0].slice(0, 500),
      p_user_agent: navigator.userAgent,
      p_dispositivo_id: dispositivoId()
    };
    try {
      if (typeof sb !== 'undefined' && sb && sb.rpc) {
        return sb.rpc('dn_registrar_consentimiento', params)
          .then(function (r) { if (r.error) console.warn('[DN legal]', r.error.message); return !r.error; },
                function () { return false; });
      }
    } catch (e) {}
    var key = claveAnon();
    if (!key) return Promise.resolve(false);
    return fetch(URL_SB + '/rest/v1/rpc/dn_registrar_consentimiento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key },
      body: JSON.stringify(params),
      keepalive: true
    }).then(function (r) { return r.ok; }, function () { return false; });
  }

  // ================= Cookies =================
  function decision() {
    try {
      var d = JSON.parse(leer(KEY_COOKIES) || 'null');
      return d && d.version === versiones.cookies ? d : null;
    } catch (e) { return null; }
  }

  var pendientes = [];
  function ejecutarPendientes() {
    var d = decision();
    if (!d) return;
    pendientes = pendientes.filter(function (p) {
      if (d[p.categoria]) { try { p.fn(); } catch (e) {} }
      return false;
    });
  }

  function decidir(analitica, publicidad) {
    guardar(KEY_COOKIES, JSON.stringify({
      version: versiones.cookies, analitica: !!analitica, publicidad: !!publicidad, fecha: new Date().toISOString()
    }));
    registrar({
      canal: 'banner_cookies',
      documentos: [
        { documento: 'cookies_analitica', aceptado: !!analitica },
        { documento: 'cookies_publicidad', aceptado: !!publicidad }
      ],
      texto: 'Banner de cookies v' + versiones.cookies + ': analítica=' + (analitica ? 'sí' : 'no') +
        ', publicidad=' + (publicidad ? 'sí' : 'no')
    });
    cerrarBanner();
    ejecutarPendientes();
  }

  function estilos() {
    if (document.getElementById('dn-cookie-css')) return;
    var s = document.createElement('style');
    s.id = 'dn-cookie-css';
    s.textContent =
      '.dn-ck{position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:560px;margin:0 auto;' +
      'background:#fff;color:#1a1a1a;border:1px solid rgba(0,0,0,.12);border-radius:16px;padding:16px;' +
      'box-shadow:0 12px 40px rgba(0,0,0,.18);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
      '.dn-ck h3{margin:0 0 6px;font-size:15px}.dn-ck p{margin:0 0 12px;color:#4a4a4a;font-size:13px}' +
      '.dn-ck a{color:#8a6a12;text-decoration:underline}' +
      '.dn-ck-row{display:flex;gap:8px;flex-wrap:wrap}.dn-ck button{flex:1 1 140px;min-height:42px;border-radius:10px;' +
      'font:600 13px/1 inherit;cursor:pointer;border:1px solid #1a1a1a;background:#fff;color:#1a1a1a}' +
      '.dn-ck button.dn-ck-si{background:#1a1a1a;color:#fff}' +
      '.dn-ck-opts{display:none;margin:0 0 12px;padding:10px 12px;background:#f6f6f6;border-radius:10px}' +
      '.dn-ck-opts.open{display:block}.dn-ck-opts label{display:flex;gap:10px;align-items:flex-start;margin:6px 0;font-size:13px}' +
      '.dn-ck-opts input{margin-top:3px;width:18px;height:18px;flex:none}' +
      '@media (prefers-color-scheme:dark){.dn-ck{background:#1c1c1e;color:#f2f2f2;border-color:rgba(255,255,255,.14)}' +
      '.dn-ck p{color:#c7c7cc}.dn-ck a{color:#e0c068}.dn-ck button{background:#1c1c1e;color:#f2f2f2;border-color:#f2f2f2}' +
      '.dn-ck button.dn-ck-si{background:#f2f2f2;color:#111}.dn-ck-opts{background:#2c2c2e}}';
    document.head.appendChild(s);
  }

  function cerrarBanner() {
    var b = document.getElementById('dn-cookie-banner');
    if (b) b.remove();
  }

  function abrirBanner() {
    if (!document.body) { document.addEventListener('DOMContentLoaded', abrirBanner); return; }
    if (document.getElementById('dn-cookie-banner')) return;
    estilos();
    var d = decision() || {};
    var b = document.createElement('div');
    b.id = 'dn-cookie-banner';
    b.className = 'dn-ck';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Preferencias de cookies');
    b.innerHTML =
      '<h3>Usamos cookies</h3>' +
      '<p>Las técnicas son necesarias para que la reserva funcione. Con tu permiso también usamos cookies de ' +
      'analítica y publicidad (Google y Meta) para medir y mejorar nuestros anuncios. ' +
      'Más información en la <a href="/cookies.html" target="_blank">Política de Cookies</a>.</p>' +
      '<div class="dn-ck-opts" id="dnCkOpts">' +
      '<label><input type="checkbox" checked disabled> <span><b>Técnicas</b> — siempre activas (sesión, sede elegida, tema).</span></label>' +
      '<label><input type="checkbox" id="dnCkAn"' + (d.analitica ? ' checked' : '') + '> <span><b>Analítica</b> — Google Analytics: cómo se usa la página.</span></label>' +
      '<label><input type="checkbox" id="dnCkPu"' + (d.publicidad ? ' checked' : '') + '> <span><b>Publicidad</b> — Píxel de Meta / Google Ads: medir campañas.</span></label>' +
      '</div>' +
      '<div class="dn-ck-row">' +
      '<button type="button" id="dnCkNo">Rechazar</button>' +
      '<button type="button" id="dnCkCfg">Configurar</button>' +
      '<button type="button" class="dn-ck-si" id="dnCkSi">Aceptar todas</button>' +
      '</div>';
    document.body.appendChild(b);
    var opts = b.querySelector('#dnCkOpts');
    b.querySelector('#dnCkNo').onclick = function () { decidir(false, false); };
    b.querySelector('#dnCkSi').onclick = function () { decidir(true, true); };
    b.querySelector('#dnCkCfg').onclick = function () {
      if (!opts.classList.contains('open')) {
        opts.classList.add('open');
        this.textContent = 'Guardar selección';
        return;
      }
      decidir(b.querySelector('#dnCkAn').checked, b.querySelector('#dnCkPu').checked);
    };
  }

  // Ejecuta fn solo si la persona aceptó esa categoría ('analitica' o
  // 'publicidad'). Si todavía no ha decidido, muestra el banner y espera.
  function cuandoAcepte(categoria, fn) {
    var d = decision();
    if (d) { if (d[categoria]) fn(); return; }
    pendientes.push({ categoria: categoria, fn: fn });
    abrirBanner();
  }

  window.DN_LEGAL = {
    versiones: versiones,
    empresa: empresa,
    registrar: registrar,
    dispositivoId: dispositivoId,
    cookies: { cuandoAcepte: cuandoAcepte, abrir: abrirBanner, decision: decision }
  };
})();
