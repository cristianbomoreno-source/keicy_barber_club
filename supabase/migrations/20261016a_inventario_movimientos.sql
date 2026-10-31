-- =====================================================================
-- Kardex de productos: cada cambio de stock en inventario_productos_venta
-- queda registrado (entradas, ajustes, ventas, devoluciones, altas y bajas).
--
-- origen:
--   'manual'  -> el admin cambió la cantidad desde el panel (UPDATE directo vía API)
--   'sistema' -> la cambió una función (cobro, anulación, decrementar_inventario_producto)
--   'alta' / 'baja' -> se creó o se eliminó el producto
--   'inicial' -> foto del stock al crear este registro (16-oct-2026)
-- Las ventas con su comisión siguen viviendo en ventas_productos; el reporte
-- usa esta tabla para entradas, ajustes y devoluciones.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.inventario_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  producto_id uuid,
  producto_nombre text,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'salida')),
  origen text NOT NULL CHECK (origen IN ('manual', 'sistema', 'alta', 'baja', 'inicial')),
  cantidad integer NOT NULL,          -- siempre positiva; el signo lo da "tipo"
  stock_anterior integer,
  stock_nuevo integer,
  costo_unitario numeric(10,2),
  precio_unitario numeric(10,2),
  usuario_id uuid
);

CREATE INDEX IF NOT EXISTS idx_inv_mov_fecha ON public.inventario_movimientos(created_at);
CREATE INDEX IF NOT EXISTS idx_inv_mov_producto ON public.inventario_movimientos(producto_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_sucursal ON public.inventario_movimientos(sucursal_id);

ALTER TABLE public.inventario_movimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admins ON public.inventario_movimientos;
CREATE POLICY admins ON public.inventario_movimientos FOR SELECT TO authenticated USING (public.dn_es_admin());

CREATE OR REPLACE FUNCTION public.dn_log_inventario_movimiento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ant integer;
  v_nuevo integer;
  v_delta integer;
  v_origen text;
  v_row public.inventario_productos_venta%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_row := NEW; v_ant := 0; v_nuevo := COALESCE(NEW.cantidad, 0); v_origen := 'alta';
  ELSIF TG_OP = 'DELETE' THEN
    v_row := OLD; v_ant := COALESCE(OLD.cantidad, 0); v_nuevo := 0; v_origen := 'baja';
  ELSE
    v_row := NEW; v_ant := COALESCE(OLD.cantidad, 0); v_nuevo := COALESCE(NEW.cantidad, 0);
    -- Un UPDATE directo desde PostgREST trae la tabla en la consulta; una RPC no.
    v_origen := CASE WHEN current_query() ILIKE '%update%inventario_productos_venta%' THEN 'manual' ELSE 'sistema' END;
  END IF;

  v_delta := v_nuevo - v_ant;
  IF v_delta = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.inventario_movimientos
    (producto_id, producto_nombre, sucursal_id, tipo, origen, cantidad, stock_anterior, stock_nuevo, costo_unitario, precio_unitario, usuario_id)
  VALUES
    (CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE v_row.id END, v_row.nombre, v_row.sucursal_id,
     CASE WHEN v_delta > 0 THEN 'entrada' ELSE 'salida' END, v_origen, abs(v_delta),
     v_ant, v_nuevo, v_row.costo, v_row.precio, auth.uid());
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_inventario_movimientos ON public.inventario_productos_venta;
CREATE TRIGGER trg_inventario_movimientos
AFTER INSERT OR DELETE OR UPDATE OF cantidad ON public.inventario_productos_venta
FOR EACH ROW EXECUTE FUNCTION public.dn_log_inventario_movimiento();

-- Foto inicial del stock para tener punto de partida
INSERT INTO public.inventario_movimientos
  (producto_id, producto_nombre, sucursal_id, tipo, origen, cantidad, stock_anterior, stock_nuevo, costo_unitario, precio_unitario)
SELECT id, nombre, sucursal_id, 'entrada', 'inicial', COALESCE(cantidad, 0), 0, COALESCE(cantidad, 0), costo, precio
FROM public.inventario_productos_venta
WHERE NOT EXISTS (SELECT 1 FROM public.inventario_movimientos WHERE origen = 'inicial');
