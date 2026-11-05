'use strict';

// CitaPresentador: forma pública del comprobante. No incluye cédula, triaje
// ni identificadores internos.
const { transicionesPermitidas, motivoNoModificablePorPersonal } = require('./maquina-estados-cita');

function presentarComprobante({ codigo, servicio, turno, correoEnviado }) {
  return {
    codigo,
    servicio: servicio.nombre,
    fecha: turno.fecha,
    horaInicio: turno.horaInicio,
    horaFin: turno.horaFin,
    indicaciones: servicio.indicaciones,
    correoEnviado,
  };
}

/**
 * Cita vista por la paciente ya identificada (P4). Sin cédula, correo,
 * teléfono, triaje ni identificadores internos de la cita o del turno.
 * servicioId se incluye para consultar los turnos al reprogramar (CU-02).
 */
function presentarCita(c) {
  return {
    codigo: c.codigo,
    estado: c.estado,
    servicioId: c.servicioId,
    servicio: c.servicio,
    paciente: c.nombres,
    fecha: c.fecha,
    horaInicio: c.horaInicio,
    horaFin: c.horaFin,
  };
}

/**
 * Cita en la agenda del panel (CU-11). Incluye la cédula para identificar a
 * la paciente en recepción, pero nunca respuestas del triaje (RN-16).
 * `transiciones`: estados a los que el rol puede llevarla ahora (CU-12).
 * `puedeReprogramar`: solo recepción, con la cita Confirmada y por venir (CU-13).
 * `tieneTriaje`: solo se informa a la médica.
 */
function presentarItemAgenda(c, rol, ahora) {
  const item = {
    codigo: c.codigo,
    estado: c.estado,
    fecha: c.fecha,
    horaInicio: c.horaInicio,
    horaFin: c.horaFin,
    paciente: c.nombres,
    cedula: c.cedula,
    servicioId: c.servicioId,
    servicio: c.servicio,
    transiciones: transicionesPermitidas(c, rol, ahora),
    puedeReprogramar: rol === 'RECEPCIONISTA' && motivoNoModificablePorPersonal(c, ahora) === null,
  };
  // CU-16 E2: solo se agrega cuando aplica, para que recepción la reprograme.
  if (c.fueraDeHorario && c.estado !== 'CANCELADA') item.fueraDeHorario = true;
  if (rol === 'MEDICO') item.tieneTriaje = Boolean(c.tieneTriaje);
  return item;
}

module.exports = { presentarComprobante, presentarCita, presentarItemAgenda };
