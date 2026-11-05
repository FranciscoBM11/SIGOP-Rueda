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

module.exports = { presentarComprobante };
