-- Catálogo de productos copiado de WeiBook (Inventario) el 4-nov-2026.
-- stock_minimo 1: es el umbral de alerta que usa WeiBook.
INSERT INTO inventario_productos_venta
  (sucursal_id, nombre, costo, precio_compra, precio, precio_venta, comision, cantidad, stock, stock_minimo, categoria, activo, orden)
SELECT '46c99064-8218-41a0-a8c7-a81103f658fa', v.nombre, v.costo, v.costo, v.precio, v.precio, v.comision, v.stock, v.stock, 1, 'producto', true, v.orden
FROM (VALUES
  (1,  'After shave marlow',                      0,     35000, 6000, 0),
  (2,  'CERA TRADICIONAL MATE MARLOW',            16000, 45000, 8000, 0),
  (3,  'SHAMPO DE CARBON ACTIVADO ANTICASPA',     25500, 50000, 8000, 0),
  (4,  'derma roller',                            10000, 30000, 8000, 0),
  (5,  'SKALA CREMA DE PEINAR',                   25000, 50000, 8000, 1),
  (6,  'Minoxidil',                               25000, 60000, 9000, 0),
  (7,  'CERA MATE MARLOW CON MINOXIDIL',          16000, 48000, 9000, 6),
  (8,  'CERA BRILLANTE MARLOW CON MINOXIDIL',     16000, 48000, 9000, 5),
  (9,  'CERA TRADICIONAL MARLOW BRILLANTE',       16000, 45000, 8000, 0),
  (10, 'CERA CREMOSA MARLOW',                     16000, 45000, 8000, 0),
  (11, 'POLVO TEXTURIZANTE MARLOW',               17000, 50000, 9000, 3),
  (12, 'CERA SPIDER MATE MARLOW (tipo telaraña)', 13000, 45000, 8000, 0)
) AS v(orden, nombre, costo, precio, comision, stock)
WHERE NOT EXISTS (SELECT 1 FROM inventario_productos_venta p WHERE p.nombre = v.nombre);
