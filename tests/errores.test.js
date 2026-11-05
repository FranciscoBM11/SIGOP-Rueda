'use strict';

const express = require('express');
const request = require('supertest');
const { z } = require('zod');
const { crearApp } = require('../src/app');
const { ErrorNegocio, manejadorErrores } = require('../src/common/errores');

function esErrorEstandar(body) {
  expect(Object.keys(body).sort()).toEqual(['codigo', 'detalles', 'mensaje']);
  expect(typeof body.codigo).toBe('string');
  expect(typeof body.mensaje).toBe('string');
  expect(Array.isArray(body.detalles)).toBe(true);
}

describe('Respuestas de error de la aplicación', () => {
  const app = crearApp();

  test('ruta inexistente de la API → 404 RUTA_NO_ENCONTRADA', async () => {
    const res = await request(app).get('/api/v1/no-existe');
    expect(res.status).toBe(404);
    esErrorEstandar(res.body);
    expect(res.body.codigo).toBe('RUTA_NO_ENCONTRADA');
  });

  test('ruta /api sin versión → 404 en JSON (no HTML)', async () => {
    const res = await request(app).get('/api/otra');
    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe('RUTA_NO_ENCONTRADA');
  });

  test('JSON mal formado → 400 JSON_INVALIDO', async () => {
    const res = await request(app)
      .post('/api/v1/salud')
      .set('Content-Type', 'application/json')
      .send('{"cedula": ');
    expect(res.status).toBe(400);
    esErrorEstandar(res.body);
    expect(res.body.codigo).toBe('JSON_INVALIDO');
  });

  test('cuerpo de más de 100 kB → 413 CUERPO_DEMASIADO_GRANDE', async () => {
    const res = await request(app)
      .post('/api/v1/salud')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ x: 'a'.repeat(110 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.codigo).toBe('CUERPO_DEMASIADO_GRANDE');
  });
});

describe('manejadorErrores', () => {
  const app = express();
  app.use(express.json());
  app.get('/negocio', () => {
    throw new ErrorNegocio('TURNO_OCUPADO', 'El turno ya fue reservado. Elige otro.', 409);
  });
  app.post('/zod', (req) => {
    z.object({ cedula: z.string().min(1, 'La cédula es obligatoria.') }).strict().parse(req.body);
  });
  app.get('/inesperado', () => {
    throw new Error('Login failed for user sigop_app; detalle interno 001-010190-0001A');
  });
  app.get('/asincrono', async () => {
    throw new ErrorNegocio('NO_ENCONTRADA', 'No existe.', 404);
  });
  app.use(manejadorErrores);

  test('ErrorNegocio → su código HTTP y mensaje', async () => {
    const res = await request(app).get('/negocio');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      codigo: 'TURNO_OCUPADO',
      mensaje: 'El turno ya fue reservado. Elige otro.',
      detalles: [],
    });
  });

  test('ZodError → 400 DATOS_INVALIDOS con detalles por campo', async () => {
    const res = await request(app).post('/zod').send({ cedula: '', extra: 1 });
    expect(res.status).toBe(400);
    esErrorEstandar(res.body);
    expect(res.body.codigo).toBe('DATOS_INVALIDOS');
    expect(res.body.detalles).toEqual(
      expect.arrayContaining([{ campo: 'cedula', mensaje: 'La cédula es obligatoria.' }]),
    );
    // Los campos no declarados se rechazan (strict).
    expect(res.body.detalles.length).toBe(2);
  });

  test('error inesperado → 500 ERROR_INTERNO sin filtrar el detalle técnico', async () => {
    const res = await request(app).get('/inesperado');
    expect(res.status).toBe(500);
    esErrorEstandar(res.body);
    expect(res.body.codigo).toBe('ERROR_INTERNO');
    expect(JSON.stringify(res.body)).not.toMatch(/Login failed|sigop_app|001-010190/);
  });

  test('errores lanzados en rutas async también se manejan (Express 5)', async () => {
    const res = await request(app).get('/asincrono');
    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe('NO_ENCONTRADA');
  });
});
