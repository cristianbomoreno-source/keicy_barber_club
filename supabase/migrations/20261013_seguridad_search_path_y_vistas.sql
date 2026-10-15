-- Arreglos del linter de seguridad que no cambian permisos de acceso.
-- (El login no usa Supabase Auth: todo el frontend opera como anon, así que
--  RLS/revocar permisos a anon queda pendiente hasta migrar el login.)

-- 1. search_path fijo en las funciones de public que no lo tienen.
--    Incluye extensions porque pgcrypto/uuid-ossp/pg_net viven ahí.
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind IN ('f', 'p')
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', f);
  END LOOP;
END $$;

-- 2. Vistas con los permisos de quien consulta (las tablas base ya tienen lectura pública).
ALTER VIEW public.sucursales_publicas SET (security_invoker = true);
ALTER VIEW public.servicios_publicos SET (security_invoker = true);
ALTER VIEW public.clientes_resumen SET (security_invoker = true);
