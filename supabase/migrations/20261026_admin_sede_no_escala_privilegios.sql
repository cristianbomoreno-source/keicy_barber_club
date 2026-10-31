-- Solo el administrador principal (role = 'admin') puede crear, editar, cambiar la
-- clave o borrar cuentas de admin y admin de sede. Antes, un admin de sede podía
-- subirse a 'admin' o cambiar la clave del admin principal editando la tabla.
-- Los admins de sede siguen pudiendo editar su propio perfil (sin rol ni clave)
-- y manejar clientes y barberos.

CREATE OR REPLACE FUNCTION public._dn_usuarios_proteger_campos()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_es_admin_principal boolean;
BEGIN
  IF current_user = 'authenticated' AND public.dn_es_admin() THEN
    v_es_admin_principal := EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND role = 'admin');
    IF NOT v_es_admin_principal THEN
      IF TG_OP = 'INSERT' AND NEW.role IN ('admin', 'admin_sede') THEN
        RAISE EXCEPTION 'Solo el administrador principal puede crear administradores' USING ERRCODE = '42501';
      ELSIF TG_OP = 'DELETE' AND OLD.role IN ('admin', 'admin_sede') THEN
        RAISE EXCEPTION 'Solo el administrador principal puede borrar administradores' USING ERRCODE = '42501';
      ELSIF TG_OP = 'UPDATE' AND (OLD.role IN ('admin', 'admin_sede') OR NEW.role IN ('admin', 'admin_sede')) THEN
        IF NOT (OLD.id = auth.uid() AND NEW.id = OLD.id AND NEW.role = OLD.role
                AND coalesce(NEW.password_hash, '') = '' AND coalesce(NEW.pin_cliente, '') = '') THEN
          RAISE EXCEPTION 'Solo el administrador principal puede modificar cuentas de administradores' USING ERRCODE = '42501';
        END IF;
      END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  IF current_user NOT IN ('anon', 'authenticated') THEN
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
    NEW.sucursal_id := OLD.sucursal_id;
  END IF;
  NEW.password_hash := NULL;
  NEW.pin_cliente := NULL;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_a_usuarios_proteger ON public.usuarios;
CREATE TRIGGER trg_a_usuarios_proteger
  BEFORE INSERT OR UPDATE OR DELETE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION _dn_usuarios_proteger_campos();
