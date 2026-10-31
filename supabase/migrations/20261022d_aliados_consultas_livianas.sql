-- 22-oct-2026: la página de aliados (Fronteras) daba 500 por statement_timeout (anon = 3s).
-- aliado_info recorría los 18k usuarios dos veces llamando _dn_nivel_club por fila.
-- 1) _dn_nivel_club sin SET search_path para que Postgres la pueda "inlinear" (solo usa CASE/coalesce).
ALTER FUNCTION public._dn_nivel_club(integer) RESET search_path;

-- 2) Índice parcial con solo los miembros del club (~2.100 filas). Aplicado con CONCURRENTLY.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usuarios_club ON public.usuarios(total_visitas_weibook DESC)
  WHERE role = 'cliente' AND total_visitas_weibook >= 10;

-- 3) aliado_info en una sola pasada y aliado_clientes filtrando por total_visitas_weibook >= 10 (usa el índice).
CREATE OR REPLACE FUNCTION public.aliado_info(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  a public.aliados := public._dn_aliado_de_token(p_token);
  v_por_nivel jsonb;
  v_elegibles bigint;
BEGIN
  -- Una sola pasada sobre los miembros del club (índice parcial idx_usuarios_club)
  SELECT coalesce(jsonb_object_agg(n, cnt), '{}'::jsonb), coalesce(sum(cnt), 0)
    INTO v_por_nivel, v_elegibles
  FROM (
    SELECT public._dn_nivel_club(u.total_visitas_weibook) n, count(*) cnt
    FROM usuarios u
    WHERE u.role = 'cliente' AND u.total_visitas_weibook >= 10
      AND public._dn_nivel_club(u.total_visitas_weibook) = ANY (a.niveles)
    GROUP BY 1) x;

  RETURN jsonb_build_object(
    'nombre', a.nombre,
    'logo_url', a.logo_url,
    'beneficio', a.beneficio,
    'beneficios_nivel', (SELECT coalesce(jsonb_object_agg(n, public._dn_beneficio_aliado(a, n)), '{}'::jsonb) FROM unnest(a.niveles) n),
    'niveles', to_jsonb(a.niveles),
    'vigente_hasta', a.vigente_hasta,
    'elegibles', v_elegibles,
    'reclamados', (SELECT count(*) FROM aliado_canjes WHERE aliado_id = a.id),
    'por_nivel', v_por_nivel
  );
END $function$;

CREATE OR REPLACE FUNCTION public.aliado_clientes(p_token text, p_buscar text DEFAULT NULL::text, p_nivel text DEFAULT NULL::text, p_estado text DEFAULT NULL::text)
 RETURNS TABLE(cliente_id uuid, nombre text, celular text, nivel text, beneficio text, reclamado_at timestamp with time zone, atendido_por text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
         coalesce(c.beneficio, public._dn_beneficio_aliado(a, public._dn_nivel_club(u.total_visitas_weibook))),
         c.reclamado_at,
         c.atendido_por
  FROM usuarios u
  LEFT JOIN aliado_canjes c ON c.aliado_id = a.id AND c.cliente_id = u.id
  WHERE u.role = 'cliente' AND u.total_visitas_weibook >= 10
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
END $function$;
