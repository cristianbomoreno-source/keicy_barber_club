-- 14-oct-2026
-- 1. Anular ticket: borra el ticket y todo lo que generó el cobro (ítems, métodos,
--    movimientos de caja, pagos, comisiones, ventas de productos y reseña). La cita
--    vuelve a "pendiente_pago" para poder cobrarla otra vez.
--    La app llamaba anular_pago_y_cita y anular_cobro, pero no existían en producción.
-- 2. Cierres de octubre: los turnos quedaban "abiertos" porque el cierre de caja
--    escribía en columnas que no existen. Se cierran con la hora de cierre de su caja.
--    También se guardan los totales de las cajas cerradas que quedaron en NULL.
-- 3. Cierre automático: además de las cajas, cierra los turnos de días anteriores.
-- 4. Pago del admin de sede: antes se anotaba como gasto ("Pagos Adm"). Ahora va a
--    pagos_colaboradores, como los barberos. Se trasladan los pagos de octubre.

-- ============================================================================
-- 1. ANULAR TICKET
-- ============================================================================

-- Devuelve una cita a "pendiente_pago" si ya no le queda ningún pago vigente.
CREATE OR REPLACE FUNCTION public._dn_revertir_cita_si_sin_pagos(p_cita_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cita RECORD;
  v_visitas integer;
BEGIN
  IF p_cita_id IS NULL THEN RETURN false; END IF;

  SELECT id, estado, cliente_id INTO v_cita FROM citas WHERE id = p_cita_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF EXISTS (SELECT 1 FROM pagos WHERE cita_id = p_cita_id AND estado = 'pagado') THEN
    RETURN false;
  END IF;

  IF v_cita.estado IN ('finalizada', 'pagada') THEN
    -- El cobro sumó una visita al cliente (trigger_cita_finalizada_lealtad).
    -- Se resta para que al volver a cobrar no quede contada dos veces.
    IF v_cita.cliente_id IS NOT NULL THEN
      SELECT GREATEST(COALESCE(total_visitas_weibook, 0) - 1, 0) INTO v_visitas
      FROM usuarios WHERE id = v_cita.cliente_id;
      IF v_visitas IS NOT NULL THEN
        UPDATE usuarios
        SET total_visitas_weibook = v_visitas,
            lealtad_info = calcular_lealtad_info(v_visitas)
        WHERE id = v_cita.cliente_id;
      END IF;
    END IF;
  END IF;

  UPDATE citas SET
    estado = 'pendiente_pago',
    pagada_at = NULL,
    metodo_pago = NULL,
    propina = 0,
    comision_calculada = NULL,
    updated_at = NOW(),
    updated_by = auth.uid()
  WHERE id = p_cita_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.anular_ticket(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ticket RECORD;
  v_pagos uuid[];
  v_citas uuid[];
  v_cita uuid;
  v_revertidas integer := 0;
BEGIN
  PERFORM public._dn_exigir_admin();

  SELECT id, numero_ticket, cita_id INTO v_ticket FROM tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'El ticket no existe o ya fue anulado');
  END IF;

  SELECT COALESCE(array_agg(id), '{}') INTO v_pagos FROM pagos WHERE ticket_id = p_ticket_id;

  SELECT COALESCE(array_agg(DISTINCT c), '{}') INTO v_citas FROM (
    SELECT v_ticket.cita_id AS c
    UNION SELECT cita_id FROM pagos WHERE ticket_id = p_ticket_id
    UNION SELECT cita_id FROM ventas_productos WHERE ticket_id = p_ticket_id
  ) x WHERE c IS NOT NULL;

  DELETE FROM comisiones WHERE pago_id = ANY(v_pagos);
  DELETE FROM cobro_metodos WHERE ticket_id = p_ticket_id;
  DELETE FROM caja_movimientos WHERE ticket_id = p_ticket_id;
  DELETE FROM resenas WHERE ticket_id = p_ticket_id;
  DELETE FROM ventas_productos WHERE ticket_id = p_ticket_id;
  DELETE FROM ticket_items WHERE ticket_id = p_ticket_id;
  DELETE FROM pagos WHERE ticket_id = p_ticket_id;
  DELETE FROM tickets WHERE id = p_ticket_id;

  FOREACH v_cita IN ARRAY v_citas LOOP
    IF public._dn_revertir_cita_si_sin_pagos(v_cita) THEN
      v_revertidas := v_revertidas + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'numeroTicket', v_ticket.numero_ticket,
    'citasPendientes', v_revertidas
  );
END;
$$;

