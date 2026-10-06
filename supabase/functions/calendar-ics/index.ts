import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const fecha = url.searchParams.get("fecha") || "";
    const hora = url.searchParams.get("hora") || "";
    const servicio = url.searchParams.get("servicio") || "Cita";
    const barbero = url.searchParams.get("barbero") || "Barbero disponible";
    const sede = url.searchParams.get("sede") || "Diego Neira Barbería";
    const direccion = url.searchParams.get("direccion") || "";
    const precio = url.searchParams.get("precio") || "0";

    // Parsear fecha y hora
    const [year, month, day] = fecha.split("-").map(Number);
    const [hour, minute] = hora.split(":").map(Number);

    // Crear fecha UTC (Colombia es UTC-5)
    const startDate = new Date(Date.UTC(year, month - 1, day, hour + 5, minute, 0));
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hora

    const formatICSDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Diego Neira Barbería//ES",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${Date.now()}@diegoneirabarber.com`,
      `DTSTAMP:${formatICSDate(new Date())}`,
      `DTSTART:${formatICSDate(startDate)}`,
      `DTEND:${formatICSDate(endDate)}`,
      `SUMMARY:Cita en Diego Neira - ${servicio}`,
      `DESCRIPTION:Servicio: ${servicio}\\nBarbero: ${barbero}\\nPrecio: $${Number(precio).toLocaleString()} COP\\n\\n¡Te esperamos!`,
      `LOCATION:${sede}${direccion ? ", " + direccion : ""}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");

    return new Response(icsContent, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "attachment; filename=cita-diego-neira.ics"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
