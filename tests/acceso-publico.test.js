'use strict';

// CU-08 con repositorios simulados: RN-04 (cédula y código de la misma cita),
// RN-15 (bloqueo tras 5 fallidos consecutivos en 15 minutos) y E2/E3.
const { crearAccesoPublicoService } = require('../src/modules/seguridad/acceso-publico.service');
const { crearTokenCita } = require('../src/modules/seguridad/token-cita');
const { crearHashIp } = require('../src/modules/seguridad/hash-ip');

const SECRETO = 'secreto-de-pruebas-de-al-menos-32-caracteres';
const CEDULA = '001-150390-0012K';
const CODIGO = 'CR-04821';

const citaBd = (extra = {}) => ({
  id: 7,
  codigo: CODIGO,
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

/** n fallidos recientes; el más reciente primero, cada uno con sus segundos para salir de la ventana. */
const fallidos = (...segundos) => segundos.map((s) => ({ segundosRestantes: s }));

function armar({ recientes = [], cita = citaBd() } = {}) {
  const intentosRepo = {
    fallidosRecientes: jest.fn().mockResolvedValue(recientes),
    registrar: jest.fn().mockResolvedValue(undefined),
  };
  const citasRepo = { buscarPorCedulaYCodigo: jest.fn().mockResolvedValue(cita) };
  const tokenCita = crearTokenCita({ secreto: SECRETO });
  const servicio = crearAccesoPublicoService({
    intentosRepo,
    citasRepo,
    tokenCita,
    hashIp: crearHashIp(SECRETO),
    reloj: () => ({ fecha: '2026-11-09', hora: '10:00' }),
  });
  return { servicio, intentosRepo, citasRepo, tokenCita };
}

const entrada = { cedula: CEDULA, codigo: CODIGO, ip: '190.1.2.3' };

describe('CU-08 validar acceso por cédula y código', () => {
  test('flujo principal: devuelve la cita sin datos sensibles y un token de esa cita', async () => {
    const { servicio, intentosRepo, citasRepo, tokenCita } = armar();
    const r = await servicio.validarAccesoCita(entrada);

    expect(citasRepo.buscarPorCedulaYCodigo).toHaveBeenCalledWith(CEDULA, CODIGO);
    expect(r.cita).toEqual({
      codigo: CODIGO,
      estado: 'CONFIRMADA',
      servicioId: 2,
      servicio: 'Control Prenatal',
      paciente: 'María José López',
      fecha: '2026-11-10',
      horaInicio: '09:30',
      horaFin: '10:00',
    });
    expect(JSON.stringify(r.cita)).not.toMatch(/maria@|0012K|"id"/);
    expect(tokenCita.verificar(r.tokenCita)).toEqual({ citaId: 7, codigo: CODIGO });
    // Paso 5: registra el intento exitoso con la IP como hash, nunca en claro.
    expect(intentosRepo.registrar).toHaveBeenCalledWith({ cedula: CEDULA, exitoso: true, ipHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(JSON.stringify(intentosRepo.registrar.mock.calls)).not.toContain('190.1.2.3');
  });

  test('RN-04 / E2: sin coincidencia → 401 genérico y registra el fallido', async () => {
    const { servicio, intentosRepo } = armar({ cita: null });
    await expect(servicio.validarAccesoCita(entrada)).rejects.toMatchObject({ codigo: 'ACCESO_DENEGADO', http: 401 });
    expect(intentosRepo.registrar).toHaveBeenCalledWith(expect.objectContaining({ cedula: CEDULA, exitoso: false }));
  });

  test('E2: el mensaje no indica cuál dato falló', async () => {
    const { servicio } = armar({ cita: null });
    const err = await servicio.validarAccesoCita(entrada).catch((e) => e);
    expect(err.message).toMatch(/cédula y el código/);
    expect(err.detalles).toEqual([]);
  });

  test('RN-15: con 4 fallidos previos, el 5.º bloquea y avisa el tiempo de espera', async () => {
    const { servicio, intentosRepo } = armar({ cita: null, recientes: fallidos(890, 800, 700, 600) });
    await expect(servicio.validarAccesoCita(entrada)).rejects.toMatchObject({
      codigo: 'ACCESO_BLOQUEADO',
      http: 429,
      message: expect.stringMatching(/10 minutos/), // se libera cuando sale el 4.º previo (600 s)
    });
    expect(intentosRepo.registrar).toHaveBeenCalledTimes(1);
  });

  test('RN-15 / E3: con 5 fallidos recientes ni siquiera busca la cita (aunque los datos sean correctos)', async () => {
    const { servicio, intentosRepo, citasRepo } = armar({ recientes: fallidos(895, 850, 300, 200, 59) });
    await expect(servicio.validarAccesoCita(entrada)).rejects.toMatchObject({
      codigo: 'ACCESO_BLOQUEADO',
      http: 429,
      message: expect.stringMatching(/1 minuto\./),
    });
    expect(citasRepo.buscarPorCedulaYCodigo).not.toHaveBeenCalled();
    expect(intentosRepo.registrar).not.toHaveBeenCalled();
  });

  test('RN-15: pide como máximo 5 fallidos en una ventana de 15 minutos', async () => {
    const { servicio, intentosRepo } = armar();
    await servicio.validarAccesoCita(entrada);
    expect(intentosRepo.fallidosRecientes).toHaveBeenCalledWith(CEDULA, { ventanaMinutos: 15, limite: 5 });
  });

  test('con 3 fallidos previos un nuevo fallo todavía no bloquea', async () => {
    const { servicio } = armar({ cita: null, recientes: fallidos(800, 700, 600) });
    await expect(servicio.validarAccesoCita(entrada)).rejects.toMatchObject({ codigo: 'ACCESO_DENEGADO' });
  });

  test('cita no Confirmada → 409 CITA_NO_MODIFICABLE, sin token, pero el intento cuenta como exitoso', async () => {
    const { servicio, intentosRepo } = armar({ cita: citaBd({ estado: 'CANCELADA' }) });
    const err = await servicio.validarAccesoCita(entrada).catch((e) => e);
    expect(err).toMatchObject({ codigo: 'CITA_NO_MODIFICABLE', http: 409 });
    expect(err.message).toMatch(/cancelada/);
    expect(intentosRepo.registrar).toHaveBeenCalledWith(expect.objectContaining({ exitoso: true }));
  });

  test('cita Confirmada cuya hora ya pasó → 409', async () => {
    const { servicio } = armar({ cita: citaBd({ fecha: '2026-11-08' }) });
    await expect(servicio.validarAccesoCita(entrada)).rejects.toMatchObject({ codigo: 'CITA_NO_MODIFICABLE' });
  });
});

describe('hash de IP', () => {
  test('HMAC estable de 64 hex; distinto con otro secreto; null sin IP', () => {
    const h = crearHashIp(SECRETO);
    expect(h('10.0.0.1')).toMatch(/^[0-9a-f]{64}$/);
    expect(h('10.0.0.1')).toBe(h('10.0.0.1'));
    expect(crearHashIp('y'.repeat(40))('10.0.0.1')).not.toBe(h('10.0.0.1'));
    expect(h(undefined)).toBeNull();
  });
});
