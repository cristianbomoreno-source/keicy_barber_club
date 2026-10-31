-- Al tocar "Ya reclamadas" el aliado ve solo quiénes reclamaron (los más recientes primero).
-- p_estado: NULL = todos, 'reclamados', 'pendientes'.

DROP FUNCTION IF EXISTS public.aliado_clientes(text, text, text);

CREATE OR REPLACE FUNCTION public.aliado_clientes(p_token text, p_buscar text DEFAULT NULL, p_nivel text DEFAULT NULL, p_estado text DEFAULT NULL)
RETURNS TABLE (cliente_id uuid, nombre text, celular text, nivel text, reclamado_at timestamptz, atendido_por text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  a public.aliados := public._dn_aliado_de_token(p_token);
  v_txt text := nullif(trim(coalesce(p_buscar, '')), '');
  v_dig text := nullif(regexp_replace(coalesce(p_buscar, ''), '\D', '', 'g'), '');
  v_nivel text := nullif(lower(trim(coalesce(p_nivel, ''))), '');
  v_estado text := nullif(lower(trim(coalesce(p_estado, ''))), '');
BEGIN
  RETURN QUERY
  SELECT u.id,
         coalesce(nullif(initcap(trim(u.full_name)), ''), 'Cliente'),
         u.phone,
         public._dn_nivel_club(u.total_visitas_weibook),
         c.reclamado_at,
         c.atendido_por
  FROM usuarios u
  LEFT JOIN aliado_canjes c ON c.aliado_id = a.id AND c.cliente_id = u.id
  WHERE u.role = 'cliente'
    AND public._dn_nivel_club(u.total_visitas_weibook) = ANY (a.niveles)
    AND (v_nivel IS NULL OR public._dn_nivel_club(u.total_visitas_weibook) = v_nivel)
    AND (v_estado IS NULL
         OR (v_estado = 'reclamados' AND c.reclamado_at IS NOT NULL)
         OR (v_estado = 'pendientes' AND c.reclamado_at IS NULL))
    AND (v_txt IS NULL
         OR (v_dig IS NOT NULL AND length(v_dig) >= 3 AND regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') LIKE '%' || v_dig || '%')
         OR (v_dig IS NULL AND u.full_name ILIKE '%' || v_txt || '%'))
  ORDER BY CASE WHEN v_estado = 'reclamados' THEN c.reclamado_at END DESC NULLS LAST,
           (c.reclamado_at IS NOT NULL), u.total_visitas_weibook DESC NULLS LAST, u.full_name
  LIMIT 300;
END $$;

REVOKE ALL ON FUNCTION public.aliado_clientes(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aliado_clientes(text, text, text, text) TO anon, authenticated;
