-- Alianzas con negocios aliados (ej. hamburguesería): los clientes del Club de
-- Leales de ciertos niveles reciben una cortesía y el aliado marca quién la reclamó.
--
-- - El aliado entra con un enlace privado (/aliados/?k=<token>), sin cuenta. En la
--   base solo se guarda el hash del token; el admin puede generar uno nuevo y el
--   anterior deja de funcionar.
-- - El aliado ve solo lo necesario para atender: nombre + inicial del apellido,
--   últimos 4 dígitos del celular y nivel. Nunca el número completo ni el correo.
-- - Una cortesía por cliente y alianza. El aliado puede deshacer una marca
--   durante 15 minutos (por si se equivocó); después solo el admin.
-- - El nivel sale de usuarios.total_visitas_weibook con los mismos rangos de
--   Fidelización: bronce 10+, plata 30+, oro 50+, black 70+.

CREATE TABLE IF NOT EXISTS public.aliados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  beneficio text NOT NULL,
  niveles text[] NOT NULL DEFAULT ARRAY['oro', 'black'],
  token_hash text UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  vigente_hasta date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aliados_niveles_validos CHECK (niveles <@ ARRAY['bronce', 'plata', 'oro', 'black'] AND cardinality(niveles) > 0)
);

CREATE TABLE IF NOT EXISTS public.aliado_canjes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aliado_id uuid NOT NULL REFERENCES public.aliados(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  nivel text,
  atendido_por text,
  reclamado_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aliado_id, cliente_id)
);
CREATE INDEX IF NOT EXISTS aliado_canjes_aliado_idx ON public.aliado_canjes (aliado_id, reclamado_at DESC);

ALTER TABLE public.aliados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aliado_canjes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admins ON public.aliados;
CREATE POLICY admins ON public.aliados FOR ALL TO authenticated USING (public.dn_es_admin()) WITH CHECK (public.dn_es_admin());
DROP POLICY IF EXISTS admins ON public.aliado_canjes;
CREATE POLICY admins ON public.aliado_canjes FOR ALL TO authenticated USING (public.dn_es_admin()) WITH CHECK (public.dn_es_admin());

