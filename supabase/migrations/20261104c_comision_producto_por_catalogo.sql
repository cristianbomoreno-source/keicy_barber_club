-- La comisión de productos sale del catálogo (inventario_productos_venta.comision)
-- y no de los $5.000 fijos: caja ya usaba el catálogo y la app del barbero no.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p WHERE p.proname = 'registrar_cobro_v2';

  v_def := replace(v_def, '  v_monto_comision_producto CONSTANT NUMERIC := 5000;' || chr(10), '');
  v_def := replace(v_def,
    'v_total_productos_qty := v_total_productos_qty + COALESCE((v_item->>''cantidad'')::INTEGER, 1);',
    'v_total_productos_qty := v_total_productos_qty + COALESCE((v_item->>''cantidad'')::INTEGER, 1);
      v_comision_producto := v_comision_producto + COALESCE((v_item->>''cantidad'')::INTEGER, 1) *
        COALESCE((SELECT p.comision FROM inventario_productos_venta p WHERE p.id = (v_item->>''item_id'')::UUID), 0);');
  v_def := replace(v_def,
    'IF v_total_productos_qty > 0 THEN
      v_comision_producto := v_total_productos_qty * v_monto_comision_producto;',
    'IF v_comision_producto > 0 THEN');
  v_def := replace(v_def, 'v_total_productos_qty * v_monto_comision_producto, 100, v_comision_producto', 'v_comision_producto, 100, v_comision_producto');

  IF v_def LIKE '%v_monto_comision_producto%' THEN
    RAISE EXCEPTION 'registrar_cobro_v2 no tiene el texto esperado';
  END IF;
  EXECUTE v_def;
END $$;
