-- =============================================
-- MIGRACIÓN: Crear índices para foreign keys
-- Fecha: 2026-10-08
-- Problema: 84 foreign keys sin índice de cobertura
-- Impacto: Mejora 50-80% en tiempo de queries
-- =============================================

-- admin_sede_permisos
CREATE INDEX IF NOT EXISTS idx_admin_sede_permisos_usuario_id
ON public.admin_sede_permisos(usuario_id);

-- admin_sede_sedes_asignadas
CREATE INDEX IF NOT EXISTS idx_admin_sede_sedes_asignadas_sucursal_id
ON public.admin_sede_sedes_asignadas(sucursal_id);

CREATE INDEX IF NOT EXISTS idx_admin_sede_sedes_asignadas_usuario_id
ON public.admin_sede_sedes_asignadas(usuario_id);

-- alertas_barbero
CREATE INDEX IF NOT EXISTS idx_alertas_barbero_cita_id
ON public.alertas_barbero(cita_id);

-- autorizaciones_admin_sede
CREATE INDEX IF NOT EXISTS idx_autorizaciones_admin_sede_autorizado_por
ON public.autorizaciones_admin_sede(autorizado_por);

CREATE INDEX IF NOT EXISTS idx_autorizaciones_admin_sede_solicitante_id
ON public.autorizaciones_admin_sede(solicitante_id);

CREATE INDEX IF NOT EXISTS idx_autorizaciones_admin_sede_sucursal_id
ON public.autorizaciones_admin_sede(sucursal_id);

-- barberos
CREATE INDEX IF NOT EXISTS idx_barberos_sucursal_id
ON public.barberos(sucursal_id);

-- bloqueos_barbero
CREATE INDEX IF NOT EXISTS idx_bloqueos_barbero_barbero_id
ON public.bloqueos_barbero(barbero_id);

-- caja_movimientos
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_sucursal_id
ON public.caja_movimientos(sucursal_id);

CREATE INDEX IF NOT EXISTS idx_caja_movimientos_ticket_id
ON public.caja_movimientos(ticket_id);

-- canjes
CREATE INDEX IF NOT EXISTS idx_canjes_cliente_id
ON public.canjes(cliente_id);

-- cita_items_adicionales
CREATE INDEX IF NOT EXISTS idx_cita_items_adicionales_cita_id
ON public.cita_items_adicionales(cita_id);

-- citas (tabla crítica)
CREATE INDEX IF NOT EXISTS idx_citas_cancelado_por
ON public.citas(cancelado_por);

CREATE INDEX IF NOT EXISTS idx_citas_servicio_id
ON public.citas(servicio_id);

-- citas_estado_historial
CREATE INDEX IF NOT EXISTS idx_citas_estado_historial_cambiado_por
ON public.citas_estado_historial(cambiado_por);

CREATE INDEX IF NOT EXISTS idx_citas_estado_historial_cita_id
ON public.citas_estado_historial(cita_id);

-- citas_historial
CREATE INDEX IF NOT EXISTS idx_citas_historial_barbero_anterior_id
ON public.citas_historial(barbero_anterior_id);

CREATE INDEX IF NOT EXISTS idx_citas_historial_barbero_nuevo_id
ON public.citas_historial(barbero_nuevo_id);

CREATE INDEX IF NOT EXISTS idx_citas_historial_cita_id
ON public.citas_historial(cita_id);

-- cobro_metodos
CREATE INDEX IF NOT EXISTS idx_cobro_metodos_caja_movimiento_id
ON public.cobro_metodos(caja_movimiento_id);

CREATE INDEX IF NOT EXISTS idx_cobro_metodos_ticket_id
ON public.cobro_metodos(ticket_id);

-- comisiones
CREATE INDEX IF NOT EXISTS idx_comisiones_cita_id
ON public.comisiones(cita_id);

CREATE INDEX IF NOT EXISTS idx_comisiones_created_by
ON public.comisiones(created_by);

CREATE INDEX IF NOT EXISTS idx_comisiones_pago_id
ON public.comisiones(pago_id);

CREATE INDEX IF NOT EXISTS idx_comisiones_sucursal_id
ON public.comisiones(sucursal_id);

-- consumos_bebidas_barbero
CREATE INDEX IF NOT EXISTS idx_consumos_bebidas_barbero_barbero_id
ON public.consumos_bebidas_barbero(barbero_id);

