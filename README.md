# Keicy Barber Club

Sistema de gestión para barbería con agenda, citas, pagos y más.

## 🚀 Configuración Inicial

### 1. Supabase (Base de datos)

1. Crear proyecto en [supabase.com](https://supabase.com)
2. Copiar la **URL** y **anon key** del proyecto
3. Actualizar en `assets/supabase-client.js`:
   ```javascript
   const SUPABASE_URL = 'https://TU_PROYECTO.supabase.co';
   const SUPABASE_ANON_KEY = 'tu_anon_key_aqui';
   ```
4. Ejecutar las migraciones SQL (se proporcionarán por separado)

### 2. Vercel (Hosting)

1. Crear proyecto en [vercel.com](https://vercel.com)
2. Conectar con el repositorio de GitHub
3. Configurar dominio personalizado (opcional)

### 3. WhatsApp Business (Mensajes)

1. En Meta Business, agregar el número de la barbería a la app existente
2. Copiar el **Phone Number ID** del nuevo número
3. Crear las plantillas de mensajes:
   - `confirmacion` - Confirmación de cita
   - `recordatorio_cita` - Recordatorio 2h antes
4. Actualizar en `supabase/functions/_shared/whatsapp/`:
   - `PHONE_NUMBER_ID` con el nuevo ID
5. Configurar el Access Token en Supabase secrets

### 4. Personalización

Editar `assets/config.js` con los datos de la barbería:
- Nombre y slogan
- Teléfonos de contacto
- Sedes y horarios
- Redes sociales

## 📁 Estructura del Proyecto

```
keicy_barber_club/
├── admin/           # Panel de administrador general
├── admin_sede/      # Panel de administrador de sede
├── assets/          # CSS, JS, imágenes
├── barbero/         # App para barberos
├── cliente/         # App para clientes
├── recepcion/       # Panel de recepción
├── reservar/        # Sistema de reservas público
├── supabase/        # Funciones edge y configuración
└── index.html       # Landing page
```

## 🔑 Variables de Entorno (Supabase)

Configurar estos secrets en Supabase:

| Variable | Descripción |
|----------|-------------|
| `WHATSAPP_ACCESS_TOKEN` | Token de Meta Business API |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número en Meta |

## 📱 Roles de Usuario

- **admin** - Acceso total a todas las sedes
- **admin_sede** - Administra una sede específica
- **recepcionista** - Gestiona citas y pagos
- **barbero** - Ve su agenda y registra servicios
- **cliente** - Reserva citas y ve historial

## ⚠️ Pendiente de Configurar

- [ ] Crear proyecto Supabase
- [ ] Ejecutar migraciones SQL
- [ ] Configurar variables de entorno
- [ ] Agregar número WhatsApp a Meta Business
- [ ] Crear plantillas de WhatsApp
- [ ] Subir a Vercel
- [ ] Configurar dominio
- [ ] Crear usuarios iniciales
- [ ] Agregar barberos y servicios
