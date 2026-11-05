'use strict';

// CitasService.cancelar() (CU-06) y reprogramar() (CU-07) con colaboradores simulados.
// Reglas: RN-01, RN-06, RN-07 y flujos E2, E4.
const { crearCitasService } = require('../src/modules/citas/citas.service');
const { ErrorNegocio } = require('../src/common/errores');

const citaBd = (extra = {}) => ({
  id: 7,
  codigo: 'CR-04821',
  estado: 'CONFIRMADA',
  turnoId: 30,
  servicioId: 2,
  servicio: 'Control Prenatal',
  indicaciones: 'Traer carné.',
  nombres: 'María José López',
  correo: 'maria@ejemplo.com',
  fecha: '2026-11-10',
  horaInicio: '09:30',
  horaFin: '10:00',
  ...extra,
});

const turnoNuevo = { id: 41, fecha: '2026-11-12', horaInicio: '08:00', horaFin: '08:40' };

function armar({ cita = citaBd(), ...sobrescribir } = {}) {
  const tx = { soyTransaccion: true };
  const d = {
    transaccion: jest.fn(async (fn) => fn(tx)),
    citasRepo: {
      bloquearPorId: jest.fn().mockResolvedValue(cita),
      actualizarEstado: jest.fn(),
      cambiarTurno: jest.fn(),
    },
    cambiosEstadoRepo: { registrar: jest.fn() },
    serviciosService: {},
    turnosService: { reservar: jest.fn().mockResolvedValue(turnoNuevo) },
    pacientesService: {},
    triajeService: {},
    notificacionesService: { registrarPendiente: jest.fn().mockResolvedValue(15), enviar: jest.fn().mockResolvedValue(true) },
    reloj: () => ({ fecha: '2026-11-09', hora: '10:00' }),
    ...sobrescribir,
  };
  return { d, tx, citas: crearCitasService(d) };
}

describe('CU-06 CitasService.cancelar', () => {
  test('flujo principal: Confirmada → Cancelada en una transacción con su cambio de estado', async () => {
    const { d, tx, citas } = armar();
    const r = await citas.cancelar(7);

    expect(d.transaccion).toHaveBeenCalledTimes(1);
    expect(d.citasRepo.bloquearPorId).toHaveBeenCalledWith(tx, 7);
    expect(d.citasRepo.actualizarEstado).toHaveBeenCalledWith(tx, 7, 'CANCELADA');
    expect(d.cambiosEstadoRepo.registrar).toHaveBeenCalledWith(tx, expect.objectContaining({
      citaId: 7,
      estadoAnterior: 'CONFIRMADA',
      estadoNuevo: 'CANCELADA',
      origen: 'PACIENTE',
    }));
    expect(r).toEqual({
      cita: {
        codigo: 'CR-04821',
        estado: 'CANCELADA',
        servicioId: 2,
        servicio: 'Control Prenatal',
        paciente: 'María José López',
        fecha: '2026-11-10',
        horaInicio: '09:30',
        horaFin: '10:00',
      },
    });
  });

  test('RN-07: no toca el turno (queda libre porque la cita ya no está activa)', async () => {
    const { d, citas } = armar();
    await citas.cancelar(7);
    expect(d.citasRepo.cambiarTurno).not.toHaveBeenCalled();
    expect(d.turnosService.reservar).not.toHaveBeenCalled();
  });

  test.each(['CANCELADA', 'EN_ESPERA', 'ATENDIDA', 'NO_ASISTIO'])('RN-06 / E2: una cita %s no se cancela', async (estado) => {
    const { d, citas } = armar({ cita: citaBd({ estado }) });
    await expect(citas.cancelar(7)).rejects.toMatchObject({ codigo: 'CITA_NO_MODIFICABLE', http: 409 });
    expect(d.citasRepo.actualizarEstado).not.toHaveBeenCalled();
    expect(d.cambiosEstadoRepo.registrar).not.toHaveBeenCalled();
  });

  test('una cita cuya hora ya pasó no se cancela', async () => {
    const { citas } = armar({ cita: citaBd({ fecha: '2026-11-09', horaInicio: '09:00' }) });
    await expect(citas.cancelar(7)).rejects.toMatchObject({ codigo: 'CITA_NO_MODIFICABLE' });
  });

  test('cita inexistente → 404', async () => {
    const { citas } = armar({ cita: null });
    await expect(citas.cancelar(7)).rejects.toMatchObject({ codigo: 'CITA_NO_ENCONTRADA', http: 404 });
  });
});

