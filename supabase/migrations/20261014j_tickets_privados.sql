-- 14-oct-2026
-- La tabla tickets se podía leer completa sin sesión (política publico_lee para
-- anon): nombres, teléfonos y montos de todos los clientes. Lo único público que
-- la usaba es la página de reseñas (/resena?t=<ticket_id>), que solo necesita
-- datos de ese ticket. Se cierra la tabla y la página usa esta función, que
-- devuelve lo mínimo de un ticket por su id.

CREATE OR REPLACE FUNCTION public.dn_ticket_resena(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'cliente_id', t.cliente_id,
    'cita_id', t.cita_id,
    'sucursal_id', t.sucursal_id,
    'created_at', t.created_at,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'nombre', i.nombre,
        'barbero_id', COALESCE(i.barbero_id, t.barbero_id),
        'barbero_nombre', COALESCE(i.barbero_nombre, t.barbero_nombre)
      ) ORDER BY i.nombre)
      FROM ticket_items i WHERE i.ticket_id = t.id AND i.tipo = 'servicio'
    ), '[]'::jsonb)
  )
  FROM tickets t
  WHERE t.id = p_ticket_id AND NOT COALESCE(t.anulado, false);
$$;

REVOKE ALL ON FUNCTION public.dn_ticket_resena(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dn_ticket_resena(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS publico_lee ON public.tickets;