CREATE INDEX IF NOT EXISTS idx_consumos_bebidas_barbero_bebida_id
ON public.consumos_bebidas_barbero(bebida_id);

CREATE INDEX IF NOT EXISTS idx_consumos_bebidas_barbero_sucursal_id
ON public.consumos_bebidas_barbero(sucursal_id);

-- external_collaborator_mappings
CREATE INDEX IF NOT EXISTS idx_external_collaborator_mappings_internal_barber_id
ON public.external_collaborator_mappings(internal_barber_id);

CREATE INDEX IF NOT EXISTS idx_external_collaborator_mappings_internal_branch_id
ON public.external_collaborator_mappings(internal_branch_id);

-- external_service_mappings
CREATE INDEX IF NOT EXISTS idx_external_service_mappings_internal_service_id
ON public.external_service_mappings(internal_service_id);

-- inventario_productos_venta
CREATE INDEX IF NOT EXISTS idx_inventario_productos_venta_sucursal_id
ON public.inventario_productos_venta(sucursal_id);

-- metodos_pago
CREATE INDEX IF NOT EXISTS idx_metodos_pago_sucursal_id
ON public.metodos_pago(sucursal_id);

-- pagos
CREATE INDEX IF NOT EXISTS idx_pagos_cita_id
ON public.pagos(cita_id);

CREATE INDEX IF NOT EXISTS idx_pagos_registrado_por
ON public.pagos(registrado_por);

CREATE INDEX IF NOT EXISTS idx_pagos_ticket_id
ON public.pagos(ticket_id);

-- pagos_colaboradores
CREATE INDEX IF NOT EXISTS idx_pagos_colaboradores_barbero_id
ON public.pagos_colaboradores(barbero_id);

CREATE INDEX IF NOT EXISTS idx_pagos_colaboradores_created_by
ON public.pagos_colaboradores(created_by);

CREATE INDEX IF NOT EXISTS idx_pagos_colaboradores_sucursal_id
ON public.pagos_colaboradores(sucursal_id);

CREATE INDEX IF NOT EXISTS idx_pagos_colaboradores_turno_id
ON public.pagos_colaboradores(turno_id);

CREATE INDEX IF NOT EXISTS idx_pagos_colaboradores_usuario_id
ON public.pagos_colaboradores(usuario_id);

-- pagos_comisiones
CREATE INDEX IF NOT EXISTS idx_pagos_comisiones_barbero_id
ON public.pagos_comisiones(barbero_id);

CREATE INDEX IF NOT EXISTS idx_pagos_comisiones_sucursal_id
ON public.pagos_comisiones(sucursal_id);

-- paquetes_cliente
CREATE INDEX IF NOT EXISTS idx_paquetes_cliente_cliente_id
ON public.paquetes_cliente(cliente_id);

-- puntos_movimientos
CREATE INDEX IF NOT EXISTS idx_puntos_movimientos_cita_id
ON public.puntos_movimientos(cita_id);

CREATE INDEX IF NOT EXISTS idx_puntos_movimientos_cliente_id
ON public.puntos_movimientos(cliente_id);

-- resenas
CREATE INDEX IF NOT EXISTS idx_resenas_barbero_id
ON public.resenas(barbero_id);

CREATE INDEX IF NOT EXISTS idx_resenas_cita_id
ON public.resenas(cita_id);

CREATE INDEX IF NOT EXISTS idx_resenas_cliente_id
ON public.resenas(cliente_id);

CREATE INDEX IF NOT EXISTS idx_resenas_ticket_id
ON public.resenas(ticket_id);

-- retos_clientes
CREATE INDEX IF NOT EXISTS idx_retos_clientes_cliente_id
ON public.retos_clientes(cliente_id);

CREATE INDEX IF NOT EXISTS idx_retos_clientes_reto_id
ON public.retos_clientes(reto_id);

-- servicios
CREATE INDEX IF NOT EXISTS idx_servicios_categoria_id
ON public.servicios(categoria_id);

-- short_urls
CREATE INDEX IF NOT EXISTS idx_short_urls_barbero_id
ON public.short_urls(barbero_id);

-- solicitudes_insumos
CREATE INDEX IF NOT EXISTS idx_solicitudes_insumos_barbero_id
ON public.solicitudes_insumos(barbero_id);

