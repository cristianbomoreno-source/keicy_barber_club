-- Registro legal de consentimientos (Ley 1581 de 2012, Decreto 1074 de 2015
-- art. 2.2.2.25.2.5: el responsable debe conservar prueba de la autorización).
--
-- 1. documentos_legales: qué versión de cada documento estaba publicada y desde
--    cuándo, con el hash SHA-256 del archivo (el texto exacto vive en git).
-- 2. consentimientos: una fila por cada aceptación o rechazo. Solo se inserta;
--    un trigger impide editar o borrar filas, para que sirva como prueba.
-- 3. usuarios.autoriza_publicidad: autorización aparte para mensajes
--    comerciales (Ley 2300 de 2023). Sin ella, no se le envía publicidad.

CREATE TABLE IF NOT EXISTS public.documentos_legales (
  tipo text NOT NULL CHECK (tipo IN ('terminos', 'privacidad', 'cookies', 'reembolsos')),
  version text NOT NULL,
  url text NOT NULL,
  sha256 text,
  vigente_desde timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tipo, version)
);

CREATE TABLE IF NOT EXISTS public.consentimientos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Sin llave foránea a propósito: si el cliente pide borrar sus datos, la
  -- prueba de que autorizó (y de que luego revocó) debe seguir existiendo.
  usuario_id uuid,
  telefono text,
  nombre text,
  documento text NOT NULL CHECK (documento IN
    ('terminos', 'privacidad', 'reembolsos', 'publicidad', 'cookies_analitica', 'cookies_publicidad')),
  version text NOT NULL,
  aceptado boolean NOT NULL,
  canal text NOT NULL CHECK (canal IN
    ('web_reservas', 'club_registro', 'banner_cookies', 'revocacion', 'migracion')),
  metodo text NOT NULL DEFAULT 'casilla_web',
  texto_aceptado text,
  url text,
  ip text,
  user_agent text,
  dispositivo_id text,
  evidencia jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS consentimientos_usuario_idx ON public.consentimientos (usuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS consentimientos_telefono_idx ON public.consentimientos (telefono, created_at DESC);
CREATE INDEX IF NOT EXISTS consentimientos_fecha_idx ON public.consentimientos (created_at DESC);

CREATE OR REPLACE FUNCTION public._dn_consentimientos_inmutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'El registro de consentimientos no se puede modificar ni borrar. Para revocar, inserta una fila nueva con aceptado = false.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS consentimientos_inmutable ON public.consentimientos;
CREATE TRIGGER consentimientos_inmutable
  BEFORE UPDATE OR DELETE ON public.consentimientos
  FOR EACH ROW EXECUTE FUNCTION public._dn_consentimientos_inmutable();

DROP TRIGGER IF EXISTS consentimientos_no_truncate ON public.consentimientos;
CREATE TRIGGER consentimientos_no_truncate
  BEFORE TRUNCATE ON public.consentimientos
  FOR EACH STATEMENT EXECUTE FUNCTION public._dn_consentimientos_inmutable();

-- Nadie lee ni escribe las tablas directamente: solo por las funciones de abajo.
ALTER TABLE public.consentimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_legales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consentimientos FROM anon, authenticated;
REVOKE ALL ON public.documentos_legales FROM anon, authenticated;
GRANT SELECT ON public.documentos_legales TO anon, authenticated;
DROP POLICY IF EXISTS documentos_legales_lectura ON public.documentos_legales;
CREATE POLICY documentos_legales_lectura ON public.documentos_legales FOR SELECT USING (true);

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS autoriza_publicidad boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS autoriza_publicidad_at timestamptz;

-- Registra una o varias aceptaciones/rechazos de una vez.
-- p_documentos: [{"documento":"terminos","version":"2.0","aceptado":true}, ...]
-- La IP la toma el servidor de los encabezados de la petición (no la manda el navegador).
CREATE OR REPLACE FUNCTION public.dn_registrar_consentimiento(
  p_documentos jsonb,
  p_canal text,
  p_usuario_id uuid DEFAULT NULL,
  p_telefono text DEFAULT NULL,
  p_nombre text DEFAULT NULL,
  p_texto text DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_dispositivo_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_headers json;
  v_ip text;
  v_tel text := nullif(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), '');
  v_nombre text := nullif(left(trim(coalesce(p_nombre, '')), 120), '');
  v_usuario uuid;
  v_doc jsonb;
  v_documento text;
  v_version text;
  v_aceptado boolean;
  v_n integer := 0;
BEGIN
  IF p_canal IS NULL OR p_canal NOT IN ('web_reservas', 'club_registro', 'banner_cookies', 'revocacion') THEN
    RAISE EXCEPTION 'Canal inválido';
  END IF;
  IF jsonb_typeof(p_documentos) <> 'array' OR jsonb_array_length(p_documentos) = 0
     OR jsonb_array_length(p_documentos) > 6 THEN
    RAISE EXCEPTION 'Lista de documentos inválida';
  END IF;

  BEGIN
    v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  v_ip := left(trim(split_part(coalesce(
            v_headers->>'cf-connecting-ip',
            v_headers->>'x-forwarded-for',
            v_headers->>'x-real-ip', ''), ',', 1)), 64);

  IF p_usuario_id IS NOT NULL THEN
    SELECT id, coalesce(v_tel, regexp_replace(coalesce(phone, ''), '\D', '', 'g')), coalesce(v_nombre, full_name)
      INTO v_usuario, v_tel, v_nombre
    FROM usuarios WHERE id = p_usuario_id AND role = 'cliente';
  END IF;

  FOR v_doc IN SELECT * FROM jsonb_array_elements(p_documentos) LOOP
    v_documento := v_doc->>'documento';
    v_version := left(coalesce(v_doc->>'version', ''), 20);
    v_aceptado := coalesce((v_doc->>'aceptado')::boolean, false);
    IF v_documento IS NULL OR v_version = '' THEN
      RAISE EXCEPTION 'Documento o versión faltante';
    END IF;

    INSERT INTO consentimientos (usuario_id, telefono, nombre, documento, version, aceptado, canal,
      texto_aceptado, url, ip, user_agent, dispositivo_id, evidencia)
    VALUES (v_usuario, v_tel, v_nombre, v_documento, v_version, v_aceptado, p_canal,
      left(p_texto, 2000), left(p_url, 500), nullif(v_ip, ''), left(coalesce(p_user_agent, v_headers->>'user-agent'), 500),
      left(p_dispositivo_id, 64),
      jsonb_build_object('origin', v_headers->>'origin', 'referer', left(v_headers->>'referer', 500)));
    v_n := v_n + 1;

    IF v_usuario IS NOT NULL THEN
      IF v_documento = 'privacidad' AND v_aceptado THEN
        UPDATE usuarios SET acepto_politica_datos_at = now(), acepto_politica_datos_version = v_version
        WHERE id = v_usuario;
      ELSIF v_documento = 'publicidad' THEN
        UPDATE usuarios SET autoriza_publicidad = v_aceptado, autoriza_publicidad_at = now()
        WHERE id = v_usuario;
      END IF;
    END IF;
  END LOOP;

  RETURN v_n;
END;
$$;

-- Consulta para el administrador (o para responderle a la SIC): todo el
-- historial de un cliente buscando por celular, nombre o id.
CREATE OR REPLACE FUNCTION public.dn_admin_consentimientos(p_busqueda text DEFAULT NULL, p_limite integer DEFAULT 200)
RETURNS SETOF public.consentimientos
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_q text := trim(coalesce(p_busqueda, ''));
  v_dig text := regexp_replace(v_q, '\D', '', 'g');
BEGIN
  IF NOT public.dn_es_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT c.* FROM consentimientos c
    WHERE v_q = ''
       OR c.usuario_id::text = v_q
       OR (length(v_dig) >= 7 AND (c.telefono LIKE '%' || right(v_dig, 10)))
       OR (length(v_dig) < 7 AND c.nombre ILIKE '%' || v_q || '%')
    ORDER BY c.created_at DESC
    LIMIT least(greatest(coalesce(p_limite, 200), 1), 2000);
END;
$$;

REVOKE ALL ON FUNCTION public.dn_registrar_consentimiento(jsonb, text, uuid, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dn_registrar_consentimiento(jsonb, text, uuid, text, text, text, text, text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.dn_admin_consentimientos(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dn_admin_consentimientos(text, integer) TO authenticated;

-- Las 24 aceptaciones que ya existían (Club, creación de PIN) pasan al
-- registro. No tienen IP ni navegador porque antes no se guardaban.
INSERT INTO public.consentimientos (created_at, usuario_id, telefono, nombre, documento, version, aceptado,
  canal, metodo, texto_aceptado, evidencia)
SELECT u.acepto_politica_datos_at, u.id, regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), u.full_name,
  'privacidad', coalesce(u.acepto_politica_datos_version, '1.0'), true, 'migracion', 'casilla_web',
  'Acepto la Política de Tratamiento de Datos conforme a la Ley 1581 de 2012',
  jsonb_build_object('origen', 'usuarios.acepto_politica_datos_at', 'canal_original', 'club_registro',
    'nota', 'Aceptación anterior al 18-oct-2026; en ese momento no se guardaba IP ni navegador.')
FROM public.usuarios u
WHERE u.acepto_politica_datos_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.consentimientos c WHERE c.usuario_id = u.id AND c.canal = 'migracion');
