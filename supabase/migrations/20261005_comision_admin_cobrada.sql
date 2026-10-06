-- Migración: Agregar campos para trackear pago de comisión de admin en ventas_productos
-- Fecha: 2026-10-05

ALTER TABLE ventas_productos
ADD COLUMN IF NOT EXISTS comision_admin_cobrada BOOLEAN DEFAULT false;

ALTER TABLE ventas_productos
ADD COLUMN IF NOT EXISTS comision_admin_cobrada_at TIMESTAMPTZ;

-- Índice para mejorar consultas de comisiones pendientes de admin
CREATE INDEX IF NOT EXISTS idx_ventas_productos_admin_cobrada
ON ventas_productos(comision_para, comision_admin_cobrada)
WHERE comision_para = 'admin_sede';