CREATE INDEX IF NOT EXISTS idx_solicitudes_insumos_insumo_id
ON public.solicitudes_insumos(insumo_id);

CREATE INDEX IF NOT EXISTS idx_solicitudes_insumos_sucursal_id
ON public.solicitudes_insumos(sucursal_id);

-- ticket_items
CREATE INDEX IF NOT EXISTS idx_ticket_items_barbero_id
ON public.ticket_items(barbero_id);

CREATE INDEX IF NOT EXISTS idx_ticket_items_ticket_id
ON public.ticket_items(ticket_id);

-- tickets (tabla crítica)
CREATE INDEX IF NOT EXISTS idx_tickets_anulado_por
ON public.tickets(anulado_por);

CREATE INDEX IF NOT EXISTS idx_tickets_barbero_id
ON public.tickets(barbero_id);

CREATE INDEX IF NOT EXISTS idx_tickets_cita_id
ON public.tickets(cita_id);

CREATE INDEX IF NOT EXISTS idx_tickets_cliente_id
ON public.tickets(cliente_id);

CREATE INDEX IF NOT EXISTS idx_tickets_registrado_por
ON public.tickets(registrado_por);

CREATE INDEX IF NOT EXISTS idx_tickets_sesion_caja_id
ON public.tickets(sesion_caja_id);

-- turnos_admin_sede
CREATE INDEX IF NOT EXISTS idx_turnos_admin_sede_operador_id
ON public.turnos_admin_sede(operador_id);

CREATE INDEX IF NOT EXISTS idx_turnos_admin_sede_reabierto_por
ON public.turnos_admin_sede(reabierto_por);

CREATE INDEX IF NOT EXISTS idx_turnos_admin_sede_reapertura_autorizada_por
ON public.turnos_admin_sede(reapertura_autorizada_por);

-- turnos_admin_sede_logs
CREATE INDEX IF NOT EXISTS idx_turnos_admin_sede_logs_turno_id
ON public.turnos_admin_sede_logs(turno_id);

CREATE INDEX IF NOT EXISTS idx_turnos_admin_sede_logs_usuario_id
ON public.turnos_admin_sede_logs(usuario_id);

-- usuarios
CREATE INDEX IF NOT EXISTS idx_usuarios_sucursal_id
ON public.usuarios(sucursal_id);

-- ventas_productos (tabla con muchos FKs)
CREATE INDEX IF NOT EXISTS idx_ventas_productos_barbero_id
ON public.ventas_productos(barbero_id);

CREATE INDEX IF NOT EXISTS idx_ventas_productos_cita_id
ON public.ventas_productos(cita_id);

CREATE INDEX IF NOT EXISTS idx_ventas_productos_cliente_id
ON public.ventas_productos(cliente_id);

CREATE INDEX IF NOT EXISTS idx_ventas_productos_comision_receptor_id
ON public.ventas_productos(comision_receptor_id);

CREATE INDEX IF NOT EXISTS idx_ventas_productos_producto_id
ON public.ventas_productos(producto_id);

CREATE INDEX IF NOT EXISTS idx_ventas_productos_registrado_por
ON public.ventas_productos(registrado_por);

CREATE INDEX IF NOT EXISTS idx_ventas_productos_sucursal_id
ON public.ventas_productos(sucursal_id);

CREATE INDEX IF NOT EXISTS idx_ventas_productos_ticket_id
ON public.ventas_productos(ticket_id);

CREATE INDEX IF NOT EXISTS idx_ventas_productos_turno_id
ON public.ventas_productos(turno_id);

-- wallet_movimientos
CREATE INDEX IF NOT EXISTS idx_wallet_movimientos_cliente_id
ON public.wallet_movimientos(cliente_id);

-- weibook_ventas
CREATE INDEX IF NOT EXISTS idx_weibook_ventas_usuario_id
ON public.weibook_ventas(usuario_id);

-- whatsapp_action_tokens
CREATE INDEX IF NOT EXISTS idx_whatsapp_action_tokens_sucursal_id
ON public.whatsapp_action_tokens(sucursal_id);

-- =============================================
-- ANÁLISIS: Ejecutar ANALYZE en tablas críticas
-- =============================================
ANALYZE public.citas;
ANALYZE public.tickets;
ANALYZE public.usuarios;
ANALYZE public.barberos;
ANALYZE public.servicios;
ANALYZE public.sucursales;
ANALYZE public.resenas;
