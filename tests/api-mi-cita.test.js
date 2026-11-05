'use strict';

// Rutas de la Iteración 2 con servicios simulados (sin base de datos):
// POST /citas/acceso, POST /citas/:codigo/cancelacion y PATCH /citas/:codigo.
const request = require('supertest');
const { crearApp } = require('../src/app');
const { ErrorNegocio } = require('../src/common/errores');
const { crearTokenCita } = require('../src/modules/seguridad/token-cita');

const SECRETO = 'secreto-de-pruebas-de-al-menos-32-caracteres';
const tokenCita = crearTokenCita({ secreto: SECRETO });

const cita = {
  codigo: 'CR-04821',
  estado: 'CONFIRMADA',
  servicioId: 2,
  servicio: 'Control Prenatal',
  paciente: 'María José López',
  fecha: '2026-11-10',
  horaInicio: '09:30',
  horaFin: '10:00',
};

function serviciosSimulados() {
  return {
    tokenCita,
    accesoPublicoService: {
      validarAccesoCita: jest.fn().mockResolvedValue({ cita, tokenCita: 'token' }),
    },
    citasService: {
      cancelar: jest.fn().mockResolvedValue({ cita: { ...cita, estado: 'CANCELADA' } }),
      reprogramar: jest.fn().mockResolvedValue({
        codigo: 'CR-04821',
        servicio: 'Control Prenatal',
        nuevoHorario: { fecha: '2026-11-12', horaInicio: '08:00', horaFin: '08:40' },
        indicaciones: 'Traer carné.',
        correoEnviado: true,
      }),
    },
  };
}

const bearer = (citaId = 7, codigo = 'CR-04821') => `Bearer ${tokenCita.firmar({ citaId, codigo })}`;

function esErrorEstandar(body, codigo) {
  expect(Object.keys(body).sort()).toEqual(['codigo', 'detalles', 'mensaje']);
  expect(body.codigo).toBe(codigo);
}

describe('POST /api/v1/citas/acceso (CU-08)', () => {
  test('200 con la cita y el token; normaliza a mayúsculas y pasa la IP al servicio', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s }))
      .post('/api/v1/citas/acceso')
      .send({ cedula: ' 001-150390-0012k ', codigo: 'cr-04821' });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ cita, tokenCita: 'token' });
    expect(s.accesoPublicoService.validarAccesoCita).toHaveBeenCalledWith({
      cedula: '001-150390-0012K',
      codigo: 'CR-04821',
      ip: expect.any(String),
    });
  });

  test('E1: formato inválido → 400 sin llamar al servicio (no cuenta como intento)', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s })).post('/api/v1/citas/acceso').send({ cedula: '0011503900012K', codigo: 'CR-4821' });
    expect(res.status).toBe(400);
    esErrorEstandar(res.body, 'DATOS_INVALIDOS');
    expect(res.body.detalles.map((d) => d.campo).sort()).toEqual(['cedula', 'codigo']);
    expect(s.accesoPublicoService.validarAccesoCita).not.toHaveBeenCalled();
  });

  test('rechaza campos no declarados', async () => {
    const res = await request(crearApp({ servicios: serviciosSimulados() }))
      .post('/api/v1/citas/acceso')
      .send({ cedula: '001-150390-0012K', codigo: 'CR-04821', extra: 1 });
    expect(res.status).toBe(400);
    esErrorEstandar(res.body, 'DATOS_INVALIDOS');
  });

  test.each([
    ['ACCESO_DENEGADO', 401],
    ['ACCESO_BLOQUEADO', 429],
    ['CITA_NO_MODIFICABLE', 409],
  ])('%s → %i con el formato estándar', async (codigo, http) => {
    const s = serviciosSimulados();
    s.accesoPublicoService.validarAccesoCita.mockRejectedValue(new ErrorNegocio(codigo, 'mensaje', http));
    const res = await request(crearApp({ servicios: s })).post('/api/v1/citas/acceso').send({ cedula: '001-150390-0012K', codigo: 'CR-04821' });
    expect(res.status).toBe(http);
    esErrorEstandar(res.body, codigo);
  });

  test('límite de 20 peticiones por minuto por IP → 429 DEMASIADAS_PETICIONES', async () => {
    const app = crearApp({ servicios: serviciosSimulados() });
    for (let i = 0; i < 20; i += 1) {
      await request(app).post('/api/v1/citas/acceso').send({ cedula: '001-150390-0012K', codigo: 'CR-04821' });
    }
    const res = await request(app).post('/api/v1/citas/acceso').send({ cedula: '001-150390-0012K', codigo: 'CR-04821' });
    expect(res.status).toBe(429);
    esErrorEstandar(res.body, 'DEMASIADAS_PETICIONES');
  });
});

