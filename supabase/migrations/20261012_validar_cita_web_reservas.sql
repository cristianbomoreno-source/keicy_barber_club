-- Migración: Validar en la base de datos las citas creadas desde la web de reservas
-- Fecha: 2026-10-12
-- Motivo: un cliente eligió barbero en una sede, volvió atrás y cambió a otra sede;
-- la página conservó el barbero anterior y se agendó una cita en la sede equivocada
-- y en el día de descanso del barbero (cita 77c2d73a-3372-4028-baaa-7624b5a1d1f8).
-- Esta validación hace que, aunque el frontend falle, la base de datos rechace la cita.
--
-- Aplica solo a origen = 'web_reservas' (canal público). El personal (calendario,
-- ventas) puede seguir agendando excepciones a propósito.

CREATE OR REPLACE FUNCTION validar_cita_web_reservas()
RETURNS TRIGGER
LANGUAGE plpgsql
-- SECURITY DEFINER: debe ver todas las citas/bloqueos aunque RLS se restrinja para anon
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Serializa reservas del mismo barbero y día para evitar dobles reservas simultáneas
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
      WHERE barbero_id = NEW.barbero_id AND fecha = NEW.fecha
        AND (
          tipo = 'dia'
          OR (tipo = 'horas' AND hora_inicio IS NOT NULL AND hora_fin IS NOT NULL
              AND NEW.hora_inicio < hora_fin AND v_fin > hora_inicio)
        )
    ) THEN
      RAISE EXCEPTION 'RESERVA_NO_DISPONIBLE: barbero bloqueado en ese horario';
    END IF;
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
$$;

DROP TRIGGER IF EXISTS trg_validar_cita_web_reservas ON citas;
CREATE TRIGGER trg_validar_cita_web_reservas
  BEFORE INSERT ON citas
  FOR EACH ROW
  EXECUTE FUNCTION validar_cita_web_reservas();
