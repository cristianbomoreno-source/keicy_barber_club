# Supabase Edge Functions - Keicy Barber Club

## Funciones disponibles

### send-confirmation-email
Envía email de confirmación cuando se agenda una cita.

## Deployment

### 1. Instalar Supabase CLI (si no lo tienes)

```bash
# macOS
brew install supabase/tap/supabase

# O con npm
npm install -g supabase
```

### 2. Login en Supabase

```bash
supabase login
```

### 3. Vincular proyecto

```bash
cd /ruta/a/keicy_barber_club
supabase link --project-ref ygrmammcaupnygdxmgth
```

### 4. Configurar variables de entorno

```bash
supabase secrets set BREVO_API_KEY=tu_api_key_de_brevo
supabase secrets set FROM_EMAIL=citas@keicybarberclub.com
```

### 5. Deploy de la función

```bash
supabase functions deploy send-confirmation-email
```

### 6. Verificar

La función estará disponible en:
```
https://ygrmammcaupnygdxmgth.supabase.co/functions/v1/send-confirmation-email
```

## Importante: Verificar sender en Brevo

1. Ve a [app.brevo.com](https://app.brevo.com)
2. Settings → Senders & Domains → Senders
3. Agrega tu email como sender
4. Verifica el email (te llegará un correo de confirmación)

Sin verificar el sender, los emails no se enviarán.
