'use strict';

// CU-16 E2: una cita activa en un turno que quedó fuera del horario se marca
// en la agenda para que recepción la reprograme.
const { presentarItemAgenda } = require('../src/modules/citas/cita.presentador');

const ahora = { fecha: '2026-11-05', hora: '08:00' };
const cita = {
  codigo: 'CR-04851',
  estado: 'CONFIRMADA',
  fecha: '2026-11-12',
  horaInicio: '14:40',
  horaFin: '15:20',
  nombres: 'Paciente Demo',
  cedula: '000-010190-0001A',
  servicioId: 2,
  servicio: 'Control Prenatal',
  tieneTriaje: false,
};

describe('presentarItemAgenda: fueraDeHorario', () => {
  test('se agrega solo cuando el turno quedó fuera del horario', () => {
    expect(presentarItemAgenda({ ...cita, fueraDeHorario: true }, 'RECEPCIONISTA', ahora)).toMatchObject({ fueraDeHorario: true, puedeReprogramar: true });
    expect(presentarItemAgenda({ ...cita, fueraDeHorario: false }, 'RECEPCIONISTA', ahora)).not.toHaveProperty('fueraDeHorario');
  });

  test('una cita cancelada no se marca', () => {
    expect(presentarItemAgenda({ ...cita, estado: 'CANCELADA', fueraDeHorario: true }, 'MEDICO', ahora)).not.toHaveProperty('fueraDeHorario');
  });
});
