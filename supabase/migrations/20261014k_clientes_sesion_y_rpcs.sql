-- 14-oct-2026 · Parte 1 de 2: sesión de clientes y funciones públicas
--
-- Con la clave pública cualquiera podía leer citas, usuarios (17.8k clientes:
-- nombre, celular, correo) y reseñas, y modificar citas y clientes. Las páginas
-- públicas (club, reservar, cancelar, confirmar, recibo, reseña) leían las tablas
-- directamente. Esta migración crea las funciones que esas páginas usan en su
-- lugar; la parte 2 (20261014l) cierra las tablas cuando el código ya está
-- desplegado.
--
-- - Los clientes reciben un token de sesión al entrar (PIN o clave) y las
--   funciones del club solo devuelven/modifican los datos del dueño del token.
-- - Máximo 5 intentos fallidos de PIN/clave cada 15 minutos por número.
-- - Reservar/cancelar/confirmar/recibo/reseña reciben solo lo necesario.

-- ============================================================
-- Sesiones de cliente
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cliente_sesiones (
  token_hash text PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '90 days'
);
CREATE INDEX IF NOT EXISTS cliente_sesiones_cliente_idx ON public.cliente_sesiones (cliente_id);
ALTER TABLE public.cliente_sesiones ENABLE ROW LEVEL SECURITY;  -- sin políticas: solo funciones

