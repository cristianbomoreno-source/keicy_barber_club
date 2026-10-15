-- =====================================================================
-- Autenticación real del equipo con Supabase Auth (parte A, aditiva)
--
-- - Admin y admins de sede: su contraseña pasa a auth.users (bcrypt).
-- - Barberos/aseo: crean un PIN de 6 dígitos desde su sesión activa
--   (ventana de activación en usuarios.pin_activacion_hasta).
-- - El id de auth.users es el mismo de usuarios, así auth.uid() = usuarios.id.
-- - Máximo 2 sesiones (dispositivos) por persona del equipo.
-- - usuarios.password_hash deja de guardar contraseñas del equipo y los
--   PIN/contraseñas de clientes quedan cifrados con bcrypt.
-- =====================================================================

ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS pin_activacion_hasta timestamptz;

CREATE TABLE IF NOT EXISTS public.staff_auth_eventos (
  id bigserial PRIMARY KEY,
  usuario_id uuid REFERENCES public.usuarios(id) ON DELETE CASCADE,
  evento text NOT NULL,
  ip text,
  user_agent text,
  detalle jsonb,
  realizado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_auth_eventos_usuario_idx ON public.staff_auth_eventos (usuario_id, created_at DESC);
ALTER TABLE public.staff_auth_eventos ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- Helpers de rol (se usan en políticas RLS)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dn_es_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND role IN ('admin', 'admin_sede', 'barbero', 'aseo'));
$$;

CREATE OR REPLACE FUNCTION public.dn_es_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND role IN ('admin', 'admin_sede'));
$$;

-- ---------------------------------------------------------------------
-- Helpers internos (no expuestos a la API)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._dn_auth_email(p_id uuid)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT p_id::text || '@staff.keicybarberclub.com';
$$;

