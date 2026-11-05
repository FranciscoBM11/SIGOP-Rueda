'use strict';

// Máquina de estados de la cita (RN-06). Los roles de cada transición
// (RN-11) se agregan en la Iteración 3 junto con el panel administrativo.
const ESTADOS = Object.freeze(['CONFIRMADA', 'EN_ESPERA', 'ATENDIDA', 'NO_ASISTIO', 'CANCELADA']);

// Confirmada → En Espera → Atendida; Confirmada → No asistió; Confirmada → Cancelada.
const TRANSICIONES = Object.freeze({
  CONFIRMADA: Object.freeze(['EN_ESPERA', 'NO_ASISTIO', 'CANCELADA']),
  EN_ESPERA: Object.freeze(['ATENDIDA']),
  ATENDIDA: Object.freeze([]),
  NO_ASISTIO: Object.freeze([]),
  CANCELADA: Object.freeze([]),
});

function puedeTransicionar(desde, hacia) {
  return (TRANSICIONES[desde] ?? []).includes(hacia);
}

function esFinal(estado) {
  return Array.isArray(TRANSICIONES[estado]) && TRANSICIONES[estado].length === 0;
}

const MOTIVO_POR_ESTADO = Object.freeze({
  CANCELADA: 'Esta cita ya fue cancelada. Si necesitas otra, agenda una nueva.',
  EN_ESPERA: 'Ya registraste tu llegada a la clínica: esta cita no puede cancelarse ni reprogramarse en línea.',
  ATENDIDA: 'Esta cita ya fue atendida: no puede cancelarse ni reprogramarse.',
  NO_ASISTIO: 'Esta cita quedó registrada como no asistida: no puede cancelarse ni reprogramarse. Agenda una nueva.',
});

/** ¿El turno ya empezó o pasó según la hora de Managua? */
function turnoYaEmpezo({ fecha, horaInicio }, ahora) {
  return fecha < ahora.fecha || (fecha === ahora.fecha && horaInicio <= ahora.hora);
}

/**
 * La paciente solo puede cancelar o reprogramar (CU-06 y CU-07, precondición
 * y E2) una cita CONFIRMADA cuyo turno no haya empezado.
 * @param {{ estado: string, fecha: string, horaInicio: string }} cita
 * @param {{ fecha: string, hora: string }} ahora hora de Managua
 * @returns {string|null} motivo para mostrar, o null si se puede modificar
 */
function motivoNoModificablePorPaciente(cita, ahora) {
  if (cita.estado !== 'CONFIRMADA') {
    return MOTIVO_POR_ESTADO[cita.estado] ?? 'Esta cita no puede cancelarse ni reprogramarse.';
  }
  if (turnoYaEmpezo(cita, ahora)) {
    return 'La hora de esta cita ya pasó: no puede cancelarse ni reprogramarse en línea. Comunícate con la clínica.';
  }
  return null;
}

module.exports = { ESTADOS, TRANSICIONES, puedeTransicionar, esFinal, turnoYaEmpezo, motivoNoModificablePorPaciente };
