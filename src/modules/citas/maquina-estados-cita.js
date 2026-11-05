'use strict';

// Máquina de estados de la cita (RN-06) y quién puede hacer cada transición (RN-11).
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

// ---- Personal de la clínica (CU-12, CU-13; RN-11) ---------------------------

const ROLES = Object.freeze(['MEDICO', 'RECEPCIONISTA']);

// RN-11: solo la médica marca Atendida; la recepción registra En Espera,
// No asistió y Cancelada.
const TRANSICIONES_POR_ROL = Object.freeze({
  RECEPCIONISTA: Object.freeze({ CONFIRMADA: Object.freeze(['EN_ESPERA', 'NO_ASISTIO', 'CANCELADA']) }),
  MEDICO: Object.freeze({ EN_ESPERA: Object.freeze(['ATENDIDA']) }),
});

/**
 * Condición de tiempo de cada transición (decisión de la Iteración 3):
 * - En Espera (llegada): solo el día de la cita.
 * - No asistió: solo cuando la hora de la cita ya empezó.
 * - Cancelada: solo mientras la hora de la cita no haya empezado (CU-13).
 * - Atendida: sin condición (la paciente ya está en la clínica).
 * @returns {string|null} motivo si no se cumple
 */
function motivoPorTiempo(cita, hacia, ahora) {
  const empezo = turnoYaEmpezo(cita, ahora);
  if (hacia === 'EN_ESPERA' && cita.fecha !== ahora.fecha) {
    return 'La llegada solo se registra el día de la cita.';
  }
  if (hacia === 'NO_ASISTIO' && !empezo) {
    return 'Solo se marca «No asistió» cuando la hora de la cita ya empezó.';
  }
  if (hacia === 'CANCELADA' && empezo) {
    return 'La hora de esta cita ya empezó: no se puede cancelar. Si la paciente no llegó, márcala como «No asistió».';
  }
  return null;
}

/**
 * Estados a los que el rol puede llevar la cita ahora (CU-12 paso 2):
 * cumplen RN-06, RN-11 y la condición de tiempo.
 */
function transicionesPermitidas(cita, rol, ahora) {
  const delRol = TRANSICIONES_POR_ROL[rol]?.[cita.estado] ?? [];
  return delRol.filter((hacia) => puedeTransicionar(cita.estado, hacia) && motivoPorTiempo(cita, hacia, ahora) === null);
}

const NOMBRE_ESTADO = Object.freeze({
  CONFIRMADA: 'Confirmada',
  EN_ESPERA: 'En espera',
  ATENDIDA: 'Atendida',
  NO_ASISTIO: 'No asistió',
  CANCELADA: 'Cancelada',
});

/**
 * Valida un cambio de estado hecho por el personal (CU-12 paso 4).
 * @returns {null | { codigo: string, http: number, mensaje: string }}
 */
function validarCambioPersonal(cita, hacia, rol, ahora) {
  if (!puedeTransicionar(cita.estado, hacia)) {
    // E1: la transición no existe en RN-06.
    return {
      codigo: 'TRANSICION_NO_PERMITIDA',
      http: 403,
      mensaje: `Una cita «${NOMBRE_ESTADO[cita.estado] ?? cita.estado}» no puede pasar a «${NOMBRE_ESTADO[hacia] ?? hacia}».`,
    };
  }
  if (!(TRANSICIONES_POR_ROL[rol]?.[cita.estado] ?? []).includes(hacia)) {
    // E2: RN-11.
    const mensaje =
      hacia === 'ATENDIDA'
        ? 'Solo la médica puede marcar una cita como atendida.'
        : 'Este cambio de estado lo registra la recepción.';
    return { codigo: 'ROL_NO_AUTORIZADO', http: 403, mensaje };
  }
  const motivo = motivoPorTiempo(cita, hacia, ahora);
  if (motivo) return { codigo: 'TRANSICION_NO_PERMITIDA', http: 403, mensaje: motivo };
  return null;
}

/**
 * Recepción solo cancela o reprograma (CU-13) una cita Confirmada cuya hora
 * no haya empezado (precondición y E1).
 * @returns {string|null} motivo, o null si se puede gestionar
 */
function motivoNoModificablePorPersonal(cita, ahora) {
  if (cita.estado !== 'CONFIRMADA') {
    return `La cita está «${NOMBRE_ESTADO[cita.estado] ?? cita.estado}»: solo se cancela o reprograma una cita confirmada.`;
  }
  if (turnoYaEmpezo(cita, ahora)) {
    return 'La hora de esta cita ya empezó: ya no se puede cancelar ni reprogramar.';
  }
  return null;
}

module.exports = {
  ESTADOS,
  ROLES,
  TRANSICIONES,
  TRANSICIONES_POR_ROL,
  NOMBRE_ESTADO,
  puedeTransicionar,
  esFinal,
  turnoYaEmpezo,
  motivoNoModificablePorPaciente,
  transicionesPermitidas,
  validarCambioPersonal,
  motivoNoModificablePorPersonal,
};
