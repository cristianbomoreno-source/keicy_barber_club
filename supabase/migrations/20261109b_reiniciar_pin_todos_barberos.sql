-- Reinicia el PIN de todos los barberos activos (lo mismo que dn_staff_reiniciar_pin):
-- borra su acceso actual, cierra sus sesiones y les da 2 días para crear un PIN nuevo.
SELECT public._dn_borrar_auth(u.id)
FROM public.usuarios u JOIN public.barberos b ON b.id = u.id
WHERE u.role IN ('barbero', 'aseo');

UPDATE public.usuarios u
SET pin_activacion_hasta = now() + interval '2 days'
FROM public.barberos b
WHERE b.id = u.id AND u.role IN ('barbero', 'aseo');

SELECT public._dn_log_auth(u.id, 'pin_reiniciado', '{"via":"soporte"}'::jsonb)
FROM public.usuarios u JOIN public.barberos b ON b.id = u.id
WHERE u.role IN ('barbero', 'aseo');
