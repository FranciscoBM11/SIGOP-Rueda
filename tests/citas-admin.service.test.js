'use strict';

// CitasService del panel con colaboradores simulados:
// CU-11 agenda, CU-12 cambiar estado (RN-06, RN-11, RF-17) y CU-13
// cancelar/reprogramar desde recepción (RN-01, RN-07).
const { crearCitasService } = require('../src/modules/citas/citas.service');
const { ErrorNegocio } = require('../src/common/errores');

const RECEPCION = { sesionId: 'S', usuarioId: 2, nombre: 'José Lira', rol: 'RECEPCIONISTA' };
const MEDICA = { sesionId: 'S', usuarioId: 1, nombre: 'Dra. Rueda', rol: 'MEDICO' };
const AHORA = { fecha: '2026-11-09', hora: '10:00' };

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
  cedula: '001-150390-0012K',
  fecha: '2026-11-09',
  horaInicio: '11:00',
  horaFin: '11:40',
  tieneTriaje: true,
  ...extra,
});

const turnoNuevo = { id: 41, fecha: '2026-11-12', horaInicio: '08:00', horaFin: '08:40' };

function armar({ cita = citaBd(), agenda = [] } = {}) {
  const tx = { soyTransaccion: true };
  const d = {
    transaccion: jest.fn(async (fn) => fn(tx)),
    citasRepo: {
      bloquear: jest.fn().mockResolvedValue(cita),
      buscarPorCodigo: jest.fn().mockResolvedValue(cita),
      listarAgenda: jest.fn().mockResolvedValue(agenda),
      actualizarEstado: jest.fn(),
      cambiarTurno: jest.fn(),
    },
    cambiosEstadoRepo: { registrar: jest.fn() },
    serviciosService: {},
    turnosService: { reservar: jest.fn().mockResolvedValue(turnoNuevo) },
    pacientesService: {},
    triajeService: {},
    notificacionesService: { registrarPendiente: jest.fn().mockResolvedValue(15), enviar: jest.fn().mockResolvedValue(true) },
    reloj: () => AHORA,
  };
  return { d, tx, citas: crearCitasService(d) };
}

describe('CU-11 agenda', () => {
  test('recepción: cada cita trae sus acciones; nunca el triaje ni si existe (RN-16)', async () => {
    const { d, citas } = armar({ agenda: [citaBd(), citaBd({ codigo: 'CR-00001', estado: 'EN_ESPERA', horaInicio: '08:00' })] });
    const r = await citas.agenda('2026-11-09', 'RECEPCIONISTA');
    expect(d.citasRepo.listarAgenda).toHaveBeenCalledWith('2026-11-09');
    expect(r[0]).toEqual({
      codigo: 'CR-04821',
      estado: 'CONFIRMADA',
      fecha: '2026-11-09',
      horaInicio: '11:00',
      horaFin: '11:40',
      paciente: 'María José López',
      cedula: '001-150390-0012K',
      servicioId: 2,
      servicio: 'Control Prenatal',
      transiciones: ['EN_ESPERA', 'CANCELADA'],
      puedeReprogramar: true,
    });
    expect(r[1]).toMatchObject({ estado: 'EN_ESPERA', transiciones: [], puedeReprogramar: false });
    expect(r[0]).not.toHaveProperty('tieneTriaje');
    expect(r[0]).not.toHaveProperty('correo');
    expect(r[0]).not.toHaveProperty('id');
  });

  test('médica: informa si la cita tiene ficha y solo ofrece Atendida desde En espera', async () => {
    const { citas } = armar({ agenda: [citaBd({ estado: 'EN_ESPERA' })] });
    const [item] = await citas.agenda('2026-11-09', 'MEDICO');
    expect(item).toMatchObject({ tieneTriaje: true, transiciones: ['ATENDIDA'], puedeReprogramar: false });
  });

  test('E1: sin citas → lista vacía', async () => {
    const { citas } = armar();
    await expect(citas.agenda('2026-11-09', 'MEDICO')).resolves.toEqual([]);
  });
});

