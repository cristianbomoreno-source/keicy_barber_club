// =====================================================
// Colaboradores → Informe de ventas y pagos por barbero + certificación de ingresos.
// Datos: RPC admin_informe_colaborador (solo admin principal).
// Datos para la certificación: colaboradores_datos_laborales (cédula, ingreso, cargo,
// vínculo) y configuracion_negocio (razón social, NIT, firmante).
// Usa jsPDF + autotable y SheetJS (cargados en barberos.html).
// =====================================================
(function () {
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DORADO = [201, 163, 91];
  const $ = id => document.getElementById(id);
  const cop = n => dnFormatCOP(Math.round(Number(n) || 0));
  const num = n => Number(n) || 0;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const fechaLarga = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${y}`; };
  const fechaCorta = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`; };
  const fechaHora = s => new Date(s).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });
  const nombreMes = ym => { const [y, m] = ym.split('-').map(Number); return `${MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1)} ${y}`; };
  const archivo = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

  let datos = null;       // último informe generado
  let colaboradorId = null;

  // ---------- Rangos de fechas ----------
  function rango(preset) {
    const h = new Date(); const y = h.getFullYear(), m = h.getMonth(), d = h.getDate();
    const finMes = (yy, mm) => new Date(yy, mm + 1, 0);
    switch (preset) {
      case 'quincena': return d <= 15 ? [new Date(y, m, 1), new Date(y, m, 15)] : [new Date(y, m, 16), finMes(y, m)];
      case 'quincena_ant': return d <= 15 ? [new Date(y, m - 1, 16), finMes(y, m - 1)] : [new Date(y, m, 1), new Date(y, m, 15)];
      case 'mes': return [new Date(y, m, 1), finMes(y, m)];
      case 'mes_ant': return [new Date(y, m - 1, 1), finMes(y, m - 1)];
      case 'semana': { const l = new Date(y, m, d - ((h.getDay() + 6) % 7)); return [l, new Date(l.getFullYear(), l.getMonth(), l.getDate() + 6)]; }
      case 'tres_meses': return [new Date(y, m - 2, 1), h];
      case 'seis_meses': return [new Date(y, m - 5, 1), h];
      default: return null;
    }
  }
  function aplicarPreset(preset) {
    document.querySelectorAll('#infPresets .inf-chip').forEach(c => c.classList.toggle('on', c.dataset.p === preset));
    const r = rango(preset);
    if (!r) return;
    $('infDesde').value = iso(r[0]);
    $('infHasta').value = iso(r[1]);
  }

  // ---------- Abrir ----------
  window.abrirInformeColaborador = function (barberoId, ev) {
    if (ev) ev.stopPropagation();
    const sel = $('infColaborador');
    sel.innerHTML = (typeof barberos !== 'undefined' ? barberos : []).map(b => {
      const n = b.usuarios?.full_name || b.usuarios?.username || 'Colaborador';
      return `<option value="${b.id}">${esc(n)}${b.activo ? '' : ' (inactivo)'}</option>`;
    }).join('');
    if (barberoId) sel.value = barberoId;
    if (!$('infDesde').value) aplicarPreset('quincena');
    $('infResultado').innerHTML = '';
    $('infAcciones').hidden = true;
    datos = null;
    $('informeModal').classList.add('show');
    if (barberoId) generarInforme();
  };

  // ---------- Generar ----------
  async function generarInforme() {
    const id = $('infColaborador').value, desde = $('infDesde').value, hasta = $('infHasta').value;
    if (!id) return toast('Elige un colaborador.');
    if (!desde || !hasta || hasta < desde) return toast('Revisa las fechas: «hasta» debe ser igual o posterior a «desde».');
    colaboradorId = id;
    $('infResultado').innerHTML = '<div class="empty-row">Generando informe…</div>';
    $('infAcciones').hidden = true;
    const { data, error } = await sb.rpc('admin_informe_colaborador', { p_barbero: id, p_desde: desde, p_hasta: hasta });
    if (error || !data) {
      $('infResultado').innerHTML = `<div class="error-box show">${esc(error?.code === '42501' ? 'Solo el administrador principal puede ver los pagos de los colaboradores.' : 'No se pudo generar el informe. Intenta de nuevo.')}</div>`;
      return;
    }
    datos = calcular(data);
    pintarResumen();
    $('infAcciones').hidden = false;
  }

  function calcular(d) {
    const s = d.servicios || {}, p = d.productos || {};
    const pagos = d.pagos || [], otros = d.otros_pagos || [];
    const t = {
      servicios: num(s.cantidad), clientes: num(s.clientes), ventas: num(s.ventas),
      comision: num(s.comision), propinas: num(s.propinas), pendiente: num(s.comision_pendiente),
      comisionProductos: num(p.comision), ventasProductos: num(p.ventas), unidadesProductos: num(p.unidades),
      bebidas: num((d.bebidas || {}).total),
      descuentos: pagos.reduce((a, x) => a + num(x.descuento), 0),
      pagado: pagos.reduce((a, x) => a + num(x.total), 0) + otros.reduce((a, x) => a + num(x.monto), 0),
      numPagos: pagos.length + otros.length,
    };
    t.devengado = t.comision + t.comisionProductos + t.propinas;
    t.neto = t.devengado - t.bebidas - t.descuentos;
    return { ...d, t };
  }

  function pintarResumen() {
    const { t, colaborador: c } = datos;
    const kpi = (v, l, cls = '') => `<div class="inf-kpi ${cls}"><div class="v">${v}</div><div class="l">${l}</div></div>`;
    const fila = (l, v, cls = '') => `<div class="inf-row ${cls}"><span>${l}</span><b>${v}</b></div>`;
    $('infResultado').innerHTML = `
      <div class="inf-head-res">${esc(c?.nombre)} · ${fechaCorta(datos.desde)} – ${fechaCorta(datos.hasta)}</div>
      <div class="inf-kpis">
        ${kpi(t.servicios, 'Servicios')}
        ${kpi(cop(t.ventas), 'Ventas')}
        ${kpi(cop(t.pagado), 'Pagado', 'gold')}
      </div>
      <div class="inf-box">
        ${fila(`Comisión servicios (${num(c?.comision_pct)}%)`, cop(t.comision))}
        ${t.comisionProductos ? fila(`Comisión productos (${t.unidadesProductos} und.)`, cop(t.comisionProductos)) : ''}
        ${t.propinas ? fila('Propinas', cop(t.propinas)) : ''}
        ${fila('Total devengado', cop(t.devengado), 'strong')}
        ${t.bebidas ? fila('Consumo de bebidas', '−' + cop(t.bebidas), 'neg') : ''}
        ${t.descuentos ? fila('Otros descuentos', '−' + cop(t.descuentos), 'neg') : ''}
        ${fila(`Pagado en el período (${t.numPagos} pago${t.numPagos === 1 ? '' : 's'})`, cop(t.pagado), 'strong')}
        ${fila('Comisión pendiente por pagar', cop(t.pendiente), t.pendiente ? 'warn' : '')}
      </div>
      ${(datos.por_servicio || []).length ? `<div class="inf-sub">Por servicio</div>
      <div class="inf-box">${datos.por_servicio.map(x => fila(`${esc(x.nombre)} <small>×${x.cantidad}</small>`, cop(x.ventas))).join('')}</div>` : ''}`;
  }

  // ---------- PDF del informe ----------
  function encabezadoPDF(doc, titulo) {
    doc.setFillColor(17, 17, 17); doc.rect(0, 0, 210, 26, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('Keicy Barber Club', 14, 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...DORADO);
    doc.text(titulo, 14, 19);
    doc.setTextColor(17, 17, 17);
  }
  function piePDF(doc) {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140);
      doc.text(`Generado el ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })} · keicybarberclub.com`, 14, 290);
      doc.text(`Página ${i} de ${n}`, 196, 290, { align: 'right' });
    }
  }

  function descargarPDF() {
    if (!datos) return;
    const { t, colaborador: c } = datos;
    const doc = new window.jspdf.jsPDF();
    encabezadoPDF(doc, 'Informe de ventas y pagos del colaborador');
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(c?.nombre || 'Colaborador', 14, 36);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(90);
    doc.text(`Período: ${fechaLarga(datos.desde)} al ${fechaLarga(datos.hasta)}`, 14, 42);
    doc.text(`${c?.sede || ''}${c?.comision_pct != null ? ` · Comisión ${num(c.comision_pct)}%` : ''}${c?.documento ? ` · ${c.tipo_documento || 'CC'} ${c.documento}` : ''}`, 14, 47);
    doc.setTextColor(17);

    const resumen = [
      ['Servicios realizados', String(t.servicios)],
      ['Clientes atendidos', String(t.clientes)],
      ['Ventas en servicios', cop(t.ventas)],
      [`Comisión por servicios (${num(c?.comision_pct)}%)`, cop(t.comision)],
      ['Comisión por productos', cop(t.comisionProductos)],
      ['Propinas', cop(t.propinas)],
      ['Total devengado', cop(t.devengado)],
      ['Consumo de bebidas', t.bebidas ? '-' + cop(t.bebidas) : cop(0)],
      ['Otros descuentos', t.descuentos ? '-' + cop(t.descuentos) : cop(0)],
      ['Total pagado en el período', cop(t.pagado)],
      ['Comisión pendiente por pagar', cop(t.pendiente)],
    ];
    doc.autoTable({
      startY: 53, head: [['Resumen', 'Valor']], body: resumen, theme: 'grid',
      headStyles: { fillColor: DORADO, textColor: 20 }, styles: { fontSize: 9.5 },
      columnStyles: { 1: { halign: 'right', cellWidth: 50 } },
      didParseCell: h => { if (h.section === 'body' && [6, 9].includes(h.row.index)) h.cell.styles.fontStyle = 'bold'; },
    });

    let y = doc.lastAutoTable.finalY + 9;
    const seccion = (titulo, head, body, colRight) => {
      if (!body.length) return;
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(titulo, 14, y);
      doc.autoTable({
        startY: y + 3, head: [head], body, theme: 'striped', headStyles: { fillColor: [40, 40, 40] }, styles: { fontSize: 8.5 },
        columnStyles: Object.fromEntries(colRight.map(i => [i, { halign: 'right' }])),
      });
      y = doc.lastAutoTable.finalY + 9;
    };
    seccion('Ventas por servicio', ['Servicio', 'Cantidad', 'Ventas', 'Comisión'],
      (datos.por_servicio || []).map(x => [x.nombre, x.cantidad, cop(x.ventas), cop(x.comision)]), [1, 2, 3]);
    seccion('Ventas por día', ['Fecha', 'Servicios', 'Ventas', 'Comisión', 'Propinas'],
      (datos.por_dia || []).map(x => [fechaCorta(x.fecha), x.servicios, cop(x.ventas), cop(x.comision), cop(x.propinas)]), [1, 2, 3, 4]);
    seccion('Pagos realizados', ['Fecha', 'Serv.', 'Comisión', 'Propinas', 'Descuentos', 'Pagado', 'Método'],
      (datos.pagos || []).map(x => [fechaHora(x.fecha), x.servicios ?? '', cop(x.comision), cop(x.propinas),
        cop(num(x.bebidas) + num(x.descuento)) + (x.descuento_motivo ? ` (${x.descuento_motivo})` : ''), cop(x.total), x.metodo || ''])
        .concat((datos.otros_pagos || []).map(x => [fechaHora(x.fecha), '', '', '', '', cop(x.monto), `${x.concepto || x.tipo || 'Otro pago'} · ${x.metodo || ''}`])),
      [1, 2, 3, 4, 5]);

    piePDF(doc);
    doc.save(`informe-${archivo(c?.nombre)}-${datos.desde}_a_${datos.hasta}.pdf`);
    toast('Informe PDF descargado.');
  }

  // ---------- Excel ----------
  function descargarExcel() {
    if (!datos) return;
    const { t, colaborador: c } = datos;
    const wb = XLSX.utils.book_new();
    const hoja = (nombre, filas, anchos) => { const ws = XLSX.utils.aoa_to_sheet(filas); if (anchos) ws['!cols'] = anchos.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, nombre); };
    hoja('Resumen', [
      ['Informe de ventas y pagos', c?.nombre || ''],
      ['Período', `${datos.desde} a ${datos.hasta}`],
      ['Sede', c?.sede || ''],
      ['Comisión %', num(c?.comision_pct)],
      [],
      ['Servicios realizados', t.servicios], ['Clientes atendidos', t.clientes], ['Ventas en servicios', t.ventas],
      ['Comisión por servicios', t.comision], ['Comisión por productos', t.comisionProductos], ['Propinas', t.propinas],
      ['Total devengado', t.devengado], ['Consumo de bebidas', -t.bebidas], ['Otros descuentos', -t.descuentos],
      ['Total pagado en el período', t.pagado], ['Comisión pendiente por pagar', t.pendiente],
    ], [32, 22]);
    hoja('Por servicio', [['Servicio', 'Cantidad', 'Ventas', 'Comisión'], ...(datos.por_servicio || []).map(x => [x.nombre, x.cantidad, num(x.ventas), num(x.comision)])], [34, 10, 14, 14]);
    hoja('Por día', [['Fecha', 'Servicios', 'Ventas', 'Comisión', 'Propinas'], ...(datos.por_dia || []).map(x => [x.fecha, x.servicios, num(x.ventas), num(x.comision), num(x.propinas)])], [12, 10, 14, 14, 12]);
    hoja('Pagos', [['Fecha', 'Servicios', 'Comisión', 'Propinas', 'Bebidas', 'Descuento', 'Motivo descuento', 'Total pagado', 'Método', 'Efectivo', 'Transferencia', 'Sede'],
      ...(datos.pagos || []).map(x => [fechaHora(x.fecha), x.servicios, num(x.comision), num(x.propinas), num(x.bebidas), num(x.descuento), x.descuento_motivo || '', num(x.total), x.metodo || '', num(x.efectivo), num(x.transferencia), x.sede || '']),
      ...(datos.otros_pagos || []).map(x => [fechaHora(x.fecha), '', '', '', '', '', x.concepto || x.tipo || 'Otro pago', num(x.monto), x.metodo || '', '', '', ''])],
      [18, 10, 12, 10, 10, 10, 22, 13, 14, 12, 13, 22]);
    XLSX.writeFile(wb, `informe-${archivo(c?.nombre)}-${datos.desde}_a_${datos.hasta}.xlsx`);
    toast('Informe Excel descargado.');
  }

  // ---------- Certificación de ingresos ----------
  async function abrirCertificacion() {
    if (!colaboradorId) return;
    const c = datos?.colaborador || {}, e = datos?.empresa || {};
    $('certTitulo').textContent = `Certificación · ${c.nombre || ''}`;
    $('certTipoDoc').value = c.tipo_documento || 'CC';
    $('certDocumento').value = c.documento || '';
    $('certIngreso').value = c.fecha_ingreso || c.primer_servicio || '';
    $('certCargo').value = c.cargo || (c.tipo === 'aseo' ? 'Auxiliar de aseo' : 'Barbero');
    $('certVinculo').value = c.tipo_vinculo || 'prestacion';
    $('certRazon').value = e.razon_social || '';
    $('certNit').value = e.nit || '';
    $('certFirmante').value = e.representante || '';
    $('certFirmanteDoc').value = e.representante_documento || '';
    $('certFirmanteCargo').value = e.representante_cargo || 'Representante legal';
    $('certDirigido').value = 'A quien interese';
    const r = rango('tres_meses');
    $('certDesde').value = iso(r[0]); $('certHasta').value = iso(r[1]);
    $('certError').classList.remove('show');
    $('certModal').classList.add('show');
  }

  async function generarCertificacion() {
    const err = msg => { $('certError').textContent = msg; $('certError').classList.add('show'); };
    const v = id => $(id).value.trim();
    if (!v('certDocumento')) return err('Escribe el número de documento del colaborador.');
    if (!v('certIngreso')) return err('Escribe la fecha de ingreso del colaborador.');
    if (!v('certRazon')) return err('Escribe la razón social o el nombre del negocio que certifica.');
    if (!v('certFirmante')) return err('Escribe el nombre de quien firma la certificación.');
    if (!v('certDesde') || !v('certHasta') || v('certHasta') < v('certDesde')) return err('Revisa el período de ingresos.');
    $('certError').classList.remove('show');
    const btn = $('certGenerarBtn'); btn.disabled = true; btn.textContent = 'Generando…';
    try {
      // Guardar los datos para la próxima vez
      const [r1, r2] = await Promise.all([
        sb.from('colaboradores_datos_laborales').upsert({
          barbero_id: colaboradorId, tipo_documento: v('certTipoDoc'), documento: v('certDocumento'),
          fecha_ingreso: v('certIngreso'), cargo: v('certCargo') || null, tipo_vinculo: v('certVinculo'), updated_at: new Date().toISOString(),
        }),
        sb.from('configuracion_negocio').update({
          razon_social: v('certRazon'), nit: v('certNit') || null, representante_legal: v('certFirmante'),
          representante_documento: v('certFirmanteDoc') || null, representante_cargo: v('certFirmanteCargo') || null,
        }).not('id', 'is', null),
      ]);
      if (r1.error || r2.error) console.warn('No se guardaron los datos de la certificación', r1.error || r2.error);

      const { data, error } = await sb.rpc('admin_informe_colaborador', { p_barbero: colaboradorId, p_desde: v('certDesde'), p_hasta: v('certHasta') });
      if (error || !data) throw error || new Error('sin datos');
      pdfCertificacion(data, {
        tipoDoc: v('certTipoDoc'), documento: v('certDocumento'), ingreso: v('certIngreso'), cargo: v('certCargo') || 'Barbero',
        vinculo: v('certVinculo'), razon: v('certRazon'), nit: v('certNit'), firmante: v('certFirmante'),
        firmanteDoc: v('certFirmanteDoc'), firmanteCargo: v('certFirmanteCargo'), dirigido: v('certDirigido') || 'A quien interese',
      });
      $('certModal').classList.remove('show');
    } catch (e) {
      console.error(e);
      err('No se pudo generar la certificación. Intenta de nuevo.');
    } finally {
      btn.disabled = false; btn.textContent = 'Descargar certificación (PDF)';
    }
  }

  const TIPOS_DOC = { CC: 'cédula de ciudadanía', CE: 'cédula de extranjería', PPT: 'permiso por protección temporal', PA: 'pasaporte' };
  const VINCULOS = {
    prestacion: 'un contrato de prestación de servicios, con una remuneración variable por comisión sobre los servicios que realiza',
    laboral: 'un contrato de trabajo',
    comision: 'un acuerdo de participación por comisión sobre los servicios que realiza',
  };

  function pdfCertificacion(d, f) {
    const c = d.colaborador || {};
    // Se omiten los meses iniciales sin registros (el sistema registra pagos desde oct-2026)
    const todos = (d.por_mes || []).map(m => ({ ...m, total: num(m.pagado) + num(m.otros) }));
    const primero = todos.findIndex(m => m.total > 0 || num(m.servicios) > 0);
    const meses = primero < 0 ? todos : todos.slice(primero);
    const total = meses.reduce((a, m) => a + m.total, 0);
    const conIngreso = meses.filter(m => m.total > 0);
    const promedio = conIngreso.length ? Math.round(total / conIngreso.length) : 0;
    const hoy = new Date(); const hoyISO = iso(hoy);

    const doc = new window.jspdf.jsPDF();
    const W = 210, X = 22, ancho = W - 2 * X;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text(f.razon.toUpperCase(), W / 2, 28, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    if (f.nit) doc.text(`NIT ${f.nit}`, W / 2, 34, { align: 'center' });
    doc.setDrawColor(...DORADO); doc.setLineWidth(0.6); doc.line(X, 40, W - X, 40);

    let y = 54;
    doc.setFontSize(11); doc.text(`Bogotá D.C., ${fechaLarga(hoyISO)}`, X, y); y += 12;
    doc.text(f.dirigido, X, y); y += 14;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text('CERTIFICA', W / 2, y, { align: 'center' }); y += 12;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);

    const parrafo = txt => { const l = doc.splitTextToSize(txt, ancho); doc.text(l, X, y, { align: 'justify', maxWidth: ancho }); y += l.length * 5.6 + 5; };
    parrafo(`Que ${c.nombre}, identificado(a) con ${TIPOS_DOC[f.tipoDoc] || 'documento'} número ${f.documento}, presta sus servicios como ${f.cargo.toLowerCase()} en ${f.razon}${c.sede ? `, sede ${c.sede.replace(/^Keicy Barber( Club)?\s*/i, '').replace(/^./, x => x.toUpperCase())}` : ''}, desde el ${fechaLarga(f.ingreso)}, mediante ${VINCULOS[f.vinculo] || VINCULOS.prestacion}.`);
    parrafo(`Que entre el ${fechaLarga(d.desde)} y el ${fechaLarga(d.hasta)} recibió ingresos por valor total de ${cop(total)} (${letras(total)} pesos m/cte.), equivalentes a un promedio mensual de ${cop(promedio)} (${letras(promedio)} pesos m/cte.), según el siguiente detalle:`);

    doc.autoTable({
      startY: y - 2, margin: { left: X, right: X },
      head: [['Mes', 'Servicios realizados', 'Ingresos pagados']],
      body: meses.map(m => [nombreMes(m.mes), String(m.servicios), cop(m.total)]).concat([['Total', String(meses.reduce((a, m) => a + num(m.servicios), 0)), cop(total)]]),
      theme: 'grid', headStyles: { fillColor: DORADO, textColor: 20 }, styles: { fontSize: 10 },
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
      didParseCell: h => { if (h.section === 'body' && h.row.index === meses.length) h.cell.styles.fontStyle = 'bold'; },
    });
    y = doc.lastAutoTable.finalY + 10;
    parrafo('La presente certificación se expide a solicitud del interesado(a), con base en los registros de pagos del sistema de la barbería.');

    y = Math.max(y + 22, 222);
    doc.setDrawColor(60); doc.setLineWidth(0.3); doc.line(X, y, X + 75, y);
    doc.setFont('helvetica', 'bold'); doc.text(f.firmante, X, y + 6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    let yf = y + 11;
    if (f.firmanteCargo) { doc.text(f.firmanteCargo, X, yf); yf += 5; }
    if (f.firmanteDoc) { doc.text(`C.C. ${f.firmanteDoc}`, X, yf); yf += 5; }
    doc.text(f.razon + (f.nit ? ` · NIT ${f.nit}` : ''), X, yf);

    doc.setFontSize(8.5); doc.setTextColor(120);
    const contacto = [d.empresa?.direccion, d.empresa?.telefono ? `Tel. ${d.empresa.telefono}` : '', 'keicybarberclub.com'].filter(Boolean).join(' · ');
    doc.text(contacto, W / 2, 284, { align: 'center' });
    doc.save(`certificacion-ingresos-${archivo(c.nombre)}-${hoyISO}.pdf`);
    toast('Certificación descargada.');
  }

  // Número a letras (español), para pesos colombianos
  function letras(n) {
    n = Math.round(Number(n) || 0);
    if (n === 0) return 'cero';
    const U = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiún', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
    const D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
    const C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
    const cien = x => {
      if (x === 100) return 'cien';
      const c = Math.floor(x / 100), r = x % 100;
      let s = C[c];
      if (r) s += (s ? ' ' : '') + (r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' y ' + U[r % 10] : ''));
      return s;
    };
    const mil = x => {
      const m = Math.floor(x / 1000), r = x % 1000;
      return [m === 0 ? '' : m === 1 ? 'mil' : cien(m) + ' mil', r ? cien(r) : ''].filter(Boolean).join(' ');
    };
    const mill = Math.floor(n / 1e6), resto = n % 1e6;
    const partes = [];
    if (mill) partes.push(mill === 1 ? 'un millón' : mil(mill) + ' millones');
    if (resto) partes.push(mil(resto));
    let s = partes.join(' ');
    if (mill && !resto) s += ' de';
    return s;
  }
  window.dnNumeroALetras = letras;

  // ---------- Eventos ----------
  document.addEventListener('DOMContentLoaded', () => {
    $('infPresets').addEventListener('click', e => { const c = e.target.closest('.inf-chip'); if (c) aplicarPreset(c.dataset.p); });
    ['infDesde', 'infHasta'].forEach(id => $(id).addEventListener('change', () => document.querySelectorAll('#infPresets .inf-chip').forEach(c => c.classList.remove('on'))));
    $('infGenerarBtn').addEventListener('click', generarInforme);
    $('infColaborador').addEventListener('change', () => { $('infResultado').innerHTML = ''; $('infAcciones').hidden = true; datos = null; });
    $('infPdfBtn').addEventListener('click', descargarPDF);
    $('infExcelBtn').addEventListener('click', descargarExcel);
    $('infCertBtn').addEventListener('click', abrirCertificacion);
    $('certGenerarBtn').addEventListener('click', generarCertificacion);
  });
})();
