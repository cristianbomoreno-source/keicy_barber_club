-- Las ventas de productos no descontaban unidades del inventario: el código del
-- cobro confiaba en que registrar_cobro_v2 lo hacía, pero la versión vigente ya no
-- lo hace. Ahora cada fila de ventas_productos mueve el stock del producto:
--   INSERT -> descuenta la cantidad vendida
--   DELETE -> la devuelve (anular_ticket borra la venta al anular un cobro)
--   UPDATE -> ajusta la diferencia si cambia la cantidad o el producto
-- El kardex (trg_inventario_movimientos) registra cada cambio con origen 'sistema'.
-- Los insumos entregados al barbero (solicitud_insumo_id) se quedan fuera: el
-- calendario ya descuenta esas unidades con decrementar_inventario_producto.

CREATE OR REPLACE FUNCTION public.dn_ventas_productos_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.producto_id IS NOT NULL AND OLD.solicitud_insumo_id IS NULL THEN
    UPDATE inventario_productos_venta
    SET cantidad = COALESCE(cantidad, 0) + COALESCE(OLD.cantidad, 1)
    WHERE id = OLD.producto_id;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.producto_id IS NOT NULL AND NEW.solicitud_insumo_id IS NULL THEN
    UPDATE inventario_productos_venta
    SET cantidad = GREATEST(0, COALESCE(cantidad, 0) - COALESCE(NEW.cantidad, 1))
    WHERE id = NEW.producto_id;
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_ventas_productos_stock ON public.ventas_productos;
CREATE TRIGGER trg_ventas_productos_stock
AFTER INSERT OR DELETE OR UPDATE OF cantidad, producto_id ON public.ventas_productos
FOR EACH ROW EXECUTE FUNCTION public.dn_ventas_productos_stock();
