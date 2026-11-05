'use strict';

// RN-06: transiciones permitidas y estados finales; regla de la paciente (CU-06/07 E2).
const {
  ESTADOS,
  puedeTransicionar,
  esFinal,
  motivoNoModificablePorPaciente,
} = require('../src/modules/citas/maquina-estados-cita');

describe('RN-06 máquina de estados de la cita', () => {
  const permitidas = [
    ['CONFIRMADA', 'EN_ESPERA'],
    ['EN_ESPERA', 'ATENDIDA'],
    ['CONFIRMADA', 'NO_ASISTIO'],
    ['CONFIRMADA', 'CANCELADA'],
  ];

  test.each(permitidas)('%s → %s está permitida', (desde, hacia) => {
    expect(puedeTransicionar(desde, hacia)).toBe(true);
  });

  test('ninguna otra combinación está permitida', () => {
    for (const desde of ESTADOS) {
      for (const hacia of ESTADOS) {
        const esperada = permitidas.some(([d, h]) => d === desde && h === hacia);
        expect(puedeTransicionar(desde, hacia)).toBe(esperada);
      }
    }
  });

  test('Atendida, No asistió y Cancelada son finales', () => {
    expect(ESTADOS.filter(esFinal).sort()).toEqual(['ATENDIDA', 'CANCELADA', 'NO_ASISTIO']);
  });
});

describe('motivoNoModificablePorPaciente', () => {
  const ahora = { fecha: '2026-11-09', hora: '10:00' };
  const cita = (extra) => ({ estado: 'CONFIRMADA', fecha: '2026-11-10', horaInicio: '08:00', ...extra });

  test('una cita Confirmada por venir se puede modificar', () => {
    expect(motivoNoModificablePorPaciente(cita(), ahora)).toBeNull();
    expect(motivoNoModificablePorPaciente(cita({ fecha: '2026-11-09', horaInicio: '10:01' }), ahora)).toBeNull();
  });

  test.each(['CANCELADA', 'EN_ESPERA', 'ATENDIDA', 'NO_ASISTIO'])('estado %s → no modificable', (estado) => {
    expect(motivoNoModificablePorPaciente(cita({ estado }), ahora)).toEqual(expect.any(String));
  });

  test('un turno que ya empezó o pasó no se puede modificar', () => {
    expect(motivoNoModificablePorPaciente(cita({ fecha: '2026-11-09', horaInicio: '10:00' }), ahora)).toMatch(/ya pasó/);
    expect(motivoNoModificablePorPaciente(cita({ fecha: '2026-11-08', horaInicio: '15:00' }), ahora)).toMatch(/ya pasó/);
  });
});
