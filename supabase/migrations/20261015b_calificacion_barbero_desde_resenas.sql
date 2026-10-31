-- barberos.calificacion nunca se actualizaba (todos en 5.00) y la usan el perfil del barbero,
-- admin (barberos, dashboard), club del cliente y reservas como respaldo, mientras que
-- "Mis reseñas" calcula el promedio real desde resenas. Se mantiene sincronizada con un trigger.
-- Sin reseñas se deja 5.00 (valor por defecto de siempre).

CREATE OR REPLACE FUNCTION public.dn_recalcular_calificacion_barbero(p_barbero_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  UPDATE barberos b
  SET calificacion = coalesce(
    (SELECT round(avg(r.calificacion)::numeric, 2) FROM resenas r WHERE r.barbero_id = p_barbero_id),
    5.00)
  WHERE b.id = p_barbero_id;
$$;

REVOKE ALL ON FUNCTION public.dn_recalcular_calificacion_barbero(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_resenas_calificacion_barbero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.barbero_id IS NOT NULL THEN
    PERFORM dn_recalcular_calificacion_barbero(NEW.barbero_id);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.barbero_id IS NOT NULL
     AND (TG_OP = 'DELETE' OR OLD.barbero_id IS DISTINCT FROM NEW.barbero_id) THEN
    PERFORM dn_recalcular_calificacion_barbero(OLD.barbero_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_resenas_calificacion_barbero ON public.resenas;
CREATE TRIGGER tr_resenas_calificacion_barbero
  AFTER INSERT OR UPDATE OF calificacion, barbero_id OR DELETE ON public.resenas
  FOR EACH ROW EXECUTE FUNCTION public.trg_resenas_calificacion_barbero();

-- Rellenar con el promedio real
SELECT public.dn_recalcular_calificacion_barbero(id) FROM public.barberos;
