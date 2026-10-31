-- Logo de cada aliado para la página /aliados/ (junto al de Diego Neira).
ALTER TABLE public.aliados ADD COLUMN IF NOT EXISTS logo_url text;
GRANT SELECT (logo_url), INSERT (logo_url), UPDATE (logo_url) ON public.aliados TO authenticated;
UPDATE public.aliados SET logo_url = '/assets/aliados/fronteras.webp' WHERE usuario = 'fronteras';

CREATE OR REPLACE FUNCTION public.aliado_info(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  a public.aliados := public._dn_aliado_de_token(p_token);
BEGIN
  RETURN jsonb_build_object(
    'nombre', a.nombre,
    'logo_url', a.logo_url,
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