describe('CU-07 CitasService.reprogramar', () => {
  test('flujo principal: nuevo turno, mismo código, sigue Confirmada y envía el correo', async () => {
    const { d, tx, citas } = armar();
    const r = await citas.reprogramar(7, 41);

    expect(d.turnosService.reservar).toHaveBeenCalledWith(tx, 41);
    expect(d.citasRepo.cambiarTurno).toHaveBeenCalledWith(tx, 7, 41);
    expect(d.citasRepo.actualizarEstado).not.toHaveBeenCalled();
    // RN-06: reprogramar mantiene la cita en Confirmada; el cambio queda registrado.
    expect(d.cambiosEstadoRepo.registrar).toHaveBeenCalledWith(tx, expect.objectContaining({
      citaId: 7,
      estadoAnterior: 'CONFIRMADA',
      estadoNuevo: 'CONFIRMADA',
      origen: 'PACIENTE',
      detalle: expect.stringContaining('2026-11-12 08:00'),
    }));
    expect(d.notificacionesService.registrarPendiente).toHaveBeenCalledWith(tx, 7, 'REPROGRAMACION');
    expect(d.notificacionesService.enviar).toHaveBeenCalledWith(15, 'REPROGRAMACION', 'maria@ejemplo.com', expect.objectContaining({
      codigo: 'CR-04821',
      fecha: '2026-11-12',
      horaInicio: '08:00',
      anterior: { fecha: '2026-11-10', horaInicio: '09:30' },
    }));
    expect(r).toEqual({
      codigo: 'CR-04821',
      servicio: 'Control Prenatal',
      nuevoHorario: { fecha: '2026-11-12', horaInicio: '08:00', horaFin: '08:40' },
      indicaciones: 'Traer carné.',
      correoEnviado: true,
    });
  });

  test('el correo se envía después del commit; si falla, la reprogramación se mantiene', async () => {
    const orden = [];
    const { citas } = armar({
      transaccion: jest.fn(async (fn) => {
        const r = await fn({});
        orden.push('commit');
        return r;
      }),
      notificacionesService: {
        registrarPendiente: jest.fn().mockResolvedValue(15),
        enviar: jest.fn(async () => {
          orden.push('enviar');
          return false;
        }),
      },
    });
    const r = await citas.reprogramar(7, 41);
    expect(orden).toEqual(['commit', 'enviar']);
    expect(r.correoEnviado).toBe(false);
  });

  test('RN-01 / E4: si el turno nuevo está ocupado, no cambia nada', async () => {
    const { d, citas } = armar();
    d.turnosService.reservar.mockRejectedValue(new ErrorNegocio('TURNO_OCUPADO', 'El turno ya fue reservado. Elige otro.', 409));
    await expect(citas.reprogramar(7, 41)).rejects.toMatchObject({ codigo: 'TURNO_OCUPADO', http: 409 });
    expect(d.citasRepo.cambiarTurno).not.toHaveBeenCalled();
    expect(d.notificacionesService.enviar).not.toHaveBeenCalled();
  });

  test('RN-01: la carrera que detecta el índice único se traduce en TURNO_OCUPADO', async () => {
    const { d, citas } = armar();
    const duplicado = Object.assign(new Error("Cannot insert duplicate key row in object 'dbo.citas' with unique index 'uq_cita_turno_activa'."), { number: 2601 });
    d.citasRepo.cambiarTurno.mockRejectedValue(duplicado);
    await expect(citas.reprogramar(7, 41)).rejects.toMatchObject({ codigo: 'TURNO_OCUPADO', http: 409 });
  });

  test('elegir el mismo turno → 409 MISMO_TURNO', async () => {
    const { d, citas } = armar();
    await expect(citas.reprogramar(7, 30)).rejects.toMatchObject({ codigo: 'MISMO_TURNO', http: 409 });
    expect(d.turnosService.reservar).not.toHaveBeenCalled();
  });

  test.each(['CANCELADA', 'EN_ESPERA', 'ATENDIDA', 'NO_ASISTIO'])('RN-06 / E2: una cita %s no se reprograma', async (estado) => {
    const { d, citas } = armar({ cita: citaBd({ estado }) });
    await expect(citas.reprogramar(7, 41)).rejects.toMatchObject({ codigo: 'CITA_NO_MODIFICABLE', http: 409 });
    expect(d.turnosService.reservar).not.toHaveBeenCalled();
  });

  test('turno nuevo pasado o deshabilitado: se propaga el error de TurnosService', async () => {
    const { d, citas } = armar();
    d.turnosService.reservar.mockRejectedValue(new ErrorNegocio('TURNO_NO_DISPONIBLE', 'x', 409));
    await expect(citas.reprogramar(7, 41)).rejects.toMatchObject({ codigo: 'TURNO_NO_DISPONIBLE' });
  });
});
