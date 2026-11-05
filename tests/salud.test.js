'use strict';

jest.mock('../src/config/base-datos', () => ({
  obtenerPool: jest.fn(),
  transaccion: jest.fn(),
  cerrarPool: jest.fn(),
}));

const request = require('supertest');
const baseDatos = require('../src/config/base-datos');
const { crearApp } = require('../src/app');

describe('GET /api/v1/salud', () => {
  const app = crearApp();

  test('responde 200 { estado: "ok" } en JSON', async () => {
    const res = await request(app).get('/api/v1/salud');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ estado: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('no consulta la base de datos (para no despertar Azure SQL)', async () => {
    await request(app).get('/api/v1/salud');
    expect(baseDatos.obtenerPool).not.toHaveBeenCalled();
    expect(baseDatos.transaccion).not.toHaveBeenCalled();
  });

  test('incluye las cabeceras de seguridad de Helmet', async () => {
    const res = await request(app).get('/api/v1/salud');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-id-peticion']).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('upgrade-insecure-requests solo en producción (no rompe http://localhost)', async () => {
    const enPrueba = await request(app).get('/api/v1/salud');
    expect(enPrueba.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');

    const anterior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    // En modo producción el registro escribe; se silencia en esta prueba.
    const salida = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const enProduccion = await request(crearApp()).get('/api/v1/salud');
      expect(enProduccion.headers['content-security-policy']).toContain('upgrade-insecure-requests');
    } finally {
      process.env.NODE_ENV = anterior;
      salida.mockRestore();
    }
  });
});

describe('rutaSinQuery (registro de accesos)', () => {
  const { rutaSinQuery } = require('../src/common/middlewares/id-peticion');

  test('devuelve la ruta completa sin la query string', () => {
    expect(rutaSinQuery({ originalUrl: '/api/v1/turnos?servicioId=1&desde=2026-11-09' })).toBe('/api/v1/turnos');
    expect(rutaSinQuery({ originalUrl: '/api/v1/salud' })).toBe('/api/v1/salud');
  });
});
