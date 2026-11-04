-- 3-nov-2026: cuenta de admin de sede "adminsede" para La Flora (aplicada en producción).
-- La clave no se guarda en el repo. Se inserta primero sin clave: el trigger de credenciales
-- registra el evento en staff_auth_eventos y necesita que la fila ya exista.
insert into usuarios (username, full_name, role, sucursal_id)
values ('adminsede', 'Admin Sede La Flora', 'admin_sede', '46c99064-8218-41a0-a8c7-a81103f658fa');
-- update usuarios set password_hash = '<clave>' where username = 'adminsede';
