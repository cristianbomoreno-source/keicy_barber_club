-- Comisión fija por producto que deja Keicy al barbero (lista de Vallejo, 10-nov-2026).
-- Solo cambian el shampoo de carbón y la Skala (8.000 → 9.000); el resto ya coincidía.
UPDATE inventario_productos_venta p
SET comision = v.comision
FROM (VALUES
  ('After shave marlow',                      6000),
  ('CERA TRADICIONAL MATE MARLOW',            8000),
  ('CERA TRADICIONAL MARLOW BRILLANTE',       8000),
  ('SHAMPO DE CARBON ACTIVADO ANTICASPA',     9000),
  ('SKALA CREMA DE PEINAR',                   9000),
  ('Minoxidil',                               9000),
  ('CERA MATE MARLOW CON MINOXIDIL',          9000),
  ('CERA BRILLANTE MARLOW CON MINOXIDIL',     9000),
  ('CERA CREMOSA MARLOW',                     8000),
  ('POLVO TEXTURIZANTE MARLOW',               9000),
  ('CERA SPIDER MATE MARLOW (tipo telaraña)', 8000)
) AS v(nombre, comision)
WHERE p.nombre = v.nombre AND p.comision IS DISTINCT FROM v.comision;
