-- En iPhone, Safari y cada app instalada en la pantalla de inicio guardan la sesión
-- por separado, así que cuentan como dispositivos distintos. El admin general usa
-- varios a la vez y con el límite de 2 cada inicio de sesión cerraba la PWA.
-- El admin general puede tener hasta 5 sesiones; el resto del equipo sigue en 2.

CREATE OR REPLACE FUNCTION public.dn_post_login()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_sid uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
  v_cerradas int := 0;
  v_max int;
  u record;
BEGIN
  SELECT id, username, email, phone, role, full_name, avatar_url INTO u FROM usuarios WHERE id = v_uid;
  IF v_uid IS NULL OR NOT FOUND OR u.role NOT IN ('admin', 'admin_sede', 'barbero', 'aseo') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  v_max := CASE WHEN u.role = 'admin' THEN 5 ELSE 2 END;

  WITH conservar AS (
    SELECT id FROM auth.sessions
    WHERE user_id = v_uid AND id IS DISTINCT FROM v_sid
    ORDER BY coalesce(refreshed_at::timestamptz, updated_at, created_at) DESC
    LIMIT v_max - 1
  ), borradas AS (
    DELETE FROM auth.sessions s
    WHERE s.user_id = v_uid AND s.id IS DISTINCT FROM v_sid AND s.id NOT IN (SELECT id FROM conservar)
    RETURNING 1
  )
  SELECT count(*) INTO v_cerradas FROM borradas;

  PERFORM _dn_log_auth(v_uid, 'login', jsonb_build_object('sesiones_cerradas', v_cerradas));
  RETURN to_jsonb(u);
END;
$function$;
