// =====================================================
// WhatsApp Cloud API - Tests de Integración
// Ejecutar: POST /whatsapp-tests con x-cron-secret
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  error?: string;
  duration_ms: number;
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('WHATSAPP_CRON_SECRET');
  if (!cronSecret || cronSecret !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const results: TestResult[] = [];

  // =====================================================
  // SETUP: Crear datos de prueba
  // =====================================================
  const testSucursalId = crypto.randomUUID();
  const testCitaId = crypto.randomUUID();
  const testPhoneNumberId = 'TEST_PHONE_' + Date.now();
  const testClientPhone = '573001234567';

  try {
    // Crear sucursal de prueba
    await supabase.from('sucursales').insert({
      id: testSucursalId,
      nombre: 'Test Sede WhatsApp',
      whatsapp_phone_number: '+573001234567',
      whatsapp_phone_number_id: testPhoneNumberId,
      activa: true
    });

    // =====================================================
    // TEST 1: Confirmar normal
    // =====================================================
    results.push(await runTest('Confirmar normal', async () => {
      const citaId = crypto.randomUUID();
      await createTestCita(supabase, citaId, testSucursalId, 'agendada');
      const tokens = await createTestTokens(supabase, citaId, testSucursalId, testClientPhone);

      const { data } = await supabase.rpc('validar_action_token', {
        p_token: tokens.confirm,
        p_expected_action: 'CONFIRMAR',
        p_from_phone: testClientPhone,
        p_sucursal_id: testSucursalId
      });

      const result = data?.[0];
      if (!result?.is_valid) throw new Error('Token debería ser válido');
      if (result.already_processed) throw new Error('No debería estar procesado');

      const { data: cita } = await supabase.from('citas').select('estado').eq('id', citaId).single();
      if (cita?.estado !== 'confirmada') throw new Error(`Estado: ${cita?.estado}`);
    }));

    // =====================================================
    // TEST 2: Cancelar normal
    // =====================================================
    results.push(await runTest('Cancelar normal', async () => {
      const citaId = crypto.randomUUID();
      await createTestCita(supabase, citaId, testSucursalId, 'agendada');
      const tokens = await createTestTokens(supabase, citaId, testSucursalId, testClientPhone);

      const { data } = await supabase.rpc('validar_action_token', {
        p_token: tokens.cancel,
        p_expected_action: 'CANCELAR',
        p_from_phone: testClientPhone,
        p_sucursal_id: testSucursalId
      });

      const result = data?.[0];
      if (!result?.is_valid) throw new Error('Token debería ser válido');

      const { data: cita } = await supabase.from('citas').select('estado').eq('id', citaId).single();
      if (cita?.estado !== 'cancelada') throw new Error(`Estado: ${cita?.estado}`);
    }));

    // =====================================================
    // TEST 3: Doble clic Confirmar (idempotencia)
    // =====================================================
    results.push(await runTest('Doble clic Confirmar', async () => {
      const citaId = crypto.randomUUID();
      await createTestCita(supabase, citaId, testSucursalId, 'agendada');
      const tokens = await createTestTokens(supabase, citaId, testSucursalId, testClientPhone);

      // Primer clic
      await supabase.rpc('validar_action_token', {
        p_token: tokens.confirm,
        p_expected_action: 'CONFIRMAR',
        p_from_phone: testClientPhone,
        p_sucursal_id: testSucursalId
      });

      // Segundo clic (mismo token)
      const { data } = await supabase.rpc('validar_action_token', {
        p_token: tokens.confirm,
        p_expected_action: 'CONFIRMAR',
        p_from_phone: testClientPhone,
        p_sucursal_id: testSucursalId
      });

      const result = data?.[0];
      if (!result?.is_valid) throw new Error('Debería ser válido (idempotente)');
      if (!result?.already_processed) throw new Error('Debería indicar ya procesado');
    }));

    // =====================================================
    // TEST 4: Doble clic Cancelar (idempotencia)
    // =====================================================
    results.push(await runTest('Doble clic Cancelar', async () => {
      const citaId = crypto.randomUUID();
      await createTestCita(supabase, citaId, testSucursalId, 'agendada');
      const tokens = await createTestTokens(supabase, citaId, testSucursalId, testClientPhone);

      await supabase.rpc('validar_action_token', {
        p_token: tokens.cancel,
        p_expected_action: 'CANCELAR',
        p_from_phone: testClientPhone,
        p_sucursal_id: testSucursalId
      });

      const { data } = await supabase.rpc('validar_action_token', {
        p_token: tokens.cancel,
        p_expected_action: 'CANCELAR',
        p_from_phone: testClientPhone,
        p_sucursal_id: testSucursalId
      });

      const result = data?.[0];
      if (!result?.is_valid) throw new Error('Debería ser válido');
      if (!result?.already_processed) throw new Error('Debería indicar ya procesado');
    }));

    // =====================================================
    // TEST 5: Confirmar + Cancelar (segundo pierde)
    // =====================================================
    results.push(await runTest('Confirmar + Cancelar simultáneo', async () => {
      const citaId = crypto.randomUUID();
      await createTestCita(supabase, citaId, testSucursalId, 'agendada');
      const tokens = await createTestTokens(supabase, citaId, testSucursalId, testClientPhone);

      // Confirmar primero
      await supabase.rpc('validar_action_token', {
        p_token: tokens.confirm,
        p_expected_action: 'CONFIRMAR',
        p_from_phone: testClientPhone,
        p_sucursal_id: testSucursalId
      });

      // Cancelar después
      const { data } = await supabase.rpc('validar_action_token', {
        p_token: tokens.cancel,
        p_expected_action: 'CANCELAR',
        p_from_phone: testClientPhone,
        p_sucursal_id: testSucursalId
      });

      const result = data?.[0];
      // Debería indicar que ya fue procesado (el hermano ganó)
      if (!result?.already_processed) throw new Error('Debería indicar ya procesado');
      if (result?.action_taken !== 'CONFIRMAR') throw new Error('Acción ganadora debería ser CONFIRMAR');

      // Verificar que token cancelar está revocado
      const { data: cancelToken } = await supabase
        .from('whatsapp_action_tokens')
        .select('revoked_at, revoked_reason')
        .eq('token', tokens.cancel)
        .single();

      if (!cancelToken?.revoked_at) throw new Error('Token cancelar debería estar revocado');
      if (cancelToken?.revoked_reason !== 'sibling_used') throw new Error(`Razón: ${cancelToken?.revoked_reason}`);
    }));

    // =====================================================
    // TEST 6: Webhook duplicado (mismo message_id)
    // =====================================================
    results.push(await runTest('Webhook duplicado', async () => {
      const webhookEventId = 'wamid_test_' + Date.now();

      // Primer insert
      await supabase.from('whatsapp_message_logs').insert({
        sucursal_id: testSucursalId,
        direction: 'inbound',
        webhook_event_id: webhookEventId,
        status: 'received'
      });

      // Segundo insert (debería fallar por unique constraint)
      const { error } = await supabase.from('whatsapp_message_logs').insert({
        sucursal_id: testSucursalId,
        direction: 'inbound',
        webhook_event_id: webhookEventId,
        status: 'received'
      });

      if (!error) throw new Error('Debería rechazar duplicado');
      if (!error.message.includes('unique') && !error.message.includes('duplicate')) {
        throw new Error(`Error inesperado: ${error.message}`);
      }
    }));

    // =====================================================
    // TEST 7: Retry después de error (backoff)
    // =====================================================
    results.push(await runTest('Retry con backoff', async () => {
      const citaId = crypto.randomUUID();
      const claimId = crypto.randomUUID();
      await createTestCita(supabase, citaId, testSucursalId, 'agendada');

      // Simular claim
      await supabase.from('citas').update({
        whatsapp_reminder_status: 'processing',
        whatsapp_claim_id: claimId
      }).eq('id', citaId);

      // Marcar como fallido
      await supabase.rpc('marcar_recordatorio_fallido', {
        p_cita_id: citaId,
        p_claim_id: claimId,
        p_error: 'Test error'
      });

      const { data: cita } = await supabase
        .from('citas')
        .select('whatsapp_reminder_status, whatsapp_retry_count, whatsapp_next_retry_at')
        .eq('id', citaId)
        .single();

      if (cita?.whatsapp_reminder_status !== 'failed') throw new Error(`Status: ${cita?.whatsapp_reminder_status}`);
      if (cita?.whatsapp_retry_count !== 1) throw new Error(`Retry count: ${cita?.whatsapp_retry_count}`);
      if (!cita?.whatsapp_next_retry_at) throw new Error('Debería tener next_retry_at');
    }));

    // =====================================================
    // TEST 8: Claim huérfano (timeout recovery)
    // =====================================================
    results.push(await runTest('Claim huérfano recovery', async () => {
      const citaId = crypto.randomUUID();
      await createTestCita(supabase, citaId, testSucursalId, 'agendada');

      // Simular claim viejo (hace 10 minutos)
      await supabase.from('citas').update({
        whatsapp_reminder_status: 'claimed',
        whatsapp_claim_id: crypto.randomUUID(),
        whatsapp_claimed_at: new Date(Date.now() - 10 * 60 * 1000).toISOString()
      }).eq('id', citaId);

      // Ejecutar claim (debería recuperar el huérfano)
      const { data } = await supabase.rpc('claim_citas_para_recordatorio', {
        minutos_antes: 60,
        margen_minutos: 1000, // Amplio para incluir la cita de prueba
        max_citas: 10,
        claim_timeout_minutes: 5
      });

      // Verificar que la cita fue recuperada a pending
      const { data: cita } = await supabase
        .from('citas')
        .select('whatsapp_reminder_status')
        .eq('id', citaId)
        .single();

      // Puede ser 'pending' (recuperada) o 'claimed' (reclamada de nuevo)
      if (!['pending', 'claimed'].includes(cita?.whatsapp_reminder_status || '')) {
        throw new Error(`Status: ${cita?.whatsapp_reminder_status}`);
      }
    }));

    // =====================================================
    // TEST 9: Token expirado
    // =====================================================
    results.push(await runTest('Token expirado', async () => {
      const citaId = crypto.randomUUID();
      await createTestCita(supabase, citaId, testSucursalId, 'agendada');

      // Crear token expirado
      const expiredToken = 'expired_' + crypto.randomUUID().replace(/-/g, '');
      const { data: cita } = await supabase.from('citas').select('fecha, hora_inicio').eq('id', citaId).single();

      await supabase.from('whatsapp_action_tokens').insert({
        token: expiredToken,
        action: 'CONFIRMAR',
        cita_id: citaId,
        sucursal_id: testSucursalId,
        reminder_message_id: 'test_msg',
        cliente_telefono: testClientPhone,
        scheduled_date: cita?.fecha,
        scheduled_time: cita?.hora_inicio,
        expires_at: new Date(Date.now() - 1000).toISOString() // Expirado hace 1 segundo
      });

      const { data } = await supabase.rpc('validar_action_token', {
        p_token: expiredToken,
        p_expected_action: 'CONFIRMAR',
        p_from_phone: testClientPhone,
        p_sucursal_id: testSucursalId
      });

      const result = data?.[0];
      if (result?.is_valid) throw new Error('No debería ser válido');
      if (!result?.error_message?.includes('expirado')) throw new Error(`Error: ${result?.error_message}`);
    }));

    // =====================================================
    // TEST 10: Teléfono incorrecto
    // =====================================================
    results.push(await runTest('Teléfono incorrecto', async () => {
      const citaId = crypto.randomUUID();
      await createTestCita(supabase, citaId, testSucursalId, 'agendada');
      const tokens = await createTestTokens(supabase, citaId, testSucursalId, testClientPhone);

      const { data } = await supabase.rpc('validar_action_token', {
        p_token: tokens.confirm,
        p_expected_action: 'CONFIRMAR',
        p_from_phone: '573009999999', // Teléfono diferente
        p_sucursal_id: testSucursalId
      });

      const result = data?.[0];
      if (result?.is_valid) throw new Error('No debería ser válido');
      if (!result?.error_message?.includes('autorizado') && !result?.error_message?.includes('Número')) {
        throw new Error(`Error: ${result?.error_message}`);
      }
    }));

    // =====================================================
    // TEST 11: Sede incorrecta
    // =====================================================
    results.push(await runTest('Sede incorrecta', async () => {
      const citaId = crypto.randomUUID();
      await createTestCita(supabase, citaId, testSucursalId, 'agendada');
      const tokens = await createTestTokens(supabase, citaId, testSucursalId, testClientPhone);

      const { data } = await supabase.rpc('validar_action_token', {
        p_token: tokens.confirm,
        p_expected_action: 'CONFIRMAR',
        p_from_phone: testClientPhone,
        p_sucursal_id: crypto.randomUUID() // Sede diferente
      });

      const result = data?.[0];
      if (result?.is_valid) throw new Error('No debería ser válido');
    }));

    // =====================================================
    // TEST 12: Phone number ID desconocido
    // =====================================================
    results.push(await runTest('Phone number ID desconocido', async () => {
      const { data } = await supabase.rpc('get_sucursal_by_wa_phone_id', {
        phone_number_id: 'UNKNOWN_PHONE_NUMBER_ID'
      });

      if (data && data.length > 0) throw new Error('No debería encontrar sede');
    }));

    // =====================================================
    // TEST 13: Cita confirmada manualmente
    // =====================================================
    results.push(await runTest('Cita confirmada manualmente', async () => {
      const citaId = crypto.randomUUID();
      await createTestCita(supabase, citaId, testSucursalId, 'confirmada'); // Ya confirmada
      const tokens = await createTestTokens(supabase, citaId, testSucursalId, testClientPhone);

      // Intentar confirmar (idempotente)
      const { data: confirmData } = await supabase.rpc('validar_action_token', {
        p_token: tokens.confirm,
        p_expected_action: 'CONFIRMAR',
        p_from_phone: testClientPhone,
        p_sucursal_id: testSucursalId
      });

      if (!confirmData?.[0]?.is_valid) throw new Error('Confirmar debería ser válido (idempotente)');

      // Intentar cancelar (debería permitir desde confirmada)
      const citaId2 = crypto.randomUUID();
      await createTestCita(supabase, citaId2, testSucursalId, 'confirmada');
      const tokens2 = await createTestTokens(supabase, citaId2, testSucursalId, testClientPhone);

      const { data: cancelData } = await supabase.rpc('validar_action_token', {
        p_token: tokens2.cancel,
        p_expected_action: 'CANCELAR',
        p_from_phone: testClientPhone,
        p_sucursal_id: testSucursalId
      });

      if (!cancelData?.[0]?.is_valid) throw new Error('Cancelar debería ser válido desde confirmada');
    }));

    // =====================================================
    // TEST 14: Cita cancelada manualmente
    // =====================================================
    results.push(await runTest('Cita cancelada manualmente', async () => {
      const citaId = crypto.randomUUID();
      await createTestCita(supabase, citaId, testSucursalId, 'cancelada'); // Ya cancelada
      const tokens = await createTestTokens(supabase, citaId, testSucursalId, testClientPhone);

      // Intentar confirmar (no debería permitir)
      const { data: confirmData } = await supabase.rpc('validar_action_token', {
        p_token: tokens.confirm,
        p_expected_action: 'CONFIRMAR',
        p_from_phone: testClientPhone,
        p_sucursal_id: testSucursalId
      });

      if (confirmData?.[0]?.is_valid && !confirmData?.[0]?.already_processed) {
        throw new Error('Confirmar no debería permitirse en cita cancelada');
      }

      // Intentar cancelar (idempotente)
      const { data: cancelData } = await supabase.rpc('validar_action_token', {
        p_token: tokens.cancel,
        p_expected_action: 'CANCELAR',
        p_from_phone: testClientPhone,
        p_sucursal_id: testSucursalId
      });

      if (!cancelData?.[0]?.is_valid) throw new Error('Cancelar debería ser válido (idempotente)');
    }));

    // =====================================================
    // TEST 15: Cita reagendada después del recordatorio
    // =====================================================
    results.push(await runTest('Cita reagendada después del recordatorio', async () => {
      const citaId = crypto.randomUUID();
      const originalDate = new Date();
      originalDate.setDate(originalDate.getDate() + 1);

      // Crear cita con fecha original
      await supabase.from('citas').insert({
        id: citaId,
        sucursal_id: testSucursalId,
        estado: 'agendada',
        fecha: originalDate.toISOString().split('T')[0],
        hora_inicio: '15:00:00',
        cliente_telefono: testClientPhone
      });

      // Crear tokens con snapshot de fecha original
      const tokens = await createTestTokens(supabase, citaId, testSucursalId, testClientPhone);

      // REAGENDAR la cita (cambiar fecha)
      const newDate = new Date();
      newDate.setDate(newDate.getDate() + 2);
      await supabase.from('citas').update({
        fecha: newDate.toISOString().split('T')[0],
        hora_inicio: '17:00:00'
      }).eq('id', citaId);

      // Intentar usar token viejo (debería fallar)
      const { data } = await supabase.rpc('validar_action_token', {
        p_token: tokens.confirm,
        p_expected_action: 'CONFIRMAR',
        p_from_phone: testClientPhone,
        p_sucursal_id: testSucursalId
      });

      const result = data?.[0];
      if (result?.is_valid && !result?.already_processed) {
        throw new Error('Token viejo no debería ser válido después de reagendar');
      }
      if (!result?.error_message?.includes('reagendada') && !result?.already_processed) {
        // Verificar que el token fue revocado
        const { data: tokenData } = await supabase
          .from('whatsapp_action_tokens')
          .select('revoked_at, revoked_reason')
          .eq('token', tokens.confirm)
          .single();

        if (!tokenData?.revoked_at) {
          throw new Error('Token debería estar revocado después de reagendar');
        }
      }
    }));

    // =====================================================
    // TEST 16: Botón viejo después de reagendar
    // =====================================================
    results.push(await runTest('Botón viejo después de reagendar', async () => {
      const citaId = crypto.randomUUID();
      const originalDate = new Date();
      originalDate.setDate(originalDate.getDate() + 1);

      await supabase.from('citas').insert({
        id: citaId,
        sucursal_id: testSucursalId,
        estado: 'agendada',
        fecha: originalDate.toISOString().split('T')[0],
        hora_inicio: '10:00:00',
        cliente_telefono: testClientPhone,
        whatsapp_reminder_status: 'sent'
      });

      // Crear tokens originales (simulando recordatorio enviado)
      const oldTokens = await createTestTokens(supabase, citaId, testSucursalId, testClientPhone);

      // REAGENDAR la cita
      const newDate = new Date();
      newDate.setDate(newDate.getDate() + 3);
      await supabase.from('citas').update({
        fecha: newDate.toISOString().split('T')[0],
        hora_inicio: '16:00:00'
      }).eq('id', citaId);

      // Intentar usar AMBOS botones viejos
      const { data: confirmResult } = await supabase.rpc('validar_action_token', {
        p_token: oldTokens.confirm,
        p_expected_action: 'CONFIRMAR',
        p_from_phone: testClientPhone,
        p_sucursal_id: testSucursalId
      });

      const { data: cancelResult } = await supabase.rpc('validar_action_token', {
        p_token: oldTokens.cancel,
        p_expected_action: 'CANCELAR',
        p_from_phone: testClientPhone,
        p_sucursal_id: testSucursalId
      });

      // Ambos deberían fallar o indicar ya procesado
      if (confirmResult?.[0]?.is_valid && !confirmResult?.[0]?.already_processed) {
        throw new Error('Token confirm viejo no debería funcionar');
      }
      if (cancelResult?.[0]?.is_valid && !cancelResult?.[0]?.already_processed) {
        throw new Error('Token cancel viejo no debería funcionar');
      }

      // Verificar que los tokens viejos están revocados
      const { data: oldTokensData } = await supabase
        .from('whatsapp_action_tokens')
        .select('token, revoked_at, revoked_reason')
        .in('token', [oldTokens.confirm, oldTokens.cancel]);

      for (const t of oldTokensData || []) {
        if (!t.revoked_at) throw new Error(`Token ${t.token} debería estar revocado`);
        if (t.revoked_reason !== 'cita_rescheduled') throw new Error(`Razón incorrecta: ${t.revoked_reason}`);
      }
    }));

    // =====================================================
    // TEST 17: Nuevo recordatorio después de reagendar
    // =====================================================
    results.push(await runTest('Nuevo recordatorio después de reagendar', async () => {
      const citaId = crypto.randomUUID();
      const originalDate = new Date();
      originalDate.setDate(originalDate.getDate() + 1);

      await supabase.from('citas').insert({
        id: citaId,
        sucursal_id: testSucursalId,
        estado: 'agendada',
        fecha: originalDate.toISOString().split('T')[0],
        hora_inicio: '11:00:00',
        cliente_telefono: testClientPhone,
        whatsapp_reminder_status: 'sent',
        whatsapp_retry_count: 2 // Tenía reintentos
      });

      // Crear tokens originales
      await createTestTokens(supabase, citaId, testSucursalId, testClientPhone);

      // REAGENDAR la cita
      const newDate = new Date();
      newDate.setDate(newDate.getDate() + 2);
      await supabase.from('citas').update({
        fecha: newDate.toISOString().split('T')[0],
        hora_inicio: '14:00:00'
      }).eq('id', citaId);

      // Verificar que el estado se reseteó
      const { data: cita } = await supabase
        .from('citas')
        .select('whatsapp_reminder_status, whatsapp_retry_count, whatsapp_reminder_sent_at')
        .eq('id', citaId)
        .single();

      if (cita?.whatsapp_reminder_status !== 'pending') {
        throw new Error(`Status debería ser pending, es: ${cita?.whatsapp_reminder_status}`);
      }
      if (cita?.whatsapp_retry_count !== 0) {
        throw new Error(`retry_count debería ser 0, es: ${cita?.whatsapp_retry_count}`);
      }
      if (cita?.whatsapp_reminder_sent_at !== null) {
        throw new Error('sent_at debería ser null');
      }

      // Crear NUEVOS tokens para el nuevo horario
      const newTokens = await createTestTokensForDate(
        supabase, citaId, testSucursalId, testClientPhone,
        newDate.toISOString().split('T')[0], '14:00:00'
      );

      // Los nuevos tokens SÍ deberían funcionar
      const { data: result } = await supabase.rpc('validar_action_token', {
        p_token: newTokens.confirm,
        p_expected_action: 'CONFIRMAR',
        p_from_phone: testClientPhone,
        p_sucursal_id: testSucursalId
      });

      if (!result?.[0]?.is_valid) {
        throw new Error(`Nuevo token debería ser válido: ${result?.[0]?.error_message}`);
      }
    }));

    // =====================================================
    // TEST 18: Fallo de envío a Meta
    // =====================================================
    results.push(await runTest('Fallo de envío a Meta', async () => {
      const citaId = crypto.randomUUID();
      const claimId = crypto.randomUUID();
      await createTestCita(supabase, citaId, testSucursalId, 'agendada');

      // Simular claim y tokens pendientes
      await supabase.from('citas').update({
        whatsapp_reminder_status: 'processing',
        whatsapp_claim_id: claimId,
        whatsapp_retry_count: 0
      }).eq('id', citaId);

      // Crear tokens pendientes (como lo hace el cron)
      const confirmToken = 'pending_confirm_' + crypto.randomUUID().replace(/-/g, '');
      const cancelToken = 'pending_cancel_' + crypto.randomUUID().replace(/-/g, '');
      const { data: citaData } = await supabase.from('citas').select('fecha, hora_inicio').eq('id', citaId).single();

      await supabase.from('whatsapp_action_tokens').insert([
        {
          token: confirmToken,
          action: 'CONFIRMAR',
          cita_id: citaId,
          sucursal_id: testSucursalId,
          reminder_message_id: 'PENDING:' + claimId,
          cliente_telefono: testClientPhone,
          scheduled_date: citaData?.fecha,
          scheduled_time: citaData?.hora_inicio,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        },
        {
          token: cancelToken,
          action: 'CANCELAR',
          cita_id: citaId,
          sucursal_id: testSucursalId,
          reminder_message_id: 'PENDING:' + claimId,
          cliente_telefono: testClientPhone,
          scheduled_date: citaData?.fecha,
          scheduled_time: citaData?.hora_inicio,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        }
      ]);

      // Simular FALLO de envío
      await supabase.rpc('marcar_recordatorio_fallido', {
        p_cita_id: citaId,
        p_claim_id: claimId,
        p_error: 'Meta API error: rate limited'
      });

      // Verificar estado de la cita
      const { data: cita } = await supabase
        .from('citas')
        .select('whatsapp_reminder_status, whatsapp_retry_count, whatsapp_next_retry_at, whatsapp_last_error')
        .eq('id', citaId)
        .single();

      if (cita?.whatsapp_reminder_status !== 'failed') throw new Error(`Status: ${cita?.whatsapp_reminder_status}`);
      if (cita?.whatsapp_retry_count !== 1) throw new Error(`retry_count: ${cita?.whatsapp_retry_count}`);
      if (!cita?.whatsapp_next_retry_at) throw new Error('next_retry_at debería estar definido');
      if (!cita?.whatsapp_last_error?.includes('rate limited')) throw new Error(`error: ${cita?.whatsapp_last_error}`);

      // Verificar que los tokens pendientes fueron REVOCADOS
      const { data: tokens } = await supabase
        .from('whatsapp_action_tokens')
        .select('revoked_at, revoked_reason')
        .in('token', [confirmToken, cancelToken]);

      for (const t of tokens || []) {
        if (!t.revoked_at) throw new Error('Token debería estar revocado');
        if (t.revoked_reason !== 'send_failed') throw new Error(`Razón: ${t.revoked_reason}`);
      }
    }));

    // =====================================================
    // TEST 19: Dos workers reclamando la misma cita
    // =====================================================
    results.push(await runTest('Dos workers reclamando simultáneamente', async () => {
      const citaId = crypto.randomUUID();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Crear cita que califica para recordatorio
      await supabase.from('citas').insert({
        id: citaId,
        sucursal_id: testSucursalId,
        estado: 'agendada',
        fecha: tomorrow.toISOString().split('T')[0],
        hora_inicio: '15:00:00',
        cliente_telefono: testClientPhone,
        whatsapp_reminder_status: 'pending'
      });

      // Ejecutar DOS claims concurrentes
      const [claim1, claim2] = await Promise.all([
        supabase.rpc('claim_citas_para_recordatorio', {
          minutos_antes: 60,
          margen_minutos: 1000,
          max_citas: 1,
          claim_timeout_minutes: 5
        }),
        supabase.rpc('claim_citas_para_recordatorio', {
          minutos_antes: 60,
          margen_minutos: 1000,
          max_citas: 1,
          claim_timeout_minutes: 5
        })
      ]);

      // Solo UNO debería obtener la cita
      const citas1 = claim1.data?.filter((c: any) => c.cita_id === citaId) || [];
      const citas2 = claim2.data?.filter((c: any) => c.cita_id === citaId) || [];

      const totalClaims = citas1.length + citas2.length;
      if (totalClaims > 1) {
        throw new Error(`Dos workers obtuvieron la misma cita (${totalClaims} claims)`);
      }
    }));

    // =====================================================
    // TEST 20: Firma X-Hub-Signature-256 válida
    // =====================================================
    results.push(await runTest('Firma HMAC válida', async () => {
      const appSecret = Deno.env.get('WHATSAPP_APP_SECRET') || 'test_secret';
      const payload = JSON.stringify({ test: 'data', timestamp: Date.now() });

      // Calcular firma HMAC
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(appSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
      const hexSignature = 'sha256=' + Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      // Llamar al webhook con firma válida
      const webhookUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.supabase.co/functions/v1/whatsapp-webhook');
      const response = await fetch(webhookUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': hexSignature
        },
        body: payload
      });

      // Puede ser 200 (procesado) o 400 (payload inválido pero firma OK)
      // NO debe ser 403 (firma inválida)
      if (response.status === 403) {
        throw new Error('Firma válida fue rechazada');
      }
    }));

    // =====================================================
    // TEST 21: Firma X-Hub-Signature-256 inválida
    // =====================================================
    results.push(await runTest('Firma HMAC inválida', async () => {
      const payload = JSON.stringify({ test: 'data' });
      const invalidSignature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';

      const webhookUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.supabase.co/functions/v1/whatsapp-webhook');
      const response = await fetch(webhookUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': invalidSignature
        },
        body: payload
      });

      if (response.status !== 403) {
        throw new Error(`Debería ser 403, fue: ${response.status}`);
      }
    }));

    // =====================================================
    // TEST 22: POST sin X-Hub-Signature-256
    // =====================================================
    results.push(await runTest('POST sin firma HMAC', async () => {
      const webhookUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.supabase.co/functions/v1/whatsapp-webhook');
      const response = await fetch(webhookUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 'no signature' })
      });

      if (response.status !== 403) {
        throw new Error(`Debería ser 403, fue: ${response.status}`);
      }
    }));

    // =====================================================
    // TEST 23: GET de verificación del webhook
    // =====================================================
    results.push(await runTest('GET verificación webhook', async () => {
      const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || 'test_verify';
      const challenge = 'test_challenge_' + Date.now();

      const webhookUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.supabase.co/functions/v1/whatsapp-webhook');

      // Test con token CORRECTO
      const correctResponse = await fetch(
        `${webhookUrl}?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=${challenge}`
      );

      if (correctResponse.status !== 200) {
        throw new Error(`Token correcto debería dar 200, dio: ${correctResponse.status}`);
      }

      const body = await correctResponse.text();
      if (body !== challenge) {
        throw new Error(`Body debería ser challenge "${challenge}", fue: "${body}"`);
      }

      // Test con token INCORRECTO
      const wrongResponse = await fetch(
        `${webhookUrl}?hub.mode=subscribe&hub.verify_token=WRONG_TOKEN&hub.challenge=${challenge}`
      );

      if (wrongResponse.status !== 403) {
        throw new Error(`Token incorrecto debería dar 403, dio: ${wrongResponse.status}`);
      }
    }));

    // =====================================================
    // TEST 24: Acceso no autorizado a whatsapp-send
    // =====================================================
    results.push(await runTest('Acceso no autorizado a whatsapp-send', async () => {
      const sendUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.supabase.co/functions/v1/whatsapp-send');
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

      // Sin secret
      const noSecretResponse = await fetch(sendUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`
        },
        body: JSON.stringify({ test: true })
      });

      if (noSecretResponse.status !== 401 && noSecretResponse.status !== 403) {
        throw new Error(`Sin secret debería ser 401/403, fue: ${noSecretResponse.status}`);
      }

      // Secret incorrecto
      const wrongSecretResponse = await fetch(sendUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'x-internal-secret': 'WRONG_SECRET'
        },
        body: JSON.stringify({ test: true })
      });

      if (wrongSecretResponse.status !== 401 && wrongSecretResponse.status !== 403) {
        throw new Error(`Secret incorrecto debería ser 401/403, fue: ${wrongSecretResponse.status}`);
      }

      // Secret correcto
      const internalSecret = Deno.env.get('WHATSAPP_INTERNAL_SECRET') || '';
      const correctSecretResponse = await fetch(sendUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'x-internal-secret': internalSecret
        },
        body: JSON.stringify({ test: true })
      });

      // Con secret correcto puede ser 400 (payload inválido) pero NO 401/403
      if (correctSecretResponse.status === 401 || correctSecretResponse.status === 403) {
        throw new Error(`Secret correcto no debería ser rechazado, fue: ${correctSecretResponse.status}`);
      }
    }));

    // =====================================================
    // TEST 25: Acceso no autorizado a whatsapp-reminder-cron
    // =====================================================
    results.push(await runTest('Acceso no autorizado a cron', async () => {
      const cronUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.supabase.co/functions/v1/whatsapp-reminder-cron');
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

      // Sin secret
      const noSecretResponse = await fetch(cronUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`
        }
      });

      if (noSecretResponse.status !== 401) {
        throw new Error(`Sin secret debería ser 401, fue: ${noSecretResponse.status}`);
      }

      // Secret incorrecto
      const wrongSecretResponse = await fetch(cronUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'x-cron-secret': 'WRONG_SECRET'
        }
      });

      if (wrongSecretResponse.status !== 401) {
        throw new Error(`Secret incorrecto debería ser 401, fue: ${wrongSecretResponse.status}`);
      }

      // Secret correcto
      const cronSecret = Deno.env.get('WHATSAPP_CRON_SECRET') || '';
      const correctSecretResponse = await fetch(cronUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'x-cron-secret': cronSecret
        }
      });

      // Con secret correcto debe ser 200
      if (correctSecretResponse.status !== 200) {
        throw new Error(`Secret correcto debería dar 200, fue: ${correctSecretResponse.status}`);
      }
    }));

    // =====================================================
    // TEST 26: Action token revocado
    // =====================================================
    results.push(await runTest('Action token revocado', async () => {
      const citaId = crypto.randomUUID();
      await createTestCita(supabase, citaId, testSucursalId, 'agendada');
      const tokens = await createTestTokens(supabase, citaId, testSucursalId, testClientPhone);

      // REVOCAR el token manualmente
      await supabase.from('whatsapp_action_tokens').update({
        revoked_at: new Date().toISOString(),
        revoked_reason: 'manual_test_revoke'
      }).eq('token', tokens.confirm);

      // Intentar usar el token revocado
      const { data } = await supabase.rpc('validar_action_token', {
        p_token: tokens.confirm,
        p_expected_action: 'CONFIRMAR',
        p_from_phone: testClientPhone,
        p_sucursal_id: testSucursalId
      });

      // Verificar que la cita NO cambió
      const { data: cita } = await supabase.from('citas').select('estado').eq('id', citaId).single();
      if (cita?.estado !== 'agendada') {
        throw new Error(`Cita no debería cambiar, estado: ${cita?.estado}`);
      }

      // Verificar que used_at sigue siendo NULL
      const { data: token } = await supabase
        .from('whatsapp_action_tokens')
        .select('used_at, revoked_at')
        .eq('token', tokens.confirm)
        .single();

      if (token?.used_at !== null) {
        throw new Error('used_at debería seguir siendo null');
      }
      if (!token?.revoked_at) {
        throw new Error('revoked_at debería estar definido');
      }
    }));

    // =====================================================
    // TESTS DE COEXISTENCIA (27-38)
    // =====================================================

    // =====================================================
    // TEST 27: Embedded Signup callback válido
    // =====================================================
    results.push(await runTest('Coexistence: Callback válido', async () => {
      const callbackUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.supabase.co/functions/v1/embedded-signup-callback');

      // Crear session mock (normalmente viene de cookie)
      const state = crypto.randomUUID();
      const sessionData = JSON.stringify({
        state,
        stateHash: 'test',
        expiresAt: Date.now() + 15 * 60 * 1000,
        mode: 'dry-run'
      });
      const encodedSession = btoa(sessionData);

      const response = await fetch(callbackUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `es_session=${encodedSession}`
        },
        body: JSON.stringify({
          event: 'WA_EMBEDDED_SIGNUP_COMPLETE',
          state,
          mode: 'dry-run',
          data: {
            waba_id: '851994237367851',
            phone_number_id: '786659147873161',
            business_id: 'test_business',
            current_step: 'FINISH',
            is_coexistence: true
          },
          timestamp: new Date().toISOString()
        })
      });

      if (response.status !== 200) {
        const body = await response.text();
        throw new Error(`Debería ser 200, fue: ${response.status} - ${body}`);
      }

      const result = await response.json();
      if (!result.success) throw new Error('Debería ser exitoso');
      if (result.mode !== 'dry-run') throw new Error('Modo incorrecto');
    }));

    // =====================================================
    // TEST 28: Callback con state inválido (CSRF)
    // =====================================================
    results.push(await runTest('Coexistence: State inválido (CSRF)', async () => {
      const callbackUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.supabase.co/functions/v1/embedded-signup-callback');

      // Session con un state, pero enviamos otro
      const sessionData = JSON.stringify({
        state: 'original_state',
        expiresAt: Date.now() + 15 * 60 * 1000,
        mode: 'dry-run'
      });
      const encodedSession = btoa(sessionData);

      const response = await fetch(callbackUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `es_session=${encodedSession}`
        },
        body: JSON.stringify({
          event: 'WA_EMBEDDED_SIGNUP_COMPLETE',
          state: 'DIFFERENT_STATE', // No coincide!
          mode: 'dry-run',
          data: {},
          timestamp: new Date().toISOString()
        })
      });

      if (response.status !== 403) {
        throw new Error(`State mismatch debería dar 403, dio: ${response.status}`);
      }
    }));

    // =====================================================
    // TEST 29: Callback sin code
    // =====================================================
    results.push(await runTest('Coexistence: Callback sin code', async () => {
      const callbackUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.supabase.co/functions/v1/embedded-signup-callback');

      const state = crypto.randomUUID();
      const sessionData = JSON.stringify({
        state,
        expiresAt: Date.now() + 15 * 60 * 1000,
        mode: 'dry-run'
      });
      const encodedSession = btoa(sessionData);

      const response = await fetch(callbackUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `es_session=${encodedSession}`
        },
        body: JSON.stringify({
          event: 'OAUTH_CODE_RECEIVED',
          state,
          mode: 'dry-run',
          // Sin 'code'
          timestamp: new Date().toISOString()
        })
      });

      // Sin code, solo debería procesar como dry-run o ignorar
      const result = await response.json();
      // No debería fallar, solo no procesar
    }));

    // =====================================================
    // TEST 30: CSRF/State mismatch sin cookie
    // =====================================================
    results.push(await runTest('Coexistence: Sin cookie de session', async () => {
      const callbackUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.supabase.co/functions/v1/embedded-signup-callback');

      const response = await fetch(callbackUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
          // Sin Cookie
        },
        body: JSON.stringify({
          event: 'WA_EMBEDDED_SIGNUP_COMPLETE',
          state: 'some_state',
          mode: 'dry-run',
          data: {},
          timestamp: new Date().toISOString()
        })
      });

      if (response.status !== 403) {
        throw new Error(`Sin cookie debería dar 403, dio: ${response.status}`);
      }
    }));

    // =====================================================
    // TEST 31: WABA ID inesperado
    // =====================================================
    results.push(await runTest('Coexistence: WABA ID inesperado', async () => {
      const callbackUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.supabase.co/functions/v1/embedded-signup-callback');

      const state = crypto.randomUUID();
      const sessionData = JSON.stringify({
        state,
        expiresAt: Date.now() + 15 * 60 * 1000,
        mode: 'dry-run'
      });
      const encodedSession = btoa(sessionData);

      const response = await fetch(callbackUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `es_session=${encodedSession}`
        },
        body: JSON.stringify({
          event: 'WA_EMBEDDED_SIGNUP_COMPLETE',
          state,
          mode: 'dry-run',
          data: {
            waba_id: 'UNEXPECTED_WABA_ID', // Diferente!
            phone_number_id: '786659147873161',
            current_step: 'FINISH'
          },
          timestamp: new Date().toISOString()
        })
      });

      const result = await response.json();
      // Debería tener warning
      if (!result.warnings || result.warnings.length === 0) {
        throw new Error('Debería tener warning por WABA ID diferente');
      }
    }));

    // =====================================================
    // TEST 32: Phone Number ID inesperado
    // =====================================================
    results.push(await runTest('Coexistence: Phone Number ID inesperado', async () => {
      const callbackUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.supabase.co/functions/v1/embedded-signup-callback');

      const state = crypto.randomUUID();
      const sessionData = JSON.stringify({
        state,
        expiresAt: Date.now() + 15 * 60 * 1000,
        mode: 'dry-run'
      });
      const encodedSession = btoa(sessionData);

      const response = await fetch(callbackUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `es_session=${encodedSession}`
        },
        body: JSON.stringify({
          event: 'WA_EMBEDDED_SIGNUP_COMPLETE',
          state,
          mode: 'dry-run',
          data: {
            waba_id: '851994237367851',
            phone_number_id: 'UNEXPECTED_PHONE_ID', // Diferente!
            current_step: 'FINISH'
          },
          timestamp: new Date().toISOString()
        })
      });

      const result = await response.json();
      if (!result.warnings || result.warnings.length === 0) {
        throw new Error('Debería tener warning por Phone Number ID diferente');
      }
    }));

    // =====================================================
    // TEST 33: Webhook evento history (coexistencia)
    // =====================================================
    results.push(await runTest('Coexistence: Webhook history', async () => {
      const appSecret = Deno.env.get('WHATSAPP_APP_SECRET') || 'test_secret';
      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{
          id: '851994237367851',
          changes: [{
            field: 'history',
            value: {
              messages: [
                { id: 'msg1', type: 'text', from: '573001234567', timestamp: '1234567890' },
                { id: 'msg2', type: 'text', from: '573001234567', timestamp: '1234567891' }
              ]
            }
          }]
        }]
      });

      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(appSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
      const hexSignature = 'sha256=' + Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      const webhookUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.supabase.co/functions/v1/whatsapp-webhook');
      const response = await fetch(webhookUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': hexSignature
        },
        body: payload
      });

      if (response.status !== 200) {
        throw new Error(`Webhook history debería dar 200, dio: ${response.status}`);
      }
    }));

    // =====================================================
    // TEST 34: Webhook evento smb_app_state_sync
    // =====================================================
    results.push(await runTest('Coexistence: Webhook smb_app_state_sync', async () => {
      const appSecret = Deno.env.get('WHATSAPP_APP_SECRET') || 'test_secret';
      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{
          id: '851994237367851',
          changes: [{
            field: 'smb_app_state_sync',
            value: {
              contacts: [
                { wa_id: '573001234567', profile: { name: 'Test Contact' } }
              ],
              deleted_contacts: []
            }
          }]
        }]
      });

      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(appSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
      const hexSignature = 'sha256=' + Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      const webhookUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.supabase.co/functions/v1/whatsapp-webhook');
      const response = await fetch(webhookUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': hexSignature
        },
        body: payload
      });

      if (response.status !== 200) {
        throw new Error(`Webhook smb_app_state_sync debería dar 200, dio: ${response.status}`);
      }
    }));

    // =====================================================
    // TEST 35: Webhook evento smb_message_echoes
    // =====================================================
    results.push(await runTest('Coexistence: Webhook smb_message_echoes', async () => {
      const appSecret = Deno.env.get('WHATSAPP_APP_SECRET') || 'test_secret';
      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{
          id: '851994237367851',
          changes: [{
            field: 'smb_message_echoes',
            value: {
              messages: [
                { id: 'echo1', type: 'text', to: '573001234567', timestamp: '1234567890' }
              ]
            }
          }]
        }]
      });

      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(appSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
      const hexSignature = 'sha256=' + Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      const webhookUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.supabase.co/functions/v1/whatsapp-webhook');
      const response = await fetch(webhookUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': hexSignature
        },
        body: payload
      });

      if (response.status !== 200) {
        throw new Error(`Webhook smb_message_echoes debería dar 200, dio: ${response.status}`);
      }
    }));

    // =====================================================
    // TEST 36: Error de Embedded Signup
    // =====================================================
    results.push(await runTest('Coexistence: Error de Embedded Signup', async () => {
      const callbackUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.supabase.co/functions/v1/embedded-signup-callback');

      const state = crypto.randomUUID();
      const sessionData = JSON.stringify({
        state,
        expiresAt: Date.now() + 15 * 60 * 1000,
        mode: 'dry-run'
      });
      const encodedSession = btoa(sessionData);

      const response = await fetch(callbackUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `es_session=${encodedSession}`
        },
        body: JSON.stringify({
          event: 'WA_EMBEDDED_SIGNUP_COMPLETE',
          state,
          mode: 'dry-run',
          data: {
            error_message: 'Phone number already registered with another WABA'
          },
          timestamp: new Date().toISOString()
        })
      });

      if (response.status !== 400) {
        throw new Error(`Error de signup debería dar 400, dio: ${response.status}`);
      }

      const result = await response.json();
      if (result.success) throw new Error('No debería ser exitoso');
      if (!result.diagnostic) throw new Error('Debería tener diagnóstico');
    }));

    // =====================================================
    // TEST 37: Flujo cancelado por usuario
    // =====================================================
    results.push(await runTest('Coexistence: Flujo cancelado', async () => {
      // Este test simula cuando el usuario cierra el popup sin completar
      // El frontend no envía nada al callback, así que no hay mucho que probar aquí
      // Lo importante es que la página de embedded-signup maneje esto
      const pageUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.supabase.co/functions/v1/embedded-signup-page');

      const response = await fetch(`${pageUrl}?mode=dry-run`);

      if (response.status !== 200) {
        throw new Error(`Página debería cargar, dio: ${response.status}`);
      }

      const html = await response.text();
      if (!html.includes('Diego Neira')) {
        throw new Error('Página debería contener nombre del negocio');
      }
      if (!html.includes('dry-run') && !html.includes('MODO PRUEBA')) {
        throw new Error('Página debería indicar modo dry-run');
      }
    }));

    // =====================================================
    // TEST 38: Embedded Signup Page carga correctamente
    // =====================================================
    results.push(await runTest('Coexistence: Page security headers', async () => {
      const pageUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.supabase.co/functions/v1/embedded-signup-page');

      const response = await fetch(`${pageUrl}?mode=dry-run`);

      // Verificar headers de seguridad
      const csp = response.headers.get('content-security-policy');
      const xfo = response.headers.get('x-frame-options');
      const xcto = response.headers.get('x-content-type-options');
      const cookie = response.headers.get('set-cookie');

      if (!csp) throw new Error('Debería tener Content-Security-Policy');
      if (!csp.includes('facebook.net')) throw new Error('CSP debería permitir Facebook SDK');
      if (xfo !== 'DENY') throw new Error('X-Frame-Options debería ser DENY');
      if (xcto !== 'nosniff') throw new Error('X-Content-Type-Options debería ser nosniff');
      if (!cookie || !cookie.includes('es_session')) throw new Error('Debería setear cookie es_session');
      if (!cookie.includes('HttpOnly')) throw new Error('Cookie debería ser HttpOnly');
      if (!cookie.includes('Secure')) throw new Error('Cookie debería ser Secure');
    }));

  } finally {
    // =====================================================
    // CLEANUP
    // =====================================================
    await supabase.from('whatsapp_action_tokens').delete().eq('sucursal_id', testSucursalId);
    await supabase.from('whatsapp_message_logs').delete().eq('sucursal_id', testSucursalId);
    await supabase.from('citas_estado_historial').delete().in('cita_id',
      (await supabase.from('citas').select('id').eq('sucursal_id', testSucursalId)).data?.map(c => c.id) || []
    );
    await supabase.from('citas').delete().eq('sucursal_id', testSucursalId);
    await supabase.from('sucursales').delete().eq('id', testSucursalId);

    // Cleanup de logs de coexistencia (últimos 5 minutos, solo de tests)
    await supabase.from('whatsapp_coexistence_logs')
      .delete()
      .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .eq('mode', 'dry-run');
  }

  // =====================================================
  // RESUMEN
  // =====================================================
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  return new Response(JSON.stringify({
    summary: {
      total: results.length,
      passed,
      failed,
      all_passed: failed === 0
    },
    results
  }, null, 2), {
    status: failed > 0 ? 500 : 200,
    headers: { 'Content-Type': 'application/json' }
  });
});

