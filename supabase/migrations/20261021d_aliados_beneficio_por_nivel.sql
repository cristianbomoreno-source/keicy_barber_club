-- Beneficio distinto por nivel del Club en cada alianza (estrategia Fronteras, 21-oct-2026).
-- aliados.beneficios_nivel = {"black": "...", "oro": "...", ...}; si un nivel no tiene texto
-- se usa aliados.beneficio. El aliado ve en cada cliente el beneficio que le corresponde y
-- el canje guarda el beneficio entregado.

ALTER TABLE public.aliados ADD COLUMN IF NOT EXISTS beneficios_nivel jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.aliado_canjes ADD COLUMN IF NOT EXISTS beneficio text;
GRANT SELECT (beneficios_nivel), INSERT (beneficios_nivel), UPDATE (beneficios_nivel) ON public.aliados TO authenticated;

CREATE OR REPLACE FUNCTION public._dn_beneficio_aliado(a public.aliados, p_nivel text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(nullif(trim(a.beneficios_nivel->>p_nivel), ''), a.beneficio);
$$;

CREATE OR REPLACE FUNCTION public.aliado_info(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  a public.aliados := public._dn_aliado_de_token(p_token);
BEGIN
  RETURN jsonb_build_object(
    'nombre', a.nombre,
    'beneficio', a.beneficio,
    'beneficios_nivel', (SELECT coalesce(jsonb_object_agg(n, public._dn_beneficio_aliado(a, n)), '{}'::jsonb) FROM unnest(a.niveles) n),
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

DROP FUNCTION IF EXISTS public.aliado_clientes(text, text, text, text);
CREATE OR REPLACE FUNCTION public.aliado_clientes(p_token text, p_buscar text DEFAULT NULL, p_nivel text DEFAULT NULL, p_estado text DEFAULT NULL)
RETURNS TABLE (cliente_id uuid, nombre text, celular text, nivel text, beneficio text, reclamado_at timestamptz, atendido_por text)
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
         coalesce(c.beneficio, public._dn_beneficio_aliado(a, public._dn_nivel_club(u.total_visitas_weibook))),
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

CREATE OR REPLACE FUNCTION public.aliado_marcar_reclamado(p_token text, p_cliente_id uuid, p_atendido_por text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  a public.aliados := public._dn_aliado_de_token(p_token);
  v_nivel text;
  v_prev timestamptz;
BEGIN
  SELECT public._dn_nivel_club(total_visitas_weibook) INTO v_nivel
  FROM usuarios WHERE id = p_cliente_id AND role = 'cliente';
  IF v_nivel IS NULL OR NOT (v_nivel = ANY (a.niveles)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este cliente no tiene la cortesía');
  END IF;

  SELECT reclamado_at INTO v_prev FROM aliado_canjes WHERE aliado_id = a.id AND cliente_id = p_cliente_id;
  IF v_prev IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya la reclamó', 'reclamado_at', v_prev);
  END IF;

  INSERT INTO aliado_canjes (aliado_id, cliente_id, nivel, beneficio, atendido_por)
  VALUES (a.id, p_cliente_id, v_nivel, public._dn_beneficio_aliado(a, v_nivel),
          nullif(left(trim(coalesce(p_atendido_por, '')), 60), ''))
  ON CONFLICT (aliado_id, cliente_id) DO NOTHING;
  RETURN jsonb_build_object('success', true, 'reclamado_at', now(), 'beneficio', public._dn_beneficio_aliado(a, v_nivel));
END $$;

-- Fronteras según la estrategia de la alianza
UPDATE public.aliados
SET beneficio = 'Beneficio según tu nivel del Club',
    niveles = '{black,oro,plata,bronce}',
    beneficios_nivel = jsonb_build_object(
      'black',  'Combo Miami + cerveza BBC',
      'oro',    'Combo Miami Beach + cerveza BBC',
      'plata',  'Combo Miami Beach',
      'bronce', 'Papas con cheddar')
WHERE usuario = 'fronteras';