describe('CU-12 cambiarEstado', () => {
  test('A1 llegada: Confirmada → En espera y registra el cambio con el usuario (RF-17)', async () => {
    const { d, tx, citas } = armar();
    const r = await citas.cambiarEstado('CR-04821', 'EN_ESPERA', RECEPCION);
    expect(d.citasRepo.bloquear).toHaveBeenCalledWith(tx, { codigo: 'CR-04821' });
    expect(d.citasRepo.actualizarEstado).toHaveBeenCalledWith(tx, 7, 'EN_ESPERA');
    expect(d.cambiosEstadoRepo.registrar).toHaveBeenCalledWith(tx, {
      citaId: 7,
      estadoAnterior: 'CONFIRMADA',
      estadoNuevo: 'EN_ESPERA',
      origen: 'PERSONAL',
      usuarioId: 2,
      detalle: 'Llegada registrada',
    });
    expect(r.cita).toMatchObject({ codigo: 'CR-04821', estado: 'EN_ESPERA', transiciones: [] });
  });

  test('A2 atención: la médica marca Atendida desde En espera', async () => {
    const { d, citas } = armar({ cita: citaBd({ estado: 'EN_ESPERA' }) });
    const r = await citas.cambiarEstado('CR-04821', 'ATENDIDA', MEDICA);
    expect(d.cambiosEstadoRepo.registrar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ usuarioId: 1, estadoNuevo: 'ATENDIDA' }));
    expect(r.cita.estado).toBe('ATENDIDA');
  });

  test('A3 inasistencia: No asistió cuando la hora ya empezó', async () => {
    const { d, citas } = armar({ cita: citaBd({ horaInicio: '09:00' }) });
    await citas.cambiarEstado('CR-04821', 'NO_ASISTIO', RECEPCION);
    expect(d.citasRepo.actualizarEstado).toHaveBeenCalledWith(expect.anything(), 7, 'NO_ASISTIO');
  });

  test('E2 (RN-11): la recepción no puede marcar Atendida y no se guarda nada', async () => {
    const { d, citas } = armar({ cita: citaBd({ estado: 'EN_ESPERA' }) });
    await expect(citas.cambiarEstado('CR-04821', 'ATENDIDA', RECEPCION)).rejects.toMatchObject({ codigo: 'ROL_NO_AUTORIZADO', http: 403 });
    expect(d.citasRepo.actualizarEstado).not.toHaveBeenCalled();
    expect(d.cambiosEstadoRepo.registrar).not.toHaveBeenCalled();
  });

  test('E1 (RN-06): de Cancelada a En espera se rechaza', async () => {
    const { d, citas } = armar({ cita: citaBd({ estado: 'CANCELADA' }) });
    await expect(citas.cambiarEstado('CR-04821', 'EN_ESPERA', RECEPCION)).rejects.toMatchObject({ codigo: 'TRANSICION_NO_PERMITIDA', http: 403 });
    expect(d.citasRepo.actualizarEstado).not.toHaveBeenCalled();
  });

  test('cita inexistente → 404 CITA_NO_ENCONTRADA', async () => {
    const { citas } = armar({ cita: null });
    await expect(citas.cambiarEstado('CR-99999', 'EN_ESPERA', RECEPCION)).rejects.toMatchObject({ codigo: 'CITA_NO_ENCONTRADA', http: 404 });
  });
});

describe('CU-12 transiciones', () => {
  test('devuelve los estados permitidos para el rol', async () => {
    const { citas } = armar();
    await expect(citas.transiciones('CR-04821', 'RECEPCIONISTA')).resolves.toEqual(['EN_ESPERA', 'CANCELADA']);
    await expect(citas.transiciones('CR-04821', 'MEDICO')).resolves.toEqual([]);
  });

  test('cita inexistente → 404', async () => {
    const { citas } = armar({ cita: null });
    await expect(citas.transiciones('CR-99999', 'MEDICO')).rejects.toMatchObject({ codigo: 'CITA_NO_ENCONTRADA' });
  });
});

