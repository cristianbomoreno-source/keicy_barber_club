-- 14-oct-2026
-- registrar_cobro_v2 buscaba la caja y el turno con fecha = CURRENT_DATE (UTC).
-- Desde las 7:00 p. m. de Bogotá, CURRENT_DATE ya es el día siguiente, así que los
-- cobros de la noche quedaban sin movimiento de caja y sus comisiones sin turno.
-- Ahora el cobro va a la caja abierta de la sede (la misma que muestra Caja) hasta
-- que se cierre el turno, sin mirar la fecha.
-- Además se recuperan los movimientos de caja de los tickets que quedaron sin caja.

-- 1. registrar_cobro_v2: caja y turno abiertos de la sede, sin filtro de fecha
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.registrar_cobro_v2(text, uuid, uuid, jsonb, jsonb, numeric, numeric, numeric, numeric, uuid, text, text, uuid, text, text, uuid, text, text)'::regprocedure);
  v_new text;
BEGIN
  v_new := replace(v_def,
    'WHERE sucursal_id = v_sucursal_id AND estado = ''abierta'' AND fecha = CURRENT_DATE',
    'WHERE sucursal_id = v_sucursal_id AND estado = ''abierta''');
  v_new := replace(v_new,
    'WHERE sucursal_id = v_sucursal_id AND estado = ''abierto'' AND fecha = CURRENT_DATE',
    'WHERE sucursal_id = v_sucursal_id AND estado = ''abierto''');
  IF v_new = v_def OR v_new LIKE '%CURRENT_DATE%' THEN
    RAISE EXCEPTION 'registrar_cobro_v2 no tiene el texto esperado; revisar a mano';
  END IF;
  EXECUTE v_new;
END $$;

-- 2. Recuperar movimientos de caja de los tickets sin caja
DO $$
DECLARE
  v_t RECORD;
  v_m RECORD;
  v_ses uuid;
  v_turno uuid;
  v_mov uuid;
BEGIN
  FOR v_t IN
    SELECT id, sucursal_id, cita_id, cliente_nombre, registrado_por_nombre, created_at
    FROM tickets WHERE sesion_caja_id IS NULL
  LOOP
    -- La caja que Caja mostraba en ese momento: la última abierta de la sede
    SELECT cs.id INTO v_ses FROM caja_sesiones cs
    WHERE cs.sucursal_id = v_t.sucursal_id
      AND cs.abierta_at <= v_t.created_at
      AND (cs.cerrada_at IS NULL OR cs.cerrada_at >= v_t.created_at)
    ORDER BY cs.abierta_at DESC LIMIT 1;

    CONTINUE WHEN v_ses IS NULL;

    UPDATE tickets SET sesion_caja_id = v_ses WHERE id = v_t.id;

    FOR v_m IN SELECT id, metodo, monto FROM cobro_metodos WHERE ticket_id = v_t.id AND caja_movimiento_id IS NULL LOOP
      INSERT INTO caja_movimientos (
        sesion_id, sucursal_id, tipo, categoria, descripcion, monto, metodo_pago,
        afecta_efectivo, referencia_id, ticket_id, cobro_metodo, created_by, created_at
      ) VALUES (
        v_ses, v_t.sucursal_id, 'ingreso', 'venta', 'Venta: ' || COALESCE(v_t.cliente_nombre, 'Cliente'),
        v_m.monto, v_m.metodo, v_m.metodo = 'efectivo', v_t.cita_id, v_t.id, v_m.metodo,
        v_t.registrado_por_nombre, v_t.created_at
      ) RETURNING id INTO v_mov;
      UPDATE cobro_metodos SET caja_movimiento_id = v_mov WHERE id = v_m.id;
    END LOOP;

    -- Comisiones del ticket sin turno: el turno abierto de la sede en ese momento
    SELECT t.id INTO v_turno FROM turnos_admin_sede t
    WHERE t.sucursal_id = v_t.sucursal_id
      AND t.abierto_at <= v_t.created_at
      AND (t.cerrado_at IS NULL OR t.cerrado_at >= v_t.created_at)
    ORDER BY t.abierto_at DESC LIMIT 1;

    IF v_turno IS NOT NULL THEN
      UPDATE comisiones SET turno_id = v_turno
      WHERE turno_id IS NULL AND pago_id IN (SELECT id FROM pagos WHERE ticket_id = v_t.id);
    END IF;
  END LOOP;
END $$;

-- 3. Totales de las cajas cerradas con los movimientos recuperados
WITH t AS (
  SELECT cs.id,
    COALESCE(SUM(m.monto) FILTER (WHERE m.tipo = 'ingreso'), 0) AS ing,
    COALESCE(SUM(m.monto) FILTER (WHERE m.tipo IN ('gasto', 'retiro', 'entrega', 'egreso')), 0) AS egr
  FROM caja_sesiones cs
  LEFT JOIN caja_movimientos m ON m.sesion_id = cs.id
  WHERE cs.estado = 'cerrada' AND cs.fecha >= '2026-10-01'
  GROUP BY cs.id
)
UPDATE caja_sesiones cs SET
  total_ingresos = t.ing,
  total_egresos = t.egr,
  flujo_neto = t.ing - t.egr
FROM t
WHERE cs.id = t.id
  AND (cs.total_ingresos IS DISTINCT FROM t.ing OR cs.total_egresos IS DISTINCT FROM t.egr);
