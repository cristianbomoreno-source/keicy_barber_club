-- Motivo del descuento (obligatorio en Ventas desde 21-oct-2026).
-- Antes el campo se pedía en la ventana de descuento pero nunca se guardaba.
-- registrar_cobro_v2 no cambia: el cliente guarda el motivo justo después del cobro
-- con dn_ticket_descuento_motivo (solo personal con sesión, solo tickets con
-- descuento creados hace menos de 30 minutos y sin motivo aún).

ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS descuento_motivo text;

CREATE OR REPLACE FUNCTION public.dn_ticket_descuento_motivo(p_ticket_id uuid, p_motivo text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_motivo text := nullif(left(trim(coalesce(p_motivo, '')), 200), '');
BEGIN
  IF auth.uid() IS NULL OR v_motivo IS NULL THEN
    RETURN false;
  END IF;
  UPDATE tickets
  SET descuento_motivo = v_motivo
  WHERE id = p_ticket_id
    AND descuento > 0
    AND descuento_motivo IS NULL
    AND created_at > now() - interval '30 minutes';
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.dn_ticket_descuento_motivo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dn_ticket_descuento_motivo(uuid, text) TO authenticated;
