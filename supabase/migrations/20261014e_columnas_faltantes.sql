-- Columnas de migrations/weibook/migrations/005 que nunca se aplicaron en producción
-- y que el panel ya usa:
--  * usuarios.config_pago: pago del admin de sede (Configuración > Pago Admin Sede
--    y cierre de turno).
--  * ventas_productos.solicitud_insumo_id: agregar producto desde una solicitud
--    de insumos en la agenda.

ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS config_pago jsonb DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.usuarios.config_pago IS 'Configuración de pago: salario_diario, comision_productos_pct';

ALTER TABLE public.ventas_productos
  ADD COLUMN IF NOT EXISTS solicitud_insumo_id uuid REFERENCES public.solicitudes_insumos(id) ON DELETE SET NULL;
