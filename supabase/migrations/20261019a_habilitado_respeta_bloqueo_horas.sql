-- Un día de descanso habilitado ('habilitado') ignoraba también los bloqueos de horas
-- de ese mismo día, así que se podía reservar en una franja bloqueada.
-- La habilitación sigue anulando el descanso, el horario personalizado y el bloqueo
-- de día completo, pero los bloqueos de horas ahora siempre aplican.

CREATE OR REPLACE FUNCTION public.obtener_horarios_disponibles(p_barbero_id uuid, p_fecha date, p_duracion_min integer DEFAULT 30)
 RETURNS TABLE(hora text, disponible boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_sucursal_id UUID;
  v_horario JSONB;
  v_dia_semana TEXT;
  v_dia_descanso INTEGER;
  v_hora_inicio TIME;
  v_hora_fin TIME;
  v_almuerzo_inicio TIME;
  v_almuerzo_fin TIME;
  v_intervalo INTERVAL;
  v_slot TIME;
  v_slot_fin TIME;
  v_ocupado BOOLEAN;
  v_bloqueado BOOLEAN;
  v_dia_horario JSONB;
  v_hora_actual_int INTEGER;
  v_tiene_habilitacion BOOLEAN;
BEGIN
  SELECT sucursal_id, dia_descanso
  INTO v_sucursal_id, v_dia_descanso
  FROM barberos
  WHERE id = p_barbero_id;

  IF v_sucursal_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM bloqueos_barbero
    WHERE barbero_id = p_barbero_id AND fecha = p_fecha AND tipo = 'habilitado'
  ) INTO v_tiene_habilitacion;

  IF v_dia_descanso IS NOT NULL
     AND EXTRACT(DOW FROM p_fecha) = v_dia_descanso
     AND NOT v_tiene_habilitacion THEN
    RETURN;
  END IF;

  SELECT horario INTO v_horario
  FROM sucursales
  WHERE id = v_sucursal_id;

  IF v_horario IS NULL THEN
    RETURN;
  END IF;

  v_dia_semana := CASE EXTRACT(DOW FROM p_fecha)
    WHEN 0 THEN 'domingo'
    WHEN 1 THEN 'lunes'
    WHEN 2 THEN 'martes'
    WHEN 3 THEN 'miercoles'
    WHEN 4 THEN 'jueves'
    WHEN 5 THEN 'viernes'
    WHEN 6 THEN 'sabado'
  END;

  v_dia_horario := v_horario->v_dia_semana;

  IF v_dia_horario IS NULL OR (v_dia_horario->>'cerrado')::BOOLEAN = true THEN
    RETURN;
  END IF;

  IF NOT v_tiene_habilitacion THEN
    SELECT EXISTS(
      SELECT 1 FROM bloqueos_barbero
      WHERE barbero_id = p_barbero_id AND fecha = p_fecha AND tipo = 'dia'
    ) INTO v_bloqueado;

    IF v_bloqueado THEN
      RETURN;
    END IF;
  END IF;

  v_hora_inicio := (v_dia_horario->>'abre')::TIME;
  v_hora_fin := (v_dia_horario->>'cierra')::TIME;
  v_almuerzo_inicio := (v_horario->>'almuerzo_inicio')::TIME;
  v_almuerzo_fin := (v_horario->>'almuerzo_fin')::TIME;

  v_intervalo := (p_duracion_min || ' minutes')::INTERVAL;
  v_slot := v_hora_inicio;

  IF p_fecha = CURRENT_DATE THEN
    v_hora_actual_int := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Bogota')::INTEGER;
    v_slot := GREATEST(v_slot, make_time(v_hora_actual_int + 1, 0, 0));
  END IF;

  WHILE v_slot + v_intervalo <= v_hora_fin LOOP
    v_slot_fin := v_slot + v_intervalo;

    IF v_almuerzo_inicio IS NOT NULL AND v_almuerzo_fin IS NOT NULL THEN
      IF (v_slot, v_slot_fin) OVERLAPS (v_almuerzo_inicio, v_almuerzo_fin) THEN
        v_slot := v_slot + INTERVAL '1 hour';
        CONTINUE;
      END IF;
    END IF;

    -- Bloqueo parcial: aplica también en un día habilitado
    SELECT EXISTS(
      SELECT 1 FROM bloqueos_barbero
      WHERE barbero_id = p_barbero_id
        AND fecha = p_fecha
        AND tipo NOT IN ('dia', 'habilitado')
        AND hora_inicio IS NOT NULL AND hora_fin IS NOT NULL
        AND (hora_inicio, hora_fin) OVERLAPS (v_slot, v_slot_fin)
    ) INTO v_bloqueado;

    IF NOT v_bloqueado THEN
      SELECT EXISTS(
        SELECT 1 FROM citas c
        WHERE c.barbero_id = p_barbero_id
          AND c.fecha = p_fecha
          AND c.estado NOT IN ('cancelada', 'no_show')
          AND (c.hora_inicio, COALESCE(c.hora_fin, c.hora_inicio + INTERVAL '30 minutes'))
              OVERLAPS (v_slot, v_slot_fin)
      ) INTO v_ocupado;

      IF NOT v_ocupado THEN
        hora := to_char(v_slot, 'HH24:MI');
        disponible := TRUE;
        RETURN NEXT;
      END IF;
    END IF;

    v_slot := v_slot + INTERVAL '1 hour';
  END LOOP;

  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validar_cita_web_reservas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_barbero RECORD;
  v_dow INTEGER;
  v_dia TEXT;
  v_dia_cfg JSONB;
  v_habilitado BOOLEAN;
  v_fin TIME;
