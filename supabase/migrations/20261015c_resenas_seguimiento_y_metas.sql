-- Seguimiento de reseñas (admin): marcar como atendida y dejar una nota
-- ("se llamó al cliente", "se dio un bono"...). Las reseñas bajas sin atender
-- se muestran como alerta en el dashboard del admin.
ALTER TABLE public.resenas
  ADD COLUMN IF NOT EXISTS atendida boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS atendida_at timestamptz,
  ADD COLUMN IF NOT EXISTS atendida_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nota_seguimiento text;

-- Alerta del dashboard: reseñas bajas pendientes
CREATE INDEX IF NOT EXISTS idx_resenas_bajas_pendientes
  ON public.resenas (created_at DESC)
  WHERE calificacion <= 3 AND atendida = false;

-- Metas de reseñas por barbero (editables desde admin/resenas.html)
INSERT INTO public.configuracion_global (key, value, updated_at)
VALUES ('metas_resenas', '{"tasa_min": 25, "promedio_min": 4.8}'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
