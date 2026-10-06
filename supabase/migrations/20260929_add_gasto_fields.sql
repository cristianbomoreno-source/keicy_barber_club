-- Migración: Agregar campos metodo_pago y categoria a caja_movimientos
-- Fecha: 2026-09-29
-- Descripción: Permite registrar gastos con método de pago específico y categoría

-- Agregar campo metodo_pago (para rastrear de qué método se descuenta el gasto)
ALTER TABLE caja_movimientos
ADD COLUMN IF NOT EXISTS metodo_pago TEXT DEFAULT 'efectivo';

-- Agregar campo categoria (tipo de gasto: bebidas, inventario, etc.)
ALTER TABLE caja_movimientos
ADD COLUMN IF NOT EXISTS categoria TEXT;

-- Comentarios para documentación
COMMENT ON COLUMN caja_movimientos.metodo_pago IS 'Método de pago del movimiento: efectivo, tarjeta, nequi, qr, etc.';
COMMENT ON COLUMN caja_movimientos.categoria IS 'Categoría del gasto: bebidas, inventario, cuchillas, toallas, shampoo, etc.';

-- Índice para consultas por método de pago
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_metodo_pago
ON caja_movimientos(metodo_pago);

-- Índice para consultas por categoría
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_categoria
ON caja_movimientos(categoria);
