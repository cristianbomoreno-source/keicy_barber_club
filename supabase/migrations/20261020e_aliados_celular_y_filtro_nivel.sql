-- El aliado ahora ve el celular completo (decisión del negocio, 20-oct-2026) y puede
-- filtrar la lista por nivel. aliado_info devuelve cuántos clientes hay por nivel.
-- La búsqueda por dígitos encuentra cualquier parte del número.

DROP FUNCTION IF EXISTS public.aliado_clientes(text, text);

CREATE OR REPLACE FUNCTION public.aliado_clientes(p_token text, p_buscar text DEFAULT NULL, p_nivel text DEFAULT NULL)
RETURNS TABLE (cliente_id uuid, nombre text, celular text, nivel text, reclamado_at timestamptz, atendido_por text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  a public.aliados := public._dn_aliado_de_token(p_token);
  v_txt text := nullif(trim(coalesce(p_buscar, '')), '');
  v_dig text := nullif(regexp_replace(coalesce(p_buscar, ''), '\D', '', 'g'), '');
  v_nivel text := nullif(lower(trim(coalesce(p_nivel, ''))), '');
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
    AND (v_txt IS NULL
         OR (v_dig IS NOT NULL AND length(v_dig) >= 3 AND regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') LIKE '%' || v_dig || '%')
         OR (v_dig IS NULL AND u.full_name ILIKE '%' || v_txt || '%'))
  ORDER BY (c.reclamado_at IS NOT NULL), u.total_visitas_weibook DESC NULLS LAST, u.full_name
  LIMIT 300;
END $$;

REVOKE ALL ON FUNCTION public.aliado_clientes(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aliado_clientes(text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.aliado_info(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  a public.aliados := public._dn_aliado_de_token(p_token);
BEGIN
  RETURN jsonb_build_object(
    'nombre', a.nombre,
    'beneficio', a.beneficio,
    'niveles', to_jsonb(a.niveles),
    'vigente_hasta', a.vigente_hasta,
    'elegibles', (SELECT count(*) FROM usuarios u WHERE u.role = 'cliente'
                  AND public._dn_nivel_club(u.total_visitas_weibook) = ANY (a.niveles)),
    'reclamados', (SELECT count(*) FROM aliado_canjes WHERE aliado_id = a.id),
    'por_nivel', (SELECT coalesce(jsonb_object_agg(n, cnt), '{}'::jsonb) FROM (
                    SELECT public._dn_nivel_club(u.total_visitas_weibook) n, count(*) cnt
                    FROM usuarios u WHERE u.role = 'cliente'
                      AND public._dn_nivel_club(u.total_visitas_weibook) = ANY (a.niveles)
                    GROUP BY 1) x)
  );
END $$;