-- Nivel del club según cortes
CREATE OR REPLACE FUNCTION public._dn_nivel_club(p_cortes integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN coalesce(p_cortes, 0) >= 70 THEN 'black'
    WHEN p_cortes >= 50 THEN 'oro'
    WHEN p_cortes >= 30 THEN 'plata'
    WHEN p_cortes >= 10 THEN 'bronce'
  END
$$;

-- Nombre corto para el aliado: "Juan P."
CREATE OR REPLACE FUNCTION public._dn_nombre_corto(p_nombre text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN coalesce(trim(p_nombre), '') = '' THEN 'Cliente'
    WHEN array_length(regexp_split_to_array(trim(p_nombre), '\s+'), 1) = 1 THEN initcap(trim(p_nombre))
    ELSE initcap(split_part(trim(p_nombre), ' ', 1)) || ' ' ||
         upper(left((regexp_split_to_array(trim(p_nombre), '\s+'))[2], 1)) || '.'
  END
$$;

-- Aliado dueño del token (activo y vigente) o error ENLACE_INVALIDO
CREATE OR REPLACE FUNCTION public._dn_aliado_de_token(p_token text)
RETURNS public.aliados LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  a public.aliados;
BEGIN
  SELECT * INTO a FROM aliados
  WHERE token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    AND activo AND (vigente_hasta IS NULL OR vigente_hasta >= (now() AT TIME ZONE 'America/Bogota')::date);
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'ENLACE_INVALIDO' USING ERRCODE = '28000';
  END IF;
  RETURN a;
END $$;
REVOKE ALL ON FUNCTION public._dn_aliado_de_token(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- Funciones del aliado (página pública con token)
-- ---------------------------------------------------------------------
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
    'reclamados', (SELECT count(*) FROM aliado_canjes WHERE aliado_id = a.id)
  );
END $$;

-- Lista de clientes con derecho a la cortesía. p_buscar filtra por nombre o por
-- dígitos del celular (completo o los últimos dígitos).
CREATE OR REPLACE FUNCTION public.aliado_clientes(p_token text, p_buscar text DEFAULT NULL)
RETURNS TABLE (cliente_id uuid, nombre text, celular_final text, nivel text, reclamado_at timestamptz, atendido_por text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  a public.aliados := public._dn_aliado_de_token(p_token);
  v_txt text := nullif(trim(coalesce(p_buscar, '')), '');
  v_dig text := nullif(regexp_replace(coalesce(p_buscar, ''), '\D', '', 'g'), '');
BEGIN
  RETURN QUERY
  SELECT u.id,
         public._dn_nombre_corto(u.full_name),
         right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 4),
         public._dn_nivel_club(u.total_visitas_weibook),
         c.reclamado_at,
         c.atendido_por
  FROM usuarios u
  LEFT JOIN aliado_canjes c ON c.aliado_id = a.id AND c.cliente_id = u.id
  WHERE u.role = 'cliente'
    AND public._dn_nivel_club(u.total_visitas_weibook) = ANY (a.niveles)
    AND (v_txt IS NULL
         OR (v_dig IS NOT NULL AND length(v_dig) >= 4 AND regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') LIKE '%' || v_dig)
         OR (v_dig IS NULL AND u.full_name ILIKE '%' || v_txt || '%'))
  ORDER BY (c.reclamado_at IS NOT NULL), u.full_name
  LIMIT 300;
END $$;

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

  INSERT INTO aliado_canjes (aliado_id, cliente_id, nivel, atendido_por)
  VALUES (a.id, p_cliente_id, v_nivel, nullif(left(trim(coalesce(p_atendido_por, '')), 60), ''))
  ON CONFLICT (aliado_id, cliente_id) DO NOTHING;
  RETURN jsonb_build_object('success', true, 'reclamado_at', now());
END $$;

CREATE OR REPLACE FUNCTION public.aliado_deshacer_reclamado(p_token text, p_cliente_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  a public.aliados := public._dn_aliado_de_token(p_token);
  v_borradas int;
BEGIN
  DELETE FROM aliado_canjes
  WHERE aliado_id = a.id AND cliente_id = p_cliente_id AND reclamado_at > now() - interval '15 minutes';
  GET DIAGNOSTICS v_borradas = ROW_COUNT;
  IF v_borradas = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pasaron más de 15 minutos; pídele a la barbería que lo corrija');
  END IF;
  RETURN jsonb_build_object('success', true);
END $$;

REVOKE ALL ON FUNCTION public.aliado_info(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aliado_clientes(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aliado_marcar_reclamado(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aliado_deshacer_reclamado(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aliado_info(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aliado_clientes(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aliado_marcar_reclamado(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aliado_deshacer_reclamado(text, uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- Admin: genera (o regenera) el enlace del aliado. Devuelve el token una sola vez.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aliado_generar_enlace(p_aliado_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
BEGIN
  PERFORM public._dn_exigir_admin();
  UPDATE aliados SET token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex') WHERE id = p_aliado_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aliado no encontrado';
  END IF;
  RETURN v_token;
END $$;
REVOKE ALL ON FUNCTION public.aliado_generar_enlace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aliado_generar_enlace(uuid) TO authenticated;

-- Resumen para el panel: elegibles y reclamados por alianza
CREATE OR REPLACE FUNCTION public.aliados_resumen()
RETURNS TABLE (aliado_id uuid, elegibles bigint, reclamados bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public._dn_exigir_admin();
  RETURN QUERY
  SELECT a.id,
         (SELECT count(*) FROM usuarios u WHERE u.role = 'cliente'
            AND public._dn_nivel_club(u.total_visitas_weibook) = ANY (a.niveles)),
         (SELECT count(*) FROM aliado_canjes c WHERE c.aliado_id = a.id)
  FROM aliados a;
END $$;
REVOKE ALL ON FUNCTION public.aliados_resumen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aliados_resumen() TO authenticated;
