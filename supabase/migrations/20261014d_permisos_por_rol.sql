-- =====================================================================
-- Permisos por rol dentro del equipo
--
-- * Admin y admins de sede: acceso completo (como antes).
-- * Barberos/aseo: solo lo que usa su app, y lo personal solo lo suyo
--   (sus citas, comisiones, pagos, alertas, consumos, reseñas).
-- * Funciones del panel (cobros, WhatsApp, historial de clientes...): solo admin.
-- * Un barbero no puede cambiar su propio rol, saldo, etc.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.dn_es_barbero()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND role IN ('barbero', 'aseo'));
$$;
REVOKE ALL ON FUNCTION public.dn_es_barbero() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dn_es_barbero() TO authenticated;

-- Citas del barbero (para cita_items_adicionales y clientes visibles)
CREATE OR REPLACE FUNCTION public.dn_es_mi_cita(p_cita_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM citas WHERE id = p_cita_id AND barbero_id = auth.uid());
$$;
CREATE OR REPLACE FUNCTION public.dn_es_mi_cliente(p_usuario_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM citas WHERE cliente_id = p_usuario_id AND barbero_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.dn_es_mi_cita(uuid), public.dn_es_mi_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dn_es_mi_cita(uuid), public.dn_es_mi_cliente(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 1. La política "equipo" pasa a ser solo de administradores
-- ---------------------------------------------------------------------
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
           WHERE p.polname = 'equipo' AND c.relnamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('DROP POLICY equipo ON public.%I', t.relname);
    EXECUTE format('CREATE POLICY admins ON public.%I FOR ALL TO authenticated USING (public.dn_es_admin()) WITH CHECK (public.dn_es_admin())', t.relname);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 2. Barberos: solo lo que usa su app
-- ---------------------------------------------------------------------
-- Catálogos (solo lectura)
CREATE POLICY barbero_lee ON public.barberos FOR SELECT TO authenticated USING (public.dn_es_barbero());
CREATE POLICY barbero_lee ON public.servicios FOR SELECT TO authenticated USING (public.dn_es_barbero());
CREATE POLICY barbero_lee ON public.categorias_servicio FOR SELECT TO authenticated USING (public.dn_es_barbero());
CREATE POLICY barbero_lee ON public.sucursales FOR SELECT TO authenticated USING (public.dn_es_barbero());
CREATE POLICY barbero_lee ON public.configuracion_negocio FOR SELECT TO authenticated USING (public.dn_es_barbero());
CREATE POLICY barbero_lee ON public.metodos_pago FOR SELECT TO authenticated USING (public.dn_es_barbero());
CREATE POLICY barbero_lee ON public.app_config FOR SELECT TO authenticated USING (public.dn_es_barbero() AND key !~* '(password|token|secret|weibook)');
CREATE POLICY barbero_lee ON public.inventario_insumos FOR SELECT TO authenticated USING (public.dn_es_barbero());
CREATE POLICY barbero_lee ON public.inventario_productos_venta FOR SELECT TO authenticated USING (public.dn_es_barbero());

-- Bebidas: ver y descontar al entregar una
CREATE POLICY barbero_lee ON public.bebidas_inventario FOR SELECT TO authenticated USING (public.dn_es_barbero());
CREATE POLICY barbero_actualiza ON public.bebidas_inventario FOR UPDATE TO authenticated USING (public.dn_es_barbero()) WITH CHECK (public.dn_es_barbero());

-- Lo suyo
CREATE POLICY barbero_suyas ON public.citas FOR SELECT TO authenticated USING (barbero_id = auth.uid());
CREATE POLICY barbero_actualiza ON public.citas FOR UPDATE TO authenticated USING (barbero_id = auth.uid()) WITH CHECK (barbero_id = auth.uid());

CREATE POLICY barbero_suyas ON public.cita_items_adicionales FOR SELECT TO authenticated USING (public.dn_es_mi_cita(cita_id));
CREATE POLICY barbero_crea ON public.cita_items_adicionales FOR INSERT TO authenticated WITH CHECK (public.dn_es_mi_cita(cita_id));
CREATE POLICY barbero_borra ON public.cita_items_adicionales FOR DELETE TO authenticated USING (public.dn_es_mi_cita(cita_id));

CREATE POLICY barbero_suyas ON public.alertas_barbero FOR SELECT TO authenticated USING (barbero_id = auth.uid());
CREATE POLICY barbero_actualiza ON public.alertas_barbero FOR UPDATE TO authenticated USING (barbero_id = auth.uid()) WITH CHECK (barbero_id = auth.uid());

CREATE POLICY barbero_suyas ON public.bloqueos_barbero FOR SELECT TO authenticated USING (barbero_id = auth.uid());
CREATE POLICY barbero_suyas ON public.comisiones FOR SELECT TO authenticated USING (barbero_id = auth.uid());
CREATE POLICY barbero_suyas ON public.pagos_comisiones FOR SELECT TO authenticated USING (barbero_id = auth.uid());
CREATE POLICY barbero_suyas ON public.resenas FOR SELECT TO authenticated USING (barbero_id = auth.uid());

CREATE POLICY barbero_suyas ON public.consumos_bebidas_barbero FOR SELECT TO authenticated USING (barbero_id = auth.uid());
CREATE POLICY barbero_crea ON public.consumos_bebidas_barbero FOR INSERT TO authenticated WITH CHECK (barbero_id = auth.uid());

CREATE POLICY barbero_crea ON public.solicitudes_insumos FOR INSERT TO authenticated WITH CHECK (barbero_id = auth.uid());

-- Usuarios: su propio perfil y los clientes de sus citas
CREATE POLICY barbero_lee ON public.usuarios FOR SELECT TO authenticated
  USING (public.dn_es_barbero() AND (id = auth.uid() OR public.dn_es_mi_cliente(id)));
CREATE POLICY barbero_actualiza ON public.usuarios FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ---------------------------------------------------------------------
-- 3. Solo un admin puede cambiar rol, saldo, puntos, etc.
--    (antes bastaba con ser del equipo)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._dn_usuarios_proteger_campos()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR (current_user = 'authenticated' AND public.dn_es_admin()) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.role := 'cliente';
    NEW.saldo_wallet := 0;
    NEW.points := 0;
    NEW.es_embajador := false;
    NEW.notas_admin := NULL;
    NEW.total_visitas_weibook := 0;
    NEW.total_gastado_weibook := 0;
    NEW.membership_tier := NULL;
    NEW.lealtad_info := NULL;
  ELSE
    NEW.role := OLD.role;
    NEW.username := CASE WHEN OLD.role IN ('admin', 'admin_sede', 'barbero', 'aseo') THEN OLD.username ELSE NEW.username END;
    NEW.saldo_wallet := OLD.saldo_wallet;
    NEW.points := OLD.points;
    NEW.es_embajador := OLD.es_embajador;
    NEW.notas_admin := OLD.notas_admin;
    NEW.total_visitas_weibook := OLD.total_visitas_weibook;
    NEW.total_gastado_weibook := OLD.total_gastado_weibook;
    NEW.membership_tier := OLD.membership_tier;
    NEW.lealtad_info := OLD.lealtad_info;
    NEW.pin_activacion_hasta := OLD.pin_activacion_hasta;
  END IF;
  NEW.password_hash := NULL;
  NEW.pin_cliente := NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._dn_usuarios_proteger_campos() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Funciones del panel: solo admin
--    (auth.jwt()->>'role' es 'authenticated'/'anon' en llamadas desde la
--    app; los cron y edge functions con service_role no pasan por aquí)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._dn_exigir_admin()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF coalesce(auth.jwt()->>'role', '') IN ('authenticated', 'anon') AND NOT public.dn_es_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._dn_exigir_admin() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  f record;
  def text;
BEGIN
  FOR f IN
    SELECT p.oid FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
    WHERE p.pronamespace = 'public'::regnamespace AND l.lanname = 'plpgsql'
      AND p.proname IN ('registrar_cobro_v2', 'toggle_whatsapp_cron', 'buscar_cliente_por_telefono',
                        'get_historial_cliente', 'get_historial_cliente_by_id', 'get_visitas_por_sucursal',
                        'actualizar_lealtad_cliente', 'crear_short_urls_cita')
      AND position('_dn_exigir_admin' in p.prosrc) = 0
  LOOP
    def := pg_get_functiondef(f.oid);
    def := regexp_replace(def, E'\nBEGIN[ \t]*\n', E'\nBEGIN\n  PERFORM public._dn_exigir_admin();\n');
    EXECUTE def;
  END LOOP;
END $$;
