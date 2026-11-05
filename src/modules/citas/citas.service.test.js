'use strict';

// CitasService.agendar() (CU-03) con colaboradores simulados.
// Reglas: RN-01, RN-02, RN-05, RN-08/RN-14 (vía triaje) y flujos A2, E3, E4.
const { crearCitasService, esTurnoDuplicado } = require('./citas.service');
const { generarCodigoCita, codigoAleatorio } = require('./generar-codigo-cita');
const { crearPacientesService } = require('../pacientes/pacientes.service');
const { ErrorNegocio } = require('../../common/errores');

const servicio = { id: 2, nombre: 'Ecografía Pélvica', indicaciones: 'Vejiga llena.' };
const turno = { id: 30, fecha: '2026-11-10', horaInicio: '08:00', horaFin: '08:40' };

const entrada = () => ({
  servicioId: 2,
  turnoId: 30,
  paciente: { cedula: '001-150390-0012K', nombres: 'María López', telefono: '88123456', correo: 'maria@ejemplo.com' },
  consentimiento: true,
  respuestas: [{ preguntaId: 4, valor: '2026-10-01' }],
});

function armar(sobrescribir = {}) {
  const tx = { soyTransaccion: true };
  const d = {
    transaccion: jest.fn(async (fn) => fn(tx)),
    citasRepo: { codigoExiste: jest.fn().mockResolvedValue(false), insertar: jest.fn().mockResolvedValue(501) },
    cambiosEstadoRepo: { registrar: jest.fn() },
    serviciosService: { obtenerActivo: jest.fn().mockResolvedValue(servicio) },
    turnosService: { reservar: jest.fn().mockResolvedValue(turno) },
    pacientesService: { registrarOActualizar: jest.fn().mockResolvedValue(77) },
    triajeService: {
      validar: jest.fn().mockResolvedValue([{ preguntaId: 4, valor: '2026-10-01' }]),
      guardarFicha: jest.fn().mockResolvedValue(90),
    },
    notificacionesService: { registrarPendiente: jest.fn().mockResolvedValue(15), enviar: jest.fn().mockResolvedValue(true) },
    generarCodigoCita: jest.fn(async () => 'CR-04821'),
    ...sobrescribir,
  };
  return { d, tx, citas: crearCitasService(d) };
}

describe('CitasService.agendar', () => {
  test('flujo principal: guarda todo en una transacción y devuelve el comprobante', async () => {
    const { d, tx, citas } = armar();
    const r = await citas.agendar(entrada());

    expect(r).toEqual({
      codigo: 'CR-04821',
      servicio: 'Ecografía Pélvica',
      fecha: '2026-11-10',
      horaInicio: '08:00',
      horaFin: '08:40',
      indicaciones: 'Vejiga llena.',
      correoEnviado: true,
    });
    expect(d.transaccion).toHaveBeenCalledTimes(1);
    expect(d.turnosService.reservar).toHaveBeenCalledWith(tx, 30);
    expect(d.pacientesService.registrarOActualizar).toHaveBeenCalledWith(tx, entrada().paciente);
    expect(d.citasRepo.insertar).toHaveBeenCalledWith(tx, {
      codigo: 'CR-04821',
      pacienteId: 77,
      turnoId: 30,
      servicioId: 2,
      consentimientoVersion: 'v1.0',
    });
    expect(d.cambiosEstadoRepo.registrar).toHaveBeenCalledWith(tx, {
      citaId: 501,
      estadoAnterior: null,
      estadoNuevo: 'CONFIRMADA',
      origen: 'PACIENTE',
    });
    expect(d.triajeService.guardarFicha).toHaveBeenCalledWith(tx, 501, [{ preguntaId: 4, valor: '2026-10-01' }]);
    expect(d.notificacionesService.registrarPendiente).toHaveBeenCalledWith(tx, 501, 'CONFIRMACION');
  });

  test('el correo se envía después del commit con los datos del comprobante', async () => {
    const orden = [];
    const { d, citas } = armar({
      transaccion: jest.fn(async (fn) => {
        const r = await fn({});
        orden.push('commit');
        return r;
      }),
      notificacionesService: {
        registrarPendiente: jest.fn().mockResolvedValue(15),
        enviar: jest.fn(async () => orden.push('enviar') && true),
      },
    });
    await citas.agendar(entrada());
    expect(orden).toEqual(['commit', 'enviar']);
    expect(d.notificacionesService.enviar).toHaveBeenCalledWith(15, 'CONFIRMACION', 'maria@ejemplo.com', {
      nombres: 'María López',
      codigo: 'CR-04821',
      servicio: 'Ecografía Pélvica',
      fecha: '2026-11-10',
      horaInicio: '08:00',
      horaFin: '08:40',
      indicaciones: 'Vejiga llena.',
    });
  });

  test('RN-05: sin consentimiento no toca la base de datos', async () => {
    const { d, citas } = armar();
    await expect(citas.agendar({ ...entrada(), consentimiento: false })).rejects.toMatchObject({
      codigo: 'CONSENTIMIENTO_REQUERIDO',
      http: 400,
    });
    expect(d.serviciosService.obtenerActivo).not.toHaveBeenCalled();
    expect(d.transaccion).not.toHaveBeenCalled();
  });

  test('triaje inválido (CU-04, E1): no abre la transacción', async () => {
    const { d, citas } = armar({
      triajeService: {
        validar: jest.fn().mockRejectedValue(new ErrorNegocio('TRIAJE_INVALIDO', 'x', 400)),
        guardarFicha: jest.fn(),
      },
    });
    await expect(citas.agendar(entrada())).rejects.toMatchObject({ codigo: 'TRIAJE_INVALIDO' });
    expect(d.transaccion).not.toHaveBeenCalled();
  });

  test('E3 / RN-01: turno ocupado → error y no se envía correo', async () => {
    const { d, citas } = armar({
      turnosService: { reservar: jest.fn().mockRejectedValue(new ErrorNegocio('TURNO_OCUPADO', 'El turno ya fue reservado. Elige otro.', 409)) },
    });
    await expect(citas.agendar(entrada())).rejects.toMatchObject({ codigo: 'TURNO_OCUPADO', http: 409 });
    expect(d.citasRepo.insertar).not.toHaveBeenCalled();
    expect(d.notificacionesService.enviar).not.toHaveBeenCalled();
  });

  test('RN-01: si el índice único uq_cita_turno_activa rechaza la cita → 409 TURNO_OCUPADO', async () => {
    const errSql = Object.assign(
      new Error("Cannot insert duplicate key row in object 'dbo.citas' with unique index 'uq_cita_turno_activa'."),
      { name: 'RequestError', number: 2601 },
    );
    const { d, citas } = armar({ citasRepo: { codigoExiste: jest.fn().mockResolvedValue(false), insertar: jest.fn().mockRejectedValue(errSql) } });
    await expect(citas.agendar(entrada())).rejects.toMatchObject({ codigo: 'TURNO_OCUPADO', http: 409 });
    expect(d.notificacionesService.enviar).not.toHaveBeenCalled();
  });

  test('un error en medio de la transacción se propaga (la transacción hace rollback) y no envía correo', async () => {
    const { d, citas } = armar({
      triajeService: { validar: jest.fn().mockResolvedValue([]), guardarFicha: jest.fn().mockRejectedValue(new Error('fallo')) },
    });
    await expect(citas.agendar(entrada())).rejects.toThrow('fallo');
    expect(d.notificacionesService.enviar).not.toHaveBeenCalled();
  });

  test('E4: si el correo falla la cita se mantiene y correoEnviado = false', async () => {
    const { citas } = armar({
      notificacionesService: { registrarPendiente: jest.fn().mockResolvedValue(15), enviar: jest.fn().mockResolvedValue(false) },
    });
    const r = await citas.agendar(entrada());
    expect(r.codigo).toBe('CR-04821');
    expect(r.correoEnviado).toBe(false);
  });

  test('servicio inactivo → SERVICIO_NO_DISPONIBLE sin transacción', async () => {
    const { d, citas } = armar({
      serviciosService: { obtenerActivo: jest.fn().mockRejectedValue(new ErrorNegocio('SERVICIO_NO_DISPONIBLE', 'x', 404)) },
    });
    await expect(citas.agendar(entrada())).rejects.toMatchObject({ codigo: 'SERVICIO_NO_DISPONIBLE' });
    expect(d.transaccion).not.toHaveBeenCalled();
  });

  test('RN-02: el código se comprueba contra la base dentro de la transacción', async () => {
    const { d, tx, citas } = armar({ generarCodigoCita });
    d.citasRepo.codigoExiste.mockResolvedValueOnce(true).mockResolvedValue(false);
    const r = await citas.agendar(entrada());
    expect(r.codigo).toMatch(/^CR-\d{5}$/);
    expect(d.citasRepo.codigoExiste).toHaveBeenCalledTimes(2);
    expect(d.citasRepo.codigoExiste).toHaveBeenCalledWith(tx, expect.stringMatching(/^CR-\d{5}$/));
  });
});

