-- 14-oct-2026
-- En Caja se puede corregir el método o el monto de un pago, pero solo se
-- actualizaba la tabla pagos: cobro_metodos y los movimientos de caja del ticket
-- seguían con el método original. Esta función los reconstruye desde los pagos
-- vigentes del ticket. Caja la llama después de editar, y aquí se corre para los
-- tickets que ya estaban desfasados.

CREATE OR REPLACE FUNCTION public.dn_sincronizar_metodos_ticket(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_t RECORD;
  v_m RECORD;
  v_mov uuid;
  v_n integer := 0;
BEGIN
  PERFORM public._dn_exigir_admin();

  SELECT id, sucursal_id, sesion_caja_id, cita_id, cliente_nombre, registrado_por_nombre, created_at
  INTO v_t FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ticket no encontrado');
  END IF;

  DELETE FROM cobro_metodos WHERE ticket_id = p_ticket_id;
  DELETE FROM caja_movimientos WHERE ticket_id = p_ticket_id AND categoria = 'venta';

  FOR v_m IN
    SELECT metodo, SUM(monto) AS monto FROM pagos
    WHERE ticket_id = p_ticket_id AND estado = 'pagado'
    GROUP BY metodo
  LOOP
    v_mov := NULL;
    IF v_t.sesion_caja_id IS NOT NULL THEN
      INSERT INTO caja_movimientos (
        sesion_id, sucursal_id, tipo, categoria, descripcion, monto, metodo_pago,
        afecta_efectivo, referencia_id, ticket_id, cobro_metodo, created_by, created_at
      ) VALUES (
        v_t.sesion_caja_id, v_t.sucursal_id, 'ingreso', 'venta', 'Venta: ' || COALESCE(v_t.cliente_nombre, 'Cliente'),
        v_m.monto, v_m.metodo, v_m.metodo = 'efectivo', v_t.cita_id, p_ticket_id, v_m.metodo,
        v_t.registrado_por_nombre, v_t.created_at
      ) RETURNING id INTO v_mov;
    END IF;
    INSERT INTO cobro_metodos (ticket_id, metodo, monto, caja_movimiento_id)
    VALUES (p_ticket_id, v_m.metodo, v_m.monto, v_mov);
    v_n := v_n + 1;
  END LOOP;

  -- Totales de la caja si ya estaba cerrada
  IF v_t.sesion_caja_id IS NOT NULL THEN
    UPDATE caja_sesiones cs SET
      total_ingresos = x.ing,
      total_egresos = x.egr,
      flujo_neto = x.ing - x.egr
    FROM (
      SELECT
        COALESCE(SUM(monto) FILTER (WHERE tipo = 'ingreso'), 0) AS ing,
        COALESCE(SUM(monto) FILTER (WHERE tipo IN ('gasto', 'retiro', 'entrega', 'egreso')), 0) AS egr
      FROM caja_movimientos WHERE sesion_id = v_t.sesion_caja_id
    ) x
    WHERE cs.id = v_t.sesion_caja_id AND cs.estado = 'cerrada';
  END IF;

  RETURN jsonb_build_object('success', true, 'metodos', v_n);
END;
$$;

REVOKE ALL ON FUNCTION public.dn_sincronizar_metodos_ticket(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dn_sincronizar_metodos_ticket(uuid) TO authenticated;

-- Tickets cuyos métodos ya no coinciden con sus pagos vigentes
DO $$
DECLARE v_id uuid;
BEGIN
  FOR v_id IN
    SELECT t.id FROM tickets t
    WHERE COALESCE((SELECT string_agg(metodo || ':' || monto::numeric(12,2), ',' ORDER BY metodo, monto)
                    FROM (SELECT metodo, SUM(monto) monto FROM cobro_metodos WHERE ticket_id = t.id GROUP BY metodo) a), '')
       <> COALESCE((SELECT string_agg(metodo || ':' || monto::numeric(12,2), ',' ORDER BY metodo, monto)
                    FROM (SELECT metodo, SUM(monto) monto FROM pagos WHERE ticket_id = t.id AND estado = 'pagado' GROUP BY metodo) b), '')
  LOOP
    PERFORM public.dn_sincronizar_metodos_ticket(v_id);
  END LOOP;
END $$;
