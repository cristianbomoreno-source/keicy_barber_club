-- El aliado puede devolver a "no reclamada" una cortesía en cualquier momento
-- (antes solo dentro de los 15 minutos siguientes).

CREATE OR REPLACE FUNCTION public.aliado_deshacer_reclamado(p_token text, p_cliente_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  a public.aliados := public._dn_aliado_de_token(p_token);
BEGIN
  DELETE FROM aliado_canjes WHERE aliado_id = a.id AND cliente_id = p_cliente_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este cliente no tenía la cortesía reclamada');
  END IF;
  RETURN jsonb_build_object('success', true);
END $$;