describe('RN-02 – generarCodigoCita', () => {
  test('formato CR-##### con ceros a la izquierda', () => {
    expect(codigoAleatorio(() => 7)).toBe('CR-00007');
    expect(codigoAleatorio(() => 99999)).toBe('CR-99999');
  });

  test('reintenta si el código ya existe (no se reutiliza)', async () => {
    const valores = [4821, 4821, 1234];
    const existentes = new Set(['CR-04821']);
    const codigo = await generarCodigoCita(async (c) => existentes.has(c), () => valores.shift());
    expect(codigo).toBe('CR-01234');
  });

  test('tras 10 colisiones seguidas lanza CODIGO_NO_GENERADO', async () => {
    await expect(generarCodigoCita(async () => true)).rejects.toMatchObject({ codigo: 'CODIGO_NO_GENERADO', http: 503 });
  });
});

describe('esTurnoDuplicado', () => {
  test('solo reconoce la violación del índice del turno', () => {
    expect(esTurnoDuplicado({ number: 2601, message: "unique index 'uq_cita_turno_activa'" })).toBe(true);
    expect(esTurnoDuplicado({ number: 2627, message: "UNIQUE KEY constraint 'uq_citas_codigo'" })).toBe(false);
    expect(esTurnoDuplicado(new Error('otro'))).toBe(false);
  });
});

describe('PacientesService (CU-03, A2)', () => {
  const datos = entrada().paciente;

  test('paciente nueva → se inserta', async () => {
    const repo = { buscarPorCedulaParaActualizar: jest.fn().mockResolvedValue(null), insertar: jest.fn().mockResolvedValue(9), actualizarContacto: jest.fn() };
    expect(await crearPacientesService({ pacientesRepo: repo }).registrarOActualizar({}, datos)).toBe(9);
    expect(repo.actualizarContacto).not.toHaveBeenCalled();
  });

  test('misma cédula → reutiliza y actualiza teléfono y correo', async () => {
    const repo = { buscarPorCedulaParaActualizar: jest.fn().mockResolvedValue({ id: 3 }), insertar: jest.fn(), actualizarContacto: jest.fn() };
    const tx = {};
    expect(await crearPacientesService({ pacientesRepo: repo }).registrarOActualizar(tx, datos)).toBe(3);
    expect(repo.actualizarContacto).toHaveBeenCalledWith(tx, 3, datos);
    expect(repo.insertar).not.toHaveBeenCalled();
  });
});
