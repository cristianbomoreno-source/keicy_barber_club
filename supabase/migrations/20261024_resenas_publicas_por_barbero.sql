-- Reservar mostraba solo las últimas 50 reseñas de TODA la sede y con eso calculaba
-- el número de reseñas y el promedio de cada barbero (ninguno pasaba de 50 y los que
-- tienen menos movimiento quedaban casi sin reseñas).
-- 1) dn_publico_resenas: p_limite ahora es por barbero (últimas N de cada uno).
-- 2) dn_publico_resenas_stats: total, promedio y distribución de estrellas reales por barbero.

CREATE OR REPLACE FUNCTION public.dn_publico_resenas(p_barbero_ids uuid[], p_limite integer DEFAULT 50)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'barbero_id', r.barbero_id, 'calificacion', r.calificacion, 'comentario', r.comentario,
      'created_at', r.created_at,
      'cliente', CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object(
        'nombre', split_part(coalesce(nullif(trim(u.full_name), ''), 'Cliente'), ' ', 1),
        'apellido', '',
        'cortes', coalesce((u.lealtad_info->>'cortes_total')::int, 0),
        'categoria', u.lealtad_info->>'categoria') END
    ) x
    FROM (
      SELECT r.*, row_number() OVER (PARTITION BY r.barbero_id ORDER BY r.created_at DESC) AS n
      FROM resenas r
      WHERE r.barbero_id = ANY (p_barbero_ids)
    ) r
    LEFT JOIN usuarios u ON u.id = r.cliente_id
    WHERE r.n <= least(greatest(coalesce(p_limite, 50), 1), 200)
  ) t;
$$;

CREATE OR REPLACE FUNCTION public.dn_publico_resenas_stats(p_barbero_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'barbero_id', barbero_id,
    'total', total,
    'promedio', promedio,
    'dist', jsonb_build_array(e1, e2, e3, e4, e5)
  )), '[]'::jsonb)
  FROM (
    SELECT r.barbero_id, count(*) AS total, round(avg(r.calificacion)::numeric, 2) AS promedio,
      count(*) FILTER (WHERE r.calificacion = 1) AS e1,
      count(*) FILTER (WHERE r.calificacion = 2) AS e2,
      count(*) FILTER (WHERE r.calificacion = 3) AS e3,
      count(*) FILTER (WHERE r.calificacion = 4) AS e4,
      count(*) FILTER (WHERE r.calificacion = 5) AS e5
    FROM resenas r
    WHERE r.barbero_id = ANY (p_barbero_ids)
    GROUP BY r.barbero_id
  ) s;
$$;

REVOKE ALL ON FUNCTION public.dn_publico_resenas_stats(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dn_publico_resenas_stats(uuid[]) TO anon, authenticated;
