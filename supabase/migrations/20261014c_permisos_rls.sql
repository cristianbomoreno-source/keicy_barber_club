-- =====================================================================
-- Permisos por rol (RLS) una vez que el equipo usa Supabase Auth
--
-- * Equipo (admin, admin de sede, barberos con sesión real): acceso completo.
-- * Público (clave anon: reservas web, sección de clientes, confirmar/cancelar,
--   reseñas, recibos, páginas de emergencia): solo lo que esas páginas usan.
-- * Funciones: el público solo puede ejecutar las de reservas, clientes y login.
--
-- Pendiente (requiere sesión real para clientes): la sección de clientes y las
-- reservas siguen necesitando leer/actualizar citas y usuarios con la clave
-- pública.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Nota: se aplicó con execute_sql en dos partes (la herramienta de
-- migraciones fallaba por conexión), con lock_timeout = '5s'.

-- 1. Todas las tablas: RLS activo, sin políticas viejas, acceso del equipo
-- ---------------------------------------------------------------------
DO $$
DECLARE t record; p record;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
      AND c.relname NOT IN ('usuarios_credenciales')
  LOOP
    FOR p IN SELECT polname FROM pg_policy WHERE polrelid = format('public.%I', t.relname)::regclass LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.polname, t.relname);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    IF t.relname <> 'staff_auth_eventos' THEN
      EXECUTE format('CREATE POLICY equipo ON public.%I FOR ALL TO authenticated USING (public.dn_es_staff()) WITH CHECK (public.dn_es_staff())', t.relname);
    END IF;
  END LOOP;
END $$;

CREATE POLICY admins_leen ON public.staff_auth_eventos FOR SELECT TO authenticated USING (public.dn_es_admin());

-- ---------------------------------------------------------------------
-- 2. Lo que necesita el público (clave anon)
-- ---------------------------------------------------------------------
-- Catálogos y datos de reserva (solo lectura)
CREATE POLICY publico_lee ON public.app_config FOR SELECT TO anon USING (key !~* '(password|token|secret|weibook)');
CREATE POLICY publico_lee ON public.barberos FOR SELECT TO anon USING (true);
CREATE POLICY publico_lee ON public.bloqueos_barbero FOR SELECT TO anon USING (true);
CREATE POLICY publico_lee ON public.categorias_servicio FOR SELECT TO anon USING (true);
CREATE POLICY publico_lee ON public.configuracion_negocio FOR SELECT TO anon USING (true);
CREATE POLICY publico_lee ON public.servicios FOR SELECT TO anon USING (true);
CREATE POLICY publico_lee ON public.sucursales FOR SELECT TO anon USING (true);
CREATE POLICY publico_lee ON public.short_urls FOR SELECT TO anon USING (true);
CREATE POLICY publico_lee ON public.metodos_pago FOR SELECT TO anon USING (true);
CREATE POLICY publico_lee ON public.recompensas FOR SELECT TO anon USING (true);
CREATE POLICY publico_lee ON public.retos FOR SELECT TO anon USING (true);
CREATE POLICY publico_lee ON public.loyalty_benefits FOR SELECT TO anon
  USING (activo = true AND fecha_inicio <= CURRENT_DATE AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE));

-- Reseñas (página de reseña y reservas)
CREATE POLICY publico_lee ON public.resenas FOR SELECT TO anon USING (true);
CREATE POLICY publico_crea ON public.resenas FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY publico_lee ON public.tickets FOR SELECT TO anon USING (true);

-- Visitas a la página de reservas (estadística)
CREATE POLICY publico_crea ON public.visitas_reservas FOR INSERT TO anon WITH CHECK (true);

-- Citas: reservar, confirmar, cancelar, ver recibo y la sección de clientes.
-- Sin borrar.
CREATE POLICY publico_lee ON public.citas FOR SELECT TO anon USING (true);
CREATE POLICY publico_crea ON public.citas FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY publico_actualiza ON public.citas FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Usuarios: el público solo crea o modifica clientes (nunca cuentas del equipo).
CREATE POLICY publico_lee ON public.usuarios FOR SELECT TO anon USING (true);
CREATE POLICY publico_crea ON public.usuarios FOR INSERT TO anon WITH CHECK (role = 'cliente');
CREATE POLICY publico_actualiza ON public.usuarios FOR UPDATE TO anon USING (role = 'cliente') WITH CHECK (role = 'cliente');

-- Campos que el público nunca puede cambiar (saldo, puntos, embajador, notas...).
CREATE OR REPLACE FUNCTION public._dn_usuarios_proteger_campos()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR (current_user = 'authenticated' AND public.dn_es_staff()) THEN
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

-- Debe correr antes que trg_usuarios_credenciales (orden alfabético).
DROP TRIGGER IF EXISTS trg_a_usuarios_proteger ON public.usuarios;
CREATE TRIGGER trg_a_usuarios_proteger
  BEFORE INSERT OR UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public._dn_usuarios_proteger_campos();

-- ---------------------------------------------------------------------
-- 3. Funciones: el público solo ejecuta las de reservas, clientes y login
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.buscar_cliente_login(text, text),
  public.validar_pin_cliente(text, text, text),
  public.crear_pin_cliente(uuid, text),
  public.crear_pin_cliente(uuid, text, boolean, text),
  public.actualizar_perfil_cliente(uuid, text, text, text, date, text),
  public.crear_cita_cliente(uuid, uuid, uuid, date, text),
  public.obtener_horarios_disponibles(uuid, date, integer),
  public.obtener_preferencias_cliente(uuid),
  public.get_beneficios_por_categoria(text),
  public.get_promocion_semanal(),
  public.info_lealtad(integer),
  public.dn_login_resolver(text),
  public.dn_crear_pin_staff(uuid, text),
  public.dn_cliente_login_clave(text, text),
  public.dn_cliente_registro(text, text),
  public.dn_es_staff(),
  public.dn_es_admin()
TO anon;

-- Solo para procesos internos (cron, triggers, edge functions con service_role)
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND (p.proname LIKE '\_dn\_%'
        OR p.proname IN ('abrir_cajas_automatico', 'cerrar_cajas_automatico',
          'claim_citas_confirmacion_5pm', 'claim_citas_confirmacion_9am', 'claim_citas_confirmacion_inmediata', 'claim_citas_para_recordatorio',
          'marcar_confirmacion_enviada', 'marcar_confirmacion_fallida', 'marcar_recordatorio_enviado', 'marcar_recordatorio_fallido',
          'crear_action_tokens_confirmacion', 'crear_action_tokens_pendientes', 'registrar_cron_whatsapp', 'limpiar_otp_expirados',
          'generar_otp', 'validar_otp', 'validar_action_token',
          'trigger_confirmacion_inmediata', 'validar_cita_web_reservas', 'validar_email_reserva',
          'asignar_barberos_favoritos_weibook', 'asignar_servicios_favoritos_weibook', 'actualizar_stats_cliente_weibook'))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f);
  END LOOP;
END $$;

-- Funciones nuevas: sin acceso público por defecto
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
