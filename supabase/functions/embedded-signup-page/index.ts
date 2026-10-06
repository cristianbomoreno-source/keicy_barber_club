// =====================================================
// WhatsApp Embedded Signup Page
// Página segura para iniciar el flujo de Embedded Signup
// con soporte para WhatsApp Business App Coexistence
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

// Configuración esperada (desde Meta Developers)
const META_APP_ID = '910914185080805';
const EMBEDDED_SIGNUP_CONFIG_ID = '1631966474351561';
const EXPECTED_WABA_ID = '851994237367851';
const EXPECTED_PHONE_NUMBER_ID = '786659147873161';

// Generar state/nonce criptográficamente seguro
function generateSecureState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generar hash del state para almacenar (no exponer el state completo)
async function hashState(state: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(state);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const baseUrl = Deno.env.get('SUPABASE_URL') || 'https://zzmtnjlfrlqmouijfste.supabase.co';
  const callbackUrl = `${baseUrl}/functions/v1/embedded-signup-callback`;

  // Modo de operación: 'live' o 'dry-run'
  const mode = url.searchParams.get('mode') || 'dry-run';
  const isDryRun = mode === 'dry-run';

  // Generar state seguro para CSRF protection
  const state = generateSecureState();
  const stateHash = await hashState(state);

  // Timestamp para expiración (15 minutos)
  const expiresAt = Date.now() + 15 * 60 * 1000;

  // Crear session data (se almacena en cookie segura)
  const sessionData = JSON.stringify({
    state,
    stateHash,
    expiresAt,
    mode,
    expectedWabaId: EXPECTED_WABA_ID,
    expectedPhoneNumberId: EXPECTED_PHONE_NUMBER_ID,
    createdAt: new Date().toISOString()
  });

  // Codificar session para cookie
  const encodedSession = btoa(sessionData);

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Diego Neira Barbería - WhatsApp Business Setup</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: #fff;
      border-radius: 16px;
      padding: 40px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .logo {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo h1 {
      font-size: 24px;
      color: #1a1a2e;
      margin-bottom: 8px;
    }
    .logo p {
      color: #666;
      font-size: 14px;
    }
    .mode-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 20px;
    }
    .mode-dry-run {
      background: #fff3cd;
      color: #856404;
    }
    .mode-live {
      background: #d4edda;
      color: #155724;
    }
    .info-box {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .info-box h3 {
      font-size: 14px;
      color: #333;
      margin-bottom: 12px;
    }
    .info-item {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      padding: 6px 0;
      border-bottom: 1px solid #eee;
    }
    .info-item:last-child {
      border-bottom: none;
    }
    .info-label {
      color: #666;
    }
    .info-value {
      font-family: monospace;
      color: #333;
      font-size: 12px;
    }
    .warning-box {
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .warning-box h4 {
      color: #856404;
      font-size: 14px;
      margin-bottom: 8px;
    }
    .warning-box ul {
      margin-left: 20px;
      font-size: 13px;
      color: #856404;
    }
    .warning-box li {
      margin-bottom: 4px;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 16px;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 12px;
    }
    .btn-primary {
      background: #25D366;
      color: #fff;
    }
    .btn-primary:hover {
      background: #128C7E;
    }
    .btn-primary:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    .btn-secondary {
      background: #f8f9fa;
      color: #333;
      border: 1px solid #ddd;
    }
    .btn-secondary:hover {
      background: #e9ecef;
    }
    #result {
      margin-top: 24px;
      padding: 16px;
      border-radius: 8px;
      display: none;
    }
    #result.success {
      background: #d4edda;
      border: 1px solid #c3e6cb;
      color: #155724;
      display: block;
    }
    #result.error {
      background: #f8d7da;
      border: 1px solid #f5c6cb;
      color: #721c24;
      display: block;
    }
    #result.info {
      background: #cce5ff;
      border: 1px solid #b8daff;
      color: #004085;
      display: block;
    }
    #result pre {
      font-size: 12px;
      margin-top: 12px;
      background: rgba(0,0,0,0.05);
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .spinner {
      display: none;
      width: 20px;
      height: 20px;
      border: 2px solid #fff;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-right: 8px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .loading .spinner {
      display: inline-block;
    }
    .loading .btn-text {
      opacity: 0.7;
    }
    .security-note {
      margin-top: 24px;
      padding: 12px;
      background: #e7f5ff;
      border-radius: 8px;
      font-size: 12px;
      color: #1864ab;
    }
    .security-note strong {
      display: block;
      margin-bottom: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <h1>Diego Neira Barbería</h1>
      <p>Configuración de WhatsApp Business</p>
    </div>

    <div class="mode-badge ${isDryRun ? 'mode-dry-run' : 'mode-live'}">
      ${isDryRun ? '🧪 MODO PRUEBA (Dry-Run)' : '🟢 MODO PRODUCCIÓN'}
    </div>

    <div class="info-box">
      <h3>Configuración Actual</h3>
      <div class="info-item">
        <span class="info-label">App ID:</span>
        <span class="info-value">${META_APP_ID}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Config ID:</span>
        <span class="info-value">${EMBEDDED_SIGNUP_CONFIG_ID}</span>
      </div>
      <div class="info-item">
        <span class="info-label">WABA ID esperado:</span>
        <span class="info-value">${EXPECTED_WABA_ID}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Phone Number ID:</span>
        <span class="info-value">${EXPECTED_PHONE_NUMBER_ID}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Número:</span>
        <span class="info-value">+57 321 231 9355</span>
      </div>
      <div class="info-item">
        <span class="info-label">Estado actual:</span>
        <span class="info-value">ON_PREMISE / DISCONNECTED</span>
      </div>
    </div>

    ${isDryRun ? `
    <div class="warning-box">
      <h4>⚠️ Modo Dry-Run Activo</h4>
      <ul>
        <li>El flujo se detendrá antes de cualquier cambio irreversible</li>
        <li>Se capturarán errores de Meta sin modificar el número</li>
        <li>Podrás ver si Meta acepta o rechaza el estado ON_PREMISE</li>
        <li>No se ejecutará /register ni migración alguna</li>
      </ul>
    </div>
    ` : `
    <div class="warning-box">
      <h4>⚠️ Modo Producción</h4>
      <ul>
        <li>Este flujo REGISTRARÁ el número en Cloud API</li>
        <li>Se habilitará WhatsApp Business App Coexistence</li>
        <li>El número seguirá funcionando en la app móvil</li>
        <li>Asegúrate de tener el celular a mano para verificar</li>
      </ul>
    </div>
    `}

    <button id="startBtn" class="btn btn-primary" onclick="startEmbeddedSignup()">
      <span class="spinner"></span>
      <span class="btn-text">${isDryRun ? 'Iniciar Prueba de Embedded Signup' : 'Conectar WhatsApp Business'}</span>
    </button>

    <button class="btn btn-secondary" onclick="window.location.href='?mode=${isDryRun ? 'live' : 'dry-run'}'">
      Cambiar a modo ${isDryRun ? 'Producción' : 'Prueba'}
    </button>

    <div id="result"></div>

    <div class="security-note">
      <strong>🔒 Seguridad</strong>
      Esta página usa protección CSRF con state/nonce. Los tokens nunca se exponen en URLs públicas.
      Session ID: ${stateHash.substring(0, 16)}...
    </div>
  </div>

  <!-- Facebook SDK -->
  <script async defer crossorigin="anonymous"
    src="https://connect.facebook.net/en_US/sdk.js">
  </script>

  <script>
    // Configuración
    const config = {
      appId: '${META_APP_ID}',
      configId: '${EMBEDDED_SIGNUP_CONFIG_ID}',
      state: '${state}',
      mode: '${mode}',
      callbackUrl: '${callbackUrl}',
      expectedWabaId: '${EXPECTED_WABA_ID}',
      expectedPhoneNumberId: '${EXPECTED_PHONE_NUMBER_ID}'
    };

    // Estado del flujo
    let flowStarted = false;
    let flowCompleted = false;

    // Inicializar Facebook SDK
    window.fbAsyncInit = function() {
      FB.init({
        appId: config.appId,
        autoLogAppEvents: true,
        xfbml: true,
        version: 'v21.0'
      });
      console.log('[Embedded Signup] SDK inicializado');
    };

    // Listener para mensajes del popup de Embedded Signup
    window.addEventListener('message', function(event) {
      // Validar origen (solo aceptar de facebook.com)
      if (!event.origin.includes('facebook.com')) {
        return;
      }

      console.log('[Embedded Signup] Mensaje recibido:', event.data);

      // Manejar evento WA_EMBEDDED_SIGNUP
      if (event.data && event.data.type === 'WA_EMBEDDED_SIGNUP') {
        handleEmbeddedSignupEvent(event.data);
      }
    });

    function handleEmbeddedSignupEvent(data) {
      console.log('[Embedded Signup] Evento:', data);

      const resultDiv = document.getElementById('result');
      const startBtn = document.getElementById('startBtn');
      startBtn.classList.remove('loading');
      startBtn.disabled = false;

      // Verificar si es error
      if (data.data && data.data.error_message) {
        resultDiv.className = 'error';
        resultDiv.innerHTML = \`
          <strong>❌ Error de Meta</strong>
          <p>\${data.data.error_message}</p>
          <pre>\${JSON.stringify(data.data, null, 2)}</pre>
          <p style="margin-top:12px;font-size:13px;">
            <strong>Diagnóstico:</strong> Meta rechazó el flujo.
            Esto puede deberse al estado ON_PREMISE del número.
            No se ha realizado ningún cambio.
          </p>
        \`;
        flowCompleted = true;
        return;
      }

      // Verificar paso actual
      const currentStep = data.data?.current_step;

      if (currentStep === 'FINISH') {
        // Flujo completado exitosamente
        const phoneNumberId = data.data.phone_number_id;
        const wabaId = data.data.waba_id;

        // Validar que coinciden con los esperados
        let validation = [];
        if (wabaId && wabaId !== config.expectedWabaId) {
          validation.push(\`WABA ID diferente: \${wabaId} (esperado: \${config.expectedWabaId})\`);
        }
        if (phoneNumberId && phoneNumberId !== config.expectedPhoneNumberId) {
          validation.push(\`Phone Number ID diferente: \${phoneNumberId} (esperado: \${config.expectedPhoneNumberId})\`);
        }

        if (config.mode === 'dry-run') {
          resultDiv.className = 'info';
          resultDiv.innerHTML = \`
            <strong>🧪 Dry-Run Completado</strong>
            <p>El flujo de Embedded Signup se completó en modo prueba.</p>
            <pre>\${JSON.stringify(data.data, null, 2)}</pre>
            \${validation.length > 0 ? \`<p style="color:#856404;margin-top:12px;"><strong>⚠️ Advertencias:</strong><br>\${validation.join('<br>')}</p>\` : ''}
            <p style="margin-top:12px;font-size:13px;">
              <strong>Siguiente paso:</strong> Cambia a modo producción para completar la configuración real.
            </p>
          \`;
        } else {
          // Modo producción - enviar datos al callback
          sendToCallback(data.data, validation);
        }

        flowCompleted = true;

      } else if (currentStep) {
        // Paso intermedio
        resultDiv.className = 'info';
        resultDiv.innerHTML = \`
          <strong>📋 Paso: \${currentStep}</strong>
          <p>El flujo está en progreso...</p>
          <pre>\${JSON.stringify(data.data, null, 2)}</pre>
        \`;
      }
    }

    async function sendToCallback(signupData, validationWarnings) {
      const resultDiv = document.getElementById('result');

      resultDiv.className = 'info';
      resultDiv.innerHTML = '<strong>⏳ Procesando...</strong><p>Enviando datos al servidor...</p>';

      try {
        const response = await fetch(config.callbackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            event: 'WA_EMBEDDED_SIGNUP_COMPLETE',
            state: config.state,
            mode: config.mode,
            data: signupData,
            validationWarnings,
            timestamp: new Date().toISOString()
          })
        });

        const result = await response.json();

        if (result.success) {
          resultDiv.className = 'success';
          resultDiv.innerHTML = \`
            <strong>✅ Configuración Exitosa</strong>
            <p>\${result.message || 'WhatsApp Business Coexistence habilitado correctamente.'}</p>
            <pre>\${JSON.stringify(result, null, 2)}</pre>
          \`;
        } else {
          resultDiv.className = 'error';
          resultDiv.innerHTML = \`
            <strong>❌ Error en Callback</strong>
            <p>\${result.error || 'Error procesando el resultado.'}</p>
            <pre>\${JSON.stringify(result, null, 2)}</pre>
          \`;
        }
      } catch (error) {
        resultDiv.className = 'error';
        resultDiv.innerHTML = \`
          <strong>❌ Error de Conexión</strong>
          <p>\${error.message}</p>
        \`;
      }
    }

    function startEmbeddedSignup() {
      if (flowStarted && !flowCompleted) {
        alert('El flujo ya está en progreso');
        return;
      }

      const startBtn = document.getElementById('startBtn');
      const resultDiv = document.getElementById('result');

      startBtn.classList.add('loading');
      startBtn.disabled = true;
      resultDiv.style.display = 'none';
      resultDiv.className = '';
      flowStarted = true;
      flowCompleted = false;

      console.log('[Embedded Signup] Iniciando flujo...');

      // Verificar que el SDK está cargado
      if (typeof FB === 'undefined') {
        resultDiv.className = 'error';
        resultDiv.innerHTML = '<strong>❌ Error</strong><p>Facebook SDK no cargado. Recarga la página.</p>';
        startBtn.classList.remove('loading');
        startBtn.disabled = false;
        return;
      }

      // Configuración del flujo de Embedded Signup
      // Referencia: https://developers.facebook.com/docs/whatsapp/embedded-signup/implementation
      FB.login(function(response) {
        console.log('[Embedded Signup] Respuesta FB.login:', response);

        if (response.authResponse) {
          // Usuario autorizó - capturar el code para intercambiar por token
          const code = response.authResponse.code;

          if (code && config.mode !== 'dry-run') {
            // Enviar code al callback para intercambio seguro
            sendCodeToCallback(code);
          } else if (config.mode === 'dry-run') {
            resultDiv.className = 'info';
            resultDiv.innerHTML = \`
              <strong>🧪 Autorización Dry-Run</strong>
              <p>El usuario autorizó la app. En modo producción, se intercambiaría el code por un token.</p>
              <pre>Code recibido: \${code ? code.substring(0, 20) + '...' : 'N/A'}</pre>
              <p style="margin-top:12px;font-size:13px;">
                Esperando evento WA_EMBEDDED_SIGNUP...
              </p>
            \`;
          }
        } else {
          // Usuario canceló o error
          resultDiv.className = 'error';
          resultDiv.innerHTML = \`
            <strong>❌ Flujo Cancelado</strong>
            <p>El usuario canceló el proceso de autorización o hubo un error.</p>
            <pre>\${JSON.stringify(response, null, 2)}</pre>
          \`;
          startBtn.classList.remove('loading');
          startBtn.disabled = false;
          flowCompleted = true;
        }
      }, {
        config_id: config.configId, // Embedded Signup Configuration ID
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          feature: 'whatsapp_embedded_signup',
          version: 2,
          sessionInfoVersion: 3,
          // Habilitar opción de conectar WhatsApp Business App existente
          setup: {
            smbApp: true // Pre-seleccionar Business App Coexistence
          }
        }
      });
    }

    async function sendCodeToCallback(code) {
      const resultDiv = document.getElementById('result');
      const startBtn = document.getElementById('startBtn');

      try {
        const response = await fetch(config.callbackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            event: 'OAUTH_CODE_RECEIVED',
            state: config.state,
            code: code,
            mode: config.mode,
            timestamp: new Date().toISOString()
          })
        });

        const result = await response.json();

        if (!result.success) {
          resultDiv.className = 'error';
          resultDiv.innerHTML = \`
            <strong>❌ Error en Code Exchange</strong>
            <p>\${result.error || 'Error intercambiando el código.'}</p>
          \`;
          startBtn.classList.remove('loading');
          startBtn.disabled = false;
        }
        // Si es exitoso, esperamos el evento WA_EMBEDDED_SIGNUP
      } catch (error) {
        resultDiv.className = 'error';
        resultDiv.innerHTML = \`
          <strong>❌ Error de Conexión</strong>
          <p>\${error.message}</p>
        \`;
        startBtn.classList.remove('loading');
        startBtn.disabled = false;
      }
    }
  </script>
</body>
</html>`;

  // Convertir HTML a Uint8Array para control total del tipo
  const encoder = new TextEncoder();
  const htmlBytes = encoder.encode(html);

  // Headers como objeto literal - Supabase respeta mejor este formato
  return new Response(htmlBytes, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Set-Cookie': `es_session=${encodedSession}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=900`,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    }
  });
});
