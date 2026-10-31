-- Informe de ventas y pagos por colaborador + certificación de ingresos (Colaboradores → Informe).
--
-- - colaboradores_datos_laborales: cédula, fecha de ingreso y tipo de vínculo de cada colaborador.
--   Tabla aparte porque `barberos` la lee el público (página de reservas); esto solo lo ven los admins.
-- - configuracion_negocio: razón social, NIT y firmante para la certificación (datos públicos de la empresa).
-- - admin_informe_colaborador(barbero, desde, hasta): ventas, comisiones, propinas, descuentos y pagos
--   reales (pagos_comisiones) del período, por servicio, por día y por mes. Solo el admin principal.

CREATE TABLE IF NOT EXISTS public.colaboradores_datos_laborales (
  barbero_id uuid PRIMARY KEY REFERENCES public.barberos(id) ON DELETE CASCADE,
  tipo_documento text NOT NULL DEFAULT 'CC',
  documento text,
  fecha_ingreso date,
  cargo text,
  tipo_vinculo text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.colaboradores_datos_laborales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.colaboradores_datos_laborales FROM anon;
DROP POLICY IF EXISTS admin_principal ON public.colaboradores_datos_laborales;
CREATE POLICY admin_principal ON public.colaboradores_datos_laborales FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND role = 'admin'));

ALTER TABLE public.configuracion_negocio
  ADD COLUMN IF NOT EXISTS razon_social text,
  ADD COLUMN IF NOT EXISTS nit text,
  ADD COLUMN IF NOT EXISTS representante_legal text,
  ADD COLUMN IF NOT EXISTS representante_documento text,
  ADD COLUMN IF NOT EXISTS representante_cargo text;

