/**
 * Acciones sobre una reseña (admin): ver cliente, escribirle por WhatsApp
 * sobre la cita y registrar seguimiento (nota + marcar como atendida).
 * Lo usan admin/dashboard.html (sección de reseñas del día) y admin/resenas.html.
 *
 * dnAbrirAccionesResena(r, { onGuardado })
 *   r: { id, calificacion, comentario, created_at, cliente_id, cliente_nombre,
 *        cliente_phone, barbero_nombre, sede_nombre, cita_fecha, cita_hora,
 *        servicio_nombre, atendida, nota_seguimiento }
 */
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  // Teléfono en formato internacional sin "+" para wa.me (Colombia por defecto). null si no es válido.
  function dnTelefonoWhatsApp(phone) {
    const d = String(phone || '').replace(/\D/g, '');
    if (d.length === 10 && d.startsWith('3')) return '57' + d;
    if (d.length === 12 && d.startsWith('57')) return d;
    if (d.length >= 11 && d.length <= 15 && !d.startsWith('0')) return d;
    return null;
  }

  function fechaLarga(iso) {
    if (!iso) return '';
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function hora12(h) {
    if (!h) return '';
    const [H, M] = h.split(':').map(Number);
    return `${((H + 11) % 12) + 1}:${String(M).padStart(2, '0')} ${H < 12 ? 'a. m.' : 'p. m.'}`;
  }

  function mensajeWhatsApp(r) {
    const nombre = (r.cliente_nombre || '').trim().split(/\s+/)[0] || '';
    const sede = r.sede_nombre ? ` ${r.sede_nombre}` : '';
    const cita = [
      r.cita_fecha ? `del ${fechaLarga(r.cita_fecha)}` : '',
      r.cita_hora ? `a las ${hora12(r.cita_hora)}` : '',
      r.barbero_nombre ? `con ${r.barbero_nombre}` : '',
      r.servicio_nombre ? `(${r.servicio_nombre})` : ''
    ].filter(Boolean).join(' ');
    if (r.calificacion <= 3) {
      return `Hola${nombre ? ' ' + nombre : ''}, te escribimos de Keicy Barber Club${sede}. Vimos tu reseña sobre tu cita ${cita} y lamentamos que la experiencia no haya sido la mejor. ¿Nos cuentas qué pasó? Queremos solucionarlo.`;
    }
    return `Hola${nombre ? ' ' + nombre : ''}, te escribimos de Keicy Barber Club${sede}. ¡Gracias por tu reseña sobre tu cita ${cita}! Nos alegra que te haya gustado. Te esperamos pronto.`;
  }

  function inyectarEstilos() {
    if (document.getElementById('dnResenaSheetCss')) return;
    const st = document.createElement('style');
    st.id = 'dnResenaSheetCss';
    st.textContent = `
      .dnrs-bg{position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .2s}
      .dnrs-bg.show{opacity:1}
      .dnrs{width:100%;max-width:520px;max-height:88vh;overflow-y:auto;background:var(--card,#141414);color:var(--text,#fff);border-radius:22px 22px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px));transform:translateY(24px);transition:transform .22s;box-sizing:border-box}
      .dnrs-bg.show .dnrs{transform:none}
      .dnrs-handle{width:40px;height:4px;border-radius:9px;background:rgba(127,127,127,.35);margin:0 auto 14px}
      .dnrs-cli{font-size:17px;font-weight:800}
      .dnrs-meta{font-size:12.5px;color:var(--text-secondary,#9CA3AF);margin-top:3px;line-height:1.4}
      .dnrs-stars{color:#F5B800;font-size:15px;letter-spacing:1px;margin-top:8px}
      .dnrs-stars .off{color:rgba(127,127,127,.35)}
      .dnrs-com{font-size:14px;line-height:1.45;margin-top:8px;padding:10px 12px;border-radius:12px;background:rgba(127,127,127,.1)}
      .dnrs-acts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
      .dnrs-btn{display:flex;align-items:center;justify-content:center;gap:8px;padding:13px 10px;border-radius:14px;border:1px solid var(--divider,#2A2A2A);background:none;color:var(--text,#fff);font:inherit;font-size:14px;font-weight:700;cursor:pointer;text-decoration:none;text-align:center}
      .dnrs-btn svg{width:19px;height:19px;flex:none}
      .dnrs-btn.wa{background:#25D366;border-color:#25D366;color:#fff}
      .dnrs-btn[aria-disabled="true"]{opacity:.45;pointer-events:none}
      .dnrs-sec{margin-top:16px;padding-top:14px;border-top:1px solid var(--divider,#2A2A2A)}
      .dnrs-sec-t{font-size:13px;font-weight:800;margin-bottom:8px}
      .dnrs-ta{width:100%;box-sizing:border-box;min-height:74px;padding:10px 12px;border-radius:12px;border:1px solid var(--divider,#2A2A2A);background:rgba(127,127,127,.06);color:var(--text,#fff);font:inherit;font-size:14px;resize:vertical}
      .dnrs-chk{display:flex;align-items:center;gap:8px;font-size:14px;margin:10px 0 12px;cursor:pointer}
      .dnrs-chk input{width:20px;height:20px;accent-color:#FFAC48}
      .dnrs-save{width:100%;padding:13px;border-radius:14px;border:none;background:linear-gradient(135deg,#FFAC48,#FFD9A8);color:#111;font:inherit;font-size:15px;font-weight:800;cursor:pointer}
      .dnrs-save:disabled{opacity:.6}
      .dnrs-estado{font-size:12px;color:var(--text-secondary,#9CA3AF);margin-top:8px}
      .dnrs-close{width:100%;margin-top:10px;padding:12px;border:none;background:none;color:var(--text-secondary,#9CA3AF);font:inherit;font-size:14px;font-weight:700;cursor:pointer}
    `;
    document.head.appendChild(st);
  }

  function dnAbrirAccionesResena(r, opts = {}) {
    inyectarEstilos();
    document.querySelector('.dnrs-bg')?.remove();
    const tel = dnTelefonoWhatsApp(r.cliente_phone);
    const esAdminSede = new URLSearchParams(location.search).get('admin_sede') === '1';
    const waUrl = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(mensajeWhatsApp(r))}` : null;
    const cita = [r.cita_fecha ? fechaLarga(r.cita_fecha) : '', hora12(r.cita_hora), r.servicio_nombre].filter(Boolean).join(' · ');
    const estado = r.atendida && r.atendida_at
      ? `Atendida el ${new Date(r.atendida_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}`
      : (r.calificacion <= 3 ? 'Reseña baja pendiente de atender' : '');

    const bg = document.createElement('div');
    bg.className = 'dnrs-bg';
    bg.innerHTML = `
      <div class="dnrs" role="dialog" aria-label="Acciones de la reseña">
        <div class="dnrs-handle"></div>
        <div class="dnrs-cli">${esc(r.cliente_nombre || 'Cliente')}</div>
        <div class="dnrs-meta">para <b style="color:var(--gold,#FFAC48)">${esc(r.barbero_nombre || 'Barbero')}</b>${r.sede_nombre ? ' · ' + esc(r.sede_nombre) : ''}${cita ? '<br>Cita: ' + esc(cita) : ''}</div>
        <div class="dnrs-stars">${'★'.repeat(r.calificacion)}<span class="off">${'★'.repeat(5 - r.calificacion)}</span></div>
        ${(r.comentario || '').trim() ? `<div class="dnrs-com">"${esc(r.comentario)}"</div>` : ''}

        <div class="dnrs-acts">
          <a class="dnrs-btn" href="${r.cliente_id ? 'clientes.html?cliente=' + encodeURIComponent(r.cliente_id) + (esAdminSede ? '&admin_sede=1' : '') : '#'}" ${r.cliente_id ? '' : 'aria-disabled="true"'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3.4"/><path d="M4.5 20c1.6-3.6 4.4-5.4 7.5-5.4s5.9 1.8 7.5 5.4"/></svg>Ver cliente
          </a>
          <a class="dnrs-btn wa" ${waUrl ? `href="${waUrl}" target="_blank" rel="noopener"` : 'aria-disabled="true"'}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.8 14.03c-.25.69-1.44 1.32-1.99 1.37-.51.05-.98.24-3.3-.69-2.79-1.1-4.56-3.95-4.7-4.13-.13-.18-1.12-1.49-1.12-2.84s.71-2.01.96-2.29c.25-.27.55-.34.73-.34l.53.01c.17.01.4-.06.62.48.25.6.84 2.05.91 2.2.07.15.12.32.02.51-.1.2-.15.32-.29.49l-.44.52c-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.03 1.12 1 2.06 1.31 2.36 1.46.29.15.46.12.63-.07.18-.2.73-.85.92-1.15.2-.29.39-.24.66-.15.27.1 1.72.81 2.01.96.29.15.49.22.56.34.07.12.07.71-.18 1.39z"/></svg>${tel ? 'WhatsApp' : 'Sin teléfono'}
          </a>
        </div>

        <div class="dnrs-sec">
          <div class="dnrs-sec-t">Seguimiento</div>
          <textarea class="dnrs-ta" id="dnrsNota" placeholder="Ej: se llamó al cliente, se le dio un bono…">${esc(r.nota_seguimiento || '')}</textarea>
          <label class="dnrs-chk"><input type="checkbox" id="dnrsAtendida" ${r.atendida ? 'checked' : ''}> Marcar como atendida</label>
          <button class="dnrs-save" id="dnrsGuardar">Guardar seguimiento</button>
          <div class="dnrs-estado" id="dnrsEstado">${esc(estado)}</div>
        </div>
        <button class="dnrs-close" id="dnrsCerrar">Cerrar</button>
      </div>`;
    document.body.appendChild(bg);
    requestAnimationFrame(() => bg.classList.add('show'));

    const cerrar = () => { bg.classList.remove('show'); setTimeout(() => bg.remove(), 200); };
    bg.addEventListener('click', e => { if (e.target === bg) cerrar(); });
    bg.querySelector('#dnrsCerrar').onclick = cerrar;

    bg.querySelector('#dnrsGuardar').onclick = async () => {
      const btn = bg.querySelector('#dnrsGuardar');
      const nota = bg.querySelector('#dnrsNota').value.trim();
      const atendida = bg.querySelector('#dnrsAtendida').checked;
      const sesion = typeof dnGetSession === 'function' ? dnGetSession() : null;
      const cambios = {
        nota_seguimiento: nota || null,
        atendida,
        atendida_at: atendida ? (r.atendida && r.atendida_at ? r.atendida_at : new Date().toISOString()) : null,
        atendida_por: atendida ? (r.atendida && r.atendida_por ? r.atendida_por : (sesion?.id || null)) : null
      };
      btn.disabled = true; btn.textContent = 'Guardando…';
      const { error } = await sb.from('resenas').update(cambios).eq('id', r.id);
      btn.disabled = false; btn.textContent = 'Guardar seguimiento';
      if (error) {
        console.error('Error guardando seguimiento:', error);
        bg.querySelector('#dnrsEstado').textContent = 'No se pudo guardar. Intenta de nuevo.';
        return;
      }
      Object.assign(r, cambios);
      if (typeof opts.onGuardado === 'function') opts.onGuardado(r);
      cerrar();
    };
  }

  window.dnTelefonoWhatsApp = dnTelefonoWhatsApp;
  window.dnAbrirAccionesResena = dnAbrirAccionesResena;
})();
