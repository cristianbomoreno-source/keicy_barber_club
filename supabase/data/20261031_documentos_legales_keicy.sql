-- Versiones publicadas de los documentos legales de Keicy y su huella SHA-256
-- (sha256sum del archivo tal como está en git). Al cambiar un documento:
-- sube su versión en assets/legal.js y agrega aquí una fila nueva.
INSERT INTO public.documentos_legales (tipo, version, url, sha256, vigente_desde) VALUES
  ('terminos',   '2.0', 'https://www.keicybarberclub.com/terms.html',      'afd973f75d47779e2aff85a8c96c6d0a77ab298cdc2e6d38463073e9482dcb80', '2026-10-31 00:00:00-05'),
  ('privacidad', '2.0', 'https://www.keicybarberclub.com/privacy.html',    '3d281af0309f42c8d5be9147990793e40614c99465c692770c7d0f921eb60706', '2026-10-31 00:00:00-05'),
  ('cookies',    '1.0', 'https://www.keicybarberclub.com/cookies.html',    '59c633da5c851f0df102a9e11df17d9986ad2f24fe8d0c83bee3d955926ebd6c', '2026-10-31 00:00:00-05'),
  ('reembolsos', '1.0', 'https://www.keicybarberclub.com/reembolsos.html', 'ccd3c4bd8412a31f401587ff86cb144ff17e823b835a28ce661cb3046efa75f1', '2026-10-31 00:00:00-05')
ON CONFLICT (tipo, version) DO UPDATE SET url = EXCLUDED.url, sha256 = EXCLUDED.sha256;