-- Compatibilidad: caja e historial anulan por pago + cita.
-- Es idempotente: si el pago ya no existe, solo asegura que la cita quede por cobrar.
CREATE OR REPLACE FUNCTION public.anular_pago_y_cita(p_pago_id uuid, p_cita_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pago RECORD;
  v_res jsonb := jsonb_build_object('success', true);
BEGIN
  PERFORM public._dn_exigir_admin();

  SELECT id, ticket_id, cita_id INTO v_pago FROM pagos WHERE id = p_pago_id;

  IF FOUND AND v_pago.ticket_id IS NOT NULL THEN
    v_res := public.anular_ticket(v_pago.ticket_id);
  ELSIF FOUND THEN
    -- Pago antiguo sin ticket
    DELETE FROM comisiones WHERE pago_id = v_pago.id;
    DELETE FROM pagos WHERE id = v_pago.id;
    PERFORM public._dn_revertir_cita_si_sin_pagos(v_pago.cita_id);
  END IF;

  PERFORM public._dn_revertir_cita_si_sin_pagos(p_cita_id);
  RETURN v_res;
END;
$$;

-- Compatibilidad: "Editar venta" en Vender anula el cobro anterior con anular_cobro.
CREATE OR REPLACE FUNCTION public.anular_cobro(p_ticket_id uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.anular_ticket(p_ticket_id);
$$;

REVOKE ALL ON FUNCTION public._dn_revertir_cita_si_sin_pagos(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.anular_ticket(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.anular_pago_y_cita(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.anular_cobro(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anular_ticket(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anular_pago_y_cita(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anular_cobro(uuid, text) TO authenticated;

-- ============================================================================
-- 2. CIERRES DE OCTUBRE
-- ============================================================================

-- Totales de las cajas cerradas que quedaron sin calcular
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
WHERE cs.id = t.id AND cs.total_ingresos IS NULL;

-- Turnos de octubre que quedaron abiertos: se cierran con la hora de cierre de su caja
UPDATE turnos_admin_sede t SET
  estado = 'cerrado',
  cerrado_at = COALESCE(
    (SELECT MAX(cs.cerrada_at) FROM caja_sesiones cs WHERE cs.turno_id = t.id),
    (SELECT MAX(cs.cerrada_at) FROM caja_sesiones cs
      WHERE cs.sucursal_id = t.sucursal_id AND cs.fecha = t.fecha
        AND EXISTS (SELECT 1 FROM caja_movimientos m WHERE m.sesion_id = cs.id AND m.tipo <> 'apertura')),
    ((t.fecha + time '23:59') AT TIME ZONE 'America/Bogota')
  )
WHERE t.estado = 'abierto'
  AND t.fecha >= '2026-10-01'
  AND t.fecha < (now() AT TIME ZONE 'America/Bogota')::date;

-- ============================================================================
-- 3. CIERRE AUTOMÁTICO (23:59 Bogotá): cajas y turnos
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cerrar_cajas_automatico()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  sesion RECORD;
  total_ingresos_calc NUMERIC;
  total_egresos_calc NUMERIC;
BEGIN
  FOR sesion IN SELECT * FROM caja_sesiones WHERE estado = 'abierta' LOOP
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN tipo IN ('gasto', 'retiro', 'entrega', 'egreso') THEN monto ELSE 0 END), 0)
    INTO total_ingresos_calc, total_egresos_calc
    FROM caja_movimientos
    WHERE sesion_id = sesion.id;

    UPDATE caja_sesiones SET
      estado = 'cerrada',
      cerrada_at = NOW(),
      cerrada_por = 'Sistema automático',
      total_ingresos = total_ingresos_calc,
      total_egresos = total_egresos_calc,
      flujo_neto = total_ingresos_calc - total_egresos_calc,
      efectivo_esperado = sesion.base_apertura + total_ingresos_calc - total_egresos_calc,
      observaciones_cierre = 'Cierre automático a las 23:59'
    WHERE id = sesion.id;
  END LOOP;

  UPDATE turnos_admin_sede SET estado = 'cerrado', cerrado_at = NOW()
  WHERE estado = 'abierto'
    AND fecha <= (now() AT TIME ZONE 'America/Bogota')::date;
END;
$$;

-- ============================================================================
-- 4. PAGO DEL ADMIN DE SEDE EN "PAGO A COLABORADORES"
-- ============================================================================
ALTER TABLE public.pagos_colaboradores
  ADD COLUMN IF NOT EXISTS sesion_caja_id uuid REFERENCES public.caja_sesiones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS caja_movimiento_id uuid REFERENCES public.caja_movimientos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS beneficiario_nombre text;

-- Quien cubre la sede puede no tener usuario (p. ej. "Vale"): queda su nombre.
ALTER TABLE public.pagos_colaboradores ALTER COLUMN usuario_id DROP NOT NULL;

-- La caja también paga por QR y tarjeta
ALTER TABLE public.pagos_colaboradores DROP CONSTRAINT IF EXISTS pagos_colaboradores_metodo_pago_check;
ALTER TABLE public.pagos_colaboradores ADD CONSTRAINT pagos_colaboradores_metodo_pago_check
  CHECK (metodo_pago = ANY (ARRAY['efectivo', 'transferencia', 'nequi', 'daviplata', 'qr', 'tarjeta', 'otro']));

CREATE INDEX IF NOT EXISTS idx_pagos_colaboradores_sucursal_fecha
  ON public.pagos_colaboradores (sucursal_id, created_at);

-- (Keicy) El traslado de los gastos "Pagos Adm" de octubre a pagos_colaboradores
-- es propio de Diego Neira (personas y UUID de su equipo) y no se aplica aquí.
