-- =====================================================================
-- Secretos de clientes fuera de la tabla usuarios
--
-- usuarios es legible por la API (reservas, panel), así que no debe guardar
-- contraseñas ni PIN. Se mueven a usuarios_credenciales, sin acceso desde la
-- API. Las columnas usuarios.password_hash y usuarios.pin_cliente quedan solo
-- como "buzón de escritura": el trigger cifra lo que llegue, lo guarda aquí
-- (o en Supabase Auth si es del equipo) y las deja en NULL.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.usuarios_credenciales (
  usuario_id uuid PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  password_hash text,
  pin_cliente text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.usuarios_credenciales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.usuarios_credenciales FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._dn_usuarios_credenciales()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_rol_anterior text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.role END;
  v_hash text;
BEGIN
  IF NEW.role IN ('admin', 'admin_sede') THEN
    IF NEW.password_hash IS NOT NULL AND NEW.password_hash <> '' THEN
      PERFORM _dn_set_auth_password(NEW.id, NEW.password_hash);
      PERFORM _dn_log_auth(NEW.id, 'clave_asignada');
    END IF;
  ELSIF NEW.role IN ('barbero', 'aseo') THEN
    IF TG_OP = 'INSERT' OR v_rol_anterior IS DISTINCT FROM NEW.role THEN
      PERFORM _dn_borrar_auth(NEW.id);
      NEW.pin_activacion_hasta := now() + interval '7 days';
    END IF;
  ELSE
    IF v_rol_anterior IN ('admin', 'admin_sede', 'barbero', 'aseo') THEN
      PERFORM _dn_borrar_auth(NEW.id);
      NEW.pin_activacion_hasta := NULL;
    END IF;
    IF NEW.password_hash IS NOT NULL AND NEW.password_hash <> '' THEN
      v_hash := CASE WHEN NEW.password_hash ~ '^\$2[aby]\$' THEN NEW.password_hash
                     ELSE extensions.crypt(NEW.password_hash, extensions.gen_salt('bf', 10)) END;
      INSERT INTO usuarios_credenciales (usuario_id, password_hash) VALUES (NEW.id, v_hash)
      ON CONFLICT (usuario_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now();
    END IF;
  END IF;

  IF NEW.pin_cliente IS NOT NULL AND NEW.pin_cliente <> '' THEN
    v_hash := CASE WHEN NEW.pin_cliente ~ '^\$2[aby]\$' THEN NEW.pin_cliente
                   ELSE extensions.crypt(NEW.pin_cliente, extensions.gen_salt('bf', 10)) END;
    INSERT INTO usuarios_credenciales (usuario_id, pin_cliente) VALUES (NEW.id, v_hash)
    ON CONFLICT (usuario_id) DO UPDATE SET pin_cliente = EXCLUDED.pin_cliente, updated_at = now();
  END IF;

  NEW.password_hash := NULL;
  NEW.pin_cliente := NULL;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.buscar_cliente_login(p_telefono text, p_codigo_pais text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_telefono_normalizado TEXT;
  v_usuario RECORD;
BEGIN
  v_telefono_normalizado := regexp_replace(p_telefono, '[^0-9]', '', 'g');

  SELECT u.id, u.full_name, u.avatar_url, c.pin_cliente
  INTO v_usuario
  FROM usuarios u
  LEFT JOIN usuarios_credenciales c ON c.usuario_id = u.id
  WHERE u.role = 'cliente'
    AND (
      u.phone = v_telefono_normalizado
      OR u.phone = p_codigo_pais || v_telefono_normalizado
      OR u.phone LIKE '%' || v_telefono_normalizado
      OR regexp_replace(u.phone, '[^0-9]', '', 'g') = v_telefono_normalizado
      OR regexp_replace(u.phone, '[^0-9]', '', 'g') = p_codigo_pais || v_telefono_normalizado
    )
  ORDER BY u.total_visitas_weibook DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('encontrado', false, 'mensaje', 'No encontramos tu número en Club de Leales');
  END IF;

  RETURN jsonb_build_object(
    'encontrado', true,
    'tiene_pin', v_usuario.pin_cliente IS NOT NULL,
    'id', v_usuario.id,
    'nombre', v_usuario.full_name,
    'avatar_url', v_usuario.avatar_url
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_pin_cliente(p_telefono text, p_codigo_pais text, p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_telefono_normalizado TEXT;
  v_usuario RECORD;
BEGIN
  v_telefono_normalizado := regexp_replace(p_telefono, '[^0-9]', '', 'g');

  SELECT u.id, u.full_name, u.phone, u.email, u.avatar_url,
         u.total_visitas_weibook, u.total_gastado_weibook, u.ultima_visita_weibook,
         u.lealtad_info, u.membership_tier, u.created_at, c.pin_cliente
  INTO v_usuario
  FROM usuarios u
  LEFT JOIN usuarios_credenciales c ON c.usuario_id = u.id
  WHERE u.role = 'cliente'
    AND (
      u.phone = v_telefono_normalizado
      OR u.phone = p_codigo_pais || v_telefono_normalizado
      OR u.phone LIKE '%' || v_telefono_normalizado
      OR regexp_replace(u.phone, '[^0-9]', '', 'g') = v_telefono_normalizado
      OR regexp_replace(u.phone, '[^0-9]', '', 'g') = p_codigo_pais || v_telefono_normalizado
    )
  ORDER BY u.total_visitas_weibook DESC NULLS LAST
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

CREATE OR REPLACE FUNCTION public.crear_pin_cliente(p_cliente_id uuid, p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_pin IS NULL OR p_pin !~ '^\d{4}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El PIN debe ser de 4 dígitos numéricos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = p_cliente_id AND role = 'cliente') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente no encontrado');
  END IF;
  IF EXISTS (SELECT 1 FROM usuarios_credenciales WHERE usuario_id = p_cliente_id AND pin_cliente IS NOT NULL) THEN
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
  IF EXISTS (SELECT 1 FROM usuarios_credenciales WHERE usuario_id = p_cliente_id AND pin_cliente IS NOT NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes un PIN. Ingresa con él.');
  END IF;
  UPDATE usuarios
  SET pin_cliente = p_pin, acepto_politica_datos_at = NOW(), acepto_politica_datos_version = p_version_politica
  WHERE id = p_cliente_id;
  RETURN jsonb_build_object('success', true, 'mensaje', 'PIN creado exitosamente');
END;
$$;

CREATE OR REPLACE FUNCTION public.dn_cliente_login_clave(p_identificador text, p_clave text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_ident text := trim(coalesce(p_identificador, ''));
  v_digits text := regexp_replace(v_ident, '\D', '', 'g');
  v_phone text := CASE WHEN length(v_digits) = 12 AND v_digits LIKE '57%' THEN '+' || v_digits ELSE '+57' || v_digits END;
  u record;
BEGIN
  SELECT us.id, us.username, us.email, us.phone, us.role, us.full_name, us.avatar_url, c.password_hash
  INTO u
  FROM usuarios us
  LEFT JOIN usuarios_credenciales c ON c.usuario_id = us.id
  WHERE us.role = 'cliente' AND (us.username = v_ident OR lower(us.email) = lower(v_ident) OR us.phone = v_phone)
  ORDER BY c.password_hash IS NULL LIMIT 1;
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
    IF u.role <> 'cliente' OR EXISTS (SELECT 1 FROM usuarios_credenciales WHERE usuario_id = u.id AND password_hash IS NOT NULL) THEN
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

-- Mover los secretos existentes y vaciar las columnas de usuarios
INSERT INTO public.usuarios_credenciales (usuario_id, password_hash, pin_cliente)
SELECT id, CASE WHEN role = 'cliente' THEN nullif(password_hash, '') END, nullif(pin_cliente, '')
FROM public.usuarios
WHERE (role = 'cliente' AND coalesce(password_hash, '') <> '') OR coalesce(pin_cliente, '') <> ''
ON CONFLICT (usuario_id) DO UPDATE SET
  password_hash = coalesce(EXCLUDED.password_hash, usuarios_credenciales.password_hash),
  pin_cliente = coalesce(EXCLUDED.pin_cliente, usuarios_credenciales.pin_cliente);

ALTER TABLE public.usuarios DISABLE TRIGGER trg_usuarios_credenciales;
UPDATE public.usuarios SET pin_cliente = NULL WHERE pin_cliente IS NOT NULL;
UPDATE public.usuarios SET password_hash = NULL WHERE role = 'cliente' AND password_hash IS NOT NULL;
ALTER TABLE public.usuarios ENABLE TRIGGER trg_usuarios_credenciales;
