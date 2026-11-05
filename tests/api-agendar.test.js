'use strict';

// Rutas de la Iteración 1 con servicios simulados (sin base de datos).
const request = require('supertest');
const { crearApp } = require('../src/app');
const { ErrorNegocio } = require('../src/common/errores');

const comprobante = {
  codigo: 'CR-04821',
  servicio: 'Papanicolaou',
  fecha: '2026-11-10',
  horaInicio: '08:00',
  horaFin: '08:40',
  indicaciones: 'No usar óvulos 48 h antes.',
  correoEnviado: true,
};

function serviciosSimulados() {
  return {
    serviciosService: { listar: jest.fn().mockResolvedValue([{ id: 1, nombre: 'Papanicolaou', indicaciones: 'x' }]) },
    preguntasService: { listarPorServicio: jest.fn().mockResolvedValue([{ id: 1, texto: 'FUM', tipo: 'FECHA', obligatoria: true, opciones: [] }]) },
    calculadoraService: { calcular: jest.fn().mockResolvedValue({ fpp: '2027-05-06', semanas: 14, dias: 0, trimestre: 2, estudios: [] }) },
    turnosService: { consultar: jest.fn().mockResolvedValue([{ id: 5, fecha: '2026-11-10', horaInicio: '08:00', horaFin: '08:40', disponible: true }]) },
    citasService: { agendar: jest.fn().mockResolvedValue(comprobante) },
  };
}

const cuerpoCita = () => ({
  servicioId: 1,
  turnoId: 5,
  paciente: { cedula: '001-150390-0012k', nombres: 'María López', telefono: '88123456', correo: 'maria@ejemplo.com' },
  consentimiento: true,
  respuestas: [{ preguntaId: 1, valor: '2026-10-01' }],
});

function esErrorEstandar(body, codigo) {
  expect(Object.keys(body).sort()).toEqual(['codigo', 'detalles', 'mensaje']);
  expect(body.codigo).toBe(codigo);
}

describe('GET /api/v1/servicios', () => {
  test('200 con la lista de servicios', async () => {
    const res = await request(crearApp({ servicios: serviciosSimulados() })).get('/api/v1/servicios');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1, nombre: 'Papanicolaou', indicaciones: 'x' }]);
  });
});

describe('GET /api/v1/servicios/:id/preguntas', () => {
  test('200 con las preguntas del servicio', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s })).get('/api/v1/servicios/1/preguntas');
    expect(res.status).toBe(200);
    expect(s.preguntasService.listarPorServicio).toHaveBeenCalledWith(1);
  });

  test('400 si el id no es un entero positivo', async () => {
    const res = await request(crearApp({ servicios: serviciosSimulados() })).get('/api/v1/servicios/abc/preguntas');
    expect(res.status).toBe(400);
    esErrorEstandar(res.body, 'DATOS_INVALIDOS');
    expect(res.body.detalles[0].campo).toBe('id');
  });

  test('404 SERVICIO_NO_DISPONIBLE si no existe o está inactivo', async () => {
    const s = serviciosSimulados();
    s.preguntasService.listarPorServicio.mockRejectedValue(new ErrorNegocio('SERVICIO_NO_DISPONIBLE', 'No se ofrece.', 404));
    const res = await request(crearApp({ servicios: s })).get('/api/v1/servicios/99/preguntas');
    expect(res.status).toBe(404);
    esErrorEstandar(res.body, 'SERVICIO_NO_DISPONIBLE');
  });
});

describe('GET /api/v1/turnos', () => {
  test('200 con turnos y su disponibilidad', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s })).get('/api/v1/turnos?servicioId=1&desde=2026-11-09&hasta=2026-11-15');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body[0]).toEqual({ id: 5, fecha: '2026-11-10', horaInicio: '08:00', horaFin: '08:40', disponible: true });
    expect(s.turnosService.consultar).toHaveBeenCalledWith({ servicioId: 1, desde: '2026-11-09', hasta: '2026-11-15' });
  });

  test('400 si faltan parámetros, la fecha no existe o hay parámetros no declarados', async () => {
    const app = crearApp({ servicios: serviciosSimulados() });
    const faltan = await request(app).get('/api/v1/turnos?servicioId=1');
    expect(faltan.status).toBe(400);
    expect(faltan.body.detalles.map((d) => d.campo).sort()).toEqual(['desde', 'hasta']);

    const fechaMala = await request(app).get('/api/v1/turnos?servicioId=1&desde=2026-02-30&hasta=2026-03-01');
    expect(fechaMala.status).toBe(400);

    const extra = await request(app).get('/api/v1/turnos?servicioId=1&desde=2026-11-09&hasta=2026-11-10&cedula=x');
    expect(extra.status).toBe(400);
  });
});