CREATE OR REPLACE FUNCTION public.admin_informe_colaborador(p_barbero uuid, p_desde date, p_hasta date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_ini timestamptz := (p_desde::timestamp AT TIME ZONE 'America/Bogota');
  v_fin timestamptz := ((p_hasta + 1)::timestamp AT TIME ZONE 'America/Bogota');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN
    RAISE EXCEPTION 'Rango de fechas inválido';
  END IF;

  RETURN jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'colaborador', (
      SELECT jsonb_build_object(
        'id', b.id, 'nombre', coalesce(nullif(trim(u.full_name), ''), u.username), 'usuario', u.username,
        'puesto', b.puesto, 'especialidad', b.especialidad, 'tipo', coalesce(b.tipo_colaborador, 'barbero'),
        'comision_pct', b.comision_pct, 'sede', s.nombre, 'activo', b.activo, 'creado', u.created_at::date,
        'tipo_documento', d.tipo_documento, 'documento', d.documento, 'fecha_ingreso', d.fecha_ingreso,
        'cargo', d.cargo, 'tipo_vinculo', d.tipo_vinculo,
        'primer_servicio', (SELECT min(fecha) FROM citas WHERE barbero_id = b.id AND estado = 'finalizada'))
      FROM barberos b JOIN usuarios u ON u.id = b.id
      LEFT JOIN sucursales s ON s.id = b.sucursal_id
      LEFT JOIN colaboradores_datos_laborales d ON d.barbero_id = b.id
      WHERE b.id = p_barbero
    ),
    'servicios', (
      SELECT jsonb_build_object(
        'cantidad', count(*), 'ventas', coalesce(sum(precio), 0),
        'comision', coalesce(sum(comision_calculada), 0), 'propinas', coalesce(sum(propina), 0),
        'comision_pendiente', coalesce(sum(comision_calculada) FILTER (WHERE NOT coalesce(comision_pagada, false)), 0),
        'clientes', count(DISTINCT cliente_id))
      FROM citas WHERE barbero_id = p_barbero AND estado = 'finalizada' AND fecha BETWEEN p_desde AND p_hasta
    ),
    'por_servicio', (
      SELECT coalesce(jsonb_agg(x ORDER BY x.ventas DESC), '[]'::jsonb) FROM (
        SELECT coalesce(sv.nombre, 'Servicio') nombre, count(*) cantidad, sum(c.precio) ventas, sum(c.comision_calculada) comision
        FROM citas c LEFT JOIN servicios sv ON sv.id = c.servicio_id
        WHERE c.barbero_id = p_barbero AND c.estado = 'finalizada' AND c.fecha BETWEEN p_desde AND p_hasta
        GROUP BY 1) x
    ),
    'por_dia', (
      SELECT coalesce(jsonb_agg(x ORDER BY x.fecha), '[]'::jsonb) FROM (
        SELECT c.fecha, count(*) servicios, sum(c.precio) ventas, sum(c.comision_calculada) comision, sum(coalesce(c.propina, 0)) propinas
        FROM citas c
        WHERE c.barbero_id = p_barbero AND c.estado = 'finalizada' AND c.fecha BETWEEN p_desde AND p_hasta
        GROUP BY 1) x
    ),
    'productos', (
      SELECT jsonb_build_object(
        'comision', coalesce((SELECT sum(valor_comision) FROM comisiones
                              WHERE barbero_id = p_barbero AND tipo = 'producto' AND created_at >= v_ini AND created_at < v_fin), 0),
        'unidades', coalesce(sum(cantidad), 0), 'ventas', coalesce(sum(precio_total), 0))
      FROM ventas_productos WHERE barbero_id = p_barbero AND created_at >= v_ini AND created_at < v_fin
    ),
    'bebidas', (
      SELECT jsonb_build_object('cantidad', count(*), 'total', coalesce(sum(precio), 0))
      FROM consumos_bebidas_barbero WHERE barbero_id = p_barbero AND created_at >= v_ini AND created_at < v_fin
    ),
    'pagos', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'fecha', fecha_pago, 'servicios', cantidad_servicios, 'comision', total_comision, 'propinas', total_propinas,
        'bebidas', descuento_bebidas, 'descuento', descuento_adicional, 'descuento_motivo', descuento_motivo,
        'total', total_pagado, 'metodo', metodo_pago, 'efectivo', monto_efectivo, 'transferencia', monto_transferencia,
        'sede', (SELECT nombre FROM sucursales WHERE id = p.sucursal_id)) ORDER BY fecha_pago), '[]'::jsonb)
      FROM pagos_comisiones p WHERE barbero_id = p_barbero AND fecha_pago >= v_ini AND fecha_pago < v_fin
    ),
    'otros_pagos', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('fecha', created_at, 'tipo', tipo, 'concepto', concepto, 'monto', monto, 'metodo', metodo_pago) ORDER BY created_at), '[]'::jsonb)
      FROM pagos_colaboradores WHERE barbero_id = p_barbero AND created_at >= v_ini AND created_at < v_fin
    ),
    'por_mes', (
      SELECT coalesce(jsonb_agg(x ORDER BY x.mes), '[]'::jsonb) FROM (
        SELECT to_char(m, 'YYYY-MM') mes,
          (SELECT coalesce(sum(total_pagado), 0) FROM pagos_comisiones
            WHERE barbero_id = p_barbero AND fecha_pago >= greatest(v_ini, m AT TIME ZONE 'America/Bogota')
              AND fecha_pago < least(v_fin, (m + interval '1 month') AT TIME ZONE 'America/Bogota')) pagado,
          (SELECT coalesce(sum(monto), 0) FROM pagos_colaboradores
            WHERE barbero_id = p_barbero AND created_at >= greatest(v_ini, m AT TIME ZONE 'America/Bogota')
              AND created_at < least(v_fin, (m + interval '1 month') AT TIME ZONE 'America/Bogota')) otros,
          (SELECT coalesce(sum(comision_calculada), 0) + coalesce(sum(propina), 0) FROM citas
            WHERE barbero_id = p_barbero AND estado = 'finalizada'
              AND fecha BETWEEN greatest(p_desde, m::date) AND least(p_hasta, (m + interval '1 month')::date - 1)) devengado,
          (SELECT count(*) FROM citas
            WHERE barbero_id = p_barbero AND estado = 'finalizada'
              AND fecha BETWEEN greatest(p_desde, m::date) AND least(p_hasta, (m + interval '1 month')::date - 1)) servicios
        FROM generate_series(date_trunc('month', p_desde::timestamp), date_trunc('month', p_hasta::timestamp), interval '1 month') m) x
    ),
    'empresa', (
      SELECT jsonb_build_object('nombre', nombre_negocio, 'razon_social', razon_social, 'nit', nit, 'direccion', direccion,
        'telefono', coalesce(whatsapp, telefono), 'representante', representante_legal,
        'representante_documento', representante_documento, 'representante_cargo', representante_cargo)
      FROM configuracion_negocio LIMIT 1
    )
  );
END $$;
REVOKE ALL ON FUNCTION public.admin_informe_colaborador(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_informe_colaborador(uuid, date, date) TO authenticated;
