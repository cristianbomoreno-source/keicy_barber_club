-- Migración: Agregar horarios personalizados por día para colaboradores
-- Fecha: 2026-10-09
-- Descripción: Permite configurar horarios personalizados por día de la semana para cada colaborador

-- Agregar columna horario_personalizado a la tabla barberos
ALTER TABLE barberos ADD COLUMN IF NOT EXISTS horario_personalizado JSONB DEFAULT NULL;

-- Agregar comentario descriptivo
COMMENT ON COLUMN barberos.horario_personalizado IS 'Horario personalizado por día. Estructura: {
  "lunes": {"activo": true, "rangos": [{"desde": "10:00", "hasta": "13:00"}, {"desde": "14:00", "hasta": "20:00"}]},
  "domingo": {"activo": true, "rangos": [{"desde": "10:00", "hasta": "13:00"}, {"desde": "14:00", "hasta": "17:00"}]},
  ...
}. Si es NULL, el barbero trabaja el horario completo de la sede. Si un día tiene activo=false, está libre ese día.
Horarios por defecto: Lun-Sáb 10:00am-1:00pm y 2:00pm-8:00pm. Domingos 10:00am-1:00pm y 2:00pm-5:00pm.
Los festivos aplican hora_cierre_festivos de configuracion_negocio (por defecto 17:00).';

-- Crear índice para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_barberos_horario_personalizado ON barberos USING GIN (horario_personalizado) WHERE horario_personalizado IS NOT NULL;
