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

describe('P4 Mi cita (Iteración 2)', () => {
  const app = crearApp();

  test('/mi-cita.html se sirve con su módulo y sin scripts en línea (CSP)', async () => {
    const res = await request(app).get('/mi-cita.html');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<script type="module" src="/js/mi-cita.js"></script>');
    expect(res.text).not.toMatch(/<script>(?!<\/script>)/);
    expect(res.text).toContain('id="form-acceso"');
  });

  test('los módulos de la página existen', async () => {
    for (const ruta of ['/js/mi-cita.js', '/js/selector-turnos.js']) {
      const res = await request(app).get(ruta);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/javascript/);
    }
  });

  test('tiene pantalla de confirmación con salidas y enlaces para volver al inicio', async () => {
    const res = await request(app).get('/mi-cita.html');
    expect(res.text).toContain('id="confirmacion"');
    expect(res.text).toContain('id="conf-ver-cita"');
    expect(res.text).toMatch(/id="conf-agendar" href="\/agendar\.html"/);
    // Volver al inicio: en el acceso, en la tarjeta de la cita y en la confirmación.
    expect(res.text.match(/href="\/"[^>]*>[^<]*Volver al inicio/g)).toHaveLength(3);
  });

  test('el inicio enlaza a Mi cita', async () => {
    const res = await request(app).get('/');
    expect(res.text).toContain('href="/mi-cita.html"');
  });
});
