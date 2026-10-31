-- El barbero ve sus propias ventas de productos para mostrar en "Mis ganancias de hoy"
-- qué producto vendió (ej. Velo Colágeno) junto a la comisión. Solo lectura y solo las suyas.
DROP POLICY IF EXISTS barbero_suyas ON public.ventas_productos;
CREATE POLICY barbero_suyas ON public.ventas_productos
  FOR SELECT TO authenticated
  USING (barbero_id = auth.uid());
