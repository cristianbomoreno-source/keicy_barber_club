-- Las ventas registradas antes de activar trg_ventas_productos_stock nunca
-- descontaron stock, así que al anularlas no se debe devolver la unidad.
-- Solo mueven inventario las ventas creadas desde el 20-oct-2026 20:00 UTC
-- (no hubo ventas entre la activación del trigger y ese corte).
-- Además, el stock de partida se ajusta con las ventas que quedaron sin descontar.

CREATE OR REPLACE FUNCTION public.dn_ventas_productos_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_corte constant timestamptz := '2026-10-20 20:00:00+00';
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.producto_id IS NOT NULL
     AND OLD.solicitud_insumo_id IS NULL AND OLD.created_at >= v_corte THEN
    UPDATE inventario_productos_venta
    SET cantidad = COALESCE(cantidad, 0) + COALESCE(OLD.cantidad, 1)
    WHERE id = OLD.producto_id;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.producto_id IS NOT NULL
     AND NEW.solicitud_insumo_id IS NULL AND NEW.created_at >= v_corte THEN
    UPDATE inventario_productos_venta
    SET cantidad = GREATEST(0, COALESCE(cantidad, 0) - COALESCE(NEW.cantidad, 1))
    WHERE id = NEW.producto_id;
  END IF;

  RETURN NULL;
END $$;

-- Ajuste aplicado una vez (20-oct-2026) en la sede Colina, con las ventas desde la
-- foto inicial del 18-oct que nunca se descontaron:
--   Cera Spider  (bb9ef390…) 5 -> 4  (TKT-261018-0068)
--   Cera Mate MX (b634abc1…) 1 -> 0  (TKT-261020-0028)
-- UPDATE inventario_productos_venta SET cantidad = 4 WHERE id = 'bb9ef390-2364-44de-8034-7026f5ea65e4' AND cantidad = 5;
-- UPDATE inventario_productos_venta SET cantidad = 0 WHERE id = 'b634abc1-6f93-47d7-91da-58b71d31de3d' AND cantidad = 1;
