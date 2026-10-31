-- 27-oct-2026: comisiones de servicio duplicadas por cita.
-- Una cortesía de embajador en Colina (Camilo Merchan, $75.000) quedó con 6 comisiones de $30.000:
-- el cobro se envió varias veces (doble toque / reintentos) y cada envío insertaba otra fila.
-- Había 19 citas con duplicados desde el 1-oct, ninguna pagada.
--
-- 1) Respaldo y limpieza: queda una sola comisión de servicio por cita (la más reciente, que es la que
--    coincide con citas.comision_calculada cuando el precio se corrigió).
-- 2) Guardia en la base: si llega otra comisión de servicio para una cita que ya tiene una pendiente,
--    se actualiza la existente en vez de crear otra (sirve para cualquier pantalla que cobre).

CREATE TABLE IF NOT EXISTS public.comisiones_duplicadas_respaldo (LIKE public.comisiones);
ALTER TABLE public.comisiones_duplicadas_respaldo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comisiones_duplicadas_respaldo FROM anon, authenticated;

WITH d AS (
  SELECT id, row_number() OVER (PARTITION BY cita_id ORDER BY created_at DESC, id DESC) rn
  FROM public.comisiones
  WHERE tipo = 'servicio' AND cita_id IS NOT NULL AND estado = 'pendiente'
)
INSERT INTO public.comisiones_duplicadas_respaldo
SELECT c.* FROM public.comisiones c JOIN d ON d.id = c.id WHERE d.rn > 1;

DELETE FROM public.comisiones c
USING public.comisiones_duplicadas_respaldo r
WHERE c.id = r.id;

CREATE OR REPLACE FUNCTION public.comision_servicio_unica()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NEW.tipo <> 'servicio' OR NEW.cita_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Evita la carrera de dos cobros simultáneos sobre la misma cita
  PERFORM pg_advisory_xact_lock(hashtext('comision_servicio:' || NEW.cita_id::text));
  SELECT id INTO v_id FROM comisiones
  WHERE cita_id = NEW.cita_id AND tipo = 'servicio'
  ORDER BY created_at LIMIT 1;
  IF v_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Ya existe: si sigue pendiente se actualiza con los valores nuevos; nunca se crea otra.
  UPDATE comisiones SET
    barbero_id = NEW.barbero_id, base_calculo = NEW.base_calculo, porcentaje_aplicado = NEW.porcentaje_aplicado,
    valor_comision = NEW.valor_comision, concepto = NEW.concepto
  WHERE id = v_id AND estado = 'pendiente';
  IF FOUND THEN
    UPDATE citas SET comision_calculada = NEW.valor_comision WHERE id = NEW.cita_id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_comision_servicio_unica ON public.comisiones;
CREATE TRIGGER trg_comision_servicio_unica BEFORE INSERT ON public.comisiones
  FOR EACH ROW EXECUTE FUNCTION public.comision_servicio_unica();