// =====================================================
// HELPERS
// =====================================================

async function runTest(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, status: 'PASS', duration_ms: Date.now() - start };
  } catch (error) {
    return {
      name,
      status: 'FAIL',
      error: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - start
    };
  }
}

async function createTestCita(
  supabase: ReturnType<typeof createClient>,
  citaId: string,
  sucursalId: string,
  estado: string
): Promise<void> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  await supabase.from('citas').insert({
    id: citaId,
    sucursal_id: sucursalId,
    estado,
    fecha: tomorrow.toISOString().split('T')[0],
    hora_inicio: '15:00:00',
    cliente_telefono: '573001234567',
    whatsapp_reminder_status: 'sent'
  });
}

async function createTestTokens(
  supabase: ReturnType<typeof createClient>,
  citaId: string,
  sucursalId: string,
  clientPhone: string
): Promise<{ confirm: string; cancel: string }> {
  const confirmToken = 'test_confirm_' + crypto.randomUUID().replace(/-/g, '');
  const cancelToken = 'test_cancel_' + crypto.randomUUID().replace(/-/g, '');
  const messageId = 'wamid_test_' + Date.now();

  const { data: cita } = await supabase
    .from('citas')
    .select('fecha, hora_inicio')
    .eq('id', citaId)
    .single();

  await supabase.from('whatsapp_action_tokens').insert([
    {
      token: confirmToken,
      action: 'CONFIRMAR',
      cita_id: citaId,
      sucursal_id: sucursalId,
      reminder_message_id: messageId,
      cliente_telefono: clientPhone,
      scheduled_date: cita?.fecha,
      scheduled_time: cita?.hora_inicio,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    },
    {
      token: cancelToken,
      action: 'CANCELAR',
      cita_id: citaId,
      sucursal_id: sucursalId,
      reminder_message_id: messageId,
      cliente_telefono: clientPhone,
      scheduled_date: cita?.fecha,
      scheduled_time: cita?.hora_inicio,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }
  ]);

  return { confirm: confirmToken, cancel: cancelToken };
}

async function createTestTokensForDate(
  supabase: ReturnType<typeof createClient>,
  citaId: string,
  sucursalId: string,
  clientPhone: string,
  fecha: string,
  hora: string
): Promise<{ confirm: string; cancel: string }> {
  const confirmToken = 'test_confirm_new_' + crypto.randomUUID().replace(/-/g, '');
  const cancelToken = 'test_cancel_new_' + crypto.randomUUID().replace(/-/g, '');
  const messageId = 'wamid_test_new_' + Date.now();

  await supabase.from('whatsapp_action_tokens').insert([
    {
      token: confirmToken,
      action: 'CONFIRMAR',
      cita_id: citaId,
      sucursal_id: sucursalId,
      reminder_message_id: messageId,
      cliente_telefono: clientPhone,
      scheduled_date: fecha,
      scheduled_time: hora,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    },
    {
      token: cancelToken,
      action: 'CANCELAR',
      cita_id: citaId,
      sucursal_id: sucursalId,
      reminder_message_id: messageId,
      cliente_telefono: clientPhone,
      scheduled_date: fecha,
      scheduled_time: hora,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }
  ]);

  return { confirm: confirmToken, cancel: cancelToken };
}
