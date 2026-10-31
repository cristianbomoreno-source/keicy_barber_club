-- Los aliados entran con usuario y clave en /aliados/ en lugar de un enlace privado.
-- - El admin define el usuario y la clave desde Fidelización → Alianzas. La clave
--   se guarda con bcrypt; al cambiarla se cierran las sesiones abiertas.
-- - Al entrar se crea una sesión de 30 días (solo se guarda el hash del token).
-- - Máximo 5 intentos fallidos cada 15 minutos por usuario.
-- - Las funciones aliado_info / aliado_clientes / aliado_marcar_reclamado /
--   aliado_deshacer_reclamado siguen igual: p_token ahora es el token de sesión.
-- Reemplaza el enlace de 20261020c (no se alcanzó a crear ninguna alianza).

DROP FUNCTION IF EXISTS public.aliado_generar_enlace(uuid);
ALTER TABLE public.aliados DROP COLUMN IF EXISTS token_hash;
ALTER TABLE public.aliados ADD COLUMN IF NOT EXISTS usuario text;
ALTER TABLE public.aliados ADD COLUMN IF NOT EXISTS clave_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS aliados_usuario_key ON public.aliados (lower(usuario));

-- El panel lee aliados con RLS: la clave nunca sale de la base
-- (permisos por columna; usuario y clave solo cambian con aliado_set_acceso)
REVOKE ALL ON public.aliados FROM anon, authenticated;
GRANT SELECT (id, nombre, beneficio, niveles, usuario, activo, vigente_hasta, created_at) ON public.aliados TO authenticated;
GRANT INSERT (nombre, beneficio, niveles, activo, vigente_hasta) ON public.aliados TO authenticated;
GRANT UPDATE (nombre, beneficio, niveles, activo, vigente_hasta) ON public.aliados TO authenticated;
GRANT DELETE ON public.aliados TO authenticated;

CREATE TABLE IF NOT EXISTS public.aliado_sesiones (
  token_hash text PRIMARY KEY,
  aliado_id uuid NOT NULL REFERENCES public.aliados(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);
CREATE INDEX IF NOT EXISTS aliado_sesiones_aliado_idx ON public.aliado_sesiones (aliado_id);
ALTER TABLE public.aliado_sesiones ENABLE ROW LEVEL SECURITY;  -- sin políticas: solo funciones

CREATE TABLE IF NOT EXISTS public.aliado_login_intentos (
  usuario text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aliado_login_intentos_idx ON public.aliado_login_intentos (usuario, created_at);
ALTER TABLE public.aliado_login_intentos ENABLE ROW LEVEL SECURITY;

-- Aliado dueño de la sesión (activo y vigente) o error ENLACE_INVALIDO
CREATE OR REPLACE FUNCTION public._dn_aliado_de_token(p_token text)
RETURNS public.aliados LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  a public.aliados;
BEGIN
  SELECT al.* INTO a
  FROM aliado_sesiones s JOIN aliados al ON al.id = s.aliado_id
  WHERE s.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    AND s.expires_at > now()
    AND al.activo
    AND (al.vigente_hasta IS NULL OR al.vigente_hasta >= (now() AT TIME ZONE 'America/Bogota')::date);
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'ENLACE_INVALIDO' USING ERRCODE = '28000';
  END IF;
  RETURN a;
END $$;
REVOKE ALL ON FUNCTION public._dn_aliado_de_token(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.aliado_login(p_usuario text, p_clave text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_usuario text := lower(trim(coalesce(p_usuario, '')));
  a public.aliados;
  v_token text;
BEGIN
  DELETE FROM aliado_login_intentos WHERE created_at < now() - interval '1 day';
  IF (SELECT count(*) FROM aliado_login_intentos
      WHERE usuario = v_usuario AND created_at > now() - interval '15 minutes') >= 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Demasiados intentos. Espera 15 minutos.');
  END IF;

  SELECT * INTO a FROM aliados WHERE lower(usuario) = v_usuario;
  IF a.id IS NULL OR a.clave_hash IS NULL OR extensions.crypt(coalesce(p_clave, ''), a.clave_hash) <> a.clave_hash THEN
    INSERT INTO aliado_login_intentos (usuario) VALUES (v_usuario);
    RETURN jsonb_build_object('success', false, 'error', 'Usuario o clave incorrectos');
  END IF;
  IF NOT a.activo OR (a.vigente_hasta IS NOT NULL AND a.vigente_hasta < (now() AT TIME ZONE 'America/Bogota')::date) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta alianza no está activa');
  END IF;

  DELETE FROM aliado_login_intentos WHERE usuario = v_usuario;
  DELETE FROM aliado_sesiones WHERE expires_at < now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO aliado_sesiones (token_hash, aliado_id)
  VALUES (encode(extensions.digest(v_token, 'sha256'), 'hex'), a.id);
  RETURN jsonb_build_object('success', true, 'token', v_token);
END $$;

CREATE OR REPLACE FUNCTION public.aliado_logout(p_token text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
  DELETE FROM aliado_sesiones WHERE token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

REVOKE ALL ON FUNCTION public.aliado_login(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aliado_logout(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aliado_login(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aliado_logout(text) TO anon, authenticated;

-- Admin: usuario y clave del aliado. p_clave NULL deja la clave actual.
CREATE OR REPLACE FUNCTION public.aliado_set_acceso(p_aliado_id uuid, p_usuario text, p_clave text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_usuario text := lower(trim(coalesce(p_usuario, '')));
BEGIN
  PERFORM public._dn_exigir_admin();
  IF v_usuario !~ '^[a-z0-9._-]{3,40}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El usuario debe tener de 3 a 40 letras, números, punto, guion o guion bajo, sin espacios');
  END IF;
  IF EXISTS (SELECT 1 FROM aliados WHERE lower(usuario) = v_usuario AND id <> p_aliado_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ese usuario ya existe');
  END IF;
  IF p_clave IS NOT NULL AND length(p_clave) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La clave debe tener al menos 6 caracteres');
  END IF;
  IF p_clave IS NULL AND NOT EXISTS (SELECT 1 FROM aliados WHERE id = p_aliado_id AND clave_hash IS NOT NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Escribe una clave');
  END IF;

  UPDATE aliados
  SET usuario = v_usuario,
      clave_hash = CASE WHEN p_clave IS NULL THEN clave_hash ELSE extensions.crypt(p_clave, extensions.gen_salt('bf')) END
  WHERE id = p_aliado_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aliado no encontrado');
  END IF;
  IF p_clave IS NOT NULL THEN
    DELETE FROM aliado_sesiones WHERE aliado_id = p_aliado_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'usuario', v_usuario);
END $$;
REVOKE ALL ON FUNCTION public.aliado_set_acceso(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aliado_set_acceso(uuid, text, text) TO authenticated;
