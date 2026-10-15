import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const FROM_EMAIL = "citas@keicybarberclub.com";
const FROM_NAME = "Keicy Barber Club";

interface CitaData {
  cita_id: string;
  cliente_nombre: string;
  cliente_email: string;
  cliente_telefono: string;
  barbero_nombre: string;
  servicio_nombre: string;
  servicios_adicionales?: { nombre: string; precio: number }[];
  fecha: string;
  hora: string;
  precio_total: number;
  sede_nombre: string;
  sede_direccion: string;
  textos?: {
    asunto?: string;
    titulo?: string;
    subtitulo?: string;
    recordatorio_titulo?: string;
    recordatorio_texto?: string;
    calendario_texto?: string;
    cancelar_texto?: string;
  };
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

function formatTime(hora: string): string {
  const [h, m] = hora.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

function formatPrice(precio: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(precio);
}

function generateCalendarLinks(data: CitaData): { google: string; outlook: string; ics: string; cancel: string; confirm: string } {
  // Parsear fecha y hora
  const [year, month, day] = data.fecha.split("-").map(Number);
  const [hour, minute] = data.hora.split(":").map(Number);

  // Crear fecha de inicio (asumiendo zona horaria Colombia UTC-5)
  const startDate = new Date(Date.UTC(year, month - 1, day, hour + 5, minute, 0));
  // Duración estimada: 1 hora
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

  // Formato para Google Calendar: YYYYMMDDTHHmmssZ
  const formatGoogleDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const startStr = formatGoogleDate(startDate);
  const endStr = formatGoogleDate(endDate);

  const title = encodeURIComponent(`Cita en Keicy Barber Club - ${data.servicio_nombre}`);
  const location = encodeURIComponent(`${data.sede_nombre}, ${data.sede_direccion}`);
  const details = encodeURIComponent(
    `Servicio: ${data.servicio_nombre}\n` +
    `Barbero: ${data.barbero_nombre || "Primer disponible"}\n` +
    `Precio: ${formatPrice(data.precio_total)}\n\n` +
    `¡Te esperamos!`
  );

  // Google Calendar
  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}&location=${location}`;

  // Outlook Web
  const outlookStart = startDate.toISOString();
  const outlookEnd = endDate.toISOString();
  const outlook = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&startdt=${outlookStart}&enddt=${outlookEnd}&body=${details}&location=${location}`;

  // ICS file via Edge Function
  const icsParams = new URLSearchParams({
    fecha: data.fecha,
    hora: data.hora,
    servicio: data.servicio_nombre,
    barbero: data.barbero_nombre || "Primer disponible",
    sede: data.sede_nombre,
    direccion: data.sede_direccion,
    precio: String(data.precio_total)
  });
  const ics = `https://ygrmammcaupnygdxmgth.supabase.co/functions/v1/calendar-ics?${icsParams.toString()}`;

  // Link de cancelación
  const cancelUrl = `https://www.keicybarberclub.com/cancelar/?phone=${data.cliente_telefono}`;

  // Link de confirmación
  const confirmUrl = `https://www.keicybarberclub.com/confirmar/?id=${data.cita_id}`;

  return { google, outlook, ics, cancel: cancelUrl, confirm: confirmUrl };
}

function generateEmailHTML(data: CitaData): string {
  const serviciosExtra = data.servicios_adicionales?.length
    ? data.servicios_adicionales.map((s) => `<li>${s.nombre}</li>`).join("")
    : "";

  const calendarLinks = generateCalendarLinks(data);

  // Textos personalizables con fallback a valores por defecto
  const titulo = data.textos?.titulo || "¡Cita Agendada!";
  const subtitulo = (data.textos?.subtitulo || "{nombre}, tu cita está reservada").replace(/{nombre}/g, data.cliente_nombre);
  const recordatorioTitulo = data.textos?.recordatorio_titulo || "📍 Recuerda llegar 5 minutos antes";
  const recordatorioTexto = data.textos?.recordatorio_texto || "Si necesitas cancelar o reprogramar, contáctanos con anticipación.";
  const calendarioTexto = data.textos?.calendario_texto || "📅 Agregar a tu calendario";
  const cancelarTexto = data.textos?.cancelar_texto || "✕ Cancelar cita";

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <link href="https://fonts.googleapis.com/css2?family=Trirong:wght@400;600;700;800&display=swap" rel="stylesheet">
  <title>Cita Agendada - Keicy Barber Club</title>
</head>
<body style="margin:0; padding:0; background-color:#000000; font-family:'Trirong', Georgia, 'Times New Roman', serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#000000;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:500px; background-color:#000000;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:32px 24px 24px; text-align:center;">
              <img src="https://www.keicybarberclub.com/assets/logo-oro.png" alt="Keicy Barber Club" width="150" style="width:150px; height:auto; display:block; margin:0 auto;">
            </td>
          </tr>

          <!-- Header -->
          <tr>
            <td align="center" style="padding:0 24px 32px;">
              <h1 style="margin:0; color:#FFAC48; font-size:28px; font-weight:800; letter-spacing:1px; text-transform:uppercase; font-family:'Trirong', Georgia, 'Times New Roman', serif;">${titulo}</h1>
              <p style="margin:12px 0 0; color:#B3B3B3; font-size:15px; font-family:'Trirong', Georgia, 'Times New Roman', serif;">${subtitulo}</p>
            </td>
          </tr>

          <!-- Detalles de la cita -->
          <tr>
            <td style="padding:0 24px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#141414; border-radius:16px; border:1px solid #262626;">

                <!-- Fecha y Hora -->
                <tr>
                  <td style="padding:20px; border-bottom:1px solid #262626;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="50%">
                          <p style="margin:0; color:#FFAC48; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; font-family:'Trirong', Georgia, 'Times New Roman', serif;">Fecha</p>
                          <p style="margin:6px 0 0; color:#FFFFFF; font-size:15px; font-weight:600; font-family:'Trirong', Georgia, 'Times New Roman', serif;">${formatDate(data.fecha)}</p>
                        </td>
                        <td width="50%">
                          <p style="margin:0; color:#FFAC48; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; font-family:'Trirong', Georgia, 'Times New Roman', serif;">Hora</p>
                          <p style="margin:6px 0 0; color:#FFFFFF; font-size:15px; font-weight:600; font-family:'Trirong', Georgia, 'Times New Roman', serif;">${formatTime(data.hora)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Barbero -->
                <tr>
                  <td style="padding:20px; border-bottom:1px solid #262626;">
                    <p style="margin:0; color:#FFAC48; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; font-family:'Trirong', Georgia, 'Times New Roman', serif;">Barbero</p>
                    <p style="margin:6px 0 0; color:#FFFFFF; font-size:15px; font-weight:600; font-family:'Trirong', Georgia, 'Times New Roman', serif;">${data.barbero_nombre || "El primer barbero disponible"}</p>
                  </td>
                </tr>

                <!-- Servicio -->
                <tr>
                  <td style="padding:20px; border-bottom:1px solid #262626;">
                    <p style="margin:0; color:#FFAC48; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; font-family:'Trirong', Georgia, 'Times New Roman', serif;">Servicio</p>
                    <p style="margin:6px 0 0; color:#FFFFFF; font-size:15px; font-weight:600; font-family:'Trirong', Georgia, 'Times New Roman', serif;">${data.servicio_nombre}</p>
                    ${serviciosExtra ? `<ul style="margin:8px 0 0; padding-left:20px; color:#B3B3B3; font-size:14px; font-family:'Trirong', Georgia, 'Times New Roman', serif;">${serviciosExtra}</ul>` : ""}
                  </td>
                </tr>

                <!-- Sede -->
                <tr>
                  <td style="padding:20px; border-bottom:1px solid #262626;">
                    <p style="margin:0; color:#FFAC48; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; font-family:'Trirong', Georgia, 'Times New Roman', serif;">Sede</p>
                    <p style="margin:6px 0 0; color:#FFFFFF; font-size:15px; font-weight:600; font-family:'Trirong', Georgia, 'Times New Roman', serif;">${data.sede_nombre}</p>
                    <p style="margin:4px 0 0; color:#B3B3B3; font-size:13px; font-family:'Trirong', Georgia, 'Times New Roman', serif;">${data.sede_direccion}</p>
                  </td>
                </tr>

                <!-- Total -->
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td>
                          <p style="margin:0; color:#B3B3B3; font-size:12px; font-weight:600; font-family:'Trirong', Georgia, 'Times New Roman', serif;">TOTAL</p>
                        </td>
                        <td align="right">
                          <p style="margin:0; color:#FFAC48; font-size:24px; font-weight:700; font-family:'Trirong', Georgia, 'Times New Roman', serif;">${formatPrice(data.precio_total)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Recordatorio -->
          <tr>
            <td style="padding:0 24px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:rgba(255,172,72,0.10); border-radius:16px; border:1px solid rgba(255,172,72,0.2);">
                <tr>
                  <td style="padding:18px;">
                    <p style="margin:0; color:#FFAC48; font-size:14px; font-weight:600; font-family:'Trirong', Georgia, 'Times New Roman', serif;">${recordatorioTitulo}</p>
                    <p style="margin:8px 0 0; color:#B3B3B3; font-size:13px; font-family:'Trirong', Georgia, 'Times New Roman', serif;">${recordatorioTexto}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Agregar al Calendario -->
          <tr>
            <td style="padding:0 24px 24px;">
              <p style="margin:0 0 14px; color:#FFFFFF; font-size:14px; font-weight:600; text-align:center; font-family:'Trirong', Georgia, 'Times New Roman', serif;">${calendarioTexto}</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <!-- Google Calendar -->
                        <td style="padding:0 6px;">
                          <a href="${calendarLinks.google}" target="_blank" style="display:inline-block; padding:12px 18px; background-color:#141414; color:#FFAC48; border:1px solid rgba(255,172,72,0.45); text-decoration:none; border-radius:12px; font-size:12px; font-weight:600; font-family:'Trirong', Georgia, 'Times New Roman', serif;">
                            Google
                          </a>
                        </td>
                        <!-- Outlook -->
                        <td style="padding:0 6px;">
                          <a href="${calendarLinks.outlook}" target="_blank" style="display:inline-block; padding:12px 18px; background-color:#141414; color:#FFAC48; border:1px solid rgba(255,172,72,0.45); text-decoration:none; border-radius:12px; font-size:12px; font-weight:600; font-family:'Trirong', Georgia, 'Times New Roman', serif;">
                            Outlook
                          </a>
                        </td>
                        <!-- Apple/iCal -->
                        <td style="padding:0 6px;">
                          <a href="${calendarLinks.ics}" target="_blank" style="display:inline-block; padding:12px 18px; background-color:#141414; color:#FFAC48; border:1px solid rgba(255,172,72,0.45); text-decoration:none; border-radius:12px; font-size:12px; font-weight:600; font-family:'Trirong', Georgia, 'Times New Roman', serif;">
                            Apple
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Alerta de Confirmación Obligatoria -->
          <tr>
            <td style="padding:0 24px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:rgba(239,83,80,0.12); border-radius:16px; border:1px solid rgba(239,83,80,0.2);">
                <tr>
                  <td style="padding:18px;">
                    <p style="margin:0; color:#EF5350; font-size:14px; font-weight:700; text-align:center; font-family:'Trirong', Georgia, 'Times New Roman', serif;">⚠️ CONFIRMACIÓN OBLIGATORIA</p>
                    <p style="margin:10px 0 0; color:#CCCCCC; font-size:13px; text-align:center; line-height:1.6; font-family:'Trirong', Georgia, 'Times New Roman', serif;">
                      Debes confirmar tu asistencia <strong>hasta 1 hora antes</strong> de la cita.<br>
                      Si no confirmas, tu cita será <strong>cancelada automáticamente</strong>.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Botón Confirmar Asistencia (Dorado) -->
          <tr>
            <td style="padding:0 24px 16px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="${calendarLinks.confirm}" target="_blank" style="display:inline-block; padding:18px 48px; background:linear-gradient(180deg, #FFC27A, #FFAC48); color:#000000; text-decoration:none; border-radius:16px; font-size:16px; font-weight:700; font-family:'Trirong', Georgia, 'Times New Roman', serif; box-shadow:0 4px 16px rgba(255,172,72,0.3);">
                      ✓ CONFIRMAR MI ASISTENCIA
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Botón Cancelar -->
          <tr>
            <td style="padding:0 24px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="${calendarLinks.cancel}" target="_blank" style="display:inline-block; padding:12px 32px; background-color:transparent; color:#8A8A8A; text-decoration:none; border-radius:12px; font-size:13px; font-weight:500; border:1px solid #262626; font-family:'Trirong', Georgia, 'Times New Roman', serif;">
                      ${cancelarTexto}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Tagline -->
          <tr>
            <td align="center" style="padding:0 24px 16px;">
              <p style="margin:0; color:#FFAC48; font-size:10px; font-weight:600; letter-spacing:2px; text-transform:uppercase; font-family:'Trirong', Georgia, 'Times New Roman', serif;">
                TU ESTILO, NUESTRA PASIÓN
              </p>
            </td>
          </tr>

          <!-- Footer Keicy -->
          <tr>
            <td align="center" style="padding:8px 24px 32px; border-top:1px solid #262626;">
              <img src="https://www.keicybarberclub.com/assets/logo-oro.png" alt="Keicy Barber Club" width="90" style="width:90px; height:auto; display:block; margin:20px auto 14px;">
              <p style="margin:0 0 6px; color:#B3B3B3; font-size:12px; line-height:1.6; font-family:'Trirong', Georgia, 'Times New Roman', serif;">Av. 4 Nte. #49, Urb. La Flora · Cali, Valle del Cauca</p>
              <p style="margin:0 0 6px; color:#B3B3B3; font-size:12px; line-height:1.6; font-family:'Trirong', Georgia, 'Times New Roman', serif;">Lun - Sáb · 10am - 8pm</p>
              <p style="margin:0 0 14px; font-size:12px; line-height:1.6; font-family:'Trirong', Georgia, 'Times New Roman', serif;">
                <a href="https://wa.me/573171713526" target="_blank" style="color:#FFAC48; text-decoration:none;">WhatsApp +57 317 171 3526</a>
                <span style="color:#555555;">&nbsp;·&nbsp;</span>
                <a href="https://instagram.com/keicy_barber_club" target="_blank" style="color:#FFAC48; text-decoration:none;">@keicy_barber_club</a>
              </p>
              <p style="margin:0; color:#7A7A7A; font-size:11px; font-family:'Trirong', Georgia, 'Times New Roman', serif;">
                <a href="https://www.keicybarberclub.com" target="_blank" style="color:#7A7A7A; text-decoration:none;">keicybarberclub.com</a> · Keicy Barber Club®
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
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!BREVO_API_KEY) {
      throw new Error("BREVO_API_KEY no configurada");
    }

    // Verificar si el correo de confirmación está activo
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: config } = await supabase
      .from('configuracion_global')
      .select('value')
      .eq('key', 'email_confirmacion_activo')
      .single();

    if (config?.value === false) {
      console.log('[ConfirmationEmail] Correo de confirmación está PAUSADO');
      return new Response(JSON.stringify({
        success: true,
        message: 'Correo de confirmación pausado por configuración'
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data: CitaData = await req.json();

    // El destinatario sale de la cita en la base de datos, no del mensaje: así
    // nadie puede usar esta función para enviar correos a cualquier dirección.
    if (!data.cita_id) {
      throw new Error("Falta cita_id");
    }
    const { data: cita } = await supabase
      .from('citas')
      .select('id, created_at, usuarios!citas_cliente_id_fkey(email, full_name)')
      .eq('id', data.cita_id)
      .maybeSingle();
    const cliente = (cita as any)?.usuarios;
    if (!cita || !cliente?.email) {
      return new Response(JSON.stringify({ success: false, message: 'La cita no tiene un correo registrado' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    // Solo citas recién creadas (evita reenvíos masivos)
    if (Date.now() - new Date((cita as any).created_at).getTime() > 24 * 60 * 60 * 1000) {
      throw new Error("La cita no es reciente");
    }
    data.cliente_email = cliente.email;
    data.cliente_nombre = data.cliente_nombre || cliente.full_name || 'Cliente';

    const emailHTML = generateEmailHTML(data);

    // Generar asunto personalizado
    const asuntoTemplate = data.textos?.asunto || "📅 Cita agendada - Confirma tu asistencia";
    const asunto = asuntoTemplate
      .replace(/{nombre}/g, data.cliente_nombre)
      .replace(/{fecha}/g, formatDate(data.fecha))
      .replace(/{hora}/g, formatTime(data.hora));

    // Enviar email via Brevo API
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
        subject: asunto,
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
