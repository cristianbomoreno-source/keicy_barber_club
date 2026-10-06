/**
 * AGENDA MÓVIL UNIFICADA - Keicy Barber
 * JavaScript para Admin Sede y Admin General
 * Timeline profesional con scroll sincronizado
 */

(function() {
  'use strict';

  // ===== ESTADO =====
  const state = {
    role: 'admin_sede',      // 'admin' o 'admin_sede'
    sedeId: null,
    sedeName: '',
    selectedDate: new Date(),
    barberos: [],
    citas: [],
    bloqueos: [],            // bloqueos de barberos
    horarioInicio: 10,
    horarioFin: 20,
    horaAlmuerzoInicio: 13,  // hora de almuerzo
    horaAlmuerzoFin: 14,
    slotHeight: 100,         // altura por hora - estilo WeiBook
    slotsPerDay: 9,          // espacios disponibles por día
    currentPage: 0,          // página actual del carrusel de barberos (deprecated)
    barberosPerPage: 100,    // mostrar todos los barberos sin paginación
    isLoading: false
  };

  // ===== OPTIMIZACIÓN: Control de requests =====
  var loadDataGeneration = 0;          // Contador para ignorar respuestas obsoletas
  var realtimeDebounceTimer = null;    // Debounce para Realtime updates
  var REALTIME_DEBOUNCE_MS = 500;      // 500ms debounce para cambios en cascada

  // ===== ELEMENTOS DOM =====
  let els = {};

  // ===== INICIALIZACIÓN =====
  function init() {
    // Verificar que sb (Supabase) esté disponible
    if (typeof sb === 'undefined') {
      console.warn('Agenda Mobile: Esperando Supabase...');
      setTimeout(init, 100);
      return;
    }

    // Detectar rol
    const params = new URLSearchParams(window.location.search);
    const isAdminSede = params.get('admin_sede') === '1' ||
                        window.location.pathname.includes('/admin_sede/');

    state.role = isAdminSede ? 'admin_sede' : 'admin';

    // Obtener sede usando la función global dnGetSedeActual
    if (typeof dnGetSedeActual === 'function') {
      state.sedeId = dnGetSedeActual();
    }
    state.sedeName = localStorage.getItem('dn_sede_nombre') || 'Todas las sedes';

    // Cachear elementos
    cacheElements();

    // Configurar UI según rol
    setupRoleUI();

    // Renderizar semana
    renderWeekSelector();

    // Cargar datos iniciales
    loadData();

    // Sincronizar fecha con calendario web (inline para evitar hoisting)
    if (typeof window.selectedDate !== 'undefined') {
      window.selectedDate = formatDateISO(state.selectedDate);
    }

    // Configurar eventos
    setupEvents();

    // Iniciar actualización de línea de tiempo
    updateNowLine();
    setInterval(updateNowLine, 60000);

    // Suscribirse a cambios en tiempo real
    setupRealtimeSubscription();
  }

  function cacheElements() {
    els = {
      container: document.querySelector('.agenda-mobile'),
      sedeSelector: document.querySelector('.am-sede-selector'),
      sedeName: document.getElementById('amSedeNameTop'),
      dateDisplay: document.querySelector('.am-date-current'),
      weekSelector: document.querySelector('.am-week-selector'),
      barberosHeader: document.querySelector('.am-barberos-scroll'),
      timeGutter: document.querySelector('.am-time-gutter'),
      gridScroll: document.querySelector('.am-grid-scroll'),
      grid: document.querySelector('.am-grid'),
      loading: document.querySelector('.am-loading'),
      sedeModal: document.querySelector('.am-sede-modal'),
      sedeList: document.querySelector('.am-sede-list'),
      fab: document.querySelector('.am-fab')
    };
  }

  function setupRoleUI() {
    // Actualizar el nombre de la sede
    updateSedeDisplay();

    // Configurar selector según rol
    var selectorTop = document.getElementById('amSedeSelectorTop');
    if (selectorTop) {
      var chevron = selectorTop.querySelector('.am-sede-chevron');

      if (state.role === 'admin') {
        // Admin General: puede cambiar sede
        selectorTop.style.cursor = 'pointer';
        if (chevron) chevron.style.display = 'block';

        // Agregar evento de click
        selectorTop.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          window.amOpenSedeModal();
        });
      } else {
        // Admin Sede: solo muestra la sede, no puede cambiar
        selectorTop.style.cursor = 'default';
        if (chevron) chevron.style.display = 'none';
      }
    }
  }

  function updateSedeDisplay() {
    if (els.sedeName) {
      els.sedeName.textContent = state.sedeName || 'Todas las sedes';
    }

    // Aplicar modo comprimido si es "Todas las sedes"
    if (els.container) {
      if (!state.sedeId) {
        els.container.classList.add('am-compressed');
      } else {
        els.container.classList.remove('am-compressed');
      }
    }
  }

  // ===== SELECTOR DE SEMANA =====
  function renderWeekSelector() {
    if (!els.weekSelector) return;

    const today = new Date();
    const selected = state.selectedDate;

    // Obtener inicio de la semana (lunes)
    const startOfWeek = new Date(selected);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);

    const days = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
    let html = '';

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);

      const isToday = isSameDay(date, today);
      const isActive = isSameDay(date, selected);

      const classes = ['am-day-item'];
      if (isToday) classes.push('today');
      if (isActive) classes.push('active');

      html += '<div class="' + classes.join(' ') + '" onclick="amSelectDate(\'' + date.toISOString() + '\')">' +
        '<span class="am-day-name">' + days[i] + '</span>' +
        '<span class="am-day-num">' + date.getDate() + '</span>' +
      '</div>';
    }

    els.weekSelector.innerHTML = html;
    updateDateDisplay();
  }

  function updateDateDisplay() {
    if (!els.dateDisplay) return;

    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    const formatted = state.selectedDate.toLocaleDateString('es-ES', options);
    els.dateDisplay.textContent = capitalizeFirst(formatted);
  }

  // ===== CARGA DE DATOS =====
  async function loadData() {
    // Incrementar generación para invalidar requests anteriores
    var currentGeneration = ++loadDataGeneration;

    showLoading(true);

    try {
      await Promise.all([
        loadBarberos(),
        loadCitas(),
        loadBloqueos()
      ]);

      // Ignorar resultados si hay una carga más reciente
      if (currentGeneration !== loadDataGeneration) {
        return;
      }

      renderAgenda();

      // Scroll automático a la hora actual después de renderizar
      setTimeout(scrollToCurrentHour, 100);
    } catch (error) {
      // Ignorar errores si hay una carga más reciente
      if (currentGeneration !== loadDataGeneration) {
        return;
      }
      console.error('Error cargando datos:', error);
      showToast('Error al cargar la agenda', 'error');
    } finally {
      // Solo ocultar loading si es la carga más reciente
      if (currentGeneration === loadDataGeneration) {
        showLoading(false);
      }
    }
  }

  // Función para hacer scroll a la hora actual
  function scrollToCurrentHour() {
    var scrollContainer = els.gridWrap || document.querySelector('.am-grid-wrap');
    if (!scrollContainer) return;

    var now = new Date();
    var currentHour = now.getHours();

    // Solo hacer scroll si estamos viendo el día actual
    if (!isSameDay(now, state.selectedDate)) {
      // Si no es hoy, scroll al inicio del horario
      scrollContainer.scrollTop = 0;
      return;
    }

    // Calcular la posición de scroll para mostrar la hora actual centrada
    if (currentHour >= state.horarioInicio && currentHour < state.horarioFin) {
      var hoursFromStart = currentHour - state.horarioInicio;
      var minutes = now.getMinutes();
      var scrollPosition = (hoursFromStart * state.slotHeight) + (minutes * state.slotHeight / 60);

      // Restar 1 hora de altura para centrar la hora actual en la parte superior
      var offset = state.slotHeight * 1;
      scrollPosition = Math.max(0, scrollPosition - offset);

      scrollContainer.scrollTop = scrollPosition;
    } else if (currentHour < state.horarioInicio) {
      // Si es antes del horario, scroll al inicio
      scrollContainer.scrollTop = 0;
    } else {
      // Si es después del horario, scroll al final
      var maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      scrollContainer.scrollTop = maxScroll;
    }
  }

  async function loadBarberos() {
    state.barberos = [];

    if (typeof sb === 'undefined') return;

    try {
      var query = sb
        .from('barberos')
        .select('id, sucursal_id, orden, dia_descanso, tipo_colaborador, usuarios!barberos_id_fkey(username, full_name, avatar_url)')
        .eq('activo', true)
        .or('tipo_colaborador.is.null,tipo_colaborador.neq.aseo')
        .order('orden');

      if (state.sedeId) {
        query = query.eq('sucursal_id', state.sedeId);
      }

      var { data, error } = await query;

      if (error) {
        console.error('Error cargando barberos:', error);
        return;
      }

      // Mapear datos para usar nombre desde usuarios
      var barberosMapped = (data || []).map(function(b) {
        return {
          id: b.id,
          nombre: b.usuarios ? (b.usuarios.full_name || b.usuarios.username) : 'Barbero',
          avatar_url: b.usuarios ? b.usuarios.avatar_url : null,
          dia_descanso: (b.dia_descanso !== null && b.dia_descanso !== undefined) ? b.dia_descanso : null
        };
      });

      // Ordenar: primero los que trabajan hoy, luego los que descansan
      state.barberos = barberosMapped.sort(function(a, b) {
        var aDescansa = barberoDescansaHoy(a);
        var bDescansa = barberoDescansaHoy(b);
        if (aDescansa && !bDescansa) return 1;
        if (!aDescansa && bDescansa) return -1;
        return 0;
      });
    } catch (e) {
      console.error('Error en loadBarberos:', e);
    }
  }

  async function loadBloqueos() {
    // Inicializar bloqueos vacío por defecto
    state.bloqueos = [];

    if (typeof sb === 'undefined') return;

    try {
      var dateStr = formatDateISO(state.selectedDate);

      var { data, error } = await sb
        .from('bloqueos_barbero')
        .select('id, barbero_id, hora_inicio, hora_fin, motivo, tipo')
        .eq('fecha', dateStr);

      if (error) {
        console.warn('Bloqueos no disponibles:', error.message);
        return;
      }

      state.bloqueos = data || [];
    } catch (e) {
      console.warn('Error cargando bloqueos:', e);
    }
  }

  async function loadCitas() {
    state.citas = [];

    if (typeof sb === 'undefined') return;

    try {
      var dateStr = formatDateISO(state.selectedDate);

      // Cargar citas con datos optimizados para reducir payload
      var query = sb
        .from('citas')
        .select('id, hora_inicio, hora_fin, estado, barbero_id, precio, propina, pagada_at, metodo_pago, usuarios!citas_cliente_id_fkey(full_name, username, phone), servicios(nombre), barberos(usuarios!barberos_id_fkey(full_name, username))')
        .eq('fecha', dateStr)
        .not('estado', 'eq', 'cancelada')
        .order('hora_inicio');

      if (state.sedeId) {
        query = query.eq('sucursal_id', state.sedeId);
      }

      var { data, error } = await query;

      if (error) {
        console.error('Error cargando citas:', error);
        return;
      }

      // Guardar datos completos para openDetail
      var citasCompletas = data || [];

      // Guardar en variable auxiliar y sincronizar con allCitas
      window._citasCompletasAgenda = citasCompletas;
      window.allCitas = citasCompletas;

      // Mapear datos para renderizado en agenda móvil
      state.citas = citasCompletas.map(function(c) {
        var clienteNombre = 'Cliente';
        if (c.usuarios) {
          clienteNombre = c.usuarios.full_name || c.usuarios.username || 'Cliente';
        }

        var servicioNombre = '';
        if (c.servicios && c.servicios.nombre) {
          servicioNombre = c.servicios.nombre;
        }

        return {
          id: c.id,
          hora_inicio: c.hora_inicio,
          hora_fin: c.hora_fin,
          estado: c.estado,
          barbero_id: c.barbero_id,
          cliente: { nombre: clienteNombre },
          servicios: servicioNombre ? [{ servicio: { nombre: servicioNombre } }] : []
        };
      });
    } catch (e) {
      console.error('Error en loadCitas:', e);
    }
  }

  // ===== DÍAS DE LA SEMANA =====
  var diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

  function getDiaSemana(date) {
    return diasSemana[date.getDay()];
  }

  function barberoDescansaHoy(barbero) {
    // dia_descanso puede ser número (0-6) o string ("lunes", etc.)
    if (barbero.dia_descanso === null || barbero.dia_descanso === undefined) {
      return false;
    }

    var weekday = state.selectedDate.getDay(); // 0=domingo, 1=lunes, etc.
    var esDiaDescanso = false;

    // Si es número, comparar directamente
    if (typeof barbero.dia_descanso === 'number') {
      esDiaDescanso = barbero.dia_descanso === weekday;
    } else {
      // Si es string numérico ("1", "2", etc.), convertir a número
      var diaDescansoNum = Number(barbero.dia_descanso);
      if (!isNaN(diaDescansoNum)) {
        esDiaDescanso = diaDescansoNum === weekday;
      } else {
        // Si es string de día ("lunes", "martes", etc.)
        var diaHoy = getDiaSemana(state.selectedDate);
        esDiaDescanso = barbero.dia_descanso.toLowerCase() === diaHoy;
      }
    }

    // Si no es día de descanso, retornar false
    if (!esDiaDescanso) {
      return false;
    }

    // Es día de descanso - verificar si hay habilitación para trabajar
    var habilitacion = (state.bloqueos || []).find(function(bl) {
      return bl.barbero_id === barbero.id && bl.tipo === 'habilitado';
    });

    // Si hay habilitación, puede trabajar (no descansa)
    if (habilitacion) {
      return false;
    }

    // Es día de descanso y no hay habilitación
    return true;
  }

  // ===== CÁLCULO DE ESPACIOS DISPONIBLES =====
  function getEspaciosDisponibles(barberoId) {
    var citasBarbero = state.citas.filter(function(c) {
      return c.barbero_id === barberoId;
    });
    var ocupados = citasBarbero.length;
    return Math.max(0, state.slotsPerDay - ocupados);
  }

  // ===== RENDERIZADO DE AGENDA =====
  function renderAgenda() {
    renderBarberosCarousel();
    renderTimeGutter();
    renderGrid();
    setupCarouselSwipe();
    setupScrollSync();
    setupGridClickHandler();
  }

  // Sincronizar scroll entre gutter y grid
  function setupScrollSync() {
    // El scroll ahora se maneja en am-grid-wrap (contenedor padre)
    // No necesitamos sincronización manual
    var gridWrap = document.querySelector('.am-grid-wrap');
    if (gridWrap) {
      // Guardar referencia para scroll automático
      els.gridWrap = gridWrap;
    }
  }

  function renderBarberosCarousel() {
    if (!els.barberosHeader) return;

    var totalPages = Math.ceil(state.barberos.length / state.barberosPerPage);
    if (state.currentPage >= totalPages) state.currentPage = 0;

    // Obtener barberos de la página actual
    var startIdx = state.currentPage * state.barberosPerPage;
    var pageBarberos = state.barberos.slice(startIdx, startIdx + state.barberosPerPage);

    if (state.barberos.length === 0) {
      els.barberosHeader.innerHTML = '<div class="am-barbero-col-header am-col-empty">' +
        '<div class="am-barbero-avatar"><span class="am-barbero-avatar-initials">?</span></div>' +
        '<div class="am-barbero-name">Sin barberos</div>' +
      '</div>';
      return;
    }

    var html = '';
    pageBarberos.forEach(function(barbero) {
      var initials = getInitials(barbero.nombre);
      var descansa = barberoDescansaHoy(barbero);
      var avatarContent = barbero.avatar_url
        ? '<img src="' + barbero.avatar_url + '" alt="' + barbero.nombre + '">'
        : '<span class="am-barbero-avatar-initials">' + initials + '</span>';

      // Truncar nombre para mostrar solo primer nombre o abreviado
      var nombreCorto = barbero.nombre.split(' ')[0];
      if (nombreCorto.length > 6) {
        nombreCorto = nombreCorto.substring(0, 5) + '.';
      }

      var headerClass = descansa ? 'am-barbero-col-header am-header-descansa' : 'am-barbero-col-header';

      if (descansa) {
        html += '<div class="' + headerClass + '" data-barbero-id="' + barbero.id + '">' +
          '<div class="am-barbero-avatar am-avatar-descansa">' + avatarContent + '</div>' +
          '<div class="am-barbero-name">' + nombreCorto + '</div>' +
          '<div class="am-barbero-espacios am-espacios-lleno">0/9</div>' +
        '</div>';
      } else {
        var espacios = getEspaciosDisponibles(barbero.id);
        var espaciosClass = espacios === 0 ? 'am-espacios-lleno' : (espacios <= 3 ? 'am-espacios-pocos' : '');

        html += '<div class="' + headerClass + '" data-barbero-id="' + barbero.id + '">' +
          '<div class="am-barbero-avatar">' + avatarContent + '</div>' +
          '<div class="am-barbero-name">' + nombreCorto + '</div>' +
          '<div class="am-barbero-espacios ' + espaciosClass + '">' + espacios + '/' + state.slotsPerDay + '</div>' +
        '</div>';
      }
    });

    els.barberosHeader.innerHTML = html;

    // Remover indicador de página (ya no hay paginación)
    var existingIndicator = document.querySelector('.am-page-indicator');
    if (existingIndicator) existingIndicator.remove();
  }

  function renderTimeGutter() {
    if (!els.timeGutter) return;

    var html = '';
    for (var hour = state.horarioInicio; hour < state.horarioFin; hour++) {
      var timeStr = (hour < 10 ? '0' : '') + hour + ':00';
      html += '<div class="am-time-slot" style="height: ' + state.slotHeight + 'px">' + timeStr + '</div>';
    }

    els.timeGutter.innerHTML = html;
  }

  function renderGrid() {
    if (!els.grid) return;

    var totalHours = state.horarioFin - state.horarioInicio;
    var gridHeight = totalHours * state.slotHeight;

    // Obtener barberos de la página actual
    var startIdx = state.currentPage * state.barberosPerPage;
    var pageBarberos = state.barberos.slice(startIdx, startIdx + state.barberosPerPage);

    if (state.barberos.length === 0) {
      els.grid.innerHTML = '<div class="am-empty">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>' +
        '</svg>' +
        '<span class="am-empty-text">No hay barberos disponibles</span>' +
      '</div>';
      els.grid.style.height = gridHeight + 'px';
      return;
    }

    var html = '';

    // Líneas de hora
    for (var hour = state.horarioInicio; hour < state.horarioFin; hour++) {
      var top = (hour - state.horarioInicio) * state.slotHeight;
      html += '<div class="am-hour-line" style="top: ' + top + 'px"></div>';
    }

    // Columnas de barberos (solo los de la página actual)
    pageBarberos.forEach(function(barbero) {
      var descansa = barberoDescansaHoy(barbero);

      // Verificar si tiene bloqueo de día completo
      var bloqueosBarbero = (state.bloqueos || []).filter(function(bl) { return bl.barbero_id === barbero.id; });
      var bloqueoDiaCompleto = bloqueosBarbero.some(function(bl) {
        // Bloqueo tipo 'dia' o que cubre todo el horario de trabajo
        if (bl.tipo === 'dia') return true;
        var inicio = parseTime(bl.hora_inicio);
        var fin = parseTime(bl.hora_fin);
        return inicio.hours <= state.horarioInicio && fin.hours >= state.horarioFin;
      });

      var colClass = (descansa || bloqueoDiaCompleto) ? 'am-barbero-col am-col-descansa' : 'am-barbero-col';

      html += '<div class="' + colClass + '" data-barbero-id="' + barbero.id + '" style="height: ' + gridHeight + 'px">';

      // Si descansa o tiene bloqueo de día completo, mostrar bloqueo
      if (descansa) {
        html += '<div class="am-bloqueo am-bloqueo-descanso" style="top: 0; height: ' + gridHeight + 'px">' +
          '<span class="am-bloqueo-text">DESCANSA</span>' +
        '</div>';
      } else if (bloqueoDiaCompleto) {
        html += '<div class="am-bloqueo am-bloqueo-descanso" style="top: 0; height: ' + gridHeight + 'px">' +
          '<span class="am-bloqueo-text">BLOQUEADO</span>' +
        '</div>';
      } else {
        // Obtener citas y bloqueos del barbero para verificar disponibilidad
        var barberosCitas = state.citas.filter(function(c) { return c.barbero_id === barbero.id; });

        // Renderizar slots de hora disponible
        for (var hour = state.horarioInicio; hour < state.horarioFin; hour++) {
          var slotTop = (hour - state.horarioInicio) * state.slotHeight;
          var horaStr = (hour < 10 ? '0' : '') + hour + ':00';

          // Verificar si es hora de almuerzo
          if (hour >= state.horaAlmuerzoInicio && hour < state.horaAlmuerzoFin) {
            continue; // No mostrar slot en hora de almuerzo
          }

          // Verificar si hay bloqueo en esta hora
          var enBloqueo = bloqueosBarbero.some(function(bl) {
            var inicioBloqueo = parseTime(bl.hora_inicio);
            var finBloqueo = parseTime(bl.hora_fin);
            return hour >= inicioBloqueo.hours && hour < finBloqueo.hours;
          });
          if (enBloqueo) continue;

          // Verificar si hay cita en esta hora
          var enCita = barberosCitas.some(function(c) {
            var inicioCita = parseTime(c.hora_inicio);
            var finCita = parseTime(c.hora_fin);
            var inicioMin = inicioCita.hours * 60 + inicioCita.minutes;
            var finMin = finCita.hours * 60 + finCita.minutes;
            var horaMin = hour * 60;
            return horaMin >= inicioMin && horaMin < finMin;
          });
          if (enCita) continue;

          // Slot disponible - mostrar hora
          html += '<div class="am-hour-slot" style="top: ' + slotTop + 'px; height: ' + state.slotHeight + 'px" data-hora="' + horaStr + '">' +
            '<span class="am-hour-slot-time">' + horaStr + '</span>' +
          '</div>';
        }

        // Bloque de almuerzo (13:00-14:00)
        var almuerzoTop = (state.horaAlmuerzoInicio - state.horarioInicio) * state.slotHeight;
        var almuerzoHeight = (state.horaAlmuerzoFin - state.horaAlmuerzoInicio) * state.slotHeight;
        html += '<div class="am-bloqueo am-bloqueo-almuerzo" style="top: ' + almuerzoTop + 'px; height: ' + almuerzoHeight + 'px">' +
          '<span class="am-bloqueo-icon">🍽️</span>' +
        '</div>';

        // Bloqueos del barbero
        bloqueosBarbero.forEach(function(bloqueo) {
          html += renderBloqueo(bloqueo);
        });

        // Citas de este barbero
        barberosCitas.forEach(function(cita) {
          html += renderCita(cita);
        });
      }

      html += '</div>';
    });

    // Línea de hora actual
    html += '<div class="am-now-line" id="am-now-line"><div class="am-now-dot"></div></div>';

    els.grid.innerHTML = html;
    els.grid.style.height = gridHeight + 'px';

    updateNowLine();
  }

  function renderCita(cita) {
    const horaInicio = parseTime(cita.hora_inicio);
    const horaFin = parseTime(cita.hora_fin);

    // Calcular posición
    const startMinutes = (horaInicio.hours - state.horarioInicio) * 60 + horaInicio.minutes;
    const endMinutes = (horaFin.hours - state.horarioInicio) * 60 + horaFin.minutes;
    const duration = endMinutes - startMinutes;

    const pixelsPerMinute = state.slotHeight / 60;
    const top = startMinutes * pixelsPerMinute;
    const height = Math.max(duration * pixelsPerMinute, 28); // Mínimo 28px

    // Nombre del cliente - separar en nombre y apellido
    let clienteNombre = cita.cliente && cita.cliente.nombre ? cita.cliente.nombre : 'Sin cliente';
    const nombreParts = clienteNombre.split(' ');
    const primerNombre = nombreParts[0] || '';
    const apellido = nombreParts.length > 1 ? nombreParts[1] : '';

    // Servicios - abreviado
    let servicio = '';
    if (cita.servicios && cita.servicios.length > 0 && cita.servicios[0].servicio) {
      servicio = cita.servicios[0].servicio.nombre || '';
    }

    // Hora formateada
    const horaStr = cita.hora_inicio.slice(0, 5);

    // Construir HTML con texto horizontal
    let citaHtml = '<div class="am-cita ' + cita.estado + '" style="top: ' + top + 'px; height: ' + height + 'px" data-cita-id="' + cita.id + '">' +
      '<div class="am-cita-hora">' + horaStr + '</div>' +
      '<div class="am-cita-content">' +
      '<div class="am-cita-cliente">' + primerNombre + '</div>';

    // Mostrar apellido si hay espacio
    if (height > 45 && apellido) {
      citaHtml += '<div class="am-cita-cliente">' + apellido + '</div>';
    }

    // Mostrar servicio si hay espacio
    if (height > 60 && servicio) {
      citaHtml += '<div class="am-cita-servicio">' + servicio + '</div>';
    }

    citaHtml += '</div></div>';

    return citaHtml;
  }

  function renderBloqueo(bloqueo) {
    var horaInicio = parseTime(bloqueo.hora_inicio);
    var horaFin = parseTime(bloqueo.hora_fin);

    var startMinutes = (horaInicio.hours - state.horarioInicio) * 60 + horaInicio.minutes;
    var endMinutes = (horaFin.hours - state.horarioInicio) * 60 + horaFin.minutes;
    var duration = endMinutes - startMinutes;

    var pixelsPerMinute = state.slotHeight / 60;
    var top = startMinutes * pixelsPerMinute;
    var height = Math.max(duration * pixelsPerMinute, 20);

    var motivo = bloqueo.motivo || 'Bloqueado';

    return '<div class="am-bloqueo" style="top: ' + top + 'px; height: ' + height + 'px">' +
      '<span class="am-bloqueo-text">' + motivo + '</span>' +
    '</div>';
  }

  // ===== CARRUSEL DE BARBEROS (SWIPE) =====
  function setupCarouselSwipe() {
    var gridWrap = els.gridScroll;
    if (!gridWrap) return;

    var touchStartX = 0;
    var touchEndX = 0;
    var minSwipeDistance = 50;

    gridWrap.addEventListener('touchstart', function(e) {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    gridWrap.addEventListener('touchend', function(e) {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    }, { passive: true });

    function handleSwipe() {
      var diff = touchStartX - touchEndX;
      var totalPages = Math.ceil(state.barberos.length / state.barberosPerPage);

      if (Math.abs(diff) < minSwipeDistance) return;

      if (diff > 0) {
        // Swipe izquierda - siguiente página
        if (state.currentPage < totalPages - 1) {
          state.currentPage++;
          renderBarberosCarousel();
          renderGrid();
        }
      } else {
        // Swipe derecha - página anterior
        if (state.currentPage > 0) {
          state.currentPage--;
          renderBarberosCarousel();
          renderGrid();
        }
      }
    }
  }

  // Funciones globales para navegación de páginas
  window.amNextPage = function() {
    var totalPages = Math.ceil(state.barberos.length / state.barberosPerPage);
    if (state.currentPage < totalPages - 1) {
      state.currentPage++;
      renderBarberosCarousel();
      renderGrid();
    }
  };

  window.amPrevPage = function() {
    if (state.currentPage > 0) {
      state.currentPage--;
      renderBarberosCarousel();
      renderGrid();
    }
  };

  // ===== LÍNEA DE HORA ACTUAL =====
  function updateNowLine() {
    const nowLine = document.getElementById('am-now-line');
    if (!nowLine) return;

    const now = new Date();

    // Verificar si es el día seleccionado
    if (!isSameDay(now, state.selectedDate)) {
      nowLine.style.display = 'none';
      return;
    }

    const hours = now.getHours();
    const minutes = now.getMinutes();

    // Verificar si está dentro del horario
    if (hours < state.horarioInicio || hours > state.horarioFin) {
      nowLine.style.display = 'none';
      return;
    }

    const totalMinutes = (hours - state.horarioInicio) * 60 + minutes;
    const pixelsPerMinute = state.slotHeight / 60;
    const top = totalMinutes * pixelsPerMinute;

    nowLine.style.display = 'block';
    nowLine.style.top = top + 'px';
    nowLine.setAttribute('data-time', (hours < 10 ? '0' : '') + hours + ':' + (minutes < 10 ? '0' : '') + minutes);
  }

  // ===== EVENTOS =====
  function setupEvents() {
    // Navegación de fecha
    var arrows = document.querySelectorAll('.am-date-arrow');
    for (var i = 0; i < arrows.length; i++) {
      (function(index) {
        arrows[index].addEventListener('click', function() {
          amShiftDate(index === 0 ? -7 : 7);
        });
      })(i);
    }

    // Botón Hoy
    const todayBtn = document.querySelector('.am-today-btn');
    if (todayBtn) {
      todayBtn.addEventListener('click', amGoToday);
    }

    // Click en fecha para abrir calendario
    if (els.dateDisplay) {
      els.dateDisplay.addEventListener('click', openDatePicker);
    }

    // Selector de sede (Admin General)
    if (els.sedeSelector) {
      els.sedeSelector.addEventListener('click', amOpenSedeModal);
    }

    // Modal de sedes - cerrar al hacer click fuera
    if (els.sedeModal) {
      els.sedeModal.addEventListener('click', function(e) {
        if (e.target === els.sedeModal) {
          els.sedeModal.classList.remove('show');
        }
      });
    }

    // FAB - Nueva cita
    if (els.fab) {
      els.fab.addEventListener('click', amNewCita);
    }
  }

  // ===== REALTIME =====
  function setupRealtimeSubscription() {
    if (typeof sb === 'undefined') return;

    sb.channel('agenda-mobile-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'citas'
      }, function(payload) {
        // Recargar si la cita es del día seleccionado
        const dateStr = formatDateISO(state.selectedDate);
        if ((payload.new && payload.new.fecha === dateStr) || (payload.old && payload.old.fecha === dateStr)) {
          // Debounce para evitar múltiples recargas en cascada
          if (realtimeDebounceTimer) {
            clearTimeout(realtimeDebounceTimer);
          }
          realtimeDebounceTimer = setTimeout(function() {
            loadCitas().then(renderAgenda);
          }, REALTIME_DEBOUNCE_MS);
        }
      })
      .subscribe();
  }

  // ===== FUNCIONES GLOBALES =====
  window.amSelectDate = function(isoString) {
    state.selectedDate = new Date(isoString);
    syncSelectedDate();
    renderWeekSelector();
    loadData();
  };

  window.amShiftDate = function(days) {
    state.selectedDate.setDate(state.selectedDate.getDate() + days);
    syncSelectedDate();
    renderWeekSelector();
    loadData();
  };

  window.amGoToday = function() {
    state.selectedDate = new Date();
    syncSelectedDate();
    renderWeekSelector();
    loadData();
  };

  // Sincronizar fecha con el calendario web
  function syncSelectedDate() {
    if (typeof window.selectedDate !== 'undefined') {
      window.selectedDate = formatDateISO(state.selectedDate);
    }
  }

  window.amOpenCita = function(citaId) {
    // Buscar la cita en múltiples fuentes
    var cita = null;

    // Primero buscar en _citasCompletasAgenda (datos más recientes de la vista móvil)
    if (window._citasCompletasAgenda && window._citasCompletasAgenda.length > 0) {
      cita = window._citasCompletasAgenda.find(function(c) { return c.id === citaId; });
    }

    // Si no encontrada, buscar en allCitas
    if (!cita && window.allCitas && window.allCitas.length > 0) {
      cita = window.allCitas.find(function(c) { return c.id === citaId; });
    }

    if (!cita) return;

    // Usar modal propio que siempre funciona
    showAmDetailModal(cita);
  };

  // Crear y mostrar modal de detalle (diseño idéntico al modal web)
  function showAmDetailModal(cita) {
    // Crear modal si no existe - usar las mismas clases del modal web
    var modal = document.getElementById('amDetailModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'amDetailModal';
      modal.className = 'modal-overlay';
      modal.style.cssText = 'z-index:99999 !important;';
      document.body.appendChild(modal);
    }

    // Datos de la cita
    var nombre = cita.usuarios ? (cita.usuarios.full_name || cita.usuarios.username) : 'Cliente';
    var telefono = cita.usuarios ? cita.usuarios.phone : '';
    var servicio = cita.servicios ? cita.servicios.nombre : '—';
    var barbero = cita.barberos && cita.barberos.usuarios ? (cita.barberos.usuarios.full_name || cita.barberos.usuarios.username) : '—';
    var horaInicio = cita.hora_inicio ? cita.hora_inicio.slice(0,5) : '';
    var horaFin = cita.hora_fin ? cita.hora_fin.slice(0,5) : '';
    var horaDisplay = horaInicio + ' - ' + horaFin;
    if (typeof fmtTime === 'function') {
      horaDisplay = fmtTime(cita.hora_inicio) + ' - ' + fmtTime(cita.hora_fin);
    }
    var precioBase = Number(cita.precio) || 0;
    var propina = Number(cita.propina) || 0;
    var totalConPropina = precioBase + propina;

    // Obtener constantes globales de estado
    var ESTADO_LABEL = window.ESTADO_LABEL || {
      agendada:'Agendada', confirmada:'Confirmada', sala_espera:'Sala de espera', en_servicio:'En servicio',
      pendiente_pago:'Pendiente de pago', finalizada:'Finalizada', cancelada:'Cancelada'
    };
    var ESTADO_PILL = window.ESTADO_PILL || {};
    var pill = ESTADO_PILL[cita.estado] || { color:'var(--text-secondary)' };
    var estadoLabel = ESTADO_LABEL[cita.estado] || cita.estado;

    // Formatear precio
    function formatCOP(val) {
      if (typeof dnFormatCOP === 'function') return dnFormatCOP(val);
      return '$' + val.toLocaleString('es-CO');
    }

    // Teléfono clickeable
    var phoneDisplay = telefono ? '<span class="det-phone-link" style="color:var(--gold);font-size:13px;margin-left:8px;cursor:pointer;">' + telefono + '</span>' : '';

    // Info de pago si existe
    var pagadaInfo = '';
    if (cita.pagada_at) {
      var pagadaDate = new Date(cita.pagada_at);
      var pagadaStr = pagadaDate.toLocaleDateString('es-CO', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
      var metodoLabel = cita.metodo_pago ? cita.metodo_pago.charAt(0).toUpperCase() + cita.metodo_pago.slice(1) : '';
      pagadaInfo = '<div class="detail-row" style="background:rgba(16,185,129,0.12);border-radius:8px;padding:8px 12px;margin-top:8px;"><span style="color:#10B981;">Pagada el</span><b style="color:#6EE7B7;">' + pagadaStr + '</b></div>';
      if (metodoLabel) {
        pagadaInfo += '<div class="detail-row" style="background:rgba(16,185,129,0.08);border-radius:8px;padding:8px 12px;margin-top:4px;"><span style="color:#10B981;">Método</span><b style="color:#6EE7B7;">' + metodoLabel + '</b></div>';
      }
    }

    // Propina
    var propinaHtml = propina > 0 ? '<div class="detail-row"><span style="color:var(--gold);">Propina</span><b style="color:var(--gold);">' + formatCOP(propina) + '</b></div>' : '';
    var totalHtml = propina > 0 ? '<div class="detail-row" style="border-top:1px solid var(--glass-border);padding-top:8px;margin-top:8px;"><span><b>Total</b></span><b>' + formatCOP(totalConPropina) + '</b></div>' : '';

    // Pills de estado para editar
    var estadoPills = Object.keys(ESTADO_LABEL).map(function(est) {
      return '<span class="det-estado-pill ' + (est === cita.estado ? 'current' : '') + '" data-estado="' + est + '">' + ESTADO_LABEL[est] + '</span>';
    }).join('');

    // Botón de pagar cita
    var btnPagarCita = (cita.estado !== 'finalizada' && cita.estado !== 'pendiente_pago' && cita.estado !== 'cancelada')
      ? '<button class="apple-btn" style="background:rgba(201,163,91,0.15);color:var(--gold);justify-content:center;width:100%;height:46px;border-radius:14px;font-size:13px;" data-action="pagar">Pagar cita</button>'
      : '';

    // Acciones según estado
    var acciones = '';
    if (cita.estado === 'agendada') {
      var waUrl = '#';
      if (typeof waLink === 'function') {
        waUrl = waLink(telefono, nombre, cita.hora_inicio, barbero);
      } else {
        var cleanPhone = (telefono || '').replace(/\D/g, '');
        waUrl = 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent('Hola ' + nombre + ', te escribimos de Keicy Barber.');
      }
      acciones = '<a class="apple-btn" style="background:rgba(78,203,113,0.16);color:var(--success);justify-content:center;text-decoration:none;width:100%;height:46px;display:flex;align-items:center;border-radius:14px;font-size:13px;" target="_blank" href="' + waUrl + '">WhatsApp</a>' +
        '<button class="apple-btn primary" style="justify-content:center;width:100%;height:46px;border-radius:14px;font-size:13px;" data-action="confirmar">Confirmar</button>' +
        btnPagarCita +
        '<button class="apple-btn btn-cancel-danger" style="justify-content:center;width:100%;height:46px;border-radius:14px;font-size:13px;" data-action="cancelar">Cancelar cita</button>';
    } else if (cita.estado === 'confirmada') {
      acciones = '<button class="apple-btn primary" style="justify-content:center;width:100%;height:46px;border-radius:14px;font-size:13px;" data-action="cliente-llego">Cliente llegó</button>' + btnPagarCita;
    } else if (cita.estado === 'sala_espera') {
      acciones = '<button class="apple-btn primary" style="justify-content:center;width:100%;height:46px;border-radius:14px;font-size:13px;" data-action="llamar">Llamar cliente</button>' + btnPagarCita;
    } else if (cita.estado === 'en_servicio') {
      acciones = '<button class="apple-btn primary" style="justify-content:center;width:100%;height:46px;border-radius:14px;font-size:13px;" data-action="finalizar">Finalizar servicio</button>' + btnPagarCita;
    } else if (cita.estado === 'pendiente_pago') {
      acciones = '<button class="apple-btn primary" style="justify-content:center;width:100%;height:46px;border-radius:14px;font-size:13px;" data-action="ver-orden">Ver orden</button>';
    } else if (cita.estado === 'finalizada') {
      acciones = '<button class="apple-btn" style="background:rgba(107,114,128,0.15);color:var(--text-secondary);justify-content:center;width:100%;height:46px;border-radius:14px;font-size:13px;" data-action="cerrar">Cerrar</button>';
    } else {
      // Para cualquier otro estado, agregar botón cerrar
      acciones += '<button class="apple-btn" style="background:rgba(107,114,128,0.15);color:var(--text-secondary);justify-content:center;width:100%;height:46px;border-radius:14px;font-size:13px;margin-top:4px;" data-action="cerrar">Cerrar</button>';
    }

    // Construir HTML del modal (idéntico al web)
    modal.innerHTML = '<div class="modal-box" style="max-width:390px;">' +
      '<button class="modal-close" style="float:right;cursor:pointer;color:var(--text-secondary);font-size:13px;background:none;border:none;padding:8px 12px;margin:-8px -12px 0 0;">✕ Cerrar</button>' +
      '<div class="modal-title" style="font-size:16.5px;font-weight:700;">' + nombre + '</div>' +
      '<div class="modal-sub" style="font-size:12.5px;color:var(--text-secondary);margin-bottom:16px;display:flex;align-items:center;gap:7px;">' +
        '<span class="det-status-dot" style="width:9px;height:9px;border-radius:50%;flex-shrink:0;display:inline-block;background:' + (pill.color || 'var(--text-secondary)') + ';"></span>' +
        '<span>' + estadoLabel + '</span>' +
        phoneDisplay +
        '<span class="det-estado-toggle" style="font-size:12px;font-weight:700;color:var(--gold);cursor:pointer;text-decoration:underline;text-underline-offset:2px;">Editar estado</span>' +
      '</div>' +
      '<div id="amDetBody">' +
        '<div class="detail-row" style="display:flex;justify-content:space-between;font-size:12.5px;padding:8px 0;border-bottom:1px solid var(--glass-border);"><span>Servicio</span><b style="font-weight:600;">' + servicio + '</b></div>' +
        '<div class="detail-row" style="display:flex;justify-content:space-between;font-size:12.5px;padding:8px 0;border-bottom:1px solid var(--glass-border);"><span>Barbero</span><b style="font-weight:600;">' + barbero + '</b></div>' +
        '<div class="detail-row" style="display:flex;justify-content:space-between;font-size:12.5px;padding:8px 0;border-bottom:1px solid var(--glass-border);"><span>Hora</span><b style="font-weight:600;">' + horaDisplay + '</b></div>' +
        '<div class="detail-row" style="display:flex;justify-content:space-between;font-size:12.5px;padding:8px 0;border-bottom:1px solid var(--glass-border);"><span>Precio servicio</span><b style="font-weight:600;">' + formatCOP(precioBase) + '</b></div>' +
        propinaHtml +
        totalHtml +
        pagadaInfo +
        '<div class="det-estado-row" id="amDetEstadoRow" style="display:none;flex-wrap:wrap;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--glass-border);">' +
          estadoPills +
        '</div>' +
      '</div>' +
      '<div class="detail-actions" style="display:flex;flex-direction:column;gap:8px;margin-top:16px;">' + acciones + '</div>' +
    '</div>';

    // Mostrar estados automáticamente para citas finalizadas
    if (cita.estado === 'finalizada') {
      setTimeout(function() {
        var row = document.getElementById('amDetEstadoRow');
        if (row) row.style.display = 'flex';
      }, 50);
    }

    // Event listeners usando delegación (más confiable en móvil)
    modal.onclick = function(e) {
      var target = e.target;

      // Cerrar al hacer clic en overlay
      if (target === modal) {
        closeAmDetailModal();
        return;
      }

      // Cerrar - usar closest para detectar clic en el span o sus hijos
      if (target.closest('.modal-close') || target.dataset.action === 'cerrar') {
        e.preventDefault();
        e.stopPropagation();
        closeAmDetailModal();
        return;
      }

      // Teléfono
      if (target.closest('.det-phone-link')) {
        e.preventDefault();
        if (typeof showPhoneOptions === 'function') {
          showPhoneOptions(telefono, nombre);
        }
        return;
      }

      // Editar estado
      if (target.closest('.det-estado-toggle')) {
        e.preventDefault();
        var row = document.getElementById('amDetEstadoRow');
        if (row) row.style.display = row.style.display === 'none' ? 'flex' : 'none';
        return;
      }

      // Pills de estado
      var pillTarget = target.closest('.det-estado-pill');
      if (pillTarget && !pillTarget.classList.contains('current')) {
        e.preventDefault();
        var nuevoEstado = pillTarget.dataset.estado;
        if (nuevoEstado && typeof setEstado === 'function') {
          setEstado(cita.id, nuevoEstado);
          closeAmDetailModal();
          loadData();
        }
        return;
      }

      // Acciones - buscar en el elemento clickeado y sus padres
      var actionBtn = target.closest('[data-action]');
      var action = actionBtn ? actionBtn.dataset.action : null;

      if (action === 'confirmar') {
        e.preventDefault();
        if (typeof setEstado === 'function') {
          setEstado(cita.id, 'confirmada');
          closeAmDetailModal();
          loadData();
        }
      } else if (action === 'cancelar') {
        e.preventDefault();
        if (typeof setEstado === 'function') {
          setEstado(cita.id, 'cancelada');
          closeAmDetailModal();
          loadData();
        }
      } else if (action === 'cliente-llego') {
        e.preventDefault();
        if (typeof clienteLlego === 'function') {
          clienteLlego(cita.id);
          closeAmDetailModal();
          loadData();
        } else if (typeof setEstado === 'function') {
          setEstado(cita.id, 'sala_espera');
          closeAmDetailModal();
          loadData();
        }
      } else if (action === 'llamar') {
        e.preventDefault();
        if (typeof llamarCliente === 'function') {
          llamarCliente(cita.id);
          closeAmDetailModal();
          loadData();
        } else if (typeof setEstado === 'function') {
          setEstado(cita.id, 'en_servicio');
          closeAmDetailModal();
          loadData();
        }
      } else if (action === 'finalizar') {
        e.preventDefault();
        if (typeof finalizarServicio === 'function') {
          finalizarServicio(cita.id, cita.barbero_id);
          closeAmDetailModal();
          loadData();
        } else if (typeof setEstado === 'function') {
          setEstado(cita.id, 'pendiente_pago');
          closeAmDetailModal();
          loadData();
        }
      } else if (action === 'ver-orden') {
        e.preventDefault();
        closeAmDetailModal();
        if (typeof openPagoDetail === 'function') {
          openPagoDetail(cita.id);
        }
      } else if (action === 'pagar') {
        e.preventDefault();
        if (typeof irAPagarCita === 'function') {
          irAPagarCita(cita.id);
        }
      } else if (action === 'cerrar') {
        e.preventDefault();
        closeAmDetailModal();
      }
    };

    // Agregar también touchend para mejor respuesta en móviles
    modal.ontouchend = function(e) {
      var target = e.target;

      // Cerrar al tocar overlay
      if (target === modal) {
        e.preventDefault();
        closeAmDetailModal();
        return;
      }

      // Cerrar con botón
      if (target.closest('.modal-close')) {
        e.preventDefault();
        closeAmDetailModal();
        return;
      }
    };

    modal.classList.add('show');
  }

  window.closeAmDetailModal = function() {
    var modal = document.getElementById('amDetailModal');
    if (modal) modal.classList.remove('show');
  };

  window.amWhatsapp = function(phone, name) {
    var cleanPhone = phone.replace(/\D/g, '');
    var url = 'https://wa.me/57' + cleanPhone + '?text=' + encodeURIComponent('Hola ' + name + ', te escribimos de Keicy Barber.');
    window.open(url, '_blank');
  };

  window.amCallOrWhatsapp = function(phone, name) {
    if (typeof window.showPhoneOptions === 'function') {
      window.showPhoneOptions(phone, name);
    } else {
      window.location.href = 'tel:' + phone;
    }
  };

  window.amCambiarEstado = async function(citaId, nuevoEstado) {
    try {
      var { error } = await sb.from('citas').update({ estado: nuevoEstado }).eq('id', citaId);
      if (error) throw error;
      closeAmDetailModal();
      loadData(); // Recargar agenda
    } catch (e) {
      alert('Error al cambiar estado: ' + e.message);
    }
  };

  window.amNewCita = function() {
    // Abrir modal de nueva cita usando la función existente
    if (typeof window.slotOptionNewCita === 'function') {
      window.slotOptionNewCita();
    }
  };

  // Abrir nueva cita con datos preseleccionados (desde tap en espacio vacío)
  window.amNewCitaWithData = function(barberoId, horaStr) {
    // Sincronizar la fecha seleccionada con el calendario web
    if (typeof window.selectedDate !== 'undefined') {
      window.selectedDate = formatDateISO(state.selectedDate);
    }

    // Usar openNewAppt si está disponible (calendario.html)
    if (typeof window.openNewAppt === 'function') {
      // Verificar si el barbero está en allBarberos
      var barberoEnLista = window.allBarberos && window.allBarberos.find(function(b) { return b.id === barberoId; });

      if (!barberoEnLista && barberoId) {
        // El barbero no está en la lista actual, buscar su info en state.barberos
        var barberoInfo = state.barberos.find(function(b) { return b.id === barberoId; });
        if (barberoInfo && window.allBarberos) {
          // Agregar temporalmente el barbero a allBarberos para que aparezca en el select
          window.allBarberos.push({
            id: barberoId,
            usuarios: { full_name: barberoInfo.nombre, username: barberoInfo.nombre }
          });
        }
      }

      window.openNewAppt(barberoId, horaStr);
    }
  };

  window.amOpenSedeModal = async function() {
    // Buscar elementos dinámicamente
    var sedeModal = document.getElementById('amSedeModal');
    var sedeList = sedeModal ? sedeModal.querySelector('.am-sede-list') : null;

    if (!sedeModal || !sedeList) return;
    if (typeof sb === 'undefined') return;

    const result = await sb
      .from('sucursales')
      .select('id, nombre')
      .eq('activa', true)
      .order('nombre');

    if (result.error) {
      console.error('Error cargando sedes:', result.error);
      return;
    }

    var sedes = result.data || [];

    // Renderizar lista
    var html = '<div class="am-sede-option ' + (!state.sedeId ? 'active' : '') + '" onclick="amSelectSede(null, \'Todas las sedes\')">' +
      '<div class="am-sede-option-icon">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>' +
        '</svg>' +
      '</div>' +
      '<span class="am-sede-option-name">Todas las sedes</span>' +
    '</div>';

    sedes.forEach(function(sede) {
      var isActive = state.sedeId === sede.id;
      html += '<div class="am-sede-option ' + (isActive ? 'active' : '') + '" onclick="amSelectSede(\'' + sede.id + '\', \'' + sede.nombre + '\')">' +
        '<div class="am-sede-option-icon">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>' +
          '</svg>' +
        '</div>' +
        '<span class="am-sede-option-name">' + sede.nombre + '</span>' +
      '</div>';
    });

    sedeList.innerHTML = html;
    sedeModal.classList.add('show');
  };

  window.amSelectSede = function(sedeId, sedeName) {
    state.sedeId = sedeId;
    state.sedeName = sedeName;

    // Guardar usando la función global
    if (typeof dnSetSedeActual === 'function') {
      if (sedeId) {
        dnSetSedeActual(sedeId);
      }
    }
    localStorage.setItem('dn_sede_nombre', sedeName || '');

    // Actualizar UI
    updateSedeDisplay();

    // Cerrar modal
    var sedeModal = els.sedeModal || document.querySelector('.am-sede-modal');
    if (sedeModal) {
      sedeModal.classList.remove('show');
    }

    // Recargar datos
    loadData();
  };

  // ===== HANDLER DE CLIC EN ESPACIO VACÍO =====
  var gridClickHandlerSetup = false;
  var touchStartPos = null;
  var touchStartTime = 0;
  var isScrolling = false;
  var SCROLL_THRESHOLD = 15; // píxeles de movimiento para considerar scroll

  function setupGridClickHandler() {
    if (!els.grid || gridClickHandlerSetup) return;
    gridClickHandlerSetup = true;

    // Detectar inicio de touch para distinguir tap de scroll
    els.grid.addEventListener('touchstart', function(e) {
      var touch = e.touches[0];
      touchStartPos = { x: touch.clientX, y: touch.clientY };
      touchStartTime = Date.now();
      isScrolling = false;
    }, { passive: true });

    // Detectar movimiento para marcar como scroll
    els.grid.addEventListener('touchmove', function(e) {
      if (!touchStartPos) return;
      var touch = e.touches[0];
      var deltaX = Math.abs(touch.clientX - touchStartPos.x);
      var deltaY = Math.abs(touch.clientY - touchStartPos.y);
      if (deltaX > SCROLL_THRESHOLD || deltaY > SCROLL_THRESHOLD) {
        isScrolling = true;
      }
    }, { passive: true });

    // Handler para touchend - solo actuar si NO fue scroll
    els.grid.addEventListener('touchend', function(e) {
      // Si fue scroll, ignorar
      if (isScrolling) {
        touchStartPos = null;
        isScrolling = false;
        return;
      }

      // Si el touch duró más de 300ms, probablemente fue scroll lento
      if (Date.now() - touchStartTime > 300) {
        touchStartPos = null;
        return;
      }

      var citaEl = e.target.closest('.am-cita');
      if (citaEl) {
        var citaId = citaEl.dataset.citaId;
        if (citaId) {
          e.preventDefault();
          e.stopPropagation();
          amOpenCita(citaId);
        }
        touchStartPos = null;
        return;
      }

      // Manejar taps en slots disponibles
      var slotEl = e.target.closest('.am-hour-slot');
      if (slotEl) {
        var horaStr = slotEl.dataset.hora;
        var col = slotEl.closest('.am-barbero-col');
        if (col && horaStr) {
          var barberoId = col.dataset.barberoId;
          if (barberoId) {
            e.preventDefault();
            e.stopPropagation();
            var touch = e.changedTouches[0];
            showHoraFeedback(touch.clientX, touch.clientY, horaStr);
            amNewCitaWithData(barberoId, horaStr);
          }
        }
        touchStartPos = null;
        return;
      }

      touchStartPos = null;
    }, { passive: false });

    // Handler de click para desktop
    els.grid.addEventListener('click', function(e) {
      // Manejar clics en citas
      var citaEl = e.target.closest('.am-cita');
      if (citaEl) {
        var citaId = citaEl.dataset.citaId;
        if (citaId) {
          e.stopPropagation();
          amOpenCita(citaId);
        }
        return;
      }

      // Manejar clics en slots disponibles
      var slotEl = e.target.closest('.am-hour-slot');
      if (slotEl) {
        var horaStr = slotEl.dataset.hora;
        var col = slotEl.closest('.am-barbero-col');
        if (col && horaStr) {
          var barberoId = col.dataset.barberoId;
          if (barberoId) {
            e.stopPropagation();
            showHoraFeedback(e.clientX, e.clientY, horaStr);
            amNewCitaWithData(barberoId, horaStr);
          }
        }
        return;
      }

      // Ignorar clics en bloqueos (almuerzo, descanso, etc.)
      if (e.target.closest('.am-bloqueo')) {
        return;
      }

      // Obtener la columna del barbero
      var col = e.target.closest('.am-barbero-col');
      if (!col) return;

      // Si el barbero descansa hoy, no permitir crear cita
      if (col.classList.contains('am-col-descansa')) {
        return;
      }

      var barberoId = col.dataset.barberoId;
      if (!barberoId) return;

      // Calcular la hora basándose en la posición Y del clic
      var rect = col.getBoundingClientRect();
      var scrollContainer = els.gridWrap || document.querySelector('.am-grid-wrap') || els.gridScroll;
      var scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
      var clickY = e.clientY - rect.top + scrollTop;

      var pixelsPerMinute = state.slotHeight / 60;
      var totalMinutes = clickY / pixelsPerMinute;
      var hours = Math.floor(totalMinutes / 60) + state.horarioInicio;
      var minutes = Math.floor(totalMinutes % 60);

      // Redondear a la hora en punto (el selector de nueva cita solo tiene horas en punto)
      minutes = 0;

      // Validar que la hora esté dentro del horario de trabajo
      if (hours < state.horarioInicio || hours >= state.horarioFin) {
        return;
      }

      // Verificar que no sea hora de almuerzo
      var horaDecimal = hours + (minutes / 60);
      if (horaDecimal >= state.horaAlmuerzoInicio && horaDecimal < state.horaAlmuerzoFin) {
        return;
      }

      // Verificar que no haya un bloqueo en esa hora
      var horaStr = (hours < 10 ? '0' : '') + hours + ':' + (minutes < 10 ? '0' : '') + minutes;
      var bloqueosBarbero = (state.bloqueos || []).filter(function(bl) { return bl.barbero_id === barberoId; });
      var enBloqueo = bloqueosBarbero.some(function(bl) {
        var inicioBloqueo = parseTime(bl.hora_inicio);
        var finBloqueo = parseTime(bl.hora_fin);
        var horaClick = { hours: hours, minutes: minutes };

        var inicioMinutos = inicioBloqueo.hours * 60 + inicioBloqueo.minutes;
        var finMinutos = finBloqueo.hours * 60 + finBloqueo.minutes;
        var clickMinutos = horaClick.hours * 60 + horaClick.minutes;

        return clickMinutos >= inicioMinutos && clickMinutos < finMinutos;
      });

      if (enBloqueo) {
        return;
      }

      // Mostrar feedback visual con la hora seleccionada
      showHoraFeedback(e.clientX, e.clientY, horaStr);

      // Abrir modal de nueva cita con datos preseleccionados
      amNewCitaWithData(barberoId, horaStr);
    });
  }

  // Mostrar feedback visual con la hora al tocar la cuadrícula
  function showHoraFeedback(x, y, horaStr) {
    // Remover feedback anterior si existe
    var existingFeedback = document.querySelector('.am-hora-feedback');
    if (existingFeedback) existingFeedback.remove();

    // Crear elemento de feedback
    var feedback = document.createElement('div');
    feedback.className = 'am-hora-feedback';
    feedback.textContent = horaStr;
    feedback.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;' +
      'transform:translate(-50%,-100%);' +
      'background:var(--gold);color:#0A0A0C;' +
      'padding:6px 12px;border-radius:8px;' +
      'font-size:14px;font-weight:700;' +
      'pointer-events:none;z-index:9999;' +
      'animation:amFeedbackPop 0.3s ease-out forwards;';
    document.body.appendChild(feedback);

    // Agregar animación CSS si no existe
    if (!document.getElementById('am-feedback-styles')) {
      var style = document.createElement('style');
      style.id = 'am-feedback-styles';
      style.textContent = '@keyframes amFeedbackPop{0%{opacity:0;transform:translate(-50%,-80%) scale(0.8);}50%{opacity:1;transform:translate(-50%,-100%) scale(1.05);}100%{opacity:1;transform:translate(-50%,-100%) scale(1);}}';
      document.head.appendChild(style);
    }

    // Remover después de 800ms
    setTimeout(function() {
      feedback.style.opacity = '0';
      feedback.style.transition = 'opacity 0.2s ease';
      setTimeout(function() { feedback.remove(); }, 200);
    }, 800);
  }

  // ===== UTILIDADES =====
  function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  }

  function formatDateISO(date) {
    // Usar fecha local, no UTC (toISOString devuelve UTC y puede dar día incorrecto)
    return date.getFullYear() + '-' +
           String(date.getMonth() + 1).padStart(2, '0') + '-' +
           String(date.getDate()).padStart(2, '0');
  }

  function parseTime(timeStr) {
    if (!timeStr) return { hours: 0, minutes: 0 };
    var parts = timeStr.split(':');
    return { hours: parseInt(parts[0], 10), minutes: parseInt(parts[1], 10) };
  }

  function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
  }

  function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function showLoading(show) {
    state.isLoading = show;
    if (els.loading) {
      els.loading.style.display = show ? 'flex' : 'none';
    }
  }

  function showToast(message, type) {
    if (typeof window.toast === 'function') {
      window.toast(message, type || 'info');
    } else {
      console.log('[' + (type || 'info') + '] ' + message);
    }
  }

  function openDatePicker() {
    // Abrir vista de mes personalizada
    amOpenMonth();
  }

  // ===== VISTA DE MES =====
  var monthViewDate = new Date();
  var monthCitasCounts = {};

  window.amOpenMonth = function() {
    monthViewDate = new Date(state.selectedDate);
    loadMonthCitas();
    renderMonthView();
    var modal = document.getElementById('amMonthModal');
    if (modal) modal.classList.add('show');
  };

  window.amCloseMonth = function() {
    var modal = document.getElementById('amMonthModal');
    if (modal) modal.classList.remove('show');
  };

  window.amPrevMonth = function() {
    monthViewDate.setMonth(monthViewDate.getMonth() - 1);
    loadMonthCitas();
    renderMonthView();
  };

  window.amNextMonth = function() {
    monthViewDate.setMonth(monthViewDate.getMonth() + 1);
    loadMonthCitas();
    renderMonthView();
  };

  window.amSelectDay = function(dateStr) {
    state.selectedDate = new Date(dateStr + 'T12:00:00');
    syncSelectedDate();
    renderWeekSelector();
    loadData();
    amCloseMonth();
  };

  async function loadMonthCitas() {
    if (typeof sb === 'undefined') return;

    var year = monthViewDate.getFullYear();
    var month = monthViewDate.getMonth();
    var firstDay = new Date(year, month, 1);
    var lastDay = new Date(year, month + 1, 0);

    var startStr = formatDateISO(firstDay);
    var endStr = formatDateISO(lastDay);

    try {
      var query = sb
        .from('citas')
        .select('fecha')
        .gte('fecha', startStr)
        .lte('fecha', endStr)
        .not('estado', 'eq', 'cancelada');

      if (state.sedeId) {
        query = query.eq('sucursal_id', state.sedeId);
      }

      var { data, error } = await query;

      if (error) return;

      // Contar citas por día
      monthCitasCounts = {};
      (data || []).forEach(function(c) {
        monthCitasCounts[c.fecha] = (monthCitasCounts[c.fecha] || 0) + 1;
      });

      renderMonthDays();
    } catch (e) {
      // Silenciar errores
    }
  }

  function renderMonthView() {
    var months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    var label = months[monthViewDate.getMonth()] + ' ' + monthViewDate.getFullYear();

    var titleEl = document.getElementById('amMonthTitle');
    var labelEl = document.getElementById('amMonthLabel');
    if (titleEl) titleEl.textContent = label;
    if (labelEl) labelEl.textContent = label;

    renderMonthDays();
  }

  function renderMonthDays() {
    var container = document.getElementById('amMonthDays');
    if (!container) return;

    var year = monthViewDate.getFullYear();
    var month = monthViewDate.getMonth();
    var today = new Date();
    var todayStr = formatDateISO(today);
    var selectedStr = formatDateISO(state.selectedDate);

    // Primer día del mes
    var firstDay = new Date(year, month, 1);
    var startDay = firstDay.getDay();
    // Ajustar para que lunes sea 0
    startDay = startDay === 0 ? 6 : startDay - 1;

    // Último día del mes
    var lastDay = new Date(year, month + 1, 0).getDate();

    // Días del mes anterior para llenar
    var prevMonth = new Date(year, month, 0);
    var prevMonthDays = prevMonth.getDate();

    var html = '';

    // Días del mes anterior
    for (var i = startDay - 1; i >= 0; i--) {
      var day = prevMonthDays - i;
      var d = new Date(year, month - 1, day);
      var dateStr = formatDateISO(d);
      html += '<div class="am-month-day other-month" onclick="amSelectDay(\'' + dateStr + '\')">' +
        '<span class="am-month-day-num">' + day + '</span>' +
      '</div>';
    }

    // Días del mes actual
    for (var d = 1; d <= lastDay; d++) {
      var date = new Date(year, month, d);
      var dateStr = formatDateISO(date);
      var isToday = dateStr === todayStr;
      var isSelected = dateStr === selectedStr;
      var count = monthCitasCounts[dateStr] || 0;

      var classes = ['am-month-day'];
      if (isToday) classes.push('today');
      if (isSelected) classes.push('selected');

      html += '<div class="' + classes.join(' ') + '" onclick="amSelectDay(\'' + dateStr + '\')">' +
        '<span class="am-month-day-num">' + d + '</span>' +
        (count > 0 ? '<span class="am-month-day-count has-citas">' + count + '</span>' : '') +
      '</div>';
    }

    // Días del siguiente mes para completar
    var totalCells = startDay + lastDay;
    var remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (var i = 1; i <= remaining; i++) {
      var d = new Date(year, month + 1, i);
      var dateStr = formatDateISO(d);
      html += '<div class="am-month-day other-month" onclick="amSelectDay(\'' + dateStr + '\')">' +
        '<span class="am-month-day-num">' + i + '</span>' +
      '</div>';
    }

    container.innerHTML = html;
  }

  // ===== INICIAR =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