describe('POST /api/v1/calculadora/fpp', () => {
  test('200 con el cálculo', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s })).post('/api/v1/calculadora/fpp').send({ fum: '2026-07-30' });
    expect(res.status).toBe(200);
    expect(res.body.fpp).toBe('2027-05-06');
    expect(s.calculadoraService.calcular).toHaveBeenCalledWith('2026-07-30');
  });

  test('400 con fecha inválida o sin cuerpo', async () => {
    const app = crearApp({ servicios: serviciosSimulados() });
    expect((await request(app).post('/api/v1/calculadora/fpp').send({ fum: '30/07/2026' })).status).toBe(400);
    expect((await request(app).post('/api/v1/calculadora/fpp')).status).toBe(400);
  });
});

describe('POST /api/v1/citas', () => {
  test('201 con el comprobante; la cédula llega normalizada al servicio', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s })).post('/api/v1/citas').send(cuerpoCita());
    expect(res.status).toBe(201);
    expect(res.body).toEqual(comprobante);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(s.citasService.agendar.mock.calls[0][0].paciente.cedula).toBe('001-150390-0012K');
  });

  test('RN-05: sin consentimiento → 400 y el servicio no se llama', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s }))
      .post('/api/v1/citas')
      .send({ ...cuerpoCita(), consentimiento: false });
    expect(res.status).toBe(400);
    esErrorEstandar(res.body, 'DATOS_INVALIDOS');
    expect(res.body.detalles).toEqual([{ campo: 'consentimiento', mensaje: 'Debes aceptar el consentimiento informado para agendar.' }]);
    expect(s.citasService.agendar).not.toHaveBeenCalled();
  });

  test('E1: datos con formato inválido → 400 indicando cada campo', async () => {
    const cuerpo = cuerpoCita();
    cuerpo.paciente = { cedula: '0011503900012K', nombres: 'M4ría', telefono: '123', correo: 'maria@' };
    const res = await request(crearApp({ servicios: serviciosSimulados() })).post('/api/v1/citas').send(cuerpo);
    expect(res.status).toBe(400);
    expect(res.body.detalles.map((d) => d.campo).sort()).toEqual([
      'paciente.cedula',
      'paciente.correo',
      'paciente.nombres',
      'paciente.telefono',
    ]);
  });

  test('rechaza campos no declarados (también dentro de paciente)', async () => {
    const app = crearApp({ servicios: serviciosSimulados() });
    const arriba = await request(app).post('/api/v1/citas').send({ ...cuerpoCita(), estado: 'ATENDIDA' });
    expect(arriba.status).toBe(400);
    const cuerpo = cuerpoCita();
    cuerpo.paciente.id = 1;
    const dentro = await request(app).post('/api/v1/citas').send(cuerpo);
    expect(dentro.status).toBe(400);
  });

  test('E3: 409 TURNO_OCUPADO', async () => {
    const s = serviciosSimulados();
    s.citasService.agendar.mockRejectedValue(new ErrorNegocio('TURNO_OCUPADO', 'El turno ya fue reservado. Elige otro.', 409));
    const res = await request(crearApp({ servicios: s })).post('/api/v1/citas').send(cuerpoCita());
    expect(res.status).toBe(409);
    esErrorEstandar(res.body, 'TURNO_OCUPADO');
  });

  test('429 DEMASIADAS_PETICIONES después de 20 peticiones por minuto desde la misma IP', async () => {
    const app = crearApp({ servicios: serviciosSimulados() });
    for (let i = 0; i < 20; i += 1) {
      expect((await request(app).post('/api/v1/citas').send(cuerpoCita())).status).toBe(201);
    }
    const res = await request(app).post('/api/v1/citas').send(cuerpoCita());
    expect(res.status).toBe(429);
    esErrorEstandar(res.body, 'DEMASIADAS_PETICIONES');
  });
});

describe('crearApp sin servicios simulados', () => {
  test('crea las dependencias reales sin conectar a la base', () => {
    jest.isolateModules(() => {
      const mssql = require('mssql');
      const espia = jest.spyOn(mssql, 'ConnectionPool');
      expect(() => require('../src/app').crearApp()).not.toThrow();
      expect(espia).not.toHaveBeenCalled();
    });
  });
});
