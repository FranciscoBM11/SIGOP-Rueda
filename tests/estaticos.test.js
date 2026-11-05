'use strict';

const request = require('supertest');
const { crearApp } = require('../src/app');

describe('Archivos estáticos desde public/', () => {
  const app = crearApp();

  test('/ sirve index.html en español y adaptable a móvil', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<html lang="es">');
    expect(res.text).toContain('name="viewport"');
  });

  test('sirve la hoja de estilos compilada', async () => {
    const res = await request(app).get('/css/app.css');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/css/);
  });

  test('archivo inexistente fuera de /api → 404', async () => {
    const res = await request(app).get('/no-existe.html');
    expect(res.status).toBe(404);
  });
});
