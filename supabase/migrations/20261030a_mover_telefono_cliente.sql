-- 30-oct-2026: en Clientes no se podía guardar un teléfono que ya tenía otra cuenta de cliente
-- (índice único idx_usuarios_phone_cliente_unique) y la pantalla solo decía «No pudimos guardar».
-- Ahora la pantalla muestra quién tiene el número y, si el admin confirma, se lo pasa al cliente
-- que se está editando: en una sola transacción se le quita a la otra cuenta y se pone en esta.
CREATE OR REPLACE FUNCTION public.admin_mover_telefono_cliente(p_origen uuid, p_destino uuid, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_nombre text;
BEGIN
  IF NOT dn_es_admin() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  IF p_origen = p_destino OR coalesce(trim(p_phone), '') = '' THEN RAISE EXCEPTION 'Datos inválidos'; END IF;

  UPDATE usuarios SET phone = NULL,
         notas_admin = trim(coalesce(notas_admin, '') || E'\n' || to_char(now() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD')
                       || ': se le quitó el teléfono ' || p_phone || ' (pasado a otra cuenta)')
  WHERE id = p_origen AND role = 'cliente' AND phone = p_phone
  RETURNING full_name INTO v_nombre;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esa cuenta ya no tiene ese teléfono'; END IF;

  UPDATE usuarios SET phone = p_phone WHERE id = p_destino AND role = 'cliente';
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no encontrado'; END IF;

  RETURN jsonb_build_object('success', true, 'quitado_a', v_nombre);
END $$;
REVOKE ALL ON FUNCTION public.admin_mover_telefono_cliente(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mover_telefono_cliente(uuid, uuid, text) TO authenticated;