CREATE OR REPLACE FUNCTION public._dn_request_info()
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE h jsonb;
BEGIN
  BEGIN
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN others THEN h := NULL;
  END;
  RETURN jsonb_build_object(
    'ip', coalesce(h->>'cf-connecting-ip', split_part(h->>'x-forwarded-for', ',', 1), h->>'x-real-ip'),
    'ua', h->>'user-agent'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._dn_log_auth(p_usuario uuid, p_evento text, p_detalle jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r jsonb := _dn_request_info();
BEGIN
  INSERT INTO staff_auth_eventos (usuario_id, evento, ip, user_agent, detalle, realizado_por)
  VALUES (p_usuario, p_evento, r->>'ip', r->>'ua', p_detalle, auth.uid());
END;
$$;

-- Crea o actualiza la cuenta de Supabase Auth de un usuario del equipo.
CREATE OR REPLACE FUNCTION public._dn_set_auth_password(p_id uuid, p_clave text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_hash text := CASE WHEN p_clave ~ '^\$2[aby]\$' THEN p_clave ELSE extensions.crypt(p_clave, extensions.gen_salt('bf', 10)) END;
  v_email text := _dn_auth_email(p_id);
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = p_id) THEN
    UPDATE auth.users SET encrypted_password = v_hash, updated_at = now(), banned_until = NULL WHERE id = p_id;
  ELSE
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token,
      is_sso_user, is_anonymous
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', v_email, v_hash, now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
      '', '', '', '', '', '', '', '', false, false
    );
    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (p_id::text, p_id,
            jsonb_build_object('sub', p_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
            'email', now(), now(), now());
  END IF;
END;
$$;

-- Borra la cuenta de Auth (y con ella sus sesiones).
CREATE OR REPLACE FUNCTION public._dn_borrar_auth(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  DELETE FROM auth.users WHERE id = p_id;
END;
$$;

-- ---------------------------------------------------------------------
-- Trigger: nunca guardar claves en usuarios
--  * admin/admin_sede: la clave escrita en password_hash se pasa a Auth
--  * barbero/aseo: usan PIN propio; al crearse o cambiar de rol se abre la
--    ventana para que creen su PIN
--  * clientes: contraseña y PIN se guardan cifrados con bcrypt
--  * quien deja de ser del equipo pierde su cuenta de Auth
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._dn_usuarios_credenciales()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_rol_anterior text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.role END;
BEGIN
  IF NEW.role IN ('admin', 'admin_sede') THEN
    IF NEW.password_hash IS NOT NULL AND NEW.password_hash <> '' THEN
      PERFORM _dn_set_auth_password(NEW.id, NEW.password_hash);
      PERFORM _dn_log_auth(NEW.id, 'clave_asignada');
    END IF;
    NEW.password_hash := NULL;
  ELSIF NEW.role IN ('barbero', 'aseo') THEN
    NEW.password_hash := NULL;
    IF TG_OP = 'INSERT' OR v_rol_anterior IS DISTINCT FROM NEW.role THEN
      PERFORM _dn_borrar_auth(NEW.id);
      NEW.pin_activacion_hasta := now() + interval '7 days';
    END IF;
  ELSE
    IF v_rol_anterior IN ('admin', 'admin_sede', 'barbero', 'aseo') THEN
      PERFORM _dn_borrar_auth(NEW.id);
      NEW.pin_activacion_hasta := NULL;
    END IF;
    IF NEW.password_hash IS NOT NULL AND NEW.password_hash <> '' AND NEW.password_hash !~ '^\$2[aby]\$' THEN
      NEW.password_hash := extensions.crypt(NEW.password_hash, extensions.gen_salt('bf', 10));
    END IF;
  END IF;

  IF NEW.pin_cliente IS NOT NULL AND NEW.pin_cliente <> '' AND NEW.pin_cliente !~ '^\$2[aby]\$' THEN
    NEW.pin_cliente := extensions.crypt(NEW.pin_cliente, extensions.gen_salt('bf', 10));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usuarios_credenciales ON public.usuarios;
CREATE TRIGGER trg_usuarios_credenciales
  BEFORE INSERT OR UPDATE OF password_hash, role, pin_cliente ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public._dn_usuarios_credenciales();

-- ---------------------------------------------------------------------
-- Login del equipo
-- ---------------------------------------------------------------------

-- Busca el usuario por usuario, correo o teléfono y dice cómo debe entrar.
CREATE OR REPLACE FUNCTION public.dn_login_resolver(p_identificador text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ident text := trim(coalesce(p_identificador, ''));
  v_digits text := regexp_replace(v_ident, '\D', '', 'g');
  v_phone text;
  u record;
  v_tiene_auth boolean;
  v_activo boolean;
BEGIN
  IF length(v_ident) < 3 THEN
    RETURN jsonb_build_object('encontrado', false);
  END IF;
  v_phone := CASE WHEN length(v_digits) = 12 AND v_digits LIKE '57%' THEN '+' || v_digits ELSE '+57' || v_digits END;

  SELECT * INTO u FROM usuarios WHERE username = v_ident LIMIT 1;
  IF NOT FOUND THEN SELECT * INTO u FROM usuarios WHERE lower(username) = lower(v_ident) ORDER BY role <> 'cliente' DESC LIMIT 1; END IF;
  IF NOT FOUND THEN SELECT * INTO u FROM usuarios WHERE lower(email) = lower(v_ident) ORDER BY role <> 'cliente' DESC LIMIT 1; END IF;
  IF NOT FOUND AND length(v_digits) >= 7 THEN SELECT * INTO u FROM usuarios WHERE phone = v_phone ORDER BY role <> 'cliente' DESC LIMIT 1; END IF;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('encontrado', false);
  END IF;

  IF u.role NOT IN ('admin', 'admin_sede', 'barbero', 'aseo') THEN
    RETURN jsonb_build_object('encontrado', true, 'role', u.role);
  END IF;

  IF u.role IN ('barbero', 'aseo') THEN
    SELECT activo INTO v_activo FROM barberos WHERE id = u.id;
    IF v_activo = false THEN
      RETURN jsonb_build_object('encontrado', true, 'role', u.role, 'bloqueado', true,
        'mensaje', 'Tu cuenta está desactivada. Habla con el administrador.');
    END IF;
  END IF;

  v_tiene_auth := EXISTS (SELECT 1 FROM auth.users WHERE id = u.id);
  IF v_tiene_auth THEN
    RETURN jsonb_build_object('encontrado', true, 'role', u.role, 'email_auth', _dn_auth_email(u.id),
      'metodo', CASE WHEN u.role IN ('barbero', 'aseo') THEN 'pin' ELSE 'clave' END);
  END IF;

  IF u.role IN ('barbero', 'aseo') AND u.pin_activacion_hasta > now() THEN
    RETURN jsonb_build_object('encontrado', true, 'role', u.role, 'requiere_crear_pin', true,
      'usuario_id', u.id, 'nombre', u.full_name);
  END IF;

  RETURN jsonb_build_object('encontrado', true, 'role', u.role, 'bloqueado', true,
    'mensaje', CASE WHEN u.role IN ('barbero', 'aseo')
      THEN 'Tu PIN no está activo. Pide al administrador que lo reinicie.'
      ELSE 'Tu acceso no está activo. Pide al administrador que te asigne una contraseña.' END);
END;
$$;

-- El barbero crea su PIN (solo si no tiene cuenta y la ventana está abierta).
CREATE OR REPLACE FUNCTION public.dn_crear_pin_staff(p_usuario_id uuid, p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u record;
BEGIN
  IF p_pin IS NULL OR p_pin !~ '^\d{6}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El PIN debe tener 6 dígitos.');
  END IF;
  IF p_pin ~ '^(\d)\1{5}$' OR p_pin IN ('123456', '654321', '012345', '543210', '123123', '121212') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ese PIN es muy fácil de adivinar. Elige otro.');
  END IF;

  SELECT * INTO u FROM usuarios WHERE id = p_usuario_id FOR UPDATE;
  IF NOT FOUND OR u.role NOT IN ('barbero', 'aseo') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario no válido.');
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = u.id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes un PIN. Entra con tu usuario y PIN.');
  END IF;
  IF u.pin_activacion_hasta IS NULL OR u.pin_activacion_hasta <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'El tiempo para crear tu PIN venció. Pide al administrador que lo reinicie.');
  END IF;

  PERFORM _dn_set_auth_password(u.id, p_pin);
  UPDATE usuarios SET pin_activacion_hasta = NULL WHERE id = u.id;
  PERFORM _dn_log_auth(u.id, 'pin_creado');
  RETURN jsonb_build_object('success', true, 'email_auth', _dn_auth_email(u.id));
END;
$$;

-- Después de iniciar sesión: limita a 2 dispositivos, registra y devuelve el perfil.
CREATE OR REPLACE FUNCTION public.dn_post_login()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sid uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
  v_cerradas int := 0;
  u record;
BEGIN
  SELECT id, username, email, phone, role, full_name, avatar_url INTO u FROM usuarios WHERE id = v_uid;
  IF v_uid IS NULL OR NOT FOUND OR u.role NOT IN ('admin', 'admin_sede', 'barbero', 'aseo') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  WITH conservar AS (
    SELECT id FROM auth.sessions
    WHERE user_id = v_uid AND id IS DISTINCT FROM v_sid
    ORDER BY coalesce(refreshed_at::timestamptz, updated_at, created_at) DESC
    LIMIT 1
  ), borradas AS (
    DELETE FROM auth.sessions s
    WHERE s.user_id = v_uid AND s.id IS DISTINCT FROM v_sid AND s.id NOT IN (SELECT id FROM conservar)
    RETURNING 1
  )
  SELECT count(*) INTO v_cerradas FROM borradas;

  PERFORM _dn_log_auth(v_uid, 'login', jsonb_build_object('sesiones_cerradas', v_cerradas));
  RETURN to_jsonb(u);
END;
$$;

-- Cambiar mi propia clave o PIN.
CREATE OR REPLACE FUNCTION public.dn_cambiar_mi_clave(p_actual text, p_nueva text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_hash text;
BEGIN
  SELECT role INTO v_role FROM usuarios WHERE id = v_uid;
  SELECT encrypted_password INTO v_hash FROM auth.users WHERE id = v_uid;
  IF v_uid IS NULL OR v_hash IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sesión no válida. Vuelve a iniciar sesión.');
  END IF;
  IF extensions.crypt(coalesce(p_actual, ''), v_hash) <> v_hash THEN
    RETURN jsonb_build_object('success', false, 'error', CASE WHEN v_role IN ('barbero', 'aseo') THEN 'El PIN actual no es correcto.' ELSE 'La contraseña actual no es correcta.' END);
  END IF;
  IF v_role IN ('barbero', 'aseo') THEN
    IF p_nueva IS NULL OR p_nueva !~ '^\d{6}$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'El PIN debe tener 6 dígitos.');
    END IF;
    IF p_nueva ~ '^(\d)\1{5}$' OR p_nueva IN ('123456', '654321', '012345', '543210', '123123', '121212') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ese PIN es muy fácil de adivinar. Elige otro.');
    END IF;
  ELSIF p_nueva IS NULL OR length(p_nueva) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La contraseña debe tener al menos 6 caracteres.');
  END IF;
  PERFORM _dn_set_auth_password(v_uid, p_nueva);
  PERFORM _dn_log_auth(v_uid, 'clave_cambiada');
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ---------------------------------------------------------------------
-- Administración del equipo (solo admin / admin de sede con sesión real)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dn_staff_reiniciar_pin(p_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_role text;
BEGIN
  IF NOT dn_es_admin() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  SELECT role INTO v_role FROM usuarios WHERE id = p_usuario_id;
  IF v_role NOT IN ('barbero', 'aseo') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo se puede reiniciar el PIN de barberos.');
  END IF;
  PERFORM _dn_borrar_auth(p_usuario_id);
  UPDATE usuarios SET pin_activacion_hasta = now() + interval '2 days' WHERE id = p_usuario_id;
  PERFORM _dn_log_auth(p_usuario_id, 'pin_reiniciado');
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.dn_sesiones_activas()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT dn_es_admin() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(x ORDER BY x->>'orden', x->>'nombre')
    FROM (
      SELECT jsonb_build_object(
        'usuario_id', u.id,
        'nombre', coalesce(u.full_name, u.username),
        'username', u.username,
        'role', u.role,
        'orden', CASE u.role WHEN 'admin' THEN '1' WHEN 'admin_sede' THEN '2' ELSE '3' END,
        'sede', (SELECT s.nombre FROM barberos b JOIN sucursales s ON s.id = b.sucursal_id WHERE b.id = u.id),
        'activo', coalesce((SELECT b.activo FROM barberos b WHERE b.id = u.id), true),
        'tiene_acceso', EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.id),
        'pin_activacion_hasta', u.pin_activacion_hasta,
        'ultimo_ingreso', (SELECT au.last_sign_in_at FROM auth.users au WHERE au.id = u.id),
        'pin_creado', (SELECT jsonb_build_object('fecha', e.created_at, 'ip', e.ip, 'user_agent', e.user_agent)
                       FROM staff_auth_eventos e WHERE e.usuario_id = u.id AND e.evento = 'pin_creado'
                       ORDER BY e.created_at DESC LIMIT 1),
        'sesiones', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'id', s.id,
                   'creada', s.created_at,
                   'ultima_actividad', coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at),
                   'ip', host(s.ip),
                   'user_agent', s.user_agent)
                 ORDER BY coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at) DESC)
          FROM auth.sessions s
          WHERE s.user_id = u.id AND (s.not_after IS NULL OR s.not_after > now())
        ), '[]'::jsonb)
      ) AS x
      FROM usuarios u
      WHERE u.role IN ('admin', 'admin_sede', 'barbero', 'aseo')
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.dn_cerrar_sesion(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid;
BEGIN
  IF NOT dn_es_admin() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  DELETE FROM auth.sessions WHERE id = p_session_id RETURNING user_id INTO v_user;
  IF v_user IS NOT NULL THEN
    PERFORM _dn_log_auth(v_user, 'sesion_cerrada', jsonb_build_object('session_id', p_session_id));
  END IF;
  RETURN jsonb_build_object('success', v_user IS NOT NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.dn_cerrar_sesiones_usuario(p_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n int;
BEGIN
  IF NOT dn_es_admin() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  WITH d AS (DELETE FROM auth.sessions WHERE user_id = p_usuario_id RETURNING 1) SELECT count(*) INTO v_n FROM d;
  PERFORM _dn_log_auth(p_usuario_id, 'sesiones_cerradas', jsonb_build_object('cantidad', v_n));
  RETURN jsonb_build_object('success', true, 'cerradas', v_n);
END;
$$;

-- Funciones que el panel ya llamaba pero no existían en la base.
CREATE OR REPLACE FUNCTION public.crear_cuenta_admin(p_username text, p_password text)
RETURNS TABLE (id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.role = 'admin') THEN
    RAISE EXCEPTION 'Solo el administrador principal puede crear administradores' USING ERRCODE = '42501';
  END IF;
  IF length(coalesce(p_password, '')) < 6 THEN RAISE EXCEPTION 'La clave debe tener al menos 6 caracteres'; END IF;
  IF EXISTS (SELECT 1 FROM usuarios u WHERE u.username = p_username) THEN RAISE EXCEPTION 'Ese nombre de usuario ya existe'; END IF;
  INSERT INTO usuarios (username, full_name, role, password_hash)
  VALUES (p_username, p_username, 'admin', p_password)
  RETURNING usuarios.id INTO v_id;
  RETURN QUERY SELECT v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_cuenta_barbero(p_username text, p_password text DEFAULT NULL, p_full_name text DEFAULT NULL,
                                                       p_especialidad text DEFAULT NULL, p_codigo_invitacion text DEFAULT NULL)
RETURNS TABLE (id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE v_id uuid;
BEGIN
  IF NOT dn_es_admin() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM usuarios u WHERE u.username = p_username) THEN RAISE EXCEPTION 'Ese nombre de usuario ya existe'; END IF;
  -- La clave no se usa: el barbero crea su propio PIN la primera vez que entra.
  INSERT INTO usuarios (username, full_name, role)
  VALUES (p_username, coalesce(nullif(p_full_name, ''), p_username), 'barbero')
  RETURNING usuarios.id INTO v_id;
  INSERT INTO barberos (id, especialidad) VALUES (v_id, p_especialidad);
  RETURN QUERY SELECT v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_barbero_completo(p_barbero_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT dn_es_admin() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  DELETE FROM barberos WHERE id = p_barbero_id;
  DELETE FROM usuarios WHERE id = p_barbero_id;
  PERFORM _dn_borrar_auth(p_barbero_id);
END;
$$;

-- actualizar_colaborador: el permiso sale de la sesión real, no de un parámetro.
CREATE OR REPLACE FUNCTION public.actualizar_colaborador(p_caller_id uuid, p_usuario_id uuid, p_username text, p_password text DEFAULT NULL,
                                                         p_full_name text DEFAULT NULL, p_instagram text DEFAULT NULL, p_avatar_url text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT dn_es_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes permisos para esta acción');
  END IF;
  IF EXISTS (SELECT 1 FROM usuarios WHERE username = p_username AND id <> p_usuario_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ese nombre de usuario ya existe');
  END IF;
  UPDATE usuarios SET
    username = coalesce(p_username, username),
    full_name = coalesce(p_full_name, full_name),
    instagram = p_instagram,
    avatar_url = coalesce(p_avatar_url, avatar_url),
    password_hash = CASE WHEN p_password IS NOT NULL AND p_password <> '' THEN p_password ELSE password_hash END
  WHERE id = p_usuario_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ---------------------------------------------------------------------
-- Clientes: login y registro con contraseña desde el servidor; PIN cifrado
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dn_cliente_login_clave(p_identificador text, p_clave text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_ident text := trim(coalesce(p_identificador, ''));
  v_digits text := regexp_replace(v_ident, '\D', '', 'g');
  v_phone text := CASE WHEN length(v_digits) = 12 AND v_digits LIKE '57%' THEN '+' || v_digits ELSE '+57' || v_digits END;
  u record;
BEGIN
  SELECT * INTO u FROM usuarios WHERE role = 'cliente' AND (username = v_ident OR lower(email) = lower(v_ident) OR phone = v_phone)
  ORDER BY password_hash IS NULL LIMIT 1;
  IF NOT FOUND OR u.password_hash IS NULL OR extensions.crypt(coalesce(p_clave, ''), u.password_hash) <> u.password_hash THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario o clave incorrectos.');
  END IF;
  RETURN jsonb_build_object('success', true, 'usuario', jsonb_build_object(
    'id', u.id, 'username', u.username, 'email', u.email, 'phone', u.phone,
    'role', u.role, 'full_name', u.full_name, 'avatar_url', u.avatar_url));
END;
$$;

CREATE OR REPLACE FUNCTION public.dn_cliente_registro(p_telefono text, p_clave text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_digits text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_phone text;
  v_username text;
  v_id uuid;
  u record;
BEGIN
  IF length(v_digits) < 10 THEN RETURN jsonb_build_object('success', false, 'error', 'Ingresa un número de celular válido (10 dígitos).'); END IF;
  IF length(coalesce(p_clave, '')) < 6 THEN RETURN jsonb_build_object('success', false, 'error', 'La contraseña debe tener al menos 6 caracteres.'); END IF;
  v_phone := CASE WHEN v_digits LIKE '57%' AND length(v_digits) = 12 THEN '+' || v_digits ELSE '+57' || v_digits END;
  v_username := 'cliente' || right(v_digits, 6) || floor(random() * 100)::int;

  SELECT * INTO u FROM usuarios WHERE phone = v_phone LIMIT 1;
  IF FOUND THEN
    IF u.role <> 'cliente' OR coalesce(u.password_hash, '') <> '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ya tienes una cuenta. Usa "Iniciar sesión" con tu celular.');
    END IF;
    v_id := u.id;
    UPDATE usuarios SET username = v_username, password_hash = p_clave WHERE id = v_id;
  ELSE
    INSERT INTO usuarios (username, phone, password_hash, role) VALUES (v_username, v_phone, p_clave, 'cliente') RETURNING id INTO v_id;
  END IF;

  SELECT id, username, email, phone, role, full_name, avatar_url INTO u FROM usuarios WHERE id = v_id;
  RETURN jsonb_build_object('success', true, 'usuario', to_jsonb(u));
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_pin_cliente(p_telefono text, p_codigo_pais text, p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_telefono_normalizado TEXT;
  v_usuario RECORD;
BEGIN
  v_telefono_normalizado := regexp_replace(p_telefono, '[^0-9]', '', 'g');

  SELECT id, full_name, phone, email, avatar_url,
         total_visitas_weibook, total_gastado_weibook, ultima_visita_weibook,
         lealtad_info, membership_tier, created_at, pin_cliente
  INTO v_usuario
  FROM usuarios
  WHERE role = 'cliente'
    AND (
      phone = v_telefono_normalizado
      OR phone = p_codigo_pais || v_telefono_normalizado
      OR phone LIKE '%' || v_telefono_normalizado
      OR regexp_replace(phone, '[^0-9]', '', 'g') = v_telefono_normalizado
      OR regexp_replace(phone, '[^0-9]', '', 'g') = p_codigo_pais || v_telefono_normalizado
    )
  ORDER BY total_visitas_weibook DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No encontramos tu número. Visítanos para registrarte.', 'code', 'NOT_FOUND');
  END IF;

  IF v_usuario.pin_cliente IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes crear tu PIN', 'code', 'NO_PIN',
                              'usuario_id', v_usuario.id, 'nombre', v_usuario.full_name);
  END IF;

  IF extensions.crypt(coalesce(p_pin, ''), v_usuario.pin_cliente) <> v_usuario.pin_cliente THEN
    RETURN jsonb_build_object('success', false, 'error', 'PIN incorrecto', 'code', 'INVALID_PIN');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'usuario', jsonb_build_object(
      'id', v_usuario.id,
      'full_name', v_usuario.full_name,
      'phone', v_usuario.phone,
      'email', v_usuario.email,
      'avatar_url', v_usuario.avatar_url,
      'total_visitas', COALESCE(v_usuario.total_visitas_weibook, 0),
      'total_gastado', COALESCE(v_usuario.total_gastado_weibook, 0),
      'ultima_visita', v_usuario.ultima_visita_weibook,
      'lealtad_info', v_usuario.lealtad_info,
      'membership_tier', v_usuario.membership_tier,
      'cliente_desde', v_usuario.created_at
    )
  );
END;
$$;

-- crear_pin_cliente: ya no permite reemplazar el PIN de alguien que ya tiene uno.
CREATE OR REPLACE FUNCTION public.crear_pin_cliente(p_cliente_id uuid, p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_pin IS NULL OR p_pin !~ '^\d{4}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El PIN debe ser de 4 dígitos numéricos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = p_cliente_id AND role = 'cliente') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente no encontrado');
  END IF;
  IF EXISTS (SELECT 1 FROM usuarios WHERE id = p_cliente_id AND pin_cliente IS NOT NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes un PIN. Ingresa con él.');
  END IF;
  UPDATE usuarios SET pin_cliente = p_pin WHERE id = p_cliente_id;
  RETURN jsonb_build_object('success', true, 'mensaje', 'PIN creado exitosamente');
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_pin_cliente(p_cliente_id uuid, p_pin text, p_acepto_politica boolean DEFAULT false, p_version_politica text DEFAULT '1.0')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT p_acepto_politica THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes aceptar la política de tratamiento de datos');
  END IF;
  IF p_pin IS NULL OR p_pin !~ '^\d{4}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El PIN debe ser de 4 dígitos numéricos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = p_cliente_id AND role = 'cliente') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente no encontrado');
  END IF;
  IF EXISTS (SELECT 1 FROM usuarios WHERE id = p_cliente_id AND pin_cliente IS NOT NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes un PIN. Ingresa con él.');
  END IF;
  UPDATE usuarios
  SET pin_cliente = p_pin, acepto_politica_datos_at = NOW(), acepto_politica_datos_version = p_version_politica
  WHERE id = p_cliente_id;
  RETURN jsonb_build_object('success', true, 'mensaje', 'PIN creado exitosamente');
END;
$$;

-- ---------------------------------------------------------------------
-- Migración de datos
-- ---------------------------------------------------------------------
-- Admins: su clave actual pasa a Auth (el trigger la cifra y vacía password_hash).
UPDATE public.usuarios SET password_hash = password_hash
WHERE role IN ('admin', 'admin_sede') AND password_hash IS NOT NULL AND password_hash <> '';

-- Barberos: crean su PIN en los próximos 7 días.
UPDATE public.usuarios SET password_hash = NULL, pin_activacion_hasta = now() + interval '7 days'
WHERE role IN ('barbero', 'aseo');

-- Clientes: cifrar PIN y contraseñas que estuvieran en texto plano.
UPDATE public.usuarios SET pin_cliente = pin_cliente WHERE pin_cliente IS NOT NULL AND pin_cliente !~ '^\$2[aby]\$';
UPDATE public.usuarios SET password_hash = password_hash
WHERE role = 'cliente' AND password_hash IS NOT NULL AND password_hash <> '' AND password_hash !~ '^\$2[aby]\$';

-- Credenciales de WeiBook (la sincronización está apagada).
DELETE FROM public.app_config WHERE key IN ('weibook_email', 'weibook_password', 'weibook_token');

-- ---------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._dn_auth_email(uuid), public._dn_request_info(), public._dn_log_auth(uuid, text, jsonb),
  public._dn_set_auth_password(uuid, text), public._dn_borrar_auth(uuid), public._dn_usuarios_credenciales()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.dn_post_login(), public.dn_cambiar_mi_clave(text, text), public.dn_staff_reiniciar_pin(uuid),
  public.dn_sesiones_activas(), public.dn_cerrar_sesion(uuid), public.dn_cerrar_sesiones_usuario(uuid),
  public.crear_cuenta_admin(text, text), public.crear_cuenta_barbero(text, text, text, text, text),
  public.eliminar_barbero_completo(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dn_post_login(), public.dn_cambiar_mi_clave(text, text), public.dn_staff_reiniciar_pin(uuid),
  public.dn_sesiones_activas(), public.dn_cerrar_sesion(uuid), public.dn_cerrar_sesiones_usuario(uuid),
  public.crear_cuenta_admin(text, text), public.crear_cuenta_barbero(text, text, text, text, text),
  public.eliminar_barbero_completo(uuid)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.dn_login_resolver(text), public.dn_crear_pin_staff(uuid, text),
  public.dn_cliente_login_clave(text, text), public.dn_cliente_registro(text, text),
  public.dn_es_staff(), public.dn_es_admin()
  TO anon, authenticated;
