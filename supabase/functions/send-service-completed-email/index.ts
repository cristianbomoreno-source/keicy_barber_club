import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const FROM_EMAIL = "citas@diegoneirabarber.com";
const FROM_NAME = "Diego Neira Barbería";

interface ServicioCompletadoData {
  cliente_nombre: string;
  cliente_email: string;
  cliente_telefono: string;
  barbero_nombre: string;
  servicio_nombre: string;
  servicios_adicionales?: { nombre: string; precio: number }[];
  fecha: string;
  hora: string;
  precio_servicio: number;
  propina?: number;
  precio_total: number;
  metodo_pago?: string;
  sede_nombre: string;
  sede_direccion: string;
  google_maps_link?: string;
  cita_id: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function formatDate(fecha: string): string {
  const date = new Date(fecha + "T12:00:00");
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  return date.toLocaleDateString("es-CO", options);
}

function formatPrice(precio: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(precio);
}

function generateEmailHTML(data: ServicioCompletadoData): string {
  const serviciosExtra = data.servicios_adicionales?.length
    ? data.servicios_adicionales.map((s) => `
      <tr>
        <td style="padding:8px 0; color:#666666; font-size:13px; border-bottom:1px solid #E5E5E5;">${s.nombre}</td>
        <td style="padding:8px 0; color:#111111; font-size:13px; text-align:right; border-bottom:1px solid #E5E5E5;">${formatPrice(s.precio)}</td>
      </tr>`).join("")
    : "";

  const propinaRow = data.propina && data.propina > 0 ? `
    <tr>
      <td style="padding:8px 0; color:#D4AF55; font-size:13px;">Propina</td>
      <td style="padding:8px 0; color:#D4AF55; font-size:13px; text-align:right;">${formatPrice(data.propina)}</td>
    </tr>` : "";

  const metodoPagoLabel = data.metodo_pago
    ? data.metodo_pago.charAt(0).toUpperCase() + data.metodo_pago.slice(1)
    : "";

  const resenaLink = `https://www.diegoneirabarber.com/resena/?c=${encodeURIComponent(data.cita_id)}`;
  const googleMapsLink = data.google_maps_link || "https://g.page/r/Cac1YymF3Bu0EBM/review";

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gracias por tu visita - Diego Neira Barbería</title>
</head>
<body style="margin:0; padding:0; background-color:#FFFFFF; font-family:'Georgia', 'Times New Roman', serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#FFFFFF;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:500px; background-color:#FFFFFF;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:32px 24px 24px; text-align:center;">
              <table role="presentation" width="100" height="100" cellspacing="0" cellpadding="0" style="margin:0 auto;">
                <tr>
                  <td align="center" valign="middle" style="width:100px; height:100px; border-radius:50%; background-color:#FFFFFF; border:2px solid #E5E5E5;">
                    <img src="https://www.diegoneirabarber.com/assets/logo.png" alt="Diego Neira Barbería" width="60" height="60" style="width:60px; height:60px; display:block;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Header -->
          <tr>
            <td align="center" style="padding:0 24px 32px;">
              <h1 style="margin:0; color:#111111; font-size:28px; font-weight:400; font-style:italic; font-family:'Georgia', 'Times New Roman', serif;">¡Gracias por tu visita!</h1>
              <p style="margin:12px 0 0; color:#666666; font-size:15px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Esperamos verte pronto, ${data.cliente_nombre}</p>
            </td>
          </tr>

          <!-- Factura -->
          <tr>
            <td style="padding:0 24px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#FAFAFA; border-radius:16px; border:1px solid #E5E5E5;">

                <!-- Encabezado factura -->
                <tr>
                  <td style="padding:20px; border-bottom:1px solid #E5E5E5;">
                    <p style="margin:0; color:#D4AF55; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Detalle de tu servicio</p>
                    <p style="margin:6px 0 0; color:#666666; font-size:13px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${formatDate(data.fecha)}</p>
                  </td>
                </tr>

                <!-- Items -->
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <!-- Servicio principal -->
                      <tr>
                        <td style="padding:8px 0; color:#111111; font-size:14px; font-weight:600; border-bottom:1px solid #E5E5E5; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${data.servicio_nombre}</td>
                        <td style="padding:8px 0; color:#111111; font-size:14px; text-align:right; border-bottom:1px solid #E5E5E5; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${formatPrice(data.precio_servicio)}</td>
                      </tr>
                      ${serviciosExtra}
                      ${propinaRow}
                    </table>
                  </td>
                </tr>

                <!-- Total -->
                <tr>
                  <td style="padding:20px; border-top:1px solid #E5E5E5; background:rgba(212,175,85,0.08);">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td>
                          <p style="margin:0; color:#111111; font-size:14px; font-weight:700; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">TOTAL</p>
                          ${metodoPagoLabel ? `<p style="margin:2px 0 0; color:#666666; font-size:11px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Pagado con ${metodoPagoLabel}</p>` : ""}
                        </td>
                        <td align="right">
                          <p style="margin:0; color:#D4AF55; font-size:24px; font-weight:700; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${formatPrice(data.precio_total)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Barbero y Sede -->
                <tr>
                  <td style="padding:20px; border-top:1px solid #E5E5E5;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="50%">
                          <p style="margin:0; color:#D4AF55; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Atendido por</p>
                          <p style="margin:6px 0 0; color:#111111; font-size:14px; font-weight:600; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${data.barbero_nombre || "Diego Neira Barbería"}</p>
                        </td>
                        <td width="50%">
                          <p style="margin:0; color:#D4AF55; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Sede</p>
                          <p style="margin:6px 0 0; color:#111111; font-size:14px; font-weight:600; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${data.sede_nombre}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- CTA Reseña con estrellas clicables -->
          <tr>
            <td style="padding:0 24px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:rgba(212,175,85,0.08); border-radius:16px; border:1px solid rgba(212,175,85,0.2);">
                <tr>
                  <td style="padding:24px; text-align:center;">
                    <p style="margin:0 0 8px; color:#111111; font-size:16px; font-weight:600; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">¿Cómo fue tu experiencia?</p>
                    <p style="margin:0 0 16px; color:#666666; font-size:13px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Toca una estrella para calificar</p>
                    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto;">
                      <tr>
                        <td style="padding:0 4px;">
                          <a href="${resenaLink}&r=1" target="_blank" style="display:block; text-decoration:none; font-size:32px; line-height:1;">⭐</a>
                        </td>
                        <td style="padding:0 4px;">
                          <a href="${resenaLink}&r=2" target="_blank" style="display:block; text-decoration:none; font-size:32px; line-height:1;">⭐</a>
                        </td>
                        <td style="padding:0 4px;">
                          <a href="${resenaLink}&r=3" target="_blank" style="display:block; text-decoration:none; font-size:32px; line-height:1;">⭐</a>
                        </td>
                        <td style="padding:0 4px;">
                          <a href="${resenaLink}&r=4" target="_blank" style="display:block; text-decoration:none; font-size:32px; line-height:1;">⭐</a>
                        </td>
                        <td style="padding:0 4px;">
                          <a href="${resenaLink}&r=5" target="_blank" style="display:block; text-decoration:none; font-size:32px; line-height:1;">⭐</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Google Maps -->
          <tr>
            <td style="padding:0 24px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <p style="margin:0 0 14px; color:#666666; font-size:13px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">¿Te gustó? También puedes ayudarnos en Google</p>
                    <a href="${googleMapsLink}" target="_blank" style="display:inline-block; padding:14px 28px; background:#111111; color:#ffffff; text-decoration:none; border-radius:12px; font-size:13px; font-weight:600; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                      Reseña en Google Maps
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Tagline -->
          <tr>
            <td align="center" style="padding:0 24px 16px;">
              <p style="margin:0; color:#D4AF55; font-size:10px; font-weight:600; letter-spacing:2px; text-transform:uppercase; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                TU ESTILO, NUESTRA PASIÓN
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:0 24px 32px;">
              <p style="margin:0; color:#999999; font-size:11px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Diego Neira Barbería · ${data.sede_direccion}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!BREVO_API_KEY) {
      throw new Error("BREVO_API_KEY no configurada");
    }

    // Verificar si el correo de recibo está activo
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: config } = await supabase
      .from('configuracion_global')
      .select('value')
      .eq('key', 'email_recibo_activo')
      .single();

    if (config?.value === false) {
      console.log('[ServiceCompletedEmail] Correo de recibo está PAUSADO');
      return new Response(JSON.stringify({
        success: true,
        message: 'Correo de recibo pausado por configuración'
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data: ServicioCompletadoData = await req.json();

    if (!data.cliente_email || !data.cliente_nombre) {
      throw new Error("Faltan datos del cliente");
    }

    const emailHTML = generateEmailHTML(data);

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: {
          name: FROM_NAME,
          email: FROM_EMAIL,
        },
        to: [
          {
            email: data.cliente_email,
            name: data.cliente_nombre,
          },
        ],
        subject: `✂️ Gracias por tu visita - ${data.sede_nombre}`,
        htmlContent: emailHTML,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Brevo error:", error);
      throw new Error(`Error enviando email: ${response.status}`);
    }

    const result = await response.json();

    return new Response(
      JSON.stringify({ success: true, messageId: result.messageId }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
