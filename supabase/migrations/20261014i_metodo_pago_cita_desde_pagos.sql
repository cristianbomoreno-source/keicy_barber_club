-- 14-oct-2026
-- Al corregir el método de un pago en Caja, dn_sincronizar_metodos_ticket
-- reconstruía cobro_metodos y caja_movimientos, pero la cita seguía con el método
-- original en citas.metodo_pago, que es lo que lee Reportes (ej. una venta pasada
-- de nequi a tarjeta seguía saliendo como Nequi). Ahora la cita toma el método con
-- mayor monto pagado del ticket, igual que registrar_cobro_v2.

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

  -- La cita queda con el método principal (mayor monto) de sus pagos vigentes
  IF v_t.cita_id IS NOT NULL THEN
    UPDATE citas c SET metodo_pago = x.metodo, updated_at = NOW()
    FROM (
      SELECT metodo FROM pagos
      WHERE ticket_id = p_ticket_id AND estado = 'pagado'
      GROUP BY metodo ORDER BY SUM(monto) DESC, metodo LIMIT 1
    ) x
    WHERE c.id = v_t.cita_id
      AND c.metodo_pago IS DISTINCT FROM x.metodo
      AND COALESCE(c.metodo_pago, '') NOT LIKE 'cortesia%';
  END IF;

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

-- Citas que ya quedaron con un método distinto al que se cobró
UPDATE citas c SET metodo_pago = b.metodo, updated_at = NOW()
FROM (
  SELECT DISTINCT ON (t.cita_id) t.cita_id, p.metodo
  FROM tickets t
  JOIN (SELECT ticket_id, metodo, SUM(monto) monto FROM pagos WHERE estado = 'pagado' GROUP BY 1, 2) p
    ON p.ticket_id = t.id
  WHERE t.cita_id IS NOT NULL AND NOT COALESCE(t.anulado, false)
  ORDER BY t.cita_id, p.monto DESC, p.metodo
) b
WHERE b.cita_id = c.id
  AND c.estado = 'finalizada'
  AND c.metodo_pago IS DISTINCT FROM b.metodo
  AND COALESCE(c.metodo_pago, '') NOT LIKE 'cortesia%';
