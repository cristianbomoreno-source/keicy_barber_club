-- Reinicia el PIN de los barberos que nunca lo crearon (su plazo venció el 21-oct).
-- Igual que dn_staff_reiniciar_pin: 2 días para crearlo al entrar. Danny Uribe ya
-- tiene PIN y no se toca.
UPDATE public.usuarios
SET pin_activacion_hasta = now() + interval '2 days'
WHERE username IN ('daniel_rojas', 'gabriel_ruiz', 'jorge_atoy', 'nicolas_castillo')
  AND role = 'barbero'
  AND NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = usuarios.id);

SELECT public._dn_log_auth(id, 'pin_reiniciado', '{"via":"soporte"}'::jsonb)
FROM public.usuarios
WHERE username IN ('daniel_rojas', 'gabriel_ruiz', 'jorge_atoy', 'nicolas_castillo');

-- sedelaflora es una cuenta vieja del admin de sede guardada como barbero (el admin
-- de sede real es adminsede). Se cierra su plazo para que nadie cree un PIN con ella.
UPDATE public.usuarios SET pin_activacion_hasta = NULL WHERE username = 'sedelaflora' AND role = 'barbero';