describe('CU-13 cancelarPorPersonal', () => {
  test('cancela, registra el usuario y el turno queda libre (RN-07)', async () => {
    const { d, tx, citas } = armar();
    const r = await citas.cancelarPorPersonal('CR-04821', RECEPCION);
    expect(d.citasRepo.bloquear).toHaveBeenCalledWith(tx, { codigo: 'CR-04821' });
    expect(d.citasRepo.actualizarEstado).toHaveBeenCalledWith(tx, 7, 'CANCELADA');
    expect(d.cambiosEstadoRepo.registrar).toHaveBeenCalledWith(tx, expect.objectContaining({
      estadoNuevo: 'CANCELADA',
      origen: 'PERSONAL',
      usuarioId: 2,
      detalle: 'Cancelada por recepción',
    }));
    expect(d.citasRepo.cambiarTurno).not.toHaveBeenCalled();
    expect(d.notificacionesService.enviar).not.toHaveBeenCalled();
    expect(r.cita).toMatchObject({ estado: 'CANCELADA', puedeReprogramar: false });
  });

  test.each(['EN_ESPERA', 'ATENDIDA', 'NO_ASISTIO', 'CANCELADA'])('E1: una cita %s no se cancela (409)', async (estado) => {
    const { d, citas } = armar({ cita: citaBd({ estado }) });
    await expect(citas.cancelarPorPersonal('CR-04821', RECEPCION)).rejects.toMatchObject({ codigo: 'CITA_NO_MODIFICABLE', http: 409 });
    expect(d.citasRepo.actualizarEstado).not.toHaveBeenCalled();
  });

  test('una cita cuya hora ya empezó no se cancela', async () => {
    const { citas } = armar({ cita: citaBd({ horaInicio: '09:30' }) });
    await expect(citas.cancelarPorPersonal('CR-04821', RECEPCION)).rejects.toMatchObject({ codigo: 'CITA_NO_MODIFICABLE' });
  });

  test('cita inexistente → 404 con mensaje para el personal', async () => {
    const { citas } = armar({ cita: null });
    await expect(citas.cancelarPorPersonal('CR-99999', RECEPCION)).rejects.toMatchObject({
      codigo: 'CITA_NO_ENCONTRADA',
      message: expect.stringContaining('Actualiza la agenda'),
    });
  });
});

describe('CU-13 reprogramarPorPersonal', () => {
  test('nuevo turno, mismo código, registra el usuario y envía el correo (paso 6)', async () => {
    const { d, tx, citas } = armar();
    const r = await citas.reprogramarPorPersonal('CR-04821', 41, RECEPCION);
    expect(d.turnosService.reservar).toHaveBeenCalledWith(tx, 41);
    expect(d.citasRepo.cambiarTurno).toHaveBeenCalledWith(tx, 7, 41);
    expect(d.cambiosEstadoRepo.registrar).toHaveBeenCalledWith(tx, expect.objectContaining({
      estadoAnterior: 'CONFIRMADA',
      estadoNuevo: 'CONFIRMADA',
      origen: 'PERSONAL',
      usuarioId: 2,
      detalle: 'Reprogramada por recepción: 2026-11-09 11:00 -> 2026-11-12 08:00',
    }));
    expect(d.notificacionesService.enviar).toHaveBeenCalledWith(15, 'REPROGRAMACION', 'maria@ejemplo.com', expect.objectContaining({ fecha: '2026-11-12' }));
    expect(r).toEqual({
      cita: expect.objectContaining({ codigo: 'CR-04821', estado: 'CONFIRMADA', fecha: '2026-11-12', horaInicio: '08:00', horaFin: '08:40' }),
      correoEnviado: true,
    });
  });

  test('E2 (RN-01): turno ocupado → 409 y no cambia nada', async () => {
    const { d, citas } = armar();
    d.turnosService.reservar.mockRejectedValue(new ErrorNegocio('TURNO_OCUPADO', 'El turno ya fue reservado. Elige otro.', 409));
    await expect(citas.reprogramarPorPersonal('CR-04821', 41, RECEPCION)).rejects.toMatchObject({ codigo: 'TURNO_OCUPADO' });
    expect(d.citasRepo.cambiarTurno).not.toHaveBeenCalled();
  });

  test('mismo turno → 409 MISMO_TURNO con mensaje para el personal', async () => {
    const { citas } = armar();
    await expect(citas.reprogramarPorPersonal('CR-04821', 30, RECEPCION)).rejects.toMatchObject({
      codigo: 'MISMO_TURNO',
      message: 'Ese ya es el horario de la cita. Elige otro.',
    });
  });

  test('E1: una cita En espera no se reprograma', async () => {
    const { citas } = armar({ cita: citaBd({ estado: 'EN_ESPERA' }) });
    await expect(citas.reprogramarPorPersonal('CR-04821', 41, RECEPCION)).rejects.toMatchObject({ codigo: 'CITA_NO_MODIFICABLE' });
  });
});