CREATE TABLE IF NOT EXISTS public.cliente_login_intentos (
  clave text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cliente_login_intentos_idx ON public.cliente_login_intentos (clave, created_at);
ALTER TABLE public.cliente_login_intentos ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._dn_cliente_nuevo_token(p_cliente_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
BEGIN
  DELETE FROM cliente_sesiones WHERE expires_at < now();
  INSERT INTO cliente_sesiones (token_hash, cliente_id)
  VALUES (encode(extensions.digest(v_token, 'sha256'), 'hex'), p_cliente_id);
  RETURN v_token;
END;
$$;

-- Devuelve el cliente dueño del token o lanza SESION_INVALIDA
CREATE OR REPLACE FUNCTION public._dn_cliente_de_token(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE cliente_sesiones
  SET last_used_at = now(), expires_at = greatest(expires_at, now() + interval '90 days')
  WHERE token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    AND expires_at > now()
  RETURNING cliente_id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'SESION_INVALIDA' USING ERRCODE = '28000';
  END IF;
  RETURN v_id;
END;
$$;

-- Límite de intentos fallidos (5 en 15 minutos por número/usuario)
CREATE OR REPLACE FUNCTION public._dn_login_bloqueado(p_clave text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT count(*) >= 5 FROM cliente_login_intentos
  WHERE clave = p_clave AND created_at > now() - interval '15 minutes';
$$;

CREATE OR REPLACE FUNCTION public._dn_login_fallo(p_clave text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  DELETE FROM cliente_login_intentos WHERE created_at < now() - interval '1 day';
  INSERT INTO cliente_login_intentos (clave) VALUES (p_clave);
$$;

CREATE OR REPLACE FUNCTION public.dn_cliente_cerrar_sesion(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  DELETE FROM cliente_sesiones
  WHERE token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- ============================================================
-- Login de clientes: ahora devuelven token y limitan intentos
-- ============================================================
CREATE OR REPLACE FUNCTION public.validar_pin_cliente(p_telefono text, p_codigo_pais text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_telefono_normalizado TEXT;
  v_usuario RECORD;
  v_clave TEXT;
BEGIN
  v_telefono_normalizado := regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g');
  v_clave := 'pin:' || right(v_telefono_normalizado, 10);

  IF _dn_login_bloqueado(v_clave) THEN
    RETURN jsonb_build_object('success', false, 'code', 'BLOQUEADO',
      'error', 'Demasiados intentos. Espera 15 minutos e intenta de nuevo.');
  END IF;

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
    PERFORM _dn_login_fallo(v_clave);
    RETURN jsonb_build_object('success', false, 'error', 'PIN incorrecto', 'code', 'INVALID_PIN');
  END IF;

  DELETE FROM cliente_login_intentos WHERE clave = v_clave;

  RETURN jsonb_build_object(
    'success', true,
    'token', _dn_cliente_nuevo_token(v_usuario.id),
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

CREATE OR REPLACE FUNCTION public.dn_cliente_login_clave(p_identificador text, p_clave text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_ident text := trim(coalesce(p_identificador, ''));
  v_digits text := regexp_replace(v_ident, '\D', '', 'g');
  v_phone text := CASE WHEN length(v_digits) = 12 AND v_digits LIKE '57%' THEN '+' || v_digits ELSE '+57' || v_digits END;
  v_clave text := 'clave:' || lower(v_ident);
  u record;
BEGIN
  IF _dn_login_bloqueado(v_clave) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Demasiados intentos. Espera 15 minutos e intenta de nuevo.');
  END IF;

  SELECT us.id, us.username, us.email, us.phone, us.role, us.full_name, us.avatar_url, c.password_hash
  INTO u
  FROM usuarios us
  LEFT JOIN usuarios_credenciales c ON c.usuario_id = us.id
  WHERE us.role = 'cliente' AND (us.username = v_ident OR lower(us.email) = lower(v_ident) OR us.phone = v_phone)
  ORDER BY c.password_hash IS NULL LIMIT 1;
  IF NOT FOUND OR u.password_hash IS NULL OR extensions.crypt(coalesce(p_clave, ''), u.password_hash) <> u.password_hash THEN
    PERFORM _dn_login_fallo(v_clave);
    RETURN jsonb_build_object('success', false, 'error', 'Usuario o clave incorrectos.');
  END IF;
  DELETE FROM cliente_login_intentos WHERE clave = v_clave;
  RETURN jsonb_build_object('success', true, 'token', _dn_cliente_nuevo_token(u.id), 'usuario', jsonb_build_object(
    'id', u.id, 'username', u.username, 'email', u.email, 'phone', u.phone,
    'role', u.role, 'full_name', u.full_name, 'avatar_url', u.avatar_url));
END;
$$;

CREATE OR REPLACE FUNCTION public.dn_cliente_registro(p_telefono text, p_clave text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
  RETURN jsonb_build_object('success', true, 'token', _dn_cliente_nuevo_token(v_id), 'usuario', to_jsonb(u));
END;
$$;

-- ============================================================
-- Club de Leales (requieren token)
-- ============================================================
CREATE OR REPLACE FUNCTION public.dn_cliente_perfil(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid := _dn_cliente_de_token(p_token);
BEGIN
  RETURN (
    SELECT to_jsonb(u) - ARRAY['password_hash', 'pin_cliente', 'notas_admin', 'weibook_id',
                               'pin_activacion_hasta', 'config_pago', 'saldo_wallet']
    FROM usuarios u WHERE u.id = v_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.dn_cliente_citas_proximas(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid := _dn_cliente_de_token(p_token);
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'fecha', c.fecha, 'hora_inicio', c.hora_inicio, 'estado', c.estado,
      'servicio', jsonb_build_object('nombre', s.nombre, 'precio', s.precio),
      'barbero', jsonb_build_object('id', c.barbero_id, 'nombre', b.full_name),
      'sucursal', jsonb_build_object('nombre', su.nombre, 'direccion', su.direccion)
    ) ORDER BY c.fecha, c.hora_inicio)
    FROM citas c
    LEFT JOIN servicios s ON s.id = c.servicio_id
    LEFT JOIN usuarios b ON b.id = c.barbero_id
    LEFT JOIN sucursales su ON su.id = c.sucursal_id
    WHERE c.cliente_id = v_id
      AND c.fecha >= (now() AT TIME ZONE 'America/Bogota')::date
      AND c.estado IN ('agendada', 'confirmada', 'pendiente')
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.dn_cliente_cancelar_cita(p_token text, p_cita_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid := _dn_cliente_de_token(p_token);
BEGIN
  UPDATE citas SET estado = 'cancelada', cancelado_por = v_id, cancelado_via = 'app_cliente',
    cancelado_rol = 'cliente', cancelado_at = now(), updated_at = now()
  WHERE id = p_cita_id AND cliente_id = v_id AND estado IN ('agendada', 'confirmada', 'pendiente');
  RETURN jsonb_build_object('success', FOUND);
END;
$$;

-- Solo estos campos los puede cambiar el cliente
CREATE OR REPLACE FUNCTION public.dn_cliente_actualizar(p_token text, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid := _dn_cliente_de_token(p_token);
BEGIN
  UPDATE usuarios SET
    email = CASE WHEN p_datos ? 'email' THEN nullif(trim(p_datos->>'email'), '') ELSE email END,
    sucursal_id = CASE WHEN p_datos ? 'sucursal_id' THEN (p_datos->>'sucursal_id')::uuid ELSE sucursal_id END,
    barbero_favorito_id = CASE WHEN p_datos ? 'barbero_favorito_id' THEN (p_datos->>'barbero_favorito_id')::uuid ELSE barbero_favorito_id END,
    servicio_favorito_id = CASE WHEN p_datos ? 'servicio_favorito_id' THEN (p_datos->>'servicio_favorito_id')::uuid ELSE servicio_favorito_id END,
    updated_at = now()
  WHERE id = v_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.dn_cliente_preferencias(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN obtener_preferencias_cliente(_dn_cliente_de_token(p_token))::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.dn_cliente_crear_cita(p_token text, p_barbero_id uuid, p_servicio_id uuid, p_fecha date, p_hora text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN crear_cita_cliente(_dn_cliente_de_token(p_token), p_barbero_id, p_servicio_id, p_fecha, p_hora)::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.dn_cliente_actualizar_perfil(p_token text, p_full_name text DEFAULT NULL,
  p_email text DEFAULT NULL, p_instagram text DEFAULT NULL, p_fecha_nacimiento date DEFAULT NULL, p_avatar_url text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN actualizar_perfil_cliente(_dn_cliente_de_token(p_token), p_full_name, p_email, p_instagram, p_fecha_nacimiento, p_avatar_url);
END;
$$;

-- ============================================================
-- Funciones públicas (sin sesión), con lo mínimo
-- ============================================================

-- Horas ocupadas para calcular disponibilidad (sin datos del cliente)
CREATE OR REPLACE FUNCTION public.dn_citas_ocupadas(p_fecha date, p_sucursal_id uuid DEFAULT NULL,
  p_barbero_id uuid DEFAULT NULL, p_excluir text[] DEFAULT ARRAY['cancelada', 'sin_respuesta'])
RETURNS TABLE (barbero_id uuid, hora_inicio time, hora_fin time)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT c.barbero_id, c.hora_inicio, c.hora_fin FROM citas c
  WHERE c.fecha = p_fecha
    AND (p_sucursal_id IS NULL OR c.sucursal_id = p_sucursal_id)
    AND (p_barbero_id IS NULL OR c.barbero_id = p_barbero_id)
    AND (p_sucursal_id IS NOT NULL OR p_barbero_id IS NOT NULL)
    AND NOT (c.estado = ANY (p_excluir));
$$;

-- Estadísticas públicas de la página de reservar
CREATE OR REPLACE FUNCTION public.dn_reserva_estadisticas()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'servicio_mas_elegido', (
      SELECT c.servicio_id FROM citas c JOIN sucursales s ON s.id = c.sucursal_id
      WHERE c.estado NOT IN ('cancelada', 'sin_respuesta') AND c.servicio_id IS NOT NULL
        AND c.fecha >= current_date - 90 AND NOT coalesce(s.es_test, false)
      GROUP BY c.servicio_id ORDER BY count(*) DESC LIMIT 1),
    'cortes_por_barbero', COALESCE((
      SELECT jsonb_object_agg(barbero_id, n) FROM (
        SELECT c.barbero_id, count(*) n FROM citas c JOIN sucursales s ON s.id = c.sucursal_id
        WHERE c.estado = 'finalizada' AND c.barbero_id IS NOT NULL
          AND c.fecha >= current_date - 183 AND NOT coalesce(s.es_test, false)
        GROUP BY c.barbero_id) x), '{}'::jsonb)
  );
$$;

-- Datos públicos del equipo (sin celular ni correo)
CREATE OR REPLACE FUNCTION public.dn_publico_equipo(p_ids uuid[])
RETURNS TABLE (id uuid, username text, full_name text, avatar_url text, avatar_focus_y_reservas integer, instagram text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT u.id, u.username, u.full_name, u.avatar_url, u.avatar_focus_y_reservas, u.instagram
  FROM usuarios u
  WHERE u.id = ANY (p_ids) AND u.role IN ('barbero', 'admin', 'admin_sede', 'aseo');
$$;

-- Reseñas públicas de barberos (cliente: solo nombre y nivel)
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
    FROM resenas r LEFT JOIN usuarios u ON u.id = r.cliente_id
    WHERE r.barbero_id = ANY (p_barbero_ids)
    ORDER BY r.created_at DESC
    LIMIT least(greatest(coalesce(p_limite, 50), 1), 200)
  ) t;
$$;

-- Busca un cliente por celular para la página de reservar.
-- No devuelve el correo (solo si tiene), para no exponerlo con solo el número.
CREATE OR REPLACE FUNCTION public.dn_reserva_buscar_cliente(p_telefonos text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  u record;
BEGIN
  SELECT us.id, us.full_name, us.phone, us.email INTO u FROM usuarios us
  WHERE us.role = 'cliente' AND us.phone = ANY (p_telefonos)
  ORDER BY us.total_visitas_weibook DESC NULLS LAST LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('encontrado', false);
  END IF;
  RETURN jsonb_build_object(
    'encontrado', true, 'id', u.id, 'phone', u.phone, 'full_name', u.full_name,
    'tiene_email', u.email IS NOT NULL AND u.email <> '',
    'citas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'fecha', c.fecha, 'hora_inicio', c.hora_inicio,
        'barbero_nombre', b.full_name, 'servicio_nombre', s.nombre) ORDER BY c.fecha, c.hora_inicio)
      FROM (SELECT * FROM citas WHERE cliente_id = u.id
              AND fecha >= (now() AT TIME ZONE 'America/Bogota')::date
              AND estado IN ('agendada', 'confirmada')
            ORDER BY fecha, hora_inicio LIMIT 5) c
      LEFT JOIN usuarios b ON b.id = c.barbero_id
      LEFT JOIN servicios s ON s.id = c.servicio_id), '[]'::jsonb)
  );
END;
$$;

-- Crea o actualiza el cliente de una reserva y devuelve su id.
-- A un cliente existente solo se le completa el nombre y el correo si no los tenía,
-- o se corrige el nombre (no se borra nada).
CREATE OR REPLACE FUNCTION public.dn_reserva_guardar_cliente(p_telefono text, p_nombre text, p_email text DEFAULT NULL,
  p_cliente_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
  v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_nombre text := nullif(trim(coalesce(p_nombre, '')), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
BEGIN
  IF p_cliente_id IS NOT NULL THEN
    SELECT id INTO v_id FROM usuarios WHERE id = p_cliente_id AND role = 'cliente';
  END IF;
  IF v_id IS NULL THEN
    IF length(v_tel) < 7 THEN
      RAISE EXCEPTION 'Teléfono inválido';
    END IF;
    SELECT id INTO v_id FROM usuarios
    WHERE role = 'cliente' AND phone IN (v_tel, '57' || v_tel, '+57' || v_tel)
    ORDER BY total_visitas_weibook DESC NULLS LAST LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    IF v_nombre IS NULL THEN
      RAISE EXCEPTION 'Nombre requerido';
    END IF;
    BEGIN
      INSERT INTO usuarios (username, phone, full_name, email, role, origen)
      VALUES (v_tel, v_tel, v_nombre, v_email, 'cliente', 'web_reservas') RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      -- Otro proceso lo creó al mismo tiempo
      SELECT id INTO v_id FROM usuarios WHERE role = 'cliente' AND phone = v_tel;
    END;
  ELSE
    UPDATE usuarios SET
      full_name = coalesce(v_nombre, full_name),
      email = coalesce(nullif(email, ''), v_email),
      updated_at = now()
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- Crea la cita de la página de reservar. Siempre origen web_reservas, así el
-- trigger validar_cita_web_reservas revisa sede, horario y choques.
CREATE OR REPLACE FUNCTION public.dn_reserva_crear_cita(p_cliente_id uuid, p_barbero_id uuid, p_servicio_id uuid,
  p_sucursal_id uuid, p_fecha date, p_hora_inicio time, p_hora_fin time, p_precio numeric,
  p_servicios_adicionales jsonb DEFAULT '[]'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = p_cliente_id AND role = 'cliente') THEN
    RAISE EXCEPTION 'Cliente no encontrado';
  END IF;
  IF p_fecha < (now() AT TIME ZONE 'America/Bogota')::date THEN
    RAISE EXCEPTION 'RESERVA_NO_DISPONIBLE: fecha pasada';
  END IF;
  INSERT INTO citas (cliente_id, barbero_id, servicio_id, sucursal_id, servicios_adicionales,
    fecha, hora_inicio, hora_fin, precio, estado, origen)
  VALUES (p_cliente_id, p_barbero_id, p_servicio_id, p_sucursal_id, coalesce(p_servicios_adicionales, '[]'::jsonb),
    p_fecha, p_hora_inicio, p_hora_fin, p_precio, 'agendada', 'web_reservas')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Citas próximas por celular (página cancelar)
CREATE OR REPLACE FUNCTION public.dn_citas_por_telefono(p_telefonos text[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'fecha', c.fecha, 'hora_inicio', c.hora_inicio, 'precio', c.precio, 'estado', c.estado,
    'barbero_nombre', b.full_name, 'servicio_nombre', s.nombre, 'sucursal_nombre', su.nombre
  ) ORDER BY c.fecha, c.hora_inicio), '[]'::jsonb)
  FROM citas c
  LEFT JOIN usuarios b ON b.id = c.barbero_id
  LEFT JOIN servicios s ON s.id = c.servicio_id
  LEFT JOIN sucursales su ON su.id = c.sucursal_id
  WHERE c.cliente_id = (SELECT id FROM usuarios WHERE role = 'cliente' AND phone = ANY (p_telefonos)
                        ORDER BY total_visitas_weibook DESC NULLS LAST LIMIT 1)
    AND c.fecha >= (now() AT TIME ZONE 'America/Bogota')::date
    AND c.estado IN ('agendada', 'confirmada');
$$;

-- Cancela una cita verificando que sea del celular indicado
CREATE OR REPLACE FUNCTION public.dn_cancelar_cita_publica(p_cita_id uuid, p_telefonos text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE citas c SET estado = 'cancelada', cancelado_via = 'web_cancelar', cancelado_rol = 'cliente',
    cancelado_at = now(), updated_at = now()
  FROM usuarios u
  WHERE c.id = p_cita_id AND u.id = c.cliente_id AND u.phone = ANY (p_telefonos)
    AND c.estado IN ('agendada', 'confirmada');
  RETURN jsonb_build_object('success', FOUND);
END;
$$;

-- Detalle de una cita por su id (links de confirmar)
CREATE OR REPLACE FUNCTION public.dn_cita_publica(p_cita_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'fecha', c.fecha, 'hora_inicio', c.hora_inicio, 'estado', c.estado, 'precio', c.precio,
    'barbero_id', c.barbero_id, 'barbero_nombre', b.full_name,
    'servicios', jsonb_build_object('nombre', s.nombre),
    'sucursal', jsonb_build_object('nombre', su.nombre, 'direccion', su.direccion))
  FROM citas c
  LEFT JOIN usuarios b ON b.id = c.barbero_id
  LEFT JOIN servicios s ON s.id = c.servicio_id
  LEFT JOIN sucursales su ON su.id = c.sucursal_id
  WHERE c.id = p_cita_id;
$$;

CREATE OR REPLACE FUNCTION public.dn_confirmar_cita(p_cita_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE citas SET estado = 'confirmada', updated_at = now()
  WHERE id = p_cita_id AND estado = 'agendada';
  RETURN jsonb_build_object('success', true, 'cambio', FOUND);
END;
$$;

-- Recibo de una cita (link enviado al cliente)
CREATE OR REPLACE FUNCTION public.dn_recibo_cita(p_cita_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'fecha', c.fecha, 'hora_inicio', c.hora_inicio, 'precio', c.precio, 'propina', c.propina,
    'metodo_pago', c.metodo_pago, 'pagada_at', c.pagada_at, 'estado', c.estado,
    'servicios_adicionales', c.servicios_adicionales, 'barbero_id', c.barbero_id,
    'barbero', jsonb_build_object('full_name', b.full_name, 'username', b.username),
    'usuarios', jsonb_build_object('full_name', u.full_name, 'username', u.username, 'phone', u.phone),
    'servicios', jsonb_build_object('nombre', s.nombre, 'precio', s.precio),
    'sucursales', jsonb_build_object('nombre', su.nombre, 'direccion', su.direccion))
  FROM citas c
  LEFT JOIN usuarios u ON u.id = c.cliente_id
  LEFT JOIN usuarios b ON b.id = c.barbero_id
  LEFT JOIN servicios s ON s.id = c.servicio_id
  LEFT JOIN sucursales su ON su.id = c.sucursal_id
  WHERE c.id = p_cita_id;
$$;

-- Reseña: datos del ticket o de la cita del link, y si ya fue calificado
CREATE OR REPLACE FUNCTION public.dn_ticket_resena(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'cliente_id', t.cliente_id,
    'cita_id', t.cita_id,
    'sucursal_id', t.sucursal_id,
    'created_at', t.created_at,
    'cliente_telefono', (SELECT phone FROM usuarios WHERE id = t.cliente_id),
    'ya_calificado', EXISTS (SELECT 1 FROM resenas r WHERE r.ticket_id = t.id),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'nombre', i.nombre,
        'barbero_id', COALESCE(i.barbero_id, t.barbero_id),
        'barbero_nombre', COALESCE(i.barbero_nombre, t.barbero_nombre)
      ) ORDER BY i.nombre)
      FROM ticket_items i WHERE i.ticket_id = t.id AND i.tipo = 'servicio'
    ), '[]'::jsonb)
  )
  FROM tickets t
  WHERE t.id = p_ticket_id AND NOT COALESCE(t.anulado, false);
$$;

CREATE OR REPLACE FUNCTION public.dn_cita_resena(p_cita_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'cliente_id', c.cliente_id, 'barbero_id', c.barbero_id, 'fecha', c.fecha,
    'cliente_telefono', u.phone,
    'servicio_nombre', s.nombre,
    'barbero_nombre', b.full_name,
    'sucursal', jsonb_build_object('nombre', su.nombre, 'google_maps_link', su.google_maps_link, 'whatsapp', su.whatsapp),
    'ya_calificado', EXISTS (SELECT 1 FROM resenas r WHERE r.cita_id = c.id))
  FROM citas c
  LEFT JOIN usuarios u ON u.id = c.cliente_id
  LEFT JOIN usuarios b ON b.id = c.barbero_id
  LEFT JOIN servicios s ON s.id = c.servicio_id
  LEFT JOIN sucursales su ON su.id = c.sucursal_id
  WHERE c.id = p_cita_id;
$$;

-- Guarda una reseña; una sola por ticket o cita, y solo de servicios reales
CREATE OR REPLACE FUNCTION public.dn_crear_resena(p_ticket_id uuid, p_cita_id uuid, p_barbero_id uuid,
  p_calificacion integer, p_comentario text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cliente uuid;
  v_cita uuid := p_cita_id;
  v_barbero uuid;
  v_sucursal uuid;
BEGIN
  IF p_calificacion IS NULL OR p_calificacion NOT BETWEEN 1 AND 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Calificación inválida');
  END IF;
  IF p_ticket_id IS NOT NULL THEN
    SELECT cliente_id, coalesce(cita_id, p_cita_id), barbero_id, sucursal_id INTO v_cliente, v_cita, v_barbero, v_sucursal
    FROM tickets WHERE id = p_ticket_id AND NOT coalesce(anulado, false);
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Ticket no encontrado'); END IF;
    IF EXISTS (SELECT 1 FROM resenas WHERE ticket_id = p_ticket_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ya calificaste este servicio');
    END IF;
  ELSIF p_cita_id IS NOT NULL THEN
    SELECT cliente_id, barbero_id, sucursal_id INTO v_cliente, v_barbero, v_sucursal FROM citas WHERE id = p_cita_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Cita no encontrada'); END IF;
    IF EXISTS (SELECT 1 FROM resenas WHERE cita_id = p_cita_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ya calificaste este servicio');
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Falta el servicio');
  END IF;

  INSERT INTO resenas (ticket_id, cita_id, cliente_id, barbero_id, sucursal_id, calificacion, comentario)
  VALUES (p_ticket_id, v_cita, v_cliente, coalesce(p_barbero_id, v_barbero), v_sucursal, p_calificacion,
          nullif(left(trim(coalesce(p_comentario, '')), 2000), ''));
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================================
-- Permisos de ejecución
-- ============================================================
REVOKE ALL ON FUNCTION public._dn_cliente_nuevo_token(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._dn_cliente_de_token(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._dn_login_bloqueado(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._dn_login_fallo(text) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'dn_cliente_cerrar_sesion(text)',
    'dn_cliente_perfil(text)',
    'dn_cliente_citas_proximas(text)',
    'dn_cliente_cancelar_cita(text, uuid)',
    'dn_cliente_actualizar(text, jsonb)',
    'dn_cliente_preferencias(text)',
    'dn_cliente_crear_cita(text, uuid, uuid, date, text)',
    'dn_cliente_actualizar_perfil(text, text, text, text, date, text)',
    'dn_citas_ocupadas(date, uuid, uuid, text[])',
    'dn_reserva_estadisticas()',
    'dn_publico_equipo(uuid[])',
    'dn_publico_resenas(uuid[], integer)',
    'dn_reserva_buscar_cliente(text[])',
    'dn_reserva_guardar_cliente(text, text, text, uuid)',
    'dn_reserva_crear_cita(uuid, uuid, uuid, uuid, date, time, time, numeric, jsonb)',
    'dn_citas_por_telefono(text[])',
    'dn_cancelar_cita_publica(uuid, text[])',
    'dn_cita_publica(uuid)',
    'dn_confirmar_cita(uuid)',
    'dn_recibo_cita(uuid)',
    'dn_ticket_resena(uuid)',
    'dn_cita_resena(uuid)',
    'dn_crear_resena(uuid, uuid, uuid, integer, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated', f);
  END LOOP;
END $$;
