// Función desactivada por seguridad (14-oct-2026): permitía enviar mensajes a
// nombre de la barbería sin autenticación y la app no la usa.
// El código original quedó en supabase/functions/_desactivadas/<nombre>/.
Deno.serve(() =>
  new Response(JSON.stringify({ success: false, error: 'Función desactivada' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json' }
  })
);
