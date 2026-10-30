-- Fotos de servicios de Keicy (30-oct-2026)
-- Reales: barba, corte-y-barba, limpieza-facial, marcacion-cejas
-- Generadas con Canva IA a partir de las reales: el resto
update servicios s
set foto_url = 'https://www.keicybarberclub.com/assets/servicios/' || m.archivo
from (values
  ('Corte de cabello', 'corte-y-barba.jpg'),
  ('Corte y cejas', 'marcacion-cejas.jpg'),
  ('Corte y barba', 'corte-y-barba.jpg'),
  ('Corte premium', 'corte-premium.jpg'),
  ('Corte con diseño básico', 'diseno-basico.jpg'),
  ('Corte con diseño premium', 'diseno-premium.jpg'),
  ('Corte de puntas (mujeres)', 'corte-puntas.jpg'),
  ('Barba', 'barba.jpg'),
  ('Cejas', 'marcacion-cejas.jpg'),
  ('Marcación corte', 'marcacion-cejas.jpg'),
  ('Diseño básico', 'diseno-basico.jpg'),
  ('Diseño premium', 'diseno-premium.jpg'),
  ('Línea en la ceja', 'marcacion-cejas.jpg'),
  ('Depilación combo (nariz y orejas)', 'depilacion.jpg'),
  ('Depilación orejas', 'depilacion.jpg'),
  ('Depilación nariz', 'depilacion.jpg'),
  ('Limpieza facial básica', 'limpieza-facial.jpg'),
  ('Limpieza facial premium', 'limpieza-facial.jpg'),
  ('Velo facial', 'limpieza-facial.jpg'),
  ('Exfoliación', 'limpieza-facial.jpg'),
  ('Mascarilla puntos negros', 'mascarilla-puntos-negros.jpg'),
  ('Pigmentación de barba', 'barba.jpg'),
  ('Color', 'color.jpg'),
  ('Retoque de matizante', 'color.jpg'),
  ('Tinte para barba', 'barba.jpg')
) as m(nombre, archivo)
where s.nombre = m.nombre;
