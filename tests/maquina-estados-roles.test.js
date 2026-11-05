'use strict';

// Máquina de estados del personal (CU-12, CU-13): RN-06 y RN-11, con las
// condiciones de tiempo decididas en la Iteración 3.
const {
  transicionesPermitidas,
  validarCambioPersonal,
  motivoNoModificablePorPersonal,
} = require('../src/modules/citas/maquina-estados-cita');

const AHORA = { fecha: '2026-11-09', hora: '10:00' };
const cita = (estado, fecha = '2026-11-09', horaInicio = '11:00') => ({ estado, fecha, horaInicio });

describe('transicionesPermitidas (CU-12 paso 2)', () => {
  test('recepción, cita Confirmada de hoy que aún no empieza: En espera y Cancelada', () => {
    expect(transicionesPermitidas(cita('CONFIRMADA'), 'RECEPCIONISTA', AHORA)).toEqual(['EN_ESPERA', 'CANCELADA']);
  });

  test('recepción, cita Confirmada de hoy que ya empezó: En espera y No asistió', () => {
    expect(transicionesPermitidas(cita('CONFIRMADA', '2026-11-09', '09:00'), 'RECEPCIONISTA', AHORA)).toEqual(['EN_ESPERA', 'NO_ASISTIO']);
  });

  test('recepción, cita Confirmada de un día anterior: solo No asistió', () => {
    expect(transicionesPermitidas(cita('CONFIRMADA', '2026-11-06'), 'RECEPCIONISTA', AHORA)).toEqual(['NO_ASISTIO']);
  });

  test('recepción, cita Confirmada de otro día futuro: solo Cancelada', () => {
    expect(transicionesPermitidas(cita('CONFIRMADA', '2026-11-12'), 'RECEPCIONISTA', AHORA)).toEqual(['CANCELADA']);
  });

  test('RN-11: la médica solo marca Atendida, desde En espera', () => {
    expect(transicionesPermitidas(cita('EN_ESPERA'), 'MEDICO', AHORA)).toEqual(['ATENDIDA']);
    expect(transicionesPermitidas(cita('CONFIRMADA'), 'MEDICO', AHORA)).toEqual([]);
  });

  test('RN-11: la recepción no puede marcar Atendida', () => {
    expect(transicionesPermitidas(cita('EN_ESPERA'), 'RECEPCIONISTA', AHORA)).toEqual([]);
  });

  test.each(['ATENDIDA', 'NO_ASISTIO', 'CANCELADA'])('RN-06: %s es final para ambos roles', (estado) => {
    expect(transicionesPermitidas(cita(estado), 'RECEPCIONISTA', AHORA)).toEqual([]);
    expect(transicionesPermitidas(cita(estado), 'MEDICO', AHORA)).toEqual([]);
  });

  test('un rol desconocido no tiene transiciones', () => {
    expect(transicionesPermitidas(cita('CONFIRMADA'), 'PACIENTE', AHORA)).toEqual([]);
  });
});

describe('validarCambioPersonal (CU-12 paso 4)', () => {
  test('cambio válido → null', () => {
    expect(validarCambioPersonal(cita('CONFIRMADA'), 'EN_ESPERA', 'RECEPCIONISTA', AHORA)).toBeNull();
    expect(validarCambioPersonal(cita('EN_ESPERA'), 'ATENDIDA', 'MEDICO', AHORA)).toBeNull();
  });

  test('E1 (RN-06): de Cancelada a En espera → TRANSICION_NO_PERMITIDA', () => {
    expect(validarCambioPersonal(cita('CANCELADA'), 'EN_ESPERA', 'RECEPCIONISTA', AHORA)).toMatchObject({
      codigo: 'TRANSICION_NO_PERMITIDA',
      http: 403,
    });
  });

  test('E1 (RN-06): de Confirmada a Atendida sin pasar por En espera → TRANSICION_NO_PERMITIDA', () => {
    expect(validarCambioPersonal(cita('CONFIRMADA'), 'ATENDIDA', 'MEDICO', AHORA)).toMatchObject({ codigo: 'TRANSICION_NO_PERMITIDA' });
  });

  test('E2 (RN-11): la recepción intenta marcar Atendida → ROL_NO_AUTORIZADO', () => {
    const r = validarCambioPersonal(cita('EN_ESPERA'), 'ATENDIDA', 'RECEPCIONISTA', AHORA);
    expect(r).toMatchObject({ codigo: 'ROL_NO_AUTORIZADO', http: 403 });
    expect(r.mensaje).toMatch(/médica/);
  });

  test('E2 (RN-11): la médica intenta registrar la llegada → ROL_NO_AUTORIZADO', () => {
    expect(validarCambioPersonal(cita('CONFIRMADA'), 'EN_ESPERA', 'MEDICO', AHORA)).toMatchObject({ codigo: 'ROL_NO_AUTORIZADO' });
  });

  test('llegada de una cita de otro día → TRANSICION_NO_PERMITIDA con el motivo', () => {
    const r = validarCambioPersonal(cita('CONFIRMADA', '2026-11-10'), 'EN_ESPERA', 'RECEPCIONISTA', AHORA);
    expect(r).toMatchObject({ codigo: 'TRANSICION_NO_PERMITIDA' });
    expect(r.mensaje).toMatch(/día de la cita/);
  });

  test('No asistió antes de la hora de la cita → TRANSICION_NO_PERMITIDA', () => {
    expect(validarCambioPersonal(cita('CONFIRMADA', '2026-11-09', '10:00'), 'NO_ASISTIO', 'RECEPCIONISTA', { fecha: '2026-11-09', hora: '09:59' })).toMatchObject({
      codigo: 'TRANSICION_NO_PERMITIDA',
    });
    // A la hora exacta ya se puede.
    expect(validarCambioPersonal(cita('CONFIRMADA', '2026-11-09', '10:00'), 'NO_ASISTIO', 'RECEPCIONISTA', AHORA)).toBeNull();
  });

  test('cancelar una cita que ya empezó → TRANSICION_NO_PERMITIDA', () => {
    expect(validarCambioPersonal(cita('CONFIRMADA', '2026-11-09', '09:00'), 'CANCELADA', 'RECEPCIONISTA', AHORA)).toMatchObject({
      codigo: 'TRANSICION_NO_PERMITIDA',
    });
  });

  test('mismo estado → TRANSICION_NO_PERMITIDA', () => {
    expect(validarCambioPersonal(cita('EN_ESPERA'), 'EN_ESPERA', 'RECEPCIONISTA', AHORA)).toMatchObject({ codigo: 'TRANSICION_NO_PERMITIDA' });
  });
});

describe('motivoNoModificablePorPersonal (CU-13 precondición y E1)', () => {
  test('Confirmada y por venir → se puede gestionar', () => {
    expect(motivoNoModificablePorPersonal(cita('CONFIRMADA'), AHORA)).toBeNull();
  });

  test.each(['EN_ESPERA', 'ATENDIDA', 'NO_ASISTIO', 'CANCELADA'])('%s → no se gestiona', (estado) => {
    expect(motivoNoModificablePorPersonal(cita(estado), AHORA)).toMatch(/confirmada/);
  });

  test('ya empezó → no se gestiona', () => {
    expect(motivoNoModificablePorPersonal(cita('CONFIRMADA', '2026-11-09', '10:00'), AHORA)).toMatch(/ya empezó/);
  });
});
