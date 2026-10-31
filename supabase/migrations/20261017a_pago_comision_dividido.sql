-- 17-oct-2026
-- Pago a colaboradores dividido: parte en efectivo y parte por transferencia.
-- metodo_pago acepta 'mixto' y se guarda cuánto fue por cada medio.

ALTER TABLE public.pagos_comisiones DROP CONSTRAINT IF EXISTS pagos_comisiones_metodo_pago_check;
ALTER TABLE public.pagos_comisiones ADD CONSTRAINT pagos_comisiones_metodo_pago_check
  CHECK (metodo_pago IN ('efectivo', 'transferencia', 'mixto'));

ALTER TABLE public.pagos_comisiones ADD COLUMN IF NOT EXISTS monto_efectivo NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.pagos_comisiones ADD COLUMN IF NOT EXISTS monto_transferencia NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Pagos anteriores: todo el monto va al único medio que tenían
UPDATE public.pagos_comisiones
SET monto_efectivo = CASE WHEN metodo_pago = 'efectivo' THEN total_pagado ELSE 0 END,
    monto_transferencia = CASE WHEN metodo_pago = 'transferencia' THEN total_pagado ELSE 0 END
WHERE monto_efectivo = 0 AND monto_transferencia = 0;
