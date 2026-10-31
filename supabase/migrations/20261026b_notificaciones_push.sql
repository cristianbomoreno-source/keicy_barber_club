-- =====================================================
-- Notificaciones push por rol
--  - Barbero: "Tu cliente llegó" cuando recepción/admin marca la llegada (citas.llego_at)
--  - Admin y admin de sede: reseñas de 3★ o menos, y productos/insumos que bajan
--    del stock mínimo (los de sede solo de su sede cuando el registro tiene sede)
-- Flujo: trigger -> notificaciones_push -> pg_net -> Edge Function push-enviar -> Web Push
-- La llave privada VAPID vive en la bóveda (dn_vapid_private), no en el repo.
-- =====================================================

-- Suscripciones (un registro por navegador/dispositivo)
CREATE TABLE IF NOT EXISTS public.push_suscripciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ultimo_envio_ok_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_push_suscripciones_usuario ON public.push_suscripciones(usuario_id);
ALTER TABLE public.push_suscripciones ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo se maneja con las funciones de abajo y desde el servidor.

-- Bandeja / registro de envíos
CREATE TABLE IF NOT EXISTS public.notificaciones_push (
  id bigserial PRIMARY KEY,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  titulo text NOT NULL,
  cuerpo text,
  url text,
  ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  enviada_at timestamptz,
  dispositivos_ok integer NOT NULL DEFAULT 0,
  error text
);
CREATE INDEX IF NOT EXISTS idx_notificaciones_push_usuario ON public.notificaciones_push(usuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_push_pendientes ON public.notificaciones_push(created_at) WHERE enviada_at IS NULL;
ALTER TABLE public.notificaciones_push ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS propias ON public.notificaciones_push;
CREATE POLICY propias ON public.notificaciones_push FOR SELECT TO authenticated USING (usuario_id = auth.uid());

-- Llave privada VAPID (solo la lee el servidor)
CREATE OR REPLACE FUNCTION public._dn_vapid_privada()
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'dn_vapid_private' LIMIT 1; $$;
REVOKE ALL ON FUNCTION public._dn_vapid_privada() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._dn_vapid_privada() TO service_role;

-- Suscribir este dispositivo (solo el equipo con sesión real)
CREATE OR REPLACE FUNCTION public.dn_push_suscribir(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM usuarios WHERE id = auth.uid() AND role IN ('admin', 'admin_sede', 'barbero', 'aseo')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;
  IF coalesce(p_endpoint, '') !~ '^https://' OR coalesce(p_p256dh, '') = '' OR coalesce(p_auth, '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Suscripción inválida');
  END IF;
  -- Si el dispositivo lo usaba otra persona, ahora queda a nombre de quien inició sesión
  INSERT INTO push_suscripciones (usuario_id, endpoint, p256dh, auth, user_agent)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  ON CONFLICT (endpoint) DO UPDATE
    SET usuario_id = EXCLUDED.usuario_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent, updated_at = now();
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Quitar este dispositivo (al cerrar sesión o desactivar)
CREATE OR REPLACE FUNCTION public.dn_push_desuscribir(p_endpoint text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false); END IF;
  DELETE FROM push_suscripciones WHERE endpoint = p_endpoint AND usuario_id = auth.uid();
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.dn_push_suscribir(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dn_push_desuscribir(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dn_push_suscribir(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dn_push_desuscribir(text) TO authenticated;

-- Encola y dispara el envío. Nunca hace fallar la operación que la llamó.
CREATE OR REPLACE FUNCTION public._dn_push_encolar(p_usuarios uuid[], p_tipo text, p_titulo text, p_cuerpo text, p_url text, p_ref uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ids bigint[];
BEGIN
  IF p_usuarios IS NULL OR cardinality(p_usuarios) = 0 THEN RETURN; END IF;
  WITH ins AS (
    INSERT INTO notificaciones_push (usuario_id, tipo, titulo, cuerpo, url, ref_id)
    SELECT DISTINCT u, p_tipo, p_titulo, p_cuerpo, p_url, p_ref
    FROM unnest(p_usuarios) u
    WHERE EXISTS (SELECT 1 FROM push_suscripciones s WHERE s.usuario_id = u)
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM ins;
  IF v_ids IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := 'https://ygrmammcaupnygdxmgth.supabase.co/functions/v1/push-enviar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public._dn_cron_secret()),
    body := jsonb_build_object('ids', to_jsonb(v_ids))
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[push] no se pudo encolar %: %', p_tipo, SQLERRM;
END;
$$;
REVOKE ALL ON FUNCTION public._dn_push_encolar(uuid[], text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- Admin principal + admins de sede (de la sede indicada; todos si no hay sede)
CREATE OR REPLACE FUNCTION public._dn_push_destinatarios_admin(p_sucursal uuid)
 RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(array_agg(DISTINCT id), '{}') FROM (
    SELECT id FROM usuarios WHERE role = 'admin'
    UNION
    SELECT a.usuario_id FROM admin_sede_sedes_asignadas a
    JOIN usuarios u ON u.id = a.usuario_id AND u.role = 'admin_sede'
    WHERE a.activo AND (p_sucursal IS NULL OR a.sucursal_id = p_sucursal)
  ) x;
$$;
REVOKE ALL ON FUNCTION public._dn_push_destinatarios_admin(uuid) FROM PUBLIC, anon, authenticated;

-- 1) Barbero: el cliente llegó
CREATE OR REPLACE FUNCTION public._dn_push_cliente_llego()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_nombre text;
BEGIN
  IF NEW.barbero_id IS NULL OR NEW.fecha IS DISTINCT FROM (now() AT TIME ZONE 'America/Bogota')::date THEN
    RETURN NEW;
  END IF;
  IF NOT ((OLD.llego_at IS NULL AND NEW.llego_at IS NOT NULL)
          OR (OLD.estado IS DISTINCT FROM 'sala_espera' AND NEW.estado = 'sala_espera' AND OLD.llego_at IS NULL AND NEW.llego_at IS NULL)) THEN
    RETURN NEW;
  END IF;
  SELECT coalesce(nullif(trim(NEW.cliente_nombre), ''), u.full_name, 'Tu cliente') INTO v_nombre
  FROM (SELECT 1) d LEFT JOIN usuarios u ON u.id = NEW.cliente_id;
  PERFORM _dn_push_encolar(
    ARRAY[NEW.barbero_id], 'cliente_llego',
    'Tu cliente llegó 💈',
    v_nombre || ' ya está en la barbería · cita de las ' || to_char(NEW.hora_inicio, 'HH12:MI AM'),
    '/barbero/home.html', NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_push_cliente_llego ON public.citas;
CREATE TRIGGER trg_push_cliente_llego AFTER UPDATE OF llego_at, estado ON public.citas
  FOR EACH ROW EXECUTE FUNCTION _dn_push_cliente_llego();

-- 2) Admins: reseña mala (3 estrellas o menos)
CREATE OR REPLACE FUNCTION public._dn_push_resena_mala()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_barbero text;
  v_sucursal uuid := NEW.sucursal_id;
BEGIN
  IF NEW.calificacion IS NULL OR NEW.calificacion > 3 THEN RETURN NEW; END IF;
  SELECT full_name INTO v_barbero FROM usuarios WHERE id = NEW.barbero_id;
  IF v_sucursal IS NULL AND NEW.cita_id IS NOT NULL THEN
    SELECT sucursal_id INTO v_sucursal FROM citas WHERE id = NEW.cita_id;
  END IF;
  PERFORM _dn_push_encolar(
    _dn_push_destinatarios_admin(v_sucursal), 'resena_mala',
    '⚠️ Reseña de ' || NEW.calificacion || '★' || coalesce(' para ' || split_part(v_barbero, ' ', 1), ''),
    coalesce(nullif(left(trim(NEW.comentario), 140), ''), 'Sin comentario') ,
    '/admin/resenas.html', NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_push_resena_mala ON public.resenas;
CREATE TRIGGER trg_push_resena_mala AFTER INSERT ON public.resenas
  FOR EACH ROW EXECUTE FUNCTION _dn_push_resena_mala();

-- 3) Admins: stock bajo (solo cuando cruza el mínimo, no en cada venta)
CREATE OR REPLACE FUNCTION public._dn_push_stock_bajo()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_sucursal uuid;
BEGIN
  IF NOT coalesce(NEW.activo, true) OR coalesce(NEW.stock_minimo, 0) <= 0 OR NEW.cantidad IS NULL THEN RETURN NEW; END IF;
  IF NEW.cantidad > NEW.stock_minimo OR coalesce(OLD.cantidad, 0) <= NEW.stock_minimo THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'inventario_productos_venta' THEN
    v_sucursal := (to_jsonb(NEW) ->> 'sucursal_id')::uuid;
  END IF;
  PERFORM _dn_push_encolar(
    _dn_push_destinatarios_admin(v_sucursal), 'stock_bajo',
    CASE WHEN NEW.cantidad <= 0 THEN '🚫 Agotado: ' ELSE '📦 Stock bajo: ' END || NEW.nombre,
    'Quedan ' || greatest(NEW.cantidad, 0) || ' (mínimo ' || NEW.stock_minimo || ')'
      || CASE WHEN TG_TABLE_NAME = 'inventario_insumos' THEN ' · insumo' ELSE ' · producto de venta' END,
    '/admin/inventario.html', NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_push_stock_bajo ON public.inventario_productos_venta;
CREATE TRIGGER trg_push_stock_bajo AFTER UPDATE OF cantidad ON public.inventario_productos_venta
  FOR EACH ROW EXECUTE FUNCTION _dn_push_stock_bajo();
DROP TRIGGER IF EXISTS trg_push_stock_bajo ON public.inventario_insumos;
CREATE TRIGGER trg_push_stock_bajo AFTER UPDATE OF cantidad ON public.inventario_insumos
  FOR EACH ROW EXECUTE FUNCTION _dn_push_stock_bajo();

-- Probar: envía una notificación de prueba a quien la pide
CREATE OR REPLACE FUNCTION public.dn_push_probar()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM push_suscripciones WHERE usuario_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este dispositivo no tiene notificaciones activas');
  END IF;
  PERFORM _dn_push_encolar(ARRAY[auth.uid()], 'prueba', '🔔 Notificaciones activas',
    'Así te van a llegar los avisos de Keicy Barber Club.', NULL, NULL);
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.dn_push_probar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dn_push_probar() TO authenticated;

-- Limpieza: el registro de envíos guarda 60 días
SELECT cron.schedule('push-limpiar-registro', '15 4 * * *',
  $$DELETE FROM public.notificaciones_push WHERE created_at < now() - interval '60 days'$$);

-- Las funciones de trigger no se llaman directo
REVOKE ALL ON FUNCTION public._dn_push_cliente_llego() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._dn_push_resena_mala() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._dn_push_stock_bajo() FROM PUBLIC, anon, authenticated;

-- La llave privada se guardó aparte (no va en el repo):
--   SELECT vault.create_secret('<llave privada VAPID>', 'dn_vapid_private', '...');
