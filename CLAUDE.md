# Proyecto: Keicy Barber Club

## Contexto General

Sistema de gestión completo para barbería **Keicy Barber Club**. Incluye agenda, citas, pagos, comisiones, WhatsApp automatizado y más.

## Información de la Barbería

- **Nombre**: Keicy Barber Club
- **Ciudad**: Cali, Valle del Cauca, Colombia
- **Dirección**: Av. 4 Nte. #49, Urb. La Flora
- **Teléfono/WhatsApp**: +57 317 171 3526
- **Horario**: Lunes a Sábado, 10:00 am - 8:00 pm
- **Instagram**: @keicy_barber_club

## Configuración Supabase

- **Project ID**: `ygrmammcaupnygdxmgth`
- **URL**: `https://ygrmammcaupnygdxmgth.supabase.co`
- **Región**: us-east-2
- **Anon Key**: En `assets/supabase-client.js`

## Repositorio GitHub

- **URL**: https://github.com/cristianbomoreno-source/keicy_barber_club
- **Branch principal**: main

## Estructura del Proyecto

```
keicy_barber_club/
├── admin/              # Panel administrador general
│   ├── calendario.html # Agenda principal
│   ├── caja.html       # Gestión de caja
│   ├── barberos.html   # Gestión de barberos
│   ├── servicios.html  # Gestión de servicios
│   ├── clientes.html   # Gestión de clientes
│   └── reportes.html   # Reportes y estadísticas
├── admin_sede/         # Panel administrador de sede
│   ├── dashboard.html  # Dashboard sede
│   ├── calendario.html # Agenda sede
│   ├── ordenes.html    # Órdenes pendientes
│   └── ventas.html     # POS de ventas
├── barbero/            # App para barberos
│   ├── home.html       # Dashboard barbero
│   └── agenda.html     # Su agenda personal
├── cliente/            # App para clientes
│   ├── home.html       # Dashboard cliente
│   ├── club.html       # Club de fidelización
│   └── login.html      # Login cliente
├── reservar/           # Sistema de reservas público
├── recepcion/          # Panel de recepción
├── assets/
│   ├── supabase-client.js    # Cliente Supabase (CREDENCIALES)
│   ├── config.js             # Configuración de la barbería
│   ├── agenda-mobile-unified.js/css  # Agenda móvil
│   └── citas-estados.js      # Manejo de estados de citas
├── supabase/
│   └── functions/      # Edge functions (WhatsApp, etc.)
└── index.html          # Landing page
```

## Tablas en Supabase

### Principales
| Tabla | Descripción |
|-------|-------------|
| `usuarios` | Clientes y staff (role: cliente/barbero/admin/admin_sede/recepcionista) |
| `barberos` | Barberos activos (FK a usuarios) |
| `sucursales` | Sedes/locales |
| `servicios` | Servicios ofrecidos |
| `citas` | Citas/reservas |
| `bloqueos_barbero` | Bloqueos de agenda (descanso, habilitado, etc.) |

### Pagos
| Tabla | Descripción |
|-------|-------------|
| `pagos` | Registro de pagos |
| `comisiones` | Comisiones de barberos |
| `metodos_pago` | Métodos de pago disponibles |
| `tickets` | Tickets/órdenes |
| `ticket_items` | Items de cada ticket |
| `cobro_metodos` | Métodos usados en cada cobro |

### Caja
| Tabla | Descripción |
|-------|-------------|
| `caja_sesiones` | Sesiones de caja (apertura/cierre) |
| `caja_movimientos` | Movimientos de caja |
| `turnos_admin_sede` | Turnos de administradores |

### Otros
| Tabla | Descripción |
|-------|-------------|
| `resenas` | Reseñas de clientes |
| `whatsapp_message_logs` | Logs de mensajes WhatsApp |
| `app_config` | Configuración de la app |
| `configuracion_negocio` | Configuración del negocio |

## Estados de Citas

```
agendada → confirmada → sala_espera → en_servicio → pendiente_pago → finalizada
                                                  ↘ cancelada
                                                  ↘ no_show
```

## Roles de Usuario

| Rol | Acceso |
|-----|--------|
| `admin` | Todo el sistema, todas las sedes |
| `admin_sede` | Una sede específica |
| `recepcionista` | Citas y pagos de su sede |
| `barbero` | Su agenda personal |
| `cliente` | Reservar, ver historial |

## WhatsApp Business

### Configuración necesaria:
1. Agregar número de Keicy a la app de Meta Business existente
2. Obtener el `Phone Number ID` del nuevo número
3. Crear plantillas:
   - `confirmacion` - Confirmación de cita
   - `recordatorio_cita` - Recordatorio 2h antes

### Archivos a configurar:
- `supabase/functions/_shared/whatsapp/templates.ts` → PHONE_NUMBER_ID
- Supabase secrets → WHATSAPP_ACCESS_TOKEN

## Archivos Clave para Modificar

### Configuración general
```
assets/config.js           → Datos de la barbería (nombre, teléfono, etc.)
assets/supabase-client.js  → Credenciales Supabase (YA CONFIGURADO)
```

### Agenda/Calendario
```
assets/agenda-mobile-unified.js  → Lógica de agenda móvil
assets/agenda-mobile-unified.css → Estilos de agenda
admin/calendario.html            → Calendario principal
```

### WhatsApp
```
supabase/functions/_shared/whatsapp/templates.ts → Plantillas y Phone ID
supabase/functions/whatsapp-confirmation-cron/   → Cron de confirmaciones
supabase/functions/whatsapp-reminder-cron/       → Cron de recordatorios
```

## Comandos Útiles

### Git
```bash
cd /Users/crisbo/Downloads/keicy_barber_club
git status
git add -A && git commit -m "mensaje"
git push origin main
```

### Supabase CLI (opcional)
```bash
supabase link --project-ref ygrmammcaupnygdxmgth
supabase functions deploy
```

## URLs

- **Supabase Dashboard**: https://supabase.com/dashboard/project/ygrmammcaupnygdxmgth
- **GitHub**: https://github.com/cristianbomoreno-source/keicy_barber_club
- **Vercel**: (configurar dominio)

## Notas Importantes

1. **RLS habilitado** en todas las tablas - las políticas son permisivas por ahora
2. **Métodos de pago** ya insertados: Efectivo, Tarjeta, Nequi, Daviplata, Transferencia
3. **App config** con valores default para WhatsApp y puntos
4. Logos y favicons ya actualizados con el branding de Keicy

## Pendientes

- WhatsApp por configurar (nuevo número)
- Dominio por configurar en Vercel