BEGIN
  IF NEW.origen IS DISTINCT FROM 'web_reservas' THEN
    RETURN NEW;
  END IF;

  IF NEW.barbero_id IS NULL THEN
    RAISE EXCEPTION 'RESERVA_NO_DISPONIBLE: la cita no tiene barbero';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.barbero_id::text || NEW.fecha::text));

  SELECT sucursal_id, activo, dia_descanso, horario_personalizado
  INTO v_barbero
  FROM barberos
  WHERE id = NEW.barbero_id;

  IF NOT FOUND OR NOT v_barbero.activo THEN
    RAISE EXCEPTION 'RESERVA_NO_DISPONIBLE: barbero inexistente o inactivo';
  END IF;

  IF NEW.sucursal_id IS DISTINCT FROM v_barbero.sucursal_id THEN
    RAISE EXCEPTION 'RESERVA_NO_DISPONIBLE: el barbero no pertenece a la sede de la cita';
  END IF;

  v_fin := COALESCE(NEW.hora_fin, NEW.hora_inicio + INTERVAL '1 hour');
  v_dow := EXTRACT(DOW FROM NEW.fecha)::INTEGER;

  SELECT EXISTS (
    SELECT 1 FROM bloqueos_barbero
    WHERE barbero_id = NEW.barbero_id AND fecha = NEW.fecha AND tipo = 'habilitado'
  ) INTO v_habilitado;

  IF NOT v_habilitado THEN
    IF v_barbero.dia_descanso IS NOT NULL AND v_barbero.dia_descanso = v_dow THEN
      RAISE EXCEPTION 'RESERVA_NO_DISPONIBLE: día de descanso del barbero';
    END IF;

    v_dia := (ARRAY['domingo','lunes','martes','miercoles','jueves','viernes','sabado'])[v_dow + 1];
    v_dia_cfg := v_barbero.horario_personalizado -> v_dia;
    IF v_dia_cfg IS NOT NULL THEN
      IF (v_dia_cfg ->> 'activo')::BOOLEAN IS FALSE THEN
        RAISE EXCEPTION 'RESERVA_NO_DISPONIBLE: día inactivo en el horario del barbero';
      END IF;
      IF jsonb_array_length(COALESCE(v_dia_cfg -> 'rangos', '[]'::jsonb)) > 0
         AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(v_dia_cfg -> 'rangos') r
           WHERE NEW.hora_inicio >= (r ->> 'desde')::TIME
             AND NEW.hora_inicio <  (r ->> 'hasta')::TIME
         ) THEN
        RAISE EXCEPTION 'RESERVA_NO_DISPONIBLE: fuera del horario del barbero';
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1 FROM bloqueos_barbero
      WHERE barbero_id = NEW.barbero_id AND fecha = NEW.fecha AND tipo = 'dia'
    ) THEN
      RAISE EXCEPTION 'RESERVA_NO_DISPONIBLE: barbero bloqueado ese día';
    END IF;
  END IF;

  -- Los bloqueos de horas aplican aunque el día esté habilitado
  IF EXISTS (
    SELECT 1 FROM bloqueos_barbero
    WHERE barbero_id = NEW.barbero_id AND fecha = NEW.fecha
      AND tipo = 'horas' AND hora_inicio IS NOT NULL AND hora_fin IS NOT NULL
      AND NEW.hora_inicio < hora_fin AND v_fin > hora_inicio
  ) THEN
    RAISE EXCEPTION 'RESERVA_NO_DISPONIBLE: barbero bloqueado en ese horario';
  END IF;

  IF EXISTS (
    SELECT 1 FROM citas c
    WHERE c.barbero_id = NEW.barbero_id AND c.fecha = NEW.fecha
      AND c.estado NOT IN ('cancelada', 'sin_respuesta')
      AND NEW.hora_inicio < COALESCE(c.hora_fin, c.hora_inicio + INTERVAL '1 hour')
      AND v_fin > c.hora_inicio
  ) THEN
    RAISE EXCEPTION 'RESERVA_NO_DISPONIBLE: el barbero ya tiene una cita en ese horario';
  END IF;

  RETURN NEW;
END;
$function$;
