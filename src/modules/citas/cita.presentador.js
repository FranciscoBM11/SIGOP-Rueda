'use strict';

// CitaPresentador: forma pública del comprobante. No incluye cédula, triaje
// ni identificadores internos.

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

module.exports = { presentarComprobante, presentarCita };
