-- Migración: Crear función RPC actualizar_colaborador
-- Fecha: 2026-10-05
-- Descripción: Función para actualizar datos de colaborador desde admin

CREATE OR REPLACE FUNCTION actualizar_colaborador(
  p_caller_id UUID,
  p_usuario_id UUID,
  p_username TEXT,
  p_password TEXT DEFAULT NULL,
  p_full_name TEXT DEFAULT NULL,
  p_instagram TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role TEXT;
  v_existing_user UUID;
BEGIN
  -- Verificar que el caller es admin o admin_sede
  SELECT role INTO v_caller_role FROM usuarios WHERE id = p_caller_id;

  IF v_caller_role NOT IN ('admin', 'admin_sede') THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes permisos para esta acción');
  END IF;

  -- Verificar que el username no esté en uso por otro usuario
  SELECT id INTO v_existing_user
  FROM usuarios
  WHERE username = p_username AND id != p_usuario_id;

  IF v_existing_user IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ese nombre de usuario ya existe');
  END IF;

  -- Actualizar usuario
  UPDATE usuarios SET
    username = COALESCE(p_username, username),
    full_name = COALESCE(p_full_name, full_name),
    instagram = p_instagram,
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    password_hash = CASE
      WHEN p_password IS NOT NULL AND p_password != '' THEN p_password
      ELSE password_hash
    END
  WHERE id = p_usuario_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Dar permisos de ejecución
GRANT EXECUTE ON FUNCTION actualizar_colaborador TO authenticated;
GRANT EXECUTE ON FUNCTION actualizar_colaborador TO anon;
