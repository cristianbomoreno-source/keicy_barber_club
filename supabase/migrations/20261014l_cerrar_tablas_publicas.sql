-- 14-oct-2026 · Parte 2 de 2: cerrar citas, usuarios y reseñas a visitantes sin sesión
-- Las páginas públicas ya usan las funciones de 20261014k.

-- Citas: sin acceso directo
DROP POLICY IF EXISTS publico_lee ON public.citas;
DROP POLICY IF EXISTS publico_crea ON public.citas;
DROP POLICY IF EXISTS publico_actualiza ON public.citas;
REVOKE INSERT, UPDATE, DELETE ON public.citas FROM anon;

-- Reseñas: se leen y crean por dn_publico_resenas / dn_crear_resena
DROP POLICY IF EXISTS publico_lee ON public.resenas;
DROP POLICY IF EXISTS publico_crea ON public.resenas;
REVOKE INSERT, UPDATE, DELETE ON public.resenas FROM anon;

-- Usuarios: el visitante solo ve al equipo y solo columnas públicas
-- (nombre, foto e Instagram de barberos). Nada de clientes, celulares ni correos.
DROP POLICY IF EXISTS publico_lee ON public.usuarios;
DROP POLICY IF EXISTS publico_crea ON public.usuarios;
DROP POLICY IF EXISTS publico_actualiza ON public.usuarios;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.usuarios FROM anon;
GRANT SELECT (id, username, full_name, avatar_url, avatar_focus_y, avatar_focus_y_reservas,
              avatar_focus_y_agenda, avatar_focus_y_barbero, instagram, role)
  ON public.usuarios TO anon;
CREATE POLICY publico_equipo ON public.usuarios FOR SELECT TO anon
  USING (role IN ('barbero', 'admin', 'admin_sede', 'aseo'));

-- Funciones viejas que aceptaban cualquier cliente_id: ahora solo por las dn_cliente_* con token
REVOKE EXECUTE ON FUNCTION public.actualizar_perfil_cliente(uuid, text, text, text, date, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crear_cita_cliente(uuid, uuid, uuid, date, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.obtener_preferencias_cliente(uuid) FROM PUBLIC, anon;