describe('POST /api/v1/citas/:codigo/cancelacion (CU-06)', () => {
  test('200 con la cita cancelada; usa el id del token', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s }))
      .post('/api/v1/citas/CR-04821/cancelacion')
      .set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(res.body.cita.estado).toBe('CANCELADA');
    expect(s.citasService.cancelar).toHaveBeenCalledWith(7);
  });

  test('sin token → 401 TOKEN_REQUERIDO', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s })).post('/api/v1/citas/CR-04821/cancelacion');
    expect(res.status).toBe(401);
    esErrorEstandar(res.body, 'TOKEN_REQUERIDO');
    expect(s.citasService.cancelar).not.toHaveBeenCalled();
  });

  test('token alterado → 401 TOKEN_INVALIDO', async () => {
    const res = await request(crearApp({ servicios: serviciosSimulados() }))
      .post('/api/v1/citas/CR-04821/cancelacion')
      .set('Authorization', `${bearer()}x`);
    expect(res.status).toBe(401);
    esErrorEstandar(res.body, 'TOKEN_INVALIDO');
  });

  test('RN-04: el token de una cita no sirve para otra → 403', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s }))
      .post('/api/v1/citas/CR-99999/cancelacion')
      .set('Authorization', bearer());
    expect(res.status).toBe(403);
    esErrorEstandar(res.body, 'TOKEN_NO_CORRESPONDE');
    expect(s.citasService.cancelar).not.toHaveBeenCalled();
  });

  test('cita no modificable → 409', async () => {
    const s = serviciosSimulados();
    s.citasService.cancelar.mockRejectedValue(new ErrorNegocio('CITA_NO_MODIFICABLE', 'Ya fue cancelada.', 409));
    const res = await request(crearApp({ servicios: s })).post('/api/v1/citas/cr-04821/cancelacion').set('Authorization', bearer());
    expect(res.status).toBe(409);
    esErrorEstandar(res.body, 'CITA_NO_MODIFICABLE');
  });
});

describe('PATCH /api/v1/citas/:codigo (CU-07)', () => {
  test('200 con el nuevo horario', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s })).patch('/api/v1/citas/CR-04821').set('Authorization', bearer()).send({ turnoId: 41 });
    expect(res.status).toBe(200);
    expect(res.body.nuevoHorario).toEqual({ fecha: '2026-11-12', horaInicio: '08:00', horaFin: '08:40' });
    expect(s.citasService.reprogramar).toHaveBeenCalledWith(7, 41);
  });

  test('turnoId inválido o campos extra → 400', async () => {
    const s = serviciosSimulados();
    const app = crearApp({ servicios: s });
    const r1 = await request(app).patch('/api/v1/citas/CR-04821').set('Authorization', bearer()).send({ turnoId: 'x' });
    const r2 = await request(app).patch('/api/v1/citas/CR-04821').set('Authorization', bearer()).send({ turnoId: 41, servicioId: 3 });
    expect(r1.status).toBe(400);
    expect(r2.status).toBe(400);
    expect(s.citasService.reprogramar).not.toHaveBeenCalled();
  });

  test('sin token → 401', async () => {
    const res = await request(crearApp({ servicios: serviciosSimulados() })).patch('/api/v1/citas/CR-04821').send({ turnoId: 41 });
    expect(res.status).toBe(401);
  });

  test('E4: turno ocupado → 409 TURNO_OCUPADO', async () => {
    const s = serviciosSimulados();
    s.citasService.reprogramar.mockRejectedValue(new ErrorNegocio('TURNO_OCUPADO', 'El turno ya fue reservado. Elige otro.', 409));
    const res = await request(crearApp({ servicios: s })).patch('/api/v1/citas/CR-04821').set('Authorization', bearer()).send({ turnoId: 41 });
    expect(res.status).toBe(409);
    esErrorEstandar(res.body, 'TURNO_OCUPADO');
  });
});
