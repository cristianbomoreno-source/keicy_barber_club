-- La comisión de servicios es 40%: registrar_cobro_v2 ya cobraba 40, pero caja
-- y cuadre calculaban con barberos.comision_pct, que estaba en 50.
UPDATE barberos SET comision_pct = 40, comision_porcentaje = 40
WHERE comision_pct = 50 AND tipo_colaborador = 'barbero';

-- Foto de Daniel Rojas rotada: la de WeiBook estaba de lado.
UPDATE usuarios SET avatar_url = 'https://www.keicybarberclub.com/assets/barberos/daniel-rojas.webp'
WHERE id = '6f805d41-35aa-45d4-862a-d584257a3dab';
